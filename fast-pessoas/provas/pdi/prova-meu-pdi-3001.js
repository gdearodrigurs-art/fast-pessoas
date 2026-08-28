// Prova do "Meu PDI" (lado da pessoa) contra o dev na 3001, com Maurício Macedo
// Tavares (funcionário, sem 2FA, dono do PDI homologado #1):
//   1. GET traz o plano + as ações + o log; começa sem aceite (ou já aceito num
//      re-run) — a prova tolera os dois;
//   2. ACEITE: registra o "de acordo"; aceitar de novo dá 404 (já aceito);
//   3. ANDAMENTO: um registro com status_novo MOVE a ação (em_andamento) e entra
//      no log; um registro só-texto acrescenta no log sem mover o estado;
//   4. NEGATIVOS: texto vazio = 400; andamento numa ação de OUTRA pessoa = 404 (IDOR).
// Re-executável: o aceite é tolerante e o log append-only só cresce.
// Roda: node --env-file=.env.local-db provas/pdi/prova-meu-pdi-3001.js
const { Client } = require("pg");

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const SENHA = "FastDemo2026!";
const EMAIL = "mauricio.tavares@fastdemo.local";

let falhas = 0;
const checar = (ok, msg) => {
  console.log((ok ? "  ✅ " : "  ❌ ") + msg);
  if (!ok) falhas += 1;
};

async function login(email) {
  const r = await fetch(`${BASE}/api/identidade/entrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha: SENHA }),
  });
  const cookie = (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ok: r.ok, cookie };
}
async function api(cookie, metodo, caminho, corpo) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { cookie, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, dados };
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ausente. Rode com --env-file=.env.local-db");
    process.exit(1);
  }
  try {
    await fetch(`${BASE}/api/identidade/sessao`);
  } catch {
    console.error(`Servidor não respondeu em ${BASE}. Suba o db/servidor.js dev.`);
    process.exit(1);
  }

  console.log("Meu PDI — o lado da pessoa (aceite + andamento)\n");
  let sessao = await login(EMAIL);
  if (!sessao.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    sessao = await login(EMAIL);
  }
  if (!sessao.ok) throw new Error(`login falhou: ${EMAIL}`);
  const cookie = sessao.cookie;

  // 1. GET — o plano
  console.log("1 — GET do meu PDI");
  const inicial = await api(cookie, "GET", "/api/portais/colaborador/pdi");
  checar(inicial.status === 200 && inicial.dados && inicial.dados.id, `traz o PDI homologado (HTTP ${inicial.status})`);
  const pdi = inicial.dados;
  checar(Array.isArray(pdi.acoes) && pdi.acoes.length > 0, `tem ações (${pdi.acoes?.length ?? 0})`);
  const acao = pdi.acoes[0];

  // 2. ACEITE (tolerante a re-run)
  console.log("2 — aceite do plano");
  if (!pdi.aceito_em) {
    const ok = await api(cookie, "POST", `/api/portais/colaborador/pdi/${pdi.id}/aceite`);
    checar(ok.status === 204, `aceite registrado (HTTP ${ok.status})`);
    const depois = await api(cookie, "GET", "/api/portais/colaborador/pdi");
    checar(depois.dados.aceito_em != null, "GET agora mostra o aceite");
  } else {
    checar(true, `PDI já estava aceito (${pdi.aceito_em}) — re-run`);
  }
  const reaceite = await api(cookie, "POST", `/api/portais/colaborador/pdi/${pdi.id}/aceite`);
  checar(reaceite.status === 404, `aceitar de novo é recusado (HTTP ${reaceite.status})`);

  // 3. ANDAMENTO
  console.log("3 — andamento das ações");
  const marca = `avancei ${Math.floor(Date.now() / 1000) % 100000}`;
  const mov = await api(cookie, "POST", `/api/portais/colaborador/pdi/acoes/${acao.id}/andamento`, {
    texto: marca,
    status_novo: "em_andamento",
  });
  checar(mov.status === 204, `registro com status move a ação (HTTP ${mov.status})`);
  const so_texto = await api(cookie, "POST", `/api/portais/colaborador/pdi/acoes/${acao.id}/andamento`, {
    texto: "recado sem mudar o estado",
  });
  checar(so_texto.status === 204, `registro só-texto aceito (HTTP ${so_texto.status})`);

  const depois = await api(cookie, "GET", "/api/portais/colaborador/pdi");
  const acaoDepois = depois.dados.acoes.find((a) => a.id === acao.id);
  checar(acaoDepois?.status === "em_andamento", `a ação ficou 'em_andamento' (está '${acaoDepois?.status}')`);
  checar((acaoDepois?.andamento ?? []).some((r) => r.texto === marca), "o registro entrou no log");
  checar((acaoDepois?.andamento ?? []).length >= 2, `o log tem ao menos 2 registros (${acaoDepois?.andamento?.length ?? 0})`);

  // 4. NEGATIVOS
  console.log("4 — negativos (validação + IDOR)");
  const vazio = await api(cookie, "POST", `/api/portais/colaborador/pdi/acoes/${acao.id}/andamento`, { texto: "   " });
  checar(vazio.status === 400, `texto vazio recusado (HTTP ${vazio.status})`);

  // IDOR: uma ação de OUTRA pessoa
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const alheia = (await c.query(
    `SELECT a.id FROM rh.acao_aberta a
       JOIN sistema.usuario u ON u.email=$1
      WHERE a.colaborador_id NOT IN
            (SELECT id FROM rh.colaborador WHERE pessoa_id = u.pessoa_id)
      ORDER BY a.id LIMIT 1`,
    [EMAIL]
  )).rows[0];
  await c.end();
  if (alheia) {
    const idor = await api(cookie, "POST", `/api/portais/colaborador/pdi/acoes/${alheia.id}/andamento`, { texto: "não devia poder" });
    checar(idor.status === 404, `andamento em ação de outra pessoa dá 404 (HTTP ${idor.status})`);
  } else {
    checar(false, "não achei ação de outra pessoa para o teste de IDOR");
  }

  console.log("\n" + (falhas === 0
    ? "✅ MEU PDI PROVADO — aceite, andamento com log e status, e escopo por pessoa (IDOR barrado)"
    : `❌ ${falhas} verificação(ões) caíram`));
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
