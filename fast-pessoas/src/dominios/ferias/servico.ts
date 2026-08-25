import { PoolClient } from "pg";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { mensagemSemFicha } from "../../lib/ficha-de-colaborador";
import { ErroHttpCampo } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { inserirEvento } from "../colaboradores/repositorio";
import {
  buscarTipoAtivo,
  criar as criarDemandaRegistro,
  inserirTransicao,
  buscarParaTransicao,
  atualizarStatus as atualizarStatusDemanda,
} from "../demandas/repositorio";
import {
  formatarNumeroDemanda,
  ROTULOS_STATUS_DEMANDA,
  StatusDemanda,
} from "../demandas/esquemas";
import { PayloadSessao } from "../identidade/esquemas";
import { notificar } from "../notificacoes/servico";
import { adicionarDias, periodosFaltantes } from "./calculo";
import {
  CriacaoProgramacao,
  nivelAlerta,
  ROTULOS_STATUS_PERIODO,
  ROTULOS_STATUS_PROGRAMACAO,
  StatusPeriodo,
} from "./esquemas";
import {
  atualizarGozoPeriodo,
  atualizarStatusProgramacao,
  buscarColaborador,
  buscarPeriodoParaAtualizar,
  buscarProgramacaoResumo,
  buscarProgramacaoParaAtualizar,
  colaboradorDoUsuario,
  contarPeriodosVencidos,
  diasSolicitadosNoPeriodo,
  existePeriodoParaVencer,
  existeSobreposicao,
  travarProgramacoesDoColaborador,
  inserirPeriodosEmLote,
  inserirProgramacao,
  LinhaPainelVencimento,
  listarColaboradoresNaoDesligados,
  listarIniciosExistentes,
  listarParaSincronizar,
  listarPeriodos,
  listarPeriodosPainel,
  listarProgramacoesDoColaborador,
  listarProgramacoesSolicitadas,
  marcarPeriodosVencidos,
  PeriodoAquisitivo,
  ProgramacaoParaAtualizar,
  ProgramacaoResumo,
  temPermissao,
  usuarioDoColaborador,
} from "./repositorio";

const TABELA_PERIODO = "rh.periodo_aquisitivo";
const TABELA_PROGRAMACAO = "rh.programacao_ferias";
const TABELA_DEMANDA = "rh.demanda";
const CHAVE_TIPO_DEMANDA = "programacao_ferias";
// 30 dias de direito por período: default saldo_dias da tabela (migração 0007).

// ------------------------------------------------------------------ datas (UTC no banco, SP na régua)

function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ------------------------------------------------------------------ geração lazy de períodos

/**
 * Gerador lazy: na consulta, cria os períodos aquisitivos que faltam até hoje
 * e marca como vencidos os que estouraram o limite concessivo. Idempotente —
 * só abre transação quando há o que fazer. A régua (quais períodos são
 * esperados e quais faltam) é o motor puro de ./calculo, com teste unitário
 * em tests/ferias.test.ts.
 */
async function garantirPeriodos(
  sessao: PayloadSessao,
  colaboradores: { id: number; data_admissao: string }[],
  escopoColaboradorId: number | null
): Promise<void> {
  if (colaboradores.length === 0) return;
  const hoje = hojeSaoPaulo();
  const existentes = await listarIniciosExistentes(
    colaboradores.map((colaborador) => colaborador.id)
  );
  const faltantes = periodosFaltantes(colaboradores, existentes, hoje);
  const haVencimentos = await existePeriodoParaVencer(escopoColaboradorId);
  if (faltantes.length === 0 && !haVencimentos) return;

  await comTransacao(sessao.usuario_id, async (cliente) => {
    // Um só INSERT em lote (ON CONFLICT DO NOTHING preservado): volta apenas as
    // linhas de fato criadas — as em conflito (outra sessão criou no meio) não
    // voltam —, então cada retorno é uma geração real a auditar.
    const criados = await inserirPeriodosEmLote(cliente, faltantes);
    for (const periodo of criados) {
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "geracao",
        tabela: TABELA_PERIODO,
        registroId: String(periodo.id),
        diff: {
          "Período aquisitivo": {
            de: null,
            para: `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
          },
          "Limite concessivo": {
            de: null,
            para: formatarData(periodo.limite_concessivo),
          },
          "Situação": { de: null, para: ROTULOS_STATUS_PERIODO[periodo.status] },
        },
      });
    }
    const vencidos = await marcarPeriodosVencidos(cliente, escopoColaboradorId);
    for (const vencido of vencidos) {
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "vencimento",
        tabela: TABELA_PERIODO,
        registroId: String(vencido.id),
        diff: {
          "Situação": {
            de: ROTULOS_STATUS_PERIODO[vencido.status_antigo],
            para: ROTULOS_STATUS_PERIODO.vencido,
          },
        },
      });
    }
  });
}

// ------------------------------------------------------------------ aprovação (efeito no domínio)

async function aplicarAprovacao(
  cliente: PoolClient,
  programacao: ProgramacaoParaAtualizar,
  decisorUsuarioId: number,
  decisorPapel: string,
  via: string
): Promise<void> {
  await atualizarStatusProgramacao(cliente, programacao.id, "aprovada");
  const periodo = await buscarPeriodoParaAtualizar(
    cliente,
    programacao.periodo_aquisitivo_id
  );
  if (!periodo) {
    throw new ErroHttp(500, "Período aquisitivo da programação não existe.");
  }
  const novoGozado =
    periodo.dias_gozados + programacao.dias + programacao.abono_dias;
  const novoStatus: StatusPeriodo =
    novoGozado >= periodo.saldo_dias
      ? "gozado"
      : periodo.status === "vencido"
        ? "vencido"
        : "programado_parcial";
  await atualizarGozoPeriodo(cliente, periodo.id, novoGozado, novoStatus);

  await registrarAlteracao(cliente, {
    usuarioId: decisorUsuarioId,
    papel: decisorPapel,
    acao: "aprovacao",
    tabela: TABELA_PROGRAMACAO,
    registroId: String(programacao.id),
    diff: {
      Status: {
        de: ROTULOS_STATUS_PROGRAMACAO.solicitada,
        para: ROTULOS_STATUS_PROGRAMACAO.aprovada,
      },
      Via: { de: null, para: via },
    },
  });
  await registrarAlteracao(cliente, {
    usuarioId: decisorUsuarioId,
    papel: decisorPapel,
    acao: "atualizacao",
    tabela: TABELA_PERIODO,
    registroId: String(periodo.id),
    diff: {
      "Dias gozados/programados": {
        de: String(periodo.dias_gozados),
        para: String(novoGozado),
      },
      "Situação": {
        de: ROTULOS_STATUS_PERIODO[periodo.status],
        para: ROTULOS_STATUS_PERIODO[novoStatus],
      },
    },
  });

  const abono =
    programacao.abono_dias > 0
      ? ` + ${programacao.abono_dias} dia(s) de abono`
      : "";
  await inserirEvento(cliente, {
    colaborador_id: programacao.colaborador_id,
    tipo: "ferias_programadas",
    ocorrido_em: new Date().toISOString(),
    origem_tabela: TABELA_PROGRAMACAO,
    origem_id: programacao.id,
    resumo: `Férias programadas: ${formatarData(programacao.inicio)} a ${formatarData(programacao.fim)} (${programacao.dias} dia(s) de gozo${abono})`,
    payload: {
      dias: programacao.dias,
      abono_dias: programacao.abono_dias,
      inicio: programacao.inicio,
      fim: programacao.fim,
    },
    registrado_por: decisorUsuarioId,
  });

  // Aviso neutro ao solicitante — vale para os dois caminhos de aprovação
  // (demanda do gestor sincronizada e exceção do DP/RH).
  const solicitanteUsuarioId = await usuarioDoColaborador(
    cliente,
    programacao.colaborador_id
  );
  if (
    solicitanteUsuarioId !== null &&
    solicitanteUsuarioId !== decisorUsuarioId
  ) {
    await notificar(cliente, {
      usuarioId: solicitanteUsuarioId,
      tipo: "ferias.programacao_aprovada",
      titulo: "Programação de férias aprovada",
      corpo: `Sua programação de férias de ${formatarData(programacao.inicio)} a ${formatarData(programacao.fim)} foi aprovada.`,
      link: "/ferias",
    });
  }
}

/**
 * Reflexo do motor de demandas na programação (lazy, na consulta): demanda
 * aprovada pelo gestor → programação 'aprovada' (com efeito no período);
 * demanda reprovada/recusada → 'recusada'. O decisor auditado é quem moveu
 * a demanda, não quem disparou a sincronização.
 */
async function sincronizarComDemandas(
  sessao: PayloadSessao,
  escopoColaboradorId: number | null
): Promise<void> {
  const pendentes = await listarParaSincronizar(escopoColaboradorId);
  if (pendentes.length === 0) return;
  await comTransacao(sessao.usuario_id, async (cliente) => {
    for (const pendente of pendentes) {
      const programacao = await buscarProgramacaoParaAtualizar(
        cliente,
        pendente.id
      );
      if (!programacao || programacao.status !== "solicitada") continue;
      const decisorId = pendente.decisor_usuario_id ?? sessao.usuario_id;
      const decisorPapel = pendente.decisor_papel ?? sessao.papel;
      if (pendente.demanda_status === "recusada") {
        await atualizarStatusProgramacao(cliente, programacao.id, "recusada");
        await registrarAlteracao(cliente, {
          usuarioId: decisorId,
          papel: decisorPapel,
          acao: "recusa",
          tabela: TABELA_PROGRAMACAO,
          registroId: String(programacao.id),
          diff: {
            Status: {
              de: ROTULOS_STATUS_PROGRAMACAO.solicitada,
              para: ROTULOS_STATUS_PROGRAMACAO.recusada,
            },
            Via: { de: null, para: "reprovação na demanda vinculada" },
          },
        });
      } else {
        await aplicarAprovacao(
          cliente,
          programacao,
          decisorId,
          decisorPapel,
          "aprovação do gestor na demanda vinculada"
        );
      }
    }
  });
}

// ------------------------------------------------------------------ visão

export interface PainelFerias {
  totais: {
    vencidas: number;
    ate_30: number;
    ate_60: number;
    ate_90: number;
  };
  linhas: LinhaPainelVencimento[];
  solicitadas: ProgramacaoResumo[];
}

export interface VisaoFerias {
  pode: { administrar: boolean };
  colaborador_id: number | null;
  saldo_total: number;
  periodos: PeriodoAquisitivo[];
  programacoes: ProgramacaoResumo[];
  painel: PainelFerias | null;
}

export async function montarVisao(sessao: PayloadSessao): Promise<VisaoFerias> {
  const administrar = await temPermissao(
    sessao.usuario_id,
    "ferias.administrar"
  );
  const colaboradorId = await colaboradorDoUsuario(sessao.usuario_id);

  if (administrar) {
    await garantirPeriodos(
      sessao,
      await listarColaboradoresNaoDesligados(),
      null
    );
    await sincronizarComDemandas(sessao, null);
  } else if (colaboradorId !== null) {
    const colaborador = await buscarColaborador(colaboradorId);
    if (colaborador) {
      await garantirPeriodos(
        sessao,
        [{ id: colaborador.id, data_admissao: colaborador.data_admissao }],
        colaboradorId
      );
    }
    await sincronizarComDemandas(sessao, colaboradorId);
  }

  const periodos =
    colaboradorId !== null ? await listarPeriodos(colaboradorId) : [];
  const programacoes =
    colaboradorId !== null
      ? await listarProgramacoesDoColaborador(colaboradorId)
      : [];
  const saldoTotal = periodos
    .filter((periodo) => periodo.status !== "gozado")
    .reduce(
      (total, periodo) => total + (periodo.saldo_dias - periodo.dias_gozados),
      0
    );

  let painel: PainelFerias | null = null;
  if (administrar) {
    const linhas = await listarPeriodosPainel();
    const totais = { vencidas: 0, ate_30: 0, ate_60: 0, ate_90: 0 };
    for (const linha of linhas) {
      const nivel = nivelAlerta(linha.dias_ate_limite);
      if (nivel === "vencida") totais.vencidas += 1;
      else if (nivel === "ate_30") totais.ate_30 += 1;
      else if (nivel === "ate_60") totais.ate_60 += 1;
      else if (nivel === "ate_90") totais.ate_90 += 1;
    }
    painel = {
      totais,
      linhas,
      solicitadas: await listarProgramacoesSolicitadas(),
    };
  }

  return {
    pode: { administrar },
    colaborador_id: colaboradorId,
    saldo_total: saldoTotal,
    periodos,
    programacoes,
    painel,
  };
}

// ------------------------------------------------------------------ programar

export async function criarProgramacao(
  sessao: PayloadSessao,
  dados: CriacaoProgramacao
): Promise<ProgramacaoResumo> {
  const colaboradorId = await colaboradorDoUsuario(sessao.usuario_id);
  if (colaboradorId === null) {
    throw new ErroHttp(409, await mensagemSemFicha(sessao.usuario_id));
  }
  const colaborador = await buscarColaborador(colaboradorId);
  if (!colaborador) {
    throw new ErroHttp(409, "Ficha de colaborador não encontrada.");
  }
  await garantirPeriodos(
    sessao,
    [{ id: colaboradorId, data_admissao: colaborador.data_admissao }],
    colaboradorId
  );

  const hoje = hojeSaoPaulo();
  if (dados.inicio <= hoje) {
    throw new ErroHttpCampo(
      400,
      "O início do gozo precisa ser uma data futura.",
      "inicio"
    );
  }
  const tipo = await buscarTipoAtivo(CHAVE_TIPO_DEMANDA);
  if (!tipo) {
    throw new ErroHttp(
      500,
      "Tipo de demanda 'programacao_ferias' não está ativo — verifique a migração 0007."
    );
  }

  const fimGozo = adicionarDias(dados.inicio, dados.dias - 1);

  const programacaoId = await comTransacao(
    sessao.usuario_id,
    async (cliente) => {
      // Trava por colaborador ANTES de checar sobreposição: sem ela,
      // criarProgramacao só travava o PERÍODO escolhido, então duas criações em
      // períodos diferentes do mesmo colaborador não se enxergavam e podiam
      // gravar férias sobrepostas (dois cliques / duas abas).
      await travarProgramacoesDoColaborador(cliente, colaboradorId);
      const periodo = await buscarPeriodoParaAtualizar(
        cliente,
        dados.periodo_aquisitivo_id
      );
      if (!periodo || periodo.colaborador_id !== colaboradorId) {
        throw new ErroHttpCampo(
          400,
          "Período aquisitivo não encontrado.",
          "periodo_aquisitivo_id"
        );
      }
      if (periodo.status === "gozado") {
        throw new ErroHttpCampo(
          400,
          "Este período aquisitivo já foi totalmente gozado.",
          "periodo_aquisitivo_id"
        );
      }
      const solicitados = await diasSolicitadosNoPeriodo(cliente, periodo.id);
      const disponivel =
        periodo.saldo_dias - periodo.dias_gozados - solicitados;
      if (dados.dias + dados.abono_dias > disponivel) {
        throw new ErroHttpCampo(
          400,
          `Saldo insuficiente neste período: restam ${disponivel} dia(s) disponíveis (contando programações pendentes).`,
          "dias"
        );
      }
      if (
        await existeSobreposicao(cliente, colaboradorId, dados.inicio, fimGozo)
      ) {
        throw new ErroHttpCampo(
          409,
          "As datas conflitam com outra programação ativa de férias.",
          "inicio"
        );
      }

      const statusInicial: StatusDemanda = tipo.exige_aprovacao_gestor
        ? "aguardando_aprovacao"
        : "aberta";
      const abono =
        dados.abono_dias > 0
          ? ` + ${dados.abono_dias} dia(s) de abono pecuniário`
          : "";
      const descricao =
        `Programação de férias de ${formatarData(dados.inicio)} a ` +
        `${formatarData(fimGozo)} — ${dados.dias} dia(s) de gozo${abono}. ` +
        `Período aquisitivo ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}.`;
      const demanda = await criarDemandaRegistro(cliente, {
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

      const id = await inserirProgramacao(cliente, {
        colaborador_id: colaboradorId,
        periodo_aquisitivo_id: periodo.id,
        inicio: dados.inicio,
        dias: dados.dias,
        abono_dias: dados.abono_dias,
        demanda_id: demanda.id,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_PROGRAMACAO,
        registroId: String(id),
        diff: {
          "Período aquisitivo": {
            de: null,
            para: `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`,
          },
          Gozo: {
            de: null,
            para: `${formatarData(dados.inicio)} a ${formatarData(fimGozo)} (${dados.dias} dias)`,
          },
          Abono: { de: null, para: `${dados.abono_dias} dia(s)` },
          Status: { de: null, para: ROTULOS_STATUS_PROGRAMACAO.solicitada },
          Demanda: { de: null, para: formatarNumeroDemanda(demanda.numero) },
        },
      });
      return id;
    }
  );

  const resumo = await buscarProgramacaoResumo(programacaoId);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao carregar a programação criada.");
  }
  return resumo;
}

// ------------------------------------------------------------------ aprovação de exceção (DP/RH)

export async function aprovarExcecao(
  sessao: PayloadSessao,
  programacaoId: number
): Promise<ProgramacaoResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const programacao = await buscarProgramacaoParaAtualizar(
      cliente,
      programacaoId
    );
    if (!programacao) {
      throw new ErroHttp(404, "Programação não encontrada.");
    }
    if (programacao.status !== "solicitada") {
      throw new ErroHttp(409, "Esta programação não está aguardando decisão.");
    }
    // Reflete também na demanda vinculada, para o histórico contar uma só verdade.
    if (programacao.demanda_id !== null) {
      const demanda = await buscarParaTransicao(
        cliente,
        programacao.demanda_id
      );
      // Se o gestor JÁ decidiu a demanda (recusou ou concluiu), aprovar a
      // exceção por cima anulava a decisão dele em silêncio: a programação
      // virava 'aprovada' e o período era consumido, com o histórico contando
      // duas verdades. Recusa 409 em vez de sobrescrever.
      if (
        demanda &&
        (demanda.status === "recusada" || demanda.status === "concluida")
      ) {
        throw new ErroHttp(
          409,
          "A demanda vinculada já foi decidida (recusada/concluída) — não se aprova a exceção por cima."
        );
      }
      if (demanda && demanda.status === "aguardando_aprovacao") {
        await atualizarStatusDemanda(cliente, demanda.id, "aberta");
        await inserirTransicao(cliente, {
          demanda_id: demanda.id,
          de_status: "aguardando_aprovacao",
          para_status: "aberta",
          por_usuario_id: sessao.usuario_id,
          motivo: "Aprovação de exceção pelo DP/RH (ferias.administrar)",
        });
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "transicao",
          tabela: TABELA_DEMANDA,
          registroId: String(demanda.id),
          diff: {
            Status: {
              de: ROTULOS_STATUS_DEMANDA.aguardando_aprovacao,
              para: ROTULOS_STATUS_DEMANDA.aberta,
            },
            Motivo: {
              de: null,
              para: "Aprovação de exceção pelo DP/RH",
            },
          },
        });
      }
    }
    await aplicarAprovacao(
      cliente,
      programacao,
      sessao.usuario_id,
      sessao.papel,
      "exceção aprovada pelo DP/RH"
    );
  });
  const resumo = await buscarProgramacaoResumo(programacaoId);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao recarregar a programação.");
  }
  return resumo;
}

// ------------------------------------------------------------------ indicador (registry do integrador)

/**
 * Valor do indicador "férias vencidas": quantidade de períodos aquisitivos
 * vencidos (persistidos como vencidos ou com limite concessivo estourado
 * ainda não marcado pelo lazy) de colaboradores não desligados.
 */
export async function valorIndicadorFeriasVencidas(): Promise<number> {
  return contarPeriodosVencidos();
}
