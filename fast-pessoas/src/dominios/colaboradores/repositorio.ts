import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  FiltroColaboradores,
  StatusColaborador,
  TipoVinculo,
} from "./esquemas";

export interface ColaboradorResumo {
  id: number;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
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
}

export async function listar(
  filtro: FiltroColaboradores
): Promise<ColaboradorResumo[]> {
  const condicoes: string[] = [];
  const parametros: unknown[] = [];
  if (filtro.busca) {
    parametros.push(`%${filtro.busca}%`);
    condicoes.push(
      `(nome_completo ILIKE $${parametros.length} OR matricula ILIKE $${parametros.length})`
    );
  }
  if (filtro.status) {
    parametros.push(filtro.status);
    condicoes.push(`status = $${parametros.length}`);
  }
  const clausulaWhere =
    condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = await consultar<LinhaResumo>(
    `SELECT id, matricula, nome_completo, tipo_vinculo, status,
            data_admissao::text AS data_admissao
       FROM rh.colaborador
       ${clausulaWhere}
      ORDER BY nome_completo, id`,
    parametros
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarFicha(
  id: number
): Promise<FichaColaborador | null> {
  const linhas = await consultar<LinhaFicha>(
    `SELECT c.id, c.usuario_id, c.matricula, c.matricula_esocial, c.cpf,
            c.nome_completo, c.tipo_vinculo, c.status,
            c.data_admissao::text AS data_admissao,
            c.data_desligamento::text AS data_desligamento,
            c.retrato, c.contexto,
            u.email, u.ativo AS usuario_ativo
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE c.id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...linha,
    id: Number(linha.id),
    usuario_id: Number(linha.usuario_id),
  };
}

export async function listarEventos(
  colaboradorId: number
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
      ORDER BY ocorrido_em DESC, id DESC`,
    [colaboradorId]
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
