import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { ArvoreOrganograma } from "./arvore-organograma";

/**
 * Gate apenas de SESSÃO: o organograma não tem chave própria — o alcance
 * (empresa toda / própria equipe / corrente até a diretoria) é decidido em
 * GET /api/organograma a cada chamada. Ver o comentário da rota.
 */
export default async function PaginaOrganograma() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  return <ArvoreOrganograma />;
}
