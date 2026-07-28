import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelDemandas } from "./painel-demandas";

export default async function PaginaDemandas() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "demanda.criar"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelDemandas />;
}
