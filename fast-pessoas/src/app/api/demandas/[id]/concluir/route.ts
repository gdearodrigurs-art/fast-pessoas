import { esquemaConclusao } from "@/dominios/demandas/esquemas";
import { concluirDemanda } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idDemanda } from "../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("demanda.atender");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaConclusao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const demanda = await concluirDemanda(
      sessao,
      idDemanda(id),
      analise.data.resposta
    );
    return Response.json({ demanda });
  } catch (erro) {
    return responderErro(erro);
  }
}
