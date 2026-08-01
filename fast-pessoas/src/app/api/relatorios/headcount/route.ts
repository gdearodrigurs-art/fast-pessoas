import { type NextRequest } from "next/server";
import { relatorioHeadcount } from "@/dominios/colaboradores/servico";
import {
  esquemaFiltroEstrutura,
  lerFiltroEstrutura,
} from "@/dominios/estrutura/esquemas";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    await exigirPermissao("relatorio.ver");
    const analise = esquemaFiltroEstrutura.safeParse(
      lerFiltroEstrutura(request.nextUrl.searchParams)
    );
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    return Response.json(await relatorioHeadcount(analise.data));
  } catch (erro) {
    return responderErro(erro);
  }
}
