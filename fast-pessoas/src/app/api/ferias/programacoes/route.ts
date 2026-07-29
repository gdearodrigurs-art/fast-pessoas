import { esquemaCriacaoProgramacao } from "@/dominios/ferias/esquemas";
import { criarProgramacao } from "@/dominios/ferias/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("ferias.programar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoProgramacao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const programacao = await criarProgramacao(sessao, analise.data);
    return Response.json({ programacao }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
