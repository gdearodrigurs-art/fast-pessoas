import { recusarEntrevistaProcesso } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../../../identificador";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("entrevista.conduzir");
    const { id } = await params;
    const entrevista = await recusarEntrevistaProcesso(sessao, idProcesso(id));
    return Response.json({ entrevista });
  } catch (erro) {
    return responderErro(erro);
  }
}
