import { test } from "node:test";
import assert from "node:assert/strict";

import { validarSequenciaDeEtapas } from "../src/dominios/recrutamento/esquemas";

// ===========================================================================
// Desenho de modelo de processo seletivo — a regra pura que CRIAR e
// REFORMULAR compartilham (pendência #13, decisões G1/G2).
//
// O kanban trata a OFERTA como etapa terminal: esconde "Avançar" na última
// etapa e só oferece "Registrar oferta" em etapa tipo oferta. Um modelo ativo
// que não termina em oferta deixa a candidatura num beco (sem avançar, sem
// ofertar, sem recriar — UNIQUE vaga+candidato). A 0078 blinda isso no banco;
// esta função é a MESMA regra na borda, com mensagem amigável — e agora que a
// reformulação existe, ela é o único caminho de desenho de versão nova.
// ===========================================================================

const CATALOGO = [
  { id: 1, tipo: "triagem", nome: "Triagem" },
  { id: 2, tipo: "entrevista_rh", nome: "Entrevista com o RH" },
  { id: 3, tipo: "entrevista_gestor", nome: "Entrevista com o gestor" },
  { id: 4, tipo: "oferta", nome: "Oferta" },
];

test("sequência completa terminando em oferta passa, na ordem dada", () => {
  const saida = validarSequenciaDeEtapas(CATALOGO, [1, 3, 4]);
  assert.equal(saida.ok, true);
  if (saida.ok) {
    assert.deepEqual(
      saida.etapas.map((e) => e.nome),
      ["Triagem", "Entrevista com o gestor", "Oferta"]
    );
  }
});

test("só a oferta já é um modelo válido — enxuto ao extremo, mas termina certo", () => {
  const saida = validarSequenciaDeEtapas(CATALOGO, [4]);
  assert.equal(saida.ok, true);
});

test("etapa depois da oferta é recusada — o beco que a revisão do Estágio 2 achou", () => {
  const saida = validarSequenciaDeEtapas(CATALOGO, [1, 4, 2]);
  assert.equal(saida.ok, false);
  if (!saida.ok) {
    assert.equal(saida.status, 409);
    assert.match(saida.mensagem, /última/);
  }
});

test("modelo sem oferta nenhuma é recusado — a candidatura nunca chegaria à proposta", () => {
  const saida = validarSequenciaDeEtapas(CATALOGO, [1, 2, 3]);
  assert.equal(saida.ok, false);
});

test("sequência vazia é recusada (não há última etapa para ser a oferta)", () => {
  const saida = validarSequenciaDeEtapas(CATALOGO, []);
  assert.equal(saida.ok, false);
});

test("etapa repetida é recusada como 400 — erro de formulário, não de estado", () => {
  const saida = validarSequenciaDeEtapas(CATALOGO, [1, 1, 4]);
  assert.equal(saida.ok, false);
  if (!saida.ok) {
    assert.equal(saida.status, 400);
  }
});

test("etapa fora do catálogo vigente é recusada como 409 — o catálogo mudou embaixo do formulário", () => {
  const saida = validarSequenciaDeEtapas(CATALOGO, [1, 99, 4]);
  assert.equal(saida.ok, false);
  if (!saida.ok) {
    assert.equal(saida.status, 409);
  }
});
