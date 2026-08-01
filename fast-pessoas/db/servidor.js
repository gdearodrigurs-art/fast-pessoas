// db/servidor.js — sobe o Next apontando para o banco LOCAL.
//
// Por que isto existe: `next dev` carrega o `.env` sozinho, e o `.env` aponta para o Supabase,
// que é base de APRESENTAÇÃO. Ou seja, o servidor de verificação falava com um banco e as
// ferramentas do arnês com outro — e elas são travadas em local sem escapatória. Sessão gerada
// pelo logar-como.js não valeria para o servidor. Hoje os dois bancos estão em sincronia (70
// pessoas dos dois lados) e o problema não aparece; assim que existir bancada por frente, ele
// aparece toda vez.
//
// Por que um lançador em vez de `node --env-file=… next`: o Node recusa `--env-file` quando ele
// chega por NODE_OPTIONS, que é como o lançador do editor injeta argumento. Aqui a variável é
// posta em process.env antes de o Next existir, e o Next respeita o que já está definido.
//
// Uso:
//   node db/servidor.js dev     (padrão)
//   node db/servidor.js start   (produção, exige build antes)
//   node db/servidor.js dev --porta 3002
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const AMBIENTE = path.join(RAIZ, '.env.local-db');

if (!fs.existsSync(AMBIENTE)) {
  console.error(
    `.env.local-db não existe em ${RAIZ}.\n` +
      '  É o arquivo com a conexão do PostgreSQL local. Sem ele o servidor cairia no .env, que\n' +
      '  aponta para o Supabase — e aí o servidor e as ferramentas falariam com bancos diferentes.'
  );
  process.exit(1);
}

// Leitura simples de KEY=valor: sem aspas, sem expansão, sem continuação de linha. O formato do
// arquivo é nosso e é assim; um leitor esperto aqui só criaria diferença com o --env-file do node.
for (const linha of fs.readFileSync(AMBIENTE, 'utf8').split(/\r?\n/)) {
  const limpa = linha.trim();
  if (!limpa || limpa.startsWith('#')) continue;
  const igual = limpa.indexOf('=');
  if (igual === -1) continue;
  process.env[limpa.slice(0, igual).trim()] = limpa.slice(igual + 1).trim();
}

const argv = process.argv.slice(2);
const modo = argv.find((a) => !a.startsWith('--')) || 'dev';
const iPorta = argv.indexOf('--porta');
const porta = iPorta !== -1 && argv[iPorta + 1] ? argv[iPorta + 1] : '3001';

if (!['dev', 'start'].includes(modo)) {
  console.error(`Modo desconhecido: "${modo}". Use dev ou start.`);
  process.exit(1);
}

const alvo = new URL(process.env.DATABASE_URL.replace(/^postgres(ql)?:/, 'http:'));
console.log(`servidor ${modo} na porta ${porta} · banco ${alvo.pathname.slice(1)}@${alvo.hostname}`);

const filho = spawn(
  process.execPath,
  [path.join(RAIZ, 'node_modules', 'next', 'dist', 'bin', 'next'), modo, '--port', porta],
  { cwd: RAIZ, stdio: 'inherit', env: process.env }
);
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
