import { z } from "zod";
import { esquemaData } from "../../lib/data-civil";
import {
  formatarMinutos,
  TIPOS_INTERCORRENCIA,
  TIPOS_JORNADA,
  TIPOS_MARCACAO,
  TipoIntercorrencia,
  TipoJornada,
  TipoMarcacao,
} from "./calculo";

// Nada entra no domínio sem passar por aqui. HORA é sempre MINUTO INTEIRO: os
// esquemas aceitam "7:20" ou "440" do usuário e devolvem 440 — a borda converte,
// o miolo nunca vê string de hora.

// ------------------------------------------------------------------ conversões

/** "07:20" → 440. Aceita "7:20", "07:20:00" e minutos crus ("440"). */
export function horaParaMinutos(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === "") return null;
  const comDoisPontos = /^(\d{1,3}):([0-5]\d)(?::[0-5]\d)?$/.exec(limpo);
  if (comDoisPontos) {
    return Number(comDoisPontos[1]) * 60 + Number(comDoisPontos[2]);
  }
  if (/^\d{1,5}$/.test(limpo)) return Number(limpo);
  return null;
}

// 440 → "7h20". A implementação mora em calculo.ts (o módulo puro precisa dela
// para os textos de memória e não pode importar daqui); segue exportada por
// este arquivo, que é de onde o resto do sistema sempre a importou.
export { formatarMinutos };

/** 1320 → "22:00" (relógio, para janela noturna e marcação). */
export function formatarRelogio(minutos: number): string {
  const normalizado = ((minutos % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalizado / 60)).padStart(2, "0")}:${String(
    normalizado % 60
  ).padStart(2, "0")}`;
}

export function formatarCompetencia(ano: number, mes: number): string {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

// ------------------------------------------------------------------ rótulos

export const ROTULOS_TIPO_JORNADA: Record<TipoJornada, string> = {
  "5x2": "5x2 (segunda a sexta)",
  "6x1": "6x1 (segunda a sábado)",
  "12x36": "12x36 (plantão)",
  escala_livre: "Escala livre",
};

export const ROTULOS_TIPO_MARCACAO: Record<TipoMarcacao, string> = {
  entrada: "Entrada",
  saida: "Saída",
  inicio_intervalo: "Início do intervalo",
  fim_intervalo: "Fim do intervalo",
};

export const ORIGENS_MARCACAO = ["rep_p", "importacao", "ajuste_manual"] as const;
export type OrigemMarcacao = (typeof ORIGENS_MARCACAO)[number];

export const ROTULOS_ORIGEM_MARCACAO: Record<OrigemMarcacao, string> = {
  rep_p: "REP-P (relógio homologado)",
  importacao: "Importação de arquivo",
  ajuste_manual: "Ajuste manual do DP",
};

export const ROTULOS_TIPO_INTERCORRENCIA: Record<TipoIntercorrencia, string> = {
  entrada_sem_saida: "Entrada sem saída",
  intervalo_incompleto: "Intervalo incompleto",
  marcacao_duplicada: "Marcação duplicada",
  sem_marcacao: "Dia sem marcação",
  fora_da_tolerancia: "Fora da tolerância",
  banco_fora_do_limite: "Banco de horas no limite",
};

/**
 * Intercorrências cujo tratamento MUDA O NÚMERO da apuração — e que por isso
 * deixam o insumo da folha provisório enquanto estiverem abertas.
 *
 * Todas menos uma: `banco_fora_do_limite` não é dia que a apuração não fechou,
 * é decisão sobre o BANCO (o excedente que não coube no teto vira folga, teto
 * maior ou pagamento). A hora extra que a produziu já está lançada e vai à
 * folha inteira, então travar a importação por causa dela seria barrar o DP por
 * um assunto que não muda um centavo da competência.
 */
export const TIPOS_INTERCORRENCIA_QUE_MUDAM_A_APURACAO: TipoIntercorrencia[] =
  TIPOS_INTERCORRENCIA.filter((tipo) => tipo !== "banco_fora_do_limite");

export const STATUS_INTERCORRENCIA = [
  "aberta",
  "corrigida",
  "justificada",
  "ignorada",
  // Escrito só pela reapuração (0037): o motor deixou de acusar o fato. Antes
  // dele a reapuração APAGAVA a linha aberta, e o que tinha sido resolvido
  // sumia da base sem deixar rastro em lugar nenhum.
  "resolvida_por_reapuracao",
] as const;
export type StatusIntercorrencia = (typeof STATUS_INTERCORRENCIA)[number];

/** Desfechos que uma PESSOA escolhe — o da reapuração é constatação da máquina. */
export const STATUS_INTERCORRENCIA_TRATAVEIS = [
  "corrigida",
  "justificada",
  "ignorada",
] as const;

export const ROTULOS_STATUS_INTERCORRENCIA: Record<StatusIntercorrencia, string> =
  {
    aberta: "Aberta",
    corrigida: "Corrigida",
    justificada: "Justificada",
    ignorada: "Ignorada",
    resolvida_por_reapuracao: "Resolvida pela reapuração",
  };

export const ABRANGENCIAS_FERIADO = [
  "nacional",
  "estadual",
  "municipal",
] as const;
export type AbrangenciaFeriado = (typeof ABRANGENCIAS_FERIADO)[number];

export const ROTULOS_ABRANGENCIA_FERIADO: Record<AbrangenciaFeriado, string> = {
  nacional: "Nacional",
  estadual: "Estadual",
  municipal: "Municipal",
};

export const TIPOS_FERIADO = ["feriado", "ponto_facultativo"] as const;
export type TipoFeriado = (typeof TIPOS_FERIADO)[number];

export const ROTULOS_TIPO_FERIADO: Record<TipoFeriado, string> = {
  feriado: "Feriado (dia de repouso)",
  ponto_facultativo: "Ponto facultativo (dia útil)",
};

// 'apuracao' e 'estorno_apuracao' são ATOS DO SISTEMA — só a apuração os grava,
// e os dois exigem apuracao_id (CHECK da 0036). O DP escolhe entre as outras
// quatro; é por isso que `esquemaMovimentoBanco` não repete esta lista.
export const ORIGENS_MOVIMENTO_BANCO = [
  "apuracao",
  "estorno_apuracao",
  "compensacao",
  "expiracao",
  "ajuste",
  "rescisao",
] as const;
export type OrigemMovimentoBanco = (typeof ORIGENS_MOVIMENTO_BANCO)[number];

export const ROTULOS_ORIGEM_MOVIMENTO: Record<OrigemMovimentoBanco, string> = {
  apuracao: "Apuração da competência",
  estorno_apuracao: "Estorno de apuração (reapuração)",
  compensacao: "Compensação (folga/desconto)",
  expiracao: "Expiração de saldo",
  ajuste: "Ajuste manual",
  rescisao: "Rescisão",
};

export const TRATAMENTOS_RESCISAO = ["paga", "perde", "compensa"] as const;
export type TratamentoRescisao = (typeof TRATAMENTOS_RESCISAO)[number];

export const ROTULOS_TRATAMENTO_RESCISAO: Record<TratamentoRescisao, string> = {
  paga: "Paga o saldo positivo na rescisão",
  perde: "Saldo é perdido na rescisão",
  compensa: "Compensa no aviso prévio",
};

// ------------------------------------------------------------------ primitivos

/** Minuto inteiro; aceita "7:20" vindo do formulário. */
const esquemaMinutos = (max: number) =>
  z
    .union([z.number(), z.string()])
    .transform((valor, contexto) => {
      const minutos =
        typeof valor === "number" ? Math.round(valor) : horaParaMinutos(valor);
      if (minutos === null) {
        contexto.addIssue({
          code: "custom",
          message: "Informe a duração em minutos ou no formato HH:MM",
        });
        return z.NEVER;
      }
      return minutos;
    })
    .refine((minutos) => minutos >= 0 && minutos <= max, {
      message: `Duração fora do limite (0 a ${max} minutos)`,
    });

/**
 * Minuto inteiro OPCIONAL: campo em branco vira `undefined` e a coluna fica
 * NULL, para o banco aplicar o padrão dele. Sem isto o formulário vazio cairia
 * em "informe a duração", e o padrão da tabela nunca seria alcançável pela tela.
 */
const esquemaMinutosOpcional = (max: number) =>
  z.preprocess(
    (valor) =>
      valor === "" || valor === null || (typeof valor === "string" && valor.trim() === "")
        ? undefined
        : valor,
    esquemaMinutos(max).optional()
  );

const esquemaRelogio = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato HH:MM");

// ------------------------------------------------------------------ jornada

export const esquemaNovaJornada = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(2, "Código muito curto")
      .max(40)
      .regex(/^[A-Z0-9-]+$/, "Use letras maiúsculas, números e hífen"),
    nome: z.string().trim().min(3, "Informe o nome da jornada").max(120),
    tipo: z.enum(TIPOS_JORNADA),
    carga_diaria: esquemaMinutos(1440),
    carga_semanal: esquemaMinutos(10080),
    intervalo_minimo: esquemaMinutos(480),
    tolerancia_entrada: esquemaMinutos(60),
    tolerancia_saida: esquemaMinutos(60),
    adicional_noturno_inicio: esquemaRelogio,
    adicional_noturno_fim: esquemaRelogio,
    /**
     * Janela do arraste de virada (minuto do dia seguinte). Em branco = o banco
     * deriva de carga diária + intervalo mínimo, que é a amplitude do turno.
     * Só se informa aqui quando o acordo coletivo alonga a amplitude.
     */
    janela_arraste: esquemaMinutosOpcional(1439),
    /**
     * PARÂMETROS DA 0034. Continuam OPCIONAIS os que são consequência do que a
     * pessoa digitou — o banco os deriva do tipo e da carga (previsto da
     * semana, ciclo do 12x36) e o CHECK recusa a incoerência.
     */
    previsto_por_dia_semana: z
      .array(esquemaMinutos(1440))
      .length(7, "Informe os 7 dias da semana, de domingo a sábado")
      .optional(),
    ciclo_dias: z.number().int().min(1).max(31).optional(),
    /**
     * OS TRÊS OBRIGATÓRIOS DA 0043. Até ela, os três eram opcionais aqui e o
     * trigger da 0034 os adivinhava — e como a tela nunca ofereceu campo para
     * nenhum, TODA jornada criada pelo sistema nascia com hora noturna,
     * divisor de DSR e dia de repouso que ninguém escolheu. Os três decidem
     * dinheiro, nenhum deriva da carga digitada, e o banco não os preenche
     * mais: sem eles o INSERT falha (ver o cabeçalho da 0043).
     *
     * `dia_repouso_semana` aceita NULL porque NULL RESPONDE alguma coisa —
     * "esta jornada não tem repouso em dia fixo do calendário", que é o 12x36.
     * O que não se aceita é a ausência: a chave tem de vir.
     */
    dia_repouso_semana: z
      .number("Escolha o dia de repouso ou declare que não há dia fixo")
      .int()
      .min(0)
      .max(6)
      .nullable(),
    dias_uteis_semana: z
      .number("Informe em quantos dias a carga semanal se reparte (divisor do DSR)")
      .int()
      .min(1)
      .max(7),
    /**
     * Duração da hora noturna em SEGUNDOS. 3150 = 52min30s é o urbano do art.
     * 73 §1º; 3600 desliga a redução, que é o rural da Lei 5.889/73 art. 7º.
     */
    hora_noturna_segundos: z
      .number("Informe a duração da hora noturna em segundos")
      .int()
      .min(1)
      .max(3600),
    /** Acima deste tempo trabalhado o intervalo é obrigatório (art. 71 caput). */
    intervalo_obrigatorio_acima: esquemaMinutos(1440),
    horario_entrada: esquemaMinutosOpcional(1439),
    horario_saida: esquemaMinutosOpcional(2879),
    inicio_vigencia: esquemaData,
  })
  .superRefine((dados, contexto) => {
    if (dados.carga_semanal < dados.carga_diaria) {
      contexto.addIssue({
        code: "custom",
        path: ["carga_semanal"],
        message: "Carga semanal não pode ser menor que a diária",
      });
    }
    if (dados.adicional_noturno_inicio === dados.adicional_noturno_fim) {
      contexto.addIssue({
        code: "custom",
        path: ["adicional_noturno_fim"],
        message: "A janela noturna não pode começar e terminar no mesmo horário",
      });
    }
    // Guarda contra reintroduzir o defeito que a 0033 corrigiu: janela menor que
    // a amplitude do turno faz o plantão que vira a noite virar falta integral.
    // Zero é escolha legítima e explícita — desliga o arraste.
    const amplitude = dados.carga_diaria + dados.intervalo_minimo;
    if (
      dados.janela_arraste !== undefined &&
      dados.janela_arraste > 0 &&
      dados.janela_arraste < amplitude
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["janela_arraste"],
        message:
          `A janela precisa cobrir a amplitude do turno (${amplitude} min = carga ` +
          `diária + intervalo mínimo), senão o turno que vira a noite é apurado ` +
          `como falta. Deixe em branco para o padrão ou use 0 para desligar o arraste`,
      });
    }
    // O previsto da semana TEM de fechar com a carga semanal — é a mesma
    // exigência do CHECK da 0034, repetida aqui só para o erro chegar no campo
    // certo da tela em vez de vir como violação de restrição do banco. Foi esta
    // incoerência que produziu a jornada chamada "sábado 4h" prevendo 7h20.
    if (dados.previsto_por_dia_semana) {
      const soma = dados.previsto_por_dia_semana.reduce(
        (total, minutos) => total + minutos,
        0
      );
      if (soma !== dados.carga_semanal) {
        contexto.addIssue({
          code: "custom",
          path: ["previsto_por_dia_semana"],
          message:
            `A soma dos 7 dias (${soma} min) tem de fechar com a carga semanal ` +
            `(${dados.carga_semanal} min)`,
        });
      }
      // O DIVISOR DO DSR TEM DE SER O NÚMERO DE DIAS QUE A PESSOA TRABALHA.
      // Enquanto ele era derivado no banco por `round(semanal ÷ diária)`, um
      // 5x2 de 8h/44h saía com 6 (round(5,5)) e o DSR de quem trabalha 5 dias
      // era pago por 2640 ÷ 6 = 440 em vez de 2640 ÷ 5 = 528. Com o previsto da
      // semana à vista, a conferência é direta: dia previsto é dia trabalhado.
      const diasComPrevisto = dados.previsto_por_dia_semana.filter(
        (minutos) => minutos > 0
      ).length;
      if (diasComPrevisto !== dados.dias_uteis_semana) {
        contexto.addIssue({
          code: "custom",
          path: ["dias_uteis_semana"],
          message:
            `O previsto da semana tem ${diasComPrevisto} dia(s) de trabalho, mas o ` +
            `divisor do DSR diz ${dados.dias_uteis_semana}. O divisor é em quantos ` +
            `dias a carga da semana se reparte — corrija um dos dois`,
        });
      }
      // Dia de repouso com jornada prevista não é repouso. É a incoerência que
      // fazia a loja de folga rotativa receber domingo (previsto 0, pago 100%)
      // como se fosse o descanso dela e o descanso real como dia comum.
      if (
        dados.dia_repouso_semana !== null &&
        dados.previsto_por_dia_semana[dados.dia_repouso_semana] > 0
      ) {
        contexto.addIssue({
          code: "custom",
          path: ["dia_repouso_semana"],
          message:
            `O dia de repouso escolhido tem ` +
            `${dados.previsto_por_dia_semana[dados.dia_repouso_semana]} min previstos. ` +
            `Zere o previsto desse dia ou escolha outro dia de repouso`,
        });
      }
    }
    // ESCOLHEU DIA DE REPOUSO, TEM DE MOSTRAR A SEMANA. Sem o previsto em mãos
    // não há como conferir que o dia escolhido está com previsto zero, e a
    // derivação do banco zera domingo (e sábado no 5x2) — quem folga na quarta
    // gravaria uma jornada que prevê trabalho justamente no dia que declarou de
    // descanso, e o motor pagaria a quarta como dia comum e o domingo em dobro.
    if (
      dados.dia_repouso_semana !== null &&
      dados.previsto_por_dia_semana === undefined
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["previsto_por_dia_semana"],
        message:
          "Com dia de repouso escolhido, informe os 7 dias da semana (0 no dia " +
          "de folga): é o que prova que o repouso está com previsto zero",
      });
    }
    // Horário contratual é par: com um só, não dá para medir variação nenhuma.
    if (
      (dados.horario_entrada === undefined) !==
      (dados.horario_saida === undefined)
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["horario_saida"],
        message:
          "Informe entrada E saída do horário contratual, ou deixe os dois em branco",
      });
    }
    if (
      dados.horario_entrada !== undefined &&
      dados.horario_saida !== undefined &&
      dados.horario_saida - dados.horario_entrada < dados.carga_diaria
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["horario_saida"],
        message:
          `Entre entrada e saída têm de caber a carga diária (${dados.carga_diaria} min) ` +
          `mais o intervalo`,
      });
    }
  });

export type NovaJornada = z.infer<typeof esquemaNovaJornada>;

export const esquemaNovaEscala = z.object({
  colaborador_id: z.number().int().positive(),
  jornada_versao_id: z.number().int().positive(),
  inicio_vigencia: esquemaData,
  observacao: z.string().trim().max(500).optional(),
});

export type NovaEscala = z.infer<typeof esquemaNovaEscala>;

// ------------------------------------------------------------------ feriado

export const esquemaNovoFeriado = z
  .object({
    data: esquemaData,
    nome: z.string().trim().min(3, "Informe o nome do feriado").max(120),
    abrangencia: z.enum(ABRANGENCIAS_FERIADO),
    tipo: z.enum(TIPOS_FERIADO).default("feriado"),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "UF com 2 letras")
      .nullish(),
    municipio: z.string().trim().min(2).max(120).nullish(),
    estabelecimento_id: z.number().int().positive().nullish(),
  })
  .superRefine((dados, contexto) => {
    if (dados.abrangencia === "nacional" && (dados.uf || dados.municipio)) {
      contexto.addIssue({
        code: "custom",
        path: ["abrangencia"],
        message: "Feriado nacional não leva UF nem município",
      });
    }
    if (dados.abrangencia !== "nacional" && !dados.uf) {
      contexto.addIssue({
        code: "custom",
        path: ["uf"],
        message: "Feriado estadual ou municipal exige a UF",
      });
    }
    if (dados.abrangencia === "municipal" && !dados.municipio) {
      contexto.addIssue({
        code: "custom",
        path: ["municipio"],
        message: "Feriado municipal exige o município",
      });
    }
    if (dados.abrangencia === "estadual" && dados.municipio) {
      contexto.addIssue({
        code: "custom",
        path: ["municipio"],
        message: "Feriado estadual não leva município",
      });
    }
  });

export type NovoFeriado = z.infer<typeof esquemaNovoFeriado>;

// ------------------------------------------------------------------ regra de banco de horas

export const esquemaNovaRegraBanco = z
  .object({
    estabelecimento_id: z.number().int().positive().nullish(),
    cargo_id: z.number().int().positive().nullish(),
    colaborador_id: z.number().int().positive().nullish(),
    prazo_compensacao_dias: z.number().int().min(1).max(730),
    limite_positivo: esquemaMinutos(100_000),
    limite_negativo: esquemaMinutos(100_000),
    expira_saldo: z.boolean(),
    tratamento_rescisao: z.enum(TRATAMENTOS_RESCISAO),
    fator_he_50: z
      .number()
      .min(1, "Fator mínimo 1,00 (hora a hora)")
      .max(9)
      .transform((valor) => Math.round(valor * 100) / 100),
    fator_he_100: z
      .number()
      .min(1, "Fator mínimo 1,00 (hora a hora)")
      .max(9)
      .transform((valor) => Math.round(valor * 100) / 100),
    inicio_vigencia: esquemaData,
  })
  .superRefine((dados, contexto) => {
    const escopos = [
      dados.estabelecimento_id,
      dados.cargo_id,
      dados.colaborador_id,
    ].filter((valor) => valor !== null && valor !== undefined);
    if (escopos.length > 1) {
      contexto.addIssue({
        code: "custom",
        path: ["colaborador_id"],
        message:
          "Escolha UM escopo: unidade, cargo ou pessoa (sem nenhum = padrão da empresa)",
      });
    }
  });

export type NovaRegraBanco = z.infer<typeof esquemaNovaRegraBanco>;

// ------------------------------------------------------------------ marcação e ajuste

export const esquemaAjusteMarcacao = z
  .object({
    colaborador_id: z.number().int().positive(),
    /** ISO com fuso, ex.: 2026-06-10T08:03:00-03:00 */
    momento: z
      .string()
      .trim()
      .min(10)
      .refine((valor) => !Number.isNaN(Date.parse(valor)), {
        message: "Momento inválido — use data e hora com fuso",
      }),
    tipo: z.enum(TIPOS_MARCACAO),
    justificativa: z
      .string()
      .trim()
      .min(10, "Ajuste de ponto exige justificativa (mínimo 10 caracteres)")
      .max(500),
    substitui_marcacao_id: z.number().int().positive().nullish(),
    anular: z.boolean().default(false),
  })
  .superRefine((dados, contexto) => {
    if (dados.anular && !dados.substitui_marcacao_id) {
      contexto.addIssue({
        code: "custom",
        path: ["substitui_marcacao_id"],
        message: "Anulação precisa apontar a marcação que sai da apuração",
      });
    }
  });

export type AjusteMarcacao = z.infer<typeof esquemaAjusteMarcacao>;

// ------------------------------------------------------------------ importação

/**
 * Planilha padrão do importador — quatro colunas, com ou sem cabeçalho:
 *   matricula ; data (AAAA-MM-DD ou DD/MM/AAAA) ; hora (HH:MM) ; tipo
 * `tipo` aceita o código do sistema (entrada, saida, inicio_intervalo,
 * fim_intervalo) e os apelidos que os relógios costumam cuspir (E, S, I, F,
 * "entrada", "saida almoco"…). Validação é LINHA A LINHA: linha ruim vira
 * rejeição com motivo, nunca aborta o lote.
 */
export const esquemaImportacao = z.object({
  arquivo: z.string().trim().min(1, "Informe o nome do arquivo").max(200),
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  conteudo: z
    .string()
    .min(1, "Arquivo vazio")
    .max(4_000_000, "Arquivo acima do limite de 4 MB"),
  separador: z.enum([";", ",", "\t"]).default(";"),
});

export type EntradaImportacao = z.infer<typeof esquemaImportacao>;

/** Apelidos de tipo aceitos pelo importador (minúsculo, sem acento). */
export const APELIDOS_TIPO_MARCACAO: Record<string, TipoMarcacao> = {
  e: "entrada",
  entrada: "entrada",
  ent: "entrada",
  "1": "entrada",
  s: "saida",
  saida: "saida",
  sai: "saida",
  "2": "saida",
  i: "inicio_intervalo",
  inicio_intervalo: "inicio_intervalo",
  "inicio intervalo": "inicio_intervalo",
  "saida intervalo": "inicio_intervalo",
  "saida almoco": "inicio_intervalo",
  "3": "inicio_intervalo",
  f: "fim_intervalo",
  fim_intervalo: "fim_intervalo",
  "fim intervalo": "fim_intervalo",
  "volta intervalo": "fim_intervalo",
  "volta almoco": "fim_intervalo",
  "retorno intervalo": "fim_intervalo",
  "4": "fim_intervalo",
};

// ------------------------------------------------------------------ apuração e consultas

export const esquemaApurarCompetencia = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  /** Vazio = todos os ativos com escala vigente. */
  colaborador_id: z.number().int().positive().nullish(),
});

export type ApurarCompetencia = z.infer<typeof esquemaApurarCompetencia>;

/**
 * 'corrigida' não se prova com TEXTO e sim com FATO: quem confere é o serviço,
 * rerodando o motor no dia da intercorrência — só fecha se a detecção não
 * acusar mais nada ali (por isso o status não pede observação, aqui nem na
 * constraint da 0027). Justificar ou ignorar deixa o fato DE PÉ: o que sustenta
 * a decisão é a observação, e uma letra não sustenta nada — daí o mínimo, o
 * mesmo do ajuste de marcação.
 */
export const esquemaTratarIntercorrencia = z
  .object({
    status: z.enum(STATUS_INTERCORRENCIA_TRATAVEIS),
    observacao: z.string().trim().max(500).optional(),
  })
  .superRefine((dados, contexto) => {
    if (dados.status !== "corrigida" && (dados.observacao ?? "").length < 10) {
      contexto.addIssue({
        code: "custom",
        path: ["observacao"],
        message:
          "Justificar ou ignorar exige observação de ao menos 10 caracteres — é o que a fiscalização lê",
      });
    }
  });

export type TratarIntercorrencia = z.infer<typeof esquemaTratarIntercorrencia>;

export const esquemaMovimentoBanco = z.object({
  colaborador_id: z.number().int().positive(),
  data: esquemaData,
  minutos: z
    .number()
    .int("Informe minutos inteiros")
    .refine((valor) => valor !== 0, { message: "Movimento zerado não é movimento" })
    .refine((valor) => Math.abs(valor) <= 100_000, {
      message: "Movimento acima do limite",
    }),
  origem: z.enum(["compensacao", "expiracao", "ajuste", "rescisao"]),
  observacao: z.string().trim().min(5, "Explique o movimento").max(500),
});

export type MovimentoBanco = z.infer<typeof esquemaMovimentoBanco>;

export const esquemaEspelho = z.object({
  colaborador_id: z.number().int().positive(),
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
});

export type ConsultaEspelho = z.infer<typeof esquemaEspelho>;

// ------------------------------------------------------------------ bateria de casos de teste
// Contrato de rh.caso_teste_ponto (migration 0042), validado ANTES de o caso ir
// ao motor: caso malformado tem de aparecer como caso malformado no relatório,
// e não como diferença de minuto.

/**
 * A jornada vem declarada POR INTEIRO no caso — jornada é contrato de empresa,
 * não tabela legal única, então amarrar a bateria ao catálogo faria o alarme
 * tocar toda vez que o DP criasse uma versão nova (ver o cabeçalho da 0042). É
 * essa escolha que permite casos GÊMEOS diferindo em UM parâmetro, que é o que
 * pega número de negócio rechumbado no fonte.
 */
export const esquemaJornadaCasoTestePonto = z.object({
  nome: z.string().trim().min(1).max(120),
  tipo: z.enum(TIPOS_JORNADA),
  carga_diaria_minutos: z.number().int().min(0).max(1440),
  carga_semanal_minutos: z.number().int().min(0).max(10_080),
  previsto_por_dia_semana: z
    .array(z.number().int().min(0).max(1440))
    .length(7, "O previsto da semana tem 7 posições (domingo a sábado)")
    .nullable(),
  intervalo_minimo_minutos: z.number().int().min(0).max(480),
  intervalo_obrigatorio_acima_minutos: z.number().int().min(0).max(1440),
  tolerancia_entrada_minutos: z.number().int().min(0).max(60),
  tolerancia_saida_minutos: z.number().int().min(0).max(60),
  horario_entrada_minuto: z.number().int().min(0).max(1439).nullable(),
  horario_saida_minuto: z.number().int().min(0).max(2879).nullable(),
  dia_repouso_semana: z.number().int().min(0).max(6).nullable(),
  dias_uteis_semana: z.number().int().min(1).max(7),
  adicional_noturno_inicio_minuto: z.number().int().min(0).max(1439),
  adicional_noturno_fim_minuto: z.number().int().min(0).max(1439),
  hora_noturna_segundos: z.number().int().min(1).max(3600),
  janela_arraste_minutos: z.number().int().min(0).max(1439),
});

export const esquemaEntradaCasoTestePonto = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  jornada: esquemaJornadaCasoTestePonto,
  regra: z.object({
    fator_he_50: z.number().min(1).max(9),
    fator_he_100: z.number().min(1).max(9),
  }),
  /** Os dias APURADOS. A véspera pode ficar de fora e só aparecer em `marcacoes`. */
  dias: z
    .array(
      z.object({
        data: esquemaData,
        feriado: z.string().trim().min(1).max(120).nullish(),
        /** null = escala sem calendário cadastrado (o motor não afirma nem nega). */
        dia_de_escala: z.boolean().nullish(),
      })
    )
    .min(1)
    .max(62),
  /**
   * Fato bruto, com a DATA REAL da batida: a saída do plantão vem no dia
   * seguinte, como vem do relógio. Quem amarra ao dia de apuração é
   * agruparMarcacoesPorDia — a mesma função da apuração, e é por isso que o
   * arraste de virada é exercitado de verdade em vez de presumido.
   */
  marcacoes: z
    .array(
      z.object({
        data: esquemaData,
        hora: esquemaRelogio,
        tipo: z.enum(TIPOS_MARCACAO),
      })
    )
    .max(200),
});

export type EntradaCasoTestePonto = z.infer<typeof esquemaEntradaCasoTestePonto>;

/** Campos conferidos em um dia. Só o que o caso DECLARA é comparado. */
const esquemaDiaEsperadoPonto = z.object({
  previsto: z.number().int().optional(),
  trabalhado: z.number().int().optional(),
  intervalo: z.number().int().optional(),
  he_50: z.number().int().optional(),
  he_100: z.number().int().optional(),
  noturno_ficto: z.number().int().optional(),
  noturno_relogio: z.number().int().optional(),
  atraso: z.number().int().optional(),
  falta: z.number().int().optional(),
  banco: z.number().int().optional(),
  /** Dia PENDENTE DE TRATAMENTO (pareamento incompleto) — não lança nada. */
  pendente: z.boolean().optional(),
  /** Tipos detectados no dia, comparados como conjunto ordenado. */
  intercorrencias: z.array(z.enum(TIPOS_INTERCORRENCIA)).optional(),
});

/**
 * Os DEZ totais são obrigatórios de propósito: em bateria de regressão o que
 * ninguém declarou é o que ninguém vê mudar. Por dia, o caso declara só os
 * campos que o assunto dele exige.
 */
export const esquemaSaidaCasoTestePonto = z.object({
  totais: z.object({
    trabalhado: z.number().int(),
    previsto: z.number().int(),
    he_50: z.number().int(),
    he_100: z.number().int(),
    noturno_ficto: z.number().int(),
    noturno_relogio: z.number().int(),
    faltas: z.number().int(),
    atrasos: z.number().int(),
    dsr_desconto: z.number().int(),
    banco: z.number().int(),
  }),
  dias: z.record(z.string(), esquemaDiaEsperadoPonto).optional(),
});

export type SaidaCasoTestePonto = z.infer<typeof esquemaSaidaCasoTestePonto>;
