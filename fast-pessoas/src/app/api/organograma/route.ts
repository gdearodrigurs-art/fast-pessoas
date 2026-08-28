import { type NextRequest } from "next/server";
import { lerFiltroEstrutura } from "@/dominios/estrutura/esquemas";
import { esquemaConsultaOrganograma } from "@/dominios/organograma/esquemas";
import { montarOrganograma } from "@/dominios/organograma/servico";
import { responderErro } from "@/lib/http";
import { exigirSessao } from "@/lib/sessao";

/**
 * Organograma — leitura de ESTRUTURA, com escopo por sessão.
 *
 * Sem chave fixa nesta rota, pelo mesmo motivo (e no mesmo padrão) de
 * GET /api/colaboradores: o alcance NÃO é binário. `rh.colaborador.ver` é o que
 * abre a empresa inteira (rh/dp/diretoria/lider_td); o gestor, que também tem a
 * chave, fica restrito à própria subárvore; e o funcionário, que NÃO tem a
 * chave, vê apenas a corrente dele até a diretoria — exigir a chave aqui
 * devolveria 403 para todo o quadro operacional, que é justamente quem mais
 * precisa saber a quem se reportar. O corte é feito em `resolverEscopo`
 * (domínio de colaboradores, fonte única do "quem vê quem") e o que está fora
 * do alcance está AUSENTE do payload — não mascarado.
 *
 * Nenhum dado sensível trafega aqui: sem salário, sem faixa da vaga, sem saúde.
 * Por isso também não há registro em audit.leitura_sensivel.
 *
 * A guarda é exigirSessao (A6): além de sessão + 2FA, ela RECONFERE
 * usuario.ativo no banco — sem isso, um desativado seguia lendo a hierarquia
 * inteira pelo JWT de até 8h ("revogou, acabou").
 */
export async function GET(request: NextRequest) {
  try {
    const sessao = await exigirSessao();
    const parametros = request.nextUrl.searchParams;
    const analise = esquemaConsultaOrganograma.safeParse({
      cargo_id: parametros.get("cargo_id") || undefined,
      busca: parametros.get("busca") || undefined,
      // Registro, lotação e centro de custo — combináveis entre si, com o
      // cargo e com a busca.
      ...lerFiltroEstrutura(parametros),
    });
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Filtro inválido" },
        { status: 400 }
      );
    }
    return Response.json(await montarOrganograma(sessao, analise.data));
  } catch (erro) {
    return responderErro(erro);
  }
}
