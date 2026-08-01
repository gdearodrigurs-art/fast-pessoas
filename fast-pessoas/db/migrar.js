// Runner de migrations: aplica db/migrations/*.sql em ordem, uma transação por arquivo,
// registrando nome + hash em public.migracao_aplicada. Arquivo aplicado nunca muda —
// alteração de schema é sempre uma migration nova (expand/contract).
// Uso: node --env-file=.env db/migrar.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ausente. Copie .env.example para .env e preencha.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.migracao_aplicada (
      arquivo     TEXT PRIMARY KEY,
      hash_sha256 TEXT NOT NULL,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const aplicadas = new Map(
    (await client.query('SELECT arquivo, hash_sha256 FROM public.migracao_aplicada')).rows
      .map(r => [r.arquivo, r.hash_sha256])
  );

  const arquivos = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
  let novas = 0;

  for (const arquivo of arquivos) {
    // Fim de linha é normalizado ANTES do hash: checkout no Windows (autocrlf)
    // troca LF por CRLF e mudava o hash de 18 migrations já aplicadas sem trocar
    // um caractere de SQL — o guarda de imutabilidade disparava por espaço em
    // branco e travava o runner inteiro. O que é imutável é o CONTEÚDO.
    const sql = fs.readFileSync(path.join(DIR, arquivo), 'utf8').replace(/\r\n/g, '\n');
    const hash = crypto.createHash('sha256').update(sql).digest('hex');

    if (aplicadas.has(arquivo)) {
      if (aplicadas.get(arquivo) !== hash) {
        console.error(`ERRO: ${arquivo} foi alterado depois de aplicado. ` +
          'Migration aplicada é imutável — crie uma nova.');
        process.exit(1);
      }
      continue;
    }

    process.stdout.write(`aplicando ${arquivo} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql.replace(/^BEGIN;/m, '').replace(/COMMIT;\s*$/m, ''));
      await client.query(
        'INSERT INTO public.migracao_aplicada (arquivo, hash_sha256) VALUES ($1, $2)',
        [arquivo, hash]
      );
      await client.query('COMMIT');
      console.log('ok');
      novas++;
    } catch (erro) {
      await client.query('ROLLBACK');
      console.error(`FALHOU\n${erro.message}`);
      process.exit(1);
    }
  }

  console.log(novas ? `${novas} migration(s) aplicada(s).` : 'Nada a aplicar — banco em dia.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
