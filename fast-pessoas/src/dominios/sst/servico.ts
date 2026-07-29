import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { cifrar, decifrar } from "../../lib/cifra";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { inserirEvento } from "../colaboradores/repositorio";
import { inserirCiencia } from "../documentos/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  EntregaEpi,
  formatarData,
  formatarDataHora,
  ItemEpi,
  RegistroAso,
  RegistroCat,
  ResultadoAso,
  ROTULOS_RESULTADO_ASO,
  ROTULOS_STATUS_CAT,
  ROTULOS_TIPO_ASO,
  ROTULOS_TIPO_CAT,
  StatusCat,
  TipoAso,
  TipoCat,
} from "./esquemas";
import {
  buscarAfastamentoAcidente,
  buscarCat,
  buscarColaborador,
  buscarDocumento,
  buscarEntregaEpi,
  buscarItemEpi,
  cienciaExistente,
  colaboradorDoUsuario,
  contarAtivosComAsoValido,
  EntregaEpiLinha,
  inserirAso,
  inserirCat,
  inserirEntregaEpi,
  inserirItemEpi,
  ItemEpiLinha,
  listarAfastamentosAcidente,
  listarAsos,
  listarCats,
  listarEntregasDoColaborador,
  listarEntregasEpi,
  listarItensEpi,
  listarValidadePorColaborador,
  marcarCienciaEntregaEpi,
  marcarDevolucaoEpi,
  registrarLeituraSensivel,
  temPermissao,
} from "./repositorio";

const TABELA_ASO = "rh.aso";
const TABELA_EPI_ITEM = "rh.epi_item";
const TABELA_EPI_ENTREGA = "rh.epi_entrega";
const TABELA_CAT = "rh.cat";
const TABELA_CIENCIA = "rh.ciencia";
const CHAVE_GERIR = "sst.gerir";
const CHAVE_SAUDE_VER = "sst.saude.ver";
const RECURSO_RESTRICOES = "rh.aso.restricoes";

// ------------------------------------------------------------------ apoio de datas

/** Data de hoje (AAAA-MM-DD) no fuso America/Sao_Paulo. */
function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ ASO

/**
 * Item completo — SÓ para quem tem sst.saude.ver: resultado e restrições
 * decifradas. Cada restrição decifrada grava audit.leitura_sensivel.
 */
export interface AsoCompleto {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoAso;
  tipo_rotulo: string;
  data_exame: string;
  validade: string | null;
  resultado: ResultadoAso;
  resultado_rotulo: string;
  restricoes: string | null;
  documento_id: number | null;
  documento_titulo: string | null;
  registrado_por_nome: string;
  criado_em: string;
}

/**
 * Item básico — para quem vê SST sem a chave de saúde: tipo do exame e
 * datas. Resultado, restrições e o PDF (documento sensível) ficam AUSENTES
 * do payload (ausência, não máscara).
 */
export interface AsoBasico {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoAso;
  tipo_rotulo: string;
  data_exame: string;
  validade: string | null;
}

export type ListaAsos =
  | { com_saude: true; asos: AsoCompleto[] }
  | { com_saude: false; asos: AsoBasico[] };

export async function listarAsosParaSessao(
  sessao: PayloadSessao
): Promise<ListaAsos> {
  const verSaude = await temPermissao(sessao.usuario_id, CHAVE_SAUDE_VER);
  const linhas = await listarAsos();

  if (!verSaude) {
    return {
      com_saude: false,
      asos: linhas.map((linha) => ({
        id: linha.id,
        colaborador_id: linha.colaborador_id,
        colaborador_nome: linha.colaborador_nome,
        matricula: linha.matricula,
        tipo: linha.tipo,
        tipo_rotulo: ROTULOS_TIPO_ASO[linha.tipo],
        data_exame: linha.data_exame,
        validade: linha.validade,
      })),
    };
  }

  const asos: AsoCompleto[] = linhas.map((linha) => {
    let restricoes: string | null = null;
    if (linha.restricoes_cifradas !== null) {
      try {
        restricoes = decifrar(linha.restricoes_cifradas);
      } catch {
        // Nunca derruba o painel: sinaliza sem expor o conteúdo cifrado.
        restricoes = "[conteúdo ilegível — falha na decifração]";
      }
    }
    return {
      id: linha.id,
      colaborador_id: linha.colaborador_id,
      colaborador_nome: linha.colaborador_nome,
      matricula: linha.matricula,
      tipo: linha.tipo,
      tipo_rotulo: ROTULOS_TIPO_ASO[linha.tipo],
      data_exame: linha.data_exame,
      validade: linha.validade,
      resultado: linha.resultado,
      resultado_rotulo: ROTULOS_RESULTADO_ASO[linha.resultado],
      restricoes,
      documento_id: linha.documento_id,
      documento_titulo: linha.documento_titulo,
      registrado_por_nome: linha.registrado_por_nome,
      criado_em: linha.criado_em,
    };
  });

  // Trilha de leitura: um registro por ASO cuja restrição foi decifrada.
  const idsComRestricao = linhas
    .filter((linha) => linha.restricoes_cifradas !== null)
    .map((linha) => String(linha.id));
  if (idsComRestricao.length > 0) {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      for (const registroId of idsComRestricao) {
        await registrarLeituraSensivel(cliente, {
          usuarioId: sessao.usuario_id,
          chavePermissao: CHAVE_SAUDE_VER,
          recurso: RECURSO_RESTRICOES,
          registroId,
        });
      }
    });
  }

  return { com_saude: true, asos };
}

export async function registrarAso(
  sessao: PayloadSessao,
  dados: RegistroAso
): Promise<{ id: number }> {
  const colaborador = await buscarColaborador(dados.colaborador_id);
  if (!colaborador) {
    throw new ErroHttpCampo(400, "Colaborador não encontrado.", "colaborador_id");
  }
  let documentoTitulo: string | null = null;
  if (dados.documento_id) {
    const documento = await buscarDocumento(dados.documento_id);
    if (!documento) {
      throw new ErroHttpCampo(
        400,
        "Documento não encontrado no GED.",
        "documento_id"
      );
    }
    documentoTitulo = documento.titulo;
  }

  // Cifra ANTES da transação: o texto em claro não chega perto do banco.
  const cifrado = dados.restricoes ? cifrar(dados.restricoes) : null;
  const validade = dados.validade ?? null;
  const documentoId = dados.documento_id ?? null;

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const asoId = await inserirAso(cliente, {
      colaborador_id: dados.colaborador_id,
      tipo: dados.tipo,
      data_exame: dados.data_exame,
      validade,
      resultado: dados.resultado,
      restricoes_cifradas: cifrado,
      documento_id: documentoId,
      registrado_por: sessao.usuario_id,
    });
    // Auditoria SEM dado clínico em claro: resultado e restrições só como marca.
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_ASO,
      registroId: String(asoId),
      diff: {
        Colaborador: {
          de: null,
          para: `${colaborador.nome_completo} (${colaborador.matricula})`,
        },
        Tipo: { de: null, para: ROTULOS_TIPO_ASO[dados.tipo] },
        "Data do exame": { de: null, para: formatarData(dados.data_exame) },
        Validade: {
          de: null,
          para: validade ? formatarData(validade) : "sem validade definida",
        },
        Resultado: { de: null, para: "registrado (dado de saúde)" },
        "Restrições": {
          de: null,
          para: cifrado ? "registradas (cifradas)" : "não informadas",
        },
        Documento: { de: null, para: documentoTitulo ?? "sem documento" },
      },
    });
    // Linha do tempo: fato genérico, SEM resultado e SEM restrições.
    await inserirEvento(cliente, {
      colaborador_id: dados.colaborador_id,
      tipo: "aso_registrado",
      ocorrido_em: `${dados.data_exame}T00:00:00Z`,
      origem_tabela: TABELA_ASO,
      origem_id: asoId,
      resumo: `ASO registrado (${ROTULOS_TIPO_ASO[dados.tipo]}, exame em ${formatarData(dados.data_exame)})`,
      payload: {
        tipo: dados.tipo,
        data_exame: dados.data_exame,
        validade,
      },
      registrado_por: sessao.usuario_id,
    });
    return asoId;
  });

  return { id };
}

// ------------------------------------------------------------------ painel de vencimento

export interface ItemVencimento {
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  validade: string;
}

export interface PainelVencimentos {
  /** validade já passada */
  vencidos: ItemVencimento[];
  /** vence em até 30 dias */
  vence_30: ItemVencimento[];
  /** vence entre 31 e 60 dias */
  vence_60: ItemVencimento[];
  /** colaboradores monitorados sem nenhum ASO com validade registrada */
  sem_validade: number;
  /** colaboradores não desligados monitorados */
  total_monitorado: number;
  em_dia: number;
}

export async function apurarVencimentosAso(): Promise<PainelVencimentos> {
  const linhas = await listarValidadePorColaborador();
  const hoje = hojeSaoPaulo();
  const limite30 = somarDias(hoje, 30);
  const limite60 = somarDias(hoje, 60);

  const painel: PainelVencimentos = {
    vencidos: [],
    vence_30: [],
    vence_60: [],
    sem_validade: 0,
    total_monitorado: linhas.length,
    em_dia: 0,
  };
  for (const linha of linhas) {
    if (linha.validade === null) {
      painel.sem_validade += 1;
      continue;
    }
    const item: ItemVencimento = {
      colaborador_id: linha.colaborador_id,
      colaborador_nome: linha.colaborador_nome,
      matricula: linha.matricula,
      validade: linha.validade,
    };
    if (linha.validade < hoje) {
      painel.vencidos.push(item);
    } else if (linha.validade <= limite30) {
      painel.vence_30.push(item);
    } else if (linha.validade <= limite60) {
      painel.vence_60.push(item);
    } else {
      painel.em_dia += 1;
    }
  }
  return painel;
}

/**
 * Indicador para o registry (src/dominios/indicadores/valores.ts):
 * % de colaboradores ATIVOS com ASO dentro da validade. Agregado puro —
 * nenhum conteúdo clínico. null = nenhum colaborador ativo.
 */
export async function valorIndicadorAsosValidos(): Promise<number | null> {
  const { ativos, com_aso_valido } = await contarAtivosComAsoValido();
  if (ativos === 0) return null;
  return Math.round((com_aso_valido / ativos) * 1000) / 10;
}

// ------------------------------------------------------------------ EPI — catálogo

export async function listarCatalogoEpi(): Promise<ItemEpiLinha[]> {
  return listarItensEpi();
}

export async function criarItemEpi(
  sessao: PayloadSessao,
  dados: ItemEpi
): Promise<ItemEpiLinha> {
  const numeroCa = dados.numero_ca ?? null;
  const validadeCa = dados.validade_ca ?? null;
  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const itemId = await inserirItemEpi(cliente, {
      nome: dados.nome,
      numero_ca: numeroCa,
      validade_ca: validadeCa,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_EPI_ITEM,
      registroId: String(itemId),
      diff: {
        Nome: { de: null, para: dados.nome },
        CA: { de: null, para: numeroCa ?? "sem CA" },
        "Validade do CA": {
          de: null,
          para: validadeCa ? formatarData(validadeCa) : "não informada",
        },
      },
    });
    return itemId;
  });
  return {
    id,
    nome: dados.nome,
    numero_ca: numeroCa,
    validade_ca: validadeCa,
    ativo: true,
  };
}

// ------------------------------------------------------------------ EPI — entregas

export async function listarEntregas(): Promise<EntregaEpiLinha[]> {
  return listarEntregasEpi();
}

/** Entregas do próprio colaborador — titular vê as suas, sem chave de SST. */
export async function minhasEntregasEpi(
  sessao: PayloadSessao
): Promise<EntregaEpiLinha[]> {
  const colaboradorId = await colaboradorDoUsuario(sessao.usuario_id);
  if (colaboradorId === null) return [];
  return listarEntregasDoColaborador(colaboradorId);
}

export async function registrarEntregaEpi(
  sessao: PayloadSessao,
  dados: EntregaEpi
): Promise<{ id: number }> {
  const colaborador = await buscarColaborador(dados.colaborador_id);
  if (!colaborador) {
    throw new ErroHttpCampo(400, "Colaborador não encontrado.", "colaborador_id");
  }
  const item = await buscarItemEpi(dados.epi_item_id);
  if (!item) {
    throw new ErroHttpCampo(400, "EPI não encontrado no catálogo.", "epi_item_id");
  }
  if (!item.ativo) {
    throw new ErroHttpCampo(
      400,
      "EPI fora de circulação no catálogo.",
      "epi_item_id"
    );
  }
  let termoTitulo: string | null = null;
  if (dados.termo_documento_id) {
    const termo = await buscarDocumento(dados.termo_documento_id);
    if (!termo) {
      throw new ErroHttpCampo(
        400,
        "Termo não encontrado no GED.",
        "termo_documento_id"
      );
    }
    // O termo precisa ser visível ao titular para a ciência: do colaborador ou geral.
    if (
      termo.colaborador_id !== null &&
      termo.colaborador_id !== dados.colaborador_id
    ) {
      throw new ErroHttpCampo(
        400,
        "O termo no GED pertence a outro colaborador.",
        "termo_documento_id"
      );
    }
    termoTitulo = termo.titulo;
  }
  const termoId = dados.termo_documento_id ?? null;

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const entregaId = await inserirEntregaEpi(cliente, {
      colaborador_id: dados.colaborador_id,
      epi_item_id: dados.epi_item_id,
      quantidade: dados.quantidade,
      data_entrega: dados.data_entrega,
      termo_documento_id: termoId,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_EPI_ENTREGA,
      registroId: String(entregaId),
      diff: {
        Colaborador: {
          de: null,
          para: `${colaborador.nome_completo} (${colaborador.matricula})`,
        },
        EPI: {
          de: null,
          para: item.numero_ca
            ? `${item.nome} (CA ${item.numero_ca})`
            : item.nome,
        },
        Quantidade: { de: null, para: String(dados.quantidade) },
        "Data da entrega": {
          de: null,
          para: formatarData(dados.data_entrega),
        },
        Termo: { de: null, para: termoTitulo ?? "sem termo no GED" },
      },
    });
    await inserirEvento(cliente, {
      colaborador_id: dados.colaborador_id,
      tipo: "epi_entregue",
      ocorrido_em: `${dados.data_entrega}T00:00:00Z`,
      origem_tabela: TABELA_EPI_ENTREGA,
      origem_id: entregaId,
      resumo: `EPI entregue: ${item.nome} (qtd ${dados.quantidade}) em ${formatarData(dados.data_entrega)}`,
      payload: {
        epi_item_id: dados.epi_item_id,
        quantidade: dados.quantidade,
        data_entrega: dados.data_entrega,
      },
      registrado_por: sessao.usuario_id,
    });
    return entregaId;
  });

  return { id };
}

export async function registrarDevolucaoEpi(
  sessao: PayloadSessao,
  entregaId: number
): Promise<{ devolvido_em: string }> {
  const entrega = await buscarEntregaEpi(entregaId);
  if (!entrega) {
    throw new ErroHttp(404, "Entrega não encontrada.");
  }
  if (entrega.devolvido_em !== null) {
    throw new ErroHttp(409, "Devolução já registrada para esta entrega.");
  }
  if (entrega.data_entrega > hojeSaoPaulo()) {
    throw new ErroHttp(
      400,
      "A devolução não pode ser anterior à data da entrega."
    );
  }
  const devolvidoEm = await comTransacao(
    sessao.usuario_id,
    async (cliente) => {
      const momento = await marcarDevolucaoEpi(cliente, entregaId);
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "devolucao_epi",
        tabela: TABELA_EPI_ENTREGA,
        registroId: String(entregaId),
        diff: {
          "Devolução": {
            de: "em uso",
            para: formatarDataHora(momento),
          },
        },
      });
      return momento;
    }
  );
  return { devolvido_em: devolvidoEm };
}

/**
 * Ciência do TITULAR sobre a entrega: reusa a ciência do GED sobre o termo
 * (rh.ciencia, hash no momento) e projeta ciencia_registrada na entrega.
 * Só o próprio colaborador dá ciência; entrega sem termo não tem ciência.
 */
export async function darCienciaEntregaEpi(
  sessao: PayloadSessao,
  entregaId: number
): Promise<{ dada_em: string }> {
  const entrega = await buscarEntregaEpi(entregaId);
  if (!entrega) {
    throw new ErroHttp(404, "Entrega não encontrada.");
  }
  const meuColaboradorId = await colaboradorDoUsuario(sessao.usuario_id);
  if (meuColaboradorId !== entrega.colaborador_id) {
    // Ausência, não máscara: quem não é o titular nem sabe que existe.
    throw new ErroHttp(404, "Entrega não encontrada.");
  }
  if (entrega.termo_documento_id === null) {
    throw new ErroHttp(
      400,
      "Entrega sem termo no GED — não há sobre o que dar ciência."
    );
  }
  if (entrega.ciencia_registrada) {
    throw new ErroHttp(409, "Ciência já registrada para esta entrega.");
  }
  const termo = await buscarDocumento(entrega.termo_documento_id);
  if (!termo) {
    throw new ErroHttp(404, "Termo não encontrado no GED.");
  }
  // Ciência já dada no GED (ex.: pela tela de documentos)? Então só projeta.
  const jaDeuCiencia = await cienciaExistente(termo.id, sessao.usuario_id);

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
    await marcarCienciaEntregaEpi(cliente, entregaId);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "ciencia_epi",
      tabela: TABELA_EPI_ENTREGA,
      registroId: String(entregaId),
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
}

// ------------------------------------------------------------------ CAT

export interface CatVisao {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoCat;
  tipo_rotulo: string;
  data_acidente: string;
  descricao: string;
  houve_afastamento: boolean;
  afastamento_id: number | null;
  status: StatusCat;
  status_rotulo: string;
  cat_anterior_id: number | null;
  substituida_por_id: number | null;
  registrado_por_nome: string;
  registrada_em: string;
}

export async function listarCatsVisao(): Promise<CatVisao[]> {
  const linhas = await listarCats();
  return linhas.map((linha) => ({
    ...linha,
    tipo_rotulo: ROTULOS_TIPO_CAT[linha.tipo],
    status_rotulo: ROTULOS_STATUS_CAT[linha.status],
  }));
}

export async function registrarCat(
  sessao: PayloadSessao,
  dados: RegistroCat
): Promise<{ id: number }> {
  const colaborador = await buscarColaborador(dados.colaborador_id);
  if (!colaborador) {
    throw new ErroHttpCampo(400, "Colaborador não encontrado.", "colaborador_id");
  }
  const afastamentoId = dados.afastamento_id ?? null;
  if (afastamentoId !== null) {
    const afastamento = await buscarAfastamentoAcidente(afastamentoId);
    if (!afastamento) {
      throw new ErroHttpCampo(
        400,
        "Afastamento de acidente de trabalho não encontrado.",
        "afastamento_id"
      );
    }
    if (afastamento.colaborador_id !== dados.colaborador_id) {
      throw new ErroHttpCampo(
        400,
        "O afastamento pertence a outro colaborador.",
        "afastamento_id"
      );
    }
  }
  const anteriorId = dados.cat_anterior_id ?? null;
  if (anteriorId !== null) {
    const anterior = await buscarCat(anteriorId);
    if (!anterior) {
      throw new ErroHttpCampo(
        400,
        "CAT anterior não encontrada.",
        "cat_anterior_id"
      );
    }
    if (anterior.substituida_por_id !== null) {
      throw new ErroHttpCampo(
        409,
        `A CAT #${anteriorId} já foi corrigida pelo registro #${anterior.substituida_por_id} — corrija a ponta da cadeia.`,
        "cat_anterior_id"
      );
    }
  }
  const dataAcidenteIso = new Date(dados.data_acidente).toISOString();

  try {
    const { id } = await comTransacao(sessao.usuario_id, async (cliente) => {
      const cat = await inserirCat(cliente, {
        colaborador_id: dados.colaborador_id,
        tipo: dados.tipo,
        data_acidente: dataAcidenteIso,
        descricao: dados.descricao,
        houve_afastamento: dados.houve_afastamento,
        afastamento_id: afastamentoId,
        status: dados.status,
        cat_anterior_id: anteriorId,
        registrado_por: sessao.usuario_id,
      });
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: anteriorId === null ? "criacao" : "correcao_cat",
        tabela: TABELA_CAT,
        registroId: String(cat.id),
        diff: {
          Colaborador: {
            de: null,
            para: `${colaborador.nome_completo} (${colaborador.matricula})`,
          },
          Tipo: { de: null, para: ROTULOS_TIPO_CAT[dados.tipo] },
          "Data/hora do acidente": {
            de: null,
            para: formatarDataHora(dataAcidenteIso),
          },
          "Descrição": { de: null, para: dados.descricao.slice(0, 300) },
          "Houve afastamento": {
            de: null,
            para: dados.houve_afastamento ? "Sim" : "Não",
          },
          Afastamento: {
            de: null,
            para: afastamentoId === null ? "sem vínculo" : `#${afastamentoId}`,
          },
          Status: { de: null, para: ROTULOS_STATUS_CAT[dados.status] },
          "Corrige a CAT": {
            de: null,
            para: anteriorId === null ? "não (registro original)" : `#${anteriorId}`,
          },
        },
      });
      // Linha do tempo: só o registro ORIGINAL vira fato — correção é
      // retificação do mesmo fato, não fato novo (evita duplicar na ficha).
      if (anteriorId === null) {
        await inserirEvento(cliente, {
          colaborador_id: dados.colaborador_id,
          tipo: "cat_registrada",
          ocorrido_em: dataAcidenteIso,
          origem_tabela: TABELA_CAT,
          origem_id: cat.id,
          resumo: `CAT registrada (${ROTULOS_TIPO_CAT[dados.tipo]}) — acidente em ${formatarDataHora(dataAcidenteIso)}`,
          payload: {
            tipo: dados.tipo,
            data_acidente: dataAcidenteIso,
            houve_afastamento: dados.houve_afastamento,
          },
          registrado_por: sessao.usuario_id,
        });
      }
      return cat;
    });
    return { id };
  } catch (erro) {
    if (violacaoUnica(erro) === "cat_sucessor_unico") {
      throw new ErroHttp(
        409,
        "Esta CAT acabou de ser corrigida por outro registro — recarregue a lista."
      );
    }
    throw erro;
  }
}

/**
 * Afastamentos de acidente de trabalho para o select de vínculo da CAT.
 * O tipo do afastamento é dado de saúde: sem afastamento.saude.ver a lista
 * volta VAZIA (ausência) e o vínculo fica indisponível na tela.
 */
export async function listarVinculosCat(
  sessao: PayloadSessao
): Promise<
  { id: number; colaborador_id: number; inicio: string; fim: string | null }[]
> {
  const verSaudeAfastamento = await temPermissao(
    sessao.usuario_id,
    "afastamento.saude.ver"
  );
  if (!verSaudeAfastamento) return [];
  return listarAfastamentosAcidente();
}

// ------------------------------------------------------------------ permissões

export async function permissoesSst(sessao: PayloadSessao): Promise<{
  gerir: boolean;
  ver_saude: boolean;
}> {
  const [gerir, verSaude] = await Promise.all([
    temPermissao(sessao.usuario_id, CHAVE_GERIR),
    temPermissao(sessao.usuario_id, CHAVE_SAUDE_VER),
  ]);
  return { gerir, ver_saude: verSaude };
}
