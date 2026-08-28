import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelAfastamentos } from "./painel-afastamentos";

export default async function PaginaAfastamentos() {
  const sessao = await exigirSessaoDePagina();
  // Flags só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada e é
  // ela quem decide o formato do payload (dado de saúde ausente sem a chave).
  const linhas = await consultar<{
    ver: boolean;
    registrar: boolean;
    ver_saude: boolean;
    doc_sensivel: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'afastamento.ver')       AS ver,
            sistema.tem_permissao($1, 'afastamento.registrar') AS registrar,
            sistema.tem_permissao($1, 'afastamento.saude.ver') AS ver_saude,
            sistema.tem_permissao($1, 'documento.sensivel.ver') AS doc_sensivel`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.ver) {
    redirect("/");
  }
  return (
    <PainelAfastamentos
      podeRegistrar={linhas[0].registrar}
      podeVerSaude={linhas[0].ver_saude}
      podeVerDocSensivel={linhas[0].doc_sensivel}
    />
  );
}
