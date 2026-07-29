import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelRelatorios } from "./painel-relatorios";

export default async function PaginaRelatorios() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  // Gate de renderização; cada rota de /api/relatorios reconfere relatorio.ver.
  const linhas = await consultar<{ pode_ver: boolean }>(
    "SELECT sistema.tem_permissao($1, 'relatorio.ver') AS pode_ver",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.pode_ver) {
    redirect("/");
  }
  return <PainelRelatorios />;
}
