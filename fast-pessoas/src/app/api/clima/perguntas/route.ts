import { esquemaTextoPergunta } from "@/dominios/clima/esquemas";
import { criarPergunta, obterPerguntasAdmin } from "@/dominios/clima/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    await exigirPermissao("clima.pergunta.administrar");
    return Response.json(await obterPerguntasAdmin());
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Assunto novo: cria uma pergunta nova (ativa) no fim da ordem. */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("clima.pergunta.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaTextoPergunta.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await criarPergunta(sessao, analise.data);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
