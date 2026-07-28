import { consultarSituacao2fa } from "@/dominios/identidade/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, lerSessao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await lerSessao();
    if (!sessao) {
      throw new ErroHttp(401, "Não autenticado");
    }
    const situacao = await consultarSituacao2fa(sessao);
    return Response.json(situacao);
  } catch (erro) {
    return responderErro(erro);
  }
}
