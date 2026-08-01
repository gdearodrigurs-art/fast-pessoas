import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { StatusPeriodo, StatusProgramacao } from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

/** Programações que reservam saldo/agenda (não encerradas). */
const STATUS_PROGRAMACAO_ATIVA = "('solicitada','aprovada','em_gozo')";

// ------------------------------------------------------------------ apoio

export async function colaboradorDoUsuario(
  usuarioId: number
): Promise<number | null> {
  // rh.vinculo_atual (0046): a conta é da PESSOA, e ela pode ter mais de um
  // vínculo. Com um só — o caso de hoje — devolve o mesmo id de antes.
  const linhas = await consultar<{ id: string }>(
    "SELECT id FROM rh.colaborador WHERE id = rh.vinculo_atual($1)",
    [usuarioId]
  );
  return linhas.length > 0 ? Number(linhas[0].id) : null;
}

/** Usuário dono da ficha do colaborador (null quando não há conta vinculada). */
export async function usuarioDoColaborador(
  cliente: PoolClient,
  colaboradorId: number
): Promise<number | null> {
  const { rows } = await cliente.query<{ usuario_id: string | null }>(
    "SELECT usuario_id FROM rh.colaborador WHERE id = $1",
    [colaboradorId]
  );
  const usuarioId = rows[0]?.usuario_id ?? null;
  return usuarioId === null ? null : Number(usuarioId);
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

export interface ColaboradorFerias {
  id: number;
  nome_completo: string;
  matricula: string;
  status: string;
  data_admissao: string;
}

export async function buscarColaborador(
  id: number
): Promise<ColaboradorFerias | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
    status: string;
    data_admissao: string;
  }>(
    `SELECT id, nome_completo, matricula, status,
            data_admissao::text AS data_admissao
       FROM rh.colaborador WHERE id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  return { ...linhas[0], id: Number(linhas[0].id) };
}

/** Colaboradores que acumulam férias (todos que não estão desligados). */
export async function listarColaboradoresNaoDesligados(): Promise<
  { id: number; data_admissao: string }[]
> {
  const linhas = await consultar<{ id: string; data_admissao: string }>(
    `SELECT id, data_admissao::text AS data_admissao
       FROM rh.colaborador
      WHERE status <> 'desligado'
      ORDER BY id`
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    data_admissao: linha.data_admissao,
  }));
}

// ------------------------------------------------------------------ períodos aquisitivos

export interface PeriodoAquisitivo {
  id: number;
  colaborador_id: number;
  inicio: string;
  fim: string;
  saldo_dias: number;
  dias_gozados: number;
  status: StatusPeriodo;
  limite_concessivo: string;
  dias_ate_limite: number;
}

interface LinhaPeriodo extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  inicio: string;
  fim: string;
  saldo_dias: string;
  dias_gozados: string;
  status: StatusPeriodo;
  limite_concessivo: string;
  dias_ate_limite: number;
}

function paraPeriodo(linha: LinhaPeriodo): PeriodoAquisitivo {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    saldo_dias: Number(linha.saldo_dias),
    dias_gozados: Number(linha.dias_gozados),
  };
}

const SELECT_PERIODO = `
  SELECT p.id, p.colaborador_id, p.inicio::text AS inicio, p.fim::text AS fim,
         p.saldo_dias::text AS saldo_dias, p.dias_gozados::text AS dias_gozados,
         p.status, p.limite_concessivo::text AS limite_concessivo,
         (p.limite_concessivo - ${HOJE_SP})::int AS dias_ate_limite
    FROM rh.periodo_aquisitivo p`;

export async function listarPeriodos(
  colaboradorId: number
): Promise<PeriodoAquisitivo[]> {
  const linhas = await consultar<LinhaPeriodo>(
    `${SELECT_PERIODO}
     WHERE p.colaborador_id = $1
     ORDER BY p.inicio`,
    [colaboradorId]
  );
  return linhas.map(paraPeriodo);
}

/** Pares (colaborador, início) já persistidos — base do gerador lazy. */
export async function listarIniciosExistentes(): Promise<
  { colaborador_id: number; inicio: string }[]
> {
  const linhas = await consultar<{ colaborador_id: string; inicio: string }>(
    `SELECT colaborador_id, inicio::text AS inicio
       FROM rh.periodo_aquisitivo`
  );
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.colaborador_id),
    inicio: linha.inicio,
  }));
}

/** Idempotente sob corrida: o UNIQUE (colaborador_id, inicio) segura duplicata. */
export async function inserirPeriodoSeFaltar(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    inicio: string;
    fim: string;
    limite_concessivo: string;
    status: StatusPeriodo;
  }
): Promise<number | null> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.periodo_aquisitivo
       (colaborador_id, inicio, fim, limite_concessivo, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (colaborador_id, inicio) DO NOTHING
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.inicio,
      dados.fim,
      dados.limite_concessivo,
      dados.status,
    ]
  );
  return rows.length > 0 ? Number(rows[0].id) : null;
}

/** Há período aberto com limite concessivo estourado? (gate barato do lazy) */
export async function existePeriodoParaVencer(
  colaboradorId: number | null
): Promise<boolean> {
  const parametros: unknown[] = [];
  let filtro = "";
  if (colaboradorId !== null) {
    parametros.push(colaboradorId);
    filtro = "AND colaborador_id = $1";
  }
  const linhas = await consultar<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM rh.periodo_aquisitivo
        WHERE status IN ('em_aberto','programado_parcial')
          AND limite_concessivo < ${HOJE_SP}
          ${filtro}
     ) AS existe`,
    parametros
  );
  return Boolean(linhas[0]?.existe);
}

/** Marca como vencidos os períodos abertos cujo limite concessivo já passou. */
export async function marcarPeriodosVencidos(
  cliente: PoolClient,
  colaboradorId: number | null
): Promise<
  { id: number; colaborador_id: number; status_antigo: StatusPeriodo }[]
> {
  const parametros: unknown[] = [];
  let filtro = "";
  if (colaboradorId !== null) {
    parametros.push(colaboradorId);
    filtro = "AND p.colaborador_id = $1";
  }
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    status_antigo: StatusPeriodo;
  }>(
    `UPDATE rh.periodo_aquisitivo p
        SET status = 'vencido'
       FROM (SELECT id, status FROM rh.periodo_aquisitivo
              WHERE status IN ('em_aberto','programado_parcial')
                AND limite_concessivo < ${HOJE_SP}
              FOR UPDATE) antigo
      WHERE p.id = antigo.id
        ${filtro}
      RETURNING p.id, p.colaborador_id, antigo.status AS status_antigo`,
    parametros
  );
  return rows.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
  }));
}

export interface PeriodoParaAtualizar {
  id: number;
  colaborador_id: number;
  inicio: string;
  fim: string;
  saldo_dias: number;
  dias_gozados: number;
  status: StatusPeriodo;
  limite_concessivo: string;
}

export async function buscarPeriodoParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<PeriodoParaAtualizar | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    inicio: string;
    fim: string;
    saldo_dias: string;
    dias_gozados: string;
    status: StatusPeriodo;
    limite_concessivo: string;
  }>(
    `SELECT id, colaborador_id, inicio::text AS inicio, fim::text AS fim,
            saldo_dias::text AS saldo_dias, dias_gozados::text AS dias_gozados,
            status, limite_concessivo::text AS limite_concessivo
       FROM rh.periodo_aquisitivo
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    colaborador_id: Number(rows[0].colaborador_id),
    saldo_dias: Number(rows[0].saldo_dias),
    dias_gozados: Number(rows[0].dias_gozados),
  };
}

export async function atualizarGozoPeriodo(
  cliente: PoolClient,
  id: number,
  diasGozados: number,
  status: StatusPeriodo
): Promise<void> {
  await cliente.query(
    `UPDATE rh.periodo_aquisitivo
        SET dias_gozados = $2, status = $3
      WHERE id = $1`,
    [id, diasGozados, status]
  );
}

// ------------------------------------------------------------------ painel de vencimento

/**
 * Quem entra no painel e no indicador de férias.
 *
 * `c.status <> 'desligado'` sozinho estava certo enquanto "desligado" só
 * significava "foi embora e a rescisão pagou". A 0048 criou um terceiro caso: o
 * vínculo é marcado desligado por TRANSFERÊNCIA entre empresas do grupo e, de
 * propósito, NÃO abre processo de desligamento ("rito de saída não cabe em quem
 * continua na casa"). Sem esta condição, o saldo do contrato encerrado some do
 * painel do DP e do indicador — inclusive período já VENCIDO, que o art. 137 da
 * CLT manda pagar em dobro — e não existe nenhuma outra tela que o mostre.
 *
 * Continua fora quem saiu do grupo de verdade: lá a rescisão é quem acerta.
 */
const VINCULO_COM_PASSIVO_VISIVEL = `(
  c.status <> 'desligado'
  OR (NOT rh.saiu_do_grupo(c.id) AND p.saldo_dias > p.dias_gozados)
)`;

export interface LinhaPainelVencimento extends PeriodoAquisitivo {
  colaborador_nome: string;
  matricula: string;
  /**
   * O período ficou num vínculo ENCERRADO POR TRANSFERÊNCIA entre empresas do
   * grupo (0048). Não há processo de desligamento para cobrar o acerto — a
   * própria 0048 diz "os períodos abertos ficam no vínculo encerrado, para o
   * acerto" — então esta é a única tela que enxerga o passivo.
   */
  passivo_transferencia: boolean;
}

export async function listarPeriodosPainel(): Promise<
  LinhaPainelVencimento[]
> {
  const linhas = await consultar<
    LinhaPeriodo & {
      colaborador_nome: string;
      matricula: string;
      passivo_transferencia: boolean;
    }
  >(
    `SELECT p.id, p.colaborador_id, p.inicio::text AS inicio, p.fim::text AS fim,
            p.saldo_dias::text AS saldo_dias, p.dias_gozados::text AS dias_gozados,
            p.status, p.limite_concessivo::text AS limite_concessivo,
            (p.limite_concessivo - ${HOJE_SP})::int AS dias_ate_limite,
            c.nome_completo AS colaborador_nome, c.matricula,
            (c.status = 'desligado') AS passivo_transferencia
       FROM rh.periodo_aquisitivo p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE p.status IN ('em_aberto','programado_parcial','vencido')
        AND ${VINCULO_COM_PASSIVO_VISIVEL}
      ORDER BY p.limite_concessivo, c.nome_completo`
  );
  return linhas.map((linha) => ({
    ...paraPeriodo(linha),
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    passivo_transferencia: linha.passivo_transferencia,
  }));
}

/** Indicador: períodos vencidos (persistidos + abertos com limite já estourado). */
export async function contarPeriodosVencidos(): Promise<number> {
  const linhas = await consultar<{ total: string }>(
    `SELECT COUNT(*) AS total
       FROM rh.periodo_aquisitivo p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE ${VINCULO_COM_PASSIVO_VISIVEL}
        AND (p.status = 'vencido'
             OR (p.status IN ('em_aberto','programado_parcial')
                 AND p.limite_concessivo < ${HOJE_SP}))`
  );
  return Number(linhas[0]?.total ?? 0);
}

// ------------------------------------------------------------------ programações

export interface ProgramacaoResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  periodo_aquisitivo_id: number;
  periodo_inicio: string;
  periodo_fim: string;
  inicio: string;
  fim: string;
  dias: number;
  abono_dias: number;
  status: StatusProgramacao;
  demanda_id: number | null;
  demanda_numero: number | null;
  criado_em: string;
}

interface LinhaProgramacao extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  matricula: string;
  periodo_aquisitivo_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  inicio: string;
  fim: string;
  dias: number;
  abono_dias: number;
  status: StatusProgramacao;
  demanda_id: string | null;
  demanda_numero: string | null;
  criado_em: string;
}

function paraProgramacao(linha: LinhaProgramacao): ProgramacaoResumo {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    periodo_aquisitivo_id: Number(linha.periodo_aquisitivo_id),
    demanda_id: linha.demanda_id === null ? null : Number(linha.demanda_id),
    demanda_numero:
      linha.demanda_numero === null ? null : Number(linha.demanda_numero),
  };
}

const SELECT_PROGRAMACAO = `
  SELECT pr.id, pr.colaborador_id, c.nome_completo AS colaborador_nome,
         c.matricula, pr.periodo_aquisitivo_id,
         p.inicio::text AS periodo_inicio, p.fim::text AS periodo_fim,
         pr.inicio::text AS inicio,
         (pr.inicio + pr.dias - 1)::text AS fim,
         pr.dias, pr.abono_dias, pr.status, pr.demanda_id,
         d.numero AS demanda_numero, pr.criado_em::text AS criado_em
    FROM rh.programacao_ferias pr
    JOIN rh.colaborador c ON c.id = pr.colaborador_id
    JOIN rh.periodo_aquisitivo p ON p.id = pr.periodo_aquisitivo_id
    LEFT JOIN rh.demanda d ON d.id = pr.demanda_id`;

export async function buscarProgramacaoResumo(
  id: number
): Promise<ProgramacaoResumo | null> {
  const linhas = await consultar<LinhaProgramacao>(
    `${SELECT_PROGRAMACAO}
     WHERE pr.id = $1`,
    [id]
  );
  return linhas.length > 0 ? paraProgramacao(linhas[0]) : null;
}

export async function listarProgramacoesDoColaborador(
  colaboradorId: number
): Promise<ProgramacaoResumo[]> {
  const linhas = await consultar<LinhaProgramacao>(
    `${SELECT_PROGRAMACAO}
     WHERE pr.colaborador_id = $1
     ORDER BY pr.criado_em DESC, pr.id DESC`,
    [colaboradorId]
  );
  return linhas.map(paraProgramacao);
}

/** Fila do painel DP/RH: programações aguardando decisão (aprovação de exceção). */
export async function listarProgramacoesSolicitadas(): Promise<
  ProgramacaoResumo[]
> {
  const linhas = await consultar<LinhaProgramacao>(
    `${SELECT_PROGRAMACAO}
     WHERE pr.status = 'solicitada'
     ORDER BY pr.inicio, pr.id`
  );
  return linhas.map(paraProgramacao);
}

export interface ProgramacaoParaAtualizar {
  id: number;
  colaborador_id: number;
  periodo_aquisitivo_id: number;
  inicio: string;
  fim: string;
  dias: number;
  abono_dias: number;
  status: StatusProgramacao;
  demanda_id: number | null;
}

export async function buscarProgramacaoParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<ProgramacaoParaAtualizar | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    periodo_aquisitivo_id: string;
    inicio: string;
    fim: string;
    dias: number;
    abono_dias: number;
    status: StatusProgramacao;
    demanda_id: string | null;
  }>(
    `SELECT id, colaborador_id, periodo_aquisitivo_id,
            inicio::text AS inicio, (inicio + dias - 1)::text AS fim,
            dias, abono_dias, status, demanda_id
       FROM rh.programacao_ferias
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    colaborador_id: Number(rows[0].colaborador_id),
    periodo_aquisitivo_id: Number(rows[0].periodo_aquisitivo_id),
    demanda_id:
      rows[0].demanda_id === null ? null : Number(rows[0].demanda_id),
  };
}

export async function atualizarStatusProgramacao(
  cliente: PoolClient,
  id: number,
  status: StatusProgramacao
): Promise<void> {
  await cliente.query(
    "UPDATE rh.programacao_ferias SET status = $2 WHERE id = $1",
    [id, status]
  );
}

/**
 * Dias ainda pendentes de decisão no período (programações 'solicitada').
 * Aprovadas/em gozo/concluídas já constam em dias_gozados do período.
 */
export async function diasSolicitadosNoPeriodo(
  cliente: PoolClient,
  periodoId: number
): Promise<number> {
  const { rows } = await cliente.query<{ total: string }>(
    `SELECT COALESCE(SUM(dias + abono_dias), 0) AS total
       FROM rh.programacao_ferias
      WHERE periodo_aquisitivo_id = $1 AND status = 'solicitada'`,
    [periodoId]
  );
  return Number(rows[0].total);
}

/** Sobreposição de datas com outra programação ativa do mesmo colaborador. */
export async function existeSobreposicao(
  cliente: PoolClient,
  colaboradorId: number,
  inicio: string,
  fim: string
): Promise<boolean> {
  const { rows } = await cliente.query<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM rh.programacao_ferias pr
        WHERE pr.colaborador_id = $1
          AND pr.status IN ${STATUS_PROGRAMACAO_ATIVA}
          AND pr.inicio <= $3::date
          AND (pr.inicio + pr.dias - 1) >= $2::date
     ) AS existe`,
    [colaboradorId, inicio, fim]
  );
  return rows[0].existe;
}

export async function inserirProgramacao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    periodo_aquisitivo_id: number;
    inicio: string;
    dias: number;
    abono_dias: number;
    demanda_id: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.programacao_ferias
       (colaborador_id, periodo_aquisitivo_id, inicio, dias, abono_dias,
        status, demanda_id)
     VALUES ($1, $2, $3, $4, $5, 'solicitada', $6)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.periodo_aquisitivo_id,
      dados.inicio,
      dados.dias,
      dados.abono_dias,
      dados.demanda_id,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ sincronização com demandas

export interface ProgramacaoParaSincronizar {
  id: number;
  demanda_id: number;
  demanda_status: string;
  decisor_usuario_id: number | null;
  decisor_papel: string | null;
}

/**
 * Programações 'solicitada' cuja demanda vinculada já foi decidida no motor
 * de demandas (gestor aprovou → 'aberta'/adiante; reprovou → 'recusada').
 * O decisor vem da transição que saiu de 'aguardando_aprovacao'.
 */
export async function listarParaSincronizar(
  colaboradorId: number | null
): Promise<ProgramacaoParaSincronizar[]> {
  const parametros: unknown[] = [];
  let filtro = "";
  if (colaboradorId !== null) {
    parametros.push(colaboradorId);
    filtro = "AND pr.colaborador_id = $1";
  }
  const linhas = await consultar<{
    id: string;
    demanda_id: string;
    demanda_status: string;
    decisor_usuario_id: string | null;
    decisor_papel: string | null;
  }>(
    `SELECT pr.id, pr.demanda_id, d.status AS demanda_status,
            dec.por_usuario_id AS decisor_usuario_id,
            dec.papel AS decisor_papel
       FROM rh.programacao_ferias pr
       JOIN rh.demanda d ON d.id = pr.demanda_id
       LEFT JOIN LATERAL (
         SELECT tr.por_usuario_id, u.papel
           FROM rh.demanda_transicao tr
           JOIN sistema.usuario u ON u.id = tr.por_usuario_id
          WHERE tr.demanda_id = d.id
            AND tr.de_status = 'aguardando_aprovacao'
          ORDER BY tr.em DESC, tr.id DESC
          LIMIT 1
       ) dec ON TRUE
      WHERE pr.status = 'solicitada'
        AND d.status IN ('aberta','em_atendimento','concluida','recusada')
        ${filtro}`,
    parametros
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    demanda_id: Number(linha.demanda_id),
    demanda_status: linha.demanda_status,
    decisor_usuario_id:
      linha.decisor_usuario_id === null
        ? null
        : Number(linha.decisor_usuario_id),
    decisor_papel: linha.decisor_papel,
  }));
}
