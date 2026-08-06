import { PoolClient } from "pg";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import {
  atualizar as atualizarColaborador,
  buscarParaAtualizar as buscarColaboradorParaAtualizar,
  desativarUsuario,
  inserirEvento,
} from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { liquidarBancoNaRescisao } from "../ponto/servico";
import {
  CategoriaDevolucao,
  chaveDeNome,
  CorpoAgendarEntrevista,
  CorpoEncerrar,
  CorpoRealizarEntrevista,
  CorpoStatusItem,
  ESTADOS_TERMINAIS,
  EstadoProcesso,
  IniciarProcesso,
  NomeCategoria,
  NovoItem,
  PROXIMO_ESTADO,
  Respostas,
  ResultadoEstabilidade,
  ROTULOS_ESTADO,
  ROTULOS_INICIATIVA,
  ROTULOS_MODALIDADE_AVISO,
  ROTULOS_RESULTADO_ESTABILIDADE,
  ROTULOS_STATUS_ENTREVISTA,
  ROTULOS_STATUS_ITEM,
  ROTULOS_TIPO_ESTABILIDADE,
  STATUS_TERMINAIS_ENTREVISTA,
  TIPOS_DECLARACAO,
  TipoEstabilidade,
  validarRespostas,
} from "./esquemas";
import {
  agendarEntrevista,
  atualizarEstado,
  atualizarStatusItem,
  buscarCategoriaParaAtualizar,
  buscarCategoriaPorChave,
  buscarColaboradorBasico,
  buscarEntrevista,
  buscarEntrevistaParaTransicao,
  buscarItemParaAtualizar,
  buscarMotivo,
  buscarParaTransicao,
  buscarPerguntasDoRoteiro,
  buscarResumo,
  buscarRespostas,
  buscarRoteiroAtivo,
  buscarTipoAtivo,
  ColaboradorElegivel,
  colaboradoresElegiveis,
  definirInativacaoCategoria,
  ehGestorDoColaborador,
  encerrarLiderancaNoDesligamento,
  encerrarProcesso,
  EntrevistaResumo,
  existeProcessoAberto,
  IndicadorEntrevistas,
  indicadorEntrevistas,
  inserirCategoriaDevolucao,
  inserirEntrevista,
  inserirItem,
  inserirProcesso,
  inserirVerificacao,
  ItemDevolucao,
  listarCategoriasDevolucao,
  listarItens,
  listarProcessos,
  listarVerificacoes,
  ProcessoResumo,
  recusarEntrevista,
  registrarEntrevistaNaoRealizada,
  registrarEntrevistaRealizada,
  registrarLeituraSensivel,
  relacoesLiderancaAbertas,
  renomearCategoriaDevolucao,
  temAfastamentoAcidentario12m,
  temPermissao,
  TipoDesligamentoAtivo,
  tiposAtivos,
  VerificacaoEstabilidade,
} from "./repositorio";

const TABELA_PROCESSO = "rh.processo_desligamento";
const TABELA_ENTREVISTA = "rh.entrevista_desligamento";
const TABELA_ITEM = "rh.item_devolucao";
const TABELA_CATEGORIA = "rh.categoria_devolucao";
const CHAVE_CATEGORIA_ADMIN = "desligamento.categoria.administrar";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

// ------------------------------------------------------------------ visão do painel

export interface PermissoesDesligamento {
  iniciar: boolean;
  gerir: boolean;
  conduzir_entrevista: boolean;
  ver_motivo: boolean;
  ver_respostas: boolean;
}

export interface VisaoDesligamentos {
  pode: PermissoesDesligamento;
  processos: ProcessoResumo[];
  indicador: IndicadorEntrevistas;
  /** Presentes apenas para quem pode iniciar (insumos do wizard). */
  tipos: TipoDesligamentoAtivo[] | null;
  colaboradores: ColaboradorElegivel[] | null;
}

async function permissoesDe(
  usuarioId: number
): Promise<PermissoesDesligamento> {
  const [iniciar, gerir, conduzir, verMotivo, verRespostas] =
    await Promise.all([
      temPermissao(usuarioId, "desligamento.iniciar"),
      temPermissao(usuarioId, "desligamento.gerir"),
      temPermissao(usuarioId, "entrevista.conduzir"),
      temPermissao(usuarioId, "desligamento.motivo.ver"),
      temPermissao(usuarioId, "entrevista.respostas.ver"),
    ]);
  return {
    iniciar,
    gerir,
    conduzir_entrevista: conduzir,
    ver_motivo: verMotivo,
    ver_respostas: verRespostas,
  };
}

export async function montarVisao(
  sessao: PayloadSessao
): Promise<VisaoDesligamentos> {
  const pode = await permissoesDe(sessao.usuario_id);
  const [processos, indicador] = await Promise.all([
    listarProcessos(),
    indicadorEntrevistas(),
  ]);
  const [tipos, colaboradores] = pode.iniciar
    ? await Promise.all([tiposAtivos(), colaboradoresElegiveis()])
    : [null, null];
  return { pode, processos, indicador, tipos, colaboradores };
}

// ------------------------------------------------------------------ indicador oficial do setor

/**
 * % de entrevistas de desligamento realizadas — processos encerrados nos
 * últimos 12 meses, denominador com elegivel_indicador congelado na oferta.
 * Consumido pela Central de Metas/painéis; usa só status, nunca conteúdo.
 */
export async function valorIndicadorEntrevistas(): Promise<IndicadorEntrevistas> {
  return indicadorEntrevistas();
}

// ------------------------------------------------------------------ gate de estabilidades (prévia do wizard)

export interface PreviaEstabilidades {
  acidentario: {
    resultado: ResultadoEstabilidade;
    detalhe: string;
  };
}

export async function previaEstabilidades(
  colaboradorId: number
): Promise<PreviaEstabilidades> {
  const bloqueado = await temAfastamentoAcidentario12m(colaboradorId);
  return {
    acidentario: {
      resultado: bloqueado ? "bloqueado" : "livre",
      detalhe: bloqueado
        ? "Há afastamento por acidente de trabalho nos últimos 12 meses (estabilidade do art. 118 da Lei 8.213/91)."
        : "Sem afastamento por acidente de trabalho nos últimos 12 meses.",
    },
  };
}

// ------------------------------------------------------------------ iniciar processo

interface VerificacaoCalculada {
  tipo: TipoEstabilidade;
  resultado: ResultadoEstabilidade;
  origem: "declaracao" | "afastamento";
  justificativa: string | null;
}

export async function iniciarProcesso(
  sessao: PayloadSessao,
  dados: IniciarProcesso
): Promise<ProcessoResumo> {
  let processoId: number;
  try {
    processoId = await comTransacao(sessao.usuario_id, async (cliente) => {
      const tipo = await buscarTipoAtivo(cliente, dados.tipo_versao_id);
      if (!tipo) {
        throw new ErroHttpCampo(
          400,
          "Tipo de desligamento inválido ou sem versão vigente.",
          "tipo_versao_id"
        );
      }
      const colaborador = await buscarColaboradorBasico(
        cliente,
        dados.colaborador_id
      );
      if (!colaborador) {
        throw new ErroHttpCampo(
          404,
          "Colaborador não encontrado.",
          "colaborador_id"
        );
      }
      if (colaborador.status !== "ativo") {
        throw new ErroHttpCampo(
          409,
          "Só colaborador ativo pode entrar em processo de desligamento.",
          "colaborador_id"
        );
      }
      if (await existeProcessoAberto(cliente, dados.colaborador_id)) {
        throw new ErroHttpCampo(
          409,
          "Este colaborador já tem um processo de desligamento aberto.",
          "colaborador_id"
        );
      }

      // Gate: automática onde há dado (acidentário), declaração humana no resto.
      const acidentario = await temAfastamentoAcidentario12m(
        dados.colaborador_id,
        cliente
      );
      const verificacoes: VerificacaoCalculada[] = [
        {
          tipo: "acidentario",
          resultado: acidentario ? "bloqueado" : "livre",
          origem: "afastamento",
          justificativa: acidentario
            ? "Afastamento por acidente de trabalho nos últimos 12 meses (art. 118 da Lei 8.213/91)."
            : "Sem afastamento por acidente de trabalho nos últimos 12 meses.",
        },
        ...TIPOS_DECLARACAO.map((tipoDeclaracao): VerificacaoCalculada => {
          const declaracao = dados.declaracoes[tipoDeclaracao];
          return {
            tipo: tipoDeclaracao,
            resultado: declaracao.resultado,
            origem: "declaracao",
            justificativa: declaracao.justificativa ?? null,
          };
        }),
      ];
      const bloqueadas = verificacoes.filter(
        (verificacao) => verificacao.resultado === "bloqueado"
      );
      if (bloqueadas.length > 0 && !dados.override_justificativa) {
        const rotulos = bloqueadas
          .map((verificacao) => ROTULOS_TIPO_ESTABILIDADE[verificacao.tipo])
          .join("; ");
        throw new ErroHttpCampo(
          409,
          `Estabilidade com resultado bloqueado impede o início (${rotulos}). Para prosseguir mesmo assim, registre a justificativa de override — a decisão fica auditada.`,
          "override_justificativa"
        );
      }

      const processo = await inserirProcesso(cliente, {
        colaborador_id: dados.colaborador_id,
        tipo_desligamento_versao_id: tipo.id,
        iniciativa: dados.iniciativa,
        data_comunicacao: dados.data_comunicacao,
        modalidade_aviso: dados.modalidade_aviso,
        data_projetada_termino: dados.data_projetada_termino,
        motivo: dados.motivo ?? null,
        aberto_por_usuario_id: sessao.usuario_id,
      });

      for (const verificacao of verificacoes) {
        await inserirVerificacao(cliente, {
          processo_id: processo.id,
          ...verificacao,
          decisor_usuario_id: sessao.usuario_id,
        });
      }
      // Override = registro NOVO por estabilidade bloqueada (append-only),
      // com a justificativa do decisor — nada se sobrescreve.
      if (bloqueadas.length > 0 && dados.override_justificativa) {
        for (const verificacao of bloqueadas) {
          await inserirVerificacao(cliente, {
            processo_id: processo.id,
            tipo: verificacao.tipo,
            resultado: "condicionado",
            origem: "declaracao",
            justificativa: `Prosseguimento autorizado (override): ${dados.override_justificativa}`,
            decisor_usuario_id: sessao.usuario_id,
          });
        }
      }

      // Oferta da entrevista na criação quando o tipo é elegível (auditada;
      // participação voluntária — o que não pode é encerrar sem desfecho).
      let entrevistaOferecida = false;
      if (tipo.elegivel_entrevista) {
        const roteiro = await buscarRoteiroAtivo(cliente);
        if (!roteiro) {
          throw new ErroHttp(
            409,
            "Não há roteiro de entrevista ativo — ative um roteiro antes de abrir processo de tipo elegível."
          );
        }
        await inserirEntrevista(cliente, {
          processo_id: processo.id,
          roteiro_versao_id: roteiro.id,
          elegivel_indicador: true,
        });
        entrevistaOferecida = true;
      }

      const diff: Diff = {
        Colaborador: {
          de: null,
          para: `${colaborador.nome_completo} (matrícula ${colaborador.matricula})`,
        },
        Tipo: { de: null, para: tipo.nome },
        Iniciativa: { de: null, para: ROTULOS_INICIATIVA[dados.iniciativa] },
        "Modalidade do aviso": {
          de: null,
          para: ROTULOS_MODALIDADE_AVISO[dados.modalidade_aviso],
        },
        "Data da comunicação": {
          de: null,
          para: formatarData(dados.data_comunicacao),
        },
        "Término projetado": {
          de: null,
          para: formatarData(dados.data_projetada_termino),
        },
        "Prazo do art. 477": {
          de: null,
          para: formatarData(processo.data_limite_477),
        },
        Estabilidades: {
          de: null,
          para: verificacoes
            .map(
              (verificacao) =>
                `${ROTULOS_TIPO_ESTABILIDADE[verificacao.tipo]}: ${ROTULOS_RESULTADO_ESTABILIDADE[verificacao.resultado]}`
            )
            .join("; "),
        },
        Entrevista: {
          de: null,
          para: entrevistaOferecida ? "Oferecida" : "Tipo não elegível",
        },
      };
      if (dados.motivo) {
        diff.Motivo = { de: null, para: dados.motivo };
      }
      if (bloqueadas.length > 0 && dados.override_justificativa) {
        diff["Override de estabilidade"] = {
          de: null,
          para: dados.override_justificativa,
        };
      }
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_PROCESSO,
        registroId: String(processo.id),
        diff,
      });

      // Linha do tempo: fato restrito até a efetivação (o desligado em
      // potencial e o gestor não veem o processo em curso pela projeção).
      await inserirEvento(cliente, {
        colaborador_id: dados.colaborador_id,
        tipo: "desligamento_iniciado",
        ocorrido_em: `${dados.data_comunicacao}T00:00:00Z`,
        origem_tabela: TABELA_PROCESSO,
        origem_id: processo.id,
        resumo: `Processo de desligamento iniciado (${tipo.nome}) — término projetado em ${formatarData(dados.data_projetada_termino)}`,
        payload: { restrita: true, tipo: tipo.tipo },
        registrado_por: sessao.usuario_id,
      });

      return processo.id;
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "processo_desligamento_um_ativo") {
      throw new ErroHttpCampo(
        409,
        "Este colaborador já tem um processo de desligamento aberto.",
        "colaborador_id"
      );
    }
    throw erro;
  }
  return resumoApos(processoId);
}

async function resumoApos(id: number): Promise<ProcessoResumo> {
  const resumo = await buscarResumo(id);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao recarregar o processo.");
  }
  return resumo;
}

// ------------------------------------------------------------------ detalhe

export interface DetalheProcesso {
  processo: ProcessoResumo;
  /** Chave AUSENTE para quem não tem desligamento.motivo.ver. */
  motivo?: string | null;
  verificacoes: VerificacaoEstabilidade[];
  itens: ItemDevolucao[];
  /**
   * As categorias que o seletor de item pode oferecer — só as ATIVAS, e só
   * para quem gere itens. Vem do catálogo (0054): a tela não tem mais lista.
   */
  categorias: CategoriaDevolucao[];
  entrevista: EntrevistaResumo | null;
  acoes: {
    avancar: boolean;
    encerrar: boolean;
    encerrar_bloqueado_por_entrevista: boolean;
    cancelar: boolean;
    gerir_itens: boolean;
    entrevista_transicionar: boolean;
    ver_respostas: boolean;
  };
}

export async function obterDetalhe(
  sessao: PayloadSessao,
  id: number
): Promise<DetalheProcesso> {
  const processo = await buscarResumo(id);
  if (!processo) {
    throw new ErroHttp(404, "Processo não encontrado.");
  }
  const pode = await permissoesDe(sessao.usuario_id);
  const [verificacoes, itens, entrevista, categorias] = await Promise.all([
    listarVerificacoes(id),
    listarItens(id),
    buscarEntrevista(id),
    listarCategoriasDevolucao(true),
  ]);

  const terminal = ESTADOS_TERMINAIS.includes(processo.estado);
  const entrevistaPendente =
    entrevista !== null &&
    !STATUS_TERMINAIS_ENTREVISTA.includes(entrevista.status);

  const gerirItens = pode.gerir && !terminal;

  const detalhe: DetalheProcesso = {
    processo,
    verificacoes,
    itens,
    categorias: gerirItens ? categorias : [],
    entrevista,
    acoes: {
      avancar: pode.gerir && PROXIMO_ESTADO[processo.estado] !== undefined,
      encerrar:
        pode.gerir && processo.estado === "em_acerto" && !entrevistaPendente,
      encerrar_bloqueado_por_entrevista:
        processo.estado === "em_acerto" && entrevistaPendente,
      cancelar: pode.gerir && !terminal,
      gerir_itens: gerirItens,
      entrevista_transicionar:
        pode.conduzir_entrevista &&
        !terminal &&
        entrevista !== null &&
        (entrevista.status === "oferecida" ||
          entrevista.status === "agendada"),
      ver_respostas:
        pode.ver_respostas && entrevista?.status === "realizada",
    },
  };

  // Motivo é RESTRITO: presença da chave só com a permissão; leitura logada.
  if (pode.ver_motivo) {
    detalhe.motivo = await buscarMotivo(id);
    if (detalhe.motivo !== null) {
      await registrarLeituraSensivel({
        usuarioId: sessao.usuario_id,
        chavePermissao: "desligamento.motivo.ver",
        recurso: "desligamento.motivo",
        registroId: String(id),
      });
    }
  }
  return detalhe;
}

// ------------------------------------------------------------------ transições do processo

async function exigirProcessoAtivo(cliente: PoolClient, id: number) {
  const processo = await buscarParaTransicao(cliente, id);
  if (!processo) {
    throw new ErroHttp(404, "Processo não encontrado.");
  }
  if (ESTADOS_TERMINAIS.includes(processo.estado)) {
    throw new ErroHttp(
      409,
      `Processo em estado terminal (${ROTULOS_ESTADO[processo.estado]}) é imutável.`
    );
  }
  return processo;
}

async function auditarTransicao(
  cliente: PoolClient,
  sessao: PayloadSessao,
  processoId: number,
  de: EstadoProcesso,
  para: EstadoProcesso,
  diffExtra: Diff = {}
): Promise<void> {
  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "transicao",
    tabela: TABELA_PROCESSO,
    registroId: String(processoId),
    diff: {
      Estado: { de: ROTULOS_ESTADO[de], para: ROTULOS_ESTADO[para] },
      ...diffExtra,
    },
  });
}

export async function avancarProcesso(
  sessao: PayloadSessao,
  id: number
): Promise<ProcessoResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoAtivo(cliente, id);
    const proximo = PROXIMO_ESTADO[processo.estado];
    if (!proximo) {
      throw new ErroHttp(
        409,
        "Deste estado o processo só encerra ou cancela — não há próximo passo."
      );
    }
    await atualizarEstado(cliente, id, proximo);
    await auditarTransicao(cliente, sessao, id, processo.estado, proximo);
  });
  return resumoApos(id);
}

export async function cancelarProcesso(
  sessao: PayloadSessao,
  id: number,
  motivo: string
): Promise<ProcessoResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoAtivo(cliente, id);
    await atualizarEstado(cliente, id, "cancelado");
    await auditarTransicao(cliente, sessao, id, processo.estado, "cancelado", {
      "Motivo do cancelamento": { de: null, para: motivo },
    });
    await inserirEvento(cliente, {
      colaborador_id: processo.colaborador_id,
      tipo: "desligamento_cancelado",
      ocorrido_em: new Date().toISOString(),
      origem_tabela: TABELA_PROCESSO,
      origem_id: id,
      resumo: `Processo de desligamento (${processo.tipo_nome}) cancelado antes da efetivação`,
      payload: { restrita: true },
      registrado_por: sessao.usuario_id,
    });
  });
  return resumoApos(id);
}

/**
 * Efetivação: TUDO na mesma transação — estado do processo, colaborador
 * desligado com data, usuário desativado e evento na linha do tempo.
 * Trava do KPI: não encerra com entrevista pendente (o banco também garante).
 */
export async function encerrarProcessoDesligamento(
  sessao: PayloadSessao,
  id: number,
  dados: CorpoEncerrar
): Promise<ProcessoResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoAtivo(cliente, id);
    if (processo.estado !== "em_acerto") {
      throw new ErroHttp(
        409,
        `O encerramento só acontece a partir de "Em acerto" (estado atual: ${ROTULOS_ESTADO[processo.estado]}).`
      );
    }
    const entrevista = await buscarEntrevistaParaTransicao(cliente, id);
    if (processo.elegivel_entrevista && !entrevista) {
      throw new ErroHttp(
        409,
        "Tipo elegível sem entrevista ofertada — abra um novo processo (inconsistência)."
      );
    }
    if (
      entrevista &&
      !STATUS_TERMINAIS_ENTREVISTA.includes(entrevista.status)
    ) {
      throw new ErroHttp(
        409,
        `O processo não encerra com a entrevista pendente (status atual: ${ROTULOS_STATUS_ENTREVISTA[entrevista.status]}). Registre o desfecho — realizada, recusada ou não realizada com motivo.`
      );
    }

    await encerrarProcesso(cliente, id, dados.data_termino_efetiva);
    await auditarTransicao(cliente, sessao, id, processo.estado, "encerrado", {
      "Término efetivo": {
        de: null,
        para: formatarData(dados.data_termino_efetiva),
      },
    });

    const colaborador = await buscarColaboradorParaAtualizar(
      cliente,
      processo.colaborador_id
    );
    if (!colaborador) {
      throw new ErroHttp(500, "Colaborador do processo não encontrado.");
    }
    await atualizarColaborador(cliente, colaborador.id, {
      status: "desligado",
      data_desligamento: dados.data_termino_efetiva,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: "rh.colaborador",
      registroId: String(colaborador.id),
      diff: {
        Status: { de: "Ativo", para: "Desligado" },
        "Data de desligamento": {
          de: null,
          para: formatarData(dados.data_termino_efetiva),
        },
      },
    });

    // LIDERANÇA — encerrada no MESMO ato, nos DOIS papéis.
    // Enquanto a linha de rh.relacao_gestor fica sem fim de vigência, o
    // desligado segue "liderado vigente" (entra no portal do gestor, no
    // organograma e nas consultas de equipe) e segue GESTOR VIGENTE de quem
    // ficou — uma equipe pendurada em quem não trabalha mais aqui, com a
    // aprovação de demanda endereçada a uma conta já desativada.
    //
    // DECISÃO SOBRE OS ÓRFÃOS (explícita, não implícita): encerra e EXIGE novo
    // gestor. Subir a equipe automaticamente para o gestor do gestor daria a um
    // terceiro, por efeito colateral, acesso à ficha, ao ponto e à aprovação de
    // gente que ninguém o designou para liderar — autorização nunca nasce de
    // efeito colateral aqui. Quem ficou sem gestor vira raiz no organograma, o
    // ato de designar continua sendo do DP (tela de colaboradores) e o fato não
    // fica mudo: entra na trilha e na linha do tempo de cada um.
    const liderancas = await relacoesLiderancaAbertas(
      cliente,
      processo.colaborador_id
    );
    const orfaos = liderancas.filter((relacao) => relacao.papel === "gestor");
    const gestorDele = liderancas.find(
      (relacao) => relacao.papel === "liderado"
    );
    for (const relacao of liderancas) {
      await encerrarLiderancaNoDesligamento(
        cliente,
        relacao.id,
        dados.data_termino_efetiva
      );
    }
    if (liderancas.length > 0) {
      const diffLideranca: Diff = {};
      if (gestorDele) {
        diffLideranca["Liderado por"] = {
          de: gestorDele.contraparte_nome,
          para: `Encerrado em ${formatarData(dados.data_termino_efetiva)}`,
        };
      }
      if (orfaos.length > 0) {
        diffLideranca["Equipe que liderava (ficou sem gestor)"] = {
          de: orfaos.map((relacao) => relacao.contraparte_nome).join("; "),
          para: `${orfaos.length} pessoa(s) aguardando novo gestor — designar em Colaboradores`,
        };
      }
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "desligamento.lideranca",
        tabela: "rh.relacao_gestor",
        registroId: `colaborador:${processo.colaborador_id}`,
        diff: diffLideranca,
      });
    }
    // Na ficha de cada órfão, para o DP achar sem varrer auditoria.
    for (const relacao of orfaos) {
      await inserirEvento(cliente, {
        colaborador_id: relacao.contraparte_id,
        tipo: "lideranca_encerrada",
        ocorrido_em: `${dados.data_termino_efetiva}T00:00:00Z`,
        origem_tabela: TABELA_PROCESSO,
        origem_id: id,
        resumo: `Ficou sem gestor: ${processo.colaborador_nome} foi desligado em ${formatarData(dados.data_termino_efetiva)} — aguardando o DP designar o novo gestor`,
        payload: { gestor_anterior_colaborador_id: processo.colaborador_id },
        registrado_por: sessao.usuario_id,
      });
    }

    // Revogação de acesso na MESMA transação — garantia estrutural.
    // A conta é da PESSOA (0046): `desativarUsuario` só revoga quando não
    // sobra nenhum vínculo em pé, para não trancar quem foi desligado de uma
    // empresa do grupo e segue trabalhando em outra.
    if (
      colaborador.usuario_ativo &&
      (await desativarUsuario(cliente, colaborador.usuario_id))
    ) {
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "atualizacao",
        tabela: "sistema.usuario",
        registroId: String(colaborador.usuario_id),
        diff: { Ativo: { de: "Sim", para: "Não" } },
      });
    }

    // ACERTO DO BANCO DE HORAS — na MESMA transação que encerra o contrato.
    // `tratamento_rescisao` é parâmetro da regra de banco (empresa → unidade ou
    // cargo → pessoa) e até aqui não era lido por linha de código nenhuma: o
    // contrato terminava e o saldo ficava lá, intacto e mudo. Quem decide o que
    // fazer é o domínio de ponto (ver liquidarBancoNaRescisao) — aqui só se
    // registra o que ele decidiu, com o número, na trilha do desligamento.
    const acerto = await liquidarBancoNaRescisao(
      cliente,
      sessao.usuario_id,
      processo.colaborador_id,
      dados.data_termino_efetiva
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "desligamento.banco_horas",
      tabela: "rh.banco_horas_movimento",
      registroId: acerto.movimento_id
        ? String(acerto.movimento_id)
        : `colaborador:${processo.colaborador_id}`,
      diff: {
        "Saldo do banco de horas no desligamento": {
          de: null,
          para: acerto.resumo,
        },
        "Tratamento na rescisão (regra vigente)": {
          de: null,
          para: acerto.tratamento,
        },
      },
    });

    await inserirEvento(cliente, {
      colaborador_id: processo.colaborador_id,
      tipo: "desligamento",
      ocorrido_em: `${dados.data_termino_efetiva}T00:00:00Z`,
      origem_tabela: TABELA_PROCESSO,
      origem_id: id,
      resumo: `Desligamento de ${processo.colaborador_nome} (matrícula ${processo.colaborador_matricula}) em ${formatarData(dados.data_termino_efetiva)} — ${processo.tipo_nome}`,
      payload: { data_desligamento: dados.data_termino_efetiva },
      registrado_por: sessao.usuario_id,
    });
  });
  return resumoApos(id);
}

// ------------------------------------------------------------------ devoluções

export async function adicionarItemDevolucao(
  sessao: PayloadSessao,
  processoId: number,
  dados: NovoItem
): Promise<ItemDevolucao[]> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    await exigirProcessoAtivo(cliente, processoId);
    // A categoria vem do catálogo, e o servidor reconfere: chave que não existe
    // ou que foi inativada é recusada aqui, antes da FK e do trigger da 0054.
    const categoria = await buscarCategoriaPorChave(cliente, dados.categoria);
    if (!categoria) {
      throw new ErroHttpCampo(
        400,
        "Categoria de devolução inexistente.",
        "categoria"
      );
    }
    if (!categoria.ativa) {
      throw new ErroHttpCampo(
        409,
        `A categoria "${categoria.nome}" está inativa — escolha uma ativa.`,
        "categoria"
      );
    }
    const itemId = await inserirItem(cliente, {
      processo_id: processoId,
      categoria: categoria.chave,
      descricao: dados.descricao,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_ITEM,
      registroId: String(itemId),
      diff: {
        Processo: { de: null, para: String(processoId) },
        Categoria: { de: null, para: categoria.nome },
        "Descrição": { de: null, para: dados.descricao },
        Status: { de: null, para: ROTULOS_STATUS_ITEM.pendente },
      },
    });
  });
  return listarItens(processoId);
}

export async function atualizarItemDevolucao(
  sessao: PayloadSessao,
  processoId: number,
  itemId: number,
  dados: CorpoStatusItem
): Promise<ItemDevolucao[]> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    await exigirProcessoAtivo(cliente, processoId);
    const item = await buscarItemParaAtualizar(cliente, processoId, itemId);
    if (!item) {
      throw new ErroHttp(404, "Item de devolução não encontrado.");
    }
    if (item.status === dados.status) {
      return;
    }
    await atualizarStatusItem(cliente, itemId, dados.status);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_ITEM,
      registroId: String(itemId),
      diff: {
        Item: {
          de: null,
          para: `${item.categoria_nome} — ${item.descricao}`,
        },
        Status: {
          de: ROTULOS_STATUS_ITEM[item.status],
          para: ROTULOS_STATUS_ITEM[dados.status],
        },
      },
    });
  });
  return listarItens(processoId);
}

// ------------------------------------------------------------------ catálogo de categorias de devolução (0054)
// A lista que era CHECK de sete valores no banco. Carro, desktop e tablet não
// cabiam nela; agora categoria nova é ato de tela, com trilha, e o que sai de
// circulação é INATIVADO — nunca apagado, porque a chave está gravada em item
// de devolução de processo já encerrado.

export interface CatalogoCategorias {
  pode_administrar: boolean;
  categorias: CategoriaDevolucao[];
}

/**
 * Quem administra vê inclusive as inativas (para reativar); quem só gere itens
 * recebe apenas as ativas, que é o que o seletor pode oferecer.
 */
export async function obterCatalogoCategorias(
  sessao: PayloadSessao
): Promise<CatalogoCategorias> {
  const podeAdministrar = await temPermissao(
    sessao.usuario_id,
    CHAVE_CATEGORIA_ADMIN
  );
  return {
    pode_administrar: podeAdministrar,
    categorias: await listarCategoriasDevolucao(!podeAdministrar),
  };
}

export async function criarCategoriaDevolucao(
  sessao: PayloadSessao,
  dados: NomeCategoria
): Promise<CategoriaDevolucao[]> {
  const chave = chaveDeNome(dados.nome);
  if (chave === "") {
    throw new ErroHttpCampo(
      400,
      "O nome precisa ter ao menos uma letra ou número.",
      "nome"
    );
  }
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      const id = await inserirCategoriaDevolucao(cliente, {
        chave,
        nome: dados.nome,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_CATEGORIA,
        registroId: String(id),
        diff: {
          Nome: { de: null, para: dados.nome },
          Chave: { de: null, para: chave },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "categoria_devolucao_chave_key") {
      const existente = await listarCategoriasDevolucao(false);
      const igual = existente.find((categoria) => categoria.chave === chave);
      throw new ErroHttpCampo(
        409,
        igual && !igual.ativa
          ? `Já existe a categoria "${igual.nome}", hoje inativa — reative em vez de criar outra.`
          : `Já existe uma categoria com esse nome ("${igual?.nome ?? dados.nome}").`,
        "nome"
      );
    }
    throw erro;
  }
  return listarCategoriasDevolucao(false);
}

/** Renomear mexe só no rótulo: a chave é a identidade e o histórico segue nela. */
export async function renomearCategoria(
  sessao: PayloadSessao,
  id: number,
  dados: NomeCategoria
): Promise<CategoriaDevolucao[]> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const categoria = await buscarCategoriaParaAtualizar(cliente, id);
    if (!categoria) {
      throw new ErroHttp(404, "Categoria não encontrada.");
    }
    if (categoria.nome === dados.nome) return;
    await renomearCategoriaDevolucao(cliente, id, dados.nome);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "edicao",
      tabela: TABELA_CATEGORIA,
      registroId: String(id),
      diff: { Nome: { de: categoria.nome, para: dados.nome } },
    });
  });
  return listarCategoriasDevolucao(false);
}

/**
 * Inativar/reativar — o lugar da exclusão. Item já gravado com a categoria
 * continua valendo, continua editável e continua aparecendo com o nome dela;
 * o que muda é que ela some do seletor de itens NOVOS.
 */
export async function definirCategoriaInativa(
  sessao: PayloadSessao,
  id: number,
  inativa: boolean
): Promise<CategoriaDevolucao[]> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const categoria = await buscarCategoriaParaAtualizar(cliente, id);
    if (!categoria) {
      throw new ErroHttp(404, "Categoria não encontrada.");
    }
    if (inativa === !categoria.ativa) return;
    await definirInativacaoCategoria(
      cliente,
      id,
      inativa ? sessao.usuario_id : null
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "edicao",
      tabela: TABELA_CATEGORIA,
      registroId: String(id),
      diff: {
        Categoria: { de: null, para: categoria.nome },
        "Situação": {
          de: inativa ? "ativa" : "inativa",
          para: inativa ? "inativa" : "ativa",
        },
      },
    });
  });
  return listarCategoriasDevolucao(false);
}

// ------------------------------------------------------------------ entrevista

async function exigirEntrevistaAberta(
  cliente: PoolClient,
  processoId: number
): Promise<{
  id: number;
  roteiro_versao_id: number;
  status: "oferecida" | "agendada";
}> {
  await exigirProcessoAtivo(cliente, processoId);
  const entrevista = await buscarEntrevistaParaTransicao(cliente, processoId);
  if (!entrevista) {
    throw new ErroHttp(
      404,
      "Este processo não tem entrevista (tipo não elegível)."
    );
  }
  if (entrevista.status !== "oferecida" && entrevista.status !== "agendada") {
    throw new ErroHttp(
      409,
      `A entrevista já tem desfecho registrado (${ROTULOS_STATUS_ENTREVISTA[entrevista.status]}).`
    );
  }
  return { ...entrevista, status: entrevista.status };
}

async function auditarEntrevista(
  cliente: PoolClient,
  sessao: PayloadSessao,
  entrevistaId: number,
  de: string,
  para: string,
  diffExtra: Diff = {}
): Promise<void> {
  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "transicao",
    tabela: TABELA_ENTREVISTA,
    registroId: String(entrevistaId),
    diff: { Status: { de, para }, ...diffExtra },
  });
}

export async function agendarEntrevistaProcesso(
  sessao: PayloadSessao,
  processoId: number,
  dados: CorpoAgendarEntrevista
): Promise<EntrevistaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const entrevista = await exigirEntrevistaAberta(cliente, processoId);
    await agendarEntrevista(cliente, entrevista.id, dados.data_agendada);
    await auditarEntrevista(
      cliente,
      sessao,
      entrevista.id,
      ROTULOS_STATUS_ENTREVISTA[entrevista.status],
      ROTULOS_STATUS_ENTREVISTA.agendada,
      { "Data agendada": { de: null, para: formatarData(dados.data_agendada) } }
    );
  });
  return entrevistaApos(processoId);
}

export async function realizarEntrevistaProcesso(
  sessao: PayloadSessao,
  processoId: number,
  dados: CorpoRealizarEntrevista
): Promise<EntrevistaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoAtivo(cliente, processoId);
    const entrevista = await exigirEntrevistaAberta(cliente, processoId);
    // Conduzida por RH/DP — nunca pelo gestor vigente de quem está saindo.
    if (
      await ehGestorDoColaborador(
        cliente,
        sessao.usuario_id,
        processo.colaborador_id
      )
    ) {
      throw new ErroHttp(
        403,
        "O gestor do colaborador não conduz a entrevista de desligamento."
      );
    }

    const respostas: Respostas = {};
    for (const [chave, valor] of Object.entries(dados.respostas)) {
      if (typeof valor === "string") {
        if (valor.trim() === "") continue;
        respostas[chave] = valor.trim();
      } else {
        respostas[chave] = valor;
      }
    }
    const perguntas = await buscarPerguntasDoRoteiro(
      cliente,
      entrevista.roteiro_versao_id
    );
    const problema = validarRespostas(perguntas, respostas);
    if (problema) {
      throw new ErroHttpCampo(400, problema, "respostas");
    }

    const dataRealizacao = dados.data_realizacao ?? hojeSaoPaulo();
    await registrarEntrevistaRealizada(cliente, entrevista.id, {
      data_realizacao: dataRealizacao,
      respostas,
      entrevistador_usuario_id: sessao.usuario_id,
      consentimento_uso_agregado: dados.consentimento_uso_agregado,
    });
    // Diff SEM respostas — conteúdo é restrito, auditoria registra só o fato.
    await auditarEntrevista(
      cliente,
      sessao,
      entrevista.id,
      ROTULOS_STATUS_ENTREVISTA[entrevista.status],
      ROTULOS_STATUS_ENTREVISTA.realizada,
      {
        "Data de realização": { de: null, para: formatarData(dataRealizacao) },
        Entrevistador: { de: null, para: sessao.nome },
        "Consentimento para uso agregado": {
          de: null,
          para: dados.consentimento_uso_agregado ? "Sim" : "Não",
        },
      }
    );
  });
  return entrevistaApos(processoId);
}

export async function recusarEntrevistaProcesso(
  sessao: PayloadSessao,
  processoId: number
): Promise<EntrevistaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const entrevista = await exigirEntrevistaAberta(cliente, processoId);
    await recusarEntrevista(cliente, entrevista.id);
    await auditarEntrevista(
      cliente,
      sessao,
      entrevista.id,
      ROTULOS_STATUS_ENTREVISTA[entrevista.status],
      ROTULOS_STATUS_ENTREVISTA.recusada
    );
  });
  return entrevistaApos(processoId);
}

export async function naoRealizarEntrevistaProcesso(
  sessao: PayloadSessao,
  processoId: number,
  motivo: string
): Promise<EntrevistaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const entrevista = await exigirEntrevistaAberta(cliente, processoId);
    await registrarEntrevistaNaoRealizada(cliente, entrevista.id, motivo);
    await auditarEntrevista(
      cliente,
      sessao,
      entrevista.id,
      ROTULOS_STATUS_ENTREVISTA[entrevista.status],
      ROTULOS_STATUS_ENTREVISTA.nao_realizada,
      { "Motivo da não realização": { de: null, para: motivo } }
    );
  });
  return entrevistaApos(processoId);
}

async function entrevistaApos(processoId: number): Promise<EntrevistaResumo> {
  const entrevista = await buscarEntrevista(processoId);
  if (!entrevista) {
    throw new ErroHttp(500, "Falha ao recarregar a entrevista.");
  }
  return entrevista;
}

// ------------------------------------------------------------------ respostas (dado restrito)

export interface RespostasEntrevista {
  entrevista_id: number;
  perguntas: { chave: string; texto: string; tipo: string }[];
  respostas: Respostas;
}

export async function obterRespostasEntrevista(
  sessao: PayloadSessao,
  processoId: number
): Promise<RespostasEntrevista> {
  const dados = await buscarRespostas(processoId);
  if (!dados) {
    throw new ErroHttp(404, "Este processo não tem entrevista.");
  }
  if (dados.status !== "realizada" || dados.respostas === null) {
    throw new ErroHttp(
      409,
      "A entrevista ainda não tem respostas registradas."
    );
  }
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "entrevista.respostas.ver",
    recurso: "entrevista.respostas",
    registroId: String(dados.entrevista_id),
  });
  return {
    entrevista_id: dados.entrevista_id,
    perguntas: dados.perguntas.map((pergunta) => ({
      chave: pergunta.chave,
      texto: pergunta.texto,
      tipo: pergunta.tipo,
    })),
    respostas: dados.respostas,
  };
}
