import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelCliente } from "./painel-cliente";

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

export default async function PaginaPainelClima() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  if (!(await temPermissao(sessao.usuario_id, "clima.agregado.ver"))) {
    redirect("/");
  }
  const veIndividual = await temPermissao(
    sessao.usuario_id,
    "clima.resposta.individual.ver"
  );
  return <PainelCliente veIndividual={veIndividual} />;
}
