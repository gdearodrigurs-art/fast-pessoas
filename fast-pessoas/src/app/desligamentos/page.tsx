import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelDesligamentos } from "./painel-desligamentos";

export default async function PaginaDesligamentos() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "desligamento.ver"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelDesligamentos />;
}
