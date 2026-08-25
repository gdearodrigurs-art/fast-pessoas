"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import type { EtapaAtiva, ModeloResumo } from "@/dominios/recrutamento/repositorio";
import type { PainelModelosSelecao } from "@/dominios/recrutamento/servico";
import { formatarData } from "../formato";

export function ModelosCliente() {
  const [dados, setDados] = useState<PainelModelosSelecao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [nome, setNome] = useState("");
  const [sequencia, setSequencia] = useState<EtapaAtiva[]>([]);
  // Modelo cuja série o formulário está reformulando — null = criar do zero.
  const [reformulando, setReformulando] = useState<ModeloResumo | null>(null);
  // Aposentadoria pede confirmação inline no próprio cartão.
  const [aposentando, setAposentando] = useState<number | null>(null);
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
  // A oferta fecha o modelo: o kanban trata a oferta como o fim do processo, e
  // uma etapa depois dela deixaria a candidatura num beco. Uma vez na sequência,
  // ela é a última e nada mais entra; para inserir antes, remova a oferta.
  const ofertaNaSequencia = sequencia.some((e) => e.tipo === "oferta");
  const ofertaEhUltima =
    sequencia.length > 0 && sequencia[sequencia.length - 1].tipo === "oferta";
  const podeSalvar = nome.trim() !== "" && ofertaEhUltima && !salvando;

  // O fio da série: id → modelo (ativos + encerrados) para andar o continua_de.
  const porId = new Map<number, ModeloResumo>(
    [...(dados?.modelos ?? []), ...(dados?.encerrados ?? [])].map((m) => [
      m.id,
      m,
    ])
  );
  const comSubstituto = new Set(
    [...(dados?.modelos ?? []), ...(dados?.encerrados ?? [])]
      .map((m) => m.continua_de)
      .filter((id): id is number => id !== null)
  );
  // Aposentados: encerrados que ninguém reformulou (os reformulados aparecem
  // como histórico da série do sucessor).
  const aposentados = (dados?.encerrados ?? []).filter(
    (m) => !comSubstituto.has(m.id)
  );

  function serieDe(modelo: ModeloResumo): ModeloResumo[] {
    const cadeia: ModeloResumo[] = [];
    let atual = modelo.continua_de;
    while (atual !== null) {
      const anterior = porId.get(atual);
      if (!anterior) break;
      cadeia.push(anterior);
      atual = anterior.continua_de;
    }
    return cadeia;
  }

  function limparFormulario() {
    setNome("");
    setSequencia([]);
    setReformulando(null);
  }

  function iniciarReformulacao(modelo: ModeloResumo) {
    const catalogo = dados?.catalogo ?? [];
    // Pré-carrega a sequência atual com as peças do catálogo vigente: casa por
    // id e, se a versão de etapa do modelo já saiu do catálogo, pela do mesmo
    // tipo — o reformular só aceita etapas ativas.
    const prefil = modelo.etapas
      .map(
        (e) =>
          catalogo.find((c) => c.id === e.id) ??
          catalogo.find((c) => c.tipo === e.tipo)
      )
      .filter((e): e is EtapaAtiva => e !== undefined);
    setReformulando(modelo);
    setNome(modelo.nome);
    setSequencia(prefil);
    setAposentando(null);
    setErroAcao(null);
  }

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    setErroAcao(null);
    try {
      const url = reformulando
        ? `/api/recrutamento/modelos/${reformulando.id}/reformular`
        : "/api/recrutamento/modelos";
      const resposta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          etapa_ids: sequencia.map((e) => e.id),
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAcao(
          corpo.erro ??
            (reformulando
              ? "Não foi possível reformular o modelo."
              : "Não foi possível criar o modelo.")
        );
        return;
      }
      limparFormulario();
      setVersao((v) => v + 1);
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function aposentar(modelo: ModeloResumo) {
    setSalvando(true);
    setErroAcao(null);
    try {
      const resposta = await fetch(
        `/api/recrutamento/modelos/${modelo.id}/aposentar`,
        { method: "POST" }
      );
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAcao(corpo.erro ?? "Não foi possível aposentar o modelo.");
        return;
      }
      setAposentando(null);
      if (reformulando?.id === modelo.id) limparFormulario();
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
          o congela na abertura. <strong>Reformular</strong> encerra a versão
          atual e publica a nova no lugar — vaga já aberta NÃO migra: fica na
          versão antiga, e a troca (só sem candidatura) é feita na própria vaga.{" "}
          <strong>Aposentar</strong> encerra sem substituto.
        </p>

        {erro && <p style={{ color: "#c62828" }}>{erro}</p>}
        {carregando && !dados && <p style={{ color: "#6b6763" }}>Carregando…</p>}

        {dados && (
          <>
            <section>
              <h2 style={tituloArea}>Modelos ativos ({dados.modelos.length})</h2>
              {dados.modelos.map((m) => {
                const serie = serieDe(m);
                return (
                  <div key={m.id} style={cartao}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{m.nome}</span>
                      {m.padrao && <span style={badgeGeral}>GERAL</span>}
                      {reformulando?.id === m.id && (
                        <span style={badgeReformulando}>reformulando…</span>
                      )}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 14.5 }}>
                      {m.etapas.map((e) => e.nome).join("  →  ")}
                    </div>
                    <div style={{ color: "#6b6763", fontSize: 13, marginTop: 6 }}>
                      {m.etapas.length} etapa(s) ·{" "}
                      {m.vagas_usando === 0
                        ? "nenhuma vaga usando"
                        : `${m.vagas_usando} vaga(s) usando`}
                      {m.inicio_vigencia &&
                        ` · vigente desde ${formatarData(m.inicio_vigencia)}`}
                    </div>
                    {serie.length > 0 && (
                      <div style={blocoSerie}>
                        <div style={rotuloSerie}>Histórico da série</div>
                        {serie.map((anterior) => (
                          <div key={anterior.id} style={linhaSerie}>
                            substitui <b>{anterior.nome}</b>
                            {anterior.inicio_vigencia && anterior.fim_vigencia && (
                              <>
                                {" "}
                                ({formatarData(anterior.inicio_vigencia)} –{" "}
                                {formatarData(anterior.fim_vigencia)})
                              </>
                            )}{" "}
                            — {anterior.etapas.map((e) => e.nome).join(" → ")}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        style={botaoMiudo}
                        type="button"
                        onClick={() => iniciarReformulacao(m)}
                      >
                        Reformular
                      </button>
                      {!m.padrao &&
                        (aposentando === m.id ? (
                          <>
                            <span style={{ fontSize: 13, color: "#8a6d00" }}>
                              Aposentar? Sai da oferta de vaga nova; vagas que o
                              congelaram continuam nele.
                            </span>
                            <button
                              style={botaoMiudoPerigo}
                              type="button"
                              disabled={salvando}
                              onClick={() => aposentar(m)}
                            >
                              Confirmar
                            </button>
                            <button
                              style={botaoMiudo}
                              type="button"
                              onClick={() => setAposentando(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            style={botaoMiudoPerigo}
                            type="button"
                            onClick={() => {
                              setAposentando(m.id);
                              setErroAcao(null);
                            }}
                          >
                            Aposentar
                          </button>
                        ))}
                      {m.padrao && (
                        <span style={{ fontSize: 13, color: "#6b6763" }}>
                          O GERAL não se aposenta — toda vaga nova nasce dele.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            <section style={{ marginTop: 12 }}>
              <h2 style={tituloArea}>
                {reformulando
                  ? `Reformular — ${reformulando.nome}`
                  : "Novo modelo"}
              </h2>
              {reformulando && (
                <p style={{ color: "#6b6763", fontSize: 13.5, margin: "0 0 10px" }}>
                  A versão atual será encerrada e esta nova entra no lugar, na
                  mesma série
                  {reformulando.padrao && " — e herda o posto de GERAL"}. Vagas
                  abertas continuam na versão antiga.
                </p>
              )}
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

              {ofertaNaSequencia ? (
                <p style={{ color: "#6b6763", fontSize: 13, marginTop: 12 }}>
                  A oferta fecha o modelo — nada entra depois dela. Para inserir
                  uma etapa antes, remova a oferta e adicione-a de novo por último.
                </p>
              ) : (
                disponiveis.length > 0 && (
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
                            <span style={tagOfertaChip}>oferta — fecha o modelo</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}

              {sequencia.length > 0 && !ofertaEhUltima && (
                <p style={{ color: "#8a6d00", fontSize: 13, marginTop: 12 }}>
                  A etapa de <strong>oferta</strong> precisa ser a{" "}
                  <strong>última</strong> do modelo — é onde a proposta é
                  registrada e o processo termina. Adicione-a por último para
                  poder salvar.
                </p>
              )}

              <div style={barra}>
                {reformulando && (
                  <button
                    style={botaoSecundario}
                    type="button"
                    onClick={limparFormulario}
                  >
                    Cancelar reformulação
                  </button>
                )}
                <button
                  style={podeSalvar ? botao : botaoDesabilitado}
                  type="button"
                  onClick={salvar}
                  disabled={!podeSalvar}
                >
                  {salvando
                    ? "Salvando…"
                    : reformulando
                      ? "Publicar versão nova"
                      : "Criar modelo"}
                </button>
              </div>
            </section>

            {aposentados.length > 0 && (
              <section style={{ marginTop: 12 }}>
                <h2 style={tituloArea}>Aposentados ({aposentados.length})</h2>
                {aposentados.map((m) => (
                  <div key={m.id} style={cartaoEncerrado}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{m.nome}</span>
                      <span style={badgeEncerrado}>encerrado</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14 }}>
                      {m.etapas.map((e) => e.nome).join("  →  ")}
                    </div>
                    <div style={{ color: "#6b6763", fontSize: 13, marginTop: 6 }}>
                      {m.inicio_vigencia && m.fim_vigencia
                        ? `vigeu de ${formatarData(m.inicio_vigencia)} a ${formatarData(m.fim_vigencia)} · `
                        : ""}
                      {m.vagas_usando === 0
                        ? "nenhuma vaga usou"
                        : `${m.vagas_usando} vaga(s) congelaram esta versão`}
                    </div>
                  </div>
                ))}
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
const cartaoEncerrado: CSSProperties = {
  ...cartao,
  background: "#f2f0ed",
  color: "#4b4845",
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
const botaoSecundario: CSSProperties = {
  background: "#fff",
  color: "#1c3b6e",
  border: "1px solid #cfcbc6",
  borderRadius: 6,
  padding: "8px 14px",
  font: "inherit",
  cursor: "pointer",
};
const botaoMiudo: CSSProperties = {
  background: "#fff",
  color: "#1c3b6e",
  border: "1px solid #cfcbc6",
  borderRadius: 6,
  padding: "4px 10px",
  font: "inherit",
  fontSize: 13,
  cursor: "pointer",
};
const botaoMiudoPerigo: CSSProperties = {
  ...botaoMiudo,
  color: "#c62828",
  borderColor: "#e0b4b4",
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
const badgeReformulando: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: "#8a6d00",
  background: "#fdf3d6",
  borderRadius: 4,
  padding: "2px 6px",
};
const badgeEncerrado: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: "#6b6763",
  background: "#e3e0dc",
  borderRadius: 4,
  padding: "2px 6px",
};
const blocoSerie: CSSProperties = {
  marginTop: 10,
  borderLeft: "3px solid #e3e0dc",
  paddingLeft: 10,
};
const rotuloSerie: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#6b6763",
};
const linhaSerie: CSSProperties = {
  fontSize: 13,
  color: "#4b4845",
  marginTop: 4,
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
