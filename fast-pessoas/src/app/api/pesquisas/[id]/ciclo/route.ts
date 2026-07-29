import { esquemaAcaoPesquisa } from "@/dominios/pesquisas/esquemas";
import { alterarCicloPesquisa } from "@/dominios/pesquisas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/** Abrir (rascunho -> aberta) ou encerrar (aberta -> encerrada). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("pesquisa.administrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAcaoPesquisa.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Ação inválida" },
        { status: 400 }
      );
    }
    const pesquisa = await alterarCicloPesquisa(sessao, idNumero, analise.data);
    return Response.json({ pesquisa });
  } catch (erro) {
    return responderErro(erro);
  }
}
