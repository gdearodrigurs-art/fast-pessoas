import { z } from "zod";

// ------------------------------------------------------------------ status do PDI
// A máquina de dois passos: a IA rascunha → o gestor ajusta e submete → o RH
// homologa e publica os itens como ações do colaborador.

export const STATUS_PDI = [
  "rascunho",
  "aguardando_homologacao",
  "homologado",
  "cancelado",
] as const;

export type StatusPdi = (typeof STATUS_PDI)[number];

export const ROTULOS_STATUS_PDI: Record<StatusPdi, string> = {
  rascunho: "Rascunho (gestor ajustando)",
  aguardando_homologacao: "Aguardando homologação do RH",
  homologado: "Homologado",
  cancelado: "Cancelado",
};

// ------------------------------------------------------------------ mini-entrevista
// O padrão está nas PERGUNTAS (fixas); a flexibilidade está nas RESPOSTAS (por
// pessoa) e no fato de a IA se adaptar ao modelo de avaliação vigente. Nada aqui
// pergunta o que o sistema já sabe (notas, comentários) — só o que só o humano sabe.

export const TIPOS_PDI = ["ciclo", "pontual"] as const;
export type TipoPdi = (typeof TIPOS_PDI)[number];
export const ROTULOS_TIPO_PDI: Record<TipoPdi, string> = {
  ciclo: "Continuação de um ciclo de avaliação",
  pontual: "PDI pontual",
};

/** Horizonte do plano, em meses. */
export const HORIZONTES_PDI = [3, 6, 12] as const;
export type HorizontePdi = (typeof HORIZONTES_PDI)[number];

export const FOCOS_PRIORITARIOS = [
  "ia_decide",
  "sucessao",
  "corrigir_critico",
] as const;
export type FocoPrioritario = (typeof FOCOS_PRIORITARIOS)[number];
export const ROTULOS_FOCO_PRIORITARIO: Record<FocoPrioritario, string> = {
  ia_decide: "Deixar a IA decidir pelos dados",
  sucessao: "Preparar para sucessão",
  corrigir_critico: "Corrigir um ponto crítico",
};

/** Limite do campo livre — e da segurança: quanto maior, mais chance de vazar PII. */
export const LIMITE_CONTEXTO_LIVRE = 2000;

/**
 * As respostas da mini-entrevista. peso_avaliacao é quanto a avaliação numérica
 * pesa no PDI (a UI pré-preenche com o peso do modelo). contexto_livre é o campo
 * aberto — o serviço o desidentifica ANTES de enviar à IA.
 */
export const esquemaEntrevistaPdi = z.object({
  peso_avaliacao: z
    .number()
    .int()
    .min(0, "Peso entre 0 e 100")
    .max(100, "Peso entre 0 e 100"),
  tipo: z.enum(TIPOS_PDI),
  horizonte_meses: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  foco_prioritario: z.enum(FOCOS_PRIORITARIOS),
  contexto_livre: z
    .string()
    .trim()
    .max(
      LIMITE_CONTEXTO_LIVRE,
      `Contexto com no máximo ${LIMITE_CONTEXTO_LIVRE} caracteres`
    )
    .optional(),
});

export type EntrevistaPdi = z.infer<typeof esquemaEntrevistaPdi>;

// ------------------------------------------------------------------ vocabulário da estrutura rica
// Campos que dão forma às ações e aos pontos cegos (Fase B). Todos OPCIONAIS: a
// IA preenche, o RH/DP pode deixar em branco ou limpar. Fundamentação em docs/19.

/** Modalidade da ação no modelo 70-20-10 (o peso deve ficar em experiência). */
export const MODALIDADES_ACAO = ["experiencia", "feedback", "formacao"] as const;
export type ModalidadeAcao = (typeof MODALIDADES_ACAO)[number];
export const ROTULOS_MODALIDADE_ACAO: Record<ModalidadeAcao, string> = {
  experiencia: "Experiência no trabalho (70)",
  feedback: "Feedback / mentoria (20)",
  formacao: "Formação (10)",
};

/** A ação amplia uma força já demonstrada ou endereça uma lacuna. */
export const TIPOS_ACAO = ["ampliar_forca", "enderecar_lacuna"] as const;
export type TipoAcao = (typeof TIPOS_ACAO)[number];
export const ROTULOS_TIPO_ACAO: Record<TipoAcao, string> = {
  ampliar_forca: "Ampliar força",
  enderecar_lacuna: "Endereçar lacuna",
};

/** Direção da divergência num ponto cego (auto × líder × pares). */
export const DIRECOES_PONTO_CEGO = [
  "superavaliado",
  "subavaliado",
  "alinhado",
] as const;
export type DirecaoPontoCego = (typeof DIRECOES_PONTO_CEGO)[number];
export const ROTULOS_DIRECAO_PONTO_CEGO: Record<DirecaoPontoCego, string> = {
  superavaliado: "Você se avaliou acima",
  subavaliado: "Força não reconhecida",
  alinhado: "Percepções alinhadas",
};

// ------------------------------------------------------------------ contrato da IA
// O JSON que a IA devolve (structured outputs). Validado no serviço mesmo com
// structured outputs — a saída da IA é dado externo, nunca confiança cega. Os
// campos da estrutura rica são OPCIONAIS aqui (o humano pode limpar; "" e null
// viram ausência); o motor avisa quando faltam, mas nunca bloqueia.

export const esquemaAcaoPdi = z.object({
  descricao: z.string().trim().min(3).max(2000),
  prazo_sugerido: z.string().trim().max(200),
  modalidade: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.enum(MODALIDADES_ACAO).optional()
  ),
  indicador: z.string().trim().max(1000).optional(),
  apoio: z.string().trim().max(500).optional(),
  tipo: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.enum(TIPOS_ACAO).optional()
  ),
});

export const esquemaFocoPdi = z.object({
  competencia: z.string().trim().min(1).max(200),
  porque: z.string().trim().min(1).max(2000),
  objetivo: z.string().trim().min(1).max(2000),
  nivel_atual: z.string().trim().max(200).optional(),
  nivel_desejado: z.string().trim().max(200).optional(),
  acoes: z.array(esquemaAcaoPdi).min(1).max(6),
});

/**
 * Ponto cego estruturado. Aceita também a forma antiga (string simples) via
 * preprocess — vira `{ texto }` — para não quebrar PDIs já gravados.
 */
export const esquemaPontoCegoPdi = z.preprocess(
  (v) => (typeof v === "string" ? { texto: v } : v),
  z.object({
    competencia: z.string().trim().max(200).optional().default(""),
    direcao: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.enum(DIRECOES_PONTO_CEGO).optional()
    ),
    texto: z.string().trim().min(1).max(500),
  })
);

export const esquemaConteudoPdi = z.object({
  focos: z.array(esquemaFocoPdi).min(1).max(6),
  pontos_cegos: z.array(esquemaPontoCegoPdi).max(10).default([]),
  resumo: z.string().trim().min(1).max(4000),
});

export type AcaoPdi = z.infer<typeof esquemaAcaoPdi>;
export type FocoPdi = z.infer<typeof esquemaFocoPdi>;
export type PontoCegoPdi = z.infer<typeof esquemaPontoCegoPdi>;
export type ConteudoPdi = z.infer<typeof esquemaConteudoPdi>;

// ------------------------------------------------------------------ requisições da API

/** Pedido de geração: de qual ciclo consolidado + as respostas da entrevista. */
export const esquemaGerarPdi = z.object({
  ciclo_id: z.number().int().positive(),
  entrevista: esquemaEntrevistaPdi,
});
export type GerarPdi = z.infer<typeof esquemaGerarPdi>;

/** Ajuste do gestor: o conteúdo editado (mesma forma que a IA devolve). */
export const esquemaAjustarPdi = esquemaConteudoPdi;
