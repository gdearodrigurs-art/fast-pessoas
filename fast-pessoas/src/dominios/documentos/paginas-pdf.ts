/**
 * Contagem de páginas de um PDF SEM biblioteca — heurística sobre os bytes.
 *
 * Por que existe: a decisão B5 (docs/20) manda o visualizador rastrear a
 * ROLAGEM e só habilitar a ciência no fim do documento. Para texto e imagem a
 * rolagem é do próprio contêiner; para PDF o visualizador nativo do navegador
 * (iframe) engole a rolagem interna e não a expõe. A saída é dimensionar o
 * iframe com a ALTURA ESTIMADA do documento inteiro (páginas × altura de uma
 * página na largura atual), para a rolagem voltar a ser do contêiner — e aí o
 * rastreio funciona como no texto.
 *
 * A estimativa precisa do número de páginas. Sem pdf.js (dependência pesada
 * que o projeto não tem), conta-se pelos próprios bytes:
 *   1. objetos `/Type /Page` (não `/Pages`) — o caso comum;
 *   2. fallback: o maior `/Count N` (o nó raiz da árvore de páginas carrega o
 *      total) — cobre PDF com object streams comprimidos, onde os objetos de
 *      página não aparecem em claro;
 *   3. `null` quando nada foi encontrado — o visualizador usa um chão
 *      conservador em vez de travar a ciência.
 */
export function contarPaginasPdf(bytes: Uint8Array): number | null {
  // latin1: 1 byte = 1 char, sem perda — os tokens de dicionário são ASCII.
  const texto = new TextDecoder("latin1").decode(bytes);

  const objetosPagina = texto.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  if (objetosPagina && objetosPagina.length > 0) {
    return objetosPagina.length;
  }

  let maiorCount = 0;
  for (const casamento of texto.matchAll(/\/Count\s+(\d+)/g)) {
    const valor = Number(casamento[1]);
    if (valor > maiorCount) maiorCount = valor;
  }
  return maiorCount > 0 ? maiorCount : null;
}

/**
 * Altura estimada (px) do PDF inteiro renderizado na largura dada, para o
 * iframe caber o documento todo e a rolagem ficar no contêiner de fora.
 * A4 retrato tem razão ~1,414; a folga (1,5) cobre margens do visualizador e
 * páginas paisagem misturadas — sobrar um pouco só alonga a rolagem, faltar
 * esconderia o fim. Sem contagem, assume um chão de 10 páginas.
 */
export function alturaEstimadaPdf(
  paginas: number | null,
  larguraPx: number
): number {
  const totalPaginas = paginas ?? 10;
  return Math.ceil(totalPaginas * larguraPx * 1.5);
}
