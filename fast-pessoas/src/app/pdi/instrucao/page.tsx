import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { PainelInstrucao } from "./painel-instrucao";

/**
 * Instrução da IA do PDI (Fase C) — o RH edita o "playbook" que a IA usa para
 * escrever o PDI, sem depender de deploy (eixo 9). A API reconfere a permissão
 * (pdi.homologar) a cada chamada; aqui só barramos quem nem está logado.
 */
export default async function PaginaInstrucaoPdi() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }
  return <PainelInstrucao />;
}
