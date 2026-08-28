import { test } from "node:test";
import assert from "node:assert/strict";

import { TIPOS_AFASTAMENTO } from "../src/dominios/afastamentos/esquemas";
import { tipoAfastamentoEhClinico } from "../src/dominios/afastamentos/esquemas";
import { entradasTrilhaAfastamento } from "../src/dominios/afastamentos/servico";

// ===========================================================================
// EIXO 8 — rastro de leitura, no módulo de AFASTAMENTOS.
//
// O payload de quem tem afastamento.saude.ver devolve o `tipo` clínico de TODO
// afastamento, e o tipo já conta a condição de saúde do colaborador (é por
// isso que a visão sem a chave esconde todos atrás de ROTULO_GENERICO). A
// trilha se amarrava à existência do CIFRADO (dados_saude_cifrados !== null),
// então um afastamento com tipo clínico mas SEM texto livre era devolvido
// revelando a condição sem deixar uma linha em audit.leitura_sensivel. A régua
// certa (mesma da CAT/ASO no SST): um registro por afastamento DEVOLVIDO com
// tipo clínico.
// ===========================================================================

// ---------------------------------------------------------------- régua clínico × administrativo

test("os tipos que revelam condição de saúde do colaborador são clínicos", () => {
  // Doença, gestação, acidente, incapacidade previdenciária: o tipo nomeia uma
  // condição do PRÓPRIO colaborador.
  assert.equal(tipoAfastamentoEhClinico("atestado"), true);
  assert.equal(tipoAfastamentoEhClinico("licenca_medica"), true);
  assert.equal(tipoAfastamentoEhClinico("maternidade"), true);
  assert.equal(tipoAfastamentoEhClinico("acidente_trabalho"), true);
  assert.equal(tipoAfastamentoEhClinico("inss"), true);
});

test("paternidade e outros são administrativos — não revelam saúde do colaborador", () => {
  // Paternidade: a condição de saúde é da parceira, não do colaborador.
  // Outros: rótulo genérico, não nomeia condição nenhuma.
  assert.equal(tipoAfastamentoEhClinico("paternidade"), false);
  assert.equal(tipoAfastamentoEhClinico("outros"), false);
});

test("todo tipo do catálogo tem classificação — nenhum fica de fora da régua", () => {
  // Se um tipo novo entrar em TIPOS_AFASTAMENTO sem decidir clínico × admin, o
  // Record exaustivo já quebra o tsc; aqui garantimos que a função responde
  // um booleano para cada um (não undefined).
  for (const tipo of TIPOS_AFASTAMENTO) {
    assert.equal(typeof tipoAfastamentoEhClinico(tipo), "boolean");
  }
});

// ---------------------------------------------------------------- trilha por dado devolvido

test("a trilha sai UMA LINHA POR AFASTAMENTO CLÍNICO devolvido — não pelos cifrados", () => {
  // Um atestado sem detalhe cifrado (id 2) ainda entra na trilha: o tipo já é
  // o dado de saúde. Um afastamento administrativo (paternidade, id 3) não.
  const trilha = entradasTrilhaAfastamento(5, [
    { id: 1, tipo: "licenca_medica" },
    { id: 2, tipo: "atestado" },
    { id: 3, tipo: "paternidade" },
    { id: 4, tipo: "outros" },
    { id: 5, tipo: "inss" },
  ]);
  assert.deepEqual(
    trilha.map((linha) => linha.registroId),
    ["1", "2", "5"]
  );
});

test("a trilha do afastamento grava a chave de saúde e o recurso certo", () => {
  const [linha] = entradasTrilhaAfastamento(42, [
    { id: 7, tipo: "acidente_trabalho" },
  ]);
  assert.deepEqual(linha, {
    usuarioId: 42,
    chavePermissao: "afastamento.saude.ver",
    recurso: "rh.afastamento.dados_saude",
    registroId: "7",
  });
});

test("só afastamentos administrativos ⇒ trilha vazia (não se abre transação à toa)", () => {
  assert.deepEqual(
    entradasTrilhaAfastamento(5, [
      { id: 1, tipo: "paternidade" },
      { id: 2, tipo: "outros" },
    ]),
    []
  );
});

test("sem afastamento nenhum a trilha fica vazia", () => {
  assert.deepEqual(entradasTrilhaAfastamento(5, []), []);
});
