import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

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

/**
 * Quais tipos, ao serem DEVOLVIDOS no payload, revelam uma condição de saúde do
 * PRÓPRIO colaborador. É por isso que a visão sem a chave esconde todos atrás
 * de ROTULO_GENERICO: o `tipo` em si já conta a condição. A trilha de leitura
 * (eixo 8) se amarra a esse dado devolvido — devolver um tipo clínico é ler
 * saúde de terceiro, tenha ou não texto livre cifrado junto.
 *
 * Administrativos (não revelam saúde do colaborador):
 *  - `paternidade`: a condição de saúde é da parceira, não do colaborador;
 *  - `outros`: rótulo genérico, não nomeia condição nenhuma.
 * Os demais nomeiam uma condição do próprio colaborador — doença (atestado,
 * licença médica), gestação (maternidade), acidente, ou incapacidade
 * previdenciária (INSS): clínicos. Na dúvida, clínico — sobra-auditar é
 * inócuo; falta-auditar é o defeito do eixo 8.
 */
export const TIPO_AFASTAMENTO_CLINICO: Record<TipoAfastamento, boolean> = {
  atestado: true,
  licenca_medica: true,
  maternidade: true,
  paternidade: false,
  acidente_trabalho: true,
  inss: true,
  outros: false,
};

export function tipoAfastamentoEhClinico(tipo: TipoAfastamento): boolean {
  return TIPO_AFASTAMENTO_CLINICO[tipo];
}

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
