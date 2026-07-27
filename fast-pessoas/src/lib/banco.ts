import { Pool, PoolClient } from "pg";

// Pool único da Fase 1 (credencial app_rh). Quando clima e folha entrarem,
// cada fronteira ganha o seu pool com a credencial segregada (ver db/provisionar.sql).
let pool: Pool | undefined;

function obterPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL ausente — configure o .env");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pool;
}

/**
 * Toda operação de escrita passa por aqui: transação única com o usuário da
 * requisição fixado via SET LOCAL — base para RLS e para a auditoria saber quem é.
 */
export async function comTransacao<T>(
  usuarioId: number,
  fn: (cliente: PoolClient) => Promise<T>
): Promise<T> {
  const cliente = await obterPool().connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT set_config('app.usuario_id', $1, true)", [
      String(usuarioId),
    ]);
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  } finally {
    cliente.release();
  }
}

export async function consultar<T extends Record<string, unknown>>(
  sql: string,
  parametros: unknown[] = []
): Promise<T[]> {
  const { rows } = await obterPool().query(sql, parametros);
  return rows as T[];
}
