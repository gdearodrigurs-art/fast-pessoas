import { esquemaLiberar } from "@/dominios/documentos/esquemas";
import {
  CHAVE_CONDUTA_LIBERAR,
  liberarAcesso,
} from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * Liberação explícita do bloqueio do ciclo (B6 modificado): recusado (ou
 * vencido com ato registrado) SEGUE bloqueado até este ato — chave
 * rh.conduta.liberar (admin/diretoria), auditado e visível no quadro.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao(CHAVE_CONDUTA_LIBERAR);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const corpo = await request.json().catch(() => null);
    const analise = esquemaLiberar.safeParse(corpo);
    if (!analise.success) {
      return Response.json(
        { erro: analise.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const liberacao = await liberarAcesso(
      sessao,
      idNumero,
      analise.data.usuario_id,
      analise.data.justificativa
    );
    return Response.json({ liberacao }, { status: 201 });
  } catch (erro) {
    return responderErro(erro);
  }
}
