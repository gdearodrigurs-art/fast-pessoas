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
