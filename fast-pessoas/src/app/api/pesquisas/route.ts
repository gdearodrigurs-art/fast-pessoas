import { esquemaCriacaoPesquisa } from "@/dominios/pesquisas/esquemas";
import {
  criarPesquisa,
  exigirAlgumaChavePesquisa,
  obterVisao,
} from "@/dominios/pesquisas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Índice do módulo: o serviço decide o que cada perfil recebe — quem só tem
 * pesquisa.responder leva apenas as pesquisas abertas para si, sem a lista
 * administrativa e sem qualquer resultado.
 */
export async function GET() {
  try {
    const { sessao, pode } = await exigirAlgumaChavePesquisa();
    const visao = await obterVisao(sessao, pode);
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("pesquisa.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoPesquisa.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const pesquisa = await criarPesquisa(sessao, analise.data);
    return Response.json({ pesquisa }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
