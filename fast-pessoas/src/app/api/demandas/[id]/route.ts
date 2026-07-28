import { obterDemanda } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idDemanda } from "../identificador";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("demanda.criar");
    const { id } = await params;
    const detalhe = await obterDemanda(sessao, idDemanda(id));
    return Response.json(detalhe);
  } catch (erro) {
    return responderErro(erro);
  }
}
