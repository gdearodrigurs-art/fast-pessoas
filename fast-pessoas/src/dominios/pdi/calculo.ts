import type { MemoriaCalculo } from "../avaliacao/calculo";
import type { Recomendacao } from "../avaliacao/esquemas";

/**
 * MOTOR GENÉRICO DO PDI (nível 2) — não sabe nada sobre indicador específico.
 * Lê o `memoria_calculo` do resultado (que já traz nota por indicador 1–5, nota
 * por pilar 0–100, nomes e a faixa/recomendação) e faz duas coisas:
 *
 *   1. selecionarCandidatos — ordena as competências da MAIS fraca para a mais
 *      forte, para dar à IA os dados rankeados. Sem limiar chumbado: é ranking
 *      relativo, então adapta-se a qualquer modelo de avaliação (eixo 9).
 *   2. validarFocos — depois que a IA propõe os focos, confere a sanidade contra
 *      os dados: competência inventada, foco numa área forte, ou área mais fraca
 *      ignorada. Os avisos ficam à vista do gestor e do RH; nada é bloqueado —
 *      o humano decide.
 *
 * Tudo relativo à própria distribuição da pessoa (mediana/mínimo) — nada de
 * "nota < 3 é ruim" cravado no código. Puro, sem I/O.
 */

export interface CandidatoIndicador {
  nome: string;
  pilar_nome: string;
  /** Nota 1–5. */
  nota: number;
}

export interface CandidatoPilar {
  nome: string;
  /** Nota do pilar 0–100. */
  nota: number;
}

export interface Candidatos {
  /** Indicadores respondidos, da menor nota para a maior. */
  indicadores: CandidatoIndicador[];
  /** Pilares (não excluídos), do mais fraco para o mais forte. */
  pilares: CandidatoPilar[];
  recomendacao: Recomendacao;
  /** A competência mais fraca — o gap que não deveria ser ignorado. */
  mais_fraco: CandidatoIndicador | null;
}

export type TipoAviso =
  | "competencia_desconhecida"
  | "foco_em_forte"
  | "area_fraca_ignorada"
  | "desidentificacao";

export interface AvisoPdi {
  tipo: TipoAviso;
  mensagem: string;
}

/** Minúsculas, sem acento, sem espaços nas pontas — para casar nomes com folga. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Um nome A "casa" com B se um contém o outro (após normalizar). */
function casa(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  return na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na));
}

interface IndicadorRespondido {
  nome: string;
  nota: number;
  pilar_nome: string;
}

/** Indicadores efetivamente respondidos (nota 1–5; ignora "não observado"). */
function indicadoresRespondidos(memoria: MemoriaCalculo): IndicadorRespondido[] {
  const lista: IndicadorRespondido[] = [];
  for (const pilar of memoria.pilares) {
    for (const indicador of pilar.indicadores) {
      if (indicador.nota !== null && !indicador.nao_observado) {
        lista.push({
          nome: indicador.nome,
          nota: indicador.nota,
          pilar_nome: pilar.nome,
        });
      }
    }
  }
  return lista;
}

/** Ordena as competências da mais fraca para a mais forte, sem limiar fixo. */
export function selecionarCandidatos(memoria: MemoriaCalculo): Candidatos {
  const respondidos = indicadoresRespondidos(memoria);

  const indicadores: CandidatoIndicador[] = respondidos
    .map((i) => ({ nome: i.nome, pilar_nome: i.pilar_nome, nota: i.nota }))
    .sort((a, b) => a.nota - b.nota);

  const pilares: CandidatoPilar[] = memoria.pilares
    .filter((p) => !p.excluido && p.nota_pilar !== null)
    .map((p) => ({ nome: p.nome, nota: p.nota_pilar as number }))
    .sort((a, b) => a.nota - b.nota);

  return {
    indicadores,
    pilares,
    recomendacao: memoria.faixa.recomendacao,
    mais_fraco: indicadores.length > 0 ? indicadores[0] : null,
  };
}

/** Mediana simples (usa o elemento superior do meio em contagem par). */
function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
}

/**
 * Confere os focos que a IA propôs contra os dados da avaliação. Devolve avisos
 * (nunca bloqueia): competência que não existe no modelo, foco sobre uma área
 * já forte (acima da mediana), e a competência mais fraca deixada de fora.
 */
export function validarFocos(
  memoria: MemoriaCalculo,
  focos: { competencia: string }[]
): AvisoPdi[] {
  const avisos: AvisoPdi[] = [];
  const respondidos = indicadoresRespondidos(memoria);
  if (respondidos.length === 0) {
    return avisos;
  }

  const nomesDoModelo = [
    ...respondidos.map((i) => i.nome),
    ...memoria.pilares.map((p) => p.nome),
  ];
  const medianaNota = mediana(respondidos.map((i) => i.nota));

  // (a) competência inventada — não casa com nenhum indicador nem pilar.
  for (const foco of focos) {
    const conhecida = nomesDoModelo.some((nome) => casa(foco.competencia, nome));
    if (!conhecida) {
      avisos.push({
        tipo: "competencia_desconhecida",
        mensagem: `O foco "${foco.competencia}" não corresponde a nenhuma competência do modelo desta avaliação — confira.`,
      });
    }
  }

  // (b) foco numa competência já forte (nota acima da mediana da pessoa).
  for (const foco of focos) {
    const indicador = respondidos.find((i) => casa(foco.competencia, i.nome));
    if (indicador && indicador.nota > medianaNota) {
      avisos.push({
        tipo: "foco_em_forte",
        mensagem: `O foco "${foco.competencia}" recai sobre uma competência de nota ${indicador.nota} (acima da mediana ${medianaNota}) — confirme se é intencional.`,
      });
    }
  }

  // (c) a competência mais fraca virou foco de alguém?
  const maisFraco = [...respondidos].sort((a, b) => a.nota - b.nota)[0];
  const enderecada = focos.some((foco) => casa(foco.competencia, maisFraco.nome));
  if (!enderecada) {
    avisos.push({
      tipo: "area_fraca_ignorada",
      mensagem: `A competência mais fraca ("${maisFraco.nome}", nota ${maisFraco.nota}) não virou foco — verifique se foi proposital.`,
    });
  }

  return avisos;
}
