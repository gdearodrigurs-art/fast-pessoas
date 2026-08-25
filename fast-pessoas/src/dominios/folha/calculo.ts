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
// • Hora normal = salário ÷ divisor mensal de horas; HE = horas × fator × hora
//   normal. O divisor NÃO é do motor: vem dos parâmetros da folha e é
//   proporcional à carga semanal da jornada de quem está sendo calculado
//   (220 h para 44 h/semana, 180 para 36 h — ver a 0038).
// • Falta = dias × (salário ÷ divisor mensal de dias), 30 por padrão. Este não
//   depende de jornada: o salário mensal remunera o mês inteiro.
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
  CODIGO_DESCONTO_SUSPENSAO,
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
  /** Horas mensais da jornada de REFERÊNCIA (220 h para 44 h semanais). */
  divisor_mensal_horas: number;
  /** Carga semanal, em minutos, a que o divisor acima se refere (2640 = 44 h). */
  carga_semanal_referencia_minutos: number;
  /** Dias do mês para o salário-dia do mensalista (30). */
  divisor_mensal_dias: number;
}

export interface VariavelMotor {
  codigo: string;
  referencia: number | null; // horas ou dias
  valor_centavos: number | null;
  origem: OrigemVariavel;
}

/**
 * Uma suspensão disciplinar JÁ RECORTADA pela competência (D2:a, 0100). O
 * recorte de datas é do serviço (suspensao.ts, puro): o motor não conhece
 * calendário — recebe os dias que caem NESTE mês e os domingos de DSR
 * perdidos, e transforma em dinheiro com o divisor dos parâmetros.
 */
export interface SuspensaoMotor {
  /** rh.medida_disciplinar.id — vai à memória para a conta ser auditável. */
  medida_id: number;
  /** Janela completa da medida (informativo na memória). */
  inicio: string;
  fim: string | null;
  /** Dias corridos DENTRO da competência (inteiro ≥ 0). */
  dias_na_competencia: number;
  /** Domingos (ISO) desta competência cujo DSR a suspensão derruba. */
  domingos_dsr: string[];
}

export interface EntradaMotor {
  salario_base_centavos: number;
  dependentes_irrf: number;
  /**
   * Carga semanal, em MINUTOS, da jornada vigente do colaborador — é ela que
   * dá o divisor horário dele. NULL = sem escala cadastrada: cai no divisor de
   * referência dos parâmetros, e a memória do item registra que caiu.
   */
  carga_semanal_minutos: number | null;
  variaveis: VariavelMotor[];
  /**
   * Suspensões disciplinares com efeito NESTA competência (D2:a) — ausente ou
   * vazio = sem desconto. Quem recorta a janela pelo mês é o serviço.
   */
  suspensoes?: SuspensaoMotor[];
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

/**
 * Percentual como razão inteira: centavos × (alíquota em centésimos de ponto-base) ÷ 10⁶.
 *
 * Eram 10⁴, o que truncava a alíquota em DUAS casas — e a coluna, o zod e a tela guardam
 * QUATRO. Uma comissão de 8,3333% sobre R$ 3.000,00 era paga como 8,33%: R$ 249,90 em vez de
 * R$ 250,00. Dez centavos por competência, por pessoa, e o erro cresce com o salário — em
 * R$ 30.000,00 é um real. Quatro casas entravam, duas saíam.
 *
 * A razão inteira continua sendo o ponto: multiplicar primeiro e dividir depois mantém o
 * intermediário exato. Com centavos na casa do milhão e alíquota até 27,5%, o produto fica
 * ordens de grandeza abaixo de Number.MAX_SAFE_INTEGER.
 *
 * INSS, IRRF e FGTS passam por aqui. Como as alíquotas deles têm no máximo duas casas, o
 * resultado não muda — e é a bateria de tests/folha.test.ts que prova isso, não o argumento.
 */
function aplicarPercentual(centavos: number, aliquota: number): number {
  return (centavos * Math.round(aliquota * 10_000)) / 1_000_000;
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

  // DIVISORES (0038) — nenhum deles é constante do motor.
  //
  // O horário é proporcional à carga da jornada de quem está sendo calculado:
  // 220 h valem para 44 h semanais, então 36 h semanais valem 180. Com a carga
  // igual à de referência a divisão é exata (220 × 2640 ÷ 2640 = 220) e o
  // resultado é bit a bit o de antes da parametrização — quem tem 44 h não
  // sente a mudança, e é essa a garantia.
  const {
    divisor_mensal_horas: divisorReferencia,
    carga_semanal_referencia_minutos: cargaReferencia,
    divisor_mensal_dias: divisorDias,
  } = entrada.parametros;
  if (!(divisorReferencia > 0) || !(cargaReferencia > 0) || !(divisorDias > 0)) {
    throw new ErroMotor(
      "Divisores da folha inválidos na versão vigente dos parâmetros — corrija em Parâmetros"
    );
  }
  const cargaSemanal = entrada.carga_semanal_minutos;
  const divisorHoras =
    cargaSemanal === null
      ? divisorReferencia
      : (divisorReferencia * cargaSemanal) / cargaReferencia;
  if (!(divisorHoras > 0)) {
    throw new ErroMotor(
      "Carga semanal da jornada inválida — o divisor da hora sairia zero ou negativo"
    );
  }
  /** O que a memória de cálculo conta sobre a origem do divisor horário. */
  const origemDivisorHoras =
    cargaSemanal === null
      ? {
          divisor_horas: divisorHoras,
          origem_divisor:
            "sem jornada vigente — divisor de referência dos parâmetros da folha",
          parametro_folha_versao_id: entrada.parametros.id,
        }
      : {
          divisor_horas: divisorHoras,
          origem_divisor:
            `${divisorReferencia} h ÷ ${cargaReferencia} min de referência ` +
            `× ${cargaSemanal} min da jornada do colaborador`,
          carga_semanal_minutos: cargaSemanal,
          parametro_folha_versao_id: entrada.parametros.id,
        };
  const origemDivisorDias = {
    divisor_dias: divisorDias,
    origem_divisor: "dias do mês nos parâmetros da folha (não depende da jornada)",
    parametro_folha_versao_id: entrada.parametros.id,
  };

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
      // Falta = dias × salário-dia — rubrica automática COM lançamento.
      const dias = variaveis.reduce(
        (soma, item) => soma + (item.referencia ?? 0),
        0
      );
      if (dias <= 0) {
        throw new ErroMotor("Falta exige referência em dias maior que zero");
      }
      diasFalta = dias;
      const valor = (salario * Math.round(dias * 100)) / (divisorDias * 100);
      incluir(rubrica, valor, dias, salario, {
        formula: `dias × (salário ÷ ${divisorDias})`,
        dias,
        salario_dia: reaisIntermediario(salario / divisorDias),
        ...origemDivisorDias,
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
        // horas × fator × (salário ÷ divisor horário); horas e fator entram
        // como razão inteira, o divisor entra pronto (ver o bloco dos divisores).
        const valor =
          (salario * Math.round(horas * 100) * Math.round(fator * 10_000)) /
          (divisorHoras * 100 * 10_000);
        incluir(rubrica, valor, horas, salario, {
          formula: `horas × fator × (salário ÷ ${divisorHoras})`,
          horas,
          fator,
          valor_hora: reaisIntermediario(salario / divisorHoras),
          ...origemDivisorHoras,
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
    const valor = (salario * Math.round(diasFalta * 100)) / (divisorDias * 100);
    incluir(rubricaDsr, valor, diasFalta, salario, {
      formula: `dias de falta × (salário ÷ ${divisorDias}) — 1 dia de DSR por dia de falta`,
      regra_f1:
        "simplificação fixada na 0013; apuração exata semana a semana (Lei 605/49) é evolução F2",
      dias: diasFalta,
      ...origemDivisorDias,
    });
  }

  // 3b) Suspensão disciplinar (D2:a, 0100) ---------------------------------
  // Dias corridos da janela no mês + 1 valor-dia de DSR por semana civil com
  // suspensão — NA MESMA rubrica (1203), com a memória abrindo as duas
  // parcelas. NÃO reusa a mecânica do DSR de faltas (1202): aquela é a
  // simplificação F1 "1 DSR por dia", presa ao lançamento de faltas, e
  // superdescontaria uma suspensão de 5 dias na mesma semana em 5 DSRs.
  const suspensoes = entrada.suspensoes ?? [];
  let diasSuspensao = 0;
  let semanasDsrSuspensao = 0;
  for (const suspensao of suspensoes) {
    if (
      !Number.isInteger(suspensao.dias_na_competencia) ||
      suspensao.dias_na_competencia < 0
    ) {
      throw new ErroMotor(
        `Suspensão ${suspensao.medida_id} com dias inválidos na competência (inteiro ≥ 0)`
      );
    }
    diasSuspensao += suspensao.dias_na_competencia;
    semanasDsrSuspensao += suspensao.domingos_dsr.length;
  }
  if (diasSuspensao + semanasDsrSuspensao > 0) {
    const rubricaSuspensao = rubricaObrigatoria(CODIGO_DESCONTO_SUSPENSAO);
    const diasDescontados = diasSuspensao + semanasDsrSuspensao;
    // Dias aqui são INTEIROS (corridos + domingos): a razão inteira da falta
    // (× 100 ÷ 100) seria identidade — a divisão única já é exata até o limite.
    const valor = (salario * diasDescontados) / divisorDias;
    incluir(rubricaSuspensao, valor, diasDescontados, salario, {
      formula: `(dias corridos + 1 dia de DSR por semana civil com suspensão) × (salário ÷ ${divisorDias})`,
      dias_corridos: diasSuspensao,
      semanas_com_dsr_perdido: semanasDsrSuspensao,
      valor_dia: reaisIntermediario(salario / divisorDias),
      medidas: suspensoes.map((suspensao) => ({
        medida_disciplinar_id: suspensao.medida_id,
        janela: `${suspensao.inicio} → ${suspensao.fim ?? "aberta"}`,
        dias_na_competencia: suspensao.dias_na_competencia,
        domingos_dsr: suspensao.domingos_dsr,
      })),
      regra_dsr:
        "DSR da semana civil da suspensão (Lei 605/49, molde da falta injustificada), atribuído à competência do domingo — REGRA A CONFIRMAR com o contador (decisão D2:a, aviso registrado)",
      ...origemDivisorDias,
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
