import {
  aposentarModelo,
  exigirSessaoRs,
} from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { idRecrutamento } from "../../../identificador";

/**
 * Aposentar: encerra o modelo sem substituto — sai da oferta de vaga nova;
 * vagas que o congelaram continuam correndo por ele (0077). O GERAL não se
 * aposenta (o serviço barra).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sessao, pode } = await exigirSessaoRs();
    const { id } = await params;
    await aposentarModelo(sessao, pode, idRecrutamento(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
