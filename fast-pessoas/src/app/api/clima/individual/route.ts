import { type NextRequest } from "next/server";
import { esquemaFiltroIndividual } from "@/dominios/clima/esquemas";
import { obterRespostasIndividuais } from "@/dominios/clima/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    // Chave exclusiva da Diretoria de Pessoas; cada chamada grava trilha de
    // leitura em audit.leitura_sensivel (feito no serviço, na mesma transação).
    const sessao = await exigirPermissao("clima.resposta.individual.ver");
    const parametros = request.nextUrl.searchParams;
    const analise = esquemaFiltroIndividual.safeParse({
      inicio: parametros.get("inicio") || undefined,
      fim: parametros.get("fim") || undefined,
      colaborador_id: parametros.get("colaborador_id") || undefined,
    });
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    const resultado = await obterRespostasIndividuais(sessao, analise.data);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
