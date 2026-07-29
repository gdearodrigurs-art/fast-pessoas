import { exigirSessaoRs, obterKanban } from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { idRecrutamento } from "../../identificador";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Kanban: rs.ver/rs.gerir veem tudo; gestor sem rs.ver só a vaga da sua
    // requisição — o recorte (contato e valor de oferta) fica no serviço.
    const { sessao, pode } = await exigirSessaoRs();
    const { id } = await params;
    const kanban = await obterKanban(sessao, pode, idRecrutamento(id));
    return Response.json(kanban);
  } catch (erro) {
    return responderErro(erro);
  }
}
