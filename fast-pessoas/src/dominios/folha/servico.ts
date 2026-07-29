import { PoolClient } from "pg";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
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
import { PayloadSessao } from "../identidade/esquemas";
import { validarTotpDoUsuario } from "../identidade/servico";
import { calcularFolha, EntradaMotor, ErroMotor, VariavelMotor } from "./calculo";
import {
  AbrirCompetencia,
  CODIGO_DESCONTO_BENEFICIO,
  CODIGO_FALTAS,
  CODIGOS_AUTOMATICOS,
  esquemaEntradaCasoTeste,
  esquemaSaidaCasoTeste,
  EstadoCompetencia,
  formatarCompetencia,
  LancarVariavel,
  NovaTabelaInss,
  NovaTabelaIrrf,
  NovaVersaoRubrica,
  NovosParametrosFolha,
  ROTULOS_ESTADO_COMPETENCIA,
  ROTULOS_TABELA_LEGAL,
  TipoTabelaLegal,
} from "./esquemas";
import {
  apagarFolhasDaCompetencia,
  buscarCompetencia,
  buscarCompetenciaParaAtualizar,
  buscarRubricaParaAtualizar,
  buscarVariavelParaAtualizar,
  buscarVersaoAtivaRubricaParaAtualizar,
  buscarVersaoLegalAtivaParaAtualizar,
  buscarVersaoLegalParaAtualizar,
  CasoTeste,
  CatalogoRubrica,
  CompetenciaResumo,
  encerrarVersaoLegal,
  encerrarVersaoRubrica,
  excluirVariavel,
  excluirVariaveisDeBeneficio,
  aprovarCompetenciaNoBanco,
  fecharCompetencia as fecharCompetenciaNoBanco,
  registrarCalculadaPor,
  FolhaResumo,
  ImpedidoCalculo,
  indicadorFolhaNoPrazo,
  inserirCompetencia,
  inserirFolhaColaborador,
  inserirItemCalculo,
  inserirVariavel,
  inserirVersaoInss,
  inserirVersaoIrrf,
  inserirVersaoParametros,
  inserirVersaoRubrica,
  ItemFolha,
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
  RubricaVigente,
  SituacaoConferencia,
  situacaoConferenciaTabelas,
  tabelasVigentes,
  TabelasVigentesMotor,
  VariavelResumo,
  VersaoParametros,
  VersaoTabelaInss,
  VersaoTabelaIrrf,
} from "./repositorio";

const TABELA_COMPETENCIA = "rh_folha.competencia_folha";
const TABELA_VARIAVEL = "rh_folha.variavel_lancada";
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

export async function abrirCompetencia(
  sessao: PayloadSessao,
  dados: AbrirCompetencia
): Promise<CompetenciaResumo> {
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
}

export interface FolhaComItens extends FolhaResumo {
  itens: ItemFolha[];
}

export interface VisaoCompetencia {
  pode: PermissoesFolha;
  competencia: CompetenciaResumo;
  impedidos: ImpedidoCalculo[];
  variaveis: VariavelResumo[];
  rubricas_lancaveis: RubricaLancavel[];
  colaboradores: ColaboradorOpcao[];
  tabelas_conferidas: SituacaoConferencia[];
  folhas: FolhaComItens[];
  totais: {
    total_proventos_centavos: number;
    total_descontos_centavos: number;
    liquido_centavos: number;
  };
}

function classificarLancavel(
  rubrica: RubricaVigente
): RubricaLancavel | null {
  if (rubrica.codigo === CODIGO_FALTAS) {
    return {
      rubrica_id: rubrica.rubrica_id,
      codigo: rubrica.codigo,
      nome: rubrica.nome,
      natureza: rubrica.natureza,
      precisa: "referencia",
    };
  }
  if (CODIGOS_AUTOMATICOS.includes(rubrica.codigo)) return null;
  if (rubrica.tipo_calculo === "horas_adicional") {
    return {
      rubrica_id: rubrica.rubrica_id,
      codigo: rubrica.codigo,
      nome: rubrica.nome,
      natureza: rubrica.natureza,
      precisa: "referencia",
    };
  }
  if (rubrica.tipo_calculo === "valor_informado") {
    return {
      rubrica_id: rubrica.rubrica_id,
      codigo: rubrica.codigo,
      nome: rubrica.nome,
      natureza: rubrica.natureza,
      precisa: "valor",
    };
  }
  if (rubrica.tipo_calculo === "percentual_salario") {
    return {
      rubrica_id: rubrica.rubrica_id,
      codigo: rubrica.codigo,
      nome: rubrica.nome,
      natureza: rubrica.natureza,
      precisa: "nenhum",
    };
  }
  return null;
}

export async function montarVisaoCompetencia(
  sessao: PayloadSessao,
  competenciaId: number
): Promise<VisaoCompetencia> {
  const competencia = await buscarCompetencia(competenciaId);
  if (!competencia) {
    throw new ErroHttp(404, "Competência não encontrada.");
  }
  const [
    pode,
    impedidos,
    variaveis,
    rubricas,
    colaboradores,
    conferencia,
    folhas,
    itens,
  ] = await Promise.all([
    permissoesFolha(sessao.usuario_id),
    listarImpedidos(),
    listarVariaveis(competenciaId),
    listarRubricasVigentes(),
    listarColaboradoresAtivos(),
    situacaoConferenciaTabelas(),
    listarFolhasDaCompetencia(competenciaId),
    listarItensDaCompetencia(competenciaId),
  ]);

  if (folhas.length > 0) {
    // Salário e resultado de folha são o dado mais sensível do sistema:
    // toda leitura autorizada deixa trilha.
    await registrarLeituraSensivel({
      usuarioId: sessao.usuario_id,
      chavePermissao: "folha.ver",
      recurso: "rh_folha.folha_colaborador",
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
    totais,
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
    await exigirCompetenciaAberta(cliente, competenciaId);
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
    const rubricas = await listarRubricasVigentes(cliente);
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
    await exigirCompetenciaAberta(cliente, competenciaId);
    const rubricas = await listarRubricasVigentes(cliente);
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
    const adesoes = await listarDescontosDeAdesao(cliente);
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

    const { tabelas, faltantes } = await tabelasVigentes(cliente);
    if (!tabelas) {
      throw new ErroHttp(
        409,
        `Sem tabela legal vigente: ${faltantes
          .map((tipo) => ROTULOS_TABELA_LEGAL[tipo])
          .join(", ")} — cadastre em Parâmetros antes de calcular.`
      );
    }
    const [rubricas, colaboradores, variaveis, impedidos] = await Promise.all([
      listarRubricasVigentes(cliente),
      listarColaboradoresParaCalculo(cliente),
      listarVariaveis(competenciaId, cliente),
      listarImpedidos(cliente),
    ]);

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
        variaveis: variaveisPorColaborador.get(colaborador.colaborador_id) ?? [],
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
    const situacao = await situacaoConferenciaTabelas(cliente);
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
  const [{ tabelas, faltantes }, rubricas, casos] = await Promise.all([
    tabelasVigentes(),
    listarRubricasVigentes(),
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
}

export async function montarVisaoParametros(): Promise<VisaoParametros> {
  const [rubricas, inss, irrf, gerais, conferencia] = await Promise.all([
    listarCatalogoRubricas(),
    listarVersoesInss(),
    listarVersoesIrrf(),
    listarVersoesParametros(),
    situacaoConferenciaTabelas(),
  ]);
  return { rubricas, inss, irrf, gerais, conferencia };
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
        inicio_vigencia: dados.inicio_vigencia,
      }),
    {
      "Salário mínimo": dados.salario_minimo.toFixed(2),
      "Alíquota FGTS": `${dados.aliquota_fgts}%`,
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
 * % das competências mensais dos últimos 12 meses fechadas até o dia 5 do mês
 * seguinte (America/Sao_Paulo). Null quando nenhuma competência venceu o prazo.
 * Agregado sem valores — seguro para o painel de indicadores.
 */
export async function valorIndicadorFolhaNoPrazo(): Promise<number | null> {
  const dados = await indicadorFolhaNoPrazo();
  if (!dados) return null;
  return Math.round((dados.no_prazo / dados.total) * 1000) / 10;
}
