import { opcoesMovimentacao } from "@/dominios/demandas/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

// Opções do formulário: alvos possíveis (liderados vigentes), cargos e
// unidades com versão ativa. NÃO traz faixa salarial — a faixa é lida à parte,
// por cargo escolhido, com trilha de leitura sensível.
export async function GET() {
  try {
    const sessao = await exigirPermissao("movimentacao.solicitar");
    return Response.json(await opcoesMovimentacao(sessao));
  } catch (erro) {
    return responderErro(erro);
  }
}
