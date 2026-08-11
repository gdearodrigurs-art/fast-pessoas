import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

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

/**
 * Item acrescentado à mão a um processo já aberto.
 *
 * `obrigatorio` nasce FALSO por decisão do dono: o obrigatório é o que a empresa
 * firmou no checklist; o extra é lembrete, não portão. Consequência assumida —
 * ele não trava o "Concluir processo", que recusa por obrigatório pendente. Em
 * troca, a tela avisa na hora de concluir que há item pendente.
 */
export const esquemaItemAvulso = z.object({
  descricao: z
    .string()
    .trim()
    .min(3, "Descreva o que falta em pelo menos 3 caracteres")
    .max(300, "Descrição longa demais"),
  obrigatorio: z.boolean().default(false),
});

export type ItemAvulso = z.infer<typeof esquemaItemAvulso>;

export const esquemaCancelamento = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "O motivo do cancelamento é obrigatório")
    .max(4000, "Motivo longo demais"),
});

export type CorpoCancelamento = z.infer<typeof esquemaCancelamento>;

// ------------------------------------------------------------------ modelo de checklist por vínculo

// As famílias de modelo. NULL = modelo GERAL (fallback); os demais são os tipos
// de vínculo com documentação legalmente distinta (migration 0058). "geral" só
// aparece como rótulo/chave derivada, nunca como valor gravado.
export const TIPOS_VINCULO_MODELO = [
  "clt",
  "estagiario",
  "aprendiz",
  "pj",
] as const;
export type TipoVinculoModelo = (typeof TIPOS_VINCULO_MODELO)[number];

export const ROTULOS_FAMILIA_MODELO: Record<
  TipoVinculoModelo | "geral",
  string
> = {
  geral: "Geral (fallback)",
  clt: "CLT",
  estagiario: "Estagiário",
  aprendiz: "Aprendiz",
  pj: "PJ",
};

/** A família de um modelo, para agrupar/rotular: o vínculo, ou "geral" se nulo. */
export function familiaDoModelo(
  tipoVinculo: TipoVinculoModelo | null
): TipoVinculoModelo | "geral" {
  return tipoVinculo ?? "geral";
}

// Um item do modelo: o que a empresa FIRMA no checklist. `obrigatorio` trava o
// "Concluir processo"; o item extra por processo (esquemaItemAvulso) não.
export const esquemaItemModelo = z.object({
  descricao: z
    .string()
    .trim()
    .min(3, "Descreva o item em pelo menos 3 caracteres")
    .max(300, "Descrição longa demais"),
  obrigatorio: z.boolean(),
});

export type ItemModelo = z.infer<typeof esquemaItemModelo>;

// Salvar um modelo = gravar uma nova versão ATIVA para a família (o vínculo, ou
// geral quando tipo_vinculo é nulo), encerrando a anterior no mesmo ato. A ordem
// dos itens é a ordem do array. Descrição não se repete na mesma lista.
export const esquemaModeloAdmissao = z
  .object({
    tipo_vinculo: z.enum(TIPOS_VINCULO_MODELO).nullable(),
    itens: z
      .array(esquemaItemModelo)
      .min(1, "O checklist precisa de ao menos um item.")
      .max(60, "Checklist longo demais (máximo 60 itens)."),
  })
  .refine(
    (modelo) => {
      const descricoes = modelo.itens.map((item) =>
        item.descricao.trim().toLowerCase()
      );
      return new Set(descricoes).size === descricoes.length;
    },
    { message: "Há itens com a mesma descrição na lista.", path: ["itens"] }
  );

export type ModeloAdmissaoEntrada = z.infer<typeof esquemaModeloAdmissao>;

/** Valida a estrutura no cliente antes de habilitar o "Salvar". Lista os erros. */
export function validarModeloAdmissao(
  entrada: ModeloAdmissaoEntrada
): string[] {
  const resultado = esquemaModeloAdmissao.safeParse(entrada);
  if (resultado.success) return [];
  return resultado.error.issues.map((issue) => issue.message);
}

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
