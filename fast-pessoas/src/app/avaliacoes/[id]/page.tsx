import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { DetalheAvaliacao } from "./detalhe-avaliacao";

export default async function PaginaAvaliacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await exigirSessaoDePagina();
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
  const { id } = await params;
  const idNumero = Number(id);
  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    redirect("/avaliacoes");
  }
  return <DetalheAvaliacao id={idNumero} />;
}
