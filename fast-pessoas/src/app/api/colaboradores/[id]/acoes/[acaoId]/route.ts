import { esquemaAtualizacaoAcao } from "@/dominios/colaboradores/esquemas";
import { atualizarAcaoColaborador } from "@/dominios/colaboradores/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; acaoId: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.feedback.registrar");
    const { id, acaoId } = await params;
    const idNumero = validarId(id);
    const acaoIdNumero = validarId(acaoId);
    if (idNumero === null || acaoIdNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaAtualizacaoAcao.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const acoes = await atualizarAcaoColaborador(
      sessao,
      idNumero,
      acaoIdNumero,
      analise.data
    );
    return Response.json({ acoes });
  } catch (erro) {
    return responderErro(erro);
  }
}
