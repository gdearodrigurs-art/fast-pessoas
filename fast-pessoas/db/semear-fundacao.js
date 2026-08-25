// db/semear-fundacao.js — a FUNDAÇÃO de um banco de produção VAZIO, sem escrever SQL.
//
//   node --env-file=.env.local-db db/semear-fundacao.js --banco fast_pessoas_prod
//
// O problema que resolve: um banco recém-migrado abre as telas, mas o DP não
// consegue COMEÇAR por elas — a carga inicial por planilha (tela de estrutura/
// cargos, chave sistema.carga.importar) exige alguém logado, o seed-admin exige
// o banco de pé, e telas como a de admissão precisam de pelo menos uma empresa,
// uma unidade e um centro de custo para oferecer opção. Esta ferramenta planta
// esse mínimo, com nomes explicitamente de EXEMPLO (renomeáveis pela tela de
// estrutura), e confere o que as migrations já deveriam ter semeado.
//
// A ordem de um ambiente novo (ver MIGRACAO.md, seção "ambiente vazio"):
//   1. db/migrar.js            — o schema inteiro + catálogos semeados por migration
//   2. db/semear-fundacao.js   — ESTA ferramenta (o mínimo para as telas servirem)
//   3. db/seed-admin.js        — a primeira conta (admin) do dono
//   4. carga pela tela         — estrutura e cargos por planilha, já logado
//
// O que ela cria (tudo IDEMPOTENTE: o que já existe conta como "já existia" e
// nada é duplicado — rodar duas vezes deixa o banco igual):
//   • 1 empresa do grupo de exemplo (sem CNPJ — a 0047 permite, e é honesto:
//     o cadastro real entra pela carga ou pela tela), com versão vigente;
//   • 1 estabelecimento (unidade/lotação) de exemplo, com versão vigente;
//   • 1 centro de custo de exemplo na empresa acima, com versão vigente.
//
// O que ela CONFERE (e recusa se faltar, apontando a causa):
//   • o modelo de avaliação GERAL com versão ATIVA (cargo_id IS NULL) — ele é
//     semeado pelas migrations 0011/0030; se não está aqui, o migrar.js não
//     rodou até o fim, e criá-lo por fora esconderia isso.
//
// O que ela NÃO faz, de propósito:
//   • não cria usuário (decisão F2:b — acesso nasce um a um, pelo seed-admin e
//     depois pela aplicação);
//   • não escreve em audit.alteracao — ela roda ANTES do primeiro usuário
//     existir, e a trilha exige autor; o rastro é a saída impressa + o commit
//     do go-live;
//   • não toca em NADA da demonstração (db/semear-demo.js é outro mundo:
//     zera e repopula; esta ferramenta só acrescenta o mínimo e para).

const {
  lerArgumentos,
  resolverConexao,
  exigirLocalOuPermissao,
  abrir,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');
const { hoje, iso } = require('./semear/comum');

const AJUDA = `
db/semear-fundacao.js — fundação de um banco de produção vazio (pós-migrations)

Uso:
  node --env-file=.env.local-db db/semear-fundacao.js --banco <nome>
  node --env-file=.env db/semear-fundacao.js --banco <nome> --permitir-remoto

Cria (idempotente — o que já existe vira "já existia", nunca duplicata):
  1 empresa de exemplo + 1 estabelecimento + 1 centro de custo, com versão
  vigente a partir de hoje, nomes renomeáveis pela tela de estrutura.
Confere:
  o modelo de avaliação GERAL ativo (semeado pelas migrations 0011/0030).

Ordem do ambiente novo: migrar.js → semear-fundacao.js → seed-admin.js →
carga inicial pela tela (estrutura e cargos por planilha).
`;

const EMPRESA_EXEMPLO = 'Empresa Exemplo (renomear)';
const UNIDADE_EXEMPLO = 'Unidade Exemplo (renomear)';
const CC_CODIGO_EXEMPLO = 'CC-0001';
const CC_NOME_EXEMPLO = 'Centro de Custo Exemplo (renomear)';

async function contarLinhas(cliente, sql, parametros = []) {
  const { rows } = await cliente.query(sql, parametros);
  return Number(rows[0].total);
}

async function main() {
  const { bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);
  const conexao = resolverConexao(bandeiras);
  exigirLocalOuPermissao(
    conexao,
    bandeiras,
    'semear-fundacao ESCREVE no banco — em remoto, só com intenção declarada.'
  );

  const cliente = await abrir(conexao);
  try {
    // ---------------------------------------------------------- pré-condições
    const { rows: existe } = await cliente.query(
      "SELECT to_regclass('rh.empresa_grupo') AS estrutura, " +
        "to_regclass('rh.modelo_avaliacao_versao') AS avaliacao"
    );
    if (!existe[0].estrutura || !existe[0].avaliacao) {
      throw new Error(
        'O schema não está completo — rode as migrations antes:\n' +
          `  node --env-file=... db/migrar.js --banco ${conexao.banco}`
      );
    }

    // O modelo GERAL de avaliação (cargo_id IS NULL) é semeado por migration
    // (0011, reformulado na 0030). Conferimos em vez de criar: se ele falta, o
    // problema é migração pela metade, e plantar um por fora ESCONDERIA isso.
    const modelosGerais = await contarLinhas(
      cliente,
      `SELECT count(*)::int AS total FROM rh.modelo_avaliacao_versao
        WHERE status = 'ativa' AND cargo_id IS NULL`
    );
    if (modelosGerais === 0) {
      throw new Error(
        'Nenhuma versão ATIVA do modelo GERAL de avaliação — as migrations ' +
          '0011/0030 semeiam esse catálogo. Rode db/migrar.js até o fim e repita.'
      );
    }

    const dataDeHoje = iso(hoje());
    const resumo = [];

    await cliente.query('BEGIN');

    // ---------------------------------------------------------- empresa
    // Idempotência por EXISTÊNCIA DE QUALQUER empresa, não pelo nome de
    // exemplo: se o DP já criou (ou carregou) a estrutura real, a fundação não
    // tem mais nada a plantar aqui — plantar o exemplo ao lado só sujaria.
    let empresaId;
    const totalEmpresas = await contarLinhas(
      cliente,
      'SELECT count(*)::int AS total FROM rh.empresa_grupo'
    );
    if (totalEmpresas > 0) {
      const { rows } = await cliente.query(
        'SELECT id FROM rh.empresa_grupo ORDER BY id LIMIT 1'
      );
      empresaId = Number(rows[0].id);
      resumo.push(`empresa: já existia (${totalEmpresas}) — nada a criar`);
    } else {
      const { rows } = await cliente.query(
        'INSERT INTO rh.empresa_grupo (cnpj) VALUES (NULL) RETURNING id'
      );
      empresaId = Number(rows[0].id);
      await cliente.query(
        `INSERT INTO rh.empresa_grupo_versao
           (empresa_id, razao_social, nome_fantasia, tipo, status, inicio_vigencia)
         VALUES ($1, NULL, $2, 'matriz', 'ativa', $3)`,
        [empresaId, EMPRESA_EXEMPLO, dataDeHoje]
      );
      resumo.push(`empresa: criada "${EMPRESA_EXEMPLO}" (id ${empresaId}, sem CNPJ)`);
    }

    // ---------------------------------------------------------- estabelecimento
    const totalUnidades = await contarLinhas(
      cliente,
      'SELECT count(*)::int AS total FROM rh.estabelecimento'
    );
    if (totalUnidades > 0) {
      resumo.push(`estabelecimento: já existia (${totalUnidades}) — nada a criar`);
    } else {
      const { rows } = await cliente.query(
        'INSERT INTO rh.estabelecimento (cnpj) VALUES (NULL) RETURNING id'
      );
      await cliente.query(
        `INSERT INTO rh.estabelecimento_versao
           (estabelecimento_id, razao_social, unidade, endereco_resumido,
            status, inicio_vigencia)
         VALUES ($1, NULL, $2, NULL, 'ativa', $3)`,
        [Number(rows[0].id), UNIDADE_EXEMPLO, dataDeHoje]
      );
      resumo.push(`estabelecimento: criado "${UNIDADE_EXEMPLO}" (id ${rows[0].id})`);
    }

    // ---------------------------------------------------------- centro de custo
    const totalCentros = await contarLinhas(
      cliente,
      'SELECT count(*)::int AS total FROM rh.centro_custo'
    );
    if (totalCentros > 0) {
      resumo.push(`centro de custo: já existia (${totalCentros}) — nada a criar`);
    } else {
      const { rows } = await cliente.query(
        `INSERT INTO rh.centro_custo (empresa_id, codigo)
         VALUES ($1, $2) RETURNING id`,
        [empresaId, CC_CODIGO_EXEMPLO]
      );
      await cliente.query(
        `INSERT INTO rh.centro_custo_versao
           (centro_custo_id, nome, status, inicio_vigencia)
         VALUES ($1, $2, 'ativa', $3)`,
        [Number(rows[0].id), CC_NOME_EXEMPLO, dataDeHoje]
      );
      resumo.push(
        `centro de custo: criado ${CC_CODIGO_EXEMPLO} "${CC_NOME_EXEMPLO}" (id ${rows[0].id})`
      );
    }

    await cliente.query('COMMIT');

    console.log(`Fundação do banco ${conexao.banco} — ${dataDeHoje}`);
    for (const linha of resumo) console.log(`  • ${linha}`);
    console.log(`  • modelo de avaliação GERAL ativo: conferido (${modelosGerais})`);
    console.log('');
    console.log('Próximos passos:');
    console.log('  1. node --env-file=... db/seed-admin.js email "Nome Completo"');
    console.log('  2. logar como admin e importar estrutura e cargos por planilha');
    console.log('     (telas /estrutura e /cargos, chave sistema.carga.importar).');
  } catch (erro) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      /* sem transação aberta */
    }
    throw erro;
  } finally {
    await cliente.end();
  }
}

main().catch(morrer);
