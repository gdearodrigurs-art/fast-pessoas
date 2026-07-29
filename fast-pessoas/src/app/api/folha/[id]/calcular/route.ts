import { calcularCompetencia } from "@/dominios/folha/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idFolha } from "../../identificador";

/**
 * Roda o motor para TODOS os colaboradores ativos com posição vigente
 * (aberta|conferencia → calculo → conferencia). Sem posição = impedido,
 * fica fora do cálculo e aparece na lista.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessao = await exigirPermissao("folha.operar");
    const { id } = await params;
    const resultado = await calcularCompetencia(sessao, idFolha(id));
    return Response.json(resultado);
  } catch (erro) {
    return responderErro(erro);
  }
}
