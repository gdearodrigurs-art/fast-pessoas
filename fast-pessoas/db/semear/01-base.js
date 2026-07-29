// db/semear/01-base.js — o NÚCLEO da demonstração: a empresa fictícia Fast.
//
// Perfil (o mesmo em TODOS os módulos de semeadura — coerência é obrigatória):
//   Fast — distribuidora de materiais de construção/drywall, 5 unidades:
//   Matriz Centro, Filial Norte, Filial Sul, Filial Leste, Filial Oeste.
//   60 colaboradores ativos + 8 desligados nos últimos 12 meses.
//
// O que este módulo cria:
//   • 5 estabelecimentos com versão vigente (CNPJ fictício com DV válido);
//   • 15 cargos com versão vigente (descrição + CHA) e faixa salarial vigente;
//   • 68 colaboradores (matrícula 1001+, CPF fictício com DV válido) com
//     usuário, posição (cargo + salário), lotação, gestor e evento de admissão;
//   • as 5 personas de demonstração, com 2FA já configurado onde é obrigatório.
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
  escolher,
  executarSozinho,
  hashSenha,
  inserirLote,
  iso,
  log,
  mesesAtras,
  segredoTotp,
  semAcento,
  uriOtpauth,
} = require('./comum');

const SEMENTE = 20260729; // fixa: mesma execução ⇒ mesmos dados
const SENHA_DEMO = 'FastDemo2026!';
const DOMINIO = 'fastdemo.local';
const RAZAO_SOCIAL = 'Fast Distribuidora de Materiais de Construção Ltda';
const RAIZ_CNPJ = 41235678; // raiz fictícia, comum às 5 inscrições
const MATRICULA_INICIAL = 1001;

// ------------------------------------------------------------------ unidades

const UNIDADES = [
  {
    nome: 'Matriz Centro',
    endereco: 'Av. Sete de Setembro, 1420 — Centro',
    ccLoja: 'CC-1000',
    ccAdm: 'CC-1900',
  },
  { nome: 'Filial Norte', endereco: 'Rod. BR-116, km 22 — Distrito Industrial Norte', ccLoja: 'CC-2000' },
  { nome: 'Filial Sul', endereco: 'Av. das Indústrias, 3050 — Jardim Sul', ccLoja: 'CC-3000' },
  { nome: 'Filial Leste', endereco: 'Av. Leste-Oeste, 780 — Vila Leste', ccLoja: 'CC-4000' },
  { nome: 'Filial Oeste', endereco: 'Rua dos Construtores, 215 — Parque Oeste', ccLoja: 'CC-5000' },
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
    descricao: 'Analista de RH — recrutamento, avaliação 360, clima e desenvolvimento',
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
};

/**
 * Quadro completo: 60 ativos + 8 desligados.
 * `chefe` aponta para a `ref` do gestor (null só na diretoria).
 */
const QUADRO = [
  // ---------------------------------------------------------- Matriz Centro (20)
  { ref: 'helena', unidade: M, cc: 'adm', cargo: 'Diretor(a) de Operações', papel: 'diretoria', chefe: null, genero: 'f', anos: 9.2, persona: 'helena' },
  { ref: 'marcos', unidade: M, cc: 'loja', cargo: 'Gerente de Loja', papel: 'gestor', chefe: 'helena', genero: 'm', anos: 6.1, persona: 'marcos' },
  { ref: 'rafael', unidade: M, cc: 'adm', cargo: 'Analista de RH', papel: 'rh', chefe: 'helena', genero: 'm', anos: 3.2, persona: 'rafael' },
  { ref: 'mc_rh2', unidade: M, cc: 'adm', cargo: 'Analista de RH', papel: 'rh', chefe: 'helena', genero: 'f', tempo: 'padrao' },
  { ref: 'patricia', unidade: M, cc: 'adm', cargo: 'Assistente de DP', papel: 'dp', chefe: 'helena', genero: 'f', anos: 4.4, persona: 'patricia' },
  { ref: 'mc_dp2', unidade: M, cc: 'adm', cargo: 'Assistente de DP', papel: 'dp', chefe: 'helena', genero: 'm', tempo: 'medio' },
  { ref: 'mc_fin', unidade: M, cc: 'adm', cargo: 'Analista Financeiro', papel: 'funcionario', chefe: 'helena', genero: 'f', tempo: 'medio' },
  { ref: 'mc_compr', unidade: M, cc: 'adm', cargo: 'Comprador(a)', papel: 'funcionario', chefe: 'helena', genero: 'm', tempo: 'padrao', vinculo: 'pj' },
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
  { ref: 'sl_mot', unidade: S, cc: 'loja', cargo: 'Motorista Entregador', papel: 'funcionario', chefe: 'sl_ger', genero: 'm', tempo: 'medio' },
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
];

const TEMPO_DE_CASA = {
  novato: [0.04, 0.24], // até ~90 dias
  padrao: [1.0, 4.0],
  medio: [4.0, 8.0],
  veterano: [8.0, 10.0],
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

  // ---------------------------------------------------------- estabelecimentos
  const inicioEstrutura = iso(anosAtras(12)); // a Fast já tinha as 5 unidades
  const cnpjs = UNIDADES.map((_, indice) => cnpjValido(RAIZ_CNPJ, indice + 1));

  const estabs = await inserirLote(
    cliente,
    'rh.estabelecimento',
    ['cnpj'],
    cnpjs.map((cnpj) => [cnpj]),
    'id, cnpj'
  );
  const idPorCnpj = new Map(estabs.map((linha) => [linha.cnpj, Number(linha.id)]));

  const versoesEstab = await inserirLote(
    cliente,
    'rh.estabelecimento_versao',
    ['estabelecimento_id', 'razao_social', 'unidade', 'endereco_resumido', 'status', 'inicio_vigencia'],
    UNIDADES.map((unidade, indice) => [
      idPorCnpj.get(cnpjs[indice]),
      RAZAO_SOCIAL,
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

  const unidades = new Map(
    UNIDADES.map((unidade, indice) => {
      const estabelecimentoId = idPorCnpj.get(cnpjs[indice]);
      return [
        unidade.nome,
        {
          id: estabelecimentoId,
          versaoId: versaoPorEstab.get(estabelecimentoId),
          ...unidade,
          ccAdm: unidade.ccAdm ?? unidade.ccLoja,
        },
      ];
    })
  );
  log(`01-base: ${unidades.size} estabelecimentos com versão vigente.`);

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

    const anos =
      linha.anos ??
      (() => {
        const [min, max] = TEMPO_DE_CASA[linha.tempo];
        return min + rng() * (max - min);
      })();
    const admissao = anosAtras(anos);
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

  // ---------------------------------------------------------- usuários + colaboradores
  const PAPEIS_COM_2FA = new Set(['rh', 'dp', 'diretoria', 'admin']);

  // 2FA já configurado para quem o app obriga — a demo não trava no
  // enrolamento. O secret é determinístico: resetar não invalida o QR Code.
  for (const pessoa of pessoas) {
    pessoa.totpSecret =
      pessoa.ativo && PAPEIS_COM_2FA.has(pessoa.papel) ? segredoTotp(rng) : null;
  }

  const usuarios = await inserirLote(
    cliente,
    'sistema.usuario',
    ['email', 'nome', 'senha_hash', 'papel', 'ativo', 'totp_secret'],
    pessoas.map((p) => [p.email, p.nome, senhaHash, p.papel, p.ativo, p.totpSecret]),
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
      'usuario_id', 'matricula', 'matricula_esocial', 'cpf', 'nome_completo',
      'tipo_vinculo', 'data_admissao', 'status', 'data_desligamento', 'retrato',
    ],
    pessoas.map((p) => [
      p.usuarioId,
      p.matricula,
      p.matricula, // matricula_esocial = matricula (RET), decisão de 2026-07-27
      p.cpf,
      p.nome,
      p.vinculo,
      iso(p.admissao),
      p.ativo ? 'ativo' : 'desligado',
      p.desligamento ? iso(p.desligamento) : null,
      p.persona ? p.persona.descricao : (RETRATOS[p.cargo] ?? null),
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
    const centroCusto = pessoa.cc === 'adm' ? unidade.ccAdm : unidade.ccLoja;
    const inicio = iso(pessoa.admissao);

    // Vigências ficam ABERTAS mesmo para desligados: é o que o app faz ao
    // encerrar um processo (ver src/dominios/desligamento/servico.ts) — a ficha
    // do desligado continua mostrando cargo, salário e unidade do desligamento.
    posicoes.push([pessoa.colaboradorId, cargo.versaoId, pessoa.salario.toFixed(2), inicio]);
    lotacoes.push([pessoa.colaboradorId, unidade.id, centroCusto, inicio]);

    if (pessoa.chefe) {
      const gestor = porRef.get(pessoa.chefe);
      if (!gestor) throw new Error(`Chefe inexistente no quadro: ${pessoa.chefe}`);
      // A relação começa na mais recente das duas admissões (o gestor não pode
      // liderar antes de existir na empresa).
      const inicioRelacao = iso(
        pessoa.admissao > gestor.admissao ? pessoa.admissao : gestor.admissao
      );
      relacoes.push([gestor.colaboradorId, pessoa.colaboradorId, inicioRelacao]);
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
    ['colaborador_id', 'estabelecimento_id', 'centro_custo', 'inicio_vigencia'],
    lotacoes
  );
  await inserirLote(
    cliente,
    'rh.relacao_gestor',
    ['gestor_colaborador_id', 'liderado_colaborador_id', 'inicio_vigencia'],
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
  await conferir(
    'ativos sem gestor vigente (fora a diretoria)',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE c.status = 'ativo' AND u.papel <> 'diretoria'
        AND NOT EXISTS (SELECT 1 FROM rh.relacao_gestor g
                         WHERE g.liderado_colaborador_id = c.id AND g.fim_vigencia IS NULL)`,
    0
  );

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
