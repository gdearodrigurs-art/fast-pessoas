import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";

// Metadados e ciência. O conteúdo binário fica no repositório isolado de
// armazenamento (./armazenamento.ts) — nunca sai daqui nas listagens.

export interface DocumentoLista {
  id: number;
  colaborador_id: number | null;
  colaborador_nome: string | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  enviado_por: string;
  /** ISO 8601 em UTC. */
  enviado_em: string;
  /** Ciência do usuário da sessão, ISO 8601 em UTC — null quando pendente. */
  minha_ciencia_em: string | null;
}

export interface MetadadosDocumento {
  id: number;
  colaborador_id: number | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  hash_sha256: string;
}

export interface EscopoLista {
  usuarioId: number;
  /** Quem envia documentos (RH/DP) enxerga o acervo inteiro. */
  verTodos: boolean;
  colaboradorIdDoUsuario: number | null;
  incluirSensiveis: boolean;
}

interface LinhaLista extends Record<string, unknown> {
  id: string;
  colaborador_id: string | null;
  colaborador_nome: string | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  enviado_por: string;
  enviado_em: Date;
  minha_ciencia_em: Date | null;
}

interface LinhaMetadados extends Record<string, unknown> {
  id: string;
  colaborador_id: string | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  hash_sha256: string;
}

export async function listar(escopo: EscopoLista): Promise<DocumentoLista[]> {
  const parametros: unknown[] = [escopo.usuarioId];
  const condicoes: string[] = [];
  if (!escopo.verTodos) {
    if (escopo.colaboradorIdDoUsuario === null) {
      condicoes.push("d.colaborador_id IS NULL");
    } else {
      parametros.push(escopo.colaboradorIdDoUsuario);
      condicoes.push(
        `(d.colaborador_id IS NULL OR d.colaborador_id = $${parametros.length})`
      );
    }
  }
  if (!escopo.incluirSensiveis) {
    condicoes.push("d.sensivel = FALSE");
  }
  const clausulaWhere =
    condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = await consultar<LinhaLista>(
    `SELECT d.id, d.colaborador_id, col.nome_completo AS colaborador_nome,
            d.categoria, d.titulo, d.nome_arquivo, d.mime, d.tamanho_bytes,
            d.sensivel, u.nome AS enviado_por, d.enviado_em,
            c.dada_em AS minha_ciencia_em
       FROM rh.documento d
       JOIN sistema.usuario u ON u.id = d.enviado_por_usuario
       LEFT JOIN rh.colaborador col ON col.id = d.colaborador_id
       LEFT JOIN rh.ciencia c
         ON c.documento_id = d.id AND c.usuario_id = $1
       ${clausulaWhere}
      ORDER BY d.enviado_em DESC, d.id DESC`,
    parametros
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id:
      linha.colaborador_id === null ? null : Number(linha.colaborador_id),
    enviado_em: linha.enviado_em.toISOString(),
    minha_ciencia_em: linha.minha_ciencia_em
      ? linha.minha_ciencia_em.toISOString()
      : null,
  }));
}

export async function buscarMetadados(
  id: number
): Promise<MetadadosDocumento | null> {
  const linhas = await consultar<LinhaMetadados>(
    `SELECT id, colaborador_id, categoria, titulo, nome_arquivo, mime,
            tamanho_bytes, sensivel, hash_sha256
       FROM rh.documento
      WHERE id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id:
      linha.colaborador_id === null ? null : Number(linha.colaborador_id),
  };
}

export async function colaboradorDoUsuario(
  usuarioId: number
): Promise<number | null> {
  // rh.vinculo_atual (0046): a conta é da PESSOA, e ela pode ter mais de um
  // vínculo. Com um só — o caso de hoje — devolve o mesmo id de antes.
  const linhas = await consultar<{ id: string }>(
    "SELECT id FROM rh.colaborador WHERE id = rh.vinculo_atual($1)",
    [usuarioId]
  );
  return linhas.length > 0 ? Number(linhas[0].id) : null;
}

export async function buscarColaborador(
  id: number
): Promise<{ id: number; nome_completo: string } | null> {
  const linhas = await consultar<{ id: string; nome_completo: string }>(
    "SELECT id, nome_completo FROM rh.colaborador WHERE id = $1",
    [id]
  );
  if (linhas.length === 0) return null;
  return { id: Number(linhas[0].id), nome_completo: linhas[0].nome_completo };
}

export async function inserirCiencia(
  cliente: PoolClient,
  entrada: {
    documentoId: number;
    usuarioId: number;
    hashNoMomento: string;
  }
): Promise<{ id: number; dada_em: string }> {
  const { rows } = await cliente.query<{ id: string; dada_em: Date }>(
    `INSERT INTO rh.ciencia (documento_id, usuario_id, hash_no_momento)
     VALUES ($1, $2, $3)
     RETURNING id, dada_em`,
    [entrada.documentoId, entrada.usuarioId, entrada.hashNoMomento]
  );
  return { id: Number(rows[0].id), dada_em: rows[0].dada_em.toISOString() };
}

export async function registrarLeituraSensivel(
  cliente: PoolClient,
  entrada: {
    usuarioId: number;
    chavePermissao: string;
    recurso: string;
    registroId: string;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO audit.leitura_sensivel
       (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [
      entrada.usuarioId,
      entrada.chavePermissao,
      entrada.recurso,
      entrada.registroId,
    ]
  );
}
