import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelCompetencias } from "./painel-competencias";

export default async function PaginaFolha() {
  const sessao = await exigirSessaoDePagina();
  // Flag só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada.
  const linhas = await consultar<{ ver: boolean }>(
    "SELECT sistema.tem_permissao($1, 'folha.ver') AS ver",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.ver) {
    redirect("/");
  }
  return <PainelCompetencias />;
}
