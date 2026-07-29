import { esquemaDecisao } from "@/dominios/avaliacao/esquemas";
import { registrarDecisao } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAvaliacao } from "../../identificador";

/**
 * Decisão humana sobre o ciclo consolidado (DP/diretoria). Divergência da
 * recomendação da faixa exige justificativa — validada no serviço.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("avaliacao.decidir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaDecisao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await registrarDecisao(sessao, idAvaliacao(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
