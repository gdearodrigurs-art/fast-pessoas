import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { lerMinimoPorRecorte } from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { FiltroIndividual, RespostaCheckin, TextoPergunta } from "./esquemas";
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
  atualizarTextoPergunta,
  buscarColaboradorPorUsuario,
  buscarPerguntaParaMutacao,
  contarRespostasDaPergunta,
  criarPerguntaAtiva,
  encerrarPergunta,
  inserirResposta,
  listarPerguntasAdmin,
  listarPerguntasAtivas,
  listarRespostasDoDia,
  listarRespostasIndividuais,
  PerguntaAdmin,
  proximaOrdemAtiva,
  registrarLeituraSensivel,
  RespostaIndividual,
} from "./repositorio";

const TABELA_RESPOSTA = "rh_clima.checkin_resposta";
const TABELA_PERGUNTA = "rh_clima.pergunta_versao";
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

// ------------------------------------------------------------------ administração das perguntas do check-in (0075)
//
// Os quatro atos do dono (docs/16:459-464): EDITAR (só sem resposta) ·
// REFORMULAR (versão nova apontando pra anterior, encerra a anterior no mesmo
// ato) · APOSENTAR (encerra sem continuidade) · ASSUNTO NOVO (pergunta nova,
// sem continuidade). O check-in não tem etapa de rascunho: nasce ativa.

export interface PerguntasAdmin {
  /** As que valem hoje, na ordem em que aparecem no check-in. */
  ativas: PerguntaAdmin[];
  /** Encerradas (aposentadas ou substituídas por reformulação), mais nova primeiro. */
  encerradas: PerguntaAdmin[];
}

export async function obterPerguntasAdmin(): Promise<PerguntasAdmin> {
  const todas = await listarPerguntasAdmin();
  return {
    ativas: todas
      .filter((p) => p.status === "ativa")
      .sort((a, b) => a.ordem - b.ordem),
    encerradas: todas
      .filter((p) => p.status === "encerrada")
      .sort((a, b) => (b.fim_vigencia ?? "").localeCompare(a.fim_vigencia ?? "")),
  };
}

/** Assunto novo: pergunta nova, ordem no fim, sem continuidade. */
export async function criarPergunta(
  sessao: PayloadSessao,
  dados: TextoPergunta
): Promise<{ id: number }> {
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const ordem = await proximaOrdemAtiva(cliente);
      const id = await criarPerguntaAtiva(cliente, {
        texto: dados.texto,
        ordem,
        continua_de: null,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_PERGUNTA,
        registroId: String(id),
        diff: {
          Texto: { de: null, para: dados.texto },
          Ordem: { de: null, para: String(ordem) },
        },
      });
      return { id };
    });
  } catch (erro) {
    // Dois "assunto novo" concorrentes leem o mesmo MAX(ordem) e colidem no
    // índice parcial pergunta_versao_ordem_ativa (23505). O dado fica íntegro
    // (o índice barrou o segundo INSERT); traduzimos para 409 amigável em vez
    // do 500 cru. Reformular não sofre disso (reusa a ordem da anterior,
    // serializado pelo FOR UPDATE).
    if (violacaoUnica(erro) === "pergunta_versao_ordem_ativa") {
      throw new ErroHttp(
        409,
        "Outra pergunta foi criada ao mesmo tempo — recarregue e tente de novo."
      );
    }
    throw erro;
  }
}

/** Editar: só enquanto não houver resposta (o trigger é a trava dura). */
export async function editarTextoPergunta(
  sessao: PayloadSessao,
  id: number,
  dados: TextoPergunta
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const pergunta = await buscarPerguntaParaMutacao(cliente, id);
    if (!pergunta) throw new ErroHttp(404, "Pergunta não encontrada.");
    if (pergunta.status === "encerrada") {
      throw new ErroHttp(409, "Pergunta encerrada é imutável.");
    }
    if (pergunta.texto === dados.texto) return;
    const respostas = await contarRespostasDaPergunta(cliente, id);
    if (respostas > 0) {
      throw new ErroHttp(
        409,
        `Esta pergunta já tem ${respostas} resposta(s) — o enunciado é imutável. Use "Reformular" para publicar uma nova versão.`
      );
    }
    await atualizarTextoPergunta(cliente, id, dados.texto);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_PERGUNTA,
      registroId: String(id),
      diff: { Texto: { de: pergunta.texto, para: dados.texto } },
    });
  });
}

/** Reformular: encerra a ativa e publica uma nova na MESMA ordem, ligada a ela. */
export async function reformularPergunta(
  sessao: PayloadSessao,
  id: number,
  dados: TextoPergunta
): Promise<{ id: number }> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const anterior = await buscarPerguntaParaMutacao(cliente, id);
    if (!anterior) throw new ErroHttp(404, "Pergunta não encontrada.");
    if (anterior.status !== "ativa") {
      throw new ErroHttp(409, "Só uma pergunta ativa pode ser reformulada.");
    }
    // Encerra a anterior ANTES de inserir a nova ativa: as duas dividem a mesma
    // ordem, e o índice "uma ativa por ordem" só admite uma por vez.
    await encerrarPergunta(cliente, id);
    const novaId = await criarPerguntaAtiva(cliente, {
      texto: dados.texto,
      ordem: anterior.ordem,
      continua_de: id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_PERGUNTA,
      registroId: String(novaId),
      diff: {
        Reformula: { de: `#${id}: ${anterior.texto}`, para: dados.texto },
        Ordem: { de: null, para: String(anterior.ordem) },
      },
    });
    return { id: novaId };
  });
}

/** Aposentar: encerra sem substituta — a pergunta sai do check-in. */
export async function aposentarPergunta(
  sessao: PayloadSessao,
  id: number
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const pergunta = await buscarPerguntaParaMutacao(cliente, id);
    if (!pergunta) throw new ErroHttp(404, "Pergunta não encontrada.");
    if (pergunta.status !== "ativa") {
      throw new ErroHttp(409, "Só uma pergunta ativa pode ser aposentada.");
    }
    await encerrarPergunta(cliente, id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_PERGUNTA,
      registroId: String(id),
      diff: {
        Situação: {
          de: "ativa",
          para: "aposentada (encerrada, sem substituta)",
        },
      },
    });
  });
}
