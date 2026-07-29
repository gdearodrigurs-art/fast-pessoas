import { fecharCompetencia } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

/**
 * Fecha e congela (aprovada → fechada). REABRIR NÃO EXISTE — o trigger do
 * banco garante a imutabilidade; correção é competência futura (F2).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.aprovar");
    const { id } = await params;
    const competencia = await fecharCompetencia(sessao, idFolha(id));
    return Response.json({ competencia });
  } catch (erro) {
    return responderErro(erro);
  }
}
