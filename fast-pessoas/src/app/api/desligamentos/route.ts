import { esquemaIniciarProcesso } from "@/dominios/desligamento/esquemas";
import { iniciarProcesso, montarVisao } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("desligamento.ver");
    const visao = await montarVisao(sessao);
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("desligamento.iniciar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaIniciarProcesso.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const processo = await iniciarProcesso(sessao, analise.data);
    return Response.json({ processo }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
