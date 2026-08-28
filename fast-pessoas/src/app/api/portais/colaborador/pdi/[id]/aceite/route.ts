import { aceitarMeuPdi } from "@/dominios/portais/colaborador-servico";
import { responderErro } from "@/lib/http";
import { idNumerico } from "@/app/api/beneficios/identificador";

/**
 * O colaborador dá o "de acordo" no PRÓPRIO PDI homologado (mão dupla). O id é o
 * do PDI; o titular sai da sessão e o serviço só aceita um PDI homologado, ainda
 * não aceito, que seja dele — senão 404, o mesmo do id que não existe.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await aceitarMeuPdi(idNumerico(id));
    return new Response(null, { status: 204 });
  } catch (erro) {
    return responderErro(erro);
  }
}
