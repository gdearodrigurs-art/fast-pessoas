import { esquemaFechamentoSuspensao } from "@/dominios/disciplinar/esquemas";
import { fecharSuspensaoManual } from "@/dominios/disciplinar/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Fecha (encurta) manualmente a janela de uma suspensão — decisão D1:a: só
 * encurtar, nunca estender nem reabrir; retroativo até o início da janela;
 * quem registra pode encerrar (a MESMA chave `rh.disciplinar.registrar`, de
 * propósito); tudo auditado, com eco neutro na linha do tempo.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("rh.disciplinar.registrar");
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaFechamentoSuspensao.safeParse(corpo);
    if (!analise.success) {
      const issue = analise.error.issues[0];
      return Response.json(
        {
          erro: issue?.message ?? "Dados inválidos",
          ...(typeof issue?.path[0] === "string"
            ? { campo: issue.path[0] }
            : {}),
        },
        { status: 400 }
      );
    }
    const medida = await fecharSuspensaoManual(sessao, idNumero, analise.data);
    return Response.json(medida);
  } catch (erro) {
    return responderErro(erro);
  }
}
