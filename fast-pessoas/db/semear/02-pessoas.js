// db/semear/02-pessoas.js — o HISTÓRICO QUALITATIVO das pessoas da Fast.
//
// Empresa fictícia (idêntica em todos os módulos): Fast, distribuidora de
// materiais de construção/drywall, 5 unidades, ~60 ativos + 8 desligados.
//
// O que este módulo cria (tudo com data RELATIVA a hoje, calculada na execução):
//   • 45 ocorrências (positivo/negativo/neutro/alerta), 6 delas RESTRITAS
//     (disciplinares) — o gestor não vê, DP/diretoria veem com trilha;
//   • feedbacks formais para TODO ativo cobrado pela cadência de 90 dias,
//     distribuídos de modo que exatamente 8 pessoas fiquem VENCIDAS e o resto
//     em dia (semáforo da ficha e do painel — ver o bloco "feedbacks" abaixo);
//   • 20 ações abertas: concluídas, canceladas, vencidas e em dia;
//   • 30 documentos no GED (políticas/comunicados gerais, contratos, termos e
//     as advertências sensíveis) com conteúdo de texto real e SHA-256 correto;
//   • 12 ciências registradas (hash_no_momento = hash do documento);
//   • a linha do tempo correspondente em rh.evento_colaborador.
//
// Fora do escopo (de outros módulos/agentes): EPI e ASO (SST), holerites
// (folha), termos de rescisão (desligamento), documentos de admissão.
//
// Leituras que guiam este arquivo: db/migrations/0001, 0002 e 0006 (nomes,
// CHECKs e triggers append-only) e src/dominios/colaboradores/ +
// src/dominios/documentos/ (invariantes que as telas esperam ler).
 

const crypto = require('crypto');

const {
  aleatorio,
  comTriggersDesligados,
  dataRelativa,
  embaralhar,
  executarSozinho,
  hoje,
  inserirLote,
  inteiro,
  iso,
  log,
} = require('./comum');

const SEMENTE = 20260802; // fixa: mesma execução ⇒ mesmos dados

// Personas de 01-base usadas como âncora da narrativa da demo.
const MAT_GESTOR = '1013'; // Marcos Vieira Salles — Gerente da Matriz Centro
const MAT_FUNCIONARIO = '1043'; // Juliana Costa Ferreira — Vendedora Matriz

// Cadência de feedback do app (src/dominios/colaboradores/esquemas.ts).
const CADENCIA_DIAS = 90;

// Rótulos idênticos aos de ROTULOS_OCORRENCIA — o resumo do evento é montado
// como o serviço monta, para a linha do tempo ficar igual à do app.
const ROTULOS_OCORRENCIA = {
  positivo: 'Positivo',
  negativo: 'Negativo',
  neutro: 'Neutro',
  alerta: 'Alerta',
};

// Perfis funcionais: agrupam cargos para casar o texto com a pessoa certa.
const PERFIS = {
  comercial: ['Vendedor(a)', 'Auxiliar de Vendas', 'Supervisor(a) Comercial'],
  logistica: ['Estoquista', 'Conferente', 'Motorista Entregador'],
  administrativo: [
    'Analista de RH',
    'Assistente de DP',
    'Analista Financeiro',
    'Auxiliar Administrativo',
    'Comprador(a)',
  ],
  lideranca: ['Diretor(a) de Operações', 'Gerente de Loja', 'Supervisor(a) Comercial'],
  jovem: ['Estagiário(a)', 'Jovem Aprendiz'],
  qualquer: null, // qualquer cargo
};

// ------------------------------------------------------------------ ocorrências
// 45 fatos datados nos últimos 18 meses. `dias` = quantos dias atrás o fato
// ocorreu; `mat` fixa a pessoa (âncoras da demo), senão o perfil escolhe.
const OCORRENCIAS = [
  // ---- positivas (22)
  { dias: 18, tipo: 'positivo', perfil: 'comercial', mat: MAT_FUNCIONARIO,
    descricao: 'Assumiu o atendimento da carteira da Construtora Vale Verde durante a falta do colega e fechou dois pedidos de drywall no mesmo dia.',
    impacto: 'Carteira não ficou descoberta e o cliente elogiou o atendimento por escrito.',
    acao: 'Registrar como referência de cobertura de carteira no plano da equipe.' },
  { dias: 47, tipo: 'positivo', perfil: 'comercial',
    descricao: 'Fechou o maior pedido de perfis e chapas do trimestre na unidade, para a obra do Residencial Vila Nova.',
    impacto: 'Meta da unidade atingida ainda na terceira semana do mês.',
    acao: 'Apresentar o caso na reunião comercial como exemplo de venda de kit completo.' },
  { dias: 33, tipo: 'positivo', perfil: 'logistica', mat: '1028',
    descricao: 'Reorganizou o endereçamento das chapas de gesso no galpão e reduziu o tempo de separação de pedido.',
    impacto: 'Separação de pedido caiu de cerca de 20 para 12 minutos em média.',
    acao: 'Documentar o novo layout e replicar nas demais unidades.' },
  { dias: 62, tipo: 'positivo', perfil: 'logistica',
    descricao: 'Identificou avaria em carga de massa corrida ainda na conferência de recebimento e evitou a entrada de material comprometido.',
    impacto: 'Devolução tratada com o fornecedor sem prejuízo para a loja.',
    acao: null },
  { dias: 75, tipo: 'positivo', perfil: 'comercial',
    descricao: 'Treinou dois vendedores recém-admitidos no balcão de perfis e chapas sem deixar cair a própria meta.',
    impacto: 'Os dois novatos passaram a atender sozinhos em duas semanas.',
    acao: 'Considerar para o papel de multiplicador da rede.' },
  { dias: 88, tipo: 'positivo', perfil: 'administrativo',
    descricao: 'Antecipou o fechamento das conferências bancárias e liberou a equipe para o inventário cíclico.',
    impacto: 'Inventário começou dois dias antes do previsto.',
    acao: null },
  { dias: 96, tipo: 'positivo', perfil: 'logistica',
    descricao: 'Cobriu a rota da Filial Sul por três dias na ausência do motorista titular, sem atraso de entrega.',
    impacto: 'Nenhuma entrega reprogramada no período.',
    acao: 'Incluir no rodízio oficial de cobertura de rota.' },
  { dias: 110, tipo: 'positivo', perfil: 'comercial', mat: MAT_FUNCIONARIO,
    descricao: 'Recuperou cliente inativo há mais de um ano (Marcenaria Horizonte) e trouxe pedido recorrente de perfil e acessório.',
    impacto: 'Cliente voltou a comprar todo mês desde então.',
    acao: 'Aplicar o mesmo roteiro de reativação na carteira inativa da unidade.' },
  { dias: 121, tipo: 'positivo', perfil: 'jovem',
    descricao: 'Assumiu por iniciativa própria a organização do arquivo de notas do balcão, que estava atrasado.',
    impacto: 'Consulta a nota antiga deixou de depender do gerente.',
    acao: null },
  { dias: 134, tipo: 'positivo', perfil: 'lideranca',
    descricao: 'Conduziu o plano de recuperação de margem da unidade e trouxe o resultado de volta ao positivo em dois meses.',
    impacto: 'Margem da unidade saiu de -1,8% para +3,2% no período.',
    acao: 'Levar o plano ao comitê de resultados como modelo.' },
  { dias: 150, tipo: 'positivo', perfil: 'comercial',
    descricao: 'Resolveu reclamação de falta de material remanejando estoque entre unidades no mesmo dia do pedido.',
    impacto: 'Obra do cliente não parou; reclamação encerrada sem escalar.',
    acao: null },
  { dias: 168, tipo: 'positivo', perfil: 'logistica',
    descricao: 'Zerou as divergências do inventário cíclico do setor de argamassas.',
    impacto: 'Setor saiu da lista de acuracidade crítica da rede.',
    acao: 'Manter a contagem semanal adotada por ele.' },
  { dias: 182, tipo: 'positivo', perfil: 'administrativo',
    descricao: 'Padronizou a planilha de acompanhamento de contas a receber e repassou a rotina para a equipe.',
    impacto: 'Cobrança passou a sair no mesmo dia do vencimento.',
    acao: null },
  { dias: 205, tipo: 'positivo', perfil: 'comercial', mat: '1033',
    descricao: 'Bateu 118% da meta no mês da campanha de drywall, com o maior ticket médio da unidade.',
    impacto: 'Melhor resultado individual do semestre na Matriz.',
    acao: 'Reconhecimento na reunião mensal da rede.' },
  { dias: 224, tipo: 'positivo', perfil: 'logistica',
    descricao: 'Sugeriu mudança no layout de carga do caminhão e reduziu a quebra de chapa no transporte.',
    impacto: 'Quebra no trecho da Filial Leste caiu pela metade.',
    acao: 'Padronizar o esquema de carga sugerido.' },
  { dias: 246, tipo: 'positivo', perfil: 'jovem',
    descricao: 'Concluiu o módulo de atendimento do programa de aprendizagem com aproveitamento acima da média da turma.',
    impacto: 'Passou a apoiar o balcão nos horários de pico.',
    acao: null },
  { dias: 268, tipo: 'positivo', perfil: 'comercial',
    descricao: 'Assumiu o balcão sozinho no feriado prolongado e manteve o padrão de atendimento da unidade.',
    impacto: 'Faturamento do feriado acima do mesmo período do ano anterior.',
    acao: null },
  { dias: 290, tipo: 'positivo', perfil: 'administrativo',
    descricao: 'Levantou divergência de preço de compra com fornecedor de argamassa e recuperou crédito para a empresa.',
    impacto: 'Crédito de R$ 14 mil reconhecido pelo fornecedor.',
    acao: 'Incluir a conferência de preço na rotina mensal de compras.' },
  { dias: 320, tipo: 'positivo', perfil: 'lideranca',
    descricao: 'Reduziu a rotatividade da unidade com um plano próprio de integração dos novos vendedores.',
    impacto: 'Saídas nos primeiros 90 dias caíram de quatro para uma.',
    acao: 'Transformar o roteiro de integração em padrão da rede.' },
  { dias: 356, tipo: 'positivo', perfil: 'logistica',
    descricao: 'Manteve a rota de entregas em dia na semana de chuva forte, reprogramando os pedidos junto com o comercial.',
    impacto: 'Nenhuma entrega perdida na semana crítica.',
    acao: null },
  { dias: 402, tipo: 'positivo', perfil: 'comercial',
    descricao: 'Indicou candidato para o balcão que foi aprovado e hoje é destaque da equipe.',
    impacto: 'Vaga preenchida em duas semanas, sem custo de anúncio.',
    acao: null },
  { dias: 470, tipo: 'positivo', perfil: 'administrativo',
    descricao: 'Assumiu a conferência de ponto durante as férias da colega e fechou o período sem pendência.',
    impacto: 'Fechamento entregue no prazo mesmo com a equipe reduzida.',
    acao: null },

  // ---- neutras (10)
  { dias: 25, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Mudou de turno a pedido próprio para conciliar com o curso técnico noturno.',
    impacto: null, acao: 'Revisar a escala da equipe a cada semestre.' },
  { dias: 58, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Participou do treinamento de produtos de fachada aplicado pelo fornecedor na Matriz.',
    impacto: null, acao: null },
  { dias: 91, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Atuou temporariamente na Matriz durante a reforma da unidade de origem.',
    impacto: null, acao: null },
  { dias: 128, tipo: 'neutro', perfil: 'comercial', mat: MAT_FUNCIONARIO,
    descricao: 'Passou a atender também a carteira de clientes corporativos, por redistribuição da equipe.',
    impacto: 'Carteira cresceu de 40 para 65 clientes ativos.',
    acao: 'Revisar a meta individual no próximo ciclo.' },
  { dias: 160, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Concluiu o treinamento interno de atendimento consultivo.',
    impacto: null, acao: null },
  { dias: 198, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Retornou de férias e reassumiu a carteira sem intercorrência.',
    impacto: null, acao: null },
  { dias: 240, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Alterou o horário de almoço em acordo com o gestor para cobrir o pico do balcão.',
    impacto: null, acao: null },
  { dias: 300, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Passou a responder pelo caixa auxiliar às sextas-feiras.',
    impacto: null, acao: null },
  { dias: 380, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Participou do mutirão de inventário geral da rede.',
    impacto: null, acao: null },
  { dias: 450, tipo: 'neutro', perfil: 'qualquer',
    descricao: 'Transferido de unidade a pedido, por proximidade da residência.',
    impacto: null, acao: null },

  // ---- alertas não restritos (4)
  { dias: 21, tipo: 'alerta', perfil: 'comercial', mat: '1045',
    descricao: 'Terceiro atraso na abertura da loja no mês; o balcão ficou sem atendimento nos primeiros 20 minutos.',
    impacto: 'Clientes aguardando na porta e uma reclamação registrada no canal de atendimento.',
    acao: 'Combinado chegar 15 minutos antes e acompanhamento semanal pelo gestor por 30 dias.' },
  { dias: 66, tipo: 'alerta', perfil: 'comercial',
    descricao: 'Queda sustentada de conversão no balcão nos últimos dois meses, sem causa aparente de mercado.',
    impacto: 'Conversão individual 12 pontos abaixo da média da equipe.',
    acao: 'Acompanhamento diário do funil por quatro semanas.' },
  { dias: 140, tipo: 'alerta', perfil: 'logistica', mat: '1020',
    descricao: 'Duas divergências de conferência no mesmo mês em cargas de argamassa.',
    impacto: 'Ajuste de estoque necessário em ambas as ocorrências.',
    acao: 'Reforço do procedimento de conferência e dupla checagem por 30 dias.' },
  { dias: 260, tipo: 'alerta', perfil: 'qualquer',
    descricao: 'Baixa adesão aos check-ins de clima e às conversas de feedback agendadas.',
    impacto: 'Sem leitura confiável do engajamento da pessoa no período.',
    acao: 'Conversa individual com o gestor e retomada da agenda quinzenal.' },

  // ---- negativas não restritas (3)
  { dias: 40, tipo: 'negativo', perfil: 'logistica', mat: '1030',
    descricao: 'Avaria de 12 chapas de gesso por acomodação incorreta na carroceria.',
    impacto: 'Perda de material e reentrega no dia seguinte.',
    acao: 'Refazer o treinamento de amarração e conferência de carga.' },
  { dias: 105, tipo: 'negativo', perfil: 'comercial',
    descricao: 'Erro no cadastro do pedido gerou entrega de perfil errado na obra do cliente.',
    impacto: 'Troca custeada pela empresa e atraso de um dia na obra.',
    acao: 'Conferência obrigatória do pedido com o cliente antes do faturamento.' },
  { dias: 175, tipo: 'negativo', perfil: 'qualquer',
    descricao: 'Não repassou ao cliente a informação de falta de estoque; o cliente soube apenas na data da entrega.',
    impacto: 'Cliente reclamou com o gerente e ameaçou cancelar a carteira.',
    acao: 'Padrão de comunicação de ruptura combinado com a equipe.' },

  // ---- restritas / disciplinares (6) — DP registra, gestor não vê
  { dias: 12, tipo: 'negativo', restrita: true, perfil: 'comercial', mat: '1045',
    descricao: 'Advertência escrita por atraso reiterado na abertura da loja, após duas orientações verbais registradas.',
    impacto: 'Abertura do balcão comprometida em quatro dias do mês.',
    acao: 'Advertência escrita entregue com ciência e acompanhamento semanal por 60 dias.',
    documento: {
      titulo: 'Advertência escrita — atraso reiterado na abertura da loja',
      arquivo: 'advertencia-atraso-abertura',
      corpo: [
        'Comunicamos a aplicação de ADVERTÊNCIA ESCRITA em razão de atraso reiterado',
        'na abertura da unidade, após duas orientações verbais previamente registradas.',
        '',
        'Fato: nos últimos 30 dias houve quatro ocorrências de abertura do balcão fora',
        'do horário previsto, com clientes aguardando o início do atendimento.',
        '',
        'Compromisso combinado: chegada 15 minutos antes do horário de abertura e',
        'acompanhamento semanal pelo gestor imediato pelo prazo de 60 dias.',
        '',
        'A reincidência poderá ensejar penalidade mais severa, nos termos do',
        'regulamento interno e da legislação trabalhista aplicável.',
      ],
    } },
  { dias: 54, tipo: 'negativo', restrita: true, perfil: 'logistica', mat: '1030',
    descricao: 'Advertência escrita por uso do veículo da empresa fora do roteiro autorizado.',
    impacto: 'Desvio de 38 km fora da rota, identificado no relatório de telemetria.',
    acao: 'Advertência escrita entregue com ciência e revisão do termo de uso do veículo.',
    documento: {
      titulo: 'Advertência escrita — uso do veículo fora do roteiro',
      arquivo: 'advertencia-uso-veiculo',
      corpo: [
        'Comunicamos a aplicação de ADVERTÊNCIA ESCRITA em razão do uso do veículo da',
        'empresa fora do roteiro de entrega autorizado.',
        '',
        'Fato: o relatório de telemetria do veículo registrou desvio de 38 km em relação',
        'à rota programada, sem autorização prévia do gestor da unidade.',
        '',
        'Compromisso combinado: uso exclusivo do veículo para o roteiro do dia e',
        'comunicação imediata ao gestor em qualquer necessidade de desvio.',
      ],
    } },
  { dias: 97, tipo: 'alerta', restrita: true, perfil: 'qualquer',
    descricao: 'Conduta inadequada com colega em discussão no galpão; apuração conduzida pelo RH.',
    impacto: 'Clima da equipe afetado por duas semanas.',
    acao: 'Mediação conduzida pelo RH e acordo de convivência assinado pelas partes.',
    documento: {
      titulo: 'Termo de mediação e acordo de convivência',
      arquivo: 'termo-mediacao-convivencia',
      corpo: [
        'Registro de mediação conduzida pela área de Recursos Humanos após relato de',
        'discussão entre colaboradores no galpão da unidade.',
        '',
        'As partes foram ouvidas separadamente e, em seguida, em conjunto. Ambas',
        'reconheceram o tom inadequado empregado e firmaram acordo de convivência.',
        '',
        'Compromissos: tratamento respeitoso, uso do canal de escuta em caso de novo',
        'desentendimento e acompanhamento pelo RH por 90 dias.',
      ],
    } },
  { dias: 163, tipo: 'negativo', restrita: true, perfil: 'logistica',
    descricao: 'Advertência escrita por descumprimento reiterado do procedimento de conferência de carga.',
    impacto: 'Duas divergências de estoque no mês, com ajuste manual necessário.',
    acao: 'Advertência escrita com ciência e reciclagem do procedimento de conferência.',
    documento: {
      titulo: 'Advertência escrita — procedimento de conferência de carga',
      arquivo: 'advertencia-conferencia-carga',
      corpo: [
        'Comunicamos a aplicação de ADVERTÊNCIA ESCRITA por descumprimento reiterado do',
        'procedimento interno de conferência de carga.',
        '',
        'Fato: duas cargas foram liberadas sem a dupla conferência prevista, o que gerou',
        'divergência de estoque e necessidade de ajuste manual.',
        '',
        'Compromisso combinado: reciclagem do procedimento em até 15 dias e conferência',
        'assistida pelo supervisor durante 30 dias.',
      ],
    } },
  { dias: 255, tipo: 'alerta', restrita: true, perfil: 'comercial',
    descricao: 'Relato de terceiro sobre linguagem ofensiva no atendimento; apurado e não confirmado, registro mantido para acompanhamento.',
    impacto: 'Sem prejuízo comprovado ao cliente ou à equipe.',
    acao: 'Registro arquivado com orientação preventiva sobre padrão de atendimento.',
    documento: {
      titulo: 'Relatório de apuração — relato de conduta no atendimento',
      arquivo: 'relatorio-apuracao-atendimento',
      corpo: [
        'Relatório de apuração instaurada a partir de relato de terceiro sobre uso de',
        'linguagem ofensiva durante atendimento no balcão.',
        '',
        'Foram ouvidos o relator, o colaborador envolvido e duas testemunhas presentes no',
        'momento indicado. Não houve confirmação dos fatos relatados.',
        '',
        'Conclusão: apuração encerrada sem penalidade, com orientação preventiva sobre o',
        'padrão de atendimento da Fast. Registro mantido apenas para acompanhamento.',
      ],
    } },
  { dias: 330, tipo: 'negativo', restrita: true, perfil: 'qualquer',
    descricao: 'Suspensão de um dia por reincidência em falta sem comunicação prévia.',
    impacto: 'Equipe da unidade trabalhou desfalcada em dia de pico.',
    acao: 'Suspensão de um dia aplicada com ciência e plano de recuperação de assiduidade.',
    documento: {
      titulo: 'Comunicado de suspensão disciplinar — 1 dia',
      arquivo: 'suspensao-disciplinar-1-dia',
      corpo: [
        'Comunicamos a aplicação de SUSPENSÃO DISCIPLINAR de 1 (um) dia em razão de',
        'reincidência em falta ao trabalho sem comunicação prévia ao gestor.',
        '',
        'Histórico: advertência verbal e advertência escrita anteriores pelo mesmo motivo,',
        'ambas registradas no histórico funcional.',
        '',
        'Compromisso combinado: comunicação de ausência com antecedência mínima de 2 horas',
        'e plano de recuperação de assiduidade acompanhado pelo RH por 90 dias.',
      ],
    } },
];

// ------------------------------------------------------------------ feedback formal
const RESUMOS_FEEDBACK = [
  'Conversa trimestral de acompanhamento: metas de balcão revisadas, ponto forte no relacionamento com o cliente e foco combinado em fechar o kit completo (perfil + chapa + acessório). Acordado acompanhamento semanal do funil.',
  'Feedback de desempenho do ciclo: entrega consistente e boa leitura da necessidade da obra. A desenvolver: registro do pedido no sistema no mesmo dia, para não gerar retrabalho no faturamento.',
  'Conversa sobre carreira: interesse em assumir a coordenação do balcão no médio prazo. Combinado plano de desenvolvimento com acompanhamento de indicadores da equipe a partir do próximo ciclo.',
  'Acompanhamento de rotina: organização do setor e cumprimento do procedimento de conferência elogiados. A desenvolver: comunicação com o comercial quando houver ruptura de estoque.',
  'Feedback pós-campanha: resultado acima da meta e boa colaboração com os colegas na cobertura do horário de pico. Combinado revezamento mais equilibrado no próximo mês.',
  'Conversa de alinhamento após mudança de carteira: expectativas do novo perfil de cliente esclarecidas, metas ajustadas e agenda de visitas definida com o gestor.',
  'Feedback sobre postura em equipe: colaboração e disponibilidade reconhecidas. A desenvolver: dar retorno ao cliente quando o prazo de entrega mudar, sem esperar a cobrança.',
  'Acompanhamento de plano de melhoria: evolução clara em pontualidade e organização da rotina desde a última conversa. Mantido acompanhamento quinzenal por mais um ciclo.',
  'Conversa de integração dos primeiros meses: adaptação à rotina do balcão avaliada como boa, com domínio crescente da linha de drywall. Combinado acompanhamento mensal até o fim do período de experiência.',
  'Feedback do ciclo: entrega técnica sólida e boa relação com fornecedores. A desenvolver: antecipar o alerta de ruptura para o comercial com pelo menos uma semana.',
  'Conversa sobre indicadores da unidade: leitura do resultado feita em conjunto, com foco em margem por linha de produto. Combinado acompanhamento mensal do mix vendido.',
  'Feedback de rota e entrega: pontualidade e cuidado com a carga reconhecidos pelos clientes. A desenvolver: registro fotográfico da entrega em obra, para reduzir contestação.',
  'Acompanhamento após retorno de férias: recomposição da carteira em andamento e prioridades do trimestre repactuadas com o gestor.',
  'Conversa de desenvolvimento: interesse em formação técnica na linha de fachada. Combinado apoio da empresa na inscrição do curso do fornecedor.',
  'Feedback sobre atendimento consultivo: evolução no diagnóstico da necessidade da obra antes de orçar. A desenvolver: registro do histórico do cliente no sistema.',
  'Conversa de acompanhamento administrativo: rotina de conferência em dia e prazos respeitados. A desenvolver: documentar o passo a passo para permitir cobertura em férias.',
  'Feedback do programa de aprendizagem: presença, iniciativa e disposição para aprender reconhecidas. Combinado rodízio pelas áreas de estoque e balcão no próximo semestre.',
  'Conversa sobre carga de trabalho: identificado acúmulo de tarefas no fechamento do mês. Combinada redistribuição de duas rotinas dentro da equipe.',
  'Feedback de liderança: condução da equipe e clareza na cobrança reconhecidas. A desenvolver: registrar as conversas de feedback dos liderados no sistema, para dar rastreabilidade.',
  'Acompanhamento de metas individuais: resultado dentro do esperado, com oscilação na primeira quinzena. Combinado plano de prospecção ativa nas duas primeiras semanas do mês.',
];

// ------------------------------------------------------------------ ações abertas
// `prazoDias` negativo = prazo no passado. `status` conforme o CHECK do schema.
const ACOES = [
  { status: 'aberta', prazoDias: 7, criadaDias: 21, perfil: 'comercial', mat: MAT_FUNCIONARIO,
    descricao: 'Concluir o mapeamento da carteira corporativa e apresentar o plano de visitas ao gestor.' },
  { status: 'concluida', prazoDias: -18, criadaDias: 60, concluidaDias: 20, perfil: 'comercial', mat: MAT_FUNCIONARIO,
    descricao: 'Fazer o treinamento de produtos de fachada oferecido pelo fornecedor.' },
  { status: 'aberta', prazoDias: -9, criadaDias: 21, perfil: 'comercial', mat: '1045',
    descricao: 'Cumprir o acompanhamento semanal de pontualidade com o gestor durante 30 dias.' },
  { status: 'aberta', prazoDias: -24, criadaDias: 45, perfil: 'logistica', mat: '1030',
    descricao: 'Refazer o treinamento de amarração e conferência de carga com o supervisor de logística.' },
  { status: 'aberta', prazoDias: -3, criadaDias: 30, perfil: 'logistica', mat: '1020',
    descricao: 'Aplicar a dupla checagem na conferência de argamassa e apresentar o resultado de 30 dias.' },
  { status: 'aberta', prazoDias: -38, criadaDias: 75, perfil: 'comercial',
    descricao: 'Apresentar plano de recuperação de conversão do balcão com metas semanais.' },
  { status: 'aberta', prazoDias: -12, criadaDias: 55, perfil: 'administrativo',
    descricao: 'Documentar a rotina de conferência bancária para permitir cobertura em férias.' },
  { status: 'aberta', prazoDias: 12, criadaDias: 18, perfil: 'logistica',
    descricao: 'Concluir a reorganização do endereçamento do setor de chapas e registrar o novo layout.' },
  { status: 'aberta', prazoDias: 21, criadaDias: 14, perfil: 'comercial',
    descricao: 'Reativar dez clientes inativos da carteira e registrar o retorno de cada contato.' },
  { status: 'aberta', prazoDias: 28, criadaDias: 26, perfil: 'jovem',
    descricao: 'Concluir o módulo de estoque do programa de aprendizagem.' },
  { status: 'aberta', prazoDias: 35, criadaDias: 10, perfil: 'lideranca',
    descricao: 'Registrar no sistema as conversas de feedback pendentes da equipe da unidade.' },
  { status: 'aberta', prazoDias: 45, criadaDias: 32, perfil: 'administrativo',
    descricao: 'Fechar a conferência de preço de compra com o fornecedor de argamassa do trimestre.' },
  { status: 'aberta', prazoDias: 58, criadaDias: 12, perfil: 'qualquer',
    descricao: 'Participar da mediação de acompanhamento com o RH prevista no acordo de convivência.' },
  { status: 'aberta', prazoDias: 74, criadaDias: 8, perfil: 'comercial',
    descricao: 'Estruturar o roteiro de integração dos novos vendedores para a próxima admissão.' },
  { status: 'concluida', prazoDias: -35, criadaDias: 90, concluidaDias: 40, perfil: 'logistica',
    descricao: 'Concluir a contagem cíclica do setor de argamassas e zerar as divergências.' },
  { status: 'concluida', prazoDias: -62, criadaDias: 120, concluidaDias: 66, perfil: 'administrativo',
    descricao: 'Padronizar a planilha de contas a receber e repassar a rotina para a equipe.' },
  { status: 'concluida', prazoDias: -88, criadaDias: 140, concluidaDias: 95, perfil: 'comercial',
    descricao: 'Assumir a carteira de clientes da região norte durante a cobertura do colega.' },
  { status: 'concluida', prazoDias: -130, criadaDias: 190, concluidaDias: 135, perfil: 'lideranca',
    descricao: 'Apresentar o plano de recuperação de margem da unidade ao comitê de resultados.' },
  { status: 'concluida', prazoDias: -170, criadaDias: 230, concluidaDias: 180, perfil: 'jovem',
    descricao: 'Concluir o módulo de atendimento do programa de aprendizagem.' },
  { status: 'cancelada', prazoDias: -50, criadaDias: 110, concluidaDias: 70, perfil: 'qualquer',
    descricao: 'Assumir o caixa auxiliar às sextas-feiras (cancelada por mudança na escala da unidade).' },
];

// ------------------------------------------------------------------ documentos gerais (GED)
const DOCUMENTOS_GERAIS = [
  { categoria: 'politica', titulo: 'Política de Conduta e Ética da Fast', arquivo: 'politica-conduta-etica', dias: 240,
    corpo: [
      'POLÍTICA DE CONDUTA E ÉTICA',
      '',
      '1. Aplicação. Esta política vale para todos os colaboradores da Fast, em todas as',
      'unidades, independentemente do tipo de vínculo.',
      '',
      '2. Respeito. Não toleramos discriminação, assédio moral ou sexual, nem qualquer',
      'forma de constrangimento entre colegas, com clientes ou com fornecedores.',
      '',
      '3. Conflito de interesses. Relação comercial com fornecedor ou cliente em que o',
      'colaborador tenha interesse pessoal deve ser comunicada ao gestor e ao RH.',
      '',
      '4. Brindes e cortesias. Só são aceitáveis brindes de valor simbólico e sem',
      'contrapartida. Qualquer oferta acima disso deve ser recusada e comunicada.',
      '',
      '5. Uso do patrimônio. Veículos, ferramentas, materiais e sistemas da empresa são',
      'de uso exclusivamente profissional.',
      '',
      '6. Canal de escuta. Denúncias podem ser feitas ao RH ou pelo canal de escuta, com',
      'garantia de sigilo e de não retaliação.',
    ] },
  { categoria: 'politica', titulo: 'Política de Uso de Sistemas e Proteção de Dados', arquivo: 'politica-uso-sistemas', dias: 210,
    corpo: [
      'POLÍTICA DE USO DE SISTEMAS E PROTEÇÃO DE DADOS',
      '',
      '1. Credenciais são pessoais e intransferíveis. É vedado compartilhar senha ou',
      'deixar sessão aberta em terminal de uso comum do balcão.',
      '',
      '2. Segundo fator. Perfis com acesso a dado de pessoal (DP, RH e administração)',
      'operam obrigatoriamente com autenticação em dois fatores.',
      '',
      '3. Dado pessoal de cliente e de colaborador só pode ser usado para a finalidade do',
      'atendimento ou da rotina de trabalho. É proibido extrair listas para uso próprio.',
      '',
      '4. Toda leitura de dado sensível (remuneração, ocorrência restrita, documento',
      'sensível) é registrada em trilha de auditoria com autor, data e recurso acessado.',
      '',
      '5. Incidentes de segurança devem ser comunicados imediatamente ao RH.',
    ] },
  { categoria: 'politica', titulo: 'Política de Viagens e Reembolso de Despesas', arquivo: 'politica-viagens-reembolso', dias: 175,
    corpo: [
      'POLÍTICA DE VIAGENS E REEMBOLSO DE DESPESAS',
      '',
      '1. Toda viagem a obra ou a fornecedor precisa de aprovação prévia do gestor da',
      'unidade e de registro no sistema de demandas.',
      '',
      '2. Reembolso de combustível: mediante nota fiscal e informação da quilometragem',
      'inicial e final do trajeto.',
      '',
      '3. Refeição em viagem: limite diário definido pela diretoria e revisado a cada ano.',
      '',
      '4. Prazo de prestação de contas: até 5 dias úteis após o retorno. Despesa entregue',
      'fora do prazo entra no reembolso do mês seguinte.',
    ] },
  { categoria: 'politica', titulo: 'Política de Trabalho Remoto para as áreas administrativas', arquivo: 'politica-trabalho-remoto', dias: 150,
    corpo: [
      'POLÍTICA DE TRABALHO REMOTO — ÁREAS ADMINISTRATIVAS',
      '',
      '1. Elegibilidade. Aplica-se apenas às funções administrativas da Matriz que não',
      'exigem presença no balcão, no galpão ou na rota de entrega.',
      '',
      '2. Formato. Até dois dias por semana em regime remoto, definidos com o gestor e',
      'registrados na escala da equipe.',
      '',
      '3. Disponibilidade. O horário de trabalho é o mesmo do regime presencial, com',
      'resposta em até 30 minutos nos canais oficiais.',
      '',
      '4. Suspensão. Em fechamento de mês, inventário ou campanha comercial, o regime',
      'pode ser suspenso mediante aviso com 48 horas de antecedência.',
    ] },
  { categoria: 'politica', titulo: 'Regulamento Interno de Convivência nas Unidades', arquivo: 'regulamento-interno-convivencia', dias: 300,
    corpo: [
      'REGULAMENTO INTERNO DE CONVIVÊNCIA',
      '',
      '1. Jornada. O horário de cada unidade é o publicado na escala; a abertura do',
      'balcão é responsabilidade da equipe escalada para o primeiro turno.',
      '',
      '2. Uniforme e identificação. Uso obrigatório durante todo o expediente, no balcão,',
      'no galpão e na entrega.',
      '',
      '3. Ausências. Falta ou atraso devem ser comunicados ao gestor com a maior',
      'antecedência possível, por telefone ou pelo canal da equipe.',
      '',
      '4. Medidas disciplinares. Seguem a gradação orientação verbal, advertência escrita',
      'e suspensão, conforme a gravidade e a reincidência do fato.',
      '',
      '5. Convivência. Divergências entre colegas devem ser tratadas com o gestor ou com',
      'o RH, nunca no salão de vendas diante do cliente.',
    ] },
  { categoria: 'comunicado', titulo: 'Comunicado: horário especial de funcionamento das lojas', arquivo: 'comunicado-horario-lojas', dias: 26,
    corpo: [
      'COMUNICADO INTERNO — HORÁRIO ESPECIAL',
      '',
      'Nas próximas quatro semanas as cinco unidades funcionarão em horário estendido aos',
      'sábados, das 8h às 16h, para atender à demanda de obra do período.',
      '',
      'A escala de cada unidade será divulgada pelo gerente até quinta-feira. As horas',
      'trabalhadas seguem o acordo de compensação vigente.',
      '',
      'Dúvidas com o DP pelo canal de demandas do sistema.',
    ] },
  { categoria: 'comunicado', titulo: 'Comunicado: canal de escuta e denúncia', arquivo: 'comunicado-canal-escuta', dias: 120,
    corpo: [
      'COMUNICADO INTERNO — CANAL DE ESCUTA',
      '',
      'Está disponível a todos os colaboradores o canal de escuta e denúncia da Fast,',
      'para relatos de assédio, discriminação, desvio de conduta ou uso indevido do',
      'patrimônio da empresa.',
      '',
      'O relato pode ser identificado ou anônimo. Em qualquer caso, é garantido sigilo na',
      'apuração e vedada qualquer forma de retaliação a quem relata de boa-fé.',
      '',
      'A apuração é conduzida pelo RH e o resultado é comunicado ao relator quando ele se',
      'identifica.',
    ] },
  { categoria: 'comunicado', titulo: 'Comunicado: campanha comercial de drywall', arquivo: 'comunicado-campanha-drywall', dias: 58,
    corpo: [
      'COMUNICADO INTERNO — CAMPANHA COMERCIAL',
      '',
      'A campanha de drywall começa na próxima segunda-feira e vale para as cinco',
      'unidades. O foco é a venda do kit completo: chapa, perfil, massa e acessório.',
      '',
      'As metas individuais e por unidade estão publicadas no painel de indicadores do',
      'sistema. O acompanhamento é semanal, na reunião comercial de segunda-feira.',
      '',
      'Materiais de apoio e tabela de preço da campanha estão com o gerente de cada loja.',
    ] },
];

// ------------------------------------------------------------------ helpers locais

/** Data do fato N dias atrás (meia-noite UTC), como o app grava DATE. */
function diaAtras(dias) {
  return dataRelativa(-dias);
}

/** Instante ISO em UTC a partir de uma data + hora do dia. */
function instante(data, hora, minuto) {
  const copia = new Date(data.getTime());
  copia.setUTCHours(hora, minuto, 0, 0);
  return copia.toISOString();
}

/** Instante do registro: `diasDepois` após o fato, no horário comercial. */
function registroApos(dataFato, diasDepois, hora, minuto) {
  const copia = new Date(dataFato.getTime());
  copia.setUTCDate(copia.getUTCDate() + diasDepois);
  const limite = hoje();
  if (copia.getTime() > limite.getTime()) copia.setTime(limite.getTime());
  return instante(copia, hora, minuto);
}

/** 'dd/mm/aaaa' — igual ao formatarData do serviço. */
function paraBr(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Réplica do truncar() de src/dominios/colaboradores/servico.ts. */
function truncar(texto, limite) {
  return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

/** Conteúdo de arquivo de texto: cabeçalho da Fast + corpo. */
function corpoArquivo(titulo, linhas) {
  return Buffer.from(
    [
      'FAST DISTRIBUIDORA DE MATERIAIS DE CONSTRUÇÃO LTDA',
      titulo.toUpperCase(),
      '='.repeat(Math.min(72, Math.max(titulo.length, 40))),
      '',
      ...linhas,
      '',
      '-- Documento de demonstração do Fast Pessoas (dados fictícios).',
      '',
    ].join('\n'),
    'utf8'
  );
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  const rng = aleatorio(SEMENTE);

  // ---------------------------------------------------------------- pessoas
  const { rows: linhas } = await cliente.query(
    `SELECT c.id::int          AS colaborador_id,
            c.usuario_id::int  AS usuario_id,
            c.matricula,
            c.nome_completo,
            c.status,
            c.tipo_vinculo,
            c.data_admissao::text     AS admissao,
            c.data_desligamento::text AS desligamento,
            u.papel,
            cv.nome  AS cargo,
            ev.unidade,
            rg.gestor_colaborador_id::int AS gestor_colaborador_id,
            gu.id::int                    AS gestor_usuario_id,
            gu.papel                      AS gestor_papel,
            g.nome_completo               AS gestor_nome
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       LEFT JOIN rh.posicao_colaborador p
              ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       LEFT JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
       LEFT JOIN rh.lotacao l
              ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       LEFT JOIN rh.estabelecimento_versao ev
              ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
       LEFT JOIN rh.relacao_gestor rg
              ON rg.liderado_colaborador_id = c.id AND rg.fim_vigencia IS NULL
       LEFT JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
       LEFT JOIN sistema.usuario gu ON gu.id = g.usuario_id
      ORDER BY c.matricula`
  );
  if (linhas.length === 0) {
    throw new Error('Nenhum colaborador encontrado — rode db/semear/01-base.js antes.');
  }
  const pessoas = linhas;
  const porMatricula = new Map(pessoas.map((p) => [p.matricula, p]));
  const ativos = pessoas.filter((p) => p.status !== 'desligado');

  // Registradores: só rh e dp têm rh.ocorrencia.registrar; a restrita exige
  // ainda rh.ocorrencia.restrita.ver, que é de dp e diretoria (migration 0002).
  const usuariosPorPapel = (papel) =>
    pessoas.filter((p) => p.papel === papel).map((p) => p.usuario_id);
  const USUARIOS_RH = usuariosPorPapel('rh');
  const USUARIOS_DP = usuariosPorPapel('dp');
  const USUARIOS_REGISTRO = [...USUARIOS_RH, ...USUARIOS_DP];
  if (USUARIOS_RH.length === 0 || USUARIOS_DP.length === 0) {
    throw new Error('Sem usuários rh/dp na base — 01-base precisa ter rodado por completo.');
  }
  const proximo = (lista, indice) => lista[indice % lista.length];

  // Quem assina a conversa de feedback: o gestor vigente, quando o papel dele
  // tem a chave rh.feedback.registrar (gestor/rh/dp — a DIRETORIA não tem, ver
  // migration 0002); senão o RH, que é quem conduziria na prática.
  const PAPEIS_COM_FEEDBACK = ['gestor', 'rh', 'dp'];
  const registradorFeedback = (pessoa, indice) =>
    pessoa.gestor_usuario_id !== null &&
    PAPEIS_COM_FEEDBACK.includes(pessoa.gestor_papel)
      ? pessoa.gestor_usuario_id
      : proximo(USUARIOS_RH, indice);

  // ---------------------------------------------------------------- filas por perfil
  // Cada perfil tem uma fila embaralhada (determinística) que roda em ciclo:
  // ninguém concentra tudo, e o mesmo cargo recebe o texto que faz sentido.
  const filas = new Map();
  const cursores = new Map();
  for (const [nome, cargos] of Object.entries(PERFIS)) {
    const candidatos = pessoas.filter(
      (p) => cargos === null || (p.cargo !== null && cargos.includes(p.cargo))
    );
    filas.set(nome, embaralhar(rng, candidatos));
    cursores.set(nome, 0);
  }

  /** A pessoa tem que existir na empresa NA DATA do fato. */
  function vigenteEm(pessoa, dataIso) {
    if (pessoa.admissao > dataIso) return false;
    if (pessoa.desligamento !== null && pessoa.desligamento < dataIso) return false;
    return true;
  }

  /**
   * Próxima pessoa do perfil que estava na empresa na data do fato.
   * `mat` fixa a pessoa (âncoras da narrativa da demo); `somenteAtivos` evita
   * pendurar compromisso futuro (ação com prazo, termo vigente) em desligado.
   */
  function escolherPessoa(perfil, dataIso, mat, somenteAtivos = false) {
    if (mat) {
      const fixa = porMatricula.get(mat);
      if (!fixa) throw new Error(`Matrícula âncora ${mat} não existe na base.`);
      return fixa;
    }
    const fila = filas.get(perfil);
    if (!fila || fila.length === 0) throw new Error(`Perfil sem candidatos: ${perfil}`);
    for (let tentativa = 0; tentativa < fila.length; tentativa += 1) {
      const indice = cursores.get(perfil);
      cursores.set(perfil, indice + 1);
      const candidato = fila[indice % fila.length];
      if (somenteAtivos && candidato.status === 'desligado') continue;
      if (vigenteEm(candidato, dataIso)) return candidato;
    }
    throw new Error(`Nenhum candidato do perfil ${perfil} estava na empresa em ${dataIso}`);
  }

  // ---------------------------------------------------------------- ocorrências
  const ocorrenciasLinhas = [];
  const ocorrenciasMeta = [];
  OCORRENCIAS.forEach((item, indice) => {
    const data = diaAtras(item.dias);
    const dataIso = iso(data);
    const pessoa = escolherPessoa(item.perfil, dataIso, item.mat);
    const restrita = item.restrita === true;
    // Restrita só pode ser registrada por quem tem rh.ocorrencia.restrita.ver.
    const registrador = restrita
      ? proximo(USUARIOS_DP, indice)
      : proximo(USUARIOS_REGISTRO, indice);
    ocorrenciasLinhas.push([
      pessoa.colaborador_id,
      item.tipo,
      restrita,
      item.descricao,
      item.impacto,
      item.acao,
      dataIso,
      registrador,
      registroApos(data, 1, 13, 20),
    ]);
    ocorrenciasMeta.push({ item, pessoa, restrita, registrador, data, dataIso });
  });

  // ---------------------------------------------------------------- feedbacks
  // Regra do app: vencido = dias desde o último feedback > 90 e, para QUEM
  // NUNCA TEVE FEEDBACK, a conta corre desde a ADMISSÃO (ver feedbackVencido
  // em src/dominios/colaboradores/servico.ts). Por isso não basta semear "8
  // vencidas": todo ativo com mais de 90 dias de casa que ficasse sem nenhuma
  // conversa cairia no mesmo selo — eram ~45 de 60 pessoas em vermelho na
  // lista, e o alerta deixava de apontar coisa alguma.
  //
  // Regra deste módulo: TODO ativo cobrado pela cadência recebe histórico de
  // conversa; o atraso fica concentrado nas 8 escolhidas. Quem tem menos de 90
  // dias de casa não é cobrado e fica de fora naturalmente.
  const ANCORAS_EM_DIA = [MAT_FUNCIONARIO, '1003', '1033'];
  const ANCORAS_VENCIDAS = ['1045', '1020', '1030'];
  const QUANTIDADE_VENCIDAS = 8;
  const DIAS_CASA_PARA_HISTORICO = 420;

  const eAncora = (p) =>
    ANCORAS_EM_DIA.includes(p.matricula) ||
    ANCORAS_VENCIDAS.includes(p.matricula);

  // Cobrados pela cadência: ativos com mais de CADENCIA_DIAS de casa.
  const cobradosPelaCadencia = ativos.filter(
    (p) => p.admissao <= iso(diaAtras(CADENCIA_DIAS))
  );

  // As vencidas saem de quem tem casa longa: o histórico da conversa anterior
  // precisa caber antes do atraso, sem cair antes da admissão.
  const candidatasVencidas = embaralhar(
    rng,
    cobradosPelaCadencia.filter(
      (p) => !eAncora(p) && p.admissao <= iso(diaAtras(DIAS_CASA_PARA_HISTORICO))
    )
  );
  const vencidas = ANCORAS_VENCIDAS.map((mat) => porMatricula.get(mat));
  let cursorVencida = 0;
  while (vencidas.length < QUANTIDADE_VENCIDAS) {
    if (cursorVencida >= candidatasVencidas.length) {
      throw new Error('Candidatas a feedback vencido esgotadas — reveja 01-base.');
    }
    vencidas.push(candidatasVencidas[cursorVencida]);
    cursorVencida += 1;
  }
  const matriculasVencidas = new Set(vencidas.map((p) => p.matricula));

  // Em dia: TODO o restante de quem é cobrado pela cadência.
  const emDia = [
    ...ANCORAS_EM_DIA.map((mat) => porMatricula.get(mat)),
    ...cobradosPelaCadencia.filter(
      (p) => !eAncora(p) && !matriculasVencidas.has(p.matricula)
    ),
  ];

  const planoFeedback = [];
  emDia.forEach((pessoa, indice) => {
    // Casa longa comporta histórico de 2–3 conversas; quem tem pouco tempo
    // leva uma só (as anteriores cairiam antes da admissão e seriam puladas).
    const casaLonga = pessoa.admissao <= iso(diaAtras(DIAS_CASA_PARA_HISTORICO));
    const quantas = !casaLonga ? 1 : (indice % 3) + 1;
    // Último feedback entre 8 e 82 dias atrás: dentro da cadência e com datas
    // espalhadas, para a ficha não parecer preenchida toda no mesmo dia.
    planoFeedback.push({ pessoa, quantas, ultimoDias: 8 + ((indice * 17) % 75) });
  });
  vencidas.forEach((pessoa, indice) => {
    const quantas = indice < 5 ? 2 : 1;
    // 97 a ~200 dias: vencido com folga e sem empatar todo mundo na mesma data.
    planoFeedback.push({ pessoa, quantas, ultimoDias: 97 + indice * 15 });
  });

  const feedbacksLinhas = [];
  const feedbacksMeta = [];
  let cursorResumo = 0;
  for (const plano of planoFeedback) {
    let dias = plano.ultimoDias;
    for (let n = 0; n < plano.quantas; n += 1) {
      const data = diaAtras(dias);
      const dataIso = iso(data);
      if (!vigenteEm(plano.pessoa, dataIso)) break; // não inventa conversa antes da admissão
      const resumo = RESUMOS_FEEDBACK[cursorResumo % RESUMOS_FEEDBACK.length];
      cursorResumo += 1;
      const registrador = registradorFeedback(plano.pessoa, cursorResumo);
      feedbacksLinhas.push([
        plano.pessoa.colaborador_id,
        dataIso,
        resumo,
        registrador,
        registroApos(data, 0, 21, 10),
      ]);
      feedbacksMeta.push({ pessoa: plano.pessoa, dataIso, resumo, registrador, data });
      dias += 95 + inteiro(rng, 0, 20);
    }
  }

  // ---------------------------------------------------------------- ações abertas
  const acoesLinhas = [];
  ACOES.forEach((item, indice) => {
    const criada = diaAtras(item.criadaDias);
    const criadaIso = iso(criada);
    const pessoa = escolherPessoa(item.perfil, criadaIso, item.mat, true);
    const responsavel = registradorFeedback(pessoa, indice);
    const atualizada =
      item.status === 'aberta'
        ? registroApos(criada, 0, 11, 30)
        : registroApos(diaAtras(item.concluidaDias), 0, 16, 45);
    acoesLinhas.push([
      pessoa.colaborador_id,
      item.descricao,
      iso(diaAtras(-item.prazoDias)),
      item.status,
      responsavel,
      registroApos(criada, 0, 11, 30),
      atualizada,
    ]);
  });

  // ---------------------------------------------------------------- documentos
  const documentos = []; // { colaborador_id, categoria, titulo, arquivo, corpo, sensivel, enviadoPor, dias }
  const usados = new Set();

  // (1) gerais: política e comunicado, visíveis a todos (colaborador_id NULL)
  DOCUMENTOS_GERAIS.forEach((doc, indice) => {
    documentos.push({
      colaborador_id: null,
      categoria: doc.categoria,
      titulo: doc.titulo,
      nome_arquivo: `${doc.arquivo}.txt`,
      conteudo: corpoArquivo(doc.titulo, doc.corpo),
      sensivel: false,
      enviadoPor: proximo(USUARIOS_RH, indice),
      dias: doc.dias,
    });
  });

  // (2) contratos por colaborador — 12, priorizando quem chegou há pouco
  const porAdmissaoRecente = ativos
    .slice()
    .sort((a, b) => (a.admissao < b.admissao ? 1 : a.admissao > b.admissao ? -1 : 0));
  const alvosContrato = [];
  for (const pessoa of porAdmissaoRecente) {
    if (alvosContrato.length >= 12) break;
    if (usados.has(pessoa.matricula)) continue;
    usados.add(pessoa.matricula);
    alvosContrato.push(pessoa);
  }
  alvosContrato.forEach((pessoa, indice) => {
    const diasCasa = Math.round(
      (hoje().getTime() - Date.parse(`${pessoa.admissao}T00:00:00Z`)) / 86400000
    );
    let titulo;
    let arquivo;
    let corpo;
    if (pessoa.tipo_vinculo === 'estagiario') {
      titulo = 'Termo de compromisso de estágio';
      arquivo = 'termo-estagio';
      corpo = [
        `Estagiário(a): ${pessoa.nome_completo} (matrícula ${pessoa.matricula})`,
        `Unidade: ${pessoa.unidade ?? 'Matriz Centro'}`,
        `Início do estágio: ${paraBr(pessoa.admissao)}`,
        '',
        'Termo de compromisso firmado entre a instituição de ensino, o estagiário e a',
        'Fast, nos termos da Lei 11.788/2008.',
        '',
        'Jornada: 6 horas diárias, 30 horas semanais, sem sobreaviso e sem banco de horas.',
        'Supervisão: gestor da unidade, com relatório de atividades a cada seis meses.',
        'Recesso: 30 dias a cada 12 meses de estágio, preferencialmente nas férias escolares.',
      ];
    } else if (pessoa.tipo_vinculo === 'aprendiz') {
      titulo = 'Contrato de aprendizagem';
      arquivo = 'contrato-aprendizagem';
      corpo = [
        `Aprendiz: ${pessoa.nome_completo} (matrícula ${pessoa.matricula})`,
        `Unidade: ${pessoa.unidade ?? 'Matriz Centro'}`,
        `Início do contrato: ${paraBr(pessoa.admissao)}`,
        '',
        'Contrato de aprendizagem por prazo determinado, com formação técnico-profissional',
        'metódica em entidade qualificada, nos termos do art. 428 da CLT.',
        '',
        'Jornada: 6 horas diárias, incluindo o tempo de formação teórica.',
        'Rodízio previsto: atendimento no balcão, conferência e apoio administrativo.',
      ];
    } else if (diasCasa <= 120) {
      titulo = 'Contrato de experiência — 45 + 45 dias';
      arquivo = 'contrato-experiencia';
      corpo = [
        `Colaborador(a): ${pessoa.nome_completo} (matrícula ${pessoa.matricula})`,
        `Cargo: ${pessoa.cargo ?? 'A definir'} — Unidade: ${pessoa.unidade ?? 'Matriz Centro'}`,
        `Admissão: ${paraBr(pessoa.admissao)}`,
        '',
        'Contrato de experiência pelo prazo de 45 (quarenta e cinco) dias, prorrogável',
        'uma única vez por igual período, nos termos do art. 445, parágrafo único, da CLT.',
        '',
        'Durante a experiência há acompanhamento formal do gestor nos dias 45 e 90, com',
        'registro de feedback no sistema e decisão sobre a efetivação antes do termo final.',
      ];
    } else {
      titulo = 'Contrato individual de trabalho — CLT';
      arquivo = 'contrato-clt';
      corpo = [
        `Colaborador(a): ${pessoa.nome_completo} (matrícula ${pessoa.matricula})`,
        `Cargo: ${pessoa.cargo ?? 'A definir'} — Unidade: ${pessoa.unidade ?? 'Matriz Centro'}`,
        `Admissão: ${paraBr(pessoa.admissao)}`,
        '',
        'Contrato individual de trabalho por prazo indeterminado, regido pela CLT e pela',
        'convenção coletiva da categoria do comércio da base territorial da unidade.',
        '',
        'Jornada: 44 horas semanais, conforme escala da unidade.',
        'Local de trabalho: unidade de lotação, admitido remanejamento entre unidades da',
        'mesma praça mediante comunicação prévia.',
      ];
    }
    documentos.push({
      colaborador_id: pessoa.colaborador_id,
      categoria: 'contrato',
      titulo,
      nome_arquivo: `${arquivo}-${pessoa.matricula}.txt`,
      conteudo: corpoArquivo(titulo, corpo),
      sensivel: false,
      enviadoPor: proximo(USUARIOS_DP, indice),
      dias: Math.max(3, Math.min(diasCasa, 400)),
      matricula: pessoa.matricula,
    });
  });

  // (3) termos e declarações de colaborador — 4, não sensíveis
  const TERMOS = [
    { perfil: 'logistica', categoria: 'outro', titulo: 'Termo de responsabilidade — veículo de entrega',
      arquivo: 'termo-veiculo-entrega', dias: 96,
      corpo: (p) => [
        `Colaborador(a): ${p.nome_completo} (matrícula ${p.matricula})`,
        '',
        'Declaro estar ciente de que o veículo da empresa entregue à minha guarda destina-se',
        'exclusivamente ao roteiro de entrega autorizado pela unidade.',
        '',
        'Comprometo-me a: conferir o veículo no início e no fim da jornada; comunicar de',
        'imediato qualquer avaria; não transportar pessoa estranha ao serviço; e respeitar',
        'a legislação de trânsito, respondendo pelas infrações que der causa.',
      ] },
    { perfil: 'administrativo', categoria: 'outro', titulo: 'Termo de responsabilidade — equipamento de informática',
      arquivo: 'termo-equipamento-informatica', dias: 143,
      corpo: (p) => [
        `Colaborador(a): ${p.nome_completo} (matrícula ${p.matricula})`,
        '',
        'Recebi da Fast, em regime de comodato, notebook e acessórios para uso exclusivo em',
        'atividade profissional, conforme a Política de Uso de Sistemas.',
        '',
        'Comprometo-me a zelar pelo equipamento, não instalar software não autorizado e',
        'devolvê-lo em caso de desligamento ou mudança de função.',
      ] },
    { perfil: 'comercial', categoria: 'outro', titulo: 'Declaração de opção por vale-transporte',
      arquivo: 'declaracao-vale-transporte', dias: 205,
      corpo: (p) => [
        `Colaborador(a): ${p.nome_completo} (matrícula ${p.matricula})`,
        '',
        'Declaro, para os fins do Decreto 95.247/1987, que OPTO pelo recebimento do',
        'vale-transporte para o deslocamento residência–trabalho–residência.',
        '',
        'Declaro ainda estar ciente do desconto de até 6% do salário-base e comprometo-me a',
        'comunicar qualquer alteração de endereço ou de itinerário.',
      ] },
    { perfil: 'qualquer', categoria: 'outro', titulo: 'Acordo individual de compensação de jornada',
      arquivo: 'acordo-compensacao-jornada', dias: 268,
      corpo: (p) => [
        `Colaborador(a): ${p.nome_completo} (matrícula ${p.matricula})`,
        '',
        'Acordo individual de compensação de jornada, na forma do art. 59 da CLT e da',
        'convenção coletiva vigente.',
        '',
        'As horas excedentes trabalhadas de segunda a sexta serão compensadas com a redução',
        'ou supressão do trabalho aos sábados, dentro do mesmo mês de apuração.',
      ] },
  ];
  TERMOS.forEach((termo, indice) => {
    const dataIso = iso(diaAtras(termo.dias));
    const pessoa = escolherPessoa(termo.perfil, dataIso, undefined, true);
    documentos.push({
      colaborador_id: pessoa.colaborador_id,
      categoria: termo.categoria,
      titulo: termo.titulo,
      nome_arquivo: `${termo.arquivo}-${pessoa.matricula}.txt`,
      conteudo: corpoArquivo(termo.titulo, termo.corpo(pessoa)),
      sensivel: false,
      enviadoPor: proximo(USUARIOS_DP, indice + 1),
      dias: termo.dias,
      matricula: pessoa.matricula,
    });
  });

  // (4) documentos SENSÍVEIS: um por ocorrência restrita, na mesma pessoa e
  // com a mesma data — é assim que o disciplinar se materializa no GED.
  ocorrenciasMeta
    .filter((meta) => meta.restrita)
    .forEach((meta, indice) => {
      const doc = meta.item.documento;
      documentos.push({
        colaborador_id: meta.pessoa.colaborador_id,
        categoria: 'outro',
        titulo: doc.titulo,
        nome_arquivo: `${doc.arquivo}-${meta.pessoa.matricula}.txt`,
        conteudo: corpoArquivo(doc.titulo, [
          `Colaborador(a): ${meta.pessoa.nome_completo} (matrícula ${meta.pessoa.matricula})`,
          `Unidade: ${meta.pessoa.unidade ?? 'Matriz Centro'} — Cargo: ${meta.pessoa.cargo ?? '—'}`,
          `Data do fato: ${paraBr(meta.dataIso)}`,
          '',
          ...doc.corpo,
        ]),
        sensivel: true,
        enviadoPor: proximo(USUARIOS_DP, indice),
        dias: meta.item.dias,
        matricula: meta.pessoa.matricula,
      });
    });

  // Nome de arquivo é a CHAVE DE PROPRIEDADE deste módulo no GED (ver limpeza).
  const nomesArquivo = documentos.map((doc) => doc.nome_arquivo);
  if (new Set(nomesArquivo).size !== nomesArquivo.length) {
    throw new Error('Nome de arquivo duplicado no GED — a limpeza idempotente depende da unicidade.');
  }

  // ---------------------------------------------------------------- limpeza (idempotência)
  // O módulo apaga SÓ o que ele cria, identificado pelos textos literais deste
  // arquivo (descrição da ocorrência, resumo do feedback, descrição da ação) e
  // pelo nome do arquivo no GED. Nada de DELETE de tabela inteira: outros
  // módulos escrevem nas mesmas tabelas. Ordem filho → pai; tabelas append-only
  // exigem desligar o trigger DENTRO da transação (comTriggersDesligados
  // reabilita na mesma transação).
  const CHAVE_OCORRENCIAS = OCORRENCIAS.map((item) => item.descricao);
  const CHAVE_ACOES = ACOES.map((item) => item.descricao);
  const TABELAS_LIMPEZA = [
    'rh.ciencia',
    'rh.documento',
    'rh.acao_aberta',
    'rh.feedback_formal',
    'rh.ocorrencia',
    'rh.evento_colaborador',
  ];
  const removidos = {};
  await comTriggersDesligados(cliente, TABELAS_LIMPEZA, async () => {
    const ciencias = await cliente.query(
      `DELETE FROM rh.ciencia
        WHERE documento_id IN (SELECT id FROM rh.documento WHERE nome_arquivo = ANY($1))`,
      [nomesArquivo]
    );
    removidos['rh.ciencia'] = ciencias.rowCount;
    const docs = await cliente.query(
      'DELETE FROM rh.documento WHERE nome_arquivo = ANY($1)',
      [nomesArquivo]
    );
    removidos['rh.documento'] = docs.rowCount;

    // Linha do tempo ANTES das origens: os eventos apagados são só os que
    // apontam para as ocorrências/feedbacks deste módulo. Admissão, posição
    // inicial e desligamento (01-base) e eventos de outros módulos ficam.
    const eventos = await cliente.query(
      `DELETE FROM rh.evento_colaborador
        WHERE (origem_tabela = 'rh.ocorrencia'
               AND origem_id IN (SELECT id FROM rh.ocorrencia WHERE descricao = ANY($1)))
           OR (origem_tabela = 'rh.feedback_formal'
               AND origem_id IN (SELECT id FROM rh.feedback_formal WHERE resumo = ANY($2)))`,
      [CHAVE_OCORRENCIAS, RESUMOS_FEEDBACK]
    );
    removidos['rh.evento_colaborador'] = eventos.rowCount;

    const ocorrencias = await cliente.query(
      'DELETE FROM rh.ocorrencia WHERE descricao = ANY($1)',
      [CHAVE_OCORRENCIAS]
    );
    removidos['rh.ocorrencia'] = ocorrencias.rowCount;
    const feedbacks = await cliente.query(
      'DELETE FROM rh.feedback_formal WHERE resumo = ANY($1)',
      [RESUMOS_FEEDBACK]
    );
    removidos['rh.feedback_formal'] = feedbacks.rowCount;
    const acoes = await cliente.query(
      'DELETE FROM rh.acao_aberta WHERE descricao = ANY($1)',
      [CHAVE_ACOES]
    );
    removidos['rh.acao_aberta'] = acoes.rowCount;
  });
  const totalRemovido = Object.values(removidos).reduce((a, b) => a + b, 0);
  log(`02-pessoas: limpeza removeu ${totalRemovido} linha(s) da execução anterior.`);

  // ---------------------------------------------------------------- gravação
  const ocorrenciasGravadas = await inserirLote(
    cliente,
    'rh.ocorrencia',
    ['colaborador_id', 'tipo', 'restrita', 'descricao', 'impacto', 'acao_combinada',
     'ocorrida_em', 'registrado_por', 'registrado_em'],
    ocorrenciasLinhas,
    'id'
  );
  if (ocorrenciasGravadas.length !== ocorrenciasMeta.length) {
    throw new Error('RETURNING de rh.ocorrencia veio incompleto.');
  }

  const feedbacksGravados = await inserirLote(
    cliente,
    'rh.feedback_formal',
    ['colaborador_id', 'realizado_em', 'resumo', 'registrado_por', 'registrado_em'],
    feedbacksLinhas,
    'id'
  );
  if (feedbacksGravados.length !== feedbacksMeta.length) {
    throw new Error('RETURNING de rh.feedback_formal veio incompleto.');
  }

  await inserirLote(
    cliente,
    'rh.acao_aberta',
    ['colaborador_id', 'descricao', 'prazo', 'status', 'responsavel_id', 'criado_em', 'atualizado_em'],
    acoesLinhas
  );

  const documentosGravados = await inserirLote(
    cliente,
    'rh.documento',
    ['colaborador_id', 'categoria', 'titulo', 'nome_arquivo', 'mime', 'tamanho_bytes',
     'conteudo', 'sensivel', 'hash_sha256', 'enviado_por_usuario', 'enviado_em'],
    documentos.map((doc) => [
      doc.colaborador_id,
      doc.categoria,
      doc.titulo,
      doc.nome_arquivo,
      'text/plain',
      doc.conteudo.length,
      doc.conteudo,
      doc.sensivel,
      sha256(doc.conteudo),
      doc.enviadoPor,
      registroApos(diaAtras(doc.dias), 0, 12, 5),
    ]),
    'id, nome_arquivo'
  );
  const docPorArquivo = new Map(
    documentosGravados.map((linha) => [linha.nome_arquivo, Number(linha.id)])
  );

  // ---------------------------------------------------------------- ciências
  // Só combinações que o app deixaria acontecer: documento geral (todos veem)
  // e documento próprio NÃO sensível (funcionário vê os seus). Documento
  // sensível fica de fora: quem é o titular não tem documento.sensivel.ver.
  const ciencias = [];
  const chaveCiencia = new Set();
  const registrarCiencia = (nomeArquivo, usuarioId, diasApos) => {
    const documentoId = docPorArquivo.get(nomeArquivo);
    const doc = documentos.find((d) => d.nome_arquivo === nomeArquivo);
    if (!documentoId || !doc) throw new Error(`Documento ausente para ciência: ${nomeArquivo}`);
    const chave = `${documentoId}:${usuarioId}`;
    if (chaveCiencia.has(chave)) return;
    chaveCiencia.add(chave);
    ciencias.push([
      documentoId,
      usuarioId,
      registroApos(diaAtras(Math.max(2, doc.dias - diasApos)), 0, 15, 40),
      sha256(doc.conteudo),
    ]);
  };

  // 8 ciências em documentos gerais (política e comunicado). As personas
  // entram nomeadas; o resto sai da fila embaralhada, sem repetir as personas
  // (a UNIQUE (documento_id, usuario_id) descartaria a segunda ciência).
  const cientesGerais = embaralhar(
    rng,
    ativos.filter(
      (p) => p.matricula !== MAT_FUNCIONARIO && p.matricula !== MAT_GESTOR
    )
  ).slice(0, 6);
  registrarCiencia('politica-conduta-etica.txt', porMatricula.get(MAT_FUNCIONARIO).usuario_id, 6);
  registrarCiencia('politica-conduta-etica.txt', porMatricula.get(MAT_GESTOR).usuario_id, 5);
  registrarCiencia('politica-conduta-etica.txt', cientesGerais[0].usuario_id, 4);
  registrarCiencia('politica-uso-sistemas.txt', porMatricula.get(MAT_FUNCIONARIO).usuario_id, 9);
  registrarCiencia('politica-uso-sistemas.txt', cientesGerais[1].usuario_id, 7);
  registrarCiencia('comunicado-canal-escuta.txt', cientesGerais[2].usuario_id, 8);
  registrarCiencia('comunicado-horario-lojas.txt', porMatricula.get(MAT_GESTOR).usuario_id, 3);
  registrarCiencia('comunicado-campanha-drywall.txt', cientesGerais[3].usuario_id, 6);

  // 4 ciências no próprio contrato/termo (o titular vê os documentos dele)
  const proprios = documentos.filter(
    (doc) => doc.colaborador_id !== null && !doc.sensivel && doc.matricula
  );
  let dadas = 0;
  for (const doc of proprios) {
    if (dadas >= 4) break;
    const pessoa = porMatricula.get(doc.matricula);
    if (!pessoa) continue;
    registrarCiencia(doc.nome_arquivo, pessoa.usuario_id, 1);
    dadas += 1;
  }

  await inserirLote(
    cliente,
    'rh.ciencia',
    ['documento_id', 'usuario_id', 'dada_em', 'hash_no_momento'],
    ciencias
  );

  // ---------------------------------------------------------------- linha do tempo
  // Espelha exatamente o que o serviço grava: evento de ocorrência (com resumo
  // NEUTRO quando restrita, e payload.restrita usado pelo filtro da ficha) e
  // evento de feedback. Ação aberta e documento NÃO geram evento no app.
  const eventos = [];
  ocorrenciasMeta.forEach((meta, indice) => {
    const ocorrenciaId = Number(ocorrenciasGravadas[indice].id);
    const resumo = meta.restrita
      ? `Ocorrência restrita registrada sobre ${meta.pessoa.nome_completo} (detalhe na aba Ocorrências)`
      : `Ocorrência ${ROTULOS_OCORRENCIA[meta.item.tipo].toLowerCase()}: ${truncar(meta.item.descricao, 160)}`;
    eventos.push([
      meta.pessoa.colaborador_id,
      'ocorrencia',
      `${meta.dataIso}T00:00:00Z`,
      'rh.ocorrencia',
      ocorrenciaId,
      resumo,
      JSON.stringify({ tipo: meta.item.tipo, restrita: meta.restrita }),
      meta.registrador,
      registroApos(meta.data, 1, 13, 20),
    ]);
  });
  feedbacksMeta.forEach((meta, indice) => {
    const feedbackId = Number(feedbacksGravados[indice].id);
    eventos.push([
      meta.pessoa.colaborador_id,
      'feedback',
      `${meta.dataIso}T00:00:00Z`,
      'rh.feedback_formal',
      feedbackId,
      `Feedback formal em ${paraBr(meta.dataIso)}: ${truncar(meta.resumo, 160)}`,
      JSON.stringify({}),
      meta.registrador,
      registroApos(meta.data, 0, 21, 10),
    ]);
  });
  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    ['colaborador_id', 'tipo', 'ocorrido_em', 'origem_tabela', 'origem_id', 'resumo',
     'payload', 'registrado_por', 'registrado_em'],
    eventos
  );

  // ---------------------------------------------------------------- conferências duras
  const escalar = async (sql, parametros) => {
    const { rows } = await cliente.query(sql, parametros);
    return Number(rows[0].total);
  };
  const conferir = async (rotulo, sql, esperado, parametros) => {
    const obtido = await escalar(sql, parametros);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
    return obtido;
  };

  const CHAVE_OCO = [CHAVE_OCORRENCIAS];
  await conferir(
    'ocorrências',
    'SELECT count(*)::int AS total FROM rh.ocorrencia WHERE descricao = ANY($1)',
    OCORRENCIAS.length,
    CHAVE_OCO
  );
  await conferir(
    'ocorrências restritas',
    'SELECT count(*)::int AS total FROM rh.ocorrencia WHERE restrita AND descricao = ANY($1)',
    OCORRENCIAS.filter((o) => o.restrita).length,
    CHAVE_OCO
  );
  await conferir(
    'feedbacks',
    'SELECT count(*)::int AS total FROM rh.feedback_formal WHERE resumo = ANY($1)',
    feedbacksLinhas.length,
    [RESUMOS_FEEDBACK]
  );
  await conferir(
    'ações',
    'SELECT count(*)::int AS total FROM rh.acao_aberta WHERE descricao = ANY($1)',
    ACOES.length,
    [CHAVE_ACOES]
  );
  await conferir(
    'documentos do módulo',
    'SELECT count(*)::int AS total FROM rh.documento WHERE nome_arquivo = ANY($1)',
    documentos.length,
    [nomesArquivo]
  );
  await conferir(
    'ciências do módulo',
    `SELECT count(*)::int AS total FROM rh.ciencia c
      WHERE c.documento_id IN (SELECT id FROM rh.documento WHERE nome_arquivo = ANY($1))`,
    ciencias.length,
    [nomesArquivo]
  );
  await conferir(
    'eventos deste módulo',
    `SELECT count(*)::int AS total FROM rh.evento_colaborador e
      WHERE (e.origem_tabela = 'rh.ocorrencia'
             AND e.origem_id IN (SELECT id FROM rh.ocorrencia WHERE descricao = ANY($1)))
         OR (e.origem_tabela = 'rh.feedback_formal'
             AND e.origem_id IN (SELECT id FROM rh.feedback_formal WHERE resumo = ANY($2)))`,
    eventos.length,
    [CHAVE_OCORRENCIAS, RESUMOS_FEEDBACK]
  );
  await conferir(
    'hash SHA-256 conferindo com o conteúdo',
    `SELECT count(*)::int AS total FROM rh.documento
      WHERE nome_arquivo = ANY($1) AND hash_sha256 <> encode(sha256(conteudo), 'hex')`,
    0,
    [nomesArquivo]
  );
  await conferir(
    'ciência com hash divergente do documento',
    `SELECT count(*)::int AS total FROM rh.ciencia c
       JOIN rh.documento d ON d.id = c.documento_id
      WHERE d.nome_arquivo = ANY($1) AND c.hash_no_momento <> d.hash_sha256`,
    0,
    [nomesArquivo]
  );
  await conferir(
    'evento restrito sem marca no payload',
    `SELECT count(*)::int AS total FROM rh.evento_colaborador e
       JOIN rh.ocorrencia o ON o.id = e.origem_id
      WHERE e.origem_tabela = 'rh.ocorrencia' AND o.restrita
        AND o.descricao = ANY($1)
        AND COALESCE(e.payload->>'restrita', 'false') <> 'true'`,
    0,
    CHAVE_OCO
  );
  await conferir(
    'ocorrência restrita registrada por quem não pode',
    `SELECT count(*)::int AS total FROM rh.ocorrencia o
      WHERE o.restrita AND o.descricao = ANY($1)
        AND NOT sistema.tem_permissao(o.registrado_por, 'rh.ocorrencia.restrita.ver')`,
    0,
    CHAVE_OCO
  );
  await conferir(
    'ocorrência registrada por quem não pode registrar',
    `SELECT count(*)::int AS total FROM rh.ocorrencia o
      WHERE o.descricao = ANY($1)
        AND NOT sistema.tem_permissao(o.registrado_por, 'rh.ocorrencia.registrar')`,
    0,
    CHAVE_OCO
  );
  await conferir(
    'feedback registrado por quem não pode',
    `SELECT count(*)::int AS total FROM rh.feedback_formal f
      WHERE f.resumo = ANY($1)
        AND NOT sistema.tem_permissao(f.registrado_por, 'rh.feedback.registrar')`,
    0,
    [RESUMOS_FEEDBACK]
  );
  await conferir(
    'documento enviado por quem não pode',
    `SELECT count(*)::int AS total FROM rh.documento d
      WHERE d.nome_arquivo = ANY($1)
        AND NOT sistema.tem_permissao(d.enviado_por_usuario, 'documento.enviar')`,
    0,
    [nomesArquivo]
  );
  await conferir(
    'fato datado antes da admissão ou depois do desligamento',
    `SELECT count(*)::int AS total FROM (
       SELECT o.colaborador_id, o.ocorrida_em AS quando
         FROM rh.ocorrencia o WHERE o.descricao = ANY($1)
       UNION ALL
       SELECT f.colaborador_id, f.realizado_em
         FROM rh.feedback_formal f WHERE f.resumo = ANY($2)
     ) fatos
     JOIN rh.colaborador c ON c.id = fatos.colaborador_id
     WHERE fatos.quando < c.data_admissao
        OR (c.data_desligamento IS NOT NULL AND fatos.quando > c.data_desligamento)`,
    0,
    [CHAVE_OCORRENCIAS, RESUMOS_FEEDBACK]
  );

  // ---------------------------------------------------------------- resumo
  const cadencia = await cliente.query(
    `SELECT
       count(*) FILTER (WHERE dias IS NOT NULL AND dias <= $1)::int AS em_dia,
       count(*) FILTER (WHERE dias IS NOT NULL AND dias >  $1)::int AS vencidos,
       count(*) FILTER (WHERE dias IS NULL)::int                    AS sem_feedback
     FROM (
       SELECT c.id,
              ((now() AT TIME ZONE 'America/Sao_Paulo')::date - max(f.realizado_em)) AS dias
         FROM rh.colaborador c
         LEFT JOIN rh.feedback_formal f ON f.colaborador_id = c.id
        WHERE c.status <> 'desligado'
        GROUP BY c.id
     ) por_pessoa`,
    [CADENCIA_DIAS]
  );
  const acoes = await cliente.query(
    `SELECT
       count(*) FILTER (WHERE status = 'aberta' AND prazo >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS abertas_em_dia,
       count(*) FILTER (WHERE status = 'aberta' AND prazo <  (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS abertas_vencidas,
       count(*) FILTER (WHERE status = 'concluida')::int AS concluidas,
       count(*) FILTER (WHERE status = 'cancelada')::int AS canceladas
     FROM rh.acao_aberta WHERE descricao = ANY($1)`,
    [CHAVE_ACOES]
  );
  const porTipo = await cliente.query(
    `SELECT tipo, count(*)::int AS total FROM rh.ocorrencia
      WHERE descricao = ANY($1) GROUP BY tipo ORDER BY tipo`,
    [CHAVE_OCORRENCIAS]
  );
  const pessoasTocadas = await escalar(
    `SELECT count(DISTINCT colaborador_id)::int AS total FROM (
       SELECT colaborador_id FROM rh.ocorrencia WHERE descricao = ANY($1)
       UNION ALL SELECT colaborador_id FROM rh.feedback_formal WHERE resumo = ANY($2)
       UNION ALL SELECT colaborador_id FROM rh.acao_aberta WHERE descricao = ANY($3)
       UNION ALL SELECT colaborador_id FROM rh.documento
                  WHERE colaborador_id IS NOT NULL AND nome_arquivo = ANY($4)
     ) t`,
    [CHAVE_OCORRENCIAS, RESUMOS_FEEDBACK, CHAVE_ACOES, nomesArquivo]
  );

  const c = cadencia.rows[0];
  const a = acoes.rows[0];
  log(
    `02-pessoas: ${OCORRENCIAS.length} ocorrências (` +
      porTipo.rows.map((linha) => `${linha.tipo} ${linha.total}`).join(', ') +
      `; ${OCORRENCIAS.filter((o) => o.restrita).length} restritas).`
  );
  log(
    `02-pessoas: ${feedbacksLinhas.length} feedbacks — cadência de ${CADENCIA_DIAS} dias: ` +
      `${c.em_dia} em dia, ${c.vencidos} vencidos, ${c.sem_feedback} ativos ainda sem feedback.`
  );
  log(
    `02-pessoas: ${ACOES.length} ações — ${a.abertas_em_dia} abertas em dia, ` +
      `${a.abertas_vencidas} abertas vencidas, ${a.concluidas} concluídas, ${a.canceladas} canceladas.`
  );
  log(
    `02-pessoas: ${documentos.length} documentos no GED (` +
      `${documentos.filter((d) => d.colaborador_id === null).length} gerais, ` +
      `${documentos.filter((d) => d.sensivel).length} sensíveis) e ${ciencias.length} ciências.`
  );
  log(`02-pessoas: ${eventos.length} eventos na linha do tempo; ${pessoasTocadas} pessoas com histórico.`);
  log(
    `02-pessoas: âncoras — ${porMatricula.get(MAT_FUNCIONARIO).nome_completo} (persona funcionário) e ` +
      `${porMatricula.get(MAT_GESTOR).nome_completo} (persona gestor, equipe com alerta público e ` +
      `advertência restrita invisível para ele).`
  );

  return {
    ocorrencias: OCORRENCIAS.length,
    ocorrenciasRestritas: OCORRENCIAS.filter((o) => o.restrita).length,
    feedbacks: feedbacksLinhas.length,
    feedbackEmDia: c.em_dia,
    feedbackVencido: c.vencidos,
    acoes: ACOES.length,
    documentos: documentos.length,
    ciencias: ciencias.length,
    eventos: eventos.length,
  };
}

module.exports = { semear, OCORRENCIAS, ACOES, DOCUMENTOS_GERAIS };

if (require.main === module) {
  executarSozinho('02-pessoas', semear);
}
