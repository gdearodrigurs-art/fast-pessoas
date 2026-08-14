"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import type { EtapaAtiva } from "@/dominios/recrutamento/repositorio";
import type { PainelModelosSelecao } from "@/dominios/recrutamento/servico";

export function ModelosCliente() {
  const [dados, setDados] = useState<PainelModelosSelecao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [nome, setNome] = useState("");
  const [sequencia, setSequencia] = useState<EtapaAtiva[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/recrutamento/modelos");
        const corpo = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setDados(corpo as PainelModelosSelecao);
          setErro(null);
        } else {
          setErro(corpo.erro ?? "Não foi possível carregar os modelos.");
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

  const escolhidos = new Set(sequencia.map((e) => e.id));
  const disponiveis = (dados?.catalogo ?? []).filter(
    (e) => !escolhidos.has(e.id)
  );
  const temOferta = sequencia.some((e) => e.tipo === "oferta");
  const podeSalvar =
    nome.trim() !== "" && sequencia.length > 0 && temOferta && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    setErroAcao(null);
    try {
      const resposta = await fetch("/api/recrutamento/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          etapa_ids: sequencia.map((e) => e.id),
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAcao(corpo.erro ?? "Não foi possível criar o modelo.");
        return;
      }
      setNome("");
      setSequencia([]);
      setVersao((v) => v + 1);
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f6f4", color: "#1c1b1a" }}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/recrutamento">
          Recrutamento
        </Link>
      </Cabecalho>
      <main style={{ maxWidth: 820, margin: "32px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Modelos de processo seletivo</h1>
        <p style={{ color: "#6b6763", margin: "6px 0 24px" }}>
          Um modelo é a sequência de etapas que a candidatura percorre. Toda vaga
          nova escolhe um modelo (o <strong>GERAL</strong> vem pré-selecionado) e
          o congela na abertura — reformular um modelo depois não mexe em vaga já
          aberta. O desenho de um modelo não muda depois de criado: para alterar,
          crie um novo.
        </p>

        {erro && <p style={{ color: "#c62828" }}>{erro}</p>}
        {carregando && !dados && <p style={{ color: "#6b6763" }}>Carregando…</p>}

        {dados && (
          <>
            <section>
              <h2 style={tituloArea}>Modelos ativos ({dados.modelos.length})</h2>
              {dados.modelos.map((m) => (
                <div key={m.id} style={cartao}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{m.nome}</span>
                    {m.padrao && <span style={badgeGeral}>GERAL</span>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14.5 }}>
                    {m.etapas.map((e) => e.nome).join("  →  ")}
                  </div>
                  <div style={{ color: "#6b6763", fontSize: 13, marginTop: 6 }}>
                    {m.etapas.length} etapa(s) ·{" "}
                    {m.vagas_usando === 0
                      ? "nenhuma vaga usando"
                      : `${m.vagas_usando} vaga(s) usando`}
                  </div>
                </div>
              ))}
            </section>

            <section style={{ marginTop: 12 }}>
              <h2 style={tituloArea}>Novo modelo</h2>
              {erroAcao && <p style={{ color: "#c62828" }}>{erroAcao}</p>}
              <input
                style={campo}
                placeholder="Nome do modelo (ex.: Processo enxuto — operação)"
                value={nome}
                aria-label="Nome do modelo"
                maxLength={120}
                onChange={(e) => setNome(e.target.value)}
              />

              <div style={{ marginTop: 14 }}>
                <div style={rotulo}>Etapas do modelo, na ordem</div>
                {sequencia.length === 0 ? (
                  <p style={{ color: "#6b6763", fontStyle: "italic", margin: "6px 0" }}>
                    Nenhuma etapa ainda — escolha abaixo, na ordem em que a
                    candidatura deve andar.
                  </p>
                ) : (
                  <ol style={{ margin: "6px 0", paddingLeft: 22 }}>
                    {sequencia.map((e) => (
                      <li key={e.id} style={{ marginBottom: 4 }}>
                        {e.nome}
                        {e.tipo === "oferta" && (
                          <span style={tagOferta}>oferta</span>
                        )}
                        <button
                          style={botaoLinha}
                          type="button"
                          aria-label={`Remover ${e.nome}`}
                          onClick={() =>
                            setSequencia(sequencia.filter((x) => x.id !== e.id))
                          }
                        >
                          remover
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {disponiveis.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={rotulo}>Adicionar etapa</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                    {disponiveis.map((e) => (
                      <button
                        key={e.id}
                        style={chip}
                        type="button"
                        onClick={() => setSequencia([...sequencia, e])}
                      >
                        + {e.nome}
                        {e.tipo === "oferta" && (
                          <span style={tagOfertaChip}>oferta</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sequencia.length > 0 && !temOferta && (
                <p style={{ color: "#8a6d00", fontSize: 13, marginTop: 12 }}>
                  Falta uma etapa de <strong>oferta</strong> — é onde a proposta é
                  registrada. Adicione uma para poder salvar.
                </p>
              )}

              <div style={barra}>
                <button
                  style={podeSalvar ? botao : botaoDesabilitado}
                  type="button"
                  onClick={salvar}
                  disabled={!podeSalvar}
                >
                  {salvando ? "Criando…" : "Criar modelo"}
                </button>
              </div>
            </section>
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
  padding: 8,
  borderRadius: 6,
  border: "1px solid #cfcbc6",
  font: "inherit",
  boxSizing: "border-box",
};
const rotulo: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#4b4845",
};
const barra: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 16,
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
const botaoDesabilitado: CSSProperties = {
  ...botao,
  background: "#b9c2d0",
  cursor: "not-allowed",
};
const chip: CSSProperties = {
  background: "#fff",
  color: "#1c3b6e",
  border: "1px solid #cfcbc6",
  borderRadius: 999,
  padding: "6px 12px",
  font: "inherit",
  cursor: "pointer",
};
const botaoLinha: CSSProperties = {
  marginLeft: 10,
  background: "none",
  border: "none",
  color: "#c62828",
  font: "inherit",
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};
const badgeGeral: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: "#1c3b6e",
  background: "#e7edf6",
  borderRadius: 4,
  padding: "2px 6px",
};
const tagOferta: CSSProperties = {
  marginLeft: 8,
  fontSize: 11,
  color: "#8a6d00",
  background: "#fdf3d6",
  borderRadius: 4,
  padding: "1px 6px",
};
const tagOfertaChip: CSSProperties = {
  marginLeft: 6,
  fontSize: 10,
  color: "#8a6d00",
};
