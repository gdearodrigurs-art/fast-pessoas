import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { EstadoProcesso, StatusItem } from "./esquemas";

export interface ItemChecklistTemplate {
  ordem: number;
  descricao: string;
  obrigatorio: boolean;
}

export interface ChecklistAtivo {
  id: number;
  versao: number;
  itens: ItemChecklistTemplate[];
}

export interface CandidatoAdmissao {
  id: number;
  nome_completo: string;
  matricula: string;
  data_admissao: string;
}

export interface ProcessoResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data_admissao: string;
  data_inicio_prevista: string;
  dias_ate_inicio: number;
  estado: EstadoProcesso;
  contrato_experiencia: boolean;
  prazo_experiencia_1: string | null;
  prazo_experiencia_2: string | null;
  dias_prazo_1: number | null;
  dias_prazo_2: number | null;
  checklist_versao: number;
  total_itens: number;
  itens_resolvidos: number;
  obrigatorios_pendentes: number;
  criado_em: string;
  atualizado_em: string;
}

export interface ItemProcesso {
  id: number;
  ordem: number;
  descricao: string;
  obrigatorio: boolean;
  status: StatusItem;
  concluido_por_nome: string | null;
  concluido_em: string | null;
}

export interface ProcessoParaMutacao {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  estado: EstadoProcesso;
  data_inicio_prevista: string;
  checklist_versao: number;
}

export interface ItemParaMutacao {
  id: number;
  descricao: string;
  obrigatorio: boolean;
  status: StatusItem;
}

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

const SELECT_RESUMO = `
  SELECT p.id, p.colaborador_id, p.estado, p.contrato_experiencia,
         p.data_inicio_prevista::text AS data_inicio_prevista,
         (p.data_inicio_prevista - ${HOJE_SP})::int AS dias_ate_inicio,
         p.prazo_experiencia_1::text AS prazo_experiencia_1,
         p.prazo_experiencia_2::text AS prazo_experiencia_2,
         (p.prazo_experiencia_1 - ${HOJE_SP})::int AS dias_prazo_1,
         (p.prazo_experiencia_2 - ${HOJE_SP})::int AS dias_prazo_2,
         p.criado_em, p.atualizado_em,
         c.nome_completo AS colaborador_nome, c.matricula,
         c.data_admissao::text AS data_admissao,
         v.versao AS checklist_versao,
         (SELECT COUNT(*) FROM rh.item_admissao i
           WHERE i.processo_id = p.id)::int AS total_itens,
         (SELECT COUNT(*) FROM rh.item_admissao i
           WHERE i.processo_id = p.id
             AND i.status <> 'pendente')::int AS itens_resolvidos,
         (SELECT COUNT(*) FROM rh.item_admissao i
           WHERE i.processo_id = p.id
             AND i.obrigatorio
             AND i.status = 'pendente')::int AS obrigatorios_pendentes
    FROM rh.processo_admissao p
    JOIN rh.colaborador c ON c.id = p.colaborador_id
    JOIN rh.checklist_admissao_versao v ON v.id = p.checklist_versao_id`;

// Gestor vigente do colaborador do processo (rh.relacao_gestor sem fim de vigência).
const FRAGMENTO_GESTOR = `EXISTS (
  SELECT 1
    FROM rh.relacao_gestor rg
    JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
   WHERE rg.liderado_colaborador_id = p.colaborador_id
     AND rg.fim_vigencia IS NULL
     AND rg.inicio_vigencia <= ${HOJE_SP}
     AND gc.usuario_id = $1)`;

interface LinhaResumo extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  estado: EstadoProcesso;
  contrato_experiencia: boolean;
  data_inicio_prevista: string;
  dias_ate_inicio: number;
  prazo_experiencia_1: string | null;
  prazo_experiencia_2: string | null;
  dias_prazo_1: number | null;
  dias_prazo_2: number | null;
  criado_em: string;
  atualizado_em: string;
  colaborador_nome: string;
  matricula: string;
  data_admissao: string;
  checklist_versao: number;
  total_itens: number;
  itens_resolvidos: number;
  obrigatorios_pendentes: number;
}

function paraResumo(linha: LinhaResumo): ProcessoResumo {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
  };
}

// ------------------------------------------------------------------ checklist vigente

/**
 * Versão ativa do checklist — buscada DENTRO da transação de abertura para
 * congelar (pinar) a versão no processo.
 */
export async function buscarChecklistAtivo(
  cliente: PoolClient
): Promise<ChecklistAtivo | null> {
  const { rows } = await cliente.query<{
    id: string;
    versao: number;
    itens: ItemChecklistTemplate[];
  }>(
    `SELECT id, versao, itens
       FROM rh.checklist_admissao_versao
      WHERE status = 'ativa'`
  );
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

// ------------------------------------------------------------------ candidatos à abertura

/** Colaboradores não desligados e ainda sem processo — mais recentes primeiro. */
export async function listarCandidatos(): Promise<CandidatoAdmissao[]> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
    data_admissao: string;
  }>(
    `SELECT c.id, c.nome_completo, c.matricula,
            c.data_admissao::text AS data_admissao
       FROM rh.colaborador c
      WHERE c.status <> 'desligado'
        AND NOT EXISTS (SELECT 1 FROM rh.processo_admissao p
                         WHERE p.colaborador_id = c.id)
      ORDER BY c.criado_em DESC`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarColaborador(id: number): Promise<{
  id: number;
  nome_completo: string;
  matricula: string;
  data_admissao: string;
  status: string;
} | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
    data_admissao: string;
    status: string;
  }>(
    `SELECT id, nome_completo, matricula,
            data_admissao::text AS data_admissao, status
       FROM rh.colaborador
      WHERE id = $1`,
    [id]
  );
  return linhas.length ? { ...linhas[0], id: Number(linhas[0].id) } : null;
}

// ------------------------------------------------------------------ listagens

export async function listarProcessos(): Promise<ProcessoResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     ORDER BY (p.estado = 'em_preparacao') DESC, p.data_inicio_prevista, p.id`
  );
  return linhas.map(paraResumo);
}

export async function listarProcessosDosLiderados(
  gestorUsuarioId: number
): Promise<ProcessoResumo[]> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE ${FRAGMENTO_GESTOR}
     ORDER BY (p.estado = 'em_preparacao') DESC, p.data_inicio_prevista, p.id`,
    [gestorUsuarioId]
  );
  return linhas.map(paraResumo);
}

export async function buscarResumo(id: number): Promise<ProcessoResumo | null> {
  const linhas = await consultar<LinhaResumo>(
    `${SELECT_RESUMO}
     WHERE p.id = $1`,
    [id]
  );
  return linhas.length ? paraResumo(linhas[0]) : null;
}

export async function listarItens(processoId: number): Promise<ItemProcesso[]> {
  const linhas = await consultar<{
    id: string;
    ordem: number;
    descricao: string;
    obrigatorio: boolean;
    status: StatusItem;
    concluido_por_nome: string | null;
    concluido_em: string | null;
  }>(
    `SELECT i.id, i.ordem, i.descricao, i.obrigatorio, i.status,
            u.nome AS concluido_por_nome, i.concluido_em
       FROM rh.item_admissao i
       LEFT JOIN sistema.usuario u ON u.id = i.concluido_por
      WHERE i.processo_id = $1
      ORDER BY i.ordem`,
    [processoId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/** O usuário é gestor vigente do colaborador? (escopo de leitura do gestor). */
export async function ehGestorDoColaborador(
  gestorUsuarioId: number,
  colaboradorId: number
): Promise<boolean> {
  const linhas = await consultar<{ eh_gestor: boolean }>(
    `SELECT EXISTS (
        SELECT 1
          FROM rh.relacao_gestor rg
          JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
         WHERE rg.liderado_colaborador_id = $2
           AND rg.fim_vigencia IS NULL
           AND rg.inicio_vigencia <= ${HOJE_SP}
           AND gc.usuario_id = $1) AS eh_gestor`,
    [gestorUsuarioId, colaboradorId]
  );
  return linhas[0].eh_gestor;
}

// ------------------------------------------------------------------ escrita (sempre com o cliente da transação)

export async function criarProcesso(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    checklist_versao_id: number;
    data_inicio_prevista: string;
    contrato_experiencia: boolean;
    prazo_experiencia_1: string | null;
    prazo_experiencia_2: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.processo_admissao
       (colaborador_id, checklist_versao_id, data_inicio_prevista,
        contrato_experiencia, prazo_experiencia_1, prazo_experiencia_2)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.checklist_versao_id,
      dados.data_inicio_prevista,
      dados.contrato_experiencia,
      dados.prazo_experiencia_1,
      dados.prazo_experiencia_2,
    ]
  );
  return Number(rows[0].id);
}

/** Materializa os itens da versão congelada — o andamento vive no processo. */
export async function inserirItens(
  cliente: PoolClient,
  processoId: number,
  itens: ItemChecklistTemplate[]
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.item_admissao (processo_id, ordem, descricao, obrigatorio)
     SELECT $1, m.ordem, m.descricao, m.obrigatorio
       FROM jsonb_to_recordset($2::jsonb)
            AS m (ordem INT, descricao TEXT, obrigatorio BOOLEAN)`,
    [processoId, JSON.stringify(itens)]
  );
}

/**
 * Acrescenta UM item ao processo já aberto — o "adicionar documento extra".
 *
 * A ordem sai do maior que já existe + 1, calculada no próprio INSERT para não
 * abrir espaço entre ler e gravar (`UNIQUE (processo_id, ordem)` recusaria).
 * `item_admissao` não tem FK para o template: os itens são copiados na abertura
 * e viram linhas comuns, então um a mais não viola nada.
 */
export async function inserirItemAvulso(
  cliente: PoolClient,
  processoId: number,
  descricao: string,
  obrigatorio: boolean
): Promise<{ id: number; ordem: number }> {
  const { rows } = await cliente.query<{ id: string; ordem: number }>(
    `INSERT INTO rh.item_admissao (processo_id, ordem, descricao, obrigatorio)
     SELECT $1,
            COALESCE(MAX(ordem), 0) + 1,
            $2,
            $3
       FROM rh.item_admissao
      WHERE processo_id = $1
     RETURNING id, ordem`,
    [processoId, descricao, obrigatorio]
  );
  return { id: Number(rows[0].id), ordem: rows[0].ordem };
}

export async function buscarProcessoParaMutacao(
  cliente: PoolClient,
  id: number
): Promise<ProcessoParaMutacao | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    estado: EstadoProcesso;
    data_inicio_prevista: string;
    checklist_versao: number;
  }>(
    `SELECT p.id, p.colaborador_id, p.estado,
            p.data_inicio_prevista::text AS data_inicio_prevista,
            c.nome_completo AS colaborador_nome, c.matricula,
            v.versao AS checklist_versao
       FROM rh.processo_admissao p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
       JOIN rh.checklist_admissao_versao v ON v.id = p.checklist_versao_id
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

export async function buscarItemParaMutacao(
  cliente: PoolClient,
  processoId: number,
  itemId: number
): Promise<ItemParaMutacao | null> {
  const { rows } = await cliente.query<{
    id: string;
    descricao: string;
    obrigatorio: boolean;
    status: StatusItem;
  }>(
    `SELECT id, descricao, obrigatorio, status
       FROM rh.item_admissao
      WHERE id = $1 AND processo_id = $2
      FOR UPDATE`,
    [itemId, processoId]
  );
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

export async function atualizarStatusItem(
  cliente: PoolClient,
  itemId: number,
  status: StatusItem,
  usuarioId: number
): Promise<void> {
  if (status === "pendente") {
    await cliente.query(
      `UPDATE rh.item_admissao
          SET status = 'pendente', concluido_por = NULL, concluido_em = NULL
        WHERE id = $1`,
      [itemId]
    );
    return;
  }
  await cliente.query(
    `UPDATE rh.item_admissao
        SET status = $2, concluido_por = $3, concluido_em = now()
      WHERE id = $1`,
    [itemId, status, usuarioId]
  );
}

export async function contarObrigatoriosPendentes(
  cliente: PoolClient,
  processoId: number
): Promise<number> {
  const { rows } = await cliente.query<{ pendentes: string }>(
    `SELECT COUNT(*) AS pendentes
       FROM rh.item_admissao
      WHERE processo_id = $1 AND obrigatorio AND status = 'pendente'`,
    [processoId]
  );
  return Number(rows[0].pendentes);
}

export async function atualizarEstadoProcesso(
  cliente: PoolClient,
  id: number,
  estado: EstadoProcesso
): Promise<void> {
  await cliente.query(
    "UPDATE rh.processo_admissao SET estado = $2 WHERE id = $1",
    [id, estado]
  );
}

// ------------------------------------------------------------------ indicador

/**
 * % de processos concluídos até a data de início prevista, na janela dos
 * últimos 12 meses. A data de conclusão é o atualizado_em do processo
 * concluído — após concluir, o serviço bloqueia qualquer mutação no processo,
 * então o carimbo permanece o da conclusão. NULL quando não há concluídos.
 */
export async function valorIndicadorAdmissoesNoPrazo(): Promise<number | null> {
  const linhas = await consultar<{ no_prazo: string; total: string }>(
    `SELECT COUNT(*) FILTER (
              WHERE (atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
                    <= data_inicio_prevista) AS no_prazo,
            COUNT(*) AS total
       FROM rh.processo_admissao
      WHERE estado = 'concluido'
        AND atualizado_em >= now() - INTERVAL '12 months'`
  );
  const total = Number(linhas[0].total);
  if (total === 0) return null;
  return Math.round((Number(linhas[0].no_prazo) / total) * 1000) / 10;
}
