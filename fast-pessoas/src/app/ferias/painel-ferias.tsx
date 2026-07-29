"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  nivelAlerta,
  NivelAlerta,
  ROTULOS_NIVEL_ALERTA,
  ROTULOS_STATUS_PERIODO,
  ROTULOS_STATUS_PROGRAMACAO,
  StatusPeriodo,
  StatusProgramacao,
} from "@/dominios/ferias/esquemas";
import estilos from "./page.module.css";

interface Periodo {
  id: number;
  inicio: string;
  fim: string;
  saldo_dias: number;
  dias_gozados: number;
  status: StatusPeriodo;
  limite_concessivo: string;
  dias_ate_limite: number;
}

interface Programacao {
  id: number;
  colaborador_nome: string;
  matricula: string;
  periodo_inicio: string;
  periodo_fim: string;
  inicio: string;
  fim: string;
  dias: number;
  abono_dias: number;
  status: StatusProgramacao;
  demanda_id: number | null;
  demanda_numero: number | null;
}

interface LinhaPainel extends Periodo {
  colaborador_nome: string;
  matricula: string;
}

interface Visao {
  pode: { administrar: boolean };
  colaborador_id: number | null;
  saldo_total: number;
  periodos: Periodo[];
  programacoes: Programacao[];
  painel: {
    totais: {
      vencidas: number;
      ate_30: number;
      ate_60: number;
      ate_90: number;
    };
    linhas: LinhaPainel[];
    solicitadas: Programacao[];
  } | null;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function classeEtiquetaAlerta(nivel: NivelAlerta): string {
  if (nivel === "vencida") return `${estilos.etiqueta} ${estilos.etiquetaVencida}`;
  if (nivel === "ate_30") return `${estilos.etiqueta} ${estilos.etiqueta30}`;
  if (nivel === "ate_60") return `${estilos.etiqueta} ${estilos.etiqueta60}`;
  if (nivel === "ate_90") return `${estilos.etiqueta} ${estilos.etiqueta90}`;
  return estilos.etiqueta;
}

function classeEtiquetaProgramacao(status: StatusProgramacao): string {
  if (status === "aprovada" || status === "concluida" || status === "em_gozo") {
    return `${estilos.etiqueta} ${estilos.etiquetaAprovada}`;
  }
  if (status === "recusada" || status === "cancelada") {
    return `${estilos.etiqueta} ${estilos.etiquetaRecusada}`;
  }
  return `${estilos.etiqueta} ${estilos.etiquetaSolicitada}`;
}

export function PainelFerias({
  podeAdministrar,
}: {
  podeAdministrar: boolean;
}) {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [periodoId, setPeriodoId] = useState("");
  const [inicio, setInicio] = useState("");
  const [dias, setDias] = useState("30");
  const [abonoDias, setAbonoDias] = useState("0");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);

  const [aprovando, setAprovando] = useState<number | null>(null);
  const [erroPainel, setErroPainel] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/ferias");
        const dados = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        if (resposta.ok) {
          setVisao(dados as Visao);
          setErro(null);
        } else {
          setErro(dados.erro ?? "Não foi possível carregar as férias.");
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

  const periodosProgramaveis = (visao?.periodos ?? []).filter(
    (periodo) =>
      periodo.status !== "gozado" &&
      periodo.saldo_dias - periodo.dias_gozados > 0
  );

  async function programar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroEnvio(null);
    setAvisoEnvio(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/ferias/programacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo_aquisitivo_id: Number(periodoId),
          inicio,
          dias: Number(dias),
          abono_dias: Number(abonoDias) || 0,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setPeriodoId("");
        setInicio("");
        setDias("30");
        setAbonoDias("0");
        setAvisoEnvio(
          "Programação enviada — abriu uma demanda para aprovação do seu gestor."
        );
        setVersao((atual) => atual + 1);
      } else {
        setErroEnvio(dados.erro ?? "Não foi possível programar as férias.");
      }
    } catch {
      setErroEnvio("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function aprovarExcecao(programacao: Programacao) {
    const confirmado = window.confirm(
      `Aprovar como exceção as férias de ${programacao.colaborador_nome} ` +
        `(${formatarData(programacao.inicio)} a ${formatarData(programacao.fim)})? ` +
        `A aprovação normal é do gestor, na demanda vinculada.`
    );
    if (!confirmado) return;
    setErroPainel(null);
    setAprovando(programacao.id);
    try {
      const resposta = await fetch(
        `/api/ferias/programacoes/${programacao.id}/aprovar`,
        { method: "POST" }
      );
      const dados = await resposta.json().catch(() => ({}));
      if (resposta.ok) {
        setVersao((atual) => atual + 1);
      } else {
        setErroPainel(dados.erro ?? "Não foi possível aprovar a exceção.");
      }
    } catch {
      setErroPainel("Falha de conexão. Tente novamente.");
    } finally {
      setAprovando(null);
    }
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <h1>Férias</h1>
        <p className={estilos.subtitulo}>
          Períodos aquisitivos, saldo e programação — aprovação do gestor via
          demanda.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}
        {carregando && <p className={estilos.subtitulo}>Carregando…</p>}

        {!carregando && visao && visao.colaborador_id !== null && (
          <>
            <section className={estilos.cartao}>
              <h2>Meus períodos aquisitivos — saldo total: {visao.saldo_total} dia(s)</h2>
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Período aquisitivo</th>
                      <th>Direito</th>
                      <th>Gozado/programado</th>
                      <th>Saldo</th>
                      <th>Limite para gozo</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.periodos.map((periodo) => {
                      const nivel =
                        periodo.status === "gozado"
                          ? null
                          : nivelAlerta(periodo.dias_ate_limite);
                      return (
                        <tr
                          key={periodo.id}
                          className={
                            nivel === "vencida" ? estilos.linhaVencida : undefined
                          }
                        >
                          <td>
                            {formatarData(periodo.inicio)} a{" "}
                            {formatarData(periodo.fim)}
                          </td>
                          <td>{periodo.saldo_dias} dias</td>
                          <td>{periodo.dias_gozados} dias</td>
                          <td>{periodo.saldo_dias - periodo.dias_gozados} dias</td>
                          <td>{formatarData(periodo.limite_concessivo)}</td>
                          <td>
                            <span
                              className={
                                nivel
                                  ? classeEtiquetaAlerta(nivel)
                                  : estilos.etiqueta
                              }
                            >
                              {nivel
                                ? ROTULOS_NIVEL_ALERTA[nivel]
                                : ROTULOS_STATUS_PERIODO[periodo.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {visao.periodos.length === 0 && (
                      <tr>
                        <td colSpan={6}>Nenhum período aquisitivo ainda.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={estilos.cartao}>
              <h2>Programar férias</h2>
              <form className={estilos.formulario} onSubmit={programar}>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="periodo">
                    Período aquisitivo
                  </label>
                  <select
                    className={estilos.campo}
                    id="periodo"
                    required
                    value={periodoId}
                    onChange={(e) => setPeriodoId(e.target.value)}
                  >
                    <option value="">Escolha…</option>
                    {periodosProgramaveis.map((periodo) => (
                      <option key={periodo.id} value={periodo.id}>
                        {formatarData(periodo.inicio)} a{" "}
                        {formatarData(periodo.fim)} — saldo{" "}
                        {periodo.saldo_dias - periodo.dias_gozados} dias
                      </option>
                    ))}
                  </select>
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="inicio">
                    Início do gozo
                  </label>
                  <input
                    className={estilos.campo}
                    id="inicio"
                    type="date"
                    required
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="dias">
                    Dias de gozo (5 a 30)
                  </label>
                  <input
                    className={estilos.campo}
                    id="dias"
                    type="number"
                    min={5}
                    max={30}
                    required
                    value={dias}
                    onChange={(e) => setDias(e.target.value)}
                  />
                </div>
                <div className={estilos.campoGrupo}>
                  <label className={estilos.rotulo} htmlFor="abono">
                    Abono pecuniário (0 a 10)
                  </label>
                  <input
                    className={estilos.campo}
                    id="abono"
                    type="number"
                    min={0}
                    max={10}
                    value={abonoDias}
                    onChange={(e) => setAbonoDias(e.target.value)}
                  />
                </div>
                <button
                  className={estilos.botao}
                  type="submit"
                  disabled={enviando}
                >
                  {enviando ? "Enviando…" : "Programar"}
                </button>
              </form>
              {erroEnvio && <p className={estilos.erro}>{erroEnvio}</p>}
              {avisoEnvio && <p className={estilos.sucesso}>{avisoEnvio}</p>}
            </section>

            <section className={estilos.cartao}>
              <h2>Minhas programações</h2>
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Gozo</th>
                      <th>Dias</th>
                      <th>Abono</th>
                      <th>Período aquisitivo</th>
                      <th>Situação</th>
                      <th>Demanda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.programacoes.map((programacao) => (
                      <tr key={programacao.id}>
                        <td>
                          {formatarData(programacao.inicio)} a{" "}
                          {formatarData(programacao.fim)}
                        </td>
                        <td>{programacao.dias}</td>
                        <td>{programacao.abono_dias}</td>
                        <td>
                          {formatarData(programacao.periodo_inicio)} a{" "}
                          {formatarData(programacao.periodo_fim)}
                        </td>
                        <td>
                          <span
                            className={classeEtiquetaProgramacao(
                              programacao.status
                            )}
                          >
                            {ROTULOS_STATUS_PROGRAMACAO[programacao.status]}
                          </span>
                        </td>
                        <td>
                          {programacao.demanda_id !== null ? (
                            <Link
                              className={estilos.ligacao}
                              href={`/demandas/${programacao.demanda_id}`}
                            >
                              DEM-
                              {String(programacao.demanda_numero ?? 0).padStart(
                                4,
                                "0"
                              )}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                    {visao.programacoes.length === 0 && (
                      <tr>
                        <td colSpan={6}>Nenhuma programação ainda.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {!carregando && visao && visao.colaborador_id === null && (
          <section className={estilos.cartao}>
            <p className={estilos.subtitulo}>
              Sua conta não está vinculada a uma ficha de colaborador — os seus
              períodos aquisitivos aparecem aqui quando o DP fizer o vínculo.
            </p>
          </section>
        )}

        {!carregando && podeAdministrar && visao?.painel && (
          <>
            <section className={estilos.cartao}>
              <h2>Painel de vencimento (todas as pessoas)</h2>
              <div className={estilos.cartoesResumo}>
                <div
                  className={`${estilos.cartaoResumo} ${estilos.cartaoResumoVencidas}`}
                >
                  <strong>{visao.painel.totais.vencidas}</strong>
                  <span>VENCIDAS — dobro (art. 137)</span>
                </div>
                <div
                  className={`${estilos.cartaoResumo} ${estilos.cartaoResumo30}`}
                >
                  <strong>{visao.painel.totais.ate_30}</strong>
                  <span>vencendo em até 30 dias</span>
                </div>
                <div
                  className={`${estilos.cartaoResumo} ${estilos.cartaoResumo60}`}
                >
                  <strong>{visao.painel.totais.ate_60}</strong>
                  <span>vencendo em até 60 dias</span>
                </div>
                <div
                  className={`${estilos.cartaoResumo} ${estilos.cartaoResumo90}`}
                >
                  <strong>{visao.painel.totais.ate_90}</strong>
                  <span>vencendo em até 90 dias</span>
                </div>
              </div>
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>Período aquisitivo</th>
                      <th>Saldo</th>
                      <th>Limite para gozo</th>
                      <th>Dias até o limite</th>
                      <th>Alerta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.painel.linhas.map((linha) => {
                      const nivel = nivelAlerta(linha.dias_ate_limite);
                      return (
                        <tr
                          key={linha.id}
                          className={
                            nivel === "vencida"
                              ? estilos.linhaVencida
                              : undefined
                          }
                        >
                          <td>
                            {linha.colaborador_nome} ({linha.matricula})
                          </td>
                          <td>
                            {formatarData(linha.inicio)} a{" "}
                            {formatarData(linha.fim)}
                          </td>
                          <td>{linha.saldo_dias - linha.dias_gozados} dias</td>
                          <td>{formatarData(linha.limite_concessivo)}</td>
                          <td>{linha.dias_ate_limite}</td>
                          <td>
                            <span
                              className={
                                nivel
                                  ? classeEtiquetaAlerta(nivel)
                                  : estilos.etiqueta
                              }
                            >
                              {nivel
                                ? ROTULOS_NIVEL_ALERTA[nivel]
                                : "No prazo"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {visao.painel.linhas.length === 0 && (
                      <tr>
                        <td colSpan={6}>Nenhum período em aberto.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={estilos.cartao}>
              <h2>Programações aguardando decisão</h2>
              <p className={estilos.subtitulo}>
                O fluxo normal é a aprovação do gestor na demanda. Aqui o DP/RH
                aprova exceções (ex.: pessoa sem gestor vigente ou urgência de
                vencimento).
              </p>
              {erroPainel && <p className={estilos.erro}>{erroPainel}</p>}
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>Gozo</th>
                      <th>Dias</th>
                      <th>Abono</th>
                      <th>Demanda</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.painel.solicitadas.map((programacao) => (
                      <tr key={programacao.id}>
                        <td>
                          {programacao.colaborador_nome} (
                          {programacao.matricula})
                        </td>
                        <td>
                          {formatarData(programacao.inicio)} a{" "}
                          {formatarData(programacao.fim)}
                        </td>
                        <td>{programacao.dias}</td>
                        <td>{programacao.abono_dias}</td>
                        <td>
                          {programacao.demanda_id !== null ? (
                            <Link
                              className={estilos.ligacao}
                              href={`/demandas/${programacao.demanda_id}`}
                            >
                              DEM-
                              {String(programacao.demanda_numero ?? 0).padStart(
                                4,
                                "0"
                              )}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            disabled={aprovando === programacao.id}
                            onClick={() => aprovarExcecao(programacao)}
                          >
                            {aprovando === programacao.id
                              ? "Aprovando…"
                              : "Aprovar exceção"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visao.painel.solicitadas.length === 0 && (
                      <tr>
                        <td colSpan={6}>Nenhuma programação pendente.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <p className={estilos.notaRodape}>
          Datas exibidas no horário de Brasília (America/Sao_Paulo). Limite para
          gozo = fim do período aquisitivo + 11 meses.
        </p>
      </main>
    </div>
  );
}
