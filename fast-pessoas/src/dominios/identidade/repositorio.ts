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

export type AcaoIdentidade = "login_sucesso" | "login_falha" | "logout";

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
