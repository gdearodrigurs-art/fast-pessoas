import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelDocumentos } from "./painel-documentos";

export default async function PaginaDocumentos() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{
    ver: boolean;
    enviar: boolean;
    sensivel: boolean;
    gerir_ciclo: boolean;
    liberar: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'documento.ver')          AS ver,
            sistema.tem_permissao($1, 'documento.enviar')       AS enviar,
            sistema.tem_permissao($1, 'documento.sensivel.ver') AS sensivel,
            sistema.tem_permissao($1, 'rh.conduta.gerir')       AS gerir_ciclo,
            sistema.tem_permissao($1, 'rh.conduta.liberar')     AS liberar`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.ver) {
    redirect("/");
  }
  return (
    <PainelDocumentos
      podeEnviar={linhas[0].enviar}
      podeVerSensivel={linhas[0].sensivel}
      podeGerirCiclo={linhas[0].gerir_ciclo}
      podeLiberar={linhas[0].liberar}
      usuarioId={sessao.usuario_id}
    />
  );
}
