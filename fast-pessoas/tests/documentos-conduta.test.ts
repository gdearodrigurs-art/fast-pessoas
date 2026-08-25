import { test } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import {
  CATEGORIA_PESQUISA_SOCIAL,
  ChavesDeAcervo,
  decidirVisibilidade,
  envioEntraNoCiclo,
  esquemaAbrirAto,
  esquemaEnvioBase64,
  esquemaEnvioMultipart,
  estadoDaPendencia,
  pendenciaBloqueia,
  SituacaoPendencia,
} from "../src/dominios/documentos/esquemas";
import {
  alturaEstimadaPdf,
  contarPaginasPdf,
} from "../src/dominios/documentos/paginas-pdf";
import {
  chegouAoFim,
  conteudoRenderizado,
} from "../src/app/documentos/rolagem-ciencia";
import {
  montarFiltroLista,
  type MetadadosDocumento,
  type PendenciaLinha,
} from "../src/dominios/documentos/repositorio";
import {
  baixarDocumento,
  darCiencia,
  liberarAcesso,
  type DepsAcervo,
  type DepsLiberar,
} from "../src/dominios/documentos/servico";
import type { PayloadSessao } from "../src/dominios/identidade/esquemas";
import { ErroHttpCampo } from "../src/lib/http";
import { ErroHttp } from "../src/lib/sessao";

// ===========================================================================
// CICLO DE CIÊNCIA (migration 0086) — decisões B1/B4/B6 de docs/20.
// A regra de estado e bloqueio é PURA e mora num lugar só (esquemas.ts):
// o repositório traz os fatos, estas funções dizem o que significam. É a
// matriz testada aqui — o gate da Onda 2 vai confiar nela.
// ===========================================================================

function situacao(parcial: Partial<SituacaoPendencia>): SituacaoPendencia {
  return {
    bloqueante: false,
    temCiencia: false,
    temRecusa: false,
    temAto: false,
    temLiberacao: false,
    vencida: false,
    ...parcial,
  };
}

// ---------------------------------------------------------------- B1: o bloqueante trava; política com prazo só lembra

test("documento bloqueante pendente BLOQUEIA (B1 — 1º acesso)", () => {
  const cenario = situacao({ bloqueante: true });
  assert.equal(pendenciaBloqueia(cenario), true);
  assert.equal(estadoDaPendencia(cenario), "pendente");
});

test("política não bloqueante pendente NÃO bloqueia — pendência com lembrete", () => {
  assert.equal(pendenciaBloqueia(situacao({})), false);
});

test("prazo vencido SEM ato registrado não bloqueia (B1: sem bloquear)", () => {
  const cenario = situacao({ vencida: true });
  assert.equal(pendenciaBloqueia(cenario), false);
  assert.equal(estadoDaPendencia(cenario), "vencido");
});

// ---------------------------------------------------------------- B6: recusado segue bloqueado; ato registrado trava; só liberação destrava

test("recusa no documento bloqueante NÃO destrava (B6 — recusado segue bloqueado)", () => {
  const cenario = situacao({ bloqueante: true, temRecusa: true });
  assert.equal(pendenciaBloqueia(cenario), true);
  assert.equal(estadoDaPendencia(cenario), "recusado");
});

test("prazo vencido COM ato registrado bloqueia até liberação (B6 modificado)", () => {
  const cenario = situacao({ vencida: true, temAto: true });
  assert.equal(pendenciaBloqueia(cenario), true);
});

test("recusa em política não bloqueante só trava quando o DP registra o ato", () => {
  assert.equal(pendenciaBloqueia(situacao({ temRecusa: true })), false);
  assert.equal(
    pendenciaBloqueia(situacao({ temRecusa: true, temAto: true })),
    true
  );
});

test("liberação explícita destrava o bloqueante recusado (B6 — rh.conduta.liberar)", () => {
  const cenario = situacao({
    bloqueante: true,
    temRecusa: true,
    temAto: true,
    temLiberacao: true,
  });
  assert.equal(pendenciaBloqueia(cenario), false);
  assert.equal(estadoDaPendencia(cenario), "liberado");
});

test("ciência destrava SEMPRE — a rota de regularização nunca fecha (B4)", () => {
  const cenario = situacao({
    bloqueante: true,
    temRecusa: true,
    temAto: true,
    temCiencia: true,
  });
  assert.equal(pendenciaBloqueia(cenario), false);
  assert.equal(estadoDaPendencia(cenario), "assinado");
});

// ---------------------------------------------------------------- envio: regras cruzadas do ciclo (borda, zod)

const arquivoBase64 = {
  categoria: "politica",
  titulo: "Código de Conduta",
  sensivel: false,
  nome_arquivo: "conduta.txt",
  mime: "text/plain",
  conteudo_base64: "QQ==",
};

test("bloqueante sem exige_ciencia é recusado na borda", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: false,
    bloqueante: true,
  });
  assert.equal(analise.success, false);
});

test("prazo em documento bloqueante é recusado (bloqueante trava já, sem prazo)", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: true,
    bloqueante: true,
    prazo_ciencia_dias: 15,
  });
  assert.equal(analise.success, false);
});

test("exige_ciencia em documento de colaborador é recusado (ciclo é do acervo geral)", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: true,
    colaborador_id: 7,
  });
  assert.equal(analise.success, false);
});

test("política com exige_ciencia e prazo passa na borda", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    exige_ciencia: true,
    prazo_ciencia_dias: 15,
  });
  assert.equal(analise.success, true);
});

// ---------------------------------------------------------------- A1: documento sensível não entra no ciclo

test("sensível com exige_ciencia é recusado na borda (A1)", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    sensivel: true,
    exige_ciencia: true,
  });
  assert.equal(analise.success, false);
  assert.equal(
    analise.error?.issues.some((issue) => issue.path.includes("sensivel")),
    true
  );
});

test("sensível bloqueante é recusado na borda (A1)", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    sensivel: true,
    exige_ciencia: true,
    bloqueante: true,
  });
  assert.equal(analise.success, false);
});

test("sensível FORA do ciclo continua passando (A1 só barra a combinação)", () => {
  const analise = esquemaEnvioBase64.safeParse({
    ...arquivoBase64,
    sensivel: true,
    exige_ciencia: false,
  });
  assert.equal(analise.success, true);
});

test("multipart: sensível no ciclo também é recusado (A1 vale nos 2 caminhos)", () => {
  const analise = esquemaEnvioMultipart.safeParse({
    categoria: "politica",
    titulo: "Código de Conduta",
    sensivel: "true",
    exige_ciencia: "true",
    bloqueante: "false",
  });
  assert.equal(analise.success, false);
});

// ---------------------------------------------------------------- A4: o que conta como "publicar no ciclo"

test("exigir ciência, bloquear ou substituir versão entram no ciclo (A4)", () => {
  const base = {
    exige_ciencia: false,
    bloqueante: false,
    substitui_documento_id: null,
  };
  assert.equal(envioEntraNoCiclo(base), false);
  assert.equal(envioEntraNoCiclo({ ...base, exige_ciencia: true }), true);
  assert.equal(envioEntraNoCiclo({ ...base, bloqueante: true }), true);
  assert.equal(
    envioEntraNoCiclo({ ...base, substitui_documento_id: 7 }),
    true
  );
});

test("multipart: campos do ciclo chegam como texto e valem as mesmas regras", () => {
  const recusado = esquemaEnvioMultipart.safeParse({
    categoria: "politica",
    titulo: "Código de Conduta",
    sensivel: "false",
    exige_ciencia: "false",
    bloqueante: "true",
  });
  assert.equal(recusado.success, false);

  const aceito = esquemaEnvioMultipart.safeParse({
    categoria: "politica",
    titulo: "Código de Conduta",
    sensivel: "false",
    exige_ciencia: "true",
    bloqueante: "true",
  });
  assert.equal(aceito.success, true);
  assert.equal(aceito.data?.bloqueante, true);
});

// ---------------------------------------------------------------- ato com testemunhas (B2): 2, distintas, nunca a própria pessoa

test("ato exige exatamente 2 testemunhas", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "recusa",
    descricao: "Recusa presencial diante do DP.",
    testemunhas: [21],
  });
  assert.equal(analise.success, false);
});

test("testemunhas repetidas são recusadas", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "recusa",
    descricao: "Recusa presencial diante do DP.",
    testemunhas: [21, 21],
  });
  assert.equal(analise.success, false);
});

test("a pessoa do ato não pode testemunhar o próprio ato", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "prazo_vencido",
    descricao: "Prazo vencido sem manifestação.",
    testemunhas: [10, 21],
  });
  assert.equal(analise.success, false);
});

test("ato com 2 testemunhas distintas passa", () => {
  const analise = esquemaAbrirAto.safeParse({
    usuario_id: 10,
    origem: "recusa",
    descricao: "Recusa presencial diante do DP.",
    testemunhas: [21, 22],
  });
  assert.equal(analise.success, true);
});

// ---------------------------------------------------------------- contagem de páginas do PDF (B5 — rolagem rastreável)

function bytesDe(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

test("conta os objetos /Type /Page sem confundir com /Pages", () => {
  const pdf =
    "%PDF-1.4\n1 0 obj << /Type /Pages /Count 3 >>\n" +
    "2 0 obj << /Type /Page >>\n3 0 obj << /Type /Page >>\n" +
    "4 0 obj << /Type /Page >>\n%%EOF";
  assert.equal(contarPaginasPdf(bytesDe(pdf)), 3);
});

test("PDF comprimido (sem /Type /Page em claro) cai no /Count da raiz", () => {
  const pdf = "%PDF-1.7\n1 0 obj << /Type /Pages /Count 12 >>\n%%EOF";
  assert.equal(contarPaginasPdf(bytesDe(pdf)), 12);
});

test("bytes sem marcador nenhum devolvem null (o visualizador usa o chão)", () => {
  assert.equal(contarPaginasPdf(bytesDe("nada de pdf aqui")), null);
});

test("altura estimada cobre o documento inteiro na largura dada", () => {
  assert.equal(alturaEstimadaPdf(4, 800), Math.ceil(4 * 800 * 1.5));
  // sem contagem: chão de 10 páginas — nunca zero
  assert.equal(alturaEstimadaPdf(null, 800), Math.ceil(10 * 800 * 1.5));
});

// ---------------------------------------------------------------- A2: o rastreio só mede conteúdo RENDERIZADO
// O defeito: "carregando" e "erro" não têm overflow, e a medição neles marcava
// "leu até o fim" antes de existir documento na tela — de graça, para sempre.

test("carregando, erro e não-exibível ficam FORA do rastreio de rolagem (A2)", () => {
  assert.equal(conteudoRenderizado("carregando"), false);
  assert.equal(conteudoRenderizado("erro"), false);
  assert.equal(conteudoRenderizado("nao_exibivel"), false);
  assert.equal(conteudoRenderizado("texto"), true);
  assert.equal(conteudoRenderizado("pdf"), true);
  assert.equal(conteudoRenderizado("imagem"), true);
});

test("conteúdo longo sem rolar até o rodapé NÃO conta como lido (A2)", () => {
  assert.equal(
    chegouAoFim({ scrollTop: 0, clientHeight: 600, scrollHeight: 5000 }),
    false
  );
});

test("rodapé dentro da janela (com a folga de DPI) conta como lido", () => {
  assert.equal(
    chegouAoFim({ scrollTop: 4400, clientHeight: 600, scrollHeight: 5000 }),
    true
  );
  // a folga perdoa 32px de arredondamento, não uma página
  assert.equal(
    chegouAoFim({ scrollTop: 4370, clientHeight: 600, scrollHeight: 5000 }),
    true
  );
  assert.equal(
    chegouAoFim({ scrollTop: 4300, clientHeight: 600, scrollHeight: 5000 }),
    false
  );
});

test("conteúdo que coube inteiro (curto de verdade) conta como lido", () => {
  assert.equal(
    chegouAoFim({ scrollTop: 0, clientHeight: 600, scrollHeight: 400 }),
    true
  );
  // contêiner sem overflow: scrollHeight cravado no clientHeight
  assert.equal(
    chegouAoFim({ scrollTop: 0, clientHeight: 600, scrollHeight: 600 }),
    true
  );
});

// ---------------------------------------------------------------- A5: liberarAcesso — segundo par de olhos, alvo ativo
// Serviço com as costuras trocadas por dublês (molde DepsPosse/pendência 16.2):
// nada toca banco, e toda costura não sobrescrita ESTOURA.

const SESSAO_LIBERADOR: PayloadSessao = {
  usuario_id: 90,
  papel: "diretoria",
  nome: "Diretora de Teste",
};

const DOC_BLOQUEANTE: MetadadosDocumento = {
  id: 5,
  colaborador_id: null,
  categoria: "politica",
  titulo: "Código de Conduta",
  nome_arquivo: "conduta.pdf",
  mime: "application/pdf",
  tamanho_bytes: 1234,
  sensivel: false,
  hash_sha256: "a".repeat(64),
  exige_ciencia: true,
  bloqueante: true,
  prazo_ciencia_dias: null,
  substituido_por_id: null,
};

function pendenciaBloqueanteDoDoc(): PendenciaLinha {
  return {
    documento_id: 5,
    titulo: "Código de Conduta",
    categoria: "politica",
    bloqueante: true,
    prazo_ciencia_dias: null,
    enviado_em: "2026-08-01T12:00:00.000Z",
    data_limite: null,
    vencida: false,
    recusada_em: null,
    ato_id: null,
    liberado_em: null,
  };
}

function depsLiberarDuble(sobrescreve: Partial<DepsLiberar>): DepsLiberar {
  const naoDeveriaChegar = (nome: string) => async () => {
    throw new Error(`o teste não deveria ter chamado ${nome}`);
  };
  const base = {
    buscarMetadados: naoDeveriaChegar("buscarMetadados"),
    buscarUsuarioBasico: naoDeveriaChegar("buscarUsuarioBasico"),
    buscarLiberacao: naoDeveriaChegar("buscarLiberacao"),
    pendenciasDoUsuario: naoDeveriaChegar("pendenciasDoUsuario"),
    buscarAtoDoUsuario: naoDeveriaChegar("buscarAtoDoUsuario"),
    inserirLiberacao: naoDeveriaChegar("inserirLiberacao"),
    registrarAlteracao: naoDeveriaChegar("registrarAlteracao"),
    notificar: naoDeveriaChegar("notificar"),
    comTransacao: naoDeveriaChegar("comTransacao"),
  } as unknown as DepsLiberar;
  return { ...base, ...sobrescreve };
}

const transacaoLiberarDeMentira = (async (
  usuarioId: number,
  fn: (cliente: PoolClient) => Promise<unknown>
) => fn({} as unknown as PoolClient)) as DepsLiberar["comTransacao"];

test("AUTO-liberação é 403 — quem tem a chave não destrava a si mesmo (A5b)", async () => {
  // Nenhuma costura sobrescrita: a recusa vem ANTES de qualquer consulta.
  await assert.rejects(
    liberarAcesso(SESSAO_LIBERADOR, 5, 90, "justificativa qualquer", depsLiberarDuble({})),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroHttp);
      assert.equal(erro.status, 403);
      assert.match(erro.message, /segundo par de olhos/);
      return true;
    }
  );
});

test("liberação para usuário DESATIVADO é recusada apontando o campo (A5a)", async () => {
  const deps = depsLiberarDuble({
    buscarMetadados: async () => ({ ...DOC_BLOQUEANTE }),
    buscarUsuarioBasico: async () => ({
      id: 33,
      nome: "Conta Desligada",
      ativo: false,
    }),
  });
  await assert.rejects(
    liberarAcesso(SESSAO_LIBERADOR, 5, 33, "tentativa em conta desligada", deps),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroHttpCampo);
      assert.equal(erro.status, 400);
      assert.equal(erro.campo, "usuario_id");
      return true;
    }
  );
});

test("liberação legítima (outra pessoa, ativa, bloqueada) continua passando", async () => {
  const notificados: number[] = [];
  const deps = depsLiberarDuble({
    buscarMetadados: async () => ({ ...DOC_BLOQUEANTE }),
    buscarUsuarioBasico: async () => ({
      id: 33,
      nome: "Pessoa Bloqueada",
      ativo: true,
    }),
    buscarLiberacao: async () => null,
    pendenciasDoUsuario: async () => [pendenciaBloqueanteDoDoc()],
    buscarAtoDoUsuario: async () => null,
    comTransacao: transacaoLiberarDeMentira,
    inserirLiberacao: async () => ({
      id: 701,
      liberado_em: "2026-08-25T15:00:00.000Z",
    }),
    registrarAlteracao: async () => {},
    notificar: async (_cliente, aviso) => {
      notificados.push(aviso.usuarioId);
      return 1;
    },
  });
  const resultado = await liberarAcesso(
    SESSAO_LIBERADOR,
    5,
    33,
    "Regularizado presencialmente com o DP.",
    deps
  );
  assert.equal(resultado.liberado_em, "2026-08-25T15:00:00.000Z");
  assert.deepEqual(notificados, [33]);
});

// ---------------------------------------------------------------- A2: anexo da pesquisa social — categoria própria e OCULTA
// A regra de visibilidade é pura (decidirVisibilidade); o filtro da listagem
// é provável sem banco (montarFiltroLista); e o serviço de download passa
// pelas costuras DepsAcervo — a porta lateral do GED fecha nas três camadas.

function chaves(parcial: Partial<ChavesDeAcervo>): ChavesDeAcervo {
  return { verTodos: false, sensivelVer: false, rsGerir: false, ...parcial };
}

const DOC_PESQUISA_SOCIAL = {
  colaborador_id: null,
  sensivel: true,
  categoria: CATEGORIA_PESQUISA_SOCIAL,
};

test("diretoria (ver.todos + sensivel.ver, SEM rs.gerir) não vê o anexo da pesquisa social (A2)", () => {
  const decisao = decidirVisibilidade(
    DOC_PESQUISA_SOCIAL,
    chaves({ verTodos: true, sensivelVer: true }),
    []
  );
  assert.equal(decisao.visivel, false);
});

test("rs.gerir vê o anexo — e a trilha leva a chave que DE FATO autorizou (A2)", () => {
  const decisao = decidirVisibilidade(
    DOC_PESQUISA_SOCIAL,
    chaves({ rsGerir: true }),
    []
  );
  assert.deepEqual(decisao, { visivel: true, chaveTrilha: "rs.gerir" });
});

test("sensível COMUM continua saindo por documento.sensivel.ver, com trilha (A2 não mexe no resto)", () => {
  const docSensivel = {
    colaborador_id: null,
    sensivel: true,
    categoria: "contrato",
  };
  assert.equal(
    decidirVisibilidade(docSensivel, chaves({}), []).visivel,
    false
  );
  assert.deepEqual(decidirVisibilidade(docSensivel, chaves({ sensivelVer: true }), []), {
    visivel: true,
    chaveTrilha: "documento.sensivel.ver",
  });
});

test("documento de colaborador segue o escopo por vínculo (A2 não mexe no resto)", () => {
  const docPessoal = { colaborador_id: 7, sensivel: false, categoria: "outro" };
  assert.equal(decidirVisibilidade(docPessoal, chaves({}), [3, 4]).visivel, false);
  assert.deepEqual(decidirVisibilidade(docPessoal, chaves({}), [7]), {
    visivel: true,
    chaveTrilha: null,
  });
  assert.equal(
    decidirVisibilidade(docPessoal, chaves({ verTodos: true }), []).visivel,
    true
  );
});

test("a listagem do acervo EXCLUI a categoria pesquisa_social até no escopo mais largo (A2)", () => {
  const maisLargo = montarFiltroLista({
    usuarioId: 1,
    verTodos: true,
    vinculosDoUsuario: [],
    incluirSensiveis: true,
  });
  assert.match(maisLargo.clausulaWhere, /d\.categoria <> \$2/);
  assert.equal(maisLargo.parametros[1], CATEGORIA_PESQUISA_SOCIAL);

  const restrito = montarFiltroLista({
    usuarioId: 1,
    verTodos: false,
    vinculosDoUsuario: [7],
    incluirSensiveis: false,
  });
  assert.match(restrito.clausulaWhere, /d\.categoria <> \$2/);
  // o vínculo veio DEPOIS da categoria — o índice dos parâmetros não colide
  assert.match(restrito.clausulaWhere, /ANY\(\$3::bigint\[\]\)/);
});

// ---------------------------------------------------------------- A2/A4/A5: darCiencia e baixarDocumento pelas costuras DepsAcervo

const SESSAO_COMUM: PayloadSessao = {
  usuario_id: 41,
  papel: "funcionario",
  nome: "Pessoa do Quadro",
};

const METADADOS_PESQUISA: MetadadosDocumento = {
  id: 91,
  colaborador_id: null,
  categoria: CATEGORIA_PESQUISA_SOCIAL,
  titulo: "Pesquisa social — Fulana de Tal",
  nome_arquivo: "laudo.pdf",
  mime: "application/pdf",
  tamanho_bytes: 1234,
  sensivel: true,
  hash_sha256: "b".repeat(64),
  exige_ciencia: false,
  bloqueante: false,
  prazo_ciencia_dias: null,
  substituido_por_id: null,
};

function depsAcervoDuble(sobrescreve: Partial<DepsAcervo>): DepsAcervo {
  const naoDeveriaChegar = (nome: string) => async () => {
    throw new Error(`o teste não deveria ter chamado ${nome}`);
  };
  const base = {
    buscarMetadados: naoDeveriaChegar("buscarMetadados"),
    temPermissao: naoDeveriaChegar("temPermissao"),
    vinculosDoUsuario: naoDeveriaChegar("vinculosDoUsuario"),
    lerConteudo: naoDeveriaChegar("lerConteudo"),
    inserirCiencia: naoDeveriaChegar("inserirCiencia"),
    registrarLeituraSensivel: naoDeveriaChegar("registrarLeituraSensivel"),
    registrarAlteracao: naoDeveriaChegar("registrarAlteracao"),
    comTransacao: naoDeveriaChegar("comTransacao"),
  } as unknown as DepsAcervo;
  return { ...base, ...sobrescreve };
}

const transacaoAcervoDeMentira = (async (
  usuarioId: number,
  fn: (cliente: PoolClient) => Promise<unknown>
) => fn({} as unknown as PoolClient)) as DepsAcervo["comTransacao"];

/** temPermissao de mentira: responde pelo mapa; chave fora do mapa = false. */
function permissoesDeMentira(
  concedidas: Record<string, boolean>
): DepsAcervo["temPermissao"] {
  return async (_usuarioId, chave) => concedidas[chave] === true;
}

test("download genérico: diretoria (sensivel.ver, sem rs.gerir) leva 404 e o conteúdo nem é lido (A2)", async () => {
  const deps = depsAcervoDuble({
    buscarMetadados: async () => ({ ...METADADOS_PESQUISA }),
    temPermissao: permissoesDeMentira({
      "documento.ver.todos": true,
      "documento.sensivel.ver": true,
    }),
  });
  await assert.rejects(
    baixarDocumento(SESSAO_COMUM, 91, deps),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroHttp);
      assert.equal(erro.status, 404);
      return true;
    }
  );
});

test("download genérico: rs.gerir baixa o anexo COM trilha da própria chave, antes do conteúdo (A2)", async () => {
  const ordem: string[] = [];
  const deps = depsAcervoDuble({
    buscarMetadados: async () => ({ ...METADADOS_PESQUISA }),
    temPermissao: permissoesDeMentira({ "rs.gerir": true }),
    comTransacao: transacaoAcervoDeMentira,
    registrarLeituraSensivel: async (_cliente, entrada) => {
      ordem.push(`trilha:${entrada.chavePermissao}:${entrada.registroId}`);
    },
    lerConteudo: async () => {
      ordem.push("conteudo");
      return Buffer.from("laudo");
    },
  });
  const { conteudo } = await baixarDocumento(SESSAO_COMUM, 91, deps);
  assert.equal(conteudo.toString("utf8"), "laudo");
  assert.deepEqual(ordem, ["trilha:rs.gerir:91", "conteudo"]);
});

test("anexo da pesquisa social NÃO colhe ciência — 409 mesmo para rs.gerir (A4)", async () => {
  const deps = depsAcervoDuble({
    buscarMetadados: async () => ({ ...METADADOS_PESQUISA }),
    temPermissao: permissoesDeMentira({ "rs.gerir": true }),
  });
  await assert.rejects(
    darCiencia(SESSAO_COMUM, 91, deps),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroHttp);
      assert.equal(erro.status, 409);
      assert.match(erro.message, /não colhe ciência/);
      return true;
    }
  );
});

test("ciência em documento do CICLO dispensa documento.ver — a pendência é do próprio usuário (A5)", async () => {
  const inseridas: number[] = [];
  const deps = depsAcervoDuble({
    buscarMetadados: async () => ({
      ...DOC_BLOQUEANTE,
      hash_sha256: "c".repeat(64),
    }),
    // NENHUMA chave concedida: perfil sem documento.ver regulariza mesmo assim.
    temPermissao: permissoesDeMentira({}),
    comTransacao: transacaoAcervoDeMentira,
    inserirCiencia: async (_cliente, entrada) => {
      inseridas.push(entrada.documentoId);
      return { id: 800, dada_em: "2026-08-25T16:00:00.000Z" };
    },
    registrarAlteracao: async () => {},
  });
  const ciencia = await darCiencia(SESSAO_COMUM, 5, deps);
  assert.equal(ciencia.dada_em, "2026-08-25T16:00:00.000Z");
  assert.equal(ciencia.hash_no_momento, "c".repeat(64));
  assert.deepEqual(inseridas, [5]);
});

test("ciência em documento FORA do ciclo continua exigindo documento.ver (A5 não abre o resto)", async () => {
  const foraDoCiclo: MetadadosDocumento = {
    ...DOC_BLOQUEANTE,
    exige_ciencia: false,
    bloqueante: false,
    categoria: "comunicado",
  };
  const semChave = depsAcervoDuble({
    buscarMetadados: async () => ({ ...foraDoCiclo }),
    temPermissao: permissoesDeMentira({}),
  });
  await assert.rejects(
    darCiencia(SESSAO_COMUM, 5, semChave),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroHttp);
      assert.equal(erro.status, 403);
      return true;
    }
  );

  const comChave = depsAcervoDuble({
    buscarMetadados: async () => ({ ...foraDoCiclo }),
    temPermissao: permissoesDeMentira({ "documento.ver": true }),
    comTransacao: transacaoAcervoDeMentira,
    inserirCiencia: async () => ({
      id: 801,
      dada_em: "2026-08-25T16:30:00.000Z",
    }),
    registrarAlteracao: async () => {},
  });
  const ciencia = await darCiencia(SESSAO_COMUM, 5, comChave);
  assert.equal(ciencia.dada_em, "2026-08-25T16:30:00.000Z");
});
