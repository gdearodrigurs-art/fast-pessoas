// Prova das TRÊS VISÕES da competência de folha (conferência) contra o dev na
// 3001. A tela mostra a mesma competência recortada por três cortes — por
// pessoa, por rubrica (o corte do contador) e por centro de custo (o rateio) —
// e a única forma de confiar nos três é provar que SOMAM O MESMO:
//
//   A. Σ(rubricas de natureza 'provento') == Σ(proventos por pessoa)
//   B. Σ(rubricas de natureza 'desconto') == Σ(descontos por pessoa)
//      (as rubricas 'informativa' — base INSS/FGTS etc. — ficam de fora: não
//       são provento nem desconto, e é justamente por isso que a soma tem de
//       filtrar por natureza, não somar a coluna toda.)
//   C. Σ(proventos por centro) == Σ(proventos por pessoa)
//   D. Σ(descontos por centro) == Σ(descontos por pessoa)
//   E. Σ(líquido por centro)   == Σ(líquido por pessoa)
//
//   PORTÃO DO FILTRO: recortar por UM centro de custo corta as TRÊS visões
//   juntas — o recorte soma menos que o total (cortou de verdade) e, dentro do
//   recorte, as três continuam reconciliando entre si. Filtro que só corta uma
//   visão deixaria a conferência mentindo.
//
// Sessão via db/logar-como.js (a folha.ver dispara 2FA; esta prova é sobre as
// somas, não sobre o segundo fator — e logar-como é a ferramenta para isso).
// Roda: node --env-file=.env.local-db provas/folha/prova-conferencia-3001.js
// Sai 0 se PASSOU, 1 se qualquer invariante caiu (portão de máquina).
const { Client } = require("pg");
const { execFileSync } = require("node:child_process");

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const PERSONA = "dp@fastdemo.local"; // compõe folha.ver

const reais = (centavos) => (centavos / 100).toFixed(2);
const soma = (lista, campo) => lista.reduce((s, x) => s + x[campo], 0);

let falhas = 0;
const checar = (ok, msg) => {
  console.log((ok ? "  ✅ " : "  ❌ ") + msg);
  if (!ok) falhas += 1;
};

async function api(cookie, caminho) {
  const r = await fetch(`${BASE}${caminho}`, { headers: { cookie } });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, dados };
}

// As três somas de uma visão já carregada, para reusar no total e no recorte.
function reconciliar(rotulo, visao) {
  const P = soma(visao.folhas, "total_proventos_centavos");
  const D = soma(visao.folhas, "total_descontos_centavos");
  const L = soma(visao.folhas, "liquido_centavos");
  const rub = visao.por_rubrica ?? [];
  const cc = visao.por_centro_custo ?? [];
  const rubProv = soma(rub.filter((r) => r.natureza === "provento"), "total_centavos");
  const rubDesc = soma(rub.filter((r) => r.natureza === "desconto"), "total_centavos");
  checar(rubProv === P, `${rotulo} A · rubrica.provento == pessoa.provento (${reais(rubProv)} == ${reais(P)})`);
  checar(rubDesc === D, `${rotulo} B · rubrica.desconto == pessoa.desconto (${reais(rubDesc)} == ${reais(D)})`);
  checar(soma(cc, "proventos_centavos") === P, `${rotulo} C · centro.provento == pessoa.provento (${reais(soma(cc, "proventos_centavos"))} == ${reais(P)})`);
  checar(soma(cc, "descontos_centavos") === D, `${rotulo} D · centro.desconto == pessoa.desconto`);
  checar(soma(cc, "liquido_centavos") === L, `${rotulo} E · centro.liquido == pessoa.liquido (${reais(soma(cc, "liquido_centavos"))} == ${reais(L)})`);
  return { P, D, L };
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ausente. Rode: node --env-file=.env.local-db provas/folha/prova-conferencia-3001.js");
    process.exit(1);
  }

  // Preflight: o servidor tem de estar de pé (401 é resposta; ECONNREFUSED não é).
  try {
    await fetch(`${BASE}/api/identidade/sessao`);
  } catch {
    console.error(`Servidor não respondeu em ${BASE}. Suba o db/servidor.js dev na 3001.`);
    process.exit(1);
  }

  const banco = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");

  // A competência com MAIS folhas calculadas — a prova sobrevive a reseed.
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const alvo = (await c.query(
    `SELECT competencia_id AS id, count(*)::int AS folhas
       FROM rh_folha.folha_colaborador
      GROUP BY competencia_id ORDER BY folhas DESC, competencia_id DESC LIMIT 1`
  )).rows[0];
  await c.end();
  if (!alvo) {
    console.error("Nenhuma competência com folha calculada — rode o semeador (db:demo).");
    process.exit(1);
  }
  console.log(`Conferência das três visões — competência ${alvo.id} (${alvo.folhas} folhas)\n`);

  // Sessão do DP sem provar 2FA (é o que a ferramenta faz e documenta).
  const cookie = execFileSync(
    "node",
    ["--env-file=.env.local-db", "db/logar-como.js", PERSONA, "--banco", banco],
    { encoding: "utf8" }
  ).trim();
  if (!cookie) throw new Error("logar-como não devolveu cookie");

  // 1. A competência inteira: as três visões reconciliam.
  console.log("1 — competência inteira, sem recorte");
  const inteira = await api(cookie, `/api/folha/${alvo.id}`);
  checar(inteira.status === 200, `DP lê a competência (HTTP ${inteira.status})`);
  if (inteira.status !== 200) {
    console.error("Sem payload — não dá para conferir. Resposta:", JSON.stringify(inteira.dados).slice(0, 200));
    process.exit(1);
  }
  const v = inteira.dados;
  checar((v.por_rubrica ?? []).length > 0, `há visão por rubrica (${(v.por_rubrica ?? []).length} rubricas)`);
  checar((v.por_centro_custo ?? []).length > 0, `há visão por centro de custo (${(v.por_centro_custo ?? []).length} centros)`);
  const temInformativa = (v.por_rubrica ?? []).some((r) => r.natureza === "informativa");
  console.log(`  · naturezas presentes: ${[...new Set((v.por_rubrica ?? []).map((r) => r.natureza))].join(", ")}${temInformativa ? " (informativa fora da soma, como tem que ser)" : ""}`);
  const totalInteira = reconciliar("inteira", v);

  // 2. PORTÃO DO FILTRO: recortar por um centro corta as três juntas.
  console.log("\n2 — recorte por UM centro de custo corta as três visões");
  const centroAlvo = (v.por_centro_custo ?? []).find((cc) => cc.centro_custo_id !== null);
  if (!centroAlvo) {
    checar(false, "nenhum centro de custo identificado para recortar — semeie a apropriação (db:demo)");
  } else if ((v.por_centro_custo ?? []).length < 2) {
    checar(false, "só há um centro de custo — não dá para provar que o filtro CORTA (semeie mais de um)");
  } else {
    const rec = await api(cookie, `/api/folha/${alvo.id}?centro_custo_id=${centroAlvo.centro_custo_id}`);
    checar(rec.status === 200, `recorte lê 200 (HTTP ${rec.status})`);
    const r = rec.dados;
    // O recorte por 1 centro deixa só aquele centro — mas pode virar MAIS de uma
    // linha se o centro recebe custo de empresas distintas (rateio intercompany).
    // O invariante é 1 centro DISTINTO, não 1 linha.
    const centrosNoRecorte = new Set((r.por_centro_custo ?? []).map((c) => c.centro_custo_id));
    checar(centrosNoRecorte.size === 1 && centrosNoRecorte.has(centroAlvo.centro_custo_id),
      `o recorte deixa só o centro pedido (${(r.por_centro_custo ?? []).length} linha(s), 1 centro distinto)`);
    const totalRecorte = reconciliar("recorte", r);
    // O recorte cortou de verdade: soma ESTRITAMENTE menos que a competência inteira.
    checar(totalRecorte.L < totalInteira.L && totalRecorte.L > 0,
      `o recorte soma menos que o total (líquido ${reais(totalRecorte.L)} < ${reais(totalInteira.L)})`);
    // A pessoa também foi recortada — a lista por pessoa encolheu junto com as outras duas.
    checar((r.folhas ?? []).length < (v.folhas ?? []).length,
      `a lista por pessoa encolheu junto (${(r.folhas ?? []).length} < ${(v.folhas ?? []).length})`);
  }

  console.log("\n" + (falhas === 0
    ? "✅ TRÊS VISÕES PROVADAS — por pessoa, por rubrica e por centro somam o mesmo, e o filtro corta as três juntas"
    : `❌ ${falhas} invariante(s) caíram`));
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
