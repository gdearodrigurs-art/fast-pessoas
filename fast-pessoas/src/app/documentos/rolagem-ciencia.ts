/**
 * A REGRA do rastreio de rolagem do modo ciência (B5), pura e num lugar só.
 *
 * O visualizador media o contêiner em QUALQUER estado, inclusive "carregando"
 * e "erro" — estados sem overflow, em que `scrollTop + clientHeight >=
 * scrollHeight` é verdade trivial. O timer de 150ms marcava "leu até o fim"
 * antes de existir conteúdo, e a marca nunca era desfeita: o rastreio se
 * auto-derrotava. Estas funções fixam as duas metades do conserto:
 *
 *   1. só se MEDE conteúdo renderizado (`conteudoRenderizado`) — carregando,
 *      erro e não-exibível ficam de fora;
 *   2. "fim" é rolagem até o rodapé quando HÁ rolagem, ou conteúdo que coube
 *      inteiro (curto de verdade) quando não há (`chegouAoFim`).
 *
 * O componente ainda precisa RESETAR a marca ao trocar de estado/documento —
 * isso é efeito de React e mora no visualizador; a decisão em si mora aqui.
 */

export type EstadoConteudo =
  | "carregando"
  | "erro"
  | "texto"
  | "pdf"
  | "imagem"
  | "nao_exibivel";

/** Só estados com conteúdo DE FATO na tela entram no rastreio de rolagem. */
export function conteudoRenderizado(estado: EstadoConteudo): boolean {
  return estado === "texto" || estado === "pdf" || estado === "imagem";
}

export interface MedidasRolagem {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Folga que perdoa arredondamento de zoom/DPI — não uma página inteira. */
export const FOLGA_FIM_PX = 32;

/**
 * O leitor chegou ao fim do conteúdo renderizado?
 *
 * Sem overflow (`scrollHeight <= clientHeight`) o conteúdo coube inteiro na
 * janela: um comunicado de três linhas conta como lido — mas SÓ porque quem
 * chama já garantiu, via `conteudoRenderizado`, que há conteúdo de verdade.
 * Com overflow, fim é o rodapé entrar na janela, com a folga de DPI.
 */
export function chegouAoFim(medidas: MedidasRolagem): boolean {
  if (medidas.scrollHeight <= medidas.clientHeight) {
    return true;
  }
  return (
    medidas.scrollTop + medidas.clientHeight >=
    medidas.scrollHeight - FOLGA_FIM_PX
  );
}
