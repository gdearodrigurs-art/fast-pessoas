import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ROTAS_LIVRES = new Set(["/entrar", "/api/identidade/entrar"]);
const NOME_COOKIE_SESSAO = "fp_sessao";

async function sessaoValida(token: string): Promise<boolean> {
  const segredo = process.env.SESSAO_SEGREDO;
  if (!segredo) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(segredo), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (ROTAS_LIVRES.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  if (token && (await sessaoValida(token))) {
    return NextResponse.next();
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
