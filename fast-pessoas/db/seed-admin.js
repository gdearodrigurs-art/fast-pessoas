// Cria o PRIMEIRO usuário admin com senha aleatória forte, impressa uma única vez.
// Recusa se já houver admin ativo — depois do primeiro, usuários nascem pela aplicação.
// Uso: node --env-file=.env db/seed-admin.js email "Nome Completo"
 
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function main() {
  const [email, nome] = process.argv.slice(2);
  if (!email || !nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Uso: node --env-file=.env db/seed-admin.js email "Nome Completo"');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ausente. Copie .env.example para .env e preencha.');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows: admins } = await client.query(
      "SELECT id, email FROM sistema.usuario WHERE papel = 'admin' AND ativo LIMIT 1"
    );
    if (admins.length > 0) {
      console.error(
        `Já existe admin ativo (${admins[0].email}, id ${admins[0].id}). ` +
        'Seed recusado — crie novos usuários pela aplicação.'
      );
      process.exitCode = 1;
      return;
    }

    const senha = crypto.randomBytes(18).toString('base64url');
    const hash = bcrypt.hashSync(senha, 12);

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sistema.usuario (email, nome, senha_hash, papel)
       VALUES ($1, $2, $3, 'admin') RETURNING id`,
      [email, nome, hash]
    );
    const id = rows[0].id;
    await client.query(
      `INSERT INTO audit.alteracao (usuario_id, papel, acao, tabela, registro_id, diff)
       VALUES ($1, 'admin', 'seed_admin', 'sistema.usuario', $2, $3)`,
      [id, String(id), JSON.stringify({ email, nome, papel: 'admin' })]
    );
    await client.query('COMMIT');

    console.log(`Admin criado: ${email} (id ${id})`);
    console.log('Senha inicial — anote AGORA, não será exibida novamente:');
    console.log(senha);
  } catch (erro) {
    try { await client.query('ROLLBACK'); } catch { /* sem transação aberta */ }
    throw erro;
  } finally {
    await client.end();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
