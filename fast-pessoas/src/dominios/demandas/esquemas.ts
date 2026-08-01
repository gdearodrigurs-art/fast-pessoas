import { z } from "zod";
// O tipo de vínculo é do domínio de colaboradores; a transferência entre
// empresas do grupo escolhe um deles para o contrato que nasce (0048).
import { TIPOS_VINCULO } from "../colaboradores/esquemas";

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

export const TIPOS_MOVIMENTACAO = [
  "promocao",
  "transferencia_unidade",
  // Migration 0048: mudar de CNPJ dentro do grupo. É a terceira movimentação,
  // e a única que ENCERRA um vínculo e ABRE outro — a pessoa (rh.pessoa) é a
  // mesma, o contrato é que muda de empregador.
  "transferencia_empresa",
] as const;

export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

export const ROTULOS_TIPO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  promocao: "Promoção",
  transferencia_unidade: "Transferência de unidade",
  transferencia_empresa: "Transferência entre empresas do grupo",
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
    // Centro de custo destino é ESCOLHA de catálogo desde a 0047 — antes era
    // texto livre, e um zero a menos criava um centro novo em silêncio.
    centro_custo_destino_id: z.number().int().positive().optional(),
    // REGISTRO destino (0048): só na transferência entre empresas do grupo.
    empresa_destino_id: z.number().int().positive().optional(),
    matricula_destino: z.string().trim().min(1).max(30).optional(),
    // O tipo de vínculo pode mudar de empresa para empresa — exemplo do dono:
    // CLT na Supply, PJ na DCS. Ausente = mantém o do vínculo de origem.
    tipo_vinculo_destino: z.enum(TIPOS_VINCULO).optional(),
    // Quem lidera a pessoa NO DESTINO (0053). Ausente é resposta legítima:
    // "ninguém ainda" — o vínculo novo nasce sem líder e o DP designa. O que
    // NÃO é opção é herdar o líder de origem, que está em outro CNPJ.
    gestor_destino_colaborador_id: z.number().int().positive().optional(),
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
  )
  // Transferir de CNPJ exige os TRÊS campos da 0047 (registro, lotação e
  // centro de custo) mais a matrícula na empresa nova: o vínculo que nasce
  // precisa existir inteiro no primeiro dia, não pela metade.
  .refine(
    (dados) =>
      dados.tipo !== "transferencia_empresa" ||
      dados.empresa_destino_id !== undefined,
    { message: "Escolha a empresa destino", path: ["empresa_destino_id"] }
  )
  .refine(
    (dados) =>
      dados.tipo !== "transferencia_empresa" ||
      dados.estabelecimento_destino_id !== undefined,
    {
      message: "Escolha a lotação destino",
      path: ["estabelecimento_destino_id"],
    }
  )
  .refine(
    (dados) =>
      dados.tipo !== "transferencia_empresa" ||
      dados.centro_custo_destino_id !== undefined,
    {
      message: "Escolha o centro de custo destino",
      path: ["centro_custo_destino_id"],
    }
  )
  .refine(
    (dados) =>
      dados.tipo !== "transferencia_empresa" ||
      dados.matricula_destino !== undefined,
    {
      message: "Informe a matrícula na empresa destino",
      path: ["matricula_destino"],
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

// ------------------------------------------------------------------ efeito programado
//
// A APROVAÇÃO E O EFEITO SÃO DOIS ATOS, e a data pretendida separa os dois.
//
// Até aqui a última aprovação escrevia o efeito na hora, com a vigência
// pretendida no futuro. Uma transferência aprovada em 31/07 com vigência em
// 03/08 já deixava o vínculo 'desligado' em 31/07 — a pessoa sumia das listas,
// do organograma e do portal do gestor três dias antes de sair. E não era só a
// transferência: como o projeto inteiro lê "vigente" por `fim_vigencia IS NULL`
// (convenção uniforme, ver pesquisas/repositorio.ts), uma PROMOÇÃO aprovada
// hoje com vigência amanhã já entra como posição vigente hoje — inclusive na
// base de cálculo da folha do mês que ainda não acabou.
//
// A CORREÇÃO, e por que esta e não outra:
//
//   • recusar a aprovação com data futura seria matar o planejamento: a data
//     pretendida existe justamente para decidir antes; forçar a diretoria a
//     aprovar no próprio dia devolve o pedido ao "canal aleatório" que o módulo
//     veio acabar;
//   • fazer todo leitor virar sensível à data exigiria reescrever a convenção
//     de vigência em uma dúzia de domínios — e ainda assim não resolveria
//     `rh.colaborador.status`, que é bandeira sem vigência nenhuma;
//   • então a decisão é AGENDAR: a aprovação decide e manda a demanda para a
//     fila do DP; o efeito só é escrito na data pretendida ou depois.
//
// O FREIO VALE PARA TODAS AS PORTAS, não só para esta. Faltava dizer isto aqui,
// e foi a frase que faltou que deixou a porta dos fundos aberta: as três rotas
// diretas da ficha (POST /api/colaboradores/[id]/lotacao, .../posicao e
// .../gestor) gravavam a linha de vigência na hora, com qualquer data, e a
// vigência de setembro virava a vigente de agosto em ~20 consultas de uma vez.
// Sem agendador nessas rotas, elas RECUSAM data futura — ver
// `esquemaVigenciaNaoFutura` em colaboradores/esquemas.ts, cuja mensagem manda
// quem quer decidir antes para cá. Quem um dia der agendamento à ficha muda os
// dois lugares juntos.
//
// QUEM DISPARA. Não há agendador neste sistema — nenhum cron, nenhuma fila,
// nenhum processo de fundo (procurado: não existe). Inventar um seria inventar
// infraestrutura que ninguém executa. Quem dispara é o DP, pela demanda que a
// aprovação já colocou na fila dele: a transferência entre empresas, por
// exemplo, já lhe rende rescisão na origem, eSocial na destino, ASO admissional
// e readesão de benefícios — todos na data da vigência. Aplicar o efeito é mais
// um item dessa lista, no mesmo dia e na mesma tela, e o cartão fica marcado
// como VENCIDO quando a data chega para ninguém esquecer.
//
// Se um agendador existir um dia, ele chama a mesma rota; nada aqui muda.

export const SITUACOES_EFEITO = [
  "aguardando_aprovacao",
  "programado",
  "a_aplicar",
  "aplicado",
  "cancelado",
] as const;

export type SituacaoEfeito = (typeof SITUACOES_EFEITO)[number];

/**
 * Em que pé está o efeito de uma movimentação. Derivada, não armazenada: as
 * quatro fontes (cadeia, status da demanda, `aplicada_em` e a data pretendida)
 * já dizem tudo, e uma coluna a mais só criaria um segundo lugar para a verdade
 * divergir.
 */
export function situacaoDoEfeito(entrada: {
  status_demanda: StatusDemanda;
  aplicada_em: string | null;
  efeito_vencido: boolean;
  etapas: { status: StatusEtapa }[];
}): SituacaoEfeito {
  if (entrada.aplicada_em !== null) return "aplicado";
  // Recusa (do gestor na cadeia ou do DP na fila) é o cancelamento do efeito
  // agendado: não há o que aplicar depois, e é assim que se desmarca um
  // agendamento sem precisar de um verbo novo.
  if (entrada.status_demanda === "recusada") return "cancelado";
  if (entrada.etapas.some((etapa) => etapa.status === "pendente")) {
    return "aguardando_aprovacao";
  }
  return entrada.efeito_vencido ? "a_aplicar" : "programado";
}

export function rotuloSituacaoEfeito(
  situacao: SituacaoEfeito,
  dataPretendidaFormatada: string
): string {
  switch (situacao) {
    case "aplicado":
      return "Efeito aplicado";
    case "cancelado":
      return "Pedido encerrado sem efeito";
    case "aguardando_aprovacao":
      return "Aguardando aprovação";
    case "programado":
      return `Aprovada — efeito programado para ${dataPretendidaFormatada}`;
    case "a_aplicar":
      return `Aprovada — efeito a aplicar (vigência em ${dataPretendidaFormatada})`;
  }
}

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
