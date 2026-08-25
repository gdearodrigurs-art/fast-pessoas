import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelPesquisas } from "./painel-pesquisas";

export default async function PaginaPesquisas() {
  const sessao = await exigirSessaoDePagina();
  // Flags só de NAVEGAÇÃO: a API reconfere toda chave em cada chamada e é ela
  // quem decide o formato do payload (lista administrativa e resultado ficam
  // AUSENTES para quem só responde).
  const linhas = await consultar<{
    administrar: boolean;
    responder: boolean;
    resultado: boolean;
    plano: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'pesquisa.administrar')    AS administrar,
            sistema.tem_permissao($1, 'pesquisa.responder')      AS responder,
            sistema.tem_permissao($1, 'pesquisa.resultado.ver')  AS resultado,
            sistema.tem_permissao($1, 'pesquisa.plano.gerir')    AS plano`,
    [sessao.usuario_id]
  );
  const pode = linhas[0];
  if (
    !pode ||
    (!pode.administrar && !pode.responder && !pode.resultado && !pode.plano)
  ) {
    redirect("/");
  }
  return (
    <PainelPesquisas
      podeAdministrar={pode.administrar}
      podeVerResultado={pode.resultado}
    />
  );
}
