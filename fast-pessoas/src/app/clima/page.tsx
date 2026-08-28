import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { CheckinCliente } from "./checkin-cliente";

async function temPermissao(
  usuarioId: number,
  chave: string
): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, chave]
  );
  return Boolean(linhas[0]?.autorizado);
}

export default async function PaginaClima() {
  const sessao = await exigirSessaoDePagina();
  if (!(await temPermissao(sessao.usuario_id, "clima.responder"))) {
    redirect("/");
  }
  const [vePainel, veIndividual] = await Promise.all([
    temPermissao(sessao.usuario_id, "clima.agregado.ver"),
    temPermissao(sessao.usuario_id, "clima.resposta.individual.ver"),
  ]);
  return <CheckinCliente vePainel={vePainel} veIndividual={veIndividual} />;
}
