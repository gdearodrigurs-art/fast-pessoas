import {
  listarMovimentosBanco,
  resolverRegraBanco,
  hojeLocal,
  saldoBanco,
} from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { idPonto } from "../../identificador";

/**
 * Extrato do banco de horas de uma pessoa: saldo, movimentos e a regra que
 * vale hoje para ela (limite e prazo de compensação vêm da regra resolvida em
 * três níveis, nunca de um número fixo na tela).
 *
 * O alcance é do serviço: próprio sempre; terceiro só DP ou gestor do liderado.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ colaboradorId: string }> }
) {
  try {
    const sessao = await exigirPermissao("ponto.ver.proprio");
    const { colaboradorId } = await params;
    const id = idPonto(colaboradorId);
    const movimentos = await listarMovimentosBanco(sessao, id);
    const [saldo, regra] = await Promise.all([
      saldoBanco(id),
      resolverRegraBanco(id, hojeLocal()),
    ]);
    return Response.json({
      colaborador_id: id,
      saldo_minutos: saldo,
      regra: regra
        ? {
            escopo: regra.escopo,
            limite_positivo_minutos: regra.limite_positivo_minutos,
            limite_negativo_minutos: regra.limite_negativo_minutos,
            prazo_compensacao_dias: regra.prazo_compensacao_dias,
            fator_he_50: regra.fator_he_50,
            fator_he_100: regra.fator_he_100,
          }
        : null,
      movimentos,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
