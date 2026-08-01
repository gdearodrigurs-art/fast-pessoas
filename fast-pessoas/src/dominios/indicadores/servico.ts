import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import {
  CriacaoIndicador,
  CriacaoMeta,
  ESCOPO_GLOBAL,
  formatarValorMeta,
  ROTULOS_DIRECAO,
} from "./esquemas";
import {
  buscarIndicadorAtivo,
  buscarMetaAtivaParaEncerrar,
  buscarUnidadeDaMeta,
  criarIndicador,
  criarMeta,
  encerrarMeta,
  Indicador,
  listarIndicadoresAtivos,
  listarMetasVigentes,
  listarUnidadesAtivas,
  listarVersoes,
  MetaVigente,
  UnidadeEscopo,
  VersaoMeta,
} from "./repositorio";

const TABELA_INDICADOR = "rh.indicador";
const TABELA_META = "rh.meta_indicador_versao";
const DESCRICAO_PADRAO = "Indicador criado pelo RH.";

export interface IndicadorComMetas extends Indicador {
  meta_global: MetaVigente | null;
  metas_unidade: MetaVigente[];
}

export interface CentralDeMetas {
  indicadores: IndicadorComMetas[];
  unidades: UnidadeEscopo[];
  pode_administrar: boolean;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Rótulo do escopo para tela e auditoria: nome de hoje, não o congelado. */
function rotuloEscopo(unidade: string | null): string {
  return unidade ?? "Global (todas as unidades)";
}

/** Chave técnica derivada do nome: minúsculas, sem acento, `[a-z0-9_]`. */
export function gerarChave(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/g, "");
  return /^[a-z]/.test(base) ? base : `ind_${base}`;
}

export async function obterCentralDeMetas(
  sessao: PayloadSessao
): Promise<CentralDeMetas> {
  const [indicadores, metas, unidades, linhasPermissao] = await Promise.all([
    listarIndicadoresAtivos(),
    listarMetasVigentes(),
    listarUnidadesAtivas(),
    consultar<{ autorizado: boolean }>(
      "SELECT sistema.tem_permissao($1, $2) AS autorizado",
      [sessao.usuario_id, "indicador.administrar"]
    ),
  ]);

  const porIndicador = new Map<number, MetaVigente[]>();
  for (const meta of metas) {
    const lista = porIndicador.get(meta.indicador_id) ?? [];
    lista.push(meta);
    porIndicador.set(meta.indicador_id, lista);
  }

  return {
    indicadores: indicadores.map((indicador) => {
      const doIndicador = porIndicador.get(indicador.id) ?? [];
      return {
        ...indicador,
        // Global x unidade se decide pela CHAVE (estabelecimento_id nulo ou
        // não), nunca comparando o rótulo com a string 'global'.
        meta_global:
          doIndicador.find((meta) => meta.estabelecimento_id === null) ?? null,
        metas_unidade: doIndicador.filter(
          (meta) => meta.estabelecimento_id !== null
        ),
      };
    }),
    unidades,
    pode_administrar: Boolean(linhasPermissao[0]?.autorizado),
  };
}

export async function criarNovoIndicador(
  sessao: PayloadSessao,
  dados: CriacaoIndicador
): Promise<Indicador> {
  const chave = gerarChave(dados.nome);
  const descricao = dados.descricao || DESCRICAO_PADRAO;
  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const criado = await criarIndicador(cliente, {
        chave,
        nome: dados.nome,
        area: dados.area,
        descricao,
        unidade: dados.unidade,
        direcao: dados.direcao,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_INDICADOR,
        registroId: String(criado.id),
        diff: {
          Chave: { de: null, para: criado.chave },
          Nome: { de: null, para: criado.nome },
          "Área": { de: null, para: criado.area },
          "Descrição": { de: null, para: criado.descricao },
          "Unidade de medida": { de: null, para: criado.unidade },
          "Direção": { de: null, para: ROTULOS_DIRECAO[criado.direcao] },
        },
      });
      return criado;
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "indicador_chave_key") {
      throw new ErroHttpCampo(
        409,
        "Já existe um indicador com nome equivalente. Ajuste o nome.",
        "nome"
      );
    }
    throw erro;
  }
}

/**
 * Resolve o escopo pedido em (chave, rótulo de hoje) e diz se a unidade ainda
 * está ativa. Validar o ID contra rh.estabelecimento — e não o NOME contra uma
 * lista de nomes ativos — é o que faz a meta sobreviver a uma renomeação.
 */
async function resolverEscopo(estabelecimentoId: number | null): Promise<{
  estabelecimento_id: number | null;
  escopo: string;
  unidade: string | null;
  ativa: boolean;
}> {
  if (estabelecimentoId === null) {
    return {
      estabelecimento_id: null,
      escopo: ESCOPO_GLOBAL,
      unidade: null,
      ativa: true,
    };
  }
  const unidade = await buscarUnidadeDaMeta(estabelecimentoId);
  if (!unidade) {
    throw new ErroHttpCampo(
      400,
      "Unidade não encontrada.",
      "estabelecimento_id"
    );
  }
  if (unidade.unidade === null) {
    throw new ErroHttpCampo(
      400,
      "Unidade sem versão cadastrada — cadastre a unidade em Estrutura antes de definir a meta.",
      "estabelecimento_id"
    );
  }
  return {
    estabelecimento_id: unidade.estabelecimento_id,
    escopo: unidade.unidade,
    unidade: unidade.unidade,
    ativa: unidade.ativa,
  };
}

/**
 * Nova versão de meta: encerra a versão ativa do mesmo indicador+unidade e cria
 * a nova NA MESMA transação — valor nunca sofre UPDATE (garantido também por
 * trigger no banco).
 */
export async function definirMeta(
  sessao: PayloadSessao,
  indicadorId: number,
  dados: CriacaoMeta
): Promise<MetaVigente> {
  const indicador = await buscarIndicadorAtivo(indicadorId);
  if (!indicador) {
    throw new ErroHttp(404, "Indicador não encontrado.");
  }
  const escopo = await resolverEscopo(dados.estabelecimento_id);

  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const anterior = await buscarMetaAtivaParaEncerrar(
        cliente,
        indicadorId,
        escopo.estabelecimento_id
      );
      // Unidade inativada não ganha meta NOVA, mas a que ela já tem continua
      // substituível/encerrável — senão a meta ficaria imortal na tela.
      if (!escopo.ativa && !anterior) {
        throw new ErroHttpCampo(
          400,
          "Unidade inativada: defina a meta em uma unidade ativa.",
          "estabelecimento_id"
        );
      }
      if (anterior) {
        await encerrarMeta(cliente, anterior.id);
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "atualizacao",
          tabela: TABELA_META,
          registroId: String(anterior.id),
          diff: {
            Situação: { de: "Ativa", para: "Encerrada" },
            Motivo: {
              de: null,
              para: `Substituída por nova versão de meta de "${indicador.nome}" (${rotuloEscopo(escopo.unidade)})`,
            },
          },
        });
      }

      const criada = await criarMeta(cliente, {
        indicador_id: indicadorId,
        estabelecimento_id: escopo.estabelecimento_id,
        escopo: escopo.escopo,
        valor: dados.valor,
        inicio_vigencia: dados.inicio_vigencia,
        criado_por_usuario: sessao.usuario_id,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_META,
        registroId: String(criada.id),
        diff: {
          Indicador: { de: null, para: indicador.nome },
          Escopo: { de: null, para: rotuloEscopo(escopo.unidade) },
          Meta: {
            de: anterior
              ? formatarValorMeta(anterior.valor, indicador.unidade)
              : null,
            para: formatarValorMeta(criada.valor, indicador.unidade),
          },
          "Início de vigência": {
            de: anterior ? formatarData(anterior.inicio_vigencia) : null,
            para: formatarData(criada.inicio_vigencia),
          },
        },
      });
      return criada;
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "meta_indicador_ativa_unica") {
      throw new ErroHttp(
        409,
        "Outra versão desta meta foi salva ao mesmo tempo. Recarregue a página e tente novamente."
      );
    }
    throw erro;
  }
}

/**
 * Encerra a meta vigente de um escopo SEM criar substituta — o caminho que
 * faltava: sem ele, uma meta de unidade só saía da tela sendo trocada, e
 * unidade inativada (ou meta que não faz mais sentido) ficava para sempre.
 * Encerrar é versionamento, não apagar: a linha continua no histórico.
 */
export async function encerrarMetaVigente(
  sessao: PayloadSessao,
  indicadorId: number,
  estabelecimentoId: number | null
): Promise<void> {
  const indicador = await buscarIndicadorAtivo(indicadorId);
  if (!indicador) {
    throw new ErroHttp(404, "Indicador não encontrado.");
  }
  // Rótulo de hoje para a auditoria, mesmo que a unidade tenha sido renomeada
  // ou inativada depois que a meta foi pactuada.
  const unidade =
    estabelecimentoId === null
      ? null
      : await buscarUnidadeDaMeta(estabelecimentoId);
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const vigente = await buscarMetaAtivaParaEncerrar(
      cliente,
      indicadorId,
      estabelecimentoId
    );
    if (!vigente) {
      throw new ErroHttp(404, "Não há meta vigente neste escopo.");
    }
    await encerrarMeta(cliente, vigente.id);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_META,
      registroId: String(vigente.id),
      diff: {
        Situação: { de: "Ativa", para: "Encerrada" },
        Motivo: {
          de: null,
          para: `Meta de "${indicador.nome}" (${rotuloEscopo(
            unidade?.unidade ?? (estabelecimentoId === null ? null : vigente.escopo)
          )}) encerrada sem substituta`,
        },
      },
    });
  });
}

export async function historicoDeMetas(
  indicadorId: number
): Promise<{ indicador: Indicador; versoes: VersaoMeta[] }> {
  const indicador = await buscarIndicadorAtivo(indicadorId);
  if (!indicador) {
    throw new ErroHttp(404, "Indicador não encontrado.");
  }
  const versoes = await listarVersoes(indicadorId);
  return { indicador, versoes };
}
