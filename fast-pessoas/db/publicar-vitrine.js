// db/publicar-vitrine.js — prepara a VITRINE pública (projeto Vercel fast-pessoas-demo).
//
//   node --env-file=.env db/publicar-vitrine.js
//
// Roda na máquina do dono, com o .env do Supabase de apresentação:
//   1. aplica as migrations pendentes no Supabase (db/migrar.js);
//   2. repovoa os dados 100% fictícios da demo (db/semear-demo.js) — é também o
//      "reset" depois que a visita mexer;
//   3. copia DATABASE_URL, CHAVE_CIFRA_SAUDE e ANTHROPIC_API_KEY do .env para as
//      variáveis do projeto na Vercel (via `vercel api`, já logado nesta máquina).
//
// Só os passos 1 e 2: --so-banco. Só o passo 3: --so-vercel.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TIME = 'team_k3rCxXI6jpRx4WXZcAuFSb4b';
const PROJETO = 'fast-pessoas-demo';
const SO_BANCO = process.argv.includes('--so-banco');
const SO_VERCEL = process.argv.includes('--so-vercel');

// Sem shell: o caminho "C:\sistema RH" tem espaço e o shell o partia em dois.
function rodarNode(rotulo, script) {
  console.log(`\n== ${rotulo}`);
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`\nFalhou em: ${rotulo}. Nada depois disso foi feito.`);
    process.exit(1);
  }
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('supabase')) {
  console.error('Rode com --env-file=.env (o do Supabase de apresentação).');
  process.exit(1);
}

if (!SO_VERCEL) {
  rodarNode('1/3 migrations no Supabase', path.join(__dirname, 'migrar.js'));
  rodarNode('2/3 dados fictícios da demo', path.join(__dirname, 'semear-demo.js'));
}
if (SO_BANCO) process.exit(0);

console.log('\n== 3/3 variáveis na Vercel');
let falhas = 0;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-'));
try {
  for (const chave of ['DATABASE_URL', 'CHAVE_CIFRA_SAUDE', 'ANTHROPIC_API_KEY']) {
    const valor = process.env[chave];
    if (!valor) {
      console.log(`  ${chave}: ausente no .env — pulei`);
      continue;
    }
    const arquivo = path.join(temp, `${chave}.json`);
    fs.writeFileSync(
      arquivo,
      JSON.stringify({ key: chave, value: valor, type: 'sensitive', target: ['production', 'preview'] })
    );
    // Com shell (o vercel do Windows é um .cmd), o "&" da URL separava comandos
    // no cmd e a gravação sumia calada — por isso a URL vai ENTRE ASPAS e o
    // sucesso só conta se a resposta trouxer a chave gravada.
    const r = spawnSync(
      'vercel',
      ['api', `"/v10/projects/${PROJETO}/env?teamId=${TIME}&upsert=true"`, '--method', 'POST', '--input', `"${arquivo}"`],
      { encoding: 'utf8', shell: process.platform === 'win32' }
    );
    const gravou = r.status === 0 && (r.stdout || '').includes(`"${chave}"`);
    if (!gravou) falhas++;
    console.log(`  ${chave}: ${gravou ? 'ok' : 'FALHOU\n' + (r.stdout || '') + (r.stderr || '')}`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
if (falhas > 0) {
  console.error(`\n${falhas} variável(is) NÃO gravada(s) na Vercel — veja acima.`);
  process.exit(1);
}
console.log('\nPronto. Avise o Claude para disparar o deploy.');
