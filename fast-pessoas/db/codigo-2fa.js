// db/codigo-2fa.js — imprime o código TOTP do momento para uma conta da DEMO.
//
//   node --env-file=.env db/codigo-2fa.js dp@fastdemo.local
//
// Existe para a apresentação não travar: os papéis rh/dp/diretoria/admin são
// obrigados a 2FA pelo app, e as contas de demo já nascem com o segredo
// configurado. Usa a MESMA biblioteca e os MESMOS parâmetros do login
// (otpauth, SHA1/6 dígitos/30s — ver src/dominios/identidade/servico.ts).
//
// Só funciona para contas @fastdemo.local: é ferramenta de demonstração, não
// um bypass de 2FA para contas reais.
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const { Client } = require('pg');
const OTPAuth = require('otpauth');

const DOMINIO_DEMO = '@fastdemo.local';

async function main() {
  const email = (process.argv[2] ?? '').trim();
  if (!email) {
    console.error('Uso: node --env-file=.env db/codigo-2fa.js <email@fastdemo.local>');
    process.exit(1);
  }
  if (!email.toLowerCase().endsWith(DOMINIO_DEMO)) {
    console.error(
      `Recusado: este utilitário só atende contas de demonstração (${DOMINIO_DEMO}).`
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ausente — rode com "node --env-file=.env db/codigo-2fa.js ...".');
    process.exit(1);
  }

  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  try {
    const { rows } = await cliente.query(
      'SELECT nome, papel, totp_secret FROM sistema.usuario WHERE lower(email) = lower($1)',
      [email]
    );
    if (rows.length === 0) {
      console.error(`Usuário não encontrado: ${email}. Rodou "npm run db:demo"?`);
      process.exitCode = 1;
      return;
    }
    const [usuario] = rows;
    if (!usuario.totp_secret) {
      console.error(
        `${email} (papel ${usuario.papel}) não tem 2FA configurado — entre só com a senha.`
      );
      process.exitCode = 1;
      return;
    }

    const totp = new OTPAuth.TOTP({
      issuer: 'Fast Pessoas',
      label: email,
      secret: OTPAuth.Secret.fromBase32(usuario.totp_secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const codigo = totp.generate();
    const segundosRestantes = 30 - Math.floor((Date.now() / 1000) % 30);
    console.log(`${usuario.nome} <${email}> — papel ${usuario.papel}`);
    console.log(`código: ${codigo}   (válido por mais ${segundosRestantes}s)`);
  } finally {
    await cliente.end();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
