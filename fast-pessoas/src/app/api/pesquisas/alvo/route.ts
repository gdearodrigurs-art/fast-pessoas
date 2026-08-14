import { type NextRequest } from "next/server";
import { lerMinimoPorRecorte } from "@/dominios/colaboradores/repositorio";
import { lerFiltroEstrutura } from "@/dominios/estrutura/esquemas";
import { esquemaAlvoPesquisa } from "@/dominios/pesquisas/esquemas";
import { contarElegiveis } from "@/dominios/pesquisas/repositorio";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Contador VIVO do público-alvo, para a tela de criação mostrar "N no recorte"
 * enquanto quem cria mexe nos seletores — e avisar quando o recorte cai abaixo
 * do piso k (a criação será recusada em criarPesquisa). A contagem mora no
 * SERVIDOR (eixo 7): o cliente nunca conta gente, só pinta o número.
 *
 * Mesma chave de quem cria pesquisa (`pesquisa.administrar`). Recorte vazio
 * (nenhum parâmetro) conta a empresa toda — é resposta legítima, não erro.
 */
export async function GET(request: NextRequest) {
  try {
    await exigirPermissao("pesquisa.administrar");
    const parametros = request.nextUrl.searchParams;
    const analise = esquemaAlvoPesquisa.safeParse({
      ...lerFiltroEstrutura(parametros),
      cargo_id: parametros.get("cargo_id") || undefined,
    });
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Público-alvo inválido" },
        { status: 400 }
      );
    }
    const [elegiveis, minimo] = await Promise.all([
      contarElegiveis(analise.data),
      lerMinimoPorRecorte(),
    ]);
    return Response.json({ elegiveis, minimo });
  } catch (erro) {
    return responderErro(erro);
  }
}
