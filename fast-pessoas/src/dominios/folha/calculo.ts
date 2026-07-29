// Motor de cálculo da folha — F1 (folha mensal ordinária). PURO: sem IO, sem
// banco, sem data — tudo que a conta precisa entra pela EntradaMotor e tudo
// que sai é explicável pela memória de cada item.
//
// REGRAS DE PRECISÃO (fixadas na 0013 e na bateria caso_teste_folha):
// • Dinheiro trafega em CENTAVOS INTEIROS na borda (entrada e saída).
// • Intermediários NÃO são arredondados: seguem como número em centavos
//   (frações de centavo permitidas durante a conta).
// • Arredondamento MEIO-PARA-CIMA (half-up) uma única vez, no valor final de
//   cada item. Percentuais são aplicados como razão inteira (÷ 10.000 de
//   pontos-base) para evitar ruído binário de ponto flutuante.
// • Item com valor zero não é gravado.
//
// REGRAS DE NEGÓCIO F1 (a saída esperada da bateria depende delas):
// • Hora normal = salário ÷ 220; HE = horas × fator × hora normal.
// • Falta = dias × (salário ÷ 30).
// • DSR sobre faltas: 1 dia de DSR por dia de falta (simplificação F1 fixada
//   na migração 0013 — a apuração exata semana a semana, Lei 605/49, chega em
//   F2 com o espelho de ponto).
// • Bases INSS/IRRF/FGTS = Σ proventos incidentes − Σ descontos incidentes,
//   sobre os valores JÁ arredondados dos itens.
// • INSS progressivo faixa a faixa, base limitada ao teto de contribuição.
// • IRRF: regime completo (base − INSS − dependentes × dedução) comparado ao
//   simplificado (base − desconto simplificado) — vale o imposto MENOR; a
//   memória registra os dois e qual venceu. O INSS deduzido é o VALOR FINAL
//   (arredondado) do item 2001.
// • FGTS = alíquota × base, sem teto — informativo, fora do líquido.

import {
  CODIGO_DSR_FALTAS,
  CODIGO_FALTAS,
  CODIGO_FGTS,
  CODIGO_INSS,
  CODIGO_IRRF,
  CODIGO_SALARIO_BASE,
  CODIGOS_AUTOMATICOS,
  NaturezaRubrica,
  OrigemVariavel,
  TipoCalculo,
} from "./esquemas";

// ------------------------------------------------------------------ contratos

export interface RubricaMotor {
  rubrica_versao_id: number;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  incide_inss: boolean;
  incide_irrf: boolean;
  incide_fgts: boolean;
  tipo_calculo: TipoCalculo;
  /** Fator do adicional (1.5, 2.0) ou percentual, conforme o tipo. */
  parametro: number | null;
}

export interface FaixaInssMotor {
  ate_centavos: number;
  aliquota: number; // percentual (7.5 = 7,5%)
}

export interface TabelaInssMotor {
  id: number;
  faixas: FaixaInssMotor[];
  teto_centavos: number;
}

export interface FaixaIrrfMotor {
  ate_centavos: number | null; // null = última faixa, sem teto
  aliquota: number;
  deducao_centavos: number;
}

export interface TabelaIrrfMotor {
  id: number;
  faixas: FaixaIrrfMotor[];
  deducao_dependente_centavos: number;
  desconto_simplificado_centavos: number;
}

export interface ParametrosFolhaMotor {
  id: number;
  aliquota_fgts: number; // percentual (8 = 8%)
}

export interface VariavelMotor {
  codigo: string;
  referencia: number | null; // horas ou dias
  valor_centavos: number | null;
  origem: OrigemVariavel;
}

export interface EntradaMotor {
  salario_base_centavos: number;
  dependentes_irrf: number;
  variaveis: VariavelMotor[];
  rubricas: RubricaMotor[];
  tabela_inss: TabelaInssMotor;
  tabela_irrf: TabelaIrrfMotor;
  parametros: ParametrosFolhaMotor;
}

export interface ItemMotor {
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  rubrica_versao_id: number;
  referencia: number | null;
  base_centavos: number | null;
  valor_centavos: number;
  memoria: Record<string, unknown>;
}

export interface ResultadoMotor {
  itens: ItemMotor[];
  total_proventos_centavos: number;
  total_descontos_centavos: number;
  liquido_centavos: number;
  base_inss_centavos: number;
  base_irrf_centavos: number;
  base_fgts_centavos: number;
}

/** Erro de dados de entrada do motor (rubrica ausente, variável inválida…). */
export class ErroMotor extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroMotor";
  }
}

// ------------------------------------------------------------------ aritmética

/**
 * Meio-para-cima no centavo. O epsilon (1e-6) só absorve o ruído binário das
 * divisões por 10^4: a menor distância real entre um intermediário e a
 * fronteira .5 é 10^-4 centavo, ordens de grandeza acima do epsilon.
 */
function arredondarCentavos(valor: number): number {
  return Math.floor(valor + 0.5 + 1e-6);
}

/** Percentual como razão inteira: centavos × (alíquota em pontos-base) ÷ 10⁴. */
function aplicarPercentual(centavos: number, aliquota: number): number {
  return (centavos * Math.round(aliquota * 100)) / 10_000;
}

function reais(centavos: number): number {
  return centavos / 100;
}

/** Intermediário sem arredondar, exposto na memória com 4 casas de real. */
function reaisIntermediario(centavos: number): number {
  return Math.round(centavos * 100) / 10_000;
}

// ------------------------------------------------------------------ motor

export function calcularFolha(entrada: EntradaMotor): ResultadoMotor {
  const porCodigo = new Map(
    entrada.rubricas.map((rubrica) => [rubrica.codigo, rubrica])
  );
  const rubricaObrigatoria = (codigo: string): RubricaMotor => {
    const rubrica = porCodigo.get(codigo);
    if (!rubrica) {
      throw new ErroMotor(
        `Rubrica ${codigo} sem versão vigente — confira o catálogo em Parâmetros`
      );
    }
    return rubrica;
  };

  const salario = entrada.salario_base_centavos;
  if (!Number.isInteger(salario) || salario < 0) {
    throw new ErroMotor("Salário base inválido (centavos inteiros ≥ 0)");
  }

  const itens: ItemMotor[] = [];
  const incluir = (
    rubrica: RubricaMotor,
    valorSemArredondar: number,
    referencia: number | null,
    base: number | null,
    memoria: Record<string, unknown>
  ): ItemMotor | null => {
    const valor = arredondarCentavos(valorSemArredondar);
    if (valor === 0) return null; // item com valor zero não é gravado
    const item: ItemMotor = {
      codigo: rubrica.codigo,
      nome: rubrica.nome,
      natureza: rubrica.natureza,
      rubrica_versao_id: rubrica.rubrica_versao_id,
      referencia,
      base_centavos: base,
      valor_centavos: valor,
      memoria: {
        ...memoria,
        valor_sem_arredondar: reaisIntermediario(valorSemArredondar),
        valor_final: reais(valor),
        arredondamento: "meio-para-cima no centavo, só no valor final",
      },
    };
    itens.push(item);
    return item;
  };

  // 1) Salário base ---------------------------------------------------------
  const rubricaSalario = rubricaObrigatoria(CODIGO_SALARIO_BASE);
  incluir(rubricaSalario, salario, null, salario, {
    formula: "salário contratual congelado da posição vigente",
  });

  // 2) Variáveis lançadas, agregadas por rubrica ----------------------------
  const grupos = new Map<string, VariavelMotor[]>();
  for (const variavel of entrada.variaveis) {
    const lista = grupos.get(variavel.codigo) ?? [];
    lista.push(variavel);
    grupos.set(variavel.codigo, lista);
  }

  let diasFalta = 0;
  for (const [codigo, variaveis] of grupos) {
    if (CODIGOS_AUTOMATICOS.includes(codigo)) {
      throw new ErroMotor(
        `Rubrica ${codigo} é automática — o motor a calcula sozinho`
      );
    }
    const rubrica = porCodigo.get(codigo);
    if (!rubrica) {
      throw new ErroMotor(
        `Rubrica ${codigo} sem versão vigente — confira o catálogo em Parâmetros`
      );
    }

    if (codigo === CODIGO_FALTAS) {
      // Falta = dias × (salário ÷ 30) — rubrica automática COM lançamento.
      const dias = variaveis.reduce(
        (soma, item) => soma + (item.referencia ?? 0),
        0
      );
      if (dias <= 0) {
        throw new ErroMotor("Falta exige referência em dias maior que zero");
      }
      diasFalta = dias;
      const valor = (salario * Math.round(dias * 100)) / (30 * 100);
      incluir(rubrica, valor, dias, salario, {
        formula: "dias × (salário ÷ 30)",
        dias,
        salario_dia: reaisIntermediario(salario / 30),
      });
      continue;
    }

    switch (rubrica.tipo_calculo) {
      case "horas_adicional": {
        const horas = variaveis.reduce(
          (soma, item) => soma + (item.referencia ?? 0),
          0
        );
        if (horas <= 0) {
          throw new ErroMotor(
            `Rubrica ${codigo} exige referência em horas maior que zero`
          );
        }
        const fator = rubrica.parametro;
        if (fator === null || fator <= 0) {
          throw new ErroMotor(
            `Rubrica ${codigo} sem fator na versão vigente — corrija em Parâmetros`
          );
        }
        // horas × fator × (salário ÷ 220), tudo como razão inteira.
        const valor =
          (salario * Math.round(horas * 100) * Math.round(fator * 10_000)) /
          (220 * 100 * 10_000);
        incluir(rubrica, valor, horas, salario, {
          formula: "horas × fator × (salário ÷ 220)",
          horas,
          fator,
          valor_hora: reaisIntermediario(salario / 220),
        });
        break;
      }
      case "percentual_salario": {
        const percentual = rubrica.parametro;
        if (percentual === null || percentual <= 0) {
          throw new ErroMotor(
            `Rubrica ${codigo} sem percentual na versão vigente — corrija em Parâmetros`
          );
        }
        // Uma aplicação por competência, independentemente de quantos lançamentos.
        const valor = aplicarPercentual(salario, percentual);
        incluir(rubrica, valor, percentual, salario, {
          formula: "salário × percentual",
          percentual,
        });
        break;
      }
      case "valor_informado": {
        const soma = variaveis.reduce(
          (total, item) => total + (item.valor_centavos ?? 0),
          0
        );
        if (soma <= 0) {
          throw new ErroMotor(
            `Rubrica ${codigo} exige valor informado maior que zero`
          );
        }
        incluir(rubrica, soma, null, null, {
          formula: "soma dos valores lançados",
          lancamentos: variaveis.map((item) => ({
            origem: item.origem,
            valor: reais(item.valor_centavos ?? 0),
          })),
        });
        break;
      }
      default:
        throw new ErroMotor(
          `Rubrica ${codigo} (${rubrica.tipo_calculo}) não aceita lançamento de variável`
        );
    }
  }

  // 3) DSR sobre faltas — 1 dia de DSR por dia de falta (F1) ---------------
  if (diasFalta > 0) {
    const rubricaDsr = rubricaObrigatoria(CODIGO_DSR_FALTAS);
    const valor = (salario * Math.round(diasFalta * 100)) / (30 * 100);
    incluir(rubricaDsr, valor, diasFalta, salario, {
      formula: "dias de falta × (salário ÷ 30) — 1 dia de DSR por dia de falta",
      regra_f1:
        "simplificação fixada na 0013; apuração exata semana a semana (Lei 605/49) é evolução F2",
      dias: diasFalta,
    });
  }

  // 4) Bases — sobre os valores finais dos itens ---------------------------
  const sinal = (natureza: NaturezaRubrica): number =>
    natureza === "provento" ? 1 : natureza === "desconto" ? -1 : 0;
  let baseInss = 0;
  let baseIrrf = 0;
  let baseFgts = 0;
  for (const item of itens) {
    const rubrica = porCodigo.get(item.codigo);
    if (!rubrica) continue;
    const fator = sinal(item.natureza);
    if (rubrica.incide_inss) baseInss += fator * item.valor_centavos;
    if (rubrica.incide_irrf) baseIrrf += fator * item.valor_centavos;
    if (rubrica.incide_fgts) baseFgts += fator * item.valor_centavos;
  }
  baseInss = Math.max(0, baseInss);
  baseIrrf = Math.max(0, baseIrrf);
  baseFgts = Math.max(0, baseFgts);

  // 5) INSS progressivo faixa a faixa, com teto ----------------------------
  const rubricaInss = rubricaObrigatoria(CODIGO_INSS);
  const tetoAplicado = baseInss > entrada.tabela_inss.teto_centavos;
  const baseInssLimitada = Math.min(baseInss, entrada.tabela_inss.teto_centavos);
  let inssSemArredondar = 0;
  const faixasPercorridas: Record<string, unknown>[] = [];
  let pisoAnterior = 0;
  for (const faixa of entrada.tabela_inss.faixas) {
    if (baseInssLimitada <= pisoAnterior) break;
    const tributavelNaFaixa =
      Math.min(baseInssLimitada, faixa.ate_centavos) - pisoAnterior;
    if (tributavelNaFaixa <= 0) {
      pisoAnterior = faixa.ate_centavos;
      continue;
    }
    const valorFaixa = aplicarPercentual(tributavelNaFaixa, faixa.aliquota);
    inssSemArredondar += valorFaixa;
    faixasPercorridas.push({
      ate: reais(faixa.ate_centavos),
      aliquota: faixa.aliquota,
      base_na_faixa: reais(tributavelNaFaixa),
      valor: reaisIntermediario(valorFaixa),
    });
    pisoAnterior = faixa.ate_centavos;
  }
  const itemInss = incluir(rubricaInss, inssSemArredondar, null, baseInssLimitada, {
    formula: "progressivo faixa a faixa sobre a base limitada ao teto",
    base_inss: reais(baseInss),
    teto_contribuicao: reais(entrada.tabela_inss.teto_centavos),
    teto_aplicado: tetoAplicado,
    faixas_percorridas: faixasPercorridas,
    tabela_inss_versao_id: entrada.tabela_inss.id,
  });
  const inssFinal = itemInss?.valor_centavos ?? 0;

  // 6) FGTS informativo — sem teto, fora do líquido ------------------------
  const rubricaFgts = rubricaObrigatoria(CODIGO_FGTS);
  incluir(
    rubricaFgts,
    aplicarPercentual(baseFgts, entrada.parametros.aliquota_fgts),
    null,
    baseFgts,
    {
      formula: "base FGTS × alíquota (informativo — não entra no líquido)",
      aliquota: entrada.parametros.aliquota_fgts,
      parametro_folha_versao_id: entrada.parametros.id,
    }
  );

  // 7) IRRF — vale o regime de imposto MENOR -------------------------------
  const rubricaIrrf = rubricaObrigatoria(CODIGO_IRRF);
  const deducaoDependentes =
    entrada.dependentes_irrf * entrada.tabela_irrf.deducao_dependente_centavos;
  const baseCompleto = Math.max(0, baseIrrf - inssFinal - deducaoDependentes);
  const baseSimplificado = Math.max(
    0,
    baseIrrf - entrada.tabela_irrf.desconto_simplificado_centavos
  );
  const impostoDaFaixa = (
    base: number
  ): { imposto: number; aliquota: number; deducao_centavos: number } => {
    for (const faixa of entrada.tabela_irrf.faixas) {
      if (faixa.ate_centavos === null || base <= faixa.ate_centavos) {
        return {
          imposto: Math.max(
            0,
            aplicarPercentual(base, faixa.aliquota) - faixa.deducao_centavos
          ),
          aliquota: faixa.aliquota,
          deducao_centavos: faixa.deducao_centavos,
        };
      }
    }
    throw new ErroMotor("Tabela IRRF sem faixa final aberta — corrija a versão");
  };
  const completo = impostoDaFaixa(baseCompleto);
  const simplificado = impostoDaFaixa(baseSimplificado);
  const venceuSimplificado = simplificado.imposto < completo.imposto;
  const vencedor = venceuSimplificado ? simplificado : completo;
  const baseVencedora = venceuSimplificado ? baseSimplificado : baseCompleto;
  incluir(rubricaIrrf, vencedor.imposto, null, baseVencedora, {
    formula: "base do regime vencedor × alíquota − parcela a deduzir",
    base_tributavel: reais(baseIrrf),
    regime_completo: {
      base: reais(baseCompleto),
      deducao_inss: reais(inssFinal),
      dependentes: entrada.dependentes_irrf,
      deducao_dependentes: reais(deducaoDependentes),
      imposto: reaisIntermediario(completo.imposto),
    },
    regime_simplificado: {
      base: reais(baseSimplificado),
      desconto_simplificado: reais(
        entrada.tabela_irrf.desconto_simplificado_centavos
      ),
      imposto: reaisIntermediario(simplificado.imposto),
    },
    regime_vencedor: venceuSimplificado ? "simplificado" : "completo",
    criterio: "vale o imposto MENOR entre os dois regimes",
    aliquota_aplicada: vencedor.aliquota,
    parcela_deduzir: reais(vencedor.deducao_centavos),
    tabela_irrf_versao_id: entrada.tabela_irrf.id,
  });

  // 8) Totais — informativa fica fora --------------------------------------
  let totalProventos = 0;
  let totalDescontos = 0;
  for (const item of itens) {
    if (item.natureza === "provento") totalProventos += item.valor_centavos;
    if (item.natureza === "desconto") totalDescontos += item.valor_centavos;
  }

  return {
    itens,
    total_proventos_centavos: totalProventos,
    total_descontos_centavos: totalDescontos,
    liquido_centavos: totalProventos - totalDescontos,
    base_inss_centavos: baseInss,
    base_irrf_centavos: baseIrrf,
    base_fgts_centavos: baseFgts,
  };
}
