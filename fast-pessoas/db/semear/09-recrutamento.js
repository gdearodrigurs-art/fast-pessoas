// db/semear/09-recrutamento.js — Recrutamento e Seleção da demonstração.
//
// Empresa fictícia Fast (a mesma de todos os módulos): distribuidora de
// materiais de construção/drywall, 5 unidades. Este módulo enche as telas de
// R&S (docs/03-modulos/13, migration 0012, src/dominios/recrutamento):
//
//   • 5 requisições de vaga — 3 aprovadas, 1 solicitada (na fila do DP) e
//     1 reprovada com motivo registrado;
//   • 3 vagas com banda salarial CONGELADA da tabela vigente na criação:
//     Vendedor(a) na Filial Norte (fechada — foi preenchida), Estoquista na
//     Matriz (aberta, prazo-alvo ESTOURADO) e Analista Financeiro na Matriz
//     (aberta, dentro do prazo);
//   • 18 candidatos externos com consentimento LGPD (consentido_ate =
//     hoje + 6 meses) e origens variadas;
//   • 21 candidaturas espalhadas pelo kanban (6 em triagem, 5 em entrevista
//     com o RH, 3 em entrevista com o gestor, 2 em oferta, 4 encerradas com
//     motivo do catálogo e 1 aprovada) com o histórico completo de
//     movimentações append-only;
//   • 15 pareceres de seleção (RESTRITOS: só rs.parecer.ver enxerga tudo);
//   • 3 ofertas — 1 aceita (que virou a admissão de um colaborador real da
//     base), 1 enviada aguardando resposta e 1 fora da banda com aprovação
//     nominal registrada (demonstra a trava do fora-da-banda).
//
// Coerência com o resto da demo (consultada no banco, sem depender de ctx):
//   • a vaga fechada é o processo que ADMITIU um colaborador recém-admitido
//     do 01-base — mesmo nome, mesmo CPF, mesmo e-mail e salário igual ao da
//     posição vigente, exatamente o que o serviço faz em iniciarAdmissao();
//   • as reposições citam, na justificativa, o desligado que abriu a vaga.
//
// NÃO cria rh.processo_admissao: esse processo é de outro módulo e apagá-lo
// aqui atropelaria o trabalho dele. O elo com a admissão é o dado (pessoa,
// CPF, e-mail, salário), não uma FK — o schema não tem uma.
//
// Idempotente: apaga TODO o R&S (menos rh.etapa_selecao_versao, que é
// catálogo das migrations) e insere de novo. Rodar sozinho:
//   node --env-file=.env db/semear/09-recrutamento.js
 

const {
  aleatorio,
  arredondarDezena,
  comTriggersDesligados,
  cpfValido,
  executarSozinho,
  hoje,
  inserirLote,
  inteiro,
  iso,
  log,
  semAcento,
} = require('./comum');

const SEMENTE = 20260913; // fixa: mesma execução ⇒ mesmos candidatos e CPFs
const DOMINIO_CANDIDATO = 'exemplo.com.br'; // domínio de fachada: ninguém real
const MESES_CONSENTIMENTO = 6; // MESES_CONSENTIMENTO_PADRAO do domínio

// Tabelas com trigger de aplicação que barra DELETE (append-only).
const TABELAS_APPEND_ONLY = ['rh.movimentacao_candidatura', 'rh.parecer_selecao'];

// Ordem filho → pai das FKs de 0012 (etapa_selecao_versao é catálogo: fica).
const ORDEM_LIMPEZA = [
  'rh.oferta',
  'rh.parecer_selecao',
  'rh.movimentacao_candidatura',
  'rh.candidatura',
  'rh.candidato',
  'rh.vaga',
  'rh.requisicao_vaga',
];

// ------------------------------------------------------------------ datas

/** Data (meia-noite UTC) a `dias` no passado. */
function diasAtras(dias) {
  const data = hoje();
  data.setUTCDate(data.getUTCDate() - dias);
  return data;
}

/**
 * Instante em horário comercial `dias` atrás — 13h–20h UTC ≈ 10h–17h em
 * São Paulo, que é como o app carimba movimentação feita no expediente.
 */
function instante(dias, rng) {
  const data = diasAtras(dias);
  data.setUTCHours(inteiro(rng, 13, 20), inteiro(rng, 0, 59), inteiro(rng, 0, 59), 0);
  return data.toISOString();
}

/** Soma meses sem "vazar" o mês (31/03 + 6 → 30/09). */
function somarMeses(data, meses) {
  const dia = data.getUTCDate();
  const alvo = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + meses, 1));
  const ultimo = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return alvo;
}

/** dd/mm/aaaa — para os textos em português das justificativas. */
function dataBr(data) {
  const [ano, mes, dia] = iso(data).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Distância em dias entre hoje e uma data no passado (positiva). */
function distanciaEmDias(dataIso) {
  const alvo = new Date(`${dataIso}T00:00:00Z`);
  return Math.round((hoje().getTime() - alvo.getTime()) / 86400000);
}

function dinheiro(valor) {
  return valor.toFixed(2);
}

function reais(valor) {
  return `R$ ${Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ------------------------------------------------------------------ leitura do banco

async function umaLinha(cliente, sql, parametros, oQue) {
  const { rows } = await cliente.query(sql, parametros);
  if (rows.length === 0) {
    throw new Error(`09-recrutamento: ${oQue} não encontrado — rode 01-base antes.`);
  }
  return rows[0];
}

/** Cargo vigente + faixa salarial vigente (a banda que a vaga congela). */
async function cargoComFaixa(cliente, nome) {
  const linha = await umaLinha(
    cliente,
    `SELECT cv.id AS cargo_versao_id, cv.nome,
            ts.faixa_min::text AS faixa_min, ts.faixa_max::text AS faixa_max
       FROM rh.cargo_versao cv
       LEFT JOIN rh.tabela_salarial_versao ts
              ON ts.cargo_id = cv.cargo_id AND ts.status = 'ativa'
      WHERE cv.nome = $1 AND cv.status = 'ativa'`,
    [nome],
    `cargo vigente "${nome}"`
  );
  if (linha.faixa_min === null) {
    throw new Error(`09-recrutamento: cargo "${nome}" sem faixa salarial vigente.`);
  }
  return linha;
}

async function unidadeAtiva(cliente, nome) {
  return umaLinha(
    cliente,
    `SELECT id, unidade FROM rh.estabelecimento_versao
      WHERE unidade = $1 AND status = 'ativa'`,
    [nome],
    `unidade ativa "${nome}"`
  );
}

/** Usuário da demo por papel, preferindo a persona de e-mail conhecido. */
async function usuarioPorPapel(cliente, papel, emailPreferido, pular = []) {
  return umaLinha(
    cliente,
    `SELECT u.id, u.nome FROM sistema.usuario u
      WHERE u.papel = $1 AND u.ativo AND u.email LIKE '%@fastdemo.local'
        AND NOT (u.id = ANY ($3::bigint[]))
      ORDER BY (u.email = $2) DESC, u.id
      LIMIT 1`,
    [papel, emailPreferido, pular],
    `usuário com papel ${papel}`
  );
}

const SQL_VIGENTE = `
    FROM rh.colaborador c
    JOIN sistema.usuario u ON u.id = c.usuario_id
    JOIN rh.posicao_colaborador p
      ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
    JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
    JOIN rh.lotacao l ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
    JOIN rh.estabelecimento_versao ev
      ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'`;

/** Gestor vigente da unidade (preferindo o Gerente de Loja). */
async function gestorDaUnidade(cliente, unidade) {
  const { rows } = await cliente.query(
    `SELECT u.id, u.nome, cv.nome AS cargo ${SQL_VIGENTE}
      WHERE c.status = 'ativo' AND u.papel = 'gestor' AND ev.unidade = $1
      ORDER BY (cv.nome = 'Gerente de Loja') DESC, c.id
      LIMIT 1`,
    [unidade]
  );
  if (rows.length > 0) return rows[0];
  // Unidade sem gestor próprio: cai para a persona de gestor da demo.
  return usuarioPorPapel(cliente, 'gestor', 'gestor@fastdemo.local');
}

/**
 * O colaborador recém-admitido que a vaga fechada contratou. É ele que dá
 * nome, CPF, e-mail e salário ao candidato aprovado — assim a demo mostra a
 * seleção terminando exatamente na pessoa que entrou na folha.
 */
async function contratadaRecente(cliente) {
  const { rows } = await cliente.query(
    `SELECT c.nome_completo, c.cpf, c.data_admissao::text AS data_admissao,
            u.email, p.salario::text AS salario,
            cv.nome AS cargo, ev.unidade ${SQL_VIGENTE}
      WHERE c.status = 'ativo'
        AND c.data_admissao >= (CURRENT_DATE - 150)
        AND cv.nome NOT IN ('Estagiário(a)', 'Jovem Aprendiz', 'Diretor(a) de Operações')
      ORDER BY (cv.nome = 'Vendedor(a)' AND ev.unidade = 'Filial Norte') DESC,
               (cv.nome = 'Vendedor(a)') DESC,
               c.data_admissao DESC, c.id
      LIMIT 1`
  );
  return rows[0] ?? null;
}

/** Desligado que justifica a reposição (o mais recente antes da data dada). */
async function desligadoAntesDe(cliente, cargo, unidade, limiteIso) {
  const { rows } = await cliente.query(
    `SELECT c.nome_completo, c.data_desligamento::text AS data_desligamento
       FROM rh.colaborador c
       JOIN rh.posicao_colaborador p ON p.colaborador_id = c.id
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
       JOIN rh.lotacao l ON l.colaborador_id = c.id
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE c.status = 'desligado' AND cv.nome = $1 AND ev.unidade = $2
        AND ($3::date IS NULL OR c.data_desligamento <= $3::date)
      ORDER BY c.data_desligamento DESC, c.id
      LIMIT 1`,
    [cargo, unidade, limiteIso]
  );
  return rows[0] ?? null;
}

// ------------------------------------------------------------------ candidatos

// 18 pessoas FICTÍCIAS. Nomes escolhidos para não colidir com os
// colaboradores do 01-base; e-mails em domínio de fachada.
const CANDIDATOS = [
  // perfil operacional (loja/estoque) — concorrem às vagas de Vendedor(a) e Estoquista
  { ref: 'contratada', origem: 'indicacao' }, // nome/CPF/e-mail vêm do colaborador admitido
  { ref: 'tiago', nome: 'Tiago Ramires Bezerra', origem: 'indicacao' },
  { ref: 'priscila', nome: 'Priscila Amorim Nogueira', origem: 'site' },
  { ref: 'elton', nome: 'Elton Ribeiro Paiva', origem: 'portal' },
  { ref: 'vanderlei', nome: 'Vanderlei Prado Assunção', origem: 'site' },
  { ref: 'simone', nome: 'Simone Rocha Bandeira', origem: 'indicacao' },
  { ref: 'fabio', nome: 'Fábio Antunes Peixoto', origem: 'portal' },
  { ref: 'natalia', nome: 'Natália Cerqueira Prado', origem: 'site' },
  { ref: 'rodrigo', nome: 'Rodrigo Menezes Bastos', origem: 'indicacao' },
  { ref: 'larissa', nome: 'Larissa Fagundes Teixeira', origem: 'portal' },
  { ref: 'everton', nome: 'Everton Nascimento Vilela', origem: 'site' },
  // perfil administrativo/financeiro — concorrem à vaga de Analista Financeiro
  { ref: 'camila', nome: 'Camila Prudente Rangel', origem: 'site' },
  { ref: 'leandro', nome: 'Leandro Vilela Antunes', origem: 'portal' },
  { ref: 'bianca', nome: 'Bianca Toledo Moraes', origem: 'indicacao' },
  { ref: 'rogerio', nome: 'Rogério Peixoto Lacerda', origem: 'site' },
  { ref: 'tatiane', nome: 'Tatiane Bastos Camilo', origem: 'portal' },
  { ref: 'fernando', nome: 'Fernando Aguiar Portela', origem: 'indicacao' },
  { ref: 'isabela', nome: 'Isabela Guedes Fontoura', origem: 'site' },
  { ref: 'wesley', nome: 'Wesley Coutinho Bragança', origem: 'outro' },
];

// ------------------------------------------------------------------ pipeline
//
// Cada candidatura declara a etapa em que PAROU, o desfecho e os dias (atrás)
// de cada movimentação. O código deriva a cadeia append-only: entrada na
// triagem → avanços etapa a etapa → desfecho. `dias` tem que ter exatamente
// 1 (entrada) + (ordem da etapa − 1) avanços + (1 se houver desfecho).
// `base` desloca a régua da vaga fechada, que é anterior à admissão real.

const ETAPAS = ['triagem', 'entrevista_rh', 'entrevista_gestor', 'oferta'];

const PIPELINE = [
  // ---- Vaga A — Vendedor(a) / Filial Norte (FECHADA: preencheu a posição)
  {
    vaga: 'A',
    ref: 'contratada',
    etapa: 'oferta',
    status: 'aprovada',
    base: true,
    dias: [45, 38, 30, 22, 9],
    obs: { 0: 'Indicação de colaborador da própria unidade.' },
  },
  {
    vaga: 'A',
    ref: 'tiago',
    etapa: 'entrevista_rh',
    status: 'reprovada',
    motivo: 'perfil',
    base: true,
    dias: [44, 36, 28],
    obs: { 2: 'Convidado a se recandidatar em vaga operacional.' },
  },
  {
    vaga: 'A',
    ref: 'priscila',
    etapa: 'entrevista_rh',
    status: 'desistiu',
    motivo: 'desistencia',
    base: true,
    dias: [43, 34, 25],
    obs: { 2: 'Aceitou proposta de outra empresa antes da entrevista.' },
  },

  // ---- Vaga B — Estoquista / Matriz Centro (ABERTA, prazo estourado)
  { vaga: 'B', ref: 'elton', etapa: 'triagem', status: 'ativa', dias: [6] },
  { vaga: 'B', ref: 'vanderlei', etapa: 'triagem', status: 'ativa', dias: [4] },
  {
    vaga: 'B',
    ref: 'priscila',
    etapa: 'triagem',
    status: 'ativa',
    dias: [2],
    obs: { 0: 'Retorno ao processo: já havia participado da seleção de vendas.' },
  },
  {
    vaga: 'B',
    ref: 'tiago',
    etapa: 'entrevista_rh',
    status: 'ativa',
    dias: [21, 14],
    obs: { 1: 'Perfil aderente a estoque: experiência com conferência e inventário.' },
  },
  { vaga: 'B', ref: 'simone', etapa: 'entrevista_rh', status: 'ativa', dias: [17, 11] },
  { vaga: 'B', ref: 'fabio', etapa: 'entrevista_rh', status: 'ativa', dias: [12, 5] },
  {
    vaga: 'B',
    ref: 'natalia',
    etapa: 'entrevista_gestor',
    status: 'ativa',
    dias: [45, 38, 30],
    obs: { 2: 'Encaminhada ao gerente da Matriz.' },
  },
  { vaga: 'B', ref: 'rodrigo', etapa: 'entrevista_gestor', status: 'ativa', dias: [40, 33, 24] },
  {
    vaga: 'B',
    ref: 'larissa',
    etapa: 'oferta',
    status: 'ativa',
    dias: [30, 23, 15, 8],
    obs: { 3: 'Aprovada nas duas entrevistas — proposta autorizada pelo RH.' },
  },
  {
    vaga: 'B',
    ref: 'everton',
    etapa: 'entrevista_rh',
    status: 'reprovada',
    motivo: 'salario',
    dias: [50, 43, 36],
  },

  // ---- Vaga C — Analista Financeiro / Matriz Centro (ABERTA, no prazo)
  { vaga: 'C', ref: 'camila', etapa: 'triagem', status: 'ativa', dias: [5] },
  { vaga: 'C', ref: 'leandro', etapa: 'triagem', status: 'ativa', dias: [3] },
  { vaga: 'C', ref: 'bianca', etapa: 'triagem', status: 'ativa', dias: [1] },
  { vaga: 'C', ref: 'rogerio', etapa: 'entrevista_rh', status: 'ativa', dias: [19, 12] },
  { vaga: 'C', ref: 'tatiane', etapa: 'entrevista_rh', status: 'ativa', dias: [15, 8] },
  { vaga: 'C', ref: 'fernando', etapa: 'entrevista_gestor', status: 'ativa', dias: [26, 19, 11] },
  {
    vaga: 'C',
    ref: 'isabela',
    etapa: 'oferta',
    status: 'ativa',
    dias: [33, 26, 18, 9],
    obs: { 3: 'Finalista do processo; proposta submetida à diretoria.' },
  },
  {
    vaga: 'C',
    ref: 'wesley',
    etapa: 'entrevista_gestor',
    status: 'reprovada',
    motivo: 'experiencia',
    dias: [31, 24, 16, 7],
  },
];

// Pareceres (RESTRITOS). `quem`: rhA | rhB | dp | gestor (o solicitante da vaga).
const PARECERES = [
  {
    vaga: 'A',
    ref: 'contratada',
    etapa: 'entrevista_gestor',
    quem: 'gestor',
    recomendacao: 'aprovar',
    base: true,
    dias: 25,
    texto:
      'Conhece o mix de drywall e perfis, já atendeu construtora e autônomo no balcão. Assume a carteira da unidade com pouca curva de aprendizado.',
  },
  {
    vaga: 'A',
    ref: 'tiago',
    etapa: 'entrevista_rh',
    quem: 'rhA',
    recomendacao: 'reprovar',
    base: true,
    dias: 30,
    texto:
      'Experiência concentrada em varejo alimentar; não demonstrou familiaridade com o mix técnico da loja nem com venda consultiva para obra.',
  },
  {
    vaga: 'B',
    ref: 'tiago',
    etapa: 'entrevista_rh',
    quem: 'rhA',
    recomendacao: 'duvida',
    dias: 12,
    texto:
      'Muito bem em organização de estoque e inventário, mas ainda inseguro com o sistema de conferência. Vale ouvir o gerente antes de decidir.',
  },
  {
    vaga: 'B',
    ref: 'simone',
    etapa: 'entrevista_rh',
    quem: 'rhB',
    recomendacao: 'aprovar',
    dias: 9,
    texto:
      'Cinco anos em almoxarifado de construtora, domina separação por ordem de carga. Disponibilidade imediata e pretensão dentro da banda.',
  },
  {
    vaga: 'B',
    ref: 'natalia',
    etapa: 'entrevista_rh',
    quem: 'rhA',
    recomendacao: 'aprovar',
    dias: 36,
    texto:
      'Organizada e objetiva; trouxe exemplos concretos de redução de divergência de inventário. Encaminhada ao gestor.',
  },
  {
    vaga: 'B',
    ref: 'natalia',
    etapa: 'entrevista_gestor',
    quem: 'gestor',
    recomendacao: 'aprovar',
    dias: 27,
    texto:
      'Entende de recebimento de carga fracionada e conferência cega. Encaixa no turno da manhã, que é onde temos o gargalo.',
  },
  {
    vaga: 'B',
    ref: 'rodrigo',
    etapa: 'entrevista_gestor',
    quem: 'gestor',
    recomendacao: 'duvida',
    dias: 21,
    texto:
      'Boa experiência operacional, mas nunca trabalhou com material de construção. Precisaria de acompanhamento nos dois primeiros meses.',
  },
  {
    vaga: 'B',
    ref: 'larissa',
    etapa: 'entrevista_rh',
    quem: 'rhA',
    recomendacao: 'aprovar',
    dias: 21,
    texto:
      'Perfil mais completo da fila: conferência, expedição e uso de coletor. Comunicação clara e histórico de permanência longa nos empregos.',
  },
  {
    vaga: 'B',
    ref: 'larissa',
    etapa: 'entrevista_gestor',
    quem: 'gestor',
    recomendacao: 'aprovar',
    dias: 12,
    texto:
      'Pode assumir o estoque da Matriz sem transição longa. Recomendo fechar a proposta ainda esta semana para não perder a candidata.',
  },
  {
    vaga: 'B',
    ref: 'everton',
    etapa: 'entrevista_rh',
    quem: 'rhA',
    recomendacao: 'reprovar',
    dias: 39,
    texto:
      'Tecnicamente adequado, mas a pretensão informada fica acima do teto da banda do cargo e não há margem de negociação nesta vaga.',
  },
  {
    vaga: 'C',
    ref: 'rogerio',
    etapa: 'entrevista_rh',
    quem: 'rhB',
    recomendacao: 'aprovar',
    dias: 10,
    texto:
      'Rotina completa de contas a pagar e conciliação bancária em distribuidora do mesmo porte. Segue para a entrevista com o gestor.',
  },
  {
    vaga: 'C',
    ref: 'fernando',
    etapa: 'entrevista_gestor',
    quem: 'gestor',
    recomendacao: 'duvida',
    dias: 9,
    texto:
      'Sólido em conciliação, mas raso em fechamento fiscal, que é metade da rotina aqui. Depende de comparação com os outros finalistas.',
  },
  {
    vaga: 'C',
    ref: 'isabela',
    etapa: 'entrevista_rh',
    quem: 'rhA',
    recomendacao: 'aprovar',
    dias: 24,
    texto:
      'Fechamento mensal, apuração de impostos e rotina de crédito para cliente de obra. Referências profissionais confirmadas.',
  },
  {
    vaga: 'C',
    ref: 'isabela',
    etapa: 'entrevista_gestor',
    quem: 'gestor',
    recomendacao: 'aprovar',
    dias: 16,
    texto:
      'É a candidata que assume o fechamento sem apoio externo. Pretensão acima da banda — levar a decisão do valor para a diretoria.',
  },
  {
    vaga: 'C',
    ref: 'wesley',
    etapa: 'entrevista_gestor',
    quem: 'dp',
    recomendacao: 'reprovar',
    dias: 10,
    texto:
      'Nunca conduziu fechamento mensal sozinho e não teve contato com apuração fiscal. A vaga não comporta essa curva de formação agora.',
  },
];

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  const rng = aleatorio(SEMENTE);

  // ---------------------------------------------------------- limpeza (idempotência)
  await comTriggersDesligados(cliente, TABELAS_APPEND_ONLY, async () => {
    await cliente.query(ORDEM_LIMPEZA.map((tabela) => `DELETE FROM ${tabela}`).join('; '));
  });

  // ---------------------------------------------------------- referências no banco
  const etapaId = new Map();
  const { rows: etapasAtivas } = await cliente.query(
    `SELECT tipo, id, ordem, nome FROM rh.etapa_selecao_versao
      WHERE status = 'ativa' ORDER BY ordem`
  );
  for (const etapa of etapasAtivas) etapaId.set(etapa.tipo, etapa.id);
  for (const tipo of ETAPAS) {
    if (!etapaId.has(tipo)) {
      throw new Error(
        `09-recrutamento: etapa "${tipo}" não está ativa em rh.etapa_selecao_versao (catálogo da migration 0012).`
      );
    }
  }

  const diretoria = await usuarioPorPapel(cliente, 'diretoria', 'diretora.pessoas@fastdemo.local');
  const dp = await usuarioPorPapel(cliente, 'dp', 'dp@fastdemo.local');
  const rhA = await usuarioPorPapel(cliente, 'rh', 'rh@fastdemo.local');
  // Segundo analista de RH (dá variedade nos pareceres); se a demo só tiver
  // um, o próprio rhA assina tudo.
  const rhB = await usuarioPorPapel(cliente, 'rh', 'rh@fastdemo.local', [rhA.id]).catch(
    () => rhA
  );

  const contratada = await contratadaRecente(cliente);
  if (!contratada) {
    throw new Error(
      '09-recrutamento: nenhum colaborador admitido nos últimos 150 dias — rode 01-base antes.'
    );
  }
  const admDias = distanciaEmDias(contratada.data_admissao);

  // A vaga fechada é a do cargo/unidade de quem foi efetivamente admitido.
  const cargoA = await cargoComFaixa(cliente, contratada.cargo);
  const unidadeA = await unidadeAtiva(cliente, contratada.unidade);
  const gestorA = await gestorDaUnidade(cliente, contratada.unidade);

  const cargoB = await cargoComFaixa(cliente, 'Estoquista');
  const unidadeB = await unidadeAtiva(cliente, 'Matriz Centro');
  const gestorB = await gestorDaUnidade(cliente, 'Matriz Centro');

  const cargoC = await cargoComFaixa(cliente, 'Analista Financeiro');
  const unidadeC = unidadeB;
  const gestorC = gestorB;

  const cargoD = await cargoComFaixa(cliente, 'Auxiliar Administrativo');
  const unidadeD = await unidadeAtiva(cliente, 'Filial Leste');
  const gestorD = await gestorDaUnidade(cliente, 'Filial Leste');

  // Desligados que justificam as reposições.
  const saidaAntiga = await desligadoAntesDe(
    cliente,
    contratada.cargo,
    contratada.unidade,
    iso(diasAtras(admDias + 40))
  );
  const saidaRecente = await desligadoAntesDe(cliente, 'Vendedor(a)', 'Filial Norte', null);
  const unidadeSaidaRecente = await unidadeAtiva(cliente, 'Filial Norte');
  const cargoSaidaRecente = await cargoComFaixa(cliente, 'Vendedor(a)');
  const gestorSaidaRecente = await gestorDaUnidade(cliente, 'Filial Norte');

  const textoReposicao = (saida, cargo, unidade) =>
    saida
      ? `Reposição da saída de ${saida.nome_completo} (${cargo} — ${unidade}) em ${dataBr(new Date(`${saida.data_desligamento}T00:00:00Z`))}. A unidade está operando com um a menos e o volume de balcão não caiu.`
      : `Reposição de posição vaga de ${cargo} na ${unidade}: a equipe está operando com um a menos e o volume de atendimento não caiu.`;

  // ---------------------------------------------------------- requisições de vaga
  const requisicoes = [
    {
      ref: 'A',
      cargo_versao_id: cargoA.cargo_versao_id,
      estabelecimento_versao_id: unidadeA.id,
      motivo: 'reposicao',
      justificativa: textoReposicao(saidaAntiga, contratada.cargo, contratada.unidade),
      solicitante: gestorA.id,
      status: 'aprovada',
      decisor: diretoria.id,
      criadoDias: admDias + 54,
      decididoDias: admDias + 51,
      motivo_decisao:
        'Aprovada como reposição, sem aumento de quadro. Prioridade alta: a unidade está descoberta no turno de maior movimento.',
    },
    {
      ref: 'B',
      cargo_versao_id: cargoB.cargo_versao_id,
      estabelecimento_versao_id: unidadeB.id,
      motivo: 'aumento_quadro',
      justificativa:
        'Aumento de quadro no estoque da Matriz Centro: o volume de drywall e perfis subiu com os contratos de obra e a conferência de recebimento está acumulando para o turno seguinte. Um estoquista a mais elimina o atraso na separação das cargas.',
      solicitante: gestorB.id,
      status: 'aprovada',
      decisor: dp.id,
      criadoDias: 76,
      decididoDias: 74,
      motivo_decisao:
        'Aprovado o aumento de uma posição para o estoque da Matriz, com orçamento na banda vigente do cargo.',
    },
    {
      ref: 'C',
      cargo_versao_id: cargoC.cargo_versao_id,
      estabelecimento_versao_id: unidadeC.id,
      motivo: 'reposicao',
      justificativa:
        'Reposição na área financeira da Matriz: com a saída do analista responsável pelo fechamento, a conciliação bancária e a apuração de impostos estão sendo cobertas em regime de acúmulo pelo administrativo.',
      solicitante: gestorC.id,
      status: 'aprovada',
      decisor: diretoria.id,
      criadoDias: 38,
      decididoDias: 36,
      motivo_decisao:
        'Aprovada a reposição. Contratar com prioridade para o fechamento do próximo trimestre não depender de acúmulo de função.',
    },
    {
      ref: 'D',
      cargo_versao_id: cargoSaidaRecente.cargo_versao_id,
      estabelecimento_versao_id: unidadeSaidaRecente.id,
      motivo: 'reposicao',
      justificativa: textoReposicao(saidaRecente, 'Vendedor(a)', 'Filial Norte'),
      solicitante: gestorSaidaRecente.id,
      status: 'solicitada',
      decisor: null,
      criadoDias: 9,
      decididoDias: null,
      motivo_decisao: null,
    },
    {
      ref: 'E',
      cargo_versao_id: cargoD.cargo_versao_id,
      estabelecimento_versao_id: unidadeD.id,
      motivo: 'aumento_quadro',
      justificativa:
        'Aumento de quadro no administrativo da Filial Leste para apoiar o faturamento e a emissão de notas nos dias de pico.',
      solicitante: gestorD.id,
      status: 'reprovada',
      decisor: diretoria.id,
      criadoDias: 27,
      decididoDias: 23,
      motivo_decisao:
        'Reprovada nesta rodada: o pico da Filial Leste é sazonal e o quadro atual absorve o volume com a redistribuição de rotina já combinada. Reavaliar na revisão de orçamento do próximo trimestre.',
    },
  ];

  const idsRequisicao = await inserirLote(
    cliente,
    'rh.requisicao_vaga',
    [
      'cargo_versao_id',
      'estabelecimento_versao_id',
      'motivo',
      'justificativa',
      'solicitante_usuario_id',
      'status',
      'decisor_usuario_id',
      'decidido_em',
      'motivo_decisao',
      'criado_em',
      'atualizado_em',
    ],
    requisicoes.map((r) => {
      const criado = instante(r.criadoDias, rng);
      const decidido = r.decididoDias === null ? null : instante(r.decididoDias, rng);
      return [
        r.cargo_versao_id,
        r.estabelecimento_versao_id,
        r.motivo,
        r.justificativa,
        r.solicitante,
        r.status,
        r.decisor,
        decidido,
        r.motivo_decisao,
        criado,
        decidido ?? criado,
      ];
    }),
    'id'
  );
  const requisicaoPorRef = new Map(
    requisicoes.map((r, indice) => [r.ref, idsRequisicao[indice].id])
  );

  // ---------------------------------------------------------- vagas (banda congelada)
  // faixa_min/faixa_max são SNAPSHOT da tabela salarial vigente na criação —
  // é o que o serviço copia; mudar a tabela depois não mexe na vaga.
  const fechamentoDias = admDias + 9; // aceite da oferta: 9 dias antes de entrar
  const vagas = [
    {
      ref: 'A',
      requisicao: 'A',
      titulo: `${contratada.cargo} — ${contratada.unidade}`,
      faixa_min: cargoA.faixa_min,
      faixa_max: cargoA.faixa_max,
      prazoDias: admDias, // prazo-alvo = data prevista de entrada
      status: 'fechada',
      criadoDias: admDias + 50,
      atualizadoDias: fechamentoDias, // carimbo do fechamento (indicador de prazo)
    },
    {
      ref: 'B',
      requisicao: 'B',
      titulo: 'Estoquista — Matriz Centro',
      faixa_min: cargoB.faixa_min,
      faixa_max: cargoB.faixa_max,
      prazoDias: 14, // ESTOUROU há 14 dias — vaga aberta e atrasada no painel
      status: 'aberta',
      criadoDias: 74,
      atualizadoDias: 74,
    },
    {
      ref: 'C',
      requisicao: 'C',
      titulo: 'Analista Financeiro — Matriz Centro',
      faixa_min: cargoC.faixa_min,
      faixa_max: cargoC.faixa_max,
      prazoDias: -24, // vence daqui a 24 dias
      status: 'aberta',
      criadoDias: 36,
      atualizadoDias: 36,
    },
  ];

  const idsVaga = await inserirLote(
    cliente,
    'rh.vaga',
    [
      'requisicao_id',
      'titulo',
      'faixa_min',
      'faixa_max',
      'prazo_alvo',
      'status',
      'criado_em',
      'atualizado_em',
    ],
    vagas.map((v) => [
      requisicaoPorRef.get(v.requisicao),
      v.titulo,
      v.faixa_min,
      v.faixa_max,
      iso(diasAtras(v.prazoDias)),
      v.status,
      instante(v.criadoDias, rng),
      instante(v.atualizadoDias, rng),
    ]),
    'id'
  );
  const vagaPorRef = new Map(vagas.map((v, indice) => [v.ref, idsVaga[indice].id]));
  const bandaPorRef = new Map(
    vagas.map((v) => [v.ref, { min: Number(v.faixa_min), max: Number(v.faixa_max) }])
  );

  // ---------------------------------------------------------- candidatos (titulares externos)
  const consentidoAte = iso(somarMeses(hoje(), MESES_CONSENTIMENTO));
  const cpfsUsados = new Set();
  const novoCpf = () => {
    let cpf = cpfValido(rng);
    while (cpfsUsados.has(cpf)) cpf = cpfValido(rng);
    cpfsUsados.add(cpf);
    return cpf;
  };
  const telefone = () =>
    `(${inteiro(rng, 11, 19)}) 9${inteiro(rng, 1000, 9999)}-${inteiro(rng, 1000, 9999)}`;

  const candidatos = CANDIDATOS.map((base) => {
    if (base.ref === 'contratada') {
      // Mesma pessoa do colaborador admitido: nome, CPF e e-mail idênticos —
      // é assim que o serviço cria o usuário a partir do candidato aprovado.
      return {
        ...base,
        nome: contratada.nome_completo,
        email: contratada.email,
        cpf: contratada.cpf,
        telefone: telefone(),
      };
    }
    const partes = base.nome.split(' ');
    const email = `${semAcento(partes[0])}.${semAcento(partes[partes.length - 1])}@${DOMINIO_CANDIDATO}`;
    return { ...base, email, cpf: novoCpf(), telefone: telefone() };
  });

  // Cadastro do candidato sempre alguns dias antes da candidatura mais antiga.
  const entradaMaisAntiga = new Map();
  for (const passo of PIPELINE) {
    const dias = passo.dias[0] + (passo.base ? admDias : 0);
    const atual = entradaMaisAntiga.get(passo.ref);
    if (atual === undefined || dias > atual) entradaMaisAntiga.set(passo.ref, dias);
  }

  const idsCandidato = await inserirLote(
    cliente,
    'rh.candidato',
    [
      'nome',
      'email',
      'telefone',
      'cpf',
      'origem',
      'consentimento_lgpd',
      'consentido_ate',
      'criado_em',
      'atualizado_em',
    ],
    candidatos.map((c) => {
      const cadastro = instante((entradaMaisAntiga.get(c.ref) ?? 30) + inteiro(rng, 1, 4), rng);
      return [
        c.nome,
        c.email,
        c.telefone,
        c.cpf,
        c.origem,
        true,
        consentidoAte,
        cadastro,
        cadastro,
      ];
    }),
    'id'
  );
  const candidatoPorRef = new Map(candidatos.map((c, indice) => [c.ref, idsCandidato[indice].id]));

  // ---------------------------------------------------------- candidaturas
  const ordemDe = (tipo) => ETAPAS.indexOf(tipo) + 1;
  const passosEsperados = (passo) =>
    1 + (ordemDe(passo.etapa) - 1) + (passo.status === 'ativa' ? 0 : 1);

  for (const passo of PIPELINE) {
    if (passo.dias.length !== passosEsperados(passo)) {
      throw new Error(
        `09-recrutamento: trilha inconsistente de ${passo.ref} na vaga ${passo.vaga} — ` +
          `${passo.dias.length} datas para ${passosEsperados(passo)} movimentações.`
      );
    }
  }

  // Instantes de cada movimentação, calculados uma única vez: a candidatura
  // (criado_em / atualizado_em) e o histórico têm que contar a MESMA história.
  const instantesPorPasso = PIPELINE.map((passo) =>
    passo.dias.map((dias) => instante(dias + (passo.base ? admDias : 0), rng))
  );

  const idsCandidatura = await inserirLote(
    cliente,
    'rh.candidatura',
    ['vaga_id', 'candidato_id', 'etapa_atual_id', 'status', 'criado_em', 'atualizado_em'],
    PIPELINE.map((passo, indice) => {
      const marcos = instantesPorPasso[indice];
      return [
        vagaPorRef.get(passo.vaga),
        candidatoPorRef.get(passo.ref),
        etapaId.get(passo.etapa),
        passo.status,
        marcos[0],
        marcos[marcos.length - 1],
      ];
    }),
    'id'
  );
  const candidaturaPorChave = new Map(
    PIPELINE.map((passo, indice) => [`${passo.vaga}:${passo.ref}`, idsCandidatura[indice].id])
  );

  // ---------------------------------------------------------- movimentações (append-only)
  // Cadeia igual à que o serviço grava: entrada (de_etapa NULL) → avanços
  // etapa a etapa → desfecho (para_etapa NULL + novo_status + motivo).
  const operadores = [rhA.id, rhA.id, rhB.id, dp.id]; // o RH toca o pipeline no dia a dia
  const movimentacoes = [];
  PIPELINE.forEach((passo, indice) => {
    const candidaturaId = idsCandidatura[indice].id;
    const marcos = instantesPorPasso[indice];
    const ordemFinal = ordemDe(passo.etapa);
    const obs = passo.obs ?? {};
    let cursor = 0;

    // entrada na primeira etapa
    movimentacoes.push([
      candidaturaId,
      null,
      etapaId.get(ETAPAS[0]),
      null,
      null,
      obs[cursor] ?? null,
      operadores[(indice + cursor) % operadores.length],
      marcos[cursor],
    ]);
    cursor += 1;

    // avanços etapa a etapa
    for (let ordem = 2; ordem <= ordemFinal; ordem += 1) {
      movimentacoes.push([
        candidaturaId,
        etapaId.get(ETAPAS[ordem - 2]),
        etapaId.get(ETAPAS[ordem - 1]),
        null,
        null,
        obs[cursor] ?? null,
        operadores[(indice + cursor) % operadores.length],
        marcos[cursor],
      ]);
      cursor += 1;
    }

    // desfecho (reprovada / desistiu / aprovada)
    if (passo.status !== 'ativa') {
      movimentacoes.push([
        candidaturaId,
        etapaId.get(passo.etapa),
        null,
        passo.status,
        passo.motivo ?? null,
        obs[cursor] ?? null,
        operadores[(indice + cursor) % operadores.length],
        marcos[cursor],
      ]);
    }
  });

  await inserirLote(
    cliente,
    'rh.movimentacao_candidatura',
    [
      'candidatura_id',
      'de_etapa_id',
      'para_etapa_id',
      'novo_status',
      'motivo_catalogo',
      'observacao',
      'por_usuario_id',
      'em',
    ],
    movimentacoes
  );

  // ---------------------------------------------------------- pareceres (RESTRITOS)
  const avaliadores = {
    rhA: rhA.id,
    rhB: rhB.id,
    dp: dp.id,
    A: gestorA.id,
    B: gestorB.id,
    C: gestorC.id,
  };
  await inserirLote(
    cliente,
    'rh.parecer_selecao',
    ['candidatura_id', 'etapa_id', 'avaliador_usuario_id', 'recomendacao', 'observacoes', 'em'],
    PARECERES.map((parecer) => {
      const candidaturaId = candidaturaPorChave.get(`${parecer.vaga}:${parecer.ref}`);
      if (!candidaturaId) {
        throw new Error(
          `09-recrutamento: parecer sem candidatura (${parecer.vaga}:${parecer.ref}).`
        );
      }
      const quem = parecer.quem === 'gestor' ? avaliadores[parecer.vaga] : avaliadores[parecer.quem];
      return [
        candidaturaId,
        etapaId.get(parecer.etapa),
        quem,
        parecer.recomendacao,
        parecer.texto,
        instante(parecer.dias + (parecer.base ? admDias : 0), rng),
      ];
    })
  );

  // ---------------------------------------------------------- ofertas
  const bandaA = bandaPorRef.get('A');
  const valorA = Number(contratada.salario);
  const dentroA = valorA >= bandaA.min && valorA <= bandaA.max;

  const bandaB = bandaPorRef.get('B');
  const valorB = arredondarDezena(bandaB.min + 0.55 * (bandaB.max - bandaB.min));

  const bandaC = bandaPorRef.get('C');
  const valorC = arredondarDezena(bandaC.max * 1.06); // acima do teto: exige aprovação
  const dataAprovacaoC = dataBr(diasAtras(4));

  const ofertas = [
    {
      // aceita → virou a admissão de quem hoje está na folha
      candidatura: 'A:contratada',
      valor: dinheiro(valorA),
      dentro_banda: dentroA,
      aprovacao: dentroA
        ? null
        : `Aprovado por ${diretoria.nome} (Diretoria de Operações) — contratação de reposição com salário acima da banda vigente.`,
      status: 'aceita',
      criadoDias: admDias + 16,
      respondidaDias: fechamentoDias,
    },
    {
      // enviada, aguardando resposta do candidato
      candidatura: 'B:larissa',
      valor: dinheiro(valorB),
      dentro_banda: true,
      aprovacao: null,
      status: 'enviada',
      criadoDias: 6,
      respondidaDias: null,
    },
    {
      // FORA da banda: só existe com aprovação nominal registrada antes do envio
      candidatura: 'C:isabela',
      valor: dinheiro(valorC),
      dentro_banda: false,
      aprovacao:
        `Aprovado por ${diretoria.nome} (Diretoria de Operações) em ${dataAprovacaoC}: proposta de ${reais(valorC)}, ` +
        `acima do teto de ${reais(bandaC.max)} da banda congelada da vaga. Justificativa: única finalista que assume o fechamento mensal ` +
        'sem apoio externo e já tem contraproposta do empregador atual. Revisão da tabela salarial do cargo entra na próxima rodada.',
      status: 'enviada',
      criadoDias: 3,
      respondidaDias: null,
    },
  ];

  await inserirLote(
    cliente,
    'rh.oferta',
    [
      'candidatura_id',
      'valor',
      'dentro_banda',
      'aprovacao_fora_banda',
      'status',
      'respondida_em',
      'criado_em',
      'atualizado_em',
    ],
    ofertas.map((oferta) => {
      const candidaturaId = candidaturaPorChave.get(oferta.candidatura);
      if (!candidaturaId) {
        throw new Error(`09-recrutamento: oferta sem candidatura (${oferta.candidatura}).`);
      }
      const criado = instante(oferta.criadoDias, rng);
      const respondida =
        oferta.respondidaDias === null ? null : instante(oferta.respondidaDias, rng);
      return [
        candidaturaId,
        oferta.valor,
        oferta.dentro_banda,
        oferta.aprovacao,
        oferta.status,
        respondida,
        criado,
        respondida ?? criado,
      ];
    })
  );

  // ---------------------------------------------------------- conferências
  const conferir = async (rotulo, sql, esperado) => {
    const { rows } = await cliente.query(sql);
    const obtido = rows[0].total;
    if (esperado !== undefined && obtido !== esperado) {
      throw new Error(`09-recrutamento: ${rotulo} — esperado ${esperado}, obtido ${obtido}.`);
    }
    log(`  ${rotulo.padEnd(44)} ${String(obtido).padStart(4)}`);
    return obtido;
  };

  log('\n09-recrutamento: o que ficou no banco');
  await conferir(
    'requisições (3 aprovadas, 1 na fila, 1 reprovada)',
    'SELECT count(*)::int AS total FROM rh.requisicao_vaga',
    5
  );
  await conferir(
    'vagas (2 abertas + 1 fechada)',
    'SELECT count(*)::int AS total FROM rh.vaga',
    3
  );
  await conferir(
    'candidatos com consentimento LGPD',
    'SELECT count(*)::int AS total FROM rh.candidato WHERE consentimento_lgpd AND consentido_ate IS NOT NULL',
    CANDIDATOS.length
  );
  await conferir(
    'candidaturas',
    'SELECT count(*)::int AS total FROM rh.candidatura',
    PIPELINE.length
  );
  await conferir(
    'movimentações (append-only)',
    'SELECT count(*)::int AS total FROM rh.movimentacao_candidatura',
    movimentacoes.length
  );
  await conferir(
    'pareceres de seleção (restritos)',
    'SELECT count(*)::int AS total FROM rh.parecer_selecao',
    PARECERES.length
  );
  await conferir('ofertas', 'SELECT count(*)::int AS total FROM rh.oferta', ofertas.length);

  // invariantes que as telas dependem
  await conferir(
    'candidaturas ativas fora do kanban (erro)',
    `SELECT count(*)::int AS total FROM rh.candidatura ca
       JOIN rh.etapa_selecao_versao e ON e.id = ca.etapa_atual_id
      WHERE e.status <> 'ativa'`,
    0
  );
  await conferir(
    'desfecho negativo sem motivo (erro)',
    `SELECT count(*)::int AS total FROM rh.movimentacao_candidatura
      WHERE novo_status IN ('reprovada','desistiu') AND motivo_catalogo IS NULL`,
    0
  );
  await conferir(
    'oferta fora da banda sem aprovação (erro)',
    'SELECT count(*)::int AS total FROM rh.oferta WHERE NOT dentro_banda AND aprovacao_fora_banda IS NULL',
    0
  );
  await conferir(
    'oferta fora da banda congelada da vaga',
    `SELECT count(*)::int AS total FROM rh.oferta o
       JOIN rh.candidatura ca ON ca.id = o.candidatura_id
       JOIN rh.vaga v ON v.id = ca.vaga_id
      WHERE (o.valor < v.faixa_min OR o.valor > v.faixa_max) AND o.dentro_banda`,
    0
  );
  await conferir(
    'candidatura aprovada sem oferta aceita (erro)',
    `SELECT count(*)::int AS total FROM rh.candidatura ca
      WHERE ca.status = 'aprovada'
        AND NOT EXISTS (SELECT 1 FROM rh.oferta o
                         WHERE o.candidatura_id = ca.id AND o.status = 'aceita')`,
    0
  );
  await conferir(
    'parecer em etapa que a candidatura não alcançou (erro)',
    `SELECT count(*)::int AS total FROM rh.parecer_selecao p
       JOIN rh.candidatura ca ON ca.id = p.candidatura_id
       JOIN rh.etapa_selecao_versao ep ON ep.id = p.etapa_id
       JOIN rh.etapa_selecao_versao ec ON ec.id = ca.etapa_atual_id
      WHERE ep.ordem > ec.ordem`,
    0
  );

  const { rows: kanban } = await cliente.query(
    `SELECT e.nome AS etapa, ca.status, count(*)::int AS total
       FROM rh.candidatura ca
       JOIN rh.etapa_selecao_versao e ON e.id = ca.etapa_atual_id
      GROUP BY e.ordem, e.nome, ca.status
      ORDER BY e.ordem, ca.status`
  );
  log('\n09-recrutamento: kanban por etapa × status');
  for (const linha of kanban) {
    log(`  ${`${linha.etapa} / ${linha.status}`.padEnd(44)} ${String(linha.total).padStart(4)}`);
  }

  const { rows: prazo } = await cliente.query(
    `SELECT COUNT(*) FILTER (
              WHERE (atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date <= prazo_alvo
            )::int AS no_prazo,
            COUNT(*)::int AS fechadas
       FROM rh.vaga
      WHERE status = 'fechada' AND atualizado_em >= now() - INTERVAL '12 months'`
  );
  log(
    `\n09-recrutamento: indicador de vagas no prazo — ${prazo[0].no_prazo}/${prazo[0].fechadas} fechadas dentro do prazo-alvo`
  );
  log(
    `09-recrutamento: oferta aceita ligada a ${contratada.nome_completo} (${contratada.cargo} — ${contratada.unidade}), admitido em ${dataBr(new Date(`${contratada.data_admissao}T00:00:00Z`))} por ${reais(valorA)}`
  );

  return {
    recrutamento: {
      requisicoes: requisicoes.length,
      vagas: vagas.length,
      candidatos: candidatos.length,
      candidaturas: PIPELINE.length,
      movimentacoes: movimentacoes.length,
      pareceres: PARECERES.length,
      ofertas: ofertas.length,
      contratada: contratada.nome_completo,
    },
  };
}

module.exports = { semear, CANDIDATOS, PIPELINE, PARECERES };

if (require.main === module) {
  executarSozinho('09-recrutamento', semear);
}
