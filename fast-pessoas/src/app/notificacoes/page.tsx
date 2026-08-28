import { exigirSessaoDePagina } from "@/lib/sessao";
import { PainelNotificacoes } from "./painel-notificacoes";

// Sem checagem de permissão DE PROPÓSITO: a página só mostra as notificações
// do usuário da sessão (a API filtra por sessao.usuario_id no SQL).
export default async function PaginaNotificacoes() {
  await exigirSessaoDePagina();
  return <PainelNotificacoes />;
}
