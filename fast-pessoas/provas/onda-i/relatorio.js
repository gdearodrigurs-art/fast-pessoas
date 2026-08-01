const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const antigo = Number(process.argv[2]);
const novo = Number(process.argv[3]);
const pessoa = Number(process.argv[4]);
async function sql(q, p = []) { return (await pool.query(q, p)).rows; }
function t(s) { console.log(`\n----- ${s}`); }
(async () => {
  t('linha do tempo da PESSOA, atravessando os dois vínculos');
  console.table(await sql(
    `SELECT vinculo_matricula, tipo, ocorrido_em::date::text data, left(resumo, 90) resumo
       FROM rh.evento_da_pessoa WHERE pessoa_id = $1
      ORDER BY ocorrido_em DESC, id DESC LIMIT 8`, [pessoa]));

  t('eventos por vínculo — nada copiado, nada perdido');
  console.table(await sql(
    `SELECT vinculo_matricula, count(*)::int eventos FROM rh.evento_da_pessoa
      WHERE pessoa_id = $1 GROUP BY 1 ORDER BY 1`, [pessoa]));

  t('posição e alocação: a velha fecha na véspera, a nova abre no dia');
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
       FROM rh.lotacao l JOIN rh.colaborador c ON c.id = l.colaborador_id
       JOIN rh.lotacao_detalhada ld ON ld.id = l.id
      WHERE c.id IN ($1, $2) ORDER BY 1, 2, 3`, [antigo, novo]));

  t('o que ATRAVESSOU e o que NÃO atravessou');
  console.table(await sql(
    `SELECT 'dependentes' item,
            (SELECT count(*)::int FROM rh.dependente WHERE colaborador_id=$1) vinculo_antigo,
            (SELECT count(*)::int FROM rh.dependente WHERE colaborador_id=$2) vinculo_novo,
            (SELECT count(*)::int FROM rh.dependente WHERE colaborador_id=$2
              AND origem_dependente_id IS NOT NULL) com_rastro
     UNION ALL SELECT 'ferias: periodos aquisitivos',
            (SELECT count(*)::int FROM rh.periodo_aquisitivo WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.periodo_aquisitivo WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'banco de horas (saldo em minutos)',
            (SELECT coalesce(sum(minutos),0)::int FROM rh.banco_horas_movimento WHERE colaborador_id=$1),
            (SELECT coalesce(sum(minutos),0)::int FROM rh.banco_horas_movimento WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'documentos',
            (SELECT count(*)::int FROM rh.documento WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.documento WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'avaliacoes (ciclos)',
            (SELECT count(*)::int FROM rh.ciclo_avaliacao WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.ciclo_avaliacao WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'ocorrencias',
            (SELECT count(*)::int FROM rh.ocorrencia WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.ocorrencia WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'feedbacks formais',
            (SELECT count(*)::int FROM rh.feedback_formal WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.feedback_formal WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'aso (SST)',
            (SELECT count(*)::int FROM rh.aso WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.aso WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'marcacoes de ponto',
            (SELECT count(*)::int FROM rh.marcacao WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.marcacao WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'linhas de folha',
            (SELECT count(*)::int FROM rh_folha.folha_colaborador WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh_folha.folha_colaborador WHERE colaborador_id=$2), 0
     UNION ALL SELECT 'adesoes a beneficio',
            (SELECT count(*)::int FROM rh.adesao WHERE colaborador_id=$1),
            (SELECT count(*)::int FROM rh.adesao WHERE colaborador_id=$2), 0`,
    [antigo, novo]));

  t('o movimento do banco de horas gerado na saída');
  console.table(await sql(
    `SELECT colaborador_id, data::text, minutos, origem, left(observacao, 80) observacao
       FROM rh.banco_horas_movimento WHERE colaborador_id IN ($1,$2)
        AND origem = 'rescisao'`, [antigo, novo]));

  t('liderança nos dois sentidos');
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
      WHERE rg.gestor_colaborador_id IN ($1,$2) ORDER BY 2,1,4`, [antigo, novo]));

  t('turnover: a transferência não é saída nem entrada do GRUPO');
  console.table(await sql(
    `SELECT c.matricula, c.status, c.data_admissao::text adm, c.data_desligamento::text desl,
            rh.saiu_do_grupo(c.id) conta_como_saida,
            rh.entrou_no_grupo(c.id) conta_como_admissao
       FROM rh.colaborador c WHERE c.id IN ($1,$2) ORDER BY c.id`, [antigo, novo]));

  t('trilha de auditoria do efeito (audit.alteracao)');
  const trilha = await sql(
    `SELECT jsonb_pretty(diff) d FROM audit.alteracao
      WHERE tabela='rh.demanda_movimentacao' AND acao='efeito_movimentacao'
      ORDER BY id DESC LIMIT 1`);
  console.log(trilha[0]?.d);

  t('contagens globais');
  console.table(await sql(
    `SELECT (SELECT count(*) FROM rh.colaborador) vinculos,
            (SELECT count(*) FROM rh.pessoa) pessoas,
            (SELECT count(*) FROM sistema.usuario) usuarios,
            (SELECT count(*) FROM rh.colaborador WHERE sucede_vinculo_id IS NOT NULL) sucessoes`));
  await pool.end();
})().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
