import { z } from "zod";
import { PAPEIS, Papel } from "../identidade/esquemas";

export const ROTULOS_PAPEL: Record<Papel, string> = {
  funcionario: "Funcionário",
  gestor: "Gestor",
  rh: "RH",
  dp: "Departamento Pessoal",
  diretoria: "Diretoria de Pessoas",
  admin: "Administrador",
};

export const esquemaCriacaoUsuario = z.object({
  email: z.email("E-mail inválido").max(254),
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  papel: z.enum(PAPEIS),
});

export type CriacaoUsuario = z.infer<typeof esquemaCriacaoUsuario>;

export const esquemaAtualizacaoUsuario = z
  .object({
    ativo: z.boolean().optional(),
    papel: z.enum(PAPEIS).optional(),
  })
  .refine((dados) => dados.ativo !== undefined || dados.papel !== undefined, {
    message: "Informe ao menos um campo para atualizar",
  });

export type AtualizacaoUsuario = z.infer<typeof esquemaAtualizacaoUsuario>;
