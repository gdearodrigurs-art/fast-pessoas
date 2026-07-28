import { z } from "zod";

export const CATEGORIAS_DOCUMENTO = [
  "contrato",
  "holerite",
  "politica",
  "comunicado",
  "atestado",
  "outro",
] as const;

export type CategoriaDocumento = (typeof CATEGORIAS_DOCUMENTO)[number];

export const ROTULOS_CATEGORIA: Record<CategoriaDocumento, string> = {
  contrato: "Contrato",
  holerite: "Holerite",
  politica: "Política",
  comunicado: "Comunicado",
  atestado: "Atestado",
  outro: "Outro",
};

export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

export function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

const esquemaTitulo = z
  .string()
  .trim()
  .min(3, "Informe o título do documento")
  .max(200);

const esquemaNomeArquivo = z
  .string()
  .trim()
  .min(1, "Informe o nome do arquivo")
  .max(255);

const esquemaMime = z
  .string()
  .trim()
  .max(100)
  .regex(/^[\w.+-]+\/[\w.+-]+$/, "Tipo MIME inválido");

/** Metadados vindos de multipart/form-data — todo campo chega como texto. */
export const esquemaEnvioMultipart = z.object({
  categoria: z.enum(CATEGORIAS_DOCUMENTO),
  titulo: esquemaTitulo,
  sensivel: z.enum(["true", "false"]).transform((valor) => valor === "true"),
  colaborador_id: z.coerce
    .number("Colaborador inválido")
    .int("Colaborador inválido")
    .positive("Colaborador inválido")
    .optional(),
});

/** Envio em JSON com o conteúdo em base64 — alternativa ao multipart. */
export const esquemaEnvioBase64 = z.object({
  categoria: z.enum(CATEGORIAS_DOCUMENTO),
  titulo: esquemaTitulo,
  sensivel: z.boolean(),
  colaborador_id: z.number().int().positive().optional(),
  nome_arquivo: esquemaNomeArquivo,
  mime: esquemaMime,
  conteudo_base64: z
    .string()
    .min(1, "Conteúdo do arquivo ausente")
    // 10 MB em base64 ocupam ~13,4 MB de texto — rejeita antes de decodificar
    .max(
      Math.ceil((TAMANHO_MAXIMO_BYTES * 4) / 3) + 4,
      "Arquivo excede o limite de 10 MB"
    )
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Conteúdo base64 inválido"),
});

export type EnvioBase64 = z.infer<typeof esquemaEnvioBase64>;

/** Metadados normalizados que o serviço recebe, seja qual for o formato de envio. */
export interface MetadadosEnvio {
  categoria: CategoriaDocumento;
  titulo: string;
  sensivel: boolean;
  colaborador_id: number | null;
}
