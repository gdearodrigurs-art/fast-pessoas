import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp, lerSessao } from "../../lib/sessao";
import { armazenamentoBytea } from "../documentos/armazenamento";
import {
  CATEGORIA_PESQUISA_SOCIAL,
  formatarTamanho,
  TAMANHO_MAXIMO_BYTES,
} from "../documentos/esquemas";
import {
  calcularPrazosExperiencia,
  ROTULOS_ESTADO_PROCESSO,
} from "../admissao/esquemas";
import {
  buscarChecklistAtivo,
  criarProcesso,
  inserirItens,
} from "../admissao/repositorio";
import { ROTULOS_VINCULO } from "../colaboradores/esquemas";
import {
  buscarPessoaPorCpf,
  criar as criarColaborador,
  criarPessoa,
  inserirEvento,
  registrarLeituraSensivel,
  vincularContaAPessoa,
} from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { criar as criarUsuario } from "../usuarios/repositorio";
import { gerarSenhaTemporaria } from "../usuarios/servico";
import {
  bloqueioDeAvancoPesquisaSocial,
  CriacaoCandidato,
  CriacaoCandidatura,
  CriacaoModelo,
  CriacaoOferta,
  CriacaoParecer,
  CriacaoRequisicao,
  CriacaoVaga,
  dataCorteExpurgo,
  DecisaoRequisicao,
  IniciarAdmissao,
  MESES_CONSENTIMENTO_PADRAO,
  Movimentacao,
  RegistroPesquisaSocial,
  RespostaOferta,
  TrocaModeloVaga,
  validarSequenciaDeEtapas,
  ROTULOS_MOTIVO_MOVIMENTACAO,
  ROTULOS_MOTIVO_REQUISICAO,
  ROTULOS_RECOMENDACAO,
  ROTULOS_RESULTADO_PESQUISA_SOCIAL,
  ROTULOS_STATUS_CANDIDATURA,
  ROTULOS_STATUS_OFERTA,
  ROTULOS_STATUS_REQUISICAO,
  ROTULOS_STATUS_VAGA,
} from "./esquemas";
import {
  apagarDocumentoDoExpurgo,
  apurarTempoPorEtapa,
  apurarVagasNoPrazo,
  atualizarCandidatura,
  atualizarModeloDaVaga,
  atualizarStatusVaga,
  buscarAnexoPesquisaSocial,
  buscarCandidaturaBasica,
  buscarCandidaturaParaMutacao,
  buscarCandidatoBasico,
  buscarCargoVersaoVigente,
  buscarEstabelecimentoVersaoAtiva,
  buscarEtapasDoModelo,
  buscarModeloAtivo,
  buscarModeloPadrao,
  buscarModeloParaMutacao,
  buscarNomeModelo,
  buscarFaixaVigente,
  buscarOfertaParaMutacao,
  buscarPesquisaSocial,
  buscarRequisicaoParaMutacao,
  buscarVaga,
  buscarVagaParaMutacao,
  CandidatoResumo,
  CandidaturaKanban,
  CargoDisponivel,
  contarCandidaturasDaVaga,
  encerrarModelo,
  EstabelecimentoDisponivel,
  EtapaAtiva,
  gravarDecisaoRequisicao,
  inserirCandidato,
  inserirCandidatura,
  inserirEtapasNoModelo,
  inserirModelo,
  inserirMovimentacao,
  inserirOferta,
  inserirParecer,
  inserirPesquisaSocial,
  inserirRequisicao,
  inserirVaga,
  listarCandidatos,
  listarCandidaturasDaVaga,
  listarCargosDisponiveis,
  listarEstabelecimentosAtivos,
  listarEtapasAtivas,
  listarEtapasDoModelo,
  listarModelos,
  listarModelosEncerrados,
  listarPareceres,
  listarPesquisasParaExpurgo,
  listarRequisicoes,
  listarVagas,
  expurgarPesquisa,
  ModeloResumo,
  ParecerSelecao,
  responderOferta as gravarRespostaOferta,
  RequisicaoResumo,
  TempoPorEtapa,
  VagaResumo,
} from "./repositorio";

const TABELA_REQUISICAO = "rh.requisicao_vaga";
const TABELA_VAGA = "rh.vaga";
const TABELA_CANDIDATO = "rh.candidato";
const TABELA_CANDIDATURA = "rh.candidatura";
const TABELA_PARECER = "rh.parecer_selecao";
const TABELA_OFERTA = "rh.oferta";
const TABELA_MODELO = "rh.modelo_selecao_versao";

// ------------------------------------------------------------------ utilidades

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarSalario(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function truncar(texto: string, limite: number): string {
  return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

/** Data-calendário de hoje em São Paulo (AAAA-MM-DD). */
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function somarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1 + meses, dia))
    .toISOString()
    .slice(0, 10);
}

// ------------------------------------------------------------------ sessão e permissões do módulo

export interface PermissoesRs {
  ver: boolean;
  gerir: boolean;
  requisicao_criar: boolean;
  requisicao_decidir: boolean;
  parecer_registrar: boolean;
  parecer_ver: boolean;
}

async function permissoesDe(usuarioId: number): Promise<PermissoesRs> {
  const linhas = await consultar<{
    ver: boolean;
    gerir: boolean;
    requisicao_criar: boolean;
    requisicao_decidir: boolean;
    parecer_registrar: boolean;
    parecer_ver: boolean;
  }>(
    `SELECT sistema.tem_permissao($1, 'rs.ver')                AS ver,
            sistema.tem_permissao($1, 'rs.gerir')              AS gerir,
            sistema.tem_permissao($1, 'rs.requisicao.criar')   AS requisicao_criar,
            sistema.tem_permissao($1, 'rs.requisicao.decidir') AS requisicao_decidir,
            sistema.tem_permissao($1, 'rs.parecer.registrar')  AS parecer_registrar,
            sistema.tem_permissao($1, 'rs.parecer.ver')        AS parecer_ver`,
    [usuarioId]
  );
  return linhas[0];
}

/**
 * Rotas cujo acesso combina MAIS de uma chave (painel, kanban, pareceres):
 * valida a sessão como exigirPermissao e devolve o conjunto de permissões —
 * a regra de qual chave basta fica no serviço.
 */
export async function exigirSessaoRs(): Promise<{
  sessao: PayloadSessao;
  pode: PermissoesRs;
}> {
  const sessao = await lerSessao();
  if (!sessao) {
    throw new ErroHttp(401, "Não autenticado");
  }
  if (sessao.pendente_2fa) {
    throw new ErroHttp(
      403,
      "Configure a autenticação em duas etapas para continuar"
    );
  }
  return { sessao, pode: await permissoesDe(sessao.usuario_id) };
}

/** Escopo do gestor sem rs.ver: só a vaga que nasceu da SUA requisição. */
function acessaVaga(
  pode: PermissoesRs,
  usuarioId: number,
  solicitanteUsuarioId: number
): boolean {
  return pode.ver || pode.gerir || solicitanteUsuarioId === usuarioId;
}

// ------------------------------------------------------------------ painel

export interface PainelRecrutamento {
  pode: PermissoesRs;
  requisicoes: RequisicaoResumo[];
  vagas: VagaResumo[];
  etapas: EtapaAtiva[];
  /** Catálogo para o formulário de requisição — só para quem cria. */
  cargos: CargoDisponivel[] | null;
  estabelecimentos: EstabelecimentoDisponivel[] | null;
  /** Titulares externos — payload só de quem gere a seleção. */
  candidatos: CandidatoResumo[] | null;
  indicador_vagas_no_prazo: number | null;
}

export async function montarPainel(
  sessao: PayloadSessao,
  pode: PermissoesRs
): Promise<PainelRecrutamento> {
  if (!pode.ver && !pode.gerir && !pode.requisicao_criar) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  const veTudo = pode.ver || pode.gerir;
  const [requisicoes, vagas, etapas, cargos, estabelecimentos, candidatos, indicador] =
    await Promise.all([
      listarRequisicoes(veTudo ? undefined : sessao.usuario_id),
      listarVagas(veTudo ? undefined : sessao.usuario_id),
      listarEtapasAtivas(),
      pode.requisicao_criar || pode.gerir ? listarCargosDisponiveis() : null,
      pode.requisicao_criar || pode.gerir ? listarEstabelecimentosAtivos() : null,
      pode.gerir ? listarCandidatos() : null,
      veTudo ? apurarVagasNoPrazo() : null,
    ]);
  return {
    pode,
    requisicoes,
    vagas,
    etapas,
    cargos,
    estabelecimentos,
    candidatos,
    indicador_vagas_no_prazo: indicador,
  };
}

// ------------------------------------------------------------------ requisição de vaga

export async function criarRequisicao(
  sessao: PayloadSessao,
  dados: CriacaoRequisicao
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const cargoVersao = await buscarCargoVersaoVigente(cliente, dados.cargo_id);
    if (!cargoVersao) {
      throw new ErroHttpCampo(
        400,
        "Cargo inexistente ou sem versão vigente.",
        "cargo_id"
      );
    }
    let unidade: string | null = null;
    let estabelecimentoVersaoId: number | null = null;
    if (dados.estabelecimento_id != null) {
      const versao = await buscarEstabelecimentoVersaoAtiva(
        cliente,
        dados.estabelecimento_id
      );
      if (!versao) {
        throw new ErroHttpCampo(
          400,
          "Unidade inexistente ou sem versão ativa.",
          "estabelecimento_id"
        );
      }
      estabelecimentoVersaoId = versao.id;
      unidade = versao.unidade;
    }
    const id = await inserirRequisicao(cliente, {
      cargo_versao_id: cargoVersao.id,
      estabelecimento_versao_id: estabelecimentoVersaoId,
      motivo: dados.motivo,
      justificativa: dados.justificativa,
      solicitante_usuario_id: sessao.usuario_id,
    });
    const diff: Diff = {
      Cargo: { de: null, para: cargoVersao.nome },
      Motivo: { de: null, para: ROTULOS_MOTIVO_REQUISICAO[dados.motivo] },
      Justificativa: { de: null, para: truncar(dados.justificativa, 500) },
      Status: { de: null, para: ROTULOS_STATUS_REQUISICAO.solicitada },
    };
    if (unidade) {
      diff.Unidade = { de: null, para: unidade };
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_REQUISICAO,
      registroId: String(id),
      diff,
    });
  });
}

export async function decidirRequisicao(
  sessao: PayloadSessao,
  id: number,
  dados: DecisaoRequisicao
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const requisicao = await buscarRequisicaoParaMutacao(cliente, id);
    if (!requisicao) {
      throw new ErroHttp(404, "Requisição não encontrada.");
    }
    if (requisicao.status !== "solicitada") {
      throw new ErroHttp(
        409,
        `Requisição já ${ROTULOS_STATUS_REQUISICAO[requisicao.status].toLowerCase()} — decisão é única.`
      );
    }
    const status = dados.decisao === "aprovar" ? "aprovada" : "reprovada";
    await gravarDecisaoRequisicao(cliente, id, {
      status,
      decisor_usuario_id: sessao.usuario_id,
      motivo_decisao: dados.motivo,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_REQUISICAO,
      registroId: String(id),
      diff: {
        Cargo: { de: null, para: requisicao.cargo_nome },
        Status: {
          de: ROTULOS_STATUS_REQUISICAO.solicitada,
          para: ROTULOS_STATUS_REQUISICAO[status],
        },
        "Motivo da decisão": { de: null, para: truncar(dados.motivo, 500) },
      },
    });
  });
}

// ------------------------------------------------------------------ vaga

export async function criarVaga(
  sessao: PayloadSessao,
  dados: CriacaoVaga
): Promise<number> {
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const requisicao = await buscarRequisicaoParaMutacao(
        cliente,
        dados.requisicao_id
      );
      if (!requisicao) {
        throw new ErroHttpCampo(
          404,
          "Requisição não encontrada.",
          "requisicao_id"
        );
      }
      if (requisicao.status !== "aprovada") {
        throw new ErroHttp(409, "Só requisição aprovada abre vaga.");
      }
      // Snapshot congelado: mudança futura da tabela não mexe na vaga aberta.
      const faixa = await buscarFaixaVigente(cliente, requisicao.cargo_id);
      if (!faixa) {
        throw new ErroHttp(
          409,
          `O cargo ${requisicao.cargo_nome} não tem faixa salarial vigente — cadastre a faixa antes de abrir a vaga.`
        );
      }
      // A vaga congela um modelo de processo na abertura (0077); a candidatura
      // vai andar pelas etapas deste modelo. Quem abre pode escolher um modelo
      // alternativo ativo; sem escolha, vale o GERAL (padrão).
      let modeloVersaoId: number | null;
      if (dados.modelo_versao_id !== undefined) {
        modeloVersaoId = await buscarModeloAtivo(cliente, dados.modelo_versao_id);
        if (modeloVersaoId === null) {
          throw new ErroHttpCampo(
            409,
            "O modelo de processo escolhido não está ativo.",
            "modelo_versao_id"
          );
        }
      } else {
        modeloVersaoId = await buscarModeloPadrao(cliente);
        if (modeloVersaoId === null) {
          throw new ErroHttp(
            409,
            "Não há modelo de processo seletivo padrão ativo — configure o modelo antes de abrir vagas."
          );
        }
      }
      const id = await inserirVaga(cliente, {
        requisicao_id: dados.requisicao_id,
        titulo: dados.titulo,
        faixa_min: faixa.faixa_min,
        faixa_max: faixa.faixa_max,
        prazo_alvo: dados.prazo_alvo,
        modelo_versao_id: modeloVersaoId,
      });
      // Rastro (eixo 8): o modelo congelado muda o pipeline inteiro da vaga —
      // a criação tem que registrar por qual processo a seleção vai correr.
      const modeloNome =
        (await buscarNomeModelo(cliente, modeloVersaoId)) ??
        `#${modeloVersaoId}`;
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_VAGA,
        registroId: String(id),
        diff: {
          "Requisição": {
            de: null,
            para: `#${requisicao.id} — ${requisicao.cargo_nome}`,
          },
          "Título": { de: null, para: dados.titulo },
          "Faixa congelada": {
            de: null,
            para: `${formatarSalario(faixa.faixa_min)} a ${formatarSalario(faixa.faixa_max)}`,
          },
          "Modelo de processo": { de: null, para: modeloNome },
          "Prazo-alvo": { de: null, para: formatarData(dados.prazo_alvo) },
          Status: { de: null, para: ROTULOS_STATUS_VAGA.aberta },
        },
      });
      return id;
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "vaga_requisicao_id_key") {
      throw new ErroHttpCampo(
        409,
        "Esta requisição já tem vaga criada.",
        "requisicao_id"
      );
    }
    throw erro;
  }
}

/**
 * Troca o modelo de processo CONGELADO de uma vaga. Decisão G1 (docs/20):
 * reformular um modelo NÃO migra vaga aberta — ela fica na versão antiga e a
 * troca é manual, por aqui, e só enquanto NINGUÉM entrou no pipeline. Com
 * qualquer candidatura (ativa ou encerrada) o modelo é história congelada:
 * trocá-lo reescreveria por qual processo as pessoas passaram.
 */
export async function trocarModeloDaVaga(
  sessao: PayloadSessao,
  vagaId: number,
  dados: TrocaModeloVaga
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const vaga = await buscarVagaParaMutacao(cliente, vagaId);
    if (!vaga) {
      throw new ErroHttp(404, "Vaga não encontrada.");
    }
    if (vaga.status !== "aberta") {
      throw new ErroHttp(
        409,
        `Vaga ${ROTULOS_STATUS_VAGA[vaga.status].toLowerCase()} não troca de modelo — só vaga aberta.`
      );
    }
    const candidaturas = await contarCandidaturasDaVaga(cliente, vagaId);
    if (candidaturas > 0) {
      throw new ErroHttp(
        409,
        `Esta vaga já tem ${candidaturas} candidatura(s) — o processo segue na versão em que começou; o modelo não muda mais.`
      );
    }
    if (dados.modelo_versao_id === vaga.modelo_versao_id) {
      throw new ErroHttpCampo(
        409,
        "A vaga já usa este modelo.",
        "modelo_versao_id"
      );
    }
    const novoModeloId = await buscarModeloAtivo(
      cliente,
      dados.modelo_versao_id
    );
    if (novoModeloId === null) {
      throw new ErroHttpCampo(
        409,
        "O modelo de processo escolhido não está ativo.",
        "modelo_versao_id"
      );
    }
    await atualizarModeloDaVaga(cliente, vagaId, novoModeloId);
    const nomeAntigo =
      (await buscarNomeModelo(cliente, vaga.modelo_versao_id)) ??
      `#${vaga.modelo_versao_id}`;
    const nomeNovo =
      (await buscarNomeModelo(cliente, novoModeloId)) ?? `#${novoModeloId}`;
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_VAGA,
      registroId: String(vagaId),
      diff: {
        "Título": { de: null, para: vaga.titulo },
        "Modelo de processo": { de: nomeAntigo, para: nomeNovo },
      },
    });
  });
}

// ------------------------------------------------------------------ administração dos modelos de processo

export interface PainelModelosSelecao {
  modelos: ModeloResumo[];
  /** Histórico da série: versões encerradas (reformuladas ou aposentadas). */
  encerrados: ModeloResumo[];
  /** Catálogo de etapas disponíveis para montar um modelo. */
  catalogo: EtapaAtiva[];
}

/** Painel de administração dos modelos de processo — só quem gere a seleção. */
export async function obterModelosSelecao(
  pode: PermissoesRs
): Promise<PainelModelosSelecao> {
  if (!pode.gerir) {
    throw new ErroHttp(
      403,
      "Sem permissão para administrar modelos de processo."
    );
  }
  const [modelos, encerrados, catalogo] = await Promise.all([
    listarModelos(),
    listarModelosEncerrados(),
    listarEtapasAtivas(),
  ]);
  return { modelos, encerrados, catalogo };
}

/**
 * A regra de desenho (etapas do catálogo, sem repetição, oferta por último)
 * vive pura em validarSequenciaDeEtapas — criar e reformular usam a MESMA; o
 * que muda é só de onde nasce a versão. Aqui ela vira erro HTTP no campo.
 */
async function exigirSequenciaValida(etapaIds: number[]): Promise<EtapaAtiva[]> {
  const catalogo = await listarEtapasAtivas();
  const resultado = validarSequenciaDeEtapas(catalogo, etapaIds);
  if (!resultado.ok) {
    throw new ErroHttpCampo(resultado.status, resultado.mensagem, "etapa_ids");
  }
  // As escolhidas vêm do próprio catálogo — o cast só devolve a forma completa.
  return resultado.etapas as EtapaAtiva[];
}

/**
 * Cria um modelo de processo alternativo (nasce ATIVO, não-padrão). As etapas
 * têm que ser do catálogo vigente, sem repetição, e terminar na etapa de
 * OFERTA — senão a candidatura nunca alcançaria a proposta (é onde o valor
 * é registrado). Os ids/ordem viram imutáveis: mudar o desenho = reformular.
 */
export async function criarModelo(
  sessao: PayloadSessao,
  pode: PermissoesRs,
  dados: CriacaoModelo
): Promise<number> {
  if (!pode.gerir) {
    throw new ErroHttp(
      403,
      "Sem permissão para administrar modelos de processo."
    );
  }
  const escolhidas = await exigirSequenciaValida(dados.etapa_ids);

  return await comTransacao(sessao.usuario_id, async (cliente) => {
    const id = await inserirModelo(cliente, {
      nome: dados.nome,
      padrao: false,
      continua_de: null,
    });
    await inserirEtapasNoModelo(cliente, id, dados.etapa_ids);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_MODELO,
      registroId: String(id),
      diff: {
        Nome: { de: null, para: dados.nome },
        Etapas: {
          de: null,
          para: escolhidas.map((etapa) => etapa.nome).join(" → "),
        },
      },
    });
    return id;
  });
}

/**
 * Reformular: encerra a versão ativa e publica a nova ligada a ela
 * (continua_de) na MESMA transação — molde do clima (0075). O modelo PADRÃO
 * (GERAL) também passa por aqui e a versão nova HERDA padrao=true no mesmo
 * ato (decisão G2): o índice de um-padrão-ativo da 0076 só admite um por vez,
 * por isso a anterior é encerrada ANTES do INSERT. Vaga aberta NÃO migra
 * (decisão G1): fica congelada na versão antiga; a troca é o PATCH da vaga.
 */
export async function reformularModelo(
  sessao: PayloadSessao,
  pode: PermissoesRs,
  id: number,
  dados: CriacaoModelo
): Promise<number> {
  if (!pode.gerir) {
    throw new ErroHttp(
      403,
      "Sem permissão para administrar modelos de processo."
    );
  }
  const escolhidas = await exigirSequenciaValida(dados.etapa_ids);

  return await comTransacao(sessao.usuario_id, async (cliente) => {
    const anterior = await buscarModeloParaMutacao(cliente, id);
    if (!anterior) {
      throw new ErroHttp(404, "Modelo não encontrado.");
    }
    if (anterior.status !== "ativa") {
      throw new ErroHttp(409, "Só um modelo ativo pode ser reformulado.");
    }
    await encerrarModelo(cliente, id);
    const novoId = await inserirModelo(cliente, {
      nome: dados.nome,
      padrao: anterior.padrao,
      continua_de: id,
    });
    await inserirEtapasNoModelo(cliente, novoId, dados.etapa_ids);
    const diff: Diff = {
      Reformula: { de: `#${id}: ${anterior.nome}`, para: dados.nome },
      Etapas: {
        de: null,
        para: escolhidas.map((etapa) => etapa.nome).join(" → "),
      },
    };
    if (anterior.padrao) {
      diff["Padrão (GERAL)"] = { de: null, para: "herdado da versão anterior" };
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_MODELO,
      registroId: String(novoId),
      diff,
    });
    return novoId;
  });
}

/**
 * Aposentar: encerra sem substituto — o modelo sai da oferta de vaga nova.
 * Vagas que o congelaram continuam correndo por ele (0077). O GERAL não se
 * aposenta: toda vaga nova nasce dele; para mudar o desenho, reformule-o.
 */
export async function aposentarModelo(
  sessao: PayloadSessao,
  pode: PermissoesRs,
  id: number
): Promise<void> {
  if (!pode.gerir) {
    throw new ErroHttp(
      403,
      "Sem permissão para administrar modelos de processo."
    );
  }
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const modelo = await buscarModeloParaMutacao(cliente, id);
    if (!modelo) {
      throw new ErroHttp(404, "Modelo não encontrado.");
    }
    if (modelo.status !== "ativa") {
      throw new ErroHttp(409, "Só um modelo ativo pode ser aposentado.");
    }
    if (modelo.padrao) {
      throw new ErroHttp(
        409,
        "O modelo GERAL (padrão) não se aposenta — toda vaga nova nasce dele. Para mudar o desenho, use “Reformular”."
      );
    }
    await encerrarModelo(cliente, id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_MODELO,
      registroId: String(id),
      diff: {
        Nome: { de: null, para: modelo.nome },
        Situação: {
          de: "ativa",
          para: "aposentado (encerrado, sem substituto)",
        },
      },
    });
  });
}

// ------------------------------------------------------------------ kanban da vaga

export interface KanbanVaga {
  vaga: VagaResumo;
  etapas: EtapaAtiva[];
  candidaturas: CandidaturaKanban[];
}

export async function obterKanban(
  sessao: PayloadSessao,
  pode: PermissoesRs,
  vagaId: number
): Promise<KanbanVaga> {
  const vaga = await buscarVaga(vagaId);
  if (!vaga || !acessaVaga(pode, sessao.usuario_id, vaga.solicitante_usuario_id)) {
    // Fora do escopo = ausência, não máscara.
    throw new ErroHttp(404, "Vaga não encontrada.");
  }
  const [etapas, candidaturas] = await Promise.all([
    // Colunas do kanban pelas etapas DO MODELO congelado da vaga (0077) — o par
    // de leitura do pipeline; a escrita (criar/mover candidatura) já anda por aqui.
    listarEtapasDoModelo(vaga.modelo_versao_id),
    listarCandidaturasDaVaga(vagaId),
  ]);
  const veSensivel = pode.ver || pode.gerir;
  const saida = candidaturas.map((candidatura) => ({
    ...candidatura,
    // Contato do titular externo AUSENTE de quem não tem rs.ver/rs.gerir.
    candidato_email: veSensivel ? candidatura.candidato_email : null,
    candidato_telefone: veSensivel ? candidatura.candidato_telefone : null,
    // Valor da oferta é salário: gestor vê a faixa, nunca o valor final.
    oferta_valor: veSensivel ? candidatura.oferta_valor : null,
    oferta_dentro_banda: veSensivel ? candidatura.oferta_dentro_banda : null,
    // Pesquisa social (G3:a): desfecho e existência do anexo SÓ para rs.gerir
    // — mais restrito que o valor da oferta (rs.ver não alcança).
    pesquisa_social_resultado: pode.gerir
      ? candidatura.pesquisa_social_resultado
      : null,
    pesquisa_social_tem_anexo: pode.gerir
      ? candidatura.pesquisa_social_tem_anexo
      : null,
  }));
  if (veSensivel && saida.some((c) => c.oferta_valor !== null)) {
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: pode.gerir ? "rs.gerir" : "rs.ver",
      recurso: "recrutamento.oferta_valor",
      registroId: String(vagaId),
    });
  }
  // Desfecho de pesquisa social exibido = leitura sensível de terceiro (eixo
  // 8), trilhada com a chave que de fato autorizou (G3:a — rs.gerir).
  if (pode.gerir && saida.some((c) => c.pesquisa_social_resultado !== null)) {
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: "rs.gerir",
      recurso: "recrutamento.pesquisa_social",
      registroId: String(vagaId),
    });
  }
  return { vaga, etapas, candidaturas: saida };
}

// ------------------------------------------------------------------ candidato (titular externo — LGPD)

export async function criarCandidato(
  sessao: PayloadSessao,
  dados: CriacaoCandidato
): Promise<number> {
  // Consentimento LGPD é obrigatório no cadastro manual; sem prazo informado
  // vale a retenção estendida padrão (hoje + 6 meses, banco de talentos).
  const consentidoAte =
    dados.consentido_ate ??
    somarMeses(hojeSaoPaulo(), MESES_CONSENTIMENTO_PADRAO);
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const id = await inserirCandidato(cliente, {
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone ?? null,
        cpf: dados.cpf ?? null,
        origem: dados.origem,
        consentimento_lgpd: dados.consentimento_lgpd,
        consentido_ate: consentidoAte,
      });
      const diff: Diff = {
        Nome: { de: null, para: dados.nome },
        "E-mail": { de: null, para: dados.email },
        "Consentimento LGPD": { de: null, para: "Sim" },
        "Consentido até": { de: null, para: formatarData(consentidoAte) },
      };
      if (dados.telefone) {
        diff.Telefone = { de: null, para: dados.telefone };
      }
      if (dados.cpf) {
        diff.CPF = { de: null, para: dados.cpf };
      }
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_CANDIDATO,
        registroId: String(id),
        diff,
      });
      return id;
    });
  } catch (erro) {
    const restricao = violacaoUnica(erro);
    if (restricao === "candidato_email_unico") {
      throw new ErroHttpCampo(
        409,
        "Já existe candidato com este e-mail — a candidatura nova anexa ao mesmo cadastro.",
        "email"
      );
    }
    if (restricao === "candidato_cpf_unico") {
      throw new ErroHttpCampo(
        409,
        "Já existe candidato com este CPF — a candidatura nova anexa ao mesmo cadastro.",
        "cpf"
      );
    }
    throw erro;
  }
}

// ------------------------------------------------------------------ candidatura e pipeline

export async function criarCandidatura(
  sessao: PayloadSessao,
  dados: CriacaoCandidatura
): Promise<void> {
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      const vaga = await buscarVagaParaMutacao(cliente, dados.vaga_id);
      if (!vaga) {
        throw new ErroHttpCampo(404, "Vaga não encontrada.", "vaga_id");
      }
      if (vaga.status !== "aberta") {
        throw new ErroHttp(
          409,
          `Vaga ${ROTULOS_STATUS_VAGA[vaga.status].toLowerCase()} não recebe candidatura.`
        );
      }
      const candidato = await buscarCandidatoBasico(cliente, dados.candidato_id);
      if (!candidato) {
        throw new ErroHttpCampo(
          404,
          "Candidato não encontrado.",
          "candidato_id"
        );
      }
      const etapas = await buscarEtapasDoModelo(cliente, vaga.modelo_versao_id);
      if (etapas.length === 0) {
        throw new ErroHttp(
          409,
          "O modelo de processo desta vaga não tem etapas — configure o modelo antes."
        );
      }
      const etapaInicial = etapas[0];
      const id = await inserirCandidatura(cliente, {
        vaga_id: dados.vaga_id,
        candidato_id: dados.candidato_id,
        etapa_atual_id: etapaInicial.etapa_selecao_versao_id,
      });
      await inserirMovimentacao(cliente, {
        candidatura_id: id,
        de_etapa_id: null,
        para_etapa_id: etapaInicial.etapa_selecao_versao_id,
        novo_status: null,
        motivo_catalogo: null,
        observacao: null,
        por_usuario_id: sessao.usuario_id,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_CANDIDATURA,
        registroId: String(id),
        diff: {
          Vaga: { de: null, para: vaga.titulo },
          Candidato: { de: null, para: candidato.nome },
          "Etapa inicial": { de: null, para: etapaInicial.nome },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "candidatura_vaga_id_candidato_id_key") {
      throw new ErroHttpCampo(
        409,
        "Este candidato já tem candidatura nesta vaga.",
        "candidato_id"
      );
    }
    throw erro;
  }
}

export async function movimentarCandidatura(
  sessao: PayloadSessao,
  candidaturaId: number,
  dados: Movimentacao
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const candidatura = await buscarCandidaturaParaMutacao(
      cliente,
      candidaturaId
    );
    if (!candidatura) {
      throw new ErroHttp(404, "Candidatura não encontrada.");
    }
    if (candidatura.status !== "ativa") {
      throw new ErroHttp(
        409,
        `Candidatura ${ROTULOS_STATUS_CANDIDATURA[candidatura.status].toLowerCase()} não movimenta — o histórico é definitivo.`
      );
    }
    if (candidatura.vaga_status !== "aberta") {
      throw new ErroHttp(
        409,
        `Vaga ${ROTULOS_STATUS_VAGA[candidatura.vaga_status].toLowerCase()} não movimenta candidaturas.`
      );
    }

    if (dados.acao === "avancar") {
      // GATE da pesquisa social (#13c): da etapa só se avança com desfecho
      // APROVADO — sem desfecho a etapa não aconteceu; reprovado não avança
      // (o caminho é reprovar com motivo do catálogo ou registrar desistência).
      if (candidatura.etapa_tipo === "pesquisa_social") {
        const pesquisa = await buscarPesquisaSocial(cliente, candidaturaId);
        const bloqueio = bloqueioDeAvancoPesquisaSocial(
          candidatura.etapa_tipo,
          pesquisa?.resultado ?? null
        );
        if (bloqueio) {
          throw new ErroHttp(409, bloqueio);
        }
      }
      // Anda pelas etapas DO MODELO congelado na vaga (0077), não pela lista
      // global viva: a próxima é a seguinte à etapa atual na ordem do modelo.
      const etapas = await buscarEtapasDoModelo(
        cliente,
        candidatura.modelo_versao_id
      );
      const indiceAtual = etapas.findIndex(
        (etapa) => etapa.etapa_selecao_versao_id === candidatura.etapa_atual_id
      );
      const proxima =
        indiceAtual >= 0 ? etapas[indiceAtual + 1] : undefined;
      if (!proxima) {
        throw new ErroHttp(
          409,
          "Candidato já está na última etapa — registre a oferta."
        );
      }
      await atualizarCandidatura(cliente, candidaturaId, {
        etapa_atual_id: proxima.etapa_selecao_versao_id,
      });
      await inserirMovimentacao(cliente, {
        candidatura_id: candidaturaId,
        de_etapa_id: candidatura.etapa_atual_id,
        para_etapa_id: proxima.etapa_selecao_versao_id,
        novo_status: null,
        motivo_catalogo: null,
        observacao: dados.observacao ?? null,
        por_usuario_id: sessao.usuario_id,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "transicao",
        tabela: TABELA_CANDIDATURA,
        registroId: String(candidaturaId),
        diff: {
          Candidato: { de: null, para: candidatura.candidato_nome },
          Vaga: { de: null, para: candidatura.vaga_titulo },
          Etapa: { de: candidatura.etapa_nome, para: proxima.nome },
        },
      });
      return;
    }

    // Reprovação: motivo SEMPRE do catálogo controlado (Lei 9.029) — o zod
    // já exige, o banco confere de novo.
    const motivo = dados.motivo_catalogo;
    if (!motivo) {
      throw new ErroHttpCampo(
        400,
        "Reprovação exige motivo do catálogo.",
        "motivo_catalogo"
      );
    }
    // "Desistência" é desfecho do CANDIDATO, não da empresa: reprovar dizendo
    // que ele desistiu é um registro contraditório e frágil como defesa (Lei
    // 9.029). A tela já esconde a opção; o servidor tem que recusar também,
    // senão um POST direto grava a incoerência.
    if (motivo === "desistencia") {
      throw new ErroHttpCampo(
        400,
        "Desistência não é motivo de reprovação — a empresa reprova, o candidato desiste.",
        "motivo_catalogo"
      );
    }
    await atualizarCandidatura(cliente, candidaturaId, { status: "reprovada" });
    await inserirMovimentacao(cliente, {
      candidatura_id: candidaturaId,
      de_etapa_id: candidatura.etapa_atual_id,
      para_etapa_id: null,
      novo_status: "reprovada",
      motivo_catalogo: motivo,
      observacao: dados.observacao ?? null,
      por_usuario_id: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_CANDIDATURA,
      registroId: String(candidaturaId),
      diff: {
        Candidato: { de: null, para: candidatura.candidato_nome },
        Vaga: { de: null, para: candidatura.vaga_titulo },
        Status: {
          de: ROTULOS_STATUS_CANDIDATURA.ativa,
          para: ROTULOS_STATUS_CANDIDATURA.reprovada,
        },
        Motivo: { de: null, para: ROTULOS_MOTIVO_MOVIMENTACAO[motivo] },
      },
    });
  });
}

// ------------------------------------------------------------------ parecer (restrito)

export async function listarPareceresCandidatura(
  sessao: PayloadSessao,
  pode: PermissoesRs,
  candidaturaId: number
): Promise<{ pareceres: ParecerSelecao[]; ve_todos: boolean }> {
  if (!pode.parecer_ver && !pode.parecer_registrar) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  const candidatura = await buscarCandidaturaBasica(candidaturaId);
  if (
    !candidatura ||
    !acessaVaga(pode, sessao.usuario_id, candidatura.solicitante_usuario_id)
  ) {
    throw new ErroHttp(404, "Candidatura não encontrada.");
  }
  // Gestor registra mas não vê os dos outros: sem rs.parecer.ver, o payload
  // traz apenas os pareceres do próprio avaliador.
  const veTodos = pode.parecer_ver;
  const pareceres = await listarPareceres(
    candidaturaId,
    veTodos
      ? { todos: true }
      : { todos: false, avaliadorUsuarioId: sessao.usuario_id }
  );
  if (veTodos && pareceres.length > 0) {
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: "rs.parecer.ver",
      recurso: "recrutamento.parecer_selecao",
      registroId: String(candidaturaId),
    });
  }
  return { pareceres, ve_todos: veTodos };
}

export async function registrarParecer(
  sessao: PayloadSessao,
  candidaturaId: number,
  dados: CriacaoParecer
): Promise<void> {
  const pode = await permissoesDe(sessao.usuario_id);
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const candidatura = await buscarCandidaturaParaMutacao(
      cliente,
      candidaturaId
    );
    if (
      !candidatura ||
      !acessaVaga(pode, sessao.usuario_id, candidatura.solicitante_usuario_id)
    ) {
      throw new ErroHttp(404, "Candidatura não encontrada.");
    }
    if (candidatura.status !== "ativa") {
      throw new ErroHttp(409, "Candidatura encerrada não recebe parecer.");
    }
    const id = await inserirParecer(cliente, {
      candidatura_id: candidaturaId,
      etapa_id: candidatura.etapa_atual_id,
      avaliador_usuario_id: sessao.usuario_id,
      recomendacao: dados.recomendacao,
      observacoes: dados.observacoes,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_PARECER,
      registroId: String(id),
      diff: {
        Candidato: { de: null, para: candidatura.candidato_nome },
        Etapa: { de: null, para: candidatura.etapa_nome },
        "Recomendação": {
          de: null,
          para: ROTULOS_RECOMENDACAO[dados.recomendacao],
        },
        "Observações": { de: null, para: truncar(dados.observacoes, 500) },
      },
    });
  });
}

// ------------------------------------------------------------------ pesquisa social (#13c, G3:a)

const TABELA_PESQUISA_SOCIAL = "rh.pesquisa_social";
const TABELA_DOCUMENTO = "rh.documento";

/**
 * Costuras da pesquisa social com o banco/GED — o que os testes trocam por
 * dublês (molde DepsPosse, pendência 16.2). Produção nunca passa o parâmetro:
 * as rotas chamam como sempre e caem em DEPS_PESQUISA_REAIS.
 */
export interface DepsPesquisaSocial {
  buscarCandidaturaParaMutacao: typeof buscarCandidaturaParaMutacao;
  buscarPesquisaSocial: typeof buscarPesquisaSocial;
  inserirPesquisaSocial: typeof inserirPesquisaSocial;
  /** Escrita do anexo no GED — a MESMA interface do domínio documentos. */
  guardarAnexo: typeof armazenamentoBytea.guardar;
  buscarAnexoPesquisaSocial: typeof buscarAnexoPesquisaSocial;
  lerConteudoAnexo: typeof armazenamentoBytea.lerConteudo;
  listarPesquisasParaExpurgo: typeof listarPesquisasParaExpurgo;
  expurgarPesquisa: typeof expurgarPesquisa;
  apagarDocumentoDoExpurgo: typeof apagarDocumentoDoExpurgo;
  registrarLeituraSensivel: typeof registrarLeituraSensivel;
  registrarAlteracao: typeof registrarAlteracao;
  comTransacao: typeof comTransacao;
}

const DEPS_PESQUISA_REAIS: DepsPesquisaSocial = {
  buscarCandidaturaParaMutacao,
  buscarPesquisaSocial,
  inserirPesquisaSocial,
  guardarAnexo: armazenamentoBytea.guardar,
  buscarAnexoPesquisaSocial,
  lerConteudoAnexo: armazenamentoBytea.lerConteudo,
  listarPesquisasParaExpurgo,
  expurgarPesquisa,
  apagarDocumentoDoExpurgo,
  registrarLeituraSensivel,
  registrarAlteracao,
  comTransacao,
};

/**
 * Registra o DESFECHO da pesquisa social (aprovado/reprovado) da candidatura
 * QUE ESTÁ na etapa de pesquisa social, com anexo opcional no GED. O anexo vai
 * para rh.documento na categoria PRÓPRIA e OCULTA 'pesquisa_social' (A2/G3:a):
 * o acervo do GED nunca a lista, e a visibilidade — inclusive no download
 * genérico — exige rs.gerir com trilha (documento.sensivel.ver NÃO basta).
 * Desfecho é único por candidatura: correção não sobrescreve história.
 */
export async function registrarPesquisaSocial(
  sessao: PayloadSessao,
  candidaturaId: number,
  dados: RegistroPesquisaSocial,
  deps: DepsPesquisaSocial = DEPS_PESQUISA_REAIS
): Promise<void> {
  // O anexo decodifica ANTES da transação: payload ruim nem abre transação.
  let anexo: { nome: string; mime: string; conteudo: Buffer } | null = null;
  if (dados.anexo) {
    const conteudo = Buffer.from(dados.anexo.conteudo_base64, "base64");
    if (conteudo.length === 0) {
      throw new ErroHttpCampo(400, "O arquivo está vazio.", "anexo");
    }
    if (conteudo.length > TAMANHO_MAXIMO_BYTES) {
      throw new ErroHttpCampo(
        413,
        "Arquivo excede o limite de 10 MB.",
        "anexo"
      );
    }
    anexo = {
      nome: dados.anexo.nome_arquivo,
      mime: dados.anexo.mime,
      conteudo,
    };
  }
  try {
    await deps.comTransacao(sessao.usuario_id, async (cliente) => {
      const candidatura = await deps.buscarCandidaturaParaMutacao(
        cliente,
        candidaturaId
      );
      if (!candidatura) {
        throw new ErroHttp(404, "Candidatura não encontrada.");
      }
      if (candidatura.status !== "ativa") {
        throw new ErroHttp(
          409,
          "Candidatura encerrada não recebe pesquisa social."
        );
      }
      if (candidatura.vaga_status !== "aberta") {
        throw new ErroHttp(
          409,
          `Vaga ${ROTULOS_STATUS_VAGA[candidatura.vaga_status].toLowerCase()} não registra pesquisa social.`
        );
      }
      if (candidatura.etapa_tipo !== "pesquisa_social") {
        throw new ErroHttp(
          409,
          "O desfecho da pesquisa social só se registra com o candidato NA etapa de pesquisa social."
        );
      }
      if (await deps.buscarPesquisaSocial(cliente, candidaturaId)) {
        throw new ErroHttp(
          409,
          "Esta candidatura já tem desfecho de pesquisa social — o registro é único."
        );
      }

      let documentoId: number | null = null;
      if (anexo) {
        // Hash no servidor, como no GED — o cliente nunca informa o hash.
        const hashSha256 = createHash("sha256")
          .update(anexo.conteudo)
          .digest("hex");
        const guardado = await deps.guardarAnexo(cliente, {
          colaborador_id: null,
          // A2 (decisão G3:a): categoria própria e oculta — o GED não a lista
          // e só rs.gerir a alcança; é também o que o trigger da 0101 usa para
          // permitir o DELETE do expurgo (e nada além dele).
          categoria: CATEGORIA_PESQUISA_SOCIAL,
          titulo: `Pesquisa social — ${candidatura.candidato_nome}`,
          nome_arquivo: anexo.nome,
          mime: anexo.mime,
          tamanho_bytes: anexo.conteudo.length,
          conteudo: anexo.conteudo,
          sensivel: true,
          hash_sha256: hashSha256,
          enviado_por_usuario: sessao.usuario_id,
          exige_ciencia: false,
          bloqueante: false,
          prazo_ciencia_dias: null,
          substitui_documento_id: null,
        });
        documentoId = guardado.id;
        await deps.registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: TABELA_DOCUMENTO,
          registroId: String(documentoId),
          diff: {
            "Título": {
              de: null,
              para: `Pesquisa social — ${candidatura.candidato_nome}`,
            },
            Categoria: { de: null, para: "Pesquisa social" },
            Arquivo: { de: null, para: anexo.nome },
            Tamanho: { de: null, para: formatarTamanho(anexo.conteudo.length) },
            "Sensível": { de: null, para: "Sim" },
            "SHA-256": { de: null, para: hashSha256 },
            Origem: {
              de: null,
              para: `Pesquisa social — candidatura #${candidaturaId}`,
            },
          },
        });
      }

      const id = await deps.inserirPesquisaSocial(cliente, {
        candidatura_id: candidaturaId,
        resultado: dados.resultado,
        documento_id: documentoId,
        registrado_por: sessao.usuario_id,
      });
      await deps.registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_PESQUISA_SOCIAL,
        registroId: String(id),
        diff: {
          Candidato: { de: null, para: candidatura.candidato_nome },
          Vaga: { de: null, para: candidatura.vaga_titulo },
          Resultado: {
            de: null,
            para: ROTULOS_RESULTADO_PESQUISA_SOCIAL[dados.resultado],
          },
          Anexo: { de: null, para: anexo ? anexo.nome : "sem anexo" },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "pesquisa_social_candidatura_id_key") {
      throw new ErroHttp(
        409,
        "Esta candidatura já tem desfecho de pesquisa social — o registro é único."
      );
    }
    throw erro;
  }
}

export interface AnexoPesquisaSocialBaixado {
  nome_arquivo: string;
  mime: string;
  conteudo: Buffer;
}

/**
 * Download do anexo — SÓ rs.gerir (G3:a), sempre com trilha de leitura
 * sensível ANTES do conteúdo sair. Sem anexo (ou já expurgado) = 404, ausência
 * e não máscara.
 */
export async function baixarAnexoPesquisaSocial(
  sessao: PayloadSessao,
  pode: PermissoesRs,
  candidaturaId: number,
  deps: DepsPesquisaSocial = DEPS_PESQUISA_REAIS
): Promise<AnexoPesquisaSocialBaixado> {
  if (!pode.gerir) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  const anexo = await deps.buscarAnexoPesquisaSocial(candidaturaId);
  if (!anexo) {
    throw new ErroHttp(404, "Anexo não encontrado.");
  }
  await deps.registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "rs.gerir",
    recurso: "recrutamento.pesquisa_social_anexo",
    registroId: String(candidaturaId),
  });
  const conteudo = await deps.lerConteudoAnexo(anexo.documento_id);
  if (!conteudo) {
    throw new ErroHttp(404, "Anexo não encontrado.");
  }
  return {
    nome_arquivo: anexo.nome_arquivo,
    mime: anexo.mime,
    conteudo,
  };
}

export interface ContagemExpurgo {
  expurgadas: number;
  anexos_apagados: number;
  /** Itens que a rodada PULOU (ex.: FK inesperada no anexo) — nada abortou. */
  puladas: number;
}

/**
 * Motivo curto e sem dado pessoal para o relatório da rodada. FK (23503) é o
 * caso conhecido: alguém criou vínculo (ex.: rh.ciencia) sobre o anexo — o A4
 * fecha a porta nova, mas dado antigo não se conserta sozinho.
 */
function motivoDoPulo(erro: unknown): string {
  if (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code?: unknown }).code === "23503"
  ) {
    return "o documento do anexo tem vínculo (ex.: ciência) que impede o DELETE";
  }
  return erro instanceof Error ? erro.message : String(erro);
}

/**
 * EXPURGO da retenção (G3:a, 6 meses): para cada candidatura DESCARTADA
 * (reprovada/desistiu) há mais de 6 meses, apaga o anexo do GED (a linha de
 * rh.documento leva o BYTEA junto — o trigger da 0101 abre a exceção só para
 * a categoria 'pesquisa_social') e ANONIMIZA o desfecho (resultado -> NULL,
 * expurgado_em carimbado) — auditado SEM repetir o desfecho (repeti-lo no
 * audit recriaria o dado que se está apagando; o audit nunca é tocado, molde
 * 0012). Rota administrativa manual — o projeto não tem agendador; o cron é
 * follow-up registrado.
 *
 * A3 — a rodada é blindada POR ITEM: cada pesquisa roda dentro de um
 * SAVEPOINT. Um documento que não deleta (ex.: FK de rh.ciencia criada antes
 * do A4 fechar essa porta) NÃO aborta a rodada inteira: aquele item é
 * revertido e PULADO, com o motivo no ato da rodada — os demais expurgam.
 */
export async function expurgarPesquisasSociais(
  sessao: PayloadSessao,
  hoje: string,
  deps: DepsPesquisaSocial = DEPS_PESQUISA_REAIS
): Promise<ContagemExpurgo> {
  const corte = dataCorteExpurgo(hoje);
  return deps.comTransacao(sessao.usuario_id, async (cliente) => {
    const linhas = await deps.listarPesquisasParaExpurgo(cliente, corte);
    let expurgadas = 0;
    let anexosApagados = 0;
    const pulos: { id: number; motivo: string }[] = [];
    for (const [indice, linha] of linhas.entries()) {
      const savepoint = `expurgo_item_${indice}`;
      await cliente.query(`SAVEPOINT ${savepoint}`);
      try {
        // Ordem obrigatória: primeiro o vínculo zera (expurgo), depois a
        // linha do documento sai — a FK barraria a ordem inversa.
        await deps.expurgarPesquisa(cliente, linha.id);
        if (linha.documento_id !== null) {
          await deps.apagarDocumentoDoExpurgo(cliente, linha.documento_id);
        }
        await deps.registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "expurgo",
          tabela: TABELA_PESQUISA_SOCIAL,
          registroId: String(linha.id),
          diff: {
            "Pesquisa social": {
              de: "registrada",
              para: "expurgada (retenção de 6 meses após o descarte)",
            },
            Anexo: {
              de: null,
              para:
                linha.documento_id !== null
                  ? "apagado do GED (conteúdo incluído)"
                  : "sem anexo",
            },
          },
        });
        await cliente.query(`RELEASE SAVEPOINT ${savepoint}`);
        expurgadas += 1;
        if (linha.documento_id !== null) {
          anexosApagados += 1;
        }
      } catch (erro) {
        await cliente.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        pulos.push({ id: linha.id, motivo: motivoDoPulo(erro) });
      }
    }
    // O ATO da rodada fica sempre na trilha, mesmo com zero expurgos — quem
    // rodou a retenção, quando, com que resultado e o que ficou para trás.
    await deps.registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "expurgo",
      tabela: TABELA_PESQUISA_SOCIAL,
      registroId: `rodada:${hoje}`,
      diff: {
        Corte: { de: null, para: `descartes até ${formatarData(corte)}` },
        "Pesquisas expurgadas": { de: null, para: String(expurgadas) },
        "Anexos apagados": { de: null, para: String(anexosApagados) },
        Puladas: {
          de: null,
          para:
            pulos.length === 0
              ? "nenhuma"
              : pulos
                  .map((pulo) => `#${pulo.id}: ${pulo.motivo}`)
                  .join(" · "),
        },
      },
    });
    return {
      expurgadas,
      anexos_apagados: anexosApagados,
      puladas: pulos.length,
    };
  });
}

// ------------------------------------------------------------------ oferta

export async function criarOferta(
  sessao: PayloadSessao,
  candidaturaId: number,
  dados: CriacaoOferta
): Promise<void> {
  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      const candidatura = await buscarCandidaturaParaMutacao(
        cliente,
        candidaturaId
      );
      if (!candidatura) {
        throw new ErroHttp(404, "Candidatura não encontrada.");
      }
      if (candidatura.status !== "ativa") {
        throw new ErroHttp(409, "Candidatura encerrada não recebe oferta.");
      }
      if (candidatura.vaga_status !== "aberta") {
        throw new ErroHttp(
          409,
          `Vaga ${ROTULOS_STATUS_VAGA[candidatura.vaga_status].toLowerCase()} não emite oferta.`
        );
      }
      if (candidatura.etapa_tipo !== "oferta") {
        throw new ErroHttp(
          409,
          "Avance o candidato até a etapa de oferta antes de registrar a proposta."
        );
      }
      // Trava da banda congelada: fora dela, só com aprovação nominal
      // registrada ANTES — o banco torna o silêncio impossível.
      const dentroBanda =
        dados.valor >= candidatura.faixa_min &&
        dados.valor <= candidatura.faixa_max;
      if (!dentroBanda && !dados.aprovacao_fora_banda) {
        throw new ErroHttpCampo(
          400,
          `Valor fora da banda da vaga (${formatarSalario(candidatura.faixa_min)} a ${formatarSalario(candidatura.faixa_max)}) exige aprovação registrada.`,
          "aprovacao_fora_banda"
        );
      }
      const id = await inserirOferta(cliente, {
        candidatura_id: candidaturaId,
        valor: dados.valor,
        dentro_banda: dentroBanda,
        aprovacao_fora_banda: dentroBanda
          ? null
          : (dados.aprovacao_fora_banda ?? null),
      });
      const diff: Diff = {
        Candidato: { de: null, para: candidatura.candidato_nome },
        Vaga: { de: null, para: candidatura.vaga_titulo },
        Valor: { de: null, para: formatarSalario(dados.valor) },
        "Dentro da banda": { de: null, para: dentroBanda ? "Sim" : "Não" },
        Status: { de: null, para: ROTULOS_STATUS_OFERTA.enviada },
      };
      if (!dentroBanda && dados.aprovacao_fora_banda) {
        diff["Aprovação fora da banda"] = {
          de: null,
          para: truncar(dados.aprovacao_fora_banda, 500),
        };
      }
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_OFERTA,
        registroId: String(id),
        diff,
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "oferta_candidatura_id_key") {
      throw new ErroHttp(409, "Esta candidatura já tem oferta registrada.");
    }
    throw erro;
  }
}

export async function responderOferta(
  sessao: PayloadSessao,
  candidaturaId: number,
  dados: RespostaOferta
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const candidatura = await buscarCandidaturaParaMutacao(
      cliente,
      candidaturaId
    );
    if (!candidatura) {
      throw new ErroHttp(404, "Candidatura não encontrada.");
    }
    // As mesmas guardas dos irmãos (movimentar/criarOferta): responder oferta
    // também exige candidatura ATIVA e vaga ABERTA. Sem isto, dois candidatos
    // com oferta 'enviada' na mesma vaga podiam ambos aceitar (over-hire: a
    // segunda passava porque o fechamento da vaga só roda quando ela ainda está
    // 'aberta'), e uma candidatura já reprovada podia "ressuscitar" para
    // aprovada num 'aceita' tardio.
    if (candidatura.status !== "ativa") {
      throw new ErroHttp(
        409,
        `Candidatura ${ROTULOS_STATUS_CANDIDATURA[candidatura.status].toLowerCase()} não responde oferta — o histórico é definitivo.`
      );
    }
    if (candidatura.vaga_status !== "aberta") {
      throw new ErroHttp(
        409,
        `Vaga ${ROTULOS_STATUS_VAGA[candidatura.vaga_status].toLowerCase()} não recebe resposta de oferta.`
      );
    }
    const oferta = await buscarOfertaParaMutacao(cliente, candidaturaId);
    if (!oferta) {
      throw new ErroHttp(404, "Esta candidatura não tem oferta.");
    }
    if (oferta.status !== "enviada") {
      throw new ErroHttp(
        409,
        `Oferta já ${ROTULOS_STATUS_OFERTA[oferta.status].toLowerCase()} — resposta é única.`
      );
    }
    await gravarRespostaOferta(cliente, oferta.id, dados.resposta);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_OFERTA,
      registroId: String(oferta.id),
      diff: {
        Candidato: { de: null, para: candidatura.candidato_nome },
        Vaga: { de: null, para: candidatura.vaga_titulo },
        Status: {
          de: ROTULOS_STATUS_OFERTA.enviada,
          para: ROTULOS_STATUS_OFERTA[dados.resposta],
        },
      },
    });

    if (dados.resposta === "aceita") {
      // A seleção termina aqui: candidatura aprovada e vaga fechada na MESMA
      // transação; a admissão começa no botão "iniciar admissão".
      await atualizarCandidatura(cliente, candidaturaId, {
        status: "aprovada",
      });
      await inserirMovimentacao(cliente, {
        candidatura_id: candidaturaId,
        de_etapa_id: candidatura.etapa_atual_id,
        para_etapa_id: null,
        novo_status: "aprovada",
        motivo_catalogo: null,
        observacao: null,
        por_usuario_id: sessao.usuario_id,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "transicao",
        tabela: TABELA_CANDIDATURA,
        registroId: String(candidaturaId),
        diff: {
          Candidato: { de: null, para: candidatura.candidato_nome },
          Status: {
            de: ROTULOS_STATUS_CANDIDATURA.ativa,
            para: ROTULOS_STATUS_CANDIDATURA.aprovada,
          },
        },
      });
      const vaga = await buscarVagaParaMutacao(cliente, candidatura.vaga_id);
      if (vaga && vaga.status === "aberta") {
        await atualizarStatusVaga(cliente, vaga.id, "fechada");
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "transicao",
          tabela: TABELA_VAGA,
          registroId: String(vaga.id),
          diff: {
            "Título": { de: null, para: vaga.titulo },
            Status: {
              de: ROTULOS_STATUS_VAGA.aberta,
              para: ROTULOS_STATUS_VAGA.fechada,
            },
            Resultado: { de: null, para: "Preenchida (oferta aceita)" },
          },
        });
      }
      return;
    }

    // Recusa: o candidato desistiu — motivo do catálogo, vaga segue aberta.
    const motivo = dados.motivo_catalogo;
    if (!motivo) {
      throw new ErroHttpCampo(
        400,
        "Recusa exige motivo do catálogo.",
        "motivo_catalogo"
      );
    }
    await atualizarCandidatura(cliente, candidaturaId, { status: "desistiu" });
    await inserirMovimentacao(cliente, {
      candidatura_id: candidaturaId,
      de_etapa_id: candidatura.etapa_atual_id,
      para_etapa_id: null,
      novo_status: "desistiu",
      motivo_catalogo: motivo,
      observacao: null,
      por_usuario_id: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "transicao",
      tabela: TABELA_CANDIDATURA,
      registroId: String(candidaturaId),
      diff: {
        Candidato: { de: null, para: candidatura.candidato_nome },
        Status: {
          de: ROTULOS_STATUS_CANDIDATURA.ativa,
          para: ROTULOS_STATUS_CANDIDATURA.desistiu,
        },
        Motivo: { de: null, para: ROTULOS_MOTIVO_MOVIMENTACAO[motivo] },
      },
    });
  });
}

// ------------------------------------------------------------------ fronteira com a admissão

export interface AdmissaoIniciada {
  colaborador_id: number;
  processo_id: number;
  senha_temporaria: string;
}

/**
 * Oferta aceita → colaborador + usuário + processo de admissão na MESMA
 * transação, reusando as escritas exportadas dos domínios usuarios,
 * colaboradores e admissao (os serviços de lá abrem transação própria, por
 * isso a orquestração reúne os repositórios deles aqui, sem duplicar SQL).
 */
export async function iniciarAdmissao(
  sessao: PayloadSessao,
  candidaturaId: number,
  dados: IniciarAdmissao
): Promise<AdmissaoIniciada> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await hash(senhaTemporaria, 12);
  const dataAdmissao = dados.data_inicio_prevista;
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const candidatura = await buscarCandidaturaParaMutacao(
        cliente,
        candidaturaId
      );
      if (!candidatura) {
        throw new ErroHttp(404, "Candidatura não encontrada.");
      }
      const oferta = await buscarOfertaParaMutacao(cliente, candidaturaId);
      if (
        candidatura.status !== "aprovada" ||
        !oferta ||
        oferta.status !== "aceita"
      ) {
        throw new ErroHttp(
          409,
          "Só candidatura aprovada com oferta aceita inicia admissão."
        );
      }

      // 1) Pessoa + usuário + vínculo (mesmo arranjo de
      //    colaboradores.criarColaborador). Desde a 0046 o CPF mora na PESSOA:
      //    ela nasce primeiro, a conta se liga a ela, e só então vem o vínculo.
      //    Candidato que JÁ é gente do grupo (readmissão) não passa por aqui:
      //    esta tela cria CONTA nova a partir do e-mail do candidato, e conta é
      //    uma por pessoa. O caminho existe e é a admissão em Colaboradores,
      //    que reconhece o CPF, mostra de quem é e abre o segundo vínculo
      //    reaproveitando cadastro e login.
      if (await buscarPessoaPorCpf(cliente, dados.cpf)) {
        throw new ErroHttp(
          409,
          "Já existe uma pessoa com este CPF no grupo. Readmissão de quem já " +
            "trabalhou aqui é feita em Colaboradores → Novo colaborador: lá o " +
            "CPF é reconhecido e o novo vínculo nasce ligado ao cadastro e ao " +
            "login que ela já tem."
        );
      }
      const pessoaId = await criarPessoa(cliente, {
        cpf: dados.cpf,
        nome_completo: candidatura.candidato_nome,
        retrato: null,
        contexto: null,
      });
      const usuario = await criarUsuario(cliente, {
        email: candidatura.candidato_email,
        nome: candidatura.candidato_nome,
        papel: "funcionario",
        senhaHash,
      });
      await vincularContaAPessoa(cliente, usuario.id, pessoaId);
      const colaborador = await criarColaborador(cliente, {
        pessoa_id: pessoaId,
        matricula: dados.matricula,
        matricula_esocial: dados.matricula,
        tipo_vinculo: dados.tipo_vinculo,
        data_admissao: dataAdmissao,
      });
      await inserirEvento(cliente, {
        colaborador_id: colaborador.id,
        tipo: "admissao",
        ocorrido_em: `${dataAdmissao}T00:00:00Z`,
        origem_tabela: "rh.colaborador",
        origem_id: colaborador.id,
        resumo: `Admissão de ${candidatura.candidato_nome} (matrícula ${dados.matricula}) como ${ROTULOS_VINCULO[dados.tipo_vinculo]} em ${formatarData(dataAdmissao)} — origem: seleção (vaga ${candidatura.vaga_titulo})`,
        payload: {
          tipo_vinculo: dados.tipo_vinculo,
          data_admissao: dataAdmissao,
          candidatura_id: candidaturaId,
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
      // CPF e nome são da PESSOA (0046): trilha na entidade certa.
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.pessoa",
        registroId: String(pessoaId),
        diff: {
          CPF: { de: null, para: dados.cpf },
          "Nome completo": { de: null, para: candidatura.candidato_nome },
        },
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.colaborador",
        registroId: String(colaborador.id),
        diff: {
          "Matrícula": { de: null, para: dados.matricula },
          "Vínculo": { de: null, para: ROTULOS_VINCULO[dados.tipo_vinculo] },
          "Data de admissão": { de: null, para: formatarData(dataAdmissao) },
          Origem: {
            de: null,
            para: `Seleção — candidatura #${candidaturaId} (${candidatura.vaga_titulo})`,
          },
        },
      });

      // 2) Processo de admissão com o checklist vigente congelado, escolhido
      //    pelo TIPO DE VÍNCULO do admitido (fallback no geral, 0058) — mesmo
      //    arranjo de admissao.abrirProcesso.
      const checklist = await buscarChecklistAtivo(cliente, dados.tipo_vinculo);
      if (!checklist) {
        throw new ErroHttp(
          409,
          "Não há checklist de admissão ativo (nem para este vínculo, nem geral). Ative um modelo antes de iniciar admissões."
        );
      }
      const prazos = dados.contrato_experiencia
        ? calcularPrazosExperiencia(dataAdmissao)
        : { prazo_experiencia_1: null, prazo_experiencia_2: null };
      const processoId = await criarProcesso(cliente, {
        colaborador_id: colaborador.id,
        checklist_versao_id: checklist.id,
        data_inicio_prevista: dados.data_inicio_prevista,
        contrato_experiencia: dados.contrato_experiencia,
        ...prazos,
      });
      await inserirItens(cliente, processoId, checklist.itens);
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: "rh.processo_admissao",
        registroId: String(processoId),
        diff: {
          Colaborador: {
            de: null,
            para: `${candidatura.candidato_nome} (matrícula ${dados.matricula})`,
          },
          "Início previsto": {
            de: null,
            para: formatarData(dados.data_inicio_prevista),
          },
          "Contrato de experiência": {
            de: null,
            para: dados.contrato_experiencia ? "Sim (45 + 45 dias)" : "Não",
          },
          Checklist: {
            de: null,
            para: `Versão ${checklist.versao} (${checklist.itens.length} itens)`,
          },
          Estado: { de: null, para: ROTULOS_ESTADO_PROCESSO.em_preparacao },
          Origem: { de: null, para: `Seleção — candidatura #${candidaturaId}` },
        },
      });

      return {
        colaborador_id: colaborador.id,
        processo_id: processoId,
        senha_temporaria: senhaTemporaria,
      };
    });
  } catch (erro) {
    const restricao = violacaoUnica(erro);
    if (restricao === "usuario_email_unico") {
      throw new ErroHttp(
        409,
        "Já existe usuário com o e-mail deste candidato — a admissão provavelmente já foi iniciada."
      );
    }
    if (restricao === "colaborador_matricula_key") {
      throw new ErroHttpCampo(
        409,
        "Já existe colaborador com esta matrícula.",
        "matricula"
      );
    }
    if (restricao === "colaborador_cpf_key") {
      throw new ErroHttpCampo(
        409,
        "Já existe colaborador com este CPF.",
        "cpf"
      );
    }
    throw erro;
  }
}

// ------------------------------------------------------------------ indicador

/** % de vagas fechadas até o prazo-alvo (12 meses) — fonte da Central de Metas. */
export async function valorIndicadorVagasNoPrazo(): Promise<number | null> {
  return apurarVagasNoPrazo();
}

/**
 * Relatório de tempo por etapa (mediana, por cargo × etapa do catálogo) —
 * agregado operacional, sem dado de titular: quem vê o funil (rs.ver, e
 * rs.gerir que o conduz) vê o relatório; nenhum recorte chega a indivíduo.
 */
export async function relatorioTempoPorEtapa(
  pode: PermissoesRs
): Promise<TempoPorEtapa[]> {
  if (!pode.ver && !pode.gerir) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  return apurarTempoPorEtapa();
}
