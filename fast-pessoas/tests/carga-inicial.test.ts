import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analisarLinhaCargo,
  analisarLinhaEstrutura,
  chaveDeNome,
  dividirLinhas,
  ehCabecalho,
  normalizarCnpj,
  reaisParaCentavos,
} from "../src/dominios/estrutura/importacao-analise";

// ===========================================================================
// Carga inicial (Onda 3): a parte PURA dos importadores de estrutura e cargos.
// O que está aqui protege as duas promessas da tela: "linha ruim vira rejeição
// com motivo" (validação de formato) e "dinheiro em reais com vírgula vira
// centavo inteiro" (eixo 5 — a conversão é por dígito, nunca parseFloat).
// ===========================================================================

// ---------------------------------------------------------------- dinheiro

test("reais com vírgula e milhar com ponto viram centavos inteiros", () => {
  assert.equal(reaisParaCentavos("3.500,00"), 350000);
  assert.equal(reaisParaCentavos("1.234.567,89"), 123456789);
  assert.equal(reaisParaCentavos("2400,5"), 240050);
  assert.equal(reaisParaCentavos("R$ 1.234,56"), 123456);
});

test("sem vírgula: ponto seguido de 1–2 dígitos é decimal; de 3 é milhar", () => {
  assert.equal(reaisParaCentavos("1234.56"), 123456);
  assert.equal(reaisParaCentavos("1234.5"), 123450);
  // "1.234" é o milhar de planilha brasileira — 1234 reais, não 1,234.
  assert.equal(reaisParaCentavos("1.234"), 123400);
  assert.equal(reaisParaCentavos("3500"), 350000);
  assert.equal(reaisParaCentavos("0,99"), 99);
});

test("o que não é valor monetário devolve null, nunca NaN nem truncamento", () => {
  assert.equal(reaisParaCentavos(""), null);
  assert.equal(reaisParaCentavos("abc"), null);
  assert.equal(reaisParaCentavos("12,345"), null); // 3 casas decimais
  assert.equal(reaisParaCentavos("1,2,3"), null);
  assert.equal(reaisParaCentavos("-100"), null); // sinal não é dígito
  assert.equal(reaisParaCentavos("."), null);
});

// ---------------------------------------------------------------- identidade

test("chave de nome ignora acento, caixa e espaço repetido — é a idempotência", () => {
  assert.equal(chaveDeNome("Casa  do Montador"), chaveDeNome("casa do montador"));
  assert.equal(chaveDeNome("São João"), chaveDeNome("SAO JOAO"));
  assert.notEqual(chaveDeNome("Filial Norte"), chaveDeNome("Filial Sul"));
});

test("CNPJ aceita máscara, exige 14 dígitos e trata vazio como ainda-sem-CNPJ", () => {
  assert.deepEqual(normalizarCnpj("41.235.678/0001-01"), {
    ok: true,
    cnpj: "41235678000101",
  });
  assert.deepEqual(normalizarCnpj("  "), { ok: true, cnpj: null });
  const curto = normalizarCnpj("123");
  assert.equal(curto.ok, false);
});

// ---------------------------------------------------------------- linhas do arquivo

test("dividirLinhas preserva o número ORIGINAL da linha para o relatório", () => {
  const linhas = dividirLinhas("a;b\n\n  \nc;d\n");
  assert.deepEqual(
    linhas.map((l) => l.numero),
    [1, 4]
  );
});

test("cabeçalho é reconhecido com caixa e acento diferentes", () => {
  assert.equal(ehCabecalho("Empresa", "empresa"), true);
  assert.equal(ehCabecalho("CARGO ", "cargo"), true);
  assert.equal(ehCabecalho("Supply", "empresa"), false);
});

test("B2: linha de DADOS que só começa com o nome da coluna NÃO é cabeçalho", () => {
  // O caso exato do defeito: startsWith engolia a primeira linha de dados e a
  // empresa sumia sem entrar em nenhuma conta do relatório.
  assert.equal(ehCabecalho("Empresa Brasileira de Logística", "empresa"), false);
  assert.equal(ehCabecalho("Cargo de Confiança", "cargo"), false);
  // Cabeçalho real continua pulado — igualdade do nome normalizado.
  assert.equal(ehCabecalho("  EMPRESA  ", "empresa"), true);
});

// ---------------------------------------------------------------- estrutura

test("linha completa de estrutura sai com os sete campos resolvidos", () => {
  const analise = analisarLinhaEstrutura([
    "Supply",
    "41.235.678/0001-01",
    "Fast Supply Ltda",
    "Matriz",
    "Matriz Centro",
    "CC-1000",
    "Operação Matriz Centro",
  ]);
  assert.equal(analise.ok, true);
  if (analise.ok) {
    assert.deepEqual(analise.dados, {
      empresa_nome: "Supply",
      cnpj: "41235678000101",
      razao_social: "Fast Supply Ltda",
      tipo: "matriz",
      estabelecimento: "Matriz Centro",
      cc_codigo: "CC-1000",
      cc_nome: "Operação Matriz Centro",
    });
  }
});

test("linha só com a empresa é válida — planilha corta os ; vazios do fim", () => {
  const analise = analisarLinhaEstrutura(["DCS"]);
  assert.equal(analise.ok, true);
  if (analise.ok) {
    assert.equal(analise.dados.empresa_nome, "DCS");
    assert.equal(analise.dados.tipo, null);
    assert.equal(analise.dados.estabelecimento, null);
    assert.equal(analise.dados.cc_codigo, null);
  }
});

test("estrutura rejeita com motivo: empresa vazia, tipo inventado, CNPJ torto", () => {
  assert.equal(analisarLinhaEstrutura([""]).ok, false);
  const tipoRuim = analisarLinhaEstrutura(["Supply", "", "", "holding"]);
  assert.equal(tipoRuim.ok, false);
  if (!tipoRuim.ok) assert.match(tipoRuim.motivo, /matriz ou filial/);
  const cnpjRuim = analisarLinhaEstrutura(["Supply", "123"]);
  assert.equal(cnpjRuim.ok, false);
  if (!cnpjRuim.ok) assert.match(cnpjRuim.motivo, /14 dígitos/);
});

test("centro de custo vem inteiro ou não vem: código sem nome (e vice-versa) rejeita", () => {
  const semNome = analisarLinhaEstrutura(["Supply", "", "", "", "", "CC-1000", ""]);
  assert.equal(semNome.ok, false);
  const semCodigo = analisarLinhaEstrutura(["Supply", "", "", "", "", "", "Operação"]);
  assert.equal(semCodigo.ok, false);
});

// ---------------------------------------------------------------- cargos

test("linha de cargo converte a faixa para centavos inteiros", () => {
  const analise = analisarLinhaCargo([
    "Vendedor(a)",
    "Operacional",
    "2.400,00",
    "3.800,00",
  ]);
  assert.equal(analise.ok, true);
  if (analise.ok) {
    assert.deepEqual(analise.dados, {
      nome: "Vendedor(a)",
      nivel: "Operacional",
      faixa_min_centavos: 240000,
      faixa_max_centavos: 380000,
    });
  }
});

test("cargo sem nível e sem faixa é válido — as colunas são opcionais", () => {
  const analise = analisarLinhaCargo(["Estoquista"]);
  assert.equal(analise.ok, true);
  if (analise.ok) {
    assert.equal(analise.dados.nivel, null);
    assert.equal(analise.dados.faixa_min_centavos, null);
  }
});

test("faixa pela metade, invertida ou ilegível rejeita com motivo", () => {
  const metade = analisarLinhaCargo(["Vendedor(a)", "", "2.400,00", ""]);
  assert.equal(metade.ok, false);
  if (!metade.ok) assert.match(metade.motivo, /completa/);

  const invertida = analisarLinhaCargo(["Vendedor(a)", "", "3.800,00", "2.400,00"]);
  assert.equal(invertida.ok, false);
  if (!invertida.ok) assert.match(invertida.motivo, /menor que a mínima/);

  const ilegivel = analisarLinhaCargo(["Vendedor(a)", "", "dois mil", "3.800,00"]);
  assert.equal(ilegivel.ok, false);
});
