import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelPdi } from "./painel-pdi";

export default async function PaginaPdi() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    `SELECT (sistema.tem_permissao($1, 'pdi.ver')
          OR sistema.tem_permissao($1, 'pdi.gerar')
          OR sistema.tem_permissao($1, 'pdi.homologar')) AS autorizado`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelPdi />;
}
