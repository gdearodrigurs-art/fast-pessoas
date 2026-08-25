import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { inserirEvento } from "../colaboradores/repositorio";
import { listarCategoriasDevolucao } from "../desligamento/repositorio";
import { CategoriaDevolucao } from "../desligamento/esquemas";
import { buscarMetadados, inserirCiencia } from "../documentos/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import { RegistroPosse } from "./esquemas";
import {
  buscarColaboradorBasico,
  buscarPosseParaMutacao,
  cienciaExistente,
  inserirPosse,
  listarPosse,
  listarPosseDeVinculos,
  marcarCiencia,
  PosseLinha,
  registrarDevolucao,
  vinculosDoUsuario,
} from "./repositorio";

// ===========================================================================
// Serviço do domínio POSSE (migration 0081), molde da entrega de EPI
// (sst/servico.ts): registrar a entrega (termo no GED opcional, mas conferido
// contra o titular quando vem), devolver (momento do servidor) e dar ciência —
// o ACEITE ELETRÔNICO: reusa rh.ciencia com o hash do termo no momento e
// projeta ciencia_registrada na linha de posse. A ROTA já exigiu a chave
// (rh.posse.ver / rh.posse.registrar — dp+rh); aqui ficam as regras.
// ===========================================================================

const TABELA_POSSE = "rh.posse_item";
const TABELA_CIENCIA = "rh.ciencia";

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Data/hora legível no fuso America/Sao_Paulo (exibição; banco fica em UTC). */
function formatarDataHora(instanteIso: string): string {
  return new Date(instanteIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Data de hoje (AAAA-MM-DD) no fuso America/Sao_Paulo. */
function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

// ------------------------------------------------------------------ leitura

export interface VisaoPosse {
  itens: PosseLinha[];
  /**
   * As categorias que o seletor de registro pode oferecer — só as ATIVAS, do
   * catálogo JÁ administrável rh.categoria_devolucao (0054). Não há segundo
   * catálogo nem tela nova: administra-se em /desligamentos/categorias.
   */
  categorias: CategoriaDevolucao[];
}

export async function listarPosseColaborador(
  colaboradorId: number
): Promise<VisaoPosse> {
  const [itens, categorias] = await Promise.all([
    listarPosse(colaboradorId),
    listarCategoriasDevolucao(true),
  ]);
  return { itens, categorias };
}

/**
 * Posse do PRÓPRIO titular (o cartão "Minha posse" do portal) — sem chave de
 * posse: funcionário vê os seus itens e dá ciência (molde minhasEntregasEpi).
 * Pela PESSOA, não pelo contrato corrente: todos os vínculos do titular no
 * grupo (paridade com o GED, pendência 16.5). Sem categorias: o titular não
 * registra entrega, só vê e dá ciência.
 */
export async function minhaPosse(sessao: PayloadSessao): Promise<PosseLinha[]> {
  const vinculos = await vinculosDoUsuario(sessao.usuario_id);
  if (vinculos.length === 0) return [];
  return listarPosseDeVinculos(vinculos);
}

// ------------------------------------------------------------------ registro da entrega

export async function registrarPosse(
  sessao: PayloadSessao,
  colaboradorId: number,
  dados: RegistroPosse
): Promise<{ id: number }> {
  const colaborador = await buscarColaboradorBasico(colaboradorId);
  if (!colaborador) {
    throw new ErroHttpCampo(400, "Colaborador não encontrado.", "colaborador_id");
  }
  // A categoria vem do catálogo, e o servidor reconfere: chave que não existe
  // ou que foi inativada é recusada aqui, antes da FK e do trigger da 0081.
  const categorias = await listarCategoriasDevolucao(true);
  const categoria = categorias.find(
    (item) => item.chave === dados.categoria_chave
  );
  if (!categoria) {
    throw new ErroHttpCampo(
      400,
      "Categoria inválida ou inativa — escolha uma categoria ativa.",
      "categoria_chave"
    );
  }
  let termoTitulo: string | null = null;
  if (dados.termo_documento_id) {
    const termo = await buscarMetadados(dados.termo_documento_id);
    if (!termo) {
      throw new ErroHttpCampo(
        400,
        "Termo não encontrado no GED.",
        "termo_documento_id"
      );
    }
    // O termo precisa ser visível ao titular para a ciência: do colaborador ou
    // geral (molde sst).
    if (termo.colaborador_id !== null && termo.colaborador_id !== colaboradorId) {
      throw new ErroHttpCampo(
        400,
        "O termo no GED pertence a outro colaborador.",
        "termo_documento_id"
      );
    }
    termoTitulo = termo.titulo;
  }
  const termoId = dados.termo_documento_id ?? null;
  const numeroSerie = dados.numero_serie?.trim() ? dados.numero_serie : null;

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const posseId = await inserirPosse(cliente, {
      colaborador_id: colaboradorId,
      categoria_chave: dados.categoria_chave,
      descricao: dados.descricao,
      quantidade: dados.quantidade,
      numero_serie: numeroSerie,
      data_entrega: dados.data_entrega,
      termo_documento_id: termoId,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_POSSE,
      registroId: String(posseId),
      diff: {
        Colaborador: {
          de: null,
          para: `${colaborador.nome_completo} (${colaborador.matricula})`,
        },
        Categoria: { de: null, para: categoria.nome },
        Item: { de: null, para: dados.descricao },
        Quantidade: { de: null, para: String(dados.quantidade) },
        "Nº de série": { de: null, para: numeroSerie ?? "sem número" },
        "Data da entrega": { de: null, para: formatarData(dados.data_entrega) },
        Termo: { de: null, para: termoTitulo ?? "sem termo no GED" },
      },
    });
    await inserirEvento(cliente, {
      colaborador_id: colaboradorId,
      tipo: "posse_entregue",
      ocorrido_em: `${dados.data_entrega}T00:00:00Z`,
      origem_tabela: TABELA_POSSE,
      origem_id: posseId,
      resumo: `Patrimônio entregue: ${dados.descricao} (qtd ${dados.quantidade}) em ${formatarData(dados.data_entrega)}`,
      payload: {
        categoria_chave: dados.categoria_chave,
        quantidade: dados.quantidade,
        data_entrega: dados.data_entrega,
      },
      registrado_por: sessao.usuario_id,
    });
    return posseId;
  });

  return { id };
}

// ------------------------------------------------------------------ devolução

export async function registrarDevolucaoPosse(
  sessao: PayloadSessao,
  posseId: number
): Promise<{ devolvido_em: string }> {
  const item = await buscarPosseParaMutacao(posseId);
  if (!item) {
    throw new ErroHttp(404, "Item de posse não encontrado.");
  }
  if (item.devolvido_em !== null) {
    throw new ErroHttp(409, "Devolução já registrada para este item.");
  }
  if (item.data_entrega > hojeSaoPaulo()) {
    throw new ErroHttp(
      400,
      "A devolução não pode ser anterior à data da entrega."
    );
  }
  const devolvidoEm = await comTransacao(sessao.usuario_id, async (cliente) => {
    const momento = await registrarDevolucao(cliente, posseId);
    if (momento === null) {
      // Corrida: outra requisição registrou a devolução entre o pré-check
      // (fora da transação) e aqui. 409 em vez do 500 do trigger.
      throw new ErroHttp(409, "Devolução já registrada para este item.");
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "devolucao_posse",
      tabela: TABELA_POSSE,
      registroId: String(posseId),
      diff: {
        Item: { de: null, para: item.descricao },
        "Devolução": { de: "em uso", para: formatarDataHora(momento) },
      },
    });
    return momento;
  });
  return { devolvido_em: devolvidoEm };
}

// ------------------------------------------------------------------ ciência (aceite eletrônico)

/**
 * Ciência do TITULAR sobre a entrega: reusa a ciência do GED sobre o termo
 * (rh.ciencia, hash no momento) e projeta ciencia_registrada na linha de
 * posse. Só o próprio colaborador dá ciência; item sem termo não tem ciência.
 * Molde darCienciaEntregaEpi (sst): quem não é o titular recebe 404 — a rota
 * de ciência é alcançável por qualquer conta com documento.ver, e para quem
 * não tem rh.posse.ver nem a EXISTÊNCIA do item é visível (ausência, não
 * máscara).
 */
export async function darCienciaPosse(
  sessao: PayloadSessao,
  posseId: number
): Promise<{ dada_em: string }> {
  const item = await buscarPosseParaMutacao(posseId);
  if (!item) {
    throw new ErroHttp(404, "Item de posse não encontrado.");
  }
  // Pela PESSOA, não pelo contrato corrente: item entregue no vínculo anterior
  // do mesmo grupo continua sendo do titular (molde GED, pendência 16.5).
  const meusVinculos = await vinculosDoUsuario(sessao.usuario_id);
  if (!meusVinculos.includes(item.colaborador_id)) {
    // Ausência, não máscara: quem não é o titular nem sabe que existe.
    throw new ErroHttp(404, "Item de posse não encontrado.");
  }
  if (item.termo_documento_id === null) {
    throw new ErroHttp(
      400,
      "Item sem termo no GED — não há sobre o que dar ciência."
    );
  }
  if (item.ciencia_registrada) {
    throw new ErroHttp(409, "Ciência já registrada para este item.");
  }
  const termo = await buscarMetadados(item.termo_documento_id);
  if (!termo) {
    throw new ErroHttp(404, "Termo não encontrado no GED.");
  }
  // Ciência já dada no GED (ex.: pela tela de documentos)? Então só projeta.
  const jaDeuCiencia = await cienciaExistente(termo.id, sessao.usuario_id);

  try {
    const dadaEm = await comTransacao(sessao.usuario_id, async (cliente) => {
      let momento = new Date().toISOString();
      if (!jaDeuCiencia) {
        const ciencia = await inserirCiencia(cliente, {
          documentoId: termo.id,
          usuarioId: sessao.usuario_id,
          hashNoMomento: termo.hash_sha256,
        });
        momento = ciencia.dada_em;
        await registrarAlteracao(cliente, {
          usuarioId: sessao.usuario_id,
          papel: sessao.papel,
          acao: "criacao",
          tabela: TABELA_CIENCIA,
          registroId: String(ciencia.id),
          diff: {
            Documento: { de: null, para: `${termo.titulo} (#${termo.id})` },
            "Hash no momento": { de: null, para: termo.hash_sha256 },
          },
        });
      }
      const marcou = await marcarCiencia(cliente, posseId);
      if (!marcou) {
        // Corrida na projeção: outra requisição marcou entre o pré-check
        // (fora da transação) e aqui. 409, molde registrarDevolucaoPosse.
        throw new ErroHttp(409, "Ciência já registrada para este item.");
      }
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "ciencia_posse",
        tabela: TABELA_POSSE,
        registroId: String(posseId),
        diff: {
          "Ciência": {
            de: "pendente",
            para: jaDeuCiencia
              ? "registrada (ciência prévia no GED reaproveitada)"
              : "registrada",
          },
        },
      });
      return momento;
    });
    return { dada_em: dadaEm };
  } catch (erro) {
    // Corrida no INSERT de rh.ciencia (UNIQUE documento+usuário, 0006): as
    // duas requisições do duplo clique passam pelo mesmo pré-check e a
    // segunda estoura 23505 dentro da transação — sem esta tradução, 500 cru.
    if (violacaoUnica(erro) === "ciencia_documento_id_usuario_id_key") {
      throw new ErroHttp(409, "Ciência já registrada para este item.");
    }
    throw erro;
  }
}
