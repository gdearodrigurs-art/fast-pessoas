import { esquemaIniciarAdmissao } from "@/dominios/recrutamento/esquemas";
import { iniciarAdmissao } from "@/dominios/recrutamento/servico";
import { ErroHttpCampo, responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idRecrutamento } from "../../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rs.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaIniciarAdmissao.safeParse(corpo);
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
    const resultado = await iniciarAdmissao(
      sessao,
      idRecrutamento(id),
      analise.data
    );
    return Response.json(resultado, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
