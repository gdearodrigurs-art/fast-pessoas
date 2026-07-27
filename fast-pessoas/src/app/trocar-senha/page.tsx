"use client";

import { FormEvent, useState } from "react";
import estilos from "../entrar/page.module.css";

export default function PaginaTrocarSenha() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    if (senhaNova !== confirmacao) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }
    setEnviando(true);
    try {
      const resposta = await fetch("/api/identidade/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setSucesso(true);
        setTimeout(() => window.location.assign("/"), 1500);
        return;
      }
      setErro(dados.erro ?? "Não foi possível trocar a senha.");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pagina}>
      <form className={estilos.cartao} onSubmit={enviar}>
        <h1 className={estilos.titulo}>Trocar senha</h1>
        <p className={estilos.subtitulo}>Mínimo de 12 caracteres</p>

        <label className={estilos.rotulo} htmlFor="senha_atual">
          Senha atual
        </label>
        <input
          className={estilos.campo}
          id="senha_atual"
          type="password"
          autoComplete="current-password"
          required
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
        />

        <label className={estilos.rotulo} htmlFor="senha_nova">
          Nova senha
        </label>
        <input
          className={estilos.campo}
          id="senha_nova"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={senhaNova}
          onChange={(e) => setSenhaNova(e.target.value)}
        />

        <label className={estilos.rotulo} htmlFor="confirmacao">
          Confirmar nova senha
        </label>
        <input
          className={estilos.campo}
          id="confirmacao"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />

        {erro && <p className={estilos.erro}>{erro}</p>}
        {sucesso && (
          <p className={estilos.aviso}>Senha trocada. Redirecionando…</p>
        )}

        <button className={estilos.botao} type="submit" disabled={enviando}>
          {enviando ? "Trocando…" : "Trocar senha"}
        </button>
      </form>
    </main>
  );
}
