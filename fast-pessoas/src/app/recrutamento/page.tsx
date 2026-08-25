import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelRecrutamento } from "./painel-recrutamento";

export default async function PaginaRecrutamento() {
  const sessao = await exigirSessaoDePagina();
  // Entram: quem vê o módulo (rs.ver/rs.gerir) e o gestor que só solicita.
  const linhas = await consultar<{ autorizado: boolean }>(
    `SELECT sistema.tem_permissao($1, 'rs.ver')
         OR sistema.tem_permissao($1, 'rs.gerir')
         OR sistema.tem_permissao($1, 'rs.requisicao.criar') AS autorizado`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelRecrutamento />;
}
