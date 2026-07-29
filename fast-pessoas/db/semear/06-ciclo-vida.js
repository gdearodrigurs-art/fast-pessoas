// db/semear/06-ciclo-vida.js — ciclo de vida do vínculo: ADMISSÕES (checklist de
// preparação da entrada) e DESLIGAMENTOS (máquina de estados, estabilidades,
// devoluções, prazo do art. 477 e entrevista de desligamento).
//
// O que este módulo semeia (nada além disto — é o que ele apaga no começo):
//   rh.processo_admissao + rh.item_admissao
//   rh.processo_desligamento + rh.verificacao_estabilidade + rh.item_devolucao
//                            + rh.entrevista_desligamento
//   rh.evento_colaborador com origem_tabela nessas duas tabelas de processo
//
// Fontes lidas antes de escrever qualquer INSERT (nada inventado):
//   db/migrations/0008_desligamento.sql  (CHECKs, triggers, seeds de tipo/roteiro)
//   db/migrations/0010_admissao.sql      (CHECKs, seed do checklist v1)
//   src/dominios/admissao/{esquemas,repositorio,servico}.ts
//   src/dominios/desligamento/{esquemas,repositorio,servico}.ts
//   docs/03-modulos/09-recrutamento-admissao.md e 11-desligamento.md
//
// Uso isolado: node --env-file=.env db/semear/06-ciclo-vida.js
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  comTriggersDesligados,
  inserirLote,
  log,
  hoje,
  iso,
  executarSozinho,
} = require('./comum');

// ------------------------------------------------------------------ datas (aritmética de calendário pura, em UTC)

/** 'YYYY-MM-DD' + n dias, sem fuso — mesma conta que src/dominios/admissao/esquemas.ts. */
function somarDias(dataIso, dias) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Diferença em dias corridos entre duas datas 'YYYY-MM-DD' (b - a). */
function diasEntre(aIso, bIso) {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Anos completos entre duas datas 'YYYY-MM-DD' (tempo de casa para o aviso prévio). */
function anosCompletos(inicioIso, fimIso) {
  const [ai, mi, di] = inicioIso.split('-').map(Number);
  const [af, mf, df] = fimIso.split('-').map(Number);
  let anos = af - ai;
  if (mf < mi || (mf === mi && df < di)) anos -= 1;
  return Math.max(0, anos);
}

/** TIMESTAMPTZ a partir de uma data-calendário + hora UTC (12:00Z ≈ 09:00 em SP). */
function instante(dataIso, horaUtc = 12) {
  return `${dataIso}T${String(horaUtc).padStart(2, '0')}:00:00.000Z`;
}

/** Fato datado (sem hora) — é assim que o app grava evento de data pura. */
function fatoDatado(dataIso) {
  return `${dataIso}T00:00:00.000Z`;
}

function paraBr(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

// ------------------------------------------------------------------ limpeza (idempotência)

// Triggers de aplicação que impedem DELETE: processo_desligamento_congelar
// (estado terminal é imutável e o processo "nunca é apagado"),
// verificacao_estabilidade_imutavel e evento_colaborador_imutavel (append-only).
// Desligamos só durante a limpeza e reabilitamos na MESMA transação.
const TABELAS_DO_MODULO = [
  'rh.entrevista_desligamento',
  'rh.item_devolucao',
  'rh.verificacao_estabilidade',
  'rh.processo_desligamento',
  'rh.item_admissao',
  'rh.processo_admissao',
  'rh.evento_colaborador',
];

// Só os eventos que ESTE módulo projeta — a admissão e o desligamento efetivados
// são projetados pelo 01-base (origem_tabela = 'rh.colaborador') e ficam de pé.
const ORIGENS_DO_MODULO = ['rh.processo_admissao', 'rh.processo_desligamento'];

async function limpar(cliente) {
  const removidos = {};
  await comTriggersDesligados(cliente, TABELAS_DO_MODULO, async () => {
    for (const tabela of [
      'rh.entrevista_desligamento',
      'rh.item_devolucao',
      'rh.verificacao_estabilidade',
      'rh.processo_desligamento',
      'rh.item_admissao',
      'rh.processo_admissao',
    ]) {
      const { rowCount } = await cliente.query(`DELETE FROM ${tabela}`);
      if (rowCount > 0) removidos[tabela] = rowCount;
    }
    const eventos = await cliente.query(
      'DELETE FROM rh.evento_colaborador WHERE origem_tabela = ANY($1)',
      [ORIGENS_DO_MODULO]
    );
    if (eventos.rowCount > 0) removidos['rh.evento_colaborador'] = eventos.rowCount;
  });
  const total = Object.values(removidos).reduce((a, b) => a + b, 0);
  if (total > 0) {
    log(`06-ciclo-vida: ${total} linha(s) da execução anterior removida(s).`);
  }
  return removidos;
}

// ------------------------------------------------------------------ consultas de apoio

/** Usuário de demo por e-mail, com fallback para qualquer um do papel. */
async function usuarioDemo(cliente, email, papel) {
  const direto = await cliente.query(
    'SELECT id, nome FROM sistema.usuario WHERE email = $1',
    [email]
  );
  const linha =
    direto.rows[0] ??
    (
      await cliente.query(
        `SELECT id, nome FROM sistema.usuario
          WHERE papel = $1 AND email LIKE '%@fastdemo.local'
          ORDER BY id LIMIT 1`,
        [papel]
      )
    ).rows[0];
  if (!linha) {
    throw new Error(
      `Nenhum usuário de demonstração com papel "${papel}" — rode 01-base antes deste módulo.`
    );
  }
  return { id: Number(linha.id), nome: linha.nome };
}

const SELECT_PESSOA = `
  SELECT c.id, c.matricula, c.nome_completo, c.tipo_vinculo, c.status,
         c.data_admissao::text     AS data_admissao,
         c.data_desligamento::text AS data_desligamento,
         cargo.nome     AS cargo,
         unidade.unidade AS unidade
    FROM rh.colaborador c
    LEFT JOIN LATERAL (
      SELECT cv.nome
        FROM rh.posicao_colaborador p
        JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
       WHERE p.colaborador_id = c.id
       ORDER BY p.inicio_vigencia DESC, p.id DESC
       LIMIT 1) cargo ON TRUE
    LEFT JOIN LATERAL (
      SELECT ev.unidade
        FROM rh.lotacao l
        JOIN rh.estabelecimento_versao ev ON ev.estabelecimento_id = l.estabelecimento_id
       WHERE l.colaborador_id = c.id
       ORDER BY ev.inicio_vigencia DESC, l.inicio_vigencia DESC, l.id DESC
       LIMIT 1) unidade ON TRUE`;

function normalizar(linha) {
  return { ...linha, id: Number(linha.id) };
}

/** Os desligados do 01-base, do mais antigo para o mais recente. */
async function desligados(cliente) {
  const { rows } = await cliente.query(
    `${SELECT_PESSOA}
      WHERE c.status = 'desligado' AND c.data_desligamento IS NOT NULL
      ORDER BY c.data_desligamento, c.matricula`
  );
  return rows.map(normalizar);
}

/** As 6 admissões mais recentes entre quem está na casa (da mais antiga p/ a mais nova). */
async function admitidosRecentes(cliente, quantidade) {
  const { rows } = await cliente.query(
    `${SELECT_PESSOA}
      WHERE c.status <> 'desligado'
      ORDER BY c.data_admissao DESC, c.matricula DESC
      LIMIT $1`,
    [quantidade]
  );
  return rows
    .map(normalizar)
    .sort((a, b) =>
      a.data_admissao === b.data_admissao
        ? a.matricula.localeCompare(b.matricula)
        : a.data_admissao.localeCompare(b.data_admissao)
    );
}

async function catalogo(cliente) {
  const tipos = await cliente.query(
    `SELECT id, tipo, nome, exige_aviso, admite_indenizado, elegivel_entrevista
       FROM rh.tipo_desligamento_versao WHERE status = 'ativa'`
  );
  const roteiro = await cliente.query(
    `SELECT id, versao, perguntas FROM rh.roteiro_entrevista_versao WHERE status = 'ativa'`
  );
  const checklist = await cliente.query(
    `SELECT id, versao, itens FROM rh.checklist_admissao_versao WHERE status = 'ativa'`
  );
  if (!roteiro.rows.length) throw new Error('Sem roteiro de entrevista ativo (seed da 0008).');
  if (!checklist.rows.length) throw new Error('Sem checklist de admissão ativo (seed da 0010).');

  const porTipo = new Map();
  for (const linha of tipos.rows) {
    porTipo.set(linha.tipo, { ...linha, id: Number(linha.id) });
  }
  return {
    tipos: porTipo,
    roteiro: { ...roteiro.rows[0], id: Number(roteiro.rows[0].id) },
    checklist: { ...checklist.rows[0], id: Number(checklist.rows[0].id) },
  };
}

// ------------------------------------------------------------------ admissões

/**
 * O contrato de experiência (art. 445 CLT, 45+45) é da CLT: estagiário
 * (Lei 11.788) e aprendiz (contrato a termo) NÃO têm — nesses casos o processo
 * nasce com contrato_experiencia = false e os dois prazos NULL, exatamente como
 * o CHECK da 0010 exige.
 */
function temExperiencia(pessoa) {
  return pessoa.tipo_vinculo === 'clt';
}

/** Mesma conta de src/dominios/admissao/esquemas.ts: dia 45 = adm+44, dia 90 = adm+89. */
function prazosExperiencia(dataAdmissao) {
  return {
    prazo1: somarDias(dataAdmissao, 44),
    prazo2: somarDias(dataAdmissao, 89),
  };
}

// Itens do checklist v1 (0010) por processo: resolvidos nos concluídos,
// parciais nos que ainda estão em preparação. 'x' concluído, '-' pendente,
// 'n' não se aplica. A ordem segue a do JSONB da versão congelada.
const ANDAMENTO_CONCLUIDO = [
  ['x', 'x', 'x', 'x', 'x', 'x'], // tudo entregue
  ['x', 'x', 'x', 'x', 'n', 'x'], // estágio: EPI/uniforme não se aplica
  ['x', 'x', 'x', 'x', 'x', 'x'],
];
const ANDAMENTO_EM_PREPARACAO = [
  ['x', 'x', 'x', '-', 'x', '-'], // 4/6 — falta acesso e integração
  ['x', 'x', '-', '-', 'x', '-'], // 3/6 — contrato ainda não assinado
  ['x', '-', '-', '-', 'n', '-'], // 2/6 — recém-cadastrado, ASO pendente
];

const STATUS_ITEM = { x: 'concluido', n: 'nao_aplicavel', '-': 'pendente' };

async function semearAdmissoes(cliente, pessoas, checklist, dp) {
  const itens = [];
  const eventos = [];
  const resumo = [];

  // As 3 admissões mais antigas da janela já viraram processo concluído; as 3
  // mais novas ainda estão em preparação (é o que o painel do DP mostra em cima).
  const concluidos = pessoas.slice(0, 3);
  const emPreparacao = pessoas.slice(3, 6);

  const abrir = async (pessoa, estado, andamento, deslocamentoConclusao, ordem) => {
    const inicioPrevisto = pessoa.data_admissao;
    const experiencia = temExperiencia(pessoa);
    const prazos = experiencia ? prazosExperiencia(pessoa.data_admissao) : null;
    // O DP abre a preparação ~12 dias antes do início previsto.
    const abertura = somarDias(inicioPrevisto, -12);
    const conclusao =
      estado === 'concluido' ? somarDias(inicioPrevisto, deslocamentoConclusao) : null;
    const responsavel = ordem % 2 === 0 ? dp.principal : dp.apoio;

    const { rows } = await cliente.query(
      `INSERT INTO rh.processo_admissao
         (colaborador_id, checklist_versao_id, data_inicio_prevista, estado,
          contrato_experiencia, prazo_experiencia_1, prazo_experiencia_2,
          criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        pessoa.id,
        checklist.id,
        inicioPrevisto,
        estado,
        experiencia,
        prazos ? prazos.prazo1 : null,
        prazos ? prazos.prazo2 : null,
        instante(abertura, 13),
        instante(conclusao ?? somarDias(abertura, 6), conclusao ? 16 : 14),
      ]
    );
    const processoId = Number(rows[0].id);

    checklist.itens.forEach((modelo, indice) => {
      const marca = andamento[indice] ?? '-';
      const status = STATUS_ITEM[marca];
      // O item vai sendo resolvido ao longo da preparação, um a cada ~2 dias.
      const resolvidoEm =
        status === 'pendente' ? null : instante(somarDias(abertura, 1 + indice * 2), 14);
      itens.push([
        processoId,
        modelo.ordem,
        modelo.descricao,
        modelo.obrigatorio,
        status,
        status === 'pendente' ? null : responsavel.id,
        resolvidoEm,
        instante(abertura, 13),
        resolvidoEm ?? instante(abertura, 13),
      ]);
    });

    if (estado === 'concluido') {
      eventos.push([
        pessoa.id,
        'admissao_concluida',
        instante(conclusao, 16),
        'rh.processo_admissao',
        processoId,
        `Processo de admissão concluído pelo DP (checklist v${checklist.versao}; início previsto ${paraBr(inicioPrevisto)})`,
        JSON.stringify({
          checklist_versao: checklist.versao,
          data_inicio_prevista: inicioPrevisto,
        }),
        responsavel.id,
      ]);
    }

    resumo.push({
      matricula: pessoa.matricula,
      nome: pessoa.nome_completo,
      vinculo: pessoa.tipo_vinculo,
      estado,
      experiencia,
      prazo1: prazos ? prazos.prazo1 : null,
      prazo2: prazos ? prazos.prazo2 : null,
      conclusao,
      no_prazo: conclusao ? conclusao <= inicioPrevisto : null,
    });
    return processoId;
  };

  // Conclusões: duas dentro do início previsto, uma estourada — o indicador
  // "admissões no prazo (12m)" nasce com um número real (2 de 3), não 100%.
  const deslocamentos = [-1, 0, 3];
  for (let i = 0; i < concluidos.length; i += 1) {
    await abrir(concluidos[i], 'concluido', ANDAMENTO_CONCLUIDO[i], deslocamentos[i], i);
  }
  for (let i = 0; i < emPreparacao.length; i += 1) {
    await abrir(emPreparacao[i], 'em_preparacao', ANDAMENTO_EM_PREPARACAO[i], 0, i + 3);
  }

  await inserirLote(
    cliente,
    'rh.item_admissao',
    [
      'processo_id',
      'ordem',
      'descricao',
      'obrigatorio',
      'status',
      'concluido_por',
      'concluido_em',
      'criado_em',
      'atualizado_em',
    ],
    itens
  );

  return { resumo, eventos, totalItens: itens.length };
}

// ------------------------------------------------------------------ desligamentos

/**
 * Projeção do aviso prévio (Lei 12.506/2011): 30 dias + 3 por ano completo,
 * teto de 90 — proporcionalidade só em favor do empregado, por isso o pedido de
 * demissão fica nos 30 dias. É aritmética de calendário para o cronograma do
 * processo; valor de aviso é rubrica do motor de folha, nunca deste módulo.
 */
function diasDeAviso(tipo, dataAdmissao, dataTermino) {
  if (tipo === 'pedido_demissao') return 30;
  return Math.min(90, 30 + 3 * anosCompletos(dataAdmissao, dataTermino));
}

// Devoluções coerentes com o que cada cargo usa no dia a dia da distribuidora.
const DEVOLUCOES_POR_CARGO = {
  Conferente: [
    ['epi', 'Botina de segurança e capacete (ficha de EPI do CD)'],
    ['uniforme', 'Dois conjuntos de uniforme do centro de distribuição'],
    ['cracha', 'Crachá de acesso e cartão de estacionamento'],
    ['chave', 'Chave do armário do vestiário'],
  ],
  Estoquista: [
    ['epi', 'Botina de segurança, luva de vaqueta e protetor auricular'],
    ['uniforme', 'Dois conjuntos de uniforme do estoque'],
    ['cracha', 'Crachá de acesso'],
    ['outro', 'Coletor de código de barras do inventário'],
  ],
  'Motorista Entregador': [
    ['cracha', 'Crachá de acesso e cartão-pedágio'],
    ['uniforme', 'Uniforme e colete refletivo'],
    ['chave', 'Chave reserva do VUC da rota'],
    ['celular', 'Celular corporativo com o app de roteirização'],
  ],
  'Auxiliar Administrativo': [
    ['notebook', 'Notebook corporativo e fonte'],
    ['cracha', 'Crachá de acesso'],
    ['chave', 'Chave da gaveta de arquivo do setor'],
  ],
};
const DEVOLUCAO_PADRAO = [
  ['cracha', 'Crachá de acesso'],
  ['uniforme', 'Uniforme do balcão de vendas'],
  ['outro', 'Tablet de consulta de estoque do salão'],
];

function devolucoesDe(cargo) {
  return DEVOLUCOES_POR_CARGO[cargo] ?? DEVOLUCAO_PADRAO;
}

/**
 * Roteiro dos 8 processos ENCERRADOS, na ordem de data_desligamento (do mais
 * antigo ao mais recente). Tipos variados e desfecho de entrevista obrigatório:
 * 5 realizadas, 1 recusada, 1 não realizada com motivo e a justa causa fora do
 * indicador (tipo não elegível — nem entrevista tem, como o serviço faz).
 */
const ROTEIRO_ENCERRADOS = [
  {
    tipo: 'sem_justa_causa',
    iniciativa: 'empregador',
    aviso: 'indenizado',
    motivo: (p) =>
      `Redução de quadro na ${p.unidade}: o posto de ${p.cargo} foi extinto na reorganização do fluxo de recebimento.`,
    entrevista: {
      status: 'realizada',
      consentimento: true,
      respostas: {
        motivo_percebido:
          'Fui dispensado na redução de quadro. Entendi a decisão, mas fiquei sabendo pelo corredor antes de ser chamado.',
        clima: 3,
        gestao: 4,
        recomendaria: true,
        comentario:
          'A empresa é boa de trabalhar. O que pesa é o excesso de hora extra na semana de fechamento do mês.',
      },
    },
    avaria: 'avariado',
  },
  {
    tipo: 'pedido_demissao',
    iniciativa: 'empregado',
    aviso: 'trabalhado',
    motivo: () =>
      'Pedido de demissão apresentado por escrito; a pessoa informou proposta com salário maior em outra empresa do setor.',
    entrevista: {
      status: 'realizada',
      consentimento: true,
      respostas: {
        motivo_percebido:
          'Saí por uma proposta com salário maior. Gostava do time, mas o fixo daqui estava defasado em relação ao mercado.',
        clima: 4,
        gestao: 4,
        recomendaria: true,
        comentario:
          'Se a faixa salarial fosse revisada uma vez por ano, eu teria ficado.',
      },
    },
  },
  {
    tipo: 'justa_causa',
    iniciativa: 'empregador',
    aviso: 'nao_aplicavel',
    motivo: () =>
      'Dispensa por justa causa (art. 482, "h", da CLT) após três advertências e uma suspensão por descumprimento reiterado do procedimento de conferência de carga. Apuração documentada, com direito de defesa registrado e testemunhas.',
    entrevista: null, // tipo não elegível: o serviço não oferta e o KPI não conta
    avaria: 'extraviado',
  },
  {
    tipo: 'sem_justa_causa',
    iniciativa: 'empregador',
    aviso: 'indenizado',
    motivo: (p) =>
      `Dispensa sem justa causa por desempenho abaixo do combinado na ${p.unidade}, depois de dois ciclos de feedback formal registrados na ficha.`,
    entrevista: { status: 'recusada' },
  },
  {
    tipo: 'pedido_demissao',
    iniciativa: 'empregado',
    aviso: 'dispensado',
    motivo: () =>
      'Pedido de demissão por mudança de cidade; o cumprimento do aviso foi dispensado pela empresa a pedido da própria pessoa.',
    entrevista: {
      status: 'realizada',
      consentimento: false,
      respostas: {
        motivo_percebido:
          'Mudança de cidade por questão familiar — não foi insatisfação com a empresa.',
        clima: 4,
        gestao: 5,
        recomendaria: true,
        comentario:
          'Só senti falta de uma conversa sobre transferência para outra unidade antes de eu pedir as contas.',
      },
    },
  },
  {
    tipo: 'acordo_484a',
    iniciativa: 'acordo',
    aviso: 'indenizado',
    motivo: (p) =>
      `Acordo entre as partes (art. 484-A da CLT) formalizado após dois trimestres de resultado abaixo da meta na ${p.unidade}, com ciência registrada das condições.`,
    entrevista: {
      status: 'realizada',
      consentimento: true,
      respostas: {
        motivo_percebido:
          'Acordamos a saída depois de dois trimestres sem bater meta. A meta subiu, mas o treinamento do produto novo não veio junto.',
        clima: 2,
        gestao: 2,
        recomendaria: false,
        comentario:
          'Cobrança diária de meta sem apoio técnico desanima o time inteiro, não só quem sai.',
      },
    },
  },
  {
    tipo: 'sem_justa_causa',
    iniciativa: 'empregador',
    aviso: 'trabalhado',
    motivo: (p) =>
      `Dispensa sem justa causa na revisão do quadro comercial da ${p.unidade} após a queda de faturamento do trimestre.`,
    entrevista: {
      status: 'nao_realizada',
      motivo_nao_realizacao:
        'Não compareceu à data agendada e não respondeu às três tentativas de reagendamento do RH até o encerramento do acerto.',
    },
  },
  {
    tipo: 'pedido_demissao',
    iniciativa: 'empregado',
    aviso: 'trabalhado',
    motivo: () =>
      'Pedido de demissão: proposta com salário maior e escala melhor em concorrente da região.',
    entrevista: {
      status: 'realizada',
      consentimento: true,
      respostas: {
        motivo_percebido:
          'Recebi proposta com salário maior e uma escala melhor em um concorrente aqui perto.',
        clima: 4,
        gestao: 3,
        recomendaria: true,
      },
    },
  },
];

// Estabilidades sem dado no sistema: declaração humana obrigatória no gate
// (mesma lista de TIPOS_DECLARACAO do domínio).
const TIPOS_DECLARACAO = ['gestante', 'cipeiro', 'pre_aposentadoria'];

function verificacoesLivres(processoId, decisorId, quando) {
  return [
    [
      processoId,
      'acidentario',
      'livre',
      'afastamento',
      'Sem afastamento por acidente de trabalho nos últimos 12 meses.',
      decisorId,
      quando,
    ],
    ...TIPOS_DECLARACAO.map((tipo) => [
      processoId,
      tipo,
      'livre',
      'declaracao',
      null,
      decisorId,
      quando,
    ]),
  ];
}

async function semearDesligamentos(cliente, pessoas, catalogoDados, atores) {
  const verificacoes = [];
  const devolucoes = [];
  const entrevistas = [];
  const eventos = [];
  const resumo = [];

  for (let i = 0; i < pessoas.length; i += 1) {
    const pessoa = pessoas[i];
    const guiao = ROTEIRO_ENCERRADOS[i % ROTEIRO_ENCERRADOS.length];
    const tipo = catalogoDados.tipos.get(guiao.tipo);
    if (!tipo) throw new Error(`Tipo de desligamento sem versão ativa: ${guiao.tipo}`);

    const termino = pessoa.data_desligamento;
    const comunicacao =
      guiao.aviso === 'trabalhado'
        ? somarDias(termino, -diasDeAviso(guiao.tipo, pessoa.data_admissao, termino))
        : termino;
    // Art. 477 §6º: 10 dias corridos do término (o app grava projetada + 10).
    const limite477 = somarDias(termino, 10);
    const dp = i % 2 === 0 ? atores.dpPrincipal : atores.dpApoio;
    const rh = i % 2 === 0 ? atores.rhPrincipal : atores.rhApoio;

    const { rows } = await cliente.query(
      `INSERT INTO rh.processo_desligamento
         (colaborador_id, tipo_desligamento_versao_id, iniciativa, data_comunicacao,
          modalidade_aviso, data_projetada_termino, data_termino_efetiva,
          data_limite_477, estado, motivo, aberto_por_usuario_id,
          criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'encerrado', $9, $10, $11, $12)
       RETURNING id`,
      [
        pessoa.id,
        tipo.id,
        guiao.iniciativa,
        comunicacao,
        guiao.aviso,
        termino,
        termino,
        limite477,
        guiao.motivo(pessoa),
        dp.id,
        instante(comunicacao, 13),
        instante(somarDias(termino, 3), 18),
      ]
    );
    const processoId = Number(rows[0].id);

    verificacoes.push(...verificacoesLivres(processoId, dp.id, instante(comunicacao, 13)));

    const lista = devolucoesDe(pessoa.cargo);
    lista.forEach(([categoria, descricao], indice) => {
      // Processo encerrado = devoluções resolvidas; a condição do item é o
      // fato registrado (desconto, se houver, é variável do motor de folha).
      const status =
        guiao.avaria && indice === lista.length - 1 ? guiao.avaria : 'devolvido';
      devolucoes.push([
        processoId,
        categoria,
        descricao,
        status,
        instante(comunicacao, 13),
        instante(termino, 17),
      ]);
    });

    if (guiao.entrevista) {
      const e = guiao.entrevista;
      const oferta = comunicacao;
      const agendada = e.status === 'recusada' ? null : somarDias(oferta, 5);
      const realizacao = e.status === 'realizada' ? agendada : null;
      entrevistas.push([
        processoId,
        catalogoDados.roteiro.id,
        e.status,
        oferta,
        agendada,
        realizacao,
        e.motivo_nao_realizacao ?? null,
        tipo.elegivel_entrevista,
        e.respostas ? JSON.stringify(e.respostas) : null,
        e.status === 'realizada' ? rh.id : null,
        e.consentimento ?? false,
        instante(oferta, 13),
        instante(realizacao ?? agendada ?? oferta, 17),
      ]);
    }

    eventos.push([
      pessoa.id,
      'desligamento_iniciado',
      fatoDatado(comunicacao),
      'rh.processo_desligamento',
      processoId,
      `Processo de desligamento iniciado (${tipo.nome}) — término projetado em ${paraBr(termino)}`,
      JSON.stringify({ restrita: true, tipo: tipo.tipo }),
      dp.id,
    ]);

    resumo.push({
      matricula: pessoa.matricula,
      nome: pessoa.nome_completo,
      tipo: tipo.tipo,
      aviso: guiao.aviso,
      comunicacao,
      termino,
      entrevista: guiao.entrevista ? guiao.entrevista.status : 'sem entrevista (tipo não elegível)',
      conta_no_kpi: Boolean(guiao.entrevista) && tipo.elegivel_entrevista,
    });
  }

  return { verificacoes, devolucoes, entrevistas, eventos, resumo };
}

/**
 * Quem o PRÓPRIO app marcaria como bloqueado no gate: a consulta é a mesma de
 * temAfastamentoAcidentario12m (src/dominios/desligamento/repositorio.ts), então
 * a verificação gravada aqui é verdadeira, não encenada. Se o módulo de
 * afastamentos ainda não tiver rodado, devolve null e o gate cai no plano B
 * (estabilidade de cipeiro, que é declaração humana e não depende de dado algum).
 */
async function acidentadoComEstabilidade(cliente) {
  const { rows } = await cliente.query(
    `${SELECT_PESSOA}
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE c.status = 'ativo'
        AND u.email NOT IN ('diretora.pessoas@fastdemo.local', 'dp@fastdemo.local',
                            'rh@fastdemo.local', 'gestor@fastdemo.local',
                            'funcionario@fastdemo.local')
        AND EXISTS (
          SELECT 1 FROM rh.afastamento a
           WHERE a.colaborador_id = c.id
             AND a.tipo = 'acidente_trabalho'
             AND a.inicio <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
             AND (a.fim IS NULL
                  OR a.fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                              - INTERVAL '12 months'))
        -- quem está afastado HOJE não entra em processo: o contrato está suspenso
        AND NOT EXISTS (
          SELECT 1 FROM rh.afastamento a
           WHERE a.colaborador_id = c.id
             AND a.inicio <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
             AND (a.fim IS NULL
                  OR a.fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date))
      ORDER BY c.matricula
      LIMIT 1`
  );
  return rows.length ? normalizar(rows[0]) : null;
}

/**
 * Processo VIVO (não terminal) — é o que dá movimento ao painel do DP:
 * estado em_cumprimento, devoluções ainda pendentes e a entrevista apenas
 * OFERECIDA (desfecho em aberto: é exatamente isso que a trava de encerramento
 * da 0008 cobra antes de deixar o processo encerrar).
 *
 * Quando `bloqueio` vem preenchido, o gate de estabilidade aparece completo:
 * a verificação BLOQUEADA e, logo depois, o override como registro NOVO
 * (append-only, com a justificativa do decisor) — igual ao serviço faz.
 */
async function semearProcessoVivo(cliente, config, catalogoDados, atores) {
  const { pessoa, tipoChave, iniciativa, aviso, comunicacao, termino, motivo, bloqueio } =
    config;
  const tipo = catalogoDados.tipos.get(tipoChave);
  if (!tipo) throw new Error(`Tipo "${tipoChave}" sem versão ativa.`);

  const limite477 = somarDias(termino, 10);
  const dp = atores.dpPrincipal;
  const abertura = instante(comunicacao, 13);

  const { rows } = await cliente.query(
    `INSERT INTO rh.processo_desligamento
       (colaborador_id, tipo_desligamento_versao_id, iniciativa, data_comunicacao,
        modalidade_aviso, data_projetada_termino, data_termino_efetiva,
        data_limite_477, estado, motivo, aberto_por_usuario_id,
        criado_em, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'em_cumprimento', $8, $9, $10, $11)
     RETURNING id`,
    [
      pessoa.id,
      tipo.id,
      iniciativa,
      comunicacao,
      aviso,
      termino,
      limite477,
      motivo,
      dp.id,
      abertura,
      instante(somarDias(comunicacao, 1), 15),
    ]
  );
  const processoId = Number(rows[0].id);

  // As quatro verificações do gate: a automática (acidentário, com dado) e as
  // três declarações humanas. Só a bloqueada foge do "livre".
  const verificacoes = [
    [
      processoId,
      'acidentario',
      bloqueio && bloqueio.tipo === 'acidentario' ? 'bloqueado' : 'livre',
      'afastamento',
      bloqueio && bloqueio.tipo === 'acidentario'
        ? 'Afastamento por acidente de trabalho nos últimos 12 meses (art. 118 da Lei 8.213/91).'
        : 'Sem afastamento por acidente de trabalho nos últimos 12 meses.',
      dp.id,
      abertura,
    ],
    ...TIPOS_DECLARACAO.map((tipoDeclaracao) => [
      processoId,
      tipoDeclaracao,
      bloqueio && bloqueio.tipo === tipoDeclaracao ? 'bloqueado' : 'livre',
      'declaracao',
      bloqueio && bloqueio.tipo === tipoDeclaracao ? bloqueio.justificativa : null,
      dp.id,
      abertura,
    ]),
  ];
  if (bloqueio) {
    // Override = registro NOVO por estabilidade bloqueada (nada se sobrescreve),
    // com o mesmo prefixo que o serviço grava.
    verificacoes.push([
      processoId,
      bloqueio.tipo,
      'condicionado',
      'declaracao',
      `Prosseguimento autorizado (override): ${bloqueio.override}`,
      atores.rhPrincipal.id,
      instante(comunicacao, 15),
    ]);
  }

  const devolucoes = devolucoesDe(pessoa.cargo).map(([categoria, descricao], indice) => [
    processoId,
    categoria,
    descricao,
    indice === 0 ? 'devolvido' : 'pendente',
    abertura,
    abertura,
  ]);

  const entrevistas = [
    [
      processoId,
      catalogoDados.roteiro.id,
      'oferecida',
      comunicacao,
      null,
      null,
      null,
      tipo.elegivel_entrevista,
      null,
      null,
      false,
      abertura,
      abertura,
    ],
  ];

  const eventos = [
    [
      pessoa.id,
      'desligamento_iniciado',
      fatoDatado(comunicacao),
      'rh.processo_desligamento',
      processoId,
      `Processo de desligamento iniciado (${tipo.nome}) — término projetado em ${paraBr(termino)}`,
      JSON.stringify({ restrita: true, tipo: tipo.tipo }),
      dp.id,
    ],
  ];

  return {
    verificacoes,
    devolucoes,
    entrevistas,
    eventos,
    resumo: {
      matricula: pessoa.matricula,
      nome: pessoa.nome_completo,
      cargo: pessoa.cargo,
      unidade: pessoa.unidade,
      tipo: tipo.tipo,
      comunicacao,
      termino,
      dias_ate_477: diasEntre(iso(hoje()), limite477),
      bloqueio: bloqueio ? `${bloqueio.tipo} bloqueado + override` : 'todas livres',
      devolucoes_pendentes: devolucoes.length - 1,
    },
  };
}

/**
 * Monta os processos vivos. O gate de estabilidade vai no processo de quem o
 * banco realmente aponta como acidentado; sem esse dado, vai no término de
 * experiência com estabilidade de cipeiro (declaração, sem dependência externa).
 */
async function montarProcessosVivos(cliente, emExperiencia, catalogoDados, atores) {
  const hojeIso = iso(hoje());
  const acidentado = await acidentadoComEstabilidade(cliente);

  // Término do contrato de experiência: o término projetado é o dia 90 (fim da
  // prorrogação), calculado sobre a admissão como o app calcula.
  const experiencia = {
    pessoa: emExperiencia,
    tipoChave: 'termino_experiencia',
    iniciativa: 'termino_contrato',
    aviso: 'nao_aplicavel',
    comunicacao: somarDias(hojeIso, -4),
    termino: prazosExperiencia(emExperiencia.data_admissao).prazo2,
    motivo:
      'Não prorrogação do contrato de experiência: metas de atendimento e conferência de pedidos abaixo do combinado no plano de integração, com dois registros de feedback do gestor.',
    bloqueio: null,
  };

  if (!acidentado) {
    // Plano B: sem afastamento acidentário no banco, o gate é demonstrado com a
    // estabilidade de cipeiro — que é declaração humana e não depende de dado.
    experiencia.bloqueio = {
      tipo: 'cipeiro',
      justificativa:
        'Declarado mandato de cipeiro registrado na ata da CIPA da unidade — verificar a garantia do art. 10, II, "a", do ADCT.',
      override:
        'a ata da CIPA anexada mostra mandato encerrado há mais de um ano, de modo que o ano de garantia posterior ao término já transcorreu; jurídico confirmou a inexistência de estabilidade vigente.',
    };
    return [experiencia];
  }

  // O aviso prévio de pedido de demissão é de 30 dias e está em curso: faltam
  // 5 dias para o término projetado, com o prazo do art. 477 correndo atrás.
  const comunicacaoPedido = somarDias(hojeIso, -25);
  const pedido = {
    pessoa: acidentado,
    tipoChave: 'pedido_demissao',
    iniciativa: 'empregado',
    aviso: 'trabalhado',
    comunicacao: comunicacaoPedido,
    termino: somarDias(comunicacaoPedido, 30),
    motivo: `Pedido de demissão apresentado por escrito: mudança para o interior por motivo familiar. Aviso prévio trabalhado em curso na ${acidentado.unidade}.`,
    bloqueio: {
      tipo: 'acidentario',
      justificativa: null, // a automática já traz o texto do art. 118
      override:
        'a garantia do art. 118 da Lei 8.213/91 protege contra dispensa imotivada e não impede o pedido de demissão do próprio empregado. Rescisão assinada com assistência do sindicato da categoria (art. 500 da CLT), com parecer do jurídico e ciência do RH anexados ao processo.',
    },
  };

  return [pedido, experiencia];
}

// ------------------------------------------------------------------ orquestração do módulo

async function semear(cliente) {
  await limpar(cliente);

  const atores = {
    dpPrincipal: await usuarioDemo(cliente, 'dp@fastdemo.local', 'dp'),
    dpApoio: await usuarioDemo(cliente, 'daniel.melo@fastdemo.local', 'dp'),
    rhPrincipal: await usuarioDemo(cliente, 'rh@fastdemo.local', 'rh'),
    rhApoio: await usuarioDemo(cliente, 'debora.rezende@fastdemo.local', 'rh'),
  };
  const catalogoDados = await catalogo(cliente);

  // ---------------------------------------------------------------- admissões
  const recentes = await admitidosRecentes(cliente, 6);
  if (recentes.length < 6) {
    throw new Error(
      `Esperava 6 admissões recentes para os processos de admissão, achei ${recentes.length} — rode 01-base antes.`
    );
  }
  const admissoes = await semearAdmissoes(
    cliente,
    recentes,
    catalogoDados.checklist,
    { principal: atores.dpPrincipal, apoio: atores.dpApoio }
  );

  // ---------------------------------------------------------------- desligamentos encerrados
  const saidas = await desligados(cliente);
  if (saidas.length === 0) {
    throw new Error('Nenhum colaborador desligado no banco — rode 01-base antes.');
  }
  const encerrados = await semearDesligamentos(cliente, saidas, catalogoDados, atores);

  // ---------------------------------------------------------------- processos vivos (gate de estabilidade)
  // O mais antigo dos admitidos recentes com vínculo CLT: está dentro dos 90
  // dias de experiência e já teve o processo de admissão concluído.
  const emExperiencia = recentes.slice(0, 3).find(temExperiencia) ?? recentes.find(temExperiencia);
  if (!emExperiencia) {
    throw new Error('Nenhum admitido recente com vínculo CLT para o término de experiência.');
  }
  const configuracoes = await montarProcessosVivos(
    cliente,
    emExperiencia,
    catalogoDados,
    atores
  );
  const vivos = [];
  for (const configuracao of configuracoes) {
    vivos.push(await semearProcessoVivo(cliente, configuracao, catalogoDados, atores));
  }
  const juntar = (chave) => vivos.flatMap((processo) => processo[chave]);

  // ---------------------------------------------------------------- gravação em lote
  await inserirLote(
    cliente,
    'rh.verificacao_estabilidade',
    ['processo_id', 'tipo', 'resultado', 'origem', 'justificativa', 'decisor_usuario_id', 'em'],
    [...encerrados.verificacoes, ...juntar('verificacoes')]
  );
  await inserirLote(
    cliente,
    'rh.item_devolucao',
    ['processo_id', 'categoria', 'descricao', 'status', 'criado_em', 'atualizado_em'],
    [...encerrados.devolucoes, ...juntar('devolucoes')]
  );
  await inserirLote(
    cliente,
    'rh.entrevista_desligamento',
    [
      'processo_id',
      'roteiro_versao_id',
      'status',
      'data_oferta',
      'data_agendada',
      'data_realizacao',
      'motivo_nao_realizacao',
      'elegivel_indicador',
      'respostas',
      'entrevistador_usuario_id',
      'consentimento_uso_agregado',
      'criado_em',
      'atualizado_em',
    ],
    [...encerrados.entrevistas, ...juntar('entrevistas')]
  );
  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    ['colaborador_id', 'tipo', 'ocorrido_em', 'origem_tabela', 'origem_id', 'resumo', 'payload', 'registrado_por'],
    [...admissoes.eventos, ...encerrados.eventos, ...juntar('eventos')]
  );

  await conferir(cliente);
  return relatar(cliente, { admissoes, encerrados, vivos });
}

// ------------------------------------------------------------------ conferências duras

async function conferir(cliente) {
  const checar = async (rotulo, sql, esperado = 0) => {
    const { rows } = await cliente.query(sql);
    const obtido = Number(rows[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await checar(
    'processo encerrado de tipo elegível sem desfecho de entrevista (trava da 0008)',
    `SELECT count(*)::int AS total
       FROM rh.processo_desligamento p
       JOIN rh.tipo_desligamento_versao t ON t.id = p.tipo_desligamento_versao_id
       LEFT JOIN rh.entrevista_desligamento e ON e.processo_id = p.id
      WHERE p.estado = 'encerrado' AND t.elegivel_entrevista
        AND (e.id IS NULL OR e.status NOT IN ('realizada','recusada','nao_realizada'))`
  );
  await checar(
    'processo de desligamento aberto para quem já está desligado',
    `SELECT count(*)::int AS total
       FROM rh.processo_desligamento p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE p.estado NOT IN ('encerrado','cancelado') AND c.status <> 'ativo'`
  );
  await checar(
    'gate acidentário bloqueado em processo vivo sem afastamento que o sustente',
    `SELECT count(*)::int AS total
       FROM rh.verificacao_estabilidade v
       JOIN rh.processo_desligamento p ON p.id = v.processo_id
      WHERE p.estado NOT IN ('encerrado','cancelado')
        AND v.tipo = 'acidentario' AND v.resultado = 'bloqueado'
        AND NOT EXISTS (
          SELECT 1 FROM rh.afastamento a
           WHERE a.colaborador_id = p.colaborador_id
             AND a.tipo = 'acidente_trabalho'
             AND a.inicio <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
             AND (a.fim IS NULL
                  OR a.fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                              - INTERVAL '12 months'))`
  );
  await checar(
    'estabilidade bloqueada em processo vivo sem override registrado',
    `SELECT count(*)::int AS total
       FROM rh.verificacao_estabilidade v
       JOIN rh.processo_desligamento p ON p.id = v.processo_id
      WHERE p.estado NOT IN ('encerrado','cancelado')
        AND v.resultado = 'bloqueado'
        AND NOT EXISTS (
          SELECT 1 FROM rh.verificacao_estabilidade o
           WHERE o.processo_id = v.processo_id AND o.tipo = v.tipo
             AND o.resultado = 'condicionado' AND o.em > v.em
             AND o.justificativa LIKE 'Prosseguimento autorizado (override):%')`
  );
  await checar(
    'processo encerrado sem data de término efetiva',
    `SELECT count(*)::int AS total FROM rh.processo_desligamento
      WHERE estado = 'encerrado' AND data_termino_efetiva IS NULL`
  );
  await checar(
    'término efetivo divergente da data de desligamento do colaborador',
    `SELECT count(*)::int AS total
       FROM rh.processo_desligamento p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE p.estado = 'encerrado' AND c.data_desligamento IS DISTINCT FROM p.data_termino_efetiva`
  );
  await checar(
    'admissão concluída com item obrigatório pendente',
    `SELECT count(*)::int AS total
       FROM rh.processo_admissao p
       JOIN rh.item_admissao i ON i.processo_id = p.id
      WHERE p.estado = 'concluido' AND i.obrigatorio AND i.status = 'pendente'`
  );
  await checar(
    'prazo de experiência em vínculo que não é CLT',
    `SELECT count(*)::int AS total
       FROM rh.processo_admissao p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE p.contrato_experiencia AND c.tipo_vinculo <> 'clt'`
  );
  await checar(
    'prazo de experiência fora da conta do art. 445 (adm+44 / adm+89)',
    `SELECT count(*)::int AS total
       FROM rh.processo_admissao p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE p.contrato_experiencia
        AND (p.prazo_experiencia_1 <> c.data_admissao + 44
             OR p.prazo_experiencia_2 <> c.data_admissao + 89)`
  );
  await checar(
    'respostas de entrevista fora do estado "realizada"',
    `SELECT count(*)::int AS total FROM rh.entrevista_desligamento
      WHERE respostas IS NOT NULL AND status <> 'realizada'`
  );
  await checar(
    'resposta de entrevista com chave fora do roteiro vigente',
    `SELECT count(*)::int AS total
       FROM rh.entrevista_desligamento e
       JOIN rh.roteiro_entrevista_versao r ON r.id = e.roteiro_versao_id
       CROSS JOIN LATERAL jsonb_object_keys(e.respostas) AS chave
      WHERE e.respostas IS NOT NULL
        AND chave NOT IN (SELECT p ->> 'chave'
                            FROM jsonb_array_elements(r.perguntas) AS p)`
  );
}

// ------------------------------------------------------------------ relatório

async function relatar(cliente, dados) {
  const { rows: kpi } = await cliente.query(
    `SELECT COUNT(*) FILTER (WHERE e.status = 'realizada')::int AS realizadas,
            COUNT(*)::int AS elegiveis
       FROM rh.processo_desligamento p
       JOIN rh.entrevista_desligamento e ON e.processo_id = p.id
      WHERE p.estado = 'encerrado' AND e.elegivel_indicador
        AND p.data_termino_efetiva >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                                      - INTERVAL '12 months'`
  );
  const { rows: prazo } = await cliente.query(
    `SELECT COUNT(*) FILTER (
              WHERE (atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
                    <= data_inicio_prevista)::int AS no_prazo,
            COUNT(*)::int AS total
       FROM rh.processo_admissao
      WHERE estado = 'concluido' AND atualizado_em >= now() - INTERVAL '12 months'`
  );
  const { rows: alerta } = await cliente.query(
    `SELECT COUNT(*)::int AS total
       FROM rh.processo_admissao
      WHERE estado = 'em_preparacao'
        AND (
          (prazo_experiencia_1 - (now() AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN 0 AND 10
          OR (prazo_experiencia_2 - (now() AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN 0 AND 10
        )`
  );

  const percentualEntrevistas =
    kpi[0].elegiveis > 0
      ? Math.round((kpi[0].realizadas / kpi[0].elegiveis) * 1000) / 10
      : null;
  const percentualPrazo =
    prazo[0].total > 0 ? Math.round((prazo[0].no_prazo / prazo[0].total) * 1000) / 10 : null;

  log('\n06-ciclo-vida: admissões');
  for (const linha of dados.admissoes.resumo) {
    const prazos = linha.experiencia
      ? `experiência 45/90 em ${paraBr(linha.prazo1)} e ${paraBr(linha.prazo2)}`
      : 'sem contrato de experiência (estágio/aprendiz)';
    const fecho = linha.conclusao
      ? ` — concluído em ${paraBr(linha.conclusao)} (${linha.no_prazo ? 'no prazo' : 'fora do prazo'})`
      : '';
    log(`  ${linha.matricula} ${linha.estado.padEnd(14)} ${linha.nome} · ${prazos}${fecho}`);
  }

  log('\n06-ciclo-vida: desligamentos encerrados');
  for (const linha of dados.encerrados.resumo) {
    log(
      `  ${linha.matricula} ${linha.tipo.padEnd(20)} aviso ${linha.aviso.padEnd(13)} ` +
        `comunicado ${paraBr(linha.comunicacao)} · término ${paraBr(linha.termino)} · entrevista ${linha.entrevista}`
    );
  }

  log('\n06-ciclo-vida: processos em andamento (painel vivo)');
  for (const processo of dados.vivos) {
    const v = processo.resumo;
    log(
      `  ${v.matricula} ${v.nome} — ${v.cargo} (${v.unidade}) · ${v.tipo} · em_cumprimento\n` +
        `             comunicado ${paraBr(v.comunicacao)} · término projetado ${paraBr(v.termino)} · ` +
        `prazo do 477 em ${v.dias_ate_477} dia(s) · ${v.devolucoes_pendentes} devolução(ões) pendente(s)\n` +
        `             estabilidades: ${v.bloqueio} · entrevista apenas OFERECIDA (encerramento travado)`
    );
  }

  log('\n06-ciclo-vida: indicadores que este módulo alimenta');
  log(
    `  entrevistas de desligamento realizadas (12m): ${kpi[0].realizadas}/${kpi[0].elegiveis} = ` +
      `${percentualEntrevistas === null ? '—' : `${percentualEntrevistas}%`}`
  );
  log(
    `  admissões concluídas no prazo (12m):          ${prazo[0].no_prazo}/${prazo[0].total} = ` +
      `${percentualPrazo === null ? '—' : `${percentualPrazo}%`}`
  );
  log(`  processos em preparação com experiência vencendo em ≤10 dias: ${alerta[0].total}`);

  // Chave própria: o orquestrador faz Object.assign do retorno de cada módulo
  // num contexto compartilhado — nomes genéricos atropelariam outro módulo.
  return {
    cicloVida: {
      admissoes: dados.admissoes.resumo,
      itensAdmissao: dados.admissoes.totalItens,
      desligamentos: dados.encerrados.resumo,
      processosVivos: dados.vivos.map((processo) => processo.resumo),
      indicadores: {
        entrevistas: { ...kpi[0], percentual: percentualEntrevistas },
        admissoesNoPrazo: { ...prazo[0], percentual: percentualPrazo },
        experienciaEmAlerta: alerta[0].total,
      },
    },
  };
}

module.exports = { semear };

if (require.main === module) {
  executarSozinho('06-ciclo-vida', semear);
}
