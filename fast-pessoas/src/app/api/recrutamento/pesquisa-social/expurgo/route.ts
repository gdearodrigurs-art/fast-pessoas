import { expurgarPesquisasSociais } from "@/dominios/recrutamento/servico";
import { responderErro } from "@/lib/http";
import { exigirPermissao } from "@/lib/sessao";

/** Data-calendário de hoje em São Paulo (AAAA-MM-DD) — eixo 3. */
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/**
 * EXPURGO da retenção da pesquisa social (G3:a, 6 meses) — rota administrativa
 * MANUAL (o projeto não tem agendador; o cron é follow-up registrado). Apaga o
 * anexo do GED e anonimiza o desfecho das candidaturas descartadas há mais de
 * 6 meses; auditado; devolve a contagem.
 */
export async function POST() {
  try {
    const sessao = await exigirPermissao("rs.gerir");
    const contagem = await expurgarPesquisasSociais(sessao, hojeSaoPaulo());
    return Response.json(contagem);
  } catch (erro) {
    return responderErro(erro);
  }
}
