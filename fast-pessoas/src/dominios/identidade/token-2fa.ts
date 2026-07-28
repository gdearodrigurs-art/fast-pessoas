import { SignJWT, jwtVerify } from "jose";

// Token assinado de curta duração que carrega o secret TOTP PENDENTE de
// confirmação. Nada é gravado em sistema.usuario.totp_secret antes de o
// usuário provar que o autenticador funciona (POST /2fa/confirmar).
const FINALIDADE = "2fa_pendente";
export const DURACAO_PENDENTE_SEGUNDOS = 10 * 60;

function segredo(): Uint8Array {
  const valor = process.env.SESSAO_SEGREDO;
  if (!valor) {
    throw new Error("SESSAO_SEGREDO ausente — configure o .env");
  }
  return new TextEncoder().encode(valor);
}

export async function assinarSecretPendente(
  usuarioId: number,
  secretBase32: string
): Promise<string> {
  return new SignJWT({
    fim: FINALIDADE,
    usuario_id: usuarioId,
    secret: secretBase32,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_PENDENTE_SEGUNDOS}s`)
    .sign(segredo());
}

/**
 * Devolve o secret pendente se o token for válido, não expirado e pertencer
 * ao usuário da sessão; caso contrário, null.
 */
export async function verificarSecretPendente(
  token: string,
  usuarioId: number
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, segredo(), {
      algorithms: ["HS256"],
    });
    if (
      payload.fim !== FINALIDADE ||
      payload.usuario_id !== usuarioId ||
      typeof payload.secret !== "string" ||
      payload.secret.length === 0
    ) {
      return null;
    }
    return payload.secret;
  } catch {
    return null;
  }
}
