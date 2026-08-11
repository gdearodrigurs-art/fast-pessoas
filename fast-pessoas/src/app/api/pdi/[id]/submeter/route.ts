import { submeterPdi } from "@/dominios/pdi/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

// Gestor submete o rascunho para a homologação do RH.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pdi.gerar");
    const { id } = await params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ErroHttp(400, "id de PDI inválido");
    }
    await submeterPdi(sessao, n);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
