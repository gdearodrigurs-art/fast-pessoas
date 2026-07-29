import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelSst } from "./painel-sst";

export default async function PaginaSst() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  // Flags só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada e é
  // ela quem decide o formato do payload (conteúdo clínico ausente sem a
  // chave). tem_entregas deixa o titular sem chave de SST ver e dar ciência
  // nas próprias entregas de EPI.
  const linhas = await consultar<{
    ver: boolean;
    gerir: boolean;
    ver_saude: boolean;
    doc_sensivel: boolean;
    tem_entregas: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'sst.ver')             AS ver,
            sistema.tem_permissao($1, 'sst.gerir')           AS gerir,
            sistema.tem_permissao($1, 'sst.saude.ver')       AS ver_saude,
            sistema.tem_permissao($1, 'documento.sensivel.ver') AS doc_sensivel,
            EXISTS (
              SELECT 1
                FROM rh.epi_entrega e
                JOIN rh.colaborador c ON c.id = e.colaborador_id
               WHERE c.usuario_id = $1
            ) AS tem_entregas`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.ver && !linhas[0]?.tem_entregas) {
    redirect("/");
  }
  return (
    <PainelSst
      podeVer={linhas[0].ver}
      podeGerir={linhas[0].gerir}
      podeVerSaude={linhas[0].ver_saude}
      podeVerDocSensivel={linhas[0].doc_sensivel}
    />
  );
}
