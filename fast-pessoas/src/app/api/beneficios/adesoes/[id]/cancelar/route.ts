import { esquemaCancelamentoAdesao } from "@/dominios/beneficios/esquemas";
import { cancelarAdesao } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../../../identificador";

/** DP cancela uma adesão (fecha a vigência) — nunca apaga. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCancelamentoAdesao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const adesao = await cancelarAdesao(sessao, idNumerico(id), analise.data);
    return Response.json({ adesao });
  } catch (erro) {
    return responderErro(erro);
  }
}
