import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MINIMO_AMOSTRA_PADRAO,
  pessoasDoRecorte,
} from "../src/dominios/pesquisas/esquemas";

// ===========================================================================
// O piso de anonimato da pesquisa de clima.
//
// O defeito que estes casos travam não custou dinheiro: custou a promessa que
// faz a pessoa responder com sinceridade. `recortesPorUnidade` aplicava o piso
// sobre a SOMA das respostas da unidade — e resposta não é gente. Medido na
// bancada fast_pessoas_k_pesquisa, pesquisa 5, unidade 1 ("Matriz Centro"),
// k vigente = 5:
//
//   3 pessoas x 2 perguntas de escala  -> respostas_escala = 6  -> PUBLICAVA
//   3 pessoas x 2 perguntas de nota    -> respostas_nps     = 6  -> PUBLICAVA
//
// Média 4,00 e eNPS 100 saíam para a tela com TRÊS pessoas atrás. Com 20
// perguntas, o mesmo piso de 5 seria alcançado por UMA pessoa sozinha.
// ===========================================================================

test("o piso conta pessoas: 3 pessoas em 2 perguntas não viram amostra de 6", () => {
  // Cada pessoa responde cada pergunta no máximo uma vez (trava 0052, por
  // PESSOA, mais a recusa de pergunta repetida no envio), então a contagem de
  // UMA pergunta já é contagem de gente. A do recorte é a menor delas.
  assert.equal(pessoasDoRecorte([3, 3]), 3);
  assert.ok(
    pessoasDoRecorte([3, 3]) < MINIMO_AMOSTRA_PADRAO,
    "3 pessoas têm de ser suprimidas por um piso de 5"
  );
  // O que a soma dizia — e por que ela passava.
  assert.equal([3, 3].reduce((a, b) => a + b, 0), 6);
});

test("o piso é a MENOR pergunta do recorte, não a maior nem a média", () => {
  // Pergunta opcional respondida por poucos derruba o recorte inteiro: a média
  // da unidade mistura as perguntas, então ela vale o elo mais fraco.
  assert.equal(pessoasDoRecorte([40, 3, 12]), 3);
});

test("uma pergunta só: o piso é a própria contagem dela", () => {
  assert.equal(pessoasDoRecorte([7]), 7);
});

test("recorte sem nenhuma pergunta respondida não é publicável", () => {
  // Zero, não Infinity: `Math.min()` sem argumento devolve Infinity, e Infinity
  // passaria por qualquer piso — publicaria o recorte vazio.
  assert.equal(pessoasDoRecorte([]), 0);
  assert.ok(pessoasDoRecorte([]) < MINIMO_AMOSTRA_PADRAO);
});
