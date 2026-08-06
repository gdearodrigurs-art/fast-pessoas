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

/**
 * As duas abas do acervo. Separam o que a empresa PUBLICA para todo mundo do
 * que é DA PESSOA — são leituras diferentes do mesmo acervo, não permissões
 * diferentes: quem pode ver menos continua vendo menos nas duas.
 */
export const ABAS_DOCUMENTO = ["publicacoes", "pessoa"] as const;

export type AbaDocumento = (typeof ABAS_DOCUMENTO)[number];

export const ROTULOS_ABA: Record<AbaDocumento, string> = {
  publicacoes: "Políticas e comunicados",
  pessoa: "Documentos da pessoa",
};

/**
 * Toda categoria mora em exatamente uma aba. O `Record` é exaustivo de
 * propósito: acrescentar categoria em `CATEGORIAS_DOCUMENTO` sem dizer a aba
 * dela não compila. Sem isso, a categoria nova sumiria das duas abas e o
 * documento ficaria invisível sem ninguém perceber.
 */
export const ABA_DA_CATEGORIA: Record<CategoriaDocumento, AbaDocumento> = {
  politica: "publicacoes",
  comunicado: "publicacoes",
  contrato: "pessoa",
  holerite: "pessoa",
  atestado: "pessoa",
  outro: "pessoa",
};

/** Categoria desconhecida (dado antigo) cai em "Documentos da pessoa". */
export function abaDaCategoria(categoria: string): AbaDocumento {
  return (
    ABA_DA_CATEGORIA[categoria as CategoriaDocumento] ?? ABA_DA_CATEGORIA.outro
  );
}

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

/**
 * Lista fechada do que pode ser guardado no GED.
 *
 * Esta lista NÃO é administrável pela tela, e é de propósito: o eixo "nada
 * chumbado" trata de limite, prazo e lista de NEGÓCIO — o que pode virar
 * arquivo no servidor é fronteira de segurança. Deixar um operador acrescentar
 * `application/x-msdownload` por uma tela seria entregar a chave.
 *
 * PDF é obrigatório aqui: é o formato que a assinatura gov.br exige.
 */
export const MIMES_PERMITIDOS = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "image/jpeg",
  "image/png",
] as const;

export const ROTULOS_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word (.doc)",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word (.docx)",
  "text/plain": "Texto",
  "image/jpeg": "Imagem JPEG",
  "image/png": "Imagem PNG",
};

/**
 * Como o pop-up "Visualizar" trata cada tipo aceito.
 *
 * O `Record` é exaustivo sobre `MIMES_PERMITIDOS`: liberar um formato novo no
 * GED obriga a dizer, aqui, como ele aparece na tela — ou não compila. É o que
 * impede o caso ruim, que é despejar binário como se fosse texto.
 *
 * Word não abre em navegador nenhum: `.doc` e `.docx` são zip/OLE, e o que
 * apareceria é lixo. Nesse caso o pop-up avisa e oferece o download.
 */
export type ModoVisualizacao = "texto" | "pdf" | "imagem" | "nao_exibivel";

export const MODO_VISUALIZACAO: Record<
  (typeof MIMES_PERMITIDOS)[number],
  ModoVisualizacao
> = {
  "application/pdf": "pdf",
  "application/msword": "nao_exibivel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "nao_exibivel",
  "text/plain": "texto",
  "image/jpeg": "imagem",
  "image/png": "imagem",
};

/**
 * MIME fora da lista (arquivo guardado antes da lista fechada existir) cai em
 * `nao_exibivel`. O padrão é NÃO renderizar: melhor oferecer o download do que
 * arriscar mostrar bytes crus.
 */
export function modoDeVisualizacao(mime: string): ModoVisualizacao {
  return (
    MODO_VISUALIZACAO[mime as (typeof MIMES_PERMITIDOS)[number]] ??
    "nao_exibivel"
  );
}

export function rotuloDeMime(mime: string): string {
  return ROTULOS_MIME[mime] ?? mime;
}

const esquemaMime = z
  .string()
  .trim()
  .max(100)
  .regex(/^[\w.+-]+\/[\w.+-]+$/, "Tipo MIME inválido")
  .refine(
    (valor) => (MIMES_PERMITIDOS as readonly string[]).includes(valor),
    `Tipo de arquivo não aceito. Aceitos: ${MIMES_PERMITIDOS.map(
      (mime) => ROTULOS_MIME[mime]
    ).join(", ")}.`
  );

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
