"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  MOTIVOS_REQUISICAO,
  MotivoRequisicao,
  ROTULOS_MOTIVO_REQUISICAO,
  ROTULOS_STATUS_REQUISICAO,
  ROTULOS_STATUS_VAGA,
  StatusRequisicao,
  StatusVaga,
} from "@/dominios/recrutamento/esquemas";
import type { ModeloResumo } from "@/dominios/recrutamento/repositorio";
import comum from "./comum.module.css";
import {
  formatarData,
  formatarDuracaoDias,
  formatarSalario,
  textoPrazo,
} from "./formato";
import { KanbanVaga } from "./kanban-vaga";
import estilos from "./page.module.css";
import { Painel, Requisicao, TempoEtapa, Vaga } from "./tipos";

type Aba = "requisicoes" | "vagas" | "kanban" | "tempos";

const BADGE_REQUISICAO: Record<StatusRequisicao, string> = {
  solicitada: comum.badgeWarning,
  aprovada: comum.badgeSuccess,
  reprovada: comum.badgeDanger,
};

const BADGE_VAGA: Record<StatusVaga, string> = {
  aberta: comum.badgeInfo,
  congelada: comum.badgeWarning,
  fechada: comum.badgeSuccess,
  cancelada: comum.badgeNeutro,
};

export function PainelRecrutamento() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("requisicoes");
  const [vagaSelecionada, setVagaSelecionada] = useState<number | null>(null);
  const [versao, setVersao] = useState(0);

  // Diálogos
  const [dialogoRequisicao, setDialogoRequisicao] = useState(false);
  const [decisao, setDecisao] = useState<{
    requisicao: Requisicao;
    acao: "aprovar" | "reprovar";
  } | null>(null);
  const [novaVagaDe, setNovaVagaDe] = useState<Requisicao | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/recrutamento");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setPainel(dados as Painel);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o recrutamento.");
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
    setVersao((atual) => atual + 1);
  }

  function abrirKanban(vagaId: number) {
    setVagaSelecionada(vagaId);
    setAba("kanban");
  }

  const veTudo = Boolean(painel && (painel.pode.ver || painel.pode.gerir));
  const requisicoesPendentes =
    painel?.requisicoes.filter((r) => r.status === "solicitada").length ?? 0;
  const vagasAbertas =
    painel?.vagas.filter((v) => v.status === "aberta").length ?? 0;
  const vagaDoKanban =
    painel?.vagas.find((v) => v.id === vagaSelecionada) ?? null;

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Recrutamento e Seleção</h1>
          <div className={comum.acoes}>
            {painel?.pode.gerir && (
              <Link className={comum.botaoSecundario} href="/recrutamento/modelos">
                Modelos de processo
              </Link>
            )}
            {painel?.pode.requisicao_criar && (
              <button
                className={comum.botaoPrimario}
                type="button"
                onClick={() => setDialogoRequisicao(true)}
                disabled={!painel.cargos || painel.cargos.length === 0}
              >
                + Nova requisição de vaga
              </button>
            )}
          </div>
        </div>
        <p className={estilos.subtitulo}>
          Requisição → vaga → seleção no kanban → oferta → admissão. A seleção
          termina na oferta aceita; a admissão começa ali.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !painel && <p className={estilos.vazio}>Carregando…</p>}

        {painel && (
          <>
            {!veTudo && (
              <div className={estilos.notaLeitura}>
                Você vê apenas as <b>suas requisições</b> e as vagas que
                nasceram delas. Quem conduz a seleção é o RH/DP.
              </div>
            )}

            {veTudo && (
              <div className={estilos.indicadores}>
                <div className={estilos.cardIndicador}>
                  <div className={estilos.numeroIndicador}>{vagasAbertas}</div>
                  <div className={estilos.rotuloIndicador}>vagas abertas</div>
                </div>
                <div
                  className={`${estilos.cardIndicador} ${
                    requisicoesPendentes > 0 ? estilos.indicadorAlerta : ""
                  }`}
                >
                  <div className={estilos.numeroIndicador}>
                    {requisicoesPendentes}
                  </div>
                  <div className={estilos.rotuloIndicador}>
                    requisições aguardando decisão
                  </div>
                </div>
                <div className={estilos.cardIndicador}>
                  <div className={estilos.numeroIndicador}>
                    {painel.indicador_vagas_no_prazo === null
                      ? "—"
                      : `${painel.indicador_vagas_no_prazo}%`}
                  </div>
                  <div className={estilos.rotuloIndicador}>
                    vagas fechadas no prazo (12m)
                  </div>
                </div>
              </div>
            )}

            <div className={estilos.abasPrincipais}>
              <button
                className={`${estilos.aba} ${aba === "requisicoes" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("requisicoes")}
              >
                Requisições ({painel.requisicoes.length})
              </button>
              <button
                className={`${estilos.aba} ${aba === "vagas" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("vagas")}
              >
                Vagas ({painel.vagas.length})
              </button>
              <button
                className={`${estilos.aba} ${aba === "kanban" ? estilos.abaAtiva : ""}`}
                type="button"
                onClick={() => setAba("kanban")}
              >
                Kanban{vagaDoKanban ? ` — ${vagaDoKanban.titulo}` : ""}
              </button>
              {veTudo && (
                <button
                  className={`${estilos.aba} ${aba === "tempos" ? estilos.abaAtiva : ""}`}
                  type="button"
                  onClick={() => setAba("tempos")}
                >
                  Tempo por etapa
                </button>
              )}
            </div>

            {aba === "requisicoes" && (
              <section className={estilos.area}>
                {painel.requisicoes.length === 0 ? (
                  <p className={estilos.vazio}>
                    Nenhuma requisição de vaga registrada.
                  </p>
                ) : (
                  painel.requisicoes.map((requisicao) => (
                    <CartaoRequisicao
                      key={requisicao.id}
                      requisicao={requisicao}
                      podeDecidir={painel.pode.requisicao_decidir}
                      podeGerir={painel.pode.gerir}
                      aoDecidir={(acao) => setDecisao({ requisicao, acao })}
                      aoCriarVaga={() => setNovaVagaDe(requisicao)}
                      aoAbrirVaga={abrirKanban}
                    />
                  ))
                )}
              </section>
            )}

            {aba === "vagas" && (
              <section className={estilos.area}>
                {painel.vagas.length === 0 ? (
                  <p className={estilos.vazio}>Nenhuma vaga criada ainda.</p>
                ) : (
                  painel.vagas.map((vaga) => (
                    <CartaoVaga
                      key={vaga.id}
                      vaga={vaga}
                      aoAbrirKanban={() => abrirKanban(vaga.id)}
                    />
                  ))
                )}
              </section>
            )}

            {aba === "tempos" && veTudo && <QuadroTempos />}

            {aba === "kanban" &&
              (vagaSelecionada === null ? (
                <section className={estilos.area}>
                  <p className={estilos.vazio}>
                    Escolha uma vaga na aba “Vagas” para abrir o kanban da
                    seleção.
                  </p>
                </section>
              ) : (
                <KanbanVaga
                  vagaId={vagaSelecionada}
                  pode={painel.pode}
                  candidatos={painel.candidatos}
                  aoMudar={recarregar}
                />
              ))}
          </>
        )}
      </main>

      {dialogoRequisicao && painel?.cargos && (
        <DialogoNovaRequisicao
          painel={painel}
          aoFechar={() => setDialogoRequisicao(false)}
          aoCriar={() => {
            setDialogoRequisicao(false);
            setAba("requisicoes");
            recarregar();
          }}
        />
      )}

      {decisao && (
        <DialogoDecisao
          requisicao={decisao.requisicao}
          acao={decisao.acao}
          aoFechar={() => setDecisao(null)}
          aoConcluir={() => {
            setDecisao(null);
            recarregar();
          }}
        />
      )}

      {novaVagaDe && (
        <DialogoNovaVaga
          requisicao={novaVagaDe}
          aoFechar={() => setNovaVagaDe(null)}
          aoCriar={(vagaId) => {
            setNovaVagaDe(null);
            recarregar();
            abrirKanban(vagaId);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ tempo por etapa (mediana)

function QuadroTempos() {
  const [linhas, setLinhas] = useState<TempoEtapa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/recrutamento/relatorio-etapas");
        const corpo = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setLinhas((corpo.linhas ?? []) as TempoEtapa[]);
        } else {
          setErro(corpo.erro ?? "Não foi possível carregar o relatório.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  if (erro) {
    return (
      <section className={estilos.area}>
        <p className={estilos.erro}>{erro}</p>
      </section>
    );
  }
  if (linhas === null) {
    return (
      <section className={estilos.area}>
        <p className={estilos.vazio}>Carregando…</p>
      </section>
    );
  }
  if (linhas.length === 0) {
    return (
      <section className={estilos.area}>
        <p className={estilos.vazio}>
          Ainda não há movimentações fechadas para medir — o quadro nasce com o
          primeiro avanço de candidato.
        </p>
      </section>
    );
  }

  // Agrupa por CARGO_ID (a identidade estável — nunca o título livre da vaga
  // nem o nome da versão: cargos homônimos não se fundem, e renomear não
  // parte o histórico). O nome é só exibição.
  const porCargo = new Map<number, TempoEtapa[]>();
  for (const linha of linhas) {
    const grupo = porCargo.get(linha.cargo_id) ?? [];
    grupo.push(linha);
    porCargo.set(linha.cargo_id, grupo);
  }

  return (
    <section className={estilos.area}>
      <p className={comum.meta}>
        Mediana do tempo que a candidatura passa em cada etapa do catálogo, por
        cargo — candidaturas abertas e encerradas contam com seus intervalos já
        fechados; a etapa onde alguém ainda está parado não entra até fechar.
      </p>
      {[...porCargo.entries()].map(([cargoId, etapas]) => (
        <article className={comum.cartao} key={cargoId}>
          <div className={comum.topo}>
            <span className={comum.nome}>{etapas[0].cargo_nome}</span>
          </div>
          {etapas.map((etapa) => (
            <div
              key={etapa.etapa_nome}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "4px 0",
                flexWrap: "wrap",
              }}
            >
              <span>{etapa.etapa_nome}</span>
              <span>
                <b>{formatarDuracaoDias(etapa.mediana_dias)}</b>{" "}
                <span className={comum.dica}>
                  (mediana de {etapa.amostras} passagem
                  {etapa.amostras > 1 ? "s" : ""})
                </span>
              </span>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ cartões

function CartaoRequisicao({
  requisicao,
  podeDecidir,
  podeGerir,
  aoDecidir,
  aoCriarVaga,
  aoAbrirVaga,
}: {
  requisicao: Requisicao;
  podeDecidir: boolean;
  podeGerir: boolean;
  aoDecidir: (acao: "aprovar" | "reprovar") => void;
  aoCriarVaga: () => void;
  aoAbrirVaga: (vagaId: number) => void;
}) {
  return (
    <article className={comum.cartao}>
      <div className={comum.topo}>
        <span className={comum.nome}>{requisicao.cargo_nome}</span>
        <span className={`${comum.badge} ${comum.badgeNeutro}`}>
          {ROTULOS_MOTIVO_REQUISICAO[requisicao.motivo]}
        </span>
        <span
          className={`${comum.badge} ${BADGE_REQUISICAO[requisicao.status]}`}
        >
          {ROTULOS_STATUS_REQUISICAO[requisicao.status]}
        </span>
        {requisicao.unidade && (
          <span className={`${comum.badge} ${comum.badgeNeutro}`}>
            {requisicao.unidade}
          </span>
        )}
      </div>
      <p className={comum.meta}>
        Solicitada por {requisicao.solicitante_nome}
        {requisicao.decisor_nome &&
          ` · decidida por ${requisicao.decisor_nome}`}
      </p>
      <p className={comum.texto}>{requisicao.justificativa}</p>
      {requisicao.motivo_decisao && (
        <p className={comum.meta}>
          Motivo da decisão: {requisicao.motivo_decisao}
        </p>
      )}
      <div className={comum.acoes}>
        {podeDecidir && requisicao.status === "solicitada" && (
          <>
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={() => aoDecidir("aprovar")}
            >
              Aprovar
            </button>
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={() => aoDecidir("reprovar")}
            >
              Reprovar
            </button>
          </>
        )}
        {podeGerir &&
          requisicao.status === "aprovada" &&
          requisicao.vaga_id === null && (
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={aoCriarVaga}
            >
              Criar vaga
            </button>
          )}
        {requisicao.vaga_id !== null && (
          <button
            className={comum.ligacaoLeve}
            type="button"
            onClick={() => aoAbrirVaga(requisicao.vaga_id as number)}
          >
            Abrir kanban da vaga →
          </button>
        )}
      </div>
    </article>
  );
}

function CartaoVaga({
  vaga,
  aoAbrirKanban,
}: {
  vaga: Vaga;
  aoAbrirKanban: () => void;
}) {
  return (
    <article className={comum.cartao}>
      <div className={comum.topo}>
        <span className={comum.nome}>{vaga.titulo}</span>
        <span className={`${comum.badge} ${BADGE_VAGA[vaga.status]}`}>
          {ROTULOS_STATUS_VAGA[vaga.status]}
        </span>
        {vaga.unidade && (
          <span className={`${comum.badge} ${comum.badgeNeutro}`}>
            {vaga.unidade}
          </span>
        )}
      </div>
      <p className={comum.meta}>
        Cargo: {vaga.cargo_nome} · faixa congelada{" "}
        {formatarSalario(vaga.faixa_min)} a {formatarSalario(vaga.faixa_max)}
      </p>
      <p className={comum.meta}>
        {vaga.candidaturas_ativas} candidatura(s) em seleção · prazo-alvo{" "}
        {formatarData(vaga.prazo_alvo)}
        {vaga.status === "aberta" && ` (${textoPrazo(vaga.dias_ate_prazo)})`}
      </p>
      <div className={comum.acoes}>
        <button
          className={comum.ligacaoLeve}
          type="button"
          onClick={aoAbrirKanban}
        >
          Abrir kanban →
        </button>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ diálogos

function DialogoNovaRequisicao({
  painel,
  aoFechar,
  aoCriar,
}: {
  painel: Painel;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const cargos = painel.cargos ?? [];
  const estabelecimentos = painel.estabelecimentos ?? [];
  // Cargo e motivo nascem VAZIOS. cargos[0] era o primeiro da consulta e
  // "reposicao" o primeiro do catálogo — reposição e aumento de quadro têm
  // impacto de orçamento e alçada diferentes, e quem aprova lê esse campo
  // como afirmação de quem pediu.
  const [cargoId, setCargoId] = useState("");
  const [estabelecimentoId, setEstabelecimentoId] = useState("");
  const [motivo, setMotivo] = useState<MotivoRequisicao | "">("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cargo = cargos.find((c) => String(c.cargo_id) === cargoId);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/recrutamento/requisicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cargo_id: Number(cargoId),
          estabelecimento_id: estabelecimentoId
            ? Number(estabelecimentoId)
            : null,
          motivo,
          justificativa,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        aoCriar();
      } else {
        setErro(dados.erro ?? "Não foi possível criar a requisição.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={comum.fundoDialogo}>
      <div className={comum.dialogo} role="dialog" aria-modal="true">
        <h3>Nova requisição de vaga</h3>
        <p className={comum.subDialogo}>
          A requisição vai para decisão registrada (aprovar/reprovar). A vaga
          só nasce de requisição aprovada.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="req-cargo">
            Cargo (versão vigente)
          </label>
          <select
            className={comum.campo}
            id="req-cargo"
            required
            value={cargoId}
            onChange={(e) => setCargoId(e.target.value)}
          >
            <option value="">Escolha o cargo…</option>
            {cargos.map((c) => (
              <option key={c.cargo_id} value={String(c.cargo_id)}>
                {c.nome}
              </option>
            ))}
          </select>
          {cargo && cargo.faixa_min !== null && cargo.faixa_max !== null ? (
            <p className={comum.dica}>
              Faixa salarial de referência (tabela vigente):{" "}
              {formatarSalario(cargo.faixa_min)} a{" "}
              {formatarSalario(cargo.faixa_max)}
            </p>
          ) : (
            <p className={comum.dica}>
              Este cargo não tem faixa salarial vigente — sem faixa, a vaga não
              poderá ser criada.
            </p>
          )}

          <label className={comum.rotuloCampo} htmlFor="req-unidade">
            Unidade (opcional)
          </label>
          <select
            className={comum.campo}
            id="req-unidade"
            value={estabelecimentoId}
            onChange={(e) => setEstabelecimentoId(e.target.value)}
          >
            <option value="">— Sem unidade definida —</option>
            {estabelecimentos.map((e) => (
              <option
                key={e.estabelecimento_versao_id}
                value={String(e.estabelecimento_versao_id)}
              >
                {e.unidade}
              </option>
            ))}
          </select>

          <label className={comum.rotuloCampo} htmlFor="req-motivo">
            Motivo
          </label>
          <select
            className={comum.campo}
            id="req-motivo"
            required
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoRequisicao | "")}
          >
            <option value="">Escolha o motivo…</option>
            {MOTIVOS_REQUISICAO.map((m) => (
              <option key={m} value={m}>
                {ROTULOS_MOTIVO_REQUISICAO[m]}
              </option>
            ))}
          </select>

          <label className={comum.rotuloCampo} htmlFor="req-justificativa">
            Justificativa
          </label>
          <textarea
            className={`${comum.campo} ${comum.campoTexto}`}
            id="req-justificativa"
            required
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />

          {erro && <p className={comum.erroAcao}>{erro}</p>}
          <div className={comum.acoesDialogo}>
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={aoFechar}
            >
              Cancelar
            </button>
            <button
              className={comum.botaoPrimario}
              type="submit"
              disabled={enviando || !cargoId || motivo === ""}
            >
              {enviando ? "Enviando…" : "Solicitar vaga"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoDecisao({
  requisicao,
  acao,
  aoFechar,
  aoConcluir,
}: {
  requisicao: Requisicao;
  acao: "aprovar" | "reprovar";
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/recrutamento/requisicoes/${requisicao.id}/decidir`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisao: acao, motivo }),
        }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        aoConcluir();
      } else {
        setErro(dados.erro ?? "Não foi possível registrar a decisão.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={comum.fundoDialogo}>
      <div className={comum.dialogo} role="dialog" aria-modal="true">
        <h3>
          {acao === "aprovar" ? "Aprovar" : "Reprovar"} requisição —{" "}
          {requisicao.cargo_nome}
        </h3>
        <p className={comum.subDialogo}>
          A decisão é única e fica registrada com decisor, data e motivo.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="decisao-motivo">
            Motivo da decisão
          </label>
          <textarea
            className={`${comum.campo} ${comum.campoTexto}`}
            id="decisao-motivo"
            required
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {erro && <p className={comum.erroAcao}>{erro}</p>}
          <div className={comum.acoesDialogo}>
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={aoFechar}
            >
              Cancelar
            </button>
            <button
              className={comum.botaoPrimario}
              type="submit"
              disabled={enviando}
            >
              {enviando
                ? "Registrando…"
                : acao === "aprovar"
                  ? "Aprovar"
                  : "Reprovar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoNovaVaga({
  requisicao,
  aoFechar,
  aoCriar,
}: {
  requisicao: Requisicao;
  aoFechar: () => void;
  aoCriar: (vagaId: number) => void;
}) {
  const [titulo, setTitulo] = useState(requisicao.cargo_nome);
  const [prazoAlvo, setPrazoAlvo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modelos, setModelos] = useState<ModeloResumo[]>([]);
  const [modeloId, setModeloId] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/recrutamento/modelos");
        if (!resposta.ok) return;
        const corpo = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        const lista: ModeloResumo[] = corpo.modelos ?? [];
        setModelos(lista);
        // GERAL pré-selecionado (decisão 13a); sem picker cai nele no servidor.
        const padrao = lista.find((m) => m.padrao) ?? lista[0];
        if (padrao) setModeloId(padrao.id);
      } catch {
        // Sem lista: a vaga usa o GERAL (padrão) — o servidor resolve.
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/recrutamento/vagas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisicao_id: requisicao.id,
          titulo,
          prazo_alvo: prazoAlvo,
          modelo_versao_id: modeloId ?? undefined,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        aoCriar(Number(dados.id));
      } else {
        setErro(dados.erro ?? "Não foi possível criar a vaga.");
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={comum.fundoDialogo}>
      <div className={comum.dialogo} role="dialog" aria-modal="true">
        <h3>Criar vaga — {requisicao.cargo_nome}</h3>
        <p className={comum.subDialogo}>
          A faixa salarial da tabela vigente do cargo é <b>congelada</b> na
          vaga; o prazo-alvo alimenta o indicador de vagas no prazo.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="vaga-titulo">
            Título da vaga
          </label>
          <input
            className={comum.campo}
            id="vaga-titulo"
            required
            maxLength={200}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <label className={comum.rotuloCampo} htmlFor="vaga-prazo">
            Prazo-alvo de fechamento
          </label>
          <input
            className={comum.campo}
            id="vaga-prazo"
            type="date"
            required
            value={prazoAlvo}
            onChange={(e) => setPrazoAlvo(e.target.value)}
          />
          {modelos.length > 1 && (
            <>
              <label className={comum.rotuloCampo} htmlFor="vaga-modelo">
                Modelo de processo seletivo
              </label>
              <select
                className={comum.campo}
                id="vaga-modelo"
                value={modeloId ?? ""}
                onChange={(e) => setModeloId(Number(e.target.value))}
              >
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {m.padrao ? " (GERAL — padrão)" : ""}
                  </option>
                ))}
              </select>
            </>
          )}
          {erro && <p className={comum.erroAcao}>{erro}</p>}
          <div className={comum.acoesDialogo}>
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={aoFechar}
            >
              Cancelar
            </button>
            <button
              className={comum.botaoPrimario}
              type="submit"
              disabled={enviando}
            >
              {enviando ? "Criando…" : "Criar vaga"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
