import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esquemaNovaFaixaSalarial,
  hojeNaOperacao,
} from "../src/dominios/colaboradores/esquemas";
import { chaveQueAmpliouAFicha } from "../src/dominios/colaboradores/servico";

// ===========================================================================
// Domínio colaboradores — os dois eixos que a ficha e a tabela salarial tocam:
// VIGÊNCIA (a faixa que vale hoje) e RASTRO DE LEITURA (quem leu CPF de quem,
// e com qual chave).
//
// Cada `test` daqui reproduz defeito confirmado no mapa de eixos
// (docs/14-mapa-de-eixos.md, eixos 8 e 10). Apagar um caso é reabrir o buraco.
// ===========================================================================

// ---------------------------------------------------------------- vigência
// DEFEITO (mapa, eixo 10, servico.ts:1845): criarFaixaSalarial aceitava início
// no futuro, e a faixa salarial é o GATE da promoção — `faixaVigenteDoCargo`
// lê por `status = 'ativa'`, sem data. Medido em 01/08/2026 na bancada
// fast_pessoas_i_rastro: cadastrar a faixa de 2027-01-01 no cargo 3 encerrou a
// faixa de 2026 (4.500–6.500) em 2026-12-31 e pôs a de 2027 (9.000–18.000)
// como 'ativa' NO MESMO SEGUNDO. Uma promoção de 2026 para R$ 7.000 passava a
// cair "fora da faixa" e a exigir justificativa de exceção que não existe.
// O vizinho `criarVersaoEstabelecimento`, doze linhas abaixo, já chamava a
// guarda `exigirVigenciaNaoFutura` — por isso o defeito era visível.

test("faixa salarial com início de vigência no futuro é recusada na borda", () => {
  const analise = esquemaNovaFaixaSalarial.safeParse({
    faixa_min: 9000,
    faixa_max: 18000,
    inicio_vigencia: "2027-01-01",
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) =>
      issue.path.includes("inicio_vigencia")
    ),
    true,
    "o erro tem que apontar o campo inicio_vigencia, senão a tela não sabe onde pintar"
  );
});

test("faixa salarial com início de vigência hoje é aceita", () => {
  const analise = esquemaNovaFaixaSalarial.safeParse({
    faixa_min: 4500,
    faixa_max: 6500,
    inicio_vigencia: hojeNaOperacao(),
  });
  assert.equal(analise.success, true);
});

test("faixa salarial retroativa continua aceita — o freio é só para o futuro", () => {
  // Reajuste de convenção assinado em março e lançado em agosto é o caso comum:
  // a guarda de vigência futura não pode cobrar o passado junto.
  const analise = esquemaNovaFaixaSalarial.safeParse({
    faixa_min: 4500,
    faixa_max: 6500,
    inicio_vigencia: "2026-03-01",
  });
  assert.equal(analise.success, true);
});

// ------------------------------------------------------- rastro de leitura
// DEFEITO (mapa, eixo 8, servico.ts:294): `obterColaborador` entregava CPF,
// nascimento, e-mail e os vínculos da pessoa em todas as empresas do grupo, e
// NENHUM ramo gravava trilha. Medido em 01/08/2026 na bancada
// fast_pessoas_i_rastro: a persona `dp` leu a ficha 12 (CPF 42225752320,
// nascimento 1996-01-04) e `audit.leitura_sensivel` continuou em ZERO linhas.
//
// A segunda metade do eixo é a que estes casos guardam: a chave gravada tem de
// ser a que DE FATO autorizou. Carimbar `rh.colaborador.ver.todos` na leitura
// de um gestor que só alcança a própria equipe é trilha que mente sobre o
// alcance de quem leu — e trilha que mente é pior que trilha que falta, porque
// passa despercebida na auditoria.

test("ficha de terceiro lida com alcance amplo grava a chave rh.colaborador.ver.todos", () => {
  assert.equal(
    chaveQueAmpliouAFicha({ alcance: "todos" }, false),
    "rh.colaborador.ver.todos"
  );
});

test("ficha de liderado grava rh.colaborador.ver — a chave que autorizou, não a mais ampla", () => {
  assert.equal(
    chaveQueAmpliouAFicha(
      { alcance: "equipe", colaboradorId: 2, equipeIds: [7] },
      false
    ),
    "rh.colaborador.ver"
  );
});

test("a própria ficha não deixa trilha — não é leitura de dado de terceiro", () => {
  // Vale nos dois alcances amplos: quem tem rh.colaborador.ver.todos também
  // abre a própria ficha, e essa leitura não é sobre ninguém mais.
  assert.equal(chaveQueAmpliouAFicha({ alcance: "todos" }, true), null);
  assert.equal(
    chaveQueAmpliouAFicha(
      { alcance: "equipe", colaboradorId: 2, equipeIds: [7] },
      true
    ),
    null
  );
});

test("quem só alcança a si mesmo nunca gera trilha", () => {
  assert.equal(
    chaveQueAmpliouAFicha({ alcance: "proprio", colaboradorId: 10 }, false),
    null
  );
});
