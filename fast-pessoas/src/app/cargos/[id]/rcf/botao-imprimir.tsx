"use client";

import estilos from "./rcf.module.css";

/** Único pedaço interativo da página do RCF — o resto é documento estático. */
export function BotaoImprimir() {
  return (
    <button
      className={estilos.botao}
      type="button"
      onClick={() => window.print()}
    >
      Imprimir / salvar em PDF
    </button>
  );
}
