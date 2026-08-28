import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelModelosAvaliacao } from "./painel-modelos";

export default async function PaginaModelos() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "avaliacao.configurar"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelModelosAvaliacao />;
}
