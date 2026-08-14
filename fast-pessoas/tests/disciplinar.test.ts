import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chaveDeNome,
  esquemaRegistroMedida,
  validarPeriodoDaMedida,
} from "../src/dominios/disciplinar/esquemas";

// ===========================================================================
// Domínio DISCIPLINAR (migration 0080). A regra que NÃO cabe no zod puro: se o
// TIPO abre janela (`com_periodo`, atributo do catálogo), inicio/fim são
// obrigatórios; se não abre, os dois têm que vir vazios. O zod não conhece o
// catálogo — por isso a regra mora no serviço, testada aqui pela função pura
// `validarPeriodoDaMedida` (sem banco). O que o zod GARANTE é só a coerência
// estrutural (fim exige inicio; fim não antecede inicio).
// ===========================================================================

// ---------------------------------------------------------------- período por tipo (serviço)

test("suspensão (com_periodo) sem início é recusada, apontando o campo início", () => {
  const problema = validarPeriodoDaMedida(true, { fim: "2026-09-05" });
  assert.notEqual(problema, null);
  assert.equal(problema?.campo, "inicio");
});

test("suspensão (com_periodo) sem fim é recusada, apontando o campo fim", () => {
  const problema = validarPeriodoDaMedida(true, { inicio: "2026-09-01" });
  assert.notEqual(problema, null);
  assert.equal(problema?.campo, "fim");
});

test("suspensão com início e fim válidos passa", () => {
  const problema = validarPeriodoDaMedida(true, {
    inicio: "2026-09-01",
    fim: "2026-09-05",
  });
  assert.equal(problema, null);
});

test("advertência (sem período) que traz início/fim é recusada", () => {
  const problema = validarPeriodoDaMedida(false, {
    inicio: "2026-09-01",
    fim: "2026-09-05",
  });
  assert.notEqual(problema, null);
});

test("advertência (sem período) sem início e sem fim passa", () => {
  const problema = validarPeriodoDaMedida(false, {});
  assert.equal(problema, null);
});

test("fim antes do início é recusado mesmo num tipo com período", () => {
  const problema = validarPeriodoDaMedida(true, {
    inicio: "2026-09-10",
    fim: "2026-09-05",
  });
  assert.notEqual(problema, null);
  assert.equal(problema?.campo, "fim");
});

// ---------------------------------------------------------------- coerência estrutural (zod, na borda)

test("registro com fim sem início é recusado na borda, no campo início", () => {
  const analise = esquemaRegistroMedida.safeParse({
    tipo_chave: "suspensao",
    descricao: "Ausência reiterada sem justificativa.",
    aplicada_em: "2026-08-14",
    fim: "2026-09-05",
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) => issue.path.includes("inicio")),
    true
  );
});

test("registro com fim anterior ao início é recusado na borda, no campo fim", () => {
  const analise = esquemaRegistroMedida.safeParse({
    tipo_chave: "suspensao",
    descricao: "Suspensão de três dias.",
    aplicada_em: "2026-08-14",
    inicio: "2026-09-10",
    fim: "2026-09-05",
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) => issue.path.includes("fim")),
    true
  );
});

test("registro pontual (advertência) sem janela passa na borda", () => {
  const analise = esquemaRegistroMedida.safeParse({
    tipo_chave: "advertencia_escrita",
    descricao: "Descumprimento de norma de segurança.",
    aplicada_em: "2026-08-14",
  });
  assert.equal(analise.success, true);
});

// ---------------------------------------------------------------- chave derivada do nome (catálogo)

test("chaveDeNome deriva slug estável do nome digitado", () => {
  assert.equal(chaveDeNome("Comunicado formal"), "comunicado_formal");
  assert.equal(chaveDeNome("Suspensão"), "suspensao");
  assert.equal(chaveDeNome("   "), "");
});
