import { consultar } from "../../lib/banco";
import { ErroHttp } from "../../lib/sessao";
import { PayloadSessao } from "../identidade/esquemas";
import { CADENCIA_FEEDBACK_DIAS } from "../colaboradores/esquemas";
import { colaboradorIdDoUsuario } from "../colaboradores/repositorio";
import {
  CicloResumo,
  listarCiclosDoAvaliador,
} from "../avaliacao/repositorio";
import {
  DemandaResumo,
  listarAprovacoesPendentes,
  listarMovimentacoesDoLider,
} from "../demandas/repositorio";
import { nivelAlerta, NivelAlerta } from "../ferias/esquemas";
// A2:a (docs/20) — a equipe do portal é a SUB-ÁRVORE (diretos e indiretos).
// O quadro sai UMA vez por request e a caminhada pura (visitados + teto;
// nunca WITH RECURSIVE) resolve cada equipe consultada nesta tela.
import {
  lideradosDaSubArvore,
  type LinhaSubArvore,
} from "../organograma/esquemas";
import { listarPessoasDoQuadro } from "../organograma/repositorio";
import {
  ANTECEDENCIA_ASO_DIAS,
  ANTECEDENCIA_EXPERIENCIA_DIAS,
  ConsultaPortal,
  Gravidade,
  JANELA_FERIAS_DIAS,
  JANELA_TURNOVER_MESES,
  ROTULO_TREINAMENTOS,
  tempoDeCasa,
} from "./esquemas";
import {
  apurarTurnover,
  buscarGestor,
  GestorPortal,
  LinhaEquipe,
  listarEquipe,
  listarGestoresComEquipe,
  listarMarcosExperiencia,
  listarPeriodosEmRisco,
  listarProgramacoesAprovadas,
  listarVencimentosAso,
  MarcoExperiencia,
  OpcaoGestor,
  PeriodoEmRisco,
  ProgramacaoEquipe,
  VencimentoAso,
} from "./repositorio";

// ==================================================================
// Portal do gestor — consolidação, não módulo novo
// ==================================================================
// Cada bloco é uma VISÃO sobre dado que já existe, com link para a tela do
// módulo que resolve. O portal não muta nada: aprovar férias continua em
// /demandas, responder avaliação em /avaliacoes, registrar feedback na ficha.
//
// Chaves (nenhuma nova): o bloco só entra no payload se a chave DO MÓDULO
// autorizar. Bloco ausente ≠ bloco vazio — a tela distingue "você não tem
// acesso a isso" de "não há nada pendente".

/** Janela de atraso do alerta de experiência: marco que já passou e ainda pesa. */
const ATRASO_EXPERIENCIA_DIAS = 30;

// ------------------------------------------------------------------ permissões por bloco

export interface PermissoesPortal {
  /** Base do portal e do bloco de equipe (também gate da tela). */
  ver_equipe: boolean;
  /** ferias.aprovar (gestor) ou ferias.administrar (DP/RH). */
  ver_ferias: boolean;
  /** Ciclos de avaliação: responder (gestor) / configurar / decidir. */
  ver_avaliacoes: boolean;
  /** demanda.aprovar (gestor) ou demanda.ver.todas (DP/RH/diretoria). */
  ver_pendencias: boolean;
  /** indicador.ver — turnover é indicador. */
  ver_turnover: boolean;
  /** sst.ver, ou o próprio gestor sobre os seus liderados (migration 0014). */
  ver_aso: boolean;
  /** admissao.ver — marcos 45/90 do contrato de experiência. */
  ver_experiencia: boolean;
  /** Alcance de empresa inteira (rh.colaborador.ver.todos): habilita o seletor. */
  escolher_gestor: boolean;
}

const CHAVES = [
  "rh.colaborador.ver",
  "rh.colaborador.ver.todos",
  "ferias.aprovar",
  "ferias.administrar",
  "avaliacao.responder",
  "avaliacao.configurar",
  "avaliacao.decidir",
  "demanda.aprovar",
  "demanda.ver.todas",
  "indicador.ver",
  "sst.ver",
  "admissao.ver",
] as const;

/**
 * Todas as chaves do portal em UMA consulta (mesma técnica de
 * `exigirAlgumaPermissao`): onze `tem_permissao` em paralelo custariam onze
 * conexões do pool por abertura de tela — o portal é a tela mais consultada
 * do líder.
 */
async function chavesDe(usuarioId: number): Promise<Set<string>> {
  const linhas = await consultar<{ chave: string; autorizado: boolean }>(
    `SELECT chave, sistema.tem_permissao($1, chave) AS autorizado
       FROM unnest($2::text[]) AS chave`,
    [usuarioId, [...CHAVES]]
  );
  return new Set(
    linhas.filter((linha) => linha.autorizado).map((linha) => linha.chave)
  );
}

// ------------------------------------------------------------------ blocos

export interface ItemEquipe {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  cargo_nome: string | null;
  /** Lotação — o local físico. */
  unidade: string | null;
  /**
   * Registro — a empresa do grupo do contrato. A liderança atravessa a
   * transferência entre CNPJs (0048 item e), então a equipe do gestor mistura
   * empresas; sem esta coluna ele aprova férias, dá feedback e lê ASO de gente
   * de outro CNPJ sem saber que é de outro CNPJ.
   */
  empresa_nome: string | null;
  /** TRUE quando o contrato do liderado está em empresa diferente da do gestor. */
  outra_empresa: boolean;
  data_admissao: string;
  tempo_de_casa: string;
  /** Só o FATO — sem tipo, sem motivo, sem CID (regra de sigilo do 0007). */
  afastado_hoje: boolean;
  em_ferias_hoje: boolean;
  ferias_ate: string | null;
}

export interface BlocoEquipe {
  total: number;
  afastados: number;
  em_ferias: number;
  liderados: ItemEquipe[];
}

export interface AvisoFerias {
  colaborador_id: number;
  nome_completo: string;
  limite_concessivo: string;
  dias_ate_limite: number;
  nivel: NivelAlerta;
  dias_disponiveis: number;
  dias_programados: number;
  gravidade: Gravidade;
}

export interface BlocoFerias {
  janela_dias: number;
  programadas: ProgramacaoEquipe[];
  em_risco: AvisoFerias[];
}

export interface ItemAvaliacao {
  ciclo_id: number;
  colaborador_id: number;
  colaborador_nome: string;
  tipo: CicloResumo["tipo"];
  status: CicloResumo["status"];
  /** pendente | rascunho | enviada — o estado que interessa ao avaliador. */
  situacao: "pendente" | "rascunho" | "enviada";
  prazo: string;
  dias_para_prazo: number;
  vencido: boolean;
}

export interface BlocoAvaliacoes {
  abertas: ItemAvaliacao[];
  vencidas: number;
}

export interface ItemPendencia {
  demanda_id: number;
  numero: number;
  tipo_nome: string;
  origem: "demanda" | "movimentacao";
  solicitante_nome: string;
  prazo: string;
  dias_ate_prazo: number;
  atrasada: boolean;
}

export interface BlocoPendencias {
  itens: ItemPendencia[];
  atrasadas: number;
}

export interface BlocoTurnover {
  janela_inicio: string;
  janela_fim: string;
  meses: number;
  desligados: number;
  headcount_inicio: number;
  headcount_fim: number;
  headcount_medio: number;
  /** null quando o headcount médio é zero (divisão impossível, não zero falso). */
  percentual: number | null;
  /** A conta escrita, com os números desta equipe — a analista confere. */
  memoria_calculo: string;
}

export interface AlertaFeedback {
  colaborador_id: number;
  nome_completo: string;
  ultimo_feedback_em: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
  gravidade: Gravidade;
}

export interface AlertaExperiencia extends MarcoExperiencia {
  gravidade: Gravidade;
}

export interface AlertaAso extends VencimentoAso {
  gravidade: Gravidade;
}

export interface BlocoAlertas {
  cadencia_dias: number;
  feedback_vencido: AlertaFeedback[];
  /** null quando falta admissao.ver. */
  experiencia: AlertaExperiencia[] | null;
  /** null quando falta sst.ver e o leitor não é o gestor da própria equipe. */
  aso: AlertaAso[] | null;
}

export interface PortalGestor {
  gestor: { colaborador_id: number; nome_completo: string };
  /** Só para quem enxerga todo mundo; null para o gestor no próprio portal. */
  seletor: OpcaoGestor[] | null;
  /** TRUE quando o portal aberto é o do próprio usuário. */
  proprio: boolean;
  pode: PermissoesPortal;
  equipe: BlocoEquipe;
  ferias: BlocoFerias | null;
  avaliacoes: BlocoAvaliacoes | null;
  pendencias: BlocoPendencias | null;
  turnover: BlocoTurnover | null;
  alertas: BlocoAlertas;
  treinamentos: { disponivel: false; nota: string };
}

// ------------------------------------------------------------------ montagem

/**
 * Portal do gestor. `consulta.gestor_id` só é aceito de quem enxerga todo
 * mundo (escopo "todos"); o gestor sempre vê a PRÓPRIA equipe, mesmo que
 * mande outro id na query — a tentativa é ignorada, não negociada.
 */
export async function montarPortalGestor(
  sessao: PayloadSessao,
  consulta: ConsultaPortal
): Promise<PortalGestor> {
  const chaves = await chavesDe(sessao.usuario_id);
  if (!chaves.has("rh.colaborador.ver")) {
    throw new ErroHttp(403, "Sem permissão para ver equipes.");
  }
  // Mesma régua de colaboradores/servico.resolverEscopo: quem alcança a empresa
  // inteira escolhe o gestor; quem alcança só a própria equipe abre o próprio
  // portal. O alcance é a CHAVE, não o nome do papel — ver migration 0039.
  const escolherGestor = chaves.has("rh.colaborador.ver.todos");
  const meuColaboradorId = await colaboradorIdDoUsuario(sessao.usuario_id);
  // O QUADRO sai uma vez por request; cada "equipe" daqui para baixo é a
  // sub-árvore caminhada neste retrato — nunca a relação direta (A2:a).
  const quadro = await listarPessoasDoQuadro();
  const subArvoreDe = (id: number | null): number[] =>
    id === null ? [] : lideradosDaSubArvore(id, quadro);
  const opcoes = escolherGestor
    ? opcoesComContagemDaSubArvore(await listarGestoresComEquipe(), quadro)
    : null;

  const gestorId = escolherGestor
    ? (consulta.gestor_id ??
      // DP/RH/diretoria em geral não lideram ninguém: abrir o portal deles
      // vazio não ajuda. Sem escolha explícita, cai no primeiro gestor com
      // equipe (a menos que o próprio leitor tenha equipe).
      (subArvoreDe(meuColaboradorId).length > 0
        ? meuColaboradorId
        : (opcoes?.[0]?.colaborador_id ?? meuColaboradorId)))
    : meuColaboradorId;
  if (gestorId === null) {
    throw new ErroHttp(
      404,
      "Sua conta não está ligada a uma ficha de colaborador — escolha um gestor para abrir o portal."
    );
  }
  const gestor = await buscarGestor(gestorId);
  if (!gestor) {
    throw new ErroHttp(404, "Gestor não encontrado.");
  }

  const proprio = gestor.colaborador_id === meuColaboradorId;
  const pode = montarPermissoes(chaves, escolherGestor, proprio);

  const equipeIds = subArvoreDe(gestor.colaborador_id);
  const equipe = await listarEquipe(equipeIds);

  const [ferias, avaliacoes, pendencias, turnover, alertas] = await Promise.all([
    pode.ver_ferias ? montarFerias(equipeIds) : null,
    pode.ver_avaliacoes ? montarAvaliacoes(gestor.usuario_id) : null,
    pode.ver_pendencias ? montarPendencias(gestor.usuario_id) : null,
    // Turnover é o ÚNICO bloco na relação direta: conta histórica por data —
    // a sub-árvore de hoje não tem os desligados (ver apurarTurnover).
    pode.ver_turnover ? montarTurnover(gestor.colaborador_id) : null,
    montarAlertas(equipeIds, equipe, pode),
  ]);

  return {
    gestor: {
      colaborador_id: gestor.colaborador_id,
      nome_completo: gestor.nome_completo,
    },
    seletor: opcoes,
    proprio,
    pode,
    equipe: montarEquipe(equipe, gestor.empresa_id),
    ferias,
    avaliacoes,
    pendencias,
    turnover,
    alertas,
    treinamentos: { disponivel: false, nota: ROTULO_TREINAMENTOS },
  };
}

/**
 * O número do seletor tem que bater com a tela: cada opção mostra o tamanho da
 * SUB-ÁRVORE do gestor (diretos e indiretos), não a contagem de diretos que a
 * consulta do seletor devolve. Exportada pura para o teste fixar a semântica.
 */
export function opcoesComContagemDaSubArvore(
  opcoes: OpcaoGestor[],
  quadro: LinhaSubArvore[]
): OpcaoGestor[] {
  return opcoes.map((opcao) => ({
    ...opcao,
    liderados: lideradosDaSubArvore(opcao.colaborador_id, quadro).length,
  }));
}

function montarPermissoes(
  chaves: Set<string>,
  escolherGestor: boolean,
  proprio: boolean
): PermissoesPortal {
  return {
    ver_equipe: true,
    ver_ferias: chaves.has("ferias.aprovar") || chaves.has("ferias.administrar"),
    ver_avaliacoes:
      chaves.has("avaliacao.responder") ||
      chaves.has("avaliacao.configurar") ||
      chaves.has("avaliacao.decidir"),
    ver_pendencias:
      chaves.has("demanda.aprovar") || chaves.has("demanda.ver.todas"),
    ver_turnover: chaves.has("indicador.ver"),
    // Migration 0014 é explícita: "gestor vê STATUS da equipe via
    // relacao_gestor vigente no serviço — nunca conteúdo clínico". Fora desse
    // caso (portal de terceiro), exige a chave do módulo.
    ver_aso: chaves.has("sst.ver") || proprio,
    // Mesma régua do ASO, e por motivo mais forte: a decisão de efetivar ou
    // desligar antes do marco (CLT 445/451) é do GESTOR, não do RH. Exigir
    // `admissao.ver` deixava sem alerta justamente quem tem o prazo correndo —
    // inclusive a diretora de pessoas, avaliadora de ciclos de experiência
    // abertos. `proprio` significa "é o gestor desta equipe" e
    // listarMarcosExperiencia já é escopada pela sub-árvore do gestor: nome e
    // data do marco da própria equipe, nada de terceiro.
    ver_experiencia: chaves.has("admissao.ver") || proprio,
    escolher_gestor: escolherGestor,
  };
}

// ------------------------------------------------------------------ bloco 1

function montarEquipe(
  linhas: LinhaEquipe[],
  empresaDoGestor: number | null
): BlocoEquipe {
  return {
    total: linhas.length,
    afastados: linhas.filter((linha) => linha.afastado_hoje).length,
    em_ferias: linhas.filter((linha) => linha.em_ferias_hoje).length,
    liderados: linhas.map((linha) => ({
      colaborador_id: linha.colaborador_id,
      nome_completo: linha.nome_completo,
      matricula: linha.matricula,
      cargo_nome: linha.cargo_nome,
      unidade: linha.unidade,
      empresa_nome: linha.empresa_nome,
      outra_empresa:
        linha.empresa_id !== null &&
        empresaDoGestor !== null &&
        linha.empresa_id !== empresaDoGestor,
      data_admissao: linha.data_admissao,
      tempo_de_casa: tempoDeCasa(linha.dias_desde_admissao),
      afastado_hoje: linha.afastado_hoje,
      em_ferias_hoje: linha.em_ferias_hoje,
      ferias_ate: linha.ferias_ate,
    })),
  };
}

// ------------------------------------------------------------------ bloco 2

async function montarFerias(equipeIds: number[]): Promise<BlocoFerias> {
  // Sequencial de propósito: o pool é compartilhado por toda a aplicação e o
  // portal já dispara um bloco por chave em paralelo.
  const programadas = await listarProgramacoesAprovadas(
    equipeIds,
    JANELA_FERIAS_DIAS
  );
  const periodos = await listarPeriodosEmRisco(
    equipeIds,
    JANELA_FERIAS_DIAS
  );
  return {
    janela_dias: JANELA_FERIAS_DIAS,
    programadas,
    em_risco: periodos.map(paraAvisoFerias),
  };
}

function paraAvisoFerias(periodo: PeriodoEmRisco): AvisoFerias {
  const nivel = nivelAlerta(periodo.dias_ate_limite);
  return {
    colaborador_id: periodo.colaborador_id,
    nome_completo: periodo.nome_completo,
    limite_concessivo: periodo.limite_concessivo,
    dias_ate_limite: periodo.dias_ate_limite,
    nivel,
    dias_disponiveis: Math.max(periodo.saldo_dias - periodo.dias_gozados, 0),
    dias_programados: periodo.dias_programados,
    // Vencido e "vence em 30 dias sem nada programado" são a mesma urgência:
    // depois do limite o pagamento é EM DOBRO (art. 137).
    gravidade:
      nivel === "vencida" ||
      (nivel === "ate_30" && periodo.dias_programados === 0)
        ? "critico"
        : "atencao",
  };
}

// ------------------------------------------------------------------ bloco 3

async function montarAvaliacoes(
  gestorUsuarioId: number
): Promise<BlocoAvaliacoes> {
  const ciclos = await listarCiclosDoAvaliador(gestorUsuarioId);
  const abertas = ciclos
    .filter((ciclo) => ciclo.status === "aberto" || ciclo.status === "em_avaliacao")
    .map(paraItemAvaliacao);
  return { abertas, vencidas: abertas.filter((item) => item.vencido).length };
}

function paraItemAvaliacao(ciclo: CicloResumo): ItemAvaliacao {
  // Sem avaliação iniciada = pendente; iniciada = rascunho. `enviada` aparece
  // só quando o ciclo ainda está aberto aguardando consolidação do RH.
  const situacao =
    ciclo.avaliacao_estado === null
      ? "pendente"
      : ciclo.avaliacao_estado === "rascunho"
        ? "rascunho"
        : "enviada";
  return {
    ciclo_id: ciclo.id,
    colaborador_id: ciclo.colaborador_id,
    colaborador_nome: ciclo.colaborador_nome,
    tipo: ciclo.tipo,
    status: ciclo.status,
    situacao,
    prazo: ciclo.prazo,
    dias_para_prazo: ciclo.dias_para_prazo,
    // Nota e percentual NÃO entram: são avaliacao.resultado.ver, com trilha.
    vencido: ciclo.dias_para_prazo < 0 && situacao !== "enviada",
  };
}

// ------------------------------------------------------------------ bloco 4

async function montarPendencias(
  gestorUsuarioId: number
): Promise<BlocoPendencias> {
  // Reuso puro do domínio de demandas: aprovações do tipo padrão (inclui a
  // programação de férias, que abre demanda) + etapa de líder pendente na
  // cadeia de promoção/transferência (onda D).
  const demandas = await listarAprovacoesPendentes(gestorUsuarioId);
  const movimentacoes = await listarMovimentacoesDoLider(gestorUsuarioId);
  const itens = [
    ...demandas.map((demanda) => paraItemPendencia(demanda, "demanda")),
    ...movimentacoes.map((demanda) => paraItemPendencia(demanda, "movimentacao")),
  ].sort((a, b) => a.dias_ate_prazo - b.dias_ate_prazo || a.numero - b.numero);
  return { itens, atrasadas: itens.filter((item) => item.atrasada).length };
}

function paraItemPendencia(
  demanda: DemandaResumo,
  origem: "demanda" | "movimentacao"
): ItemPendencia {
  return {
    demanda_id: demanda.id,
    numero: demanda.numero,
    tipo_nome: demanda.tipo_nome,
    origem,
    solicitante_nome: demanda.solicitante_nome,
    prazo: demanda.prazo,
    dias_ate_prazo: demanda.dias_ate_prazo,
    atrasada: demanda.dias_ate_prazo < 0,
  };
}

// ------------------------------------------------------------------ bloco 5

async function montarTurnover(
  gestorColaboradorId: number
): Promise<BlocoTurnover> {
  const apuracao = await apurarTurnover(
    gestorColaboradorId,
    JANELA_TURNOVER_MESES
  );
  const medio = (apuracao.headcount_inicio + apuracao.headcount_fim) / 2;
  const percentual =
    medio > 0 ? Math.round((apuracao.desligados / medio) * 1000) / 10 : null;
  const memoria =
    medio > 0
      ? `${apuracao.desligados} desligado(s) ÷ headcount médio ${formatarNumero(medio)} ` +
        `((${apuracao.headcount_inicio} em ${formatarData(apuracao.janela_inicio)} + ` +
        `${apuracao.headcount_fim} em ${formatarData(apuracao.janela_fim)}) ÷ 2) × 100 = ` +
        `${formatarNumero(percentual ?? 0)}%`
      : "Headcount médio zero na janela — sem denominador não há percentual (e não é 0%).";
  return {
    janela_inicio: apuracao.janela_inicio,
    janela_fim: apuracao.janela_fim,
    meses: JANELA_TURNOVER_MESES,
    desligados: apuracao.desligados,
    headcount_inicio: apuracao.headcount_inicio,
    headcount_fim: apuracao.headcount_fim,
    headcount_medio: medio,
    percentual,
    memoria_calculo: memoria,
  };
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ------------------------------------------------------------------ bloco 6

async function montarAlertas(
  equipeIds: number[],
  equipe: LinhaEquipe[],
  pode: PermissoesPortal
): Promise<BlocoAlertas> {
  const experiencia = pode.ver_experiencia
    ? await listarMarcosExperiencia(
        equipeIds,
        ANTECEDENCIA_EXPERIENCIA_DIAS,
        ATRASO_EXPERIENCIA_DIAS
      )
    : null;
  const aso = pode.ver_aso
    ? await listarVencimentosAso(equipeIds, ANTECEDENCIA_ASO_DIAS)
    : null;
  return {
    cadencia_dias: CADENCIA_FEEDBACK_DIAS,
    feedback_vencido: equipe
      .filter((linha) => diasSemFeedback(linha) > CADENCIA_FEEDBACK_DIAS)
      .map((linha) => ({
        colaborador_id: linha.colaborador_id,
        nome_completo: linha.nome_completo,
        ultimo_feedback_em: linha.ultimo_feedback_em,
        dias_desde_feedback: linha.dias_desde_feedback,
        dias_desde_admissao: linha.dias_desde_admissao,
        // Dobro da cadência sem conversa formal é outro patamar de risco.
        gravidade:
          diasSemFeedback(linha) > CADENCIA_FEEDBACK_DIAS * 2
            ? ("critico" as Gravidade)
            : ("atencao" as Gravidade),
      }))
      .sort((a, b) => diasOrdenacao(b) - diasOrdenacao(a)),
    experiencia: experiencia?.map(paraAlertaExperiencia) ?? null,
    aso: aso?.map(paraAlertaAso) ?? null,
  };
}

/** Nunca teve feedback: a régua conta desde a admissão (mesma de /colaboradores). */
function diasSemFeedback(linha: LinhaEquipe): number {
  return linha.dias_desde_feedback ?? linha.dias_desde_admissao;
}

function diasOrdenacao(alerta: AlertaFeedback): number {
  return alerta.dias_desde_feedback ?? alerta.dias_desde_admissao;
}

function paraAlertaExperiencia(marco: MarcoExperiencia): AlertaExperiencia {
  return {
    ...marco,
    // A decisão de efetivar/desligar tem de sair ANTES do marco (CLT 445/451):
    // marco já vencido é crítico, chegando é atenção.
    gravidade: marco.dias_para_marco < 0 ? "critico" : "atencao",
  };
}

function paraAlertaAso(vencimento: VencimentoAso): AlertaAso {
  return {
    ...vencimento,
    // Sem nenhum ASO é pior que vencido: não há sequer exame admissional.
    gravidade:
      vencimento.dias_ate_validade === null || vencimento.dias_ate_validade < 0
        ? "critico"
        : "atencao",
  };
}

export type { GestorPortal, OpcaoGestor, ProgramacaoEquipe };
