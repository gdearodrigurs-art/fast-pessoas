import { z } from "zod";

/**
 * Notificação é AVISO, nunca conteúdo: os limites curtos de título/corpo são
 * DE PROPÓSITO — o dado em si mora na tela de destino, atrás da checagem de
 * permissão da rota. A regra dura anti-vazamento (salário, CID/saúde, nota de
 * avaliação, resposta de clima) é imposta no serviço (ver servico.ts) e o
 * princípio está registrado no cabeçalho de db/migrations/0015_notificacoes.sql.
 */
export const esquemaEmissao = z.object({
  usuarioId: z.number().int().positive(),
  tipo: z.string().trim().min(1, "Informe o tipo").max(100),
  titulo: z.string().trim().min(1, "Informe o título").max(140),
  corpo: z.string().trim().min(1).max(300).optional(),
  // Caminho INTERNO da aplicação: começa com "/" único (nunca "//host" nem
  // URL externa) e sem espaços. O CHECK do banco reforça o prefixo "/".
  link: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/(?!\/)\S*$/, "Link deve ser caminho interno (começar com /)")
    .optional(),
});

export type EmissaoNotificacao = z.infer<typeof esquemaEmissao>;

/** Paginação simples por cursor: id do último item já exibido. */
export const esquemaListagem = z.object({
  antes_de: z.coerce.number().int().positive().optional(),
});

export type FiltroListagem = z.infer<typeof esquemaListagem>;

export const esquemaMarcarLidas = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "Informe ao menos uma notificação")
    .max(500, "Lote grande demais"),
});

export type MarcarLidas = z.infer<typeof esquemaMarcarLidas>;
