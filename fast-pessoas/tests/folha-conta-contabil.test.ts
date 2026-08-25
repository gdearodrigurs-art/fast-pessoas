// De-para rubrica → conta contábil (E3:a) — a regra PURA de vigência
// (src/dominios/folha/conta-contabil.ts). O conserto que esta bateria FIXA:
// a criação validava só contra a vigência ATIVA, então uma vigência
// RETRO-DATADA passava por cima de janela ENCERRADA — duas contas "valendo"
// no mesmo dia, decididas pelo desempate da LATERAL em vez de por regra. A
// interseção agora é validada contra TODAS as vigências (o serviço transforma
// o conflito em 409 com a janela conflitante).
//
// Nada aqui toca banco: o módulo é puro.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  vigenciaContaConflitante,
  type JanelaVigenciaConta,
} from "../src/dominios/folha/conta-contabil";

const ENCERRADA: JanelaVigenciaConta = {
  id: 1,
  conta_contabil: "3.1.1.01.001",
  status: "encerrada",
  inicio_vigencia: "2026-01-01",
  fim_vigencia: "2026-06-30",
};

const ATIVA: JanelaVigenciaConta = {
  id: 2,
  conta_contabil: "3.1.1.01.002",
  status: "ativa",
  inicio_vigencia: "2026-07-01",
  fim_vigencia: null,
};

test("retro-datada sobre janela ENCERRADA conflita — e a mensagem sabe QUAL janela", () => {
  // Início 01/03 cai dentro de [01/01, 30/06], já encerrada: era exatamente o
  // buraco — sem ativa por perto, nada barrava.
  const conflito = vigenciaContaConflitante("2026-03-01", [ENCERRADA]);
  assert.ok(conflito);
  assert.equal(conflito.id, 1);
  assert.equal(conflito.conta_contabil, "3.1.1.01.001");
});

test("no dia do FIM da encerrada ainda conflita; no dia seguinte, não", () => {
  // Interseção com a nova (aberta) existe exatamente quando fim ≥ início novo.
  assert.ok(vigenciaContaConflitante("2026-06-30", [ENCERRADA]));
  assert.equal(vigenciaContaConflitante("2026-07-01", [ENCERRADA]), null);
});

test("a vigência ATIVA fica fora da conta: o serviço a encerra no dia anterior", () => {
  // Início 01/09 > início da ativa: o serviço encerra a ativa em 31/08 — não
  // há interseção a acusar aqui (o caso início ≤ início da ativa é barrado
  // pelo serviço com 400, antes desta função).
  assert.equal(
    vigenciaContaConflitante("2026-09-01", [ENCERRADA, ATIVA]),
    null
  );
});

test("histórico com várias encerradas: acusa a primeira janela alcançada", () => {
  const outraEncerrada: JanelaVigenciaConta = {
    id: 3,
    conta_contabil: "3.1.1.01.003",
    status: "encerrada",
    inicio_vigencia: "2026-07-01",
    fim_vigencia: "2026-07-31",
  };
  // 15/05 alcança as duas janelas ([01/01,30/06] e [01/07,31/07], pois a nova
  // é aberta); em ordem cronológica, a primeira acusada é a de janeiro.
  const conflito = vigenciaContaConflitante("2026-05-15", [
    ENCERRADA,
    outraEncerrada,
  ]);
  assert.ok(conflito);
  assert.equal(conflito.id, 1);
});

test("sem histórico não há conflito", () => {
  assert.equal(vigenciaContaConflitante("2026-03-01", []), null);
});

test("defesa: encerrada sem fim (não deveria existir — CHECK no banco) conta como aberta e conflita", () => {
  const torta: JanelaVigenciaConta = {
    id: 9,
    conta_contabil: "9.9.9",
    status: "encerrada",
    inicio_vigencia: "2020-01-01",
    fim_vigencia: null,
  };
  assert.ok(vigenciaContaConflitante("2026-01-01", [torta]));
});
