// Motor de apuração de ponto — Onda F, etapa 1. PURO: sem IO, sem banco, sem
// `new Date()`. Tudo que a conta precisa entra pela EntradaApuracao e tudo que
// sai é explicável pela memória de cada dia.
//
// REGRAS DE PRECISÃO
// • Hora trafega em MINUTO INTEIRO em toda a superfície — entrada, intermediário
//   e saída. Nunca float de horas, nunca INTERVAL. A mesma disciplina que o
//   motor de folha aplica a centavos.
// • Existem exatamente DOIS pontos onde entra fração, os dois arredondados
//   meio-para-cima UMA única vez e nunca de novo:
//     – a hora noturna reduzida (52'30" = 3150 s), aplicada sobre o TOTAL
//       noturno do dia;
//     – o fator do banco de horas (NUMERIC(4,2)), aplicado sobre o ACUMULADO da
//       competência (ver creditosDoBanco()).
// • `minuto` é minutos desde a meia-noite do DIA DE APURAÇÃO em
//   America/Sao_Paulo. Pode passar de 1440 quando o turno vira a noite (12x36):
//   quem faz essa amarração é agruparMarcacoesPorDia, também puro.
//
// NENHUM NÚMERO DE NEGÓCIO MORA AQUI
// Limite, divisor, fator, janela e dia de repouso vêm todos da jornada
// (rh.jornada_versao) ou da regra de banco. Se um número aparecer literal neste
// arquivo, ou é unidade de relógio (60, 1440) ou é defeito. A migration 0034
// conta, uma a uma, quais eram as constantes e quanto dinheiro cada uma errava.
//
// REGRAS LEGAIS EMBUTIDAS (cada uma aparece na memória do dia)
// • CLT art. 58 §1º + Súmula 366 TST: variação de até `tolerancia_entrada` /
//   `tolerancia_saida` POR MARCAÇÃO, com teto na soma das duas no dia, não é
//   hora extra nem atraso; ULTRAPASSADO o limite, computa-se a TOTALIDADE do
//   tempo, não só o excedente. Medir "por marcação" exige horário contratual na
//   jornada — quando ele existe, é assim que se mede; quando não existe, o motor
//   compara o saldo do dia e DIZ na memória que foi assim (ver toleranciaDoDia).
// • CLT art. 71: acima do limite da jornada (`intervalo_obrigatorio_acima`),
//   intervalo mínimo obrigatório. Intervalo menor que o mínimo vira
//   intercorrência, não desconto automático — quem decide é o DP.
// • CLT art. 73: adicional noturno pela INTERSEÇÃO do tempo trabalhado com a
//   janela noturna da jornada (22:00→05:00 no urbano).
// • CLT art. 73 §1º: a HORA NOTURNA É REDUZIDA — vale `hora_noturna_segundos`
//   (3150 s = 52min30s) em vez de 3600. Sete horas de relógio na janela são oito
//   horas noturnas. O ficto não é só o que a folha paga: ele estende a JORNADA
//   CUMPRIDA, então o plantão de 12h de relógio com 7h noturnas cumpre 13h.
// • Lei 605/49 art. 6º: falta injustificada na semana derruba o repouso semanal
//   remunerado. Ver dsrPorSemana() para a fórmula exata.
// • Dia com BATIDA FALTANDO (turno aberto, fechamento órfão, ABERTURA SOBRE
//   ABERTURA, intervalo sem retorno) fica PENDENTE: não gera falta, nem atraso,
//   nem hora extra. Falha de coleta não é ausência do trabalhador e não pode
//   virar desconto nem virar crédito — quem resolve é o DP pela fila de
//   intercorrências, e a reapuração lança o dia.
// • Dia de repouso (o da jornada, não "domingo") e feriado: previsto zero; o que
//   for trabalhado é extra de 100%, do primeiro minuto — não há jornada
//   contratada da qual variar, então não há tolerância a aplicar.
//
// FRONTEIRA COM A FOLHA
// he_50/he_100 saem em minutos CRUS — é isso que a folha paga (o fator do
// adicional é rubrica dela). O adicional noturno sai em minuto FICTO, que é o
// que a lei manda pagar; o minuto de relógio vai junto, em campo próprio, para o
// espelho e para a conferência. O banco de horas recebe os minutos JÁ
// multiplicados pelo fator da regra vigente, porque lá o fator é do ACORDO DE
// COMPENSAÇÃO. A memória mostra os números lado a lado para ninguém confundir.

// ------------------------------------------------------------------ contratos

export const TIPOS_MARCACAO = [
  "entrada",
  "saida",
  "inicio_intervalo",
  "fim_intervalo",
] as const;
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number];

export const TIPOS_INTERCORRENCIA = [
  "entrada_sem_saida",
  "intervalo_incompleto",
  "marcacao_duplicada",
  "sem_marcacao",
  "fora_da_tolerancia",
  // Único tipo que o motor NÃO detecta: depender do SALDO acumulado do banco
  // (que é histórico, não é dia) tiraria a pureza daqui. Quem o levanta é o
  // serviço, na hora de gravar o movimento — ver limitarMovimentoDoBanco().
  // Mora nesta lista porque a fila do DP é uma só.
  "banco_fora_do_limite",
] as const;
export type TipoIntercorrencia = (typeof TIPOS_INTERCORRENCIA)[number];

export const TIPOS_JORNADA = ["5x2", "6x1", "12x36", "escala_livre"] as const;
export type TipoJornada = (typeof TIPOS_JORNADA)[number];

/** Minutos em um dia — a unidade do "arraste" de turno que vira a noite. */
export const MINUTOS_DO_DIA = 1440;

/** Segundos em uma hora. Unidade de relógio: só converte relógio ↔ ficto. */
const SEGUNDOS_DA_HORA = 3600;

export interface MarcacaoMotor {
  id: number;
  /** Minutos desde a meia-noite do dia de apuração; ≥ 1440 se veio da virada. */
  minuto: number;
  tipo: TipoMarcacao;
}

export interface DiaMotor {
  /** AAAA-MM-DD em America/Sao_Paulo. */
  data: string;
  /** 0 domingo … 6 sábado. */
  dia_semana: number;
  /** Nome do feriado quando o dia é de REPOUSO; ponto facultativo não entra. */
  feriado: string | null;
  /**
   * Este dia era de trabalho na escala da pessoa? Só faz sentido em jornada sem
   * padrão semanal (12x36, escala livre), e quem responde é o serviço, a partir
   * de `ciclo_dias` da jornada e da âncora da escala do colaborador.
   * NULL = escala sem calendário cadastrado: o motor não tem como afirmar nem
   * negar, e diz isso na memória em vez de deixar o dia sumir calado.
   */
  dia_de_escala: boolean | null;
  marcacoes: MarcacaoMotor[];
}

export interface JornadaMotor {
  id: number;
  nome: string;
  tipo: TipoJornada;
  carga_diaria_minutos: number;
  carga_semanal_minutos: number;
  /**
   * Minutos previstos em cada dia da semana, índice 0 domingo … 6 sábado. NULL
   * em jornada sem padrão semanal (12x36, escala livre). O banco garante que a
   * soma fecha com carga_semanal_minutos — é o que impede uma jornada de
   * prometer "sábado 4h" no nome e prever 7h20 nos parâmetros.
   */
  previsto_por_dia_semana: number[] | null;
  intervalo_minimo_minutos: number;
  /** Acima deste tempo de trabalho o intervalo é obrigatório (art. 71 caput). */
  intervalo_obrigatorio_acima_minutos: number;
  tolerancia_entrada_minutos: number;
  tolerancia_saida_minutos: number;
  /** Início contratual da jornada, minutos desde a meia-noite. NULL = sem horário fixo. */
  horario_entrada_minuto: number | null;
  /** Fim contratual da jornada; pode passar de 1440 no turno que vira a noite. */
  horario_saida_minuto: number | null;
  /** Dia do repouso semanal (0 domingo … 6 sábado). NULL = sem dia fixo. */
  dia_repouso_semana: number | null;
  /** Divisor do DSR: em quantos dias a carga semanal se reparte. */
  dias_uteis_semana: number;
  /** Minutos desde a meia-noite (22:00 → 1320). */
  adicional_noturno_inicio_minuto: number;
  /** Minutos desde a meia-noite (05:00 → 300). */
  adicional_noturno_fim_minuto: number;
  /** Duração da hora noturna em SEGUNDOS (art. 73 §1º: 3150 = 52'30"). */
  hora_noturna_segundos: number;
  /**
   * Até este minuto do dia seguinte a batida de fechamento ainda é o fim do
   * turno da véspera. Parâmetro da jornada (rh.jornada_versao), não constante:
   * o padrão do banco é carga diária + intervalo mínimo, que é a amplitude do
   * turno — 780 (13:00) no 12x36, 588 (09:48) no 5x2 de 8h48. 0 desliga o
   * arraste. Ver a migration 0033 para o porquê de não ser um número no código.
   */
  janela_arraste_minutos: number;
}

export interface RegraBancoMotor {
  id: number | null;
  /** Quanto vale no BANCO cada minuto de HE 50% (1.00 = hora a hora). */
  fator_he_50: number;
  fator_he_100: number;
}

export interface EntradaApuracao {
  ano: number;
  mes: number;
  jornada: JornadaMotor;
  regra: RegraBancoMotor;
  /** Um item por dia do período, em ordem crescente de data. */
  dias: DiaMotor[];
}

export interface IntercorrenciaDetectada {
  data: string;
  tipo: TipoIntercorrencia;
  detalhe: string;
}

export interface DiaApurado {
  data: string;
  dia_semana: number;
  feriado: string | null;
  previsto_minutos: number;
  /** Tempo de relógio entre as batidas pareadas. */
  trabalhado_minutos: number;
  intervalo_minutos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  /** Minutos noturnos FICTOS (art. 73 §1º) — é o que a folha paga. */
  adicional_noturno_minutos: number;
  /** Minutos noturnos de RELÓGIO, antes da redução da hora noturna. */
  adicional_noturno_relogio_minutos: number;
  atraso_minutos: number;
  falta_minutos: number;
  /** Crédito (+) ou débito (−) que este dia manda ao banco, já com fator. */
  banco_minutos: number;
  intercorrencias: IntercorrenciaDetectada[];
  memoria: Record<string, unknown>;
}

export interface ResultadoApuracao {
  dias: DiaApurado[];
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  adicional_noturno_relogio_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  intercorrencias: IntercorrenciaDetectada[];
  memoria: Record<string, unknown>;
}

/** Erro de dados de entrada do motor (jornada incoerente, dia inválido…). */
export class ErroMotorPonto extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroMotorPonto";
  }
}

// ------------------------------------------------------------------ aritmética

/** Meio-para-cima no minuto. Só a hora ficta e o fator do banco precisam disto. */
function arredondarMinutos(valor: number): number {
  return Math.floor(valor + 0.5 + 1e-9);
}

/** Fator como razão inteira: minutos × (fator em centésimos) ÷ 100. */
function aplicarFator(minutos: number, fator: number): number {
  return arredondarMinutos((minutos * Math.round(fator * 100)) / 100);
}

// ------------------------------------------------- agrupamento por dia (puro)

export interface MarcacaoBruta {
  id: number;
  tipo: TipoMarcacao;
  /** AAAA-MM-DD já convertido para America/Sao_Paulo na borda do repositório. */
  data_local: string;
  /** 0..1439 no fuso local. */
  minuto_local: number;
}

function diaSeguinte(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return proximo.toISOString().slice(0, 10);
}

const ABRE_PERIODO: readonly TipoMarcacao[] = ["entrada", "fim_intervalo"];
const FECHA_PERIODO: readonly TipoMarcacao[] = ["saida", "inicio_intervalo"];

/** Quem está no intervalo ainda deve a volta — ou a saída de quem foi embora. */
const CONTINUA_INTERVALO: readonly TipoMarcacao[] = ["fim_intervalo", "saida"];

/**
 * O que a véspera ainda espera, pela ÚLTIMA batida dela. É isto que decide o
 * arraste da madrugada — não o tipo da batida nova, isolado:
 *   entrada / fim_intervalo → período aberto: falta fechar
 *   inicio_intervalo        → TURNO aberto com intervalo em curso: falta a
 *                             volta (ou a saída de quem foi sem bater a volta)
 *   saida                   → turno encerrado: a véspera não espera mais nada
 */
function continuacaoEsperada(ultima: TipoMarcacao): readonly TipoMarcacao[] {
  if (ABRE_PERIODO.includes(ultima)) return FECHA_PERIODO;
  if (ultima === "inicio_intervalo") return CONTINUA_INTERVALO;
  return [];
}

/**
 * Amarra cada marcação ao DIA DE APURAÇÃO. Regra do arraste: se a véspera
 * terminou com o TURNO aberto e a batida atual, dentro da JANELA DE ARRASTE DA
 * JORNADA, é a continuação que ela espera, essa batida pertence ao turno da
 * véspera e entra com minuto + 1440. Sem isso, o plantão 12x36 noturno
 * apareceria como "entrada sem saída" na véspera e "saída sem entrada" no dia
 * seguinte, todo santo dia.
 *
 * A janela é PARÂMETRO DA JORNADA e não hora fixa de relógio porque quem manda
 * nela é a amplitude do turno: 12h de plantão mais a 1h de intervalo do art. 71
 * dão 13h, então quem entra 19:00 ou 20:00 só fecha às 08:00 ou 09:00 do dia
 * seguinte. Com o 08:00 que ficava chumbado aqui, esses plantões — os mais
 * comuns que existem — viravam DOIS dias de falta integral, com DSR derrubado e
 * desconto descendo para a folha, enquanto a saída às 07:59 fechava sem nada.
 *
 * TURNO aberto não é PERÍODO aberto: quem inicia o intervalo às 23:30 fecha o
 * período e continua em plantão. Olhando só o período, a volta de 00:30 ficava
 * no dia seguinte e levava a saída junto — o plantão de 12h virava dois meios
 * plantões, com a jornada prevista contada duas vezes e um déficit fantasma
 * dos dois lados (CLT art. 71 obriga intervalo em turno de 12h, então todo
 * plantão noturno de verdade caía aqui).
 */
export function agruparMarcacoesPorDia(
  marcacoes: MarcacaoBruta[],
  jornada: JornadaMotor
): Map<string, MarcacaoMotor[]> {
  const ordenadas = [...marcacoes].sort((a, b) =>
    a.data_local === b.data_local
      ? a.minuto_local - b.minuto_local
      : a.data_local < b.data_local
        ? -1
        : 1
  );
  const porDia = new Map<string, MarcacaoMotor[]>();
  let ultimoDia: string | null = null;

  for (const bruta of ordenadas) {
    let diaDestino = bruta.data_local;
    let minuto = bruta.minuto_local;

    if (
      ultimoDia !== null &&
      diaSeguinte(ultimoDia) === bruta.data_local &&
      bruta.minuto_local < jornada.janela_arraste_minutos
    ) {
      const anterior = porDia.get(ultimoDia) ?? [];
      const ultima = anterior[anterior.length - 1];
      if (ultima && continuacaoEsperada(ultima.tipo).includes(bruta.tipo)) {
        diaDestino = ultimoDia;
        minuto = bruta.minuto_local + MINUTOS_DO_DIA;
      }
    }

    const lista = porDia.get(diaDestino) ?? [];
    lista.push({ id: bruta.id, minuto, tipo: bruta.tipo });
    porDia.set(diaDestino, lista);
    ultimoDia = diaDestino;
  }
  return porDia;
}

// ------------------------------------------------------------------ previsto

interface Previsto {
  minutos: number;
  motivo: string;
}

/**
 * Quanto a pessoa devia trabalhar neste dia. Nada aqui é decidido por dia da
 * semana escrito no código: jornada com padrão semanal lê `previsto_por_dia_semana`
 * (dado, com CHECK que exige fechar com a carga semanal) e jornada de escala lê
 * o calendário que o serviço resolveu pelo ciclo + âncora.
 */
function previstoDoDia(
  jornada: JornadaMotor,
  dia: DiaMotor,
  temMarcacao: boolean
): Previsto {
  if (dia.feriado !== null) {
    return { minutos: 0, motivo: `feriado (${dia.feriado}) — dia de repouso` };
  }

  const semanal = jornada.previsto_por_dia_semana;
  if (semanal) {
    const minutos = semanal[dia.dia_semana] ?? 0;
    return {
      minutos,
      motivo:
        minutos > 0
          ? `${jornada.tipo} — previsto do dia da semana cadastrado na jornada`
          : `${jornada.tipo} — dia sem previsão na jornada` +
            (dia.dia_semana === jornada.dia_repouso_semana
              ? " (repouso semanal)"
              : ""),
    };
  }

  // Escala sem padrão semanal (12x36, escala livre).
  if (dia.dia_de_escala === true) {
    return {
      minutos: jornada.carga_diaria_minutos,
      motivo: `${jornada.tipo} — dia de escala pelo ciclo da jornada`,
    };
  }
  if (dia.dia_de_escala === false) {
    return { minutos: 0, motivo: `${jornada.tipo} — folga pelo ciclo da escala` };
  }
  // Sem âncora cadastrada não dá para saber se o dia era de plantão. O dia com
  // marcação conta como dia de escala; o dia SEM marcação fica com previsto
  // zero e o motor não afirma falta que não sabe se existiu — mas o critério
  // fica escrito na memória, que é o que faltava antes (o dia sumia calado).
  return temMarcacao
    ? {
        minutos: jornada.carga_diaria_minutos,
        motivo: `${jornada.tipo} — sem âncora de escala: o dia com marcação conta como dia de escala`,
      }
    : {
        minutos: 0,
        motivo:
          `${jornada.tipo} — sem âncora de escala e sem marcação: o motor não ` +
          `consegue afirmar se era plantão; cadastre a âncora da escala para o ` +
          `dia sem batida virar falta`,
      };
}

// -------------------------------------------------------- pareamento do dia

interface Periodo {
  inicio: number;
  fim: number;
}

interface Pareamento {
  trabalhado: number;
  intervalo: number;
  periodos: Periodo[];
  intercorrencias: IntercorrenciaDetectada[];
  sequencia: { minuto: number; tipo: TipoMarcacao }[];
  /**
   * FALTOU BATIDA neste dia: turno que abriu e não fechou, fechamento sem
   * abertura, abertura sobre abertura ou intervalo sem retorno. O que o dia
   * mostra de "trabalhado" é, nesses casos, um número que NÃO é o que a pessoa
   * trabalhou: ora uma FRAÇÃO (o turno que ficou aberto sai da conta), ora um
   * EXCESSO (entre duas aberturas sem fechamento no meio, a lacuna entra no
   * período). Nos dois sentidos é número de coleta quebrada, e por isso o dia
   * não lança nada enquanto a intercorrência estiver aberta.
   *
   * Batida repetida IDÊNTICA (mesmo tipo no MESMO minuto) não entra aqui: nela,
   * e só nela, o pareamento continua íntegro depois do descarte.
   */
  incompleto: boolean;
}

function parearDia(dia: DiaMotor): Pareamento {
  const ordenadas = [...dia.marcacoes].sort((a, b) => a.minuto - b.minuto);
  const intercorrencias: IntercorrenciaDetectada[] = [];
  const periodos: Periodo[] = [];
  const consideradas: MarcacaoMotor[] = [];
  let incompleto = false;

  // 1) BATIDA REPETIDA IDÊNTICA — mesmo tipo NO MESMO MINUTO. É o único caso em
  //    que descartar a segunda deixa o pareamento íntegro, porque não existe
  //    tempo nenhum entre as duas: some o registro, não some hora.
  //
  //    Ele ainda existe porque o UNIQUE do banco olha o MOMENTO (com segundos) e
  //    o motor mede em MINUTO: 08:00:15 e 08:00:45 são duas linhas legítimas lá e
  //    a mesma batida aqui. É esse — e só esse — o "eco do coletor" de verdade.
  //
  //    O QUE ESTE RAMO NÃO PODE PEGAR, e por quê. Antes ele comparava só o
  //    TIPO e engolia qualquer batida do mesmo tipo em sequência, chamando a
  //    segunda de "eco do coletor". A justificativa não se sustenta: o índice
  //    UNIQUE `marcacao_sem_repeticao` (colaborador, momento, tipo) já barra no
  //    banco a batida repetida de verdade, e a importação rejeita a linha
  //    citando o motivo. O que chegava aqui com tipo igual e MINUTO DIFERENTE
  //    era, portanto, evento real — quase sempre o erro de coleta mais comum
  //    que existe: a pessoa esqueceu de bater a saída e a próxima batida do dia
  //    é outra entrada. Tratar isso como ruído fazia o dia ESCAPAR do guarda de
  //    pareamento incompleto e fechar como se a lacuna tivesse sido trabalhada:
  //    entrada 08:00 + entrada 13:00 + saída 18:00 rendia 10h corridas, 72 min
  //    de HORA EXTRA INVENTADA e 108 min creditados no banco, com a folha
  //    importando o número. Este ramo protegia o defeito com um comentário.
  //
  //    Tipo igual em minutos diferentes agora segue para a máquina de estados,
  //    que já sabe tratar os dois lados: abertura sobre abertura e fechamento
  //    sem abertura viram `entrada_sem_saida` e tornam o dia PENDENTE.
  //
  //    Nenhuma marcação some do banco em nenhum dos casos: ela continua lá,
  //    append-only; o que muda é só o que entra na conta do dia.
  for (const marcacao of ordenadas) {
    const anterior = consideradas[consideradas.length - 1];
    if (
      anterior &&
      anterior.tipo === marcacao.tipo &&
      anterior.minuto === marcacao.minuto
    ) {
      intercorrencias.push({
        data: dia.data,
        tipo: "marcacao_duplicada",
        detalhe:
          `duas marcações de "${marcacao.tipo}" no mesmo minuto ` +
          `(${formatarHora(marcacao.minuto)}); a segunda foi desconsiderada no ` +
          `cálculo — sem tempo entre as duas, o pareamento do dia não muda`,
      });
      continue;
    }
    consideradas.push(marcacao);
  }

  // 2) Máquina de estados: abre em entrada/fim_intervalo, fecha em
  //    saida/inicio_intervalo. O que sobrar aberto não vira hora.
  let aberto: number | null = null;
  let intervaloAberto: number | null = null;
  let intervalo = 0;
  for (const marcacao of consideradas) {
    if (ABRE_PERIODO.includes(marcacao.tipo)) {
      // ABERTURA EM CIMA DE ABERTURA: falta a batida de FECHAMENTO entre as
      // duas — esquecer o início do almoço, ou a saída do dia, é o erro de
      // coleta mais comum que existe. É EVENTO REAL, nunca ruído: o UNIQUE
      // `marcacao_sem_repeticao` já impede batida repetida de chegar até aqui
      // (ver o ramo 1). Por isso a resolução NÃO é a da batida repetida: lá o
      // descarte é inofensivo e o dia segue lançando; aqui o dia fica PENDENTE
      // DE TRATAMENTO e não lança falta, atraso nem hora extra, porque o tempo
      // entre as duas aberturas é desconhecido — a batida órfã sai da conta e o
      // período aberto é mantido só para o espelho mostrar o que houve.
      //
      // Este é o ramo que a comparação por tipo do passo 1 escondia quando as
      // duas aberturas eram do MESMO tipo ("entrada" seguida de "entrada"), que
      // é justamente o caso comum. Chegava aqui só a dupla de tipos diferentes
      // ("entrada" seguida de "fim_intervalo"); o resto fechava com hora extra
      // inventada.
      //
      // Antes disso tudo, o ramo fazia `aberto = marcacao.minuto` sem checar
      // nada: a manhã inteira sumia do trabalhado (240 min viravam atraso e
      // desciam a débito no banco de horas) ou — pior — o dia fechava batendo o
      // previsto e as horas extras da ponta evaporavam SEM UMA LINHA na fila do
      // DP. Os três ramos irmãos (repetida idêntica, fechamento sem abertura,
      // turno aberto no fim do dia) sempre registraram; só este ficava mudo.
      if (aberto !== null) {
        incompleto = true;
        intercorrencias.push({
          data: dia.data,
          tipo: "entrada_sem_saida",
          detalhe:
            `marcação de "${marcacao.tipo}" às ${formatarHora(marcacao.minuto)} ` +
            `com o período aberto às ${formatarHora(aberto)} ainda sem fechamento; ` +
            `falta a batida de saída ou de início de intervalo entre as duas — ` +
            `a batida órfã foi desconsiderada e o período aberto foi mantido`,
        });
        continue;
      }
      aberto = marcacao.minuto;
      if (marcacao.tipo === "fim_intervalo" && intervaloAberto !== null) {
        intervalo += marcacao.minuto - intervaloAberto;
        intervaloAberto = null;
      }
      continue;
    }
    if (FECHA_PERIODO.includes(marcacao.tipo)) {
      if (aberto === null) {
        incompleto = true;
        intercorrencias.push({
          data: dia.data,
          tipo: "entrada_sem_saida",
          detalhe:
            `marcação de "${marcacao.tipo}" às ${formatarHora(marcacao.minuto)} ` +
            `sem entrada correspondente`,
        });
        continue;
      }
      periodos.push({ inicio: aberto, fim: marcacao.minuto });
      aberto = null;
      if (marcacao.tipo === "inicio_intervalo") {
        intervaloAberto = marcacao.minuto;
      }
    }
  }
  if (aberto !== null) {
    incompleto = true;
    intercorrencias.push({
      data: dia.data,
      tipo: "entrada_sem_saida",
      detalhe:
        `turno aberto às ${formatarHora(aberto)} e nunca fechado; ` +
        `o período foi descartado da apuração`,
    });
  }
  if (intervaloAberto !== null) {
    incompleto = true;
    intercorrencias.push({
      data: dia.data,
      tipo: "intervalo_incompleto",
      detalhe: `intervalo iniciado às ${formatarHora(intervaloAberto)} sem retorno`,
    });
  }

  const trabalhado = periodos.reduce(
    (soma, periodo) => soma + (periodo.fim - periodo.inicio),
    0
  );
  return {
    trabalhado,
    intervalo,
    periodos,
    intercorrencias,
    sequencia: consideradas.map((m) => ({ minuto: m.minuto, tipo: m.tipo })),
    incompleto,
  };
}

// ------------------------------------------------------- adicional noturno

/**
 * Interseção dos períodos trabalhados com a janela noturna. A janela é replicada
 * na véspera e no dia seguinte porque o turno pode atravessar a meia-noite nos
 * dois sentidos (minuto negativo não existe, mas minuto > 1440 sim).
 */
function minutosNoturnos(periodos: Periodo[], jornada: JornadaMotor): number {
  const inicio = jornada.adicional_noturno_inicio_minuto;
  const fimBruto = jornada.adicional_noturno_fim_minuto;
  const fim = fimBruto <= inicio ? fimBruto + MINUTOS_DO_DIA : fimBruto;

  let total = 0;
  for (const deslocamento of [-MINUTOS_DO_DIA, 0, MINUTOS_DO_DIA]) {
    const janelaInicio = inicio + deslocamento;
    const janelaFim = fim + deslocamento;
    for (const periodo of periodos) {
      const inter =
        Math.min(periodo.fim, janelaFim) - Math.max(periodo.inicio, janelaInicio);
      if (inter > 0) total += inter;
    }
  }
  return total;
}

/**
 * HORA NOTURNA REDUZIDA — CLT art. 73 §1º. A hora do trabalho noturno vale
 * `hora_noturna_segundos` (3150 s = 52min30s no urbano), então cada minuto de
 * relógio na janela vale 3600 ÷ 3150 de minuto ficto: 7h de relógio = 8h
 * noturnas.
 *
 * O RESTO DE MINUTO é resolvido UMA única vez, meio-para-cima, sobre o TOTAL
 * NOTURNO DO DIA — nunca por período e nunca por hora. Arredondar antes e somar
 * depois acumularia até meio minuto por período; arredondar no fim do mês
 * esconderia o número do dia no espelho. O dia é a menor unidade que o
 * colaborador confere, então é nele que a fração morre.
 */
function noturnoFicto(relogioMinutos: number, jornada: JornadaMotor): number {
  if (relogioMinutos <= 0) return 0;
  return arredondarMinutos(
    (relogioMinutos * SEGUNDOS_DA_HORA) / jornada.hora_noturna_segundos
  );
}

// ------------------------------------------------------------------ formatação interna

/**
 * 440 → "7h20". Negativo sai com sinal: −95 → "−1h35".
 *
 * Mora no módulo puro (e é reexportada por esquemas.ts, onde o resto do sistema
 * a importa) porque os textos de memória e de intercorrência daqui precisam
 * dela, e calculo.ts não importa ninguém — é o que garante que o semeador possa
 * carregar este arquivo sem arrastar zod, pool de banco e Next.
 */
export function formatarMinutos(minutos: number): string {
  const sinal = minutos < 0 ? "−" : "";
  const absoluto = Math.abs(minutos);
  const horas = Math.floor(absoluto / 60);
  const resto = absoluto % 60;
  return `${sinal}${horas}h${String(resto).padStart(2, "0")}`;
}

/** Só para o texto da intercorrência e da memória — a conta nunca usa isto. */
function formatarHora(minuto: number): string {
  const normalizado = ((minuto % MINUTOS_DO_DIA) + MINUTOS_DO_DIA) % MINUTOS_DO_DIA;
  const hora = Math.floor(normalizado / 60);
  const resto = normalizado % 60;
  const sufixo = minuto >= MINUTOS_DO_DIA ? " (dia seguinte)" : "";
  return `${String(hora).padStart(2, "0")}:${String(resto).padStart(2, "0")}${sufixo}`;
}

// ------------------------------------------------------- tolerância do dia

/**
 * Uma variação medida em minutos, já orientada como DÉFICIT: positivo = tempo
 * que faltou (atraso), negativo = tempo que sobrou (hora extra).
 */
interface Variacao {
  rotulo: string;
  deficit: number;
  /** Quanto desta variação, sozinha, a lei manda ignorar (art. 58 §1º). */
  tolerancia: number;
}

interface ResumoTolerancia {
  atraso: number;
  extra: number;
  criterio: string;
  detalhe: Record<string, unknown>[];
}

/**
 * Aplica o art. 58 §1º: cada variação some se couber na tolerância DA PRÓPRIA
 * marcação, enquanto o total ignorado no dia couber no teto diário (a soma das
 * tolerâncias de entrada e saída). Passou do limite, computa-se a TOTALIDADE da
 * variação — não só o excedente (Súmula 366 do TST).
 *
 * O que ficou de fora vira atraso OU hora extra pelo SINAL, nunca por
 * compensação entre os dois. Era esse o defeito: o motor comparava só o saldo
 * do dia, então quem chegava 20 min atrasado e saía 20 min depois zerava as
 * duas pontas — o atraso desaparecia e a hora extra junto.
 */
function aplicarTolerancia(
  variacoes: Variacao[],
  toleranciaDiaria: number
): ResumoTolerancia {
  let ignorado = 0;
  let atraso = 0;
  let extra = 0;
  const detalhe: Record<string, unknown>[] = [];

  for (const variacao of variacoes) {
    const grandeza = Math.abs(variacao.deficit);
    const cabe =
      grandeza <= variacao.tolerancia && ignorado + grandeza <= toleranciaDiaria;
    if (cabe) {
      ignorado += grandeza;
      detalhe.push({
        variacao: variacao.rotulo,
        minutos: variacao.deficit,
        resultado: `dentro da tolerância de ${variacao.tolerancia} min da marcação`,
      });
      continue;
    }
    if (variacao.deficit > 0) atraso += variacao.deficit;
    else extra += -variacao.deficit;
    if (variacao.deficit !== 0) {
      detalhe.push({
        variacao: variacao.rotulo,
        minutos: variacao.deficit,
        resultado:
          variacao.deficit > 0
            ? `${variacao.deficit} min de atraso (totalidade, Súmula 366 TST)`
            : `${-variacao.deficit} min de excedente (totalidade, Súmula 366 TST)`,
      });
    }
  }
  return {
    atraso,
    extra,
    criterio: `tolerância por marcação, teto de ${toleranciaDiaria} min no dia (CLT art. 58 §1º)`,
    detalhe,
  };
}

// ------------------------------------------------------------------ DSR

/**
 * Primeiro dia da semana de repouso da pessoa. A semana do DSR corre de um
 * repouso ao outro — não do domingo civil, que só coincide com o repouso de
 * quem folga no domingo. Sem dia de repouso cadastrado (12x36), cai no domingo,
 * que é a preferência da Lei 605/49 art. 1º.
 */
function inicioDaSemana(
  data: string,
  diaSemana: number,
  diaRepouso: number | null
): string {
  const referencia = diaRepouso ?? 0;
  const deslocamento = (diaSemana - referencia + 7) % 7;
  const [ano, mes, dia] = data.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia - deslocamento));
  return base.toISOString().slice(0, 10);
}

interface ResumoDsr {
  minutos: number;
  semanas: Record<string, unknown>[];
  formula: string;
}

/**
 * DSR sobre faltas — Lei 605/49 art. 6º: o repouso semanal remunerado é devido
 * a quem cumpriu INTEGRALMENTE a jornada da semana. Uma falta injustificada
 * derruba o repouso daquela semana inteira, uma única vez (duas faltas na mesma
 * semana não descontam dois DSR).
 *
 * FÓRMULA EM MINUTOS
 *   DSR de um dia = carga_semanal_minutos ÷ dias_uteis_semana
 *     (o repouso vale a média de um dia de trabalho, e "um dia" depende de em
 *      quantos dias a carga da semana se reparte — 5 no administrativo, 6 na
 *      loja, 3 no plantão 12x36)
 *   desconto = número de semanas COM falta × DSR de um dia
 *
 * O divisor era 6 fixo, que só acerta quem trabalha 6 dias: na COMERCIAL-44 o
 * dia vale 528 min e o desconto saía 440 — 88 min de graça por semana com
 * falta, sempre a favor da empresa.
 *
 * Só a FALTA (dia inteiro sem trabalho) derruba o DSR nesta versão. Atraso
 * também derruba pela leitura literal da lei, mas isso pune duas vezes o mesmo
 * minuto e a diretoria não pediu — registrado como refinamento consciente.
 */
function dsrDeUmDia(jornada: JornadaMotor): number {
  return arredondarMinutos(
    jornada.carga_semanal_minutos / Math.max(1, jornada.dias_uteis_semana)
  );
}

function dsrPorSemana(dias: DiaApurado[], jornada: JornadaMotor): ResumoDsr {
  const umDia = dsrDeUmDia(jornada);
  const porSemana = new Map<string, string[]>();
  for (const dia of dias) {
    if (dia.falta_minutos <= 0) continue;
    const chave = inicioDaSemana(
      dia.data,
      dia.dia_semana,
      jornada.dia_repouso_semana
    );
    const lista = porSemana.get(chave) ?? [];
    lista.push(dia.data);
    porSemana.set(chave, lista);
  }
  const semanas = [...porSemana.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([inicio, faltas]) => ({
      semana_iniciada_em: inicio,
      dias_com_falta: faltas,
      dsr_perdido_minutos: umDia,
    }));
  return {
    minutos: semanas.length * umDia,
    semanas,
    formula:
      `semanas com falta × (carga semanal ÷ ${jornada.dias_uteis_semana} dias úteis ` +
      `da jornada) — Lei 605/49 art. 6º, um DSR por semana, não por falta`,
  };
}

// ------------------------------------------------------- crédito do banco

/**
 * O fator do acordo aplicado sobre o ACUMULADO da competência, com o crédito de
 * cada dia saindo da diferença entre dois acumulados. Assim a soma dos dias é,
 * por construção, igual ao fator aplicado no total do mês — e cada dia continua
 * inteiro e demonstrável na tela.
 *
 * Arredondar dia a dia dava outro número: 5 dias com 11 min de HE 50% a 1,50
 * creditavam 85 (17 × 5) contra os 83 do total, sempre a favor do empregado.
 * Meio minuto por dia com minuto ímpar, em 75 das 122 apurações da base.
 */
function creditosDoBanco(minutosPorDia: number[], fator: number): number[] {
  let cru = 0;
  let creditado = 0;
  return minutosPorDia.map((minutos) => {
    cru += minutos;
    const acumulado = aplicarFator(cru, fator);
    const doDia = acumulado - creditado;
    creditado = acumulado;
    return doDia;
  });
}

// ------------------------------------------------------- teto e piso do banco

export interface CreditoLimitado {
  /** O que de fato entra no livro. */
  lancado: number;
  /** O que sobrou de fora — nunca some: vira fila para o DP. */
  excedente: number;
  /** Vai para a memória da apuração, ao lado do saldo que produziu o corte. */
  memoria: Record<string, unknown>;
  /** Detalhe da intercorrência `banco_fora_do_limite`; null quando coube tudo. */
  intercorrencia: string | null;
}

/**
 * O TETO DA REGRA VALE PARA A APURAÇÃO TAMBÉM — e é aqui que ele é aplicado.
 *
 * O DEFEITO QUE ISTO CORRIGE. O limite positivo/negativo era conferido só no
 * lançamento manual do DP: com teto de 60 min, +1 min à mão voltava 422 citando
 * o teto e, no mesmo minuto, a apuração creditava 356 min sem bloqueio, sem
 * aviso e sem intercorrência. O caminho que move a maior parte do passivo
 * passava por cima do limite; o caminho marginal era barrado. A tela prometia um
 * limite que valia para 1% dos movimentos.
 *
 * A REGRA ESCOLHIDA, e por quê. **O banco de horas nunca ultrapassa os limites
 * da regra vigente. A apuração lança até o limite; o excedente NÃO é lançado e
 * vira intercorrência `banco_fora_do_limite` para o DP decidir.**
 *
 *   • O teto é do ACORDO DE COMPENSAÇÃO (CLT art. 59 §2º): hora que passa dele
 *     não pode ser compensada, tem que ser PAGA. E já é paga — a folha lança
 *     HE 50% e HE 100% em minutos CRUS a partir desta mesma apuração (rubricas
 *     1101/1102, `importarVariaveisDoPonto`), independentemente do banco. Então
 *     não creditar o excedente não tira um minuto de ninguém: só impede o livro
 *     de compensação de crescer além do que o acordo permite.
 *   • No lado negativo, o mesmo raciocínio espelhado: o débito que furaria o
 *     piso não entra no banco. Truncar débito é a direção SEGURA — o sistema
 *     nunca tira do trabalhador em silêncio; o que sobra vai para a fila para
 *     virar desconto em folha ou acordo, por decisão de gente.
 *   • O excedente não some: fica no número exato da intercorrência e na memória
 *     da apuração, ao lado do saldo que produziu o corte.
 *
 * O CORTE OLHA A DIREÇÃO, não o estado final: quem já está fora do intervalo
 * (saldo transportado da implantação, teto reduzido depois) continua podendo
 * andar EM DIREÇÃO ao limite. Barrar pelo estado final trancava o DP na
 * armadilha de não poder nem compensar quem estourou — é a mesma guarda que
 * `lancarMovimentoBanco` aplica no lançamento manual.
 *
 * LIMITAÇÃO ASSUMIDA: o teto é conferido contra o saldo NO MOMENTO da apuração.
 * Reapurar uma competência antiga não recalcula as seguintes (o crédito delas já
 * foi lançado e é append-only) — quem traz o DP de volta é a intercorrência.
 *
 * MORA NO MÓDULO PURO porque tem DOIS chamadores que não podem divergir: a
 * apuração do serviço e o semeador da demo. Enquanto a conta estava só no
 * serviço, o semeador gravava o crédito CRU e a base nascia com saldo que a
 * própria tela não reproduzia — clicar em "Reapurar" na frente do cliente
 * trocava 21h00 por 0h00. Aqui não há IO nem histórico: o saldo anterior CHEGA
 * por parâmetro, e é por isso que a conta pode ser pura.
 */
export function limitarCreditoDoBanco(
  saldoAntes: number,
  movimento: number,
  tetoPositivo: number,
  pisoNegativo: number,
  contexto: { regra: string; competencia: string }
): CreditoLimitado {
  const alvo = saldoAntes + movimento;
  const permitido =
    alvo > tetoPositivo && movimento > 0
      ? Math.max(tetoPositivo, saldoAntes)
      : alvo < pisoNegativo && movimento < 0
        ? Math.min(pisoNegativo, saldoAntes)
        : alvo;
  const lancado = permitido - saldoAntes;
  const excedente = movimento - lancado;
  return {
    lancado,
    excedente,
    memoria: {
      saldo_antes_minutos: saldoAntes,
      movimento_calculado_minutos: movimento,
      movimento_lancado_minutos: lancado,
      excedente_minutos: excedente,
      limite_positivo_minutos: tetoPositivo,
      limite_negativo_minutos: pisoNegativo,
      regra: contexto.regra,
      criterio:
        excedente === 0
          ? "movimento dentro dos limites da regra vigente"
          : `o movimento levaria o saldo a ${formatarMinutos(alvo)}, fora do ` +
            `intervalo da regra; foi lançado até o limite e o excedente de ` +
            `${formatarMinutos(excedente)} virou intercorrência para o DP decidir ` +
            `(a hora extra em si continua sendo paga em folha pelas rubricas de HE)`,
    },
    intercorrencia:
      excedente === 0
        ? null
        : `${contexto.competencia}: a apuração calculou ` +
          `${formatarMinutos(movimento)} para o banco de horas, mas o saldo ` +
          `(${formatarMinutos(saldoAntes)}) já está no limite da regra ` +
          `${contexto.regra} (teto ${formatarMinutos(tetoPositivo)}, ` +
          `piso ${formatarMinutos(pisoNegativo)}). ` +
          `Foram lançados ${formatarMinutos(lancado)} e sobraram ` +
          `${formatarMinutos(excedente)} FORA do banco — a hora extra continua ` +
          `sendo paga em folha; decida aqui se o excedente vira folga programada, ` +
          `aumento do teto na regra ou pagamento.`,
  };
}

// ------------------------------------------------------------------ motor

/** Estado bruto de um dia, antes de o fator do banco ser distribuído. */
interface DiaCru {
  dia: DiaMotor;
  previsto: Previsto;
  pareamento: Pareamento;
  noturnoRelogio: number;
  noturnoFictoMinutos: number;
  he50: number;
  he100: number;
  atraso: number;
  falta: number;
  regraAplicada: string;
  detalheTolerancia: Record<string, unknown>[];
  intercorrencias: IntercorrenciaDetectada[];
}

export function apurarPonto(entrada: EntradaApuracao): ResultadoApuracao {
  const { jornada, regra } = entrada;
  if (jornada.carga_diaria_minutos < 0 || jornada.carga_semanal_minutos < 0) {
    throw new ErroMotorPonto("Jornada com carga negativa — corrija a versão");
  }
  if (!Number.isInteger(jornada.carga_diaria_minutos)) {
    throw new ErroMotorPonto("Carga diária deve ser minuto inteiro");
  }
  if (jornada.hora_noturna_segundos <= 0) {
    throw new ErroMotorPonto(
      "Duração da hora noturna deve ser maior que zero — corrija a jornada"
    );
  }

  const toleranciaDiaria =
    jornada.tolerancia_entrada_minutos + jornada.tolerancia_saida_minutos;

  const crus: DiaCru[] = [];

  for (const dia of entrada.dias) {
    const temMarcacao = dia.marcacoes.length > 0;
    const previsto = previstoDoDia(jornada, dia, temMarcacao);
    const pareamento = parearDia(dia);
    const doDia: IntercorrenciaDetectada[] = [...pareamento.intercorrencias];

    const trabalhado = pareamento.trabalhado;
    const noturnoRelogio = minutosNoturnos(pareamento.periodos, jornada);
    const noturnoFictoMinutos = noturnoFicto(noturnoRelogio, jornada);
    // O acréscimo da hora ficta é jornada CUMPRIDA: 12h de relógio com 7h na
    // janela noturna valem 13h de trabalho para todos os efeitos, não só para o
    // adicional. É por isso que ele entra na conta do dia, e não só na folha.
    const acrescimoFicto = noturnoFictoMinutos - noturnoRelogio;
    const repouso =
      dia.feriado !== null ||
      (jornada.dia_repouso_semana !== null &&
        dia.dia_semana === jornada.dia_repouso_semana);

    // Intervalo obrigatório acima do limite da jornada (CLT art. 71).
    if (
      trabalhado > jornada.intervalo_obrigatorio_acima_minutos &&
      pareamento.intervalo < jornada.intervalo_minimo_minutos
    ) {
      doDia.push({
        data: dia.data,
        tipo: "intervalo_incompleto",
        detalhe:
          `${trabalhado} min trabalhados com apenas ${pareamento.intervalo} min de ` +
          `intervalo (mínimo da jornada: ${jornada.intervalo_minimo_minutos} min)`,
      });
    }

    let he50 = 0;
    let he100 = 0;
    let atraso = 0;
    let falta = 0;
    let regraAplicada: string;
    let detalheTolerancia: Record<string, unknown>[] = [];

    if (pareamento.incompleto) {
      // DIA PENDENTE DE TRATAMENTO — nada é lançado, nem contra nem a favor.
      //
      // "Não veio trabalhar" e "trabalhou e a coleta falhou" são fatos
      // diferentes, e o motor só sabe distinguir os dois por um sinal: se houve
      // ou não batida. Enquanto o pareamento estiver quebrado, o `trabalhado`
      // deste dia é uma FRAÇÃO desconhecida do que a pessoa cumpriu, e cobrar
      // dela a diferença é cobrar o defeito do relógio: quem bateu a entrada às
      // 08:00 e não bateu a saída levava 528 min de FALTA INTEGRAL mais 440 de
      // DSR derrubado — 968 minutos descontados em folha por uma batida que
      // faltou; quem esqueceu só a volta do almoço levava o resto do dia como
      // atraso, a débito no banco de horas.
      //
      // Também não vira hora extra: número que saiu de coleta quebrada não
      // vira lançamento em nenhuma das duas direções. O fato fica de pé na
      // intercorrência (o pareamento já a registrou), o DP ajusta a marcação e
      // a reapuração lança o dia certo — que é o caminho que o módulo já tem.
      // O `trabalhado` continua reportado como está: é fato observado, e o
      // espelho precisa mostrá-lo para o DP entender o que houve.
      regraAplicada =
        `pareamento incompleto (falta batida) — dia PENDENTE DE TRATAMENTO: ` +
        `nem falta, nem atraso, nem hora extra são lançados enquanto a ` +
        `intercorrência estiver aberta. Trabalhado observado: ${trabalhado} min ` +
        `de um previsto de ${previsto.minutos} min.`;
    } else if (previsto.minutos > 0 && trabalhado === 0) {
      falta = previsto.minutos;
      regraAplicada = "dia previsto sem nenhum minuto trabalhado — falta integral";
      if (!temMarcacao) {
        doDia.push({
          data: dia.data,
          tipo: "sem_marcacao",
          detalhe: `dia com ${previsto.minutos} min previstos e nenhuma marcação`,
        });
      }
    } else {
      // MODO DE MEDIÇÃO. Com horário contratual na jornada, cada marcação é
      // comparada com o horário dela e a tolerância é POR MARCAÇÃO, como manda o
      // art. 58 §1º. Sem horário — ou em dia cujo previsto não é a carga diária
      // cheia, onde o intervalo previsto seria outro —, o motor compara o saldo
      // do dia contra a tolerância diária e DIZ isso na memória.
      const temHorario =
        jornada.horario_entrada_minuto !== null &&
        jornada.horario_saida_minuto !== null;
      const modoPorMarcacao =
        temHorario &&
        previsto.minutos === jornada.carga_diaria_minutos &&
        previsto.minutos > 0 &&
        pareamento.periodos.length > 0;

      let variacoes: Variacao[];
      if (modoPorMarcacao) {
        const entradaPrevista = jornada.horario_entrada_minuto!;
        // Quem não bateu o intervalo trabalhou (ou devia ter trabalhado) direto:
        // a saída contratual dele é a entrada mais a jornada, sem a sobra do
        // almoço. Sem esta distinção, o dia de quem saiu no meio da manhã
        // cobrava o atraso até o horário do fim do turno E ainda pagava o
        // intervalo não gozado como hora extra.
        const temIntervaloMarcado = pareamento.periodos.length > 1;
        const intervaloPrevisto = temIntervaloMarcado
          ? Math.max(
              0,
              jornada.horario_saida_minuto! - entradaPrevista - previsto.minutos
            )
          : 0;
        const saidaPrevista = temIntervaloMarcado
          ? jornada.horario_saida_minuto!
          : entradaPrevista + previsto.minutos;
        const entradaReal = pareamento.periodos[0].inicio;
        const saidaReal =
          pareamento.periodos[pareamento.periodos.length - 1].fim;
        // Déficit positivo em toda a linha: chegar depois falta tempo, parar
        // mais tempo falta tempo, sair antes falta tempo.
        variacoes = [
          {
            rotulo: `entrada (previsto ${formatarHora(entradaPrevista)}, real ${formatarHora(entradaReal)})`,
            deficit: entradaReal - entradaPrevista,
            tolerancia: jornada.tolerancia_entrada_minutos,
          },
          {
            rotulo: `intervalo (previsto ${intervaloPrevisto} min, real ${pareamento.intervalo} min)`,
            deficit: pareamento.intervalo - intervaloPrevisto,
            // Duas marcações (ida e volta), então duas tolerâncias.
            tolerancia: toleranciaDiaria,
          },
          {
            rotulo: `saída (previsto ${formatarHora(saidaPrevista)}, real ${formatarHora(saidaReal)})`,
            deficit: saidaPrevista - saidaReal,
            tolerancia: jornada.tolerancia_saida_minutos,
          },
        ];
        if (acrescimoFicto !== 0) {
          variacoes.push({
            rotulo: "hora noturna reduzida (CLT art. 73 §1º)",
            deficit: -acrescimoFicto,
            tolerancia: 0, // hora ficta é jornada cumprida, não variação de marcação
          });
        }
      } else {
        variacoes = [
          {
            rotulo: "saldo do dia (trabalhado + hora ficta − previsto)",
            deficit: previsto.minutos - (trabalhado + acrescimoFicto),
            // Em dia de repouso não há jornada contratada da qual variar: o
            // art. 58 §1º não se aplica e o primeiro minuto já é hora extra.
            tolerancia: previsto.minutos > 0 ? toleranciaDiaria : 0,
          },
        ];
      }

      const resumo = aplicarTolerancia(variacoes, toleranciaDiaria);
      detalheTolerancia = resumo.detalhe;
      atraso = resumo.atraso;
      if (repouso) he100 = resumo.extra;
      else he50 = resumo.extra;

      const comoMediu = modoPorMarcacao
        ? "variação de cada marcação contra o horário contratual da jornada"
        : temHorario
          ? "saldo do dia (a jornada tem horário contratual, mas o previsto deste dia não é a carga diária cheia)"
          : "saldo do dia (a jornada não tem horário contratual cadastrado)";
      const destino = repouso
        ? "excedente em dia de repouso/feriado — 100%"
        : "excedente — 50%";
      regraAplicada =
        `${comoMediu}; ${resumo.criterio}. ` +
        `Resultado: ${atraso} min de atraso e ${resumo.extra} min de ${destino}.`;

      if (atraso > 0) {
        doDia.push({
          data: dia.data,
          tipo: "fora_da_tolerancia",
          detalhe:
            `previsto ${previsto.minutos} min, trabalhado ${trabalhado} min` +
            (acrescimoFicto > 0
              ? ` (+${acrescimoFicto} min de hora noturna ficta)`
              : "") +
            ` — ${atraso} min de atraso acima da tolerância de ${toleranciaDiaria} min`,
        });
      }
    }

    crus.push({
      dia,
      previsto,
      pareamento,
      noturnoRelogio,
      noturnoFictoMinutos,
      he50,
      he100,
      atraso,
      falta,
      regraAplicada,
      detalheTolerancia,
      intercorrencias: doDia,
    });
  }

  // O fator do acordo só pode ser aplicado depois que a competência inteira
  // está apurada — ver creditosDoBanco().
  const creditos50 = creditosDoBanco(
    crus.map((cru) => cru.he50),
    regra.fator_he_50
  );
  const creditos100 = creditosDoBanco(
    crus.map((cru) => cru.he100),
    regra.fator_he_100
  );

  const dias: DiaApurado[] = [];
  const intercorrencias: IntercorrenciaDetectada[] = [];

  crus.forEach((cru, indice) => {
    const credito50 = creditos50[indice];
    const credito100 = creditos100[indice];
    // Banco de horas: crédito das extras COM o fator do acordo; débito do
    // atraso hora a hora. A FALTA integral NÃO entra no banco — vira desconto
    // em folha (com DSR), senão o mesmo dia seria cobrado duas vezes.
    const bancoDoDia = credito50 + credito100 - cru.atraso;
    const acrescimoFicto = cru.noturnoFictoMinutos - cru.noturnoRelogio;

    dias.push({
      data: cru.dia.data,
      dia_semana: cru.dia.dia_semana,
      feriado: cru.dia.feriado,
      previsto_minutos: cru.previsto.minutos,
      trabalhado_minutos: cru.pareamento.trabalhado,
      intervalo_minutos: cru.pareamento.intervalo,
      he_50_minutos: cru.he50,
      he_100_minutos: cru.he100,
      adicional_noturno_minutos: cru.noturnoFictoMinutos,
      adicional_noturno_relogio_minutos: cru.noturnoRelogio,
      atraso_minutos: cru.atraso,
      falta_minutos: cru.falta,
      banco_minutos: bancoDoDia,
      intercorrencias: cru.intercorrencias,
      memoria: {
        previsto: {
          minutos: cru.previsto.minutos,
          criterio: cru.previsto.motivo,
          dia_de_escala: cru.dia.dia_de_escala,
        },
        marcacoes: cru.pareamento.sequencia.map(
          (m) => `${formatarHora(m.minuto)} ${m.tipo}`
        ),
        periodos: cru.pareamento.periodos.map(
          (p) =>
            `${formatarHora(p.inicio)}–${formatarHora(p.fim)} = ${p.fim - p.inicio} min`
        ),
        trabalhado_minutos: cru.pareamento.trabalhado,
        intervalo_minutos: cru.pareamento.intervalo,
        pendente_de_tratamento: cru.pareamento.incompleto,
        regra_aplicada: cru.regraAplicada,
        variacoes: cru.detalheTolerancia,
        tolerancia_diaria_minutos: toleranciaDiaria,
        adicional_noturno: {
          minutos_relogio: cru.noturnoRelogio,
          minutos_fictos: cru.noturnoFictoMinutos,
          acrescimo_da_hora_ficta_minutos: acrescimoFicto,
          janela: `${formatarHora(jornada.adicional_noturno_inicio_minuto)}–${formatarHora(
            jornada.adicional_noturno_fim_minuto
          )}`,
          hora_noturna_segundos: jornada.hora_noturna_segundos,
          observacao:
            `hora noturna reduzida do art. 73 §1º: cada minuto de relógio na ` +
            `janela vale 3600 ÷ ${jornada.hora_noturna_segundos} de minuto ficto. ` +
            `A folha paga o ficto; o acréscimo também conta como jornada cumprida.`,
        },
        banco_de_horas: {
          he_50_minutos_crus: cru.he50,
          fator_he_50: regra.fator_he_50,
          credito_50_minutos: credito50,
          he_100_minutos_crus: cru.he100,
          fator_he_100: regra.fator_he_100,
          credito_100_minutos: credito100,
          debito_atraso_minutos: cru.atraso,
          movimento_minutos: bancoDoDia,
          observacao:
            "falta integral não vai ao banco: vira desconto em folha com DSR. " +
            "O fator é aplicado sobre o acumulado da competência e o crédito do " +
            "dia é a diferença entre dois acumulados, para a soma dos dias bater " +
            "com o fator aplicado no total.",
        },
      },
    });
    intercorrencias.push(...cru.intercorrencias);
  });

  const somar = (extrator: (dia: DiaApurado) => number): number =>
    dias.reduce((total, dia) => total + extrator(dia), 0);

  const dsr = dsrPorSemana(dias, jornada);
  const saldoBanco = somar((dia) => dia.banco_minutos);
  const noturnoRelogioTotal = somar((dia) => dia.adicional_noturno_relogio_minutos);
  const noturnoFictoTotal = somar((dia) => dia.adicional_noturno_minutos);

  return {
    dias,
    minutos_trabalhados: somar((dia) => dia.trabalhado_minutos),
    minutos_previstos: somar((dia) => dia.previsto_minutos),
    he_50_minutos: somar((dia) => dia.he_50_minutos),
    he_100_minutos: somar((dia) => dia.he_100_minutos),
    adicional_noturno_minutos: noturnoFictoTotal,
    adicional_noturno_relogio_minutos: noturnoRelogioTotal,
    faltas_minutos: somar((dia) => dia.falta_minutos),
    atrasos_minutos: somar((dia) => dia.atraso_minutos),
    dsr_desconto_minutos: dsr.minutos,
    saldo_banco_minutos: saldoBanco,
    intercorrencias,
    memoria: {
      competencia: `${String(entrada.mes).padStart(2, "0")}/${entrada.ano}`,
      jornada: {
        id: jornada.id,
        nome: jornada.nome,
        tipo: jornada.tipo,
        carga_diaria_minutos: jornada.carga_diaria_minutos,
        carga_semanal_minutos: jornada.carga_semanal_minutos,
        previsto_por_dia_semana: jornada.previsto_por_dia_semana,
        horario_contratual:
          jornada.horario_entrada_minuto === null
            ? "sem horário fixo — tolerância medida pelo saldo do dia"
            : `${formatarHora(jornada.horario_entrada_minuto)}–${formatarHora(
                jornada.horario_saida_minuto!
              )}`,
        dia_repouso_semana: jornada.dia_repouso_semana,
        dias_uteis_semana: jornada.dias_uteis_semana,
        tolerancia_diaria_minutos: toleranciaDiaria,
        intervalo_minimo_minutos: jornada.intervalo_minimo_minutos,
        intervalo_obrigatorio_acima_minutos:
          jornada.intervalo_obrigatorio_acima_minutos,
        hora_noturna_segundos: jornada.hora_noturna_segundos,
      },
      regra_banco_horas: {
        id: regra.id,
        fator_he_50: regra.fator_he_50,
        fator_he_100: regra.fator_he_100,
      },
      adicional_noturno: {
        minutos_relogio: noturnoRelogioTotal,
        minutos_fictos: noturnoFictoTotal,
        formula: `relógio × 3600 ÷ ${jornada.hora_noturna_segundos}, arredondado uma vez por dia`,
      },
      dsr: {
        formula: dsr.formula,
        dsr_de_um_dia_minutos: dsrDeUmDia(jornada),
        semanas_com_falta: dsr.semanas,
        total_minutos: dsr.minutos,
      },
      saldo_banco: {
        formula:
          "fator do acordo aplicado sobre o ACUMULADO da competência (HE 50% e " +
          "HE 100% separadas), menos os atrasos hora a hora",
        total_minutos: saldoBanco,
      },
      unidade: "todos os números em MINUTOS INTEIROS",
      dias_apurados: dias.length,
      intercorrencias_detectadas: intercorrencias.length,
    },
  };
}
