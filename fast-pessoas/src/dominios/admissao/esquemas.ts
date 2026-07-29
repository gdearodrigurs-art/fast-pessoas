import { z } from "zod";

// ------------------------------------------------------------------ estados do processo

export const ESTADOS_PROCESSO = [
  "em_preparacao",
  "concluido",
  "cancelado",
] as const;

export type EstadoProcesso = (typeof ESTADOS_PROCESSO)[number];

export const ROTULOS_ESTADO_PROCESSO: Record<EstadoProcesso, string> = {
  em_preparacao: "Em preparação",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

// ------------------------------------------------------------------ status dos itens do checklist

export const STATUS_ITEM = ["pendente", "concluido", "nao_aplicavel"] as const;

export type StatusItem = (typeof STATUS_ITEM)[number];

export const ROTULOS_STATUS_ITEM: Record<StatusItem, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  nao_aplicavel: "Não se aplica",
};

// ------------------------------------------------------------------ validação de entrada

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

export const esquemaAberturaProcesso = z.object({
  colaborador_id: z.number().int().positive(),
  data_inicio_prevista: esquemaData,
  contrato_experiencia: z.boolean(),
});

export type AberturaProcesso = z.infer<typeof esquemaAberturaProcesso>;

// Reabrir (voltar a pendente) é permitido para corrigir engano — tudo auditado.
export const esquemaAtualizacaoItem = z.object({
  status: z.enum(STATUS_ITEM),
});

export type AtualizacaoItem = z.infer<typeof esquemaAtualizacaoItem>;

export const esquemaCancelamento = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "O motivo do cancelamento é obrigatório")
    .max(4000, "Motivo longo demais"),
});

export type CorpoCancelamento = z.infer<typeof esquemaCancelamento>;

// ------------------------------------------------------------------ prazos do contrato de experiência

/** Alerta visual do painel quando faltam este nº de dias (ou menos) para o prazo. */
export const DIAS_ALERTA_EXPERIENCIA = 10;

/**
 * Contrato de experiência CLT (art. 445, 45 + 45 dias): contando a data de
 * admissão como dia 1, o 1º período termina no dia 45 (admissão + 44) e a
 * prorrogação no dia 90 (admissão + 89). Aritmética em UTC — data-calendário
 * pura, sem fuso.
 */
export function calcularPrazosExperiencia(dataAdmissao: string): {
  prazo_experiencia_1: string;
  prazo_experiencia_2: string;
} {
  return {
    prazo_experiencia_1: somarDias(dataAdmissao, 44),
    prazo_experiencia_2: somarDias(dataAdmissao, 89),
  };
}

function somarDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return data.toISOString().slice(0, 10);
}

/** Percentual inteiro de itens resolvidos (concluído ou não aplicável). */
export function percentualConclusao(
  totalItens: number,
  itensResolvidos: number
): number {
  if (totalItens <= 0) return 0;
  return Math.round((itensResolvidos / totalItens) * 100);
}
