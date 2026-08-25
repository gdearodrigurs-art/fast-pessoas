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

// Gate do Código de Conduta (Onda 2 — decisões B1/B4 de docs/20): sessão com o
// claim ciencia_pendente só alcança o conjunto de REGULARIZAÇÃO. O claim nasce
// no login (identidade/servico.ts) e morre na regularização (reemissão em
// documentos/servico.ts) — o proxy roda no edge SEM banco e decide só por ele.
const PAGINAS_CIENCIA_PENDENTE = new Set(["/ciencia-pendente", "/documentos"]);

/**
 * APIs alcançáveis com a ciência pendente. O MÉTODO importa: no mesmo caminho
 * convivem a leitura que a regularização precisa (GET /api/documentos — o
 * painel acha o documento por ela) e a gestão que segue bloqueada (POST de
 * envio). Ficam de fora, de propósito: ciclo, lembrete, liberar e a abertura
 * de ato (gestão do ciclo — bloqueado gere depois de regularizar, B4).
 */
function apiDeRegularizacao(pathname: string, metodo: string): boolean {
  if (pathname === "/api/documentos") return metodo === "GET";
  if (pathname === "/api/documentos/pendencias/minhas") return metodo === "GET";
  const acao = pathname.match(
    /^\/api\/documentos\/\d+\/(download|ciencia|recusa|ato-testemunhas)$/
  );
  if (acao) {
    if (acao[1] === "download") return metodo === "GET";
    // Confirmação de testemunho com a própria sessão — PATCH; a abertura do
    // ato (POST, gestão) continua barrada.
    if (acao[1] === "ato-testemunhas") return metodo === "PATCH";
    return metodo === "POST"; // ciencia e recusa
  }
  // O sino de notificações segue vivo: é por ele que a pessoa fica sabendo da
  // liberação e do ato registrado.
  if (
    pathname === "/api/notificacoes" ||
    pathname.startsWith("/api/notificacoes/")
  ) {
    return true;
  }
  return pathname === "/api/identidade/sair";
}

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
    // Claims ausentes = false: sessões antigas seguem valendo normalmente.
    // O 2FA vem ANTES do gate de conduta: primeiro a conta fica segura, depois
    // a ciência — a reemissão pós-2FA preserva o claim ciencia_pendente.
    if (payload.pendente_2fa === true) {
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
    if (payload.ciencia_pendente === true) {
      if (
        PAGINAS_CIENCIA_PENDENTE.has(pathname) ||
        apiDeRegularizacao(pathname, request.method)
      ) {
        return NextResponse.next();
      }
      if (pathname.startsWith("/api/")) {
        return Response.json(
          {
            erro: "Acesso bloqueado até a regularização da ciência do Código de Conduta",
          },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/ciencia-pendente", request.url));
    }
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
