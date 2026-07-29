import { obterProcesso } from "@/dominios/admissao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAdmissao } from "../identificador";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("admissao.ver");
    const { id } = await params;
    const detalhe = await obterProcesso(sessao, idAdmissao(id));
    return Response.json(detalhe);
  } catch (erro) {
    return responderErro(erro);
  }
}
