// Bateria do MOTOR DE FÉRIAS — src/dominios/folha/calculo-ferias.ts, função
// calcularFerias (frente 1.6, 1º estágio da lane Folha).
//
// Por que estes casos e não outros: cobrem exatamente o que o escopo da frente
// pede — 30 dias cheios, gozo parcial, abono pecuniário, com e sem médias, o
// AVISO na memória quando as médias não existem, e centavos exatos nas bordas
// de arredondamento (a fronteira .5 e o terço que não fecha em centavo). Mais
// as fronteiras tributárias que o motor mensal já provou serem traiçoeiras:
// teto do INSS, dependentes no regime completo e o regime vencedor do IRRF.
// Todos os valores esperados foram CALCULADOS À MÃO (conta no comentário de
// cada caso) contra as tabelas legais 2026 do seed da 0013 — os mesmos números
// de tests/folha.test.ts.
//
// Nada aqui toca banco: o motor é puro, e é por isso que ele cabe no portão rápido.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVISO_MEDIAS_PENDENTES,
  AVISO_PREVIA_ISOLADA,
  calcularFerias,
  type EntradaMotorFerias,
  type ResultadoMotorFerias,
} from "../src/dominios/folha/calculo-ferias";
import {
  ErroMotor,
  type ParametrosFolhaMotor,
  type RubricaMotor,
  type TabelaInssMotor,
  type TabelaIrrfMotor,
} from "../src/dominios/folha/calculo";
import type { NaturezaRubrica, TipoCalculo } from "../src/dominios/folha/esquemas";

// ------------------------------------------------------------------ fixtures
// Cópia fiel do seed da 0013 (tabelas legais 2026) e da 0038 (divisores), em
// CENTAVOS INTEIROS — os mesmos números de tests/folha.test.ts.

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
    parametro: null,
  };
}

// Catálogo mínimo do motor de férias: 0136/0137 (migração 0092, incidem no
// caso gozado), 1401 (0028, indenizatória — flags FALSE) e 2001/2002 (0013).
const CATALOGO: RubricaMotor[] = [
  montarRubrica("0136", "Férias", "provento", "automatico", true),
  montarRubrica("0137", "Adicional de Férias", "provento", "automatico", true),
  montarRubrica("1401", "Abono Pecuniário", "provento", "valor_informado", false),
  montarRubrica("2001", "Desconto INSS", "desconto", "automatico", false),
  montarRubrica("2002", "IRRF", "desconto", "automatico", false),
];

type Ajuste = Partial<EntradaMotorFerias> & {
  salario_base_centavos: number;
  dias_gozo: number;
};

function ferias(ajuste: Ajuste): ResultadoMotorFerias {
  return calcularFerias({
    modalidade: "gozadas",
    dependentes_irrf: 0,
    dias_abono: 0,
    rubricas: CATALOGO,
    tabela_inss: TABELA_INSS,
    tabela_irrf: TABELA_IRRF,
    parametros: PARAMETROS,
    ...ajuste,
  });
}

function valorDe(resultado: ResultadoMotorFerias, codigo: string): number | null {
  return (
    resultado.itens.find((item) => item.codigo === codigo)?.valor_centavos ??
    null
  );
}

function memoriaDe(
  resultado: ResultadoMotorFerias,
  codigo: string
): Record<string, unknown> {
  const item = resultado.itens.find((entrada) => entrada.codigo === codigo);
  assert.ok(item, `item ${codigo} deveria existir`);
  return item.memoria;
}

// ------------------------------------------------------------------ 30 dias cheios

test("30 dias cheios: férias + terço, INSS progressivo e IRRF simplificado", () => {
  // Salário 3.000,00 · 30 dias · sem abono, sem médias, sem dependentes.
  // 0136 = 3.000,00 · 0137 = 1.000,00 · base = 4.000,00.
  // INSS: 1.631,00×7,5% = 122,325 + 1.302,57×9% = 117,2313 + 1.066,43×12%
  //   = 127,9716 → 367,5279 → 367,53.
  // IRRF completo: 4.000,00 − 367,53 = 3.632,47 → 15% − 394,16 = 150,7105;
  // simplificado: 4.000,00 − 607,20 = 3.392,80 → 15% − 394,16 = 114,76.
  // Vale o MENOR: simplificado, 114,76.
  const resultado = ferias({ salario_base_centavos: 300_000, dias_gozo: 30 });
  assert.equal(valorDe(resultado, "0136"), 300_000);
  assert.equal(valorDe(resultado, "0137"), 100_000);
  assert.equal(valorDe(resultado, "1401"), null); // sem abono, sem item
  assert.equal(valorDe(resultado, "2001"), 36_753);
  assert.equal(valorDe(resultado, "2002"), 11_476);
  assert.equal(resultado.base_inss_centavos, 400_000);
  assert.equal(resultado.base_irrf_centavos, 400_000);
  assert.equal(resultado.total_proventos_centavos, 400_000);
  assert.equal(resultado.total_descontos_centavos, 48_229);
  assert.equal(resultado.liquido_centavos, 351_771);
  assert.equal(
    memoriaDe(resultado, "2002").regime_vencedor,
    "simplificado"
  );
});

// ------------------------------------------------------------------ gozo parcial

test("gozo parcial (20 dias): proporcional por dias e IRRF zerado não vira item", () => {
  // 0136 = 3.000,00 × 20/30 = 2.000,00 · 0137 = 2.000,00 ÷ 3 = 666,666… → 666,67.
  // Base 2.666,67 → INSS 122,325 + 1.035,67×9% = 93,2103 → 215,5353 → 215,54.
  // IRRF: completo 2.666,67 − 215,54 = 2.451,13 → 7,5% − 182,16 = 1,67475;
  // simplificado 2.059,47 → faixa isenta = 0. Menor: 0 → item não é gravado.
  const resultado = ferias({ salario_base_centavos: 300_000, dias_gozo: 20 });
  assert.equal(valorDe(resultado, "0136"), 200_000);
  assert.equal(valorDe(resultado, "0137"), 66_667);
  assert.equal(valorDe(resultado, "2001"), 21_554);
  assert.equal(valorDe(resultado, "2002"), null);
  assert.equal(resultado.liquido_centavos, 245_113);
  assert.equal(
    memoriaDe(resultado, "0136").formula,
    "dias de gozo × ((salário + média) ÷ 30)"
  );
});

// ------------------------------------------------------------------ abono pecuniário

test("abono (20 gozo + 10 vendidos): 1401 leva dias + 1/3 e fica FORA das bases", () => {
  // 1401 = 3.000,00 × 10/30 = 1.000,00 + 1/3 (333,333…) = 1.333,333… → 1.333,33.
  // Bases idênticas ao caso de 20 dias (abono é indenizatório): INSS 215,54,
  // IRRF 0. Líquido = 2.000,00 + 666,67 + 1.333,33 − 215,54 = 3.784,46.
  const resultado = ferias({
    salario_base_centavos: 300_000,
    dias_gozo: 20,
    dias_abono: 10,
  });
  assert.equal(valorDe(resultado, "1401"), 133_333);
  assert.equal(resultado.base_inss_centavos, 266_667);
  assert.equal(resultado.base_irrf_centavos, 266_667);
  assert.equal(valorDe(resultado, "2001"), 21_554);
  assert.equal(resultado.total_proventos_centavos, 400_000);
  assert.equal(resultado.liquido_centavos, 378_446);
  const memoria = memoriaDe(resultado, "1401");
  assert.match(String(memoria.tributacao), /não incide/i);
  assert.match(String(memoria.regra_terco), /mesma rubrica/i);
});

// ------------------------------------------------------------------ com e sem médias

test("sem médias: aviso explícito na memória e na saída", () => {
  const resultado = ferias({ salario_base_centavos: 300_000, dias_gozo: 30 });
  assert.ok(resultado.avisos.includes(AVISO_MEDIAS_PENDENTES));
  assert.equal(
    memoriaDe(resultado, "0136").aviso_medias,
    AVISO_MEDIAS_PENDENTES
  );
  assert.equal(memoriaDe(resultado, "0136").media_variaveis, 0);
  // A prévia isolada também avisa — INSS/IRRF sem o salário do mês.
  assert.ok(resultado.avisos.includes(AVISO_PREVIA_ISOLADA));
});

test("com médias: remuneração-base soma a média e o aviso some", () => {
  // Média 600,00 → remuneração 3.600,00 · 30 dias: 0136 = 3.600,00,
  // 0137 = 1.200,00, base 4.800,00.
  // INSS: 122,325 + 117,2313 + 1.466,80×12% = 176,016 + 399,63×14% = 55,9482
  //   → 471,5205 → 471,52.
  // IRRF completo: 4.800,00 − 471,52 = 4.328,48 → 22,5% − 675,49 = 298,418;
  // simplificado: 4.192,80 → 22,5% − 675,49 = 267,89. Menor: 267,89.
  const resultado = ferias({
    salario_base_centavos: 300_000,
    dias_gozo: 30,
    media_variaveis_centavos: 60_000,
  });
  assert.equal(valorDe(resultado, "0136"), 360_000);
  assert.equal(valorDe(resultado, "0137"), 120_000);
  assert.equal(valorDe(resultado, "2001"), 47_152);
  assert.equal(valorDe(resultado, "2002"), 26_789);
  assert.equal(resultado.liquido_centavos, 406_059);
  assert.ok(!resultado.avisos.includes(AVISO_MEDIAS_PENDENTES));
  const memoria = memoriaDe(resultado, "0136");
  assert.equal(memoria.media_variaveis, 600);
  assert.equal(memoria.aviso_medias, undefined);
});

// ------------------------------------------------------------------ bordas de arredondamento

test("borda do meio centavo: ,5 sobe; terço que não fecha arredonda uma vez só", () => {
  // Salário 3.000,05 · 15 dias: 0136 = 3.000,05 × 15/30 = 1.500,025 → fronteira
  // exata .5 → sobe para 1.500,03. Terço = 1.500,025 ÷ 3 = 500,00833… → 500,01
  // (calculado sobre o valor SEM arredondar — uma única passada de
  // arredondamento por item).
  const resultado = ferias({ salario_base_centavos: 300_005, dias_gozo: 15 });
  assert.equal(valorDe(resultado, "0136"), 150_003);
  assert.equal(valorDe(resultado, "0137"), 50_001);
});

test("teto do INSS: base de férias acima do teto contribui só até ele", () => {
  // Salário 9.000,00 · 30 dias: base 12.000,00 > teto 8.565,28.
  // INSS pela tabela inteira: 122,325 + 117,2313 + 176,016 + 4.164,91×14%
  //   = 583,0874 → total 998,6597 → 998,66.
  // IRRF completo: 12.000,00 − 998,66 = 11.001,34 → 27,5% − 908,73 = 2.116,6385
  //   → 2.116,64; simplificado: 11.392,80 → 27,5% − 908,73 = 2.224,29.
  //   Menor: COMPLETO.
  const resultado = ferias({ salario_base_centavos: 900_000, dias_gozo: 30 });
  assert.equal(valorDe(resultado, "2001"), 99_866);
  assert.equal(memoriaDe(resultado, "2001").teto_aplicado, true);
  assert.equal(valorDe(resultado, "2002"), 211_664);
  assert.equal(memoriaDe(resultado, "2002").regime_vencedor, "completo");
  assert.equal(resultado.liquido_centavos, 888_470);
});

test("dependentes reduzem o IRRF no regime completo", () => {
  // Salário 3.000,00 · 30 dias · 2 dependentes: completo = 4.000,00 − 367,53
  // − 2×189,59 = 3.253,29 → 15% − 394,16 = 93,8335 → 93,83; simplificado
  // continua 114,76. Menor: completo.
  const resultado = ferias({
    salario_base_centavos: 300_000,
    dias_gozo: 30,
    dependentes_irrf: 2,
  });
  assert.equal(valorDe(resultado, "2002"), 9_383);
  assert.equal(memoriaDe(resultado, "2002").regime_vencedor, "completo");
  assert.equal(resultado.liquido_centavos, 353_864);
});

// ------------------------------------------------------------------ gozadas × indenizadas

test("indenizadas: mesmas rubricas, base zero, sem INSS nem IRRF", () => {
  const resultado = ferias({
    modalidade: "indenizadas",
    salario_base_centavos: 300_000,
    dias_gozo: 30,
  });
  assert.equal(valorDe(resultado, "0136"), 300_000);
  assert.equal(valorDe(resultado, "0137"), 100_000);
  assert.equal(valorDe(resultado, "2001"), null);
  assert.equal(valorDe(resultado, "2002"), null);
  assert.equal(resultado.base_inss_centavos, 0);
  assert.equal(resultado.base_irrf_centavos, 0);
  assert.equal(resultado.liquido_centavos, 400_000);
  assert.match(String(memoriaDe(resultado, "0136").tributacao), /INDENIZADAS/);
  assert.match(String(memoriaDe(resultado, "0136").tributacao), /386/);
});

test("indenizadas com abono é erro: abono é da programação de gozo", () => {
  assert.throws(
    () =>
      ferias({
        modalidade: "indenizadas",
        salario_base_centavos: 300_000,
        dias_gozo: 30,
        dias_abono: 5,
      }),
    ErroMotor
  );
});

// ------------------------------------------------------------------ borda de entrada

test("limites da CLT e centavo inteiro valem na borda do motor", () => {
  const casos: Ajuste[] = [
    { salario_base_centavos: 300_000, dias_gozo: 4 }, // < 5 (art. 134 §1º)
    { salario_base_centavos: 300_000, dias_gozo: 31 }, // > 30 (art. 130)
    { salario_base_centavos: 300_000, dias_gozo: 30, dias_abono: 11 }, // > 10 (art. 143)
    { salario_base_centavos: 300_000.5, dias_gozo: 30 }, // fração de centavo
    { salario_base_centavos: -1, dias_gozo: 30 }, // negativo
    {
      salario_base_centavos: 300_000,
      dias_gozo: 30,
      media_variaveis_centavos: 10.5, // média com fração de centavo
    },
  ];
  for (const caso of casos) {
    assert.throws(() => ferias(caso), ErroMotor, JSON.stringify(caso));
  }
});

test("rubrica de férias fora do catálogo derruba com mensagem acionável", () => {
  assert.throws(
    () =>
      ferias({
        salario_base_centavos: 300_000,
        dias_gozo: 30,
        rubricas: CATALOGO.filter((rubrica) => rubrica.codigo !== "0136"),
      }),
    /Rubrica 0136 sem versão vigente/
  );
});
