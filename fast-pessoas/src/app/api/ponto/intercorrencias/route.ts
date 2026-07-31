import { STATUS_INTERCORRENCIA, StatusIntercorrencia } from "@/dominios/ponto/esquemas";
import { listarIntercorrencias } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { ErroHttp, exigirAlgumaPermissao } from "@/lib/sessao";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fila de intercorrências. O ALCANCE é do serviço, não da query: quem tem
 * `ponto.administrar` vê a empresa toda; o gestor vê apenas quem está na sua
 * relação vigente. Não há parâmetro de colaborador aqui de propósito — quem
 * quer uma pessoa específica abre o espelho dela, que confere o alcance.
 */
export async function GET(request: Request) {
  try {
    const { sessao } = await exigirAlgumaPermissao([
      "ponto.administrar",
      "ponto.ver.equipe",
    ]);
    const busca = new URL(request.url).searchParams;

    const statusTexto = busca.get("status");
    if (
      statusTexto !== null &&
      !STATUS_INTERCORRENCIA.includes(statusTexto as StatusIntercorrencia)
    ) {
      throw new ErroHttp(400, "Status de intercorrência inválido");
    }
    const de = busca.get("de");
    const ate = busca.get("ate");
    if ((de !== null && !DATA.test(de)) || (ate !== null && !DATA.test(ate))) {
      throw new ErroHttp(400, "Datas do filtro no formato AAAA-MM-DD");
    }

    const fila = await listarIntercorrencias(sessao, {
      status: (statusTexto as StatusIntercorrencia | null) ?? null,
      de,
      ate,
    });
    // `total`, `limite` e `mais_antiga` acompanham a lista: sem eles quem chama
    // não tem como saber que a página cortou (ver LIMITE_FILA_INTERCORRENCIAS).
    return Response.json({
      intercorrencias: fila.itens,
      total: fila.total,
      limite: fila.limite,
      mais_antiga: fila.mais_antiga,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
