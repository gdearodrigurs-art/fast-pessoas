import { buscarLote } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";
import { idPonto } from "../../identificador";

/** Relatório completo do lote: linha a linha rejeitada, com o motivo. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await exigirPermissao("ponto.importar");
    const { id } = await params;
    const lote = await buscarLote(idPonto(id));
    if (!lote) throw new ErroHttp(404, "Lote não encontrado");
    return Response.json({ lote });
  } catch (erro) {
    return responderErro(erro);
  }
}
