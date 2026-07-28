import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";

/**
 * Armazenamento do CONTEÚDO binário dos documentos — interface própria para o
 * serviço nunca conhecer o meio físico.
 *
 * Implementação atual (dev): BYTEA na própria linha de rh.documento, com o
 * limite de 10 MB garantido também por CHECK no banco. Esta implementação SERÁ
 * TROCADA por object storage (ex.: S3/Supabase Storage) mantendo exatamente
 * esta interface — `guardar` passará a gravar os metadados no banco e o binário
 * no bucket, e `lerConteudo` a buscar do bucket, sem tocar no serviço.
 */

export interface EntradaGuardarDocumento {
  colaborador_id: number | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  conteudo: Buffer;
  sensivel: boolean;
  hash_sha256: string;
  enviado_por_usuario: number;
}

export interface DocumentoGuardado {
  id: number;
  /** ISO 8601 em UTC. */
  enviado_em: string;
}

export interface ArmazenamentoDocumentos {
  guardar(
    cliente: PoolClient,
    entrada: EntradaGuardarDocumento
  ): Promise<DocumentoGuardado>;
  lerConteudo(documentoId: number): Promise<Buffer | null>;
}

export const armazenamentoBytea: ArmazenamentoDocumentos = {
  async guardar(cliente, entrada) {
    const { rows } = await cliente.query<{ id: string; enviado_em: Date }>(
      `INSERT INTO rh.documento
         (colaborador_id, categoria, titulo, nome_arquivo, mime,
          tamanho_bytes, conteudo, sensivel, hash_sha256, enviado_por_usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, enviado_em`,
      [
        entrada.colaborador_id,
        entrada.categoria,
        entrada.titulo,
        entrada.nome_arquivo,
        entrada.mime,
        entrada.tamanho_bytes,
        entrada.conteudo,
        entrada.sensivel,
        entrada.hash_sha256,
        entrada.enviado_por_usuario,
      ]
    );
    const linha = rows[0];
    return {
      id: Number(linha.id),
      enviado_em: linha.enviado_em.toISOString(),
    };
  },

  async lerConteudo(documentoId) {
    const linhas = await consultar<{ conteudo: Buffer }>(
      "SELECT conteudo FROM rh.documento WHERE id = $1",
      [documentoId]
    );
    return linhas[0]?.conteudo ?? null;
  },
};
