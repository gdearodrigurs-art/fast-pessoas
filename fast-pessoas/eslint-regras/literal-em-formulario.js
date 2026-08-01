"use strict";

// REGRA 1 — literal de negócio em campo de formulário.
//
// POR QUE ELA EXISTE: campo que nasce escolhido faz o usuário aceitar um valor que
// ele não escolheu, e o valor viaja para o POST como se fosse decisão dele. Já
// aconteceu duas vezes aqui: dias de férias e abono chegando ao POST sem ninguém
// tocar no campo, e turnover de 20% chumbado na tela. Nos dois casos o número
// estava certo para o caso comum e errado para o resto — o pior tipo de defeito,
// porque a tela não mente, ela apenas responde por quem está olhando.
//
// O CRITÉRIO, e ele é deliberadamente estreito. Regra que acusa demais é regra que
// alguém desliga, e desligada ela não vale nada. Então:
//
//   ACUSA   número em useState fora de {0, 1, -1}      → 30, 20, 0.2, 220…
//   ACUSA   qualquer literal não vazio em defaultValue → é campo de formulário por definição
//   CALA    useState("") · useState(null) · useState([]) · useState({})
//   CALA    useState(true) / useState(false)           → booleano de interface
//   CALA    useState(0) · useState(1) · useState(-1)   → ver abaixo
//   CALA    qualquer coisa que não seja literal        → veio de prop, constante ou servidor
//
// POR QUE 0, 1 e -1 SAEM: são os neutros de interface, não grandezas de negócio.
// 0 é contador e versão de recarga (25 usos hoje), 1 é escala de zoom, -1 é o
// "nenhum selecionado". Nenhum defeito do histórico usou esses três valores.
//
// POR QUE STRING EM useState FICA DE FORA POR PADRÃO: `useState("anual")` e
// `useState("todos")` têm a mesma forma na árvore sintática, e o primeiro é campo de
// formulário enquanto o segundo é aba. Medido hoje em src/app: 31 strings, sendo 17
// aba/filtro/etapa (legítimas) e 14 select de formulário (suspeitas). Ligar isso
// agora pintaria o portão de vermelho em 31 lugares no primeiro dia. Fica atrás da
// opção `stringsEmUseState: true`, para ser ligada depois que os 14 forem tratados.

const NEUTROS_PADRAO = [0, 1, -1];

/** Tira as roupas do TypeScript de cima do valor: `as const`, `satisfies`, `<T>x`. */
function despir(no) {
  let atual = no;
  while (
    atual &&
    (atual.type === "TSAsExpression" ||
      atual.type === "TSSatisfiesExpression" ||
      atual.type === "TSNonNullExpression" ||
      atual.type === "TSTypeAssertion")
  ) {
    atual = atual.expression;
  }
  return atual;
}

/**
 * Devolve o valor se — e só se — o nó for literal escrito à mão.
 * `-30` chega como unário sobre literal, por isso o segundo ramo.
 */
function literalEscritoAMao(no) {
  const alvo = despir(no);
  if (!alvo) return null;
  if (alvo.type === "Literal") {
    if (typeof alvo.value === "number") return { tipo: "numero", valor: alvo.value };
    if (typeof alvo.value === "string") return { tipo: "texto", valor: alvo.value };
    return null; // booleano, null e regex não são grandeza de negócio
  }
  if (
    alvo.type === "UnaryExpression" &&
    (alvo.operator === "-" || alvo.operator === "+") &&
    alvo.argument.type === "Literal" &&
    typeof alvo.argument.value === "number"
  ) {
    const valor = alvo.operator === "-" ? -alvo.argument.value : alvo.argument.value;
    return { tipo: "numero", valor };
  }
  // Template sem interpolação é string escrita à mão do mesmo jeito.
  if (alvo.type === "TemplateLiteral" && alvo.expressions.length === 0) {
    return { tipo: "texto", valor: alvo.quasis[0].value.cooked ?? "" };
  }
  return null;
}

function ehUseState(callee) {
  if (callee.type === "Identifier") return callee.name === "useState";
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    callee.property.name === "useState"
  );
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Campo de formulário não nasce escolhido: literal de negócio em useState e em defaultValue",
    },
    schema: [
      {
        type: "object",
        properties: {
          stringsEmUseState: { type: "boolean" },
          numerosNeutros: { type: "array", items: { type: "number" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      numeroEmUseState:
        "O campo nasce valendo {{valor}} sem ninguém escolher. Comece vazio e traga o número de um parâmetro administrável — foi assim que dias de férias e abono foram parar no POST.",
      textoEmUseState:
        'O campo nasce escolhido como "{{valor}}" sem ninguém escolher. Comece com "" e deixe o usuário decidir.',
      literalEmDefaultValue:
        "defaultValue com {{valor}} escrito à mão: o formulário envia um valor que o usuário nunca olhou. Deixe vazio ou traga de um parâmetro.",
    },
  },

  create(context) {
    const opcoes = context.options[0] ?? {};
    const pegarTexto = opcoes.stringsEmUseState === true;
    const neutros = new Set(opcoes.numerosNeutros ?? NEUTROS_PADRAO);

    return {
      CallExpression(no) {
        if (!ehUseState(no.callee) || no.arguments.length === 0) return;
        const arg = no.arguments[0];
        if (arg.type === "SpreadElement") return;
        const literal = literalEscritoAMao(arg);
        if (!literal) return;

        if (literal.tipo === "numero" && !neutros.has(literal.valor)) {
          context.report({
            node: arg,
            messageId: "numeroEmUseState",
            data: { valor: String(literal.valor) },
          });
          return;
        }
        if (literal.tipo === "texto" && literal.valor !== "" && pegarTexto) {
          context.report({
            node: arg,
            messageId: "textoEmUseState",
            data: { valor: literal.valor },
          });
        }
      },

      JSXAttribute(no) {
        if (!no.name || no.name.type !== "JSXIdentifier") return;
        if (no.name.name !== "defaultValue") return;
        if (!no.value) return;

        const bruto =
          no.value.type === "JSXExpressionContainer" ? no.value.expression : no.value;
        if (!bruto || bruto.type === "JSXEmptyExpression") return;

        const literal = literalEscritoAMao(bruto);
        if (!literal) return;
        // Vazio e zero são "sem escolha feita" — que é justamente o que a regra quer.
        if (literal.tipo === "texto" && literal.valor === "") return;
        if (literal.tipo === "numero" && neutros.has(literal.valor)) return;

        context.report({
          node: bruto,
          messageId: "literalEmDefaultValue",
          data: {
            valor: literal.tipo === "texto" ? `"${literal.valor}"` : String(literal.valor),
          },
        });
      },
    };
  },
};
