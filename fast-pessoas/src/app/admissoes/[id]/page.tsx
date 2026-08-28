import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { DetalheAdmissao } from "./detalhe-admissao";

export default async function PaginaAdmissao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [sessao.usuario_id, "admissao.ver"]
  );
  if (!linhas[0]?.autorizado) {
    redirect("/");
  }
  const { id } = await params;
  const idNumero = Number(id);
  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    redirect("/admissoes");
  }
  return <DetalheAdmissao id={idNumero} />;
}
