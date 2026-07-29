import { aprovarExcecao } from "@/dominios/ferias/servico";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";
import { responderErro } from "@/lib/http";

function idProgramacao(bruto: string): number {
  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErroHttp(400, "Identificador de programação inválido.");
  }
  return id;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Aprovação de exceção: só DP/RH (ferias.administrar) — o fluxo normal é
    // a aprovação do gestor na demanda vinculada.
    const sessao = await exigirPermissao("ferias.administrar");
    const { id } = await params;
    const programacao = await aprovarExcecao(sessao, idProgramacao(id));
    return Response.json({ programacao });
  } catch (erro) {
    return responderErro(erro);
  }
}
