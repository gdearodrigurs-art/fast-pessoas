// Prova PONTA A PONTA da autoavaliação (0067) contra o dev na 3001, ciclo 111
// (desempenho, avaliado = Cristiane com login, líder = gestor@ = Marcos):
//   1. o líder preenche e ENVIA a avaliação dele;
//   2. PROVA DO SPLIT: com só o líder, o ciclo NÃO consolida (espera a auto);
//   3. SEGREGAÇÃO: o gestor (não é o avaliado) recebe 404 na auto do ciclo;
//   4. CEGUEIRA: a leitura da auto do colaborador não traz líder nem resultado;
//   5. SEGREGAÇÃO: o colaborador recebe 404 ao tentar enviar a avaliação do líder;
//   6. o colaborador ENVIA a auto → fecha o par → consolida;
//   7. a nota consolidada é 60% (líder deu 3/5 em tudo) — a auto (5/5) NÃO entrou;
//   8. o gestor gera o PDI e os PONTOS CEGOS (auto × líder) aparecem de verdade.
// Roda: node --env-file=.env.local-db provas/pdi/prova-autoavaliacao-3001.js
const { Client } = require("pg");

const BASE = "http://localhost:3001";
const SENHA = "FastDemo2026!";
const CICLO = 111;

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

async function entrar(email) {
  let s = await login(email);
  if (!s.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    s = await login(email);
  }
  if (!s.ok) throw new Error(`login falhou: ${email}`);
  return s.cookie;
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
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log("1 — gestor (líder) preenche e envia a avaliação do líder");
  const gestor = await entrar("gestor@fastdemo.local");
  const det = await api(gestor, "GET", `/api/avaliacoes/${CICLO}`);
  if (!det.dados.estrutura) throw new Error("sem estrutura no detalhe do líder: " + JSON.stringify(det.dados).slice(0, 200));
  const indicadores = det.dados.estrutura.pilares.flatMap((p) => p.indicadores);
  const respLider = indicadores.map((i) => ({ indicador_id: i.id, nota: 3, nao_observado: false }));
  await api(gestor, "PUT", `/api/avaliacoes/${CICLO}/respostas`, { respostas: respLider });
  const envLider = await api(gestor, "POST", `/api/avaliacoes/${CICLO}/enviar`, {});
  console.log(`   líder enviou (${indicadores.length} indicadores, nota 3): ${envLider.status}`);

  const r1 = await c.query(`SELECT status FROM rh.ciclo_avaliacao WHERE id=$1`, [CICLO]);
  const res1 = await c.query(`SELECT count(*)::int n FROM rh.resultado_avaliacao WHERE ciclo_id=$1`, [CICLO]);
  const naoConsolidou = r1.rows[0].status === "em_avaliacao" && res1.rows[0].n === 0;
  console.log(`2 — só o líder: status=${r1.rows[0].status}, resultado=${res1.rows[0].n} → ${naoConsolidou ? "✅ NÃO consolidou (espera a auto)" : "❌ consolidou cedo demais"}`);

  const autoDoGestor = await api(gestor, "GET", `/api/autoavaliacoes/${CICLO}`);
  const segreg1 = autoDoGestor.status === 404;
  console.log(`3 — gestor (não é o avaliado) abre a auto do ciclo → ${segreg1 ? "✅ 404 (bloqueado)" : "❌ " + autoDoGestor.status}`);

  console.log("4 — colaborador (avaliado) abre a auto — tem de ser CEGA");
  const cris = await entrar("cristiane.carvalho@fastdemo.local");
  const autoDet = await api(cris, "GET", `/api/autoavaliacoes/${CICLO}`);
  if (autoDet.status !== 200) throw new Error("auto GET falhou: " + autoDet.status + " " + JSON.stringify(autoDet.dados).slice(0, 200));
  const chaves = Object.keys(autoDet.dados).sort().join(",");
  const cega = !("resultado" in autoDet.dados) && !("lider" in autoDet.dados) &&
    JSON.stringify(autoDet.dados).indexOf('"percentual"') === -1;
  console.log(`   payload = {${chaves}} → ${cega ? "✅ cega (sem líder/resultado/percentual)" : "❌ vazou dado do líder"}`);

  const autoInds = autoDet.dados.estrutura.pilares.flatMap((p) => p.indicadores);
  const respAuto = autoInds.map((i) => ({ indicador_id: i.id, nota: 5, nao_observado: false }));
  await api(cris, "PUT", `/api/autoavaliacoes/${CICLO}`, { respostas: respAuto });

  const crisTentaLider = await api(cris, "POST", `/api/avaliacoes/${CICLO}/enviar`, {});
  const segreg2 = crisTentaLider.status === 404 || crisTentaLider.status === 403;
  console.log(`5 — colaborador tenta enviar a avaliação do LÍDER → ${segreg2 ? "✅ " + crisTentaLider.status + " (bloqueado)" : "❌ " + crisTentaLider.status}`);

  const envAuto = await api(cris, "POST", `/api/autoavaliacoes/${CICLO}/enviar`, {});
  console.log(`6 — colaborador envia a auto (nota 5 em tudo): ${envAuto.status}`);

  const r2 = await c.query(`SELECT status FROM rh.ciclo_avaliacao WHERE id=$1`, [CICLO]);
  const res2 = await c.query(`SELECT percentual FROM rh.resultado_avaliacao WHERE ciclo_id=$1`, [CICLO]);
  const consolidou = r2.rows[0].status === "consolidado" && res2.rows.length === 1;
  const notaSoDoLider = res2.rows.length === 1 && Number(res2.rows[0].percentual) === 60;
  console.log(`7 — após a auto: status=${r2.rows[0].status} → ${consolidou ? "✅ consolidou" : "❌ não consolidou"}`);
  console.log(`   nota consolidada = ${res2.rows[0]?.percentual}% → ${notaSoDoLider ? "✅ 60% = SÓ do líder (3/5); a auto (5/5) NÃO entrou" : "❌ a auto contaminou a nota"}`);

  console.log("8 — gestor gera o PDI (Opus 5) — pontos cegos auto × líder");
  const pdi = await api(gestor, "POST", `/api/pdi/gerar`, {
    ciclo_id: CICLO,
    entrevista: { peso_avaliacao: 100, tipo: "ciclo", horizonte_meses: 6, foco_prioritario: "ia_decide" },
  });
  await c.end();
  if (!pdi.ok) throw new Error("gerar PDI falhou: " + JSON.stringify(pdi.dados));
  const cegos = pdi.dados.pdi.conteudo.pontos_cegos;
  console.log(`   PDI ${pdi.dados.pdi.id}: ${pdi.dados.pdi.conteudo.focos.length} focos, ${cegos.length} ponto(s) cego(s):`);
  cegos.forEach((p) => console.log(`     • ${p}`));

  const okTudo = naoConsolidou && segreg1 && cega && segreg2 && consolidou && notaSoDoLider && cegos.length > 0;
  console.log("\n" + (okTudo ? "✅ AUTOAVALIAÇÃO PROVADA PONTA A PONTA" : "❌ algo falhou — revisar acima"));
  process.exit(okTudo ? 0 : 1);
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
