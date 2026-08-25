import { PoolClient } from "pg";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import {
  ErroHttpCampo,
  ErroHttpConfirmavel,
  violacaoUnica,
} from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import {
  ColaboradorOpcao,
  listarColaboradoresAtivos,
  perfilPorColaborador,
} from "../beneficios/repositorio";
import {
  registrarLeituraSensivel,
  temPermissao,
} from "../colaboradores/repositorio";
import {
  FiltroEstrutura,
  OpcoesFiltroEstrutura,
} from "../estrutura/esquemas";
import { PayloadSessao } from "../identidade/esquemas";
import { validarTotpDoUsuario } from "../identidade/servico";
import {
  calcularFolha,
  EntradaMotor,
  ErroMotor,
  SuspensaoMotor,
  VariavelMotor,
} from "./calculo";
import {
  apurarSuspensaoNaCompetencia,
  inicioBuscaSuspensao,
} from "./suspensao";
import { calcularFerias, ResultadoMotorFerias } from "./calculo-ferias";
import {
  calcularDecimo,
  ParcelaDecimo,
  ResultadoMotorDecimo,
} from "./calculo-13";
import {
  calcularRescisao,
  ResultadoMotorRescisao,
} from "./calculo-rescisao";
import {
  analisarLinhaOlac,
  casarLinhaOlac,
  ehCabecalhoOlac,
  gerarArquivoOlac,
  LinhaOlac,
  nomeArquivoOlac,
  SEPARADOR_OLAC,
  SituacaoEspelho,
} from "./olac";
import { dividirLinhas } from "../estrutura/importacao-analise";
import {
  AbrirCompetencia,
  CODIGO_ADICIONAL_NOTURNO,
  CODIGO_DESCONTO_BENEFICIO,
  CODIGO_FALTAS,
  CODIGO_HE_50,
  CODIGO_HE_100,
  CODIGOS_AUTOMATICOS,
  CODIGOS_DO_MOTOR,
  competenciaCorrente,
  competenciaEhRetroativa,
  dataReferenciaCompetencia,
  EncerramentoRubrica,
  EncerrarContaContabil,
  NovaContaContabil,
  esquemaEntradaCasoTeste,
  esquemaSaidaCasoTeste,
  EstadoCompetencia,
  formatarCompetencia,
  LancarVariavel,
  NovaRubrica,
  NovaTabelaInss,
  NovaTabelaIrrf,
  NovaVersaoRubrica,
  NovosParametrosFolha,
  ROTULOS_ESTADO_COMPETENCIA,
  ROTULOS_NATUREZA,
  ROTULOS_TABELA_LEGAL,
  ROTULOS_TIPO_CALCULO,
  TipoTabelaLegal,
} from "./esquemas";
import {
  apagarEspelhoOlacAnterior,
  apagarFolhasDaCompetencia,
  buscarColaboradorParaDecimo,
  buscarContaContabilAtivaParaAtualizar,
  buscarContaContabilParaAtualizar,
  ContaContabilRubrica,
  encerrarContaContabilNoBanco,
  EspelhoNaoCasado,
  inserirContaContabil,
  inserirEspelhoOlac,
  inserirLoteOlac,
  listarCatalogoContaContabil,
  listarEspelhoNaoCasado,
  listarLinhasParaExportarOlac,
  listarSuspensoesParaCalculo,
  LoteOlacResumo,
  mapaColaboradorPorMatricula,
  mapaEmpresaPorCnpj,
  TotalEspelhoOlac,
  totaisEspelhoOlac,
  ultimosLotesOlac,
  buscarColaboradorParaFerias,
  buscarDesligamentoParaRescisao,
  DesligamentoParaRescisao,
  listarPeriodosAquisitivosParaRescisao,
  buscarCompetencia,
  buscarCompetenciaParaAtualizar,
  buscarProgramacaoParaPrevia,
  buscarRubricaParaAtualizar,
  buscarVariavelParaAtualizar,
  buscarVersaoAtivaRubricaParaAtualizar,
  buscarVersaoLegalAtivaParaAtualizar,
  buscarVersaoLegalParaAtualizar,
  CasoTeste,
  CatalogoRubrica,
  CompetenciaResumo,
  contarIntercorrenciasAbertasDaCompetencia,
  contarLancamentosRecalculaveis,
  desativarRubrica,
  encerrarVersaoLegal,
  encerrarVersaoRubrica,
  encerrarVersaoRubricaEm,
  excluirVariavel,
  excluirVariaveisDeBeneficio,
  excluirVariaveisDePonto,
  aprovarCompetenciaNoBanco,
  fecharCompetencia as fecharCompetenciaNoBanco,
  registrarCalculadaPor,
  FolhaResumo,
  ImpedidoCalculo,
  AvisoProporcional,
  listarAvisosProporcional,
  hojeParaFolha,
  indicadorFolhaNoPrazo,
  inserirCompetencia,
  inserirFolhaColaborador,
  inserirItemCalculo,
  inserirVariavel,
  inserirVersaoInss,
  inserirVersaoIrrf,
  inserirRubrica,
  inserirVersaoParametros,
  inserirVersaoRubrica,
  ItemFolha,
  listarApuracaoDePontoDaCompetencia,
  listarCasosTesteAtivos,
  listarCatalogoRubricas,
  listarColaboradoresParaCalculo,
  listarCompetencias,
  listarDescontosDeAdesao,
  listarFolhasDaCompetencia,
  listarImpedidos,
  listarItensDaCompetencia,
  listarRubricasVigentes,
  listarVariaveis,
  listarVersoesInss,
  listarVersoesIrrf,
  listarVersoesParametros,
  marcarVersaoConferida,
  mudarEstado,
  ProgramacaoParaPrevia,
  resumoEstruturaDaCompetencia,
  RubricaVigente,
  SituacaoConferencia,
  situacaoConferenciaTabelas,
  tabelasVigentes,
  TabelasVigentesMotor,
  totaisPorCentroCusto,
  totaisPorRubrica,
  TotalPorCentroCusto,
  TotalPorRubrica,
  VariavelResumo,
  VersaoParametros,
  VersaoTabelaInss,
  VersaoTabelaIrrf,
} from "./repositorio";

const TABELA_COMPETENCIA = "rh_folha.competencia_folha";
const TABELA_VARIAVEL = "rh_folha.variavel_lancada";
const TABELA_RUBRICA = "rh_folha.rubrica";
const TABELA_RUBRICA_VERSAO = "rh_folha.rubrica_versao";
const TABELAS_AUDIT: Record<TipoTabelaLegal, string> = {
  inss: "rh_folha.tabela_inss_versao",
  irrf: "rh_folha.tabela_irrf_versao",
  gerais: "rh_folha.parametro_folha_versao",
};

// Folha NÃO projeta em rh.evento_colaborador em F1: o fato relevante da linha
// do tempo seria "folha calculada", que vaza a existência de valores a papéis
// sem chave de folha — a trilha fica em audit.alteracao e audit.leitura_sensivel.

// ------------------------------------------------------------------ permissões

export interface PermissoesFolha {
  ver: boolean;
  operar: boolean;
  aprovar: boolean;
  parametros: boolean;
}

export async function permissoesFolha(
  usuarioId: number
): Promise<PermissoesFolha> {
  const [ver, operar, aprovar, parametros] = await Promise.all([
    temPermissao(usuarioId, "folha.ver"),
    temPermissao(usuarioId, "folha.operar"),
    temPermissao(usuarioId, "folha.aprovar"),
    temPermissao(usuarioId, "folha.parametros"),
  ]);
  return { ver, operar, aprovar, parametros };
}

// ------------------------------------------------------------------ competências (lista)

export interface VisaoFolha {
  pode: PermissoesFolha;
  competencias: CompetenciaResumo[];
}

/** Lista SEM valores — dinheiro só aparece no detalhe, que deixa trilha de leitura. */
export async function montarVisaoFolha(
  sessao: PayloadSessao
): Promise<VisaoFolha> {
  const [pode, competencias] = await Promise.all([
    permissoesFolha(sessao.usuario_id),
    listarCompetencias(),
  ]);
  return { pode, competencias };
}

/**
 * Abre a competência mensal. TRAVA RETROATIVA (item G3 do plano da onda G):
 * para frente é livre — a diretoria aprovou explicitamente abrir dezembro em
 * julho —, para trás não abre. O limite é o mês corrente em America/Sao_Paulo.
 *
 * A trava vive aqui, e não no banco: "mês corrente" não é IMMUTABLE (não cabe
 * em CHECK) e um trigger de INSERT quebraria as competências históricas já
 * gravadas (a demo tem 02, 04, 05 e 06/2026) e o semeador, que as carrega de
 * propósito. Competência retroativa já existente continua funcionando normal —
 * o que fica proibido é ABRIR uma nova para trás.
 *
 * Evolução: se o DP precisar de exceção (competência de mês passado por
 * migração de sistema), o caminho é uma permissão própria + justificativa
 * auditada, nunca afrouxar esta regra para todo mundo.
 */
export async function abrirCompetencia(
  sessao: PayloadSessao,
  dados: AbrirCompetencia
): Promise<CompetenciaResumo> {
  if (competenciaEhRetroativa(dados.ano, dados.mes)) {
    const atual = competenciaCorrente();
    throw new ErroHttpCampo(
      409,
      `A competência ${formatarCompetencia(dados.ano, dados.mes)} é anterior ao mês corrente (${formatarCompetencia(atual.ano, atual.mes)}). Folha retroativa não abre: correção de mês já encerrado é folha complementar. Abrir para frente é permitido.`,
      "mes"
    );
  }
  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    let competenciaId: number;
    try {
      competenciaId = await inserirCompetencia(cliente, {
        ano: dados.ano,
        mes: dados.mes,
        abertaPor: sessao.usuario_id,
      });
    } catch (erro) {
      if (violacaoUnica(erro)) {
        throw new ErroHttpCampo(
          409,
          `A competência ${formatarCompetencia(dados.ano, dados.mes)} já existe.`,
          "mes"
        );
      }
      throw erro;
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_COMPETENCIA,
      registroId: String(competenciaId),
      diff: {
        "Competência": {
          de: null,
          para: formatarCompetencia(dados.ano, dados.mes),
        },
        Estado: { de: null, para: ROTULOS_ESTADO_COMPETENCIA.aberta },
      },
    });
    return competenciaId;
  });
  const criada = await buscarCompetencia(id);
  if (!criada) {
    throw new ErroHttp(500, "Falha ao carregar a competência criada.");
  }
  return criada;
}

// ------------------------------------------------------------------ detalhe da competência

export interface RubricaLancavel {
  rubrica_id: number;
  codigo: string;
  nome: string;
  natureza: string;
  /** O que o formulário precisa pedir: referência (horas/dias), valor ou nada. */
  precisa: "referencia" | "valor" | "nenhum";
  /**
   * Verba genérica de escape (provento/desconto manual). Vem por ÚLTIMO na
   * lista e a tela avisa que é exceção — diretriz da diretoria de eliminar os
   * proventos manuais (migração 0028).
   */
  excecao: boolean;
}

export interface FolhaComItens extends FolhaResumo {
  itens: ItemFolha[];
}

export interface VisaoCompetencia {
  pode: PermissoesFolha;
  competencia: CompetenciaResumo;
  impedidos: ImpedidoCalculo[];
  /**
   * Quem mudou de estado dentro do mês (admissão, desligamento ou
   * transferência entre CNPJs). Não impede o cálculo — cobra tratamento
   * manual, porque a F1 não faz proporcional.
   */
  avisos_proporcional: AvisoProporcional[];
  variaveis: VariavelResumo[];
  rubricas_lancaveis: RubricaLancavel[];
  colaboradores: ColaboradorOpcao[];
  tabelas_conferidas: SituacaoConferencia[];
  /** JÁ RECORTADAS pelos três campos, quando o recorte veio na consulta. */
  folhas: FolhaComItens[];
  /** Quantas linhas a competência tem SEM recorte — o "de N" do cabeçalho. */
  folhas_na_competencia: number;
  /**
   * Os outros dois cortes da conferência, sob o MESMO recorte que `folhas`:
   * a folha somada por rubrica (provento/desconto) e por centro de custo.
   */
  por_rubrica: TotalPorRubrica[];
  por_centro_custo: TotalPorCentroCusto[];
  /** Sempre da competência inteira: filtrar não pode apagar os seletores. */
  opcoes_estrutura: OpcoesFiltroEstrutura;
  /** Os totais são DO RECORTE — soma exatamente as linhas devolvidas acima. */
  totais: {
    total_proventos_centavos: number;
    total_descontos_centavos: number;
    liquido_centavos: number;
  };
  /**
   * OLAC (E1:a/E2:a): o espelho de conciliação da folha externa, LADO A LADO
   * com a folha interna — nunca somado a ela. Sempre da competência inteira
   * (conciliação não tem recorte): totais por situação × empresa, o não-casado
   * em destaque e a última troca de arquivo em cada direção.
   */
  olac: {
    totais: TotalEspelhoOlac[];
    nao_casadas: EspelhoNaoCasado[];
    lotes: LoteOlacResumo[];
  };
}

function classificarLancavel(
  rubrica: RubricaVigente
): RubricaLancavel | null {
  const comum = {
    rubrica_id: rubrica.rubrica_id,
    codigo: rubrica.codigo,
    nome: rubrica.nome,
    natureza: rubrica.natureza,
    excecao: rubrica.excecao,
  };
  if (rubrica.codigo === CODIGO_FALTAS) {
    return { ...comum, precisa: "referencia" };
  }
  if (CODIGOS_AUTOMATICOS.includes(rubrica.codigo)) return null;
  if (rubrica.tipo_calculo === "horas_adicional") {
    return { ...comum, precisa: "referencia" };
  }
  if (rubrica.tipo_calculo === "valor_informado") {
    return { ...comum, precisa: "valor" };
  }
  if (rubrica.tipo_calculo === "percentual_salario") {
    return { ...comum, precisa: "nenhum" };
  }
  return null;
}

/**
 * @param filtro recorte por registro/lotação/centro de custo. Ele vale NO SQL —
 * o que não cai no recorte nem sai do banco. Filtrar no navegador seria mandar
 * a folha inteira (salário e memória de cálculo de cada um) para esconder a
 * maior parte dela, e ainda deixaria o total sendo o total geral.
 */
export async function montarVisaoCompetencia(
  sessao: PayloadSessao,
  competenciaId: number,
  filtro: FiltroEstrutura = {}
): Promise<VisaoCompetencia> {
  const competencia = await buscarCompetencia(competenciaId);
  if (!competencia) {
    throw new ErroHttp(404, "Competência não encontrada.");
  }
  // A tela mostra o que o cálculo VAI usar — então pergunta pela MESMA data que
  // ele. Ler "vigente hoje" aqui deixaria a conferência olhando uma rubrica e o
  // motor usando outra, sem nada na tela denunciando a diferença.
  const dataRef = dataReferenciaCompetencia(competencia.ano, competencia.mes);
  const [
    pode,
    impedidos,
    avisosProporcional,
    variaveis,
    rubricas,
    colaboradores,
    conferencia,
    folhas,
    itens,
    estrutura,
    porRubrica,
    porCentro,
    olacTotais,
    olacNaoCasadas,
    olacLotes,
  ] = await Promise.all([
    permissoesFolha(sessao.usuario_id),
    listarImpedidos(dataRef),
    listarAvisosProporcional(competencia.ano, competencia.mes),
    listarVariaveis(competenciaId),
    listarRubricasVigentes(dataRef),
    listarColaboradoresAtivos(),
    situacaoConferenciaTabelas(dataRef),
    listarFolhasDaCompetencia(competenciaId, filtro),
    listarItensDaCompetencia(competenciaId, filtro),
    resumoEstruturaDaCompetencia(competenciaId),
    totaisPorRubrica(competenciaId, filtro),
    totaisPorCentroCusto(competenciaId, filtro),
    totaisEspelhoOlac(competencia.ano, competencia.mes),
    listarEspelhoNaoCasado(competencia.ano, competencia.mes),
    ultimosLotesOlac(competencia.ano, competencia.mes),
  ]);

  if (folhas.length > 0 || variaveis.length > 0) {
    // Salário e resultado de folha são o dado mais sensível do sistema:
    // toda leitura autorizada deixa trilha. As VARIÁVEIS (lançamentos manuais e
    // benefícios) também carregam valor por pessoa nominada, e aparecem antes de
    // qualquer folha ser calculada (competência ainda 'aberta') — ler esses
    // valores sem trilha era o furo: a trilha se prende ao dado devolvido.
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: "folha.ver",
      recurso: "rh_folha.folha_colaborador",
      registroId: String(competenciaId),
    });
  }
  if (olacTotais.length > 0) {
    // O espelho da contabilidade também carrega valor por pessoa nominada
    // (matrícula + valor nas linhas não casadas): leitura própria na trilha,
    // com o recurso certo — é outro dado, de outra origem, na mesma tela.
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: "folha.ver",
      recurso: "rh_folha.espelho_olac",
      registroId: String(competenciaId),
    });
  }

  const itensPorFolha = new Map<number, ItemFolha[]>();
  for (const item of itens) {
    const lista = itensPorFolha.get(item.folha_colaborador_id) ?? [];
    lista.push(item);
    itensPorFolha.set(item.folha_colaborador_id, lista);
  }

  const totais = folhas.reduce(
    (soma, folha) => ({
      total_proventos_centavos:
        soma.total_proventos_centavos + folha.total_proventos_centavos,
      total_descontos_centavos:
        soma.total_descontos_centavos + folha.total_descontos_centavos,
      liquido_centavos: soma.liquido_centavos + folha.liquido_centavos,
    }),
    {
      total_proventos_centavos: 0,
      total_descontos_centavos: 0,
      liquido_centavos: 0,
    }
  );

  return {
    pode,
    competencia,
    impedidos,
    avisos_proporcional: avisosProporcional,
    variaveis,
    rubricas_lancaveis: rubricas
      .map(classificarLancavel)
      .filter((rubrica): rubrica is RubricaLancavel => rubrica !== null),
    colaboradores,
    tabelas_conferidas: conferencia,
    folhas: folhas.map((folha) => ({
      ...folha,
      itens: itensPorFolha.get(folha.id) ?? [],
    })),
    folhas_na_competencia: estrutura.total_folhas,
    por_rubrica: porRubrica,
    por_centro_custo: porCentro,
    opcoes_estrutura: estrutura.opcoes,
    totais,
    olac: {
      totais: olacTotais,
      nao_casadas: olacNaoCasadas,
      lotes: olacLotes,
    },
  };
}

// ------------------------------------------------------------------ variáveis (só em 'aberta')

async function exigirCompetenciaAberta(
  cliente: PoolClient,
  competenciaId: number
): Promise<CompetenciaResumo> {
  const competencia = await buscarCompetenciaParaAtualizar(cliente, competenciaId);
  if (!competencia) {
    throw new ErroHttp(404, "Competência não encontrada.");
  }
  if (competencia.estado !== "aberta") {
    throw new ErroHttp(
      409,
      `Variáveis só mudam com a competência aberta — esta está em "${ROTULOS_ESTADO_COMPETENCIA[competencia.estado]}".`
    );
  }
  return competencia;
}

export async function lancarVariavel(
  sessao: PayloadSessao,
  competenciaId: number,
  dados: LancarVariavel
): Promise<VariavelResumo[]> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const competencia = await exigirCompetenciaAberta(cliente, competenciaId);
    const perfil = await perfilPorColaborador(dados.colaborador_id, cliente);
    if (!perfil) {
      throw new ErroHttpCampo(404, "Colaborador não encontrado.", "colaborador_id");
    }
    if (perfil.status !== "ativo") {
      throw new ErroHttpCampo(
        409,
        "Só colaboradores ativos entram no cálculo da folha F1.",
        "colaborador_id"
      );
    }
    // A versão que o CÁLCULO vai usar. Validar o lançamento contra a versão de
    // hoje e calcular com a da competência aceitaria lançamento em rubrica que
    // não existia no mês — ou recusaria a que existia.
    const rubricas = await listarRubricasVigentes(
      dataReferenciaCompetencia(competencia.ano, competencia.mes),
      cliente
    );
    const rubrica = rubricas.find((item) => item.rubrica_id === dados.rubrica_id);
    if (!rubrica) {
      throw new ErroHttpCampo(
        404,
        "Rubrica não encontrada ou sem versão vigente.",
        "rubrica_id"
      );
    }
    const lancavel = classificarLancavel(rubrica);
    if (!lancavel) {
      throw new ErroHttpCampo(
        400,
        `A rubrica ${rubrica.codigo} é automática — o motor a calcula sozinho.`,
        "rubrica_id"
      );
    }
    let referencia: number | null = null;
    let valorCentavos: number | null = null;
    if (lancavel.precisa === "referencia") {
      if (dados.referencia === undefined) {
        throw new ErroHttpCampo(
          400,
          `A rubrica ${rubrica.codigo} exige referência (horas/dias).`,
          "referencia"
        );
      }
      referencia = dados.referencia;
    } else if (lancavel.precisa === "valor") {
      if (dados.valor === undefined || dados.valor <= 0) {
        throw new ErroHttpCampo(
          400,
          `A rubrica ${rubrica.codigo} exige valor maior que zero.`,
          "valor"
        );
      }
      valorCentavos = Math.round(dados.valor * 100);
    } else {
      // percentual_salario: o lançamento só marca a aplicação — sem insumo.
      referencia = dados.referencia ?? null;
    }
    const variavelId = await inserirVariavel(cliente, {
      competencia_id: competenciaId,
      colaborador_id: dados.colaborador_id,
      rubrica_id: dados.rubrica_id,
      referencia,
      valor_centavos: valorCentavos,
      origem: "manual",
      lancado_por: sessao.usuario_id,
    });
    // Minimização: o VALOR não vai ao diff — folha é o dado mais sensível.
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_VARIAVEL,
      registroId: String(variavelId),
      diff: {
        Colaborador: {
          de: null,
          para: `${perfil.nome_completo} (${perfil.matricula})`,
        },
        Rubrica: { de: null, para: `${rubrica.codigo} — ${rubrica.nome}` },
        Insumo: {
          de: null,
          para:
            referencia !== null
              ? `referência ${referencia}`
              : valorCentavos !== null
                ? "valor informado"
                : "aplicação do percentual",
        },
        Origem: { de: null, para: "Manual" },
      },
    });
  });
  return listarVariaveis(competenciaId);
}

export async function removerVariavel(
  sessao: PayloadSessao,
  competenciaId: number,
  variavelId: number
): Promise<VariavelResumo[]> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    await exigirCompetenciaAberta(cliente, competenciaId);
    const variavel = await buscarVariavelParaAtualizar(cliente, variavelId);
    if (!variavel || variavel.competencia_id !== competenciaId) {
      throw new ErroHttp(404, "Variável não encontrada nesta competência.");
    }
    await excluirVariavel(cliente, variavelId);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "exclusao",
      tabela: TABELA_VARIAVEL,
      registroId: String(variavelId),
      diff: {
        Colaborador: {
          de: `${variavel.colaborador_nome} (${variavel.matricula})`,
          para: null,
        },
        Rubrica: {
          de: `${variavel.codigo} — ${variavel.rubrica_nome}`,
          para: null,
        },
      },
    });
  });
  return listarVariaveis(competenciaId);
}

export async function importarDescontosBeneficios(
  sessao: PayloadSessao,
  competenciaId: number
): Promise<{ importadas: number; removidas: number; variaveis: VariavelResumo[] }> {
  const resultado = await comTransacao(sessao.usuario_id, async (cliente) => {
    const competencia = await exigirCompetenciaAberta(cliente, competenciaId);
    const rubricas = await listarRubricasVigentes(
      dataReferenciaCompetencia(competencia.ano, competencia.mes),
      cliente
    );
    const rubricaBeneficio = rubricas.find(
      (item) => item.codigo === CODIGO_DESCONTO_BENEFICIO
    );
    if (!rubricaBeneficio) {
      throw new ErroHttp(
        409,
        `Rubrica ${CODIGO_DESCONTO_BENEFICIO} (Desconto de Benefício) sem versão vigente — corrija em Parâmetros.`
      );
    }
    // Reimportação idempotente: apaga o lote anterior e regrava das adesões.
    const removidas = await excluirVariaveisDeBeneficio(cliente, competenciaId);
    // NA DATA DA COMPETÊNCIA, a mesma que foi para listarRubricasVigentes três
    // linhas acima. A data sempre esteve aqui e não descia: reimportar julho em
    // agosto descontava benefício de quem aderiu em agosto e deixava de
    // descontar de quem cancelou depois do fechamento.
    const adesoes = await listarDescontosDeAdesao(
      cliente,
      dataReferenciaCompetencia(competencia.ano, competencia.mes)
    );
    for (const adesao of adesoes) {
      await inserirVariavel(cliente, {
        competencia_id: competenciaId,
        colaborador_id: adesao.colaborador_id,
        rubrica_id: rubricaBeneficio.rubrica_id,
        referencia: null,
        valor_centavos: adesao.desconto_centavos,
        origem: "beneficio",
        lancado_por: sessao.usuario_id,
      });
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "importacao_beneficios",
      tabela: TABELA_VARIAVEL,
      registroId: `competencia:${competenciaId}`,
      diff: {
        "Lote anterior removido": { de: null, para: `${removidas} variável(is)` },
        "Descontos importados": {
          de: null,
          para: `${adesoes.length} adesão(ões) ativa(s) com desconto`,
        },
      },
    });
    return { importadas: adesoes.length, removidas };
  });
  return { ...resultado, variaveis: await listarVariaveis(competenciaId) };
}

// ------------------------------------------------------------------ importação do ponto (F5)

export interface ResultadoImportacaoPonto {
  importadas: number;
  removidas: number;
  pessoas: number;
  sem_apuracao: boolean;
  intercorrencias_abertas: number;
  totais_horas: {
    he_50: number;
    he_100: number;
    adicional_noturno: number;
    faltas_dias: number;
  };
  variaveis: VariavelResumo[];
}

/** Minutos → horas com 2 casas, o formato de `referencia` (NUMERIC(10,2)). */
function minutosParaHoras(minutos: number): number {
  return Math.round((minutos / 60) * 100) / 100;
}

/**
 * Traz a apuração de ponto da MESMA competência para dentro da folha como
 * variáveis lançadas com origem 'ponto'.
 *
 * O que entra, e por quê:
 *   • HE 50% e HE 100% (1101/1102) — em HORAS, o que a rubrica
 *     `horas_adicional` espera; o fator (1,5 / 2,0) é da rubrica, não daqui.
 *   • Adicional noturno (1103, migration 0032) — em HORAS, fator 0,20.
 *   • Faltas (1201) — em DIAS: minutos de falta ÷ carga diária da jornada
 *     PINADA na apuração. O motor deriva o DSR (1202) sozinho a partir daí.
 *
 * O que NÃO entra:
 *   • DSR como variável — 1202 é rubrica automática; lançar nela é erro do
 *     motor. O `dsr_desconto_minutos` da apuração (mais exato, semana a
 *     semana) vai para o diff da auditoria como conferência, para o dia em que
 *     a folha ganhar o DSR exato (F2) e a rubrica sair dos automáticos.
 *   • Atraso — o motor de ponto já o converte em minuto de falta ou em débito
 *     de banco de horas, conforme a regra; lançar de novo pagaria em dobro.
 *   • Saldo do banco de horas — banco é COMPENSAÇÃO, o oposto de pagar. Só
 *     vira dinheiro na rescisão ou por decisão explícita de pagar o saldo, e
 *     aí é lançamento manual com justificativa.
 *
 * REIMPORTAÇÃO É IDEMPOTENTE, no mesmo desenho de `importarDescontosBeneficios`:
 * apaga o lote anterior de origem 'ponto' e regrava do zero. Só o lote da
 * própria origem sai — o que o DP lançou à mão continua lá.
 *
 * SÓ COM A COMPETÊNCIA ABERTA: `exigirCompetenciaAberta` é a mesma trava do
 * lançamento manual. Depois de calculada, mudar insumo sem recalcular
 * produziria holerite que não fecha com a memória.
 */
export async function importarVariaveisDoPonto(
  sessao: PayloadSessao,
  competenciaId: number,
  opcoes?: { confirmar_intercorrencias_abertas?: boolean }
): Promise<ResultadoImportacaoPonto> {
  const resultado = await comTransacao(sessao.usuario_id, async (cliente) => {
    const competencia = await exigirCompetenciaAberta(cliente, competenciaId);
    const rubricas = await listarRubricasVigentes(
      dataReferenciaCompetencia(competencia.ano, competencia.mes),
      cliente
    );
    const porCodigo = new Map(rubricas.map((item) => [item.codigo, item]));
    const exigir = (codigo: string): RubricaVigente => {
      const rubrica = porCodigo.get(codigo);
      if (!rubrica) {
        throw new ErroHttp(
          409,
          `Rubrica ${codigo} sem versão vigente — corrija em Parâmetros antes de importar o ponto.`
        );
      }
      return rubrica;
    };
    // Falha ANTES de apagar o lote anterior: importação que derruba o que já
    // existia e não grava nada no lugar seria pior que não importar.
    const mapaLancamento: { codigo: string; rubrica: RubricaVigente }[] = [
      { codigo: CODIGO_HE_50, rubrica: exigir(CODIGO_HE_50) },
      { codigo: CODIGO_HE_100, rubrica: exigir(CODIGO_HE_100) },
      {
        codigo: CODIGO_ADICIONAL_NOTURNO,
        rubrica: exigir(CODIGO_ADICIONAL_NOTURNO),
      },
      { codigo: CODIGO_FALTAS, rubrica: exigir(CODIGO_FALTAS) },
    ];
    const rubricaDe = new Map(
      mapaLancamento.map((item) => [item.codigo, item.rubrica])
    );

    const apuracoes = await listarApuracaoDePontoDaCompetencia(
      cliente,
      competencia.ano,
      competencia.mes
    );
    if (apuracoes.length === 0) {
      throw new ErroHttp(
        409,
        `Nenhuma apuração de ponto para ${formatarCompetencia(competencia.ano, competencia.mes)}. Apure o ponto da competência em Ponto (DP) antes de importar.`
      );
    }

    const removidas = await excluirVariaveisDePonto(cliente, competenciaId);

    let importadas = 0;
    const pessoasTocadas = new Set<number>();
    // O TOTAL É O DO QUE FOI GRAVADO, não o da soma dos minutos: `referencia` é
    // arredondada pessoa a pessoa (NUMERIC(10,2)), então arredondar a soma dos
    // minutos no fim dá outro número — 346,93 contra os 346,91 que o DP encontra
    // somando a coluna Referência da tela. Acumulo em CENTÉSIMO INTEIRO porque
    // somar float de hora devolveria 346.90999999999997.
    const lancadoCentesimos = new Map<string, number>();
    const lancadoDe = (codigo: string) =>
      (lancadoCentesimos.get(codigo) ?? 0) / 100;
    // DSR apurado no ponto: não vira variável (1202 é automática), só entra no
    // diff como conferência — por isso continua em minutos.
    let dsrMinutos = 0;

    const lancar = async (
      colaboradorId: number,
      codigo: string,
      referencia: number
    ) => {
      // `referencia` tem CHECK > 0 no banco: zero simplesmente não vira linha.
      if (referencia <= 0) return;
      await inserirVariavel(cliente, {
        competencia_id: competenciaId,
        colaborador_id: colaboradorId,
        rubrica_id: rubricaDe.get(codigo)!.rubrica_id,
        referencia,
        valor_centavos: null,
        origem: "ponto",
        lancado_por: sessao.usuario_id,
      });
      importadas += 1;
      pessoasTocadas.add(colaboradorId);
      lancadoCentesimos.set(
        codigo,
        (lancadoCentesimos.get(codigo) ?? 0) + Math.round(referencia * 100)
      );
    };

    for (const apuracao of apuracoes) {
      await lancar(
        apuracao.colaborador_id,
        CODIGO_HE_50,
        minutosParaHoras(apuracao.he_50_minutos)
      );
      await lancar(
        apuracao.colaborador_id,
        CODIGO_HE_100,
        minutosParaHoras(apuracao.he_100_minutos)
      );
      await lancar(
        apuracao.colaborador_id,
        CODIGO_ADICIONAL_NOTURNO,
        minutosParaHoras(apuracao.adicional_noturno_minutos)
      );
      // Falta em DIAS: a rubrica 1201 desconta salário ÷ 30 por dia. A carga
      // diária vem da jornada pinada na apuração — 8h48 no administrativo,
      // 7h20 na loja: dividir por um número fixo daria falta errada em metade
      // do quadro. Guarda contra jornada com carga zero (escala livre).
      const faltasDias =
        apuracao.carga_diaria_minutos > 0
          ? Math.round(
              (apuracao.faltas_minutos / apuracao.carga_diaria_minutos) * 100
            ) / 100
          : 0;
      await lancar(apuracao.colaborador_id, CODIGO_FALTAS, faltasDias);

      dsrMinutos += apuracao.dsr_desconto_minutos;
    }

    // FILA DE PONTO ABERTA BARRA A IMPORTAÇÃO — a menos que o DP confirme.
    //
    // Antes isto era só um número devolvido na resposta: a importação seguia
    // calada e a folha pagava insumo que ainda vai mudar. Importar por cima de
    // fila aberta obriga a refazer a competência quando o DP tratar a fila.
    //
    // O QUE A FILA CONTA — e não é uma coisa só. A conta antiga descrevia toda
    // intercorrência aberta como "dia que o motor não soube fechar, sem falta
    // nem hora extra lançada". Isso é verdade para `entrada_sem_saida` e para o
    // intervalo sem retorno, que deixam o dia PENDENTE; é falso para o resto,
    // que sai de dia FECHADO e já lançado: `sem_marcacao` nasce junto com a
    // FALTA INTEGRAL, `fora_da_tolerancia` nasce junto com o ATRASO, e o
    // intervalo do art. 71 nasce em dia que trabalhou (e que costuma estar
    // lançando HORA EXTRA). Em 07/2026 a fila contada tinha 11 linhas: 4
    // `entrada_sem_saida` (essas sim, pendentes, sem lançar nada), 1
    // `sem_marcacao` de 440 min de falta, 2 `fora_da_tolerancia` de 33 e 63 min
    // de atraso e 4 de intervalo do art. 71, um deles num dia de 565 min
    // trabalhados contra 440 previstos. A frase antiga era falsa em 7 das 11.
    //
    // O motivo do bloqueio é o denominador comum dos dois grupos — tratar a
    // fila MUDA o número que a folha vai importar —, e é isso, e só isso, que a
    // mensagem pode afirmar.
    //
    // Não é um bloqueio absoluto, porque competência de folha tem prazo legal e
    // a fila pode ser de casos que o DP já decidiu deixar para depois: o
    // caminho existe, mas passa por uma confirmação EXPLÍCITA que fica gravada
    // na trilha com o número de pendências que havia na hora.
    const intercorrencias = await contarIntercorrenciasAbertasDaCompetencia(
      cliente,
      competencia.ano,
      competencia.mes
    );
    if (intercorrencias > 0 && !opcoes?.confirmar_intercorrencias_abertas) {
      // ErroHttpConfirmavel, e não ErroHttp: este é o ÚNICO 409 desta rota que
      // reenviar com confirmação resolve. Os outros (competência não aberta,
      // sem apuração, rubrica sem versão vigente) voltam como 409 comum, e a
      // tela não pode oferecer "importar assim mesmo" para eles — insistir só
      // traria o mesmo erro de volta.
      throw new ErroHttpConfirmavel(
        409,
        `O ponto de ${formatarCompetencia(competencia.ano, competencia.mes)} tem ` +
          `${intercorrencias} intercorrência(s) ABERTA(S) — dias cujo número AINDA ` +
          `PODE MUDAR quando o DP tratar a fila: uns estão pendentes e não lançaram ` +
          `nada (falta batida), outros já lançaram falta, atraso ou hora extra que o ` +
          `tratamento pode alterar. Trate a fila em Ponto (DP) e reapure, ou confirme ` +
          `a importação assumindo que os números vão mudar.`,
        "intercorrencias_abertas"
      );
    }

    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "importacao_ponto",
      tabela: TABELA_VARIAVEL,
      registroId: `competencia:${competenciaId}`,
      diff: {
        Competência: {
          de: null,
          para: formatarCompetencia(competencia.ano, competencia.mes),
        },
        "Lote anterior removido": {
          de: null,
          para: `${removidas} variável(is) de origem Ponto`,
        },
        "Apurações lidas": {
          de: null,
          para: `${apuracoes.length} colaborador(es) com ponto apurado`,
        },
        "Variáveis lançadas": {
          de: null,
          para: `${importadas} em ${pessoasTocadas.size} colaborador(es)`,
        },
        "HE 50%": { de: null, para: `${lancadoDe(CODIGO_HE_50)} h` },
        "HE 100%": {
          de: null,
          para: `${lancadoDe(CODIGO_HE_100)} h`,
        },
        "Adicional noturno": {
          de: null,
          para: `${lancadoDe(CODIGO_ADICIONAL_NOTURNO)} h`,
        },
        Faltas: {
          de: null,
          para: `${lancadoDe(CODIGO_FALTAS)} dia(s)`,
        },
        "DSR do ponto (conferência)": {
          de: null,
          // Não vira variável: 1202 é automática e o motor deriva o DSR das
          // faltas. Fica no diff para o DP comparar os dois números.
          para: `${minutosParaHoras(dsrMinutos)} h apuradas — o DSR da folha sai da rubrica automática 1202`,
        },
        "Intercorrências de ponto abertas": {
          de: null,
          para:
            intercorrencias > 0
              ? `${intercorrencias} — importado MESMO ASSIM, por confirmação explícita de quem operou`
              : "0",
        },
      },
    });

    return {
      importadas,
      removidas,
      pessoas: pessoasTocadas.size,
      sem_apuracao: false,
      intercorrencias_abertas: intercorrencias,
      totais_horas: {
        he_50: lancadoDe(CODIGO_HE_50),
        he_100: lancadoDe(CODIGO_HE_100),
        adicional_noturno: lancadoDe(CODIGO_ADICIONAL_NOTURNO),
        faltas_dias: lancadoDe(CODIGO_FALTAS),
      },
    };
  });
  return { ...resultado, variaveis: await listarVariaveis(competenciaId) };
}

// ------------------------------------------------------------------ cálculo (aberta|conferencia → calculo → conferencia)

export interface ResultadoCalculoCompetencia {
  calculadas: number;
  impedidos: ImpedidoCalculo[];
  variaveis_ignoradas: number;
}

export async function calcularCompetencia(
  sessao: PayloadSessao,
  competenciaId: number
): Promise<ResultadoCalculoCompetencia> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const competencia = await buscarCompetenciaParaAtualizar(cliente, competenciaId);
    if (!competencia) {
      throw new ErroHttp(404, "Competência não encontrada.");
    }
    if (competencia.estado === "fechada") {
      throw new ErroHttp(
        409,
        "Competência fechada não reabre — correção é competência futura (folha complementar, F2)."
      );
    }
    if (competencia.estado !== "aberta" && competencia.estado !== "conferencia") {
      throw new ErroHttp(
        409,
        `Cálculo só parte de "Aberta" ou "Em conferência" — esta está em "${ROTULOS_ESTADO_COMPETENCIA[competencia.estado]}".`
      );
    }
    const estadoAnterior: EstadoCompetencia = competencia.estado;
    await mudarEstado(cliente, competenciaId, estadoAnterior, "calculo");

    // A ÚNICA data deste cálculo. Todo insumo com vigência — salário, jornada,
    // dependentes, versão de rubrica e as três tabelas legais — se resolve nela.
    // Antes, só `listarVariaveis` sabia de que mês era a folha; o resto lia o
    // cadastro de AGORA, então calcular julho em agosto pagava o salário de
    // agosto e RECALCULAR devolvia outro número a cada dia que passasse. É a
    // mesma régua com que a apropriação (0047) decide onde o custo cai: o
    // sistema já usava a competência para saber ONDE, faltava para saber QUANTO.
    const dataRef = dataReferenciaCompetencia(competencia.ano, competencia.mes);

    const { tabelas, faltantes } = await tabelasVigentes(dataRef, cliente);
    if (!tabelas) {
      throw new ErroHttp(
        409,
        `Sem tabela legal vigente em ${formatarCompetencia(competencia.ano, competencia.mes)}: ${faltantes
          .map((tipo) => ROTULOS_TABELA_LEGAL[tipo])
          .join(", ")} — cadastre em Parâmetros antes de calcular.`
      );
    }
    const [rubricas, colaboradores, variaveis, impedidos, suspensoes] =
      await Promise.all([
        listarRubricasVigentes(dataRef, cliente),
        listarColaboradoresParaCalculo(cliente, dataRef),
        listarVariaveis(competenciaId, cliente),
        listarImpedidos(dataRef, cliente),
        // Suspensão → folha (D2:a, 0100): a janela intersectando a competência
        // ESTENDIDA 6 dias para trás — o DSR do primeiro domingo pode cair por
        // suspensão que acabou no mês anterior (ver suspensao.ts).
        listarSuspensoesParaCalculo(
          cliente,
          inicioBuscaSuspensao(competencia.ano, competencia.mes),
          dataRef
        ),
      ]);

    // Recorte de cada janela pelo mês (puro): dias corridos DESTA competência
    // + domingos de DSR perdidos. Medida sem efeito aqui (dias 0 e nenhum
    // domingo) fica de fora — não polui a memória do item.
    const suspensoesPorColaborador = new Map<number, SuspensaoMotor[]>();
    let suspensoesAplicadas = 0;
    for (const medida of suspensoes) {
      const recorte = apurarSuspensaoNaCompetencia(
        competencia.ano,
        competencia.mes,
        medida.inicio,
        medida.fim
      );
      if (recorte.dias === 0 && recorte.domingos_dsr.length === 0) continue;
      const lista = suspensoesPorColaborador.get(medida.colaborador_id) ?? [];
      lista.push({
        medida_id: medida.medida_id,
        inicio: medida.inicio,
        fim: medida.fim,
        dias_na_competencia: recorte.dias,
        domingos_dsr: recorte.domingos_dsr,
      });
      suspensoesPorColaborador.set(medida.colaborador_id, lista);
      suspensoesAplicadas += 1;
    }

    const variaveisPorColaborador = new Map<number, VariavelMotor[]>();
    let variaveisIgnoradas = 0;
    const calculaveis = new Set(colaboradores.map((item) => item.colaborador_id));
    for (const variavel of variaveis) {
      if (!calculaveis.has(variavel.colaborador_id)) {
        // Lançada para quem saiu do cálculo (desligou/afastou/perdeu posição):
        // não entra — o painel de variáveis continua mostrando o lançamento.
        variaveisIgnoradas += 1;
        continue;
      }
      const lista = variaveisPorColaborador.get(variavel.colaborador_id) ?? [];
      lista.push({
        codigo: variavel.codigo,
        referencia: variavel.referencia,
        valor_centavos: variavel.valor_centavos,
        origem: variavel.origem,
      });
      variaveisPorColaborador.set(variavel.colaborador_id, lista);
    }

    // Recalcular APAGA e regrava — nenhuma execução parcial sobrevive.
    await apagarFolhasDaCompetencia(cliente, competenciaId);

    for (const colaborador of colaboradores) {
      const entrada: EntradaMotor = {
        salario_base_centavos: colaborador.salario_centavos,
        dependentes_irrf: colaborador.dependentes_irrf,
        carga_semanal_minutos: colaborador.carga_semanal_minutos,
        variaveis: variaveisPorColaborador.get(colaborador.colaborador_id) ?? [],
        suspensoes:
          suspensoesPorColaborador.get(colaborador.colaborador_id) ?? [],
        rubricas,
        tabela_inss: tabelas.inss,
        tabela_irrf: tabelas.irrf,
        parametros: tabelas.parametros,
      };
      let resultado;
      try {
        resultado = calcularFolha(entrada);
      } catch (erro) {
        if (erro instanceof ErroMotor) {
          throw new ErroHttp(
            409,
            `Cálculo de ${colaborador.nome_completo} (${colaborador.matricula}): ${erro.message}.`
          );
        }
        throw erro;
      }
      const folhaId = await inserirFolhaColaborador(cliente, {
        competencia_id: competenciaId,
        colaborador_id: colaborador.colaborador_id,
        salario_base_centavos: colaborador.salario_centavos,
        dependentes_irrf: colaborador.dependentes_irrf,
        total_proventos_centavos: resultado.total_proventos_centavos,
        total_descontos_centavos: resultado.total_descontos_centavos,
        liquido_centavos: resultado.liquido_centavos,
      });
      for (const item of resultado.itens) {
        await inserirItemCalculo(cliente, folhaId, {
          rubrica_versao_id: item.rubrica_versao_id,
          referencia: item.referencia,
          base_centavos: item.base_centavos,
          valor_centavos: item.valor_centavos,
          memoria: item.memoria,
        });
      }
    }

    await mudarEstado(cliente, competenciaId, "calculo", "conferencia");
    // Segregação de funções: registra quem calculou — essa pessoa não aprova.
    await registrarCalculadaPor(cliente, competenciaId, sessao.usuario_id);
    // Sem valores no diff — só contagens e estados.
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "calculo",
      tabela: TABELA_COMPETENCIA,
      registroId: String(competenciaId),
      diff: {
        Estado: {
          de: ROTULOS_ESTADO_COMPETENCIA[estadoAnterior],
          para: ROTULOS_ESTADO_COMPETENCIA.conferencia,
        },
        "Folhas calculadas": { de: null, para: String(colaboradores.length) },
        Impedidos: { de: null, para: String(impedidos.length) },
        "Variáveis ignoradas": { de: null, para: String(variaveisIgnoradas) },
        // Eixo 8: só a CONTAGEM — a medida em si (id) fica na memória do item
        // 1203, atrás do mesmo gate (folha.ver, com trilha) dos outros itens.
        "Suspensões disciplinares descontadas": {
          de: null,
          para: String(suspensoesAplicadas),
        },
      },
    });
    return {
      calculadas: colaboradores.length,
      impedidos,
      variaveis_ignoradas: variaveisIgnoradas,
    };
  });
}

// ------------------------------------------------------------------ aprovação e fechamento

export async function aprovarCompetencia(
  sessao: PayloadSessao,
  competenciaId: number,
  codigoTotp: string
): Promise<CompetenciaResumo> {
  // Revalidação de TOTP no ato: aprovar folha é irreversível na prática.
  const totp = await validarTotpDoUsuario(sessao.usuario_id, codigoTotp);
  if (totp === "sem_2fa") {
    throw new ErroHttp(
      403,
      "Aprovação exige autenticação em duas etapas ativa."
    );
  }
  if (totp === "invalido") {
    throw new ErroHttpCampo(
      400,
      "Código do autenticador inválido.",
      "codigo_totp"
    );
  }

  await comTransacao(sessao.usuario_id, async (cliente) => {
    const competencia = await buscarCompetenciaParaAtualizar(cliente, competenciaId);
    if (!competencia) {
      throw new ErroHttp(404, "Competência não encontrada.");
    }
    if (competencia.estado !== "conferencia") {
      throw new ErroHttp(
        409,
        `Aprovação só a partir de "Em conferência" — esta está em "${ROTULOS_ESTADO_COMPETENCIA[competencia.estado]}".`
      );
    }
    if (competencia.calculada_por === sessao.usuario_id) {
      throw new ErroHttp(
        409,
        "Segregação de funções: quem calculou não pode aprovar a mesma competência — outro usuário com a permissão de aprovação precisa fazê-lo."
      );
    }
    // A conferência tem que ser a das versões QUE CALCULARAM esta competência.
    // Conferir a tabela de 2027 não diz nada sobre a folha de 2026, e era isso
    // que o gate aceitava enquanto lia por "ativa".
    const situacao = await situacaoConferenciaTabelas(
      dataReferenciaCompetencia(competencia.ano, competencia.mes),
      cliente
    );
    const pendentes = situacao.filter(
      (item) => item.versao_id === null || !item.conferido_dp
    );
    if (pendentes.length > 0) {
      throw new ErroHttp(
        409,
        `Aprovação bloqueada: tabelas legais não conferidas pelo DP (${pendentes
          .map((item) => ROTULOS_TABELA_LEGAL[item.tipo])
          .join(", ")}). Confira as versões vigentes em Parâmetros.`
      );
    }
    await aprovarCompetenciaNoBanco(cliente, competenciaId, sessao.usuario_id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "aprovacao",
      tabela: TABELA_COMPETENCIA,
      registroId: String(competenciaId),
      diff: {
        Estado: {
          de: ROTULOS_ESTADO_COMPETENCIA.conferencia,
          para: ROTULOS_ESTADO_COMPETENCIA.aprovada,
        },
        "Tabelas legais": {
          de: null,
          para: "todas as vigentes conferidas pelo DP",
        },
        Controles: {
          de: null,
          para: "TOTP revalidado; segregação calculou≠aprovou conferida",
        },
      },
    });
  });
  const atualizada = await buscarCompetencia(competenciaId);
  if (!atualizada) {
    throw new ErroHttp(500, "Falha ao recarregar a competência.");
  }
  return atualizada;
}

/**
 * Fecha e congela. REABRIR NÃO EXISTE — nem endpoint, nem exceção: o trigger
 * do banco barra qualquer mutação em competência fechada e a correção certa é
 * competência futura (folha complementar, F2).
 */
export async function fecharCompetencia(
  sessao: PayloadSessao,
  competenciaId: number
): Promise<CompetenciaResumo> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const competencia = await buscarCompetenciaParaAtualizar(cliente, competenciaId);
    if (!competencia) {
      throw new ErroHttp(404, "Competência não encontrada.");
    }
    if (competencia.estado !== "aprovada") {
      throw new ErroHttp(
        409,
        `Fechamento só a partir de "Aprovada" — esta está em "${ROTULOS_ESTADO_COMPETENCIA[competencia.estado]}".`
      );
    }
    await fecharCompetenciaNoBanco(cliente, competenciaId, sessao.usuario_id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "fechamento",
      tabela: TABELA_COMPETENCIA,
      registroId: String(competenciaId),
      diff: {
        Estado: {
          de: ROTULOS_ESTADO_COMPETENCIA.aprovada,
          para: ROTULOS_ESTADO_COMPETENCIA.fechada,
        },
      },
    });
  });
  const atualizada = await buscarCompetencia(competenciaId);
  if (!atualizada) {
    throw new ErroHttp(500, "Falha ao recarregar a competência.");
  }
  return atualizada;
}

// ------------------------------------------------------------------ suite de regressão do motor

export interface DiferencaCaso {
  campo: string;
  esperado: number | null;
  obtido: number | null;
}

export interface ResultadoCaso {
  caso_id: number;
  nome: string;
  descricao: string;
  passou: boolean;
  diferencas: DiferencaCaso[];
  erro: string | null;
}

function rodarCaso(
  caso: CasoTeste,
  rubricas: RubricaVigente[],
  tabelas: TabelasVigentesMotor
): ResultadoCaso {
  const base: Omit<ResultadoCaso, "passou" | "diferencas" | "erro"> = {
    caso_id: caso.id,
    nome: caso.nome,
    descricao: caso.descricao,
  };
  const entradaLida = esquemaEntradaCasoTeste.safeParse(caso.entrada);
  const saidaLida = esquemaSaidaCasoTeste.safeParse(caso.saida_esperada);
  if (!entradaLida.success || !saidaLida.success) {
    return {
      ...base,
      passou: false,
      diferencas: [],
      erro: "Caso malformado: entrada/saída não seguem o contrato do motor.",
    };
  }
  try {
    const resultado = calcularFolha({
      salario_base_centavos: Math.round(entradaLida.data.salario * 100),
      dependentes_irrf: entradaLida.data.dependentes,
      // Caso sem carga declarada = caso sem jornada: cai no divisor de
      // referência, que é o que todos os casos anteriores à 0038 assumem.
      carga_semanal_minutos: entradaLida.data.carga_semanal_minutos ?? null,
      variaveis: entradaLida.data.variaveis.map((variavel) => ({
        codigo: variavel.rubrica,
        referencia: variavel.referencia ?? null,
        valor_centavos:
          variavel.valor === undefined ? null : Math.round(variavel.valor * 100),
        origem: "manual" as const,
      })),
      rubricas,
      tabela_inss: tabelas.inss,
      tabela_irrf: tabelas.irrf,
      parametros: tabelas.parametros,
    });
    const obtidos = new Map(
      resultado.itens.map((item) => [item.codigo, item.valor_centavos])
    );
    const diferencas: DiferencaCaso[] = [];
    const codigos = new Set([
      ...Object.keys(saidaLida.data.itens),
      ...obtidos.keys(),
    ]);
    for (const codigo of [...codigos].sort()) {
      const esperado = saidaLida.data.itens[codigo];
      const esperadoCentavos =
        esperado === undefined ? null : Math.round(esperado * 100);
      const obtidoCentavos = obtidos.get(codigo) ?? null;
      if (esperadoCentavos !== obtidoCentavos) {
        diferencas.push({
          campo: codigo,
          esperado: esperadoCentavos === null ? null : esperadoCentavos / 100,
          obtido: obtidoCentavos === null ? null : obtidoCentavos / 100,
        });
      }
    }
    const liquidoEsperado = Math.round(saidaLida.data.liquido * 100);
    if (liquidoEsperado !== resultado.liquido_centavos) {
      diferencas.push({
        campo: "liquido",
        esperado: liquidoEsperado / 100,
        obtido: resultado.liquido_centavos / 100,
      });
    }
    return {
      ...base,
      passou: diferencas.length === 0,
      diferencas,
      erro: null,
    };
  } catch (erro) {
    return {
      ...base,
      passou: false,
      diferencas: [],
      erro: erro instanceof Error ? erro.message : "Erro desconhecido no motor.",
    };
  }
}

export interface ResultadoSuite {
  total: number;
  passaram: number;
  falharam: number;
  casos: ResultadoCaso[];
}

/**
 * Bateria de regressão: roda os caso_teste_folha ativos contra o motor com as
 * rubricas e tabelas legais VIGENTES. Tabela nova fazendo a suite falhar é o
 * alarme desenhado — os casos devem ser revisados junto da tabela.
 */
export async function executarSuite(): Promise<ResultadoSuite> {
  // Aqui HOJE é a data certa, e é a única parte da folha em que é: a suite não
  // fala de competência nenhuma, ela pergunta "as tabelas que estão no ar agora
  // ainda produzem os números esperados?". É por isso que a tabela nova faz a
  // suite falhar — o alarme é o objetivo.
  const dataRef = await hojeParaFolha();
  const [{ tabelas, faltantes }, rubricas, casos] = await Promise.all([
    tabelasVigentes(dataRef),
    listarRubricasVigentes(dataRef),
    listarCasosTesteAtivos(),
  ]);
  if (!tabelas) {
    throw new ErroHttp(
      409,
      `Sem tabela legal vigente: ${faltantes
        .map((tipo) => ROTULOS_TABELA_LEGAL[tipo])
        .join(", ")} — a suite roda contra as versões ativas.`
    );
  }
  const resultados = casos.map((caso) => rodarCaso(caso, rubricas, tabelas));
  const passaram = resultados.filter((item) => item.passou).length;
  return {
    total: resultados.length,
    passaram,
    falharam: resultados.length - passaram,
    casos: resultados,
  };
}

// ------------------------------------------------------------------ parâmetros (rubricas e tabelas legais)

export interface VisaoParametros {
  rubricas: CatalogoRubrica[];
  inss: VersaoTabelaInss[];
  irrf: VersaoTabelaIrrf[];
  gerais: VersaoParametros[];
  conferencia: SituacaoConferencia[];
  /** De-para rubrica → conta contábil da OLAC (E3:a), com todas as vigências. */
  contas_contabeis: ContaContabilRubrica[];
}

export async function montarVisaoParametros(): Promise<VisaoParametros> {
  // Tela de catálogo: mostra o que vale HOJE, e não fala de competência. O gate
  // da aprovação é que confere na data da competência (aprovarCompetencia).
  const hoje = await hojeParaFolha();
  const [rubricas, inss, irrf, gerais, conferencia, contasContabeis] =
    await Promise.all([
      listarCatalogoRubricas(),
      listarVersoesInss(),
      listarVersoesIrrf(),
      listarVersoesParametros(),
      situacaoConferenciaTabelas(hoje),
      listarCatalogoContaContabil(),
    ]);
  return {
    rubricas,
    inss,
    irrf,
    gerais,
    conferencia,
    contas_contabeis: contasContabeis,
  };
}

/**
 * Cria uma RUBRICA NOVA (identidade + primeira versão vigente), na mesma
 * transação — rubrica sem versão não é lançável nem calculável. Item G4:
 * antes só existia "nova versão de rubrica existente"; o catálogo só crescia
 * por migração. Código é único: colisão vira 409 legível no campo.
 *
 * Evolução: marcar/desmarcar `excecao` ainda é operação de migração — a tela
 * cria, versiona e encerra (ver `encerrarRubrica`), mas não muda a identidade.
 */
export async function criarRubrica(
  sessao: PayloadSessao,
  dados: NovaRubrica
): Promise<{ rubrica_id: number }> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    let rubricaId: number;
    try {
      rubricaId = await inserirRubrica(cliente, {
        codigo: dados.codigo,
        nome: dados.nome,
        natureza: dados.natureza,
      });
    } catch (erro) {
      if (violacaoUnica(erro)) {
        throw new ErroHttpCampo(
          409,
          `Já existe uma rubrica com o código ${dados.codigo}. Escolha outro código — o catálogo usa 1xxx para remuneração, 2xxx para descontos legais e de benefício, 3xxx para informativas e 9xxx para as verbas manuais genéricas.`,
          "codigo"
        );
      }
      throw erro;
    }
    const versaoId = await inserirVersaoRubrica(cliente, rubricaId, {
      incide_inss: dados.incide_inss,
      incide_irrf: dados.incide_irrf,
      incide_fgts: dados.incide_fgts,
      tipo_calculo: dados.tipo_calculo,
      parametro: dados.parametro ?? null,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_RUBRICA,
      registroId: String(rubricaId),
      diff: {
        Rubrica: { de: null, para: `${dados.codigo} — ${dados.nome}` },
        Natureza: { de: null, para: ROTULOS_NATUREZA[dados.natureza] },
        "Incidências": {
          de: null,
          para: `INSS ${dados.incide_inss ? "sim" : "não"}, IRRF ${dados.incide_irrf ? "sim" : "não"}, FGTS ${dados.incide_fgts ? "sim" : "não"}`,
        },
        "Tipo de cálculo": {
          de: null,
          para: ROTULOS_TIPO_CALCULO[dados.tipo_calculo],
        },
        "Parâmetro": {
          de: null,
          para:
            dados.parametro === null || dados.parametro === undefined
              ? "—"
              : String(dados.parametro),
        },
        "Início de vigência": { de: null, para: dados.inicio_vigencia },
        "Versão criada": { de: null, para: String(versaoId) },
      },
    });
    return { rubrica_id: rubricaId };
  });
}

/**
 * ENCERRA a rubrica por vigência (item G4). Era o buraco do catálogo: a tela
 * criava rubrica e não tinha como tirar nenhuma — e o banco não deixa apagar
 * (trigger rh.bloquear_versao_encerrada). Rubrica criada por engano ficava para
 * sempre no seletor de lançamento da competência.
 *
 * Encerrar NÃO apaga nada: a versão ativa ganha `fim_vigencia` e vira
 * 'encerrada' (imutável a partir daí) e a identidade sai do catálogo lançável
 * (`ativo = FALSE`). Holerite antigo aponta para a VERSÃO, que continua de pé.
 *
 * Duas recusas:
 *   • código que o sistema procura pelo nome (motor e importação do ponto) —
 *     encerrar derrubaria o cálculo da competência inteira;
 *   • lançamento vivo em competência que ainda pode ser recalculada — o motor
 *     estoura "Rubrica X sem versão vigente" e a folha não fecha. O DP tira o
 *     lançamento primeiro; o histórico já fechado não atrapalha.
 */
export async function encerrarRubrica(
  sessao: PayloadSessao,
  rubricaId: number,
  dados: EncerramentoRubrica
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const rubrica = await buscarRubricaParaAtualizar(cliente, rubricaId);
    if (!rubrica) {
      throw new ErroHttp(404, "Rubrica não encontrada.");
    }
    if (CODIGOS_DO_MOTOR.includes(rubrica.codigo)) {
      throw new ErroHttp(
        409,
        `A rubrica ${rubrica.codigo} — ${rubrica.nome} é procurada pelo código pelo motor de cálculo ou pela importação do ponto. Encerrá-la pararia o fechamento da folha.`
      );
    }
    const ativa = await buscarVersaoAtivaRubricaParaAtualizar(cliente, rubricaId);
    if (!ativa) {
      throw new ErroHttp(
        409,
        `A rubrica ${rubrica.codigo} — ${rubrica.nome} já está sem versão vigente.`
      );
    }
    if (dados.fim_vigencia < ativa.inicio_vigencia) {
      throw new ErroHttpCampo(
        400,
        `O fim de vigência não pode ser anterior ao início da versão vigente (${ativa.inicio_vigencia}).`,
        "fim_vigencia"
      );
    }
    const emUso = await contarLancamentosRecalculaveis(cliente, rubricaId);
    if (emUso.lancamentos > 0) {
      throw new ErroHttp(
        409,
        `A rubrica ${rubrica.codigo} — ${rubrica.nome} tem ${emUso.lancamentos} lançamento(s) em competência não fechada (${emUso.competencias.join(", ")}). Remova os lançamentos antes de encerrar — sem versão vigente o cálculo dessa competência não roda.`
      );
    }
    await encerrarVersaoRubricaEm(cliente, ativa.id, dados.fim_vigencia);
    await desativarRubrica(cliente, rubricaId);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "encerramento",
      tabela: TABELA_RUBRICA,
      registroId: String(rubricaId),
      diff: {
        Rubrica: { de: null, para: `${rubrica.codigo} — ${rubrica.nome}` },
        Situação: { de: "No catálogo lançável", para: "Encerrada" },
        "Fim de vigência": { de: null, para: dados.fim_vigencia },
        "Versão encerrada": { de: null, para: String(ativa.id) },
        Motivo: { de: null, para: dados.motivo },
      },
    });
  });
}

export async function criarVersaoRubrica(
  sessao: PayloadSessao,
  rubricaId: number,
  dados: NovaVersaoRubrica
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const rubrica = await buscarRubricaParaAtualizar(cliente, rubricaId);
    if (!rubrica) {
      throw new ErroHttp(404, "Rubrica não encontrada.");
    }
    const anterior = await buscarVersaoAtivaRubricaParaAtualizar(cliente, rubricaId);
    if (anterior && dados.inicio_vigencia <= anterior.inicio_vigencia) {
      throw new ErroHttpCampo(
        400,
        "O início da nova versão deve ser posterior ao início da versão vigente.",
        "inicio_vigencia"
      );
    }
    if (anterior) {
      await encerrarVersaoRubrica(cliente, anterior.id, dados.inicio_vigencia);
    }
    const versaoId = await inserirVersaoRubrica(cliente, rubricaId, {
      incide_inss: dados.incide_inss,
      incide_irrf: dados.incide_irrf,
      incide_fgts: dados.incide_fgts,
      tipo_calculo: dados.tipo_calculo,
      parametro: dados.parametro ?? null,
      inicio_vigencia: dados.inicio_vigencia,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "nova_versao",
      tabela: TABELA_RUBRICA_VERSAO,
      registroId: String(versaoId),
      diff: {
        Rubrica: { de: null, para: `${rubrica.codigo} — ${rubrica.nome}` },
        "Incidências": {
          de: null,
          para: `INSS ${dados.incide_inss ? "sim" : "não"}, IRRF ${dados.incide_irrf ? "sim" : "não"}, FGTS ${dados.incide_fgts ? "sim" : "não"}`,
        },
        "Tipo de cálculo": { de: null, para: dados.tipo_calculo },
        "Parâmetro": {
          de: null,
          para: dados.parametro === null || dados.parametro === undefined
            ? "—"
            : String(dados.parametro),
        },
        "Início de vigência": { de: null, para: dados.inicio_vigencia },
      },
    });
  });
}

async function criarVersaoLegal(
  sessao: PayloadSessao,
  tipo: TipoTabelaLegal,
  inicioVigencia: string,
  inserir: (cliente: PoolClient) => Promise<number>,
  resumo: Record<string, string>
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const anterior = await buscarVersaoLegalAtivaParaAtualizar(cliente, tipo);
    if (anterior && inicioVigencia <= anterior.inicio_vigencia) {
      throw new ErroHttpCampo(
        400,
        "O início da nova versão deve ser posterior ao início da versão vigente.",
        "inicio_vigencia"
      );
    }
    if (anterior) {
      await encerrarVersaoLegal(cliente, tipo, anterior.id, inicioVigencia);
    }
    const versaoId = await inserir(cliente);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "nova_versao",
      tabela: TABELAS_AUDIT[tipo],
      registroId: String(versaoId),
      diff: {
        Tabela: { de: null, para: ROTULOS_TABELA_LEGAL[tipo] },
        ...Object.fromEntries(
          Object.entries(resumo).map(([campo, valor]) => [
            campo,
            { de: null, para: valor },
          ])
        ),
        "Início de vigência": { de: null, para: inicioVigencia },
        "Conferida pelo DP": {
          de: null,
          para: "NÃO — toda carga entra não conferida",
        },
      },
    });
  });
}

export function criarVersaoInss(
  sessao: PayloadSessao,
  dados: NovaTabelaInss
): Promise<void> {
  return criarVersaoLegal(
    sessao,
    "inss",
    dados.inicio_vigencia,
    (cliente) =>
      inserirVersaoInss(cliente, {
        faixas: dados.faixas,
        teto_contribuicao: dados.teto_contribuicao,
        inicio_vigencia: dados.inicio_vigencia,
      }),
    {
      Faixas: dados.faixas
        .map((faixa) => `até ${faixa.ate.toFixed(2)}: ${faixa.aliquota}%`)
        .join("; "),
      "Teto de contribuição": dados.teto_contribuicao.toFixed(2),
    }
  );
}

export function criarVersaoIrrf(
  sessao: PayloadSessao,
  dados: NovaTabelaIrrf
): Promise<void> {
  return criarVersaoLegal(
    sessao,
    "irrf",
    dados.inicio_vigencia,
    (cliente) =>
      inserirVersaoIrrf(cliente, {
        faixas: dados.faixas,
        deducao_por_dependente: dados.deducao_por_dependente,
        desconto_simplificado: dados.desconto_simplificado,
        inicio_vigencia: dados.inicio_vigencia,
      }),
    {
      Faixas: dados.faixas
        .map(
          (faixa) =>
            `até ${faixa.ate === null ? "∞" : faixa.ate.toFixed(2)}: ${faixa.aliquota}% (deduz ${faixa.deducao.toFixed(2)})`
        )
        .join("; "),
      "Dedução por dependente": dados.deducao_por_dependente.toFixed(2),
      "Desconto simplificado": dados.desconto_simplificado.toFixed(2),
    }
  );
}

export function criarVersaoParametros(
  sessao: PayloadSessao,
  dados: NovosParametrosFolha
): Promise<void> {
  return criarVersaoLegal(
    sessao,
    "gerais",
    dados.inicio_vigencia,
    (cliente) =>
      inserirVersaoParametros(cliente, {
        salario_minimo: dados.salario_minimo,
        aliquota_fgts: dados.aliquota_fgts,
        divisor_mensal_horas: dados.divisor_mensal_horas,
        carga_semanal_referencia_minutos:
          dados.carga_semanal_referencia_minutos,
        divisor_mensal_dias: dados.divisor_mensal_dias,
        inicio_vigencia: dados.inicio_vigencia,
      }),
    {
      "Salário mínimo": dados.salario_minimo.toFixed(2),
      "Alíquota FGTS": `${dados.aliquota_fgts}%`,
      "Divisor mensal de horas": `${dados.divisor_mensal_horas} h para ${
        dados.carga_semanal_referencia_minutos / 60
      } h semanais`,
      "Divisor mensal de dias": String(dados.divisor_mensal_dias),
    }
  );
}

export async function conferirTabelaLegal(
  sessao: PayloadSessao,
  tipo: TipoTabelaLegal,
  versaoId: number
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const versao = await buscarVersaoLegalParaAtualizar(cliente, tipo, versaoId);
    if (!versao) {
      throw new ErroHttp(404, "Versão da tabela não encontrada.");
    }
    if (versao.status === "encerrada") {
      throw new ErroHttp(409, "Versão encerrada é imutável — nada a conferir.");
    }
    if (versao.conferido_dp) {
      throw new ErroHttp(409, "Esta versão já foi conferida pelo DP.");
    }
    await marcarVersaoConferida(cliente, tipo, versaoId);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "conferencia_dp",
      tabela: TABELAS_AUDIT[tipo],
      registroId: String(versaoId),
      diff: {
        Tabela: { de: null, para: ROTULOS_TABELA_LEGAL[tipo] },
        "Conferida pelo DP": { de: "Não", para: "Sim" },
      },
    });
  });
}

// ------------------------------------------------------------------ indicador

/**
 * % das competências mensais dos últimos 12 meses fechadas até o 5º dia útil do
 * mês seguinte (art. 459 §1º; sábado conta, domingo e feriado nacional não;
 * America/Sao_Paulo). Null quando nenhuma competência venceu o prazo.
 * Agregado sem valores — seguro para o painel de indicadores.
 */
export async function valorIndicadorFolhaNoPrazo(): Promise<number | null> {
  const dados = await indicadorFolhaNoPrazo();
  if (!dados) return null;
  return Math.round((dados.no_prazo / dados.total) * 1000) / 10;
}

// ------------------------------------------------------------------ prévia de férias (frente 1.6)

export interface PreviaFerias {
  programacao: ProgramacaoParaPrevia;
  /** A data que resolveu TODAS as vigências da prévia (ver o comentário). */
  data_referencia: string;
  dependentes_irrf: number;
  resultado: ResultadoMotorFerias;
}

/**
 * Prévia de valores de uma programação de férias — SÓ LEITURA: nada é gravado
 * em folha nenhuma; o resultado sai com a memória de cálculo de cada item.
 *
 * A DATA DE REFERÊNCIA é o INÍCIO DO GOZO: o art. 142 da CLT manda pagar as
 * férias com a "remuneração que for devida na data da sua concessão", então é
 * nela que se resolvem salário, dependentes, versão de rubrica e as tabelas
 * legais — a mesma mecânica de vigência do cálculo mensal
 * (dataReferenciaCompetencia), com a data que a lei dá a esta conta. Programar
 * dezembro em agosto calcula com o que valerá em dezembro segundo o cadastro
 * de hoje; se o salário mudar antes do gozo, a prévia muda junto — é prévia.
 *
 * TRIBUTAÇÃO: a prévia de programação é sempre de férias GOZADAS (quem gozará
 * é quem programou); o motor aplica INSS/IRRF pelas incidências vigentes de
 * 0136/0137. Férias INDENIZADAS (rescisão) usarão o mesmo motor com
 * modalidade própria — sem incidência, verba indenizatória.
 */
export async function calcularPreviaFerias(
  sessao: PayloadSessao,
  programacaoId: number
): Promise<PreviaFerias> {
  const programacao = await buscarProgramacaoParaPrevia(programacaoId);
  if (!programacao) {
    throw new ErroHttp(404, "Programação de férias não encontrada.");
  }
  if (programacao.status === "recusada" || programacao.status === "cancelada") {
    throw new ErroHttp(
      409,
      `Prévia indisponível: a programação está "${programacao.status}" — férias que não vão acontecer não têm valor a prever.`
    );
  }

  const dataRef = programacao.inicio_gozo;
  const [colaborador, { tabelas, faltantes }, rubricas] = await Promise.all([
    buscarColaboradorParaFerias(programacao.colaborador_id, dataRef),
    tabelasVigentes(dataRef),
    listarRubricasVigentes(dataRef),
  ]);
  if (!colaborador) {
    throw new ErroHttp(
      409,
      `Sem posição com salário vigente em ${dataRef} para ${programacao.colaborador_nome} (${programacao.matricula}) — a prévia não tem remuneração de referência.`
    );
  }
  if (!tabelas) {
    throw new ErroHttp(
      409,
      `Sem tabela legal vigente em ${dataRef}: ${faltantes
        .map((tipo) => ROTULOS_TABELA_LEGAL[tipo])
        .join(", ")} — cadastre em Parâmetros antes da prévia.`
    );
  }

  let resultado: ResultadoMotorFerias;
  try {
    resultado = calcularFerias({
      modalidade: "gozadas",
      salario_base_centavos: colaborador.salario_centavos,
      dependentes_irrf: colaborador.dependentes_irrf,
      dias_gozo: programacao.dias_gozo,
      dias_abono: programacao.dias_abono,
      // Importadores de variáveis ainda não existem — o motor avisa na memória.
      media_variaveis_centavos: null,
      rubricas,
      tabela_inss: tabelas.inss,
      tabela_irrf: tabelas.irrf,
      parametros: tabelas.parametros,
    });
  } catch (erro) {
    if (erro instanceof ErroMotor) {
      throw new ErroHttp(
        409,
        `Prévia de férias de ${programacao.colaborador_nome} (${programacao.matricula}): ${erro.message}.`
      );
    }
    throw erro;
  }

  // Valor de férias deriva do salário — dado mais sensível do sistema: toda
  // leitura autorizada deixa trilha, com a chave que DE FATO autorizou.
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "folha.ver",
    recurso: "rh.programacao_ferias",
    registroId: String(programacaoId),
  });

  return {
    programacao,
    data_referencia: dataRef,
    dependentes_irrf: colaborador.dependentes_irrf,
    resultado,
  };
}

// ------------------------------------------------------------------ prévia de 13º (onda 2)

export interface PreviaDecimo {
  colaborador: {
    id: number;
    nome_completo: string;
    matricula: string;
    data_admissao: string;
  };
  ano: number;
  parcela: ParcelaDecimo;
  /** A data que resolveu TODAS as vigências da prévia (ver o comentário). */
  data_referencia: string;
  dependentes_irrf: number;
  resultado: ResultadoMotorDecimo;
}

/**
 * A data legal de cada parcela é a data de referência das vigências: a 1ª
 * parcela vence em 30/11 (Lei 4.749/65, art. 2º) e a 2ª em 20/12 (art. 1º) —
 * salário, dependentes, versão de rubrica e tabelas legais se resolvem na data
 * da PARCELA calculada, a mesma mecânica de vigência do cálculo mensal
 * (dataReferenciaCompetencia) e da prévia de férias (art. 142).
 */
export function dataReferenciaDecimo(
  ano: number,
  parcela: ParcelaDecimo
): string {
  return parcela === 1 ? `${ano}-11-30` : `${ano}-12-20`;
}

/**
 * Prévia de UMA parcela do 13º de um colaborador — SÓ LEITURA: nada é gravado
 * em folha nenhuma; o resultado sai com a memória de cálculo de cada item.
 *
 * DESLIGADO NÃO PASSA: o 13º proporcional de quem desliga é verba rescisória e
 * pertence ao motor de rescisão (estágio 3) — calcular aqui projetaria avos
 * até 31/12 para um vínculo que não chega lá. A recusa é explicável, não um
 * resultado errado.
 *
 * MÉDIAS e AFASTAMENTOS entram como "não disponíveis" (os importadores de
 * variáveis e a leitura de afastamento sem remuneração ainda não existem) — o
 * motor aplica os defaults conservadores e os AVISOS ficam na saída.
 */
export async function calcularPreviaDecimo(
  sessao: PayloadSessao,
  colaboradorId: number,
  ano: number,
  parcela: ParcelaDecimo
): Promise<PreviaDecimo> {
  const dataRef = dataReferenciaDecimo(ano, parcela);
  const [colaborador, { tabelas, faltantes }, rubricas] = await Promise.all([
    buscarColaboradorParaDecimo(colaboradorId, dataRef),
    tabelasVigentes(dataRef),
    listarRubricasVigentes(dataRef),
  ]);
  if (!colaborador) {
    throw new ErroHttp(404, "Colaborador não encontrado.");
  }
  if (
    colaborador.data_desligamento !== null &&
    colaborador.data_desligamento <= `${ano}-12-31`
  ) {
    throw new ErroHttp(
      409,
      `${colaborador.nome_completo} (${colaborador.matricula}) tem desligamento em ${colaborador.data_desligamento}: o 13º proporcional de quem desliga é verba rescisória — motor de rescisão (estágio 3), não esta prévia.`
    );
  }
  if (colaborador.salario_centavos === null) {
    throw new ErroHttp(
      409,
      `Sem posição com salário vigente em ${dataRef} para ${colaborador.nome_completo} (${colaborador.matricula}) — a prévia não tem remuneração de referência.`
    );
  }
  if (!tabelas) {
    throw new ErroHttp(
      409,
      `Sem tabela legal vigente em ${dataRef}: ${faltantes
        .map((tipo) => ROTULOS_TABELA_LEGAL[tipo])
        .join(", ")} — cadastre em Parâmetros antes da prévia.`
    );
  }

  let resultado: ResultadoMotorDecimo;
  try {
    resultado = calcularDecimo({
      ano,
      parcela,
      data_admissao: colaborador.data_admissao,
      salario_base_centavos: colaborador.salario_centavos,
      dependentes_irrf: colaborador.dependentes_irrf,
      // Importadores de variáveis e leitura de afastamento sem remuneração
      // ainda não existem — o motor avisa na saída (defaults conservadores).
      media_variaveis_centavos: null,
      avos_afastamento: null,
      adiantamento_pago_centavos: null,
      rubricas,
      tabela_inss: tabelas.inss,
      tabela_irrf: tabelas.irrf,
    });
  } catch (erro) {
    if (erro instanceof ErroMotor) {
      throw new ErroHttp(
        409,
        `Prévia de 13º de ${colaborador.nome_completo} (${colaborador.matricula}): ${erro.message}.`
      );
    }
    throw erro;
  }

  // Valor de 13º deriva do salário — dado mais sensível do sistema: toda
  // leitura autorizada deixa trilha, com a chave que DE FATO autorizou.
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "folha.ver",
    recurso: "rh.colaborador",
    registroId: String(colaboradorId),
  });

  return {
    colaborador: {
      id: colaborador.colaborador_id,
      nome_completo: colaborador.nome_completo,
      matricula: colaborador.matricula,
      data_admissao: colaborador.data_admissao,
    },
    ano,
    parcela,
    data_referencia: dataRef,
    dependentes_irrf: colaborador.dependentes_irrf,
    resultado,
  };
}

// ------------------------------------------------------------------ prévia de rescisão (onda 3)

export interface PreviaRescisao {
  processo: DesligamentoParaRescisao;
  /** A data que resolveu TODAS as vigências da prévia (ver o comentário). */
  data_referencia: string;
  dependentes_irrf: number;
  resultado: ResultadoMotorRescisao;
}

/**
 * Prévia de valores da rescisão de UM processo de desligamento — SÓ LEITURA:
 * nada é gravado em folha nenhuma; o resultado sai com a memória de cálculo de
 * cada item. O motor consome os motores de férias (modalidade indenizadas) e
 * de 13º (avos até a data) — ver calculo-rescisao.ts.
 *
 * A DATA DE REFERÊNCIA é o TÉRMINO do contrato: efetivo quando o processo já
 * encerrou, projetado enquanto está em andamento (é a data que o acerto do
 * art. 477 usa). É nela que se resolvem salário, dependentes, versões de
 * rubrica e tabelas legais — a mesma mecânica de vigência do cálculo mensal
 * (dataReferenciaCompetencia), da prévia de férias (art. 142) e da de 13º.
 *
 * Processo CANCELADO não tem prévia (409 explicável): rescisão que não vai
 * acontecer não tem valor a prever. Em andamento ou encerrado, tem.
 *
 * O SALDO DO FGTS é dado EXTERNO (extrato da Caixa) — vem do chamador quando
 * houver; sem ele a multa sai zerada com AVISO (decisão registrada no motor).
 */
export async function calcularPreviaRescisao(
  sessao: PayloadSessao,
  processoId: number,
  saldoFgtsCentavos: number | null = null
): Promise<PreviaRescisao> {
  const processo = await buscarDesligamentoParaRescisao(processoId);
  if (!processo) {
    throw new ErroHttp(404, "Processo de desligamento não encontrado.");
  }
  if (processo.estado === "cancelado") {
    throw new ErroHttp(
      409,
      "Prévia indisponível: o processo de desligamento foi cancelado — rescisão que não vai acontecer não tem valor a prever."
    );
  }

  const dataRef =
    processo.data_termino_efetiva ?? processo.data_projetada_termino;
  const [colaborador, periodos, { tabelas, faltantes }, rubricas] =
    await Promise.all([
      buscarColaboradorParaDecimo(processo.colaborador_id, dataRef),
      listarPeriodosAquisitivosParaRescisao(processo.colaborador_id),
      tabelasVigentes(dataRef),
      listarRubricasVigentes(dataRef),
    ]);
  if (!colaborador || colaborador.salario_centavos === null) {
    throw new ErroHttp(
      409,
      `Sem posição com salário vigente em ${dataRef} para ${processo.colaborador_nome} (${processo.matricula}) — a prévia não tem remuneração de referência.`
    );
  }
  if (!tabelas) {
    throw new ErroHttp(
      409,
      `Sem tabela legal vigente em ${dataRef}: ${faltantes
        .map((tipo) => ROTULOS_TABELA_LEGAL[tipo])
        .join(", ")} — cadastre em Parâmetros antes da prévia.`
    );
  }

  // Quem separa vencidos de em-curso é o serviço, que conhece o término:
  // período COMPLETO até o término com saldo → indenizado; o período que o
  // término corta ao meio → dá os avos das proporcionais.
  const feriasVencidas = periodos
    .filter((periodo) => periodo.fim <= dataRef && periodo.saldo_dias > 0)
    .map((periodo) => ({
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      saldo_dias: periodo.saldo_dias,
      limite_concessivo: periodo.limite_concessivo,
    }));
  const emCurso = periodos.filter(
    (periodo) => periodo.inicio <= dataRef && periodo.fim > dataRef
  );
  const periodoEmCursoInicio =
    emCurso.length > 0 ? emCurso[emCurso.length - 1].inicio : null;

  let resultado: ResultadoMotorRescisao;
  try {
    resultado = calcularRescisao({
      tipo_desligamento: processo.tipo,
      iniciativa: processo.iniciativa,
      modalidade_aviso: processo.modalidade_aviso,
      data_admissao: processo.data_admissao,
      data_comunicacao: processo.data_comunicacao,
      data_termino: dataRef,
      salario_base_centavos: colaborador.salario_centavos,
      dependentes_irrf: colaborador.dependentes_irrf,
      // Importadores de variáveis, extrato do FGTS, 1ª parcela de 13º gravada
      // e afastamento sem remuneração ainda não alimentam o motor — os
      // defaults conservadores avisam na saída (molde pendências #17/#19).
      media_variaveis_centavos: null,
      ferias_vencidas: feriasVencidas,
      periodo_aquisitivo_em_curso_inicio: periodoEmCursoInicio,
      saldo_fgts_centavos: saldoFgtsCentavos,
      adiantamento_decimo_pago_centavos: null,
      avos_afastamento_13: null,
      rubricas,
      tabela_inss: tabelas.inss,
      tabela_irrf: tabelas.irrf,
      parametros: tabelas.parametros,
    });
  } catch (erro) {
    if (erro instanceof ErroMotor) {
      throw new ErroHttp(
        409,
        `Prévia de rescisão de ${processo.colaborador_nome} (${processo.matricula}): ${erro.message}.`
      );
    }
    throw erro;
  }

  // Valor de rescisão deriva do salário — dado mais sensível do sistema: toda
  // leitura autorizada deixa trilha, com a chave que DE FATO autorizou.
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "folha.ver",
    recurso: "rh.processo_desligamento",
    registroId: String(processoId),
  });

  return {
    processo,
    data_referencia: dataRef,
    dependentes_irrf: colaborador.dependentes_irrf,
    resultado,
  };
}

// ------------------------------------------------------------------ OLAC (frente 3.2 — E1–E4)

const TABELA_LOTE_OLAC = "rh_folha.lote_olac";
const TABELA_CONTA_CONTABIL = "rh_folha.conta_contabil_rubrica";

export interface ArquivoOlacGerado {
  nome_arquivo: string;
  conteudo: string;
  linhas: number;
  colaboradores: number;
  /** Linhas cuja rubrica não tem de-para vigente — saem com a conta vazia. */
  linhas_sem_de_para: number;
}

/**
 * EXPORTAÇÃO (a ida): gera o arquivo do layout NOSSO (E4) a partir dos itens
 * calculados da competência — uma linha por colaborador × rubrica, com a conta
 * contábil do de-para vigente NA DATA DE REFERÊNCIA da competência (E3:a).
 * Registra o lote (direção 'exportacao') e a leitura sensível: o arquivo leva
 * valor por pessoa para fora do sistema — é a leitura mais literal que existe.
 *
 * Rubrica sem de-para NÃO bloqueia: a coluna sai vazia e a contagem volta na
 * resposta — quem decide se o arquivo serve assim é o DP, não o código.
 */
export async function exportarOlac(
  sessao: PayloadSessao,
  competenciaId: number
): Promise<ArquivoOlacGerado> {
  const competencia = await buscarCompetencia(competenciaId);
  if (!competencia) {
    throw new ErroHttp(404, "Competência não encontrada.");
  }
  const dataRef = dataReferenciaCompetencia(competencia.ano, competencia.mes);
  const linhasExportacao = await listarLinhasParaExportarOlac(
    competenciaId,
    dataRef
  );
  if (linhasExportacao.length === 0) {
    throw new ErroHttp(
      409,
      `A competência ${formatarCompetencia(competencia.ano, competencia.mes)} não tem folha calculada — calcule antes de exportar o arquivo OLAC.`
    );
  }
  const linhas: LinhaOlac[] = linhasExportacao.map((linha) => ({
    competencia_ano: competencia.ano,
    competencia_mes: competencia.mes,
    empresa_cnpj: linha.empresa_cnpj,
    matricula: linha.matricula,
    colaborador_nome: linha.colaborador_nome,
    codigo_rubrica: linha.codigo_rubrica,
    rubrica_nome: linha.rubrica_nome,
    natureza: linha.natureza,
    conta_contabil: linha.conta_contabil,
    valor_centavos: linha.valor_centavos,
  }));
  const nomeArquivo = nomeArquivoOlac(competencia.ano, competencia.mes);
  const conteudo = gerarArquivoOlac(linhas);
  const colaboradores = new Set(linhas.map((linha) => linha.matricula)).size;
  const semDePara = linhas.filter(
    (linha) => linha.conta_contabil === null
  ).length;

  await comTransacao(sessao.usuario_id, async (cliente) => {
    const loteId = await inserirLoteOlac(cliente, {
      direcao: "exportacao",
      arquivo: nomeArquivo,
      competencia_ano: competencia.ano,
      competencia_mes: competencia.mes,
      empresa_id: null, // a ida cobre o grupo inteiro; a empresa vai por linha
      linhas_lidas: linhas.length,
      linhas_aceitas: linhas.length,
      linhas_rejeitadas: 0,
      relatorio: {
        colaboradores,
        linhas_sem_de_para: semDePara,
      },
      gerado_por: sessao.usuario_id,
    });
    // Sem valores no diff — só contagens (folha é o dado mais sensível).
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "exportacao_olac",
      tabela: TABELA_LOTE_OLAC,
      registroId: String(loteId),
      diff: {
        Competência: {
          de: null,
          para: formatarCompetencia(competencia.ano, competencia.mes),
        },
        Arquivo: { de: null, para: nomeArquivo },
        Linhas: { de: null, para: String(linhas.length) },
        Colaboradores: { de: null, para: String(colaboradores) },
        "Linhas sem de-para de conta contábil": {
          de: null,
          para: String(semDePara),
        },
      },
    });
  });
  // O arquivo carrega salário e descontos por pessoa nominada: trilha com a
  // chave que DE FATO autorizou a rota (eixo 8).
  await registrarLeituraSensivel({
    usuarioId: sessao.usuario_id,
    chavePermissao: "folha.operar",
    recurso: "rh_folha.item_calculo",
    registroId: `competencia:${competenciaId}`,
  });
  return {
    nome_arquivo: nomeArquivo,
    conteudo,
    linhas: linhas.length,
    colaboradores,
    linhas_sem_de_para: semDePara,
  };
}

export interface ResultadoImportacaoOlac {
  lote_id: number;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  situacoes: Record<SituacaoEspelho, number>;
  /** Linhas do espelho anterior substituídas (mesma competência+empresa). */
  substituidas: number;
  rejeicoes: { linha: number; motivo: string; conteudo: string }[];
}

/**
 * IMPORTAÇÃO (a volta): lê o MESMO layout da exportação (E4), casa matrícula e
 * rubrica com o cadastro e grava o ESPELHO de conciliação (E1:a/E2:a) com a
 * situação linha a linha — linha ruim vira rejeição com motivo e NUNCA aborta
 * o lote (regra de ouro dos importadores da casa).
 *
 * REIMPORTAR SUBSTITUI: antes de gravar, o espelho anterior da MESMA
 * competência+empresa (vindo de importação) é apagado — o padrão dos lotes por
 * origem da folha (importarDescontosBeneficios / importarVariaveisDoPonto).
 *
 * SEM trava de estado da competência, de propósito: conciliação contábil
 * acontece depois do fechamento, e o espelho não toca a folha calculada (E2:a
 * — somente-leitura, tabela paralela).
 *
 * O que rejeita (a linha, nunca o lote): análise de formato; competência da
 * linha diferente da competência da rota (arquivo trocado); CNPJ que não é de
 * nenhuma empresa do grupo (sem empresa não há par empresa+competência para o
 * espelho conciliar).
 */
export async function importarOlac(
  sessao: PayloadSessao,
  competenciaId: number,
  dados: { arquivo: string; conteudo: string }
): Promise<ResultadoImportacaoOlac> {
  const competencia = await buscarCompetencia(competenciaId);
  if (!competencia) {
    throw new ErroHttp(404, "Competência não encontrada.");
  }
  const linhasArquivo = dividirLinhas(dados.conteudo).filter(
    (item, indice) => !(indice === 0 && ehCabecalhoOlac(item.bruta))
  );
  if (linhasArquivo.length === 0) {
    throw new ErroHttpCampo(
      400,
      "O arquivo está vazio — nenhuma linha além do cabeçalho.",
      "conteudo"
    );
  }
  const dataRef = dataReferenciaCompetencia(competencia.ano, competencia.mes);
  const rotuloCompetencia = formatarCompetencia(
    competencia.ano,
    competencia.mes
  );

  return comTransacao(sessao.usuario_id, async (cliente) => {
    const [colaboradorPorMatricula, empresaPorCnpj, rubricas] =
      await Promise.all([
        mapaColaboradorPorMatricula(cliente),
        mapaEmpresaPorCnpj(cliente),
        // As rubricas VIGENTES NA COMPETÊNCIA — a mesma régua do cálculo: o
        // arquivo devolvido referencia os códigos que exportamos para aquele
        // mês, não o catálogo de hoje.
        listarRubricasVigentes(dataRef, cliente),
      ]);
    const rubricasPorCodigo = new Set(rubricas.map((item) => item.codigo));

    const rejeicoes: { linha: number; motivo: string; conteudo: string }[] = [];
    const aceitas: {
      linha: LinhaOlac;
      empresa_id: number | null;
      colaborador_id: number | null;
      codigo_rubrica_interno: string | null;
      situacao: SituacaoEspelho;
    }[] = [];
    const situacoes: Record<SituacaoEspelho, number> = {
      casada: 0,
      sem_rubrica: 0,
      sem_colaborador: 0,
    };

    for (const { numero, bruta } of linhasArquivo) {
      const analise = analisarLinhaOlac(bruta.split(SEPARADOR_OLAC));
      if (!analise.ok) {
        rejeicoes.push({ linha: numero, motivo: analise.motivo, conteudo: bruta });
        continue;
      }
      const linha = analise.dados;
      if (
        linha.competencia_ano !== competencia.ano ||
        linha.competencia_mes !== competencia.mes
      ) {
        rejeicoes.push({
          linha: numero,
          motivo: `Linha da competência ${formatarCompetencia(linha.competencia_ano, linha.competencia_mes)} num arquivo importado em ${rotuloCompetencia} — confira se o arquivo é o certo`,
          conteudo: bruta,
        });
        continue;
      }
      let empresaId: number | null = null;
      if (linha.empresa_cnpj !== null) {
        empresaId = empresaPorCnpj.get(linha.empresa_cnpj) ?? null;
        if (empresaId === null) {
          rejeicoes.push({
            linha: numero,
            motivo: `CNPJ ${linha.empresa_cnpj} não é de nenhuma empresa do grupo`,
            conteudo: bruta,
          });
          continue;
        }
      }
      const casamento = casarLinhaOlac(linha, {
        colaboradorPorMatricula,
        rubricasPorCodigo,
      });
      situacoes[casamento.situacao] += 1;
      aceitas.push({
        linha,
        empresa_id: empresaId,
        colaborador_id: casamento.colaborador_id,
        codigo_rubrica_interno: casamento.codigo_rubrica_interno,
        situacao: casamento.situacao,
      });
    }

    // Substituição por empresa+competência (E1:a) ANTES de gravar o lote novo.
    const empresasTocadas = new Map<string, number | null>();
    for (const item of aceitas) {
      empresasTocadas.set(String(item.empresa_id), item.empresa_id);
    }
    let substituidas = 0;
    for (const empresaId of empresasTocadas.values()) {
      substituidas += await apagarEspelhoOlacAnterior(
        cliente,
        competencia.ano,
        competencia.mes,
        empresaId
      );
    }

    // A empresa do LOTE: quando o arquivo é de UMA empresa (a volta da OLAC
    // vem por empresa processada fora), ela fica no lote; misto fica NULL e a
    // empresa vale linha a linha no espelho.
    const empresasDistintas = [...empresasTocadas.values()];
    const empresaDoLote =
      empresasDistintas.length === 1 ? empresasDistintas[0] : null;

    const loteId = await inserirLoteOlac(cliente, {
      direcao: "importacao",
      arquivo: dados.arquivo,
      competencia_ano: competencia.ano,
      competencia_mes: competencia.mes,
      empresa_id: empresaDoLote,
      linhas_lidas: linhasArquivo.length,
      linhas_aceitas: aceitas.length,
      linhas_rejeitadas: rejeicoes.length,
      relatorio: {
        rejeitadas: rejeicoes,
        situacoes,
        substituidas,
      },
      gerado_por: sessao.usuario_id,
    });
    for (const item of aceitas) {
      await inserirEspelhoOlac(cliente, {
        lote_id: loteId,
        competencia_ano: competencia.ano,
        competencia_mes: competencia.mes,
        empresa_id: item.empresa_id,
        empresa_cnpj: item.linha.empresa_cnpj,
        matricula: item.linha.matricula,
        colaborador_id: item.colaborador_id,
        codigo_rubrica_externo: item.linha.codigo_rubrica,
        codigo_rubrica_interno: item.codigo_rubrica_interno,
        conta_contabil: item.linha.conta_contabil,
        valor_centavos: item.linha.valor_centavos,
        situacao: item.situacao,
      });
    }

    // Sem valores no diff — contagens e situações apenas.
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "importacao_olac",
      tabela: TABELA_LOTE_OLAC,
      registroId: String(loteId),
      diff: {
        Competência: { de: null, para: rotuloCompetencia },
        Arquivo: { de: null, para: dados.arquivo },
        "Linhas lidas": { de: null, para: String(linhasArquivo.length) },
        "Linhas aceitas": { de: null, para: String(aceitas.length) },
        "Linhas rejeitadas": { de: null, para: String(rejeicoes.length) },
        "Casadas / sem rubrica / sem colaborador": {
          de: null,
          para: `${situacoes.casada} / ${situacoes.sem_rubrica} / ${situacoes.sem_colaborador}`,
        },
        "Espelho anterior substituído": {
          de: null,
          para: `${substituidas} linha(s)`,
        },
      },
    });

    return {
      lote_id: loteId,
      linhas_lidas: linhasArquivo.length,
      linhas_aceitas: aceitas.length,
      linhas_rejeitadas: rejeicoes.length,
      situacoes,
      substituidas,
      rejeicoes,
    };
  });
}

// ------------------------------------------------------------------ de-para conta contábil (E3:a)

/** Um dia antes, em aritmética de calendário UTC (molde dataReferencia…). */
function diaAnterior(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia - 1)).toISOString().slice(0, 10);
}

/**
 * Cria a vigência do de-para de uma rubrica. Se já existe uma ATIVA, ela é
 * encerrada NO DIA ANTERIOR ao início da nova, na mesma transação — o catálogo
 * nunca fica com duas contas valendo no mesmo dia (o índice parcial do banco
 * é o cinto; isto é a regra).
 */
export async function criarContaContabil(
  sessao: PayloadSessao,
  dados: NovaContaContabil
): Promise<{ id: number }> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const rubrica = await buscarRubricaParaAtualizar(cliente, dados.rubrica_id);
    if (!rubrica) {
      throw new ErroHttpCampo(404, "Rubrica não encontrada.", "rubrica_id");
    }
    const ativa = await buscarContaContabilAtivaParaAtualizar(
      cliente,
      dados.rubrica_id
    );
    let contaAnterior: string | null = null;
    if (ativa) {
      if (dados.inicio_vigencia <= ativa.inicio_vigencia) {
        throw new ErroHttpCampo(
          400,
          `A nova vigência precisa começar depois de ${ativa.inicio_vigencia}, o início da vigência atual.`,
          "inicio_vigencia"
        );
      }
      await encerrarContaContabilNoBanco(
        cliente,
        ativa.id,
        diaAnterior(dados.inicio_vigencia)
      );
      contaAnterior = `versão ${ativa.id} encerrada em ${diaAnterior(dados.inicio_vigencia)}`;
    }
    const id = await inserirContaContabil(cliente, {
      rubrica_id: dados.rubrica_id,
      conta_contabil: dados.conta_contabil,
      inicio_vigencia: dados.inicio_vigencia,
      criado_por: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_CONTA_CONTABIL,
      registroId: String(id),
      diff: {
        Rubrica: { de: null, para: `${rubrica.codigo} — ${rubrica.nome}` },
        "Conta contábil": { de: null, para: dados.conta_contabil },
        "Início de vigência": { de: null, para: dados.inicio_vigencia },
        "Vigência anterior": { de: null, para: contaAnterior ?? "não havia" },
      },
    });
    return { id };
  });
}

/** Encerra a vigência ativa do de-para — a rubrica volta a sair sem conta. */
export async function encerrarContaContabil(
  sessao: PayloadSessao,
  id: number,
  dados: EncerrarContaContabil
): Promise<void> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const vigencia = await buscarContaContabilParaAtualizar(cliente, id);
    if (!vigencia) {
      throw new ErroHttp(404, "Vigência de conta contábil não encontrada.");
    }
    if (vigencia.status !== "ativa") {
      throw new ErroHttp(
        409,
        "Esta vigência já está encerrada — encerrada é imutável."
      );
    }
    if (dados.fim_vigencia < vigencia.inicio_vigencia) {
      throw new ErroHttpCampo(
        400,
        `O fim de vigência não pode ser anterior ao início (${vigencia.inicio_vigencia}).`,
        "fim_vigencia"
      );
    }
    await encerrarContaContabilNoBanco(cliente, id, dados.fim_vigencia);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "encerramento",
      tabela: TABELA_CONTA_CONTABIL,
      registroId: String(id),
      diff: {
        Rubrica: {
          de: null,
          para: `${vigencia.codigo} — ${vigencia.rubrica_nome}`,
        },
        "Conta contábil": { de: vigencia.conta_contabil, para: null },
        "Fim de vigência": { de: null, para: dados.fim_vigencia },
      },
    });
  });
}
