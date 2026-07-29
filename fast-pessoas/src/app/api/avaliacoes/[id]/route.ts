import { exigirSessaoDoModulo, obterDetalhe } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { idAvaliacao } from "../identificador";

/**
 * Detalhe do ciclo — payload minimizado por permissão no serviço:
 * respostas só para o avaliador do ciclo e para avaliacao.resultado.ver;
 * resultado/recomendação SÓ para resultado.ver (leitura gera trilha).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sessao, pode } = await exigirSessaoDoModulo();
    const { id } = await params;
    const detalhe = await obterDetalhe(sessao, pode, idAvaliacao(id));
    return Response.json(detalhe);
  } catch (erro) {
    return responderErro(erro);
  }
}
