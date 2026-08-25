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
      ciencia_pendente: payload.ciencia_pendente,
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
 * As DUAS checagens que valem para toda rota de negócio, antes de qualquer
 * chave: sessão existe e 2FA concluído. Função pura, sem cookie e sem banco —
 * é o pedaço da guarda que dá para provar num teste direto, sem HTTP.
 *
 * Existe extraída porque é defesa em PROFUNDIDADE, e defesa em profundidade
 * copiada é defesa que uma cópia esquece. O proxy (src/proxy.ts) já barra a
 * sessão pendente na borda; esta é a segunda tranca, do lado da aplicação,
 * para o dia em que alguém mexer no proxy.
 */
export function exigirSessaoValida(
  sessao: PayloadSessao | null
): PayloadSessao {
  if (!sessao) {
    throw new ErroHttp(401, "Não autenticado");
  }
  if (sessao.pendente_2fa) {
    throw new ErroHttp(
      403,
      "Configure a autenticação em duas etapas para continuar"
    );
  }
  return sessao;
}

/**
 * "Revogou, acabou": o cookie de sessão é um JWT de 8h que segue válido mesmo
 * depois de o usuário ser DESATIVADO. As rotas com chave já caem em 403 porque
 * `sistema.tem_permissao` filtra `AND u.ativo`; mas as rotas SEM chave (escopo
 * por sessão, como /api/colaboradores) nunca reliam o `ativo`. Esta reconferência
 * — uma busca por PK — fecha a janela: desativado deixa de ler até a própria
 * ficha. Não mora no proxy porque o proxy roda no edge, sem banco.
 */
export async function garantirUsuarioAtivo(usuarioId: number): Promise<void> {
  const linhas = await consultar<{ ativo: boolean }>(
    "SELECT ativo FROM sistema.usuario WHERE id = $1",
    [usuarioId]
  );
  if (!linhas[0]?.ativo) {
    throw new ErroHttp(401, "Sessão inválida — a conta não está mais ativa.");
  }
}

/**
 * Guarda das rotas SEM chave fixa — aquelas em que o alcance não vem de uma
 * permissão, e sim do escopo por sessão/papel que o repositório aplica
 * (ex.: /api/colaboradores: funcionário vê a própria ficha, gestor vê a
 * equipe vigente). Continua sendo rota de negócio: passa pelas mesmas duas
 * checagens que `exigirPermissao`, e só dispensa a terceira.
 *
 * É o substituto de `lerSessao()` + `if (!sessao)` solto na rota: aquele
 * atalho pulava o 2FA e deixava a rota dependendo só do proxy.
 */
export async function exigirSessao(): Promise<PayloadSessao> {
  const sessao = exigirSessaoValida(await lerSessao());
  await garantirUsuarioAtivo(sessao.usuario_id);
  return sessao;
}

/**
 * Guarda-chuva de TODAS as rotas de negócio: sessão válida + chave de
 * permissão conferida no banco (sistema.tem_permissao). Lança ErroHttp
 * 401/403 — a rota converte em resposta.
 */
export async function exigirPermissao(chave: string): Promise<PayloadSessao> {
  const sessao = exigirSessaoValida(await lerSessao());
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, chave]
  );
  if (!linhas[0]?.autorizado) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  return sessao;
}

/**
 * Variante para leitura que várias chaves autorizam com PROFUNDIDADE
 * diferente — ex.: cargo pode ser lido por `rh.cargo.ver` (descritivo/RCF) ou
 * por `rh.cargo.administrar` (que também vê faixa salarial). Autoriza se
 * tiver ao menos uma e devolve quais tem, para a rota decidir o que entra no
 * payload. Continua valendo a regra de ouro: o campo sensível é AUSENTE do
 * payload de quem não pode ver, não mascarado.
 */
export async function exigirAlgumaPermissao(
  chaves: readonly string[]
): Promise<{ sessao: PayloadSessao; concedidas: Set<string> }> {
  const sessao = exigirSessaoValida(await lerSessao());
  const linhas = await consultar<{ chave: string; autorizado: boolean }>(
    `SELECT chave, sistema.tem_permissao($1, chave) AS autorizado
       FROM unnest($2::text[]) AS chave`,
    [sessao.usuario_id, [...chaves]]
  );
  const concedidas = new Set(
    linhas.filter((linha) => linha.autorizado).map((linha) => linha.chave)
  );
  if (concedidas.size === 0) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  return { sessao, concedidas };
}
