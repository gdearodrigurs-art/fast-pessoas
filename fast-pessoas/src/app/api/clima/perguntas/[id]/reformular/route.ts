import { esquemaTextoPergunta } from "@/dominios/clima/esquemas";
import { reformularPergunta } from "@/dominios/clima/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idClima } from "../../../identificador";

/** Reformular: encerra a atual e publica uma nova na mesma ordem, ligada a ela. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("clima.pergunta.administrar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaTextoPergunta.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await reformularPergunta(sessao, idClima(id), analise.data);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
