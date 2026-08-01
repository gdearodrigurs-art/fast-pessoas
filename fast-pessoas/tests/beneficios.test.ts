import { test } from "node:test";
import assert from "node:assert/strict";

import { esquemaNovaRegra } from "../src/dominios/beneficios/esquemas";
import { hojeNaOperacao } from "../src/dominios/colaboradores/esquemas";

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
