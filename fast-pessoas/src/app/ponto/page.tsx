import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelPonto } from "./painel-ponto";

export default async function PaginaPonto() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  // Flag só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada.
  const linhas = await consultar<{ administrar: boolean }>(
    "SELECT sistema.tem_permissao($1, 'ponto.administrar') AS administrar",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.administrar) {
    redirect("/");
  }
  return <PainelPonto />;
}
