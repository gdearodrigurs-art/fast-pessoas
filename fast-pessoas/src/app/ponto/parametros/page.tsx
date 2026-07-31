import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelParametrosPonto } from "./painel-parametros";

export default async function PaginaParametrosPonto() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  // Flag só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada.
  const linhas = await consultar<{ parametros: boolean }>(
    "SELECT sistema.tem_permissao($1, 'ponto.parametros') AS parametros",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.parametros) {
    redirect("/");
  }
  return <PainelParametrosPonto />;
}
