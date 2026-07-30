import { montarPainelExecutivo } from "@/dominios/painel-executivo/servico";
import { CHAVE_PAINEL } from "@/dominios/painel-executivo/esquemas";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/**
 * Dashboard Executivo — tudo em uma chamada, porque a diretoria abre a tela
 * para ver o conjunto, não um card de cada vez.
 *
 * A guarda é `painel.executivo.ver` e só ela: o card de CUSTO DE PESSOAL é
 * condicionado a `folha.ver` DENTRO do serviço, que confere a chave no banco e
 * devolve o card bloqueado (sem campo de valor) para quem não a tem. Fazer isso
 * no serviço, e não aqui, garante que qualquer outro consumidor futuro desta
 * função herde o mesmo bloqueio.
 */
export async function GET() {
  try {
    const sessao = await exigirPermissao(CHAVE_PAINEL);
    return Response.json(await montarPainelExecutivo(sessao));
  } catch (erro) {
    return responderErro(erro);
  }
}
