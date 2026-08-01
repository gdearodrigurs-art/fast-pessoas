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
  /** CHAVE do escopo: NULL = meta global; senão a unidade dona da meta. */
  estabelecimento_id: number | null;
  /** Nome da unidade HOJE (NULL na meta global) — rótulo, resolvido na leitura. */
  unidade: string | null;
  /** Nome CONGELADO na hora em que a meta foi pactuada ('global' na global). */
  escopo: string;
  valor: number;
  inicio_vigencia: string;
}

/** Opção de escopo do formulário de meta: a unidade e o nome que ela tem hoje. */
export interface UnidadeEscopo {
  estabelecimento_id: number;
  unidade: string;
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
  estabelecimento_id: string | null;
  unidade: string | null;
  escopo: string;
  valor: string;
  inicio_vigencia: string;
}

/** Data de hoje no fuso da operação — a mesma régua do resto do sistema. */
const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

function paraMetaVigente(linha: LinhaMetaVigente): MetaVigente {
  return {
    ...linha,
    id: Number(linha.id),
    indicador_id: Number(linha.indicador_id),
    estabelecimento_id:
      linha.estabelecimento_id === null ? null : Number(linha.estabelecimento_id),
    valor: Number(linha.valor),
  };
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

/**
 * Metas ativas com o rótulo da unidade resolvido para HOJE.
 *
 * O nome sai de `rh.estabelecimento_versao_em(estabelecimento_id, hoje)`, nunca
 * da coluna `escopo`: `escopo` é o nome CONGELADO de quando a meta foi pactuada
 * (histórico), e a tela precisa mostrar o nome que a unidade tem agora. Foi
 * exatamente essa confusão — nome usado como chave — que fazia uma renomeação
 * órfã a meta e deixá-la imortal na tela (migration 0049).
 */
export async function listarMetasVigentes(): Promise<MetaVigente[]> {
  const linhas = await consultar<LinhaMetaVigente>(
    `SELECT v.id, v.indicador_id, v.estabelecimento_id, v.escopo, v.valor,
            v.inicio_vigencia::text AS inicio_vigencia,
            ev.unidade
       FROM rh.meta_indicador_versao v
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.id = rh.estabelecimento_versao_em(v.estabelecimento_id, ${HOJE_SP})
      WHERE v.status = 'ativa'
      ORDER BY coalesce(ev.unidade, v.escopo), v.id`
  );
  return linhas.map(paraMetaVigente);
}

/** Unidades ativas (id + nome de hoje) — as opções de escopo do formulário. */
export async function listarUnidadesAtivas(): Promise<UnidadeEscopo[]> {
  const linhas = await consultar<{ estabelecimento_id: string; unidade: string }>(
    `SELECT ev.estabelecimento_id, ev.unidade
       FROM rh.estabelecimento_versao ev
       JOIN rh.estabelecimento e ON e.id = ev.estabelecimento_id
      WHERE ev.status = 'ativa' AND e.inativado_em IS NULL
      ORDER BY ev.unidade`
  );
  return linhas.map((linha) => ({
    estabelecimento_id: Number(linha.estabelecimento_id),
    unidade: linha.unidade,
  }));
}

/**
 * A unidade dona de uma meta, pelo id: nome de hoje e se ainda está ativa.
 * Validar por ID (e não por nome contra uma lista) é o que impede a meta de
 * trocar de dono numa renomeação.
 */
export async function buscarUnidadeDaMeta(
  estabelecimentoId: number
): Promise<{ estabelecimento_id: number; unidade: string | null; ativa: boolean } | null> {
  const linhas = await consultar<{
    estabelecimento_id: string;
    unidade: string | null;
    ativa: boolean;
  }>(
    `SELECT e.id AS estabelecimento_id,
            ev.unidade,
            (e.inativado_em IS NULL) AS ativa
       FROM rh.estabelecimento e
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.id = rh.estabelecimento_versao_em(e.id, ${HOJE_SP})
      WHERE e.id = $1`,
    [estabelecimentoId]
  );
  if (linhas.length === 0) return null;
  return {
    estabelecimento_id: Number(linhas[0].estabelecimento_id),
    unidade: linhas[0].unidade,
    ativa: linhas[0].ativa,
  };
}

/**
 * Histórico de versões. Aqui `escopo` vale como está gravado, sem resolver o
 * nome de hoje: o histórico é justamente o nome que a unidade tinha quando
 * aquela meta valia.
 */
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

/**
 * A meta ativa do indicador NAQUELE escopo, travada para a troca de versão.
 * `estabelecimentoId` NULL é a meta global — daí o `IS NOT DISTINCT FROM`,
 * porque `= NULL` não casaria com nada.
 */
export async function buscarMetaAtivaParaEncerrar(
  cliente: PoolClient,
  indicadorId: number,
  estabelecimentoId: number | null
): Promise<{
  id: number;
  escopo: string;
  valor: number;
  inicio_vigencia: string;
} | null> {
  const { rows } = await cliente.query<{
    id: string;
    escopo: string;
    valor: string;
    inicio_vigencia: string;
  }>(
    `SELECT id, escopo, valor, inicio_vigencia::text AS inicio_vigencia
       FROM rh.meta_indicador_versao
      WHERE indicador_id = $1
        AND estabelecimento_id IS NOT DISTINCT FROM $2::bigint
        AND status = 'ativa'
      FOR UPDATE`,
    [indicadorId, estabelecimentoId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    escopo: rows[0].escopo,
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

/**
 * Grava a versão nova. `escopo` entra CONGELADO — é o nome que a unidade tem
 * agora, guardado como histórico; quem manda é `estabelecimento_id`.
 */
export async function criarMeta(
  cliente: PoolClient,
  dados: {
    indicador_id: number;
    estabelecimento_id: number | null;
    escopo: string;
    valor: number;
    inicio_vigencia: string;
    criado_por_usuario: number;
  }
): Promise<MetaVigente> {
  const { rows } = await cliente.query<LinhaMetaVigente>(
    `INSERT INTO rh.meta_indicador_versao
       (indicador_id, estabelecimento_id, escopo, valor, inicio_vigencia,
        criado_por_usuario)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, indicador_id, estabelecimento_id, escopo, valor,
               inicio_vigencia::text AS inicio_vigencia,
               NULLIF(escopo, 'global') AS unidade`,
    [
      dados.indicador_id,
      dados.estabelecimento_id,
      dados.escopo,
      dados.valor,
      dados.inicio_vigencia,
      dados.criado_por_usuario,
    ]
  );
  return paraMetaVigente(rows[0]);
}
