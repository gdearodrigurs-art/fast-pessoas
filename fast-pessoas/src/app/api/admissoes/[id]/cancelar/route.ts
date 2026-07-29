import { esquemaCancelamento } from "@/dominios/admissao/esquemas";
import { cancelarProcesso } from "@/dominios/admissao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAdmissao } from "../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("admissao.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCancelamento.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const detalhe = await cancelarProcesso(
      sessao,
      idAdmissao(id),
      analise.data.motivo
    );
    return Response.json(detalhe);
  } catch (erro) {
    return responderErro(erro);
  }
}
