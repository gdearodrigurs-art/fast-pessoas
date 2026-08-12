// Prova ponta a ponta da I3 — transferência entre empresas do grupo.
// Roda contra o dev server no ar (porta 3001) com o semeador já executado:
//   node --env-file=.env.local-db provas/onda-i/prova-i3.js
// Sai com código 0 se PASSOU, 1 se qualquer checagem falhou (portão de máquina).
const { execFileSync } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

const BASE = process.env.PROVA_BASE || 'http://localhost:3001';
const SENHA = 'FastDemo2026!';
// Raiz do app derivada do próprio arquivo — sem caminho chumbado, roda em qualquer máquina.
const RAIZ = path.join(__dirname, '..', '..');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Veredito de máquina: cada checagem soma em `falhas`; no fim, exit 1 se houver.
let falhas = 0;
function checar(ok, msg) {
  console.log((ok ? '  ✅ ' : '  ❌ ') + msg);
  if (!ok) falhas += 1;
}

function totp(email) {
  return execFileSync(
    process.execPath,
    ['--env-file=.env.local-db', 'db/codigo-2fa.js', email],
    { cwd: RAIZ, encoding: 'utf8' }
  ).trim().match(/\d{6}/)[0];
}

async function entrar(email, com2fa) {
  const corpo = { email, senha: SENHA };
  if (com2fa) corpo.codigo_totp = totp(email);
  const r = await fetch(`${BASE}/api/identidade/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(dados)}`);
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  return { cookie, usuario: dados.usuario };
}

async function api(sessao, metodo, caminho, corpo) {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      cookie: sessao.cookie,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await r.text();
  let dados;
  try { dados = JSON.parse(texto); } catch { dados = texto.slice(0, 300); }
  return { status: r.status, dados };
}

function titulo(t) { console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`); }
async function sql(q, p = []) { return (await pool.query(q, p)).rows; }

(async () => {
  const alvoNome = process.argv[2] ?? null;

  // Preflight: sem banco ou sem servidor, falha com mensagem clara em vez de stack.
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ausente. Rode: node --env-file=.env.local-db provas/onda-i/prova-i3.js');
    process.exit(1);
  }
  try {
    await fetch(BASE);
  } catch {
    console.error(`Servidor não respondeu em ${BASE}. Suba o dev (porta 3001) e rode o semeador (db:demo) antes.`);
    process.exit(1);
  }

  titulo('0. ESTADO ANTES');
  console.table(await sql(
    `SELECT (SELECT count(*) FROM rh.colaborador) vinculos,
            (SELECT count(*) FROM rh.pessoa) pessoas,
            (SELECT count(*) FROM sistema.usuario) usuarios,
            (SELECT count(*) FROM rh.colaborador WHERE sucede_vinculo_id IS NOT NULL) sucessoes`));

  // ---------------------------------------------------------------- escolhe alguém
  const [alvo] = await sql(
    `SELECT c.id, c.nome_completo, c.matricula, c.pessoa_id, c.cpf, c.usuario_id,
            ld.empresa_id, ld.empresa_nome,
            (SELECT count(*) FROM rh.dependente d WHERE d.colaborador_id = c.id)::int dependentes,
            (SELECT count(*) FROM rh.evento_colaborador e WHERE e.colaborador_id = c.id)::int eventos,
            (SELECT g.nome_completo FROM rh.relacao_gestor rg
               JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
              WHERE rg.liderado_colaborador_id = c.id AND rg.fim_vigencia IS NULL) gestor,
            (SELECT count(*) FROM rh.relacao_gestor rg
              WHERE rg.gestor_colaborador_id = c.id AND rg.fim_vigencia IS NULL)::int liderados,
            coalesce((SELECT sum(m.minutos) FROM rh.banco_horas_movimento m
              WHERE m.colaborador_id = c.id), 0)::int saldo_banco,
            (SELECT count(*) FROM rh.periodo_aquisitivo p WHERE p.colaborador_id = c.id)::int periodos
       FROM rh.colaborador c
       JOIN rh.lotacao_detalhada ld ON ld.colaborador_id = c.id AND ld.fim_vigencia IS NULL
      WHERE c.status = 'ativo'
        AND ($1::text IS NULL OR c.nome_completo = $1)
        AND EXISTS (SELECT 1 FROM rh.dependente d WHERE d.colaborador_id = c.id)
        AND EXISTS (SELECT 1 FROM rh.relacao_gestor rg
                     WHERE rg.liderado_colaborador_id = c.id AND rg.fim_vigencia IS NULL)
        -- Sem estabilidade acidentária (art. 118): a rescisão barra quem a tem,
        -- então um alvo com ela derrubaria a prova. Mesma régua do serviço.
        AND NOT EXISTS (SELECT 1 FROM rh.afastamento a
                         WHERE a.colaborador_id = c.id AND a.tipo = 'acidente_trabalho'
                           AND (a.fim IS NULL
                                OR a.fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                                            - INTERVAL '12 months'))
      ORDER BY (SELECT count(*) FROM rh.evento_colaborador e WHERE e.colaborador_id = c.id) DESC,
               c.id
      LIMIT 1`, [alvoNome]);
  if (!alvo) throw new Error('nenhum alvo com dependente e gestor vigente');
  alvo.id = Number(alvo.id); alvo.pessoa_id = Number(alvo.pessoa_id);
  alvo.empresa_id = Number(alvo.empresa_id); alvo.usuario_id = Number(alvo.usuario_id);
  console.log('\nALVO ESCOLHIDO:');
  console.table([alvo]);

  const [destino] = await sql(
    `SELECT e.id, v.nome_fantasia FROM rh.empresa_grupo e
       JOIN rh.empresa_grupo_versao v ON v.empresa_id = e.id AND v.status='ativa'
      WHERE e.id <> $1 AND e.inativada_em IS NULL ORDER BY e.id LIMIT 1`, [alvo.empresa_id]);
  const [local] = await sql(
    `SELECT estabelecimento_id id, unidade FROM rh.estabelecimento_versao
      WHERE status='ativa' ORDER BY estabelecimento_id LIMIT 1`);
  const [centro] = await sql(
    `SELECT id, codigo FROM rh.centro_custo WHERE empresa_id = $1 AND inativado_em IS NULL LIMIT 1`,
    [destino.id]);
  destino.id = Number(destino.id); local.id = Number(local.id); centro.id = Number(centro.id);
  const matriculaNova = 'T3-' + String(Date.now()).slice(-6);
  // Data pretendida = HOJE: desde a onda A4 o efeito espera a data pretendida, e
  // aplica na própria aprovação quando a data já chegou (<= hoje). Com amanhã, a
  // movimentação ficaria só programada e o vínculo novo não nasceria nesta prova.
  const [{ hoje }] = await sql(
    `SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::text hoje`);

  console.log(`\nDESTINO: ${destino.nome_fantasia} · ${local.unidade} · ${centro.codigo}`);
  console.log(`MATRÍCULA NOVA: ${matriculaNova} · VIGÊNCIA: ${hoje}`);

  // ---------------------------------------------------------------- negativos
  titulo('1. NEGATIVOS — quem não pode, não abre');
  const gestor = await entrar('gestor@fastdemo.local', false);
  const opcoesGestor = await api(gestor, 'GET', '/api/demandas/movimentacao/opcoes');
  console.log('gestor: empresas oferecidas no formulário =',
    JSON.stringify(opcoesGestor.dados.empresas));
  const tentativaGestor = await api(gestor, 'POST', '/api/demandas/movimentacao', {
    tipo: 'transferencia_empresa', colaborador_id: alvo.id,
    empresa_destino_id: destino.id, estabelecimento_destino_id: local.id,
    centro_custo_destino_id: centro.id, matricula_destino: matriculaNova,
    modo_transferencia: 'rescisao', data_pretendida: hoje, justificativa: 'tentativa do gestor',
  });
  console.log('gestor POST transferencia_empresa →', tentativaGestor.status,
    JSON.stringify(tentativaGestor.dados));
  checar(tentativaGestor.status >= 400, 'gestor NÃO abre transferência entre empresas');

  // ---------------------------------------------------------------- abre o pedido
  titulo('2. DP ABRE O PEDIDO');
  const dp = await entrar('dp@fastdemo.local', true);
  const opcoesDp = await api(dp, 'GET', '/api/demandas/movimentacao/opcoes');
  console.log('dp: opcoes →', opcoesDp.status,
    JSON.stringify(opcoesDp.dados.empresas ?? opcoesDp.dados).slice(0, 400));

  // negativo: mesma empresa
  const mesma = await api(dp, 'POST', '/api/demandas/movimentacao', {
    tipo: 'transferencia_empresa', colaborador_id: alvo.id,
    empresa_destino_id: alvo.empresa_id, estabelecimento_destino_id: local.id,
    centro_custo_destino_id: centro.id, matricula_destino: matriculaNova,
    modo_transferencia: 'rescisao', data_pretendida: hoje, justificativa: 'mesma empresa',
  });
  console.log('destino = empresa atual →', mesma.status, JSON.stringify(mesma.dados));
  checar(mesma.status >= 400, 'destino = empresa atual é rejeitado');

  // negativo: matrícula já usada
  const repetida = await api(dp, 'POST', '/api/demandas/movimentacao', {
    tipo: 'transferencia_empresa', colaborador_id: alvo.id,
    empresa_destino_id: destino.id, estabelecimento_destino_id: local.id,
    centro_custo_destino_id: centro.id, matricula_destino: alvo.matricula,
    modo_transferencia: 'rescisao', data_pretendida: hoje, justificativa: 'matrícula repetida',
  });
  console.log('matrícula já em uso →', repetida.status, JSON.stringify(repetida.dados));
  checar(repetida.status >= 400, 'matrícula já em uso é rejeitada');

  // negativo: com salário
  const comSalario = await api(dp, 'POST', '/api/demandas/movimentacao', {
    tipo: 'transferencia_empresa', colaborador_id: alvo.id,
    empresa_destino_id: destino.id, estabelecimento_destino_id: local.id,
    centro_custo_destino_id: centro.id, matricula_destino: matriculaNova,
    modo_transferencia: 'rescisao', salario_proposto: 9999, data_pretendida: hoje, justificativa: 'com aumento',
  });
  console.log('com salário proposto →', comSalario.status, JSON.stringify(comSalario.dados));
  checar(comSalario.status >= 400, 'salário proposto na transferência é rejeitado');

  // o pedido de verdade
  const criado = await api(dp, 'POST', '/api/demandas/movimentacao', {
    tipo: 'transferencia_empresa', colaborador_id: alvo.id,
    empresa_destino_id: destino.id, estabelecimento_destino_id: local.id,
    centro_custo_destino_id: centro.id, matricula_destino: matriculaNova,
    modo_transferencia: 'rescisao', data_pretendida: hoje,
    justificativa: 'Reestruturação do grupo: a operação em que ele atua passou para a outra empresa.',
  });
  console.log('\nPOST /api/demandas/movimentacao →', criado.status);
  if (criado.status !== 201 && criado.status !== 200) {
    console.log(JSON.stringify(criado.dados, null, 2));
    throw new Error('não criou');
  }
  const pedido = criado.dados.pedido;
  const demandaId = pedido.demanda.id;
  console.log('demanda', demandaId, '·', pedido.demanda.descricao);
  console.log('etapas:', JSON.stringify(pedido.etapas.map(
    (e) => `${e.ordem}/${e.nivel}/${e.status}`)));

  // ---------------------------------------------------------------- cadeia
  titulo('3. CADEIA LÍDER → DIRETORIA');
  const pendente = pedido.etapas.find((e) => e.status === 'pendente');
  if (pendente && pendente.nivel === 'lider') {
    const [{ email: emailLider }] = await sql(
      `SELECT u.email FROM rh.relacao_gestor rg
         JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
         JOIN sistema.usuario u ON u.id = g.usuario_id
        WHERE rg.liderado_colaborador_id = $1 AND rg.fim_vigencia IS NULL`, [alvo.id]);
    const [{ exige }] = await sql(
      `SELECT sistema.exige_2fa(u.id) exige FROM sistema.usuario u WHERE u.email = $1`,
      [emailLider]);
    const lider = await entrar(emailLider, exige);
    const dec = await api(lider, 'POST', `/api/demandas/${demandaId}/decidir-etapa`,
      { decisao: 'aprovar' });
    console.log(`líder ${emailLider} aprova →`, dec.status,
      JSON.stringify((dec.dados.pedido ?? dec.dados).etapas?.map((e) => `${e.ordem}/${e.nivel}/${e.status}`)));
  }

  const diretora = await entrar('diretora.pessoas@fastdemo.local', true);
  const final = await api(diretora, 'POST', `/api/demandas/${demandaId}/decidir-etapa`,
    { decisao: 'aprovar' });
  console.log('diretoria aprova →', final.status);
  if (final.status !== 200) {
    console.log(JSON.stringify(final.dados, null, 2));
    throw new Error('a aprovação final falhou');
  }
  const cartao = final.dados.pedido ?? final.dados;
  console.log('status da demanda:', cartao.demanda.status);
  console.log('movimentação aplicada em:', cartao.movimentacao.aplicada_em);
  console.log('vínculo destino:', cartao.movimentacao.vinculo_destino_id,
    'matrícula', cartao.movimentacao.vinculo_destino_matricula);

  // ---------------------------------------------------------------- prova SQL
  titulo('4. PROVA POR SQL — DOIS VÍNCULOS, UMA PESSOA, UM USUÁRIO');
  console.log('\n-- os vínculos da pessoa');
  console.table(await sql(
    `SELECT id, matricula, tipo_vinculo, status,
            data_admissao::text, data_desligamento::text,
            empresa_nome, sucede_vinculo_id, sucedido_por_vinculo_id
       FROM rh.vinculos_da_pessoa($1)`, [alvo.pessoa_id]));

  console.log('\n-- contagens: 2 vínculos, 1 pessoa, 1 usuário, 1 CPF');
  console.table(await sql(
    `SELECT count(*) vinculos, count(DISTINCT c.pessoa_id) pessoas,
            count(DISTINCT c.cpf) cpfs, count(DISTINCT c.usuario_id) usuarios,
            count(DISTINCT u.email) emails
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.id = c.usuario_id
      WHERE c.pessoa_id = $1`, [alvo.pessoa_id]));

  console.log('\n-- a linha do tempo ATRAVESSA os dois vínculos');
  console.table(await sql(
    `SELECT vinculo_matricula, tipo, ocorrido_em::date::text data, left(resumo, 78) resumo
       FROM rh.evento_da_pessoa WHERE pessoa_id = $1
      ORDER BY ocorrido_em DESC, id DESC LIMIT 10`, [alvo.pessoa_id]));

  console.log('\n-- eventos por vínculo (o histórico NÃO foi copiado nem perdido)');
  console.table(await sql(
    `SELECT vinculo_matricula, count(*)::int eventos
       FROM rh.evento_da_pessoa WHERE pessoa_id = $1
      GROUP BY 1 ORDER BY 1`, [alvo.pessoa_id]));

  const novoId = cartao.movimentacao.vinculo_destino_id;
  checar(novoId != null, 'a movimentação APLICOU na aprovação e criou o vínculo novo');

  // Invariantes DUROS da transferência (viram veredito de máquina).
  const [inv] = novoId != null ? await sql(
    `SELECT n.sucede_vinculo_id::int sucede, n.pessoa_id::int novo_pessoa,
            n.usuario_id::int novo_usuario, v.pessoa_id::int velho_pessoa,
            v.usuario_id::int velho_usuario, v.status velho_status
       FROM rh.colaborador n, rh.colaborador v
      WHERE n.id = $1 AND v.id = $2`, [novoId, alvo.id]) : [undefined];
  checar(inv?.sucede === alvo.id, 'o vínculo NOVO sucede o antigo (sucede_vinculo_id)');
  checar(inv?.novo_pessoa === alvo.pessoa_id && inv?.velho_pessoa === alvo.pessoa_id,
    'MESMA pessoa nos dois vínculos');
  checar(inv?.novo_usuario === alvo.usuario_id && inv?.velho_usuario === alvo.usuario_id,
    'MESMO usuário (login) nos dois vínculos');
  checar(inv?.velho_status === 'desligado', 'o vínculo ANTIGO ficou desligado');

  console.log('\n-- posição e alocação: a velha fechou na véspera, a nova abriu');
  console.table(await sql(
    `SELECT c.matricula, 'posicao' o, p.inicio_vigencia::text ini, p.fim_vigencia::text fim,
            cv.nome detalhe, p.salario::text valor
       FROM rh.posicao_colaborador p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
      WHERE c.id IN ($1, $2)
      UNION ALL
     SELECT c.matricula, 'lotacao', l.inicio_vigencia::text, l.fim_vigencia::text,
            ld.empresa_nome || ' / ' || ld.lotacao_nome, ld.centro_custo
       FROM rh.lotacao l
       JOIN rh.colaborador c ON c.id = l.colaborador_id
       JOIN rh.lotacao_detalhada ld ON ld.id = l.id
      WHERE c.id IN ($1, $2)
      ORDER BY 1, 2, 3`, [alvo.id, novoId]));

  console.log('\n-- o que ATRAVESSOU e o que NÃO atravessou');
  console.table(await sql(
    `SELECT 'dependentes' item,
            (SELECT count(*)::int FROM rh.dependente WHERE colaborador_id=$1) no_vinculo_antigo,
            (SELECT count(*)::int FROM rh.dependente WHERE colaborador_id=$2) no_vinculo_novo,
            (SELECT count(*)::int FROM rh.dependente WHERE colaborador_id=$2
              AND origem_dependente_id IS NOT NULL) com_rastro
     UNION ALL SELECT 'periodo aquisitivo de ferias',
            (SELECT count(*)::int FROM rh.periodo_aquisitivo WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.periodo_aquisitivo WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'documentos',
            (SELECT count(*)::int FROM rh.documento WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.documento WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'avaliacoes (ciclos)',
            (SELECT count(*)::int FROM rh.ciclo_avaliacao WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.ciclo_avaliacao WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'ocorrencias',
            (SELECT count(*)::int FROM rh.ocorrencia WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.ocorrencia WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'aso',
            (SELECT count(*)::int FROM rh.aso WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.aso WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'marcacoes de ponto',
            (SELECT count(*)::int FROM rh.marcacao WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.marcacao WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'banco de horas (minutos de saldo)',
            (SELECT coalesce(sum(minutos),0)::int FROM rh.banco_horas_movimento WHERE colaborador_id=$1),
            (SELECT coalesce(sum(minutos),0)::int FROM rh.banco_horas_movimento WHERE colaborador_id=$2), 0`,
    [alvo.id, novoId]));

  console.log('\n-- liderança: o líder seguiu, e os liderados também');
  console.table(await sql(
    `SELECT c.matricula, 'e liderado de' rel, g.nome_completo outro,
            rg.inicio_vigencia::text ini, rg.fim_vigencia::text fim
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador c ON c.id = rg.liderado_colaborador_id
       JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
      WHERE rg.liderado_colaborador_id IN ($1,$2)
      UNION ALL
     SELECT c.matricula, 'e gestor de', l.nome_completo,
            rg.inicio_vigencia::text, rg.fim_vigencia::text
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador c ON c.id = rg.gestor_colaborador_id
       JOIN rh.colaborador l ON l.id = rg.liderado_colaborador_id
      WHERE rg.gestor_colaborador_id IN ($1,$2)
      ORDER BY 2,1,4`, [alvo.id, novoId]));

  console.log('\n-- turnover NÃO conta a transferência como saída/entrada do grupo');
  console.table(await sql(
    `SELECT c.matricula, c.status,
            c.data_admissao::text, c.data_desligamento::text,
            rh.saiu_do_grupo(c.id) conta_como_saida,
            rh.entrou_no_grupo(c.id) conta_como_admissao
       FROM rh.colaborador c WHERE c.id IN ($1,$2) ORDER BY c.id`, [alvo.id, novoId]));

  console.log('\n-- trilha de auditoria do efeito');
  const trilha = await sql(
    `SELECT acao, tabela, jsonb_pretty(diff) diff FROM audit.alteracao
      WHERE tabela = 'rh.demanda_movimentacao' AND acao = 'efeito_movimentacao'
      ORDER BY id DESC LIMIT 1`);
  console.log(trilha[0]?.diff);

  titulo('5. AS TELAS RESPONDEM');
  for (const [rotulo, caminho] of [
    ['ficha do vínculo NOVO', `/api/colaboradores/${novoId}`],
    ['ficha do vínculo ANTIGO', `/api/colaboradores/${alvo.id}`],
    ['lista /colaboradores', '/api/colaboradores'],
    ['organograma', '/api/organograma'],
  ]) {
    const r = await api(dp, 'GET', caminho);
    console.log(`${rotulo} → ${r.status}`);
    checar(r.status === 200, `tela ${rotulo} responde 200`);
    if (caminho.startsWith('/api/colaboradores/')) {
      // A ficha veio a ser aninhada em { colaborador: {...} } — desembrulha.
      const f = r.dados.colaborador ?? r.dados;
      console.log(`   ${f.nome_completo} · matrícula ${f.matricula} · ${f.status}` +
        ` · REGISTRO ${f.empresa_nome} · LOTAÇÃO ${f.unidade} · CC ${f.centro_custo}` +
        ` · vínculos na ficha: ${f.vinculos?.length}`);
      checar((f.vinculos?.length ?? 0) >= 2, `ficha (${rotulo}) mostra os dois vínculos`);
    }
    if (caminho === '/api/colaboradores') {
      const linhas = (r.dados.colaboradores ?? r.dados).filter?.(
        (c) => c.id === alvo.id || c.id === novoId) ?? [];
      console.table(linhas.map((c) => ({
        id: c.id, matricula: c.matricula, nome: c.nome_completo,
        status: c.status, unidade: c.unidade })));
    }
    if (caminho === '/api/organograma') {
      const nos = (r.dados.nos ?? r.dados.colaboradores ?? []);
      const achados = nos.filter((n) => n.id === alvo.id || n.id === novoId);
      console.log('   no organograma:', JSON.stringify(achados.map(
        (n) => ({ id: n.id, nome: n.nome_completo ?? n.nome, unidade: n.unidade }))));
    }
  }

  titulo('6. ESTADO DEPOIS');
  console.table(await sql(
    `SELECT (SELECT count(*) FROM rh.colaborador) vinculos,
            (SELECT count(*) FROM rh.pessoa) pessoas,
            (SELECT count(*) FROM sistema.usuario) usuarios,
            (SELECT count(*) FROM rh.colaborador WHERE sucede_vinculo_id IS NOT NULL) sucessoes`));

  console.log(`\nIDS PARA LIMPEZA: demanda=${demandaId} vinculo_novo=${novoId} vinculo_antigo=${alvo.id} pessoa=${alvo.pessoa_id}`);
  console.log('\n' + '='.repeat(70));
  console.log(falhas === 0
    ? '✅ PROVA DA ONDA I (transferência entre empresas) PASSOU'
    : `❌ PROVA FALHOU — ${falhas} checagem(ns) não passaram`);
  await pool.end();
  process.exit(falhas === 0 ? 0 : 1);
})().catch(async (e) => { console.error('FALHOU:', e); await pool.end(); process.exit(1); });
