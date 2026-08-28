import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelModelosAdmissao } from "./painel-modelos-admissao";

export default async function PaginaModelosAdmissao() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "admissao.modelo.administrar"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelModelosAdmissao />;
}
