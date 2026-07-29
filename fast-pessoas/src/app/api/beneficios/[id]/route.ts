import { esquemaAtualizacaoBeneficio } from "@/dominios/beneficios/esquemas";
import { atualizarBeneficio } from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idNumerico } from "../identificador";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("beneficio.administrar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAtualizacaoBeneficio.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const beneficio = await atualizarBeneficio(
      sessao,
      idNumerico(id),
      analise.data
    );
    return Response.json({ beneficio });
  } catch (erro) {
    return responderErro(erro);
  }
}
