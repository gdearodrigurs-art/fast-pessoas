import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelCompetencia } from "./painel-competencia";

export default async function PaginaCompetencia({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  // Flag só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada.
  const linhas = await consultar<{ ver: boolean }>(
    "SELECT sistema.tem_permissao($1, 'folha.ver') AS ver",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.ver) {
    redirect("/");
  }
  const { id } = await params;
  const idNumero = Number(id);
  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    redirect("/folha");
  }
  return <PainelCompetencia id={idNumero} />;
}
