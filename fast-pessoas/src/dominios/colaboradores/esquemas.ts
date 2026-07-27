import { z } from "zod";

export const TIPOS_VINCULO = [
  "clt",
  "estagiario",
  "aprendiz",
  "pj",
  "temporario",
] as const;

export type TipoVinculo = (typeof TIPOS_VINCULO)[number];

export const STATUS_COLABORADOR = ["ativo", "afastado", "desligado"] as const;

export type StatusColaborador = (typeof STATUS_COLABORADOR)[number];

export const ROTULOS_VINCULO: Record<TipoVinculo, string> = {
  clt: "CLT",
  estagiario: "Estagiário",
  aprendiz: "Aprendiz",
  pj: "PJ",
  temporario: "Temporário",
};

export const ROTULOS_STATUS: Record<StatusColaborador, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[tamanho])) return false;
  }
  return true;
}

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

const esquemaCpf = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine((valor) => /^\d{11}$/.test(valor), {
    message: "CPF deve ter 11 dígitos",
  })
  .refine(cpfValido, { message: "CPF inválido" });

export const esquemaCriacaoColaborador = z.object({
  email: z.email("E-mail inválido").max(254),
  matricula: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Matrícula deve conter apenas números"),
  cpf: esquemaCpf,
  nome_completo: z.string().trim().min(3, "Informe o nome completo").max(200),
  tipo_vinculo: z.enum(TIPOS_VINCULO),
  data_admissao: esquemaData,
  retrato: z.string().trim().max(2000).optional(),
  contexto: z.string().trim().max(4000).optional(),
});

export type CriacaoColaborador = z.infer<typeof esquemaCriacaoColaborador>;

export const esquemaAtualizacaoColaborador = z
  .object({
    nome_completo: z
      .string()
      .trim()
      .min(3, "Informe o nome completo")
      .max(200)
      .optional(),
    retrato: z.string().trim().max(2000).nullable().optional(),
    contexto: z.string().trim().max(4000).nullable().optional(),
    tipo_vinculo: z.enum(TIPOS_VINCULO).optional(),
    status: z.enum(STATUS_COLABORADOR).optional(),
    data_desligamento: esquemaData.optional(),
  })
  .superRefine((dados, contexto) => {
    if (Object.values(dados).every((valor) => valor === undefined)) {
      contexto.addIssue({
        code: "custom",
        message: "Informe ao menos um campo para atualizar",
      });
    }
    if (dados.status === "desligado" && !dados.data_desligamento) {
      contexto.addIssue({
        code: "custom",
        path: ["data_desligamento"],
        message: "Informe a data de desligamento",
      });
    }
    if (dados.data_desligamento && dados.status !== "desligado") {
      contexto.addIssue({
        code: "custom",
        path: ["data_desligamento"],
        message: "Data de desligamento só se aplica ao status desligado",
      });
    }
  });

export type AtualizacaoColaborador = z.infer<
  typeof esquemaAtualizacaoColaborador
>;

export const esquemaFiltroColaboradores = z.object({
  busca: z.string().trim().min(1).max(100).optional(),
  status: z.enum(STATUS_COLABORADOR).optional(),
});

export type FiltroColaboradores = z.infer<typeof esquemaFiltroColaboradores>;
