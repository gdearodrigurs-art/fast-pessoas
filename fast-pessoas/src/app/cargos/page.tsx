import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelCargos } from "./painel-cargos";

export default async function PaginaCargos() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{
    pode_admin_cargo: boolean;
    pode_admin_estabelecimento: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'rh.cargo.administrar') AS pode_admin_cargo,
            sistema.tem_permissao($1, 'rh.estabelecimento.administrar') AS pode_admin_estabelecimento`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.pode_admin_cargo) {
    redirect("/");
  }
  return (
    <PainelCargos
      podeAdminEstabelecimento={Boolean(linhas[0]?.pode_admin_estabelecimento)}
    />
  );
}
