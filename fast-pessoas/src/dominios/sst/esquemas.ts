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
