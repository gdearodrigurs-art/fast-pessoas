import { esquemaConfirmacao2fa } from "@/dominios/identidade/esquemas";
import { confirmarAtivacao2fa } from "@/dominios/identidade/servico";
import { verificarSecretPendente } from "@/dominios/identidade/token-2fa";
import { responderErro } from "@/lib/http";
import { criarSessao, ErroHttp, lerSessao } from "@/lib/sessao";
import { lerCookiePendente, limparCookiePendente } from "../cookie-pendente";

export async function POST(request: Request) {
  try {
    const sessao = await lerSessao();
    if (!sessao) {
      throw new ErroHttp(401, "Não autenticado");
    }

    const corpo = await request.json().catch(() => null);
    const analise = esquemaConfirmacao2fa.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }

    const token = await lerCookiePendente();
    const secretPendente = token
      ? await verificarSecretPendente(token, sessao.usuario_id)
      : null;
    if (!secretPendente) {
      throw new ErroHttp(
        400,
        "Configuração expirada. Gere um novo QR Code e tente de novo."
      );
    }

    await confirmarAtivacao2fa(sessao, secretPendente, analise.data.codigo);
    await limparCookiePendente();

    // Reemite a sessão SEM o claim pendente_2fa: o acesso é liberado na
    // hora, sem exigir novo login.
    if (sessao.pendente_2fa) {
      await criarSessao({
        usuario_id: sessao.usuario_id,
        papel: sessao.papel,
        nome: sessao.nome,
      });
    }
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
