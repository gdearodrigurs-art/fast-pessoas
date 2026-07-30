import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  FiltroDemandas,
  FluxoDemanda,
  NivelAprovacao,
  StatusDemanda,
  StatusEtapa,
  TipoMovimentacao,
} from "./esquemas";

export interface TipoDemandaAtivo {
  id: number;
  chave: string;
  nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
  fluxo: FluxoDemanda;
}

export interface DemandaResumo {
  id: number;
  numero: number;
  tipo_chave: string;
  tipo_nome: string;
  sla_dias: number;
  exige_aprovacao_gestor: boolean;
  fluxo: FluxoDemanda;
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
  fluxo: FluxoDemanda;
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
         t.exige_aprovacao_gestor, t.fluxo,
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
  fluxo: FluxoDemanda;
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
    fluxo: FluxoDemanda;
  }>(
    `SELECT id, chave, nome, sla_dias, exige_aprovacao_gestor, fluxo
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
    fluxo: FluxoDemanda;
  }>(
    `SELECT id, chave, nome, sla_dias, exige_aprovacao_gestor, fluxo
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
       AND t.fluxo = 'padrao'
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
       AND t.fluxo = 'padrao'
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
    fluxo: FluxoDemanda;
    solicitante_usuario_id: string;
    solicitante_colaborador_id: string | null;
    atendente_usuario_id: string | null;
    status: StatusDemanda;
  }>(
    `SELECT d.id, d.numero, t.nome AS tipo_nome, t.fluxo,
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

/**
 * Quem atende a fila do DP: usuários ativos com a chave `demanda.atender`.
 * Usado para avisar que uma demanda entrou na fila — sem isso o DP só
 * descobre o pedido se lembrar de abrir a tela.
 */
export async function atendentesDaFila(
  cliente: PoolClient
): Promise<number[]> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT u.id
       FROM sistema.usuario u
      WHERE u.ativo
        AND sistema.tem_permissao(u.id, 'demanda.atender')`
  );
  return rows.map((linha) => Number(linha.id));
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

/**
 * Usuários ativos que têm a chave — generalização de `atendentesDaFila` usada
 * pela ciência automática de DP e T&D (`movimentacao.ciencia`). Sempre por
 * CHAVE, nunca por papel: a composição papel × chave é editável em /perfis.
 */
export async function usuariosComChave(
  cliente: PoolClient,
  chave: string
): Promise<number[]> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT u.id
       FROM sistema.usuario u
      WHERE u.ativo
        AND sistema.tem_permissao(u.id, $1)`,
    [chave]
  );
  return rows.map((linha) => Number(linha.id));
}

/** Data de HOJE no fuso de exibição — base das validações de vigência. */
export async function hojeSaoPaulo(cliente: PoolClient): Promise<string> {
  const { rows } = await cliente.query<{ hoje: string }>(
    `SELECT ${HOJE_SP}::text AS hoje`
  );
  return rows[0].hoje;
}

// ==================================================================
// Movimentação: promoção e transferência de unidade (migration 0021)
// ==================================================================

export interface EtapaAprovacao {
  id: number;
  ordem: number;
  nivel: NivelAprovacao;
  status: StatusEtapa;
  usuario_esperado_nome: string | null;
  decisor_nome: string | null;
  decidido_em: string | null;
  motivo: string | null;
}

interface LinhaEtapa extends Record<string, unknown> {
  id: string;
  demanda_id: string;
  ordem: number;
  nivel: NivelAprovacao;
  status: StatusEtapa;
  usuario_esperado_nome: string | null;
  decisor_nome: string | null;
  decidido_em: string | null;
  motivo: string | null;
}

const SELECT_ETAPA = `
  SELECT e.id, e.demanda_id, e.ordem, e.nivel, e.status,
         ue.nome AS usuario_esperado_nome, du.nome AS decisor_nome,
         e.decidido_em, e.motivo
    FROM rh.etapa_aprovacao_demanda e
    LEFT JOIN sistema.usuario ue ON ue.id = e.usuario_esperado_id
    LEFT JOIN sistema.usuario du ON du.id = e.decisor_usuario_id`;

function paraEtapa(linha: LinhaEtapa): EtapaAprovacao {
  return {
    id: Number(linha.id),
    ordem: linha.ordem,
    nivel: linha.nivel,
    status: linha.status,
    usuario_esperado_nome: linha.usuario_esperado_nome,
    decisor_nome: linha.decisor_nome,
    decidido_em: linha.decidido_em,
    motivo: linha.motivo,
  };
}

export async function listarEtapas(
  demandaId: number
): Promise<EtapaAprovacao[]> {
  const linhas = await consultar<LinhaEtapa>(
    `${SELECT_ETAPA} WHERE e.demanda_id = $1 ORDER BY e.ordem`,
    [demandaId]
  );
  return linhas.map(paraEtapa);
}

/** Etapas de várias demandas de uma vez (fila do líder / da diretoria). */
export async function listarEtapasDeVarias(
  demandaIds: number[]
): Promise<Map<number, EtapaAprovacao[]>> {
  const mapa = new Map<number, EtapaAprovacao[]>();
  if (demandaIds.length === 0) return mapa;
  const linhas = await consultar<LinhaEtapa>(
    `${SELECT_ETAPA}
      WHERE e.demanda_id = ANY($1::bigint[])
      ORDER BY e.demanda_id, e.ordem`,
    [demandaIds]
  );
  for (const linha of linhas) {
    const chave = Number(linha.demanda_id);
    const lista = mapa.get(chave) ?? [];
    lista.push(paraEtapa(linha));
    mapa.set(chave, lista);
  }
  return mapa;
}

export async function inserirEtapa(
  cliente: PoolClient,
  dados: {
    demanda_id: number;
    ordem: number;
    nivel: NivelAprovacao;
    usuario_esperado_id: number | null;
    status: StatusEtapa;
    decisor_usuario_id: number | null;
    motivo: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.etapa_aprovacao_demanda
       (demanda_id, ordem, nivel, usuario_esperado_id, status,
        decisor_usuario_id, decidido_em, motivo)
     VALUES ($1, $2, $3, $4, $5, $6,
             CASE WHEN $5 = 'pendente' THEN NULL ELSE now() END, $7)
     RETURNING id`,
    [
      dados.demanda_id,
      dados.ordem,
      dados.nivel,
      dados.usuario_esperado_id,
      dados.status,
      dados.decisor_usuario_id,
      dados.motivo,
    ]
  );
  return Number(rows[0].id);
}

export interface EtapaParaDecidir {
  id: number;
  ordem: number;
  nivel: NivelAprovacao;
  total_etapas: number;
}

/**
 * Primeira etapa pendente da cadeia (a única decidível), travada para update.
 * Nível 2 só aparece aqui depois do nível 1 aprovado, porque etapa reprovada
 * encerra a demanda e a etapa 1 aprovada sai do filtro `pendente`.
 */
export async function buscarEtapaPendente(
  cliente: PoolClient,
  demandaId: number
): Promise<EtapaParaDecidir | null> {
  const { rows } = await cliente.query<{
    id: string;
    ordem: number;
    nivel: NivelAprovacao;
    total_etapas: string;
  }>(
    `SELECT e.id, e.ordem, e.nivel,
            (SELECT COUNT(*) FROM rh.etapa_aprovacao_demanda x
              WHERE x.demanda_id = e.demanda_id) AS total_etapas
       FROM rh.etapa_aprovacao_demanda e
      WHERE e.demanda_id = $1 AND e.status = 'pendente'
      ORDER BY e.ordem
      LIMIT 1
      FOR UPDATE OF e`,
    [demandaId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    ordem: rows[0].ordem,
    nivel: rows[0].nivel,
    total_etapas: Number(rows[0].total_etapas),
  };
}

export async function decidirEtapa(
  cliente: PoolClient,
  etapaId: number,
  dados: {
    status: Exclude<StatusEtapa, "pendente">;
    decisor_usuario_id: number;
    motivo: string | null;
  }
): Promise<void> {
  await cliente.query(
    `UPDATE rh.etapa_aprovacao_demanda
        SET status = $2, decisor_usuario_id = $3, decidido_em = now(),
            motivo = $4
      WHERE id = $1 AND status = 'pendente'`,
    [etapaId, dados.status, dados.decisor_usuario_id, dados.motivo]
  );
}

export interface Movimentacao {
  id: number;
  demanda_id: number;
  tipo: TipoMovimentacao;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_usuario_id: number | null;
  /** Cargo/unidade DE ONDE a pessoa saiu (véspera da vigência pretendida). */
  cargo_origem: string | null;
  unidade_origem: string | null;
  cargo_destino_id: number | null;
  cargo_destino: string | null;
  estabelecimento_destino_id: number | null;
  unidade_destino: string | null;
  centro_custo_destino: string | null;
  data_pretendida: string;
  justificativa: string;
  dentro_faixa: boolean | null;
  justificativa_excecao: string | null;
  aplicada_em: string | null;
  // Sensíveis (remuneração): o serviço remove de quem não pode ver.
  salario_proposto: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
}

interface LinhaMovimentacao extends Record<string, unknown> {
  id: string;
  demanda_id: string;
  tipo: TipoMovimentacao;
  colaborador_id: string;
  colaborador_nome: string;
  colaborador_usuario_id: string | null;
  cargo_origem: string | null;
  unidade_origem: string | null;
  cargo_destino_id: string | null;
  cargo_destino: string | null;
  estabelecimento_destino_id: string | null;
  unidade_destino: string | null;
  centro_custo_destino: string | null;
  data_pretendida: string;
  justificativa: string;
  dentro_faixa: boolean | null;
  justificativa_excecao: string | null;
  aplicada_em: string | null;
  salario_proposto: string | null;
  faixa_min: string | null;
  faixa_max: string | null;
}

const SELECT_MOVIMENTACAO = `
  SELECT m.id, m.demanda_id, m.tipo, m.colaborador_id,
         c.nome_completo AS colaborador_nome, c.usuario_id AS colaborador_usuario_id,
         -- ORIGEM do movimento = posição/lotação vigente na VÉSPERA da data
         -- pretendida, não a vigente hoje. Depois de aplicada, a vigente de
         -- hoje JÁ É o destino: ler "hoje" faria o cartão exibir
         -- "Vendedor(a) → Vendedor(a)". A véspera responde certo nos dois
         -- estados, porque a aplicação encerra a posição anterior em
         -- data_pretendida - 1 (ver encerrarPosicao/encerrarLotacao):
         --   pendente  → a véspera ainda é a posição atual;
         --   aplicada  → a véspera é justamente a posição que foi encerrada.
         (SELECT cv.nome
            FROM rh.posicao_colaborador p
            JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
           WHERE p.colaborador_id = m.colaborador_id
             AND p.inicio_vigencia <= m.data_pretendida - 1
             AND (p.fim_vigencia IS NULL OR p.fim_vigencia >= m.data_pretendida - 1)
           ORDER BY p.inicio_vigencia DESC
           LIMIT 1)
           AS cargo_origem,
         (SELECT ev.unidade
            FROM rh.lotacao l
            JOIN rh.estabelecimento_versao ev
              ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
           WHERE l.colaborador_id = m.colaborador_id
             AND l.inicio_vigencia <= m.data_pretendida - 1
             AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= m.data_pretendida - 1)
           ORDER BY l.inicio_vigencia DESC
           LIMIT 1)
           AS unidade_origem,
         m.cargo_destino_id,
         (SELECT cv.nome FROM rh.cargo_versao cv
           WHERE cv.cargo_id = m.cargo_destino_id AND cv.status = 'ativa')
           AS cargo_destino,
         m.estabelecimento_destino_id,
         (SELECT ev.unidade FROM rh.estabelecimento_versao ev
           WHERE ev.estabelecimento_id = m.estabelecimento_destino_id
             AND ev.status = 'ativa') AS unidade_destino,
         m.centro_custo_destino, m.data_pretendida::text AS data_pretendida,
         m.justificativa, m.dentro_faixa, m.justificativa_excecao, m.aplicada_em,
         m.salario_proposto::text AS salario_proposto,
         m.faixa_min::text AS faixa_min, m.faixa_max::text AS faixa_max
    FROM rh.demanda_movimentacao m
    JOIN rh.colaborador c ON c.id = m.colaborador_id`;

function paraMovimentacao(linha: LinhaMovimentacao): Movimentacao {
  const numeroOuNulo = (valor: string | null) =>
    valor === null ? null : Number(valor);
  return {
    id: Number(linha.id),
    demanda_id: Number(linha.demanda_id),
    tipo: linha.tipo,
    colaborador_id: Number(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    colaborador_usuario_id: numeroOuNulo(linha.colaborador_usuario_id),
    cargo_origem: linha.cargo_origem,
    unidade_origem: linha.unidade_origem,
    cargo_destino_id: numeroOuNulo(linha.cargo_destino_id),
    cargo_destino: linha.cargo_destino,
    estabelecimento_destino_id: numeroOuNulo(linha.estabelecimento_destino_id),
    unidade_destino: linha.unidade_destino,
    centro_custo_destino: linha.centro_custo_destino,
    data_pretendida: linha.data_pretendida,
    justificativa: linha.justificativa,
    dentro_faixa: linha.dentro_faixa,
    justificativa_excecao: linha.justificativa_excecao,
    aplicada_em: linha.aplicada_em,
    salario_proposto: numeroOuNulo(linha.salario_proposto),
    faixa_min: numeroOuNulo(linha.faixa_min),
    faixa_max: numeroOuNulo(linha.faixa_max),
  };
}

export async function buscarMovimentacao(
  demandaId: number,
  cliente?: PoolClient
): Promise<Movimentacao | null> {
  const sql = `${SELECT_MOVIMENTACAO} WHERE m.demanda_id = $1`;
  if (cliente) {
    const { rows } = await cliente.query<LinhaMovimentacao>(sql, [demandaId]);
    return rows.length ? paraMovimentacao(rows[0]) : null;
  }
  const linhas = await consultar<LinhaMovimentacao>(sql, [demandaId]);
  return linhas.length ? paraMovimentacao(linhas[0]) : null;
}

export async function buscarMovimentacoesDeVarias(
  demandaIds: number[]
): Promise<Map<number, Movimentacao>> {
  const mapa = new Map<number, Movimentacao>();
  if (demandaIds.length === 0) return mapa;
  const linhas = await consultar<LinhaMovimentacao>(
    `${SELECT_MOVIMENTACAO} WHERE m.demanda_id = ANY($1::bigint[])`,
    [demandaIds]
  );
  for (const linha of linhas) {
    const movimentacao = paraMovimentacao(linha);
    mapa.set(movimentacao.demanda_id, movimentacao);
  }
  return mapa;
}

export async function inserirMovimentacao(
  cliente: PoolClient,
  dados: {
    demanda_id: number;
    tipo: TipoMovimentacao;
    colaborador_id: number;
    cargo_destino_id: number | null;
    estabelecimento_destino_id: number | null;
    centro_custo_destino: string | null;
    salario_proposto: number | null;
    faixa_min: number | null;
    faixa_max: number | null;
    dentro_faixa: boolean | null;
    justificativa_excecao: string | null;
    data_pretendida: string;
    justificativa: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.demanda_movimentacao
       (demanda_id, tipo, colaborador_id, cargo_destino_id,
        estabelecimento_destino_id, centro_custo_destino, salario_proposto,
        faixa_min, faixa_max, dentro_faixa, justificativa_excecao,
        data_pretendida, justificativa)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      dados.demanda_id,
      dados.tipo,
      dados.colaborador_id,
      dados.cargo_destino_id,
      dados.estabelecimento_destino_id,
      dados.centro_custo_destino,
      dados.salario_proposto,
      dados.faixa_min,
      dados.faixa_max,
      dados.dentro_faixa,
      dados.justificativa_excecao,
      dados.data_pretendida,
      dados.justificativa,
    ]
  );
  return Number(rows[0].id);
}

export async function marcarMovimentacaoAplicada(
  cliente: PoolClient,
  movimentacaoId: number,
  dados: { posicao_id: number | null; lotacao_id: number | null }
): Promise<void> {
  await cliente.query(
    `UPDATE rh.demanda_movimentacao
        SET aplicada_em = now(), posicao_id = $2, lotacao_id = $3
      WHERE id = $1`,
    [movimentacaoId, dados.posicao_id, dados.lotacao_id]
  );
}

/** O usuário é gestor VIGENTE do colaborador alvo? (nível 'lider' da cadeia.) */
export async function ehGestorDoColaborador(
  gestorUsuarioId: number,
  colaboradorId: number,
  cliente?: PoolClient
): Promise<boolean> {
  const sql = `SELECT EXISTS (
      SELECT 1
        FROM rh.relacao_gestor rg
        JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
       WHERE rg.liderado_colaborador_id = $2
         AND rg.fim_vigencia IS NULL
         AND rg.inicio_vigencia <= ${HOJE_SP}
         AND gc.usuario_id = $1) AS eh_gestor`;
  if (cliente) {
    const { rows } = await cliente.query<{ eh_gestor: boolean }>(sql, [
      gestorUsuarioId,
      colaboradorId,
    ]);
    return rows[0].eh_gestor;
  }
  const linhas = await consultar<{ eh_gestor: boolean }>(sql, [
    gestorUsuarioId,
    colaboradorId,
  ]);
  return linhas[0].eh_gestor;
}

/** Usuário do gestor vigente do colaborador (para registrar o esperado/avisar). */
export async function gestorVigenteDoColaborador(
  cliente: PoolClient,
  colaboradorId: number
): Promise<number | null> {
  const { rows } = await cliente.query<{ usuario_id: string | null }>(
    `SELECT gc.usuario_id
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
      WHERE rg.liderado_colaborador_id = $1
        AND rg.fim_vigencia IS NULL
        AND rg.inicio_vigencia <= ${HOJE_SP}
      LIMIT 1`,
    [colaboradorId]
  );
  if (rows.length === 0 || rows[0].usuario_id === null) return null;
  return Number(rows[0].usuario_id);
}

export interface ColaboradorAlvo {
  id: number;
  nome_completo: string;
  usuario_id: number | null;
  status: string;
}

export async function buscarColaboradorAlvo(
  cliente: PoolClient,
  colaboradorId: number
): Promise<ColaboradorAlvo | null> {
  const { rows } = await cliente.query<{
    id: string;
    nome_completo: string;
    usuario_id: string | null;
    status: string;
  }>(
    `SELECT id, nome_completo, usuario_id, status
       FROM rh.colaborador WHERE id = $1`,
    [colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    nome_completo: rows[0].nome_completo,
    usuario_id:
      rows[0].usuario_id === null ? null : Number(rows[0].usuario_id),
    status: rows[0].status,
  };
}

/** Versão ATIVA do cargo destino — a posição nova aponta para ela. */
export async function cargoVersaoAtiva(
  cliente: PoolClient,
  cargoId: number
): Promise<{ id: number; nome: string } | null> {
  const { rows } = await cliente.query<{ id: string; nome: string }>(
    `SELECT id, nome FROM rh.cargo_versao
      WHERE cargo_id = $1 AND status = 'ativa'`,
    [cargoId]
  );
  return rows.length ? { id: Number(rows[0].id), nome: rows[0].nome } : null;
}

export async function estabelecimentoAtivo(
  cliente: PoolClient,
  estabelecimentoId: number
): Promise<{ id: number; unidade: string } | null> {
  const { rows } = await cliente.query<{ id: string; unidade: string }>(
    `SELECT e.id, ev.unidade
       FROM rh.estabelecimento e
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = e.id AND ev.status = 'ativa'
      WHERE e.id = $1`,
    [estabelecimentoId]
  );
  return rows.length
    ? { id: Number(rows[0].id), unidade: rows[0].unidade }
    : null;
}

export interface FaixaCargo {
  faixa_min: number;
  faixa_max: number;
}

/**
 * Faixa salarial ATIVA do cargo (rh.tabela_salarial_versao) — snapshot do
 * enquadramento no pedido. Dado de remuneração: a leitura pelo solicitante é
 * registrada em audit.leitura_sensivel pelo serviço.
 */
export async function faixaVigenteDoCargo(
  cargoId: number,
  cliente?: PoolClient
): Promise<FaixaCargo | null> {
  const sql = `SELECT faixa_min::text AS faixa_min, faixa_max::text AS faixa_max
                 FROM rh.tabela_salarial_versao
                WHERE cargo_id = $1 AND status = 'ativa'`;
  const linhas = cliente
    ? (await cliente.query<{ faixa_min: string; faixa_max: string }>(sql, [cargoId])).rows
    : await consultar<{ faixa_min: string; faixa_max: string }>(sql, [cargoId]);
  if (linhas.length === 0) return null;
  return {
    faixa_min: Number(linhas[0].faixa_min),
    faixa_max: Number(linhas[0].faixa_max),
  };
}

// ------------------------------------------------------------ filas da cadeia

/** Pedidos com a etapa do LÍDER pendente onde o usuário é o gestor vigente. */
export async function listarMovimentacoesDoLider(
  usuarioId: number
): Promise<DemandaResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE t.fluxo = 'movimentacao'
       AND d.status = 'aguardando_aprovacao'
       AND EXISTS (
         SELECT 1
           FROM rh.etapa_aprovacao_demanda e
           JOIN rh.demanda_movimentacao m ON m.demanda_id = d.id
           JOIN rh.relacao_gestor rg
             ON rg.liderado_colaborador_id = m.colaborador_id
            AND rg.fim_vigencia IS NULL
            AND rg.inicio_vigencia <= ${HOJE_SP}
           JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
          WHERE e.demanda_id = d.id
            AND e.nivel = 'lider'
            AND e.status = 'pendente'
            AND gc.usuario_id = $1)
     ORDER BY d.prazo, d.numero`,
    [usuarioId]
  );
  return linhas.map(paraResumo);
}

/**
 * Fila da diretoria: etapa 'diretoria' pendente E nenhuma etapa anterior
 * pendente (o líder já decidiu) — "aguardando aprovação da diretoria".
 */
export async function listarMovimentacoesDaDiretoria(): Promise<
  DemandaResumo[]
> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE t.fluxo = 'movimentacao'
       AND d.status = 'aguardando_aprovacao'
       AND EXISTS (SELECT 1 FROM rh.etapa_aprovacao_demanda e
                    WHERE e.demanda_id = d.id AND e.nivel = 'diretoria'
                      AND e.status = 'pendente')
       AND NOT EXISTS (SELECT 1 FROM rh.etapa_aprovacao_demanda e
                        WHERE e.demanda_id = d.id AND e.status = 'pendente'
                          AND e.nivel <> 'diretoria')
     ORDER BY d.prazo, d.numero`
  );
  return linhas.map(paraResumo);
}

/**
 * Movimentações já APLICADAS (aprovadas na ponta) — a lista de ciência de DP e
 * T&D, que precisam providenciar os trâmites. Limite alto o suficiente para a
 * operação e baixo o suficiente para não virar relatório.
 */
export async function listarMovimentacoesAplicadas(
  limite = 50
): Promise<DemandaResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE t.fluxo = 'movimentacao'
       AND EXISTS (SELECT 1 FROM rh.demanda_movimentacao m
                    WHERE m.demanda_id = d.id AND m.aplicada_em IS NOT NULL)
     ORDER BY d.numero DESC
     LIMIT $1`,
    [limite]
  );
  return linhas.map(paraResumo);
}

// ------------------------------------------------- opções do formulário

export interface OpcaoColaborador {
  id: number;
  nome_completo: string;
  cargo_atual: string | null;
  unidade_atual: string | null;
}

/**
 * Alvos possíveis do pedido: liderados VIGENTES do usuário. Para quem abre em
 * nome do líder (DP/RH/diretoria), `todos` traz os colaboradores ativos.
 */
export async function listarAlvosPossiveis(
  usuarioId: number,
  todos: boolean
): Promise<OpcaoColaborador[]> {
  const filtro = todos
    ? ""
    : `AND EXISTS (SELECT 1
                     FROM rh.relacao_gestor rg
                     JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
                    WHERE rg.liderado_colaborador_id = c.id
                      AND rg.fim_vigencia IS NULL
                      AND rg.inicio_vigencia <= ${HOJE_SP}
                      AND gc.usuario_id = $1)`;
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    cargo_atual: string | null;
    unidade_atual: string | null;
  }>(
    `SELECT c.id, c.nome_completo,
            (SELECT cv.nome
               FROM rh.posicao_colaborador p
               JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
              WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL)
              AS cargo_atual,
            (SELECT ev.unidade
               FROM rh.lotacao l
               JOIN rh.estabelecimento_versao ev
                 ON ev.estabelecimento_id = l.estabelecimento_id
                AND ev.status = 'ativa'
              WHERE l.colaborador_id = c.id AND l.fim_vigencia IS NULL)
              AS unidade_atual
       FROM rh.colaborador c
      WHERE c.status = 'ativo' ${filtro}
      ORDER BY c.nome_completo`,
    [usuarioId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/** Cargos com versão ativa — SEM faixa salarial (dado de remuneração). */
export async function listarCargosAtivos(): Promise<
  { id: number; nome: string }[]
> {
  const linhas = await consultar<{ id: string; nome: string }>(
    `SELECT cv.cargo_id AS id, cv.nome
       FROM rh.cargo_versao cv
      WHERE cv.status = 'ativa'
      ORDER BY cv.nome`
  );
  return linhas.map((linha) => ({ id: Number(linha.id), nome: linha.nome }));
}

export async function listarUnidadesAtivas(): Promise<
  { id: number; unidade: string }[]
> {
  const linhas = await consultar<{ id: string; unidade: string }>(
    `SELECT ev.estabelecimento_id AS id, ev.unidade
       FROM rh.estabelecimento_versao ev
      WHERE ev.status = 'ativa'
      ORDER BY ev.unidade`
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    unidade: linha.unidade,
  }));
}
