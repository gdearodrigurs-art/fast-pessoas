import { z } from "zod";
import { cpfValido, TIPOS_VINCULO } from "../colaboradores/esquemas";

// ------------------------------------------------------------------ requisição de vaga

export const MOTIVOS_REQUISICAO = ["reposicao", "aumento_quadro"] as const;

export type MotivoRequisicao = (typeof MOTIVOS_REQUISICAO)[number];

export const ROTULOS_MOTIVO_REQUISICAO: Record<MotivoRequisicao, string> = {
  reposicao: "Reposição",
  aumento_quadro: "Aumento de quadro",
};

export const STATUS_REQUISICAO = [
  "solicitada",
  "aprovada",
  "reprovada",
] as const;

export type StatusRequisicao = (typeof STATUS_REQUISICAO)[number];

export const ROTULOS_STATUS_REQUISICAO: Record<StatusRequisicao, string> = {
  solicitada: "Solicitada",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
};

// ------------------------------------------------------------------ vaga

export const STATUS_VAGA = [
  "aberta",
  "congelada",
  "fechada",
  "cancelada",
] as const;

export type StatusVaga = (typeof STATUS_VAGA)[number];

export const ROTULOS_STATUS_VAGA: Record<StatusVaga, string> = {
  aberta: "Aberta",
  congelada: "Congelada",
  fechada: "Fechada",
  cancelada: "Cancelada",
};

// ------------------------------------------------------------------ candidato

export const ORIGENS_CANDIDATO = [
  "indicacao",
  "site",
  "portal",
  "outro",
] as const;

export type OrigemCandidato = (typeof ORIGENS_CANDIDATO)[number];

export const ROTULOS_ORIGEM: Record<OrigemCandidato, string> = {
  indicacao: "Indicação",
  site: "Site",
  portal: "Portal externo",
  outro: "Outro",
};

/** Retenção estendida padrão do consentimento LGPD (banco de talentos). */
export const MESES_CONSENTIMENTO_PADRAO = 6;

// ------------------------------------------------------------------ candidatura e pipeline

export const STATUS_CANDIDATURA = [
  "ativa",
  "reprovada",
  "desistiu",
  "aprovada",
] as const;

export type StatusCandidatura = (typeof STATUS_CANDIDATURA)[number];

export const ROTULOS_STATUS_CANDIDATURA: Record<StatusCandidatura, string> = {
  ativa: "Em seleção",
  reprovada: "Reprovada",
  desistiu: "Desistiu",
  aprovada: "Aprovada",
};

/**
 * Catálogo controlado de motivos (Lei 9.029: nunca texto livre persistido
 * como motivo de desfecho negativo).
 */
export const MOTIVOS_MOVIMENTACAO = [
  "perfil",
  "experiencia",
  "salario",
  "comportamental",
  "desistencia",
  "outro",
] as const;

export type MotivoMovimentacao = (typeof MOTIVOS_MOVIMENTACAO)[number];

export const ROTULOS_MOTIVO_MOVIMENTACAO: Record<MotivoMovimentacao, string> = {
  perfil: "Perfil não aderente à vaga",
  experiencia: "Experiência insuficiente",
  salario: "Pretensão salarial",
  comportamental: "Aspecto comportamental",
  desistencia: "Desistência do candidato",
  outro: "Outro",
};

// ------------------------------------------------------------------ parecer

export const RECOMENDACOES_PARECER = [
  "aprovar",
  "reprovar",
  "duvida",
] as const;

export type RecomendacaoParecer = (typeof RECOMENDACOES_PARECER)[number];

export const ROTULOS_RECOMENDACAO: Record<RecomendacaoParecer, string> = {
  aprovar: "Aprovar",
  reprovar: "Reprovar",
  duvida: "Em dúvida",
};

// ------------------------------------------------------------------ oferta

export const STATUS_OFERTA = ["enviada", "aceita", "recusada"] as const;

export type StatusOferta = (typeof STATUS_OFERTA)[number];

export const ROTULOS_STATUS_OFERTA: Record<StatusOferta, string> = {
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
};

// ------------------------------------------------------------------ validação de entrada

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

const esquemaCpf = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => /^\d{11}$/.test(valor), {
    message: "CPF deve ter 11 dígitos",
  })
  .refine(cpfValido, { message: "CPF inválido" });

export const esquemaCriacaoRequisicao = z.object({
  cargo_id: z.number().int().positive(),
  estabelecimento_id: z.number().int().positive().nullable().optional(),
  motivo: z.enum(MOTIVOS_REQUISICAO),
  justificativa: z
    .string()
    .trim()
    .min(1, "A justificativa é obrigatória")
    .max(4000, "Justificativa longa demais"),
});

export type CriacaoRequisicao = z.infer<typeof esquemaCriacaoRequisicao>;

export const esquemaDecisaoRequisicao = z.object({
  decisao: z.enum(["aprovar", "reprovar"]),
  motivo: z
    .string()
    .trim()
    .min(1, "O motivo da decisão é obrigatório")
    .max(2000, "Motivo longo demais"),
});

export type DecisaoRequisicao = z.infer<typeof esquemaDecisaoRequisicao>;

export const esquemaCriacaoVaga = z.object({
  requisicao_id: z.number().int().positive(),
  titulo: z.string().trim().min(1, "Informe o título da vaga").max(200),
  prazo_alvo: esquemaData,
});

export type CriacaoVaga = z.infer<typeof esquemaCriacaoVaga>;

export const esquemaCriacaoCandidato = z.object({
  nome: z.string().trim().min(3, "Informe o nome do candidato").max(200),
  email: z.email("E-mail inválido").max(254),
  telefone: z.string().trim().max(20).optional(),
  cpf: esquemaCpf.optional(),
  origem: z.enum(ORIGENS_CANDIDATO),
  consentimento_lgpd: z.boolean().refine((valor) => valor, {
    message:
      "O cadastro manual exige o consentimento LGPD registrado do candidato",
  }),
  /** Sem valor informado, o serviço aplica hoje + 6 meses (retenção padrão). */
  consentido_ate: esquemaData.optional(),
});

export type CriacaoCandidato = z.infer<typeof esquemaCriacaoCandidato>;

export const esquemaCriacaoCandidatura = z.object({
  vaga_id: z.number().int().positive(),
  candidato_id: z.number().int().positive(),
});

export type CriacaoCandidatura = z.infer<typeof esquemaCriacaoCandidatura>;

export const esquemaMovimentacao = z
  .object({
    acao: z.enum(["avancar", "reprovar"]),
    motivo_catalogo: z.enum(MOTIVOS_MOVIMENTACAO).optional(),
    observacao: z.string().trim().max(2000).optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.acao === "reprovar" && !dados.motivo_catalogo) {
      contexto.addIssue({
        code: "custom",
        path: ["motivo_catalogo"],
        message: "Reprovação exige motivo do catálogo",
      });
    }
  });

export type Movimentacao = z.infer<typeof esquemaMovimentacao>;

export const esquemaParecer = z.object({
  recomendacao: z.enum(RECOMENDACOES_PARECER),
  observacoes: z
    .string()
    .trim()
    .min(1, "Escreva o parecer")
    .max(4000, "Parecer longo demais"),
});

export type CriacaoParecer = z.infer<typeof esquemaParecer>;

export const esquemaCriacaoOferta = z.object({
  valor: z
    .number()
    .positive("Informe um valor maior que zero")
    .max(9999999999, "Valor fora do intervalo aceito"),
  aprovacao_fora_banda: z.string().trim().min(1).max(2000).optional(),
});

export type CriacaoOferta = z.infer<typeof esquemaCriacaoOferta>;

export const esquemaRespostaOferta = z
  .object({
    resposta: z.enum(["aceita", "recusada"]),
    motivo_catalogo: z.enum(MOTIVOS_MOVIMENTACAO).optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.resposta === "recusada" && !dados.motivo_catalogo) {
      contexto.addIssue({
        code: "custom",
        path: ["motivo_catalogo"],
        message: "Recusa exige motivo do catálogo",
      });
    }
  });

export type RespostaOferta = z.infer<typeof esquemaRespostaOferta>;

export const esquemaIniciarAdmissao = z.object({
  matricula: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Matrícula deve conter apenas números"),
  cpf: esquemaCpf,
  tipo_vinculo: z.enum(TIPOS_VINCULO),
  data_inicio_prevista: esquemaData,
  contrato_experiencia: z.boolean(),
});

export type IniciarAdmissao = z.infer<typeof esquemaIniciarAdmissao>;
