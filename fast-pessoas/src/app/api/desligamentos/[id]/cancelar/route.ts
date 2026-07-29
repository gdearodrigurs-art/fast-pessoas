import { esquemaMotivoAcao } from "@/dominios/desligamento/esquemas";
import { cancelarProcesso } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("desligamento.gerir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaMotivoAcao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const processo = await cancelarProcesso(
      sessao,
      idProcesso(id),
      analise.data.motivo
    );
    return Response.json({ processo });
  } catch (erro) {
    return responderErro(erro);
  }
}
