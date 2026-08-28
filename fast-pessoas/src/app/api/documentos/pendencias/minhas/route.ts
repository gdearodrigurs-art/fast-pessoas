import { minhasPendencias } from "@/dominios/documentos/servico";
import { responderErro } from "@/lib/http";
import { exigirSessaoParaRegularizacao } from "@/lib/sessao";

/**
 * As pendências de ciência do usuário da SESSÃO — o cartão do portal e o
 * contrato que o GATE de 1º acesso (Onda 2) consome pela mesma visão
 * (`bloqueada` + `bloqueio`). Keyless de propósito: não há chave que dê a
 * pendência DOS OUTROS — o filtro é o usuario_id da sessão, no SQL. A guarda
 * é a variante de REGULARIZAÇÃO (A5/A8): reconfere 2FA e usuário ativo, mas
 * NÃO barra o `ciencia_pendente` — é por aqui que o bloqueado enxerga a
 * própria pendência e que a sessão se reemite sem o claim.
 */
export async function GET() {
  try {
    const sessao = await exigirSessaoParaRegularizacao();
    const pendencias = await minhasPendencias(sessao);
    return Response.json(pendencias);
  } catch (erro) {
    return responderErro(erro);
  }
}
