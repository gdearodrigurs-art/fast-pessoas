import { z } from "zod";

export const STATUS_DEMANDA = [
  "aguardando_aprovacao",
  "aberta",
  "em_atendimento",
  "concluida",
  "recusada",
] as const;

export type StatusDemanda = (typeof STATUS_DEMANDA)[number];

export const ROTULOS_STATUS_DEMANDA: Record<StatusDemanda, string> = {
  aguardando_aprovacao: "Aguardando aprovação do gestor",
  aberta: "Aberta",
  em_atendimento: "Em atendimento",
  concluida: "Concluída",
  recusada: "Recusada",
};

/** Rótulo exibido no cartão: distingue recusa do DP de reprovação do gestor. */
export function rotuloStatusExibicao(
  status: StatusDemanda,
  recusadaNaAprovacao: boolean
): string {
  if (status === "recusada") {
    return recusadaNaAprovacao ? "Reprovada pelo gestor" : "Recusada pelo DP";
  }
  return ROTULOS_STATUS_DEMANDA[status];
}

/** Frase legível de uma transição do histórico (de_status NULL = abertura). */
export function rotuloTransicao(
  de: StatusDemanda | null,
  para: StatusDemanda,
  porNome: string
): string {
  if (de === null) {
    return para === "aguardando_aprovacao"
      ? `Aberta por ${porNome} — enviada para aprovação do gestor`
      : `Aberta por ${porNome} — entrou na fila do DP`;
  }
  if (de === "aguardando_aprovacao" && para === "aberta") {
    return `Aprovada pelo gestor ${porNome} — entrou na fila do DP`;
  }
  if (de === "aguardando_aprovacao" && para === "recusada") {
    return `Reprovada pelo gestor ${porNome}`;
  }
  if (para === "em_atendimento") {
    return `Assumida por ${porNome}`;
  }
  if (para === "concluida") {
    return `Concluída por ${porNome}`;
  }
  if (para === "recusada") {
    return `Recusada por ${porNome}`;
  }
  return `${ROTULOS_STATUS_DEMANDA[para]} por ${porNome}`;
}

export const STATUS_ATIVOS: readonly StatusDemanda[] = [
  "aguardando_aprovacao",
  "aberta",
  "em_atendimento",
];

export const esquemaCriacaoDemanda = z.object({
  tipo_chave: z.string().trim().min(1, "Escolha o tipo").max(100),
  descricao: z
    .string()
    .trim()
    .min(1, "Descreva o que você precisa")
    .max(4000, "Descrição longa demais"),
});

export type CriacaoDemanda = z.infer<typeof esquemaCriacaoDemanda>;

export const esquemaMotivo = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "O motivo é obrigatório")
    .max(4000, "Motivo longo demais"),
});

export type CorpoMotivo = z.infer<typeof esquemaMotivo>;

export const esquemaConclusao = z.object({
  resposta: z
    .string()
    .trim()
    .min(1, "Descreva a entrega/resposta ao solicitante")
    .max(4000, "Resposta longa demais"),
});

export type CorpoConclusao = z.infer<typeof esquemaConclusao>;

export const esquemaComentario = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "Escreva o comentário")
    .max(4000, "Comentário longo demais"),
});

export type CorpoComentario = z.infer<typeof esquemaComentario>;

export const FILTROS_ATRASO = ["atrasadas", "hoje", "no_prazo"] as const;

export type FiltroAtraso = (typeof FILTROS_ATRASO)[number];

// "encerradas" agrupa concluída + recusada (aba da fila do DP).
export const esquemaFiltroDemandas = z.object({
  status: z.enum([...STATUS_DEMANDA, "encerradas"]).optional(),
  tipo: z.string().trim().min(1).max(100).optional(),
  atraso: z.enum(FILTROS_ATRASO).optional(),
});

export type FiltroDemandas = z.infer<typeof esquemaFiltroDemandas>;

export function formatarNumeroDemanda(numero: number): string {
  return `DEM-${String(numero).padStart(4, "0")}`;
}
