import { registrarAlteracao } from "../../lib/auditoria";
import { cifrar, decifrar } from "../../lib/cifra";
import { comTransacao } from "../../lib/banco";
import { ErroHttpCampo } from "../../lib/http";
import { inserirEvento } from "../colaboradores/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  formatarPeriodo,
  RegistroAfastamento,
  ROTULO_GENERICO,
  ROTULOS_TIPO_AFASTAMENTO,
  TipoAfastamento,
} from "./esquemas";
import {
  buscarColaborador,
  buscarDocumento,
  inserir,
  listar,
  registrarLeituraSensivel,
  temPermissao,
} from "./repositorio";

const TABELA_AFASTAMENTO = "rh.afastamento";
const CHAVE_SAUDE_VER = "afastamento.saude.ver";
const RECURSO_SAUDE = "rh.afastamento.dados_saude";

/**
 * Item completo — SÓ para quem tem afastamento.saude.ver (dp). Cada leitura
 * com detalhe decifrado grava audit.leitura_sensivel.
 */
export interface AfastamentoCompleto {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo: TipoAfastamento;
  tipo_rotulo: string;
  inicio: string;
  fim: string | null;
  detalhe_saude: string | null;
  documento_id: number | null;
  documento_titulo: string | null;
  registrado_por_nome: string;
  criado_em: string;
}

/**
 * Item genérico — para quem vê afastamentos sem a chave de saúde (rh):
 * período + rótulo genérico. O tipo específico e o detalhe ficam AUSENTES
 * do payload (ausência, não máscara).
 */
export interface AfastamentoGenerico {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  tipo_rotulo: string;
  inicio: string;
  fim: string | null;
}

export type ListaAfastamentos =
  | { com_saude: true; afastamentos: AfastamentoCompleto[] }
  | { com_saude: false; afastamentos: AfastamentoGenerico[] };

export async function listarAfastamentos(
  sessao: PayloadSessao
): Promise<ListaAfastamentos> {
  const verSaude = await temPermissao(sessao.usuario_id, CHAVE_SAUDE_VER);
  const linhas = await listar();

  if (!verSaude) {
    return {
      com_saude: false,
      afastamentos: linhas.map((linha) => ({
        id: linha.id,
        colaborador_id: linha.colaborador_id,
        colaborador_nome: linha.colaborador_nome,
        matricula: linha.matricula,
        tipo_rotulo: ROTULO_GENERICO,
        inicio: linha.inicio,
        fim: linha.fim,
      })),
    };
  }

  const afastamentos: AfastamentoCompleto[] = linhas.map((linha) => {
    let detalhe: string | null = null;
    if (linha.dados_saude_cifrados !== null) {
      try {
        detalhe = decifrar(linha.dados_saude_cifrados);
      } catch {
        // Nunca derruba o painel: sinaliza sem expor o conteúdo cifrado.
        detalhe = "[conteúdo ilegível — falha na decifração]";
      }
    }
    return {
      id: linha.id,
      colaborador_id: linha.colaborador_id,
      colaborador_nome: linha.colaborador_nome,
      matricula: linha.matricula,
      tipo: linha.tipo,
      tipo_rotulo: ROTULOS_TIPO_AFASTAMENTO[linha.tipo],
      inicio: linha.inicio,
      fim: linha.fim,
      detalhe_saude: detalhe,
      documento_id: linha.documento_id,
      documento_titulo: linha.documento_titulo,
      registrado_por_nome: linha.registrado_por_nome,
      criado_em: linha.criado_em,
    };
  });

  // Trilha de leitura: um registro por afastamento cujo detalhe foi decifrado.
  const idsComDetalhe = linhas
    .filter((linha) => linha.dados_saude_cifrados !== null)
    .map((linha) => String(linha.id));
  if (idsComDetalhe.length > 0) {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      for (const registroId of idsComDetalhe) {
        await registrarLeituraSensivel(cliente, {
          usuarioId: sessao.usuario_id,
          chavePermissao: CHAVE_SAUDE_VER,
          recurso: RECURSO_SAUDE,
          registroId,
        });
      }
    });
  }

  return { com_saude: true, afastamentos };
}

export async function registrarAfastamento(
  sessao: PayloadSessao,
  dados: RegistroAfastamento
): Promise<AfastamentoCompleto> {
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
  const cifrado = dados.detalhe_saude ? cifrar(dados.detalhe_saude) : null;
  const fim = dados.fim ?? null;
  const documentoId = dados.documento_id ?? null;

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const afastamentoId = await inserir(cliente, {
      colaborador_id: dados.colaborador_id,
      tipo: dados.tipo,
      inicio: dados.inicio,
      fim,
      dados_saude_cifrados: cifrado,
      documento_id: documentoId,
      registrado_por: sessao.usuario_id,
    });
    // Auditoria SEM dado de saúde em claro: só a marca de que existe.
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_AFASTAMENTO,
      registroId: String(afastamentoId),
      diff: {
        Colaborador: {
          de: null,
          para: `${colaborador.nome_completo} (${colaborador.matricula})`,
        },
        Tipo: { de: null, para: ROTULOS_TIPO_AFASTAMENTO[dados.tipo] },
        "Período": { de: null, para: formatarPeriodo(dados.inicio, fim) },
        Documento: {
          de: null,
          para: documentoTitulo ?? "sem documento",
        },
        "Detalhe de saúde": {
          de: null,
          para: cifrado ? "registrado (cifrado)" : "não informado",
        },
      },
    });
    // Linha do tempo: resumo genérico, SEM tipo específico e SEM saúde.
    await inserirEvento(cliente, {
      colaborador_id: dados.colaborador_id,
      tipo: "afastamento_registrado",
      ocorrido_em: new Date().toISOString(),
      origem_tabela: TABELA_AFASTAMENTO,
      origem_id: afastamentoId,
      resumo: `Afastamento registrado: ${formatarPeriodo(dados.inicio, fim)}`,
      payload: { inicio: dados.inicio, fim },
      registrado_por: sessao.usuario_id,
    });
    return afastamentoId;
  });

  return {
    id,
    colaborador_id: colaborador.id,
    colaborador_nome: colaborador.nome_completo,
    matricula: colaborador.matricula,
    tipo: dados.tipo,
    tipo_rotulo: ROTULOS_TIPO_AFASTAMENTO[dados.tipo],
    inicio: dados.inicio,
    fim,
    detalhe_saude: dados.detalhe_saude ?? null,
    documento_id: documentoId,
    documento_titulo: documentoTitulo,
    registrado_por_nome: sessao.nome,
    criado_em: new Date().toISOString(),
  };
}

export async function permissoesAfastamentos(sessao: PayloadSessao): Promise<{
  registrar: boolean;
  ver_saude: boolean;
}> {
  const [registrar, verSaude] = await Promise.all([
    temPermissao(sessao.usuario_id, "afastamento.registrar"),
    temPermissao(sessao.usuario_id, CHAVE_SAUDE_VER),
  ]);
  return { registrar, ver_saude: verSaude };
}
