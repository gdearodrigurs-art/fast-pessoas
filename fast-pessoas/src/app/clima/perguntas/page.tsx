import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PerguntasCliente } from "./perguntas-cliente";

export default async function PaginaPerguntasClima() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "clima.pergunta.administrar"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PerguntasCliente />;
}
