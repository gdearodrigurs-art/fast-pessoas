"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import { ROTULOS_NIVEL_ALERTA, NivelAlerta } from "@/dominios/ferias/esquemas";
import {
  formatarMinutos,
  ROTULOS_TIPO_INTERCORRENCIA,
} from "@/dominios/ponto/esquemas";
import estilos from "./page.module.css";

/** Contrato de GET /api/ponto/resumo/equipe (domínio de ponto). */
interface LinhaPontoEquipe {
  colaborador_id: number;
  nome: string;
  matricula: string;
  saldo_banco_minutos: number;
  total_he_ultimo_mes_minutos: number;
  media_he_por_dia_util_minutos_ultimo_mes: number;
  ultima_apuracao: { competencia: string } | null;
  intercorrencias_abertas: number;
  limite_positivo_minutos: number | null;
  acima_do_limite: boolean;
}

interface PontoEquipe {
  disponivel: boolean;
  explicacao?: string;
  liderados?: LinhaPontoEquipe[];
  saldo_total_minutos?: number;
  acima_do_limite?: number;
  intercorrencias?: {
    id: number;
    colaborador_id: number;
    colaborador_nome: string;
    data: string;
    tipo: keyof typeof ROTULOS_TIPO_INTERCORRENCIA;
    detalhe: string;
  }[];
}

// Tipos do payload de /api/portais/gestor. Repetidos aqui de propósito (é a
// convenção das outras telas): o cliente conhece o contrato da rota, não o
// módulo do servidor.

type Gravidade = "critico" | "atencao" | "informativo";

interface OpcaoGestor {
  colaborador_id: number;
  nome_completo: string;
  liderados: number;
}

interface ItemEquipe {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  cargo_nome: string | null;
  unidade: string | null;
  empresa_nome: string | null;
  outra_empresa: boolean;
  data_admissao: string;
  tempo_de_casa: string;
  afastado_hoje: boolean;
  em_ferias_hoje: boolean;
  ferias_ate: string | null;
}

interface ProgramacaoEquipe {
  programacao_id: number;
  colaborador_id: number;
  nome_completo: string;
  inicio: string;
  fim: string;
  dias: number;
  abono_dias: number;
  status: "aprovada" | "em_gozo";
  dias_para_inicio: number;
}

interface AvisoFerias {
  colaborador_id: number;
  nome_completo: string;
  limite_concessivo: string;
  dias_ate_limite: number;
  nivel: NivelAlerta;
  dias_disponiveis: number;
  dias_programados: number;
  gravidade: Gravidade;
}

interface ItemAvaliacao {
  ciclo_id: number;
  colaborador_id: number;
  colaborador_nome: string;
  tipo: "experiencia_45" | "experiencia_90" | "desempenho";
  status: string;
  situacao: "pendente" | "rascunho" | "enviada";
  prazo: string;
  dias_para_prazo: number;
  vencido: boolean;
}

interface ItemPendencia {
  demanda_id: number;
  numero: number;
  tipo_nome: string;
  origem: "demanda" | "movimentacao";
  solicitante_nome: string;
  prazo: string;
  dias_ate_prazo: number;
  atrasada: boolean;
}

interface AlertaFeedback {
  colaborador_id: number;
  nome_completo: string;
  ultimo_feedback_em: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
  gravidade: Gravidade;
}

interface AlertaExperiencia {
  colaborador_id: number;
  nome_completo: string;
  marco: 45 | 90;
  data_marco: string;
  dias_para_marco: number;
  do_processo: boolean;
  gravidade: Gravidade;
}

interface AlertaAso {
  colaborador_id: number;
  nome_completo: string;
  /** null quando a pessoa não tem nenhum ASO com validade registrada. */
  validade: string | null;
  dias_ate_validade: number | null;
  data_admissao: string;
  dias_desde_admissao: number;
  gravidade: Gravidade;
}

interface Portal {
  gestor: { colaborador_id: number; nome_completo: string };
  seletor: OpcaoGestor[] | null;
  proprio: boolean;
  pode: {
    ver_ferias: boolean;
    ver_avaliacoes: boolean;
    ver_pendencias: boolean;
    ver_turnover: boolean;
    ver_aso: boolean;
    ver_experiencia: boolean;
    escolher_gestor: boolean;
  };
  equipe: {
    total: number;
    afastados: number;
    em_ferias: number;
    liderados: ItemEquipe[];
  };
  ferias: {
    janela_dias: number;
    programadas: ProgramacaoEquipe[];
    em_risco: AvisoFerias[];
  } | null;
  avaliacoes: { abertas: ItemAvaliacao[]; vencidas: number } | null;
  pendencias: { itens: ItemPendencia[]; atrasadas: number } | null;
  turnover: {
    janela_inicio: string;
    janela_fim: string;
    meses: number;
    desligados: number;
    headcount_inicio: number;
    headcount_fim: number;
    headcount_medio: number;
    percentual: number | null;
    memoria_calculo: string;
  } | null;
  alertas: {
    cadencia_dias: number;
    feedback_vencido: AlertaFeedback[];
    experiencia: AlertaExperiencia[] | null;
    aso: AlertaAso[] | null;
  };
  treinamentos: { disponivel: false; nota: string };
}

const ROTULOS_TIPO_CICLO: Record<ItemAvaliacao["tipo"], string> = {
  experiencia_45: "Experiência 45",
  experiencia_90: "Experiência 90",
  desempenho: "Desempenho",
};

const ROTULOS_SITUACAO: Record<ItemAvaliacao["situacao"], string> = {
  pendente: "Não iniciada",
  rascunho: "Rascunho",
  enviada: "Enviada",
};

/** 45 ou 90 do tipo do ciclo; null quando o ciclo não é de experiência. */
function marcoDoCiclo(tipo: ItemAvaliacao["tipo"]): 45 | 90 | null {
  if (tipo === "experiencia_45") return 45;
  if (tipo === "experiencia_90") return 90;
  return null;
}

/**
 * Ciclo de experiência ABERTO da pessoa do alerta — o destino do link.
 *
 * Casar pelo marco exato (`experiencia_45` para o alerta de dia 45) não fecha
 * NUNCA: quando o marco 45 entra na janela do alerta, o ciclo daquele marco já
 * foi decidido, e o que continua aberto é o do marco seguinte. O alerta é do
 * CONTRATO de experiência, não de um marco isolado — vale qualquer ciclo de
 * experiência da mesma pessoa, com preferência pelo do marco anunciado quando
 * ele existe, e o mais urgente como desempate. A tela diz de qual marco é o
 * ciclo para onde está mandando.
 */
function cicloDaExperiencia(
  abertas: ItemAvaliacao[] | undefined,
  colaboradorId: number,
  marco: 45 | 90
): ItemAvaliacao | undefined {
  const daPessoa = (abertas ?? [])
    .filter(
      (aberta) =>
        aberta.colaborador_id === colaboradorId &&
        marcoDoCiclo(aberta.tipo) !== null
    )
    .sort((a, b) => a.dias_para_prazo - b.dias_para_prazo);
  return (
    daPessoa.find((aberta) => marcoDoCiclo(aberta.tipo) === marco) ?? daPessoa[0]
  );
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function classeEtiqueta(gravidade: Gravidade): string {
  if (gravidade === "critico") {
    return `${estilos.etiqueta} ${estilos.etiquetaCritico}`;
  }
  if (gravidade === "atencao") {
    return `${estilos.etiqueta} ${estilos.etiquetaAtencao}`;
  }
  return `${estilos.etiqueta} ${estilos.etiquetaInformativo}`;
}

/**
 * Quem nunca fez exame não está "vencido" — não há validade para vencer.
 * Chamar de vencido seria trocar uma omissão por uma informação errada.
 */
function etiquetaAso(item: AlertaAso): string {
  if (item.validade === null || item.dias_ate_validade === null) {
    return "sem ASO";
  }
  return item.dias_ate_validade < 0 ? "vencido" : "a vencer";
}

function prazoTexto(dias: number): string {
  if (dias < 0) return `${Math.abs(dias)} dia(s) em atraso`;
  if (dias === 0) return "hoje";
  return `em ${dias} dia(s)`;
}

async function lerErro(resposta: Response): Promise<string> {
  const dados = await resposta.json().catch(() => ({}));
  return (dados as { erro?: string }).erro ?? "Não foi possível carregar.";
}

function Bloco({
  titulo,
  href,
  hrefRotulo,
  children,
}: {
  titulo: string;
  href?: string;
  hrefRotulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={estilos.cartao}>
      <div className={estilos.cabecalhoCartao}>
        <h2>{titulo}</h2>
        {href && (
          <Link className={estilos.link} href={href}>
            {hrefRotulo ?? "Abrir módulo"} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function PainelGestor() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [ponto, setPonto] = useState<PontoEquipe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gestorId, setGestorId] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const busca = gestorId === null ? "" : `?gestor_id=${gestorId}`;
      try {
        const resposta = await fetch(`/api/portais/gestor${busca}`, {
          cache: "no-store",
        });
        if (!ativo) return;
        if (!resposta.ok) {
          setErro(await lerErro(resposta));
          return;
        }
        setPortal((await resposta.json()) as Portal);
        setErro(null);
      } catch {
        if (ativo) setErro("Falha de conexão. Recarregue a página.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, [gestorId]);

  // Banco de horas do time vem do domínio DONO do dado, com a chave dele
  // (ponto.ver.equipe). Segue o gestor escolhido no seletor; falhar aqui só
  // esconde o bloco, não derruba o portal.
  useEffect(() => {
    const alvo = gestorId ?? portal?.gestor.colaborador_id ?? null;
    if (alvo === null) return;
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(
          `/api/ponto/resumo/equipe?gestor_id=${alvo}`,
          { cache: "no-store" }
        );
        if (!ativo || !resposta.ok) return;
        setPonto((await resposta.json()) as PontoEquipe);
      } catch {
        /* portal segue sem o bloco de ponto */
      }
    })();
    return () => {
      ativo = false;
    };
  }, [gestorId, portal?.gestor.colaborador_id]);

  return (
    <div className={estilos.pagina}>
      <Cabecalho>
        <Link className={acaoCabecalho} href="/colaboradores">
          Colaboradores
        </Link>
        <Link className={acaoCabecalho} href="/demandas">
          Demandas
        </Link>
        <Link className={acaoCabecalho} href="/avaliacoes">
          Avaliações
        </Link>
      </Cabecalho>

      <main className={estilos.conteudo}>
        <h1>Portal do gestor</h1>
        <p className={estilos.subtitulo}>
          {portal
            ? `Equipe de ${portal.gestor.nome_completo} — o que precisa da sua decisão hoje.`
            : "Carregando…"}
        </p>

        {erro && <p className={estilos.erro}>{erro}</p>}

        {portal?.seletor && (
          <section className={estilos.cartao}>
            <div className={estilos.seletor}>
              <div className={estilos.campoGrupo}>
                <label className={estilos.rotulo} htmlFor="gestor">
                  Ver o portal de
                </label>
                <select
                  id="gestor"
                  className={estilos.campo}
                  value={gestorId ?? portal.gestor.colaborador_id}
                  onChange={(evento) =>
                    setGestorId(Number(evento.target.value))
                  }
                >
                  {portal.seletor.map((opcao) => (
                    <option
                      key={opcao.colaborador_id}
                      value={opcao.colaborador_id}
                    >
                      {opcao.nome_completo} ({opcao.liderados} liderados)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={estilos.notaRodape}>
              Você enxerga todas as equipes: escolha o gestor para abrir o
              portal dele. O alcance de cada bloco continua limitado aos
              liderados com relação vigente.
            </p>
          </section>
        )}

        {portal && (
          <>
            {/* -------------------------------------------------- 1. equipe */}
            <Bloco
              titulo="Minha equipe"
              href="/colaboradores"
              hrefRotulo="Ver colaboradores"
            >
              <div className={estilos.numeros}>
                <div className={estilos.numero}>
                  <strong>{portal.equipe.total}</strong>
                  <span>liderados ativos</span>
                </div>
                <div
                  className={
                    portal.equipe.afastados > 0
                      ? `${estilos.numero} ${estilos.numeroAtencao}`
                      : estilos.numero
                  }
                >
                  <strong>{portal.equipe.afastados}</strong>
                  <span>afastados hoje</span>
                </div>
                <div className={estilos.numero}>
                  <strong>{portal.equipe.em_ferias}</strong>
                  <span>em férias hoje</span>
                </div>
              </div>
              {portal.equipe.liderados.length === 0 ? (
                <p className={estilos.vazio}>
                  Nenhum liderado com relação vigente hoje.
                </p>
              ) : (
                <div className={estilos.tabelaEnvolucro}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th>Cargo</th>
                        <th>Empresa</th>
                        <th>Unidade</th>
                        <th>Tempo de casa</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portal.equipe.liderados.map((item) => (
                        <tr key={item.colaborador_id}>
                          <td>
                            <Link
                              className={estilos.nomeLink}
                              href={`/colaboradores/${item.colaborador_id}`}
                            >
                              {item.nome_completo}
                            </Link>
                            <div className={estilos.detalhe}>
                              {item.matricula}
                            </div>
                          </td>
                          <td>{item.cargo_nome ?? "—"}</td>
                          <td>
                            {item.empresa_nome ?? "—"}
                            {item.outra_empresa && (
                              <div className={estilos.detalhe}>
                                <span className={classeEtiqueta("atencao")}>
                                  Outro CNPJ
                                </span>
                              </div>
                            )}
                          </td>
                          <td>{item.unidade ?? "—"}</td>
                          <td>{item.tempo_de_casa}</td>
                          <td>
                            {item.afastado_hoje && (
                              <span className={classeEtiqueta("atencao")}>
                                Afastado
                              </span>
                            )}{" "}
                            {item.em_ferias_hoje && (
                              <span className={classeEtiqueta("informativo")}>
                                Em férias
                                {item.ferias_ate
                                  ? ` até ${formatarData(item.ferias_ate)}`
                                  : ""}
                              </span>
                            )}
                            {!item.afastado_hoje && !item.em_ferias_hoje && (
                              <span
                                className={`${estilos.etiqueta} ${estilos.etiquetaOk}`}
                              >
                                Trabalhando
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className={estilos.notaRodape}>
                “Afastado” é só o FATO de haver afastamento em curso: tipo,
                motivo e qualquer dado de saúde ficam com quem tem a chave de
                saúde — não aparecem aqui nem para o gestor.
              </p>
            </Bloco>

            {/* ------------------------------------ 1b. banco de horas do time
                Pedido textual da diretoria: saldo por liderado e QUEM ESTÁ
                ESTOURANDO hora extra. O "estourando" não é número fixo na
                tela — vem da regra de banco de horas resolvida para cada
                pessoa (empresa → unidade → cargo → pessoa). */}
            {ponto !== null && (
              <Bloco
                titulo="Banco de horas do time"
                href="/ponto"
                hrefRotulo="Abrir ponto"
              >
                {!ponto.disponivel ? (
                  <p className={estilos.bloqueado}>{ponto.explicacao}</p>
                ) : (ponto.liderados?.length ?? 0) === 0 ? (
                  <p className={estilos.vazio}>
                    Nenhum liderado com relação vigente.
                  </p>
                ) : (
                  <>
                    <p className={estilos.detalhe}>
                      Saldo somado do time:{" "}
                      <strong>
                        {formatarMinutos(ponto.saldo_total_minutos ?? 0)}
                      </strong>{" "}
                      · {ponto.acima_do_limite ?? 0} acima do limite da própria
                      regra
                    </p>
                    <ul className={estilos.lista}>
                      {(ponto.liderados ?? []).map((linha) => (
                        <li key={linha.colaborador_id}>
                          {/* O saldo fora da etiqueta de propósito: a etiqueta
                              é caixa-alta e transformaria "0h55" em "0H55". */}
                          <span
                            className={classeEtiqueta(
                              linha.acima_do_limite ? "critico" : "informativo"
                            )}
                          >
                            {linha.acima_do_limite ? "estourando" : "no limite"}
                          </span>
                          <strong>
                            {formatarMinutos(linha.saldo_banco_minutos)}
                          </strong>{" "}
                          <Link
                            className={estilos.nomeLink}
                            href={`/ponto/espelho/${linha.colaborador_id}`}
                          >
                            {linha.nome}
                          </Link>
                          <span className={estilos.detalhe}>
                            HE no último mês{" "}
                            {formatarMinutos(linha.total_he_ultimo_mes_minutos)}{" "}
                            · média por dia{" "}
                            {formatarMinutos(
                              linha.media_he_por_dia_util_minutos_ultimo_mes
                            )}
                            {linha.ultima_apuracao
                              ? ` · ${linha.ultima_apuracao.competencia}`
                              : " · sem apuração"}
                            {linha.acima_do_limite &&
                            linha.limite_positivo_minutos !== null
                              ? ` · ESTOURANDO o limite de ${formatarMinutos(linha.limite_positivo_minutos)}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <h3 className={estilos.subtituloBloco}>
                      Intercorrências e ajustes pendentes (
                      {ponto.intercorrencias?.length ?? 0})
                    </h3>
                    {(ponto.intercorrencias?.length ?? 0) === 0 ? (
                      <p className={estilos.vazio}>
                        Nenhuma pendência de ponto na equipe.
                      </p>
                    ) : (
                      <ul className={estilos.lista}>
                        {(ponto.intercorrencias ?? []).map((item) => (
                          <li key={item.id}>
                            <span className={classeEtiqueta("atencao")}>
                              {formatarData(item.data)}
                            </span>
                            <Link
                              className={estilos.nomeLink}
                              href={`/ponto/espelho/${item.colaborador_id}?ano=${item.data.slice(0, 4)}&mes=${Number(item.data.slice(5, 7))}`}
                            >
                              {item.colaborador_nome}
                            </Link>
                            <span className={estilos.detalhe}>
                              {ROTULOS_TIPO_INTERCORRENCIA[item.tipo]} —{" "}
                              {item.detalhe}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className={estilos.notaRodape}>
                      Horas, não reais: o valor pago da hora extra é da folha.
                      Corrigir marcação é ato do DP (marcação nova com
                      justificativa) — o gestor vê e cobra.
                    </p>
                  </>
                )}
              </Bloco>
            )}

            {/* -------------------------------------------------- 2. férias */}
            <Bloco titulo="Férias da equipe" href="/ferias" hrefRotulo="Abrir férias">
              {portal.ferias === null ? (
                <p className={estilos.bloqueado}>
                  Você não tem a chave de aprovação/administração de férias.
                </p>
              ) : (
                <>
                  <h3 className={estilos.subtituloBloco}>
                    Programadas nos próximos {portal.ferias.janela_dias} dias
                  </h3>
                  {portal.ferias.programadas.length === 0 ? (
                    <p className={estilos.vazio}>
                      Nenhuma férias aprovada na janela.
                    </p>
                  ) : (
                    <div className={estilos.tabelaEnvolucro}>
                      <table className={estilos.tabela}>
                        <thead>
                          <tr>
                            <th>Colaborador</th>
                            <th>Início</th>
                            <th>Fim</th>
                            <th className={estilos.numerico}>Dias</th>
                            <th>Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {portal.ferias.programadas.map((item) => (
                            <tr key={item.programacao_id}>
                              <td>
                                <Link
                                  className={estilos.nomeLink}
                                  href={`/colaboradores/${item.colaborador_id}`}
                                >
                                  {item.nome_completo}
                                </Link>
                              </td>
                              <td>{formatarData(item.inicio)}</td>
                              <td>{formatarData(item.fim)}</td>
                              <td className={estilos.numerico}>
                                {item.dias}
                                {item.abono_dias > 0
                                  ? ` + ${item.abono_dias} abono`
                                  : ""}
                              </td>
                              <td>
                                <span
                                  className={
                                    item.status === "em_gozo"
                                      ? `${estilos.etiqueta} ${estilos.etiquetaOk}`
                                      : estilos.etiqueta
                                  }
                                >
                                  {item.status === "em_gozo"
                                    ? "Em gozo"
                                    : "Aprovada"}
                                </span>{" "}
                                <span className={estilos.detalhe}>
                                  {item.dias_para_inicio > 0
                                    ? `começa ${prazoTexto(item.dias_para_inicio)}`
                                    : "em curso"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <h3 className={estilos.subtituloBloco}>
                    Períodos vencidos ou vencendo — risco de pagamento em dobro
                  </h3>
                  {portal.ferias.em_risco.length === 0 ? (
                    <p className={estilos.vazio}>
                      Nenhum período aquisitivo da equipe vence nos próximos{" "}
                      {portal.ferias.janela_dias} dias.
                    </p>
                  ) : (
                    <div className={estilos.tabelaEnvolucro}>
                      <table className={estilos.tabela}>
                        <thead>
                          <tr>
                            <th>Colaborador</th>
                            <th>Limite concessivo</th>
                            <th>Alerta</th>
                            <th className={estilos.numerico}>Dias a gozar</th>
                            <th className={estilos.numerico}>Já programado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {portal.ferias.em_risco.map((item) => (
                            <tr
                              key={`${item.colaborador_id}-${item.limite_concessivo}`}
                            >
                              <td>
                                <Link
                                  className={estilos.nomeLink}
                                  href={`/colaboradores/${item.colaborador_id}`}
                                >
                                  {item.nome_completo}
                                </Link>
                              </td>
                              <td>{formatarData(item.limite_concessivo)}</td>
                              <td>
                                <span className={classeEtiqueta(item.gravidade)}>
                                  {item.nivel
                                    ? ROTULOS_NIVEL_ALERTA[item.nivel]
                                    : "Em aberto"}
                                </span>
                              </td>
                              <td className={estilos.numerico}>
                                {item.dias_disponiveis}
                              </td>
                              <td className={estilos.numerico}>
                                {item.dias_programados}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className={estilos.notaRodape}>
                    Férias não gozadas até o limite concessivo são pagas em
                    dobro (art. 137). Programar é ato do colaborador ou do DP; o
                    gestor combina e aprova — a aprovação está em Demandas.
                  </p>
                </>
              )}
            </Bloco>

            {/* -------------------------------------------------- 3. avaliações */}
            <Bloco
              titulo="Avaliações em que você é o avaliador"
              href="/avaliacoes"
              hrefRotulo="Abrir avaliações"
            >
              {portal.avaliacoes === null ? (
                <p className={estilos.bloqueado}>
                  Você não tem chave do módulo de avaliação.
                </p>
              ) : portal.avaliacoes.abertas.length === 0 ? (
                <p className={estilos.vazio}>Nenhum ciclo aberto com você.</p>
              ) : (
                <>
                  {portal.avaliacoes.vencidas > 0 && (
                    <div className={estilos.numeros}>
                      <div
                        className={`${estilos.numero} ${estilos.numeroCritico}`}
                      >
                        <strong>{portal.avaliacoes.vencidas}</strong>
                        <span>com prazo vencido</span>
                      </div>
                    </div>
                  )}
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Avaliado</th>
                          <th>Ciclo</th>
                          <th>Prazo</th>
                          <th>Situação</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {portal.avaliacoes.abertas.map((item) => (
                          <tr key={item.ciclo_id}>
                            <td>{item.colaborador_nome}</td>
                            <td>{ROTULOS_TIPO_CICLO[item.tipo]}</td>
                            <td>
                              {formatarData(item.prazo)}
                              <div className={estilos.detalhe}>
                                {prazoTexto(item.dias_para_prazo)}
                              </div>
                            </td>
                            <td>
                              <span
                                className={classeEtiqueta(
                                  item.vencido ? "critico" : "atencao"
                                )}
                              >
                                {ROTULOS_SITUACAO[item.situacao]}
                              </span>
                            </td>
                            <td>
                              <Link
                                className={estilos.link}
                                href={`/avaliacoes/${item.ciclo_id}`}
                              >
                                Responder →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={estilos.notaRodape}>
                    Nota e percentual não aparecem aqui: resultado individual
                    exige a chave própria e a leitura fica registrada em trilha.
                  </p>
                </>
              )}
            </Bloco>

            {/* -------------------------------------------------- 4. pendências */}
            <Bloco
              titulo="Pendências de aprovação"
              href="/demandas"
              hrefRotulo="Abrir demandas"
            >
              {portal.pendencias === null ? (
                <p className={estilos.bloqueado}>
                  Você não tem a chave de aprovação de demandas.
                </p>
              ) : portal.pendencias.itens.length === 0 ? (
                <p className={estilos.vazio}>
                  Nada aguardando a sua aprovação.
                </p>
              ) : (
                <>
                  <div className={estilos.numeros}>
                    <div className={estilos.numero}>
                      <strong>{portal.pendencias.itens.length}</strong>
                      <span>aguardando decisão</span>
                    </div>
                    {portal.pendencias.atrasadas > 0 && (
                      <div
                        className={`${estilos.numero} ${estilos.numeroCritico}`}
                      >
                        <strong>{portal.pendencias.atrasadas}</strong>
                        <span>fora do prazo</span>
                      </div>
                    )}
                  </div>
                  <div className={estilos.tabelaEnvolucro}>
                    <table className={estilos.tabela}>
                      <thead>
                        <tr>
                          <th>Nº</th>
                          <th>Tipo</th>
                          <th>Solicitante</th>
                          <th>Prazo</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {portal.pendencias.itens.map((item) => (
                          <tr key={item.demanda_id}>
                            <td>#{item.numero}</td>
                            <td>
                              {item.tipo_nome}
                              {item.origem === "movimentacao" && (
                                <div className={estilos.detalhe}>
                                  cadeia de aprovação — nível do líder
                                </div>
                              )}
                            </td>
                            <td>{item.solicitante_nome}</td>
                            <td>
                              {formatarData(item.prazo)}
                              <div className={estilos.detalhe}>
                                <span
                                  className={
                                    item.atrasada
                                      ? classeEtiqueta("critico")
                                      : estilos.detalhe
                                  }
                                >
                                  {prazoTexto(item.dias_ate_prazo)}
                                </span>
                              </div>
                            </td>
                            <td>
                              <Link
                                className={estilos.link}
                                href={`/demandas/${item.demanda_id}`}
                              >
                                Decidir →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Bloco>

            {/* -------------------------------------------------- 5. turnover */}
            <Bloco titulo="Turnover da equipe" href="/metas" hrefRotulo="Ver indicadores">
              {portal.turnover === null ? (
                <p className={estilos.bloqueado}>
                  Você não tem a chave de indicadores.
                </p>
              ) : (
                <>
                  <div className={estilos.numeros}>
                    {/*
                      AQUI HAVIA `(portal.turnover.percentual ?? 0) >= 20`
                      pintando o número de "atenção". Vinte por cento não veio
                      de lugar nenhum: não é lei, não é meta cadastrada, não
                      está escrito em nenhum documento do projeto — foi
                      escolhido por quem escreveu a tela. E a tela AFIRMAVA com
                      cor: "o turnover da sua equipe está ruim". O gestor não
                      tinha como discordar nem como mudar.

                      Turnover bom depende do setor, do porte e do momento da
                      empresa; 20% é excelente num call center e catastrófico
                      numa engenharia. Um limite desses é exatamente o que a
                      regra do dono manda ser do usuário.

                      A correção honesta dentro desta tela é NÃO afirmar. O
                      número, a janela, a memória de cálculo e o headcount
                      médio continuam todos à vista, e quem lê julga. Pintar de
                      novo só quando existir meta cadastrada para o indicador —
                      e hoje "turnover" NÃO está no registry de indicadores
                      (src/dominios/indicadores/valores.ts), então nem meta tem
                      contra o que comparar. Está denunciado no relatório da
                      varredura.
                    */}
                    <div className={estilos.numero}>
                      <strong>
                        {portal.turnover.percentual === null
                          ? "—"
                          : `${portal.turnover.percentual.toLocaleString("pt-BR")}%`}
                      </strong>
                      <span>turnover em {portal.turnover.meses} meses</span>
                    </div>
                    <div className={estilos.numero}>
                      <strong>{portal.turnover.desligados}</strong>
                      <span>desligados na janela</span>
                    </div>
                    <div className={estilos.numero}>
                      <strong>
                        {portal.turnover.headcount_medio.toLocaleString("pt-BR")}
                      </strong>
                      <span>headcount médio</span>
                    </div>
                  </div>
                  <p className={estilos.memoria}>
                    {portal.turnover.memoria_calculo}
                  </p>
                  <p className={estilos.notaRodape}>
                    Janela de {formatarData(portal.turnover.janela_inicio)} a{" "}
                    {formatarData(portal.turnover.janela_fim)}. Equipe = quem
                    teve relação com você na janela (inclui quem saiu). O motivo
                    do desligamento não entra aqui — é dado restrito.
                  </p>
                </>
              )}
            </Bloco>

            {/* -------------------------------------------------- 6. alertas */}
            <Bloco titulo="Alertas">
              <div className={estilos.colunas}>
                <div>
                  <h3 className={estilos.subtituloBloco}>
                    Feedback formal atrasado (cadência de{" "}
                    {portal.alertas.cadencia_dias} dias)
                  </h3>
                  {portal.alertas.feedback_vencido.length === 0 ? (
                    <p className={estilos.vazio}>Cadência em dia.</p>
                  ) : (
                    <ul className={estilos.lista}>
                      {portal.alertas.feedback_vencido.map((item) => (
                        <li key={item.colaborador_id}>
                          <span className={classeEtiqueta(item.gravidade)}>
                            {item.dias_desde_feedback ?? item.dias_desde_admissao}{" "}
                            dias
                          </span>
                          <Link
                            className={estilos.nomeLink}
                            href={`/colaboradores/${item.colaborador_id}`}
                          >
                            {item.nome_completo}
                          </Link>
                          <span className={estilos.detalhe}>
                            {item.ultimo_feedback_em
                              ? `último em ${formatarData(item.ultimo_feedback_em)}`
                              : "nunca registrado — conta desde a admissão"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className={estilos.subtituloBloco}>
                    Contrato de experiência (45/90)
                  </h3>
                  {portal.alertas.experiencia === null ? (
                    <p className={estilos.bloqueado}>
                      Requer a chave de admissões (ou ser o gestor da equipe).
                    </p>
                  ) : portal.alertas.experiencia.length === 0 ? (
                    <p className={estilos.vazio}>
                      Nenhum marco chegando na equipe.
                    </p>
                  ) : (
                    <ul className={estilos.lista}>
                      {portal.alertas.experiencia.map((item) => {
                        // G2: o alerta do marco 45/90 leva ao CICLO de
                        // experiência aberto da pessoa (é o que o gestor vem
                        // fazer); só cai na ficha quando não há ciclo aberto.
                        const ciclo = cicloDaExperiencia(
                          portal.avaliacoes?.abertas,
                          item.colaborador_id,
                          item.marco
                        );
                        return (
                        <li key={`${item.colaborador_id}-${item.marco}`}>
                          <span className={classeEtiqueta(item.gravidade)}>
                            dia {item.marco}
                          </span>
                          <Link
                            className={estilos.nomeLink}
                            href={
                              ciclo
                                ? `/avaliacoes/${ciclo.ciclo_id}`
                                : `/colaboradores/${item.colaborador_id}`
                            }
                          >
                            {item.nome_completo}
                          </Link>
                          <span className={estilos.detalhe}>
                            {formatarData(item.data_marco)} ·{" "}
                            {prazoTexto(item.dias_para_marco)}
                            {item.do_processo ? "" : " · data derivada da admissão"}
                            {ciclo
                              ? ` · responder a avaliação de ${marcoDoCiclo(ciclo.tipo)} dias`
                              : ""}
                          </span>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className={estilos.subtituloBloco}>
                    ASO vencido, a vencer ou nunca feito
                  </h3>
                  {portal.alertas.aso === null ? (
                    <p className={estilos.bloqueado}>
                      Requer a chave de SST (ou ser o gestor da equipe).
                    </p>
                  ) : portal.alertas.aso.length === 0 ? (
                    <p className={estilos.vazio}>Exames em dia.</p>
                  ) : (
                    <ul className={estilos.lista}>
                      {portal.alertas.aso.map((item) => (
                        <li key={item.colaborador_id}>
                          <span className={classeEtiqueta(item.gravidade)}>
                            {etiquetaAso(item)}
                          </span>
                          <Link
                            className={estilos.nomeLink}
                            href={`/colaboradores/${item.colaborador_id}`}
                          >
                            {item.nome_completo}
                          </Link>
                          <span className={estilos.detalhe}>
                            {item.validade === null ||
                            item.dias_ate_validade === null
                              ? `nenhum ASO registrado · admitido em ${formatarData(
                                  item.data_admissao
                                )} (${item.dias_desde_admissao} dia(s))`
                              : `validade ${formatarData(item.validade)} · ${prazoTexto(
                                  item.dias_ate_validade
                                )}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={estilos.notaRodape}>
                    Só a data de vencimento: resultado do exame e restrição
                    clínica são dado de saúde e não trafegam para o gestor.
                  </p>
                </div>
              </div>
            </Bloco>

            {/* -------------------------------------------------- 7. treinamentos */}
            <Bloco titulo="Treinamentos da equipe">
              <p className={estilos.bloqueado}>{portal.treinamentos.nota}</p>
            </Bloco>
          </>
        )}
      </main>
    </div>
  );
}
