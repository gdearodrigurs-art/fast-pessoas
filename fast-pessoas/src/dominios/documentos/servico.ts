import { createHash } from "node:crypto";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { ArmazenamentoDocumentos, armazenamentoBytea } from "./armazenamento";
import {
  CategoriaDocumento,
  formatarTamanho,
  MetadadosEnvio,
  ROTULOS_CATEGORIA,
  TAMANHO_MAXIMO_BYTES,
} from "./esquemas";
import {
  buscarColaborador,
  buscarMetadados,
  DocumentoLista,
  inserirCiencia,
  listar,
  MetadadosDocumento,
  registrarLeituraSensivel,
  vinculosDoUsuario,
} from "./repositorio";

const TABELA_DOCUMENTO = "rh.documento";
const TABELA_CIENCIA = "rh.ciencia";
// A chave de ENVIO (`documento.enviar`) é conferida na porta da rota
// (POST /api/documentos) e não aqui: este serviço só lê e registra ciência.
// Escopo de leitura tem chave PRÓPRIA (migration 0024): quem envia arquivo não
// herda, por isso, o direito de ler o documento de todo o quadro — era o furo
// que deixava recrutador e T&D vendo contrato de qualquer pessoa.
const CHAVE_VER_TODOS = "documento.ver.todos";
const CHAVE_SENSIVEL_VER = "documento.sensivel.ver";
const MIME_PADRAO = "application/octet-stream";

// Ponto único de troca por object storage — o serviço só conhece a interface.
const armazenamento: ArmazenamentoDocumentos = armazenamentoBytea;

export interface ArquivoEnvio {
  nome: string;
  mime: string;
  conteudo: Buffer;
}

async function temPermissao(
  usuarioId: number,
  chave: string
): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, chave]
  );
  return linhas[0]?.autorizado === true;
}

/**
 * Visibilidade de um documento específico. Escopo "todos" segue a chave
 * documento.ver.todos (RH/DP/diretoria) — checagem por chave, nunca por papel.
 * Fora do escopo ou sensível sem documento.sensivel.ver: 404 — ausência,
 * não máscara; quem não pode ver nem sabe que o documento existe.
 */
async function exigirVisibilidade(
  sessao: PayloadSessao,
  metadados: MetadadosDocumento
): Promise<void> {
  const verTodos = await temPermissao(sessao.usuario_id, CHAVE_VER_TODOS);
  if (!verTodos && metadados.colaborador_id !== null) {
    // Pela PESSOA, não pelo contrato corrente: o documento do vínculo anterior
    // no mesmo grupo continua sendo de quem está pedindo.
    const meusVinculos = await vinculosDoUsuario(sessao.usuario_id);
    if (!meusVinculos.includes(metadados.colaborador_id)) {
      throw new ErroHttp(404, "Documento não encontrado.");
    }
  }
  if (
    metadados.sensivel &&
    !(await temPermissao(sessao.usuario_id, CHAVE_SENSIVEL_VER))
  ) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
}

async function gravarLeituraSensivel(
  usuarioId: number,
  registroIds: string[]
): Promise<void> {
  if (registroIds.length === 0) return;
  await comTransacao(usuarioId, async (cliente) => {
    for (const registroId of registroIds) {
      await registrarLeituraSensivel(cliente, {
        usuarioId,
        chavePermissao: CHAVE_SENSIVEL_VER,
        recurso: TABELA_DOCUMENTO,
        registroId,
      });
    }
  });
}

export async function listarDocumentos(
  sessao: PayloadSessao,
  incluirSensiveis: boolean
): Promise<DocumentoLista[]> {
  if (
    incluirSensiveis &&
    !(await temPermissao(sessao.usuario_id, CHAVE_SENSIVEL_VER))
  ) {
    throw new ErroHttp(403, "Sem permissão para ver documentos sensíveis.");
  }
  const verTodos = await temPermissao(sessao.usuario_id, CHAVE_VER_TODOS);
  const vinculos = verTodos ? [] : await vinculosDoUsuario(sessao.usuario_id);
  const documentos = await listar({
    usuarioId: sessao.usuario_id,
    verTodos,
    vinculosDoUsuario: vinculos,
    incluirSensiveis,
  });
  if (incluirSensiveis) {
    await gravarLeituraSensivel(
      sessao.usuario_id,
      documentos
        .filter((documento) => documento.sensivel)
        .map((documento) => String(documento.id))
    );
  }
  return documentos;
}

export async function enviarDocumento(
  sessao: PayloadSessao,
  metadados: MetadadosEnvio,
  arquivo: ArquivoEnvio
): Promise<DocumentoLista> {
  if (arquivo.conteudo.length === 0) {
    throw new ErroHttpCampo(400, "O arquivo está vazio.", "arquivo");
  }
  if (arquivo.conteudo.length > TAMANHO_MAXIMO_BYTES) {
    throw new ErroHttpCampo(
      413,
      "Arquivo excede o limite de 10 MB.",
      "arquivo"
    );
  }
  const nomeArquivo = arquivo.nome.trim().slice(0, 255) || "documento";
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(arquivo.mime)
    ? arquivo.mime.slice(0, 100)
    : MIME_PADRAO;

  let colaboradorNome: string | null = null;
  if (metadados.colaborador_id !== null) {
    const colaborador = await buscarColaborador(metadados.colaborador_id);
    if (!colaborador) {
      throw new ErroHttpCampo(400, "Colaborador não encontrado.", "colaborador_id");
    }
    colaboradorNome = colaborador.nome_completo;
  }

  // Hash calculado no servidor — o cliente nunca informa o hash.
  const hashSha256 = createHash("sha256")
    .update(arquivo.conteudo)
    .digest("hex");

  const guardado = await comTransacao(sessao.usuario_id, async (cliente) => {
    const documento = await armazenamento.guardar(cliente, {
      colaborador_id: metadados.colaborador_id,
      categoria: metadados.categoria,
      titulo: metadados.titulo,
      nome_arquivo: nomeArquivo,
      mime,
      tamanho_bytes: arquivo.conteudo.length,
      conteudo: arquivo.conteudo,
      sensivel: metadados.sensivel,
      hash_sha256: hashSha256,
      enviado_por_usuario: sessao.usuario_id,
    });
    const diff: Diff = {
      "Título": { de: null, para: metadados.titulo },
      Categoria: {
        de: null,
        para: ROTULOS_CATEGORIA[metadados.categoria as CategoriaDocumento],
      },
      Arquivo: { de: null, para: nomeArquivo },
      Tamanho: { de: null, para: formatarTamanho(arquivo.conteudo.length) },
      Colaborador: { de: null, para: colaboradorNome ?? "Geral (todos)" },
      "Sensível": { de: null, para: metadados.sensivel ? "Sim" : "Não" },
      "SHA-256": { de: null, para: hashSha256 },
    };
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_DOCUMENTO,
      registroId: String(documento.id),
      diff,
    });
    return documento;
  });

  return {
    id: guardado.id,
    colaborador_id: metadados.colaborador_id,
    colaborador_nome: colaboradorNome,
    categoria: metadados.categoria,
    titulo: metadados.titulo,
    nome_arquivo: nomeArquivo,
    mime,
    tamanho_bytes: arquivo.conteudo.length,
    sensivel: metadados.sensivel,
    enviado_por: sessao.nome,
    enviado_em: guardado.enviado_em,
    minha_ciencia_em: null,
  };
}

export async function baixarDocumento(
  sessao: PayloadSessao,
  id: number
): Promise<{ metadados: MetadadosDocumento; conteudo: Buffer }> {
  const metadados = await buscarMetadados(id);
  if (!metadados) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  await exigirVisibilidade(sessao, metadados);
  if (metadados.sensivel) {
    await gravarLeituraSensivel(sessao.usuario_id, [String(id)]);
  }
  const conteudo = await armazenamento.lerConteudo(id);
  if (!conteudo) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  return { metadados, conteudo };
}

export async function darCiencia(
  sessao: PayloadSessao,
  documentoId: number
): Promise<{ dada_em: string; hash_no_momento: string }> {
  const metadados = await buscarMetadados(documentoId);
  if (!metadados) {
    throw new ErroHttp(404, "Documento não encontrado.");
  }
  await exigirVisibilidade(sessao, metadados);
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const ciencia = await inserirCiencia(cliente, {
        documentoId,
        usuarioId: sessao.usuario_id,
        hashNoMomento: metadados.hash_sha256,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_CIENCIA,
        registroId: String(ciencia.id),
        diff: {
          Documento: {
            de: null,
            para: `${metadados.titulo} (#${metadados.id})`,
          },
          "Hash no momento": { de: null, para: metadados.hash_sha256 },
        },
      });
      return {
        dada_em: ciencia.dada_em,
        hash_no_momento: metadados.hash_sha256,
      };
    });
  } catch (erro) {
    if (violacaoUnica(erro)) {
      throw new ErroHttp(409, "Ciência já registrada para este documento.");
    }
    throw erro;
  }
}
