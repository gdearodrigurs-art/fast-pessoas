import { avancarProcesso } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../../identificador";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("desligamento.gerir");
    const { id } = await params;
    const processo = await avancarProcesso(sessao, idProcesso(id));
    return Response.json({ processo });
  } catch (erro) {
    return responderErro(erro);
  }
}
