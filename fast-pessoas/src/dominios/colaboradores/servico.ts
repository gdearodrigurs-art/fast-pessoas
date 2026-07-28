import { hash } from "bcryptjs";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { criar as criarUsuario } from "../usuarios/repositorio";
import { gerarSenhaTemporaria } from "../usuarios/servico";
import {
  AtualizacaoAcao,
  AtualizacaoColaborador,
  CADENCIA_FEEDBACK_DIAS,
  CriacaoAcao,
  CriacaoCargo,
  CriacaoColaborador,
  CriacaoEstabelecimento,
  CriacaoFeedback,
  CriacaoOcorrencia,
  CriacaoPosicao,
  DefinicaoGestor,
  DefinicaoLotacao,
  FiltroColaboradores,
  NovaFaixaSalarial,
  NovaVersaoCargo,
  NovaVersaoEstabelecimento,
  ROTULOS_MOTIVO_POSICAO,
  ROTULOS_OCORRENCIA,
  ROTULOS_STATUS,
  ROTULOS_STATUS_ACAO,
  ROTULOS_VINCULO,
} from "./esquemas";
import {
  Acao,
  atualizar,
  atualizarAcao,
  buscarAcaoParaAtualizar,
  buscarBasico,
  buscarCargoVersaoAtiva,
  buscarEstabelecimentoVersaoAtiva,
  buscarFaixaAtivaParaAtualizar,
  buscarFicha,
  buscarLotacaoVigenteParaAtualizar,
  buscarParaAtualizar,
  buscarPosicaoVigenteParaAtualizar,
  buscarRelacaoGestorVigenteParaAtualizar,
  CamposColaborador,
  CargoResumo,
  colaboradorIdDoUsuario,
  colaboradorNoEscopo,
  ColaboradorResumo,
  criar,
  desativarUsuario,
  encerrarFaixaSalarial,
  encerrarLotacao,
  encerrarPosicao,
  encerrarRelacaoGestor,
  encerrarVersaoCargo,
  encerrarVersaoEstabelecimento,
  Escopo,
  EstabelecimentoResumo,
  EventoLinhaTempo,
  existeCargo,
  existeEstabelecimento,
  Feedback,
  FichaColaborador,
  inserirAcao,
  inserirCargo,
  inserirEstabelecimento,
  inserirEvento,
  inserirFaixaSalarial,
  inserirFeedback,
  inserirLotacao,
  inserirOcorrencia,
  inserirPosicao,
  inserirRelacaoGestor,
  inserirVersaoCargo,
  inserirVersaoEstabelecimento,
  listar,
  listarAcoes,
  listarCargos,
  listarEstabelecimentos,
  listarEventos,
  listarFeedbacks,
  listarLotacoes,
  listarOcorrencias,
  listarPosicoes,
  listarRelacoesGestor,
  Lotacao,
  cadenciaFeedback,
  Ocorrencia,
  Posicao,
  registrarLeituraSensivel,
  RelacaoGestor,
  temPermissao,
} from "./repositorio";

const ORIGEM_COLABORADOR = "rh.colaborador";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function truncar(texto: string, limite: number): string {
  return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

// ------------------------------------------------------------------ escopo de visibilidade
// Fonte única do "quem vê quem": rh/dp/diretoria (chave rh.colaborador.ver)
// veem todos; gestor vê a si e aos liderados com relação VIGENTE; quem não tem
// a chave (funcionário) vê apenas a própria ficha.

export async function resolverEscopo(sessao: PayloadSessao): Promise<Escopo> {
  const podeVerTodos = await temPermissao(
    sessao.usuario_id,
    "rh.colaborador.ver"
  );
  if (!podeVerTodos) {
    return {
      alcance: "proprio",
      colaboradorId: await colaboradorIdDoUsuario(sessao.usuario_id),
    };
  }
  if (sessao.papel === "gestor") {
    return {
      alcance: "equipe",
      colaboradorId: await colaboradorIdDoUsuario(sessao.usuario_id),
    };
  }
  return { alcance: "todos" };
}

async function exigirColaboradorNoEscopo(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<void> {
  const escopo = await resolverEscopo(sessao);
  const visivel = await colaboradorNoEscopo(colaboradorId, escopo);
  if (!visivel) {
    // Fora do alcance = ausência, não máscara: mesmo 404 de inexistente.
    throw new ErroHttp(404, "Colaborador não encontrado.");
  }
}

function mapearConflito(erro: unknown): never {
  const restricao = violacaoUnica(erro);
  if (restricao === "usuario_email_unico") {
    throw new ErroHttpCampo(409, "Já existe um usuário com este e-mail.", "email");
  }
  if (restricao === "colaborador_matricula_key") {
    throw new ErroHttpCampo(
      409,
      "Já existe um colaborador com esta matrícula.",
      "matricula"
    );
  }
  if (restricao === "colaborador_cpf_key") {
    throw new ErroHttpCampo(409, "Já existe um colaborador com este CPF.", "cpf");
  }
  throw erro;
}

export interface ColaboradorListado extends ColaboradorResumo {
  feedback_vencido: boolean;
}

function feedbackVencido(
  diasDesdeFeedback: number | null,
  diasDesdeAdmissao: number
): boolean {
  const dias = diasDesdeFeedback ?? diasDesdeAdmissao;
  return dias > CADENCIA_FEEDBACK_DIAS;
}

export async function listarColaboradores(
  sessao: PayloadSessao,
  filtro: FiltroColaboradores
): Promise<{ colaboradores: ColaboradorListado[]; alcance: Escopo["alcance"] }> {
  const escopo = await resolverEscopo(sessao);
  const colaboradores = await listar(filtro, escopo);
  return {
    colaboradores: colaboradores.map((colaborador) => ({
      ...colaborador,
      feedback_vencido: feedbackVencido(
        colaborador.dias_desde_feedback,
        colaborador.dias_desde_admissao
      ),
    })),
    alcance: escopo.alcance,
  };
}

export async function obterColaborador(
  sessao: PayloadSessao,
  id: number
): Promise<{
  colaborador: FichaColaborador & { feedback_vencido: boolean };
  linha_do_tempo: EventoLinhaTempo[];
}> {
  const escopo = await resolverEscopo(sessao);
  const ficha = await buscarFicha(id, escopo);
  if (!ficha) {
    throw new ErroHttp(404, "Colaborador não encontrado.");
  }
  const podeVerRestritas = await temPermissao(
    sessao.usuario_id,
    "rh.ocorrencia.restrita.ver"
  );
  const linhaDoTempo = await listarEventos(id, podeVerRestritas);
  return {
    colaborador: {
      ...ficha,
      feedback_vencido: feedbackVencido(
        ficha.dias_desde_feedback,
        ficha.dias_desde_admissao
      ),
    },
    linha_do_tempo: linhaDoTempo,
  };
}

export async function criarColaborador(
  sessao: PayloadSessao,
  dados: CriacaoColaborador
): Promise<{ colaborador: ColaboradorResumo; senha_temporaria: string }> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await hash(senhaTemporaria, 12);
  try {
    const colaborador = await comTransacao(
      sessao.usuario_id,
      async (cliente) => {
        const usuario = await criarUsuario(cliente, {
          email: dados.email,
          nome: dados.nome_completo,
          papel: "funcionario",
          senhaHash,
        });
        const criado = await criar(cliente, {
          usuario_id: usuario.id,
          matricula: dados.matricula,
          matricula_esocial: dados.matricula,
          cpf: dados.cpf,
          nome_completo: dados.nome_completo,
          tipo_vinculo: dados.tipo_vinculo,
          data_admissao: dados.data_admissao,
          retrato: dados.retrato ?? null,
          contexto: dados.contexto ?? null,
        });
        await inserirEvento(cliente, {
          colaborador_id: criado.id,
          tipo: "admissao",
          ocorrido_em: `${dados.data_admissao}T00:00:00Z`,
          origem_tabela: ORIGEM_COLABORADOR,
          origem_id: criado.id,
          resumo: `Admissão de ${dados.nome_completo} (matrícula ${dados.matricula}) como ${ROTULOS_VINCULO[dados.tipo_vinculo]} em ${formatarData(dados.data_admissao)}`,
          payload: {
            tipo_vinculo: dados.tipo_vinculo,
            data_admissao: dados.data_admissao,
          },
          registrado_por: sessao.usuario_id,
        });
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: "sistema.usuario",
          registroId: String(usuario.id),
          diff: {
            "E-mail": { de: null, para: usuario.email },
            Nome: { de: null, para: usuario.nome },
            Papel: { de: null, para: "Funcionário" },
            Ativo: { de: null, para: "Sim" },
          },
        });
        const diffColaborador: Diff = {
          "Matrícula": { de: null, para: dados.matricula },
          CPF: { de: null, para: dados.cpf },
          "Nome completo": { de: null, para: dados.nome_completo },
          "Vínculo": { de: null, para: ROTULOS_VINCULO[dados.tipo_vinculo] },
          "Data de admissão": {
            de: null,
            para: formatarData(dados.data_admissao),
          },
          Status: { de: null, para: ROTULOS_STATUS.ativo },
        };
        if (dados.retrato) {
          diffColaborador.Retrato = { de: null, para: dados.retrato };
        }
        if (dados.contexto) {
          diffColaborador.Contexto = { de: null, para: dados.contexto };
        }
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: ORIGEM_COLABORADOR,
          registroId: String(criado.id),
          diff: diffColaborador,
        });
        return criado;
      }
    );
    return { colaborador, senha_temporaria: senhaTemporaria };
  } catch (erro) {
    mapearConflito(erro);
  }
}

export async function atualizarColaborador(
  sessao: PayloadSessao,
  id: number,
  dados: AtualizacaoColaborador
): Promise<FichaColaborador> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await buscarParaAtualizar(cliente, id);
    if (!atual) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }

    const campos: CamposColaborador = {};
    const diff: Diff = {};

    if (
      dados.nome_completo !== undefined &&
      dados.nome_completo !== atual.nome_completo
    ) {
      campos.nome_completo = dados.nome_completo;
      diff["Nome completo"] = {
        de: atual.nome_completo,
        para: dados.nome_completo,
      };
    }
    if (dados.retrato !== undefined && dados.retrato !== atual.retrato) {
      campos.retrato = dados.retrato;
      diff.Retrato = { de: atual.retrato, para: dados.retrato };
    }
    if (dados.contexto !== undefined && dados.contexto !== atual.contexto) {
      campos.contexto = dados.contexto;
      diff.Contexto = { de: atual.contexto, para: dados.contexto };
    }
    if (
      dados.tipo_vinculo !== undefined &&
      dados.tipo_vinculo !== atual.tipo_vinculo
    ) {
      campos.tipo_vinculo = dados.tipo_vinculo;
      diff["Vínculo"] = {
        de: ROTULOS_VINCULO[atual.tipo_vinculo],
        para: ROTULOS_VINCULO[dados.tipo_vinculo],
      };
    }
    if (dados.status !== undefined) {
      if (dados.status !== atual.status) {
        campos.status = dados.status;
        diff.Status = {
          de: ROTULOS_STATUS[atual.status],
          para: ROTULOS_STATUS[dados.status],
        };
      }
      if (
        dados.status === "desligado" &&
        dados.data_desligamento !== undefined &&
        dados.data_desligamento !== atual.data_desligamento
      ) {
        campos.data_desligamento = dados.data_desligamento;
        diff["Data de desligamento"] = {
          de: atual.data_desligamento
            ? formatarData(atual.data_desligamento)
            : null,
          para: formatarData(dados.data_desligamento),
        };
      }
      if (
        dados.status !== "desligado" &&
        campos.status !== undefined &&
        atual.data_desligamento !== null
      ) {
        campos.data_desligamento = null;
        diff["Data de desligamento"] = {
          de: formatarData(atual.data_desligamento),
          para: null,
        };
      }
    }

    if (Object.keys(campos).length === 0) {
      return;
    }

    await atualizar(cliente, id, campos);

    const desligando =
      campos.status === "desligado" && dados.data_desligamento !== undefined;
    if (desligando && dados.data_desligamento) {
      if (atual.usuario_ativo) {
        await desativarUsuario(cliente, atual.usuario_id);
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "atualizacao",
          tabela: "sistema.usuario",
          registroId: String(atual.usuario_id),
          diff: { Ativo: { de: "Sim", para: "Não" } },
        });
      }
      await inserirEvento(cliente, {
        colaborador_id: id,
        tipo: "desligamento",
        ocorrido_em: `${dados.data_desligamento}T00:00:00Z`,
        origem_tabela: ORIGEM_COLABORADOR,
        origem_id: id,
        resumo: `Desligamento de ${atual.nome_completo} (matrícula ${atual.matricula}) em ${formatarData(dados.data_desligamento)}`,
        payload: { data_desligamento: dados.data_desligamento },
        registrado_por: sessao.usuario_id,
      });
    } else if (campos.status !== undefined) {
      await inserirEvento(cliente, {
        colaborador_id: id,
        tipo: "alteracao_status",
        ocorrido_em: new Date().toISOString(),
        origem_tabela: ORIGEM_COLABORADOR,
        origem_id: id,
        resumo: `Status de ${atual.nome_completo} alterado de ${ROTULOS_STATUS[atual.status]} para ${ROTULOS_STATUS[campos.status]}`,
        payload: { de: atual.status, para: campos.status },
        registrado_por: sessao.usuario_id,
      });
    }
    if (campos.tipo_vinculo !== undefined) {
      await inserirEvento(cliente, {
        colaborador_id: id,
        tipo: "alteracao_vinculo",
        ocorrido_em: new Date().toISOString(),
        origem_tabela: ORIGEM_COLABORADOR,
        origem_id: id,
        resumo: `Vínculo de ${atual.nome_completo} alterado de ${ROTULOS_VINCULO[atual.tipo_vinculo]} para ${ROTULOS_VINCULO[campos.tipo_vinculo]}`,
        payload: { de: atual.tipo_vinculo, para: campos.tipo_vinculo },
        registrado_por: sessao.usuario_id,
      });
    }

    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: ORIGEM_COLABORADOR,
      registroId: String(id),
      diff,
    });
  });

  // Quem tem rh.colaborador.editar enxerga tudo — escopo pleno na releitura.
  const ficha = await buscarFicha(id, { alcance: "todos" });
  if (!ficha) {
    throw new ErroHttp(404, "Colaborador não encontrado.");
  }
  return ficha;
}

// ------------------------------------------------------------------ ocorrências

export async function listarOcorrenciasColaborador(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<{ ocorrencias: Ocorrencia[]; pode_ver_restritas: boolean }> {
  await exigirColaboradorNoEscopo(sessao, colaboradorId);
  const podeVerRestritas = await temPermissao(
    sessao.usuario_id,
    "rh.ocorrencia.restrita.ver"
  );
  const ocorrencias = await listarOcorrencias(colaboradorId, podeVerRestritas);
  if (podeVerRestritas && ocorrencias.some((item) => item.restrita)) {
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: "rh.ocorrencia.restrita.ver",
      recurso: "colaborador.ocorrencia_restrita",
      registroId: String(colaboradorId),
    });
  }
  return { ocorrencias, pode_ver_restritas: podeVerRestritas };
}

export async function registrarOcorrencia(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: CriacaoOcorrencia
): Promise<Ocorrencia> {
  if (dados.restrita) {
    const podeRestrita = await temPermissao(
      sessao.usuario_id,
      "rh.ocorrencia.restrita.ver"
    );
    if (!podeRestrita) {
      throw new ErroHttp(
        403,
        "Registrar ocorrência restrita exige a chave de leitura restrita."
      );
    }
  }
  await exigirColaboradorNoEscopo(sessao, colaboradorId);

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaborador = await buscarBasico(cliente, colaboradorId);
    if (!colaborador) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const ocorrenciaId = await inserirOcorrencia(cliente, {
      colaborador_id: colaboradorId,
      tipo: dados.tipo,
      restrita: dados.restrita,
      descricao: dados.descricao,
      impacto: dados.impacto ?? null,
      acao_combinada: dados.acao_combinada ?? null,
      ocorrida_em: dados.ocorrida_em,
      registrado_por: sessao.usuario_id,
    });
    // Evento restrito carrega resumo NEUTRO: o conteúdo sensível não vaza
    // pela linha do tempo — detalhe só na aba de ocorrências (leitura logada).
    const resumo = dados.restrita
      ? `Ocorrência restrita registrada sobre ${colaborador.nome_completo} (detalhe na aba Ocorrências)`
      : `Ocorrência ${ROTULOS_OCORRENCIA[dados.tipo].toLowerCase()}: ${truncar(dados.descricao, 160)}`;
    await inserirEvento(cliente, {
      colaborador_id: colaboradorId,
      tipo: "ocorrencia",
      ocorrido_em: `${dados.ocorrida_em}T00:00:00Z`,
      origem_tabela: "rh.ocorrencia",
      origem_id: ocorrenciaId,
      resumo,
      payload: { tipo: dados.tipo, restrita: dados.restrita },
      registrado_por: sessao.usuario_id,
    });
    const diff: Diff = {
      "Classificação": { de: null, para: ROTULOS_OCORRENCIA[dados.tipo] },
      Restrita: { de: null, para: dados.restrita ? "Sim" : "Não" },
      "Data do fato": { de: null, para: formatarData(dados.ocorrida_em) },
      "Descrição": { de: null, para: truncar(dados.descricao, 500) },
    };
    if (dados.impacto) {
      diff.Impacto = { de: null, para: truncar(dados.impacto, 500) };
    }
    if (dados.acao_combinada) {
      diff["Ação combinada"] = {
        de: null,
        para: truncar(dados.acao_combinada, 500),
      };
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.ocorrencia",
      registroId: String(ocorrenciaId),
      diff,
    });
    return ocorrenciaId;
  });

  const ocorrencias = await listarOcorrencias(colaboradorId, true);
  const criada = ocorrencias.find((item) => item.id === id);
  if (!criada) {
    throw new ErroHttp(500, "Falha ao reler a ocorrência registrada.");
  }
  return criada;
}

// ------------------------------------------------------------------ feedback formal

export interface CadenciaFeedback {
  ultimo_em: string | null;
  dias_desde: number | null;
  vencido: boolean;
  parametro_dias: number;
}

export async function listarFeedbacksColaborador(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<{ feedbacks: Feedback[]; cadencia: CadenciaFeedback }> {
  await exigirColaboradorNoEscopo(sessao, colaboradorId);
  const [feedbacks, cadencia] = await Promise.all([
    listarFeedbacks(colaboradorId),
    cadenciaFeedback(colaboradorId),
  ]);
  if (!cadencia) {
    throw new ErroHttp(404, "Colaborador não encontrado.");
  }
  return {
    feedbacks,
    cadencia: {
      ultimo_em: cadencia.ultimo_em,
      dias_desde: cadencia.dias_desde,
      vencido: feedbackVencido(cadencia.dias_desde, cadencia.dias_desde_admissao),
      parametro_dias: CADENCIA_FEEDBACK_DIAS,
    },
  };
}

export async function registrarFeedback(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: CriacaoFeedback
): Promise<Feedback> {
  await exigirColaboradorNoEscopo(sessao, colaboradorId);

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaborador = await buscarBasico(cliente, colaboradorId);
    if (!colaborador) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const feedbackId = await inserirFeedback(cliente, {
      colaborador_id: colaboradorId,
      realizado_em: dados.realizado_em,
      resumo: dados.resumo,
      registrado_por: sessao.usuario_id,
    });
    await inserirEvento(cliente, {
      colaborador_id: colaboradorId,
      tipo: "feedback",
      ocorrido_em: `${dados.realizado_em}T00:00:00Z`,
      origem_tabela: "rh.feedback_formal",
      origem_id: feedbackId,
      resumo: `Feedback formal em ${formatarData(dados.realizado_em)}: ${truncar(dados.resumo, 160)}`,
      payload: {},
      registrado_por: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.feedback_formal",
      registroId: String(feedbackId),
      diff: {
        Data: { de: null, para: formatarData(dados.realizado_em) },
        Resumo: { de: null, para: truncar(dados.resumo, 500) },
      },
    });
    return feedbackId;
  });

  const feedbacks = await listarFeedbacks(colaboradorId);
  const criado = feedbacks.find((item) => item.id === id);
  if (!criado) {
    throw new ErroHttp(500, "Falha ao reler o feedback registrado.");
  }
  return criado;
}

// ------------------------------------------------------------------ ações abertas

export async function listarAcoesColaborador(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<Acao[]> {
  await exigirColaboradorNoEscopo(sessao, colaboradorId);
  return listarAcoes(colaboradorId);
}

export async function criarAcao(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: CriacaoAcao
): Promise<Acao[]> {
  await exigirColaboradorNoEscopo(sessao, colaboradorId);
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaborador = await buscarBasico(cliente, colaboradorId);
    if (!colaborador) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const acaoId = await inserirAcao(cliente, {
      colaborador_id: colaboradorId,
      descricao: dados.descricao,
      prazo: dados.prazo,
      responsavel_id: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.acao_aberta",
      registroId: String(acaoId),
      diff: {
        "Descrição": { de: null, para: truncar(dados.descricao, 500) },
        Prazo: { de: null, para: formatarData(dados.prazo) },
        Status: { de: null, para: ROTULOS_STATUS_ACAO.aberta },
      },
    });
  });
  return listarAcoes(colaboradorId);
}

export async function atualizarAcaoColaborador(
  sessao: PayloadSessao,
  colaboradorId: number,
  acaoId: number,
  dados: AtualizacaoAcao
): Promise<Acao[]> {
  await exigirColaboradorNoEscopo(sessao, colaboradorId);
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const atual = await buscarAcaoParaAtualizar(cliente, colaboradorId, acaoId);
    if (!atual) {
      throw new ErroHttp(404, "Ação não encontrada.");
    }
    if (atual.status !== "aberta") {
      throw new ErroHttp(409, "Ação concluída ou cancelada não pode mudar.");
    }
    const campos: { descricao?: string; prazo?: string; status?: "concluida" | "cancelada" } = {};
    const diff: Diff = {};
    if (dados.descricao !== undefined && dados.descricao !== atual.descricao) {
      campos.descricao = dados.descricao;
      diff["Descrição"] = {
        de: truncar(atual.descricao, 500),
        para: truncar(dados.descricao, 500),
      };
    }
    if (dados.prazo !== undefined && dados.prazo !== atual.prazo) {
      campos.prazo = dados.prazo;
      diff.Prazo = {
        de: formatarData(atual.prazo),
        para: formatarData(dados.prazo),
      };
    }
    if (dados.status !== undefined) {
      campos.status = dados.status;
      diff.Status = {
        de: ROTULOS_STATUS_ACAO.aberta,
        para: ROTULOS_STATUS_ACAO[dados.status],
      };
    }
    if (Object.keys(campos).length === 0) return;
    await atualizarAcao(cliente, acaoId, campos);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: "rh.acao_aberta",
      registroId: String(acaoId),
      diff,
    });
  });
  return listarAcoes(colaboradorId);
}

// ------------------------------------------------------------------ posição (salário — dado sensível)

export async function obterPosicoes(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<{ posicoes: Posicao[] }> {
  const posicoes = await listarPosicoes(colaboradorId);
  if (posicoes.length === 0) {
    // Sem posição não há dado sensível lido; confere só a existência da ficha.
    const escopoPleno: Escopo = { alcance: "todos" };
    const existe = await colaboradorNoEscopo(colaboradorId, escopoPleno);
    if (!existe) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    return { posicoes };
  }
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "rh.posicao.ver",
    recurso: "colaborador.salario",
    registroId: String(colaboradorId),
  });
  return { posicoes };
}

export async function registrarPosicao(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: CriacaoPosicao
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaborador = await buscarBasico(cliente, colaboradorId);
    if (!colaborador) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const cargoVersao = await buscarCargoVersaoAtiva(cliente, dados.cargo_id);
    if (!cargoVersao) {
      throw new ErroHttpCampo(
        400,
        "Cargo inexistente ou sem versão ativa.",
        "cargo_id"
      );
    }
    const vigente = await buscarPosicaoVigenteParaAtualizar(
      cliente,
      colaboradorId
    );
    if (vigente) {
      if (dados.inicio_vigencia <= vigente.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `Início deve ser posterior à vigência atual (${formatarData(vigente.inicio_vigencia)}).`,
          "inicio_vigencia"
        );
      }
      await encerrarPosicao(cliente, vigente.id, dados.inicio_vigencia);
    }
    const posicaoId = await inserirPosicao(cliente, {
      colaborador_id: colaboradorId,
      cargo_versao_id: cargoVersao.id,
      salario: dados.salario,
      inicio_vigencia: dados.inicio_vigencia,
    });

    // Resumo do evento NUNCA carrega valor de salário: a linha do tempo é
    // visível a quem não tem rh.posicao.ver. Valores ficam na trilha de audit
    // e na aba de posição (leitura logada).
    const mudouCargo = !vigente || vigente.cargo_id !== dados.cargo_id;
    const rotuloMotivo = ROTULOS_MOTIVO_POSICAO[dados.motivo];
    let tipoEvento: string;
    let resumo: string;
    if (!vigente) {
      tipoEvento = "posicao_inicial";
      resumo = `Posição inicial: ${cargoVersao.nome} a partir de ${formatarData(dados.inicio_vigencia)} (${rotuloMotivo.toLowerCase()})`;
    } else if (mudouCargo) {
      tipoEvento = "promocao";
      resumo = `Mudança de cargo: ${vigente.cargo_nome} → ${cargoVersao.nome} em ${formatarData(dados.inicio_vigencia)} (${rotuloMotivo.toLowerCase()})`;
    } else {
      tipoEvento = "reajuste";
      resumo = `Reajuste salarial em ${formatarData(dados.inicio_vigencia)} (${rotuloMotivo.toLowerCase()})`;
    }
    await inserirEvento(cliente, {
      colaborador_id: colaboradorId,
      tipo: tipoEvento,
      ocorrido_em: `${dados.inicio_vigencia}T00:00:00Z`,
      origem_tabela: "rh.posicao_colaborador",
      origem_id: posicaoId,
      resumo,
      payload: { motivo: dados.motivo, cargo_versao_id: cargoVersao.id },
      registrado_por: sessao.usuario_id,
    });

    const diff: Diff = {
      Cargo: { de: vigente?.cargo_nome ?? null, para: cargoVersao.nome },
      "Salário": {
        de: vigente ? formatarSalario(vigente.salario) : null,
        para: formatarSalario(dados.salario),
      },
      "Início da vigência": {
        de: vigente ? formatarData(vigente.inicio_vigencia) : null,
        para: formatarData(dados.inicio_vigencia),
      },
      Motivo: { de: null, para: rotuloMotivo },
    };
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.posicao_colaborador",
      registroId: String(posicaoId),
      diff,
    });
  });
}

// ------------------------------------------------------------------ relação gestor → liderado

export async function obterRelacoesGestor(
  colaboradorId: number
): Promise<{ vigente: RelacaoGestor | null; historico: RelacaoGestor[] }> {
  const historico = await listarRelacoesGestor(colaboradorId);
  const vigente = historico.find((item) => item.fim_vigencia === null) ?? null;
  return { vigente, historico };
}

export async function definirGestor(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: DefinicaoGestor
): Promise<void> {
  if (dados.gestor_colaborador_id === colaboradorId) {
    throw new ErroHttpCampo(
      400,
      "Colaborador não pode ser gestor de si mesmo.",
      "gestor_colaborador_id"
    );
  }
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaborador = await buscarBasico(cliente, colaboradorId);
    if (!colaborador) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const novoGestor =
      dados.gestor_colaborador_id === null
        ? null
        : await buscarBasico(cliente, dados.gestor_colaborador_id);
    if (dados.gestor_colaborador_id !== null && !novoGestor) {
      throw new ErroHttpCampo(
        400,
        "Gestor informado não existe.",
        "gestor_colaborador_id"
      );
    }
    const vigente = await buscarRelacaoGestorVigenteParaAtualizar(
      cliente,
      colaboradorId
    );
    if (!vigente && novoGestor === null) {
      throw new ErroHttp(400, "Não há relação vigente para encerrar.");
    }
    if (vigente && novoGestor && vigente.gestor_colaborador_id === novoGestor.id) {
      throw new ErroHttpCampo(
        400,
        "Esta pessoa já é o gestor vigente.",
        "gestor_colaborador_id"
      );
    }
    if (vigente) {
      if (dados.inicio_vigencia <= vigente.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `Início deve ser posterior à vigência atual (${formatarData(vigente.inicio_vigencia)}).`,
          "inicio_vigencia"
        );
      }
      await encerrarRelacaoGestor(cliente, vigente.id, dados.inicio_vigencia);
    }
    let registroId = vigente ? String(vigente.id) : "";
    if (novoGestor) {
      const relacaoId = await inserirRelacaoGestor(cliente, {
        gestor_colaborador_id: novoGestor.id,
        liderado_colaborador_id: colaboradorId,
        inicio_vigencia: dados.inicio_vigencia,
      });
      registroId = String(relacaoId);
    }

    const resumo = novoGestor
      ? vigente
        ? `Mudança de gestor: ${vigente.gestor_nome} → ${novoGestor.nome_completo} a partir de ${formatarData(dados.inicio_vigencia)}`
        : `Gestor definido: ${novoGestor.nome_completo} a partir de ${formatarData(dados.inicio_vigencia)}`
      : `Relação de gestor com ${vigente?.gestor_nome} encerrada em ${formatarData(dados.inicio_vigencia)}`;
    await inserirEvento(cliente, {
      colaborador_id: colaboradorId,
      tipo: "mudanca_gestor",
      ocorrido_em: `${dados.inicio_vigencia}T00:00:00Z`,
      origem_tabela: "rh.relacao_gestor",
      origem_id: Number(registroId),
      resumo,
      payload: {
        gestor_colaborador_id: novoGestor?.id ?? null,
        gestor_anterior_id: vigente?.gestor_colaborador_id ?? null,
      },
      registrado_por: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: novoGestor ? "criacao" : "atualizacao",
      tabela: "rh.relacao_gestor",
      registroId,
      diff: {
        Gestor: {
          de: vigente?.gestor_nome ?? null,
          para: novoGestor?.nome_completo ?? null,
        },
        "Início da vigência": {
          de: vigente ? formatarData(vigente.inicio_vigencia) : null,
          para: formatarData(dados.inicio_vigencia),
        },
      },
    });
  });
}

// ------------------------------------------------------------------ lotação

export async function obterLotacoes(
  colaboradorId: number
): Promise<{ vigente: Lotacao | null; historico: Lotacao[] }> {
  const historico = await listarLotacoes(colaboradorId);
  const vigente = historico.find((item) => item.fim_vigencia === null) ?? null;
  return { vigente, historico };
}

export async function definirLotacao(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: DefinicaoLotacao
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaborador = await buscarBasico(cliente, colaboradorId);
    if (!colaborador) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const versaoEstabelecimento = await buscarEstabelecimentoVersaoAtiva(
      cliente,
      dados.estabelecimento_id
    );
    if (!versaoEstabelecimento) {
      throw new ErroHttpCampo(
        400,
        "Estabelecimento inexistente ou sem versão ativa.",
        "estabelecimento_id"
      );
    }
    const vigente = await buscarLotacaoVigenteParaAtualizar(
      cliente,
      colaboradorId
    );
    if (
      vigente &&
      vigente.estabelecimento_id === dados.estabelecimento_id &&
      vigente.centro_custo === dados.centro_custo
    ) {
      throw new ErroHttp(400, "Lotação informada já é a vigente.");
    }
    if (vigente) {
      if (dados.inicio_vigencia <= vigente.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `Início deve ser posterior à vigência atual (${formatarData(vigente.inicio_vigencia)}).`,
          "inicio_vigencia"
        );
      }
      await encerrarLotacao(cliente, vigente.id, dados.inicio_vigencia);
    }
    const lotacaoId = await inserirLotacao(cliente, {
      colaborador_id: colaboradorId,
      estabelecimento_id: dados.estabelecimento_id,
      centro_custo: dados.centro_custo,
      inicio_vigencia: dados.inicio_vigencia,
    });

    // Transferência de unidade é fato relevante; a primeira lotação faz parte
    // do arranjo da admissão e fica só na trilha de audit.
    if (vigente && vigente.estabelecimento_id !== dados.estabelecimento_id) {
      await inserirEvento(cliente, {
        colaborador_id: colaboradorId,
        tipo: "transferencia",
        ocorrido_em: `${dados.inicio_vigencia}T00:00:00Z`,
        origem_tabela: "rh.lotacao",
        origem_id: lotacaoId,
        resumo: `Transferência: ${vigente.unidade ?? "unidade anterior"} → ${versaoEstabelecimento.unidade} em ${formatarData(dados.inicio_vigencia)}`,
        payload: {
          de_estabelecimento_id: vigente.estabelecimento_id,
          para_estabelecimento_id: dados.estabelecimento_id,
        },
        registrado_por: sessao.usuario_id,
      });
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.lotacao",
      registroId: String(lotacaoId),
      diff: {
        Unidade: {
          de: vigente?.unidade ?? null,
          para: versaoEstabelecimento.unidade,
        },
        "Centro de custo": {
          de: vigente?.centro_custo ?? null,
          para: dados.centro_custo,
        },
        "Início da vigência": {
          de: vigente ? formatarData(vigente.inicio_vigencia) : null,
          para: formatarData(dados.inicio_vigencia),
        },
      },
    });
  });
}

// ------------------------------------------------------------------ cargos (rh.cargo.administrar)

function chaCompleto(cha?: {
  conhecimentos?: string[];
  habilidades?: string[];
  atitudes?: string[];
}): { conhecimentos: string[]; habilidades: string[]; atitudes: string[] } {
  return {
    conhecimentos: cha?.conhecimentos ?? [],
    habilidades: cha?.habilidades ?? [],
    atitudes: cha?.atitudes ?? [],
  };
}

export async function listarCargosAdministraveis(): Promise<CargoResumo[]> {
  return listarCargos();
}

export async function criarCargo(
  sessao: PayloadSessao,
  dados: CriacaoCargo
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const cargoId = await inserirCargo(cliente);
    const versaoId = await inserirVersaoCargo(cliente, {
      cargo_id: cargoId,
      nome: dados.nome,
      descricao: dados.descricao ?? null,
      cha: chaCompleto(dados.cha),
      inicio_vigencia: dados.inicio_vigencia,
    });
    const diff: Diff = {
      Nome: { de: null, para: dados.nome },
      "Início da vigência": { de: null, para: formatarData(dados.inicio_vigencia) },
    };
    if (dados.descricao) {
      diff["Descrição"] = { de: null, para: truncar(dados.descricao, 500) };
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.cargo_versao",
      registroId: String(versaoId),
      diff,
    });
    if (dados.faixa_min !== undefined && dados.faixa_max !== undefined) {
      const faixaId = await inserirFaixaSalarial(cliente, {
        cargo_id: cargoId,
        faixa_min: dados.faixa_min,
        faixa_max: dados.faixa_max,
        inicio_vigencia: dados.inicio_vigencia,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.tabela_salarial_versao",
        registroId: String(faixaId),
        diff: {
          Cargo: { de: null, para: dados.nome },
          "Faixa mínima": { de: null, para: formatarSalario(dados.faixa_min) },
          "Faixa máxima": { de: null, para: formatarSalario(dados.faixa_max) },
          "Início da vigência": {
            de: null,
            para: formatarData(dados.inicio_vigencia),
          },
        },
      });
    }
  });
}

export async function criarVersaoCargo(
  sessao: PayloadSessao,
  cargoId: number,
  dados: NovaVersaoCargo
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    if (!(await existeCargo(cliente, cargoId))) {
      throw new ErroHttp(404, "Cargo não encontrado.");
    }
    const ativa = await buscarCargoVersaoAtiva(cliente, cargoId, true);
    if (ativa) {
      if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `Início deve ser posterior à vigência atual (${formatarData(ativa.inicio_vigencia)}).`,
          "inicio_vigencia"
        );
      }
      await encerrarVersaoCargo(cliente, ativa.id, dados.inicio_vigencia);
    }
    const versaoId = await inserirVersaoCargo(cliente, {
      cargo_id: cargoId,
      nome: dados.nome,
      descricao: dados.descricao ?? null,
      cha: chaCompleto(dados.cha),
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.cargo_versao",
      registroId: String(versaoId),
      diff: {
        Nome: { de: ativa?.nome ?? null, para: dados.nome },
        "Descrição": {
          de: ativa?.descricao ? truncar(ativa.descricao, 500) : null,
          para: dados.descricao ? truncar(dados.descricao, 500) : null,
        },
        "Início da vigência": {
          de: ativa ? formatarData(ativa.inicio_vigencia) : null,
          para: formatarData(dados.inicio_vigencia),
        },
      },
    });
  });
}

export async function criarFaixaSalarial(
  sessao: PayloadSessao,
  cargoId: number,
  dados: NovaFaixaSalarial
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    if (!(await existeCargo(cliente, cargoId))) {
      throw new ErroHttp(404, "Cargo não encontrado.");
    }
    const ativa = await buscarFaixaAtivaParaAtualizar(cliente, cargoId);
    if (ativa) {
      if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `Início deve ser posterior à vigência atual (${formatarData(ativa.inicio_vigencia)}).`,
          "inicio_vigencia"
        );
      }
      await encerrarFaixaSalarial(cliente, ativa.id, dados.inicio_vigencia);
    }
    const faixaId = await inserirFaixaSalarial(cliente, {
      cargo_id: cargoId,
      faixa_min: dados.faixa_min,
      faixa_max: dados.faixa_max,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.tabela_salarial_versao",
      registroId: String(faixaId),
      diff: {
        "Faixa mínima": {
          de: ativa ? formatarSalario(ativa.faixa_min) : null,
          para: formatarSalario(dados.faixa_min),
        },
        "Faixa máxima": {
          de: ativa ? formatarSalario(ativa.faixa_max) : null,
          para: formatarSalario(dados.faixa_max),
        },
        "Início da vigência": {
          de: ativa ? formatarData(ativa.inicio_vigencia) : null,
          para: formatarData(dados.inicio_vigencia),
        },
      },
    });
  });
}

// ------------------------------------------------------------------ estabelecimentos (rh.estabelecimento.administrar)

export async function listarEstabelecimentosAdministraveis(): Promise<
  EstabelecimentoResumo[]
> {
  return listarEstabelecimentos();
}

export async function criarEstabelecimento(
  sessao: PayloadSessao,
  dados: CriacaoEstabelecimento
): Promise<void> {
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      const estabelecimentoId = await inserirEstabelecimento(
        cliente,
        dados.cnpj
      );
      const versaoId = await inserirVersaoEstabelecimento(cliente, {
        estabelecimento_id: estabelecimentoId,
        razao_social: dados.razao_social,
        unidade: dados.unidade,
        endereco_resumido: dados.endereco_resumido ?? null,
        inicio_vigencia: dados.inicio_vigencia,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.estabelecimento_versao",
        registroId: String(versaoId),
        diff: {
          CNPJ: { de: null, para: dados.cnpj },
          "Razão social": { de: null, para: dados.razao_social },
          Unidade: { de: null, para: dados.unidade },
          "Início da vigência": {
            de: null,
            para: formatarData(dados.inicio_vigencia),
          },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "estabelecimento_cnpj_key") {
      throw new ErroHttpCampo(
        409,
        "Já existe um estabelecimento com este CNPJ.",
        "cnpj"
      );
    }
    throw erro;
  }
}

export async function criarVersaoEstabelecimento(
  sessao: PayloadSessao,
  estabelecimentoId: number,
  dados: NovaVersaoEstabelecimento
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    if (!(await existeEstabelecimento(cliente, estabelecimentoId))) {
      throw new ErroHttp(404, "Estabelecimento não encontrado.");
    }
    const ativa = await buscarEstabelecimentoVersaoAtiva(
      cliente,
      estabelecimentoId,
      true
    );
    if (ativa) {
      if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `Início deve ser posterior à vigência atual (${formatarData(ativa.inicio_vigencia)}).`,
          "inicio_vigencia"
        );
      }
      await encerrarVersaoEstabelecimento(
        cliente,
        ativa.id,
        dados.inicio_vigencia
      );
    }
    const versaoId = await inserirVersaoEstabelecimento(cliente, {
      estabelecimento_id: estabelecimentoId,
      razao_social: dados.razao_social,
      unidade: dados.unidade,
      endereco_resumido: dados.endereco_resumido ?? null,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.estabelecimento_versao",
      registroId: String(versaoId),
      diff: {
        "Razão social": {
          de: ativa?.razao_social ?? null,
          para: dados.razao_social,
        },
        Unidade: { de: ativa?.unidade ?? null, para: dados.unidade },
        "Início da vigência": {
          de: ativa ? formatarData(ativa.inicio_vigencia) : null,
          para: formatarData(dados.inicio_vigencia),
        },
      },
    });
  });
}
