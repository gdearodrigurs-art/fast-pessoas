import {
  listarApuracoesComNome,
  listarCompetenciasApuradas,
  listarIntercorrencias,
  ultimaCompetenciaFechada,
} from "@/dominios/ponto/servico";
import { consultar } from "@/lib/banco";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { competenciaDaBusca } from "./identificador";

const CHAVES = [
  "ponto.administrar",
  "ponto.ajustar",
  "ponto.parametros",
  "ponto.importar",
  "ponto.ver.equipe",
] as const;

/**
 * Visão do DP: competências já apuradas, a tabela da competência escolhida e
 * a fila de intercorrências abertas. Números de JORNADA, não de dinheiro — o
 * valor da hora extra é assunto da folha e não trafega aqui.
 *
 * A entrada exige `ponto.administrar` (quem apura vê a empresa toda). O bloco
 * `pode` só existe para a tela decidir o que desenhar; cada rota reconfere.
 */
export async function GET(request: Request) {
  try {
    const sessao = await exigirPermissao("ponto.administrar");
    const { ano, mes } = competenciaDaBusca(
      request.url,
      ultimaCompetenciaFechada()
    );

    const chaves = await consultar<{ chave: string; autorizado: boolean }>(
      `SELECT chave, sistema.tem_permissao($1, chave) AS autorizado
         FROM unnest($2::text[]) AS chave`,
      [sessao.usuario_id, [...CHAVES]]
    );
    const pode = Object.fromEntries(
      chaves.map((linha) => [linha.chave, linha.autorizado])
    );

    const [competencias, apuracoes, fila] = await Promise.all([
      listarCompetenciasApuradas(),
      listarApuracoesComNome(sessao, ano, mes),
      listarIntercorrencias(sessao, { status: "aberta" }),
    ]);

    return Response.json({
      competencia: { ano, mes },
      pode: {
        administrar: pode["ponto.administrar"] === true,
        ajustar: pode["ponto.ajustar"] === true,
        parametros: pode["ponto.parametros"] === true,
        importar: pode["ponto.importar"] === true,
        ver_equipe: pode["ponto.ver.equipe"] === true,
      },
      competencias,
      apuracoes,
      intercorrencias: fila.itens,
      // O contador da tela era `intercorrencias.length`, ou seja, o tamanho da
      // lista JÁ CORTADA pelo limite da página: com 501 abertas o DP lia "500"
      // e acreditava ser o total. Estes três campos são o que permite a tela
      // dizer a verdade — e apontar a mais antiga, que é a primeira a cair fora.
      intercorrencias_total: fila.total,
      intercorrencias_limite: fila.limite,
      intercorrencia_mais_antiga: fila.mais_antiga,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
