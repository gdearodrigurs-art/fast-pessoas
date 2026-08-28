import { esquemaCriacaoModelo } from "@/dominios/recrutamento/esquemas";
import {
  criarModelo,
  exigirSessaoRs,
  obterModelosSelecao,
} from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";

export async function GET() {
  try {
    // Administrar modelos de processo é rs.gerir; o serviço barra quem não tem.
    const { pode } = await exigirSessaoRs();
    const painel = await obterModelosSelecao(pode);
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const { sessao, pode } = await exigirSessaoRs();
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoModelo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const id = await criarModelo(sessao, pode, analise.data);
    return Response.json({ id }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
