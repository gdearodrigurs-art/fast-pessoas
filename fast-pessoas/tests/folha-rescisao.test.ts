// Bateria do MOTOR DE RESCISÃO — src/dominios/folha/calculo-rescisao.ts,
// função calcularRescisao (onda 3, 3º estágio da lane Folha).
//
// Por que estes casos e não outros: cobrem exatamente o que o escopo da onda
// pede — sem justa causa com ano cheio (todas as verbas), pedido de demissão,
// justa causa, acordo do art. 484-A, o aviso da Lei 12.506 (30 + 3/ano com
// teto de 90 e o trabalhado pagando só o excedente), a multa do FGTS com e
// sem saldo informado (dado EXTERNO) e o centavo exato na fronteira .5. Todos
// os valores esperados foram CALCULADOS À MÃO (conta no comentário de cada
// caso) contra as tabelas legais 2026 do seed da 0013 — os mesmos números de
// tests/folha.test.ts, folha-ferias.test.ts e folha-13.test.ts.
//
// Nada aqui toca banco: o motor é puro, e é por isso que ele cabe no portão
// rápido. O reuso dos motores de férias (indenizadas) e de 13º (parcela 2,
// avos até a data) é provado pelos VALORES: os itens 0136/0137/0138 desta
// bateria batem com o que aquelas baterias já provaram.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVISO_ADIANTAMENTO_13_NAO_INFORMADO,
  AVISO_AVISO_TRABALHADO_NO_SALDO,
  AVISO_AVOS_ATE_A_DATA,
  AVISO_DESCONTO_AVISO_NAO_EMITIDO,
  AVISO_DISPENSA_DE_CUMPRIMENTO,
  AVISO_DOBRA_ART137_NAO_APLICADA,
  AVISO_FGTS_SALDO_EXTERNO,
  AVISO_PERIODO_EM_CURSO_AUSENTE,
  AVISO_PROJECAO_AVISO_NAO_APLICADA,
  avisoSuspensaoNoMesDoTermino,
  calcularRescisao,
  diasDeAvisoProporcional,
  type EntradaMotorRescisao,
  type ResultadoMotorRescisao,
} from "../src/dominios/folha/calculo-rescisao";
import {
  ErroMotor,
  type ParametrosFolhaMotor,
  type RubricaMotor,
  type TabelaInssMotor,
  type TabelaIrrfMotor,
} from "../src/dominios/folha/calculo";
import {
  CODIGO_ADICIONAL_FERIAS,
  CODIGO_AVISO_INDENIZADO,
  CODIGO_DECIMO,
  CODIGO_DESCONTO_ADIANTAMENTO_DECIMO,
  CODIGO_FERIAS,
  CODIGO_INSS,
  CODIGO_INSS_DECIMO,
  CODIGO_IRRF,
  CODIGO_IRRF_DECIMO,
  CODIGO_MULTA_FGTS,
  CODIGO_SALDO_SALARIO,
  CODIGOS_DO_MOTOR,
  type NaturezaRubrica,
} from "../src/dominios/folha/esquemas";

// ------------------------------------------------------------------ fixtures
// Cópia fiel do seed da 0013 (tabelas legais 2026), em CENTAVOS INTEIROS — os
// mesmos números das baterias anteriores da lane Folha.

const PARAMETROS: ParametrosFolhaMotor = {
  id: 1,
  aliquota_fgts: 8,
  divisor_mensal_horas: 220,
  carga_semanal_referencia_minutos: 2640,
  divisor_mensal_dias: 30,
};

const TABELA_INSS: TabelaInssMotor = {
  id: 1,
  faixas: [
    { ate_centavos: 163_100, aliquota: 7.5 },
    { ate_centavos: 293_357, aliquota: 9 },
    { ate_centavos: 440_037, aliquota: 12 },
    { ate_centavos: 856_528, aliquota: 14 },
  ],
  teto_centavos: 856_528,
};

const TABELA_IRRF: TabelaIrrfMotor = {
  id: 1,
  faixas: [
    { ate_centavos: 242_880, aliquota: 0, deducao_centavos: 0 },
    { ate_centavos: 282_665, aliquota: 7.5, deducao_centavos: 18_216 },
    { ate_centavos: 375_105, aliquota: 15, deducao_centavos: 39_416 },
    { ate_centavos: 466_468, aliquota: 22.5, deducao_centavos: 67_549 },
    { ate_centavos: null, aliquota: 27.5, deducao_centavos: 90_873 },
  ],
  deducao_dependente_centavos: 18_959,
  desconto_simplificado_centavos: 60_720,
};

let proximaVersao = 0;

function montarRubrica(
  codigo: string,
  nome: string,
  natureza: NaturezaRubrica,
  incideInss: boolean,
  incideIrrf: boolean,
  incideFgts: boolean
): RubricaMotor {
  proximaVersao += 1;
  return {
    rubrica_versao_id: proximaVersao,
    codigo,
    nome,
    natureza,
    incide_inss: incideInss,
    incide_irrf: incideIrrf,
    incide_fgts: incideFgts,
    tipo_calculo: "automatico",
    parametro: null,
  };
}

// Catálogo mínimo da rescisão: as três da 0097 (só o 1701 incide nas bases),
// as férias da 0092, o 13º da 0094 e os descontos legais do mês (0013).
const CATALOGO: RubricaMotor[] = [
  montarRubrica(CODIGO_SALDO_SALARIO, "Saldo de Salário", "provento", true, true, true),
  montarRubrica(CODIGO_AVISO_INDENIZADO, "Aviso Prévio Indenizado", "provento", false, false, true),
  montarRubrica(CODIGO_MULTA_FGTS, "Multa de 40% do FGTS", "provento", false, false, false),
  montarRubrica(CODIGO_FERIAS, "Férias", "provento", true, true, true),
  montarRubrica(CODIGO_ADICIONAL_FERIAS, "Adicional de Férias", "provento", true, true, true),
  montarRubrica(CODIGO_DECIMO, "13º Salário", "provento", true, true, true),
  montarRubrica(CODIGO_DESCONTO_ADIANTAMENTO_DECIMO, "Desconto do Adiantamento de 13º", "desconto", false, false, false),
  montarRubrica(CODIGO_INSS_DECIMO, "INSS sobre 13º Salário", "desconto", false, false, false),
  montarRubrica(CODIGO_IRRF_DECIMO, "IRRF sobre 13º Salário", "desconto", false, false, false),
  montarRubrica(CODIGO_INSS, "Desconto INSS", "desconto", false, false, false),
  montarRubrica(CODIGO_IRRF, "IRRF", "desconto", false, false, false),
];

// Colaborador de referência: admitido em 01/04/2020, comunicado e desligado em
// 30/06/2026 (aviso indenizado: término = comunicação) — 6 anos completos.
// Período aquisitivo EM CURSO desde 01/04/2026 (3 meses de serviço no término).
function rescisao(ajuste: Partial<EntradaMotorRescisao>): ResultadoMotorRescisao {
  return calcularRescisao({
    tipo_desligamento: "sem_justa_causa",
    iniciativa: "empregador",
    modalidade_aviso: "indenizado",
    data_admissao: "2020-04-01",
    data_comunicacao: "2026-06-30",
    data_termino: "2026-06-30",
    salario_base_centavos: 300_000,
    dependentes_irrf: 0,
    media_variaveis_centavos: null,
    ferias_vencidas: [],
    periodo_aquisitivo_em_curso_inicio: "2026-04-01",
    saldo_fgts_centavos: 1_000_000,
    adiantamento_decimo_pago_centavos: null,
    avos_afastamento_13: null,
    rubricas: CATALOGO,
    tabela_inss: TABELA_INSS,
    tabela_irrf: TABELA_IRRF,
    parametros: PARAMETROS,
    ...ajuste,
  });
}

function valorDe(resultado: ResultadoMotorRescisao, codigo: string): number | null {
  return (
    resultado.itens.find((item) => item.codigo === codigo)?.valor_centavos ??
    null
  );
}

function valoresDe(resultado: ResultadoMotorRescisao, codigo: string): number[] {
  return resultado.itens
    .filter((item) => item.codigo === codigo)
    .map((item) => item.valor_centavos);
}

function memoriaDe(
  resultado: ResultadoMotorRescisao,
  codigo: string
): Record<string, unknown> {
  const item = resultado.itens.find((entrada) => entrada.codigo === codigo);
  assert.ok(item, `item ${codigo} deveria existir`);
  return item.memoria;
}

// ------------------------------------------------------------------ sem justa causa, ano cheio

test("sem justa causa com tudo: saldo, aviso, vencidas + proporcionais + 1/3, 13º até a data e multa de 40%", () => {
  // Salário 3.000,00 · admitido 01/04/2020 · término 30/06/2026 · saldo FGTS
  // 10.000,00 · um período VENCIDO (2025-04-01 a 2026-03-31, saldo 30) e o em
  // curso desde 01/04/2026.
  // • Saldo: 30 dias de junho × 100,00 = 3.000,00.
  // • Aviso: 6 anos completos → 30 + 18 = 48 dias × 100,00 = 4.800,00.
  // • Vencidas (REUSO férias indenizadas, 30 dias): 3.000,00 + 1/3 = 1.000,00.
  // • Proporcionais: 3 avos (abr-mai-jun de serviço) → 7,5 dias × 100,00 =
  //   750,00 + 1/3 = 250,00 (7,5 dias fora da janela de gozo → mesma fórmula).
  // • 13º (REUSO parcela 2): 6 avos até 30/06 → 1.500,00; INSS do 13º em
  //   separado: 1.500,00 × 7,5% = 112,50; IRRF do 13º isento nos 2 regimes.
  // • Multa (Lei 8.036 art. 18 §1º — base inclui os depósitos DA rescisão):
  //   depósitos = 8% × (3.000,00 + 4.800,00 + 1.500,00) = 744,00; base =
  //   10.000,00 + 744,00 = 10.744,00 × 40% = 4.297,60.
  // • INSS do mês SÓ sobre o saldo: 1.631,00×7,5% + 1.302,57×9% + 66,43×12%
  //   = 247,5279 → 247,53. IRRF do mês: completo 24,275; simplificado 0 → 0.
  const resultado = rescisao({
    ferias_vencidas: [
      {
        periodo_inicio: "2025-04-01",
        periodo_fim: "2026-03-31",
        saldo_dias: 30,
        limite_concessivo: "2027-03-31",
      },
    ],
  });

  assert.equal(resultado.direitos.tipo, "sem_justa_causa");
  assert.equal(resultado.dias_saldo_salario, 30);
  assert.equal(resultado.dias_aviso_proporcional, 48);
  assert.equal(resultado.dias_aviso_indenizados, 48);
  assert.equal(resultado.avos_ferias_proporcionais, 3);
  assert.equal(resultado.avos_decimo, 6);

  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 300_000);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), 480_000);
  assert.deepEqual(valoresDe(resultado, CODIGO_FERIAS), [300_000, 75_000]);
  assert.deepEqual(valoresDe(resultado, CODIGO_ADICIONAL_FERIAS), [100_000, 25_000]);
  assert.equal(valorDe(resultado, CODIGO_DECIMO), 150_000);
  assert.equal(valorDe(resultado, CODIGO_INSS_DECIMO), 11_250);
  assert.equal(valorDe(resultado, CODIGO_IRRF_DECIMO), null);
  // Adiantamento não informado = considerado NÃO pago: nenhum desconto 1602.
  assert.equal(valorDe(resultado, CODIGO_DESCONTO_ADIANTAMENTO_DECIMO), null);
  assert.equal(valorDe(resultado, CODIGO_MULTA_FGTS), 429_760);
  assert.equal(valorDe(resultado, CODIGO_INSS), 24_753);
  assert.equal(valorDe(resultado, CODIGO_IRRF), null);

  // Bases do MÊS: só o saldo (verbas indenizatórias FORA, exclusões na memória).
  assert.equal(resultado.base_inss_centavos, 300_000);
  assert.equal(resultado.base_irrf_centavos, 300_000);
  assert.equal(resultado.base_inss_decimo_centavos, 150_000);
  assert.equal(resultado.base_irrf_decimo_centavos, 150_000);

  assert.equal(resultado.total_proventos_centavos, 1_859_760);
  assert.equal(resultado.total_descontos_centavos, 36_003);
  assert.equal(resultado.liquido_centavos, 1_823_757);

  // Memória explicável: cada exclusão de base citada no próprio item.
  assert.match(String(memoriaDe(resultado, CODIGO_SALDO_SALARIO).tributacao), /SALARIAL/);
  assert.match(
    String(memoriaDe(resultado, CODIGO_AVISO_INDENIZADO).tributacao),
    /REsp 1\.230\.957/
  );
  assert.match(String(memoriaDe(resultado, CODIGO_MULTA_FGTS).tributacao), /7\.713/);
  assert.match(
    String(memoriaDe(resultado, CODIGO_FERIAS).tributacao),
    /INDENIZADAS/
  );
  assert.equal(memoriaDe(resultado, CODIGO_DECIMO).avos_ate_a_data, 6);
  assert.equal(memoriaDe(resultado, CODIGO_DECIMO).reducao_por_termino, 6);
  assert.ok(resultado.avisos.includes(AVISO_AVOS_ATE_A_DATA));
  assert.ok(resultado.avisos.includes(AVISO_ADIANTAMENTO_13_NAO_INFORMADO));
  assert.ok(resultado.avisos.includes(AVISO_PROJECAO_AVISO_NAO_APLICADA));
  assert.ok(!resultado.avisos.includes(AVISO_DOBRA_ART137_NAO_APLICADA));
  assert.ok(!resultado.avisos.includes(AVISO_FGTS_SALDO_EXTERNO));
});

// ------------------------------------------------------------------ mês civil completo no saldo

test("fevereiro trabalhado INTEIRO: término no último dia do mês paga o salário cheio (30/30), não 28/30", () => {
  // Período do saldo cobre o mês civil todo (01 a 28/02/2026) → mês comercial
  // completo: 30 × 100,00 = 3.000,00 — não 28 × 100,00 = 2.800,00.
  const resultado = rescisao({
    data_comunicacao: "2026-02-28",
    data_termino: "2026-02-28",
    periodo_aquisitivo_em_curso_inicio: "2025-04-01",
    saldo_fgts_centavos: null,
  });
  assert.equal(resultado.dias_saldo_salario, 30);
  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 300_000);
  const memoria = memoriaDe(resultado, CODIGO_SALDO_SALARIO);
  assert.equal(memoria.dias_corridos, 28);
  assert.equal(memoria.dias_pagos, 30);
  assert.match(String(memoria.mes_civil_completo), /mês civil inteiro/);
});

test("janeiro trabalhado inteiro continua 30/30: os 31 dias corridos param no divisor, como antes", () => {
  const resultado = rescisao({
    data_comunicacao: "2026-01-31",
    data_termino: "2026-01-31",
    periodo_aquisitivo_em_curso_inicio: "2025-04-01",
    saldo_fgts_centavos: null,
  });
  assert.equal(resultado.dias_saldo_salario, 30);
  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 300_000);
  assert.match(
    String(memoriaDe(resultado, CODIGO_SALDO_SALARIO).cap_divisor),
    /31 dias corridos/
  );
});

test("fevereiro PARCIAL segue proporcional: término no dia 27 paga 27/30", () => {
  const resultado = rescisao({
    data_comunicacao: "2026-02-27",
    data_termino: "2026-02-27",
    periodo_aquisitivo_em_curso_inicio: "2025-04-01",
    saldo_fgts_centavos: null,
  });
  assert.equal(resultado.dias_saldo_salario, 27);
  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 270_000);
  assert.equal(
    memoriaDe(resultado, CODIGO_SALDO_SALARIO).mes_civil_completo,
    null
  );
});

test("admitido no dia 1º e desligado no último dia de fevereiro: o mês civil inteiro também vale na admissão do próprio mês", () => {
  const resultado = rescisao({
    data_admissao: "2026-02-01",
    data_comunicacao: "2026-02-28",
    data_termino: "2026-02-28",
    periodo_aquisitivo_em_curso_inicio: "2026-02-01",
    saldo_fgts_centavos: null,
  });
  assert.equal(resultado.dias_saldo_salario, 30);
  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 300_000);
});

// ------------------------------------------------------------------ pedido de demissão

test("pedido de demissão: sem aviso indenizado a favor e sem multa; férias e 13º proporcionais devidos", () => {
  // Aviso trabalhado pelo empregado; saldo FGTS informado NÃO gera multa
  // (percentual 0 no pedido). Verbas: saldo 3.000,00 + proporcionais 750,00 +
  // 250,00 + 13º 1.500,00 − INSS mês 247,53 − INSS 13º 112,50.
  const resultado = rescisao({
    tipo_desligamento: "pedido_demissao",
    iniciativa: "empregado",
    modalidade_aviso: "trabalhado",
  });
  assert.equal(resultado.dias_aviso_proporcional, 0);
  assert.equal(resultado.dias_aviso_indenizados, 0);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), null);
  assert.equal(valorDe(resultado, CODIGO_MULTA_FGTS), null);
  assert.ok(!resultado.avisos.includes(AVISO_FGTS_SALDO_EXTERNO));
  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 300_000);
  assert.deepEqual(valoresDe(resultado, CODIGO_FERIAS), [75_000]);
  assert.deepEqual(valoresDe(resultado, CODIGO_ADICIONAL_FERIAS), [25_000]);
  assert.equal(valorDe(resultado, CODIGO_DECIMO), 150_000);
  assert.equal(resultado.total_proventos_centavos, 550_000);
  assert.equal(resultado.total_descontos_centavos, 36_003);
  assert.equal(resultado.liquido_centavos, 513_997);
});

test("pedido sem cumprir o aviso: o DESCONTO do art. 487 §2º não é emitido — decisão conservadora avisada", () => {
  const resultado = rescisao({
    tipo_desligamento: "pedido_demissao",
    iniciativa: "empregado",
    modalidade_aviso: "indenizado",
  });
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), null);
  assert.ok(resultado.avisos.includes(AVISO_DESCONTO_AVISO_NAO_EMITIDO));
});

// ------------------------------------------------------------------ justa causa

test("justa causa: só saldo + férias VENCIDAS + 1/3 — sem proporcionais, sem 13º, sem aviso, sem multa", () => {
  // Mesmo com o período em curso informado E saldo do FGTS informado, nada de
  // proporcionais/13º/multa (Súmula 171 TST; Lei 4.090/62 art. 3º, a contrario).
  const resultado = rescisao({
    tipo_desligamento: "justa_causa",
    iniciativa: "empregador",
    modalidade_aviso: "nao_aplicavel",
    ferias_vencidas: [
      {
        periodo_inicio: "2025-04-01",
        periodo_fim: "2026-03-31",
        saldo_dias: 30,
        limite_concessivo: "2027-03-31",
      },
    ],
  });
  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 300_000);
  assert.deepEqual(valoresDe(resultado, CODIGO_FERIAS), [300_000]);
  assert.deepEqual(valoresDe(resultado, CODIGO_ADICIONAL_FERIAS), [100_000]);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), null);
  assert.equal(valorDe(resultado, CODIGO_DECIMO), null);
  assert.equal(valorDe(resultado, CODIGO_MULTA_FGTS), null);
  assert.equal(resultado.avos_ferias_proporcionais, 0);
  assert.equal(resultado.avos_decimo, 0);
  assert.equal(resultado.base_inss_decimo_centavos, 0);
  // O aviso de período em curso ausente NÃO aparece: a verba não é devida.
  assert.ok(!resultado.avisos.includes(AVISO_PERIODO_EM_CURSO_AUSENTE));
  assert.ok(!resultado.avisos.includes(AVISO_AVOS_ATE_A_DATA));
  assert.equal(resultado.total_proventos_centavos, 700_000);
  assert.equal(resultado.total_descontos_centavos, 24_753);
  assert.equal(resultado.liquido_centavos, 675_247);
  assert.match(resultado.direitos.citacao, /Súmula 171/);
});

// ------------------------------------------------------------------ acordo do art. 484-A

test("acordo 484-A: METADE do aviso indenizado e multa de 20%", () => {
  // Aviso cheio seria 48 dias × 100,00 = 4.800,00 → metade = 2.400,00.
  // Multa: depósitos da rescisão = 8% × (3.000,00 + 2.400,00 + 1.500,00) =
  // 552,00; base = 10.000,00 + 552,00 = 10.552,00 × 20% = 2.110,40 (o aviso
  // deposita sobre o que É pago — a metade). Demais verbas integrais (§1º).
  const resultado = rescisao({
    tipo_desligamento: "acordo_484a",
    iniciativa: "acordo",
  });
  assert.equal(resultado.dias_aviso_proporcional, 48);
  assert.equal(resultado.dias_aviso_indenizados, 48);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), 240_000);
  assert.equal(valorDe(resultado, CODIGO_MULTA_FGTS), 211_040);
  assert.equal(memoriaDe(resultado, CODIGO_AVISO_INDENIZADO).fator, 0.5);
  assert.equal(memoriaDe(resultado, CODIGO_MULTA_FGTS).percentual, 20);
  assert.deepEqual(valoresDe(resultado, CODIGO_FERIAS), [75_000]);
  assert.equal(valorDe(resultado, CODIGO_DECIMO), 150_000);
  assert.equal(resultado.total_proventos_centavos, 1_001_040);
  assert.equal(resultado.total_descontos_centavos, 36_003);
  assert.equal(resultado.liquido_centavos, 965_037);
});

// ------------------------------------------------------------------ aviso da Lei 12.506

test("aviso 30 + 3/ano com teto de 90 (Lei 12.506): 26 anos de casa param no teto", () => {
  // 26 anos completos → 30 + 78 = 108 → teto 90 dias × 100,00 = 9.000,00.
  const resultado = rescisao({
    data_admissao: "2000-01-15",
    periodo_aquisitivo_em_curso_inicio: "2026-01-15",
  });
  assert.equal(resultado.dias_aviso_proporcional, 90);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), 900_000);
  assert.match(
    String(memoriaDe(resultado, CODIGO_AVISO_INDENIZADO).regra_dias),
    /teto 90/
  );
  // A função exportada é a régua: fronteiras exatas.
  assert.equal(diasDeAvisoProporcional(0), 30);
  assert.equal(diasDeAvisoProporcional(1), 33);
  assert.equal(diasDeAvisoProporcional(20), 90);
  assert.equal(diasDeAvisoProporcional(26), 90);
});

test("aviso TRABALHADO: os 30 dias-base vão no saldo do mês; só o excedente proporcional sai indenizado", () => {
  // 6 anos → 48 dias proporcionais − 30 trabalháveis = 18 indenizados =
  // 1.800,00 (os 18 excedentes não podem ser exigidos em trabalho).
  const resultado = rescisao({ modalidade_aviso: "trabalhado" });
  assert.equal(resultado.dias_aviso_proporcional, 48);
  assert.equal(resultado.dias_aviso_indenizados, 18);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), 180_000);
  assert.ok(resultado.avisos.includes(AVISO_AVISO_TRABALHADO_NO_SALDO));
});

test("cumprimento DISPENSADO pelo empregador: pagamento continua devido (Súmula 276 TST)", () => {
  const resultado = rescisao({ modalidade_aviso: "dispensado" });
  assert.equal(resultado.dias_aviso_indenizados, 48);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), 480_000);
  assert.ok(resultado.avisos.includes(AVISO_DISPENSA_DE_CUMPRIMENTO));
});

// ------------------------------------------------------------------ multa do FGTS: saldo é EXTERNO

test("sem saldo do FGTS informado: multa sai SÓ sobre os depósitos da rescisão, com o mesmo aviso; com saldo, ele entra na base", () => {
  // Depósitos da rescisão (caso padrão): 8% × (3.000,00 + 4.800,00 + 1.500,00)
  // = 744,00. Sem saldo externo: 744,00 × 40% = 297,60 — e o aviso continua.
  const semSaldo = rescisao({ saldo_fgts_centavos: null });
  assert.equal(valorDe(semSaldo, CODIGO_MULTA_FGTS), 29_760);
  assert.ok(semSaldo.avisos.includes(AVISO_FGTS_SALDO_EXTERNO));
  assert.match(
    String(memoriaDe(semSaldo, CODIGO_MULTA_FGTS).origem_saldo),
    /não informado/
  );

  // 1.234,56 + 744,00 = 1.978,56 × 40% = 791,424 → 791,42 (meio-para-cima só
  // no final).
  const comSaldo = rescisao({ saldo_fgts_centavos: 123_456 });
  assert.equal(valorDe(comSaldo, CODIGO_MULTA_FGTS), 79_142);
  assert.ok(!comSaldo.avisos.includes(AVISO_FGTS_SALDO_EXTERNO));
  assert.match(
    String(memoriaDe(comSaldo, CODIGO_MULTA_FGTS).origem_saldo),
    /dado externo/
  );
});

test("multa do FGTS soma os depósitos da PRÓPRIA rescisão à base (Lei 8.036, art. 18, §1º) — conta à mão", () => {
  // Verbas de depósito da rescisão padrão: saldo 3.000,00 + aviso 4.800,00 +
  // 13º 1.500,00 = 9.300,00 → depósitos 8% = 744,00. As férias proporcionais
  // (750,00 + 250,00) ficam FORA mesmo com incide_fgts na versão: indenizadas
  // não depositam — decisão do motor, exclusão citada na memória.
  // Base = 10.000,00 (externo) + 744,00 = 10.744,00 → 40% = 4.297,60.
  const resultado = rescisao({});
  assert.equal(valorDe(resultado, CODIGO_MULTA_FGTS), 429_760);
  const memoria = memoriaDe(resultado, CODIGO_MULTA_FGTS);
  assert.equal(memoria.total_depositos_rescisao, 744);
  assert.equal(memoria.base_multa, 10_744);
  assert.equal(memoria.aliquota_fgts, 8);
  const composicao = memoria.depositos_rescisao as { codigo: string }[];
  assert.deepEqual(
    composicao.map((verba) => verba.codigo),
    [CODIGO_SALDO_SALARIO, CODIGO_AVISO_INDENIZADO, CODIGO_DECIMO]
  );
  assert.match(String(memoria.composicao_base), /art\. 18, §1º/);
  assert.match(String(memoria.composicao_base), /férias/);
});

test("a flag incide_fgts da versão VIGENTE decide o depósito: 1702 sem FGTS sai da base da multa", () => {
  // Dupla trava (nada chumbado): com a versão vigente do aviso indenizado sem
  // incide_fgts, os depósitos caem para 8% × (3.000,00 + 1.500,00) = 360,00 →
  // multa de 40% sem saldo externo = 144,00.
  const catalogoSemFgtsNoAviso = CATALOGO.map((rubrica) =>
    rubrica.codigo === CODIGO_AVISO_INDENIZADO
      ? { ...rubrica, incide_fgts: false }
      : rubrica
  );
  const resultado = rescisao({
    rubricas: catalogoSemFgtsNoAviso,
    saldo_fgts_centavos: null,
  });
  assert.equal(valorDe(resultado, CODIGO_MULTA_FGTS), 14_400);
});

// ------------------------------------------------------------------ centavo exato

test("fronteira do meio centavo: aviso e 13º caem em ,5 exato e sobem — líquido fecha no centavo", () => {
  // Salário 3.000,05 · admitido 01/06/2025 · término 30/06/2026 → 1 ano
  // completo → aviso de 33 dias.
  // • Aviso: 3.000,05 × 33 ÷ 30 = 3.300,055 → fronteira ,5 → 3.300,06.
  // • 13º: 6 avos → 3.000,05 × 6 ÷ 12 = 1.500,025 → fronteira ,5 → 1.500,03.
  //   INSS do 13º: 1.500,03 × 7,5% = 112,50225 → 112,50.
  // • Saldo: mês inteiro = 3.000,05. INSS do mês: 122,325 + 117,2313 +
  //   6,648×12% = 0,79776 → total 247,5339 → 247,53. IRRF: simplificado
  //   2.392,85 → isento → 0.
  // • Multa (sem saldo externo, só os depósitos da rescisão): 8% ×
  //   (3.000,05 + 3.300,06 + 1.500,03 = 7.800,14) = 624,0112 → base; × 40% =
  //   249,60448 → 249,60.
  // Proventos 3.000,05 + 3.300,06 + 1.500,03 + 249,60 = 8.049,74; descontos
  // 360,03.
  const resultado = rescisao({
    data_admissao: "2025-06-01",
    salario_base_centavos: 300_005,
    periodo_aquisitivo_em_curso_inicio: null,
    saldo_fgts_centavos: null,
  });
  assert.equal(valorDe(resultado, CODIGO_SALDO_SALARIO), 300_005);
  assert.equal(valorDe(resultado, CODIGO_AVISO_INDENIZADO), 330_006);
  assert.equal(valorDe(resultado, CODIGO_DECIMO), 150_003);
  assert.equal(valorDe(resultado, CODIGO_INSS_DECIMO), 11_250);
  assert.equal(valorDe(resultado, CODIGO_INSS), 24_753);
  assert.equal(valorDe(resultado, CODIGO_MULTA_FGTS), 24_960);
  assert.equal(resultado.total_proventos_centavos, 804_974);
  assert.equal(resultado.total_descontos_centavos, 36_003);
  assert.equal(resultado.liquido_centavos, 768_971);
  // Sem o período em curso as proporcionais não saem — e a saída avisa.
  assert.deepEqual(valoresDe(resultado, CODIGO_FERIAS), []);
  assert.ok(resultado.avisos.includes(AVISO_PERIODO_EM_CURSO_AUSENTE));
});

// ------------------------------------------------------------------ dobra do art. 137 (aviso, não valor)

test("férias vencidas além do limite concessivo: valor simples + aviso de que a dobra NÃO foi aplicada", () => {
  const resultado = rescisao({
    ferias_vencidas: [
      {
        periodo_inicio: "2024-04-01",
        periodo_fim: "2025-03-31",
        saldo_dias: 30,
        limite_concessivo: "2026-03-31", // término 30/06/2026 já passou dele
      },
    ],
  });
  assert.deepEqual(valoresDe(resultado, CODIGO_FERIAS), [300_000, 75_000]);
  assert.ok(resultado.avisos.includes(AVISO_DOBRA_ART137_NAO_APLICADA));
});

// ------------------------------------------------------------------ borda de entrada

test("limites, centavo inteiro e datas civis valem na borda do motor", () => {
  const casos: Partial<EntradaMotorRescisao>[] = [
    { tipo_desligamento: "outro_tipo" }, // fora do CHECK da 0008
    { modalidade_aviso: "por_email" }, // modalidade desconhecida
    { data_termino: "2026-02-30" }, // data impossível
    { data_admissao: "01/04/2020" }, // formato errado
    { data_termino: "2019-12-31" }, // término antes da admissão
    { salario_base_centavos: 300_000.5 }, // fração de centavo
    { salario_base_centavos: -1 }, // negativo
    { media_variaveis_centavos: 10.5 },
    { saldo_fgts_centavos: -1 },
    { adiantamento_decimo_pago_centavos: 100.5 },
    { avos_afastamento_13: 13 },
    {
      // período "vencido" que ainda está em curso no término
      ferias_vencidas: [
        { periodo_inicio: "2026-04-01", periodo_fim: "2027-03-31", saldo_dias: 30 },
      ],
    },
    {
      // saldo de férias fora do NUMERIC(4,1) do banco
      ferias_vencidas: [
        { periodo_inicio: "2025-04-01", periodo_fim: "2026-03-31", saldo_dias: 31 },
      ],
    },
    { periodo_aquisitivo_em_curso_inicio: "2026-07-01" }, // começa depois do término
  ];
  for (const caso of casos) {
    assert.throws(() => rescisao(caso), ErroMotor, JSON.stringify(caso));
  }
});

test("rubrica de rescisão fora do catálogo derruba com mensagem acionável", () => {
  assert.throws(
    () =>
      rescisao({
        rubricas: CATALOGO.filter(
          (rubrica) => rubrica.codigo !== CODIGO_SALDO_SALARIO
        ),
      }),
    /Rubrica 1701 sem versão vigente/
  );
  assert.throws(
    () =>
      rescisao({
        rubricas: CATALOGO.filter(
          (rubrica) => rubrica.codigo !== CODIGO_AVISO_INDENIZADO
        ),
      }),
    /Rubrica 1702 sem versão vigente/
  );
});

// ------------------------------------------------------------------ suspensão no mês do término (D3)
// Calendário dos casos (o mesmo de folha-suspensao.test.ts): agosto/2026
// começa num SÁBADO (domingos 2, 9, 16, 23 e 30) e setembro/2026 numa TERÇA
// (domingos 6, 13, 20 e 27).

test("D3: suspensão no mês do término vira AVISO com dias e id — capada no término, DSR posterior fora", () => {
  // Término sábado 15/08. Suspensão seg 10/08 a qui 20/08 (medida 7): no
  // período do saldo contam 10–15 = 6 dias; o domingo 16/08 cai DEPOIS do
  // término — não há DSR a descontar no saldo.
  const aviso = avisoSuspensaoNoMesDoTermino("2026-08-15", [
    { medida_id: 7, inicio: "2026-08-10", fim: "2026-08-20" },
  ]);
  assert.ok(aviso);
  assert.match(aviso, /6 dia/);
  assert.match(aviso, /#7/);
  assert.match(aviso, /NÃO descontada/);
  assert.match(aviso, /acerto/);
  assert.doesNotMatch(aviso, /DSR/);
});

test("D3: DSR perdido dentro do saldo entra no aviso; medida sem efeito no mês do término não gera aviso", () => {
  // Término 31/08. Suspensão 10–14/08: 5 dias + o DSR do domingo 16/08.
  const aviso = avisoSuspensaoNoMesDoTermino("2026-08-31", [
    { medida_id: 3, inicio: "2026-08-10", fim: "2026-08-14" },
  ]);
  assert.ok(aviso);
  assert.match(aviso, /5 dia/);
  assert.match(aviso, /1 DSR/);
  assert.match(aviso, /#3/);
  // Medida de junho: nem dia nem DSR em agosto — nada de aviso.
  assert.equal(
    avisoSuspensaoNoMesDoTermino("2026-08-31", [
      { medida_id: 4, inicio: "2026-06-01", fim: "2026-06-05" },
    ]),
    null
  );
});

test("D3: janela ABERTA conta até o término; várias medidas somam e o aviso lista todos os ids", () => {
  // Término qua 05/08. Aberta desde seg 03/08: 3 dias (03–05) — o domingo
  // 09/08 fica depois do término e não conta. Mais a medida do sábado 1º/08:
  // 1 dia + o DSR do domingo 02/08 (dentro do saldo). Total: 4 dias e 1 DSR.
  const aviso = avisoSuspensaoNoMesDoTermino("2026-08-05", [
    { medida_id: 9, inicio: "2026-08-03", fim: null },
    { medida_id: 11, inicio: "2026-08-01", fim: "2026-08-01" },
  ]);
  assert.ok(aviso);
  assert.match(aviso, /4 dia/);
  assert.match(aviso, /1 DSR/);
  assert.match(aviso, /medidas #9, #11/);
});

test("D3: suspensão que acabou no mês ANTERIOR ainda derruba o DSR do 1º domingo do mês do término", () => {
  // Setembro/2026 começa numa terça; 1º domingo 06/09, semana 31/08–05/09.
  // Suspensão 24–31/08 terminou antes do mês do término, mas alcança a semana
  // do domingo 06/09: 0 dia corrido no mês + 1 DSR.
  const aviso = avisoSuspensaoNoMesDoTermino("2026-09-30", [
    { medida_id: 12, inicio: "2026-08-24", fim: "2026-08-31" },
  ]);
  assert.ok(aviso);
  assert.match(aviso, /0 dia/);
  assert.match(aviso, /1 DSR/);
});

// ------------------------------------------------------------------ proteção do catálogo

test("as rubricas do motor de rescisão são protegidas do encerramento (molde B2)", () => {
  for (const codigo of [
    CODIGO_SALDO_SALARIO,
    CODIGO_AVISO_INDENIZADO,
    CODIGO_MULTA_FGTS,
  ]) {
    assert.ok(
      CODIGOS_DO_MOTOR.includes(codigo),
      `CODIGOS_DO_MOTOR deixou a rubrica ${codigo} de fora — encerrá-la pela ` +
        "tela derruba a prévia de rescisão"
    );
  }
});
