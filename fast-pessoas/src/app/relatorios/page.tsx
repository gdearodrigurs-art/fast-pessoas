import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelRelatorios } from "./painel-relatorios";

export default async function PaginaRelatorios() {
  const sessao = await exigirSessaoDePagina();
  // Gate de renderização; cada rota de /api/relatorios reconfere relatorio.ver.
  const linhas = await consultar<{
    pode_ver: boolean;
    pode_administrar_privacidade: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'relatorio.ver')            AS pode_ver,
            sistema.tem_permissao($1, 'privacidade.administrar')  AS pode_administrar_privacidade`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.pode_ver) {
    redirect("/");
  }
  return (
    <PainelRelatorios
      podeAdministrarPrivacidade={
        linhas[0]?.pode_administrar_privacidade ?? false
      }
    />
  );
}
