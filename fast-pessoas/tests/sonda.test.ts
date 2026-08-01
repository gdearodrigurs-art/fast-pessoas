import { test } from "node:test";
import assert from "node:assert/strict";

// SONDA da montagem da suíte — prova que o caminho funciona ponta a ponta:
// tsconfig.testes.json compila só o alcance dos testes, e o node --test roda o resultado.
// Vai embora quando os testes de verdade chegarem.
import { calcularFolha } from "../src/dominios/folha/calculo";
import { MINUTOS_DO_DIA } from "../src/dominios/ponto/calculo";

test("o motor da folha é alcançável pela suíte", () => {
  assert.equal(typeof calcularFolha, "function");
});

test("a constante do ponto atravessa a compilação", () => {
  assert.equal(MINUTOS_DO_DIA, 1440);
});
