import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lideradosDaSubArvore,
  LinhaSubArvore,
  PROFUNDIDADE_MAXIMA,
} from "../src/dominios/organograma/esquemas";

// ===========================================================================
// Sub-árvore da equipe (decisão A2:a — Fase 4). A caminhada é em JS de
// propósito (WITH RECURSIVE trava com ciclo na hierarquia); aqui se prova o
// que o SQL não proveria: ciclo não trava nem duplica, o teto de profundidade
// corta a descida, e a raiz fica de fora (quem alcança "a si" no escopo é a
// cláusula de pessoa da condicaoEscopo).
// ===========================================================================

function linha(id: number, gestor: number | null): LinhaSubArvore {
  return { colaborador_id: id, gestor_id: gestor };
}

test("sub-árvore alcança liderados diretos E indiretos, sem a raiz", () => {
  // 1 lidera 2 e 3; 2 lidera 4; 4 lidera 5. 6 é de outro ramo.
  const quadro = [
    linha(1, null),
    linha(2, 1),
    linha(3, 1),
    linha(4, 2),
    linha(5, 4),
    linha(6, 99),
  ];
  const liderados = lideradosDaSubArvore(1, quadro);
  assert.deepEqual([...liderados].sort(), [2, 3, 4, 5]);
});

test("gestor intermediário enxerga só o próprio ramo", () => {
  const quadro = [linha(1, null), linha(2, 1), linha(3, 1), linha(4, 2)];
  assert.deepEqual(lideradosDaSubArvore(2, quadro), [4]);
  assert.deepEqual(lideradosDaSubArvore(3, quadro), []);
});

test("ciclo na hierarquia não trava e não duplica ninguém", () => {
  // 1 → 2 → 3 → 1 (laço) e 3 lidera 4 (subárvore legítima pendurada no laço).
  const quadro = [linha(1, 3), linha(2, 1), linha(3, 2), linha(4, 3)];
  const liderados = lideradosDaSubArvore(1, quadro);
  // A raiz (1) não entra; os demais aparecem UMA vez cada.
  assert.deepEqual([...liderados].sort(), [2, 3, 4]);
});

test("descida para no teto de profundidade", () => {
  // Corrente 0 → 1 → 2 → … mais funda que o teto.
  const quadro: LinhaSubArvore[] = [];
  const total = PROFUNDIDADE_MAXIMA + 5;
  for (let id = 1; id <= total; id += 1) {
    quadro.push(linha(id, id - 1));
  }
  const liderados = lideradosDaSubArvore(0, quadro);
  // Exatamente PROFUNDIDADE_MAXIMA níveis abaixo da raiz — nunca mais fundo.
  assert.equal(liderados.length, PROFUNDIDADE_MAXIMA);
  assert.equal(Math.max(...liderados), PROFUNDIDADE_MAXIMA);
});

test("quem não lidera ninguém tem sub-árvore vazia", () => {
  const quadro = [linha(1, null), linha(2, 1)];
  assert.deepEqual(lideradosDaSubArvore(2, quadro), []);
  assert.deepEqual(lideradosDaSubArvore(77, quadro), []);
});
