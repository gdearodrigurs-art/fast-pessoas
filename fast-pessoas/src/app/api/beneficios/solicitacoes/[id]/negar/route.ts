import { esquemaNegativaSolicitacao } from "@/dominios/beneficios/esquemas";
import { negarSolicitacao } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../../../identificador";

/** DP nega uma solicitação de adesão/cancelamento (recusa a demanda). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNegativaSolicitacao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await negarSolicitacao(sessao, idNumerico(id), analise.data.motivo);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
