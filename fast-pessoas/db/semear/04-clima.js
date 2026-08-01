// db/semear/04-clima.js — série histórica do check-in de clima (rh_clima).
//
// O que este módulo cria (e só isto):
//   • rh_clima.checkin_resposta — 8 semanas de check-in diário (dias úteis, sem
//     feriado nacional) do quadro atual, respondendo as DUAS perguntas ativas
//     do catálogo, com ~25% das respostas comentadas.
//
// NÃO cria/edita rh_clima.pergunta_versao: o catálogo é seed estrutural da
// migration 0004 (e a versão publicada é imutável por trigger). O módulo lê as
// perguntas com status 'ativa' e responde a todas elas.
//
// História plantada para a apresentação (ver docs/03-modulos/06-clima.md):
//   • média geral da rede ~3,9 na janela;
//   • Filial Norte em QUEDA nas últimas 3 semanas (~4,0 → ~2,9) — os comentários
//     do período explicam o porquê (saídas sem reposição, caminhão parado,
//     escala de sábado), dando assunto ao painel e ao alerta de queda;
//   • Filial Sul em ALTA nas últimas 4 semanas;
//   • segunda-feira pior que sexta (padrão realista de humor na semana).
//
// Confidencialidade: a resposta é VINCULADA ao colaborador (decisão de
// 2026-07-27). Só a diretoria lê conteúdo + autor (/clima/individual, com
// trilha em audit.leitura_sensivel); gestor e RH veem apenas o agregado.
// Por isso os comentários semeados são críticos, mas civilizados e sem ofensa
// a pessoa nomeada — é o que a diretoria vai ler na frente da plateia.
//
// Uso isolado: node --env-file=.env db/semear/04-clima.js
 

const {
  aleatorio,
  comTriggersDesligados,
  escolher,
  executarSozinho,
  hoje,
  inserirLote,
  inteiro,
  iso,
  log,
} = require('./comum');

const SEMENTE = 20260804; // fixa: mesma execução ⇒ mesmos dados (só as datas andam)
const DOMINIO_DEMO = 'fastdemo.local';
const SEMANAS = 8;
const DIAS_JANELA = SEMANAS * 7; // 8 semanas de calendário; dentro delas, só dias úteis

// Personas de demonstração (01-base). Elas NÃO respondem o dia de hoje: o
// apresentador entra com a conta e responde o check-in ao vivo na tela.
const PERSONAS_DEMO = new Set([
  'diretora.pessoas@fastdemo.local',
  'dp@fastdemo.local',
  'rh@fastdemo.local',
  'gestor@fastdemo.local',
  'funcionario@fastdemo.local',
]);
const PERSONA_FUNCIONARIO = 'funcionario@fastdemo.local';

// ------------------------------------------------------------------ calendário

/** Domingo de Páscoa (algoritmo de Meeus/Butcher) — base dos feriados móveis. */
function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data, dias) {
  const nova = new Date(data.getTime());
  nova.setUTCDate(nova.getUTCDate() + dias);
  return nova;
}

/** Feriados nacionais (fixos + móveis) dos anos informados, como 'YYYY-MM-DD'. */
function feriadosNacionais(anos) {
  const conjunto = new Set();
  for (const ano of anos) {
    for (const fixo of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']) {
      conjunto.add(`${ano}-${fixo}`);
    }
    const domingoPascoa = pascoa(ano);
    conjunto.add(iso(somarDias(domingoPascoa, -48))); // carnaval (segunda)
    conjunto.add(iso(somarDias(domingoPascoa, -47))); // carnaval (terça)
    conjunto.add(iso(somarDias(domingoPascoa, -2))); // sexta-feira santa
    conjunto.add(iso(somarDias(domingoPascoa, 60))); // corpus christi
  }
  return conjunto;
}

/**
 * Dias úteis (seg–sex, sem feriado nacional) das últimas `DIAS_JANELA` datas,
 * do mais antigo ao mais recente — hoje inclusive, se for útil.
 */
function janelaDeDiasUteis() {
  const fim = hoje();
  const anos = new Set([fim.getUTCFullYear(), somarDias(fim, -DIAS_JANELA).getUTCFullYear()]);
  const feriados = feriadosNacionais([...anos]);
  const dias = [];
  for (let atras = DIAS_JANELA - 1; atras >= 0; atras -= 1) {
    const data = somarDias(fim, -atras);
    const diaSemana = data.getUTCDay(); // 0 domingo … 6 sábado
    const texto = iso(data);
    if (diaSemana === 0 || diaSemana === 6 || feriados.has(texto)) continue;
    dias.push({ iso: texto, diaSemana, atras });
  }
  return dias;
}

// ------------------------------------------------------------------ nota 1–5 a partir de uma média-alvo

// Peso gaussiano discreto sobre a escala de 5 emojis: dá distribuição com cauda
// (aparecem 1 e 2 mesmo com média 4), diferente de sortear inteiro uniforme.
function distribuicao(centro, dispersao) {
  const pesos = [1, 2, 3, 4, 5].map((nota) =>
    Math.exp(-((nota - centro) ** 2) / (2 * dispersao ** 2))
  );
  const soma = pesos.reduce((acc, peso) => acc + peso, 0);
  return pesos.map((peso) => peso / soma);
}

function mediaDaDistribuicao(centro, dispersao) {
  return distribuicao(centro, dispersao).reduce(
    (acc, probabilidade, indice) => acc + probabilidade * (indice + 1),
    0
  );
}

const cacheCentro = new Map();

/**
 * Centro que faz a distribuição discreta ter EXATAMENTE a média pedida — a
 * média é monótona no centro, então bisseção resolve. Sem isso, a truncagem em
 * 1 e 5 puxaria a média para o meio e o alvo de cada unidade não se realizaria.
 */
function centroParaMedia(alvo, dispersao) {
  const chave = `${alvo.toFixed(2)}|${dispersao.toFixed(2)}`;
  const memorizado = cacheCentro.get(chave);
  if (memorizado !== undefined) return memorizado;
  let baixo = -4;
  let alto = 10;
  for (let i = 0; i < 44; i += 1) {
    const meio = (baixo + alto) / 2;
    if (mediaDaDistribuicao(meio, dispersao) < alvo) baixo = meio;
    else alto = meio;
  }
  const centro = (baixo + alto) / 2;
  cacheCentro.set(chave, centro);
  return centro;
}

function sortearNota(rng, alvo, dispersao) {
  const limitado = Math.min(4.9, Math.max(1.15, alvo));
  const probabilidades = distribuicao(centroParaMedia(limitado, dispersao), dispersao);
  let acumulado = 0;
  const sorteio = rng();
  for (let indice = 0; indice < 5; indice += 1) {
    acumulado += probabilidades[indice];
    if (sorteio <= acumulado) return indice + 1;
  }
  return 5;
}

/** Ruído ~normal (soma de 3 uniformes), em [-1, 1] com concentração no centro. */
function ruido(rng) {
  return (rng() + rng() + rng() - 1.5) / 1.5;
}

// ------------------------------------------------------------------ curvas de humor

// Cada unidade respira no seu ritmo: sem defasagem, todas as lojas subiriam e
// desceriam no mesmo dia e o gráfico ficaria com cara de dado gerado.
const FASE_DA_ONDA = {
  'Matriz Centro': 0,
  'Filial Norte': 1.7,
  'Filial Sul': 3.1,
  'Filial Leste': 4.6,
  'Filial Oeste': 2.3,
};

// Média-alvo da unidade no dia (`atras` = dias de calendário até hoje).
// É AQUI que mora a história da demonstração.
function alvoDaUnidade(unidade, atras) {
  const onda =
    Math.sin((DIAS_JANELA - atras) / 5.5 + (FASE_DA_ONDA[unidade] ?? 0)) * 0.09;
  switch (unidade) {
    case 'Filial Norte': {
      // estável ~4,0 e queda firme nas últimas 3 semanas (21 dias corridos)
      if (atras > 20) return 3.97 + onda;
      const avanco = (21 - atras) / 21; // 0 (há 3 semanas) … 1 (hoje)
      return 3.97 - 1.42 * avanco + onda * 0.5;
    }
    case 'Filial Sul': {
      // em recuperação nas últimas 4 semanas (nova gerência atuando)
      if (atras > 27) return 3.67 + onda;
      return 3.67 + 0.62 * ((28 - atras) / 28) + onda;
    }
    case 'Matriz Centro':
      return 3.91 + onda;
    case 'Filial Leste':
      return 3.83 + onda * 1.2;
    case 'Filial Oeste':
      // vale no meio da janela e recuperação (troca de sistema de pedidos)
      return 3.93 - 0.22 * Math.exp(-((atras - 26) ** 2) / 60) + onda;
    default:
      return 3.85 + onda;
  }
}

// Humor da semana: segunda pesa, sexta alivia.
const EFEITO_DIA_SEMANA = { 1: -0.2, 2: -0.07, 3: 0.0, 4: 0.06, 5: 0.18 };
// Participação: cai um pouco na segunda e na sexta.
const ADESAO_DIA_SEMANA = { 1: 0.94, 2: 1.03, 3: 1.04, 4: 1.0, 5: 0.92 };

// ------------------------------------------------------------------ comentários

const COMENTARIOS = {
  humor_negativo: [
    'Semana pesada, começamos o dia com dois faltando na equipe.',
    'Estou cansado, foram três dias seguidos de inventário até tarde.',
    'Clima meio tenso no salão hoje, muita cobrança e pouca orientação.',
    'Difícil manter o ritmo com o ventilador do depósito quebrado.',
    'Fiquei desmotivada: pedi ajuda e não tive resposta.',
    'Muita coisa acumulada e pouco tempo para respirar.',
    'Recebi uma cobrança na frente do cliente e isso me abalou.',
    'Sem previsão de reposição da vaga, seguimos fazendo o trabalho de dois.',
    'O horário estendido desta semana está me desgastando.',
    'Hoje foi um dia difícil, prefiro não detalhar.',
    'Falta alinhamento entre a loja e a expedição.',
    'Estou preocupado com a meta e sem apoio para bater.',
    'A escala de sábado mudou de novo em cima da hora.',
    'Senti falta de retorno sobre o que combinamos na última reunião.',
    'Muito barulho e correria, terminei o dia exausta.',
    'Comecei bem, mas uma discussão com um cliente derrubou o dia.',
    'Sinto que meu trabalho passa despercebido.',
    'Está difícil conciliar a rotina de casa com a escala atual.',
  ],
  humor_neutro: [
    'Dia normal, nada fora do comum.',
    'Semana corrida, mas dentro do esperado.',
    'Nem bom nem ruim, seguimos.',
    'Movimento fraco hoje, deu para organizar o estoque.',
    'Tudo tranquilo por aqui.',
    'Produtivo pela manhã e parado à tarde.',
    'Sem novidades, rotina de sempre.',
    'Dia comum, só o cansaço normal do meio da semana.',
    'Nada a relatar hoje.',
    'Deu para tocar o essencial.',
  ],
  humor_positivo: [
    'Equipe unida, o dia rendeu bastante.',
    'Fechamos com o salão organizado e todos os pedidos separados.',
    'Recebi um elogio de cliente e isso fez o meu dia.',
    'O treinamento de drywall de ontem ajudou demais no atendimento.',
    'Bom ambiente: o pessoal se ajuda quando aperta.',
    'Consegui adiantar os orçamentos e sair no horário.',
    'Gostei do retorno que recebi na conversa de hoje.',
    'Chegou o lote de perfis e destravou as entregas.',
    'Ambiente leve mesmo com a loja cheia.',
    'A confraternização da unidade animou a equipe.',
    'Estou animada com o novo mix de argamassas.',
    'Deu tudo certo na entrega grande de hoje.',
    'A escala nova ficou melhor para conciliar com a faculdade.',
    'O pessoal novo está pegando o jeito rápido, dá gosto de ver.',
    'Reunião curta e objetiva pela manhã, começamos bem.',
  ],
  entregas_negativo: [
    'Perdi tempo refazendo orçamento por falta de informação no cadastro.',
    'O sistema lento travou o fechamento de dois pedidos.',
    'Não entreguei o que planejei: faltou material no estoque.',
    'Prazo apertado demais para o volume que chegou.',
    'Muita interrupção, difícil concluir qualquer coisa.',
    'A ruptura de placas ST derrubou meus pedidos da semana.',
    'Retrabalho por erro de conferência na separação.',
    'Fico frustrado quando prometo prazo e a entrega atrasa.',
    'Faltou clareza sobre a prioridade do dia.',
    'Entreguei menos do que gostaria, o dia foi de apagar incêndio.',
    'Passei o dia resolvendo pendência antiga em vez de vender.',
  ],
  entregas_neutro: [
    'Entreguei o combinado, sem sobra de tempo.',
    'Dentro do esperado para a semana.',
    'Deu para cumprir o essencial.',
    'Nada travado, mas nada adiantado também.',
    'Volume estável, sem surpresa.',
  ],
  entregas_positivo: [
    'Bati a meta do dia com folga.',
    'Consegui fechar as propostas que estavam em aberto.',
    'Separação e conferência saíram sem erro hoje.',
    'O cliente da obra da avenida fechou o pedido completo.',
    'Organizei o mostruário e o atendimento ficou mais rápido.',
    'Terminei o inventário do meu setor antes do prazo.',
    'Consegui adiantar as entregas de amanhã.',
    'Recuperei dois clientes que estavam parados desde o mês passado.',
    'Fechei o dia com a carteira em dia.',
  ],
  // A história da Filial Norte — o que a diretoria vai ler quando abrir a queda.
  norte_humor: [
    'Desde que dois colegas saíram, estamos cobrindo tudo sem reposição.',
    'O caminhão parado há duas semanas jogou toda a pressão para cima da equipe.',
    'A escala de sábado virou regra e ninguém combinou isso com a gente.',
    'A loja está com o dobro de pedidos e a mesma quantidade de gente.',
    'Já sinalizamos a sobrecarga e não tivemos retorno.',
    'O clima aqui piorou bastante neste mês, o pessoal está no limite.',
    'Tem gente pensando em sair e isso desanima quem fica.',
    'Precisamos de reposição urgente na equipe da unidade.',
    'Cansaço acumulado: é a terceira semana sem folga direito.',
    'Falta de gente na expedição estoura o prazo e sobra cobrança para nós.',
    'A unidade está funcionando no improviso desde o mês passado.',
  ],
  norte_entregas: [
    'Sem o caminhão, as entregas da região estão todas atrasadas.',
    'Não tem como cumprir prazo com a equipe reduzida.',
    'Estou entregando metade do que entregava, e não é por falta de vontade.',
    'Passo o dia justificando atraso para o cliente em vez de vender.',
    'As entregas emperraram e o cliente cobra de quem está na frente.',
    'Cada pedido vira negociação de prazo, isso desgasta muito.',
  ],
};

const COMPLEMENTOS_NEGATIVOS = [
  ' Nada grave, é só um desabafo.',
  ' Espero que a semana que vem seja melhor.',
  ' Já conversei com meu gestor sobre isso.',
  ' Se puderem olhar isso, ajudaria bastante.',
  ' Fica o registro.',
];
const COMPLEMENTOS_POSITIVOS = [
  ' Valeu pelo apoio.',
  ' Segue o jogo.',
  ' Que continue assim.',
  ' Obrigada pelo espaço aqui.',
];

// Quem comenta: quem está muito mal e quem está muito bem falam mais.
// Calibrado para ~25% das respostas com texto (medido no banco após semear).
const CHANCE_COMENTARIO = { 1: 0.67, 2: 0.54, 3: 0.24, 4: 0.26, 5: 0.37 };
const FATOR_COMENTARIO_ENTREGAS = 0.55; // a segunda pergunta rende menos texto

function sortearComentario(rng, { nota, ordemPergunta, unidade, atras }) {
  const eNorteEmQueda = unidade === 'Filial Norte' && atras <= 20;
  let banco;
  if (nota <= 2) {
    if (eNorteEmQueda && rng() < 0.62) {
      banco = ordemPergunta === 1 ? COMENTARIOS.norte_humor : COMENTARIOS.norte_entregas;
    } else {
      banco = ordemPergunta === 1 ? COMENTARIOS.humor_negativo : COMENTARIOS.entregas_negativo;
    }
  } else if (nota === 3) {
    banco = ordemPergunta === 1 ? COMENTARIOS.humor_neutro : COMENTARIOS.entregas_neutro;
  } else {
    banco = ordemPergunta === 1 ? COMENTARIOS.humor_positivo : COMENTARIOS.entregas_positivo;
  }
  let texto = escolher(rng, banco);
  if (rng() < 0.3) {
    texto += escolher(rng, nota <= 2 ? COMPLEMENTOS_NEGATIVOS : COMPLEMENTOS_POSITIVOS);
  }
  return texto;
}

// ------------------------------------------------------------------ hora do registro

/** Instante plausível do check-in no dia (America/São_Paulo = UTC-3, sem DST). */
function instanteDoCheckin(rng, dia, deslocamentoSegundos) {
  const sorteio = rng();
  let hora;
  if (sorteio < 0.55) hora = inteiro(rng, 8, 9);
  else if (sorteio < 0.8) hora = inteiro(rng, 10, 12);
  else if (sorteio < 0.93) hora = inteiro(rng, 13, 15);
  else hora = inteiro(rng, 16, 18);
  const minuto = inteiro(rng, 0, 59);
  const segundo = inteiro(rng, 0, 59);
  const doisDigitos = (valor) => String(valor).padStart(2, '0');
  const base = new Date(
    `${dia}T${doisDigitos(hora)}:${doisDigitos(minuto)}:${doisDigitos(segundo)}-03:00`
  );
  return new Date(base.getTime() + deslocamentoSegundos * 1000).toISOString();
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  const rng = aleatorio(SEMENTE);

  // ---------------------------------------------------------- catálogo (só leitura)
  const { rows: perguntas } = await cliente.query(
    `SELECT id, texto, ordem FROM rh_clima.pergunta_versao
      WHERE status = 'ativa' ORDER BY ordem, id`
  );
  if (perguntas.length === 0) {
    throw new Error('rh_clima.pergunta_versao sem pergunta ativa — rode as migrations antes.');
  }

  // ---------------------------------------------------------- quadro atual
  // Quem responde: todo o quadro que não está desligado (o check-in é
  // voluntário e aberto a CLT, estágio, aprendiz e PJ — a restrição de escopo
  // segue em aberto no docs/03-modulos/06-clima.md).
  const { rows: pessoas } = await cliente.query(
    `SELECT c.id, c.matricula, c.nome_completo, c.data_admissao::text AS admissao,
            u.email, ev.unidade
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       JOIN rh.lotacao l ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id
        AND ev.status = 'ativa' AND ev.fim_vigencia IS NULL
      WHERE c.status <> 'desligado'
        AND u.email LIKE $1
      ORDER BY c.matricula`,
    [`%@${DOMINIO_DEMO}`]
  );
  if (pessoas.length === 0) {
    throw new Error('nenhum colaborador de demonstração — rode db/semear/01-base.js antes.');
  }

  const dias = janelaDeDiasUteis();
  const primeiroDia = dias[0].iso;
  const ultimoDia = dias[dias.length - 1].iso;

  // ---------------------------------------------------------- ausências (coerência entre módulos)
  // Quem está de férias ou afastado no dia não faz check-in. Se os módulos de
  // férias/afastamento ainda não rodaram, as consultas voltam vazias e o
  // resultado é o mesmo — dependência opcional, nunca obrigatória.
  const ausente = new Set();
  const marcarIntervalo = (colaboradorId, inicioIso, fimIso) => {
    const inicio = new Date(`${inicioIso}T00:00:00Z`);
    const fim = new Date(`${fimIso}T00:00:00Z`);
    for (let cursor = inicio; cursor <= fim; cursor = somarDias(cursor, 1)) {
      ausente.add(`${colaboradorId}|${iso(cursor)}`);
    }
  };
  const { rows: afastamentos } = await cliente.query(
    `SELECT colaborador_id, inicio::text AS inicio, COALESCE(fim, $2::date)::text AS fim
       FROM rh.afastamento
      WHERE inicio <= $2::date AND COALESCE(fim, $2::date) >= $1::date`,
    [primeiroDia, ultimoDia]
  );
  for (const linha of afastamentos) {
    marcarIntervalo(Number(linha.colaborador_id), linha.inicio, linha.fim);
  }
  const { rows: ferias } = await cliente.query(
    `SELECT colaborador_id, inicio::text AS inicio,
            (inicio + (dias - 1))::text AS fim
       FROM rh.programacao_ferias
      WHERE status IN ('aprovada','em_gozo','concluida')
        AND inicio <= $2::date AND inicio + (dias - 1) >= $1::date`,
    [primeiroDia, ultimoDia]
  );
  for (const linha of ferias) {
    marcarIntervalo(Number(linha.colaborador_id), linha.inicio, linha.fim);
  }

  // ---------------------------------------------------------- perfil de cada respondente
  const perfis = pessoas.map((pessoa) => {
    const ePersona = PERSONAS_DEMO.has(pessoa.email);
    return {
      id: Number(pessoa.id),
      matricula: pessoa.matricula,
      email: pessoa.email,
      unidade: pessoa.unidade,
      admissao: pessoa.admissao,
      ePersona,
      // viés pessoal: tem gente que marca sempre mais alto, e vice-versa
      vies: ruido(rng) * 0.62,
      // a persona do funcionário responde quase todo dia — é a conta que abre a
      // tela de check-in na apresentação e precisa ter série própria cheia
      fiel: pessoa.email === PERSONA_FUNCIONARIO,
      // propensão a responder no dia (a média das propensões dá a adesão da rede)
      propensao: 0.4 + rng() * 0.55,
      // parte do quadro simplesmente não engaja com a segunda pergunta
      responde2a: 0.86 + rng() * 0.12,
    };
  });

  // Viés pessoal com média zero DENTRO da unidade: assim a média realizada de
  // cada loja é a curva desenhada em alvoDaUnidade, e não o acaso de quem caiu
  // em qual unidade — com 10 pessoas por filial, o sorteio bruto deslocaria a
  // média da unidade em até 0,2 ponto e embaralharia a história da demo.
  const viesPorUnidade = new Map();
  for (const perfil of perfis) {
    const acumulado = viesPorUnidade.get(perfil.unidade) ?? { soma: 0, quantidade: 0 };
    acumulado.soma += perfil.vies;
    acumulado.quantidade += 1;
    viesPorUnidade.set(perfil.unidade, acumulado);
  }
  for (const perfil of perfis) {
    const { soma, quantidade } = viesPorUnidade.get(perfil.unidade);
    perfil.vies -= soma / quantidade;
  }

  // ---------------------------------------------------------- geração
  const linhas = [];
  const contagemPorPessoa = new Map();
  let elegiveis = 0;
  let diasRespondidos = 0;

  for (const dia of dias) {
    const efeitoSemana = EFEITO_DIA_SEMANA[dia.diaSemana] ?? 0;
    const fatorSemana = ADESAO_DIA_SEMANA[dia.diaSemana] ?? 1;
    // leve fadiga de check-in ao longo da janela (mais gente respondia no início)
    const fatorFadiga = 1.04 - 0.08 * ((DIAS_JANELA - dia.atras) / DIAS_JANELA);

    for (const perfil of perfis) {
      // ninguém responde antes de ser admitido (nem no próprio dia da admissão)
      if (perfil.admissao >= dia.iso) continue;
      if (ausente.has(`${perfil.id}|${dia.iso}`)) continue;
      // as personas ficam com o dia de HOJE em branco: o apresentador responde ao vivo
      if (perfil.ePersona && dia.atras === 0) continue;
      elegiveis += 1;

      let propensao = perfil.propensao * fatorSemana * fatorFadiga;
      // Norte: junto com o humor, a participação também cede nas últimas 2 semanas
      if (perfil.unidade === 'Filial Norte' && dia.atras <= 13) propensao *= 0.85;
      if (perfil.fiel) propensao = 0.99;
      if (rng() >= Math.min(0.99, propensao)) continue;
      diasRespondidos += 1;
      contagemPorPessoa.set(perfil.id, (contagemPorPessoa.get(perfil.id) ?? 0) + 1);

      const alvoBase =
        alvoDaUnidade(perfil.unidade, dia.atras) + efeitoSemana + perfil.vies + ruido(rng) * 0.12;
      const dispersao =
        perfil.unidade === 'Filial Norte' && dia.atras <= 20 ? 1.15 : 1.0;
      const respondeSegunda = rng() < perfil.responde2a;
      const deslocamento = inteiro(rng, 18, 95); // segundos entre uma resposta e outra

      for (const pergunta of perguntas) {
        const ordem = Number(pergunta.ordem);
        if (ordem !== 1 && !respondeSegunda) continue;
        // a percepção sobre entregas é correlata ao humor, um tico mais alta
        const alvo = ordem === 1 ? alvoBase : alvoBase + 0.1 + ruido(rng) * 0.3;
        const nota = sortearNota(rng, alvo, dispersao);
        const chance =
          (CHANCE_COMENTARIO[nota] ?? 0.25) * (ordem === 1 ? 1 : FATOR_COMENTARIO_ENTREGAS);
        const comentario =
          rng() < chance
            ? sortearComentario(rng, {
                nota,
                ordemPergunta: ordem,
                unidade: perfil.unidade,
                atras: dia.atras,
              })
            : null;
        linhas.push([
          perfil.id,
          Number(pergunta.id),
          dia.iso,
          nota,
          comentario,
          instanteDoCheckin(rng, dia.iso, ordem === 1 ? 0 : deslocamento),
        ]);
      }
    }
  }

  // ---------------------------------------------------------- limpeza idempotente
  // checkin_resposta é append-only (trigger audit.bloquear_mutacao): desligamos
  // o trigger só para o DELETE e religamos na MESMA transação. O escopo é
  // exclusivamente o que este módulo cria — respostas de contas @fastdemo.local.
  const apagadas = await comTriggersDesligados(
    cliente,
    ['rh_clima.checkin_resposta'],
    async () => {
      const { rowCount } = await cliente.query(
        `DELETE FROM rh_clima.checkin_resposta r
          WHERE r.colaborador_id IN (
                SELECT c.id FROM rh.colaborador c
                  JOIN sistema.usuario u ON u.id = c.usuario_id
                 WHERE u.email LIKE $1)`,
        [`%@${DOMINIO_DEMO}`]
      );
      return rowCount;
    }
  );
  log(`04-clima: ${apagadas} respostas anteriores da demo removidas.`);

  await inserirLote(
    cliente,
    'rh_clima.checkin_resposta',
    ['colaborador_id', 'pergunta_versao_id', 'data_referencia', 'nota', 'comentario', 'registrado_em'],
    linhas
  );
  log(
    `04-clima: ${linhas.length} respostas em ${dias.length} dias úteis ` +
      `(${primeiroDia} a ${ultimoDia}) de ${contagemPorPessoa.size} colaboradores.`
  );

  // ---------------------------------------------------------- invariantes
  const conferir = async (rotulo, sql, esperado) => {
    const { rows } = await cliente.query(sql);
    const obtido = Number(rows[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };
  await conferir(
    'respostas anteriores à admissão',
    `SELECT count(*)::int AS total FROM rh_clima.checkin_resposta r
       JOIN rh.colaborador c ON c.id = r.colaborador_id
      WHERE r.data_referencia <= c.data_admissao`,
    0
  );
  await conferir(
    'respostas em fim de semana',
    `SELECT count(*)::int AS total FROM rh_clima.checkin_resposta
      WHERE extract(dow FROM data_referencia) IN (0, 6)`,
    0
  );
  await conferir(
    'respostas de colaborador desligado',
    `SELECT count(*)::int AS total FROM rh_clima.checkin_resposta r
       JOIN rh.colaborador c ON c.id = r.colaborador_id
      WHERE c.status = 'desligado'`,
    0
  );
  await conferir(
    'respostas fora da janela semeada',
    `SELECT count(*)::int AS total FROM rh_clima.checkin_resposta
      WHERE data_referencia < '${primeiroDia}' OR data_referencia > '${ultimoDia}'`,
    0
  );
  await conferir(
    'comentário em branco',
    `SELECT count(*)::int AS total FROM rh_clima.checkin_resposta
      WHERE comentario IS NOT NULL AND btrim(comentario) = ''`,
    0
  );
  await conferir(
    'persona com check-in de hoje (o apresentador responde ao vivo)',
    `SELECT count(*)::int AS total FROM rh_clima.checkin_resposta r
       JOIN rh.colaborador c ON c.id = r.colaborador_id
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE r.data_referencia = CURRENT_DATE
        AND u.email IN (${[...PERSONAS_DEMO].map((email) => `'${email}'`).join(', ')})`,
    0
  );

  // ---------------------------------------------------------- resumo da demonstração
  const { rows: resumo } = await cliente.query(
    `SELECT round(avg(nota)::numeric, 2) AS media,
            count(*)::int AS respostas,
            count(DISTINCT colaborador_id)::int AS respondentes,
            round(100.0 * count(comentario) / count(*), 1) AS pct_comentario
       FROM rh_clima.checkin_resposta`
  );
  const { rows: porUnidade } = await cliente.query(
    `SELECT ev.unidade,
            round(avg(nota)::numeric, 2) AS media_janela,
            round(avg(nota) FILTER (WHERE r.data_referencia < CURRENT_DATE - 20)::numeric, 2) AS antes,
            round(avg(nota) FILTER (WHERE r.data_referencia >= CURRENT_DATE - 20)::numeric, 2) AS ultimas_3_semanas
       FROM rh_clima.checkin_resposta r
       JOIN rh.lotacao l ON l.colaborador_id = r.colaborador_id AND l.fim_vigencia IS NULL
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id
        AND ev.status = 'ativa' AND ev.fim_vigencia IS NULL
      GROUP BY ev.unidade ORDER BY ev.unidade`
  );

  const adesao = elegiveis > 0 ? (100 * diasRespondidos) / elegiveis : 0;
  log(
    `04-clima: média geral ${resumo[0].media} · ${resumo[0].respostas} respostas · ` +
      `${resumo[0].respondentes} respondentes · ${resumo[0].pct_comentario}% com comentário · ` +
      `adesão ${adesao.toFixed(1)}% dos dias elegíveis.`
  );
  for (const linha of porUnidade) {
    log(
      `  ${String(linha.unidade).padEnd(14)} janela ${linha.media_janela} · ` +
        `até 3 semanas atrás ${linha.antes} · últimas 3 semanas ${linha.ultimas_3_semanas}`
    );
  }

  // Contexto sob a chave 'clima': o orquestrador faz Object.assign do retorno
  // no contexto compartilhado — chave própria evita atropelar outro módulo.
  return {
    clima: {
      respostas: linhas.length,
      dias: dias.length,
      periodo: { inicio: primeiroDia, fim: ultimoDia },
      respondentes: contagemPorPessoa.size,
      adesao: Number(adesao.toFixed(1)),
      media: Number(resumo[0].media),
    },
  };
}

// O orquestrador usa só `semear`; o calendário sai junto para conferência
// (a janela raramente cobre um feriado, então convém poder testá-lo à parte).
module.exports = { semear, feriadosNacionais, janelaDeDiasUteis };

if (require.main === module) {
  executarSozinho('04-clima', semear);
}
