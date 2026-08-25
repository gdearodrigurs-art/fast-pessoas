import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelFerias } from "./painel-ferias";

export default async function PaginaFerias() {
  const sessao = await exigirSessaoDePagina();
  // Flags só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada.
  const linhas = await consultar<{
    programar: boolean;
    administrar: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'ferias.programar')   AS programar,
            sistema.tem_permissao($1, 'ferias.administrar') AS administrar`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.programar) {
    redirect("/");
  }
  return <PainelFerias podeAdministrar={linhas[0].administrar} />;
}
