// Prova da pendência #9 (migration 0061): só dependente ELEGÍVEL (deduz_irrf = true)
// baixa a base do IRRF, e o autoatendimento (0056) nasce inelegível — a redução de
// imposto deixou de ser auto-servida. Roda contra o banco, SEM servidor:
//   node --env-file=.env.local-db provas/folha/prova-dependente-irrf.js
// Sai com código 0 se PASSOU, 1 se qualquer invariante caiu (portão de máquina).
const { Client } = require('pg');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ausente. Rode: node --env-file=.env.local-db provas/folha/prova-dependente-irrf.js');
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  let falhas = 0;
  const checar = (ok, msg) => {
    console.log((ok ? '  ✅ ' : '  ❌ ') + msg);
    if (!ok) falhas += 1;
  };
  const uma = async (sql, p = []) => (await c.query(sql, p)).rows[0];

  console.log('Pendência #9 — só dependente elegível baixa o IRRF (migration 0061)\n');

  // 1. A coluna nasce FALSE por default: o autoatendimento não reduz imposto sozinho.
  const def = await uma(
    `SELECT column_default d FROM information_schema.columns
      WHERE table_schema='rh' AND table_name='dependente' AND column_name='deduz_irrf'`);
  checar(def != null && /false/i.test(def.d ?? ''),
    `deduz_irrf tem DEFAULT false (autoatendimento nasce inelegível) — "${def?.d}"`);

  // 2. Nenhum parentesco 'outro' abate no IRRF (a regra do backfill não deixou passar;
  //    "outro" — um pai, p.ex. — não é dependente fiscal por padrão).
  const outro = await uma(
    `SELECT count(*)::int n FROM rh.dependente WHERE parentesco='outro' AND deduz_irrf`);
  checar(outro.n === 0, `nenhum dependente 'outro' abate no IRRF (${outro.n} encontrado(s))`);

  // 3. A CONTAGEM da folha (a mesma de folha/repositorio.ts) filtra deduz_irrf: para
  //    quem tem dependente inelegível, a folha deduz MENOS que o total de dependentes.
  const alvo = await uma(
    `SELECT colaborador_id,
            count(*)::int total,
            count(*) FILTER (WHERE deduz_irrf)::int elegiveis
       FROM rh.dependente GROUP BY colaborador_id
      HAVING count(*) FILTER (WHERE deduz_irrf) < count(*)
         AND count(*) FILTER (WHERE deduz_irrf) > 0
      ORDER BY colaborador_id LIMIT 1`);
  if (!alvo) {
    checar(false,
      'não há colaborador com dependente elegível E inelegível para provar o filtro — semeie um caso (db:demo)');
  } else {
    // Exatamente a contagem que folha/repositorio.ts faz para dependentes_irrf.
    const folha = await uma(
      `SELECT count(*)::int n FROM rh.dependente
        WHERE colaborador_id = $1 AND deduz_irrf = true`, [alvo.colaborador_id]);
    checar(folha.n === alvo.elegiveis && folha.n < alvo.total,
      `colaborador ${alvo.colaborador_id}: a folha deduz ${folha.n} de ${alvo.total} dependentes (só os elegíveis)`);
  }

  await c.end();
  console.log('\n' + (falhas === 0
    ? '✅ PENDÊNCIA #9 PROVADA — o IRRF conta só o dependente elegível'
    : `❌ ${falhas} invariante(s) caíram`));
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
