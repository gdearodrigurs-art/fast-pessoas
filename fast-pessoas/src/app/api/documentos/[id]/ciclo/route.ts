import {
  CHAVE_CONDUTA_GERIR,
  cicloDoDocumento,
} from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

function validarId(id: string): number | null {
  const idNumero = Number(id);
  return Number.isInteger(idNumero) && idNumero > 0 ? idNumero : null;
}

/**
 * O quadro do ciclo de ciência de um documento: quem assinou / recusou /
 * pendente / liberado, os atos com testemunhas e o vencimento do prazo.
 * Servido só a rh.conduta.gerir (DP/diretoria) — estado de conformidade,
 * não conteúdo sensível.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await exigirPermissao(CHAVE_CONDUTA_GERIR);
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
