// db/semear/01-base.js — o NÚCLEO da demonstração: a empresa fictícia Fast.
//
// Perfil (o mesmo em TODOS os módulos de semeadura — coerência é obrigatória):
//   Fast — distribuidora de materiais de construção/drywall, 5 unidades:
//   Matriz Centro, Filial Norte, Filial Sul, Filial Leste, Filial Oeste.
//   62 colaboradores ativos + 8 desligados nos últimos 12 meses.
//
// O que este módulo cria:
//   • a ESTRUTURA DO GRUPO nos três campos que a onda I separou (migration
//     0047): 5 empresas de REGISTRO (4 com CNPJ fictício de DV válido + 1 em
//     constituição, sem CNPJ), 5 LOTAÇÕES (o prédio, sem CNPJ próprio) e 8
//     CENTROS DE CUSTO — inclusive o CSC, que não pertence a local nenhum.
//     Os três NÃO coincidem de propósito: há gente registrada numa empresa,
//     trabalhando no local de outra e com o custo caindo numa terceira;
//   • 5 estabelecimentos com versão vigente;
//   • 15 cargos com versão vigente (descrição + CHA) e faixa salarial vigente
//     — o RCF completo (missão, atividades, setor, líder) é de 12-rcf.js;
//   • 70 colaboradores (matrícula 1001+, CPF fictício com DV válido) com
//     usuário, posição (cargo + salário), lotação, gestor e evento de admissão,
//     TODOS com data de nascimento e gênero autodeclarado (relatórios de
//     aniversariantes e diversidade nascem com dado de verdade);
//   • as 7 personas de demonstração, com 2FA já configurado onde é obrigatório
//     — inclusive `recrutador@` e `lidertd@`, os dois papéis da 0019, que
//     existem justamente para demonstrar a segregação de acesso ao vivo.
//
// NÃO cria processo_desligamento (é de outro módulo) — os 8 desligados ficam
// só no estado final: status desligado + data + usuário inativo.
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  aleatorio,
  arredondarDezena,
  anosAtras,
  cnpjValido,
  cpfValido,
  dataRelativa,
  escolher,
  executarSozinho,
  hashSenha,
  inserirLote,
  inteiro,
  iso,
  hoje,
  log,
  mesesAtras,
  segredoTotp,
  semAcento,
  uriOtpauth,
} = require('./comum');

const SEMENTE = 20260729; // fixa: mesma execução ⇒ mesmos dados

// Semente SEPARADA para data de nascimento, e isto é de propósito: a numeração
// de matrícula (ordem de admissão), o CPF e o salário de cada pessoa saem do
// stream de SEMENTE, e 02-pessoas/05-ferias ancoram cenários em matrículas
// LITERAIS ('1013', '1043', '1045'…). Consumir SEMENTE para nascimento
// deslocaria o stream e reescreveria essas matrículas em silêncio. Com stream
// próprio, o nascimento é igualmente determinístico e não toca em nada.
const SEMENTE_NASCIMENTO = 20260730;
const SENHA_DEMO = 'FastDemo2026!';
const DOMINIO = 'fastdemo.local';
const RAZAO_SOCIAL = 'Fast Distribuidora de Materiais de Construção Ltda';
const RAIZ_CNPJ = 41235678; // raiz fictícia, comum às 5 inscrições
const MATRICULA_INICIAL = 1001;

// ------------------------------------------------------------------ empresas do grupo (REGISTRO)
// As quatro citadas pela diretoria. São o CNPJ em que a pessoa está
// REGISTRADA — coisa diferente do LOCAL onde ela trabalha (as unidades abaixo)
// e do CENTRO DE CUSTO onde o custo dela cai. A quarta não foi nomeada na
// reunião e nasce com nome de placeholder, editável pela tela de estrutura.
const EMPRESAS = [
  { nome: 'Supply', tipo: 'matriz' },
  { nome: 'DCS', tipo: 'filial' },
  { nome: 'Casa do Montador', tipo: 'filial' },
  { nome: 'Quarta empresa do grupo (renomear)', tipo: 'filial' },
  // CADASTRO PELA METADE, DE PROPÓSITO (pedido do dono: "o dado de demo é limpo
  // demais e não exercita erro humano"). A diretoria já bateu o martelo sobre a
  // empresa nova e mandou o RH preparar o centro de custo, mas o contrato
  // social ainda está no cartório e o DP não tem o CNPJ. É exatamente o caso
  // que a 0047 previu ao deixar `rh.empresa_grupo.cnpj` NULLABLE — e na tela de
  // estrutura ela aparece com CNPJ "—", razão social "—" e nenhum vínculo, que
  // é o que o DP tem para reclamar. NÃO "conserte" inventando um CNPJ.
  { nome: 'Fast Serviços (em constituição)', tipo: 'filial', semCnpj: true },
];

// ------------------------------------------------------------------ unidades (LOTAÇÃO)
// O local físico. Note que são CINCO locais para QUATRO empresas: a Supply
// responde por dois (Matriz Centro e Filial Oeste) — é exatamente o caso que o
// desenho antigo não conseguia representar, porque o CNPJ morava no local.
const UNIDADES = [
  {
    nome: 'Matriz Centro',
    endereco: 'Av. Sete de Setembro, 1420 — Centro',
    empresa: 'Supply',
    ccLoja: 'CC-1000',
    ccAdm: 'CC-1900',
  },
  { nome: 'Filial Norte', endereco: 'Rod. BR-116, km 22 — Distrito Industrial Norte', empresa: 'DCS', ccLoja: 'CC-2000' },
  { nome: 'Filial Sul', endereco: 'Av. das Indústrias, 3050 — Jardim Sul', empresa: 'Casa do Montador', ccLoja: 'CC-3000' },
  { nome: 'Filial Leste', endereco: 'Av. Leste-Oeste, 780 — Vila Leste', empresa: 'Quarta empresa do grupo (renomear)', ccLoja: 'CC-4000' },
  { nome: 'Filial Oeste', endereco: 'Rua dos Construtores, 215 — Parque Oeste', empresa: 'Supply', ccLoja: 'CC-5000' },
];

// ------------------------------------------------------------------ centros de custo que não são de um local
// O CENTRO DE CUSTO é o terceiro campo, e o exemplo que o dono deu na reunião é
// justamente um que não cabe em nenhuma loja: "registrado na Supply, trabalhando
// na loja Centro e com o custo caindo no CSC". O CSC é mantido pela Supply (é
// ela quem paga a estrutura corporativa) e recebe o custo de quem atende o
// GRUPO INTEIRO — RH, DP, financeiro e compras —, esteja essa gente registrada
// onde estiver e sentada em que loja for.
const CENTROS_DO_GRUPO = [
  {
    empresa: 'Supply',
    codigo: 'CC-9000',
    nome: 'Centro de Serviços Compartilhados (CSC)',
  },
  // Já criado para a empresa que ainda não tem CNPJ: o RH prepara o centro de
  // custo antes de o contrato social sair. Nasce sem ninguém alocado.
  {
    empresa: 'Fast Serviços (em constituição)',
    codigo: 'CC-6000',
    nome: 'Implantação Fast Serviços',
  },
];

// ------------------------------------------------------------------ cargos (CHA + faixa)

const CARGOS = [
  {
    nome: 'Diretor(a) de Operações',
    faixa: [15000, 22000],
    descricao:
      'Responde pelo resultado das cinco unidades: metas comerciais, margem, ' +
      'quadro de pessoal e padrão de atendimento da rede.',
    cha: {
      conhecimentos: [
        'Gestão de varejo de material de construção',
        'Leitura de DRE por unidade e formação de preço',
        'Legislação trabalhista aplicada à operação',
        'Planejamento de expansão e abertura de unidade',
      ],
      habilidades: [
        'Condução de comitê de resultados',
        'Negociação com fornecedores estratégicos',
        'Desenvolvimento de gerentes',
        'Decisão com informação incompleta',
      ],
      atitudes: ['Visão de dono', 'Franqueza respeitosa', 'Constância', 'Coragem para decisões impopulares'],
    },
  },
  {
    nome: 'Gerente de Loja',
    faixa: [7000, 11000],
    descricao:
      'Responde pelo resultado da unidade: venda, ruptura de estoque, equipe, ' +
      'segurança do trabalho e experiência do cliente na loja e na entrega.',
    cha: {
      conhecimentos: [
        'Gestão de estoque e giro de drywall e argamassas',
        'Indicadores comerciais da unidade',
        'Rotinas de DP: escala, ponto, férias',
        'Normas de segurança (NR-6, NR-11)',
      ],
      habilidades: ['Gestão de equipe presencial', 'Feedback estruturado', 'Solução de conflito com cliente', 'Organização de rotina'],
      atitudes: ['Presença no salão', 'Exemplo em segurança', 'Foco em resultado', 'Cuidado com a equipe'],
    },
  },
  {
    nome: 'Supervisor(a) Comercial',
    faixa: [4500, 6500],
    descricao:
      'Conduz a equipe de vendas da unidade: metas individuais, acompanhamento ' +
      'de propostas, mix de produtos e recuperação de clientes inativos.',
    cha: {
      conhecimentos: ['Técnicas de venda consultiva', 'Mix e aplicação de drywall', 'Política comercial e descontos', 'Funil de propostas'],
      habilidades: ['Acompanhamento diário de meta', 'Treinamento em campo', 'Negociação', 'Análise de carteira'],
      atitudes: ['Disciplina', 'Orientação ao cliente', 'Colaboração', 'Iniciativa'],
    },
  },
  {
    nome: 'Vendedor(a)',
    faixa: [2400, 3800],
    descricao:
      'Atende cliente no balcão e por telefone, monta orçamento de obra, ' +
      'acompanha entrega e sustenta a carteira da unidade.',
    cha: {
      conhecimentos: ['Linha de drywall, perfis e acessórios', 'Cálculo de quantitativo de obra', 'Sistema de orçamento e pedido', 'Condições de pagamento'],
      habilidades: ['Escuta e sondagem de necessidade', 'Fechamento de venda', 'Organização de follow-up', 'Trabalho sob pico de movimento'],
      atitudes: ['Cordialidade', 'Persistência', 'Honestidade no prazo prometido', 'Espírito de equipe'],
    },
  },
  {
    nome: 'Auxiliar de Vendas',
    faixa: [2000, 2600],
    descricao: 'Apoia o time comercial: cadastro de cliente, emissão de orçamento, conferência de pedido e retorno de propostas.',
    cha: {
      conhecimentos: ['Cadastro e sistema de pedidos', 'Catálogo básico de produtos', 'Rotina de atendimento'],
      habilidades: ['Digitação e atenção a detalhe', 'Comunicação por telefone e WhatsApp', 'Organização de fila de atendimento'],
      atitudes: ['Proatividade', 'Vontade de aprender', 'Cordialidade'],
    },
  },
  {
    nome: 'Estoquista',
    faixa: [2100, 2900],
    descricao: 'Recebe, endereça e separa mercadoria; mantém inventário acurado e o depósito em condição segura.',
    cha: {
      conhecimentos: ['Endereçamento e inventário rotativo', 'Movimentação de carga (NR-11)', 'Leitor de código de barras'],
      habilidades: ['Separação de pedido sem erro', 'Organização física do depósito', 'Ritmo constante'],
      atitudes: ['Zelo com o patrimônio', 'Segurança em primeiro lugar', 'Pontualidade'],
    },
  },
  {
    nome: 'Conferente',
    faixa: [2300, 3200],
    descricao: 'Confere carga na entrada e na saída, valida nota contra físico e registra divergência antes do faturamento.',
    cha: {
      conhecimentos: ['Leitura de nota fiscal e romaneio', 'Padrões de embalagem e avaria', 'Controle de divergência'],
      habilidades: ['Conferência cega', 'Registro claro de ocorrência', 'Interlocução com transportadora'],
      atitudes: ['Rigor', 'Imparcialidade', 'Atenção sustentada'],
    },
  },
  {
    nome: 'Motorista Entregador',
    faixa: [2600, 3600],
    descricao: 'Entrega material em obra e residência, cuida do veículo e representa a Fast no ponto final da venda.',
    cha: {
      conhecimentos: ['CNH categoria D e legislação de trânsito', 'Amarração e distribuição de carga', 'Rotas da região'],
      habilidades: ['Direção defensiva', 'Descarga em obra', 'Trato com o cliente na entrega'],
      atitudes: ['Responsabilidade', 'Cuidado com a carga', 'Paciência'],
    },
  },
  {
    nome: 'Analista de RH',
    faixa: [4200, 6200],
    descricao: 'Conduz recrutamento, integração, clima, avaliação de desempenho e desenvolvimento das cinco unidades.',
    cha: {
      conhecimentos: ['Recrutamento e seleção por competência', 'Avaliação de desempenho 360', 'Pesquisa e leitura de clima', 'LGPD aplicada a dado de pessoas'],
      habilidades: ['Entrevista por competência', 'Facilitação de treinamento', 'Análise de indicador de pessoas', 'Escrita clara'],
      atitudes: ['Sigilo', 'Imparcialidade', 'Escuta ativa', 'Iniciativa'],
    },
  },
  {
    nome: 'Assistente de DP',
    faixa: [2800, 4000],
    descricao: 'Executa a rotina de departamento pessoal: admissão, ponto, férias, afastamento, benefícios e conferência da folha.',
    cha: {
      conhecimentos: ['CLT e convenção coletiva do comércio', 'eSocial e FGTS Digital', 'Cálculo de férias e rescisão', 'Rotina de benefícios'],
      habilidades: ['Conferência de folha', 'Organização documental', 'Atendimento ao colaborador'],
      atitudes: ['Precisão', 'Discrição', 'Cumprimento de prazo'],
    },
  },
  {
    nome: 'Analista Financeiro',
    faixa: [4500, 6800],
    descricao: 'Cuida de contas a pagar e receber, conciliação bancária, fluxo de caixa e apoio ao fechamento das unidades.',
    cha: {
      conhecimentos: ['Fluxo de caixa e conciliação', 'Tributos sobre venda no varejo', 'ERP financeiro'],
      habilidades: ['Análise de inadimplência', 'Planilha avançada', 'Negociação de prazo com fornecedor'],
      atitudes: ['Rigor numérico', 'Confiabilidade', 'Organização'],
    },
  },
  {
    nome: 'Auxiliar Administrativo',
    faixa: [2000, 2800],
    descricao: 'Sustenta a rotina administrativa da unidade: arquivo, protocolo, apoio a compras e atendimento interno.',
    cha: {
      conhecimentos: ['Rotina administrativa e arquivo', 'Pacote de escritório', 'Fluxo de documento interno'],
      habilidades: ['Organização', 'Redação de comunicado simples', 'Atendimento interno'],
      atitudes: ['Prestatividade', 'Cuidado com prazo', 'Discrição'],
    },
  },
  {
    nome: 'Comprador(a)',
    faixa: [4800, 7200],
    descricao: 'Negocia com a indústria e distribuidores, monta o mix, controla nível de estoque e prazo de reposição da rede.',
    cha: {
      conhecimentos: ['Mercado de drywall e cimentícios', 'Formação de custo e frete', 'Curva ABC e ponto de pedido'],
      habilidades: ['Negociação com indústria', 'Análise de proposta', 'Planejamento de reposição'],
      atitudes: ['Firmeza', 'Ética com fornecedor', 'Visão de longo prazo'],
    },
  },
  {
    nome: 'Estagiário(a)',
    faixa: [1400, 1800],
    descricao: 'Vive a rotina da área sob supervisão, com plano de atividades e avaliação semestral conforme a Lei 11.788/2008.',
    cha: {
      conhecimentos: ['Conteúdo do curso em andamento', 'Ferramentas básicas de escritório'],
      habilidades: ['Aprendizado rápido', 'Organização de tarefa', 'Comunicação escrita'],
      atitudes: ['Curiosidade', 'Pontualidade', 'Abertura a feedback'],
    },
  },
  {
    nome: 'Jovem Aprendiz',
    faixa: [800, 1100],
    descricao: 'Cumpre programa de aprendizagem (Lei 10.097/2000) alternando curso no SENAC e prática acompanhada na unidade.',
    cha: {
      conhecimentos: ['Conteúdo do programa de aprendizagem', 'Noções de atendimento e organização'],
      habilidades: ['Seguir procedimento', 'Trabalho em equipe'],
      atitudes: ['Disposição', 'Respeito', 'Assiduidade'],
    },
  },
];

// ------------------------------------------------------------------ nomes

const NOMES_F = [
  'Adriana', 'Aline', 'Amanda', 'Ana', 'Beatriz', 'Bianca', 'Bruna', 'Camila',
  'Carolina', 'Cristiane', 'Daniela', 'Débora', 'Elaine', 'Eliane', 'Fernanda',
  'Flávia', 'Gabriela', 'Isabela', 'Jéssica', 'Karina', 'Larissa', 'Letícia',
  'Luciana', 'Márcia', 'Mariana', 'Michele', 'Natália', 'Priscila', 'Rafaela',
  'Renata', 'Rosana', 'Sabrina', 'Simone', 'Tatiane', 'Thaís', 'Vanessa', 'Viviane',
];

const NOMES_M = [
  'Alexandre', 'Anderson', 'André', 'Bruno', 'Caio', 'Carlos', 'Daniel', 'Diego',
  'Eduardo', 'Everton', 'Fábio', 'Felipe', 'Gilberto', 'Gustavo', 'Henrique',
  'Hugo', 'Igor', 'Ivan', 'João', 'Jonas', 'Kleber', 'Leandro', 'Luiz', 'Márcio',
  'Maurício', 'Nelson', 'Otávio', 'Paulo', 'Pedro', 'Ricardo', 'Rodrigo',
  'Sérgio', 'Thiago', 'Tiago', 'Vinícius', 'Wagner',
];

const SOBRENOMES = [
  'Almeida', 'Aragão', 'Azevedo', 'Barbosa', 'Barros', 'Batista', 'Bittencourt',
  'Braga', 'Caldeira', 'Camargo', 'Cardoso', 'Carvalho', 'Cavalcanti', 'Coelho',
  'Correia', 'Cunha', 'Dantas', 'Duarte', 'Esteves', 'Falcão', 'Farias',
  'Fonseca', 'Fontes', 'Freitas', 'Furtado', 'Gomes', 'Guimarães', 'Leal',
  'Lopes', 'Macedo', 'Machado', 'Magalhães', 'Maia', 'Martins', 'Medeiros',
  'Melo', 'Mendonça', 'Miranda', 'Monteiro', 'Moraes', 'Moreira', 'Nunes',
  'Pacheco', 'Peixoto', 'Pinheiro', 'Queiroz', 'Rezende', 'Ribeiro', 'Rocha',
  'Sales', 'Sampaio', 'Santana', 'Saraiva', 'Siqueira', 'Soares', 'Tavares',
  'Teixeira', 'Valente', 'Vasconcelos', 'Xavier',
];

/**
 * Gerador de nomes plausíveis e variados: nunca repete o nome completo e
 * limita a três aparições por sobrenome, para não parecer empresa familiar.
 */
function criarGeradorNomes(rng) {
  const usados = new Set();
  const contagemSobrenome = new Map();

  const disponivel = (sobrenome) => (contagemSobrenome.get(sobrenome) ?? 0) < 3;

  return function proximoNome(genero) {
    const pilha = genero === 'f' ? NOMES_F : NOMES_M;
    for (let tentativa = 0; tentativa < 400; tentativa += 1) {
      const primeiro = escolher(rng, pilha);
      const meio = escolher(rng, SOBRENOMES);
      const ultimo = escolher(rng, SOBRENOMES);
      if (meio === ultimo) continue;
      if (!disponivel(meio) || !disponivel(ultimo)) continue;
      const completo = `${primeiro} ${meio} ${ultimo}`;
      if (usados.has(completo)) continue;
      usados.add(completo);
      contagemSobrenome.set(meio, (contagemSobrenome.get(meio) ?? 0) + 1);
      contagemSobrenome.set(ultimo, (contagemSobrenome.get(ultimo) ?? 0) + 1);
      return completo;
    }
    throw new Error('Não consegui gerar um nome novo — aumente os catálogos de nomes.');
  };
}

// ------------------------------------------------------------------ quadro de pessoal
//
// faixa de tempo de casa:
//   novato   → admitido nos últimos 90 dias (contrato de experiência,
//              ciclos de 45/90 dias da avaliação)
//   padrao   → 1 a 4 anos (a maioria)
//   medio    → 4 a 8 anos
//   veterano → 8 a 10 anos

const M = 'Matriz Centro';
const N = 'Filial Norte';
const S = 'Filial Sul';
const L = 'Filial Leste';
const O = 'Filial Oeste';

/** Personas de demonstração: e-mail fixo, nome fixo, papel fixo. */
const PERSONAS = {
  helena: {
    email: `diretora.pessoas@${DOMINIO}`,
    nome: 'Helena Marques Andrade',
    descricao: 'Diretora de Operações — vê a rede inteira, dado sensível e clima individual',
  },
  patricia: {
    email: `dp@${DOMINIO}`,
    nome: 'Patrícia Nogueira Lima',
    descricao: 'Assistente de DP — folha, férias, admissão, desligamento e benefícios',
  },
  rafael: {
    email: `rh@${DOMINIO}`,
    nome: 'Rafael Andrade Pires',
    // A 0019 REBAIXOU o papel `rh`: as 5 chaves de R&S saíram e foram para o
    // papel `recrutador`. A descrição não pode mais prometer recrutamento —
    // seria a demo contradizendo a própria segregação que ela vai demonstrar.
    descricao:
      'Analista de RH generalista (papel `rh`) — avaliação 360, pesquisa e painel de clima, ' +
      'documentos e relatórios; recrutamento saiu deste papel na 0019 e é do `recrutador`',
  },
  marcos: {
    email: `gestor@${DOMINIO}`,
    nome: 'Marcos Vieira Salles',
    descricao:
      'Gerente da Matriz Centro — enxerga só a própria equipe ' +
      '(10 liderados ativos + 2 desligados no histórico)',
  },
  juliana: {
    email: `funcionario@${DOMINIO}`,
    nome: 'Juliana Costa Ferreira',
    descricao: 'Vendedora na Matriz Centro, liderada do Marcos — visão de colaborador',
  },
  // Papéis criados pela migration 0019 (segregação de acesso, item 1 do
  // feedback da analista de RH). Existem na demo para que a segregação seja
  // DEMONSTRADA, não explicada: entrando nestas duas contas, o que não é da
  // frente da pessoa simplesmente não está na tela.
  //
  // Nome de batismo fora dos catálogos NOMES_F/NOMES_M de propósito: garante
  // que nenhum nome gerado pelo rng possa coincidir com o da persona.
  solange: {
    email: `recrutador@${DOMINIO}`,
    nome: 'Solange Ferraz Bittencourt',
    descricao:
      'Recrutadora (papel `recrutador`) — R&S inteiro e o RCF do cargo para escrever a vaga; ' +
      'sem salário, sem folha, sem saúde e sem clima individual',
  },
  rogerio: {
    email: `lidertd@${DOMINIO}`,
    nome: 'Rogério Sampaio Fontes',
    descricao:
      'Líder de T&D (papel `lider_td`) — estrutura, avaliação e desenvolvimento do quadro; ' +
      'sem salário, sem saúde, sem motivo de desligamento e sem parecer de seleção',
  },
};

/**
 * Quadro completo: 60 ativos + 8 desligados.
 * `chefe` aponta para a `ref` do gestor (null só na diretoria).
 */
const QUADRO = [
  // ---------------------------------------------------------- Matriz Centro (20)
  { ref: 'helena', unidade: M, cc: 'adm', cargo: 'Diretor(a) de Operações', papel: 'diretoria', chefe: null, genero: 'f', anos: 9.2, persona: 'helena' },
  { ref: 'marcos', unidade: M, cc: 'loja', cargo: 'Gerente de Loja', papel: 'gestor', chefe: 'helena', genero: 'm', anos: 6.1, persona: 'marcos' },
  // O CORPORATIVO senta na Matriz mas atende as cinco unidades: LOTAÇÃO Matriz
  // Centro, CUSTO no CSC. É o exemplo que o dono deu, virado dado.
  { ref: 'rafael', unidade: M, cc: 'CC-9000', cargo: 'Analista de RH', papel: 'rh', chefe: 'helena', genero: 'm', anos: 3.2, persona: 'rafael' },
  { ref: 'mc_rh2', unidade: M, cc: 'CC-9000', cargo: 'Analista de RH', papel: 'rh', chefe: 'helena', genero: 'f', tempo: 'padrao' },
  { ref: 'patricia', unidade: M, cc: 'CC-9000', cargo: 'Assistente de DP', papel: 'dp', chefe: 'helena', genero: 'f', anos: 4.4, persona: 'patricia' },
  { ref: 'mc_dp2', unidade: M, cc: 'CC-9000', cargo: 'Assistente de DP', papel: 'dp', chefe: 'helena', genero: 'm', tempo: 'medio' },
  { ref: 'mc_fin', unidade: M, cc: 'CC-9000', cargo: 'Analista Financeiro', papel: 'funcionario', chefe: 'helena', genero: 'f', tempo: 'medio' },
  // OS TRÊS CAMPOS DIFERENTES NA MESMA PESSOA: registrado na DCS, trabalhando
  // na Matriz Centro (que é da Supply) e com o custo caindo no CSC. É o caso
  // que o desenho antigo — uma "unidade" só — não conseguia nem escrever.
  { ref: 'mc_compr', unidade: M, cc: 'CC-9000', registro: 'DCS', cargo: 'Comprador(a)', papel: 'funcionario', chefe: 'helena', genero: 'm', tempo: 'padrao', vinculo: 'pj' },
  { ref: 'mc_sup', unidade: M, cc: 'loja', cargo: 'Supervisor(a) Comercial', papel: 'gestor', chefe: 'marcos', genero: 'f', tempo: 'medio' },
  { ref: 'juliana', unidade: M, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'marcos', genero: 'f', anos: 2.3, persona: 'juliana' },
  { ref: 'mc_vend2', unidade: M, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'marcos', genero: 'm', tempo: 'padrao' },
  { ref: 'mc_vend3', unidade: M, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'marcos', genero: 'm', tempo: 'veterano' },
  { ref: 'mc_vend4', unidade: M, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'marcos', genero: 'f', tempo: 'padrao' },
  { ref: 'mc_auxv', unidade: M, cc: 'loja', cargo: 'Auxiliar de Vendas', papel: 'funcionario', chefe: 'mc_sup', genero: 'f', tempo: 'novato' },
  { ref: 'mc_estoq', unidade: M, cc: 'loja', cargo: 'Estoquista', papel: 'funcionario', chefe: 'marcos', genero: 'm', tempo: 'padrao' },
  { ref: 'mc_conf', unidade: M, cc: 'loja', cargo: 'Conferente', papel: 'funcionario', chefe: 'marcos', genero: 'm', tempo: 'medio' },
  { ref: 'mc_mot', unidade: M, cc: 'loja', cargo: 'Motorista Entregador', papel: 'funcionario', chefe: 'marcos', genero: 'm', tempo: 'padrao' },
  { ref: 'mc_auxadm', unidade: M, cc: 'loja', cargo: 'Auxiliar Administrativo', papel: 'funcionario', chefe: 'marcos', genero: 'f', tempo: 'padrao' },
  { ref: 'mc_estag', unidade: M, cc: 'adm', cargo: 'Estagiário(a)', papel: 'funcionario', chefe: 'marcos', genero: 'f', tempo: 'novato', vinculo: 'estagiario' },
  { ref: 'mc_apr', unidade: M, cc: 'loja', cargo: 'Jovem Aprendiz', papel: 'funcionario', chefe: 'mc_sup', genero: 'm', tempo: 'novato', vinculo: 'aprendiz' },

  // ---------------------------------------------------------- Filial Norte (10)
  { ref: 'nt_ger', unidade: N, cc: 'loja', cargo: 'Gerente de Loja', papel: 'gestor', chefe: 'helena', genero: 'm', tempo: 'medio' },
  { ref: 'nt_vend1', unidade: N, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'nt_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'nt_vend2', unidade: N, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'nt_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'nt_vend3', unidade: N, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'nt_ger', genero: 'm', tempo: 'veterano' },
  { ref: 'nt_vend4', unidade: N, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'nt_ger', genero: 'f', tempo: 'novato' },
  { ref: 'nt_auxv', unidade: N, cc: 'loja', cargo: 'Auxiliar de Vendas', papel: 'funcionario', chefe: 'nt_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'nt_estoq', unidade: N, cc: 'loja', cargo: 'Estoquista', papel: 'funcionario', chefe: 'nt_ger', genero: 'm', tempo: 'medio' },
  { ref: 'nt_conf', unidade: N, cc: 'loja', cargo: 'Conferente', papel: 'funcionario', chefe: 'nt_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'nt_mot', unidade: N, cc: 'loja', cargo: 'Motorista Entregador', papel: 'funcionario', chefe: 'nt_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'nt_estag', unidade: N, cc: 'loja', cargo: 'Estagiário(a)', papel: 'funcionario', chefe: 'nt_ger', genero: 'f', tempo: 'novato', vinculo: 'estagiario' },

  // ---------------------------------------------------------- Filial Sul (10)
  { ref: 'sl_ger', unidade: S, cc: 'loja', cargo: 'Gerente de Loja', papel: 'gestor', chefe: 'helena', genero: 'f', tempo: 'medio' },
  { ref: 'sl_vend1', unidade: S, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'sl_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'sl_vend2', unidade: S, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'sl_ger', genero: 'f', tempo: 'medio' },
  { ref: 'sl_vend3', unidade: S, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'sl_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'sl_auxv', unidade: S, cc: 'loja', cargo: 'Auxiliar de Vendas', papel: 'funcionario', chefe: 'sl_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'sl_estoq', unidade: S, cc: 'loja', cargo: 'Estoquista', papel: 'funcionario', chefe: 'sl_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'sl_conf', unidade: S, cc: 'loja', cargo: 'Conferente', papel: 'funcionario', chefe: 'sl_ger', genero: 'f', tempo: 'veterano' },
  // A frota do grupo é registrada na DCS, mas este motorista roda a partir da
  // Filial Sul e o custo dele é da operação da Sul (Casa do Montador):
  // REGISTRO, LOTAÇÃO e CENTRO DE CUSTO em três empresas diferentes.
  { ref: 'sl_mot', unidade: S, cc: 'loja', registro: 'DCS', cargo: 'Motorista Entregador', papel: 'funcionario', chefe: 'sl_ger', genero: 'm', tempo: 'medio' },
  { ref: 'sl_estag', unidade: S, cc: 'loja', cargo: 'Estagiário(a)', papel: 'funcionario', chefe: 'sl_ger', genero: 'm', tempo: 'novato', vinculo: 'estagiario' },
  { ref: 'sl_apr', unidade: S, cc: 'loja', cargo: 'Jovem Aprendiz', papel: 'funcionario', chefe: 'sl_ger', genero: 'f', tempo: 'padrao', vinculo: 'aprendiz' },

  // ---------------------------------------------------------- Filial Leste (10)
  { ref: 'le_ger', unidade: L, cc: 'loja', cargo: 'Gerente de Loja', papel: 'gestor', chefe: 'helena', genero: 'm', tempo: 'veterano' },
  { ref: 'le_vend1', unidade: L, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'le_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'le_vend2', unidade: L, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'le_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'le_vend3', unidade: L, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'le_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'le_vend4', unidade: L, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'le_ger', genero: 'm', tempo: 'medio' },
  { ref: 'le_auxv', unidade: L, cc: 'loja', cargo: 'Auxiliar de Vendas', papel: 'funcionario', chefe: 'le_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'le_estoq', unidade: L, cc: 'loja', cargo: 'Estoquista', papel: 'funcionario', chefe: 'le_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'le_conf', unidade: L, cc: 'loja', cargo: 'Conferente', papel: 'funcionario', chefe: 'le_ger', genero: 'm', tempo: 'medio' },
  { ref: 'le_mot', unidade: L, cc: 'loja', cargo: 'Motorista Entregador', papel: 'funcionario', chefe: 'le_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'le_apr', unidade: L, cc: 'loja', cargo: 'Jovem Aprendiz', papel: 'funcionario', chefe: 'le_ger', genero: 'm', tempo: 'padrao', vinculo: 'aprendiz' },

  // ---------------------------------------------------------- Filial Oeste (10)
  { ref: 'oe_ger', unidade: O, cc: 'loja', cargo: 'Gerente de Loja', papel: 'gestor', chefe: 'helena', genero: 'f', tempo: 'medio' },
  { ref: 'oe_vend1', unidade: O, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'oe_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'oe_vend2', unidade: O, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'oe_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'oe_vend3', unidade: O, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'oe_ger', genero: 'm', tempo: 'medio' },
  { ref: 'oe_vend4', unidade: O, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'oe_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'oe_auxv', unidade: O, cc: 'loja', cargo: 'Auxiliar de Vendas', papel: 'funcionario', chefe: 'oe_ger', genero: 'm', tempo: 'novato' },
  { ref: 'oe_estoq', unidade: O, cc: 'loja', cargo: 'Estoquista', papel: 'funcionario', chefe: 'oe_ger', genero: 'm', tempo: 'padrao' },
  { ref: 'oe_conf', unidade: O, cc: 'loja', cargo: 'Conferente', papel: 'funcionario', chefe: 'oe_ger', genero: 'f', tempo: 'padrao' },
  { ref: 'oe_mot', unidade: O, cc: 'loja', cargo: 'Motorista Entregador', papel: 'funcionario', chefe: 'oe_ger', genero: 'm', tempo: 'medio' },
  { ref: 'oe_estag', unidade: O, cc: 'loja', cargo: 'Estagiário(a)', papel: 'funcionario', chefe: 'oe_ger', genero: 'f', tempo: 'padrao', vinculo: 'estagiario' },

  // ---------------------------------------------------------- desligados (8, últimos 12 meses)
  { ref: 'dsl1', unidade: M, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'marcos', genero: 'm', anos: 3.5, desligadoMeses: 2 },
  { ref: 'dsl2', unidade: N, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'nt_ger', genero: 'f', anos: 2.1, desligadoMeses: 4 },
  { ref: 'dsl3', unidade: S, cc: 'loja', cargo: 'Auxiliar de Vendas', papel: 'funcionario', chefe: 'sl_ger', genero: 'f', anos: 1.6, desligadoMeses: 6 },
  { ref: 'dsl4', unidade: L, cc: 'loja', cargo: 'Estoquista', papel: 'funcionario', chefe: 'le_ger', genero: 'm', anos: 4.2, desligadoMeses: 8 },
  { ref: 'dsl5', unidade: O, cc: 'loja', cargo: 'Motorista Entregador', papel: 'funcionario', chefe: 'oe_ger', genero: 'm', anos: 2.8, desligadoMeses: 10 },
  { ref: 'dsl6', unidade: M, cc: 'loja', cargo: 'Conferente', papel: 'funcionario', chefe: 'marcos', genero: 'm', anos: 5.5, desligadoMeses: 11 },
  { ref: 'dsl7', unidade: N, cc: 'loja', cargo: 'Vendedor(a)', papel: 'funcionario', chefe: 'nt_ger', genero: 'f', anos: 1.2, desligadoMeses: 1 },
  { ref: 'dsl8', unidade: O, cc: 'loja', cargo: 'Auxiliar Administrativo', papel: 'funcionario', chefe: 'oe_ger', genero: 'f', anos: 6.0, desligadoMeses: 7 },

  // ---------------------------------------------------------- personas dos papéis novos da 0019 (2)
  // Entram no FIM do array por dois motivos que NÃO são estética:
  //   1. rng — o stream de SEMENTE é consumido na ordem de QUADRO; estando por
  //      último, nome, CPF e salário dos 68 anteriores ficam byte a byte iguais;
  //   2. matrícula — `admissaoDias` as coloca como as DUAS admissões mais
  //      recentes de toda a empresa (o restante do quadro tem no mínimo 1 mês
  //      de casa), então elas ficam com as duas ÚLTIMAS matrículas e nenhuma
  //      das âncoras literais de 02-pessoas/05-ferias ('1013', '1043', '1045',
  //      '1020', '1030', '1003', '1033') se desloca. A conferência dura no fim
  //      deste módulo transforma qualquer deslocamento em erro alto, não em
  //      cenário silenciosamente trocado.
  // Cargo 'Analista de RH' para as duas: o time de gente de uma rede de 5 lojas
  // tem generalista, recrutamento e T&D no mesmo cargo — o que muda é a frente
  // de trabalho, e é isso que o PAPEL representa.
  { ref: 'solange', unidade: M, cc: 'CC-9000', cargo: 'Analista de RH', papel: 'recrutador', chefe: 'helena', genero: 'f', admissaoDias: 12, persona: 'solange' },
  { ref: 'rogerio', unidade: M, cc: 'CC-9000', cargo: 'Analista de RH', papel: 'lider_td', chefe: 'helena', genero: 'm', admissaoDias: 9, persona: 'rogerio' },
];

const TEMPO_DE_CASA = {
  novato: [0.04, 0.24], // até ~90 dias
  padrao: [1.0, 4.0],
  medio: [4.0, 8.0],
  veterano: [8.0, 10.0],
};

// ------------------------------------------------------------------ nascimento e gênero
//
// Os dois campos entraram em rh.colaborador pela migration 0020 e são o que
// destrava os relatórios de ANIVERSARIANTES e de DIVERSIDADE. A 0020 semeou um
// lastro derivado do CPF só para a base de DEV não nascer vazia, e registrou
// como pendência que o povoador precisava assumir o preenchimento — é o que
// este bloco faz. Rodar `npm run db:demo` agora não zera mais os dois campos.

/**
 * Faixa de idade NA ADMISSÃO por cargo (mín, máx). Sorteia-se a idade na
 * admissão, não a de hoje: o CHECK colaborador_data_nascimento_plausivel exige
 * nascimento anterior à admissão, e a idade de hoje sai naturalmente somando o
 * tempo de casa (um veterano de 9 anos fica realmente mais velho).
 * Aprendiz e estagiário respeitam a faixa legal dos programas (Lei 10.097 e
 * Lei 11.788): entram jovens e envelhecem só o tempo do contrato.
 */
const IDADE_NA_ADMISSAO = {
  'Diretor(a) de Operações': [35, 45],
  'Gerente de Loja': [30, 45],
  'Supervisor(a) Comercial': [27, 42],
  'Vendedor(a)': [21, 40],
  'Auxiliar de Vendas': [19, 30],
  Estoquista: [20, 42],
  Conferente: [23, 44],
  'Motorista Entregador': [25, 48],
  'Analista de RH': [25, 40],
  'Assistente de DP': [24, 40],
  'Analista Financeiro': [26, 42],
  'Auxiliar Administrativo': [19, 35],
  'Comprador(a)': [28, 45],
  'Estagiário(a)': [19, 24],
  'Jovem Aprendiz': [16, 20],
};

/**
 * ANIVERSARIANTES DO MÊS CORRENTE — 6 pessoas do quadro (todas ATIVAS: o
 * relatório considera status <> 'desligado'), com o dia fixado. Sem isto o
 * relatório de aniversariantes abre vazio na apresentação, porque a chance de o
 * sorteio cair no mês certo é de 1/12 por pessoa.
 * Dia sempre ≤ 28 para existir em qualquer mês — a demo roda em fevereiro
 * também. Duas das seis são personas (gestor e funcionário), para o
 * apresentador reconhecer os nomes na lista.
 */
const ANIVERSARIANTES_DO_MES = [
  ['marcos', 4], // persona gestor
  ['juliana', 9], // persona funcionário
  ['nt_vend1', 13],
  ['sl_estoq', 18],
  ['le_auxv', 23],
  ['oe_ger', 27],
];

/**
 * Gênero AUTODECLARADO. Regra geral: coerente com o nome de batismo (uma demo
 * em que "Juliana" aparece como masculino lê-se como bug, não como diversidade).
 * As exceções abaixo são as pessoas que declararam algo diferente do que o nome
 * sugere — 'outro' e 'nao_informado' FICAM na amostra de propósito: são o
 * recorte pequeno que faz o relatório de diversidade ter de suprimir célula,
 * e é isso que precisa ser mostrado funcionando.
 * Distribuição resultante nos 70: 31 feminino (44%), 37 masculino (53%),
 * 1 outro e 1 não informado (~3% de resto) — conferida no fim do módulo.
 */
const GENERO_DECLARADO = {
  le_vend4: 'outro',
  sl_vend1: 'nao_informado',
};

const RETRATOS = {
  'Diretor(a) de Operações': 'Conduz o comitê mensal de resultados e o plano de expansão da rede.',
  'Gerente de Loja': 'Sustenta a meta da unidade e desenvolve a equipe no salão.',
  'Supervisor(a) Comercial': 'Acompanha meta individual e mix da equipe de vendas.',
  'Vendedor(a)': 'Carteira ativa de clientes de obra; forte em orçamento de drywall.',
  'Auxiliar de Vendas': 'Apoia o balcão e mantém o cadastro de clientes em dia.',
  Estoquista: 'Referência em endereçamento e inventário rotativo da unidade.',
  Conferente: 'Rigoroso na conferência cega; baixo índice de divergência.',
  'Motorista Entregador': 'Entrega em obra com bom retorno de cliente e zero sinistro.',
  'Analista de RH': 'Conduz seleção, integração e o ciclo de avaliação da rede.',
  'Assistente de DP': 'Cuida da rotina de folha, férias e eSocial das cinco unidades.',
  'Analista Financeiro': 'Responsável pela conciliação e pelo fluxo de caixa consolidado.',
  'Auxiliar Administrativo': 'Organiza documentação e o protocolo interno da unidade.',
  'Comprador(a)': 'Negocia com a indústria e sustenta o nível de estoque da rede.',
  'Estagiário(a)': 'Em formação, com plano de atividades e avaliação semestral.',
  'Jovem Aprendiz': 'Programa de aprendizagem em curso, alternando SENAC e prática na loja.',
};

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  const rng = aleatorio(SEMENTE);
  const proximoNome = criarGeradorNomes(rng);
  const senhaHash = hashSenha(SENHA_DEMO); // um hash só: 68 bcrypts seriam lentos à toa

  // ---------------------------------------------------------- estrutura do grupo
  // Três catálogos separados (migration 0047): REGISTRO (empresa/CNPJ),
  // LOTAÇÃO (local físico, sem CNPJ próprio) e CENTRO DE CUSTO.
  const inicioEstrutura = iso(anosAtras(12)); // a Fast já tinha as 5 unidades

  // -- REGISTRO: uma inscrição por empresa do grupo. A que ainda está em
  // constituição entra com CNPJ NULL — o mapa é por ÍNDICE de inserção (o
  // Postgres devolve o RETURNING na ordem do VALUES), não por CNPJ, justamente
  // porque agora existe empresa sem ele.
  const cnpjs = EMPRESAS.map((empresa, indice) =>
    empresa.semCnpj ? null : cnpjValido(RAIZ_CNPJ, indice + 1)
  );
  const empresasCriadas = await inserirLote(
    cliente,
    'rh.empresa_grupo',
    ['cnpj'],
    cnpjs.map((cnpj) => [cnpj]),
    'id'
  );
  const empresaIdPorNome = new Map(
    EMPRESAS.map((empresa, indice) => [empresa.nome, Number(empresasCriadas[indice].id)])
  );
  await inserirLote(
    cliente,
    'rh.empresa_grupo_versao',
    ['empresa_id', 'razao_social', 'nome_fantasia', 'tipo', 'status', 'inicio_vigencia'],
    EMPRESAS.map((empresa) => [
      empresaIdPorNome.get(empresa.nome),
      // Sem CNPJ não há contrato social registrado: a razão social também
      // ainda não existe. Deixar em branco é mais honesto do que inventar.
      empresa.semCnpj ? null : `${RAZAO_SOCIAL} — ${empresa.nome}`,
      empresa.nome,
      empresa.tipo,
      'ativa',
      // A empresa em constituição nasce HOJE; as outras já existem há 12 anos.
      empresa.semCnpj ? iso(hoje()) : inicioEstrutura,
    ])
  );

  // -- LOTAÇÃO: o prédio. Sem CNPJ — quem tem CNPJ é a empresa.
  const estabs = await inserirLote(
    cliente,
    'rh.estabelecimento',
    ['cnpj'],
    UNIDADES.map(() => [null]),
    'id'
  );
  const idPorUnidade = new Map(
    UNIDADES.map((unidade, indice) => [unidade.nome, Number(estabs[indice].id)])
  );

  const versoesEstab = await inserirLote(
    cliente,
    'rh.estabelecimento_versao',
    ['estabelecimento_id', 'razao_social', 'unidade', 'endereco_resumido', 'status', 'inicio_vigencia'],
    UNIDADES.map((unidade) => [
      idPorUnidade.get(unidade.nome),
      null,
      unidade.nome,
      unidade.endereco,
      'ativa',
      inicioEstrutura,
    ]),
    'id, estabelecimento_id'
  );
  const versaoPorEstab = new Map(
    versoesEstab.map((linha) => [Number(linha.estabelecimento_id), Number(linha.id)])
  );

  // -- CENTRO DE CUSTO: código + nome, mantido pela empresa do local.
  const centrosDesejados = [];
  for (const unidade of UNIDADES) {
    const empresaId = empresaIdPorNome.get(unidade.empresa);
    centrosDesejados.push([empresaId, unidade.ccLoja, `Operação ${unidade.nome}`]);
    if (unidade.ccAdm) {
      centrosDesejados.push([empresaId, unidade.ccAdm, `Administrativo ${unidade.nome}`]);
    }
  }
  for (const centro of CENTROS_DO_GRUPO) {
    centrosDesejados.push([
      empresaIdPorNome.get(centro.empresa),
      centro.codigo,
      centro.nome,
    ]);
  }
  const centrosCriados = await inserirLote(
    cliente,
    'rh.centro_custo',
    ['empresa_id', 'codigo'],
    centrosDesejados.map(([empresaId, codigo]) => [empresaId, codigo]),
    'id, empresa_id, codigo'
  );
  const centroIdPorCodigo = new Map(
    centrosCriados.map((linha) => [linha.codigo, Number(linha.id)])
  );
  await inserirLote(
    cliente,
    'rh.centro_custo_versao',
    ['centro_custo_id', 'nome', 'status', 'inicio_vigencia'],
    centrosDesejados.map(([, codigo, nome]) => [
      centroIdPorCodigo.get(codigo),
      nome,
      'ativa',
      inicioEstrutura,
    ])
  );

  const unidades = new Map(
    UNIDADES.map((unidade) => {
      const estabelecimentoId = idPorUnidade.get(unidade.nome);
      return [
        unidade.nome,
        {
          id: estabelecimentoId,
          versaoId: versaoPorEstab.get(estabelecimentoId),
          empresaId: empresaIdPorNome.get(unidade.empresa),
          ...unidade,
          ccAdm: unidade.ccAdm ?? unidade.ccLoja,
        },
      ];
    })
  );
  log(
    `01-base: ${EMPRESAS.length} empresas do grupo (${EMPRESAS.filter((e) => e.semCnpj).length} ` +
      `sem CNPJ ainda), ${unidades.size} locais de trabalho e ${centrosDesejados.length} ` +
      'centros de custo.'
  );

  // ---------------------------------------------------------- cargos + faixas
  // A descrição/CHA do cargo é estável (vigente há 12 anos); a tabela salarial
  // é reajustada todo ano — a versão vigente começa em 1º de janeiro.
  const inicioTabela = `${new Date().getUTCFullYear()}-01-01`;

  // rh.cargo só tem identidade; as ids saem em ordem crescente de inserção e a
  // tabela acabou de ser esvaziada pelo 00-limpar — o ORDER BY id devolve os
  // cargos exatamente na ordem de CARGOS.
  await cliente.query(
    'INSERT INTO rh.cargo (criado_em) SELECT now() FROM generate_series(1, $1)',
    [CARGOS.length]
  );
  const { rows: idsCargo } = await cliente.query('SELECT id FROM rh.cargo ORDER BY id');
  if (idsCargo.length !== CARGOS.length) {
    throw new Error(`Esperava ${CARGOS.length} cargos, encontrei ${idsCargo.length}.`);
  }
  const cargoIdPorIndice = idsCargo.map((linha) => Number(linha.id));

  const versoesCargo = await inserirLote(
    cliente,
    'rh.cargo_versao',
    ['cargo_id', 'nome', 'descricao', 'cha', 'status', 'inicio_vigencia'],
    CARGOS.map((cargo, indice) => [
      cargoIdPorIndice[indice],
      cargo.nome,
      cargo.descricao,
      JSON.stringify(cargo.cha),
      'ativa',
      inicioEstrutura,
    ]),
    'id, cargo_id'
  );
  const versaoPorCargo = new Map(
    versoesCargo.map((linha) => [Number(linha.cargo_id), Number(linha.id)])
  );

  await inserirLote(
    cliente,
    'rh.tabela_salarial_versao',
    ['cargo_id', 'faixa_min', 'faixa_max', 'status', 'inicio_vigencia'],
    CARGOS.map((cargo, indice) => [
      cargoIdPorIndice[indice],
      cargo.faixa[0].toFixed(2),
      cargo.faixa[1].toFixed(2),
      'ativa',
      inicioTabela,
    ])
  );

  const cargos = new Map(
    CARGOS.map((cargo, indice) => [
      cargo.nome,
      {
        id: cargoIdPorIndice[indice],
        versaoId: versaoPorCargo.get(cargoIdPorIndice[indice]),
        faixa: cargo.faixa,
      },
    ])
  );
  log(`01-base: ${cargos.size} cargos com versão vigente e faixa salarial.`);

  // ---------------------------------------------------------- pessoas: nome, CPF, datas, salário
  const emailsUsados = new Set();
  function gerarEmail(nomeCompleto) {
    const partes = nomeCompleto.split(' ');
    const base = `${semAcento(partes[0])}.${semAcento(partes[partes.length - 1])}`;
    let candidato = `${base}@${DOMINIO}`;
    let sufixo = 2;
    while (emailsUsados.has(candidato)) {
      candidato = `${base}${sufixo}@${DOMINIO}`;
      sufixo += 1;
    }
    emailsUsados.add(candidato);
    return candidato;
  }

  const pessoas = QUADRO.map((linha) => {
    const persona = linha.persona ? PERSONAS[linha.persona] : null;
    const nome = persona ? persona.nome : proximoNome(linha.genero);
    const email = persona ? persona.email : gerarEmail(nome);
    if (persona) emailsUsados.add(email);

    // `admissaoDias` (dias atrás) é a única forma de cravar uma admissão mais
    // recente que qualquer outra: anosAtras arredonda para MESES inteiros, e o
    // quadro todo cai em 1 mês ou mais de casa.
    const anos =
      linha.admissaoDias !== undefined
        ? linha.admissaoDias / 365
        : (linha.anos ??
          (() => {
            const [min, max] = TEMPO_DE_CASA[linha.tempo];
            return min + rng() * (max - min);
          })());
    const admissao =
      linha.admissaoDias !== undefined
        ? dataRelativa(-linha.admissaoDias)
        : anosAtras(anos);
    const desligamento = linha.desligadoMeses ? mesesAtras(linha.desligadoMeses) : null;

    const faixa = cargos.get(linha.cargo).faixa;
    // Salário sobe com o tempo de casa, com dispersão para não ficar artificial.
    const maturidade = Math.min(1, anos / 8);
    const fator = Math.min(0.96, 0.08 + 0.62 * maturidade + rng() * 0.26);
    const salario = arredondarDezena(faixa[0] + (faixa[1] - faixa[0]) * fator);

    return {
      ...linha,
      persona,
      nome,
      email,
      cpf: cpfValido(rng),
      admissao,
      desligamento,
      salario,
      vinculo: linha.vinculo ?? 'clt',
      ativo: !linha.desligadoMeses,
    };
  });

  // Matrícula na ordem de admissão — é assim que a numeração do Nasajon cresce.
  const porAdmissao = pessoas
    .slice()
    .sort((a, b) => (a.admissao - b.admissao) || a.ref.localeCompare(b.ref));
  porAdmissao.forEach((pessoa, indice) => {
    pessoa.matricula = String(MATRICULA_INICIAL + indice);
  });

  // ---------------------------------------------------------- nascimento e gênero autodeclarado
  // Stream próprio (SEMENTE_NASCIMENTO) e passada SEPARADA, depois de matrícula
  // e admissão já definidas: nada aqui pode empurrar o stream de SEMENTE.
  const rngNasc = aleatorio(SEMENTE_NASCIMENTO);
  const mesCorrente = hoje().getUTCMonth() + 1;
  const diaDoAniversario = new Map(ANIVERSARIANTES_DO_MES);
  const outrosMeses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(
    (mes) => mes !== mesCorrente
  );

  for (const pessoa of pessoas) {
    const faixa = IDADE_NA_ADMISSAO[pessoa.cargo];
    if (!faixa) throw new Error(`Sem faixa de idade para o cargo ${pessoa.cargo}`);
    const idadeNaAdmissao = inteiro(rngNasc, faixa[0], faixa[1]);

    const diaFixo = diaDoAniversario.get(pessoa.ref);
    const mes = diaFixo ? mesCorrente : escolher(rngNasc, outrosMeses);
    const dia = diaFixo ?? inteiro(rngNasc, 1, 28);

    // O ano sai da idade na admissão; o laço é uma trava, não a regra: com
    // idade mínima de 16 anos o nascimento já cai muito antes da admissão, mas
    // se um dia a faixa de algum cargo encostar no limite, o CHECK do banco
    // avisaria com um 23514 cru em vez de um dado plausível.
    let ano = pessoa.admissao.getUTCFullYear() - idadeNaAdmissao;
    let nascimento = new Date(Date.UTC(ano, mes - 1, dia));
    while (nascimento >= pessoa.admissao) {
      ano -= 1;
      nascimento = new Date(Date.UTC(ano, mes - 1, dia));
    }
    pessoa.nascimento = nascimento;

    pessoa.generoDeclarado =
      GENERO_DECLARADO[pessoa.ref] ??
      (pessoa.genero === 'f' ? 'feminino' : 'masculino');
  }

  // ---------------------------------------------------------- usuários + colaboradores
  // Espelha PAPEIS_COM_2FA de src/dominios/identidade/servico.ts — `recrutador`
  // e `lider_td` também exigem 2FA (veem dado de pessoa além do próprio). Sem
  // as duas chaves aqui, a demo travaria no enrolamento justamente nas contas
  // criadas para demonstrar a segregação.
  const PAPEIS_COM_2FA = new Set([
    'rh',
    'recrutador',
    'lider_td',
    'dp',
    'diretoria',
    'admin',
  ]);

  // 2FA já configurado para quem o app obriga — a demo não trava no
  // enrolamento. O secret é determinístico: resetar não invalida o QR Code.
  for (const pessoa of pessoas) {
    pessoa.totpSecret =
      pessoa.ativo && PAPEIS_COM_2FA.has(pessoa.papel) ? segredoTotp(rng) : null;
  }

  // A PESSOA nasce primeiro (migration 0046): é dela o CPF, o nome, o
  // nascimento, o gênero e o retrato. Depois a CONTA, ligada à pessoa. Só
  // então o VÍNCULO — que só carrega o que é do contrato; o resto desce
  // sozinho pelo trigger de projeção.
  const pessoasCriadas = await inserirLote(
    cliente,
    'rh.pessoa',
    ['cpf', 'nome_completo', 'data_nascimento', 'genero', 'retrato'],
    pessoas.map((p) => [
      p.cpf,
      p.nome,
      iso(p.nascimento),
      p.generoDeclarado,
      p.persona ? p.persona.descricao : (RETRATOS[p.cargo] ?? null),
    ]),
    'id, cpf'
  );
  const pessoaPorCpf = new Map(pessoasCriadas.map((linha) => [linha.cpf, Number(linha.id)]));
  for (const pessoa of pessoas) {
    pessoa.pessoaId = pessoaPorCpf.get(pessoa.cpf);
    if (!pessoa.pessoaId) throw new Error(`Pessoa não retornada para o CPF ${pessoa.cpf}`);
  }

  const usuarios = await inserirLote(
    cliente,
    'sistema.usuario',
    ['email', 'nome', 'senha_hash', 'papel', 'ativo', 'totp_secret', 'pessoa_id'],
    pessoas.map((p) => [
      p.email, p.nome, senhaHash, p.papel, p.ativo, p.totpSecret, p.pessoaId,
    ]),
    'id, email'
  );
  const usuarioPorEmail = new Map(usuarios.map((linha) => [linha.email, Number(linha.id)]));
  for (const pessoa of pessoas) {
    pessoa.usuarioId = usuarioPorEmail.get(pessoa.email);
    if (!pessoa.usuarioId) throw new Error(`Usuário não retornado para ${pessoa.email}`);
  }

  const colaboradores = await inserirLote(
    cliente,
    'rh.colaborador',
    [
      'pessoa_id', 'matricula', 'matricula_esocial', 'tipo_vinculo',
      'data_admissao', 'status', 'data_desligamento',
    ],
    pessoas.map((p) => [
      p.pessoaId,
      p.matricula,
      p.matricula, // matricula_esocial = matricula (RET), decisão de 2026-07-27
      p.vinculo,
      iso(p.admissao),
      p.ativo ? 'ativo' : 'desligado',
      p.desligamento ? iso(p.desligamento) : null,
    ]),
    'id, matricula'
  );
  const colaboradorPorMatricula = new Map(
    colaboradores.map((linha) => [linha.matricula, Number(linha.id)])
  );

  const porRef = new Map();
  for (const pessoa of pessoas) {
    pessoa.colaboradorId = colaboradorPorMatricula.get(pessoa.matricula);
    if (!pessoa.colaboradorId) {
      throw new Error(`Colaborador não retornado para a matrícula ${pessoa.matricula}`);
    }
    porRef.set(pessoa.ref, pessoa);
  }
  log(`01-base: ${pessoas.length} colaboradores (${pessoas.filter((p) => p.ativo).length} ativos, ${pessoas.filter((p) => !p.ativo).length} desligados).`);

  // O registrador dos eventos de admissão é a DP — é quem faz isso na vida real.
  const registrador = porRef.get('patricia').usuarioId;

  // ---------------------------------------------------------- posição, lotação, gestor, linha do tempo
  const ROTULO_VINCULO = {
    clt: 'CLT',
    estagiario: 'Estagiário',
    aprendiz: 'Aprendiz',
    pj: 'PJ',
    temporario: 'Temporário',
  };
  const paraBr = (dataIso) => dataIso.split('-').reverse().join('/');

  const posicoes = [];
  const lotacoes = [];
  const relacoes = [];
  const eventos = [];

  for (const pessoa of pessoas) {
    const cargo = cargos.get(pessoa.cargo);
    const unidade = unidades.get(pessoa.unidade);
    // OS TRÊS CAMPOS SÃO INDEPENDENTES (0047), e é aqui que isso vira dado:
    //   REGISTRO        = pessoa.registro, quando ela é contratada por uma
    //                     empresa do grupo diferente da dona do local;
    //   LOTAÇÃO         = pessoa.unidade, sempre o prédio onde ela trabalha;
    //   CENTRO DE CUSTO = pessoa.cc, que aceita o código literal de um centro
    //                     que não é de local nenhum (o CSC).
    // Sem override, o padrão continua sendo o óbvio: registrada na empresa dona
    // do local e custo no centro daquele local.
    const cc = pessoa.cc ?? 'loja';
    const centroCusto = cc.startsWith('CC-')
      ? cc
      : cc === 'adm'
        ? unidade.ccAdm
        : unidade.ccLoja;
    const centroCustoId = centroIdPorCodigo.get(centroCusto);
    if (!centroCustoId) {
      throw new Error(`Centro de custo ${centroCusto} não existe (ref ${pessoa.ref}).`);
    }
    const empresaId = pessoa.registro
      ? empresaIdPorNome.get(pessoa.registro)
      : unidade.empresaId;
    if (!empresaId) {
      throw new Error(`Empresa de registro ${pessoa.registro} não existe (ref ${pessoa.ref}).`);
    }
    const inicio = iso(pessoa.admissao);

    // Posição e lotação ficam ABERTAS mesmo para desligados: é o que o app faz
    // ao encerrar um processo (ver src/dominios/desligamento/servico.ts) — a
    // ficha do desligado continua mostrando cargo, salário e unidade do
    // desligamento. A LIDERANÇA é o contrário e fecha logo abaixo.
    posicoes.push([pessoa.colaboradorId, cargo.versaoId, pessoa.salario.toFixed(2), inicio]);
    // Os três campos, na mesma linha de vigência.
    lotacoes.push([
      pessoa.colaboradorId,
      empresaId,
      unidade.id,
      centroCustoId,
      inicio,
    ]);

    if (pessoa.chefe) {
      const gestor = porRef.get(pessoa.chefe);
      if (!gestor) throw new Error(`Chefe inexistente no quadro: ${pessoa.chefe}`);
      // A relação começa na mais recente das duas admissões (o gestor não pode
      // liderar antes de existir na empresa).
      const inicioRelacaoData =
        pessoa.admissao > gestor.admissao ? pessoa.admissao : gestor.admissao;
      // E ACABA COM O CONTRATO, dos dois lados: quem saiu não é mais liderado
      // vigente de ninguém nem gestor vigente de ninguém. Deixar aberta era o
      // que fazia o desligado continuar aparecendo na equipe do gestor e a
      // equipe de um gestor desligado continuar pendurada nele.
      const saidas = [pessoa.desligamento, gestor.desligamento].filter(Boolean);
      const primeiraSaida = saidas.length
        ? saidas.reduce((a, b) => (a < b ? a : b))
        : null;
      const fimRelacao = primeiraSaida
        ? iso(primeiraSaida < inicioRelacaoData ? inicioRelacaoData : primeiraSaida)
        : null;
      relacoes.push([
        gestor.colaboradorId,
        pessoa.colaboradorId,
        iso(inicioRelacaoData),
        fimRelacao,
      ]);
    }

    eventos.push([
      pessoa.colaboradorId,
      'admissao',
      `${inicio}T00:00:00Z`,
      'rh.colaborador',
      pessoa.colaboradorId,
      `Admissão de ${pessoa.nome} (matrícula ${pessoa.matricula}) como ${ROTULO_VINCULO[pessoa.vinculo]} em ${paraBr(inicio)}`,
      JSON.stringify({ tipo_vinculo: pessoa.vinculo, data_admissao: inicio }),
      registrador,
    ]);
    eventos.push([
      pessoa.colaboradorId,
      'posicao_inicial',
      `${inicio}T00:00:00Z`,
      'rh.posicao_colaborador',
      null,
      `Posição inicial: ${pessoa.cargo} a partir de ${paraBr(inicio)} (admissão)`,
      JSON.stringify({ motivo: 'admissao', cargo_versao_id: cargo.versaoId }),
      registrador,
    ]);

    if (!pessoa.ativo) {
      const dataSaida = iso(pessoa.desligamento);
      eventos.push([
        pessoa.colaboradorId,
        'desligamento',
        `${dataSaida}T00:00:00Z`,
        'rh.colaborador',
        pessoa.colaboradorId,
        `Desligamento de ${pessoa.nome} (matrícula ${pessoa.matricula}) em ${paraBr(dataSaida)}`,
        JSON.stringify({ data_desligamento: dataSaida }),
        registrador,
      ]);
    }
  }

  await inserirLote(
    cliente,
    'rh.posicao_colaborador',
    ['colaborador_id', 'cargo_versao_id', 'salario', 'inicio_vigencia'],
    posicoes
  );
  await inserirLote(
    cliente,
    'rh.lotacao',
    ['colaborador_id', 'empresa_id', 'estabelecimento_id', 'centro_custo_id', 'inicio_vigencia'],
    lotacoes
  );
  await inserirLote(
    cliente,
    'rh.relacao_gestor',
    ['gestor_colaborador_id', 'liderado_colaborador_id', 'inicio_vigencia', 'fim_vigencia'],
    relacoes
  );
  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    ['colaborador_id', 'tipo', 'ocorrido_em', 'origem_tabela', 'origem_id', 'resumo', 'payload', 'registrado_por'],
    eventos
  );
  log('01-base: posição, lotação, relação gestor e linha do tempo gravadas.');

  // ---------------------------------------------------------- conferências duras
  const conferir = async (rotulo, sql, esperado) => {
    const { rows } = await cliente.query(sql);
    const obtido = Number(rows[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await conferir(
    'ativos sem posição vigente',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.posicao_colaborador p
                         WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL)`,
    0
  );
  await conferir(
    'ativos sem lotação vigente',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.lotacao l
                         WHERE l.colaborador_id = c.id AND l.fim_vigencia IS NULL)`,
    0
  );
  // A ONDA I INTEIRA FICA INVISÍVEL se os três campos coincidirem sempre: a
  // tela mostraria "unidade" três vezes com nome diferente e ninguém veria o
  // que mudou. Estas duas conferências garantem que a demo tem o caso do dono.
  const { rows: cruzamentos } = await cliente.query(
    `SELECT
       count(*) FILTER (WHERE l.empresa_id <> cc.empresa_id)::int AS custo_em_outra_empresa,
       count(DISTINCT l.empresa_id)::int                          AS empresas_com_gente,
       (SELECT count(*)::int FROM (
          SELECT estabelecimento_id FROM rh.lotacao
           WHERE fim_vigencia IS NULL
           GROUP BY estabelecimento_id
          HAVING count(DISTINCT empresa_id) > 1) AS x)             AS locais_com_duas_empresas
     FROM rh.lotacao l
     JOIN rh.centro_custo cc ON cc.id = l.centro_custo_id
    WHERE l.fim_vigencia IS NULL`
  );
  if (Number(cruzamentos[0].custo_em_outra_empresa) === 0) {
    throw new Error(
      'Nenhum colaborador tem o custo caindo em centro de custo mantido por OUTRA empresa do ' +
        'grupo — o exemplo do dono ("registrado na Supply, custo no CSC") sumiu do QUADRO.'
    );
  }
  if (Number(cruzamentos[0].locais_com_duas_empresas) === 0) {
    throw new Error(
      'Todo local de trabalho tem gente de uma empresa só — some o REGISTRO de alguém para ' +
        'outra empresa do grupo, senão LOTAÇÃO e REGISTRO parecem a mesma coisa na tela.'
    );
  }
  if (Number(cruzamentos[0].empresas_com_gente) < 3) {
    throw new Error(
      `Só ${cruzamentos[0].empresas_com_gente} empresa(s) do grupo têm gente registrada — a ` +
        'demo precisa mostrar o quadro repartido entre os CNPJs.'
    );
  }
  log(
    `01-base: os três campos separados — ${cruzamentos[0].empresas_com_gente} empresas com ` +
      `gente registrada, ${cruzamentos[0].locais_com_duas_empresas} local(is) com gente de mais ` +
      `de uma empresa e ${cruzamentos[0].custo_em_outra_empresa} vínculo(s) com o custo em ` +
      'centro mantido por outra empresa.'
  );
  await conferir(
    'ativos sem gestor vigente (fora a diretoria)',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE c.status = 'ativo' AND u.papel <> 'diretoria'
        AND NOT EXISTS (SELECT 1 FROM rh.relacao_gestor g
                         WHERE g.liderado_colaborador_id = c.id AND g.fim_vigencia IS NULL)`,
    0
  );
  // A liderança acaba com o contrato: nenhuma relação vigente pode envolver
  // quem já saiu — nem como liderado, nem como gestor de uma equipe pendurada.
  await conferir(
    'liderança vigente com vínculo desligado',
    `SELECT count(*)::int AS total FROM rh.relacao_gestor rg
      WHERE rg.fim_vigencia IS NULL
        AND EXISTS (SELECT 1 FROM rh.colaborador c
                     WHERE c.id IN (rg.liderado_colaborador_id, rg.gestor_colaborador_id)
                       AND c.status = 'desligado')`,
    0
  );
  await conferir(
    'fichas sem data de nascimento',
    'SELECT count(*)::int AS total FROM rh.colaborador WHERE data_nascimento IS NULL',
    0
  );
  await conferir(
    'nascimento fora da faixa plausível de idade (16 a 70 anos hoje)',
    `SELECT count(*)::int AS total FROM rh.colaborador
      WHERE date_part('year', age(data_nascimento)) NOT BETWEEN 16 AND 70`,
    0
  );
  // O relatório de aniversariantes é o que a analista pediu e o que abre a
  // apresentação: se ele nascer vazio, isto quebra aqui e não na frente do RH.
  await conferir(
    'aniversariantes do mês corrente no quadro',
    `SELECT count(*)::int AS total FROM rh.colaborador
      WHERE status <> 'desligado'
        AND date_part('month', data_nascimento)
            = date_part('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)`,
    ANIVERSARIANTES_DO_MES.length
  );
  const esperadoPorGenero = pessoas.reduce((acumulado, pessoa) => {
    acumulado[pessoa.generoDeclarado] = (acumulado[pessoa.generoDeclarado] ?? 0) + 1;
    return acumulado;
  }, {});
  const { rows: distribuicao } = await cliente.query(
    'SELECT genero, count(*)::int AS total FROM rh.colaborador GROUP BY genero'
  );
  const obtidoPorGenero = new Map(distribuicao.map((linha) => [linha.genero, linha.total]));
  if (obtidoPorGenero.size !== Object.keys(esperadoPorGenero).length) {
    throw new Error(
      `Gêneros no banco (${[...obtidoPorGenero.keys()].sort().join(', ')}) diferem dos ` +
        `esperados (${Object.keys(esperadoPorGenero).sort().join(', ')}).`
    );
  }
  for (const [genero, esperado] of Object.entries(esperadoPorGenero)) {
    const obtido = obtidoPorGenero.get(genero) ?? 0;
    if (obtido !== esperado) {
      throw new Error(
        `Invariante quebrada — gênero autodeclarado "${genero}": esperado ${esperado}, obtido ${obtido}`
      );
    }
  }
  log(
    '01-base: gênero autodeclarado — ' +
      Object.entries(esperadoPorGenero)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([genero, total]) =>
            `${genero} ${total} (${((total / pessoas.length) * 100).toFixed(1)}%)`
        )
        .join(', ')
  );

  // ÂNCORAS DE MATRÍCULA — 02-pessoas e 05-ferias montam cenários em matrículas
  // LITERAIS. Se um dia alguém mudar QUADRO/rng e essas matrículas mudarem de
  // dono, aqueles módulos passariam a plantar o cenário na pessoa errada sem
  // reclamar. Aqui isso vira erro alto.
  const ANCORAS = [
    ['1013', PERSONAS.marcos.nome], // MAT_GESTOR em 02-pessoas
    ['1043', PERSONAS.juliana.nome], // MAT_FUNCIONARIO em 02-pessoas
  ];
  for (const [matricula, nomeEsperado] of ANCORAS) {
    const { rows } = await cliente.query(
      'SELECT nome_completo FROM rh.colaborador WHERE matricula = $1',
      [matricula]
    );
    if (rows[0]?.nome_completo !== nomeEsperado) {
      throw new Error(
        `Âncora de matrícula deslocada — ${matricula} deveria ser "${nomeEsperado}" e é ` +
          `"${rows[0]?.nome_completo ?? '(inexistente)'}". 02-pessoas e 05-ferias ancoram ` +
          'cenários nessa matrícula: conserte QUADRO/rng antes de seguir.'
      );
    }
  }

  // As duas personas dos papéis novos têm de ser as ÚLTIMAS matrículas — é o que
  // garante que acrescentá-las não empurrou ninguém.
  for (const ref of ['solange', 'rogerio']) {
    const pessoa = porRef.get(ref);
    const posicaoEsperada = MATRICULA_INICIAL + pessoas.length - 2;
    if (Number(pessoa.matricula) < posicaoEsperada) {
      throw new Error(
        `A persona ${ref} recebeu a matrícula ${pessoa.matricula}, que não está entre as duas ` +
          'últimas — a admissão dela deixou de ser a mais recente e deslocou o quadro.'
      );
    }
  }

  // ---------------------------------------------------------- contexto de saída
  const personas = Object.entries(PERSONAS).map(([ref, dados]) => {
    const pessoa = porRef.get(ref);
    return {
      ref,
      email: dados.email,
      nome: pessoa.nome,
      papel: pessoa.papel,
      cargo: pessoa.cargo,
      unidade: pessoa.unidade,
      matricula: pessoa.matricula,
      descricao: dados.descricao,
      totp_secret: pessoa.totpSecret,
      otpauth_uri: pessoa.totpSecret ? uriOtpauth(dados.email, pessoa.totpSecret) : null,
    };
  });

  log(
    `01-base: ${ANIVERSARIANTES_DO_MES.length} aniversariantes no mês corrente — ` +
      ANIVERSARIANTES_DO_MES.map(
        ([ref, dia]) => `dia ${dia}: ${porRef.get(ref).nome}`
      ).join(' · ')
  );

  log('\n01-base: personas de demonstração');
  for (const persona of personas) {
    log(`  ${persona.papel.padEnd(10)} ${persona.email.padEnd(34)} ${persona.nome} — ${persona.cargo} (${persona.unidade})`);
    if (persona.otpauth_uri) log(`             2FA: ${persona.otpauth_uri}`);
  }

  return {
    senhaDemo: SENHA_DEMO,
    personas,
    porMatricula: new Map(pessoas.map((p) => [p.matricula, p])),
    porEmail: new Map(pessoas.map((p) => [p.email, p])),
    unidades,
    cargos,
    gestores: pessoas.filter((p) => pessoas.some((outra) => outra.chefe === p.ref)),
    ativos: pessoas.filter((p) => p.ativo),
    desligados: pessoas.filter((p) => !p.ativo),
  };
}

module.exports = { semear, SENHA_DEMO, PERSONAS, UNIDADES, CARGOS };

if (require.main === module) {
  executarSozinho('01-base', semear);
}
