import { z } from "zod";

export const PAPEIS = [
  "funcionario",
  "gestor",
  "rh",
  "dp",
  "diretoria",
  "admin",
] as const;

export type Papel = (typeof PAPEIS)[number];

export const esquemaCredenciais = z.object({
  email: z.email().max(254),
  senha: z.string().min(1).max(200),
  codigo_totp: z
    .string()
    .regex(/^\d{6}$/, "Código TOTP deve ter 6 dígitos")
    .optional(),
});

export type Credenciais = z.infer<typeof esquemaCredenciais>;

export const esquemaTrocaSenha = z
  .object({
    senha_atual: z.string().min(1).max(200),
    senha_nova: z
      .string()
      .min(12, "A nova senha precisa de ao menos 12 caracteres")
      .max(200),
  })
  .refine((dados) => dados.senha_nova !== dados.senha_atual, {
    message: "A nova senha deve ser diferente da atual",
    path: ["senha_nova"],
  });

export type TrocaSenha = z.infer<typeof esquemaTrocaSenha>;

export const esquemaConfirmacao2fa = z.object({
  codigo: z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
});

export type Confirmacao2fa = z.infer<typeof esquemaConfirmacao2fa>;

export const esquemaDesativacao2fa = z.object({
  senha: z.string().min(1, "Informe a senha atual").max(200),
  codigo: z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
});

export type Desativacao2fa = z.infer<typeof esquemaDesativacao2fa>;

export const esquemaSessao = z.object({
  usuario_id: z.number().int().positive(),
  papel: z.enum(PAPEIS),
  nome: z.string().min(1),
  // Papel obrigado a usar 2FA que entrou sem totp_secret: a sessão nasce
  // "pendente" e só alcança o fluxo de configuração. Ausente = false
  // (sessões antigas continuam válidas).
  pendente_2fa: z.boolean().optional(),
});

export type PayloadSessao = z.infer<typeof esquemaSessao>;
