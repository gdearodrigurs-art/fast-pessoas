import { redirect } from "next/navigation";
import { consultar } from "@/lib/banco";
import { lerSessao } from "@/lib/sessao";

/**
 * Atalho do card "Ponto e banco de horas" da home (seção "Meu dia"): resolve o
 * colaborador da SESSÃO e manda para o próprio espelho.
 *
 * Por que uma página só de redirecionamento: `/ponto/espelho/[colaboradorId]`
 * precisa de um id na URL, e a home não tem por que carregar esse id para
 * montar um href. A rota também é a defesa contra IDOR pela porta da frente —
 * ela NÃO lê nada da requisição: o colaborador é sempre o da sessão.
 * O alcance real continua sendo conferido na API do espelho, a cada chamada.
 */
export default async function PaginaMeuPonto() {
  const sessao = await lerSessao();
  if (!sessao) {
    redirect("/entrar");
  }

  // Última competência com apuração do PRÓPRIO colaborador — é o mês que tem o
  // que mostrar. Sem apuração ainda, o espelho abre no mês corrente sozinho.
  const linhas = await consultar<{
    colaborador_id: string | null;
    ano: number | null;
    mes: number | null;
  }>(
    `SELECT c.id AS colaborador_id, a.ano, a.mes
       FROM rh.colaborador c
       LEFT JOIN LATERAL (
         SELECT ap.ano, ap.mes
           FROM rh.apuracao_ponto ap
          WHERE ap.colaborador_id = c.id
          ORDER BY ap.ano DESC, ap.mes DESC
          LIMIT 1
       ) a ON TRUE
      WHERE c.id = rh.vinculo_atual($1)`,
    [sessao.usuario_id]
  );

  const proprio = linhas[0];
  if (!proprio?.colaborador_id) {
    // Usuário sem vínculo com o quadro (conta de sistema): não há espelho.
    redirect("/portal-colaborador");
  }

  const competencia =
    proprio.ano !== null && proprio.mes !== null
      ? `?ano=${proprio.ano}&mes=${proprio.mes}`
      : "";
  redirect(`/ponto/espelho/${Number(proprio.colaborador_id)}${competencia}`);
}
