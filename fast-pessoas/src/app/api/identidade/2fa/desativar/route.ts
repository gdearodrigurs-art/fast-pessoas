import { esquemaDesativacao2fa } from "@/dominios/identidade/esquemas";
import { desativar2fa } from "@/dominios/identidade/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, lerSessao } from "@/lib/sessao";

export async function POST(request: Request) {
  try {
    const sessao = await lerSessao();
    if (!sessao) {
      throw new ErroHttp(401, "Não autenticado");
    }

    const corpo = await request.json().catch(() => null);
    const analise = esquemaDesativacao2fa.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }

    await desativar2fa(sessao, analise.data);
    return Response.json({ ok: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
