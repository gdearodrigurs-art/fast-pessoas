import { z } from "zod";

// ------------------------------------------------------------------ competência

export const ESTADOS_COMPETENCIA = [
  "aberta",
  "calculo",
  "conferencia",
  "aprovada",
  "fechada",
] as const;

export type EstadoCompetencia = (typeof ESTADOS_COMPETENCIA)[number];

export const ROTULOS_ESTADO_COMPETENCIA: Record<EstadoCompetencia, string> = {
  aberta: "Aberta",
  calculo: "Em cálculo",
  conferencia: "Em conferência",
  aprovada: "Aprovada",
  fechada: "Fechada",
};

export const MESES_ROTULO = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function formatarCompetencia(ano: number, mes: number): string {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

export const esquemaAbrirCompetencia = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
});

export type AbrirCompetencia = z.infer<typeof esquemaAbrirCompetencia>;

// ------------------------------------------------------------------ rubricas

export const NATUREZAS_RUBRICA = [
  "provento",
  "desconto",
  "informativa",
] as const;

export type NaturezaRubrica = (typeof NATUREZAS_RUBRICA)[number];

export const ROTULOS_NATUREZA: Record<NaturezaRubrica, string> = {
  provento: "Provento",
  desconto: "Desconto",
  informativa: "Informativa",
};

export const TIPOS_CALCULO = [
  "salario_base",
  "percentual_salario",
  "horas_adicional",
  "valor_informado",
  "automatico",
] as const;

export type TipoCalculo = (typeof TIPOS_CALCULO)[number];

export const ROTULOS_TIPO_CALCULO: Record<TipoCalculo, string> = {
  salario_base: "Salário base",
  percentual_salario: "Percentual do salário",
  horas_adicional: "Horas × fator × valor-hora",
  valor_informado: "Valor informado",
  automatico: "Automático (regra do motor)",
};

// Códigos com regra FIXA no motor — identidade estável do catálogo (seed 0013).
export const CODIGO_SALARIO_BASE = "1001";
export const CODIGO_FALTAS = "1201";
export const CODIGO_DSR_FALTAS = "1202";
export const CODIGO_INSS = "2001";
export const CODIGO_IRRF = "2002";
export const CODIGO_DESCONTO_BENEFICIO = "2101";
export const CODIGO_FGTS = "3001";

/** Rubricas que o motor gera sozinho — lançar variável nelas é erro. */
export const CODIGOS_AUTOMATICOS: readonly string[] = [
  CODIGO_SALARIO_BASE,
  CODIGO_DSR_FALTAS,
  CODIGO_INSS,
  CODIGO_IRRF,
  CODIGO_FGTS,
];

const esquemaData = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
  .refine((valor) => !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)), {
    message: "Data inválida",
  });

const esquemaDinheiro = z
  .number()
  .min(0, "Valor não pode ser negativo")
  .max(9_999_999, "Valor acima do limite")
  .transform((valor) => Math.round(valor * 100) / 100);

const esquemaReferencia = z
  .number()
  .gt(0, "Referência deve ser maior que zero")
  .max(99_999, "Referência acima do limite")
  .transform((valor) => Math.round(valor * 100) / 100);

export const esquemaNovaVersaoRubrica = z
  .object({
    incide_inss: z.boolean(),
    incide_irrf: z.boolean(),
    incide_fgts: z.boolean(),
    tipo_calculo: z.enum(TIPOS_CALCULO),
    parametro: z
      .number()
      .gt(0, "Parâmetro deve ser maior que zero")
      .max(999_999, "Parâmetro acima do limite")
      .transform((valor) => Math.round(valor * 10_000) / 10_000)
      .nullable()
      .optional(),
    inicio_vigencia: esquemaData,
  })
  .superRefine((dados, contexto) => {
    const exigeParametro =
      dados.tipo_calculo === "percentual_salario" ||
      dados.tipo_calculo === "horas_adicional";
    if (exigeParametro && (dados.parametro === null || dados.parametro === undefined)) {
      contexto.addIssue({
        code: "custom",
        path: ["parametro"],
        message: "Este tipo de cálculo exige o parâmetro (fator ou percentual)",
      });
    }
  });

export type NovaVersaoRubrica = z.infer<typeof esquemaNovaVersaoRubrica>;

// ------------------------------------------------------------------ variáveis

export const ORIGENS_VARIAVEL = ["manual", "beneficio"] as const;

export type OrigemVariavel = (typeof ORIGENS_VARIAVEL)[number];

export const ROTULOS_ORIGEM_VARIAVEL: Record<OrigemVariavel, string> = {
  manual: "Manual",
  beneficio: "Benefício",
};

export const esquemaLancarVariavel = z
  .object({
    colaborador_id: z.number().int().positive(),
    rubrica_id: z.number().int().positive(),
    referencia: esquemaReferencia.optional(),
    valor: esquemaDinheiro.optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.referencia === undefined && dados.valor === undefined) {
      contexto.addIssue({
        code: "custom",
        message: "Informe a referência (horas/dias) ou o valor",
      });
    }
  });

export type LancarVariavel = z.infer<typeof esquemaLancarVariavel>;

// ------------------------------------------------------------------ tabelas legais

export const TIPOS_TABELA_LEGAL = ["inss", "irrf", "gerais"] as const;

export type TipoTabelaLegal = (typeof TIPOS_TABELA_LEGAL)[number];

export const ROTULOS_TABELA_LEGAL: Record<TipoTabelaLegal, string> = {
  inss: "Tabela INSS",
  irrf: "Tabela IRRF",
  gerais: "Parâmetros gerais",
};

export const esquemaNovaTabelaInss = z
  .object({
    faixas: z
      .array(
        z.object({
          ate: z
            .number()
            .gt(0)
            .max(9_999_999)
            .transform((valor) => Math.round(valor * 100) / 100),
          aliquota: z.number().gt(0).max(100),
        })
      )
      .min(1, "Informe ao menos uma faixa")
      .max(12),
    teto_contribuicao: esquemaDinheiro.refine((valor) => valor > 0, {
      message: "Teto deve ser maior que zero",
    }),
    inicio_vigencia: esquemaData,
  })
  .superRefine((dados, contexto) => {
    for (let indice = 1; indice < dados.faixas.length; indice += 1) {
      if (dados.faixas[indice].ate <= dados.faixas[indice - 1].ate) {
        contexto.addIssue({
          code: "custom",
          path: ["faixas"],
          message: "Faixas devem estar em ordem crescente de limite",
        });
        return;
      }
    }
    const ultima = dados.faixas[dados.faixas.length - 1];
    if (ultima.ate !== dados.teto_contribuicao) {
      contexto.addIssue({
        code: "custom",
        path: ["teto_contribuicao"],
        message: "A última faixa deve fechar exatamente no teto de contribuição",
      });
    }
  });

export type NovaTabelaInss = z.infer<typeof esquemaNovaTabelaInss>;

export const esquemaNovaTabelaIrrf = z
  .object({
    faixas: z
      .array(
        z.object({
          ate: z
            .number()
            .gt(0)
            .max(9_999_999)
            .transform((valor) => Math.round(valor * 100) / 100)
            .nullable(),
          aliquota: z.number().min(0).max(100),
          deducao: esquemaDinheiro,
        })
      )
      .min(1, "Informe ao menos uma faixa")
      .max(12),
    deducao_por_dependente: esquemaDinheiro,
    desconto_simplificado: esquemaDinheiro,
    inicio_vigencia: esquemaData,
  })
  .superRefine((dados, contexto) => {
    const ultima = dados.faixas[dados.faixas.length - 1];
    if (ultima.ate !== null) {
      contexto.addIssue({
        code: "custom",
        path: ["faixas"],
        message: "A última faixa deve ter limite aberto (sem teto)",
      });
      return;
    }
    for (let indice = 0; indice < dados.faixas.length - 1; indice += 1) {
      const atual = dados.faixas[indice].ate;
      const anterior = indice > 0 ? dados.faixas[indice - 1].ate : null;
      if (atual === null) {
        contexto.addIssue({
          code: "custom",
          path: ["faixas"],
          message: "Só a última faixa pode ter limite aberto",
        });
        return;
      }
      if (anterior !== null && atual <= anterior) {
        contexto.addIssue({
          code: "custom",
          path: ["faixas"],
          message: "Faixas devem estar em ordem crescente de limite",
        });
        return;
      }
    }
  });

export type NovaTabelaIrrf = z.infer<typeof esquemaNovaTabelaIrrf>;

export const esquemaNovosParametrosFolha = z.object({
  salario_minimo: esquemaDinheiro.refine((valor) => valor > 0, {
    message: "Salário mínimo deve ser maior que zero",
  }),
  aliquota_fgts: z.number().gt(0).max(100),
  inicio_vigencia: esquemaData,
});

export type NovosParametrosFolha = z.infer<typeof esquemaNovosParametrosFolha>;

// ------------------------------------------------------------------ suite de casos de teste

/** Entrada de rh_folha.caso_teste_folha (JSONB) — validada antes de ir ao motor. */
export const esquemaEntradaCasoTeste = z.object({
  salario: z.number().min(0).max(9_999_999),
  dependentes: z.number().int().min(0).max(99),
  variaveis: z
    .array(
      z.object({
        rubrica: z.string().trim().min(1),
        referencia: z.number().gt(0).optional(),
        valor: z.number().gt(0).optional(),
      })
    )
    .max(50),
});

export type EntradaCasoTeste = z.infer<typeof esquemaEntradaCasoTeste>;

export const esquemaSaidaCasoTeste = z.object({
  itens: z.record(z.string(), z.number()),
  liquido: z.number(),
});

export type SaidaCasoTeste = z.infer<typeof esquemaSaidaCasoTeste>;

// ------------------------------------------------------------------ formatação

export function formatarMoedaCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarMoedaReais(reais: number): string {
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
