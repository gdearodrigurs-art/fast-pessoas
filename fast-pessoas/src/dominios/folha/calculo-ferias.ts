// Motor de cálculo de FÉRIAS — 1º estágio da lane Folha (frente 1.6). PURO:
// sem IO, sem banco, sem data — tudo que a conta precisa entra pela
// EntradaMotorFerias e tudo que sai é explicável pela memória de cada item.
//
// MOLDE: folha/calculo.ts (motor mensal F1). As regras de precisão são as
// MESMAS, copiadas de lá porque são a regra da casa (0013 + bateria
// caso_teste_folha):
// • Dinheiro trafega em CENTAVOS INTEIROS na borda (entrada e saída).
// • Intermediários NÃO são arredondados: seguem como número em centavos
//   (frações de centavo permitidas durante a conta).
// • Arredondamento MEIO-PARA-CIMA (half-up) uma única vez, no valor final de
//   cada item. Percentuais são aplicados como razão inteira para evitar ruído
//   binário de ponto flutuante; o terço constitucional é divisão exata por 3
//   sobre o intermediário, nunca 33,33%.
// • Item com valor zero não é gravado.
//
// REGRAS DE NEGÓCIO DO MOTOR DE FÉRIAS:
// • Remuneração-base = salário vigente na data + MÉDIA MENSAL de variáveis.
//   Enquanto os importadores de variáveis não existem, a média entra como
//   parâmetro opcional (ausente/0 = sem médias) e a memória carrega o AVISO
//   explícito ("médias não disponíveis — importadores pendentes").
// • Valor-dia = remuneração-base ÷ divisor mensal de dias (30 nos parâmetros
//   da folha — o divisor NÃO é do motor, vem do banco, eixo 5/9).
// • Férias (0136) = dias de gozo × valor-dia; proporcionalidade é pelos dias.
// • Terço constitucional (0137, CF art. 7º XVII) = férias ÷ 3.
// • Abono pecuniário (1401, art. 143 CLT) = dias de abono × valor-dia + 1/3
//   sobre o abono — o terço do abono vai NA MESMA rubrica, interpretação
//   registrada na migração 0028 (a conferir com o DP; separar é rubrica 1402).
// • TRIBUTAÇÃO — regra do Diego (docs/18 §5): férias só incidem quando são
//   GOZADAS. Gozadas: 0136/0137 entram nas bases de INSS e IRRF conforme as
//   incidências da versão vigente da rubrica. INDENIZADAS: verba indenizatória
//   (Súmula 386 STJ) — nada entra em base nenhuma, e a memória diz por quê.
//   O abono pecuniário NUNCA incide (Lei 8.212/91 art. 28 §9º "e" 6;
//   IN RFB 1.500/2014 art. 11), em qualquer modalidade.
// • INSS progressivo faixa a faixa com teto e IRRF completo × simplificado
//   (vale o imposto MENOR) — a MESMA mecânica e as MESMAS tabelas vigentes que
//   o motor mensal recebe. A prévia apura sobre a base de férias ISOLADA; na
//   competência, férias somam com o salário do mês — o aviso vai na saída.
// • FGTS fica FORA desta prévia (escopo 1.6 é INSS/IRRF); entra quando as
//   férias integrarem a competência.

import {
  ErroMotor,
  ItemMotor,
  ParametrosFolhaMotor,
  RubricaMotor,
  TabelaInssMotor,
  TabelaIrrfMotor,
} from "./calculo";
import {
  CODIGO_ABONO_PECUNIARIO,
  CODIGO_ADICIONAL_FERIAS,
  CODIGO_FERIAS,
  CODIGO_INSS,
  CODIGO_IRRF,
} from "./esquemas";
import {
  ABONO_DIAS_MAXIMO,
  ABONO_DIAS_MINIMO,
  DIAS_GOZO_MAXIMO,
  DIAS_GOZO_MINIMO,
} from "../ferias/esquemas";

// ------------------------------------------------------------------ contratos

/**
 * GOZADAS × INDENIZADAS — a distinção que decide a tributação (docs/18 §5,
 * regra do Diego). A prévia de programação é sempre "gozadas"; "indenizadas"
 * existe no contrato para a rescisão usar o MESMO motor quando chegar a vez.
 */
export type ModalidadeFerias = "gozadas" | "indenizadas";

export interface EntradaMotorFerias {
  modalidade: ModalidadeFerias;
  /** Salário vigente na data de referência, em centavos inteiros. */
  salario_base_centavos: number;
  dependentes_irrf: number;
  /** Dias de gozo (art. 130/134: 5–30). */
  dias_gozo: number;
  /** Dias vendidos como abono pecuniário (art. 143: 0–10). */
  dias_abono: number;
  /**
   * MÉDIA MENSAL de variáveis (comissões, HE…), em centavos inteiros.
   * null/ausente = importadores pendentes: entra 0 e a memória avisa.
   */
  media_variaveis_centavos?: number | null;
  rubricas: RubricaMotor[];
  tabela_inss: TabelaInssMotor;
  tabela_irrf: TabelaIrrfMotor;
  parametros: ParametrosFolhaMotor;
}

export interface ResultadoMotorFerias {
  itens: ItemMotor[];
  /** Avisos de escopo — a tela e a API os mostram junto do resultado. */
  avisos: string[];
  total_proventos_centavos: number;
  total_descontos_centavos: number;
  liquido_centavos: number;
  base_inss_centavos: number;
  base_irrf_centavos: number;
}

export const AVISO_MEDIAS_PENDENTES =
  "médias não disponíveis — importadores pendentes: prévia calculada sem médias de variáveis (comissões, horas extras)";

export const AVISO_PREVIA_ISOLADA =
  "prévia isolada da programação: INSS e IRRF apurados sobre as verbas de férias sozinhas — na competência, a base soma com o salário do mês";

// ------------------------------------------------------------------ aritmética
// Cópia fiel de folha/calculo.ts — é a regra de precisão da casa. As funções
// são privadas lá de propósito (cada motor carrega a própria cópia auditável).

/**
 * Meio-para-cima no centavo. O epsilon (1e-6) só absorve o ruído binário das
 * divisões: a menor distância real entre um intermediário e a fronteira .5 é
 * ordens de grandeza acima do epsilon.
 */
function arredondarCentavos(valor: number): number {
  return Math.floor(valor + 0.5 + 1e-6);
}

/** Percentual como razão inteira: centavos × (alíquota × 10⁴) ÷ 10⁶. */
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

export function calcularFerias(
  entrada: EntradaMotorFerias
): ResultadoMotorFerias {
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

  // ---- validação da borda: centavo inteiro e limites da CLT ---------------
  const salario = entrada.salario_base_centavos;
  if (!Number.isInteger(salario) || salario < 0) {
    throw new ErroMotor("Salário base inválido (centavos inteiros ≥ 0)");
  }
  const media = entrada.media_variaveis_centavos ?? null;
  if (media !== null && (!Number.isInteger(media) || media < 0)) {
    throw new ErroMotor(
      "Média de variáveis inválida (centavos inteiros ≥ 0, ou ausente)"
    );
  }
  const diasGozo = entrada.dias_gozo;
  if (
    !Number.isInteger(diasGozo) ||
    diasGozo < DIAS_GOZO_MINIMO ||
    diasGozo > DIAS_GOZO_MAXIMO
  ) {
    throw new ErroMotor(
      `Dias de gozo inválidos: ${diasGozo} — o gozo vai de ${DIAS_GOZO_MINIMO} (art. 134 §1º) a ${DIAS_GOZO_MAXIMO} dias (art. 130)`
    );
  }
  const diasAbono = entrada.dias_abono;
  if (
    !Number.isInteger(diasAbono) ||
    diasAbono < ABONO_DIAS_MINIMO ||
    diasAbono > ABONO_DIAS_MAXIMO
  ) {
    throw new ErroMotor(
      `Dias de abono inválidos: ${diasAbono} — o abono pecuniário vai de ${ABONO_DIAS_MINIMO} a ${ABONO_DIAS_MAXIMO} dias (art. 143)`
    );
  }
  if (entrada.modalidade === "indenizadas" && diasAbono > 0) {
    throw new ErroMotor(
      "Abono pecuniário é da programação de gozo — férias indenizadas não têm abono"
    );
  }
  const divisorDias = entrada.parametros.divisor_mensal_dias;
  if (!(divisorDias > 0)) {
    throw new ErroMotor(
      "Divisor mensal de dias inválido na versão vigente dos parâmetros — corrija em Parâmetros"
    );
  }

  const gozadas = entrada.modalidade === "gozadas";
  const avisos: string[] = [];

  // ---- remuneração-base: salário + média mensal de variáveis --------------
  const mediaAplicada = media ?? 0;
  const remuneracaoBase = salario + mediaAplicada;
  if (mediaAplicada === 0) avisos.push(AVISO_MEDIAS_PENDENTES);
  const memoriaMedias =
    mediaAplicada === 0
      ? { media_variaveis: 0, aviso_medias: AVISO_MEDIAS_PENDENTES }
      : {
          media_variaveis: reais(mediaAplicada),
          origem_media:
            "média mensal de variáveis informada pelo chamador (importadores pendentes)",
        };
  const memoriaTributacao = gozadas
    ? {
        tributacao:
          "férias GOZADAS: incidem INSS/IRRF conforme a versão vigente da rubrica (regra do Diego, docs/18 §5)",
      }
    : {
        tributacao:
          "férias INDENIZADAS: verba indenizatória (Súmula 386 STJ) — não entra em base de INSS nem de IRRF",
      };
  const memoriaDivisor = {
    divisor_dias: divisorDias,
    origem_divisor:
      "dias do mês nos parâmetros da folha (não depende da jornada)",
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

  // 1) Férias (0136) — dias de gozo × valor-dia -----------------------------
  const rubricaFerias = rubricaObrigatoria(CODIGO_FERIAS);
  // Razão inteira: remuneração × dias ÷ divisor, sem arredondar o valor-dia.
  const feriasSemArredondar =
    (remuneracaoBase * Math.round(diasGozo * 100)) / (divisorDias * 100);
  const itemFerias = incluir(
    rubricaFerias,
    feriasSemArredondar,
    diasGozo,
    remuneracaoBase,
    {
      formula: `dias de gozo × ((salário + média) ÷ ${divisorDias})`,
      modalidade: entrada.modalidade,
      dias_gozo: diasGozo,
      salario_base: reais(salario),
      remuneracao_base: reais(remuneracaoBase),
      valor_dia: reaisIntermediario(remuneracaoBase / divisorDias),
      ...memoriaMedias,
      ...memoriaTributacao,
      ...memoriaDivisor,
    }
  );

  // 2) Terço constitucional (0137) — férias ÷ 3 -----------------------------
  const rubricaTerco = rubricaObrigatoria(CODIGO_ADICIONAL_FERIAS);
  const tercoSemArredondar = feriasSemArredondar / 3;
  incluir(
    rubricaTerco,
    tercoSemArredondar,
    null,
    itemFerias?.valor_centavos ?? 0,
    {
      formula: "férias ÷ 3 (CF art. 7º, XVII)",
      modalidade: entrada.modalidade,
      ferias_sem_arredondar: reaisIntermediario(feriasSemArredondar),
      regra: "o terço é calculado sobre o valor SEM arredondar das férias",
      ...memoriaTributacao,
    }
  );

  // 3) Abono pecuniário (1401) — dias vendidos × valor-dia + 1/3 ------------
  if (diasAbono > 0) {
    const rubricaAbono = rubricaObrigatoria(CODIGO_ABONO_PECUNIARIO);
    const abonoBase =
      (remuneracaoBase * Math.round(diasAbono * 100)) / (divisorDias * 100);
    const tercoAbono = abonoBase / 3;
    incluir(
      rubricaAbono,
      abonoBase + tercoAbono,
      diasAbono,
      remuneracaoBase,
      {
        formula: `dias de abono × ((salário + média) ÷ ${divisorDias}) + 1/3 sobre o abono`,
        dias_abono: diasAbono,
        abono_sem_terco: reaisIntermediario(abonoBase),
        terco_sobre_abono: reaisIntermediario(tercoAbono),
        regra_terco:
          "terço do abono NA MESMA rubrica — interpretação registrada na 0028, a conferir com o DP",
        tributacao:
          "abono pecuniário NÃO incide: Lei 8.212/91 art. 28 §9º 'e' 6 (INSS), IN RFB 1.500/2014 art. 11 (IRRF)",
        ...memoriaMedias,
        ...memoriaDivisor,
      }
    );
  }

  // 4) Bases — só férias GOZADAS entram, e pelas incidências da rubrica -----
  // Dupla trava de propósito: a modalidade decide se ALGO entra (verba
  // indenizatória fica fora por regra do motor) e a versão vigente da rubrica
  // decide EM QUAL base entra (nada de incidência inventada no código).
  let baseInss = 0;
  let baseIrrf = 0;
  if (gozadas) {
    for (const item of itens) {
      if (item.codigo === CODIGO_ABONO_PECUNIARIO) continue; // indenizatório sempre
      const rubrica = porCodigo.get(item.codigo);
      if (!rubrica || item.natureza !== "provento") continue;
      if (rubrica.incide_inss) baseInss += item.valor_centavos;
      if (rubrica.incide_irrf) baseIrrf += item.valor_centavos;
    }
    // Só faz sentido avisar quando HÁ tributo apurado em separado.
    avisos.push(AVISO_PREVIA_ISOLADA);
  }

  // 5) INSS progressivo faixa a faixa, com teto -----------------------------
  let inssFinal = 0;
  if (baseInss > 0) {
    const rubricaInss = rubricaObrigatoria(CODIGO_INSS);
    const tetoAplicado = baseInss > entrada.tabela_inss.teto_centavos;
    const baseInssLimitada = Math.min(
      baseInss,
      entrada.tabela_inss.teto_centavos
    );
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
    const itemInss = incluir(
      rubricaInss,
      inssSemArredondar,
      null,
      baseInssLimitada,
      {
        formula:
          "progressivo faixa a faixa sobre a base de férias limitada ao teto",
        escopo: AVISO_PREVIA_ISOLADA,
        base_inss: reais(baseInss),
        teto_contribuicao: reais(entrada.tabela_inss.teto_centavos),
        teto_aplicado: tetoAplicado,
        faixas_percorridas: faixasPercorridas,
        tabela_inss_versao_id: entrada.tabela_inss.id,
      }
    );
    inssFinal = itemInss?.valor_centavos ?? 0;
  }

  // 6) IRRF — vale o regime de imposto MENOR (mesma mecânica do mensal) -----
  if (baseIrrf > 0) {
    const rubricaIrrf = rubricaObrigatoria(CODIGO_IRRF);
    const deducaoDependentes =
      entrada.dependentes_irrf *
      entrada.tabela_irrf.deducao_dependente_centavos;
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
      escopo: AVISO_PREVIA_ISOLADA,
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
  }

  // 7) Totais ---------------------------------------------------------------
  let totalProventos = 0;
  let totalDescontos = 0;
  for (const item of itens) {
    if (item.natureza === "provento") totalProventos += item.valor_centavos;
    if (item.natureza === "desconto") totalDescontos += item.valor_centavos;
  }

  return {
    itens,
    avisos,
    total_proventos_centavos: totalProventos,
    total_descontos_centavos: totalDescontos,
    liquido_centavos: totalProventos - totalDescontos,
    base_inss_centavos: baseInss,
    base_irrf_centavos: baseIrrf,
  };
}
