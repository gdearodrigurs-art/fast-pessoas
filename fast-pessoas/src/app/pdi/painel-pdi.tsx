"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  FOCOS_PRIORITARIOS,
  HORIZONTES_PDI,
  MODALIDADES_ACAO,
  ROTULOS_DIRECAO_PONTO_CEGO,
  ROTULOS_FOCO_PRIORITARIO,
  ROTULOS_MODALIDADE_ACAO,
  ROTULOS_STATUS_PDI,
  ROTULOS_TIPO_ACAO,
  ROTULOS_TIPO_PDI,
  StatusPdi,
  TIPOS_ACAO,
  TIPOS_PDI,
} from "@/dominios/pdi/esquemas";

interface CicloParaPdi {
  ciclo_id: number;
  colaborador_nome: string;
  matricula: string;
  faixa_rotulo: string;
  ja_tem_pdi: boolean;
}
interface Acao {
  descricao: string;
  prazo_sugerido: string;
  modalidade?: string;
  indicador?: string;
  apoio?: string;
  tipo?: string;
}
interface Foco {
  competencia: string;
  porque: string;
  objetivo: string;
  nivel_atual?: string;
  nivel_desejado?: string;
  acoes: Acao[];
}
interface PontoCego {
  competencia?: string;
  direcao?: string;
  texto: string;
}
interface Conteudo {
  focos: Foco[];
  // Aceita a forma nova (objeto) e a antiga (string) de PDIs já gravados.
  pontos_cegos: (PontoCego | string)[];
  resumo: string;
}
interface Aviso {
  tipo: string;
  mensagem: string;
}
interface Parametros {
  peso_avaliacao: number;
  tipo: string;
  horizonte_meses: number;
  foco_prioritario: string;
  contexto_livre?: string;
}
interface Pdi {
  id: number;
  pessoa_nome: string;
  ciclo_id: number | null;
  status: StatusPdi;
  parametros: Parametros;
  rascunho_ia: Conteudo;
  conteudo: Conteudo;
  avisos: Aviso[];
  modelo_ia: string;
  gerado_por_nome: string;
  gerado_em: string;
  submetido_em: string | null;
  homologado_em: string | null;
  aceito_em: string | null;
}
interface RegistroAndamento {
  id: number;
  texto: string;
  status_novo: string | null;
  autor_nome: string;
  criado_em: string;
}
interface AcaoAcompanhada {
  id: number;
  descricao: string;
  prazo: string;
  status: string;
  dias_ate_prazo: number;
  andamento: RegistroAndamento[];
}
interface Painel {
  pdis: Pdi[];
  ciclos: CicloParaPdi[];
  pode: { gerar: boolean; homologar: boolean };
}

const CORES_STATUS: Record<StatusPdi, string> = {
  rascunho: "#8a6d3b",
  aguardando_homologacao: "#31708f",
  homologado: "#2e7d32",
  cancelado: "#777",
};

// Status das AÇÕES do plano (o que o colaborador reporta), distinto do status do PDI.
const ROTULO_ACAO: Record<string, string> = {
  aberta: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const COR_ACAO: Record<string, string> = {
  aberta: "#6b7280",
  em_andamento: "#b45309",
  concluida: "#2e7d32",
  cancelada: "#9ca3af",
};
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
function acaoAtrasada(a: AcaoAcompanhada): boolean {
  return (
    a.status !== "concluida" && a.status !== "cancelada" && a.dias_ate_prazo < 0
  );
}
function PillAcao({ status }: { status: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: "1px 9px",
        borderRadius: 999,
        color: "#fff",
        background: COR_ACAO[status] ?? "#6b7280",
      }}
    >
      {ROTULO_ACAO[status] ?? status}
    </span>
  );
}

const cartao: CSSProperties = {
  border: "1px solid #e2e5ea",
  borderRadius: 10,
  padding: 16,
  background: "#fff",
  marginBottom: 12,
};
const secao: CSSProperties = { maxWidth: 920, margin: "24px auto", padding: "0 16px" };
const campo: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #cfd4dc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "inherit",
};
const rotulo: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 4 };
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
const tagAcao: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "1px 8px",
  borderRadius: 999,
  background: "#eef1f4",
  color: "#475569",
};

function Badge({ status }: { status: StatusPdi }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        color: "#fff",
        background: CORES_STATUS[status],
      }}
    >
      {ROTULOS_STATUS_PDI[status]}
    </span>
  );
}

export function PainelPdi() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState<Pdi | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/pdi");
        const d = await r.json().catch(() => ({}));
        if (!ativo) return;
        if (r.ok) {
          setPainel(d as Painel);
          setErro(null);
          setAberto((prev) =>
            prev ? (d.pdis.find((p: Pdi) => p.id === prev.id) ?? null) : null
          );
        } else {
          setErro(d.erro ?? "Não foi possível carregar o PDI.");
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
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Planos de Desenvolvimento (PDI)</h1>
        <p style={{ color: "#666", marginTop: 0, fontSize: 14 }}>
          A IA rascunha a partir da avaliação; o gestor ajusta; o RH homologa e o
          plano vira ações no portal do colaborador.
        </p>

        {erro && <div style={{ ...cartao, borderColor: "#e0a4a4", color: "#a33" }}>{erro}</div>}
        {carregando && <p>Carregando…</p>}

        {painel && aberto && (
          <DetalhePdi
            key={aberto.id}
            pdi={aberto}
            podeHomologar={painel.pode.homologar}
            aoVoltar={() => setAberto(null)}
            aoMudar={recarregar}
          />
        )}

        {painel && !aberto && (
          <>
            {painel.pode.gerar && (
              <FormularioGerar
                ciclos={painel.ciclos}
                aoGerar={(id) => {
                  recarregar();
                  const achado = painel.pdis.find((p) => p.id === id);
                  if (achado) setAberto(achado);
                }}
              />
            )}
            <h2 style={{ fontSize: 18, marginTop: 24 }}>PDIs</h2>
            {painel.pdis.length === 0 && <p style={{ color: "#666" }}>Nenhum PDI ainda.</p>}
            {painel.pdis.map((pdi) => (
              <div
                key={pdi.id}
                style={{ ...cartao, cursor: "pointer" }}
                onClick={() => setAberto(pdi)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{pdi.pessoa_nome}</strong>
                  <Badge status={pdi.status} />
                </div>
                <div style={{ color: "#777", fontSize: 13, marginTop: 4 }}>
                  {pdi.conteudo.focos.length} foco(s) · gerado por {pdi.gerado_por_nome}
                  {pdi.avisos.length > 0 ? ` · ${pdi.avisos.length} aviso(s)` : ""}
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </>
  );
}

function FormularioGerar({
  ciclos,
  aoGerar,
}: {
  ciclos: CicloParaPdi[];
  aoGerar: (id: number) => void;
}) {
  const [cicloId, setCicloId] = useState("");
  const [peso, setPeso] = useState("");
  const [tipo, setTipo] = useState<string>("ciclo");
  const [horizonte, setHorizonte] = useState("");
  const [foco, setFoco] = useState<string>("ia_decide");
  const [contexto, setContexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!cicloId) {
      setErro("Escolha um ciclo consolidado.");
      return;
    }
    if (peso === "") {
      setErro("Informe o peso da avaliação.");
      return;
    }
    if (horizonte === "") {
      setErro("Escolha o horizonte do plano.");
      return;
    }
    setGerando(true);
    setErro(null);
    try {
      const r = await fetch("/api/pdi/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciclo_id: Number(cicloId),
          entrevista: {
            peso_avaliacao: Number(peso),
            tipo,
            horizonte_meses: Number(horizonte),
            foco_prioritario: foco,
            ...(contexto.trim() ? { contexto_livre: contexto.trim() } : {}),
          },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setContexto("");
        setCicloId("");
        aoGerar(d.pdi.id);
      } else {
        setErro(d.erro ?? "Não foi possível gerar o PDI.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <form onSubmit={enviar} style={{ ...cartao, background: "#f7f9fc" }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>Gerar novo PDI</h2>
      <div style={{ marginBottom: 12 }}>
        <label style={rotulo}>Avaliação consolidada</label>
        <select style={campo} value={cicloId} onChange={(e) => setCicloId(e.target.value)}>
          <option value="">Escolha um ciclo…</option>
          {ciclos.map((c) => (
            <option key={c.ciclo_id} value={c.ciclo_id} disabled={c.ja_tem_pdi}>
              {c.colaborador_nome} (mat. {c.matricula}) — {c.faixa_rotulo}
              {c.ja_tem_pdi ? " · já tem PDI" : ""}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={rotulo}>Peso da avaliação (%)</label>
          <input
            type="number"
            style={campo}
            value={peso}
            placeholder="ex.: 100"
            onChange={(e) => setPeso(e.target.value)}
          />
        </div>
        <div>
          <label style={rotulo}>Tipo</label>
          <select style={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_PDI.map((t) => (
              <option key={t} value={t}>
                {ROTULOS_TIPO_PDI[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotulo}>Horizonte (meses)</label>
          <select
            style={campo}
            value={horizonte}
            onChange={(e) => setHorizonte(e.target.value)}
          >
            <option value="">Escolha…</option>
            {HORIZONTES_PDI.map((h) => (
              <option key={h} value={h}>
                {h} meses
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotulo}>Foco prioritário</label>
          <select style={campo} value={foco} onChange={(e) => setFoco(e.target.value)}>
            {FOCOS_PRIORITARIOS.map((f) => (
              <option key={f} value={f}>
                {ROTULOS_FOCO_PRIORITARIO[f]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={rotulo}>Contexto que os números não mostram (opcional)</label>
        <textarea
          style={{ ...campo, minHeight: 64, resize: "vertical" }}
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          placeholder="Descreva o contexto do trabalho, do momento ou do potencial da pessoa."
        />
        <small style={{ color: "#999" }}>
          Não use nomes; evite dados de saúde, família ou vida pessoal.
        </small>
      </div>
      {erro && <p style={{ color: "#a33" }}>{erro}</p>}
      <button type="submit" style={{ ...botao, opacity: gerando ? 0.6 : 1 }} disabled={gerando}>
        {gerando ? "Gerando com IA… (pode levar até 1 minuto)" : "Gerar PDI"}
      </button>
    </form>
  );
}

function DetalhePdi({
  pdi,
  podeHomologar,
  aoVoltar,
  aoMudar,
}: {
  pdi: Pdi;
  podeHomologar: boolean;
  aoVoltar: () => void;
  aoMudar: () => void;
}) {
  // Inicializa da prop; o componente é remontado (key={pdi.id}) ao abrir outro PDI.
  const [conteudo, setConteudo] = useState<Conteudo>(pdi.conteudo);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // O acompanhamento (ações + log do colaborador) só existe depois de homologado.
  // Busca no detalhe (/api/pdi/[id]) para não pesar a lista com o log de todo mundo.
  const [acompanhamento, setAcompanhamento] = useState<AcaoAcompanhada[]>([]);
  useEffect(() => {
    if (pdi.status !== "homologado") return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pdi/${pdi.id}`);
        if (!r.ok) return;
        const d = await r.json();
        if (ativo) setAcompanhamento(d.pdi?.acompanhamento ?? []);
      } catch {
        /* o acompanhamento é complementar; o resto do detalhe já está na tela */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [pdi.id, pdi.status]);

  function mudarFoco(i: number, campoNome: keyof Foco, valor: string) {
    setConteudo((c) => {
      const focos = c.focos.map((f, idx) =>
        idx === i ? { ...f, [campoNome]: valor } : f
      );
      return { ...c, focos };
    });
  }
  function mudarAcao(fi: number, ai: number, campoNome: keyof Acao, valor: string) {
    setConteudo((c) => {
      const focos = c.focos.map((f, idx) => {
        if (idx !== fi) return f;
        const acoes = f.acoes.map((a, j) =>
          j === ai ? { ...a, [campoNome]: valor } : a
        );
        return { ...f, acoes };
      });
      return { ...c, focos };
    });
  }

  async function acao(url: string, metodo: string, corpo?: unknown) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch(url, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        if (typeof d.acoes_criadas === "number") {
          setAviso(`Homologado — ${d.acoes_criadas} ação(ões) criadas no portal do colaborador.`);
        }
        aoMudar();
        return true;
      }
      setErro(d.erro ?? "Operação recusada.");
      return false;
    } catch {
      setErro("Falha de conexão.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={cartao}>
      <button style={{ ...botaoNeutro, marginBottom: 12 }} onClick={aoVoltar}>
        ← Voltar
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{pdi.pessoa_nome}</h2>
        <Badge status={pdi.status} />
      </div>
      <div style={{ color: "#777", fontSize: 13, margin: "4px 0 12px" }}>
        Gerado por {pdi.gerado_por_nome} · modelo {pdi.modelo_ia} · horizonte{" "}
        {pdi.parametros.horizonte_meses} meses
      </div>

      {pdi.avisos.length > 0 && (
        <div style={{ background: "#fff8e1", border: "1px solid #f0d98c", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <strong style={{ fontSize: 13 }}>Avisos do motor (verifique antes de aprovar):</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {pdi.avisos.map((a, i) => (
              <li key={i}>{a.mensagem}</li>
            ))}
          </ul>
        </div>
      )}

      {conteudo.focos.map((foco, fi) => (
        <div key={fi} style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
          {editando ? (
            <input style={{ ...campo, fontWeight: 700, marginBottom: 6 }} value={foco.competencia} onChange={(e) => mudarFoco(fi, "competencia", e.target.value)} />
          ) : (
            <h3 style={{ margin: "0 0 6px" }}>
              Foco {fi + 1}: {foco.competencia}
            </h3>
          )}
          <p style={{ margin: "4px 0", fontSize: 14 }}>
            <em>Por quê: </em>
            {editando ? (
              <textarea style={{ ...campo, minHeight: 48 }} value={foco.porque} onChange={(e) => mudarFoco(fi, "porque", e.target.value)} />
            ) : (
              foco.porque
            )}
          </p>
          <p style={{ margin: "4px 0", fontSize: 14 }}>
            <em>Objetivo: </em>
            {editando ? (
              <textarea style={{ ...campo, minHeight: 48 }} value={foco.objetivo} onChange={(e) => mudarFoco(fi, "objetivo", e.target.value)} />
            ) : (
              foco.objetivo
            )}
          </p>
          {(editando || foco.nivel_atual || foco.nivel_desejado) && (
            <p style={{ margin: "4px 0", fontSize: 13, color: "#555" }}>
              <em>Nível: </em>
              {editando ? (
                <>
                  <input
                    style={{ ...campo, maxWidth: 200, display: "inline-block" }}
                    placeholder="nível atual"
                    value={foco.nivel_atual ?? ""}
                    onChange={(e) => mudarFoco(fi, "nivel_atual", e.target.value)}
                  />
                  {" → "}
                  <input
                    style={{ ...campo, maxWidth: 200, display: "inline-block" }}
                    placeholder="nível desejado"
                    value={foco.nivel_desejado ?? ""}
                    onChange={(e) => mudarFoco(fi, "nivel_desejado", e.target.value)}
                  />
                </>
              ) : (
                <>
                  {foco.nivel_atual || "—"} → {foco.nivel_desejado || "—"}
                </>
              )}
            </p>
          )}
          <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 14, listStyle: "none" }}>
            {foco.acoes.map((a, ai) => (
              <li key={ai} style={{ marginBottom: editando ? 12 : 10 }}>
                {editando ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input style={campo} placeholder="o que fazer (concreto)" value={a.descricao} onChange={(e) => mudarAcao(fi, ai, "descricao", e.target.value)} />
                      <input style={{ ...campo, maxWidth: 160 }} placeholder="prazo" value={a.prazo_sugerido} onChange={(e) => mudarAcao(fi, ai, "prazo_sugerido", e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <select style={{ ...campo, maxWidth: 220 }} value={a.modalidade ?? ""} onChange={(e) => mudarAcao(fi, ai, "modalidade", e.target.value)}>
                        <option value="">modalidade…</option>
                        {MODALIDADES_ACAO.map((m) => (
                          <option key={m} value={m}>{ROTULOS_MODALIDADE_ACAO[m]}</option>
                        ))}
                      </select>
                      <select style={{ ...campo, maxWidth: 170 }} value={a.tipo ?? ""} onChange={(e) => mudarAcao(fi, ai, "tipo", e.target.value)}>
                        <option value="">força/lacuna…</option>
                        {TIPOS_ACAO.map((t) => (
                          <option key={t} value={t}>{ROTULOS_TIPO_ACAO[t]}</option>
                        ))}
                      </select>
                    </div>
                    <input style={campo} placeholder="indicador de sucesso (observável por um terceiro)" value={a.indicador ?? ""} onChange={(e) => mudarAcao(fi, ai, "indicador", e.target.value)} />
                    <input style={campo} placeholder="quem apoia / fonte de feedback" value={a.apoio ?? ""} onChange={(e) => mudarAcao(fi, ai, "apoio", e.target.value)} />
                  </div>
                ) : (
                  <>
                    <div>
                      {a.descricao} <span style={{ color: "#888" }}>({a.prazo_sugerido})</span>
                    </div>
                    {(a.modalidade || a.tipo) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "3px 0" }}>
                        {a.modalidade && (
                          <span style={tagAcao}>
                            {ROTULOS_MODALIDADE_ACAO[a.modalidade as keyof typeof ROTULOS_MODALIDADE_ACAO] ?? a.modalidade}
                          </span>
                        )}
                        {a.tipo && (
                          <span style={tagAcao}>
                            {ROTULOS_TIPO_ACAO[a.tipo as keyof typeof ROTULOS_TIPO_ACAO] ?? a.tipo}
                          </span>
                        )}
                      </div>
                    )}
                    {a.indicador && (
                      <div style={{ fontSize: 12, color: "#555" }}>
                        <em>Indicador:</em> {a.indicador}
                      </div>
                    )}
                    {a.apoio && (
                      <div style={{ fontSize: 12, color: "#555" }}>
                        <em>Apoio:</em> {a.apoio}
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {conteudo.pontos_cegos.length > 0 && (
        <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
          <strong>Pontos cegos (autoavaliação × líder)</strong>
          <p style={{ margin: "2px 0 6px", fontSize: 12, color: "#888" }}>
            Onde a visão do colaborador diverge da do líder — insumo de conversa,
            não nota.
          </p>
          <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 14 }}>
            {conteudo.pontos_cegos.map((p, i) => {
              const texto = typeof p === "string" ? p : p.texto;
              const competencia = typeof p === "string" ? "" : p.competencia;
              const direcao = typeof p === "string" ? "" : p.direcao;
              const rotuloDir = direcao
                ? ROTULOS_DIRECAO_PONTO_CEGO[
                    direcao as keyof typeof ROTULOS_DIRECAO_PONTO_CEGO
                  ] ?? direcao
                : "";
              return (
                <li key={i} style={{ marginBottom: 4 }}>
                  {(competencia || rotuloDir) && (
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {competencia}
                      {competencia && rotuloDir ? " · " : ""}
                      {rotuloDir}
                      {": "}
                    </span>
                  )}
                  {texto}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
        <strong>Resumo</strong>
        {editando ? (
          <textarea
            style={{ ...campo, minHeight: 72, marginTop: 6 }}
            value={conteudo.resumo}
            onChange={(e) => setConteudo((c) => ({ ...c, resumo: e.target.value }))}
          />
        ) : (
          <p style={{ margin: "6px 0", fontSize: 14 }}>{conteudo.resumo}</p>
        )}
      </div>

      {pdi.status === "homologado" && (
        <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
          <strong>Acompanhamento do colaborador</strong>
          <p style={{ margin: "2px 0 8px", fontSize: 12, color: "#888" }}>
            O que a pessoa registrou no portal dela: se aceitou o plano e como cada
            ação evoluiu.
          </p>

          <div
            style={{
              display: "inline-block",
              fontSize: 13,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 8,
              marginBottom: 8,
              ...(pdi.aceito_em
                ? { background: "#eef7f0", color: "#2f5b3a" }
                : { background: "#fff8e1", color: "#8a6d3b" }),
            }}
          >
            {pdi.aceito_em
              ? `✓ Aceito pelo colaborador em ${formatarDia(pdi.aceito_em)}`
              : "Aguardando o aceite do colaborador"}
          </div>

          {acompanhamento.length === 0 ? (
            <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              Nenhuma ação publicada ainda.
            </p>
          ) : (
            acompanhamento.map((a) => (
              <div
                key={a.id}
                style={{ borderTop: "1px dashed #eee", paddingTop: 8, marginTop: 8 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ fontSize: 14, flex: 1 }}>{a.descricao}</span>
                  <PillAcao status={a.status} />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: acaoAtrasada(a) ? "#b91c1c" : "#888",
                    marginTop: 2,
                  }}
                >
                  Prazo: {formatarDia(a.prazo)}
                  {acaoAtrasada(a) ? " — em atraso" : ""}
                </div>
                {a.andamento.length > 0 && (
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "8px 0 0",
                      borderLeft: "2px solid #e2e5ea",
                    }}
                  >
                    {a.andamento.map((reg) => (
                      <li
                        key={reg.id}
                        style={{ padding: "4px 0 4px 10px", marginLeft: 2 }}
                      >
                        <div style={{ fontSize: 11, color: "#888" }}>
                          {formatarInstante(reg.criado_em)} · {reg.autor_nome}
                          {reg.status_novo
                            ? ` → ${ROTULO_ACAO[reg.status_novo] ?? reg.status_novo}`
                            : ""}
                        </div>
                        <div style={{ fontSize: 13 }}>{reg.texto}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {erro && <p style={{ color: "#a33" }}>{erro}</p>}
      {aviso && <p style={{ color: "#2e7d32", fontWeight: 600 }}>{aviso}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {pdi.status === "rascunho" && !editando && (
          <button style={botaoNeutro} onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
        {pdi.status === "rascunho" && editando && (
          <>
            <button
              style={botao}
              disabled={ocupado}
              onClick={async () => {
                const ok = await acao(`/api/pdi/${pdi.id}`, "PATCH", conteudo);
                if (ok) setEditando(false);
              }}
            >
              Salvar ajustes
            </button>
            <button style={botaoNeutro} disabled={ocupado} onClick={() => { setConteudo(pdi.conteudo); setEditando(false); }}>
              Cancelar
            </button>
          </>
        )}
        {pdi.status === "rascunho" && !editando && (
          <button
            style={{ ...botao, background: "#2e7d32" }}
            disabled={ocupado}
            onClick={() => acao(`/api/pdi/${pdi.id}/submeter`, "POST")}
          >
            Submeter para homologação
          </button>
        )}
        {pdi.status === "aguardando_homologacao" && podeHomologar && (
          <button
            style={{ ...botao, background: "#2e7d32" }}
            disabled={ocupado}
            onClick={() => acao(`/api/pdi/${pdi.id}/homologar`, "POST")}
          >
            Homologar e publicar
          </button>
        )}
      </div>
    </div>
  );
}
