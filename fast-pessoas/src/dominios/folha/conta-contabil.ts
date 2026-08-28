// De-para rubrica → conta contábil (E3:a) — a parte PURA da regra de vigência.
// Sem IO e sem banco; datas trafegam como ISO (AAAA-MM-DD), que compara como
// data em string.
//
// O DEFEITO que este módulo conserta (revisão adversarial 2026-08): a criação
// validava só contra a vigência ATIVA. Uma vigência RETRO-DATADA passava por
// cima de janela ENCERRADA — duas contas "valendo" no mesmo dia, e quem
// decidia qual saía no arquivo era o desempate da LATERAL (inicio DESC, id
// DESC), não uma regra de negócio. A criação agora valida a interseção contra
// TODAS as vigências da rubrica, encerradas incluídas.

/** Uma vigência já existente do de-para, como está no banco. */
export interface JanelaVigenciaConta {
  id: number;
  conta_contabil: string;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

/**
 * A vigência JÁ EXISTENTE que a nova intersectaria — null quando não há
 * conflito. A nova nasce ABERTA ([inicio, ∞)), então a interseção com uma
 * janela [inicio_i, fim_i] existe exatamente quando fim_i ≥ inicio da nova.
 *
 * A vigência ATIVA fica FORA desta conta de propósito: o serviço a encerra no
 * dia anterior ao início novo (e barra, antes disto, início ≤ início dela) —
 * depois do encerramento ela não alcança mais a janela nova. Encerrada sem
 * fim não existe (CHECK no banco); pura defesa: conta como aberta → conflita.
 */
export function vigenciaContaConflitante(
  inicioNova: string,
  vigencias: JanelaVigenciaConta[]
): JanelaVigenciaConta | null {
  for (const vigencia of vigencias) {
    if (vigencia.status === "ativa") continue;
    if (
      vigencia.fim_vigencia === null ||
      vigencia.fim_vigencia >= inicioNova
    ) {
      return vigencia;
    }
  }
  return null;
}
