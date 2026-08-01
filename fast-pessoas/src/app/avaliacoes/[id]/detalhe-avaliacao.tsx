"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  Decisao,
  decisaoDiverge,
  DECISOES,
  NOTA_MAXIMA,
  ROTULOS_DECISAO,
  ROTULOS_RECOMENDACAO,
  ROTULOS_STATUS_CICLO,
  ROTULOS_TIPO_CICLO,
} from "@/dominios/avaliacao/esquemas";
import comum from "../comum.module.css";
import { formatarData, formatarDataHora, rotuloPrazo } from "../formato";
import { Detalhe, Estrutura, ResultadoPayload } from "../tipos";
import estilos from "./page.module.css";

interface RespostaLocal {
  nota: number | null;
  nao_observado: boolean;
}

const NOTAS = Array.from({ length: NOTA_MAXIMA }, (_, i) => i + 1);

function TrilhaFaixas({
  estrutura,
  resultado,
}: {
  estrutura: Estrutura;
  resultado: ResultadoPayload | null;
}) {
  const faixas = [...estrutura.faixas].sort((a, b) => a.minimo - b.minimo);
  return (
    <>
      <div className={comum.trilhaFaixas}>
        {faixas.map((faixa) => {
          const ativa =
            resultado !== null &&
            resultado.faixa_minimo === faixa.minimo &&
            resultado.faixa_maximo === faixa.maximo;
          return (
            <div
              key={faixa.id}
              className={`${comum.segmentoFaixa} ${ativa ? comum.segmentoFaixaAtivo : ""}`}
              style={{ width: `${faixa.maximo - faixa.minimo}%` }}
              title={`${faixa.minimo}–${faixa.maximo}: ${faixa.rotulo}`}
            >
              {faixa.rotulo}
            </div>
          );
        })}
      </div>
      <div className={comum.legendaFaixas}>
        {faixas.map((faixa) => (
          <span key={faixa.id}>{faixa.minimo}</span>
        ))}
        <span>100</span>
      </div>
    </>
  );
}

export function DetalheAvaliacao({ id }: { id: number }) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [respostas, setRespostas] = useState<Map<number, RespostaLocal>>(
    new Map()
  );
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [avisoSalvo, setAvisoSalvo] = useState<string | null>(null);
  const [dialogoEnvio, setDialogoEnvio] = useState(false);

  // Nasce VAZIA: qual das decisões é a certa é exatamente o que a avaliação
  // existe para produzir. Semear "manter" ainda dispensava a justificativa em
  // 3 das 4 faixas, porque "manter" é decisão alinhada quase sempre.
  const [decisao, setDecisao] = useState<Decisao | "">("");
  const [justificativa, setJustificativa] = useState("");
  const [decidindo, setDecidindo] = useState(false);
  const [erroDecisao, setErroDecisao] = useState<string | null>(null);

  const [dialogoCancelar, setDialogoCancelar] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null);

  // Incrementar "versaoBusca" força uma nova busca (após envio/decisão).
  const [versaoBusca, setVersaoBusca] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/avaliacoes/${id}`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          const carregado = dados as Detalhe;
          setDetalhe(carregado);
          setErro(null);
          const mapa = new Map<number, RespostaLocal>();
          for (const r of carregado.respostas ?? []) {
            mapa.set(r.indicador_id, {
              nota: r.nota,
              nao_observado: r.nao_observado,
            });
          }
          setRespostas(mapa);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar a avaliação.");
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
  }, [id, versaoBusca]);

  function recarregar() {
    setCarregando(true);
    setVersaoBusca((atual) => atual + 1);
  }

  const totalIndicadores = useMemo(
    () =>
      detalhe?.estrutura?.pilares.reduce(
        (s, p) => s + p.indicadores.length,
        0
      ) ?? 0,
    [detalhe]
  );
  const totalRespondidas = useMemo(() => {
    let total = 0;
    for (const r of respostas.values()) {
      if (r.nota !== null || r.nao_observado) total += 1;
    }
    return total;
  }, [respostas]);

  function definirNota(indicadorId: number, nota: number) {
    setRespostas((atual) => {
      const novo = new Map(atual);
      novo.set(indicadorId, { nota, nao_observado: false });
      return novo;
    });
  }

  function alternarNaoObservado(indicadorId: number) {
    setRespostas((atual) => {
      const novo = new Map(atual);
      const vigente = novo.get(indicadorId);
      if (vigente?.nao_observado) {
        novo.delete(indicadorId);
      } else {
        novo.set(indicadorId, { nota: null, nao_observado: true });
      }
      return novo;
    });
  }

  function montarPayload() {
    const lista: {
      indicador_id: number;
      nota: number | null;
      nao_observado: boolean;
    }[] = [];
    for (const [indicadorId, r] of respostas) {
      if (r.nota !== null || r.nao_observado) {
        lista.push({
          indicador_id: indicadorId,
          nota: r.nota,
          nao_observado: r.nao_observado,
        });
      }
    }
    return lista;
  }

  async function salvarRascunho() {
    const lista = montarPayload();
    if (lista.length === 0) {
      setErroAcao("Responda ao menos um indicador antes de salvar.");
      return;
    }
    setSalvando(true);
    setErroAcao(null);
    setAvisoSalvo(null);
    try {
      const resposta = await fetch(`/api/avaliacoes/${id}/respostas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: lista }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setAvisoSalvo("Rascunho salvo.");
      } else {
        setErroAcao(dados.erro ?? "Não foi possível salvar o rascunho.");
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviar() {
    setEnviando(true);
    setErroAcao(null);
    try {
      // Garante que o rascunho no servidor reflete a tela antes do envio.
      const lista = montarPayload();
      if (lista.length > 0) {
        const salvar = await fetch(`/api/avaliacoes/${id}/respostas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ respostas: lista }),
        });
        if (!salvar.ok) {
          const dados = await salvar.json().catch(() => ({}));
          setErroAcao(dados.erro ?? "Não foi possível salvar as respostas.");
          setDialogoEnvio(false);
          return;
        }
      }
      const resposta = await fetch(`/api/avaliacoes/${id}/enviar`, {
        method: "POST",
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogoEnvio(false);
        recarregar();
      } else {
        setErroAcao(dados.erro ?? "Não foi possível enviar a avaliação.");
        setDialogoEnvio(false);
      }
    } catch {
      setErroAcao("Falha de conexão. Tente novamente.");
      setDialogoEnvio(false);
    } finally {
      setEnviando(false);
    }
  }

  async function registrarDecisao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setDecidindo(true);
    setErroDecisao(null);
    try {
      const resposta = await fetch(`/api/avaliacoes/${id}/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisao,
          justificativa: justificativa.trim() || undefined,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        recarregar();
      } else {
        setErroDecisao(dados.erro ?? "Não foi possível registrar a decisão.");
      }
    } catch {
      setErroDecisao("Falha de conexão. Tente novamente.");
    } finally {
      setDecidindo(false);
    }
  }

  async function cancelarCiclo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCancelando(true);
    setErroCancelamento(null);
    try {
      const resposta = await fetch(`/api/avaliacoes/${id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivoCancelamento }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogoCancelar(false);
        recarregar();
      } else {
        setErroCancelamento(dados.erro ?? "Não foi possível cancelar.");
      }
    } catch {
      setErroCancelamento("Falha de conexão. Tente novamente.");
    } finally {
      setCancelando(false);
    }
  }

  const divergenciaPrevista =
    detalhe?.resultado != null && decisao !== ""
      ? decisaoDiverge(detalhe.resultado.recomendacao, decisao)
      : false;

  const ciclo = detalhe?.ciclo;
  const vivo = ciclo?.status === "aberto" || ciclo?.status === "em_avaliacao";

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/avaliacoes">
          Avaliações
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !detalhe && <p className={estilos.vazio}>Carregando…</p>}

        {detalhe && ciclo && (
          <>
            <div className={estilos.linhaTitulo}>
              <h1>
                {ROTULOS_TIPO_CICLO[ciclo.tipo]} — {ciclo.colaborador_nome}
              </h1>
              {detalhe.acoes.cancelar && (
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  onClick={() => {
                    setMotivoCancelamento("");
                    setErroCancelamento(null);
                    setDialogoCancelar(true);
                  }}
                >
                  Cancelar ciclo
                </button>
              )}
            </div>
            <p className={estilos.subtitulo}>
              mat. {ciclo.matricula} · avaliador: {ciclo.avaliador_nome} ·
              modelo v{ciclo.modelo_versao} (congelado na abertura) · prazo{" "}
              {formatarData(ciclo.prazo)}
              {vivo ? ` (${rotuloPrazo(ciclo.dias_para_prazo)})` : ""}
            </p>

            <div className={comum.topo} style={{ marginBottom: 16 }}>
              <span
                className={`${comum.badge} ${
                  ciclo.status === "decidido"
                    ? comum.badgeSuccess
                    : ciclo.status === "consolidado"
                      ? comum.badgeInfo
                      : ciclo.status === "cancelado"
                        ? comum.badgeNeutro
                        : comum.badgeWarning
                }`}
              >
                {ROTULOS_STATUS_CICLO[ciclo.status]}
              </span>
              {ciclo.avaliacao_estado === "enviada" && ciclo.enviado_em && (
                <span className={comum.meta}>
                  Enviada em {formatarDataHora(ciclo.enviado_em)} — respostas
                  imutáveis.
                </span>
              )}
            </div>

            {/* ---------------- estado explicado (G1a) ----------------
                Sempre desenhado: quem não é o avaliador via, antes, uma
                página sem formulário, sem resultado e sem explicação. */}
            <section className={estilos.cartaoSituacao}>
              <h2>{detalhe.situacao.titulo}</h2>
              <p className={estilos.detalheSituacao}>
                {detalhe.situacao.detalhe}
              </p>
              <p className={estilos.proximoPasso}>
                <b>Próximo passo:</b> {detalhe.situacao.proximo_passo}
              </p>
              <p className={estilos.rotuloSituacao}>
                O que você pode fazer aqui
              </p>
              <ul className={estilos.listaPosso}>
                {detalhe.situacao.o_que_posso_fazer.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {!detalhe.pode.sou_avaliador && !detalhe.pode.resultado_ver && (
                <p className={estilos.notaLGPD}>
                  Notas por indicador e resultado consolidado são restritos
                  (avaliacao.resultado.ver) — ausência, não máscara.
                </p>
              )}
            </section>

            {/* ---------------- resultado consolidado (restrito) ---------------- */}
            {detalhe.resultado && (
              <section className={estilos.cartaoResultado}>
                <h2>Resultado consolidado</h2>
                <div className={estilos.linhaResultado}>
                  <div className={estilos.percentualGrande}>
                    {detalhe.resultado.percentual}%
                  </div>
                  <div>
                    <div className={comum.nome}>
                      {detalhe.resultado.faixa_rotulo}
                    </div>
                    <span className={`${comum.badge} ${comum.badgeInfo}`}>
                      Recomendação:{" "}
                      {ROTULOS_RECOMENDACAO[detalhe.resultado.recomendacao]}
                    </span>
                  </div>
                </div>
                {detalhe.estrutura && (
                  <TrilhaFaixas
                    estrutura={detalhe.estrutura}
                    resultado={detalhe.resultado}
                  />
                )}

                {detalhe.resultado.memoria_calculo.pilares.map((pilar) => (
                  <div className={estilos.linhaPilarWrap} key={pilar.pilar_id}>
                    <div className={comum.linhaPilar}>
                      <span>
                        {pilar.nome}{" "}
                        <span className={estilos.pesoPilar}>
                          peso {pilar.peso}%
                          {pilar.peso_normalizado !== null &&
                          pilar.peso_normalizado !== pilar.peso
                            ? ` → ${pilar.peso_normalizado}%`
                            : ""}
                        </span>
                      </span>
                      <div className={comum.trilhaBarra}>
                        <div
                          className={comum.preenchimentoBarra}
                          style={{ width: `${pilar.nota_pilar ?? 0}%` }}
                        />
                      </div>
                      <span className={comum.valorBarra}>
                        {pilar.excluido ? "—" : `${pilar.nota_pilar}%`}
                      </span>
                    </div>
                    {pilar.excluido && (
                      <p className={estilos.notaRenormalizacao}>
                        Pilar 100% não observado — excluído do cálculo; os
                        pesos dos demais pilares foram renormalizados.
                      </p>
                    )}
                    {!pilar.excluido && pilar.nao_observados > 0 && (
                      <p className={estilos.notaRenormalizacao}>
                        {pilar.nao_observados} indicador(es) não observado(s)
                        — pesos renormalizados entre os respondidos.
                      </p>
                    )}
                  </div>
                ))}
                <p className={estilos.notaLGPD}>
                  Consolidado em {formatarDataHora(detalhe.resultado.em)} ·
                  memória de cálculo completa gravada com o resultado. Esta
                  leitura ficou registrada na trilha de acesso
                  (audit.leitura_sensivel).
                </p>
              </section>
            )}

            {/* ---------------- decisão registrada ---------------- */}
            {detalhe.decisao && (
              <section className={estilos.blocoDecisao}>
                <h2>Decisão registrada</h2>
                <div className={comum.topo}>
                  <span className={comum.nome}>
                    {ROTULOS_DECISAO[detalhe.decisao.decisao]}
                  </span>
                  {detalhe.decisao.divergente ? (
                    <span className={`${comum.badge} ${comum.badgeWarning}`}>
                      divergente da recomendação
                    </span>
                  ) : (
                    <span className={`${comum.badge} ${comum.badgeSuccess}`}>
                      alinhada à recomendação
                    </span>
                  )}
                </div>
                <p className={comum.meta}>
                  Por {detalhe.decisao.decisor_nome} em{" "}
                  {formatarDataHora(detalhe.decisao.em)}
                </p>
                {detalhe.decisao.justificativa && (
                  <p style={{ fontSize: 13.5, marginTop: 8 }}>
                    <b>Justificativa:</b> {detalhe.decisao.justificativa}
                  </p>
                )}
                {detalhe.decisao.decisao === "desligar" && (
                  <p className={estilos.notaLGPD}>
                    A decisão não executa nada: o desligamento é conduzido no
                    módulo próprio pelo DP.
                  </p>
                )}
              </section>
            )}

            {/* ---------------- formulário de decisão ---------------- */}
            {detalhe.acoes.decidir && !detalhe.decisao && (
              <section className={estilos.blocoDecisao}>
                <h2>Registrar decisão</h2>
                <p className={comum.subDialogo}>
                  A flag da faixa é recomendação — a consequência é decisão
                  humana registrada (decisor, data e divergência ficam na
                  trilha).
                </p>
                <form onSubmit={registrarDecisao}>
                  <label className={comum.rotuloCampo} htmlFor="decisao">
                    Decisão
                  </label>
                  <select
                    className={comum.campo}
                    id="decisao"
                    required
                    value={decisao}
                    onChange={(e) => setDecisao(e.target.value as Decisao | "")}
                  >
                    <option value="" disabled>
                      Escolha a decisão…
                    </option>
                    {DECISOES.map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {ROTULOS_DECISAO[opcao]}
                      </option>
                    ))}
                  </select>

                  {divergenciaPrevista && (
                    <div
                      className={comum.avisoAtencao}
                      style={{ marginTop: 12 }}
                    >
                      Esta decisão <b>diverge</b> da recomendação da faixa (
                      {detalhe.resultado
                        ? ROTULOS_RECOMENDACAO[detalhe.resultado.recomendacao]
                        : ""}
                      ) — justificativa obrigatória.
                    </div>
                  )}

                  <label className={comum.rotuloCampo} htmlFor="justificativa">
                    Justificativa
                    {divergenciaPrevista ? " (obrigatória)" : " (recomendada)"}
                  </label>
                  <textarea
                    className={`${comum.campo} ${comum.campoTexto}`}
                    id="justificativa"
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    placeholder="Por que esta decisão?"
                  />

                  {erroDecisao && (
                    <p className={comum.erroAcao}>{erroDecisao}</p>
                  )}
                  <div className={comum.acoesDialogo}>
                    <button
                      className={comum.botaoPrimario}
                      type="submit"
                      disabled={
                        decidindo ||
                        decisao === "" ||
                        (divergenciaPrevista && !justificativa.trim())
                      }
                    >
                      {decidindo ? "Registrando…" : "Registrar decisão"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* ---------------- responder / respostas ---------------- */}
            {detalhe.estrutura &&
              (detalhe.acoes.responder ? (
                <>
                  {detalhe.estrutura.pilares.map((pilar) => (
                    <section className={estilos.cartaoPilar} key={pilar.id}>
                      <div className={estilos.cabecalhoPilar}>
                        <h3>{pilar.nome}</h3>
                        <span className={estilos.pesoPilar}>
                          peso {pilar.peso}%
                        </span>
                      </div>
                      {pilar.indicadores.map((indicador) => {
                        const atual = respostas.get(indicador.id);
                        return (
                          <div
                            className={estilos.linhaIndicador}
                            key={indicador.id}
                          >
                            <div className={estilos.infoIndicador}>
                              <div className={estilos.nomeIndicador}>
                                {indicador.nome}{" "}
                                <span className={estilos.pesoIndicador}>
                                  · peso {indicador.peso}
                                </span>
                              </div>
                              <div className={estilos.descricaoIndicador}>
                                {indicador.descricao}
                              </div>
                            </div>
                            <div className={comum.grupoEscala}>
                              {NOTAS.map((nota) => (
                                <button
                                  key={nota}
                                  type="button"
                                  className={`${comum.botaoNota} ${
                                    atual?.nota === nota
                                      ? comum.botaoNotaAtivo
                                      : ""
                                  }`}
                                  aria-pressed={atual?.nota === nota}
                                  onClick={() =>
                                    definirNota(indicador.id, nota)
                                  }
                                >
                                  {nota}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={`${comum.botaoNaoObservado} ${
                                  atual?.nao_observado
                                    ? comum.botaoNaoObservadoAtivo
                                    : ""
                                }`}
                                aria-pressed={Boolean(atual?.nao_observado)}
                                onClick={() =>
                                  alternarNaoObservado(indicador.id)
                                }
                              >
                                Não observado
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  ))}

                  <div className={estilos.rodapeEnvio}>
                    <span className={estilos.progressoEnvio}>
                      {totalRespondidas} de {totalIndicadores} indicadores
                      respondidos
                      {totalRespondidas < totalIndicadores
                        ? " — o envio exige todos (nota ou não observado)"
                        : " — pronto para enviar"}
                    </span>
                    <div className={comum.acoes} style={{ marginTop: 0 }}>
                      {avisoSalvo && (
                        <span className={comum.meta}>{avisoSalvo}</span>
                      )}
                      <button
                        className={comum.botaoSecundario}
                        type="button"
                        onClick={salvarRascunho}
                        disabled={salvando}
                      >
                        {salvando ? "Salvando…" : "Salvar rascunho"}
                      </button>
                      <button
                        className={comum.botaoPrimario}
                        type="button"
                        onClick={() => setDialogoEnvio(true)}
                        disabled={
                          enviando || totalRespondidas < totalIndicadores
                        }
                      >
                        Enviar avaliação
                      </button>
                    </div>
                  </div>
                  {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
                </>
              ) : (
                /* Leitura: SEMPRE desenha o que está sendo perguntado (com a
                   régua de cada indicador). Antes só aparecia quando já havia
                   resposta — daí a página vazia enquanto o avaliador não
                   respondia. */
                <>
                  <h2 className={estilos.subtitulo} style={{ marginTop: 8 }}>
                    {detalhe.respostas && detalhe.respostas.length > 0
                      ? "Respostas do avaliador"
                      : `O que está sendo avaliado — modelo v${ciclo.modelo_versao} congelado no ciclo`}
                  </h2>
                  {detalhe.estrutura.pilares.map((pilar) => (
                    <section className={estilos.cartaoPilar} key={pilar.id}>
                      <div className={estilos.cabecalhoPilar}>
                        <h3>{pilar.nome}</h3>
                        <span className={estilos.pesoPilar}>
                          peso {pilar.peso}%
                        </span>
                      </div>
                      {pilar.indicadores.map((indicador) => {
                        const resposta = detalhe.respostas?.find(
                          (r) => r.indicador_id === indicador.id
                        );
                        return (
                          <div
                            className={estilos.linhaIndicador}
                            key={indicador.id}
                          >
                            <div className={estilos.infoIndicador}>
                              <div className={estilos.nomeIndicador}>
                                {indicador.nome}{" "}
                                <span className={estilos.pesoIndicador}>
                                  · peso {indicador.peso}
                                </span>
                              </div>
                              <div className={estilos.descricaoIndicador}>
                                {indicador.descricao}
                              </div>
                            </div>
                            {detalhe.respostas === null ? (
                              <span
                                className={`${comum.badge} ${comum.badgeNeutro}`}
                              >
                                nota restrita
                              </span>
                            ) : resposta ? (
                              resposta.nao_observado ? (
                                <span
                                  className={`${comum.badge} ${comum.badgeWarning}`}
                                >
                                  não observado
                                </span>
                              ) : (
                                <span className={comum.valorBarra}>
                                  {resposta.nota} / {NOTA_MAXIMA}
                                </span>
                              )
                            ) : (
                              <span
                                className={`${comum.badge} ${comum.badgeNeutro}`}
                              >
                                sem resposta
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </section>
                  ))}
                </>
              ))}

            {/* Avaliador sem resultado.ver, pós-envio */}
            {detalhe.pode.sou_avaliador &&
              !detalhe.pode.resultado_ver &&
              ciclo.avaliacao_estado === "enviada" && (
                <p className={estilos.notaLGPD}>
                  Você vê o que respondeu; o resultado consolidado é restrito
                  (avaliacao.resultado.ver) e a decisão cabe ao DP/diretoria.
                </p>
              )}
          </>
        )}
      </main>

      {dialogoEnvio && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Enviar avaliação?</h3>
            <p className={comum.subDialogo}>
              Após o envio as respostas ficam <b>imutáveis</b> e o resultado é
              consolidado pelo motor de cálculo. Indicadores marcados como
              &quot;não observado&quot; saem do denominador — nunca contam
              como zero.
            </p>
            {erroAcao && <p className={comum.erroAcao}>{erroAcao}</p>}
            <div className={comum.acoesDialogo}>
              <button
                className={comum.botaoSecundario}
                type="button"
                onClick={() => setDialogoEnvio(false)}
              >
                Voltar
              </button>
              <button
                className={comum.botaoPrimario}
                type="button"
                onClick={enviar}
                disabled={enviando}
              >
                {enviando ? "Enviando…" : "Enviar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogoCancelar && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Cancelar ciclo</h3>
            <p className={comum.subDialogo}>
              Só ciclos ainda não consolidados podem ser cancelados. O
              cancelamento fica na trilha de auditoria com o motivo.
            </p>
            <form onSubmit={cancelarCiclo}>
              <label className={comum.rotuloCampo} htmlFor="motivo-cancelar">
                Motivo
              </label>
              <textarea
                className={`${comum.campo} ${comum.campoTexto}`}
                id="motivo-cancelar"
                required
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
              />
              {erroCancelamento && (
                <p className={comum.erroAcao}>{erroCancelamento}</p>
              )}
              <div className={comum.acoesDialogo}>
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  onClick={() => setDialogoCancelar(false)}
                >
                  Voltar
                </button>
                <button
                  className={comum.botaoPrimario}
                  type="submit"
                  disabled={cancelando || !motivoCancelamento.trim()}
                >
                  {cancelando ? "Cancelando…" : "Cancelar ciclo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
