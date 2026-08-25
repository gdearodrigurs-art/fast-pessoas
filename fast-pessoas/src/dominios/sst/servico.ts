import { PoolClient } from "pg";
import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao } from "../../lib/banco";
import { cifrar, decifrar } from "../../lib/cifra";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp } from "../../lib/sessao";
import { inserirEvento } from "../colaboradores/repositorio";
import { inserirCiencia } from "../documentos/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  ClassificacaoRisco,
  EntregaEpi,
  formatarData,
  formatarDataHora,
  ItemEpi,
  PsicossocialVinculada,
  RegistroAso,
  RegistroCat,
  RegistroPsicossocial,
  ResultadoAso,
  ROTULOS_CLASSIFICACAO_RISCO,
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
  buscarAso,
  buscarCat,
  buscarColaborador,
  buscarDocumento,
  buscarEntregaEpi,
  buscarItemEpi,
  cienciaExistente,
  colaboradorDoUsuario,
  contarAtivosComAsoValido,
  contarAtivosComPsicossocialValida,
  EntregaEpiLinha,
  inserirAso,
  inserirCat,
  inserirEntregaEpi,
  inserirItemEpi,
  inserirPsicossocial,
  ItemEpiLinha,
  listarAfastamentosAcidente,
  listarAsos,
  listarCats,
  listarEntregasDoColaborador,
  listarEntregasEpi,
  listarItensEpi,
  listarPsicossociais,
  listarValidadePorColaborador,
  listarValidadePsicossocialPorColaborador,
  marcarCienciaEntregaEpi,
  marcarDevolucaoEpi,
  registrarLeituraSensivel,
  temPermissao,
  ValidadePorColaborador,
} from "./repositorio";

const TABELA_ASO = "rh.aso";
const TABELA_PSICOSSOCIAL = "rh.avaliacao_psicossocial";
const TABELA_EPI_ITEM = "rh.epi_item";
const TABELA_EPI_ENTREGA = "rh.epi_entrega";
const TABELA_CAT = "rh.cat";
const TABELA_CIENCIA = "rh.ciencia";
const CHAVE_GERIR = "sst.gerir";
const CHAVE_SAUDE_VER = "sst.saude.ver";
// Chave da PORTA do painel de SST — e, no caso da CAT, a permissão que de
// fato autoriza a leitura: não há chave mais fina sobre a CAT, então é ela
// que vai para a trilha (eixo 8: a chave gravada é a que autorizou, não a
// mais bonita).
const CHAVE_VER = "sst.ver";
const RECURSO_RESTRICOES = "rh.aso.restricoes";
const RECURSO_PSICOSSOCIAL = "rh.avaliacao_psicossocial.observacoes";

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

  // Trilha de leitura: um registro por ASO DEVOLVIDO — não só os que têm
  // restrição cifrada. O payload entrega a CONCLUSÃO clínica (resultado:
  // apto/inapto/apto_com_restrições) de toda linha, e ler "inapto" já é ler
  // saúde de terceiro. A trilha se amarra ao dado devolvido, não à existência
  // de um campo cifrado (mesmo critério da CAT).
  const idsLidos = linhas.map((linha) => String(linha.id));
  if (idsLidos.length > 0) {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      for (const registroId of idsLidos) {
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

  // NR-1 acoplada: o laudo da avaliação (se houver) é conferido ANTES da
  // transação, junto com o do ASO — a avaliação nasce na mesma transação.
  let psicossocialDocumentoTitulo: string | null = null;
  if (dados.psicossocial?.documento_id) {
    const documento = await buscarDocumento(dados.psicossocial.documento_id);
    if (!documento) {
      throw new ErroHttpCampo(
        400,
        "Documento da avaliação psicossocial não encontrado no GED.",
        "psicossocial.documento_id"
      );
    }
    psicossocialDocumentoTitulo = documento.titulo;
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
    // "Todo mundo que fizer o ASO agora já entra nessa modalidade": quando a
    // tela oferece e o operador aceita, a avaliação psicossocial nasce aqui,
    // vinculada — mesma transação, tudo ou nada.
    if (dados.psicossocial) {
      await gravarPsicossocial(cliente, sessao, {
        ...dados.psicossocial,
        colaborador_id: dados.colaborador_id,
        aso_id: asoId,
        colaborador_rotulo: `${colaborador.nome_completo} (${colaborador.matricula})`,
        documento_titulo: psicossocialDocumentoTitulo,
      });
    }
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
  /** monitorados sem nenhum registro (ASO ou avaliação) com validade */
  sem_validade: number;
  /** colaboradores não desligados monitorados */
  total_monitorado: number;
  em_dia: number;
}

/**
 * Painel de vencimento a partir da última validade por colaborador. Usado
 * pelo ASO e, com a MESMA régua, pela avaliação psicossocial (a NR-1 anda ao
 * lado do ASO — controle equivalente, não um controle menor).
 */
function montarPainelVencimento(
  linhas: ValidadePorColaborador[]
): PainelVencimentos {
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

export async function apurarVencimentosAso(): Promise<PainelVencimentos> {
  return montarPainelVencimento(await listarValidadePorColaborador());
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

// ------------------------------------------------------------------ NR-1 / avaliação psicossocial

/**
 * Item completo — SÓ para quem tem sst.saude.ver: classificação de risco e
 * observações decifradas. Cada observação decifrada grava
 * audit.leitura_sensivel.
 */
export interface PsicossocialCompleta {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data_avaliacao: string;
  validade: string | null;
  classificacao_risco: ClassificacaoRisco;
  classificacao_rotulo: string;
  observacoes: string | null;
  documento_id: number | null;
  documento_titulo: string | null;
  aso_id: number | null;
  empresa_executora: string | null;
  registrado_por_nome: string;
  criado_em: string;
}

/**
 * Item básico — para quem vê SST sem a chave de saúde: datas, empresa
 * executora e o vínculo com o ASO. Classificação, observações e o laudo
 * (documento sensível) ficam AUSENTES do payload (ausência, não máscara).
 */
export interface PsicossocialBasica {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data_avaliacao: string;
  validade: string | null;
  aso_id: number | null;
  empresa_executora: string | null;
}

export type ListaPsicossociais =
  | { com_saude: true; avaliacoes: PsicossocialCompleta[] }
  | { com_saude: false; avaliacoes: PsicossocialBasica[] };

export async function listarPsicossociaisParaSessao(
  sessao: PayloadSessao
): Promise<ListaPsicossociais> {
  const verSaude = await temPermissao(sessao.usuario_id, CHAVE_SAUDE_VER);
  const linhas = await listarPsicossociais();

  if (!verSaude) {
    return {
      com_saude: false,
      avaliacoes: linhas.map((linha) => ({
        id: linha.id,
        colaborador_id: linha.colaborador_id,
        colaborador_nome: linha.colaborador_nome,
        matricula: linha.matricula,
        data_avaliacao: linha.data_avaliacao,
        validade: linha.validade,
        aso_id: linha.aso_id,
        empresa_executora: linha.empresa_executora,
      })),
    };
  }

  const avaliacoes: PsicossocialCompleta[] = linhas.map((linha) => {
    let observacoes: string | null = null;
    if (linha.observacoes_cifradas !== null) {
      try {
        observacoes = decifrar(linha.observacoes_cifradas);
      } catch {
        // Nunca derruba o painel: sinaliza sem expor o conteúdo cifrado.
        observacoes = "[conteúdo ilegível — falha na decifração]";
      }
    }
    return {
      id: linha.id,
      colaborador_id: linha.colaborador_id,
      colaborador_nome: linha.colaborador_nome,
      matricula: linha.matricula,
      data_avaliacao: linha.data_avaliacao,
      validade: linha.validade,
      classificacao_risco: linha.classificacao_risco,
      classificacao_rotulo:
        ROTULOS_CLASSIFICACAO_RISCO[linha.classificacao_risco],
      observacoes,
      documento_id: linha.documento_id,
      documento_titulo: linha.documento_titulo,
      aso_id: linha.aso_id,
      empresa_executora: linha.empresa_executora,
      registrado_por_nome: linha.registrado_por_nome,
      criado_em: linha.criado_em,
    };
  });

  // Trilha de leitura: um registro por avaliação DEVOLVIDA — não só as com
  // observação cifrada. classificacao_risco (baixo/médio/alto/crítico) é
  // conclusão de saúde e sai em toda linha, então a trilha cobre a leitura do
  // resultado, não a existência de um campo cifrado.
  const idsLidos = linhas.map((linha) => String(linha.id));
  if (idsLidos.length > 0) {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      for (const registroId of idsLidos) {
        await registrarLeituraSensivel(cliente, {
          usuarioId: sessao.usuario_id,
          chavePermissao: CHAVE_SAUDE_VER,
          recurso: RECURSO_PSICOSSOCIAL,
          registroId,
        });
      }
    });
  }

  return { com_saude: true, avaliacoes };
}

/**
 * Gravação da avaliação DENTRO de uma transação já aberta — usada tanto pelo
 * registro avulso quanto pelo fluxo acoplado ao ASO. Cifra na aplicação,
 * audita SEM conteúdo clínico em claro e projeta o fato na linha do tempo.
 */
async function gravarPsicossocial(
  cliente: PoolClient,
  sessao: PayloadSessao,
  dados: PsicossocialVinculada & {
    colaborador_id: number;
    aso_id: number | null;
    colaborador_rotulo: string;
    documento_titulo: string | null;
  }
): Promise<number> {
  const validade = dados.validade ?? null;
  const documentoId = dados.documento_id ?? null;
  const empresa = dados.empresa_executora ?? null;
  // Cifra do dado de saúde: o texto em claro nunca vai ao banco nem à trilha.
  const cifrado = dados.observacoes ? cifrar(dados.observacoes) : null;

  const avaliacaoId = await inserirPsicossocial(cliente, {
    colaborador_id: dados.colaborador_id,
    data_avaliacao: dados.data_avaliacao,
    validade,
    classificacao_risco: dados.classificacao_risco,
    observacoes_cifradas: cifrado,
    documento_id: documentoId,
    aso_id: dados.aso_id,
    empresa_executora: empresa,
    registrado_por: sessao.usuario_id,
  });
  await registrarAlteracao(cliente, {
    usuarioId: sessao.usuario_id,
    papel: sessao.papel,
    acao: "criacao",
    tabela: TABELA_PSICOSSOCIAL,
    registroId: String(avaliacaoId),
    diff: {
      Colaborador: { de: null, para: dados.colaborador_rotulo },
      "Data da avaliação": {
        de: null,
        para: formatarData(dados.data_avaliacao),
      },
      Validade: {
        de: null,
        para: validade ? formatarData(validade) : "sem validade definida",
      },
      // Classificação e observações são dado de saúde: só marca, nunca o valor.
      "Classificação de risco": { de: null, para: "registrada (dado de saúde)" },
      "Observações": {
        de: null,
        para: cifrado ? "registradas (cifradas)" : "não informadas",
      },
      "Empresa executora": { de: null, para: empresa ?? "não informada" },
      Documento: { de: null, para: dados.documento_titulo ?? "sem documento" },
      "ASO de origem": {
        de: null,
        para: dados.aso_id === null ? "avulsa" : `#${dados.aso_id}`,
      },
    },
  });
  // Linha do tempo: fato genérico, SEM classificação e SEM observações.
  await inserirEvento(cliente, {
    colaborador_id: dados.colaborador_id,
    tipo: "avaliacao_psicossocial_registrada",
    ocorrido_em: `${dados.data_avaliacao}T00:00:00Z`,
    origem_tabela: TABELA_PSICOSSOCIAL,
    origem_id: avaliacaoId,
    resumo: `Avaliação psicossocial (NR-1) registrada em ${formatarData(dados.data_avaliacao)}${
      dados.aso_id === null ? "" : ` — vinculada ao ASO #${dados.aso_id}`
    }`,
    payload: {
      data_avaliacao: dados.data_avaliacao,
      validade,
      aso_id: dados.aso_id,
    },
    registrado_por: sessao.usuario_id,
  });
  return avaliacaoId;
}

/** Registro avulso (aba NR-1) — pode ou não apontar para um ASO existente. */
export async function registrarPsicossocial(
  sessao: PayloadSessao,
  dados: RegistroPsicossocial
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
  const asoId = dados.aso_id ?? null;
  if (asoId !== null) {
    const aso = await buscarAso(asoId);
    if (!aso) {
      throw new ErroHttpCampo(400, "ASO não encontrado.", "aso_id");
    }
    if (aso.colaborador_id !== dados.colaborador_id) {
      throw new ErroHttpCampo(
        400,
        "O ASO informado é de outro colaborador.",
        "aso_id"
      );
    }
  }

  try {
    const id = await comTransacao(sessao.usuario_id, (cliente) =>
      gravarPsicossocial(cliente, sessao, {
        ...dados,
        aso_id: asoId,
        colaborador_rotulo: `${colaborador.nome_completo} (${colaborador.matricula})`,
        documento_titulo: documentoTitulo,
      })
    );
    return { id };
  } catch (erro) {
    if (violacaoUnica(erro) === "avaliacao_psicossocial_por_aso") {
      throw new ErroHttpCampo(
        409,
        "Este ASO já tem avaliação psicossocial vinculada.",
        "aso_id"
      );
    }
    throw erro;
  }
}

/** Painel de vencimento da NR-1 — mesma régua do ASO (vencidas/30/60). */
export async function apurarVencimentosPsicossocial(): Promise<PainelVencimentos> {
  return montarPainelVencimento(
    await listarValidadePsicossocialPorColaborador()
  );
}

/**
 * A "segunda linha" pedida pela diretoria, ao lado de asos_validos:
 * % de colaboradores ATIVOS com avaliação psicossocial dentro da validade.
 * Agregado puro — nenhum conteúdo clínico. null = nenhum colaborador ativo.
 */
export async function valorIndicadorPsicossocialValida(): Promise<
  number | null
> {
  const { ativos, com_avaliacao_valida } =
    await contarAtivosComPsicossocialValida();
  if (ativos === 0) return null;
  return Math.round((com_avaliacao_valida / ativos) * 1000) / 10;
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
    // Costura 1.4×1.5: documento do CICLO de ciência não vira termo de entrega.
    // A ciência do ciclo tem regras próprias (ler até o fim, recusa, ato,
    // versão vigente) e a ciência da entrega as atropelaria — barra na origem.
    if (termo.exige_ciencia) {
      throw new ErroHttpCampo(
        400,
        "Este documento participa do ciclo de ciência e não pode ser usado como termo de entrega — publique o termo fora do ciclo.",
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
      if (momento === null) {
        // Corrida: outra requisição registrou a devolução entre o pré-check
        // (fora da transação) e aqui. 409 em vez do 500 do trigger.
        throw new ErroHttp(409, "Devolução já registrada para esta entrega.");
      }
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
  // Costura 1.4×1.5: a ciência de EPI NÃO assina documento do ciclo — o ciclo
  // exige ler até o fim e tem recusa/ato/liberação; este atalho pularia tudo
  // isso. registrarEntregaEpi barra na origem; aqui é o cinto p/ dado antigo.
  if (termo.exige_ciencia) {
    throw new ErroHttp(
      409,
      "Este documento participa do ciclo de ciência — registre a ciência pelo fluxo do documento, na tela de Documentos."
    );
  }
  // Espelho de darCiencia (documentos/servico.ts): versão substituída não
  // colhe ciência nova — a ciência vale na ponta da cadeia.
  if (termo.substituido_por_id !== null) {
    throw new ErroHttp(
      409,
      "Este documento foi substituído por uma versão nova — registre a ciência na versão vigente."
    );
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
      const marcou = await marcarCienciaEntregaEpi(cliente, entregaId);
      if (!marcou) {
        // Corrida na projeção: outra requisição marcou entre o pré-check
        // (fora da transação) e aqui. 409, molde registrarDevolucaoEpi.
        throw new ErroHttp(409, "Ciência já registrada para esta entrega.");
      }
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
  } catch (erro) {
    // Corrida no INSERT de rh.ciencia (UNIQUE documento+usuário, 0006): as
    // duas requisições do duplo clique passam pelo mesmo pré-check e a
    // segunda estoura 23505 dentro da transação — sem esta tradução, 500 cru.
    if (violacaoUnica(erro) === "ciencia_documento_id_usuario_id_key") {
      throw new ErroHttp(409, "Ciência já registrada para esta entrega.");
    }
    throw erro;
  }
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

/** Uma linha de `audit.leitura_sensivel`, antes de ir ao banco. */
export interface EntradaTrilhaLeitura {
  usuarioId: number;
  chavePermissao: string;
  recurso: string;
  registroId: string;
}

/**
 * A trilha da CAT: **uma linha por CAT devolvida**, sempre — e não só quando
 * algum campo está cifrado. A CAT não tem campo cifrado nenhum, e mesmo assim
 * é o pior payload de saúde do módulo: nome, matrícula, tipo do acidente,
 * data e a `descricao` livre de até 4.000 caracteres, que é onde o médico do
 * trabalho escreve o quadro clínico. Amarrar a trilha ao dado DEVOLVIDO (e
 * não à existência de um cifrado) é o ponto do eixo 8.
 *
 * Puro de propósito: é o que a suíte consegue provar sem abrir banco.
 */
export function entradasTrilhaCat(
  usuarioId: number,
  cats: { id: number }[]
): EntradaTrilhaLeitura[] {
  return cats.map((cat) => ({
    usuarioId,
    chavePermissao: CHAVE_VER,
    recurso: TABELA_CAT,
    registroId: String(cat.id),
  }));
}

/**
 * Lista das CATs para o painel. Recebe a sessão porque **precisa** dela: sem
 * saber quem está lendo, a função seria estruturalmente incapaz de deixar
 * rastro — foi assim que a empresa inteira de acidentes nominados saía por
 * `GET /api/sst/cats` com `audit.leitura_sensivel` parado em zero.
 */
export async function listarCatsVisao(
  sessao: PayloadSessao
): Promise<CatVisao[]> {
  const linhas = await listarCats();
  const cats: CatVisao[] = linhas.map((linha) => ({
    ...linha,
    tipo_rotulo: ROTULOS_TIPO_CAT[linha.tipo],
    status_rotulo: ROTULOS_STATUS_CAT[linha.status],
  }));

  const trilha = entradasTrilhaCat(sessao.usuario_id, cats);
  if (trilha.length > 0) {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      for (const entrada of trilha) {
        await registrarLeituraSensivel(cliente, entrada);
      }
    });
  }

  return cats;
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
