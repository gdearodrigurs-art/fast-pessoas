import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { PainelMeuPdi } from "./painel-meu-pdi";

/**
 * Meu PDI — o lado da PESSOA no plano de desenvolvimento: aceitar o plano
 * homologado e reportar o andamento das próprias ações. Self-service: toda
 * sessão válida entra e quem não tem PDI homologado vê o aviso. A API reconfere
 * a sessão e escopa pelo vínculo do dono a cada chamada.
 */
export default async function PaginaMeuPdi() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  return <PainelMeuPdi />;
}
