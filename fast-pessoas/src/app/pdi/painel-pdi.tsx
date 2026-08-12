"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  FOCOS_PRIORITARIOS,
  HORIZONTES_PDI,
  ROTULOS_FOCO_PRIORITARIO,
  ROTULOS_STATUS_PDI,
  ROTULOS_TIPO_PDI,
  StatusPdi,
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
}
interface Foco {
  competencia: string;
  porque: string;
  objetivo: string;
  acoes: Acao[];
}
interface Conteudo {
  focos: Foco[];
  pontos_cegos: string[];
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
          <ul style={{ margin: "4px 0", paddingLeft: 18, fontSize: 14 }}>
            {foco.acoes.map((a, ai) => (
              <li key={ai}>
                {editando ? (
                  <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    <input style={campo} value={a.descricao} onChange={(e) => mudarAcao(fi, ai, "descricao", e.target.value)} />
                    <input style={{ ...campo, maxWidth: 160 }} value={a.prazo_sugerido} onChange={(e) => mudarAcao(fi, ai, "prazo_sugerido", e.target.value)} />
                  </div>
                ) : (
                  <>
                    {a.descricao} <span style={{ color: "#888" }}>({a.prazo_sugerido})</span>
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
            {conteudo.pontos_cegos.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
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
