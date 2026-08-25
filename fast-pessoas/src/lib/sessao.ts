import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
 * As checagens que valem para TODA rota de regularização, antes de qualquer
 * chave: sessão existe e 2FA concluído. Função pura, sem cookie e sem banco —
 * é o pedaço da guarda que dá para provar num teste direto, sem HTTP.
 *
 * É a variante SEM a tranca do gate de conduta (A8), de propósito: as rotas
 * de REGULARIZAÇÃO (ciência, recusa, download, pendências próprias e a
 * confirmação de testemunho) são exatamente as que o bloqueado PRECISA
 * alcançar para sair do bloqueio — se elas barrassem `ciencia_pendente`,
 * ninguém se regularizaria nunca (B4: a rota de regularização nunca fecha).
 */
export function exigirSessaoValidaParaRegularizacao(
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
 * As TRÊS checagens que valem para toda rota de negócio, antes de qualquer
 * chave: sessão existe, 2FA concluído e — A8 — sem o claim `ciencia_pendente`
 * do gate de conduta (Onda 2, B1/B4).
 *
 * Existe extraída porque é defesa em PROFUNDIDADE, e defesa em profundidade
 * copiada é defesa que uma cópia esquece. O proxy (src/proxy.ts) já barra a
 * sessão pendente (de 2FA e de ciência) na borda; esta é a segunda tranca,
 * do lado da aplicação, para o dia em que alguém mexer no proxy — foi por um
 * furo assim (proxy liberando PATCH sem olhar o corpo) que o bloqueado
 * conseguia registrar desfecho de ato (A1).
 */
export function exigirSessaoValida(
  sessao: PayloadSessao | null
): PayloadSessao {
  const valida = exigirSessaoValidaParaRegularizacao(sessao);
  if (valida.ciencia_pendente === true) {
    throw new ErroHttp(
      403,
      "Acesso bloqueado até a regularização da ciência do Código de Conduta"
    );
  }
  return valida;
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
 * A guarda keyless das rotas de REGULARIZAÇÃO do gate de conduta (A8):
 * idêntica a `exigirSessao`, MENOS a tranca do `ciencia_pendente` — o
 * bloqueado precisa alcançar exatamente estas rotas (pendências próprias,
 * ciência, confirmação de testemunho) para sair do bloqueio. Toda rota que
 * NÃO é de regularização fica em `exigirSessao`/`exigirPermissao` e herda a
 * tranca.
 */
export async function exigirSessaoParaRegularizacao(): Promise<PayloadSessao> {
  const sessao = exigirSessaoValidaParaRegularizacao(await lerSessao());
  await garantirUsuarioAtivo(sessao.usuario_id);
  return sessao;
}

/**
 * Guarda das PÁGINAS server-side (Onda 2, decisão C2 modificada): o espelho de
 * `exigirSessao` para quem renderiza em vez de responder JSON. Sessão ausente
 * ou de usuário DESATIVADO vira redirect("/entrar") — desativado perde TUDO na
 * hora, não no fim do JWT de 8h; pendente de 2FA volta para /configurar-2fa,
 * o mesmo destino que o proxy dá (defesa em profundidade: a página não pode
 * depender só da borda). Os redirects de PERMISSÃO de cada página continuam
 * NELAS, depois deste guard — aqui só mora o que é igual nas 54.
 */
export async function exigirSessaoDePagina(): Promise<PayloadSessao> {
  const sessao = await exigirSessaoDePaginaParaRegularizacao();
  // A8 — segunda tranca do gate de conduta, espelho da do proxy: sessão com
  // `ciencia_pendente` só alcança as páginas de regularização (/documentos e
  // /ciencia-pendente, que usam a variante SEM esta tranca); todas as outras
  // voltam para o gate, como o proxy já faz na borda.
  if (sessao.ciencia_pendente === true) {
    redirect("/ciencia-pendente");
  }
  return sessao;
}

/**
 * Variante de PÁGINA para a regularização do gate de conduta (A8): as páginas
 * /ciencia-pendente e /documentos precisam abrir para o bloqueado — a
 * primeira é o próprio gate (a tranca aqui viraria redirect em laço) e a
 * segunda é onde a ciência se registra. Mantém tudo o mais: sessão, 2FA e
 * usuário ativo.
 */
export async function exigirSessaoDePaginaParaRegularizacao(): Promise<PayloadSessao> {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  if (sessao.pendente_2fa) {
    redirect("/configurar-2fa");
  }
  // garantirUsuarioAtivo lança ErroHttp; página não responde JSON — o lanço
  // vira redirect. O redirect() do Next também lança (NEXT_REDIRECT), então
  // ele fica FORA do try para não ser engolido pelo catch.
  let ativo = true;
  try {
    await garantirUsuarioAtivo(sessao.usuario_id);
  } catch (erro) {
    if (!(erro instanceof ErroHttp)) {
      throw erro;
    }
    ativo = false;
  }
  if (!ativo) {
    redirect("/entrar");
  }
  return sessao;
}

/**
 * Guarda-chuva de TODAS as rotas de negócio: sessão válida + chave de
 * permissão conferida no banco (sistema.tem_permissao). Lança ErroHttp
 * 401/403 — a rota converte em resposta.
 */
export async function exigirPermissao(chave: string): Promise<PayloadSessao> {
  const sessao = exigirSessaoValida(await lerSessao());
  return conferirChave(sessao, chave);
}

/**
 * Rota de REGULARIZAÇÃO que continua tendo chave (A8): hoje, a recusa e o
 * download do documento (documento.ver). A checagem da chave é a mesma de
 * `exigirPermissao`; só a tranca do `ciencia_pendente` fica de fora — recusar
 * e LER o documento fazem parte do caminho de regularização (B4), e barrá-los
 * deixaria o bloqueado sem como ler o que precisa assinar.
 */
export async function exigirPermissaoParaRegularizacao(
  chave: string
): Promise<PayloadSessao> {
  const sessao = exigirSessaoValidaParaRegularizacao(await lerSessao());
  return conferirChave(sessao, chave);
}

async function conferirChave(
  sessao: PayloadSessao,
  chave: string
): Promise<PayloadSessao> {
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
