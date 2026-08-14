import { registrarAlteracao } from "../../lib/auditoria";
import { comTransacao, consultar } from "../../lib/banco";
import { ErroHttpCampo, violacaoUnica } from "../../lib/http";
import { ErroHttp, lerSessao } from "../../lib/sessao";
import { lerMinimoPorRecorte, listarCargos } from "../colaboradores/repositorio";
import { OpcoesFiltroEstrutura } from "../estrutura/esquemas";
import { listarOpcoesDeFiltroEstrutura } from "../estrutura/repositorio";
import { PayloadSessao } from "../identidade/esquemas";
import {
  AcaoPesquisa,
  alvoDaLinha,
  alvoPreenchido,
  AtualizacaoPlano,
  CriacaoPesquisa,
  EnvioRespostas,
  FAIXA_NUMERICA,
  pesquisaTemAlvo,
  pessoasDoRecorte,
  PlanoNovo,
  recorteCasaAlvo,
  ROTULOS_STATUS_PLANO,
  ROTULOS_TIPO_PERGUNTA,
  ROTULOS_TIPO_PESQUISA,
  StatusPlano,
  TEXTO_AMOSTRA_INSUFICIENTE,
  TipoPergunta,
  TipoPesquisa,
} from "./esquemas";
import {
  abrirPesquisa,
  atualizarStatusPlano,
  buscarColaboradorPorUsuario,
  buscarPesquisa,
  buscarPlano,
  comentarios,
  contagensEscala,
  contagensEscolha,
  contagensNps,
  contarAtivos,
  contarElegiveis,
  encerrarPesquisa,
  inserirParticipacao,
  travarPesquisaParaResposta,
  inserirPergunta,
  inserirPesquisa,
  inserirPlano,
  inserirRespostas,
  jaParticipou,
  listarAbertasParaColaborador,
  listarPerguntas,
  listarPesquisas,
  listarPlanos,
  listarResponsaveis,
  listarUnidades,
  PerguntaLinha,
  PesquisaLinha,
  PlanoLinha,
  recorteDoColaborador,
  recortesPorUnidade,
  ultimaContagemEnpsEncerrada,
  ultimaPesquisaEncerrada,
  UnidadeOpcao,
  UsuarioOpcao,
} from "./repositorio";

/** Fora do público-alvo: bloqueio de AUTORIZAÇÃO no servidor (eixo 7). */
const FORA_DO_ALVO =
  "Esta pesquisa é destinada a um público específico e você não faz parte dele.";

/**
 * Serviço da pesquisa estruturada de clima.
 *
 * Três invariantes que este arquivo existe para garantir:
 *   1. ANONIMATO — nenhuma função aqui liga resposta a pessoa. O respondente é
 *      resolvido apenas para (a) saber a unidade e (b) marcar participação;
 *      as duas coisas seguem por caminhos separados (ver 0022_pesquisas.sql).
 *   2. k-ANONIMATO — todo recorte de resultado passa por `recorte()`. Com menos
 *      de k respostas o payload sai SEM o valor e SEM a contagem: só o rótulo
 *      "amostra insuficiente". Ausência, não máscara. O k é o MESMO dos
 *      relatórios agregados (sistema.parametro_privacidade.minimo_por_recorte,
 *      migrations 0044 e 0045), lido a cada chamada — não é constante deste
 *      arquivo. Ver a nota longa em esquemas.ts sobre por que é um parâmetro
 *      só e não dois.
 *   3. eNPS CORRETO — %promotores(9–10) − %detratores(0–6) em pontos
 *      percentuais; neutros (7–8) contam no denominador e em nada mais.
 *
 * Riscos/pendências conhecidos (evolução, não pré-requisito — critério "bom que
 * funciona" declarado pelo usuário em 2026-07-29):
 *   * `anonima = false` ainda NÃO grava resposta identificada; a coluna existe
 *     para a tela avisar o respondente. Pesquisa identificada exigiria uma
 *     segunda tabela de resposta (com FK de colaborador) e trilha de leitura
 *     sensível — não faça isso reaproveitando resposta_pesquisa.
 *   * Convite/lembrete por notificação interna não está ligado; a adesão hoje
 *     depende da pessoa abrir /pesquisas.
 *   * O recorte agregável é só a unidade. Cargo, tempo de casa e faixa etária
 *     entram quando houver massa suficiente para o k-anonimato não zerar tudo.
 *   * Este módulo NÃO escreve em rh.evento_colaborador de propósito: "respondeu
 *     a pesquisa X" não é fato da ficha da pessoa, e conteúdo de resposta jamais
 *     poderia ir para lá.
 *   * PENDÊNCIA DE INTEGRAÇÃO (dono do semeador): db/semear/00-limpar.js precisa
 *     incluir, na ordem filho→pai, `rh_clima.resposta_pesquisa`,
 *     `rh_clima.participacao_pesquisa`, `rh_clima.plano_acao`,
 *     `rh_clima.pergunta_pesquisa` e `rh_clima.pesquisa` (as três primeiras têm
 *     trigger append-only/congelamento — usar comTriggersDesligados, como as
 *     demais). Sem isso, com pesquisa respondida no banco, `npm run db:demo`
 *     falha na FK de rh.colaborador / rh.estabelecimento. O resíduo do teste
 *     desta onda já foi removido, então hoje o reset da demo continua limpo.
 *   * PENDÊNCIA DE INTEGRAÇÃO (dono dos indicadores): ligar as chaves
 *     `adesao_pesquisa` e `enps` (catálogo criado na 0022) às funções
 *     valorIndicadorAdesaoPesquisa/valorIndicadorEnps no registry FONTES de
 *     src/dominios/indicadores/valores.ts. Até então a Central de Metas ignora
 *     as duas linhas (filtro comFonte) — sem número errado na tela.
 */

const TABELA_PESQUISA = "rh_clima.pesquisa";
const TABELA_PARTICIPACAO = "rh_clima.participacao_pesquisa";
const TABELA_PLANO = "rh_clima.plano_acao";
const FUSO_EXIBICAO = "America/Sao_Paulo";

// ------------------------------------------------------------------ apoio

/** Hoje em América/São Paulo (AAAA-MM-DD) — o período da pesquisa é em data. */
function hojeIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_EXIBICAO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function arredondar(valor: number, casas = 1): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * Porta única do k-anonimato. Devolve o valor calculado quando a amostra
 * alcança o mínimo; abaixo dele devolve ausência — nem valor, nem contagem.
 *
 * `minimo` é PARÂMETRO OBRIGATÓRIO de propósito: sem valor padrão, é
 * impossível chamar esta porta esquecendo de consultar a política vigente —
 * o compilador cobra. Foi exatamente o esquecimento oposto (constante local
 * em vez de política) que deixou este módulo fora da migration 0044.
 */
function recorte<T>(
  respostas: number,
  minimo: number,
  calcular: () => T
): { amostra_suficiente: boolean; respostas: number | null; valor: T | null } {
  if (respostas < minimo) {
    return { amostra_suficiente: false, respostas: null, valor: null };
  }
  return { amostra_suficiente: true, respostas, valor: calcular() };
}

/**
 * eNPS em pontos percentuais: promotores (9–10) menos detratores (0–6), cada um
 * como percentual do TOTAL de respostas (neutros 7–8 entram só no denominador).
 */
export function calcularEnps(
  promotores: number,
  detratores: number,
  total: number
): number {
  if (total <= 0) return 0;
  return arredondar(((promotores - detratores) / total) * 100);
}

async function chaves(
  usuarioId: number,
  lista: string[]
): Promise<Record<string, boolean>> {
  const linhas = await consultar<{ chave: string; autorizado: boolean }>(
    `SELECT c AS chave, sistema.tem_permissao($1, c) AS autorizado
       FROM unnest($2::text[]) AS c`,
    [usuarioId, lista]
  );
  return Object.fromEntries(linhas.map((l) => [l.chave, Boolean(l.autorizado)]));
}

export interface PermissoesPesquisas {
  administrar: boolean;
  responder: boolean;
  ver_resultado: boolean;
  gerir_plano: boolean;
}

export async function permissoesPesquisas(
  sessao: PayloadSessao
): Promise<PermissoesPesquisas> {
  const mapa = await chaves(sessao.usuario_id, [
    "pesquisa.administrar",
    "pesquisa.responder",
    "pesquisa.resultado.ver",
    "pesquisa.plano.gerir",
  ]);
  return {
    administrar: mapa["pesquisa.administrar"] ?? false,
    responder: mapa["pesquisa.responder"] ?? false,
    ver_resultado: mapa["pesquisa.resultado.ver"] ?? false,
    gerir_plano: mapa["pesquisa.plano.gerir"] ?? false,
  };
}

/**
 * Guarda da tela-índice /pesquisas, que serve a públicos diferentes (quem
 * responde, quem administra, quem lê resultado, quem gere plano). Em vez de
 * fixar UMA chave e trancar os outros perfis, exige sessão válida + 2FA
 * resolvido + AO MENOS UMA das chaves do módulo — mesmo padrão de
 * exigirSessaoNotificacoes (0015). Cada rota de ação continua com a sua chave
 * específica via exigirPermissao.
 */
export async function exigirAlgumaChavePesquisa(): Promise<{
  sessao: PayloadSessao;
  pode: PermissoesPesquisas;
}> {
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
  const pode = await permissoesPesquisas(sessao);
  if (
    !pode.administrar &&
    !pode.responder &&
    !pode.ver_resultado &&
    !pode.gerir_plano
  ) {
    throw new ErroHttp(403, "Sem permissão para esta operação");
  }
  return { sessao, pode };
}

// ------------------------------------------------------------------ listagem

export interface AbertaParaMim {
  id: number;
  titulo: string;
  tipo: TipoPesquisa;
  tipo_rotulo: string;
  descricao: string | null;
  fim: string;
  anonima: boolean;
  respondida: boolean;
}

export interface VisaoPesquisas {
  pode: PermissoesPesquisas;
  /**
   * Só para quem administra ou vê resultado; caso contrário, lista vazia.
   * `participacoes` vem NULL (junto com `adesao`) quando a pesquisa TEM alvo e
   * a adesão está abaixo do piso k — senão "3 participaram" num grupo pequeno
   * desanonimiza. Pesquisa sem alvo mostra a contagem como sempre.
   */
  pesquisas: Array<
    Omit<PesquisaLinha, "participacoes"> & {
      tipo_rotulo: string;
      participacoes: number | null;
      adesao: number | null;
    }
  >;
  /** Pesquisas abertas para a pessoa da sessão responder. */
  minhas_abertas: AbertaParaMim[];
  colaborador_vinculado: boolean;
  /**
   * Piso de anonimato vigente. Vai no payload porque a tela ANUNCIA o número
   * ("só aparece em recortes com N respostas ou mais") — e anunciar 5 quando a
   * empresa configurou 20 é prometer errado no lugar onde a promessa importa.
   */
  minimo_amostra: number;
  /** Catálogos do seletor de público-alvo — só para quem administra. */
  opcoes_estrutura?: OpcoesFiltroEstrutura;
  opcoes_cargo?: Array<{ id: number; nome: string }>;
}

export async function obterVisao(
  sessao: PayloadSessao,
  permissoes?: PermissoesPesquisas
): Promise<VisaoPesquisas> {
  const [pode, colaborador] = await Promise.all([
    permissoes ? Promise.resolve(permissoes) : permissoesPesquisas(sessao),
    buscarColaboradorPorUsuario(sessao.usuario_id),
  ]);
  const podeVerLista = pode.administrar || pode.ver_resultado;
  const [lista, ativos, abertas, minimoAmostra, opcoesEstrutura, cargos] =
    await Promise.all([
      podeVerLista ? listarPesquisas() : Promise.resolve([]),
      podeVerLista ? contarAtivos() : Promise.resolve(0),
      pode.responder
        ? listarAbertasParaColaborador(colaborador ? colaborador.id : null)
        : Promise.resolve([]),
      lerMinimoPorRecorte(),
      // Catálogos do seletor de alvo — só quem cria pesquisa precisa deles.
      pode.administrar ? listarOpcoesDeFiltroEstrutura() : Promise.resolve(null),
      pode.administrar ? listarCargos() : Promise.resolve(null),
    ]);

  // Denominador da adesão por pesquisa: `ativos` quando alvo vazio (regressão
  // idêntica); elegíveis (DISTINCT pessoa) quando há alvo. Só as MIRADAS custam
  // uma consulta a mais — a esmagadora maioria (empresa toda) não custa nada.
  const elegiveisPorPesquisa = new Map<number, number>();
  await Promise.all(
    lista
      .filter((pesquisa) => pesquisaTemAlvo(pesquisa))
      .map(async (pesquisa) => {
        elegiveisPorPesquisa.set(
          pesquisa.id,
          await contarElegiveis(alvoDaLinha(pesquisa))
        );
      })
  );

  return {
    pode,
    pesquisas: lista.map((pesquisa) => {
      const temAlvo = pesquisaTemAlvo(pesquisa);
      const denominador = temAlvo
        ? (elegiveisPorPesquisa.get(pesquisa.id) ?? 0)
        : ativos;
      // Sob alvo, a adesão respeita o k: "3 participaram" num grupo pequeno
      // desanonimiza tanto quanto uma média. Sem alvo, adesão é contagem de
      // participantes da casa inteira — visível como sempre (o k protege a
      // resposta, que segue oculta).
      const ocultarAdesao = temAlvo && pesquisa.participacoes < minimoAmostra;
      return {
        ...pesquisa,
        tipo_rotulo: ROTULOS_TIPO_PESQUISA[pesquisa.tipo],
        participacoes: ocultarAdesao ? null : pesquisa.participacoes,
        adesao:
          ocultarAdesao || denominador === 0
            ? null
            : arredondar((pesquisa.participacoes / denominador) * 100),
      };
    }),
    minhas_abertas: abertas.map((aberta) => ({
      ...aberta,
      tipo_rotulo: ROTULOS_TIPO_PESQUISA[aberta.tipo],
    })),
    colaborador_vinculado: colaborador !== null,
    minimo_amostra: minimoAmostra,
    ...(opcoesEstrutura ? { opcoes_estrutura: opcoesEstrutura } : {}),
    ...(cargos
      ? {
          opcoes_cargo: cargos
            .filter((cargo): cargo is typeof cargo & { nome: string } =>
              Boolean(cargo.nome)
            )
            .map((cargo) => ({ id: cargo.id, nome: cargo.nome })),
        }
      : {}),
  };
}

// ------------------------------------------------------------------ criação e ciclo

export async function criarPesquisa(
  sessao: PayloadSessao,
  dados: CriacaoPesquisa
): Promise<PesquisaLinha> {
  const alvo = dados.alvo;
  // Recusa a criação de pesquisa MIRADA cujo público já nasce abaixo do piso:
  // ela nunca poderia mostrar resultado nem adesão sem desanonimizar. Alvo
  // vazio (empresa toda) nunca é recusado. Contagem no servidor (eixo 7).
  if (alvoPreenchido(alvo)) {
    const [elegiveis, minimo] = await Promise.all([
      contarElegiveis(alvo),
      lerMinimoPorRecorte(),
    ]);
    if (elegiveis < minimo) {
      throw new ErroHttp(
        422,
        `O público-alvo tem ${elegiveis} ${
          elegiveis === 1 ? "pessoa" : "pessoas"
        }; o piso de anonimato é ${minimo}. Uma pesquisa mirada num grupo menor ` +
          "que o piso nunca poderá mostrar resultado — amplie o recorte ou baixe o piso."
      );
    }
  }

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const pesquisaId = await inserirPesquisa(cliente, {
      titulo: dados.titulo,
      tipo: dados.tipo,
      descricao: dados.descricao ?? null,
      inicio: dados.inicio,
      fim: dados.fim,
      anonima: dados.anonima,
      criada_por: sessao.usuario_id,
      empresa_id: alvo?.empresa_id ?? null,
      estabelecimento_id: alvo?.estabelecimento_id ?? null,
      centro_custo_id: alvo?.centro_custo_id ?? null,
      cargo_id: alvo?.cargo_id ?? null,
    });
    let ordem = 1;
    for (const pergunta of dados.perguntas) {
      await inserirPergunta(cliente, {
        pesquisa_id: pesquisaId,
        ordem,
        enunciado: pergunta.enunciado,
        tipo: pergunta.tipo,
        opcoes: pergunta.opcoes ?? null,
        obrigatoria: pergunta.obrigatoria,
      });
      ordem += 1;
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_PESQUISA,
      registroId: String(pesquisaId),
      diff: {
        Título: { de: null, para: dados.titulo },
        Tipo: { de: null, para: ROTULOS_TIPO_PESQUISA[dados.tipo] },
        Período: {
          de: null,
          para: `${formatarData(dados.inicio)} a ${formatarData(dados.fim)}`,
        },
        Anônima: { de: null, para: dados.anonima ? "sim" : "não" },
        "Público-alvo": {
          de: null,
          para: alvoPreenchido(alvo) ? "recorte específico" : "empresa toda",
        },
        Perguntas: { de: null, para: String(dados.perguntas.length) },
      },
    });
    return pesquisaId;
  });
  const pesquisa = await buscarPesquisa(id);
  if (!pesquisa) {
    throw new ErroHttp(500, "Pesquisa criada não encontrada");
  }
  return pesquisa;
}

export async function alterarCicloPesquisa(
  sessao: PayloadSessao,
  id: number,
  dados: AcaoPesquisa
): Promise<PesquisaLinha> {
  const pesquisa = await buscarPesquisa(id);
  if (!pesquisa) {
    throw new ErroHttp(404, "Pesquisa não encontrada");
  }
  if (dados.acao === "abrir") {
    if (pesquisa.status !== "rascunho") {
      throw new ErroHttp(409, "Somente pesquisa em rascunho pode ser aberta.");
    }
    if (pesquisa.perguntas === 0) {
      throw new ErroHttp(
        409,
        "A pesquisa precisa de ao menos uma pergunta para ser aberta."
      );
    }
  } else if (pesquisa.status !== "aberta") {
    throw new ErroHttp(409, "Somente pesquisa aberta pode ser encerrada.");
  }

  await comTransacao(sessao.usuario_id, async (cliente) => {
    const mudou =
      dados.acao === "abrir"
        ? await abrirPesquisa(cliente, id)
        : await encerrarPesquisa(cliente, id);
    if (mudou === 0) {
      // Corrida entre o pré-check (fora da transação) e aqui: outra transição
      // já mudou o estado. Sem conferir o rowCount, o audit gravava um evento
      // fantasma de uma mudança que não aconteceu e a tela dizia "sucesso".
      throw new ErroHttp(
        409,
        "A pesquisa mudou de estado enquanto isto era processado. Recarregue a página."
      );
    }
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: dados.acao === "abrir" ? "abertura" : "encerramento",
      tabela: TABELA_PESQUISA,
      registroId: String(id),
      diff: {
        Status: {
          de: pesquisa.status,
          para: dados.acao === "abrir" ? "aberta" : "encerrada",
        },
      },
    });
  });

  const atualizada = await buscarPesquisa(id);
  if (!atualizada) {
    throw new ErroHttp(500, "Pesquisa não encontrada após a mudança de estado");
  }
  return atualizada;
}

// ------------------------------------------------------------------ responder

export interface PerguntaDoFormulario {
  id: number;
  ordem: number;
  enunciado: string;
  tipo: TipoPergunta;
  opcoes: string[] | null;
  obrigatoria: boolean;
}

export interface FormularioPesquisa {
  pesquisa: {
    id: number;
    titulo: string;
    tipo: TipoPesquisa;
    tipo_rotulo: string;
    descricao: string | null;
    inicio: string;
    fim: string;
    anonima: boolean;
  };
  perguntas: PerguntaDoFormulario[];
  respondida: boolean;
  colaborador_vinculado: boolean;
  /** Unidade que acompanhará a resposta — a pessoa tem direito de saber. */
  unidade: string | null;
  dentro_do_periodo: boolean;
  /** Piso vigente, para o aviso de anonimato prometer o número que vale. */
  minimo_amostra: number;
}

export async function obterFormulario(
  sessao: PayloadSessao,
  id: number
): Promise<FormularioPesquisa> {
  const [pesquisa, colaborador] = await Promise.all([
    buscarPesquisa(id),
    buscarColaboradorPorUsuario(sessao.usuario_id),
  ]);
  if (!pesquisa) {
    throw new ErroHttp(404, "Pesquisa não encontrada");
  }
  if (pesquisa.status !== "aberta") {
    throw new ErroHttp(409, "Esta pesquisa não está aberta para resposta.");
  }
  // Gate de elegibilidade no SERVIDOR (eixo 7): quem está fora do alvo não vê
  // nem o formulário. Alvo vazio casa todos (regressão). Sem colaborador não há
  // recorte para casar uma pesquisa mirada.
  if (pesquisaTemAlvo(pesquisa)) {
    const recorte = colaborador
      ? await recorteDoColaborador(colaborador.id)
      : null;
    if (!recorte || !recorteCasaAlvo(pesquisa, recorte)) {
      throw new ErroHttp(403, FORA_DO_ALVO);
    }
  }
  const [perguntas, respondida, minimoAmostra] = await Promise.all([
    listarPerguntas(id),
    colaborador ? jaParticipou(id, colaborador.id) : Promise.resolve(false),
    lerMinimoPorRecorte(),
  ]);
  const hoje = hojeIso();
  return {
    pesquisa: {
      id: pesquisa.id,
      titulo: pesquisa.titulo,
      tipo: pesquisa.tipo,
      tipo_rotulo: ROTULOS_TIPO_PESQUISA[pesquisa.tipo],
      descricao: pesquisa.descricao,
      inicio: pesquisa.inicio,
      fim: pesquisa.fim,
      anonima: pesquisa.anonima,
    },
    perguntas: perguntas.map((pergunta) => ({
      id: pergunta.id,
      ordem: pergunta.ordem,
      enunciado: pergunta.enunciado,
      tipo: pergunta.tipo,
      opcoes: pergunta.opcoes,
      obrigatoria: pergunta.obrigatoria,
    })),
    respondida,
    colaborador_vinculado: colaborador !== null,
    unidade: colaborador ? colaborador.unidade : null,
    dentro_do_periodo: hoje >= pesquisa.inicio && hoje <= pesquisa.fim,
    minimo_amostra: minimoAmostra,
  };
}

interface RespostaPreparada {
  pergunta_id: number;
  valor_numerico: number | null;
  valor_texto: string | null;
}

/**
 * Confere cada resposta contra o TIPO da sua pergunta (a faixa ampla do banco
 * não sabe o tipo) e exige as obrigatórias. Devolve só o que será gravado —
 * pergunta opcional em branco simplesmente não gera linha.
 */
function prepararRespostas(
  perguntas: PerguntaLinha[],
  envio: EnvioRespostas
): RespostaPreparada[] {
  const porId = new Map(perguntas.map((pergunta) => [pergunta.id, pergunta]));
  const preparadas: RespostaPreparada[] = [];
  const vistas = new Set<number>();

  for (const item of envio.respostas) {
    const pergunta = porId.get(item.pergunta_id);
    if (!pergunta) {
      throw new ErroHttpCampo(
        400,
        "Resposta enviada para pergunta que não é desta pesquisa.",
        "pergunta_id"
      );
    }
    if (vistas.has(pergunta.id)) {
      throw new ErroHttpCampo(
        400,
        `Duas respostas para a mesma pergunta: "${pergunta.enunciado}".`,
        "pergunta_id"
      );
    }
    vistas.add(pergunta.id);

    const numero = item.valor_numerico ?? null;
    const texto = item.valor_texto ? item.valor_texto : null;
    const campo = `pergunta_${pergunta.id}`;

    if (pergunta.tipo === "escala_1_5" || pergunta.tipo === "nps_0_10") {
      if (numero === null) {
        if (pergunta.obrigatoria) {
          throw new ErroHttpCampo(
            400,
            `Responda: "${pergunta.enunciado}".`,
            campo
          );
        }
        continue;
      }
      const faixa = FAIXA_NUMERICA[pergunta.tipo];
      if (!faixa || numero < faixa.minimo || numero > faixa.maximo) {
        throw new ErroHttpCampo(
          400,
          `Nota fora da faixa em "${pergunta.enunciado}".`,
          campo
        );
      }
      preparadas.push({
        pergunta_id: pergunta.id,
        valor_numerico: numero,
        valor_texto: null,
      });
      continue;
    }

    if (pergunta.tipo === "escolha_unica") {
      if (texto === null) {
        if (pergunta.obrigatoria) {
          throw new ErroHttpCampo(
            400,
            `Escolha uma opção em "${pergunta.enunciado}".`,
            campo
          );
        }
        continue;
      }
      if (!(pergunta.opcoes ?? []).includes(texto)) {
        throw new ErroHttpCampo(
          400,
          `Opção inválida em "${pergunta.enunciado}".`,
          campo
        );
      }
      preparadas.push({
        pergunta_id: pergunta.id,
        valor_numerico: null,
        valor_texto: texto,
      });
      continue;
    }

    // texto_livre
    if (texto === null) {
      if (pergunta.obrigatoria) {
        throw new ErroHttpCampo(
          400,
          `Escreva sua resposta em "${pergunta.enunciado}".`,
          campo
        );
      }
      continue;
    }
    preparadas.push({
      pergunta_id: pergunta.id,
      valor_numerico: null,
      valor_texto: texto,
    });
  }

  for (const pergunta of perguntas) {
    if (pergunta.obrigatoria && !vistas.has(pergunta.id)) {
      throw new ErroHttpCampo(
        400,
        `Responda: "${pergunta.enunciado}".`,
        `pergunta_${pergunta.id}`
      );
    }
  }
  if (preparadas.length === 0) {
    throw new ErroHttp(400, "Nenhuma resposta preenchida.");
  }
  return preparadas;
}

export async function responder(
  sessao: PayloadSessao,
  id: number,
  envio: EnvioRespostas
): Promise<{ pesquisa_id: number; respostas_gravadas: number }> {
  const [pesquisa, colaborador] = await Promise.all([
    buscarPesquisa(id),
    buscarColaboradorPorUsuario(sessao.usuario_id),
  ]);
  if (!pesquisa) {
    throw new ErroHttp(404, "Pesquisa não encontrada");
  }
  if (pesquisa.status !== "aberta") {
    throw new ErroHttp(409, "Esta pesquisa não está aberta para resposta.");
  }
  const hoje = hojeIso();
  if (hoje < pesquisa.inicio || hoje > pesquisa.fim) {
    throw new ErroHttp(409, "Fora do período de resposta desta pesquisa.");
  }
  if (!colaborador) {
    throw new ErroHttp(
      403,
      "Sua conta não está vinculada a um colaborador — procure o RH."
    );
  }
  // Gate de elegibilidade no SERVIDOR (eixo 7): tela escondida não basta, a
  // gravação também recusa quem está fora do alvo. Alvo vazio casa todos.
  if (pesquisaTemAlvo(pesquisa)) {
    const recorte = await recorteDoColaborador(colaborador.id);
    if (!recorteCasaAlvo(pesquisa, recorte)) {
      throw new ErroHttp(403, FORA_DO_ALVO);
    }
  }
  const perguntas = await listarPerguntas(id);
  const preparadas = prepararRespostas(perguntas, envio);

  try {
    await comTransacao(sessao.usuario_id, async (cliente) => {
      // Revalida SOB TRAVA: entre o pré-check (fora da transação) e aqui um
      // admin pode ter encerrado a pesquisa. Sem isto uma resposta tardia
      // entrava numa pesquisa 'encerrada' cujo resultado já foi declarado
      // definitivo — e, anônima, sem como rastrear ou desfazer.
      const atual = await travarPesquisaParaResposta(cliente, id);
      if (!atual || atual.status !== "aberta") {
        throw new ErroHttp(409, "Esta pesquisa não está aberta para resposta.");
      }
      if (hoje < atual.inicio || hoje > atual.fim) {
        throw new ErroHttp(409, "Fora do período de resposta desta pesquisa.");
      }
      // A participação vem PRIMEIRO: se a pessoa já respondeu, a violação de
      // unicidade aborta a transação antes de gravar qualquer resposta.
      const participacaoId = await inserirParticipacao(
        cliente,
        id,
        colaborador.id
      );
      await inserirRespostas(cliente, id, colaborador.unidade_id, preparadas);
      // Trilha registra QUE participou, jamais O QUE respondeu — conteúdo em
      // audit.alteracao seria canal lateral para quem tem rh.auditar e
      // destruiria o anonimato prometido ao respondente.
      await registrarAlteracao(cliente, {
        usuarioId: sessao.usuario_id,
        papel: sessao.papel,
        acao: "criacao",
        tabela: TABELA_PARTICIPACAO,
        registroId: String(participacaoId),
        diff: { Pesquisa: { de: null, para: pesquisa.titulo } },
      });
    });
  } catch (erro) {
    const violada = violacaoUnica(erro);
    // Duas travas, uma mensagem: a antiga (por vínculo) e a da 0052 (por
    // PESSOA), que é a que dispara quando quem responde de novo é o vínculo
    // aberto por transferência entre empresas do grupo.
    if (
      violada === "participacao_pesquisa_unica" ||
      violada === "participacao_pesquisa_unica_por_pessoa"
    ) {
      throw new ErroHttp(409, "Você já respondeu esta pesquisa.");
    }
    throw erro;
  }
  return { pesquisa_id: id, respostas_gravadas: preparadas.length };
}

// ------------------------------------------------------------------ resultado

export interface OpcaoResultado {
  rotulo: string;
  respostas: number;
  percentual: number;
}

export interface ResultadoPergunta {
  pergunta_id: number;
  ordem: number;
  enunciado: string;
  tipo: TipoPergunta;
  tipo_rotulo: string;
  amostra_suficiente: boolean;
  /** null quando a amostra é insuficiente — nem o valor, nem a contagem. */
  respostas: number | null;
  media: number | null;
  enps: number | null;
  promotores: number | null;
  neutros: number | null;
  detratores: number | null;
  distribuicao: OpcaoResultado[] | null;
  comentarios: string[] | null;
  aviso: string | null;
}

export interface ResultadoUnidade {
  unidade_id: number | null;
  unidade: string;
  amostra_suficiente: boolean;
  respostas: number | null;
  media: number | null;
  enps: number | null;
  aviso: string | null;
}

export interface ResultadoPesquisa {
  pesquisa: PesquisaLinha & { tipo_rotulo: string };
  /**
   * `ativos` é o DENOMINADOR: colaboradores ativos quando alvo vazio, ou
   * elegíveis (DISTINCT pessoa) quando há alvo. `participacoes`/`percentual`
   * vêm NULL quando a pesquisa TEM alvo e a adesão está abaixo do piso k —
   * `amostra_suficiente` é `false` só nesse caso. Sem alvo, sempre visível.
   */
  adesao: {
    participacoes: number | null;
    ativos: number;
    percentual: number | null;
    amostra_suficiente: boolean;
  };
  /** eNPS da pesquisa inteira quando há pergunta de nota 0–10. */
  enps: {
    valor: number | null;
    respostas: number | null;
    promotores: number | null;
    neutros: number | null;
    detratores: number | null;
    amostra_suficiente: boolean;
  } | null;
  perguntas: ResultadoPergunta[];
  por_unidade: ResultadoUnidade[];
  planos: PlanoLinha[];
  minimo_amostra: number;
  texto_amostra_insuficiente: string;
}

export async function obterResultado(
  sessao: PayloadSessao,
  id: number
): Promise<ResultadoPesquisa> {
  const pesquisa = await buscarPesquisa(id);
  if (!pesquisa) {
    throw new ErroHttp(404, "Pesquisa não encontrada");
  }
  if (pesquisa.status === "rascunho") {
    throw new ErroHttp(409, "Pesquisa em rascunho ainda não tem resultado.");
  }
  const temAlvo = pesquisaTemAlvo(pesquisa);
  const [
    perguntas,
    escalas,
    nps,
    escolhas,
    textos,
    unidades,
    planos,
    ativos,
    minimoAmostra,
    elegiveis,
  ] = await Promise.all([
    listarPerguntas(id),
    contagensEscala(id),
    contagensNps(id),
    contagensEscolha(id),
    comentarios(id),
    recortesPorUnidade(id),
    listarPlanos(id),
    contarAtivos(),
    // Política vigente, lida junto com os dados: o resultado é sempre "posição
    // de agora", então o k que vale é o de agora — não há resultado antigo a
    // reproduzir com o k antigo (mesmo raciocínio da 0044).
    lerMinimoPorRecorte(),
    // Denominador da adesão sob alvo: elegíveis vigentes (DISTINCT pessoa).
    temAlvo ? contarElegiveis(alvoDaLinha(pesquisa)) : Promise.resolve(null),
  ]);
  const denominadorAdesao = temAlvo ? (elegiveis ?? 0) : ativos;
  // Sob alvo, a adesão respeita o k igual à tela de recorte: participação de um
  // grupo pequeno é dedução. Sem alvo, adesão da casa inteira, visível como hoje.
  const adesaoOculta = temAlvo && pesquisa.participacoes < minimoAmostra;

  const escalaPorPergunta = new Map(escalas.map((e) => [e.pergunta_id, e]));
  const npsPorPergunta = new Map(nps.map((n) => [n.pergunta_id, n]));

  const resultadoPerguntas: ResultadoPergunta[] = perguntas.map((pergunta) => {
    const base = {
      pergunta_id: pergunta.id,
      ordem: pergunta.ordem,
      enunciado: pergunta.enunciado,
      tipo: pergunta.tipo,
      tipo_rotulo: ROTULOS_TIPO_PERGUNTA[pergunta.tipo],
      media: null as number | null,
      enps: null as number | null,
      promotores: null as number | null,
      neutros: null as number | null,
      detratores: null as number | null,
      distribuicao: null as OpcaoResultado[] | null,
      comentarios: null as string[] | null,
    };

    if (pergunta.tipo === "escala_1_5") {
      const contagem = escalaPorPergunta.get(pergunta.id);
      const total = contagem?.respostas ?? 0;
      const corte = recorte(total, minimoAmostra, () =>
        arredondar((contagem as { soma: number }).soma / total, 2)
      );
      return {
        ...base,
        amostra_suficiente: corte.amostra_suficiente,
        respostas: corte.respostas,
        media: corte.valor,
        aviso: corte.amostra_suficiente ? null : TEXTO_AMOSTRA_INSUFICIENTE,
      };
    }

    if (pergunta.tipo === "nps_0_10") {
      const contagem = npsPorPergunta.get(pergunta.id);
      const total = contagem?.respostas ?? 0;
      const corte = recorte(total, minimoAmostra, () => contagem!);
      return {
        ...base,
        amostra_suficiente: corte.amostra_suficiente,
        respostas: corte.respostas,
        enps: corte.valor
          ? calcularEnps(corte.valor.promotores, corte.valor.detratores, total)
          : null,
        promotores: corte.valor ? corte.valor.promotores : null,
        neutros: corte.valor ? corte.valor.neutros : null,
        detratores: corte.valor ? corte.valor.detratores : null,
        aviso: corte.amostra_suficiente ? null : TEXTO_AMOSTRA_INSUFICIENTE,
      };
    }

    if (pergunta.tipo === "escolha_unica") {
      const linhas = escolhas.filter((e) => e.pergunta_id === pergunta.id);
      const total = linhas.reduce((soma, linha) => soma + linha.respostas, 0);
      const corte = recorte(total, minimoAmostra, () =>
        linhas.map((linha) => ({
          rotulo: linha.opcao,
          respostas: linha.respostas,
          percentual: arredondar((linha.respostas / total) * 100),
        }))
      );
      return {
        ...base,
        amostra_suficiente: corte.amostra_suficiente,
        respostas: corte.respostas,
        distribuicao: corte.valor,
        aviso: corte.amostra_suficiente ? null : TEXTO_AMOSTRA_INSUFICIENTE,
      };
    }

    // texto_livre: comentário é conteúdo anônimo, nunca ligado a pessoa nem a
    // unidade, e só aparece quando a pergunta tem massa suficiente.
    const lista = textos
      .filter((t) => t.pergunta_id === pergunta.id)
      .map((t) => t.texto);
    const corte = recorte(lista.length, minimoAmostra, () => lista);
    return {
      ...base,
      amostra_suficiente: corte.amostra_suficiente,
      respostas: corte.respostas,
      comentarios: corte.valor,
      aviso: corte.amostra_suficiente ? null : TEXTO_AMOSTRA_INSUFICIENTE,
    };
  });

  const totalNps = nps.reduce((soma, linha) => soma + linha.respostas, 0);
  const promotores = nps.reduce((soma, linha) => soma + linha.promotores, 0);
  const neutros = nps.reduce((soma, linha) => soma + linha.neutros, 0);
  const detratores = nps.reduce((soma, linha) => soma + linha.detratores, 0);
  // O piso recebe PESSOAS, não a soma das perguntas de nota: `totalNps` é o
  // denominador do eNPS e continua sendo, mas com duas perguntas de nota ele
  // vale o dobro do número de gente — e era assim que 3 pessoas passavam por 5.
  const corteEnps = recorte(
    pessoasDoRecorte(nps.map((linha) => linha.respostas)),
    minimoAmostra,
    () => calcularEnps(promotores, detratores, totalNps)
  );

  const porUnidade: ResultadoUnidade[] = unidades.map((linha) => {
    // O piso recebe `pessoas_*` (a menor contagem por pergunta da unidade); o
    // CÁLCULO segue usando `respostas_*`, que é o denominador da média e do
    // eNPS. Enquanto as duas grandezas eram a mesma, uma unidade de 3 pessoas
    // com 2 perguntas somava 6 e era publicada sob um piso de 5.
    const corteEscala = recorte(linha.pessoas_escala, minimoAmostra, () =>
      arredondar(linha.soma_escala / linha.respostas_escala, 2)
    );
    const corteUnidadeNps = recorte(linha.pessoas_nps, minimoAmostra, () =>
      calcularEnps(linha.promotores, linha.detratores, linha.respostas_nps)
    );
    const suficiente =
      corteEscala.amostra_suficiente || corteUnidadeNps.amostra_suficiente;
    return {
      unidade_id: linha.unidade_id,
      unidade: linha.unidade,
      amostra_suficiente: suficiente,
      // Soma das respostas apenas quando algum recorte da unidade é
      // divulgável; abaixo do mínimo nem a contagem sai.
      respostas: suficiente
        ? (corteEscala.amostra_suficiente ? linha.respostas_escala : 0) +
          (corteUnidadeNps.amostra_suficiente ? linha.respostas_nps : 0)
        : null,
      media: corteEscala.valor,
      enps: corteUnidadeNps.valor,
      aviso: suficiente ? null : TEXTO_AMOSTRA_INSUFICIENTE,
    };
  });

  return {
    pesquisa: { ...pesquisa, tipo_rotulo: ROTULOS_TIPO_PESQUISA[pesquisa.tipo] },
    adesao: {
      participacoes: adesaoOculta ? null : pesquisa.participacoes,
      ativos: denominadorAdesao,
      percentual:
        adesaoOculta || denominadorAdesao === 0
          ? null
          : arredondar((pesquisa.participacoes / denominadorAdesao) * 100),
      amostra_suficiente: !adesaoOculta,
    },
    enps:
      nps.length === 0
        ? null
        : {
            valor: corteEnps.valor,
            // Divulgável, a contagem que a tela mostra segue sendo a de
            // RESPOSTAS (é o denominador do eNPS). O que mudou é quem abre a
            // porta: o piso agora recebe pessoas.
            respostas: corteEnps.amostra_suficiente ? totalNps : null,
            promotores: corteEnps.amostra_suficiente ? promotores : null,
            neutros: corteEnps.amostra_suficiente ? neutros : null,
            detratores: corteEnps.amostra_suficiente ? detratores : null,
            amostra_suficiente: corteEnps.amostra_suficiente,
          },
    perguntas: resultadoPerguntas,
    por_unidade: porUnidade,
    planos,
    minimo_amostra: minimoAmostra,
    texto_amostra_insuficiente: TEXTO_AMOSTRA_INSUFICIENTE,
  };
}

// ------------------------------------------------------------------ plano de ação

export interface VisaoPlanos {
  planos: PlanoLinha[];
  /** Unidades que a sessão pode escolher: todas (RH/DP) ou só a própria. */
  unidades: UnidadeOpcao[];
  responsaveis: UsuarioOpcao[];
  /** Gestor sem lotação vigente não tem unidade para agir. */
  restrito_a_unidade: number | null;
  status_disponiveis: Array<{ valor: StatusPlano; rotulo: string }>;
}

/**
 * Unidade em que a sessão pode agir. RH/DP (pesquisa.administrar) agem em
 * qualquer uma; o gestor age SOMENTE na unidade da própria lotação vigente.
 */
async function unidadeDeAtuacao(
  sessao: PayloadSessao,
  pode: PermissoesPesquisas
): Promise<number | null> {
  if (pode.administrar) return null;
  const colaborador = await buscarColaboradorPorUsuario(sessao.usuario_id);
  if (!colaborador || colaborador.unidade_id === null) {
    throw new ErroHttp(
      403,
      "Sua conta não tem lotação vigente — o plano de ação é por unidade."
    );
  }
  return colaborador.unidade_id;
}

export async function obterVisaoPlanos(
  sessao: PayloadSessao,
  pesquisaId: number
): Promise<VisaoPlanos> {
  const pesquisa = await buscarPesquisa(pesquisaId);
  if (!pesquisa) {
    throw new ErroHttp(404, "Pesquisa não encontrada");
  }
  const pode = await permissoesPesquisas(sessao);
  const restrita = await unidadeDeAtuacao(sessao, pode);
  const [planos, unidades, responsaveis] = await Promise.all([
    listarPlanos(pesquisaId, restrita === null ? undefined : restrita),
    listarUnidades(),
    listarResponsaveis(),
  ]);
  return {
    planos,
    unidades:
      restrita === null
        ? unidades
        : unidades.filter((unidade) => unidade.id === restrita),
    responsaveis,
    restrito_a_unidade: restrita,
    status_disponiveis: Object.entries(ROTULOS_STATUS_PLANO).map(
      ([valor, rotulo]) => ({ valor: valor as StatusPlano, rotulo })
    ),
  };
}

export async function criarPlano(
  sessao: PayloadSessao,
  pesquisaId: number,
  dados: PlanoNovo
): Promise<PlanoLinha> {
  const pesquisa = await buscarPesquisa(pesquisaId);
  if (!pesquisa) {
    throw new ErroHttp(404, "Pesquisa não encontrada");
  }
  if (pesquisa.status === "rascunho") {
    throw new ErroHttp(
      409,
      "Plano de ação nasce de resultado — abra a pesquisa primeiro."
    );
  }
  const pode = await permissoesPesquisas(sessao);
  const restrita = await unidadeDeAtuacao(sessao, pode);
  let unidadeId = dados.unidade_id ?? null;
  if (restrita !== null) {
    // Gestor: plano é obrigatoriamente da própria unidade — nem empresa toda,
    // nem unidade de terceiro.
    if (unidadeId !== null && unidadeId !== restrita) {
      throw new ErroHttpCampo(
        403,
        "Você só pode criar plano de ação para a sua unidade.",
        "unidade_id"
      );
    }
    unidadeId = restrita;
  }

  const id = await comTransacao(sessao.usuario_id, async (cliente) => {
    const planoId = await inserirPlano(cliente, {
      pesquisa_id: pesquisaId,
      unidade_id: unidadeId,
      titulo: dados.titulo,
      descricao: dados.descricao ?? null,
      responsavel_usuario: dados.responsavel_usuario,
      prazo: dados.prazo,
      criado_por_usuario: sessao.usuario_id,
    });
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "criacao",
      tabela: TABELA_PLANO,
      registroId: String(planoId),
      diff: {
        Pesquisa: { de: null, para: pesquisa.titulo },
        Título: { de: null, para: dados.titulo },
        Prazo: { de: null, para: formatarData(dados.prazo) },
        Unidade: {
          de: null,
          para: unidadeId === null ? "empresa" : String(unidadeId),
        },
      },
    });
    return planoId;
  });
  const plano = await buscarPlano(id);
  if (!plano) {
    throw new ErroHttp(500, "Plano criado não encontrado");
  }
  return plano;
}

export async function atualizarPlano(
  sessao: PayloadSessao,
  planoId: number,
  dados: AtualizacaoPlano
): Promise<PlanoLinha> {
  const plano = await buscarPlano(planoId);
  if (!plano) {
    throw new ErroHttp(404, "Plano de ação não encontrado");
  }
  const pode = await permissoesPesquisas(sessao);
  const restrita = await unidadeDeAtuacao(sessao, pode);
  if (restrita !== null && plano.unidade_id !== restrita) {
    throw new ErroHttp(
      403,
      "Você só pode acompanhar plano de ação da sua unidade."
    );
  }
  if (plano.status === dados.status) {
    return plano;
  }
  await comTransacao(sessao.usuario_id, async (cliente) => {
    await atualizarStatusPlano(cliente, planoId, dados.status);
    await registrarAlteracao(cliente, {
      usuarioId: sessao.usuario_id,
      papel: sessao.papel,
      acao: "atualizacao",
      tabela: TABELA_PLANO,
      registroId: String(planoId),
      diff: {
        Status: {
          de: ROTULOS_STATUS_PLANO[plano.status],
          para: ROTULOS_STATUS_PLANO[dados.status],
        },
      },
    });
  });
  const atualizado = await buscarPlano(planoId);
  if (!atualizado) {
    throw new ErroHttp(500, "Plano não encontrado após a atualização");
  }
  return atualizado;
}

// ------------------------------------------------------------------ indicadores da Central de Metas

/**
 * Fonte do indicador `adesao_pesquisa`: participação da ÚLTIMA pesquisa
 * encerrada (participantes ÷ denominador), em percentual com uma casa. null
 * quando não há pesquisa encerrada ou não há denominador. Só agregado — nunca
 * quem respondeu.
 *
 * Denominador: colaboradores ativos quando a pesquisa não tem alvo (regressão);
 * elegíveis vigentes quando há alvo. E, sob alvo, respeita o k igual à tela: a
 * Central não pode ser a porta dos fundos de "3 de 4 responderam" que a tela de
 * resultado esconde.
 */
export async function valorIndicadorAdesaoPesquisa(): Promise<number | null> {
  const pesquisa = await ultimaPesquisaEncerrada();
  if (!pesquisa) return null;
  const temAlvo = pesquisaTemAlvo(pesquisa);
  const [denominador, minimo] = await Promise.all([
    temAlvo ? contarElegiveis(alvoDaLinha(pesquisa)) : contarAtivos(),
    temAlvo ? lerMinimoPorRecorte() : Promise.resolve(0),
  ]);
  if (temAlvo && pesquisa.participacoes < minimo) return null;
  if (denominador === 0) return null;
  return arredondar((pesquisa.participacoes / denominador) * 100);
}

/**
 * Fonte do indicador `enps`: eNPS da última pesquisa ENCERRADA que tenha
 * pergunta de nota 0–10 respondida, em pontos. Respeita o k-anonimato vigente:
 * abaixo do piso devolve null ("sem dados" na Central), nunca um número de
 * amostra pequena. Se o piso subir, este indicador some da Central junto com o
 * resto — a Central não pode ser a porta dos fundos do que a tela esconde.
 */
export async function valorIndicadorEnps(): Promise<number | null> {
  const [contagem, minimoAmostra] = await Promise.all([
    ultimaContagemEnpsEncerrada(),
    lerMinimoPorRecorte(),
  ]);
  // O piso lê `pessoas` (menor contagem por pergunta de nota), não `respostas`:
  // com duas perguntas nps_0_10 a soma dobra o número de gente, e a Central
  // publicaria o que a tela de resultado esconde.
  if (!contagem || contagem.pessoas < minimoAmostra) return null;
  return calcularEnps(
    contagem.promotores,
    contagem.detratores,
    contagem.respostas
  );
}
