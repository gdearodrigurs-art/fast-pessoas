import {
  CHAVE_CONDUTA_GERIR,
  CHAVE_CONDUTA_LIBERAR,
  cicloDoDocumento,
} from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirAlgumaPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * O quadro do ciclo de ciência de um documento: quem assinou / recusou /
 * pendente / liberado, os atos com testemunhas e o vencimento do prazo.
 * Duas chaves alcançam a LEITURA: rh.conduta.gerir (DP — administra o rito)
 * e rh.conduta.liberar (admin/diretoria — quem libera precisa VER o ciclo
 * para decidir; B6: liberação "visível no ciclo"). As mutações continuam
 * cada uma atrás da própria chave. Estado de conformidade, não conteúdo
 * sensível.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await exigirAlgumaPermissao([CHAVE_CONDUTA_GERIR, CHAVE_CONDUTA_LIBERAR]);
    const { id } = await params;
    const idNumero = validarId(id);
    if (idNumero === null) {
      return Response.json({ erro: "Identificador inválido" }, { status: 400 });
    }
    const ciclo = await cicloDoDocumento(idNumero);
    return Response.json({ ciclo });
  } catch (erro) {
    return responderErro(erro);
  }
}
