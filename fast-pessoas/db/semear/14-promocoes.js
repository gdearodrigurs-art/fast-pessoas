// db/semear/14-promocoes.js — promoção e transferência com cadeia de aprovação.
//
// Origem: item 4 de docs/08-analise-feedback-analista-rh.md, na fala da própria
// analista: "aprovação de promoção do líder para a diretoria (…) e
// automaticamente com a aprovação o DP e Treinamento já ficam cientes
// providenciando os trâmites. HOJE OCORRE DE FORMA ALEATÓRIA EM CANAIS DIVERSOS
// OU SEM CANAL." A migration 0021 construiu o fluxo; este módulo o povoa para
// que a demo mostre o canal existindo, com história.
//
// O que planta (4 pedidos, cada um provando uma coisa diferente):
//   1. PROMOÇÃO APROVADA e CONCLUÍDA — cadeia completa (líder → diretoria),
//      efeito aplicado (posição nova, a antiga com vigência encerrada), evento
//      na linha do tempo e trâmites de DP já fechados. Vem com salário
//      proposto FORA DA FAIXA e justificativa de exceção: é o controle de
//      enquadramento (o "PCCS" do feedback) aparecendo funcionando.
//   2. PROMOÇÃO APROVADA, trâmites EM ABERTO — mesma cadeia, mas parada na fila
//      do DP: mostra que aprovar e executar são dois momentos distintos.
//   3. PROMOÇÃO AGUARDANDO A DIRETORIA — nível do líder aprovado, nível da
//      diretoria PENDENTE. É a peça viva da demo: entrando como
//      `diretora.pessoas@fastdemo.local` há uma decisão esperando, e entrando
//      como `gestor@fastdemo.local` o pedido aparece em "que eu abri".
//   4. TRANSFERÊNCIA DE UNIDADE APROVADA — efeito em lotação (não em cargo),
//      com centro de custo da unidade destino.
//
// DECISÕES DE COERÊNCIA (o que evita a demo se contradizer):
//   • nenhuma PERSONA é alvo de movimentação: mudar o cargo do "funcionario@"
//     ou a unidade do "gestor@" contradiria a descrição da persona em
//     CREDENCIAIS-DEMO.md e o cenário que 02-pessoas/05-ferias montaram nela;
//   • as vigências dos efeitos caem SEMPRE dentro do mês corrente, cuja
//     competência de folha 10-folha-sst deixa ABERTA. Vigência retroativa a
//     competência FECHADA faria a ficha mostrar um salário e a folha fechada
//     outro — verdadeiro (folha fechada não se reprocessa, ver 0021), mas
//     indistinguível de bug na frente de quem está avaliando o sistema;
//   • o alvo nunca é liderado direto da diretoria: quem abre o pedido não pode
//     decidir o nível da diretoria (segregação, mesma regra dos quatro olhos da
//     folha), e a diretora é a líder direta dos gerentes.
//
// O texto de TODA notificação e de TODO resumo de evento é sem remuneração: o
// valor mora em rh.demanda_movimentacao e rh.posicao_colaborador, ambos atrás de
// `rh.posicao.ver` com trilha de leitura.
//
// Uso isolado: node --env-file=.env db/semear/14-promocoes.js (após 01-base)
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  comTriggersDesligados,
  executarSozinho,
  hoje,
  inserirLote,
  iso,
  isoInstante,
  log,
} = require('./comum');

const EMAIL_GESTOR = 'gestor@fastdemo.local';
const EMAIL_DP = 'dp@fastdemo.local';

// Personas: nunca alvo (ver cabeçalho).
const PERSONAS = [
  'diretora.pessoas@fastdemo.local',
  EMAIL_DP,
  'rh@fastdemo.local',
  EMAIL_GESTOR,
  'funcionario@fastdemo.local',
  'recrutador@fastdemo.local',
  'lidertd@fastdemo.local',
];

/** DEM-0001 — igual a formatarNumeroDemanda de src/dominios/demandas/esquemas.ts */
function numeroDemanda(numero) {
  return `DEM-${String(numero).padStart(4, '0')}`;
}

/** 29/07/2026 — igual ao formatarData do app (exibição em America/Sao_Paulo). */
function dataBr(dataIso) {
  return dataIso.split('-').reverse().join('/');
}

/**
 * Vigência de efeito: `diasAtras` atrás, mas nunca antes do 1º dia do mês
 * corrente — a competência de folha do mês corrente é a única ABERTA.
 */
function vigenciaNoMesCorrente(diasAtras) {
  const base = hoje();
  const desejada = new Date(base);
  desejada.setUTCDate(desejada.getUTCDate() - diasAtras);
  const primeiroDoMes = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)
  );
  return desejada > primeiroDoMes ? desejada : primeiroDoMes;
}

/** Primeiro dia do mês que vem — data pretendida do pedido ainda em decisão. */
function primeiroDiaDoProximoMes() {
  const base = hoje();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
}

// ------------------------------------------------------------------ cenários
//
// `alvo` é resolvido por cargo + unidade + antiguidade (o mais antigo da
// posição), nunca por matrícula literal: matrícula é numeração de 01-base e
// amarrar cenário a número aumenta o acoplamento entre módulos sem ganho.

const CENARIOS = [
  {
    chave: 'promocao_concluida',
    tipo: 'promocao',
    alvo: { unidade: 'Filial Norte', cargo: 'Vendedor(a)' },
    cargoDestino: 'Supervisor(a) Comercial',
    // Enquadramento gradual: entra ABAIXO do piso da faixa, com revisão
    // acordada. É a exceção que mais aparece em PCCS de empresa média — e o
    // sistema exige a justificativa por CHECK, não por boa vontade.
    salarioProposto: 4200,
    justificativaExcecao:
      'Enquadramento gradual acordado com o colaborador e aprovado pela diretoria: entra ' +
      'abaixo do piso da faixa na assunção da função e é reenquadrado na faixa em 6 meses, ' +
      'após o primeiro ciclo completo de gestão da equipe de vendas.',
    justificativa:
      'Assume a supervisão comercial da unidade, hoje sem supervisor. É o vendedor mais ' +
      'antigo da filial, formou dois dos atuais vendedores e vem sustentando a meta da ' +
      'equipe na ausência do gerente. Avaliação de desempenho acima do esperado nos dois ' +
      'últimos ciclos.',
    abertoDiasAtras: 38,
    decididoDiasAtras: 30,
    vigenciaDiasAtras: 20,
    statusFinal: 'concluida', // DP fechou os trâmites
    motivoDiretoria:
      'Aprovado. Estrutura da filial precisa da supervisão e o enquadramento gradual está ' +
      'de acordo com a política.',
  },
  {
    chave: 'promocao_tramites_abertos',
    tipo: 'promocao',
    alvo: { unidade: 'Filial Sul', cargo: 'Auxiliar de Vendas' },
    cargoDestino: 'Vendedor(a)',
    salarioProposto: 3100,
    justificativaExcecao: null,
    justificativa:
      'Passo natural de carreira previsto no descritivo do cargo: já monta orçamento de obra ' +
      'sozinho, domina o cálculo de quantitativo de drywall e assumiu carteira própria de ' +
      'clientes durante as férias de dois vendedores.',
    abertoDiasAtras: 18,
    decididoDiasAtras: 12,
    vigenciaDiasAtras: 8,
    statusFinal: 'aberta', // fila do DP: aprovado, trâmites por fazer
    motivoDiretoria: 'Aprovado. Enquadramento dentro da faixa.',
  },
  {
    chave: 'promocao_aguardando_diretoria',
    tipo: 'promocao',
    // Matriz Centro, liderado da persona gestor@ — é o que faz a demo ao vivo
    // funcionar nas duas pontas (o líder que abriu e a diretoria que decide).
    alvo: { unidade: 'Matriz Centro', cargo: 'Estoquista' },
    exigirLiderPersonaGestor: true,
    cargoDestino: 'Conferente',
    salarioProposto: 2950,
    justificativaExcecao: null,
    justificativa:
      'Vem executando a conferência de entrada quando o conferente está em rota de ' +
      'inventário, com zero divergência apontada a posteriori. Assume a conferência cega da ' +
      'unidade, liberando o conferente atual para o turno da tarde.',
    abertoDiasAtras: 5,
    decididoDiasAtras: null, // AINDA NÃO decidido pela diretoria
    vigenciaDiasAtras: null, // data pretendida no futuro
    statusFinal: 'aguardando_aprovacao',
    motivoDiretoria: null,
  },
  {
    chave: 'transferencia_aprovada',
    tipo: 'transferencia_unidade',
    alvo: { unidade: 'Filial Oeste', cargo: 'Vendedor(a)' },
    unidadeDestino: 'Filial Leste',
    salarioProposto: null, // transferência NÃO altera salário (regra do serviço)
    justificativaExcecao: null,
    justificativa:
      'Pedido do próprio colaborador por mudança de residência: passou a morar a 4 km da ' +
      'Filial Leste e a 27 km da Oeste. A Leste está com um vendedor a menos desde o ' +
      'desligamento do mês passado, então a troca resolve as duas pontas.',
    abertoDiasAtras: 22,
    decididoDiasAtras: 16,
    vigenciaDiasAtras: 12,
    statusFinal: 'aberta',
    motivoDiretoria:
      'Aprovada. Reposição da Leste resolvida sem abrir vaga e sem custo de recrutamento.',
  },
];

// ------------------------------------------------------------------ resolução

async function umaLinha(cliente, sql, parametros, erro) {
  const { rows } = await cliente.query(sql, parametros);
  if (rows.length === 0) throw new Error(erro);
  return rows[0];
}

async function usuarioPorEmail(cliente, email) {
  const linha = await umaLinha(
    cliente,
    'SELECT id, nome FROM sistema.usuario WHERE email = $1',
    [email],
    `Usuário ${email} não existe — rode db/semear/01-base.js antes.`
  );
  return { id: Number(linha.id), nome: linha.nome };
}

/** Colaborador ativo, mais antigo no cargo dentro da unidade, que NÃO seja persona. */
async function resolverAlvo(cliente, alvo) {
  const linha = await umaLinha(
    cliente,
    // ::text nas colunas DATE de propósito: o driver devolveria DATE como Date
    // JS interpretada no fuso LOCAL, e converter de volta para 'YYYY-MM-DD'
    // trocaria o dia em qualquer máquina a leste de Greenwich.
    `SELECT c.id, c.nome_completo, c.usuario_id, c.matricula,
            p.id AS posicao_id, p.inicio_vigencia::text AS posicao_inicio,
            p.salario, cv.nome AS cargo_atual, cv.cargo_id AS cargo_atual_id,
            l.id AS lotacao_id, l.inicio_vigencia::text AS lotacao_inicio,
            l.centro_custo, l.centro_custo_id, l.empresa_id,
            l.estabelecimento_id, ev.unidade
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       JOIN rh.posicao_colaborador p
         ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
       JOIN rh.lotacao l ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE c.status = 'ativo'
        AND ev.unidade = $1
        AND cv.nome = $2
        AND NOT (u.email = ANY($3::text[]))
      ORDER BY c.data_admissao, c.matricula
      LIMIT 1`,
    [alvo.unidade, alvo.cargo, PERSONAS],
    `Nenhum ${alvo.cargo} ativo (e não-persona) em ${alvo.unidade} — o elenco de 01-base mudou.`
  );
  return {
    id: Number(linha.id),
    nome: linha.nome_completo,
    usuarioId: Number(linha.usuario_id),
    matricula: linha.matricula,
    posicaoId: Number(linha.posicao_id),
    posicaoInicio: linha.posicao_inicio,
    salario: Number(linha.salario),
    cargoAtual: linha.cargo_atual,
    cargoAtualId: Number(linha.cargo_atual_id),
    lotacaoId: Number(linha.lotacao_id),
    lotacaoInicio: linha.lotacao_inicio,
    centroCusto: linha.centro_custo,
    centroCustoId: Number(linha.centro_custo_id),
    empresaId: Number(linha.empresa_id),
    estabelecimentoId: Number(linha.estabelecimento_id),
    unidade: linha.unidade,
  };
}

/** Gestor vigente do colaborador — é ele quem abre o pedido e decide o nível 1. */
async function resolverLider(cliente, colaboradorId) {
  const linha = await umaLinha(
    cliente,
    `SELECT u.id, u.nome, u.email, gc.id AS colaborador_id
       FROM rh.relacao_gestor g
       JOIN rh.colaborador gc ON gc.id = g.gestor_colaborador_id
       JOIN sistema.usuario u ON u.id = gc.usuario_id
      WHERE g.liderado_colaborador_id = $1 AND g.fim_vigencia IS NULL`,
    [colaboradorId],
    `Colaborador ${colaboradorId} sem gestor vigente — 01-base garante a relação.`
  );
  return {
    id: Number(linha.id),
    nome: linha.nome,
    email: linha.email,
    colaboradorId: Number(linha.colaborador_id),
  };
}

async function resolverCargoDestino(cliente, nome) {
  const linha = await umaLinha(
    cliente,
    `SELECT cv.id AS cargo_versao_id, cv.cargo_id, cv.nome,
            ts.faixa_min, ts.faixa_max
       FROM rh.cargo_versao cv
       LEFT JOIN rh.tabela_salarial_versao ts
              ON ts.cargo_id = cv.cargo_id AND ts.status = 'ativa'
      WHERE cv.status = 'ativa' AND cv.nome = $1`,
    [nome],
    `Cargo destino "${nome}" sem versão ativa — 01-base cria os 15 cargos.`
  );
  return {
    cargoVersaoId: Number(linha.cargo_versao_id),
    cargoId: Number(linha.cargo_id),
    nome: linha.nome,
    faixaMin: linha.faixa_min === null ? null : Number(linha.faixa_min),
    faixaMax: linha.faixa_max === null ? null : Number(linha.faixa_max),
  };
}

async function resolverUnidadeDestino(cliente, nome) {
  const linha = await umaLinha(
    cliente,
    `SELECT ev.estabelecimento_id, ev.unidade,
            -- Centro de custo "da casa": o mais usado por quem está lotado ali.
            (SELECT l.centro_custo_id
               FROM rh.lotacao l
              WHERE l.estabelecimento_id = ev.estabelecimento_id
                AND l.fim_vigencia IS NULL
              GROUP BY l.centro_custo_id
              ORDER BY count(*) DESC, l.centro_custo_id
              LIMIT 1) AS centro_custo_id
       FROM rh.estabelecimento_versao ev
      WHERE ev.status = 'ativa' AND ev.unidade = $1`,
    [nome],
    `Unidade destino "${nome}" sem versão ativa.`
  );
  return {
    id: Number(linha.estabelecimento_id),
    unidade: linha.unidade,
    centroCustoId:
      linha.centro_custo_id === null ? null : Number(linha.centro_custo_id),
  };
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  // ---------------------------------------------------------- idempotência
  // Só o que ESTE módulo cria. As tabelas de movimentação/etapa são apagadas
  // pelo 00-limpar em execução completa; aqui a limpeza serve para rodar o
  // módulo sozinho. Posição e lotação criadas pelos efeitos são removidas pelo
  // filtro `criado_em` das linhas apontadas pelo próprio pedido — nunca por
  // DELETE cego em rh.posicao_colaborador, que é dado de 01-base.
  const TABELAS_TRIGGER = [
    'rh.demanda_movimentacao',
    'rh.etapa_aprovacao_demanda',
    'rh.demanda_transicao',
    'rh.demanda',
    'rh.posicao_colaborador',
    'rh.lotacao',
    'rh.evento_colaborador',
    'sistema.notificacao',
  ];
  // GUARDA: a transferência ENTRE EMPRESAS (16-transferencia-empresa.js) também
  // mora em rh.demanda_movimentacao, mas o efeito dela cria um VÍNCULO. A
  // limpeza abaixo desfaz posição e lotação e apaga a movimentação — o vínculo
  // novo ficaria órfão, sem ninguém apontando para ele. Numa execução completa
  // isso nunca acontece (00-limpar zera tudo e o 16 roda depois); só dá para
  // cair aqui rodando o 14 sozinho depois do 16.
  const { rows: transferenciasEmpresa } = await cliente.query(
    `SELECT count(*)::int AS total FROM rh.demanda_movimentacao
      WHERE tipo = 'transferencia_empresa'`
  );
  if (transferenciasEmpresa[0].total > 0) {
    throw new Error(
      'Existe transferência entre empresas do grupo aplicada no banco. Desfazê-la é do ' +
        '16-transferencia-empresa.js, não daqui — rode `npm run db:demo` (ou o 16 sozinho, ' +
        'que desfaz a anterior) em vez de rodar só o 14.'
    );
  }
  const removidos = await comTriggersDesligados(cliente, TABELAS_TRIGGER, async () => {
    const { rows: anteriores } = await cliente.query(
      `SELECT m.id, m.demanda_id, m.posicao_id, m.lotacao_id, m.colaborador_id
         FROM rh.demanda_movimentacao m`
    );
    if (anteriores.length === 0) return 0;

    const demandas = anteriores.map((linha) => Number(linha.demanda_id));
    const posicoesNovas = anteriores
      .filter((linha) => linha.posicao_id !== null)
      .map((linha) => Number(linha.posicao_id));
    const lotacoesNovas = anteriores
      .filter((linha) => linha.lotacao_id !== null)
      .map((linha) => Number(linha.lotacao_id));

    // Reabre a vigência anterior antes de apagar a nova, senão o colaborador
    // fica sem posição/lotação vigente (índice único é parcial em fim_vigencia).
    await cliente.query(
      `UPDATE rh.posicao_colaborador p
          SET fim_vigencia = NULL
        WHERE p.fim_vigencia IS NOT NULL
          AND EXISTS (SELECT 1 FROM rh.posicao_colaborador n
                       WHERE n.id = ANY($1::bigint[])
                         AND n.colaborador_id = p.colaborador_id
                         AND n.inicio_vigencia = p.fim_vigencia + 1)`,
      [posicoesNovas]
    );
    await cliente.query(
      `UPDATE rh.lotacao l
          SET fim_vigencia = NULL
        WHERE l.fim_vigencia IS NOT NULL
          AND EXISTS (SELECT 1 FROM rh.lotacao n
                       WHERE n.id = ANY($1::bigint[])
                         AND n.colaborador_id = l.colaborador_id
                         AND n.inicio_vigencia = l.fim_vigencia + 1)`,
      [lotacoesNovas]
    );
    await cliente.query(
      "DELETE FROM rh.evento_colaborador WHERE origem_tabela = 'rh.demanda_movimentacao'"
    );
    await cliente.query(
      "DELETE FROM sistema.notificacao WHERE tipo LIKE 'movimentacao.%'"
    );
    await cliente.query('DELETE FROM rh.demanda_movimentacao');
    await cliente.query(
      'DELETE FROM rh.posicao_colaborador WHERE id = ANY($1::bigint[])',
      [posicoesNovas]
    );
    await cliente.query('DELETE FROM rh.lotacao WHERE id = ANY($1::bigint[])', [
      lotacoesNovas,
    ]);
    await cliente.query(
      'DELETE FROM rh.etapa_aprovacao_demanda WHERE demanda_id = ANY($1::bigint[])',
      [demandas]
    );
    await cliente.query(
      'DELETE FROM rh.demanda_transicao WHERE demanda_id = ANY($1::bigint[])',
      [demandas]
    );
    await cliente.query('DELETE FROM rh.demanda WHERE id = ANY($1::bigint[])', [
      demandas,
    ]);
    return anteriores.length;
  });
  if (removidos > 0) {
    log(`14-promocoes: ${removidos} pedido(s) de movimentação anterior(es) desfeito(s).`);
  }

  // ---------------------------------------------------------- atores fixos
  const dp = await usuarioPorEmail(cliente, EMAIL_DP);
  const diretoriaLinha = await umaLinha(
    cliente,
    `SELECT u.id, u.nome FROM sistema.usuario u
      WHERE u.ativo AND sistema.tem_permissao(u.id, 'movimentacao.aprovar.diretoria')
      ORDER BY u.id LIMIT 1`,
    [],
    'Nenhum usuário com movimentacao.aprovar.diretoria — rode `npm run db:migrar` (0021).'
  );
  const diretoria = { id: Number(diretoriaLinha.id), nome: diretoriaLinha.nome };

  const { rows: tipos } = await cliente.query(
    `SELECT id, chave, nome, sla_dias FROM rh.tipo_demanda_versao
      WHERE status = 'ativa' AND fluxo = 'movimentacao'`
  );
  const tipoPorChave = new Map(
    tipos.map((linha) => [linha.chave, { ...linha, id: Number(linha.id) }])
  );
  for (const chave of ['promocao', 'transferencia_unidade']) {
    if (!tipoPorChave.has(chave)) {
      throw new Error(
        `Tipo de demanda "${chave}" com fluxo movimentacao não está ativo — ` +
          'rode `npm run db:migrar` (migration 0021).'
      );
    }
  }

  // Ciência automática: DP, RH e T&D (chave movimentacao.ciencia).
  const { rows: comCiencia } = await cliente.query(
    `SELECT u.id FROM sistema.usuario u
      WHERE u.ativo AND sistema.tem_permissao(u.id, 'movimentacao.ciencia')`
  );
  const usuariosCiencia = comCiencia.map((linha) => Number(linha.id));

  const ROTULO_TIPO = {
    promocao: 'Promoção',
    transferencia_unidade: 'Transferência de unidade',
  };

  const resumo = [];
  const notificacoes = [];

  for (const cenario of CENARIOS) {
    const alvo = await resolverAlvo(cliente, cenario.alvo);
    const lider = await resolverLider(cliente, alvo.id);
    if (cenario.exigirLiderPersonaGestor && lider.email !== EMAIL_GESTOR) {
      throw new Error(
        `O cenário "${cenario.chave}" precisa que o líder do alvo seja a persona ` +
          `${EMAIL_GESTOR} (para a demo ao vivo), e é ${lider.email}. Ajuste o alvo ou o QUADRO.`
      );
    }
    if (lider.id === diretoria.id) {
      throw new Error(
        `O cenário "${cenario.chave}" tem a diretoria como líder do alvo: quem abre o pedido ` +
          'não pode decidir o nível da diretoria (segregação). Escolha outro alvo.'
      );
    }

    const ehPromocao = cenario.tipo === 'promocao';
    const destinoCargo = ehPromocao
      ? await resolverCargoDestino(cliente, cenario.cargoDestino)
      : null;
    const destinoUnidade = ehPromocao
      ? null
      : await resolverUnidadeDestino(cliente, cenario.unidadeDestino);

    if (ehPromocao && destinoCargo.cargoId === alvo.cargoAtualId) {
      throw new Error(
        `O cenário "${cenario.chave}" promove para o cargo que a pessoa já tem (${alvo.cargoAtual}).`
      );
    }
    if (!ehPromocao && destinoUnidade.id === alvo.estabelecimentoId) {
      throw new Error(
        `O cenário "${cenario.chave}" transfere para a unidade em que a pessoa já está.`
      );
    }

    // Enquadramento: snapshot da faixa vigente do cargo destino no ato do
    // pedido, e a trava de exceção que a 0021 impõe por CHECK.
    let dentroFaixa = null;
    if (ehPromocao && cenario.salarioProposto !== null && destinoCargo.faixaMin !== null) {
      dentroFaixa =
        cenario.salarioProposto >= destinoCargo.faixaMin &&
        cenario.salarioProposto <= destinoCargo.faixaMax;
    }
    if (dentroFaixa === false && !cenario.justificativaExcecao) {
      throw new Error(
        `O cenário "${cenario.chave}" propõe salário fora da faixa sem justificativa de exceção.`
      );
    }
    if (dentroFaixa !== false && cenario.justificativaExcecao) {
      throw new Error(
        `O cenário "${cenario.chave}" traz justificativa de exceção com salário DENTRO da faixa — ` +
          'o pedido diria uma coisa e o dado outra.'
      );
    }

    const dataPretendida =
      cenario.vigenciaDiasAtras === null
        ? iso(primeiroDiaDoProximoMes())
        : iso(vigenciaNoMesCorrente(cenario.vigenciaDiasAtras));
    if (ehPromocao && dataPretendida <= alvo.posicaoInicio) {
      throw new Error(
        `Vigência ${dataPretendida} não é posterior ao início da posição vigente de ` +
          `${alvo.nome} (${alvo.posicaoInicio}) — o app recusaria o efeito (409).`
      );
    }
    if (!ehPromocao && dataPretendida <= alvo.lotacaoInicio) {
      throw new Error(
        `Vigência ${dataPretendida} não é posterior ao início da lotação vigente de ` +
          `${alvo.nome} (${alvo.lotacaoInicio}) — o app recusaria o efeito (409).`
      );
    }

    const abertura = new Date(hoje());
    abertura.setUTCDate(abertura.getUTCDate() - cenario.abertoDiasAtras);
    abertura.setUTCHours(10, 20, 0, 0);
    const prazo = new Date(abertura);
    prazo.setUTCDate(prazo.getUTCDate() + Number(tipoPorChave.get(cenario.tipo).sla_dias));

    const origem = ehPromocao ? alvo.cargoAtual : alvo.unidade;
    const destino = ehPromocao ? destinoCargo.nome : destinoUnidade.unidade;
    const rotuloTipo = ROTULO_TIPO[cenario.tipo];
    // Mesma frase que criarMovimentacao monta — e, como lá, SEM remuneração.
    const descricao =
      `${rotuloTipo} de ${alvo.nome}: ${origem} → ${destino}` +
      ` a partir de ${dataBr(dataPretendida)}.` +
      ` Justificativa: ${cenario.justificativa}`;

    const [demandaLinha] = await inserirLote(
      cliente,
      'rh.demanda',
      [
        'tipo_demanda_versao_id', 'solicitante_usuario_id', 'solicitante_colaborador_id',
        'descricao', 'status', 'prazo', 'atendente_usuario_id', 'criado_em',
      ],
      [
        [
          tipoPorChave.get(cenario.tipo).id,
          lider.id,
          lider.colaboradorId,
          descricao,
          'aguardando_aprovacao',
          iso(prazo),
          null,
          isoInstante(abertura),
        ],
      ],
      'id, numero'
    );
    const demandaId = Number(demandaLinha.id);
    const numero = Number(demandaLinha.numero);

    const [movimentacaoLinha] = await inserirLote(
      cliente,
      'rh.demanda_movimentacao',
      [
        'demanda_id', 'tipo', 'colaborador_id', 'cargo_destino_id',
        'estabelecimento_destino_id', 'centro_custo_destino_id', 'salario_proposto',
        'faixa_min', 'faixa_max', 'dentro_faixa', 'justificativa_excecao',
        'data_pretendida', 'justificativa', 'criado_em',
      ],
      [
        [
          demandaId,
          cenario.tipo,
          alvo.id,
          ehPromocao ? destinoCargo.cargoId : null,
          ehPromocao ? null : destinoUnidade.id,
          ehPromocao ? null : destinoUnidade.centroCustoId,
          cenario.salarioProposto === null ? null : cenario.salarioProposto.toFixed(2),
          ehPromocao && destinoCargo.faixaMin !== null
            ? destinoCargo.faixaMin.toFixed(2)
            : null,
          ehPromocao && destinoCargo.faixaMax !== null
            ? destinoCargo.faixaMax.toFixed(2)
            : null,
          dentroFaixa,
          dentroFaixa === false ? cenario.justificativaExcecao : null,
          dataPretendida,
          cenario.justificativa,
          isoInstante(abertura),
        ],
      ],
      'id'
    );
    const movimentacaoId = Number(movimentacaoLinha.id);

    // Cadeia: nível 1 nasce APROVADO porque quem abriu é o próprio líder
    // vigente (exatamente o que criarMovimentacao faz — pedir que ele aprove o
    // próprio pedido seria teatro, e o registro guarda que a decisão foi dele).
    const etapas = [
      [
        demandaId, 1, 'lider', lider.id, 'aprovada', lider.id,
        isoInstante(abertura), 'Pedido aberto pelo próprio líder do colaborador',
        isoInstante(abertura),
      ],
    ];
    const decisao = new Date(hoje());
    if (cenario.decididoDiasAtras !== null) {
      decisao.setUTCDate(decisao.getUTCDate() - cenario.decididoDiasAtras);
      decisao.setUTCHours(15, 5, 0, 0);
      etapas.push([
        demandaId, 2, 'diretoria', null, 'aprovada', diretoria.id,
        isoInstante(decisao), cenario.motivoDiretoria, isoInstante(abertura),
      ]);
    } else {
      etapas.push([
        demandaId, 2, 'diretoria', null, 'pendente', null, null, null,
        isoInstante(abertura),
      ]);
    }
    await inserirLote(
      cliente,
      'rh.etapa_aprovacao_demanda',
      [
        'demanda_id', 'ordem', 'nivel', 'usuario_esperado_id', 'status',
        'decisor_usuario_id', 'decidido_em', 'motivo', 'criado_em',
      ],
      etapas
    );

    // Abertura registrada já aqui (de_status NULL = abertura, 0003): o pedido
    // que fica aguardando a diretoria sai do laço antes das demais transições.
    const COLUNAS_TRANSICAO = [
      'demanda_id', 'de_status', 'para_status', 'por_usuario_id', 'motivo', 'em',
    ];
    await inserirLote(cliente, 'rh.demanda_transicao', COLUNAS_TRANSICAO, [
      [demandaId, null, 'aguardando_aprovacao', lider.id, null, isoInstante(abertura)],
    ]);
    const transicoes = [];

    if (cenario.decididoDiasAtras === null) {
      // Pedido vivo: a diretoria foi avisada e está com a bola.
      notificacoes.push([
        diretoria.id,
        // MESMO tipo que avisarDiretoria() emite em
        // src/dominios/demandas/servico.ts. O semeador replica o efeito do
        // serviço; se o `tipo` divergir, a notificação semeada é a única do
        // banco com um tipo que o app nunca produz — e a demo passa a mostrar
        // uma linha que não existiria na vida real.
        'movimentacao.aprovacao_diretoria',
        `${rotuloTipo} aguardando a sua decisão`,
        `${alvo.nome}: pedido ${numeroDemanda(numero)} aprovado pelo líder e esperando o nível da diretoria.`,
        `/demandas/${demandaId}`,
        isoInstante(abertura),
      ]);
      resumo.push(
        `${numeroDemanda(numero)} ${rotuloTipo} de ${alvo.nome} (${origem} → ${destino}) — ` +
          `AGUARDANDO DIRETORIA, vigência pretendida ${dataBr(dataPretendida)}`
      );
      continue;
    }

    // ------------------------------------------------ efeito automático
    // Réplica do aplicarEfeito de src/dominios/demandas/servico.ts.
    let posicaoNovaId = null;
    let lotacaoNovaId = null;
    let resumoEvento;
    let payloadEvento;

    if (ehPromocao) {
      await cliente.query(
        'UPDATE rh.posicao_colaborador SET fim_vigencia = $2::date - 1 WHERE id = $1',
        [alvo.posicaoId, dataPretendida]
      );
      const [nova] = await inserirLote(
        cliente,
        'rh.posicao_colaborador',
        ['colaborador_id', 'cargo_versao_id', 'salario', 'inicio_vigencia', 'criado_em'],
        [
          [
            alvo.id,
            destinoCargo.cargoVersaoId,
            (cenario.salarioProposto ?? alvo.salario).toFixed(2),
            dataPretendida,
            isoInstante(decisao),
          ],
        ],
        'id'
      );
      posicaoNovaId = Number(nova.id);
      resumoEvento =
        `${rotuloTipo}: ${alvo.cargoAtual} → ${destinoCargo.nome} ` +
        `(vigência ${dataBr(dataPretendida)}) — aprovada na demanda ${numeroDemanda(numero)}`;
      payloadEvento = {
        demanda: numero,
        cargo_anterior: alvo.cargoAtual,
        cargo_novo: destinoCargo.nome,
        vigencia: dataPretendida,
      };
    } else {
      await cliente.query(
        'UPDATE rh.lotacao SET fim_vigencia = $2::date - 1 WHERE id = $1',
        [alvo.lotacaoId, dataPretendida]
      );
      // Transferência de unidade não muda a EMPRESA: trocar de CNPJ é
      // desligamento + nova admissão (outro vínculo).
      const centroCustoId = destinoUnidade.centroCustoId ?? alvo.centroCustoId;
      const [nova] = await inserirLote(
        cliente,
        'rh.lotacao',
        ['colaborador_id', 'empresa_id', 'estabelecimento_id', 'centro_custo_id', 'inicio_vigencia', 'criado_em'],
        [[alvo.id, alvo.empresaId, destinoUnidade.id, centroCustoId, dataPretendida, isoInstante(decisao)]],
        'id, centro_custo'
      );
      const centroCusto = nova.centro_custo;
      lotacaoNovaId = Number(nova.id);
      resumoEvento =
        `${rotuloTipo}: ${alvo.unidade} → ${destinoUnidade.unidade} ` +
        `(vigência ${dataBr(dataPretendida)}) — aprovada na demanda ${numeroDemanda(numero)}`;
      payloadEvento = {
        demanda: numero,
        unidade_anterior: alvo.unidade,
        unidade_nova: destinoUnidade.unidade,
        centro_custo: centroCusto,
        vigencia: dataPretendida,
      };
    }

    await cliente.query(
      `UPDATE rh.demanda_movimentacao
          SET aplicada_em = $2, posicao_id = $3, lotacao_id = $4
        WHERE id = $1`,
      [movimentacaoId, isoInstante(decisao), posicaoNovaId, lotacaoNovaId]
    );

    await inserirLote(
      cliente,
      'rh.evento_colaborador',
      [
        'colaborador_id', 'tipo', 'ocorrido_em', 'origem_tabela', 'origem_id',
        'resumo', 'payload', 'registrado_por',
      ],
      [
        [
          alvo.id,
          ehPromocao ? 'promocao' : 'transferencia',
          isoInstante(decisao),
          'rh.demanda_movimentacao',
          movimentacaoId,
          resumoEvento,
          JSON.stringify(payloadEvento),
          diretoria.id,
        ],
      ]
    );

    // Aprovada a última etapa, a demanda cai na fila do DP (trâmites).
    transicoes.push([
      demandaId, 'aguardando_aprovacao', 'aberta', diretoria.id,
      cenario.motivoDiretoria, isoInstante(decisao),
    ]);

    // Ciência automática — a dor central do feedback. Sem remuneração no texto.
    const destinatarios = new Set(usuariosCiencia);
    destinatarios.delete(alvo.usuarioId);
    destinatarios.delete(diretoria.id);
    for (const usuarioId of destinatarios) {
      notificacoes.push([
        usuarioId,
        'movimentacao.aprovada',
        `${rotuloTipo} aprovada — providenciar trâmites`,
        `${alvo.nome}: pedido ${numeroDemanda(numero)} aprovado pela diretoria, com vigência em ${dataBr(dataPretendida)}.`,
        `/demandas/${demandaId}`,
        isoInstante(decisao),
      ]);
    }
    notificacoes.push([
      alvo.usuarioId,
      'movimentacao.aprovada',
      `Sua ${rotuloTipo.toLowerCase()} foi aprovada`,
      `A decisão está registrada no pedido ${numeroDemanda(numero)}, com vigência em ${dataBr(dataPretendida)}.`,
      `/demandas/${demandaId}`,
      isoInstante(decisao),
    ]);

    let statusFinal = 'aberta';
    if (cenario.statusFinal === 'concluida') {
      // DP assumiu e fechou os trâmites (contrato, eSocial, folha, T&D avisado).
      const assumido = new Date(decisao);
      assumido.setUTCDate(assumido.getUTCDate() + 1);
      const concluido = new Date(decisao);
      concluido.setUTCDate(concluido.getUTCDate() + 4);
      transicoes.push([demandaId, 'aberta', 'em_atendimento', dp.id, null, isoInstante(assumido)]);
      transicoes.push([
        demandaId, 'em_atendimento', 'concluida', dp.id,
        'Trâmites concluídos: alteração contratual assinada, eSocial transmitido, ' +
          'posição e apropriação atualizadas na folha e T&D ciente do plano de integração à função.',
        isoInstante(concluido),
      ]);
      statusFinal = 'concluida';
      await cliente.query(
        'UPDATE rh.demanda SET status = $2, atendente_usuario_id = $3 WHERE id = $1',
        [demandaId, statusFinal, dp.id]
      );
    } else {
      await cliente.query('UPDATE rh.demanda SET status = $2 WHERE id = $1', [
        demandaId,
        statusFinal,
      ]);
    }

    await inserirLote(cliente, 'rh.demanda_transicao', COLUNAS_TRANSICAO, transicoes);

    resumo.push(
      `${numeroDemanda(numero)} ${rotuloTipo} de ${alvo.nome} (${origem} → ${destino}) — ` +
        `APROVADA em ${dataBr(iso(decisao))}, vigência ${dataBr(dataPretendida)}, ` +
        `demanda ${statusFinal}` +
        (dentroFaixa === false ? ' [salário fora da faixa, com justificativa de exceção]' : '')
    );
  }

  await inserirLote(
    cliente,
    'sistema.notificacao',
    ['usuario_id', 'tipo', 'titulo', 'corpo', 'link', 'criada_em'],
    notificacoes
  );

  // ---------------------------------------------------------- conferências duras
  const conferir = async (rotulo, sql, esperado, parametros) => {
    const { rows } = await cliente.query(sql, parametros);
    const obtido = Number(rows[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await conferir(
    'pedidos de movimentação',
    'SELECT count(*)::int AS total FROM rh.demanda_movimentacao',
    CENARIOS.length
  );
  await conferir(
    'pedidos aguardando a diretoria',
    `SELECT count(*)::int AS total
       FROM rh.demanda d
       JOIN rh.etapa_aprovacao_demanda e ON e.demanda_id = d.id
      WHERE d.status = 'aguardando_aprovacao'
        AND e.nivel = 'diretoria' AND e.status = 'pendente'`,
    CENARIOS.filter((c) => c.decididoDiasAtras === null).length
  );
  await conferir(
    'pedidos aprovados com efeito aplicado',
    `SELECT count(*)::int AS total FROM rh.demanda_movimentacao
      WHERE aplicada_em IS NOT NULL
        AND (posicao_id IS NOT NULL OR lotacao_id IS NOT NULL)`,
    CENARIOS.filter((c) => c.decididoDiasAtras !== null).length
  );
  await conferir(
    'eventos de movimentação na linha do tempo',
    `SELECT count(*)::int AS total FROM rh.evento_colaborador
      WHERE origem_tabela = 'rh.demanda_movimentacao'`,
    CENARIOS.filter((c) => c.decididoDiasAtras !== null).length
  );
  // As duas invariantes que doeriam de verdade se quebrassem:
  await conferir(
    'colaborador sem posição vigente depois dos efeitos',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.posicao_colaborador p
                         WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL)`,
    0
  );
  await conferir(
    'colaborador com duas lotações vigentes',
    `SELECT count(*)::int AS total FROM (
       SELECT colaborador_id FROM rh.lotacao WHERE fim_vigencia IS NULL
       GROUP BY colaborador_id HAVING count(*) > 1) AS duplicadas`,
    0
  );
  await conferir(
    'buraco ou sobreposição de vigência na posição',
    `SELECT count(*)::int AS total FROM rh.posicao_colaborador a
       JOIN rh.posicao_colaborador b
         ON b.colaborador_id = a.colaborador_id AND b.inicio_vigencia > a.inicio_vigencia
      WHERE a.fim_vigencia IS NOT NULL
        AND b.inicio_vigencia <> a.fim_vigencia + 1
        AND NOT EXISTS (SELECT 1 FROM rh.posicao_colaborador m
                         WHERE m.colaborador_id = a.colaborador_id
                           AND m.inicio_vigencia > a.inicio_vigencia
                           AND m.inicio_vigencia < b.inicio_vigencia)`,
    0
  );
  // Remuneração é o dado sensível deste fluxo: notificação vai para DP, RH, T&D
  // e diretoria de uma vez, e o T&D NÃO pode ver salário. Se um dia alguém
  // colocar o valor no corpo do aviso, o vazamento passa por todo mundo.
  await conferir(
    'remuneração no texto de notificação de movimentação',
    `SELECT count(*)::int AS total FROM sistema.notificacao
      WHERE tipo LIKE 'movimentacao.%'
        AND (titulo || ' ' || coalesce(corpo, ''))
            ~* '(r\\$|sal[áa]ri|remunera|faixa salarial)'`,
    0
  );
  await conferir(
    'etapa decidida sem decisor (ou pendente com decisor)',
    `SELECT count(*)::int AS total FROM rh.etapa_aprovacao_demanda
      WHERE (status <> 'pendente') <> (decisor_usuario_id IS NOT NULL)`,
    0
  );
  await conferir(
    'nível da diretoria decidido por quem abriu o pedido',
    `SELECT count(*)::int AS total
       FROM rh.etapa_aprovacao_demanda e
       JOIN rh.demanda d ON d.id = e.demanda_id
      WHERE e.nivel = 'diretoria' AND e.decisor_usuario_id = d.solicitante_usuario_id`,
    0
  );

  // ---------------------------------------------------------- resumo
  log(`14-promocoes: ${CENARIOS.length} pedidos de movimentação plantados.`);
  for (const linha of resumo) log(`    ${linha}`);
  log(
    `14-promocoes: ${notificacoes.length} notificações de ciência (DP, RH, T&D, diretoria e o ` +
      'próprio colaborador) — nenhuma com valor de remuneração no texto.'
  );

  return { movimentacoes: CENARIOS.length };
}

module.exports = { semear, CENARIOS };

if (require.main === module) {
  executarSozinho('14-promocoes', semear);
}
