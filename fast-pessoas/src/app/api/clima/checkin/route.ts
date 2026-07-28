import { esquemaRespostaCheckin } from "@/dominios/clima/esquemas";
import { obterCheckinDoDia, responderCheckin } from "@/dominios/clima/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("clima.responder");
    const resultado = await obterCheckinDoDia(sessao);
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("clima.responder");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaRespostaCheckin.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const resultado = await responderCheckin(sessao, analise.data);
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
