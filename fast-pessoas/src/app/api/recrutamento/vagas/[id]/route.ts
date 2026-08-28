import { esquemaTrocaModeloVaga } from "@/dominios/recrutamento/esquemas";
import {
  exigirSessaoRs,
  obterKanban,
  trocarModeloDaVaga,
} from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
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

/**
 * Troca o modelo de processo congelado da vaga — decisão G1 (docs/20): vaga
 * aberta NÃO migra sozinha quando o modelo é reformulado; a troca é manual e
 * só enquanto a vaga não tem candidatura (o serviço garante as duas coisas).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rs.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaTrocaModeloVaga.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await trocarModeloDaVaga(sessao, idRecrutamento(id), analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
