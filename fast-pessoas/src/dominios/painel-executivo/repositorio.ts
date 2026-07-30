// SQL do Dashboard Executivo — SOMENTE LEITURA e SOMENTE AGREGADO.
//
// Três invariantes valem para todo SELECT deste arquivo:
//
//  1. NENHUMA consulta devolve identificador de pessoa (nome, CPF, matrícula,
//     colaborador_id) nem valor individual (salário, nota, motivo de
//     afastamento). O que sai daqui é contagem, soma e média. A única exceção
//     aparente — `temposContratacao` — devolve requisição, cargo e unidade,
//     jamais o nome do candidato ou do admitido.
//  2. A data de referência é SEMPRE parâmetro (`$1`, `$2`) calculada uma única
//     vez a partir de `hojeSaoPaulo()`. Assim o card, a série e o texto do
//     período falam da mesma janela — se cada consulta chamasse now() por
//     conta própria, um painel carregado à meia-noite mostraria períodos
//     diferentes em cards diferentes.
//  3. Banco em UTC, negócio em America/Sao_Paulo: todo TIMESTAMPTZ virra data
//     com `AT TIME ZONE 'America/Sao_Paulo'` antes de entrar em comparação ou
//     em date_trunc. Colunas DATE (data_admissao, data_desligamento, inicio de
//     afastamento) já são data de negócio e entram cruas.
//
// Convenção de headcount: "vínculo ativo em D" é derivado das datas
// (`data_admissao <= D AND (data_desligamento IS NULL OR data_desligamento >
// D)`), não da coluna `status`. Motivo: só a derivação por data responde
// "quantos éramos em julho de 2025", e ela concorda com o status no dia de hoje
// (62 nas duas contas no banco de DEV). Afastado continua sendo headcount — é
// vínculo vivo.

import { consultar } from "../../lib/banco";
import { RUBRICA_FGTS } from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

/** Vínculo ativo na data $n — a definição citada no cabeçalho, em um só lugar. */
const ATIVO_EM = (alias: string, parametro: string) =>
  `${alias}.data_admissao <= ${parametro}::date
     AND (${alias}.data_desligamento IS NULL OR ${alias}.data_desligamento > ${parametro}::date)`;

/** Lotação vigente na data $n (a unidade DA ÉPOCA, não a de hoje). */
const LOTACAO_EM = (alias: string, parametro: string) =>
  `${alias}.inicio_vigencia <= ${parametro}::date
     AND (${alias}.fim_vigencia IS NULL OR ${alias}.fim_vigencia >= ${parametro}::date)`;

export interface LinhaSerie extends Record<string, unknown> {
  mes: string;
  valor: string | number | null;
}

export interface LinhaContagemBruta extends Record<string, unknown> {
  rotulo: string;
  quantidade: number;
}

// ------------------------------------------------------------------ referência

/**
 * Hoje em São Paulo, como texto AAAA-MM-DD. Texto de propósito: virar `Date` em
 * JS reintroduz o fuso do processo e é assim que painel erra a virada do mês.
 */
export async function hojeSaoPaulo(): Promise<string> {
  const linhas = await consultar<{ hoje: string }>(
    `SELECT to_char(${HOJE_SP}, 'YYYY-MM-DD') AS hoje`
  );
  return linhas[0].hoje;
}

export async function temChave(
  usuarioId: number,
  chave: string
): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, chave]
  );
  return Boolean(linhas[0]?.autorizado);
}

export async function registrarLeituraSensivel(entrada: {
  usuarioId: number;
  chavePermissao: string;
  recurso: string;
  registroId: string;
}): Promise<void> {
  await consultar(
    `INSERT INTO audit.leitura_sensivel (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [
      entrada.usuarioId,
      entrada.chavePermissao,
      entrada.recurso,
      entrada.registroId,
    ]
  );
}

// ------------------------------------------------------------------ headcount

export async function headcountEm(data: string): Promise<number> {
  const linhas = await consultar<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM rh.colaborador c WHERE ${ATIVO_EM("c", "$1")}`,
    [data]
  );
  return linhas[0]?.total ?? 0;
}

export async function headcountPorUnidade(
  data: string
): Promise<LinhaContagemBruta[]> {
  return consultar<LinhaContagemBruta>(
    `SELECT ev.unidade AS rotulo, COUNT(*)::int AS quantidade
       FROM rh.colaborador c
       JOIN rh.lotacao l ON l.colaborador_id = c.id AND ${LOTACAO_EM("l", "$1")}
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
      WHERE ${ATIVO_EM("c", "$1")}
      GROUP BY ev.unidade
      ORDER BY 2 DESC, 1`,
    [data]
  );
}

export async function headcountPorVinculo(
  data: string
): Promise<LinhaContagemBruta[]> {
  return consultar<LinhaContagemBruta>(
    `SELECT c.tipo_vinculo AS rotulo, COUNT(*)::int AS quantidade
       FROM rh.colaborador c
      WHERE ${ATIVO_EM("c", "$1")}
      GROUP BY c.tipo_vinculo
      ORDER BY 2 DESC, 1`,
    [data]
  );
}

/**
 * Headcount no ÚLTIMO DIA de cada mês da janela; no mês corrente, em `fim`
 * (senão o último ponto projetaria o futuro).
 */
export async function serieHeadcount(
  primeiroMes: string,
  fim: string
): Promise<LinhaSerie[]> {
  return consultar<LinhaSerie>(
    `WITH meses AS (
       SELECT g::date AS mes,
              LEAST((g + interval '1 month' - interval '1 day')::date, $2::date) AS ref
         FROM generate_series($1::date, date_trunc('month', $2::date)::date,
                              interval '1 month') g
     )
     SELECT to_char(m.mes, 'YYYY-MM') AS mes,
            (SELECT COUNT(*)::int FROM rh.colaborador c
              WHERE c.data_admissao <= m.ref
                AND (c.data_desligamento IS NULL OR c.data_desligamento > m.ref)) AS valor
       FROM meses m
      ORDER BY 1`,
    [primeiroMes, fim]
  );
}

// ------------------------------------------------------------------ turnover

export interface TurnoverBruto extends Record<string, unknown> {
  desligados: number;
  admitidos: number;
  hc_inicio: number;
  hc_fim: number;
}

/** Janela ABERTA no início e fechada no fim: (inicio, fim]. */
export async function turnoverJanela(
  inicio: string,
  fim: string
): Promise<TurnoverBruto> {
  const linhas = await consultar<TurnoverBruto>(
    `SELECT
       (SELECT COUNT(*)::int FROM rh.colaborador
         WHERE data_desligamento > $1::date AND data_desligamento <= $2::date) AS desligados,
       (SELECT COUNT(*)::int FROM rh.colaborador
         WHERE data_admissao > $1::date AND data_admissao <= $2::date) AS admitidos,
       (SELECT COUNT(*)::int FROM rh.colaborador c WHERE ${ATIVO_EM("c", "$1")}) AS hc_inicio,
       (SELECT COUNT(*)::int FROM rh.colaborador c WHERE ${ATIVO_EM("c", "$2")}) AS hc_fim`,
    [inicio, fim]
  );
  return linhas[0];
}

export async function serieDesligamentos(
  primeiroMes: string,
  fim: string
): Promise<LinhaSerie[]> {
  return consultar<LinhaSerie>(
    `SELECT to_char(g.mes, 'YYYY-MM') AS mes,
            (SELECT COUNT(*)::int FROM rh.colaborador c
              WHERE c.data_desligamento >= g.mes::date
                AND c.data_desligamento < (g.mes + interval '1 month')::date) AS valor
       FROM generate_series($1::date, date_trunc('month', $2::date)::date,
                            interval '1 month') AS g(mes)
      ORDER BY 1`,
    [primeiroMes, fim]
  );
}

// ------------------------------------------------------------------ custo de pessoal

export interface CompetenciaFechada extends Record<string, unknown> {
  id: number;
  ano: number;
  mes: number;
  fechada_em: string;
  /** Último dia da competência — referência de lotação para o rateio. */
  referencia: string;
}

export async function ultimaCompetenciaFechada(): Promise<CompetenciaFechada | null> {
  const linhas = await consultar<CompetenciaFechada>(
    `SELECT cf.id::int AS id, cf.ano, cf.mes,
            to_char(cf.fechada_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS fechada_em,
            to_char((make_date(cf.ano, cf.mes, 1) + interval '1 month' - interval '1 day')::date,
                    'YYYY-MM-DD') AS referencia
       FROM rh_folha.competencia_folha cf
      WHERE cf.estado = 'fechada'
      ORDER BY cf.ano DESC, cf.mes DESC, cf.id DESC
      LIMIT 1`
  );
  return linhas[0] ?? null;
}

export interface TotalCompetencia extends Record<string, unknown> {
  pessoas: number;
  proventos: string;
  encargo_fgts: string;
}

/**
 * Custo da competência: proventos calculados + o ÚNICO encargo que a folha
 * própria F1 modela, o FGTS (rubrica informativa 3001). INSS patronal, terceiros
 * e provisões de 13º/férias não existem em F1 — o card diz isso na `conta` em
 * vez de deixar a diretoria achar que é custo total.
 */
export async function totalCompetencia(
  competenciaId: number
): Promise<TotalCompetencia> {
  const linhas = await consultar<TotalCompetencia>(
    `SELECT COUNT(*)::int AS pessoas,
            COALESCE(SUM(f.total_proventos), 0) AS proventos,
            COALESCE((SELECT SUM(i.valor)
                        FROM rh_folha.folha_colaborador f2
                        JOIN rh_folha.item_calculo i ON i.folha_colaborador_id = f2.id
                        JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
                        JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id AND r.codigo = $2
                       WHERE f2.competencia_id = $1), 0) AS encargo_fgts
       FROM rh_folha.folha_colaborador f
      WHERE f.competencia_id = $1`,
    [competenciaId, RUBRICA_FGTS]
  );
  return linhas[0];
}

export interface CustoUnidadeBruto extends Record<string, unknown> {
  unidade: string;
  centro_custo: string;
  pessoas: number;
  proventos: string;
  encargo_fgts: string;
}

export async function custoPorUnidade(
  competenciaId: number,
  referencia: string
): Promise<CustoUnidadeBruto[]> {
  return consultar<CustoUnidadeBruto>(
    `SELECT ev.unidade, l.centro_custo,
            COUNT(*)::int AS pessoas,
            SUM(f.total_proventos) AS proventos,
            COALESCE(SUM(g.fgts), 0) AS encargo_fgts
       FROM rh_folha.folha_colaborador f
       JOIN rh.lotacao l ON l.colaborador_id = f.colaborador_id AND ${LOTACAO_EM("l", "$2")}
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
       LEFT JOIN LATERAL (
         SELECT SUM(i.valor) AS fgts
           FROM rh_folha.item_calculo i
           JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
           JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id AND r.codigo = $3
          WHERE i.folha_colaborador_id = f.id
       ) g ON TRUE
      WHERE f.competencia_id = $1
      GROUP BY ev.unidade, l.centro_custo
      ORDER BY 4 DESC, 1`,
    [competenciaId, referencia, RUBRICA_FGTS]
  );
}

/** Série do custo por competência FECHADA (só folha fechada é número oficial). */
export async function serieCustoFechado(limite: number): Promise<LinhaSerie[]> {
  return consultar<LinhaSerie>(
    `SELECT to_char(make_date(cf.ano, cf.mes, 1), 'YYYY-MM') AS mes,
            COALESCE(SUM(f.total_proventos), 0)
            + COALESCE((SELECT SUM(i.valor)
                          FROM rh_folha.folha_colaborador f2
                          JOIN rh_folha.item_calculo i ON i.folha_colaborador_id = f2.id
                          JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
                          JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id AND r.codigo = $2
                         WHERE f2.competencia_id = cf.id), 0) AS valor
       FROM rh_folha.competencia_folha cf
       JOIN rh_folha.folha_colaborador f ON f.competencia_id = cf.id
      WHERE cf.estado = 'fechada'
      GROUP BY cf.id, cf.ano, cf.mes
      ORDER BY cf.ano DESC, cf.mes DESC
      LIMIT $1`,
    [limite, RUBRICA_FGTS]
  );
}

// ------------------------------------------------------------------ tempo de contratação

export interface CasoContratacaoBruto extends Record<string, unknown> {
  requisicao_id: number;
  cargo_nome: string;
  unidade: string;
  aprovada_em: string;
  admitido_em: string;
  dias: number;
}

/**
 * Requisição APROVADA → ADMISSÃO efetiva, ponta a ponta.
 *
 * O elo entre R&S e o cadastro é o CPF (o sistema não tem — de propósito — FK
 * de candidatura para colaborador: candidato tem ciclo de vida e retenção
 * próprios, e nunca migra para a ficha). Casar por CPF é a derivação honesta
 * disponível; o SELECT devolve o CARGO e a UNIDADE da requisição, nunca o nome
 * do candidato nem o do admitido — a diretoria decide com o prazo, não com a
 * identidade de quem entrou.
 *
 * A amostra é pequena por natureza (uma vaga fechada = um caso). Por isso o
 * card publica `casos` junto com a média: média de N=1 é informação, média de
 * N=1 apresentada como taxa é mentira.
 */
export async function temposContratacao(
  inicio: string,
  fim: string
): Promise<CasoContratacaoBruto[]> {
  return consultar<CasoContratacaoBruto>(
    `SELECT rq.id::int AS requisicao_id,
            cv.nome AS cargo_nome,
            ev.unidade,
            to_char((rq.decidido_em AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS aprovada_em,
            to_char(co.data_admissao, 'YYYY-MM-DD') AS admitido_em,
            (co.data_admissao - (rq.decidido_em AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias
       FROM rh.candidatura ca
       JOIN rh.candidato cd ON cd.id = ca.candidato_id
       JOIN rh.vaga v ON v.id = ca.vaga_id
       JOIN rh.requisicao_vaga rq
         ON rq.id = v.requisicao_id AND rq.status = 'aprovada' AND rq.decidido_em IS NOT NULL
       JOIN rh.cargo_versao cv ON cv.id = rq.cargo_versao_id
       JOIN rh.estabelecimento_versao ev ON ev.id = rq.estabelecimento_versao_id
       JOIN rh.colaborador co ON co.cpf = cd.cpf
      WHERE ca.status = 'aprovada'
        AND co.data_admissao >= (rq.decidido_em AT TIME ZONE 'America/Sao_Paulo')::date
        AND co.data_admissao > $1::date
        AND co.data_admissao <= $2::date
      ORDER BY co.data_admissao DESC`,
    [inicio, fim]
  );
}

export interface PernaRecrutamento extends Record<string, unknown> {
  vagas: number;
  dias_medio: string | null;
}

/** Perna só de R&S: requisição aprovada → vaga fechada. Amostra maior. */
export async function pernaRecrutamento(
  inicio: string,
  fim: string
): Promise<PernaRecrutamento> {
  const linhas = await consultar<PernaRecrutamento>(
    `SELECT COUNT(*)::int AS vagas,
            ROUND(AVG((v.atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date
                      - (rq.decidido_em AT TIME ZONE 'America/Sao_Paulo')::date), 1) AS dias_medio
       FROM rh.vaga v
       JOIN rh.requisicao_vaga rq ON rq.id = v.requisicao_id AND rq.decidido_em IS NOT NULL
      WHERE v.status = 'fechada'
        AND (v.atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date > $1::date
        AND (v.atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date <= $2::date`,
    [inicio, fim]
  );
  return linhas[0];
}

// ------------------------------------------------------------------ absenteísmo

export interface LinhaAbsenteismo extends Record<string, unknown> {
  mes: string;
  previstos: number;
  ausentes: number;
}

/**
 * Absenteísmo AGREGADO PURO: dias úteis de afastamento sobre dias úteis
 * previstos, mês a mês. Nenhum tipo, nenhum motivo, nenhum CID, nenhuma
 * pessoa — o painel da diretoria não é lugar para saúde de ninguém.
 *
 * Numerador: para cada dia útil da janela, quantos VÍNCULOS estavam cobertos
 * por um afastamento (DISTINCT por pessoa+dia: dois afastamentos sobrepostos
 * contam um dia, não dois).
 * Denominador: para cada dia útil, quantos vínculos existiam — o que a empresa
 * de fato esperava receber de trabalho, já descontando quem ainda não tinha
 * entrado e quem já havia saído.
 * Dia útil = segunda a sexta. Feriado não entra: não existe calendário de
 * feriados em nenhum lugar do sistema (registrado como evolução em esquemas.ts).
 */
export async function absenteismoMensal(
  inicio: string,
  fim: string
): Promise<LinhaAbsenteismo[]> {
  return consultar<LinhaAbsenteismo>(
    `WITH dias AS (
       SELECT g::date AS dia
         FROM generate_series($1::date, $2::date, interval '1 day') g
        WHERE EXTRACT(isodow FROM g) <= 5
     ),
     previstos AS (
       SELECT date_trunc('month', dia)::date AS mes, COUNT(*)::int AS dias
         FROM dias
         JOIN rh.colaborador c
           ON dia >= c.data_admissao
          AND (c.data_desligamento IS NULL OR dia <= c.data_desligamento)
        GROUP BY 1
     ),
     ausentes AS (
       SELECT date_trunc('month', d.dia)::date AS mes,
              COUNT(DISTINCT (a.colaborador_id, d.dia))::int AS dias
         FROM dias d
         JOIN rh.afastamento a
           ON d.dia >= a.inicio AND d.dia <= COALESCE(a.fim, $2::date)
         JOIN rh.colaborador c
           ON c.id = a.colaborador_id
          AND d.dia >= c.data_admissao
          AND (c.data_desligamento IS NULL OR d.dia <= c.data_desligamento)
        GROUP BY 1
     )
     SELECT to_char(p.mes, 'YYYY-MM') AS mes, p.dias AS previstos,
            COALESCE(a.dias, 0) AS ausentes
       FROM previstos p
       LEFT JOIN ausentes a ON a.mes = p.mes
      ORDER BY 1`,
    [inicio, fim]
  );
}

// ------------------------------------------------------------------ movimentações

export interface LinhaMovimentacao extends Record<string, unknown> {
  tipo: string;
  quantidade: number;
}

/**
 * Movimentações EFETIVADAS na janela. O critério é `aplicada_em IS NOT NULL`:
 * a aplicação só acontece depois da cadeia de aprovação de dois níveis (líder +
 * diretoria) passar, e é ela que cria a posição/lotação nova. Demanda aprovada
 * mas não aplicada ainda não mexeu na vida de ninguém — não conta.
 */
export async function movimentacoesAplicadas(
  inicio: string,
  fim: string
): Promise<LinhaMovimentacao[]> {
  return consultar<LinhaMovimentacao>(
    `SELECT dm.tipo, COUNT(*)::int AS quantidade
       FROM rh.demanda_movimentacao dm
      WHERE dm.aplicada_em IS NOT NULL
        AND (dm.aplicada_em AT TIME ZONE 'America/Sao_Paulo')::date > $1::date
        AND (dm.aplicada_em AT TIME ZONE 'America/Sao_Paulo')::date <= $2::date
      GROUP BY dm.tipo`,
    [inicio, fim]
  );
}

export async function seriePromocoes(
  primeiroMes: string,
  fim: string
): Promise<LinhaSerie[]> {
  return consultar<LinhaSerie>(
    `SELECT to_char(g.mes, 'YYYY-MM') AS mes,
            (SELECT COUNT(*)::int
               FROM rh.demanda_movimentacao dm
              WHERE dm.tipo = 'promocao'
                AND dm.aplicada_em IS NOT NULL
                AND (dm.aplicada_em AT TIME ZONE 'America/Sao_Paulo')::date >= g.mes::date
                AND (dm.aplicada_em AT TIME ZONE 'America/Sao_Paulo')::date
                    < (g.mes + interval '1 month')::date) AS valor
       FROM generate_series($1::date, date_trunc('month', $2::date)::date,
                            interval '1 month') AS g(mes)
      ORDER BY 1`,
    [primeiroMes, fim]
  );
}

// ------------------------------------------------------------------ diversidade

export interface LinhaGenero extends Record<string, unknown> {
  genero: string;
  quantidade: number;
}

export async function contarPorGenero(data: string): Promise<LinhaGenero[]> {
  return consultar<LinhaGenero>(
    `SELECT c.genero, COUNT(*)::int AS quantidade
       FROM rh.colaborador c
      WHERE ${ATIVO_EM("c", "$1")}
      GROUP BY c.genero`,
    [data]
  );
}

export interface LinhaIdade extends Record<string, unknown> {
  idade: number;
  quantidade: number;
}

export async function contarPorIdade(data: string): Promise<LinhaIdade[]> {
  return consultar<LinhaIdade>(
    `SELECT date_part('year', age($1::date, c.data_nascimento))::int AS idade,
            COUNT(*)::int AS quantidade
       FROM rh.colaborador c
      WHERE ${ATIVO_EM("c", "$1")}
        AND c.data_nascimento IS NOT NULL
      GROUP BY 1`,
    [data]
  );
}

export interface CoberturaNascimento extends Record<string, unknown> {
  com_data: number;
  sem_data: number;
}

export async function coberturaNascimento(
  data: string
): Promise<CoberturaNascimento> {
  const linhas = await consultar<CoberturaNascimento>(
    `SELECT COUNT(*) FILTER (WHERE c.data_nascimento IS NOT NULL)::int AS com_data,
            COUNT(*) FILTER (WHERE c.data_nascimento IS NULL)::int AS sem_data
       FROM rh.colaborador c
      WHERE ${ATIVO_EM("c", "$1")}`,
    [data]
  );
  return linhas[0];
}

export interface LinhaSerieGenero extends Record<string, unknown> {
  mes: string;
  mulheres: number;
  total: number;
}

/**
 * Composição de gênero mês a mês. Gênero é atributo ATUAL da ficha (não tem
 * histórico), então a série reconstrói "quem estava ativo naquele mês, com o
 * gênero que consta hoje" — o que muda no tempo é o quadro, não a
 * autodeclaração. O serviço aplica a supressão de recorte pequeno ponto a
 * ponto antes de publicar.
 */
export async function serieGenero(
  primeiroMes: string,
  fim: string
): Promise<LinhaSerieGenero[]> {
  return consultar<LinhaSerieGenero>(
    `WITH meses AS (
       SELECT g::date AS mes,
              LEAST((g + interval '1 month' - interval '1 day')::date, $2::date) AS ref
         FROM generate_series($1::date, date_trunc('month', $2::date)::date,
                              interval '1 month') g
     )
     SELECT to_char(m.mes, 'YYYY-MM') AS mes,
            (SELECT COUNT(*)::int FROM rh.colaborador c
              WHERE c.data_admissao <= m.ref
                AND (c.data_desligamento IS NULL OR c.data_desligamento > m.ref)
                AND c.genero = 'feminino') AS mulheres,
            (SELECT COUNT(*)::int FROM rh.colaborador c
              WHERE c.data_admissao <= m.ref
                AND (c.data_desligamento IS NULL OR c.data_desligamento > m.ref)) AS total
       FROM meses m
      ORDER BY 1`,
    [primeiroMes, fim]
  );
}

// ------------------------------------------------------------------ clima

export interface CheckinJanela extends Record<string, unknown> {
  respostas: number;
  media: string | null;
}

export async function checkinJanela(
  inicio: string,
  fim: string
): Promise<CheckinJanela> {
  const linhas = await consultar<CheckinJanela>(
    `SELECT COUNT(*)::int AS respostas, ROUND(AVG(nota), 2) AS media
       FROM rh_clima.checkin_resposta
      WHERE data_referencia > $1::date AND data_referencia <= $2::date`,
    [inicio, fim]
  );
  return linhas[0];
}

export async function serieClima(
  primeiroMes: string,
  fim: string
): Promise<LinhaSerie[]> {
  return consultar<LinhaSerie>(
    `SELECT to_char(g.mes, 'YYYY-MM') AS mes,
            (SELECT ROUND(AVG(r.nota), 2)
               FROM rh_clima.checkin_resposta r
              WHERE r.data_referencia >= g.mes::date
                AND r.data_referencia < (g.mes + interval '1 month')::date) AS valor
       FROM generate_series($1::date, date_trunc('month', $2::date)::date,
                            interval '1 month') AS g(mes)
      ORDER BY 1`,
    [primeiroMes, fim]
  );
}

export interface ContagemEnps extends Record<string, unknown> {
  titulo: string;
  encerrada_em: string;
  respostas: number;
  promotores: number;
  detratores: number;
}

/**
 * eNPS da última pesquisa ENCERRADA com pergunta 0–10. O cálculo em si e o
 * mínimo de amostra vêm do domínio de pesquisas (calcularEnps / MINIMO_AMOSTRA)
 * — aqui só a contagem, para não existirem duas definições de eNPS no sistema.
 */
export async function contagemEnpsUltimaEncerrada(): Promise<ContagemEnps | null> {
  const linhas = await consultar<ContagemEnps>(
    `SELECT p.titulo,
            to_char(p.encerrada_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS encerrada_em,
            COUNT(*)::int AS respostas,
            COUNT(*) FILTER (WHERE r.valor_numerico >= 9)::int AS promotores,
            COUNT(*) FILTER (WHERE r.valor_numerico <= 6)::int AS detratores
       FROM rh_clima.pesquisa p
       JOIN rh_clima.pergunta_pesquisa q ON q.pesquisa_id = p.id AND q.tipo = 'nps_0_10'
       JOIN rh_clima.resposta_pesquisa r ON r.pergunta_id = q.id
      WHERE p.status = 'encerrada'
        AND r.valor_numerico IS NOT NULL
      GROUP BY p.id, p.titulo, p.encerrada_em
      ORDER BY p.encerrada_em DESC, p.id DESC
      LIMIT 1`
  );
  return linhas[0] ?? null;
}

// ------------------------------------------------------------------ performance

export interface FaixaSafra extends Record<string, unknown> {
  safra: string;
  rotulo: string;
  minimo: string;
  maximo: string;
  quantidade: number;
}

/**
 * Distribuição da última safra de avaliação de DESEMPENHO pelas faixas do
 * modelo vigente naquela safra. "Safra" = mês (em São Paulo) do resultado mais
 * recente; ciclos de experiência (45/90) ficam fora porque não são régua de
 * performance do quadro, são porta de entrada.
 *
 * LEFT JOIN a partir da faixa: as quatro faixas aparecem SEMPRE, inclusive as
 * vazias — distribuição com faixa faltando esconde justamente o extremo que a
 * diretoria precisa ver. Sai contagem por faixa e nada mais: sem nome, sem
 * percentual individual, sem nota.
 */
export async function distribuicaoUltimaSafra(): Promise<FaixaSafra[]> {
  return consultar<FaixaSafra>(
    `WITH ultimo AS (
       SELECT date_trunc('month', ra.em AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
              ca.modelo_versao_id
         FROM rh.resultado_avaliacao ra
         JOIN rh.ciclo_avaliacao ca ON ca.id = ra.ciclo_id AND ca.tipo = 'desempenho'
        ORDER BY ra.em DESC
        LIMIT 1
     ),
     contagem AS (
       SELECT ra.faixa_resultado_id AS faixa_id, COUNT(*)::int AS quantidade
         FROM ultimo u
         JOIN rh.resultado_avaliacao ra
           ON date_trunc('month', ra.em AT TIME ZONE 'America/Sao_Paulo')::date = u.mes
         JOIN rh.ciclo_avaliacao ca ON ca.id = ra.ciclo_id AND ca.tipo = 'desempenho'
        GROUP BY 1
     )
     SELECT to_char(u.mes, 'YYYY-MM') AS safra,
            fr.rotulo, fr.minimo, fr.maximo,
            COALESCE(ct.quantidade, 0) AS quantidade
       FROM ultimo u
       JOIN rh.faixa_resultado_versao fr ON fr.modelo_versao_id = u.modelo_versao_id
       LEFT JOIN contagem ct ON ct.faixa_id = fr.id
      ORDER BY fr.minimo`
  );
}
