import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { GestaoPares } from "./gestao-pares";

/**
 * Gestão dos pares (360) de um ciclo — o gestor seleciona os colegas que avaliam
 * o liderado. Gate por `avaliacao.par.gerir`; a API reconfere o escopo (ser o
 * avaliador do ciclo, ou alcance amplo) a cada chamada.
 */
export default async function PaginaGestaoPares({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{ autorizado: boolean }>(
    `SELECT sistema.tem_permissao($1, 'avaliacao.par.gerir') AS autorizado`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  const { id } = await params;
  return <GestaoPares cicloId={Number(id)} />;
}
