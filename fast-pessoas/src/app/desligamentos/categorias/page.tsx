import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";
import { PainelCategorias } from "./painel-categorias";

/**
 * Catálogo de categorias de item de devolução — a lista que até a 0054 era
 * CHECK de sete valores no banco. Carro, desktop e tablet não cabiam nela e
 * caíam em "outro", sumindo de qualquer relatório por tipo.
 *
 * A tela decide o que MOSTRA pela chave; a API reconfere cada escrita. Quem só
 * tem desligamento.ver entra para consultar e não vê botão de alteração.
 */
export default async function PaginaCategoriasDevolucao() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  const linhas = await consultar<{
    pode_administrar: boolean;
    pode_ver: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'desligamento.categoria.administrar')
              AS pode_administrar,
            sistema.tem_permissao($1, 'desligamento.ver') AS pode_ver`,
    [sessao.usuario_id]
  );
  const pode = linhas[0];
  if (!pode?.pode_administrar && !pode?.pode_ver) {
    redirect("/");
  }
  // `pode_ver` já era calculado e não era usado: a diretoria administra o
  // catálogo (0054) mas NÃO tem desligamento.ver (0008), então o "←
  // Desligamentos" a mandava para uma tela que a recusa e devolve à home.
  return (
    <PainelCategorias
      podeAdministrar={Boolean(pode?.pode_administrar)}
      podeVerDesligamentos={Boolean(pode?.pode_ver)}
    />
  );
}
