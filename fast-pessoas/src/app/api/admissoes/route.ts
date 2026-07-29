import { esquemaAberturaProcesso } from "@/dominios/admissao/esquemas";
import { abrirProcesso, montarPainel } from "@/dominios/admissao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("admissao.ver");
    const painel = await montarPainel(sessao);
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("admissao.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAberturaProcesso.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const processo = await abrirProcesso(sessao, analise.data);
    return Response.json({ processo }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
