"use client";

import Link from "next/link";
import { Fragment, FormEvent, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import {
  formatarCompetencia,
  formatarMinutos,
  formatarRelogio,
  ROTULOS_ORIGEM_MARCACAO,
  ROTULOS_STATUS_INTERCORRENCIA,
  ROTULOS_TIPO_INTERCORRENCIA,
  ROTULOS_TIPO_MARCACAO,
  StatusIntercorrencia,
} from "@/dominios/ponto/esquemas";
import estilos from "../../ponto.module.css";

// Contrato de GET /api/ponto/espelho/[colaboradorId].

interface Marcacao {
  id: number;
  momento_iso: string;
  data_local: string;
  minuto_local: number;
  tipo: keyof typeof ROTULOS_TIPO_MARCACAO;
  origem: keyof typeof ROTULOS_ORIGEM_MARCACAO;
  origem_referencia: string | null;
  efeito: string;
  substitui_marcacao_id: number | null;
  superada: boolean;
}

interface DiaApurado {
  data: string;
  dia_semana: number;
  feriado: string | null;
  previsto_minutos: number;
  trabalhado_minutos: number;
  intervalo_minutos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  atraso_minutos: number;
  falta_minutos: number;
  banco_minutos: number;
  intercorrencias: { data: string; tipo: string; detalhe: string }[];
  memoria: Record<string, unknown>;
}

interface Apuracao {
  id: number;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  memoria: Record<string, unknown> & { dias?: DiaApurado[] };
  calculada_em: string;
}

interface Intercorrencia {
  id: number;
  data: string;
  tipo: keyof typeof ROTULOS_TIPO_INTERCORRENCIA;
  status: StatusIntercorrencia;
  detalhe: string;
  observacao: string | null;
}

interface Espelho {
  colaborador: { id: number; nome_completo: string; matricula: string };
  ano: number;
  mes: number;
  jornada: string | null;
  apuracao: Apuracao | null;
  marcacoes: Marcacao[];
  intercorrencias: Intercorrencia[];
  saldo_banco_minutos: number;
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * TIMESTAMPTZ do Postgres chega como "2026-07-30 14:23:45.12+00": espaço no
 * lugar do T e fuso com dois dígitos, que o Date do JS não aceita.
 */
function formatarDataHora(iso: string): string {
  const comT = iso.includes("T") ? iso : iso.replace(" ", "T");
  const data = new Date(/[+-]\d{2}$/.test(comT) ? `${comT}:00` : comT);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function classeSaldo(minutos: number): string {
  if (minutos > 0) return estilos.saldoPositivo;
  if (minutos < 0) return estilos.saldoNegativo;
  return "";
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível carregar.";
}

/** Memória de cálculo do dia em texto — mesma ideia da folha. */
function memoriaEmLinhas(memoria: Record<string, unknown>): string {
  return Object.entries(memoria)
    .map(([chave, valor]) => {
      const texto =
        typeof valor === "object" && valor !== null
          ? JSON.stringify(valor)
          : String(valor);
      return `${chave}: ${texto}`;
    })
    .join("\n");
}

export function EspelhoPontoTela({
  colaboradorId,
  anoInicial,
  mesInicial,
  podeAjustar,
}: {
  colaboradorId: number;
  anoInicial: number | null;
  mesInicial: number | null;
  podeAjustar: boolean;
}) {
  const agora = new Date();
  const padraoMes = agora.getUTCMonth() === 0 ? 12 : agora.getUTCMonth();
  const padraoAno =
    agora.getUTCMonth() === 0
      ? agora.getUTCFullYear() - 1
      : agora.getUTCFullYear();

  const [ano, setAno] = useState(anoInicial ?? padraoAno);
  const [mes, setMes] = useState(mesInicial ?? padraoMes);
  const [espelho, setEspelho] = useState<Espelho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const [ajuste, setAjuste] = useState({
    data: "",
    hora: "",
    tipo: "entrada",
    justificativa: "",
    substitui_marcacao_id: "",
    anular: false,
  });
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);
  const [erroAjuste, setErroAjuste] = useState<string | null>(null);
  const [sucessoAjuste, setSucessoAjuste] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(
          `/api/ponto/espelho/${colaboradorId}?ano=${ano}&mes=${mes}`,
          { cache: "no-store" }
        );
        if (!ativo) return;
        if (!resposta.ok) {
          setErro(await lerErro(resposta));
          setEspelho(null);
          return;
        }
        setEspelho((await resposta.json()) as Espelho);
        setErro(null);
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [colaboradorId, ano, mes, versao]);

  async function enviarAjuste(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvandoAjuste(true);
    setErroAjuste(null);
    setSucessoAjuste(null);
    try {
      const resposta = await fetch("/api/ponto/marcacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colaborador_id: colaboradorId,
          // O fuso vai EXPLÍCITO: o servidor guarda em UTC e o dia de apuração
          // é o dia civil em America/Sao_Paulo.
          momento: `${ajuste.data}T${ajuste.hora}:00-03:00`,
          tipo: ajuste.tipo,
          justificativa: ajuste.justificativa,
          substitui_marcacao_id:
            ajuste.substitui_marcacao_id === ""
              ? null
              : Number(ajuste.substitui_marcacao_id),
          anular: ajuste.anular,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroAjuste(
          (dados as { erro?: string }).erro ?? "Não foi possível ajustar."
        );
        return;
      }
      setSucessoAjuste(
        "Marcação nova gravada (origem ajuste manual). Reapure a competência em /ponto para os números mudarem."
      );
      setAjuste({
        data: "",
        hora: "",
        tipo: "entrada",
        justificativa: "",
        substitui_marcacao_id: "",
        anular: false,
      });
      setVersao((v) => v + 1);
    } catch {
      setErroAjuste("Falha de conexão. Tente novamente.");
    } finally {
      setSalvandoAjuste(false);
    }
  }

  const dias = espelho?.apuracao?.memoria?.dias ?? [];
  const marcacoesPorDia = new Map<string, Marcacao[]>();
  for (const marcacao of espelho?.marcacoes ?? []) {
    const lista = marcacoesPorDia.get(marcacao.data_local) ?? [];
    lista.push(marcacao);
    marcacoesPorDia.set(marcacao.data_local, lista);
  }

  return (
    <div className={estilos.pagina}>
      <Cabecalho />

      <main className={estilos.conteudo}>
        <div className={estilos.espelhoCabecalho}>
          <div>
            <h1>Espelho de ponto</h1>
            <p className={estilos.subtitulo}>
              {espelho
                ? `${espelho.colaborador.nome_completo} · matrícula ${espelho.colaborador.matricula} · ${espelho.jornada ?? "sem escala vigente"}`
                : "Carregando…"}
            </p>
          </div>
          <Link className={estilos.ligacao} href="/ponto">
            ← Voltar ao ponto
          </Link>
        </div>

        {erro && <p className={estilos.erro}>{erro}</p>}

        <section className={estilos.cartao}>
          <div className={estilos.formulario}>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="mes">
                Mês
              </label>
              <select
                className={estilos.campo}
                id="mes"
                value={mes}
                onChange={(evento) => setMes(Number(evento.target.value))}
              >
                {MESES.map((nome, indice) => (
                  <option key={nome} value={indice + 1}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={estilos.campoGrupoCurto}>
              <label className={estilos.rotulo} htmlFor="ano">
                Ano
              </label>
              <input
                className={estilos.campo}
                id="ano"
                type="number"
                min={2020}
                max={2100}
                value={ano}
                onChange={(evento) => setAno(Number(evento.target.value))}
              />
            </div>
          </div>

          {espelho && (
            <div className={estilos.cartoesResumo} style={{ marginTop: 16 }}>
              <div className={estilos.cartaoResumo}>
                <strong>
                  {formatarMinutos(espelho.apuracao?.minutos_previstos ?? 0)}
                </strong>
                <span>previsto na competência</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong>
                  {formatarMinutos(espelho.apuracao?.minutos_trabalhados ?? 0)}
                </strong>
                <span>trabalhado</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong>
                  {formatarMinutos(
                    (espelho.apuracao?.he_50_minutos ?? 0) +
                      (espelho.apuracao?.he_100_minutos ?? 0)
                  )}
                </strong>
                <span>hora extra (50% + 100%)</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong>
                  {formatarMinutos(espelho.apuracao?.faltas_minutos ?? 0)}
                </strong>
                <span>faltas</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong className={classeSaldo(espelho.saldo_banco_minutos)}>
                  {formatarMinutos(espelho.saldo_banco_minutos)}
                </strong>
                <span>saldo atual do banco de horas</span>
              </div>
            </div>
          )}

          {espelho?.apuracao && (
            <p className={estilos.notaRodape}>
              Apurada em {formatarDataHora(espelho.apuracao.calculada_em)} ·
              adicional noturno{" "}
              {formatarMinutos(espelho.apuracao.adicional_noturno_minutos)} ·
              atrasos {formatarMinutos(espelho.apuracao.atrasos_minutos)} · DSR
              descontado {formatarMinutos(espelho.apuracao.dsr_desconto_minutos)}{" "}
              · saldo da competência{" "}
              {formatarMinutos(espelho.apuracao.saldo_banco_minutos)}
            </p>
          )}
        </section>

        {/* ------------------------------------------------ dia a dia */}
        <section className={estilos.cartao}>
          <h2>
            Dia a dia — {formatarCompetencia(ano, mes)} ({dias.length} dia(s))
          </h2>
          {!carregando && dias.length === 0 && (
            <p className={estilos.aviso}>
              Competência ainda não apurada para esta pessoa. As marcações
              abaixo existem, mas os números só nascem depois de apurar em{" "}
              <Link className={estilos.ligacao} href="/ponto">
                /ponto
              </Link>
              .
            </p>
          )}
          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Marcações</th>
                  <th className={estilos.numero}>Previsto</th>
                  <th className={estilos.numero}>Trabalhado</th>
                  <th className={estilos.numero}>Interv.</th>
                  <th className={estilos.numero}>HE 50%</th>
                  <th className={estilos.numero}>HE 100%</th>
                  <th className={estilos.numero}>Not.</th>
                  <th className={estilos.numero}>Atraso</th>
                  <th className={estilos.numero}>Falta</th>
                  <th className={estilos.numero}>Banco</th>
                </tr>
              </thead>
              <tbody>
                {dias.map((dia) => {
                  const marcacoes = marcacoesPorDia.get(dia.data) ?? [];
                  const aberto = diaAberto === dia.data;
                  const classeLinha = dia.feriado
                    ? estilos.diaFeriado
                    : dia.previsto_minutos === 0
                      ? estilos.diaFolga
                      : "";
                  return (
                    <Fragment key={dia.data}>
                      <tr
                        className={`${classeLinha} ${estilos.linhaClicavel}`}
                        onClick={() => setDiaAberto(aberto ? null : dia.data)}
                      >
                        <td>
                          <strong>{formatarData(dia.data)}</strong>{" "}
                          <span className={estilos.notaRodape}>
                            {DIAS_SEMANA[dia.dia_semana]}
                          </span>
                          {dia.feriado && (
                            <>
                              <br />
                              <span
                                className={`${estilos.etiqueta} ${estilos.etiquetaAberta}`}
                              >
                                {dia.feriado}
                              </span>
                            </>
                          )}
                          {dia.intercorrencias.length > 0 && (
                            <>
                              <br />
                              <span
                                className={`${estilos.etiqueta} ${estilos.etiquetaConferencia}`}
                              >
                                {dia.intercorrencias.length} pendência(s)
                              </span>
                            </>
                          )}
                        </td>
                        <td className={estilos.marcacoes}>
                          {marcacoes.length === 0
                            ? "—"
                            : marcacoes.map((marcacao) => (
                                <span
                                  key={marcacao.id}
                                  className={
                                    marcacao.superada ||
                                    marcacao.efeito === "anulacao"
                                      ? estilos.marcacaoSuperada
                                      : marcacao.origem === "ajuste_manual"
                                        ? estilos.marcacaoAjuste
                                        : ""
                                  }
                                  title={`#${marcacao.id} · ${ROTULOS_TIPO_MARCACAO[marcacao.tipo]} · ${ROTULOS_ORIGEM_MARCACAO[marcacao.origem]}${marcacao.origem_referencia ? ` · ${marcacao.origem_referencia}` : ""}`}
                                >
                                  {formatarRelogio(marcacao.minuto_local)}{" "}
                                </span>
                              ))}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.previsto_minutos)}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.trabalhado_minutos)}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.intervalo_minutos)}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.he_50_minutos)}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.he_100_minutos)}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.adicional_noturno_minutos)}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.atraso_minutos)}
                        </td>
                        <td className={estilos.numero}>
                          {formatarMinutos(dia.falta_minutos)}
                        </td>
                        <td
                          className={`${estilos.numero} ${classeSaldo(dia.banco_minutos)}`}
                        >
                          {formatarMinutos(dia.banco_minutos)}
                        </td>
                      </tr>
                      {aberto && (
                        <tr className={estilos.linhaDetalhe}>
                          <td colSpan={11}>
                            <strong>Memória de cálculo de {formatarData(dia.data)}</strong>
                            <pre className={estilos.memoriaConteudo}>
                              {memoriaEmLinhas(dia.memoria)}
                            </pre>
                            {dia.intercorrencias.length > 0 && (
                              <ul className={estilos.rejeicoes}>
                                {dia.intercorrencias.map((item, indice) => (
                                  <li key={`${item.tipo}-${indice}`}>
                                    {item.tipo}: {item.detalhe}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {marcacoes.length > 0 && (
                              <table className={estilos.tabela}>
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Hora</th>
                                    <th>Tipo</th>
                                    <th>Origem</th>
                                    <th>Justificativa / referência</th>
                                    <th>Situação</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {marcacoes.map((marcacao) => (
                                    <tr key={marcacao.id}>
                                      <td>{marcacao.id}</td>
                                      <td>
                                        {formatarRelogio(marcacao.minuto_local)}
                                      </td>
                                      <td>
                                        {ROTULOS_TIPO_MARCACAO[marcacao.tipo]}
                                      </td>
                                      <td>
                                        {ROTULOS_ORIGEM_MARCACAO[marcacao.origem]}
                                      </td>
                                      <td>{marcacao.origem_referencia ?? "—"}</td>
                                      <td>
                                        {marcacao.efeito === "anulacao"
                                          ? "anulada"
                                          : marcacao.superada
                                            ? `substituída`
                                            : "válida"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={estilos.notaRodape}>
            Clique no dia para abrir a memória de cálculo — a mesma disciplina
            da folha: nenhum número aparece sem a conta que o gerou. Batida em
            laranja veio de ajuste manual; riscada foi substituída ou anulada e
            não conta na apuração.
          </p>
        </section>

        {/* ------------------------------------------------ intercorrências */}
        {espelho && espelho.intercorrencias.length > 0 && (
          <section className={estilos.cartao}>
            <h2>Intercorrências da competência</h2>
            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Detalhe</th>
                    <th>Situação</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {espelho.intercorrencias.map((item) => (
                    <tr key={item.id}>
                      <td>{formatarData(item.data)}</td>
                      <td>{ROTULOS_TIPO_INTERCORRENCIA[item.tipo]}</td>
                      <td>{item.detalhe}</td>
                      <td>{ROTULOS_STATUS_INTERCORRENCIA[item.status]}</td>
                      <td>{item.observacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ------------------------------------------------ correção */}
        {podeAjustar && (
          <section className={estilos.cartao}>
            <h2>Corrigir marcação</h2>
            <p className={estilos.notaRodape}>
              A correção NUNCA edita a batida anterior: grava uma nova, com
              origem <em>ajuste manual</em> e justificativa. Para tirar uma
              batida indevida da apuração, informe o número dela e marque
              “anular”.
            </p>
            <form className={estilos.formulario} onSubmit={enviarAjuste}>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="ajuste-data">
                  Data
                </label>
                <input
                  className={estilos.campo}
                  id="ajuste-data"
                  type="date"
                  required
                  value={ajuste.data}
                  onChange={(evento) =>
                    setAjuste({ ...ajuste, data: evento.target.value })
                  }
                />
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="ajuste-hora">
                  Hora
                </label>
                <input
                  className={estilos.campo}
                  id="ajuste-hora"
                  type="time"
                  required
                  value={ajuste.hora}
                  onChange={(evento) =>
                    setAjuste({ ...ajuste, hora: evento.target.value })
                  }
                />
              </div>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="ajuste-tipo">
                  Tipo
                </label>
                <select
                  className={estilos.campo}
                  id="ajuste-tipo"
                  value={ajuste.tipo}
                  onChange={(evento) =>
                    setAjuste({ ...ajuste, tipo: evento.target.value })
                  }
                >
                  {Object.entries(ROTULOS_TIPO_MARCACAO).map(
                    ([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="ajuste-substitui">
                  Substitui #
                </label>
                <input
                  className={estilos.campo}
                  id="ajuste-substitui"
                  type="number"
                  min={1}
                  value={ajuste.substitui_marcacao_id}
                  onChange={(evento) =>
                    setAjuste({
                      ...ajuste,
                      substitui_marcacao_id: evento.target.value,
                    })
                  }
                />
              </div>
              <label className={estilos.caixaMarcar}>
                <input
                  type="checkbox"
                  checked={ajuste.anular}
                  onChange={(evento) =>
                    setAjuste({ ...ajuste, anular: evento.target.checked })
                  }
                />
                anular a marcação informada
              </label>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="ajuste-justificativa">
                  Justificativa (mínimo 10 caracteres)
                </label>
                <input
                  className={estilos.campo}
                  id="ajuste-justificativa"
                  type="text"
                  required
                  minLength={10}
                  value={ajuste.justificativa}
                  onChange={(evento) =>
                    setAjuste({ ...ajuste, justificativa: evento.target.value })
                  }
                />
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={salvandoAjuste}
              >
                {salvandoAjuste ? "Gravando…" : "Gravar correção"}
              </button>
            </form>
            {erroAjuste && <p className={estilos.erro}>{erroAjuste}</p>}
            {sucessoAjuste && <p className={estilos.sucesso}>{sucessoAjuste}</p>}
          </section>
        )}

        <p className={estilos.notaRodape}>
          Horários no fuso de Brasília (America/Sao_Paulo). Ver o espelho de
          outra pessoa é leitura de dado sensível e fica registrada na trilha de
          auditoria.
        </p>
      </main>
    </div>
  );
}
