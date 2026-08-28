import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelPerfisTela } from "./painel-perfis";

export default async function PaginaPerfis() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "perfil.administrar"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelPerfisTela papelDaSessao={sessao.papel} />;
}
