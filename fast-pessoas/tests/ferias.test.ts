import { test } from "node:test";
import assert from "node:assert/strict";

import {
  periodosEsperados,
  periodosFaltantes,
} from "../src/dominios/ferias/calculo";

// ===========================================================================
// GERADOR LAZY DE PERÍODOS AQUISITIVOS (dívida B6/B8 da pendência #15).
//
// Prova a metade PURA do gerador: a régua de ferias/calculo.ts — quais
// períodos existem para uma admissão (periodosEsperados) e quais ainda faltam
// materializar dado o que o banco já tem (periodosFaltantes, a parte sem I/O
// de garantirPeriodos). A outra metade — o INSERT em lote com ON CONFLICT
// DO NOTHING e o SELECT escopado (a troca laço→lote da revisão geral) — é
// provada contra o banco em db/provas-ferias.js.
//
// Datas FIXAS: o "hoje" entra por parâmetro, então nada aqui depende do
// relógio — o teste responde o mesmo em qualquer data e em qualquer fuso.
// ===========================================================================

const HOJE = "2026-08-24";

test("admissão futura ainda não gera período nenhum", () => {
  assert.deepEqual(periodosEsperados("2026-09-01", HOJE), []);
});

test("admitido hoje já abre o primeiro aquisitivo, em aberto", () => {
  assert.deepEqual(periodosEsperados(HOJE, HOJE), [
    {
      inicio: "2026-08-24",
      fim: "2027-08-23",
      limite_concessivo: "2028-08-23",
      status: "em_aberto",
    },
  ]);
});

test("múltiplos períodos: um por aniversário, contíguos, até hoje", () => {
  const periodos = periodosEsperados("2023-05-10", HOJE);
  assert.equal(periodos.length, 4);
  assert.deepEqual(
    periodos.map((p) => [p.inicio, p.fim, p.status]),
    [
      ["2023-05-10", "2024-05-09", "vencido"],
      ["2024-05-10", "2025-05-09", "vencido"],
      ["2025-05-10", "2026-05-09", "em_aberto"],
      ["2026-05-10", "2027-05-09", "em_aberto"],
    ]
  );
});

test("o período em curso (ainda não fechou) já aparece, em aberto", () => {
  const periodos = periodosEsperados("2026-01-10", HOJE);
  assert.equal(periodos.length, 1);
  const [atual] = periodos;
  // O aquisitivo só fecha em 2027 — mas já existe e já acumula.
  assert.ok(atual.fim > HOJE);
  assert.deepEqual(atual, {
    inicio: "2026-01-10",
    fim: "2027-01-09",
    limite_concessivo: "2028-01-09",
    status: "em_aberto",
  });
});

test("limite concessivo = fim + 12 meses (art. 134; pendência #3), não 11", () => {
  const [primeiro] = periodosEsperados("2023-05-10", HOJE);
  assert.equal(primeiro.fim, "2024-05-09");
  assert.equal(primeiro.limite_concessivo, "2025-05-09"); // fim + 12
  assert.notEqual(primeiro.limite_concessivo, "2025-04-09"); // a régua antiga (11)
});

test("limite que cairia em 29/02 inexistente trava no último dia do mês", () => {
  // Admitido em 01/03/2023: o primeiro aquisitivo fecha em 29/02/2024 (bissexto).
  // +12 meses seria 29/02/2025 — que não existe — então trava em 28/02/2025.
  const [primeiro] = periodosEsperados("2023-03-01", HOJE);
  assert.equal(primeiro.fim, "2024-02-29");
  assert.equal(primeiro.limite_concessivo, "2025-02-28");
});

test("admitido em 29/02: aniversários viram 01/03, sem furo nem sobreposição", () => {
  const periodos = periodosEsperados("2024-02-29", HOJE);
  assert.deepEqual(
    periodos.map((p) => [p.inicio, p.fim, p.limite_concessivo, p.status]),
    [
      ["2024-02-29", "2025-02-28", "2026-02-28", "vencido"],
      ["2025-03-01", "2026-02-28", "2027-02-28", "em_aberto"],
      ["2026-03-01", "2027-02-28", "2028-02-28", "em_aberto"],
    ]
  );
  // Contíguos: cada período começa no dia seguinte ao fim do anterior.
  assert.equal(periodos[0].fim, "2025-02-28");
  assert.equal(periodos[1].inicio, "2025-03-01");
});

test("vencido é só DEPOIS do limite: no dia do limite ainda não afirma dobro", () => {
  // Admitido em 25/08/2024: limite concessivo do 1º período = 24/08/2026.
  const noDia = periodosEsperados("2024-08-25", "2026-08-24");
  assert.equal(noDia[0].limite_concessivo, "2026-08-24");
  assert.equal(noDia[0].status, "em_aberto"); // hoje == limite: ainda dentro
  const diaSeguinte = periodosEsperados("2024-08-25", "2026-08-25");
  assert.equal(diaSeguinte[0].status, "vencido"); // limite passou: dobro (art. 137)
});

test("trava de segurança: no máximo 80 ciclos, mesmo com admissão centenária", () => {
  assert.equal(periodosEsperados("1920-01-01", HOJE).length, 80);
});

test("idempotência: o que a 1ª rodada gera, a 2ª não gera de novo", () => {
  const colaboradores = [
    { id: 7, data_admissao: "2023-05-10" },
    { id: 9, data_admissao: "2026-01-10" },
  ];
  const primeira = periodosFaltantes(colaboradores, [], HOJE);
  assert.equal(primeira.length, 5); // 4 do veterano + 1 do recém-admitido

  // "Persiste" o resultado da primeira rodada e roda de novo: nada falta.
  const existentes = primeira.map((p) => ({
    colaborador_id: p.colaborador_id,
    inicio: p.inicio,
  }));
  assert.deepEqual(periodosFaltantes(colaboradores, existentes, HOJE), []);
});

test("parcialmente materializado: volta SÓ o que falta, com os dados completos", () => {
  const colaboradores = [{ id: 7, data_admissao: "2023-05-10" }];
  const todos = periodosFaltantes(colaboradores, [], HOJE);
  const existentes = todos
    .filter((p) => p.inicio !== "2025-05-10")
    .map((p) => ({ colaborador_id: p.colaborador_id, inicio: p.inicio }));

  const faltantes = periodosFaltantes(colaboradores, existentes, HOJE);
  assert.deepEqual(faltantes, [
    {
      colaborador_id: 7,
      inicio: "2025-05-10",
      fim: "2026-05-09",
      limite_concessivo: "2027-05-09",
      status: "em_aberto",
    },
  ]);
});

test("a chave é colaborador × início: o período de um não quita o do outro", () => {
  const colaboradores = [
    { id: 1, data_admissao: "2026-01-10" },
    { id: 2, data_admissao: "2026-01-10" }, // admitidos no MESMO dia
  ];
  const existentes = [{ colaborador_id: 1, inicio: "2026-01-10" }];
  const faltantes = periodosFaltantes(colaboradores, existentes, HOJE);
  assert.equal(faltantes.length, 1);
  assert.equal(faltantes[0].colaborador_id, 2);
  assert.equal(faltantes[0].inicio, "2026-01-10");
});
