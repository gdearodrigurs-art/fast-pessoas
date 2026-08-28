import { PoolClient } from "pg";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { inserirEvento } from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  AberturaProcesso,
  calcularPrazosExperiencia,
  EstadoProcesso,
  familiaDoModelo,
  ItemAvulso,
  ModeloAdmissaoEntrada,
  percentualConclusao,
  ROTULOS_ESTADO_PROCESSO,
  ROTULOS_FAMILIA_MODELO,
  ROTULOS_STATUS_ITEM,
  StatusItem,
  TipoVinculoModelo,
} from "./esquemas";
import {
  atualizarEstadoProcesso,
  atualizarStatusItem,
  buscarChecklistAtivo,
  buscarColaborador,
  buscarItemParaMutacao,
  buscarProcessoParaMutacao,
  buscarResumo,
  CandidatoAdmissao,
  contarObrigatoriosPendentes,
  criarProcesso,
  ehGestorDoColaborador,
  encerrarModeloAtivoDaFamilia,
  inserirItemAvulso,
  inserirItens,
  inserirModeloAtivo,
  ItemChecklistTemplate,
  ItemProcesso,
  listarCandidatos,
  listarItens,
  listarModelosAdmissao,
  listarProcessos,
  listarProcessosDosLiderados,
  ModeloAdmissao,
  ProcessoParaMutacao,
  ProcessoResumo,
  proximaVersaoDaFamilia,
  valorIndicadorAdmissoesNoPrazo as indicadorNoPrazo,
} from "./repositorio";

const TABELA_PROCESSO = "rh.processo_admissao";
const TABELA_ITEM = "rh.item_admissao";
const TABELA_MODELO = "rh.checklist_admissao_versao";

export interface PermissoesAdmissao {
  gerir: boolean;
}

export interface PainelAdmissoes {
  pode: PermissoesAdmissao;
  processos: ProcessoResumo[];
  /** Colaboradores ainda sem processo — só para quem pode gerir. */
  candidatos: CandidatoAdmissao[] | null;
  /** % de admissões concluídas até o início previsto (12m) — só para quem gere. */
  indicador_no_prazo: number | null;
}

export interface DetalheProcesso {
  processo: ProcessoResumo;
  itens: ItemProcesso[];
  percentual: number;
  acoes: {
    tratar_itens: boolean;
    concluir: boolean;
    cancelar: boolean;
  };
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function podeGerir(usuarioId: number): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, "admissao.gerir"]
  );
  return Boolean(linhas[0]?.autorizado);
}

/**
 * Painel: quem gere (DP) vê todos os processos + candidatos + indicador;
 * quem só vê (gestor/RH sem gestão) enxerga apenas os processos dos seus
 * liderados vigentes — leitura, sem ações.
 */
export async function montarPainel(
  sessao: PayloadSessao
): Promise<PainelAdmissoes> {
  const gerir = await podeGerir(sessao.usuario_id);
  if (!gerir) {
    return {
      pode: { gerir },
      processos: await listarProcessosDosLiderados(sessao.usuario_id),
      candidatos: null,
      indicador_no_prazo: null,
    };
  }
  const [processos, candidatos, indicador] = await Promise.all([
    listarProcessos(),
    listarCandidatos(),
    indicadorNoPrazo(),
  ]);
  return {
    pode: { gerir },
    processos,
    candidatos,
    indicador_no_prazo: indicador,
  };
}

// ------------------------------------------------------------------ administração dos modelos (por vínculo)

async function podeAdministrarModelo(usuarioId: number): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, "admissao.modelo.administrar"]
  );
  return Boolean(linhas[0]?.autorizado);
}

export interface ModeloVersaoView {
  id: number;
  versao: number;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  itens: ItemChecklistTemplate[];
  quantidade_itens: number;
  obrigatorios: number;
}

export interface FamiliaModeloView {
  tipo_vinculo: TipoVinculoModelo | null;
  familia: TipoVinculoModelo | "geral";
  rotulo: string;
  ativa: ModeloVersaoView | null;
  historico: ModeloVersaoView[];
}

export interface PainelModelos {
  pode: boolean;
  familias: FamiliaModeloView[];
}

// A ordem fixa das famílias no painel: o geral primeiro (é o fallback), depois
// os vínculos. Mostra todas — inclusive as que ainda não têm modelo — para o DP
// poder criar o que falta.
const FAMILIAS_NA_ORDEM: (TipoVinculoModelo | null)[] = [
  null,
  "clt",
  "estagiario",
  "aprendiz",
  "pj",
];

function paraVersaoView(modelo: ModeloAdmissao): ModeloVersaoView {
  return {
    id: modelo.id,
    versao: modelo.versao,
    status: modelo.status,
    inicio_vigencia: modelo.inicio_vigencia,
    fim_vigencia: modelo.fim_vigencia,
    itens: modelo.itens,
    quantidade_itens: modelo.itens.length,
    obrigatorios: modelo.itens.filter((item) => item.obrigatorio).length,
  };
}

/**
 * Painel de administração dos modelos: uma linha por família (geral + os quatro
 * vínculos), com a versão ativa (ou nada, se a família ainda não tem modelo) e o
 * histórico das encerradas.
 */
export async function montarPainelModelos(
  sessao: PayloadSessao
): Promise<PainelModelos> {
  const pode = await podeAdministrarModelo(sessao.usuario_id);
  const todas = await listarModelosAdmissao();
  const familias = FAMILIAS_NA_ORDEM.map((tipoVinculo) => {
    const daFamilia = todas.filter(
      (modelo) => modelo.tipo_vinculo === tipoVinculo
    );
    const ativa = daFamilia.find((modelo) => modelo.status === "ativa") ?? null;
    const historico = daFamilia.filter((modelo) => modelo.status !== "ativa");
    return {
      tipo_vinculo: tipoVinculo,
      familia: familiaDoModelo(tipoVinculo),
      rotulo: ROTULOS_FAMILIA_MODELO[familiaDoModelo(tipoVinculo)],
      ativa: ativa ? paraVersaoView(ativa) : null,
      historico: historico.map(paraVersaoView),
    };
  });
  return { pode, familias };
}

/**
 * Salva um modelo: grava uma nova versão ATIVA para a família e encerra a
 * anterior no MESMO ato (transação). Numeração e encerramento escopados por
 * família — nunca tocam outra. A corrida de dois salvamentos simultâneos da
 * mesma família é barrada pelos índices únicos (uma_ativa / família_versão) e
 * vira 409.
 */
export async function salvarModeloAdmissao(
  sessao: PayloadSessao,
  dados: ModeloAdmissaoEntrada
): Promise<{ id: number; versao: number }> {
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const versao = await proximaVersaoDaFamilia(cliente, dados.tipo_vinculo);
      const itens: ItemChecklistTemplate[] = dados.itens.map((item, indice) => ({
        ordem: indice + 1,
        descricao: item.descricao,
        obrigatorio: item.obrigatorio,
      }));
      const encerradoId = await encerrarModeloAtivoDaFamilia(
        cliente,
        dados.tipo_vinculo
      );
      const criado = await inserirModeloAtivo(cliente, {
        tipoVinculo: dados.tipo_vinculo,
        versao,
        itens,
      });
      const obrigatorios = itens.filter((item) => item.obrigatorio).length;
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_MODELO,
        registroId: String(criado.id),
        diff: {
          Modelo: {
            de: null,
            para: ROTULOS_FAMILIA_MODELO[familiaDoModelo(dados.tipo_vinculo)],
          },
          Versão: {
            de: encerradoId ? `#${encerradoId} encerrada` : "nenhuma (primeira)",
            para: `v${criado.versao} (ativa)`,
          },
          Itens: {
            de: null,
            para: `${itens.length} (${obrigatorios} obrigatório(s))`,
          },
        },
      });
      return criado;
    });
  } catch (erro) {
    if (violacaoUnica(erro)) {
      throw new ErroHttp(
        409,
        "Outra alteração deste modelo acabou de acontecer — recarregue e refaça."
      );
    }
    throw erro;
  }
}

export async function abrirProcesso(
  sessao: PayloadSessao,
  dados: AberturaProcesso
): Promise<ProcessoResumo> {
  const colaborador = await buscarColaborador(dados.colaborador_id);
  if (!colaborador) {
    throw new ErroHttpCampo(404, "Colaborador não encontrado.", "colaborador_id");
  }
  if (colaborador.status === "desligado") {
    throw new ErroHttpCampo(
      400,
      "Colaborador desligado não abre processo de admissão.",
      "colaborador_id"
    );
  }

  const prazos = dados.contrato_experiencia
    ? calcularPrazosExperiencia(colaborador.data_admissao)
    : { prazo_experiencia_1: null, prazo_experiencia_2: null };

  let processoId: number;
  try {
    processoId = await comTransacao(sessao.usuario_id, async (cliente) => {
      // Congela a versão vigente do checklist DO VÍNCULO (com fallback no
      // geral, 0058) e materializa os itens. O modelo escolhido é o do
      // tipo de vínculo do admitido; na falta dele, o geral.
      const checklist = await buscarChecklistAtivo(
        cliente,
        colaborador.tipo_vinculo
      );
      if (!checklist) {
        throw new ErroHttp(
          409,
          "Não há checklist de admissão ativo (nem para este vínculo, nem geral). Ative um modelo antes de abrir processos."
        );
      }
      const id = await criarProcesso(cliente, {
        colaborador_id: colaborador.id,
        checklist_versao_id: checklist.id,
        data_inicio_prevista: dados.data_inicio_prevista,
        contrato_experiencia: dados.contrato_experiencia,
        ...prazos,
      });
      await inserirItens(cliente, id, checklist.itens);
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_PROCESSO,
        registroId: String(id),
        diff: {
          Colaborador: {
            de: null,
            para: `${colaborador.nome_completo} (matrícula ${colaborador.matricula})`,
          },
          "Data de admissão": {
            de: null,
            para: formatarData(colaborador.data_admissao),
          },
          "Início previsto": {
            de: null,
            para: formatarData(dados.data_inicio_prevista),
          },
          "Contrato de experiência": {
            de: null,
            para: dados.contrato_experiencia ? "Sim (45 + 45 dias)" : "Não",
          },
          ...(prazos.prazo_experiencia_1 && prazos.prazo_experiencia_2
            ? {
                "Fim do 1º período (dia 45)": {
                  de: null,
                  para: formatarData(prazos.prazo_experiencia_1),
                },
                "Fim da prorrogação (dia 90)": {
                  de: null,
                  para: formatarData(prazos.prazo_experiencia_2),
                },
              }
            : {}),
          Checklist: {
            de: null,
            para: `Versão ${checklist.versao} (${checklist.itens.length} itens)`,
          },
        },
      });
      return id;
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "processo_admissao_colaborador_id_key") {
      throw new ErroHttpCampo(
        409,
        "Este colaborador já tem processo de admissão.",
        "colaborador_id"
      );
    }
    throw erro;
  }

  const resumo = await buscarResumo(processoId);
  if (!resumo) {
    throw new ErroHttp(500, "Falha ao carregar o processo criado.");
  }
  return resumo;
}

export async function obterProcesso(
  sessao: PayloadSessao,
  id: number
): Promise<DetalheProcesso> {
  const processo = await buscarResumo(id);
  if (!processo) {
    throw new ErroHttp(404, "Processo de admissão não encontrado.");
  }
  const gerir = await podeGerir(sessao.usuario_id);
  if (!gerir) {
    const souGestor = await ehGestorDoColaborador(
      sessao.usuario_id,
      processo.colaborador_id
    );
    if (!souGestor) {
      // Ausência, não máscara: quem não participa não sabe que o processo existe.
      throw new ErroHttp(404, "Processo de admissão não encontrado.");
    }
  }
  const itens = await listarItens(id);
  const emPreparacao = processo.estado === "em_preparacao";
  return {
    processo,
    itens,
    percentual: percentualConclusao(
      processo.total_itens,
      processo.itens_resolvidos
    ),
    acoes: {
      tratar_itens: gerir && emPreparacao,
      concluir: gerir && emPreparacao && processo.obrigatorios_pendentes === 0,
      cancelar: gerir && emPreparacao,
    },
  };
}

async function exigirProcessoEmPreparacao(
  cliente: PoolClient,
  id: number
): Promise<ProcessoParaMutacao> {
  const processo = await buscarProcessoParaMutacao(cliente, id);
  if (!processo) {
    throw new ErroHttp(404, "Processo de admissão não encontrado.");
  }
  if (processo.estado !== "em_preparacao") {
    throw new ErroHttp(
      409,
      `Processo ${ROTULOS_ESTADO_PROCESSO[processo.estado].toLowerCase()} não aceita alterações.`
    );
  }
  return processo;
}

export async function atualizarItem(
  sessao: PayloadSessao,
  processoId: number,
  itemId: number,
  status: StatusItem
): Promise<DetalheProcesso> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoEmPreparacao(cliente, processoId);
    const item = await buscarItemParaMutacao(cliente, processoId, itemId);
    if (!item) {
      throw new ErroHttp(404, "Item do checklist não encontrado.");
    }
    if (item.status === status) {
      throw new ErroHttp(409, "O item já está neste estado.");
    }
    await atualizarStatusItem(cliente, itemId, status, sessao.usuario_id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_ITEM,
      registroId: String(itemId),
      diff: {
        Processo: {
          de: null,
          para: `Admissão de ${processo.colaborador_nome} (matrícula ${processo.matricula})`,
        },
        Item: { de: null, para: item.descricao },
        Status: {
          de: ROTULOS_STATUS_ITEM[item.status],
          para: ROTULOS_STATUS_ITEM[status],
        },
      },
    });
  });
  return obterProcesso(sessao, processoId);
}

/**
 * Acrescenta um item ao checklist de um processo já aberto.
 *
 * Só enquanto o processo está EM PREPARAÇÃO (`exigirProcessoEmPreparacao`):
 * acrescentar item a processo concluído reabriria coisa fechada. Engano se
 * corrige marcando "não aplicável", nunca apagando — é o que preserva o rastro,
 * como no resto do projeto.
 */
export async function acrescentarItem(
  sessao: PayloadSessao,
  processoId: number,
  dados: ItemAvulso
): Promise<DetalheProcesso> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoEmPreparacao(cliente, processoId);
    const criado = await inserirItemAvulso(
      cliente,
      processoId,
      dados.descricao,
      dados.obrigatorio
    );
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_ITEM,
      registroId: String(criado.id),
      diff: {
        Processo: {
          de: null,
          para: `Admissão de ${processo.colaborador_nome} (matrícula ${processo.matricula})`,
        },
        Item: { de: null, para: dados.descricao },
        Obrigatório: { de: null, para: dados.obrigatorio ? "sim" : "não" },
      },
    });
  });
  return obterProcesso(sessao, processoId);
}

async function mudarEstado(
  cliente: PoolClient,
  sessao: PayloadSessao,
  processo: ProcessoParaMutacao,
  paraEstado: EstadoProcesso,
  diffExtra: Record<string, { de: string | null; para: string | null }> = {}
): Promise<void> {
  await atualizarEstadoProcesso(cliente, processo.id, paraEstado);
  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "transicao",
    tabela: TABELA_PROCESSO,
    registroId: String(processo.id),
    diff: {
      Colaborador: {
        de: null,
        para: `${processo.colaborador_nome} (matrícula ${processo.matricula})`,
      },
      Estado: {
        de: ROTULOS_ESTADO_PROCESSO[processo.estado],
        para: ROTULOS_ESTADO_PROCESSO[paraEstado],
      },
      ...diffExtra,
    },
  });
}

/**
 * Conclusão validada no serviço: só com todos os itens obrigatórios
 * resolvidos (concluído ou não aplicável). Grava o fato na linha do tempo
 * do colaborador.
 */
export async function concluirProcesso(
  sessao: PayloadSessao,
  id: number
): Promise<DetalheProcesso> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoEmPreparacao(cliente, id);
    const pendentes = await contarObrigatoriosPendentes(cliente, id);
    if (pendentes > 0) {
      throw new ErroHttp(
        409,
        `Ainda há ${pendentes} item(ns) obrigatório(s) pendente(s) no checklist.`
      );
    }
    await mudarEstado(cliente, sessao, processo, "concluido");
    await inserirEvento(cliente, {
      colaborador_id: processo.colaborador_id,
      tipo: "admissao_concluida",
      ocorrido_em: new Date().toISOString(),
      origem_tabela: TABELA_PROCESSO,
      origem_id: processo.id,
      resumo: `Processo de admissão concluído pelo DP (checklist v${processo.checklist_versao}; início previsto ${formatarData(processo.data_inicio_prevista)})`,
      payload: {
        checklist_versao: processo.checklist_versao,
        data_inicio_prevista: processo.data_inicio_prevista,
      },
      registrado_por: sessao.usuario_id,
    });
  });
  return obterProcesso(sessao, id);
}

export async function cancelarProcesso(
  sessao: PayloadSessao,
  id: number,
  motivo: string
): Promise<DetalheProcesso> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const processo = await exigirProcessoEmPreparacao(cliente, id);
    await mudarEstado(cliente, sessao, processo, "cancelado", {
      "Motivo do cancelamento": { de: null, para: motivo },
    });
  });
  return obterProcesso(sessao, id);
}

/** Indicador: % de processos concluídos até a data de início prevista (12m). */
export async function valorIndicadorAdmissoesNoPrazo(): Promise<number | null> {
  return indicadorNoPrazo();
}
