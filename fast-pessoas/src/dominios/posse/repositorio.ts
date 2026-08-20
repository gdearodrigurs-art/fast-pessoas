import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";

// ===========================================================================
// Repositório do domínio POSSE de patrimônio (migration 0081). SQL só; a
// autorização e as regras ficam no serviço. Uma tabela — rh.posse_item —,
// append-only SELETIVO (só devolvido_em e ciencia_registrada mudam; o resto é
// imutável; DELETE barrado por trigger). A categoria vem do catálogo já
// administrável rh.categoria_devolucao (0054) — não há segundo catálogo.
// ===========================================================================

export interface PosseLinha {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  categoria_chave: string;
  /** Rótulo já resolvido pelo servidor: a tela não tem mapa de categoria. */
  categoria_nome: string;
  descricao: string;
  quantidade: number;
  numero_serie: string | null;
  data_entrega: string;
  termo_documento_id: number | null;
  termo_titulo: string | null;
  ciencia_registrada: boolean;
  /** NULL = em uso; preenchido uma única vez na devolução. */
  devolvido_em: string | null;
}

const SELECT_POSSE = `
  SELECT p.id, p.colaborador_id, c.nome_completo AS colaborador_nome,
         c.matricula, p.categoria_chave, cat.nome AS categoria_nome,
         p.descricao, p.quantidade, p.numero_serie,
         p.data_entrega::text AS data_entrega,
         p.termo_documento_id, d.titulo AS termo_titulo,
         p.ciencia_registrada, p.devolvido_em::text AS devolvido_em
    FROM rh.posse_item p
    JOIN rh.colaborador c ON c.id = p.colaborador_id
    JOIN rh.categoria_devolucao cat ON cat.chave = p.categoria_chave
    LEFT JOIN rh.documento d ON d.id = p.termo_documento_id`;

interface PosseCrua {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  matricula: string;
  categoria_chave: string;
  categoria_nome: string;
  descricao: string;
  quantidade: number;
  numero_serie: string | null;
  data_entrega: string;
  termo_documento_id: string | null;
  termo_titulo: string | null;
  ciencia_registrada: boolean;
  devolvido_em: string | null;
  [chave: string]: unknown;
}

function mapearPosse(linha: PosseCrua): PosseLinha {
  return {
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    categoria_chave: linha.categoria_chave,
    categoria_nome: linha.categoria_nome,
    descricao: linha.descricao,
    quantidade: linha.quantidade,
    numero_serie: linha.numero_serie,
    data_entrega: linha.data_entrega,
    termo_documento_id:
      linha.termo_documento_id === null
        ? null
        : Number(linha.termo_documento_id),
    termo_titulo: linha.termo_titulo,
    ciencia_registrada: linha.ciencia_registrada,
    devolvido_em: linha.devolvido_em,
  };
}

/** Posse de um colaborador — em uso primeiro, depois devolvidos, recentes no topo. */
export async function listarPosse(
  colaboradorId: number
): Promise<PosseLinha[]> {
  const linhas = await consultar<PosseCrua>(
    `${SELECT_POSSE}
      WHERE p.colaborador_id = $1
      ORDER BY (p.devolvido_em IS NULL) DESC, p.data_entrega DESC, p.id DESC`,
    [colaboradorId]
  );
  return linhas.map(mapearPosse);
}

/**
 * Itens ainda com o colaborador (devolvido_em IS NULL) — a consulta que o
 * DESLIGAMENTO faz para avisar as pendências de devolução (eixo 10). Usa o
 * índice parcial posse_item_pendente_devolucao da 0081.
 */
export async function listarPendentesDevolucao(
  colaboradorId: number
): Promise<PosseLinha[]> {
  const linhas = await consultar<PosseCrua>(
    `${SELECT_POSSE}
      WHERE p.colaborador_id = $1 AND p.devolvido_em IS NULL
      ORDER BY p.data_entrega DESC, p.id DESC`,
    [colaboradorId]
  );
  return linhas.map(mapearPosse);
}

/** Pré-check das mutações (devolução/ciência): o registro como está agora. */
export async function buscarPosseParaMutacao(
  id: number
): Promise<PosseLinha | null> {
  const linhas = await consultar<PosseCrua>(
    `${SELECT_POSSE}
      WHERE p.id = $1`,
    [id]
  );
  return linhas.length > 0 ? mapearPosse(linhas[0]) : null;
}

export async function inserirPosse(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    categoria_chave: string;
    descricao: string;
    quantidade: number;
    numero_serie: string | null;
    data_entrega: string;
    termo_documento_id: number | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.posse_item
       (colaborador_id, categoria_chave, descricao, quantidade, numero_serie,
        data_entrega, termo_documento_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.categoria_chave,
      dados.descricao,
      dados.quantidade,
      dados.numero_serie,
      dados.data_entrega,
      dados.termo_documento_id,
    ]
  );
  return Number(rows[0].id);
}

export async function registrarDevolucao(
  cliente: PoolClient,
  id: number
): Promise<string | null> {
  // Condicional (devolvido_em IS NULL), molde EPI: duas requisições
  // concorrentes passavam pelo mesmo pré-check e o UPDATE incondicional da
  // segunda batia no trigger de imutabilidade (500). Casando 0 linhas, quem
  // chama devolve 409 limpo.
  const { rows } = await cliente.query<{ devolvido_em: string }>(
    `UPDATE rh.posse_item SET devolvido_em = now()
      WHERE id = $1 AND devolvido_em IS NULL
      RETURNING devolvido_em::text AS devolvido_em`,
    [id]
  );
  return rows[0]?.devolvido_em ?? null;
}

export async function marcarCiencia(
  cliente: PoolClient,
  id: number
): Promise<void> {
  await cliente.query(
    "UPDATE rh.posse_item SET ciencia_registrada = TRUE WHERE id = $1",
    [id]
  );
}

// ------------------------------------------------------------------ apoio

/** Existência do colaborador + nome/matrícula para a trilha de auditoria. */
export async function buscarColaboradorBasico(id: number): Promise<{
  id: number;
  nome_completo: string;
  matricula: string;
} | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>("SELECT id, nome_completo, matricula FROM rh.colaborador WHERE id = $1", [
    id,
  ]);
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    nome_completo: linhas[0].nome_completo,
    matricula: linhas[0].matricula,
  };
}

/** O vínculo ATUAL de quem está logado (rh.vinculo_atual, 0046) — molde sst. */
export async function colaboradorDoUsuario(
  usuarioId: number
): Promise<number | null> {
  const linhas = await consultar<{ id: string }>(
    "SELECT id FROM rh.colaborador WHERE id = rh.vinculo_atual($1)",
    [usuarioId]
  );
  return linhas.length > 0 ? Number(linhas[0].id) : null;
}

/** Ciência já dada no GED sobre este documento por este usuário? (molde sst) */
export async function cienciaExistente(
  documentoId: number,
  usuarioId: number
): Promise<boolean> {
  const linhas = await consultar<{ id: string }>(
    "SELECT id FROM rh.ciencia WHERE documento_id = $1 AND usuario_id = $2",
    [documentoId, usuarioId]
  );
  return linhas.length > 0;
}
