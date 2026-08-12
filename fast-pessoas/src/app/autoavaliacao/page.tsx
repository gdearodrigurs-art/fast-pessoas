import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelAutoavaliacao } from "./painel-autoavaliacao";

/**
 * Autoavaliação do próprio colaborador — TODA sessão com a chave
 * `avaliacao.autoavaliar` (os 8 papéis) tem direito. A API reconfere a sessão e
 * o escopo (o alvo é sempre o colaborador da sessão) a cada chamada.
 */
export default async function PaginaAutoavaliacao() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    `SELECT sistema.tem_permissao($1, 'avaliacao.autoavaliar') AS autorizado`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelAutoavaliacao />;
}
