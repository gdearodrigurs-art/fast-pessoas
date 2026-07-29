import { esquemaAbrirCompetencia } from "@/dominios/folha/esquemas";
import { abrirCompetencia, montarVisaoFolha } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** Lista de competências — SEM valores; dinheiro só no detalhe (com trilha). */
export async function GET() {
  try {
    const sessao = await exigirPermissao("folha.ver");
    return Response.json(await montarVisaoFolha(sessao));
  } catch (erro) {
    return responderErro(erro);
  }
}

/** Abre a competência mensal (estado inicial: aberta). */
export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAbrirCompetencia.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const competencia = await abrirCompetencia(sessao, analise.data);
    return Response.json({ competencia }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
