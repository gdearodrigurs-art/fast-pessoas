// db/bancada.js — um banco por frente de trabalho.
//
// Existe porque três vezes nesta sessão um agente escreveu no banco enquanto outro
// media, e uma dessas invalidou uma medição inteira: o relatório registrou que "o total
// de vínculos MUDOU durante a verificação (71 -> 72 -> 73)". Banco compartilhado
// transforma medida em palpite. A saída é um banco por frente.
//
// Quem cria tem que saber destruir. Construir o `criar` sem o `destruir` repetiria o
// erro que este arquivo existe para corrigir — dois worktrees ficaram abandonados, um
// deles de 33 MB, porque ninguém tinha o comando de desfazer na mão.
//
// Uso:
//   node --env-file=.env.local-db db/bancada.js criar j_b          --banco postgres
//   node --env-file=.env.local-db db/bancada.js listar             --banco postgres
//   node --env-file=.env.local-db db/bancada.js destruir j_b --sim --banco postgres
//   node --env-file=.env.local-db db/bancada.js orfaos             --banco postgres
//
// O --banco aqui é o de MANUTENÇÃO (postgres): não se cria nem se apaga um banco
// estando conectado nele.
const path = require('path');
const { spawnSync } = require('child_process');
const {
  lerArgumentos,
  resolverConexao,
  exigirLocal,
  comBanco,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const RAIZ = path.join(__dirname, '..');
const PREFIXO = 'fast_pessoas_';

// O banco de trabalho compartilhado. Não é bancada de ninguém, então não é órfão nem
// destrutível por aqui — quem quiser refazê-lo usa o caminho normal, na mão.
const COMPARTILHADO = 'fast_pessoas_dev';

// Orçamento do ponto 2 do arnês. Não é limite, é referência: se o medido descolar muito
// disto, a decisão de desenho ("um banco por frente sai barato") muda junto. Por isso o
// número aparece ao lado do medido em vez de ficar num documento que ninguém reabre.
const ORCADO = { migracoes: 2.7, semeador: 5.0 };

const AJUDA = `
bancada.js — um banco por frente de trabalho, criado e descartado por quem usa.

  node --env-file=.env.local-db db/bancada.js criar j_b          --banco postgres
  node --env-file=.env.local-db db/bancada.js listar             --banco postgres
  node --env-file=.env.local-db db/bancada.js destruir j_b --sim --banco postgres
  node --env-file=.env.local-db db/bancada.js orfaos             --banco postgres

Subcomandos
  criar <nome>      cria fast_pessoas_<nome>, roda db/migrar.js e db/semear-demo.js
                    nele e imprime o tempo de cada passo. Banco que já existe não é
                    recriado — a ferramenta diz e para.
  listar            os fast_pessoas_* do servidor: tamanho, conexões abertas,
                    quantas migrations e quando a primeira foi aplicada.
  destruir <nome>   apaga. Exige --sim e recusa sempre ${COMPARTILHADO}.
                    Derruba as conexões abertas antes, senão o Postgres recusa.
  orfaos            bancada cujo nome não casa com nenhuma branch git. Só aponta.

Bandeiras
  --banco <nome>    obrigatório: o banco de MANUTENÇÃO (postgres). Sem valor padrão.
  --sim             confirmação explícita do destruir.
  --portao          no orfaos: sai 1 se houver candidata, para uso em portão.

O --env-file dá host, usuário e senha; o --banco dá o nome do banco. Todo subcomando
recusa servidor que não seja local: criar e apagar banco no Supabase nunca é o que se
quis fazer.
`;

/**
 * Traduz o nome curto da frente ("j_b") no nome do banco ("fast_pessoas_j_b").
 * Aceita o nome completo também, porque é ele que aparece na saída do `listar` e é
 * de lá que a pessoa copia — sem isto viraria "fast_pessoas_fast_pessoas_j_b".
 */
function nomeDoBanco(nome) {
  if (!nome || nome === true) {
    throw new Error(
      'Falta o nome da bancada.\n' +
        '  Ex.: node --env-file=.env.local-db db/bancada.js criar j_b --banco postgres'
    );
  }
  const curto = nome.startsWith(PREFIXO) ? nome.slice(PREFIXO.length) : nome;
  if (!/^[a-z0-9_]+$/.test(curto)) {
    throw new Error(
      `Nome de bancada inválido: "${nome}". Só minúscula, número e sublinhado — ` +
        'vira nome de banco, não caminho nem SQL.'
    );
  }
  return PREFIXO + curto;
}

// CREATE e DROP DATABASE não aceitam parâmetro: nome de banco é identificador, não
// valor. O que torna a interpolação segura aqui é o regex acima, e só ele — todo
// resto neste arquivo vai por $1.
function identificador(nome) {
  if (!new RegExp(`^${PREFIXO}[a-z0-9_]+$`).test(nome)) {
    throw new Error(`Recusado por segurança: "${nome}" não passou na validação de nome.`);
  }
  return `"${nome}"`;
}

function segundos(desde) {
  return (Date.now() - desde) / 1000;
}

function dataCurta(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Os fast_pessoas_* do servidor, com tamanho e conexões abertas.
 * O tamanho só é lido de quem deixa entrar: pg_database_size explode em banco onde o
 * papel não tem CONNECT, e uma listagem que morre por causa de um banco alheio é pior
 * que uma listagem com um traço na coluna.
 */
async function bancosDoServidor(cliente) {
  const { rows } = await cliente.query(
    `SELECT d.datname AS nome,
            pg_get_userbyid(d.datdba) AS dono,
            CASE WHEN has_database_privilege(d.oid, 'CONNECT')
                 THEN pg_database_size(d.oid) END AS bytes,
            (SELECT count(*) FROM pg_stat_activity a WHERE a.datname = d.datname) AS conexoes
       FROM pg_database d
      -- ESCAPE porque o sublinhado é curinga no LIKE: sem isto "fast_pessoas_%"
      -- casaria com qualquer coisa no lugar dos dois sublinhados.
      WHERE d.datname LIKE $1 ESCAPE '\\'
      ORDER BY d.datname`,
    [PREFIXO.replace(/_/g, '\\_') + '%']
  );
  return rows;
}

/**
 * Idade da bancada. O Postgres não guarda data de criação de banco em canto nenhum do
 * catálogo, e a única leitura exata — pg_stat_file no diretório do banco — exige
 * pg_read_server_files, que o papel da aplicação não tem. O que dá para saber é a
 * primeira migration aplicada: numa bancada isso é a criação, com segundos de
 * diferença, e de quebra revela banco criado e nunca migrado.
 */
async function historico(nomeBanco) {
  const alvo = resolverConexao({ banco: nomeBanco });
  try {
    return await comBanco(alvo, async (c) => {
      const { rows } = await c.query(
        'SELECT count(*)::int AS migrations, min(aplicada_em) AS primeira FROM public.migracao_aplicada'
      );
      return rows[0];
    });
  } catch {
    // Banco sem a tabela (criado e não migrado) ou sem CONNECT. Não é erro da listagem.
    return { migrations: null, primeira: null };
  }
}

/**
 * Roda um script existente de db/ contra o banco novo. Reaproveitar em vez de
 * reimplementar: migrar.js e semear-demo.js leem DATABASE_URL do ambiente, então basta
 * trocar essa variável no filho. A saída deles vai direto para a tela — quem cria uma
 * bancada precisa ver a migration que falhou, não um "erro ao criar".
 */
function rodarScript(script, url, rotulo) {
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  const levou = segundos(inicio);
  if (r.error) throw new Error(`${rotulo} não executou: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${rotulo} falhou (saída ${r.status}).`);
  return levou;
}

function linhaDeTempo(rotulo, medido, orcado) {
  const conta = `${medido.toFixed(1)}s`.padStart(7);
  return `  ${rotulo.padEnd(11)}${conta}   (orçado ${orcado.toFixed(1)}s)`;
}

// --------------------------------------------------------------------------- criar
async function criar(bandeiras, nome) {
  const manutencao = resolverConexao(bandeiras);
  exigirLocal(
    manutencao,
    'Bancada é banco descartável da sua máquina. O remoto é base de apresentação.'
  );
  const alvo = nomeDoBanco(nome);
  if (alvo === manutencao.banco) {
    throw new Error(
      `Não dá para criar "${alvo}" estando conectado nele. Use --banco postgres.`
    );
  }

  const existia = await comBanco(manutencao, async (c) => {
    const { rows } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [alvo]);
    if (rows.length) return true;
    // Conferir o atributo antes de tentar: o erro cru do Postgres é "permissão negada
    // ao criar banco de dados", que não diz a quem falta o quê nem o que fazer.
    const { rows: papel } = await c.query(
      'SELECT rolname, rolcreatedb OR rolsuper AS pode FROM pg_roles WHERE rolname = current_user'
    );
    if (!papel[0] || !papel[0].pode) {
      throw new Error(
        `Recusado: o papel "${papel[0] ? papel[0].rolname : '?'}" não pode criar banco neste servidor.\n` +
          '  Bancada precisa de um usuário com CREATEDB. Duas saídas:\n' +
          '    · rode com um --env-file cujo usuário já tenha CREATEDB; ou\n' +
          `    · uma vez, como superusuário: ALTER ROLE ${papel[0] ? papel[0].rolname : '<papel>'} CREATEDB;\n` +
          '  O mesmo atributo vale para o destruir — só o dono do banco apaga.'
      );
    }
    const inicio = Date.now();
    await c.query(`CREATE DATABASE ${identificador(alvo)}`);
    console.log(`banco ${alvo} criado em ${segundos(inicio).toFixed(1)}s.\n`);
    return false;
  });

  if (existia) {
    // Recriar por baixo de quem está usando é a contaminação que esta ferramenta
    // existe para acabar. Diz e para.
    console.log(`${alvo} já existe — não recrio.`);
    if (alvo === COMPARTILHADO) {
      // Não mandar destruir o que o destruir recusa: dica que a própria ferramenta
      // nega é pior que dica nenhuma.
      console.log('  É o banco de trabalho compartilhado. Bancada é outra coisa —');
      console.log('  escolha um nome de frente, ex.: criar j_b');
    } else {
      console.log('  Para começar do zero, destrua antes:');
      console.log(
        `    node --env-file=… db/bancada.js destruir ${alvo} --sim --banco ${manutencao.banco}`
      );
    }
    return;
  }

  const conexaoAlvo = resolverConexao({ banco: alvo });
  let migracoes;
  let semeadura;
  try {
    migracoes = rodarScript('migrar.js', conexaoAlvo.url, 'migrar.js');
    semeadura = rodarScript('semear-demo.js', conexaoAlvo.url, 'semear-demo.js');
  } catch (erro) {
    // O banco ficou de pé e incompleto. Apagar aqui esconderia o erro justo de quem
    // precisa lê-lo; o que falta é a linha de comando para desfazer, e ela vai junto.
    throw new Error(
      `${erro.message}\n` +
        `  O banco ${alvo} ficou criado e incompleto. Para desfazer:\n` +
        `    node --env-file=… db/bancada.js destruir ${alvo} --sim --banco ${manutencao.banco}`
    );
  }

  console.log(`\nbancada ${alvo} pronta.`);
  console.log(linhaDeTempo('migrations', migracoes, ORCADO.migracoes));
  console.log(linhaDeTempo('semeador', semeadura, ORCADO.semeador));
  console.log(`\nUse com:  node --env-file=… db/consultar.js "SELECT 1" --banco ${alvo}`);
}

// -------------------------------------------------------------------------- listar
async function listar(bandeiras) {
  const manutencao = resolverConexao(bandeiras);
  exigirLocal(manutencao, 'A lista de bancadas é da sua máquina.');

  const bancos = await comBanco(manutencao, bancosDoServidor);
  if (!bancos.length) {
    console.log(`Nenhum banco ${PREFIXO}* em ${manutencao.host}:${manutencao.porta}.`);
    return;
  }

  console.log(
    'banco'.padEnd(28) + 'MB'.padStart(7) + 'conex'.padStart(7) + '  migr  primeira migration'
  );
  for (const b of bancos) {
    const h = await historico(b.nome);
    const mb = b.bytes === null ? '—' : (Number(b.bytes) / 1024 / 1024).toFixed(0);
    const migr = h.migrations === null ? '—' : String(h.migrations);
    const marca = b.nome === COMPARTILHADO ? '   (compartilhado)' : '';
    console.log(
      b.nome.padEnd(28) +
        mb.padStart(7) +
        String(b.conexoes).padStart(7) +
        migr.padStart(6) +
        '  ' +
        dataCurta(h.primeira) +
        marca
    );
  }
  console.log(`\n${bancos.length} banco(s) em ${manutencao.host}:${manutencao.porta}.`);
}

// ------------------------------------------------------------------------ destruir
async function destruir(bandeiras, nome) {
  const manutencao = resolverConexao(bandeiras);
  exigirLocal(manutencao, 'Apagar banco fora da sua máquina nunca é o que se quis fazer.');
  const alvo = nomeDoBanco(nome);

  // A recusa do compartilhado vem ANTES da confirmação, de propósito: `destruir dev
  // --sim` tem que ser recusado pelo motivo certo, não por falta de bandeira.
  if (alvo === COMPARTILHADO) {
    throw new Error(
      `Recusado: ${COMPARTILHADO} é o banco de trabalho compartilhado, não é bancada de ninguém.\n` +
        '  Bancada é o que esta ferramenta cria e descarta. Este não passou por aqui.'
    );
  }
  if (alvo === manutencao.banco) {
    throw new Error(`Não dá para apagar "${alvo}" estando conectado nele. Use --banco postgres.`);
  }
  if (!bandeiras.sim) {
    throw new Error(
      `Recusado: apagar ${alvo} é irreversível.\n` +
        '  Se é isso mesmo, repita o comando com --sim.'
    );
  }

  await comBanco(manutencao, async (c) => {
    const { rows } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [alvo]);
    if (!rows.length) {
      throw new Error(
        `${alvo} não existe.\n` +
          `  Veja o que existe: node --env-file=… db/bancada.js listar --banco ${manutencao.banco}`
      );
    }
    // O Postgres recusa DROP com sessão aberta, e a sessão aberta costuma ser um
    // `next dev` esquecido — quem apaga uma bancada já decidiu que ela acabou.
    const derrubadas = await c.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [alvo]
    );
    if (derrubadas.rowCount) console.log(`${derrubadas.rowCount} conexão(ões) derrubada(s).`);
    await c.query(`DROP DATABASE ${identificador(alvo)}`);
    console.log(`${alvo} apagado.`);
  });
}

// -------------------------------------------------------------------------- orfaos
function branchesDoGit() {
  const r = spawnSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
    cwd: RAIZ,
    encoding: 'utf8',
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * As chaves com que uma branch reivindica bancadas. "onda-i" reivindica "i_2" e "i_b"
 * porque o nome combinado é fast_pessoas_<onda>_<frente> — o que amarra as duas pontas
 * é o nome da onda, não a branch inteira.
 */
function chavesDaBranch(branch) {
  const base = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const chaves = new Set([base]);
  if (base.startsWith('onda_')) chaves.add(base.slice('onda_'.length));
  return [...chaves].filter(Boolean);
}

function temDono(curto, chaves) {
  return chaves.some((k) => curto === k || curto.startsWith(`${k}_`));
}

async function orfaos(bandeiras) {
  const manutencao = resolverConexao(bandeiras);
  exigirLocal(manutencao, 'A varredura de órfãs é da sua máquina.');

  const branches = branchesDoGit();
  if (!branches) {
    throw new Error(
      'git não respondeu em ' + RAIZ + '.\n' +
        '  Sem a lista de branches não dá para dizer o que é órfão, e chutar aqui\n' +
        '  significa apontar para o banco de alguém que está trabalhando.'
    );
  }
  const chaves = branches.flatMap(chavesDaBranch);
  const bancos = await comBanco(manutencao, bancosDoServidor);

  const candidatas = [];
  console.log(`${branches.length} branch(es): ${branches.join(', ')}\n`);
  for (const b of bancos) {
    const curto = b.nome.slice(PREFIXO.length);
    const mb = b.bytes === null ? '—' : (Number(b.bytes) / 1024 / 1024).toFixed(0);
    if (b.nome === COMPARTILHADO) {
      console.log(`  ${b.nome.padEnd(28)}${mb.padStart(6)} MB  compartilhado, não é bancada`);
      continue;
    }
    if (temDono(curto, chaves)) {
      console.log(`  ${b.nome.padEnd(28)}${mb.padStart(6)} MB  tem branch`);
      continue;
    }
    candidatas.push(b);
    console.log(`  ${b.nome.padEnd(28)}${mb.padStart(6)} MB  ÓRFÃ — nenhuma branch "${curto}"`);
  }

  if (!candidatas.length) {
    console.log('\nNenhuma órfã.');
    return;
  }
  // Só aponta. Quem detecta não decide: a bancada pode ser de uma branch que ainda não
  // existe, ou de um agente rodando agora.
  console.log(`\n${candidatas.length} candidata(s) a lixo. Não apago nenhuma — se for lixo mesmo:`);
  for (const c of candidatas) {
    console.log(
      `  node --env-file=… db/bancada.js destruir ${c.nome} --sim --banco ${manutencao.banco}`
    );
  }
  if (bandeiras.portao) process.exitCode = 1;
}

// ----------------------------------------------------------------------------- main
async function main() {
  const { livres, bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  const [sub, nome] = livres;
  switch (sub) {
    case 'criar':
      return criar(bandeiras, nome);
    case 'listar':
      return listar(bandeiras);
    case 'destruir':
      return destruir(bandeiras, nome);
    case 'orfaos':
      return orfaos(bandeiras);
    case undefined:
      throw new Error('Falta o subcomando: criar, listar, destruir ou orfaos. Veja --help.');
    default:
      throw new Error(`Subcomando desconhecido: "${sub}". São quatro: criar, listar, destruir, orfaos.`);
  }
}

main().catch(morrer);
