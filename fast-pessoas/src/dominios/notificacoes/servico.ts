import { comTransacao } from "../../lib/banco";
import { ErroHttp, lerSessao } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { EmissaoNotificacao, esquemaEmissao } from "./esquemas";
import {
  contarNaoLidas,
  ExecutorSql,
  inserir,
  inserirLote,
  listarPagina,
  marcarLidas,
  marcarTodasLidas,
  Notificacao,
} from "./repositorio";

const LIMITE_PAGINA = 20;

// ---------------------------------------------------------------- regra dura
// Notificação carrega REFERÊNCIA NEUTRA ("Você tem uma aprovação pendente"),
// nunca o dado: valor de salário, CID/saúde, nota de avaliação ou resposta de
// clima ficam na tela de destino, atrás da permissão da rota. Estes padrões
// são uma barreira heurística intencionalmente AGRESSIVA: falso positivo se
// resolve reescrevendo o aviso de forma neutra; falso negativo vaza dado.
const PADROES_PROIBIDOS: { padrao: RegExp; motivo: string }[] = [
  { padrao: /R\$/, motivo: "valor monetário (R$)" },
  {
    padrao: /\b\d{1,3}(\.\d{3})*,\d{2}\b/,
    motivo: "número em formato monetário",
  },
  {
    padrao: /\b(sal[áa]rios?|remunera[çc][ãa]o|vencimentos?)\b\D{0,30}\d/i,
    motivo: "salário associado a número",
  },
  { padrao: /\bCID\b/i, motivo: "menção a CID" },
  { padrao: /\b[A-Z]\d{2}(\.\d)?\b/, motivo: "código no formato CID-10" },
  {
    padrao: /\b(diagn[óo]stico|doen[çc]a|enfermidade|laudo)\b/i,
    motivo: "termo de saúde",
  },
  { padrao: /\bnotas?\b\D{0,15}\d/i, motivo: "nota de avaliação" },
  {
    padrao: /\bresposta(s)?\b[\s\S]{0,40}\bclima\b/i,
    motivo: "resposta de pesquisa de clima",
  },
];

/**
 * REGRA DURA: lança Error (bug de programação, não erro de usuário — vira 500
 * no domínio chamador) se título/corpo carregarem conteúdo sensível. A emissão
 * correta é sempre "aviso neutro + link para a tela que checa permissão".
 */
function garantirTextoNeutro(campo: "titulo" | "corpo", texto: string): void {
  for (const { padrao, motivo } of PADROES_PROIBIDOS) {
    if (padrao.test(texto)) {
      throw new Error(
        `Notificação recusada: ${campo} contém ${motivo}. ` +
          "Use referência neutra e deixe o dado na tela de destino (link)."
      );
    }
  }
}

function validarEmissao(entrada: EmissaoNotificacao): {
  usuario_id: number;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
} {
  const dados = esquemaEmissao.parse(entrada);
  garantirTextoNeutro("titulo", dados.titulo);
  if (dados.corpo !== undefined) {
    garantirTextoNeutro("corpo", dados.corpo);
  }
  return {
    usuario_id: dados.usuarioId,
    tipo: dados.tipo,
    titulo: dados.titulo,
    corpo: dados.corpo ?? null,
    link: dados.link ?? null,
  };
}

/**
 * API interna de emissão, chamada pelos OUTROS domínios — de dentro da
 * transação deles (PoolClient) ou, em contexto de sistema, com um Pool.
 * Devolve o id da notificação criada.
 */
export async function notificar(
  executor: ExecutorSql,
  entrada: EmissaoNotificacao
): Promise<number> {
  return inserir(executor, validarEmissao(entrada));
}

/** Versão em lote (ex.: avisar todos os aprovadores). Lote vazio é no-op. */
export async function notificarLote(
  executor: ExecutorSql,
  entradas: EmissaoNotificacao[]
): Promise<number[]> {
  return inserirLote(executor, entradas.map(validarEmissao));
}

// ------------------------------------------------------------ visão da sessão
// SEM chave de permissão DE PROPÓSITO (ver 0015_notificacoes.sql): cada usuário
// só alcança as PRÓPRIAS notificações — o filtro é sessao.usuario_id em todo
// SQL do repositório; a API não aceita usuário como parâmetro.

export async function exigirSessaoNotificacoes(): Promise<PayloadSessao> {
  const sessao = await lerSessao();
  if (!sessao) {
    throw new ErroHttp(401, "Não autenticado");
  }
  if (sessao.pendente_2fa) {
    throw new ErroHttp(
      403,
      "Configure a autenticação em duas etapas para continuar"
    );
  }
  return sessao;
}

export interface VisaoNotificacoes {
  nao_lidas: number;
  tem_mais: boolean;
  notificacoes: Notificacao[];
}

export async function listarMinhas(
  sessao: PayloadSessao,
  antesDe?: number
): Promise<VisaoNotificacoes> {
  const [linhas, naoLidas] = await Promise.all([
    listarPagina(sessao.usuario_id, LIMITE_PAGINA + 1, antesDe),
    contarNaoLidas(sessao.usuario_id),
  ]);
  const temMais = linhas.length > LIMITE_PAGINA;
  return {
    nao_lidas: naoLidas,
    tem_mais: temMais,
    notificacoes: temMais ? linhas.slice(0, LIMITE_PAGINA) : linhas,
  };
}

export interface ResultadoMarcacao {
  marcadas: number;
  nao_lidas: number;
}

// Marcar lida é a única mutação legítima (trigger trava o resto) e não altera
// conteúdo de negócio — por isso não gera audit.alteracao, como as demais
// mutações relevantes geram.
export async function marcarComoLidas(
  sessao: PayloadSessao,
  ids: number[]
): Promise<ResultadoMarcacao> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const marcadas = await marcarLidas(cliente, sessao.usuario_id, ids);
    const naoLidas = await contarNaoLidas(sessao.usuario_id, cliente);
    return { marcadas, nao_lidas: naoLidas };
  });
}

export async function marcarTodasComoLidas(
  sessao: PayloadSessao
): Promise<ResultadoMarcacao> {
  return comTransacao(sessao.usuario_id, async (cliente) => {
    const marcadas = await marcarTodasLidas(cliente, sessao.usuario_id);
    return { marcadas, nao_lidas: 0 };
  });
}
