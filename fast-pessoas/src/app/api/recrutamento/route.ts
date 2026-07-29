import { exigirSessaoRs, montarPainel } from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";

export async function GET() {
  try {
    // Painel combina chaves (rs.ver | rs.gerir | rs.requisicao.criar) —
    // a regra de acesso e o recorte do payload ficam no serviço.
    const { sessao, pode } = await exigirSessaoRs();
    const painel = await montarPainel(sessao, pode);
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}
