import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

// ===========================================================================
// Domínio DISCIPLINAR (migration 0080). Registrar uma medida disciplinar
// (advertência, suspensão) sobre um colaborador, de forma TIPADA (catálogo
// administrável — eixo 9), AUDITÁVEL (trilha) e RESTRITA (só rh.disciplinar.ver;
// gestor NÃO vê). A suspensão abre janela (inicio/fim); a advertência é pontual.
//
// O `com_periodo` é atributo do TIPO, e o catálogo mora no banco: por isso a
// regra "suspensão exige inicio/fim, advertência não os tem" NÃO cabe no zod
// puro (o zod não conhece o catálogo). Ela é conferida no SERVIÇO, com a
// função pura `validarPeriodoDaMedida` deste arquivo — testável sem banco.
// ===========================================================================

// O mesmo formato que o banco impõe em rh.tipo_medida_disciplinar.chave.
const FORMATO_CHAVE = /^[a-z][a-z0-9_]*$/;

/**
 * Nome digitado → chave estável ("Comunicado formal" → "comunicado_formal").
 * Copiado do molde do catálogo de devolução (desligamento/esquemas.ts:149): a
 * chave é a identidade e é derivada UMA vez, na criação; renomear depois mexe
 * só no nome, para o histórico já gravado continuar apontando à mesma linha.
 */
export function chaveDeNome(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/g, "");
  if (base === "") return "";
  return /^[a-z]/.test(base) ? base : `tipo_${base}`;
}

// ------------------------------------------------------------------ registro da medida

export const esquemaRegistroMedida = z
  .object({
    tipo_chave: z
      .string()
      .trim()
      .min(1, "Escolha o tipo da medida")
      .max(60)
      .regex(FORMATO_CHAVE, "Tipo inválido"),
    descricao: z.string().trim().min(3, "Descreva a medida").max(4000),
    impacto: z.string().trim().max(2000).optional(),
    acao_combinada: z.string().trim().max(2000).optional(),
    // A data do fato.
    aplicada_em: esquemaData,
    // Janela da suspensão (só os tipos com_periodo). O zod garante a coerência
    // ESTRUTURAL (fim exige inicio, fim não antecede inicio — espelha a CHECK
    // do banco); a EXIGÊNCIA por tipo é do serviço.
    inicio: esquemaData.optional(),
    fim: esquemaData.optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.fim && !dados.inicio) {
      contexto.addIssue({
        code: "custom",
        path: ["inicio"],
        message: "Informe o início do período.",
      });
    }
    if (dados.inicio && dados.fim && dados.fim < dados.inicio) {
      contexto.addIssue({
        code: "custom",
        path: ["fim"],
        message: "O fim não pode ser anterior ao início.",
      });
    }
  });

export type RegistroMedida = z.infer<typeof esquemaRegistroMedida>;

/**
 * Problema de período que a tela transforma em erro de campo. Devolvido em vez
 * de lançado para esta função continuar PURA (sem ErroHttp, que arrasta
 * next/headers e quebra o teste sem banco).
 */
export interface ProblemaPeriodo {
  campo: "inicio" | "fim";
  mensagem: string;
}

/**
 * A regra que o zod não pode saber sozinho: se o TIPO abre janela
 * (`com_periodo`), inicio E fim são obrigatórios; se não abre, os dois têm que
 * vir vazios. Além disso o fim nunca antecede o inicio. Pura de propósito — é o
 * caso que o teste sem banco cobre.
 */
export function validarPeriodoDaMedida(
  comPeriodo: boolean,
  dados: { inicio?: string | null; fim?: string | null }
): ProblemaPeriodo | null {
  const temInicio = Boolean(dados.inicio);
  const temFim = Boolean(dados.fim);
  if (comPeriodo) {
    if (!temInicio) {
      return { campo: "inicio", mensagem: "Este tipo exige a data de início." };
    }
    if (!temFim) {
      return { campo: "fim", mensagem: "Este tipo exige a data de fim." };
    }
  } else if (temInicio || temFim) {
    return {
      campo: "inicio",
      mensagem:
        "Este tipo de medida não tem período — deixe início e fim em branco.",
    };
  }
  if (dados.inicio && dados.fim && dados.fim < dados.inicio) {
    return { campo: "fim", mensagem: "O fim não pode ser anterior ao início." };
  }
  return null;
}

// ------------------------------------------------------------------ fechar/encurtar suspensão (decisão D1:a)
// Regras do dono: SÓ ENCURTAR o fim (nunca estender, nunca reabrir); data
// retroativa aceita até o INÍCIO da janela; quem registra pode encerrar (reusa
// rh.disciplinar.registrar); tudo auditado. Estender uma suspensão exige
// registrar medida NOVA — de propósito.

export const esquemaFechamentoSuspensao = z.object({
  /** O novo fim da janela — só para trás do fim atual, nunca antes do início. */
  fim: esquemaData,
});

export type FechamentoSuspensao = z.infer<typeof esquemaFechamentoSuspensao>;

export interface ProblemaEncurtamento {
  campo: "fim";
  mensagem: string;
}

/**
 * A régua D1:a em função PURA (testável sem banco), no molde de
 * `validarPeriodoDaMedida`. O repositório repete o mesmo predicado dentro do
 * UPDATE (com `rh.hoje()` e rowCount) como guarda de corrida — aqui nasce a
 * mensagem amigável, lá nasce a garantia.
 *
 *   • medida sem janela (inicio nulo) não tem o que encerrar;
 *   • janela cujo fim já passou está ENCERRADA — não se reabre nem se
 *     reescreve (correção é medida nova);
 *   • o novo fim aceita retroativo, mas nunca antes do INÍCIO da janela;
 *   • e só ENCURTA: novo fim tem que ser anterior ao fim atual.
 */
export function validarEncurtamentoDeSuspensao(
  medida: { inicio: string | null; fim: string | null },
  novoFim: string,
  hoje: string
): ProblemaEncurtamento | null {
  if (medida.inicio === null) {
    return {
      campo: "fim",
      mensagem: "Esta medida não tem janela de período — nada a encerrar.",
    };
  }
  if (medida.fim !== null && medida.fim <= hoje) {
    return {
      campo: "fim",
      mensagem:
        "A janela desta suspensão já se encerrou — o passado não se reescreve. " +
        "Se houve novo fato, registre uma medida nova.",
    };
  }
  if (novoFim < medida.inicio) {
    return {
      campo: "fim",
      mensagem:
        "O novo fim não pode ser anterior ao início da janela — a data " +
        "retroativa vale até o próprio início (decisão D1).",
    };
  }
  if (medida.fim !== null && novoFim >= medida.fim) {
    return {
      campo: "fim",
      mensagem:
        "Só é possível ENCURTAR a suspensão. Para estender, registre uma " +
        "medida nova — a janela gravada não se estica (decisão D1).",
    };
  }
  return null;
}

// ------------------------------------------------------------------ trecho removido pelo encurtamento (D4)
// O encurtamento pode chegar DEPOIS de uma competência já ter sido calculada
// lendo a janela cheia (D2:a, 0100): a folha descontou dias que a janela nova
// não cobre mais. O serviço pergunta ao banco quais competências CALCULADAS
// deste colaborador intersectam o trecho removido e devolve o aviso no
// payload (sem bloquear — D1:a segue valendo). As duas pontas PURAS moram
// aqui, no molde de validarEncurtamentoDeSuspensao: testáveis sem banco.

/** O pedaço da janela que o encurtamento REMOVE: (novo fim, fim antigo]. */
export interface TrechoRemovido {
  /** Primeiro dia removido — o dia seguinte ao novo fim. */
  inicio: string;
  /** Último dia removido; null quando a janela era ABERTA (removeu dali em diante). */
  fim: string | null;
}

/** Dia civil seguinte, em aritmética de calendário UTC (molde suspensao.ts). */
function diaSeguinte(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

/**
 * O que o encurtamento tira da janela. null = nada removido (novo fim não
 * antecede o atual — a régua D1 já barrou isso antes; aqui é defesa).
 */
export function trechoRemovidoDaSuspensao(
  fimAtual: string | null,
  novoFim: string
): TrechoRemovido | null {
  if (fimAtual !== null && novoFim >= fimAtual) return null;
  return { inicio: diaSeguinte(novoFim), fim: fimAtual };
}

/**
 * O texto do aviso quando competências CALCULADAS intersectam o trecho
 * removido. A correção não é automática de propósito: recalcular é decisão da
 * folha (competência aberta/em conferência recalcula; fechada não reabre — é
 * folha complementar, F2). null = nenhuma competência atingida, nada a avisar.
 */
export function avisoCompetenciasCalculadas(
  competencias: { ano: number; mes: number }[]
): string | null {
  if (competencias.length === 0) return null;
  const rotulos = competencias.map((item) => `${item.mes}/${item.ano}`);
  const plural = rotulos.length > 1;
  return (
    `competência${plural ? "s" : ""} ${rotulos.join(", ")} calculada${plural ? "s" : ""} ` +
    "com esse período de suspensão — recalcule (aberta/em conferência) ou lance " +
    "folha complementar (fechada) para devolver os dias que a janela não cobre mais"
  );
}

// ------------------------------------------------------------------ catálogo de tipos (administrável, molde 0054)

export const esquemaCriacaoTipoMedida = z.object({
  nome: z.string().trim().min(2, "Informe o nome do tipo").max(120),
  // Marca o tipo que abre janela de datas (a suspensão). Atributo do tipo, não
  // lista chumbada de "quais tipos têm período".
  com_periodo: z.boolean().optional().default(false),
});

export type CriacaoTipoMedida = z.infer<typeof esquemaCriacaoTipoMedida>;

export const esquemaInativacaoTipoMedida = z.object({ inativo: z.boolean() });

export type InativacaoTipoMedida = z.infer<typeof esquemaInativacaoTipoMedida>;
