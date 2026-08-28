import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelGestor } from "./painel-gestor";

/**
 * Portal do gestor: uma tela com o que o líder precisa ver da equipe, cada
 * bloco apontando para a tela do módulo que resolve. Gate de RENDERIZAÇÃO
 * apenas — /api/portais/gestor reconfere a permissão e o alcance em toda
 * chamada, e cada bloco só vem no payload se a chave do módulo autorizar.
 */
export default async function PaginaPortalGestor() {
  const sessao = await exigirSessaoDePagina();
  const linhas = await consultar<{ pode_ver: boolean }>(
    "SELECT sistema.tem_permissao($1, 'rh.colaborador.ver') AS pode_ver",
    [sessao.usuario_id]
  );
  if (!linhas[0]?.pode_ver) {
    redirect("/");
  }
  return <PainelGestor />;
}
