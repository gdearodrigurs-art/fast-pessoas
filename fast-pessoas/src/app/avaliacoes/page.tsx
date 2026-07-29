import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelAvaliacoes } from "./painel-avaliacoes";

export default async function PaginaAvaliacoes() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    `SELECT (sistema.tem_permissao($1, 'avaliacao.responder')
          OR sistema.tem_permissao($1, 'avaliacao.configurar')
          OR sistema.tem_permissao($1, 'avaliacao.decidir')
          OR sistema.tem_permissao($1, 'avaliacao.resultado.ver')) AS autorizado`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  return <PainelAvaliacoes />;
}
