"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { acaoCabecalho, Cabecalho } from "@/app/cabecalho";
import {
  formatarCompetencia,
  formatarMinutos,
  ROTULOS_STATUS_INTERCORRENCIA,
  ROTULOS_TIPO_INTERCORRENCIA,
  StatusIntercorrencia,
} from "@/dominios/ponto/esquemas";
import estilos from "./ponto.module.css";

// Contratos das rotas de /api/ponto — repetidos aqui de propósito (convenção
// das outras telas): o cliente conhece o contrato da rota, não o módulo do
// servidor.

interface Competencia {
  ano: number;
  mes: number;
  pessoas: number;
  he_minutos: number;
  saldo_minutos: number;
  ultima_apuracao_em: string;
}

interface LinhaApuracao {
  apuracao_id: number;
  colaborador_id: number;
  nome: string;
  matricula: string;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  intercorrencias_abertas: number;
  calculada_em: string;
}

interface Intercorrencia {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data: string;
  tipo: keyof typeof ROTULOS_TIPO_INTERCORRENCIA;
  status: StatusIntercorrencia;
  detalhe: string;
  observacao: string | null;
}

interface Visao {
  competencia: { ano: number; mes: number };
  pode: {
    administrar: boolean;
    ajustar: boolean;
    parametros: boolean;
    importar: boolean;
    ver_equipe: boolean;
  };
  competencias: Competencia[];
  apuracoes: LinhaApuracao[];
  /** Uma PÁGINA da fila — não a fila inteira. Ver os três campos abaixo. */
  intercorrencias: Intercorrencia[];
  /** Quantas abertas existem de verdade, ignorando o limite da página. */
  intercorrencias_total: number;
  intercorrencias_limite: number;
  /** Data da mais antiga que existe — é ela que a ordenação por data DESC corta. */
  intercorrencia_mais_antiga: string | null;
}

interface ResultadoImportacao {
  lote_id: number;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  rejeicoes: { linha: number; motivo: string; conteudo: string }[];
}

interface ResultadoApuracao {
  ano: number;
  mes: number;
  apurados: number;
  sem_escala: number;
  intercorrencias: number;
  saldo_total_minutos: number;
  /**
   * Cadastro que mudou DURANTE a rodada sem impedir a gravação (desligamento,
   * escala encerrada). O mês foi apurado com o cadastro do início — quem for
   * fechar precisa ver isso, senão só descobre na rescisão.
   */
  avisos_cadastro?: {
    colaborador_id: number;
    nome: string;
    matricula: string;
    aviso: string;
  }[];
}

/** Corpo de GET/POST /api/ponto/banco/expiracao. */
interface Expiracao {
  data_referencia: string;
  total_minutos: number;
  movimentos: number;
  pessoas: {
    colaborador_id: number;
    nome: string;
    matricula: string;
    saldo_minutos: number;
    minutos_vencidos: number;
    creditos_vencidos: { data: string; minutos: number; vence_em: string }[];
    proximo_vencimento: { data: string; minutos: number } | null;
  }[];
}

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

/**
 * TIMESTAMPTZ do Postgres chega como "2026-07-30 14:23:45.12+00": espaço no
 * lugar do T e fuso com dois dígitos, que o Date do JS não aceita. Normaliza
 * antes de formatar — senão a coluna vira "—" sem ninguém entender por quê.
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

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function classeSaldo(minutos: number): string {
  if (minutos > 0) return estilos.saldoPositivo;
  if (minutos < 0) return estilos.saldoNegativo;
  return "";
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível concluir.";
}

export function PainelPonto() {
  const hoje = new Date();
  const anteriorMes = hoje.getUTCMonth() === 0 ? 12 : hoje.getUTCMonth();
  const anteriorAno =
    hoje.getUTCMonth() === 0 ? hoje.getUTCFullYear() - 1 : hoje.getUTCFullYear();

  const [ano, setAno] = useState(anteriorAno);
  const [mes, setMes] = useState(anteriorMes);
  const [visao, setVisao] = useState<Visao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const [apurando, setApurando] = useState(false);
  const [resultadoApuracao, setResultadoApuracao] =
    useState<ResultadoApuracao | null>(null);

  const [arquivoNome, setArquivoNome] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [separador, setSeparador] = useState(";");
  const [importando, setImportando] = useState(false);
  const [relatorio, setRelatorio] = useState<ResultadoImportacao | null>(null);
  const [erroImportacao, setErroImportacao] = useState<string | null>(null);

  const [tratando, setTratando] = useState<number | null>(null);
  const [erroFila, setErroFila] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});

  /** A página não deu conta da fila inteira — e isso tem que aparecer. */
  const filaCortada =
    visao != null &&
    visao.intercorrencias_total > visao.intercorrencias.length &&
    visao.intercorrencia_mais_antiga !== null;

  const [expiracao, setExpiracao] = useState<Expiracao | null>(null);
  const [expirando, setExpirando] = useState(false);
  const [erroExpiracao, setErroExpiracao] = useState<string | null>(null);
  const [expirou, setExpirou] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/ponto?ano=${ano}&mes=${mes}`, {
          cache: "no-store",
        });
        if (!ativo) return;
        if (!resposta.ok) {
          setErro(await lerErro(resposta));
          return;
        }
        setVisao((await resposta.json()) as Visao);
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
  }, [ano, mes, versao]);

  async function apurar(colaboradorId?: number) {
    setApurando(true);
    setResultadoApuracao(null);
    setErro(null);
    try {
      const resposta = await fetch("/api/ponto/apurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano,
          mes,
          colaborador_id: colaboradorId ?? null,
        }),
      });
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        return;
      }
      setResultadoApuracao((await resposta.json()) as ResultadoApuracao);
      setVersao((v) => v + 1);
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setApurando(false);
    }
  }

  async function importar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setImportando(true);
    setErroImportacao(null);
    setRelatorio(null);
    try {
      const resposta = await fetch("/api/ponto/importacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivo: arquivoNome || "colado-na-tela.csv",
          ano,
          mes,
          conteudo,
          separador,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErroImportacao(
          (dados as { erro?: string }).erro ?? "Não foi possível importar."
        );
        return;
      }
      setRelatorio(dados as ResultadoImportacao);
      setVersao((v) => v + 1);
    } catch {
      setErroImportacao("Falha de conexão. Tente novamente.");
    } finally {
      setImportando(false);
    }
  }

  // Prévia da expiração: quem tem hora vencida pelo prazo de compensação da
  // regra vigente. Só leitura — nada é gravado até o DP mandar.
  useEffect(() => {
    if (!visao?.pode.administrar) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/ponto/banco/expiracao", {
          cache: "no-store",
        });
        if (!ativo || !resposta.ok) return;
        setExpiracao((await resposta.json()) as Expiracao);
      } catch {
        /* a prévia é acessório da tela: erro aqui não derruba o painel */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [visao?.pode.administrar, versao]);

  async function expirar() {
    if (
      !window.confirm(
        "Lançar a expiração das horas que passaram do prazo de compensação? " +
          "O movimento é definitivo: o livro é append-only e só se desfaz " +
          "lançando o contrário."
      )
    ) {
      return;
    }
    setExpirando(true);
    setErroExpiracao(null);
    setExpirou(null);
    try {
      const resposta = await fetch("/api/ponto/banco/expiracao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resposta.ok) {
        setErroExpiracao(await lerErro(resposta));
        return;
      }
      const dados = (await resposta.json()) as Expiracao;
      setExpirou(
        `${dados.movimentos} movimento(s) de expiração lançado(s), somando ` +
          `${formatarMinutos(dados.total_minutos)}.`
      );
      setVersao((v) => v + 1);
    } catch {
      setErroExpiracao("Falha de conexão. Tente novamente.");
    } finally {
      setExpirando(false);
    }
  }

  async function tratar(id: number, status: "justificada" | "ignorada") {
    setTratando(id);
    setErroFila(null);
    try {
      const resposta = await fetch(`/api/ponto/intercorrencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          observacao: observacoes[id] ?? "",
        }),
      });
      if (!resposta.ok) {
        setErroFila(await lerErro(resposta));
        return;
      }
      setVersao((v) => v + 1);
    } catch {
      setErroFila("Falha de conexão. Tente novamente.");
    } finally {
      setTratando(null);
    }
  }

  const totais = (visao?.apuracoes ?? []).reduce(
    (acumulado, linha) => ({
      trabalhado: acumulado.trabalhado + linha.minutos_trabalhados,
      he: acumulado.he + linha.he_50_minutos + linha.he_100_minutos,
      faltas: acumulado.faltas + linha.faltas_minutos,
      saldo: acumulado.saldo + linha.saldo_banco_minutos,
    }),
    { trabalhado: 0, he: 0, faltas: 0, saldo: 0 }
  );

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        {visao?.pode.parametros && (
          <Link className={acaoCabecalho} href="/ponto/parametros">
            Parâmetros
          </Link>
        )}
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Ponto e banco de horas</h1>
        <p className={estilos.subtitulo}>
          Importar marcações, apurar a competência, tratar intercorrências e
          abrir o espelho de cada pessoa. Horas em minutos inteiros; valor em
          reais da hora extra é assunto da folha.
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}

        {/* ------------------------------------------------ competência */}
        <section className={estilos.cartao}>
          <h2>Competência</h2>
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
            <button
              className={estilos.botao}
              type="button"
              disabled={apurando || carregando}
              onClick={() => void apurar()}
            >
              {apurando ? "Apurando…" : "Apurar competência"}
            </button>
          </div>
          <p className={estilos.notaRodape}>
            Reapurar a mesma competência é permitido: o banco de horas recebe o
            estorno do lançamento anterior e o novo, e a intercorrência já
            justificada não reabre.
          </p>

          {resultadoApuracao && (
            <p className={estilos.sucesso}>
              {resultadoApuracao.apurados} pessoa(s) apurada(s) em{" "}
              {formatarCompetencia(resultadoApuracao.ano, resultadoApuracao.mes)}{" "}
              · {resultadoApuracao.intercorrencias} intercorrência(s) ·{" "}
              {resultadoApuracao.sem_escala} sem escala vigente · saldo somado{" "}
              {formatarMinutos(resultadoApuracao.saldo_total_minutos)}
            </p>
          )}

          {resultadoApuracao &&
            resultadoApuracao.avisos_cadastro &&
            resultadoApuracao.avisos_cadastro.length > 0 && (
              <div className={estilos.aviso}>
                <strong>
                  Cadastro mudou enquanto a competência era apurada
                </strong>
                <ul>
                  {resultadoApuracao.avisos_cadastro.map((item) => (
                    <li key={item.colaborador_id}>
                      {item.nome} (matrícula {item.matricula}): {item.aviso}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {visao && visao.competencias.length > 0 && (
            <>
              <h3>Competências já apuradas</h3>
              <div className={estilos.tabelaEnvolucro}>
                <table className={estilos.tabela}>
                  <thead>
                    <tr>
                      <th>Competência</th>
                      <th className={estilos.numero}>Pessoas</th>
                      <th className={estilos.numero}>Hora extra</th>
                      <th className={estilos.numero}>Saldo ao banco</th>
                      <th>Última apuração</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.competencias.map((item) => (
                      <tr key={`${item.ano}-${item.mes}`}>
                        <td>
                          <strong>
                            {formatarCompetencia(item.ano, item.mes)}
                          </strong>
                        </td>
                        <td className={estilos.numero}>{item.pessoas}</td>
                        <td className={estilos.numero}>
                          {formatarMinutos(item.he_minutos)}
                        </td>
                        <td
                          className={`${estilos.numero} ${classeSaldo(item.saldo_minutos)}`}
                        >
                          {formatarMinutos(item.saldo_minutos)}
                        </td>
                        <td>{formatarDataHora(item.ultima_apuracao_em)}</td>
                        <td>
                          <button
                            className={estilos.botaoLinha}
                            type="button"
                            onClick={() => {
                              setAno(item.ano);
                              setMes(item.mes);
                            }}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ------------------------------------------------ prazo e expiração */}
        {visao?.pode.administrar && expiracao && expiracao.pessoas.length > 0 && (
          <section className={estilos.cartao}>
            <h2>Prazo de compensação</h2>
            <p className={estilos.notaRodape}>
              A hora guardada tem prazo: o da regra vigente de cada pessoa
              (empresa → unidade ou cargo → pessoa, em Parâmetros). A conta é
              FIFO — folga e atraso consomem o crédito mais antigo primeiro —, e
              o que sobra de pé além do prazo está vencido. Referência:{" "}
              {formatarData(expiracao.data_referencia)}.
            </p>

            {erroExpiracao && <p className={estilos.erro}>{erroExpiracao}</p>}
            {expirou && <p className={estilos.sucesso}>{expirou}</p>}

            <div className={estilos.tabelaEnvolucro}>
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th className={estilos.numero}>Saldo</th>
                    <th className={estilos.numero}>Vencido</th>
                    <th>Próximo vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {expiracao.pessoas.map((pessoa) => (
                    <tr key={pessoa.colaborador_id}>
                      <td>
                        {pessoa.nome}
                        <br />
                        <span className={estilos.notaRodape}>
                          {pessoa.matricula}
                          {pessoa.creditos_vencidos.length > 0 &&
                            ` · ${pessoa.creditos_vencidos
                              .map(
                                (credito) =>
                                  `${formatarMinutos(credito.minutos)} de ${formatarData(credito.data)} (venceu ${formatarData(credito.vence_em)})`
                              )
                              .join("; ")}`}
                        </span>
                      </td>
                      <td
                        className={`${estilos.numero} ${classeSaldo(pessoa.saldo_minutos)}`}
                      >
                        {formatarMinutos(pessoa.saldo_minutos)}
                      </td>
                      <td className={estilos.numero}>
                        {pessoa.minutos_vencidos > 0
                          ? formatarMinutos(pessoa.minutos_vencidos)
                          : "—"}
                      </td>
                      <td>
                        {pessoa.proximo_vencimento
                          ? `${formatarMinutos(pessoa.proximo_vencimento.minutos)} em ${formatarData(pessoa.proximo_vencimento.data)}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expiracao.total_minutos > 0 ? (
              <>
                <button
                  className={estilos.botao}
                  type="button"
                  disabled={expirando}
                  onClick={() => void expirar()}
                >
                  {expirando
                    ? "Expirando…"
                    : `Expirar ${formatarMinutos(expiracao.total_minutos)} vencidos`}
                </button>
                <p className={estilos.notaRodape}>
                  Lança um movimento de origem &quot;Expiração de saldo&quot; por
                  pessoa, com os créditos vencidos na observação. Rodar de novo
                  no mesmo dia não expira nada: o débito já consumiu esses
                  créditos.
                </p>
              </>
            ) : (
              <p className={estilos.notaRodape}>
                Nada vencido hoje — a coluna acima mostra o que vence a seguir.
              </p>
            )}
          </section>
        )}

        {/* ------------------------------------------------ importação */}
        {visao?.pode.importar && (
          <section className={estilos.cartao}>
            <h2>Importar marcações</h2>
            <p className={estilos.notaRodape}>
              Quatro colunas, com ou sem cabeçalho:{" "}
              <code>matricula ; data ; hora ; tipo</code>. Linha ruim vira
              rejeição COM MOTIVO e o resto do arquivo entra normalmente —
              reimportar o mesmo arquivo não duplica batida.
            </p>
            <form className={estilos.formulario} onSubmit={importar}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="arquivo">
                  Arquivo (CSV do relógio)
                </label>
                <input
                  className={estilos.campo}
                  id="arquivo"
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={async (evento) => {
                    const arquivo = evento.target.files?.[0];
                    if (!arquivo) return;
                    setArquivoNome(arquivo.name);
                    setConteudo(await arquivo.text());
                  }}
                />
              </div>
              <div className={estilos.campoGrupoCurto}>
                <label className={estilos.rotulo} htmlFor="separador">
                  Separador
                </label>
                <select
                  className={estilos.campo}
                  id="separador"
                  value={separador}
                  onChange={(evento) => setSeparador(evento.target.value)}
                >
                  <option value=";">ponto e vírgula</option>
                  <option value=",">vírgula</option>
                  <option value={"\t"}>tabulação</option>
                </select>
              </div>
              <button
                className={estilos.botao}
                type="submit"
                disabled={importando || conteudo.trim() === ""}
              >
                {importando ? "Importando…" : "Importar para a competência"}
              </button>
            </form>
            <div className={estilos.campoGrupo} style={{ marginTop: 12 }}>
              <label className={estilos.rotulo} htmlFor="conteudo">
                …ou cole o conteúdo aqui
              </label>
              <textarea
                className={estilos.campo}
                id="conteudo"
                rows={4}
                value={conteudo}
                onChange={(evento) => setConteudo(evento.target.value)}
                placeholder={"1001;2026-06-01;08:00;entrada"}
              />
            </div>

            {erroImportacao && <p className={estilos.erro}>{erroImportacao}</p>}

            {relatorio && (
              <div className={estilos.blocoImportacao}>
                <strong>
                  Lote {relatorio.lote_id}: {relatorio.linhas_lidas} linha(s)
                  lida(s), {relatorio.linhas_aceitas} aceita(s),{" "}
                  {relatorio.linhas_rejeitadas} rejeitada(s).
                </strong>
                {relatorio.rejeicoes.length > 0 && (
                  <ul className={estilos.rejeicoes}>
                    {relatorio.rejeicoes.slice(0, 50).map((rejeicao) => (
                      <li key={rejeicao.linha}>
                        linha {rejeicao.linha}: {rejeicao.motivo} —{" "}
                        <code>{rejeicao.conteudo}</code>
                      </li>
                    ))}
                    {relatorio.rejeicoes.length > 50 && (
                      <li>
                        … e mais {relatorio.rejeicoes.length - 50} rejeição(ões)
                        no relatório do lote.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------ intercorrências */}
        <section className={estilos.cartao}>
          <h2>
            Intercorrências abertas ({visao?.intercorrencias_total ?? 0})
          </h2>
          {/*
            O título mostra o TOTAL, não o tamanho da lista: a fila vem paginada
            e o corte é por data DESC, então o que fica de fora são as MAIS
            ANTIGAS — as que estão vencendo. Quando corta, a tela diz que cortou
            e diz desde quando existe pendência, senão o DP trabalha achando que
            a fila acabou.
          */}
          {filaCortada && (
            <div className={estilos.aviso}>
              Mostrando {visao?.intercorrencias.length} das{" "}
              {visao?.intercorrencias_total} abertas — as mais recentes. Há
              pendência aberta desde{" "}
              {formatarData(visao!.intercorrencia_mais_antiga!)}, que não cabe
              nesta lista. Trate por competência (o espelho de cada pessoa mostra
              a fila do mês dela) para chegar às mais antigas.
            </div>
          )}
          <p className={estilos.notaRodape}>
            Corrigir de verdade é gravar marcação nova (origem{" "}
            <em>ajuste manual</em>) no espelho da pessoa e reapurar — nunca
            editar a batida anterior. Justificar ou ignorar exige observação: é
            o texto que a fiscalização lê.
          </p>
          {erroFila && <p className={estilos.erro}>{erroFila}</p>}
          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Colaborador</th>
                  <th>Tipo</th>
                  <th>Detalhe</th>
                  <th>Observação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(visao?.intercorrencias ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{formatarData(item.data)}</td>
                    <td>
                      <Link
                        className={estilos.ligacao}
                        href={`/ponto/espelho/${item.colaborador_id}?ano=${item.data.slice(0, 4)}&mes=${Number(item.data.slice(5, 7))}`}
                      >
                        {item.colaborador_nome}
                      </Link>
                      <br />
                      <span className={estilos.notaRodape}>
                        matrícula {item.matricula}
                      </span>
                    </td>
                    <td>{ROTULOS_TIPO_INTERCORRENCIA[item.tipo]}</td>
                    <td>{item.detalhe}</td>
                    <td>
                      <input
                        className={estilos.campo}
                        type="text"
                        value={observacoes[item.id] ?? ""}
                        placeholder="por que foi assim?"
                        onChange={(evento) =>
                          setObservacoes((atual) => ({
                            ...atual,
                            [item.id]: evento.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        className={estilos.botaoLinha}
                        type="button"
                        disabled={tratando === item.id}
                        onClick={() => void tratar(item.id, "justificada")}
                      >
                        Justificar
                      </button>{" "}
                      <button
                        className={estilos.botaoLinha}
                        type="button"
                        disabled={tratando === item.id}
                        onClick={() => void tratar(item.id, "ignorada")}
                      >
                        Ignorar
                      </button>
                    </td>
                  </tr>
                ))}
                {(visao?.intercorrencias.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6}>
                      {carregando
                        ? "Carregando…"
                        : "Nenhuma intercorrência aberta. Fila limpa."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className={estilos.notaRodape}>
            Situações possíveis:{" "}
            {Object.values(ROTULOS_STATUS_INTERCORRENCIA).join(" · ")}.
          </p>
        </section>

        {/* ------------------------------------------------ apuração da competência */}
        <section className={estilos.cartao}>
          <h2>
            Apuração de {formatarCompetencia(ano, mes)} (
            {visao?.apuracoes.length ?? 0} pessoa(s))
          </h2>

          {visao && visao.apuracoes.length > 0 && (
            <div className={estilos.cartoesResumo}>
              <div className={estilos.cartaoResumo}>
                <strong>{formatarMinutos(totais.trabalhado)}</strong>
                <span>horas trabalhadas na competência</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong>{formatarMinutos(totais.he)}</strong>
                <span>hora extra (50% + 100%)</span>
              </div>
              <div className={estilos.cartaoResumo}>
                <strong>{formatarMinutos(totais.faltas)}</strong>
                <span>faltas apuradas</span>
              </div>
              <div
                className={`${estilos.cartaoResumo} ${totais.saldo < 0 ? estilos.cartaoResumoDestaque : ""}`}
              >
                <strong className={classeSaldo(totais.saldo)}>
                  {formatarMinutos(totais.saldo)}
                </strong>
                <span>saldo mandado ao banco de horas</span>
              </div>
            </div>
          )}

          <div className={estilos.tabelaEnvolucro}>
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th className={estilos.numero}>Previsto</th>
                  <th className={estilos.numero}>Trabalhado</th>
                  <th className={estilos.numero}>HE 50%</th>
                  <th className={estilos.numero}>HE 100%</th>
                  <th className={estilos.numero}>Noturno</th>
                  <th className={estilos.numero}>Faltas</th>
                  <th className={estilos.numero}>Atrasos</th>
                  <th className={estilos.numero}>DSR</th>
                  <th className={estilos.numero}>Banco</th>
                  <th className={estilos.numero}>Pend.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(visao?.apuracoes ?? []).map((linha) => (
                  <tr key={linha.apuracao_id}>
                    <td>
                      <strong>{linha.nome}</strong>
                      <br />
                      <span className={estilos.notaRodape}>
                        matrícula {linha.matricula}
                      </span>
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.minutos_previstos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.minutos_trabalhados)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.he_50_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.he_100_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.adicional_noturno_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.faltas_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.atrasos_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {formatarMinutos(linha.dsr_desconto_minutos)}
                    </td>
                    <td
                      className={`${estilos.numero} ${classeSaldo(linha.saldo_banco_minutos)}`}
                    >
                      {formatarMinutos(linha.saldo_banco_minutos)}
                    </td>
                    <td className={estilos.numero}>
                      {linha.intercorrencias_abertas > 0 ? (
                        <span
                          className={`${estilos.etiqueta} ${estilos.etiquetaConferencia}`}
                        >
                          {linha.intercorrencias_abertas}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link
                        className={estilos.ligacao}
                        href={`/ponto/espelho/${linha.colaborador_id}?ano=${ano}&mes=${mes}`}
                      >
                        Espelho
                      </Link>
                    </td>
                  </tr>
                ))}
                {(visao?.apuracoes.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={12}>
                      {carregando
                        ? "Carregando…"
                        : "Competência ainda não apurada. Importe as marcações e clique em “Apurar competência”."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className={estilos.notaRodape}>
          Datas e horas no horário de Brasília (America/Sao_Paulo). Marcação é
          append-only: correção é batida nova apontando para a anterior, e o
          saldo do banco é a soma dos movimentos — nunca um campo editável.
        </p>
      </main>
    </div>
  );
}
