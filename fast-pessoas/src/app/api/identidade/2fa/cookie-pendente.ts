import { cookies } from "next/headers";
import { DURACAO_PENDENTE_SEGUNDOS } from "@/dominios/identidade/token-2fa";

// Cookie httpOnly com o token assinado do secret PENDENTE de confirmação.
// Escopado ao caminho das rotas de 2FA — não viaja no resto da aplicação.
export const NOME_COOKIE_2FA_PENDENTE = "fp_2fa_pendente";
const CAMINHO_COOKIE = "/api/identidade/2fa";

export async function gravarCookiePendente(token: string): Promise<void> {
  const armazem = await cookies();
  armazem.set(NOME_COOKIE_2FA_PENDENTE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: CAMINHO_COOKIE,
    maxAge: DURACAO_PENDENTE_SEGUNDOS,
  });
}

export async function lerCookiePendente(): Promise<string | null> {
  const armazem = await cookies();
  return armazem.get(NOME_COOKIE_2FA_PENDENTE)?.value ?? null;
}

export async function limparCookiePendente(): Promise<void> {
  const armazem = await cookies();
  armazem.set(NOME_COOKIE_2FA_PENDENTE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: CAMINHO_COOKIE,
    maxAge: 0,
  });
}
