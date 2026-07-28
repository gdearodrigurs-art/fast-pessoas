import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelMetas } from "./painel-metas";

export default async function PaginaMetas() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "indicador.ver"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelMetas />;
}
