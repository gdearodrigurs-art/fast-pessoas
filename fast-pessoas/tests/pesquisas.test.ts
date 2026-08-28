import { test } from "node:test";
import assert from "node:assert/strict";

import {
  alvoDaLinha,
  alvoPreenchido,
  esquemaAlvoPesquisa,
  MINIMO_AMOSTRA_PADRAO,
  pesquisaTemAlvo,
  pessoasDoRecorte,
  recorteCasaAlvo,
  type RecorteAlvo,
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

// ===========================================================================
// Público-alvo (0079): o gate de elegibilidade e a forma do alvo.
//
// A REGRA-MESTRA é a regressão: alvo VAZIO (os quatro NULL) = empresa toda =
// todo mundo casa. Só quando alguma dimensão vem preenchida o recorte estreita,
// e em E conjuntivo. Estes casos travam a mesma lógica que o servidor usa para
// barrar responder/ver formulário fora do alvo — a versão TypeScript do WHERE
// do gate de listagem.
// ===========================================================================

const RECORTE_VAZIO: RecorteAlvo = {
  empresa_id: null,
  estabelecimento_id: null,
  centro_custo_id: null,
  cargo_id: null,
};

/** Uma pessoa qualquer: registrada na empresa 1, loja 2, CC 3, cargo 4. */
const PESSOA: RecorteAlvo = {
  empresa_id: 1,
  estabelecimento_id: 2,
  centro_custo_id: 3,
  cargo_id: 4,
};

test("alvo vazio = empresa toda: não tem alvo e casa qualquer pessoa", () => {
  assert.equal(pesquisaTemAlvo(RECORTE_VAZIO), false);
  // Sem alvo, o servidor nem chega a comparar — mas se comparasse, casa todos.
  assert.equal(recorteCasaAlvo(RECORTE_VAZIO, PESSOA), true);
  assert.equal(recorteCasaAlvo(RECORTE_VAZIO, RECORTE_VAZIO), true);
});

test("qualquer dimensão preenchida já é alvo", () => {
  assert.equal(pesquisaTemAlvo({ ...RECORTE_VAZIO, cargo_id: 4 }), true);
  assert.equal(pesquisaTemAlvo({ ...RECORTE_VAZIO, empresa_id: 1 }), true);
});

test("uma dimensão preenchida exige igualdade naquela dimensão", () => {
  assert.equal(
    recorteCasaAlvo({ ...RECORTE_VAZIO, empresa_id: 1 }, PESSOA),
    true
  );
  assert.equal(
    recorteCasaAlvo({ ...RECORTE_VAZIO, empresa_id: 9 }, PESSOA),
    false
  );
});

test("alvo conjuntivo (E): casa só quem bate em TODAS as dimensões dadas", () => {
  // empresa 1 E cargo 4 — a pessoa bate nos dois.
  assert.equal(
    recorteCasaAlvo(
      { ...RECORTE_VAZIO, empresa_id: 1, cargo_id: 4 },
      PESSOA
    ),
    true
  );
  // empresa 1 E cargo 5 — bate na empresa, falha no cargo: fora.
  assert.equal(
    recorteCasaAlvo(
      { ...RECORTE_VAZIO, empresa_id: 1, cargo_id: 5 },
      PESSOA
    ),
    false
  );
});

test("dimensão exigida com recorte da pessoa NULL não casa", () => {
  // Alvo pede cargo 4; pessoa sem posição vigente (cargo_id null) fica de fora —
  // é o mesmo que `p.cargo_id = pos.cargo_id` faz no SQL quando pos é NULL.
  const semCargo: RecorteAlvo = { ...PESSOA, cargo_id: null };
  assert.equal(
    recorteCasaAlvo({ ...RECORTE_VAZIO, cargo_id: 4 }, semCargo),
    false
  );
});

test("alvoPreenchido lê o alvo do formulário (undefined, não null)", () => {
  assert.equal(alvoPreenchido(undefined), false);
  assert.equal(alvoPreenchido({}), false);
  assert.equal(alvoPreenchido({ cargo_id: 4 }), true);
});

test("alvoDaLinha converte NULL da coluna em undefined para o filtro", () => {
  assert.deepEqual(alvoDaLinha(RECORTE_VAZIO), {
    empresa_id: undefined,
    estabelecimento_id: undefined,
    centro_custo_id: undefined,
    cargo_id: undefined,
  });
  assert.deepEqual(alvoDaLinha({ ...RECORTE_VAZIO, empresa_id: 7 }), {
    empresa_id: 7,
    estabelecimento_id: undefined,
    centro_custo_id: undefined,
    cargo_id: undefined,
  });
});

test("esquemaAlvoPesquisa: coage ids-texto, recusa não-positivo, tudo opcional", () => {
  // A query chega como texto; z.coerce transforma. Recorte vazio parseia limpo.
  assert.deepEqual(esquemaAlvoPesquisa.parse({}), {});
  const analisado = esquemaAlvoPesquisa.parse({
    empresa_id: "1",
    cargo_id: "4",
  });
  assert.equal(analisado.empresa_id, 1);
  assert.equal(analisado.cargo_id, 4);
  // Zero ou negativo não é id de cargo válido.
  assert.equal(esquemaAlvoPesquisa.safeParse({ cargo_id: "0" }).success, false);
  assert.equal(esquemaAlvoPesquisa.safeParse({ cargo_id: "-3" }).success, false);
});
