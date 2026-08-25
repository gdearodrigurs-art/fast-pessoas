import { test } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import {
  bloqueioDeAvancoPesquisaSocial,
  dataCorteExpurgo,
  esquemaPesquisaSocial,
} from "../src/dominios/recrutamento/esquemas";
import type { CandidaturaParaMutacao } from "../src/dominios/recrutamento/repositorio";
import {
  baixarAnexoPesquisaSocial,
  expurgarPesquisasSociais,
  registrarPesquisaSocial,
  type DepsPesquisaSocial,
  type PermissoesRs,
} from "../src/dominios/recrutamento/servico";
import type { PayloadSessao } from "../src/dominios/identidade/esquemas";
import { ErroHttp } from "../src/lib/sessao";

// ===========================================================================
// Pesquisa social (#13c, decisão G3:a de docs/20), em duas camadas — nada
// toca banco:
//
// 1) O que a borda garante: desfecho binário obrigatório, anexo opcional pelo
//    caminho JSON base64 do GED (MIME da lista fechada, base64 bem formado).
// 2) As regras críticas do SERVIÇO, com repositório e GED trocados por dublês
//    via a costura DepsPesquisaSocial (molde DepsPosse, pendência 16.2):
//    desfecho exige candidatura NA etapa de pesquisa social; o desfecho é
//    único; REPROVADO não avança (regra pura do gate); o anexo é visível só
//    com a chave (rs.gerir) e a leitura grava trilha; e o expurgo respeita a
//    janela de 6 meses e só apaga documento de quem tem anexo.
// ===========================================================================

const SESSAO: PayloadSessao = {
  usuario_id: 77,
  papel: "dp",
  nome: "Gestora da Seleção",
};

const PODE_GERIR: PermissoesRs = {
  ver: false,
  gerir: true,
  requisicao_criar: false,
  requisicao_decidir: false,
  parecer_registrar: false,
  parecer_ver: false,
};

const PODE_SO_VER: PermissoesRs = { ...PODE_GERIR, gerir: false, ver: true };

/** Candidatura como o repositório devolveria — NA etapa de pesquisa social. */
function candidatura(
  sobrescreve: Partial<CandidaturaParaMutacao> = {}
): CandidaturaParaMutacao {
  return {
    id: 31,
    vaga_id: 7,
    vaga_titulo: "Analista de Loja",
    vaga_status: "aberta",
    faixa_min: 2000,
    faixa_max: 3000,
    solicitante_usuario_id: 5,
    candidato_id: 12,
    candidato_nome: "Fulana de Tal",
    candidato_email: "fulana@exemplo.com",
    status: "ativa",
    etapa_atual_id: 44,
    etapa_nome: "Pesquisa social",
    etapa_ordem: 4,
    etapa_tipo: "pesquisa_social",
    modelo_versao_id: 3,
    ...sobrescreve,
  };
}

const ANEXO_OK = {
  nome_arquivo: "laudo.pdf",
  mime: "application/pdf",
  conteudo_base64: Buffer.from("conteúdo do laudo").toString("base64"),
};

/**
 * Dublê de DepsPesquisaSocial: toda costura não sobrescrita ESTOURA — assim o
 * teste também prova que o serviço não alcançou o banco além do que declarou.
 */
function depsDuble(
  sobrescreve: Partial<DepsPesquisaSocial>
): DepsPesquisaSocial {
  const naoDeveriaChegar = (nome: string) => async () => {
    throw new Error(`o teste não deveria ter chamado ${nome}`);
  };
  const base = {
    buscarCandidaturaParaMutacao: naoDeveriaChegar(
      "buscarCandidaturaParaMutacao"
    ),
    buscarPesquisaSocial: naoDeveriaChegar("buscarPesquisaSocial"),
    inserirPesquisaSocial: naoDeveriaChegar("inserirPesquisaSocial"),
    guardarAnexo: naoDeveriaChegar("guardarAnexo"),
    buscarAnexoPesquisaSocial: naoDeveriaChegar("buscarAnexoPesquisaSocial"),
    lerConteudoAnexo: naoDeveriaChegar("lerConteudoAnexo"),
    listarPesquisasParaExpurgo: naoDeveriaChegar("listarPesquisasParaExpurgo"),
    expurgarPesquisa: naoDeveriaChegar("expurgarPesquisa"),
    apagarDocumentoDoExpurgo: naoDeveriaChegar("apagarDocumentoDoExpurgo"),
    registrarLeituraSensivel: naoDeveriaChegar("registrarLeituraSensivel"),
    registrarAlteracao: naoDeveriaChegar("registrarAlteracao"),
    comTransacao: naoDeveriaChegar("comTransacao"),
  } as unknown as DepsPesquisaSocial;
  return { ...base, ...sobrescreve };
}

/** comTransacao de mentira: roda o corpo com um cliente oco, sem banco. */
const transacaoDeMentira = (async (
  usuarioId: number,
  fn: (cliente: PoolClient) => Promise<unknown>
) => fn({} as unknown as PoolClient)) as DepsPesquisaSocial["comTransacao"];

function esperaErroHttp(status: number, trecho?: RegExp) {
  return (erro: unknown) => {
    assert.ok(erro instanceof ErroHttp, `esperava ErroHttp, veio ${erro}`);
    assert.equal(erro.status, status);
    if (trecho !== undefined) assert.match(erro.message, trecho);
    return true;
  };
}

// ---------------------------------------------------------------- borda (zod)

test("desfecho binário sem anexo passa na borda", () => {
  const analise = esquemaPesquisaSocial.safeParse({ resultado: "aprovado" });
  assert.equal(analise.success, true);
  assert.equal(analise.data?.anexo, undefined);
});

test("desfecho com anexo (PDF em base64) passa na borda", () => {
  const analise = esquemaPesquisaSocial.safeParse({
    resultado: "reprovado",
    anexo: ANEXO_OK,
  });
  assert.equal(analise.success, true);
  assert.equal(analise.data?.anexo?.mime, "application/pdf");
});

test("resultado fora do binário é recusado na borda", () => {
  const analise = esquemaPesquisaSocial.safeParse({ resultado: "talvez" });
  assert.equal(analise.success, false);
});

test("MIME fora da lista fechada do GED é recusado (fronteira de segurança)", () => {
  const analise = esquemaPesquisaSocial.safeParse({
    resultado: "aprovado",
    anexo: { ...ANEXO_OK, mime: "application/x-msdownload" },
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) => issue.path.includes("mime")),
    true
  );
});

test("base64 malformado é recusado antes de decodificar", () => {
  const analise = esquemaPesquisaSocial.safeParse({
    resultado: "aprovado",
    anexo: { ...ANEXO_OK, conteudo_base64: "isto não é base64!!!" },
  });
  assert.equal(analise.success, false);
});

// ---------------------------------------------------------------- gate de avanço (regra pura)

test("na etapa de pesquisa social SEM desfecho, o avanço é bloqueado pedindo o registro", () => {
  const bloqueio = bloqueioDeAvancoPesquisaSocial("pesquisa_social", null);
  assert.ok(bloqueio !== null);
  assert.match(bloqueio, /Registre o desfecho/);
});

test("REPROVADO não avança — o caminho é reprovar com motivo do catálogo", () => {
  const bloqueio = bloqueioDeAvancoPesquisaSocial(
    "pesquisa_social",
    "reprovado"
  );
  assert.ok(bloqueio !== null);
  assert.match(bloqueio, /reprovada não avança/);
});

test("APROVADO libera o avanço", () => {
  assert.equal(
    bloqueioDeAvancoPesquisaSocial("pesquisa_social", "aprovado"),
    null
  );
});

test("fora da etapa de pesquisa social o gate não se aplica", () => {
  assert.equal(bloqueioDeAvancoPesquisaSocial("triagem", null), null);
});

// ---------------------------------------------------------------- serviço: registrar o desfecho

test("candidatura fora da etapa de pesquisa social não recebe desfecho (409)", async () => {
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    buscarCandidaturaParaMutacao: async () =>
      candidatura({ etapa_tipo: "triagem", etapa_nome: "Triagem" }),
  });
  await assert.rejects(
    registrarPesquisaSocial(SESSAO, 31, { resultado: "aprovado" }, deps),
    esperaErroHttp(409, /NA etapa de pesquisa social/)
  );
});

test("candidatura inexistente é 404 — ausência, não máscara", async () => {
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    buscarCandidaturaParaMutacao: async () => null,
  });
  await assert.rejects(
    registrarPesquisaSocial(SESSAO, 31, { resultado: "aprovado" }, deps),
    esperaErroHttp(404)
  );
});

test("candidatura encerrada não recebe desfecho (409)", async () => {
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    buscarCandidaturaParaMutacao: async () =>
      candidatura({ status: "reprovada" }),
  });
  await assert.rejects(
    registrarPesquisaSocial(SESSAO, 31, { resultado: "aprovado" }, deps),
    esperaErroHttp(409, /encerrada/)
  );
});

test("o desfecho é ÚNICO por candidatura — o segundo leva 409", async () => {
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    buscarCandidaturaParaMutacao: async () => candidatura(),
    buscarPesquisaSocial: async () => ({
      id: 9,
      candidatura_id: 31,
      resultado: "aprovado" as const,
      documento_id: null,
      expurgado_em: null,
    }),
  });
  await assert.rejects(
    registrarPesquisaSocial(SESSAO, 31, { resultado: "reprovado" }, deps),
    esperaErroHttp(409, /já tem desfecho/)
  );
});

test("desfecho com anexo: o arquivo entra no GED na categoria própria 'pesquisa_social' e SENSÍVEL, com hash do servidor (A2)", async () => {
  const guardados: Parameters<DepsPesquisaSocial["guardarAnexo"]>[1][] = [];
  const inseridos: Parameters<DepsPesquisaSocial["inserirPesquisaSocial"]>[1][] =
    [];
  const auditadas: { tabela: string; acao: string }[] = [];
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    buscarCandidaturaParaMutacao: async () => candidatura(),
    buscarPesquisaSocial: async () => null,
    guardarAnexo: async (_cliente, entrada) => {
      guardados.push(entrada);
      return { id: 555, enviado_em: "2026-08-25T12:00:00.000Z" };
    },
    inserirPesquisaSocial: async (_cliente, dados) => {
      inseridos.push(dados);
      return 9;
    },
    registrarAlteracao: async (_cliente, entrada) => {
      auditadas.push({ tabela: entrada.tabela, acao: entrada.acao });
    },
  });
  await registrarPesquisaSocial(
    SESSAO,
    31,
    { resultado: "aprovado", anexo: ANEXO_OK },
    deps
  );
  // O anexo foi para o GED do jeito decidido (G3:a + categoria própria, A2):
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0].categoria, "pesquisa_social");
  assert.equal(guardados[0].sensivel, true);
  assert.equal(guardados[0].colaborador_id, null);
  assert.equal(guardados[0].exige_ciencia, false);
  assert.match(guardados[0].hash_sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    guardados[0].conteudo.toString("utf8"),
    "conteúdo do laudo"
  );
  // O desfecho aponta o documento guardado:
  assert.deepEqual(inseridos, [
    {
      candidatura_id: 31,
      resultado: "aprovado",
      documento_id: 555,
      registrado_por: 77,
    },
  ]);
  // Trilha dupla: a criação do documento E a do desfecho.
  assert.deepEqual(auditadas, [
    { tabela: "rh.documento", acao: "criacao" },
    { tabela: "rh.pesquisa_social", acao: "criacao" },
  ]);
});

test("sem anexo, o GED nem é tocado — só o desfecho é gravado", async () => {
  const inseridos: Parameters<DepsPesquisaSocial["inserirPesquisaSocial"]>[1][] =
    [];
  const auditadas: string[] = [];
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    buscarCandidaturaParaMutacao: async () => candidatura(),
    buscarPesquisaSocial: async () => null,
    inserirPesquisaSocial: async (_cliente, dados) => {
      inseridos.push(dados);
      return 9;
    },
    registrarAlteracao: async (_cliente, entrada) => {
      auditadas.push(entrada.tabela);
    },
  });
  await registrarPesquisaSocial(SESSAO, 31, { resultado: "reprovado" }, deps);
  assert.equal(inseridos[0].documento_id, null);
  // guardarAnexo não sobrescrito teria estourado; e só o desfecho auditou.
  assert.deepEqual(auditadas, ["rh.pesquisa_social"]);
});

// ---------------------------------------------------------------- serviço: anexo visível só com a chave

test("sem rs.gerir o anexo é 403 — e nada do repositório é alcançado", async () => {
  const deps = depsDuble({});
  await assert.rejects(
    baixarAnexoPesquisaSocial(SESSAO, PODE_SO_VER, 31, deps),
    esperaErroHttp(403)
  );
});

test("com rs.gerir o anexo sai COM trilha de leitura sensível gravada antes", async () => {
  const ordem: string[] = [];
  const deps = depsDuble({
    buscarAnexoPesquisaSocial: async () => ({
      documento_id: 555,
      nome_arquivo: "laudo.pdf",
      mime: "application/pdf",
    }),
    registrarLeituraSensivel: async (entrada) => {
      ordem.push(
        `trilha:${entrada.chavePermissao}:${entrada.recurso}:${entrada.registroId}`
      );
    },
    lerConteudoAnexo: async () => {
      ordem.push("conteudo");
      return Buffer.from("conteúdo do laudo");
    },
  });
  const anexo = await baixarAnexoPesquisaSocial(SESSAO, PODE_GERIR, 31, deps);
  assert.equal(anexo.nome_arquivo, "laudo.pdf");
  assert.equal(anexo.conteudo.toString("utf8"), "conteúdo do laudo");
  // A trilha registra a chave que DE FATO autorizou, antes do conteúdo sair.
  assert.deepEqual(ordem, [
    "trilha:rs.gerir:recrutamento.pesquisa_social_anexo:31",
    "conteudo",
  ]);
});

test("anexo inexistente (ou já expurgado) é 404 sem trilha", async () => {
  const deps = depsDuble({
    buscarAnexoPesquisaSocial: async () => null,
  });
  await assert.rejects(
    baixarAnexoPesquisaSocial(SESSAO, PODE_GERIR, 31, deps),
    esperaErroHttp(404)
  );
});

// ---------------------------------------------------------------- expurgo (retenção de 6 meses)

test("o corte da janela anda 6 meses para trás no calendário", () => {
  assert.equal(dataCorteExpurgo("2026-08-25"), "2026-02-25");
  assert.equal(dataCorteExpurgo("2026-01-15"), "2025-07-15");
});

test("expurgo respeita a janela: consulta com o corte de 6 meses e só expurga o que ela devolve", async () => {
  const cortes: string[] = [];
  const expurgadas: number[] = [];
  const docsApagados: number[] = [];
  const auditadas: { registroId: string; acao: string }[] = [];
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    listarPesquisasParaExpurgo: async (_cliente, corte) => {
      cortes.push(corte);
      return [
        { id: 1, candidatura_id: 31, documento_id: 555 },
        { id: 2, candidatura_id: 32, documento_id: null },
      ];
    },
    expurgarPesquisa: async (_cliente, id) => {
      expurgadas.push(id);
    },
    apagarDocumentoDoExpurgo: async (_cliente, documentoId) => {
      docsApagados.push(documentoId);
    },
    registrarAlteracao: async (_cliente, entrada) => {
      auditadas.push({ registroId: entrada.registroId, acao: entrada.acao });
      // Anonimizar de verdade: o audit do expurgo NÃO repete o desfecho.
      assert.equal(entrada.diff.Resultado, undefined);
    },
  });
  const contagem = await expurgarPesquisasSociais(SESSAO, "2026-08-25", deps);
  // A janela foi para o SQL — quem filtra é a consulta, com o corte certo.
  assert.deepEqual(cortes, ["2026-02-25"]);
  // As duas expurgadas; documento apagado SÓ de quem tinha anexo.
  assert.deepEqual(expurgadas, [1, 2]);
  assert.deepEqual(docsApagados, [555]);
  assert.deepEqual(contagem, { expurgadas: 2, anexos_apagados: 1 });
  // Trilha por linha + o ato da rodada.
  assert.deepEqual(
    auditadas.map((a) => a.registroId),
    ["1", "2", "rodada:2026-08-25"]
  );
  assert.ok(auditadas.every((a) => a.acao === "expurgo"));
});

test("rodada sem nada a expurgar ainda deixa o ato na trilha e devolve zero", async () => {
  const auditadas: string[] = [];
  const deps = depsDuble({
    comTransacao: transacaoDeMentira,
    listarPesquisasParaExpurgo: async () => [],
    registrarAlteracao: async (_cliente, entrada) => {
      auditadas.push(entrada.registroId);
    },
  });
  const contagem = await expurgarPesquisasSociais(SESSAO, "2026-08-25", deps);
  assert.deepEqual(contagem, { expurgadas: 0, anexos_apagados: 0 });
  assert.deepEqual(auditadas, ["rodada:2026-08-25"]);
});
