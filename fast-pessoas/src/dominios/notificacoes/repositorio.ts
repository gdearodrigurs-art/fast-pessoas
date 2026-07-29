import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";

/**
 * A emissão é chamada de DENTRO da transação de outro domínio (PoolClient) ou,
 * em contexto de sistema, direto num Pool — ambos satisfazem esta forma.
 */
export interface ExecutorSql {
  query: (
    sql: string,
    parametros?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export interface Notificacao {
  id: number;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida: boolean;
  criada_em: string;
}

interface LinhaNotificacao extends Record<string, unknown> {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida: boolean;
  criada_em: string;
}

function paraNotificacao(linha: LinhaNotificacao): Notificacao {
  return { ...linha, id: Number(linha.id) };
}

// usuario_id NUNCA sai do repositório: toda leitura já é filtrada pela sessão.
const CAMPOS = "id, tipo, titulo, corpo, link, lida, criada_em";

export async function inserir(
  executor: ExecutorSql,
  dados: {
    usuario_id: number;
    tipo: string;
    titulo: string;
    corpo: string | null;
    link: string | null;
  }
): Promise<number> {
  const { rows } = await executor.query(
    `INSERT INTO sistema.notificacao (usuario_id, tipo, titulo, corpo, link)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [dados.usuario_id, dados.tipo, dados.titulo, dados.corpo, dados.link]
  );
  return Number((rows[0] as { id: string }).id);
}

export async function inserirLote(
  executor: ExecutorSql,
  lote: {
    usuario_id: number;
    tipo: string;
    titulo: string;
    corpo: string | null;
    link: string | null;
  }[]
): Promise<number[]> {
  if (lote.length === 0) return [];
  const { rows } = await executor.query(
    `INSERT INTO sistema.notificacao (usuario_id, tipo, titulo, corpo, link)
     SELECT * FROM UNNEST(
       $1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[]
     ) AS entrada (usuario_id, tipo, titulo, corpo, link)
     RETURNING id`,
    [
      lote.map((item) => item.usuario_id),
      lote.map((item) => item.tipo),
      lote.map((item) => item.titulo),
      lote.map((item) => item.corpo),
      lote.map((item) => item.link),
    ]
  );
  return (rows as { id: string }[]).map((linha) => Number(linha.id));
}

/**
 * Página do usuário da sessão: não lidas primeiro, mais recentes no topo.
 * Cursor `antesDe` = id do último item já exibido; o lado "lida" do keyset é
 * resolvido AQUI (subconsulta com o mesmo filtro de dono) — cursor de outra
 * pessoa simplesmente não encontra referência e devolve vazio, sem vazar nada.
 */
export async function listarPagina(
  usuarioId: number,
  limite: number,
  antesDe?: number
): Promise<Notificacao[]> {
  if (antesDe === undefined) {
    const linhas = await consultar<LinhaNotificacao>(
      `SELECT ${CAMPOS}
         FROM sistema.notificacao
        WHERE usuario_id = $1
        ORDER BY lida, id DESC
        LIMIT $2`,
      [usuarioId, limite]
    );
    return linhas.map(paraNotificacao);
  }
  const linhas = await consultar<LinhaNotificacao>(
    `WITH ref AS (
       SELECT lida, id
         FROM sistema.notificacao
        WHERE id = $2 AND usuario_id = $1
     )
     SELECT n.id, n.tipo, n.titulo, n.corpo, n.link, n.lida, n.criada_em
       FROM sistema.notificacao n
       CROSS JOIN ref
      WHERE n.usuario_id = $1
        AND (n.lida > ref.lida OR (n.lida = ref.lida AND n.id < ref.id))
      ORDER BY n.lida, n.id DESC
      LIMIT $3`,
    [usuarioId, antesDe, limite]
  );
  return linhas.map(paraNotificacao);
}

export async function contarNaoLidas(
  usuarioId: number,
  cliente?: PoolClient
): Promise<number> {
  const sql = `SELECT COUNT(*) AS total
                 FROM sistema.notificacao
                WHERE usuario_id = $1 AND NOT lida`;
  if (cliente) {
    const { rows } = await cliente.query<{ total: string }>(sql, [usuarioId]);
    return Number(rows[0].total);
  }
  const linhas = await consultar<{ total: string }>(sql, [usuarioId]);
  return Number(linhas[0].total);
}

/** Marca como lidas SOMENTE notificações do próprio usuário (filtro de sessão). */
export async function marcarLidas(
  cliente: PoolClient,
  usuarioId: number,
  ids: number[]
): Promise<number> {
  const resultado = await cliente.query(
    `UPDATE sistema.notificacao
        SET lida = TRUE
      WHERE usuario_id = $1 AND id = ANY($2::bigint[]) AND NOT lida`,
    [usuarioId, ids]
  );
  return resultado.rowCount ?? 0;
}

export async function marcarTodasLidas(
  cliente: PoolClient,
  usuarioId: number
): Promise<number> {
  const resultado = await cliente.query(
    `UPDATE sistema.notificacao
        SET lida = TRUE
      WHERE usuario_id = $1 AND NOT lida`,
    [usuarioId]
  );
  return resultado.rowCount ?? 0;
}
