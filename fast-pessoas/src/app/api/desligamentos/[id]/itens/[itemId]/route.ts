import { esquemaStatusItem } from "@/dominios/desligamento/esquemas";
import { atualizarItemDevolucao } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../../../identificador";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const sessao = await exigirPermissao("desligamento.gerir");
    const { id, itemId } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaStatusItem.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const itens = await atualizarItemDevolucao(
      sessao,
      idProcesso(id),
      idProcesso(itemId),
      analise.data
    );
    return Response.json({ itens });
  } catch (erro) {
    return responderErro(erro);
  }
}
