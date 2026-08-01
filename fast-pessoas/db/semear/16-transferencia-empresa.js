// db/semear/16-transferencia-empresa.js — O CASO QUE MOTIVOU A ONDA I, semeado.
//
// Palavra do dono do sistema, na reunião:
//
//     "ele demite e recontrata na outra empresa, mas não queria perder os
//      dados e histórico"
//
// A 0046 tirou o trinco do CPF, a 0047 separou REGISTRO / LOTAÇÃO / CENTRO DE
// CUSTO e a 0048 transformou os dois atos em UM. Sem este módulo nada disso
// aparece na tela: o banco AGUENTA duas fichas da mesma gente, mas a demo não
// TEM nenhuma — e a onda inteira fica invisível para quem abre o sistema.
//
// O QUE ESTE MÓDULO PLANTA
// Uma pessoa com DOIS VÍNCULOS: a conferente veterana da Filial Sul, hoje
// registrada na Casa do Montador, passa a ser registrada na SUPPLY. Ela não
// muda de cadeira: continua na mesma loja, no mesmo cargo, com o mesmo salário,
// com o mesmo líder e com o custo caindo no mesmo centro. O que muda é o CNPJ
// que assina a carteira — que é exatamente o caso do dono, e é a prova mais
// limpa de que os três campos da 0047 são independentes: o REGISTRO mudou
// sozinho, sem arrastar LOTAÇÃO nem CENTRO DE CUSTO.
//
// POR QUE ELA, e por que este módulo é o ÚLTIMO da fila:
// quando 16 roda, os módulos 02 a 15 já penduraram no vínculo dela tudo o que
// uma pessoa de anos de casa tem — ocorrência, feedback, férias, avaliação,
// documento, ASO, benefício, folha e ponto. É esse acervo que dá sentido à
// frase "não queria perder o histórico": o vínculo antigo é encerrado com a
// vida inteira dentro dele, e a ficha da PESSOA (rh.evento_da_pessoa, 0046)
// atravessa os dois contratos. Semear a transferência antes deixaria o vínculo
// velho vazio e a demo provaria o contrário do que quer provar.
//
// VIGÊNCIA = HOJE, de propósito. A transferência foi pedida pelo DP há seis
// dias, aprovada pelo líder há cinco e pela diretoria há quatro, para valer
// hoje — é como um ato desses acontece de verdade (programado). Assim o vínculo
// novo nasce sem histórico nenhum, que é o correto para um contrato de hoje, e
// o vínculo velho fica com tudo. Único artefato conhecido: 15-ponto semeia o
// mês corrente INTEIRO (inclusive os dias à frente de hoje) para todo mundo, e
// isso vale também para o vínculo encerrado.
//
// O QUE ESTE MÓDULO NÃO FAZ, e está argumentado no cabeçalho da 0048:
// não abre processo de desligamento (rito de saída não cabe em quem continua na
// casa), não copia evento, avaliação, ocorrência, documento nem ASO, e o
// período aquisitivo de férias recomeça no contrato novo. A leitura dessas
// coisas atravessa pela PESSOA, não por cópia.
//
// Este módulo é uma RÉPLICA de aplicarTransferenciaEntreEmpresas
// (src/dominios/demandas/servico.ts) — os oito passos, na mesma ordem, com os
// mesmos textos. Mudou lá? Mude aqui, senão a demo mostra um efeito que o app
// não produz.
//
// Uso isolado: node --env-file=.env db/semear/16-transferencia-empresa.js
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

// O motor de verdade formata os minutos do banco de horas — o resumo do acerto
// tem que sair com o MESMO texto que a tela mostra.
// require() de módulo TypeScript funciona sem transpilar desde o Node 22/23.
const { formatarMinutos } = require('../../src/dominios/ponto/calculo.ts');

const EMAIL_DP = 'dp@fastdemo.local';

// Personas nunca são alvo de movimentação (mesma regra de 14-promocoes):
// mudar o CNPJ do "funcionario@" contradiria a descrição dele em
// CREDENCIAIS-DEMO.md e o cenário que 02-pessoas montou em cima dele.
const PERSONAS = [
  'diretora.pessoas@fastdemo.local',
  EMAIL_DP,
  'rh@fastdemo.local',
  'gestor@fastdemo.local',
  'funcionario@fastdemo.local',
  'recrutador@fastdemo.local',
  'lidertd@fastdemo.local',
];

// Espelha ROTULOS_TRATAMENTO_RESCISAO de src/dominios/ponto/esquemas.ts e
// ROTULO_NIVEL de src/dominios/ponto/repositorio.ts.
const ROTULOS_TRATAMENTO_RESCISAO = {
  paga: 'Paga o saldo positivo na rescisão',
  perde: 'Saldo é perdido na rescisão',
  compensa: 'Compensa no aviso prévio',
};
const ROTULO_NIVEL = ['Padrão da empresa', 'Unidade', 'Cargo', 'Pessoa'];

const ROTULO_TIPO = 'Transferência entre empresas do grupo';

const CENARIO = {
  // Alvo por cargo + unidade (nunca por matrícula literal): matrícula é
  // numeração de 01-base, e amarrar cenário a número acopla os módulos à toa.
  alvo: { unidade: 'Filial Sul', cargo: 'Conferente' },
  empresaDestino: 'Supply',
  abertoDiasAtras: 6,
  aprovadoLiderDiasAtras: 5,
  aprovadoDiretoriaDiasAtras: 4,
  justificativa:
    'Reorganização societária do grupo: a partir deste mês a Supply passa a ser a ' +
    'empregadora do quadro de conferência das lojas, e a Casa do Montador segue apenas com ' +
    'a operação de balcão. A colaboradora permanece na Filial Sul, no mesmo cargo, com o ' +
    'mesmo líder e com o custo no mesmo centro — o que muda é o CNPJ do registro. Ela foi ' +
    'ouvida e concordou; o acerto rescisório na Casa do Montador sai na folha do mês.',
  motivoLider:
    'De acordo. A colaboradora continua na minha equipe e na mesma função — não perco ' +
    'ninguém da escala da loja.',
  motivoDiretoria:
    'Aprovada. É a primeira transferência da reorganização; o histórico da colaboradora ' +
    'tem de continuar visível na ficha dela, e é o que o sistema faz.',
};

// ------------------------------------------------------------------ utilidades

/** DEM-0001 — igual a formatarNumeroDemanda de src/dominios/demandas/esquemas.ts */
function numeroDemanda(numero) {
  return `DEM-${String(numero).padStart(4, '0')}`;
}

/** 29/07/2026 — igual ao formatarData do app (exibição em America/Sao_Paulo). */
function dataBr(dataIso) {
  return dataIso.split('-').reverse().join('/');
}

function instanteDiasAtras(dias, hora, minuto) {
  const data = new Date(hoje());
  data.setUTCDate(data.getUTCDate() - dias);
  data.setUTCHours(hora, minuto, 0, 0);
  return data;
}

async function umaLinha(cliente, sql, parametros, erro) {
  const { rows } = await cliente.query(sql, parametros);
  if (rows.length === 0) throw new Error(erro);
  return rows[0];
}

// ================================================================== limpeza
// Só o que ESTE módulo cria. Numa execução completa o 00-limpar já esvaziou
// tudo; isto existe para `node db/semear/16-transferencia-empresa.js` rodar
// duas vezes seguidas sem duplicar — e para desfazer o efeito, que é a parte
// difícil: o vínculo novo precisa sumir e as vigências do vínculo velho
// precisam voltar a ficar abertas.
const TABELAS_TRIGGER = [
  'rh.demanda_movimentacao',
  'rh.etapa_aprovacao_demanda',
  'rh.demanda_transicao',
  'rh.demanda',
  'rh.colaborador',
  'rh.posicao_colaborador',
  'rh.lotacao',
  'rh.relacao_gestor',
  'rh.escala_colaborador',
  'rh.banco_horas_movimento',
  'rh.dependente',
  'rh.evento_colaborador',
  'sistema.notificacao',
];

async function desfazer(cliente) {
  const { rows: anteriores } = await cliente.query(
    `SELECT m.id, m.demanda_id, m.colaborador_id, m.vinculo_destino_id,
            m.data_pretendida::text AS data_pretendida
       FROM rh.demanda_movimentacao m
      WHERE m.tipo = 'transferencia_empresa'`
  );
  if (anteriores.length === 0) return 0;

  await comTriggersDesligados(cliente, TABELAS_TRIGGER, async () => {
    for (const anterior of anteriores) {
      const origemId = Number(anterior.colaborador_id);
      const destinoId =
        anterior.vinculo_destino_id === null ? null : Number(anterior.vinculo_destino_id);
      const data = anterior.data_pretendida;
      const demandaId = Number(anterior.demanda_id);

      /* eslint-disable no-await-in-loop -- desfazer é sequencial por natureza */
      // A MOVIMENTAÇÃO SAI PRIMEIRO. Ela guarda FK para a posição e a lotação
      // criadas pelo efeito (demanda_movimentacao_lotacao_id_fkey); apagar
      // aquelas linhas antes desta esbarra na chave estrangeira.
      await cliente.query(
        `DELETE FROM rh.evento_colaborador
          WHERE origem_tabela = 'rh.demanda_movimentacao' AND origem_id = $1`,
        [Number(anterior.id)]
      );
      await cliente.query('DELETE FROM rh.demanda_movimentacao WHERE id = $1', [
        Number(anterior.id),
      ]);

      if (destinoId !== null) {
        // O vínculo novo e tudo que pendurou nele.
        await cliente.query('UPDATE rh.colaborador SET sucede_vinculo_id = NULL WHERE id = $1', [
          destinoId,
        ]);
        await cliente.query('DELETE FROM rh.dependente WHERE colaborador_id = $1', [destinoId]);
        await cliente.query(
          `DELETE FROM rh.relacao_gestor
            WHERE gestor_colaborador_id = $1 OR liderado_colaborador_id = $1`,
          [destinoId]
        );
        await cliente.query('DELETE FROM rh.escala_colaborador WHERE colaborador_id = $1', [
          destinoId,
        ]);
        await cliente.query('DELETE FROM rh.lotacao WHERE colaborador_id = $1', [destinoId]);
        await cliente.query('DELETE FROM rh.posicao_colaborador WHERE colaborador_id = $1', [
          destinoId,
        ]);
        await cliente.query(
          "DELETE FROM rh.evento_colaborador WHERE colaborador_id = $1", [destinoId]
        );
      }

      // O vínculo velho volta a ficar de pé: vigências reabertas na véspera
      // exata em que o efeito as fechou, e o status de volta para ativo.
      for (const tabela of [
        'rh.posicao_colaborador',
        'rh.lotacao',
        'rh.relacao_gestor',
        'rh.escala_colaborador',
      ]) {
        const coluna =
          tabela === 'rh.relacao_gestor' ? 'gestor_colaborador_id' : 'colaborador_id';
        await cliente.query(
          `UPDATE ${tabela} SET fim_vigencia = NULL
            WHERE fim_vigencia = $2::date - 1
              AND (${coluna} = $1${
                tabela === 'rh.relacao_gestor' ? ' OR liderado_colaborador_id = $1' : ''
              })`,
          [origemId, data]
        );
      }
      await cliente.query(
        `UPDATE rh.colaborador SET status = 'ativo', data_desligamento = NULL WHERE id = $1`,
        [origemId]
      );
      // Liquidação do banco de horas, quando a regra vigente mandou zerar.
      await cliente.query(
        `DELETE FROM rh.banco_horas_movimento
          WHERE colaborador_id = $1 AND origem = 'rescisao' AND data = $2::date`,
        [origemId, data]
      );

      await cliente.query('DELETE FROM sistema.notificacao WHERE link = $1', [
        `/demandas/${demandaId}`,
      ]);
      if (destinoId !== null) {
        await cliente.query('DELETE FROM rh.colaborador WHERE id = $1', [destinoId]);
      }
      await cliente.query('DELETE FROM rh.etapa_aprovacao_demanda WHERE demanda_id = $1', [
        demandaId,
      ]);
      await cliente.query('DELETE FROM rh.demanda_transicao WHERE demanda_id = $1', [demandaId]);
      await cliente.query('DELETE FROM rh.demanda WHERE id = $1', [demandaId]);
      /* eslint-enable no-await-in-loop */
    }
  });
  return anteriores.length;
}

// ================================================================== semeadura

async function semear(cliente) {
  const desfeitos = await desfazer(cliente);
  if (desfeitos > 0) {
    log(`16-transferencia-empresa: ${desfeitos} transferência(s) anterior(es) desfeita(s).`);
  }

  const data = iso(hoje()); // vigência: hoje (ver cabeçalho)

  // ---------------------------------------------------------- atores
  // Quem ABRE é o DP: `movimentacao.transferir_empresa` é chave de DP e
  // diretoria (0048). O gestor NÃO tem — abrir transferência de CNPJ encerra um
  // contrato de trabalho. Ele continua decidindo o nível 1 da cadeia.
  const dpLinha = await umaLinha(
    cliente,
    `SELECT u.id, u.nome FROM sistema.usuario u
      WHERE u.email = $1 AND u.ativo
        AND sistema.tem_permissao(u.id, 'movimentacao.transferir_empresa')`,
    [EMAIL_DP],
    `${EMAIL_DP} não existe ou não tem movimentacao.transferir_empresa — rode ` +
      '`npm run db:migrar` (0048) e db/semear/01-base.js.'
  );
  const dp = { id: Number(dpLinha.id), nome: dpLinha.nome };
  const dpColaborador = await umaLinha(
    cliente,
    `SELECT c.id FROM rh.colaborador c
      WHERE c.usuario_id = $1 AND c.status <> 'desligado' LIMIT 1`,
    [dp.id],
    'O DP da demo não tem vínculo ativo.'
  );

  const diretoriaLinha = await umaLinha(
    cliente,
    `SELECT u.id, u.nome FROM sistema.usuario u
      WHERE u.ativo AND sistema.tem_permissao(u.id, 'movimentacao.aprovar.diretoria')
      ORDER BY u.id LIMIT 1`,
    [],
    'Nenhum usuário com movimentacao.aprovar.diretoria — rode `npm run db:migrar` (0021).'
  );
  const diretoria = { id: Number(diretoriaLinha.id), nome: diretoriaLinha.nome };

  const tipoDemanda = await umaLinha(
    cliente,
    `SELECT id, sla_dias FROM rh.tipo_demanda_versao
      WHERE chave = 'transferencia_empresa' AND status = 'ativa' AND fluxo = 'movimentacao'`,
    [],
    'Tipo de demanda "transferencia_empresa" não está ativo — rode `npm run db:migrar` (0048).'
  );

  // ---------------------------------------------------------- o alvo
  const alvoLinha = await umaLinha(
    cliente,
    // ::text nas colunas DATE de propósito: o driver devolveria DATE como Date
    // JS no fuso LOCAL, e voltar para 'YYYY-MM-DD' trocaria o dia a leste de
    // Greenwich (mesma razão de 14-promocoes).
    `SELECT c.id, c.nome_completo, c.usuario_id, c.matricula, c.pessoa_id, c.tipo_vinculo,
            p.id AS posicao_id, p.salario, cv.nome AS cargo_atual,
            l.id AS lotacao_id, l.empresa_id, l.estabelecimento_id, l.centro_custo_id,
            l.centro_custo, ev.unidade,
            egv.nome_fantasia AS empresa_atual
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
       JOIN rh.posicao_colaborador p
         ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
       JOIN rh.lotacao l ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
       JOIN rh.empresa_grupo_versao egv
         ON egv.empresa_id = l.empresa_id AND egv.status = 'ativa'
      WHERE c.status = 'ativo'
        AND ev.unidade = $1 AND cv.nome = $2
        AND NOT (u.email = ANY($3::text[]))
      ORDER BY c.data_admissao, c.matricula
      LIMIT 1`,
    [CENARIO.alvo.unidade, CENARIO.alvo.cargo, PERSONAS],
    `Nenhum ${CENARIO.alvo.cargo} ativo (e não-persona) em ${CENARIO.alvo.unidade} — ` +
      'o elenco de 01-base mudou.'
  );
  const alvo = {
    id: Number(alvoLinha.id),
    nome: alvoLinha.nome_completo,
    usuarioId: Number(alvoLinha.usuario_id),
    matricula: alvoLinha.matricula,
    pessoaId: Number(alvoLinha.pessoa_id),
    tipoVinculo: alvoLinha.tipo_vinculo,
    posicaoId: Number(alvoLinha.posicao_id),
    salario: alvoLinha.salario,
    cargoAtual: alvoLinha.cargo_atual,
    lotacaoId: Number(alvoLinha.lotacao_id),
    empresaId: Number(alvoLinha.empresa_id),
    empresaAtual: alvoLinha.empresa_atual,
    estabelecimentoId: Number(alvoLinha.estabelecimento_id),
    centroCustoId: Number(alvoLinha.centro_custo_id),
    centroCusto: alvoLinha.centro_custo,
    unidade: alvoLinha.unidade,
  };

  const empresaDestinoLinha = await umaLinha(
    cliente,
    `SELECT e.id, v.nome_fantasia
       FROM rh.empresa_grupo e
       JOIN rh.empresa_grupo_versao v ON v.empresa_id = e.id AND v.status = 'ativa'
      WHERE v.nome_fantasia = $1 AND e.inativada_em IS NULL`,
    [CENARIO.empresaDestino],
    `Empresa destino "${CENARIO.empresaDestino}" não existe ou está inativada.`
  );
  const empresaDestino = {
    id: Number(empresaDestinoLinha.id),
    nome: empresaDestinoLinha.nome_fantasia,
  };
  if (empresaDestino.id === alvo.empresaId) {
    throw new Error(
      `${alvo.nome} já está registrada em ${empresaDestino.nome} — a transferência não teria efeito.`
    );
  }

  // A matrícula é única no GRUPO inteiro (0048): dois contratos, duas
  // matrículas, que é o que o DP espera. A próxima livre continua a numeração.
  const { rows: proxima } = await cliente.query(
    `SELECT COALESCE(MAX(matricula::bigint), 1000) + 1 AS proxima
       FROM rh.colaborador WHERE matricula ~ '^[0-9]+$'`
  );
  const matriculaDestino = String(proxima[0].proxima);

  const lider = await umaLinha(
    cliente,
    `SELECT g.id AS relacao_id, g.gestor_colaborador_id, gc.nome_completo, u.id AS usuario_id
       FROM rh.relacao_gestor g
       JOIN rh.colaborador gc ON gc.id = g.gestor_colaborador_id
       JOIN sistema.usuario u ON u.id = gc.usuario_id
      WHERE g.liderado_colaborador_id = $1 AND g.fim_vigencia IS NULL`,
    [alvo.id],
    `${alvo.nome} não tem gestor vigente — 01-base garante a relação.`
  );
  if (Number(lider.usuario_id) === diretoria.id) {
    throw new Error(
      'O líder do alvo é a própria diretoria: os dois níveis da cadeia cairiam na mesma ' +
        'pessoa (segregação). Escolha outro alvo.'
    );
  }
  const { rows: liderados } = await cliente.query(
    `SELECT id AS relacao_id, liderado_colaborador_id
       FROM rh.relacao_gestor
      WHERE gestor_colaborador_id = $1 AND fim_vigencia IS NULL`,
    [alvo.id]
  );

  // ---------------------------------------------------------- o pedido
  const abertura = instanteDiasAtras(CENARIO.abertoDiasAtras, 9, 40);
  const decisaoLider = instanteDiasAtras(CENARIO.aprovadoLiderDiasAtras, 14, 15);
  const decisaoDiretoria = instanteDiasAtras(CENARIO.aprovadoDiretoriaDiasAtras, 11, 5);
  const prazo = new Date(abertura);
  prazo.setUTCDate(prazo.getUTCDate() + Number(tipoDemanda.sla_dias));

  // MESMA frase que criarMovimentacao monta — e, como lá, SEM remuneração.
  const descricao =
    `${ROTULO_TIPO} de ${alvo.nome}: ${alvo.empresaAtual} → ${empresaDestino.nome}` +
    ` a partir de ${dataBr(data)}.` +
    ` Matrícula na empresa destino: ${matriculaDestino}.` +
    ` Trâmites do DP: acerto rescisório na empresa de origem` +
    ` (inclui férias vencidas e proporcionais e o saldo do banco de horas),` +
    ` registro e eSocial na empresa destino, ASO admissional e readesão` +
    ` de benefícios.` +
    ` Justificativa: ${CENARIO.justificativa}`;

  const [demandaLinha] = await inserirLote(
    cliente,
    'rh.demanda',
    [
      'tipo_demanda_versao_id', 'solicitante_usuario_id', 'solicitante_colaborador_id',
      'descricao', 'status', 'prazo', 'atendente_usuario_id', 'criado_em',
    ],
    [
      [
        Number(tipoDemanda.id), dp.id, Number(dpColaborador.id), descricao,
        'aguardando_aprovacao', iso(prazo), null, isoInstante(abertura),
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
      'demanda_id', 'tipo', 'colaborador_id', 'empresa_destino_id',
      'estabelecimento_destino_id', 'centro_custo_destino_id', 'matricula_destino',
      'tipo_vinculo_destino', 'data_pretendida', 'justificativa', 'criado_em',
    ],
    [
      [
        demandaId, 'transferencia_empresa', alvo.id, empresaDestino.id,
        // LOTAÇÃO e CENTRO DE CUSTO seguem os MESMOS: só o registro muda.
        alvo.estabelecimentoId, alvo.centroCustoId, matriculaDestino,
        // Sem troca de tipo de vínculo (ela continua CLT).
        null, data, CENARIO.justificativa, isoInstante(abertura),
      ],
    ],
    'id'
  );
  const movimentacaoId = Number(movimentacaoLinha.id);

  // Cadeia: nível 1 líder (PENDENTE ao abrir — quem abriu foi o DP, não o
  // líder), nível 2 diretoria. Os dois já decidiram quando a demo é aberta.
  await inserirLote(
    cliente,
    'rh.etapa_aprovacao_demanda',
    [
      'demanda_id', 'ordem', 'nivel', 'usuario_esperado_id', 'status',
      'decisor_usuario_id', 'decidido_em', 'motivo', 'criado_em',
    ],
    [
      [
        demandaId, 1, 'lider', Number(lider.usuario_id), 'aprovada',
        Number(lider.usuario_id), isoInstante(decisaoLider), CENARIO.motivoLider,
        isoInstante(abertura),
      ],
      [
        demandaId, 2, 'diretoria', null, 'aprovada', diretoria.id,
        isoInstante(decisaoDiretoria), CENARIO.motivoDiretoria, isoInstante(abertura),
      ],
    ]
  );

  // ==================================================== EFEITO (réplica da 0048)
  // 1: encerra POSIÇÃO e ALOCAÇÃO do vínculo velho na véspera.
  await cliente.query(
    'UPDATE rh.posicao_colaborador SET fim_vigencia = $2::date - 1 WHERE id = $1',
    [alvo.posicaoId, data]
  );
  await cliente.query('UPDATE rh.lotacao SET fim_vigencia = $2::date - 1 WHERE id = $1', [
    alvo.lotacaoId,
    data,
  ]);

  // 2: encerra a LIDERANÇA nos dois sentidos.
  await cliente.query('UPDATE rh.relacao_gestor SET fim_vigencia = $2::date - 1 WHERE id = $1', [
    Number(lider.relacao_id),
    data,
  ]);
  for (const relacao of liderados) {
    // eslint-disable-next-line no-await-in-loop -- lista curta, ordem irrelevante
    await cliente.query('UPDATE rh.relacao_gestor SET fim_vigencia = $2::date - 1 WHERE id = $1', [
      Number(relacao.relacao_id),
      data,
    ]);
  }

  // 3: BANCO DE HORAS liquidado pela regra vigente — item (h) da 0048. A regra
  // da demo manda "paga", e nesse caso o serviço NÃO lança nada: preserva o
  // saldo para o acerto e diz isso na trilha. Só o tratamento "perde" escreve
  // movimento. Nenhuma regra nova foi inventada aqui.
  const acertoBanco = await liquidarBanco(cliente, dp.id, alvo, data);

  // 4: desliga o velho.
  await cliente.query(
    `UPDATE rh.colaborador SET status = 'desligado', data_desligamento = $2 WHERE id = $1`,
    [alvo.id, data]
  );

  // 5: abre o novo com a MESMA pessoa_id — é a linha que faz "a pessoa é a
  // mesma". O trigger de projeção da 0046 preenche sozinho CPF, nome,
  // nascimento, gênero, retrato e a conta de acesso: não há o que copiar, e por
  // isso não há como divergir.
  const [novoLinha] = await inserirLote(
    cliente,
    'rh.colaborador',
    ['pessoa_id', 'matricula', 'matricula_esocial', 'tipo_vinculo', 'data_admissao'],
    [[alvo.pessoaId, matriculaDestino, matriculaDestino, alvo.tipoVinculo, data]],
    'id'
  );
  const novoId = Number(novoLinha.id);

  // 6: posição, alocação e liderança no vínculo novo (cargo e salário
  // congelados — transferir não é promover).
  const [posicaoNova] = await inserirLote(
    cliente,
    'rh.posicao_colaborador',
    ['colaborador_id', 'cargo_versao_id', 'salario', 'inicio_vigencia', 'criado_em'],
    [
      [
        novoId,
        await cargoVersaoDaPosicao(cliente, alvo.posicaoId),
        alvo.salario,
        data,
        isoInstante(decisaoDiretoria),
      ],
    ],
    'id'
  );
  const [lotacaoNova] = await inserirLote(
    cliente,
    'rh.lotacao',
    [
      'colaborador_id', 'empresa_id', 'estabelecimento_id', 'centro_custo_id',
      'inicio_vigencia', 'criado_em',
    ],
    [
      [
        novoId, empresaDestino.id, alvo.estabelecimentoId, alvo.centroCustoId, data,
        isoInstante(decisaoDiretoria),
      ],
    ],
    'id'
  );
  await inserirLote(
    cliente,
    'rh.relacao_gestor',
    ['gestor_colaborador_id', 'liderado_colaborador_id', 'inicio_vigencia'],
    [
      [Number(lider.gestor_colaborador_id), novoId, data],
      ...liderados.map((relacao) => [novoId, Number(relacao.liderado_colaborador_id), data]),
    ]
  );

  // 6b: A ESCALA DE PONTO. O serviço não faz isto — a escala é trâmite de DP —,
  // mas aqui ela é obrigatória para a demo não mentir: sem escala vigente o
  // vínculo novo apareceria como colaborador ativo sem jornada, e o painel de
  // ponto acusaria uma pendência que a vida real não teria (o DP monta a escala
  // no mesmo dia). A jornada é a MESMA do vínculo encerrado.
  const escalasMovidas = await moverEscala(cliente, alvo.id, novoId, data);

  // 7: DEPENDENTES copiados com rastro — item (f) da 0048 (IRRF e planos do
  // contrato novo; `origem_dependente_id` diz de onde cada um veio).
  const { rowCount: dependentesCopiados } = await cliente.query(
    `INSERT INTO rh.dependente
       (colaborador_id, nome, nascimento, parentesco, cpf, origem_dependente_id)
     SELECT $2, d.nome, d.nascimento, d.parentesco, d.cpf, d.id
       FROM rh.dependente d
      WHERE d.colaborador_id = $1`,
    [alvo.id, novoId]
  );

  // 8: o elo e os dois eventos.
  await cliente.query('UPDATE rh.colaborador SET sucede_vinculo_id = $2 WHERE id = $1', [
    novoId,
    alvo.id,
  ]);

  const payloadComum = {
    demanda: numero,
    empresa_anterior: alvo.empresaAtual,
    empresa_nova: empresaDestino.nome,
    vinculo_anterior_id: alvo.id,
    vinculo_anterior_matricula: alvo.matricula,
    vinculo_novo_id: novoId,
    vinculo_novo_matricula: matriculaDestino,
    vigencia: data,
  };

  await inserirLote(
    cliente,
    'rh.evento_colaborador',
    [
      'colaborador_id', 'tipo', 'ocorrido_em', 'origem_tabela', 'origem_id',
      'resumo', 'payload', 'registrado_por',
    ],
    [
      // Evento no vínculo que FECHA (o que aplicarEfeito grava).
      [
        alvo.id,
        'transferencia_empresa',
        isoInstante(decisaoDiretoria),
        'rh.demanda_movimentacao',
        movimentacaoId,
        `${ROTULO_TIPO}: ${alvo.empresaAtual} → ${empresaDestino.nome} ` +
          `(vigência ${dataBr(data)}) — vínculo encerrado aqui e reaberto na matrícula ` +
          `${matriculaDestino}. Aprovada na demanda ${numeroDemanda(numero)}. ` +
          `Banco de horas: ${acertoBanco.resumo}.`,
        JSON.stringify({ ...payloadComum, banco_horas: acertoBanco.resumo }),
        diretoria.id,
      ],
      // Evento no vínculo que ABRE.
      [
        novoId,
        'admissao_por_transferencia',
        `${data}T00:00:00Z`,
        'rh.demanda_movimentacao',
        movimentacaoId,
        `Admissão em ${empresaDestino.nome} por transferência entre empresas do grupo` +
          ` (vinha de ${alvo.empresaAtual}, matrícula ${alvo.matricula}) em ${dataBr(data)}` +
          ` — aprovada na demanda ${numeroDemanda(numero)}.` +
          ` Cargo e remuneração mantidos; período aquisitivo de férias recomeça neste contrato.`,
        JSON.stringify({ ...payloadComum, dependentes_copiados: dependentesCopiados ?? 0 }),
        diretoria.id,
      ],
    ]
  );

  await cliente.query(
    `UPDATE rh.demanda_movimentacao
        SET aplicada_em = $2, posicao_id = $3, lotacao_id = $4, vinculo_destino_id = $5
      WHERE id = $1`,
    [
      movimentacaoId,
      isoInstante(decisaoDiretoria),
      Number(posicaoNova.id),
      Number(lotacaoNova.id),
      novoId,
    ]
  );

  // ---------------------------------------------------------- fila do DP
  // Aprovada a última etapa, a demanda cai na fila do DP — e nesta movimentação
  // essa fila É o acerto (rescisão na origem, eSocial na destino, ASO
  // admissional, readesão de benefícios). Fica ABERTA de propósito.
  await cliente.query('UPDATE rh.demanda SET status = $2 WHERE id = $1', [demandaId, 'aberta']);
  await inserirLote(
    cliente,
    'rh.demanda_transicao',
    ['demanda_id', 'de_status', 'para_status', 'por_usuario_id', 'motivo', 'em'],
    [
      [demandaId, null, 'aguardando_aprovacao', dp.id, null, isoInstante(abertura)],
      [
        demandaId, 'aguardando_aprovacao', 'aberta', diretoria.id, CENARIO.motivoDiretoria,
        isoInstante(decisaoDiretoria),
      ],
    ]
  );

  // ---------------------------------------------------------- ciência automática
  // Mesmos tipos que o serviço emite. Sem remuneração no texto: o aviso vai
  // para DP, RH e T&D de uma vez, e o T&D não pode ver salário.
  const notificacoes = [
    [
      Number(lider.usuario_id),
      'movimentacao.aprovacao_pendente',
      `${ROTULO_TIPO} aguardando sua aprovação`,
      `${dp.nome} abriu o pedido ${numeroDemanda(numero)} para um liderado seu e aguarda sua decisão.`,
      `/demandas/${demandaId}`,
      isoInstante(abertura),
    ],
    [
      diretoria.id,
      'movimentacao.aprovacao_diretoria',
      `${ROTULO_TIPO} aguardando aprovação da diretoria`,
      `O pedido ${numeroDemanda(numero)} passou pelo líder e aguarda a decisão da diretoria.`,
      `/demandas/${demandaId}`,
      isoInstante(decisaoLider),
    ],
  ];
  const { rows: comCiencia } = await cliente.query(
    `SELECT u.id FROM sistema.usuario u
      WHERE u.ativo AND sistema.tem_permissao(u.id, 'movimentacao.ciencia')`
  );
  const destinatarios = new Set(comCiencia.map((linha) => Number(linha.id)));
  destinatarios.delete(alvo.usuarioId);
  destinatarios.delete(diretoria.id);
  for (const usuarioId of destinatarios) {
    notificacoes.push([
      usuarioId,
      'movimentacao.aprovada',
      `${ROTULO_TIPO} aprovada — providenciar trâmites`,
      `${alvo.nome}: pedido ${numeroDemanda(numero)} aprovado pela diretoria, com vigência em ${dataBr(data)}.`,
      `/demandas/${demandaId}`,
      isoInstante(decisaoDiretoria),
    ]);
  }
  notificacoes.push([
    alvo.usuarioId,
    'movimentacao.aprovada',
    `Sua ${ROTULO_TIPO.toLowerCase()} foi aprovada`,
    `A decisão está registrada no pedido ${numeroDemanda(numero)}, com vigência em ${dataBr(data)}.`,
    `/demandas/${demandaId}`,
    isoInstante(decisaoDiretoria),
  ]);
  await inserirLote(
    cliente,
    'sistema.notificacao',
    ['usuario_id', 'tipo', 'titulo', 'corpo', 'link', 'criada_em'],
    notificacoes
  );

  // ---------------------------------------------------------- conferências duras
  // Se qualquer uma destas quebrar, a demo mostraria o CONTRÁRIO do que a onda
  // resolveu — e é melhor quebrar aqui do que na frente do dono.
  const conferir = async (rotulo, sql, esperado, parametros) => {
    const { rows } = await cliente.query(sql, parametros);
    const obtido = Number(rows[0].total);
    if (obtido !== esperado) {
      throw new Error(`Invariante quebrada — ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
    }
  };

  await conferir(
    'vínculos da pessoa transferida',
    'SELECT count(*)::int AS total FROM rh.colaborador WHERE pessoa_id = $1',
    2,
    [alvo.pessoaId]
  );
  await conferir(
    'CPFs da pessoa transferida (o trinco que a 0046 tirou)',
    `SELECT count(DISTINCT cpf)::int AS total FROM rh.colaborador WHERE pessoa_id = $1`,
    1,
    [alvo.pessoaId]
  );
  await conferir(
    'contas de acesso da pessoa transferida (uma por gente, não por contrato)',
    'SELECT count(*)::int AS total FROM sistema.usuario WHERE pessoa_id = $1',
    1,
    [alvo.pessoaId]
  );
  await conferir(
    'elo de sucessão entre os dois vínculos',
    'SELECT count(*)::int AS total FROM rh.colaborador WHERE sucede_vinculo_id = $1',
    1,
    [alvo.id]
  );
  await conferir(
    'eventos COPIADOS para o vínculo novo (tem de ser só o da admissão)',
    `SELECT count(*)::int AS total FROM rh.evento_colaborador WHERE colaborador_id = $1`,
    1,
    [novoId]
  );
  await conferir(
    'período aquisitivo de férias herdado (não atravessa — item (g) da 0048)',
    'SELECT count(*)::int AS total FROM rh.periodo_aquisitivo WHERE colaborador_id = $1',
    0,
    [novoId]
  );
  await conferir(
    'processo de desligamento aberto pela transferência (a 0048 proíbe)',
    'SELECT count(*)::int AS total FROM rh.processo_desligamento WHERE colaborador_id = $1',
    0,
    [alvo.id]
  );
  await conferir(
    'colaborador com duas lotações vigentes',
    `SELECT count(*)::int AS total FROM (
       SELECT colaborador_id FROM rh.lotacao WHERE fim_vigencia IS NULL
       GROUP BY colaborador_id HAVING count(*) > 1) AS duplicadas`,
    0
  );
  await conferir(
    'ativo sem posição vigente depois do efeito',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.posicao_colaborador p
                         WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL)`,
    0
  );
  await conferir(
    'ativo sem lotação vigente depois do efeito',
    `SELECT count(*)::int AS total FROM rh.colaborador c
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.lotacao l
                         WHERE l.colaborador_id = c.id AND l.fim_vigencia IS NULL)`,
    0
  );
  // Turnover não pode mentir (0048): quem foi transferido NÃO saiu do grupo.
  await conferir(
    'a transferência contando como saída do grupo',
    'SELECT count(*)::int AS total FROM rh.colaborador WHERE id = $1 AND rh.saiu_do_grupo(id)',
    0,
    [alvo.id]
  );
  await conferir(
    'a transferência contando como admissão nova no grupo',
    'SELECT count(*)::int AS total FROM rh.colaborador WHERE id = $1 AND rh.entrou_no_grupo(id)',
    0,
    [novoId]
  );
  // Remuneração é o dado sensível deste fluxo — o aviso passa pelo T&D.
  await conferir(
    'remuneração no texto de notificação desta demanda',
    `SELECT count(*)::int AS total FROM sistema.notificacao
      WHERE link = $1 AND (corpo ~ '[0-9][0-9.,]*,[0-9][0-9]' OR corpo ILIKE '%salário%'
                           OR corpo ILIKE '%R$%')`,
    0,
    [`/demandas/${demandaId}`]
  );

  const { rows: linhaDoTempo } = await cliente.query(
    'SELECT count(*)::int AS total FROM rh.evento_da_pessoa WHERE pessoa_id = $1',
    [alvo.pessoaId]
  );

  log(
    `16-transferencia-empresa: ${numeroDemanda(numero)} — ${alvo.nome} ` +
      `(${alvo.empresaAtual} → ${empresaDestino.nome}), vigência ${dataBr(data)}.`
  );
  log(
    `  vínculo ${alvo.matricula} encerrado · vínculo ${matriculaDestino} aberto · ` +
      `1 pessoa, 1 CPF, 1 conta · ${linhaDoTempo[0].total} eventos na linha do tempo da pessoa`
  );
  log(
    `  lotação ${alvo.unidade} e centro de custo ${alvo.centroCusto} MANTIDOS ` +
      '(só o registro mudou) · ' +
      `${dependentesCopiados ?? 0} dependente(s) copiado(s) · ` +
      `${escalasMovidas} escala(s) de ponto remanejada(s)`
  );
  log(`  banco de horas: ${acertoBanco.resumo}`);

  return {
    transferencia: {
      demandaId,
      numero,
      pessoaId: alvo.pessoaId,
      vinculoAnteriorId: alvo.id,
      vinculoAnteriorMatricula: alvo.matricula,
      vinculoNovoId: novoId,
      vinculoNovoMatricula: matriculaDestino,
      nome: alvo.nome,
    },
  };
}

// ------------------------------------------------------------------ auxiliares do efeito

async function cargoVersaoDaPosicao(cliente, posicaoId) {
  const { rows } = await cliente.query(
    'SELECT cargo_versao_id FROM rh.posicao_colaborador WHERE id = $1',
    [posicaoId]
  );
  return Number(rows[0].cargo_versao_id);
}

/**
 * Réplica de liquidarBancoNaRescisao (src/dominios/ponto/servico.ts), item (h)
 * da 0048: lê a regra VIGENTE na data do término, na mesma ordem de precedência
 * (pessoa > cargo > unidade > padrão da empresa). Só o tratamento "perde"
 * escreve movimento; "paga" e "compensa" preservam o saldo para o acerto, que é
 * lançamento de gente.
 */
async function liquidarBanco(cliente, usuarioId, alvo, data) {
  const { rows: saldoLinhas } = await cliente.query(
    `SELECT COALESCE(SUM(minutos), 0)::bigint AS saldo
       FROM rh.banco_horas_movimento WHERE colaborador_id = $1`,
    [alvo.id]
  );
  const saldo = Number(saldoLinhas[0].saldo);

  const { rows: regras } = await cliente.query(
    `SELECT r.id, r.tratamento_rescisao,
            CASE WHEN r.colaborador_id     IS NOT NULL THEN 3
                 WHEN r.cargo_id           IS NOT NULL THEN 2
                 WHEN r.estabelecimento_id IS NOT NULL THEN 1
                 ELSE 0 END AS nivel
       FROM rh.regra_banco_horas_versao r
      WHERE r.status = 'ativa'
        AND r.inicio_vigencia <= $3::date
        AND (r.fim_vigencia IS NULL OR r.fim_vigencia >= $3::date)
        AND (r.colaborador_id IS NULL OR r.colaborador_id = $1)
        AND (r.estabelecimento_id IS NULL OR r.estabelecimento_id = $2)
      ORDER BY nivel DESC, r.inicio_vigencia DESC, r.id DESC
      LIMIT 1`,
    [alvo.id, alvo.estabelecimentoId, data]
  );
  if (regras.length === 0) {
    return {
      resumo:
        `saldo de ${formatarMinutos(saldo)} sem regra de banco de horas vigente ` +
        `na data do término — trate no acerto`,
    };
  }
  const regra = regras[0];
  const escopo = ROTULO_NIVEL[regra.nivel] ?? 'Padrão da empresa';
  const rotulo = ROTULOS_TRATAMENTO_RESCISAO[regra.tratamento_rescisao];
  if (saldo === 0) {
    return { resumo: 'banco de horas zerado no desligamento — nada a acertar' };
  }
  if (regra.tratamento_rescisao !== 'perde') {
    return {
      resumo:
        `saldo de ${formatarMinutos(saldo)} preservado para o acerto — a regra ` +
        `${escopo} manda "${rotulo.toLowerCase()}", e isso é lançamento de ` +
        `gente (verba rescisória ou desconto), não automático`,
    };
  }
  await inserirLote(
    cliente,
    'rh.banco_horas_movimento',
    ['colaborador_id', 'data', 'minutos', 'origem', 'apuracao_id', 'observacao', 'registrado_por'],
    [
      [
        alvo.id, data, -saldo, 'rescisao', null,
        `Desligamento em ${data}: saldo de ${formatarMinutos(saldo)} zerado ` +
          `pela regra ${escopo} (tratamento na rescisão: ${rotulo.toLowerCase()})`,
        usuarioId,
      ],
    ]
  );
  return {
    resumo: `saldo de ${formatarMinutos(saldo)} zerado no desligamento pela regra ${escopo}`,
  };
}

/** Fecha a escala vigente do vínculo velho e abre a mesma jornada no novo. */
async function moverEscala(cliente, origemId, destinoId, data) {
  const { rows: escalas } = await cliente.query(
    `SELECT jornada_versao_id, ancora_escala
       FROM rh.escala_colaborador
      WHERE colaborador_id = $1 AND fim_vigencia IS NULL`,
    [origemId]
  );
  if (escalas.length === 0) return 0;
  await cliente.query(
    `UPDATE rh.escala_colaborador SET fim_vigencia = $2::date - 1
      WHERE colaborador_id = $1 AND fim_vigencia IS NULL`,
    [origemId, data]
  );
  await inserirLote(
    cliente,
    'rh.escala_colaborador',
    ['colaborador_id', 'jornada_versao_id', 'inicio_vigencia', 'ancora_escala', 'observacao'],
    escalas.map((escala) => [
      destinoId,
      Number(escala.jornada_versao_id),
      data,
      escala.ancora_escala,
      'Escala mantida na transferência entre empresas do grupo — mesma jornada, contrato novo.',
    ])
  );
  return escalas.length;
}

module.exports = { semear, CENARIO };

if (require.main === module) {
  executarSozinho('16-transferencia-empresa', semear);
}
