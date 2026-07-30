import { redirect } from "next/navigation";
import { CHAVE_PAINEL } from "@/dominios/painel-executivo/esquemas";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelExecutivoTela } from "./painel";

/**
 * Gate de RENDERIZAÇÃO apenas: quem não tem a chave não vê a tela e volta para
 * o início. A autorização que vale é a da rota /api/painel-executivo, que
 * reconfere `painel.executivo.ver` no banco em toda chamada — e é ela também
 * que decide, por `folha.ver`, se o card de custo sai com número ou bloqueado.
 */
export default async function PaginaPainelExecutivo() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ pode_ver: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS pode_ver",
    [sessao.usuario_id, CHAVE_PAINEL]
  );
  if (!linhas[0]?.pode_ver) {
    redirect("/");
  }
  return <PainelExecutivoTela />;
}
