import { esquemaSolicitacaoCancelamento } from "@/dominios/beneficios/esquemas";
import { solicitarCancelamento } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../../../identificador";

/** Titular pede cancelamento da própria adesão — vira demanda para o DP. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("adesao.solicitar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaSolicitacaoCancelamento.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const solicitacao = await solicitarCancelamento(
      sessao,
      idNumerico(id),
      analise.data.motivo
    );
    return Response.json({ solicitacao }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
