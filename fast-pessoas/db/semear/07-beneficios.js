// db/semear/07-beneficios.js — BENEFÍCIOS da empresa fictícia Fast.
//
// Perfil (o mesmo em TODOS os módulos): Fast — distribuidora de materiais de
// construção/drywall, 5 unidades, ~60 ativos + 8 desligados.
//
// O que este módulo cria (migration 0009 + src/dominios/beneficios):
//   • catálogo de 6 benefícios, cada um com regra de elegibilidade VIGENTE
//     (duas delas com uma versão ENCERRADA antes, para a tela de versões ter
//     histórico de reajuste);
//   • adesões dos elegíveis (ativas, suspensas e canceladas), com valor e
//     desconto CONGELADOS na efetivação, como o app faz;
//   • adesões encerradas dos 8 desligados (fim = data de desligamento);
//   • 10 demandas do tipo `adesao_beneficio` — 5 PENDENTES na fila do DP
//     (incluindo uma atrasada), 4 concluídas que efetivaram/cancelaram adesão
//     e 1 recusada por inelegibilidade — com transições e comentários;
//   • ~25 dependentes (filhos, cônjuges e um caso "outro"), que alimentam o
//     valor do plano de saúde/odonto e a dedução de dependentes do IRRF.
//
// FRONTEIRA (0009): aqui mora o VÍNCULO e o INSUMO. O cálculo legal (teto de
// 6% do VT, PAT, incidências) é do motor rh_folha — este módulo só grava o que
// foi ACORDADO com o colaborador.
//
// Uso isolado: node --env-file=.env db/semear/07-beneficios.js
 

const {
  aleatorio,
  comTriggersDesligados,
  cpfValido,
  dataRelativa,
  embaralhar,
  escolher,
  executarSozinho,
  hoje,
  inserirLote,
  inteiro,
  iso,
  log,
} = require('./comum');

const SEMENTE = 20260907; // fixa: mesma execução ⇒ mesmos dados
const DOMINIO = 'fastdemo.local';
const CHAVE_TIPO_DEMANDA = 'adesao_beneficio'; // seed da migration 0009

// ------------------------------------------------------------------ catálogo
//
// `criterio` é o JSONB validado por esquemaCriterio (zod): lista ausente ou
// vazia = sem restrição naquela dimensão. Só usamos `tipos_vinculo` — a Fast
// oferece a mesma cesta nas cinco unidades.
//
// valor_padrao  = custo de referência da tabela vigente (o que a empresa banca)
// desconto_padrao = desconto em folha de referência; NULL quando depende da
//                 pessoa (VT é 6% do salário; farmácia é o consumo do mês).

const ANO = hoje().getUTCFullYear();
const INICIO_TABELA = `${ANO}-01-01`; // a tabela de benefícios é reajustada na virada do ano
const INICIO_TABELA_ANTERIOR = `${ANO - 2}-01-01`;
const FIM_TABELA_ANTERIOR = `${ANO - 1}-12-31`;

const BENEFICIOS = [
  {
    chave: 'vt',
    nome: 'Vale-Transporte',
    categoria: 'vt',
    criterio: { tipos_vinculo: ['clt'] },
    valorPadrao: 264.0, // 22 dias × 2 passagens × R$ 6,00
    descontoPadrao: null, // 6% do salário, limitado ao custo — caso a caso
    adesao: 0.68, // boa parte da equipe de loja vem de carro/moto
  },
  {
    chave: 'vr',
    nome: 'Vale-Refeição',
    categoria: 'vr_va',
    criterio: {}, // todos os vínculos
    valorPadrao: 660.0, // R$ 30,00 × 22 dias úteis
    descontoPadrao: 13.2, // coparticipação de 2% (PAT)
    adesao: 0.98,
    anterior: { valorPadrao: 594.0, descontoPadrao: 11.88 }, // R$ 27,00/dia
  },
  {
    chave: 'va',
    nome: 'Vale-Alimentação',
    categoria: 'vr_va',
    criterio: { tipos_vinculo: ['clt'] },
    valorPadrao: 350.0,
    descontoPadrao: 7.0, // 2%
    adesao: 0.95,
  },
  {
    chave: 'plano_saude',
    nome: 'Plano de Saúde',
    categoria: 'saude',
    criterio: { tipos_vinculo: ['clt'] },
    valorPadrao: 320.0, // faixa Enfermaria, titular
    descontoPadrao: 96.0, // coparticipação de 30%
    adesao: 0.76,
    anterior: { valorPadrao: 286.0, descontoPadrao: 85.8 },
  },
  {
    chave: 'plano_odonto',
    nome: 'Plano Odontológico',
    categoria: 'odonto',
    criterio: { tipos_vinculo: ['clt'] },
    valorPadrao: 42.0,
    descontoPadrao: 12.6, // 30%
    adesao: 0.71,
  },
  {
    chave: 'farmacia',
    nome: 'Convênio Farmácia',
    categoria: 'convenio',
    criterio: {}, // todos os vínculos
    valorPadrao: 200.0, // limite de crédito mensal na rede conveniada
    descontoPadrao: null, // desconto em folha pelo consumo do mês
    adesao: 0.86,
  },
];

// Plano de saúde por faixa de plano (a Fast contrata Apartamento para a
// liderança e o corporativo; Enfermaria para a operação de loja).
const CARGOS_PLANO_SUPERIOR = new Set([
  'Diretor(a) de Operações',
  'Gerente de Loja',
  'Supervisor(a) Comercial',
  'Comprador(a)',
  'Analista de RH',
  'Analista Financeiro',
]);
const FAIXAS_SAUDE = {
  apartamento: { titular: 520.0, dependente: 415.0 },
  enfermaria: { titular: 320.0, dependente: 255.0 },
};
const ODONTO = { titular: 42.0, dependente: 32.0 };
const COPARTICIPACAO = 0.3; // desconto em folha = 30% do custo do plano

// ------------------------------------------------------------------ dependentes

const NOMES_CRIANCA_F = [
  'Alice', 'Antonella', 'Aurora', 'Cecília', 'Clara', 'Elisa', 'Helena',
  'Isabela', 'Laura', 'Lívia', 'Maitê', 'Manuela', 'Nina', 'Sophia', 'Valentina',
];
const NOMES_CRIANCA_M = [
  'Arthur', 'Benício', 'Bernardo', 'Davi', 'Enzo', 'Gabriel', 'Heitor',
  'Joaquim', 'Lorenzo', 'Miguel', 'Noah', 'Pedro', 'Samuel', 'Theo', 'Vicente',
];
const NOMES_ADULTO_F = [
  'Andréa', 'Cláudia', 'Eliana', 'Josiane', 'Kelly', 'Marta', 'Patrícia',
  'Roberta', 'Silvia', 'Vera',
];
const NOMES_ADULTO_M = [
  'Adilson', 'Cássio', 'Emerson', 'Gilmar', 'Jefferson', 'Marcelo', 'Norberto',
  'Rogério', 'Sandro', 'Wilson',
];
const SOBRENOMES_CONJUGE = [
  'Amaral', 'Andrade', 'Bezerra', 'Brandão', 'Callado', 'Estrela', 'Godoy',
  'Ipiranga', 'Lacerda', 'Marinho', 'Novaes', 'Prado', 'Rangel', 'Sarmento',
  'Trindade', 'Ventura',
];

// ------------------------------------------------------------------ textos das solicitações

const OBSERVACOES_ADESAO = [
  'Passei a vir de ônibus para a unidade e preciso do benefício a partir do próximo mês.',
  'Minha filha nasceu em março e quero incluí-la no plano assim que possível.',
  'Saí do plano da empresa da minha esposa e gostaria de aderir ao plano da Fast.',
  'Nunca cheguei a aderir na admissão; agora quero começar a usar o benefício.',
  'Fiz uma avaliação odontológica particular e prefiro migrar para o convênio da empresa.',
];
const MOTIVOS_CANCELAMENTO = [
  'Comprei uma moto e não uso mais transporte público para vir trabalhar.',
  'Vou aderir ao plano da empresa do meu marido, que já cobre nossos filhos.',
  'Prefiro não manter o desconto em folha neste momento por questão de orçamento.',
];

// ------------------------------------------------------------------ utilidades locais

/** NUMERIC com 2 casas — o app lê em centavos na borda. */
function dinheiro(valor) {
  return Number(valor).toFixed(2);
}

/** Arredonda para centavos (evita 96.00000000000001 no NUMERIC). */
function centavos(valor) {
  return Math.round(valor * 100) / 100;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' (igual ao formatarData do serviço). */
function paraBr(dataIso) {
  return dataIso.split('-').reverse().join('/');
}

/** 'AAAA-MM-DD' → Date em UTC. */
function comoData(texto) {
  return new Date(`${texto}T00:00:00Z`);
}

/** Dias inteiros entre duas datas UTC. */
function dias(de, ate) {
  return Math.round((ate - de) / 86400000);
}

/** Instante ISO de uma data (meia-noite UTC) somado de horas — para timestamps. */
function instante(data, horas = 12) {
  const copia = new Date(data.getTime());
  copia.setUTCHours(horas, 0, 0, 0);
  return copia.toISOString();
}

/**
 * Réplica de montarDescricaoSolicitacao (src/dominios/beneficios/esquemas.ts).
 * O texto TEM que casar com PADRAO_SOLICITACAO — é dele que a tela lê a
 * natureza e a chave do benefício.
 */
function montarDescricao(natureza, nome, chave, complemento) {
  const prefixo =
    natureza === 'adesao' ? 'Adesão ao benefício' : 'Cancelamento do benefício';
  const base = `${prefixo} "${nome}" (chave: ${chave}).`;
  if (!complemento) return base;
  const rotulo = natureza === 'adesao' ? 'Observações' : 'Motivo';
  return `${base}\n\n${rotulo}: ${complemento}`;
}

/** Réplica de atendeCriterio (esquemas.ts) — a demo respeita a mesma regra. */
function atendeCriterio(criterio, pessoa) {
  if (
    criterio.tipos_vinculo &&
    criterio.tipos_vinculo.length > 0 &&
    !criterio.tipos_vinculo.includes(pessoa.tipo_vinculo)
  ) {
    return false;
  }
  if (criterio.unidades && criterio.unidades.length > 0) {
    if (pessoa.estabelecimento_id === null) return false;
    if (!criterio.unidades.includes(pessoa.estabelecimento_id)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ limpeza (idempotência)

/**
 * Apaga só o que ESTE módulo cria. Ordem filho → pai, seguindo as FKs de 0009
 * (rh.adesao → rh.demanda) e de 0003 (comentário/transição → demanda).
 *
 * As demandas do tipo `adesao_beneficio` pertencem a este módulo: é o tipo que
 * a própria migration 0009 semeou para o ciclo de vida da adesão. Demandas de
 * outros tipos (declaração de vínculo, ajuste de ponto…) não são tocadas.
 */
async function limpar(cliente) {
  const TABELAS = [
    'rh.evento_colaborador',        // append-only
    'rh.adesao',                    // congelamento de vigência (fim preenchido)
    'rh.regra_elegibilidade_versao',// congelamento de versão encerrada
    'rh.demanda_transicao',         // append-only
    'rh.demanda_comentario',        // append-only
  ];

  const removidos = {};
  await comTriggersDesligados(cliente, TABELAS, async () => {
    const passos = [
      ['rh.evento_colaborador', `DELETE FROM rh.evento_colaborador WHERE origem_tabela = 'rh.adesao'`],
      ['rh.dependente', 'DELETE FROM rh.dependente'],
      ['rh.adesao', 'DELETE FROM rh.adesao'],
      ['rh.regra_elegibilidade_versao', 'DELETE FROM rh.regra_elegibilidade_versao'],
      ['rh.beneficio', 'DELETE FROM rh.beneficio'],
      [
        'rh.demanda_comentario',
        `DELETE FROM rh.demanda_comentario c
          USING rh.demanda d, rh.tipo_demanda_versao t
          WHERE c.demanda_id = d.id AND d.tipo_demanda_versao_id = t.id
            AND t.chave = '${CHAVE_TIPO_DEMANDA}'`,
      ],
      [
        'rh.demanda_transicao',
        `DELETE FROM rh.demanda_transicao tr
          USING rh.demanda d, rh.tipo_demanda_versao t
          WHERE tr.demanda_id = d.id AND d.tipo_demanda_versao_id = t.id
            AND t.chave = '${CHAVE_TIPO_DEMANDA}'`,
      ],
      [
        'rh.demanda',
        `DELETE FROM rh.demanda d
          USING rh.tipo_demanda_versao t
          WHERE d.tipo_demanda_versao_id = t.id AND t.chave = '${CHAVE_TIPO_DEMANDA}'`,
      ],
    ];
    for (const [tabela, sql] of passos) {
      const { rowCount } = await cliente.query(sql);
      if (rowCount > 0) removidos[tabela] = rowCount;
    }
  });

  const total = Object.values(removidos).reduce((a, b) => a + b, 0);
  if (total > 0) {
    log(
      `07-beneficios: limpeza — ${total} linha(s) em ${Object.keys(removidos).length} tabela(s).`
    );
  }
}

// ------------------------------------------------------------------ leitura do quadro

async function lerPessoas(cliente) {
  const { rows } = await cliente.query(`
    SELECT c.id, c.matricula, c.nome_completo, c.tipo_vinculo, c.status,
           c.data_admissao::text     AS data_admissao,
           c.data_desligamento::text AS data_desligamento,
           u.id AS usuario_id, u.papel,
           p.salario::text AS salario,
           cv.nome AS cargo,
           l.estabelecimento_id
      FROM rh.colaborador c
      JOIN sistema.usuario u ON u.id = c.usuario_id
      LEFT JOIN rh.posicao_colaborador p
        ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
      LEFT JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
      LEFT JOIN rh.lotacao l
        ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
     WHERE u.email LIKE '%@${DOMINIO}'
     ORDER BY c.matricula
  `);
  return rows.map((linha) => ({
    id: Number(linha.id),
    usuarioId: Number(linha.usuario_id),
    matricula: linha.matricula,
    nome: linha.nome_completo,
    papel: linha.papel,
    cargo: linha.cargo,
    tipo_vinculo: linha.tipo_vinculo,
    estabelecimento_id:
      linha.estabelecimento_id === null ? null : Number(linha.estabelecimento_id),
    ativo: linha.status !== 'desligado',
    admissao: comoData(linha.data_admissao),
    desligamento: linha.data_desligamento ? comoData(linha.data_desligamento) : null,
    salario: linha.salario === null ? 0 : Number(linha.salario),
  }));
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  await limpar(cliente);

  const rng = aleatorio(SEMENTE);
  const agora = hoje();

  const pessoas = await lerPessoas(cliente);
  if (pessoas.length === 0) {
    throw new Error(
      'Nenhum colaborador @fastdemo.local — rode db/semear/01-base.js antes deste módulo.'
    );
  }
  const ativos = pessoas.filter((p) => p.ativo);
  const desligados = pessoas.filter((p) => !p.ativo);

  // Quem opera benefício na Fast é a DP (Patrícia) — é ela que efetiva, nega e
  // registra os eventos, exatamente como na vida real.
  const { rows: linhasDp } = await cliente.query(
    `SELECT id FROM sistema.usuario
      WHERE email = $1 OR (papel = 'dp' AND email LIKE '%@${DOMINIO}')
      ORDER BY (email = $1) DESC, id
      LIMIT 1`,
    [`dp@${DOMINIO}`]
  );
  if (linhasDp.length === 0) {
    throw new Error('Nenhum usuário de DP @fastdemo.local — rode 01-base.js antes.');
  }
  const dpUsuarioId = Number(linhasDp[0].id);

  // ---------------------------------------------------------- catálogo + regras
  const linhasBeneficio = await inserirLote(
    cliente,
    'rh.beneficio',
    ['chave', 'nome', 'categoria', 'ativo'],
    BENEFICIOS.map((b) => [b.chave, b.nome, b.categoria, true]),
    'id, chave'
  );
  const beneficioIdPorChave = new Map(
    linhasBeneficio.map((linha) => [linha.chave, Number(linha.id)])
  );
  const beneficios = BENEFICIOS.map((b) => ({
    ...b,
    id: beneficioIdPorChave.get(b.chave),
  }));

  // Uma versão ATIVA por benefício (índice único parcial de 0009) e, para VR e
  // plano de saúde, a versão ENCERRADA do reajuste anterior — assim a tela de
  // versões mostra histórico de verdade.
  const regras = [];
  for (const b of beneficios) {
    if (b.anterior) {
      regras.push([
        b.id,
        JSON.stringify(b.criterio),
        dinheiro(b.anterior.valorPadrao),
        dinheiro(b.anterior.descontoPadrao),
        'encerrada',
        INICIO_TABELA_ANTERIOR,
        FIM_TABELA_ANTERIOR,
      ]);
    }
    regras.push([
      b.id,
      JSON.stringify(b.criterio),
      dinheiro(b.valorPadrao),
      b.descontoPadrao === null ? null : dinheiro(b.descontoPadrao),
      'ativa',
      INICIO_TABELA,
      null,
    ]);
  }
  await inserirLote(
    cliente,
    'rh.regra_elegibilidade_versao',
    [
      'beneficio_id', 'criterio', 'valor_padrao', 'desconto_padrao',
      'status', 'inicio_vigencia', 'fim_vigencia',
    ],
    regras
  );
  log(
    `07-beneficios: catálogo com ${beneficios.length} benefícios e ${regras.length} versões de regra ` +
      `(${regras.filter((r) => r[4] === 'ativa').length} vigentes).`
  );

  // ---------------------------------------------------------- dependentes
  // Escolhidos ANTES das adesões: o valor do plano de saúde e do odontológico
  // depende de quantas pessoas entram na apólice.
  const candidatosDependente = ativos.filter(
    (p) => p.tipo_vinculo === 'clt' && p.cargo !== 'Jovem Aprendiz'
  );
  const titulares = embaralhar(rng, candidatosDependente).slice(0, 12);

  const dependentesPorPessoa = new Map();
  const dependentes = [];
  for (const titular of titulares) {
    const sobrenomes = titular.nome.split(' ').slice(1); // filho herda os do titular
    const lista = [];

    // Cônjuge em ~55% dos casos (sobrenome de solteiro(a) preservado).
    if (rng() < 0.55) {
      const generoConjuge = rng() < 0.5 ? 'f' : 'm';
      const nome = `${escolher(rng, generoConjuge === 'f' ? NOMES_ADULTO_F : NOMES_ADULTO_M)} ${escolher(rng, SOBRENOMES_CONJUGE)} ${sobrenomes[sobrenomes.length - 1]}`;
      const idade = inteiro(rng, 26, 52);
      lista.push({
        nome,
        parentesco: 'conjuge',
        nascimento: dataRelativa(-Math.round(idade * 365.25) - inteiro(rng, 0, 300)),
        cpf: cpfValido(rng),
      });
    }

    // 1 a 2 filhos (um titular chega a 3 — família grande existe).
    const quantosFilhos = rng() < 0.09 ? 3 : rng() < 0.4 ? 2 : 1;
    for (let i = 0; i < quantosFilhos; i += 1) {
      const genero = rng() < 0.5 ? 'f' : 'm';
      const nome = `${escolher(rng, genero === 'f' ? NOMES_CRIANCA_F : NOMES_CRIANCA_M)} ${sobrenomes.join(' ')}`;
      const idade = inteiro(rng, 0, 17);
      lista.push({
        nome,
        parentesco: 'filho',
        nascimento: dataRelativa(-Math.round(idade * 365.25) - inteiro(rng, 0, 300)),
        // Criança pequena costuma não ter CPF no cadastro do DP ainda.
        cpf: idade >= 8 ? cpfValido(rng) : null,
      });
    }

    for (const dependente of lista) {
      dependentes.push({ titular, ...dependente });
    }
    dependentesPorPessoa.set(titular.id, lista.length);
  }

  // Um caso de dependente 'outro' (mãe idosa na apólice) — o domínio prevê.
  const titularOutro = titulares[3];
  dependentes.push({
    titular: titularOutro,
    nome: `Terezinha ${titularOutro.nome.split(' ').slice(-1)[0]} Peixoto`,
    parentesco: 'outro',
    nascimento: dataRelativa(-Math.round(71 * 365.25)),
    cpf: cpfValido(rng),
  });
  dependentesPorPessoa.set(
    titularOutro.id,
    (dependentesPorPessoa.get(titularOutro.id) ?? 0) + 1
  );

  await inserirLote(
    cliente,
    'rh.dependente',
    ['colaborador_id', 'nome', 'nascimento', 'parentesco', 'cpf'],
    dependentes.map((d) => [
      d.titular.id,
      d.nome,
      iso(d.nascimento),
      d.parentesco,
      d.cpf,
    ])
  );
  log(
    `07-beneficios: ${dependentes.length} dependentes em ${dependentesPorPessoa.size} titulares ` +
      `(${dependentes.filter((d) => d.parentesco === 'filho').length} filhos, ` +
      `${dependentes.filter((d) => d.parentesco === 'conjuge').length} cônjuges, ` +
      `${dependentes.filter((d) => d.parentesco === 'outro').length} outro).`
  );

  // ---------------------------------------------------------- valores da adesão
  /** Valor e desconto CONGELADOS na efetivação, a partir da tabela vigente. */
  function valoresDaAdesao(beneficio, pessoa) {
    const qtdDependentes = dependentesPorPessoa.get(pessoa.id) ?? 0;
    switch (beneficio.chave) {
      case 'vt': {
        // Quem faz baldeação usa 3 passagens por dia.
        const custo = rng() < 0.3 ? 396.0 : beneficio.valorPadrao;
        // O que foi acordado com a pessoa: 6% do salário, limitado ao custo.
        // O teto legal quem aplica é o motor rh_folha — aqui é só o insumo.
        return { valor: custo, desconto: centavos(Math.min(pessoa.salario * 0.06, custo)) };
      }
      case 'plano_saude': {
        const faixa = CARGOS_PLANO_SUPERIOR.has(pessoa.cargo)
          ? FAIXAS_SAUDE.apartamento
          : FAIXAS_SAUDE.enfermaria;
        const valor = centavos(faixa.titular + qtdDependentes * faixa.dependente);
        return { valor, desconto: centavos(valor * COPARTICIPACAO) };
      }
      case 'plano_odonto': {
        const valor = centavos(ODONTO.titular + qtdDependentes * ODONTO.dependente);
        return { valor, desconto: centavos(valor * COPARTICIPACAO) };
      }
      case 'farmacia':
        // Limite de crédito fixo; o desconto é o consumo do mês na rede.
        return { valor: beneficio.valorPadrao, desconto: centavos(inteiro(rng, 15, 180)) };
      default:
        return { valor: beneficio.valorPadrao, desconto: beneficio.descontoPadrao };
    }
  }

  // ---------------------------------------------------------- adesões dos ativos
  const adesoes = [];
  for (const pessoa of ativos) {
    const novato = dias(pessoa.admissao, agora) <= 90;
    const temDependente = (dependentesPorPessoa.get(pessoa.id) ?? 0) > 0;

    for (const beneficio of beneficios) {
      if (!atendeCriterio(beneficio.criterio, pessoa)) continue;

      // Quem tem dependente adere ao plano de saúde/odonto — é o motivo de ter
      // colocado a família na apólice. Recém-admitido assina VR e VT na
      // integração, com a papelada da admissão.
      const forcado =
        (temDependente && (beneficio.chave === 'plano_saude' || beneficio.chave === 'plano_odonto')) ||
        (novato && (beneficio.chave === 'vr' || beneficio.chave === 'vt'));
      if (!forcado && rng() >= beneficio.adesao) continue;

      // 78% aderem na admissão (pacote fechado com o DP na integração);
      // o restante aderiu depois, em algum ponto do vínculo.
      const desdeAdmissao = dias(pessoa.admissao, agora);
      const atraso =
        desdeAdmissao > 30 && rng() >= 0.78
          ? inteiro(rng, 30, Math.max(31, desdeAdmissao - 1))
          : 0;
      const inicio = new Date(pessoa.admissao.getTime() + atraso * 86400000);

      const { valor, desconto } = valoresDaAdesao(beneficio, pessoa);
      adesoes.push({
        pessoa,
        beneficio,
        status: 'ativa',
        inicio,
        fim: null,
        valor,
        desconto,
        demandaId: null,
      });
    }
  }

  // ---------------------------------------------------------- suspensas e canceladas
  // 4 suspensas (afastamento longo suspende o benefício, sem encerrar a adesão)
  // e 3 canceladas a pedido — cada uma numa pessoa diferente, para a tela do DP
  // mostrar variedade.
  const embaralhadas = embaralhar(rng, adesoes);
  const pessoasUsadas = new Set();
  const suspensas = [];
  const canceladas = [];

  for (const adesao of embaralhadas) {
    if (suspensas.length >= 4) break;
    if (pessoasUsadas.has(adesao.pessoa.id)) continue;
    if (adesao.beneficio.chave === 'vr') continue; // VR não se suspende na Fast
    pessoasUsadas.add(adesao.pessoa.id);
    adesao.status = 'suspensa';
    suspensas.push(adesao);
  }
  for (const adesao of embaralhadas) {
    if (canceladas.length >= 3) break;
    if (pessoasUsadas.has(adesao.pessoa.id)) continue;
    if (adesao.status !== 'ativa') continue;
    // Cancelamento tem que caber dentro da vigência da adesão.
    const desdeInicio = dias(adesao.inicio, agora);
    if (desdeInicio < 60) continue;
    pessoasUsadas.add(adesao.pessoa.id);
    adesao.status = 'cancelada';
    adesao.fim = dataRelativa(-inteiro(rng, 25, Math.min(300, desdeInicio - 10)));
    canceladas.push(adesao);
  }

  // ---------------------------------------------------------- adesões dos desligados
  // Histórico: quem saiu teve os benefícios encerrados na data do desligamento.
  for (const pessoa of desligados) {
    for (const beneficio of beneficios) {
      if (!atendeCriterio(beneficio.criterio, pessoa)) continue;
      if (rng() >= beneficio.adesao) continue;
      const { valor, desconto } = valoresDaAdesao(beneficio, pessoa);
      adesoes.push({
        pessoa,
        beneficio,
        status: 'cancelada',
        inicio: pessoa.admissao,
        fim: pessoa.desligamento,
        valor,
        desconto,
        demandaId: null,
        porDesligamento: true,
      });
    }
  }

  // ---------------------------------------------------------- demandas do tipo adesao_beneficio
  const { rows: linhasTipo } = await cliente.query(
    `SELECT id, sla_dias FROM rh.tipo_demanda_versao
      WHERE chave = $1 AND status = 'ativa'`,
    [CHAVE_TIPO_DEMANDA]
  );
  if (linhasTipo.length === 0) {
    throw new Error(
      `Tipo de demanda '${CHAVE_TIPO_DEMANDA}' ativo não encontrado — confira a migration 0009.`
    );
  }
  const tipoId = Number(linhasTipo[0].id);
  const slaDias = Number(linhasTipo[0].sla_dias);

  const vigentePorChave = new Map(); // `${pessoaId}:${beneficioId}` → adesão vigente
  for (const adesao of adesoes) {
    if (adesao.fim === null) {
      vigentePorChave.set(`${adesao.pessoa.id}:${adesao.beneficio.id}`, adesao);
    }
  }

  /** Pares (pessoa, benefício) elegíveis SEM adesão vigente — pedido plausível. */
  const paresSemAdesao = [];
  for (const pessoa of embaralhar(rng, ativos)) {
    for (const beneficio of beneficios) {
      if (!atendeCriterio(beneficio.criterio, pessoa)) continue;
      if (vigentePorChave.has(`${pessoa.id}:${beneficio.id}`)) continue;
      paresSemAdesao.push({ pessoa, beneficio });
    }
  }

  const demandas = [];
  const usadasEmDemanda = new Set();

  function reservarPar(filtro) {
    const indice = paresSemAdesao.findIndex(
      (par) => !usadasEmDemanda.has(par.pessoa.id) && (!filtro || filtro(par))
    );
    if (indice < 0) return null;
    const [par] = paresSemAdesao.splice(indice, 1);
    usadasEmDemanda.add(par.pessoa.id);
    return par;
  }

  // 1–4: adesões PENDENTES na fila do DP (uma delas já vencida — a fila real
  // tem atraso, e o indicador de SLA precisa de caso concreto).
  const pendentes = [
    { abertaHa: 1, status: 'aberta' },
    { abertaHa: 3, status: 'aberta' },
    { abertaHa: 4, status: 'em_atendimento' },
    { abertaHa: 8, status: 'em_atendimento' }, // prazo estourado (SLA 5 dias)
  ];
  pendentes.forEach((config, indice) => {
    const par = reservarPar();
    if (!par) return;
    demandas.push({
      natureza: 'adesao',
      pessoa: par.pessoa,
      beneficio: par.beneficio,
      status: config.status,
      abertaEm: dataRelativa(-config.abertaHa),
      complemento: OBSERVACOES_ADESAO[indice % OBSERVACOES_ADESAO.length],
      efetiva: null,
    });
  });

  // 5: cancelamento PENDENTE — precisa de adesão vigente do próprio solicitante.
  const vigentesParaCancelar = embaralhar(
    rng,
    adesoes.filter(
      (a) =>
        a.fim === null &&
        a.status === 'ativa' &&
        a.pessoa.ativo &&
        !usadasEmDemanda.has(a.pessoa.id) &&
        a.beneficio.chave === 'vt'
    )
  );
  if (vigentesParaCancelar.length > 0) {
    const alvo = vigentesParaCancelar[0];
    usadasEmDemanda.add(alvo.pessoa.id);
    demandas.push({
      natureza: 'cancelamento',
      pessoa: alvo.pessoa,
      beneficio: alvo.beneficio,
      status: 'aberta',
      abertaEm: dataRelativa(-2),
      complemento: MOTIVOS_CANCELAMENTO[0],
      efetiva: null,
    });
  }

  // 6–8: adesões CONCLUÍDAS — a demanda nasceu, o DP efetivou e a adesão ficou
  // vinculada (demanda_id preenchido na rh.adesao).
  const recentes = adesoes
    .filter(
      (a) =>
        a.pessoa.ativo &&
        a.fim === null &&
        a.status === 'ativa' &&
        !usadasEmDemanda.has(a.pessoa.id) &&
        // A demanda nasce DEPOIS da admissão: adesão que começou junto com o
        // contrato veio da papelada da integração, não de pedido no sistema.
        dias(a.pessoa.admissao, a.inicio) >= 10 &&
        dias(a.inicio, agora) >= 12 &&
        dias(a.inicio, agora) <= 400
    )
    .sort((a, b) => b.inicio - a.inicio);
  for (const adesao of recentes) {
    // Uma demanda por pessoa: a mesma pessoa pode ter duas adesões recentes,
    // mas cada solicitação da demo pertence a um solicitante diferente.
    if (demandas.filter((d) => d.status === 'concluida').length >= 3) break;
    if (usadasEmDemanda.has(adesao.pessoa.id)) continue;
    usadasEmDemanda.add(adesao.pessoa.id);
    demandas.push({
      natureza: 'adesao',
      pessoa: adesao.pessoa,
      beneficio: adesao.beneficio,
      status: 'concluida',
      abertaEm: new Date(adesao.inicio.getTime() - 4 * 86400000),
      fechadaEm: adesao.inicio,
      complemento: escolher(rng, OBSERVACOES_ADESAO),
      efetiva: adesao,
    });
  }

  // 9: cancelamento CONCLUÍDO — vinculado a uma das adesões canceladas a pedido.
  const canceladaComDemanda = canceladas.find((a) => !usadasEmDemanda.has(a.pessoa.id));
  if (canceladaComDemanda) {
    usadasEmDemanda.add(canceladaComDemanda.pessoa.id);
    demandas.push({
      natureza: 'cancelamento',
      pessoa: canceladaComDemanda.pessoa,
      beneficio: canceladaComDemanda.beneficio,
      status: 'concluida',
      abertaEm: new Date(canceladaComDemanda.fim.getTime() - 3 * 86400000),
      fechadaEm: canceladaComDemanda.fim,
      complemento: MOTIVOS_CANCELAMENTO[1],
      efetiva: canceladaComDemanda,
    });
  }

  // 10: RECUSADA — estagiário pediu plano de saúde, que a regra vigente
  // restringe a CLT. Mostra a negativa com motivo na tela do colaborador.
  const naoClt = ativos.find(
    (p) => p.tipo_vinculo !== 'clt' && p.tipo_vinculo !== 'pj' && !usadasEmDemanda.has(p.id)
  );
  const planoSaude = beneficios.find((b) => b.chave === 'plano_saude');
  if (naoClt) {
    const rotuloVinculo = naoClt.tipo_vinculo === 'aprendiz' ? 'aprendiz' : 'estagiário';
    usadasEmDemanda.add(naoClt.id);
    demandas.push({
      natureza: 'adesao',
      pessoa: naoClt,
      beneficio: planoSaude,
      status: 'recusada',
      abertaEm: dataRelativa(-15),
      fechadaEm: dataRelativa(-13),
      complemento: `Gostaria de entrar no plano de saúde da empresa, mesmo sendo ${rotuloVinculo}.`,
      efetiva: null,
      motivoRecusa:
        'A regra de elegibilidade vigente do Plano de Saúde alcança apenas o vínculo CLT. ' +
        `Como ${rotuloVinculo}, você segue com Vale-Refeição e Convênio Farmácia. ` +
        'Se houver efetivação em CLT, o benefício passa a valer no mesmo mês.',
    });
  }

  // O casamento do id devolvido pelo INSERT usa o solicitante como chave — se
  // dois pedidos caíssem na mesma pessoa, uma demanda ficaria sem transição.
  if (new Set(demandas.map((d) => d.pessoa.id)).size !== demandas.length) {
    throw new Error('Duas solicitações de benefício para o mesmo colaborador — revise a escolha.');
  }

  // Linha do tempo de cada demanda: abertura → (DP assume) → encerramento.
  for (const d of demandas) {
    d.prazo = new Date(d.abertaEm.getTime() + slaDias * 86400000);
    d.assumidaEm =
      d.status === 'em_atendimento' || d.status === 'concluida'
        ? new Date(d.abertaEm.getTime() + 86400000)
        : null;
    d.ultimoToque = d.fechadaEm ?? d.assumidaEm ?? d.abertaEm;
    d.horaUltimoToque = d.fechadaEm ? 15 : d.assumidaEm ? 11 : 9;
  }

  const linhasDemanda = await inserirLote(
    cliente,
    'rh.demanda',
    [
      'tipo_demanda_versao_id', 'solicitante_usuario_id', 'solicitante_colaborador_id',
      'descricao', 'status', 'prazo', 'atendente_usuario_id', 'criado_em', 'atualizado_em',
    ],
    demandas.map((d) => [
      tipoId,
      d.pessoa.usuarioId,
      d.pessoa.id,
      montarDescricao(d.natureza, d.beneficio.nome, d.beneficio.chave, d.complemento),
      d.status,
      iso(d.prazo),
      d.status === 'aberta' ? null : dpUsuarioId,
      instante(d.abertaEm, 9),
      instante(d.ultimoToque, d.horaUltimoToque),
    ]),
    'id, solicitante_colaborador_id'
  );
  // Cada demanda tem um solicitante diferente (garantido por `usadasEmDemanda`),
  // então a chave de retorno identifica a linha sem depender da ordem do RETURNING.
  const demandaIdPorColaborador = new Map(
    linhasDemanda.map((linha) => [Number(linha.solicitante_colaborador_id), Number(linha.id)])
  );
  for (const d of demandas) {
    d.id = demandaIdPorColaborador.get(d.pessoa.id);
    if (!d.id) throw new Error(`Demanda não retornada para o colaborador ${d.pessoa.matricula}`);
    if (d.efetiva) d.efetiva.demandaId = d.id;
  }

  // Transições e comentários (append-only) — o rastro que a tela da demanda lê.
  const transicoes = [];
  const comentarios = [];
  for (const d of demandas) {
    transicoes.push([d.id, null, 'aberta', d.pessoa.usuarioId, null, instante(d.abertaEm, 9)]);

    if (d.assumidaEm) {
      transicoes.push([
        d.id, 'aberta', 'em_atendimento', dpUsuarioId,
        'DP assumiu a solicitação para conferir a elegibilidade contra a regra vigente.',
        instante(d.assumidaEm, 11),
      ]);
    }

    if (d.status === 'concluida') {
      const texto =
        d.natureza === 'adesao'
          ? `Adesão ao benefício "${d.beneficio.nome}" efetivada pelo DP com início em ${paraBr(iso(d.fechadaEm))}.`
          : `Cancelamento do benefício "${d.beneficio.nome}" efetivado pelo DP com fim em ${paraBr(iso(d.fechadaEm))}.`;
      transicoes.push([
        d.id, 'em_atendimento', 'concluida', dpUsuarioId, texto, instante(d.fechadaEm, 15),
      ]);
      comentarios.push([d.id, dpUsuarioId, texto, instante(d.fechadaEm, 15)]);
    }

    if (d.status === 'recusada') {
      transicoes.push([
        d.id, 'aberta', 'recusada', dpUsuarioId, d.motivoRecusa, instante(d.fechadaEm, 15),
      ]);
      comentarios.push([d.id, dpUsuarioId, d.motivoRecusa, instante(d.fechadaEm, 15)]);
    }
  }
  await inserirLote(
    cliente,
    'rh.demanda_transicao',
    ['demanda_id', 'de_status', 'para_status', 'por_usuario_id', 'motivo', 'em'],
    transicoes
  );
  await inserirLote(
    cliente,
    'rh.demanda_comentario',
    ['demanda_id', 'autor_usuario_id', 'texto', 'em'],
    comentarios
  );

  // ---------------------------------------------------------- gravação das adesões
  const linhasAdesao = await inserirLote(
    cliente,
    'rh.adesao',
    [
      'colaborador_id', 'beneficio_id', 'status', 'inicio', 'fim',
      'valor', 'desconto', 'demanda_id', 'criado_em', 'atualizado_em',
    ],
    adesoes.map((a) => [
      a.pessoa.id,
      a.beneficio.id,
      a.status,
      iso(a.inicio),
      a.fim ? iso(a.fim) : null,
      dinheiro(a.valor),
      a.desconto === null ? null : dinheiro(a.desconto),
      a.demandaId,
      instante(a.inicio, 10),
      instante(a.fim ?? a.inicio, 10),
    ]),
    'id, colaborador_id, beneficio_id'
  );
  // Neste conjunto o par (colaborador, benefício) é único — dá para casar o id
  // devolvido sem depender da ordem do RETURNING.
  const adesaoIdPorPar = new Map(
    linhasAdesao.map((linha) => [
      `${linha.colaborador_id}:${linha.beneficio_id}`,
      Number(linha.id),
    ])
  );
  for (const a of adesoes) {
    a.id = adesaoIdPorPar.get(`${a.pessoa.id}:${a.beneficio.id}`);
    if (!a.id) {
      throw new Error(
        `Adesão não retornada para ${a.pessoa.matricula} × ${a.beneficio.chave}`
      );
    }
  }

  // ---------------------------------------------------------- linha do tempo
  // Projeção restrita (payload.restrita = 'true'): benefício é dado do próprio
  // colaborador — gestor não vê o do liderado. Igual ao que o serviço grava.
  const eventos = [];
  for (const a of adesoes) {
    eventos.push([
      a.pessoa.id,
      'beneficio_adesao',
      instante(a.inicio, 10),
      'rh.adesao',
      a.id,
      `Adesão ao benefício "${a.beneficio.nome}" efetivada (início ${paraBr(iso(a.inicio))})`,
      JSON.stringify({ beneficio: a.beneficio.chave, restrita: 'true' }),
      dpUsuarioId,
      instante(a.inicio, 10),
    ]);
    if (a.fim) {
      eventos.push([
        a.pessoa.id,
        'beneficio_cancelamento',
        instante(a.fim, 16),
        'rh.adesao',
        a.id,
        `Adesão ao benefício "${a.beneficio.nome}" cancelada (fim ${paraBr(iso(a.fim))})`,
        JSON.stringify({ beneficio: a.beneficio.chave, restrita: 'true' }),
        dpUsuarioId,
        instante(a.fim, 16),
      ]);
    }
  }
  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    [
      'colaborador_id', 'tipo', 'ocorrido_em', 'origem_tabela', 'origem_id',
      'resumo', 'payload', 'registrado_por', 'registrado_em',
    ],
    eventos
  );

  // ---------------------------------------------------------- relatório
  const vigentes = adesoes.filter((a) => a.fim === null);
  const porDesligamento = adesoes.filter((a) => a.porDesligamento);
  log(
    `07-beneficios: ${adesoes.length} adesões — ` +
      `${vigentes.filter((a) => a.status === 'ativa').length} ativas, ` +
      `${vigentes.filter((a) => a.status === 'suspensa').length} suspensas, ` +
      `${canceladas.length} canceladas a pedido, ` +
      `${porDesligamento.length} encerradas por desligamento.`
  );
  log(
    `07-beneficios: ${demandas.length} solicitações — ` +
      `${demandas.filter((d) => d.status === 'aberta' || d.status === 'em_atendimento').length} pendentes na fila do DP, ` +
      `${demandas.filter((d) => d.status === 'concluida').length} concluídas, ` +
      `${demandas.filter((d) => d.status === 'recusada').length} recusada.`
  );
  log(`07-beneficios: ${eventos.length} eventos de benefício na linha do tempo (restritos).`);

  // ---------------------------------------------------------- conferências duras
  const conferir = async (rotulo, sql, esperado) => {
    const { rows } = await cliente.query(sql);
    const obtido = Number(rows[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await conferir(
    'benefícios sem regra vigente',
    `SELECT count(*)::int AS total FROM rh.beneficio b
      WHERE NOT EXISTS (SELECT 1 FROM rh.regra_elegibilidade_versao r
                         WHERE r.beneficio_id = b.id AND r.status = 'ativa')`,
    0
  );
  await conferir(
    'adesões vigentes de colaborador desligado',
    `SELECT count(*)::int AS total FROM rh.adesao a
      JOIN rh.colaborador c ON c.id = a.colaborador_id
      WHERE a.fim IS NULL AND c.status = 'desligado'`,
    0
  );
  await conferir(
    'adesões que violam a regra de elegibilidade vigente',
    `SELECT count(*)::int AS total
       FROM rh.adesao a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
       JOIN rh.regra_elegibilidade_versao r
         ON r.beneficio_id = a.beneficio_id AND r.status = 'ativa'
      WHERE jsonb_array_length(COALESCE(r.criterio->'tipos_vinculo', '[]'::jsonb)) > 0
        AND NOT (r.criterio->'tipos_vinculo' ? c.tipo_vinculo)`,
    0
  );
  await conferir(
    'adesões canceladas sem fim',
    `SELECT count(*)::int AS total FROM rh.adesao
      WHERE status = 'cancelada' AND fim IS NULL`,
    0
  );
  await conferir(
    'solicitações pendentes cuja descrição a tela não interpreta',
    `SELECT count(*)::int AS total
       FROM rh.demanda d
       JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
      WHERE t.chave = '${CHAVE_TIPO_DEMANDA}'
        AND d.descricao !~ '^(Adesão ao benefício|Cancelamento do benefício) ".*" \\(chave: [a-z][a-z0-9_]{1,39}\\)\\.'`,
    0
  );
  await conferir(
    'demandas de benefício sem transição de abertura',
    `SELECT count(*)::int AS total
       FROM rh.demanda d
       JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
      WHERE t.chave = '${CHAVE_TIPO_DEMANDA}'
        AND NOT EXISTS (SELECT 1 FROM rh.demanda_transicao tr
                         WHERE tr.demanda_id = d.id AND tr.de_status IS NULL)`,
    0
  );
  await conferir(
    'cancelamentos pendentes sem adesão vigente do solicitante',
    `SELECT count(*)::int AS total
       FROM rh.demanda d
       JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
       JOIN rh.beneficio b
         ON d.descricao LIKE 'Cancelamento do benefício "' || b.nome || '" (chave: ' || b.chave || ').%'
      WHERE t.chave = '${CHAVE_TIPO_DEMANDA}'
        AND d.status IN ('aberta', 'em_atendimento')
        AND NOT EXISTS (SELECT 1 FROM rh.adesao a
                         WHERE a.colaborador_id = d.solicitante_colaborador_id
                           AND a.beneficio_id = b.id AND a.fim IS NULL)`,
    0
  );

  return {
    beneficios: beneficios.map((b) => ({ id: b.id, chave: b.chave, nome: b.nome })),
    totalAdesoes: adesoes.length,
    totalDependentes: dependentes.length,
    totalSolicitacoesBeneficio: demandas.length,
  };
}

module.exports = { semear, BENEFICIOS };

if (require.main === module) {
  executarSozinho('07-beneficios', semear);
}
