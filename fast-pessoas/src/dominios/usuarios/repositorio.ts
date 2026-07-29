import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { Papel } from "../identidade/esquemas";

export interface UsuarioAdministravel {
  id: number;
  email: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

interface LinhaUsuario extends Record<string, unknown> {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

function paraUsuario(linha: LinhaUsuario): UsuarioAdministravel {
  return { ...linha, id: Number(linha.id) };
}

export async function listar(): Promise<UsuarioAdministravel[]> {
  const linhas = await consultar<LinhaUsuario>(
    `SELECT id, email, nome, papel, ativo
       FROM sistema.usuario
      ORDER BY nome, id`
  );
  return linhas.map(paraUsuario);
}

export async function criar(
  cliente: PoolClient,
  dados: { email: string; nome: string; papel: Papel; senhaHash: string }
): Promise<UsuarioAdministravel> {
  const { rows } = await cliente.query<LinhaUsuario>(
    `INSERT INTO sistema.usuario (email, nome, papel, senha_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, nome, papel, ativo`,
    [dados.email, dados.nome, dados.papel, dados.senhaHash]
  );
  return paraUsuario(rows[0]);
}

export async function buscarParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<UsuarioAdministravel | null> {
  const { rows } = await cliente.query<LinhaUsuario>(
    `SELECT id, email, nome, papel, ativo
       FROM sistema.usuario
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return rows.length ? paraUsuario(rows[0]) : null;
}

export async function idsAdminsAtivos(cliente: PoolClient): Promise<number[]> {
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id
       FROM sistema.usuario
      WHERE papel = 'admin' AND ativo
      FOR UPDATE`
  );
  return rows.map((linha) => Number(linha.id));
}

// ------------------------------------------------------------------ perfis (papel × chave)

export interface PermissaoCatalogo {
  chave: string;
  descricao: string;
}

/** Catálogo completo de chaves — a fonte é o banco, nunca uma lista no código. */
export async function listarCatalogoPermissoes(): Promise<PermissaoCatalogo[]> {
  return consultar<PermissaoCatalogo & Record<string, unknown>>(
    `SELECT chave, descricao FROM sistema.permissao ORDER BY chave`
  );
}

/** Todos os vínculos papel → chave gravados, para montar a matriz da tela. */
export async function listarVinculosPapelPermissao(): Promise<
  { papel: string; chave: string }[]
> {
  return consultar<{ papel: string; chave: string } & Record<string, unknown>>(
    `SELECT papel, chave FROM sistema.papel_permissao ORDER BY papel, chave`
  );
}

export interface ContagemPapel {
  papel: string;
  total: number;
  ativos: number;
}

/** Quantos usuários usam cada papel — o "afeta N pessoas" da tela. */
export async function contarUsuariosPorPapel(): Promise<ContagemPapel[]> {
  const linhas = await consultar<{
    papel: string;
    total: string;
    ativos: string;
  }>(
    `SELECT papel,
            count(*)::text                        AS total,
            count(*) FILTER (WHERE ativo)::text   AS ativos
       FROM sistema.usuario
      GROUP BY papel`
  );
  return linhas.map((linha) => ({
    papel: linha.papel,
    total: Number(linha.total),
    ativos: Number(linha.ativos),
  }));
}

/**
 * Chaves atuais do papel, travando as linhas para a transação de gravação
 * (FOR UPDATE): duas gravações simultâneas no mesmo perfil serializam em vez
 * de calcular o diff sobre um estado já vencido.
 */
export async function chavesDoPapelParaAtualizar(
  cliente: PoolClient,
  papel: string
): Promise<string[]> {
  const { rows } = await cliente.query<{ chave: string }>(
    `SELECT chave
       FROM sistema.papel_permissao
      WHERE papel = $1
      ORDER BY chave
      FOR UPDATE`,
    [papel]
  );
  return rows.map((linha) => linha.chave);
}

/** Descrição de cada chave, para o diff da auditoria sair legível. */
export async function descricoesDasChaves(
  cliente: PoolClient,
  chaves: string[]
): Promise<Map<string, string>> {
  if (chaves.length === 0) return new Map();
  const { rows } = await cliente.query<{ chave: string; descricao: string }>(
    `SELECT chave, descricao FROM sistema.permissao WHERE chave = ANY($1::text[])`,
    [chaves]
  );
  return new Map(rows.map((linha) => [linha.chave, linha.descricao]));
}

export async function conceder(
  cliente: PoolClient,
  papel: string,
  chaves: string[]
): Promise<void> {
  if (chaves.length === 0) return;
  // A FK para sistema.permissao rejeita chave inexistente — a validação de
  // "chave existe" fica no banco, não numa lista paralela no código.
  await cliente.query(
    `INSERT INTO sistema.papel_permissao (papel, chave)
     SELECT $1, chave FROM unnest($2::text[]) AS chave
     ON CONFLICT DO NOTHING`,
    [papel, chaves]
  );
}

export async function revogar(
  cliente: PoolClient,
  papel: string,
  chaves: string[]
): Promise<void> {
  if (chaves.length === 0) return;
  await cliente.query(
    `DELETE FROM sistema.papel_permissao
      WHERE papel = $1 AND chave = ANY($2::text[])`,
    [papel, chaves]
  );
}

/** Contagem de usuários do papel dentro da transação (para o aviso pós-ação). */
export async function contarUsuariosDoPapel(
  cliente: PoolClient,
  papel: string
): Promise<{ total: number; ativos: number }> {
  const { rows } = await cliente.query<{ total: string; ativos: string }>(
    `SELECT count(*)::text                      AS total,
            count(*) FILTER (WHERE ativo)::text AS ativos
       FROM sistema.usuario
      WHERE papel = $1`,
    [papel]
  );
  return { total: Number(rows[0].total), ativos: Number(rows[0].ativos) };
}

const COLUNAS_ATUALIZAVEIS = {
  ativo: "ativo",
  papel: "papel",
} as const;

export async function atualizar(
  cliente: PoolClient,
  id: number,
  campos: { ativo?: boolean; papel?: Papel }
): Promise<void> {
  const chaves = Object.keys(campos) as (keyof typeof COLUNAS_ATUALIZAVEIS)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${COLUNAS_ATUALIZAVEIS[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE sistema.usuario SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [id, ...chaves.map((chave) => campos[chave])]
  );
}
