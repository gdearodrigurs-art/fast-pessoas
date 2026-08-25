import { consultarSituacao2fa } from "@/dominios/identidade/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, garantirUsuarioAtivo, lerSessao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await lerSessao();
    if (!sessao) {
      throw new ErroHttp(401, "Não autenticado");
    }
    // A7: mesma reconferência das irmãs do fluxo de 2FA — desativado não lê.
    await garantirUsuarioAtivo(sessao.usuario_id);
    const situacao = await consultarSituacao2fa(sessao);
    return Response.json(situacao);
  } catch (erro) {
    return responderErro(erro);
  }
}
