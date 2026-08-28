import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { TiposCliente } from "./tipos-cliente";

/**
 * Catálogo de tipos de medida disciplinar (advertência verbal/escrita,
 * suspensão…), administrável pela tela (eixo 9). Porteiro: a chave
 * rh.disciplinar.tipo.administrar (dp). A API reconfere cada escrita.
 */
export default async function PaginaTiposDisciplinar() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "rh.disciplinar.tipo.administrar"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <TiposCliente />;
}
