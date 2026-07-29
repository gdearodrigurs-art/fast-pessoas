"use client";

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
import comum from "./comum.module.css";
import { formatarData, formatarSalario, textoPrazo } from "./formato";
import { KanbanVaga } from "./kanban-vaga";
import estilos from "./page.module.css";
import { Painel, Requisicao, Vaga } from "./tipos";

type Aba = "requisicoes" | "vagas" | "kanban";

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
  const [cargoId, setCargoId] = useState(
    cargos[0] ? String(cargos[0].cargo_id) : ""
  );
  const [estabelecimentoId, setEstabelecimentoId] = useState("");
  const [motivo, setMotivo] = useState<MotivoRequisicao>("reposicao");
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
            value={cargoId}
            onChange={(e) => setCargoId(e.target.value)}
          >
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
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoRequisicao)}
          >
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
              disabled={enviando || !cargoId}
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
