// Motor de cálculo de 13º SALÁRIO — 2º estágio da lane Folha (onda 2). PURO:
// sem IO, sem banco, sem relógio — tudo que a conta precisa entra pela
// EntradaMotorDecimo e tudo que sai é explicável pela memória de cada item.
//
// MOLDE: folha/calculo-ferias.ts (que por sua vez molda calculo.ts). As regras
// de precisão são as MESMAS, copiadas porque são a regra da casa (0013 +
// bateria caso_teste_folha):
// • Dinheiro trafega em CENTAVOS INTEIROS na borda (entrada e saída).
// • Intermediários NÃO são arredondados: seguem como número em centavos
//   (frações de centavo permitidas durante a conta).
// • Arredondamento MEIO-PARA-CIMA (half-up) uma única vez, no valor final de
//   cada item. O duodécimo é divisão exata por 12 sobre o intermediário
//   (avos inteiros × remuneração ÷ 12), nunca 8,3333%.
// • Item com valor zero não é gravado.
//
// REGRAS DE NEGÓCIO DO MOTOR DE 13º:
// • 13º = 1/12 da remuneração-base por MÊS TRABALHADO no ano; mês conta com
//   15 dias ou mais de vínculo (Lei 4.090/62, art. 1º §1º). Remuneração-base =
//   salário vigente na data da parcela + MÉDIA MENSAL de variáveis (parâmetro
//   opcional enquanto os importadores não existem — ausente = 0 + aviso, o
//   mesmo desenho do motor de férias).
// • AVOS PROJETADOS ATÉ 31/12: o vínculo é assumido ativo o ano inteiro —
//   desligamento NÃO é escopo deste motor (o 13º de rescisão é do motor de
//   rescisão, estágio 3), e a saída avisa a projeção. Afastamento sem
//   remuneração só reduz avos se vier como parâmetro (default: não reduz +
//   aviso) — o motor não tem como adivinhar o dado.
// • DUAS PARCELAS (Lei 4.749/65):
//   1ª (adiantamento, até 30/11) = METADE do 13º proporcional, SEM desconto
//     (art. 2º): INSS e IRRF do 13º incidem inteiros na quitação. Bases zero.
//   2ª (quitação, até 20/12) = 13º INTEGRAL (0138) MENOS o adiantamento
//     (1602), com INSS sobre o 13º TOTAL (apuração EM SEPARADO, Lei 8.212/91
//     art. 28 §7º — mesma tabela progressiva vigente, mesmo teto) e IRRF
//     EXCLUSIVO na fonte sobre o 13º total (RIR/2018 art. 700 — regime
//     próprio: usa a mecânica completo × simplificado do mensal, vale o
//     imposto MENOR, e a saída REGISTRA que é tributação exclusiva; a
//     aplicação do desconto simplificado ao 13º é interpretação conservadora
//     registrada na pendência #17).
// • O desconto do adiantamento na 2ª parcela é RECALCULADO como metade do 13º
//   da data da 2ª parcela, a menos que o valor efetivamente pago venha como
//   parâmetro (adiantamento_pago_centavos) — se o salário mudou entre as
//   parcelas os dois números divergem, e a saída avisa (pendência #17).
// • Data de referência das vigências (salário/tabelas/rubricas): a data da
//   PARCELA calculada — quem resolve é o serviço; o motor recebe tudo pronto.
// • FGTS fica FORA desta prévia (escopo da onda é INSS/IRRF); a flag da 0094
//   registra que incide, para quando o 13º integrar a competência.

import {
  ErroMotor,
  ItemMotor,
  RubricaMotor,
  TabelaInssMotor,
  TabelaIrrfMotor,
} from "./calculo";
import {
  CODIGO_ADIANTAMENTO_DECIMO,
  CODIGO_DECIMO,
  CODIGO_DESCONTO_ADIANTAMENTO_DECIMO,
  CODIGO_INSS_DECIMO,
  CODIGO_IRRF_DECIMO,
} from "./esquemas";

// ------------------------------------------------------------------ contratos

export type ParcelaDecimo = 1 | 2;

/** Mês conta como avo com 15 dias ou mais de vínculo (Lei 4.090/62 art. 1º §1º). */
export const DIAS_MINIMOS_AVO = 15;

export interface EntradaMotorDecimo {
  /** Ano-calendário do 13º (Lei 4.090/62: janeiro a dezembro). */
  ano: number;
  parcela: ParcelaDecimo;
  /** Data de admissão do vínculo, AAAA-MM-DD — é ela que dá os avos. */
  data_admissao: string;
  /** Salário vigente na data da parcela, em centavos inteiros. */
  salario_base_centavos: number;
  dependentes_irrf: number;
  /**
   * MÉDIA MENSAL de variáveis (comissões, HE…), em centavos inteiros.
   * null/ausente = importadores pendentes: entra 0 e a saída avisa.
   */
  media_variaveis_centavos?: number | null;
  /**
   * Avos PERDIDOS por afastamento sem remuneração no ano. null/ausente =
   * dado não disponível: nenhum avo é reduzido e a saída avisa.
   */
  avos_afastamento?: number | null;
  /**
   * Só na 2ª parcela: o valor EFETIVAMENTE PAGO no adiantamento, em centavos
   * inteiros. null/ausente = o motor deduz a metade do 13º recalculado na
   * data da 2ª parcela, com aviso — se o salário mudou entre as parcelas,
   * informe o pago para a quitação fechar no centavo.
   */
  adiantamento_pago_centavos?: number | null;
  rubricas: RubricaMotor[];
  tabela_inss: TabelaInssMotor;
  tabela_irrf: TabelaIrrfMotor;
}

/** Um mês do ano na conta de avos — a memória mostra os doze. */
export interface AvoDetalhe {
  mes: number;
  dias_de_vinculo: number;
  conta: boolean;
}

export interface ResultadoMotorDecimo {
  itens: ItemMotor[];
  /** Avisos de escopo — a tela e a API os mostram junto do resultado. */
  avisos: string[];
  /** Avos efetivos (meses com ≥ 15 dias de vínculo − avos de afastamento). */
  avos: number;
  avos_detalhe: AvoDetalhe[];
  /** 13º proporcional do ano inteiro, arredondado — o valor da rubrica 0138. */
  decimo_integral_centavos: number;
  total_proventos_centavos: number;
  total_descontos_centavos: number;
  liquido_centavos: number;
  base_inss_centavos: number;
  base_irrf_centavos: number;
}

export const AVISO_MEDIAS_PENDENTES_DECIMO =
  "médias não disponíveis — importadores pendentes: prévia calculada sem médias de variáveis (comissões, horas extras)";

export const AVISO_AVOS_PROJETADOS =
  "avos projetados até 31/12 assumindo o vínculo ativo o ano inteiro — o 13º proporcional de quem desliga é do motor de rescisão (estágio 3)";

export const AVISO_AFASTAMENTO_NAO_CONSIDERADO =
  "afastamentos sem remuneração não considerados — os avos só são reduzidos quando informados na entrada (dado ainda não disponível ao motor)";

export const AVISO_ADIANTAMENTO_SEM_DESCONTO =
  "1ª parcela (adiantamento, até 30/11) sem desconto: INSS e IRRF do 13º incidem inteiros na 2ª parcela, sobre o 13º total (Lei 4.749/65, art. 2º)";

export const AVISO_TRIBUTACAO_EXCLUSIVA =
  "13º tem tributação EXCLUSIVA, apurada em separado do salário do mês: INSS sobre o 13º total pela tabela progressiva vigente (Lei 8.212/91, art. 28 §7º) e IRRF exclusivo na fonte (RIR/2018, art. 700) — nada desta prévia soma com a base da competência mensal";

export const AVISO_IRRF_REGIME_DECIMO =
  "IRRF do 13º apurado na mecânica completo × simplificado do mensal (vale o imposto MENOR) — a aplicação do desconto simplificado ao 13º é interpretação conservadora registrada na pendência #17";

export const AVISO_ADIANTAMENTO_RECALCULADO =
  "adiantamento deduzido como metade do 13º recalculado na data da 2ª parcela — se o valor pago na 1ª parcela foi outro (salário mudou entre as parcelas), informe o pago para a quitação fechar no centavo (pendência #17)";

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

// ------------------------------------------------------------------ calendário
// Aritmética de calendário em UTC de propósito (o mesmo desenho de
// dataReferenciaCompetencia): é conta de dias civis, não instante — nada de
// fuso empurrando o dia.

/** Data civil real (recusa 2026-02-30) — a trava ida-e-volta de lib/data-civil. */
function dataCivilValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return (
    !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
  );
}

function diasNoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte = último dia deste mês.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Os doze meses do ano com os dias de vínculo de cada um, projetando o vínculo
 * ativo até 31/12 (desligamento não é escopo — ver cabeçalho). Mês conta como
 * avo com DIAS_MINIMOS_AVO ou mais (Lei 4.090/62, art. 1º §1º).
 */
function detalharAvos(ano: number, dataAdmissao: string): AvoDetalhe[] {
  const anoAdmissao = Number(dataAdmissao.slice(0, 4));
  const mesAdmissao = Number(dataAdmissao.slice(5, 7));
  const diaAdmissao = Number(dataAdmissao.slice(8, 10));
  const detalhe: AvoDetalhe[] = [];
  for (let mes = 1; mes <= 12; mes += 1) {
    const diasDoMes = diasNoMes(ano, mes);
    let dias: number;
    if (anoAdmissao < ano) {
      dias = diasDoMes; // vínculo desde antes do ano: mês inteiro
    } else if (mes < mesAdmissao) {
      dias = 0; // antes da admissão
    } else if (mes === mesAdmissao) {
      dias = diasDoMes - diaAdmissao + 1; // do dia da admissão ao fim do mês
    } else {
      dias = diasDoMes; // depois do mês da admissão
    }
    detalhe.push({
      mes,
      dias_de_vinculo: dias,
      conta: dias >= DIAS_MINIMOS_AVO,
    });
  }
  return detalhe;
}

// ------------------------------------------------------------------ motor

export function calcularDecimo(
  entrada: EntradaMotorDecimo
): ResultadoMotorDecimo {
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

  // ---- validação da borda: centavo inteiro, ano, parcela e admissão --------
  const { ano, parcela } = entrada;
  if (!Number.isInteger(ano) || ano < 1962 || ano > 9999) {
    // 1962 é o ano da Lei 4.090 — antes dela não havia 13º a calcular.
    throw new ErroMotor(`Ano inválido para o 13º: ${ano}`);
  }
  if (parcela !== 1 && parcela !== 2) {
    throw new ErroMotor("Parcela do 13º inválida — informe 1 ou 2");
  }
  if (!dataCivilValida(entrada.data_admissao)) {
    throw new ErroMotor(
      `Data de admissão inválida: ${entrada.data_admissao} (AAAA-MM-DD, data real do calendário)`
    );
  }
  if (entrada.data_admissao > `${ano}-12-31`) {
    throw new ErroMotor(
      `Admissão em ${entrada.data_admissao} é posterior ao ano ${ano} — não há avo de 13º a calcular`
    );
  }
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
  const avosAfastamento = entrada.avos_afastamento ?? null;
  if (
    avosAfastamento !== null &&
    (!Number.isInteger(avosAfastamento) ||
      avosAfastamento < 0 ||
      avosAfastamento > 12)
  ) {
    throw new ErroMotor(
      "Avos de afastamento inválidos (inteiro de 0 a 12, ou ausente)"
    );
  }
  const adiantamentoPago = entrada.adiantamento_pago_centavos ?? null;
  if (
    adiantamentoPago !== null &&
    (!Number.isInteger(adiantamentoPago) || adiantamentoPago < 0)
  ) {
    throw new ErroMotor(
      "Adiantamento pago inválido (centavos inteiros ≥ 0, ou ausente)"
    );
  }
  if (parcela === 1 && adiantamentoPago !== null) {
    throw new ErroMotor(
      "Adiantamento pago é dado da 2ª parcela — a 1ª parcela é o próprio adiantamento"
    );
  }

  // ---- avos: meses com ≥ 15 dias de vínculo, projetados até 31/12 ----------
  const avosDetalhe = detalharAvos(ano, entrada.data_admissao);
  const avosDoVinculo = avosDetalhe.filter((item) => item.conta).length;
  if (avosAfastamento !== null && avosAfastamento > avosDoVinculo) {
    throw new ErroMotor(
      `Avos de afastamento (${avosAfastamento}) maiores que os avos do vínculo no ano (${avosDoVinculo})`
    );
  }
  const avos = avosDoVinculo - (avosAfastamento ?? 0);

  const avisos: string[] = [AVISO_AVOS_PROJETADOS];
  if (avosAfastamento === null) avisos.push(AVISO_AFASTAMENTO_NAO_CONSIDERADO);

  // ---- remuneração-base: salário + média mensal de variáveis --------------
  const mediaAplicada = media ?? 0;
  const remuneracaoBase = salario + mediaAplicada;
  if (mediaAplicada === 0) avisos.push(AVISO_MEDIAS_PENDENTES_DECIMO);
  const memoriaMedias =
    mediaAplicada === 0
      ? { media_variaveis: 0, aviso_medias: AVISO_MEDIAS_PENDENTES_DECIMO }
      : {
          media_variaveis: reais(mediaAplicada),
          origem_media:
            "média mensal de variáveis informada pelo chamador (importadores pendentes)",
        };
  const memoriaAvos = {
    avos,
    avos_do_vinculo: avosDoVinculo,
    avos_afastamento: avosAfastamento ?? 0,
    regra_avo: `mês conta com ${DIAS_MINIMOS_AVO} dias ou mais de vínculo (Lei 4.090/62, art. 1º §1º)`,
    projecao: AVISO_AVOS_PROJETADOS,
    avos_detalhe: avosDetalhe,
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

  // ---- o duodécimo: (salário + média) × avos ÷ 12, sem arredondar ---------
  // Razão inteira exata: avos é inteiro e a remuneração é centavo inteiro —
  // a única divisão é a por 12, que segue sem arredondar até o valor final.
  const decimoSemArredondar = (remuneracaoBase * avos) / 12;
  const metadeSemArredondar = decimoSemArredondar / 2;
  const decimoIntegral = arredondarCentavos(decimoSemArredondar);

  let baseInss = 0;
  let baseIrrf = 0;

  if (parcela === 1) {
    // 1ª PARCELA — adiantamento (1601): metade do 13º, SEM desconto ----------
    avisos.push(AVISO_ADIANTAMENTO_SEM_DESCONTO);
    const rubricaAdiantamento = rubricaObrigatoria(CODIGO_ADIANTAMENTO_DECIMO);
    incluir(
      rubricaAdiantamento,
      metadeSemArredondar,
      avos,
      remuneracaoBase,
      {
        formula: "((salário + média) × avos ÷ 12) ÷ 2",
        salario_base: reais(salario),
        remuneracao_base: reais(remuneracaoBase),
        decimo_proporcional: reaisIntermediario(decimoSemArredondar),
        tributacao: AVISO_ADIANTAMENTO_SEM_DESCONTO,
        ...memoriaAvos,
        ...memoriaMedias,
      }
    );
    // Bases ficam ZERADAS por regra do motor (Lei 4.749/65, art. 2º) — dupla
    // trava com a versão da rubrica 1601, que também não incide INSS/IRRF.
  } else {
    // 2ª PARCELA — quitação: 13º integral (0138) − adiantamento (1602),
    // INSS (2003) e IRRF (2004) sobre o 13º TOTAL, em separado --------------
    avisos.push(AVISO_TRIBUTACAO_EXCLUSIVA);
    const rubricaDecimo = rubricaObrigatoria(CODIGO_DECIMO);
    const itemDecimo = incluir(
      rubricaDecimo,
      decimoSemArredondar,
      avos,
      remuneracaoBase,
      {
        formula: "(salário + média) × avos ÷ 12",
        salario_base: reais(salario),
        remuneracao_base: reais(remuneracaoBase),
        tributacao: AVISO_TRIBUTACAO_EXCLUSIVA,
        ...memoriaAvos,
        ...memoriaMedias,
      }
    );

    // Desconto do adiantamento (1602): o pago de fato, ou a metade recalculada.
    if (adiantamentoPago === null) avisos.push(AVISO_ADIANTAMENTO_RECALCULADO);
    const rubricaDesconto = rubricaObrigatoria(
      CODIGO_DESCONTO_ADIANTAMENTO_DECIMO
    );
    incluir(
      rubricaDesconto,
      adiantamentoPago ?? metadeSemArredondar,
      null,
      itemDecimo?.valor_centavos ?? 0,
      adiantamentoPago === null
        ? {
            formula: "((salário + média) × avos ÷ 12) ÷ 2 — metade recalculada",
            origem: AVISO_ADIANTAMENTO_RECALCULADO,
          }
        : {
            formula: "valor efetivamente pago na 1ª parcela, informado na entrada",
            origem:
              "adiantamento pago informado pelo chamador — a quitação compensa o que saiu de fato",
          }
    );

    // Bases — o 13º TOTAL entra, pelas incidências da versão vigente da 0138.
    // Dupla trava de propósito (molde do motor de férias): a parcela decide se
    // ALGO entra (a 1ª não tributa, por lei) e a versão vigente da rubrica
    // decide EM QUAL base entra (nada de incidência inventada no código). O
    // desconto do adiantamento (1602) NÃO reduz base: o tributo é sobre o TOTAL.
    const valorDecimo = itemDecimo?.valor_centavos ?? 0;
    if (rubricaDecimo.incide_inss) baseInss = valorDecimo;
    if (rubricaDecimo.incide_irrf) baseIrrf = valorDecimo;

    // INSS progressivo faixa a faixa sobre o 13º total, com teto (2003) ------
    let inssFinal = 0;
    if (baseInss > 0) {
      const rubricaInss = rubricaObrigatoria(CODIGO_INSS_DECIMO);
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
            "progressivo faixa a faixa sobre o 13º total limitado ao teto — apuração em separado (Lei 8.212/91, art. 28 §7º)",
          escopo: AVISO_TRIBUTACAO_EXCLUSIVA,
          base_inss: reais(baseInss),
          teto_contribuicao: reais(entrada.tabela_inss.teto_centavos),
          teto_aplicado: tetoAplicado,
          faixas_percorridas: faixasPercorridas,
          tabela_inss_versao_id: entrada.tabela_inss.id,
        }
      );
      inssFinal = itemInss?.valor_centavos ?? 0;
    }

    // IRRF exclusivo na fonte — vale o regime de imposto MENOR (2004) --------
    if (baseIrrf > 0) {
      avisos.push(AVISO_IRRF_REGIME_DECIMO);
      const rubricaIrrf = rubricaObrigatoria(CODIGO_IRRF_DECIMO);
      const deducaoDependentes =
        entrada.dependentes_irrf *
        entrada.tabela_irrf.deducao_dependente_centavos;
      const baseCompleto = Math.max(
        0,
        baseIrrf - inssFinal - deducaoDependentes
      );
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
        throw new ErroMotor(
          "Tabela IRRF sem faixa final aberta — corrija a versão"
        );
      };
      const completo = impostoDaFaixa(baseCompleto);
      const simplificado = impostoDaFaixa(baseSimplificado);
      const venceuSimplificado = simplificado.imposto < completo.imposto;
      const vencedor = venceuSimplificado ? simplificado : completo;
      const baseVencedora = venceuSimplificado ? baseSimplificado : baseCompleto;
      incluir(rubricaIrrf, vencedor.imposto, null, baseVencedora, {
        formula:
          "base do regime vencedor × alíquota − parcela a deduzir — tributação exclusiva na fonte (RIR/2018, art. 700)",
        escopo: AVISO_TRIBUTACAO_EXCLUSIVA,
        regime: AVISO_IRRF_REGIME_DECIMO,
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
  }

  // ---- totais --------------------------------------------------------------
  let totalProventos = 0;
  let totalDescontos = 0;
  for (const item of itens) {
    if (item.natureza === "provento") totalProventos += item.valor_centavos;
    if (item.natureza === "desconto") totalDescontos += item.valor_centavos;
  }

  return {
    itens,
    avisos,
    avos,
    avos_detalhe: avosDetalhe,
    decimo_integral_centavos: decimoIntegral,
    total_proventos_centavos: totalProventos,
    total_descontos_centavos: totalDescontos,
    liquido_centavos: totalProventos - totalDescontos,
    base_inss_centavos: baseInss,
    base_irrf_centavos: baseIrrf,
  };
}
