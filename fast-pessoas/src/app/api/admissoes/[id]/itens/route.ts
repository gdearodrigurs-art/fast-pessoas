import { esquemaItemAvulso } from "@/dominios/admissao/esquemas";
import { acrescentarItem } from "@/dominios/admissao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAdmissao } from "../../identificador";

/** Acrescenta um item ao checklist de um processo em preparação. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("admissao.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaItemAvulso.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const detalhe = await acrescentarItem(
      sessao,
      idAdmissao(id),
      analise.data
    );
    return Response.json(detalhe, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
