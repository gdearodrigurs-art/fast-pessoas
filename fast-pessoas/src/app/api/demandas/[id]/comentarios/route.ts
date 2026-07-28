import { esquemaComentario } from "@/dominios/demandas/esquemas";
import { comentarDemanda } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idDemanda } from "../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("demanda.criar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaComentario.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const comentarios = await comentarDemanda(
      sessao,
      idDemanda(id),
      analise.data.texto
    );
    return Response.json({ comentarios }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
