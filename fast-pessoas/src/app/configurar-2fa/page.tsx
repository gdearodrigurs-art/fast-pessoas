"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import estilos from "./page.module.css";

interface Situacao {
  configurado: boolean;
  obrigatorio: boolean;
}

interface Inicio {
  otpauth_uri: string;
  secret: string;
  qr_data_url: string;
}

type Etapa = "carregando" | "inativo" | "pendente" | "ativo";

export default function PaginaConfigurar2fa() {
  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [obrigatorio, setObrigatorio] = useState(false);
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [codigoDesativar, setCodigoDesativar] = useState("");
  const [mostrarDesativar, setMostrarDesativar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/identidade/2fa/situacao");
        if (resposta.status === 401) {
          window.location.assign("/entrar");
          return;
        }
        const dados: Situacao = await resposta.json();
        if (!ativo) return;
        setObrigatorio(dados.obrigatorio);
        setEtapa(dados.configurado ? "ativo" : "inativo");
      } catch {
        if (!ativo) return;
        setErro("Não foi possível carregar a situação do 2FA.");
        setEtapa("inativo");
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function iniciar() {
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/identidade/2fa/iniciar", {
        method: "POST",
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível iniciar a configuração.");
        return;
      }
      setInicio(dados as Inicio);
      setCodigo("");
      setEtapa("pendente");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/identidade/2fa/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível confirmar o código.");
        return;
      }
      setInicio(null);
      setCodigo("");
      setSucesso("Autenticação em duas etapas ativada com sucesso.");
      setEtapa("ativo");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function desativar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/identidade/2fa/desativar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha, codigo: codigoDesativar }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.erro ?? "Não foi possível desativar o 2FA.");
        return;
      }
      setSenha("");
      setCodigoDesativar("");
      setMostrarDesativar(false);
      setSucesso("Autenticação em duas etapas desativada.");
      setEtapa("inativo");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pagina}>
      <section className={estilos.cartao}>
        <h1 className={estilos.titulo}>Autenticação em duas etapas</h1>
        <p className={estilos.subtitulo}>
          Proteja a sua conta com códigos de um aplicativo autenticador
          (Google Authenticator, Microsoft Authenticator, Aegis…).
        </p>

        {etapa === "carregando" && <p className={estilos.aviso}>Carregando…</p>}

        {etapa !== "carregando" && obrigatorio && etapa !== "ativo" && (
          <p className={estilos.avisoObrigatorio}>
            O seu perfil de acesso tem ao menos uma permissão que exige
            autenticação em duas etapas — dado sensível de pessoa, alcance de
            empresa inteira ou administração do sistema. O acesso será liberado
            assim que você concluir esta configuração.
          </p>
        )}

        {etapa === "inativo" && (
          <>
            {sucesso && <p className={estilos.sucesso}>{sucesso}</p>}
            {erro && <p className={estilos.erro}>{erro}</p>}
            <button
              className={estilos.botao}
              type="button"
              onClick={iniciar}
              disabled={enviando}
            >
              {enviando ? "Gerando…" : "Começar configuração"}
            </button>
          </>
        )}

        {etapa === "pendente" && inicio && (
          <form onSubmit={confirmar}>
            <div className={estilos.blocoQr}>
              {/* QR gerado no servidor como data URL — sem requisição externa */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={estilos.imagemQr}
                src={inicio.qr_data_url}
                alt="QR Code para configurar o aplicativo autenticador"
              />
              <p className={estilos.aviso}>
                Não consegue ler o QR Code? Digite este código no aplicativo:
              </p>
              <code className={estilos.segredoManual}>{inicio.secret}</code>
            </div>

            <label className={estilos.rotulo} htmlFor="codigo">
              Código de confirmação (6 dígitos)
            </label>
            <input
              className={estilos.campoCodigo}
              id="codigo"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            />

            {erro && <p className={estilos.erro}>{erro}</p>}

            <button className={estilos.botao} type="submit" disabled={enviando}>
              {enviando ? "Confirmando…" : "Confirmar e ativar"}
            </button>
          </form>
        )}

        {etapa === "ativo" && (
          <>
            <span className={estilos.selo}>2FA ativada</span>
            {sucesso && <p className={estilos.sucesso}>{sucesso}</p>}

            {!mostrarDesativar && (
              <>
                <Link className={estilos.ligacao} href="/">
                  Ir para o início
                </Link>
                <hr className={estilos.divisor} />
                {obrigatorio ? (
                  <p className={estilos.aviso}>
                    O seu perfil de acesso exige autenticação em duas etapas —
                    ela não pode ser desativada.
                  </p>
                ) : (
                  <button
                    className={estilos.botaoSecundario}
                    type="button"
                    onClick={() => {
                      setErro(null);
                      setSucesso(null);
                      setMostrarDesativar(true);
                    }}
                  >
                    Desativar autenticação em duas etapas
                  </button>
                )}
              </>
            )}

            {mostrarDesativar && (
              <form onSubmit={desativar}>
                <p className={estilos.aviso}>
                  Para desativar, confirme a sua senha e um código atual do
                  aplicativo autenticador.
                </p>

                <label className={estilos.rotulo} htmlFor="senha">
                  Senha atual
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

                <label className={estilos.rotulo} htmlFor="codigo_desativar">
                  Código do autenticador
                </label>
                <input
                  className={estilos.campoCodigo}
                  id="codigo_desativar"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  required
                  value={codigoDesativar}
                  onChange={(e) =>
                    setCodigoDesativar(e.target.value.replace(/\D/g, ""))
                  }
                />

                {erro && <p className={estilos.erro}>{erro}</p>}

                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={enviando}
                >
                  {enviando ? "Desativando…" : "Desativar 2FA"}
                </button>
                <button
                  className={estilos.botaoSecundario}
                  type="button"
                  disabled={enviando}
                  onClick={() => {
                    setErro(null);
                    setMostrarDesativar(false);
                  }}
                >
                  Cancelar
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
