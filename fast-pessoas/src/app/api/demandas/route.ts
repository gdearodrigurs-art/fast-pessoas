import { esquemaCriacaoDemanda, esquemaFiltroDemandas } from "@/dominios/demandas/esquemas";
import { criarDemanda, montarVisao } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET(request: Request) {
  try {
    const sessao = await exigirPermissao("demanda.criar");
    const { searchParams } = new URL(request.url);
    const analise = esquemaFiltroDemandas.safeParse({
      status: searchParams.get("status") ?? undefined,
      tipo: searchParams.get("tipo") ?? undefined,
      atraso: searchParams.get("atraso") ?? undefined,
    });
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtros inválidos" },
        { status: 400 }
      );
    }
    const visao = await montarVisao(sessao, analise.data);
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("demanda.criar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoDemanda.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const demanda = await criarDemanda(sessao, analise.data);
    return Response.json({ demanda }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
