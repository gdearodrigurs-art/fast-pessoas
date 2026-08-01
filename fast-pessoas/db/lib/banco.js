// db/lib/banco.js — o contrato de conexão de TODA ferramenta do arnês.
//
// Existe por um motivo só: se cada ferramenta resolver "em qual banco eu falo?" do seu
// jeito, o arnês reproduz dentro de si o problema que ele foi criado para resolver —
// cada verificador reimplementando a mesma coisa, cada um errando diferente.
//
// ------------------------------------------------------------------ o contrato
//
//   node --env-file=<arquivo> db/<ferramenta>.js <args> --banco <nome>
//
// O ARQUIVO DE AMBIENTE dá host, usuário e senha. A BANDEIRA dá o nome do banco.
// A ferramenta troca só o nome na URL e mantém o resto.
//
// Por que assim, e não por variável de ambiente: variável não sobrevive entre duas
// chamadas do mesmo agente — cada Bash é um processo novo. O nome da bancada vive no
// prompt da frente, que é a única memória que atravessa as chamadas dele. E `--banco`
// nunca tem valor padrão: ferramenta que adivinha banco escreve no lugar errado uma vez
// só, e é a única vez que importa.
//
// Exemplos:
//   node --env-file=.env.local-db db/consultar.js "SELECT 1" --banco fast_pessoas_dev
//   node --env-file=.env.local-db db/consultar.js "SELECT 1" --banco fast_pessoas_j_b
//   node --env-file=.env db/migracoes.js conferir --banco postgres --permitir-remoto
const { Client } = require('pg');

const LOCAIS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Lê as bandeiras de uma linha de comando, sem depender de biblioteca.
 * Devolve { livres: [...], bandeiras: { nome: valor|true } }.
 * `--banco x` vira bandeiras.banco = 'x'; `--json` vira bandeiras.json = true.
 */
function lerArgumentos(argv) {
  const livres = [];
  const bandeiras = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      livres.push(a);
      continue;
    }
    const nome = a.slice(2);
    const proximo = argv[i + 1];
    if (proximo !== undefined && !proximo.startsWith('--')) {
      bandeiras[nome] = proximo;
      i++;
    } else {
      bandeiras[nome] = true;
    }
  }
  return { livres, bandeiras };
}

/**
 * Resolve a conexão a partir do ambiente + da bandeira --banco.
 * Recusa em vez de adivinhar. Devolve { url, host, porta, banco, ehLocal }.
 */
function resolverConexao(bandeiras) {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL ausente.\n' +
        '  O arquivo de ambiente dá host, usuário e senha:\n' +
        '    node --env-file=.env.local-db db/<ferramenta>.js … --banco <nome>\n' +
        '  Nunca leia o .env por conta própria — use --env-file.'
    );
  }
  const nome = bandeiras.banco;
  if (!nome || nome === true) {
    throw new Error(
      'Falta --banco <nome>.\n' +
        '  A bandeira diz em QUAL banco falar; o --env-file diz em qual servidor.\n' +
        '  Não existe valor padrão de propósito: ferramenta que adivinha banco escreve\n' +
        '  no lugar errado uma vez só, e é a única vez que importa.\n' +
        '  Veja os que existem com: node --env-file=… db/bancada.js listar --banco postgres'
    );
  }
  if (!/^[a-z0-9_]+$/.test(nome)) {
    throw new Error(
      `Nome de banco inválido: "${nome}". Só minúscula, número e sublinhado — ` +
        'é nome de banco, não caminho nem SQL.'
    );
  }

  // A URL do ambiente vira o molde: host, porta e credencial ficam, o banco troca.
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${nome}`;
  const host = url.hostname;

  return {
    url: url.toString(),
    host,
    porta: url.port || '5432',
    banco: nome,
    ehLocal: LOCAIS.has(host),
  };
}

/**
 * Trava para ferramenta que NUNCA deve tocar em banco remoto.
 * O remoto (Supabase) é base de apresentação: só o ato de fechamento escreve nele.
 */
function exigirLocal(conexao, motivo) {
  if (conexao.ehLocal) return;
  throw new Error(
    `Recusado: ${conexao.host} não é local.\n` +
      `  ${motivo}\n` +
      '  Rode com --env-file=.env.local-db, ou use a bancada da sua frente.'
  );
}

/**
 * Deixa passar remoto SÓ com --permitir-remoto declarado na linha de comando.
 * É declaração de intenção, não segredo: quem contorna escolheu contornar, em vez de
 * tropeçar sem perceber.
 */
function exigirLocalOuPermissao(conexao, bandeiras, motivo) {
  if (conexao.ehLocal) return;
  if (bandeiras['permitir-remoto']) return;
  throw new Error(
    `Recusado: ${conexao.host} não é local.\n` +
      `  ${motivo}\n` +
      '  Se é isso mesmo, repita o comando com --permitir-remoto.'
  );
}

/** Abre um Client conectado. Quem chama fecha (use com try/finally). */
async function abrir(conexao) {
  const cliente = new Client({ connectionString: conexao.url });
  await cliente.connect();
  return cliente;
}

/** Abre, roda, fecha — para o caso comum de uma consulta só. */
async function comBanco(conexao, fn) {
  const cliente = await abrir(conexao);
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

/**
 * Convenção de --help de TODA ferramenta: se pedirem ajuda, imprime e sai 0.
 * Chamar no começo, antes de validar qualquer coisa — ajuda que exige argumento
 * correto para aparecer não é ajuda.
 */
function ajudaSePedida(bandeiras, texto) {
  if (bandeiras.help || bandeiras.ajuda || bandeiras.h) {
    console.log(texto.trim());
    process.exit(0);
  }
}

/** Erro de ferramenta: mensagem limpa e saída 1, sem pilha de chamada. */
function morrer(erro) {
  console.error(String(erro.message || erro));
  process.exit(1);
}

module.exports = {
  lerArgumentos,
  resolverConexao,
  exigirLocal,
  exigirLocalOuPermissao,
  abrir,
  comBanco,
  ajudaSePedida,
  morrer,
};
