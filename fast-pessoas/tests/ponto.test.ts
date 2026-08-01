import { test } from "node:test";
import assert from "node:assert/strict";

import {
  agruparMarcacoesPorDia,
  apurarPonto,
  MINUTOS_DO_DIA,
  type DiaApurado,
  type DiaMotor,
  type EntradaApuracao,
  type JornadaMotor,
  type MarcacaoBruta,
  type MarcacaoMotor,
  type RegraBancoMotor,
  type ResultadoApuracao,
  type TipoMarcacao,
} from "../src/dominios/ponto/calculo";

// ===========================================================================
// A rede de regressão do motor de apuração do ponto.
//
// Cada `test` que cita um valor em reais reproduz defeito que ESTEVE em
// produção neste projeto. O número no comentário é o que ele custou — é o que
// impede alguém de apagar o caso por achar que é detalhe de relógio.
// ===========================================================================

// ---------------------------------------------------------------- fixtures

/**
 * Jornada 5x2 de 44h — 8h48 por dia, entrada 08:00 e saída 17:48 com 1h de
 * intervalo. É a jornada da maior parte da base, e a que serve de contraste
 * para provar que nenhum parâmetro dela está chumbado no motor.
 */
function jornadaAdministrativa(): JornadaMotor {
  return {
    id: 1,
    nome: "ADMINISTRATIVA 44h",
    tipo: "5x2",
    carga_diaria_minutos: 528,
    carga_semanal_minutos: 2640,
    previsto_por_dia_semana: [0, 528, 528, 528, 528, 528, 0],
    intervalo_minimo_minutos: 60,
    intervalo_obrigatorio_acima_minutos: 360,
    tolerancia_entrada_minutos: 5,
    tolerancia_saida_minutos: 5,
    horario_entrada_minuto: 480,
    horario_saida_minuto: 1068,
    dia_repouso_semana: 0,
    dias_uteis_semana: 5,
    adicional_noturno_inicio_minuto: 1320,
    adicional_noturno_fim_minuto: 300,
    hora_noturna_segundos: 3150,
    janela_arraste_minutos: 588,
  };
}

/** Plantão 12x36 — o turno que atravessa a meia-noite e vive na janela noturna. */
function jornadaPlantao(): JornadaMotor {
  return {
    id: 2,
    nome: "PLANTÃO 12x36 NOTURNO",
    tipo: "12x36",
    carga_diaria_minutos: 720,
    carga_semanal_minutos: 2520,
    previsto_por_dia_semana: null,
    intervalo_minimo_minutos: 60,
    intervalo_obrigatorio_acima_minutos: 360,
    tolerancia_entrada_minutos: 5,
    tolerancia_saida_minutos: 5,
    horario_entrada_minuto: null,
    horario_saida_minuto: null,
    dia_repouso_semana: null,
    dias_uteis_semana: 3,
    adicional_noturno_inicio_minuto: 1320,
    adicional_noturno_fim_minuto: 300,
    hora_noturna_segundos: 3150,
    janela_arraste_minutos: 780,
  };
}

/** Loja 6x1 com folga na TERÇA — o contra-exemplo do "repouso é domingo". */
function jornadaLojaFolgaNaTerca(): JornadaMotor {
  return {
    ...jornadaAdministrativa(),
    id: 3,
    nome: "LOJA 6x1 — folga na terça",
    tipo: "6x1",
    carga_diaria_minutos: 440,
    previsto_por_dia_semana: [440, 440, 0, 440, 440, 440, 440],
    horario_entrada_minuto: null,
    horario_saida_minuto: null,
    dia_repouso_semana: 2,
    dias_uteis_semana: 6,
  };
}

/** Hora a hora: o banco não distorce nada, para o teste medir só a apuração. */
function regraHoraAHora(): RegraBancoMotor {
  return { id: 10, fator_he_50: 1, fator_he_100: 1 };
}

function marcacao(id: number, minuto: number, tipo: TipoMarcacao): MarcacaoMotor {
  return { id, minuto, tipo };
}

/** Sequência completa de um dia administrativo cumprido à risca. */
function diaCheioAdministrativo(): MarcacaoMotor[] {
  return [
    marcacao(1, 480, "entrada"),
    marcacao(2, 720, "inicio_intervalo"),
    marcacao(3, 780, "fim_intervalo"),
    marcacao(4, 1068, "saida"),
  ];
}

/**
 * Plantão 19:00→08:00 com intervalo das 21:00 às 22:00: 12h de relógio, das
 * quais 7h caem na janela noturna. É o turno que produziu o defeito da hora
 * reduzida.
 */
function plantaoNoturno(base: number): MarcacaoMotor[] {
  return [
    marcacao(base + 1, 1140, "entrada"),
    marcacao(base + 2, 1260, "inicio_intervalo"),
    marcacao(base + 3, 1320, "fim_intervalo"),
    marcacao(base + 4, 480 + MINUTOS_DO_DIA, "saida"),
  ];
}

/** Datas e dia da semana de um período, sem consultar o relógio da máquina. */
function periodo(
  inicio: string,
  quantidade: number
): { data: string; dia_semana: number }[] {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const saida: { data: string; dia_semana: number }[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    const momento = new Date(Date.UTC(ano, mes - 1, dia + i));
    saida.push({
      data: momento.toISOString().slice(0, 10),
      dia_semana: momento.getUTCDay(),
    });
  }
  return saida;
}

function montarDias(
  inicio: string,
  quantidade: number,
  decorar: (
    dia: { data: string; dia_semana: number },
    indice: number
  ) => Partial<DiaMotor>
): DiaMotor[] {
  return periodo(inicio, quantidade).map((d, indice) => ({
    data: d.data,
    dia_semana: d.dia_semana,
    feriado: null,
    dia_de_escala: null,
    marcacoes: [],
    ...decorar(d, indice),
  }));
}

function entrada(jornada: JornadaMotor, dias: DiaMotor[]): EntradaApuracao {
  return { ano: 2026, mes: 3, jornada, regra: regraHoraAHora(), dias };
}

function tipos(resultado: ResultadoApuracao): string[] {
  return resultado.intercorrencias.map((i) => i.tipo);
}

// 2026-03-01 é um DOMINGO — conferido, e é por isso que as semanas dos testes
// abaixo começam nele: o agrupamento do DSR usa o dia de repouso da jornada.

// ================================================================ defeito 1
// HORA NOTURNA REDUZIDA (CLT art. 73 §1º). O motor tratava a hora noturna como
// 60 min de relógio. A folha recebia 1.050 h onde a lei manda 1.200 h — 150 h
// de adicional em um mês, com 10 plantonistas.

test("sete horas de relógio na janela noturna valem oito horas noturnas", () => {
  const dias = montarDias("2026-03-02", 1, () => ({
    dia_de_escala: true,
    marcacoes: plantaoNoturno(0),
  }));
  const r = apurarPonto(entrada(jornadaPlantao(), dias));

  assert.equal(r.adicional_noturno_relogio_minutos, 420);
  assert.equal(r.adicional_noturno_minutos, 480);
});

test("a hora noturna ficta estende a jornada cumprida, não só o que a folha paga", () => {
  // 12h de relógio com 7h noturnas cumprem 13h: os 60 min de acréscimo ficto
  // são hora extra de 50%, não enfeite do espelho.
  const dias = montarDias("2026-03-02", 1, () => ({
    dia_de_escala: true,
    marcacoes: plantaoNoturno(0),
  }));
  const r = apurarPonto(entrada(jornadaPlantao(), dias));

  assert.equal(r.dias[0].trabalhado_minutos, 720);
  assert.equal(r.he_50_minutos, 60);
  assert.equal(r.saldo_banco_minutos, 60);
});

test("a duração da hora noturna vem da jornada: com 3600 s o ficto some", () => {
  // A prova de que o 3150 não voltou a ser literal. Empregador rural e acordo
  // coletivo têm outra duração, e o motor tem que obedecer ao cadastro.
  const semReducao: JornadaMotor = { ...jornadaPlantao(), hora_noturna_segundos: 3600 };
  const dias = montarDias("2026-03-02", 1, () => ({
    dia_de_escala: true,
    marcacoes: plantaoNoturno(0),
  }));
  const r = apurarPonto(entrada(semReducao, dias));

  assert.equal(r.adicional_noturno_relogio_minutos, 420);
  assert.equal(r.adicional_noturno_minutos, 420);
  assert.equal(r.he_50_minutos, 0);
});

test("uma escala inteira de plantões noturnos: 105 h de relógio viram 120 h noturnas", () => {
  // A conta do defeito, na escala em que ele apareceu: 1.050 h contra 1.200 h
  // somando os 10 plantonistas. Aqui, um deles: 15 plantões no mês.
  const dias = montarDias("2026-03-01", 30, (_, indice) =>
    indice % 2 === 0
      ? { dia_de_escala: true, marcacoes: plantaoNoturno(indice * 10) }
      : { dia_de_escala: false }
  );
  const r = apurarPonto(entrada(jornadaPlantao(), dias));

  assert.equal(r.adicional_noturno_relogio_minutos, 105 * 60);
  assert.equal(r.adicional_noturno_minutos, 120 * 60);
});

// ================================================================ defeito 2
// DIVISOR 220 CHUMBADO — a jornada de 44h cobrada de todo mundo. Quem faz 36h
// recebia a menos: R$ 1.708,25 por mês nos 10 plantonistas. No motor do ponto o
// mesmo erro tem a forma "o previsto e o DSR saem de um número fixo".

test("jornada de 36h prevê 36h e não as 44h de quem trabalha ao lado", () => {
  const dias = montarDias("2026-03-01", 7, () => ({}));
  const quarentaEQuatro = jornadaAdministrativa();
  const trintaESeis: JornadaMotor = {
    ...quarentaEQuatro,
    id: 4,
    nome: "PLANTONISTA 36h",
    carga_diaria_minutos: 360,
    carga_semanal_minutos: 2160,
    previsto_por_dia_semana: [0, 360, 360, 360, 360, 360, 360],
    dias_uteis_semana: 6,
  };

  const a = apurarPonto(entrada(quarentaEQuatro, dias));
  const b = apurarPonto(entrada(trintaESeis, dias));

  assert.equal(a.minutos_previstos, 44 * 60);
  assert.equal(b.minutos_previstos, 36 * 60);
  // E a semana sem nenhuma batida cobra exatamente o previsto de cada uma.
  assert.equal(a.faltas_minutos, 44 * 60);
  assert.equal(b.faltas_minutos, 36 * 60);
});

// ================================================================ defeito 3
// DIVISOR 6 DO DSR. O repouso descontado valia carga_semanal ÷ 6, sempre. Quem
// tem dia de 8h48 (528 min) perdia 7h20 (440 min): 88 min por semana com falta,
// sempre a favor da empresa.

test("o DSR de quem reparte 44h em 5 dias vale 8h48, não 7h20", () => {
  const jornada = jornadaAdministrativa();
  const dias = montarDias("2026-03-01", 7, (d) =>
    d.dia_semana >= 1 && d.dia_semana <= 5 && d.dia_semana !== 3
      ? { marcacoes: diaCheioAdministrativo() }
      : {}
  );
  const r = apurarPonto(entrada(jornada, dias));

  assert.equal(r.faltas_minutos, 528, "a quarta-feira sem batida é falta integral");
  assert.equal(r.dsr_desconto_minutos, 528);
  assert.notEqual(r.dsr_desconto_minutos, 440, "440 era o divisor 6 chumbado");
});

test("o divisor do DSR é lido da jornada: 6 dias úteis devolvem 7h20", () => {
  // O mesmo mês, a mesma falta, só o divisor muda. É isso que prova que o
  // número está no cadastro e não no código: 528 − 440 = os 88 min do defeito.
  const seisDias: JornadaMotor = { ...jornadaAdministrativa(), dias_uteis_semana: 6 };
  const dias = montarDias("2026-03-01", 7, (d) =>
    d.dia_semana >= 1 && d.dia_semana <= 5 && d.dia_semana !== 3
      ? { marcacoes: diaCheioAdministrativo() }
      : {}
  );
  const r = apurarPonto(entrada(seisDias, dias));

  assert.equal(r.dsr_desconto_minutos, 440);
});

test("duas faltas na mesma semana derrubam um DSR, não dois", () => {
  const dias = montarDias("2026-03-01", 7, (d) =>
    d.dia_semana === 1 || d.dia_semana === 4 || d.dia_semana === 5
      ? { marcacoes: diaCheioAdministrativo() }
      : {}
  );
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.faltas_minutos, 2 * 528, "terça e quarta sem batida");
  assert.equal(r.dsr_desconto_minutos, 528);
});

// ================================================================ defeito 4
// DIA DE REPOUSO FIXO EM DOMINGO. Quem folga na terça recebia o domingo como
// 100% e a folga real como 50% — invertido nos dois sentidos, no mesmo dia.

test("quem folga na terça: domingo trabalhado é 50% e terça trabalhada é 100%", () => {
  const jornada = jornadaLojaFolgaNaTerca();
  const dias = montarDias("2026-03-01", 3, (d) => {
    if (d.dia_semana === 0) {
      // Domingo é dia ÚTIL desta pessoa: 8h contra 7h20 previstas.
      return {
        marcacoes: [
          marcacao(1, 480, "entrada"),
          marcacao(2, 720, "inicio_intervalo"),
          marcacao(3, 780, "fim_intervalo"),
          marcacao(4, 1020, "saida"),
        ],
      };
    }
    if (d.dia_semana === 2) {
      // Terça é o REPOUSO dela: 4h trabalhadas, do primeiro minuto a 100%.
      return {
        marcacoes: [marcacao(5, 480, "entrada"), marcacao(6, 720, "saida")],
      };
    }
    return {};
  });
  const r = apurarPonto(entrada(jornada, dias));

  assert.equal(r.he_50_minutos, 40, "o domingo dela é dia comum");
  assert.equal(r.he_100_minutos, 240, "a terça dela é o repouso semanal");
});

test("em dia de repouso não há tolerância: o primeiro minuto já é 100%", () => {
  // Não existe jornada contratada da qual variar, então o art. 58 §1º não tem
  // do que descontar — 3 min de trabalho na folga são 3 min de extra.
  const jornada = jornadaLojaFolgaNaTerca();
  const dias = montarDias("2026-03-03", 1, () => ({
    marcacoes: [marcacao(1, 480, "entrada"), marcacao(2, 483, "saida")],
  }));
  const r = apurarPonto(entrada(jornada, dias));

  assert.equal(r.dias[0].dia_semana, 2);
  assert.equal(r.he_100_minutos, 3);
  assert.equal(r.he_50_minutos, 0);
});

test("feriado é dia de repouso mesmo em jornada que folga na terça", () => {
  const jornada = jornadaLojaFolgaNaTerca();
  const dias = montarDias("2026-03-04", 1, () => ({
    feriado: "Feriado municipal",
    marcacoes: [marcacao(1, 480, "entrada"), marcacao(2, 720, "saida")],
  }));
  const r = apurarPonto(entrada(jornada, dias));

  assert.equal(r.dias[0].previsto_minutos, 0);
  assert.equal(r.he_100_minutos, 240);
  assert.equal(r.he_50_minutos, 0);
});

// ================================================================ defeito 5
// DUPLA ABERTURA INVENTAVA HORA EXTRA. Entrada 08:00 + entrada 13:00 + saída
// 18:00 fechava como 10h corridas — o intervalo inteiro contado como trabalho,
// 72 min de hora extra por dia e 108 min creditados no banco, e o dia passava
// sem uma linha na fila do DP.

test("entrada em cima de entrada não vira hora extra, vira dia pendente", () => {
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [
      marcacao(1, 480, "entrada"),
      marcacao(2, 780, "entrada"),
      marcacao(3, 1080, "saida"),
    ],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));
  const dia = r.dias[0];

  // O fato observado continua no espelho — 600 min entre a primeira abertura e
  // a saída, 72 acima das 8h48 previstas.
  assert.equal(dia.trabalhado_minutos, 600);
  assert.equal(dia.previsto_minutos, 528);
  // Mas nada é lançado, nem a favor nem contra.
  assert.equal(dia.he_50_minutos, 0, "os 72 min inventados");
  assert.equal(dia.he_100_minutos, 0);
  assert.equal(dia.atraso_minutos, 0);
  assert.equal(dia.falta_minutos, 0);
  assert.equal(dia.banco_minutos, 0, "os 108 min creditados no banco");
  // E o dia levanta a mão, que era o que não acontecia. O art. 71 entra junto:
  // 600 min corridos sem intervalo nenhum também é intercorrência.
  assert.deepEqual(tipos(r), ["entrada_sem_saida", "intervalo_incompleto"]);
  assert.equal(dia.memoria.pendente_de_tratamento, true);
});

test("turno aberto e nunca fechado não vira falta integral", () => {
  // Falha de coleta não é ausência do trabalhador: quem bateu a entrada e não
  // bateu a saída levava 528 min de falta mais 440 de DSR derrubado — 968 min
  // descontados em folha por uma batida que faltou.
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [marcacao(1, 480, "entrada")],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.faltas_minutos, 0);
  assert.equal(r.dsr_desconto_minutos, 0);
  assert.equal(r.atrasos_minutos, 0);
  assert.deepEqual(tipos(r), ["entrada_sem_saida"]);
});

test("saída sem entrada correspondente também deixa o dia pendente", () => {
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [marcacao(1, 1068, "saida")],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.faltas_minutos, 0);
  assert.equal(r.he_50_minutos, 0);
  assert.deepEqual(tipos(r), ["entrada_sem_saida"]);
});

test("batida repetida no MESMO minuto é descarte inofensivo, e o dia lança normal", () => {
  // Único caso em que sumir com o registro não some com hora nenhuma: o UNIQUE
  // do banco olha o momento com segundos, o motor mede em minuto.
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [
      marcacao(1, 480, "entrada"),
      marcacao(2, 480, "entrada"),
      marcacao(3, 720, "inicio_intervalo"),
      marcacao(4, 780, "fim_intervalo"),
      marcacao(5, 1068, "saida"),
    ],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.dias[0].trabalhado_minutos, 528);
  assert.equal(r.dias[0].memoria.pendente_de_tratamento, false);
  assert.deepEqual(tipos(r), ["marcacao_duplicada"]);
});

// ============================================================ borda: 12x36
// O plantão que atravessa a meia-noite. Sem o arraste, ele aparecia como
// "entrada sem saída" na véspera e "saída sem entrada" no dia seguinte, todo
// santo dia — dois dias de falta integral com DSR derrubado.

test("o plantão que vira a noite é UM dia, não dois meios plantões", () => {
  const jornada = jornadaPlantao();
  const brutas: MarcacaoBruta[] = [
    { id: 1, tipo: "entrada", data_local: "2026-03-02", minuto_local: 1140 },
    { id: 2, tipo: "inicio_intervalo", data_local: "2026-03-02", minuto_local: 1410 },
    { id: 3, tipo: "fim_intervalo", data_local: "2026-03-03", minuto_local: 30 },
    { id: 4, tipo: "saida", data_local: "2026-03-03", minuto_local: 420 },
  ];
  const porDia = agruparMarcacoesPorDia(brutas, jornada);

  assert.equal(porDia.size, 1, "as quatro batidas pertencem ao turno da véspera");
  assert.deepEqual(
    porDia.get("2026-03-02")?.map((m) => m.minuto),
    [1140, 1410, 30 + MINUTOS_DO_DIA, 420 + MINUTOS_DO_DIA]
  );

  const dias = montarDias("2026-03-02", 2, (d, indice) => ({
    dia_de_escala: indice === 0,
    marcacoes: porDia.get(d.data) ?? [],
  }));
  const r = apurarPonto(entrada(jornada, dias));

  assert.equal(r.dias[0].trabalhado_minutos, 660);
  assert.equal(r.dias[0].intervalo_minutos, 60);
  assert.equal(r.faltas_minutos, 0);
  assert.deepEqual(tipos(r), []);
});

test("o intervalo iniciado antes da meia-noite arrasta a volta junto com a saída", () => {
  // Turno aberto não é período aberto: quem inicia o intervalo às 23:30 fechou
  // o período e continua em plantão. Olhando só o período, a volta de 00:30
  // caía no dia seguinte e levava a saída junto.
  const brutas: MarcacaoBruta[] = [
    { id: 1, tipo: "entrada", data_local: "2026-03-02", minuto_local: 1140 },
    { id: 2, tipo: "inicio_intervalo", data_local: "2026-03-02", minuto_local: 1410 },
    { id: 3, tipo: "fim_intervalo", data_local: "2026-03-03", minuto_local: 30 },
    { id: 4, tipo: "saida", data_local: "2026-03-03", minuto_local: 420 },
  ];
  const porDia = agruparMarcacoesPorDia(brutas, jornadaPlantao());

  assert.equal(porDia.get("2026-03-03"), undefined);
});

test("a janela de arraste é da jornada: com 0 o plantão volta a ser dois dias", () => {
  const semArraste: JornadaMotor = { ...jornadaPlantao(), janela_arraste_minutos: 0 };
  const brutas: MarcacaoBruta[] = [
    { id: 1, tipo: "entrada", data_local: "2026-03-02", minuto_local: 1140 },
    { id: 2, tipo: "saida", data_local: "2026-03-03", minuto_local: 420 },
  ];
  const porDia = agruparMarcacoesPorDia(brutas, semArraste);

  assert.equal(porDia.size, 2);
});

test("a hora noturna ficta arredonda uma vez por dia, meio-para-cima", () => {
  // 360 min de relógio × 3600 ÷ 3150 = 411,43 → 411. Arredondar por período
  // acumularia até meio minuto por período; arredondar no fim do mês esconderia
  // o número do dia no espelho que o colaborador confere.
  const dias = montarDias("2026-03-02", 1, () => ({
    dia_de_escala: true,
    marcacoes: [
      marcacao(1, 1140, "entrada"),
      marcacao(2, 1410, "inicio_intervalo"),
      marcacao(3, 30 + MINUTOS_DO_DIA, "fim_intervalo"),
      marcacao(4, 420 + MINUTOS_DO_DIA, "saida"),
    ],
  }));
  const r = apurarPonto(entrada(jornadaPlantao(), dias));

  assert.equal(r.adicional_noturno_relogio_minutos, 360);
  assert.equal(r.adicional_noturno_minutos, 411);
});

// ================================================== borda: art. 58 §1º
// A tolerância que ninguém lembra: o que cabe nela não vira falta NEM extra;
// o que não cabe é computado por INTEIRO (Súmula 366 do TST).

test("quatro minutos de atraso dentro da tolerância não viram nem atraso nem extra", () => {
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [
      marcacao(1, 484, "entrada"),
      marcacao(2, 720, "inicio_intervalo"),
      marcacao(3, 780, "fim_intervalo"),
      marcacao(4, 1068, "saida"),
    ],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.dias[0].trabalhado_minutos, 524, "4 min a menos, de fato");
  assert.equal(r.atrasos_minutos, 0);
  assert.equal(r.he_50_minutos, 0);
  assert.equal(r.faltas_minutos, 0);
  assert.equal(r.saldo_banco_minutos, 0);
});

test("passou da tolerância, computa-se a TOTALIDADE do atraso e não só o excedente", () => {
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [
      marcacao(1, 487, "entrada"),
      marcacao(2, 720, "inicio_intervalo"),
      marcacao(3, 780, "fim_intervalo"),
      marcacao(4, 1068, "saida"),
    ],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.atrasos_minutos, 7, "7 min inteiros, não os 2 que passaram de 5");
  assert.equal(r.saldo_banco_minutos, -7);
});

test("atraso na entrada e sobra na saída não se compensam dentro do dia", () => {
  // Era este o defeito: o motor comparava só o SALDO do dia, então quem chegava
  // 20 min atrasado e saía 20 min depois zerava as duas pontas — o atraso
  // desaparecia e a hora extra junto.
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [
      marcacao(1, 500, "entrada"),
      marcacao(2, 720, "inicio_intervalo"),
      marcacao(3, 780, "fim_intervalo"),
      marcacao(4, 1088, "saida"),
    ],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.dias[0].trabalhado_minutos, 528, "o saldo do dia fecha certinho");
  assert.equal(r.atrasos_minutos, 20);
  assert.equal(r.he_50_minutos, 20);
});

// ====================================================== borda: art. 71
// Intervalo mínimo obrigatório acima do limite da jornada. Vira intercorrência
// para o DP, nunca desconto automático.

test("jornada corrida sem intervalo levanta intercorrência, e não desconto", () => {
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [marcacao(1, 480, "entrada"), marcacao(2, 1008, "saida")],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.dias[0].trabalhado_minutos, 528);
  assert.deepEqual(tipos(r), ["intervalo_incompleto"]);
  assert.equal(r.atrasos_minutos, 0);
  assert.equal(r.he_50_minutos, 0);
  assert.equal(r.faltas_minutos, 0);
});

test("intervalo iniciado sem retorno deixa o dia pendente, não vira almoço eterno", () => {
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [
      marcacao(1, 480, "entrada"),
      marcacao(2, 720, "inicio_intervalo"),
    ],
  }));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.dias[0].memoria.pendente_de_tratamento, true);
  assert.equal(r.atrasos_minutos, 0);
  assert.equal(r.faltas_minutos, 0);
  assert.ok(tipos(r).includes("intervalo_incompleto"));
});

test("o limite do intervalo obrigatório é da jornada, não das 6h da lei escritas no código", () => {
  const tudoLiberado: JornadaMotor = {
    ...jornadaAdministrativa(),
    intervalo_obrigatorio_acima_minutos: 600,
  };
  const dias = montarDias("2026-03-02", 1, () => ({
    marcacoes: [marcacao(1, 480, "entrada"), marcacao(2, 1008, "saida")],
  }));
  const r = apurarPonto(entrada(tudoLiberado, dias));

  assert.deepEqual(tipos(r), []);
});

// ============================================ borda: dia sem batida e ordem

test("dia previsto sem nenhuma marcação é falta integral e uma linha na fila do DP", () => {
  const dias = montarDias("2026-03-04", 1, () => ({}));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.dias[0].falta_minutos, 528);
  assert.equal(r.dias[0].banco_minutos, 0, "falta não vai ao banco: vira desconto com DSR");
  assert.deepEqual(tipos(r), ["sem_marcacao"]);
});

test("dia sem previsão e sem batida não gera nada", () => {
  const dias = montarDias("2026-03-01", 1, () => ({}));
  const r = apurarPonto(entrada(jornadaAdministrativa(), dias));

  assert.equal(r.dias[0].previsto_minutos, 0, "domingo do 5x2");
  assert.equal(r.faltas_minutos, 0);
  assert.deepEqual(tipos(r), []);
});

test("escala sem âncora cadastrada não inventa falta no dia sem batida", () => {
  const dias = montarDias("2026-03-02", 1, () => ({ dia_de_escala: null }));
  const r = apurarPonto(entrada(jornadaPlantao(), dias));

  assert.equal(r.dias[0].previsto_minutos, 0);
  assert.equal(r.faltas_minutos, 0);
  assert.deepEqual(tipos(r), []);
});

test("marcação fora de ordem apura igual à marcação em ordem", () => {
  const emOrdem = montarDias("2026-03-02", 1, () => ({
    marcacoes: diaCheioAdministrativo(),
  }));
  const foraDeOrdem = montarDias("2026-03-02", 1, () => ({
    marcacoes: [
      marcacao(4, 1068, "saida"),
      marcacao(2, 720, "inicio_intervalo"),
      marcacao(1, 480, "entrada"),
      marcacao(3, 780, "fim_intervalo"),
    ],
  }));

  const a = apurarPonto(entrada(jornadaAdministrativa(), emOrdem));
  const b = apurarPonto(entrada(jornadaAdministrativa(), foraDeOrdem));

  assert.equal(b.dias[0].trabalhado_minutos, a.dias[0].trabalhado_minutos);
  assert.equal(b.dias[0].intervalo_minutos, a.dias[0].intervalo_minutos);
  assert.deepEqual(tipos(b), tipos(a));
  assert.equal(b.saldo_banco_minutos, a.saldo_banco_minutos);
});

test("o fator do banco é aplicado sobre o acumulado, não dia a dia", () => {
  // Cinco dias com 11 min de HE 50% a 1,50 creditavam 85 (17 × 5) contra os 83
  // do total, sempre a favor do empregado. Meio minuto por dia com minuto ímpar.
  const jornada = jornadaAdministrativa();
  const dias = montarDias("2026-03-02", 5, () => ({
    marcacoes: [
      marcacao(1, 480, "entrada"),
      marcacao(2, 720, "inicio_intervalo"),
      marcacao(3, 780, "fim_intervalo"),
      marcacao(4, 1079, "saida"),
    ],
  }));
  const comFator: EntradaApuracao = {
    ...entrada(jornada, dias),
    regra: { id: 11, fator_he_50: 1.5, fator_he_100: 1.5 },
  };
  const r = apurarPonto(comFator);

  assert.equal(r.he_50_minutos, 55, "11 min por dia, 5 dias");
  assert.equal(r.saldo_banco_minutos, 83);
  assert.notEqual(r.saldo_banco_minutos, 85);
});

// =========================================================== INVARIANTES
// Valem para QUALQUER entrada, não para um caso escolhido a dedo.

/** xorshift32 — sorteio determinístico: o mesmo teste dá sempre o mesmo veredito. */
function criarSorteio(semente: number): (teto: number) => number {
  let estado = semente >>> 0;
  return (teto: number) => {
    estado ^= estado << 13;
    estado >>>= 0;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    estado >>>= 0;
    return estado % teto;
  };
}

const CAMPOS_DE_MINUTO_DO_DIA: (keyof DiaApurado)[] = [
  "previsto_minutos",
  "trabalhado_minutos",
  "intervalo_minutos",
  "he_50_minutos",
  "he_100_minutos",
  "adicional_noturno_minutos",
  "adicional_noturno_relogio_minutos",
  "atraso_minutos",
  "falta_minutos",
  "banco_minutos",
];

const CAMPOS_DE_MINUTO_DO_TOTAL: (keyof ResultadoApuracao)[] = [
  "minutos_trabalhados",
  "minutos_previstos",
  "he_50_minutos",
  "he_100_minutos",
  "adicional_noturno_minutos",
  "adicional_noturno_relogio_minutos",
  "faltas_minutos",
  "atrasos_minutos",
  "dsr_desconto_minutos",
  "saldo_banco_minutos",
];

// Só o saldo do banco pode ser negativo — atraso desce a débito.
const PODE_SER_NEGATIVO = new Set<string>(["banco_minutos", "saldo_banco_minutos"]);

const TIPOS: TipoMarcacao[] = ["entrada", "saida", "inicio_intervalo", "fim_intervalo"];
const HORA_NOTURNA_POSSIVEL = [3150, 3600, 3000, 2700];
const FATORES_POSSIVEIS = [1, 1.25, 1.5, 1.75, 2];
const TIPOS_JORNADA_SORTEAVEIS = ["5x2", "6x1", "12x36", "escala_livre"] as const;

function sortearEntrada(sortear: (teto: number) => number): EntradaApuracao {
  const cargaDiaria = 240 + sortear(541);
  const jornada: JornadaMotor = {
    id: 99,
    nome: "sorteada",
    tipo: TIPOS_JORNADA_SORTEAVEIS[sortear(TIPOS_JORNADA_SORTEAVEIS.length)],
    carga_diaria_minutos: cargaDiaria,
    carga_semanal_minutos: cargaDiaria * (4 + sortear(3)),
    previsto_por_dia_semana:
      sortear(2) === 0
        ? null
        : [0, cargaDiaria, cargaDiaria, cargaDiaria, cargaDiaria, cargaDiaria, 0],
    intervalo_minimo_minutos: sortear(90),
    intervalo_obrigatorio_acima_minutos: sortear(600),
    tolerancia_entrada_minutos: sortear(15),
    tolerancia_saida_minutos: sortear(15),
    horario_entrada_minuto: sortear(2) === 0 ? null : sortear(1440),
    horario_saida_minuto: sortear(2) === 0 ? null : sortear(2880),
    dia_repouso_semana: sortear(2) === 0 ? null : sortear(7),
    dias_uteis_semana: 1 + sortear(7),
    adicional_noturno_inicio_minuto: sortear(1440),
    adicional_noturno_fim_minuto: sortear(1440),
    hora_noturna_segundos: HORA_NOTURNA_POSSIVEL[sortear(HORA_NOTURNA_POSSIVEL.length)],
    janela_arraste_minutos: sortear(800),
  };
  const dias = montarDias("2026-03-01", 28, (_, indice) => {
    const quantas = sortear(7);
    const marcacoes: MarcacaoMotor[] = [];
    for (let i = 0; i < quantas; i += 1) {
      marcacoes.push(
        marcacao(indice * 100 + i, sortear(2000), TIPOS[sortear(TIPOS.length)])
      );
    }
    return {
      feriado: sortear(10) === 0 ? "Feriado sorteado" : null,
      dia_de_escala: sortear(3) === 0 ? null : sortear(2) === 0,
      marcacoes,
    };
  });
  return {
    ano: 2026,
    mes: 3,
    jornada,
    regra: {
      id: null,
      fator_he_50: FATORES_POSSIVEIS[sortear(FATORES_POSSIVEIS.length)],
      fator_he_100: FATORES_POSSIVEIS[sortear(FATORES_POSSIVEIS.length)],
    },
    dias,
  };
}

test("invariante: todo minuto apurado é inteiro, e só o banco pode ser negativo", () => {
  const sortear = criarSorteio(20260801);
  for (let rodada = 0; rodada < 300; rodada += 1) {
    const caso = sortearEntrada(sortear);
    const r = apurarPonto(caso);

    for (const campo of CAMPOS_DE_MINUTO_DO_TOTAL) {
      const valor = r[campo] as number;
      assert.ok(
        Number.isInteger(valor),
        `rodada ${rodada}: ${campo} = ${valor} não é minuto inteiro`
      );
      if (!PODE_SER_NEGATIVO.has(campo)) {
        assert.ok(valor >= 0, `rodada ${rodada}: ${campo} = ${valor} ficou negativo`);
      }
    }

    for (const dia of r.dias) {
      for (const campo of CAMPOS_DE_MINUTO_DO_DIA) {
        const valor = dia[campo] as number;
        assert.ok(
          Number.isInteger(valor),
          `rodada ${rodada}, ${dia.data}: ${campo} = ${valor} não é minuto inteiro`
        );
        if (!PODE_SER_NEGATIVO.has(campo)) {
          assert.ok(
            valor >= 0,
            `rodada ${rodada}, ${dia.data}: ${campo} = ${valor} ficou negativo`
          );
        }
      }
    }
  }
});

test("invariante: o total da competência é a soma dos dias, sem sobra", () => {
  const sortear = criarSorteio(987654321);
  for (let rodada = 0; rodada < 200; rodada += 1) {
    const r = apurarPonto(sortearEntrada(sortear));
    const somar = (extrator: (d: DiaApurado) => number): number =>
      r.dias.reduce((total, d) => total + extrator(d), 0);

    assert.equal(r.minutos_trabalhados, somar((d) => d.trabalhado_minutos));
    assert.equal(r.minutos_previstos, somar((d) => d.previsto_minutos));
    assert.equal(r.he_50_minutos, somar((d) => d.he_50_minutos));
    assert.equal(r.he_100_minutos, somar((d) => d.he_100_minutos));
    assert.equal(r.faltas_minutos, somar((d) => d.falta_minutos));
    assert.equal(r.atrasos_minutos, somar((d) => d.atraso_minutos));
    assert.equal(r.saldo_banco_minutos, somar((d) => d.banco_minutos));
  }
});

test("invariante: dia pendente de tratamento não lança nada em nenhuma direção", () => {
  const sortear = criarSorteio(13572468);
  let pendentesVistos = 0;
  for (let rodada = 0; rodada < 200; rodada += 1) {
    const r = apurarPonto(sortearEntrada(sortear));
    for (const dia of r.dias) {
      if (dia.memoria.pendente_de_tratamento !== true) continue;
      pendentesVistos += 1;
      assert.equal(dia.he_50_minutos, 0, `${dia.data} lançou HE 50% com pareamento quebrado`);
      assert.equal(dia.he_100_minutos, 0, `${dia.data} lançou HE 100% com pareamento quebrado`);
      assert.equal(dia.atraso_minutos, 0, `${dia.data} lançou atraso com pareamento quebrado`);
      assert.equal(dia.falta_minutos, 0, `${dia.data} lançou falta com pareamento quebrado`);
      assert.equal(dia.banco_minutos, 0, `${dia.data} mexeu no banco com pareamento quebrado`);
    }
  }
  assert.ok(pendentesVistos > 0, "o sorteio precisa produzir dias pendentes para o teste valer");
});
