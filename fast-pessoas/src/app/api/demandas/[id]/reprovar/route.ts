import { esquemaMotivo } from "@/dominios/demandas/esquemas";
import { reprovarDemanda } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idDemanda } from "../../identificador";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("demanda.aprovar");
    const { id } = await params;
    const corpo = await request.json().catch(() => null);
    const analise = esquemaMotivo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const demanda = await reprovarDemanda(
      sessao,
      idDemanda(id),
      analise.data.motivo
    );
    return Response.json({ demanda });
  } catch (erro) {
    return responderErro(erro);
  }
}
