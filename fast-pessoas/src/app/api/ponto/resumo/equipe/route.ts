import {
  colaboradorDaSessao,
  listarIntercorrencias,
  resumoPontoDaEquipeComAlcance,
} from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

/**
 * Bloco de ponto do PORTAL DO GESTOR — pedido textual da diretoria: banco de
 * horas do time (saldo por liderado), QUEM ESTÁ ESTOURANDO hora extra e a fila
 * de intercorrências da equipe.
 *
 * `acima_do_limite` não é um número fixo na tela: sai da regra de banco de
 * horas resolvida para CADA pessoa (empresa → unidade → cargo → pessoa).
 *
 * `gestor_id` só é aceito de quem tem `ponto.administrar` (DP e diretoria
 * navegam entre equipes no portal do gestor). Gestor comum só vê a própria.
 * O alcance e a trilha de leitura são do serviço — a rota só resolve de qual
 * gestor é o time pedido.
 */
export async function GET(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.ver.equipe");
    const pedido = new URL(request.url).searchParams.get("gestor_id");

    let gestorId: number;
    if (pedido !== null) {
      gestorId = Number(pedido);
      if (!Number.isInteger(gestorId) || gestorId <= 0) {
        throw new ErroHttp(400, "Identificador de gestor inválido");
      }
    } else {
      const proprio = await colaboradorDaSessao(sessao);
      if (!proprio) {
        return Response.json({
          disponivel: false,
          explicacao:
            "Seu usuário não está vinculado a um colaborador do quadro — sem equipe para mostrar.",
        });
      }
      gestorId = proprio.id;
    }

    const resumo = await resumoPontoDaEquipeComAlcance(sessao, gestorId);
    const idsDaEquipe = new Set(
      resumo.liderados.map((linha) => linha.colaborador_id)
    );
    const abertas = (
      await listarIntercorrencias(sessao, { status: "aberta" })
    ).itens.filter((item) => idsDaEquipe.has(item.colaborador_id));

    return Response.json({
      disponivel: true,
      ...resumo,
      intercorrencias: abertas,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
