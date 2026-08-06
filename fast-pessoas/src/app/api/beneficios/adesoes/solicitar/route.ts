import { responderErro } from "@/lib/http";
import { ErroHttp, exigirPermissao } from "@/lib/sessao";

/**
 * A PORTA FECHADA — e ela responde dizendo por quê.
 *
 * Aqui o colaborador pedia adesão e a candidatura virava demanda. A Diretora de
 * Pessoas encerrou o modelo ("benefícios sem candidatura, só reajuste",
 * docs/11 §3; onda H1 em docs/10): a pessoa já entra com direito e quem concede
 * é o DP, em POST /api/beneficios/adesoes.
 *
 * O arquivo continua existindo em vez de sumir porque uma aba antiga aberta na
 * tela de benefícios ainda posta aqui, e 404 mudo faz o usuário achar que o
 * sistema quebrou. 410 Gone é a resposta certa: existiu, acabou, e a frase diz
 * o que fazer. As demandas de adesão ABERTAS não são afetadas — elas continuam
 * na fila do DP até serem concedidas ou negadas.
 */
export async function POST() {
  try {
    await exigirPermissao("adesao.solicitar");
    throw new ErroHttp(
      410,
      "A adesão não é mais pedida pelo colaborador: o benefício é concedido " +
        "pelo DP, com o valor de cada pessoa. Procure o DP."
    );
  } catch (erro) {
    return responderErro(erro);
  }
}
