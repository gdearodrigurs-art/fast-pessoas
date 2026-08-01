import { esquemaCriacaoCentroCusto } from "@/dominios/estrutura/esquemas";
import {
  criarCentroCusto,
  listarCentrosCustoAdministraveis,
} from "@/dominios/estrutura/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

const CHAVE = "rh.centro_custo.administrar";

export async function GET() {
  try {
    await exigirPermissao(CHAVE);
    const centros_custo = await listarCentrosCustoAdministraveis();
    return Response.json({ centros_custo });
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao(CHAVE);
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoCentroCusto.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    await criarCentroCusto(sessao, analise.data);
    const centros_custo = await listarCentrosCustoAdministraveis();
    return Response.json({ centros_custo }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
