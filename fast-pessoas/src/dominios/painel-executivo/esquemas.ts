// Contrato de SAÍDA do Dashboard Executivo.
//
// Este domínio não tem entrada: a rota é um GET sem parâmetro e o recorte é
// sempre "a empresa inteira, hoje, contra os últimos 12 meses" — por decisão de
// escopo, não por esquecimento (filtro por unidade e por período livre estão
// registrados como evolução no fim deste arquivo). Por isso `esquemas.ts` aqui
// carrega o CONTRATO e os rótulos, e não um objeto zod de validação.
//
// Regra de ouro do painel, que vale para cada tipo abaixo: número de diretoria
// vem com PROCEDÊNCIA. Todo card diz o valor, o PERÍODO a que se refere e A
// CONTA que o produziu. Um número sem origem não serve para decidir.

export const CHAVE_PAINEL = "painel.executivo.ver";

/**
 * O card de custo de pessoal é condicionado a esta chave DENTRO do painel:
 * remuneração não vaza por painel gerencial. Quem não a tem recebe o card
 * bloqueado — sem valor, sem máscara, sem total agregado (ver `CardBloqueado`).
 */
export const CHAVE_FOLHA = "folha.ver";

/** Encargo modelado na folha própria F1 (rh_folha) — ver `conta` do card. */
export const RUBRICA_FGTS = "3001";

// ------------------------------------------------------------------ micro-série

export type UnidadeSerie = "qtd" | "%" | "R$" | "nota";

export interface PontoSerie {
  /** Competência do ponto no formato AAAA-MM (America/Sao_Paulo). */
  mes: string;
  /** null = mês sem dado apurável (não é zero). */
  valor: number | null;
  /** Mês corrente ainda em curso — a tela marca para não comparar maçã com laranja. */
  parcial: boolean;
}

export type DirecaoTendencia = "sobe" | "desce" | "estavel" | "indefinida";

export interface Tendencia {
  direcao: DirecaoTendencia;
  /** Sempre explica a comparação feita (ex.: "62 hoje contra 61 em jul/2025"). */
  texto: string;
  /**
   * Se subir é bom para ESTE indicador. Turnover e absenteísmo sobem para o
   * lado errado; a tela colore a seta com isto, nunca com o sinal do delta.
   */
  subir_e_bom: boolean;
}

export interface MicroSerie {
  rotulo: string;
  unidade: UnidadeSerie;
  pontos: PontoSerie[];
  tendencia: Tendencia;
}

// ------------------------------------------------------------------ cards

/** Recorte agregado com supressão de recorte pequeno (mesma regra de /relatorios). */
export interface RecortePainel {
  chave: string;
  rotulo: string;
  /** null = recorte suprimido por ser pequeno demais para publicar. */
  quantidade: number | null;
  suprimido: boolean;
}

export interface LinhaContagem {
  rotulo: string;
  quantidade: number;
}

/**
 * Card que a SESSÃO não pode ver. Ausência, não máscara: não existe campo de
 * valor neste tipo — quem recebe isto não recebeu número nenhum.
 */
export interface CardBloqueado {
  disponivel: false;
  bloqueio: "permissao";
  requer_chave: string;
  motivo: string;
}

/** Card que o SISTEMA ainda não sabe calcular (falta módulo/fonte). */
export interface CardSemFonte {
  disponivel: false;
  bloqueio: "sem_fonte";
  motivo: string;
}

/**
 * Desenvolvimento das pessoas — vive no PDI. Substitui o antigo "ROI de
 * treinamento" (que dependia do T&D no Sults): agora há fonte de verdade.
 */
export interface CardDesenvolvimento {
  disponivel: true;
  planos_ativos: number;
  pessoas: number;
  acoes_total: number;
  acoes_concluidas: number;
  acoes_andamento: number;
}

export interface CardHeadcount {
  periodo: string;
  conta: string;
  ativos: number;
  por_unidade: LinhaContagem[];
  sem_lotacao: number;
  por_vinculo: LinhaContagem[];
  variacao_12m: {
    referencia: string;
    ativos_antes: number;
    delta: number;
    percentual: number;
  };
  serie: MicroSerie;
}

export interface CardTurnover {
  periodo: string;
  conta: string;
  percentual: number;
  desligados: number;
  admitidos: number;
  headcount_inicio: number;
  headcount_fim: number;
  headcount_medio: number;
  serie: MicroSerie;
}

export interface CustoUnidade {
  unidade: string;
  centro_custo: string;
  pessoas: number;
  proventos: number;
  encargo_fgts: number;
  total: number;
}

export interface CardCustoPessoal {
  disponivel: true;
  periodo: string;
  conta: string;
  competencia: { ano: number; mes: number; fechada_em: string };
  pessoas: number;
  proventos: number;
  encargo_fgts: number;
  total: number;
  /** Diferença entre o total da competência e a soma dos recortes com lotação. */
  sem_lotacao: number;
  por_unidade: CustoUnidade[];
  serie: MicroSerie;
}

export interface CasoContratacao {
  requisicao_id: number;
  cargo_nome: string;
  unidade: string;
  aprovada_em: string;
  admitido_em: string;
  dias: number;
}

export interface CardTempoContratacao {
  periodo: string;
  conta: string;
  /** null = nenhum caso fechado ponta a ponta na janela. */
  dias_medio: number | null;
  casos: number;
  detalhe: CasoContratacao[];
  /** Perna só de R&S, com amostra maior: requisição aprovada → vaga fechada. */
  perna_recrutamento: { vagas: number; dias_medio: number | null };
}

export interface CardAbsenteismo {
  periodo: string;
  conta: string;
  percentual: number;
  dias_afastamento: number;
  dias_uteis_previstos: number;
  serie: MicroSerie;
}

export interface CardPromocoes {
  periodo: string;
  conta: string;
  promocoes: number;
  transferencias: number;
  serie: MicroSerie;
}

export interface CardDiversidade {
  periodo: string;
  conta: string;
  total_quadro: number;
  com_data_nascimento: number;
  sem_data_nascimento: number;
  minimo_por_recorte: number;
  por_genero: RecortePainel[];
  por_faixa_idade: RecortePainel[];
  serie: MicroSerie;
}

export interface CardClima {
  periodo: string;
  conta: string;
  media_checkin: number | null;
  respostas_checkin: number;
  enps: {
    pesquisa: string;
    encerrada_em: string;
    /** null = amostra abaixo do mínimo; então promotores/detratores também são null. */
    pontos: number | null;
    respostas: number | null;
    promotores: number | null;
    detratores: number | null;
    minimo_amostra: number;
  } | null;
  serie: MicroSerie;
}

export interface FaixaPerformance {
  rotulo: string;
  minimo: number;
  maximo: number;
  quantidade: number;
  percentual: number;
}

export interface CardPerformance {
  periodo: string;
  conta: string;
  safra: string | null;
  avaliacoes: number;
  faixas: FaixaPerformance[];
  /** Por que este card não tem micro-série (honestidade sobre a base). */
  sem_serie: string;
}

export interface PainelExecutivo {
  /** Data de referência do painel (America/Sao_Paulo, AAAA-MM-DD). */
  hoje: string;
  janela_12m: { inicio: string; fim: string };
  headcount: CardHeadcount;
  turnover: CardTurnover;
  /**
   * Três estados, e a tela distingue os três: número (tem folha.ver e existe
   * competência fechada), BLOQUEADO por permissão, ou SEM FONTE quando nenhuma
   * competência foi fechada ainda. Falta de dado não pode ser apresentada como
   * falta de permissão: mandaria quem já tem a chave caçar um problema de acesso
   * que não existe.
   */
  custo_pessoal: CardCustoPessoal | CardBloqueado | CardSemFonte;
  tempo_contratacao: CardTempoContratacao;
  absenteismo: CardAbsenteismo;
  promocoes: CardPromocoes;
  diversidade: CardDiversidade;
  clima: CardClima;
  performance: CardPerformance;
  desenvolvimento: CardDesenvolvimento;
}

// ------------------------------------------------------------------ rótulos

export const ROTULOS_VINCULO: Record<string, string> = {
  clt: "CLT",
  estagiario: "Estagiário",
  aprendiz: "Aprendiz",
  pj: "PJ",
  temporario: "Temporário",
};

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-07" → "jul/2026". Usado no texto das contas e nos rótulos da série. */
export function competenciaCurta(mes: string): string {
  const [ano, mm] = mes.split("-");
  const indice = Number(mm) - 1;
  if (!ano || indice < 0 || indice > 11) return mes;
  return `${MESES_CURTOS[indice]}/${ano}`;
}

/** "2026-07-29" → "29/07/2026". A data já vem pronta do banco em fuso de SP. */
export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

// ------------------------------------------------------------------ evolução
// Registrado, não escondido — o que ficou fora deste corte e por quê:
//  • FILTRO POR UNIDADE no painel inteiro: hoje cada card traz o recorte por
//    unidade onde ele existe (headcount, custo), mas não há um seletor global.
//    Turnover e absenteísmo por unidade exigem decidir a unidade DA ÉPOCA do
//    fato (a lotação muda), e isso é modelagem, não tela.
//  • PERÍODO LIVRE (de/até): a janela é fixa em 12 meses porque é o que a
//    diretoria compara. Período livre pede persistir a escolha e recalcular
//    todas as bases móveis.
//  • QUADRO APROVADO × REALIZADO: falta o conceito de headcount orçado, que
//    ainda não existe no modelo (mesma lacuna já registrada em /relatorios).
//  • ESCALA NO DENOMINADOR DO ABSENTEÍSMO: o card já desconta os feriados de
//    rh.feriado (0027), mas o "dia esperado de trabalho" continua sendo seg–sex
//    para todo mundo. Quem está em 6x1 ou 12x36 tem sábado, domingo e turno de
//    12h tratados como se não existissem. Derivar o dia esperado da escala
//    (rh.escala_colaborador) é conta do motor do ponto; consumi-la aqui melhora
//    o denominador sem mudar a fórmula.
//  • DESENVOLVIMENTO: o T&D vive no PDI (decisão do dono, 13/08/2026). O card
//    mostra planos ativos e o andamento das ações — ver `desenvolvimento`.
