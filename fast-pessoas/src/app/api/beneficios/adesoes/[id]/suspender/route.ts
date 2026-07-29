import { suspenderAdesao } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../../../identificador";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const { id } = await params;
    const adesao = await suspenderAdesao(sessao, idNumerico(id));
    return Response.json({ adesao });
  } catch (erro) {
    return responderErro(erro);
  }
}
