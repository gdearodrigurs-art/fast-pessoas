// db/semear/12-rcf.js — RCF (Responsabilidade Chave da Função) dos 15 cargos.
//
// Por que existe: o RCF é o documento que a analista de RH pediu no item 3 de
// docs/08-analise-feedback-analista-rh.md e que a migration 0020 acrescentou a
// rh.cargo_versao (setor, líder direto, tipo de contrato previsto, missão,
// atividades, observações, além do CHA nas três colunas). Sem este módulo os
// campos nascem VAZIOS na demo: a tela de cargos abre com o descritivo pela
// metade, o RCF imprimível sai em branco e não há como mostrar ao RH o
// documento que ele usa no dia a dia (seleção, integração, avaliação).
//
// Modelo oficial (referencias/rcf-modelo-descritivo-de-cargos.md), na ordem em
// que a tela imprime:
//   Cargo · Setor · Líder Direto · Tipo de contrato · Missão (RCF) ·
//   Atividades a desempenhar · CHA em três colunas · Observações importantes.
//
// O QUE ESTE MÓDULO ESCREVE, e o que deliberadamente NÃO escreve:
//   escreve  setor, cargo_lider_id, tipo_contrato_previsto, missao,
//            atividades (LISTA ORDENADA — a ordem é informação no impresso) e
//            observacoes, na versão ATIVA de cada cargo;
//   NÃO escreve o CHA. O CHA já vem de 01-base (CARGOS[].cha), que é quem cria
//            a versão do cargo e portanto é o dono natural do campo. Duplicar o
//            catálogo aqui criaria duas verdades para o mesmo dado e a primeira
//            edição em um dos dois lados abriria divergência silenciosa. Em vez
//            disso este módulo CONFERE que as três colunas chegaram preenchidas
//            e aborta se alguma vier vazia — o RCF completo é conferido, não
//            reescrito.
//
// Idempotência: UPDATE por nome do cargo, não INSERT. Roda quantas vezes for
// preciso e o resultado é o mesmo. Nada de rng: RCF é texto de gestão, não
// dado sorteado.
//
// Uso isolado: node --env-file=.env db/semear/12-rcf.js (depois de 01-base)
 

const { executarSozinho, log } = require('./comum');

// Mínimo de itens exigido por coluna do CHA. Dois, não três: estagiário e
// aprendiz têm legitimamente menos requisitos que um gerente, e inflar a lista
// deles só para bater um número tornaria o documento menos verdadeiro.
const MINIMO_POR_COLUNA_CHA = 2;

/**
 * RCF dos 15 cargos. `lider` é o NOME de outro cargo (o documento descreve a
 * ESTRUTURA — "Líder Direto: Gerente de Loja" — enquanto quem é o gestor de cada
 * pessoa continua em rh.relacao_gestor, com vigência). null = responde fora do
 * quadro (sócio-proprietário).
 */
const RCF = [
  {
    cargo: 'Diretor(a) de Operações',
    setor: 'Diretoria',
    lider: null,
    contrato: 'clt',
    missao:
      'Garantir que as cinco unidades entreguem o resultado combinado — venda, margem e ' +
      'nível de serviço — com quadro de pessoal adequado, operação segura e o padrão de ' +
      'atendimento Fast igual em qualquer loja da rede.',
    atividades: [
      'Conduzir o comitê mensal de resultados com os gerentes de loja, unidade por unidade.',
      'Analisar DRE por unidade, margem por linha de produto e desvios de meta, definindo plano de correção.',
      'Aprovar quadro de pessoal, abertura de vaga, promoção e transferência entre unidades.',
      'Negociar condições comerciais com os fornecedores estratégicos da rede.',
      'Acompanhar os indicadores de gente (turnover, absenteísmo, clima, SST) e cobrar plano de ação.',
      'Conduzir o plano de expansão: estudo de ponto, abertura e maturação de nova unidade.',
      'Representar a Fast junto a sindicato patronal, órgãos fiscalizadores e associações do setor.',
    ],
    observacoes:
      'Responde diretamente ao sócio-proprietário (fora do quadro de colaboradores). Alçada de ' +
      'aprovação: segundo nível da cadeia de promoção e transferência, e desconto comercial acima ' +
      'da política. Cobertura de férias: assumida pelo Gerente de Loja da Matriz Centro.',
  },
  {
    cargo: 'Gerente de Loja',
    setor: 'Operação de Loja',
    lider: 'Diretor(a) de Operações',
    contrato: 'clt',
    missao:
      'Responder pelo resultado integral da unidade: meta de venda, ruptura de estoque, ' +
      'equipe treinada e engajada, segurança do trabalho e a experiência do cliente do balcão ' +
      'até a entrega em obra.',
    atividades: [
      'Abrir e fechar a unidade conferindo caixa, escala e condição de segurança do salão e do depósito.',
      'Acompanhar diariamente a meta da loja e o funil de propostas com o Supervisor Comercial.',
      'Controlar ruptura e giro das linhas de drywall, argamassa e cimentícios, acionando Compras.',
      'Conduzir a rotina de pessoas da unidade: escala, ponto, férias, feedback e integração de novatos.',
      'Registrar e tratar ocorrência de segurança, entrega de EPI e encaminhamento de ASO.',
      'Resolver reclamação de cliente que passa da alçada do vendedor, preservando a relação comercial.',
      'Abrir pedido de promoção e transferência dos liderados e sustentá-lo diante da diretoria.',
    ],
    observacoes:
      'É o primeiro nível da cadeia de aprovação de promoção e transferência dos próprios ' +
      'liderados. Alçada de desconto conforme política comercial vigente; acima dela, diretoria. ' +
      'Cobertura de férias: Supervisor Comercial da própria unidade.',
  },
  {
    cargo: 'Supervisor(a) Comercial',
    setor: 'Comercial',
    lider: 'Gerente de Loja',
    contrato: 'clt',
    missao:
      'Fazer a equipe de vendas da unidade bater a meta com mix saudável e carteira ativa, ' +
      'desenvolvendo cada vendedor na venda consultiva de sistemas construtivos — não na venda ' +
      'de item avulso.',
    atividades: [
      'Desdobrar a meta da unidade em meta individual e acompanhar o resultado diariamente.',
      'Revisar propostas em aberto e cobrar o follow-up de cada orçamento de obra.',
      'Treinar a equipe em campo: sondagem de necessidade, quantitativo de obra e fechamento.',
      'Analisar a carteira e disparar ação de recuperação de cliente inativo.',
      'Conferir aplicação da política comercial e de desconto em cada pedido.',
      'Apoiar o Gerente na integração e na avaliação de experiência dos vendedores novos.',
    ],
    observacoes:
      'Não tem alçada de desconto própria além da do vendedor: exceção sobe ao Gerente de Loja. ' +
      'Costuma ser o passo natural de promoção do Vendedor com mais maturidade da unidade.',
  },
  {
    cargo: 'Vendedor(a)',
    setor: 'Comercial',
    lider: 'Supervisor(a) Comercial',
    contrato: 'clt',
    missao:
      'Transformar a necessidade da obra em solução vendida: atender, calcular o quantitativo ' +
      'certo, fechar o pedido e acompanhar a entrega, sustentando a carteira de clientes da ' +
      'unidade.',
    atividades: [
      'Atender cliente no balcão, por telefone e por WhatsApp, identificando o estágio da obra.',
      'Calcular quantitativo de drywall, perfis, massa e acessórios e montar o orçamento.',
      'Negociar prazo, condição de pagamento e frete dentro da política comercial.',
      'Registrar o pedido no sistema e conferir disponibilidade com o estoque antes de prometer prazo.',
      'Acompanhar a entrega e retornar ao cliente em caso de divergência ou atraso.',
      'Fazer follow-up de proposta em aberto e reativação da própria carteira.',
    ],
    observacoes:
      'Remuneração com parte variável por meta (comissão), fora do escopo do descritivo. ' +
      'Prazo prometido ao cliente só é assumido depois de conferido com o estoque — é a ' +
      'principal causa de reclamação quando furado.',
  },
  {
    cargo: 'Auxiliar de Vendas',
    setor: 'Comercial',
    lider: 'Supervisor(a) Comercial',
    contrato: 'clt',
    missao:
      'Sustentar a produtividade do time comercial cuidando de tudo que antecede e sucede o ' +
      'atendimento, para que o vendedor fique com o cliente e não com o sistema.',
    atividades: [
      'Cadastrar e manter atualizado o cadastro de clientes e de contatos de obra.',
      'Emitir orçamento simples e conferir o pedido antes do faturamento.',
      'Organizar a fila de atendimento em horário de pico do salão.',
      'Retornar propostas em aberto conforme a lista passada pelo Supervisor.',
      'Apoiar a conferência de entrega e o retorno de pendências ao cliente.',
    ],
    observacoes:
      'Porta de entrada natural da área comercial: é a posição de onde saem os vendedores da ' +
      'rede. Não tem alçada de desconto nem de prazo.',
  },
  {
    cargo: 'Estoquista',
    setor: 'Logística e Estoque',
    lider: 'Gerente de Loja',
    contrato: 'clt',
    missao:
      'Manter o estoque acurado e o depósito seguro, garantindo que o que o sistema diz existir ' +
      'esteja no endereço certo e em condição de venda.',
    atividades: [
      'Receber mercadoria, conferir contra a nota e endereçar no depósito.',
      'Separar pedido para entrega e para retirada, respeitando ordem e prazo.',
      'Executar inventário rotativo e apontar divergência para tratamento.',
      'Operar empilhadeira e transpaleteira conforme a NR-11 e o treinamento vigente.',
      'Manter corredor, prateleira e área de carga livres e sinalizados.',
      'Comunicar avaria, quebra e produto vencido ao Gerente de Loja.',
    ],
    observacoes:
      'Exige treinamento de NR-11 e NR-6 válidos e uso permanente de EPI (botina, luva, ' +
      'protetor auricular na área de corte). Operação de empilhadeira somente com certificação ' +
      'em dia registrada no módulo de SST.',
  },
  {
    cargo: 'Conferente',
    setor: 'Logística e Estoque',
    lider: 'Gerente de Loja',
    contrato: 'clt',
    missao:
      'Ser o ponto em que a divergência aparece antes de virar prejuízo: conferir tudo que entra ' +
      'e tudo que sai, e registrar o que não bate.',
    atividades: [
      'Conferir carga na entrada contra nota fiscal e romaneio, item por item.',
      'Conferir carga na saída antes do embarque, validando quantidade, lote e integridade.',
      'Registrar divergência, avaria e falta com evidência, antes do faturamento.',
      'Interlocutar com transportadora e fornecedor no tratamento da divergência.',
      'Apoiar o inventário rotativo com contagem cega.',
    ],
    observacoes:
      'A conferência de saída é CEGA por padrão (o conferente não vê a quantidade esperada): é o ' +
      'controle que dá valor ao cargo. Conferência assinada sem divergência apontada responsabiliza ' +
      'a unidade pela falta.',
  },
  {
    cargo: 'Motorista Entregador',
    setor: 'Logística e Entrega',
    lider: 'Gerente de Loja',
    contrato: 'clt',
    missao:
      'Entregar o material íntegro, no prazo e no lugar certo, sendo a última — e muitas vezes a ' +
      'única — pessoa da Fast que o cliente vê na obra.',
    atividades: [
      'Conferir e amarrar a carga, distribuindo peso conforme o veículo e a rota.',
      'Cumprir a rota do dia com direção defensiva e registro de ocorrência de trânsito.',
      'Descarregar em obra e em residência com o cuidado devido ao material e ao local.',
      'Colher comprovante de entrega e reportar recusa ou divergência no ato.',
      'Cuidar da manutenção preventiva, limpeza e documentação do veículo.',
    ],
    observacoes:
      'Requer CNH categoria D válida com EAR e exame toxicológico em dia (Lei 13.103) — a ' +
      'validade é acompanhada como documento do colaborador. Uso de EPI obrigatório na descarga ' +
      'em obra. Sinistro é evento de SST, não apenas de frota.',
  },
  {
    cargo: 'Analista de RH',
    setor: 'Gente e Gestão',
    lider: 'Diretor(a) de Operações',
    contrato: 'clt',
    missao:
      'Fazer a rede ter a pessoa certa, preparada e engajada em cada posição: conduzir seleção, ' +
      'integração, avaliação, clima e desenvolvimento das cinco unidades com método e sigilo.',
    atividades: [
      'Conduzir o processo de seleção da requisição ao aceite da oferta, com entrevista por competência.',
      'Aplicar a integração do novato e acompanhar os ciclos de avaliação de experiência (45 e 90 dias).',
      'Rodar o ciclo de avaliação de desempenho e consolidar o resultado com os líderes.',
      'Conduzir a pesquisa de clima e o check-in diário, e cobrar plano de ação por unidade.',
      'Planejar e facilitar treinamento técnico e comportamental conforme o CHA do cargo.',
      'Manter o descritivo de cargo (RCF) atualizado junto aos líderes.',
      'Reportar os indicadores de gente à diretoria com leitura, não apenas com número.',
    ],
    observacoes:
      'Trata dado pessoal sensível e conteúdo confidencial (parecer de seleção, resultado de ' +
      'avaliação, resposta de clima): sigilo é requisito da função, não recomendação. Acesso ao ' +
      'sistema segue o PAPEL atribuído — `recrutador` para quem faz R&S e `lider_td` para quem ' +
      'faz desenvolvimento — e não o nome do cargo.',
  },
  {
    cargo: 'Assistente de DP',
    setor: 'Departamento Pessoal',
    lider: 'Diretor(a) de Operações',
    contrato: 'clt',
    missao:
      'Garantir que a relação de trabalho de cada colaborador esteja correta e em dia perante a ' +
      'lei: admissão, jornada, férias, afastamento, benefício, folha e rescisão sem passivo e sem ' +
      'atraso.',
    atividades: [
      'Executar a admissão: documentação, contrato, exame admissional e registro no eSocial.',
      'Fechar ponto e espelho de jornada, tratando divergência com o líder da unidade.',
      'Programar e conceder férias controlando o vencimento do período aquisitivo.',
      'Lançar afastamento, acompanhar benefício previdenciário e o retorno ao trabalho.',
      'Conferir a folha de pagamento e as guias de FGTS e INSS antes do fechamento.',
      'Administrar benefícios e dependentes, incluindo adesão e exclusão no prazo da operadora.',
      'Conduzir a rescisão com verificação de estabilidade, devolução e homologação.',
    ],
    observacoes:
      'Cumpre prazo legal, não prazo interno: eSocial, FGTS Digital e recolhimentos têm data ' +
      'fatal. Segregação de funções na folha é obrigatória — quem calcula não é quem aprova. ' +
      'Acessa remuneração de toda a rede: dado sensível com trilha de leitura.',
  },
  {
    cargo: 'Analista Financeiro',
    setor: 'Administrativo e Financeiro',
    lider: 'Diretor(a) de Operações',
    contrato: 'clt',
    missao:
      'Manter o caixa da rede previsível: contas a pagar e a receber em ordem, conciliação em dia ' +
      'e informação financeira confiável para a decisão da diretoria.',
    atividades: [
      'Executar contas a pagar conferindo nota, pedido e condição negociada.',
      'Acompanhar contas a receber e conduzir a régua de cobrança da inadimplência.',
      'Conciliar extrato bancário, cartão e recebimento das cinco unidades.',
      'Projetar e acompanhar o fluxo de caixa consolidado e por unidade.',
      'Apoiar o fechamento mensal e a apuração de resultado por unidade.',
      'Negociar prazo com fornecedor em conjunto com Compras.',
    ],
    observacoes:
      'Não movimenta valor sozinho: pagamento exige aprovação da diretoria conforme alçada. ' +
      'Informação financeira por unidade é insumo do comitê de resultados.',
  },
  {
    cargo: 'Auxiliar Administrativo',
    setor: 'Administrativo e Financeiro',
    lider: 'Gerente de Loja',
    contrato: 'clt',
    missao:
      'Sustentar a rotina administrativa da unidade para que a operação não pare por documento, ' +
      'protocolo ou pendência de bastidor.',
    atividades: [
      'Organizar e arquivar documentação fiscal, de pessoal e de fornecedor da unidade.',
      'Protocolar e encaminhar documento interno entre unidade, DP e financeiro.',
      'Apoiar Compras no acompanhamento de pedido e no recebimento de nota.',
      'Atender demanda interna do time da unidade e encaminhar ao setor responsável.',
      'Redigir comunicado simples e manter o quadro de avisos da unidade em dia.',
    ],
    observacoes:
      'Lida com documento de pessoal da unidade: discrição é requisito. Posição frequentemente ' +
      'ocupada por quem vem de Jovem Aprendiz ou estágio administrativo.',
  },
  {
    cargo: 'Comprador(a)',
    setor: 'Compras e Abastecimento',
    lider: 'Diretor(a) de Operações',
    contrato: 'clt',
    missao:
      'Garantir que a rede tenha o produto certo, na quantidade certa e no melhor custo total, ' +
      'sem ruptura na ponta e sem estoque parado no depósito.',
    atividades: [
      'Negociar preço, prazo, frete e bonificação com indústria e distribuidor.',
      'Definir e revisar o mix por unidade conforme o perfil de obra da região.',
      'Controlar ponto de pedido, curva ABC e cobertura de estoque da rede.',
      'Emitir e acompanhar pedido de compra até o recebimento.',
      'Tratar divergência de nota, avaria e devolução com o fornecedor.',
      'Avaliar novo fornecedor e novo produto junto ao Gerente de Loja e à diretoria.',
    ],
    observacoes:
      'Posição exposta a brinde, cortesia e pressão de fornecedor: conduta e registro de ' +
      'negociação são parte da função. Acordo comercial acima da alçada passa pela diretoria.',
  },
  {
    cargo: 'Estagiário(a)',
    setor: 'Multissetorial (conforme plano de estágio)',
    lider: 'Gerente de Loja',
    contrato: 'estagiario',
    missao:
      'Aprender a rotina real da área sob supervisão, aplicando o conteúdo do curso em atividades ' +
      'de complexidade crescente previstas no plano de estágio.',
    atividades: [
      'Cumprir as atividades do plano de estágio acordado entre supervisor e instituição de ensino.',
      'Apoiar a área em rotinas de cadastro, planilha, organização e atendimento interno.',
      'Registrar o que aprendeu e apresentar no relatório periódico exigido pela instituição.',
      'Participar da integração, dos treinamentos e das reuniões da área.',
    ],
    observacoes:
      'Regido pela Lei 11.788/2008: jornada máxima de 6 horas, termo de compromisso com a ' +
      'instituição de ensino, supervisor formalmente designado, avaliação semestral e recesso ' +
      'proporcional. NÃO substitui posição efetiva nem assume atividade de responsabilidade ' +
      'própria de colaborador contratado.',
  },
  {
    cargo: 'Jovem Aprendiz',
    setor: 'Operação de Loja',
    lider: 'Gerente de Loja',
    contrato: 'aprendiz',
    missao:
      'Cumprir o programa de aprendizagem alternando o curso na entidade formadora com a prática ' +
      'acompanhada na unidade, construindo a primeira experiência profissional com segurança.',
    atividades: [
      'Frequentar e cumprir o módulo teórico na entidade formadora (SENAC), com presença comprovada.',
      'Praticar na unidade as atividades previstas no programa, sempre acompanhado.',
      'Apoiar organização, reposição e atendimento inicial no salão.',
      'Participar dos treinamentos de segurança e usar o EPI indicado.',
    ],
    observacoes:
      'Regido pela Lei 10.097/2000 e pelo Decreto 9.579/2018: contrato por prazo determinado ' +
      'de até 2 anos, jornada compatível com a escola, matrícula e frequência obrigatórias, ' +
      'FGTS de 2%. VEDADO a menor de 18 anos: trabalho noturno, insalubre, perigoso e operação ' +
      'de empilhadeira ou de máquina de corte — restrição conferida na escala da unidade.',
  },
];

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  // Versões ATIVAS por nome de cargo. O trigger cargo_versao_congelar bloqueia
  // UPDATE de versão ENCERRADA (é histórico); a ativa é editável, e é nela que
  // o RCF vive.
  const { rows } = await cliente.query(
    `SELECT cv.id, cv.cargo_id, cv.nome, cv.cha
       FROM rh.cargo_versao cv
      WHERE cv.status = 'ativa'`
  );
  const porNome = new Map(rows.map((linha) => [linha.nome, linha]));
  if (porNome.size === 0) {
    throw new Error(
      'Nenhuma versão de cargo ATIVA — rode db/semear/01-base.js antes de 12-rcf.js.'
    );
  }

  const faltando = RCF.map((item) => item.cargo).filter((nome) => !porNome.has(nome));
  if (faltando.length > 0) {
    throw new Error(
      `Cargos ausentes (ou sem versão ativa): ${faltando.join(', ')}. ` +
        'O elenco de cargos é de 01-base.js — os dois catálogos têm de casar.'
    );
  }
  const semRcf = [...porNome.keys()].filter(
    (nome) => !RCF.some((item) => item.cargo === nome)
  );
  if (semRcf.length > 0) {
    throw new Error(
      `Cargo sem RCF neste módulo: ${semRcf.join(', ')}. ` +
        'Cargo novo em 01-base exige o descritivo aqui — RCF pela metade é pior que RCF nenhum.'
    );
  }

  // Conferência do CHA (que vem de 01-base): as três colunas existem por CHECK
  // do banco desde a 0020, mas coluna VAZIA passa pelo CHECK. Aqui exigimos
  // conteúdo — é o que a tela imprime no descritivo.
  for (const item of RCF) {
    const versao = porNome.get(item.cargo);
    const cha = versao.cha ?? {};
    for (const coluna of ['conhecimentos', 'habilidades', 'atitudes']) {
      const lista = Array.isArray(cha[coluna]) ? cha[coluna] : [];
      if (lista.length < MINIMO_POR_COLUNA_CHA) {
        throw new Error(
          `CHA de "${item.cargo}" com a coluna ${coluna} vazia ou curta ` +
            `(${lista.length} item(ns), mínimo ${MINIMO_POR_COLUNA_CHA}). ` +
            'O CHA é preenchido por 01-base.js (CARGOS[].cha).'
        );
      }
    }
  }

  const atualizadas = [];
  for (const item of RCF) {
    const versao = porNome.get(item.cargo);
    const lider = item.lider ? porNome.get(item.lider) : null;
    if (item.lider && !lider) {
      throw new Error(
        `Líder direto "${item.lider}" (RCF de ${item.cargo}) não é um cargo ativo.`
      );
    }
    // O CHECK cargo_versao_lider_nao_e_o_proprio pega isto no banco; a mensagem
    // daqui diz QUAL linha do catálogo está errada.
    if (lider && Number(lider.cargo_id) === Number(versao.cargo_id)) {
      throw new Error(`RCF de ${item.cargo}: o cargo não pode ser líder de si mesmo.`);
    }

    const { rowCount } = await cliente.query(
      `UPDATE rh.cargo_versao
          SET setor = $2,
              cargo_lider_id = $3,
              tipo_contrato_previsto = $4,
              missao = $5,
              atividades = $6::jsonb,
              observacoes = $7
        WHERE id = $1`,
      [
        Number(versao.id),
        item.setor,
        lider ? Number(lider.cargo_id) : null,
        item.contrato,
        item.missao,
        JSON.stringify(item.atividades),
        item.observacoes,
      ]
    );
    if (rowCount !== 1) {
      throw new Error(`RCF de ${item.cargo} não foi gravado (rowCount ${rowCount}).`);
    }
    atualizadas.push({ cargo: item.cargo, atividades: item.atividades.length });
  }

  // ------------------------------------------------- nível hierárquico (0085 / A6:a)
  // Classifica as versões ATIVAS ainda sem nível pelo nome do cargo, usando o
  // catálogo que a própria 0085 semeia. Só a versão ativa é editável (o
  // congelamento barra a encerrada) e o `IS NULL` dá a idempotência: quem o
  // dono classificar pela tela não é reclassificado aqui.
  const niveis = await cliente.query(
    `UPDATE rh.cargo_versao cv
        SET nivel_hierarquico_id = n.id
       FROM rh.nivel_hierarquico n
      WHERE cv.status = 'ativa' AND cv.nivel_hierarquico_id IS NULL
        AND n.nome = CASE
          WHEN cv.nome ILIKE '%diretor%' THEN 'Diretoria'
          WHEN cv.nome ILIKE '%gerente%' OR cv.nome ILIKE '%gestor%' THEN 'Gerência'
          WHEN cv.nome ILIKE '%coordenador%' OR cv.nome ILIKE '%supervisor%' OR cv.nome ILIKE '%lider%' OR cv.nome ILIKE '%líder%' THEN 'Coordenação/Supervisão'
          ELSE 'Operacional' END`
  );

  // ---------------------------------------------------------- conferências duras
  const conferir = async (rotulo, sql, esperado) => {
    const { rows: linhas } = await cliente.query(sql);
    const obtido = Number(linhas[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await conferir(
    'cargos ativos com RCF incompleto',
    `SELECT count(*)::int AS total FROM rh.cargo_versao
      WHERE status = 'ativa'
        AND (setor IS NULL OR btrim(setor) = ''
             OR missao IS NULL OR btrim(missao) = ''
             OR tipo_contrato_previsto IS NULL
             OR observacoes IS NULL OR btrim(observacoes) = ''
             OR jsonb_array_length(atividades) = 0)`,
    0
  );
  await conferir(
    'cargos ativos sem líder direto (só a diretoria pode)',
    `SELECT count(*)::int AS total FROM rh.cargo_versao
      WHERE status = 'ativa' AND cargo_lider_id IS NULL`,
    RCF.filter((item) => item.lider === null).length
  );
  await conferir(
    'atividade em branco dentro da lista',
    `SELECT count(*)::int AS total FROM rh.cargo_versao cv,
            jsonb_array_elements_text(cv.atividades) AS atividade
      WHERE cv.status = 'ativa' AND btrim(atividade) = ''`,
    0
  );
  await conferir(
    'tipo de contrato previsto fora do domínio de rh.colaborador.tipo_vinculo',
    `SELECT count(*)::int AS total FROM rh.cargo_versao
      WHERE status = 'ativa'
        AND tipo_contrato_previsto NOT IN ('clt','estagiario','aprendiz','pj','temporario')`,
    0
  );

  await conferir(
    'versão ativa de cargo sem nível hierárquico',
    `SELECT count(*)::int AS total FROM rh.cargo_versao
      WHERE status = 'ativa' AND nivel_hierarquico_id IS NULL`,
    0
  );

  const totalAtividades = atualizadas.reduce((soma, item) => soma + item.atividades, 0);
  log(
    `12-rcf: RCF completo em ${atualizadas.length} cargos ` +
      `(${totalAtividades} atividades, média ${(totalAtividades / atualizadas.length).toFixed(1)} por cargo).`
  );
  log('12-rcf: setores — ' + [...new Set(RCF.map((item) => item.setor))].join(' · '));
  log(`12-rcf: nível hierárquico classificado em ${niveis.rowCount} versão(ões) ativa(s) de cargo.`);

  return { rcfCargos: atualizadas.length };
}

module.exports = { semear, RCF };

if (require.main === module) {
  executarSozinho('12-rcf', semear);
}
