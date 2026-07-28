import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { FiltroIndividual, RespostaCheckin } from "./esquemas";
import {
  AgregadoDia,
  AgregadoGeral,
  AgregadoPergunta,
  agregadoGeral,
  agregadoPorDia,
  agregadoPorPergunta,
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

export interface AgregadoClima {
  periodo: { inicio: string; fim: string };
  geral: AgregadoGeral;
  por_dia: AgregadoDia[];
  por_pergunta: AgregadoPergunta[];
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
    if (violacaoUnica(erro) === "checkin_resposta_unica_no_dia") {
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
  const [geral, porDia, porPergunta] = await Promise.all([
    agregadoGeral(inicio, fim),
    agregadoPorDia(inicio, fim),
    agregadoPorPergunta(inicio, fim),
  ]);
  // Agregado da empresa inteira: média, contagens e nada mais — NUNCA autor.
  return {
    periodo: { inicio, fim },
    geral,
    por_dia: porDia,
    por_pergunta: porPergunta,
  };
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
