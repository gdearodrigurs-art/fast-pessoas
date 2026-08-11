/**
 * Desidentificação para envio externo (PDI via IA). O projeto NÃO mascara dado
 * sensível — ele o remove (dado "ausente, não mascarado"). Os dados estruturados
 * da avaliação (competências e notas) não identificam ninguém; o único lugar por
 * onde PII pode vazar sem querer é o CAMPO LIVRE da mini-entrevista, escrito à mão.
 *
 * Aqui: redige padrões óbvios (CPF, e-mail, telefone) e SINALIZA possíveis nomes
 * próprios para o humano confirmar antes de gerar. Puro, sem I/O, testável.
 * Só usa .match/.replace (globais) — nunca .test() com /g, que carrega lastIndex.
 */

export interface ContextoLimpo {
  /** O texto com os padrões óbvios de PII já redigidos. */
  limpo: string;
  /** Avisos para o humano (o que foi removido, o que precisa conferir). */
  avisos: string[];
}

const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RE_EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
const RE_TELEFONE = /\b\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g;
// 2+ palavras iniciadas em maiúscula em sequência (ex.: "João Silva"). Exige duas
// ou mais para não confundir com o começo de uma frase.
const RE_NOME = /\b\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)+\b/gu;

const MARCA = "[removido]";

function contem(texto: string, re: RegExp): boolean {
  return texto.match(re) !== null;
}

export function limparContextoLivre(texto: string): ContextoLimpo {
  const avisos: string[] = [];
  let limpo = texto;

  if (contem(limpo, RE_CPF)) {
    avisos.push("Um possível CPF foi removido do contexto.");
    limpo = limpo.replace(RE_CPF, MARCA);
  }
  if (contem(limpo, RE_EMAIL)) {
    avisos.push("Um possível e-mail foi removido do contexto.");
    limpo = limpo.replace(RE_EMAIL, MARCA);
  }
  if (contem(limpo, RE_TELEFONE)) {
    avisos.push("Um possível telefone foi removido do contexto.");
    limpo = limpo.replace(RE_TELEFONE, MARCA);
  }

  const nomes = limpo.match(RE_NOME);
  if (nomes && nomes.length > 0) {
    const unicos = [...new Set(nomes)];
    avisos.push(
      `Possível nome próprio no contexto (${unicos.join(", ")}). Prefira remover antes de gerar — o PDI não precisa de nomes.`
    );
  }

  return { limpo, avisos };
}

/** Guarda de última linha antes do envio: sobrou padrão ÓBVIO de PII no texto? */
export function contemPiiObvio(texto: string): boolean {
  return (
    contem(texto, RE_CPF) || contem(texto, RE_EMAIL) || contem(texto, RE_TELEFONE)
  );
}
