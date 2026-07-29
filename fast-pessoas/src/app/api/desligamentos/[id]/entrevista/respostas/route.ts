import { obterRespostasEntrevista } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../../../identificador";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Chave restrita própria; cada chamada grava audit.leitura_sensivel
    // (feito no serviço). O indicador de cobertura NUNCA passa por aqui.
    const sessao = await exigirPermissao("entrevista.respostas.ver");
    const { id } = await params;
    const respostas = await obterRespostasEntrevista(sessao, idProcesso(id));
    return Response.json(respostas);
  } catch (erro) {
    return responderErro(erro);
  }
}
