import { homologarPdi } from "@/dominios/pdi/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

// RH homologa: aprova o PDI e materializa os focos como ações do colaborador.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pdi.homologar");
    const { id } = await params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ErroHttp(400, "id de PDI inválido");
    }
    const resultado = await homologarPdi(sessao, n);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
