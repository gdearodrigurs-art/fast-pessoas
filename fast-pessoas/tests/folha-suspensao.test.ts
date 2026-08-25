// Suspensão disciplinar → folha (D2:a, migração 0100) — as duas partes puras:
// o recorte da janela pela competência (src/dominios/folha/suspensao.ts) e a
// emissão do desconto 1203 pelo motor mensal (calculo.ts). O que está aqui
// protege as promessas da decisão: dias CORRIDOS da janela, cada mês com a sua
// parte, DSR da semana civil (1 valor-dia por semana, atribuído ao domingo —
// nunca em dobro na virada do mês) e centavo exato com o divisor do banco.
//
// Calendário dos casos: agosto/2026 começa num SÁBADO (domingos 2, 9, 16, 23 e
// 30) e setembro/2026 numa TERÇA (domingos 6, 13, 20 e 27).
//
// Nada aqui toca banco: os dois módulos são puros.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  apurarSuspensaoNaCompetencia,
  inicioBuscaSuspensao,
} from "../src/dominios/folha/suspensao";
import {
  ErroMotor,
  calcularFolha,
  type EntradaMotor,
  type ItemMotor,
  type ParametrosFolhaMotor,
  type ResultadoMotor,
  type RubricaMotor,
  type SuspensaoMotor,
  type TabelaInssMotor,
  type TabelaIrrfMotor,
} from "../src/dominios/folha/calculo";
import {
  CODIGO_DESCONTO_SUSPENSAO,
  CODIGOS_AUTOMATICOS,
  type NaturezaRubrica,
  type TipoCalculo,
} from "../src/dominios/folha/esquemas";

// ---------------------------------------------------------------- recorte: janela dentro do mês

test("janela dentro do mês: dias corridos contam inclusive, com o DSR da semana", () => {
  // Segunda 10/08 a sexta 14/08: 5 dias corridos; a semana derruba o domingo 16.
  const recorte = apurarSuspensaoNaCompetencia(2026, 8, "2026-08-10", "2026-08-14");
  assert.equal(recorte.dias, 5);
  assert.deepEqual(recorte.domingos_dsr, ["2026-08-16"]);
});

test("suspensão só no domingo desconta o dia corrido, mas não derruba DSR", () => {
  // O repouso não é dia de trabalho perdido — a semana seg–sáb é que conta.
  const recorte = apurarSuspensaoNaCompetencia(2026, 8, "2026-08-02", "2026-08-02");
  assert.equal(recorte.dias, 1);
  assert.deepEqual(recorte.domingos_dsr, []);
});

// ---------------------------------------------------------------- recorte: cruzando meses

test("janela cruzando o mês: cada competência desconta a SUA parte, sem sobra", () => {
  // Sexta 28/08 a quinta 03/09: 7 dias corridos no total.
  const agosto = apurarSuspensaoNaCompetencia(2026, 8, "2026-08-28", "2026-09-03");
  const setembro = apurarSuspensaoNaCompetencia(2026, 9, "2026-08-28", "2026-09-03");
  assert.equal(agosto.dias, 4); // 28, 29, 30, 31
  assert.equal(setembro.dias, 3); // 1, 2, 3
  assert.equal(agosto.dias + setembro.dias, 7); // nada se perde, nada dobra
  // O DSR pertence à competência do DOMINGO: 30/08 em agosto, 06/09 em setembro.
  assert.deepEqual(agosto.domingos_dsr, ["2026-08-30"]);
  assert.deepEqual(setembro.domingos_dsr, ["2026-09-06"]);
});

test("suspensão no fim do mês derruba o DSR do mês SEGUINTE — dias zero, DSR um", () => {
  // Terça 29/09 a quarta 30/09: a semana 28/09–03/10 derruba o domingo 04/10.
  const outubro = apurarSuspensaoNaCompetencia(2026, 10, "2026-09-29", "2026-09-30");
  assert.equal(outubro.dias, 0);
  assert.deepEqual(outubro.domingos_dsr, ["2026-10-04"]);
  // É para isso que a busca de medidas estende 6 dias para trás do dia 1º.
  assert.equal(inicioBuscaSuspensao(2026, 10), "2026-09-25");
});

test("janela fora do mês: zero dias, zero DSR", () => {
  const recorte = apurarSuspensaoNaCompetencia(2026, 11, "2026-08-10", "2026-08-14");
  assert.equal(recorte.dias, 0);
  assert.deepEqual(recorte.domingos_dsr, []);
});

test("janela ABERTA (fim null) conta até onde a competência alcança", () => {
  // Quarta 26/08, sem fim fechado: 26–31 = 6 dias; a semana derruba o dia 30.
  const recorte = apurarSuspensaoNaCompetencia(2026, 8, "2026-08-26", null);
  assert.equal(recorte.dias, 6);
  assert.deepEqual(recorte.domingos_dsr, ["2026-08-30"]);
});

// ---------------------------------------------------------------- motor: fixtures
// Tabelas legais 2026 e divisores — cópia fiel do seed 0013/0038, como em
// tests/folha.test.ts. O divisor de dias (30) vem DAQUI, nunca do motor.

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
  tipo_calculo: TipoCalculo,
  parametro: number | null,
  incide: boolean
): RubricaMotor {
  proximaVersao += 1;
  return {
    rubrica_versao_id: proximaVersao,
    codigo,
    nome,
    natureza,
    incide_inss: incide,
    incide_irrf: incide,
    incide_fgts: incide,
    tipo_calculo,
    parametro,
  };
}

// Catálogo mínimo do motor + a 1203 (0100), com as incidências da migração
// (desconto que REDUZ as três bases, espelho de 1201/1202).
const CATALOGO: RubricaMotor[] = [
  montarRubrica("1001", "Salário Base", "provento", "automatico", null, true),
  montarRubrica("1201", "Faltas", "desconto", "automatico", null, true),
  montarRubrica("1202", "DSR sobre Faltas", "desconto", "automatico", null, true),
  montarRubrica("1203", "Desconto de Suspensão Disciplinar", "desconto", "automatico", null, true),
  montarRubrica("2001", "Desconto INSS", "desconto", "automatico", null, false),
  montarRubrica("2002", "IRRF", "desconto", "automatico", null, false),
  montarRubrica("3001", "FGTS", "informativa", "automatico", null, false),
];

type Ajuste = Partial<EntradaMotor> & { salario_base_centavos: number };

function folha(ajuste: Ajuste): ResultadoMotor {
  return calcularFolha({
    dependentes_irrf: 0,
    carga_semanal_minutos: null,
    variaveis: [],
    rubricas: CATALOGO,
    tabela_inss: TABELA_INSS,
    tabela_irrf: TABELA_IRRF,
    parametros: PARAMETROS,
    ...ajuste,
  });
}

function suspensao(ajuste: Partial<SuspensaoMotor>): SuspensaoMotor {
  return {
    medida_id: 501,
    inicio: "2026-08-10",
    fim: "2026-08-14",
    dias_na_competencia: 5,
    domingos_dsr: ["2026-08-16"],
    ...ajuste,
  };
}

function itemDe(resultado: ResultadoMotor, codigo: string): ItemMotor | undefined {
  return resultado.itens.find((item) => item.codigo === codigo);
}

// ---------------------------------------------------------------- motor: o desconto

test("centavo exato: 5 dias + 1 DSR sobre R$ 3.300,00 descontam R$ 660,00", () => {
  const resultado = folha({
    salario_base_centavos: 330_000,
    suspensoes: [suspensao({})],
  });
  const item = itemDe(resultado, CODIGO_DESCONTO_SUSPENSAO);
  assert.ok(item, "o item 1203 tem que ser emitido");
  // (5 + 1) × 3.300,00 ÷ 30 = 660,00 — sem um centavo de ruído.
  assert.equal(item.valor_centavos, 66_000);
  assert.equal(item.natureza, "desconto");
  assert.equal(item.referencia, 6);
  // A memória abre as duas parcelas, aponta a medida e carrega o AVISO da
  // regra do DSR a confirmar com o contador (decisão D2:a).
  assert.equal(item.memoria.dias_corridos, 5);
  assert.equal(item.memoria.semanas_com_dsr_perdido, 1);
  assert.match(String(item.memoria.regra_dsr), /A CONFIRMAR com o contador/);
  const medidas = item.memoria.medidas as { medida_disciplinar_id: number }[];
  assert.equal(medidas[0].medida_disciplinar_id, 501);
});

test("meio-para-cima uma vez só: 1 dia de R$ 1.000,00 desconta R$ 33,33", () => {
  const resultado = folha({
    salario_base_centavos: 100_000,
    suspensoes: [suspensao({ dias_na_competencia: 1, domingos_dsr: [] })],
  });
  // 100.000 ÷ 30 = 3.333,33… → 33,33 (a fração de centavo não sobe a 33,34).
  assert.equal(itemDe(resultado, CODIGO_DESCONTO_SUSPENSAO)?.valor_centavos, 3_333);
});

test("o desconto REDUZ as bases (INSS/IRRF/FGTS), como a falta reduz", () => {
  const resultado = folha({
    salario_base_centavos: 330_000,
    suspensoes: [suspensao({})],
  });
  assert.equal(resultado.base_inss_centavos, 330_000 - 66_000);
  assert.equal(resultado.base_irrf_centavos, 330_000 - 66_000);
  assert.equal(resultado.base_fgts_centavos, 330_000 - 66_000);
});

test("sem suspensão = zero: entrada ausente ou vazia não emite item nenhum", () => {
  const semCampo = folha({ salario_base_centavos: 330_000 });
  const vazia = folha({ salario_base_centavos: 330_000, suspensoes: [] });
  const zerada = folha({
    salario_base_centavos: 330_000,
    suspensoes: [suspensao({ dias_na_competencia: 0, domingos_dsr: [] })],
  });
  for (const resultado of [semCampo, vazia, zerada]) {
    assert.equal(itemDe(resultado, CODIGO_DESCONTO_SUSPENSAO), undefined);
    assert.equal(resultado.total_descontos_centavos, itemDe(resultado, "2001")!.valor_centavos + (itemDe(resultado, "2002")?.valor_centavos ?? 0));
  }
});

test("duas medidas somam na MESMA rubrica, cada uma aberta na memória", () => {
  const resultado = folha({
    salario_base_centavos: 330_000,
    suspensoes: [
      suspensao({ medida_id: 501, dias_na_competencia: 2, domingos_dsr: [] }),
      suspensao({
        medida_id: 502,
        inicio: "2026-08-24",
        fim: "2026-08-26",
        dias_na_competencia: 3,
        domingos_dsr: ["2026-08-30"],
      }),
    ],
  });
  const item = itemDe(resultado, CODIGO_DESCONTO_SUSPENSAO);
  assert.ok(item);
  // (2 + 3 dias + 1 DSR) × 110,00 = 660,00 — um item só, duas medidas dentro.
  assert.equal(item.valor_centavos, 66_000);
  assert.equal((item.memoria.medidas as unknown[]).length, 2);
});

test("dias inválidos (negativo ou fracionado) derrubam o motor com erro legível", () => {
  assert.throws(
    () =>
      folha({
        salario_base_centavos: 330_000,
        suspensoes: [suspensao({ dias_na_competencia: -1 })],
      }),
    ErroMotor
  );
  assert.throws(
    () =>
      folha({
        salario_base_centavos: 330_000,
        suspensoes: [suspensao({ dias_na_competencia: 2.5 })],
      }),
    ErroMotor
  );
});

test("1203 é automática: lançar variável nela é erro, e a lista de lançamento nem a oferece", () => {
  assert.ok(CODIGOS_AUTOMATICOS.includes(CODIGO_DESCONTO_SUSPENSAO));
  assert.throws(
    () =>
      folha({
        salario_base_centavos: 330_000,
        variaveis: [
          {
            codigo: CODIGO_DESCONTO_SUSPENSAO,
            referencia: 5,
            valor_centavos: null,
            origem: "manual",
          },
        ],
      }),
    /automática/
  );
});
