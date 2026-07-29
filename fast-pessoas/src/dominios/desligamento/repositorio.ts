import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  CategoriaItem,
  EstadoProcesso,
  Iniciativa,
  ModalidadeAviso,
  PerguntaRoteiro,
  Respostas,
  ResultadoEstabilidade,
  StatusEntrevista,
  StatusItem,
  TipoEstabilidade,
} from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// ------------------------------------------------------------------ apoio

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

export async function registrarLeituraSensivel(entrada: {
  usuarioId: number;
  chavePermissao: string;
  recurso: string;
  registroId: string;
}): Promise<void> {
  await consultar(
    `INSERT INTO audit.leitura_sensivel (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [
      entrada.usuarioId,
      entrada.chavePermissao,
      entrada.recurso,
      entrada.registroId,
    ]
  );
}

// ------------------------------------------------------------------ tipos de desligamento (versões vigentes)

export interface TipoDesligamentoAtivo {
  id: number;
  tipo: string;
  nome: string;
  exige_aviso: boolean;
  admite_indenizado: boolean;
  direito_manutencao_plano: boolean;
  elegivel_entrevista: boolean;
}

interface LinhaTipo extends Record<string, unknown> {
  id: string;
  tipo: string;
  nome: string;
  exige_aviso: boolean;
  admite_indenizado: boolean;
  direito_manutencao_plano: boolean;
  elegivel_entrevista: boolean;
}

const SELECT_TIPO = `
  SELECT id, tipo, nome, exige_aviso, admite_indenizado,
         direito_manutencao_plano, elegivel_entrevista
    FROM rh.tipo_desligamento_versao`;

export async function tiposAtivos(): Promise<TipoDesligamentoAtivo[]> {
  const linhas = await consultar<LinhaTipo>(
    `${SELECT_TIPO} WHERE status = 'ativa' ORDER BY nome`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarTipoAtivo(
  cliente: PoolClient,
  versaoId: number
): Promise<TipoDesligamentoAtivo | null> {
  const { rows } = await cliente.query<LinhaTipo>(
    `${SELECT_TIPO} WHERE id = $1 AND status = 'ativa'`,
    [versaoId]
  );
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

// ------------------------------------------------------------------ colaboradores elegíveis (wizard)

export interface ColaboradorElegivel {
  id: number;
  matricula: string;
  nome_completo: string;
}

/** Ativos sem processo de desligamento aberto — os únicos que o wizard aceita. */
export async function colaboradoresElegiveis(): Promise<ColaboradorElegivel[]> {
  const linhas = await consultar<{
    id: string;
    matricula: string;
    nome_completo: string;
  }>(
    `SELECT c.id, c.matricula, c.nome_completo
       FROM rh.colaborador c
      WHERE c.status = 'ativo'
        AND NOT EXISTS (
              SELECT 1 FROM rh.processo_desligamento p
               WHERE p.colaborador_id = c.id
                 AND p.estado NOT IN ('encerrado','cancelado'))
      ORDER BY c.nome_completo, c.id`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarColaboradorBasico(
  cliente: PoolClient,
  id: number
): Promise<{
  id: number;
  matricula: string;
  nome_completo: string;
  status: string;
} | null> {
  const { rows } = await cliente.query<{
    id: string;
    matricula: string;
    nome_completo: string;
    status: string;
  }>(
    `SELECT id, matricula, nome_completo, status
       FROM rh.colaborador WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

export async function existeProcessoAberto(
  cliente: PoolClient,
  colaboradorId: number
): Promise<boolean> {
  const { rows } = await cliente.query<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM rh.processo_desligamento
        WHERE colaborador_id = $1 AND estado NOT IN ('encerrado','cancelado')
     ) AS existe`,
    [colaboradorId]
  );
  return rows[0].existe;
}

/**
 * Verificação automática do art. 118: afastamento por acidente de trabalho
 * tocando os últimos 12 meses (em curso ou com fim dentro da janela).
 * Consulta direta em rh.afastamento — nunca o conteúdo de saúde, só o fato.
 */
export async function temAfastamentoAcidentario12m(
  colaboradorId: number,
  cliente?: PoolClient
): Promise<boolean> {
  const sql = `SELECT EXISTS (
       SELECT 1 FROM rh.afastamento a
        WHERE a.colaborador_id = $1
          AND a.tipo = 'acidente_trabalho'
          AND a.inicio <= ${HOJE_SP}
          AND (a.fim IS NULL OR a.fim >= ${HOJE_SP} - INTERVAL '12 months')
     ) AS existe`;
  if (cliente) {
    const { rows } = await cliente.query<{ existe: boolean }>(sql, [
      colaboradorId,
    ]);
    return rows[0].existe;
  }
  const linhas = await consultar<{ existe: boolean }>(sql, [colaboradorId]);
  return linhas[0].existe;
}

// ------------------------------------------------------------------ processo

export interface ProcessoResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_matricula: string;
  tipo: string;
  tipo_nome: string;
  exige_aviso: boolean;
  admite_indenizado: boolean;
  direito_manutencao_plano: boolean;
  elegivel_entrevista: boolean;
  iniciativa: Iniciativa;
  modalidade_aviso: ModalidadeAviso;
  estado: EstadoProcesso;
  data_comunicacao: string;
  data_projetada_termino: string;
  data_termino_efetiva: string | null;
  data_limite_477: string;
  dias_ate_477: number;
  entrevista_status: StatusEntrevista | null;
  itens_pendentes: number;
  aberto_por_nome: string;
  criado_em: string;
}

interface LinhaProcesso extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  colaborador_matricula: string;
  tipo: string;
  tipo_nome: string;
  exige_aviso: boolean;
  admite_indenizado: boolean;
  direito_manutencao_plano: boolean;
  elegivel_entrevista: boolean;
  iniciativa: Iniciativa;
  modalidade_aviso: ModalidadeAviso;
  estado: EstadoProcesso;
  data_comunicacao: string;
  data_projetada_termino: string;
  data_termino_efetiva: string | null;
  data_limite_477: string;
  dias_ate_477: number;
  entrevista_status: StatusEntrevista | null;
  itens_pendentes: number;
  aberto_por_nome: string;
  criado_em: string;
}

// SEM a coluna motivo: o dado restrito só sai por buscarMotivo (leitura logada).
const SELECT_PROCESSO = `
  SELECT p.id, p.colaborador_id,
         c.nome_completo AS colaborador_nome, c.matricula AS colaborador_matricula,
         t.tipo, t.nome AS tipo_nome, t.exige_aviso, t.admite_indenizado,
         t.direito_manutencao_plano, t.elegivel_entrevista,
         p.iniciativa, p.modalidade_aviso, p.estado,
         p.data_comunicacao::text AS data_comunicacao,
         p.data_projetada_termino::text AS data_projetada_termino,
         p.data_termino_efetiva::text AS data_termino_efetiva,
         p.data_limite_477::text AS data_limite_477,
         (p.data_limite_477 - ${HOJE_SP})::int AS dias_ate_477,
         e.status AS entrevista_status,
         (SELECT COUNT(*)::int FROM rh.item_devolucao i
           WHERE i.processo_id = p.id AND i.status = 'pendente') AS itens_pendentes,
         u.nome AS aberto_por_nome, p.criado_em
    FROM rh.processo_desligamento p
    JOIN rh.colaborador c ON c.id = p.colaborador_id
    JOIN rh.tipo_desligamento_versao t ON t.id = p.tipo_desligamento_versao_id
    JOIN sistema.usuario u ON u.id = p.aberto_por_usuario_id
    LEFT JOIN rh.entrevista_desligamento e ON e.processo_id = p.id`;

function paraProcesso(linha: LinhaProcesso): ProcessoResumo {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
  };
}

export async function listarProcessos(): Promise<ProcessoResumo[]> {
  const linhas = await consultar<LinhaProcesso>(
    `${SELECT_PROCESSO}
     ORDER BY (p.estado IN ('encerrado','cancelado')), p.data_limite_477, p.id`
  );
  return linhas.map(paraProcesso);
}

export async function buscarResumo(
  id: number
): Promise<ProcessoResumo | null> {
  const linhas = await consultar<LinhaProcesso>(
    `${SELECT_PROCESSO} WHERE p.id = $1`,
    [id]
  );
  return linhas.length ? paraProcesso(linhas[0]) : null;
}

/** Dado RESTRITO — só chamar após conferir desligamento.motivo.ver + trilha. */
export async function buscarMotivo(id: number): Promise<string | null> {
  const linhas = await consultar<{ motivo: string | null }>(
    "SELECT motivo FROM rh.processo_desligamento WHERE id = $1",
    [id]
  );
  return linhas.length ? linhas[0].motivo : null;
}

export interface ProcessoParaTransicao {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_matricula: string;
  tipo_nome: string;
  elegivel_entrevista: boolean;
  estado: EstadoProcesso;
  data_projetada_termino: string;
}

export async function buscarParaTransicao(
  cliente: PoolClient,
  id: number
): Promise<ProcessoParaTransicao | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    colaborador_matricula: string;
    tipo_nome: string;
    elegivel_entrevista: boolean;
    estado: EstadoProcesso;
    data_projetada_termino: string;
  }>(
    `SELECT p.id, p.colaborador_id,
            c.nome_completo AS colaborador_nome,
            c.matricula AS colaborador_matricula,
            t.nome AS tipo_nome, t.elegivel_entrevista, p.estado,
            p.data_projetada_termino::text AS data_projetada_termino
       FROM rh.processo_desligamento p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
       JOIN rh.tipo_desligamento_versao t ON t.id = p.tipo_desligamento_versao_id
      WHERE p.id = $1
      FOR UPDATE OF p`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    colaborador_id: Number(rows[0].colaborador_id),
  };
}

export async function inserirProcesso(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    tipo_desligamento_versao_id: number;
    iniciativa: Iniciativa;
    data_comunicacao: string;
    modalidade_aviso: ModalidadeAviso;
    data_projetada_termino: string;
    motivo: string | null;
    aberto_por_usuario_id: number;
  }
): Promise<{ id: number; data_limite_477: string }> {
  // Art. 477 §6º: 10 dias corridos a partir do término (projetado na abertura).
  const { rows } = await cliente.query<{
    id: string;
    data_limite_477: string;
  }>(
    `INSERT INTO rh.processo_desligamento
       (colaborador_id, tipo_desligamento_versao_id, iniciativa,
        data_comunicacao, modalidade_aviso, data_projetada_termino,
        data_limite_477, motivo, aberto_por_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $6::date + 10, $7, $8)
     RETURNING id, data_limite_477::text AS data_limite_477`,
    [
      dados.colaborador_id,
      dados.tipo_desligamento_versao_id,
      dados.iniciativa,
      dados.data_comunicacao,
      dados.modalidade_aviso,
      dados.data_projetada_termino,
      dados.motivo,
      dados.aberto_por_usuario_id,
    ]
  );
  return {
    id: Number(rows[0].id),
    data_limite_477: rows[0].data_limite_477,
  };
}

export async function atualizarEstado(
  cliente: PoolClient,
  id: number,
  estado: EstadoProcesso
): Promise<void> {
  await cliente.query(
    "UPDATE rh.processo_desligamento SET estado = $2 WHERE id = $1",
    [id, estado]
  );
}

/** Estado + data efetiva no MESMO UPDATE (CHECK do banco exige os dois juntos). */
export async function encerrarProcesso(
  cliente: PoolClient,
  id: number,
  dataTerminoEfetiva: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.processo_desligamento
        SET estado = 'encerrado', data_termino_efetiva = $2
      WHERE id = $1`,
    [id, dataTerminoEfetiva]
  );
}

// ------------------------------------------------------------------ verificação de estabilidades (append-only)

export interface VerificacaoEstabilidade {
  id: number;
  tipo: TipoEstabilidade;
  resultado: ResultadoEstabilidade;
  origem: "declaracao" | "afastamento";
  justificativa: string | null;
  decisor_nome: string;
  em: string;
}

export async function listarVerificacoes(
  processoId: number
): Promise<VerificacaoEstabilidade[]> {
  const linhas = await consultar<{
    id: string;
    tipo: TipoEstabilidade;
    resultado: ResultadoEstabilidade;
    origem: "declaracao" | "afastamento";
    justificativa: string | null;
    decisor_nome: string;
    em: string;
  }>(
    `SELECT v.id, v.tipo, v.resultado, v.origem, v.justificativa,
            u.nome AS decisor_nome, v.em
       FROM rh.verificacao_estabilidade v
       JOIN sistema.usuario u ON u.id = v.decisor_usuario_id
      WHERE v.processo_id = $1
      ORDER BY v.em, v.id`,
    [processoId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function inserirVerificacao(
  cliente: PoolClient,
  dados: {
    processo_id: number;
    tipo: TipoEstabilidade;
    resultado: ResultadoEstabilidade;
    origem: "declaracao" | "afastamento";
    justificativa: string | null;
    decisor_usuario_id: number;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.verificacao_estabilidade
       (processo_id, tipo, resultado, origem, justificativa, decisor_usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      dados.processo_id,
      dados.tipo,
      dados.resultado,
      dados.origem,
      dados.justificativa,
      dados.decisor_usuario_id,
    ]
  );
}

// ------------------------------------------------------------------ itens de devolução

export interface ItemDevolucao {
  id: number;
  categoria: CategoriaItem;
  descricao: string;
  status: StatusItem;
  criado_em: string;
  atualizado_em: string;
}

export async function listarItens(
  processoId: number
): Promise<ItemDevolucao[]> {
  const linhas = await consultar<{
    id: string;
    categoria: CategoriaItem;
    descricao: string;
    status: StatusItem;
    criado_em: string;
    atualizado_em: string;
  }>(
    `SELECT id, categoria, descricao, status, criado_em, atualizado_em
       FROM rh.item_devolucao
      WHERE processo_id = $1
      ORDER BY (status = 'pendente') DESC, id`,
    [processoId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function inserirItem(
  cliente: PoolClient,
  dados: { processo_id: number; categoria: CategoriaItem; descricao: string }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.item_devolucao (processo_id, categoria, descricao)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [dados.processo_id, dados.categoria, dados.descricao]
  );
  return Number(rows[0].id);
}

export async function buscarItemParaAtualizar(
  cliente: PoolClient,
  processoId: number,
  itemId: number
): Promise<ItemDevolucao | null> {
  const { rows } = await cliente.query<{
    id: string;
    categoria: CategoriaItem;
    descricao: string;
    status: StatusItem;
    criado_em: string;
    atualizado_em: string;
  }>(
    `SELECT id, categoria, descricao, status, criado_em, atualizado_em
       FROM rh.item_devolucao
      WHERE id = $1 AND processo_id = $2
      FOR UPDATE`,
    [itemId, processoId]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

export async function atualizarStatusItem(
  cliente: PoolClient,
  itemId: number,
  status: StatusItem
): Promise<void> {
  await cliente.query(
    "UPDATE rh.item_devolucao SET status = $2 WHERE id = $1",
    [itemId, status]
  );
}

// ------------------------------------------------------------------ roteiro de entrevista

export interface RoteiroAtivo {
  id: number;
  versao: number;
  nome: string;
  perguntas: PerguntaRoteiro[];
}

export async function buscarRoteiroAtivo(
  cliente: PoolClient
): Promise<RoteiroAtivo | null> {
  const { rows } = await cliente.query<{
    id: string;
    versao: number;
    nome: string;
    perguntas: PerguntaRoteiro[];
  }>(
    `SELECT id, versao, nome, perguntas
       FROM rh.roteiro_entrevista_versao
      WHERE status = 'ativa'`
  );
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

// ------------------------------------------------------------------ entrevista de desligamento

// SEM a coluna respostas: o dado restrito só sai por buscarRespostas.
export interface EntrevistaResumo {
  id: number;
  processo_id: number;
  roteiro_versao_id: number;
  roteiro_nome: string;
  perguntas: PerguntaRoteiro[];
  status: StatusEntrevista;
  data_oferta: string;
  data_agendada: string | null;
  data_realizacao: string | null;
  motivo_nao_realizacao: string | null;
  elegivel_indicador: boolean;
  entrevistador_nome: string | null;
  consentimento_uso_agregado: boolean;
}

interface LinhaEntrevista extends Record<string, unknown> {
  id: string;
  processo_id: string;
  roteiro_versao_id: string;
  roteiro_nome: string;
  perguntas: PerguntaRoteiro[];
  status: StatusEntrevista;
  data_oferta: string;
  data_agendada: string | null;
  data_realizacao: string | null;
  motivo_nao_realizacao: string | null;
  elegivel_indicador: boolean;
  entrevistador_nome: string | null;
  consentimento_uso_agregado: boolean;
}

const SELECT_ENTREVISTA = `
  SELECT e.id, e.processo_id, e.roteiro_versao_id,
         r.nome AS roteiro_nome, r.perguntas,
         e.status, e.data_oferta::text AS data_oferta,
         e.data_agendada::text AS data_agendada,
         e.data_realizacao::text AS data_realizacao,
         e.motivo_nao_realizacao, e.elegivel_indicador,
         u.nome AS entrevistador_nome, e.consentimento_uso_agregado
    FROM rh.entrevista_desligamento e
    JOIN rh.roteiro_entrevista_versao r ON r.id = e.roteiro_versao_id
    LEFT JOIN sistema.usuario u ON u.id = e.entrevistador_usuario_id`;

function paraEntrevista(linha: LinhaEntrevista): EntrevistaResumo {
  return {
    ...linha,
    id: Number(linha.id),
    processo_id: Number(linha.processo_id),
    roteiro_versao_id: Number(linha.roteiro_versao_id),
  };
}

export async function buscarEntrevista(
  processoId: number
): Promise<EntrevistaResumo | null> {
  const linhas = await consultar<LinhaEntrevista>(
    `${SELECT_ENTREVISTA} WHERE e.processo_id = $1`,
    [processoId]
  );
  return linhas.length ? paraEntrevista(linhas[0]) : null;
}

export async function buscarEntrevistaParaTransicao(
  cliente: PoolClient,
  processoId: number
): Promise<{
  id: number;
  roteiro_versao_id: number;
  status: StatusEntrevista;
} | null> {
  const { rows } = await cliente.query<{
    id: string;
    roteiro_versao_id: string;
    status: StatusEntrevista;
  }>(
    `SELECT id, roteiro_versao_id, status
       FROM rh.entrevista_desligamento
      WHERE processo_id = $1
      FOR UPDATE`,
    [processoId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    roteiro_versao_id: Number(rows[0].roteiro_versao_id),
    status: rows[0].status,
  };
}

export async function buscarPerguntasDoRoteiro(
  cliente: PoolClient,
  roteiroVersaoId: number
): Promise<PerguntaRoteiro[]> {
  const { rows } = await cliente.query<{ perguntas: PerguntaRoteiro[] }>(
    "SELECT perguntas FROM rh.roteiro_entrevista_versao WHERE id = $1",
    [roteiroVersaoId]
  );
  return rows.length ? rows[0].perguntas : [];
}

export async function inserirEntrevista(
  cliente: PoolClient,
  dados: {
    processo_id: number;
    roteiro_versao_id: number;
    elegivel_indicador: boolean;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.entrevista_desligamento
       (processo_id, roteiro_versao_id, status, data_oferta, elegivel_indicador)
     VALUES ($1, $2, 'oferecida', ${HOJE_SP}, $3)
     RETURNING id`,
    [dados.processo_id, dados.roteiro_versao_id, dados.elegivel_indicador]
  );
  return Number(rows[0].id);
}

export async function agendarEntrevista(
  cliente: PoolClient,
  entrevistaId: number,
  dataAgendada: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.entrevista_desligamento
        SET status = 'agendada', data_agendada = $2
      WHERE id = $1`,
    [entrevistaId, dataAgendada]
  );
}

export async function registrarEntrevistaRealizada(
  cliente: PoolClient,
  entrevistaId: number,
  dados: {
    data_realizacao: string;
    respostas: Respostas;
    entrevistador_usuario_id: number;
    consentimento_uso_agregado: boolean;
  }
): Promise<void> {
  await cliente.query(
    `UPDATE rh.entrevista_desligamento
        SET status = 'realizada', data_realizacao = $2, respostas = $3,
            entrevistador_usuario_id = $4, consentimento_uso_agregado = $5
      WHERE id = $1`,
    [
      entrevistaId,
      dados.data_realizacao,
      JSON.stringify(dados.respostas),
      dados.entrevistador_usuario_id,
      dados.consentimento_uso_agregado,
    ]
  );
}

export async function recusarEntrevista(
  cliente: PoolClient,
  entrevistaId: number
): Promise<void> {
  await cliente.query(
    `UPDATE rh.entrevista_desligamento SET status = 'recusada' WHERE id = $1`,
    [entrevistaId]
  );
}

export async function registrarEntrevistaNaoRealizada(
  cliente: PoolClient,
  entrevistaId: number,
  motivo: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.entrevista_desligamento
        SET status = 'nao_realizada', motivo_nao_realizacao = $2
      WHERE id = $1`,
    [entrevistaId, motivo]
  );
}

/** Dado RESTRITO — só chamar após conferir entrevista.respostas.ver + trilha. */
export async function buscarRespostas(processoId: number): Promise<{
  entrevista_id: number;
  status: StatusEntrevista;
  respostas: Respostas | null;
  perguntas: PerguntaRoteiro[];
} | null> {
  const linhas = await consultar<{
    entrevista_id: string;
    status: StatusEntrevista;
    respostas: Respostas | null;
    perguntas: PerguntaRoteiro[];
  }>(
    `SELECT e.id AS entrevista_id, e.status, e.respostas, r.perguntas
       FROM rh.entrevista_desligamento e
       JOIN rh.roteiro_entrevista_versao r ON r.id = e.roteiro_versao_id
      WHERE e.processo_id = $1`,
    [processoId]
  );
  if (linhas.length === 0) return null;
  return { ...linhas[0], entrevista_id: Number(linhas[0].entrevista_id) };
}

/** O usuário é gestor vigente do colaborador? (entrevista nunca é do gestor.) */
export async function ehGestorDoColaborador(
  cliente: PoolClient,
  usuarioId: number,
  colaboradorId: number
): Promise<boolean> {
  const { rows } = await cliente.query<{ eh_gestor: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM rh.relacao_gestor rg
         JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
        WHERE rg.liderado_colaborador_id = $2
          AND rg.fim_vigencia IS NULL
          AND g.usuario_id = $1
     ) AS eh_gestor`,
    [usuarioId, colaboradorId]
  );
  return rows[0].eh_gestor;
}

// ------------------------------------------------------------------ indicador oficial de cobertura

export interface IndicadorEntrevistas {
  realizadas: number;
  elegiveis: number;
  percentual: number | null;
}

/**
 * % de entrevistas realizadas nos processos ENCERRADOS dos últimos 12 meses.
 * Usa APENAS status — nunca o conteúdo das respostas (dado restrito).
 * Denominador: entrevistas com elegivel_indicador (congelado na oferta).
 */
export async function indicadorEntrevistas(): Promise<IndicadorEntrevistas> {
  const linhas = await consultar<{ realizadas: string; elegiveis: string }>(
    `SELECT COUNT(*) FILTER (WHERE e.status = 'realizada') AS realizadas,
            COUNT(*) AS elegiveis
       FROM rh.processo_desligamento p
       JOIN rh.entrevista_desligamento e ON e.processo_id = p.id
      WHERE p.estado = 'encerrado'
        AND e.elegivel_indicador
        AND p.data_termino_efetiva >= ${HOJE_SP} - INTERVAL '12 months'`
  );
  const realizadas = Number(linhas[0].realizadas);
  const elegiveis = Number(linhas[0].elegiveis);
  return {
    realizadas,
    elegiveis,
    percentual:
      elegiveis > 0 ? Math.round((realizadas / elegiveis) * 1000) / 10 : null,
  };
}
