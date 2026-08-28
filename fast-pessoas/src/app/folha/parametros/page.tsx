import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelParametros } from "./painel-parametros";

export default async function PaginaParametrosFolha() {
  const sessao = await exigirSessaoDePagina();
  // Flag só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada.
  const linhas = await consultar<{ parametros: boolean }>(
    "SELECT sistema.tem_permissao($1, 'folha.parametros') AS parametros",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.parametros) {
    redirect("/");
  }
  return <PainelParametros />;
}
