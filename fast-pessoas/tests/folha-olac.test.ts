// OLAC — a parte PURA da troca de arquivo com a contabilidade
// (src/dominios/folha/olac.ts): gerar e analisar o layout NOSSO (decisão E4) e
// casar a linha com o cadastro. O que está aqui protege as três promessas do
// layout: linha ruim vira rejeição com motivo (nunca aborta o lote), dinheiro
// é centavo inteiro nas duas direções (eixo 5), e a ida-e-volta é
// BYTE-IDÊNTICA — o que exportamos, reimportado, regenera o mesmo arquivo.
//
// Nada aqui toca banco: o módulo é puro, como estrutura/importacao-analise.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analisarLinhaOlac,
  CABECALHO_OLAC,
  casarLinhaOlac,
  centavosParaValorOlac,
  chaveTravaImportacaoOlac,
  ehCabecalhoOlac,
  gerarArquivoOlac,
  gerarLinhaOlac,
  nomeArquivoOlac,
  SEPARADOR_OLAC,
  type AnaliseOlac,
  type LinhaOlac,
} from "../src/dominios/folha/olac";
import { dividirLinhas } from "../src/dominios/estrutura/importacao-analise";

// ------------------------------------------------------------------ fixtures

const LINHA_BOA: LinhaOlac = {
  competencia_ano: 2026,
  competencia_mes: 8,
  empresa_cnpj: "11222333000181",
  matricula: "1042",
  colaborador_nome: "Maria da Silva",
  codigo_rubrica: "1001",
  rubrica_nome: "Salário Base",
  natureza: "provento",
  conta_contabil: "3.1.1.01.001",
  valor_centavos: 350_000,
};

const CADASTRO = {
  colaboradorPorMatricula: new Map([
    ["1042", 7],
    ["1077", 9],
  ]),
  rubricasPorCodigo: new Set(["1001", "2001", "3001"]),
};

function colunas(linha: string): string[] {
  return linha.split(SEPARADOR_OLAC);
}

/** Análise que TEM que passar — falha com o motivo na cara quando não passa. */
function analisar(linha: string): LinhaOlac {
  const analise = analisarLinhaOlac(colunas(linha));
  if (!analise.ok) {
    assert.fail(`a linha deveria analisar; motivo: ${analise.motivo}`);
  }
  return analise.dados;
}

/** Análise que TEM que falhar — devolve o motivo para o teste conferir. */
function motivoDe(analise: AnaliseOlac): string {
  if (analise.ok) {
    assert.fail("a linha deveria ser rejeitada, mas analisou");
  }
  return analise.motivo;
}

// ---------------------------------------------------------------- dinheiro

test("centavos inteiros viram o valor canônico: vírgula, 2 casas, sem milhar", () => {
  assert.equal(centavosParaValorOlac(350_000), "3500,00");
  assert.equal(centavosParaValorOlac(123_456_789), "1234567,89");
  assert.equal(centavosParaValorOlac(5), "0,05");
  assert.equal(centavosParaValorOlac(0), "0,00");
});

test("valor negativo ou fracionado não gera linha — o sinal é da natureza", () => {
  assert.throws(() => centavosParaValorOlac(-1), /centavos inteiros/);
  assert.throws(() => centavosParaValorOlac(10.5), /centavos inteiros/);
});

// ---------------------------------------------------------------- análise (a volta)

test("linha boa: cada coluna volta tipada, com o valor em centavo inteiro", () => {
  assert.deepEqual(analisar(gerarLinhaOlac(LINHA_BOA)), LINHA_BOA);
});

test("valor ilegível rejeita a LINHA com motivo — nunca NaN, nunca truncamento", () => {
  const motivo = motivoDe(
    analisarLinhaOlac(
      colunas("08/2026;11222333000181;1042;Maria;1001;Salário;provento;;troc,ado")
    )
  );
  assert.match(motivo, /Valor "troc,ado" ilegível/);
});

test("a volta é tolerante no dinheiro: milhar com ponto e R$ entram como centavos", () => {
  const dados = analisar(
    "08/2026;11222333000181;1042;Maria;1001;Salário;provento;;R$ 3.500,00"
  );
  assert.equal(dados.valor_centavos, 350_000);
});

test("competência fora de MM/AAAA e CNPJ sem 14 dígitos rejeitam com motivo", () => {
  assert.match(
    motivoDe(
      analisarLinhaOlac(colunas("2026-08;;1042;Maria;1001;Salário;provento;;100,00"))
    ),
    /MM\/AAAA/
  );
  assert.match(
    motivoDe(
      analisarLinhaOlac(colunas("08/2026;123;1042;Maria;1001;Salário;provento;;100,00"))
    ),
    /14 dígitos/
  );
});

test("matrícula vazia e rubrica que não é código de 4 dígitos rejeitam", () => {
  assert.match(
    motivoDe(
      analisarLinhaOlac(colunas("08/2026;;;Maria;1001;Salário;provento;;100,00"))
    ),
    /matricula/
  );
  assert.match(
    motivoDe(
      analisarLinhaOlac(colunas("08/2026;;1042;Maria;SAL;Salário;provento;;100,00"))
    ),
    /4 dígitos/
  );
});

test("CNPJ e conta vazios são ausência, não erro — linha sem apropriação entra", () => {
  const dados = analisar("08/2026;;1042;Maria;1001;Salário;provento;;100,00");
  assert.equal(dados.empresa_cnpj, null);
  assert.equal(dados.conta_contabil, null);
});

// ---------------------------------------------------------------- casamento

test("matrícula desconhecida marca sem_colaborador — mesmo com rubrica boa", () => {
  const dados = analisar("08/2026;;9999;Fulano;1001;Salário;provento;;100,00");
  const casamento = casarLinhaOlac(dados, CADASTRO);
  assert.equal(casamento.situacao, "sem_colaborador");
  assert.equal(casamento.colaborador_id, null);
  // A rubrica que casou fica registrada mesmo assim — meio conserto é conserto.
  assert.equal(casamento.codigo_rubrica_interno, "1001");
});

test("rubrica fora do catálogo marca sem_rubrica, com o colaborador casado", () => {
  const dados = analisar("08/2026;;1042;Maria;7777;Verba Estranha;provento;;100,00");
  const casamento = casarLinhaOlac(dados, CADASTRO);
  assert.equal(casamento.situacao, "sem_rubrica");
  assert.equal(casamento.colaborador_id, 7);
  assert.equal(casamento.codigo_rubrica_interno, null);
});

test("as duas pontas desconhecidas: a PESSOA vem primeiro (sem_colaborador)", () => {
  const casamento = casarLinhaOlac(
    { ...LINHA_BOA, matricula: "9999", codigo_rubrica: "7777" },
    CADASTRO
  );
  assert.equal(casamento.situacao, "sem_colaborador");
  assert.equal(casamento.codigo_rubrica_interno, null);
});

test("linha boa casa: situacao casada com as duas referências resolvidas", () => {
  assert.deepEqual(casarLinhaOlac(LINHA_BOA, CADASTRO), {
    situacao: "casada",
    colaborador_id: 7,
    codigo_rubrica_interno: "1001",
  });
});

// ---------------------------------------------------------------- geração (a ida)

test("rubrica sem de-para sai com a coluna conta_contabil VAZIA, não some", () => {
  const linha = gerarLinhaOlac({ ...LINHA_BOA, conta_contabil: null });
  assert.equal(
    linha,
    "08/2026;11222333000181;1042;Maria da Silva;1001;Salário Base;provento;;3500,00"
  );
});

test("separador dentro de campo de texto vira espaço — coluna não desloca", () => {
  const linha = gerarLinhaOlac({
    ...LINHA_BOA,
    colaborador_nome: "Maria; a da Silva",
  });
  assert.equal(colunas(linha).length, 9);
  assert.equal(colunas(linha)[3], "Maria  a da Silva");
});

test("o nome do arquivo é canônico por competência", () => {
  assert.equal(nomeArquivoOlac(2026, 8), "olac-folha-2026-08.csv");
  assert.equal(nomeArquivoOlac(2026, 11), "olac-folha-2026-11.csv");
});

// ---------------------------------------------------------------- ida e volta

test("ida-e-volta BYTE-IDÊNTICA: o que exportamos, reanalisado, regenera igual", () => {
  const linhas: LinhaOlac[] = [
    LINHA_BOA,
    {
      competencia_ano: 2026,
      competencia_mes: 8,
      empresa_cnpj: null,
      matricula: "1077",
      colaborador_nome: "João Pereira",
      codigo_rubrica: "2001",
      rubrica_nome: "Desconto INSS",
      natureza: "desconto",
      conta_contabil: null,
      valor_centavos: 30_842,
    },
    {
      competencia_ano: 2026,
      competencia_mes: 8,
      empresa_cnpj: "11222333000181",
      matricula: "1077",
      colaborador_nome: "João Pereira",
      codigo_rubrica: "3001",
      rubrica_nome: "FGTS",
      natureza: "informativa",
      conta_contabil: "2.1.4.02.001",
      valor_centavos: 28_000,
    },
  ];
  const arquivo = gerarArquivoOlac(linhas);

  // O cabeçalho é a primeira linha, e só ele é reconhecido como cabeçalho.
  const fisicas = dividirLinhas(arquivo);
  assert.equal(fisicas[0].bruta, CABECALHO_OLAC);
  assert.ok(ehCabecalhoOlac(fisicas[0].bruta));
  assert.ok(!ehCabecalhoOlac(fisicas[1].bruta));

  const relidas = fisicas.slice(1).map((fisica) => analisar(fisica.bruta));
  assert.deepEqual(relidas, linhas);
  assert.equal(gerarArquivoOlac(relidas), arquivo);
});

// ---------------------------------------------------------------- trava da importação
// O conserto que este teste FIXA: importarOlac sem serialização — duplo POST
// duplicava o espelho (o DELETE de substituição em READ COMMITTED não enxerga
// INSERTs concorrentes). A trava é pg_advisory_xact_lock sobre o hashtext
// DESTA chave, tomada como primeiro passo da transação; o teste congela a
// forma da chave — mudá-la silenciosamente quebraria a exclusão mútua entre
// versões do código em deploy.

test("a chave da trava de importação é canônica: uma por competência, estável, mês com zero à esquerda", () => {
  assert.equal(chaveTravaImportacaoOlac(2026, 8), "fast.olac-import:2026-08");
  assert.equal(chaveTravaImportacaoOlac(2026, 11), "fast.olac-import:2026-11");
  // Estável entre chamadas (é ela que serializa) e distinta por competência
  // (competências diferentes importam em paralelo).
  assert.equal(
    chaveTravaImportacaoOlac(2026, 8),
    chaveTravaImportacaoOlac(2026, 8)
  );
  assert.notEqual(
    chaveTravaImportacaoOlac(2026, 8),
    chaveTravaImportacaoOlac(2026, 9)
  );
  assert.notEqual(
    chaveTravaImportacaoOlac(2026, 8),
    chaveTravaImportacaoOlac(2027, 8)
  );
});
