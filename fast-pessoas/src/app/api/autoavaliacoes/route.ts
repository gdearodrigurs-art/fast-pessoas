import { listarMinhasAutoavaliacoes } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** As autoavaliações do próprio colaborador (papel=auto; ciclos de desempenho). */
export async function GET() {
  try {
    const sessao = await exigirPermissao("avaliacao.autoavaliar");
    const autoavaliacoes = await listarMinhasAutoavaliacoes(sessao);
    return Response.json({ autoavaliacoes });
  } catch (erro) {
    return responderErro(erro);
  }
}
