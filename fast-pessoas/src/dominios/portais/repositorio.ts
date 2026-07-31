import { consultar } from "../../lib/banco";

// ==================================================================
// Repositório do portal do gestor — SOMENTE LEITURA
// ==================================================================
// Nenhuma função aqui escreve: o portal consolida e aponta para a tela do
// módulo, que é quem muta (e audita). Consultas que já existiam em outro
// domínio NÃO foram reescritas — o serviço reusa `listarCiclosDoAvaliador`
// (avaliação), `listarAprovacoesPendentes` e `listarMovimentacoesDoLider`
// (demandas). O que está aqui é o que não existia: a visão POR EQUIPE.
//
// Fonte única do alcance: rh.relacao_gestor com fim_vigencia IS NULL e
// inicio_vigencia já começada — o mesmo fragmento usado em colaboradores e
// demandas. Toda consulta é parametrizada pelo id do COLABORADOR gestor.

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

/** Liderados com relação VIGENTE — inclui desligados (o filtro é de quem chama). */
const EQUIPE_VIGENTE = `
  SELECT rg.liderado_colaborador_id AS id
    FROM rh.relacao_gestor rg
   WHERE rg.gestor_colaborador_id = $1
     AND rg.fim_vigencia IS NULL
     AND rg.inicio_vigencia <= ${HOJE_SP}`;

// ------------------------------------------------------------------ gestor e seletor

export interface GestorPortal {
  colaborador_id: number;
  usuario_id: number;
  nome_completo: string;
  liderados_vigentes: number;
}

export async function buscarGestor(
  colaboradorId: number
): Promise<GestorPortal | null> {
  const linhas = await consultar<{
    colaborador_id: string;
    usuario_id: string;
    nome_completo: string;
    liderados_vigentes: string;
  }>(
    `SELECT c.id AS colaborador_id, c.usuario_id, c.nome_completo,
            (SELECT count(*) FROM (${EQUIPE_VIGENTE}) eq) AS liderados_vigentes
       FROM rh.colaborador c
      WHERE c.id = $1`,
    [colaboradorId]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    colaborador_id: Number(linha.colaborador_id),
    usuario_id: Number(linha.usuario_id),
    nome_completo: linha.nome_completo,
    liderados_vigentes: Number(linha.liderados_vigentes),
  };
}

export interface OpcaoGestor {
  colaborador_id: number;
  nome_completo: string;
  liderados: number;
}

/** Seletor de quem enxerga todo mundo: gestores com equipe vigente hoje. */
export async function listarGestoresComEquipe(): Promise<OpcaoGestor[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome_completo: string;
    liderados: string;
  }>(
    `SELECT g.id AS colaborador_id, g.nome_completo,
            count(*) FILTER (WHERE l.status <> 'desligado') AS liderados
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
       JOIN rh.colaborador l ON l.id = rg.liderado_colaborador_id
      WHERE rg.fim_vigencia IS NULL
        AND rg.inicio_vigencia <= ${HOJE_SP}
      GROUP BY g.id, g.nome_completo
     HAVING count(*) FILTER (WHERE l.status <> 'desligado') > 0
      ORDER BY g.nome_completo`
  );
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.colaborador_id),
    nome_completo: linha.nome_completo,
    liderados: Number(linha.liderados),
  }));
}

// ------------------------------------------------------------------ bloco 1: minha equipe

export interface LinhaEquipe {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  cargo_nome: string | null;
  unidade: string | null;
  data_admissao: string;
  dias_desde_admissao: number;
  /** FATO isolado: existe afastamento em curso hoje. Sem tipo, sem motivo. */
  afastado_hoje: boolean;
  /** Programação aprovada/em gozo cobrindo hoje. */
  em_ferias_hoje: boolean;
  /** Fim das férias em curso (só quando em_ferias_hoje). */
  ferias_ate: string | null;
  ultimo_feedback_em: string | null;
  dias_desde_feedback: number | null;
}

/**
 * Liderados NÃO desligados com a projeção vigente de cargo e unidade.
 *
 * `afastado_hoje` é o único dado de afastamento que sai daqui: o gestor precisa
 * saber que a pessoa não está no posto, e NADA além disso (tipo e conteúdo de
 * saúde ficam com afastamento.saude.ver, migration 0007).
 */
export async function listarEquipe(
  gestorColaboradorId: number
): Promise<LinhaEquipe[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome_completo: string;
    matricula: string;
    cargo_nome: string | null;
    unidade: string | null;
    data_admissao: string;
    dias_desde_admissao: number;
    afastado_hoje: boolean;
    em_ferias_hoje: boolean;
    ferias_ate: string | null;
    ultimo_feedback_em: string | null;
    dias_desde_feedback: number | null;
  }>(
    `SELECT c.id AS colaborador_id, c.nome_completo, c.matricula,
            pos.cargo_nome, lot.unidade,
            c.data_admissao::text AS data_admissao,
            (${HOJE_SP} - c.data_admissao)::int AS dias_desde_admissao,
            EXISTS (
              SELECT 1 FROM rh.afastamento af
               WHERE af.colaborador_id = c.id
                 AND af.inicio <= ${HOJE_SP}
                 AND (af.fim IS NULL OR af.fim >= ${HOJE_SP})
            ) AS afastado_hoje,
            fer.fim IS NOT NULL AS em_ferias_hoje,
            fer.fim::text AS ferias_ate,
            fb.ultimo_feedback_em, fb.dias_desde_feedback
       FROM (${EQUIPE_VIGENTE}) eq
       JOIN rh.colaborador c ON c.id = eq.id
       LEFT JOIN LATERAL (
         SELECT cv.nome AS cargo_nome
           FROM rh.posicao_colaborador p
           JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
          WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       ) pos ON TRUE
       LEFT JOIN LATERAL (
         SELECT ev.unidade
           FROM rh.lotacao l
           LEFT JOIN rh.estabelecimento_versao ev
             ON ev.estabelecimento_id = l.estabelecimento_id
            AND ev.status = 'ativa'
          WHERE l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       ) lot ON TRUE
       LEFT JOIN LATERAL (
         SELECT (pf.inicio + pf.dias - 1) AS fim
           FROM rh.programacao_ferias pf
          WHERE pf.colaborador_id = c.id
            AND pf.status IN ('aprovada','em_gozo')
            AND pf.inicio <= ${HOJE_SP}
            AND (pf.inicio + pf.dias - 1) >= ${HOJE_SP}
          ORDER BY pf.inicio DESC
          LIMIT 1
       ) fer ON TRUE
       LEFT JOIN LATERAL (
         SELECT f.realizado_em::text AS ultimo_feedback_em,
                (${HOJE_SP} - f.realizado_em)::int AS dias_desde_feedback
           FROM rh.feedback_formal f
          WHERE f.colaborador_id = c.id
          ORDER BY f.realizado_em DESC, f.id DESC
          LIMIT 1
       ) fb ON TRUE
      WHERE c.status <> 'desligado'
      ORDER BY c.nome_completo, c.id`,
    [gestorColaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    colaborador_id: Number(linha.colaborador_id),
  }));
}

// ------------------------------------------------------------------ bloco 2: férias da equipe

export interface ProgramacaoEquipe {
  programacao_id: number;
  colaborador_id: number;
  nome_completo: string;
  inicio: string;
  fim: string;
  dias: number;
  abono_dias: number;
  status: "aprovada" | "em_gozo";
  dias_para_inicio: number;
}

/** Programações já aprovadas (ou em gozo) que começam dentro da janela. */
export async function listarProgramacoesAprovadas(
  gestorColaboradorId: number,
  janelaDias: number
): Promise<ProgramacaoEquipe[]> {
  const linhas = await consultar<{
    programacao_id: string;
    colaborador_id: string;
    nome_completo: string;
    inicio: string;
    fim: string;
    dias: number;
    abono_dias: number;
    status: "aprovada" | "em_gozo";
    dias_para_inicio: number;
  }>(
    `SELECT pf.id AS programacao_id, c.id AS colaborador_id, c.nome_completo,
            pf.inicio::text AS inicio,
            (pf.inicio + pf.dias - 1)::text AS fim,
            pf.dias, pf.abono_dias, pf.status,
            (pf.inicio - ${HOJE_SP})::int AS dias_para_inicio
       FROM (${EQUIPE_VIGENTE}) eq
       JOIN rh.colaborador c ON c.id = eq.id
       JOIN rh.programacao_ferias pf ON pf.colaborador_id = c.id
      WHERE pf.status IN ('aprovada','em_gozo')
        AND (pf.inicio + pf.dias - 1) >= ${HOJE_SP}
        AND pf.inicio <= ${HOJE_SP} + $2::int
      ORDER BY pf.inicio, c.nome_completo`,
    [gestorColaboradorId, janelaDias]
  );
  return linhas.map((linha) => ({
    ...linha,
    programacao_id: Number(linha.programacao_id),
    colaborador_id: Number(linha.colaborador_id),
  }));
}

export interface PeriodoEmRisco {
  periodo_id: number;
  colaborador_id: number;
  nome_completo: string;
  inicio: string;
  fim: string;
  limite_concessivo: string;
  dias_ate_limite: number;
  saldo_dias: number;
  dias_gozados: number;
  dias_programados: number;
}

/**
 * Períodos aquisitivos do time vencidos ou vencendo dentro da janela — o risco
 * de pagamento EM DOBRO (art. 137) que só o gestor consegue destravar
 * aprovando/combinando as férias. `dias_programados` mostra o que já está
 * solicitado ou aprovado, para o gestor não cobrar duas vezes.
 */
export async function listarPeriodosEmRisco(
  gestorColaboradorId: number,
  janelaDias: number
): Promise<PeriodoEmRisco[]> {
  const linhas = await consultar<{
    periodo_id: string;
    colaborador_id: string;
    nome_completo: string;
    inicio: string;
    fim: string;
    limite_concessivo: string;
    dias_ate_limite: number;
    saldo_dias: string;
    dias_gozados: string;
    dias_programados: string;
  }>(
    `SELECT pa.id AS periodo_id, c.id AS colaborador_id, c.nome_completo,
            pa.inicio::text AS inicio, pa.fim::text AS fim,
            pa.limite_concessivo::text AS limite_concessivo,
            (pa.limite_concessivo - ${HOJE_SP})::int AS dias_ate_limite,
            pa.saldo_dias, pa.dias_gozados,
            COALESCE((
              SELECT sum(pf.dias + pf.abono_dias)
                FROM rh.programacao_ferias pf
               WHERE pf.periodo_aquisitivo_id = pa.id
                 AND pf.status IN ('solicitada','aprovada','em_gozo','concluida')
            ), 0) AS dias_programados
       FROM (${EQUIPE_VIGENTE}) eq
       JOIN rh.colaborador c ON c.id = eq.id
       JOIN rh.periodo_aquisitivo pa ON pa.colaborador_id = c.id
      WHERE c.status <> 'desligado'
        AND pa.status IN ('em_aberto','programado_parcial','vencido')
        AND (pa.limite_concessivo - ${HOJE_SP}) <= $2::int
      ORDER BY pa.limite_concessivo, c.nome_completo`,
    [gestorColaboradorId, janelaDias]
  );
  return linhas.map((linha) => ({
    ...linha,
    periodo_id: Number(linha.periodo_id),
    colaborador_id: Number(linha.colaborador_id),
    saldo_dias: Number(linha.saldo_dias),
    dias_gozados: Number(linha.dias_gozados),
    dias_programados: Number(linha.dias_programados),
  }));
}

// ------------------------------------------------------------------ bloco 5: turnover

export interface ApuracaoTurnover {
  janela_inicio: string;
  janela_fim: string;
  desligados: number;
  headcount_inicio: number;
  headcount_fim: number;
}

/**
 * Insumos do turnover da equipe — os NÚMEROS da conta, não a conta.
 *
 * A equipe da janela inclui quem saiu (a relação gestor→liderado não é
 * encerrada no desligamento) e quem entrou no meio do período; o headcount é
 * medido nas duas pontas com a relação VÁLIDA NAQUELA DATA, e o serviço tira a
 * média. A analista confere a conta na tela: numerador, denominador e fórmula
 * ficam visíveis.
 */
export async function apurarTurnover(
  gestorColaboradorId: number,
  meses: number
): Promise<ApuracaoTurnover> {
  const linhas = await consultar<{
    janela_inicio: string;
    janela_fim: string;
    desligados: string;
    headcount_inicio: string;
    headcount_fim: string;
  }>(
    `WITH janela AS (
       SELECT ${HOJE_SP} AS fim,
              (${HOJE_SP} - ($2::int * INTERVAL '1 month'))::date AS inicio
     ),
     vinculo AS (
       SELECT rg.liderado_colaborador_id AS colaborador_id,
              rg.inicio_vigencia, rg.fim_vigencia
         FROM rh.relacao_gestor rg
        WHERE rg.gestor_colaborador_id = $1
     )
     SELECT j.inicio::text AS janela_inicio, j.fim::text AS janela_fim,
            (SELECT count(DISTINCT v.colaborador_id)
               FROM vinculo v
               JOIN rh.colaborador c ON c.id = v.colaborador_id
              WHERE v.inicio_vigencia <= j.fim
                AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= j.inicio)
                AND c.data_desligamento IS NOT NULL
                AND c.data_desligamento >= j.inicio
                AND c.data_desligamento <= j.fim) AS desligados,
            (SELECT count(DISTINCT v.colaborador_id)
               FROM vinculo v
               JOIN rh.colaborador c ON c.id = v.colaborador_id
              WHERE v.inicio_vigencia <= j.inicio
                AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= j.inicio)
                AND c.data_admissao <= j.inicio
                AND (c.data_desligamento IS NULL
                     OR c.data_desligamento > j.inicio)) AS headcount_inicio,
            (SELECT count(DISTINCT v.colaborador_id)
               FROM vinculo v
               JOIN rh.colaborador c ON c.id = v.colaborador_id
              WHERE v.inicio_vigencia <= j.fim
                AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= j.fim)
                AND c.data_admissao <= j.fim
                AND (c.data_desligamento IS NULL
                     OR c.data_desligamento > j.fim)) AS headcount_fim
       FROM janela j`,
    [gestorColaboradorId, meses]
  );
  const linha = linhas[0];
  return {
    janela_inicio: linha.janela_inicio,
    janela_fim: linha.janela_fim,
    desligados: Number(linha.desligados),
    headcount_inicio: Number(linha.headcount_inicio),
    headcount_fim: Number(linha.headcount_fim),
  };
}

// ------------------------------------------------------------------ bloco 6: alertas

export interface MarcoExperiencia {
  colaborador_id: number;
  nome_completo: string;
  /** 45 ou 90 — o marco do art. 445/451 que está chegando. */
  marco: 45 | 90;
  data_marco: string;
  dias_para_marco: number;
  /** TRUE quando a data vem de rh.processo_admissao; FALSE = derivada da admissão. */
  do_processo: boolean;
}

/**
 * Contrato de experiência com DECISÃO PENDENTE. Prefere o prazo gravado em
 * rh.processo_admissao (0010) e, quando o processo não existe (base legada
 * migrada sem admissão no sistema), DERIVA de data_admissao + 44/89 dias — a
 * mesma régua de `calcularPrazosExperiencia`. A tela diz de onde veio a data.
 *
 * O critério NÃO é só a data. O alerta existe para cobrar a decisão de
 * efetivar/desligar antes do marco (CLT 445/451), então ele acompanha o CICLO
 * de avaliação daquele marco, e não apenas o calendário:
 *   - marco já DECIDIDO sai da lista, mesmo dentro da janela — cobrar decisão
 *     que já saiu é alarme falso (era o caso dos três "dia 45 · 17 dias em
 *     atraso" da demo, todos com o ciclo do marco 45 decidido);
 *   - marco com ciclo AINDA ABERTO entra, mesmo fora da janela — quem tem ciclo
 *     aberto tem o que fazer hoje, e era exatamente esse o marco que sumia do
 *     portal de quem avalia contrato de experiência recém-aberto.
 * A janela (antecedência/atraso) continua valendo para quem não tem ciclo
 * nenhum: aí não há o que consultar além da data.
 *
 * E quem NÃO tem contrato de experiência não tem marco nenhum. O processo de
 * admissão grava isso em `contrato_experiencia` (0010), e é esse o campo que o
 * resto do sistema respeita — a abertura dos ciclos de experiência filtra por
 * `WHERE p.contrato_experiencia` (avaliacao/repositorio.ts). Derivar 45/90 da
 * data de admissão quando o processo diz NÃO colocava no bloco "Contrato de
 * experiência (45/90)" gente que nunca terá um: era o caso do aprendiz da demo
 * (contrato a termo, sem período de experiência), o único alerta que não tinha
 * ciclo para onde apontar. A derivação continua existindo, mas só para quem não
 * tem processo no sistema — base legada, onde não há o que respeitar.
 */
export async function listarMarcosExperiencia(
  gestorColaboradorId: number,
  antecedenciaDias: number,
  atrasoDias: number
): Promise<MarcoExperiencia[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome_completo: string;
    marco: number;
    data_marco: string;
    dias_para_marco: number;
    do_processo: boolean;
  }>(
    `WITH base AS (
       SELECT c.id, c.nome_completo, c.data_admissao,
              pa.prazo_experiencia_1, pa.prazo_experiencia_2,
              pa.id IS NOT NULL AS tem_processo
         FROM (${EQUIPE_VIGENTE}) eq
         JOIN rh.colaborador c ON c.id = eq.id
         LEFT JOIN LATERAL (
           SELECT p.id, p.prazo_experiencia_1, p.prazo_experiencia_2,
                  p.contrato_experiencia
             FROM rh.processo_admissao p
            WHERE p.colaborador_id = c.id
              AND p.estado <> 'cancelado'
            ORDER BY p.criado_em DESC
            LIMIT 1
         ) pa ON TRUE
        WHERE c.status <> 'desligado'
          AND c.tipo_vinculo IN ('clt','aprendiz','temporario')
          -- Processo que diz "sem contrato de experiência" encerra o assunto.
          -- Sem processo, cai na derivação por data de admissão (base legada).
          AND COALESCE(pa.contrato_experiencia, TRUE)
     ),
     marcos AS (
       SELECT b.id, b.nome_completo, 45 AS marco,
              COALESCE(b.prazo_experiencia_1, b.data_admissao + 44) AS data_marco,
              b.prazo_experiencia_1 IS NOT NULL AS do_processo
         FROM base b
       UNION ALL
       SELECT b.id, b.nome_completo, 90 AS marco,
              COALESCE(b.prazo_experiencia_2, b.data_admissao + 89) AS data_marco,
              b.prazo_experiencia_2 IS NOT NULL AS do_processo
         FROM base b
     )
     SELECT m.id AS colaborador_id, m.nome_completo, m.marco,
            m.data_marco::text AS data_marco,
            (m.data_marco - ${HOJE_SP})::int AS dias_para_marco,
            m.do_processo
       FROM marcos m
       -- Estado do ciclo DAQUELE marco. 'cancelado' não conta como decisão:
       -- ciclo anulado deixa a decisão pendente de novo (é por isso que o
       -- índice único de 0011 trata 'decidido' e 'cancelado' juntos como
       -- final, mas só o primeiro encerra o assunto).
       LEFT JOIN LATERAL (
         SELECT bool_or(ca.status = 'decidido') AS decidido,
                bool_or(ca.status NOT IN ('decidido','cancelado')) AS em_aberto
           FROM rh.ciclo_avaliacao ca
          WHERE ca.colaborador_id = m.id
            AND ca.tipo = 'experiencia_' || m.marco
       ) ci ON TRUE
      WHERE COALESCE(ci.decidido, FALSE) = FALSE
        AND (
          COALESCE(ci.em_aberto, FALSE)
          OR ((m.data_marco - ${HOJE_SP}) <= $2::int
              AND (m.data_marco - ${HOJE_SP}) >= ($3::int * -1))
        )
      ORDER BY m.data_marco, m.nome_completo`,
    [gestorColaboradorId, antecedenciaDias, atrasoDias]
  );
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.colaborador_id),
    nome_completo: linha.nome_completo,
    marco: linha.marco === 45 ? 45 : 90,
    data_marco: linha.data_marco,
    dias_para_marco: linha.dias_para_marco,
    do_processo: linha.do_processo,
  }));
}

export interface VencimentoAso {
  colaborador_id: number;
  nome_completo: string;
  validade: string;
  dias_ate_validade: number;
}

/**
 * ASO vencido ou a vencer — SÓ O FATO DO VENCIMENTO.
 *
 * `resultado` (apto / apto com restrições / inapto), `tipo` do exame e
 * `restricoes_cifradas` ficam FORA desta consulta: são dado de saúde e
 * pertencem a quem tem sst.saude.ver (migration 0014). O gestor precisa saber
 * que precisa mandar a pessoa ao exame — nada mais.
 */
export async function listarVencimentosAso(
  gestorColaboradorId: number,
  antecedenciaDias: number
): Promise<VencimentoAso[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome_completo: string;
    validade: string;
    dias_ate_validade: number;
  }>(
    `SELECT c.id AS colaborador_id, c.nome_completo,
            ult.validade::text AS validade,
            (ult.validade - ${HOJE_SP})::int AS dias_ate_validade
       FROM (${EQUIPE_VIGENTE}) eq
       JOIN rh.colaborador c ON c.id = eq.id
       JOIN LATERAL (
         SELECT a.validade
           FROM rh.aso a
          WHERE a.colaborador_id = c.id
            AND a.validade IS NOT NULL
          ORDER BY a.data_exame DESC, a.id DESC
          LIMIT 1
       ) ult ON TRUE
      WHERE c.status <> 'desligado'
        AND (ult.validade - ${HOJE_SP}) <= $2::int
      ORDER BY ult.validade, c.nome_completo`,
    [gestorColaboradorId, antecedenciaDias]
  );
  return linhas.map((linha) => ({
    ...linha,
    colaborador_id: Number(linha.colaborador_id),
  }));
}
