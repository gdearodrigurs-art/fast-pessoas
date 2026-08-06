import { diaParaAjuste } from "@/dominios/ponto/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";
import { dataDaBusca, idPonto } from "../../identificador";

/**
 * UM dia de UMA pessoa, do tamanho exato do formulário de correção: quais das
 * quatro batidas o dia tem (com id e hora), quais faltam e quais a jornada
 * daquele dia sequer espera.
 *
 * POR QUE NÃO O ESPELHO: o espelho existe e devolve as marcações do mês, mas
 * pelo DIA CIVIL em que foram batidas. Quem entra 19h e sai 07h tem a saída no
 * dia seguinte, e quem amarra as duas ao mesmo dia de apuração é a janela de
 * arraste da jornada, dentro do motor. Filtrar o espelho por data no cliente
 * perderia a batida do plantão noturno — e o espelho também não sabe dizer que
 * uma jornada de 6h não tem intervalo. Esta rota usa o MESMO agrupamento da
 * apuração; o que a tela oferece é o que o motor enxerga.
 *
 * A chave é `ponto.ajustar` porque esta leitura existe para alimentar uma
 * correção — quem não pode corrigir não precisa dela. QUEM pode ler o ponto
 * DAQUELA pessoa é decidido no serviço (empresa toda com `ponto.administrar`,
 * liderados com `ponto.ver.equipe`), que grava a trilha com a chave que de
 * fato autorizou.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ colaboradorId: string }> }
) {
  try {
    const sessao = await exigirPermissao("ponto.ajustar");
    const { colaboradorId } = await params;
    const dia = await diaParaAjuste(
      sessao,
      idPonto(colaboradorId),
      dataDaBusca(request.url)
    );
    return Response.json(dia);
  } catch (erro) {
    return responderErro(erro);
  }
}
