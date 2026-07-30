// db/semear/13-pesquisas.js — pesquisa de clima, resultado e plano de ação.
//
// Módulo do schema rh_clima criado pela migration 0022 (pesquisa estruturada,
// ao lado do check-in diário). Origem: item 5 de
// docs/08-analise-feedback-analista-rh.md — hoje a Fast não tem pesquisa de
// clima nenhuma, e a analista pediu "pesquisa anual com plano de ação".
//
// O que este módulo planta, e por quê exatamente isto:
//   1. UMA pesquisa ANUAL ENCERRADA, com ~47 respostas reais — é a única que dá
//      resultado para mostrar: média por pergunta, eNPS, recorte por unidade e
//      comentários anônimos. Também é a fonte dos indicadores `adesao_pesquisa`
//      e `enps` da Central de Metas (última pesquisa ENCERRADA).
//   2. UM pulse ABERTO, sem nenhuma persona entre os participantes — é o que
//      permite ao apresentador RESPONDER AO VIVO e ver a própria resposta
//      entrar no agregado sem aparecer em lugar nenhum de forma identificada.
//   3. DOIS planos de ação (um em andamento, um concluído) — diagnóstico sem
//      plano é relatório, e é justamente o fechamento do ciclo que a analista
//      cobrou. Os dois planos respondem às duas maiores dores medidas.
//
// PRIVACIDADE — o que este módulo NÃO faz, de propósito:
//   • rh_clima.resposta_pesquisa não tem (nem recebe) vínculo com pessoa: o
//     único recorte é a unidade. Quem respondeu vive em participacao_pesquisa,
//     que não sabe O QUE foi respondido;
//   • `criada_em` da resposta é gravada TRUNCADA NO DIA (igual ao default da
//     migration) e há sempre vários respondentes por dia — com carimbo de
//     segundo daria para alinhar resposta e participação e reidentificar autor;
//   • as respostas são EMBARALHADAS antes do INSERT: sem isso, os ids sairiam
//     em blocos contíguos por pessoa e o bloco seria, ele mesmo, um vínculo;
//   • nenhum comentário de texto livre menciona nome, cargo, unidade ou valor.
//
// Idempotência: apaga só o que ESTE módulo cria (as 5 tabelas de pesquisa) e
// replanta. Determinismo sem rng nas notas: o "clima" de cada unidade é um
// PADRÃO declarado (POOL_NPS), percorrido por índice — a mesma demo em qualquer
// máquina, e a história (qual unidade está bem, qual está mal) é legível no
// código em vez de sair de um sorteio.
//
// Uso isolado: node --env-file=.env db/semear/13-pesquisas.js (após 01-base)
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  comTriggersDesligados,
  dataRelativa,
  executarSozinho,
  embaralhar,
  aleatorio,
  inserirLote,
  iso,
  isoInstante,
  log,
  mesesAtras,
} = require('./comum');

const SEMENTE = 20260813; // só para embaralhar a ordem de INSERT das respostas

const EMAIL_RH = 'rh@fastdemo.local';
const EMAIL_DP = 'dp@fastdemo.local';
const EMAIL_DIRETORIA = 'diretora.pessoas@fastdemo.local';

// Personas: ficam FORA do pulse aberto para poderem responder ao vivo na
// apresentação (participacao_pesquisa é única por pesquisa+colaborador — quem
// já respondeu não responde de novo, e é assim que deve ser).
const PERSONAS = [
  EMAIL_DIRETORIA,
  EMAIL_DP,
  EMAIL_RH,
  'gestor@fastdemo.local',
  'funcionario@fastdemo.local',
  'recrutador@fastdemo.local',
  'lidertd@fastdemo.local',
];

const MINIMO_AMOSTRA = 5; // igual a src/dominios/pesquisas/esquemas.ts

// ------------------------------------------------------------------ questionário anual

// `peso` é o deslocamento aplicado à nota de escala daquela pergunta: é o que
// desenha o DIAGNÓSTICO. Segurança sai bem (a rede investe em EPI e ASO desde
// a implantação do SST), feedback do líder e equilíbrio saem mal — e são
// exatamente as duas dores que os planos de ação atacam.
const PERGUNTAS_ANUAL = [
  {
    ordem: 1,
    tipo: 'nps_0_10',
    enunciado:
      'De 0 a 10, o quanto você recomendaria a Fast como lugar para trabalhar a um amigo?',
    obrigatoria: true,
  },
  {
    ordem: 2,
    tipo: 'escala_1_5',
    enunciado: 'Tenho clareza do que se espera de mim no meu trabalho.',
    obrigatoria: true,
    peso: 0,
  },
  {
    ordem: 3,
    tipo: 'escala_1_5',
    enunciado: 'Recebo do meu líder feedback que me ajuda a melhorar.',
    obrigatoria: true,
    peso: -1,
  },
  {
    ordem: 4,
    tipo: 'escala_1_5',
    enunciado: 'Tenho as ferramentas e os recursos necessários para fazer meu trabalho.',
    obrigatoria: true,
    peso: 0,
  },
  {
    ordem: 5,
    tipo: 'escala_1_5',
    enunciado: 'Minha segurança no trabalho é levada a sério na operação.',
    obrigatoria: true,
    peso: 1,
  },
  {
    ordem: 6,
    tipo: 'escala_1_5',
    enunciado: 'Consigo equilibrar o trabalho com a minha vida pessoal.',
    obrigatoria: true,
    peso: -1,
  },
  {
    ordem: 7,
    tipo: 'escolha_unica',
    enunciado: 'O que mais faria diferença para você neste ano?',
    obrigatoria: true,
    opcoes: [
      'Plano de carreira claro',
      'Benefícios (plano de saúde e odontológico)',
      'Reconhecimento e feedback do líder',
      'Mais treinamento técnico',
      'Melhoria no ambiente físico da unidade',
      'Comunicação mais clara da liderança',
    ],
  },
  {
    ordem: 8,
    tipo: 'texto_livre',
    enunciado:
      'O que a Fast deveria começar a fazer, parar de fazer e continuar fazendo? (opcional)',
    obrigatoria: false,
  },
];

// Distribuição da escolha única: lista percorrida por índice, então a proporção
// é estável qualquer que seja o número de respondentes. As duas primeiras
// opções são as mais frequentes — e são as que os dois planos de ação atendem.
const PESO_ESCOLHA = [
  'Plano de carreira claro',
  'Benefícios (plano de saúde e odontológico)',
  'Reconhecimento e feedback do líder',
  'Plano de carreira claro',
  'Benefícios (plano de saúde e odontológico)',
  'Mais treinamento técnico',
  'Plano de carreira claro',
  'Reconhecimento e feedback do líder',
  'Benefícios (plano de saúde e odontológico)',
  'Melhoria no ambiente físico da unidade',
  'Mais treinamento técnico',
  'Comunicação mais clara da liderança',
];

// ------------------------------------------------------------------ clima por unidade
//
// POOL_NPS é a história da rede em forma de dado. Percorrido por índice dentro
// de cada unidade: promotor 9–10, neutro 7–8, detrator 0–6.
//   Matriz Centro  gestão madura, liderança presente → melhor clima
//   Filial Oeste   equipe pequena e coesa, sem detrator
//   Filial Norte   boa, com um ponto de atenção
//   Filial Sul     dividida
//   Filial Leste   PROBLEMA REAL: gerente veterano que não dá feedback e
//                  equipe que se sente invisível — é a unidade que ganha plano
//                  de ação e a razão de o eNPS da rede não ser bom
const POOL_NPS = {
  'Matriz Centro': [10, 9, 8, 9, 10, 7, 6, 9],
  'Filial Norte': [9, 8, 10, 7, 9, 6, 8, 9],
  'Filial Sul': [9, 7, 10, 5, 8, 9, 6, 8],
  'Filial Leste': [6, 4, 8, 5, 9, 3, 7, 5],
  'Filial Oeste': [9, 10, 8, 9, 7, 10, 8],
};

// Teto de respondentes por unidade (clamped ao elegível de verdade). Soma 47 no
// elenco atual — proporcional ao headcount, e nunca abaixo de MINIMO_AMOSTRA,
// para que TODO recorte por unidade apareça no resultado em vez de ser
// suprimido pelo k-anonimato.
const TETO_RESPONDENTES = {
  'Matriz Centro': 16,
  'Filial Norte': 8,
  'Filial Sul': 8,
  'Filial Leste': 8,
  'Filial Oeste': 7,
};

// Faixa em que o resultado tem de cair para a demo continuar contando a
// história certa. Não é enfeite: se um dia o elenco de 01-base mudar e o eNPS
// virar 60, a apresentação mostraria uma rede saudável ao lado de dois planos
// de ação sem causa — e ninguém perceberia.
const FAIXA_ENPS = [12, 40];
const FAIXA_ADESAO = [65, 92];
const FAIXA_MEDIA_ESCALA = [3.0, 4.3];

// Comentários por tom. Sem nome, sem cargo, sem unidade, sem valor de salário —
// texto livre de pesquisa anônima é o lugar mais fácil de vazar identidade.
const COMENTARIOS = {
  positivo: [
    'Gosto do time e do clima no dia a dia. Continuar com as reuniões rápidas de início de turno ajuda muito.',
    'A empresa melhorou bastante em segurança: EPI chega, exame em dia, ninguém mais improvisa na descarga.',
    'Continuar investindo em treinamento de produto. Quando a gente conhece a aplicação, a venda flui.',
    'Começar a divulgar as vagas internamente antes de buscar fora. Tem gente pronta aqui dentro.',
  ],
  neutro: [
    'Parar de mudar o combinado no meio do mês. Quando a meta muda depois de começada, desanima.',
    'Começar a dar retorno de quem se candidata a vaga interna, mesmo quando não é aprovado.',
    'A comunicação chega por muitos canais diferentes e às vezes se perde. Um canal só resolveria.',
    'Faltam ferramentas melhores no atendimento em horário de pico; o sistema fica lento.',
  ],
  critico: [
    'Nunca recebi um retorno estruturado sobre o meu trabalho. Só ouço falar quando algo dá errado.',
    'Parar de tratar hora extra como normal. A escala do fim de mês não fecha e ninguém revisa.',
    'Começar a ter um plano de carreira de verdade. Não sei o que preciso fazer para crescer aqui.',
    'Falta reconhecimento. Quem entrega sempre é quem recebe mais tarefa, e nada muda.',
  ],
};

// ------------------------------------------------------------------ pulse aberto

const PERGUNTAS_PULSE = [
  {
    ordem: 1,
    tipo: 'escala_1_5',
    enunciado: 'Nas últimas duas semanas, minha carga de trabalho foi adequada.',
    obrigatoria: true,
    peso: 0,
  },
  {
    ordem: 2,
    tipo: 'escala_1_5',
    enunciado: 'Nas últimas duas semanas, senti que meu trabalho foi reconhecido.',
    obrigatoria: true,
    peso: -1,
  },
  {
    ordem: 3,
    tipo: 'texto_livre',
    enunciado: 'Se pudesse mudar uma coisa nesta quinzena, o que seria? (opcional)',
    obrigatoria: false,
  },
];

const TETO_PULSE = 3; // por unidade — de propósito ABAIXO do k-anonimato

// ------------------------------------------------------------------ apoio

/** Nota de escala 1–5 derivada da nota de eNPS da pessoa e do peso da pergunta. */
function notaEscala(notaNps, peso, indice) {
  let base;
  if (notaNps >= 9) base = indice % 3 === 0 ? 5 : 4;
  else if (notaNps >= 7) base = indice % 2 === 0 ? 4 : 3;
  else base = indice % 2 === 0 ? 3 : 2;
  return Math.min(5, Math.max(1, base + peso));
}

function tomDoComentario(notaNps) {
  if (notaNps >= 9) return 'positivo';
  if (notaNps >= 7) return 'neutro';
  return 'critico';
}

async function usuarioPorEmail(cliente, email) {
  const { rows } = await cliente.query(
    'SELECT id, nome FROM sistema.usuario WHERE email = $1',
    [email]
  );
  if (rows.length === 0) {
    throw new Error(`Usuário ${email} não existe — rode db/semear/01-base.js antes.`);
  }
  return { id: Number(rows[0].id), nome: rows[0].nome };
}

/**
 * Elegíveis a responder: ativos COM lotação vigente admitidos até a abertura da
 * pesquisa. O filtro de admissão não é preciosismo — sem ele a demo mostraria
 * alguém respondendo uma pesquisa que fechou antes de a pessoa ser contratada.
 */
async function elegiveis(cliente, aberturaIso, excluirEmails) {
  const { rows } = await cliente.query(
    `SELECT c.id, c.matricula, ev.unidade, l.estabelecimento_id
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       JOIN rh.lotacao l
         ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE c.status = 'ativo'
        AND c.data_admissao <= $1::date
        AND NOT (u.email = ANY($2::text[]))
      ORDER BY ev.unidade, c.matricula`,
    [aberturaIso, excluirEmails]
  );
  const porUnidade = new Map();
  for (const linha of rows) {
    if (!porUnidade.has(linha.unidade)) porUnidade.set(linha.unidade, []);
    porUnidade.get(linha.unidade).push({
      id: Number(linha.id),
      matricula: linha.matricula,
      unidade: linha.unidade,
      estabelecimentoId: Number(linha.estabelecimento_id),
    });
  }
  return porUnidade;
}

/** Escolhe os respondentes por unidade respeitando o teto e o elegível real. */
function escolherRespondentes(porUnidade, tetos, minimoPorUnidade) {
  const escolhidos = [];
  const resumo = [];
  for (const [unidade, teto] of Object.entries(tetos)) {
    const disponiveis = porUnidade.get(unidade) ?? [];
    const quantidade = Math.min(teto, disponiveis.length);
    if (minimoPorUnidade !== null && quantidade < minimoPorUnidade) {
      throw new Error(
        `"${unidade}" só tem ${disponiveis.length} elegível(is) e o recorte precisa de ` +
          `${minimoPorUnidade} para não ser suprimido pelo k-anonimato. O elenco de ` +
          '01-base.js encolheu — ajuste TETO_RESPONDENTES ou o quadro.'
      );
    }
    escolhidos.push(...disponiveis.slice(0, quantidade));
    resumo.push(`${unidade} ${quantidade}/${disponiveis.length}`);
  }
  return { escolhidos, resumo };
}

/**
 * Grava pesquisa + questionário + respostas + participações.
 * A ordem é ditada pelos triggers da 0022: pergunta só entra em pesquisa
 * 'rascunho' (pergunta_pesquisa_congelar) e 'encerrada' é imutável
 * (pesquisa_proteger) — logo rascunho → perguntas → aberta → respostas →
 * encerrada, exatamente como o app faz pela tela.
 */
async function plantarPesquisa(cliente, pesquisa) {
  const [linhaPesquisa] = await inserirLote(
    cliente,
    'rh_clima.pesquisa',
    ['titulo', 'tipo', 'descricao', 'inicio', 'fim', 'status', 'anonima', 'criada_por', 'criada_em'],
    [
      [
        pesquisa.titulo,
        pesquisa.tipo,
        pesquisa.descricao,
        pesquisa.inicio,
        pesquisa.fim,
        'rascunho',
        true,
        pesquisa.criadaPor,
        pesquisa.criadaEm,
      ],
    ],
    'id'
  );
  const pesquisaId = Number(linhaPesquisa.id);

  const perguntasGravadas = await inserirLote(
    cliente,
    'rh_clima.pergunta_pesquisa',
    ['pesquisa_id', 'ordem', 'enunciado', 'tipo', 'opcoes', 'obrigatoria'],
    pesquisa.perguntas.map((pergunta) => [
      pesquisaId,
      pergunta.ordem,
      pergunta.enunciado,
      pergunta.tipo,
      pergunta.opcoes ? JSON.stringify(pergunta.opcoes) : null,
      pergunta.obrigatoria,
    ]),
    'id, ordem'
  );
  const perguntaIdPorOrdem = new Map(
    perguntasGravadas.map((linha) => [Number(linha.ordem), Number(linha.id)])
  );

  await cliente.query(
    "UPDATE rh_clima.pesquisa SET status = 'aberta', aberta_em = $2 WHERE id = $1",
    [pesquisaId, pesquisa.abertaEm]
  );

  return { pesquisaId, perguntaIdPorOrdem };
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  const rng = aleatorio(SEMENTE);

  // ---------------------------------------------------------- idempotência
  // 'encerrada' é imutável e pesquisa aberta não pode ser excluída (triggers da
  // 0022): a limpeza do próprio módulo precisa dos triggers de aplicação
  // desligados, como faz 11-metas com meta_indicador_versao.
  const TABELAS = [
    'rh_clima.plano_acao',
    'rh_clima.resposta_pesquisa',
    'rh_clima.participacao_pesquisa',
    'rh_clima.pergunta_pesquisa',
    'rh_clima.pesquisa',
  ];
  const apagados = await comTriggersDesligados(cliente, TABELAS, async () => {
    const resultados = await cliente.query(
      TABELAS.map((tabela) => `DELETE FROM ${tabela}`).join('; ')
    );
    const lista = Array.isArray(resultados) ? resultados : [resultados];
    return lista.reduce((soma, resultado) => soma + (resultado?.rowCount ?? 0), 0);
  });
  if (apagados > 0) log(`13-pesquisas: ${apagados} linha(s) de pesquisa anterior removida(s).`);

  const rh = await usuarioPorEmail(cliente, EMAIL_RH);
  const dp = await usuarioPorEmail(cliente, EMAIL_DP);

  // ---------------------------------------------------------- pesquisa anual (ENCERRADA)
  // Janela recente de propósito: quanto mais antiga a pesquisa, menos gente do
  // quadro atual era elegível a respondê-la (e o recorte por unidade começa a
  // cair abaixo do k-anonimato). Dois meses atrás mantém o elenco inteiro
  // elegível e continua sendo passado consolidado.
  const aberturaAnual = mesesAtras(2);
  const fimAnual = new Date(aberturaAnual);
  fimAnual.setUTCDate(fimAnual.getUTCDate() + 14);
  const encerramentoAnual = new Date(fimAnual);
  encerramentoAnual.setUTCDate(encerramentoAnual.getUTCDate() + 2);
  const criacaoAnual = new Date(aberturaAnual);
  criacaoAnual.setUTCDate(criacaoAnual.getUTCDate() - 3);
  const TITULO_ANUAL = `Pesquisa de Clima Fast ${aberturaAnual.getUTCFullYear()}`;

  const anual = await plantarPesquisa(cliente, {
    titulo: TITULO_ANUAL,
    tipo: 'anual',
    descricao:
      'Pesquisa anual de clima organizacional das cinco unidades. Resposta ANÔNIMA: ' +
      'as respostas não guardam vínculo com quem respondeu, e o resultado só é ' +
      'divulgado em recortes com no mínimo 5 respostas.',
    inicio: iso(aberturaAnual),
    fim: iso(fimAnual),
    criadaPor: rh.id,
    criadaEm: isoInstante(criacaoAnual),
    abertaEm: isoInstante(aberturaAnual),
    perguntas: PERGUNTAS_ANUAL,
  });

  // Sem exclusão de persona aqui: a pesquisa anual JÁ fechou, e é natural (e
  // melhor para a demo) que a diretora, o RH e o gestor tenham respondido.
  const elegiveisAnual = await elegiveis(cliente, iso(aberturaAnual), []);
  const { escolhidos: respondentesAnual, resumo: resumoAnual } = escolherRespondentes(
    elegiveisAnual,
    TETO_RESPONDENTES,
    MINIMO_AMOSTRA
  );

  // Respostas. `criada_em` truncada no DIA e vários respondentes por dia: é o
  // que impede alinhar resposta e participação para descobrir autoria.
  const DIAS_DE_CAMPO = 8;
  const respostasAnual = [];
  const participacoesAnual = [];
  const perguntasEscalaAnual = PERGUNTAS_ANUAL.filter((p) => p.tipo === 'escala_1_5');
  const perguntaNps = PERGUNTAS_ANUAL.find((p) => p.tipo === 'nps_0_10');
  const perguntaEscolha = PERGUNTAS_ANUAL.find((p) => p.tipo === 'escolha_unica');
  const perguntaTexto = PERGUNTAS_ANUAL.find((p) => p.tipo === 'texto_livre');
  const usadosPorTom = { positivo: 0, neutro: 0, critico: 0 };
  const posicaoNaUnidade = new Map();

  respondentesAnual.forEach((pessoa, indice) => {
    const pool = POOL_NPS[pessoa.unidade];
    if (!pool) throw new Error(`Sem POOL_NPS para a unidade "${pessoa.unidade}".`);
    const posicao = posicaoNaUnidade.get(pessoa.unidade) ?? 0;
    posicaoNaUnidade.set(pessoa.unidade, posicao + 1);
    const notaNps = pool[posicao % pool.length];

    const dia = new Date(aberturaAnual);
    dia.setUTCDate(dia.getUTCDate() + 1 + (indice % DIAS_DE_CAMPO));
    // Data SEM hora: o Postgres a interpreta como meia-noite do fuso da sessão,
    // que é exatamente o que date_trunc('day', …) devolveria — assim a coluna
    // fica truncada no dia em qualquer fuso, como a 0022 exige por anonimato.
    const diaTruncado = iso(dia);
    // A participação carrega hora (é o carimbo de "respondeu"), mas divide o dia
    // com vários outros respondentes — a hora sozinha não liga a nada.
    const instanteParticipacao = new Date(dia);
    instanteParticipacao.setUTCHours(11 + (indice % 8), (indice * 7) % 60, 0, 0);

    participacoesAnual.push([
      anual.pesquisaId,
      pessoa.id,
      isoInstante(instanteParticipacao),
    ]);

    respostasAnual.push([
      anual.pesquisaId,
      anual.perguntaIdPorOrdem.get(perguntaNps.ordem),
      notaNps,
      null,
      pessoa.estabelecimentoId,
      diaTruncado,
    ]);

    for (const pergunta of perguntasEscalaAnual) {
      // A Filial Leste tem um agravo adicional em "feedback do líder": é a dor
      // específica que o plano de ação daquela unidade ataca.
      const agravo =
        pessoa.unidade === 'Filial Leste' && pergunta.ordem === 3 ? -1 : 0;
      respostasAnual.push([
        anual.pesquisaId,
        anual.perguntaIdPorOrdem.get(pergunta.ordem),
        notaEscala(notaNps, pergunta.peso + agravo, indice),
        null,
        pessoa.estabelecimentoId,
        diaTruncado,
      ]);
    }

    respostasAnual.push([
      anual.pesquisaId,
      anual.perguntaIdPorOrdem.get(perguntaEscolha.ordem),
      null,
      PESO_ESCOLHA[indice % PESO_ESCOLHA.length],
      pessoa.estabelecimentoId,
      diaTruncado,
    ]);

    // Texto livre é opcional: só ~1 em cada 4 escreve, como na vida real.
    if (indice % 4 === 0) {
      const tom = tomDoComentario(notaNps);
      const lista = COMENTARIOS[tom];
      const texto = lista[usadosPorTom[tom] % lista.length];
      usadosPorTom[tom] += 1;
      respostasAnual.push([
        anual.pesquisaId,
        anual.perguntaIdPorOrdem.get(perguntaTexto.ordem),
        null,
        texto,
        pessoa.estabelecimentoId,
        diaTruncado,
      ]);
    }
  });

  const COLUNAS_RESPOSTA = [
    'pesquisa_id',
    'pergunta_id',
    'valor_numerico',
    'valor_texto',
    'unidade_id',
    'criada_em',
  ];
  // Embaralhar antes de inserir: ids sequenciais por pessoa seriam, eles
  // mesmos, um vínculo resposta→respondente.
  await inserirLote(
    cliente,
    'rh_clima.resposta_pesquisa',
    COLUNAS_RESPOSTA,
    embaralhar(rng, respostasAnual)
  );
  await inserirLote(
    cliente,
    'rh_clima.participacao_pesquisa',
    ['pesquisa_id', 'colaborador_id', 'respondida_em'],
    participacoesAnual
  );

  await cliente.query(
    "UPDATE rh_clima.pesquisa SET status = 'encerrada', encerrada_em = $2 WHERE id = $1",
    [anual.pesquisaId, isoInstante(encerramentoAnual)]
  );

  // ---------------------------------------------------------- pulse (ABERTO)
  const aberturaPulse = dataRelativa(-4);
  const fimPulse = dataRelativa(10);
  const pulse = await plantarPesquisa(cliente, {
    titulo: 'Pulse da quinzena — carga de trabalho e reconhecimento',
    tipo: 'pulse',
    descricao:
      'Três perguntas, menos de um minuto. Anônima: o resultado sai só em agregado ' +
      'com no mínimo 5 respostas.',
    inicio: iso(aberturaPulse),
    fim: iso(fimPulse),
    criadaPor: rh.id,
    criadaEm: isoInstante(dataRelativa(-5)),
    abertaEm: isoInstante(aberturaPulse),
    perguntas: PERGUNTAS_PULSE,
  });

  const elegiveisPulse = await elegiveis(cliente, iso(aberturaPulse), PERSONAS);
  const { escolhidos: respondentesPulse, resumo: resumoPulse } = escolherRespondentes(
    elegiveisPulse,
    Object.fromEntries(Object.keys(TETO_RESPONDENTES).map((unidade) => [unidade, TETO_PULSE])),
    null // pulse recém-aberto: recorte pequeno é o ESPERADO e vira supressão
  );

  const respostasPulse = [];
  const participacoesPulse = [];
  respondentesPulse.forEach((pessoa, indice) => {
    const pool = POOL_NPS[pessoa.unidade];
    const notaNps = pool[indice % pool.length];
    const dia = dataRelativa(-3 + (indice % 3));
    const instante = new Date(dia);
    instante.setUTCHours(9 + (indice % 9), (indice * 13) % 60, 0, 0);

    participacoesPulse.push([pulse.pesquisaId, pessoa.id, isoInstante(instante)]);
    for (const pergunta of PERGUNTAS_PULSE.filter((p) => p.tipo === 'escala_1_5')) {
      respostasPulse.push([
        pulse.pesquisaId,
        pulse.perguntaIdPorOrdem.get(pergunta.ordem),
        notaEscala(notaNps, pergunta.peso, indice),
        null,
        pessoa.estabelecimentoId,
        iso(dia),
      ]);
    }
    if (indice % 5 === 0) {
      const tom = tomDoComentario(notaNps);
      respostasPulse.push([
        pulse.pesquisaId,
        pulse.perguntaIdPorOrdem.get(3),
        null,
        COMENTARIOS[tom][indice % COMENTARIOS[tom].length],
        pessoa.estabelecimentoId,
        iso(dia),
      ]);
    }
  });

  await inserirLote(
    cliente,
    'rh_clima.resposta_pesquisa',
    COLUNAS_RESPOSTA,
    embaralhar(rng, respostasPulse)
  );
  await inserirLote(
    cliente,
    'rh_clima.participacao_pesquisa',
    ['pesquisa_id', 'colaborador_id', 'respondida_em'],
    participacoesPulse
  );

  // ---------------------------------------------------------- planos de ação
  // Cada plano responde a um resultado medido, e é isso que se mostra ao RH:
  // o plano não é uma boa intenção solta, é a resposta a um número.
  const { rows: unidades } = await cliente.query(
    "SELECT estabelecimento_id, unidade FROM rh.estabelecimento_versao WHERE status = 'ativa'"
  );
  const idPorUnidade = new Map(
    unidades.map((linha) => [linha.unidade, Number(linha.estabelecimento_id)])
  );

  // Responsável do plano da unidade: o gerente DA unidade (papel gestor,
  // `pesquisa.plano.gerir` restrito à própria unidade pelo serviço).
  const { rows: gerentes } = await cliente.query(
    `SELECT u.id
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       JOIN rh.lotacao l ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE c.status = 'ativo' AND u.papel = 'gestor' AND ev.unidade = 'Filial Leste'
      ORDER BY c.matricula
      LIMIT 1`
  );
  if (gerentes.length === 0) {
    throw new Error('Nenhum gestor ativo na Filial Leste — 01-base mudou o elenco.');
  }
  const gerenteLeste = Number(gerentes[0].id);

  await inserirLote(
    cliente,
    'rh_clima.plano_acao',
    [
      'pesquisa_id', 'unidade_id', 'titulo', 'descricao', 'responsavel_usuario',
      'prazo', 'status', 'criado_por_usuario', 'criado_em', 'concluido_em',
    ],
    [
      [
        anual.pesquisaId,
        idPorUnidade.get('Filial Leste'),
        'Ritual de feedback quinzenal na Filial Leste',
        'A unidade ficou com o pior resultado da rede em "recebo feedback do meu líder" e o ' +
          'único eNPS negativo. Ação: agenda fixa de 20 minutos por liderado a cada quinze ' +
          'dias, com registro de feedback formal no sistema, e acompanhamento do RH no ' +
          'primeiro trimestre. Meta: sair do último lugar no próximo pulse.',
        gerenteLeste,
        iso(dataRelativa(45)),
        'em_andamento',
        rh.id,
        isoInstante(new Date(encerramentoAnual.getTime() + 3 * 86400000)),
        null,
      ],
      [
        anual.pesquisaId,
        null, // plano da EMPRESA (unidade NULL)
        'Inclusão do plano odontológico no pacote de benefícios',
        '"Benefícios (plano de saúde e odontológico)" foi a segunda opção mais escolhida na ' +
          'pesquisa, à frente de treinamento e ambiente físico. Ação: cotação com três ' +
          'operadoras, aprovação da diretoria e abertura de adesão para toda a rede. ' +
          'CONCLUÍDO: benefício disponível no catálogo, com adesão aberta.',
        dp.id,
        iso(dataRelativa(-20)),
        'concluido',
        rh.id,
        isoInstante(new Date(encerramentoAnual.getTime() + 5 * 86400000)),
        isoInstante(dataRelativa(-24)),
      ],
    ]
  );

  // ---------------------------------------------------------- conferências duras
  const escalar = async (sql, parametros) => {
    const { rows } = await cliente.query(sql, parametros);
    return Number(rows[0].total);
  };
  const conferir = async (rotulo, sql, esperado, parametros) => {
    const obtido = await escalar(sql, parametros);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await conferir(
    'participações da anual',
    'SELECT count(*)::int AS total FROM rh_clima.participacao_pesquisa WHERE pesquisa_id = $1',
    respondentesAnual.length,
    [anual.pesquisaId]
  );
  await conferir(
    'respostas da anual',
    'SELECT count(*)::int AS total FROM rh_clima.resposta_pesquisa WHERE pesquisa_id = $1',
    respostasAnual.length,
    [anual.pesquisaId]
  );
  await conferir(
    'respostas com carimbo de hora (anonimato exige dia truncado)',
    `SELECT count(*)::int AS total FROM rh_clima.resposta_pesquisa
      WHERE criada_em <> date_trunc('day', criada_em)`,
    0
  );
  await conferir(
    'dia de campo com um único respondente (dia isolado reidentifica)',
    `SELECT count(*)::int AS total FROM (
       SELECT date_trunc('day', respondida_em) AS dia
         FROM rh_clima.participacao_pesquisa
        WHERE pesquisa_id = $1
        GROUP BY 1 HAVING count(*) < 2
     ) AS isolados`,
    0,
    [anual.pesquisaId]
  );
  await conferir(
    'persona já participante do pulse (precisa poder responder ao vivo)',
    `SELECT count(*)::int AS total
       FROM rh_clima.participacao_pesquisa p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE p.pesquisa_id = $1 AND u.email = ANY($2)`,
    0,
    [pulse.pesquisaId, PERSONAS]
  );
  await conferir(
    'participação de quem foi admitido depois da abertura da pesquisa',
    `SELECT count(*)::int AS total
       FROM rh_clima.participacao_pesquisa p
       JOIN rh_clima.pesquisa q ON q.id = p.pesquisa_id
       JOIN rh.colaborador c ON c.id = p.colaborador_id
      WHERE c.data_admissao > q.inicio`,
    0
  );
  await conferir(
    'planos de ação',
    'SELECT count(*)::int AS total FROM rh_clima.plano_acao',
    2
  );

  // O resultado tem de contar a história certa — senão a apresentação mostra
  // dois planos de ação sem causa medida.
  const { rows: [enps] } = await cliente.query(
    `SELECT count(*)::int AS respostas,
            count(*) FILTER (WHERE r.valor_numerico >= 9)::int AS promotores,
            count(*) FILTER (WHERE r.valor_numerico <= 6)::int AS detratores
       FROM rh_clima.resposta_pesquisa r
       JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
      WHERE r.pesquisa_id = $1 AND q.tipo = 'nps_0_10'`,
    [anual.pesquisaId]
  );
  const valorEnps =
    Math.round(((enps.promotores - enps.detratores) / enps.respostas) * 1000) / 10;
  if (valorEnps < FAIXA_ENPS[0] || valorEnps > FAIXA_ENPS[1]) {
    throw new Error(
      `eNPS da demo saiu ${valorEnps} pontos, fora da faixa ${FAIXA_ENPS.join('–')} em que a ` +
        'história (rede razoável, uma unidade em crise, dois planos de ação) faz sentido.'
    );
  }

  const ativos = await escalar("SELECT count(*)::int AS total FROM rh.colaborador WHERE status = 'ativo'");
  const adesao = Math.round((respondentesAnual.length / ativos) * 1000) / 10;
  if (adesao < FAIXA_ADESAO[0] || adesao > FAIXA_ADESAO[1]) {
    throw new Error(
      `Adesão da demo saiu ${adesao}%, fora da faixa ${FAIXA_ADESAO.join('–')}%.`
    );
  }

  const { rows: [escala] } = await cliente.query(
    `SELECT round(avg(r.valor_numerico)::numeric, 2)::float8 AS media
       FROM rh_clima.resposta_pesquisa r
       JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
      WHERE r.pesquisa_id = $1 AND q.tipo = 'escala_1_5'`,
    [anual.pesquisaId]
  );
  if (escala.media < FAIXA_MEDIA_ESCALA[0] || escala.media > FAIXA_MEDIA_ESCALA[1]) {
    throw new Error(
      `Média de escala saiu ${escala.media}, fora da faixa ${FAIXA_MEDIA_ESCALA.join('–')}.`
    );
  }

  // ---------------------------------------------------------- resumo
  log(
    `13-pesquisas: anual ENCERRADA "${TITULO_ANUAL}" — ` +
      `${respondentesAnual.length} respondentes, ${respostasAnual.length} respostas, ` +
      `eNPS ${valorEnps} pontos (${enps.promotores} promotores, ${enps.detratores} detratores em ` +
      `${enps.respostas}), média de escala ${escala.media}, adesão ${adesao}% de ${ativos} ativos.`
  );
  log(`13-pesquisas: respondentes por unidade — ${resumoAnual.join(' · ')}`);
  const { rows: recortes } = await cliente.query(
    `SELECT COALESCE(ev.unidade, 'Sem unidade') AS unidade,
            count(*) FILTER (WHERE q.tipo = 'nps_0_10')::int AS nps,
            round(avg(r.valor_numerico) FILTER (WHERE q.tipo = 'escala_1_5')::numeric, 2)::float8 AS media
       FROM rh_clima.resposta_pesquisa r
       JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
       LEFT JOIN rh.estabelecimento_versao ev
              ON ev.estabelecimento_id = r.unidade_id AND ev.status = 'ativa'
      WHERE r.pesquisa_id = $1 AND r.valor_numerico IS NOT NULL
      GROUP BY 1 ORDER BY 3 DESC`,
    [anual.pesquisaId]
  );
  for (const recorte of recortes) {
    log(`    ${recorte.unidade.padEnd(15)} média ${recorte.media} (${recorte.nps} respostas de eNPS)`);
  }
  log(
    `13-pesquisas: pulse ABERTO até ${iso(fimPulse)} — ${respondentesPulse.length} respondentes ` +
      `(${resumoPulse.join(' · ')}); nenhuma persona respondeu ainda, de propósito.`
  );
  log('13-pesquisas: 2 planos de ação — 1 em andamento (Filial Leste), 1 concluído (empresa).');

  return {
    pesquisaAnualId: anual.pesquisaId,
    pesquisaPulseId: pulse.pesquisaId,
    enpsDemo: valorEnps,
  };
}

module.exports = { semear, PERGUNTAS_ANUAL, PERGUNTAS_PULSE, POOL_NPS };

if (require.main === module) {
  executarSozinho('13-pesquisas', semear);
}
