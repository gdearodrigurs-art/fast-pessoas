import { PoolClient } from "pg";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp, lerSessao } from "../../lib/sessao";
import {
  ROTULOS_VINCULO,
  StatusColaborador,
} from "../colaboradores/esquemas";
import {
  inserirEvento,
  registrarLeituraSensivel,
  temPermissao,
} from "../colaboradores/repositorio";
import {
  formatarNumeroDemanda,
  ROTULOS_STATUS_DEMANDA,
  StatusDemanda,
} from "../demandas/esquemas";
import {
  atualizarStatus as atualizarStatusDemanda,
  buscarTipoAtivo,
  criar as criarDemandaNoBanco,
  inserirComentario,
  inserirTransicao,
} from "../demandas/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  atendeCriterio,
  AtualizacaoBeneficio,
  AtualizacaoDependente,
  CancelamentoAdesao,
  CHAVE_TIPO_DEMANDA_BENEFICIO,
  CriacaoBeneficio,
  CriacaoDependente,
  descreverCriterio,
  EfetivacaoAdesao,
  formatarMoeda,
  interpretarDescricaoSolicitacao,
  montarDescricaoSolicitacao,
  NaturezaSolicitacao,
  NovaRegra,
  ROTULOS_CATEGORIA,
  ROTULOS_STATUS_ADESAO,
  SolicitacaoAdesao,
} from "./esquemas";
import {
  AdesaoResumo,
  atualizarStatusAdesao,
  BeneficioComRegra,
  buscarAdesaoParaAtualizar,
  buscarAdesaoResumo,
  buscarBeneficio,
  buscarBeneficioParaAtualizar,
  buscarDemandaBeneficioParaTransicao,
  buscarDependenteParaAtualizar,
  buscarRegraAtivaParaAtualizar,
  cancelarAdesaoNoBanco,
  ColaboradorOpcao,
  contarEstabelecimentos,
  DemandaBeneficio,
  Dependente,
  encerrarRegra,
  excluirDependente,
  existeSolicitacaoPendente,
  inserirAdesao,
  inserirBeneficio,
  inserirDependente,
  inserirRegra,
  listarAdesoesDoColaborador,
  listarAdesoesVigentes,
  listarBeneficios,
  listarColaboradoresAtivos,
  listarDependentes,
  listarRegras,
  listarSolicitacoesDoUsuario,
  listarSolicitacoesPendentes,
  listarUnidades,
  PerfilBeneficios,
  perfilPorColaborador,
  perfilPorUsuario,
  RegraVersao,
  SolicitacaoBeneficio,
  temAdesaoVigente,
  UnidadeOpcao,
  atualizarBeneficio as atualizarBeneficioNoBanco,
  atualizarDependente as atualizarDependenteNoBanco,
} from "./repositorio";

const TABELA_BENEFICIO = "rh.beneficio";
const TABELA_REGRA = "rh.regra_elegibilidade_versao";
const TABELA_ADESAO = "rh.adesao";
const TABELA_DEPENDENTE = "rh.dependente";
const TABELA_DEMANDA = "rh.demanda";

const PREFIXO_ADESAO = "Adesão ao benefício";
const PREFIXO_CANCELAMENTO = "Cancelamento do benefício";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ------------------------------------------------------------------ guarda de acesso multi-chave

export interface PermissoesBeneficios {
  solicitar: boolean;
  gerir: boolean;
  administrar: boolean;
  ver: boolean;
}

async function permissoesDe(usuarioId: number): Promise<PermissoesBeneficios> {
  const [solicitar, gerir, administrar, ver] = await Promise.all([
    temPermissao(usuarioId, "adesao.solicitar"),
    temPermissao(usuarioId, "adesao.gerir"),
    temPermissao(usuarioId, "beneficio.administrar"),
    temPermissao(usuarioId, "beneficio.ver"),
  ]);
  return { solicitar, gerir, administrar, ver };
}

/**
 * Sessão válida + ao menos uma das chaves do módulo. Espelha exigirPermissao,
 * mas devolve o conjunto inteiro (a visão muda conforme as chaves).
 */
export async function exigirAcessoBeneficios(): Promise<{
  sessao: PayloadSessao;
  pode: PermissoesBeneficios;
}> {
  const sessao = await lerSessao();
  if (!sessao) {
    throw new ErroHttp(401, "Não autenticado");
  }
  const pode = await permissoesDe(sessao.usuario_id);
  if (!pode.solicitar && !pode.gerir && !pode.administrar && !pode.ver) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  return { sessao, pode };
}

// ------------------------------------------------------------------ visão da página

export interface ItemCatalogo {
  beneficio_id: number;
  chave: string;
  nome: string;
  categoria: string;
  categoria_rotulo: string;
  valor_padrao: number | null;
  desconto_padrao: number | null;
  ja_aderido: boolean;
  solicitacao_pendente: boolean;
}

export interface SolicitacaoInterpretada extends SolicitacaoBeneficio {
  natureza: NaturezaSolicitacao | null;
  beneficio_id: number | null;
  beneficio_nome: string | null;
  /** Adesão vigente do solicitante no benefício (alvo de um cancelamento). */
  adesao_id: number | null;
}

export interface VisaoBeneficios {
  pode: PermissoesBeneficios;
  perfil: {
    colaborador_id: number;
    nome_completo: string;
    matricula: string;
    tipo_vinculo: string;
    unidade: string | null;
    status: StatusColaborador;
  } | null;
  catalogo: ItemCatalogo[];
  minhas_adesoes: AdesaoResumo[];
  minhas_solicitacoes: SolicitacaoInterpretada[];
  meus_dependentes: Dependente[];
  gestao: {
    solicitacoes_pendentes: SolicitacaoInterpretada[];
    adesoes: AdesaoResumo[];
    colaboradores: ColaboradorOpcao[];
    beneficios: BeneficioComRegra[];
  } | null;
  administracao: {
    beneficios: BeneficioComRegra[];
    unidades: UnidadeOpcao[];
  } | null;
}

function interpretarSolicitacoes(
  solicitacoes: SolicitacaoBeneficio[],
  beneficios: BeneficioComRegra[],
  adesoesVigentes: AdesaoResumo[]
): SolicitacaoInterpretada[] {
  const porChave = new Map(beneficios.map((item) => [item.chave, item]));
  return solicitacoes.map((solicitacao) => {
    const lido = interpretarDescricaoSolicitacao(solicitacao.descricao);
    const beneficio = lido ? (porChave.get(lido.chave) ?? null) : null;
    const adesao =
      lido?.natureza === "cancelamento" &&
      beneficio &&
      solicitacao.solicitante_colaborador_id !== null
        ? (adesoesVigentes.find(
            (item) =>
              item.colaborador_id === solicitacao.solicitante_colaborador_id &&
              item.beneficio_id === beneficio.id
          ) ?? null)
        : null;
    return {
      ...solicitacao,
      natureza: lido?.natureza ?? null,
      beneficio_id: beneficio?.id ?? null,
      beneficio_nome: beneficio?.nome ?? null,
      adesao_id: adesao?.id ?? null,
    };
  });
}

const STATUS_DEMANDA_ATIVOS: readonly StatusDemanda[] = [
  "aguardando_aprovacao",
  "aberta",
  "em_atendimento",
];

export async function montarVisao(
  sessao: PayloadSessao,
  pode: PermissoesBeneficios
): Promise<VisaoBeneficios> {
  const [todosBeneficios, perfil] = await Promise.all([
    listarBeneficios(false),
    perfilPorUsuario(sessao.usuario_id),
  ]);
  const ativosComRegra = todosBeneficios.filter(
    (item) => item.ativo && item.regra !== null
  );

  let catalogo: ItemCatalogo[] = [];
  let minhasAdesoes: AdesaoResumo[] = [];
  let minhasSolicitacoes: SolicitacaoInterpretada[] = [];
  let meusDependentes: Dependente[] = [];

  if (pode.solicitar && perfil) {
    const [adesoes, solicitacoes, dependentes] = await Promise.all([
      listarAdesoesDoColaborador(perfil.colaborador_id),
      listarSolicitacoesDoUsuario(sessao.usuario_id),
      listarDependentes(perfil.colaborador_id),
    ]);
    minhasAdesoes = adesoes;
    meusDependentes = dependentes;
    const vigentes = adesoes.filter((item) => item.fim === null);
    minhasSolicitacoes = interpretarSolicitacoes(
      solicitacoes,
      todosBeneficios,
      vigentes
    );
    const pendentesAdesao = new Set(
      minhasSolicitacoes
        .filter(
          (item) =>
            item.natureza === "adesao" &&
            STATUS_DEMANDA_ATIVOS.includes(item.status)
        )
        .map((item) => item.beneficio_id)
    );
    catalogo = ativosComRegra
      .filter((item) =>
        atendeCriterio(item.regra?.criterio ?? {}, {
          tipo_vinculo: perfil.tipo_vinculo,
          estabelecimento_id: perfil.estabelecimento_id,
        })
      )
      .map((item) => ({
        beneficio_id: item.id,
        chave: item.chave,
        nome: item.nome,
        categoria: item.categoria,
        categoria_rotulo: ROTULOS_CATEGORIA[item.categoria],
        valor_padrao: item.regra?.valor_padrao ?? null,
        desconto_padrao: item.regra?.desconto_padrao ?? null,
        ja_aderido: vigentes.some((adesao) => adesao.beneficio_id === item.id),
        solicitacao_pendente: pendentesAdesao.has(item.id),
      }));
  }

  let gestao: VisaoBeneficios["gestao"] = null;
  if (pode.gerir || pode.ver) {
    const [pendentes, adesoes, colaboradores] = await Promise.all([
      listarSolicitacoesPendentes(),
      listarAdesoesVigentes(),
      pode.gerir ? listarColaboradoresAtivos() : Promise.resolve([]),
    ]);
    gestao = {
      solicitacoes_pendentes: interpretarSolicitacoes(
        pendentes,
        todosBeneficios,
        adesoes
      ),
      adesoes,
      colaboradores,
      beneficios: ativosComRegra,
    };
  }

  let administracao: VisaoBeneficios["administracao"] = null;
  if (pode.administrar) {
    administracao = {
      beneficios: todosBeneficios,
      unidades: await listarUnidades(),
    };
  }

  return {
    pode,
    perfil: perfil
      ? {
          colaborador_id: perfil.colaborador_id,
          nome_completo: perfil.nome_completo,
          matricula: perfil.matricula,
          tipo_vinculo: ROTULOS_VINCULO[perfil.tipo_vinculo],
          unidade: perfil.unidade,
          status: perfil.status,
        }
      : null,
    catalogo,
    minhas_adesoes: minhasAdesoes,
    minhas_solicitacoes: minhasSolicitacoes,
    meus_dependentes: meusDependentes,
    gestao,
    administracao,
  };
}

// ------------------------------------------------------------------ catálogo (beneficio.administrar)

export async function criarBeneficio(
  sessao: PayloadSessao,
  dados: CriacaoBeneficio
): Promise<BeneficioComRegra> {
  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    let beneficioId: number;
    try {
      beneficioId = await inserirBeneficio(cliente, dados);
    } catch (erro) {
      if (violacaoUnica(erro)) {
        throw new ErroHttpCampo(
          409,
          "Já existe benefício com esta chave.",
          "chave"
        );
      }
      throw erro;
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_BENEFICIO,
      registroId: String(beneficioId),
      diff: {
        Chave: { de: null, para: dados.chave },
        Nome: { de: null, para: dados.nome },
        Categoria: { de: null, para: ROTULOS_CATEGORIA[dados.categoria] },
      },
    });
    return beneficioId;
  });
  const criado = await buscarBeneficio(id);
  if (!criado) {
    throw new ErroHttp(500, "Falha ao carregar o benefício criado.");
  }
  return criado;
}

export async function atualizarBeneficio(
  sessao: PayloadSessao,
  id: number,
  dados: AtualizacaoBeneficio
): Promise<BeneficioComRegra> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await buscarBeneficioParaAtualizar(cliente, id);
    if (!atual) {
      throw new ErroHttp(404, "Benefício não encontrado.");
    }
    const diff: Diff = {};
    if (dados.nome !== undefined && dados.nome !== atual.nome) {
      diff["Nome"] = { de: atual.nome, para: dados.nome };
    }
    if (dados.categoria !== undefined && dados.categoria !== atual.categoria) {
      diff["Categoria"] = {
        de: ROTULOS_CATEGORIA[atual.categoria],
        para: ROTULOS_CATEGORIA[dados.categoria],
      };
    }
    if (dados.ativo !== undefined && dados.ativo !== atual.ativo) {
      diff["Ativo"] = {
        de: atual.ativo ? "Sim" : "Não",
        para: dados.ativo ? "Sim" : "Não",
      };
    }
    if (Object.keys(diff).length === 0) return;
    await atualizarBeneficioNoBanco(cliente, id, dados);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_BENEFICIO,
      registroId: String(id),
      diff,
    });
  });
  const atualizado = await buscarBeneficio(id);
  if (!atualizado) {
    throw new ErroHttp(500, "Falha ao recarregar o benefício.");
  }
  return atualizado;
}

export async function listarVersoesRegra(
  beneficioId: number
): Promise<{ beneficio: BeneficioComRegra; versoes: RegraVersao[] }> {
  const beneficio = await buscarBeneficio(beneficioId);
  if (!beneficio) {
    throw new ErroHttp(404, "Benefício não encontrado.");
  }
  const versoes = await listarRegras(beneficioId);
  return { beneficio, versoes };
}

export async function criarVersaoRegra(
  sessao: PayloadSessao,
  beneficioId: number,
  dados: NovaRegra
): Promise<BeneficioComRegra> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const beneficio = await buscarBeneficioParaAtualizar(cliente, beneficioId);
    if (!beneficio) {
      throw new ErroHttp(404, "Benefício não encontrado.");
    }
    const unidades = dados.criterio.unidades ?? [];
    if (unidades.length > 0) {
      const existentes = await contarEstabelecimentos(cliente, unidades);
      if (existentes !== new Set(unidades).size) {
        throw new ErroHttpCampo(
          400,
          "Há unidade inexistente no critério.",
          "criterio"
        );
      }
    }
    const anterior = await buscarRegraAtivaParaAtualizar(cliente, beneficioId);
    if (anterior && dados.inicio_vigencia <= anterior.inicio_vigencia) {
      throw new ErroHttpCampo(
        400,
        "O início da nova versão deve ser posterior ao início da versão vigente.",
        "inicio_vigencia"
      );
    }
    if (anterior) {
      await encerrarRegra(cliente, anterior.id, dados.inicio_vigencia);
    }
    const nomesUnidades = new Map(
      (await listarUnidades()).map((item) => [
        item.id,
        item.unidade ?? `#${item.id}`,
      ])
    );
    const regraId = await inserirRegra(cliente, {
      beneficio_id: beneficioId,
      criterio: dados.criterio,
      valor_padrao: dados.valor_padrao ?? null,
      desconto_padrao: dados.desconto_padrao ?? null,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "nova_versao",
      tabela: TABELA_REGRA,
      registroId: String(regraId),
      diff: {
        "Benefício": { de: null, para: `${beneficio.nome} (${beneficio.chave})` },
        "Critério": {
          de: null,
          para: descreverCriterio(dados.criterio, ROTULOS_VINCULO, nomesUnidades),
        },
        "Valor padrão": { de: null, para: formatarMoeda(dados.valor_padrao ?? null) },
        "Desconto padrão": {
          de: null,
          para: formatarMoeda(dados.desconto_padrao ?? null),
        },
        "Início de vigência": { de: null, para: dados.inicio_vigencia },
      },
    });
  });
  const atualizado = await buscarBeneficio(beneficioId);
  if (!atualizado) {
    throw new ErroHttp(500, "Falha ao recarregar o benefício.");
  }
  return atualizado;
}

// ------------------------------------------------------------------ solicitação do colaborador (via demanda)

function exigirPerfilAtivo(perfil: PerfilBeneficios | null): PerfilBeneficios {
  if (!perfil) {
    throw new ErroHttp(
      400,
      "Sua conta não tem ficha de colaborador — procure o DP."
    );
  }
  if (perfil.status === "desligado") {
    throw new ErroHttp(409, "Colaborador desligado não solicita benefício.");
  }
  return perfil;
}

async function abrirDemandaBeneficio(
  sessao: PayloadSessao,
  colaboradorId: number,
  descricao: string
): Promise<SolicitacaoBeneficio> {
  const tipo = await buscarTipoAtivo(CHAVE_TIPO_DEMANDA_BENEFICIO);
  if (!tipo) {
    throw new ErroHttp(
      500,
      "Tipo de demanda de benefício não configurado no sistema."
    );
  }
  const statusInicial: StatusDemanda = tipo.exige_aprovacao_gestor
    ? "aguardando_aprovacao"
    : "aberta";
  const criada = await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await criarDemandaNoBanco(cliente, {
      tipo_demanda_versao_id: tipo.id,
      solicitante_usuario_id: sessao.usuario_id,
      solicitante_colaborador_id: colaboradorId,
      descricao,
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
        "Descrição": { de: null, para: descricao },
        Status: { de: null, para: ROTULOS_STATUS_DEMANDA[statusInicial] },
        Prazo: { de: null, para: formatarData(demanda.prazo) },
      },
    });
    return demanda;
  });
  const solicitacoes = await listarSolicitacoesDoUsuario(sessao.usuario_id);
  const resumo = solicitacoes.find((item) => item.demanda_id === criada.id);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao carregar a solicitação criada.");
  }
  return resumo;
}

export async function solicitarAdesao(
  sessao: PayloadSessao,
  dados: SolicitacaoAdesao
): Promise<SolicitacaoBeneficio> {
  const perfil = exigirPerfilAtivo(await perfilPorUsuario(sessao.usuario_id));
  const beneficio = await buscarBeneficio(dados.beneficio_id);
  if (!beneficio || !beneficio.ativo) {
    throw new ErroHttpCampo(404, "Benefício não encontrado.", "beneficio_id");
  }
  if (!beneficio.regra) {
    throw new ErroHttpCampo(
      409,
      "Benefício sem regra de elegibilidade vigente — procure o DP.",
      "beneficio_id"
    );
  }
  if (
    !atendeCriterio(beneficio.regra.criterio, {
      tipo_vinculo: perfil.tipo_vinculo,
      estabelecimento_id: perfil.estabelecimento_id,
    })
  ) {
    throw new ErroHttpCampo(
      403,
      "Você não é elegível a este benefício pela regra vigente.",
      "beneficio_id"
    );
  }
  if (await temAdesaoVigente(perfil.colaborador_id, beneficio.id)) {
    throw new ErroHttpCampo(
      409,
      "Você já tem adesão vigente a este benefício.",
      "beneficio_id"
    );
  }
  if (
    await existeSolicitacaoPendente(
      sessao.usuario_id,
      PREFIXO_ADESAO,
      beneficio.chave
    )
  ) {
    throw new ErroHttpCampo(
      409,
      "Você já tem solicitação de adesão em andamento para este benefício.",
      "beneficio_id"
    );
  }
  const descricao = montarDescricaoSolicitacao(
    "adesao",
    beneficio.nome,
    beneficio.chave,
    dados.observacao
  );
  return abrirDemandaBeneficio(sessao, perfil.colaborador_id, descricao);
}

export async function solicitarCancelamento(
  sessao: PayloadSessao,
  adesaoId: number,
  motivo: string
): Promise<SolicitacaoBeneficio> {
  const perfil = exigirPerfilAtivo(await perfilPorUsuario(sessao.usuario_id));
  const adesao = await buscarAdesaoResumo(adesaoId);
  if (!adesao || adesao.colaborador_id !== perfil.colaborador_id) {
    // Ausência, não máscara: adesão de outra pessoa não existe para quem pede.
    throw new ErroHttp(404, "Adesão não encontrada.");
  }
  if (adesao.fim !== null) {
    throw new ErroHttp(409, "Esta adesão já está encerrada.");
  }
  if (
    await existeSolicitacaoPendente(
      sessao.usuario_id,
      PREFIXO_CANCELAMENTO,
      adesao.beneficio_chave
    )
  ) {
    throw new ErroHttp(
      409,
      "Você já tem solicitação de cancelamento em andamento para este benefício."
    );
  }
  const descricao = montarDescricaoSolicitacao(
    "cancelamento",
    adesao.beneficio_nome,
    adesao.beneficio_chave,
    motivo
  );
  return abrirDemandaBeneficio(sessao, perfil.colaborador_id, descricao);
}

// ------------------------------------------------------------------ gestão pelo DP (adesao.gerir)

/** Encerra a demanda vinculada dentro da MESMA transação da adesão. */
async function encerrarDemandaVinculada(
  cliente: PoolClient,
  sessao: PayloadSessao,
  demanda: DemandaBeneficio,
  paraStatus: "concluida" | "recusada",
  texto: string
): Promise<void> {
  await atualizarStatusDemanda(
    cliente,
    demanda.id,
    paraStatus,
    sessao.usuario_id
  );
  await inserirTransicao(cliente, {
    demanda_id: demanda.id,
    de_status: demanda.status,
    para_status: paraStatus,
    por_usuario_id: sessao.usuario_id,
    motivo: texto,
  });
  await inserirComentario(cliente, {
    demanda_id: demanda.id,
    autor_usuario_id: sessao.usuario_id,
    texto,
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
      [paraStatus === "concluida" ? "Resposta" : "Motivo da recusa"]: {
        de: null,
        para: texto,
      },
    },
  });
}

async function exigirDemandaAberta(
  cliente: PoolClient,
  demandaId: number,
  natureza?: NaturezaSolicitacao
): Promise<DemandaBeneficio> {
  const demanda = await buscarDemandaBeneficioParaTransicao(cliente, demandaId);
  if (!demanda) {
    throw new ErroHttpCampo(
      404,
      "Solicitação de benefício não encontrada.",
      "demanda_id"
    );
  }
  if (demanda.status !== "aberta" && demanda.status !== "em_atendimento") {
    throw new ErroHttpCampo(
      409,
      "Esta solicitação já foi encerrada.",
      "demanda_id"
    );
  }
  if (natureza) {
    const lido = interpretarDescricaoSolicitacao(demanda.descricao);
    if (lido && lido.natureza !== natureza) {
      throw new ErroHttpCampo(
        409,
        natureza === "adesao"
          ? "A solicitação vinculada é de cancelamento, não de adesão."
          : "A solicitação vinculada é de adesão, não de cancelamento.",
        "demanda_id"
      );
    }
  }
  return demanda;
}

export async function efetivarAdesao(
  sessao: PayloadSessao,
  dados: EfetivacaoAdesao
): Promise<AdesaoResumo> {
  const adesaoId = await comTransacao(sessao.usuario_id, async (cliente) => {
    const perfil = await perfilPorColaborador(dados.colaborador_id, cliente);
    if (!perfil) {
      throw new ErroHttpCampo(
        404,
        "Colaborador não encontrado.",
        "colaborador_id"
      );
    }
    if (perfil.status === "desligado") {
      throw new ErroHttpCampo(
        409,
        "Colaborador desligado não recebe adesão nova.",
        "colaborador_id"
      );
    }
    const beneficio = await buscarBeneficio(dados.beneficio_id, cliente);
    if (!beneficio || !beneficio.ativo) {
      throw new ErroHttpCampo(404, "Benefício não encontrado.", "beneficio_id");
    }
    if (!beneficio.regra) {
      throw new ErroHttpCampo(
        409,
        "Benefício sem regra de elegibilidade vigente.",
        "beneficio_id"
      );
    }
    if (
      !atendeCriterio(beneficio.regra.criterio, {
        tipo_vinculo: perfil.tipo_vinculo,
        estabelecimento_id: perfil.estabelecimento_id,
      })
    ) {
      throw new ErroHttpCampo(
        409,
        "Colaborador não é elegível a este benefício pela regra vigente.",
        "colaborador_id"
      );
    }
    let demanda: DemandaBeneficio | null = null;
    if (dados.demanda_id !== undefined) {
      demanda = await exigirDemandaAberta(cliente, dados.demanda_id, "adesao");
      if (demanda.solicitante_colaborador_id !== dados.colaborador_id) {
        throw new ErroHttpCampo(
          409,
          "A solicitação vinculada é de outro colaborador.",
          "demanda_id"
        );
      }
    }
    // Omitido = congela o padrão da regra vigente na adesão.
    const valor = dados.valor ?? beneficio.regra.valor_padrao;
    const desconto = dados.desconto ?? beneficio.regra.desconto_padrao;
    let novaId: number;
    try {
      novaId = await inserirAdesao(cliente, {
        colaborador_id: dados.colaborador_id,
        beneficio_id: dados.beneficio_id,
        inicio: dados.inicio,
        valor,
        desconto,
        demanda_id: dados.demanda_id ?? null,
      });
    } catch (erro) {
      if (violacaoUnica(erro)) {
        throw new ErroHttpCampo(
          409,
          "Colaborador já tem adesão vigente a este benefício.",
          "beneficio_id"
        );
      }
      throw erro;
    }
    if (demanda) {
      await encerrarDemandaVinculada(
        cliente,
        sessao,
        demanda,
        "concluida",
        `Adesão ao benefício "${beneficio.nome}" efetivada pelo DP com início em ${formatarData(dados.inicio)}.`
      );
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_ADESAO,
      registroId: String(novaId),
      diff: {
        Colaborador: {
          de: null,
          para: `${perfil.nome_completo} (${perfil.matricula})`,
        },
        "Benefício": { de: null, para: `${beneficio.nome} (${beneficio.chave})` },
        "Início": { de: null, para: formatarData(dados.inicio) },
        Valor: { de: null, para: formatarMoeda(valor) },
        Desconto: { de: null, para: formatarMoeda(desconto) },
        Demanda: {
          de: null,
          para: demanda ? formatarNumeroDemanda(demanda.numero) : "registro direto",
        },
      },
    });
    // Projeção na linha do tempo — restrita: gestor não vê benefício da equipe.
    await inserirEvento(cliente, {
      colaborador_id: dados.colaborador_id,
      tipo: "beneficio_adesao",
      ocorrido_em: new Date().toISOString(),
      origem_tabela: TABELA_ADESAO,
      origem_id: novaId,
      resumo: `Adesão ao benefício "${beneficio.nome}" efetivada (início ${formatarData(dados.inicio)})`,
      payload: { beneficio: beneficio.chave, restrita: "true" },
      registrado_por: sessao.usuario_id,
    });
    return novaId;
  });
  const resumo = await buscarAdesaoResumo(adesaoId);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao carregar a adesão efetivada.");
  }
  return resumo;
}

export async function negarSolicitacao(
  sessao: PayloadSessao,
  demandaId: number,
  motivo: string
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const demanda = await exigirDemandaAberta(cliente, demandaId);
    await encerrarDemandaVinculada(cliente, sessao, demanda, "recusada", motivo);
  });
}

export async function cancelarAdesao(
  sessao: PayloadSessao,
  adesaoId: number,
  dados: CancelamentoAdesao
): Promise<AdesaoResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const adesao = await buscarAdesaoParaAtualizar(cliente, adesaoId);
    if (!adesao) {
      throw new ErroHttp(404, "Adesão não encontrada.");
    }
    if (adesao.fim !== null) {
      throw new ErroHttp(409, "Esta adesão já está encerrada.");
    }
    if (dados.fim < adesao.inicio) {
      throw new ErroHttpCampo(
        400,
        "O fim não pode ser anterior ao início da adesão.",
        "fim"
      );
    }
    let demanda: DemandaBeneficio | null = null;
    if (dados.demanda_id !== undefined) {
      demanda = await exigirDemandaAberta(
        cliente,
        dados.demanda_id,
        "cancelamento"
      );
      if (demanda.solicitante_colaborador_id !== adesao.colaborador_id) {
        throw new ErroHttpCampo(
          409,
          "A solicitação vinculada é de outro colaborador.",
          "demanda_id"
        );
      }
    }
    await cancelarAdesaoNoBanco(cliente, adesaoId, dados.fim);
    if (demanda) {
      await encerrarDemandaVinculada(
        cliente,
        sessao,
        demanda,
        "concluida",
        `Cancelamento do benefício "${adesao.beneficio_nome}" efetivado pelo DP com fim em ${formatarData(dados.fim)}.`
      );
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "cancelamento",
      tabela: TABELA_ADESAO,
      registroId: String(adesaoId),
      diff: {
        Status: {
          de: ROTULOS_STATUS_ADESAO[adesao.status],
          para: ROTULOS_STATUS_ADESAO.cancelada,
        },
        Fim: { de: null, para: formatarData(dados.fim) },
        ...(dados.motivo
          ? { Motivo: { de: null, para: dados.motivo } }
          : {}),
      },
    });
    await inserirEvento(cliente, {
      colaborador_id: adesao.colaborador_id,
      tipo: "beneficio_cancelamento",
      ocorrido_em: new Date().toISOString(),
      origem_tabela: TABELA_ADESAO,
      origem_id: adesaoId,
      resumo: `Adesão ao benefício "${adesao.beneficio_nome}" cancelada (fim ${formatarData(dados.fim)})`,
      payload: { beneficio: adesao.beneficio_chave, restrita: "true" },
      registrado_por: sessao.usuario_id,
    });
  });
  const resumo = await buscarAdesaoResumo(adesaoId);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao recarregar a adesão.");
  }
  return resumo;
}

async function mudarStatusAdesao(
  sessao: PayloadSessao,
  adesaoId: number,
  de: "ativa" | "suspensa",
  para: "ativa" | "suspensa"
): Promise<AdesaoResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const adesao = await buscarAdesaoParaAtualizar(cliente, adesaoId);
    if (!adesao) {
      throw new ErroHttp(404, "Adesão não encontrada.");
    }
    if (adesao.fim !== null || adesao.status !== de) {
      throw new ErroHttp(
        409,
        de === "ativa"
          ? "Só é possível suspender adesão ativa."
          : "Só é possível reativar adesão suspensa."
      );
    }
    await atualizarStatusAdesao(cliente, adesaoId, para);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: para === "suspensa" ? "suspensao" : "reativacao",
      tabela: TABELA_ADESAO,
      registroId: String(adesaoId),
      diff: {
        Status: {
          de: ROTULOS_STATUS_ADESAO[de],
          para: ROTULOS_STATUS_ADESAO[para],
        },
        "Benefício": {
          de: null,
          para: `${adesao.beneficio_nome} — ${adesao.colaborador_nome}`,
        },
      },
    });
  });
  const resumo = await buscarAdesaoResumo(adesaoId);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao recarregar a adesão.");
  }
  return resumo;
}

export function suspenderAdesao(
  sessao: PayloadSessao,
  adesaoId: number
): Promise<AdesaoResumo> {
  return mudarStatusAdesao(sessao, adesaoId, "ativa", "suspensa");
}

export function reativarAdesao(
  sessao: PayloadSessao,
  adesaoId: number
): Promise<AdesaoResumo> {
  return mudarStatusAdesao(sessao, adesaoId, "suspensa", "ativa");
}

// ------------------------------------------------------------------ dependentes (dado de terceiro — LGPD)

export async function listarDependentesDoColaborador(
  sessao: PayloadSessao,
  pode: PermissoesBeneficios,
  colaboradorId: number
): Promise<Dependente[]> {
  const perfilProprio = await perfilPorUsuario(sessao.usuario_id);
  const ehTitular = perfilProprio?.colaborador_id === colaboradorId;
  if (!ehTitular) {
    if (!pode.gerir && !pode.ver) {
      // Ausência, não máscara.
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const existe = await perfilPorColaborador(colaboradorId);
    if (!existe) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    // Dependente é dado de terceiro: leitura fora do titular deixa trilha.
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: pode.gerir ? "adesao.gerir" : "beneficio.ver",
      recurso: "beneficios.dependentes",
      registroId: String(colaboradorId),
    });
  }
  return listarDependentes(colaboradorId);
}

function diffDependente(dados: {
  nome?: string;
  nascimento?: string;
  parentesco?: string;
  cpf?: string | null;
}): Diff {
  const diff: Diff = {};
  if (dados.nome !== undefined) diff["Nome"] = { de: null, para: dados.nome };
  if (dados.nascimento !== undefined) {
    diff["Nascimento"] = { de: null, para: dados.nascimento };
  }
  if (dados.parentesco !== undefined) {
    diff["Parentesco"] = { de: null, para: dados.parentesco };
  }
  if (dados.cpf !== undefined) {
    // Minimização: o CPF do dependente não viaja para a trilha de auditoria.
    diff["CPF"] = { de: null, para: dados.cpf ? "informado" : "removido" };
  }
  return diff;
}

export async function criarDependente(
  sessao: PayloadSessao,
  dados: CriacaoDependente
): Promise<Dependente> {
  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const perfil = await perfilPorColaborador(dados.colaborador_id, cliente);
    if (!perfil) {
      throw new ErroHttpCampo(
        404,
        "Colaborador não encontrado.",
        "colaborador_id"
      );
    }
    const dependenteId = await inserirDependente(cliente, {
      colaborador_id: dados.colaborador_id,
      nome: dados.nome,
      nascimento: dados.nascimento,
      parentesco: dados.parentesco,
      cpf: dados.cpf ?? null,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_DEPENDENTE,
      registroId: String(dependenteId),
      diff: {
        Colaborador: {
          de: null,
          para: `${perfil.nome_completo} (${perfil.matricula})`,
        },
        ...diffDependente(dados),
      },
    });
    return dependenteId;
  });
  const criados = await listarDependentes(dados.colaborador_id);
  const criado = criados.find((item) => item.id === id);
  if (!criado) {
    throw new ErroHttp(500, "Falha ao carregar o dependente criado.");
  }
  return criado;
}

export async function atualizarDependente(
  sessao: PayloadSessao,
  id: number,
  dados: AtualizacaoDependente
): Promise<Dependente> {
  const colaboradorId = await comTransacao(
    sessao.usuario_id,
    async (cliente) => {
      const atual = await buscarDependenteParaAtualizar(cliente, id);
      if (!atual) {
        throw new ErroHttp(404, "Dependente não encontrado.");
      }
      await atualizarDependenteNoBanco(cliente, id, dados);
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "atualizacao",
        tabela: TABELA_DEPENDENTE,
        registroId: String(id),
        diff: diffDependente(dados),
      });
      return atual.colaborador_id;
    }
  );
  const lista = await listarDependentes(colaboradorId);
  const atualizado = lista.find((item) => item.id === id);
  if (!atualizado) {
    throw new ErroHttp(500, "Falha ao recarregar o dependente.");
  }
  return atualizado;
}

export async function removerDependente(
  sessao: PayloadSessao,
  id: number
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await buscarDependenteParaAtualizar(cliente, id);
    if (!atual) {
      throw new ErroHttp(404, "Dependente não encontrado.");
    }
    await excluirDependente(cliente, id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "exclusao",
      tabela: TABELA_DEPENDENTE,
      registroId: String(id),
      diff: {
        Nome: { de: atual.nome, para: null },
        Parentesco: { de: atual.parentesco, para: null },
      },
    });
  });
}
