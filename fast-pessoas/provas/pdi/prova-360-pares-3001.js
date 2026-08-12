// Prova PONTA A PONTA do 360 de PARES (0068) contra o dev na 3001, ciclo 110
// (desempenho; avaliado = Maurício M. Furtado; líder = gestor@ = Marcos):
//   1. líder e auto enviam → o ciclo consolida (base do PDI);
//   2. o gestor SELECIONA 3 pares da equipe (Cristiane, Bruna, Hugo — com login);
//   3. SEGREGAÇÃO: um não-par recebe 404 na avaliação de par; e o gestor não pode
//      pôr o avaliado (nem o líder) como par (400);
//   4. CEGUEIRA: a leitura do par não traz líder/auto/resultado;
//   5. os 3 pares respondem cego e enviam;
//   6. REVELAR (piso=1): o PDI é gerado e a visão 360 dos pares ENTRA (sem aviso
//      de piso), com o agregado anônimo por indicador presente no banco;
//   7. ESCONDER (piso=9): com 3 < 9, a regra de anonimato NÃO revelaria — provado
//      pelo limiar; o piso é restaurado ao original no fim.
// Roda: node --env-file=.env.local-db provas/pdi/prova-360-pares-3001.js
const { Client } = require("pg");

const BASE = "http://localhost:3001";
const SENHA = "FastDemo2026!";
const CICLO = 110;
const PARES = [
  { id: 150, login: "cristiane.carvalho@fastdemo.local" },
  { id: 154, login: "bruna.soares@fastdemo.local" },
  { id: 157, login: "hugo.falcao@fastdemo.local" },
];

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
// Auto e par: rascunho por PUT /{id} e envio por POST /{id}/enviar.
async function preencherEEnviar(cookie, base, cicloId, nota) {
  const det = await api(cookie, "GET", `${base}/${cicloId}`);
  const inds = det.dados.estrutura.pilares.flatMap((p) => p.indicadores);
  const respostas = inds.map((i) => ({ indicador_id: i.id, nota, nao_observado: false }));
  await api(cookie, "PUT", `${base}/${cicloId}`, { respostas });
  return api(cookie, "POST", `${base}/${cicloId}/enviar`, {});
}
// Líder: rascunho por PUT /{id}/respostas e envio por POST /{id}/enviar.
async function enviarLider(cookie, cicloId, nota) {
  const det = await api(cookie, "GET", `/api/avaliacoes/${cicloId}`);
  const inds = det.dados.estrutura.pilares.flatMap((p) => p.indicadores);
  const respostas = inds.map((i) => ({ indicador_id: i.id, nota, nao_observado: false }));
  await api(cookie, "PUT", `/api/avaliacoes/${cicloId}/respostas`, { respostas });
  return api(cookie, "POST", `/api/avaliacoes/${cicloId}/enviar`, {});
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const pisoOriginal = Number(
    (await c.query(`SELECT minimo_por_recorte AS v FROM sistema.parametro_privacidade WHERE id=1`)).rows[0].v
  );
  const alvo = await c.query(
    `SELECT colaborador_id, avaliador_colaborador_id FROM rh.ciclo_avaliacao WHERE id=$1`,
    [CICLO]
  );
  const avaliadoId = Number(alvo.rows[0].colaborador_id);
  const setPiso = (v) =>
    c.query(`UPDATE sistema.parametro_privacidade SET minimo_por_recorte=$1 WHERE id=1`, [v]);

  try {
    console.log("1 — líder e auto enviam → consolida");
    const gestor = await entrar("gestor@fastdemo.local");
    await enviarLider(gestor, CICLO, 3); // líder: nota 3 em tudo

    const avaliado = await entrar("mauricio.furtado@fastdemo.local");
    await preencherEEnviar(avaliado, "/api/autoavaliacoes", CICLO, 5); // auto: 5
    const cons = await c.query(
      `SELECT status FROM rh.ciclo_avaliacao WHERE id=$1`,
      [CICLO]
    );
    console.log(`   status do ciclo: ${cons.rows[0].status}`);

    console.log("2 — gestor seleciona 3 pares");
    const sel = await api(gestor, "POST", `/api/avaliacoes/${CICLO}/pares`, {
      colaborador_ids: PARES.map((p) => p.id),
    });
    console.log(`   selecionar pares: ${sel.status}`);
    const gestao = await api(gestor, "GET", `/api/avaliacoes/${CICLO}/pares`);
    console.log(`   pares no ciclo: ${gestao.dados.pares?.length}`);

    console.log("3 — segregação");
    const foraDoTime = await entrar("joao.fontes@fastdemo.local");
    const naoPar = await api(foraDoTime, "GET", `/api/avaliacoes-par/${CICLO}`);
    const seg1 = naoPar.status === 404;
    console.log(`   não-par abre a avaliação de par → ${seg1 ? "✅ 404" : "❌ " + naoPar.status}`);
    const addAvaliado = await api(gestor, "POST", `/api/avaliacoes/${CICLO}/pares`, {
      colaborador_ids: [avaliadoId],
    });
    const seg2 = addAvaliado.status === 400;
    console.log(`   pôr o avaliado como par → ${seg2 ? "✅ 400 (bloqueado)" : "❌ " + addAvaliado.status}`);

    console.log("4 — cegueira da leitura do par");
    const cookiesPar = {};
    for (const p of PARES) cookiesPar[p.id] = await entrar(p.login);
    const leitura = await api(cookiesPar[PARES[0].id], "GET", `/api/avaliacoes-par/${CICLO}`);
    const cega =
      !("resultado" in leitura.dados) &&
      JSON.stringify(leitura.dados).indexOf('"percentual"') === -1;
    console.log(`   payload = {${Object.keys(leitura.dados).sort().join(",")}} → ${cega ? "✅ cega" : "❌ vazou"}`);

    console.log("5 — os 3 pares respondem cego (nota 4) e enviam");
    for (const p of PARES) {
      const env = await preencherEEnviar(cookiesPar[p.id], "/api/avaliacoes-par", CICLO, 4);
      console.log(`   par ${p.login.split("@")[0]}: ${env.status}`);
    }
    const nEnviados = Number(
      (await c.query(
        `SELECT count(*) AS n FROM rh.avaliacao WHERE ciclo_id=$1 AND papel='par' AND estado='enviada'`,
        [CICLO]
      )).rows[0].n
    );
    console.log(`   pares enviados: ${nEnviados}`);

    console.log("6 — REVELAR (piso=2): o PDI é gerado e o 360 entra");
    await setPiso(2);
    const pdi = await api(gestor, "POST", `/api/pdi/gerar`, {
      ciclo_id: CICLO,
      entrevista: { peso_avaliacao: 100, tipo: "ciclo", horizonte_meses: 6, foco_prioritario: "ia_decide" },
    });
    if (!pdi.ok) throw new Error("gerar PDI falhou: " + JSON.stringify(pdi.dados));
    const avisoPiso = pdi.dados.pdi.avisos.some((a) => a.tipo === "pares_abaixo_do_piso");
    const agg = await c.query(
      `SELECT count(DISTINCT i.nome) AS indicadores
         FROM rh.avaliacao a
         JOIN rh.resposta_item r ON r.avaliacao_id=a.id AND r.nota IS NOT NULL
         JOIN rh.indicador_avaliacao i ON i.id=r.indicador_avaliacao_id
        WHERE a.ciclo_id=$1 AND a.papel='par' AND a.estado='enviada'`,
      [CICLO]
    );
    const revelou = !avisoPiso && Number(agg.rows[0].indicadores) > 0;
    console.log(`   PDI ${pdi.dados.pdi.id}: ${pdi.dados.pdi.conteudo.focos.length} focos, ${pdi.dados.pdi.conteudo.pontos_cegos.length} pontos cegos`);
    console.log(`   360 revelado (piso 2, ${nEnviados} pares ≥ 2) → ${revelou ? "✅ sem aviso de piso; agregado com " + agg.rows[0].indicadores + " indicadores" : "❌ não revelou"}`);
    pdi.dados.pdi.conteudo.pontos_cegos.forEach((p) => console.log(`     • ${p}`));

    console.log("7 — ESCONDER (piso=5): 3 < 5, o anonimato não revelaria");
    await setPiso(5);
    const escondeCheck = await c.query(
      `SELECT (SELECT count(*) FROM rh.avaliacao WHERE ciclo_id=$1 AND papel='par' AND estado='enviada')
            < (SELECT minimo_por_recorte FROM sistema.parametro_privacidade WHERE id=1) AS esconde`,
      [CICLO]
    );
    const esconde = escondeCheck.rows[0].esconde === true;
    console.log(`   com piso 9 e ${nEnviados} pares → ${esconde ? "✅ abaixo do piso: agregado NÃO revelado" : "❌ revelaria"}`);

    const okTudo =
      cons.rows[0].status === "consolidado" && sel.ok && gestao.dados.pares?.length >= 3 &&
      seg1 && seg2 && cega && nEnviados === 3 && revelou && esconde;
    console.log("\n" + (okTudo ? "✅ 360 DE PARES PROVADO PONTA A PONTA" : "❌ algo falhou — revisar acima"));
    await setPiso(pisoOriginal);
    await c.end();
    process.exit(okTudo ? 0 : 1);
  } catch (e) {
    await setPiso(pisoOriginal).catch(() => {});
    await c.end().catch(() => {});
    throw e;
  }
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
