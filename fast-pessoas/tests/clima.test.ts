import { test } from "node:test";
import assert from "node:assert/strict";

import { aplicarPisoAgregadoGeral } from "../src/dominios/clima/repositorio";

// ===========================================================================
// EIXO 8 — piso de anonimato (k) no painel de clima.
//
// Só o agregado POR UNIDADE tinha o piso (HAVING COUNT(DISTINCT pessoa_id) >=
// minimo). Geral, por dia e por pergunta devolviam AVG+COUNT sem piso — num
// recorte de baixa adesão dava para publicar "respostas: 1, média: <nota
// exata da pessoa>". O piso por dia/pergunta é HAVING no SQL (omite o ponto);
// no geral (linha única) a supressão é esta função pura: abaixo do mínimo, a
// MÉDIA some, as contagens de rede ficam (não identificam ninguém).
// O mínimo é administrável (sistema.parametro_privacidade) — nada chumbado.
// ===========================================================================

test("abaixo do mínimo de respondentes, a média geral é suprimida", () => {
  // 1 respondente e mínimo 5: a média seria a nota exata da pessoa.
  const saida = aplicarPisoAgregadoGeral(
    { media: 4.2, respostas: 3, respondentes: 1 },
    5
  );
  assert.equal(saida.media, null);
});

test("suprimir a média mantém as contagens de rede (adesão baixa continua visível)", () => {
  const saida = aplicarPisoAgregadoGeral(
    { media: 4.2, respostas: 3, respondentes: 1 },
    5
  );
  assert.equal(saida.respostas, 3);
  assert.equal(saida.respondentes, 1);
});

test("no mínimo exato o ponto passa — o piso é inclusivo (>=), igual ao por unidade", () => {
  const saida = aplicarPisoAgregadoGeral(
    { media: 3.7, respostas: 12, respondentes: 5 },
    5
  );
  assert.equal(saida.media, 3.7);
});

test("acima do mínimo a média é devolvida intacta", () => {
  const entrada = { media: 4.0, respostas: 40, respondentes: 20 };
  assert.deepEqual(aplicarPisoAgregadoGeral(entrada, 5), entrada);
});

test("período sem respostas (respondentes 0) não vira média fabricada", () => {
  const saida = aplicarPisoAgregadoGeral(
    { media: null, respostas: 0, respondentes: 0 },
    5
  );
  assert.equal(saida.media, null);
});
