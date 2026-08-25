import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analisarLinhaCargo,
  analisarLinhaEstrutura,
  chaveDeNome,
  decidirEmpresaDaLinha,
  divergenciaDeCargoHomonimo,
  dividirLinhas,
  ehCabecalho,
  EmpresaExistente,
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

// ---------------------------------------------------------------- empresa: casamento por CNPJ (B1)

function mapas(...empresas: { nome: string; empresa: EmpresaExistente }[]) {
  const porCnpj = new Map<string, EmpresaExistente>();
  const porNome = new Map<string, EmpresaExistente>();
  for (const { nome, empresa } of empresas) {
    if (empresa.cnpj) porCnpj.set(empresa.cnpj, empresa);
    porNome.set(chaveDeNome(nome), empresa);
  }
  return { porCnpj, porNome };
}

test("B1: com CNPJ informado, homônima com CNPJ DIFERENTE rejeita — a filial nova nunca casa por nome com a matriz", () => {
  // O caso exato do defeito: "Fast Filial" nova (CNPJ próprio) caía na
  // homônima existente por nome e o CC pendurava na empresa errada.
  const { porCnpj, porNome } = mapas({
    nome: "Fast Filial",
    empresa: { id: 1, cnpj: "11111111000191" },
  });
  const decisao = decidirEmpresaDaLinha(
    { empresa_nome: "Fast Filial", cnpj: "22222222000191" },
    porCnpj,
    porNome
  );
  assert.equal(decisao.acao, "rejeitar");
  if (decisao.acao === "rejeitar") {
    assert.match(decisao.motivo, /homônima/);
    assert.match(decisao.motivo, /CNPJ diferente/);
  }
});

test("B1: com CNPJ informado e homônima SEM CNPJ no banco, rejeita pedindo conferência", () => {
  const { porCnpj, porNome } = mapas({
    nome: "Fast Filial",
    empresa: { id: 1, cnpj: null },
  });
  const decisao = decidirEmpresaDaLinha(
    { empresa_nome: "fast  FILIAL", cnpj: "22222222000191" },
    porCnpj,
    porNome
  );
  assert.equal(decisao.acao, "rejeitar");
  if (decisao.acao === "rejeitar") assert.match(decisao.motivo, /SEM CNPJ/);
});

test("B1: com CNPJ informado, CNPJ que bate USA a empresa (mesmo com nome diferente) e sem homônima CRIA", () => {
  const existente: EmpresaExistente = { id: 7, cnpj: "11111111000191" };
  const { porCnpj, porNome } = mapas({ nome: "Fast Matriz", empresa: existente });

  const bateu = decidirEmpresaDaLinha(
    { empresa_nome: "Fast Matriz (novo nome)", cnpj: "11111111000191" },
    porCnpj,
    porNome
  );
  assert.deepEqual(bateu, { acao: "usar", empresa: existente });

  const nova = decidirEmpresaDaLinha(
    { empresa_nome: "Fast Nordeste", cnpj: "33333333000191" },
    porCnpj,
    porNome
  );
  assert.deepEqual(nova, { acao: "criar" });
});

test("B1: fallback por nome vale SÓ quando a linha veio sem CNPJ", () => {
  const existente: EmpresaExistente = { id: 7, cnpj: "11111111000191" };
  const { porCnpj, porNome } = mapas({ nome: "Fast Matriz", empresa: existente });

  const porNomeOk = decidirEmpresaDaLinha(
    { empresa_nome: "FAST  matriz", cnpj: null },
    porCnpj,
    porNome
  );
  assert.deepEqual(porNomeOk, { acao: "usar", empresa: existente });

  const semNada = decidirEmpresaDaLinha(
    { empresa_nome: "Fast Sul", cnpj: null },
    porCnpj,
    porNome
  );
  assert.deepEqual(semNada, { acao: "criar" });
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

test("B3: cargo homônimo com nível ou faixa DIVERGENTE rejeita — nunca vira 'já existia'", () => {
  // O caso exato do defeito: a linha trazia nível/faixa diferentes do
  // catálogo e era engolida — a posição do quadro se perdia em silêncio.
  const existente = {
    nivel_id: 1,
    faixa_min_centavos: 240000,
    faixa_max_centavos: 380000,
  };

  const nivelDiverge = divergenciaDeCargoHomonimo(
    { nivel_id: 2, faixa_min_centavos: 240000, faixa_max_centavos: 380000 },
    existente
  );
  assert.notEqual(nivelDiverge, null);
  assert.match(nivelDiverge ?? "", /nível diferente/);
  assert.match(nivelDiverge ?? "", /não distingue cargos pelo nome/);

  const faixaDiverge = divergenciaDeCargoHomonimo(
    { nivel_id: 1, faixa_min_centavos: 250000, faixa_max_centavos: 380000 },
    existente
  );
  assert.match(faixaDiverge ?? "", /faixa salarial diferente/);

  const tudoDiverge = divergenciaDeCargoHomonimo(
    { nivel_id: 2, faixa_min_centavos: 100000, faixa_max_centavos: 200000 },
    existente
  );
  assert.match(tudoDiverge ?? "", /nível e faixa salarial diferente/);

  // A linha que informa nível onde o catálogo não tem também diverge — aceitar
  // calada perderia a posição do quadro do mesmo jeito.
  const catalogoSemNivel = divergenciaDeCargoHomonimo(
    { nivel_id: 1, faixa_min_centavos: null, faixa_max_centavos: null },
    { nivel_id: null, faixa_min_centavos: null, faixa_max_centavos: null }
  );
  assert.notEqual(catalogoSemNivel, null);
});

test("B3: homônimo IGUAL por inteiro (no que a linha informa) segue 'já existia'", () => {
  const existente = {
    nivel_id: 1,
    faixa_min_centavos: 240000,
    faixa_max_centavos: 380000,
  };
  // Igual por inteiro.
  assert.equal(
    divergenciaDeCargoHomonimo(
      { nivel_id: 1, faixa_min_centavos: 240000, faixa_max_centavos: 380000 },
      existente
    ),
    null
  );
  // Coluna vazia não afirma nada: linha só com o nome continua idempotente.
  assert.equal(
    divergenciaDeCargoHomonimo(
      { nivel_id: null, faixa_min_centavos: null, faixa_max_centavos: null },
      existente
    ),
    null
  );
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
