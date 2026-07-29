import { esquemaSolicitacaoAdesao } from "@/dominios/beneficios/esquemas";
import { solicitarAdesao } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** Colaborador pede adesão — vira demanda 'adesao_beneficio' para o DP. */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("adesao.solicitar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaSolicitacaoAdesao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const solicitacao = await solicitarAdesao(sessao, analise.data);
    return Response.json({ solicitacao }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
