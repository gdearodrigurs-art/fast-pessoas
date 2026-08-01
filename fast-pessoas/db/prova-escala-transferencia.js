// db/prova-escala-transferencia.js — a prova da frente "escala na transferência".
//
// POR QUE ESTE ARQUIVO EXISTE
// O defeito é de banco: `aplicarTransferenciaEntreEmpresas` não toca em
// rh.escala_colaborador. Teste puro não alcança — só rodando o ATO de verdade
// contra uma bancada as duas escalas aparecem: a do vínculo que morre fica com
// fim_vigencia NULL para sempre, e o vínculo que nasce fica sem nenhuma.
//
// Ele chama o SERVIÇO, não o SQL: criar a movimentação, o líder decide, a
// diretoria decide — e é a aprovação final que aplica o efeito, porque a data
// pretendida é hoje. Nenhum atalho: as mesmas travas de permissão e de cadeia.
//
// Uso (o serviço tem de estar compilado antes):
//   npx tsc -p tsconfig.prova-escala.json
//   node --env-file=.env.local-db db/prova-escala-transferencia.js --banco fast_pessoas_i_escala
const path = require('path');
const {
  lerArgumentos,
  resolverConexao,
  exigirLocal,
  abrir,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const RAIZ = path.join(__dirname, '..');

const { bandeiras } = lerArgumentos(process.argv.slice(2));
ajudaSePedida(
  bandeiras,
  `
prova-escala-transferencia.js — transfere alguém de CNPJ pelo serviço de verdade
e mostra as escalas do vínculo velho e do novo, antes e depois.

  node --env-file=.env.local-db db/prova-escala-transferencia.js --banco fast_pessoas_i_escala
`
);
const conexao = resolverConexao(bandeiras);
exigirLocal(conexao, 'a prova ESCREVE: transfere alguém de empresa.');

// O serviço abre a própria conexão por DATABASE_URL: aponta para a bancada.
process.env.DATABASE_URL = conexao.url;

const SESSAO_DP = { usuario_id: 5, papel: 'dp', nome: 'Patrícia Nogueira Lima' };
const SESSAO_LIDER = { usuario_id: 2, papel: 'gestor', nome: 'Marcos Vieira Salles' };
const SESSAO_DIRETORIA = {
  usuario_id: 1,
  papel: 'diretoria',
  nome: 'Helena Marques Andrade',
};

// Hugo Machado Falcão (vínculo 16, matrícula 1020, Supply) → DCS. Ele tem
// escala vigente COM âncora, que é o caso que mais dói: sem a âncora o motor
// não sabe se a terça era plantão ou folga (0034).
const ALVO = 16;
const EMPRESA_DESTINO = 6; // DCS
const ESTABELECIMENTO_DESTINO = 2; // Filial Norte
const CENTRO_CUSTO_DESTINO = 3; // CC-2000, mantido pela DCS
const MATRICULA_DESTINO = '9020';
const GESTOR_DESTINO = 21; // Igor Soares Guimarães, ativo e registrado na DCS

const SQL_ESCALAS = `
  SELECT e.id AS escala_id, e.colaborador_id, c.matricula,
         e.jornada_versao_id,
         e.inicio_vigencia::text AS inicio,
         coalesce(e.fim_vigencia::text, 'ABERTA') AS fim,
         coalesce(e.ancora_escala::text, '—') AS ancora
    FROM rh.escala_colaborador e
    JOIN rh.colaborador c ON c.id = e.colaborador_id
   WHERE e.colaborador_id = ANY($1::bigint[])
   ORDER BY e.colaborador_id, e.inicio_vigencia`;

function imprimir(titulo, linhas) {
  console.log(`\n── ${titulo}`);
  if (linhas.length === 0) {
    console.log('  (nenhuma linha)');
    return;
  }
  for (const l of linhas) {
    console.log(
      `  escala ${String(l.escala_id).padStart(3)} · vínculo ${String(l.colaborador_id).padStart(3)}` +
        ` (matrícula ${l.matricula}) · jornada ${l.jornada_versao_id}` +
        ` · ${l.inicio} → ${l.fim} · âncora ${l.ancora}`
    );
  }
}

async function principal() {
  const pool = await abrir(conexao);
  const servico = require(
    path.join(RAIZ, '.tmp-prova-escala', 'dominios', 'demandas', 'servico.js')
  );

  const antes = await pool.query(SQL_ESCALAS, [[ALVO]]);
  imprimir(`ANTES — escalas do vínculo ${ALVO}`, antes.rows);

  const cartao = await servico.criarMovimentacao(SESSAO_DP, {
    tipo: 'transferencia_empresa',
    colaborador_id: ALVO,
    estabelecimento_destino_id: ESTABELECIMENTO_DESTINO,
    centro_custo_destino_id: CENTRO_CUSTO_DESTINO,
    empresa_destino_id: EMPRESA_DESTINO,
    matricula_destino: MATRICULA_DESTINO,
    gestor_destino_colaborador_id: GESTOR_DESTINO,
    data_pretendida: (await pool.query('SELECT rh.hoje()::text AS hoje')).rows[0].hoje,
    justificativa:
      'Prova da frente: a escala de ponto tem de acompanhar a transferência entre CNPJs.',
  });
  console.log(`\npedido aberto: demanda ${cartao.demanda_id}`);

  await servico.decidirEtapaMovimentacao(SESSAO_LIDER, cartao.demanda_id, {
    decisao: 'aprovar',
  });
  console.log('nível 1 (líder) aprovado');
  await servico.decidirEtapaMovimentacao(SESSAO_DIRETORIA, cartao.demanda_id, {
    decisao: 'aprovar',
  });
  console.log('nível 2 (diretoria) aprovado — efeito aplicado');

  const { rows: novos } = await pool.query(
    `SELECT id FROM rh.colaborador WHERE sucede_vinculo_id = $1`,
    [ALVO]
  );
  const novoId = novos[0] ? Number(novos[0].id) : null;
  console.log(`vínculo novo: ${novoId ?? '(nenhum)'}`);

  const depois = await pool.query(SQL_ESCALAS, [[ALVO, novoId ?? ALVO]]);
  imprimir(`DEPOIS — escalas dos vínculos ${ALVO} e ${novoId}`, depois.rows);

  const velhaAberta = depois.rows.filter(
    (l) => Number(l.colaborador_id) === ALVO && l.fim === 'ABERTA'
  ).length;
  const novaAberta = depois.rows.filter(
    (l) => Number(l.colaborador_id) === novoId && l.fim === 'ABERTA'
  ).length;
  console.log(
    `\nVEREDITO · escala ABERTA no vínculo velho: ${velhaAberta} (esperado 0)` +
      ` · escala ABERTA no vínculo novo: ${novaAberta} (esperado 1)`
  );
  await pool.end();
  process.exit(velhaAberta === 0 && novaAberta === 1 ? 0 : 1);
}

principal().catch((erro) => morrer(erro.stack || String(erro)));
