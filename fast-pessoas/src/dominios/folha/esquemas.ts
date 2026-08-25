import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";

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

/**
 * A DATA DE REFERÊNCIA da competência: o ÚLTIMO DIA dela.
 *
 * É por esta data que o cálculo resolve TUDO que tem vigência — salário,
 * jornada, dependentes, versão de rubrica e as três tabelas legais. É a MESMA
 * régua que a view rh_folha.apropriacao_competencia (migração 0047) já usa para
 * decidir em que empresa/lotação/centro de custo o custo da linha cai:
 * `make_date(ano, mes, 1) + INTERVAL '1 month - 1 day'`.
 *
 * Sem ela o cálculo perguntava "quanto essa pessoa ganha HOJE" em vez de
 * "quanto ganhava NA competência": calcular julho em agosto pagava o salário de
 * agosto, e recalcular a mesma competência devolvia outro número só porque o
 * cadastro andou no meio do caminho. Competência é um MÊS, não "agora".
 */
export function dataReferenciaCompetencia(ano: number, mes: number): string {
  // Dia 0 do mês seguinte = último dia deste mês. UTC de propósito: é
  // aritmética de calendário, não instante — nada de fuso empurrando o dia.
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

export const esquemaAbrirCompetencia = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
});

export type AbrirCompetencia = z.infer<typeof esquemaAbrirCompetencia>;

// ------------------------------------------------------------------ trava retroativa (G3)
// Regra apresentada e aprovada na reunião de diretoria: "para frente, a
// qualquer momento; para trás, não". O limite é o MÊS CORRENTE em
// America/Sao_Paulo — o fuso de operação da empresa, não o do servidor.
// Fica no domínio (e é aplicada no serviço) de propósito: um CHECK não pode
// depender de now(), e um trigger de INSERT quebraria as competências
// históricas que o semeador da demo carrega de propósito (ver 0028).

/** Ano/mês corrente em America/Sao_Paulo — a "régua" da trava retroativa. */
export function competenciaCorrente(agora: Date = new Date()): {
  ano: number;
  mes: number;
} {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(agora)
    .split("-")
    .map(Number);
  return { ano, mes };
}

/** Ordena competências como um número só (ano×12 + mês) para comparar. */
function ordinalCompetencia(ano: number, mes: number): number {
  return ano * 12 + mes;
}

/** True quando (ano, mês) é anterior ao mês corrente — abrir é proibido. */
export function competenciaEhRetroativa(
  ano: number,
  mes: number,
  agora: Date = new Date()
): boolean {
  const atual = competenciaCorrente(agora);
  return (
    ordinalCompetencia(ano, mes) < ordinalCompetencia(atual.ano, atual.mes)
  );
}

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
export const CODIGO_HE_50 = "1101";
export const CODIGO_HE_100 = "1102";
export const CODIGO_ADICIONAL_NOTURNO = "1103";
export const CODIGO_FALTAS = "1201";
export const CODIGO_DSR_FALTAS = "1202";
export const CODIGO_INSS = "2001";
export const CODIGO_IRRF = "2002";
export const CODIGO_DESCONTO_BENEFICIO = "2101";
export const CODIGO_FGTS = "3001";

// Códigos do MOTOR DE FÉRIAS (calculo-ferias.ts). 0136/0137 são os códigos
// REAIS da folha da Fast (docs/18 §2b/§5 — planilha do Diego) e nascem na
// migração 0092; 1401 é o abono pecuniário da 0028 (o terço do abono vai na
// mesma rubrica — interpretação registrada lá, a conferir com o DP).
export const CODIGO_FERIAS = "0136";
export const CODIGO_ADICIONAL_FERIAS = "0137";
export const CODIGO_ABONO_PECUNIARIO = "1401";

// Códigos do MOTOR DE 13º (calculo-13.ts), migração 0094. 0138 é o código REAL
// da folha da Fast (docs/18 §2e — planilha do Diego); 1601/1602/2003/2004 são
// PLACEHOLDERS no esquema-exemplo da casa, porque a planilha não dá o código
// real inequívoco dessas verbas (pendência #17) — a adoção dos reais vai junto
// dos importadores, com as demais duplicatas (docs/18 §2a).
export const CODIGO_DECIMO = "0138";
export const CODIGO_ADIANTAMENTO_DECIMO = "1601";
export const CODIGO_DESCONTO_ADIANTAMENTO_DECIMO = "1602";
export const CODIGO_INSS_DECIMO = "2003";
export const CODIGO_IRRF_DECIMO = "2004";

// Códigos do MOTOR DE RESCISÃO (calculo-rescisao.ts), migração 0097. Os três
// são PLACEHOLDERS no esquema-exemplo da casa (1xxx remuneração), porque a
// planilha do Diego cita as verbas rescisórias num intervalo ambíguo
// ("0078/0002/0015", docs/18 §2e) — a adoção dos reais vai junto dos
// importadores, com as demais duplicatas (docs/18 §2a). As férias INDENIZADAS
// da rescisão saem pelas mesmas 0136/0137 (decisão registrada na 0092) e o 13º
// proporcional pelas 0138/1602/2003/2004 (0094, reuso do motor de 13º).
export const CODIGO_SALDO_SALARIO = "1701";
export const CODIGO_AVISO_INDENIZADO = "1702";
export const CODIGO_MULTA_FGTS = "1703";

/** Rubricas que o motor gera sozinho — lançar variável nelas é erro. */
export const CODIGOS_AUTOMATICOS: readonly string[] = [
  CODIGO_SALARIO_BASE,
  CODIGO_DSR_FALTAS,
  CODIGO_INSS,
  CODIGO_IRRF,
  CODIGO_FGTS,
];

/**
 * Rubricas que o sistema procura PELO CÓDIGO: as automáticas do motor mais as
 * que a importação do ponto (HE 50/100, adicional noturno, faltas) e o desconto
 * de benefício lançam sozinhas — e as do MOTOR DE FÉRIAS (calculo-ferias.ts),
 * que resolve 0136/0137/1401 pelo código, as do MOTOR DE 13º (calculo-13.ts),
 * que resolve 0138/1601/1602/2003/2004, e as do MOTOR DE RESCISÃO
 * (calculo-rescisao.ts), que resolve 1701/1702/1703. Encerrar qualquer uma
 * derruba o cálculo da competência inteira, a importação ou a prévia/folha de
 * férias, de 13º e de rescisão — o encerramento recusa, e a tela nem oferece o
 * botão.
 */
export const CODIGOS_DO_MOTOR: readonly string[] = [
  ...CODIGOS_AUTOMATICOS,
  CODIGO_HE_50,
  CODIGO_HE_100,
  CODIGO_ADICIONAL_NOTURNO,
  CODIGO_FALTAS,
  CODIGO_DESCONTO_BENEFICIO,
  CODIGO_FERIAS,
  CODIGO_ADICIONAL_FERIAS,
  CODIGO_ABONO_PECUNIARIO,
  CODIGO_DECIMO,
  CODIGO_ADIANTAMENTO_DECIMO,
  CODIGO_DESCONTO_ADIANTAMENTO_DECIMO,
  CODIGO_INSS_DECIMO,
  CODIGO_IRRF_DECIMO,
  CODIGO_SALDO_SALARIO,
  CODIGO_AVISO_INDENIZADO,
  CODIGO_MULTA_FGTS,
];

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

/**
 * Tipos de cálculo que uma rubrica NOVA pode ter. Os automáticos
 * ('automatico', 'salario_base') têm regra fixa no motor, amarrada ao código
 * do catálogo (0013) — rubrica nova com esse tipo nunca seria calculada nem
 * lançável, então a tela nem oferece.
 */
export const TIPOS_CALCULO_LANCAVEIS = [
  "valor_informado",
  "horas_adicional",
  "percentual_salario",
] as const;

export const esquemaNovaRubrica = z
  .object({
    codigo: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "Código deve ter exatamente 4 dígitos (ex.: 1305)"),
    nome: z
      .string()
      .trim()
      .min(2, "Informe o nome da rubrica")
      .max(80, "Nome acima do limite"),
    natureza: z.enum(NATUREZAS_RUBRICA),
    incide_inss: z.boolean(),
    incide_irrf: z.boolean(),
    incide_fgts: z.boolean(),
    tipo_calculo: z.enum(TIPOS_CALCULO_LANCAVEIS),
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

export type NovaRubrica = z.infer<typeof esquemaNovaRubrica>;

/**
 * ENCERRAMENTO de rubrica, por vigência — o único jeito de tirar do catálogo
 * uma rubrica criada por engano. Não existe DELETE: `rubrica_versao` é imutável
 * depois de encerrada (trigger rh.bloquear_versao_encerrada, 0002) e o item de
 * folha já calculado aponta para a VERSÃO, que precisa continuar existindo para
 * o holerite antigo continuar explicável. Encerrar dá fim de vigência à versão
 * ativa e tira a rubrica da lista de lançamento — o passado fica de pé.
 *
 * O motivo é obrigatório: quem abrir a trilha daqui a um ano precisa ler por
 * que a verba saiu do catálogo, não só que saiu.
 */
export const esquemaEncerrarRubrica = z.object({
  fim_vigencia: esquemaData,
  motivo: z
    .string({ error: "Informe o motivo do encerramento" })
    .trim()
    .min(5, "Diga por que a rubrica está sendo encerrada")
    .max(200, "Motivo acima do limite"),
});

export type EncerramentoRubrica = z.infer<typeof esquemaEncerrarRubrica>;

// ------------------------------------------------------------------ variáveis

// Origem é RASTREIO do insumo, não enfeite: é ela que permite reimportar sem
// duplicar (o serviço apaga só o lote da própria origem) e é ela que diz na
// tela se o número veio de um sistema ou da mão de alguém. 'ponto' entrou na
// migration 0032, junto com a ligação apuração → folha.
export const ORIGENS_VARIAVEL = ["manual", "beneficio", "ponto"] as const;

export type OrigemVariavel = (typeof ORIGENS_VARIAVEL)[number];

export const ROTULOS_ORIGEM_VARIAVEL: Record<OrigemVariavel, string> = {
  manual: "Manual",
  beneficio: "Benefício",
  ponto: "Ponto (apuração)",
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
  // Divisores da folha (0038). O horário anda em PAR com a carga semanal a que
  // se refere: 220 h é o divisor DE 44 h semanais (2640 min), e o divisor de
  // quem tem outra carga sai da proporção entre as duas.
  divisor_mensal_horas: z
    .number()
    .gt(0, "Divisor mensal de horas deve ser maior que zero")
    .max(744, "Divisor mensal de horas não cabe em um mês (máx. 744 h)"),
  carga_semanal_referencia_minutos: z
    .number()
    .int("Carga semanal de referência em minutos inteiros")
    .gt(0, "Carga semanal de referência deve ser maior que zero")
    .max(10_080, "Carga semanal de referência não cabe em uma semana"),
  divisor_mensal_dias: z
    .number()
    .gt(0, "Divisor mensal de dias deve ser maior que zero")
    .max(31, "Divisor mensal de dias não passa de 31"),
  inicio_vigencia: esquemaData,
});

export type NovosParametrosFolha = z.infer<typeof esquemaNovosParametrosFolha>;

// ------------------------------------------------------------------ OLAC — de-para conta contábil (E3:a)

/**
 * Conta contábil é TEXTO LIVRE de propósito: o plano de contas é da
 * contabilidade ("3.1.1.01.001"), não nosso — validar máscara aqui quebraria
 * no primeiro plano de contas diferente.
 */
export const esquemaNovaContaContabil = z.object({
  rubrica_id: z.number().int().positive(),
  conta_contabil: z
    .string({ error: "Informe a conta contábil" })
    .trim()
    .min(1, "Informe a conta contábil")
    .max(60, "Conta contábil acima do limite"),
  inicio_vigencia: esquemaData,
});

export type NovaContaContabil = z.infer<typeof esquemaNovaContaContabil>;

export const esquemaEncerrarContaContabil = z.object({
  fim_vigencia: esquemaData,
});

export type EncerrarContaContabil = z.infer<typeof esquemaEncerrarContaContabil>;

// ------------------------------------------------------------------ suite de casos de teste

/** Entrada de rh_folha.caso_teste_folha (JSONB) — validada antes de ir ao motor. */
export const esquemaEntradaCasoTeste = z.object({
  salario: z.number().min(0).max(9_999_999),
  dependentes: z.number().int().min(0).max(99),
  /**
   * Carga semanal da jornada do caso, em minutos — é ela que dá o divisor da
   * hora (0038). Ausente = caso sem jornada, que cai no divisor de referência
   * dos parâmetros; é o que todos os casos anteriores à 0038 querem dizer.
   */
  carga_semanal_minutos: z.number().int().gt(0).max(10_080).optional(),
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
