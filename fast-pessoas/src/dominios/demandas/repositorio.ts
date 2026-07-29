import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { FiltroDemandas, StatusDemanda } from "./esquemas";

export interface TipoDemandaAtivo {
  id: number;
  chave: string;
  nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
}

export interface DemandaResumo {
  id: number;
  numero: number;
  tipo_chave: string;
  tipo_nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
  solicitante_usuario_id: number;
  solicitante_nome: string;
  atendente_nome: string | null;
  descricao: string;
  status: StatusDemanda;
  recusada_na_aprovacao: boolean;
  prazo: string;
  dias_ate_prazo: number;
  criado_em: string;
}

export interface TransicaoDemanda {
  id: number;
  de_status: StatusDemanda | null;
  para_status: StatusDemanda;
  por_nome: string;
  motivo: string | null;
  em: string;
}

export interface ComentarioDemanda {
  id: number;
  autor_usuario_id: number;
  autor_nome: string;
  autor_papel: string;
  texto: string;
  em: string;
}

export interface DemandaParaTransicao {
  id: number;
  numero: number;
  tipo_nome: string;
  solicitante_usuario_id: number;
  solicitante_colaborador_id: number | null;
  atendente_usuario_id: number | null;
  status: StatusDemanda;
}

export interface IndicadoresFila {
  na_fila: number;
  vencendo_hoje: number;
  atrasadas: number;
  aguardando_aprovacao: number;
}

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

const SELECT_RESUMO = `
  SELECT d.id, d.numero, d.descricao, d.status, d.prazo::text AS prazo,
         d.criado_em, d.solicitante_usuario_id,
         (d.prazo - ${HOJE_SP})::int AS dias_ate_prazo,
         t.chave AS tipo_chave, t.nome AS tipo_nome, t.sla_dias,
         t.exige_aprovacao_gestor,
         s.nome AS solicitante_nome,
         a.nome AS atendente_nome,
         EXISTS (SELECT 1
                   FROM rh.demanda_transicao tr
                  WHERE tr.demanda_id = d.id
                    AND tr.para_status = 'recusada'
                    AND tr.de_status = 'aguardando_aprovacao')
           AS recusada_na_aprovacao
    FROM rh.demanda d
    JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
    JOIN sistema.usuario s ON s.id = d.solicitante_usuario_id
    LEFT JOIN sistema.usuario a ON a.id = d.atendente_usuario_id`;

// Gestor vigente do solicitante da demanda (rh.relacao_gestor sem fim de vigência).
function fragmentoGestor(parametroGestor: string): string {
  return `EXISTS (
    SELECT 1
      FROM rh.colaborador sc
      JOIN rh.relacao_gestor rg
        ON rg.liderado_colaborador_id = sc.id
       AND rg.fim_vigencia IS NULL
       AND rg.inicio_vigencia <= ${HOJE_SP}
      JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
     WHERE sc.usuario_id = d.solicitante_usuario_id
       AND gc.usuario_id = ${parametroGestor})`;
}

interface LinhaResumo extends Record<string, unknown> {
  id: string;
  numero: string;
  descricao: string;
  status: StatusDemanda;
  prazo: string;
  criado_em: string;
  solicitante_usuario_id: string;
  dias_ate_prazo: number;
  tipo_chave: string;
  tipo_nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
  solicitante_nome: string;
  atendente_nome: string | null;
  recusada_na_aprovacao: boolean;
}

function paraResumo(linha: LinhaResumo): DemandaResumo {
  return {
    ...linha,
    id: Number(linha.id),
    numero: Number(linha.numero),
    solicitante_usuario_id: Number(linha.solicitante_usuario_id),
  };
}

export async function tiposAtivos(): Promise<TipoDemandaAtivo[]> {
  const linhas = await consultar<{
    id: string;
    chave: string;
    nome: string;
    sla_dias: number;
    exige_aprovacao_gestor: boolean;
  }>(
    `SELECT id, chave, nome, sla_dias, exige_aprovacao_gestor
       FROM rh.tipo_demanda_versao
      WHERE status = 'ativa'
      ORDER BY nome`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarTipoAtivo(
  chave: string
): Promise<TipoDemandaAtivo | null> {
  const linhas = await consultar<{
    id: string;
    chave: string;
    nome: string;
    sla_dias: number;
    exige_aprovacao_gestor: boolean;
  }>(
    `SELECT id, chave, nome, sla_dias, exige_aprovacao_gestor
       FROM rh.tipo_demanda_versao
      WHERE chave = $1 AND status = 'ativa'`,
    [chave]
  );
  return linhas.length ? { ...linhas[0], id: Number(linhas[0].id) } : null;
}

export async function listarDoSolicitante(
  usuarioId: number
): Promise<DemandaResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE d.solicitante_usuario_id = $1
     ORDER BY d.numero DESC`,
    [usuarioId]
  );
  return linhas.map(paraResumo);
}

export async function listarAprovacoesPendentes(
  gestorUsuarioId: number
): Promise<DemandaResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE d.status = 'aguardando_aprovacao'
       AND ${fragmentoGestor("$1")}
     ORDER BY d.prazo, d.numero`,
    [gestorUsuarioId]
  );
  return linhas.map(paraResumo);
}

export async function listarDecididasDaEquipe(
  gestorUsuarioId: number
): Promise<DemandaResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE t.exige_aprovacao_gestor
       AND d.status <> 'aguardando_aprovacao'
       AND ${fragmentoGestor("$1")}
     ORDER BY d.numero DESC`,
    [gestorUsuarioId]
  );
  return linhas.map(paraResumo);
}

export async function listarTodas(
  filtro: FiltroDemandas
): Promise<DemandaResumo[]> {
  const condicoes: string[] = [];
  const parametros: unknown[] = [];
  if (filtro.status === "encerradas") {
    condicoes.push(`d.status IN ('concluida','recusada')`);
  } else if (filtro.status) {
    parametros.push(filtro.status);
    condicoes.push(`d.status = $${parametros.length}`);
  }
  if (filtro.tipo) {
    parametros.push(filtro.tipo);
    condicoes.push(`t.chave = $${parametros.length}`);
  }
  if (filtro.atraso === "atrasadas") {
    condicoes.push(`d.prazo < ${HOJE_SP}`);
  } else if (filtro.atraso === "hoje") {
    condicoes.push(`d.prazo = ${HOJE_SP}`);
  } else if (filtro.atraso === "no_prazo") {
    condicoes.push(`d.prazo > ${HOJE_SP}`);
  }
  const clausulaWhere =
    condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     ${clausulaWhere}
     ORDER BY d.prazo, d.numero`,
    parametros
  );
  return linhas.map(paraResumo);
}

export async function indicadoresFila(): Promise<IndicadoresFila> {
  const linhas = await consultar<{
    na_fila: string;
    vencendo_hoje: string;
    atrasadas: string;
    aguardando_aprovacao: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('aberta','em_atendimento'))
         AS na_fila,
       COUNT(*) FILTER (WHERE status IN ('aberta','em_atendimento')
                          AND prazo = ${HOJE_SP}) AS vencendo_hoje,
       COUNT(*) FILTER (WHERE status IN ('aberta','em_atendimento')
                          AND prazo < ${HOJE_SP}) AS atrasadas,
       COUNT(*) FILTER (WHERE status = 'aguardando_aprovacao')
         AS aguardando_aprovacao
     FROM rh.demanda`
  );
  const linha = linhas[0];
  return {
    na_fila: Number(linha.na_fila),
    vencendo_hoje: Number(linha.vencendo_hoje),
    atrasadas: Number(linha.atrasadas),
    aguardando_aprovacao: Number(linha.aguardando_aprovacao),
  };
}

export async function buscarResumo(id: number): Promise<DemandaResumo | null> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE d.id = $1`,
    [id]
  );
  return linhas.length ? paraResumo(linhas[0]) : null;
}

export async function listarTransicoes(
  demandaId: number
): Promise<TransicaoDemanda[]> {
  const linhas = await consultar<{
    id: string;
    de_status: StatusDemanda | null;
    para_status: StatusDemanda;
    por_nome: string;
    motivo: string | null;
    em: string;
  }>(
    `SELECT tr.id, tr.de_status, tr.para_status, u.nome AS por_nome,
            tr.motivo, tr.em
       FROM rh.demanda_transicao tr
       JOIN sistema.usuario u ON u.id = tr.por_usuario_id
      WHERE tr.demanda_id = $1
      ORDER BY tr.em, tr.id`,
    [demandaId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function listarComentarios(
  demandaId: number
): Promise<ComentarioDemanda[]> {
  const linhas = await consultar<{
    id: string;
    autor_usuario_id: string;
    autor_nome: string;
    autor_papel: string;
    texto: string;
    em: string;
  }>(
    `SELECT c.id, c.autor_usuario_id, u.nome AS autor_nome,
            u.papel AS autor_papel, c.texto, c.em
       FROM rh.demanda_comentario c
       JOIN sistema.usuario u ON u.id = c.autor_usuario_id
      WHERE c.demanda_id = $1
      ORDER BY c.em, c.id`,
    [demandaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    autor_usuario_id: Number(linha.autor_usuario_id),
  }));
}

export async function colaboradorDoUsuario(
  cliente: PoolClient,
  usuarioId: number
): Promise<number | null> {
  const { rows } = await cliente.query<{ id: string }>(
    "SELECT id FROM rh.colaborador WHERE usuario_id = $1",
    [usuarioId]
  );
  return rows.length ? Number(rows[0].id) : null;
}

export async function criar(
  cliente: PoolClient,
  dados: {
    tipo_demanda_versao_id: number;
    solicitante_usuario_id: number;
    solicitante_colaborador_id: number | null;
    descricao: string;
    status: StatusDemanda;
    sla_dias: number;
  }
): Promise<{ id: number; numero: number; prazo: string }> {
  const { rows } = await cliente.query<{
    id: string;
    numero: string;
    prazo: string;
  }>(
    `INSERT INTO rh.demanda
       (tipo_demanda_versao_id, solicitante_usuario_id,
        solicitante_colaborador_id, descricao, status, prazo)
     VALUES ($1, $2, $3, $4, $5, ${HOJE_SP} + $6::int)
     RETURNING id, numero, prazo::text AS prazo`,
    [
      dados.tipo_demanda_versao_id,
      dados.solicitante_usuario_id,
      dados.solicitante_colaborador_id,
      dados.descricao,
      dados.status,
      dados.sla_dias,
    ]
  );
  return {
    id: Number(rows[0].id),
    numero: Number(rows[0].numero),
    prazo: rows[0].prazo,
  };
}

export async function buscarParaTransicao(
  cliente: PoolClient,
  id: number
): Promise<DemandaParaTransicao | null> {
  const { rows } = await cliente.query<{
    id: string;
    numero: string;
    tipo_nome: string;
    solicitante_usuario_id: string;
    solicitante_colaborador_id: string | null;
    atendente_usuario_id: string | null;
    status: StatusDemanda;
  }>(
    `SELECT d.id, d.numero, t.nome AS tipo_nome,
            d.solicitante_usuario_id, d.solicitante_colaborador_id,
            d.atendente_usuario_id, d.status
       FROM rh.demanda d
       JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
      WHERE d.id = $1
      FOR UPDATE OF d`,
    [id]
  );
  if (rows.length === 0) return null;
  const linha = rows[0];
  return {
    ...linha,
    id: Number(linha.id),
    numero: Number(linha.numero),
    solicitante_usuario_id: Number(linha.solicitante_usuario_id),
    solicitante_colaborador_id:
      linha.solicitante_colaborador_id === null
        ? null
        : Number(linha.solicitante_colaborador_id),
    atendente_usuario_id:
      linha.atendente_usuario_id === null
        ? null
        : Number(linha.atendente_usuario_id),
  };
}

export async function atualizarStatus(
  cliente: PoolClient,
  id: number,
  status: StatusDemanda,
  atendenteUsuarioId?: number
): Promise<void> {
  if (atendenteUsuarioId !== undefined) {
    await cliente.query(
      `UPDATE rh.demanda
          SET status = $2, atendente_usuario_id = $3
        WHERE id = $1`,
      [id, status, atendenteUsuarioId]
    );
    return;
  }
  await cliente.query("UPDATE rh.demanda SET status = $2 WHERE id = $1", [
    id,
    status,
  ]);
}

export async function inserirTransicao(
  cliente: PoolClient,
  dados: {
    demanda_id: number;
    de_status: StatusDemanda | null;
    para_status: StatusDemanda;
    por_usuario_id: number;
    motivo: string | null;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.demanda_transicao
       (demanda_id, de_status, para_status, por_usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      dados.demanda_id,
      dados.de_status,
      dados.para_status,
      dados.por_usuario_id,
      dados.motivo,
    ]
  );
}

export async function inserirComentario(
  cliente: PoolClient,
  dados: { demanda_id: number; autor_usuario_id: number; texto: string }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.demanda_comentario (demanda_id, autor_usuario_id, texto)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [dados.demanda_id, dados.autor_usuario_id, dados.texto]
  );
  return Number(rows[0].id);
}

/**
 * Usuários (com conta) que são gestores vigentes do solicitante — alvo dos
 * avisos de aprovação pendente. Vazio quando o solicitante não tem gestor
 * vigente ou o gestor não tem usuário.
 */
export async function gestoresDoUsuario(
  cliente: PoolClient,
  solicitanteUsuarioId: number
): Promise<number[]> {
  const { rows } = await cliente.query<{ usuario_id: string }>(
    `SELECT DISTINCT gc.usuario_id
       FROM rh.colaborador sc
       JOIN rh.relacao_gestor rg
         ON rg.liderado_colaborador_id = sc.id
        AND rg.fim_vigencia IS NULL
        AND rg.inicio_vigencia <= ${HOJE_SP}
       JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
      WHERE sc.usuario_id = $1
        AND gc.usuario_id IS NOT NULL`,
    [solicitanteUsuarioId]
  );
  return rows.map((linha) => Number(linha.usuario_id));
}

/** O usuário é gestor vigente do solicitante? (rh.relacao_gestor sem fim.) */
export async function ehGestorDoUsuario(
  gestorUsuarioId: number,
  solicitanteUsuarioId: number,
  cliente?: PoolClient
): Promise<boolean> {
  const sql = `SELECT EXISTS (
      SELECT 1
        FROM rh.colaborador sc
        JOIN rh.relacao_gestor rg
          ON rg.liderado_colaborador_id = sc.id
         AND rg.fim_vigencia IS NULL
         AND rg.inicio_vigencia <= ${HOJE_SP}
        JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
       WHERE sc.usuario_id = $2
         AND gc.usuario_id = $1) AS eh_gestor`;
  if (cliente) {
    const { rows } = await cliente.query<{ eh_gestor: boolean }>(sql, [
      gestorUsuarioId,
      solicitanteUsuarioId,
    ]);
    return rows[0].eh_gestor;
  }
  const linhas = await consultar<{ eh_gestor: boolean }>(sql, [
    gestorUsuarioId,
    solicitanteUsuarioId,
  ]);
  return linhas[0].eh_gestor;
}

export async function temPermissao(
  usuarioId: number,
  chave: string
): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, chave]
  );
  return Boolean(linhas[0]?.autorizado);
}
