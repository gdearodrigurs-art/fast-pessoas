import { esquemaNomeCategoria } from "@/dominios/desligamento/esquemas";
import {
  criarCategoriaDevolucao,
  obterCatalogoCategorias,
} from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirAlgumaPermissao, exigirPermissao } from "@/lib/sessao";

const CHAVE_ADMIN = "desligamento.categoria.administrar";

/**
 * O catálogo de categorias de item de devolução (0054). Quem só enxerga
 * desligamento recebe as ATIVAS; quem administra recebe também as inativas,
 * porque reativar é uma das operações da tela.
 */
export async function GET() {
  try {
    const { sessao } = await exigirAlgumaPermissao([
      CHAVE_ADMIN,
      "desligamento.ver",
      "desligamento.gerir",
    ]);
    const catalogo = await obterCatalogoCategorias(sessao);
    return Response.json(catalogo);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao(CHAVE_ADMIN);
    const corpo = await request.json().catch(() => null);
    const analise = esquemaNomeCategoria.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const categorias = await criarCategoriaDevolucao(sessao, analise.data);
    return Response.json({ categorias }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
