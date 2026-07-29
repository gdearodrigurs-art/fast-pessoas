import { montarVisao } from "@/dominios/ferias/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    // Todo papel tem ferias.programar (visão própria); o serviço decide se a
    // visão administrativa (painel de vencimento) entra pela chave própria.
    const sessao = await exigirPermissao("ferias.programar");
    const visao = await montarVisao(sessao);
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}
