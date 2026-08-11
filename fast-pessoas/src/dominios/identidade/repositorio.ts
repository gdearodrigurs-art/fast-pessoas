import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { Papel } from "./esquemas";

export interface UsuarioIdentidade {
  id: number;
  email: string;
  nome: string;
  senha_hash: string | null;
  papel: Papel;
  ativo: boolean;
  totp_secret: string | null;
}

interface LinhaUsuario extends Record<string, unknown> {
  id: string;
  email: string;
  nome: string;
  senha_hash: string | null;
  papel: Papel;
  ativo: boolean;
  totp_secret: string | null;
}

export async function buscarPorEmail(
  email: string
): Promise<UsuarioIdentidade | null> {
  const linhas = await consultar<LinhaUsuario>(
    `SELECT id, email, nome, senha_hash, papel, ativo, totp_secret
       FROM sistema.usuario
      WHERE lower(email) = lower($1)`,
    [email]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return { ...linha, id: Number(linha.id) };
}

export async function buscarPorId(
  id: number
): Promise<UsuarioIdentidade | null> {
  const linhas = await consultar<LinhaUsuario>(
    `SELECT id, email, nome, senha_hash, papel, ativo, totp_secret
       FROM sistema.usuario
      WHERE id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return { ...linha, id: Number(linha.id) };
}

export interface ChaveDoUsuario {
  chave: string;
  exige_2fa: boolean;
}

/**
 * Chaves que o papel do usuário compõe hoje, com o flag `exige_2fa` de cada
 * uma (migration 0040). É a matéria-prima da decisão de segundo fator: quem
 * decide não é o nome do papel, é o que as chaves abrem.
 */
export async function listarChavesDoUsuario(
  usuarioId: number
): Promise<ChaveDoUsuario[]> {
  return consultar<ChaveDoUsuario & Record<string, unknown>>(
    `SELECT pp.chave, p.exige_2fa
       FROM sistema.usuario u
       JOIN sistema.papel_permissao pp ON pp.papel = u.papel
       JOIN sistema.permissao p ON p.chave = pp.chave
      WHERE u.id = $1 AND u.ativo`,
    [usuarioId]
  );
}

export type AcaoIdentidade =
  | "login_sucesso"
  | "login_falha"
  | "logout"
  | "troca_senha"
  | "troca_senha_falha"
  | "ativacao_2fa_falha"
  | "desativacao_2fa_falha";

export async function registrarAcao(
  acao: AcaoIdentidade,
  usuario: { id: number; papel: Papel } | null,
  detalhe?: Record<string, unknown>
): Promise<void> {
  await consultar<Record<string, unknown>>(
    `INSERT INTO audit.alteracao (usuario_id, papel, acao, tabela, registro_id, diff)
     VALUES ($1, $2, $3, 'sistema.usuario', $4, $5)`,
    [
      usuario?.id ?? null,
      usuario?.papel ?? null,
      acao,
      usuario ? String(usuario.id) : null,
      detalhe ? JSON.stringify(detalhe) : null,
    ]
  );
}

export async function atualizarTotpSecret(
  cliente: PoolClient,
  usuarioId: number,
  totpSecret: string | null,
  ultimoPasso: number | null = null
): Promise<void> {
  // O último passo troca junto com o secret. Na DESATIVAÇÃO (secret null) volta a
  // NULL. Na ATIVAÇÃO grava o passo do código de confirmação, para esse mesmo
  // código não ser replayável num login. Reativar no mesmo período segue OK: o
  // passo do código novo é sempre >= o do secret anterior.
  await cliente.query(
    "UPDATE sistema.usuario SET totp_secret = $2, totp_ultimo_passo = $3 WHERE id = $1",
    [usuarioId, totpSecret, ultimoPasso]
  );
}

/**
 * Consome o passo TOTP de forma ATÔMICA: grava `totp_ultimo_passo = passo` só se
 * for MAIOR que o já gravado (ou se ainda for nulo). Devolve true quando gravou
 * (código de uso único aceito) e false quando não gravou (passo já consumido =
 * replay). O UPDATE condicional em uma só instrução é o que serializa duas
 * tentativas simultâneas do mesmo código.
 */
export async function consumirPassoTotp(
  usuarioId: number,
  passo: number
): Promise<boolean> {
  const linhas = await consultar<{ id: string }>(
    `UPDATE sistema.usuario
        SET totp_ultimo_passo = $2
      WHERE id = $1
        AND (totp_ultimo_passo IS NULL OR totp_ultimo_passo < $2)
      RETURNING id`,
    [usuarioId, passo]
  );
  return linhas.length > 0;
}

export async function atualizarSenhaHash(
  cliente: PoolClient,
  usuarioId: number,
  senhaHash: string
): Promise<void> {
  await cliente.query(
    "UPDATE sistema.usuario SET senha_hash = $2 WHERE id = $1",
    [usuarioId, senhaHash]
  );
}
