import { esquemaEfetivacaoAdesao } from "@/dominios/beneficios/esquemas";
import { efetivarAdesao } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** DP efetiva uma adesão — vinda de demanda ou registro direto. */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("adesao.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaEfetivacaoAdesao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const adesao = await efetivarAdesao(sessao, analise.data);
    return Response.json({ adesao }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
