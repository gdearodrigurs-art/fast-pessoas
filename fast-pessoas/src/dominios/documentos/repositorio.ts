import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { CATEGORIA_PESQUISA_SOCIAL } from "./esquemas";

// Metadados e ciência. O conteúdo binário fica no repositório isolado de
// armazenamento (./armazenamento.ts) — nunca sai daqui nas listagens.

export interface DocumentoLista {
  id: number;
  colaborador_id: number | null;
  colaborador_nome: string | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  enviado_por: string;
  /** ISO 8601 em UTC. */
  enviado_em: string;
  /** Ciência do usuário da sessão, ISO 8601 em UTC — null quando pendente. */
  minha_ciencia_em: string | null;
  // -------- ciclo de ciência (0086) --------
  exige_ciencia: boolean;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  substitui_documento_id: number | null;
  /** Id da versão que SUBSTITUIU esta — null = versão vigente da cadeia. */
  substituido_por_id: number | null;
  /** Recusa do usuário da sessão nesta versão, ISO 8601 — null se não recusou. */
  minha_recusa_em: string | null;
}

export interface MetadadosDocumento {
  id: number;
  colaborador_id: number | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  hash_sha256: string;
  exige_ciencia: boolean;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  /** Id da versão que SUBSTITUIU esta — null = versão vigente da cadeia. */
  substituido_por_id: number | null;
}

export interface EscopoLista {
  usuarioId: number;
  /** Quem envia documentos (RH/DP) enxerga o acervo inteiro. */
  verTodos: boolean;
  /**
   * TODOS os vínculos de quem está lendo — o documento pessoal do contrato
   * anterior no mesmo grupo continua sendo dele. Vazio = só o acervo geral.
   */
  vinculosDoUsuario: number[];
  incluirSensiveis: boolean;
}

interface LinhaLista extends Record<string, unknown> {
  id: string;
  colaborador_id: string | null;
  colaborador_nome: string | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  enviado_por: string;
  enviado_em: Date;
  minha_ciencia_em: Date | null;
  exige_ciencia: boolean;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  substitui_documento_id: string | null;
  substituido_por_id: string | null;
  minha_recusa_em: Date | null;
}

interface LinhaMetadados extends Record<string, unknown> {
  id: string;
  colaborador_id: string | null;
  categoria: string;
  titulo: string;
  nome_arquivo: string;
  mime: string;
  tamanho_bytes: number;
  sensivel: boolean;
  hash_sha256: string;
  exige_ciencia: boolean;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  substituido_por_id: string | null;
}

/**
 * O WHERE da listagem do acervo, extraído puro para ser PROVÁVEL sem banco.
 *
 * A primeira condição não depende de escopo nenhum: o anexo da pesquisa
 * social (categoria própria e oculta — A2/G3:a) NUNCA entra na listagem,
 * nem para quem tem documento.ver.todos + documento.sensivel.ver. Quem gere
 * a seleção (rs.gerir) o alcança pela rota da candidatura ou pelo download
 * genérico — nunca pela lista.
 */
export function montarFiltroLista(escopo: EscopoLista): {
  clausulaWhere: string;
  parametros: unknown[];
} {
  const parametros: unknown[] = [escopo.usuarioId];
  const condicoes: string[] = [];
  parametros.push(CATEGORIA_PESQUISA_SOCIAL);
  condicoes.push(`d.categoria <> $${parametros.length}`);
  if (!escopo.verTodos) {
    if (escopo.vinculosDoUsuario.length === 0) {
      condicoes.push("d.colaborador_id IS NULL");
    } else {
      parametros.push(escopo.vinculosDoUsuario);
      condicoes.push(
        `(d.colaborador_id IS NULL
          OR d.colaborador_id = ANY($${parametros.length}::bigint[]))`
      );
    }
  }
  if (!escopo.incluirSensiveis) {
    condicoes.push("d.sensivel = FALSE");
  }
  return { clausulaWhere: `WHERE ${condicoes.join(" AND ")}`, parametros };
}

export async function listar(escopo: EscopoLista): Promise<DocumentoLista[]> {
  const { clausulaWhere, parametros } = montarFiltroLista(escopo);
  const linhas = await consultar<LinhaLista>(
    `SELECT d.id, d.colaborador_id, col.nome_completo AS colaborador_nome,
            d.categoria, d.titulo, d.nome_arquivo, d.mime, d.tamanho_bytes,
            d.sensivel, u.nome AS enviado_por, d.enviado_em,
            c.dada_em AS minha_ciencia_em,
            d.exige_ciencia, d.bloqueante, d.prazo_ciencia_dias,
            d.substitui_documento_id,
            sucessor.id AS substituido_por_id,
            r.recusada_em AS minha_recusa_em
       FROM rh.documento d
       JOIN sistema.usuario u ON u.id = d.enviado_por_usuario
       LEFT JOIN rh.colaborador col ON col.id = d.colaborador_id
       LEFT JOIN rh.ciencia c
         ON c.documento_id = d.id AND c.usuario_id = $1
       LEFT JOIN rh.documento sucessor
         ON sucessor.substitui_documento_id = d.id
       LEFT JOIN rh.documento_recusa r
         ON r.documento_id = d.id AND r.usuario_id = $1
       ${clausulaWhere}
      ORDER BY d.enviado_em DESC, d.id DESC`,
    parametros
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id:
      linha.colaborador_id === null ? null : Number(linha.colaborador_id),
    enviado_em: linha.enviado_em.toISOString(),
    minha_ciencia_em: linha.minha_ciencia_em
      ? linha.minha_ciencia_em.toISOString()
      : null,
    substitui_documento_id:
      linha.substitui_documento_id === null
        ? null
        : Number(linha.substitui_documento_id),
    substituido_por_id:
      linha.substituido_por_id === null
        ? null
        : Number(linha.substituido_por_id),
    minha_recusa_em: linha.minha_recusa_em
      ? linha.minha_recusa_em.toISOString()
      : null,
  }));
}

export async function buscarMetadados(
  id: number
): Promise<MetadadosDocumento | null> {
  const linhas = await consultar<LinhaMetadados>(
    `SELECT d.id, d.colaborador_id, d.categoria, d.titulo, d.nome_arquivo,
            d.mime, d.tamanho_bytes, d.sensivel, d.hash_sha256,
            d.exige_ciencia, d.bloqueante, d.prazo_ciencia_dias,
            sucessor.id AS substituido_por_id
       FROM rh.documento d
       LEFT JOIN rh.documento sucessor
         ON sucessor.substitui_documento_id = d.id
      WHERE d.id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id:
      linha.colaborador_id === null ? null : Number(linha.colaborador_id),
    substituido_por_id:
      linha.substituido_por_id === null
        ? null
        : Number(linha.substituido_por_id),
  };
}

/**
 * TODOS os vínculos de quem está lendo, do mais novo ao mais antigo.
 *
 * Era `rh.vinculo_atual` — UM vínculo, o corrente —, e com isso o documento
 * pessoal do contrato anterior no mesmo grupo (advertência, ASO, rescisão)
 * desaparecia do portal de quem é o dono dele no dia em que ele mudava de CNPJ.
 * O contrato acabou; o documento continua sendo da pessoa. Quem ENVIA continua
 * escolhendo o vínculo de destino; o que muda aqui é só quem consegue LER.
 */
export async function vinculosDoUsuario(usuarioId: number): Promise<number[]> {
  const linhas = await consultar<{ id: string }>(
    `SELECT c.id
       FROM rh.colaborador c
      WHERE c.pessoa_id = rh.pessoa_do_usuario($1)
      ORDER BY c.data_admissao DESC, c.id DESC`,
    [usuarioId]
  );
  return linhas.map((linha) => Number(linha.id));
}

export async function buscarColaborador(
  id: number
): Promise<{ id: number; nome_completo: string } | null> {
  const linhas = await consultar<{ id: string; nome_completo: string }>(
    "SELECT id, nome_completo FROM rh.colaborador WHERE id = $1",
    [id]
  );
  if (linhas.length === 0) return null;
  return { id: Number(linhas[0].id), nome_completo: linhas[0].nome_completo };
}

export async function inserirCiencia(
  cliente: PoolClient,
  entrada: {
    documentoId: number;
    usuarioId: number;
    hashNoMomento: string;
  }
): Promise<{ id: number; dada_em: string }> {
  const { rows } = await cliente.query<{ id: string; dada_em: Date }>(
    `INSERT INTO rh.ciencia (documento_id, usuario_id, hash_no_momento)
     VALUES ($1, $2, $3)
     RETURNING id, dada_em`,
    [entrada.documentoId, entrada.usuarioId, entrada.hashNoMomento]
  );
  return { id: Number(rows[0].id), dada_em: rows[0].dada_em.toISOString() };
}

// ===========================================================================
// Ciclo de ciência (0086)
//
// A pendência NÃO é tabela: é DERIVADA — documento do acervo geral, com
// exige_ciencia, SEM sucessor (versão vigente da cadeia) e sem ciência do
// usuário. Versão nova reabre para todos e admitido futuro herda de graça
// (B3), porque não há estado materializado para dessincronizar.
// ===========================================================================

/**
 * Data-limite e vencimento do prazo, no dia civil de São Paulo (eixo 3 —
 * rh.hoje(), nunca o relógio do servidor). Para admitido DEPOIS da publicação
 * o relógio conta da criação do usuário, não do documento — senão o recém-
 * chegado já nasceria vencido.
 */
const EXPR_DATA_LIMITE = `
  CASE WHEN d.prazo_ciencia_dias IS NULL THEN NULL
       ELSE ((GREATEST(d.enviado_em, u.criado_em)
               AT TIME ZONE 'America/Sao_Paulo')::date
             + d.prazo_ciencia_dias)::text
  END`;

const EXPR_VENCIDA = `
  CASE WHEN d.prazo_ciencia_dias IS NULL THEN FALSE
       ELSE ((GREATEST(d.enviado_em, u.criado_em)
               AT TIME ZONE 'America/Sao_Paulo')::date
             + d.prazo_ciencia_dias) < rh.hoje()
  END`;

/** Documento vigente da cadeia = sem sucessor apontando para ele. */
const EXPR_SEM_SUCESSOR = `NOT EXISTS (
  SELECT 1 FROM rh.documento sucessor
   WHERE sucessor.substitui_documento_id = d.id)`;

export interface PendenciaLinha {
  documento_id: number;
  titulo: string;
  categoria: string;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  /** ISO 8601 em UTC — publicação da versão vigente. */
  enviado_em: string;
  /** AAAA-MM-DD no dia civil de SP — null quando não há prazo. */
  data_limite: string | null;
  vencida: boolean;
  /** ISO 8601 — null quando o usuário não recusou esta versão. */
  recusada_em: string | null;
  /** Ato formal registrado (recusa/prazo vencido) — null quando não há. */
  ato_id: number | null;
  /** ISO 8601 — null quando não houve liberação explícita. */
  liberado_em: string | null;
}

interface LinhaPendencia extends Record<string, unknown> {
  documento_id: string;
  titulo: string;
  categoria: string;
  bloqueante: boolean;
  prazo_ciencia_dias: number | null;
  enviado_em: Date;
  data_limite: string | null;
  vencida: boolean;
  recusada_em: Date | null;
  ato_id: string | null;
  liberado_em: Date | null;
}

/** As pendências ABERTAS (sem ciência) do usuário nas versões vigentes. */
export async function pendenciasDoUsuario(
  usuarioId: number
): Promise<PendenciaLinha[]> {
  const linhas = await consultar<LinhaPendencia>(
    `SELECT d.id AS documento_id, d.titulo, d.categoria, d.bloqueante,
            d.prazo_ciencia_dias, d.enviado_em,
            ${EXPR_DATA_LIMITE} AS data_limite,
            ${EXPR_VENCIDA} AS vencida,
            r.recusada_em, a.id AS ato_id, l.liberado_em
       FROM rh.documento d
      CROSS JOIN sistema.usuario u
       LEFT JOIN rh.ciencia c
         ON c.documento_id = d.id AND c.usuario_id = u.id
       LEFT JOIN rh.documento_recusa r
         ON r.documento_id = d.id AND r.usuario_id = u.id
       LEFT JOIN rh.conduta_ato a
         ON a.documento_id = d.id AND a.usuario_id = u.id
       LEFT JOIN rh.conduta_liberacao l
         ON l.documento_id = d.id AND l.usuario_id = u.id
      WHERE u.id = $1
        AND d.exige_ciencia
        AND d.colaborador_id IS NULL
        -- Cinto-e-suspensório de A1: o envio já recusa sensível no ciclo
        -- (validarCicloEnvio); se um dado antigo violar isso, a pendência não
        -- nasce — senão o TÍTULO do documento sensível vazaria para todo o
        -- quadro pelo cartão de pendências.
        AND d.sensivel = FALSE
        AND c.dada_em IS NULL
        AND ${EXPR_SEM_SUCESSOR}
      ORDER BY d.bloqueante DESC, d.enviado_em DESC, d.id DESC`,
    [usuarioId]
  );
  return linhas.map((linha) => ({
    ...linha,
    documento_id: Number(linha.documento_id),
    enviado_em: linha.enviado_em.toISOString(),
    recusada_em: linha.recusada_em ? linha.recusada_em.toISOString() : null,
    ato_id: linha.ato_id === null ? null : Number(linha.ato_id),
    liberado_em: linha.liberado_em ? linha.liberado_em.toISOString() : null,
  }));
}

// ------------------------------------------------------------------ quadro do ciclo

export interface QuadroPessoa {
  usuario_id: number;
  nome: string;
  papel: string;
  ciencia_em: string | null;
  recusada_em: string | null;
  recusa_motivo: string | null;
  liberado_em: string | null;
  liberacao_justificativa: string | null;
  liberado_por_nome: string | null;
  ato_id: number | null;
  data_limite: string | null;
  vencida: boolean;
}

interface LinhaQuadro extends Record<string, unknown> {
  usuario_id: string;
  nome: string;
  papel: string;
  ciencia_em: Date | null;
  recusada_em: Date | null;
  recusa_motivo: string | null;
  liberado_em: Date | null;
  liberacao_justificativa: string | null;
  liberado_por_nome: string | null;
  ato_id: string | null;
  data_limite: string | null;
  vencida: boolean;
}

/**
 * O quadro por documento: TODO usuário ativo e o estado dele nesta versão
 * (assinou / recusou / pendente / liberado). Servido só a rh.conduta.gerir.
 */
export async function quadroDoCiclo(
  documentoId: number
): Promise<QuadroPessoa[]> {
  const linhas = await consultar<LinhaQuadro>(
    `SELECT u.id AS usuario_id, u.nome, u.papel,
            c.dada_em AS ciencia_em,
            r.recusada_em, r.motivo AS recusa_motivo,
            l.liberado_em, l.justificativa AS liberacao_justificativa,
            lp.nome AS liberado_por_nome,
            a.id AS ato_id,
            ${EXPR_DATA_LIMITE} AS data_limite,
            ${EXPR_VENCIDA} AS vencida
       FROM rh.documento d
      CROSS JOIN sistema.usuario u
       LEFT JOIN rh.ciencia c
         ON c.documento_id = d.id AND c.usuario_id = u.id
       LEFT JOIN rh.documento_recusa r
         ON r.documento_id = d.id AND r.usuario_id = u.id
       LEFT JOIN rh.conduta_ato a
         ON a.documento_id = d.id AND a.usuario_id = u.id
       LEFT JOIN rh.conduta_liberacao l
         ON l.documento_id = d.id AND l.usuario_id = u.id
       LEFT JOIN sistema.usuario lp ON lp.id = l.liberado_por
      WHERE d.id = $1
        AND u.ativo
      ORDER BY u.nome`,
    [documentoId]
  );
  return linhas.map((linha) => ({
    ...linha,
    usuario_id: Number(linha.usuario_id),
    ciencia_em: linha.ciencia_em ? linha.ciencia_em.toISOString() : null,
    recusada_em: linha.recusada_em ? linha.recusada_em.toISOString() : null,
    liberado_em: linha.liberado_em ? linha.liberado_em.toISOString() : null,
    ato_id: linha.ato_id === null ? null : Number(linha.ato_id),
  }));
}

export interface AtoDoCiclo {
  id: number;
  usuario_id: number;
  usuario_nome: string;
  origem: "recusa" | "prazo_vencido";
  descricao: string;
  aberto_em: string;
  aberto_por_nome: string;
  desfecho: string | null;
  desfecho_em: string | null;
  desfecho_por_nome: string | null;
  testemunhas: {
    usuario_id: number;
    nome: string;
    confirmado_em: string | null;
  }[];
}

interface LinhaAto extends Record<string, unknown> {
  id: string;
  usuario_id: string;
  usuario_nome: string;
  origem: "recusa" | "prazo_vencido";
  descricao: string;
  aberto_em: Date;
  aberto_por_nome: string;
  desfecho: string | null;
  desfecho_em: Date | null;
  desfecho_por_nome: string | null;
}

interface LinhaTestemunha extends Record<string, unknown> {
  ato_id: string;
  usuario_id: string;
  nome: string;
  confirmado_em: Date | null;
}

export async function atosDoDocumento(
  documentoId: number
): Promise<AtoDoCiclo[]> {
  const atos = await consultar<LinhaAto>(
    `SELECT a.id, a.usuario_id, ua.nome AS usuario_nome, a.origem,
            a.descricao, a.aberto_em, ab.nome AS aberto_por_nome,
            a.desfecho, a.desfecho_em, dp.nome AS desfecho_por_nome
       FROM rh.conduta_ato a
       JOIN sistema.usuario ua ON ua.id = a.usuario_id
       JOIN sistema.usuario ab ON ab.id = a.aberto_por
       LEFT JOIN sistema.usuario dp ON dp.id = a.desfecho_por
      WHERE a.documento_id = $1
      ORDER BY a.aberto_em DESC, a.id DESC`,
    [documentoId]
  );
  if (atos.length === 0) return [];
  const testemunhas = await consultar<LinhaTestemunha>(
    `SELECT t.ato_id, t.usuario_id, u.nome, t.confirmado_em
       FROM rh.conduta_ato_testemunha t
       JOIN sistema.usuario u ON u.id = t.usuario_id
      WHERE t.ato_id = ANY($1::bigint[])
      ORDER BY t.id`,
    [atos.map((ato) => Number(ato.id))]
  );
  const porAto = new Map<number, AtoDoCiclo["testemunhas"]>();
  for (const linha of testemunhas) {
    const atoId = Number(linha.ato_id);
    const lista = porAto.get(atoId) ?? [];
    lista.push({
      usuario_id: Number(linha.usuario_id),
      nome: linha.nome,
      confirmado_em: linha.confirmado_em
        ? linha.confirmado_em.toISOString()
        : null,
    });
    porAto.set(atoId, lista);
  }
  return atos.map((linha) => ({
    id: Number(linha.id),
    usuario_id: Number(linha.usuario_id),
    usuario_nome: linha.usuario_nome,
    origem: linha.origem,
    descricao: linha.descricao,
    aberto_em: linha.aberto_em.toISOString(),
    aberto_por_nome: linha.aberto_por_nome,
    desfecho: linha.desfecho,
    desfecho_em: linha.desfecho_em ? linha.desfecho_em.toISOString() : null,
    desfecho_por_nome: linha.desfecho_por_nome,
    testemunhas: porAto.get(Number(linha.id)) ?? [],
  }));
}

// ------------------------------------------------------------------ escritas do ciclo

export async function inserirRecusa(
  cliente: PoolClient,
  entrada: {
    documentoId: number;
    usuarioId: number;
    hashNoMomento: string;
    motivo: string | null;
  }
): Promise<{ id: number; recusada_em: string }> {
  const { rows } = await cliente.query<{ id: string; recusada_em: Date }>(
    `INSERT INTO rh.documento_recusa
       (documento_id, usuario_id, hash_no_momento, motivo)
     VALUES ($1, $2, $3, $4)
     RETURNING id, recusada_em`,
    [
      entrada.documentoId,
      entrada.usuarioId,
      entrada.hashNoMomento,
      entrada.motivo,
    ]
  );
  return {
    id: Number(rows[0].id),
    recusada_em: rows[0].recusada_em.toISOString(),
  };
}

export async function buscarRecusa(
  documentoId: number,
  usuarioId: number
): Promise<{ id: number; recusada_em: string } | null> {
  const linhas = await consultar<{ id: string; recusada_em: Date }>(
    `SELECT id, recusada_em FROM rh.documento_recusa
      WHERE documento_id = $1 AND usuario_id = $2`,
    [documentoId, usuarioId]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    recusada_em: linhas[0].recusada_em.toISOString(),
  };
}

export async function cienciaExiste(
  documentoId: number,
  usuarioId: number
): Promise<boolean> {
  const linhas = await consultar<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM rh.ciencia
        WHERE documento_id = $1 AND usuario_id = $2) AS existe`,
    [documentoId, usuarioId]
  );
  return linhas[0]?.existe === true;
}

export async function inserirAto(
  cliente: PoolClient,
  entrada: {
    documentoId: number;
    usuarioId: number;
    origem: "recusa" | "prazo_vencido";
    recusaId: number | null;
    descricao: string;
    abertoPor: number;
  }
): Promise<{ id: number; aberto_em: string }> {
  const { rows } = await cliente.query<{ id: string; aberto_em: Date }>(
    `INSERT INTO rh.conduta_ato
       (documento_id, usuario_id, origem, recusa_id, descricao, aberto_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, aberto_em`,
    [
      entrada.documentoId,
      entrada.usuarioId,
      entrada.origem,
      entrada.recusaId,
      entrada.descricao,
      entrada.abertoPor,
    ]
  );
  return { id: Number(rows[0].id), aberto_em: rows[0].aberto_em.toISOString() };
}

export async function inserirTestemunha(
  cliente: PoolClient,
  atoId: number,
  usuarioId: number
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.conduta_ato_testemunha (ato_id, usuario_id)
     VALUES ($1, $2)`,
    [atoId, usuarioId]
  );
}

export interface AtoBasico {
  id: number;
  documento_id: number;
  usuario_id: number;
  origem: "recusa" | "prazo_vencido";
  desfecho: string | null;
}

export async function buscarAto(atoId: number): Promise<AtoBasico | null> {
  const linhas = await consultar<{
    id: string;
    documento_id: string;
    usuario_id: string;
    origem: "recusa" | "prazo_vencido";
    desfecho: string | null;
  }>(
    `SELECT id, documento_id, usuario_id, origem, desfecho
       FROM rh.conduta_ato WHERE id = $1`,
    [atoId]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    documento_id: Number(linhas[0].documento_id),
    usuario_id: Number(linhas[0].usuario_id),
    origem: linhas[0].origem,
    desfecho: linhas[0].desfecho,
  };
}

export async function buscarAtoDoUsuario(
  documentoId: number,
  usuarioId: number
): Promise<{ id: number } | null> {
  const linhas = await consultar<{ id: string }>(
    `SELECT id FROM rh.conduta_ato
      WHERE documento_id = $1 AND usuario_id = $2`,
    [documentoId, usuarioId]
  );
  return linhas.length === 0 ? null : { id: Number(linhas[0].id) };
}

/**
 * Confirmação da testemunha COM A PRÓPRIA SESSÃO (B2): grava data + hash do
 * documento no momento. O WHERE é a autorização: só a linha da testemunha
 * chamadora, ainda não confirmada — 0 linhas = não é testemunha ou já
 * confirmou, e o serviço decide o erro.
 */
export async function confirmarTestemunha(
  cliente: PoolClient,
  entrada: { atoId: number; usuarioId: number; hashNoMomento: string }
): Promise<string | null> {
  const { rows } = await cliente.query<{ confirmado_em: Date }>(
    `UPDATE rh.conduta_ato_testemunha
        SET confirmado_em = now(), hash_no_momento = $3
      WHERE ato_id = $1 AND usuario_id = $2 AND confirmado_em IS NULL
      RETURNING confirmado_em`,
    [entrada.atoId, entrada.usuarioId, entrada.hashNoMomento]
  );
  return rows.length === 0 ? null : rows[0].confirmado_em.toISOString();
}

export async function buscarTestemunha(
  atoId: number,
  usuarioId: number
): Promise<{ id: number; confirmado_em: string | null } | null> {
  const linhas = await consultar<{ id: string; confirmado_em: Date | null }>(
    `SELECT id, confirmado_em FROM rh.conduta_ato_testemunha
      WHERE ato_id = $1 AND usuario_id = $2`,
    [atoId, usuarioId]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    confirmado_em: linhas[0].confirmado_em
      ? linhas[0].confirmado_em.toISOString()
      : null,
  };
}

export async function registrarDesfecho(
  cliente: PoolClient,
  entrada: { atoId: number; desfecho: string; usuarioId: number }
): Promise<string | null> {
  const { rows } = await cliente.query<{ desfecho_em: Date }>(
    `UPDATE rh.conduta_ato
        SET desfecho = $2, desfecho_em = now(), desfecho_por = $3
      WHERE id = $1 AND desfecho IS NULL
      RETURNING desfecho_em`,
    [entrada.atoId, entrada.desfecho, entrada.usuarioId]
  );
  return rows.length === 0 ? null : rows[0].desfecho_em.toISOString();
}

export async function inserirLiberacao(
  cliente: PoolClient,
  entrada: {
    documentoId: number;
    usuarioId: number;
    atoId: number | null;
    justificativa: string;
    liberadoPor: number;
  }
): Promise<{ id: number; liberado_em: string }> {
  const { rows } = await cliente.query<{ id: string; liberado_em: Date }>(
    `INSERT INTO rh.conduta_liberacao
       (documento_id, usuario_id, ato_id, justificativa, liberado_por)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, liberado_em`,
    [
      entrada.documentoId,
      entrada.usuarioId,
      entrada.atoId,
      entrada.justificativa,
      entrada.liberadoPor,
    ]
  );
  return {
    id: Number(rows[0].id),
    liberado_em: rows[0].liberado_em.toISOString(),
  };
}

export async function buscarLiberacao(
  documentoId: number,
  usuarioId: number
): Promise<{ id: number } | null> {
  const linhas = await consultar<{ id: string }>(
    `SELECT id FROM rh.conduta_liberacao
      WHERE documento_id = $1 AND usuario_id = $2`,
    [documentoId, usuarioId]
  );
  return linhas.length === 0 ? null : { id: Number(linhas[0].id) };
}

export interface TestemunhoPendente {
  ato_id: number;
  documento_id: number;
  documento_titulo: string;
  pessoa_nome: string;
  origem: "recusa" | "prazo_vencido";
  aberto_em: string;
}

/**
 * Atos em que o usuário da sessão é testemunha AINDA NÃO confirmada — o
 * cartão "confirme seu testemunho" da tela de documentos. Filtro pela
 * própria sessão, no SQL.
 */
export async function testemunhosPendentesDoUsuario(
  usuarioId: number
): Promise<TestemunhoPendente[]> {
  const linhas = await consultar<{
    ato_id: string;
    documento_id: string;
    documento_titulo: string;
    pessoa_nome: string;
    origem: "recusa" | "prazo_vencido";
    aberto_em: Date;
  }>(
    `SELECT t.ato_id, a.documento_id, d.titulo AS documento_titulo,
            ua.nome AS pessoa_nome, a.origem, a.aberto_em
       FROM rh.conduta_ato_testemunha t
       JOIN rh.conduta_ato a ON a.id = t.ato_id
       JOIN rh.documento d ON d.id = a.documento_id
       JOIN sistema.usuario ua ON ua.id = a.usuario_id
      WHERE t.usuario_id = $1
        AND t.confirmado_em IS NULL
      ORDER BY a.aberto_em DESC`,
    [usuarioId]
  );
  return linhas.map((linha) => ({
    ato_id: Number(linha.ato_id),
    documento_id: Number(linha.documento_id),
    documento_titulo: linha.documento_titulo,
    pessoa_nome: linha.pessoa_nome,
    origem: linha.origem,
    aberto_em: linha.aberto_em.toISOString(),
  }));
}

// ------------------------------------------------------------------ apoio do ciclo

export async function buscarUsuarioBasico(
  id: number
): Promise<{ id: number; nome: string; ativo: boolean } | null> {
  const linhas = await consultar<{ id: string; nome: string; ativo: boolean }>(
    "SELECT id, nome, ativo FROM sistema.usuario WHERE id = $1",
    [id]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    nome: linhas[0].nome,
    ativo: linhas[0].ativo,
  };
}

/** Todos os usuários ativos — o público do aviso de publicação (B3). */
export async function usuariosAtivos(cliente: PoolClient): Promise<number[]> {
  const { rows } = await cliente.query<{ id: string }>(
    "SELECT id FROM sistema.usuario WHERE ativo"
  );
  return rows.map((linha) => Number(linha.id));
}

/**
 * Quem ainda deve ciência nesta versão — o público do LEMBRETE (B1). Fica de
 * fora quem já assinou, quem recusou (lembrar quem recusou é constranger, o
 * caminho dali é o ato) e quem foi liberado.
 */
export async function usuariosPendentesDoDocumento(
  cliente: PoolClient,
  documentoId: number
): Promise<number[]> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT u.id
       FROM sistema.usuario u
      WHERE u.ativo
        AND NOT EXISTS (SELECT 1 FROM rh.ciencia c
                         WHERE c.documento_id = $1 AND c.usuario_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM rh.documento_recusa r
                         WHERE r.documento_id = $1 AND r.usuario_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM rh.conduta_liberacao l
                         WHERE l.documento_id = $1 AND l.usuario_id = u.id)`,
    [documentoId]
  );
  return rows.map((linha) => Number(linha.id));
}

export async function registrarLeituraSensivel(
  cliente: PoolClient,
  entrada: {
    usuarioId: number;
    chavePermissao: string;
    recurso: string;
    registroId: string;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO audit.leitura_sensivel
       (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [
      entrada.usuarioId,
      entrada.chavePermissao,
      entrada.recurso,
      entrada.registroId,
    ]
  );
}
