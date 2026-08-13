import type { MemoriaCalculo } from "../avaliacao/calculo";
import type { Recomendacao } from "../avaliacao/esquemas";
import type { FocoPdi } from "./esquemas";

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
  | "area_fraca_ignorada"
  | "sem_foco_de_forca"
  | "foco_so_curso"
  | "acao_sem_indicador"
  | "ponto_cego_ignorado"
  | "ponto_cego_como_traco"
  | "pares_abaixo_do_piso"
  | "desidentificacao";

/**
 * Adjetivos de CARÁTER que não deveriam descrever um ponto cego — ponto cego é
 * comportamento observável, não rótulo de personalidade (Kluger & DeNisi; SBI).
 * Sem acento: `normalizar()` já tira os diacríticos antes de comparar.
 */
const ADJETIVOS_DE_CARATER = [
  "arrogante",
  "autoritario",
  "preguicoso",
  "desorganizado",
  "inseguro",
  "incompetente",
  "teimoso",
  "egoista",
  "imaturo",
  "grosseiro",
  "prepotente",
  "relaxado",
  "irresponsavel",
];

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

/**
 * Confere os focos que a IA/gestor propôs. Devolve avisos, NUNCA bloqueia. A
 * pesquisa (docs/19) inverteu a régua antiga: focar numa força é DESEJÁVEL, não
 * suspeito. Hoje os avisos são: competência inventada, a mais fraca ignorada por
 * completo, plano sem nenhuma ação de força, foco só de formação e ação sem
 * indicador. As checagens de forma pulam quando o campo está em branco — o
 * humano (RH/DP) pode ter limpado de propósito.
 */
export function validarFocos(
  memoria: MemoriaCalculo,
  focos: FocoPdi[]
): AvisoPdi[] {
  const avisos: AvisoPdi[] = [];
  const respondidos = indicadoresRespondidos(memoria);

  if (respondidos.length > 0) {
    const nomesDoModelo = [
      ...respondidos.map((i) => i.nome),
      ...memoria.pilares.map((p) => p.nome),
    ];

    // (a) competência inventada — não casa com nenhum indicador nem pilar.
    for (const foco of focos) {
      const conhecida = nomesDoModelo.some((nome) =>
        casa(foco.competencia, nome)
      );
      if (!conhecida) {
        avisos.push({
          tipo: "competencia_desconhecida",
          mensagem: `O foco "${foco.competencia}" não corresponde a nenhuma competência do modelo desta avaliação — confira.`,
        });
      }
    }

    // (b) a competência mais fraca foi ignorada por completo? Começar pelas
    // forças é ok; não tocar na mais fraca merece um aviso.
    const maisFraco = [...respondidos].sort((a, b) => a.nota - b.nota)[0];
    const enderecada = focos.some((foco) =>
      casa(foco.competencia, maisFraco.nome)
    );
    if (!enderecada) {
      avisos.push({
        tipo: "area_fraca_ignorada",
        mensagem: `A competência mais fraca ("${maisFraco.nome}", nota ${maisFraco.nota}) não virou foco — verifique se foi proposital.`,
      });
    }
  }

  const todasAcoes = focos.flatMap((f) => f.acoes);

  // (c) começar pelas forças: nenhuma ação amplia força (todas endereçam lacuna).
  const comTipo = todasAcoes.filter((a) => a.tipo);
  if (comTipo.length > 0 && comTipo.every((a) => a.tipo === "enderecar_lacuna")) {
    avisos.push({
      tipo: "sem_foco_de_forca",
      mensagem:
        "Nenhuma ação amplia uma força — o plano ficou só de lacunas. Começar pelas forças costuma engajar mais; confirme se é proposital.",
    });
  }

  // (d) foco só de formação (100% no "10" do 70-20-10).
  for (const foco of focos) {
    const modalidades = foco.acoes
      .map((a) => a.modalidade)
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    if (modalidades.length > 0 && modalidades.every((m) => m === "formacao")) {
      avisos.push({
        tipo: "foco_so_curso",
        mensagem: `O foco "${foco.competencia}" tem só ações de formação (curso). A maior parte do desenvolvimento vem de desafio real e feedback — considere uma ação de experiência.`,
      });
    }
  }

  // (e) ação sem indicador de sucesso observável.
  const semIndicador = todasAcoes.filter(
    (a) => !a.indicador || a.indicador.trim() === ""
  ).length;
  if (semIndicador > 0) {
    avisos.push({
      tipo: "acao_sem_indicador",
      mensagem: `${semIndicador} ação(ões) sem indicador de sucesso observável — sem ele fica difícil saber se a ação foi cumprida.`,
    });
  }

  return avisos;
}

// ------------------------------------------------------------------ pontos cegos (auto × líder)

/** Uma resposta da autoavaliação, nomeada (o repositório entrega assim). */
export interface RespostaAuto {
  indicador_nome: string;
  pilar_nome: string;
  nota: number | null;
  nao_observado: boolean;
}

export interface Divergencia {
  competencia: string;
  pilar: string;
  /** Nota que o próprio colaborador se deu (1–5). */
  nota_colaborador: number;
  /** Nota que o líder deu (1–5). */
  nota_lider: number;
  /** nota_colaborador − nota_lider. >0: o colaborador se vê MELHOR; <0: PIOR. */
  gap: number;
}

/**
 * As divergências auto × líder por competência — só onde os DOIS lados
 * responderam com nota (ignora "não observado"). Ordenadas da maior para a
 * menor magnitude. Sem limiar chumbado: é ranking relativo (eixo 9), então se
 * adapta a qualquer modelo. É o insumo cru dos "pontos cegos" que a IA redige.
 */
export function divergenciasAutoLider(
  memoriaLider: MemoriaCalculo,
  respostasAuto: RespostaAuto[]
): Divergencia[] {
  const auto = respostasAuto.filter(
    (r) => r.nota !== null && !r.nao_observado
  );
  const divs: Divergencia[] = [];
  for (const pilar of memoriaLider.pilares) {
    for (const ind of pilar.indicadores) {
      if (ind.nota === null || ind.nao_observado) continue;
      const par = auto.find((a) => casa(a.indicador_nome, ind.nome));
      if (!par || par.nota === null) continue;
      const gap = par.nota - ind.nota;
      if (gap === 0) continue;
      divs.push({
        competencia: ind.nome,
        pilar: pilar.nome,
        nota_colaborador: par.nota,
        nota_lider: ind.nota,
        gap,
      });
    }
  }
  return divs.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

/**
 * Avisos sobre os pontos cegos (nunca bloqueia): (a) havia divergência auto ×
 * líder mas o PDI não trouxe nenhum ponto cego; (b) um ponto cego usa adjetivo
 * de caráter em vez de comportamento observável (Kluger & DeNisi; SBI).
 */
export function validarPontosCegos(
  divergencias: Divergencia[],
  pontosCegos: { texto: string }[]
): AvisoPdi[] {
  const avisos: AvisoPdi[] = [];

  if (divergencias.length > 0 && pontosCegos.length === 0) {
    const maior = divergencias[0];
    const sentido = maior.gap > 0 ? "se avaliou acima" : "se avaliou abaixo";
    avisos.push({
      tipo: "ponto_cego_ignorado",
      mensagem: `Havia divergência entre a autoavaliação e o líder (ex.: "${maior.competencia}", o colaborador ${sentido} do líder por ${Math.abs(maior.gap)} ponto(s)), mas o PDI não trouxe pontos cegos — confira.`,
    });
  }

  for (const pc of pontosCegos) {
    const texto = normalizar(pc.texto);
    const adjetivo = ADJETIVOS_DE_CARATER.find((adj) => texto.includes(adj));
    if (adjetivo) {
      avisos.push({
        tipo: "ponto_cego_como_traco",
        mensagem: `Um ponto cego usa "${adjetivo}" — isso soa como julgamento de personalidade. Prefira descrever o comportamento observável e seu efeito.`,
      });
    }
  }

  return avisos;
}
