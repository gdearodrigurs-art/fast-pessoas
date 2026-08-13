"use client";

import { useCallback, useEffect, useState } from "react";
import { Cabecalho } from "@/app/cabecalho";
import estilos from "./page.module.css";
import {
  data as fData,
  decimal,
  inteiro,
  mesCurto,
  mesLongo,
  moeda,
  moedaCurta,
  percentual,
} from "./formato";

// ------------------------------------------------------------------ contrato
// Espelho dos tipos de src/dominios/painel-executivo/esquemas.ts. Duplicado de
// propósito: o client component não importa do domínio para não arrastar o
// repositório (e a conexão com o banco) para o pacote do navegador.

interface PontoSerie {
  mes: string;
  valor: number | null;
  parcial: boolean;
}

interface Tendencia {
  direcao: "sobe" | "desce" | "estavel" | "indefinida";
  texto: string;
  subir_e_bom: boolean;
}

interface MicroSerie {
  rotulo: string;
  unidade: "qtd" | "%" | "R$" | "nota";
  pontos: PontoSerie[];
  tendencia: Tendencia;
}

interface LinhaContagem {
  rotulo: string;
  quantidade: number;
}

interface RecortePainel {
  chave: string;
  rotulo: string;
  quantidade: number | null;
  suprimido: boolean;
}

interface CardBloqueado {
  disponivel: false;
  bloqueio: "permissao";
  requer_chave: string;
  motivo: string;
}

interface CardSemFonte {
  disponivel: false;
  bloqueio: "sem_fonte";
  motivo: string;
}
interface CardDesenvolvimento {
  disponivel: true;
  planos_ativos: number;
  pessoas: number;
  acoes_total: number;
  acoes_concluidas: number;
  acoes_andamento: number;
}

interface CardCustoPessoal {
  disponivel: true;
  periodo: string;
  conta: string;
  competencia: { ano: number; mes: number; fechada_em: string };
  pessoas: number;
  proventos: number;
  encargo_fgts: number;
  total: number;
  sem_lotacao: number;
  por_unidade: {
    unidade: string;
    centro_custo: string;
    pessoas: number;
    proventos: number;
    encargo_fgts: number;
    total: number;
  }[];
  serie: MicroSerie;
}

interface Painel {
  hoje: string;
  janela_12m: { inicio: string; fim: string };
  headcount: {
    periodo: string;
    conta: string;
    ativos: number;
    por_unidade: LinhaContagem[];
    sem_lotacao: number;
    por_vinculo: LinhaContagem[];
    variacao_12m: {
      referencia: string;
      ativos_antes: number;
      delta: number;
      percentual: number;
    };
    serie: MicroSerie;
  };
  turnover: {
    periodo: string;
    conta: string;
    percentual: number;
    desligados: number;
    admitidos: number;
    headcount_inicio: number;
    headcount_fim: number;
    headcount_medio: number;
    serie: MicroSerie;
  };
  custo_pessoal: CardCustoPessoal | CardBloqueado | CardSemFonte;
  tempo_contratacao: {
    periodo: string;
    conta: string;
    dias_medio: number | null;
    casos: number;
    detalhe: {
      requisicao_id: number;
      cargo_nome: string;
      unidade: string;
      aprovada_em: string;
      admitido_em: string;
      dias: number;
    }[];
    perna_recrutamento: { vagas: number; dias_medio: number | null };
  };
  absenteismo: {
    periodo: string;
    conta: string;
    percentual: number;
    dias_afastamento: number;
    dias_uteis_previstos: number;
    serie: MicroSerie;
  };
  promocoes: {
    periodo: string;
    conta: string;
    promocoes: number;
    transferencias: number;
    serie: MicroSerie;
  };
  diversidade: {
    periodo: string;
    conta: string;
    total_quadro: number;
    com_data_nascimento: number;
    sem_data_nascimento: number;
    minimo_por_recorte: number;
    por_genero: RecortePainel[];
    por_faixa_idade: RecortePainel[];
    serie: MicroSerie;
  };
  clima: {
    periodo: string;
    conta: string;
    media_checkin: number | null;
    respostas_checkin: number;
    enps: {
      pesquisa: string;
      encerrada_em: string;
      pontos: number | null;
      respostas: number | null;
      promotores: number | null;
      detratores: number | null;
      minimo_amostra: number;
    } | null;
    serie: MicroSerie;
  };
  performance: {
    periodo: string;
    conta: string;
    safra: string | null;
    avaliacoes: number;
    faixas: {
      rotulo: string;
      minimo: number;
      maximo: number;
      quantidade: number;
      percentual: number;
    }[];
    sem_serie: string;
  };
  desenvolvimento: CardDesenvolvimento;
}

// ------------------------------------------------------------------ peças

function formatarPonto(valor: number, unidade: MicroSerie["unidade"]): string {
  if (unidade === "R$") return moedaCurta(valor);
  if (unidade === "%") return percentual(valor);
  if (unidade === "nota") return decimal(valor, 2);
  return inteiro(valor);
}

const LARGURA = 240;
const ALTURA = 40;

/**
 * Micro-série em SVG puro — sem biblioteca de gráfico, de propósito: são 12
 * pontos, e uma dependência de charting num painel interno é peso que não se
 * paga. Escala local (mínimo e máximo da própria série) porque a leitura aqui é
 * de FORMA, não de valor absoluto; os números exatos estão no card e no eixo.
 * Mês sem dado quebra a linha (não é interpolado nem tratado como zero) e o mês
 * corrente, ainda em curso, é marcado com ponto vazado.
 */
function Sparkline({ serie }: { serie: MicroSerie }) {
  const comValor = serie.pontos.filter((ponto) => ponto.valor !== null);
  if (comValor.length < 2) {
    return (
      <p className={estilos.vazio}>
        {comValor.length === 0
          ? "Sem dado apurável nos últimos 12 meses."
          : `Um único mês com dado (${mesLongo(comValor[0].mes)}) — série de 12 meses aparece quando houver histórico.`}
      </p>
    );
  }

  const valores = comValor.map((ponto) => ponto.valor as number);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const amplitude = maximo - minimo;
  const total = serie.pontos.length;
  const x = (indice: number) =>
    total === 1 ? LARGURA / 2 : (indice / (total - 1)) * LARGURA;
  // Série constante desenha no MEIO da caixa, não no chão: linha colada embaixo
  // é lida como "zero", e um indicador estável não é um indicador zerado.
  const y = (valor: number) =>
    amplitude === 0 ? ALTURA / 2 : ALTURA - ((valor - minimo) / amplitude) * ALTURA;
  // Faixa de mouse por mês: divide a largura em fatias iguais, uma por mês.
  const faixaMes = LARGURA / total;

  // Segmentos: cada corrida contínua de pontos com valor vira uma polyline.
  const segmentos: string[][] = [];
  let atual: string[] = [];
  serie.pontos.forEach((ponto, indice) => {
    if (ponto.valor === null) {
      if (atual.length > 0) segmentos.push(atual);
      atual = [];
      return;
    }
    atual.push(`${x(indice).toFixed(1)},${y(ponto.valor).toFixed(1)}`);
  });
  if (atual.length > 0) segmentos.push(atual);

  const ultimo = comValor[comValor.length - 1];
  const indiceUltimo = serie.pontos.findIndex((p) => p === ultimo);
  const maiorSegmento = segmentos.reduce(
    (maior, atualSegmento) =>
      atualSegmento.length > maior.length ? atualSegmento : maior,
    [] as string[]
  );

  return (
    <>
      <svg
        className={estilos.sparkline}
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${serie.rotulo}: ${serie.tendencia.texto}`}
      >
        {maiorSegmento.length > 1 && (
          <polygon
            className={estilos.area}
            points={`${maiorSegmento[0].split(",")[0]},${ALTURA} ${maiorSegmento.join(" ")} ${
              maiorSegmento[maiorSegmento.length - 1].split(",")[0]
            },${ALTURA}`}
          />
        )}
        {segmentos.map((segmento, indice) =>
          segmento.length > 1 ? (
            <polyline
              key={indice}
              className={estilos.linha}
              points={segmento.join(" ")}
            />
          ) : (
            <circle
              key={indice}
              className={estilos.ponto}
              cx={segmento[0].split(",")[0]}
              cy={segmento[0].split(",")[1]}
              r={2.5}
            />
          )
        )}
        <circle
          className={ultimo.parcial ? estilos.pontoVazado : estilos.ponto}
          cx={x(indiceUltimo)}
          cy={y(ultimo.valor as number)}
          r={3}
        />
        {/* Faixa invisível por mês, POR CIMA do desenho: o <title> do SVG já é
            tooltip nativa do navegador, então o valor do mês aparece ao passar o
            mouse sem estado, sem evento e sem re-render. Mês sem dado também tem
            faixa — "não apurado" é informação, e a lacuna na linha sozinha não
            diz qual mês é. */}
        {serie.pontos.map((ponto, indice) => (
          <rect
            key={`faixa-${ponto.mes}`}
            x={(indice * faixaMes).toFixed(1)}
            y={0}
            width={faixaMes.toFixed(1)}
            height={ALTURA}
            fill="transparent"
          >
            <title>
              {ponto.valor === null
                ? `${mesLongo(ponto.mes)}: sem dado apurado neste mês`
                : `${mesLongo(ponto.mes)}: ${formatarPonto(ponto.valor, serie.unidade)}${
                    ponto.parcial ? " (mês em curso)" : ""
                  }`}
            </title>
          </rect>
        ))}
      </svg>
      <div className={estilos.eixo}>
        <span>
          {mesCurto(serie.pontos[0].mes)}
          {serie.pontos[0].valor !== null &&
            ` · ${formatarPonto(serie.pontos[0].valor, serie.unidade)}`}
        </span>
        <span>
          {mesCurto(ultimo.mes)} · {formatarPonto(ultimo.valor as number, serie.unidade)}
          {ultimo.parcial && " (mês em curso)"}
        </span>
      </div>
    </>
  );
}

/**
 * A variação do período, em número.
 *
 * O sparkline tem escala LOCAL (mínimo e máximo da própria série), então a linha
 * ocupa a caixa inteira sempre: uma variação de 0,03 é desenhada igual a uma de
 * 30. A forma aparece; a magnitude some. Este texto devolve a magnitude — do
 * primeiro ao último mês COM dado, na unidade da série.
 *
 * A unidade não é decorativa: percentual varia em PONTO PERCENTUAL (turnover de
 * 3% para 5% é +2 p.p., não +2%), contagem varia em unidades, dinheiro em reais
 * e nota em pontos de nota. Escrever "p.p." para tudo seria errado em três dos
 * quatro casos.
 */
function variacaoDoPeriodo(serie: MicroSerie): string | null {
  const comValor = serie.pontos.filter((ponto) => ponto.valor !== null);
  if (comValor.length < 2) return null;

  const primeiro = comValor[0];
  const ultimo = comValor[comValor.length - 1];
  const delta = (ultimo.valor as number) - (primeiro.valor as number);
  // Meses COBERTOS pela comparação (inclusive as duas pontas), não o índice: de
  // jan a dez são 12 meses, não 11.
  const meses =
    serie.pontos.indexOf(ultimo) - serie.pontos.indexOf(primeiro) + 1;
  const janela = `em ${meses} ${meses === 1 ? "mês" : "meses"}`;
  if (delta === 0) return `sem variação ${janela}`;

  const absoluto = Math.abs(delta);
  const medida =
    serie.unidade === "%"
      ? // Duas casas de propósito: com uma casa, um giro de 0,03 p.p. viraria
        // "0,0 p.p." — exatamente a informação que este texto existe para dar.
        `${decimal(absoluto, 2)} p.p.`
      : serie.unidade === "R$"
        ? moedaCurta(absoluto)
        : serie.unidade === "nota"
          ? `${decimal(absoluto, 2)} ponto(s)`
          : inteiro(absoluto);

  return `${delta > 0 ? "+" : "-"}${medida} ${janela}`;
}

function Serie({ serie }: { serie: MicroSerie }) {
  const { direcao, subir_e_bom: subirEBom, texto } = serie.tendencia;
  const variacao = variacaoDoPeriodo(serie);
  const seta =
    direcao === "sobe" ? "▲" : direcao === "desce" ? "▼" : direcao === "estavel" ? "▬" : "–";
  // A cor sai do SIGNIFICADO, não do sinal: turnover e absenteísmo subindo é
  // vermelho, headcount subindo é verde.
  const classe =
    direcao === "indefinida" || direcao === "estavel"
      ? estilos.neutro
      : (direcao === "sobe") === subirEBom
        ? estilos.bom
        : estilos.ruim;

  return (
    <div className={estilos.serie}>
      <span className={estilos.serieRotulo}>{serie.rotulo}</span>
      <Sparkline serie={serie} />
      <p className={estilos.tendencia}>
        <span className={`${estilos.seta} ${classe}`} aria-hidden="true">
          {seta}
        </span>
        <span>{texto}</span>
        {variacao && <span className={estilos.variacao}>· {variacao}</span>}
      </p>
    </div>
  );
}

function Conta({ texto }: { texto: string }) {
  return (
    <p className={estilos.conta}>
      <span className={estilos.contaTitulo}>A conta</span>
      {texto}
    </p>
  );
}

function TabelaContagem({
  cabecalho,
  linhas,
}: {
  cabecalho: string;
  linhas: { rotulo: string; quantidade: number | null; suprimido?: boolean }[];
}) {
  const maximo = Math.max(1, ...linhas.map((linha) => linha.quantidade ?? 0));
  return (
    <div className={estilos.tabelaEnvolucro}>
      <table className={estilos.tabela}>
        <thead>
          <tr>
            <th>{cabecalho}</th>
            <th className={estilos.numerico}>Pessoas</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.rotulo}>
              <td>{linha.rotulo}</td>
              <td className={estilos.numerico}>
                {linha.quantidade === null ? (
                  <span className={estilos.suprimido}>suprimido</span>
                ) : (
                  inteiro(linha.quantidade)
                )}
              </td>
              <td>
                <span className={estilos.barraTrilha}>
                  <span
                    className={estilos.barra}
                    style={{
                      width: `${Math.round(((linha.quantidade ?? 0) / maximo) * 100)}%`,
                    }}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cartao({
  titulo,
  largo = false,
  children,
}: {
  titulo: string;
  largo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`${estilos.cartao} ${largo ? estilos.largo : ""}`}>
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

function CartaoIndisponivel({
  titulo,
  selo,
  motivo,
  chave,
}: {
  titulo: string;
  selo: string;
  motivo: string;
  chave?: string;
}) {
  return (
    <section className={`${estilos.cartao} ${estilos.bloqueado}`}>
      <h2>{titulo}</h2>
      <span className={estilos.bloqueadoSelo}>{selo}</span>
      <p className={estilos.bloqueadoTexto}>{motivo}</p>
      {chave && (
        <p className={estilos.periodo}>
          Chave necessária: <span className={estilos.chave}>{chave}</span>
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ tela

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível carregar o painel.";
}

export function PainelExecutivoTela() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/painel-executivo", { cache: "no-store" });
      if (!resposta.ok) {
        setErro(await lerErro(resposta));
        return;
      }
      setPainel((await resposta.json()) as Painel);
    } catch {
      setErro("Falha de rede ao carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // A busca fica dentro de um async IIFE: assim nenhum setState acontece
  // sincronamente no corpo do efeito (mesmo padrão das outras telas).
  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  return (
    <div className={estilos.pagina}>
      <Cabecalho />
      <main className={estilos.conteudo}>
        <h1>Dashboard Executivo</h1>
        <p className={estilos.subtitulo}>
          Indicadores de pessoas para a diretoria — cada card mostra o valor, o
          período e a conta que o produziu.
        </p>

        {painel && (
          <p className={estilos.referencia}>
            Posição de {fData(painel.hoje)} · janela de 12 meses de{" "}
            {fData(painel.janela_12m.inicio)} a {fData(painel.janela_12m.fim)}
            <button
              type="button"
              className={estilos.recarregar}
              onClick={() => void carregar()}
              disabled={carregando}
            >
              {carregando ? "Atualizando…" : "Atualizar"}
            </button>
          </p>
        )}

        {carregando && !painel && (
          <p className={estilos.carregando}>Apurando os indicadores…</p>
        )}
        {erro && <p className={estilos.erro}>{erro}</p>}

        {painel && (
          <div className={estilos.grade}>
            {/* -------------------------------------------------- headcount */}
            <Cartao titulo="Headcount" largo>
              <span className={estilos.valor}>
                {inteiro(painel.headcount.ativos)}
              </span>
              <span className={estilos.valorSecundario}>
                {painel.headcount.variacao_12m.delta >= 0 ? "+" : ""}
                {inteiro(painel.headcount.variacao_12m.delta)} pessoa(s) em 12
                meses ({percentual(painel.headcount.variacao_12m.percentual)}) ·
                eram {inteiro(painel.headcount.variacao_12m.ativos_antes)} em{" "}
                {fData(painel.headcount.variacao_12m.referencia)}
              </span>
              <span className={estilos.periodo}>{painel.headcount.periodo}</span>
              <Serie serie={painel.headcount.serie} />
              <TabelaContagem
                cabecalho="Unidade"
                linhas={painel.headcount.por_unidade}
              />
              {painel.headcount.sem_lotacao > 0 && (
                <p className={estilos.vazio}>
                  {inteiro(painel.headcount.sem_lotacao)} pessoa(s) sem lotação
                  vigente — fora da quebra por unidade.
                </p>
              )}
              <TabelaContagem
                cabecalho="Vínculo"
                linhas={painel.headcount.por_vinculo}
              />
              <Conta texto={painel.headcount.conta} />
            </Cartao>

            {/* -------------------------------------------------- turnover */}
            <Cartao titulo="Turnover (12 meses)">
              <span className={estilos.valor}>
                {percentual(painel.turnover.percentual, 2)}
              </span>
              <span className={estilos.valorSecundario}>
                {inteiro(painel.turnover.desligados)} desligado(s) ·{" "}
                {inteiro(painel.turnover.admitidos)} admitido(s) · headcount
                médio {decimal(painel.turnover.headcount_medio)}
              </span>
              <span className={estilos.periodo}>{painel.turnover.periodo}</span>
              <Serie serie={painel.turnover.serie} />
              <Conta texto={painel.turnover.conta} />
            </Cartao>

            {/* -------------------------------------------------- custo */}
            {painel.custo_pessoal.disponivel ? (
              <Cartao titulo="Custo de pessoal" largo>
                <span className={estilos.valor}>
                  {moeda(painel.custo_pessoal.total)}
                </span>
                <span className={estilos.valorSecundario}>
                  {moeda(painel.custo_pessoal.proventos)} de proventos +{" "}
                  {moeda(painel.custo_pessoal.encargo_fgts)} de FGTS ·{" "}
                  {inteiro(painel.custo_pessoal.pessoas)} folha(s)
                </span>
                <span className={estilos.periodo}>
                  {painel.custo_pessoal.periodo}
                </span>
                <Serie serie={painel.custo_pessoal.serie} />
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Unidade</th>
                        <th>Centro de custo</th>
                        <th className={estilos.numerico}>Pessoas</th>
                        <th className={estilos.numerico}>Proventos</th>
                        <th className={estilos.numerico}>FGTS</th>
                        <th className={estilos.numerico}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.custo_pessoal.por_unidade.map((linha) => (
                        <tr key={`${linha.unidade}-${linha.centro_custo}`}>
                          <td>{linha.unidade}</td>
                          <td>{linha.centro_custo}</td>
                          <td className={estilos.numerico}>
                            {inteiro(linha.pessoas)}
                          </td>
                          <td className={estilos.numerico}>
                            {moeda(linha.proventos)}
                          </td>
                          <td className={estilos.numerico}>
                            {moeda(linha.encargo_fgts)}
                          </td>
                          <td className={estilos.numerico}>
                            {moeda(linha.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {painel.custo_pessoal.sem_lotacao !== 0 && (
                  <p className={estilos.vazio}>
                    {moeda(painel.custo_pessoal.sem_lotacao)} de folha sem lotação
                    vigente na competência — fora do rateio acima.
                  </p>
                )}
                <Conta texto={painel.custo_pessoal.conta} />
              </Cartao>
            ) : (
              // Dois indisponíveis diferentes: "Bloqueado" traz a chave que
              // falta; "Sem fonte" NÃO cita chave nenhuma — quem vê esse selo
              // já tem folha.ver e o que falta é competência fechada.
              <CartaoIndisponivel
                titulo="Custo de pessoal"
                selo={
                  painel.custo_pessoal.bloqueio === "permissao"
                    ? "Bloqueado"
                    : "Sem fonte"
                }
                motivo={painel.custo_pessoal.motivo}
                chave={
                  painel.custo_pessoal.bloqueio === "permissao"
                    ? painel.custo_pessoal.requer_chave
                    : undefined
                }
              />
            )}

            {/* -------------------------------------------------- contratação */}
            <Cartao titulo="Tempo médio de contratação">
              <span className={estilos.valor}>
                {painel.tempo_contratacao.dias_medio === null
                  ? "—"
                  : `${decimal(painel.tempo_contratacao.dias_medio)} dias`}
              </span>
              <span className={estilos.valorSecundario}>
                {inteiro(painel.tempo_contratacao.casos)} contratação(ões) ponta
                a ponta
                {painel.tempo_contratacao.perna_recrutamento.dias_medio !== null &&
                  ` · perna de R&S: ${decimal(
                    painel.tempo_contratacao.perna_recrutamento.dias_medio
                  )} dias em ${inteiro(
                    painel.tempo_contratacao.perna_recrutamento.vagas
                  )} vaga(s)`}
              </span>
              <span className={estilos.periodo}>
                {painel.tempo_contratacao.periodo}
              </span>
              {painel.tempo_contratacao.detalhe.length > 0 && (
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Vaga (cargo · unidade)</th>
                        <th className={estilos.numerico}>Aprovada</th>
                        <th className={estilos.numerico}>Admissão</th>
                        <th className={estilos.numerico}>Dias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.tempo_contratacao.detalhe.map((caso) => (
                        <tr key={caso.requisicao_id}>
                          <td>
                            {caso.cargo_nome} · {caso.unidade}
                          </td>
                          <td className={estilos.numerico}>
                            {fData(caso.aprovada_em)}
                          </td>
                          <td className={estilos.numerico}>
                            {fData(caso.admitido_em)}
                          </td>
                          <td className={estilos.numerico}>
                            {inteiro(caso.dias)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Conta texto={painel.tempo_contratacao.conta} />
            </Cartao>

            {/* -------------------------------------------------- absenteísmo */}
            <Cartao titulo="Absenteísmo (12 meses)">
              <span className={estilos.valor}>
                {percentual(painel.absenteismo.percentual, 2)}
              </span>
              <span className={estilos.valorSecundario}>
                {inteiro(painel.absenteismo.dias_afastamento)} dia(s) úteis de
                afastamento em{" "}
                {inteiro(painel.absenteismo.dias_uteis_previstos)} previsto(s)
              </span>
              <span className={estilos.periodo}>
                {painel.absenteismo.periodo}
              </span>
              <Serie serie={painel.absenteismo.serie} />
              <Conta texto={painel.absenteismo.conta} />
            </Cartao>

            {/* -------------------------------------------------- promoções */}
            <Cartao titulo="Promoções (12 meses)">
              <span className={estilos.valor}>
                {inteiro(painel.promocoes.promocoes)}
              </span>
              <span className={estilos.valorSecundario}>
                + {inteiro(painel.promocoes.transferencias)} transferência(s) de
                unidade
              </span>
              <span className={estilos.periodo}>{painel.promocoes.periodo}</span>
              <Serie serie={painel.promocoes.serie} />
              <Conta texto={painel.promocoes.conta} />
            </Cartao>

            {/* -------------------------------------------------- diversidade */}
            <Cartao titulo="Diversidade" largo>
              <span className={estilos.valor}>
                {inteiro(painel.diversidade.total_quadro)}
              </span>
              <span className={estilos.valorSecundario}>
                pessoas no quadro · recorte com menos de{" "}
                {painel.diversidade.minimo_por_recorte} não é publicado
              </span>
              <span className={estilos.periodo}>
                {painel.diversidade.periodo}
              </span>
              <Serie serie={painel.diversidade.serie} />
              <TabelaContagem
                cabecalho="Gênero (autodeclarado)"
                linhas={painel.diversidade.por_genero}
              />
              <TabelaContagem
                cabecalho="Faixa de idade"
                linhas={painel.diversidade.por_faixa_idade}
              />
              {painel.diversidade.sem_data_nascimento > 0 && (
                <p className={estilos.vazio}>
                  {inteiro(painel.diversidade.sem_data_nascimento)} ficha(s) sem
                  data de nascimento — fora das faixas de idade.
                </p>
              )}
              <Conta texto={painel.diversidade.conta} />
            </Cartao>

            {/* -------------------------------------------------- clima */}
            <Cartao titulo="Clima">
              <span className={estilos.valor}>
                {painel.clima.media_checkin === null
                  ? "—"
                  : decimal(painel.clima.media_checkin, 2)}
              </span>
              <span className={estilos.valorSecundario}>
                média do check-in (1 a 5) em{" "}
                {inteiro(painel.clima.respostas_checkin)} resposta(s)
              </span>
              {painel.clima.enps ? (
                <span className={estilos.valorSecundario}>
                  eNPS:{" "}
                  {painel.clima.enps.pontos === null ? (
                    <span className={estilos.suprimido}>
                      amostra abaixo de {painel.clima.enps.minimo_amostra}{" "}
                      respostas — não publicado
                    </span>
                  ) : (
                    <>
                      <strong>{decimal(painel.clima.enps.pontos)} pontos</strong>{" "}
                      ({inteiro(painel.clima.enps.promotores ?? 0)} promotores −{" "}
                      {inteiro(painel.clima.enps.detratores ?? 0)} detratores em{" "}
                      {inteiro(painel.clima.enps.respostas ?? 0)})
                    </>
                  )}
                  <br />
                  {painel.clima.enps.pesquisa}
                </span>
              ) : (
                <span className={estilos.vazio}>
                  Nenhuma pesquisa encerrada com pergunta de eNPS.
                </span>
              )}
              <span className={estilos.periodo}>{painel.clima.periodo}</span>
              <Serie serie={painel.clima.serie} />
              <Conta texto={painel.clima.conta} />
            </Cartao>

            {/* -------------------------------------------------- performance */}
            <Cartao titulo="Performance">
              <span className={estilos.valor}>
                {inteiro(painel.performance.avaliacoes)}
              </span>
              <span className={estilos.valorSecundario}>
                avaliações de desempenho na última safra
              </span>
              <span className={estilos.periodo}>
                {painel.performance.periodo}
              </span>
              {painel.performance.faixas.length > 0 ? (
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Faixa</th>
                        <th className={estilos.numerico}>Pessoas</th>
                        <th className={estilos.numerico}>%</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {painel.performance.faixas.map((faixa) => (
                        <tr key={faixa.rotulo}>
                          <td>
                            {faixa.rotulo}{" "}
                            <span className={estilos.periodo}>
                              ({decimal(faixa.minimo, 0)}–
                              {decimal(faixa.maximo, 0)}%)
                            </span>
                          </td>
                          <td className={estilos.numerico}>
                            {inteiro(faixa.quantidade)}
                          </td>
                          <td className={estilos.numerico}>
                            {percentual(faixa.percentual)}
                          </td>
                          <td>
                            <span className={estilos.barraTrilha}>
                              <span
                                className={estilos.barra}
                                style={{ width: `${faixa.percentual}%` }}
                              />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={estilos.vazio}>
                  Nenhuma safra de desempenho consolidada.
                </p>
              )}
              <p className={estilos.vazio}>{painel.performance.sem_serie}</p>
              <Conta texto={painel.performance.conta} />
            </Cartao>

            {/* -------------------------------------------------- desenvolvimento (PDI) */}
            <Cartao titulo="Desenvolvimento (PDI)">
              <span className={estilos.valor}>
                {inteiro(painel.desenvolvimento.planos_ativos)}
              </span>
              <span className={estilos.valorSecundario}>
                plano(s) ativo(s) · {inteiro(painel.desenvolvimento.pessoas)}{" "}
                pessoa(s)
              </span>
              <span className={estilos.valorSecundario}>
                {inteiro(painel.desenvolvimento.acoes_concluidas)}/
                {inteiro(painel.desenvolvimento.acoes_total)} ações concluídas ·{" "}
                {inteiro(painel.desenvolvimento.acoes_andamento)} em andamento
              </span>
              <Conta texto="Planos de desenvolvimento homologados e o andamento das ações — o T&D vive no Meu PDI." />
            </Cartao>
          </div>
        )}
      </main>
    </div>
  );
}
