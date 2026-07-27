"use client";

import { FormEvent, useState } from "react";
import estilos from "./page.module.css";

export default function PaginaEntrar() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigoTotp, setCodigoTotp] = useState("");
  const [pedirTotp, setPedirTotp] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/identidade/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          senha,
          ...(pedirTotp && codigoTotp ? { codigo_totp: codigoTotp } : {}),
        }),
      });
      const dados = await resposta.json().catch(() => ({}));

      if (resposta.ok) {
        window.location.assign("/");
        return;
      }
      if (dados.precisa_totp) {
        setPedirTotp(true);
      }
      setErro(dados.erro ?? "Não foi possível entrar. Tente novamente.");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pagina}>
      <form className={estilos.cartao} onSubmit={enviar}>
        <h1 className={estilos.titulo}>Fast Pessoas</h1>
        <p className={estilos.subtitulo}>Entre com a sua conta</p>

        <label className={estilos.rotulo} htmlFor="email">
          E-mail
        </label>
        <input
          className={estilos.campo}
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className={estilos.rotulo} htmlFor="senha">
          Senha
        </label>
        <input
          className={estilos.campo}
          id="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        {pedirTotp && (
          <>
            <label className={estilos.rotulo} htmlFor="codigo_totp">
              Código do autenticador
            </label>
            <input
              className={estilos.campo}
              id="codigo_totp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              required
              value={codigoTotp}
              onChange={(e) => setCodigoTotp(e.target.value)}
            />
            {!erro && (
              <p className={estilos.aviso}>
                Informe o código de 6 dígitos do seu aplicativo autenticador.
              </p>
            )}
          </>
        )}

        {erro && <p className={estilos.erro}>{erro}</p>}

        <button className={estilos.botao} type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
