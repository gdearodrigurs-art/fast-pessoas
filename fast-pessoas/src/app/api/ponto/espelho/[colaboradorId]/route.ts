import {
  espelhoDaCompetencia,
  ultimaCompetenciaFechada,
} from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { competenciaDaBusca, idPonto } from "../../identificador";

/**
 * Espelho de ponto da competência: marcações (inclusive as superadas, para a
 * trilha de correção aparecer), apuração com a memória de cálculo dia a dia,
 * intercorrências e saldo do banco.
 *
 * A chave da rota é `ponto.ver.proprio` — que TODO papel tem, porque o espelho
 * do próprio é direito do trabalhador (Portaria 671 art. 79). Quem decide se
 * esta pessoa pode ver AQUELE colaborador é o serviço: próprio sempre; terceiro
 * só com `ponto.administrar` (empresa toda) ou `ponto.ver.equipe` + relação de
 * gestor vigente. Leitura de terceiro grava audit.leitura_sensivel.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ colaboradorId: string }> }
) {
  try {
    const sessao = await exigirPermissao("ponto.ver.proprio");
    const { colaboradorId } = await params;
    const { ano, mes } = competenciaDaBusca(
      request.url,
      ultimaCompetenciaFechada()
    );
    const espelho = await espelhoDaCompetencia(
      sessao,
      idPonto(colaboradorId),
      ano,
      mes
    );
    return Response.json(espelho);
  } catch (erro) {
    return responderErro(erro);
  }
}
