import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { lerMinimoPorRecorte } from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { FiltroIndividual, RespostaCheckin } from "./esquemas";
import {
  AgregadoDia,
  AgregadoGeral,
  AgregadoPergunta,
  AgregadoUnidade,
  agregadoGeral,
  agregadoPorDia,
  agregadoPorPergunta,
  agregadoPorUnidade,
  adesaoCheckinPorDia,
  buscarColaboradorPorUsuario,
  inserirResposta,
  listarPerguntasAtivas,
  listarRespostasDoDia,
  listarRespostasIndividuais,
  registrarLeituraSensivel,
  RespostaIndividual,
} from "./repositorio";

const TABELA_RESPOSTA = "rh_clima.checkin_resposta";
const CHAVE_INDIVIDUAL = "clima.resposta.individual.ver";
const RECURSO_INDIVIDUAL = "clima.checkin_resposta.individual";
const FUSO_EXIBICAO = "America/Sao_Paulo";
const DIAS_JANELA_AGREGADO = 30;
/** Recorte "recente" comparado com o restante da janela, por unidade. */
const DIAS_RECORTE_RECENTE = 7;
/**
 * O PISO DE RESPONDENTES POR UNIDADE NÃO MORA MAIS AQUI.
 *
 * Até a migration 0045 este arquivo trazia `MINIMO_RESPONDENTES_UNIDADE = 5`.
 * Era a mesma política de privacidade que a 0044 tinha acabado de tirar do
 * fonte para sistema.parametro_privacidade.minimo_por_recorte — só que escrita
 * de novo, aqui, onde o parâmetro não alcançava. Resultado medido antes da
 * correção: com o parâmetro em 20 e em 2, /api/clima/agregado publicava
 * EXATAMENTE os mesmos recortes. O dono acreditava ter mudado a política da
 * empresa e tinha mudado metade dela — e a metade de fora era justamente a
 * pesquisa de clima, onde a promessa de anonimato é o que faz a pessoa
 * responder a verdade.
 *
 * MESMO parâmetro dos relatórios, e não um segundo campo, porque as duas
 * pontas contam a MESMA coisa: PESSOAS por trás do número publicado. Aqui é
 * COUNT(DISTINCT colaborador_id) por unidade (ver agregadoPorUnidade); lá é a
 * quantidade de pessoas do recorte de diversidade. Piso separado só se
 * justificaria se as unidades de contagem fossem diferentes — não é o caso.
 *
 * O valor vigente é lido a cada chamada em `obterAgregado`.
 */
/** Queda (em pontos da escala 1–5) a partir da qual a unidade é destacada. */
const QUEDA_RELEVANTE = 0.3;

export interface PerguntaDoDia {
  id: number;
  texto: string;
  resposta: { nota: number; comentario: string | null } | null;
}

export interface CheckinDoDia {
  data_referencia: string;
  colaborador_vinculado: boolean;
  perguntas: PerguntaDoDia[];
}

export interface UnidadeNoAgregado extends AgregadoUnidade {
  /** media_recente − media_anterior; null quando falta um dos dois lados. */
  variacao: number | null;
  /** Queda igual ou maior que QUEDA_RELEVANTE — a tela destaca. */
  em_queda: boolean;
}

export interface AgregadoClima {
  periodo: { inicio: string; fim: string };
  geral: AgregadoGeral;
  por_dia: AgregadoDia[];
  por_pergunta: AgregadoPergunta[];
  por_unidade: UnidadeNoAgregado[];
  /** Parâmetros do recorte, para a tela explicar o que está comparando. */
  recorte: { dias_recentes: number; minimo_respondentes: number };
}

/** Dia de referência do check-in é o dia corrente em América/São Paulo. */
export function dataReferenciaHoje(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_EXIBICAO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function diasAntes(dataIso: string, dias: number): string {
  const base = new Date(`${dataIso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export async function obterCheckinDoDia(
  sessao: PayloadSessao
): Promise<CheckinDoDia> {
  const dataReferencia = dataReferenciaHoje();
  const [perguntas, colaborador] = await Promise.all([
    listarPerguntasAtivas(),
    buscarColaboradorPorUsuario(sessao.usuario_id),
  ]);
  const respostas = colaborador
    ? await listarRespostasDoDia(colaborador.id, dataReferencia)
    : [];
  return {
    data_referencia: dataReferencia,
    colaborador_vinculado: colaborador !== null,
    perguntas: perguntas.map((pergunta) => {
      const resposta = respostas.find(
        (item) => item.pergunta_versao_id === pergunta.id
      );
      return {
        id: pergunta.id,
        texto: pergunta.texto,
        resposta: resposta
          ? { nota: resposta.nota, comentario: resposta.comentario }
          : null,
      };
    }),
  };
}

export async function responderCheckin(
  sessao: PayloadSessao,
  dados: RespostaCheckin
): Promise<{ pergunta_versao_id: number; nota: number; comentario: string | null }> {
  const [colaborador, perguntas] = await Promise.all([
    buscarColaboradorPorUsuario(sessao.usuario_id),
    listarPerguntasAtivas(),
  ]);
  if (!colaborador) {
    throw new ErroHttp(
      403,
      "Sua conta não está vinculada a um colaborador — procure o RH."
    );
  }
  const pergunta = perguntas.find(
    (item) => item.id === dados.pergunta_versao_id
  );
  if (!pergunta) {
    throw new ErroHttpCampo(
      400,
      "Pergunta indisponível para resposta.",
      "pergunta_versao_id"
    );
  }
  const dataReferencia = dataReferenciaHoje();
  const comentario = dados.comentario ?? null;
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      const respostaId = await inserirResposta(cliente, {
        colaborador_id: colaborador.id,
        pergunta_versao_id: dados.pergunta_versao_id,
        data_referencia: dataReferencia,
        nota: dados.nota,
        comentario,
      });
      // Registra QUE respondeu, nunca O QUE respondeu: nota e comentário fora
      // do diff — audit.alteracao é legível por quem tem rh.auditar e seria
      // canal lateral que burlaria a rota restrita da Diretoria de Pessoas.
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_RESPOSTA,
        registroId: String(respostaId),
        diff: {
          Data: { de: null, para: formatarData(dataReferencia) },
          Pergunta: { de: null, para: pergunta.texto },
        },
      });
    });
  } catch (erro) {
    const violada = violacaoUnica(erro);
    // A segunda é a trava por PESSOA (0052): dispara quando quem tenta
    // responder de novo é o vínculo aberto por transferência entre CNPJs no
    // mesmo dia.
    if (
      violada === "checkin_resposta_unica_no_dia" ||
      violada === "checkin_resposta_unica_no_dia_por_pessoa"
    ) {
      throw new ErroHttp(409, "Você já respondeu esta pergunta hoje.");
    }
    throw erro;
  }
  return {
    pergunta_versao_id: dados.pergunta_versao_id,
    nota: dados.nota,
    comentario,
  };
}

export async function obterAgregado(): Promise<AgregadoClima> {
  const fim = dataReferenciaHoje();
  const inicio = diasAntes(fim, DIAS_JANELA_AGREGADO - 1);
  // Lido a cada chamada, e não guardado em módulo: mudar o piso pela tela tem
  // de valer na próxima abertura do painel, sem reiniciar o servidor.
  const minimoRespondentes = await lerMinimoPorRecorte();
  const [geral, porDia, porPergunta, porUnidade] = await Promise.all([
    agregadoGeral(inicio, fim),
    agregadoPorDia(inicio, fim),
    agregadoPorPergunta(inicio, fim),
    agregadoPorUnidade(inicio, fim, DIAS_RECORTE_RECENTE, minimoRespondentes),
  ]);
  // Agregado: média, contagens e nada mais — NUNCA autor. O corte por unidade
  // respeita o piso de anonimato vigente (sistema.parametro_privacidade).
  return {
    periodo: { inicio, fim },
    geral,
    por_dia: porDia,
    por_pergunta: porPergunta,
    por_unidade: porUnidade.map((unidade) => {
      const variacao =
        unidade.media_recente !== null && unidade.media_anterior !== null
          ? unidade.media_recente - unidade.media_anterior
          : null;
      return {
        ...unidade,
        variacao,
        em_queda: variacao !== null && variacao <= -QUEDA_RELEVANTE,
      };
    }),
    recorte: {
      dias_recentes: DIAS_RECORTE_RECENTE,
      minimo_respondentes: minimoRespondentes,
    },
  };
}

/**
 * Fonte do indicador `adesao_checkin` (rh.indicador): média diária de
 * "colaboradores que responderam ÷ ativos" nos dias COM movimento da janela
 * de 30 dias. Devolve percentual com uma casa, ou null quando não há dia
 * apurável — só agregado, nunca quem respondeu.
 */
export async function valorIndicadorAdesaoCheckin(): Promise<number | null> {
  const fim = dataReferenciaHoje();
  const inicio = diasAntes(fim, DIAS_JANELA_AGREGADO - 1);
  const { respondentes_por_dia, ativos } = await adesaoCheckinPorDia(
    inicio,
    fim
  );
  if (ativos === 0 || respondentes_por_dia.length === 0) return null;
  const somaDosPercentuais = respondentes_por_dia.reduce(
    (soma, respondentes) => soma + respondentes / ativos,
    0
  );
  const media = somaDosPercentuais / respondentes_por_dia.length;
  return Math.round(media * 1000) / 10;
}

export async function obterRespostasIndividuais(
  sessao: PayloadSessao,
  filtro: FiltroIndividual
): Promise<{
  periodo: { inicio: string; fim: string };
  respostas: RespostaIndividual[];
}> {
  const fim = filtro.fim ?? dataReferenciaHoje();
  const inicio = filtro.inicio ?? diasAntes(fim, DIAS_JANELA_AGREGADO - 1);
  if (inicio > fim) {
    throw new ErroHttpCampo(
      400,
      "Início do período deve ser anterior ao fim.",
      "inicio"
    );
  }
  // Leitura e trilha na MESMA transação: cada chamada grava em
  // audit.leitura_sensivel quem viu a resposta de quem (uma linha por
  // colaborador retornado; linha sem registro quando a busca volta vazia).
  const respostas = await comTransacao(sessao.usuario_id, async (cliente) => {
    const linhas = await listarRespostasIndividuais(cliente, {
      inicio,
      fim,
      colaborador_id: filtro.colaborador_id,
    });
    const colaboradoresLidos = [
      ...new Set(linhas.map((linha) => linha.colaborador_id)),
    ];
    if (colaboradoresLidos.length === 0) {
      await registrarLeituraSensivel(cliente, {
        usuarioId: sessao.usuario_id,
        chavePermissao: CHAVE_INDIVIDUAL,
        recurso: RECURSO_INDIVIDUAL,
        registroId: null,
      });
    }
    for (const colaboradorId of colaboradoresLidos) {
      await registrarLeituraSensivel(cliente, {
        usuarioId: sessao.usuario_id,
        chavePermissao: CHAVE_INDIVIDUAL,
        recurso: RECURSO_INDIVIDUAL,
        registroId: String(colaboradorId),
      });
    }
    return linhas;
  });
  return { periodo: { inicio, fim }, respostas };
}
