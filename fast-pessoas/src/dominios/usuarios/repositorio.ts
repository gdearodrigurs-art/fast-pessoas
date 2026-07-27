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
