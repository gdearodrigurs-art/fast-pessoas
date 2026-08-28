"use client";

import { CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import { Cabecalho } from "@/app/cabecalho";

interface Versao {
  id: number;
  nota: string | null;
  autor_nome: string;
  ativa: boolean;
  criada_em: string;
}
interface Instrucao {
  texto: string;
  do_banco: boolean;
  padrao_codigo: string;
  historico: Versao[];
}

const secao: CSSProperties = { maxWidth: 900, margin: "24px auto", padding: "0 16px" };
const cartao: CSSProperties = {
  border: "1px solid #e2e5ea",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
  marginBottom: 16,
};
const campo: CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #cbd2da",
  font: "inherit",
  boxSizing: "border-box",
};
const botao: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #1b2a31",
  background: "#1b2a31",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const botaoFraco: CSSProperties = { ...botao, background: "#fff", color: "#1b2a31" };

function formatarInstante(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function PainelInstrucao() {
  const [dados, setDados] = useState<Instrucao | null | undefined>(undefined);
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/pdi/instrucao");
        if (!r.ok) {
          const corpo = await r.json().catch(() => ({}));
          throw new Error(
            corpo.erro ?? "Você não tem acesso à instrução do PDI."
          );
        }
        const corpo = await r.json();
        if (ativo) {
          setDados(corpo.instrucao);
          setTexto(corpo.instrucao.texto);
          setErro(null);
        }
      } catch (e) {
        if (ativo) {
          setErro(e instanceof Error ? e.message : "Falha ao carregar.");
          setDados(null);
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [versao]);

  async function salvar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const corpo: { texto: string; nota?: string } = { texto };
      if (nota.trim()) corpo.nota = nota.trim();
      const r = await fetch("/api/pdi/instrucao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(c.erro ?? "Não foi possível salvar.");
      setAviso("Nova versão salva — os próximos PDIs já usam esta instrução.");
      setNota("");
      setVersao((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setOcupado(false);
    }
  }

  const mudou = dados ? texto !== dados.texto : false;

  return (
    <>
      <Cabecalho />
      <main style={secao}>
        <Link href="/pdi" style={{ fontSize: 14 }}>
          ← Voltar aos PDIs
        </Link>
        <h1 style={{ marginBottom: 4 }}>Instrução da IA (PDI)</h1>
        <p style={{ color: "#6b7280", marginTop: 0 }}>
          O &quot;playbook&quot; que a IA segue para escrever o PDI. Editar aqui
          muda como os próximos planos são gerados — sem depender de nova versão
          do sistema. A fundamentação está em{" "}
          <code>docs/19-fundamentacao-do-pdi.md</code>.
        </p>

        {erro && (
          <div
            role="alert"
            style={{
              ...cartao,
              borderColor: "#e0b4b4",
              background: "#fbeeee",
              color: "#8a2a2a",
            }}
          >
            {erro}
          </div>
        )}
        {aviso && (
          <div
            style={{
              ...cartao,
              borderColor: "#b7dcc0",
              background: "#eef7f0",
              color: "#2f5b3a",
            }}
          >
            {aviso}
          </div>
        )}

        {dados === undefined && <p>Carregando…</p>}

        {dados && (
          <>
            <section style={cartao}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  Em vigor:{" "}
                  <strong>
                    {dados.do_banco
                      ? "versão salva pelo RH"
                      : "padrão do sistema (nenhuma versão salva ainda)"}
                  </strong>
                </span>
                <button
                  type="button"
                  style={botaoFraco}
                  disabled={ocupado || texto === dados.padrao_codigo}
                  onClick={() => setTexto(dados.padrao_codigo)}
                >
                  Restaurar padrão do sistema
                </button>
              </div>

              <textarea
                style={{
                  ...campo,
                  minHeight: 420,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                spellCheck={false}
              />

              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "#6b7280",
                  margin: "12px 0 4px",
                }}
              >
                Nota da versão (opcional — por que você mudou)
              </label>
              <input
                style={campo}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={500}
                placeholder="ex.: reforcei o tom de parceria e o pedido de indicador observável"
              />

              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button
                  type="button"
                  style={botao}
                  onClick={salvar}
                  disabled={ocupado || !mudou}
                >
                  Salvar nova versão
                </button>
                {mudou && (
                  <button
                    type="button"
                    style={botaoFraco}
                    disabled={ocupado}
                    onClick={() => setTexto(dados.texto)}
                  >
                    Descartar mudanças
                  </button>
                )}
              </div>
            </section>

            <section style={cartao}>
              <strong>Histórico de versões</strong>
              {dados.historico.length === 0 ? (
                <p style={{ fontSize: 13, color: "#888", margin: "6px 0 0" }}>
                  Nenhuma versão salva — a IA usa o padrão do sistema.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                  {dados.historico.map((v) => (
                    <li
                      key={v.id}
                      style={{
                        borderTop: "1px solid #eee",
                        padding: "8px 0",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "#6b7280" }}>
                        {formatarInstante(v.criada_em)} · {v.autor_nome}
                      </span>
                      {v.ativa && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "1px 8px",
                            borderRadius: 999,
                            background: "#eef7f0",
                            color: "#2f5b3a",
                          }}
                        >
                          em vigor
                        </span>
                      )}
                      {v.nota && <div style={{ marginTop: 2 }}>{v.nota}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
