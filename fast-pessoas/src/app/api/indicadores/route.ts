import { esquemaCriacaoIndicador } from "@/dominios/indicadores/esquemas";
import {
  criarNovoIndicador,
  obterCentralDeMetas,
} from "@/dominios/indicadores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

export async function GET() {
  try {
    const sessao = await exigirPermissao("indicador.ver");
    const central = await obterCentralDeMetas(sessao);
    return Response.json(central);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("indicador.administrar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaCriacaoIndicador.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const indicador = await criarNovoIndicador(sessao, analise.data);
    return Response.json({ indicador }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
