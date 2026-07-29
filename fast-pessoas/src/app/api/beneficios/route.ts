import { esquemaCriacaoBeneficio } from "@/dominios/beneficios/esquemas";
import {
  criarBeneficio,
  exigirAcessoBeneficios,
  montarVisao,
} from "@/dominios/beneficios/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const { sessao, pode } = await exigirAcessoBeneficios();
    const visao = await montarVisao(sessao, pode);
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("beneficio.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoBeneficio.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const beneficio = await criarBeneficio(sessao, analise.data);
    return Response.json({ beneficio }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
