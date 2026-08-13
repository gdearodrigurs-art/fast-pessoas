"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import type { PerguntasAdmin } from "@/dominios/clima/servico";

type Editor = { id: number; modo: "editar" | "reformular"; texto: string };

function formatarDia(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function PerguntasCliente() {
  const [dados, setDados] = useState<PerguntasAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/clima/perguntas");
        const corpo = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setDados(corpo as PerguntasAdmin);
          setErro(null);
        } else {
          setErro(corpo.erro ?? "Não foi possível carregar as perguntas.");
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
  }, [versao]);

  function recarregar() {
    setEditor(null);
    setErroAcao(null);
    setVersao((v) => v + 1);
  }

  async function enviar(
    url: string,
    metodo: string,
    corpo?: unknown
  ): Promise<boolean> {
    setSalvando(true);
    setErroAcao(null);
    try {
      const resposta = await fetch(url, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const corpoResp = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAcao(corpoResp.erro ?? "Não foi possível concluir a ação.");
        return false;
      }
      return true;
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvarNova() {
    const texto = nova.trim();
    if (!texto) return;
    if (await enviar("/api/clima/perguntas", "POST", { texto })) {
      setNova("");
      recarregar();
    }
  }

  async function salvarEditor() {
    if (!editor) return;
    const texto = editor.texto.trim();
    if (!texto) return;
    const url =
      editor.modo === "editar"
        ? `/api/clima/perguntas/${editor.id}`
        : `/api/clima/perguntas/${editor.id}/reformular`;
    const metodo = editor.modo === "editar" ? "PUT" : "POST";
    if (await enviar(url, metodo, { texto })) {
      recarregar();
    }
  }

  async function aposentar(id: number, texto: string) {
    if (
      !window.confirm(`Aposentar "${texto}"? Ela deixa de aparecer no check-in.`)
    ) {
      return;
    }
    if (await enviar(`/api/clima/perguntas/${id}/aposentar`, "POST")) {
      recarregar();
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f6f4", color: "#1c1b1a" }}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/clima/painel">
          Painel de clima
        </Link>
      </Cabecalho>
      <main style={{ maxWidth: 780, margin: "32px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Perguntas do check-in</h1>
        <p style={{ color: "#6b6763", margin: "6px 0 24px" }}>
          As perguntas que aparecem no check-in diário. O enunciado pode ser
          corrigido enquanto ninguém respondeu; depois da primeira resposta o
          texto congela — mudança vira uma nova versão (reformular), para o
          histórico não apontar para um enunciado diferente do que a pessoa leu.
        </p>

        {erro && <p style={{ color: "#c62828" }}>{erro}</p>}
        {carregando && !dados && (
          <p style={{ color: "#6b6763" }}>Carregando…</p>
        )}
        {erroAcao && <p style={{ color: "#c62828" }}>{erroAcao}</p>}

        {dados && (
          <>
            <section>
              <h2 style={tituloArea}>No ar ({dados.ativas.length})</h2>
              {dados.ativas.length === 0 && (
                <p style={{ color: "#6b6763", fontStyle: "italic" }}>
                  Nenhuma pergunta ativa — o check-in está vazio.
                </p>
              )}
              {dados.ativas.map((p) => (
                <div key={p.id} style={cartao}>
                  {editor?.id === p.id ? (
                    <>
                      <textarea
                        style={campo}
                        value={editor.texto}
                        aria-label="Texto da pergunta"
                        onChange={(e) =>
                          setEditor({ ...editor, texto: e.target.value })
                        }
                      />
                      <div style={barra}>
                        <button
                          style={botaoLeve}
                          type="button"
                          onClick={() => setEditor(null)}
                          disabled={salvando}
                        >
                          Cancelar
                        </button>
                        <button
                          style={botao}
                          type="button"
                          onClick={salvarEditor}
                          disabled={salvando || editor.texto.trim() === ""}
                        >
                          {editor.modo === "editar"
                            ? "Salvar texto"
                            : "Publicar nova versão"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 16 }}>{p.texto}</div>
                      <div
                        style={{
                          color: "#6b6763",
                          fontSize: 13,
                          marginTop: 4,
                        }}
                      >
                        ordem {p.ordem} ·{" "}
                        {p.respostas === 0
                          ? "sem respostas — texto editável"
                          : `${p.respostas} resposta(s) — texto travado`}
                        {p.continua_de ? " · reformulada de uma anterior" : ""}
                      </div>
                      <div style={barra}>
                        {p.respostas === 0 && (
                          <button
                            style={botaoLeve}
                            type="button"
                            onClick={() =>
                              setEditor({
                                id: p.id,
                                modo: "editar",
                                texto: p.texto,
                              })
                            }
                          >
                            Editar texto
                          </button>
                        )}
                        <button
                          style={botaoLeve}
                          type="button"
                          onClick={() =>
                            setEditor({
                              id: p.id,
                              modo: "reformular",
                              texto: p.texto,
                            })
                          }
                        >
                          Reformular
                        </button>
                        <button
                          style={botaoRemover}
                          type="button"
                          onClick={() => aposentar(p.id, p.texto)}
                          disabled={salvando}
                        >
                          Aposentar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </section>

            <section style={{ marginTop: 12 }}>
              <h2 style={tituloArea}>Nova pergunta</h2>
              <textarea
                style={campo}
                placeholder="Texto da nova pergunta do check-in"
                value={nova}
                aria-label="Texto da nova pergunta"
                onChange={(e) => setNova(e.target.value)}
              />
              <div style={barra}>
                <button
                  style={botao}
                  type="button"
                  onClick={salvarNova}
                  disabled={salvando || nova.trim() === ""}
                >
                  Adicionar pergunta
                </button>
              </div>
            </section>

            {dados.encerradas.length > 0 && (
              <section style={{ marginTop: 12 }}>
                <h2 style={tituloArea}>Histórico ({dados.encerradas.length})</h2>
                <ul style={{ fontSize: 13.5, color: "#4b4845" }}>
                  {dados.encerradas.map((p) => (
                    <li key={p.id} style={{ marginBottom: 4 }}>
                      {p.texto} — encerrada em {formatarDia(p.fim_vigencia)}
                      {p.continua_de ? " · reformulava uma anterior" : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const tituloArea: CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#6b6763",
  margin: "24px 0 8px",
};
const cartao: CSSProperties = {
  background: "#fff",
  border: "1px solid #e3e0dc",
  borderRadius: 10,
  padding: 14,
  marginBottom: 10,
};
const campo: CSSProperties = {
  width: "100%",
  minHeight: 60,
  padding: 8,
  borderRadius: 6,
  border: "1px solid #cfcbc6",
  font: "inherit",
  boxSizing: "border-box",
};
const barra: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 10,
  flexWrap: "wrap",
};
const botao: CSSProperties = {
  background: "#1c3b6e",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  font: "inherit",
  cursor: "pointer",
};
const botaoLeve: CSSProperties = {
  background: "#fff",
  color: "#1c3b6e",
  border: "1px solid #cfcbc6",
  borderRadius: 6,
  padding: "8px 14px",
  font: "inherit",
  cursor: "pointer",
};
const botaoRemover: CSSProperties = {
  background: "#fff",
  color: "#c62828",
  border: "1px solid #e3e0dc",
  borderRadius: 6,
  padding: "8px 14px",
  font: "inherit",
  cursor: "pointer",
};
