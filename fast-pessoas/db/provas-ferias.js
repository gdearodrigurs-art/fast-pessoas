// db/provas-ferias.js — prova do INSERT EM LOTE dos períodos aquisitivos
// (dívida B6/B8 da pendência #15: a troca laço→lote da revisão geral nunca
// tinha ganhado teste).
//
// A outra metade — a régua PURA de quais períodos existem e quais faltam — é
// provada, sem banco, em tests/ferias.test.ts. Esta prova exercita o que só o
// banco garante: o INSERT ... unnest ... ON CONFLICT DO NOTHING ... RETURNING
// de ferias/repositorio.inserirPeriodosEmLote (verbatim) — que precisa criar
// tudo num comando só, segurar duplicata sem erro e devolver SÓ as linhas de
// fato criadas, porque cada retorno vira uma linha de auditoria — e o SELECT
// ESCOPADO de listarIniciosExistentes (verbatim), que não pode enxergar
// colaborador fora da lista pedida.
//
// Não persiste nada: roda dentro de BEGIN/ROLLBACK, então é RE-EXECUTÁVEL e
// não toca no dado de demonstração. Os períodos sintéticos moram em 2090+,
// longe de qualquer período que o gerador lazy materialize de verdade.
//
// COMO RODAR (o orquestrador roda no merge; --banco é obrigatório):
//   node --env-file=.env.local-db db/provas-ferias.js --banco fast_pessoas_dev
const {
  lerArgumentos,
  resolverConexao,
  exigirLocal,
  abrir,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const AJUDA = `
db/provas-ferias.js — prova o INSERT em lote (idempotente) dos períodos aquisitivos.

  node --env-file=.env.local-db db/provas-ferias.js --banco fast_pessoas_dev

Roda em transação e dá ROLLBACK: não altera nada. Sai 0 se a prova passa.
`;

// Verbatim de ferias/repositorio.inserirPeriodosEmLote: um só INSERT; o UNIQUE
// (colaborador_id, inicio) + ON CONFLICT DO NOTHING seguram duplicata; o
// RETURNING devolve SÓ o que foi de fato criado (o serviço audita cada linha).
const SQL_INSERIR_LOTE = `
    INSERT INTO rh.periodo_aquisitivo
       (colaborador_id, inicio, fim, limite_concessivo, status)
     SELECT * FROM unnest(
       $1::bigint[], $2::date[], $3::date[], $4::date[], $5::text[]
     )
     ON CONFLICT (colaborador_id, inicio) DO NOTHING
     RETURNING id, colaborador_id, inicio::text AS inicio, fim::text AS fim,
               limite_concessivo::text AS limite_concessivo, status`;

// Verbatim de ferias/repositorio.listarIniciosExistentes: escopado aos ids
// pedidos — a revisão geral trocou a varredura da tabela inteira por este ANY.
const SQL_LISTAR_INICIOS = `
    SELECT colaborador_id, inicio::text AS inicio
       FROM rh.periodo_aquisitivo
      WHERE colaborador_id = ANY($1)`;

async function main() {
  const { bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  const conexao = resolverConexao(bandeiras);
  exigirLocal(conexao, 'Prova de integração roda só no banco local de desenvolvimento.');

  const cliente = await abrir(conexao);
  const falhas = [];
  const conferir = (rotulo, condicao) => {
    console.log(`  ${rotulo.padEnd(58)} ${condicao ? 'ok' : 'FALHOU'}`);
    if (!condicao) falhas.push(rotulo);
  };
  try {
    const { rows: colaboradores } = await cliente.query(
      'SELECT id, nome_completo FROM rh.colaborador ORDER BY id LIMIT 2'
    );
    if (colaboradores.length < 2) {
      throw new Error('Preciso de 2 colaboradores para testar o escopo — rode "npm run db:demo".');
    }
    const [c1, c2] = colaboradores.map((linha) => Number(linha.id));
    console.log(
      `Colaboradores de teste: ${colaboradores[0].nome_completo} (id ${c1}) e ` +
        `${colaboradores[1].nome_completo} (id ${c2}) — transação revertida, nada persistido.\n`
    );

    await cliente.query('BEGIN');

    const inserir = async (periodos) => {
      const { rows } = await cliente.query(SQL_INSERIR_LOTE, [
        periodos.map((p) => p.colaborador_id),
        periodos.map((p) => p.inicio),
        periodos.map((p) => p.fim),
        periodos.map((p) => p.limite_concessivo),
        periodos.map((p) => p.status),
      ]);
      return rows;
    };
    const listar = async (ids) => {
      const { rows } = await cliente.query(SQL_LISTAR_INICIOS, [ids]);
      return rows.map((linha) => ({
        colaborador_id: Number(linha.colaborador_id),
        inicio: linha.inicio,
      }));
    };

    // Períodos sintéticos em 2090+ — nenhum gerador lazy chega lá, e o UNIQUE
    // (colaborador_id, inicio) é o mesmo que segura a corrida em produção.
    const lote = [
      { colaborador_id: c1, inicio: '2090-01-01', fim: '2090-12-31', limite_concessivo: '2091-12-31', status: 'em_aberto' },
      { colaborador_id: c1, inicio: '2091-01-01', fim: '2091-12-31', limite_concessivo: '2092-12-31', status: 'em_aberto' },
      { colaborador_id: c2, inicio: '2090-01-01', fim: '2090-12-31', limite_concessivo: '2091-12-31', status: 'vencido' },
    ];

    // 0. Linha de base do que já existe para os dois (períodos reais do demo).
    const antes = await listar([c1, c2]);
    const chaveDe = (p) => `${p.colaborador_id}|${p.inicio}`;
    const chavesAntes = new Set(antes.map(chaveDe));
    conferir('base: nenhum período sintético (2090+) pré-existente',
      antes.every((p) => p.inicio < '2090-01-01'));

    // 1. Lote inteiro de uma vez: cria os 3 e devolve os 3, fiéis ao pedido.
    const criados = await inserir(lote);
    conferir('lote de 3 num só INSERT: devolve 3 linhas criadas', criados.length === 3);
    conferir('cada linha criada ganhou id', criados.every((p) => Number(p.id) > 0));
    conferir('cada linha ecoa fim, limite e status fiéis ao pedido',
      lote.every((pedido) => {
        const criado = criados.find((p) => chaveDe({ colaborador_id: Number(p.colaborador_id), inicio: p.inicio }) === chaveDe(pedido));
        return (
          criado !== undefined &&
          criado.fim === pedido.fim &&
          criado.limite_concessivo === pedido.limite_concessivo &&
          criado.status === pedido.status
        );
      }));

    // 2. O MESMO lote de novo: ON CONFLICT segura tudo, sem erro e sem retorno.
    const repetidos = await inserir(lote);
    conferir('mesmo lote de novo: 0 criados (idempotente, sem erro)', repetidos.length === 0);
    const { rows: contagem } = await cliente.query(
      `SELECT COUNT(*) AS total FROM rh.periodo_aquisitivo
        WHERE colaborador_id = ANY($1) AND inicio >= '2090-01-01'`,
      [[c1, c2]]
    );
    conferir('e nada duplicou no banco (seguem 3 linhas)', Number(contagem[0].total) === 3);

    // 3. Lote MISTO (a corrida real: outra sessão criou um no meio): devolve SÓ
    //    o que criou — é este retorno que vira auditoria, um diff por geração real.
    const misto = await inserir([
      lote[0], // duplicata
      { colaborador_id: c1, inicio: '2092-01-01', fim: '2092-12-31', limite_concessivo: '2093-12-31', status: 'em_aberto' },
    ]);
    conferir('lote misto (1 duplicata + 1 novo): devolve SÓ o novo',
      misto.length === 1 && misto[0].inicio === '2092-01-01' && Number(misto[0].colaborador_id) === c1);

    // 4. listarIniciosExistentes é ESCOPADO: pedir só c1 não traz linha de c2.
    const soC1 = await listar([c1]);
    conferir('listar escopado a c1: só linhas de c1',
      soC1.length > 0 && soC1.every((p) => p.colaborador_id === c1));
    conferir('listar escopado a c1: enxerga os 3 sintéticos dele',
      ['2090-01-01', '2091-01-01', '2092-01-01'].every((inicio) =>
        soC1.some((p) => p.inicio === inicio)));

    // 5. O par (colaborador, início) é a chave que o gerador lazy consulta:
    //    depois do lote, listar devolve exatamente base + 4 pares novos.
    const depois = await listar([c1, c2]);
    const chavesNovas = new Set([...lote, { colaborador_id: c1, inicio: '2092-01-01' }].map(chaveDe));
    conferir('depois do lote: base + 4 pares novos, nada além',
      depois.length === antes.length + 4 &&
        depois.every((p) => chavesAntes.has(chaveDe(p)) || chavesNovas.has(chaveDe(p))));

    await cliente.query('ROLLBACK'); // não persiste nada

    // 6. Re-executável de verdade: depois do ROLLBACK, tudo como era.
    const restaurado = await listar([c1, c2]);
    conferir('após ROLLBACK: banco exatamente como antes (re-executável)',
      restaurado.length === antes.length &&
        restaurado.every((p) => chavesAntes.has(chaveDe(p))));

    const ok = falhas.length === 0;
    console.log(
      '\n' +
        (ok
          ? 'PROVA OK: o lote cria tudo num INSERT só, segura duplicata sem erro, devolve só o que criou e lê escopado.'
          : `PROVA FALHOU: ${falhas.length} verificação(ões) não passaram — ${falhas.join(' · ')}`)
    );
    process.exitCode = ok ? 0 : 1;
  } catch (erro) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      // conexão já perdida — nada a reverter
    }
    throw erro;
  } finally {
    await cliente.end();
  }
}

main().catch(morrer);
