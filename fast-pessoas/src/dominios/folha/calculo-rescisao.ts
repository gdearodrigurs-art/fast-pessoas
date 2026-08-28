// Motor de cálculo de RESCISÃO — 3º estágio da lane Folha (onda 3). PURO:
// sem IO, sem banco, sem relógio — tudo que a conta precisa entra pela
// EntradaMotorRescisao e tudo que sai é explicável pela memória de cada item.
//
// MOLDE: calculo-ferias.ts / calculo-13.ts (que moldam calculo.ts). As regras
// de precisão são as MESMAS, copiadas porque são a regra da casa (0013 +
// bateria caso_teste_folha):
// • Dinheiro trafega em CENTAVOS INTEIROS na borda (entrada e saída).
// • Intermediários NÃO são arredondados; meio-para-cima (half-up) uma única
//   vez, no valor final de cada item. Item com valor zero não é gravado.
//
// ESTE MOTOR CONSOME OS DOIS ANTERIORES — não os reimplementa:
// • Férias vencidas e proporcionais: REUSO de calcularFerias com modalidade
//   "indenizadas" (0136/0137 com base zero — decisão registrada na 0092,
//   Súmula 386 STJ). Quando os dias caem fora da janela de GOZO do art. 134
//   (fração de avo, saldo < 5 dias), a MESMA fórmula do motor de férias é
//   aplicada diretamente — pagamento não é gozo, e a memória diz qual caminho
//   valeu.
// • 13º proporcional: REUSO de calcularDecimo (parcela 2 — 0138/1602/2003/
//   2004, tributação em separado). Os avos são limitados ATÉ A DATA do
//   término, SEM projeção a 31/12: o motor de rescisão calcula quantos avos a
//   projeção somaria além do término e os retira pelo parâmetro
//   avos_afastamento do motor de 13º — o mapeamento fica explicado no aviso e
//   na memória.
//
// O QUE ENTRA é decidido pelo TIPO de desligamento (valores REAIS de
// rh.tipo_desligamento_versao.tipo, migração 0008):
//   sem_justa_causa      → tudo: saldo, aviso, férias vencidas + proporcionais
//                          + 1/3, 13º proporcional, multa de 40% do FGTS.
//   pedido_demissao      → sem aviso indenizado a favor e sem multa; o
//                          desconto do aviso não cumprido (art. 487 §2º) NÃO é
//                          emitido — default conservador com AVISO.
//   justa_causa          → só saldo + férias VENCIDAS + 1/3 (proporcionais:
//                          art. 146 §ú c/ Súmula 171 TST; 13º: Lei 4.090/62
//                          art. 3º, a contrario — não devidos).
//   acordo_484a          → metade do aviso indenizado (CLT art. 484-A, I, a) e
//                          multa de 20% (art. 484-A, I, b).
//   termino_experiencia / termino_temporario
//                        → sem aviso e sem multa no término NORMAL do contrato
//                          a termo; rescisão ANTECIPADA (art. 479/480) tem
//                          indenização própria, fora do escopo — AVISO.
//
// DEFAULTS CONSERVADORES COM AVISO (molde pendências #17/#19):
// • saldo_fgts_centavos é EXTERNO (o sistema não controla a conta vinculada):
//   ausente → a multa sai SÓ sobre os depósitos da própria rescisão + AVISO
//   (a base da multa inclui esses depósitos — Lei 8.036/90, art. 18, §1º).
// • Projeção do aviso indenizado no tempo de serviço (art. 487 §1º) NÃO é
//   aplicada aos avos de férias/13º — AVISO.
// • Férias vencidas além do limite concessivo NÃO saem em dobro (art. 137) —
//   AVISO quando o caso aparece.
// • Médias de variáveis: parâmetro opcional (importadores pendentes) — AVISO.
//
// TRIBUTAÇÃO: INSS/IRRF do mês da rescisão SÓ sobre o saldo de salário (1701,
// pela incidência da versão vigente); o 13º é tributado EM SEPARADO dentro do
// próprio reuso (Lei 8.212/91 art. 28 §7º; RIR/2018 art. 700). As verbas
// indenizatórias ficam FORA das bases, cada exclusão citada na memória:
// • Aviso indenizado — INSS: STJ REsp 1.230.957/RS (repetitivo); IRRF: Lei
//   7.713/88, art. 6º, V. FGTS incide (Súmula 305 TST) mas fica fora do
//   escopo INSS/IRRF desta prévia (flag registrada na 0097).
// • Férias indenizadas + 1/3 — INSS: Lei 8.212/91 art. 28 §9º "d" e Súmula
//   386 STJ; IRRF: Súmula 386 STJ (isenção das indenizadas e do adicional).
// • Multa do FGTS — indenização da Lei 8.036/90 art. 18 §1º; IRRF isento
//   (Lei 7.713/88, art. 6º, V); não é salário-de-contribuição.

import {
  ErroMotor,
  ItemMotor,
  ParametrosFolhaMotor,
  RubricaMotor,
  TabelaInssMotor,
  TabelaIrrfMotor,
} from "./calculo";
import { calcularFerias } from "./calculo-ferias";
import {
  AVISO_AFASTAMENTO_NAO_CONSIDERADO,
  AVISO_AVOS_PROJETADOS,
  AVISO_MEDIAS_PENDENTES_DECIMO,
  calcularDecimo,
} from "./calculo-13";
import {
  CODIGO_ADICIONAL_FERIAS,
  CODIGO_AVISO_INDENIZADO,
  CODIGO_DECIMO,
  CODIGO_FERIAS,
  CODIGO_INSS,
  CODIGO_IRRF,
  CODIGO_MULTA_FGTS,
  CODIGO_SALDO_SALARIO,
} from "./esquemas";
import { apurarSuspensaoNaCompetencia } from "./suspensao";
import { DIAS_GOZO_MAXIMO, DIAS_GOZO_MINIMO } from "../ferias/esquemas";

// ------------------------------------------------------------------ contratos

/** Valores REAIS de rh.tipo_desligamento_versao.tipo (migração 0008). */
export const TIPOS_DESLIGAMENTO_RESCISAO = [
  "pedido_demissao",
  "sem_justa_causa",
  "justa_causa",
  "acordo_484a",
  "termino_experiencia",
  "termino_temporario",
] as const;

export type TipoDesligamentoRescisao =
  (typeof TIPOS_DESLIGAMENTO_RESCISAO)[number];

/** Valores REAIS de rh.processo_desligamento.modalidade_aviso (0008). */
export const MODALIDADES_AVISO_RESCISAO = [
  "trabalhado",
  "indenizado",
  "dispensado",
  "nao_aplicavel",
] as const;

export type ModalidadeAvisoRescisao =
  (typeof MODALIDADES_AVISO_RESCISAO)[number];

/** Um período aquisitivo VENCIDO (fim <= término) com saldo a indenizar. */
export interface FeriasVencidasEntrada {
  periodo_inicio: string;
  periodo_fim: string;
  /** Saldo em dias (rh.periodo_aquisitivo.saldo_dias — NUMERIC(4,1): meio dia existe). */
  saldo_dias: number;
  /** Para o AVISO do art. 137 (dobra não aplicada) — opcional. */
  limite_concessivo?: string | null;
}

export interface EntradaMotorRescisao {
  /** Valor real do tipo congelado no processo (rh.tipo_desligamento_versao.tipo). */
  tipo_desligamento: string;
  /** Valor real de rh.processo_desligamento.iniciativa — vai para a memória. */
  iniciativa: string;
  modalidade_aviso: string;
  data_admissao: string;
  data_comunicacao: string;
  /** Término efetivo (processo encerrado) ou projetado (em andamento). */
  data_termino: string;
  /** Salário vigente na data do término, em centavos inteiros. */
  salario_base_centavos: number;
  dependentes_irrf: number;
  /**
   * MÉDIA MENSAL de variáveis (comissões, HE…), em centavos inteiros.
   * null/ausente = importadores pendentes: entra 0 e a saída avisa.
   */
  media_variaveis_centavos?: number | null;
  /** Períodos aquisitivos VENCIDOS com saldo — quem separa é o serviço. */
  ferias_vencidas: FeriasVencidasEntrada[];
  /**
   * Início do período aquisitivo EM CURSO na data do término — dá os avos das
   * férias proporcionais. null/ausente = dado indisponível: a verba não é
   * calculada e a saída avisa (o sistema é o dono de rh.periodo_aquisitivo).
   */
  periodo_aquisitivo_em_curso_inicio?: string | null;
  /**
   * Saldo da conta vinculada do FGTS, em centavos inteiros — dado EXTERNO
   * (extrato da Caixa). null/ausente = a multa sai SÓ sobre os depósitos da
   * própria rescisão + AVISO (decisão registrada, molde das médias).
   */
  saldo_fgts_centavos?: number | null;
  /**
   * Adiantamento de 13º EFETIVAMENTE PAGO no ano, em centavos inteiros.
   * null/ausente = considerado NÃO pago (nenhum desconto) + AVISO.
   */
  adiantamento_decimo_pago_centavos?: number | null;
  /** Avos de 13º perdidos por afastamento sem remuneração no ano (0–12). */
  avos_afastamento_13?: number | null;
  rubricas: RubricaMotor[];
  tabela_inss: TabelaInssMotor;
  tabela_irrf: TabelaIrrfMotor;
  parametros: ParametrosFolhaMotor;
}

export interface DireitosRescisao {
  tipo: TipoDesligamentoRescisao;
  /** O aviso prévio é devido AO empregado? */
  aviso_a_favor: boolean;
  /** 1 no caso geral; 0.5 no acordo do art. 484-A (inciso I, "a"). */
  fator_aviso: number;
  ferias_proporcionais: boolean;
  decimo_proporcional: boolean;
  /** 40 (Lei 8.036/90 art. 18 §1º), 20 (art. 484-A, I, "b") ou 0. */
  multa_fgts_percentual: number;
  citacao: string;
}

export interface ResultadoMotorRescisao {
  itens: ItemMotor[];
  /** Avisos de escopo e exclusões — a tela e a API os mostram junto do resultado. */
  avisos: string[];
  /** O mapa de direitos aplicado — por que cada verba entrou ou não. */
  direitos: DireitosRescisao;
  dias_saldo_salario: number;
  /** Dias do aviso pela Lei 12.506 (30 + 3/ano, teto 90); 0 sem aviso a favor. */
  dias_aviso_proporcional: number;
  /** Dias do aviso efetivamente INDENIZADOS (no trabalhado, só o excedente). */
  dias_aviso_indenizados: number;
  avos_ferias_proporcionais: number;
  /** Avos de 13º até a data do término (0 quando o 13º não é devido). */
  avos_decimo: number;
  total_proventos_centavos: number;
  total_descontos_centavos: number;
  liquido_centavos: number;
  /** Bases do MÊS da rescisão (saldo de salário) — o 13º tem base própria. */
  base_inss_centavos: number;
  base_irrf_centavos: number;
  base_inss_decimo_centavos: number;
  base_irrf_decimo_centavos: number;
}

// ------------------------------------------------------------------ avisos

export const AVISO_MEDIAS_PENDENTES_RESCISAO =
  "médias não disponíveis — importadores pendentes: rescisão calculada sem médias de variáveis (comissões, horas extras)";

export const AVISO_FGTS_SALDO_EXTERNO =
  "saldo do FGTS não informado — a multa rescisória saiu SÓ sobre os depósitos da própria rescisão: o saldo da conta vinculada é dado externo (extrato da Caixa); informe saldo_fgts_centavos para a base incluir o que já está depositado";

export const AVISO_AVISO_TRABALHADO_NO_SALDO =
  "aviso prévio TRABALHADO: os 30 primeiros dias são remunerados como salário do período (folha do mês/saldo de salário) — só os dias proporcionais excedentes da Lei 12.506, que não podem ser exigidos em trabalho, saem indenizados";

export const AVISO_DISPENSA_DE_CUMPRIMENTO =
  "cumprimento do aviso dispensado pelo empregador: o pagamento continua devido (Súmula 276 do TST) — aviso emitido como indenizado";

export const AVISO_DESCONTO_AVISO_NAO_EMITIDO =
  "pedido de demissão sem cumprimento do aviso: o DESCONTO do aviso pelo empregado (art. 487 §2º da CLT) NÃO foi emitido — decisão conservadora registrada; se a empresa descontar, é lançamento do DP";

export const AVISO_MODALIDADE_SEM_AVISO =
  "modalidade de aviso 'não aplicável' num tipo que dá direito a aviso — nenhum aviso indenizado emitido; confira o processo de desligamento";

export const AVISO_PROJECAO_AVISO_NAO_APLICADA =
  "projeção do aviso indenizado no tempo de serviço (art. 487 §1º da CLT) NÃO aplicada aos avos de férias e 13º — decisão conservadora registrada; confirmar com o DP/contador";

export const AVISO_DOBRA_ART137_NAO_APLICADA =
  "há férias vencidas além do limite concessivo e a dobra do art. 137 da CLT NÃO foi aplicada — decisão conservadora registrada; confirmar com o DP/contador";

export const AVISO_PERIODO_EM_CURSO_AUSENTE =
  "período aquisitivo em curso não informado — férias proporcionais não calculadas: confira os períodos aquisitivos do colaborador";

export const AVISO_AVOS_ATE_A_DATA =
  "13º proporcional com avos ATÉ A DATA do término, sem projeção a 31/12 — o motor de rescisão retira os avos posteriores ao término pelo parâmetro de redução do motor de 13º (o reuso fica explicado na memória do item)";

export const AVISO_ADIANTAMENTO_13_NAO_INFORMADO =
  "adiantamento de 13º considerado NÃO PAGO (nenhum desconto emitido) — se houve adiantamento no ano, informe o valor pago para a compensação entrar na conta";

export const AVISO_AFASTAMENTO_13_NAO_CONSIDERADO =
  "afastamentos sem remuneração não considerados no 13º — os avos só são reduzidos quando informados na entrada (dado ainda não disponível ao motor)";

export const AVISO_RESCISAO_ISOLADA =
  "prévia de rescisão: INSS e IRRF do mês apurados sobre o saldo de salário desta prévia — variáveis do mês (comissões, HE) entram quando a rescisão integrar a competência; FGTS do mês fica fora do escopo (INSS/IRRF)";

export const AVISO_CONTRATO_A_TERMO =
  "término normal de contrato a termo: sem aviso prévio e sem multa do FGTS; rescisão ANTECIPADA (arts. 479/480 da CLT) tem indenização própria, fora do escopo desta prévia";

// ------------------------------------------------------------------ aritmética
// Cópia fiel de folha/calculo.ts — é a regra de precisão da casa. As funções
// são privadas lá de propósito (cada motor carrega a própria cópia auditável).

/**
 * Meio-para-cima no centavo. O epsilon (1e-6) só absorve o ruído binário das
 * divisões: a menor distância real entre um intermediário e a fronteira .5 é
 * ordens de grandeza acima do epsilon.
 */
function arredondarCentavos(valor: number): number {
  return Math.floor(valor + 0.5 + 1e-6);
}

/** Percentual como razão inteira: centavos × (alíquota × 10⁴) ÷ 10⁶. */
function aplicarPercentual(centavos: number, aliquota: number): number {
  return (centavos * Math.round(aliquota * 10_000)) / 1_000_000;
}

function reais(centavos: number): number {
  return centavos / 100;
}

/** Intermediário sem arredondar, exposto na memória com 4 casas de real. */
function reaisIntermediario(centavos: number): number {
  return Math.round(centavos * 100) / 10_000;
}

// ------------------------------------------------------------------ calendário
// Aritmética de calendário em UTC de propósito (o mesmo desenho de
// dataReferenciaCompetencia e do motor de 13º): conta de dias civis, não
// instante — nada de fuso empurrando o dia.

/** Data civil real (recusa 2026-02-30) — a trava ida-e-volta de lib/data-civil. */
function dataCivilValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return (
    !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
  );
}

function diasNoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte = último dia deste mês.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function dois(n: number): string {
  return String(n).padStart(2, "0");
}

/** Dias de vínculo dentro do mês civil (ano, mes), no intervalo [inicio, fim]. */
function diasDeVinculoNoMes(
  ano: number,
  mes: number,
  inicio: string,
  fim: string
): number {
  const primeiro = `${ano}-${dois(mes)}-01`;
  const ultimo = `${ano}-${dois(mes)}-${dois(diasNoMes(ano, mes))}`;
  const de = inicio > primeiro ? inicio : primeiro;
  const ate = fim < ultimo ? fim : ultimo;
  if (de > ate) return 0;
  return Number(ate.slice(8, 10)) - Number(de.slice(8, 10)) + 1;
}

/** Avo conta com fração de mês SUPERIOR A 14 DIAS (= 15 ou mais) — a régua
 *  dos dois motores reusados (Lei 4.090/62 art. 1º §1º; CLT art. 146, §ú). */
const DIAS_MINIMOS_AVO_RESCISAO = 15;

/**
 * Avos do 13º no ano civil: MESES DO CALENDÁRIO com ≥ 15 dias de vínculo no
 * intervalo [inicio, fim] — espelho exato de detalharAvos do motor de 13º
 * (Lei 4.090/62, art. 1º §1º), para que a redução "projetado − até a data"
 * case avo a avo com o reuso.
 */
function avosDoAnoCivil(ano: number, inicio: string, fim: string): number {
  let avos = 0;
  for (let mes = 1; mes <= 12; mes += 1) {
    if (diasDeVinculoNoMes(ano, mes, inicio, fim) >= DIAS_MINIMOS_AVO_RESCISAO) {
      avos += 1;
    }
  }
  return avos;
}

function somarDias(data: string, dias: number): string {
  const instante = Date.parse(`${data}T00:00:00Z`) + dias * 86_400_000;
  return new Date(instante).toISOString().slice(0, 10);
}

function diasEntreInclusivo(inicio: string, fim: string): number {
  return (
    (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) /
      86_400_000 +
    1
  );
}

/** Soma meses mantendo a âncora no dia; dia 31 encosta no fim do mês curto. */
function adicionarMeses(data: string, meses: number): string {
  const dia = Number(data.slice(8, 10));
  const totalMeses =
    Number(data.slice(0, 4)) * 12 + (Number(data.slice(5, 7)) - 1) + meses;
  const novoAno = Math.floor(totalMeses / 12);
  const novoMes = (totalMeses % 12) + 1;
  return `${novoAno}-${dois(novoMes)}-${dois(Math.min(dia, diasNoMes(novoAno, novoMes)))}`;
}

/**
 * Avos das férias PROPORCIONAIS: MESES DE SERVIÇO contados do início do
 * período aquisitivo (aniversário a aniversário — não mês do calendário, que
 * é a régua do 13º), com a fração final contando quando SUPERIOR a 14 dias
 * (CLT, art. 146, parágrafo único).
 */
function avosDeServicoFerias(inicio: string, fim: string): number {
  if (inicio > fim) return 0;
  const limiteExclusivo = somarDias(fim, 1);
  let completos = 0;
  while (
    completos < 12 &&
    adicionarMeses(inicio, completos + 1) <= limiteExclusivo
  ) {
    completos += 1;
  }
  if (completos >= 12) return 12;
  const ancora = adicionarMeses(inicio, completos);
  const fracao = ancora > fim ? 0 : diasEntreInclusivo(ancora, fim);
  return completos + (fracao >= DIAS_MINIMOS_AVO_RESCISAO ? 1 : 0);
}

/** Anos COMPLETOS de serviço entre a admissão e uma data (Lei 12.506). */
function anosCompletos(admissao: string, ate: string): number {
  const anos = Number(ate.slice(0, 4)) - Number(admissao.slice(0, 4));
  const aniversarioJaPassou = ate.slice(5) >= admissao.slice(5);
  return Math.max(0, aniversarioJaPassou ? anos : anos - 1);
}

// ------------------------------------------------------------------ direitos por tipo

const DIREITOS_POR_TIPO: Record<
  TipoDesligamentoRescisao,
  Omit<DireitosRescisao, "tipo">
> = {
  sem_justa_causa: {
    aviso_a_favor: true,
    fator_aviso: 1,
    ferias_proporcionais: true,
    decimo_proporcional: true,
    multa_fgts_percentual: 40,
    citacao:
      "dispensa sem justa causa: todas as verbas — aviso (CLT art. 487; Lei 12.506), férias vencidas + proporcionais + 1/3 (CLT arts. 146/147), 13º proporcional (Lei 4.090/62 art. 3º) e multa de 40% do FGTS (Lei 8.036/90 art. 18 §1º)",
  },
  pedido_demissao: {
    aviso_a_favor: false,
    fator_aviso: 1,
    ferias_proporcionais: true,
    decimo_proporcional: true,
    multa_fgts_percentual: 0,
    citacao:
      "pedido de demissão: sem aviso indenizado a favor do empregado e sem multa do FGTS; férias vencidas + proporcionais + 1/3 (CLT art. 146 §ú; Súmula 261 TST) e 13º proporcional (Lei 4.090/62) são devidos",
  },
  justa_causa: {
    aviso_a_favor: false,
    fator_aviso: 1,
    ferias_proporcionais: false,
    decimo_proporcional: false,
    multa_fgts_percentual: 0,
    citacao:
      "dispensa por justa causa: só saldo de salário e férias VENCIDAS + 1/3 — férias proporcionais não são devidas (CLT art. 146 §ú; Súmula 171 TST) nem o 13º proporcional (Lei 4.090/62 art. 3º, a contrario); sem aviso e sem multa",
  },
  acordo_484a: {
    aviso_a_favor: true,
    fator_aviso: 0.5,
    ferias_proporcionais: true,
    decimo_proporcional: true,
    multa_fgts_percentual: 20,
    citacao:
      "acordo do art. 484-A da CLT: aviso indenizado pela METADE (inciso I, 'a') e multa do FGTS pela metade — 20% (inciso I, 'b'); demais verbas integrais (§1º)",
  },
  termino_experiencia: {
    aviso_a_favor: false,
    fator_aviso: 1,
    ferias_proporcionais: true,
    decimo_proporcional: true,
    multa_fgts_percentual: 0,
    citacao:
      "término normal do contrato de experiência: sem aviso e sem multa do FGTS; saldo, férias vencidas + proporcionais + 1/3 e 13º proporcional devidos",
  },
  termino_temporario: {
    aviso_a_favor: false,
    fator_aviso: 1,
    ferias_proporcionais: true,
    decimo_proporcional: true,
    multa_fgts_percentual: 0,
    citacao:
      "término normal do contrato temporário: sem aviso e sem multa do FGTS; saldo, férias vencidas + proporcionais + 1/3 e 13º proporcional devidos",
  },
};

/** Teto do aviso proporcional (Lei 12.506, art. 1º, parágrafo único). */
export const AVISO_DIAS_BASE = 30;
export const AVISO_DIAS_POR_ANO = 3;
export const AVISO_DIAS_TETO = 90;

/** Dias de aviso da Lei 12.506: 30 + 3 por ano completo, teto de 90. */
export function diasDeAvisoProporcional(anosDeServico: number): number {
  return Math.min(
    AVISO_DIAS_BASE + AVISO_DIAS_POR_ANO * anosDeServico,
    AVISO_DIAS_TETO
  );
}

/**
 * As verbas DESTA rescisão que geram depósito de FGTS no acerto — a metade
 * "o motor decide O QUE deposita" da dupla trava (molde das bases do mês):
 * saldo de salário (1701), aviso indenizado (1702 — Súmula 305 TST) e 13º
 * (0138). A outra metade é a flag incide_fgts da versão VIGENTE de cada uma.
 * Férias indenizadas + 1/3 e a própria multa ficam FORA por decisão do motor
 * (indenizatórias sem depósito — Lei 8.036/90, art. 15, §6º), mesmo que a
 * versão da rubrica incida FGTS para o uso salarial (férias GOZADAS).
 */
const CODIGOS_DEPOSITO_RESCISAO = [
  CODIGO_SALDO_SALARIO,
  CODIGO_AVISO_INDENIZADO,
  CODIGO_DECIMO,
] as const;

// ------------------------------------------------------------------ motor

export function calcularRescisao(
  entrada: EntradaMotorRescisao
): ResultadoMotorRescisao {
  const porCodigo = new Map(
    entrada.rubricas.map((rubrica) => [rubrica.codigo, rubrica])
  );
  const rubricaObrigatoria = (codigo: string): RubricaMotor => {
    const rubrica = porCodigo.get(codigo);
    if (!rubrica) {
      throw new ErroMotor(
        `Rubrica ${codigo} sem versão vigente — confira o catálogo em Parâmetros`
      );
    }
    return rubrica;
  };

  // ---- validação da borda -------------------------------------------------
  const tipo = entrada.tipo_desligamento as TipoDesligamentoRescisao;
  if (!TIPOS_DESLIGAMENTO_RESCISAO.includes(tipo)) {
    // O CHECK da 0008 garante estes seis valores; chegar outro aqui é dado
    // corrompido — recusa explicável, nunca um mapa chutado.
    throw new ErroMotor(
      `Tipo de desligamento desconhecido: "${entrada.tipo_desligamento}" — o motor de rescisão conhece ${TIPOS_DESLIGAMENTO_RESCISAO.join(", ")}`
    );
  }
  const modalidade = entrada.modalidade_aviso as ModalidadeAvisoRescisao;
  if (!MODALIDADES_AVISO_RESCISAO.includes(modalidade)) {
    throw new ErroMotor(
      `Modalidade de aviso desconhecida: "${entrada.modalidade_aviso}"`
    );
  }
  for (const [rotulo, valor] of [
    ["admissão", entrada.data_admissao],
    ["comunicação", entrada.data_comunicacao],
    ["término", entrada.data_termino],
  ] as const) {
    if (!dataCivilValida(valor)) {
      throw new ErroMotor(
        `Data de ${rotulo} inválida: ${valor} (AAAA-MM-DD, data real do calendário)`
      );
    }
  }
  if (entrada.data_termino < entrada.data_admissao) {
    throw new ErroMotor(
      `Término (${entrada.data_termino}) anterior à admissão (${entrada.data_admissao}) — não há contrato a rescindir`
    );
  }
  const salario = entrada.salario_base_centavos;
  if (!Number.isInteger(salario) || salario < 0) {
    throw new ErroMotor("Salário base inválido (centavos inteiros ≥ 0)");
  }
  const media = entrada.media_variaveis_centavos ?? null;
  if (media !== null && (!Number.isInteger(media) || media < 0)) {
    throw new ErroMotor(
      "Média de variáveis inválida (centavos inteiros ≥ 0, ou ausente)"
    );
  }
  const saldoFgts = entrada.saldo_fgts_centavos ?? null;
  if (saldoFgts !== null && (!Number.isInteger(saldoFgts) || saldoFgts < 0)) {
    throw new ErroMotor(
      "Saldo do FGTS inválido (centavos inteiros ≥ 0, ou ausente)"
    );
  }
  const adiantamento13 = entrada.adiantamento_decimo_pago_centavos ?? null;
  if (
    adiantamento13 !== null &&
    (!Number.isInteger(adiantamento13) || adiantamento13 < 0)
  ) {
    throw new ErroMotor(
      "Adiantamento de 13º pago inválido (centavos inteiros ≥ 0, ou ausente)"
    );
  }
  const afastamento13 = entrada.avos_afastamento_13 ?? null;
  if (
    afastamento13 !== null &&
    (!Number.isInteger(afastamento13) ||
      afastamento13 < 0 ||
      afastamento13 > 12)
  ) {
    throw new ErroMotor(
      "Avos de afastamento do 13º inválidos (inteiro de 0 a 12, ou ausente)"
    );
  }
  for (const vencida of entrada.ferias_vencidas) {
    if (
      !dataCivilValida(vencida.periodo_inicio) ||
      !dataCivilValida(vencida.periodo_fim) ||
      vencida.periodo_fim < vencida.periodo_inicio
    ) {
      throw new ErroMotor(
        `Período aquisitivo vencido com datas inválidas: ${vencida.periodo_inicio} a ${vencida.periodo_fim}`
      );
    }
    if (vencida.periodo_fim > entrada.data_termino) {
      throw new ErroMotor(
        `Período aquisitivo ${vencida.periodo_inicio} a ${vencida.periodo_fim} ainda em curso no término (${entrada.data_termino}) — não entra como vencido; as proporcionais são o período em curso`
      );
    }
    const decimos = Math.round(vencida.saldo_dias * 10);
    if (
      !(vencida.saldo_dias > 0) ||
      vencida.saldo_dias > 30 ||
      Math.abs(vencida.saldo_dias * 10 - decimos) > 1e-9
    ) {
      throw new ErroMotor(
        `Saldo de férias vencidas inválido: ${vencida.saldo_dias} (0 a 30 dias, em décimos — NUMERIC(4,1) do banco)`
      );
    }
  }
  const emCursoInicio = entrada.periodo_aquisitivo_em_curso_inicio ?? null;
  if (emCursoInicio !== null) {
    if (!dataCivilValida(emCursoInicio)) {
      throw new ErroMotor(
        `Início do período aquisitivo em curso inválido: ${emCursoInicio}`
      );
    }
    if (emCursoInicio > entrada.data_termino) {
      throw new ErroMotor(
        `Período aquisitivo em curso começa (${emCursoInicio}) depois do término (${entrada.data_termino})`
      );
    }
  }
  const divisorDias = entrada.parametros.divisor_mensal_dias;
  if (!(divisorDias > 0)) {
    throw new ErroMotor(
      "Divisor mensal de dias inválido na versão vigente dos parâmetros — corrija em Parâmetros"
    );
  }

  const direitos: DireitosRescisao = { tipo, ...DIREITOS_POR_TIPO[tipo] };
  const avisos: string[] = [AVISO_RESCISAO_ISOLADA, direitos.citacao];
  if (tipo === "termino_experiencia" || tipo === "termino_temporario") {
    avisos.push(AVISO_CONTRATO_A_TERMO);
  }

  // ---- remuneração-base: salário + média mensal de variáveis --------------
  const mediaAplicada = media ?? 0;
  const remuneracaoBase = salario + mediaAplicada;
  if (mediaAplicada === 0) avisos.push(AVISO_MEDIAS_PENDENTES_RESCISAO);
  const memoriaMedias =
    mediaAplicada === 0
      ? { media_variaveis: 0, aviso_medias: AVISO_MEDIAS_PENDENTES_RESCISAO }
      : {
          media_variaveis: reais(mediaAplicada),
          origem_media:
            "média mensal de variáveis informada pelo chamador (importadores pendentes)",
        };
  const memoriaProcesso = {
    tipo_desligamento: tipo,
    iniciativa: entrada.iniciativa,
    modalidade_aviso: modalidade,
    data_admissao: entrada.data_admissao,
    data_comunicacao: entrada.data_comunicacao,
    data_termino: entrada.data_termino,
  };
  const memoriaDivisor = {
    divisor_dias: divisorDias,
    origem_divisor:
      "dias do mês nos parâmetros da folha (não depende da jornada)",
    parametro_folha_versao_id: entrada.parametros.id,
  };

  const itens: ItemMotor[] = [];
  const incluir = (
    rubrica: RubricaMotor,
    valorSemArredondar: number,
    referencia: number | null,
    base: number | null,
    memoria: Record<string, unknown>
  ): ItemMotor | null => {
    const valor = arredondarCentavos(valorSemArredondar);
    if (valor === 0) return null; // item com valor zero não é gravado
    const item: ItemMotor = {
      codigo: rubrica.codigo,
      nome: rubrica.nome,
      natureza: rubrica.natureza,
      rubrica_versao_id: rubrica.rubrica_versao_id,
      referencia,
      base_centavos: base,
      valor_centavos: valor,
      memoria: {
        ...memoria,
        valor_sem_arredondar: reaisIntermediario(valorSemArredondar),
        valor_final: reais(valor),
        arredondamento: "meio-para-cima no centavo, só no valor final",
      },
    };
    itens.push(item);
    return item;
  };

  // 1) Saldo de salário (1701) — dias corridos do mês do término -------------
  // Do dia 1 (ou da admissão, se no mesmo mês) até o dia do término; valor-dia
  // = remuneração ÷ divisor (30). Quando o período do saldo cobre o mês CIVIL
  // inteiro (início no dia 1º e término no último dia do mês), vale o mês
  // comercial COMPLETO (divisor/divisor): fevereiro trabalhado inteiro paga o
  // salário cheio, não 28/30 — e janeiro inteiro continua 30/30 (o 31º dia não
  // é pago; o cap fica na memória). Mês parcial segue proporcional aos dias.
  const anoTermino = Number(entrada.data_termino.slice(0, 4));
  const mesTermino = Number(entrada.data_termino.slice(5, 7));
  const diaTermino = Number(entrada.data_termino.slice(8, 10));
  const admissaoNoMesDoTermino =
    entrada.data_admissao.slice(0, 7) === entrada.data_termino.slice(0, 7);
  const diaInicioSaldo = admissaoNoMesDoTermino
    ? Number(entrada.data_admissao.slice(8, 10))
    : 1;
  const diasCorridos = diaTermino - diaInicioSaldo + 1;
  const ultimoDiaDoMesTermino = diasNoMes(anoTermino, mesTermino);
  const mesCivilCompleto =
    diaInicioSaldo === 1 && diaTermino === ultimoDiaDoMesTermino;
  const diasSaldo = mesCivilCompleto
    ? divisorDias
    : Math.min(diasCorridos, divisorDias);
  const rubricaSaldo = rubricaObrigatoria(CODIGO_SALDO_SALARIO);
  const saldoSemArredondar =
    (remuneracaoBase * Math.round(diasSaldo * 100)) / (divisorDias * 100);
  const itemSaldo = incluir(
    rubricaSaldo,
    saldoSemArredondar,
    diasSaldo,
    remuneracaoBase,
    {
      formula: `dias corridos no mês do término × ((salário + média) ÷ ${divisorDias})`,
      dias_corridos: diasCorridos,
      dias_pagos: diasSaldo,
      mes_civil_completo: mesCivilCompleto
        ? `período do saldo cobre o mês civil inteiro (01 a ${dois(ultimoDiaDoMesTermino)}): saldo pago pelo mês comercial completo (${divisorDias}/${divisorDias})`
        : null,
      cap_divisor:
        diasCorridos > diasSaldo
          ? `mês com ${diasCorridos} dias corridos pago pelo divisor comercial de ${divisorDias}`
          : null,
      mes_do_termino: `${anoTermino}-${dois(mesTermino)}`,
      salario_base: reais(salario),
      remuneracao_base: reais(remuneracaoBase),
      valor_dia: reaisIntermediario(remuneracaoBase / divisorDias),
      tributacao:
        "saldo de salário é verba SALARIAL: entra nas bases de INSS e IRRF pela incidência da versão vigente da rubrica",
      ...memoriaMedias,
      ...memoriaDivisor,
      ...memoriaProcesso,
    }
  );

  // 2) Aviso prévio (1702) — Lei 12.506, conforme tipo e modalidade ----------
  const diasAvisoProporcional = direitos.aviso_a_favor
    ? diasDeAvisoProporcional(
        anosCompletos(entrada.data_admissao, entrada.data_comunicacao)
      )
    : 0;
  let diasAvisoIndenizados = 0;
  if (direitos.aviso_a_favor) {
    if (modalidade === "indenizado" || modalidade === "dispensado") {
      if (modalidade === "dispensado") avisos.push(AVISO_DISPENSA_DE_CUMPRIMENTO);
      diasAvisoIndenizados = diasAvisoProporcional;
    } else if (modalidade === "trabalhado") {
      avisos.push(AVISO_AVISO_TRABALHADO_NO_SALDO);
      diasAvisoIndenizados = Math.max(
        0,
        diasAvisoProporcional - AVISO_DIAS_BASE
      );
    } else {
      avisos.push(AVISO_MODALIDADE_SEM_AVISO);
    }
  } else if (tipo === "pedido_demissao" && modalidade === "indenizado") {
    avisos.push(AVISO_DESCONTO_AVISO_NAO_EMITIDO);
  }
  if (diasAvisoIndenizados > 0) {
    avisos.push(AVISO_PROJECAO_AVISO_NAO_APLICADA);
    const rubricaAviso = rubricaObrigatoria(CODIGO_AVISO_INDENIZADO);
    const avisoInteiro =
      (remuneracaoBase * Math.round(diasAvisoIndenizados * 100)) /
      (divisorDias * 100);
    const avisoSemArredondar = avisoInteiro * direitos.fator_aviso;
    incluir(
      rubricaAviso,
      avisoSemArredondar,
      diasAvisoIndenizados,
      remuneracaoBase,
      {
        formula: `dias indenizados × ((salário + média) ÷ ${divisorDias})${
          direitos.fator_aviso === 0.5 ? " ÷ 2 (art. 484-A, I, 'a')" : ""
        }`,
        anos_completos: anosCompletos(
          entrada.data_admissao,
          entrada.data_comunicacao
        ),
        dias_proporcionais: diasAvisoProporcional,
        dias_indenizados: diasAvisoIndenizados,
        regra_dias: `${AVISO_DIAS_BASE} + ${AVISO_DIAS_POR_ANO} por ano completo, teto ${AVISO_DIAS_TETO} (Lei 12.506/2011)`,
        fator: direitos.fator_aviso,
        tributacao:
          "verba INDENIZATÓRIA — fora da base de INSS (STJ, REsp 1.230.957/RS, repetitivo) e de IRRF (Lei 7.713/88, art. 6º, V); o FGTS incide (Súmula 305 TST) e fica fora do escopo INSS/IRRF desta prévia",
        ...memoriaMedias,
        ...memoriaDivisor,
        ...memoriaProcesso,
      }
    );
  }

  // 3) Férias vencidas e proporcionais (0136/0137, indenizadas) --------------
  // REUSO de calcularFerias (modalidade "indenizadas") quando os dias cabem na
  // janela de gozo do art. 134 (inteiros, 5–30); fora dela — meio avo, saldo
  // miúdo — vale a MESMA fórmula, aplicada diretamente (pagamento não é gozo).
  const valoresFeriasIndenizadas = (
    dias: number
  ): {
    ferias_centavos: number;
    terco_centavos: number;
    origem: string;
  } => {
    if (
      Number.isInteger(dias) &&
      dias >= DIAS_GOZO_MINIMO &&
      dias <= DIAS_GOZO_MAXIMO
    ) {
      const reuso = calcularFerias({
        modalidade: "indenizadas",
        salario_base_centavos: salario,
        dependentes_irrf: entrada.dependentes_irrf,
        dias_gozo: dias,
        dias_abono: 0,
        media_variaveis_centavos: media,
        rubricas: entrada.rubricas,
        tabela_inss: entrada.tabela_inss,
        tabela_irrf: entrada.tabela_irrf,
        parametros: entrada.parametros,
      });
      return {
        ferias_centavos:
          reuso.itens.find((item) => item.codigo === CODIGO_FERIAS)
            ?.valor_centavos ?? 0,
        terco_centavos:
          reuso.itens.find((item) => item.codigo === CODIGO_ADICIONAL_FERIAS)
            ?.valor_centavos ?? 0,
        origem:
          "reuso do motor de férias (calcularFerias, modalidade indenizadas)",
      };
    }
    const feriasSemArredondar =
      (remuneracaoBase * Math.round(dias * 100)) / (divisorDias * 100);
    return {
      ferias_centavos: arredondarCentavos(feriasSemArredondar),
      terco_centavos: arredondarCentavos(feriasSemArredondar / 3),
      origem: `mesma fórmula do motor de férias, aplicada diretamente — ${dias} dias fora da janela de gozo do art. 134 (pagamento não é gozo)`,
    };
  };
  const rubricaFerias = rubricaObrigatoria(CODIGO_FERIAS);
  const rubricaTerco = rubricaObrigatoria(CODIGO_ADICIONAL_FERIAS);
  const memoriaTributacaoFerias = {
    tributacao:
      "férias INDENIZADAS + 1/3: verba indenizatória — fora da base de INSS (Lei 8.212/91, art. 28 §9º 'd'; Súmula 386 STJ) e de IRRF (Súmula 386 STJ)",
  };
  const emitirFeriasIndenizadas = (
    dias: number,
    rotulo: string,
    memoriaExtra: Record<string, unknown>
  ): void => {
    const valores = valoresFeriasIndenizadas(dias);
    const itemFerias = incluir(
      rubricaFerias,
      valores.ferias_centavos,
      dias,
      remuneracaoBase,
      {
        formula: `dias × ((salário + média) ÷ ${divisorDias})`,
        verba: rotulo,
        dias,
        origem_valor: valores.origem,
        salario_base: reais(salario),
        remuneracao_base: reais(remuneracaoBase),
        ...memoriaExtra,
        ...memoriaMedias,
        ...memoriaDivisor,
        ...memoriaTributacaoFerias,
      }
    );
    incluir(
      rubricaTerco,
      valores.terco_centavos,
      null,
      itemFerias?.valor_centavos ?? 0,
      {
        formula: "férias ÷ 3 (CF art. 7º, XVII)",
        verba: `1/3 sobre ${rotulo}`,
        origem_valor: valores.origem,
        ...memoriaExtra,
        ...memoriaTributacaoFerias,
      }
    );
  };

  let dobraPendente = false;
  for (const vencida of entrada.ferias_vencidas) {
    if (
      vencida.limite_concessivo &&
      entrada.data_termino > vencida.limite_concessivo
    ) {
      dobraPendente = true;
    }
    emitirFeriasIndenizadas(vencida.saldo_dias, "férias vencidas", {
      periodo_aquisitivo: `${vencida.periodo_inicio} a ${vencida.periodo_fim}`,
      saldo_dias: vencida.saldo_dias,
      regra:
        "período aquisitivo completo não gozado até o término: saldo pago em dinheiro na rescisão (CLT arts. 146/147)",
      dobra_art_137: vencida.limite_concessivo
        ? entrada.data_termino > vencida.limite_concessivo
          ? AVISO_DOBRA_ART137_NAO_APLICADA
          : "dentro do limite concessivo"
        : "limite concessivo não informado",
    });
  }
  if (dobraPendente) avisos.push(AVISO_DOBRA_ART137_NAO_APLICADA);

  let avosFeriasProporcionais = 0;
  if (direitos.ferias_proporcionais) {
    if (emCursoInicio === null) {
      avisos.push(AVISO_PERIODO_EM_CURSO_AUSENTE);
    } else {
      avosFeriasProporcionais = avosDeServicoFerias(
        emCursoInicio,
        entrada.data_termino
      );
      if (avosFeriasProporcionais > 0) {
        // 1/12 de 30 dias por avo = 2,5 dias por avo — múltiplo exato de 0,5,
        // que Math.round(dias × 100) representa sem ruído.
        const diasProporcionais = (avosFeriasProporcionais * 30) / 12;
        emitirFeriasIndenizadas(diasProporcionais, "férias proporcionais", {
          periodo_aquisitivo_em_curso: `${emCursoInicio} a ${entrada.data_termino}`,
          avos: avosFeriasProporcionais,
          regra:
            "1/12 por MÊS DE SERVIÇO (aniversário a aniversário do período aquisitivo) ou fração superior a 14 dias (CLT art. 146, parágrafo único)",
        });
      }
    }
  }

  // 4) 13º proporcional — REUSO de calcularDecimo, avos ATÉ A DATA -----------
  let avosDecimo = 0;
  let baseInssDecimo = 0;
  let baseIrrfDecimo = 0;
  if (direitos.decimo_proporcional) {
    const inicioNoAno =
      entrada.data_admissao > `${anoTermino}-01-01`
        ? entrada.data_admissao
        : `${anoTermino}-01-01`;
    const avosAteData = avosDoAnoCivil(
      anoTermino,
      inicioNoAno,
      entrada.data_termino
    );
    const avosProjetados = avosDoAnoCivil(
      anoTermino,
      inicioNoAno,
      `${anoTermino}-12-31`
    );
    const reducaoPorTermino = avosProjetados - avosAteData;
    avisos.push(AVISO_AVOS_ATE_A_DATA);
    if (afastamento13 === null) {
      avisos.push(AVISO_AFASTAMENTO_13_NAO_CONSIDERADO);
    }
    if (adiantamento13 === null) {
      avisos.push(AVISO_ADIANTAMENTO_13_NAO_INFORMADO);
    }
    const reusoDecimo = calcularDecimo({
      ano: anoTermino,
      parcela: 2,
      data_admissao: entrada.data_admissao,
      salario_base_centavos: salario,
      dependentes_irrf: entrada.dependentes_irrf,
      media_variaveis_centavos: media,
      // A redução leva os avos do reuso a "até a data": projeção − até a data,
      // mais o afastamento real informado (o parâmetro do motor de 13º reduz
      // avos — é o trilho documentado para quem conhece o desligamento).
      avos_afastamento: reducaoPorTermino + (afastamento13 ?? 0),
      // 0 (e não null): null mandaria o motor de 13º RECALCULAR uma metade
      // nunca paga; 0 diz "nada foi adiantado" e nenhum desconto é emitido.
      adiantamento_pago_centavos: adiantamento13 ?? 0,
      rubricas: entrada.rubricas,
      tabela_inss: entrada.tabela_inss,
      tabela_irrf: entrada.tabela_irrf,
    });
    avosDecimo = reusoDecimo.avos;
    baseInssDecimo = reusoDecimo.base_inss_centavos;
    baseIrrfDecimo = reusoDecimo.base_irrf_centavos;
    const contextoRescisao = {
      contexto_rescisao:
        "13º proporcional da rescisão — reuso do motor de 13º (parcela 2) com os avos limitados à data do término",
      avos_ate_a_data: avosAteData,
      avos_projetados_31_12: avosProjetados,
      reducao_por_termino: reducaoPorTermino,
      avos_afastamento_informados: afastamento13 ?? 0,
      ...memoriaProcesso,
    };
    for (const item of reusoDecimo.itens) {
      itens.push({
        ...item,
        memoria: { ...item.memoria, ...contextoRescisao },
      });
    }
    // Avisos do reuso: a projeção a 31/12 e o afastamento genérico são
    // SUBSTITUÍDOS pelos avisos próprios da rescisão (acima); as médias já têm
    // o aviso da rescisão. Ficam os que continuam verdadeiros aqui — a
    // tributação exclusiva do 13º e o regime do IRRF.
    for (const aviso of reusoDecimo.avisos) {
      if (
        aviso === AVISO_AVOS_PROJETADOS ||
        aviso === AVISO_AFASTAMENTO_NAO_CONSIDERADO ||
        aviso === AVISO_MEDIAS_PENDENTES_DECIMO
      ) {
        continue;
      }
      avisos.push(aviso);
    }
  }

  // 5) Multa do FGTS (1703) — saldo EXTERNO + depósitos DA rescisão ----------
  // Lei 8.036/90, art. 18: no acerto o empregador ainda deposita o FGTS das
  // verbas da própria rescisão, e o §1º manda a multa incidir sobre o TOTAL
  // dos depósitos — inclusive esses. Base = saldo informado (externo) + a
  // alíquota vigente sobre as verbas de CODIGOS_DEPOSITO_RESCISAO cuja versão
  // vigente incide FGTS (dupla trava; nada chumbado — alíquota dos parâmetros,
  // flag do catálogo). Sem o saldo externo a multa sai SÓ sobre os depósitos
  // da rescisão, com o MESMO aviso de sempre.
  if (direitos.multa_fgts_percentual > 0) {
    const rubricaMulta = rubricaObrigatoria(CODIGO_MULTA_FGTS);
    const aliquotaFgts = entrada.parametros.aliquota_fgts;
    const depositosDetalhe: Record<string, unknown>[] = [];
    let depositosSemArredondar = 0;
    for (const codigo of CODIGOS_DEPOSITO_RESCISAO) {
      const rubricaDeposito = porCodigo.get(codigo);
      // Dupla trava: o motor apontou a verba; a versão VIGENTE confirma.
      if (!rubricaDeposito?.incide_fgts) continue;
      for (const item of itens) {
        if (item.codigo !== codigo) continue;
        const deposito = aplicarPercentual(item.valor_centavos, aliquotaFgts);
        depositosSemArredondar += deposito;
        depositosDetalhe.push({
          codigo,
          nome: item.nome,
          valor: reais(item.valor_centavos),
          deposito: reaisIntermediario(deposito),
        });
      }
    }
    if (saldoFgts === null) avisos.push(AVISO_FGTS_SALDO_EXTERNO);
    const baseSemArredondar = (saldoFgts ?? 0) + depositosSemArredondar;
    const multaSemArredondar = aplicarPercentual(
      baseSemArredondar,
      direitos.multa_fgts_percentual
    );
    incluir(
      rubricaMulta,
      multaSemArredondar,
      direitos.multa_fgts_percentual,
      arredondarCentavos(baseSemArredondar),
      {
        formula: `(saldo externo do FGTS + depósitos da própria rescisão) × ${direitos.multa_fgts_percentual}%`,
        saldo_fgts: reais(saldoFgts ?? 0),
        origem_saldo:
          saldoFgts === null
            ? AVISO_FGTS_SALDO_EXTERNO
            : "saldo da conta vinculada informado pelo chamador (dado externo — extrato da Caixa)",
        aliquota_fgts: aliquotaFgts,
        depositos_rescisao: depositosDetalhe,
        total_depositos_rescisao: reaisIntermediario(depositosSemArredondar),
        base_multa: reaisIntermediario(baseSemArredondar),
        composicao_base:
          "Lei 8.036/90, art. 18, §1º: a base da multa inclui os depósitos devidos NA rescisão — " +
          `${aliquotaFgts}% das verbas rescisórias cuja versão vigente incide FGTS ` +
          "(saldo 1701, aviso indenizado 1702 — Súmula 305 TST — e 13º 0138); férias " +
          "indenizadas + 1/3 e a própria multa ficam fora (indenizatórias, sem depósito)",
        percentual: direitos.multa_fgts_percentual,
        regra:
          direitos.multa_fgts_percentual === 40
            ? "indenização compensatória de 40% (Lei 8.036/90, art. 18, §1º)"
            : "indenização compensatória pela metade — 20% (CLT, art. 484-A, I, 'b')",
        tributacao:
          "indenização — fora da base de INSS (não é salário-de-contribuição) e de IRRF (Lei 7.713/88, art. 6º, V); não gera novo depósito de FGTS",
        ...memoriaProcesso,
      }
    );
  }

  // 6) Bases do MÊS da rescisão — só a verba salarial entra ------------------
  // Dupla trava de propósito (molde férias/13º): o motor decide O QUE é
  // salarial (o saldo; aviso indenizado, férias indenizadas + 1/3 e multa são
  // indenizatórios — exclusões citadas na memória de cada item) e a versão
  // vigente da rubrica decide EM QUAL base entra.
  let baseInss = 0;
  let baseIrrf = 0;
  if (itemSaldo) {
    if (rubricaSaldo.incide_inss) baseInss += itemSaldo.valor_centavos;
    if (rubricaSaldo.incide_irrf) baseIrrf += itemSaldo.valor_centavos;
  }

  // 7) INSS progressivo faixa a faixa, com teto (2001) -----------------------
  let inssFinal = 0;
  if (baseInss > 0) {
    const rubricaInss = rubricaObrigatoria(CODIGO_INSS);
    const tetoAplicado = baseInss > entrada.tabela_inss.teto_centavos;
    const baseInssLimitada = Math.min(
      baseInss,
      entrada.tabela_inss.teto_centavos
    );
    let inssSemArredondar = 0;
    const faixasPercorridas: Record<string, unknown>[] = [];
    let pisoAnterior = 0;
    for (const faixa of entrada.tabela_inss.faixas) {
      if (baseInssLimitada <= pisoAnterior) break;
      const tributavelNaFaixa =
        Math.min(baseInssLimitada, faixa.ate_centavos) - pisoAnterior;
      if (tributavelNaFaixa <= 0) {
        pisoAnterior = faixa.ate_centavos;
        continue;
      }
      const valorFaixa = aplicarPercentual(tributavelNaFaixa, faixa.aliquota);
      inssSemArredondar += valorFaixa;
      faixasPercorridas.push({
        ate: reais(faixa.ate_centavos),
        aliquota: faixa.aliquota,
        base_na_faixa: reais(tributavelNaFaixa),
        valor: reaisIntermediario(valorFaixa),
      });
      pisoAnterior = faixa.ate_centavos;
    }
    const itemInss = incluir(
      rubricaInss,
      inssSemArredondar,
      null,
      baseInssLimitada,
      {
        formula:
          "progressivo faixa a faixa sobre o saldo de salário limitado ao teto",
        escopo: AVISO_RESCISAO_ISOLADA,
        base_inss: reais(baseInss),
        teto_contribuicao: reais(entrada.tabela_inss.teto_centavos),
        teto_aplicado: tetoAplicado,
        faixas_percorridas: faixasPercorridas,
        tabela_inss_versao_id: entrada.tabela_inss.id,
      }
    );
    inssFinal = itemInss?.valor_centavos ?? 0;
  }

  // 8) IRRF — vale o regime de imposto MENOR (mesma mecânica do mensal) ------
  if (baseIrrf > 0) {
    const rubricaIrrf = rubricaObrigatoria(CODIGO_IRRF);
    const deducaoDependentes =
      entrada.dependentes_irrf *
      entrada.tabela_irrf.deducao_dependente_centavos;
    const baseCompleto = Math.max(0, baseIrrf - inssFinal - deducaoDependentes);
    const baseSimplificado = Math.max(
      0,
      baseIrrf - entrada.tabela_irrf.desconto_simplificado_centavos
    );
    const impostoDaFaixa = (
      base: number
    ): { imposto: number; aliquota: number; deducao_centavos: number } => {
      for (const faixa of entrada.tabela_irrf.faixas) {
        if (faixa.ate_centavos === null || base <= faixa.ate_centavos) {
          return {
            imposto: Math.max(
              0,
              aplicarPercentual(base, faixa.aliquota) - faixa.deducao_centavos
            ),
            aliquota: faixa.aliquota,
            deducao_centavos: faixa.deducao_centavos,
          };
        }
      }
      throw new ErroMotor("Tabela IRRF sem faixa final aberta — corrija a versão");
    };
    const completo = impostoDaFaixa(baseCompleto);
    const simplificado = impostoDaFaixa(baseSimplificado);
    const venceuSimplificado = simplificado.imposto < completo.imposto;
    const vencedor = venceuSimplificado ? simplificado : completo;
    const baseVencedora = venceuSimplificado ? baseSimplificado : baseCompleto;
    incluir(rubricaIrrf, vencedor.imposto, null, baseVencedora, {
      formula: "base do regime vencedor × alíquota − parcela a deduzir",
      escopo: AVISO_RESCISAO_ISOLADA,
      base_tributavel: reais(baseIrrf),
      regime_completo: {
        base: reais(baseCompleto),
        deducao_inss: reais(inssFinal),
        dependentes: entrada.dependentes_irrf,
        deducao_dependentes: reais(deducaoDependentes),
        imposto: reaisIntermediario(completo.imposto),
      },
      regime_simplificado: {
        base: reais(baseSimplificado),
        desconto_simplificado: reais(
          entrada.tabela_irrf.desconto_simplificado_centavos
        ),
        imposto: reaisIntermediario(simplificado.imposto),
      },
      regime_vencedor: venceuSimplificado ? "simplificado" : "completo",
      criterio: "vale o imposto MENOR entre os dois regimes",
      aliquota_aplicada: vencedor.aliquota,
      parcela_deduzir: reais(vencedor.deducao_centavos),
      tabela_irrf_versao_id: entrada.tabela_irrf.id,
    });
  }

  // 9) Totais ---------------------------------------------------------------
  let totalProventos = 0;
  let totalDescontos = 0;
  for (const item of itens) {
    if (item.natureza === "provento") totalProventos += item.valor_centavos;
    if (item.natureza === "desconto") totalDescontos += item.valor_centavos;
  }

  return {
    itens,
    avisos,
    direitos,
    dias_saldo_salario: diasSaldo,
    dias_aviso_proporcional: diasAvisoProporcional,
    dias_aviso_indenizados: diasAvisoIndenizados,
    avos_ferias_proporcionais: avosFeriasProporcionais,
    avos_decimo: avosDecimo,
    total_proventos_centavos: totalProventos,
    total_descontos_centavos: totalDescontos,
    liquido_centavos: totalProventos - totalDescontos,
    base_inss_centavos: baseInss,
    base_irrf_centavos: baseIrrf,
    base_inss_decimo_centavos: baseInssDecimo,
    base_irrf_decimo_centavos: baseIrrfDecimo,
  };
}

// ------------------------------------------------------------------ costura disciplinar (D3)

/** Janela de suspensão disciplinar candidata ao aviso da prévia (D3). */
export interface SuspensaoNoTermino {
  medida_id: number;
  inicio: string;
  /** null = janela ABERTA (a 0080 permite): conta até o término. */
  fim: string | null;
}

/**
 * O AVISO da costura rescisão × disciplinar (D3). A prévia NÃO desconta a
 * suspensão do mês do término — o desconto D2:a pertence ao cálculo MENSAL, e
 * o mensal exclui o desligado, então sem este aviso o desconto simplesmente
 * nunca aconteceria. O desenho do acerto (onde o desconto de fato entra) é da
 * integração futura; até lá o DP é avisado com dias, DSR e os ids das medidas.
 *
 * A régua é a MESMA do mensal (reuso de apurarSuspensaoNaCompetencia), com um
 * recorte a mais: o saldo paga até o TÉRMINO, então a janela é capada nele e
 * só contam os domingos de DSR até ele — dia de suspensão depois do término
 * não é dia pago, e DSR de domingo posterior ao término não existe no saldo.
 *
 * Devolve null quando nenhuma medida tem efeito no período do saldo.
 */
export function avisoSuspensaoNoMesDoTermino(
  dataTermino: string,
  suspensoes: SuspensaoNoTermino[]
): string | null {
  const ano = Number(dataTermino.slice(0, 4));
  const mes = Number(dataTermino.slice(5, 7));
  // União entre medidas (mesma régua do C1 no mensal): o MESMO dia — ou o
  // mesmo domingo de DSR — nunca conta duas vezes quando duas janelas se
  // tocam na mesma semana.
  const diasNoSaldo = new Set<string>();
  const domingosNoSaldo = new Set<string>();
  const ids: number[] = [];
  for (const suspensao of suspensoes) {
    // Começa depois do término: fora do período do saldo (defesa — a busca do
    // serviço já não a traria).
    if (suspensao.inicio > dataTermino) continue;
    const fimCapado =
      suspensao.fim === null || suspensao.fim > dataTermino
        ? dataTermino
        : suspensao.fim;
    const recorte = apurarSuspensaoNaCompetencia(
      ano,
      mes,
      suspensao.inicio,
      fimCapado
    );
    const diasDaMedida = recorte.dias.filter((dia) => dia <= dataTermino);
    const domingosDaMedida = recorte.domingos_dsr.filter(
      (domingo) => domingo <= dataTermino
    );
    if (diasDaMedida.length === 0 && domingosDaMedida.length === 0) continue;
    for (const dia of diasDaMedida) diasNoSaldo.add(dia);
    for (const domingo of domingosDaMedida) domingosNoSaldo.add(domingo);
    ids.push(suspensao.medida_id);
  }
  if (ids.length === 0) return null;
  const parteDsr =
    domingosNoSaldo.size > 0
      ? ` e ${domingosNoSaldo.size} DSR da semana da suspensão (Lei 605/49)`
      : "";
  return (
    `suspensão disciplinar de ${diasNoSaldo.size} dia(s)${parteDsr} no mês do término NÃO descontada nesta prévia ` +
    `(medida${ids.length > 1 ? "s" : ""} #${ids.join(", #")}) — o cálculo mensal exclui o desligado: ` +
    "desconte no acerto da rescisão"
  );
}
