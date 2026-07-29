import { esquemaAtualizacaoItem } from "@/dominios/admissao/esquemas";
import { atualizarItem } from "@/dominios/admissao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAdmissao } from "../../../identificador";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const sessao = await exigirPermissao("admissao.gerir");
    const { id, itemId } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAtualizacaoItem.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const detalhe = await atualizarItem(
      sessao,
      idAdmissao(id),
      idAdmissao(itemId),
      analise.data.status
    );
    return Response.json(detalhe);
  } catch (erro) {
    return responderErro(erro);
  }
}
