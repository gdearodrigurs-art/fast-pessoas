import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esquemaNovaRegra,
  interpretarDescricaoSolicitacao,
  montarDescricaoSolicitacao,
} from "../src/dominios/beneficios/esquemas";
import { hojeNaOperacao } from "../src/dominios/colaboradores/esquemas";
import { esquemaData } from "../src/lib/data-civil";

// ===========================================================================
// A borda da regra de elegibilidade de benefício.
//
// EIXO VIGÊNCIA. A regra de elegibilidade é lida por `status = 'ativa'`
// (beneficios/repositorio.ts:62 — `LEFT JOIN … ON r.status = 'ativa'`), nunca
// por data. Enquanto for assim, versão com início no FUTURO passa a valer no
// segundo em que é gravada, e o catálogo, a solicitação, a efetivação e a
// transferência entre CNPJs passam todos a decidir pela regra do ano que vem.
//
// O QUE CUSTOU (medido em 01/08/2026, bancada fast_pessoas_vig_benef, rodando
// os serviços de verdade contra SQL real):
//
//   [1] DP cancela a adesão do Carlos (estagiário, vínculo 39) ao Vale-Refeição
//   [2] Carlos pede o VR de volta HOJE ............ ACEITOU, demanda 69
//   [3] DP cadastra HOJE a regra do VR que só começa em 2027-01-01, só CLT
//       ....................................... ACEITOU (é o defeito)
//   [4] DP cancela a adesão da Daniela (estagiária, vínculo 60) ao MESMO VR
//   [5] Daniela pede o VR de volta HOJE ........... RECUSOU 403
//       "Você não é elegível a este benefício pela regra vigente."
//
// Mesmo dia, mesmo benefício, mesmo tipo de vínculo, duas pessoas: a única
// diferença entre o "sim" e o "403" é uma linha datada de 2027 que entrou no
// meio. E a regra que de fato valia (início 2026-01-01) saiu do ar com
// `fim_vigencia = 2026-12-31`, deixando agosto a dezembro de 2026 sem regra na
// leitura por data e com a regra de 2027 na leitura por status.
//
// A guarda de verdade é `exigirVigenciaNaoFutura` no serviço, dentro da MESMA
// transação da escrita (é ela que lê o "hoje" do banco, no fuso da operação).
// Este arquivo cobre a borda: o esquema recusa antes de abrir transação, e é
// o que o teste puro alcança sem banco.
// ===========================================================================

/** Base mínima válida de uma nova versão de regra — só a data varia por caso. */
function regra(inicio: string) {
  return { criterio: { tipos_vinculo: ["clt"] }, inicio_vigencia: inicio };
}

function somarDias(dataIso: string, dias: number): string {
  const base = new Date(`${dataIso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

test("regra de elegibilidade com vigência no futuro é recusada", () => {
  const analise = esquemaNovaRegra.safeParse(regra("2027-01-01"));
  assert.equal(analise.success, false);
  assert.equal(analise.error?.issues[0].path[0], "inicio_vigencia");
});

test("o futuro começa amanhã: um dia à frente já é recusado", () => {
  // A fronteira é o ponto onde a guarda meia-boca passava despercebida: quem
  // testasse com "2026-08-01" veria verde e concluiria que a trava existe.
  const amanha = somarDias(hojeNaOperacao(), 1);
  const analise = esquemaNovaRegra.safeParse(regra(amanha));
  assert.equal(analise.success, false);
});

test("regra que começa hoje continua sendo aceita", () => {
  // Guarda que barra o caso legítimo é pior que guarda nenhuma: o caminho
  // normal do DP é publicar a regra com a data de hoje.
  const analise = esquemaNovaRegra.safeParse(regra(hojeNaOperacao()));
  assert.equal(analise.success, true);
  assert.equal(analise.data?.inicio_vigencia, hojeNaOperacao());
});

test("regra retroativa continua passando pela borda", () => {
  // A recusa de data para trás é do SERVIÇO (tem que ser posterior ao início
  // da versão vigente, que ele conhece) — não da borda, que não sabe qual é a
  // versão vigente. Travar aqui esconderia a mensagem útil.
  const analise = esquemaNovaRegra.safeParse(regra("2020-01-01"));
  assert.equal(analise.success, true);
});

// ===========================================================================
// O parser da descrição da demanda — três naturezas depois da onda H3.
//
// A chave do benefício viaja DENTRO do texto da demanda, e a natureza é lida
// pelo prefixo. Enquanto eram duas (adesão/cancelamento), o interpretador usava
// um ternário binário: "se é o prefixo de adesão, é adesão; senão, cancelamento".
// A onda H3 acrescentou a terceira (revisão de valor), e aquele ternário
// rotularia a revisão de "cancelamento" — o DP confirmaria um cancelamento que
// ninguém pediu, sobre a adesão errada. A correção foi lookup pelos três
// prefixos; estes testes travam isso.
//
// O eixo por trás: "nada chumbado" na leitura. O prefixo e a chave são o
// contrato entre montar e interpretar — se um lado muda e o outro não, a
// demanda vira ação silenciosamente errada.
// ===========================================================================

test("cada natureza volta com a sua etiqueta, ida e volta", () => {
  for (const natureza of ["adesao", "cancelamento", "revisao"] as const) {
    const descricao = montarDescricaoSolicitacao(
      natureza,
      "Convênio Farmácia",
      "farmacia",
      "um motivo qualquer"
    );
    const lido = interpretarDescricaoSolicitacao(descricao);
    assert.equal(lido?.natureza, natureza);
    assert.equal(lido?.chave, "farmacia");
  }
});

test("revisão não é confundida com cancelamento (o defeito do ternário)", () => {
  // O caso exato que a correção da H3 evita: a descrição de revisão NÃO pode
  // voltar como 'cancelamento'.
  const descricao = montarDescricaoSolicitacao(
    "revisao",
    "Vale-Transporte",
    "vt",
    "mudei de casa"
  );
  const lido = interpretarDescricaoSolicitacao(descricao);
  assert.equal(lido?.natureza, "revisao");
  assert.notEqual(lido?.natureza, "cancelamento");
});

test("nome de benefício que CONTÉM outro prefixo não engana o parser", () => {
  // O prefixo é ancorado em ^ e o nome vai entre aspas; um benefício chamado
  // como um prefixo não deve sequestrar a leitura. A natureza sai do prefixo
  // inicial, não do nome.
  const descricao = montarDescricaoSolicitacao(
    "revisao",
    "Adesão ao benefício especial", // o nome contém o prefixo de adesão
    "especial"
  );
  const lido = interpretarDescricaoSolicitacao(descricao);
  assert.equal(lido?.natureza, "revisao");
  assert.equal(lido?.chave, "especial");
});

test("texto fora do contrato não vira natureza nenhuma", () => {
  // Demanda de outro domínio, ou texto livre, devolve null — nunca um palpite.
  assert.equal(interpretarDescricaoSolicitacao("Ajuste de ponto do dia 05."), null);
  assert.equal(interpretarDescricaoSolicitacao(""), null);
});

// ===========================================================================
// A data civil compartilhada (src/lib/data-civil) — o ida-e-volta.
//
// Catorze módulos tinham a mesma validação por `Date.parse`, que ACEITA
// 2026-02-30 (o JS rola 30/02 para 02/03 e devolve número válido). A fonte
// única troca isso pelo ida-e-volta. Este teste é o que impede a versão fraca
// de voltar sorrateira em qualquer módulo que importe daqui.
// ===========================================================================

test("data civil recusa o dia que não existe (30/02) — o defeito do Date.parse", () => {
  assert.equal(esquemaData.safeParse("2026-02-30").success, false);
  assert.equal(esquemaData.safeParse("2026-04-31").success, false);
  assert.equal(esquemaData.safeParse("2026-13-01").success, false);
});

test("data civil aceita datas reais, inclusive 29/02 de ano bissexto", () => {
  assert.equal(esquemaData.safeParse("2026-09-01").success, true);
  assert.equal(esquemaData.safeParse("2024-02-29").success, true); // bissexto
  assert.equal(esquemaData.safeParse("2026-02-28").success, true);
});

test("data civil recusa 29/02 fora de ano bissexto", () => {
  assert.equal(esquemaData.safeParse("2026-02-29").success, false);
});
