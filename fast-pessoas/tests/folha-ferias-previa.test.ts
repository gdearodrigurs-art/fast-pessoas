import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CODIGO_ABONO_PECUNIARIO,
  CODIGO_ADICIONAL_FERIAS,
  CODIGO_FERIAS,
  CODIGOS_DO_MOTOR,
} from "../src/dominios/folha/esquemas";

// ===========================================================================
// Travas da revisão adversarial 2026-08 na fronteira FOLHA × FÉRIAS.
//
// B1 — a prévia de férias contava TODO dependente, quando a decisão da
// pendência #9 (migration 0061) é que só o dependente ELEGÍVEL
// (deduz_irrf = true, ato do DP) abate no IRRF. O motor mensal já fazia certo
// em listarColaboradoresParaCalculo; a prévia divergia — o colaborador via na
// prévia um IRRF menor do que a folha de férias real ia descontar.
//
// B2 — o motor de férias (calculo-ferias.ts) resolve 0136/0137/1401 PELO
// CÓDIGO, mas CODIGOS_DO_MOTOR não as listava: dava para encerrar a rubrica
// de férias pela tela e derrubar toda prévia/folha de férias dali em diante.
//
// POR QUE O CASO B1 LÊ O FONTE, E NÃO EXECUTA A FUNÇÃO: a regra É o SQL de
// repositório, e o portão rápido não abre banco — o mesmo motivo (e o mesmo
// molde) de tests/vigencia-na-data.test.ts. O comportamento com banco de
// verdade é provado em provas/folha/prova-dependente-irrf.js.
// ===========================================================================

// Dois lugares porque o `npm test` compila para .tmp-testes/ e o fonte fica em
// src/: daqui ele está dois níveis acima (compilado) ou um (rodando o .ts).
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

/** O corpo de uma função exportada: do `export ... function <nome>` até o
 * próximo `export ` da coluna zero — grosseiro de propósito, para a asserção
 * não vazar para a vizinha (mesmo helper de tests/vigencia-na-data.test.ts). */
function corpoDaFuncao(fonte: string, nome: string): string {
  const inicio = fonte.search(
    new RegExp(`^export (?:async )?function ${nome}\\b`, "m")
  );
  assert.notEqual(inicio, -1, `função ${nome} não encontrada no fonte`);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.search(/^export /m);
  return fim === -1 ? resto : resto.slice(0, fim);
}

// ------------------------------------------------------------------ B1

test("a prévia de férias só deduz dependente ELEGÍVEL (deduz_irrf), como o motor mensal", () => {
  const corpo = corpoDaFuncao(
    lerFonte(path.join("dominios", "folha", "repositorio.ts")),
    "buscarColaboradorParaFerias"
  );
  assert.ok(
    /d\.deduz_irrf\s*=\s*true/.test(corpo),
    "buscarColaboradorParaFerias voltou a contar TODO dependente — sem " +
      "`d.deduz_irrf = true`, dependente que o DP não conferiu abate na " +
      "prévia de férias e a folha real desconta mais do que a prévia mostrou " +
      "(pendência #9, migration 0061)"
  );
  assert.ok(
    /d\.nascimento IS NULL OR d\.nascimento <= \$2/.test(corpo),
    "a vigência por NASCIMENTO na data de referência tem que continuar — " +
      "elegibilidade (deduz_irrf) e vigência (nascimento) são ortogonais e SOMAM"
  );
});

// ------------------------------------------------------------------ B2

test("as rubricas do motor de férias (0136/0137/1401) são protegidas do encerramento", () => {
  for (const codigo of [
    CODIGO_FERIAS,
    CODIGO_ADICIONAL_FERIAS,
    CODIGO_ABONO_PECUNIARIO,
  ]) {
    assert.ok(
      CODIGOS_DO_MOTOR.includes(codigo),
      `CODIGOS_DO_MOTOR deixou a rubrica ${codigo} de fora — encerrá-la pela ` +
        "tela derruba a prévia e a folha de férias inteiras"
    );
  }
});
