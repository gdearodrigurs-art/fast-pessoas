import { type NextRequest } from "next/server";
import { relatorioComposicaoFamiliar } from "@/dominios/colaboradores/servico";
import {
  esquemaFiltroEstrutura,
  lerFiltroEstrutura,
} from "@/dominios/estrutura/esquemas";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    const sessao = await exigirPermissao("relatorio.ver");
    const analise = esquemaFiltroEstrutura.safeParse(
      lerFiltroEstrutura(request.nextUrl.searchParams)
    );
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    // Fonte é rh.dependente (dado de TERCEIRO): só contagem sai, nunca nome
    // de dependente; leitura registrada em audit.leitura_sensivel.
    return Response.json(
      await relatorioComposicaoFamiliar(sessao, analise.data)
    );
  } catch (erro) {
    return responderErro(erro);
  }
}
