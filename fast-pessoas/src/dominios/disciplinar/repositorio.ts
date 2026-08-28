import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";

// ===========================================================================
// Repositório do domínio DISCIPLINAR (migration 0080). SQL só; a autorização e
// as regras ficam no serviço. Duas tabelas:
//   • rh.tipo_medida_disciplinar — catálogo administrável (molde 0054).
//   • rh.medida_disciplinar       — o registro, append-only SELETIVO (só o `fim`
//     da suspensão muda; o resto é imutável; DELETE barrado por trigger).
// ===========================================================================

/** Igual ao das outras fatias: uma chave, uma pergunta ao banco (eixo 4). */
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
 * Trilha de leitura sensível (eixo 8). Molde de clima/repositorio.ts:358 — grava
 * DENTRO da transação da leitura, com a chave que DE FATO autorizou. `registroId`
 * nulo cobre a busca que voltou vazia.
 */
export async function registrarLeituraSensivel(
  cliente: PoolClient,
  entrada: {
    usuarioId: number;
    chavePermissao: string;
    recurso: string;
    registroId: string | null;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO audit.leitura_sensivel (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [entrada.usuarioId, entrada.chavePermissao, entrada.recurso, entrada.registroId]
  );
}

// ------------------------------------------------------------------ medida disciplinar

export interface MedidaDisciplinar {
  id: number;
  colaborador_id: number;
  tipo_chave: string;
  tipo_nome: string;
  /** Do tipo: se TRUE a medida usa janela (inicio/fim); se FALSE é pontual. */
  com_periodo: boolean;
  descricao: string;
  impacto: string | null;
  acao_combinada: string | null;
  aplicada_em: string;
  inicio: string | null;
  fim: string | null;
  registrado_por_nome: string;
  registrado_em: string;
}

interface LinhaMedida {
  id: string;
  colaborador_id: string;
  tipo_chave: string;
  tipo_nome: string;
  com_periodo: boolean;
  descricao: string;
  impacto: string | null;
  acao_combinada: string | null;
  aplicada_em: string;
  inicio: string | null;
  fim: string | null;
  registrado_por_nome: string;
  registrado_em: string;
}

function montarMedida(linha: LinhaMedida): MedidaDisciplinar {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
  };
}

const SELECT_MEDIDA = `SELECT m.id, m.colaborador_id, m.tipo_chave,
                              t.nome AS tipo_nome, t.com_periodo,
                              m.descricao, m.impacto, m.acao_combinada,
                              m.aplicada_em::text AS aplicada_em,
                              m.inicio::text AS inicio, m.fim::text AS fim,
                              u.nome AS registrado_por_nome,
                              m.registrado_em::text AS registrado_em
                         FROM rh.medida_disciplinar m
                         JOIN rh.tipo_medida_disciplinar t ON t.chave = m.tipo_chave
                         JOIN sistema.usuario u ON u.id = m.registrado_por`;

/** Medidas de um colaborador, da mais recente para a mais antiga. */
export async function listarMedidas(
  cliente: PoolClient,
  colaboradorId: number
): Promise<MedidaDisciplinar[]> {
  const { rows } = await cliente.query<LinhaMedida>(
    `${SELECT_MEDIDA}
      WHERE m.colaborador_id = $1
      ORDER BY m.aplicada_em DESC, m.id DESC`,
    [colaboradorId]
  );
  return rows.map(montarMedida);
}

export async function inserirMedida(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    tipo_chave: string;
    descricao: string;
    impacto: string | null;
    acao_combinada: string | null;
    aplicada_em: string;
    inicio: string | null;
    fim: string | null;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.medida_disciplinar
       (colaborador_id, tipo_chave, descricao, impacto, acao_combinada,
        aplicada_em, inicio, fim, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.tipo_chave,
      dados.descricao,
      dados.impacto,
      dados.acao_combinada,
      dados.aplicada_em,
      dados.inicio,
      dados.fim,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}

/**
 * Fechar/reduzir a janela da suspensão — o único UPDATE que o trigger deixa
 * passar. Base da integração eixo-10 (o desligamento fecha as janelas abertas);
 * a UI de fechamento ainda não foi construída nesta fatia.
 */
export async function fecharSuspensao(
  cliente: PoolClient,
  id: number,
  fim: string
): Promise<void> {
  await cliente.query(
    "UPDATE rh.medida_disciplinar SET fim = $2 WHERE id = $1",
    [id, fim]
  );
}

/** A medida travada para o fechamento manual (D1:a) — só o que a régua lê. */
export interface MedidaParaFechar {
  id: number;
  colaborador_id: number;
  tipo_chave: string;
  tipo_nome: string;
  inicio: string | null;
  fim: string | null;
}

export async function buscarMedidaParaFechar(
  cliente: PoolClient,
  id: number
): Promise<MedidaParaFechar | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    tipo_chave: string;
    tipo_nome: string;
    inicio: string | null;
    fim: string | null;
  }>(
    `SELECT m.id, m.colaborador_id, m.tipo_chave, t.nome AS tipo_nome,
            m.inicio::text AS inicio, m.fim::text AS fim
       FROM rh.medida_disciplinar m
       JOIN rh.tipo_medida_disciplinar t ON t.chave = m.tipo_chave
      WHERE m.id = $1
      FOR UPDATE OF m`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    colaborador_id: Number(rows[0].colaborador_id),
  };
}

/**
 * O UPDATE do fechamento manual (D1:a), com a régua INTEIRA repetida no
 * predicado — guarda própria, no molde de `suspensoesAlemDe`: janela VIVA
 * (fim nulo ou ainda no futuro de rh.hoje()), novo fim nunca antes do início
 * (retroativo até ali é aceito) e SÓ ENCURTANDO (novo fim antes do fim atual).
 * O serviço valida antes com mensagem amigável; aqui o rowCount é a verdade —
 * zero linhas significa que a régua (ou uma corrida) barrou, e nada mudou.
 */
export async function encurtarSuspensaoViva(
  cliente: PoolClient,
  id: number,
  novoFim: string
): Promise<boolean> {
  const { rowCount } = await cliente.query(
    `UPDATE rh.medida_disciplinar m
        SET fim = $2
      WHERE m.id = $1
        AND m.inicio IS NOT NULL
        AND (m.fim IS NULL OR m.fim > rh.hoje())
        AND $2::date >= m.inicio
        AND (m.fim IS NULL OR $2::date < m.fim)`,
    [id, novoFim]
  );
  return (rowCount ?? 0) > 0;
}

export interface SuspensaoAberta {
  id: number;
  tipo_nome: string;
  inicio: string;
  /** null = janela aberta (o schema permite, embora o app hoje sempre grave fim). */
  fim: string | null;
}

/**
 * Janelas de suspensão que SOBREVIVERIAM ao desligamento numa data: fim ABERTO
 * (nulo — o schema da 0080 permite, ainda que registrarMedida hoje exija fim) OU
 * fim DEPOIS da data do término. É a consulta que o DESLIGAMENTO usa para
 * encolhê-las no encerramento (eixo 10: quem encerra o vínculo fecha as janelas
 * dele). Só `fim IS NULL` era código morto: a suspensão real nasce com fim, e o
 * caso que ocorre é a janela agendada ultrapassando o término (achado da revisão).
 */
export async function suspensoesAlemDe(
  cliente: PoolClient,
  colaboradorId: number,
  dataTermino: string
): Promise<SuspensaoAberta[]> {
  const { rows } = await cliente.query<{
    id: string;
    tipo_nome: string;
    inicio: string;
    fim: string | null;
  }>(
    `SELECT m.id, t.nome AS tipo_nome, m.inicio::text AS inicio, m.fim::text AS fim
       FROM rh.medida_disciplinar m
       JOIN rh.tipo_medida_disciplinar t ON t.chave = m.tipo_chave
      WHERE m.colaborador_id = $1
        AND m.inicio IS NOT NULL
        AND (m.fim IS NULL OR m.fim > $2::date)
      ORDER BY m.inicio, m.id`,
    [colaboradorId, dataTermino]
  );
  return rows.map((linha) => ({
    id: Number(linha.id),
    tipo_nome: linha.tipo_nome,
    inicio: linha.inicio,
    fim: linha.fim,
  }));
}

// ------------------------------------------------------------------ histórico por tipo (escalonamento MANUAL)

export interface ContagemTipo {
  tipo_chave: string;
  nome: string;
  total: number;
}

/**
 * Quantas medidas de cada tipo esta pessoa já tem — o DP olha e decide o
 * escalonamento (não há limiar chumbado; a decisão é humana). Só os tipos que
 * já aparecem no histórico dela, do mais usado ao menos usado.
 */
export async function contarPorTipo(
  cliente: PoolClient,
  colaboradorId: number
): Promise<ContagemTipo[]> {
  const { rows } = await cliente.query<{
    tipo_chave: string;
    nome: string;
    total: string;
  }>(
    `SELECT m.tipo_chave, t.nome, count(*) AS total
       FROM rh.medida_disciplinar m
       JOIN rh.tipo_medida_disciplinar t ON t.chave = m.tipo_chave
      WHERE m.colaborador_id = $1
      GROUP BY m.tipo_chave, t.nome, t.ordem
      ORDER BY count(*) DESC, t.ordem`,
    [colaboradorId]
  );
  return rows.map((linha) => ({
    tipo_chave: linha.tipo_chave,
    nome: linha.nome,
    total: Number(linha.total),
  }));
}

// ------------------------------------------------------------------ catálogo de tipos (molde 0054)

export interface TipoMedidaDisciplinar {
  id: number;
  chave: string;
  nome: string;
  ordem: number;
  com_periodo: boolean;
  ativo: boolean;
  /** Quantas medidas já usam este tipo (por isso não se apaga; inativa-se). */
  em_uso: number;
}

type LinhaTipo = {
  id: string;
  chave: string;
  nome: string;
  ordem: number;
  com_periodo: boolean;
  ativo: boolean;
  em_uso: string;
};

function montarTipo(linha: LinhaTipo): TipoMedidaDisciplinar {
  return {
    id: Number(linha.id),
    chave: linha.chave,
    nome: linha.nome,
    ordem: linha.ordem,
    com_periodo: linha.com_periodo,
    ativo: linha.ativo,
    em_uso: Number(linha.em_uso),
  };
}

const SELECT_TIPO = `SELECT t.id, t.chave, t.nome, t.ordem, t.com_periodo,
                            (t.inativado_em IS NULL) AS ativo,
                            (SELECT count(*) FROM rh.medida_disciplinar m
                              WHERE m.tipo_chave = t.chave) AS em_uso
                       FROM rh.tipo_medida_disciplinar t`;

/**
 * `apenasAtivos` é o que o seletor de registro usa: tipo inativado some das
 * escolhas NOVAS e continua rotulando a medida já gravada com ele.
 */
export async function listarTipos(
  apenasAtivos: boolean
): Promise<TipoMedidaDisciplinar[]> {
  const linhas = await consultar<LinhaTipo>(
    `${SELECT_TIPO}
      ${apenasAtivos ? "WHERE t.inativado_em IS NULL" : ""}
      ORDER BY (t.inativado_em IS NULL) DESC, t.ordem, t.nome`
  );
  return linhas.map(montarTipo);
}

export async function listarTiposAtivos(): Promise<TipoMedidaDisciplinar[]> {
  return listarTipos(true);
}

export async function buscarTipoParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<TipoMedidaDisciplinar | null> {
  const { rows } = await cliente.query<LinhaTipo>(
    `${SELECT_TIPO} WHERE t.id = $1 FOR UPDATE OF t`,
    [id]
  );
  return rows.length === 0 ? null : montarTipo(rows[0]);
}

export async function inserirTipo(
  cliente: PoolClient,
  dados: { chave: string; nome: string; com_periodo: boolean }
): Promise<number> {
  // Nasce no fim da ordem; quem reordena é a tela, não uma constante aqui.
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.tipo_medida_disciplinar (chave, nome, com_periodo, ordem)
     VALUES ($1, $2, $3,
             COALESCE((SELECT max(ordem) + 10 FROM rh.tipo_medida_disciplinar), 500))
     RETURNING id`,
    [dados.chave, dados.nome, dados.com_periodo]
  );
  return Number(rows[0].id);
}

/** `inativadoPor` nulo = reativar. Exclusão não existe: o trigger da 0080 barra. */
export async function inativarTipo(
  cliente: PoolClient,
  id: number,
  inativadoPor: number | null
): Promise<void> {
  await cliente.query(
    `UPDATE rh.tipo_medida_disciplinar
        SET inativado_em  = CASE WHEN $2::BIGINT IS NULL THEN NULL ELSE now() END,
            inativado_por = $2
      WHERE id = $1`,
    [id, inativadoPor]
  );
}

// ------------------------------------------------------------------ apoio

/** Existência do colaborador + a conta de acesso dele (para o aviso neutro). */
export async function buscarColaboradorDaMedida(
  cliente: PoolClient,
  id: number
): Promise<{ nome_completo: string; usuario_id: number | null } | null> {
  const { rows } = await cliente.query<{
    nome_completo: string;
    usuario_id: string | null;
  }>(
    "SELECT nome_completo, usuario_id FROM rh.colaborador WHERE id = $1",
    [id]
  );
  if (rows.length === 0) return null;
  return {
    nome_completo: rows[0].nome_completo,
    usuario_id: rows[0].usuario_id === null ? null : Number(rows[0].usuario_id),
  };
}
