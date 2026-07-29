import { esquemaPlanoNovo } from "@/dominios/pesquisas/esquemas";
import { criarPlano, obterVisaoPlanos } from "@/dominios/pesquisas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Planos de ação da pesquisa. O serviço restringe o gestor à PRÓPRIA unidade
 * (mais os planos da empresa, que valem para ele também); RH/DP veem todos.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pesquisa.plano.gerir");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const visao = await obterVisaoPlanos(sessao, idNumero);
    return Response.json(visao);
  } catch (erro) {
    return responderErro(erro);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pesquisa.plano.gerir");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaPlanoNovo.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const plano = await criarPlano(sessao, idNumero, analise.data);
    return Response.json({ plano }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
