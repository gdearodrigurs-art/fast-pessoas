import { exigirSessaoDePagina } from "@/lib/sessao";
import { PortalColaborador } from "./portal-colaborador";

/**
 * Portal do colaborador — a visão única de quem só quer resolver a própria
 * vida (pedido da analista de RH: docs/08-analise-feedback-analista-rh.md,
 * seção 6). Não há flag de navegação para calcular: TODA sessão autenticada
 * tem direito ao próprio portal, e a API reconfere a sessão em cada chamada e
 * decide bloco por bloco pela chave do domínio dono.
 */
export default async function PaginaPortalColaborador() {
  await exigirSessaoDePagina();
  return <PortalColaborador />;
}
