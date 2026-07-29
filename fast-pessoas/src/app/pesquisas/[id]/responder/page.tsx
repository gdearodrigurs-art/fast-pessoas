import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { FormularioResposta } from "./formulario-resposta";

export default async function PaginaResponderPesquisa({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  // Flag só de NAVEGAÇÃO: a API reconfere a permissão em toda chamada.
  const linhas = await consultar<{ responder: boolean }>(
    "SELECT sistema.tem_permissao($1, 'pesquisa.responder') AS responder",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.responder) {
    redirect("/");
  }
  const { id } = await params;
  const idNumero = Number(id);
  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    redirect("/pesquisas");
  }
  return <FormularioResposta id={idNumero} />;
}
