// Bateria do MOTOR da folha — src/dominios/folha/calculo.ts, função calcularFolha.
//
// Por que estes casos e não outros: os cinco primeiros são a bateria que vive em
// rh_folha.caso_teste_folha (seed da migração 0013), com a conta feita à mão no
// comentário do próprio SQL. Trazê-los para arquivo é o que o ponto 3 do arnês pede —
// a suíte em arquivo inclui os casos do banco, senão caso acrescentado pela tela fica
// fora do portão. Os demais provam as fronteiras que o SQL não cobre: teto do INSS,
// efeito de cada dependente, meio-para-cima no centavo, divisor proporcional à jornada
// e a perda de casas decimais do percentual.
//
// Nada aqui toca banco: o motor é puro, e é por isso que ele cabe no portão rápido.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ErroMotor,
  calcularFolha,
  type EntradaMotor,
  type ItemMotor,
  type ParametrosFolhaMotor,
  type ResultadoMotor,
  type RubricaMotor,
  type TabelaInssMotor,
  type TabelaIrrfMotor,
  type VariavelMotor,
} from "../src/dominios/folha/calculo";
import {
  esquemaNovaRubrica,
  type NaturezaRubrica,
  type TipoCalculo,
} from "../src/dominios/folha/esquemas";

// ------------------------------------------------------------------ fixtures
// Cópia fiel do seed da 0013 (tabelas legais 2026) e da 0038 (divisores), em
// CENTAVOS INTEIROS. Se a tabela legal mudar, estes números mudam junto e a
// bateria falhando é o alarme — que é exatamente o que o seed pede em prosa.

const PARAMETROS: ParametrosFolhaMotor = {
  id: 1,
  aliquota_fgts: 8,
  divisor_mensal_horas: 220,
  carga_semanal_referencia_minutos: 2640, // 44 h/semana
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

// Catálogo da 0013 mais duas rubricas percentuais que o catálogo não tem, para
// exercitar o único tipo de cálculo que ninguém do seed usa.
const CATALOGO: RubricaMotor[] = [
  montarRubrica("1001", "Salário Base", "provento", "automatico", null, true),
  montarRubrica("1101", "Horas Extras 50%", "provento", "horas_adicional", 1.5, true),
  montarRubrica("1102", "Horas Extras 100%", "provento", "horas_adicional", 2, true),
  montarRubrica("1201", "Faltas", "desconto", "automatico", null, true),
  montarRubrica("1202", "DSR sobre Faltas", "desconto", "automatico", null, true),
  montarRubrica("2001", "Desconto INSS", "desconto", "automatico", null, false),
  montarRubrica("2002", "IRRF", "desconto", "automatico", null, false),
  montarRubrica("2101", "Desconto de Benefício", "desconto", "valor_informado", null, false),
  montarRubrica("3001", "FGTS", "informativa", "automatico", null, false),
  montarRubrica("9001", "Provento Manual", "provento", "valor_informado", null, true),
  montarRubrica("9002", "Desconto Manual", "desconto", "valor_informado", null, false),
  montarRubrica("9101", "Adicional de 2,5%", "provento", "percentual_salario", 2.5, true),
  montarRubrica("9102", "Comissão de 8,3333%", "provento", "percentual_salario", 8.3333, true),
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

function lancar(
  codigo: string,
  referencia: number | null,
  valor_centavos: number | null = null
): VariavelMotor {
  return { codigo, referencia, valor_centavos, origem: "manual" };
}

function itemDe(resultado: ResultadoMotor, codigo: string): ItemMotor | undefined {
  return resultado.itens.find((item) => item.codigo === codigo);
}

/** Valor do item em centavos; 0 quando o item não foi gravado (valor zero). */
function valorDe(resultado: ResultadoMotor, codigo: string): number {
  return itemDe(resultado, codigo)?.valor_centavos ?? 0;
}

function memoriaDe(resultado: ResultadoMotor, codigo: string): Record<string, unknown> {
  const item = itemDe(resultado, codigo);
  assert.ok(item, `item ${codigo} não foi gravado`);
  return item.memoria;
}

// ------------------------------------------------------------- INSS por faixas

test("INSS de R$ 3.000,00 é a soma das três faixas (247,53), não 12% do salário inteiro", () => {
  // 12% direto sobre 3.000,00 daria 360,00 — R$ 112,47 a mais no desconto.
  // 1.631,00×7,5% + 1.302,57×9% + 66,43×12% = 122,3250 + 117,2313 + 7,9716.
  const resultado = folha({ salario_base_centavos: 300_000 });
  assert.equal(valorDe(resultado, "2001"), 24_753);
});

test("a faixa só tributa o que passa do piso dela, faixa a faixa", () => {
  const resultado = folha({ salario_base_centavos: 300_000 });
  const faixas = memoriaDe(resultado, "2001").faixas_percorridas as {
    base_na_faixa: number;
    valor: number;
  }[];
  assert.equal(faixas.length, 3); // a quarta faixa nem é percorrida
  assert.deepEqual(
    faixas.map((faixa) => faixa.base_na_faixa),
    [1631, 1302.57, 66.43]
  );
});

test("base exatamente no teto ainda não é 'teto aplicado' — o corte é acima dele", () => {
  const resultado = folha({ salario_base_centavos: 856_528 });
  assert.equal(memoriaDe(resultado, "2001").teto_aplicado, false);
  assert.equal(valorDe(resultado, "2001"), 99_866);
});

test("acima do teto o INSS para: R$ 12.000,00 desconta o mesmo que R$ 8.565,28", () => {
  // O teto de contribuição é 8.565,28. Sem a limitação, 12.000,00 contribuiria
  // 14% sobre os 3.434,72 excedentes — R$ 480,86 indevidos por competência.
  const noTeto = folha({ salario_base_centavos: 856_528 });
  const acima = folha({ salario_base_centavos: 1_200_000 });
  assert.equal(valorDe(acima, "2001"), valorDe(noTeto, "2001"));
  assert.equal(valorDe(acima, "2001"), 99_866);
  assert.equal(memoriaDe(acima, "2001").teto_aplicado, true);
});

test("um real abaixo do teto o INSS é 14 centavos menor — a última faixa é progressiva de verdade", () => {
  const abaixo = folha({ salario_base_centavos: 856_428 });
  assert.equal(valorDe(abaixo, "2001"), 99_852); // 99.866 − 100 × 14%
});

test("a base do INSS entra limitada ao teto na memória do item", () => {
  const resultado = folha({ salario_base_centavos: 1_200_000 });
  assert.equal(itemDe(resultado, "2001")?.base_centavos, 856_528);
  assert.equal(resultado.base_inss_centavos, 1_200_000); // a base cheia continua exposta
});

// ------------------------------------------------------------------- IRRF

test("IRRF de R$ 12.000,00 com 2 dependentes: 27,5% sobre 10.622,16 menos 908,73 = 2.012,36", () => {
  const resultado = folha({ salario_base_centavos: 1_200_000, dependentes_irrf: 2 });
  assert.equal(valorDe(resultado, "2002"), 201_236);
  const memoria = memoriaDe(resultado, "2002");
  assert.equal(memoria.aliquota_aplicada, 27.5);
  assert.equal(memoria.parcela_deduzir, 908.73);
  assert.equal(memoria.regime_vencedor, "completo");
});

test("cada dependente tira 189,59 da base e devolve R$ 52,14 de imposto", () => {
  const semDependente = folha({ salario_base_centavos: 1_200_000, dependentes_irrf: 0 });
  const umDependente = folha({ salario_base_centavos: 1_200_000, dependentes_irrf: 1 });
  const doisDependentes = folha({ salario_base_centavos: 1_200_000, dependentes_irrf: 2 });
  assert.equal(valorDe(semDependente, "2002"), 211_664);
  assert.equal(valorDe(umDependente, "2002"), 206_450);
  assert.equal(valorDe(doisDependentes, "2002"), 201_236);
  // 27,5% de 189,59 = 52,1373 → o desconto por dependente é o mesmo dos dois lados.
  assert.equal(
    valorDe(semDependente, "2002") - valorDe(umDependente, "2002"),
    valorDe(umDependente, "2002") - valorDe(doisDependentes, "2002")
  );
});

test("a dedução do INSS no regime completo é o valor ARREDONDADO do item 2001, não o intermediário", () => {
  // O INSS sai da conta em 998,6597. Se o IRRF deduzisse esse número, o holerite
  // mostraria uma dedução que não bate com a linha do INSS logo acima dela.
  const resultado = folha({ salario_base_centavos: 1_200_000, dependentes_irrf: 2 });
  const completo = memoriaDe(resultado, "2002").regime_completo as { deducao_inss: number };
  assert.equal(completo.deducao_inss, valorDe(resultado, "2001") / 100);
  assert.equal(completo.deducao_inss, 998.66);
});

test("a parcela a deduzir vem da faixa da tabela, não do motor", () => {
  const semParcela: TabelaIrrfMotor = {
    ...TABELA_IRRF,
    faixas: TABELA_IRRF.faixas.map((faixa) =>
      faixa.ate_centavos === null ? { ...faixa, deducao_centavos: 0 } : faixa
    ),
  };
  const comParcela = folha({ salario_base_centavos: 1_200_000, dependentes_irrf: 2 });
  const zerada = folha({
    salario_base_centavos: 1_200_000,
    dependentes_irrf: 2,
    tabela_irrf: semParcela,
  });
  assert.equal(valorDe(zerada, "2002") - valorDe(comParcela, "2002"), 90_873);
});

test("quem cai na primeira faixa não recebe linha de IRRF — item com valor zero não é gravado", () => {
  const resultado = folha({ salario_base_centavos: 300_000 });
  assert.equal(itemDe(resultado, "2002"), undefined);
});

test("vale o imposto MENOR: o simplificado ganha em R$ 3.300,00 e paga 3,30 no lugar de 29,56", () => {
  const resultado = folha({
    salario_base_centavos: 330_000,
    variaveis: [lancar("1201", 1)],
  });
  assert.equal(valorDe(resultado, "2002"), 330);
  const memoria = memoriaDe(resultado, "2002");
  assert.equal(memoria.regime_vencedor, "simplificado");
  // O perdedor fica registrado, em reais e sem arredondar: R$ 29,5553.
  const completo = memoria.regime_completo as { imposto: number };
  assert.equal(completo.imposto, 29.5553);
});

// --------------------------------------------- proventos, descontos e líquido

test("líquido é proventos menos descontos, e o FGTS informativo fica fora dos dois", () => {
  const resultado = folha({ salario_base_centavos: 1_200_000, dependentes_irrf: 2 });
  assert.equal(valorDe(resultado, "3001"), 96_000); // 12.000,00 × 8%
  assert.equal(resultado.total_proventos_centavos, 1_200_000);
  assert.equal(
    resultado.total_descontos_centavos,
    valorDe(resultado, "2001") + valorDe(resultado, "2002")
  );
  assert.equal(resultado.liquido_centavos, 898_898);
});

test("um dia de falta desconta o dia E um dia de DSR, e as duas reduzem as bases", () => {
  const resultado = folha({
    salario_base_centavos: 330_000,
    variaveis: [lancar("1201", 1)],
  });
  assert.equal(valorDe(resultado, "1201"), 11_000); // 3.300 ÷ 30
  assert.equal(valorDe(resultado, "1202"), 11_000); // 1 DSR por dia de falta (F1, 0013)
  assert.equal(resultado.base_inss_centavos, 308_000);
  assert.equal(resultado.base_fgts_centavos, 308_000);
  assert.equal(resultado.liquido_centavos, 281_957);
});

test("os cinco casos da bateria em banco (0013) devolvem os mesmos itens e o mesmo líquido", () => {
  // Trava contra a suíte em arquivo e a bateria do banco divergirem: caso
  // acrescentado pela tela e não trazido para cá fica fora do portão.
  const casos: { nome: string; entrada: Ajuste; itens: Record<string, number>; liquido: number }[] = [
    {
      nome: "salario_simples_3000",
      entrada: { salario_base_centavos: 300_000 },
      itens: { "1001": 300_000, "2001": 24_753, "3001": 24_000 },
      liquido: 275_247,
    },
    {
      nome: "com_he50_2000_10h",
      entrada: { salario_base_centavos: 200_000, variaveis: [lancar("1101", 10)] },
      itens: { "1001": 200_000, "1101": 13_636, "2001": 16_781, "3001": 17_091 },
      liquido: 196_855,
    },
    {
      nome: "falta_com_dsr_3300",
      entrada: { salario_base_centavos: 330_000, variaveis: [lancar("1201", 1)] },
      itens: {
        "1001": 330_000,
        "1201": 11_000,
        "1202": 11_000,
        "2001": 25_713,
        "2002": 330,
        "3001": 24_640,
      },
      liquido: 281_957,
    },
    {
      nome: "teto_inss_9000",
      entrada: { salario_base_centavos: 900_000 },
      itens: { "1001": 900_000, "2001": 99_866, "2002": 129_164, "3001": 72_000 },
      liquido: 670_970,
    },
    {
      nome: "irrf_faixa_alta_12000_2dep",
      entrada: { salario_base_centavos: 1_200_000, dependentes_irrf: 2 },
      itens: { "1001": 1_200_000, "2001": 99_866, "2002": 201_236, "3001": 96_000 },
      liquido: 898_898,
    },
  ];

  for (const caso of casos) {
    const resultado = folha(caso.entrada);
    const obtidos = Object.fromEntries(
      resultado.itens.map((item) => [item.codigo, item.valor_centavos])
    );
    assert.deepEqual(obtidos, caso.itens, caso.nome);
    assert.equal(resultado.liquido_centavos, caso.liquido, caso.nome);
  }
});

// ------------------------------------------------------------ arredondamento

test("arredondamento é meio-para-cima: 225,005 vira 225,01, não 225,00", () => {
  // 9.000,20 × 2,5% = 225,005 — meio centavo cravado. Truncar daria 225,00 e
  // arredondar-para-par também (225,00 é o par); só o meio-para-cima dá 225,01.
  const resultado = folha({
    salario_base_centavos: 900_020,
    variaveis: [lancar("9101", null)],
  });
  assert.equal(valorDe(resultado, "9101"), 22_501);
});

test("o intermediário fica sem arredondar na memória e só o valor final é inteiro", () => {
  const resultado = folha({ salario_base_centavos: 900_000 });
  const memoria = memoriaDe(resultado, "2001");
  assert.equal(memoria.valor_sem_arredondar, 998.6597);
  assert.equal(memoria.valor_final, 998.66);
  assert.ok(Number.isInteger(valorDe(resultado, "2001")));
});

test("somar horas em float devolve 346.90999999999997 e o motor paga o mesmo que 346,91 h", () => {
  // O projeto já pagou esta conta: o comentário em folha/servico.ts:732 registra
  // que somar float de hora devolveria 346.90999999999997 no total da importação
  // do ponto — 346,93 na tela contra os 346,91 que o DP soma na coluna.
  // No motor a soma também é float, mas ela nunca chega ao dinheiro: entra como
  // razão inteira (× 100 arredondado) antes de virar valor.
  assert.equal(111.11 + 122.22 + 113.58, 346.90999999999997); // o ruído existe mesmo
  assert.notEqual(111.11 + 122.22 + 113.58, 346.91);

  const fatiado = folha({
    salario_base_centavos: 200_000,
    variaveis: [lancar("1101", 111.11), lancar("1101", 122.22), lancar("1101", 113.58)],
  });
  const inteiro = folha({
    salario_base_centavos: 200_000,
    variaveis: [lancar("1101", 346.91)],
  });
  assert.equal(valorDe(fatiado, "1101"), valorDe(inteiro, "1101"));
  assert.equal(valorDe(fatiado, "1101"), 473_059);
  assert.equal(fatiado.liquido_centavos, inteiro.liquido_centavos);
});

test("a base do INSS usa o item de HE já arredondado, não o intermediário de 136,3636", () => {
  // O arredondamento acontece UMA vez, no valor final do item. Se a base
  // carregasse 136,3636, a base do INSS seria 2.136,3636 e o desconto sairia de
  // uma base que não aparece em lugar nenhum do holerite.
  const resultado = folha({
    salario_base_centavos: 200_000,
    variaveis: [lancar("1101", 10)],
  });
  assert.equal(valorDe(resultado, "1101"), 13_636);
  assert.equal(resultado.base_inss_centavos, 213_636);
  assert.equal(resultado.base_inss_centavos, 200_000 + valorDe(resultado, "1101"));
});

// ------------------------------------------------------------------ divisores

test("quem faz 36 h por semana tem divisor 180 e a hora extra vale mais", () => {
  // O divisor 220 estava chumbado no motor (corrigido na 0038): quem faz 36 h
  // recebia hora de 44 h. Em 10 h de HE 50% sobre 2.000,00 são R$ 136,36 no
  // lugar de R$ 166,67 — R$ 30,31 a menos por competência, por pessoa.
  const jornadaDe36h = folha({
    salario_base_centavos: 200_000,
    carga_semanal_minutos: 2160,
    variaveis: [lancar("1101", 10)],
  });
  const jornadaDe44h = folha({
    salario_base_centavos: 200_000,
    carga_semanal_minutos: 2640,
    variaveis: [lancar("1101", 10)],
  });
  assert.equal(valorDe(jornadaDe36h, "1101"), 16_667);
  assert.equal(valorDe(jornadaDe44h, "1101"), 13_636);
  assert.equal(memoriaDe(jornadaDe36h, "1101").divisor_horas, 180);
});

test("sem jornada cadastrada cai no divisor de referência e a memória diz que caiu", () => {
  const resultado = folha({
    salario_base_centavos: 200_000,
    variaveis: [lancar("1101", 10)],
  });
  const memoria = memoriaDe(resultado, "1101");
  assert.equal(memoria.divisor_horas, 220);
  assert.match(String(memoria.origem_divisor), /sem jornada vigente/);
});

test("o divisor de dias não segue a jornada — o salário mensal remunera o mês inteiro", () => {
  const jornadaDe36h = folha({
    salario_base_centavos: 330_000,
    carga_semanal_minutos: 2160,
    variaveis: [lancar("1201", 1)],
  });
  assert.equal(valorDe(jornadaDe36h, "1201"), 11_000); // 3.300 ÷ 30, igual a 44 h
  assert.equal(memoriaDe(jornadaDe36h, "1201").divisor_dias, 30);
});

// -------------------------------------------------- percentual: casas decimais

test("o parâmetro da rubrica guarda 4 casas decimais desde a entrada", () => {
  // Prova que a perda do teste seguinte é do motor, não do que chegou nele: o
  // zod (e a coluna NUMERIC, e a tela) preservam 8,3333.
  const rubrica = esquemaNovaRubrica.parse({
    codigo: "9102",
    nome: "Comissão de 8,3333%",
    natureza: "provento",
    incide_inss: true,
    incide_irrf: true,
    incide_fgts: true,
    tipo_calculo: "percentual_salario",
    parametro: 8.3333,
    inicio_vigencia: "2026-01-01",
  });
  assert.equal(rubrica.parametro, 8.3333);
});

test("rubrica de 8,3333% sobre R$ 3.000,00 paga 250,00, não 249,90", () => {
  // ACHADO CONFIRMADO, DEFEITO REAL — este teste FALHA de propósito.
  // aplicarPercentual (calculo.ts:160) faz Math.round(aliquota * 100), então
  // 8,3333% vira 8,33%: a rubrica é paga com DUAS casas enquanto a coluna, o
  // zod e a tela guardam QUATRO. Custo medido: R$ 0,10 por competência nesta
  // rubrica — 3.000,00 × 8,3333% = 249,999 (→ 250,00) contra os 249,90 pagos.
  // O erro é proporcional: em 30.000,00 são R$ 1,00; a cada casa a mais no
  // parâmetro, mais fundo. Consertar é mudar o motor, que não é escopo deste
  // arquivo — o teste fica vermelho até o motor honrar as 4 casas.
  const resultado = folha({
    salario_base_centavos: 300_000,
    variaveis: [lancar("9102", null)],
  });
  assert.equal(valorDe(resultado, "9102"), 25_000);
});

// ------------------------------------------------------- guardas e invariante

test("lançar variável em rubrica automática é recusado — o motor a calcula sozinho", () => {
  assert.throws(
    () => folha({ salario_base_centavos: 300_000, variaveis: [lancar("2001", null, 100)] }),
    ErroMotor
  );
});

test("salário zero não gera item nenhum e o líquido é zero", () => {
  const resultado = folha({ salario_base_centavos: 0 });
  assert.deepEqual(resultado.itens, []);
  assert.equal(resultado.liquido_centavos, 0);
});

test("nenhum valor monetário do resultado tem casa decimal", () => {
  const cenarios: Ajuste[] = [
    { salario_base_centavos: 300_000 },
    { salario_base_centavos: 200_000, variaveis: [lancar("1101", 10)] },
    { salario_base_centavos: 330_000, variaveis: [lancar("1201", 1)] },
    { salario_base_centavos: 1_200_000, dependentes_irrf: 2 },
    { salario_base_centavos: 900_020, variaveis: [lancar("9101", null)] },
    {
      salario_base_centavos: 456_789,
      carga_semanal_minutos: 2160,
      dependentes_irrf: 3,
      variaveis: [
        lancar("1101", 7.33),
        lancar("1102", 2.5),
        lancar("2101", null, 12_345),
        lancar("9001", null, 777),
      ],
    },
  ];

  for (const cenario of cenarios) {
    const resultado = folha(cenario);
    for (const item of resultado.itens) {
      assert.ok(
        Number.isInteger(item.valor_centavos),
        `item ${item.codigo} veio com centavo fracionado: ${item.valor_centavos}`
      );
      if (item.base_centavos !== null) {
        assert.ok(
          Number.isInteger(item.base_centavos),
          `base do item ${item.codigo} veio fracionada: ${item.base_centavos}`
        );
      }
    }
    for (const [nome, valor] of Object.entries(resultado)) {
      if (nome === "itens") continue;
      assert.ok(Number.isInteger(valor as number), `${nome} veio fracionado: ${String(valor)}`);
    }
    assert.equal(
      resultado.liquido_centavos,
      resultado.total_proventos_centavos - resultado.total_descontos_centavos
    );
  }
});
