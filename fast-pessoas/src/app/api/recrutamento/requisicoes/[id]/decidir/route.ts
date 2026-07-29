import { esquemaDecisaoRequisicao } from "@/dominios/recrutamento/esquemas";
import { decidirRequisicao } from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idRecrutamento } from "../../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rs.requisicao.decidir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaDecisaoRequisicao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await decidirRequisicao(sessao, idRecrutamento(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
