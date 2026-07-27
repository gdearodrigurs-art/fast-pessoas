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

export const esquemaSessao = z.object({
  usuario_id: z.number().int().positive(),
  papel: z.enum(PAPEIS),
  nome: z.string().min(1),
});

export type PayloadSessao = z.infer<typeof esquemaSessao>;
