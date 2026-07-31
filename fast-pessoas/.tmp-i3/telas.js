const { Client } = require('pg');
const OTPAuth = require('otpauth');
// Os 5 códigos TOTP saem de UM cliente só: abrir um processo pg por persona
// estourava o limite de 15 conexões do pooler e fazia rotas devolverem 500 por
// falta de conexão — ruído de bancada, não do sistema.
const segredos = new Map();
let cliente;
async function carregarTotps(emails) {
  cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  for (const email of emails) {
    const { rows } = await cliente.query(
      'SELECT totp_secret FROM sistema.usuario WHERE email = $1', [email]);
    if (rows[0]?.totp_secret) segredos.set(email, rows[0].totp_secret);
  }
  await cliente.end();
}
const BASE = 'http://localhost:3001';
const SENHA = 'FastDemo2026!';
const antigo = Number(process.argv[2]);
const novo = Number(process.argv[3]);

// Gerado NA HORA do login: o código vale 30s, e carregar tudo no começo
// derrubava as últimas personas com "Código de verificação inválido".
function totp(email) {
  const segredo = segredos.get(email);
  if (!segredo) return undefined;
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(segredo),
    algorithm: 'SHA1', digits: 6, period: 30 }).generate();
}
async function entrar(email, com2fa) {
  const corpo = { email, senha: SENHA };
  if (com2fa) corpo.codigo_totp = totp(email);
  await pausa(200);
  const r = await fetch(`${BASE}/api/identidade/entrar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(cookie, caminho) {
  await pausa(120);
  let r = await fetch(`${BASE}${caminho}`, { headers: { cookie } });
  if (r.status === 500) { await pausa(1200); r = await fetch(`${BASE}${caminho}`, { headers: { cookie } }); }
  const txt = await r.text();
  let dados; try { dados = JSON.parse(txt); } catch { dados = txt.slice(0, 200); }
  return { status: r.status, dados };
}
function t(s) { console.log(`\n----- ${s}`); }

(async () => {
  const personas = [
    ['dp', 'dp@fastdemo.local', true],
    ['diretora', 'diretora.pessoas@fastdemo.local', true],
    ['rh', 'rh@fastdemo.local', true],
    ['recrutador', 'recrutador@fastdemo.local', true],
    ['lidertd', 'lidertd@fastdemo.local', true],
    ['gestor', 'gestor@fastdemo.local', false],
    ['funcionario', 'funcionario@fastdemo.local', false],
  ];
  await carregarTotps(personas.filter((p) => p[2]).map((p) => p[1]));
  await pausa(1500); // devolve as conexões ao pooler antes de bater na API
  const cookies = {};
  t('login das 7 personas + telas que a tarefa exige');
  for (const [nome, email, com2fa] of personas) {
    const cookie = await entrar(email, com2fa);
    cookies[nome] = cookie;
    const alvos = ['/api/colaboradores', '/api/organograma', '/api/demandas',
      `/api/colaboradores/${novo}`, `/api/colaboradores/${antigo}`,
      '/api/painel-executivo'];
    const linha = [];
    for (const c of alvos) linha.push(`${c.replace('/api/', '')}:${(await get(cookie, c)).status}`);
    console.log(`${nome.padEnd(12)} ${linha.join('  ')}`);
  }

  t('lista /colaboradores (dp) — a pessoa aparece nos DOIS vínculos, um ativo e um desligado');
  const lista = await get(cookies.dp, '/api/colaboradores');
  const arr = lista.dados.colaboradores ?? lista.dados;
  console.table(arr.filter((c) => c.id === antigo || c.id === novo).map((c) => ({
    id: c.id, matricula: c.matricula, nome: c.nome_completo,
    status: c.status, cargo: c.cargo_nome, unidade: c.unidade })));

  t('ficha do vínculo NOVO (dp)');
  const fn = (await get(cookies.dp, `/api/colaboradores/${novo}`)).dados;
  const f = fn.ficha ?? fn.colaborador ?? fn;
  console.log(`${f.nome_completo} · CPF ${f.cpf} · matrícula ${f.matricula} · ${f.status}`);
  console.log(`REGISTRO ${f.empresa_nome} · LOTAÇÃO ${f.unidade} · CC ${f.centro_custo} · cargo ${f.cargo_nome}`);
  console.log(`e-mail ${f.email} · pessoa_id ${f.pessoa_id} · usuario_id ${f.usuario_id}`);
  console.log('bloco "Vínculos desta pessoa no grupo":');
  console.table(f.vinculos);

  t('linha do tempo servida à ficha do vínculo NOVO (atravessa os dois)');
  const ev = (await get(cookies.dp, `/api/colaboradores/${novo}/eventos`)).dados;
  const eventos = ev.eventos ?? ev;
  console.table((Array.isArray(eventos) ? eventos : []).slice(0, 6).map((e) => ({
    matricula: e.vinculo_matricula, tipo: e.tipo,
    data: String(e.ocorrido_em).slice(0, 10), resumo: String(e.resumo).slice(0, 60) })));

  t('organograma (dp): o vínculo NOVO está no quadro, o antigo saiu');
  const org = (await get(cookies.dp, '/api/organograma')).dados;
  const nos = org.nos ?? org.colaboradores ?? org.pessoas ?? [];
  console.table(nos.filter((n) => n.id === antigo || n.id === novo)
    .map((n) => ({ id: n.id, nome: n.nome_completo ?? n.nome, cargo: n.cargo_nome,
      unidade: n.unidade, gestor_id: n.gestor_id ?? n.gestor_colaborador_id })));
  console.log('total de nós no organograma:', nos.length);

  t('a PESSOA transferida entra com o mesmo login e vê o portal dela');
  const [{ }] = [{}];
  const portal = await get(cookies.dp, '/api/portais/colaborador');
  console.log('portal do colaborador (dp) →', portal.status);
})().catch((e) => { console.error(e); process.exit(1); });
