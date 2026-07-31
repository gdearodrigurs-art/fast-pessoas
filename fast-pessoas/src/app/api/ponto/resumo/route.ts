import {
  colaboradorDaSessao,
  resumoPontoDoColaborador,
  ultimaCompetenciaFechada,
} from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Bloco de ponto do PORTAL DO COLABORADOR — pedido textual da diretoria:
 * saldo do banco de horas, média de hora extra por dia e total de HE do
 * último mês.
 *
 * DEFESA CONTRA IDOR: a rota não lê nada da requisição. O colaborador é sempre
 * o da sessão — não aceitar id não é validação que pode falhar, é a ausência
 * do parâmetro.
 *
 * O que NÃO vem aqui: valor em reais da hora extra. HE em dinheiro é folha,
 * tem chave própria e trilha própria.
 */
export async function GET() {
  try {
    const sessao = await exigirPermissao("ponto.ver.proprio");
    const proprio = await colaboradorDaSessao(sessao);
    if (!proprio) {
      return Response.json({
        disponivel: false,
        explicacao:
          "Seu usuário não está vinculado a um colaborador do quadro — sem ponto para mostrar.",
      });
    }
    const resumo = await resumoPontoDoColaborador(proprio.id);
    const competencia = resumo.ultima_apuracao ?? ultimaCompetenciaFechada();
    return Response.json({
      disponivel: true,
      colaborador_id: proprio.id,
      saldo_banco_minutos: resumo.saldo_banco_minutos,
      media_he_por_dia_util_minutos: resumo.media_he_por_dia_util_minutos_ultimo_mes,
      total_he_ultimo_mes_minutos: resumo.total_he_ultimo_mes_minutos,
      ultima_apuracao: resumo.ultima_apuracao,
      intercorrencias_abertas: resumo.intercorrencias_abertas,
      espelho_href: `/ponto/espelho/${proprio.id}?ano=${competencia.ano}&mes=${competencia.mes}`,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
