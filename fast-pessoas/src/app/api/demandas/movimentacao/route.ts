import { esquemaCriacaoMovimentacao } from "@/dominios/demandas/esquemas";
import { criarMovimentacao } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

// Abertura do pedido de promoção/transferência. O escopo (só para liderado
// vigente, ou em nome do líder com chave de DP/diretoria) é conferido no
// serviço — a chave aqui é o portão, não o alcance.
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("movimentacao.solicitar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoMovimentacao.safeParse(corpo);
    if (!analise.success) {
      const problema = analise.error.issues[0];
      return Response.json(
        {
          erro: problema?.message ?? "Dados inválidos",
          campo: problema?.path?.[0] ? String(problema.path[0]) : undefined,
        },
        { status: 400 }
      );
    }
    const pedido = await criarMovimentacao(sessao, analise.data);
    return Response.json({ pedido }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
