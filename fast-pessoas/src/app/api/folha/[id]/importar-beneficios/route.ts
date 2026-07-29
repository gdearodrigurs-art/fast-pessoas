import { importarDescontosBeneficios } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

/**
 * Gera as variáveis de desconto (rubrica 2101) a partir das adesões ativas
 * com desconto em rh.adesao — reimportar substitui o lote anterior.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const { id } = await params;
    const resultado = await importarDescontosBeneficios(sessao, idFolha(id));
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
