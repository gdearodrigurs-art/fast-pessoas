import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { ModelosCliente } from "./modelos-cliente";

export default async function PaginaModelosSelecao() {
  const sessao = await exigirSessaoDePagina();
  // Desenhar o processo seletivo é rs.gerir (mesma chave do kanban/painel).
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "rs.gerir"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <ModelosCliente />;
}
