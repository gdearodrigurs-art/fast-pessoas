import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

const ROTAS_LIVRES = new Set(["/entrar", "/api/identidade/entrar"]);
const NOME_COOKIE_SESSAO = "fp_sessao";

// Sessão pendente de 2FA (claim pendente_2fa no JWT) só alcança o fluxo de
// configuração e o mínimo de identidade. Todo o resto: página vira redirect
// para /configurar-2fa e API vira 403.
const ROTAS_PENDENTE_2FA = new Set([
  "/configurar-2fa",
  "/trocar-senha",
  "/api/identidade/sessao",
  "/api/identidade/sair",
  "/api/identidade/trocar-senha",
]);
const PREFIXO_API_2FA = "/api/identidade/2fa/";

async function lerPayloadSessao(token: string): Promise<JWTPayload | null> {
  const segredo = process.env.SESSAO_SEGREDO;
  if (!segredo) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(segredo),
      { algorithms: ["HS256"] }
    );
    return payload;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (ROTAS_LIVRES.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const payload = token ? await lerPayloadSessao(token) : null;

  if (payload) {
    // Claim ausente = false: sessões antigas seguem valendo normalmente.
    if (payload.pendente_2fa !== true) {
      return NextResponse.next();
    }
    if (
      ROTAS_PENDENTE_2FA.has(pathname) ||
      pathname.startsWith(PREFIXO_API_2FA)
    ) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return Response.json(
        { erro: "Configure a autenticação em duas etapas para continuar" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/configurar-2fa", request.url));
  }

  if (pathname.startsWith("/api/")) {
    return Response.json({ erro: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)",
  ],
};
