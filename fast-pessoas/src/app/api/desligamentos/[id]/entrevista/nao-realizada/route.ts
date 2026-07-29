import { esquemaMotivoAcao } from "@/dominios/desligamento/esquemas";
import { naoRealizarEntrevistaProcesso } from "@/dominios/desligamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idProcesso } from "../../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("entrevista.conduzir");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaMotivoAcao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const entrevista = await naoRealizarEntrevistaProcesso(
      sessao,
      idProcesso(id),
      analise.data.motivo
    );
    return Response.json({ entrevista });
  } catch (erro) {
    return responderErro(erro);
  }
}
