import { listarOpcoesDeEstrutura } from "@/dominios/estrutura/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Seletores de REGISTRO e CENTRO DE CUSTO para quem define a alocação de um
 * colaborador. A chave é a mesma que autoriza mexer em lotação
 * (`rh.estabelecimento.administrar` — "gerir estabelecimentos e lotações"), e
 * não a de administrar os catálogos: escolher de uma lista não é o mesmo que
 * poder mudar a lista.
 */
export async function GET() {
  try {
    await exigirPermissao("rh.estabelecimento.administrar");
    const opcoes = await listarOpcoesDeEstrutura();
    return Response.json(opcoes);
  } catch (erro) {
    return responderErro(erro);
  }
}
