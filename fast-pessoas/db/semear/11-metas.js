// db/semear/11-metas.js — metas da Central de Metas (rh.meta_indicador_versao).
//
// O que este módulo cria (e só isto):
//   • rh.meta_indicador_versao — metas globais e por unidade, ATIVAS, mais o
//     histórico de versões ENCERRADAS que mostra o versionamento na tela.
//
// NÃO cria/edita rh.indicador: o catálogo é seed estrutural das migrations
// 0005, 0016 e 0018. Se alguma chave esperada faltar, o módulo aborta pedindo
// `npm run db:migrar` — é sinal de banco desatualizado, não de bug da demo.
//
// História plantada para a apresentação (o farol da tela /metas):
//
//   VERMELHO (assunto para a diretora)
//     entrevista_desligamento  meta 90%  ·  real ~71%  → poucas entrevistas
//                              feitas nos desligamentos do último ano
//     admissao_prazo           meta 95%  ·  real ~67%  → dossiê fechando
//                              depois do primeiro dia
//     ferias_vencidas          meta   0  ·  real    5  → risco de férias em
//                              dobro (art. 137 da CLT)
//     enps                     meta  30  ·  real  ~25  → clima da rede abaixo do
//                              pactuado, com uma unidade em eNPS negativo — é o
//                              farol que explica os planos de ação de 13-pesquisas
//   VERDE (o que está no lugar)
//     vagas_no_prazo           meta 80%  ·  real  100%
//     asos_validos             meta 75%  ·  real  ~77%
//     folha_no_prazo           meta 98%  ·  real  100%
//     adesao_pesquisa          meta 70%  ·  real  ~76%
//
// Os valores reais vêm das fontes de src/dominios/indicadores/valores.ts, que
// leem o que os módulos 05–10 semearam. As metas acima foram escolhidas para
// que o farol saia MISTO — uma tela toda verde não dá conversa, uma toda
// vermelha não é crível.
//
// avaliacao_ciclo, turnover e tempo_admissao ganham meta mas ainda NÃO têm
// fonte no registry (src/dominios/indicadores/valores.ts): aparecem na Central
// de Metas com a meta definida e sem farol. É proposital — mostra a diferença
// entre "meta pactuada" e "indicador já instrumentado".
//
// Escopo por unidade: dois indicadores recebem metas por filial (a tela agrupa
// meta global + metas de unidade no mesmo cartão). Serve para demonstrar que a
// diretoria pode cobrar a Matriz mais que uma filial recém-aberta.
//
// Histórico: três indicadores têm uma versão ENCERRADA antes da ativa. A tela
// de versões mostra quem mudou a meta, quando e a partir de qual vigência —
// meta nunca é sobrescrita, sempre versionada (migration 0005).
//
// Uso isolado: node --env-file=.env db/semear/11-metas.js
/* eslint-disable @typescript-eslint/no-require-imports -- script CLI CommonJS, como db/migrar.js */

const {
  comTriggersDesligados,
  executarSozinho,
  inserirLote,
  iso,
  isoInstante,
  log,
  mesesAtras,
} = require('./comum');

// Autores das metas — resolvidos por e-mail (o id muda a cada reset).
const AUTOR_DIRETORIA = 'diretora.pessoas@fastdemo.local';
const AUTOR_RH = 'rh@fastdemo.local';
const AUTOR_DP = 'dp@fastdemo.local';

const ESCOPO_GLOBAL = 'global'; // igual a src/dominios/indicadores/esquemas.ts

/**
 * ROTEIRO declarativo: uma entrada por indicador, com a versão ATIVA e, quando
 * houver, as versões ENCERRADAS que a antecederam.
 *
 *   valor            número na unidade do indicador ('%', 'qtd', 'dias')
 *   vigencia_meses   meses atrás em que a vigência começou
 *   encerrada_meses  meses atrás em que a versão foi encerrada (só histórico)
 *   escopo           ESCOPO_GLOBAL ou nome EXATO da unidade
 *                    (rh.estabelecimento_versao.unidade, conferido em tempo
 *                    de execução — errar o nome é erro de digitação silencioso)
 */
const ROTEIRO = [
  {
    chave: 'entrevista_desligamento',
    porque: 'indicador oficial do setor; meta apertada de 80% para 90% no meio do ano',
    metas: [
      // Histórico: a meta original era 80% e foi endurecida pela diretoria.
      {
        escopo: ESCOPO_GLOBAL,
        valor: 80,
        vigencia_meses: 14,
        encerrada_meses: 6,
        autor: AUTOR_DIRETORIA,
      },
      { escopo: ESCOPO_GLOBAL, valor: 90, vigencia_meses: 6, autor: AUTOR_DIRETORIA },
      // Por unidade: a Matriz responde por si e é cobrada no limite.
      { escopo: 'Matriz Centro', valor: 100, vigencia_meses: 6, autor: AUTOR_DIRETORIA },
      { escopo: 'Filial Norte', valor: 85, vigencia_meses: 6, autor: AUTOR_DIRETORIA },
      { escopo: 'Filial Leste', valor: 85, vigencia_meses: 3, autor: AUTOR_RH },
    ],
  },
  {
    chave: 'ferias_vencidas',
    porque: 'alvo natural é zero; a meta de transição (2) foi encerrada quando o passivo caiu',
    metas: [
      {
        escopo: ESCOPO_GLOBAL,
        valor: 3,
        vigencia_meses: 12,
        encerrada_meses: 4,
        autor: AUTOR_DP,
      },
      { escopo: ESCOPO_GLOBAL, valor: 0, vigencia_meses: 4, autor: AUTOR_DP },
    ],
  },
  {
    chave: 'admissao_prazo',
    porque: 'dossiê completo antes do primeiro dia — exigência do eSocial',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 95, vigencia_meses: 9, autor: AUTOR_DP }],
  },
  {
    chave: 'vagas_no_prazo',
    porque: 'prazo-alvo pactuado com os gestores na abertura da vaga',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 80, vigencia_meses: 5, autor: AUTOR_RH }],
  },
  {
    chave: 'adesao_checkin',
    porque: 'meta pactuada sem fonte instrumentada ainda — aparece sem farol, de propósito',
    metas: [
      {
        escopo: ESCOPO_GLOBAL,
        valor: 60,
        vigencia_meses: 8,
        encerrada_meses: 3,
        autor: AUTOR_RH,
      },
      { escopo: ESCOPO_GLOBAL, valor: 70, vigencia_meses: 3, autor: AUTOR_RH },
      // Por unidade: a Norte entrou depois e tem meta menor no primeiro ciclo.
      { escopo: 'Matriz Centro', valor: 80, vigencia_meses: 3, autor: AUTOR_RH },
      { escopo: 'Filial Sul', valor: 75, vigencia_meses: 3, autor: AUTOR_RH },
      { escopo: 'Filial Norte', valor: 55, vigencia_meses: 2, autor: AUTOR_RH },
      { escopo: 'Filial Oeste', valor: 65, vigencia_meses: 2, autor: AUTOR_RH },
    ],
  },
  {
    chave: 'asos_validos',
    porque: 'ASO vigente é obrigação legal; meta atingível para dar um verde crível',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 75, vigencia_meses: 7, autor: AUTOR_DP }],
  },
  {
    chave: 'adesao_pesquisa',
    porque:
      'adesão da pesquisa anual (13-pesquisas semeia ~76%): meta batida, e é o que dá ' +
      'credibilidade ao eNPS logo abaixo — resultado de amostra pequena não se discute',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 70, vigencia_meses: 6, autor: AUTOR_RH }],
  },
  {
    chave: 'enps',
    porque:
      'eNPS pactuado com a diretoria em 30 pontos e a rede está abaixo (13-pesquisas semeia ' +
      '~25, com uma unidade em eNPS negativo). É o vermelho que EXPLICA os dois planos de ' +
      'ação da pesquisa — farol e plano contando a mesma história',
    metas: [
      // Primeira meta foi 20 (o ponto de partida medido na primeira pesquisa) e
      // subiu para 30 quando a diretoria assumiu clima como indicador do comitê.
      {
        escopo: ESCOPO_GLOBAL,
        valor: 20,
        vigencia_meses: 9,
        encerrada_meses: 3,
        autor: AUTOR_RH,
      },
      { escopo: ESCOPO_GLOBAL, valor: 30, vigencia_meses: 3, autor: AUTOR_DIRETORIA },
    ],
  },
  {
    chave: 'folha_no_prazo',
    porque: 'fechamento até o dia 5 do mês seguinte',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 98, vigencia_meses: 11, autor: AUTOR_DP }],
  },
  {
    chave: 'avaliacao_ciclo',
    porque: 'meta do ciclo 360 (fonte ainda não instrumentada)',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 90, vigencia_meses: 6, autor: AUTOR_RH }],
  },
  {
    chave: 'turnover',
    porque: 'teto mensal acompanhado pela diretoria',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 2.5, vigencia_meses: 10, autor: AUTOR_DIRETORIA }],
  },
  {
    chave: 'tempo_admissao',
    porque: 'da aprovação da requisição ao primeiro dia',
    metas: [{ escopo: ESCOPO_GLOBAL, valor: 25, vigencia_meses: 10, autor: AUTOR_RH }],
  },
];

// ------------------------------------------------------------------ resolução

async function resolverIndicadores(cliente) {
  const { rows } = await cliente.query(
    'SELECT id, chave, nome, unidade, direcao FROM rh.indicador WHERE ativo'
  );
  const porChave = new Map(rows.map((linha) => [linha.chave, { ...linha, id: Number(linha.id) }]));

  const faltando = ROTEIRO.map((item) => item.chave).filter((chave) => !porChave.has(chave));
  if (faltando.length > 0) {
    throw new Error(
      `Indicadores ausentes no catálogo rh.indicador: ${faltando.join(', ')}. ` +
        'O catálogo vem das migrations 0005/0016/0018 — rode `npm run db:migrar` antes da demo.'
    );
  }
  return porChave;
}

async function resolverAutores(cliente) {
  const emails = [AUTOR_DIRETORIA, AUTOR_RH, AUTOR_DP];
  const { rows } = await cliente.query(
    'SELECT id, email, nome FROM sistema.usuario WHERE email = ANY($1)',
    [emails]
  );
  const porEmail = new Map(rows.map((linha) => [linha.email, { ...linha, id: Number(linha.id) }]));
  const faltando = emails.filter((email) => !porEmail.has(email));
  if (faltando.length > 0) {
    throw new Error(
      `Usuários de demonstração ausentes: ${faltando.join(', ')} — rode 01-base antes de 11-metas.`
    );
  }
  return porEmail;
}

async function resolverUnidades(cliente) {
  const { rows } = await cliente.query(
    "SELECT DISTINCT unidade FROM rh.estabelecimento_versao WHERE status = 'ativa'"
  );
  return new Set(rows.map((linha) => linha.unidade));
}

// ------------------------------------------------------------------ semeadura

async function semear(cliente) {
  // Idempotência: apaga só o que ESTE módulo cria. O trigger
  // meta_versao_protegida bloqueia DELETE (versão é histórico, nunca some pela
  // aplicação) — desligamos os triggers de aplicação da tabela dentro da
  // transação e a própria transação os religa.
  const apagados = await comTriggersDesligados(cliente, ['rh.meta_indicador_versao'], async () => {
    const { rowCount } = await cliente.query('DELETE FROM rh.meta_indicador_versao');
    return rowCount;
  });
  if (apagados > 0) log(`11-metas: ${apagados} versão(ões) de meta anterior(es) removida(s).`);

  // Em série, nunca em Promise.all: é UM Client do pg, e consultas paralelas
  // no mesmo Client são deprecadas (removidas no pg@9).
  const indicadores = await resolverIndicadores(cliente);
  const autores = await resolverAutores(cliente);
  const unidades = await resolverUnidades(cliente);

  const linhas = [];
  const ativasPorChave = new Map(); // indicador_id|escopo -> impede duas ativas

  for (const item of ROTEIRO) {
    const indicador = indicadores.get(item.chave);

    for (const meta of item.metas) {
      if (meta.escopo !== ESCOPO_GLOBAL && !unidades.has(meta.escopo)) {
        throw new Error(
          `Escopo "${meta.escopo}" (indicador ${item.chave}) não é uma unidade ativa. ` +
            `Unidades: ${[...unidades].sort().join(', ')}.`
        );
      }
      const autor = autores.get(meta.autor);
      const encerrada = meta.encerrada_meses !== undefined;

      if (!encerrada) {
        // Espelha o índice único meta_indicador_ativa_unica antes de bater no
        // banco: erro aqui aponta a linha errada do ROTEIRO, não um 23505 cru.
        const chaveAtiva = `${indicador.id}|${meta.escopo}`;
        if (ativasPorChave.has(chaveAtiva)) {
          throw new Error(
            `Duas metas ATIVAS para ${item.chave} no escopo "${meta.escopo}" — ` +
              'só uma pode ficar ativa (índice meta_indicador_ativa_unica).'
          );
        }
        ativasPorChave.set(chaveAtiva, meta);
      } else if (meta.encerrada_meses > meta.vigencia_meses) {
        throw new Error(
          `Meta de ${item.chave} encerrada antes de entrar em vigor ` +
            `(vigência ${meta.vigencia_meses}m atrás, encerrada ${meta.encerrada_meses}m atrás).`
        );
      }

      // criado_em = início da vigência (a meta foi cadastrada no dia em que
      // passou a valer); encerrada_em = quando a substituta entrou.
      const inicio = mesesAtras(meta.vigencia_meses);
      linhas.push([
        indicador.id,
        meta.escopo,
        meta.valor,
        iso(inicio),
        encerrada ? 'encerrada' : 'ativa',
        encerrada ? isoInstante(mesesAtras(meta.encerrada_meses)) : null,
        autor.id,
        isoInstante(inicio),
      ]);
    }
  }

  await inserirLote(
    cliente,
    'rh.meta_indicador_versao',
    [
      'indicador_id',
      'escopo',
      'valor',
      'inicio_vigencia',
      'status',
      'encerrada_em',
      'criado_por_usuario',
      'criado_em',
    ],
    linhas
  );

  // ---------------------------------------------------------- conferência
  const { rows: resumo } = await cliente.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'ativa')::int AS ativas,
            count(*) FILTER (WHERE status = 'encerrada')::int AS encerradas,
            count(*) FILTER (WHERE status = 'ativa' AND escopo <> $1)::int AS por_unidade,
            count(DISTINCT indicador_id)::int AS indicadores
       FROM rh.meta_indicador_versao`,
    [ESCOPO_GLOBAL]
  );
  const totais = resumo[0];

  const { rows: comHistorico } = await cliente.query(
    `SELECT count(*)::int AS total FROM (
       SELECT indicador_id, escopo
         FROM rh.meta_indicador_versao
        GROUP BY indicador_id, escopo
       HAVING count(*) > 1) AS h`
  );
  if (comHistorico[0].total < 1) {
    throw new Error('Nenhum indicador ficou com histórico de versões — a demo perde o versionamento.');
  }

  const { rows: unidadesComMeta } = await cliente.query(
    `SELECT count(DISTINCT indicador_id)::int AS total
       FROM rh.meta_indicador_versao
      WHERE status = 'ativa' AND escopo <> $1`,
    [ESCOPO_GLOBAL]
  );
  if (unidadesComMeta[0].total < 2) {
    throw new Error('Menos de 2 indicadores com meta por unidade — o escopo por unidade não aparece.');
  }

  // Nenhuma órfã: toda meta aponta para indicador ativo do catálogo.
  const { rows: orfas } = await cliente.query(
    `SELECT count(*)::int AS total
       FROM rh.meta_indicador_versao m
       LEFT JOIN rh.indicador i ON i.id = m.indicador_id AND i.ativo
      WHERE i.id IS NULL`
  );
  if (orfas[0].total > 0) {
    throw new Error(`${orfas[0].total} meta(s) apontando para indicador inativo/inexistente.`);
  }

  log(
    `11-metas: ${totais.total} versões de meta em ${totais.indicadores} indicadores — ` +
      `${totais.ativas} ativas (${totais.por_unidade} por unidade) e ` +
      `${totais.encerradas} encerradas (${comHistorico[0].total} escopos com histórico).`
  );

  // Farol resultante, com os valores reais que os módulos 05–10 semearam:
  // repete em SQL a lógica de src/dominios/indicadores/valores.ts para que a
  // execução da demo já mostre o que vai aparecer na tela.
  const { rows: farol } = await cliente.query(FAROL_SQL);
  for (const linha of farol) {
    const real = linha.valor === null ? '—' : `${linha.valor}${linha.unidade === '%' ? '%' : ''}`;
    log(
      `  ${String(linha.chave).padEnd(24)} meta ${String(linha.meta).padStart(5)} · ` +
        `real ${real.padStart(6)} · ${linha.situacao}`
    );
  }

  return {
    metas: {
      versoes: totais.total,
      ativas: totais.ativas,
      encerradas: totais.encerradas,
      por_unidade: totais.por_unidade,
      indicadores: totais.indicadores,
      farol: farol.map((linha) => ({
        chave: linha.chave,
        meta: Number(linha.meta),
        valor: linha.valor === null ? null : Number(linha.valor),
        situacao: linha.situacao,
      })),
    },
  };
}

// Espelho em SQL do registry de fontes (src/dominios/indicadores/valores.ts).
// Só para o log de conferência — a tela continua apurando pelo domínio.
const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
const FAROL_SQL = `
WITH apurado AS (
  SELECT 'entrevista_desligamento' AS chave,
         CASE WHEN count(*) = 0 THEN NULL
              ELSE round(100.0 * count(*) FILTER (WHERE e.status = 'realizada') / count(*), 1)
         END AS valor
    FROM rh.processo_desligamento p
    JOIN rh.entrevista_desligamento e ON e.processo_id = p.id
   WHERE p.estado = 'encerrado' AND e.elegivel_indicador
     AND p.data_termino_efetiva >= ${HOJE_SP} - INTERVAL '12 months'
  UNION ALL
  SELECT 'admissao_prazo',
         CASE WHEN count(*) = 0 THEN NULL
              ELSE round(100.0 * count(*) FILTER (
                     WHERE (atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
                           <= data_inicio_prevista) / count(*), 1)
         END
    FROM rh.processo_admissao
   WHERE estado = 'concluido' AND atualizado_em >= now() - INTERVAL '12 months'
  UNION ALL
  SELECT 'vagas_no_prazo',
         CASE WHEN count(*) = 0 THEN NULL
              ELSE round(100.0 * count(*) FILTER (
                     WHERE (atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
                           <= prazo_alvo) / count(*), 1)
         END
    FROM rh.vaga
   WHERE status = 'fechada' AND atualizado_em >= now() - INTERVAL '12 months'
  UNION ALL
  SELECT 'ferias_vencidas', count(*)::numeric
    FROM rh.periodo_aquisitivo p
    JOIN rh.colaborador c ON c.id = p.colaborador_id
   WHERE c.status <> 'desligado'
     AND (p.status = 'vencido'
          OR (p.status IN ('em_aberto','programado_parcial') AND p.limite_concessivo < ${HOJE_SP}))
  UNION ALL
  SELECT 'asos_validos',
         CASE WHEN count(*) = 0 THEN NULL
              ELSE round(100.0 * count(*) FILTER (WHERE EXISTS (
                     SELECT 1 FROM rh.aso a
                      WHERE a.colaborador_id = c.id AND a.validade >= CURRENT_DATE)) / count(*), 1)
         END
    FROM rh.colaborador c
   WHERE c.status = 'ativo'
  UNION ALL
  SELECT 'folha_no_prazo',
         CASE WHEN count(*) FILTER (WHERE prazo < hoje OR estado = 'fechada') = 0 THEN NULL
              ELSE round(100.0 * count(*) FILTER (WHERE estado = 'fechada' AND fechada_dia <= prazo)
                   / count(*) FILTER (WHERE prazo < hoje OR estado = 'fechada'), 1)
         END
    FROM (
      SELECT c.estado,
             (make_date(c.ano, c.mes, 1) + INTERVAL '1 month' + INTERVAL '4 days')::date AS prazo,
             (c.fechada_em AT TIME ZONE 'America/Sao_Paulo')::date AS fechada_dia,
             ${HOJE_SP} AS hoje
        FROM rh_folha.competencia_folha c
       WHERE c.tipo = 'mensal'
         AND make_date(c.ano, c.mes, 1)
             >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '12 months')::date
         AND make_date(c.ano, c.mes, 1)
             <= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
    ) AS base
)
SELECT i.chave, i.unidade, m.valor AS meta, a.valor,
       CASE WHEN a.valor IS NULL THEN 'sem dados'
            WHEN i.direcao = 'maior' AND a.valor >= m.valor THEN 'DENTRO'
            WHEN i.direcao = 'menor' AND a.valor <= m.valor THEN 'DENTRO'
            ELSE 'FORA' END AS situacao
  FROM apurado a
  JOIN rh.indicador i ON i.chave = a.chave
  JOIN rh.meta_indicador_versao m
    ON m.indicador_id = i.id AND m.escopo = 'global' AND m.status = 'ativa'
 ORDER BY situacao, i.chave`;

module.exports = { semear, ROTEIRO };

if (require.main === module) {
  executarSozinho('11-metas', semear);
}
