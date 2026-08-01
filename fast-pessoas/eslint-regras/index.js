/* eslint-disable @typescript-eslint/no-require-imports --
   Plugin de ESLint é CommonJS por necessidade: o eslint.config.mjs o carrega como
   módulo e a suíte o carrega compilada como CJS, e require() é o único formato que
   atende os dois. Mesma situação de db/ e provas/, que já têm bloco próprio. */
"use strict";

// Plugin local de lint — as três convenções que viviam como PROSA repetida em todo
// prompt. As três foram violadas apesar de escritas, e é por isso que elas viram
// portão: prosa não contém, portão contém.
//
// Uma regra por arquivo, cada uma com o defeito que a pagou no cabeçalho. O número
// no comentário é o que impede alguém de apagar o teste por achar que é detalhe.
//
// Como ligar: ver o bloco de eslint.config.mjs no relatório do ponto 3.

const literalEmFormulario = require("./literal-em-formulario");
const acessoPorChave = require("./acesso-por-chave");
const semParsefloat = require("./sem-parsefloat");

module.exports = {
  meta: { name: "regras-fast", version: "1.0.0" },
  rules: {
    "literal-em-formulario": literalEmFormulario,
    "acesso-por-chave": acessoPorChave,
    "sem-parsefloat": semParsefloat,
  },
};
