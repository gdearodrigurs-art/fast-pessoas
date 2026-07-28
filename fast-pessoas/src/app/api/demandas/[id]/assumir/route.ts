import { assumirDemanda } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idDemanda } from "../../identificador";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("demanda.atender");
    const { id } = await params;
    const demanda = await assumirDemanda(sessao, idDemanda(id));
    return Response.json({ demanda });
  } catch (erro) {
    return responderErro(erro);
  }
}
