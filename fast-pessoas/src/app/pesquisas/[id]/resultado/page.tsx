import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelResultado } from "./painel-resultado";

export default async function PaginaResultadoPesquisa({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await exigirSessaoDePagina();
  // Flags só de NAVEGAÇÃO: a API reconfere as chaves em toda chamada e é ela
  // que aplica o k-anonimato antes de o número sair do servidor.
  const linhas = await consultar<{ resultado: boolean; plano: boolean }>(
    `SELECT sistema.tem_permissao($1, 'pesquisa.resultado.ver') AS resultado,
            sistema.tem_permissao($1, 'pesquisa.plano.gerir')   AS plano`,
    [sessao.usuario_id]
  );
  if (!linhas[0]?.resultado) {
    redirect("/");
  }
  const { id } = await params;
  const idNumero = Number(id);
  if (!Number.isInteger(idNumero) || idNumero <= 0) {
    redirect("/pesquisas");
  }
  return <PainelResultado id={idNumero} podeGerirPlano={linhas[0].plano} />;
}
