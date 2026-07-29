import { exigirSessaoDoModulo, montarPainel } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";

/**
 * Painel do módulo — acessível a qualquer chave avaliacao.* (o serviço
 * minimiza o payload por permissão). A carga do painel também dispara a
 * geração lazy dos ciclos de experiência devidos (marcos 45/90).
 */
export async function GET() {
  try {
    const { sessao, pode } = await exigirSessaoDoModulo();
    const painel = await montarPainel(sessao, pode);
    return Response.json(painel);
  } catch (erro) {
    return responderErro(erro);
  }
}
