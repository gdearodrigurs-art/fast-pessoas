// db/semear/05-ferias-afastamentos.js — férias e afastamentos da Fast.
//
// O QUE SEMEIA
//   • rh.periodo_aquisitivo  — TODOS os ciclos de 12 meses de todo colaborador
//     não desligado, pela MESMA regra do serviço (src/dominios/ferias):
//     fim = início + 1 ano − 1 dia; limite concessivo = fim + 11 meses. Assim o
//     gerador lazy do app (garantirPeriodos) não tem nada a criar na primeira
//     tela aberta — o que ele veria já está no banco, com os mesmos valores.
//   • rh.programacao_ferias  — 18 programações (concluídas, uma em gozo,
//     aprovadas para o próximo mês, solicitadas aguardando o gestor e recusada),
//     cada uma com a DEMANDA vinculada do tipo 'programacao_ferias' e suas
//     transições — é assim que o motor do 0003 orquestra a aprovação.
//   • rh.afastamento         — 12 registros, 3 em curso hoje; dado de saúde
//     (CID + detalhe) SEMPRE cifrado com a mesma cifra do app (AES-256-GCM),
//     para a demo mostrar "o DP decifra, o gestor só vê período + rótulo".
//   • rh.evento_colaborador  — projeção dos fatos na linha do tempo.
//
// ALVOS DE DEMONSTRAÇÃO (calculados na execução, sempre relativos a hoje)
//   • 5 colaboradores com período VENCIDO (art. 137 — pagamento em dobro):
//     3 que acabaram de vencer + 2 com período acumulado vencido há meses;
//   • 10 colaboradores com o concessivo dentro do horizonte de alerta do painel
//     (≤ 90 dias) — ver a nota sobre a granularidade das admissões no final.
//
// IDEMPOTENTE: apaga só o que ESTE módulo cria (períodos, programações,
// afastamentos, demandas do tipo 'programacao_ferias' com suas transições e os
// eventos cuja origem é uma dessas tabelas) e insere de novo.
//
// Uso isolado: node --env-file=.env db/semear/05-ferias-afastamentos.js
 

const {
  aleatorio,
  cifrarSaude,
  comTriggersDesligados,
  contar,
  executarSozinho,
  inserirLote,
  log,
} = require('./comum');

// Mesma constante do serviço (src/dominios/ferias/servico.ts): o limite
// concessivo do app é fim + 11 MESES (o comentário da migração 0007 fala em 12;
// quem manda no dado é o código que o app executa).
const MESES_LIMITE_CONCESSIVO = 11;
const CHAVE_TIPO_DEMANDA = 'programacao_ferias';
const DIAS_DIREITO = 30;

// ------------------------------------------------------------------ datas (cópia fiel da régua do serviço)

function paraUtc(dataIso) {
  return new Date(`${dataIso}T00:00:00Z`);
}

function paraIso(data) {
  return data.toISOString().slice(0, 10);
}

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function adicionarAnos(dataIso, anos) {
  const data = paraUtc(dataIso);
  data.setUTCFullYear(data.getUTCFullYear() + anos);
  return paraIso(data);
}

function adicionarMeses(dataIso, meses) {
  const data = paraUtc(dataIso);
  const dia = data.getUTCDate();
  data.setUTCMonth(data.getUTCMonth() + meses);
  // Estouro de mês (ex.: 31/03 + 11 meses): trava no último dia do mês.
  if (data.getUTCDate() !== dia) data.setUTCDate(0);
  return paraIso(data);
}

function adicionarDias(dataIso, dias) {
  const data = paraUtc(dataIso);
  data.setUTCDate(data.getUTCDate() + dias);
  return paraIso(data);
}

function diferencaDias(dataIsoA, dataIsoB) {
  return Math.round((paraUtc(dataIsoA) - paraUtc(dataIsoB)) / 86400000);
}

function br(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Instante UTC de uma data (meia-noite) deslocado em horas — para TIMESTAMPTZ. */
function instante(dataIso, horas = 9) {
  const data = paraUtc(dataIso);
  data.setUTCHours(horas, 0, 0, 0);
  return data.toISOString();
}

/**
 * Ciclos de 12 meses a partir da admissão, um por aniversário, até hoje —
 * IDÊNTICO a periodosEsperados() do serviço de férias.
 */
function periodosEsperados(dataAdmissao, hoje) {
  const periodos = [];
  let inicio = dataAdmissao;
  for (let ciclo = 0; ciclo < 80 && inicio <= hoje; ciclo += 1) {
    const fim = adicionarDias(adicionarAnos(inicio, 1), -1);
    periodos.push({
      inicio,
      fim,
      limite: adicionarMeses(fim, MESES_LIMITE_CONCESSIVO),
      saldo: DIAS_DIREITO,
      gozados: 0,
      status: 'gozado', // provisório: o tail aberto é reaberto adiante
    });
    inicio = adicionarAnos(inicio, 1);
  }
  return periodos;
}

// ------------------------------------------------------------------ plano de demonstração

/**
 * Dois colaboradores que "acumularam": além do período em aberto normal, ficam
 * com o penúltimo completo VENCIDO há meses — o caso mais caro do módulo.
 * Exigem 3 ciclos ou mais (validado na execução).
 */
const MATRICULAS_VENCIDO_ACUMULADO = ['1005', '1032'];

/**
 * As 18 programações. `prof` é a profundidade do período aquisitivo a partir do
 * ciclo corrente: 1 = último ciclo completo, 2 = o anterior a ele.
 *   • prof 1  → o período fica ABERTO (a programação é o que acontece nele);
 *   • prof 2  → o período já está GOZADO (histórico), e dias+abono fecham os 30.
 * `inicioOffset` é em dias: relativo ao FIM do período (histórico, negativo no
 * calendário só por ser passado) ou a HOJE quando `apartirDeHoje`.
 */
const PLANO_PROGRAMACOES = [
  // ---- 9 concluídas (histórico gozado; fecham os 30 dias do período)
  { mat: '1043', prof: 2, status: 'concluida', dias: 30, abono: 0, offsetFim: 45 },
  { mat: '1013', prof: 2, status: 'concluida', dias: 20, abono: 10, offsetFim: 60 },
  { mat: '1021', prof: 2, status: 'concluida', dias: 30, abono: 0, offsetFim: 75 },
  { mat: '1034', prof: 2, status: 'concluida', dias: 20, abono: 10, offsetFim: 52 },
  { mat: '1001', prof: 2, status: 'concluida', dias: 30, abono: 0, offsetFim: 90 },
  { mat: '1022', prof: 2, status: 'concluida', dias: 30, abono: 0, offsetFim: 38 },
  { mat: '1007', prof: 2, status: 'concluida', dias: 25, abono: 5, offsetFim: 66 },
  { mat: '1044', prof: 2, status: 'concluida', dias: 30, abono: 0, offsetFim: 44 },
  { mat: '1041', prof: 2, status: 'concluida', dias: 20, abono: 10, offsetFim: 58 },

  // ---- 1 em gozo hoje (começou há 5 dias, 15 dias de gozo)
  { mat: '1018', prof: 1, status: 'em_gozo', dias: 15, abono: 0, apartirDeHoje: -5 },

  // ---- 4 aprovadas para o próximo mês
  { mat: '1045', prof: 1, status: 'aprovada', dias: 20, abono: 10, apartirDeHoje: 20 },
  { mat: '1040', prof: 1, status: 'aprovada', dias: 15, abono: 0, apartirDeHoje: 27 },
  { mat: '1031', prof: 1, status: 'aprovada', dias: 30, abono: 0, apartirDeHoje: 34 },
  { mat: '1049', prof: 1, status: 'aprovada', dias: 15, abono: 0, apartirDeHoje: 41 },

  // ---- 3 solicitadas aguardando o gestor (todas de liderados do Marcos,
  //      persona gestor@fastdemo.local — a fila de aprovação dele na demo)
  { mat: '1043', prof: 1, status: 'solicitada', dias: 15, abono: 0, apartirDeHoje: 45, abertaHa: 3 },
  { mat: '1020', prof: 1, status: 'solicitada', dias: 20, abono: 0, apartirDeHoje: 52, abertaHa: 5 },
  { mat: '1030', prof: 1, status: 'solicitada', dias: 30, abono: 0, apartirDeHoje: 60, abertaHa: 2 },

  // ---- 1 recusada pelo gestor
  {
    mat: '1058',
    prof: 1,
    status: 'recusada',
    dias: 30,
    abono: 0,
    apartirDeHoje: 12,
    abertaHa: 6,
    motivo: 'Conflito com o inventário anual da unidade; reprogramar para setembro.',
  },
];

/**
 * Os 12 afastamentos. `detalhe` (CID + descrição) vira dados_saude_cifrados;
 * `null` = afastamento sem dado de saúde (paternidade e ausência legal do
 * art. 473 não são condição de saúde e por isso NÃO ganham campo cifrado).
 * `fim: null` = em curso hoje.
 */
const PLANO_AFASTAMENTOS = [
  // ---------------- 3 em curso hoje (sem fim)
  {
    mat: '1057',
    tipo: 'maternidade',
    inicioHa: 58,
    duracao: null,
    detalhe:
      'CID Z37.0 — nascido vivo único. Licença-maternidade de 120 dias (art. 392 da CLT) ' +
      'prorrogada por 60 dias pelo Programa Empresa Cidadã. Parto em {inicio}. ' +
      'Dra. Marina Teixeira Rangel — CRM/SP 118.442. Retorno previsto para {previsto}.',
    previstoEm: 180,
  },
  {
    mat: '1042',
    tipo: 'licenca_medica',
    inicioHa: 22,
    duracao: null,
    detalhe:
      'CID M51.1 — radiculopatia por hérnia de disco lombar. Afastamento iniciado em {inicio}; ' +
      'ultrapassou o 15º dia, encaminhado à perícia do INSS. ' +
      'Dr. Paulo Ferraz Lisboa — CRM/SP 92.310. Restrição: vedado esforço acima de 10 kg.',
  },
  {
    mat: '1015',
    tipo: 'inss',
    inicioHa: 112,
    duracao: null,
    detalhe:
      'CID F32.1 — episódio depressivo moderado. Benefício B31 (auxílio por incapacidade ' +
      'temporária) concedido a partir do 16º dia. Perícia de prorrogação agendada para {previsto}. ' +
      'Dra. Helena Prado Sarmento — CRM/SP 74.905.',
    previstoEm: 30,
  },

  // ---------------- acidente de trabalho encerrado (estabilidade art. 118 correndo)
  {
    mat: '1012',
    tipo: 'acidente_trabalho',
    inicioHa: 243,
    duracao: 21,
    detalhe:
      'CID S62.6 — fratura de falange do dedo indicador direito. Acidente típico na expedição ' +
      '(queda de fardo de placas de drywall durante o carregamento) em {inicio}. CAT aberta em ' +
      '{inicio}. Benefício B91 do 16º ao {fim}. Alta em {fim}; ESTABILIDADE ACIDENTÁRIA de 12 ' +
      'meses (art. 118 da Lei 8.213/91) até {estabilidade}. Dr. Ruben Castilho — CRM/SP 61.220.',
    estabilidadeMeses: 12,
  },

  // ---------------- encerrados
  {
    mat: '1008',
    tipo: 'inss',
    inicioHa: 430,
    duracao: 90,
    detalhe:
      'CID S83.5 — ruptura do ligamento cruzado anterior do joelho esquerdo. Benefício B31 de ' +
      '{inicio} a {fim}, com fisioterapia concluída. Exame de retorno ao trabalho realizado.',
  },
  {
    mat: '1025',
    tipo: 'licenca_medica',
    inicioHa: 152,
    duracao: 18,
    detalhe:
      'CID S82.3 — fratura da extremidade distal da tíbia direita (acidente doméstico). ' +
      'Imobilização de {inicio} a {fim}. Dra. Cláudia Ferrari Bianchi — CRM/SP 105.377.',
  },
  {
    mat: '1027',
    tipo: 'atestado',
    inicioHa: 12,
    duracao: 2,
    detalhe: 'CID J11 — influenza (vírus não identificado). Atestado de 2 dias emitido em {inicio}. Dr. Otto Reinaldo Bech — CRM/SP 88.031.',
  },
  {
    mat: '1054',
    tipo: 'atestado',
    inicioHa: 35,
    duracao: 1,
    detalhe: 'CID K29.7 — gastrite não especificada. Atestado de 1 dia emitido em {inicio}. Dra. Simone Vidal Peçanha — CRM/SP 96.148.',
  },
  {
    mat: '1028',
    tipo: 'atestado',
    inicioHa: 71,
    duracao: 3,
    detalhe: 'CID A09 — gastroenterite de origem infecciosa presumível. Atestado de 3 dias ({inicio} a {fim}). Dr. Ivan Portilho Nery — CRM/SP 70.559.',
  },
  {
    mat: '1046',
    tipo: 'atestado',
    inicioHa: 140,
    duracao: 2,
    detalhe: 'CID M54.5 — lombalgia. Atestado de 2 dias ({inicio} a {fim}) com orientação ergonômica. Dra. Beatriz Nolasco Amorim — CRM/SP 111.706.',
  },
  {
    mat: '1035',
    tipo: 'paternidade',
    inicioHa: 47,
    duracao: 5,
    // Licença-paternidade não é dado de saúde: sem campo cifrado, de propósito.
    detalhe: null,
  },
  {
    mat: '1024',
    tipo: 'outros',
    inicioHa: 26,
    duracao: 2,
    // Ausência legal do art. 473 da CLT: também não é dado de saúde.
    detalhe: null,
  },
];

// ------------------------------------------------------------------ limpeza (só o que este módulo cria)

const TABELAS_APPEND_ONLY = [
  'rh.evento_colaborador',
  'rh.demanda_transicao',
  'rh.demanda_comentario',
  'rh.cat',
];

// ------------------------------------------------------------------ avisos do sino
//
// O app avisa o COLABORADOR quando a programação é aprovada
// (src/dominios/ferias/servico.ts → notificar 'ferias.programacao_aprovada').
// Sem isto o sino de quem já teve férias aprovadas abre vazio na demonstração.
// Texto idêntico ao do serviço: só datas, nada de saldo ou valor.

const TIPO_AVISO_FERIAS = 'ferias.programacao_aprovada';
// Estados em que a aprovação já aconteceu (aprovada → em_gozo → concluída).
const STATUS_JA_APROVADOS = ['aprovada', 'em_gozo', 'concluida'];

function formatarDataBr(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function semearNotificacoes(cliente) {
  // Idempotência do módulo rodando sozinho (o 00-limpar zera a tabela inteira).
  await cliente.query('DELETE FROM sistema.notificacao WHERE tipo = $1', [TIPO_AVISO_FERIAS]);

  const { rows } = await cliente.query(
    `SELECT p.id, p.status, p.inicio::text AS inicio,
            (p.inicio + (p.dias - 1))::text AS fim,
            -- o aviso nasce na APROVAÇÃO, não no início do gozo: ~35 dias
            -- antes, coerente com o aviso legal de 30 dias (art. 135)
            ((p.inicio - 35) + TIME '10:30') AT TIME ZONE 'America/Sao_Paulo' AS aprovada_em,
            u.id AS usuario_id
       FROM rh.programacao_ferias p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE p.status = ANY($1)
      ORDER BY p.id`,
    [STATUS_JA_APROVADOS]
  );

  const linhas = rows.map((linha) => [
    Number(linha.usuario_id),
    TIPO_AVISO_FERIAS,
    'Programação de férias aprovada',
    `Sua programação de férias de ${formatarDataBr(linha.inicio)} a ${formatarDataBr(linha.fim)} foi aprovada.`,
    '/ferias',
    // As que ainda não começaram ficam NÃO lidas: é a novidade do sino.
    linha.status !== 'aprovada',
    linha.aprovada_em,
  ]);

  await inserirLote(
    cliente,
    'sistema.notificacao',
    ['usuario_id', 'tipo', 'titulo', 'corpo', 'link', 'lida', 'criada_em'],
    linhas
  );
  return {
    total: linhas.length,
    nao_lidas: linhas.filter((linha) => linha[5] === false).length,
    destinatarios: new Set(linhas.map((linha) => linha[0])).size,
  };
}

async function limpar(cliente) {
  const removidos = {};
  const marcar = (tabela, resultado) => {
    if (resultado.rowCount > 0) removidos[tabela] = resultado.rowCount;
  };

  // O módulo de demandas também abre demandas do tipo 'programacao_ferias' (sem
  // efeito no domínio de férias). Por isso o escopo aqui NÃO é o tipo: é a
  // demanda que uma programação DESTE módulo aponta — nada mais.
  const { rows: minhasDemandas } = await cliente.query(
    'SELECT DISTINCT demanda_id::int AS id FROM rh.programacao_ferias WHERE demanda_id IS NOT NULL'
  );
  const idsDemanda = minhasDemandas.map((linha) => linha.id);

  await comTriggersDesligados(cliente, TABELAS_APPEND_ONLY, async () => {
    // A CAT (0014, append-only) pendura no afastamento de acidente que ESTE
    // módulo cria. Não apagamos o registro legal de outro módulo: soltamos o
    // vínculo para o DELETE não esbarrar na FK — religarCats() recoloca depois.
    marcar(
      'rh.cat (vínculo solto p/ religar)',
      await cliente.query(
        `UPDATE rh.cat SET afastamento_id = NULL
          WHERE afastamento_id IS NOT NULL
            AND afastamento_id IN (SELECT id FROM rh.afastamento)`
      )
    );

    marcar(
      'rh.evento_colaborador',
      await cliente.query(
        `DELETE FROM rh.evento_colaborador
          WHERE origem_tabela IN ('rh.programacao_ferias', 'rh.afastamento')`
      )
    );
    marcar('rh.programacao_ferias', await cliente.query('DELETE FROM rh.programacao_ferias'));
    marcar('rh.periodo_aquisitivo', await cliente.query('DELETE FROM rh.periodo_aquisitivo'));
    marcar('rh.afastamento', await cliente.query('DELETE FROM rh.afastamento'));

    if (idsDemanda.length > 0) {
      marcar(
        'rh.demanda_comentario',
        await cliente.query('DELETE FROM rh.demanda_comentario WHERE demanda_id = ANY($1::bigint[])', [
          idsDemanda,
        ])
      );
      marcar(
        'rh.demanda_transicao',
        await cliente.query('DELETE FROM rh.demanda_transicao WHERE demanda_id = ANY($1::bigint[])', [
          idsDemanda,
        ])
      );
      marcar(
        'rh.demanda',
        await cliente.query('DELETE FROM rh.demanda WHERE id = ANY($1::bigint[])', [idsDemanda])
      );
    }
  });

  const total = Object.values(removidos).reduce((a, b) => a + b, 0);
  if (total === 0) log('05-ferias-afastamentos: nada para limpar.');
  else {
    log(`05-ferias-afastamentos: limpeza — ${total} linha(s):`);
    for (const [tabela, quantidade] of Object.entries(removidos)) {
      log(`  - ${tabela}: ${quantidade}`);
    }
  }
}

/**
 * Recoloca o vínculo CAT → afastamento depois da reinserção. Casamento estrito:
 * mesma pessoa, afastamento de acidente de trabalho e data do acidente igual ao
 * início do afastamento — nunca "chuta" um vínculo.
 */
async function religarCats(cliente) {
  const resultado = await comTriggersDesligados(cliente, ['rh.cat'], async () =>
    cliente.query(
      `UPDATE rh.cat ct
          SET afastamento_id = a.id
         FROM rh.afastamento a
        WHERE ct.houve_afastamento
          AND ct.afastamento_id IS NULL
          AND a.colaborador_id = ct.colaborador_id
          AND a.tipo = 'acidente_trabalho'
          AND a.inicio = (ct.data_acidente AT TIME ZONE 'America/Sao_Paulo')::date`
    )
  );
  if (resultado.rowCount > 0) {
    log(`05-ferias-afastamentos: ${resultado.rowCount} CAT(s) do SST religada(s) ao afastamento.`);
  }
}

// ------------------------------------------------------------------ leitura do elenco

async function carregarColaboradores(cliente) {
  const { rows } = await cliente.query(
    `SELECT c.id::int            AS id,
            c.matricula,
            c.nome_completo,
            c.data_admissao::text AS admissao,
            c.tipo_vinculo,
            u.id::int            AS usuario_id,
            u.papel,
            g.gestor_colaborador_id::int AS gestor_id,
            gu.id::int           AS gestor_usuario_id,
            gc.nome_completo     AS gestor_nome
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       LEFT JOIN rh.relacao_gestor g
              ON g.liderado_colaborador_id = c.id AND g.fim_vigencia IS NULL
       LEFT JOIN rh.colaborador gc ON gc.id = g.gestor_colaborador_id
       LEFT JOIN sistema.usuario gu ON gu.id = gc.usuario_id
      WHERE c.status <> 'desligado'
      ORDER BY c.matricula`
  );
  if (rows.length === 0) {
    throw new Error('Nenhum colaborador ativo — rode db/semear/01-base.js antes.');
  }
  return rows;
}

/** Usuários do DP (registram afastamentos e validam programações). */
async function carregarDp(cliente) {
  const { rows } = await cliente.query(
    `SELECT u.id::int AS usuario_id, u.nome
       FROM sistema.usuario u
      WHERE u.papel = 'dp' AND u.email LIKE '%@fastdemo.local'
      ORDER BY u.id`
  );
  if (rows.length === 0) throw new Error("Nenhum usuário de papel 'dp' na demo — rode 01-base.js.");
  return rows;
}

async function tipoDemandaFerias(cliente) {
  const { rows } = await cliente.query(
    `SELECT id::int AS id, nome, sla_dias
       FROM rh.tipo_demanda_versao
      WHERE chave = $1 AND status = 'ativa'`,
    [CHAVE_TIPO_DEMANDA]
  );
  if (rows.length === 0) {
    throw new Error(
      "Tipo de demanda 'programacao_ferias' não está ativo — confira a migração 0007."
    );
  }
  return rows[0];
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  await limpar(cliente);

  const hoje = hojeSaoPaulo();
  const pessoas = await carregarColaboradores(cliente);
  const dp = await carregarDp(cliente);
  const tipo = await tipoDemandaFerias(cliente);
  const porMatricula = new Map(pessoas.map((p) => [p.matricula, p]));

  const exigir = (matricula, papel) => {
    const pessoa = porMatricula.get(matricula);
    if (!pessoa) {
      throw new Error(
        `Matrícula ${matricula} (${papel}) não existe entre os ativos — 01-base mudou o elenco.`
      );
    }
    return pessoa;
  };

  // ---------------------------------------------------------- 1) ciclos de todo mundo
  for (const pessoa of pessoas) {
    pessoa.periodos = periodosEsperados(pessoa.admissao, hoje);
    if (pessoa.periodos.length === 0) {
      throw new Error(`${pessoa.matricula} sem ciclo aquisitivo (admissão ${pessoa.admissao}).`);
    }
    const total = pessoa.periodos.length;
    // Dias até o limite concessivo do ÚLTIMO ciclo completo: é ele que decide
    // se a pessoa aparece vermelha, amarela ou fora do alerta no painel do DP.
    pessoa.diasAteLimite =
      total >= 2 ? diferencaDias(pessoa.periodos[total - 2].limite, hoje) : null;
  }

  // ---------------------------------------------------------- 2) quantos ciclos ficam ABERTOS
  // Regra: tudo que veio antes da "cauda aberta" conta como já gozado (histórico
  // anterior ao sistema). A cauda é que produz o painel de vencimento.
  const rng = aleatorio(20260729);
  for (const pessoa of pessoas) {
    const total = pessoa.periodos.length;
    if (total === 1) {
      pessoa.abertos = 1; // admitido há menos de 12 meses: só o ciclo corrente
    } else if (pessoa.diasAteLimite < 0) {
      pessoa.abertos = 2; // venceu de fato — entra em vermelho
    } else if (pessoa.diasAteLimite <= 90) {
      pessoa.abertos = 2; // horizonte de alerta do painel
    } else {
      // ~35% da massa "sem urgência" ainda não gozou o último ciclo completo:
      // dá volume realista ao painel sem inventar alerta.
      pessoa.abertos = rng() < 0.35 ? 2 : 1;
    }
  }
  for (const matricula of MATRICULAS_VENCIDO_ACUMULADO) {
    const pessoa = exigir(matricula, 'vencido acumulado');
    if (pessoa.periodos.length < 3) {
      throw new Error(`${matricula} tem menos de 3 ciclos — não serve de férias acumuladas.`);
    }
    pessoa.abertos = 3; // penúltimo completo fica vencido há meses
  }
  // Toda pessoa com programação precisa da cauda aberta em que ela acontece.
  // `prof` efetiva: sem ciclo na profundidade pedida, cai para o último completo.
  const profEfetiva = new Map();
  for (const item of PLANO_PROGRAMACOES) {
    const pessoa = exigir(item.mat, `programação ${item.status}`);
    if (pessoa.periodos.length < 2) {
      throw new Error(`${item.mat} não tem ciclo completo para uma programação ${item.status}.`);
    }
    profEfetiva.set(item, pessoa.periodos.length >= item.prof + 1 ? item.prof : 1);
    pessoa.abertos = Math.max(pessoa.abertos, 2);
  }

  // ---------------------------------------------------------- 3) programações sobre os ciclos
  const programacoes = [];
  for (const item of PLANO_PROGRAMACOES) {
    const pessoa = porMatricula.get(item.mat);
    const total = pessoa.periodos.length;
    const indice = Math.max(0, total - 1 - profEfetiva.get(item));
    const periodo = pessoa.periodos[indice];

    const inicio =
      item.apartirDeHoje === undefined
        ? adicionarDias(periodo.fim, item.offsetFim)
        : adicionarDias(hoje, item.apartirDeHoje);
    const fim = adicionarDias(inicio, item.dias - 1);

    // Só o que foi aprovado consome saldo (é o que aplicarAprovacao() faz).
    const consome = ['aprovada', 'em_gozo', 'concluida'].includes(item.status);
    if (consome) periodo.gozados += item.dias + item.abono;
    if (periodo.gozados > periodo.saldo) {
      throw new Error(
        `${item.mat}: programação estoura o saldo do período ${periodo.inicio} (${periodo.gozados} > ${periodo.saldo}).`
      );
    }

    // Datas da demanda: aberta antes do gozo (histórico) ou há poucos dias (fila viva).
    const abertaEm =
      item.abertaHa !== undefined
        ? adicionarDias(hoje, -item.abertaHa)
        : adicionarDias(inicio, -40);

    programacoes.push({
      pessoa,
      periodoIndice: indice,
      periodo,
      status: item.status,
      dias: item.dias,
      abono: item.abono,
      inicio,
      fim,
      abertaEm,
      motivo: item.motivo ?? null,
    });
  }

  // ---------------------------------------------------------- 4) status final de cada ciclo
  for (const pessoa of pessoas) {
    const total = pessoa.periodos.length;
    pessoa.periodos.forEach((periodo, indice) => {
      const aberto = indice >= total - pessoa.abertos;
      if (!aberto) {
        periodo.status = 'gozado';
        periodo.gozados = DIAS_DIREITO;
        return;
      }
      if (periodo.gozados >= periodo.saldo) periodo.status = 'gozado';
      else if (periodo.limite < hoje) periodo.status = 'vencido';
      else if (periodo.gozados > 0) periodo.status = 'programado_parcial';
      else periodo.status = 'em_aberto';
    });
  }

  // ---------------------------------------------------------- 5) grava os períodos aquisitivos
  const linhasPeriodo = [];
  for (const pessoa of pessoas) {
    for (const periodo of pessoa.periodos) {
      linhasPeriodo.push([
        pessoa.id,
        periodo.inicio,
        periodo.fim,
        periodo.saldo,
        periodo.gozados,
        periodo.status,
        periodo.limite,
      ]);
    }
  }
  const periodosGravados = await inserirLote(
    cliente,
    'rh.periodo_aquisitivo',
    ['colaborador_id', 'inicio', 'fim', 'saldo_dias', 'dias_gozados', 'status', 'limite_concessivo'],
    linhasPeriodo,
    'id, colaborador_id, inicio::text AS inicio'
  );
  const idDoPeriodo = new Map(
    periodosGravados.map((linha) => [`${linha.colaborador_id}|${linha.inicio}`, Number(linha.id)])
  );
  log(`05-ferias-afastamentos: ${linhasPeriodo.length} períodos aquisitivos gravados.`);

  // ---------------------------------------------------------- 6) demandas + transições + programações
  const eventos = [];
  let indiceDp = 0;
  const proximoDp = () => dp[indiceDp++ % dp.length].usuario_id;

  for (const prog of programacoes) {
    const { pessoa, periodo } = prog;
    const rotuloAbono =
      prog.abono > 0 ? ` + ${prog.abono} dia(s) de abono pecuniário` : '';
    const descricao =
      `Programação de férias de ${br(prog.inicio)} a ${br(prog.fim)} — ` +
      `${prog.dias} dia(s) de gozo${rotuloAbono}. ` +
      `Período aquisitivo ${br(periodo.inicio)} a ${br(periodo.fim)}.`;

    const statusDemanda =
      prog.status === 'solicitada'
        ? 'aguardando_aprovacao'
        : prog.status === 'recusada'
          ? 'recusada'
          : 'concluida';
    const validador = proximoDp();
    // Sem gestor vigente (diretoria): quem decide é o DP, por exceção.
    const decisor = pessoa.gestor_usuario_id ?? validador;
    const viaDecisao = pessoa.gestor_usuario_id
      ? 'aprovação do gestor na demanda vinculada'
      : 'exceção aprovada pelo DP/RH';

    const { rows: demandaRows } = await cliente.query(
      `INSERT INTO rh.demanda
         (tipo_demanda_versao_id, solicitante_usuario_id, solicitante_colaborador_id,
          descricao, status, prazo, atendente_usuario_id, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        tipo.id,
        pessoa.usuario_id,
        pessoa.id,
        descricao,
        statusDemanda,
        adicionarDias(prog.abertaEm, tipo.sla_dias),
        statusDemanda === 'concluida' ? validador : null,
        instante(prog.abertaEm, 13),
      ]
    );
    const demandaId = Number(demandaRows[0].id);

    const transicoes = [
      [demandaId, null, 'aguardando_aprovacao', pessoa.usuario_id, null, instante(prog.abertaEm, 13)],
    ];
    if (prog.status === 'recusada') {
      transicoes.push([
        demandaId,
        'aguardando_aprovacao',
        'recusada',
        decisor,
        prog.motivo,
        instante(adicionarDias(prog.abertaEm, 1), 10),
      ]);
    } else if (prog.status !== 'solicitada') {
      transicoes.push(
        [
          demandaId,
          'aguardando_aprovacao',
          'aberta',
          decisor,
          'Aprovada pelo gestor imediato.',
          instante(adicionarDias(prog.abertaEm, 1), 10),
        ],
        [
          demandaId,
          'aberta',
          'em_atendimento',
          validador,
          'DP validou saldo, fracionamento (art. 134) e abono (art. 143).',
          instante(adicionarDias(prog.abertaEm, 2), 11),
        ],
        [
          demandaId,
          'em_atendimento',
          'concluida',
          validador,
          'Aviso de férias emitido com 30 dias de antecedência (art. 135).',
          instante(adicionarDias(prog.abertaEm, 3), 15),
        ]
      );
    }
    await inserirLote(
      cliente,
      'rh.demanda_transicao',
      ['demanda_id', 'de_status', 'para_status', 'por_usuario_id', 'motivo', 'em'],
      transicoes
    );

    const periodoId = idDoPeriodo.get(`${pessoa.id}|${periodo.inicio}`);
    if (!periodoId) {
      throw new Error(`Período ${periodo.inicio} de ${pessoa.matricula} não foi gravado.`);
    }
    const { rows: progRows } = await cliente.query(
      `INSERT INTO rh.programacao_ferias
         (colaborador_id, periodo_aquisitivo_id, inicio, dias, abono_dias, status,
          demanda_id, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        pessoa.id,
        periodoId,
        prog.inicio,
        prog.dias,
        prog.abono,
        prog.status,
        demandaId,
        instante(prog.abertaEm, 13),
      ]
    );
    prog.id = Number(progRows[0].id);
    prog.demandaId = demandaId;
    prog.decisor = decisor;
    prog.via = viaDecisao;

    // ------- linha do tempo (mesmo texto que o serviço grava na aprovação)
    if (prog.status !== 'solicitada' && prog.status !== 'recusada') {
      const abonoResumo = prog.abono > 0 ? ` + ${prog.abono} dia(s) de abono` : '';
      eventos.push([
        pessoa.id,
        'ferias_programadas',
        instante(adicionarDias(prog.abertaEm, 1), 10),
        'rh.programacao_ferias',
        prog.id,
        `Férias programadas: ${br(prog.inicio)} a ${br(prog.fim)} (${prog.dias} dia(s) de gozo${abonoResumo})`,
        JSON.stringify({
          dias: prog.dias,
          abono_dias: prog.abono,
          inicio: prog.inicio,
          fim: prog.fim,
        }),
        decisor,
      ]);
      if (prog.status === 'em_gozo') {
        eventos.push([
          pessoa.id,
          'ferias_iniciadas',
          instante(prog.inicio, 8),
          'rh.programacao_ferias',
          prog.id,
          `Férias iniciadas: ${br(prog.inicio)} a ${br(prog.fim)} (${prog.dias} dia(s) de gozo)`,
          JSON.stringify({ inicio: prog.inicio, fim: prog.fim, dias: prog.dias }),
          validador,
        ]);
      }
      if (prog.status === 'concluida') {
        eventos.push([
          pessoa.id,
          'ferias_concluidas',
          instante(adicionarDias(prog.fim, 1), 8),
          'rh.programacao_ferias',
          prog.id,
          `Férias concluídas: ${br(prog.inicio)} a ${br(prog.fim)} (${prog.dias} dia(s) de gozo${abonoResumo})`,
          JSON.stringify({
            inicio: prog.inicio,
            fim: prog.fim,
            dias: prog.dias,
            abono_dias: prog.abono,
          }),
          validador,
        ]);
      }
    }
  }
  log(`05-ferias-afastamentos: ${programacoes.length} programações + demandas vinculadas.`);

  // ---------------------------------------------------------- 7) afastamentos (saúde cifrada)
  const afastamentosGravados = [];
  for (const item of PLANO_AFASTAMENTOS) {
    const pessoa = exigir(item.mat, `afastamento ${item.tipo}`);
    const inicio = adicionarDias(hoje, -item.inicioHa);
    const fim = item.duracao === null ? null : adicionarDias(inicio, item.duracao - 1);
    const registrador = proximoDp();

    let cifrado = null;
    if (item.detalhe) {
      const previsto = item.previstoEm ? adicionarDias(hoje, item.previstoEm) : null;
      const estabilidade =
        item.estabilidadeMeses && fim
          ? adicionarMeses(fim, item.estabilidadeMeses)
          : null;
      const texto = item.detalhe
        .replaceAll('{inicio}', br(inicio))
        .replaceAll('{fim}', fim ? br(fim) : 'em curso')
        .replaceAll('{previsto}', previsto ? br(previsto) : 'a definir')
        .replaceAll('{estabilidade}', estabilidade ? br(estabilidade) : 'a apurar');
      cifrado = cifrarSaude(texto);
    }

    const { rows } = await cliente.query(
      `INSERT INTO rh.afastamento
         (colaborador_id, tipo, inicio, fim, dados_saude_cifrados, documento_id,
          registrado_por, criado_em)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
       RETURNING id`,
      [pessoa.id, item.tipo, inicio, fim, cifrado, registrador, instante(inicio, 10)]
    );
    const id = Number(rows[0].id);
    afastamentosGravados.push({ id, pessoa, tipo: item.tipo, inicio, fim, cifrado });

    const periodoLegivel = fim ? `${br(inicio)} a ${br(fim)}` : `${br(inicio)} (em curso)`;
    // Resumo GENÉRICO: sem tipo específico e sem uma linha de dado de saúde.
    eventos.push([
      pessoa.id,
      'afastamento_registrado',
      instante(inicio, 10),
      'rh.afastamento',
      id,
      `Afastamento registrado: ${periodoLegivel}`,
      JSON.stringify({ inicio, fim }),
      registrador,
    ]);
    if (fim) {
      const dias = diferencaDias(fim, inicio) + 1;
      eventos.push([
        pessoa.id,
        'afastamento_encerrado',
        instante(fim, 17),
        'rh.afastamento',
        id,
        `Afastamento encerrado em ${br(fim)} (${dias} dia(s))`,
        JSON.stringify({ inicio, fim, dias }),
        registrador,
      ]);
    }
  }
  log(`05-ferias-afastamentos: ${afastamentosGravados.length} afastamentos gravados.`);

  await religarCats(cliente);

  // ---------------------------------------------------------- 8) linha do tempo
  // INSERT não precisa de trigger desligado: o append-only só barra UPDATE/DELETE.
  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    [
      'colaborador_id',
      'tipo',
      'ocorrido_em',
      'origem_tabela',
      'origem_id',
      'resumo',
      'payload',
      'registrado_por',
    ],
    eventos
  );
  log(`05-ferias-afastamentos: ${eventos.length} eventos na linha do tempo.`);

  // ---------------------------------------------------------- 9) conferências duras
  const conferir = async (rotulo, sql, parametros, esperado) => {
    const { rows } = await cliente.query(sql, parametros);
    const obtido = Number(rows[0].total);
    if (esperado !== null && obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
    return obtido;
  };

  await conferir(
    'ativos sem nenhum período aquisitivo',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      WHERE c.status <> 'desligado'
        AND NOT EXISTS (SELECT 1 FROM rh.periodo_aquisitivo p WHERE p.colaborador_id = c.id)`,
    [],
    0
  );
  await conferir(
    'períodos com limite concessivo fora da regra (fim + 11 meses)',
    `SELECT count(*)::int AS total FROM rh.periodo_aquisitivo
      WHERE limite_concessivo <> (fim + INTERVAL '11 months')::date`,
    [],
    0
  );
  await conferir(
    'períodos abertos com limite vencido e status diferente de vencido',
    `SELECT count(*)::int AS total FROM rh.periodo_aquisitivo
      WHERE status IN ('em_aberto','programado_parcial')
        AND limite_concessivo < (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
    [],
    0
  );
  await conferir(
    'programações aprovadas sem reflexo no saldo do período',
    `SELECT count(*)::int AS total
       FROM rh.periodo_aquisitivo p
       JOIN LATERAL (
         SELECT COALESCE(SUM(pr.dias + pr.abono_dias), 0) AS usados
           FROM rh.programacao_ferias pr
          WHERE pr.periodo_aquisitivo_id = p.id
            AND pr.status IN ('aprovada','em_gozo','concluida')
       ) u ON TRUE
      WHERE u.usados > p.dias_gozados`,
    [],
    0
  );
  await conferir(
    'programações solicitadas cuja demanda não está aguardando aprovação',
    `SELECT count(*)::int AS total
       FROM rh.programacao_ferias pr JOIN rh.demanda d ON d.id = pr.demanda_id
      WHERE pr.status = 'solicitada' AND d.status <> 'aguardando_aprovacao'`,
    [],
    0
  );
  await conferir(
    'afastamentos de saúde sem cifra',
    `SELECT count(*)::int AS total FROM rh.afastamento
      WHERE tipo IN ('atestado','licenca_medica','maternidade','acidente_trabalho','inss')
        AND dados_saude_cifrados IS NULL`,
    [],
    0
  );
  await conferir(
    'cifra em formato inesperado (iv:tag:cifrado em base64)',
    `SELECT count(*)::int AS total FROM rh.afastamento
      WHERE dados_saude_cifrados IS NOT NULL
        AND dados_saude_cifrados !~ '^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'`,
    [],
    0
  );

  // ---------------------------------------------------------- 10) resumo
  const hojeSql = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
  const { rows: painel } = await cliente.query(
    `SELECT count(*) FILTER (WHERE (p.limite_concessivo - ${hojeSql}) < 0)                  AS vencidas,
            count(*) FILTER (WHERE (p.limite_concessivo - ${hojeSql}) BETWEEN 0 AND 30)     AS ate_30,
            count(*) FILTER (WHERE (p.limite_concessivo - ${hojeSql}) BETWEEN 31 AND 60)    AS ate_60,
            count(*) FILTER (WHERE (p.limite_concessivo - ${hojeSql}) BETWEEN 61 AND 90)    AS ate_90,
            count(*)                                                                        AS linhas
       FROM rh.periodo_aquisitivo p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE p.status IN ('em_aberto','programado_parcial','vencido')
        AND c.status <> 'desligado'`
  );
  const { rows: porStatusProg } = await cliente.query(
    'SELECT status, count(*)::int AS total FROM rh.programacao_ferias GROUP BY 1 ORDER BY 1'
  );
  const { rows: porTipoAfa } = await cliente.query(
    `SELECT tipo, count(*)::int AS total,
            count(*) FILTER (WHERE fim IS NULL)::int AS em_curso
       FROM rh.afastamento GROUP BY 1 ORDER BY 1`
  );
  const { rows: pessoasVencidas } = await cliente.query(
    `SELECT c.matricula, c.nome_completo, count(*)::int AS periodos
       FROM rh.periodo_aquisitivo p JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE p.status = 'vencido' AND c.status <> 'desligado'
      GROUP BY 1, 2 ORDER BY 1`
  );

  log('\n05-ferias-afastamentos: painel de vencimento do DP');
  log(
    `  linhas ${painel[0].linhas} · VENCIDAS ${painel[0].vencidas} · ≤30d ${painel[0].ate_30} · ` +
      `31–60d ${painel[0].ate_60} · 61–90d ${painel[0].ate_90}`
  );
  log(`  colaboradores com período vencido (dobro do art. 137): ${pessoasVencidas.length}`);
  for (const linha of pessoasVencidas) {
    log(`    ${linha.matricula} ${linha.nome_completo} — ${linha.periodos} período(s)`);
  }
  log('\n05-ferias-afastamentos: programações de férias');
  for (const linha of porStatusProg) log(`  ${linha.status.padEnd(12)} ${linha.total}`);

  const avisos = await semearNotificacoes(cliente);
  log(
    `  avisos do sino: ${avisos.total} (${avisos.nao_lidas} não lidos) para ` +
      `${avisos.destinatarios} colaborador(es)`
  );

  log('\n05-ferias-afastamentos: afastamentos');
  for (const linha of porTipoAfa) {
    log(`  ${linha.tipo.padEnd(18)} ${linha.total} (em curso: ${linha.em_curso})`);
  }

  const estabilidade = PLANO_AFASTAMENTOS.find((a) => a.tipo === 'acidente_trabalho');
  const pessoaEstabilidade = porMatricula.get(estabilidade.mat);
  log(
    `\n05-ferias-afastamentos: exemplo de estabilidade acidentária (art. 118) — ` +
      `${pessoaEstabilidade.matricula} ${pessoaEstabilidade.nome_completo}`
  );

  // Chave própria no contexto do orquestrador — nada de nome genérico que possa
  // atropelar o que outro módulo publicou.
  return {
    feriasAfastamentos: {
      periodos: await contar(cliente, 'rh.periodo_aquisitivo'),
      programacoes: await contar(cliente, 'rh.programacao_ferias'),
      afastamentos: await contar(cliente, 'rh.afastamento'),
      // Quem tem estabilidade acidentária correndo (art. 118) — o módulo de
      // desligamento pode usar esta pessoa como exemplo de trava na rescisão.
      matriculaEstabilidadeAcidente: estabilidade.mat,
      colaboradorEstabilidadeAcidente: pessoaEstabilidade.id,
    },
  };
}

module.exports = { semear, PLANO_PROGRAMACOES, PLANO_AFASTAMENTOS };

if (require.main === module) {
  executarSozinho('05-ferias-afastamentos', semear);
}
