import { PoolClient } from "pg";

export type Diff = Record<string, { de: string | null; para: string | null }>;

export interface EntradaAlteracao {
  usuarioId: number;
  papel: string;
  acao: string;
  tabela: string;
  registroId: string;
  diff: Diff;
}

export async function registrarAlteracao(
  cliente: PoolClient,
  entrada: EntradaAlteracao
): Promise<void> {
  await cliente.query(
    `INSERT INTO audit.alteracao (usuario_id, papel, acao, tabela, registro_id, diff)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entrada.usuarioId,
      entrada.papel,
      entrada.acao,
      entrada.tabela,
      entrada.registroId,
      JSON.stringify(entrada.diff),
    ]
  );
}

/**
 * As mesmas linhas, em UMA ida ao banco. Existe para operação em massa — a
 * apuração de uma competência inteira registra uma alteração por pessoa, e com
 * 700 pessoas isso eram 700 idas de rede só para a trilha.
 *
 * Uma linha por entrada, na ordem recebida (o `WITH ORDINALITY` garante que os
 * ids saiam na ordem do vetor, não na que o planejador escolher). Nada muda no
 * que é gravado — é a mesma tabela, as mesmas colunas, o mesmo diff.
 */
export async function registrarAlteracoesEmLote(
  cliente: PoolClient,
  entradas: EntradaAlteracao[]
): Promise<void> {
  if (entradas.length === 0) return;
  await cliente.query(
    `INSERT INTO audit.alteracao (usuario_id, papel, acao, tabela, registro_id, diff)
     SELECT t.usuario_id, t.papel, t.acao, t.tabela, t.registro_id, t.diff::jsonb
       FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[],
                   $6::text[])
            WITH ORDINALITY
            AS t(usuario_id, papel, acao, tabela, registro_id, diff, ordem)
      ORDER BY t.ordem`,
    [
      entradas.map((e) => e.usuarioId),
      entradas.map((e) => e.papel),
      entradas.map((e) => e.acao),
      entradas.map((e) => e.tabela),
      entradas.map((e) => e.registroId),
      entradas.map((e) => JSON.stringify(e.diff)),
    ]
  );
}
