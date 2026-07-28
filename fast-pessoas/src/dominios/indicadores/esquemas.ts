import { z } from "zod";

export const UNIDADES_MEDIDA = ["%", "qtd", "dias"] as const;

export type UnidadeMedida = (typeof UNIDADES_MEDIDA)[number];

export const DIRECOES = ["maior", "menor"] as const;

export type Direcao = (typeof DIRECOES)[number];

export const ESCOPO_GLOBAL = "global";

export const ROTULOS_UNIDADE_MEDIDA: Record<UnidadeMedida, string> = {
  "%": "% (percentual)",
  qtd: "quantidade",
  dias: "dias",
};

export const ROTULOS_DIRECAO: Record<Direcao, string> = {
  maior: "Quanto maior, melhor",
  menor: "Quanto menor, melhor",
};

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

export const esquemaCriacaoIndicador = z.object({
  nome: z.string().trim().min(3, "Informe o nome do indicador").max(200),
  area: z.string().trim().min(1, "Informe a área").max(100),
  descricao: z.string().trim().max(500).optional(),
  unidade: z.enum(UNIDADES_MEDIDA),
  direcao: z.enum(DIRECOES),
});

export type CriacaoIndicador = z.infer<typeof esquemaCriacaoIndicador>;

export const esquemaCriacaoMeta = z.object({
  escopo: z
    .string()
    .trim()
    .min(1, "Informe o escopo")
    .max(120)
    .default(ESCOPO_GLOBAL),
  valor: z
    .number("Informe o valor da meta")
    .finite("Valor inválido")
    .min(0, "A meta não pode ser negativa")
    .max(1_000_000_000, "Valor alto demais"),
  inicio_vigencia: esquemaData,
});

export type CriacaoMeta = z.infer<typeof esquemaCriacaoMeta>;

/** Exibição da meta com a unidade de medida (ex.: "90%", "2 dias", "0"). */
export function formatarValorMeta(
  valor: number,
  unidade: UnidadeMedida
): string {
  const numero = valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (unidade === "%") return `${numero}%`;
  if (unidade === "dias") return `${numero} dias`;
  return numero;
}
