import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { PainelNotificacoes } from "./painel-notificacoes";

// Sem checagem de permissão DE PROPÓSITO: a página só mostra as notificações
// do usuário da sessão (a API filtra por sessao.usuario_id no SQL).
export default async function PaginaNotificacoes() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  if (sessao.pendente_2fa) {
    redirect("/configurar-2fa");
  }
  return <PainelNotificacoes />;
}
