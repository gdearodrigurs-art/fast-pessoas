import { ErroHttp } from "../../lib/sessao";
import { NOTA_MAXIMA, Recomendacao } from "./esquemas";

/**
 * MOTOR DE CÁLCULO — única fonte do resultado da avaliação (corrige o erro
 * central do mockup btime: média aritmética que ignorava pesos e tratava
 * item não respondido como nota zero).
 *
 * Regras (todas gravadas na memória de cálculo):
 * - nota do pilar = Σ (peso_norm_indicador × nota/5) sobre os indicadores
 *   RESPONDIDOS; "não observado" sai do denominador — os pesos dos
 *   respondidos são renormalizados dentro do pilar. NUNCA nota 0 implícita.
 * - pilar 100% não observado é EXCLUÍDO; os pesos dos pilares restantes são
 *   renormalizados entre si.
 * - percentual final = Σ (peso_norm_pilar × nota_pilar) × 100.
 * - arredondamento: cálculo em precisão total; só o percentual final é
 *   arredondado (2 casas); a faixa é aplicada sobre o valor arredondado.
 * - faixa: [minimo, maximo) — limite inferior inclusivo, superior exclusivo;
 *   a última faixa fecha em 100 INCLUSIVE (regra única, daqui).
 */

export interface IndicadorEstrutura {
  id: number;
  nome: string;
  descricao: string;
  peso: number;
  ordem: number;
}

export interface PilarEstrutura {
  id: number;
  nome: string;
  peso: number;
  ordem: number;
  indicadores: IndicadorEstrutura[];
}

export interface FaixaEstrutura {
  id: number;
  minimo: number;
  maximo: number;
  rotulo: string;
  recomendacao: Recomendacao;
}

export interface EstruturaCongelada {
  modelo_versao_id: number;
  versao: number;
  nome: string;
  pilares: PilarEstrutura[];
  faixas: FaixaEstrutura[];
}

export interface RespostaParaCalculo {
  indicador_id: number;
  nota: number | null;
  nao_observado: boolean;
}

export interface MemoriaIndicador {
  indicador_id: number;
  nome: string;
  peso: number;
  /** Peso após renormalização dentro do pilar; null quando não observado. */
  peso_normalizado: number | null;
  nota: number | null;
  nao_observado: boolean;
}

export interface MemoriaPilar {
  pilar_id: number;
  nome: string;
  peso: number;
  /** Peso após renormalização entre pilares; null quando pilar excluído. */
  peso_normalizado: number | null;
  excluido: boolean;
  respondidos: number;
  nao_observados: number;
  /** Nota do pilar em % (0–100, 2 casas); null quando pilar excluído. */
  nota_pilar: number | null;
  indicadores: MemoriaIndicador[];
}

export interface MemoriaCalculo extends Record<string, unknown> {
  versao_memoria: 1;
  modelo: { id: number; versao: number; nome: string };
  escala: { minima: number; maxima: number; normalizacao: string };
  regras: {
    nao_observado: string;
    arredondamento: string;
    faixa: string;
  };
  pilares: MemoriaPilar[];
  percentual: number;
  faixa: {
    id: number;
    minimo: number;
    maximo: number;
    rotulo: string;
    recomendacao: Recomendacao;
  };
  calculado_em: string;
}

export interface ResultadoCalculado {
  percentual: number;
  faixa: FaixaEstrutura;
  memoria: MemoriaCalculo;
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/** Faixa aplicável: [minimo, maximo); a última fecha em 100 inclusive. */
export function encontrarFaixa(
  faixas: FaixaEstrutura[],
  percentual: number
): FaixaEstrutura | null {
  const ordenadas = [...faixas].sort((a, b) => a.minimo - b.minimo);
  for (const faixa of ordenadas) {
    if (percentual >= faixa.minimo && percentual < faixa.maximo) {
      return faixa;
    }
  }
  const ultima = ordenadas[ordenadas.length - 1];
  if (ultima && percentual === ultima.maximo) {
    return ultima;
  }
  return null;
}

/**
 * Calcula o resultado consolidado. Exige exatamente UMA resposta por
 * indicador do modelo congelado (nota 1–5 XOR não observado) — item sem
 * resposta é erro, jamais zero. Lança 409 quando a avaliação inteira foi
 * marcada como não observada (não há o que consolidar).
 */
export function calcularResultado(
  estrutura: EstruturaCongelada,
  respostas: RespostaParaCalculo[]
): ResultadoCalculado {
  const porIndicador = new Map<number, RespostaParaCalculo>();
  for (const resposta of respostas) {
    porIndicador.set(resposta.indicador_id, resposta);
  }

  const idsDoModelo = new Set<number>();
  for (const pilar of estrutura.pilares) {
    for (const indicador of pilar.indicadores) {
      idsDoModelo.add(indicador.id);
      if (!porIndicador.has(indicador.id)) {
        throw new ErroHttp(
          409,
          `Indicador "${indicador.nome}" sem resposta: consolidação bloqueada — item sem resposta jamais vira zero.`
        );
      }
    }
  }
  for (const resposta of respostas) {
    if (!idsDoModelo.has(resposta.indicador_id)) {
      throw new ErroHttp(
        409,
        `Resposta para indicador ${resposta.indicador_id} fora do modelo congelado do ciclo.`
      );
    }
  }

  const memoriaPilares: MemoriaPilar[] = [];
  // Fração 0–1 por pilar (precisão total; arredonda só na exibição/memória).
  const notaFracaoPorPilar = new Map<number, number>();

  for (const pilar of estrutura.pilares) {
    const indicadoresMemoria: MemoriaIndicador[] = [];
    const respondidos = pilar.indicadores.filter(
      (indicador) => porIndicador.get(indicador.id)!.nota !== null
    );
    const somaPesosRespondidos = respondidos.reduce((s, i) => s + i.peso, 0);

    let notaFracao: number | null = null;
    if (respondidos.length > 0) {
      notaFracao = 0;
      for (const indicador of respondidos) {
        const resposta = porIndicador.get(indicador.id)!;
        notaFracao +=
          (indicador.peso / somaPesosRespondidos) *
          (resposta.nota! / NOTA_MAXIMA);
      }
    }

    for (const indicador of pilar.indicadores) {
      const resposta = porIndicador.get(indicador.id)!;
      indicadoresMemoria.push({
        indicador_id: indicador.id,
        nome: indicador.nome,
        peso: indicador.peso,
        peso_normalizado:
          resposta.nota !== null && somaPesosRespondidos > 0
            ? arredondar((indicador.peso / somaPesosRespondidos) * 100, 4)
            : null,
        nota: resposta.nota,
        nao_observado: resposta.nao_observado,
      });
    }

    if (notaFracao !== null) {
      notaFracaoPorPilar.set(pilar.id, notaFracao);
    }
    memoriaPilares.push({
      pilar_id: pilar.id,
      nome: pilar.nome,
      peso: pilar.peso,
      peso_normalizado: null, // preenchido abaixo, após saber os excluídos
      excluido: notaFracao === null,
      respondidos: respondidos.length,
      nao_observados: pilar.indicadores.length - respondidos.length,
      nota_pilar: notaFracao === null ? null : arredondar(notaFracao * 100, 2),
      indicadores: indicadoresMemoria,
    });
  }

  const pilaresComNota = estrutura.pilares.filter((pilar) =>
    notaFracaoPorPilar.has(pilar.id)
  );
  if (pilaresComNota.length === 0) {
    throw new ErroHttp(
      409,
      "Todos os indicadores foram marcados como não observados: não há o que consolidar. Reveja a avaliação com o avaliador."
    );
  }

  const somaPesosPilares = pilaresComNota.reduce((s, p) => s + p.peso, 0);
  let finalFracao = 0;
  for (const pilar of pilaresComNota) {
    const pesoNormalizado = pilar.peso / somaPesosPilares;
    finalFracao += pesoNormalizado * notaFracaoPorPilar.get(pilar.id)!;
    const memoria = memoriaPilares.find((m) => m.pilar_id === pilar.id)!;
    memoria.peso_normalizado = arredondar(pesoNormalizado * 100, 4);
  }

  const percentual = arredondar(finalFracao * 100, 2);
  const faixa = encontrarFaixa(estrutura.faixas, percentual);
  if (!faixa) {
    throw new ErroHttp(
      500,
      `Nenhuma faixa do modelo v${estrutura.versao} cobre o percentual ${percentual} — modelo ativado com faixas inválidas.`
    );
  }

  const memoria: MemoriaCalculo = {
    versao_memoria: 1,
    modelo: {
      id: estrutura.modelo_versao_id,
      versao: estrutura.versao,
      nome: estrutura.nome,
    },
    escala: {
      minima: 1,
      maxima: NOTA_MAXIMA,
      normalizacao: `nota/${NOTA_MAXIMA}`,
    },
    regras: {
      nao_observado:
        "Indicador não observado sai do denominador (pesos renormalizados entre os respondidos do pilar); pilar 100% não observado é excluído e os pesos dos pilares restantes são renormalizados. Item sem resposta bloqueia o envio — jamais vira zero.",
      arredondamento:
        "Cálculo em precisão total; apenas o percentual final é arredondado a 2 casas decimais; a faixa é aplicada sobre o valor arredondado.",
      faixa:
        "Faixa aplica-se a percentual em [minimo, maximo) — inferior inclusivo, superior exclusivo; a última faixa inclui 100.",
    },
    pilares: memoriaPilares,
    percentual,
    faixa: {
      id: faixa.id,
      minimo: faixa.minimo,
      maximo: faixa.maximo,
      rotulo: faixa.rotulo,
      recomendacao: faixa.recomendacao,
    },
    calculado_em: new Date().toISOString(),
  };

  return { percentual, faixa, memoria };
}
