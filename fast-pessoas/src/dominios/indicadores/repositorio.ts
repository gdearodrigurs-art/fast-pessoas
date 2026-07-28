import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { Direcao, UnidadeMedida } from "./esquemas";

export interface Indicador {
  id: number;
  chave: string;
  nome: string;
  area: string;
  descricao: string;
  unidade: UnidadeMedida;
  direcao: Direcao;
}

export interface MetaVigente {
  id: number;
  indicador_id: number;
  escopo: string;
  valor: number;
  inicio_vigencia: string;
}

export interface VersaoMeta {
  id: number;
  escopo: string;
  valor: number;
  inicio_vigencia: string;
  status: "ativa" | "encerrada";
  encerrada_em: string | null;
  criado_em: string;
  criado_por_nome: string;
}

interface LinhaIndicador extends Record<string, unknown> {
  id: string;
  chave: string;
  nome: string;
  area: string;
  descricao: string;
  unidade: UnidadeMedida;
  direcao: Direcao;
}

interface LinhaMetaVigente extends Record<string, unknown> {
  id: string;
  indicador_id: string;
  escopo: string;
  valor: string;
  inicio_vigencia: string;
}

function paraIndicador(linha: LinhaIndicador): Indicador {
  return { ...linha, id: Number(linha.id) };
}

export async function listarIndicadoresAtivos(): Promise<Indicador[]> {
  const linhas = await consultar<LinhaIndicador>(
    `SELECT id, chave, nome, area, descricao, unidade, direcao
       FROM rh.indicador
      WHERE ativo
      ORDER BY area, nome, id`
  );
  return linhas.map(paraIndicador);
}

export async function buscarIndicadorAtivo(
  id: number
): Promise<Indicador | null> {
  const linhas = await consultar<LinhaIndicador>(
    `SELECT id, chave, nome, area, descricao, unidade, direcao
       FROM rh.indicador
      WHERE id = $1 AND ativo`,
    [id]
  );
  return linhas.length ? paraIndicador(linhas[0]) : null;
}

export async function listarMetasVigentes(): Promise<MetaVigente[]> {
  const linhas = await consultar<LinhaMetaVigente>(
    `SELECT id, indicador_id, escopo, valor,
            inicio_vigencia::text AS inicio_vigencia
       FROM rh.meta_indicador_versao
      WHERE status = 'ativa'
      ORDER BY escopo, id`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    indicador_id: Number(linha.indicador_id),
    valor: Number(linha.valor),
  }));
}

/** Nomes de unidade das versões ativas de estabelecimento — opções de escopo. */
export async function listarUnidadesAtivas(): Promise<string[]> {
  const linhas = await consultar<{ unidade: string }>(
    `SELECT DISTINCT unidade
       FROM rh.estabelecimento_versao
      WHERE status = 'ativa'
      ORDER BY unidade`
  );
  return linhas.map((linha) => linha.unidade);
}

export async function listarVersoes(
  indicadorId: number
): Promise<VersaoMeta[]> {
  const linhas = await consultar<{
    id: string;
    escopo: string;
    valor: string;
    inicio_vigencia: string;
    status: "ativa" | "encerrada";
    encerrada_em: Date | null;
    criado_em: Date;
    criado_por_nome: string;
  }>(
    `SELECT v.id, v.escopo, v.valor,
            v.inicio_vigencia::text AS inicio_vigencia,
            v.status, v.encerrada_em, v.criado_em,
            u.nome AS criado_por_nome
       FROM rh.meta_indicador_versao v
       JOIN sistema.usuario u ON u.id = v.criado_por_usuario
      WHERE v.indicador_id = $1
      ORDER BY v.inicio_vigencia DESC, v.criado_em DESC, v.id DESC`,
    [indicadorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    valor: Number(linha.valor),
    encerrada_em: linha.encerrada_em ? linha.encerrada_em.toISOString() : null,
    criado_em: linha.criado_em.toISOString(),
  }));
}

export async function criarIndicador(
  cliente: PoolClient,
  dados: {
    chave: string;
    nome: string;
    area: string;
    descricao: string;
    unidade: UnidadeMedida;
    direcao: Direcao;
  }
): Promise<Indicador> {
  const { rows } = await cliente.query<LinhaIndicador>(
    `INSERT INTO rh.indicador (chave, nome, area, descricao, unidade, direcao)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, chave, nome, area, descricao, unidade, direcao`,
    [
      dados.chave,
      dados.nome,
      dados.area,
      dados.descricao,
      dados.unidade,
      dados.direcao,
    ]
  );
  return paraIndicador(rows[0]);
}

export async function buscarMetaAtivaParaEncerrar(
  cliente: PoolClient,
  indicadorId: number,
  escopo: string
): Promise<{ id: number; valor: number; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{
    id: string;
    valor: string;
    inicio_vigencia: string;
  }>(
    `SELECT id, valor, inicio_vigencia::text AS inicio_vigencia
       FROM rh.meta_indicador_versao
      WHERE indicador_id = $1 AND escopo = $2 AND status = 'ativa'
      FOR UPDATE`,
    [indicadorId, escopo]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    valor: Number(rows[0].valor),
    inicio_vigencia: rows[0].inicio_vigencia,
  };
}

export async function encerrarMeta(
  cliente: PoolClient,
  id: number
): Promise<void> {
  await cliente.query(
    `UPDATE rh.meta_indicador_versao
        SET status = 'encerrada', encerrada_em = now()
      WHERE id = $1`,
    [id]
  );
}

export async function criarMeta(
  cliente: PoolClient,
  dados: {
    indicador_id: number;
    escopo: string;
    valor: number;
    inicio_vigencia: string;
    criado_por_usuario: number;
  }
): Promise<MetaVigente> {
  const { rows } = await cliente.query<LinhaMetaVigente>(
    `INSERT INTO rh.meta_indicador_versao
       (indicador_id, escopo, valor, inicio_vigencia, criado_por_usuario)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, indicador_id, escopo, valor,
               inicio_vigencia::text AS inicio_vigencia`,
    [
      dados.indicador_id,
      dados.escopo,
      dados.valor,
      dados.inicio_vigencia,
      dados.criado_por_usuario,
    ]
  );
  const linha = rows[0];
  return {
    ...linha,
    id: Number(linha.id),
    indicador_id: Number(linha.indicador_id),
    valor: Number(linha.valor),
  };
}
