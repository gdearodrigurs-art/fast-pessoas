import { type NextRequest } from "next/server";
import { relatorioDiversidade } from "@/dominios/colaboradores/servico";
import {
  esquemaFiltroEstrutura,
  lerFiltroEstrutura,
} from "@/dominios/estrutura/esquemas";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET(request: NextRequest) {
  try {
    const sessao = await exigirPermissao("relatorio.ver");
    // Recorte por registro, lotação e centro de custo — combinável. A supressão
    // de recorte pequeno vale igual dentro do recorte: cortar o quadro por três
    // campos só deixa os grupos MENORES, e é aí que o k importa mais.
    const analise = esquemaFiltroEstrutura.safeParse(
      lerFiltroEstrutura(request.nextUrl.searchParams)
    );
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    // Só agregado sai daqui, com supressão de recorte pequeno no serviço; a
    // leitura entra em audit.leitura_sensivel (gênero é autodeclarado).
    return Response.json(await relatorioDiversidade(sessao, analise.data));
  } catch (erro) {
    return responderErro(erro);
  }
}
