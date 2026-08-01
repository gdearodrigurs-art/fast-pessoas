import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { TipoVinculo } from "../colaboradores/esquemas";
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
//
// PIVÔ PELO VÍNCULO, NÃO PELA CONTA. Desde a 0046 a conta é da PESSOA e
// `rh.colaborador.usuario_id` é projeção dela: `sc.usuario_id = <conta>` casa
// com TODOS os contratos daquele ser humano, inclusive os já encerrados em
// outra empresa do grupo. Enquanto a relação de liderança do contrato morto
// ficasse aberta, o líder de lá continuaria aprovando, reprovando e recebendo
// aviso de quem hoje é de outro CNPJ — escrita atravessando empresa.
// A demanda já grava `d.solicitante_colaborador_id`: quem manda em mim é
// pergunta do CONTRATO, e é ele que responde. Do outro lado, o gestor decide
// pelo vínculo em que ele está HOJE (`rh.vinculo_atual`), não por um contrato
// que ele já encerrou. As duas pontas juntas — mais o encerramento da relação
// no desligamento (0050_lideranca_encerra_com_o_contrato) — fecham o buraco
// por dois caminhos independentes.
function fragmentoGestor(parametroGestor: string): string {
  return `EXISTS (
    SELECT 1
      FROM rh.relacao_gestor rg
     WHERE rg.liderado_colaborador_id = d.solicitante_colaborador_id
       AND rg.fim_vigencia IS NULL
       AND rg.inicio_vigencia <= ${HOJE_SP}
       AND rg.gestor_colaborador_id = rh.vinculo_atual(${parametroGestor}))`;
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
  // rh.vinculo_atual (0046): a conta é da PESSOA, e ela pode ter mais de um
  // vínculo. Com um só — o caso de hoje — devolve o mesmo id de antes.
  const { rows } = await cliente.query<{ id: string }>(
    "SELECT id FROM rh.colaborador WHERE id = rh.vinculo_atual($1)",
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
 *
 * Pivô pelo VÍNCULO do solicitante (`rh.vinculo_atual`), pelo mesmo motivo
 * escrito em `fragmentoGestor`: o líder de um contrato encerrado não pode ser
 * avisado de pedido de quem hoje trabalha em outra empresa do grupo.
 */
export async function gestoresDoUsuario(
  cliente: PoolClient,
  solicitanteUsuarioId: number
): Promise<number[]> {
  const { rows } = await cliente.query<{ usuario_id: string }>(
    `SELECT DISTINCT gc.usuario_id
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
      WHERE rg.liderado_colaborador_id = rh.vinculo_atual($1)
        AND rg.fim_vigencia IS NULL
        AND rg.inicio_vigencia <= ${HOJE_SP}
        AND gc.usuario_id IS NOT NULL`,
    [solicitanteUsuarioId]
  );
  return rows.map((linha) => Number(linha.usuario_id));
}

/**
 * O usuário é gestor vigente do solicitante? (rh.relacao_gestor sem fim.)
 *
 * É a GUARDA DE ESCRITA do nível 'lider' — quem aprova, reprova e decide passa
 * por aqui. Vínculo dos dois lados (ver `fragmentoGestor`): o contrato vigente
 * de quem pede e o contrato vigente de quem decide.
 */
export async function ehGestorDoUsuario(
  gestorUsuarioId: number,
  solicitanteUsuarioId: number,
  cliente?: PoolClient
): Promise<boolean> {
  const sql = `SELECT EXISTS (
      SELECT 1
        FROM rh.relacao_gestor rg
       WHERE rg.liderado_colaborador_id = rh.vinculo_atual($2)
         AND rg.fim_vigencia IS NULL
         AND rg.inicio_vigencia <= ${HOJE_SP}
         AND rg.gestor_colaborador_id = rh.vinculo_atual($1)) AS eh_gestor`;
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
  centro_custo_destino_id: number | null;
  centro_custo_destino: string | null;
  /** REGISTRO (0047/0048): a empresa do grupo de onde sai e para onde vai. */
  empresa_origem: string | null;
  empresa_destino_id: number | null;
  empresa_destino: string | null;
  /** Só em 'transferencia_empresa': o contrato que nasce na empresa destino. */
  matricula_destino: string | null;
  tipo_vinculo_destino: TipoVinculo | null;
  /**
   * Quem lidera na empresa DESTINO (0053). null = ninguém escolheu, e o
   * vínculo novo nasce sem líder — nunca se herda o líder do CNPJ de origem.
   */
  gestor_destino_colaborador_id: number | null;
  gestor_destino_nome: string | null;
  /** Preenchido na aplicação do efeito: o vínculo criado na empresa destino. */
  vinculo_destino_id: number | null;
  vinculo_destino_matricula: string | null;
  data_pretendida: string;
  justificativa: string;
  dentro_faixa: boolean | null;
  justificativa_excecao: string | null;
  aplicada_em: string | null;
  /**
   * A data pretendida já chegou (em São Paulo). Vem do banco e não do relógio
   * do navegador porque é o MESMO relógio que a trava do serviço consulta: a
   * tela não pode oferecer "Aplicar" um segundo antes de a API aceitar.
   */
  efeito_vencido: boolean;
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
  centro_custo_destino_id: string | null;
  centro_custo_destino: string | null;
  empresa_origem: string | null;
  empresa_destino_id: string | null;
  empresa_destino: string | null;
  matricula_destino: string | null;
  tipo_vinculo_destino: TipoVinculo | null;
  gestor_destino_colaborador_id: string | null;
  gestor_destino_nome: string | null;
  vinculo_destino_id: string | null;
  vinculo_destino_matricula: string | null;
  data_pretendida: string;
  justificativa: string;
  dentro_faixa: boolean | null;
  justificativa_excecao: string | null;
  aplicada_em: string | null;
  efeito_vencido: boolean;
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
         -- A LINHA é a da véspera, e o NOME também. Ler o nome pela versão
         -- 'ativa' do estabelecimento acertava a linha e errava a época:
         -- renomear a unidade hoje reescrevia de onde a pessoa saiu meses
         -- atrás ("saiu da Filial Oeste" virava "saiu da OESTE RENOMEADA
         -- HOJE"). rh.lotacao_detalhada resolve cada nome pela versão vigente
         -- no FIM daquela linha de lotação — a mesma régua que empresa_origem
         -- e centro_custo_origem usam vinte linhas abaixo.
         (SELECT ld.lotacao_nome
            FROM rh.lotacao_detalhada ld
           WHERE ld.colaborador_id = m.colaborador_id
             AND ld.inicio_vigencia <= m.data_pretendida - 1
             AND (ld.fim_vigencia IS NULL OR ld.fim_vigencia >= m.data_pretendida - 1)
           ORDER BY ld.inicio_vigencia DESC
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
         m.centro_custo_destino_id, m.centro_custo_destino,
         -- REGISTRO de ONDE a pessoa saiu, pela mesma régua da véspera usada
         -- acima: depois de aplicada a transferência, a alocação de hoje já é
         -- a da empresa nova, e ler "hoje" faria o cartão dizer "DCS → DCS".
         (SELECT ld.empresa_nome
            FROM rh.lotacao_detalhada ld
           WHERE ld.colaborador_id = m.colaborador_id
             AND ld.inicio_vigencia <= m.data_pretendida - 1
             AND (ld.fim_vigencia IS NULL OR ld.fim_vigencia >= m.data_pretendida - 1)
           ORDER BY ld.inicio_vigencia DESC
           LIMIT 1)
           AS empresa_origem,
         m.empresa_destino_id,
         (SELECT ev.nome_fantasia FROM rh.empresa_grupo_versao ev
           WHERE ev.empresa_id = m.empresa_destino_id AND ev.status = 'ativa')
           AS empresa_destino,
         m.matricula_destino, m.tipo_vinculo_destino,
         m.gestor_destino_colaborador_id,
         (SELECT g.nome_completo FROM rh.colaborador g
           WHERE g.id = m.gestor_destino_colaborador_id) AS gestor_destino_nome,
         m.vinculo_destino_id,
         (SELECT vd.matricula FROM rh.colaborador vd
           WHERE vd.id = m.vinculo_destino_id) AS vinculo_destino_matricula,
         m.data_pretendida::text AS data_pretendida,
         m.justificativa, m.dentro_faixa, m.justificativa_excecao, m.aplicada_em,
         (m.data_pretendida <= ${HOJE_SP}) AS efeito_vencido,
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
    centro_custo_destino_id: numeroOuNulo(linha.centro_custo_destino_id),
    centro_custo_destino: linha.centro_custo_destino,
    empresa_origem: linha.empresa_origem,
    empresa_destino_id: numeroOuNulo(linha.empresa_destino_id),
    empresa_destino: linha.empresa_destino,
    matricula_destino: linha.matricula_destino,
    tipo_vinculo_destino: linha.tipo_vinculo_destino,
    gestor_destino_colaborador_id: numeroOuNulo(
      linha.gestor_destino_colaborador_id
    ),
    gestor_destino_nome: linha.gestor_destino_nome,
    vinculo_destino_id: numeroOuNulo(linha.vinculo_destino_id),
    vinculo_destino_matricula: linha.vinculo_destino_matricula,
    data_pretendida: linha.data_pretendida,
    justificativa: linha.justificativa,
    dentro_faixa: linha.dentro_faixa,
    justificativa_excecao: linha.justificativa_excecao,
    aplicada_em: linha.aplicada_em,
    efeito_vencido: linha.efeito_vencido,
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
    centro_custo_destino_id: number | null;
    empresa_destino_id: number | null;
    matricula_destino: string | null;
    tipo_vinculo_destino: TipoVinculo | null;
    gestor_destino_colaborador_id: number | null;
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
        estabelecimento_destino_id, centro_custo_destino_id, empresa_destino_id,
        matricula_destino, tipo_vinculo_destino,
        gestor_destino_colaborador_id, salario_proposto,
        faixa_min, faixa_max, dentro_faixa, justificativa_excecao,
        data_pretendida, justificativa)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17)
     RETURNING id`,
    [
      dados.demanda_id,
      dados.tipo,
      dados.colaborador_id,
      dados.cargo_destino_id,
      dados.estabelecimento_destino_id,
      dados.centro_custo_destino_id,
      dados.empresa_destino_id,
      dados.matricula_destino,
      dados.tipo_vinculo_destino,
      dados.gestor_destino_colaborador_id,
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
  dados: {
    posicao_id: number | null;
    lotacao_id: number | null;
    /** Só na transferência entre empresas: o vínculo que nasceu do efeito. */
    vinculo_destino_id?: number | null;
  }
): Promise<void> {
  await cliente.query(
    `UPDATE rh.demanda_movimentacao
        SET aplicada_em = now(), posicao_id = $2, lotacao_id = $3,
            vinculo_destino_id = $4
      WHERE id = $1`,
    [
      movimentacaoId,
      dados.posicao_id,
      dados.lotacao_id,
      dados.vinculo_destino_id ?? null,
    ]
  );
}

// ------------------------------------------------------------------ transferência entre empresas (0048)

/** Empresa do grupo com versão de nome ativa e não inativada (o REGISTRO). */
export interface EmpresaAtiva {
  id: number;
  nome_fantasia: string;
  cnpj: string | null;
}

export async function listarEmpresasAtivas(): Promise<EmpresaAtiva[]> {
  const linhas = await consultar<{
    id: string;
    nome_fantasia: string;
    cnpj: string | null;
  }>(
    `SELECT e.id, v.nome_fantasia, e.cnpj
       FROM rh.empresa_grupo e
       JOIN rh.empresa_grupo_versao v
         ON v.empresa_id = e.id AND v.status = 'ativa'
      WHERE e.inativada_em IS NULL
      ORDER BY v.nome_fantasia`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function empresaAtiva(
  cliente: PoolClient,
  empresaId: number
): Promise<EmpresaAtiva | null> {
  const { rows } = await cliente.query<{
    id: string;
    nome_fantasia: string;
    cnpj: string | null;
  }>(
    `SELECT e.id, v.nome_fantasia, e.cnpj
       FROM rh.empresa_grupo e
       JOIN rh.empresa_grupo_versao v
         ON v.empresa_id = e.id AND v.status = 'ativa'
      WHERE e.id = $1 AND e.inativada_em IS NULL`,
    [empresaId]
  );
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

/**
 * Centro de custo do catálogo, com a empresa que o MANTÉM. A 0047 decidiu de
 * propósito NÃO travar "centro de custo tem que ser da mesma empresa da
 * lotação" (o exemplo do dono: registrado na Supply, custo caindo no CSC) —
 * a empresa destino da transferência e a mantenedora do centro seguem podendo
 * ser diferentes.
 *
 * O que ela confere é que o centro está OFERECÍVEL, e ofertável inclui a
 * mantenedora: empresa do grupo inativada leva os centros de custo dela junto.
 * Esta é a mesma condição de `listarCentrosCustoAtivos` (domínio estrutura), que
 * monta o seletor — as duas não podem discordar, senão o POST aceita o que a
 * tela parou de oferecer.
 */
export async function centroCustoAtivo(
  cliente: PoolClient,
  centroCustoId: number
): Promise<{ id: number; codigo: string; empresa_id: number } | null> {
  const { rows } = await cliente.query<{
    id: string;
    codigo: string;
    empresa_id: string;
  }>(
    `SELECT cc.id, cc.codigo, cc.empresa_id
       FROM rh.centro_custo cc
       JOIN rh.empresa_grupo eg ON eg.id = cc.empresa_id
      WHERE cc.id = $1 AND cc.inativado_em IS NULL
        AND eg.inativada_em IS NULL`,
    [centroCustoId]
  );
  return rows.length
    ? {
        id: Number(rows[0].id),
        codigo: rows[0].codigo,
        empresa_id: Number(rows[0].empresa_id),
      }
    : null;
}

/** A matrícula é UNIQUE no grupo inteiro (0001): duas empresas, duas matrículas. */
export async function matriculaEmUso(
  cliente: PoolClient,
  matricula: string
): Promise<boolean> {
  const { rows } = await cliente.query<{ existe: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM rh.colaborador WHERE matricula = $1) AS existe",
    [matricula]
  );
  return rows[0].existe;
}

/**
 * O vínculo alvo, travado para escrita, com o que a transferência precisa
 * decidir: de quem é a pessoa (para o novo contrato ser DELA) e qual empresa
 * está registrada hoje (transferir para a MESMA empresa não é transferência).
 */
export interface VinculoParaTransferir {
  id: number;
  pessoa_id: number;
  nome_completo: string;
  matricula: string;
  tipo_vinculo: TipoVinculo;
  status: string;
  data_admissao: string;
  usuario_id: number | null;
  ja_sucedido: boolean;
}

export async function buscarVinculoParaTransferir(
  cliente: PoolClient,
  colaboradorId: number
): Promise<VinculoParaTransferir | null> {
  const { rows } = await cliente.query<{
    id: string;
    pessoa_id: string;
    nome_completo: string;
    matricula: string;
    tipo_vinculo: TipoVinculo;
    status: string;
    data_admissao: string;
    usuario_id: string | null;
    ja_sucedido: boolean;
  }>(
    `SELECT c.id, c.pessoa_id, c.nome_completo, c.matricula, c.tipo_vinculo,
            c.status, c.data_admissao::text AS data_admissao, c.usuario_id,
            NOT rh.saiu_do_grupo(c.id) AS ja_sucedido
       FROM rh.colaborador c
      WHERE c.id = $1
      FOR UPDATE OF c`,
    [colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    pessoa_id: Number(rows[0].pessoa_id),
    usuario_id: rows[0].usuario_id === null ? null : Number(rows[0].usuario_id),
  };
}

/**
 * O vínculo NOVO sucede o antigo. É o elo da 0048 — sem ele o sistema tem duas
 * fichas soltas da mesma pessoa e o turnover conta uma demissão que não houve.
 */
export async function ligarSucessao(
  cliente: PoolClient,
  vinculoNovoId: number,
  vinculoAnteriorId: number
): Promise<void> {
  await cliente.query(
    "UPDATE rh.colaborador SET sucede_vinculo_id = $2 WHERE id = $1",
    [vinculoNovoId, vinculoAnteriorId]
  );
}

/**
 * Copia os dependentes do vínculo que fecha para o que abre, com rastro.
 * Ver o item (f) do cabeçalho da 0048: sem a cópia, a primeira folha da
 * empresa nova calcula IRRF sem dependente e nenhum plano pode ser aderido
 * sem o DP redigitar filho por filho.
 */
export async function copiarDependentes(
  cliente: PoolClient,
  vinculoOrigemId: number,
  vinculoDestinoId: number
): Promise<number> {
  const { rowCount } = await cliente.query(
    `INSERT INTO rh.dependente
       (colaborador_id, nome, nascimento, parentesco, cpf, origem_dependente_id)
     SELECT $2, d.nome, d.nascimento, d.parentesco, d.cpf, d.id
       FROM rh.dependente d
      WHERE d.colaborador_id = $1`,
    [vinculoOrigemId, vinculoDestinoId]
  );
  return rowCount ?? 0;
}

/** Liderados VIGENTES de um vínculo — a equipe que ele leva consigo. */
export async function listarLiderados(
  cliente: PoolClient,
  gestorColaboradorId: number
): Promise<{ relacao_id: number; liderado_id: number }[]> {
  const { rows } = await cliente.query<{ id: string; liderado: string }>(
    `SELECT rg.id, rg.liderado_colaborador_id AS liderado
       FROM rh.relacao_gestor rg
      WHERE rg.gestor_colaborador_id = $1 AND rg.fim_vigencia IS NULL
      FOR UPDATE OF rg`,
    [gestorColaboradorId]
  );
  return rows.map((linha) => ({
    relacao_id: Number(linha.id),
    liderado_id: Number(linha.liderado),
  }));
}

/**
 * O usuário é gestor VIGENTE do colaborador alvo? (nível 'lider' da cadeia.)
 * O lado do liderado já era vínculo; o do gestor passa a ser também — quem
 * decide decide pelo contrato em que está hoje, não por um que já encerrou.
 */
export async function ehGestorDoColaborador(
  gestorUsuarioId: number,
  colaboradorId: number,
  cliente?: PoolClient
): Promise<boolean> {
  const sql = `SELECT EXISTS (
      SELECT 1
        FROM rh.relacao_gestor rg
       WHERE rg.liderado_colaborador_id = $2
         AND rg.fim_vigencia IS NULL
         AND rg.inicio_vigencia <= ${HOJE_SP}
         AND rg.gestor_colaborador_id = rh.vinculo_atual($1)) AS eh_gestor`;
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
  matricula: string;
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
    matricula: string;
    usuario_id: string | null;
    status: string;
  }>(
    `SELECT id, nome_completo, matricula, usuario_id, status
       FROM rh.colaborador WHERE id = $1`,
    [colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    nome_completo: rows[0].nome_completo,
    matricula: rows[0].matricula,
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
          WHERE e.demanda_id = d.id
            AND e.nivel = 'lider'
            AND e.status = 'pendente'
            AND rg.gestor_colaborador_id = rh.vinculo_atual($1))
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

/**
 * Aprovadas com o efeito ainda POR APLICAR — a lista que impede o esquecimento.
 * Como não há agendador, é a fila do DP que carrega o compromisso: as vencidas
 * primeiro (a data já passou e o cadastro ainda não mudou), depois as que ainda
 * vão vencer. Recusada e concluída ficam de fora: nelas não há efeito a aplicar.
 */
export async function listarMovimentacoesProgramadas(
  limite = 50
): Promise<DemandaResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE t.fluxo = 'movimentacao'
       AND d.status IN ('aberta', 'em_atendimento')
       AND EXISTS (SELECT 1 FROM rh.demanda_movimentacao m
                    WHERE m.demanda_id = d.id AND m.aplicada_em IS NULL)
       AND NOT EXISTS (SELECT 1 FROM rh.etapa_aprovacao_demanda e
                        WHERE e.demanda_id = d.id AND e.status = 'pendente')
     ORDER BY (SELECT m.data_pretendida FROM rh.demanda_movimentacao m
                WHERE m.demanda_id = d.id) ASC,
              d.numero DESC
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
                    WHERE rg.liderado_colaborador_id = c.id
                      AND rg.fim_vigencia IS NULL
                      AND rg.inicio_vigencia <= ${HOJE_SP}
                      AND rg.gestor_colaborador_id = rh.vinculo_atual($1))`;
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
    // O parâmetro só vai quando o filtro o USA. Mandar $1 para uma consulta
    // sem $1 é erro do Postgres ("bind message supplies 1 parameters, but
    // prepared statement requires 0") — era o que fazia /movimentacao/opcoes
    // devolver 500 justamente para DP e diretoria, que são quem abre o pedido
    // em nome do líder. Achado ao abrir a transferência entre empresas (I3).
    todos ? [] : [usuarioId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export interface GestorPorEmpresa {
  colaborador_id: number;
  nome_completo: string;
  cargo_atual: string | null;
  empresa_id: number;
}

/**
 * Quem pode ser escolhido como líder NA EMPRESA DESTINO (0053).
 *
 * A pergunta é "quem lidera lá", e "lá" é a empresa de registro — por isso a
 * lista sai da lotação VIGENTE de cada vínculo ativo, carregando `empresa_id`
 * para a tela recortar sozinha assim que o registro destino for escolhido.
 * Sem esta lista o único caminho era herdar o líder de origem, que está em
 * outro CNPJ.
 *
 * Não filtra "só quem já é gestor de alguém": o primeiro liderado de um líder
 * novo tem de caber, e a alçada de aprovação é decidida por chave, não por
 * aparecer nesta lista.
 */
export async function listarGestoresPorEmpresa(): Promise<GestorPorEmpresa[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome_completo: string;
    cargo_atual: string | null;
    empresa_id: string;
  }>(
    `SELECT c.id AS colaborador_id, c.nome_completo,
            (SELECT cv.nome
               FROM rh.posicao_colaborador p
               JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
              WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL)
              AS cargo_atual,
            l.empresa_id
       FROM rh.colaborador c
       JOIN rh.lotacao l
         ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
      WHERE c.status = 'ativo'
      ORDER BY c.nome_completo`
  );
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.colaborador_id),
    nome_completo: linha.nome_completo,
    cargo_atual: linha.cargo_atual,
    empresa_id: Number(linha.empresa_id),
  }));
}

/**
 * Empresa de registro do vínculo, pela lotação vigente — a régua que valida se
 * o líder escolhido está mesmo na empresa de destino, tanto na abertura do
 * pedido quanto na aplicação do efeito.
 */
export async function empresaDoVinculoVigente(
  cliente: PoolClient,
  colaboradorId: number
): Promise<{ empresa_id: number; nome_completo: string; status: string } | null> {
  const { rows } = await cliente.query<{
    empresa_id: string | null;
    nome_completo: string;
    status: string;
  }>(
    `SELECT l.empresa_id, c.nome_completo, c.status
       FROM rh.colaborador c
       LEFT JOIN rh.lotacao l
              ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
      WHERE c.id = $1`,
    [colaboradorId]
  );
  if (rows.length === 0 || rows[0].empresa_id === null) return null;
  return {
    empresa_id: Number(rows[0].empresa_id),
    nome_completo: rows[0].nome_completo,
    status: rows[0].status,
  };
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
       JOIN rh.estabelecimento e ON e.id = ev.estabelecimento_id
      WHERE ev.status = 'ativa' AND e.inativado_em IS NULL
      ORDER BY ev.unidade`
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    unidade: linha.unidade,
  }));
}
