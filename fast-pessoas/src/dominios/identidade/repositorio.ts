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
  /** Bloqueio temporário de TOTP vigente (0087) — comparado no banco (now()), não no relógio do app. */
  totp_bloqueado: boolean;
}

interface LinhaUsuario extends Record<string, unknown> {
  id: string;
  email: string;
  nome: string;
  senha_hash: string | null;
  papel: Papel;
  ativo: boolean;
  totp_secret: string | null;
  totp_bloqueado: boolean;
}

const COLUNAS_IDENTIDADE = `id, email, nome, senha_hash, papel, ativo, totp_secret,
       (totp_bloqueado_ate IS NOT NULL AND totp_bloqueado_ate > now()) AS totp_bloqueado`;

export async function buscarPorEmail(
  email: string
): Promise<UsuarioIdentidade | null> {
  const linhas = await consultar<LinhaUsuario>(
    `SELECT ${COLUNAS_IDENTIDADE}
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
    `SELECT ${COLUNAS_IDENTIDADE}
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

/** Falhas de SENHA recentes de um e-mail, na janela (minutos) — o gate do rate-limit. */
export async function contarFalhasLoginRecentes(
  email: string,
  janelaMinutos: number
): Promise<number> {
  const linhas = await consultar<{ n: string }>(
    `SELECT count(*)::text AS n FROM sistema.tentativa_login
      WHERE lower(email) = lower($1) AND NOT sucesso
        AND criado_em > now() - make_interval(mins => $2::int)`,
    [email, janelaMinutos]
  );
  return Number(linhas[0]?.n ?? 0);
}

/** Registra uma tentativa de login (sucesso = a senha conferiu, mesmo que falte TOTP). */
export async function registrarTentativaLogin(
  email: string,
  sucesso: boolean,
  ip: string | null
): Promise<void> {
  await consultar(
    "INSERT INTO sistema.tentativa_login (email, sucesso, ip) VALUES ($1, $2, $3)",
    [email, sucesso, ip]
  );
}

/** Os limites administráveis de segurança (eixo 9): rate-limit de senha (0082) e falhas de TOTP (0087). */
export async function lerParametroSeguranca(): Promise<{
  maxTentativas: number;
  janelaMinutos: number;
  maxFalhasTotp: number;
  bloqueioTotpMinutos: number;
}> {
  const linhas = await consultar<{
    max_tentativas_login: number;
    janela_minutos: number;
    max_falhas_totp: number;
    bloqueio_totp_minutos: number;
  }>(
    `SELECT max_tentativas_login, janela_minutos, max_falhas_totp, bloqueio_totp_minutos
       FROM sistema.parametro_seguranca WHERE id = 1`
  );
  const linha = linhas[0];
  return {
    maxTentativas: Number(linha?.max_tentativas_login ?? 10),
    janelaMinutos: Number(linha?.janela_minutos ?? 15),
    maxFalhasTotp: Number(linha?.max_falhas_totp ?? 5),
    bloqueioTotpMinutos: Number(linha?.bloqueio_totp_minutos ?? 15),
  };
}

// ---------------------------------------------------------------------------
// Falhas consecutivas de TOTP (0087, decisão C1 modificada)
// ---------------------------------------------------------------------------

/**
 * A chave que a tela de usuários exige (src/app/api/usuarios: exigirPermissao).
 * "Quem pode reativar um desativado" se decide por CHAVE de permissão — nunca
 * por nome de papel (eixo 4): um papel novo que receba esta chave pela tela
 * /perfis passa a contar como gestor de usuários sem mudança de código.
 */
export const CHAVE_GESTAO_USUARIOS = "usuario.administrar";

/**
 * Incrementa o contador de falhas CONSECUTIVAS de TOTP e devolve o total novo.
 * UPDATE + RETURNING numa instrução: duas tentativas simultâneas serializam no
 * lock da linha e cada uma enxerga um total distinto — o limiar dispara uma vez.
 */
export async function registrarFalhaTotp(usuarioId: number): Promise<number> {
  const linhas = await consultar<{ total: number }>(
    `UPDATE sistema.usuario
        SET totp_falhas_consecutivas = totp_falhas_consecutivas + 1
      WHERE id = $1
      RETURNING totp_falhas_consecutivas AS total`,
    [usuarioId]
  );
  return Number(linhas[0]?.total ?? 0);
}

/** Acerto ZERA o contador (falhas consecutivas, não janela) e limpa bloqueio vencido. */
export async function zerarFalhasTotp(usuarioId: number): Promise<void> {
  await consultar(
    `UPDATE sistema.usuario
        SET totp_falhas_consecutivas = 0, totp_bloqueado_ate = NULL
      WHERE id = $1
        AND (totp_falhas_consecutivas <> 0 OR totp_bloqueado_ate IS NOT NULL)`,
    [usuarioId]
  );
}

/**
 * Desativa o usuário por falhas de TOTP — ATÔMICO com a salvaguarda do último
 * gestor de usuários: o UPDATE só acontece se existir OUTRO usuário ativo cujo
 * papel componha a chave de gestão (mesma consulta de sistema.tem_permissao).
 * A auditoria sai na MESMA instrução (CTE): não existe desativação sem rastro.
 * Autor do ato = sistema (usuario_id NULL na audit.alteracao).
 *
 * Devolve true quando desativou; false quando recusou (último gestor ativo) —
 * o chamador aplica então o bloqueio temporário.
 *
 * A desativação também ZERA o contador: quando o DP reativar pela tela de
 * usuários, a pessoa recomeça com as 5 tentativas — e não com uma só.
 */
export async function desativarPorFalhasTotp(
  usuarioId: number,
  limiar: number
): Promise<boolean> {
  const diff = {
    Ativo: { de: "Sim", para: "Não" },
    Motivo: {
      de: null,
      para:
        `${limiar} falhas consecutivas de código TOTP — desativação automática ` +
        "(autor: sistema; reativação é ato do DP pela tela de usuários)",
    },
  };
  const linhas = await consultar<{ id: string }>(
    `WITH desativado AS (
       UPDATE sistema.usuario u
          SET ativo = FALSE, totp_falhas_consecutivas = 0
        WHERE u.id = $1
          AND u.ativo
          AND EXISTS (
            SELECT 1
              FROM sistema.usuario outro
              JOIN sistema.papel_permissao pp ON pp.papel = outro.papel
             WHERE pp.chave = $2 AND outro.ativo AND outro.id <> u.id
          )
        RETURNING u.id
     )
     INSERT INTO audit.alteracao (usuario_id, papel, acao, tabela, registro_id, diff)
     SELECT NULL, NULL, 'desativacao_por_falhas_totp', 'sistema.usuario', d.id::text, $3::jsonb
       FROM desativado d
     RETURNING registro_id AS id`,
    [usuarioId, CHAVE_GESTAO_USUARIOS, JSON.stringify(diff)]
  );
  return linhas.length > 0;
}

/**
 * Bloqueio TEMPORÁRIO no lugar da desativação (caso último-admin): grava o fim
 * do bloqueio e zera o contador, com auditoria na mesma instrução. Sessões
 * vigentes do bloqueado seguem valendo de propósito — matar a sessão do ÚNICO
 * gestor de usuários seria entregar ao atacante a negação de serviço total.
 */
export async function bloquearTotpPorFalhas(
  usuarioId: number,
  minutos: number
): Promise<void> {
  const diff = {
    "Bloqueio de TOTP": {
      de: null,
      para:
        `Temporário por ${minutos} min — limiar de falhas de código TOTP atingido ` +
        "pelo último usuário ativo com a chave de gestão de usuários (autor: sistema)",
    },
  };
  await consultar(
    `WITH bloqueado AS (
       UPDATE sistema.usuario
          SET totp_bloqueado_ate = now() + make_interval(mins => $2::int),
              totp_falhas_consecutivas = 0
        WHERE id = $1
        RETURNING id
     )
     INSERT INTO audit.alteracao (usuario_id, papel, acao, tabela, registro_id, diff)
     SELECT NULL, NULL, 'bloqueio_totp_temporario', 'sistema.usuario', b.id::text, $3::jsonb
       FROM bloqueado b`,
    [usuarioId, minutos, JSON.stringify(diff)]
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
