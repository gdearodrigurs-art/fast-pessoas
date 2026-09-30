"use client";

import { FormEvent, useEffect, useState } from "react";
import estilos from "./page.module.css";

type PersonaDemo = { email: string; titulo: string; descricao: string };

export default function PaginaEntrar() {
  const [personas, setPersonas] = useState<PersonaDemo[] | null>(null);
  const [entrandoComo, setEntrandoComo] = useState<string | null>(null);

  // Vitrine (MODO_DEMO=1): se o servidor estiver em modo demonstração, a
  // tela troca o formulário por um botão por persona fictícia.
  useEffect(() => {
    fetch("/api/identidade/entrar-demo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPersonas(d?.ligado ? d.personas : []))
      .catch(() => setPersonas([]));
  }, []);

  async function entrarComo(email: string) {
    setErro(null);
    setEntrandoComo(email);
    try {
      const resposta = await fetch("/api/identidade/entrar-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (resposta.ok) {
        window.location.assign("/");
        return;
      }
      const dados = await resposta.json().catch(() => ({}));
      setErro(dados.erro ?? "Não foi possível entrar. Tente novamente.");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    }
    setEntrandoComo(null);
  }

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
        window.location.assign(
          dados.precisa_configurar_2fa ? "/configurar-2fa" : "/"
        );
        return;
      }
      // Pedir o segundo fator NÃO é falha: a rota devolve 401 com
      // `precisa_totp` e `erro: null` só para dizer "agora o código".
      // Mostrar mensagem de erro aqui fazia parecer que a senha estava errada.
      if (dados.precisa_totp && !dados.erro) {
        setPedirTotp(true);
        setErro(null);
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

  if (personas && personas.length > 0) {
    return (
      <main className={estilos.pagina}>
        <div className={`${estilos.cartao} ${estilos.cartaoDemo}`}>
          <h1 className={estilos.titulo}>Fast Pessoas</h1>
          <p className={estilos.subtitulo}>
            Versão de demonstração, com dados 100% fictícios. Escolha com quem
            entrar: cada perfil enxerga uma parte diferente do sistema. Para
            trocar de perfil, use &quot;Sair&quot; no topo da tela.
          </p>
          {personas.map((p) => (
            <button
              key={p.email}
              type="button"
              className={estilos.persona}
              disabled={entrandoComo !== null}
              onClick={() => entrarComo(p.email)}
            >
              <strong>
                {entrandoComo === p.email ? "Entrando…" : p.titulo}
              </strong>
              <span>{p.descricao}</span>
            </button>
          ))}
          <p className={estilos.aviso}>
            Se alguma tela pedir o código do autenticador, digite qualquer
            número de 6 dígitos (ex.: 000000).
          </p>
          {erro && <p className={estilos.erro}>{erro}</p>}
        </div>
      </main>
    );
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
              // O campo nasce no meio do formulário depois do primeiro envio:
              // sem o foco, é fácil não perceber que ele apareceu.
              autoFocus
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
