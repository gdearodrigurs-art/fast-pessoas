// Bateria 2FA (#11) — o último portão antes do merge. Prova:
//  (1) as 7 personas que exigem 2FA entram com código válido (sem lockout);
//  (2) anti-replay: reusar o MESMO código no login falha;
//  (3) o FIX: um código consumido no login ainda vale numa ação sensível
//      (folha/aprovar) — o TOTP é aceito e o erro que sobra é de ESTADO, não de
//      código. Era esse o bug da madrugada (login envenenava a aprovação);
//  (4) persona sem 2FA entra sem código (a exigência é por chave, não por papel).
// Roda contra o dev server na 3001.
const { execFileSync } = require('child_process');
const BASE = 'http://localhost:3001', SENHA = 'FastDemo2026!';
const PROJ = 'C:/sistema RH/fast-pessoas';

function totp(email) {
  return execFileSync(process.execPath, ['--env-file=.env.local-db', 'db/codigo-2fa.js', email],
    { cwd: PROJ, encoding: 'utf8' }).trim().match(/\d{6}/)[0];
}
async function login(email, codigo) {
  const corpo = { email, senha: SENHA };
  if (codigo !== undefined) corpo.codigo_totp = codigo;
  const r = await fetch(`${BASE}/api/identidade/entrar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const dados = await r.json().catch(() => ({}));
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, ok: r.ok, cookie, erro: dados.erro };
}
async function aprovarFolha(cookie, id, codigo) {
  const r = await fetch(`${BASE}/api/folha/${id}/aprovar`, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo_totp: codigo }) });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, erro: dados.erro };
}
const PERSONAS_2FA = ['daniel.melo', 'debora.rezende', 'diretora.pessoas', 'dp', 'lidertd', 'recrutador', 'rh']
  .map((p) => `${p}@fastdemo.local`);

(async () => {
  console.log('='.repeat(72));
  console.log('1 e 2 — as 7 personas 2FA: login com código válido, e replay do MESMO código');
  console.log('='.repeat(72));
  let dpCookie = null, dpCodigo = null;
  const linhas = [];
  for (const email of PERSONAS_2FA) {
    const codigo = totp(email);
    const semCodigo = await login(email);                 // sem código: tem que barrar
    const comCodigo = await login(email, codigo);          // com código: entra
    const replay = await login(email, codigo);             // mesmo código de novo: anti-replay
    linhas.push({
      persona: email.replace('@fastdemo.local', ''),
      'sem_codigo(espera bloqueio)': `${semCodigo.status}${semCodigo.ok ? ' ENTROU?!' : ' ok-bloqueado'}`,
      'com_codigo(espera entrar)': `${comCodigo.status}${comCodigo.ok ? ' ENTROU' : ' FALHOU?!'}`,
      'replay(espera falhar)': `${replay.status}${replay.ok ? ' ENTROU?!' : ' ok-barrado'}`,
    });
    if (email.startsWith('dp@') && comCodigo.ok) { dpCookie = comCodigo.cookie; dpCodigo = codigo; }
  }
  console.table(linhas);

  console.log('\n' + '='.repeat(72));
  console.log('3 — O FIX: o código consumido no login do DP ainda vale em folha/aprovar');
  console.log('='.repeat(72));
  if (!dpCookie) { console.log('DP não logou — não dá para testar o fix'); }
  else {
    const ap = await aprovarFolha(dpCookie, 8, dpCodigo);
    const codigoRejeitado = /c[óo]digo|autenticad|totp|inv[áa]lid/i.test(ap.erro || '');
    console.log('POST /api/folha/8/aprovar com o MESMO código do login →', ap.status);
    console.log('erro:', ap.erro);
    console.log(codigoRejeitado
      ? '❌ REGRESSÃO: o TOTP foi rejeitado (o login envenenou a aprovação)'
      : '✅ FIX OK: o TOTP foi ACEITO; o erro é de estado/negócio, não de código');
  }

  console.log('\n' + '='.repeat(72));
  console.log('4 — persona SEM 2FA entra sem código (exigência é por chave, não papel)');
  console.log('='.repeat(72));
  const semFa = await login('otavio.dantas@fastdemo.local');
  console.log('otavio.dantas (sem 2FA) login sem código →', semFa.status, semFa.ok ? '✅ ENTROU' : '❌ barrado');
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
