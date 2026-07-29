import { z } from "zod";

export const TIPOS_AFASTAMENTO = [
  "atestado",
  "licenca_medica",
  "maternidade",
  "paternidade",
  "acidente_trabalho",
  "inss",
  "outros",
] as const;

export type TipoAfastamento = (typeof TIPOS_AFASTAMENTO)[number];

export const ROTULOS_TIPO_AFASTAMENTO: Record<TipoAfastamento, string> = {
  atestado: "Atestado médico",
  licenca_medica: "Licença médica",
  maternidade: "Licença-maternidade",
  paternidade: "Licença-paternidade",
  acidente_trabalho: "Acidente de trabalho",
  inss: "Benefício INSS",
  outros: "Outros",
};

/**
 * Rótulo para quem NÃO tem afastamento.saude.ver: sempre o genérico —
 * nem o tipo específico vaza (o tipo já conta a condição de saúde).
 */
export const ROTULO_GENERICO = "Afastamento";

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

export const esquemaRegistroAfastamento = z
  .object({
    colaborador_id: z
      .number("Escolha o colaborador")
      .int("Colaborador inválido")
      .positive("Colaborador inválido"),
    tipo: z.enum(TIPOS_AFASTAMENTO),
    inicio: esquemaData,
    // ausente/null = afastamento em curso, sem fim definido
    fim: esquemaData.nullish(),
    // dado de saúde (CID, médico, detalhe clínico) — cifrado antes de persistir
    detalhe_saude: z
      .string()
      .trim()
      .max(2000, "Detalhe longo demais (máx. 2000 caracteres)")
      .optional()
      .transform((valor) => (valor ? valor : undefined)),
    documento_id: z
      .number("Documento inválido")
      .int("Documento inválido")
      .positive("Documento inválido")
      .nullish(),
  })
  .refine(
    (dados) => !dados.fim || dados.fim >= dados.inicio,
    { message: "O fim não pode ser anterior ao início", path: ["fim"] }
  );

export type RegistroAfastamento = z.infer<typeof esquemaRegistroAfastamento>;

/** Período legível (dd/mm/aaaa) — usado em resumos SEM dado de saúde. */
export function formatarPeriodo(inicio: string, fim: string | null): string {
  const formatar = (dataIso: string) => {
    const [ano, mes, dia] = dataIso.split("-");
    return `${dia}/${mes}/${ano}`;
  };
  return fim
    ? `${formatar(inicio)} a ${formatar(fim)}`
    : `${formatar(inicio)} (em curso)`;
}
