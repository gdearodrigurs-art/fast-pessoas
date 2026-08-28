"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ROTULOS_VINCULO,
  TIPOS_VINCULO,
  TipoVinculo,
} from "@/dominios/colaboradores/esquemas";
import {
  MESES_CONSENTIMENTO_PADRAO,
  MOTIVOS_MOVIMENTACAO,
  MotivoMovimentacao,
  ORIGENS_CANDIDATO,
  OrigemCandidato,
  RECOMENDACOES_PARECER,
  RecomendacaoParecer,
  RESULTADOS_PESQUISA_SOCIAL,
  ResultadoPesquisaSocial,
  ROTULOS_MOTIVO_MOVIMENTACAO,
  ROTULOS_ORIGEM,
  ROTULOS_RECOMENDACAO,
  ROTULOS_RESULTADO_PESQUISA_SOCIAL,
  ROTULOS_STATUS_CANDIDATURA,
  ROTULOS_STATUS_OFERTA,
  ROTULOS_STATUS_VAGA,
} from "@/dominios/recrutamento/esquemas";
import type { ModeloResumo } from "@/dominios/recrutamento/repositorio";
import comum from "./comum.module.css";
import {
  formatarData,
  formatarDataHora,
  formatarSalario,
  textoPrazo,
} from "./formato";
import estilos from "./page.module.css";
import {
  Candidato,
  CandidaturaCartao,
  Kanban,
  Parecer,
  Permissoes,
  Vaga,
} from "./tipos";

interface Alvo {
  candidatura: CandidaturaCartao;
}

export function KanbanVaga({
  vagaId,
  pode,
  candidatos,
  aoMudar,
}: {
  vagaId: number;
  pode: Permissoes;
  /** Catálogo de candidatos — presente só para quem gere (rs.gerir). */
  candidatos: Candidato[] | null;
  /** Recarrega o painel (contagens de vagas/candidaturas) após mutações. */
  aoMudar: () => void;
}) {
  const [kanban, setKanban] = useState<Kanban | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [dialogoNovoCandidato, setDialogoNovoCandidato] = useState(false);
  const [dialogoAdicionar, setDialogoAdicionar] = useState(false);
  const [reprovacao, setReprovacao] = useState<Alvo | null>(null);
  const [oferta, setOferta] = useState<Alvo | null>(null);
  const [resposta, setResposta] = useState<
    (Alvo & { resposta: "aceita" | "recusada" }) | null
  >(null);
  const [admissao, setAdmissao] = useState<Alvo | null>(null);
  const [pesquisaSocial, setPesquisaSocial] = useState<Alvo | null>(null);
  const [dialogoTrocarModelo, setDialogoTrocarModelo] = useState(false);
  const [senha, setSenha] = useState<{
    candidato_nome: string;
    senha_temporaria: string;
  } | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [avancando, setAvancando] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const respostaHttp = await fetch(`/api/recrutamento/vagas/${vagaId}`);
        const dados = await respostaHttp.json().catch(() => ({}));
        if (!ativo) return;
        if (respostaHttp.ok) {
          setKanban(dados as Kanban);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar o kanban.");
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
  }, [vagaId, versao]);

  function recarregar() {
    setVersao((atual) => atual + 1);
    aoMudar();
  }

  async function avancar(candidatura: CandidaturaCartao) {
    setAvancando(candidatura.id);
    setErroAcao(null);
    try {
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/movimentar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "avancar" }),
        }
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        recarregar();
      } else {
        setErroAcao(dados.erro ?? "Não foi possível avançar o candidato.");
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setAvancando(null);
    }
  }

  if (carregando && !kanban) {
    return <p className={estilos.vazio}>Carregando kanban…</p>;
  }
  if (erro && !kanban) {
    return <p className={estilos.erro}>{erro}</p>;
  }
  if (!kanban) return null;

  const vagaAberta = kanban.vaga.status === "aberta";
  const ultimaOrdem = kanban.etapas.reduce(
    (maior, etapa) => Math.max(maior, etapa.ordem),
    0
  );
  const idsNasEtapas = new Set(kanban.etapas.map((etapa) => etapa.id));
  const foraDasEtapas = kanban.candidaturas.filter(
    (candidatura) => !idsNasEtapas.has(candidatura.etapa_atual_id)
  );
  const candidatosDisponiveis = (candidatos ?? []).filter(
    (candidato) =>
      !kanban.candidaturas.some((c) => c.candidato_id === candidato.id)
  );

  function renderCartao(
    candidatura: CandidaturaCartao,
    etapaTipo: string | null,
    ehUltima: boolean
  ) {
    return (
      <CartaoCandidatura
        key={candidatura.id}
        candidatura={candidatura}
        etapaTipo={etapaTipo}
        pode={pode}
        vagaAberta={vagaAberta}
        ehUltima={ehUltima}
        avancando={avancando === candidatura.id}
        aoAvancar={() => avancar(candidatura)}
        aoReprovar={() => setReprovacao({ candidatura })}
        aoOferta={() => setOferta({ candidatura })}
        aoResponder={(r) => setResposta({ candidatura, resposta: r })}
        aoIniciarAdmissao={() => setAdmissao({ candidatura })}
        aoPesquisaSocial={() => setPesquisaSocial({ candidatura })}
      />
    );
  }

  return (
    <section className={estilos.area}>
      <div className={estilos.cabecalhoKanban}>
        <div>
          <h2 className={estilos.tituloKanban}>
            {kanban.vaga.titulo}{" "}
            <span className={`${comum.badge} ${comum.badgeNeutro}`}>
              {ROTULOS_STATUS_VAGA[kanban.vaga.status]}
            </span>
          </h2>
          <p className={comum.meta}>
            Banda congelada {formatarSalario(kanban.vaga.faixa_min)} a{" "}
            {formatarSalario(kanban.vaga.faixa_max)} · prazo-alvo{" "}
            {formatarData(kanban.vaga.prazo_alvo)}
            {vagaAberta && ` (${textoPrazo(kanban.vaga.dias_ate_prazo)})`} ·
            modelo {kanban.vaga.modelo_nome}
          </p>
        </div>
        {pode.gerir && (
          <div className={comum.acoes}>
            {vagaAberta && kanban.candidaturas.length === 0 && (
              <button
                className={comum.botaoSecundario}
                type="button"
                onClick={() => setDialogoTrocarModelo(true)}
              >
                Trocar modelo
              </button>
            )}
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={() => setDialogoAdicionar(true)}
              disabled={!vagaAberta || candidatosDisponiveis.length === 0}
            >
              + Adicionar candidato
            </button>
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={() => setDialogoNovoCandidato(true)}
              disabled={!vagaAberta}
            >
              + Novo candidato
            </button>
          </div>
        )}
      </div>

      {erroAcao && <p className={estilos.erro}>{erroAcao}</p>}
      {erro && <p className={estilos.erro}>{erro}</p>}

      <div className={estilos.quadro}>
        {kanban.etapas.map((etapa) => {
          const daColuna = kanban.candidaturas.filter(
            (candidatura) => candidatura.etapa_atual_id === etapa.id
          );
          return (
            <div className={estilos.coluna} key={etapa.id}>
              <h3 className={estilos.tituloColuna}>
                <span>{etapa.nome}</span>
                <span>{daColuna.length}</span>
              </h3>
              {daColuna.length === 0 ? (
                <p className={estilos.vazioColuna}>Ninguém nesta etapa.</p>
              ) : (
                daColuna.map((candidatura) =>
                  renderCartao(candidatura, etapa.tipo, etapa.ordem >= ultimaOrdem)
                )
              )}
            </div>
          );
        })}
        {foraDasEtapas.length > 0 && (
          <div className={estilos.coluna}>
            <h3 className={estilos.tituloColuna}>
              <span>Etapas encerradas</span>
              <span>{foraDasEtapas.length}</span>
            </h3>
            {foraDasEtapas.map((candidatura) =>
              renderCartao(candidatura, null, false)
            )}
          </div>
        )}
      </div>

      {dialogoTrocarModelo && (
        <DialogoTrocarModelo
          vaga={kanban.vaga}
          aoFechar={() => setDialogoTrocarModelo(false)}
          aoConcluir={() => {
            setDialogoTrocarModelo(false);
            recarregar();
          }}
        />
      )}

      {dialogoNovoCandidato && (
        <DialogoNovoCandidato
          vagaId={vagaId}
          aoFechar={() => setDialogoNovoCandidato(false)}
          aoConcluir={() => {
            setDialogoNovoCandidato(false);
            recarregar();
          }}
        />
      )}

      {dialogoAdicionar && (
        <DialogoAdicionarCandidato
          vagaId={vagaId}
          candidatos={candidatosDisponiveis}
          aoFechar={() => setDialogoAdicionar(false)}
          aoConcluir={() => {
            setDialogoAdicionar(false);
            recarregar();
          }}
        />
      )}

      {reprovacao && (
        <DialogoReprovacao
          candidatura={reprovacao.candidatura}
          aoFechar={() => setReprovacao(null)}
          aoConcluir={() => {
            setReprovacao(null);
            recarregar();
          }}
        />
      )}

      {oferta && (
        <DialogoOferta
          candidatura={oferta.candidatura}
          faixaMin={kanban.vaga.faixa_min}
          faixaMax={kanban.vaga.faixa_max}
          aoFechar={() => setOferta(null)}
          aoConcluir={() => {
            setOferta(null);
            recarregar();
          }}
        />
      )}

      {resposta && (
        <DialogoRespostaOferta
          candidatura={resposta.candidatura}
          resposta={resposta.resposta}
          aoFechar={() => setResposta(null)}
          aoConcluir={() => {
            setResposta(null);
            recarregar();
          }}
        />
      )}

      {pesquisaSocial && (
        <DialogoPesquisaSocial
          candidatura={pesquisaSocial.candidatura}
          aoFechar={() => setPesquisaSocial(null)}
          aoConcluir={() => {
            setPesquisaSocial(null);
            recarregar();
          }}
        />
      )}

      {admissao && (
        <DialogoIniciarAdmissao
          candidatura={admissao.candidatura}
          aoFechar={() => setAdmissao(null)}
          aoConcluir={(senhaTemporaria) => {
            const nome = admissao.candidatura.candidato_nome;
            setAdmissao(null);
            setSenha({
              candidato_nome: nome,
              senha_temporaria: senhaTemporaria,
            });
            recarregar();
          }}
        />
      )}

      {senha && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Admissão iniciada — {senha.candidato_nome}</h3>
            <p className={comum.subDialogo}>
              Colaborador e usuário criados e processo de admissão aberto na
              mesma transação. Entregue a senha temporária ao admitido — ela
              não será exibida de novo.
            </p>
            <div className={comum.senhaGerada}>{senha.senha_temporaria}</div>
            <p className={comum.dica}>
              O checklist da admissão segue no módulo Admissões.
            </p>
            <div className={comum.acoesDialogo}>
              <button
                className={comum.botaoPrimario}
                type="button"
                onClick={() => setSenha(null)}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ cartão do candidato

function CartaoCandidatura({
  candidatura,
  etapaTipo,
  pode,
  vagaAberta,
  ehUltima,
  avancando,
  aoAvancar,
  aoReprovar,
  aoOferta,
  aoResponder,
  aoIniciarAdmissao,
  aoPesquisaSocial,
}: {
  candidatura: CandidaturaCartao;
  etapaTipo: string | null;
  pode: Permissoes;
  vagaAberta: boolean;
  ehUltima: boolean;
  avancando: boolean;
  aoAvancar: () => void;
  aoReprovar: () => void;
  aoOferta: () => void;
  aoResponder: (resposta: "aceita" | "recusada") => void;
  aoIniciarAdmissao: () => void;
  aoPesquisaSocial: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pareceres, setPareceres] = useState<Parecer[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Nasce VAZIA e volta ao vazio a cada envio: a recomendação é a opinião do
  // entrevistador sobre uma pessoa, não estado de UI que se herda do parecer
  // anterior.
  const [recomendacao, setRecomendacao] = useState<RecomendacaoParecer | "">("");
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);

  const ativa = candidatura.status === "ativa";
  const podePareceres = pode.parecer_ver || pode.parecer_registrar;

  async function carregarPareceres() {
    setCarregando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/pareceres`
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        setPareceres((dados as { pareceres: Parecer[] }).pareceres);
      } else {
        setErro(dados.erro ?? "Não foi possível carregar os pareceres.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  function alternarPareceres() {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo && pareceres === null) {
      void carregarPareceres();
    }
  }

  async function enviarParecer(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/pareceres`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recomendacao, observacoes }),
        }
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        setRecomendacao("");
        setObservacoes("");
        await carregarPareceres();
      } else {
        setErro(dados.erro ?? "Não foi possível registrar o parecer.");
      }
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article
      className={`${estilos.cartaoCandidato} ${ativa ? "" : estilos.cartaoEncerrado}`}
    >
      <div className={estilos.nomeCandidato}>{candidatura.candidato_nome}</div>
      {(candidatura.candidato_email || candidatura.candidato_telefone) && (
        <div className={estilos.contato}>
          {[candidatura.candidato_email, candidatura.candidato_telefone]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}

      <div className={comum.acoes}>
        {candidatura.status !== "ativa" && (
          <span
            className={`${comum.badge} ${
              candidatura.status === "aprovada"
                ? comum.badgeSuccess
                : candidatura.status === "reprovada"
                  ? comum.badgeDanger
                  : comum.badgeNeutro
            }`}
          >
            {ROTULOS_STATUS_CANDIDATURA[candidatura.status]}
            {candidatura.motivo_desfecho &&
              candidatura.status !== "aprovada" &&
              ` — ${ROTULOS_MOTIVO_MOVIMENTACAO[candidatura.motivo_desfecho]}`}
          </span>
        )}
        {candidatura.oferta_status && (
          <span
            className={`${comum.badge} ${
              candidatura.oferta_status === "aceita"
                ? comum.badgeSuccess
                : candidatura.oferta_status === "recusada"
                  ? comum.badgeDanger
                  : comum.badgeInfo
            }`}
          >
            Oferta {ROTULOS_STATUS_OFERTA[candidatura.oferta_status].toLowerCase()}
            {candidatura.oferta_valor !== null &&
              ` — ${formatarSalario(candidatura.oferta_valor)}`}
            {candidatura.oferta_dentro_banda === false && " (fora da banda)"}
          </span>
        )}
        {/* Desfecho da pesquisa social — o serviço só o envia a rs.gerir (G3:a). */}
        {candidatura.pesquisa_social_resultado && (
          <span
            className={`${comum.badge} ${
              candidatura.pesquisa_social_resultado === "aprovado"
                ? comum.badgeSuccess
                : comum.badgeDanger
            }`}
          >
            {ROTULOS_RESULTADO_PESQUISA_SOCIAL[
              candidatura.pesquisa_social_resultado
            ]}
            {candidatura.pesquisa_social_tem_anexo && (
              <>
                {" — "}
                <a
                  href={`/api/recrutamento/candidaturas/${candidatura.id}/pesquisa-social/anexo`}
                >
                  anexo
                </a>
              </>
            )}
          </span>
        )}
      </div>

      {pode.gerir && ativa && vagaAberta && (
        <div className={comum.acoes}>
          {/* Na etapa de pesquisa social, avançar só com desfecho APROVADO —
              o mesmo gate que o serviço impõe (bloqueioDeAvancoPesquisaSocial). */}
          {!ehUltima &&
            (etapaTipo !== "pesquisa_social" ||
              candidatura.pesquisa_social_resultado === "aprovado") && (
            <button
              className={comum.botaoMiudo}
              type="button"
              onClick={aoAvancar}
              disabled={avancando}
            >
              {avancando ? "Avançando…" : "Avançar →"}
            </button>
          )}
          {etapaTipo === "pesquisa_social" &&
            !candidatura.pesquisa_social_resultado && (
              <button
                className={comum.botaoMiudo}
                type="button"
                onClick={aoPesquisaSocial}
              >
                Registrar pesquisa social
              </button>
            )}
          {etapaTipo === "oferta" && !candidatura.oferta_status && (
            <button
              className={comum.botaoMiudo}
              type="button"
              onClick={aoOferta}
            >
              Registrar oferta
            </button>
          )}
          {candidatura.oferta_status === "enviada" && (
            <>
              <button
                className={comum.botaoMiudo}
                type="button"
                onClick={() => aoResponder("aceita")}
              >
                Oferta aceita
              </button>
              <button
                className={comum.botaoMiudo}
                type="button"
                onClick={() => aoResponder("recusada")}
              >
                Oferta recusada
              </button>
            </>
          )}
          <button
            className={comum.botaoMiudo}
            type="button"
            onClick={aoReprovar}
          >
            Reprovar
          </button>
        </div>
      )}

      {pode.gerir &&
        candidatura.status === "aprovada" &&
        candidatura.oferta_status === "aceita" && (
          <div className={comum.acoes}>
            <button
              className={comum.botaoPrimario}
              type="button"
              onClick={aoIniciarAdmissao}
            >
              Iniciar admissão
            </button>
          </div>
        )}

      {podePareceres && (
        <div className={estilos.blocoPareceres}>
          <button
            className={comum.ligacaoLeve}
            type="button"
            onClick={alternarPareceres}
          >
            {aberto
              ? "Ocultar pareceres"
              : `Pareceres${
                  pode.parecer_ver && candidatura.total_pareceres > 0
                    ? ` (${candidatura.total_pareceres})`
                    : ""
                }`}
          </button>
          {aberto && (
            <>
              {carregando && <p className={comum.dica}>Carregando…</p>}
              {pareceres !== null && pareceres.length === 0 && (
                <p className={comum.dica}>
                  {pode.parecer_ver
                    ? "Nenhum parecer registrado."
                    : "Você ainda não registrou parecer aqui."}
                </p>
              )}
              {pareceres?.map((parecer) => (
                <div className={estilos.parecer} key={parecer.id}>
                  <div className={estilos.parecerTopo}>
                    <b>{parecer.avaliador_nome}</b>
                    <span className={`${comum.badge} ${comum.badgeNeutro}`}>
                      {ROTULOS_RECOMENDACAO[parecer.recomendacao]}
                    </span>
                    <span className={comum.dica}>
                      {parecer.etapa_nome} · {formatarDataHora(parecer.em)}
                    </span>
                  </div>
                  {parecer.observacoes}
                </div>
              ))}
              {pode.parecer_registrar && ativa && (
                <form className={estilos.formParecer} onSubmit={enviarParecer}>
                  <select
                    className={comum.campo}
                    aria-label="Recomendação"
                    required
                    value={recomendacao}
                    onChange={(e) =>
                      setRecomendacao(e.target.value as RecomendacaoParecer | "")
                    }
                  >
                    <option value="" disabled>
                      Escolha a recomendação…
                    </option>
                    {RECOMENDACOES_PARECER.map((r) => (
                      <option key={r} value={r}>
                        {ROTULOS_RECOMENDACAO[r]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className={`${comum.campo} ${comum.campoTexto}`}
                    aria-label="Observações do parecer"
                    placeholder="Parecer da etapa atual (restrito — nunca vai para a ficha do colaborador)"
                    required
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                  />
                  <button
                    className={comum.botaoMiudo}
                    type="submit"
                    disabled={enviando || recomendacao === ""}
                  >
                    {enviando ? "Registrando…" : "Registrar parecer"}
                  </button>
                </form>
              )}
              {erro && <p className={comum.erroAcao}>{erro}</p>}
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ------------------------------------------------------------------ diálogos

function DialogoTrocarModelo({
  vaga,
  aoFechar,
  aoConcluir,
}: {
  vaga: Vaga;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [modelos, setModelos] = useState<ModeloResumo[] | null>(null);
  const [modeloId, setModeloId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/recrutamento/modelos");
        const corpo = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setModelos((corpo.modelos ?? []) as ModeloResumo[]);
        } else {
          setErro(corpo.erro ?? "Não foi possível carregar os modelos.");
        }
      } catch {
        if (ativo) setErro("Falha de conexão. Tente novamente.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const opcoes = (modelos ?? []).filter((m) => m.id !== vaga.modelo_versao_id);
  const escolhido = opcoes.find((m) => String(m.id) === modeloId);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/recrutamento/vagas/${vaga.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo_versao_id: Number(modeloId) }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        aoConcluir();
      } else {
        setErro(dados.erro ?? "Não foi possível trocar o modelo.");
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
        <h3>Trocar modelo — {vaga.titulo}</h3>
        <p className={comum.subDialogo}>
          A vaga corre hoje pelo modelo <b>{vaga.modelo_nome}</b>. A troca só
          vale enquanto a vaga não tem candidatura: assim que alguém entra no
          pipeline, o modelo congela de vez.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="troca-modelo">
            Novo modelo de processo
          </label>
          <select
            className={comum.campo}
            id="troca-modelo"
            required
            value={modeloId}
            onChange={(e) => setModeloId(e.target.value)}
          >
            <option value="" disabled>
              {modelos === null
                ? "Carregando modelos…"
                : opcoes.length === 0
                  ? "Nenhum outro modelo ativo"
                  : "Escolha o modelo…"}
            </option>
            {opcoes.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.nome}
                {m.padrao ? " (GERAL — padrão)" : ""}
              </option>
            ))}
          </select>
          {escolhido && (
            <p className={comum.dica}>
              {escolhido.etapas.map((e) => e.nome).join(" → ")}
            </p>
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
              disabled={enviando || modeloId === ""}
            >
              {enviando ? "Trocando…" : "Trocar modelo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoNovoCandidato({
  vagaId,
  aoFechar,
  aoConcluir,
}: {
  vagaId: number;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [origem, setOrigem] = useState<OrigemCandidato>("indicacao");
  const [consentimento, setConsentimento] = useState(false);
  const [consentidoAte, setConsentidoAte] = useState("");
  const [candidatar, setCandidatar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch("/api/recrutamento/candidatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          email,
          telefone: telefone || undefined,
          cpf: cpf || undefined,
          origem,
          consentimento_lgpd: consentimento,
          consentido_ate: consentidoAte || undefined,
        }),
      });
      const dados = await respostaHttp.json().catch(() => ({}));
      if (!respostaHttp.ok) {
        setErro(dados.erro ?? "Não foi possível cadastrar o candidato.");
        return;
      }
      if (candidatar) {
        const respostaCandidatura = await fetch(
          "/api/recrutamento/candidaturas",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vaga_id: vagaId,
              candidato_id: Number(dados.id),
            }),
          }
        );
        const dadosCandidatura = await respostaCandidatura
          .json()
          .catch(() => ({}));
        if (!respostaCandidatura.ok) {
          setErro(
            dadosCandidatura.erro ??
              "Candidato criado, mas a candidatura falhou — use “Adicionar candidato”."
          );
          return;
        }
      }
      aoConcluir();
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={comum.fundoDialogo}>
      <div className={comum.dialogo} role="dialog" aria-modal="true">
        <h3>Novo candidato</h3>
        <p className={comum.subDialogo}>
          Cadastro mínimo do titular externo — sem documentos além do
          necessário à seleção. O consentimento LGPD registrado é obrigatório
          no cadastro manual.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="cand-nome">
            Nome
          </label>
          <input
            className={comum.campo}
            id="cand-nome"
            required
            minLength={3}
            maxLength={200}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <label className={comum.rotuloCampo} htmlFor="cand-email">
            E-mail
          </label>
          <input
            className={comum.campo}
            id="cand-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className={comum.rotuloCampo} htmlFor="cand-telefone">
            Telefone (opcional)
          </label>
          <input
            className={comum.campo}
            id="cand-telefone"
            maxLength={20}
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
          <label className={comum.rotuloCampo} htmlFor="cand-cpf">
            CPF (opcional — chave de deduplicação)
          </label>
          <input
            className={comum.campo}
            id="cand-cpf"
            maxLength={14}
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
          <label className={comum.rotuloCampo} htmlFor="cand-origem">
            Origem
          </label>
          <select
            className={comum.campo}
            id="cand-origem"
            value={origem}
            onChange={(e) => setOrigem(e.target.value as OrigemCandidato)}
          >
            {ORIGENS_CANDIDATO.map((o) => (
              <option key={o} value={o}>
                {ROTULOS_ORIGEM[o]}
              </option>
            ))}
          </select>
          <label className={comum.rotuloCampo} htmlFor="cand-consentido-ate">
            Consentimento válido até (opcional)
          </label>
          <input
            className={comum.campo}
            id="cand-consentido-ate"
            type="date"
            value={consentidoAte}
            onChange={(e) => setConsentidoAte(e.target.value)}
          />
          <p className={comum.dica}>
            Sem data, vale a retenção padrão: hoje +{" "}
            {MESES_CONSENTIMENTO_PADRAO} meses.
          </p>
          <label className={comum.linhaMarcacao} htmlFor="cand-consentimento">
            <input
              id="cand-consentimento"
              type="checkbox"
              required
              checked={consentimento}
              onChange={(e) => setConsentimento(e.target.checked)}
            />
            O candidato consentiu com o tratamento dos dados para seleção
            (LGPD)
          </label>
          <label className={comum.linhaMarcacao} htmlFor="cand-candidatar">
            <input
              id="cand-candidatar"
              type="checkbox"
              checked={candidatar}
              onChange={(e) => setCandidatar(e.target.checked)}
            />
            Adicionar à vaga assim que criar
          </label>

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
              {enviando ? "Cadastrando…" : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoAdicionarCandidato({
  vagaId,
  candidatos,
  aoFechar,
  aoConcluir,
}: {
  vagaId: number;
  candidatos: Candidato[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [candidatoId, setCandidatoId] = useState(
    candidatos[0] ? String(candidatos[0].id) : ""
  );
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch("/api/recrutamento/candidaturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaga_id: vagaId,
          candidato_id: Number(candidatoId),
        }),
      });
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        aoConcluir();
      } else {
        setErro(dados.erro ?? "Não foi possível criar a candidatura.");
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
        <h3>Adicionar candidato à vaga</h3>
        <p className={comum.subDialogo}>
          A candidatura entra na primeira etapa do pipeline vigente.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="cand-existente">
            Candidato
          </label>
          <select
            className={comum.campo}
            id="cand-existente"
            value={candidatoId}
            onChange={(e) => setCandidatoId(e.target.value)}
          >
            {candidatos.map((candidato) => (
              <option key={candidato.id} value={String(candidato.id)}>
                {candidato.nome} — {candidato.email}
              </option>
            ))}
          </select>
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
              disabled={enviando || !candidatoId}
            >
              {enviando ? "Adicionando…" : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoReprovacao({
  candidatura,
  aoFechar,
  aoConcluir,
}: {
  candidatura: CandidaturaCartao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  // Nasce VAZIO: o motivo do desfecho negativo é a peça de defesa jurídica
  // (Lei 9.029). Semear o primeiro item do catálogo anula o próprio catálogo.
  const [motivo, setMotivo] = useState<MotivoMovimentacao | "">("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/movimentar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "reprovar",
            motivo_catalogo: motivo,
            observacao: observacao || undefined,
          }),
        }
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        aoConcluir();
      } else {
        setErro(dados.erro ?? "Não foi possível reprovar.");
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
        <h3>Reprovar — {candidatura.candidato_nome}</h3>
        <p className={comum.subDialogo}>
          O motivo vem sempre do catálogo controlado (Lei 9.029) — texto livre
          não é persistido como motivo. O histórico é definitivo.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="reprova-motivo">
            Motivo do catálogo
          </label>
          <select
            className={comum.campo}
            id="reprova-motivo"
            required
            value={motivo}
            onChange={(e) =>
              setMotivo(e.target.value as MotivoMovimentacao | "")
            }
          >
            <option value="" disabled>
              Escolha o motivo…
            </option>
            {/* "desistencia" não é desfecho de REPROVAÇÃO: ela tem diálogo
                próprio (resposta à oferta). Oferecer aqui é permitir gravar
                status 'reprovada' com motivo de desistência. */}
            {MOTIVOS_MOVIMENTACAO.filter((m) => m !== "desistencia").map((m) => (
              <option key={m} value={m}>
                {ROTULOS_MOTIVO_MOVIMENTACAO[m]}
              </option>
            ))}
          </select>
          <label className={comum.rotuloCampo} htmlFor="reprova-observacao">
            Observação (opcional)
          </label>
          <textarea
            className={`${comum.campo} ${comum.campoTexto}`}
            id="reprova-observacao"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
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
              disabled={enviando || motivo === ""}
            >
              {enviando ? "Registrando…" : "Reprovar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoPesquisaSocial({
  candidatura,
  aoFechar,
  aoConcluir,
}: {
  candidatura: CandidaturaCartao;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  // Nasce VAZIO: o desfecho de uma checagem sobre pessoa não se pré-seleciona.
  const [resultado, setResultado] = useState<ResultadoPesquisaSocial | "">("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      let anexo:
        | { nome_arquivo: string; mime: string; conteudo_base64: string }
        | undefined;
      if (arquivo) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () => resolve(String(leitor.result));
          leitor.onerror = () => reject(new Error("Falha ao ler o arquivo"));
          leitor.readAsDataURL(arquivo);
        });
        anexo = {
          nome_arquivo: arquivo.name || "anexo",
          mime: arquivo.type || "application/octet-stream",
          conteudo_base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
        };
      }
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/pesquisa-social`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultado, anexo }),
        }
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        aoConcluir();
      } else {
        setErro(dados.erro ?? "Não foi possível registrar a pesquisa social.");
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
        <h3>Pesquisa social — {candidatura.candidato_nome}</h3>
        <p className={comum.subDialogo}>
          Desfecho binário, único por candidatura. O anexo vai para o GED e é
          visível só a quem gere a seleção, com trilha de leitura; ele é
          apagado 6 meses após o descarte de candidatura recusada (retenção).
          Reprovado não avança — o caminho é reprovar com motivo do catálogo.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="ps-resultado">
            Resultado
          </label>
          <select
            className={comum.campo}
            id="ps-resultado"
            required
            value={resultado}
            onChange={(e) =>
              setResultado(e.target.value as ResultadoPesquisaSocial | "")
            }
          >
            <option value="" disabled>
              Escolha o resultado…
            </option>
            {RESULTADOS_PESQUISA_SOCIAL.map((r) => (
              <option key={r} value={r}>
                {ROTULOS_RESULTADO_PESQUISA_SOCIAL[r]}
              </option>
            ))}
          </select>
          <label className={comum.rotuloCampo} htmlFor="ps-anexo">
            Anexo (opcional — PDF, Word, texto ou imagem, até 10 MB)
          </label>
          <input
            className={comum.campo}
            id="ps-anexo"
            type="file"
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
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
              disabled={enviando || resultado === ""}
            >
              {enviando ? "Registrando…" : "Registrar desfecho"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoOferta({
  candidatura,
  faixaMin,
  faixaMax,
  aoFechar,
  aoConcluir,
}: {
  candidatura: CandidaturaCartao;
  faixaMin: number;
  faixaMax: number;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [valorTexto, setValorTexto] = useState("");
  const [aprovacao, setAprovacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valor = Number(valorTexto);
  const valorValido = valorTexto !== "" && Number.isFinite(valor) && valor > 0;
  const foraDaBanda = valorValido && (valor < faixaMin || valor > faixaMax);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/oferta`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valor,
            aprovacao_fora_banda: foraDaBanda ? aprovacao : undefined,
          }),
        }
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        aoConcluir();
      } else {
        setErro(dados.erro ?? "Não foi possível registrar a oferta.");
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
        <h3>Registrar oferta — {candidatura.candidato_nome}</h3>
        <p className={comum.subDialogo}>
          Banda congelada da vaga: {formatarSalario(faixaMin)} a{" "}
          {formatarSalario(faixaMax)}. Fora dela, a aprovação nominal é
          obrigatória e fica auditada.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="oferta-valor">
            Valor da proposta (R$)
          </label>
          <input
            className={comum.campo}
            id="oferta-valor"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
          />
          {foraDaBanda && (
            <>
              <p className={comum.erroAcao}>
                Valor fora da banda — registre quem aprovou a exceção.
              </p>
              <label className={comum.rotuloCampo} htmlFor="oferta-aprovacao">
                Aprovação fora da banda (quem aprovou e em que termos)
              </label>
              <textarea
                className={`${comum.campo} ${comum.campoTexto}`}
                id="oferta-aprovacao"
                required
                value={aprovacao}
                onChange={(e) => setAprovacao(e.target.value)}
              />
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
              disabled={enviando || !valorValido}
            >
              {enviando ? "Registrando…" : "Registrar oferta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoRespostaOferta({
  candidatura,
  resposta,
  aoFechar,
  aoConcluir,
}: {
  candidatura: CandidaturaCartao;
  resposta: "aceita" | "recusada";
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoMovimentacao>("desistencia");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/oferta/responder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            resposta === "aceita"
              ? { resposta }
              : { resposta, motivo_catalogo: motivo }
          ),
        }
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        aoConcluir();
      } else {
        setErro(dados.erro ?? "Não foi possível registrar a resposta.");
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
          Oferta {resposta === "aceita" ? "aceita" : "recusada"} —{" "}
          {candidatura.candidato_nome}
        </h3>
        <p className={comum.subDialogo}>
          {resposta === "aceita"
            ? "O aceite aprova a candidatura e FECHA a vaga na mesma transação. A admissão começa no botão “Iniciar admissão”."
            : "A recusa encerra a candidatura como desistência, com motivo do catálogo. A vaga segue aberta."}
        </p>
        <form onSubmit={enviar}>
          {resposta === "recusada" && (
            <>
              <label className={comum.rotuloCampo} htmlFor="recusa-motivo">
                Motivo do catálogo
              </label>
              <select
                className={comum.campo}
                id="recusa-motivo"
                value={motivo}
                onChange={(e) =>
                  setMotivo(e.target.value as MotivoMovimentacao)
                }
              >
                {MOTIVOS_MOVIMENTACAO.map((m) => (
                  <option key={m} value={m}>
                    {ROTULOS_MOTIVO_MOVIMENTACAO[m]}
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
              {enviando ? "Registrando…" : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoIniciarAdmissao({
  candidatura,
  aoFechar,
  aoConcluir,
}: {
  candidatura: CandidaturaCartao;
  aoFechar: () => void;
  aoConcluir: (senhaTemporaria: string) => void;
}) {
  const [matricula, setMatricula] = useState("");
  const [cpf, setCpf] = useState("");
  // Ambos nascem SEM valor. TIPOS_VINCULO[0] era 'clt' só por ordem do array,
  // e "tem contrato de experiência" marcado por padrão fazia o portal do
  // gestor alertar marco de 45/90 dias de aprendiz e estagiário.
  const [tipoVinculo, setTipoVinculo] = useState<TipoVinculo | "">("");
  const [dataInicio, setDataInicio] = useState("");
  const [experiencia, setExperiencia] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const respostaHttp = await fetch(
        `/api/recrutamento/candidaturas/${candidatura.id}/iniciar-admissao`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matricula,
            cpf,
            tipo_vinculo: tipoVinculo,
            data_inicio_prevista: dataInicio,
            contrato_experiencia: experiencia,
          }),
        }
      );
      const dados = await respostaHttp.json().catch(() => ({}));
      if (respostaHttp.ok) {
        aoConcluir(String(dados.senha_temporaria ?? ""));
      } else {
        setErro(dados.erro ?? "Não foi possível iniciar a admissão.");
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
        <h3>Iniciar admissão — {candidatura.candidato_nome}</h3>
        <p className={comum.subDialogo}>
          Cria o colaborador, o usuário e o processo de admissão (checklist
          vigente congelado) na <b>mesma transação</b>. Nenhum parecer da
          seleção atravessa a fronteira.
        </p>
        <form onSubmit={enviar}>
          <label className={comum.rotuloCampo} htmlFor="adm-matricula">
            Matrícula
          </label>
          <input
            className={comum.campo}
            id="adm-matricula"
            required
            maxLength={10}
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
          />
          <label className={comum.rotuloCampo} htmlFor="adm-cpf">
            CPF
          </label>
          <input
            className={comum.campo}
            id="adm-cpf"
            required
            maxLength={14}
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
          <label className={comum.rotuloCampo} htmlFor="adm-vinculo">
            Tipo de vínculo
          </label>
          <select
            className={comum.campo}
            id="adm-vinculo"
            required
            value={tipoVinculo}
            onChange={(e) => setTipoVinculo(e.target.value as TipoVinculo | "")}
          >
            <option value="" disabled>
              Escolha o tipo de vínculo…
            </option>
            {TIPOS_VINCULO.map((t) => (
              <option key={t} value={t}>
                {ROTULOS_VINCULO[t]}
              </option>
            ))}
          </select>
          <label className={comum.rotuloCampo} htmlFor="adm-inicio">
            Data de início prevista (vira a data de admissão)
          </label>
          <input
            className={comum.campo}
            id="adm-inicio"
            type="date"
            required
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
          <span className={comum.rotuloCampo}>
            Contrato de experiência (45 + 45 dias — art. 445 CLT)
          </span>
          <label className={comum.linhaMarcacao} htmlFor="adm-experiencia-sim">
            <input
              id="adm-experiencia-sim"
              name="adm-experiencia"
              type="radio"
              required
              checked={experiencia === true}
              onChange={() => setExperiencia(true)}
            />
            Sim — abre os marcos de 45 e 90 dias
          </label>
          <label className={comum.linhaMarcacao} htmlFor="adm-experiencia-nao">
            <input
              id="adm-experiencia-nao"
              name="adm-experiencia"
              type="radio"
              required
              checked={experiencia === false}
              onChange={() => setExperiencia(false)}
            />
            Não
          </label>
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
              disabled={enviando || tipoVinculo === "" || experiencia === null}
            >
              {enviando ? "Iniciando…" : "Iniciar admissão"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
