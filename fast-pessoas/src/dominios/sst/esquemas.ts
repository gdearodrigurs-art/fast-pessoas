import { z } from "zod";

// ------------------------------------------------------------------ ASO

export const TIPOS_ASO = [
  "admissional",
  "periodico",
  "demissional",
  "retorno_trabalho",
  "mudanca_risco",
] as const;

export type TipoAso = (typeof TIPOS_ASO)[number];

export const ROTULOS_TIPO_ASO: Record<TipoAso, string> = {
  admissional: "Admissional",
  periodico: "Periódico",
  demissional: "Demissional",
  retorno_trabalho: "Retorno ao trabalho",
  mudanca_risco: "Mudança de riscos",
};

export const RESULTADOS_ASO = [
  "apto",
  "inapto",
  "apto_com_restricoes",
] as const;

export type ResultadoAso = (typeof RESULTADOS_ASO)[number];

export const ROTULOS_RESULTADO_ASO: Record<ResultadoAso, string> = {
  apto: "Apto",
  inapto: "Inapto",
  apto_com_restricoes: "Apto com restrições",
};

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

// ------------------------------------------------------------------ NR-1 / avaliação psicossocial
// Fica ANTES do ASO no arquivo porque o esquema do ASO embute a avaliação
// vinculada (o registro do exame já oferece a NR-1). O bloco completo do
// domínio — classificações, rótulos e o registro avulso — segue abaixo, na
// seção "NR-1".

export const CLASSIFICACOES_RISCO = [
  "baixo",
  "moderado",
  "alto",
  "critico",
] as const;

export type ClassificacaoRisco = (typeof CLASSIFICACOES_RISCO)[number];

export const ROTULOS_CLASSIFICACAO_RISCO: Record<ClassificacaoRisco, string> = {
  baixo: "Risco baixo",
  moderado: "Risco moderado",
  alto: "Risco alto",
  critico: "Risco crítico",
};

/** Núcleo da avaliação, sem colaborador e sem ASO (esses vêm do contexto). */
const camposPsicossocial = {
  data_avaliacao: esquemaData,
  // data-limite informada pela empresa executora; ausente = sem renovação definida
  validade: esquemaData.nullish(),
  classificacao_risco: z.enum(CLASSIFICACOES_RISCO),
  // dado de saúde — cifrado na aplicação antes de persistir
  observacoes: z
    .string()
    .trim()
    .max(2000, "Observações longas demais (máx. 2000 caracteres)")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
  documento_id: z
    .number("Documento inválido")
    .int("Documento inválido")
    .positive("Documento inválido")
    .nullish(),
  empresa_executora: z
    .string()
    .trim()
    .max(200, "Nome da empresa longo demais (máx. 200 caracteres)")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
};

/** Avaliação registrada junto com o ASO — herda dele colaborador e vínculo. */
export const esquemaPsicossocialVinculada = z
  .object(camposPsicossocial)
  .refine(
    (dados) => !dados.validade || dados.validade > dados.data_avaliacao,
    {
      message: "A validade precisa ser posterior à avaliação",
      path: ["validade"],
    }
  );

export type PsicossocialVinculada = z.infer<typeof esquemaPsicossocialVinculada>;

export const esquemaRegistroAso = z
  .object({
    colaborador_id: z
      .number("Escolha o colaborador")
      .int("Colaborador inválido")
      .positive("Colaborador inválido"),
    tipo: z.enum(TIPOS_ASO),
    data_exame: esquemaData,
    // data-limite informada pela clínica; ausente = sem próximo exame (ex.: demissional)
    validade: esquemaData.nullish(),
    resultado: z.enum(RESULTADOS_ASO),
    // dado de saúde — cifrado na aplicação antes de persistir
    restricoes: z
      .string()
      .trim()
      .max(2000, "Restrições longas demais (máx. 2000 caracteres)")
      .optional()
      .transform((valor) => (valor ? valor : undefined)),
    documento_id: z
      .number("Documento inválido")
      .int("Documento inválido")
      .positive("Documento inválido")
      .nullish(),
    // NR-1 acoplada ao ASO ("todo mundo que fizer o ASO já entra nessa
    // modalidade"): quando vem preenchida, a avaliação nasce na MESMA
    // transação do ASO, já vinculada a ele. Ausente = ASO sozinho.
    psicossocial: esquemaPsicossocialVinculada.optional(),
  })
  .refine(
    (dados) => !dados.validade || dados.validade > dados.data_exame,
    { message: "A validade precisa ser posterior ao exame", path: ["validade"] }
  )
  .refine(
    (dados) => !dados.restricoes || dados.resultado !== "apto",
    {
      message: "ASO plenamente apto não carrega restrições",
      path: ["restricoes"],
    }
  );

export type RegistroAso = z.infer<typeof esquemaRegistroAso>;

// ------------------------------------------------------------------ NR-1 (registro avulso)

/**
 * Avaliação registrada pela aba própria de NR-1: mesma avaliação, mais o
 * colaborador e (opcionalmente) o ASO ao qual ela se prende — o serviço
 * confere que o ASO é do mesmo colaborador antes de gravar.
 */
export const esquemaRegistroPsicossocial = z
  .object({
    colaborador_id: z
      .number("Escolha o colaborador")
      .int("Colaborador inválido")
      .positive("Colaborador inválido"),
    ...camposPsicossocial,
    aso_id: z
      .number("ASO inválido")
      .int("ASO inválido")
      .positive("ASO inválido")
      .nullish(),
  })
  .refine(
    (dados) => !dados.validade || dados.validade > dados.data_avaliacao,
    {
      message: "A validade precisa ser posterior à avaliação",
      path: ["validade"],
    }
  );

export type RegistroPsicossocial = z.infer<typeof esquemaRegistroPsicossocial>;

// ------------------------------------------------------------------ EPI

export const esquemaItemEpi = z
  .object({
    nome: z
      .string("Informe o nome do EPI")
      .trim()
      .min(1, "Informe o nome do EPI")
      .max(200, "Nome longo demais (máx. 200 caracteres)"),
    numero_ca: z
      .string()
      .trim()
      .max(30, "CA longo demais (máx. 30 caracteres)")
      .optional()
      .transform((valor) => (valor ? valor : undefined)),
    validade_ca: esquemaData.nullish(),
  })
  .refine(
    (dados) => !dados.validade_ca || dados.numero_ca,
    {
      message: "Validade de CA exige o número do CA",
      path: ["validade_ca"],
    }
  );

export type ItemEpi = z.infer<typeof esquemaItemEpi>;

export const esquemaEntregaEpi = z.object({
  colaborador_id: z
    .number("Escolha o colaborador")
    .int("Colaborador inválido")
    .positive("Colaborador inválido"),
  epi_item_id: z
    .number("Escolha o EPI")
    .int("EPI inválido")
    .positive("EPI inválido"),
  quantidade: z
    .number("Informe a quantidade")
    .int("Quantidade inválida")
    .min(1, "Quantidade mínima: 1")
    .max(999, "Quantidade máxima: 999"),
  data_entrega: esquemaData,
  // termo de entrega no GED — a ciência do colaborador é dada sobre ele
  termo_documento_id: z
    .number("Documento inválido")
    .int("Documento inválido")
    .positive("Documento inválido")
    .nullish(),
});

export type EntregaEpi = z.infer<typeof esquemaEntregaEpi>;

// ------------------------------------------------------------------ CAT

export const TIPOS_CAT = ["tipico", "trajeto", "doenca"] as const;

export type TipoCat = (typeof TIPOS_CAT)[number];

export const ROTULOS_TIPO_CAT: Record<TipoCat, string> = {
  tipico: "Acidente típico",
  trajeto: "Acidente de trajeto",
  doenca: "Doença ocupacional",
};

export const STATUS_CAT = ["registrada", "encaminhada"] as const;

export type StatusCat = (typeof STATUS_CAT)[number];

export const ROTULOS_STATUS_CAT: Record<StatusCat, string> = {
  registrada: "Registrada",
  encaminhada: "Encaminhada para transmissão",
};

const esquemaDataHora = z
  .string("Informe a data e a hora do acidente")
  .refine((valor) => !Number.isNaN(Date.parse(valor)), {
    message: "Data/hora inválida",
  });

export const esquemaRegistroCat = z
  .object({
    colaborador_id: z
      .number("Escolha o colaborador")
      .int("Colaborador inválido")
      .positive("Colaborador inválido"),
    tipo: z.enum(TIPOS_CAT),
    data_acidente: esquemaDataHora,
    descricao: z
      .string("Descreva o acidente")
      .trim()
      .min(1, "Descreva o acidente")
      .max(4000, "Descrição longa demais (máx. 4000 caracteres)"),
    houve_afastamento: z.boolean("Informe se houve afastamento"),
    afastamento_id: z
      .number("Afastamento inválido")
      .int("Afastamento inválido")
      .positive("Afastamento inválido")
      .nullish(),
    status: z.enum(STATUS_CAT).default("registrada"),
    // correção/avanço append-only: novo registro apontando para o anterior
    cat_anterior_id: z
      .number("CAT anterior inválida")
      .int("CAT anterior inválida")
      .positive("CAT anterior inválida")
      .nullish(),
  })
  .refine(
    (dados) => dados.houve_afastamento || !dados.afastamento_id,
    {
      message: "Vínculo com afastamento exige marcar que houve afastamento",
      path: ["afastamento_id"],
    }
  )
  .refine(
    (dados) => Date.parse(dados.data_acidente) <= Date.now() + 60_000,
    {
      message: "A data do acidente não pode estar no futuro",
      path: ["data_acidente"],
    }
  );

export type RegistroCat = z.infer<typeof esquemaRegistroCat>;

// ------------------------------------------------------------------ apoio de exibição

/** dd/mm/aaaa a partir de AAAA-MM-DD — usado em resumos e auditoria. */
export function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Data/hora legível no fuso America/Sao_Paulo (exibição; banco fica em UTC). */
export function formatarDataHora(instanteIso: string): string {
  return new Date(instanteIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
