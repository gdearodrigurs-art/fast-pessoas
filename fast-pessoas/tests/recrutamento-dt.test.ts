import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

// ===========================================================================
// Relatório dT por etapa (revisão adversarial 2026-08, item B3): a identidade
// do grupo é o CARGO (cv.cargo_id — eixo 2), nunca o NOME da versão do cargo.
// Agrupar por nome fundia dois cargos homônimos num balde só e partia o
// histórico de um cargo renomeado em dois. O nome que a tela mostra é o da
// versão mais recente — só exibição.
//
// POR QUE LÊ O FONTE: a regra É o SQL de repositório e o portão rápido não
// abre banco — o mesmo molde de tests/vigencia-na-data.test.ts.
// ===========================================================================

const RAIZES = [
  path.resolve(__dirname, "..", "..", "src"),
  path.resolve(__dirname, "..", "src"),
];

function lerFonte(relativo: string): string {
  for (const raiz of RAIZES) {
    try {
      return readFileSync(path.join(raiz, relativo), "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(`fonte não encontrado em nenhuma raiz: ${relativo}`);
}

function corpoDaFuncao(fonte: string, nome: string): string {
  const inicio = fonte.search(
    new RegExp(`^export (?:async )?function ${nome}\\b`, "m")
  );
  assert.notEqual(inicio, -1, `função ${nome} não encontrada no fonte`);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.search(/^export /m);
  return fim === -1 ? resto : resto.slice(0, fim);
}

test("o relatório dT agrupa por cargo_id, não pelo nome da versão do cargo", () => {
  const corpo = corpoDaFuncao(
    lerFonte(path.join("dominios", "recrutamento", "repositorio.ts")),
    "apurarTempoPorEtapa"
  );
  assert.ok(
    /GROUP BY cv\.cargo_id/.test(corpo),
    "apurarTempoPorEtapa tem que agrupar por cv.cargo_id — a identidade " +
      "estável do cargo (eixo 2)"
  );
  assert.ok(
    !/GROUP BY cv\.nome/.test(corpo),
    "apurarTempoPorEtapa voltou a agrupar pelo NOME da versão do cargo — " +
      "cargos homônimos se fundem e renomear o cargo parte o histórico em dois"
  );
});
