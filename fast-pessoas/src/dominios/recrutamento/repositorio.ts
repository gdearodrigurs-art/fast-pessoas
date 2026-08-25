import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  MotivoMovimentacao,
  MotivoRequisicao,
  OrigemCandidato,
  RecomendacaoParecer,
  StatusCandidatura,
  StatusOferta,
  StatusRequisicao,
  StatusVaga,
} from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// ------------------------------------------------------------------ catálogos (cargo / estabelecimento / etapas)

export interface CargoDisponivel {
  cargo_id: number;
  nome: string;
  /** Faixa vigente da tabela salarial — null quando o cargo não tem faixa ativa. */
  faixa_min: number | null;
  faixa_max: number | null;
}

export async function listarCargosDisponiveis(): Promise<CargoDisponivel[]> {
  const linhas = await consultar<{
    cargo_id: string;
    nome: string;
    faixa_min: string | null;
    faixa_max: string | null;
  }>(
    `SELECT cv.cargo_id, cv.nome,
            ts.faixa_min::text AS faixa_min, ts.faixa_max::text AS faixa_max
       FROM rh.cargo_versao cv
       LEFT JOIN rh.tabela_salarial_versao ts
              ON ts.cargo_id = cv.cargo_id AND ts.status = 'ativa'
      WHERE cv.status = 'ativa'
      ORDER BY cv.nome`
  );
  return linhas.map((linha) => ({
    cargo_id: Number(linha.cargo_id),
    nome: linha.nome,
    faixa_min: linha.faixa_min === null ? null : Number(linha.faixa_min),
    faixa_max: linha.faixa_max === null ? null : Number(linha.faixa_max),
  }));
}

export interface EstabelecimentoDisponivel {
  estabelecimento_versao_id: number;
  unidade: string;
}

/**
 * Lotações oferecidas na requisição/vaga. "Ativa" é a versão do nome E o
 * próprio local: estabelecimento inativado sai da oferta de lançamento novo —
 * abrir vaga para uma loja que fechou é convite a erro. Isto NÃO esconde
 * histórico: vaga já publicada continua mostrando a unidade dela, que vem da
 * versão gravada na requisição, não desta lista.
 */
export async function listarEstabelecimentosAtivos(): Promise<
  EstabelecimentoDisponivel[]
> {
  const linhas = await consultar<{ id: string; unidade: string }>(
    `SELECT ev.id, ev.unidade
       FROM rh.estabelecimento_versao ev
       JOIN rh.estabelecimento e ON e.id = ev.estabelecimento_id
      WHERE ev.status = 'ativa' AND e.inativado_em IS NULL
      ORDER BY ev.unidade`
  );
  return linhas.map((linha) => ({
    estabelecimento_versao_id: Number(linha.id),
    unidade: linha.unidade,
  }));
}

export interface CargoVersaoVigente {
  id: number;
  cargo_id: number;
  nome: string;
}

export async function buscarCargoVersaoVigente(
  cliente: PoolClient,
  cargoId: number
): Promise<CargoVersaoVigente | null> {
  const { rows } = await cliente.query<{
    id: string;
    cargo_id: string;
    nome: string;
  }>(
    `SELECT id, cargo_id, nome
       FROM rh.cargo_versao
      WHERE cargo_id = $1 AND status = 'ativa'`,
    [cargoId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    cargo_id: Number(rows[0].cargo_id),
    nome: rows[0].nome,
  };
}

export async function buscarEstabelecimentoVersaoAtiva(
  cliente: PoolClient,
  estabelecimentoVersaoId: number
): Promise<{ id: number; unidade: string } | null> {
  const { rows } = await cliente.query<{ id: string; unidade: string }>(
    `SELECT id, unidade
       FROM rh.estabelecimento_versao
      WHERE id = $1 AND status = 'ativa'`,
    [estabelecimentoVersaoId]
  );
  return rows.length
    ? { id: Number(rows[0].id), unidade: rows[0].unidade }
    : null;
}

/** Faixa ativa da tabela salarial do cargo — congelada na vaga na criação. */
export async function buscarFaixaVigente(
  cliente: PoolClient,
  cargoId: number
): Promise<{ faixa_min: number; faixa_max: number } | null> {
  const { rows } = await cliente.query<{
    faixa_min: string;
    faixa_max: string;
  }>(
    `SELECT faixa_min::text AS faixa_min, faixa_max::text AS faixa_max
       FROM rh.tabela_salarial_versao
      WHERE cargo_id = $1 AND status = 'ativa'`,
    [cargoId]
  );
  if (rows.length === 0) return null;
  return {
    faixa_min: Number(rows[0].faixa_min),
    faixa_max: Number(rows[0].faixa_max),
  };
}

export interface EtapaAtiva {
  id: number;
  tipo: string;
  ordem: number;
  nome: string;
}

interface LinhaEtapa extends Record<string, unknown> {
  id: string;
  tipo: string;
  ordem: number;
  nome: string;
}

const SQL_ETAPAS_ATIVAS = `
  SELECT id, tipo, ordem, nome
    FROM rh.etapa_selecao_versao
   WHERE status = 'ativa'
   ORDER BY ordem`;

export async function listarEtapasAtivas(): Promise<EtapaAtiva[]> {
  const linhas = await consultar<LinhaEtapa>(SQL_ETAPAS_ATIVAS);
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/** Mesma listagem, DENTRO da transação de movimentação/candidatura. */
export async function buscarEtapasAtivas(
  cliente: PoolClient
): Promise<EtapaAtiva[]> {
  const { rows } = await cliente.query<LinhaEtapa>(SQL_ETAPAS_ATIVAS);
  return rows.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export interface EtapaDoModelo {
  /** id da versão de etapa (rh.etapa_selecao_versao) que a candidatura referencia. */
  etapa_selecao_versao_id: number;
  tipo: string;
  nome: string;
  /** ordem DENTRO do modelo (não a ordem global do catálogo). */
  ordem: number;
}

/**
 * As etapas de um modelo de processo (0076), na ordem do modelo. É por aqui que
 * a candidatura anda desde o Estágio 2 — não mais pela lista global viva.
 */
export async function buscarEtapasDoModelo(
  cliente: PoolClient,
  modeloVersaoId: number
): Promise<EtapaDoModelo[]> {
  const { rows } = await cliente.query<{
    etapa_selecao_versao_id: string;
    tipo: string;
    nome: string;
    ordem: number;
  }>(
    `SELECT me.etapa_selecao_versao_id, e.tipo, e.nome, me.ordem
       FROM rh.modelo_selecao_etapa me
       JOIN rh.etapa_selecao_versao e ON e.id = me.etapa_selecao_versao_id
      WHERE me.modelo_versao_id = $1
      ORDER BY me.ordem`,
    [modeloVersaoId]
  );
  return rows.map((linha) => ({
    ...linha,
    etapa_selecao_versao_id: Number(linha.etapa_selecao_versao_id),
  }));
}

/**
 * As etapas de um modelo, na forma que o kanban consome (id = a versão de etapa
 * que a candidatura referencia; ordem = a ordem DENTRO do modelo). Versão de
 * POOL (fora de transação) do `buscarEtapasDoModelo` — é o par de LEITURA do
 * pipeline: a escrita anda pelo modelo (servico), o desenho das colunas também.
 */
export async function listarEtapasDoModelo(
  modeloVersaoId: number
): Promise<EtapaAtiva[]> {
  const linhas = await consultar<LinhaEtapa>(
    `SELECT me.etapa_selecao_versao_id AS id, e.tipo, e.nome, me.ordem
       FROM rh.modelo_selecao_etapa me
       JOIN rh.etapa_selecao_versao e ON e.id = me.etapa_selecao_versao_id
      WHERE me.modelo_versao_id = $1
      ORDER BY me.ordem`,
    [modeloVersaoId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/** O modelo de processo PADRÃO (o GERAL) ativo — default da vaga nova. */
export async function buscarModeloPadrao(
  cliente: PoolClient
): Promise<number | null> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id FROM rh.modelo_selecao_versao
      WHERE padrao AND status = 'ativa' LIMIT 1`
  );
  return rows.length ? Number(rows[0].id) : null;
}

// ------------------------------------------------------------------ administração dos modelos de processo

export interface ModeloResumo {
  id: number;
  nome: string;
  padrao: boolean;
  status: string;
  etapas: { nome: string; tipo: string; ordem: number }[];
  /** Quantas vagas congelaram esta versão do modelo. */
  vagas_usando: number;
}

/** Os modelos ATIVOS (o GERAL + os alternativos) com suas etapas e uso. */
export async function listarModelos(): Promise<ModeloResumo[]> {
  const linhas = await consultar<{
    id: string;
    nome: string;
    padrao: boolean;
    status: string;
    vagas_usando: number;
    etapas: { nome: string; tipo: string; ordem: number }[];
  }>(
    `SELECT m.id, m.nome, m.padrao, m.status,
            (SELECT count(*) FROM rh.vaga v WHERE v.modelo_versao_id = m.id)::int
              AS vagas_usando,
            COALESCE(
              json_agg(
                json_build_object('nome', e.nome, 'tipo', e.tipo, 'ordem', me.ordem)
                ORDER BY me.ordem
              ) FILTER (WHERE me.id IS NOT NULL),
              '[]'
            ) AS etapas
       FROM rh.modelo_selecao_versao m
       LEFT JOIN rh.modelo_selecao_etapa me ON me.modelo_versao_id = m.id
       LEFT JOIN rh.etapa_selecao_versao e ON e.id = me.etapa_selecao_versao_id
      WHERE m.status = 'ativa'
      GROUP BY m.id
      ORDER BY m.padrao DESC, m.nome`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/**
 * Um modelo ASSINÁVEL por uma vaga nova: precisa existir e estar ATIVO. Devolve
 * null quando não serve (inexistente, rascunho ou encerrado) — o serviço traduz.
 */
export async function buscarModeloAtivo(
  cliente: PoolClient,
  id: number
): Promise<number | null> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id FROM rh.modelo_selecao_versao
      WHERE id = $1 AND status = 'ativa'`,
    [id]
  );
  return rows.length ? Number(rows[0].id) : null;
}

/** O nome de um modelo — para o rastro de auditoria da vaga (eixo 8). */
export async function buscarNomeModelo(
  cliente: PoolClient,
  id: number
): Promise<string | null> {
  const { rows } = await cliente.query<{ nome: string }>(
    `SELECT nome FROM rh.modelo_selecao_versao WHERE id = $1`,
    [id]
  );
  return rows.length ? rows[0].nome : null;
}

/** Cria um modelo alternativo já ATIVO (não-padrão) e devolve o id. */
export async function inserirModelo(
  cliente: PoolClient,
  nome: string
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.modelo_selecao_versao (nome, padrao, status, inicio_vigencia)
     VALUES ($1, false, 'ativa', rh.hoje())
     RETURNING id`,
    [nome]
  );
  return Number(rows[0].id);
}

/** Grava a seleção e a ordem de etapas do modelo (ordem = posição na lista). */
export async function inserirEtapasNoModelo(
  cliente: PoolClient,
  modeloVersaoId: number,
  etapaIds: number[]
): Promise<void> {
  const ordens = etapaIds.map((_, indice) => indice + 1);
  await cliente.query(
    `INSERT INTO rh.modelo_selecao_etapa (modelo_versao_id, etapa_selecao_versao_id, ordem)
     SELECT $1::bigint, t.etapa_id, t.ordem
       FROM unnest($2::bigint[], $3::int[]) AS t(etapa_id, ordem)`,
    [modeloVersaoId, etapaIds, ordens]
  );
}

// ------------------------------------------------------------------ requisição de vaga

export interface RequisicaoResumo {
  id: number;
  cargo_nome: string;
  unidade: string | null;
  motivo: MotivoRequisicao;
  justificativa: string;
  solicitante_usuario_id: number;
  solicitante_nome: string;
  status: StatusRequisicao;
  decisor_nome: string | null;
  decidido_em: string | null;
  motivo_decisao: string | null;
  vaga_id: number | null;
  criado_em: string;
}

interface LinhaRequisicao extends Record<string, unknown> {
  id: string;
  cargo_nome: string;
  unidade: string | null;
  motivo: MotivoRequisicao;
  justificativa: string;
  solicitante_usuario_id: string;
  solicitante_nome: string;
  status: StatusRequisicao;
  decisor_nome: string | null;
  decidido_em: string | null;
  motivo_decisao: string | null;
  vaga_id: string | null;
  criado_em: string;
}

const SELECT_REQUISICAO = `
  SELECT r.id, cv.nome AS cargo_nome, ev.unidade,
         r.motivo, r.justificativa, r.status, r.motivo_decisao,
         r.solicitante_usuario_id, s.nome AS solicitante_nome,
         d.nome AS decisor_nome, r.decidido_em, r.criado_em,
         v.id AS vaga_id
    FROM rh.requisicao_vaga r
    JOIN rh.cargo_versao cv ON cv.id = r.cargo_versao_id
    LEFT JOIN rh.estabelecimento_versao ev ON ev.id = r.estabelecimento_versao_id
    JOIN sistema.usuario s ON s.id = r.solicitante_usuario_id
    LEFT JOIN sistema.usuario d ON d.id = r.decisor_usuario_id
    LEFT JOIN rh.vaga v ON v.requisicao_id = r.id`;

function paraRequisicao(linha: LinhaRequisicao): RequisicaoResumo {
  return {
    ...linha,
    id: Number(linha.id),
    solicitante_usuario_id: Number(linha.solicitante_usuario_id),
    vaga_id: linha.vaga_id === null ? null : Number(linha.vaga_id),
  };
}

/** Todas, ou apenas as do solicitante (escopo do gestor sem rs.ver). */
export async function listarRequisicoes(
  apenasDoUsuario?: number
): Promise<RequisicaoResumo[]> {
  const filtro =
    apenasDoUsuario === undefined ? "" : "WHERE r.solicitante_usuario_id = $1";
  const linhas = await consultar<LinhaRequisicao>(
    `${SELECT_REQUISICAO}
     ${filtro}
     ORDER BY (r.status = 'solicitada') DESC, r.criado_em DESC`,
    apenasDoUsuario === undefined ? [] : [apenasDoUsuario]
  );
  return linhas.map(paraRequisicao);
}

export async function inserirRequisicao(
  cliente: PoolClient,
  dados: {
    cargo_versao_id: number;
    estabelecimento_versao_id: number | null;
    motivo: MotivoRequisicao;
    justificativa: string;
    solicitante_usuario_id: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.requisicao_vaga
       (cargo_versao_id, estabelecimento_versao_id, motivo, justificativa,
        solicitante_usuario_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.cargo_versao_id,
      dados.estabelecimento_versao_id,
      dados.motivo,
      dados.justificativa,
      dados.solicitante_usuario_id,
    ]
  );
  return Number(rows[0].id);
}

export interface RequisicaoParaMutacao {
  id: number;
  cargo_id: number;
  cargo_nome: string;
  status: StatusRequisicao;
  solicitante_usuario_id: number;
}

export async function buscarRequisicaoParaMutacao(
  cliente: PoolClient,
  id: number
): Promise<RequisicaoParaMutacao | null> {
  const { rows } = await cliente.query<{
    id: string;
    cargo_id: string;
    cargo_nome: string;
    status: StatusRequisicao;
    solicitante_usuario_id: string;
  }>(
    `SELECT r.id, cv.cargo_id, cv.nome AS cargo_nome, r.status,
            r.solicitante_usuario_id
       FROM rh.requisicao_vaga r
       JOIN rh.cargo_versao cv ON cv.id = r.cargo_versao_id
      WHERE r.id = $1
      FOR UPDATE OF r`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    cargo_id: Number(rows[0].cargo_id),
    cargo_nome: rows[0].cargo_nome,
    status: rows[0].status,
    solicitante_usuario_id: Number(rows[0].solicitante_usuario_id),
  };
}

export async function gravarDecisaoRequisicao(
  cliente: PoolClient,
  id: number,
  dados: {
    status: Extract<StatusRequisicao, "aprovada" | "reprovada">;
    decisor_usuario_id: number;
    motivo_decisao: string;
  }
): Promise<void> {
  await cliente.query(
    `UPDATE rh.requisicao_vaga
        SET status = $2, decisor_usuario_id = $3, decidido_em = now(),
            motivo_decisao = $4
      WHERE id = $1`,
    [id, dados.status, dados.decisor_usuario_id, dados.motivo_decisao]
  );
}

// ------------------------------------------------------------------ vaga

export interface VagaResumo {
  id: number;
  requisicao_id: number;
  titulo: string;
  cargo_nome: string;
  unidade: string | null;
  solicitante_usuario_id: number;
  /** Snapshot congelado da tabela vigente na criação (banda da oferta). */
  faixa_min: number;
  faixa_max: number;
  prazo_alvo: string;
  dias_ate_prazo: number;
  status: StatusVaga;
  candidaturas_ativas: number;
  criado_em: string;
  /** Modelo de processo CONGELADO na abertura (0077). O kanban desenha as
   *  colunas pelas etapas deste modelo, não pela lista global viva. */
  modelo_versao_id: number;
  /** Nome do modelo congelado — a tela mostra por qual processo a vaga corre. */
  modelo_nome: string;
}

interface LinhaVaga extends Record<string, unknown> {
  id: string;
  requisicao_id: string;
  titulo: string;
  cargo_nome: string;
  unidade: string | null;
  solicitante_usuario_id: string;
  faixa_min: string;
  faixa_max: string;
  prazo_alvo: string;
  dias_ate_prazo: number;
  status: StatusVaga;
  modelo_versao_id: string;
  modelo_nome: string;
  candidaturas_ativas: number;
  criado_em: string;
}

const SELECT_VAGA = `
  SELECT v.id, v.requisicao_id, v.titulo, v.status, v.criado_em,
         v.modelo_versao_id, m.nome AS modelo_nome,
         v.faixa_min::text AS faixa_min, v.faixa_max::text AS faixa_max,
         v.prazo_alvo::text AS prazo_alvo,
         (v.prazo_alvo - ${HOJE_SP})::int AS dias_ate_prazo,
         cv.nome AS cargo_nome, ev.unidade, r.solicitante_usuario_id,
         (SELECT COUNT(*) FROM rh.candidatura ca
           WHERE ca.vaga_id = v.id AND ca.status = 'ativa')::int
           AS candidaturas_ativas
    FROM rh.vaga v
    JOIN rh.requisicao_vaga r ON r.id = v.requisicao_id
    JOIN rh.cargo_versao cv ON cv.id = r.cargo_versao_id
    JOIN rh.modelo_selecao_versao m ON m.id = v.modelo_versao_id
    LEFT JOIN rh.estabelecimento_versao ev ON ev.id = r.estabelecimento_versao_id`;

function paraVaga(linha: LinhaVaga): VagaResumo {
  return {
    ...linha,
    id: Number(linha.id),
    requisicao_id: Number(linha.requisicao_id),
    solicitante_usuario_id: Number(linha.solicitante_usuario_id),
    faixa_min: Number(linha.faixa_min),
    faixa_max: Number(linha.faixa_max),
    modelo_versao_id: Number(linha.modelo_versao_id),
  };
}

export async function listarVagas(
  apenasDoSolicitante?: number
): Promise<VagaResumo[]> {
  const filtro =
    apenasDoSolicitante === undefined
      ? ""
      : "WHERE r.solicitante_usuario_id = $1";
  const linhas = await consultar<LinhaVaga>(
    `${SELECT_VAGA}
     ${filtro}
     ORDER BY (v.status = 'aberta') DESC, v.prazo_alvo, v.id`,
    apenasDoSolicitante === undefined ? [] : [apenasDoSolicitante]
  );
  return linhas.map(paraVaga);
}

export async function buscarVaga(id: number): Promise<VagaResumo | null> {
  const linhas = await consultar<LinhaVaga>(
    `${SELECT_VAGA}
     WHERE v.id = $1`,
    [id]
  );
  return linhas.length ? paraVaga(linhas[0]) : null;
}

export async function inserirVaga(
  cliente: PoolClient,
  dados: {
    requisicao_id: number;
    titulo: string;
    faixa_min: number;
    faixa_max: number;
    prazo_alvo: string;
    modelo_versao_id: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.vaga (requisicao_id, titulo, faixa_min, faixa_max, prazo_alvo, modelo_versao_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      dados.requisicao_id,
      dados.titulo,
      dados.faixa_min,
      dados.faixa_max,
      dados.prazo_alvo,
      dados.modelo_versao_id,
    ]
  );
  return Number(rows[0].id);
}

export interface VagaParaMutacao {
  id: number;
  titulo: string;
  status: StatusVaga;
  faixa_min: number;
  faixa_max: number;
  modelo_versao_id: number;
}

export async function buscarVagaParaMutacao(
  cliente: PoolClient,
  id: number
): Promise<VagaParaMutacao | null> {
  const { rows } = await cliente.query<{
    id: string;
    titulo: string;
    status: StatusVaga;
    faixa_min: string;
    faixa_max: string;
    modelo_versao_id: string;
  }>(
    `SELECT id, titulo, status,
            faixa_min::text AS faixa_min, faixa_max::text AS faixa_max,
            modelo_versao_id
       FROM rh.vaga
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    titulo: rows[0].titulo,
    status: rows[0].status,
    faixa_min: Number(rows[0].faixa_min),
    faixa_max: Number(rows[0].faixa_max),
    modelo_versao_id: Number(rows[0].modelo_versao_id),
  };
}

export async function atualizarStatusVaga(
  cliente: PoolClient,
  id: number,
  status: StatusVaga
): Promise<void> {
  await cliente.query("UPDATE rh.vaga SET status = $2 WHERE id = $1", [
    id,
    status,
  ]);
}

/**
 * TODAS as candidaturas da vaga, encerradas incluídas: candidatura encerrada
 * também é história ancorada nas etapas do modelo congelado — trocar o modelo
 * depois dela reescreveria por qual processo aquela pessoa passou.
 */
export async function contarCandidaturasDaVaga(
  cliente: PoolClient,
  vagaId: number
): Promise<number> {
  const { rows } = await cliente.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM rh.candidatura WHERE vaga_id = $1`,
    [vagaId]
  );
  return rows[0].total;
}

/** Troca o modelo congelado — o serviço garante vaga aberta sem candidatura. */
export async function atualizarModeloDaVaga(
  cliente: PoolClient,
  id: number,
  modeloVersaoId: number
): Promise<void> {
  await cliente.query(
    "UPDATE rh.vaga SET modelo_versao_id = $2 WHERE id = $1",
    [id, modeloVersaoId]
  );
}

// ------------------------------------------------------------------ candidato (titular externo)

export interface CandidatoResumo {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  origem: OrigemCandidato;
  consentido_ate: string | null;
  criado_em: string;
}

/** Sem CPF no payload de listagem — minimização (a chave fica no banco). */
export async function listarCandidatos(): Promise<CandidatoResumo[]> {
  const linhas = await consultar<{
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    origem: OrigemCandidato;
    consentido_ate: string | null;
    criado_em: string;
  }>(
    `SELECT id, nome, email, telefone, origem,
            consentido_ate::text AS consentido_ate, criado_em
       FROM rh.candidato
      ORDER BY criado_em DESC`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function inserirCandidato(
  cliente: PoolClient,
  dados: {
    nome: string;
    email: string;
    telefone: string | null;
    cpf: string | null;
    origem: OrigemCandidato;
    consentimento_lgpd: boolean;
    consentido_ate: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.candidato
       (nome, email, telefone, cpf, origem, consentimento_lgpd, consentido_ate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      dados.nome,
      dados.email,
      dados.telefone,
      dados.cpf,
      dados.origem,
      dados.consentimento_lgpd,
      dados.consentido_ate,
    ]
  );
  return Number(rows[0].id);
}

export async function buscarCandidatoBasico(
  cliente: PoolClient,
  id: number
): Promise<{ id: number; nome: string; email: string } | null> {
  const { rows } = await cliente.query<{
    id: string;
    nome: string;
    email: string;
  }>("SELECT id, nome, email FROM rh.candidato WHERE id = $1", [id]);
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

// ------------------------------------------------------------------ candidatura e movimentação

export interface CandidaturaKanban {
  id: number;
  candidato_id: number;
  candidato_nome: string;
  /** Contato — o serviço remove de quem não tem rs.ver. */
  candidato_email: string | null;
  candidato_telefone: string | null;
  etapa_atual_id: number;
  etapa_ordem: number;
  status: StatusCandidatura;
  motivo_desfecho: MotivoMovimentacao | null;
  total_pareceres: number;
  oferta_status: StatusOferta | null;
  /** Dado sensível (salário) — o serviço remove de quem não pode ver. */
  oferta_valor: number | null;
  oferta_dentro_banda: boolean | null;
  criado_em: string;
}

export async function listarCandidaturasDaVaga(
  vagaId: number
): Promise<CandidaturaKanban[]> {
  const linhas = await consultar<{
    id: string;
    candidato_id: string;
    candidato_nome: string;
    candidato_email: string;
    candidato_telefone: string | null;
    etapa_atual_id: string;
    etapa_ordem: number;
    status: StatusCandidatura;
    motivo_desfecho: MotivoMovimentacao | null;
    total_pareceres: number;
    oferta_status: StatusOferta | null;
    oferta_valor: string | null;
    oferta_dentro_banda: boolean | null;
    criado_em: string;
  }>(
    `SELECT ca.id, ca.candidato_id, ca.status, ca.criado_em,
            c.nome AS candidato_nome, c.email AS candidato_email,
            c.telefone AS candidato_telefone,
            ca.etapa_atual_id, e.ordem AS etapa_ordem,
            ultima.motivo_catalogo AS motivo_desfecho,
            (SELECT COUNT(*) FROM rh.parecer_selecao p
              WHERE p.candidatura_id = ca.id)::int AS total_pareceres,
            o.status AS oferta_status, o.valor::text AS oferta_valor,
            o.dentro_banda AS oferta_dentro_banda
       FROM rh.candidatura ca
       JOIN rh.candidato c ON c.id = ca.candidato_id
       JOIN rh.etapa_selecao_versao e ON e.id = ca.etapa_atual_id
       LEFT JOIN rh.oferta o ON o.candidatura_id = ca.id
       LEFT JOIN LATERAL (
         SELECT m.motivo_catalogo
           FROM rh.movimentacao_candidatura m
          WHERE m.candidatura_id = ca.id
          ORDER BY m.em DESC, m.id DESC
          LIMIT 1
       ) ultima ON TRUE
      WHERE ca.vaga_id = $1
      ORDER BY e.ordem, ca.criado_em, ca.id`,
    [vagaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    candidato_id: Number(linha.candidato_id),
    etapa_atual_id: Number(linha.etapa_atual_id),
    oferta_valor:
      linha.oferta_valor === null ? null : Number(linha.oferta_valor),
  }));
}

export async function inserirCandidatura(
  cliente: PoolClient,
  dados: { vaga_id: number; candidato_id: number; etapa_atual_id: number }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.candidatura (vaga_id, candidato_id, etapa_atual_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [dados.vaga_id, dados.candidato_id, dados.etapa_atual_id]
  );
  return Number(rows[0].id);
}

export interface CandidaturaParaMutacao {
  id: number;
  vaga_id: number;
  vaga_titulo: string;
  vaga_status: StatusVaga;
  faixa_min: number;
  faixa_max: number;
  solicitante_usuario_id: number;
  candidato_id: number;
  candidato_nome: string;
  candidato_email: string;
  status: StatusCandidatura;
  etapa_atual_id: number;
  etapa_nome: string;
  etapa_ordem: number;
  etapa_tipo: string;
  /** Modelo de processo congelado na vaga — por onde a candidatura anda (0077). */
  modelo_versao_id: number;
}

export async function buscarCandidaturaParaMutacao(
  cliente: PoolClient,
  id: number
): Promise<CandidaturaParaMutacao | null> {
  const { rows } = await cliente.query<{
    id: string;
    vaga_id: string;
    vaga_titulo: string;
    vaga_status: StatusVaga;
    faixa_min: string;
    faixa_max: string;
    solicitante_usuario_id: string;
    candidato_id: string;
    candidato_nome: string;
    candidato_email: string;
    status: StatusCandidatura;
    etapa_atual_id: string;
    etapa_nome: string;
    etapa_ordem: number;
    etapa_tipo: string;
    modelo_versao_id: string;
  }>(
    `SELECT ca.id, ca.vaga_id, ca.status, ca.etapa_atual_id, ca.candidato_id,
            v.titulo AS vaga_titulo, v.status AS vaga_status,
            v.faixa_min::text AS faixa_min, v.faixa_max::text AS faixa_max,
            v.modelo_versao_id,
            r.solicitante_usuario_id,
            c.nome AS candidato_nome, c.email AS candidato_email,
            e.nome AS etapa_nome, e.ordem AS etapa_ordem, e.tipo AS etapa_tipo
       FROM rh.candidatura ca
       JOIN rh.vaga v ON v.id = ca.vaga_id
       JOIN rh.requisicao_vaga r ON r.id = v.requisicao_id
       JOIN rh.candidato c ON c.id = ca.candidato_id
       JOIN rh.etapa_selecao_versao e ON e.id = ca.etapa_atual_id
      WHERE ca.id = $1
      FOR UPDATE OF ca`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    vaga_id: Number(rows[0].vaga_id),
    faixa_min: Number(rows[0].faixa_min),
    faixa_max: Number(rows[0].faixa_max),
    solicitante_usuario_id: Number(rows[0].solicitante_usuario_id),
    candidato_id: Number(rows[0].candidato_id),
    etapa_atual_id: Number(rows[0].etapa_atual_id),
    modelo_versao_id: Number(rows[0].modelo_versao_id),
  };
}

export interface CandidaturaBasica {
  id: number;
  vaga_id: number;
  candidato_nome: string;
  status: StatusCandidatura;
  solicitante_usuario_id: number;
}

/** Leitura fora de transação — checagem de escopo antes de listar pareceres. */
export async function buscarCandidaturaBasica(
  id: number
): Promise<CandidaturaBasica | null> {
  const linhas = await consultar<{
    id: string;
    vaga_id: string;
    candidato_nome: string;
    status: StatusCandidatura;
    solicitante_usuario_id: string;
  }>(
    `SELECT ca.id, ca.vaga_id, ca.status, c.nome AS candidato_nome,
            r.solicitante_usuario_id
       FROM rh.candidatura ca
       JOIN rh.candidato c ON c.id = ca.candidato_id
       JOIN rh.vaga v ON v.id = ca.vaga_id
       JOIN rh.requisicao_vaga r ON r.id = v.requisicao_id
      WHERE ca.id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    vaga_id: Number(linhas[0].vaga_id),
    candidato_nome: linhas[0].candidato_nome,
    status: linhas[0].status,
    solicitante_usuario_id: Number(linhas[0].solicitante_usuario_id),
  };
}

export async function atualizarCandidatura(
  cliente: PoolClient,
  id: number,
  campos: { etapa_atual_id?: number; status?: StatusCandidatura }
): Promise<void> {
  if (campos.etapa_atual_id !== undefined && campos.status !== undefined) {
    await cliente.query(
      "UPDATE rh.candidatura SET etapa_atual_id = $2, status = $3 WHERE id = $1",
      [id, campos.etapa_atual_id, campos.status]
    );
    return;
  }
  if (campos.etapa_atual_id !== undefined) {
    await cliente.query(
      "UPDATE rh.candidatura SET etapa_atual_id = $2 WHERE id = $1",
      [id, campos.etapa_atual_id]
    );
    return;
  }
  if (campos.status !== undefined) {
    await cliente.query(
      "UPDATE rh.candidatura SET status = $2 WHERE id = $1",
      [id, campos.status]
    );
  }
}

/** Histórico oficial do pipeline — append-only, nunca UPDATE/DELETE. */
export async function inserirMovimentacao(
  cliente: PoolClient,
  dados: {
    candidatura_id: number;
    de_etapa_id: number | null;
    para_etapa_id: number | null;
    novo_status: StatusCandidatura | null;
    motivo_catalogo: MotivoMovimentacao | null;
    observacao: string | null;
    por_usuario_id: number;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.movimentacao_candidatura
       (candidatura_id, de_etapa_id, para_etapa_id, novo_status,
        motivo_catalogo, observacao, por_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      dados.candidatura_id,
      dados.de_etapa_id,
      dados.para_etapa_id,
      dados.novo_status,
      dados.motivo_catalogo,
      dados.observacao,
      dados.por_usuario_id,
    ]
  );
}

// ------------------------------------------------------------------ parecer (restrito)

export interface ParecerSelecao {
  id: number;
  etapa_nome: string;
  avaliador_usuario_id: number;
  avaliador_nome: string;
  recomendacao: RecomendacaoParecer;
  observacoes: string;
  em: string;
}

/**
 * Todos os pareceres (rs.parecer.ver) ou apenas os do próprio avaliador —
 * gestor registra mas não vê os dos outros.
 */
export async function listarPareceres(
  candidaturaId: number,
  escopo: { todos: true } | { todos: false; avaliadorUsuarioId: number }
): Promise<ParecerSelecao[]> {
  const parametros: unknown[] = [candidaturaId];
  let filtro = "";
  if (!escopo.todos) {
    parametros.push(escopo.avaliadorUsuarioId);
    filtro = "AND p.avaliador_usuario_id = $2";
  }
  const linhas = await consultar<{
    id: string;
    etapa_nome: string;
    avaliador_usuario_id: string;
    avaliador_nome: string;
    recomendacao: RecomendacaoParecer;
    observacoes: string;
    em: string;
  }>(
    `SELECT p.id, e.nome AS etapa_nome, p.avaliador_usuario_id,
            u.nome AS avaliador_nome, p.recomendacao, p.observacoes, p.em
       FROM rh.parecer_selecao p
       JOIN rh.etapa_selecao_versao e ON e.id = p.etapa_id
       JOIN sistema.usuario u ON u.id = p.avaliador_usuario_id
      WHERE p.candidatura_id = $1 ${filtro}
      ORDER BY p.em DESC, p.id DESC`,
    parametros
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    avaliador_usuario_id: Number(linha.avaliador_usuario_id),
  }));
}

export async function inserirParecer(
  cliente: PoolClient,
  dados: {
    candidatura_id: number;
    etapa_id: number;
    avaliador_usuario_id: number;
    recomendacao: RecomendacaoParecer;
    observacoes: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.parecer_selecao
       (candidatura_id, etapa_id, avaliador_usuario_id, recomendacao, observacoes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.candidatura_id,
      dados.etapa_id,
      dados.avaliador_usuario_id,
      dados.recomendacao,
      dados.observacoes,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ oferta

export interface OfertaParaMutacao {
  id: number;
  candidatura_id: number;
  valor: number;
  dentro_banda: boolean;
  status: StatusOferta;
}

export async function buscarOfertaParaMutacao(
  cliente: PoolClient,
  candidaturaId: number
): Promise<OfertaParaMutacao | null> {
  const { rows } = await cliente.query<{
    id: string;
    candidatura_id: string;
    valor: string;
    dentro_banda: boolean;
    status: StatusOferta;
  }>(
    `SELECT id, candidatura_id, valor::text AS valor, dentro_banda, status
       FROM rh.oferta
      WHERE candidatura_id = $1
      FOR UPDATE`,
    [candidaturaId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    candidatura_id: Number(rows[0].candidatura_id),
    valor: Number(rows[0].valor),
  };
}

export async function inserirOferta(
  cliente: PoolClient,
  dados: {
    candidatura_id: number;
    valor: number;
    dentro_banda: boolean;
    aprovacao_fora_banda: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.oferta (candidatura_id, valor, dentro_banda, aprovacao_fora_banda)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      dados.candidatura_id,
      dados.valor,
      dados.dentro_banda,
      dados.aprovacao_fora_banda,
    ]
  );
  return Number(rows[0].id);
}

export async function responderOferta(
  cliente: PoolClient,
  id: number,
  status: Extract<StatusOferta, "aceita" | "recusada">
): Promise<void> {
  await cliente.query(
    "UPDATE rh.oferta SET status = $2, respondida_em = now() WHERE id = $1",
    [id, status]
  );
}

// ------------------------------------------------------------------ indicador

/**
 * % de vagas fechadas até o prazo_alvo nos últimos 12 meses. A data de
 * fechamento é o atualizado_em da vaga fechada — vaga fechada não sofre mais
 * mutação no serviço, então o carimbo permanece o do fechamento. NULL quando
 * não há vagas fechadas na janela.
 */
export async function apurarVagasNoPrazo(): Promise<number | null> {
  const linhas = await consultar<{ no_prazo: string; total: string }>(
    `SELECT COUNT(*) FILTER (
              WHERE (atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
                    <= prazo_alvo) AS no_prazo,
            COUNT(*) AS total
       FROM rh.vaga
      WHERE status = 'fechada'
        AND atualizado_em >= now() - INTERVAL '12 months'`
  );
  const total = Number(linhas[0].total);
  if (total === 0) return null;
  return Math.round((Number(linhas[0].no_prazo) / total) * 1000) / 10;
}
