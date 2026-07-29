import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { consultar } from "./banco";
import {
  esquemaSessao,
  PayloadSessao,
} from "../dominios/identidade/esquemas";

export const NOME_COOKIE_SESSAO = "fp_sessao";
const DURACAO_SEGUNDOS = 8 * 60 * 60;

export class ErroHttp extends Error {
  constructor(
    public readonly status: number,
    mensagem: string
  ) {
    super(mensagem);
    this.name = "ErroHttp";
  }
}

function segredo(): Uint8Array {
  const valor = process.env.SESSAO_SEGREDO;
  if (!valor) {
    throw new Error("SESSAO_SEGREDO ausente — configure o .env");
  }
  return new TextEncoder().encode(valor);
}

export async function criarSessao(payload: PayloadSessao): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SEGUNDOS}s`)
    .sign(segredo());

  const armazem = await cookies();
  armazem.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SEGUNDOS,
  });
}

export async function lerSessao(): Promise<PayloadSessao | null> {
  const armazem = await cookies();
  const token = armazem.get(NOME_COOKIE_SESSAO)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo(), {
      algorithms: ["HS256"],
    });
    const analise = esquemaSessao.safeParse({
      usuario_id: payload.usuario_id,
      papel: payload.papel,
      nome: payload.nome,
      pendente_2fa: payload.pendente_2fa,
    });
    return analise.success ? analise.data : null;
  } catch {
    return null;
  }
}

export async function destruirSessao(): Promise<void> {
  const armazem = await cookies();
  armazem.delete(NOME_COOKIE_SESSAO);
}

/**
 * Guarda-chuva de TODAS as rotas de negócio: sessão válida + chave de
 * permissão conferida no banco (sistema.tem_permissao). Lança ErroHttp
 * 401/403 — a rota converte em resposta.
 */
export async function exigirPermissao(chave: string): Promise<PayloadSessao> {
  const sessao = await lerSessao();
  if (!sessao) {
    throw new ErroHttp(401, "Não autenticado");
  }
  // Defesa em profundidade: sessão pendente de 2FA não acessa rota de
  // negócio nenhuma, mesmo se o proxy deixar passar.
  if (sessao.pendente_2fa) {
    throw new ErroHttp(
      403,
      "Configure a autenticação em duas etapas para continuar"
    );
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, chave]
  );
  if (!linhas[0]?.autorizado) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  return sessao;
}
