import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelBeneficios } from "./painel-beneficios";

export default async function PaginaBeneficios() {
  const sessao = await exigirSessaoDePagina();
  // Só navegação: cada API reconfere a permissão em toda chamada.
  const linhas = await consultar<{ autorizado: boolean }>(
    `SELECT (sistema.tem_permissao($1, 'adesao.solicitar')
          OR sistema.tem_permissao($1, 'adesao.gerir')
          OR sistema.tem_permissao($1, 'beneficio.administrar')
          OR sistema.tem_permissao($1, 'beneficio.ver')) AS autorizado`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelBeneficios />;
}
