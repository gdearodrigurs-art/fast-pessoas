import { obterDetalhe } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../identificador";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Motivo e respostas de entrevista NÃO saem daqui para quem não tem as
    // chaves restritas — ausência, não máscara (tratado no serviço).
    const sessao = await exigirPermissao("desligamento.ver");
    const { id } = await params;
    const detalhe = await obterDetalhe(sessao, idProcesso(id));
    return Response.json(detalhe);
  } catch (erro) {
    return responderErro(erro);
  }
}
