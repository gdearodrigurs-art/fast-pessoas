import { esquemaTextoPergunta } from "@/dominios/clima/esquemas";
import { editarTextoPergunta } from "@/dominios/clima/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idClima } from "../../identificador";

/** Editar o texto da pergunta — só enquanto não houver resposta. */
export async function PUT(
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
    await editarTextoPergunta(sessao, idClima(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
