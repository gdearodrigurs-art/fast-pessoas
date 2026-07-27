"use client";

import estilos from "./page.module.css";

export function BotaoSair() {
  async function sair() {
    await fetch("/api/identidade/sair", { method: "POST" }).catch(() => {});
    window.location.assign("/entrar");
  }

  return (
    <button className={estilos.sair} onClick={sair} type="button">
      Sair
    </button>
  );
}
