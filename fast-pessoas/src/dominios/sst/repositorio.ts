import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  ClassificacaoRisco,
  ResultadoAso,
  StatusCat,
  TipoAso,
  TipoCat,
} from "./esquemas";

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

export async function buscarColaborador(
  id: number
): Promise<{ id: number; nome_completo: string; matricula: string } | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    "SELECT id, nome_completo, matricula FROM rh.colaborador WHERE id = $1",
    [id]
  );
  if (linhas.length === 0) return null;
  return { ...linhas[0], id: Number(linhas[0].id) };
}

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

export async function buscarDocumento(id: number): Promise<{
  id: number;
  titulo: string;
  colaborador_id: number | null;
  hash_sha256: string;
} | null> {
  const linhas = await consultar<{
    id: string;
    titulo: string;
    colaborador_id: string | null;
    hash_sha256: string;
  }>(
    `SELECT id, titulo, colaborador_id, hash_sha256
       FROM rh.documento WHERE id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    titulo: linhas[0].titulo,
    colaborador_id:
      linhas[0].colaborador_id === null
        ? null
        : Number(linhas[0].colaborador_id),
    hash_sha256: linhas[0].hash_sha256,
  };
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

// ------------------------------------------------------------------ ASO

/** Linha crua — restricoes_cifradas NUNCA sai daqui sem passar pelo serviço. */
export interface AsoLinha {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoAso;
  data_exame: string;
  validade: string | null;
  resultado: ResultadoAso;
  restricoes_cifradas: string | null;
  documento_id: number | null;
  documento_titulo: string | null;
  registrado_por_nome: string;
  criado_em: string;
}

export async function listarAsos(): Promise<AsoLinha[]> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    tipo: TipoAso;
    data_exame: string;
    validade: string | null;
    resultado: ResultadoAso;
    restricoes_cifradas: string | null;
    documento_id: string | null;
    documento_titulo: string | null;
    registrado_por_nome: string;
    criado_em: string;
  }>(
    `SELECT a.id, a.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, a.tipo, a.data_exame::text AS data_exame,
            a.validade::text AS validade, a.resultado, a.restricoes_cifradas,
            a.documento_id, d.titulo AS documento_titulo,
            u.nome AS registrado_por_nome, a.criado_em::text AS criado_em
       FROM rh.aso a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
       JOIN sistema.usuario u ON u.id = a.registrado_por
       LEFT JOIN rh.documento d ON d.id = a.documento_id
      ORDER BY a.data_exame DESC, a.id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    documento_id:
      linha.documento_id === null ? null : Number(linha.documento_id),
  }));
}

export async function inserirAso(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    tipo: TipoAso;
    data_exame: string;
    validade: string | null;
    resultado: ResultadoAso;
    restricoes_cifradas: string | null;
    documento_id: number | null;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.aso
       (colaborador_id, tipo, data_exame, validade, resultado,
        restricoes_cifradas, documento_id, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.tipo,
      dados.data_exame,
      dados.validade,
      dados.resultado,
      dados.restricoes_cifradas,
      dados.documento_id,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}

/**
 * Última validade de ASO por colaborador não desligado (afastados incluídos —
 * seguem monitorados). validade NULL = nenhum ASO com data-limite registrada.
 */
export interface ValidadePorColaborador {
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  validade: string | null;
}

export async function listarValidadePorColaborador(): Promise<
  ValidadePorColaborador[]
> {
  const linhas = await consultar<{
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    validade: string | null;
  }>(
    `SELECT c.id AS colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, max(a.validade)::text AS validade
       FROM rh.colaborador c
       LEFT JOIN rh.aso a
         ON a.colaborador_id = c.id AND a.validade IS NOT NULL
      WHERE c.status <> 'desligado'
      GROUP BY c.id, c.nome_completo, c.matricula
      ORDER BY max(a.validade) ASC NULLS FIRST, c.nome_completo`
  );
  return linhas.map((linha) => ({
    ...linha,
    colaborador_id: Number(linha.colaborador_id),
  }));
}

/** Agregados do indicador — contagens, nunca conteúdo clínico. */
export async function contarAtivosComAsoValido(): Promise<{
  ativos: number;
  com_aso_valido: number;
}> {
  const linhas = await consultar<{
    ativos: number;
    com_aso_valido: number;
  }>(
    `SELECT count(*)::int AS ativos,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM rh.aso a
               WHERE a.colaborador_id = c.id AND a.validade >= CURRENT_DATE
            ))::int AS com_aso_valido
       FROM rh.colaborador c
      WHERE c.status = 'ativo'`
  );
  return linhas[0] ?? { ativos: 0, com_aso_valido: 0 };
}

// ------------------------------------------------------------------ NR-1 / avaliação psicossocial

/** ASO existente — usado para validar o vínculo da avaliação (mesmo titular). */
export async function buscarAso(id: number): Promise<{
  id: number;
  colaborador_id: number;
  data_exame: string;
  validade: string | null;
} | null> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    data_exame: string;
    validade: string | null;
  }>(
    `SELECT id, colaborador_id, data_exame::text AS data_exame,
            validade::text AS validade
       FROM rh.aso WHERE id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    colaborador_id: Number(linhas[0].colaborador_id),
    data_exame: linhas[0].data_exame,
    validade: linhas[0].validade,
  };
}

/** Linha crua — observacoes_cifradas NUNCA sai daqui sem passar pelo serviço. */
export interface PsicossocialLinha {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data_avaliacao: string;
  validade: string | null;
  classificacao_risco: ClassificacaoRisco;
  observacoes_cifradas: string | null;
  documento_id: number | null;
  documento_titulo: string | null;
  aso_id: number | null;
  empresa_executora: string | null;
  registrado_por_nome: string;
  criado_em: string;
}

export async function listarPsicossociais(): Promise<PsicossocialLinha[]> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    data_avaliacao: string;
    validade: string | null;
    classificacao_risco: ClassificacaoRisco;
    observacoes_cifradas: string | null;
    documento_id: string | null;
    documento_titulo: string | null;
    aso_id: string | null;
    empresa_executora: string | null;
    registrado_por_nome: string;
    criado_em: string;
  }>(
    `SELECT p.id, p.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, p.data_avaliacao::text AS data_avaliacao,
            p.validade::text AS validade, p.classificacao_risco,
            p.observacoes_cifradas, p.documento_id, d.titulo AS documento_titulo,
            p.aso_id, p.empresa_executora, u.nome AS registrado_por_nome,
            p.criado_em::text AS criado_em
       FROM rh.avaliacao_psicossocial p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
       JOIN sistema.usuario u ON u.id = p.registrado_por
       LEFT JOIN rh.documento d ON d.id = p.documento_id
      ORDER BY p.data_avaliacao DESC, p.id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    documento_id:
      linha.documento_id === null ? null : Number(linha.documento_id),
    aso_id: linha.aso_id === null ? null : Number(linha.aso_id),
  }));
}

export async function inserirPsicossocial(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    data_avaliacao: string;
    validade: string | null;
    classificacao_risco: ClassificacaoRisco;
    observacoes_cifradas: string | null;
    documento_id: number | null;
    aso_id: number | null;
    empresa_executora: string | null;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.avaliacao_psicossocial
       (colaborador_id, data_avaliacao, validade, classificacao_risco,
        observacoes_cifradas, documento_id, aso_id, empresa_executora,
        registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.data_avaliacao,
      dados.validade,
      dados.classificacao_risco,
      dados.observacoes_cifradas,
      dados.documento_id,
      dados.aso_id,
      dados.empresa_executora,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}

/**
 * Última validade de avaliação psicossocial por colaborador não desligado —
 * espelho exato do controle do ASO (afastados seguem monitorados).
 */
export async function listarValidadePsicossocialPorColaborador(): Promise<
  ValidadePorColaborador[]
> {
  const linhas = await consultar<{
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    validade: string | null;
  }>(
    `SELECT c.id AS colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, max(p.validade)::text AS validade
       FROM rh.colaborador c
       LEFT JOIN rh.avaliacao_psicossocial p
         ON p.colaborador_id = c.id AND p.validade IS NOT NULL
      WHERE c.status <> 'desligado'
      GROUP BY c.id, c.nome_completo, c.matricula
      ORDER BY max(p.validade) ASC NULLS FIRST, c.nome_completo`
  );
  return linhas.map((linha) => ({
    ...linha,
    colaborador_id: Number(linha.colaborador_id),
  }));
}

/** Agregados do indicador — contagens, nunca conteúdo clínico. */
export async function contarAtivosComPsicossocialValida(): Promise<{
  ativos: number;
  com_avaliacao_valida: number;
}> {
  const linhas = await consultar<{
    ativos: number;
    com_avaliacao_valida: number;
  }>(
    `SELECT count(*)::int AS ativos,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM rh.avaliacao_psicossocial p
               WHERE p.colaborador_id = c.id AND p.validade >= CURRENT_DATE
            ))::int AS com_avaliacao_valida
       FROM rh.colaborador c
      WHERE c.status = 'ativo'`
  );
  return linhas[0] ?? { ativos: 0, com_avaliacao_valida: 0 };
}

// ------------------------------------------------------------------ EPI — catálogo

export interface ItemEpiLinha {
  id: number;
  nome: string;
  numero_ca: string | null;
  validade_ca: string | null;
  ativo: boolean;
}

export async function listarItensEpi(): Promise<ItemEpiLinha[]> {
  const linhas = await consultar<{
    id: string;
    nome: string;
    numero_ca: string | null;
    validade_ca: string | null;
    ativo: boolean;
  }>(
    `SELECT id, nome, numero_ca, validade_ca::text AS validade_ca, ativo
       FROM rh.epi_item
      ORDER BY nome, id`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarItemEpi(
  id: number
): Promise<ItemEpiLinha | null> {
  const linhas = await consultar<{
    id: string;
    nome: string;
    numero_ca: string | null;
    validade_ca: string | null;
    ativo: boolean;
  }>(
    `SELECT id, nome, numero_ca, validade_ca::text AS validade_ca, ativo
       FROM rh.epi_item WHERE id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  return { ...linhas[0], id: Number(linhas[0].id) };
}

export async function inserirItemEpi(
  cliente: PoolClient,
  dados: {
    nome: string;
    numero_ca: string | null;
    validade_ca: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.epi_item (nome, numero_ca, validade_ca)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [dados.nome, dados.numero_ca, dados.validade_ca]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ EPI — entregas

export interface EntregaEpiLinha {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  epi_item_id: number;
  item_nome: string;
  numero_ca: string | null;
  quantidade: number;
  data_entrega: string;
  termo_documento_id: number | null;
  termo_titulo: string | null;
  ciencia_registrada: boolean;
  devolvido_em: string | null;
}

const SELECT_ENTREGA = `
  SELECT e.id, e.colaborador_id, c.nome_completo AS colaborador_nome,
         c.matricula, e.epi_item_id, i.nome AS item_nome, i.numero_ca,
         e.quantidade, e.data_entrega::text AS data_entrega,
         e.termo_documento_id, d.titulo AS termo_titulo,
         e.ciencia_registrada, e.devolvido_em::text AS devolvido_em
    FROM rh.epi_entrega e
    JOIN rh.colaborador c ON c.id = e.colaborador_id
    JOIN rh.epi_item i ON i.id = e.epi_item_id
    LEFT JOIN rh.documento d ON d.id = e.termo_documento_id`;

interface EntregaEpiCrua {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  matricula: string;
  epi_item_id: string;
  item_nome: string;
  numero_ca: string | null;
  quantidade: number;
  data_entrega: string;
  termo_documento_id: string | null;
  termo_titulo: string | null;
  ciencia_registrada: boolean;
  devolvido_em: string | null;
  [chave: string]: unknown;
}

function mapearEntrega(linha: EntregaEpiCrua): EntregaEpiLinha {
  return {
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    epi_item_id: Number(linha.epi_item_id),
    item_nome: linha.item_nome,
    numero_ca: linha.numero_ca,
    quantidade: linha.quantidade,
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

export async function listarEntregasEpi(): Promise<EntregaEpiLinha[]> {
  const linhas = await consultar<EntregaEpiCrua>(
    `${SELECT_ENTREGA}
      ORDER BY c.nome_completo, e.data_entrega DESC, e.id DESC`
  );
  return linhas.map(mapearEntrega);
}

export async function listarEntregasDoColaborador(
  colaboradorId: number
): Promise<EntregaEpiLinha[]> {
  const linhas = await consultar<EntregaEpiCrua>(
    `${SELECT_ENTREGA}
      WHERE e.colaborador_id = $1
      ORDER BY e.data_entrega DESC, e.id DESC`,
    [colaboradorId]
  );
  return linhas.map(mapearEntrega);
}

export async function buscarEntregaEpi(
  id: number
): Promise<EntregaEpiLinha | null> {
  const linhas = await consultar<EntregaEpiCrua>(
    `${SELECT_ENTREGA}
      WHERE e.id = $1`,
    [id]
  );
  return linhas.length > 0 ? mapearEntrega(linhas[0]) : null;
}

export async function inserirEntregaEpi(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    epi_item_id: number;
    quantidade: number;
    data_entrega: string;
    termo_documento_id: number | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.epi_entrega
       (colaborador_id, epi_item_id, quantidade, data_entrega, termo_documento_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.epi_item_id,
      dados.quantidade,
      dados.data_entrega,
      dados.termo_documento_id,
    ]
  );
  return Number(rows[0].id);
}

export async function marcarDevolucaoEpi(
  cliente: PoolClient,
  id: number
): Promise<string> {
  const { rows } = await cliente.query<{ devolvido_em: string }>(
    `UPDATE rh.epi_entrega SET devolvido_em = now()
      WHERE id = $1
      RETURNING devolvido_em::text AS devolvido_em`,
    [id]
  );
  return rows[0].devolvido_em;
}

export async function marcarCienciaEntregaEpi(
  cliente: PoolClient,
  id: number
): Promise<void> {
  await cliente.query(
    "UPDATE rh.epi_entrega SET ciencia_registrada = TRUE WHERE id = $1",
    [id]
  );
}

/** Ciência já dada no GED sobre este documento por este usuário? */
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

// ------------------------------------------------------------------ CAT

export interface CatLinha {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoCat;
  data_acidente: string;
  descricao: string;
  houve_afastamento: boolean;
  afastamento_id: number | null;
  status: StatusCat;
  cat_anterior_id: number | null;
  substituida_por_id: number | null;
  registrado_por_nome: string;
  registrada_em: string;
}

export async function listarCats(): Promise<CatLinha[]> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    tipo: TipoCat;
    data_acidente: string;
    descricao: string;
    houve_afastamento: boolean;
    afastamento_id: string | null;
    status: StatusCat;
    cat_anterior_id: string | null;
    substituida_por_id: string | null;
    registrado_por_nome: string;
    registrada_em: string;
  }>(
    `SELECT t.id, t.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, t.tipo, t.data_acidente::text AS data_acidente,
            t.descricao, t.houve_afastamento, t.afastamento_id, t.status,
            t.cat_anterior_id, s.id AS substituida_por_id,
            u.nome AS registrado_por_nome,
            t.registrada_em::text AS registrada_em
       FROM rh.cat t
       JOIN rh.colaborador c ON c.id = t.colaborador_id
       JOIN sistema.usuario u ON u.id = t.registrado_por
       LEFT JOIN rh.cat s ON s.cat_anterior_id = t.id
      ORDER BY t.data_acidente DESC, t.id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    afastamento_id:
      linha.afastamento_id === null ? null : Number(linha.afastamento_id),
    cat_anterior_id:
      linha.cat_anterior_id === null ? null : Number(linha.cat_anterior_id),
    substituida_por_id:
      linha.substituida_por_id === null
        ? null
        : Number(linha.substituida_por_id),
  }));
}

export async function buscarCat(id: number): Promise<{
  id: number;
  colaborador_id: number;
  substituida_por_id: number | null;
} | null> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    substituida_por_id: string | null;
  }>(
    `SELECT t.id, t.colaborador_id, s.id AS substituida_por_id
       FROM rh.cat t
       LEFT JOIN rh.cat s ON s.cat_anterior_id = t.id
      WHERE t.id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    colaborador_id: Number(linhas[0].colaborador_id),
    substituida_por_id:
      linhas[0].substituida_por_id === null
        ? null
        : Number(linhas[0].substituida_por_id),
  };
}

export async function inserirCat(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    tipo: TipoCat;
    data_acidente: string;
    descricao: string;
    houve_afastamento: boolean;
    afastamento_id: number | null;
    status: StatusCat;
    cat_anterior_id: number | null;
    registrado_por: number;
  }
): Promise<{ id: number; registrada_em: string }> {
  const { rows } = await cliente.query<{
    id: string;
    registrada_em: string;
  }>(
    `INSERT INTO rh.cat
       (colaborador_id, tipo, data_acidente, descricao, houve_afastamento,
        afastamento_id, status, cat_anterior_id, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, registrada_em::text AS registrada_em`,
    [
      dados.colaborador_id,
      dados.tipo,
      dados.data_acidente,
      dados.descricao,
      dados.houve_afastamento,
      dados.afastamento_id,
      dados.status,
      dados.cat_anterior_id,
      dados.registrado_por,
    ]
  );
  return { id: Number(rows[0].id), registrada_em: rows[0].registrada_em };
}

/** Afastamento candidato a vínculo de CAT — o tipo é conferido aqui, no SQL. */
export async function buscarAfastamentoAcidente(id: number): Promise<{
  id: number;
  colaborador_id: number;
  inicio: string;
  fim: string | null;
} | null> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    inicio: string;
    fim: string | null;
  }>(
    `SELECT id, colaborador_id, inicio::text AS inicio, fim::text AS fim
       FROM rh.afastamento
      WHERE id = $1 AND tipo = 'acidente_trabalho'`,
    [id]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    colaborador_id: Number(linhas[0].colaborador_id),
    inicio: linhas[0].inicio,
    fim: linhas[0].fim,
  };
}

export async function listarAfastamentosAcidente(): Promise<
  { id: number; colaborador_id: number; inicio: string; fim: string | null }[]
> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    inicio: string;
    fim: string | null;
  }>(
    `SELECT id, colaborador_id, inicio::text AS inicio, fim::text AS fim
       FROM rh.afastamento
      WHERE tipo = 'acidente_trabalho'
      ORDER BY inicio DESC, id DESC`
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    inicio: linha.inicio,
    fim: linha.fim,
  }));
}
