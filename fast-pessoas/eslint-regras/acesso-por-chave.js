"use strict";

// REGRA 2 — acesso se decide por CHAVE de permissão, nunca por nome de papel.
//
// POR QUE ELA EXISTE, com os números que ela custou:
//
//   O 2FA era exigido por nome de papel. Um administrador podia então dar acesso a
//   70 fichas a um perfil que entra só com senha — a tela de perfis concedia a chave,
//   e a exigência do segundo fator continuava olhando para a lista de nomes antiga.
//   Migration 0040 e a correção em identidade/servico.ts nasceram disso.
//
//   O escopo de consulta também era por nome de papel, e uma caixa marcada levava de
//   1 para 70 colaboradores visíveis. Mesma causa, outro estrago.
//
// A raiz é sempre a mesma: nome de papel é rótulo, chave é contrato. Quando o
// administrador recompõe um perfil pela tela, a chave acompanha e o nome não.
//
// O CRITÉRIO, escrito para não acusar o que não é acesso:
//
//   ACUSA  papel === "dp"  ·  sessao.papel !== "admin"  ·  "rh" === usuario.papel
//   ACUSA  switch (sessao.papel) { case "gestor": }
//   ACUSA  ["admin", "dp"].includes(sessao.papel)
//   CALA   aba === "admin"        → nome da aba na ficha, não papel
//   CALA   nivel === "diretoria"  → nível da cadeia de aprovação, não papel
//
// Ou seja: só acusa quando o lado comparado se CHAMA papel (identificador solto ou
// propriedade `.papel`/`.papeis`). É o que separa decisão de acesso de coincidência
// de palavra — e "diretoria" e "admin" aparecem nas duas situações no código de hoje.

const PAPEIS_PADRAO = [
  "admin",
  "dp",
  "gestor",
  "rh",
  "diretoria",
  "lider_td",
  "recrutador",
];

const NOMES_QUE_CARREGAM_PAPEL = new Set(["papel", "papeis"]);

// As exceções são por ARQUIVO E FUNÇÃO, nunca por arquivo inteiro: desligar um
// arquivo de serviço inteiro devolveria o buraco que a regra fecha.
const EXCECOES_PADRAO = [
  {
    // Travas anti-lockout: aqui o nome do papel é o ASSUNTO, não o critério. As duas
    // funções impedem que o sistema fique sem administrador — `travadasDoPapel` marca
    // as chaves que o papel admin não pode perder, e `atualizarUsuario` recusa
    // desativar ou rebaixar o último admin ativo. Trocar isso por chave seria
    // circular: é a própria distribuição de chaves que elas protegem.
    arquivo: "src/dominios/usuarios/servico.ts",
    funcoes: ["travadasDoPapel", "atualizarUsuario"],
  },
  {
    // Colisão de palavra, não decisão de acesso: em rh.relacao_gestor a coluna `papel`
    // vale "gestor" ou "liderado" — é o LADO da relação de liderança. A palavra bate
    // com um dos sete papéis de acesso por acidente. Ver a linha irmã do mesmo filtro,
    // `relacao.papel === "liderado"`, que a regra nem enxerga porque "liderado" não é
    // papel de acesso.
    arquivo: "src/dominios/desligamento/servico.ts",
    funcoes: ["encerrarProcessoDesligamento"],
  },
];

/** Este nó nomeia um papel? `papel`, `sessao.papel`, `usuario?.papeis`. */
function carregaPapel(no) {
  if (!no) return false;
  if (no.type === "Identifier") return NOMES_QUE_CARREGAM_PAPEL.has(no.name);
  if (no.type === "MemberExpression" || no.type === "OptionalMemberExpression") {
    return (
      !no.computed &&
      no.property.type === "Identifier" &&
      NOMES_QUE_CARREGAM_PAPEL.has(no.property.name)
    );
  }
  if (no.type === "TSAsExpression" || no.type === "TSNonNullExpression") {
    return carregaPapel(no.expression);
  }
  return false;
}

function nomeDePapel(no, papeis) {
  return (
    no &&
    no.type === "Literal" &&
    typeof no.value === "string" &&
    papeis.has(no.value)
  );
}

/** Nome de cada função que envolve o nó, de dentro para fora. */
function funcoesQueEnvolvem(no) {
  const nomes = [];
  for (let atual = no.parent; atual; atual = atual.parent) {
    if (
      atual.type !== "FunctionDeclaration" &&
      atual.type !== "FunctionExpression" &&
      atual.type !== "ArrowFunctionExpression"
    ) {
      continue;
    }
    if (atual.id && atual.id.type === "Identifier") {
      nomes.push(atual.id.name);
      continue;
    }
    const pai = atual.parent;
    if (!pai) continue;
    if (pai.type === "VariableDeclarator" && pai.id.type === "Identifier") {
      nomes.push(pai.id.name);
    } else if (
      (pai.type === "MethodDefinition" || pai.type === "Property") &&
      !pai.computed &&
      pai.key.type === "Identifier"
    ) {
      nomes.push(pai.key.name);
    }
  }
  return nomes;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Decisão de acesso por chave de permissão, nunca por nome de papel",
    },
    schema: [
      {
        type: "object",
        properties: {
          papeis: { type: "array", items: { type: "string" } },
          excecoes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                arquivo: { type: "string" },
                funcoes: { type: "array", items: { type: "string" } },
              },
              required: ["arquivo", "funcoes"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      papelNaDecisao:
        'Acesso decidido pelo nome do papel "{{papel}}". Pergunte pela chave de permissão: o administrador recompõe perfil pela tela e a chave acompanha, o nome não. Foi por aqui que o 2FA deixou passar 70 fichas.',
    },
  },

  create(context) {
    const opcoes = context.options[0] ?? {};
    const papeis = new Set(opcoes.papeis ?? PAPEIS_PADRAO);
    const excecoes = opcoes.excecoes ?? EXCECOES_PADRAO;
    const arquivo = String(context.filename ?? "").replace(/\\/g, "/");
    const permitidasAqui = excecoes
      .filter((e) => arquivo.endsWith(e.arquivo))
      .flatMap((e) => e.funcoes);

    function liberado(no) {
      if (permitidasAqui.length === 0) return false;
      return funcoesQueEnvolvem(no).some((nome) => permitidasAqui.includes(nome));
    }

    function acusar(no, papel) {
      if (liberado(no)) return;
      context.report({ node: no, messageId: "papelNaDecisao", data: { papel } });
    }

    return {
      BinaryExpression(no) {
        if (!["===", "!==", "==", "!="].includes(no.operator)) return;
        if (carregaPapel(no.left) && nomeDePapel(no.right, papeis)) {
          acusar(no, no.right.value);
        } else if (carregaPapel(no.right) && nomeDePapel(no.left, papeis)) {
          acusar(no, no.left.value);
        }
      },

      SwitchStatement(no) {
        if (!carregaPapel(no.discriminant)) return;
        for (const caso of no.cases) {
          if (nomeDePapel(caso.test, papeis)) acusar(caso, caso.test.value);
        }
      },

      // ["admin", "dp"].includes(sessao.papel) — mesma decisão, escrita em lista.
      CallExpression(no) {
        const callee = no.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "includes" ||
          callee.object.type !== "ArrayExpression" ||
          no.arguments.length !== 1 ||
          !carregaPapel(no.arguments[0])
        ) {
          return;
        }
        const achado = callee.object.elements.find((el) => nomeDePapel(el, papeis));
        if (achado) acusar(no, achado.value);
      },
    };
  },
};
