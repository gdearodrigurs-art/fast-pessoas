import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avisoCompetenciasCalculadas,
  chaveDeNome,
  esquemaRegistroMedida,
  trechoRemovidoDaSuspensao,
  validarEncurtamentoDeSuspensao,
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

// ---------------------------------------------------------------- fechar/encurtar suspensão (D1:a)
// Regras do dono (docs/20, D1:a): SÓ encurtar o fim — nunca estender nem
// reabrir (estender = medida nova); data retroativa aceita até o INÍCIO da
// janela; janela cujo fim já passou é história, não se reescreve.

const HOJE = "2026-08-25";

test("encurtar o fim de uma suspensão viva passa", () => {
  const problema = validarEncurtamentoDeSuspensao(
    { inicio: "2026-08-20", fim: "2026-08-30" },
    "2026-08-26",
    HOJE
  );
  assert.equal(problema, null);
});

test("retroativo é aceito ATÉ o início da janela — no início inclusive", () => {
  assert.equal(
    validarEncurtamentoDeSuspensao(
      { inicio: "2026-08-20", fim: "2026-08-30" },
      "2026-08-20",
      HOJE
    ),
    null
  );
});

test("novo fim antes do início da janela é recusado", () => {
  const problema = validarEncurtamentoDeSuspensao(
    { inicio: "2026-08-20", fim: "2026-08-30" },
    "2026-08-19",
    HOJE
  );
  assert.notEqual(problema, null);
  assert.equal(problema?.campo, "fim");
});

test("estender a suspensão é recusado — estender é medida nova", () => {
  const problema = validarEncurtamentoDeSuspensao(
    { inicio: "2026-08-20", fim: "2026-08-30" },
    "2026-09-15",
    HOJE
  );
  assert.notEqual(problema, null);
});

test("repetir o fim atual também é recusado — não houve encurtamento", () => {
  assert.notEqual(
    validarEncurtamentoDeSuspensao(
      { inicio: "2026-08-20", fim: "2026-08-30" },
      "2026-08-30",
      HOJE
    ),
    null
  );
});

test("janela cujo fim já passou não se reabre nem se reescreve", () => {
  const problema = validarEncurtamentoDeSuspensao(
    { inicio: "2026-07-01", fim: "2026-07-05" },
    "2026-07-03",
    HOJE
  );
  assert.notEqual(problema, null);
});

test("medida pontual (sem janela) não tem o que encerrar", () => {
  const problema = validarEncurtamentoDeSuspensao(
    { inicio: null, fim: null },
    "2026-08-26",
    HOJE
  );
  assert.notEqual(problema, null);
});

test("janela com fim em aberto (schema permite) aceita o fechamento", () => {
  // registrarMedida sempre grava fim, mas o schema da 0080 permite fim nulo —
  // e a régua não pode recusar exatamente o caso que mais precisa de fechamento.
  assert.equal(
    validarEncurtamentoDeSuspensao(
      { inicio: "2026-08-20", fim: null },
      "2026-08-26",
      HOJE
    ),
    null
  );
});

// ---------------------------------------------------------------- trecho removido pelo encurtamento (D4)
// O encurtamento pode chegar depois de uma competência já calculada ter lido a
// janela cheia (D2:a): o serviço pergunta ao banco quais competências
// CALCULADAS intersectam o trecho removido e devolve o aviso no payload, sem
// bloquear. As duas pontas puras — o trecho e o texto — são cobertas aqui.

test("D4: o trecho removido nasce no dia seguinte ao novo fim e vai até o fim antigo", () => {
  assert.deepEqual(trechoRemovidoDaSuspensao("2026-09-10", "2026-09-04"), {
    inicio: "2026-09-05",
    fim: "2026-09-10",
  });
});

test("D4: janela ABERTA encurtada remove dali em diante — fim nulo no trecho", () => {
  assert.deepEqual(trechoRemovidoDaSuspensao(null, "2026-08-31"), {
    inicio: "2026-09-01",
    fim: null,
  });
});

test("D4: o dia seguinte atravessa fim de mês, de ano e o 29 de fevereiro no calendário civil", () => {
  assert.deepEqual(trechoRemovidoDaSuspensao(null, "2026-12-31"), {
    inicio: "2027-01-01",
    fim: null,
  });
  assert.deepEqual(trechoRemovidoDaSuspensao("2026-03-05", "2026-02-28"), {
    inicio: "2026-03-01",
    fim: "2026-03-05",
  });
  assert.deepEqual(trechoRemovidoDaSuspensao("2028-03-05", "2028-02-28"), {
    inicio: "2028-02-29", // 2028 é bissexto
    fim: "2028-03-05",
  });
});

test("D4: novo fim igual ou posterior ao atual não remove nada (a régua D1 já barrou — defesa)", () => {
  assert.equal(trechoRemovidoDaSuspensao("2026-09-10", "2026-09-10"), null);
  assert.equal(trechoRemovidoDaSuspensao("2026-09-10", "2026-09-11"), null);
});

test("D4: o aviso nomeia cada competência calculada e pede recálculo/complementar; sem competência, sem aviso", () => {
  assert.equal(avisoCompetenciasCalculadas([]), null);
  const um = avisoCompetenciasCalculadas([{ ano: 2026, mes: 9 }]);
  assert.match(um ?? "", /competência 9\/2026 calculada com esse período/);
  assert.match(um ?? "", /recalcule/);
  assert.match(um ?? "", /complementar/);
  const dois = avisoCompetenciasCalculadas([
    { ano: 2026, mes: 9 },
    { ano: 2026, mes: 10 },
  ]);
  assert.match(dois ?? "", /competências 9\/2026, 10\/2026 calculadas/);
});

// ---------------------------------------------------------------- chave derivada do nome (catálogo)

test("chaveDeNome deriva slug estável do nome digitado", () => {
  assert.equal(chaveDeNome("Comunicado formal"), "comunicado_formal");
  assert.equal(chaveDeNome("Suspensão"), "suspensao");
  assert.equal(chaveDeNome("   "), "");
});
