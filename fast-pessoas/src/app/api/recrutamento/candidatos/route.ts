import { esquemaCriacaoCandidato } from "@/dominios/recrutamento/esquemas";
import { criarCandidato } from "@/dominios/recrutamento/servico";
import { ErroHttpCampo, responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("rs.gerir");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoCandidato.safeParse(corpo);
    if (!analise.success) {
      const questao = analise.error.issues[0];
      const campo = questao?.path[0];
      if (typeof campo === "string") {
        throw new ErroHttpCampo(
          400,
          questao?.message ?? "Dados inválidos",
          campo
        );
      }
      return Response.json(
        { erro: questao?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const id = await criarCandidato(sessao, analise.data);
    return Response.json({ id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
