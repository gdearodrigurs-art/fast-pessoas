"use strict";

// REGRA 3 — parseFloat não entra no domínio nem no semeador.
//
// Preventiva, e por isso custa nada: medido no PowerShell em 01/08/2026, o projeto
// tem ZERO ocorrências em src/dominios e em db/. A regra existe para que continue
// zero, porque o custo de descobrir depois já foi pago uma vez — o corretor da folha
// registrou que somar float de hora devolvia 346.90999999999997. Ele percebeu; o
// próximo pode não perceber.
//
// A convenção que ela protege: dinheiro em CENTAVO inteiro, hora em MINUTO inteiro.
// parseFloat é a porta de entrada do float em código que só devia ver inteiro —
// converte "1,5" em 1 sem reclamar e "3.7" em 3.7 quando o certo era 370 centavos.
// Quem precisa de inteiro usa Number.parseInt ou Math.round sobre inteiro.
//
// O QUE ELA NÃO É: a regra das divisões `/ 60` e `/ 100`. São 29 ocorrências
// legítimas hoje e marcá-las uma a uma ficou em aberto de propósito no ponto 3 do
// arnês. Não confunda as duas: esta aqui é de custo zero, aquela tem trabalho junto.

function ehParseFloat(callee) {
  if (callee.type === "Identifier") return callee.name === "parseFloat";
  // Number.parseFloat, globalThis.parseFloat, window.parseFloat.
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    callee.property.name === "parseFloat"
  );
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "parseFloat proibido no domínio e no semeador: dinheiro é centavo inteiro, hora é minuto inteiro",
    },
    schema: [],
    messages: {
      semParseFloat:
        "parseFloat traz float para onde só entra inteiro — dinheiro é centavo, hora é minuto. Somar float de hora já devolveu 346.90999999999997 aqui. Use Number.parseInt, ou converta para centavo/minuto antes.",
    },
  },

  create(context) {
    return {
      CallExpression(no) {
        if (ehParseFloat(no.callee)) {
          context.report({ node: no.callee, messageId: "semParseFloat" });
        }
      },
      // Pega o desvio óbvio de guardar a função e chamar por outro nome:
      // `const converter = parseFloat; converter("1.5")`.
      Identifier(no) {
        if (no.name !== "parseFloat") return;
        const pai = no.parent;
        if (!pai) return;
        // O uso dentro da chamada já foi acusado acima; propriedade e declaração de
        // nome não são uso da função.
        if (pai.type === "CallExpression" && pai.callee === no) return;
        if (pai.type === "MemberExpression" && pai.property === no) return;
        if (pai.type === "Property" && pai.key === no && !pai.computed) return;
        if (
          (pai.type === "VariableDeclarator" || pai.type === "FunctionDeclaration") &&
          pai.id === no
        ) {
          return;
        }
        context.report({ node: no, messageId: "semParseFloat" });
      },
    };
  },
};
