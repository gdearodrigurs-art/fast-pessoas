import { removerFeriado } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idPonto } from "../../../identificador";

/**
 * Remove um feriado cadastrado por engano. É a única remoção do módulo — e
 * mesmo ela grava audit.alteracao com o que saiu. Apuração já feita não muda
 * sozinha: só volta a valer se o DP reapurar a competência.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("ponto.parametros");
    const { id } = await params;
    await removerFeriado(sessao, idPonto(id));
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
