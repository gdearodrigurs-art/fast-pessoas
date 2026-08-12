"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";

interface Par {
  colaborador_id: number;
  nome: string;
  cargo: string | null;
  estado: "rascunho" | "enviada" | null;
}
interface Candidato {
  colaborador_id: number;
  nome: string;
  cargo: string | null;
  ja_selecionado: boolean;
}
interface Gestao {
  avaliado_nome: string;
  encerrado: boolean;
  pares: Par[];
  candidatos: Candidato[];
}

const secao: CSSProperties = { maxWidth: 820, margin: "24px auto", padding: "0 16px" };
const cartao: CSSProperties = {
  border: "1px solid #e2e5ea",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
  marginBottom: 12,
};
const botao: CSSProperties = {
  padding: "8px 16px",
  border: "none",
  borderRadius: 6,
  background: "#2b6cb0",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};
const botaoNeutro: CSSProperties = { ...botao, background: "#e2e5ea", color: "#333" };
const botaoDesab: CSSProperties = { ...botao, background: "#b9c2cf", cursor: "not-allowed" };

export function GestaoPares({ cicloId }: { cicloId: number }) {
  const [dados, setDados] = useState<Gestao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/avaliacoes/${cicloId}/pares`);
        const d = await r.json().catch(() => ({}));
        if (!ativo) return;
        if (r.ok) {
          setDados(d as Gestao);
          setMarcados(new Set());
          setErro(null);
        } else {
          setErro(d.erro ?? "Não foi possível carregar os pares.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, [cicloId, versao]);

  const recarregar = () => setVersao((v) => v + 1);

  function alternar(id: number) {
    setMarcados((prev) => {
      const nova = new Set(prev);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  async function adicionar() {
    if (marcados.size === 0) return;
    setOcupado(true);
    setErro(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/avaliacoes/${cicloId}/pares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colaborador_ids: [...marcados] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg(`${marcados.size} par(es) adicionado(s).`);
        recarregar();
      } else {
        setErro(d.erro ?? "Não foi possível adicionar.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover(colaboradorId: number) {
    setOcupado(true);
    setErro(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/avaliacoes/${cicloId}/pares`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colaborador_id: colaboradorId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        recarregar();
      } else {
        setErro(d.erro ?? "Não foi possível remover.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setOcupado(false);
    }
  }

  const disponiveis = dados?.candidatos.filter((c) => !c.ja_selecionado) ?? [];

  return (
    <>
      <Cabecalho />
      <main style={secao}>
        <Link href={`/avaliacoes/${cicloId}`} style={{ fontSize: 13, color: "#2b6cb0" }}>
          ← Voltar para a avaliação
        </Link>
        <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>Pares do 360</h1>
        {dados && (
          <p style={{ color: "#666", marginTop: 0, fontSize: 14 }}>
            Colegas que avaliam <strong>{dados.avaliado_nome}</strong>. As respostas
            entram anônimas e agregadas (o avaliado vê a média, nunca quem disse o
            quê); a avaliação de par é opcional e não muda a nota do líder.
          </p>
        )}

        {erro && <div style={{ ...cartao, borderColor: "#e0a4a4", color: "#a33" }}>{erro}</div>}
        {msg && <div style={{ ...cartao, borderColor: "#bcd9bc", color: "#2e7d32" }}>{msg}</div>}
        {!dados && !erro && <p>Carregando…</p>}

        {dados && (
          <>
            <div style={cartao}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Pares selecionados ({dados.pares.length})
              </div>
              {dados.pares.length === 0 && (
                <p style={{ margin: 0, color: "#777", fontSize: 14 }}>
                  Nenhum par ainda. Escolha abaixo.
                </p>
              )}
              {dados.pares.map((p) => (
                <div
                  key={p.colaborador_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderTop: "1px solid #eef0f3",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.nome}</span>
                    {p.cargo && <span style={{ color: "#888", fontSize: 13 }}> · {p.cargo}</span>}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        color: p.estado === "enviada" ? "#2e7d32" : "#8a6d3b",
                      }}
                    >
                      {p.estado === "enviada" ? "respondeu" : "pendente"}
                    </span>
                  </div>
                  {p.estado !== "enviada" && !dados.encerrado && (
                    <button
                      style={ocupado ? botaoDesab : botaoNeutro}
                      disabled={ocupado}
                      onClick={() => remover(p.colaborador_id)}
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!dados.encerrado && (
              <div style={cartao}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  Adicionar da equipe ({disponiveis.length} disponíveis)
                </div>
                {disponiveis.length === 0 && (
                  <p style={{ margin: 0, color: "#777", fontSize: 14 }}>
                    Todos os colegas de equipe já são pares.
                  </p>
                )}
                {disponiveis.map((c) => (
                  <label
                    key={c.colaborador_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      borderTop: "1px solid #eef0f3",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcados.has(c.colaborador_id)}
                      onChange={() => alternar(c.colaborador_id)}
                    />
                    <span style={{ fontWeight: 600 }}>{c.nome}</span>
                    {c.cargo && <span style={{ color: "#888" }}>· {c.cargo}</span>}
                  </label>
                ))}
                {disponiveis.length > 0 && (
                  <button
                    style={{ ...(ocupado || marcados.size === 0 ? botaoDesab : botao), marginTop: 12 }}
                    disabled={ocupado || marcados.size === 0}
                    onClick={adicionar}
                  >
                    Adicionar {marcados.size > 0 ? `(${marcados.size})` : ""}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
