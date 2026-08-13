import { montarMeuPdi } from "@/dominios/portais/colaborador-servico";
import { responderErro } from "@/lib/http";

/**
 * O PDI homologado do PRÓPRIO colaborador: o plano, o estado do aceite e as
 * ações com o log de andamento. Sem `colaborador_id` na entrada — o alvo sai da
 * sessão, dentro do serviço (mesma defesa contra IDOR do resto do portal).
 * Devolve null quando a pessoa não tem PDI homologado.
 */
export async function GET() {
  try {
    return Response.json(await montarMeuPdi());
  } catch (erro) {
    return responderErro(erro);
  }
}
