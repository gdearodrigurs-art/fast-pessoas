"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import { PAPEIS, Papel } from "@/dominios/identidade/esquemas";
import { ROTULOS_PAPEL } from "@/dominios/usuarios/esquemas";
import estilos from "./page.module.css";

interface Usuario {
  id: number;
  email: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

export function PainelUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("funcionario");
  const [criando, setCriando] = useState(false);
  const [erroCriacao, setErroCriacao] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{
    email: string;
    senha: string;
  } | null>(null);
  const [alterando, setAlterando] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/usuarios");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setUsuarios(dados.usuarios ?? []);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar os usuários.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroCriacao(null);
    setSenhaGerada(null);
    setCriando(true);
    try {
      const resposta = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nome, papel }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setUsuarios((lista) =>
          [...lista, dados.usuario as Usuario].sort((a, b) =>
            a.nome.localeCompare(b.nome)
          )
        );
        setSenhaGerada({
          email: dados.usuario.email,
          senha: dados.senha_temporaria,
        });
        setEmail("");
        setNome("");
        setPapel("funcionario");
      } else {
        setErroCriacao(dados.erro ?? "Não foi possível criar o usuário.");
      }
    } catch {
      setErroCriacao("Falha de conexão. Tente novamente.");
    } finally {
      setCriando(false);
    }
  }

  async function alternarAtivo(usuario: Usuario) {
    setErro(null);
    setAlterando(usuario.id);
    try {
      const resposta = await fetch(`/api/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !usuario.ativo }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setUsuarios((lista) =>
          lista.map((item) =>
            item.id === usuario.id ? (dados.usuario as Usuario) : item
          )
        );
      } else {
        setErro(dados.erro ?? "Não foi possível atualizar o usuário.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setAlterando(null);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Usuários</h1>
        <p className={estilos.subtitulo}>
          Administração de contas de acesso ao Fast Pessoas.
        </p>

        <section className={estilos.cartao}>
          <h2>Novo usuário</h2>
          <form className={estilos.formulario} onSubmit={criar}>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="nome">
                Nome
              </label>
              <input
                className={estilos.campo}
                id="nome"
                type="text"
                required
                maxLength={200}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="email">
                E-mail
              </label>
              <input
                className={estilos.campo}
                id="email"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className={estilos.campoGrupo}>
              <label className={estilos.rotulo} htmlFor="papel">
                Papel
              </label>
              <select
                className={estilos.campo}
                id="papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
              >
                {PAPEIS.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {ROTULOS_PAPEL[opcao]}
                  </option>
                ))}
              </select>
            </div>
            <button className={estilos.botao} type="submit" disabled={criando}>
              {criando ? "Criando…" : "Criar usuário"}
            </button>
          </form>
          {erroCriacao && <p className={estilos.erro}>{erroCriacao}</p>}
          {senhaGerada && (
            <div className={estilos.avisoSenha}>
              <p>
                Senha temporária de <strong>{senhaGerada.email}</strong>:
              </p>
              <code className={estilos.senha}>{senhaGerada.senha}</code>
              <p>
                Copie agora e repasse à pessoa — esta senha não será exibida
                novamente. Ela deve trocá-la em &quot;Trocar senha&quot; no
                primeiro acesso.
              </p>
            </div>
          )}
        </section>

        <section className={estilos.cartao}>
          <h2>Contas cadastradas</h2>
          {erro && <p className={estilos.erro}>{erro}</p>}
          {carregando ? (
            <p className={estilos.subtitulo}>Carregando…</p>
          ) : (
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id}>
                      <td>{usuario.nome}</td>
                      <td>{usuario.email}</td>
                      <td>{ROTULOS_PAPEL[usuario.papel] ?? usuario.papel}</td>
                      <td>
                        <span
                          className={
                            usuario.ativo
                              ? estilos.etiquetaAtivo
                              : estilos.etiquetaInativo
                          }
                        >
                          {usuario.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>
                        <button
                          className={estilos.botaoLinha}
                          type="button"
                          disabled={alterando === usuario.id}
                          onClick={() => alternarAtivo(usuario)}
                        >
                          {usuario.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {usuarios.length === 0 && (
                    <tr>
                      <td colSpan={5}>Nenhum usuário cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
