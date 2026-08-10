import { PoolClient } from "pg";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { mensagemSemFicha } from "../../lib/ficha-de-colaborador";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp, lerSessao } from "../../lib/sessao";
import { exigirVigenciaNaoFutura } from "../../lib/vigencia";
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
  CHAVE_TIPO_DEMANDA_REVISAO,
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
  ROTULOS_NATUREZA,
  ROTULOS_STATUS_ADESAO,
} from "./esquemas";
import {
  adesoesParaTransferir,
  AdesaoResumo,
  atualizarStatusAdesao,
  BeneficioComRegra,
  competenciaFechadaNaData,
  encerrarAdesaoPorFimDoVinculo,
  encerrarAdesaoPorRevisao,
  inserirPedidoRevisao,
  buscarPedidoRevisaoPorDemanda,
  valoresPedidosPorDemandas,
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
  UnidadeOpcao,
  atualizarBeneficio as atualizarBeneficioNoBanco,
  atualizarDependente as atualizarDependenteNoBanco,
} from "./repositorio";

const TABELA_BENEFICIO = "rh.beneficio";
const TABELA_REGRA = "rh.regra_elegibilidade_versao";
const TABELA_ADESAO = "rh.adesao";
const TABELA_DEPENDENTE = "rh.dependente";
const TABELA_DEMANDA = "rh.demanda";

const PREFIXO_CANCELAMENTO = "Cancelamento do benefício";
/** Onda H3 — a terceira voz do colaborador, ao lado do cancelamento. */
const PREFIXO_REVISAO = "Revisão de valor do benefício";

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
  /** Adesão vigente do solicitante no benefício (alvo de cancelamento/revisão). */
  adesao_id: number | null;
  /** O que a pessoa propôs numa revisão de valor (H3); null nas demais. */
  valor_pedido: number | null;
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
  adesoesVigentes: AdesaoResumo[],
  /** demanda_id → valor pedido, das revisões de valor (H3). */
  valoresPedidos: Map<number, number> = new Map()
): SolicitacaoInterpretada[] {
  const porChave = new Map(beneficios.map((item) => [item.chave, item]));
  return solicitacoes.map((solicitacao) => {
    const lido = interpretarDescricaoSolicitacao(solicitacao.descricao);
    const beneficio = lido ? (porChave.get(lido.chave) ?? null) : null;
    // Cancelamento e revisão apontam para a adesão vigente do par — é dela que
    // a tela tira o valor ATUAL para pôr ao lado do pedido.
    const adesao =
      (lido?.natureza === "cancelamento" || lido?.natureza === "revisao") &&
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
      valor_pedido: valoresPedidos.get(solicitacao.demanda_id) ?? null,
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
  // ATIVO BASTA — a regra deixou de ser portão.
  //
  // Aqui se filtrava `ativo && regra !== null`, e o critério da regra ainda
  // peneirava o catálogo pessoa a pessoa. Duas consequências que a onda H
  // desfaz: benefício recém-criado ficava invisível até alguém publicar uma
  // versão de regra (o DP não conseguia conceder o que acabara de cadastrar), e
  // a lista que a pessoa via prometia direito por um critério que agora não
  // decide mais nada. O catálogo diz o que EXISTE; quem concede é o DP, e a
  // regra entra só como valor de referência na hora de conceder.
  const ativos = todosBeneficios.filter((item) => item.ativo);

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
      vigentes,
      await valoresPedidosPorDemandas(
        solicitacoes.map((item) => item.demanda_id)
      )
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
    catalogo = ativos.map((item) => ({
      beneficio_id: item.id,
      chave: item.chave,
      nome: item.nome,
      categoria: item.categoria,
      categoria_rotulo: ROTULOS_CATEGORIA[item.categoria],
      valor_padrao: item.regra?.valor_padrao ?? null,
      desconto_padrao: item.regra?.desconto_padrao ?? null,
      ja_aderido: vigentes.some((adesao) => adesao.beneficio_id === item.id),
      // Só sobrevive para os pedidos abertos ANTES de a candidatura acabar: não
      // nasce mais nenhum, e a tela usa isto para dizer à pessoa que o pedido
      // antigo dela ainda está na fila do DP.
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
        adesoes,
        await valoresPedidosPorDemandas(
          pendentes.map((item) => item.demanda_id)
        )
      ),
      adesoes,
      colaboradores,
      beneficios: ativos,
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
    // As DUAS pontas da janela, e elas são independentes. Para trás quem
    // responde é a versão vigente (logo abaixo); para a FRENTE quem responde é
    // o calendário, porque a elegibilidade é lida por `status = 'ativa'` e não
    // por data — ver o join de `SELECT_BENEFICIO` no repositório. Sem esta
    // linha, a regra de 2027 cadastrada em agosto decide hoje: o estagiário
    // leva 403 num benefício a que tem direito, e a transferência entre CNPJs
    // deixa de recriar o plano por um critério que ainda não começou.
    // É a mesma guarda de `criarVersaoEstabelecimento` e `criarVersaoEmpresa`.
    await exigirVigenciaNaoFutura(cliente, dados.inicio_vigencia);
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

// ------------------------------------------------------------------ pedido de cancelamento (via demanda)
//
// A ADESÃO NÃO SE PEDE MAIS. Aqui existia `solicitarAdesao`: o colaborador se
// candidatava, a candidatura virava demanda e o DP efetivava. A Diretora de
// Pessoas encerrou esse modelo ("benefícios sem candidatura, só reajuste",
// docs/11 §3; onda H1 em docs/10, "a pessoa já entra com direito; o botão
// solicitar adesão desaparece"). Conceder é ato do DP — `efetivarAdesao`.
//
// O CANCELAMENTO CONTINUA SENDO PEDIDO PELO TITULAR. O que ela tirou foi a
// candidatura, não a voz de quem quer sair do plano: quem paga coparticipação
// tem de conseguir dizer "quero sair" sem depender de achar alguém do DP.

async function exigirPerfilAtivo(
  usuarioId: number,
  perfil: PerfilBeneficios | null
): Promise<PerfilBeneficios> {
  if (!perfil) {
    // Dois fatos diferentes, uma frase só era o defeito: "procure o DP" dito a
    // uma conta administrativa manda a diretora procurar quem está abaixo dela.
    // `mensagemSemFicha` separa conta sem pessoa de vínculo encerrado.
    throw new ErroHttp(400, await mensagemSemFicha(usuarioId));
  }
  if (perfil.status === "desligado") {
    throw new ErroHttp(
      409,
      "Colaborador desligado não movimenta benefício — procure o DP."
    );
  }
  return perfil;
}

async function abrirDemandaBeneficio(
  sessao: PayloadSessao,
  colaboradorId: number,
  descricao: string,
  /** A H3 trouxe um segundo tipo (revisão de valor) para a mesma porta. */
  chaveTipo: string = CHAVE_TIPO_DEMANDA_BENEFICIO,
  /**
   * Roda DENTRO da transação da demanda, com o id dela em mãos. Existe porque a
   * revisão de valor precisa gravar o pedido estruturado amarrado à demanda —
   * e as duas linhas têm de nascer juntas ou nenhuma nascer.
   */
  aoCriar?: (cliente: PoolClient, demandaId: number) => Promise<void>
): Promise<SolicitacaoBeneficio> {
  const tipo = await buscarTipoAtivo(chaveTipo);
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
    if (aoCriar) await aoCriar(cliente, demanda.id);
    return demanda;
  });
  const solicitacoes = await listarSolicitacoesDoUsuario(sessao.usuario_id);
  const resumo = solicitacoes.find((item) => item.demanda_id === criada.id);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao carregar a solicitação criada.");
  }
  return resumo;
}

export async function solicitarCancelamento(
  sessao: PayloadSessao,
  adesaoId: number,
  motivo: string
): Promise<SolicitacaoBeneficio> {
  const perfil = await exigirPerfilAtivo(
    sessao.usuario_id,
    await perfilPorUsuario(sessao.usuario_id)
  );
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

/**
 * O colaborador pede que o VALOR de um benefício que ele já tem seja revisto.
 *
 * O caso do dono: mudou de casa, a passagem subiu. Ele PROPÕE um valor; quem
 * decide é o DP, e o concedido pode ser outro — por isso o pedido vira linha
 * própria (`rh.pedido_revisao_beneficio`) em vez de texto na descrição: dinheiro
 * em texto livre não se compara nem se soma.
 */
export async function solicitarRevisaoValor(
  sessao: PayloadSessao,
  adesaoId: number,
  valorPedido: number,
  motivo: string
): Promise<SolicitacaoBeneficio> {
  const perfil = await exigirPerfilAtivo(
    sessao.usuario_id,
    await perfilPorUsuario(sessao.usuario_id)
  );
  const adesao = await buscarAdesaoResumo(adesaoId);
  if (!adesao || adesao.colaborador_id !== perfil.colaborador_id) {
    // Ausência, não máscara — igual ao cancelamento.
    throw new ErroHttp(404, "Adesão não encontrada.");
  }
  if (adesao.fim !== null) {
    throw new ErroHttp(
      409,
      "Esta adesão já está encerrada — não há valor a rever."
    );
  }
  if (
    await existeSolicitacaoPendente(
      sessao.usuario_id,
      PREFIXO_REVISAO,
      adesao.beneficio_chave
    )
  ) {
    throw new ErroHttp(
      409,
      "Você já tem um pedido de revisão em andamento para este benefício."
    );
  }
  const descricao = montarDescricaoSolicitacao(
    "revisao",
    adesao.beneficio_nome,
    adesao.beneficio_chave,
    motivo
  );
  return abrirDemandaBeneficio(
    sessao,
    perfil.colaborador_id,
    descricao,
    CHAVE_TIPO_DEMANDA_REVISAO,
    async (cliente, demandaId) => {
      await inserirPedidoRevisao(cliente, {
        adesao_id: adesaoId,
        demanda_id: demandaId,
        valor_pedido: valorPedido,
        motivo,
      });
    }
  );
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
      // Com três naturezas o texto binário de antes mentia: revisão chegando
      // num fluxo de adesão seria anunciada como "cancelamento".
      throw new ErroHttpCampo(
        409,
        `A solicitação vinculada é de ${ROTULOS_NATUREZA[lido.natureza].toLowerCase()}, ` +
          `não de ${ROTULOS_NATUREZA[natureza].toLowerCase()}.`,
        "demanda_id"
      );
    }
  }
  return demanda;
}

/**
 * O DP CONCEDE o benefício a uma pessoa, com o valor DAQUELA pessoa.
 *
 * Era "efetivar o que o colaborador pediu"; virou o ato de origem. `demanda_id`
 * continua aceito para despachar as adesões pedidas ANTES de a candidatura
 * acabar — a fila que já existia não some, ela é atendida.
 *
 * A regra de elegibilidade deixou de barrar. Ela não some: continua versionada,
 * continua explicando adesões antigas e continua dando o valor de referência
 * que a tela sugere. O que ela perdeu foi o poder de dizer "não" no lugar do
 * DP — quem sabe se a pessoa tem direito é quem concede, e o critério de hoje
 * não cabe em todo caso real (o motoboy que passou a usar transporte, a pessoa
 * transferida de unidade na véspera). O que a pessoa NÃO atendia fica gravado
 * na trilha, em vez de virar 409: o ato continua legível depois.
 */
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
    // Não barra; anota. Sem regra vigente não há critério, e isso também é fato
    // a registrar — o benefício novo é concedível no dia em que é cadastrado.
    const dentroDoCriterio = beneficio.regra
      ? atendeCriterio(beneficio.regra.criterio, {
          tipo_vinculo: perfil.tipo_vinculo,
          estabelecimento_id: perfil.estabelecimento_id,
        })
      : null;
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
    // Vêm do pedido, sempre — o esquema já os tornou obrigatórios. Nada de
    // `?? beneficio.regra.valor_padrao`: era esse `??` que fazia o valor da
    // pessoa nascer escolhido pelo sistema quando o DP deixava o campo vazio.
    const { valor, desconto } = dados;
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
        // O que a regra sugeria, ao lado do que o DP concedeu. É isto que
        // torna o reajuste individual auditável: sem a referência, ninguém
        // consegue dizer depois se R$ 600 foi escolha ou tabela. E é aqui que
        // a elegibilidade não atendida aparece, já que deixou de ser 409.
        "Referência da regra": {
          de: null,
          para: beneficio.regra
            ? `valor ${formatarMoeda(beneficio.regra.valor_padrao)} · desconto ` +
              `${formatarMoeda(beneficio.regra.desconto_padrao)} (versão desde ` +
              `${formatarData(beneficio.regra.inicio_vigencia)})` +
              (dentroDoCriterio === false
                ? " — concedido FORA do critério desta versão"
                : "")
            : "benefício sem versão de regra vigente",
        },
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

/**
 * O DP decide a revisão: encerra a adesão vigente e abre outra com o valor novo.
 *
 * "Valor anterior vira versão encerrada" (docs/10, H3) mapeia exatamente aqui —
 * a CADEIA DE ADESÕES é o histórico, e `adesao_congelar` torna a encerrada
 * imutável. Não há tabela de histórico paralela, e não há UPDATE no valor: o
 * passado fica de pé, com as datas em que valeu.
 *
 * O valor que vale é o do DP, não o pedido. Os dois vão para a trilha lado a
 * lado — a diferença entre o que se pediu e o que se concedeu é justamente o
 * que alguém vai querer entender daqui a um ano.
 *
 * A ORDEM IMPORTA: `adesao_uma_vigente` é único em (colaborador, benefício)
 * WHERE fim IS NULL. Abrir a nova antes de fechar a velha bate no índice.
 */
export async function aprovarRevisaoValor(
  sessao: PayloadSessao,
  demandaId: number,
  dados: { valor: number; desconto: number; inicio: string }
): Promise<AdesaoResumo> {
  const novaId = await comTransacao(sessao.usuario_id, async (cliente) => {
    // Sem filtro de natureza: `interpretarDescricaoSolicitacao` só conhece os
    // dois prefixos antigos e devolveria `null` para revisão, deixando a
    // checagem passar em silêncio. Quem prova que a demanda é de revisão é a
    // EXISTÊNCIA do pedido estruturado, conferida logo abaixo.
    const demanda = await exigirDemandaAberta(cliente, demandaId);
    const pedido = await buscarPedidoRevisaoPorDemanda(cliente, demandaId);
    if (!pedido) {
      throw new ErroHttp(
        409,
        "Esta demanda não tem pedido de revisão de valor vinculado."
      );
    }
    if (pedido.adesao_encerrada) {
      throw new ErroHttp(
        409,
        "A adesão que este pedido queria rever já foi encerrada — nada a fazer."
      );
    }
    const fechada = await competenciaFechadaNaData(cliente, dados.inicio);
    if (fechada) {
      throw new ErroHttpCampo(
        409,
        `A folha de ${fechada} já foi fechada. O valor novo não pode começar ` +
          `dentro de uma competência encerrada — escolha uma data a partir da ` +
          `competência aberta.`,
        "inicio"
      );
    }

    await encerrarAdesaoPorRevisao(cliente, pedido.adesao_id, dados.inicio);
    const criada = await inserirAdesao(cliente, {
      colaborador_id: pedido.colaborador_id,
      beneficio_id: pedido.beneficio_id,
      inicio: dados.inicio,
      valor: dados.valor,
      desconto: dados.desconto,
      demanda_id: demandaId,
    });

    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_ADESAO,
      registroId: String(criada),
      diff: {
        "Benefício": { de: null, para: pedido.beneficio_nome },
        Origem: {
          de: null,
          para: `revisão de valor aprovada (${formatarNumeroDemanda(demanda.numero)})`,
        },
        Valor: {
          de: formatarMoeda(pedido.valor_atual),
          para: formatarMoeda(dados.valor),
        },
        "Valor pedido pela pessoa": {
          de: null,
          para: formatarMoeda(pedido.valor_pedido),
        },
        Desconto: {
          de: formatarMoeda(pedido.desconto_atual),
          para: formatarMoeda(dados.desconto),
        },
        "Adesão encerrada": { de: null, para: String(pedido.adesao_id) },
        "Vale a partir de": { de: null, para: formatarData(dados.inicio) },
      },
    });

    await encerrarDemandaVinculada(
      cliente,
      sessao,
      demanda,
      "concluida",
      `Revisão aprovada: ${formatarMoeda(pedido.valor_atual)} → ` +
        `${formatarMoeda(dados.valor)} a partir de ${formatarData(dados.inicio)}` +
        (dados.valor === pedido.valor_pedido
          ? "."
          : ` (a pessoa havia pedido ${formatarMoeda(pedido.valor_pedido)}).`)
    );
    return criada;
  });
  const resumo = await buscarAdesaoResumo(novaId);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao carregar a adesão criada.");
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

// ------------------------------------------------- benefício na transferência entre empresas do grupo
// Chamado de dentro da transação de `aplicarTransferenciaEntreEmpresas`
// (demandas/servico.ts), ao lado dos dependentes. Fica AQUI, e não lá, porque
// a regra é de benefício: quem sabe o que é elegibilidade é este domínio.
//
// A REGRA, escrita onde faltava. Benefício é contrato do EMPREGADOR com a
// operadora, não da pessoa. Quando o contrato de trabalho muda de CNPJ, a
// adesão do CNPJ que sai TERMINA — e a do CNPJ que entra só nasce se a regra
// DELE admitir aquela pessoa (tipo de vínculo e unidade podem ser outros).
// Terminar calado foi o que criou o buraco: o RH via cinco adesões "vigentes"
// numa matrícula encerrada e a pessoa via zero. Por isso o resultado volta
// nomeado — o que atravessou e o que ficou para trás vão para o diff do cartão
// da movimentação, onde o DP lê na hora do ato.

export interface BeneficiosNaTransferencia {
  /** Benefícios recriados no vínculo novo, com valor e desconto preservados. */
  atravessaram: string[];
  /** Encerrados no vínculo velho e NÃO recriados: o critério do destino não admite. */
  ficaram: string[];
}

export async function transferirAdesoesEntreVinculos(
  cliente: PoolClient,
  vinculoOrigemId: number,
  vinculoDestinoId: number,
  data: string
): Promise<BeneficiosNaTransferencia> {
  const adesoes = await adesoesParaTransferir(cliente, vinculoOrigemId);
  const resultado: BeneficiosNaTransferencia = {
    atravessaram: [],
    ficaram: [],
  };
  if (adesoes.length === 0) return resultado;

  // O perfil do vínculo NOVO — a transferência já gravou a lotação dele antes
  // de chegar aqui, então tipo de vínculo e unidade do destino já são os reais.
  const perfilDestino = await perfilPorColaborador(vinculoDestinoId, cliente);
  if (!perfilDestino) {
    throw new ErroHttp(
      500,
      "O vínculo de destino sumiu no meio da transferência."
    );
  }

  for (const adesao of adesoes) {
    // Fecha na VÉSPERA da admissão nova: o mesmo corte da posição e da
    // alocação, que é o que faz o desconto parar na competência certa em vez
    // de sumir sem aviso quando a folha filtra por colaborador ativo.
    await encerrarAdesaoPorFimDoVinculo(cliente, adesao.id, data);
    // Sem regra vigente não há critério que barre — é o mesmo entendimento de
    // `montarVisao`, que oferece ao catálogo o benefício sem regra.
    const elegivel =
      adesao.criterio === null || atendeCriterio(adesao.criterio, perfilDestino);
    if (!elegivel) {
      resultado.ficaram.push(adesao.beneficio_nome);
      continue;
    }
    const novaId = await inserirAdesao(cliente, {
      colaborador_id: vinculoDestinoId,
      beneficio_id: adesao.beneficio_id,
      inicio: data,
      // Transferência não é momento de renegociar benefício: o valor e o
      // desconto que valiam continuam valendo.
      valor: adesao.valor,
      desconto: adesao.desconto,
      demanda_id: null,
    });
    // Adesão suspensa atravessa suspensa: a transferência não reativa nada
    // por conta própria.
    if (adesao.status === "suspensa") {
      await atualizarStatusAdesao(cliente, novaId, "suspensa");
    }
    resultado.atravessaram.push(adesao.beneficio_nome);
  }
  return resultado;
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
