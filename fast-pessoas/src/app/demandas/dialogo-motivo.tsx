"use client";

import { FormEvent, useState } from "react";
import comum from "./comum.module.css";

export function DialogoMotivo({
  aberto,
  titulo,
  subtitulo,
  rotuloCampo,
  rotuloBotao,
  enviando,
  erro,
  aoCancelar,
  aoConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  subtitulo: string;
  rotuloCampo: string;
  rotuloBotao: string;
  enviando: boolean;
  erro: string | null;
  aoCancelar: () => void;
  aoConfirmar: (texto: string) => void;
}) {
  // O componente é remontado a cada abertura (key no chamador) — o estado
  // inicial vazio já cobre o "limpar ao abrir".
  const [texto, setTexto] = useState("");

  if (!aberto) return null;

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (texto.trim()) aoConfirmar(texto.trim());
  }

  return (
    <div className={comum.fundoDialogo}>
      <div className={comum.dialogo} role="dialog" aria-modal="true">
        <h3>{titulo}</h3>
        <p className={comum.subDialogo}>{subtitulo}</p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="motivo-demanda">
            {rotuloCampo}
          </label>
          <textarea
            className={`${comum.campo} ${comum.campoTexto}`}
            id="motivo-demanda"
            required
            maxLength={4000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {erro && <p className={comum.erroAcao}>{erro}</p>}
          <div className={comum.acoesDialogo}>
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={aoCancelar}
            >
              Cancelar
            </button>
            <button
              className={comum.botaoPrimario}
              type="submit"
              disabled={enviando}
            >
              {enviando ? "Enviando…" : rotuloBotao}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
