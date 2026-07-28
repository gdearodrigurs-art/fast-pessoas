import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  Cha,
  FiltroColaboradores,
  StatusAcao,
  StatusColaborador,
  TipoOcorrencia,
  TipoVinculo,
} from "./esquemas";

// ------------------------------------------------------------------ escopo de visibilidade
// A regra "quem vê quem" é do repositório: gestor enxerga a si e aos liderados
// com relação VIGENTE; funcionário só a própria ficha; rh/dp/diretoria, todos.

export type Escopo =
  | { alcance: "todos" }
  | { alcance: "equipe"; colaboradorId: number | null }
  | { alcance: "proprio"; colaboradorId: number | null };

function condicaoEscopo(
  escopo: Escopo,
  parametros: unknown[],
  alias = "c"
): string {
  if (escopo.alcance === "todos") return "TRUE";
  if (escopo.colaboradorId === null) return "FALSE";
  parametros.push(escopo.colaboradorId);
  const n = parametros.length;
  if (escopo.alcance === "proprio") return `${alias}.id = $${n}`;
  return `(${alias}.id = $${n} OR ${alias}.id IN (
      SELECT rg.liderado_colaborador_id
        FROM rh.relacao_gestor rg
       WHERE rg.gestor_colaborador_id = $${n} AND rg.fim_vigencia IS NULL))`;
}

export async function colaboradorIdDoUsuario(
  usuarioId: number
): Promise<number | null> {
  const linhas = await consultar<{ id: string }>(
    "SELECT id FROM rh.colaborador WHERE usuario_id = $1",
    [usuarioId]
  );
  return linhas.length > 0 ? Number(linhas[0].id) : null;
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

export async function colaboradorNoEscopo(
  id: number,
  escopo: Escopo
): Promise<boolean> {
  const parametros: unknown[] = [id];
  const linhas = await consultar<{ id: string }>(
    `SELECT c.id FROM rh.colaborador c
      WHERE c.id = $1 AND ${condicaoEscopo(escopo, parametros)}`,
    parametros
  );
  return linhas.length > 0;
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

export interface ColaboradorResumo {
  id: number;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  cargo_nome: string | null;
  unidade: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
}

export interface FichaColaborador extends ColaboradorResumo {
  usuario_id: number;
  matricula_esocial: string;
  cpf: string;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  email: string;
  usuario_ativo: boolean;
  centro_custo: string | null;
  gestor_id: number | null;
  gestor_nome: string | null;
  ultimo_feedback_em: string | null;
}

export interface ColaboradorParaAtualizar {
  id: number;
  usuario_id: number;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  usuario_ativo: boolean;
}

export interface EventoLinhaTempo {
  id: number;
  tipo: string;
  ocorrido_em: string;
  resumo: string;
}

export interface CamposColaborador {
  nome_completo?: string;
  retrato?: string | null;
  contexto?: string | null;
  tipo_vinculo?: TipoVinculo;
  status?: StatusColaborador;
  data_desligamento?: string | null;
}

interface LinhaResumo extends Record<string, unknown> {
  id: string;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  cargo_nome: string | null;
  unidade: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
}

interface LinhaFicha extends LinhaResumo {
  usuario_id: string;
  matricula_esocial: string;
  cpf: string;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  email: string;
  usuario_ativo: boolean;
  centro_custo: string | null;
  gestor_id: string | null;
  gestor_nome: string | null;
  ultimo_feedback_em: string | null;
}

// Laterais compartilhadas de projeção vigente (cargo, lotação, gestor, feedback).
const LATERAIS_VIGENTES = `
  LEFT JOIN LATERAL (
    SELECT cv.nome AS cargo_nome
      FROM rh.posicao_colaborador p
      JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
     WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL
  ) pos ON TRUE
  LEFT JOIN LATERAL (
    SELECT ev.unidade, l.centro_custo
      FROM rh.lotacao l
      LEFT JOIN rh.estabelecimento_versao ev
        ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
     WHERE l.colaborador_id = c.id AND l.fim_vigencia IS NULL
  ) lot ON TRUE
  LEFT JOIN LATERAL (
    SELECT f.realizado_em::text AS ultimo_feedback_em,
           ((now() AT TIME ZONE 'America/Sao_Paulo')::date - f.realizado_em)
             AS dias_desde_feedback
      FROM rh.feedback_formal f
     WHERE f.colaborador_id = c.id
     ORDER BY f.realizado_em DESC, f.id DESC
     LIMIT 1
  ) fb ON TRUE`;

export async function listar(
  filtro: FiltroColaboradores,
  escopo: Escopo
): Promise<ColaboradorResumo[]> {
  const parametros: unknown[] = [];
  const condicoes: string[] = [condicaoEscopo(escopo, parametros)];
  if (filtro.busca) {
    parametros.push(`%${filtro.busca}%`);
    condicoes.push(
      `(c.nome_completo ILIKE $${parametros.length} OR c.matricula ILIKE $${parametros.length})`
    );
  }
  if (filtro.status) {
    parametros.push(filtro.status);
    condicoes.push(`c.status = $${parametros.length}`);
  }
  const linhas = await consultar<LinhaResumo>(
    `SELECT c.id, c.matricula, c.nome_completo, c.tipo_vinculo, c.status,
            c.data_admissao::text AS data_admissao,
            pos.cargo_nome, lot.unidade,
            fb.dias_desde_feedback,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_admissao)
              AS dias_desde_admissao
       FROM rh.colaborador c
       ${LATERAIS_VIGENTES}
      WHERE ${condicoes.join(" AND ")}
      ORDER BY c.nome_completo, c.id`,
    parametros
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarFicha(
  id: number,
  escopo: Escopo
): Promise<FichaColaborador | null> {
  const parametros: unknown[] = [id];
  const linhas = await consultar<LinhaFicha>(
    `SELECT c.id, c.usuario_id, c.matricula, c.matricula_esocial, c.cpf,
            c.nome_completo, c.tipo_vinculo, c.status,
            c.data_admissao::text AS data_admissao,
            c.data_desligamento::text AS data_desligamento,
            c.retrato, c.contexto,
            u.email, u.ativo AS usuario_ativo,
            pos.cargo_nome, lot.unidade, lot.centro_custo,
            ges.gestor_id, ges.gestor_nome,
            fb.ultimo_feedback_em, fb.dias_desde_feedback,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_admissao)
              AS dias_desde_admissao
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       ${LATERAIS_VIGENTES}
       LEFT JOIN LATERAL (
         SELECT g.id AS gestor_id, g.nome_completo AS gestor_nome
           FROM rh.relacao_gestor rg
           JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
          WHERE rg.liderado_colaborador_id = c.id AND rg.fim_vigencia IS NULL
       ) ges ON TRUE
      WHERE c.id = $1 AND ${condicaoEscopo(escopo, parametros)}`,
    parametros
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...linha,
    id: Number(linha.id),
    usuario_id: Number(linha.usuario_id),
    gestor_id: linha.gestor_id === null ? null : Number(linha.gestor_id),
  };
}

export async function listarEventos(
  colaboradorId: number,
  incluirRestritos: boolean
): Promise<EventoLinhaTempo[]> {
  const linhas = await consultar<{
    id: string;
    tipo: string;
    ocorrido_em: string;
    resumo: string;
  }>(
    `SELECT id, tipo, ocorrido_em, resumo
       FROM rh.evento_colaborador
      WHERE colaborador_id = $1
        AND ($2 OR COALESCE(payload->>'restrita', 'false') <> 'true')
      ORDER BY ocorrido_em DESC, id DESC`,
    [colaboradorId, incluirRestritos]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function criar(
  cliente: PoolClient,
  dados: {
    usuario_id: number;
    matricula: string;
    matricula_esocial: string;
    cpf: string;
    nome_completo: string;
    tipo_vinculo: TipoVinculo;
    data_admissao: string;
    retrato: string | null;
    contexto: string | null;
  }
): Promise<ColaboradorResumo> {
  const { rows } = await cliente.query<LinhaResumo>(
    `INSERT INTO rh.colaborador
       (usuario_id, matricula, matricula_esocial, cpf, nome_completo,
        tipo_vinculo, data_admissao, retrato, contexto)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, matricula, nome_completo, tipo_vinculo, status,
               data_admissao::text AS data_admissao`,
    [
      dados.usuario_id,
      dados.matricula,
      dados.matricula_esocial,
      dados.cpf,
      dados.nome_completo,
      dados.tipo_vinculo,
      dados.data_admissao,
      dados.retrato,
      dados.contexto,
    ]
  );
  const linha = rows[0];
  return { ...linha, id: Number(linha.id) };
}

export async function buscarParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<ColaboradorParaAtualizar | null> {
  const { rows } = await cliente.query<{
    id: string;
    usuario_id: string;
    matricula: string;
    nome_completo: string;
    tipo_vinculo: TipoVinculo;
    status: StatusColaborador;
    data_desligamento: string | null;
    retrato: string | null;
    contexto: string | null;
    usuario_ativo: boolean;
  }>(
    `SELECT c.id, c.usuario_id, c.matricula, c.nome_completo, c.tipo_vinculo,
            c.status, c.data_desligamento::text AS data_desligamento,
            c.retrato, c.contexto, u.ativo AS usuario_ativo
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE c.id = $1
      FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  const linha = rows[0];
  return {
    ...linha,
    id: Number(linha.id),
    usuario_id: Number(linha.usuario_id),
  };
}

const COLUNAS_ATUALIZAVEIS: Record<keyof CamposColaborador, string> = {
  nome_completo: "nome_completo",
  retrato: "retrato",
  contexto: "contexto",
  tipo_vinculo: "tipo_vinculo",
  status: "status",
  data_desligamento: "data_desligamento",
};

export async function atualizar(
  cliente: PoolClient,
  id: number,
  campos: CamposColaborador
): Promise<void> {
  const chaves = Object.keys(campos) as (keyof CamposColaborador)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${COLUNAS_ATUALIZAVEIS[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE rh.colaborador SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [id, ...chaves.map((chave) => campos[chave])]
  );
}

export async function inserirEvento(
  cliente: PoolClient,
  evento: {
    colaborador_id: number;
    tipo: string;
    ocorrido_em: string;
    origem_tabela: string;
    origem_id: number;
    resumo: string;
    payload: Record<string, unknown>;
    registrado_por: number;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.evento_colaborador
       (colaborador_id, tipo, ocorrido_em, origem_tabela, origem_id, resumo,
        payload, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      evento.colaborador_id,
      evento.tipo,
      evento.ocorrido_em,
      evento.origem_tabela,
      evento.origem_id,
      evento.resumo,
      JSON.stringify(evento.payload),
      evento.registrado_por,
    ]
  );
}

export async function desativarUsuario(
  cliente: PoolClient,
  usuarioId: number
): Promise<void> {
  await cliente.query(
    "UPDATE sistema.usuario SET ativo = FALSE WHERE id = $1",
    [usuarioId]
  );
}

// ------------------------------------------------------------------ apoio a escritas

export interface ColaboradorBasico {
  id: number;
  nome_completo: string;
  matricula: string;
  status: StatusColaborador;
}

export async function buscarBasico(
  cliente: PoolClient,
  id: number
): Promise<ColaboradorBasico | null> {
  const { rows } = await cliente.query<{
    id: string;
    nome_completo: string;
    matricula: string;
    status: StatusColaborador;
  }>(
    `SELECT id, nome_completo, matricula, status
       FROM rh.colaborador WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

// ------------------------------------------------------------------ ocorrências (append-only)

export interface Ocorrencia {
  id: number;
  tipo: TipoOcorrencia;
  restrita: boolean;
  descricao: string;
  impacto: string | null;
  acao_combinada: string | null;
  ocorrida_em: string;
  registrado_por_nome: string;
  registrado_em: string;
}

export async function listarOcorrencias(
  colaboradorId: number,
  incluirRestritas: boolean
): Promise<Ocorrencia[]> {
  const linhas = await consultar<{
    id: string;
    tipo: TipoOcorrencia;
    restrita: boolean;
    descricao: string;
    impacto: string | null;
    acao_combinada: string | null;
    ocorrida_em: string;
    registrado_por_nome: string;
    registrado_em: string;
  }>(
    `SELECT o.id, o.tipo, o.restrita, o.descricao, o.impacto, o.acao_combinada,
            o.ocorrida_em::text AS ocorrida_em,
            u.nome AS registrado_por_nome,
            o.registrado_em::text AS registrado_em
       FROM rh.ocorrencia o
       JOIN sistema.usuario u ON u.id = o.registrado_por
      WHERE o.colaborador_id = $1 AND ($2 OR NOT o.restrita)
      ORDER BY o.ocorrida_em DESC, o.id DESC`,
    [colaboradorId, incluirRestritas]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function inserirOcorrencia(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    tipo: TipoOcorrencia;
    restrita: boolean;
    descricao: string;
    impacto: string | null;
    acao_combinada: string | null;
    ocorrida_em: string;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ocorrencia
       (colaborador_id, tipo, restrita, descricao, impacto, acao_combinada,
        ocorrida_em, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.tipo,
      dados.restrita,
      dados.descricao,
      dados.impacto,
      dados.acao_combinada,
      dados.ocorrida_em,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ feedback formal (append-only)

export interface Feedback {
  id: number;
  realizado_em: string;
  resumo: string;
  registrado_por_nome: string;
  registrado_em: string;
}

export async function listarFeedbacks(
  colaboradorId: number
): Promise<Feedback[]> {
  const linhas = await consultar<{
    id: string;
    realizado_em: string;
    resumo: string;
    registrado_por_nome: string;
    registrado_em: string;
  }>(
    `SELECT f.id, f.realizado_em::text AS realizado_em, f.resumo,
            u.nome AS registrado_por_nome,
            f.registrado_em::text AS registrado_em
       FROM rh.feedback_formal f
       JOIN sistema.usuario u ON u.id = f.registrado_por
      WHERE f.colaborador_id = $1
      ORDER BY f.realizado_em DESC, f.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function cadenciaFeedback(colaboradorId: number): Promise<{
  data_admissao: string;
  ultimo_em: string | null;
  dias_desde: number | null;
  dias_desde_admissao: number;
} | null> {
  const linhas = await consultar<{
    data_admissao: string;
    ultimo_em: string | null;
    dias_desde: number | null;
    dias_desde_admissao: number;
  }>(
    `SELECT c.data_admissao::text AS data_admissao,
            fb.ultimo_feedback_em AS ultimo_em,
            fb.dias_desde_feedback AS dias_desde,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_admissao)
              AS dias_desde_admissao
       FROM rh.colaborador c
       LEFT JOIN LATERAL (
         SELECT f.realizado_em::text AS ultimo_feedback_em,
                ((now() AT TIME ZONE 'America/Sao_Paulo')::date - f.realizado_em)
                  AS dias_desde_feedback
           FROM rh.feedback_formal f
          WHERE f.colaborador_id = c.id
          ORDER BY f.realizado_em DESC, f.id DESC
          LIMIT 1
       ) fb ON TRUE
      WHERE c.id = $1`,
    [colaboradorId]
  );
  return linhas.length > 0 ? linhas[0] : null;
}

export async function inserirFeedback(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    realizado_em: string;
    resumo: string;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.feedback_formal (colaborador_id, realizado_em, resumo, registrado_por)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.realizado_em,
      dados.resumo,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ ações abertas

export interface Acao {
  id: number;
  descricao: string;
  prazo: string;
  status: StatusAcao;
  responsavel_nome: string;
  vencida: boolean;
  criado_em: string;
}

export async function listarAcoes(colaboradorId: number): Promise<Acao[]> {
  const linhas = await consultar<{
    id: string;
    descricao: string;
    prazo: string;
    status: StatusAcao;
    responsavel_nome: string;
    vencida: boolean;
    criado_em: string;
  }>(
    `SELECT a.id, a.descricao, a.prazo::text AS prazo, a.status,
            u.nome AS responsavel_nome,
            (a.status = 'aberta'
             AND a.prazo < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS vencida,
            a.criado_em::text AS criado_em
       FROM rh.acao_aberta a
       JOIN sistema.usuario u ON u.id = a.responsavel_id
      WHERE a.colaborador_id = $1
      ORDER BY (a.status = 'aberta') DESC, a.prazo, a.id`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function inserirAcao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    descricao: string;
    prazo: string;
    responsavel_id: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.acao_aberta (colaborador_id, descricao, prazo, responsavel_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [dados.colaborador_id, dados.descricao, dados.prazo, dados.responsavel_id]
  );
  return Number(rows[0].id);
}

export interface AcaoParaAtualizar {
  id: number;
  colaborador_id: number;
  descricao: string;
  prazo: string;
  status: StatusAcao;
}

export async function buscarAcaoParaAtualizar(
  cliente: PoolClient,
  colaboradorId: number,
  acaoId: number
): Promise<AcaoParaAtualizar | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    descricao: string;
    prazo: string;
    status: StatusAcao;
  }>(
    `SELECT id, colaborador_id, descricao, prazo::text AS prazo, status
       FROM rh.acao_aberta
      WHERE id = $1 AND colaborador_id = $2
      FOR UPDATE`,
    [acaoId, colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    colaborador_id: Number(rows[0].colaborador_id),
  };
}

export async function atualizarAcao(
  cliente: PoolClient,
  acaoId: number,
  campos: { descricao?: string; prazo?: string; status?: StatusAcao }
): Promise<void> {
  const colunas: Record<string, string> = {
    descricao: "descricao",
    prazo: "prazo",
    status: "status",
  };
  const chaves = Object.keys(campos) as (keyof typeof campos)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${colunas[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE rh.acao_aberta SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [acaoId, ...chaves.map((chave) => campos[chave])]
  );
}

// ------------------------------------------------------------------ posição (cargo + salário — sensível)

export interface Posicao {
  id: number;
  cargo_id: number;
  cargo_nome: string;
  salario: number;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarPosicoes(
  colaboradorId: number
): Promise<Posicao[]> {
  const linhas = await consultar<{
    id: string;
    cargo_id: string;
    cargo_nome: string;
    salario: string;
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT p.id, cv.cargo_id, cv.nome AS cargo_nome, p.salario::text AS salario,
            p.inicio_vigencia::text AS inicio_vigencia,
            p.fim_vigencia::text AS fim_vigencia
       FROM rh.posicao_colaborador p
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
      WHERE p.colaborador_id = $1
      ORDER BY p.inicio_vigencia DESC, p.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    cargo_id: Number(linha.cargo_id),
    salario: Number(linha.salario),
  }));
}

export interface PosicaoVigente {
  id: number;
  cargo_id: number;
  cargo_nome: string;
  salario: number;
  inicio_vigencia: string;
}

export async function buscarPosicaoVigenteParaAtualizar(
  cliente: PoolClient,
  colaboradorId: number
): Promise<PosicaoVigente | null> {
  const { rows } = await cliente.query<{
    id: string;
    cargo_id: string;
    cargo_nome: string;
    salario: string;
    inicio_vigencia: string;
  }>(
    `SELECT p.id, cv.cargo_id, cv.nome AS cargo_nome, p.salario::text AS salario,
            p.inicio_vigencia::text AS inicio_vigencia
       FROM rh.posicao_colaborador p
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
      WHERE p.colaborador_id = $1 AND p.fim_vigencia IS NULL
      FOR UPDATE OF p`,
    [colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    cargo_id: Number(rows[0].cargo_id),
    salario: Number(rows[0].salario),
  };
}

export async function encerrarPosicao(
  cliente: PoolClient,
  posicaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.posicao_colaborador
        SET fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [posicaoId, inicioDaProxima]
  );
}

export async function inserirPosicao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    cargo_versao_id: number;
    salario: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.posicao_colaborador
       (colaborador_id, cargo_versao_id, salario, inicio_vigencia)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.cargo_versao_id,
      dados.salario,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ relação gestor → liderado

export interface RelacaoGestor {
  id: number;
  gestor_colaborador_id: number;
  gestor_nome: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarRelacoesGestor(
  colaboradorId: number
): Promise<RelacaoGestor[]> {
  const linhas = await consultar<{
    id: string;
    gestor_colaborador_id: string;
    gestor_nome: string;
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT rg.id, rg.gestor_colaborador_id, g.nome_completo AS gestor_nome,
            rg.inicio_vigencia::text AS inicio_vigencia,
            rg.fim_vigencia::text AS fim_vigencia
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
      WHERE rg.liderado_colaborador_id = $1
      ORDER BY rg.inicio_vigencia DESC, rg.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    gestor_colaborador_id: Number(linha.gestor_colaborador_id),
  }));
}

export interface RelacaoGestorVigente {
  id: number;
  gestor_colaborador_id: number;
  gestor_nome: string;
  inicio_vigencia: string;
}

export async function buscarRelacaoGestorVigenteParaAtualizar(
  cliente: PoolClient,
  lideradoId: number
): Promise<RelacaoGestorVigente | null> {
  const { rows } = await cliente.query<{
    id: string;
    gestor_colaborador_id: string;
    gestor_nome: string;
    inicio_vigencia: string;
  }>(
    `SELECT rg.id, rg.gestor_colaborador_id, g.nome_completo AS gestor_nome,
            rg.inicio_vigencia::text AS inicio_vigencia
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
      WHERE rg.liderado_colaborador_id = $1 AND rg.fim_vigencia IS NULL
      FOR UPDATE OF rg`,
    [lideradoId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    gestor_colaborador_id: Number(rows[0].gestor_colaborador_id),
  };
}

export async function encerrarRelacaoGestor(
  cliente: PoolClient,
  relacaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.relacao_gestor SET fim_vigencia = $2::date - 1 WHERE id = $1`,
    [relacaoId, inicioDaProxima]
  );
}

export async function inserirRelacaoGestor(
  cliente: PoolClient,
  dados: {
    gestor_colaborador_id: number;
    liderado_colaborador_id: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.relacao_gestor
       (gestor_colaborador_id, liderado_colaborador_id, inicio_vigencia)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      dados.gestor_colaborador_id,
      dados.liderado_colaborador_id,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ lotação

export interface Lotacao {
  id: number;
  estabelecimento_id: number;
  unidade: string | null;
  centro_custo: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarLotacoes(
  colaboradorId: number
): Promise<Lotacao[]> {
  const linhas = await consultar<{
    id: string;
    estabelecimento_id: string;
    unidade: string | null;
    centro_custo: string;
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT l.id, l.estabelecimento_id, ev.unidade, l.centro_custo,
            l.inicio_vigencia::text AS inicio_vigencia,
            l.fim_vigencia::text AS fim_vigencia
       FROM rh.lotacao l
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE l.colaborador_id = $1
      ORDER BY l.inicio_vigencia DESC, l.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    estabelecimento_id: Number(linha.estabelecimento_id),
  }));
}

export interface LotacaoVigente {
  id: number;
  estabelecimento_id: number;
  unidade: string | null;
  centro_custo: string;
  inicio_vigencia: string;
}

export async function buscarLotacaoVigenteParaAtualizar(
  cliente: PoolClient,
  colaboradorId: number
): Promise<LotacaoVigente | null> {
  const { rows } = await cliente.query<{
    id: string;
    estabelecimento_id: string;
    unidade: string | null;
    centro_custo: string;
    inicio_vigencia: string;
  }>(
    `SELECT l.id, l.estabelecimento_id, ev.unidade, l.centro_custo,
            l.inicio_vigencia::text AS inicio_vigencia
       FROM rh.lotacao l
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE l.colaborador_id = $1 AND l.fim_vigencia IS NULL
      FOR UPDATE OF l`,
    [colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    estabelecimento_id: Number(rows[0].estabelecimento_id),
  };
}

export async function encerrarLotacao(
  cliente: PoolClient,
  lotacaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.lotacao SET fim_vigencia = $2::date - 1 WHERE id = $1`,
    [lotacaoId, inicioDaProxima]
  );
}

export async function inserirLotacao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    estabelecimento_id: number;
    centro_custo: string;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.lotacao (colaborador_id, estabelecimento_id, centro_custo, inicio_vigencia)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.estabelecimento_id,
      dados.centro_custo,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ cargos + versões + faixas

export interface CargoResumo {
  id: number;
  versao_id: number | null;
  nome: string | null;
  descricao: string | null;
  cha: Cha | null;
  inicio_vigencia: string | null;
  faixa_min: number | null;
  faixa_max: number | null;
  faixa_inicio_vigencia: string | null;
}

export async function listarCargos(): Promise<CargoResumo[]> {
  const linhas = await consultar<{
    id: string;
    versao_id: string | null;
    nome: string | null;
    descricao: string | null;
    cha: Cha | null;
    inicio_vigencia: string | null;
    faixa_min: string | null;
    faixa_max: string | null;
    faixa_inicio_vigencia: string | null;
  }>(
    `SELECT cg.id, cv.id AS versao_id, cv.nome, cv.descricao, cv.cha,
            cv.inicio_vigencia::text AS inicio_vigencia,
            ts.faixa_min::text AS faixa_min, ts.faixa_max::text AS faixa_max,
            ts.inicio_vigencia::text AS faixa_inicio_vigencia
       FROM rh.cargo cg
       LEFT JOIN rh.cargo_versao cv
         ON cv.cargo_id = cg.id AND cv.status = 'ativa'
       LEFT JOIN rh.tabela_salarial_versao ts
         ON ts.cargo_id = cg.id AND ts.status = 'ativa'
      ORDER BY cv.nome NULLS LAST, cg.id`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    versao_id: linha.versao_id === null ? null : Number(linha.versao_id),
    faixa_min: linha.faixa_min === null ? null : Number(linha.faixa_min),
    faixa_max: linha.faixa_max === null ? null : Number(linha.faixa_max),
  }));
}

export interface CargoVersaoAtiva {
  id: number;
  cargo_id: number;
  nome: string;
  descricao: string | null;
  cha: Cha;
  inicio_vigencia: string;
}

export async function buscarCargoVersaoAtiva(
  cliente: PoolClient,
  cargoId: number,
  travar = false
): Promise<CargoVersaoAtiva | null> {
  const { rows } = await cliente.query<{
    id: string;
    cargo_id: string;
    nome: string;
    descricao: string | null;
    cha: Cha;
    inicio_vigencia: string;
  }>(
    `SELECT id, cargo_id, nome, descricao, cha,
            inicio_vigencia::text AS inicio_vigencia
       FROM rh.cargo_versao
      WHERE cargo_id = $1 AND status = 'ativa'
      ${travar ? "FOR UPDATE" : ""}`,
    [cargoId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    cargo_id: Number(rows[0].cargo_id),
  };
}

export async function existeCargo(
  cliente: PoolClient,
  cargoId: number
): Promise<boolean> {
  const { rows } = await cliente.query(
    "SELECT 1 FROM rh.cargo WHERE id = $1",
    [cargoId]
  );
  return rows.length > 0;
}

export async function inserirCargo(cliente: PoolClient): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    "INSERT INTO rh.cargo DEFAULT VALUES RETURNING id"
  );
  return Number(rows[0].id);
}

export async function encerrarVersaoCargo(
  cliente: PoolClient,
  versaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.cargo_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [versaoId, inicioDaProxima]
  );
}

export async function inserirVersaoCargo(
  cliente: PoolClient,
  dados: {
    cargo_id: number;
    nome: string;
    descricao: string | null;
    cha: Cha;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.cargo_versao (cargo_id, nome, descricao, cha, status, inicio_vigencia)
     VALUES ($1, $2, $3, $4, 'ativa', $5)
     RETURNING id`,
    [
      dados.cargo_id,
      dados.nome,
      dados.descricao,
      JSON.stringify(dados.cha),
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

export interface FaixaSalarialAtiva {
  id: number;
  faixa_min: number;
  faixa_max: number;
  inicio_vigencia: string;
}

export async function buscarFaixaAtivaParaAtualizar(
  cliente: PoolClient,
  cargoId: number
): Promise<FaixaSalarialAtiva | null> {
  const { rows } = await cliente.query<{
    id: string;
    faixa_min: string;
    faixa_max: string;
    inicio_vigencia: string;
  }>(
    `SELECT id, faixa_min::text AS faixa_min, faixa_max::text AS faixa_max,
            inicio_vigencia::text AS inicio_vigencia
       FROM rh.tabela_salarial_versao
      WHERE cargo_id = $1 AND status = 'ativa'
      FOR UPDATE`,
    [cargoId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    faixa_min: Number(rows[0].faixa_min),
    faixa_max: Number(rows[0].faixa_max),
    inicio_vigencia: rows[0].inicio_vigencia,
  };
}

export async function encerrarFaixaSalarial(
  cliente: PoolClient,
  faixaId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.tabela_salarial_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [faixaId, inicioDaProxima]
  );
}

export async function inserirFaixaSalarial(
  cliente: PoolClient,
  dados: {
    cargo_id: number;
    faixa_min: number;
    faixa_max: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.tabela_salarial_versao
       (cargo_id, faixa_min, faixa_max, status, inicio_vigencia)
     VALUES ($1, $2, $3, 'ativa', $4)
     RETURNING id`,
    [dados.cargo_id, dados.faixa_min, dados.faixa_max, dados.inicio_vigencia]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ estabelecimentos

export interface EstabelecimentoResumo {
  id: number;
  cnpj: string;
  versao_id: number | null;
  razao_social: string | null;
  unidade: string | null;
  endereco_resumido: string | null;
  inicio_vigencia: string | null;
}

export async function listarEstabelecimentos(): Promise<
  EstabelecimentoResumo[]
> {
  const linhas = await consultar<{
    id: string;
    cnpj: string;
    versao_id: string | null;
    razao_social: string | null;
    unidade: string | null;
    endereco_resumido: string | null;
    inicio_vigencia: string | null;
  }>(
    `SELECT e.id, e.cnpj, ev.id AS versao_id, ev.razao_social, ev.unidade,
            ev.endereco_resumido, ev.inicio_vigencia::text AS inicio_vigencia
       FROM rh.estabelecimento e
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = e.id AND ev.status = 'ativa'
      ORDER BY ev.unidade NULLS LAST, e.id`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    versao_id: linha.versao_id === null ? null : Number(linha.versao_id),
  }));
}

export async function buscarEstabelecimentoVersaoAtiva(
  cliente: PoolClient,
  estabelecimentoId: number,
  travar = false
): Promise<{
  id: number;
  razao_social: string;
  unidade: string;
  endereco_resumido: string | null;
  inicio_vigencia: string;
} | null> {
  const { rows } = await cliente.query<{
    id: string;
    razao_social: string;
    unidade: string;
    endereco_resumido: string | null;
    inicio_vigencia: string;
  }>(
    `SELECT id, razao_social, unidade, endereco_resumido,
            inicio_vigencia::text AS inicio_vigencia
       FROM rh.estabelecimento_versao
      WHERE estabelecimento_id = $1 AND status = 'ativa'
      ${travar ? "FOR UPDATE" : ""}`,
    [estabelecimentoId]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

export async function existeEstabelecimento(
  cliente: PoolClient,
  estabelecimentoId: number
): Promise<boolean> {
  const { rows } = await cliente.query(
    "SELECT 1 FROM rh.estabelecimento WHERE id = $1",
    [estabelecimentoId]
  );
  return rows.length > 0;
}

export async function inserirEstabelecimento(
  cliente: PoolClient,
  cnpj: string
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    "INSERT INTO rh.estabelecimento (cnpj) VALUES ($1) RETURNING id",
    [cnpj]
  );
  return Number(rows[0].id);
}

export async function encerrarVersaoEstabelecimento(
  cliente: PoolClient,
  versaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.estabelecimento_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [versaoId, inicioDaProxima]
  );
}

export async function inserirVersaoEstabelecimento(
  cliente: PoolClient,
  dados: {
    estabelecimento_id: number;
    razao_social: string;
    unidade: string;
    endereco_resumido: string | null;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.estabelecimento_versao
       (estabelecimento_id, razao_social, unidade, endereco_resumido, status, inicio_vigencia)
     VALUES ($1, $2, $3, $4, 'ativa', $5)
     RETURNING id`,
    [
      dados.estabelecimento_id,
      dados.razao_social,
      dados.unidade,
      dados.endereco_resumido,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}
