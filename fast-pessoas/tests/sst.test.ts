import { test } from "node:test";
import assert from "node:assert/strict";

import {
  entradasTrilhaCat,
  listarCatsVisao,
} from "../src/dominios/sst/servico";

// ===========================================================================
// EIXO 8 — rastro de leitura, no módulo de SST.
//
// A CAT é o pior payload de saúde do sistema: GET /api/sst/cats devolve, da
// empresa INTEIRA e NOMINADO, tipo de acidente, data e a `descricao` livre de
// até 4.000 caracteres — o campo onde o médico do trabalho escreve o quadro
// clínico. Na bancada fast_pessoas_k_sst as três CATs semeadas voltaram com
// 311, 596 e 305 caracteres de descrição e `audit.leitura_sensivel` ficou em
// 0 → 0: dado de saúde de terceiro lido sem uma linha de auditoria.
//
// A causa era estrutural, não um esquecimento: `listarCatsVisao()` não
// recebia sessão nenhuma — não havia usuário para gravar na trilha.
// ===========================================================================

test("listarCatsVisao recebe a sessão — sem ela não há quem gravar na trilha", () => {
  // Aridade 0 é o defeito: função que não sabe quem está lendo é
  // ESTRUTURALMENTE incapaz de deixar rastro (0 → 0 em audit.leitura_sensivel).
  assert.equal(
    listarCatsVisao.length,
    1,
    "listarCatsVisao precisa receber PayloadSessao"
  );
});

test("a trilha da CAT sai UMA LINHA POR CAT devolvida", () => {
  // Uma CAT devolvida = uma leitura de dado de saúde de terceiro. Não há
  // agregação: quem abriu o painel leu as três, e as três têm de aparecer.
  const trilha = entradasTrilhaCat(5, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(trilha.length, 3);
  assert.deepEqual(
    trilha.map((linha) => linha.registroId),
    ["1", "2", "3"]
  );
});

test("a trilha da CAT grava a chave que de fato autorizou e a tabela certa", () => {
  // sst.ver é a chave da porta de GET /api/sst/cats — e a única que existe
  // sobre a CAT. Gravar sst.saude.ver aqui seria a trilha mentir sobre o
  // que autorizou a leitura, que é o defeito que o eixo 8 nomeia.
  const [linha] = entradasTrilhaCat(42, [{ id: 7 }]);
  assert.deepEqual(linha, {
    usuarioId: 42,
    chavePermissao: "sst.ver",
    recurso: "rh.cat",
    registroId: "7",
  });
});

test("sem CAT nenhuma a trilha fica vazia — não se abre transação à toa", () => {
  assert.deepEqual(entradasTrilhaCat(5, []), []);
});
