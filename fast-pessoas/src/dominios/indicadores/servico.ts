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
  criarIndicador,
  criarMeta,
  encerrarMeta,
  Indicador,
  listarIndicadoresAtivos,
  listarMetasVigentes,
  listarUnidadesAtivas,
  listarVersoes,
  MetaVigente,
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
  unidades: string[];
  pode_administrar: boolean;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function rotuloEscopo(escopo: string): string {
  return escopo === ESCOPO_GLOBAL ? "Global (todas as unidades)" : escopo;
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
        meta_global:
          doIndicador.find((meta) => meta.escopo === ESCOPO_GLOBAL) ?? null,
        metas_unidade: doIndicador.filter(
          (meta) => meta.escopo !== ESCOPO_GLOBAL
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
 * Nova versão de meta: encerra a versão ativa do mesmo indicador+escopo e cria
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
  if (dados.escopo !== ESCOPO_GLOBAL) {
    const unidades = await listarUnidadesAtivas();
    if (!unidades.includes(dados.escopo)) {
      throw new ErroHttpCampo(
        400,
        "Escopo deve ser global ou uma unidade ativa.",
        "escopo"
      );
    }
  }

  try {
    return await comTransacao(sessao.usuario_id, async (cliente) => {
      const anterior = await buscarMetaAtivaParaEncerrar(
        cliente,
        indicadorId,
        dados.escopo
      );
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
              para: `Substituída por nova versão de meta de "${indicador.nome}" (${rotuloEscopo(dados.escopo)})`,
            },
          },
        });
      }

      const criada = await criarMeta(cliente, {
        indicador_id: indicadorId,
        escopo: dados.escopo,
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
          Escopo: { de: null, para: rotuloEscopo(criada.escopo) },
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
