// SQL do staging de carga inicial (rh.lote_carga, migration 0095) — molde de
// rh.lote_importacao_ponto. Diferença deliberada: o lote aqui é gravado UMA vez,
// já fechado, porque nenhuma linha criada referencia o lote (as entidades nascem
// pelos serviços de criação reusados, cada uma com sua trilha própria).

import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";

export type TipoLoteCarga = "estrutura" | "cargos" | "headcount";

export interface LoteCarga {
  id: number;
  tipo: TipoLoteCarga;
  arquivo: string;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_ja_existiam: number;
  linhas_rejeitadas: number;
  relatorio: Record<string, unknown>;
  importado_por: number;
  importado_em: string;
}

interface LinhaLoteCarga extends Record<string, unknown> {
  id: string;
  tipo: TipoLoteCarga;
  arquivo: string;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_ja_existiam: number;
  linhas_rejeitadas: number;
  relatorio: Record<string, unknown>;
  importado_por: string;
  importado_em: string;
}

function paraLote(linha: LinhaLoteCarga): LoteCarga {
  return {
    ...linha,
    id: Number(linha.id),
    importado_por: Number(linha.importado_por),
  };
}

export async function inserirLoteCarga(
  cliente: PoolClient,
  dados: {
    tipo: TipoLoteCarga;
    arquivo: string;
    linhas_lidas: number;
    linhas_aceitas: number;
    linhas_ja_existiam: number;
    linhas_rejeitadas: number;
    relatorio: Record<string, unknown>;
    importado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.lote_carga
       (tipo, arquivo, linhas_lidas, linhas_aceitas, linhas_ja_existiam,
        linhas_rejeitadas, relatorio, importado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id`,
    [
      dados.tipo,
      dados.arquivo,
      dados.linhas_lidas,
      dados.linhas_aceitas,
      dados.linhas_ja_existiam,
      dados.linhas_rejeitadas,
      JSON.stringify(dados.relatorio),
      dados.importado_por,
    ]
  );
  return Number(rows[0].id);
}

export async function listarLotesCarga(
  tipo: TipoLoteCarga,
  limite = 50
): Promise<LoteCarga[]> {
  const linhas = await consultar<LinhaLoteCarga>(
    `SELECT id, tipo, arquivo, linhas_lidas, linhas_aceitas,
            linhas_ja_existiam, linhas_rejeitadas, relatorio,
            importado_por, importado_em::text AS importado_em
       FROM rh.lote_carga
      WHERE tipo = $1
      ORDER BY importado_em DESC
      LIMIT $2`,
    [tipo, limite]
  );
  return linhas.map(paraLote);
}
