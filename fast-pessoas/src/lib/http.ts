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

export function responderErro(erro: unknown): Response {
  if (erro instanceof ErroHttpCampo) {
    return Response.json(
      { erro: erro.message, campo: erro.campo },
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
