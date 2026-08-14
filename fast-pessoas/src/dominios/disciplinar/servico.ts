import { Diff, registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { inserirEvento } from "../colaboradores/repositorio";
import { notificar } from "../notificacoes/servico";
import {
  chaveDeNome,
  CriacaoTipoMedida,
  RegistroMedida,
  validarPeriodoDaMedida,
} from "./esquemas";
import {
  buscarColaboradorDaMedida,
  buscarTipoParaAtualizar,
  ContagemTipo,
  contarPorTipo,
  inativarTipo,
  inserirMedida,
  inserirTipo,
  listarMedidas,
  listarTipos,
  listarTiposAtivos,
  MedidaDisciplinar,
  registrarLeituraSensivel,
  TipoMedidaDisciplinar,
} from "./repositorio";

const TABELA_MEDIDA = "rh.medida_disciplinar";
const TABELA_TIPO = "rh.tipo_medida_disciplinar";
const CHAVE_VER = "rh.disciplinar.ver";
const RECURSO_VER = "colaborador.medida_disciplinar";

function truncar(texto: string, limite: number): string {
  return texto.length <= limite ? texto : `${texto.slice(0, limite - 1)}…`;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ------------------------------------------------------------------ leitura (restrita — eixo 4/8)

export interface VisaoDisciplinar {
  medidas: MedidaDisciplinar[];
  /** Histórico por tipo — o DP olha e decide o escalonamento (manual). */
  historico: ContagemTipo[];
  /** Tipos ativos para o seletor do formulário de registro. */
  tipos: TipoMedidaDisciplinar[];
}

/**
 * A leitura das medidas de UM colaborador. O ROTA já exigiu rh.disciplinar.ver;
 * aqui, ao devolver, gravamos a trilha (eixo 8) com a chave que autorizou —
 * abrir o registro disciplinar de alguém é leitura sensível mesmo quando ele
 * está vazio ("esta pessoa não tem medidas" também é informação restrita).
 */
export async function listarMedidasColaborador(
  sessao: PayloadSessao,
  colaboradorId: number
): Promise<VisaoDisciplinar> {
  const { medidas, historico } = await comTransacao(
    sessao.usuario_id,
    async (cliente) => {
      const medidas = await listarMedidas(cliente, colaboradorId);
      const historico = await contarPorTipo(cliente, colaboradorId);
      await registrarLeituraSensivel(cliente, {
        usuarioId: sessao.usuario_id,
        chavePermissao: CHAVE_VER,
        recurso: RECURSO_VER,
        registroId: String(colaboradorId),
      });
      return { medidas, historico };
    }
  );
  const tipos = await listarTiposAtivos();
  return { medidas, historico, tipos };
}

// ------------------------------------------------------------------ registro

/**
 * Registrar a medida. Valida o tipo pelo catálogo ATIVO (o serviço é quem
 * conhece o catálogo — por isso a regra de período mora aqui, não no zod):
 * tipo com_periodo exige inicio/fim; tipo pontual recusa os dois. Grava a
 * medida, ecoa NEUTRO na linha do tempo (nunca o motivo — a timeline soma por
 * vínculos e o resumo vazaria), registra a alteração e avisa o colaborador de
 * forma neutra.
 */
export async function registrarMedida(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: RegistroMedida
): Promise<MedidaDisciplinar> {
  const tipos = await listarTiposAtivos();
  const tipo = tipos.find((item) => item.chave === dados.tipo_chave);
  if (!tipo) {
    throw new ErroHttpCampo(
      400,
      "Tipo de medida inválido ou inativo — escolha um tipo ativo.",
      "tipo_chave"
    );
  }
  const problema = validarPeriodoDaMedida(tipo.com_periodo, {
    inicio: dados.inicio,
    fim: dados.fim,
  });
  if (problema) {
    throw new ErroHttpCampo(400, problema.mensagem, problema.campo);
  }

  const inicio = tipo.com_periodo ? (dados.inicio ?? null) : null;
  const fim = tipo.com_periodo ? (dados.fim ?? null) : null;

  const criada = await comTransacao(sessao.usuario_id, async (cliente) => {
    const colaborador = await buscarColaboradorDaMedida(cliente, colaboradorId);
    if (!colaborador) {
      throw new ErroHttp(404, "Colaborador não encontrado.");
    }
    const medidaId = await inserirMedida(cliente, {
      colaborador_id: colaboradorId,
      tipo_chave: dados.tipo_chave,
      descricao: dados.descricao,
      impacto: dados.impacto ?? null,
      acao_combinada: dados.acao_combinada ?? null,
      aplicada_em: dados.aplicada_em,
      inicio,
      fim,
      registrado_por: sessao.usuario_id,
    });

    // ECO NEUTRO: resumo sem o motivo, e payload `restrita: true` para o mesmo
    // filtro da ocorrência restrita esconder a linha de quem não tem a chave —
    // o gestor não vê nem a existência; o dp/diretoria veem só o rótulo, e o
    // detalhe fica no cartão disciplinar (leitura logada).
    await inserirEvento(cliente, {
      colaborador_id: colaboradorId,
      tipo: "disciplinar",
      ocorrido_em: `${dados.aplicada_em}T00:00:00Z`,
      origem_tabela: TABELA_MEDIDA,
      origem_id: medidaId,
      resumo: "Medida disciplinar registrada (detalhe no cartão Disciplinar)",
      payload: { restrita: true, tipo_chave: dados.tipo_chave },
      registrado_por: sessao.usuario_id,
    });

    // A trilha de ALTERAÇÃO é restrita (não é a timeline) — pode carregar o
    // detalhe do que foi gravado.
    const diff: Diff = {
      Tipo: { de: null, para: tipo.nome },
      "Data do fato": { de: null, para: formatarData(dados.aplicada_em) },
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
    if (inicio && fim) {
      diff["Período"] = {
        de: null,
        para: `${formatarData(inicio)} a ${formatarData(fim)}`,
      };
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_MEDIDA,
      registroId: String(medidaId),
      diff,
    });

    // Aviso NEUTRO ao próprio colaborador (nunca o motivo). Sem link: a tela do
    // disciplinar é restrita e ele não a alcança — o dado fica com o RH.
    if (
      colaborador.usuario_id !== null &&
      colaborador.usuario_id !== sessao.usuario_id
    ) {
      await notificar(cliente, {
        usuarioId: colaborador.usuario_id,
        tipo: "disciplinar.medida_registrada",
        titulo: "Registro no seu histórico funcional",
        corpo:
          "O RH registrou um novo item no seu histórico funcional. Fale com o RH para mais informações.",
      });
    }

    const medidas = await listarMedidas(cliente, colaboradorId);
    const registrada = medidas.find((item) => item.id === medidaId);
    if (!registrada) {
      throw new ErroHttp(500, "Falha ao reler a medida registrada.");
    }
    return registrada;
  });

  return criada;
}

// ------------------------------------------------------------------ catálogo de tipos (administrar — molde 0054)

export interface CatalogoTipos {
  tipos: TipoMedidaDisciplinar[];
}

/** Quem administra vê inclusive os inativos (para reativar). */
export async function obterCatalogoTipos(): Promise<CatalogoTipos> {
  return { tipos: await listarTipos(false) };
}

export async function criarTipoMedida(
  sessao: PayloadSessao,
  dados: CriacaoTipoMedida
): Promise<TipoMedidaDisciplinar[]> {
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
      const id = await inserirTipo(cliente, {
        chave,
        nome: dados.nome,
        com_periodo: dados.com_periodo,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_TIPO,
        registroId: String(id),
        diff: {
          Nome: { de: null, para: dados.nome },
          Chave: { de: null, para: chave },
          "Abre período": { de: null, para: dados.com_periodo ? "Sim" : "Não" },
        },
      });
    });
  } catch (erro) {
    if (violacaoUnica(erro) === "tipo_medida_disciplinar_chave_key") {
      const existente = await listarTipos(false);
      const igual = existente.find((tipo) => tipo.chave === chave);
      throw new ErroHttpCampo(
        409,
        igual && !igual.ativo
          ? `Já existe o tipo "${igual.nome}", hoje inativo — reative em vez de criar outro.`
          : `Já existe um tipo com esse nome ("${igual?.nome ?? dados.nome}").`,
        "nome"
      );
    }
    throw erro;
  }
  return listarTipos(false);
}

/**
 * Inativar/reativar — o lugar da exclusão. Medida já gravada com o tipo continua
 * valendo e continua rotulada por ele; o que muda é que o tipo some do seletor
 * de medidas NOVAS.
 */
export async function definirTipoInativo(
  sessao: PayloadSessao,
  id: number,
  inativo: boolean
): Promise<TipoMedidaDisciplinar[]> {
  await comTransacao(sessao.usuario_id, async (cliente) => {
    const tipo = await buscarTipoParaAtualizar(cliente, id);
    if (!tipo) {
      throw new ErroHttp(404, "Tipo não encontrado.");
    }
    if (inativo === !tipo.ativo) return;
    await inativarTipo(cliente, id, inativo ? sessao.usuario_id : null);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "edicao",
      tabela: TABELA_TIPO,
      registroId: String(id),
      diff: {
        Tipo: { de: null, para: tipo.nome },
        "Situação": {
          de: inativo ? "ativo" : "inativo",
          para: inativo ? "inativo" : "ativo",
        },
      },
    });
  });
  return listarTipos(false);
}
