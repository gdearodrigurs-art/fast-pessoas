import {
  resumoPontoComAlcance,
  ultimaCompetenciaFechada,
} from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idPonto } from "../../identificador";

/**
 * Bloco de ponto da FICHA do colaborador: saldo do banco, HE do último mês e
 * link para o espelho. Mesmo alcance do espelho — o próprio vê o seu, o gestor
 * vê o do liderado, o DP vê o de todos — e leitura de terceiro fica na trilha.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ colaboradorId: string }> }
) {
  try {
    const sessao = await exigirPermissao("ponto.ver.proprio");
    const { colaboradorId } = await params;
    const id = idPonto(colaboradorId);
    const resumo = await resumoPontoComAlcance(sessao, id);
    const competencia = resumo.ultima_apuracao ?? ultimaCompetenciaFechada();
    return Response.json({
      ...resumo,
      espelho_href: `/ponto/espelho/${id}?ano=${competencia.ano}&mes=${competencia.mes}`,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
