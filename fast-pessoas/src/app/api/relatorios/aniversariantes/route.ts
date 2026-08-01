import { type NextRequest } from "next/server";
import { esquemaFiltroAniversariantes } from "@/dominios/colaboradores/esquemas";
import { relatorioAniversariantes } from "@/dominios/colaboradores/servico";
import { lerFiltroEstrutura } from "@/dominios/estrutura/esquemas";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    // Relatório é leitura TRANSVERSAL do quadro: quem autoriza é relatorio.ver,
    // nunca rh.colaborador.ver (que tem escopo de gestor).
    await exigirPermissao("relatorio.ver");
    const parametros = request.nextUrl.searchParams;
    const analise = esquemaFiltroAniversariantes.safeParse({
      mes: parametros.get("mes") || undefined,
      ...lerFiltroEstrutura(parametros),
    });
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    return Response.json(await relatorioAniversariantes(analise.data));
  } catch (erro) {
    return responderErro(erro);
  }
}
