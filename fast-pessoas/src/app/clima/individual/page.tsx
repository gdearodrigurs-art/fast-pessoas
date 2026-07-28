import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { IndividualCliente } from "./individual-cliente";

export default async function PaginaClimaIndividual() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "clima.resposta.individual.ver"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <IndividualCliente />;
}
