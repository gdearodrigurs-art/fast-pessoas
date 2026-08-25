import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelAvaliacaoPar } from "./painel-avaliacao-par";

/**
 * Avaliação de PAR — o colega responde a avaliação 360 que lhe pediram. Toda
 * sessão com `avaliacao.avaliar_par` (os 8 papéis) alcança; a API confere, a
 * cada chamada, se o usuário é de fato um par designado daquele ciclo.
 */
export default async function PaginaAvaliacaoPar() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    `SELECT sistema.tem_permissao($1, 'avaliacao.avaliar_par') AS autorizado`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelAvaliacaoPar />;
}
