"use client";

import { CSSProperties, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";

// ------------------------------------------------------------------ tipos do payload
interface RegistroAndamento {
  id: number;
  texto: string;
  status_novo: string | null;
  autor_nome: string;
  criado_em: string;
}
interface AcaoComAndamento {
  id: number;
  descricao: string;
  prazo: string;
  status: string;
  dias_ate_prazo: number;
  andamento: RegistroAndamento[];
}
interface MeuPdi {
  id: number;
  resumo: string;
  homologado_em: string;
  aceito_em: string | null;
  acoes: AcaoComAndamento[];
}

const ROTULO_STATUS: Record<string, string> = {
  aberta: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const COR_STATUS: Record<string, string> = {
  aberta: "#6b7280",
  em_andamento: "#b45309",
  concluida: "#3f7a4b",
  cancelada: "#9ca3af",
};
/** Os três estados que o colaborador pode marcar (cancelar é do gestor/RH). */
const ESTADOS = ["aberta", "em_andamento", "concluida"] as const;

function formatarDia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}
function formatarInstante(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// ------------------------------------------------------------------ estilos (inline, autocontido)
const secao: CSSProperties = { maxWidth: 860, margin: "24px auto", padding: "0 16px" };
const cartao: CSSProperties = {
  border: "1px solid #e2e5ea",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
  marginBottom: 16,
};
const rotulo: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "#6b7280",
};
const botao: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #1b2a31",
  background: "#1b2a31",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const botaoFraco: CSSProperties = {
  ...botao,
  background: "#fff",
  color: "#1b2a31",
};
const campo: CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #cbd2da",
  font: "inherit",
  boxSizing: "border-box",
};

function Pill({ status }: { status: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: "2px 10px",
        borderRadius: 999,
        color: "#fff",
        background: COR_STATUS[status] ?? "#6b7280",
      }}
    >
      {ROTULO_STATUS[status] ?? status}
    </span>
  );
}

export function PainelMeuPdi() {
  const [pdi, setPdi] = useState<MeuPdi | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rascunhos, setRascunhos] = useState<
    Record<number, { texto: string; status: string }>
  >({});

  const [versao, setVersao] = useState(0);
  const recarregar = () => setVersao((v) => v + 1);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/portais/colaborador/pdi");
        if (!r.ok) {
          const corpo = await r.json().catch(() => ({}));
          throw new Error(corpo.erro ?? "Não foi possível carregar o seu PDI.");
        }
        const dados = await r.json();
        if (ativo) {
          setPdi(dados);
          setErro(null);
        }
      } catch (e) {
        if (ativo) {
          setErro(e instanceof Error ? e.message : "Falha ao carregar.");
          setPdi(null);
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [versao]);

  async function aceitar() {
    if (!pdi) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/portais/colaborador/pdi/${pdi.id}/aceite`, {
        method: "POST",
      });
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        throw new Error(corpo.erro ?? "Não foi possível registrar o aceite.");
      }
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao aceitar.");
    } finally {
      setOcupado(false);
    }
  }

  async function registrar(acaoId: number) {
    const rascunho = rascunhos[acaoId];
    if (!rascunho || rascunho.texto.trim() === "") {
      setErro("Escreva o que avançou antes de registrar.");
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const corpo: { texto: string; status_novo?: string } = {
        texto: rascunho.texto.trim(),
      };
      if (rascunho.status) corpo.status_novo = rascunho.status;
      const r = await fetch(
        `/api/portais/colaborador/pdi/acoes/${acaoId}/andamento`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }
      );
      if (!r.ok) {
        const c = await r.json().catch(() => ({}));
        throw new Error(c.erro ?? "Não foi possível registrar o andamento.");
      }
      setRascunhos((r0) => ({ ...r0, [acaoId]: { texto: "", status: "" } }));
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      setOcupado(false);
    }
  }

  function setRascunho(acaoId: number, campoAlvo: "texto" | "status", valor: string) {
    setRascunhos((r0) => ({
      ...r0,
      [acaoId]: {
        texto: r0[acaoId]?.texto ?? "",
        status: r0[acaoId]?.status ?? "",
        [campoAlvo]: valor,
      },
    }));
  }

  return (
    <>
      <Cabecalho />
      <main style={secao}>
        <h1 style={{ marginBottom: 4 }}>Meu PDI</h1>
        <p style={{ color: "#6b7280", marginTop: 0 }}>
          Seu plano de desenvolvimento: aceite o que foi combinado e vá
          registrando como cada passo evolui.
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

        {pdi === undefined && <p>Carregando…</p>}

        {pdi === null && (
          <div style={cartao}>
            <p style={{ margin: 0 }}>
              Você ainda não tem um PDI homologado. Quando o RH homologar o seu
              plano de desenvolvimento, ele aparece aqui para você aceitar e
              acompanhar.
            </p>
          </div>
        )}

        {pdi && (
          <>
            {/* ------------------------------------------------ o plano + aceite */}
            <section style={cartao}>
              <div style={rotulo}>
                Plano homologado em {formatarDia(pdi.homologado_em)}
              </div>
              {pdi.resumo && (
                <p style={{ marginBottom: 12 }}>{pdi.resumo}</p>
              )}
              {pdi.aceito_em ? (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#eef7f0",
                    color: "#2f5b3a",
                    fontWeight: 600,
                  }}
                >
                  ✓ Você está de acordo com este plano desde{" "}
                  {formatarDia(pdi.aceito_em)}.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    Este plano foi homologado. Você está de acordo com ele?
                  </span>
                  <button
                    type="button"
                    style={botao}
                    onClick={aceitar}
                    disabled={ocupado}
                  >
                    Estou de acordo
                  </button>
                </div>
              )}
            </section>

            {/* ------------------------------------------------ as ações */}
            {pdi.acoes.length === 0 && (
              <p style={{ color: "#6b7280" }}>
                O plano ainda não tem ações registradas.
              </p>
            )}

            {pdi.acoes.map((acao) => {
              const rascunho = rascunhos[acao.id] ?? { texto: "", status: "" };
              const atraso =
                acao.status !== "concluida" &&
                acao.status !== "cancelada" &&
                acao.dias_ate_prazo < 0;
              return (
                <section key={acao.id} style={cartao}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <strong style={{ flex: 1 }}>{acao.descricao}</strong>
                    <Pill status={acao.status} />
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: atraso ? "#b91c1c" : "#6b7280",
                      marginTop: 4,
                    }}
                  >
                    Prazo: {formatarDia(acao.prazo)}
                    {atraso ? " — em atraso" : ""}
                  </div>

                  {/* log de andamento (linha do tempo) */}
                  {acao.andamento.length > 0 && (
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: "12px 0",
                        borderLeft: "2px solid #e2e5ea",
                      }}
                    >
                      {acao.andamento.map((reg) => (
                        <li
                          key={reg.id}
                          style={{ padding: "6px 0 6px 12px", marginLeft: 2 }}
                        >
                          <div style={{ fontSize: 12, color: "#6b7280" }}>
                            {formatarInstante(reg.criado_em)} · {reg.autor_nome}
                            {reg.status_novo && (
                              <>
                                {" "}
                                → <Pill status={reg.status_novo} />
                              </>
                            )}
                          </div>
                          <div>{reg.texto}</div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* registrar andamento */}
                  {acao.status !== "cancelada" && (
                    <div style={{ marginTop: 8 }}>
                      <label style={rotulo} htmlFor={`texto-${acao.id}`}>
                        Registrar andamento
                      </label>
                      <textarea
                        id={`texto-${acao.id}`}
                        style={{ ...campo, minHeight: 64, marginTop: 4 }}
                        placeholder="O que você avançou nesta ação?"
                        value={rascunho.texto}
                        onChange={(e) =>
                          setRascunho(acao.id, "texto", e.target.value)
                        }
                        maxLength={2000}
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          marginTop: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <label style={{ fontSize: 14 }}>
                          Estado:{" "}
                          <select
                            value={rascunho.status}
                            onChange={(e) =>
                              setRascunho(acao.id, "status", e.target.value)
                            }
                            style={{ ...campo, width: "auto", padding: "6px 8px" }}
                          >
                            <option value="">manter ({ROTULO_STATUS[acao.status]})</option>
                            {ESTADOS.map((estado) => (
                              <option key={estado} value={estado}>
                                {ROTULO_STATUS[estado]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          style={botaoFraco}
                          onClick={() => registrar(acao.id)}
                          disabled={ocupado}
                        >
                          Registrar
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}
