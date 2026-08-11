// Prova do FLUXO INTEIRO do PDI contra o dev server na 3001:
//   1. gestor@ gera o PDI (chamada real ao Opus 5) para o ciclo 92;
//   2. a desidentificação corta um CPF plantado no campo livre (aviso aparece);
//   3. o motor (nível 2) devolve avisos de sanidade;
//   4. gestor submete → RH (com 2FA) homologa → vira ações no portal;
//   5. confere no banco que as ações nasceram com o pdi_id de origem.
// Roda: node --env-file=.env.local-db provas/pdi/prova-fluxo-3001.js
const { execFileSync } = require("child_process");
const { Client } = require("pg");

const BASE = "http://localhost:3001";
const SENHA = "FastDemo2026!";
const PROJ = "C:/sistema RH/fast-pessoas";
const CICLO = 92;

function totp(email) {
  return execFileSync(
    process.execPath,
    ["--env-file=.env.local-db", "db/codigo-2fa.js", email],
    { cwd: PROJ, encoding: "utf8" }
  )
    .trim()
    .match(/\d{6}/)[0];
}

async function login(email, codigo) {
  const corpo = { email, senha: SENHA };
  if (codigo !== undefined) corpo.codigo_totp = codigo;
  const r = await fetch(`${BASE}/api/identidade/entrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const cookie = (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ok: r.ok, cookie };
}

// Entra. precisa2fa: gestor não tem, rh tem. Retry único cobre cold start do dev.
async function entrar(email, precisa2fa) {
  let s = await login(email, precisa2fa ? totp(email) : undefined);
  if (!s.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    s = await login(email, precisa2fa ? totp(email) : undefined);
  }
  if (!s.ok) throw new Error(`login falhou: ${email}`);
  return s.cookie;
}

async function api(cookie, metodo, caminho, corpo) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      cookie,
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, dados };
}

(async () => {
  console.log("1 — gestor@ entra e gera o PDI (Opus 5, ciclo " + CICLO + ")");
  const gestor = await entrar("gestor@fastdemo.local", false);

  const gerar = await api(gestor, "POST", "/api/pdi/gerar", {
    ciclo_id: CICLO,
    entrevista: {
      peso_avaliacao: 100,
      tipo: "ciclo",
      horizonte_meses: 6,
      foco_prioritario: "ia_decide",
      // CPF plantado de propósito — a desidentificação tem que cortar.
      contexto_livre:
        "vinha bem, mas caiu depois de trocar de setor; CPF 123.456.789-09",
    },
  });
  if (!gerar.ok) throw new Error("gerar falhou: " + JSON.stringify(gerar.dados));
  const pdi = gerar.dados.pdi;
  console.log(`   → PDI ${pdi.id} gerado — ${pdi.conteudo.focos.length} focos, ${pdi.tokens.entrada}+${pdi.tokens.saida} tokens`);
  console.log("   focos:", pdi.conteudo.focos.map((f) => f.competencia).join(" · "));

  const avisoCpf = pdi.avisos.some((a) => /CPF/i.test(a.mensagem));
  console.log(avisoCpf
    ? "   ✅ desidentificação: o CPF do campo livre foi cortado e sinalizado"
    : "   ❌ CPF NÃO foi sinalizado");
  console.log("   avisos:", pdi.avisos.map((a) => `${a.tipo}`).join(", ") || "(nenhum)");

  console.log("\n2 — gestor submete para homologação");
  const sub = await api(gestor, "POST", `/api/pdi/${pdi.id}/submeter`, {});
  console.log("   submeter →", sub.status, sub.ok ? "aguardando_homologacao" : sub.dados.erro);

  console.log("\n3 — RH entra (2FA) e VÊ o PDI pendente");
  const rh = await entrar("rh@fastdemo.local", true);
  const painelRh = await api(rh, "GET", "/api/pdi");
  const vemPendente = painelRh.dados.pdis?.some(
    (p) => p.id === pdi.id && p.status === "aguardando_homologacao"
  );
  console.log(vemPendente
    ? "   ✅ RH enxerga o PDI aguardando homologação"
    : "   ❌ RH não viu o PDI pendente");

  console.log("\n4 — RH homologa (materializa as ações)");
  const hom = await api(rh, "POST", `/api/pdi/${pdi.id}/homologar`, {});
  if (!hom.ok) throw new Error("homologar falhou: " + JSON.stringify(hom.dados));
  console.log(`   ✅ homologado — ${hom.dados.acoes_criadas} ações criadas`);

  console.log("\n5 — confere no banco: as ações nasceram com o pdi_id de origem");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(
    `SELECT count(*)::int AS n FROM rh.acao_aberta WHERE pdi_id = $1`,
    [pdi.id]
  );
  const trilha = await c.query(
    `SELECT count(*)::int AS n FROM audit.leitura_sensivel
      WHERE chave_permissao = 'pdi.gerar' AND registro_id = $1`,
    [String(pdi.id)]
  );
  await c.end();
  console.log(`   ações em rh.acao_aberta com pdi_id=${pdi.id}: ${r.rows[0].n}`);
  console.log(`   trilha audit.leitura_sensivel (envio externo): ${trilha.rows[0].n} linha(s)`);

  const okTudo =
    gerar.ok && avisoCpf && sub.ok && vemPendente && hom.ok &&
    r.rows[0].n === hom.dados.acoes_criadas && trilha.rows[0].n >= 1;
  console.log("\n" + (okTudo ? "✅ FLUXO INTEIRO PROVADO" : "❌ algo falhou — revisar acima"));
  process.exit(okTudo ? 0 : 1);
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
