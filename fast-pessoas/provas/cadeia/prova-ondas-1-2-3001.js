/* Prova ao vivo das Ondas 1–2 contra http://localhost:3001 (fast_pessoas_dev).
 * Roda de fast-pessoas/: node --env-file=.env.local-db <este arquivo>
 * Não destrói nada: o doc bloqueante da prova é neutralizado por substituição (v2 sem ciclo). */
const { execSync } = require("node:child_process");
const { Client } = require("C:\\sistema RH\\fast-pessoas\\node_modules\\pg");

const BASE_URL = "http://localhost:3001";
const HOJE = new Date().toISOString().slice(0, 10);
let passa = 0, falha = 0;
const ok = (nome, cond, extra = "") => {
  if (cond) { passa++; console.log(`  ok   ${nome}`); }
  else { falha++; console.log(`  FAIL ${nome} ${extra}`); }
};

function cookieDe(email) {
  const saida = execSync(
    `node --env-file=.env.local-db db/logar-como.js ${email} --banco fast_pessoas_dev`,
    { encoding: "utf8" }
  );
  const linha = saida.split(/\r?\n/).find(l => l.startsWith("fp_sessao="));
  if (!linha) throw new Error(`sem cookie para ${email}`);
  return linha.trim();
}

async function pega(caminho, cookie, opts = {}) {
  const r = await fetch(BASE_URL + caminho, {
    redirect: "manual",
    ...opts,
    headers: { cookie, "content-type": "application/json", ...(opts.headers || {}) },
  });
  let corpo = null;
  try { corpo = await r.clone().json(); } catch { corpo = await r.text().catch(() => null); }
  return { status: r.status, corpo, headers: r.headers };
}

(async () => {
  const urlBanco = new URL(process.env.DATABASE_URL);
  urlBanco.pathname = "/fast_pessoas_dev";
  const db = new Client({ connectionString: urlBanco.toString() });
  await db.connect();

  // ---- ids do cenário
  const marcos = 288, juliana = 296, dpColab = 291;
  const { rows: lid } = await db.query(
    `SELECT liderado_colaborador_id AS id FROM rh.relacao_gestor
      WHERE gestor_colaborador_id = $1 AND fim_vigencia IS NULL LIMIT 1`, [marcos]);
  const liderado = lid[0]?.id;
  const { rows: indireto } = await db.query(
    `SELECT liderado_colaborador_id AS id FROM rh.relacao_gestor
      WHERE gestor_colaborador_id = $1 AND fim_vigencia IS NULL LIMIT 1`, [liderado]);
  const lideradoIndireto = indireto[0]?.id ?? null;
  const { rows: prog } = await db.query(
    `SELECT id FROM rh.programacao_ferias WHERE status = 'aprovada' ORDER BY id LIMIT 1`);
  const programacao = prog[0]?.id;
  const { rows: cat } = await db.query(
    `SELECT chave FROM rh.categoria_devolucao WHERE inativado_em IS NULL ORDER BY ordem LIMIT 1`);
  const categoriaPosse = cat[0]?.chave;
  console.log(`cenário: liderado=${liderado} indireto=${lideradoIndireto} programacao=${programacao} catPosse=${categoriaPosse}`);

  console.log("\n[cookies]");
  const J = cookieDe("funcionario@fastdemo.local");
  const G = cookieDe("gestor@fastdemo.local");
  const DP = cookieDe("dp@fastdemo.local");
  console.log("  ok   3 sessões montadas");

  // ---- 1. Crachá (A4:a)
  console.log("\n[1 · crachá público]");
  const cr = await pega(`/api/colaboradores/${marcos}`, J);
  ok("fora do alcance devolve crachá, não 404", cr.status === 200 && !!cr.corpo?.cracha, `status=${cr.status}`);
  const c = cr.corpo?.cracha || {};
  ok("crachá sem dado sensível", !("salario" in c) && !("cpf" in c) && !("matricula" in c));

  // ---- 2. Salário por sub-árvore (A1/A2)
  console.log("\n[2 · salário do gestor por sub-árvore]");
  const alvoEquipe = lideradoIndireto ?? liderado;
  const pos = await pega(`/api/colaboradores/${alvoEquipe}/posicao`, G);
  ok(`gestor lê posição de liderado${lideradoIndireto ? " INDIRETO" : ""}`, pos.status === 200, `status=${pos.status}`);
  const posFora = await pega(`/api/colaboradores/${dpColab}/posicao`, G);
  ok("fora da sub-árvore = 404 (ausência)", posFora.status === 404, `status=${posFora.status}`);
  const { rows: tr } = await db.query(
    `SELECT chave_permissao FROM audit.leitura_sensivel
      WHERE recurso='colaborador.salario' ORDER BY id DESC LIMIT 1`);
  ok("trilha gravou a chave de equipe", tr[0]?.chave_permissao === "rh.posicao.ver.equipe", JSON.stringify(tr[0]));

  // ---- 3. Raça-cor (A5:b)
  console.log("\n[3 · raça-cor]");
  const dec = await pega(`/api/portais/colaborador/raca-cor`, J, {
    method: "POST", body: JSON.stringify({ raca_cor: "parda" }) });
  ok("titular declara (keyless por sessão)", dec.status === 200 || dec.status === 201, `status=${dec.status}`);
  const dpVe = await pega(`/api/colaboradores/${juliana}/raca-cor`, DP);
  ok("DP vê o individual", dpVe.status === 200, `status=${dpVe.status}`);
  const gVe = await pega(`/api/colaboradores/${juliana}/raca-cor`, G);
  ok("gestor NÃO vê (403)", gVe.status === 403, `status=${gVe.status}`);
  const { rows: tr2 } = await db.query(
    `SELECT chave_permissao FROM audit.leitura_sensivel
      WHERE recurso='colaborador.raca_cor' ORDER BY id DESC LIMIT 1`);
  ok("leitura do DP deixou trilha", tr2[0]?.chave_permissao === "rh.colaborador.sensivel.ver", JSON.stringify(tr2[0]));

  // ---- 4. Posse do titular + anti-duplo-clique
  console.log("\n[4 · minha posse]");
  const termoUp = await pega(`/api/documentos`, DP, { method: "POST", body: JSON.stringify({
    categoria: "outro", titulo: "Termo de posse — prova onda", sensivel: false,
    colaborador_id: juliana, nome_arquivo: "termo-prova.txt", mime: "text/plain",
    conteudo_base64: Buffer.from("Termo de responsabilidade da prova.").toString("base64") })});
  ok("termo no GED", termoUp.status === 201, `status=${termoUp.status} ${JSON.stringify(termoUp.corpo).slice(0,120)}`);
  const termoId = termoUp.corpo?.documento?.id;
  const posse = await pega(`/api/posse?colaborador_id=${juliana}`, DP, { method: "POST", body: JSON.stringify({
    categoria_chave: categoriaPosse, descricao: "Notebook da prova ao vivo",
    quantidade: 1, data_entrega: HOJE, termo_documento_id: termoId })});
  ok("DP registra a posse", posse.status === 201, `status=${posse.status} ${JSON.stringify(posse.corpo).slice(0,140)}`);
  const posseId = posse.corpo?.item?.id ?? posse.corpo?.posse?.id ?? posse.corpo?.id;
  const minhas = await pega(`/api/posse/minhas`, J);
  ok("titular vê em /minhas", minhas.status === 200 &&
     JSON.stringify(minhas.corpo).includes("Notebook da prova"), `status=${minhas.status}`);
  const ci1 = await pega(`/api/posse/${posseId}/ciencia`, J, { method: "POST", body: "{}" });
  ok("ciência do titular", ci1.status === 200 || ci1.status === 201, `status=${ci1.status} ${JSON.stringify(ci1.corpo).slice(0,120)}`);
  const ci2 = await pega(`/api/posse/${posseId}/ciencia`, J, { method: "POST", body: "{}" });
  ok("duplo clique vira 409", ci2.status === 409, `status=${ci2.status}`);

  // ---- 5. Prévias da folha
  console.log("\n[5 · prévias de férias e 13º]");
  const fp = await pega(`/api/folha/ferias-previa?programacao=${programacao}`, DP);
  ok("férias-prévia 200 com item 0136", fp.status === 200 &&
     JSON.stringify(fp.corpo).includes("0136"), `status=${fp.status} ${JSON.stringify(fp.corpo).slice(0,140)}`);
  const dp13 = await pega(`/api/folha/decimo-previa?colaborador=${juliana}&ano=2026&parcela=2`, DP);
  ok("13º-prévia 200 com item 0138", dp13.status === 200 &&
     JSON.stringify(dp13.corpo).includes("0138"), `status=${dp13.status} ${JSON.stringify(dp13.corpo).slice(0,140)}`);

  // ---- 6. GATE do Código de Conduta (login REAL)
  console.log("\n[6 · gate do Conduta — fluxo real]");
  const pub = await pega(`/api/documentos`, DP, { method: "POST", body: JSON.stringify({
    categoria: "politica", titulo: "Código de Conduta (prova ao vivo)", sensivel: false,
    exige_ciencia: true, bloqueante: true, nome_arquivo: "conduta-prova.txt", mime: "text/plain",
    conteudo_base64: Buffer.from("Código de Conduta da prova — leia até o fim.").toString("base64") })});
  ok("DP publica bloqueante (rh.conduta.gerir)", pub.status === 201, `status=${pub.status} ${JSON.stringify(pub.corpo).slice(0,140)}`);
  const docConduta = pub.corpo?.documento?.id;

  const login = await fetch(`${BASE_URL}/api/identidade/entrar`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "funcionario@fastdemo.local", senha: "FastDemo2026!" }) });
  const setC = login.headers.get("set-cookie") || "";
  const m = setC.match(/fp_sessao=[^;]+/);
  ok("login real emite sessão", login.status === 200 && !!m, `status=${login.status}`);
  const JB = m ? m[0] : J;

  const home = await pega(`/`, JB);
  ok("página redireciona p/ /ciencia-pendente",
     [302,303,307,308].includes(home.status) && (home.headers.get("location")||"").includes("ciencia-pendente"),
     `status=${home.status} loc=${home.headers.get("location")}`);
  const apiBloq = await pega(`/api/colaboradores`, JB);
  ok("API fora da regularização = 403", apiBloq.status === 403, `status=${apiBloq.status}`);
  const pend = await pega(`/api/documentos/pendencias/minhas`, JB);
  ok("pendências/minhas alcançável e bloqueada", pend.status === 200 && pend.corpo?.bloqueada === true,
     `status=${pend.status} ${JSON.stringify(pend.corpo).slice(0,120)}`);

  const ciConduta = await fetch(`${BASE_URL}/api/documentos/${docConduta}/ciencia`, { method: "POST",
    redirect: "manual", headers: { cookie: JB, "content-type": "application/json" }, body: "{}" });
  const setC2 = (ciConduta.headers.get("set-cookie") || "").match(/fp_sessao=[^;]+/);
  ok("ciência 200/201 e reemite a sessão sem o claim", (ciConduta.status === 200 || ciConduta.status === 201) && !!setC2,
     `status=${ciConduta.status} temSetCookie=${!!setC2}`);
  const JB2 = setC2 ? setC2[0] : JB;
  const apiLivre = await pega(`/api/colaboradores`, JB2);
  ok("desbloqueado SEM relogar", apiLivre.status === 200, `status=${apiLivre.status}`);

  // neutralizar: v2 sem ciclo substitui a v1 (B3 — e limpa a demo)
  const v2 = await pega(`/api/documentos`, DP, { method: "POST", body: JSON.stringify({
    categoria: "politica", titulo: "Código de Conduta (prova) — encerrado", sensivel: false,
    exige_ciencia: false, bloqueante: false, substitui_documento_id: docConduta,
    nome_arquivo: "conduta-prova-v2.txt", mime: "text/plain",
    conteudo_base64: Buffer.from("Versão de encerramento da prova.").toString("base64") })});
  ok("v2 substitui e encerra o ciclo (demo limpa)", v2.status === 201, `status=${v2.status} ${JSON.stringify(v2.corpo).slice(0,140)}`);
  const reLogin = await fetch(`${BASE_URL}/api/identidade/entrar`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "gestor@fastdemo.local", senha: "FastDemo2026!" }) });
  const mG = (reLogin.headers.get("set-cookie") || "").match(/fp_sessao=[^;]+/);
  const homeG = await pega(`/portal-gestor`, mG ? mG[0] : G);
  ok("outro usuário loga livre após a substituição", ![302,303,307,308].includes(homeG.status) ||
     !(homeG.headers.get("location")||"").includes("ciencia-pendente"), `status=${homeG.status}`);

  // ---- 7. CSP com nonce
  console.log("\n[7 · CSP]");
  const entrar = await fetch(`${BASE_URL}/entrar`, { redirect: "manual" });
  const csp = entrar.headers.get("content-security-policy") || "";
  const script = (csp.split(";").find(p => p.trim().startsWith("script-src")) || "");
  ok("script-src tem nonce", /nonce-/.test(script), script.slice(0, 100));
  ok("script-src sem unsafe-inline", !script.includes("unsafe-inline"), script.slice(0, 140));
  const entrar2 = await fetch(`${BASE_URL}/entrar`, { redirect: "manual" });
  const nonce1 = (script.match(/nonce-([^' ]+)/) || [])[1];
  const nonce2 = ((entrar2.headers.get("content-security-policy") || "").match(/nonce-([^' ]+)/) || [])[1];
  ok("nonce muda a cada request", !!nonce1 && !!nonce2 && nonce1 !== nonce2);

  await db.end();
  console.log(`\n===== ${falha === 0 ? "PROVA OK" : "PROVA COM FALHAS"}: ${passa} ok, ${falha} falhas =====`);
  process.exit(falha === 0 ? 0 : 1);
})().catch(e => { console.error("ERRO DURO:", e.message); process.exit(2); });
