import { esquemaCriacaoCandidatura } from "@/dominios/recrutamento/esquemas";
import { criarCandidatura } from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rs.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoCandidatura.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarCandidatura(sessao, analise.data);
    return Response.json({ ok: true }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
