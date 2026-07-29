import { esquemaCancelamento } from "@/dominios/avaliacao/esquemas";
import { cancelarCiclo } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAvaliacao } from "../../identificador";

/** Cancela ciclo ainda não consolidado (ciclo fechado não reabre). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.configurar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCancelamento.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await cancelarCiclo(sessao, idAvaliacao(id), analise.data.motivo);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
