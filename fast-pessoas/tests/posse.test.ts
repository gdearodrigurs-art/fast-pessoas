import { test } from "node:test";
import assert from "node:assert/strict";

import { esquemaRegistroPosse } from "../src/dominios/posse/esquemas";

// ===========================================================================
// Domínio POSSE de patrimônio (migration 0081). O que o zod garante na borda,
// testado sem banco: quantidade inteira >= 1 (espelha o CHECK), data de
// entrega real no calendário (esquemaData, ida-e-volta), descrição
// obrigatória, e os opcionais — nº de série e termo no GED — de fato
// opcionais. A existência/atividade da categoria e a posse do termo pelo
// titular são do serviço (conhecem catálogo e GED); o CHECK de ciência-exige-
// -termo é do banco.
// ===========================================================================

const BASE = {
  categoria_chave: "equipamento_ti",
  descricao: "Notebook Dell i7 patrimônio 123",
  quantidade: 1,
  data_entrega: "2026-08-14",
};

test("registro mínimo (sem série e sem termo) passa na borda", () => {
  const analise = esquemaRegistroPosse.safeParse(BASE);
  assert.equal(analise.success, true);
  assert.equal(analise.data?.numero_serie, undefined);
  assert.equal(analise.data?.termo_documento_id, undefined);
});

test("registro completo (série + termo no GED) passa na borda", () => {
  const analise = esquemaRegistroPosse.safeParse({
    ...BASE,
    numero_serie: "SN-9981",
    termo_documento_id: 42,
  });
  assert.equal(analise.success, true);
  assert.equal(analise.data?.termo_documento_id, 42);
});

test("quantidade zero é recusada (o CHECK do banco exige >= 1)", () => {
  const analise = esquemaRegistroPosse.safeParse({ ...BASE, quantidade: 0 });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) => issue.path.includes("quantidade")),
    true
  );
});

test("quantidade fracionada é recusada", () => {
  const analise = esquemaRegistroPosse.safeParse({ ...BASE, quantidade: 1.5 });
  assert.equal(analise.success, false);
});

test("quantidade ausente é recusada com a mensagem de campo obrigatório", () => {
  const analise = esquemaRegistroPosse.safeParse({
    ...BASE,
    quantidade: undefined,
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some(
      (issue) => issue.message === "Informe a quantidade"
    ),
    true
  );
});

test("data de entrega inexistente no calendário é recusada (30/02 não rola)", () => {
  const analise = esquemaRegistroPosse.safeParse({
    ...BASE,
    data_entrega: "2026-02-30",
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) => issue.path.includes("data_entrega")),
    true
  );
});

test("categoria com forma inválida é recusada antes de ir ao catálogo", () => {
  const analise = esquemaRegistroPosse.safeParse({
    ...BASE,
    categoria_chave: "Equipamento TI",
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) =>
      issue.path.includes("categoria_chave")
    ),
    true
  );
});

test("descrição curta demais é recusada", () => {
  const analise = esquemaRegistroPosse.safeParse({ ...BASE, descricao: "PC" });
  assert.equal(analise.success, false);
});
