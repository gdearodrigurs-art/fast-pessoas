import { test } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { esquemaRegistroPosse } from "../src/dominios/posse/esquemas";
import type { PosseLinha } from "../src/dominios/posse/repositorio";
import {
  darCienciaPosse,
  registrarPosse,
  type DepsPosse,
} from "../src/dominios/posse/servico";
import type { PayloadSessao } from "../src/dominios/identidade/esquemas";
import { ErroHttpCampo } from "../src/lib/http";
import { ErroHttp } from "../src/lib/sessao";

// ===========================================================================
// Domínio POSSE de patrimônio (migration 0081), em duas camadas — nada toca
// banco:
//
// 1) O que o zod garante na borda: quantidade inteira >= 1 (espelha o CHECK),
//    data de entrega real no calendário (esquemaData, ida-e-volta), descrição
//    obrigatória, e os opcionais — nº de série e termo no GED — de fato
//    opcionais.
// 2) As regras críticas do SERVIÇO, com o repositório trocado por dublês via
//    a costura DepsPosse (pendência 16.2): não-titular leva 404 (ausência,
//    não máscara), categoria fora do catálogo ativo é recusada, e o duplo
//    clique na ciência vira 409 — no pré-check, na corrida do INSERT (23505
//    da UNIQUE de rh.ciencia traduzido) e na corrida da projeção (UPDATE
//    condicional casando 0 linhas).
//
// O CHECK de ciência-exige-termo é do banco.
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

// ---------------------------------------------------------------- serviço, com repositório dublê

const SESSAO: PayloadSessao = {
  usuario_id: 77,
  papel: "funcionario",
  nome: "Titular de Teste",
};

/** Linha de posse como o repositório devolveria — item do colaborador 10. */
function itemPosse(sobrescreve: Partial<PosseLinha> = {}): PosseLinha {
  return {
    id: 1,
    colaborador_id: 10,
    colaborador_nome: "Fulana de Tal",
    matricula: "0001",
    categoria_chave: "equipamento_ti",
    categoria_nome: "Equipamento de TI",
    descricao: "Notebook Dell i7 patrimônio 123",
    quantidade: 1,
    numero_serie: null,
    data_entrega: "2026-08-14",
    termo_documento_id: 42,
    termo_titulo: "Termo de responsabilidade",
    ciencia_registrada: false,
    devolvido_em: null,
    ...sobrescreve,
  };
}

const TERMO = {
  id: 42,
  colaborador_id: 10,
  categoria: "termo_posse",
  titulo: "Termo de responsabilidade",
  nome_arquivo: "termo.pdf",
  mime: "application/pdf",
  tamanho_bytes: 1234,
  sensivel: false,
  hash_sha256: "a".repeat(64),
};

/**
 * Dublê de DepsPosse: toda costura não sobrescrita ESTOURA — assim o teste
 * também prova que o serviço não alcançou o banco além do que declarou.
 */
function depsDuble(sobrescreve: Partial<DepsPosse>): DepsPosse {
  const naoDeveriaChegar = (nome: string) => async () => {
    throw new Error(`o teste não deveria ter chamado ${nome}`);
  };
  const base = {
    buscarColaboradorBasico: naoDeveriaChegar("buscarColaboradorBasico"),
    buscarPosseParaMutacao: naoDeveriaChegar("buscarPosseParaMutacao"),
    vinculosDoUsuario: naoDeveriaChegar("vinculosDoUsuario"),
    cienciaExistente: naoDeveriaChegar("cienciaExistente"),
    listarCategoriasDevolucao: naoDeveriaChegar("listarCategoriasDevolucao"),
    buscarMetadados: naoDeveriaChegar("buscarMetadados"),
    inserirPosse: naoDeveriaChegar("inserirPosse"),
    inserirCiencia: naoDeveriaChegar("inserirCiencia"),
    marcarCiencia: naoDeveriaChegar("marcarCiencia"),
    inserirEvento: naoDeveriaChegar("inserirEvento"),
    registrarAlteracao: naoDeveriaChegar("registrarAlteracao"),
    comTransacao: naoDeveriaChegar("comTransacao"),
  } as unknown as DepsPosse;
  return { ...base, ...sobrescreve };
}

/** comTransacao de mentira: roda o corpo com um cliente oco, sem banco. */
const transacaoDeMentira = (async (
  usuarioId: number,
  fn: (cliente: PoolClient) => Promise<unknown>
) => fn({} as unknown as PoolClient)) as DepsPosse["comTransacao"];

function esperaErroHttp(status: number, mensagem?: string) {
  return (erro: unknown) => {
    assert.ok(erro instanceof ErroHttp, `esperava ErroHttp, veio ${erro}`);
    assert.equal(erro.status, status);
    if (mensagem !== undefined) assert.equal(erro.message, mensagem);
    return true;
  };
}

test("darCienciaPosse devolve 404 a quem não é o titular (ausência, não máscara)", async () => {
  const deps = depsDuble({
    buscarPosseParaMutacao: async () => itemPosse({ colaborador_id: 10 }),
    // Os vínculos de quem pede não incluem o dono do item.
    vinculosDoUsuario: async () => [55, 56],
  });
  await assert.rejects(
    darCienciaPosse(SESSAO, 1, deps),
    esperaErroHttp(404, "Item de posse não encontrado.")
  );
});

test("o item do vínculo ANTERIOR aceita a ciência — titularidade é da pessoa (16.5)", async () => {
  const acoesAuditadas: string[] = [];
  const deps = depsDuble({
    buscarPosseParaMutacao: async () => itemPosse({ colaborador_id: 10 }),
    // 99 é o contrato corrente; 10 é o antigo, do mesmo grupo. Com
    // rh.vinculo_atual (o desenho anterior) este teste levaria 404.
    vinculosDoUsuario: async () => [99, 10],
    buscarMetadados: async () => ({ ...TERMO }),
    cienciaExistente: async () => false,
    comTransacao: transacaoDeMentira,
    inserirCiencia: async () => ({
      id: 501,
      dada_em: "2026-08-25T12:00:00.000Z",
    }),
    marcarCiencia: async () => true,
    registrarAlteracao: async (_cliente, entrada) => {
      acoesAuditadas.push(entrada.acao);
    },
  });
  const resultado = await darCienciaPosse(SESSAO, 1, deps);
  assert.equal(resultado.dada_em, "2026-08-25T12:00:00.000Z");
  // Duas linhas de auditoria: a ciência no GED e a projeção na posse.
  assert.deepEqual(acoesAuditadas, ["criacao", "ciencia_posse"]);
});

test("categoria fora do catálogo ativo é recusada no serviço, apontando o campo", async () => {
  const deps = depsDuble({
    buscarColaboradorBasico: async () => ({
      id: 10,
      nome_completo: "Fulana de Tal",
      matricula: "0001",
    }),
    // O catálogo ativo não tem a categoria pedida (inativada ou inexistente —
    // para o serviço dá no mesmo: só as ATIVAS voltam da consulta).
    listarCategoriasDevolucao: async () => [
      {
        id: 1,
        chave: "equipamento_ti",
        nome: "Equipamento de TI",
        ordem: 1,
        ativa: true,
        em_uso: 0,
      },
    ],
  });
  const dados = esquemaRegistroPosse.parse({
    ...BASE,
    categoria_chave: "cadeira_gamer",
  });
  await assert.rejects(
    registrarPosse(SESSAO, 10, dados, deps),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroHttpCampo);
      assert.equal(erro.status, 400);
      assert.equal(erro.campo, "categoria_chave");
      return true;
    }
  );
});

test("duplo clique: ciência já projetada leva 409 no pré-check", async () => {
  const deps = depsDuble({
    buscarPosseParaMutacao: async () => itemPosse({ ciencia_registrada: true }),
    vinculosDoUsuario: async () => [10],
  });
  await assert.rejects(
    darCienciaPosse(SESSAO, 1, deps),
    esperaErroHttp(409, "Ciência já registrada para este item.")
  );
});

test("corrida do duplo clique: 23505 da UNIQUE de rh.ciencia vira 409 amigável", async () => {
  const deps = depsDuble({
    buscarPosseParaMutacao: async () => itemPosse(),
    vinculosDoUsuario: async () => [10],
    buscarMetadados: async () => ({ ...TERMO }),
    cienciaExistente: async () => false,
    comTransacao: transacaoDeMentira,
    inserirCiencia: async () => {
      // O que o pg lança quando a UNIQUE (documento_id, usuario_id) da 0006
      // barra a segunda requisição — sem tradução isso virava 500 cru.
      throw Object.assign(
        new Error("duplicate key value violates unique constraint"),
        { code: "23505", constraint: "ciencia_documento_id_usuario_id_key" }
      );
    },
  });
  await assert.rejects(
    darCienciaPosse(SESSAO, 1, deps),
    esperaErroHttp(409, "Ciência já registrada para este item.")
  );
});

test("corrida na projeção: ciência prévia do GED reaproveitada duas vezes vira 409", async () => {
  const deps = depsDuble({
    buscarPosseParaMutacao: async () => itemPosse(),
    vinculosDoUsuario: async () => [10],
    buscarMetadados: async () => ({ ...TERMO }),
    // Já tinha dado ciência no GED: o caminho não passa pelo INSERT — a
    // guarda aqui é só o UPDATE condicional casando 0 linhas.
    cienciaExistente: async () => true,
    comTransacao: transacaoDeMentira,
    marcarCiencia: async () => false,
  });
  await assert.rejects(
    darCienciaPosse(SESSAO, 1, deps),
    esperaErroHttp(409, "Ciência já registrada para este item.")
  );
});
