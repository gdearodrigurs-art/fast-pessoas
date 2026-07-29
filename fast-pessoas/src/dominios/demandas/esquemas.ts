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

// ==================================================================
// Movimentação: promoção e transferência de unidade (migration 0021)
// ==================================================================
// O tipo de demanda tem `fluxo`: 'padrao' (solicitação genérica) ou
// 'movimentacao' (formulário próprio + cadeia líder → diretoria + efeito
// automático na aprovação final). O formulário genérico NÃO abre movimentação.

export const FLUXOS_DEMANDA = ["padrao", "movimentacao"] as const;

export type FluxoDemanda = (typeof FLUXOS_DEMANDA)[number];

export const TIPOS_MOVIMENTACAO = ["promocao", "transferencia_unidade"] as const;

export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

export const ROTULOS_TIPO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  promocao: "Promoção",
  transferencia_unidade: "Transferência de unidade",
};

export const NIVEIS_APROVACAO = ["lider", "diretoria"] as const;

export type NivelAprovacao = (typeof NIVEIS_APROVACAO)[number];

export const ROTULOS_NIVEL_APROVACAO: Record<NivelAprovacao, string> = {
  lider: "Líder do colaborador",
  diretoria: "Diretoria",
};

export const STATUS_ETAPA = ["pendente", "aprovada", "reprovada"] as const;

export type StatusEtapa = (typeof STATUS_ETAPA)[number];

export const ROTULOS_STATUS_ETAPA: Record<StatusEtapa, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
};

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

export const esquemaCriacaoMovimentacao = z
  .object({
    tipo: z.enum(TIPOS_MOVIMENTACAO),
    colaborador_id: z.number().int().positive(),
    cargo_destino_id: z.number().int().positive().optional(),
    estabelecimento_destino_id: z.number().int().positive().optional(),
    centro_custo_destino: z.string().trim().min(1).max(60).optional(),
    // Remuneração é opcional: promoção sem mudança de salário existe.
    salario_proposto: z.number().nonnegative().max(9_999_999.99).optional(),
    justificativa_excecao: z.string().trim().min(1).max(2000).optional(),
    data_pretendida: esquemaData,
    justificativa: z
      .string()
      .trim()
      .min(1, "A justificativa é obrigatória")
      .max(4000, "Justificativa longa demais"),
  })
  .refine(
    (dados) => dados.tipo !== "promocao" || dados.cargo_destino_id !== undefined,
    { message: "Escolha o cargo destino", path: ["cargo_destino_id"] }
  )
  .refine(
    (dados) =>
      dados.tipo !== "transferencia_unidade" ||
      dados.estabelecimento_destino_id !== undefined,
    {
      message: "Escolha a unidade destino",
      path: ["estabelecimento_destino_id"],
    }
  );

export type CriacaoMovimentacao = z.infer<typeof esquemaCriacaoMovimentacao>;

export const esquemaDecisaoEtapa = z
  .object({
    decisao: z.enum(["aprovar", "reprovar"]),
    motivo: z.string().trim().max(4000, "Motivo longo demais").optional(),
  })
  .refine(
    (dados) =>
      dados.decisao !== "reprovar" ||
      (dados.motivo !== undefined && dados.motivo.length > 0),
    { message: "O motivo da reprovação é obrigatório", path: ["motivo"] }
  );

export type DecisaoEtapa = z.infer<typeof esquemaDecisaoEtapa>;

/**
 * Rótulo do estágio da cadeia para o cartão/fila — a demanda continua com
 * status 'aguardando_aprovacao' nos dois níveis, então o texto vem das etapas.
 */
export function rotuloEstagioCadeia(
  etapas: { ordem: number; nivel: NivelAprovacao; status: StatusEtapa }[]
): string | null {
  const pendente = [...etapas]
    .sort((a, b) => a.ordem - b.ordem)
    .find((etapa) => etapa.status === "pendente");
  if (!pendente) return null;
  return pendente.nivel === "diretoria"
    ? "Aguardando aprovação da diretoria"
    : "Aguardando aprovação do líder";
}
