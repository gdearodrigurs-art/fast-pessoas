// db/semear/15-ponto.js — PONTO E BANCO DE HORAS (migration 0027).
//
// É a peça que a diretoria pediu para ver primeiro: "quanto de hora extra a
// gente tem, e qual o passivo do banco de horas". Sem dado, as telas de ponto
// abrem vazias e não há o que mostrar.
//
// O que cria (depende de 01-base já semeado; descobre as pessoas CONSULTANDO
// O BANCO, como 10-folha-sst):
//
//   • ESCALA para todo colaborador ativo, com mix real das 3 jornadas do
//     catálogo (0027): 5x2 administrativo 44h, 6x1 loja 44h e plantão 12x36
//     no centro de distribuição. A escala vale desde a admissão (ou desde o
//     início da competência anterior, o que for mais recente).
//
//   • MARCAÇÕES de DUAS competências, geradas dia a dia com variação de
//     minutos: entrada/intervalo/saída plausíveis, alguns dias com hora extra,
//     poucos com atraso, pouquíssimos com falta. Entram como origem
//     'importacao', amarradas a um LOTE por competência — é assim que vão
//     entrar de verdade quando o REP-P estiver contratado (AFD/AEJ).
//
//   • APURAÇÃO das duas competências, com a MEMÓRIA DE CÁLCULO completa e os
//     MOVIMENTOS de banco de horas. O motor é IMPORTADO de
//     src/dominios/ponto/calculo.ts, não copiado: a demo abre a memória na tela
//     e cada minuto tem que fechar, então o usuário pode clicar em "Reapurar"
//     ao vivo e os números NÃO mudam. Enquanto havia um porte do motor aqui,
//     ele foi ficando para trás das correções e a demo passou a mostrar número
//     que a tela não reproduzia.
//
//   • FILA DE INTERCORRÊNCIAS: a competência anterior vem toda TRATADA (é o
//     histórico) e a corrente vem ABERTA — defeitos plantados de propósito
//     (saída não batida, intervalo abaixo do mínimo, dia sem marcação e o ERRO
//     HUMANO DE COLETA: duas entradas ou duas saídas no mesmo dia) para o DP
//     ter o que resolver na tela.
//
//   • SALDOS DE BANCO DE HORAS VARIADOS: além do que as apurações creditam,
//     entra um saldo TRANSPORTADO da implantação (origem 'ajuste'), calibrado
//     para haver gente acima do limite da regra, gente perto de zero e uma
//     pessoa NEGATIVA — o painel do gestor precisa de contraste.
//
//   • FERIADO DE UNIDADE dentro do período (aniversário da cidade da Matriz),
//     para o trabalho no dia virar HE 100% e a tela de parâmetros ter um
//     feriado que não é nacional.
//
//   • A persona `funcionario@fastdemo.local` recebe tratamento explícito:
//     saldo positivo alto e hora extra nas duas competências — é ela que
//     demonstra o portal do colaborador.
//
// POR QUE A APURAÇÃO VAI ATÉ ONTEM: `apurarCompetencia` só apura DIA FECHADO
// (ver o comentário em src/dominios/ponto/servico.ts). Este semeador respeita
// o mesmo corte — gera marcação até ontem e apura até ontem —, senão reapurar
// na demo produziria números diferentes dos semeados.
//
// Idempotente: apaga tudo que ELE cria (desligando os triggers append-only
// DENTRO da transação) e insere de novo. Datas SEMPRE relativas a hoje.
//
// Uso isolado: node --env-file=.env db/semear/15-ponto.js
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  aleatorio,
  comTriggersDesligados,
  executarSozinho,
  hoje,
  inserirLote,
  inteiro,
  log,
} = require('./comum');

const SEMENTE = 20260915;

// Tabelas que este módulo esvazia. Ordem filho → pai (FKs da 0027).
const TABELAS_LIMPEZA = [
  'rh.banco_horas_movimento',
  'rh.apuracao_ponto',
  'rh.intercorrencia_ponto',
  'rh.marcacao',
  'rh.lote_importacao_ponto',
  'rh.escala_colaborador',
];

// ================================================================== datas

const MINUTOS_DO_DIA = 1440;

function iso(data) {
  return data.toISOString().slice(0, 10);
}

function diaUtc(texto) {
  const [ano, mes, dia] = texto.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(texto, dias) {
  const base = diaUtc(texto);
  base.setUTCDate(base.getUTCDate() + dias);
  return iso(base);
}

/** 0 domingo … 6 sábado, no calendário civil. */
function diaDaSemana(texto) {
  return diaUtc(texto).getUTCDay();
}

/** Dias corridos entre duas datas (a − b). */
function distanciaEmDias(a, b) {
  return Math.round((diaUtc(a).getTime() - diaUtc(b).getTime()) / 86400000);
}

/**
 * MESMA regra de diaDeEscala() em src/dominios/ponto/servico.ts: em jornada com
 * ciclo, o dia é de trabalho quando dista um múltiplo do ciclo da âncora. Sem
 * âncora ou sem ciclo devolve null — e aí o motor não afirma escala nenhuma.
 */
function diaDeEscala(escala, data) {
  const ciclo = escala.jornada.ciclo_dias;
  if (!escala.ancora || ciclo === null || ciclo <= 0) return null;
  const distancia = distanciaEmDias(data, escala.ancora);
  if (distancia < 0) return null;
  return distancia % ciclo === 0;
}

/** Competência (ano/mês e lista de dias) deslocada de N meses de hoje. */
function competenciaDeslocada(mesesAtras) {
  const base = hoje();
  const primeiro = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - mesesAtras, 1)
  );
  const ano = primeiro.getUTCFullYear();
  const mes = primeiro.getUTCMonth() + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dias = [];
  for (let dia = 1; dia <= ultimoDia; dia += 1) {
    dias.push(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
  }
  return {
    ano,
    mes,
    dias,
    rotulo: `${String(mes).padStart(2, '0')}/${ano}`,
  };
}

/**
 * Instante UTC de um minuto do dia em America/Sao_Paulo (UTC−3, sem horário de
 * verão desde 2019). Minuto ≥ 1440 cai no dia seguinte — é assim que o plantão
 * 12x36 grava a saída das 07:30 da manhã seguinte.
 */
function instanteLocal(dataIso, minuto) {
  const base = diaUtc(dataIso);
  return new Date(base.getTime() + (minuto + 3 * 60) * 60_000).toISOString();
}

// ================================================================== motor de ponto
// O SEMEADOR USA O MOTOR DE VERDADE, importado de
// src/dominios/ponto/calculo.ts. Antes ele carregava um PORTE do motor, linha a
// linha, com a instrução de espelhar toda mudança — e o porte já tinha ficado
// para trás em três correções (a abertura sobrescrita em silêncio, a hora
// noturna reduzida e o fator do banco aplicado no acumulado). Copiar o motor
// para semear é copiar a chance de a demo mostrar número que a tela não
// reproduz; agora "Reapurar" na demo devolve os mesmos minutos porque é
// literalmente a mesma função.
//
// require() de módulo TypeScript funciona sem transpilar desde o Node 22/23
// (type stripping); este semeador já roda em Node 24.
const {
  agruparMarcacoesPorDia,
  apurarPonto,
  limitarCreditoDoBanco,
} = require('../../src/dominios/ponto/calculo.ts');


// ================================================================== escala por cargo
// Distribuidora de material de construção: loja abre de segunda a sábado (6x1),
// retaguarda é 5x2 e o centro de distribuição roda plantão 12x36 à noite para
// separar carga fora do horário comercial.

const JORNADA_POR_CARGO = {
  'Diretor(a) de Operações': 'COMERCIAL-44',
  'Gerente de Loja': 'LOJA-44',
  'Supervisor(a) Comercial': 'COMERCIAL-44',
  'Vendedor(a)': 'LOJA-44',
  'Auxiliar de Vendas': 'LOJA-44',
  Estoquista: 'LOJA-44',
  Conferente: 'PLANTAO-12X36',
  'Motorista Entregador': 'PLANTAO-12X36',
  'Analista de RH': 'COMERCIAL-44',
  'Assistente de DP': 'COMERCIAL-44',
  'Analista Financeiro': 'COMERCIAL-44',
  'Auxiliar Administrativo': 'COMERCIAL-44',
  'Comprador(a)': 'COMERCIAL-44',
  'Estagiário(a)': 'COMERCIAL-44',
  'Jovem Aprendiz': 'COMERCIAL-44',
};

const JORNADA_PADRAO = 'COMERCIAL-44';

// ================================================================== plano do dia
// Um "plano" é a lista de batidas de um dia, em minutos desde a meia-noite
// local. A geração é INTENCIONAL, não aleatória cega: cada dia recebe um
// PERFIL, e o perfil decide o desvio aplicado à saída. É o que garante que os
// números da demo sejam explicáveis ("este dia tem 1h12 de extra porque saiu
// às 19:00") e reprodutíveis.

/**
 * Turno comum (5x2 e 6x1): entrada, intervalo e saída ANCORADOS no horário
 * contratual da jornada (`horario_entrada_minuto`, migration 0034), não em um
 * 08:00 chumbado aqui.
 *
 * O desvio vai na ponta que ele descreve, e só nela: hora extra sai pela SAÍDA,
 * atraso entra pela ENTRADA. Antes, o gerador empurrava tudo para a saída e
 * deixava o intervalo variar até 12 min por conta própria — o que só não
 * aparecia porque o motor comparava o saldo do dia. Medindo variação por
 * marcação (art. 58 §1º), aquele ruído viraria atraso e hora extra no mesmo dia,
 * para todo mundo, todo dia. O ruído de rotina fica dentro da tolerância legal
 * POR CONSTRUÇÃO: no máximo 3 min em cada ponta e 2 no intervalo.
 */
function planoDiurno(rng, jornada, previsto, desvio) {
  const entradaPrevista = jornada.horario_entrada_minuto ?? 8 * 60;
  const intervaloPrevisto =
    jornada.horario_saida_minuto === null
      ? 60
      : Math.max(0, jornada.horario_saida_minuto - entradaPrevista - previsto);

  const atraso = desvio < 0 ? -desvio : 0;
  const extra = desvio > 0 ? desvio : 0;
  const ruidoEntrada = desvio === 0 ? inteiro(rng, -3, 3) : 0;
  const ruidoIntervalo = desvio === 0 ? inteiro(rng, 0, 2) : 0;
  const ruidoSaida = desvio === 0 ? inteiro(rng, -3, 3) : 0;

  // Quem chega atrasado sai no horário: o atraso é da ENTRADA e fica lá. Se a
  // saída acompanhasse o atraso, o dia fecharia com atraso E hora extra — que é
  // exatamente o caso que o motor passou a enxergar e que ninguém quer ver como
  // ruído de fundo na demo.
  const saidaPrevista = entradaPrevista + previsto + intervaloPrevisto;
  const entrada = entradaPrevista + atraso + ruidoEntrada;
  const manha = Math.round(previsto / 2);
  const inicioIntervalo = entrada + manha;
  // Intervalo SEMPRE ≥ mínimo legal: intervalo curto é defeito plantado, não
  // ruído (ver DEFEITOS_CORRENTE).
  const fimIntervalo = inicioIntervalo + intervaloPrevisto + ruidoIntervalo;
  const saida = saidaPrevista + extra + ruidoSaida;
  return [
    { tipo: 'entrada', minuto: entrada },
    { tipo: 'inicio_intervalo', minuto: inicioIntervalo },
    { tipo: 'fim_intervalo', minuto: fimIntervalo },
    { tipo: 'saida', minuto: saida },
  ];
}

/**
 * Plantão noturno 12x36: entra 18:30, intervalo de 1h ANTES da meia-noite e
 * sai 07:30 do dia seguinte (minuto 1890 — o motor arrasta a saída para o dia
 * do plantão). 720 min trabalhados = a carga diária exata da jornada, e 420
 * min caem na janela noturna 22:00–05:00.
 */
function planoPlantaoNoturno(rng) {
  const entrada = 18 * 60 + 30 + inteiro(rng, -3, 3);
  const inicioIntervalo = 21 * 60;
  const fimIntervalo = 22 * 60;
  const saida = entrada + 780; // 13h de amplitude − 1h de intervalo = 12h
  return [
    { tipo: 'entrada', minuto: entrada },
    { tipo: 'inicio_intervalo', minuto: inicioIntervalo },
    { tipo: 'fim_intervalo', minuto: fimIntervalo },
    { tipo: 'saida', minuto: saida },
  ];
}

// ================================================================== contexto do banco

async function carregarJornadas(cliente) {
  const { rows } = await cliente.query(
    `SELECT id, codigo, nome, tipo, carga_diaria_minutos, carga_semanal_minutos,
            previsto_por_dia_semana, ciclo_dias,
            intervalo_minimo_minutos, intervalo_obrigatorio_acima_minutos,
            tolerancia_entrada_minutos, tolerancia_saida_minutos,
            horario_entrada_minuto, horario_saida_minuto,
            dia_repouso_semana, dias_uteis_semana,
            (EXTRACT(HOUR FROM adicional_noturno_inicio) * 60
             + EXTRACT(MINUTE FROM adicional_noturno_inicio))::int AS noturno_inicio,
            (EXTRACT(HOUR FROM adicional_noturno_fim) * 60
             + EXTRACT(MINUTE FROM adicional_noturno_fim))::int AS noturno_fim,
            hora_noturna_segundos, janela_arraste_minutos
       FROM rh.jornada_versao
      WHERE status = 'ativa'`
  );
  if (rows.length === 0) {
    throw new Error('Nenhuma jornada ativa — a migration 0027 semeia as três.');
  }
  const porCodigo = new Map();
  for (const linha of rows) {
    porCodigo.set(linha.codigo, {
      id: Number(linha.id),
      codigo: linha.codigo,
      nome: linha.nome,
      tipo: linha.tipo,
      carga_diaria_minutos: linha.carga_diaria_minutos,
      carga_semanal_minutos: linha.carga_semanal_minutos,
      previsto_por_dia_semana: linha.previsto_por_dia_semana
        ? linha.previsto_por_dia_semana.map(Number)
        : null,
      ciclo_dias: linha.ciclo_dias,
      intervalo_minimo_minutos: linha.intervalo_minimo_minutos,
      intervalo_obrigatorio_acima_minutos:
        linha.intervalo_obrigatorio_acima_minutos,
      tolerancia_entrada_minutos: linha.tolerancia_entrada_minutos,
      tolerancia_saida_minutos: linha.tolerancia_saida_minutos,
      horario_entrada_minuto: linha.horario_entrada_minuto,
      horario_saida_minuto: linha.horario_saida_minuto,
      dia_repouso_semana: linha.dia_repouso_semana,
      dias_uteis_semana: linha.dias_uteis_semana,
      adicional_noturno_inicio_minuto: linha.noturno_inicio,
      adicional_noturno_fim_minuto: linha.noturno_fim,
      hora_noturna_segundos: linha.hora_noturna_segundos,
      janela_arraste_minutos: linha.janela_arraste_minutos,
    });
  }
  return porCodigo;
}

/** A regra PADRÃO da empresa (0027). Escopo mais específico não é semeado. */
async function carregarRegraBanco(cliente) {
  const { rows } = await cliente.query(
    `SELECT id, limite_positivo_minutos, limite_negativo_minutos,
            fator_he_50::float8 AS fator_he_50, fator_he_100::float8 AS fator_he_100
       FROM rh.regra_banco_horas_versao
      WHERE status = 'ativa'
        AND estabelecimento_id IS NULL AND cargo_id IS NULL AND colaborador_id IS NULL`
  );
  if (rows.length === 0) {
    throw new Error('Sem regra de banco de horas padrão da empresa (migration 0027).');
  }
  return {
    id: Number(rows[0].id),
    limite_positivo_minutos: rows[0].limite_positivo_minutos,
    limite_negativo_minutos: rows[0].limite_negativo_minutos,
    fator_he_50: rows[0].fator_he_50,
    fator_he_100: rows[0].fator_he_100,
  };
}

async function carregarPessoas(cliente) {
  const { rows } = await cliente.query(
    `SELECT c.id, c.matricula, c.nome_completo, c.data_admissao::text AS admissao,
            u.email, cv.nome AS cargo, l.estabelecimento_id,
            ev.unidade
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       LEFT JOIN rh.posicao_colaborador p
         ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       LEFT JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
       LEFT JOIN rh.lotacao l
         ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id
        AND ev.status = 'ativa' AND ev.fim_vigencia IS NULL
      WHERE c.status = 'ativo'
      ORDER BY c.matricula`
  );
  return rows.map((linha) => ({
    id: Number(linha.id),
    matricula: linha.matricula,
    nome: linha.nome_completo,
    email: linha.email,
    admissao: linha.admissao,
    cargo: linha.cargo,
    unidade: linha.unidade,
    estabelecimentoId: linha.estabelecimento_id === null ? null : Number(linha.estabelecimento_id),
  }));
}

/** Quem "importa" e "apura" na demo: o operador de DP. */
async function carregarOperadorDp(cliente) {
  const { rows } = await cliente.query(
    `SELECT u.id, u.nome, u.email
       FROM sistema.usuario u
       JOIN rh.colaborador c ON c.usuario_id = u.id
      WHERE u.papel = 'dp' AND u.ativo AND c.status = 'ativo'
      ORDER BY (u.email = 'dp@fastdemo.local') DESC, u.id
      LIMIT 1`
  );
  if (rows.length === 0) throw new Error('Nenhum usuário de DP ativo para operar o ponto.');
  return { id: Number(rows[0].id), nome: rows[0].nome, email: rows[0].email };
}

// ================================================================== limpeza

async function limpar(cliente) {
  const removidos = {};
  await comTriggersDesligados(cliente, TABELAS_LIMPEZA, async () => {
    for (const tabela of TABELAS_LIMPEZA) {
      // eslint-disable-next-line no-await-in-loop -- ordem filho → pai importa
      const resultado = await cliente.query(`DELETE FROM ${tabela}`);
      if (resultado.rowCount > 0) removidos[tabela] = resultado.rowCount;
    }
    // Feriado de UNIDADE é deste módulo; o nacional é catálogo da 0027.
    const feriados = await cliente.query(
      'DELETE FROM rh.feriado WHERE estabelecimento_id IS NOT NULL'
    );
    if (feriados.rowCount > 0) removidos['rh.feriado'] = feriados.rowCount;
  });

  // As variáveis de folha que ESTE módulo importa do ponto (origem 'ponto').
  // Numa execução completa do povoador, 10-folha-sst já limpou a tabela toda;
  // isto é o que torna `node db/semear/15-ponto.js` sozinho repetível.
  await comTriggersDesligados(cliente, ['rh_folha.variavel_lancada'], async () => {
    const variaveis = await cliente.query(
      "DELETE FROM rh_folha.variavel_lancada WHERE origem = 'ponto'"
    );
    if (variaveis.rowCount > 0) removidos['rh_folha.variavel_lancada'] = variaveis.rowCount;
  });
  const total = Object.values(removidos).reduce((a, b) => a + b, 0);
  log(
    total === 0
      ? '15-ponto: nada de ponto para limpar.'
      : `15-ponto: limpeza — ${total} linha(s) em ${Object.keys(removidos).length} tabela(s).`
  );
}

// ================================================================== semeadura

async function semear(cliente) {
  await limpar(cliente);

  const rng = aleatorio(SEMENTE);
  const jornadas = await carregarJornadas(cliente);
  const regra = await carregarRegraBanco(cliente);
  const pessoas = await carregarPessoas(cliente);
  const dp = await carregarOperadorDp(cliente);
  if (pessoas.length === 0) throw new Error('Nenhum colaborador ativo — rode 01-base antes.');

  const anterior = competenciaDeslocada(1);
  const corrente = competenciaDeslocada(0);
  // Só DIA FECHADO entra: o app apura até ontem (ver diasFechadosDaCompetencia
  // em src/dominios/ponto/servico.ts). Gerar batida de hoje ou de amanhã faria
  // a demo divergir de qualquer reapuração feita ao vivo.
  const ontem = somarDias(iso(hoje()), -1);
  const diasCorrente = corrente.dias.filter((data) => data <= ontem);

  // ---------------------------------------------------------- feriado de unidade
  // Aniversário da cidade da Matriz, numa quarta-feira da competência ANTERIOR
  // (dia útil garantido). Quem for da Matriz e trabalhar no dia ganha HE 100%.
  const matriz = pessoas.find((p) => p.unidade === 'Matriz Centro' && p.estabelecimentoId);
  let feriadoUnidade = null;
  if (matriz) {
    const quarta = anterior.dias.find(
      (data) => diaDaSemana(data) === 3 && Number(data.slice(8)) >= 8
    );
    if (quarta) {
      await cliente.query(
        `INSERT INTO rh.feriado
           (data, nome, abrangencia, uf, municipio, estabelecimento_id, tipo)
         VALUES ($1::date, $2, 'municipal', 'SP', 'Sorocaba', $3, 'feriado')
         ON CONFLICT DO NOTHING`,
        [quarta, 'Aniversário da cidade (unidade Matriz Centro)', matriz.estabelecimentoId]
      );
      feriadoUnidade = { data: quarta, estabelecimentoId: matriz.estabelecimentoId };
    }
  }

  // ---------------------------------------------------------- escalas
  const escalas = [];
  const inicioEscala = anterior.dias[0];
  for (const pessoa of pessoas) {
    const codigo = JORNADA_POR_CARGO[pessoa.cargo] ?? JORNADA_PADRAO;
    const jornada = jornadas.get(codigo) ?? jornadas.get(JORNADA_PADRAO);
    // A escala não pode começar antes da admissão (a pessoa não existia).
    const inicio =
      pessoa.admissao && pessoa.admissao > inicioEscala ? pessoa.admissao : inicioEscala;
    // ÂNCORA DA ESCALA (migration 0034): o primeiro dia de plantão do ciclo. Só
    // jornada com ciclo precisa dela; nas de padrão semanal quem manda é
    // previsto_por_dia_semana. É a âncora que faz o plantonista que não bateu
    // ponto nenhum virar FALTA e entrar na fila do DP em vez de sumir como
    // "fora da escala".
    //
    // A PARIDADE é escolhida para que ONTEM — o último dia apurado — caia na
    // FOLGA: um plantão que começasse ontem só fecharia hoje, e este semeador
    // não gera batida de hoje. Sem esse cuidado, o último dia da competência
    // nasceria com dez plantonistas em falta integral, que é ruído puro e não
    // demonstra nada.
    const ancora =
      jornada.ciclo_dias === null
        ? null
        : distanciaEmDias(ontem, inicio) % 2 === 1
          ? inicio
          : somarDias(inicio, 1);
    escalas.push({ pessoa, jornada, inicio, ancora });
  }
  await inserirLote(
    cliente,
    'rh.escala_colaborador',
    [
      'colaborador_id',
      'jornada_versao_id',
      'inicio_vigencia',
      'ancora_escala',
      'observacao',
    ],
    escalas.map((e) => [
      e.pessoa.id,
      e.jornada.id,
      e.inicio,
      e.ancora,
      `Escala de implantação — ${e.jornada.nome} (${e.pessoa.cargo ?? 'sem cargo'})`,
    ])
  );

  // ---------------------------------------------------------- feriados do período
  // Só `tipo = 'feriado'` é dia de REPOUSO; ponto facultativo (Carnaval,
  // Corpus Christi) é dia útil comum enquanto a empresa não decidir o
  // contrário — é o que a 0027 documenta e o que o motor aplica.
  const { rows: feriadosNacionais } = await cliente.query(
    `SELECT data::text AS data, nome
       FROM rh.feriado
      WHERE abrangencia = 'nacional' AND tipo = 'feriado'
        AND data BETWEEN $1::date AND $2::date`,
    [anterior.dias[0], corrente.dias[corrente.dias.length - 1]]
  );
  const feriadoNacionalPorData = new Map(feriadosNacionais.map((f) => [f.data, f.nome]));

  /** Nome do feriado que vale para ESTA pessoa neste dia, ou null. */
  const feriadoDe = (pessoa, data) => {
    if (
      feriadoUnidade !== null &&
      feriadoUnidade.data === data &&
      pessoa.estabelecimentoId === feriadoUnidade.estabelecimentoId
    ) {
      return 'Aniversário da cidade (unidade Matriz Centro)';
    }
    return feriadoNacionalPorData.get(data) ?? null;
  };

  // ---------------------------------------------------------- defeitos plantados
  // A FILA DO DP. Ficam na competência CORRENTE e ABERTOS: é o trabalho que
  // está na mesa dela hoje. A competência anterior também tem defeitos (o mês
  // real tem), mas lá eles vêm TRATADOS — é o histórico.
  //
  // Cada defeito é uma AUSÊNCIA de batida ou um intervalo curto; o motor
  // portado acima detecta a intercorrência sozinho, com o mesmo texto do app.
  // Consequência: reapurar a competência corrente na demo redetecta exatamente
  // as mesmas linhas, e a fila não muda.
  const candidatosDefeito = pessoas.filter(
    (p) => (JORNADA_POR_CARGO[p.cargo] ?? JORNADA_PADRAO) !== 'PLANTAO-12X36'
  );
  // Só dia útil de segunda a sexta e fora de feriado nacional: em dia sem
  // jornada prevista o defeito não produziria intercorrência nenhuma.
  const diasDefeito = diasCorrente.filter(
    (data) =>
      diaDaSemana(data) >= 1 &&
      diaDaSemana(data) <= 5 &&
      !feriadoNacionalPorData.has(data) &&
      data >= somarDias(ontem, -12)
  );
  const defeitos = new Map(); // `${colaboradorId}|${data}` -> tipo
  const pessoasComDefeito = new Set();
  const plantarDefeito = (indicePessoa, indiceDia, tipo) => {
    const data = diasDefeito[indiceDia % diasDefeito.length];
    if (!data || candidatosDefeito.length === 0) return;
    // UMA PESSOA POR DEFEITO. Os índices são módulo do tamanho da lista, então
    // dois defeitos podiam cair na mesma pessoa e o segundo sobrescrevia o
    // primeiro EM SILÊNCIO — a fila nascia menor do que o semeador anuncia e um
    // dos cenários simplesmente não aparecia na demo. Aqui o índice é só o
    // ponto de partida: quem já tem defeito é pulado.
    for (let passo = 0; passo < candidatosDefeito.length; passo += 1) {
      const pessoa = candidatosDefeito[(indicePessoa + passo) % candidatosDefeito.length];
      if (pessoasComDefeito.has(pessoa.id)) continue;
      pessoasComDefeito.add(pessoa.id);
      defeitos.set(`${pessoa.id}|${data}`, tipo);
      return;
    }
  };
  // 4 saídas não batidas (entrada_sem_saida, 4 linhas — o dia fica PENDENTE e
  // por isso NÃO gera mais atraso fora da tolerância junto), 4 intervalos
  // abaixo do mínimo (intervalo_incompleto, 4 linhas) e 1 dia sem marcação
  // nenhuma (sem_marcacao, 1 linha).
  for (let i = 0; i < 4; i += 1) plantarDefeito(3 + i * 7, 2 + i * 3, 'sem_saida');
  for (let i = 0; i < 4; i += 1) plantarDefeito(5 + i * 9, 4 + i * 2, 'intervalo_curto');
  plantarDefeito(11, 6, 'ausente');

  // ERRO HUMANO DE COLETA — o ramo que a base NÃO exercitava. Em 10.896
  // marcações não existia UMA batida do mesmo tipo em minutos diferentes, e é
  // exatamente esse o caso que o motor passou a tratar como evento real (dia
  // PENDENTE, nada lançado) em vez de "eco do coletor" a ser descartado. Sem
  // dado, a correção estava certa e invisível: a fila do DP nunca mostrava ao
  // cliente o erro mais comum que existe no relógio de ponto.
  //
  // São quatro casos, em quatro pessoas diferentes, na competência CORRENTE
  // (onde as intercorrências ficam ABERTAS):
  //   entrada_dupla → esqueceu de bater a saída para o almoço e, na volta,
  //                   bateu ENTRADA de novo: duas ENTRADAS no mesmo dia;
  //   saida_dupla   → bateu SAÍDA ao sair para o almoço e esqueceu a volta:
  //                   duas SAÍDAS no mesmo dia.
  // Os dois lados importam: um é abertura sobre abertura, o outro é fechamento
  // sem abertura, e o motor trata cada um por um caminho diferente.
  for (let i = 0; i < 2; i += 1) plantarDefeito(7 + i * 5, 3 + i * 4, 'entrada_dupla');
  for (let i = 0; i < 2; i += 1) plantarDefeito(13 + i * 6, 5 + i * 4, 'saida_dupla');

  // ---------------------------------------------------------- lotes de importação
  const lotes = {};
  for (const competencia of [anterior, corrente]) {
    const { rows } = await cliente.query(
      `INSERT INTO rh.lote_importacao_ponto
         (arquivo, competencia_ano, competencia_mes, linhas_lidas, linhas_aceitas,
          linhas_rejeitadas, relatorio, importado_por, importado_em)
       VALUES ($1, $2, $3, 0, 0, 0, '{}'::jsonb, $4, $5::timestamptz)
       RETURNING id`,
      [
        `AFD-${competencia.ano}${String(competencia.mes).padStart(2, '0')}.txt`,
        competencia.ano,
        competencia.mes,
        dp.id,
        instanteLocal(competencia.dias[0], 9 * 60 + 15),
      ]
    );
    lotes[competencia.rotulo] = Number(rows[0].id);
  }

  // ---------------------------------------------------------- marcações
  // Perfil do dia: sorteado uma vez por pessoa/dia, com pesos calibrados para
  // a demo — hora extra é comum (é o problema que a diretoria quer ver),
  // atraso é raro e falta é rara.
  const marcacoes = [];
  const marcacoesPorPessoa = new Map();
  let nsr = 1;

  const registrar = (pessoaId, dataIso, tipo, minuto, competenciaRotulo) => {
    const dataReal = minuto >= MINUTOS_DO_DIA ? somarDias(dataIso, 1) : dataIso;
    const minutoReal = minuto % MINUTOS_DO_DIA;
    marcacoes.push([
      pessoaId,
      instanteLocal(dataIso, minuto),
      tipo,
      'importacao',
      `AFD ${competenciaRotulo} · NSR ${String(nsr).padStart(6, '0')}`,
      'registro',
      lotes[competenciaRotulo],
      dp.id,
    ]);
    nsr += 1;
    const lista = marcacoesPorPessoa.get(pessoaId) ?? [];
    lista.push({ id: nsr, tipo, data_local: dataReal, minuto_local: minutoReal });
    marcacoesPorPessoa.set(pessoaId, lista);
  };

  for (const escala of escalas) {
    const { pessoa, jornada } = escala;
    const plantao = jornada.tipo === '12x36';
    for (const competencia of [anterior, corrente]) {
      const dias = competencia === corrente ? diasCorrente : competencia.dias;
      for (const data of dias) {
        if (data < escala.inicio) continue;
        const semana = diaDaSemana(data);

        if (plantao) {
          // Dia de plantão é o que o CICLO da escala manda (âncora + ciclo_dias,
          // migration 0034) — não mais "dia ímpar do mês", que quebrava na
          // virada de mês de 31 dias e faria o motor cobrar falta num dia que o
          // semeador não gerou. A saída cai na madrugada seguinte e o arraste
          // amarra tudo ao dia do plantão, inclusive na virada da competência.
          if (diaDeEscala(escala, data) !== true) continue;
          for (const batida of planoPlantaoNoturno(rng)) {
            registrar(pessoa.id, data, batida.tipo, batida.minuto, competencia.rotulo);
          }
          continue;
        }

        // MESMO dado de previstoDoDia(): o previsto do dia da semana está na
        // jornada (previsto_por_dia_semana, 0034), não em regra escrita aqui —
        // era a duplicação desta regra em dois lugares que deixava a LOJA-44
        // prometer "sábado 4h" no nome e prever 7h20 na conta.
        const feriado = feriadoDe(pessoa, data);
        const previsto =
          feriado !== null ? 0 : (jornada.previsto_por_dia_semana?.[semana] ?? 0);

        const defeito = defeitos.get(`${pessoa.id}|${data}`) ?? null;

        // Dia sem previsão (repouso da jornada, feriado ou sábado do 5x2):
        // normalmente sem batida. Uma fração pequena trabalha — e vira 100% (no
        // dia de repouso da jornada e no feriado) ou 50% (sábado do 5x2, que é
        // dia útil não trabalhado, não repouso legal).
        if (previsto === 0) {
          const chamado = rng() < (feriado !== null ? 0.15 : semana === 6 ? 0.12 : 0.04);
          if (!chamado || defeito) continue;
          const entrada = 8 * 60 + inteiro(rng, -5, 10);
          const duracao = inteiro(rng, 180, 300);
          registrar(pessoa.id, data, 'entrada', entrada, competencia.rotulo);
          registrar(pessoa.id, data, 'saida', entrada + duracao, competencia.rotulo);
          continue;
        }

        if (defeito === 'ausente') continue; // dia previsto e nenhuma batida

        // Perfil do dia útil. O ATRASO é raro por escolha: cada atraso acima
        // da tolerância vira uma intercorrência `fora_da_tolerancia`, e na
        // competência CORRENTE elas ficam abertas — com a taxa do mês passado
        // a fila do DP viraria uma parede de 40 linhas e a tela perderia a
        // leitura. No mês anterior (já tratado) o atraso é frequente, que é o
        // que o histórico real mostra.
        const sorteio = rng();
        let desvio;
        if (sorteio < 0.16) {
          desvio = inteiro(rng, 35, 145); // hora extra de verdade
        } else if (sorteio < (competencia === anterior ? 0.185 : 0.163)) {
          desvio = -inteiro(rng, 25, 65); // atraso acima da tolerância
        } else {
          // Dia normal: o ruído de rotina (poucos minutos em cada ponta) é
          // gerado dentro de planoDiurno, POR MARCAÇÃO e dentro do limite do
          // art. 58 §1º. Sortear aqui um desvio de ±8 min mandava tudo para uma
          // ponta só e virava atraso de 7 min em metade dos dias da demo.
          desvio = 0;
        }
        // Falta integral: só na competência ANTERIOR (lá o DP já tratou) e
        // rara. Na corrente, quem falta é o defeito 'ausente' plantado acima.
        if (competencia === anterior && rng() < 0.008) continue;

        const batidas = planoDiurno(rng, jornada, previsto, desvio);
        if (defeito === 'sem_saida') {
          batidas.pop(); // some a saída: turno aberto que nunca fecha
        } else if (defeito === 'intervalo_curto') {
          // 25 min de intervalo mantendo o total trabalhado exato — o único
          // achado do dia é o intervalo abaixo do mínimo do art. 71.
          // 25 min de intervalo com a SAÍDA no horário contratual: a pessoa
          // ficou 35 min a mais à disposição, que é o que o art. 71 §4º manda
          // pagar como extra. Encurtar o intervalo E antecipar a saída para
          // "manter o total exato" — como este semeador fazia — descreveria um
          // dia que não acontece: quem almoça menos vai embora na hora.
          const entrada = batidas[0].minuto;
          const manha = Math.round(previsto / 2);
          batidas[1].minuto = entrada + manha;
          batidas[2].minuto = batidas[1].minuto + 25;
        } else if (defeito === 'entrada_dupla') {
          // Esqueceu a saída para o almoço e, ao voltar, bateu ENTRADA de novo.
          // As duas batidas de intervalo dão lugar a uma segunda ENTRADA no
          // minuto em que a pessoa voltou: entrada 08:00 / entrada 13:00 /
          // saída 17:48. Abertura sobre abertura — o dia fica PENDENTE e não
          // lança nem hora extra nem atraso enquanto o DP não tratar.
          batidas.splice(1, 2, { tipo: 'entrada', minuto: batidas[2].minuto });
        } else if (defeito === 'saida_dupla') {
          // Bateu SAÍDA ao sair para o almoço (em vez de início de intervalo) e
          // esqueceu de bater a volta: entrada 08:00 / saída 12:24 / saída
          // 17:48. Fechamento sem abertura — o outro lado do mesmo erro humano.
          batidas.splice(1, 2, { tipo: 'saida', minuto: batidas[1].minuto });
        }
        for (const batida of batidas) {
          registrar(pessoa.id, data, batida.tipo, batida.minuto, competencia.rotulo);
        }
      }
    }
  }

  await inserirLote(
    cliente,
    'rh.marcacao',
    [
      'colaborador_id',
      'momento',
      'tipo',
      'origem',
      'origem_referencia',
      'efeito',
      'lote_id',
      'registrada_por',
    ],
    marcacoes
  );

  // Fecha o contador de cada lote com o que realmente entrou.
  for (const competencia of [anterior, corrente]) {
    await cliente.query(
      `UPDATE rh.lote_importacao_ponto
          SET linhas_lidas = sub.total, linhas_aceitas = sub.total,
              linhas_rejeitadas = 0,
              relatorio = jsonb_build_object(
                'rejeitadas', '[]'::jsonb,
                'avisos', jsonb_build_array(
                  'Arquivo AFD do relógio de ponto da competência, importado pelo DP.'))
         FROM (SELECT count(*)::int AS total FROM rh.marcacao WHERE lote_id = $1) sub
        WHERE id = $1`,
      [lotes[competencia.rotulo]]
    );
  }

  // ---------------------------------------------------------- apuração
  const apuracoes = [];
  const intercorrencias = [];
  const movimentos = [];
  let totalHe = 0;
  let totalNoturno = 0;

  for (const escala of escalas) {
    const { pessoa, jornada } = escala;
    const porDia = agruparMarcacoesPorDia(
      marcacoesPorPessoa.get(pessoa.id) ?? [],
      jornada
    );

    for (const competencia of [anterior, corrente]) {
      // Mesmo recorte do serviço: dia anterior ao início da escala não é dia
      // da pessoa (admitida no meio do mês não deve meia competência de falta).
      const dias = (competencia === corrente ? diasCorrente : competencia.dias).filter(
        (data) => data >= escala.inicio
      );
      if (dias.length === 0) continue;
      const diasMotor = dias.map((data) => ({
        data,
        dia_semana: diaDaSemana(data),
        feriado: feriadoDe(pessoa, data),
        dia_de_escala: diaDeEscala(escala, data),
        marcacoes: porDia.get(data) ?? [],
      }));

      const resultado = apurarPonto({
        ano: competencia.ano,
        mes: competencia.mes,
        jornada,
        regra: {
          id: regra.id,
          fator_he_50: regra.fator_he_50,
          fator_he_100: regra.fator_he_100,
        },
        dias: diasMotor,
      });

      const diasUteis = resultado.dias.filter((d) => d.previsto_minutos > 0).length;
      const he = resultado.he_50_minutos + resultado.he_100_minutos;
      const memoria = {
        ...resultado.memoria,
        resumo: {
          dias_uteis: diasUteis,
          dias_com_trabalho: resultado.dias.filter((d) => d.trabalhado_minutos > 0).length,
          total_he_minutos: he,
          media_he_por_dia_util_minutos: diasUteis > 0 ? Math.round(he / diasUteis) : 0,
          formula_media: '(HE 50% + HE 100%) ÷ dias com jornada prevista na competência',
        },
        dias: resultado.dias,
      };

      const ultimoDia = dias[dias.length - 1];
      apuracoes.push({ pessoa, competencia, ultimoDia, jornada, resultado, memoria });
      totalHe += he;
      totalNoturno += resultado.adicional_noturno_minutos;

      for (const achado of resultado.intercorrencias) {
        intercorrencias.push({ pessoa, competencia, achado });
      }
    }
  }

  // ---------------------------------------------------------- banco de horas
  // A ORDEM AQUI É CRONOLÓGICA DE PROPÓSITO, e por isso este bloco vem ANTES de
  // gravar a apuração: o saldo transportado entra na véspera da competência
  // anterior, então ele já está no livro quando cada mês credita — e é contra
  // ele que o TETO da regra é conferido, exatamente como `apurarCompetencia`
  // faz. Enquanto este semeador gravava o crédito CRU, a base nascia com saldo
  // acima do teto que a própria tela não reproduzia: clicar em "Reapurar" na
  // frente do cliente trocava 21h00 por 0h00 e levantava intercorrência.

  const saldoDoBanco = new Map();
  const lancarNoBanco = (pessoaId, data, minutos, origem, apuracaoId, texto) => {
    if (minutos === 0) return;
    saldoDoBanco.set(pessoaId, (saldoDoBanco.get(pessoaId) ?? 0) + minutos);
    movimentos.push([pessoaId, data, minutos, origem, apuracaoId, texto, dp.id]);
  };

  // 1) SALDO TRANSPORTADO da implantação do banco de horas (origem 'ajuste').
  //    É ele que dá CONTRASTE ao painel do gestor: sem isso todo mundo teria o
  //    saldo de dois meses e a tela ficaria plana. Distribuição intencional:
  //    ~1 em 8 fica ACIMA do limite positivo da regra (o alerta que a diretoria
  //    quer ver — e é legítimo estar acima: o saldo veio de antes do acordo, e
  //    é justamente quem o DP precisa poder compensar), e o resto se espalha.
  //    Quem fica NEGATIVO no fim é fechado no passo 5, depois das apurações.
  const vespera = somarDias(anterior.dias[0], -1);
  const negativoEscolhido = pessoas[Math.floor(pessoas.length / 3)];
  const TEXTO_TRANSPORTE =
    'Saldo transportado na implantação do banco de horas (acordo coletivo vigente)';
  for (const pessoa of pessoas) {
    let minutos;
    if (pessoa.id === negativoEscolhido.id) {
      minutos = -inteiro(rng, 480, 900); // deve horas: 8h a 15h
    } else {
      const faixa = rng();
      if (faixa < 0.12) {
        minutos = inteiro(rng, regra.limite_positivo_minutos - 120, regra.limite_positivo_minutos + 600);
      } else if (faixa < 0.45) {
        minutos = inteiro(rng, 300, 1200);
      } else if (faixa < 0.8) {
        minutos = inteiro(rng, 30, 300);
      } else {
        minutos = 0;
      }
    }
    lancarNoBanco(pessoa.id, vespera, minutos, 'ajuste', null, TEXTO_TRANSPORTE);
  }

  // 2) A persona do portal: saldo positivo alto e visível, sempre.
  const persona = pessoas.find((p) => p.email === 'funcionario@fastdemo.local');
  if (persona) {
    lancarNoBanco(persona.id, vespera, 1_260, 'ajuste', null, TEXTO_TRANSPORTE);
    // Uma compensação real, para o extrato dela ter as duas direções. Entra
    // antes das apurações porque é do dia 13 da competência anterior.
    lancarNoBanco(
      persona.id,
      somarDias(anterior.dias[0], 12),
      -240,
      'compensacao',
      null,
      'Compensação de meio período aprovada pelo gestor (saída antecipada)'
    );
  }

  // 3) O TETO DA REGRA sobre o que cada apuração credita. `apuracoes` está em
  //    ordem cronológica por pessoa (anterior e depois corrente), que é o que a
  //    conta exige: cada mês é limitado contra o saldo que os movimentos
  //    anteriores deixaram. A conta é a MESMA função do serviço.
  const tetoBanco = regra.limite_positivo_minutos;
  const pisoBanco = -regra.limite_negativo_minutos;
  for (const a of apuracoes) {
    const saldoAntes = saldoDoBanco.get(a.pessoa.id) ?? 0;
    const limite = limitarCreditoDoBanco(
      saldoAntes,
      a.resultado.saldo_banco_minutos,
      tetoBanco,
      pisoBanco,
      { regra: `Padrão da empresa (versão ${regra.id})`, competencia: a.competencia.rotulo }
    );
    // O saldo corre AQUI, e não na hora de empilhar o movimento (que só
    // acontece depois, quando a apuração já tem id): o teto do segundo mês tem
    // que enxergar o que o primeiro creditou.
    saldoDoBanco.set(a.pessoa.id, saldoAntes + limite.lancado);
    a.limite = limite;
    a.memoria.saldo_banco_teto = limite.memoria;
    if (limite.intercorrencia) {
      intercorrencias.push({
        pessoa: a.pessoa,
        competencia: a.competencia,
        achado: {
          data: a.ultimoDia,
          tipo: 'banco_fora_do_limite',
          detalhe: limite.intercorrencia,
        },
      });
    }
  }

  // Grava apuração e devolve os ids, para o movimento de banco apontar para ela.
  const idsApuracao = await inserirLote(
    cliente,
    'rh.apuracao_ponto',
    [
      'colaborador_id',
      'ano',
      'mes',
      'jornada_versao_id',
      'regra_banco_versao_id',
      'minutos_trabalhados',
      'minutos_previstos',
      'he_50_minutos',
      'he_100_minutos',
      'adicional_noturno_minutos',
      'adicional_noturno_relogio_minutos',
      'faltas_minutos',
      'atrasos_minutos',
      'dsr_desconto_minutos',
      'saldo_banco_minutos',
      'memoria',
      'calculada_em',
      'calculada_por',
    ],
    apuracoes.map((a) => [
      a.pessoa.id,
      a.competencia.ano,
      a.competencia.mes,
      a.jornada.id,
      regra.id,
      a.resultado.minutos_trabalhados,
      a.resultado.minutos_previstos,
      a.resultado.he_50_minutos,
      a.resultado.he_100_minutos,
      a.resultado.adicional_noturno_minutos,
      a.resultado.adicional_noturno_relogio_minutos,
      a.resultado.faltas_minutos,
      a.resultado.atrasos_minutos,
      a.resultado.dsr_desconto_minutos,
      // O que a apuração mandou ao banco é o que ENTROU no livro, não o que o
      // motor calculou antes do teto — igual ao serviço, senão o estorno de uma
      // reapuração devolveria crédito que nunca existiu.
      a.limite.lancado,
      JSON.stringify(a.memoria),
      instanteLocal(somarDias(a.ultimoDia, 1), 8 * 60 + 40),
      dp.id,
    ]),
    'id'
  );

  // 4) O movimento de cada apuração (origem 'apuracao', apontando para a linha
  //    da apuração — é assim que o app grava). O valor é o JÁ LIMITADO; o
  //    excedente virou intercorrência lá em cima.
  //    (empilha direto: o saldo desta linha já correu no passo 3)
  apuracoes.forEach((a, indice) => {
    if (a.limite.lancado === 0) return;
    movimentos.push([
      a.pessoa.id,
      a.ultimoDia,
      a.limite.lancado,
      'apuracao',
      Number(idsApuracao[indice].id),
      `Apuração de ${a.competencia.rotulo}` +
        (a.limite.excedente !== 0
          ? ` — lançado até o limite da regra (${a.limite.lancado} de ` +
            `${a.resultado.saldo_banco_minutos} min calculados)`
          : ''),
      dp.id,
    ]);
  });

  // 5) UMA PESSOA NEGATIVA no fim das contas. O painel do gestor precisa do
  //    contraste e o saldo transportado sozinho não segura: duas competências
  //    de apuração devolvem qualquer um ao positivo, e a demo acabava sem
  //    nenhum saldo devedor para mostrar. A folga adiantada entra no último dia
  //    apurado e respeita o PISO da regra pela mesma função do teto.
  if (negativoEscolhido) {
    const saldoAtual = saldoDoBanco.get(negativoEscolhido.id) ?? 0;
    const alvo = -inteiro(rng, 300, 900);
    const folga = limitarCreditoDoBanco(saldoAtual, alvo - saldoAtual, tetoBanco, pisoBanco, {
      regra: `Padrão da empresa (versão ${regra.id})`,
      competencia: corrente.rotulo,
    });
    lancarNoBanco(
      negativoEscolhido.id,
      diasCorrente[diasCorrente.length - 1],
      folga.lancado,
      'compensacao',
      null,
      'Folga adiantada acordada com o gestor — saldo negativo a compensar'
    );
  }

  await inserirLote(
    cliente,
    'rh.banco_horas_movimento',
    [
      'colaborador_id',
      'data',
      'minutos',
      'origem',
      'apuracao_id',
      'observacao',
      'registrado_por',
    ],
    movimentos
  );

  // ---------------------------------------------------------- intercorrências
  // Anterior = TRATADA (histórico do que o DP já resolveu).
  // Corrente  = ABERTA  (a fila que a demo mostra).
  const tratamentos = [
    ['corrigida', 'Marcação corrigida com o gestor da unidade; ajuste manual registrado.'],
    ['justificada', 'Justificativa do gestor aceita — atestado/autorização no GED.'],
    ['ignorada', 'Ruído do coletor conferido no AFD; sem efeito na apuração.'],
  ];
  let tratada = 0;
  const linhasIntercorrencia = [];
  const vistas = new Set();
  for (const item of intercorrencias) {
    // O índice único é (colaborador, data, tipo): o app usa ON CONFLICT DO
    // NOTHING, então repetir aqui só desperdiça linha.
    const chave = `${item.pessoa.id}|${item.achado.data}|${item.achado.tipo}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    const aberta = item.competencia === corrente;
    // O excedente do teto não se resolve corrigindo marcação: quem o trata
    // decide o destino das horas. No histórico ele aparece já decidido; na
    // competência corrente fica ABERTO, que é o assunto que a fila do DP tem
    // que carregar.
    const doTeto = item.achado.tipo === 'banco_fora_do_limite';
    const [status, observacao] = aberta
      ? [null, null]
      : doTeto
        ? [
            'justificada',
            'Excedente acordado com o gestor: virou folga programada no mês seguinte; ' +
              'o teto do banco não foi alterado.',
          ]
        : tratamentos[tratada++ % 3];
    linhasIntercorrencia.push([
      item.pessoa.id,
      item.achado.data,
      item.achado.tipo,
      aberta ? 'aberta' : status,
      item.achado.detalhe,
      aberta ? null : dp.id,
      aberta ? null : instanteLocal(somarDias(item.achado.data, 3), 10 * 60 + 25),
      aberta ? null : observacao,
    ]);
  }
  await inserirLote(
    cliente,
    'rh.intercorrencia_ponto',
    [
      'colaborador_id',
      'data',
      'tipo',
      'status',
      'detalhe',
      'corrigida_por',
      'corrigido_em',
      'observacao',
    ],
    linhasIntercorrencia
  );

  // ---------------------------------------------------------- ponto → folha (F5)
  // A competência de folha ABERTA é a do mês corrente (10-folha-sst a cria).
  // Aqui o semeador faz o MESMO que o botão "Importar do ponto" faria, para a
  // tela já abrir com as variáveis de origem 'ponto' e a diretoria ver a
  // ligação sem depender de um clique. Clicar no botão na demo é idempotente:
  // o serviço apaga o lote de origem 'ponto' e regrava exatamente estes números.
  //
  // Fiel a importarVariaveisDoPonto (src/dominios/folha/servico.ts): HE 50%,
  // HE 100% e adicional noturno em HORAS; falta em DIAS (minutos ÷ carga
  // diária da jornada apurada). DSR não entra — a rubrica 1202 é automática e
  // o motor de folha a deriva das faltas.
  const { rows: rubricas } = await cliente.query(
    `SELECT r.codigo, r.id
       FROM rh_folha.rubrica r
       JOIN rh_folha.rubrica_versao rv ON rv.rubrica_id = r.id AND rv.status = 'ativa'
      WHERE r.codigo IN ('1101','1102','1103','1201')`
  );
  const rubricaPorCodigo = new Map(rubricas.map((r) => [r.codigo, Number(r.id)]));
  const { rows: folhaAberta } = await cliente.query(
    `SELECT id FROM rh_folha.competencia_folha
      WHERE ano = $1 AND mes = $2 AND tipo = 'mensal' AND estado = 'aberta'`,
    [corrente.ano, corrente.mes]
  );

  let variaveisPonto = 0;
  if (folhaAberta.length > 0 && rubricaPorCodigo.size === 4) {
    const competenciaFolhaId = Number(folhaAberta[0].id);
    const horas = (minutos) => Math.round((minutos / 60) * 100) / 100;
    const linhas = [];
    for (const a of apuracoes) {
      if (a.competencia !== corrente) continue;
      // Carga da jornada PINADA na apuração — é ela que transforma minuto de
      // falta em DIA de falta (8h48 no administrativo, 7h20 na loja).
      const cargaDiaria = a.jornada.carga_diaria_minutos;
      const candidatos = [
        ['1101', horas(a.resultado.he_50_minutos)],
        ['1102', horas(a.resultado.he_100_minutos)],
        ['1103', horas(a.resultado.adicional_noturno_minutos)],
        [
          '1201',
          cargaDiaria > 0
            ? Math.round((a.resultado.faltas_minutos / cargaDiaria) * 100) / 100
            : 0,
        ],
      ];
      for (const [codigo, referencia] of candidatos) {
        if (referencia <= 0) continue;
        linhas.push([
          competenciaFolhaId,
          a.pessoa.id,
          rubricaPorCodigo.get(codigo),
          referencia,
          null,
          'ponto',
          dp.id,
        ]);
      }
    }
    await inserirLote(
      cliente,
      'rh_folha.variavel_lancada',
      [
        'competencia_id',
        'colaborador_id',
        'rubrica_id',
        'referencia',
        'valor',
        'origem',
        'lancado_por',
      ],
      linhas
    );
    variaveisPonto = linhas.length;
  }

  // ---------------------------------------------------------- resumo
  const abertas = linhasIntercorrencia.filter((l) => l[3] === 'aberta').length;
  const { rows: saldos } = await cliente.query(
    `SELECT count(*) FILTER (WHERE saldo > $1)::int AS acima,
            count(*) FILTER (WHERE saldo < 0)::int  AS negativos,
            sum(saldo)::int                          AS total
       FROM (SELECT colaborador_id, sum(minutos)::int AS saldo
               FROM rh.banco_horas_movimento GROUP BY colaborador_id) s`,
    [regra.limite_positivo_minutos]
  );
  const horas = (minutos) => `${Math.floor(Math.abs(minutos) / 60)}h${String(Math.abs(minutos) % 60).padStart(2, '0')}`;

  log(
    `15-ponto: ${escalas.length} escalas · ${marcacoes.length} marcações em ` +
      `${anterior.rotulo} e ${corrente.rotulo} · ${apuracoes.length} apurações`
  );
  log(
    `15-ponto: HE total ${horas(totalHe)} · adicional noturno ${horas(totalNoturno)} · ` +
      `banco ${saldos[0].total < 0 ? '−' : ''}${horas(saldos[0].total ?? 0)} ` +
      `(${saldos[0].acima} acima do limite, ${saldos[0].negativos} negativo(s))`
  );
  log(
    `15-ponto: ${linhasIntercorrencia.length} intercorrências — ${abertas} ABERTAS em ` +
      `${corrente.rotulo} (a fila do DP) e ${linhasIntercorrencia.length - abertas} tratadas`
  );
  // O erro humano de coleta é o único cenário da base em que existe batida do
  // MESMO TIPO em minutos diferentes; nomear as pessoas e os dias aqui é o que
  // permite conferir na tela (e por SQL) que ele foi mesmo semeado.
  const nomePorId = new Map(pessoas.map((p) => [p.id, p.nome]));
  const erroHumano = [...defeitos.entries()].filter(
    ([, tipo]) => tipo === 'entrada_dupla' || tipo === 'saida_dupla'
  );
  log(
    `15-ponto: ${erroHumano.length} caso(s) de erro humano de coleta (batida do ` +
      `mesmo tipo em minutos diferentes) — ` +
      erroHumano
        .map(([chave, tipo]) => {
          const [id, data] = chave.split('|');
          return `${nomePorId.get(Number(id)) ?? id} ${data} ${
            tipo === 'entrada_dupla' ? 'duas ENTRADAS' : 'duas SAÍDAS'
          }`;
        })
        .join(' · ')
  );
  log(
    variaveisPonto > 0
      ? `15-ponto: ${variaveisPonto} variáveis de origem "ponto" na folha aberta de ` +
          `${corrente.rotulo} — é a ligação ponto → folha (botão "Importar do ponto")`
      : '15-ponto: sem competência de folha aberta no mês corrente — nada importado para a folha.'
  );

  return {
    ponto: {
      competencia_anterior: anterior.rotulo,
      competencia_corrente: corrente.rotulo,
      escalas: escalas.length,
      marcacoes: marcacoes.length,
      apuracoes: apuracoes.length,
      intercorrencias_abertas: abertas,
      he_total_minutos: totalHe,
      adicional_noturno_minutos: totalNoturno,
      saldo_banco_minutos: saldos[0].total ?? 0,
      variaveis_folha_do_ponto: variaveisPonto,
    },
  };
}

module.exports = { semear, JORNADA_POR_CARGO };

if (require.main === module) {
  executarSozinho('15-ponto', semear);
}
