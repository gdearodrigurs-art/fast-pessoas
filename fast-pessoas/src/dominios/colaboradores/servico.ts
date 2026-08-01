import { hash } from "bcryptjs";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
// Catálogos de REGISTRO e CENTRO DE CUSTO (migration 0047). A alocação escolhe
// os três campos, e dois deles moram no domínio "estrutura".
import {
  FiltroEstrutura,
  OpcoesFiltroEstrutura,
} from "../estrutura/esquemas";
import {
  buscarCentroCusto as buscarCentroCustoDaEstrutura,
  buscarEmpresa as buscarEmpresaDaEstrutura,
  listarOpcoesDeFiltroEstrutura,
} from "../estrutura/repositorio";
import { criar as criarUsuario } from "../usuarios/repositorio";
import { gerarSenhaTemporaria } from "../usuarios/servico";
import {
  AtualizacaoAcao,
  AtualizacaoColaborador,
  CADENCIA_FEEDBACK_DIAS,
  Cha,
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
  FAIXAS_IDADE,
  FiltroAniversariantes,
  Genero,
  IDADE_LIMITE_CRIANCA,
  esquemaParametroPrivacidade,
  MINIMO_POR_RECORTE_MAX,
  MINIMO_POR_RECORTE_MIN,
  MINIMO_POR_RECORTE_PADRAO,
  ROTULOS_GENERO,
  ROTULOS_MOTIVO_POSICAO,
  ROTULOS_OCORRENCIA,
  ROTULOS_STATUS,
  ROTULOS_STATUS_ACAO,
  ROTULOS_VINCULO,
  TipoVinculo,
} from "./esquemas";
import {
  Acao,
  agregarComposicaoFamiliar,
  Aniversariante,
  atualizar,
  atualizarAcao,
  atualizarPessoa,
  buscarAcaoParaAtualizar,
  buscarBasico,
  buscarPessoaPorCpf,
  CamposPessoa,
  criarPessoa,
  vincularContaAPessoa,
  buscarCargoVersaoAtiva,
  buscarRcfPorCargo,
  contarCoberturaNascimento,
  contarHeadcountPorCargo,
  contarHeadcountPorCampoDaEstrutura,
  contarHeadcountPorVinculo,
  contarPorGenero,
  contarPorIdade,
  contarQuadro,
  gravarMinimoPorRecorte,
  lerMinimoPorRecorte,
  lerParametroPrivacidade,
  type ParametroPrivacidadeVigente,
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
  VinculoCriado,
  criar,
  desativarUsuario,
  encerrarFaixaSalarial,
  encerrarLotacao,
  encerrarPosicao,
  encerrarRelacaoGestor,
  encerrarVersaoCargo,
  encerrarVersaoEstabelecimento,
  definirInativacaoEstabelecimento,
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
  listarAniversariantes,
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
  RcfCargo,
  registrarLeituraSensivel,
  RelacaoGestor,
  temPermissao,
} from "./repositorio";

const ORIGEM_COLABORADOR = "rh.colaborador";
/** O ser humano por trás do vínculo (migration 0046) — trilha própria. */
const ORIGEM_PESSOA = "rh.pessoa";

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
// Fonte única do "quem vê quem", e a régua inteira está em DUAS chaves — nunca
// no nome do papel (migration 0039 conta o porquê):
//   sem rh.colaborador.ver ................ só a própria ficha
//   com rh.colaborador.ver ................ si e liderados com relação VIGENTE
//   mais rh.colaborador.ver.todos ......... empresa inteira
// O default de quem só tem a primeira chave é "equipe": perfil novo composto
// em /perfis nasce restrito, e o alcance amplo só existe se o administrador o
// tiver concedido explicitamente na tela.

export async function resolverEscopo(sessao: PayloadSessao): Promise<Escopo> {
  const podeVer = await temPermissao(sessao.usuario_id, "rh.colaborador.ver");
  if (!podeVer) {
    return {
      alcance: "proprio",
      colaboradorId: await colaboradorIdDoUsuario(sessao.usuario_id),
    };
  }
  const alcancaTodos = await temPermissao(
    sessao.usuario_id,
    "rh.colaborador.ver.todos"
  );
  if (!alcancaTodos) {
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
  // Desde a 0046 o CPF é único em rh.pessoa, não em rh.colaborador: o UNIQUE
  // que estourava aqui mudou de nome junto com a coluna que o carrega.
  if (restricao === "pessoa_cpf_key") {
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
): Promise<{
  colaboradores: ColaboradorListado[];
  alcance: Escopo["alcance"];
  estrutura_opcoes: OpcoesFiltroEstrutura;
}> {
  const escopo = await resolverEscopo(sessao);
  // As opções dos três seletores vêm junto com a lista: sem endpoint novo e
  // sem chave nova. São nomes de catálogo (empresa, local, centro de custo),
  // não dado de pessoa — o mesmo que o organograma já devolve em `unidades`.
  const [colaboradores, estrutura_opcoes] = await Promise.all([
    listar(filtro, escopo),
    listarOpcoesDeFiltroEstrutura(),
  ]);
  return {
    colaboradores: colaboradores.map((colaborador) => ({
      ...colaborador,
      feedback_vencido: feedbackVencido(
        colaborador.dias_desde_feedback,
        colaborador.dias_desde_admissao
      ),
    })),
    alcance: escopo.alcance,
    estrutura_opcoes,
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
): Promise<{ colaborador: VinculoCriado; senha_temporaria: string }> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await hash(senhaTemporaria, 12);
  try {
    const colaborador = await comTransacao(
      sessao.usuario_id,
      async (cliente) => {
        // A PESSOA nasce primeiro (0046): é dela o CPF, e é a ela que a conta
        // de acesso se liga. Depois vem o VÍNCULO.
        //
        // Se já existe pessoa com este CPF, esta tela ainda recusa — ela cria
        // conta nova, e conta é uma por gente. Abrir o segundo vínculo de quem
        // já está no grupo é fluxo próprio, com escolha do registro (empresa) e
        // reaproveitamento do login; o schema já aguenta, a tela é o passo
        // seguinte da onda.
        const jaExiste = await buscarPessoaPorCpf(cliente, dados.cpf);
        if (jaExiste) {
          throw new ErroHttpCampo(
            409,
            "Já existe um colaborador com este CPF.",
            "cpf"
          );
        }
        const pessoaId = await criarPessoa(cliente, {
          cpf: dados.cpf,
          nome_completo: dados.nome_completo,
          data_nascimento: dados.data_nascimento,
          genero: dados.genero,
          retrato: dados.retrato ?? null,
          contexto: dados.contexto ?? null,
        });
        const usuario = await criarUsuario(cliente, {
          email: dados.email,
          nome: dados.nome_completo,
          papel: "funcionario",
          senhaHash,
        });
        await vincularContaAPessoa(cliente, usuario.id, pessoaId);
        const criado = await criar(cliente, {
          pessoa_id: pessoaId,
          matricula: dados.matricula,
          matricula_esocial: dados.matricula,
          tipo_vinculo: dados.tipo_vinculo,
          data_admissao: dados.data_admissao,
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
        // Trilha em DUAS entidades porque agora são duas: o que é do ser
        // humano (CPF, nome, nascimento, gênero, retrato, contexto) é da
        // pessoa; o que é do contrato é do vínculo.
        const diffPessoa: Diff = {
          CPF: { de: null, para: dados.cpf },
          "Nome completo": { de: null, para: dados.nome_completo },
          "Data de nascimento": {
            de: null,
            para: formatarData(dados.data_nascimento),
          },
          // Gênero entra na TRILHA (quem registrou o quê), nunca em payload de
          // leitura individual — a trilha é justamente o controle de quem mexeu
          // num dado autodeclarado.
          "Gênero (autodeclarado)": {
            de: null,
            para: ROTULOS_GENERO[dados.genero],
          },
        };
        if (dados.retrato) {
          diffPessoa.Retrato = { de: null, para: dados.retrato };
        }
        if (dados.contexto) {
          diffPessoa.Contexto = { de: null, para: dados.contexto };
        }
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: ORIGEM_PESSOA,
          registroId: String(pessoaId),
          diff: diffPessoa,
        });
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: ORIGEM_COLABORADOR,
          registroId: String(criado.id),
          diff: {
            "Matrícula": { de: null, para: dados.matricula },
            "Vínculo": { de: null, para: ROTULOS_VINCULO[dados.tipo_vinculo] },
            "Data de admissão": {
              de: null,
              para: formatarData(dados.data_admissao),
            },
            Status: { de: null, para: ROTULOS_STATUS.ativo },
          },
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

    // Duas gavetas: o que muda no ser humano vai para rh.pessoa e desce
    // sozinho para todos os contratos dele; o que muda no contrato fica no
    // vínculo. Quem separa é aqui — abaixo o repositório só executa.
    const campos: CamposColaborador = {};
    const camposPessoa: CamposPessoa = {};
    const diff: Diff = {};
    const diffPessoa: Diff = {};

    if (
      dados.nome_completo !== undefined &&
      dados.nome_completo !== atual.nome_completo
    ) {
      camposPessoa.nome_completo = dados.nome_completo;
      diffPessoa["Nome completo"] = {
        de: atual.nome_completo,
        para: dados.nome_completo,
      };
    }
    if (dados.retrato !== undefined && dados.retrato !== atual.retrato) {
      camposPessoa.retrato = dados.retrato;
      diffPessoa.Retrato = { de: atual.retrato, para: dados.retrato };
    }
    if (dados.contexto !== undefined && dados.contexto !== atual.contexto) {
      camposPessoa.contexto = dados.contexto;
      diffPessoa.Contexto = { de: atual.contexto, para: dados.contexto };
    }
    if (
      dados.data_nascimento !== undefined &&
      dados.data_nascimento !== atual.data_nascimento
    ) {
      if (dados.data_nascimento >= atual.data_admissao) {
        throw new ErroHttpCampo(
          400,
          "Data de nascimento deve ser anterior à admissão.",
          "data_nascimento"
        );
      }
      camposPessoa.data_nascimento = dados.data_nascimento;
      diffPessoa["Data de nascimento"] = {
        de: atual.data_nascimento ? formatarData(atual.data_nascimento) : null,
        para: formatarData(dados.data_nascimento),
      };
    }
    // Gênero é autodeclarado: gravamos o que a pessoa declarou sem devolver o
    // valor atual em nenhum payload de leitura (o formulário é "cego"). A
    // trilha registra a mudança — é lá que se audita quem tocou no campo.
    if (dados.genero !== undefined && dados.genero !== atual.genero) {
      camposPessoa.genero = dados.genero;
      diffPessoa["Gênero (autodeclarado)"] = {
        de: ROTULOS_GENERO[atual.genero],
        para: ROTULOS_GENERO[dados.genero],
      };
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

    if (
      Object.keys(campos).length === 0 &&
      Object.keys(camposPessoa).length === 0
    ) {
      return;
    }

    await atualizarPessoa(cliente, atual.pessoa_id, camposPessoa);
    await atualizar(cliente, id, campos);

    const desligando =
      campos.status === "desligado" && dados.data_desligamento !== undefined;
    if (desligando && dados.data_desligamento) {
      // Só trava o acesso se a pessoa não tiver outro contrato de pé — quem
      // saiu da Supply e continua na DCS não pode perder o login.
      if (atual.usuario_ativo && (await desativarUsuario(cliente, atual.usuario_id))) {
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

    if (Object.keys(diffPessoa).length > 0) {
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "atualizacao",
        tabela: ORIGEM_PESSOA,
        registroId: String(atual.pessoa_id),
        diff: diffPessoa,
      });
    }
    if (Object.keys(diff).length > 0) {
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "atualizacao",
        tabela: ORIGEM_COLABORADOR,
        registroId: String(id),
        diff,
      });
    }
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

/**
 * Define a ALOCAÇÃO do vínculo: os três campos de uma vez, com vigência.
 * Registro, lotação e centro de custo são escolhidos separadamente (nenhum é
 * derivado do outro) e entram numa linha só. Mudar qualquer um encerra a linha
 * vigente e abre outra — a linha encerrada vira imutável no banco, e é por isso
 * que trocar o centro de custo hoje não mexe na folha de fevereiro.
 */
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
    const empresa = await buscarEmpresaDaEstrutura(cliente, dados.empresa_id);
    if (!empresa || empresa.inativada_em !== null) {
      throw new ErroHttpCampo(
        400,
        "Empresa do grupo inexistente ou inativa.",
        "empresa_id"
      );
    }
    const versaoEstabelecimento = await buscarEstabelecimentoVersaoAtiva(
      cliente,
      dados.estabelecimento_id
    );
    if (!versaoEstabelecimento) {
      throw new ErroHttpCampo(
        400,
        "Lotação inexistente ou sem versão ativa.",
        "estabelecimento_id"
      );
    }
    const centro = await buscarCentroCustoDaEstrutura(
      cliente,
      dados.centro_custo_id
    );
    if (!centro || centro.inativado_em !== null) {
      throw new ErroHttpCampo(
        400,
        "Centro de custo inexistente ou inativo.",
        "centro_custo_id"
      );
    }
    const vigente = await buscarLotacaoVigenteParaAtualizar(
      cliente,
      colaboradorId
    );
    if (
      vigente &&
      vigente.empresa_id === dados.empresa_id &&
      vigente.estabelecimento_id === dados.estabelecimento_id &&
      vigente.centro_custo_id === dados.centro_custo_id
    ) {
      throw new ErroHttp(400, "Alocação informada já é a vigente.");
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
      empresa_id: dados.empresa_id,
      estabelecimento_id: dados.estabelecimento_id,
      centro_custo_id: dados.centro_custo_id,
      inicio_vigencia: dados.inicio_vigencia,
    });

    // Fato relevante na linha do tempo: mudar de EMPRESA ou de LOCAL. Trocar só
    // o centro de custo é rearranjo contábil e fica na trilha de audit — a
    // primeira alocação faz parte do arranjo da admissão, idem.
    const mudouEmpresa = vigente && vigente.empresa_id !== dados.empresa_id;
    const mudouLocal =
      vigente && vigente.estabelecimento_id !== dados.estabelecimento_id;
    if (vigente && (mudouEmpresa || mudouLocal)) {
      const de = mudouEmpresa
        ? (vigente.empresa_nome ?? "empresa anterior")
        : (vigente.unidade ?? "unidade anterior");
      const para = mudouEmpresa
        ? (empresa.nome_fantasia ?? `empresa ${dados.empresa_id}`)
        : versaoEstabelecimento.unidade;
      await inserirEvento(cliente, {
        colaborador_id: colaboradorId,
        tipo: "transferencia",
        ocorrido_em: `${dados.inicio_vigencia}T00:00:00Z`,
        origem_tabela: "rh.lotacao",
        origem_id: lotacaoId,
        resumo: `Transferência: ${de} → ${para} em ${formatarData(dados.inicio_vigencia)}`,
        payload: {
          de_empresa_id: vigente.empresa_id,
          para_empresa_id: dados.empresa_id,
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
        Registro: {
          de: vigente?.empresa_nome ?? null,
          para: empresa.nome_fantasia,
        },
        Lotação: {
          de: vigente?.unidade ?? null,
          para: versaoEstabelecimento.unidade,
        },
        "Centro de custo": {
          de: vigente?.centro_custo ?? null,
          para: centro.codigo,
        },
        "Início da vigência": {
          de: vigente ? formatarData(vigente.inicio_vigencia) : null,
          para: formatarData(dados.inicio_vigencia),
        },
      },
    });
  });
}

// ------------------------------------------------------------------ cargos + RCF (rh.cargo.administrar)
// O RCF (Responsabilidade Chave da Função) é o descritivo de cargo oficial da
// Fast e vive na VERSÃO do cargo: mudou a função, é versão nova com vigência —
// a anterior é encerrada, nunca reescrita. Ver
// referencias/rcf-modelo-descritivo-de-cargos.md.

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

/** Campos do RCF na forma que o repositório grava (sem undefined). */
function camposRcf(dados: {
  setor?: string;
  cargo_lider_id?: number | null;
  tipo_contrato_previsto?: TipoVinculo;
  missao?: string;
  atividades?: string[];
  observacoes?: string;
}) {
  return {
    setor: dados.setor ?? null,
    cargo_lider_id: dados.cargo_lider_id ?? null,
    tipo_contrato_previsto: dados.tipo_contrato_previsto ?? null,
    missao: dados.missao ?? null,
    atividades: dados.atividades ?? [],
    observacoes: dados.observacoes ?? null,
  };
}

/** Diff legível do RCF para a trilha (audit.alteracao). */
function diffRcf(
  diff: Diff,
  antes: {
    setor: string | null;
    tipo_contrato_previsto: TipoVinculo | null;
    missao: string | null;
    atividades: string[];
    cha: Cha;
    observacoes: string | null;
  } | null,
  depois: {
    setor: string | null;
    tipo_contrato_previsto: TipoVinculo | null;
    missao: string | null;
    atividades: string[];
    cha: { conhecimentos: string[]; habilidades: string[]; atitudes: string[] };
    observacoes: string | null;
  }
): void {
  const lista = (itens?: string[]) =>
    itens && itens.length > 0 ? truncar(itens.join("; "), 500) : null;
  const contrato = (valor: TipoVinculo | null) =>
    valor ? ROTULOS_VINCULO[valor] : null;

  diff.Setor = { de: antes?.setor ?? null, para: depois.setor };
  diff["Tipo de contrato previsto"] = {
    de: contrato(antes?.tipo_contrato_previsto ?? null),
    para: contrato(depois.tipo_contrato_previsto),
  };
  diff["Missão (RCF)"] = {
    de: antes?.missao ? truncar(antes.missao, 500) : null,
    para: depois.missao ? truncar(depois.missao, 500) : null,
  };
  diff.Atividades = {
    de: lista(antes?.atividades),
    para: lista(depois.atividades),
  };
  diff["CHA · Conhecimentos"] = {
    de: lista(antes?.cha?.conhecimentos),
    para: lista(depois.cha.conhecimentos),
  };
  diff["CHA · Habilidades"] = {
    de: lista(antes?.cha?.habilidades),
    para: lista(depois.cha.habilidades),
  };
  diff["CHA · Atitudes"] = {
    de: lista(antes?.cha?.atitudes),
    para: lista(depois.cha.atitudes),
  };
  diff["Observações"] = {
    de: antes?.observacoes ? truncar(antes.observacoes, 500) : null,
    para: depois.observacoes ? truncar(depois.observacoes, 500) : null,
  };
}

export async function listarCargosAdministraveis(): Promise<CargoResumo[]> {
  return listarCargos();
}

/**
 * RCF vigente de um cargo para a visualização imprimível. Não é dado sensível
 * (documento de gestão) — a rota/página é que confere a chave de leitura.
 */
export async function obterRcfCargo(cargoId: number): Promise<RcfCargo> {
  const rcf = await buscarRcfPorCargo(cargoId);
  if (!rcf) {
    throw new ErroHttp(404, "Cargo sem versão vigente.");
  }
  return rcf;
}

export async function criarCargo(
  sessao: PayloadSessao,
  dados: CriacaoCargo
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const cargoId = await inserirCargo(cliente);
    const rcf = camposRcf(dados);
    if (rcf.cargo_lider_id !== null) {
      if (!(await existeCargo(cliente, rcf.cargo_lider_id))) {
        throw new ErroHttpCampo(
          400,
          "Cargo do líder direto inexistente.",
          "cargo_lider_id"
        );
      }
    }
    const cha = chaCompleto(dados.cha);
    const versaoId = await inserirVersaoCargo(cliente, {
      cargo_id: cargoId,
      nome: dados.nome,
      descricao: dados.descricao ?? null,
      cha,
      inicio_vigencia: dados.inicio_vigencia,
      ...rcf,
    });
    const diff: Diff = {
      Nome: { de: null, para: dados.nome },
      "Início da vigência": { de: null, para: formatarData(dados.inicio_vigencia) },
    };
    if (dados.descricao) {
      diff["Descrição"] = { de: null, para: truncar(dados.descricao, 500) };
    }
    diffRcf(diff, null, { ...rcf, cha });
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
    const rcf = camposRcf(dados);
    if (rcf.cargo_lider_id !== null) {
      if (rcf.cargo_lider_id === cargoId) {
        throw new ErroHttpCampo(
          400,
          "O cargo não pode ser líder direto de si mesmo.",
          "cargo_lider_id"
        );
      }
      if (!(await existeCargo(cliente, rcf.cargo_lider_id))) {
        throw new ErroHttpCampo(
          400,
          "Cargo do líder direto inexistente.",
          "cargo_lider_id"
        );
      }
    }
    const cha = chaCompleto(dados.cha);
    const versaoId = await inserirVersaoCargo(cliente, {
      cargo_id: cargoId,
      nome: dados.nome,
      descricao: dados.descricao ?? null,
      cha,
      inicio_vigencia: dados.inicio_vigencia,
      ...rcf,
    });
    const diff: Diff = {
      Nome: { de: ativa?.nome ?? null, para: dados.nome },
      "Descrição": {
        de: ativa?.descricao ? truncar(ativa.descricao, 500) : null,
        para: dados.descricao ? truncar(dados.descricao, 500) : null,
      },
      "Início da vigência": {
        de: ativa ? formatarData(ativa.inicio_vigencia) : null,
        para: formatarData(dados.inicio_vigencia),
      },
    };
    diffRcf(diff, ativa, { ...rcf, cha });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: "rh.cargo_versao",
      registroId: String(versaoId),
      diff,
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
        dados.cnpj ?? null
      );
      const versaoId = await inserirVersaoEstabelecimento(cliente, {
        estabelecimento_id: estabelecimentoId,
        razao_social: dados.razao_social ?? null,
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
          CNPJ: { de: null, para: dados.cnpj ?? null },
          "Razão social": { de: null, para: dados.razao_social ?? null },
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

/** Liga/desliga o local físico para uso NOVO. Não apaga e não mexe no passado. */
export async function definirEstabelecimentoInativo(
  sessao: PayloadSessao,
  estabelecimentoId: number,
  inativo: boolean
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    if (!(await existeEstabelecimento(cliente, estabelecimentoId))) {
      throw new ErroHttp(404, "Lotação não encontrada.");
    }
    await definirInativacaoEstabelecimento(
      cliente,
      estabelecimentoId,
      inativo ? sessao.usuario_id : null
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "edicao",
      tabela: "rh.estabelecimento",
      registroId: String(estabelecimentoId),
      diff: {
        Situação: {
          de: inativo ? "ativa" : "inativa",
          para: inativo ? "inativa" : "ativa",
        },
      },
    });
  });
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
      razao_social: dados.razao_social ?? null,
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
          para: dados.razao_social ?? null,
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

// ------------------------------------------------------------------ relatórios (relatorio.ver)
// O que estes relatórios NÃO fazem, de propósito:
//  • não devolvem linha por pessoa (exceto aniversariantes, que é lista nominal
//    por natureza — e sem o ano de nascimento);
//  • não cruzam gênero com unidade/cargo: num quadro de dezenas de pessoas o
//    cruzamento identifica indivíduo, que é exatamente o que a LGPD proíbe
//    fazer com dado autodeclarado;
//  • não inventam número: tudo vem de contagem no banco e a lacuna de cadastro
//    é reportada (`sem_data_nascimento`) em vez de virar zero silencioso.

export interface RecorteAgregado {
  chave: string;
  rotulo: string;
  /** null = recorte suprimido por ser pequeno demais para publicar. */
  quantidade: number | null;
  suprimido: boolean;
}

/**
 * Supressão de recorte pequeno. Recorte com 1..k-1 pessoas não é publicado.
 * Guarda contra revelação por complemento: se sobrar UM único recorte
 * suprimido, o menor recorte publicado também é suprimido — senão bastaria
 * subtrair do total para reidentificar. Limitação conhecida: com uma base
 * minúscula (um só recorte não vazio) nem isso protege; o relatório então
 * mostra apenas o total, que já é informação pública de headcount.
 *
 * O k vem do parâmetro administrável (migration 0044), não de constante: quem
 * chama já leu o valor e o passa aqui, para o relatório inteiro ser calculado
 * com UM k só, mesmo que alguém mude o parâmetro no meio da montagem.
 */
function suprimirRecortesPequenos(
  recortes: { chave: string; rotulo: string; quantidade: number }[],
  minimoPorRecorte: number
): RecorteAgregado[] {
  const suprimidos = new Set(
    recortes
      .filter(
        (recorte) =>
          recorte.quantidade > 0 && recorte.quantidade < minimoPorRecorte
      )
      .map((recorte) => recorte.chave)
  );
  if (suprimidos.size === 1) {
    const candidato = recortes
      .filter(
        (recorte) => recorte.quantidade > 0 && !suprimidos.has(recorte.chave)
      )
      .sort((a, b) => a.quantidade - b.quantidade)[0];
    if (candidato) {
      suprimidos.add(candidato.chave);
    }
  }
  return recortes.map((recorte) => ({
    chave: recorte.chave,
    rotulo: recorte.rotulo,
    quantidade: suprimidos.has(recorte.chave) ? null : recorte.quantidade,
    suprimido: suprimidos.has(recorte.chave),
  }));
}

export interface RelatorioAniversariantes {
  mes: number;
  aniversariantes: Aniversariante[];
  /** Opções dos três seletores — as mesmas da lista e do organograma. */
  estrutura_opcoes: OpcoesFiltroEstrutura;
  fichas_sem_data_nascimento: number;
}

export async function relatorioAniversariantes(
  filtro: FiltroAniversariantes
): Promise<RelatorioAniversariantes> {
  // Mês padrão = mês corrente em São Paulo (o banco guarda UTC).
  const mes =
    filtro.mes ??
    Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        month: "numeric",
      }).format(new Date())
    );
  const [aniversariantes, estrutura_opcoes, cobertura] = await Promise.all([
    listarAniversariantes(mes, filtro),
    listarOpcoesDeFiltroEstrutura(),
    // A cobertura é do MESMO recorte: dizer "12 fichas sem data de nascimento"
    // da empresa toda embaixo de um relatório de uma unidade só seria mentira.
    contarCoberturaNascimento(filtro),
  ]);
  return {
    mes,
    aniversariantes,
    estrutura_opcoes,
    fichas_sem_data_nascimento: cobertura.sem_data,
  };
}

export interface RelatorioDiversidade {
  estrutura_opcoes: OpcoesFiltroEstrutura;
  total_quadro: number;
  com_data_nascimento: number;
  sem_data_nascimento: number;
  minimo_por_recorte: number;
  por_genero: RecorteAgregado[];
  por_faixa_idade: RecorteAgregado[];
}

/**
 * A leitura entra em audit.leitura_sensivel mesmo sendo agregada: é o relatório
 * construído sobre gênero autodeclarado, e saber QUEM consulta a composição do
 * quadro é parte do controle que justifica guardar o campo. Aniversariantes e
 * headcount não geram trilha (não há dado de categoria especial neles).
 */
export async function relatorioDiversidade(
  sessao: PayloadSessao,
  filtro: FiltroEstrutura
): Promise<RelatorioDiversidade> {
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "relatorio.ver",
    recurso: "relatorio.diversidade",
    registroId: "agregado",
  });
  const [quadro, genero, idades, cobertura, minimoPorRecorte, opcoes] =
    await Promise.all([
      contarQuadro(filtro),
      contarPorGenero(filtro),
      contarPorIdade(filtro),
      contarCoberturaNascimento(filtro),
      lerMinimoPorRecorte(),
      listarOpcoesDeFiltroEstrutura(),
    ]);
  const porFaixa = FAIXAS_IDADE.map((faixa) => ({
    chave: faixa.chave,
    rotulo: faixa.rotulo,
    quantidade: idades
      .filter((linha) => linha.idade >= faixa.min && linha.idade <= faixa.max)
      .reduce((soma, linha) => soma + linha.quantidade, 0),
  }));
  return {
    estrutura_opcoes: opcoes,
    total_quadro: quadro.total,
    com_data_nascimento: cobertura.com_data,
    sem_data_nascimento: cobertura.sem_data,
    minimo_por_recorte: minimoPorRecorte,
    por_genero: suprimirRecortesPequenos(
      genero.map((linha) => ({
        chave: linha.genero,
        rotulo: ROTULOS_GENERO[linha.genero as Genero],
        quantidade: linha.quantidade,
      })),
      minimoPorRecorte
    ),
    por_faixa_idade: suprimirRecortesPequenos(porFaixa, minimoPorRecorte),
  };
}

export interface RelatorioComposicaoFamiliar {
  estrutura_opcoes: OpcoesFiltroEstrutura;
  total_quadro: number;
  minimo_por_recorte: number;
  idade_limite_crianca: number;
  /** Recortes que cruzam gênero × ter filho — sujeitos à supressão. */
  responsaveis_por_genero: RecorteAgregado[];
  com_conjuge_cadastrado: number;
  total_filhos: number;
  total_criancas: number;
  total_dependentes: number;
}

/** Dado de terceiro (dependentes): mesmo agregado, a leitura deixa trilha. */
export async function relatorioComposicaoFamiliar(
  sessao: PayloadSessao,
  filtro: FiltroEstrutura
): Promise<RelatorioComposicaoFamiliar> {
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "relatorio.ver",
    recurso: "relatorio.composicao_familiar",
    registroId: "agregado",
  });
  const [quadro, bruto, minimoPorRecorte, opcoes] = await Promise.all([
    contarQuadro(filtro),
    agregarComposicaoFamiliar(IDADE_LIMITE_CRIANCA, filtro),
    lerMinimoPorRecorte(),
    listarOpcoesDeFiltroEstrutura(),
  ]);
  return {
    estrutura_opcoes: opcoes,
    total_quadro: quadro.total,
    minimo_por_recorte: minimoPorRecorte,
    idade_limite_crianca: IDADE_LIMITE_CRIANCA,
    responsaveis_por_genero: suprimirRecortesPequenos(
      [
        {
          chave: "maes",
          rotulo: "Mães (gênero feminino com filho cadastrado)",
          quantidade: bruto.com_filho_feminino,
        },
        {
          chave: "pais",
          rotulo: "Pais (gênero masculino com filho cadastrado)",
          quantidade: bruto.com_filho_masculino,
        },
        {
          chave: "outros",
          rotulo: "Outro/não informado com filho cadastrado",
          quantidade: bruto.com_filho_outro_ou_nao_informado,
        },
      ],
      minimoPorRecorte
    ),
    com_conjuge_cadastrado: bruto.com_conjuge,
    total_filhos: bruto.total_filhos,
    total_criancas: bruto.total_criancas,
    total_dependentes: bruto.total_dependentes,
  };
}

export interface RelatorioHeadcount {
  estrutura_opcoes: OpcoesFiltroEstrutura;
  total_quadro: number;
  ativos: number;
  afastados: number;
  /** Os TRÊS campos, cada um com sua contagem — não são a mesma pergunta. */
  por_registro: { rotulo: string; quantidade: number }[];
  por_lotacao: { rotulo: string; quantidade: number }[];
  por_centro_custo: { rotulo: string; quantidade: number }[];
  por_cargo: { rotulo: string; quantidade: number }[];
  por_vinculo: { rotulo: string; quantidade: number }[];
}

export async function relatorioHeadcount(
  filtro: FiltroEstrutura
): Promise<RelatorioHeadcount> {
  const [quadro, registros, lotacoes, centros, cargos, vinculos, opcoes] =
    await Promise.all([
      contarQuadro(filtro),
      contarHeadcountPorCampoDaEstrutura("empresa", filtro),
      contarHeadcountPorCampoDaEstrutura("lotacao", filtro),
      contarHeadcountPorCampoDaEstrutura("centro_custo", filtro),
      contarHeadcountPorCargo(filtro),
      contarHeadcountPorVinculo(filtro),
      listarOpcoesDeFiltroEstrutura(),
    ]);
  return {
    estrutura_opcoes: opcoes,
    total_quadro: quadro.total,
    ativos: quadro.ativos,
    afastados: quadro.afastados,
    por_registro: registros,
    por_lotacao: lotacoes,
    por_centro_custo: centros,
    por_cargo: cargos,
    por_vinculo: vinculos.map((linha) => ({
      rotulo: ROTULOS_VINCULO[linha.tipo_vinculo],
      quantidade: linha.quantidade,
    })),
  };
}

// ------------------------------------------------------------------ parâmetro de privacidade (0044)

export interface PainelPrivacidade extends ParametroPrivacidadeVigente {
  minimo: number;
  maximo: number;
  padrao: number;
}

/** Leitura para a tela: valor vigente, quem mexeu por último e os limites. */
export async function obterParametroPrivacidade(): Promise<PainelPrivacidade> {
  const vigente = await lerParametroPrivacidade();
  return {
    ...vigente,
    minimo: MINIMO_POR_RECORTE_MIN,
    maximo: MINIMO_POR_RECORTE_MAX,
    padrao: MINIMO_POR_RECORTE_PADRAO,
  };
}

/**
 * Muda o piso de anonimato. Exigir a chave é da rota; aqui vale a regra do
 * dado: valor dentro dos limites e ALTERAÇÃO NA TRILHA, na mesma transação —
 * baixar o k publica recorte que estava suprimido, e essa é uma decisão que
 * precisa ter dono e data.
 */
export async function alterarParametroPrivacidade(
  sessao: PayloadSessao,
  dados: unknown
): Promise<PainelPrivacidade> {
  const analise = esquemaParametroPrivacidade.safeParse(dados);
  if (!analise.success) {
    throw new ErroHttpCampo(
      400,
      analise.error.issues[0]?.message ?? "Valor inválido",
      "minimo_por_recorte"
    );
  }
  const antes = await lerParametroPrivacidade();
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const novo = await gravarMinimoPorRecorte(
      cliente,
      sessao.usuario_id,
      analise.data.minimo_por_recorte
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "privacidade.minimo_por_recorte.alterar",
      tabela: "sistema.parametro_privacidade",
      registroId: "1",
      diff: {
        "Piso de anonimato (k)": {
          de: String(antes.minimo_por_recorte),
          para: String(novo),
        },
      },
    });
  });
  return obterParametroPrivacidade();
}
