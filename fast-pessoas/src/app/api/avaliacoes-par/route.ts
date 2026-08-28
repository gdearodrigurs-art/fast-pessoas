import { listarMinhasAvaliacoesDePar } from "@/dominios/avaliacao/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** As avaliações de par pedidas AO colaborador da sessão. */
export async function GET() {
  try {
    const sessao = await exigirPermissao("avaliacao.avaliar_par");
    const avaliacoes = await listarMinhasAvaliacoesDePar(sessao);
    return Response.json({ avaliacoes });
  } catch (erro) {
    return responderErro(erro);
  }
}
