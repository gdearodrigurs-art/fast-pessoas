import { ErroHttp } from "./sessao";

export class ErroHttpCampo extends ErroHttp {
  constructor(
    status: number,
    mensagem: string,
    public readonly campo: string
  ) {
    super(status, mensagem);
    this.name = "ErroHttpCampo";
  }
}

/**
 * Recusa que a tela pode transformar em PERGUNTA: o servidor não aceita a
 * requisição como veio, mas aceita a mesma requisição com o campo de
 * confirmação ligado (hoje: importar ponto com intercorrência aberta, e abrir
 * segundo vínculo para um CPF que já é de gente do grupo).
 *
 * `confirmacao` é a chave estável desse "sim" — vai no corpo do erro para o
 * cliente saber QUAL 409 chegou. Sem ela a tela ofereceria "prosseguir assim
 * mesmo?" para qualquer 409, inclusive os que não têm como prosseguir.
 *
 * `detalhe` é o que a tela precisa MOSTRAR antes de perguntar. Existe porque
 * confirmação cega é o que esta classe veio evitar: quando a pergunta é "é a
 * mesma pessoa?", quem responde tem que ver de QUEM se está falando — nome,
 * vínculos anteriores, conta de acesso — e não só uma frase.
 */
export class ErroHttpConfirmavel extends ErroHttp {
  constructor(
    status: number,
    mensagem: string,
    public readonly confirmacao: string,
    public readonly detalhe?: Record<string, unknown>
  ) {
    super(status, mensagem);
    this.name = "ErroHttpConfirmavel";
  }
}

export function responderErro(erro: unknown): Response {
  if (erro instanceof ErroHttpCampo) {
    return Response.json(
      { erro: erro.message, campo: erro.campo },
      { status: erro.status }
    );
  }
  if (erro instanceof ErroHttpConfirmavel) {
    return Response.json(
      {
        erro: erro.message,
        confirmacao: erro.confirmacao,
        ...(erro.detalhe ? { detalhe: erro.detalhe } : {}),
      },
      { status: erro.status }
    );
  }
  if (erro instanceof ErroHttp) {
    return Response.json({ erro: erro.message }, { status: erro.status });
  }
  console.error(erro);
  return Response.json({ erro: "Erro interno do servidor" }, { status: 500 });
}

export function violacaoUnica(erro: unknown): string | null {
  if (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code?: unknown }).code === "23505"
  ) {
    const restricao = (erro as { constraint?: unknown }).constraint;
    return typeof restricao === "string" ? restricao : null;
  }
  return null;
}
