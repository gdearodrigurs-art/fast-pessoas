import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelUsuarios } from "./painel-usuarios";

export default async function PaginaUsuarios() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "usuario.administrar"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelUsuarios />;
}
