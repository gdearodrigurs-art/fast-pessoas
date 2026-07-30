"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cabecalho, acaoCabecalho } from "@/app/cabecalho";
import { ROTULOS_NIVEL_ALERTA, NivelAlerta } from "@/dominios/ferias/esquemas";
import estilos from "./page.module.css";

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
  validade: string;
  dias_ate_validade: number;
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
                    <div
                      className={
                        (portal.turnover.percentual ?? 0) >= 20
                          ? `${estilos.numero} ${estilos.numeroAtencao}`
                          : estilos.numero
                      }
                    >
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
                      Requer a chave de admissões.
                    </p>
                  ) : portal.alertas.experiencia.length === 0 ? (
                    <p className={estilos.vazio}>
                      Nenhum marco chegando na equipe.
                    </p>
                  ) : (
                    <ul className={estilos.lista}>
                      {portal.alertas.experiencia.map((item) => (
                        <li key={`${item.colaborador_id}-${item.marco}`}>
                          <span className={classeEtiqueta(item.gravidade)}>
                            dia {item.marco}
                          </span>
                          <Link
                            className={estilos.nomeLink}
                            href={`/colaboradores/${item.colaborador_id}`}
                          >
                            {item.nome_completo}
                          </Link>
                          <span className={estilos.detalhe}>
                            {formatarData(item.data_marco)} ·{" "}
                            {prazoTexto(item.dias_para_marco)}
                            {item.do_processo ? "" : " · data derivada da admissão"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className={estilos.subtituloBloco}>
                    ASO vencido ou a vencer
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
                            {item.dias_ate_validade < 0 ? "vencido" : "a vencer"}
                          </span>
                          <Link
                            className={estilos.nomeLink}
                            href={`/colaboradores/${item.colaborador_id}`}
                          >
                            {item.nome_completo}
                          </Link>
                          <span className={estilos.detalhe}>
                            validade {formatarData(item.validade)} ·{" "}
                            {prazoTexto(item.dias_ate_validade)}
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
