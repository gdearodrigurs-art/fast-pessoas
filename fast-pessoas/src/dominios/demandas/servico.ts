import { PoolClient } from "pg";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { ROTULOS_VINCULO } from "../colaboradores/esquemas";
import {
  atualizar as atualizarColaborador,
  buscarLotacaoVigenteParaAtualizar,
  buscarPosicaoVigenteParaAtualizar,
  buscarRelacaoGestorVigenteParaAtualizar,
  criar as criarVinculo,
  encerrarLotacao,
  encerrarPosicao,
  encerrarRelacaoGestor,
  inserirEvento,
  inserirLotacao,
  inserirPosicao,
  inserirRelacaoGestor,
  registrarLeituraSensivel,
} from "../colaboradores/repositorio";
import {
  listarCentrosCustoAtivos,
  OpcaoCentroCusto,
} from "../estrutura/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { notificar, notificarLote } from "../notificacoes/servico";
// O acerto do banco de horas na saída é do domínio de PONTO, e a transferência
// entre empresas usa exatamente a mesma função que o desligamento usa — sem
// tratamento inventado para o caso (item (h) da migration 0048).
import { liquidarBancoNaRescisao } from "../ponto/servico";
import {
  CriacaoDemanda,
  CriacaoMovimentacao,
  DecisaoEtapa,
  FiltroDemandas,
  formatarNumeroDemanda,
  NivelAprovacao,
  ROTULOS_NIVEL_APROVACAO,
  ROTULOS_STATUS_DEMANDA,
  ROTULOS_TIPO_MOVIMENTACAO,
  STATUS_ATIVOS,
  StatusDemanda,
  TipoMovimentacao,
} from "./esquemas";
import {
  atendentesDaFila,
  atualizarStatus,
  buscarColaboradorAlvo,
  buscarEtapaPendente,
  buscarVinculoParaTransferir,
  centroCustoAtivo,
  copiarDependentes,
  EmpresaAtiva,
  empresaAtiva,
  ligarSucessao,
  listarEmpresasAtivas,
  listarLiderados,
  matriculaEmUso,
  buscarMovimentacao,
  buscarMovimentacoesDeVarias,
  buscarParaTransicao,
  buscarResumo,
  buscarTipoAtivo,
  cargoVersaoAtiva,
  colaboradorDoUsuario,
  ComentarioDemanda,
  criar,
  decidirEtapa,
  DemandaParaTransicao,
  DemandaResumo,
  ehGestorDoColaborador,
  ehGestorDoUsuario,
  estabelecimentoAtivo,
  EtapaAprovacao,
  faixaVigenteDoCargo,
  gestoresDoUsuario,
  gestorVigenteDoColaborador,
  hojeSaoPaulo,
  IndicadoresFila,
  inserirComentario,
  inserirEtapa,
  inserirMovimentacao,
  inserirTransicao,
  listarAlvosPossiveis,
  listarAprovacoesPendentes,
  listarCargosAtivos,
  listarComentarios,
  listarDecididasDaEquipe,
  listarDoSolicitante,
  listarEtapas,
  listarEtapasDeVarias,
  listarMovimentacoesAplicadas,
  listarMovimentacoesDaDiretoria,
  listarMovimentacoesDoLider,
  listarTodas,
  listarTransicoes,
  listarUnidadesAtivas,
  marcarMovimentacaoAplicada,
  Movimentacao,
  indicadoresFila,
  temPermissao,
  TipoDemandaAtivo,
  tiposAtivos,
  TransicaoDemanda,
  usuariosComChave,
} from "./repositorio";

const TABELA_DEMANDA = "rh.demanda";

export interface PermissoesDemandas {
  aprovar: boolean;
  atender: boolean;
  ver_todas: boolean;
  /** Abrir pedido de promoção/transferência (movimentacao.solicitar). */
  solicitar_movimentacao: boolean;
  /** Decidir o nível da diretoria (movimentacao.aprovar.diretoria). */
  aprovar_diretoria: boolean;
  /** Ciência automática + acesso ao pedido (movimentacao.ciencia — DP e T&D). */
  ciencia_movimentacao: boolean;
  /** Ver remuneração (rh.posicao.ver) — decide o que entra no payload. */
  ver_salario: boolean;
  /**
   * Abrir transferência entre empresas do grupo
   * (movimentacao.transferir_empresa — DP e diretoria, migration 0048).
   * Chave separada de `solicitar_movimentacao` de propósito: encerrar um
   * contrato e abrir outro em outro CNPJ é ato de DP, não de líder.
   */
  transferir_empresa: boolean;
}

export interface CartaoMovimentacao {
  demanda: DemandaResumo;
  movimentacao: Movimentacao;
  etapas: EtapaAprovacao[];
}

export interface VisaoMovimentacoes {
  /** Pedidos que EU abri (acompanhamento do líder). */
  minhas: CartaoMovimentacao[];
  /** Etapa do líder pendente comigo (sou o gestor vigente do alvo). */
  do_lider: CartaoMovimentacao[] | null;
  /** Fila "aguardando aprovação da diretoria". */
  da_diretoria: CartaoMovimentacao[] | null;
  /** Já aplicadas — a lista de ciência de DP e T&D (trâmites). */
  aplicadas: CartaoMovimentacao[] | null;
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
  movimentacoes: VisaoMovimentacoes | null;
}

export interface DetalheDemanda {
  demanda: DemandaResumo;
  transicoes: TransicaoDemanda[];
  comentarios: ComentarioDemanda[];
  /** Preenchidos só quando o tipo tem fluxo 'movimentacao'. */
  movimentacao: Movimentacao | null;
  etapas: EtapaAprovacao[];
  acoes: {
    aprovar: boolean;
    reprovar: boolean;
    assumir: boolean;
    concluir: boolean;
    recusar: boolean;
    comentar: boolean;
    /** Nível da cadeia que ESTE usuário pode decidir agora (ou null). */
    decidir_etapa: NivelAprovacao | null;
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
  const [
    aprovar,
    atender,
    verTodas,
    solicitarMovimentacao,
    aprovarDiretoria,
    cienciaMovimentacao,
    verSalario,
    transferirEmpresa,
  ] = await Promise.all([
    temPermissao(usuarioId, "demanda.aprovar"),
    temPermissao(usuarioId, "demanda.atender"),
    temPermissao(usuarioId, "demanda.ver.todas"),
    temPermissao(usuarioId, "movimentacao.solicitar"),
    temPermissao(usuarioId, "movimentacao.aprovar.diretoria"),
    temPermissao(usuarioId, "movimentacao.ciencia"),
    temPermissao(usuarioId, "rh.posicao.ver"),
    temPermissao(usuarioId, "movimentacao.transferir_empresa"),
  ]);
  return {
    aprovar,
    atender,
    ver_todas: verTodas,
    solicitar_movimentacao: solicitarMovimentacao,
    aprovar_diretoria: aprovarDiretoria,
    ciencia_movimentacao: cienciaMovimentacao,
    ver_salario: verSalario,
    transferir_empresa: transferirEmpresa,
  };
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
    movimentacoes: await montarVisaoMovimentacoes(sessao, pode, minhas),
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
  // Promoção/transferência têm formulário próprio, cadeia de aprovação e
  // efeito automático: não podem nascer do formulário genérico (que só tem
  // descrição livre e nem sequer sabe quem é o colaborador alvo).
  if (tipo.fluxo === "movimentacao") {
    throw new ErroHttpCampo(
      400,
      `${tipo.nome} é aberta pelo formulário de movimentação, não por aqui.`,
      "tipo_chave"
    );
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
  const ehMovimentacao = demanda.fluxo === "movimentacao";
  const movimentacao = ehMovimentacao ? await buscarMovimentacao(id) : null;
  // Na movimentação o círculo de acesso é maior e nominal: o líder do
  // COLABORADOR ALVO (que decide o nível 1), DP e T&D (ciência dos trâmites) e
  // o próprio colaborador — este só DEPOIS de aplicada, quando o fato já é o
  // dele. Antes disso, ausência: nem sabe que o pedido existe.
  const souLiderDoAlvo =
    movimentacao !== null &&
    (await ehGestorDoColaborador(sessao.usuario_id, movimentacao.colaborador_id));
  const souOAlvoAplicado =
    movimentacao !== null &&
    movimentacao.aplicada_em !== null &&
    movimentacao.colaborador_usuario_id === sessao.usuario_id;
  const participante =
    souSolicitante ||
    souGestor ||
    pode.atender ||
    pode.ver_todas ||
    souLiderDoAlvo ||
    souOAlvoAplicado ||
    (ehMovimentacao && pode.ciencia_movimentacao);
  if (!participante) {
    // Ausência, não máscara: quem não participa não sabe que a demanda existe.
    throw new ErroHttp(404, "Demanda não encontrada.");
  }
  const [transicoes, comentarios, etapas] = await Promise.all([
    listarTransicoes(id),
    listarComentarios(id),
    ehMovimentacao ? listarEtapas(id) : Promise.resolve([]),
  ]);
  const aguardando = demanda.status === "aguardando_aprovacao";
  // Nível decidível AGORA por este usuário (a primeira etapa pendente).
  let decidirEtapaAgora: NivelAprovacao | null = null;
  if (ehMovimentacao && aguardando) {
    const pendente = [...etapas]
      .sort((a, b) => a.ordem - b.ordem)
      .find((etapa) => etapa.status === "pendente");
    if (pendente) {
      const podeDecidir =
        pendente.nivel === "lider"
          ? souLiderDoAlvo
          : pode.aprovar_diretoria && !souSolicitante;
      if (podeDecidir) decidirEtapaAgora = pendente.nivel;
    }
  }
  return {
    demanda,
    transicoes,
    comentarios,
    movimentacao: movimentacao
      ? await filtrarSensiveis(sessao, pode, movimentacao, souSolicitante, true)
      : null,
    etapas,
    acoes: {
      aprovar: souGestor && aguardando && !ehMovimentacao,
      reprovar: souGestor && aguardando && !ehMovimentacao,
      assumir: pode.atender && demanda.status === "aberta",
      concluir: pode.atender && demanda.status === "em_atendimento",
      recusar:
        pode.atender &&
        (demanda.status === "aberta" || demanda.status === "em_atendimento"),
      comentar: demandaAtiva(demanda.status),
      decidir_etapa: decidirEtapaAgora,
    },
  };
}

/**
 * Remuneração fora do payload de quem não pode ver — AUSÊNCIA (null), não
 * máscara. Vê valor quem tem `rh.posicao.ver` ou quem digitou a proposta (o
 * solicitante). Quando o valor sai, a leitura vira trilha em
 * audit.leitura_sensivel (só no detalhe; listas nunca carregam valor).
 */
async function filtrarSensiveis(
  sessao: PayloadSessao,
  pode: PermissoesDemandas,
  movimentacao: Movimentacao,
  souSolicitante: boolean,
  registrarLeitura: boolean
): Promise<Movimentacao> {
  const veValor = pode.ver_salario || souSolicitante;
  if (!veValor) {
    return {
      ...movimentacao,
      salario_proposto: null,
      faixa_min: null,
      faixa_max: null,
    };
  }
  if (registrarLeitura && movimentacao.salario_proposto !== null) {
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: pode.ver_salario ? "rh.posicao.ver" : "movimentacao.solicitar",
      recurso: "demanda_movimentacao.salario_proposto",
      registroId: String(movimentacao.id),
    });
  }
  return movimentacao;
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

/**
 * A aprovação genérica é do gestor do SOLICITANTE — que na movimentação não é
 * necessariamente o líder do colaborador alvo. Deixar passar por aqui seria
 * furar a cadeia; o caminho é `decidirEtapaMovimentacao`.
 */
function recusarSeMovimentacao(demanda: DemandaParaTransicao): void {
  if (demanda.fluxo === "movimentacao") {
    throw new ErroHttp(
      409,
      "Este pedido segue a cadeia de aprovação (líder → diretoria): decida pela tela do pedido."
    );
  }
}

export async function aprovarDemanda(
  sessao: PayloadSessao,
  id: number
): Promise<DemandaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await exigirDemandaParaAprovacao(cliente, sessao, id);
    recusarSeMovimentacao(demanda);
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
    recusarSeMovimentacao(demanda);
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

// ==================================================================
// Movimentação: promoção e transferência de unidade (migration 0021)
// ==================================================================
// Origem: feedback da analista de RH — "aprovação de promoção do líder para a
// diretoria […] e automaticamente com a aprovação o DP e Treinamento já ficam
// cientes providenciando os trâmites. Hoje ocorre de forma aleatória em canais
// diversos ou sem canal."
//
// Desenho: a demanda governa o ciclo (SLA, prazo, fila do DP); a cadeia de dois
// níveis vive em rh.etapa_aprovacao_demanda; o pedido em
// rh.demanda_movimentacao. Aprovada a ÚLTIMA etapa, tudo acontece na MESMA
// transação: nova posição/lotação vigente, evento na linha do tempo, ciência de
// DP e T&D, aviso ao colaborador e trilha em audit.alteracao.

const TABELA_MOVIMENTACAO = "rh.demanda_movimentacao";

/** O que MUDA em cada movimentação — rótulo do par origem → destino na trilha. */
const ROTULO_DESTINO: Record<TipoMovimentacao, string> = {
  promocao: "Cargo",
  transferencia_unidade: "Unidade",
  transferencia_empresa: "Registro (empresa)",
};

/** Tipo do evento gravado na linha do tempo do vínculo que sofre o efeito. */
const TIPO_EVENTO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  promocao: "promocao",
  transferencia_unidade: "transferencia",
  // Tipo próprio, e não "transferencia": este evento marca o FIM de um
  // contrato, não a troca de um campo dele. Quem lê a linha do tempo precisa
  // ver a diferença.
  transferencia_empresa: "transferencia_empresa",
};
const TABELA_ETAPA = "rh.etapa_aprovacao_demanda";

function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function cartoesDe(
  demandas: DemandaResumo[]
): Promise<CartaoMovimentacao[]> {
  const ids = demandas.map((demanda) => demanda.id);
  const [movimentacoes, etapas] = await Promise.all([
    buscarMovimentacoesDeVarias(ids),
    listarEtapasDeVarias(ids),
  ]);
  const cartoes: CartaoMovimentacao[] = [];
  for (const demanda of demandas) {
    const movimentacao = movimentacoes.get(demanda.id);
    if (!movimentacao) continue; // pedido sem detalhe não existe (1:1)
    cartoes.push({
      demanda,
      // Lista NUNCA carrega valor de remuneração (nem para quem pode ver): o
      // valor sai só no detalhe, onde a leitura é registrada.
      movimentacao: {
        ...movimentacao,
        salario_proposto: null,
        faixa_min: null,
        faixa_max: null,
      },
      etapas: etapas.get(demanda.id) ?? [],
    });
  }
  return cartoes;
}

async function montarVisaoMovimentacoes(
  sessao: PayloadSessao,
  pode: PermissoesDemandas,
  minhasDemandas: DemandaResumo[]
): Promise<VisaoMovimentacoes | null> {
  const participa =
    pode.solicitar_movimentacao ||
    pode.aprovar_diretoria ||
    pode.ciencia_movimentacao ||
    pode.aprovar;
  if (!participa) return null;
  const minhasMovimentacoes = minhasDemandas.filter(
    (demanda) => demanda.fluxo === "movimentacao"
  );
  const [minhas, doLider, daDiretoria, aplicadas] = await Promise.all([
    cartoesDe(minhasMovimentacoes),
    pode.aprovar
      ? listarMovimentacoesDoLider(sessao.usuario_id).then(cartoesDe)
      : Promise.resolve(null),
    pode.aprovar_diretoria
      ? listarMovimentacoesDaDiretoria().then(cartoesDe)
      : Promise.resolve(null),
    pode.ciencia_movimentacao
      ? listarMovimentacoesAplicadas().then(cartoesDe)
      : Promise.resolve(null),
  ]);
  return { minhas, do_lider: doLider, da_diretoria: daDiretoria, aplicadas };
}

export interface OpcoesMovimentacao {
  alvos: {
    id: number;
    nome_completo: string;
    cargo_atual: string | null;
    unidade_atual: string | null;
  }[];
  cargos: { id: number; nome: string }[];
  /** Catálogo de LOTAÇÃO (local físico) ativo. */
  unidades: { id: number; unidade: string }[];
  /** Catálogo de CENTRO DE CUSTO ativo — escolha, não texto livre (0047). */
  centros_custo: OpcaoCentroCusto[];
  /**
   * Catálogo de REGISTRO (as empresas do grupo). Vem vazio para quem não tem
   * `movimentacao.transferir_empresa`: sem a chave o formulário não oferece o
   * tipo, e sem opção não há como forjá-lo pela tela.
   */
  empresas: EmpresaAtiva[];
}

/**
 * Opções do formulário. `alvos` = liderados vigentes; quem abre em nome do
 * líder (DP/RH/diretoria) recebe a lista de ativos — e nesse caso a etapa do
 * líder nasce PENDENTE (ele ainda decide).
 */
export async function opcoesMovimentacao(
  sessao: PayloadSessao
): Promise<OpcoesMovimentacao> {
  const pode = await permissoesDe(sessao.usuario_id);
  const emNomeDoLider = pode.ver_todas || pode.aprovar_diretoria;
  const [alvos, cargos, unidades, centros_custo, empresas] = await Promise.all([
    listarAlvosPossiveis(sessao.usuario_id, emNomeDoLider),
    listarCargosAtivos(),
    listarUnidadesAtivas(),
    listarCentrosCustoAtivos(),
    pode.transferir_empresa
      ? listarEmpresasAtivas()
      : Promise.resolve([] as EmpresaAtiva[]),
  ]);
  return { alvos, cargos, unidades, centros_custo, empresas };
}

/**
 * Faixa vigente do cargo destino — o controle de enquadramento na tela (avisa
 * quando o valor sai da faixa ANTES de enviar). É dado de remuneração: só quem
 * pode abrir pedido a lê, e a leitura vira trilha.
 */
export async function faixaDoCargoDestino(
  sessao: PayloadSessao,
  cargoId: number
): Promise<{ faixa_min: number; faixa_max: number } | null> {
  const faixa = await faixaVigenteDoCargo(cargoId);
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "movimentacao.solicitar",
    recurso: "cargo.faixa_salarial",
    registroId: String(cargoId),
  });
  return faixa;
}

export async function criarMovimentacao(
  sessao: PayloadSessao,
  dados: CriacaoMovimentacao
): Promise<CartaoMovimentacao> {
  // A chave do tipo de demanda é o próprio tipo da movimentação (seed da 0021).
  const tipo = await buscarTipoAtivo(dados.tipo);
  if (!tipo || tipo.fluxo !== "movimentacao") {
    throw new ErroHttpCampo(400, "Tipo de movimentação inválido.", "tipo");
  }
  const rotuloTipo = ROTULOS_TIPO_MOVIMENTACAO[dados.tipo];

  const demandaId = await comTransacao(sessao.usuario_id, async (cliente) => {
    const alvo = await buscarColaboradorAlvo(cliente, dados.colaborador_id);
    if (!alvo) {
      throw new ErroHttpCampo(
        404,
        "Colaborador não encontrado.",
        "colaborador_id"
      );
    }
    if (alvo.status !== "ativo") {
      throw new ErroHttpCampo(
        409,
        "Só colaborador ativo recebe promoção ou transferência.",
        "colaborador_id"
      );
    }
    if (alvo.usuario_id === sessao.usuario_id) {
      throw new ErroHttpCampo(
        403,
        "Ninguém abre o próprio pedido de promoção ou transferência.",
        "colaborador_id"
      );
    }
    // Transferir de CNPJ encerra um contrato e abre outro: exige a chave
    // própria (0048), que o líder NÃO tem. Ele continua decidindo o nível 1
    // da cadeia — a pessoa sai da equipe dele.
    if (dados.tipo === "transferencia_empresa") {
      const podeTransferir = await temPermissao(
        sessao.usuario_id,
        "movimentacao.transferir_empresa"
      );
      if (!podeTransferir) {
        throw new ErroHttp(
          403,
          "Transferência entre empresas do grupo é ato de DP ou da diretoria."
        );
      }
    }
    // Quem pode abrir: o líder vigente do alvo (a dor descrita) ou, em nome
    // dele, quem administra posição (DP) / a diretoria — e nesse caso o líder
    // ainda decide o nível 1.
    const souLider = await ehGestorDoColaborador(
      sessao.usuario_id,
      alvo.id,
      cliente
    );
    if (!souLider) {
      const [podeDp, podeDiretoria] = await Promise.all([
        temPermissao(sessao.usuario_id, "rh.posicao.editar"),
        temPermissao(sessao.usuario_id, "movimentacao.aprovar.diretoria"),
      ]);
      if (!podeDp && !podeDiretoria) {
        throw new ErroHttpCampo(
          403,
          "Só o líder vigente do colaborador (ou o DP/diretoria em nome dele) abre este pedido.",
          "colaborador_id"
        );
      }
    }

    const hoje = await hojeSaoPaulo(cliente);
    if (dados.data_pretendida < hoje) {
      throw new ErroHttpCampo(
        400,
        "A data pretendida não pode ser no passado (não há efeito retroativo).",
        "data_pretendida"
      );
    }

    let cargoDestinoNome: string | null = null;
    let unidadeDestinoNome: string | null = null;
    let empresaDestinoNome: string | null = null;
    let origem = "";
    let faixaMin: number | null = null;
    let faixaMax: number | null = null;
    let dentroFaixa: boolean | null = null;

    if (dados.tipo === "promocao") {
      const cargoDestinoId = dados.cargo_destino_id as number;
      const cargoVersao = await cargoVersaoAtiva(cliente, cargoDestinoId);
      if (!cargoVersao) {
        throw new ErroHttpCampo(
          400,
          "O cargo destino não tem versão vigente (peça ao DP para publicar o RCF).",
          "cargo_destino_id"
        );
      }
      cargoDestinoNome = cargoVersao.nome;
      const posicao = await buscarPosicaoVigenteParaAtualizar(cliente, alvo.id);
      if (!posicao) {
        throw new ErroHttpCampo(
          409,
          "O colaborador não tem posição vigente — regularize o cadastro antes.",
          "colaborador_id"
        );
      }
      if (posicao.cargo_id === cargoDestinoId) {
        throw new ErroHttpCampo(
          400,
          "O cargo destino é o cargo atual do colaborador.",
          "cargo_destino_id"
        );
      }
      origem = posicao.cargo_nome;
      // Controle de enquadramento (PCCS): snapshot da faixa vigente do cargo
      // destino + trava de exceção — o MESMO padrão da oferta de vaga (0012).
      const faixa = await faixaVigenteDoCargo(cargoDestinoId, cliente);
      if (faixa) {
        faixaMin = faixa.faixa_min;
        faixaMax = faixa.faixa_max;
      }
      if (dados.salario_proposto !== undefined && faixa) {
        dentroFaixa =
          dados.salario_proposto >= faixa.faixa_min &&
          dados.salario_proposto <= faixa.faixa_max;
        if (!dentroFaixa && !dados.justificativa_excecao) {
          throw new ErroHttpCampo(
            400,
            `Salário proposto fora da faixa do cargo destino (${formatarSalario(faixa.faixa_min)} a ${formatarSalario(faixa.faixa_max)}): registre a justificativa de exceção.`,
            "justificativa_excecao"
          );
        }
      }
    } else if (dados.tipo === "transferencia_empresa") {
      // ------------------------------------------------ transferência entre CNPJs
      // Aqui não se troca um campo da alocação: encerra-se um CONTRATO e
      // abre-se outro. Tudo o que o vínculo novo vai precisar no primeiro dia
      // é conferido AGORA, na abertura do pedido, e não na aprovação — quem
      // aprova não deveria descobrir na hora do efeito que a matrícula já
      // existe ou que a empresa destino foi inativada no meio do caminho.
      const empresaId = dados.empresa_destino_id as number;
      const empresa = await empresaAtiva(cliente, empresaId);
      if (!empresa) {
        throw new ErroHttpCampo(
          400,
          "A empresa destino não existe ou está inativada.",
          "empresa_destino_id"
        );
      }
      empresaDestinoNome = empresa.nome_fantasia;

      const vinculo = await buscarVinculoParaTransferir(cliente, alvo.id);
      if (!vinculo) {
        throw new ErroHttpCampo(
          404,
          "Vínculo não encontrado.",
          "colaborador_id"
        );
      }
      if (vinculo.ja_sucedido) {
        throw new ErroHttpCampo(
          409,
          "Este vínculo já foi transferido para outra empresa do grupo — abra o pedido a partir do vínculo atual da pessoa.",
          "colaborador_id"
        );
      }
      const lotacao = await buscarLotacaoVigenteParaAtualizar(cliente, alvo.id);
      if (!lotacao) {
        throw new ErroHttpCampo(
          409,
          "O colaborador não tem alocação vigente — regularize registro, lotação e centro de custo antes.",
          "colaborador_id"
        );
      }
      if (lotacao.empresa_id === empresaId) {
        throw new ErroHttpCampo(
          400,
          `${empresa.nome_fantasia} já é a empresa de registro deste vínculo. Para trocar só de local, use a transferência de unidade.`,
          "empresa_destino_id"
        );
      }
      // Posição vigente: o cargo e o SALÁRIO viajam congelados para o vínculo
      // novo (item (d) da 0048). Sem posição não há o que congelar.
      const posicao = await buscarPosicaoVigenteParaAtualizar(cliente, alvo.id);
      if (!posicao) {
        throw new ErroHttpCampo(
          409,
          "O colaborador não tem posição vigente — regularize o cadastro antes.",
          "colaborador_id"
        );
      }
      const estabelecimentoId = dados.estabelecimento_destino_id as number;
      const estabelecimento = await estabelecimentoAtivo(
        cliente,
        estabelecimentoId
      );
      if (!estabelecimento) {
        throw new ErroHttpCampo(
          400,
          "A lotação destino não tem versão vigente.",
          "estabelecimento_destino_id"
        );
      }
      unidadeDestinoNome = estabelecimento.unidade;
      const centro = await centroCustoAtivo(
        cliente,
        dados.centro_custo_destino_id as number
      );
      if (!centro) {
        throw new ErroHttpCampo(
          400,
          "O centro de custo destino não existe ou está inativado.",
          "centro_custo_destino_id"
        );
      }
      const matricula = dados.matricula_destino as string;
      if (await matriculaEmUso(cliente, matricula)) {
        throw new ErroHttpCampo(
          409,
          `A matrícula ${matricula} já está em uso no grupo. A matrícula é única entre as empresas.`,
          "matricula_destino"
        );
      }
      if (dados.salario_proposto !== undefined) {
        throw new ErroHttpCampo(
          400,
          "Transferência entre empresas não altera salário: o vínculo novo nasce com a remuneração atual. Para aumentar, abra uma promoção depois.",
          "salario_proposto"
        );
      }
      if (dados.cargo_destino_id !== undefined) {
        throw new ErroHttpCampo(
          400,
          "Transferência entre empresas não muda o cargo: o vínculo novo nasce com o cargo atual.",
          "cargo_destino_id"
        );
      }
      origem = lotacao.empresa_nome ?? "empresa atual";
    } else {
      const estabelecimentoId = dados.estabelecimento_destino_id as number;
      const estabelecimento = await estabelecimentoAtivo(
        cliente,
        estabelecimentoId
      );
      if (!estabelecimento) {
        throw new ErroHttpCampo(
          400,
          "A unidade destino não tem versão vigente.",
          "estabelecimento_destino_id"
        );
      }
      unidadeDestinoNome = estabelecimento.unidade;
      const lotacao = await buscarLotacaoVigenteParaAtualizar(cliente, alvo.id);
      if (!lotacao) {
        throw new ErroHttpCampo(
          409,
          "O colaborador não tem lotação vigente — regularize o cadastro antes.",
          "colaborador_id"
        );
      }
      if (lotacao.estabelecimento_id === estabelecimentoId) {
        throw new ErroHttpCampo(
          400,
          "A unidade destino é a unidade atual do colaborador.",
          "estabelecimento_destino_id"
        );
      }
      origem = lotacao.unidade ?? "unidade atual";
      if (dados.salario_proposto !== undefined) {
        throw new ErroHttpCampo(
          400,
          "Transferência de unidade não altera salário — abra uma promoção para isso.",
          "salario_proposto"
        );
      }
    }

    const destino = cargoDestinoNome ?? empresaDestinoNome ?? unidadeDestinoNome ?? "";
    // Descrição legível para a fila do DP e T&D — SEM remuneração no texto.
    // Na transferência de empresa a fila do DP É o acerto: a demanda que sobra
    // depois da aprovação é exatamente a lista de trâmites (rescisão na
    // empresa de origem, registro e eSocial na destino, ASO admissional,
    // readesão de benefícios), e a descrição os enumera.
    const descricao =
      `${rotuloTipo} de ${alvo.nome_completo}: ${origem} → ${destino}` +
      ` a partir de ${formatarData(dados.data_pretendida)}.` +
      (dados.tipo === "transferencia_empresa"
        ? ` Matrícula na empresa destino: ${dados.matricula_destino}.` +
          ` Trâmites do DP: acerto rescisório na empresa de origem` +
          ` (inclui férias vencidas e proporcionais e o saldo do banco de horas),` +
          ` registro e eSocial na empresa destino, ASO admissional e readesão` +
          ` de benefícios.`
        : "") +
      ` Justificativa: ${dados.justificativa}`;

    const demanda = await criar(cliente, {
      tipo_demanda_versao_id: tipo.id,
      solicitante_usuario_id: sessao.usuario_id,
      solicitante_colaborador_id: await colaboradorDoUsuario(
        cliente,
        sessao.usuario_id
      ),
      descricao,
      status: "aguardando_aprovacao",
      sla_dias: tipo.sla_dias,
    });

    const movimentacaoId = await inserirMovimentacao(cliente, {
      demanda_id: demanda.id,
      tipo: dados.tipo,
      colaborador_id: alvo.id,
      cargo_destino_id: dados.cargo_destino_id ?? null,
      estabelecimento_destino_id: dados.estabelecimento_destino_id ?? null,
      centro_custo_destino_id: dados.centro_custo_destino_id ?? null,
      empresa_destino_id: dados.empresa_destino_id ?? null,
      matricula_destino: dados.matricula_destino ?? null,
      tipo_vinculo_destino: dados.tipo_vinculo_destino ?? null,
      salario_proposto: dados.salario_proposto ?? null,
      faixa_min: faixaMin,
      faixa_max: faixaMax,
      dentro_faixa: dentroFaixa,
      justificativa_excecao:
        dentroFaixa === false ? (dados.justificativa_excecao ?? null) : null,
      data_pretendida: dados.data_pretendida,
      justificativa: dados.justificativa,
    });

    // Cadeia: nível 1 líder, nível 2 diretoria. Quando quem abre JÁ É o líder
    // vigente, o nível 1 nasce aprovado por ele — pedir que aprove o próprio
    // pedido seria teatro; o registro guarda que a decisão foi dele.
    const liderVigente = await gestorVigenteDoColaborador(cliente, alvo.id);
    await inserirEtapa(cliente, {
      demanda_id: demanda.id,
      ordem: 1,
      nivel: "lider",
      usuario_esperado_id: liderVigente,
      status: souLider ? "aprovada" : "pendente",
      decisor_usuario_id: souLider ? sessao.usuario_id : null,
      motivo: souLider
        ? "Pedido aberto pelo próprio líder do colaborador"
        : null,
    });
    await inserirEtapa(cliente, {
      demanda_id: demanda.id,
      ordem: 2,
      nivel: "diretoria",
      usuario_esperado_id: null,
      status: "pendente",
      decisor_usuario_id: null,
      motivo: null,
    });

    await inserirTransicao(cliente, {
      demanda_id: demanda.id,
      de_status: null,
      para_status: "aguardando_aprovacao",
      por_usuario_id: sessao.usuario_id,
      motivo: null,
    });

    const diff: Diff = {
      "Número": { de: null, para: formatarNumeroDemanda(demanda.numero) },
      Tipo: { de: null, para: rotuloTipo },
      Colaborador: { de: null, para: alvo.nome_completo },
      [ROTULO_DESTINO[dados.tipo]]: {
        de: origem,
        para: destino,
      },
      "Data pretendida": {
        de: null,
        para: formatarData(dados.data_pretendida),
      },
      Justificativa: { de: null, para: dados.justificativa },
    };
    if (dados.tipo === "transferencia_empresa") {
      diff["Matrícula na empresa destino"] = {
        de: alvo.matricula,
        para: dados.matricula_destino ?? null,
      };
      diff["Lotação destino"] = { de: null, para: unidadeDestinoNome };
      if (dados.tipo_vinculo_destino) {
        diff["Tipo de vínculo destino"] = {
          de: null,
          para: ROTULOS_VINCULO[dados.tipo_vinculo_destino],
        };
      }
    }
    // Salário é sensível: a trilha registra QUE há proposta e o enquadramento,
    // sem repetir o valor no resumo legível (o valor mora na tabela do pedido e
    // depois em rh.posicao_colaborador, ambos atrás de rh.posicao.ver).
    if (dados.salario_proposto !== undefined) {
      diff["Salário proposto"] = {
        de: null,
        para: "informado (valor sensível)",
      };
      diff["Enquadramento"] = {
        de: null,
        para:
          dentroFaixa === null
            ? "sem faixa vigente para avaliar"
            : dentroFaixa
              ? "dentro da faixa do cargo destino"
              : "FORA da faixa — com justificativa de exceção",
      };
      if (dentroFaixa === false && dados.justificativa_excecao) {
        diff["Justificativa de exceção"] = {
          de: null,
          para: dados.justificativa_excecao,
        };
      }
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_MOVIMENTACAO,
      registroId: String(movimentacaoId),
      diff,
    });

    // Aviso neutro a quem decide agora (nunca conteúdo: o dado mora na tela).
    if (souLider) {
      await avisarDiretoria(cliente, sessao, demanda, rotuloTipo);
    } else if (liderVigente !== null && liderVigente !== sessao.usuario_id) {
      await notificar(cliente, {
        usuarioId: liderVigente,
        tipo: "movimentacao.aprovacao_pendente",
        titulo: `${rotuloTipo} aguardando sua aprovação`,
        corpo: `${sessao.nome} abriu o pedido ${formatarNumeroDemanda(demanda.numero)} para um liderado seu e aguarda sua decisão.`,
        link: `/demandas/${demanda.id}`,
      });
    }
    return demanda.id;
  });

  return cartaoAposDecisao(sessao, demandaId);
}

async function avisarDiretoria(
  cliente: PoolClient,
  sessao: PayloadSessao,
  demanda: { id: number; numero: number },
  rotuloTipo: string
): Promise<void> {
  const diretoria = await usuariosComChave(
    cliente,
    "movimentacao.aprovar.diretoria"
  );
  await notificarLote(
    cliente,
    diretoria
      .filter((usuarioId) => usuarioId !== sessao.usuario_id)
      .map((usuarioId) => ({
        usuarioId,
        tipo: "movimentacao.aprovacao_diretoria",
        titulo: `${rotuloTipo} aguardando aprovação da diretoria`,
        corpo: `O pedido ${formatarNumeroDemanda(demanda.numero)} passou pelo líder e aguarda a decisão da diretoria.`,
        link: `/demandas/${demanda.id}`,
      }))
  );
}

async function cartaoAposDecisao(
  sessao: PayloadSessao,
  demandaId: number
): Promise<CartaoMovimentacao> {
  const [demanda, movimentacao, etapas] = await Promise.all([
    buscarResumo(demandaId),
    buscarMovimentacao(demandaId),
    listarEtapas(demandaId),
  ]);
  if (!demanda || !movimentacao) {
    throw new ErroHttp(500, "Falha ao recarregar o pedido.");
  }
  const pode = await permissoesDe(sessao.usuario_id);
  return {
    demanda,
    movimentacao: await filtrarSensiveis(
      sessao,
      pode,
      movimentacao,
      demanda.solicitante_usuario_id === sessao.usuario_id,
      false
    ),
    etapas,
  };
}

export async function decidirEtapaMovimentacao(
  sessao: PayloadSessao,
  demandaId: number,
  dados: DecisaoEtapa
): Promise<CartaoMovimentacao> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await buscarParaTransicao(cliente, demandaId);
    if (!demanda) {
      throw new ErroHttp(404, "Pedido não encontrado.");
    }
    if (demanda.fluxo !== "movimentacao") {
      throw new ErroHttp(409, "Esta demanda não segue a cadeia de aprovação.");
    }
    if (demanda.status !== "aguardando_aprovacao") {
      throw new ErroHttp(409, "Este pedido já foi decidido.");
    }
    const movimentacao = await buscarMovimentacao(demandaId, cliente);
    if (!movimentacao) {
      throw new ErroHttp(500, "Pedido sem detalhe de movimentação.");
    }
    const etapa = await buscarEtapaPendente(cliente, demandaId);
    if (!etapa) {
      throw new ErroHttp(409, "Não há etapa pendente neste pedido.");
    }

    // Autorização NOMINAL por etapa: nível 1 é o líder vigente do colaborador
    // alvo (não o gestor do solicitante); nível 2 é quem tem a chave da
    // diretoria — e quem abriu o pedido NÃO decide o nível da diretoria
    // (segregação: mesma regra dos 4 olhos da folha).
    if (etapa.nivel === "lider") {
      const souLider = await ehGestorDoColaborador(
        sessao.usuario_id,
        movimentacao.colaborador_id,
        cliente
      );
      if (!souLider) {
        throw new ErroHttp(
          403,
          "Só o líder vigente do colaborador decide esta etapa."
        );
      }
    } else {
      const podeDiretoria = await temPermissao(
        sessao.usuario_id,
        "movimentacao.aprovar.diretoria"
      );
      if (!podeDiretoria) {
        throw new ErroHttp(403, "Esta etapa é da diretoria.");
      }
      if (demanda.solicitante_usuario_id === sessao.usuario_id) {
        throw new ErroHttp(
          409,
          "Quem abriu o pedido não decide o nível da diretoria."
        );
      }
    }

    const rotuloNivel = ROTULOS_NIVEL_APROVACAO[etapa.nivel];
    const rotuloTipo = ROTULOS_TIPO_MOVIMENTACAO[movimentacao.tipo];
    const motivo = dados.motivo ?? null;

    if (dados.decisao === "reprovar") {
      await decidirEtapa(cliente, etapa.id, {
        status: "reprovada",
        decisor_usuario_id: sessao.usuario_id,
        motivo,
      });
      await registrarTransicao(cliente, sessao, demanda, "recusada", motivo, {
        [`Etapa ${etapa.ordem} (${rotuloNivel})`]: {
          de: "Pendente",
          para: "Reprovada",
        },
        "Motivo da reprovação": { de: null, para: motivo },
      });
      await notificarSolicitante(
        cliente,
        sessao,
        demanda,
        "movimentacao.reprovada",
        `${rotuloTipo} reprovada`,
        `O pedido ${formatarNumeroDemanda(demanda.numero)} foi reprovado na etapa "${rotuloNivel}". Veja o motivo na página do pedido.`
      );
      return;
    }

    await decidirEtapa(cliente, etapa.id, {
      status: "aprovada",
      decisor_usuario_id: sessao.usuario_id,
      motivo,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "aprovacao_etapa",
      tabela: TABELA_ETAPA,
      registroId: String(etapa.id),
      diff: {
        Pedido: { de: null, para: formatarNumeroDemanda(demanda.numero) },
        [`Etapa ${etapa.ordem} (${rotuloNivel})`]: {
          de: "Pendente",
          para: "Aprovada",
        },
      },
    });

    const proxima = await buscarEtapaPendente(cliente, demandaId);
    if (proxima) {
      // Ainda falta nível: o pedido sobe na cadeia, sem mexer no status.
      if (proxima.nivel === "diretoria") {
        await avisarDiretoria(cliente, sessao, demanda, rotuloTipo);
      }
      await notificarSolicitante(
        cliente,
        sessao,
        demanda,
        "movimentacao.etapa_aprovada",
        `${rotuloTipo} aprovada pelo líder`,
        `O pedido ${formatarNumeroDemanda(demanda.numero)} seguiu para a aprovação da diretoria.`
      );
      return;
    }

    // ------------------------------------------------ EFEITO AUTOMÁTICO
    // Última etapa aprovada: a vida do colaborador muda AQUI, na mesma
    // transação da decisão — é o que hoje "ocorre de forma aleatória".
    await aplicarEfeito(cliente, sessao, demanda, movimentacao, rotuloTipo);
  });

  return cartaoAposDecisao(sessao, demandaId);
}

async function aplicarEfeito(
  cliente: PoolClient,
  sessao: PayloadSessao,
  demanda: DemandaParaTransicao,
  movimentacao: Movimentacao,
  rotuloTipo: string
): Promise<void> {
  const data = movimentacao.data_pretendida;
  const diffEfeito: Diff = {
    "Data de vigência": { de: null, para: formatarData(data) },
  };
  let posicaoId: number | null = null;
  let lotacaoId: number | null = null;
  let vinculoDestinoId: number | null = null;
  let resumoEvento = "";
  let payloadEvento: Record<string, unknown> = {};

  if (movimentacao.tipo === "transferencia_empresa") {
    const efeito = await aplicarTransferenciaEntreEmpresas(
      cliente,
      sessao,
      demanda,
      movimentacao,
      rotuloTipo
    );
    posicaoId = efeito.posicao_id;
    lotacaoId = efeito.lotacao_id;
    vinculoDestinoId = efeito.vinculo_destino_id;
    resumoEvento = efeito.resumo;
    payloadEvento = efeito.payload;
    Object.assign(diffEfeito, efeito.diff);
  } else if (movimentacao.tipo === "promocao") {
    const posicao = await buscarPosicaoVigenteParaAtualizar(
      cliente,
      movimentacao.colaborador_id
    );
    if (!posicao) {
      throw new ErroHttp(
        409,
        "O colaborador não tem posição vigente — o DP precisa regularizar antes."
      );
    }
    if (data <= posicao.inicio_vigencia) {
      throw new ErroHttp(
        409,
        `A data pretendida (${formatarData(data)}) precisa ser posterior ao início da posição vigente (${formatarData(posicao.inicio_vigencia)}). Abra o pedido novamente com outra data.`
      );
    }
    const cargoVersao = await cargoVersaoAtiva(
      cliente,
      movimentacao.cargo_destino_id as number
    );
    if (!cargoVersao) {
      throw new ErroHttp(
        409,
        "O cargo destino não tem versão vigente — publique o RCF antes de aprovar."
      );
    }
    // Sem salário proposto, a promoção é só de cargo: mantém a remuneração.
    const salario = movimentacao.salario_proposto ?? posicao.salario;
    await encerrarPosicao(cliente, posicao.id, data);
    posicaoId = await inserirPosicao(cliente, {
      colaborador_id: movimentacao.colaborador_id,
      cargo_versao_id: cargoVersao.id,
      salario,
      inicio_vigencia: data,
    });
    diffEfeito["Cargo"] = { de: posicao.cargo_nome, para: cargoVersao.nome };
    diffEfeito["Salário"] = {
      de: null,
      para:
        movimentacao.salario_proposto === null
          ? "mantido"
          : "alterado (valor sensível em rh.posicao_colaborador)",
    };
    resumoEvento = `${rotuloTipo}: ${posicao.cargo_nome} → ${cargoVersao.nome} (vigência ${formatarData(data)}) — aprovada na demanda ${formatarNumeroDemanda(demanda.numero)}`;
    payloadEvento = {
      demanda: demanda.numero,
      cargo_anterior: posicao.cargo_nome,
      cargo_novo: cargoVersao.nome,
      vigencia: data,
    };
  } else {
    const lotacao = await buscarLotacaoVigenteParaAtualizar(
      cliente,
      movimentacao.colaborador_id
    );
    if (!lotacao) {
      throw new ErroHttp(
        409,
        "O colaborador não tem lotação vigente — o DP precisa regularizar antes."
      );
    }
    if (data <= lotacao.inicio_vigencia) {
      throw new ErroHttp(
        409,
        `A data pretendida (${formatarData(data)}) precisa ser posterior ao início da lotação vigente (${formatarData(lotacao.inicio_vigencia)}). Abra o pedido novamente com outra data.`
      );
    }
    const estabelecimento = await estabelecimentoAtivo(
      cliente,
      movimentacao.estabelecimento_destino_id as number
    );
    if (!estabelecimento) {
      throw new ErroHttp(409, "A unidade destino não tem versão vigente.");
    }
    // Sem CC informado, herda o da alocação vigente. Desde a 0047 o centro de
    // custo é id de catálogo, não texto: a dívida registrada na 0021
    // ("texto livre conferido só na aplicação") está paga.
    const centroCustoId =
      movimentacao.centro_custo_destino_id ?? lotacao.centro_custo_id;
    const centroCusto =
      movimentacao.centro_custo_destino ?? lotacao.centro_custo;
    // A EMPRESA não muda numa transferência de unidade: trocar de CNPJ é
    // desligamento + nova admissão, e nesse caso o vínculo é outro (0046).
    await encerrarLotacao(cliente, lotacao.id, data);
    lotacaoId = await inserirLotacao(cliente, {
      colaborador_id: movimentacao.colaborador_id,
      empresa_id: lotacao.empresa_id,
      estabelecimento_id: estabelecimento.id,
      centro_custo_id: centroCustoId,
      inicio_vigencia: data,
    });
    diffEfeito["Unidade"] = {
      de: lotacao.unidade,
      para: estabelecimento.unidade,
    };
    diffEfeito["Centro de custo"] = {
      de: lotacao.centro_custo,
      para: centroCusto,
    };
    resumoEvento = `${rotuloTipo}: ${lotacao.unidade ?? "unidade anterior"} → ${estabelecimento.unidade} (vigência ${formatarData(data)}) — aprovada na demanda ${formatarNumeroDemanda(demanda.numero)}`;
    payloadEvento = {
      demanda: demanda.numero,
      unidade_anterior: lotacao.unidade,
      unidade_nova: estabelecimento.unidade,
      centro_custo: centroCusto,
      vigencia: data,
    };
  }

  await marcarMovimentacaoAplicada(cliente, movimentacao.id, {
    posicao_id: posicaoId,
    lotacao_id: lotacaoId,
    vinculo_destino_id: vinculoDestinoId,
  });

  // A demanda entra na fila do DP: a decisão está tomada, os TRÂMITES não.
  await registrarTransicao(cliente, sessao, demanda, "aberta", null, {
    "Aprovação final": { de: null, para: "Diretoria" },
    ...diffEfeito,
  });

  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "efeito_movimentacao",
    tabela: TABELA_MOVIMENTACAO,
    registroId: String(movimentacao.id),
    diff: {
      Colaborador: { de: null, para: movimentacao.colaborador_nome },
      Pedido: { de: null, para: formatarNumeroDemanda(demanda.numero) },
      ...diffEfeito,
    },
  });

  // Linha do tempo do colaborador — resumo SEM salário no texto.
  // Na transferência entre empresas este evento cai no vínculo que FECHA (a
  // saída da empresa de origem); o evento de entrada no vínculo que abre foi
  // gravado dentro de aplicarTransferenciaEntreEmpresas, no vínculo dele. Os
  // dois aparecem juntos na ficha, porque rh.evento_da_pessoa (0046)
  // atravessa os contratos da mesma pessoa.
  await inserirEvento(cliente, {
    colaborador_id: movimentacao.colaborador_id,
    tipo: TIPO_EVENTO_MOVIMENTACAO[movimentacao.tipo],
    ocorrido_em: new Date().toISOString(),
    origem_tabela: TABELA_MOVIMENTACAO,
    origem_id: movimentacao.id,
    resumo: resumoEvento,
    payload: payloadEvento,
    registrado_por: sessao.usuario_id,
  });

  // CIÊNCIA AUTOMÁTICA — a dor central do feedback. DP e T&D (chave
  // movimentacao.ciencia) mais o próprio colaborador e o solicitante.
  const ciencia = await usuariosComChave(cliente, "movimentacao.ciencia");
  const destinatarios = new Set<number>(ciencia);
  if (movimentacao.colaborador_usuario_id !== null) {
    destinatarios.delete(movimentacao.colaborador_usuario_id);
  }
  destinatarios.delete(sessao.usuario_id);
  await notificarLote(
    cliente,
    [...destinatarios].map((usuarioId) => ({
      usuarioId,
      tipo: "movimentacao.aprovada",
      titulo: `${rotuloTipo} aprovada — providenciar trâmites`,
      corpo: `${movimentacao.colaborador_nome}: pedido ${formatarNumeroDemanda(demanda.numero)} aprovado pela diretoria, com vigência em ${formatarData(data)}.`,
      link: `/demandas/${demanda.id}`,
    }))
  );
  if (
    movimentacao.colaborador_usuario_id !== null &&
    movimentacao.colaborador_usuario_id !== sessao.usuario_id
  ) {
    await notificar(cliente, {
      usuarioId: movimentacao.colaborador_usuario_id,
      tipo: "movimentacao.aprovada",
      titulo: `Sua ${rotuloTipo.toLowerCase()} foi aprovada`,
      corpo: `A decisão está registrada no pedido ${formatarNumeroDemanda(demanda.numero)}, com vigência em ${formatarData(data)}.`,
      link: `/demandas/${demanda.id}`,
    });
  }
  await notificarSolicitante(
    cliente,
    sessao,
    demanda,
    "movimentacao.aprovada",
    `${rotuloTipo} aprovada pela diretoria`,
    `O pedido ${formatarNumeroDemanda(demanda.numero)} foi aprovado; o DP e o T&D já foram avisados dos trâmites.`
  );
}

// ================================================================ TRANSFERÊNCIA ENTRE EMPRESAS
// "ele demite e recontrata na outra empresa, mas não queria perder os dados e
// histórico" — o caso que motivou a onda. Aqui a demissão e a recontratação
// viram UM ato, dentro da transação que aprova o pedido.
//
// O QUE ACONTECE, na ordem, e por quê:
//   1. encerra a POSIÇÃO e a ALOCAÇÃO do vínculo velho na véspera;
//   2. encerra a LIDERANÇA nos dois sentidos (o líder dele e os liderados dele);
//   3. liquida o BANCO DE HORAS pela regra vigente — a mesma função que o
//      desligamento chama, sem tratamento inventado para o caso;
//   4. marca o vínculo velho como desligado, com data;
//   5. abre o VÍNCULO NOVO com a MESMA pessoa_id — mesmo CPF, mesma conta;
//   6. recria posição (cargo e salário congelados), alocação (o trio da 0047)
//      e liderança no vínculo novo;
//   7. copia os DEPENDENTES com rastro;
//   8. liga um vínculo ao outro (sucede_vinculo_id) e grava os dois eventos.
//
// O que NÃO acontece aqui, de propósito, e está argumentado no cabeçalho da
// migration 0048: não se abre processo de desligamento (rito de saída não
// cabe em quem continua na casa), não se copia evento, avaliação, ocorrência,
// documento nem ASO, e o período aquisitivo de férias recomeça no contrato
// novo. A leitura dessas coisas atravessa pela PESSOA, não por cópia.

interface EfeitoTransferencia {
  posicao_id: number;
  lotacao_id: number;
  vinculo_destino_id: number;
  resumo: string;
  payload: Record<string, unknown>;
  diff: Diff;
}

async function aplicarTransferenciaEntreEmpresas(
  cliente: PoolClient,
  sessao: PayloadSessao,
  demanda: DemandaParaTransicao,
  movimentacao: Movimentacao,
  rotuloTipo: string
): Promise<EfeitoTransferencia> {
  const data = movimentacao.data_pretendida;
  const origemId = movimentacao.colaborador_id;

  const vinculo = await buscarVinculoParaTransferir(cliente, origemId);
  if (!vinculo) {
    throw new ErroHttp(500, "Vínculo de origem sumiu no meio da aprovação.");
  }
  if (vinculo.status === "desligado") {
    throw new ErroHttp(
      409,
      "O vínculo de origem já está desligado — a transferência não tem o que encerrar."
    );
  }
  if (vinculo.ja_sucedido) {
    throw new ErroHttp(
      409,
      "Este vínculo já foi transferido para outra empresa do grupo."
    );
  }
  const posicao = await buscarPosicaoVigenteParaAtualizar(cliente, origemId);
  if (!posicao) {
    throw new ErroHttp(
      409,
      "O colaborador não tem posição vigente — o DP precisa regularizar antes."
    );
  }
  const lotacao = await buscarLotacaoVigenteParaAtualizar(cliente, origemId);
  if (!lotacao) {
    throw new ErroHttp(
      409,
      "O colaborador não tem alocação vigente — o DP precisa regularizar antes."
    );
  }
  // Mesma trava dos outros dois tipos: nada retroativo. Uma transferência com
  // data anterior ao início da posição ou da alocação vigente reabriria mês de
  // folha fechado — e a folha fechada é imutável por trigger desde a 0047.
  if (data <= posicao.inicio_vigencia || data <= lotacao.inicio_vigencia) {
    const limite =
      posicao.inicio_vigencia > lotacao.inicio_vigencia
        ? posicao.inicio_vigencia
        : lotacao.inicio_vigencia;
    throw new ErroHttp(
      409,
      `A data pretendida (${formatarData(data)}) precisa ser posterior ao início da posição/alocação vigente (${formatarData(limite)}). Abra o pedido novamente com outra data.`
    );
  }
  if (data <= vinculo.data_admissao) {
    throw new ErroHttp(
      409,
      `A data pretendida (${formatarData(data)}) precisa ser posterior à admissão do vínculo atual (${formatarData(vinculo.data_admissao)}).`
    );
  }

  const empresa = await empresaAtiva(
    cliente,
    movimentacao.empresa_destino_id as number
  );
  if (!empresa) {
    throw new ErroHttp(
      409,
      "A empresa destino foi inativada depois da abertura do pedido."
    );
  }
  const estabelecimento = await estabelecimentoAtivo(
    cliente,
    movimentacao.estabelecimento_destino_id as number
  );
  if (!estabelecimento) {
    throw new ErroHttp(409, "A lotação destino não tem versão vigente.");
  }
  const centro = await centroCustoAtivo(
    cliente,
    movimentacao.centro_custo_destino_id as number
  );
  if (!centro) {
    throw new ErroHttp(
      409,
      "O centro de custo destino foi inativado depois da abertura do pedido."
    );
  }
  const matricula = movimentacao.matricula_destino as string;
  if (await matriculaEmUso(cliente, matricula)) {
    throw new ErroHttp(
      409,
      `A matrícula ${matricula} foi ocupada por outro cadastro desde a abertura do pedido. Abra o pedido novamente com outra matrícula.`
    );
  }

  // ---------------------------------------------------------- 1 e 2: fecha o velho
  await encerrarPosicao(cliente, posicao.id, data);
  await encerrarLotacao(cliente, lotacao.id, data);

  const relacaoLider = await buscarRelacaoGestorVigenteParaAtualizar(
    cliente,
    origemId
  );
  if (relacaoLider) {
    await encerrarRelacaoGestor(cliente, relacaoLider.id, data);
  }
  // A equipe DELE, quando ele é líder: sem isso o organograma perderia os
  // liderados no dia da transferência (o vínculo velho fica desligado, e a
  // consulta do organograma só enxerga quem não está desligado).
  const liderados = await listarLiderados(cliente, origemId);
  for (const relacao of liderados) {
    await encerrarRelacaoGestor(cliente, relacao.relacao_id, data);
  }

  // ---------------------------------------------------------- 3: banco de horas
  // Item (h) da 0048: saldo de banco é dívida de UM CNPJ. Liquida pela regra
  // vigente, exatamente como `encerrarProcessoDesligamento` faz — nenhuma
  // regra nova foi inventada para o caso da transferência.
  const acertoBanco = await liquidarBancoNaRescisao(
    cliente,
    sessao.usuario_id,
    origemId,
    data
  );

  // ---------------------------------------------------------- 4: desliga o velho
  await atualizarColaborador(cliente, origemId, {
    status: "desligado",
    data_desligamento: data,
  });

  // ---------------------------------------------------------- 5: abre o novo
  // pessoa_id IGUAL: é a linha que faz "a pessoa é a mesma". O trigger de
  // projeção da 0046 preenche sozinho CPF, nome, nascimento, gênero, retrato,
  // contexto e a conta de acesso — não há nada a copiar, e por isso não há
  // como divergir.
  const tipoVinculoNovo = movimentacao.tipo_vinculo_destino ?? vinculo.tipo_vinculo;
  const novo = await criarVinculo(cliente, {
    pessoa_id: vinculo.pessoa_id,
    matricula,
    matricula_esocial: matricula,
    tipo_vinculo: tipoVinculoNovo,
    data_admissao: data,
  });

  // ---------------------------------------------------------- 6: posição, alocação, liderança
  const posicaoId = await inserirPosicao(cliente, {
    colaborador_id: novo.id,
    cargo_versao_id: posicao.cargo_versao_id,
    salario: posicao.salario,
    inicio_vigencia: data,
  });
  const lotacaoId = await inserirLotacao(cliente, {
    colaborador_id: novo.id,
    empresa_id: empresa.id,
    estabelecimento_id: estabelecimento.id,
    centro_custo_id: centro.id,
    inicio_vigencia: data,
  });
  if (relacaoLider) {
    await inserirRelacaoGestor(cliente, {
      gestor_colaborador_id: relacaoLider.gestor_colaborador_id,
      liderado_colaborador_id: novo.id,
      inicio_vigencia: data,
    });
  }
  for (const relacao of liderados) {
    await inserirRelacaoGestor(cliente, {
      gestor_colaborador_id: novo.id,
      liderado_colaborador_id: relacao.liderado_id,
      inicio_vigencia: data,
    });
  }

  // ---------------------------------------------------------- 7: dependentes
  const dependentesCopiados = await copiarDependentes(cliente, origemId, novo.id);

  // ---------------------------------------------------------- 8: o elo e os eventos
  await ligarSucessao(cliente, novo.id, origemId);

  const empresaOrigem = lotacao.empresa_nome ?? "empresa anterior";
  const payloadComum = {
    demanda: demanda.numero,
    empresa_anterior: empresaOrigem,
    empresa_nova: empresa.nome_fantasia,
    vinculo_anterior_id: origemId,
    vinculo_anterior_matricula: vinculo.matricula,
    vinculo_novo_id: novo.id,
    vinculo_novo_matricula: matricula,
    vigencia: data,
  };

  // Evento no vínculo que ABRE. O do vínculo que fecha é gravado por
  // aplicarEfeito, com `resumo`/`payload` devolvidos aqui.
  await inserirEvento(cliente, {
    colaborador_id: novo.id,
    tipo: "admissao_por_transferencia",
    ocorrido_em: `${data}T00:00:00Z`,
    origem_tabela: TABELA_MOVIMENTACAO,
    origem_id: movimentacao.id,
    resumo:
      `Admissão em ${empresa.nome_fantasia} por transferência entre empresas do grupo` +
      ` (vinha de ${empresaOrigem}, matrícula ${vinculo.matricula}) em ${formatarData(data)}` +
      ` — aprovada na demanda ${formatarNumeroDemanda(demanda.numero)}.` +
      ` Cargo e remuneração mantidos; período aquisitivo de férias recomeça neste contrato.`,
    payload: { ...payloadComum, dependentes_copiados: dependentesCopiados },
    registrado_por: sessao.usuario_id,
  });

  const diff: Diff = {
    "Registro (empresa)": {
      de: empresaOrigem,
      para: empresa.nome_fantasia,
    },
    "Vínculo encerrado": {
      de: null,
      para: `matrícula ${vinculo.matricula} (${empresaOrigem}), desligado em ${formatarData(data)}`,
    },
    "Vínculo aberto": {
      de: null,
      para: `matrícula ${matricula} (${empresa.nome_fantasia}), admitido em ${formatarData(data)}`,
    },
    Pessoa: {
      de: null,
      para: `a mesma (pessoa ${vinculo.pessoa_id}) — CPF, conta de acesso e histórico preservados`,
    },
    "Lotação": { de: lotacao.unidade, para: estabelecimento.unidade },
    "Centro de custo": { de: lotacao.centro_custo, para: centro.codigo },
    Cargo: { de: posicao.cargo_nome, para: `${posicao.cargo_nome} (mantido)` },
    "Salário": { de: null, para: "mantido (transferência não altera remuneração)" },
    "Banco de horas": { de: null, para: acertoBanco.resumo },
    "Férias (período aquisitivo)": {
      de: null,
      para:
        "recomeça no vínculo novo; os períodos abertos ficam no vínculo encerrado, para o acerto",
    },
    Dependentes: {
      de: null,
      para:
        dependentesCopiados === 0
          ? "nenhum a copiar"
          : `${dependentesCopiados} copiado(s) para o vínculo novo, com rastro`,
    },
    "Liderança": {
      de: null,
      para:
        (relacaoLider
          ? `líder ${relacaoLider.gestor_nome} mantido`
          : "sem líder vigente") +
        (liderados.length > 0
          ? `; ${liderados.length} liderado(s) remanejado(s) para o vínculo novo`
          : ""),
    },
  };

  return {
    posicao_id: posicaoId,
    lotacao_id: lotacaoId,
    vinculo_destino_id: novo.id,
    resumo:
      `${rotuloTipo}: ${empresaOrigem} → ${empresa.nome_fantasia} (vigência ${formatarData(data)})` +
      ` — vínculo encerrado aqui e reaberto na matrícula ${matricula}.` +
      ` Aprovada na demanda ${formatarNumeroDemanda(demanda.numero)}.` +
      ` Banco de horas: ${acertoBanco.resumo}.`,
    payload: { ...payloadComum, banco_horas: acertoBanco.resumo },
    diff,
  };
}

// ------------------------------------------------------------------ pendências
// Evolução registrada (critério: entregar o núcleo que resolve a dor):
//  - cadeia fixa em dois níveis (ver 0021); parametrizar por faixa de valor
//    exigiria catálogo de etapas versionado;
//  - a reprovação encerra o pedido (não há "devolver para ajuste"): o líder
//    abre outro com a correção — o histórico guarda os dois;
//  - promoção que muda o líder direto não altera rh.relacao_gestor (ato de DP).
