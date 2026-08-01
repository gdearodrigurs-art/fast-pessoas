"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import { AcoesDemanda } from "./acoes-demanda";
import { AcoesEtapa } from "./acoes-etapa";
import { CartaoDemanda } from "./cartao-demanda";
import { CartaoMovimentacao } from "./cartao-movimentacao";
import comum from "./comum.module.css";
import { FormularioMovimentacao } from "./formulario-movimentacao";
import estilos from "./page.module.css";
import { CartaoMovimentacao as DadosMovimentacao, Demanda, Visao } from "./tipos";

type AbaPrincipal = "minhas" | "aprovacoes" | "fila" | "movimentacoes";
type AbaFila = "aberta" | "em_atendimento" | "encerradas";
type FiltroAtraso = "todos" | "no_prazo" | "hoje" | "atrasadas";

const ATIVAS = ["aguardando_aprovacao", "aberta", "em_atendimento"];

export function PainelDemandas() {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [abaPrincipal, setAbaPrincipal] = useState<AbaPrincipal>("minhas");
  const [abaFila, setAbaFila] = useState<AbaFila>("aberta");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroAtraso, setFiltroAtraso] = useState<FiltroAtraso>("todos");

  const [dialogoNova, setDialogoNova] = useState(false);
  const [dialogoMovimentacao, setDialogoMovimentacao] = useState(false);
  const [novoTipo, setNovoTipo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroCriacao, setErroCriacao] = useState<string | null>(null);

  // Incrementar "versao" força uma nova busca (após criar/aprovar/atender…).
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const parametros = new URLSearchParams();
      parametros.set("status", abaFila);
      if (filtroTipo !== "todos") parametros.set("tipo", filtroTipo);
      if (filtroAtraso !== "todos") parametros.set("atraso", filtroAtraso);
      try {
        const resposta = await fetch(`/api/demandas?${parametros.toString()}`);
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar as demandas.");
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
  }, [abaFila, filtroTipo, filtroAtraso, versao]);

  function recarregar() {
    setVersao((atual) => atual + 1);
  }

  function abrirDialogoNova() {
    setNovoTipo(tiposPadrao[0]?.chave ?? "");
    setNovaDescricao("");
    setErroCriacao(null);
    setDialogoNova(true);
  }

  async function criarSolicitacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCriando(true);
    setErroCriacao(null);
    try {
      const resposta = await fetch("/api/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo_chave: novoTipo, descricao: novaDescricao }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setDialogoNova(false);
        setAbaPrincipal("minhas");
        recarregar();
      } else {
        setErroCriacao(dados.erro ?? "Não foi possível abrir a solicitação.");
      }
    } catch {
      setErroCriacao("Falha de conexão. Tente novamente.");
    } finally {
      setCriando(false);
    }
  }

  function secao(titulo: string, lista: Demanda[], vazio: string) {
    return (
      <section className={estilos.area}>
        <h2 className={estilos.tituloArea}>{titulo}</h2>
        {lista.length === 0 ? (
          <p className={estilos.vazio}>{vazio}</p>
        ) : (
          lista.map((demanda) => (
            <CartaoDemanda key={demanda.id} demanda={demanda} comLinkDetalhe />
          ))
        )}
      </section>
    );
  }

  // Promoção/transferência NÃO nascem do formulário genérico (só descrição
  // livre, sem colaborador alvo): elas têm formulário próprio. O serviço já
  // recusa; aqui a opção simplesmente não é oferecida.
  const tiposPadrao = (visao?.tipos ?? []).filter((t) => t.fluxo === "padrao");
  const tipoSelecionado = tiposPadrao.find((t) => t.chave === novoTipo);

  // Quantas movimentações esperam uma decisão DESTE usuário (líder + diretoria)
  // — o número na aba é o que faz o pedido não ficar esquecido.
  const movimentacoes = visao?.movimentacoes ?? null;
  const pendentesParaMim =
    (movimentacoes?.do_lider?.length ?? 0) +
    (movimentacoes?.da_diretoria?.length ?? 0);

  /** Uma fila de movimentações; `decidir` liga os botões da etapa pendente. */
  function secaoMovimentacoes(
    titulo: string,
    lista: DadosMovimentacao[],
    vazio: string,
    decidir?: "lider" | "diretoria"
  ) {
    return (
      <section className={estilos.area}>
        <h2 className={estilos.tituloArea}>{titulo}</h2>
        {lista.length === 0 ? (
          <p className={estilos.vazio}>{vazio}</p>
        ) : (
          lista.map((cartao) => (
            <CartaoMovimentacao
              key={cartao.demanda.id}
              dados={cartao}
              comLinkDetalhe
            >
              {decidir && (
                <AcoesEtapa
                  demandaId={cartao.demanda.id}
                  numero={cartao.demanda.numero}
                  nivel={decidir}
                  aoAtualizar={recarregar}
                />
              )}
            </CartaoMovimentacao>
          ))
        )}
      </section>
    );
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <div className={estilos.linhaTitulo}>
          <h1>Demandas</h1>
          {visao?.pode.solicitar_movimentacao && (
            <button
              className={comum.botaoSecundario}
              type="button"
              onClick={() => setDialogoMovimentacao(true)}
            >
              + Promoção / transferência
            </button>
          )}
          <button
            className={comum.botaoPrimario}
            type="button"
            onClick={abrirDialogoNova}
            disabled={tiposPadrao.length === 0}
          >
            + Nova solicitação
          </button>
        </div>
        <p className={estilos.subtitulo}>
          Solicitações entre você, seu gestor e o DP/RH — com prazo por SLA e
          histórico completo.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && !visao && <p className={estilos.vazio}>Carregando…</p>}

        {visao && (
          <>
            {(visao.pode.aprovar ||
              visao.pode.ver_todas ||
              visao.movimentacoes) && (
              <div className={estilos.abasPrincipais}>
                <button
                  className={`${estilos.aba} ${abaPrincipal === "minhas" ? estilos.abaAtiva : ""}`}
                  type="button"
                  onClick={() => setAbaPrincipal("minhas")}
                >
                  Minhas solicitações
                </button>
                {visao.pode.aprovar && (
                  <button
                    className={`${estilos.aba} ${abaPrincipal === "aprovacoes" ? estilos.abaAtiva : ""}`}
                    type="button"
                    onClick={() => setAbaPrincipal("aprovacoes")}
                  >
                    Aprovações
                    {visao.aprovacoes && visao.aprovacoes.length > 0
                      ? ` (${visao.aprovacoes.length})`
                      : ""}
                  </button>
                )}
                {visao.pode.ver_todas && (
                  <button
                    className={`${estilos.aba} ${abaPrincipal === "fila" ? estilos.abaAtiva : ""}`}
                    type="button"
                    onClick={() => setAbaPrincipal("fila")}
                  >
                    Fila do DP
                  </button>
                )}
                {visao.movimentacoes && (
                  <button
                    className={`${estilos.aba} ${abaPrincipal === "movimentacoes" ? estilos.abaAtiva : ""}`}
                    type="button"
                    onClick={() => setAbaPrincipal("movimentacoes")}
                  >
                    Promoções e transferências
                    {pendentesParaMim > 0 ? ` (${pendentesParaMim})` : ""}
                  </button>
                )}
              </div>
            )}

            {abaPrincipal === "minhas" && (
              <>
                {secao(
                  "Minhas solicitações",
                  visao.minhas.filter((d) => ATIVAS.includes(d.status)),
                  "Nenhuma solicitação em andamento."
                )}
                {secao(
                  "Encerradas",
                  visao.minhas.filter((d) => !ATIVAS.includes(d.status)),
                  "Nenhuma solicitação encerrada."
                )}
              </>
            )}

            {abaPrincipal === "aprovacoes" && visao.aprovacoes && (
              <>
                <section className={estilos.area}>
                  <h2 className={estilos.tituloArea}>
                    Aprovações pendentes (sua equipe)
                  </h2>
                  {visao.aprovacoes.length === 0 ? (
                    <p className={estilos.vazio}>Nenhuma aprovação pendente.</p>
                  ) : (
                    visao.aprovacoes.map((demanda) => (
                      <CartaoDemanda
                        key={demanda.id}
                        demanda={demanda}
                        comLinkDetalhe
                      >
                        <AcoesDemanda
                          demandaId={demanda.id}
                          numero={demanda.numero}
                          habilitadas={{ aprovar: true, reprovar: true }}
                          aoAtualizar={recarregar}
                        />
                      </CartaoDemanda>
                    ))
                  )}
                </section>
                {secao(
                  "Já passaram pela sua aprovação",
                  visao.equipe_decididas ?? [],
                  "Nada por aqui ainda."
                )}
              </>
            )}

            {abaPrincipal === "movimentacoes" && movimentacoes && (
              <>
                <div className={estilos.aviso}>
                  A cadeia é <b>líder → diretoria</b>. Aprovado o pedido, o{" "}
                  <b>DP e o T&amp;D são avisados</b> automaticamente para
                  providenciar os trâmites. O efeito no cadastro acontece na{" "}
                  <b>data pretendida</b>: se ela ainda não chegou, o pedido fica{" "}
                  <b>programado</b> e é aplicado na data, aqui mesmo.
                </div>

                {movimentacoes.programadas &&
                  secaoMovimentacoes(
                    "Aprovadas — efeito a aplicar na data",
                    movimentacoes.programadas,
                    "Nenhum efeito programado pendente."
                  )}

                {movimentacoes.do_lider &&
                  secaoMovimentacoes(
                    "Aguardando sua aprovação (líder)",
                    movimentacoes.do_lider,
                    "Nenhum pedido esperando sua decisão como líder.",
                    "lider"
                  )}

                {movimentacoes.da_diretoria &&
                  secaoMovimentacoes(
                    "Aguardando aprovação da diretoria",
                    movimentacoes.da_diretoria,
                    "Nenhum pedido esperando a diretoria.",
                    "diretoria"
                  )}

                {secaoMovimentacoes(
                  "Pedidos que eu abri",
                  movimentacoes.minhas,
                  "Você não abriu pedidos de promoção ou transferência."
                )}

                {movimentacoes.aplicadas &&
                  secaoMovimentacoes(
                    "Aplicadas — trâmites de DP e T&D",
                    movimentacoes.aplicadas,
                    "Nenhuma movimentação aplicada ainda."
                  )}
              </>
            )}

            {abaPrincipal === "fila" && visao.fila && (
              <>
                <div className={estilos.indicadores}>
                  <div className={estilos.cardIndicador}>
                    <div className={estilos.numeroIndicador}>
                      {visao.fila.indicadores.na_fila}
                    </div>
                    <div className={estilos.rotuloIndicador}>
                      na fila (abertas + em atendimento)
                    </div>
                  </div>
                  <div
                    className={`${estilos.cardIndicador} ${estilos.indicadorHoje}`}
                  >
                    <div className={estilos.numeroIndicador}>
                      {visao.fila.indicadores.vencendo_hoje}
                    </div>
                    <div className={estilos.rotuloIndicador}>vencendo hoje</div>
                  </div>
                  <div
                    className={`${estilos.cardIndicador} ${
                      visao.fila.indicadores.atrasadas > 0
                        ? estilos.indicadorAlerta
                        : ""
                    }`}
                  >
                    <div className={estilos.numeroIndicador}>
                      {visao.fila.indicadores.atrasadas}
                    </div>
                    <div className={estilos.rotuloIndicador}>atrasadas</div>
                  </div>
                </div>

                {visao.fila.indicadores.aguardando_aprovacao > 0 && (
                  <div className={estilos.aviso}>
                    {visao.fila.indicadores.aguardando_aprovacao} demanda(s){" "}
                    <b>aguardando aprovação do gestor</b> — ainda fora da fila
                    do DP.
                  </div>
                )}

                <div className={estilos.abasPrincipais}>
                  {(
                    [
                      ["aberta", "Abertas"],
                      ["em_atendimento", "Em atendimento"],
                      ["encerradas", "Concluídas / encerradas"],
                    ] as [AbaFila, string][]
                  ).map(([chave, rotulo]) => (
                    <button
                      key={chave}
                      className={`${estilos.aba} ${abaFila === chave ? estilos.abaAtiva : ""}`}
                      type="button"
                      onClick={() => setAbaFila(chave)}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>

                <div className={estilos.filtros}>
                  Tipo:
                  <select
                    className={estilos.seletor}
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                  >
                    <option value="todos">todos</option>
                    {visao.tipos.map((tipo) => (
                      <option key={tipo.chave} value={tipo.chave}>
                        {tipo.nome}
                      </option>
                    ))}
                  </select>
                  Prazo:
                  <select
                    className={estilos.seletor}
                    value={filtroAtraso}
                    onChange={(e) =>
                      setFiltroAtraso(e.target.value as FiltroAtraso)
                    }
                  >
                    <option value="todos">todos</option>
                    <option value="no_prazo">no prazo</option>
                    <option value="hoje">vence hoje</option>
                    <option value="atrasadas">atrasadas</option>
                  </select>
                </div>

                <section className={estilos.area}>
                  {visao.fila.demandas.length === 0 ? (
                    <p className={estilos.vazio}>
                      Nenhuma demanda com esses filtros.
                    </p>
                  ) : (
                    visao.fila.demandas.map((demanda) => (
                      <CartaoDemanda
                        key={demanda.id}
                        demanda={demanda}
                        comLinkDetalhe
                      >
                        {visao.pode.atender && (
                          <AcoesDemanda
                            demandaId={demanda.id}
                            numero={demanda.numero}
                            habilitadas={{
                              assumir: demanda.status === "aberta",
                              concluir: demanda.status === "em_atendimento",
                              recusar:
                                demanda.status === "aberta" ||
                                demanda.status === "em_atendimento",
                            }}
                            aoAtualizar={recarregar}
                          />
                        )}
                      </CartaoDemanda>
                    ))
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      {dialogoNova && (
        <div className={comum.fundoDialogo}>
          <div className={comum.dialogo} role="dialog" aria-modal="true">
            <h3>Nova solicitação</h3>
            <p className={comum.subDialogo}>
              O prazo é calculado pelo SLA do tipo; você acompanha tudo em
              &quot;Minhas solicitações&quot;.
            </p>
            <form onSubmit={criarSolicitacao}>
              <label className={comum.rotuloCampo} htmlFor="tipo-demanda">
                Tipo
              </label>
              <select
                className={comum.campo}
                id="tipo-demanda"
                value={novoTipo}
                onChange={(e) => setNovoTipo(e.target.value)}
              >
                {tiposPadrao.map((tipo) => (
                  <option key={tipo.chave} value={tipo.chave}>
                    {tipo.nome}
                  </option>
                ))}
              </select>
              {tipoSelecionado && (
                <p className={comum.dicaSla}>
                  SLA: {tipoSelecionado.sla_dias} dias
                  {tipoSelecionado.exige_aprovacao_gestor
                    ? " · este tipo exige aprovação do seu gestor antes de ir ao DP"
                    : ""}
                </p>
              )}
              <label className={comum.rotuloCampo} htmlFor="descricao-demanda">
                Descreva o que você precisa
              </label>
              <textarea
                className={`${comum.campo} ${comum.campoTexto}`}
                id="descricao-demanda"
                required
                maxLength={4000}
                placeholder="ex.: preciso da declaração para financiamento imobiliário"
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
              />
              {erroCriacao && <p className={comum.erroAcao}>{erroCriacao}</p>}
              <div className={comum.acoesDialogo}>
                <button
                  className={comum.botaoSecundario}
                  type="button"
                  onClick={() => setDialogoNova(false)}
                >
                  Cancelar
                </button>
                <button
                  className={comum.botaoPrimario}
                  type="submit"
                  disabled={criando}
                >
                  {criando ? "Abrindo…" : "Abrir solicitação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialogoMovimentacao && (
        <FormularioMovimentacao
          aoFechar={() => setDialogoMovimentacao(false)}
          aoCriar={() => {
            setAbaPrincipal("movimentacoes");
            recarregar();
          }}
        />
      )}
    </div>
  );
}
