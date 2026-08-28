import { test } from "node:test";
import assert from "node:assert/strict";

import { recorteNaData } from "../src/dominios/painel-executivo/repositorio";

// ===========================================================================
// O recorte dos três (registro / lotação / centro de custo) no Dashboard
// Executivo. `recorteNaData` é o coração do filtro, e duas coisas nele não podem
// quebrar sem alguém ver:
//
//  1. REGRA-MESTRA: filtro vazio -> string vazia e NENHUM parâmetro empurrado.
//     É o que garante que, com nada escolhido, cada consulta gere EXATAMENTE o
//     SQL de antes deste filtro e nenhum número mude.
//  2. PONTO-NO-TEMPO: o recorte resolve a lotação NA data-régua da consulta (via
//     LOTACAO_EM), não a "última lotação de hoje". É o oposto do
//     condicaoFiltroEstrutura de estrutura/repositorio (que ordena por vigência
//     e pega LIMIT 1) — aqui NÃO pode haver ORDER BY/LIMIT.
//
// Como é função pura (monta SQL e empurra params, sem abrir banco), o portão
// rápido roda ela de verdade — não é leitura de fonte por regex.
// ===========================================================================

test("recorteNaData: filtro vazio devolve string vazia e não mexe nos params", () => {
  const params: unknown[] = ["2026-08-14"];
  const sql = recorteNaData({}, params, "$1");
  assert.equal(sql, "", "com filtro vazio o pedaço de WHERE tem que ser vazio");
  assert.deepEqual(
    params,
    ["2026-08-14"],
    "com filtro vazio nenhum parâmetro pode ser empurrado — senão o SQL muda"
  );
});

test("recorteNaData: um campo vira AND EXISTS na data-régua, empurrando o id", () => {
  const params: unknown[] = ["2026-08-14"];
  const sql = recorteNaData({ empresa_id: 7 }, params, "$1");

  assert.deepEqual(
    params,
    ["2026-08-14", 7],
    "o id escolhido entra como próximo parâmetro ($2)"
  );
  assert.match(sql, /^\s*AND EXISTS \(/, "recorte é um AND EXISTS colável no WHERE");
  assert.match(sql, /FROM rh\.lotacao l/);
  assert.match(sql, /l\.colaborador_id = c\.id/, "correlaciona pela pessoa (alias c)");
  assert.match(sql, /l\.empresa_id = \$2/, "compara a empresa pelo id empurrado");
  // Resolve a lotação NA data-régua ($1), via LOTACAO_EM (ponto-no-tempo):
  assert.match(sql, /l\.inicio_vigencia <= \$1::date/);
  assert.match(sql, /l\.fim_vigencia IS NULL OR l\.fim_vigencia >= \$1::date/);
  // NÃO é "a última lotação de hoje": nada de ORDER BY/LIMIT aqui.
  assert.doesNotMatch(sql, /ORDER BY/);
  assert.doesNotMatch(sql, /LIMIT/);
});

test("recorteNaData: a véspera do desligamento entra na régua (precedente J-3)", () => {
  const params: unknown[] = ["2025-08-15", "2026-08-14"];
  const sql = recorteNaData(
    { estabelecimento_id: 3 },
    params,
    "(c.data_desligamento - 1)"
  );
  assert.deepEqual(params, ["2025-08-15", "2026-08-14", 3]);
  assert.match(sql, /l\.estabelecimento_id = \$3/);
  assert.match(
    sql,
    /l\.inicio_vigencia <= \(c\.data_desligamento - 1\)::date/,
    "a data-régua da consulta é embutida na comparação de vigência da lotação"
  );
});

test("recorteNaData: os três juntos entram em E, cada um com seu parâmetro", () => {
  const params: unknown[] = ["2026-08-14"];
  const sql = recorteNaData(
    { empresa_id: 1, estabelecimento_id: 2, centro_custo_id: 3 },
    params,
    "$1"
  );
  assert.deepEqual(
    params,
    ["2026-08-14", 1, 2, 3],
    "os três ids entram na ordem empresa, estabelecimento, centro de custo"
  );
  assert.match(sql, /l\.empresa_id = \$2/);
  assert.match(sql, /l\.estabelecimento_id = \$3/);
  assert.match(sql, /l\.centro_custo_id = \$4/);
  assert.match(sql, /AND/, "as comparações entram em E (todas juntas)");
});

test("recorteNaData: alias de colaborador customizado é respeitado", () => {
  const params: unknown[] = ["2026-08-14"];
  const sql = recorteNaData({ centro_custo_id: 9 }, params, "$1", "co");
  assert.match(
    sql,
    /l\.colaborador_id = co\.id/,
    "quando a consulta chama a pessoa de outro alias, o EXISTS correlaciona por ele"
  );
});
