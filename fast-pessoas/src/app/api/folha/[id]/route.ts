import { type NextRequest } from "next/server";
import {
  esquemaFiltroEstrutura,
  lerFiltroEstrutura,
} from "@/dominios/estrutura/esquemas";
import { montarVisaoCompetencia } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../identificador";

/**
 * Painel da competência: estado, impedidos, variáveis, folhas com itens e
 * memória. Payload com VALORES — a leitura grava audit.leitura_sensivel.
 *
 * Aceita o recorte pelos TRÊS campos (registro, lotação, centro de custo),
 * combináveis entre si e resolvidos NO SQL pela apropriação da competência.
 * Ausente = sem recorte, que é a leitura da competência inteira.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.ver");
    const { id } = await params;
    const analise = esquemaFiltroEstrutura.safeParse(
      lerFiltroEstrutura(request.nextUrl.searchParams)
    );
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    const visao = await montarVisaoCompetencia(
      sessao,
      idFolha(id),
      analise.data
    );
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}
