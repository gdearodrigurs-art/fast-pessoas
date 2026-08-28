"use client";

import { CSSProperties, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import { NOTA_MAXIMA } from "@/dominios/avaliacao/esquemas";

// ------------------------------------------------------------------ tipos do payload

interface Resumo {
  ciclo_id: number;
  avaliado_nome: string;
  tipo: string;
  status: string;
  prazo: string;
  dias_para_prazo: number;
  modelo_nome: string;
  estado: "rascunho" | "enviada" | null;
}
interface Indicador {
  id: number;
  nome: string;
  descricao: string;
  peso: number;
}
interface Pilar {
  id: number;
  nome: string;
  peso: number;
  indicadores: Indicador[];
}
interface Estrutura {
  versao: number;
  nome: string;
  pilares: Pilar[];
}
interface RespostaGravada {
  indicador_id: number;
  nota: number | null;
  nao_observado: boolean;
}
interface ParDetalhe {
  ciclo_id: number;
  avaliado_nome: string;
  modelo_versao: number;
  modelo_nome: string;
  prazo: string;
  estado: "rascunho" | "enviada" | null;
}
interface Detalhe {
  par: ParDetalhe;
  estrutura: Estrutura | null;
  respostas: RespostaGravada[] | null;
  pode_responder: boolean;
}

type Selecao = { nota: number | null; nao_observado: boolean };

const NOTAS = Array.from({ length: NOTA_MAXIMA }, (_, i) => i + 1);

// ------------------------------------------------------------------ estilos (inline)

const secao: CSSProperties = { maxWidth: 920, margin: "24px auto", padding: "0 16px" };
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

function rotuloEstado(estado: "rascunho" | "enviada" | null): string {
  if (estado === "enviada") return "Enviada";
  if (estado === "rascunho") return "Em rascunho";
  return "Não iniciada";
}

// ------------------------------------------------------------------ painel

export function PainelAvaliacaoPar() {
  const [lista, setLista] = useState<Resumo[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [abertoId, setAbertoId] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/avaliacoes-par");
        const d = await r.json().catch(() => ({}));
        if (!ativo) return;
        if (r.ok) {
          setLista(d.avaliacoes as Resumo[]);
          setErro(null);
        } else {
          setErro(d.erro ?? "Não foi possível carregar suas avaliações de par.");
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

  const recarregar = () => setVersao((v) => v + 1);

  return (
    <>
      <Cabecalho />
      <main style={secao}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Avaliações de par (360)</h1>
        <p style={{ color: "#666", marginTop: 0, fontSize: 14 }}>
          Um gestor pediu a sua visão sobre um colega. A sua resposta entra{" "}
          <strong>anônima e agregada</strong> — o colega vê a média do grupo, nunca
          quem disse o quê. Responda com franqueza.
        </p>

        {erro && (
          <div style={{ ...cartao, borderColor: "#e0a4a4", color: "#a33" }}>{erro}</div>
        )}
        {carregando && <p>Carregando…</p>}

        {abertoId !== null && (
          <Detalhe
            key={abertoId}
            cicloId={abertoId}
            aoVoltar={() => setAbertoId(null)}
            aoEnviar={() => {
              setAbertoId(null);
              recarregar();
            }}
          />
        )}

        {lista !== null && abertoId === null && (
          <>
            {lista.length === 0 && (
              <div style={cartao}>
                <p style={{ margin: 0, color: "#555" }}>
                  Ninguém pediu a sua avaliação de par no momento.
                </p>
              </div>
            )}
            {lista.map((a) => {
              const pendente = a.estado !== "enviada";
              return (
                <div
                  key={a.ciclo_id}
                  style={{
                    ...cartao,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    borderColor: pendente ? "#c9a227" : "#e2e5ea",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Avaliar {a.avaliado_nome}</div>
                    <div style={{ fontSize: 13, color: "#666" }}>
                      {a.modelo_nome} · prazo {a.prazo} · {rotuloEstado(a.estado)}
                    </div>
                  </div>
                  <button
                    style={pendente ? botao : botaoNeutro}
                    onClick={() => setAbertoId(a.ciclo_id)}
                  >
                    {pendente ? "Responder" : "Ver"}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}

// ------------------------------------------------------------------ detalhe (formulário cego)

function Detalhe({
  cicloId,
  aoVoltar,
  aoEnviar,
}: {
  cicloId: number;
  aoVoltar: () => void;
  aoEnviar: () => void;
}) {
  const [dados, setDados] = useState<Detalhe | null>(null);
  const [sel, setSel] = useState<Record<number, Selecao>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/avaliacoes-par/${cicloId}`);
        const d = await r.json().catch(() => ({}));
        if (!ativo) return;
        if (r.ok) {
          const det = d as Detalhe;
          setDados(det);
          const inicial: Record<number, Selecao> = {};
          for (const resp of det.respostas ?? []) {
            inicial[resp.indicador_id] = {
              nota: resp.nota,
              nao_observado: resp.nao_observado,
            };
          }
          setSel(inicial);
        } else {
          setErro(d.erro ?? "Não foi possível abrir a avaliação de par.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, [cicloId]);

  if (erro && !dados) {
    return (
      <div style={cartao}>
        <p style={{ color: "#a33" }}>{erro}</p>
        <button style={botaoNeutro} onClick={aoVoltar}>
          Voltar
        </button>
      </div>
    );
  }
  if (!dados) return <p>Carregando…</p>;

  const podeResponder = dados.pode_responder;
  const indicadores =
    dados.estrutura?.pilares.flatMap((p) => p.indicadores) ?? [];
  const total = indicadores.length;
  const respondidos = indicadores.filter((i) => {
    const s = sel[i.id];
    return s && (s.nao_observado || s.nota !== null);
  }).length;

  function marcarNota(indicadorId: number, nota: number) {
    setSel((prev) => ({ ...prev, [indicadorId]: { nota, nao_observado: false } }));
  }
  function marcarNaoObservado(indicadorId: number) {
    setSel((prev) => ({
      ...prev,
      [indicadorId]: { nota: null, nao_observado: true },
    }));
  }

  function montarRespostas(): RespostaGravada[] {
    const saida: RespostaGravada[] = [];
    for (const i of indicadores) {
      const s = sel[i.id];
      if (!s) continue;
      if (s.nao_observado) {
        saida.push({ indicador_id: i.id, nota: null, nao_observado: true });
      } else if (s.nota !== null) {
        saida.push({ indicador_id: i.id, nota: s.nota, nao_observado: false });
      }
    }
    return saida;
  }

  async function salvarRascunho() {
    const respostas = montarRespostas();
    if (respostas.length === 0) {
      setErro("Responda ao menos um indicador antes de salvar.");
      return;
    }
    setOcupado(true);
    setErro(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/avaliacoes-par/${cicloId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg("Rascunho salvo.");
      } else {
        setErro(d.erro ?? "Não foi possível salvar.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setOcupado(false);
    }
  }

  async function enviar() {
    if (respondidos < total) {
      setErro(
        `Responda todos os ${total} indicadores antes de enviar (faltam ${total - respondidos}).`
      );
      return;
    }
    setOcupado(true);
    setErro(null);
    setMsg(null);
    try {
      const salvar = await fetch(`/api/avaliacoes-par/${cicloId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: montarRespostas() }),
      });
      if (!salvar.ok) {
        const d = await salvar.json().catch(() => ({}));
        setErro(d.erro ?? "Não foi possível salvar antes de enviar.");
        setOcupado(false);
        return;
      }
      const r = await fetch(`/api/avaliacoes-par/${cicloId}/enviar`, {
        method: "POST",
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        aoEnviar();
      } else {
        setErro(d.erro ?? "Não foi possível enviar.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <button style={{ ...botaoNeutro, marginBottom: 12 }} onClick={aoVoltar}>
        ← Voltar
      </button>

      <div
        style={{
          ...cartao,
          background: "#eef4fb",
          borderColor: "#b8cfe6",
          fontSize: 14,
        }}
      >
        Você avalia <strong>{dados.par.avaliado_nome}</strong>. A sua resposta é{" "}
        <strong>anônima e agregada</strong> — {dados.par.avaliado_nome.split(" ")[0]}{" "}
        vê a média do grupo de pares, nunca a sua nota isolada nem o seu nome.
      </div>

      <div style={cartao}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>
          {dados.par.modelo_nome} (v{dados.par.modelo_versao})
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
          Prazo {dados.par.prazo} · {rotuloEstado(dados.par.estado)} · {respondidos}/
          {total} respondidos
        </div>
      </div>

      {!podeResponder && (
        <div style={{ ...cartao, background: "#f2f7f2", borderColor: "#bcd9bc" }}>
          {dados.par.estado === "enviada"
            ? "Você já enviou esta avaliação de par — ela é imutável."
            : "Este ciclo não aceita mais respostas de par."}
        </div>
      )}

      {dados.estrutura?.pilares.map((pilar) => (
        <div key={pilar.id} style={cartao}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{pilar.nome}</div>
          {pilar.indicadores.map((ind) => {
            const s = sel[ind.id];
            return (
              <div
                key={ind.id}
                style={{ padding: "10px 0", borderTop: "1px solid #eef0f3" }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{ind.nome}</div>
                {ind.descricao && (
                  <div style={{ fontSize: 13, color: "#777", marginBottom: 6 }}>
                    {ind.descricao}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {NOTAS.map((n) => {
                    const ativa = s?.nao_observado !== true && s?.nota === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={!podeResponder || ocupado}
                        onClick={() => marcarNota(ind.id, n)}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          border: ativa ? "2px solid #2b6cb0" : "1px solid #cfd4dc",
                          background: ativa ? "#2b6cb0" : "#fff",
                          color: ativa ? "#fff" : "#333",
                          fontWeight: 700,
                          cursor: podeResponder ? "pointer" : "not-allowed",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                  <label
                    style={{
                      fontSize: 13,
                      color: "#555",
                      marginLeft: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      cursor: podeResponder ? "pointer" : "not-allowed",
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={!podeResponder || ocupado}
                      checked={s?.nao_observado === true}
                      onChange={() => marcarNaoObservado(ind.id)}
                    />
                    não observado
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {erro && <div style={{ ...cartao, borderColor: "#e0a4a4", color: "#a33" }}>{erro}</div>}
      {msg && <div style={{ ...cartao, borderColor: "#bcd9bc", color: "#2e7d32" }}>{msg}</div>}

      {podeResponder && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            style={ocupado ? botaoDesab : botaoNeutro}
            disabled={ocupado}
            onClick={salvarRascunho}
          >
            Salvar rascunho
          </button>
          <button
            style={ocupado || respondidos < total ? botaoDesab : botao}
            disabled={ocupado || respondidos < total}
            onClick={enviar}
          >
            Enviar avaliação de par
          </button>
        </div>
      )}
    </div>
  );
}
