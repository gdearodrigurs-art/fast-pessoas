// db/semear/03-demandas.js — a FILA DO DP viva: 35 demandas cobrindo todos os
// tipos do catálogo e todos os estados da máquina, com histórico de transições,
// thread de comentários e notificações internas coerentes.
//
// Perfil da empresa fictícia: o mesmo de 01-base.js (Fast — distribuidora de
// materiais de construção/drywall, 5 unidades). Este módulo NÃO cria pessoas:
// descobre os solicitantes no banco (personas, equipe do gestor de demonstração
// e um pool das demais unidades) — nada depende do ctx do orquestrador.
//
// O que o módulo produz (ver ROTEIRO e AVISOS abaixo):
//   • 35 demandas nos 7 tipos ativos de rh.tipo_demanda_versao e nos 5 estados
//     (aguardando_aprovacao, aberta, em_atendimento, concluida, recusada);
//   • prazos calculados como o app calcula (abertura em São Paulo + sla_dias),
//     com 5 ATRASADAS, 2 vencendo hoje e 3 vencendo amanhã;
//   • rh.demanda_transicao completo e cronológico para cada estado;
//   • rh.demanda_comentario: 26 comentários de conversa + as 10 respostas de
//     conclusão (o app grava a resposta também como comentário na thread);
//   • rh.evento_colaborador: 1 evento `demanda_concluida` por demanda concluída
//     (projeção na linha do tempo, como faz src/dominios/demandas/servico.ts);
//   • sistema.notificacao: 19 avisos NEUTROS (referência + link), a maioria não
//     lida, para o sino do cabeçalho mostrar contador.
//
// Fatos do domínio que este módulo respeita (lidos em src/dominios/demandas/):
//   • prazo = data de abertura (America/Sao_Paulo) + sla_dias da VERSÃO do tipo;
//   • tipo com exige_aprovacao_gestor abre em `aguardando_aprovacao`; quem
//     aprova/reprova é o GESTOR VIGENTE do solicitante (rh.relacao_gestor);
//   • `recusada` vinda de `aguardando_aprovacao` é exibida como "Reprovada pelo
//     gestor"; vinda de aberta/em_atendimento, como "Recusada pelo DP";
//   • só quem tem demanda.atender (papéis rh/dp) assume, conclui e recusa;
//   • notificação é AVISO, nunca conteúdo (0015_notificacoes.sql) — os textos
//     abaixo são os MESMOS que o serviço emite, e passam pela mesma barreira
//     heurística anti-vazamento (replicada em garantirTextoNeutro).
//
// Uso isolado: node --env-file=.env db/semear/03-demandas.js
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  aleatorio,
  comTriggersDesligados,
  dataRelativa,
  executarSozinho,
  inserirLote,
  inteiro,
  iso,
  log,
} = require('./comum');

const SEMENTE = 20260803; // fixa: mesma execução ⇒ mesmos dados
const DOMINIO = 'fastdemo.local';

const EMAIL_GESTOR = `gestor@${DOMINIO}`;
const EMAIL_FUNCIONARIO = `funcionario@${DOMINIO}`;
const EMAIL_DP = `dp@${DOMINIO}`;
const EMAIL_RH = `rh@${DOMINIO}`;
const EMAIL_DIRETORIA = `diretora.pessoas@${DOMINIO}`;

const PERSONAS = [
  EMAIL_DIRETORIA,
  EMAIL_GESTOR,
  EMAIL_RH,
  EMAIL_DP,
  EMAIL_FUNCIONARIO,
];

// ------------------------------------------------------------------ roteiro
//
// Cada demanda declara:
//   ref        identificador interno (usado pelos avisos)
//   tipo       chave em rh.tipo_demanda_versao (o SLA vem do banco, não daqui)
//   quem       solicitante: 'funcionario' | 'gestor' | 'rh' | 'equipe:N' | 'outros:N'
//   status     estado FINAL (conferido contra a última transição)
//   prazoEm    prazo em dias a partir de HOJE (negativo = atrasada)
//              ⇒ a abertura é calculada de trás para frente: prazoEm − sla_dias
//   linha      eventos em ordem CRONOLÓGICA (dias a partir de hoje, sempre ≤ −1):
//              ['aprovar', dia] | ['reprovar', dia, motivo]
//              ['assumir', dia, atendente] | ['concluir', dia, resposta]
//              ['recusar', dia, motivo] | ['comentario', autor, dia, texto]
//              autor: 'solicitante' | 'gestor' | 'atendente' | 'dp' | 'rh'
//              atendente: 'dp' | 'dp2' | 'rh' | 'rh2'
//
// Nada de data absoluta nos TEXTOS ("na semana passada", nunca "dia 12"): a
// demo tem que soar atual em qualquer dia em que for resetada.

const ROTEIRO = [
  // ---------------------------------------------------------------- aguardando aprovação do gestor (6)
  {
    ref: 'G1',
    tipo: 'ajuste_ponto',
    quem: 'funcionario',
    status: 'aguardando_aprovacao',
    prazoEm: 1,
    descricao:
      'Esqueci de registrar a saída na terça-feira passada: fiquei até mais tarde finalizando o inventário do setor de drywall e o ponto ficou aberto. Peço o ajuste da marcação de saída.',
    linha: [
      [
        'comentario',
        'solicitante',
        -4,
        'Se ajudar, o pessoal da portaria pode confirmar o horário em que eu saí.',
      ],
      [
        'comentario',
        'gestor',
        -3,
        'Confirmei com a supervisão que você ficou além do horário. Aprovo assim que fechar a escala da semana.',
      ],
    ],
  },
  {
    ref: 'G2',
    tipo: 'ajuste_ponto',
    quem: 'equipe:6',
    status: 'aguardando_aprovacao',
    prazoEm: 3,
    descricao:
      'Cheguei atrasado por causa do bloqueio na rodovia e a marcação de entrada não foi aceita pelo relógio. Solicito o ajuste com base no registro da portaria.',
    linha: [
      [
        'comentario',
        'solicitante',
        -2,
        'Mandei a foto do boletim de ocorrência do trânsito para o DP por e-mail.',
      ],
    ],
  },
  {
    ref: 'G3',
    tipo: 'ajuste_ponto',
    quem: 'equipe:2',
    status: 'aguardando_aprovacao',
    prazoEm: -2, // aprovação parada: aparece atrasada no painel do gestor
    descricao:
      'O relógio de ponto da loja ficou fora do ar na parte da manhã e as minhas duas primeiras marcações não gravaram. Avisei a supervisão no mesmo dia.',
    linha: [
      [
        'comentario',
        'solicitante',
        -7,
        'O equipamento ficou fora do ar logo na abertura; a loja inteira teve o mesmo problema.',
      ],
      [
        'comentario',
        'solicitante',
        -2,
        'Consegue dar uma olhada? Está parado há alguns dias e o fechamento do ponto está chegando.',
      ],
    ],
  },
  {
    ref: 'G4',
    tipo: 'programacao_ferias',
    quem: 'equipe:5',
    status: 'aguardando_aprovacao',
    prazoEm: 4,
    descricao:
      'Quero programar 20 dias de férias no período de férias escolares dos meus filhos, com abono de 10 dias, se couber na escala da loja.',
    linha: [
      [
        'comentario',
        'solicitante',
        -1,
        'Se o período não couber na escala, consigo antecipar em uma semana.',
      ],
    ],
  },
  {
    ref: 'G5',
    tipo: 'programacao_ferias',
    quem: 'equipe:4',
    status: 'aguardando_aprovacao',
    prazoEm: 2,
    descricao:
      'Peço a programação das minhas férias logo após o fechamento do inventário, dividindo em dois períodos de 15 dias.',
    linha: [
      [
        'comentario',
        'solicitante',
        -3,
        'Se precisar, consigo inverter a ordem dos dois períodos.',
      ],
    ],
  },
  {
    ref: 'G6',
    tipo: 'ajuste_ponto',
    quem: 'outros:0',
    status: 'aguardando_aprovacao',
    prazoEm: 4,
    descricao:
      'Fiz entrega em obra no fim da tarde e voltei direto para casa, sem passar na filial para bater o ponto de saída. Peço o ajuste conforme o canhoto assinado pelo cliente.',
    linha: [],
  },

  // ---------------------------------------------------------------- reprovadas pelo gestor (2)
  {
    ref: 'G7',
    tipo: 'ajuste_ponto',
    quem: 'equipe:7',
    status: 'recusada',
    prazoEm: -1,
    descricao:
      'Solicito ajuste de saída em três dias da semana passada, quando fiquei além do horário organizando o arquivo do administrativo.',
    linha: [
      [
        'comentario',
        'solicitante',
        -6,
        'Fiquei além do horário nos três dias por causa do arquivo que precisava ser reorganizado.',
      ],
      [
        'comentario',
        'gestor',
        -5,
        'Vamos conversar antes de eu decidir: preciso entender por que a hora extra não foi combinada comigo.',
      ],
      [
        'reprovar',
        -4,
        'Não houve autorização prévia de hora extra nesses dias. Combine a compensação comigo antes de lançar o ajuste.',
      ],
    ],
  },
  {
    ref: 'G8',
    tipo: 'programacao_ferias',
    quem: 'outros:1',
    status: 'recusada',
    prazoEm: -3,
    descricao:
      'Gostaria de sair de férias por 30 dias corridos a partir do fechamento do mês que vem.',
    linha: [
      [
        'reprovar',
        -6,
        'O período coincide com o inventário e com as férias de outros dois colegas da equipe. Traga duas opções de data depois do fechamento.',
      ],
    ],
  },

  // ---------------------------------------------------------------- aprovadas e seguindo o fluxo (3)
  {
    ref: 'G9',
    tipo: 'ajuste_ponto',
    quem: 'equipe:3',
    status: 'em_atendimento',
    prazoEm: 2,
    descricao:
      'Marcação de intervalo duplicada no dia em que assumi o recebimento do caminhão de placas; o sistema gravou duas saídas seguidas.',
    linha: [
      [
        'comentario',
        'solicitante',
        -3,
        'A duplicidade aparece só no intervalo; entrada e saída do dia estão certas.',
      ],
      ['aprovar', -2],
      ['assumir', -1, 'dp'],
      [
        'comentario',
        'atendente',
        -1,
        'Aprovação do gestor recebida. Lanço o ajuste na apuração desta semana.',
      ],
    ],
  },
  {
    ref: 'G10',
    tipo: 'ajuste_ponto',
    quem: 'equipe:0',
    status: 'concluida',
    prazoEm: -4,
    descricao:
      'Fiquei retido no cliente até depois do horário na entrega de gesso e não consegui registrar a saída pelo aplicativo.',
    linha: [
      [
        'comentario',
        'solicitante',
        -9,
        'O cliente assinou o canhoto com o horário; se precisar, eu envio.',
      ],
      ['aprovar', -8],
      ['assumir', -7, 'dp'],
      [
        'comentario',
        'atendente',
        -7,
        'Recebi o canhoto da entrega, é o suficiente para justificar o ajuste.',
      ],
      [
        'concluir',
        -5,
        'Ajuste lançado na apuração do período com base no comprovante de entrega. A marcação corrigida já aparece no seu espelho de ponto.',
      ],
    ],
  },
  {
    ref: 'G11',
    tipo: 'programacao_ferias',
    quem: 'equipe:1',
    status: 'concluida',
    prazoEm: -6,
    descricao:
      'Solicito programar 30 dias de férias a partir do início do próximo período aquisitivo, conforme conversamos na reunião de equipe.',
    linha: [
      [
        'comentario',
        'solicitante',
        -11,
        'Combinei com a equipe a cobertura do período; ninguém fica sozinho na conferência.',
      ],
      ['aprovar', -10],
      ['assumir', -9, 'rh'],
      [
        'concluir',
        -7,
        'Programação registrada e aviso de férias emitido dentro do prazo legal. O documento está disponível para ciência no seu painel.',
      ],
    ],
  },

  // ---------------------------------------------------------------- abertas na fila do DP (8)
  {
    ref: 'A1',
    tipo: 'declaracao_vinculo',
    quem: 'funcionario',
    status: 'aberta',
    prazoEm: -3, // atrasada
    descricao:
      'Preciso de declaração de vínculo empregatício para apresentar na matrícula da faculdade. Pode ser em PDF mesmo.',
    linha: [
      [
        'comentario',
        'solicitante',
        -6,
        'Se possível, preciso até o fim da semana por causa do prazo da matrícula.',
      ],
      [
        'comentario',
        'solicitante',
        -1,
        'Bom dia! Consegue me dar um retorno? O prazo da faculdade vence nesta semana.',
      ],
    ],
  },
  {
    ref: 'A2',
    tipo: 'informe_rendimentos',
    quem: 'outros:2',
    status: 'aberta',
    prazoEm: -2, // atrasada
    descricao:
      'Solicito o informe de rendimentos do ano passado para a declaração do imposto de renda.',
    linha: [
      ['comentario', 'solicitante', -4, 'Já procurei no portal e não encontrei o arquivo.'],
    ],
  },
  {
    ref: 'A3',
    tipo: 'duvida_folha',
    quem: 'outros:3',
    status: 'aberta',
    prazoEm: -1, // atrasada
    descricao:
      'Tenho dúvida sobre o desconto de vale-transporte que apareceu no último recibo. Podem me explicar como foi calculado?',
    linha: [
      [
        'comentario',
        'solicitante',
        -5,
        'O desconto mudou de um mês para o outro e eu não pedi alteração de rota.',
      ],
    ],
  },
  {
    ref: 'A4',
    tipo: 'declaracao_vinculo',
    quem: 'outros:4',
    status: 'aberta',
    prazoEm: 0, // vence hoje
    descricao:
      'Solicito declaração de vínculo para abertura de conta salário em outro banco.',
    linha: [],
  },
  {
    ref: 'A5',
    tipo: 'outros',
    quem: 'funcionario',
    status: 'aberta',
    prazoEm: 1, // vence amanhã
    descricao:
      'Perdi o meu crachá de acesso na semana passada e preciso de uma segunda via para entrar no depósito.',
    linha: [],
  },
  {
    ref: 'A6',
    tipo: 'adesao_beneficio',
    quem: 'outros:5',
    status: 'aberta',
    prazoEm: 3,
    descricao:
      'Quero aderir ao plano odontológico e incluir a minha esposa como dependente.',
    linha: [],
  },
  {
    ref: 'A7',
    tipo: 'outros',
    quem: 'gestor',
    status: 'aberta',
    prazoEm: 5,
    descricao:
      'Preciso de um relatório com data de admissão e cargo de toda a equipe da Matriz Centro para a reunião de planejamento do trimestre.',
    linha: [],
  },
  {
    ref: 'A8',
    tipo: 'duvida_folha',
    quem: 'outros:6',
    status: 'aberta',
    prazoEm: 2,
    descricao:
      'Não entendi a diferença de proventos entre este mês e o anterior; queria conferir item a item o que mudou.',
    linha: [],
  },

  // ---------------------------------------------------------------- em atendimento (6 sem aprovação)
  {
    ref: 'B1',
    tipo: 'declaracao_vinculo',
    quem: 'outros:7',
    status: 'em_atendimento',
    prazoEm: -4, // atrasada
    descricao:
      'Preciso de declaração de vínculo com data de admissão e cargo para o processo de financiamento imobiliário.',
    linha: [
      ['assumir', -6, 'dp'],
      [
        'comentario',
        'atendente',
        -3,
        'O modelo de declaração está em revisão pelo jurídico. Assim que liberar, emito a sua — obrigada pela paciência.',
      ],
    ],
  },
  {
    ref: 'B2',
    tipo: 'duvida_folha',
    quem: 'outros:8',
    status: 'em_atendimento',
    prazoEm: -1, // atrasada
    descricao:
      'Queria entender como funciona o adiantamento quinzenal e se posso pedir para sair dele.',
    linha: [
      [
        'comentario',
        'solicitante',
        -5,
        'Se der para sair do adiantamento, prefiro receber tudo de uma vez.',
      ],
      ['assumir', -4, 'rh'],
      [
        'comentario',
        'atendente',
        -2,
        'Confirmei com a folha que o adiantamento é opcional. Preparo o formulário de saída e te envio.',
      ],
    ],
  },
  {
    ref: 'B3',
    tipo: 'informe_rendimentos',
    quem: 'funcionario',
    status: 'em_atendimento',
    prazoEm: 0, // vence hoje
    descricao:
      'Não localizei o informe de rendimentos no meu painel de documentos. Pode ser reenviado?',
    linha: [
      ['assumir', -1, 'dp'],
      [
        'comentario',
        'atendente',
        -1,
        'Localizei o seu informe. Republico no painel de documentos ainda hoje.',
      ],
    ],
  },
  {
    ref: 'B4',
    tipo: 'outros',
    quem: 'outros:9',
    status: 'em_atendimento',
    prazoEm: 1, // vence amanhã
    descricao:
      'Solicito a alteração do meu endereço no cadastro; mudei de bairro no mês passado.',
    linha: [
      ['assumir', -4, 'dp2'],
      [
        'comentario',
        'atendente',
        -3,
        'Recebi o comprovante de endereço. Falta só atualizar o cadastro do vale-transporte.',
      ],
    ],
  },
  {
    ref: 'B5',
    tipo: 'adesao_beneficio',
    quem: 'outros:10',
    status: 'em_atendimento',
    prazoEm: 3,
    descricao:
      'Solicito adesão ao vale-refeição a partir do próximo mês.',
    linha: [['assumir', -1, 'rh2']],
  },
  {
    ref: 'B6',
    tipo: 'outros',
    quem: 'outros:11',
    status: 'em_atendimento',
    prazoEm: 5,
    descricao:
      'Gostaria de saber quais documentos preciso entregar para incluir o meu filho recém-nascido como dependente.',
    linha: [['assumir', -1, 'dp']],
  },

  // ---------------------------------------------------------------- concluídas (8 sem aprovação)
  {
    ref: 'C1',
    tipo: 'declaracao_vinculo',
    quem: 'funcionario',
    status: 'concluida',
    prazoEm: -8,
    descricao:
      'Declaração de vínculo para apresentar na inclusão do meu dependente no plano de saúde.',
    linha: [
      ['assumir', -10, 'dp'],
      [
        'concluir',
        -9,
        'Declaração emitida e publicada no GED com os seus dados de admissão e cargo atuais. Já está disponível em Documentos.',
      ],
    ],
  },
  {
    ref: 'C2',
    tipo: 'informe_rendimentos',
    quem: 'funcionario',
    status: 'concluida',
    prazoEm: -14,
    descricao:
      'Preciso do informe de rendimentos do ano passado para a declaração de ajuste anual.',
    linha: [
      ['assumir', -15, 'dp'],
      [
        'concluir',
        -14,
        'Informe de rendimentos publicado no GED. Confira em Documentos; o arquivo fica disponível para download a qualquer momento.',
      ],
    ],
  },
  {
    ref: 'C3',
    tipo: 'duvida_folha',
    quem: 'outros:12',
    status: 'concluida',
    prazoEm: -9,
    descricao:
      'Dúvida sobre o desconto do plano odontológico que passou a aparecer no meu recibo.',
    linha: [
      [
        'comentario',
        'solicitante',
        -13,
        'Não me lembro de ter feito essa adesão, por isso a dúvida.',
      ],
      ['assumir', -12, 'rh'],
      [
        'concluir',
        -10,
        'Conferimos item a item com você por telefone: o desconto corresponde à adesão registrada no mês passado, com a sua assinatura no termo. Nada a corrigir.',
      ],
    ],
  },
  {
    ref: 'C4',
    tipo: 'outros',
    quem: 'outros:13',
    status: 'concluida',
    prazoEm: -12,
    descricao:
      'Preciso corrigir a grafia do meu nome no cadastro: está com uma letra trocada nos documentos internos.',
    linha: [
      ['assumir', -17, 'dp2'],
      [
        'comentario',
        'atendente',
        -17,
        'Pode me enviar uma foto do RG para eu conferir a grafia correta antes de alterar?',
      ],
      [
        'concluir',
        -13,
        'Cadastro corrigido conforme o documento apresentado. A correção já aparece nos seus documentos e no crachá novo.',
      ],
    ],
  },
  {
    ref: 'C5',
    tipo: 'declaracao_vinculo',
    quem: 'outros:14',
    status: 'concluida',
    prazoEm: -20,
    descricao:
      'Solicito declaração de vínculo para a renovação da minha CNH profissional no órgão de trânsito.',
    linha: [
      ['assumir', -22, 'dp'],
      [
        'concluir',
        -21,
        'Declaração assinada pelo DP e publicada em Documentos. Se precisar de via impressa, retire na Matriz Centro.',
      ],
    ],
  },
  {
    ref: 'C6',
    tipo: 'adesao_beneficio',
    quem: 'outros:15',
    status: 'concluida',
    prazoEm: -6,
    descricao:
      'Quero incluir o meu filho no plano de saúde; ele nasceu no mês passado.',
    linha: [
      ['assumir', -9, 'rh2'],
      [
        'concluir',
        -7,
        'Adesão registrada e inclusão enviada à operadora. A carteirinha chega na unidade em até 15 dias.',
      ],
    ],
  },
  {
    ref: 'C7',
    tipo: 'informe_rendimentos',
    quem: 'outros:16',
    status: 'concluida',
    prazoEm: -5,
    descricao:
      'Solicito segunda via do informe de rendimentos; perdi o arquivo que eu havia baixado.',
    linha: [
      ['assumir', -6, 'dp'],
      [
        'concluir',
        -5,
        'Segunda via publicada em Documentos. O arquivo fica disponível para download a qualquer momento.',
      ],
    ],
  },
  {
    ref: 'C8',
    tipo: 'declaracao_vinculo',
    quem: 'rh',
    status: 'concluida',
    prazoEm: -7,
    descricao:
      'Preciso de declaração de vínculo para a matrícula na pós-graduação em gestão de pessoas.',
    linha: [
      ['assumir', -9, 'dp'],
      ['concluir', -8, 'Declaração emitida e disponível em Documentos para download.'],
    ],
  },

  // ---------------------------------------------------------------- recusadas pelo DP (2)
  {
    ref: 'R1',
    tipo: 'informe_rendimentos',
    quem: 'outros:17',
    status: 'recusada',
    prazoEm: -2,
    descricao:
      'Preciso do informe de rendimentos; abri outro chamado antes e não vi resposta, então estou abrindo de novo.',
    linha: [
      [
        'recusar',
        -3,
        'Pedido duplicado: já existe demanda aberta para o mesmo informe. Vamos concentrar o atendimento na demanda anterior, que segue na fila.',
      ],
    ],
  },
  {
    ref: 'R2',
    tipo: 'duvida_folha',
    quem: 'outros:18',
    status: 'recusada',
    prazoEm: -5,
    descricao:
      'Queria saber quanto o meu colega de setor recebe, para comparar com o meu caso.',
    linha: [
      [
        'comentario',
        'solicitante',
        -9,
        'Só quero entender se estou na mesma faixa que os colegas do setor.',
      ],
      ['assumir', -8, 'dp'],
      [
        'recusar',
        -6,
        'Não podemos informar dado de outra pessoa — é regra de proteção de dados, vale para todo mundo. Se a dúvida for sobre a sua própria remuneração, abra uma nova demanda que atendemos normalmente.',
      ],
    ],
  },
];

// ------------------------------------------------------------------ notificações
//
// `em` aponta o evento cujo instante a notificação reaproveita ('abertura' ou
// o nome do passo). Destinatário: 'gestor' (aprovação pendente) ou
// 'solicitante' (andamento da própria demanda) — nunca terceiros.
// Maioria NÃO lida de propósito: o sino precisa mostrar contador na demo.

const AVISOS = [
  { ref: 'G1', evento: 'demanda.aprovacao_pendente', em: 'abertura', lida: false },
  { ref: 'G2', evento: 'demanda.aprovacao_pendente', em: 'abertura', lida: false },
  { ref: 'G3', evento: 'demanda.aprovacao_pendente', em: 'abertura', lida: false },
  { ref: 'G4', evento: 'demanda.aprovacao_pendente', em: 'abertura', lida: false },
  { ref: 'G5', evento: 'demanda.aprovacao_pendente', em: 'abertura', lida: false },
  { ref: 'G6', evento: 'demanda.aprovacao_pendente', em: 'abertura', lida: false },
  { ref: 'G7', evento: 'demanda.reprovada', em: 'reprovar', lida: false },
  { ref: 'G8', evento: 'demanda.reprovada', em: 'reprovar', lida: true },
  { ref: 'G9', evento: 'demanda.aprovada', em: 'aprovar', lida: true },
  { ref: 'G9', evento: 'demanda.em_atendimento', em: 'assumir', lida: false },
  { ref: 'G10', evento: 'demanda.concluida', em: 'concluir', lida: true },
  { ref: 'G11', evento: 'demanda.concluida', em: 'concluir', lida: true },
  { ref: 'B1', evento: 'demanda.em_atendimento', em: 'assumir', lida: false },
  { ref: 'B3', evento: 'demanda.em_atendimento', em: 'assumir', lida: false },
  { ref: 'C1', evento: 'demanda.concluida', em: 'concluir', lida: true },
  { ref: 'C7', evento: 'demanda.concluida', em: 'concluir', lida: false },
  { ref: 'C8', evento: 'demanda.concluida', em: 'concluir', lida: false },
  { ref: 'R1', evento: 'demanda.recusada', em: 'recusar', lida: false },
  { ref: 'R2', evento: 'demanda.recusada', em: 'recusar', lida: true },
  // Fila do DP: quem atende precisa SABER que o pedido chegou. Estes avisos
  // vão para todo mundo com demanda.atender (menos quem fez a ação), como o
  // serviço faz em notificarFilaDoDp.
  { ref: 'G9', evento: 'demanda.na_fila', em: 'aprovar', lida: true },
  { ref: 'B1', evento: 'demanda.na_fila', em: 'abertura', lida: false },
  { ref: 'B3', evento: 'demanda.na_fila', em: 'abertura', lida: false },
  { ref: 'C7', evento: 'demanda.na_fila', em: 'abertura', lida: true },
  { ref: 'C8', evento: 'demanda.na_fila', em: 'abertura', lida: true },
  { ref: 'R1', evento: 'demanda.na_fila', em: 'abertura', lida: false },
];

// Textos IDÊNTICOS aos de src/dominios/demandas/servico.ts — a demo tem que
// mostrar o aviso que o sistema realmente emite, não uma versão "de vitrine".
const MODELO_AVISO = {
  'demanda.aprovacao_pendente': {
    para: 'gestor',
    titulo: 'Demanda aguardando sua aprovação',
    corpo: (ctx) =>
      `${ctx.solicitanteNome} abriu a demanda ${ctx.numero} e aguarda sua decisão.`,
  },
  'demanda.aprovada': {
    para: 'solicitante',
    titulo: 'Demanda aprovada pelo gestor',
    corpo: (ctx) => `A demanda ${ctx.numero} foi aprovada e entrou na fila do DP.`,
  },
  'demanda.reprovada': {
    para: 'solicitante',
    titulo: 'Demanda reprovada pelo gestor',
    corpo: (ctx) =>
      `A demanda ${ctx.numero} foi reprovada. Veja o motivo na página da demanda.`,
  },
  'demanda.em_atendimento': {
    para: 'solicitante',
    titulo: 'Demanda em atendimento',
    corpo: (ctx) =>
      `A demanda ${ctx.numero} foi assumida pelo DP e está em atendimento.`,
  },
  'demanda.concluida': {
    para: 'solicitante',
    titulo: 'Demanda concluída pelo DP',
    corpo: (ctx) =>
      `A demanda ${ctx.numero} foi concluída. Veja a resposta na página da demanda.`,
  },
  'demanda.recusada': {
    para: 'solicitante',
    titulo: 'Demanda recusada pelo DP',
    corpo: (ctx) =>
      `A demanda ${ctx.numero} foi recusada. Veja o motivo na página da demanda.`,
  },
  'demanda.na_fila': {
    para: 'fila_dp',
    titulo: 'Nova demanda na fila do DP',
    corpo: (ctx) =>
      `${ctx.numero} (${ctx.tipoNome}) entrou na fila e aguarda atendimento.`,
  },
};

// ------------------------------------------------------------------ guarda anti-vazamento
// Réplica das PADROES_PROIBIDOS de src/dominios/notificacoes/servico.ts: se o
// semeador escrever aviso com dado sensível, ele QUEBRA aqui — a demo nunca
// mostra na tela algo que o app recusaria emitir.

const PADROES_PROIBIDOS = [
  [/R\$/, 'valor monetário (R$)'],
  [/\b\d{1,3}(\.\d{3})*,\d{2}\b/, 'número em formato monetário'],
  [/\b(sal[áa]rios?|remunera[çc][ãa]o|vencimentos?)\b\D{0,30}\d/i, 'salário com número'],
  [/\bCID\b/i, 'menção a CID'],
  [/\b[A-Z]\d{2}(\.\d)?\b/, 'código no formato CID-10'],
  [/\b(diagn[óo]stico|doen[çc]a|enfermidade|laudo)\b/i, 'termo de saúde'],
  [/\bnotas?\b\D{0,15}\d/i, 'nota de avaliação'],
  [/\bresposta(s)?\b[\s\S]{0,40}\bclima\b/i, 'resposta de pesquisa de clima'],
];

function garantirTextoNeutro(campo, texto) {
  for (const [padrao, motivo] of PADROES_PROIBIDOS) {
    if (padrao.test(texto)) {
      throw new Error(
        `Notificação semeada recusada: ${campo} contém ${motivo} — use referência neutra + link.`
      );
    }
  }
}

// ------------------------------------------------------------------ utilidades locais

/** DEM-0001, como formatarNumeroDemanda() em src/dominios/demandas/esquemas.ts. */
function numeroDemanda(numero) {
  return `DEM-${String(numero).padStart(4, '0')}`;
}

/**
 * Instante UTC de um dia relativo a hoje. As horas ficam entre 11h e 20h UTC
 * (08h–17h em São Paulo) DE PROPÓSITO: assim a data-calendário em São Paulo é a
 * mesma do dia UTC, e o prazo calculado bate com o que o app calcularia.
 */
function instante(dias, hora, minuto) {
  const data = dataRelativa(dias);
  data.setUTCHours(hora, minuto, 0, 0);
  return data.toISOString();
}

const TRANSICAO_POR_PASSO = {
  aprovar: { de: 'aguardando_aprovacao', para: 'aberta', ator: 'gestor' },
  reprovar: { de: 'aguardando_aprovacao', para: 'recusada', ator: 'gestor' },
  assumir: { de: 'aberta', para: 'em_atendimento', ator: 'atendente' },
  concluir: { de: 'em_atendimento', para: 'concluida', ator: 'atendente' },
  recusar: { de: null /* aberta ou em_atendimento */, para: 'recusada', ator: 'atendente' },
};

// ------------------------------------------------------------------ descoberta de gente

async function carregarElenco(cliente) {
  const { rows: tipos } = await cliente.query(
    `SELECT id, chave, nome, sla_dias, exige_aprovacao_gestor
       FROM rh.tipo_demanda_versao
      WHERE status = 'ativa'`
  );
  const porChave = new Map(tipos.map((t) => [t.chave, { ...t, id: Number(t.id) }]));

  const { rows: pessoas } = await cliente.query(
    `SELECT u.id AS usuario_id, u.email, u.nome, u.papel, c.id AS colaborador_id
       FROM sistema.usuario u
       JOIN rh.colaborador c ON c.usuario_id = u.id
      WHERE u.email = ANY($1)`,
    [PERSONAS]
  );
  const porEmail = new Map(pessoas.map((p) => [p.email, normalizar(p)]));
  for (const email of PERSONAS) {
    if (!porEmail.has(email)) {
      throw new Error(`Persona ausente: ${email}. Rode 01-base antes deste módulo.`);
    }
  }

  // Equipe do gestor de demonstração, sem a persona funcionário (que tem
  // referência própria no roteiro) e sem os desligados — quem saiu não abre
  // demanda. O filtro por status fica de pé por si: desde a correção do
  // desligamento, a relação de gestor de quem sai é ENCERRADA (01-base semeia
  // assim). Ordem por matrícula = ordem estável entre execuções.
  const { rows: equipe } = await cliente.query(
    `SELECT lu.id AS usuario_id, lu.email, lu.nome, lu.papel, lc.id AS colaborador_id
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
       JOIN sistema.usuario gu ON gu.id = gc.usuario_id
       JOIN rh.colaborador lc ON lc.id = rg.liderado_colaborador_id
       JOIN sistema.usuario lu ON lu.id = lc.usuario_id
      WHERE rg.fim_vigencia IS NULL
        AND gu.email = $1
        AND lu.email <> $2
        AND lc.status = 'ativo'
      ORDER BY lc.matricula`,
    [EMAIL_GESTOR, EMAIL_FUNCIONARIO]
  );

  // Demais unidades. Só entra quem tem GESTOR VIGENTE COM PAPEL `gestor`: os
  // tipos com aprovação exigem um aprovador que de fato possua demanda.aprovar
  // (a diretoria, por RBAC, não aprova — ver 0003_demandas.sql).
  const { rows: pool } = await cliente.query(
    `SELECT u.id AS usuario_id, u.email, u.nome, u.papel, c.id AS colaborador_id
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE c.status = 'ativo'
        AND u.papel IN ('funcionario', 'gestor')
        AND u.email <> ALL($1)
        AND EXISTS (SELECT 1
                      FROM rh.relacao_gestor rg
                      JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
                      JOIN sistema.usuario gu ON gu.id = gc.usuario_id
                     WHERE rg.liderado_colaborador_id = c.id
                       AND rg.fim_vigencia IS NULL
                       AND gu.papel = 'gestor')
        AND NOT EXISTS (SELECT 1
                          FROM rh.relacao_gestor rg
                          JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
                          JOIN sistema.usuario gu ON gu.id = gc.usuario_id
                         WHERE rg.liderado_colaborador_id = c.id
                           AND rg.fim_vigencia IS NULL
                           AND gu.email = $2)
      ORDER BY c.matricula`,
    [PERSONAS, EMAIL_GESTOR]
  );

  // Atendentes: quem tem demanda.atender (papéis rh e dp). As personas primeiro;
  // o segundo de cada papel entra como 'dp2'/'rh2' para a fila não parecer
  // atendida por uma pessoa só.
  const { rows: atendentes } = await cliente.query(
    `SELECT u.id AS usuario_id, u.email, u.nome, u.papel, c.id AS colaborador_id
       FROM sistema.usuario u
       JOIN rh.colaborador c ON c.usuario_id = u.id
      WHERE u.papel IN ('dp', 'rh')
        AND u.email LIKE $1
      ORDER BY u.id`,
    [`%@${DOMINIO}`]
  );
  const secundario = (papel, emailPersona, reserva) => {
    const outro = atendentes.find((a) => a.papel === papel && a.email !== emailPersona);
    return outro ? normalizar(outro) : reserva;
  };

  const elenco = {
    tipos: porChave,
    equipe: equipe.map(normalizar),
    pool: pool.map(normalizar),
    dp: porEmail.get(EMAIL_DP),
    rh: porEmail.get(EMAIL_RH),
    gestor: porEmail.get(EMAIL_GESTOR),
    funcionario: porEmail.get(EMAIL_FUNCIONARIO),
    dp2: secundario('dp', EMAIL_DP, porEmail.get(EMAIL_DP)),
    rh2: secundario('rh', EMAIL_RH, porEmail.get(EMAIL_RH)),
  };

  if (elenco.equipe.length < 9) {
    throw new Error(
      `A equipe ativa de ${EMAIL_GESTOR} tem ${elenco.equipe.length} pessoa(s); o roteiro precisa de 9.`
    );
  }
  if (elenco.pool.length < 19) {
    throw new Error(
      `Pool de solicitantes com ${elenco.pool.length} pessoa(s); o roteiro precisa de 19.`
    );
  }
  return elenco;
}

function normalizar(linha) {
  return {
    usuarioId: Number(linha.usuario_id),
    colaboradorId: Number(linha.colaborador_id),
    email: linha.email,
    nome: linha.nome,
    papel: linha.papel,
  };
}

/** Gestor vigente de cada solicitante (o aprovador que o app resolveria). */
async function carregarGestores(cliente, usuarioIds) {
  const { rows } = await cliente.query(
    `SELECT DISTINCT ON (sc.usuario_id)
            sc.usuario_id AS liderado_usuario_id,
            gu.id AS gestor_usuario_id, gu.nome AS gestor_nome
       FROM rh.colaborador sc
       JOIN rh.relacao_gestor rg
         ON rg.liderado_colaborador_id = sc.id AND rg.fim_vigencia IS NULL
       JOIN rh.colaborador gc ON gc.id = rg.gestor_colaborador_id
       JOIN sistema.usuario gu ON gu.id = gc.usuario_id
      WHERE sc.usuario_id = ANY($1)
      ORDER BY sc.usuario_id, rg.inicio_vigencia DESC`,
    [usuarioIds]
  );
  return new Map(
    rows.map((linha) => [
      Number(linha.liderado_usuario_id),
      { usuarioId: Number(linha.gestor_usuario_id), nome: linha.gestor_nome },
    ])
  );
}

// ------------------------------------------------------------------ montagem do roteiro

/**
 * Transforma o ROTEIRO declarativo numa lista de demandas com instantes
 * calculados, validando as invariantes do domínio (ordem cronológica, estado
 * final coerente com a última transição, abertura sempre no passado).
 */
function montarDemandas(elenco, rng) {
  const escolherPessoa = (quem) => {
    if (quem.startsWith('equipe:')) return elenco.equipe[Number(quem.slice(7))];
    if (quem.startsWith('outros:')) return elenco.pool[Number(quem.slice(7))];
    const pessoa = elenco[quem];
    if (!pessoa) throw new Error(`Solicitante desconhecido no roteiro: ${quem}`);
    return pessoa;
  };

  const demandas = ROTEIRO.map((item) => {
    const tipo = elenco.tipos.get(item.tipo);
    if (!tipo) {
      throw new Error(
        `Tipo "${item.tipo}" não está ativo em rh.tipo_demanda_versao — não invente catálogo.`
      );
    }
    const solicitante = escolherPessoa(item.quem);
    if (!solicitante) throw new Error(`Sem pessoa para "${item.quem}" (${item.ref})`);

    const diaAbertura = item.prazoEm - tipo.sla_dias;
    if (diaAbertura > -1) {
      throw new Error(
        `${item.ref}: abertura cairia em ${diaAbertura} dia(s) — o roteiro exige abertura no passado (prazoEm ≤ sla−1).`
      );
    }
    const statusInicial = tipo.exige_aprovacao_gestor ? 'aguardando_aprovacao' : 'aberta';

    // Eventos em ordem: abertura + a linha declarada. As horas saem do dia:
    // 11h, 13h, 15h UTC conforme a posição do evento DENTRO daquele dia, o que
    // garante ordenação estrita mesmo com vários eventos no mesmo dia.
    const eventos = [{ acao: 'abertura', dia: diaAbertura }];
    let anterior = diaAbertura;
    for (const passo of item.linha) {
      const [acao] = passo;
      const dia = acao === 'comentario' ? passo[2] : passo[1];
      if (dia < anterior) {
        throw new Error(`${item.ref}: evento "${acao}" em ${dia} vem antes do anterior (${anterior}).`);
      }
      if (dia > -1) {
        throw new Error(`${item.ref}: evento "${acao}" em ${dia} cairia no futuro.`);
      }
      anterior = dia;
      eventos.push(
        acao === 'comentario'
          ? { acao, autor: passo[1], dia, texto: passo[3] }
          : { acao, dia, argumento: passo[2] }
      );
    }

    const usadosNoDia = new Map();
    for (const evento of eventos) {
      const ordem = usadosNoDia.get(evento.dia) ?? 0;
      usadosNoDia.set(evento.dia, ordem + 1);
      if (ordem > 4) throw new Error(`${item.ref}: eventos demais no dia ${evento.dia}.`);
      evento.em = instante(evento.dia, 11 + ordem * 2, inteiro(rng, 0, 59));
    }

    return {
      ...item,
      tipo,
      solicitante,
      statusInicial,
      prazo: iso(dataRelativa(item.prazoEm)),
      criadoEm: eventos[0].em,
      eventos,
    };
  });

  // Numeração legível (DEM-0001…) em ordem de abertura: a demo fica com a fila
  // "mais antiga = número menor", como um sistema em uso de verdade.
  demandas.sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0));
  return demandas;
}

/** Percorre a linha do tempo produzindo transições, comentários e o atendente. */
function resolverFluxo(demanda, elenco, gestorDe) {
  const gestor = gestorDe.get(demanda.solicitante.usuarioId) ?? null;
  const transicoes = [];
  const comentarios = [];
  let status = demanda.statusInicial;
  let atendente = null;

  transicoes.push({
    de: null,
    para: status,
    porUsuarioId: demanda.solicitante.usuarioId,
    motivo: null,
    em: demanda.eventos[0].em,
  });

  for (const evento of demanda.eventos.slice(1)) {
    if (evento.acao === 'comentario') {
      const autor =
        evento.autor === 'solicitante'
          ? demanda.solicitante
          : evento.autor === 'gestor'
            ? gestor
            : evento.autor === 'atendente'
              ? atendente
              : elenco[evento.autor];
      if (!autor) {
        throw new Error(`${demanda.ref}: comentário sem autor resolvível (${evento.autor}).`);
      }
      comentarios.push({ autorUsuarioId: autor.usuarioId, texto: evento.texto, em: evento.em });
      continue;
    }

    const regra = TRANSICAO_POR_PASSO[evento.acao];
    if (!regra) throw new Error(`${demanda.ref}: passo desconhecido "${evento.acao}".`);
    if (regra.de && status !== regra.de) {
      throw new Error(
        `${demanda.ref}: "${evento.acao}" exige status ${regra.de}, mas a demanda está em ${status}.`
      );
    }
    if (evento.acao === 'recusar' && status !== 'aberta' && status !== 'em_atendimento') {
      throw new Error(`${demanda.ref}: recusa só cabe em aberta/em_atendimento (está ${status}).`);
    }

    let ator;
    if (regra.ator === 'gestor') {
      if (!gestor) throw new Error(`${demanda.ref}: solicitante sem gestor vigente para aprovar.`);
      ator = gestor;
    } else if (evento.acao === 'assumir') {
      atendente = elenco[evento.argumento];
      if (!atendente) throw new Error(`${demanda.ref}: atendente "${evento.argumento}" inexistente.`);
      ator = atendente;
    } else {
      ator = atendente ?? elenco.dp; // recusa sem claim: quem triou a fila
    }

    const motivo =
      evento.acao === 'aprovar' || evento.acao === 'assumir' ? null : evento.argumento ?? null;
    transicoes.push({
      de: status,
      para: regra.para,
      porUsuarioId: ator.usuarioId,
      motivo,
      em: evento.em,
    });
    status = regra.para;

    // Espelha o serviço: a resposta da conclusão também entra na thread.
    if (evento.acao === 'concluir') {
      comentarios.push({ autorUsuarioId: ator.usuarioId, texto: evento.argumento, em: evento.em });
    }
  }

  if (status !== demanda.status) {
    throw new Error(
      `${demanda.ref}: a linha do tempo termina em "${status}", mas o roteiro declara "${demanda.status}".`
    );
  }
  return { transicoes, comentarios, atendente, gestor, status };
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  const rng = aleatorio(SEMENTE);
  const elenco = await carregarElenco(cliente);

  // ---------------------------------------------------------------- limpeza do que ESTE módulo cria
  // Outros módulos (férias, benefícios) TAMBÉM abrem demanda para amarrar o
  // pedido à efetivação. Por isso a limpeza é cirúrgica: apaga só as demandas
  // cuja descrição está no ROTEIRO daqui, e a partir DELAS os filhos, os
  // eventos e as notificações. Nada de "DELETE FROM rh.demanda".
  const descricoes = ROTEIRO.map((item) => item.descricao);
  if (new Set(descricoes).size !== descricoes.length) {
    throw new Error('Descrições repetidas no ROTEIRO: elas são a chave da limpeza idempotente.');
  }
  const { rows: antigas } = await cliente.query(
    'SELECT id FROM rh.demanda WHERE descricao = ANY($1)',
    [descricoes]
  );
  const idsAntigos = antigas.map((linha) => Number(linha.id));

  await comTriggersDesligados(
    cliente,
    ['rh.demanda_transicao', 'rh.demanda_comentario', 'rh.evento_colaborador'],
    async () => {
      if (idsAntigos.length > 0) {
        await cliente.query('DELETE FROM rh.demanda_comentario WHERE demanda_id = ANY($1)', [idsAntigos]);
        await cliente.query('DELETE FROM rh.demanda_transicao WHERE demanda_id = ANY($1)', [idsAntigos]);
        await cliente.query(
          `DELETE FROM rh.evento_colaborador
            WHERE origem_tabela = 'rh.demanda' AND origem_id = ANY($1)`,
          [idsAntigos]
        );
        await cliente.query(
          `DELETE FROM sistema.notificacao
            WHERE tipo LIKE 'demanda.%' AND link = ANY($1)`,
          [idsAntigos.map((id) => `/demandas/${id}`)]
        );
        await cliente.query('DELETE FROM rh.demanda WHERE id = ANY($1)', [idsAntigos]);
      }
    }
  );
  // Numeração legível: recomeça em DEM-0001 quando não sobrou demanda de outro
  // módulo; senão, segue do maior número vivo (nunca colide). setval não volta
  // atrás num ROLLBACK — o pior caso é a demo começar num número maior.
  await cliente.query(
    `SELECT setval('rh.demanda_numero_seq',
                   COALESCE((SELECT MAX(numero) FROM rh.demanda), 0) + 1,
                   false)`
  );

  // ---------------------------------------------------------------- demandas
  const demandas = montarDemandas(elenco, rng);
  const gestorDe = await carregarGestores(
    cliente,
    demandas.map((d) => d.solicitante.usuarioId)
  );

  const fluxos = demandas.map((demanda) => resolverFluxo(demanda, elenco, gestorDe));

  const linhasDemanda = demandas.map((demanda, i) => {
    const fluxo = fluxos[i];
    const ultima = fluxo.transicoes[fluxo.transicoes.length - 1];
    return [
      demanda.tipo.id,
      demanda.solicitante.usuarioId,
      demanda.solicitante.colaboradorId,
      demanda.descricao,
      demanda.status,
      demanda.prazo,
      fluxo.atendente ? fluxo.atendente.usuarioId : null,
      demanda.criadoEm,
      ultima.em,
    ];
  });

  const criadas = await inserirLote(
    cliente,
    'rh.demanda',
    [
      'tipo_demanda_versao_id',
      'solicitante_usuario_id',
      'solicitante_colaborador_id',
      'descricao',
      'status',
      'prazo',
      'atendente_usuario_id',
      'criado_em',
      'atualizado_em',
    ],
    linhasDemanda,
    'id, numero'
  );
  criadas.forEach((linha, i) => {
    demandas[i].id = Number(linha.id);
    demandas[i].numero = Number(linha.numero);
  });

  // ---------------------------------------------------------------- transições e comentários
  const linhasTransicao = [];
  const linhasComentario = [];
  const linhasEvento = [];

  demandas.forEach((demanda, i) => {
    const fluxo = fluxos[i];
    for (const transicao of fluxo.transicoes) {
      linhasTransicao.push([
        demanda.id,
        transicao.de,
        transicao.para,
        transicao.porUsuarioId,
        transicao.motivo,
        transicao.em,
      ]);
    }
    for (const comentario of fluxo.comentarios) {
      linhasComentario.push([
        demanda.id,
        comentario.autorUsuarioId,
        comentario.texto,
        comentario.em,
      ]);
    }
    if (demanda.status === 'concluida') {
      const conclusao = fluxo.transicoes[fluxo.transicoes.length - 1];
      linhasEvento.push([
        demanda.solicitante.colaboradorId,
        'demanda_concluida',
        conclusao.em,
        'rh.demanda',
        demanda.id,
        `Demanda ${numeroDemanda(demanda.numero)} (${demanda.tipo.nome}) concluída pelo DP`,
        JSON.stringify({ numero: demanda.numero, tipo: demanda.tipo.nome }),
        conclusao.porUsuarioId,
      ]);
    }
  });

  await inserirLote(
    cliente,
    'rh.demanda_transicao',
    ['demanda_id', 'de_status', 'para_status', 'por_usuario_id', 'motivo', 'em'],
    linhasTransicao
  );
  await inserirLote(
    cliente,
    'rh.demanda_comentario',
    ['demanda_id', 'autor_usuario_id', 'texto', 'em'],
    linhasComentario
  );
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
    linhasEvento
  );

  // ---------------------------------------------------------------- notificações
  const porRef = new Map(demandas.map((d, i) => [d.ref, { demanda: d, fluxo: fluxos[i] }]));
  const linhasNotificacao = [];

  // Mesma consulta de atendentesDaFila() em src/dominios/demandas/repositorio.ts:
  // a demo avisa exatamente quem o app avisaria.
  const { rows: linhasAtendentes } = await cliente.query(
    `SELECT u.id
       FROM sistema.usuario u
      WHERE u.ativo
        AND sistema.tem_permissao(u.id, 'demanda.atender')
      ORDER BY u.id`
  );
  const atendentesFila = linhasAtendentes.map((linha) => Number(linha.id));
  if (atendentesFila.length === 0) {
    throw new Error('Ninguém com demanda.atender — 01-base precisa ter rodado.');
  }

  for (const aviso of AVISOS) {
    const entrada = porRef.get(aviso.ref);
    if (!entrada) throw new Error(`Aviso aponta demanda inexistente no roteiro: ${aviso.ref}`);
    const { demanda, fluxo } = entrada;
    const modelo = MODELO_AVISO[aviso.evento];
    if (!modelo) throw new Error(`Modelo de aviso desconhecido: ${aviso.evento}`);

    const evento = demanda.eventos.find((e) => e.acao === aviso.em);
    if (!evento) {
      throw new Error(`Aviso ${aviso.evento} de ${aviso.ref} referencia evento "${aviso.em}" ausente.`);
    }

    const corpo = modelo.corpo({
      numero: numeroDemanda(demanda.numero),
      solicitanteNome: demanda.solicitante.nome,
      tipoNome: demanda.tipo.nome,
    });
    garantirTextoNeutro('titulo', modelo.titulo);
    garantirTextoNeutro('corpo', corpo);

    // A fila do DP é o único aviso que vai para MAIS DE UM destinatário.
    // Quem executou a ação não recebe — igual ao filtro do serviço.
    let destinatarios;
    if (modelo.para === 'fila_dp') {
      const transicao = fluxo.transicoes.find((t) => t.em === evento.em);
      const atorUsuarioId = transicao
        ? transicao.porUsuarioId
        : demanda.solicitante.usuarioId;
      destinatarios = atendentesFila.filter((id) => id !== atorUsuarioId);
    } else {
      const destinatario =
        modelo.para === 'gestor' ? fluxo.gestor : demanda.solicitante;
      if (!destinatario) {
        throw new Error(`Aviso ${aviso.evento} de ${aviso.ref} sem destinatário resolvível.`);
      }
      destinatarios = [destinatario.usuarioId];
    }
    if (destinatarios.length === 0) {
      throw new Error(`Aviso ${aviso.evento} de ${aviso.ref} sem destinatário resolvível.`);
    }

    for (const usuarioId of destinatarios) {
      linhasNotificacao.push([
        usuarioId,
        aviso.evento,
        modelo.titulo,
        corpo,
        `/demandas/${demanda.id}`,
        aviso.lida,
        evento.em,
      ]);
    }
  }

  await inserirLote(
    cliente,
    'sistema.notificacao',
    ['usuario_id', 'tipo', 'titulo', 'corpo', 'link', 'lida', 'criada_em'],
    linhasNotificacao
  );

  // ---------------------------------------------------------------- resumo
  const porStatus = {};
  for (const demanda of demandas) {
    porStatus[demanda.status] = (porStatus[demanda.status] ?? 0) + 1;
  }
  const hojeIso = iso(dataRelativa(0));
  const amanhaIso = iso(dataRelativa(1));
  // "Na fila" = o que o indicador do DP conta (aberta + em_atendimento); a
  // aprovação parada aparece à parte, porque é cobrança do gestor, não do DP.
  const naFila = (d) => d.status === 'aberta' || d.status === 'em_atendimento';
  const atrasadas = demandas.filter((d) => naFila(d) && d.prazo < hojeIso).length;
  const aprovacoesParadas = demandas.filter(
    (d) => d.status === 'aguardando_aprovacao' && d.prazo < hojeIso
  ).length;
  const ativa = (d) => naFila(d) || d.status === 'aguardando_aprovacao';
  const hoje = demandas.filter((d) => ativa(d) && d.prazo === hojeIso).length;
  const amanha = demandas.filter((d) => ativa(d) && d.prazo === amanhaIso).length;
  const naoLidas = linhasNotificacao.filter((linha) => linha[5] === false).length;

  log(`03-demandas: ${demandas.length} demandas (${Object.entries(porStatus)
    .map(([status, total]) => `${status} ${total}`)
    .join(', ')}).`);
  log(
    `  prazos: ${atrasadas} atrasada(s) na fila do DP + ${aprovacoesParadas} aprovação parada, ` +
      `${hoje} vencendo hoje, ${amanha} vencendo amanhã ` +
      `(${numeroDemanda(demandas[0].numero)} a ${numeroDemanda(demandas[demandas.length - 1].numero)}).`
  );
  log(
    `  ${linhasTransicao.length} transições, ${linhasComentario.length} comentários ` +
      `(${linhasComentario.length - linhasEvento.length} de conversa + ${linhasEvento.length} respostas de conclusão), ` +
      `${linhasEvento.length} eventos na linha do tempo.`
  );
  log(
    `  ${linhasNotificacao.length} notificações (${naoLidas} não lidas) — só referência + link, sem dado sensível.`
  );

  return {
    demandas: demandas.length,
    demandaTransicoes: linhasTransicao.length,
    demandaComentarios: linhasComentario.length,
    notificacoesDemanda: linhasNotificacao.length,
  };
}

module.exports = { semear, ROTEIRO, AVISOS };

if (require.main === module) {
  executarSozinho('03-demandas', semear);
}
