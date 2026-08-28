// Bateria do MOTOR DE 13º SALÁRIO — src/dominios/folha/calculo-13.ts, função
// calcularDecimo (onda 2, 2º estágio da lane Folha).
//
// Por que estes casos e não outros: cobrem exatamente o que o escopo da onda
// pede — ano cheio, admitido em junho (proporcional), admitido dia 20 (o mês
// NÃO conta, Lei 4.090 art. 1º §1º), a fronteira exata dos 15 dias, 1ª × 2ª
// parcela, com e sem médias, e centavos exatos na fronteira .5. Mais as
// fronteiras tributárias que os motores anteriores já provaram traiçoeiras:
// teto do INSS, dependentes no regime completo e o regime vencedor do IRRF —
// aqui em TRIBUTAÇÃO EXCLUSIVA sobre o 13º total. Todos os valores esperados
// foram CALCULADOS À MÃO (conta no comentário de cada caso) contra as tabelas
// legais 2026 do seed da 0013 — os mesmos números de tests/folha.test.ts e
// tests/folha-ferias.test.ts.
//
// Nada aqui toca banco: o motor é puro, e é por isso que ele cabe no portão rápido.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVISO_ADIANTAMENTO_RECALCULADO,
  AVISO_ADIANTAMENTO_SEM_DESCONTO,
  AVISO_AFASTAMENTO_NAO_CONSIDERADO,
  AVISO_AVOS_PROJETADOS,
  AVISO_IRRF_REGIME_DECIMO,
  AVISO_MEDIAS_PENDENTES_DECIMO,
  AVISO_TRIBUTACAO_EXCLUSIVA,
  calcularDecimo,
  type EntradaMotorDecimo,
  type ResultadoMotorDecimo,
} from "../src/dominios/folha/calculo-13";
import {
  ErroMotor,
  type RubricaMotor,
  type TabelaInssMotor,
  type TabelaIrrfMotor,
} from "../src/dominios/folha/calculo";
import {
  CODIGO_ADIANTAMENTO_DECIMO,
  CODIGO_DECIMO,
  CODIGO_DESCONTO_ADIANTAMENTO_DECIMO,
  CODIGO_INSS_DECIMO,
  CODIGO_IRRF_DECIMO,
  CODIGOS_DO_MOTOR,
  type NaturezaRubrica,
} from "../src/dominios/folha/esquemas";

// ------------------------------------------------------------------ fixtures
// Cópia fiel do seed da 0013 (tabelas legais 2026), em CENTAVOS INTEIROS — os
// mesmos números de tests/folha.test.ts e tests/folha-ferias.test.ts.

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
    tipo_calculo: "automatico",
    parametro: null,
  };
}

// Catálogo mínimo do motor de 13º (migração 0094): 0138 incide nas três bases;
// adiantamento (1601), compensação (1602) e os próprios descontos legais
// (2003/2004) não incidem em nada.
const CATALOGO: RubricaMotor[] = [
  montarRubrica(CODIGO_DECIMO, "13º Salário", "provento", true),
  montarRubrica(
    CODIGO_ADIANTAMENTO_DECIMO,
    "Adiantamento de 13º Salário",
    "provento",
    false
  ),
  montarRubrica(
    CODIGO_DESCONTO_ADIANTAMENTO_DECIMO,
    "Desconto do Adiantamento de 13º",
    "desconto",
    false
  ),
  montarRubrica(CODIGO_INSS_DECIMO, "INSS sobre 13º Salário", "desconto", false),
  montarRubrica(CODIGO_IRRF_DECIMO, "IRRF sobre 13º Salário", "desconto", false),
];

type Ajuste = Partial<EntradaMotorDecimo> & {
  salario_base_centavos: number;
  parcela: 1 | 2;
};

function decimo(ajuste: Ajuste): ResultadoMotorDecimo {
  return calcularDecimo({
    ano: 2026,
    data_admissao: "2024-05-10",
    dependentes_irrf: 0,
    rubricas: CATALOGO,
    tabela_inss: TABELA_INSS,
    tabela_irrf: TABELA_IRRF,
    ...ajuste,
  });
}

function valorDe(resultado: ResultadoMotorDecimo, codigo: string): number | null {
  return (
    resultado.itens.find((item) => item.codigo === codigo)?.valor_centavos ??
    null
  );
}

function memoriaDe(
  resultado: ResultadoMotorDecimo,
  codigo: string
): Record<string, unknown> {
  const item = resultado.itens.find((entrada) => entrada.codigo === codigo);
  assert.ok(item, `item ${codigo} deveria existir`);
  return item.memoria;
}

// ------------------------------------------------------------------ ano cheio

test("ano cheio, 1ª parcela: metade do 13º, SEM desconto e sem base nenhuma", () => {
  // Admitido em 2024 · salário 3.000,00 · 12 avos.
  // 13º = 3.000,00 · adiantamento = 1.500,00. Nada de INSS/IRRF (Lei 4.749/65).
  const resultado = decimo({ salario_base_centavos: 300_000, parcela: 1 });
  assert.equal(resultado.avos, 12);
  assert.equal(resultado.decimo_integral_centavos, 300_000);
  assert.equal(valorDe(resultado, CODIGO_ADIANTAMENTO_DECIMO), 150_000);
  assert.equal(valorDe(resultado, CODIGO_DECIMO), null);
  assert.equal(valorDe(resultado, CODIGO_INSS_DECIMO), null);
  assert.equal(valorDe(resultado, CODIGO_IRRF_DECIMO), null);
  assert.equal(resultado.base_inss_centavos, 0);
  assert.equal(resultado.base_irrf_centavos, 0);
  assert.equal(resultado.total_proventos_centavos, 150_000);
  assert.equal(resultado.total_descontos_centavos, 0);
  assert.equal(resultado.liquido_centavos, 150_000);
  assert.ok(resultado.avisos.includes(AVISO_ADIANTAMENTO_SEM_DESCONTO));
});

test("ano cheio, 2ª parcela: 13º integral − adiantamento, INSS em separado, IRRF isento", () => {
  // 0138 = 3.000,00 · 1602 = 1.500,00 (metade recalculada).
  // INSS sobre o TOTAL: 1.631,00×7,5% = 122,325 + 1.302,57×9% = 117,2313
  //   + 66,43×12% = 7,9716 → 247,5279 → 247,53.
  // IRRF: completo 3.000,00 − 247,53 = 2.752,47 → 7,5% − 182,16 = 24,27525;
  // simplificado 3.000,00 − 607,20 = 2.392,80 → faixa isenta = 0.
  // Menor: 0 → item não é gravado.
  const resultado = decimo({ salario_base_centavos: 300_000, parcela: 2 });
  assert.equal(resultado.avos, 12);
  assert.equal(valorDe(resultado, CODIGO_DECIMO), 300_000);
  assert.equal(valorDe(resultado, CODIGO_DESCONTO_ADIANTAMENTO_DECIMO), 150_000);
  assert.equal(valorDe(resultado, CODIGO_INSS_DECIMO), 24_753);
  assert.equal(valorDe(resultado, CODIGO_IRRF_DECIMO), null);
  assert.equal(resultado.base_inss_centavos, 300_000);
  assert.equal(resultado.base_irrf_centavos, 300_000);
  assert.equal(resultado.total_proventos_centavos, 300_000);
  assert.equal(resultado.total_descontos_centavos, 174_753);
  assert.equal(resultado.liquido_centavos, 125_247);
  // O item 0138 carrega o avo como referência e a tributação exclusiva na memória.
  const item = resultado.itens.find((i) => i.codigo === CODIGO_DECIMO);
  assert.equal(item?.referencia, 12);
  assert.match(String(memoriaDe(resultado, CODIGO_DECIMO).tributacao), /EXCLUSIVA/);
  assert.ok(resultado.avisos.includes(AVISO_TRIBUTACAO_EXCLUSIVA));
  assert.ok(resultado.avisos.includes(AVISO_ADIANTAMENTO_RECALCULADO));
});

// ------------------------------------------------------------------ proporcional por admissão

test("admitido em junho: 7 avos (junho inteiro conta) nas duas parcelas", () => {
  // Admissão 01/06/2026 → jun–dez = 7 avos. 13º = 3.000,00 × 7/12 = 1.750,00.
  // 1ª: metade = 875,00. 2ª: INSS sobre 1.750,00 = 122,325 + 119,00×9% = 10,71
  //   → 133,035 → fronteira exata .5 → sobe → 133,04. IRRF isento nos dois
  //   regimes. Líquido da 2ª = 1.750,00 − 875,00 − 133,04 = 741,96.
  const primeira = decimo({
    salario_base_centavos: 300_000,
    parcela: 1,
    data_admissao: "2026-06-01",
  });
  assert.equal(primeira.avos, 7);
  assert.equal(valorDe(primeira, CODIGO_ADIANTAMENTO_DECIMO), 87_500);

  const segunda = decimo({
    salario_base_centavos: 300_000,
    parcela: 2,
    data_admissao: "2026-06-01",
  });
  assert.equal(segunda.avos, 7);
  assert.equal(valorDe(segunda, CODIGO_DECIMO), 175_000);
  assert.equal(valorDe(segunda, CODIGO_DESCONTO_ADIANTAMENTO_DECIMO), 87_500);
  assert.equal(valorDe(segunda, CODIGO_INSS_DECIMO), 13_304);
  assert.equal(valorDe(segunda, CODIGO_IRRF_DECIMO), null);
  assert.equal(segunda.liquido_centavos, 74_196);
});

test("admitido dia 20: o mês da admissão NÃO conta (11 dias < 15)", () => {
  // Admissão 20/06/2026 → junho tem 30 dias, vínculo em 11 → não conta.
  // Avos = jul–dez = 6. Adiantamento = 3.000,00 × 6/12 ÷ 2 = 750,00.
  const resultado = decimo({
    salario_base_centavos: 300_000,
    parcela: 1,
    data_admissao: "2026-06-20",
  });
  assert.equal(resultado.avos, 6);
  assert.equal(valorDe(resultado, CODIGO_ADIANTAMENTO_DECIMO), 75_000);
  const junho = resultado.avos_detalhe.find((mes) => mes.mes === 6);
  assert.equal(junho?.dias_de_vinculo, 11);
  assert.equal(junho?.conta, false);
});

test("fronteira exata dos 15 dias: admitido em 17/08 conta agosto (31−17+1 = 15)", () => {
  // Agosto tem 31 dias → 15 dias de vínculo → conta. Avos = ago–dez = 5.
  // Adiantamento = 3.000,00 × 5/12 ÷ 2 = 625,00.
  const resultado = decimo({
    salario_base_centavos: 300_000,
    parcela: 1,
    data_admissao: "2026-08-17",
  });
  assert.equal(resultado.avos, 5);
  assert.equal(valorDe(resultado, CODIGO_ADIANTAMENTO_DECIMO), 62_500);
  const agosto = resultado.avos_detalhe.find((mes) => mes.mes === 8);
  assert.equal(agosto?.dias_de_vinculo, 15);
  assert.equal(agosto?.conta, true);
});

test("admitido em dezembro dia 20: zero avos, nenhum item, totais zerados", () => {
  // Dezembro: 31 − 20 + 1 = 12 dias < 15 → 0 avos. 13º = 0 → item de valor
  // zero não é gravado; a saída continua explicável pelos avisos e detalhe.
  const resultado = decimo({
    salario_base_centavos: 300_000,
    parcela: 2,
    data_admissao: "2026-12-20",
  });
  assert.equal(resultado.avos, 0);
  assert.equal(resultado.itens.length, 0);
  assert.equal(resultado.decimo_integral_centavos, 0);
  assert.equal(resultado.liquido_centavos, 0);
});

// ------------------------------------------------------------------ com e sem médias

test("sem médias: aviso explícito na memória e na saída", () => {
  const resultado = decimo({ salario_base_centavos: 300_000, parcela: 2 });
  assert.ok(resultado.avisos.includes(AVISO_MEDIAS_PENDENTES_DECIMO));
  assert.equal(
    memoriaDe(resultado, CODIGO_DECIMO).aviso_medias,
    AVISO_MEDIAS_PENDENTES_DECIMO
  );
  assert.equal(memoriaDe(resultado, CODIGO_DECIMO).media_variaveis, 0);
  // Os defaults conservadores também avisam: avos projetados e afastamentos
  // não considerados.
  assert.ok(resultado.avisos.includes(AVISO_AVOS_PROJETADOS));
  assert.ok(resultado.avisos.includes(AVISO_AFASTAMENTO_NAO_CONSIDERADO));
});

test("com médias: remuneração-base soma a média e o aviso some", () => {
  // Média 600,00 → remuneração 3.600,00 · 12 avos · 2ª parcela.
  // 0138 = 3.600,00 · 1602 = 1.800,00.
  // INSS: 122,325 + 117,2313 + 666,43×12% = 79,9716 → 319,5279 → 319,53.
  // IRRF: completo 3.600,00 − 319,53 = 3.280,47 → 15% − 394,16 = 97,9105;
  // simplificado 2.992,80 → 15% − 394,16 = 54,76. Menor: simplificado, 54,76.
  const resultado = decimo({
    salario_base_centavos: 300_000,
    parcela: 2,
    media_variaveis_centavos: 60_000,
  });
  assert.equal(valorDe(resultado, CODIGO_DECIMO), 360_000);
  assert.equal(valorDe(resultado, CODIGO_DESCONTO_ADIANTAMENTO_DECIMO), 180_000);
  assert.equal(valorDe(resultado, CODIGO_INSS_DECIMO), 31_953);
  assert.equal(valorDe(resultado, CODIGO_IRRF_DECIMO), 5_476);
  assert.equal(resultado.liquido_centavos, 142_571);
  assert.ok(!resultado.avisos.includes(AVISO_MEDIAS_PENDENTES_DECIMO));
  const memoria = memoriaDe(resultado, CODIGO_DECIMO);
  assert.equal(memoria.media_variaveis, 600);
  assert.equal(memoria.aviso_medias, undefined);
  assert.equal(
    memoriaDe(resultado, CODIGO_IRRF_DECIMO).regime_vencedor,
    "simplificado"
  );
  assert.ok(resultado.avisos.includes(AVISO_IRRF_REGIME_DECIMO));
});

// ------------------------------------------------------------------ bordas de arredondamento

test("fronteira do meio centavo: metade em ,5 sobe — e a 2ª parcela deduz o MESMO número", () => {
  // Salário 3.000,05 · 12 avos: metade = 1.500,025 → fronteira exata .5 →
  // sobe para 1.500,03 na 1ª parcela. Na 2ª, a metade recalculada parte do
  // MESMO intermediário sem arredondar → também 1.500,03: as duas parcelas
  // fecham no centavo entre si.
  const primeira = decimo({ salario_base_centavos: 300_005, parcela: 1 });
  assert.equal(valorDe(primeira, CODIGO_ADIANTAMENTO_DECIMO), 150_003);

  // 2ª: 0138 = 3.000,05 · INSS = 122,325 + 117,2313 + 66,48×12% = 7,9776
  //   → 247,5339 → 247,53. IRRF: completo 2.752,52 → 7,5% − 182,16 = 24,279;
  //   simplificado 2.392,85 → 0. Menor: 0.
  const segunda = decimo({ salario_base_centavos: 300_005, parcela: 2 });
  assert.equal(valorDe(segunda, CODIGO_DECIMO), 300_005);
  assert.equal(valorDe(segunda, CODIGO_DESCONTO_ADIANTAMENTO_DECIMO), 150_003);
  assert.equal(valorDe(segunda, CODIGO_INSS_DECIMO), 24_753);
  assert.equal(segunda.liquido_centavos, 125_249);
});

test("teto do INSS: 13º acima do teto contribui só até ele; IRRF vence o completo", () => {
  // Salário 9.000,00 · 12 avos · 2ª parcela: base 9.000,00 > teto 8.565,28.
  // INSS pela tabela inteira: 122,325 + 117,2313 + 176,016 + 4.164,91×14%
  //   = 583,0874 → 998,6597 → 998,66.
  // IRRF: completo 9.000,00 − 998,66 = 8.001,34 → 27,5% − 908,73 = 1.291,6385
  //   → 1.291,64; simplificado 8.392,80 → 27,5% − 908,73 = 1.399,29.
  //   Menor: COMPLETO.
  const resultado = decimo({ salario_base_centavos: 900_000, parcela: 2 });
  assert.equal(valorDe(resultado, CODIGO_INSS_DECIMO), 99_866);
  assert.equal(memoriaDe(resultado, CODIGO_INSS_DECIMO).teto_aplicado, true);
  assert.equal(valorDe(resultado, CODIGO_IRRF_DECIMO), 129_164);
  assert.equal(
    memoriaDe(resultado, CODIGO_IRRF_DECIMO).regime_vencedor,
    "completo"
  );
  assert.equal(resultado.liquido_centavos, 220_970);
});

test("dependentes reduzem o IRRF do 13º no regime completo", () => {
  // Salário 5.000,00 · 12 avos · 2 dependentes · 2ª parcela.
  // INSS: 122,325 + 117,2313 + 176,016 + 599,63×14% = 83,9482 → 499,5205 → 499,52.
  // Completo: 5.000,00 − 499,52 − 2×189,59 = 4.121,30 → 22,5% − 675,49
  //   = 251,8025 → 251,80; simplificado 4.392,80 → 22,5% − 675,49 = 312,89.
  // Menor: completo.
  const resultado = decimo({
    salario_base_centavos: 500_000,
    parcela: 2,
    dependentes_irrf: 2,
  });
  assert.equal(valorDe(resultado, CODIGO_INSS_DECIMO), 49_952);
  assert.equal(valorDe(resultado, CODIGO_IRRF_DECIMO), 25_180);
  assert.equal(
    memoriaDe(resultado, CODIGO_IRRF_DECIMO).regime_vencedor,
    "completo"
  );
  assert.equal(resultado.liquido_centavos, 174_868);
});

// ------------------------------------------------------------------ parâmetros opcionais

test("avos de afastamento informados reduzem os avos e calam o aviso", () => {
  // 12 avos do vínculo − 2 de afastamento = 10. Adiantamento = 3.000,00 ×
  // 10/12 ÷ 2 = 1.250,00.
  const resultado = decimo({
    salario_base_centavos: 300_000,
    parcela: 1,
    avos_afastamento: 2,
  });
  assert.equal(resultado.avos, 10);
  assert.equal(valorDe(resultado, CODIGO_ADIANTAMENTO_DECIMO), 125_000);
  assert.ok(!resultado.avisos.includes(AVISO_AFASTAMENTO_NAO_CONSIDERADO));
});

test("adiantamento pago informado: a 2ª parcela deduz o pago, não a metade recalculada", () => {
  const resultado = decimo({
    salario_base_centavos: 300_000,
    parcela: 2,
    adiantamento_pago_centavos: 140_000,
  });
  assert.equal(valorDe(resultado, CODIGO_DESCONTO_ADIANTAMENTO_DECIMO), 140_000);
  assert.equal(resultado.liquido_centavos, 135_247);
  assert.ok(!resultado.avisos.includes(AVISO_ADIANTAMENTO_RECALCULADO));
  assert.match(
    String(memoriaDe(resultado, CODIGO_DESCONTO_ADIANTAMENTO_DECIMO).formula),
    /efetivamente pago/
  );
});

// ------------------------------------------------------------------ borda de entrada

test("limites e centavo inteiro valem na borda do motor", () => {
  const casos: Ajuste[] = [
    { salario_base_centavos: 300_000, parcela: 1, ano: 1900 }, // antes da Lei 4.090
    { salario_base_centavos: 300_000, parcela: 3 as 1 | 2 }, // parcela inexistente
    { salario_base_centavos: 300_000, parcela: 1, data_admissao: "2026-02-30" }, // data impossível
    { salario_base_centavos: 300_000, parcela: 1, data_admissao: "20/06/2026" }, // formato errado
    { salario_base_centavos: 300_000, parcela: 1, data_admissao: "2027-01-01" }, // depois do ano
    { salario_base_centavos: 300_000.5, parcela: 1 }, // fração de centavo
    { salario_base_centavos: -1, parcela: 1 }, // negativo
    { salario_base_centavos: 300_000, parcela: 1, media_variaveis_centavos: 10.5 },
    { salario_base_centavos: 300_000, parcela: 1, avos_afastamento: 13 },
    { salario_base_centavos: 300_000, parcela: 1, avos_afastamento: -1 },
    {
      // afastamento maior que os avos do vínculo (admissão em junho = 7 avos)
      salario_base_centavos: 300_000,
      parcela: 1,
      data_admissao: "2026-06-01",
      avos_afastamento: 8,
    },
    {
      // adiantamento pago é dado da 2ª parcela
      salario_base_centavos: 300_000,
      parcela: 1,
      adiantamento_pago_centavos: 100_000,
    },
    {
      salario_base_centavos: 300_000,
      parcela: 2,
      adiantamento_pago_centavos: 100.5, // fração de centavo
    },
  ];
  for (const caso of casos) {
    assert.throws(() => decimo(caso), ErroMotor, JSON.stringify(caso));
  }
});

test("rubrica de 13º fora do catálogo derruba com mensagem acionável", () => {
  assert.throws(
    () =>
      decimo({
        salario_base_centavos: 300_000,
        parcela: 2,
        rubricas: CATALOGO.filter((rubrica) => rubrica.codigo !== CODIGO_DECIMO),
      }),
    /Rubrica 0138 sem versão vigente/
  );
  assert.throws(
    () =>
      decimo({
        salario_base_centavos: 300_000,
        parcela: 1,
        rubricas: CATALOGO.filter(
          (rubrica) => rubrica.codigo !== CODIGO_ADIANTAMENTO_DECIMO
        ),
      }),
    /Rubrica 1601 sem versão vigente/
  );
});

// ------------------------------------------------------------------ proteção do catálogo

test("as rubricas do motor de 13º são protegidas do encerramento (molde B2)", () => {
  for (const codigo of [
    CODIGO_DECIMO,
    CODIGO_ADIANTAMENTO_DECIMO,
    CODIGO_DESCONTO_ADIANTAMENTO_DECIMO,
    CODIGO_INSS_DECIMO,
    CODIGO_IRRF_DECIMO,
  ]) {
    assert.ok(
      CODIGOS_DO_MOTOR.includes(codigo),
      `CODIGOS_DO_MOTOR deixou a rubrica ${codigo} de fora — encerrá-la pela ` +
        "tela derruba a prévia e a folha de 13º inteiras"
    );
  }
});
