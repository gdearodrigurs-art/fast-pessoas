import { PoolClient } from "pg";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { inserirEvento } from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { notificar, notificarLote } from "../notificacoes/servico";
import {
  CriacaoDemanda,
  FiltroDemandas,
  formatarNumeroDemanda,
  ROTULOS_STATUS_DEMANDA,
  STATUS_ATIVOS,
  StatusDemanda,
} from "./esquemas";
import {
  atendentesDaFila,
  atualizarStatus,
  buscarParaTransicao,
  buscarResumo,
  buscarTipoAtivo,
  colaboradorDoUsuario,
  ComentarioDemanda,
  criar,
  DemandaParaTransicao,
  DemandaResumo,
  ehGestorDoUsuario,
  gestoresDoUsuario,
  IndicadoresFila,
  inserirComentario,
  inserirTransicao,
  listarAprovacoesPendentes,
  listarComentarios,
  listarDecididasDaEquipe,
  listarDoSolicitante,
  listarTodas,
  listarTransicoes,
  indicadoresFila,
  temPermissao,
  TipoDemandaAtivo,
  tiposAtivos,
  TransicaoDemanda,
} from "./repositorio";

const TABELA_DEMANDA = "rh.demanda";

export interface PermissoesDemandas {
  aprovar: boolean;
  atender: boolean;
  ver_todas: boolean;
}

export interface VisaoDemandas {
  pode: PermissoesDemandas;
  tipos: TipoDemandaAtivo[];
  minhas: DemandaResumo[];
  aprovacoes: DemandaResumo[] | null;
  equipe_decididas: DemandaResumo[] | null;
  fila: {
    indicadores: IndicadoresFila;
    demandas: DemandaResumo[];
  } | null;
}

export interface DetalheDemanda {
  demanda: DemandaResumo;
  transicoes: TransicaoDemanda[];
  comentarios: ComentarioDemanda[];
  acoes: {
    aprovar: boolean;
    reprovar: boolean;
    assumir: boolean;
    concluir: boolean;
    recusar: boolean;
    comentar: boolean;
  };
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function demandaAtiva(status: StatusDemanda): boolean {
  return STATUS_ATIVOS.includes(status);
}

async function permissoesDe(usuarioId: number): Promise<PermissoesDemandas> {
  const [aprovar, atender, verTodas] = await Promise.all([
    temPermissao(usuarioId, "demanda.aprovar"),
    temPermissao(usuarioId, "demanda.atender"),
    temPermissao(usuarioId, "demanda.ver.todas"),
  ]);
  return { aprovar, atender, ver_todas: verTodas };
}

export async function montarVisao(
  sessao: PayloadSessao,
  filtro: FiltroDemandas
): Promise<VisaoDemandas> {
  const pode = await permissoesDe(sessao.usuario_id);
  const [tipos, minhas] = await Promise.all([
    tiposAtivos(),
    listarDoSolicitante(sessao.usuario_id),
  ]);
  const [aprovacoes, equipeDecididas] = pode.aprovar
    ? await Promise.all([
        listarAprovacoesPendentes(sessao.usuario_id),
        listarDecididasDaEquipe(sessao.usuario_id),
      ])
    : [null, null];
  const fila = pode.ver_todas
    ? {
        indicadores: await indicadoresFila(),
        demandas: await listarTodas(filtro),
      }
    : null;
  return {
    pode,
    tipos,
    minhas,
    aprovacoes,
    equipe_decididas: equipeDecididas,
    fila,
  };
}

export async function criarDemanda(
  sessao: PayloadSessao,
  dados: CriacaoDemanda
): Promise<DemandaResumo> {
  const tipo = await buscarTipoAtivo(dados.tipo_chave);
  if (!tipo) {
    throw new ErroHttpCampo(400, "Tipo de demanda inválido.", "tipo_chave");
  }
  const statusInicial: StatusDemanda = tipo.exige_aprovacao_gestor
    ? "aguardando_aprovacao"
    : "aberta";

  const criada = await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaboradorId = await colaboradorDoUsuario(
      cliente,
      sessao.usuario_id
    );
    const demanda = await criar(cliente, {
      tipo_demanda_versao_id: tipo.id,
      solicitante_usuario_id: sessao.usuario_id,
      solicitante_colaborador_id: colaboradorId,
      descricao: dados.descricao,
      status: statusInicial,
      sla_dias: tipo.sla_dias,
    });
    await inserirTransicao(cliente, {
      demanda_id: demanda.id,
      de_status: null,
      para_status: statusInicial,
      por_usuario_id: sessao.usuario_id,
      motivo: null,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_DEMANDA,
      registroId: String(demanda.id),
      diff: {
        "Número": { de: null, para: formatarNumeroDemanda(demanda.numero) },
        Tipo: { de: null, para: tipo.nome },
        "Descrição": { de: null, para: dados.descricao },
        Status: { de: null, para: ROTULOS_STATUS_DEMANDA[statusInicial] },
        Prazo: { de: null, para: formatarData(demanda.prazo) },
      },
    });
    // Aviso neutro ao(s) gestor(es) vigente(s) — o conteúdo fica na tela.
    if (statusInicial === "aguardando_aprovacao") {
      const gestores = await gestoresDoUsuario(cliente, sessao.usuario_id);
      await notificarLote(
        cliente,
        gestores
          .filter((usuarioId) => usuarioId !== sessao.usuario_id)
          .map((usuarioId) => ({
            usuarioId,
            tipo: "demanda.aprovacao_pendente",
            titulo: "Demanda aguardando sua aprovação",
            corpo: `${sessao.nome} abriu a demanda ${formatarNumeroDemanda(demanda.numero)} e aguarda sua decisão.`,
            link: `/demandas/${demanda.id}`,
          }))
      );
    } else {
      // Tipo que dispensa aprovação: já nasce na fila do DP.
      await notificarFilaDoDp(cliente, sessao, demanda, tipo.nome);
    }
    return demanda;
  });

  const resumo = await buscarResumo(criada.id);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao carregar a demanda criada.");
  }
  return resumo;
}

export async function obterDemanda(
  sessao: PayloadSessao,
  id: number
): Promise<DetalheDemanda> {
  const demanda = await buscarResumo(id);
  if (!demanda) {
    throw new ErroHttp(404, "Demanda não encontrada.");
  }
  const pode = await permissoesDe(sessao.usuario_id);
  const souSolicitante = demanda.solicitante_usuario_id === sessao.usuario_id;
  const souGestor = pode.aprovar
    ? await ehGestorDoUsuario(sessao.usuario_id, demanda.solicitante_usuario_id)
    : false;
  const participante =
    souSolicitante || souGestor || pode.atender || pode.ver_todas;
  if (!participante) {
    // Ausência, não máscara: quem não participa não sabe que a demanda existe.
    throw new ErroHttp(404, "Demanda não encontrada.");
  }
  const [transicoes, comentarios] = await Promise.all([
    listarTransicoes(id),
    listarComentarios(id),
  ]);
  const aguardando = demanda.status === "aguardando_aprovacao";
  return {
    demanda,
    transicoes,
    comentarios,
    acoes: {
      aprovar: souGestor && aguardando,
      reprovar: souGestor && aguardando,
      assumir: pode.atender && demanda.status === "aberta",
      concluir: pode.atender && demanda.status === "em_atendimento",
      recusar:
        pode.atender &&
        (demanda.status === "aberta" || demanda.status === "em_atendimento"),
      comentar: demandaAtiva(demanda.status),
    },
  };
}

async function registrarTransicao(
  cliente: PoolClient,
  sessao: PayloadSessao,
  demanda: DemandaParaTransicao,
  paraStatus: StatusDemanda,
  motivo: string | null,
  diffExtra: Diff = {},
  atendenteUsuarioId?: number
): Promise<void> {
  await atualizarStatus(cliente, demanda.id, paraStatus, atendenteUsuarioId);
  await inserirTransicao(cliente, {
    demanda_id: demanda.id,
    de_status: demanda.status,
    para_status: paraStatus,
    por_usuario_id: sessao.usuario_id,
    motivo,
  });
  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "transicao",
    tabela: TABELA_DEMANDA,
    registroId: String(demanda.id),
    diff: {
      Status: {
        de: ROTULOS_STATUS_DEMANDA[demanda.status],
        para: ROTULOS_STATUS_DEMANDA[paraStatus],
      },
      ...diffExtra,
    },
  });
}

/**
 * Aviso neutro ao solicitante sobre o andamento da própria demanda — sempre
 * dentro da transação da transição; nada de motivo/resposta no corpo (o
 * conteúdo mora na página da demanda, atrás das checagens de acesso).
 */
async function notificarSolicitante(
  cliente: PoolClient,
  sessao: PayloadSessao,
  demanda: DemandaParaTransicao,
  tipo: string,
  titulo: string,
  corpo: string
): Promise<void> {
  if (demanda.solicitante_usuario_id === sessao.usuario_id) return;
  await notificar(cliente, {
    usuarioId: demanda.solicitante_usuario_id,
    tipo,
    titulo,
    corpo,
    link: `/demandas/${demanda.id}`,
  });
}

/**
 * Aviso neutro a quem atende a fila do DP quando uma demanda passa a estar
 * "aberta" — seja porque nasceu assim (tipo sem aprovação), seja porque o
 * gestor acabou de aprovar. Sem isto o pedido entra na fila em silêncio e o
 * DP só descobre se lembrar de abrir a tela.
 *
 * Como em todo aviso: título/corpo neutros, o conteúdo mora na página da
 * demanda, atrás da checagem de permissão.
 */
async function notificarFilaDoDp(
  cliente: PoolClient,
  sessao: PayloadSessao,
  demanda: { id: number; numero: number },
  tipoNome: string
): Promise<void> {
  const atendentes = await atendentesDaFila(cliente);
  await notificarLote(
    cliente,
    atendentes
      // Quem acabou de agir já sabe: não se notifica a própria ação.
      .filter((usuarioId) => usuarioId !== sessao.usuario_id)
      .map((usuarioId) => ({
        usuarioId,
        tipo: "demanda.na_fila",
        titulo: "Nova demanda na fila do DP",
        corpo: `${formatarNumeroDemanda(demanda.numero)} (${tipoNome}) entrou na fila e aguarda atendimento.`,
        link: `/demandas/${demanda.id}`,
      }))
  );
}

async function resumoAposTransicao(id: number): Promise<DemandaResumo> {
  const resumo = await buscarResumo(id);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao recarregar a demanda.");
  }
  return resumo;
}

async function exigirDemandaParaAprovacao(
  cliente: PoolClient,
  sessao: PayloadSessao,
  id: number
): Promise<DemandaParaTransicao> {
  const demanda = await buscarParaTransicao(cliente, id);
  if (!demanda) {
    throw new ErroHttp(404, "Demanda não encontrada.");
  }
  const souGestor = await ehGestorDoUsuario(
    sessao.usuario_id,
    demanda.solicitante_usuario_id,
    cliente
  );
  if (!souGestor) {
    throw new ErroHttp(
      403,
      "Apenas o gestor imediato do solicitante pode decidir esta aprovação."
    );
  }
  if (demanda.status !== "aguardando_aprovacao") {
    throw new ErroHttp(409, "Esta demanda não está aguardando aprovação.");
  }
  return demanda;
}

export async function aprovarDemanda(
  sessao: PayloadSessao,
  id: number
): Promise<DemandaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await exigirDemandaParaAprovacao(cliente, sessao, id);
    await registrarTransicao(cliente, sessao, demanda, "aberta", null);
    await notificarSolicitante(
      cliente,
      sessao,
      demanda,
      "demanda.aprovada",
      "Demanda aprovada pelo gestor",
      `A demanda ${formatarNumeroDemanda(demanda.numero)} foi aprovada e entrou na fila do DP.`
    );
    // A demanda acabou de entrar na fila: avisa quem vai atender.
    await notificarFilaDoDp(cliente, sessao, demanda, demanda.tipo_nome);
  });
  return resumoAposTransicao(id);
}

export async function reprovarDemanda(
  sessao: PayloadSessao,
  id: number,
  motivo: string
): Promise<DemandaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await exigirDemandaParaAprovacao(cliente, sessao, id);
    await registrarTransicao(cliente, sessao, demanda, "recusada", motivo, {
      "Motivo da reprovação": { de: null, para: motivo },
    });
    await notificarSolicitante(
      cliente,
      sessao,
      demanda,
      "demanda.reprovada",
      "Demanda reprovada pelo gestor",
      `A demanda ${formatarNumeroDemanda(demanda.numero)} foi reprovada. Veja o motivo na página da demanda.`
    );
  });
  return resumoAposTransicao(id);
}

export async function assumirDemanda(
  sessao: PayloadSessao,
  id: number
): Promise<DemandaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await buscarParaTransicao(cliente, id);
    if (!demanda) {
      throw new ErroHttp(404, "Demanda não encontrada.");
    }
    if (demanda.status !== "aberta") {
      throw new ErroHttp(
        409,
        "Só é possível assumir demanda aberta na fila do DP."
      );
    }
    await registrarTransicao(
      cliente,
      sessao,
      demanda,
      "em_atendimento",
      null,
      { Atendente: { de: null, para: sessao.nome } },
      sessao.usuario_id
    );
    await notificarSolicitante(
      cliente,
      sessao,
      demanda,
      "demanda.em_atendimento",
      "Demanda em atendimento",
      `A demanda ${formatarNumeroDemanda(demanda.numero)} foi assumida pelo DP e está em atendimento.`
    );
  });
  return resumoAposTransicao(id);
}

export async function concluirDemanda(
  sessao: PayloadSessao,
  id: number,
  resposta: string
): Promise<DemandaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await buscarParaTransicao(cliente, id);
    if (!demanda) {
      throw new ErroHttp(404, "Demanda não encontrada.");
    }
    if (demanda.status !== "em_atendimento") {
      throw new ErroHttp(
        409,
        "Só é possível concluir demanda em atendimento (assuma antes)."
      );
    }
    await registrarTransicao(cliente, sessao, demanda, "concluida", resposta, {
      Resposta: { de: null, para: resposta },
    });
    // A resposta também vira comentário, visível na thread (como no protótipo).
    await inserirComentario(cliente, {
      demanda_id: demanda.id,
      autor_usuario_id: sessao.usuario_id,
      texto: resposta,
    });
    // Projeção na linha do tempo do colaborador (quando houver ficha).
    if (demanda.solicitante_colaborador_id !== null) {
      await inserirEvento(cliente, {
        colaborador_id: demanda.solicitante_colaborador_id,
        tipo: "demanda_concluida",
        ocorrido_em: new Date().toISOString(),
        origem_tabela: TABELA_DEMANDA,
        origem_id: demanda.id,
        resumo: `Demanda ${formatarNumeroDemanda(demanda.numero)} (${demanda.tipo_nome}) concluída pelo DP`,
        payload: { numero: demanda.numero, tipo: demanda.tipo_nome },
        registrado_por: sessao.usuario_id,
      });
    }
    await notificarSolicitante(
      cliente,
      sessao,
      demanda,
      "demanda.concluida",
      "Demanda concluída pelo DP",
      `A demanda ${formatarNumeroDemanda(demanda.numero)} foi concluída. Veja a resposta na página da demanda.`
    );
  });
  return resumoAposTransicao(id);
}

export async function recusarDemanda(
  sessao: PayloadSessao,
  id: number,
  motivo: string
): Promise<DemandaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await buscarParaTransicao(cliente, id);
    if (!demanda) {
      throw new ErroHttp(404, "Demanda não encontrada.");
    }
    if (demanda.status !== "aberta" && demanda.status !== "em_atendimento") {
      throw new ErroHttp(
        409,
        "Só é possível recusar demanda aberta ou em atendimento."
      );
    }
    await registrarTransicao(cliente, sessao, demanda, "recusada", motivo, {
      "Motivo da recusa": { de: null, para: motivo },
    });
    await notificarSolicitante(
      cliente,
      sessao,
      demanda,
      "demanda.recusada",
      "Demanda recusada pelo DP",
      `A demanda ${formatarNumeroDemanda(demanda.numero)} foi recusada. Veja o motivo na página da demanda.`
    );
  });
  return resumoAposTransicao(id);
}

export async function comentarDemanda(
  sessao: PayloadSessao,
  id: number,
  texto: string
): Promise<ComentarioDemanda[]> {
  const demanda = await buscarResumo(id);
  if (!demanda) {
    throw new ErroHttp(404, "Demanda não encontrada.");
  }
  const pode = await permissoesDe(sessao.usuario_id);
  const souSolicitante = demanda.solicitante_usuario_id === sessao.usuario_id;
  const souGestor = pode.aprovar
    ? await ehGestorDoUsuario(sessao.usuario_id, demanda.solicitante_usuario_id)
    : false;
  if (!souSolicitante && !souGestor && !pode.atender && !pode.ver_todas) {
    throw new ErroHttp(404, "Demanda não encontrada.");
  }

  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await buscarParaTransicao(cliente, id);
    if (!atual || !demandaAtiva(atual.status)) {
      throw new ErroHttp(409, "Demanda encerrada não recebe comentários.");
    }
    const comentarioId = await inserirComentario(cliente, {
      demanda_id: id,
      autor_usuario_id: sessao.usuario_id,
      texto,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "comentario",
      tabela: "rh.demanda_comentario",
      registroId: String(comentarioId),
      diff: {
        Demanda: { de: null, para: formatarNumeroDemanda(demanda.numero) },
        "Comentário": { de: null, para: texto },
      },
    });
  });
  return listarComentarios(id);
}
