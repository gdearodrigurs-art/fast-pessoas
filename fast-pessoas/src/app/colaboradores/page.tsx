import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelColaboradores } from "./painel-colaboradores";

export default async function PaginaColaboradores() {
  const sessao = await exigirSessaoDePagina();
  // Flags só de RENDERIZAÇÃO (botões/formulários): a autorização real é
  // reconferida pela API em toda chamada.
  const linhas = await consultar<{ pode_criar: boolean }>(
    "SELECT sistema.tem_permissao($1, 'rh.colaborador.editar') AS pode_criar",
    [sessao.usuario_id]
  );
  return <PainelColaboradores podeCriar={Boolean(linhas[0]?.pode_criar)} />;
}
