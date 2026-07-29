import { concluirProcesso } from "@/dominios/admissao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idAdmissao } from "../../identificador";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("admissao.gerir");
    const { id } = await params;
    const detalhe = await concluirProcesso(sessao, idAdmissao(id));
    return Response.json(detalhe);
  } catch (erro) {
    return responderErro(erro);
  }
}
