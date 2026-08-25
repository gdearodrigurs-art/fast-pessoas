import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  FiltroEstrutura,
  OpcoesFiltroEstrutura,
} from "../estrutura/esquemas";
import { TIPOS_INTERCORRENCIA_QUE_MUDAM_A_APURACAO } from "../ponto/esquemas";
import {
  FaixaInssMotor,
  FaixaIrrfMotor,
  ParametrosFolhaMotor,
  RubricaMotor,
  TabelaInssMotor,
  TabelaIrrfMotor,
} from "./calculo";
import {
  EstadoCompetencia,
  NaturezaRubrica,
  OrigemVariavel,
  TipoCalculo,
  TipoTabelaLegal,
} from "./esquemas";

// Dinheiro: NUMERIC no banco ↔ CENTAVOS INTEIROS no motor. A conversão mora
// SÓ aqui, na borda — nada de float de reais circulando pelo serviço.

function paraCentavos(texto: string): number {
  return Math.round(Number(texto) * 100);
}

function centavosParaSql(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

function numeroOuNulo(texto: string | null): number | null {
  return texto === null ? null : Number(texto);
}

// Identificador de tabela SEMPRE via whitelist — nunca texto do cliente.
const TABELAS_LEGAIS: Record<TipoTabelaLegal, string> = {
  inss: "rh_folha.tabela_inss_versao",
  irrf: "rh_folha.tabela_irrf_versao",
  gerais: "rh_folha.parametro_folha_versao",
};

/**
 * HOJE no fuso de negócio (`rh.hoje()`, migração 0049) — a data de referência
 * das duas telas que NÃO falam de competência nenhuma: o catálogo de parâmetros
 * ("o que vale agora") e a suite de regressão, que roda contra as tabelas em
 * vigor hoje justamente para tocar o alarme quando uma tabela nova entra.
 *
 * NÃO use isto para calcular competência. Competência tem data própria e é o
 * último dia dela — `dataReferenciaCompetencia` em esquemas.ts. Foi exatamente
 * a confusão entre as duas datas que fazia a folha de julho pagar o salário de
 * agosto.
 */
export async function hojeParaFolha(cliente?: PoolClient): Promise<string> {
  const sql = `SELECT rh.hoje()::text AS hoje`;
  const linhas = cliente
    ? (await cliente.query<{ hoje: string }>(sql)).rows
    : await consultar<{ hoje: string }>(sql);
  return linhas[0].hoje;
}

// ------------------------------------------------------------------ competência

export interface CompetenciaResumo {
  id: number;
  ano: number;
  mes: number;
  tipo: string;
  estado: EstadoCompetencia;
  aberta_em: string;
  fechada_em: string | null;
  calculada_por: number | null;
  aprovada_por: number | null;
  total_calculadas: number;
}

interface LinhaCompetencia extends Record<string, unknown> {
  id: string;
  ano: number;
  mes: number;
  tipo: string;
  estado: EstadoCompetencia;
  aberta_em: string;
  fechada_em: string | null;
  calculada_por: string | null;
  aprovada_por: string | null;
  total_calculadas: string;
}

const SELECT_COMPETENCIA = `
  SELECT c.id, c.ano, c.mes, c.tipo, c.estado,
         c.aberta_em::text AS aberta_em, c.fechada_em::text AS fechada_em,
         c.calculada_por, c.aprovada_por,
         (SELECT COUNT(*) FROM rh_folha.folha_colaborador f
           WHERE f.competencia_id = c.id) AS total_calculadas
    FROM rh_folha.competencia_folha c`;

function paraCompetencia(linha: LinhaCompetencia): CompetenciaResumo {
  return {
    ...linha,
    id: Number(linha.id),
    calculada_por:
      linha.calculada_por === null ? null : Number(linha.calculada_por),
    aprovada_por:
      linha.aprovada_por === null ? null : Number(linha.aprovada_por),
    total_calculadas: Number(linha.total_calculadas),
  };
}

export async function listarCompetencias(): Promise<CompetenciaResumo[]> {
  const linhas = await consultar<LinhaCompetencia>(
    `${SELECT_COMPETENCIA} ORDER BY c.ano DESC, c.mes DESC, c.id DESC`
  );
  return linhas.map(paraCompetencia);
}

export async function buscarCompetencia(
  id: number,
  cliente?: PoolClient
): Promise<CompetenciaResumo | null> {
  const sql = `${SELECT_COMPETENCIA} WHERE c.id = $1`;
  const linhas = cliente
    ? (await cliente.query<LinhaCompetencia>(sql, [id])).rows
    : await consultar<LinhaCompetencia>(sql, [id]);
  return linhas.length > 0 ? paraCompetencia(linhas[0]) : null;
}

export async function buscarCompetenciaParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<CompetenciaResumo | null> {
  const { rows } = await cliente.query<LinhaCompetencia>(
    `${SELECT_COMPETENCIA} WHERE c.id = $1 FOR UPDATE OF c`,
    [id]
  );
  return rows.length > 0 ? paraCompetencia(rows[0]) : null;
}

export async function inserirCompetencia(
  cliente: PoolClient,
  dados: { ano: number; mes: number; abertaPor: number }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.competencia_folha (ano, mes, aberta_por)
     VALUES ($1, $2, $3) RETURNING id`,
    [dados.ano, dados.mes, dados.abertaPor]
  );
  return Number(rows[0].id);
}

/** Transição condicionada ao estado atual — falha (false) se outro processo mudou antes. */
export async function mudarEstado(
  cliente: PoolClient,
  id: number,
  de: EstadoCompetencia,
  para: EstadoCompetencia
): Promise<boolean> {
  const resultado = await cliente.query(
    `UPDATE rh_folha.competencia_folha SET estado = $3
      WHERE id = $1 AND estado = $2`,
    [id, de, para]
  );
  return (resultado.rowCount ?? 0) > 0;
}

export async function registrarCalculadaPor(
  cliente: PoolClient,
  id: number,
  usuarioId: number
): Promise<void> {
  await cliente.query(
    "UPDATE rh_folha.competencia_folha SET calculada_por = $2 WHERE id = $1",
    [id, usuarioId]
  );
}

export async function aprovarCompetenciaNoBanco(
  cliente: PoolClient,
  id: number,
  usuarioId: number
): Promise<boolean> {
  const resultado = await cliente.query(
    `UPDATE rh_folha.competencia_folha
        SET estado = 'aprovada', aprovada_em = now(), aprovada_por = $2
      WHERE id = $1 AND estado = 'conferencia'`,
    [id, usuarioId]
  );
  return (resultado.rowCount ?? 0) > 0;
}

export async function fecharCompetencia(
  cliente: PoolClient,
  id: number,
  usuarioId: number
): Promise<boolean> {
  const resultado = await cliente.query(
    `UPDATE rh_folha.competencia_folha
        SET estado = 'fechada', fechada_em = now(), fechada_por = $2
      WHERE id = $1 AND estado = 'aprovada'`,
    [id, usuarioId]
  );
  return (resultado.rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ colaboradores para o cálculo
//
// TUDO AQUI SE RESOLVE NA DATA DE REFERÊNCIA DA COMPETÊNCIA — nunca em "hoje".
// Quem calcula precisa saber quanto a pessoa ganhava NAQUELE mês, com a jornada
// daquele mês e os dependentes que já existiam. Ler o cadastro de agora fazia
// duas coisas erradas ao mesmo tempo: um aumento com vigência de agosto já era
// pago na folha de julho, e RECALCULAR uma competência devolvia um resultado
// diferente do primeiro cálculo só porque o cadastro andou no meio.
//
// É a mesma régua que rh_folha.apropriacao_competencia (0047) usa para dizer
// ONDE o custo cai; faltava usá-la para dizer QUANTO é o custo.

/** `vigente na data` — o recorte que substituiu `fim_vigencia IS NULL`. */
function vigenteEm(alias: string, parametro: string): string {
  return `${alias}.inicio_vigencia <= ${parametro}
       AND (${alias}.fim_vigencia IS NULL OR ${alias}.fim_vigencia >= ${parametro})`;
}

/**
 * Vínculo VIVO NO FIM DA COMPETÊNCIA — a mesma régua (o último dia) que a
 * apropriação usa para dizer onde o custo cai. Admitido até o último dia entra;
 * desligado dentro da competência (inclusive no último dia) não entra, porque a
 * rescisão não sai desta folha — `listarAvisosProporcional` é quem cobra o
 * tratamento manual dos dois casos.
 *
 * O que muda: `status` era BANDEIRA DE HOJE e decidia o passado. Demitir alguém
 * em agosto apagava a linha dessa pessoa de um recálculo de julho, e quem seria
 * admitido em setembro já entrava na folha de julho.
 *
 * RESÍDUO CONHECIDO, deixado de propósito: `status <> 'afastado'` continua sendo
 * bandeira de hoje. Ela não foi trocada por data porque a troca não é mecânica —
 * é decisão de negócio, e cara:
 *   - hoje NENHUM vínculo carrega o status 'afastado' (o módulo guarda o período
 *     em rh.afastamento, com `inicio`/`fim`), então esta condição não exclui
 *     ninguém na prática — ela é rede morta;
 *   - resolver por data usando rh.afastamento excluiria da folha do mês inteiro
 *     quem teve QUALQUER afastamento no período (na base de hoje, 3 pessoas em
 *     07/2026), inclusive um afastamento de dois dias. Isso é proporcional, e o
 *     F1 declaradamente não faz proporcional (calculo.ts).
 * Enquanto o dono não decidir a regra (mês inteiro? proporcional? só acima de N
 * dias?), quem se afasta no meio do mês aparece em `listarAvisosProporcional`
 * para tratamento manual — que é o mesmo caminho da admissão e do desligamento.
 */
const VINCULO_NA_DATA = `c.data_admissao <= $1
     AND (c.data_desligamento IS NULL OR c.data_desligamento > $1)
     AND c.status <> 'afastado'`;

export interface ImpedidoCalculo {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  motivo: string;
}

export async function listarImpedidos(
  dataRef: string,
  cliente?: PoolClient
): Promise<ImpedidoCalculo[]> {
  const sql = `
    SELECT c.id, c.nome_completo, c.matricula
      FROM rh.colaborador c
     WHERE ${VINCULO_NA_DATA}
       AND NOT EXISTS (
         SELECT 1 FROM rh.posicao_colaborador p
          WHERE p.colaborador_id = c.id AND ${vigenteEm("p", "$1")})
     ORDER BY c.nome_completo, c.id`;
  const linhas = cliente
    ? (await cliente.query<{ id: string; nome_completo: string; matricula: string }>(sql, [dataRef])).rows
    : await consultar<{ id: string; nome_completo: string; matricula: string }>(sql, [dataRef]);
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
    motivo: "sem posição/salário vigente na competência",
  }));
}

// ------------------------------------------------------------------ avisos de proporcional

export interface AvisoProporcional {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  motivo: string;
  entra_no_calculo: boolean;
}

/**
 * Quem MUDOU DE ESTADO dentro do mês da competência — admissão, desligamento,
 * transferência entre CNPJs ou AFASTAMENTO que toca o período.
 *
 * O motor é declaradamente "folha mensal ordinária" e não faz proporcional de
 * admissão nem de desligamento (calculo.ts). Isso é decisão registrada — mas
 * até aqui a única lista de aviso da tela era `impedidos`, cujo único motivo
 * possível é "sem posição/salário vigente". Quem foi desligado no dia 10 e quem
 * foi admitido no dia 28 não apareciam em lugar nenhum: a folha errava sozinha
 * e em silêncio.
 *
 * O caso mais caro é a transferência entre empresas do grupo (0048): o vínculo
 * velho fica 'desligado' e sai do cálculo, o vínculo novo nasce 'ativo' e entra
 * com salário CHEIO por poucos dias — e, como a folha aponta para o centro de
 * custo, o custo inteiro cai no CNPJ errado. Por isso o aviso da transferência
 * nomeia as DUAS empresas: o dinheiro está atravessando CNPJ.
 *
 * Não calcula nada: informa, para o DP tratar por lançamento manual.
 */
export async function listarAvisosProporcional(
  ano: number,
  mes: number,
  cliente?: PoolClient
): Promise<AvisoProporcional[]> {
  const sql = `
    WITH janela AS (
      SELECT make_date($1::int, $2::int, 1) AS inicio,
             (make_date($1::int, $2::int, 1) + INTERVAL '1 month - 1 day')::date AS fim
    ),
    empresa_do_vinculo AS (
      SELECT ld.colaborador_id,
             ld.empresa_nome,
             row_number() OVER (PARTITION BY ld.colaborador_id
                                ORDER BY ld.inicio_vigencia DESC, ld.id DESC) AS ordem
        FROM rh.lotacao_detalhada ld
    )
    SELECT c.id, c.nome_completo, c.matricula,
           (c.status = 'ativo') AS entra_no_calculo,
           CASE
             WHEN c.data_admissao NOT BETWEEN j.inicio AND j.fim
              AND (c.data_desligamento IS NULL
                   OR c.data_desligamento NOT BETWEEN j.inicio AND j.fim) THEN
               'afastado de ' || to_char(af.inicio, 'DD/MM')
               || coalesce(' a ' || to_char(af.fim, 'DD/MM'), ' (em aberto)')
               || ' — o F1 não apura afastamento: entra com salário do mês inteiro'
             WHEN c.sucede_vinculo_id IS NOT NULL THEN
               'admitido em ' || to_char(c.data_admissao, 'DD/MM')
               || ' por transferência de ' || coalesce(orig.empresa_nome, 'outra empresa do grupo')
               || ' para ' || coalesce(dest.empresa_nome, 'esta empresa')
               || ' — entra com salário do mês inteiro'
             WHEN c.data_desligamento IS NOT NULL AND NOT rh.saiu_do_grupo(c.id) THEN
               'encerrado em ' || to_char(c.data_desligamento, 'DD/MM')
               || ' por transferência de ' || coalesce(dest.empresa_nome, 'esta empresa')
               || ' para ' || coalesce(suc_emp.empresa_nome, 'outra empresa do grupo')
               || ' — os dias trabalhados aqui não entram em nenhuma folha'
             WHEN c.data_desligamento IS NOT NULL THEN
               'desligado em ' || to_char(c.data_desligamento, 'DD/MM')
               || ' — a rescisão não é calculada por esta competência'
             ELSE
               'admitido em ' || to_char(c.data_admissao, 'DD/MM')
               || ' — entra com salário do mês inteiro'
           END AS motivo
      FROM rh.colaborador c
      CROSS JOIN janela j
      LEFT JOIN empresa_do_vinculo dest
             ON dest.colaborador_id = c.id AND dest.ordem = 1
      LEFT JOIN empresa_do_vinculo orig
             ON orig.colaborador_id = c.sucede_vinculo_id AND orig.ordem = 1
      LEFT JOIN rh.colaborador suc ON suc.sucede_vinculo_id = c.id
      LEFT JOIN empresa_do_vinculo suc_emp
             ON suc_emp.colaborador_id = suc.id AND suc_emp.ordem = 1
      -- O afastamento que TOCA a competência (o primeiro, se houver mais de um).
      -- O período mora em rh.afastamento COM DATA; o status do vínculo não serve
      -- para isto porque é bandeira de hoje.
      LEFT JOIN LATERAL (
             SELECT a.inicio, a.fim
               FROM rh.afastamento a
              WHERE a.colaborador_id = c.id
                AND a.inicio <= j.fim
                AND (a.fim IS NULL OR a.fim >= j.inicio)
              ORDER BY a.inicio, a.id
              LIMIT 1) af ON TRUE
     WHERE (c.data_admissao BETWEEN j.inicio AND j.fim)
        OR (c.data_desligamento BETWEEN j.inicio AND j.fim)
        OR af.inicio IS NOT NULL
     ORDER BY c.nome_completo, c.id`;
  const linhas = cliente
    ? (
        await cliente.query<{
          id: string;
          nome_completo: string;
          matricula: string;
          motivo: string;
          entra_no_calculo: boolean;
        }>(sql, [ano, mes])
      ).rows
    : await consultar<{
        id: string;
        nome_completo: string;
        matricula: string;
        motivo: string;
        entra_no_calculo: boolean;
      }>(sql, [ano, mes]);
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
    motivo: linha.motivo,
    entra_no_calculo: linha.entra_no_calculo,
  }));
}

export interface ColaboradorCalculo {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  salario_centavos: number;
  dependentes_irrf: number;
  /** Carga semanal da jornada da COMPETÊNCIA — dá o divisor da hora (0038). */
  carga_semanal_minutos: number | null;
}

/**
 * Salário, jornada e dependentes COMO ESTAVAM na data de referência da
 * competência — não como estão hoje.
 *
 * Cada um vem por LATERAL com LIMIT 1 em vez de JOIN direto: o banco só garante
 * "uma vigente" para a linha em aberto (posicao_colaborador_uma_vigente,
 * escala_colaborador_uma_vigente — ambos parciais em `fim_vigencia IS NULL`), e
 * nada impede duas vigências históricas se sobreporem num dia. Com JOIN direto
 * isso duplicaria a linha da pessoa e a folha tentaria gravar duas vezes o
 * mesmo colaborador na competência; com LATERAL, a mais recente ganha e a folha
 * sai com uma linha por pessoa, doa o que doer no histórico.
 *
 * A escala continua por LEFT JOIN de propósito: quem não tem jornada cadastrada
 * naquele mês continua entrando no cálculo (cai no divisor de referência dos
 * parâmetros), em vez de sumir da folha por causa de um cadastro de ponto que
 * falta.
 *
 * Dependente conta por NASCIMENTO, não por data de cadastro: a dedução de IRRF
 * é devida desde que o dependente existe, e cadastrar em setembro um filho
 * nascido em maio não pode mudar o que julho já deveria ter deduzido — nem o
 * filho que nasce em setembro pode aparecer na folha de julho.
 */
export async function listarColaboradoresParaCalculo(
  cliente: PoolClient,
  dataRef: string
): Promise<ColaboradorCalculo[]> {
  const { rows } = await cliente.query<{
    id: string;
    nome_completo: string;
    matricula: string;
    salario: string;
    dependentes: string;
    carga_semanal_minutos: number | null;
  }>(
    `SELECT c.id, c.nome_completo, c.matricula, p.salario::text AS salario,
            -- Só dependente ELEGÍVEL abate no IRRF (pendência #9, migration 0061):
            -- deduz_irrf é ato do DP (conferência); o autoatendimento nasce false.
            (SELECT COUNT(*) FROM rh.dependente d
              WHERE d.colaborador_id = c.id
                AND d.deduz_irrf = true
                -- ...e conta por NASCIMENTO na data da competência, não por data
                -- de cadastro: filho que nasce DEPOIS da competência não entra no
                -- recálculo dela. Elegibilidade (deduz_irrf) e vigência (nascimento)
                -- são ORTOGONAIS — o #9 trocou uma pela outra; aqui somam. (rev.)
                AND (d.nascimento IS NULL OR d.nascimento <= $1)) AS dependentes,
            j.carga_semanal_minutos
       FROM rh.colaborador c
       JOIN LATERAL (
              SELECT p.salario
                FROM rh.posicao_colaborador p
               WHERE p.colaborador_id = c.id AND ${vigenteEm("p", "$1")}
               ORDER BY p.inicio_vigencia DESC, p.id DESC
               LIMIT 1) p ON TRUE
       LEFT JOIN LATERAL (
              SELECT e.jornada_versao_id
                FROM rh.escala_colaborador e
               WHERE e.colaborador_id = c.id AND ${vigenteEm("e", "$1")}
               ORDER BY e.inicio_vigencia DESC, e.id DESC
               LIMIT 1) e ON TRUE
       LEFT JOIN rh.jornada_versao j ON j.id = e.jornada_versao_id
      WHERE ${VINCULO_NA_DATA}
      ORDER BY c.nome_completo, c.id`,
    [dataRef]
  );
  return rows.map((linha) => ({
    colaborador_id: Number(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
    salario_centavos: paraCentavos(linha.salario),
    dependentes_irrf: Number(linha.dependentes),
    carga_semanal_minutos:
      linha.carga_semanal_minutos === null
        ? null
        : Number(linha.carga_semanal_minutos),
  }));
}

// ------------------------------------------------------------------ variáveis lançadas

export interface VariavelResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  rubrica_id: number;
  codigo: string;
  rubrica_nome: string;
  natureza: NaturezaRubrica;
  referencia: number | null;
  valor_centavos: number | null;
  origem: OrigemVariavel;
}

interface LinhaVariavel extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  matricula: string;
  rubrica_id: string;
  codigo: string;
  rubrica_nome: string;
  natureza: NaturezaRubrica;
  referencia: string | null;
  valor: string | null;
  origem: OrigemVariavel;
}

const SELECT_VARIAVEL = `
  SELECT v.id, v.colaborador_id, c.nome_completo AS colaborador_nome,
         c.matricula, v.rubrica_id, r.codigo, r.nome AS rubrica_nome,
         r.natureza, v.referencia::text AS referencia, v.valor::text AS valor,
         v.origem
    FROM rh_folha.variavel_lancada v
    JOIN rh.colaborador c ON c.id = v.colaborador_id
    JOIN rh_folha.rubrica r ON r.id = v.rubrica_id`;

function paraVariavel(linha: LinhaVariavel): VariavelResumo {
  return {
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    rubrica_id: Number(linha.rubrica_id),
    codigo: linha.codigo,
    rubrica_nome: linha.rubrica_nome,
    natureza: linha.natureza,
    referencia: numeroOuNulo(linha.referencia),
    valor_centavos: linha.valor === null ? null : paraCentavos(linha.valor),
    origem: linha.origem,
  };
}

export async function listarVariaveis(
  competenciaId: number,
  cliente?: PoolClient
): Promise<VariavelResumo[]> {
  const sql = `${SELECT_VARIAVEL}
    WHERE v.competencia_id = $1
    ORDER BY c.nome_completo, r.codigo, v.id`;
  const linhas = cliente
    ? (await cliente.query<LinhaVariavel>(sql, [competenciaId])).rows
    : await consultar<LinhaVariavel>(sql, [competenciaId]);
  return linhas.map(paraVariavel);
}

export async function buscarVariavelParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<(VariavelResumo & { competencia_id: number }) | null> {
  const { rows } = await cliente.query<LinhaVariavel & { competencia_id: string }>(
    `SELECT v.id, v.competencia_id, v.colaborador_id,
            c.nome_completo AS colaborador_nome, c.matricula, v.rubrica_id,
            r.codigo, r.nome AS rubrica_nome, r.natureza,
            v.referencia::text AS referencia, v.valor::text AS valor, v.origem
       FROM rh_folha.variavel_lancada v
       JOIN rh.colaborador c ON c.id = v.colaborador_id
       JOIN rh_folha.rubrica r ON r.id = v.rubrica_id
      WHERE v.id = $1
      FOR UPDATE OF v`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...paraVariavel(rows[0]),
    competencia_id: Number(rows[0].competencia_id),
  };
}

export async function inserirVariavel(
  cliente: PoolClient,
  dados: {
    competencia_id: number;
    colaborador_id: number;
    rubrica_id: number;
    referencia: number | null;
    valor_centavos: number | null;
    origem: OrigemVariavel;
    lancado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.variavel_lancada
       (competencia_id, colaborador_id, rubrica_id, referencia, valor, origem, lancado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      dados.competencia_id,
      dados.colaborador_id,
      dados.rubrica_id,
      dados.referencia,
      dados.valor_centavos === null ? null : centavosParaSql(dados.valor_centavos),
      dados.origem,
      dados.lancado_por,
    ]
  );
  return Number(rows[0].id);
}

export async function excluirVariavel(
  cliente: PoolClient,
  id: number
): Promise<void> {
  await cliente.query(`DELETE FROM rh_folha.variavel_lancada WHERE id = $1`, [id]);
}

export async function excluirVariaveisDeBeneficio(
  cliente: PoolClient,
  competenciaId: number
): Promise<number> {
  const resultado = await cliente.query(
    `DELETE FROM rh_folha.variavel_lancada
      WHERE competencia_id = $1 AND origem = 'beneficio'`,
    [competenciaId]
  );
  return resultado.rowCount ?? 0;
}

export async function excluirVariaveisDePonto(
  cliente: PoolClient,
  competenciaId: number
): Promise<number> {
  const resultado = await cliente.query(
    `DELETE FROM rh_folha.variavel_lancada
      WHERE competencia_id = $1 AND origem = 'ponto'`,
    [competenciaId]
  );
  return resultado.rowCount ?? 0;
}

/**
 * A apuração de ponto da competência, já convertida para o que a folha
 * precisa. TUDO EM MINUTOS INTEIROS aqui (a conversão para horas/dias é do
 * serviço, que também precisa da carga diária para dividir): o repositório não
 * arredonda nada, senão o erro nasce no SQL e ninguém acha depois.
 *
 * `carga_diaria_minutos` vem da JORNADA PINADA na apuração
 * (rh.apuracao_ponto.jornada_versao_id), nunca da jornada "atual" — é ela que
 * transforma minutos de falta em DIAS de falta, e trocar de jornada em agosto
 * não pode mexer no que junho apurou.
 *
 * SEM FILTRO DE VÍNCULO, e isso é a correção: aqui havia `c.status = 'ativo'`,
 * bandeira de HOJE decidindo o passado — o mesmo defeito que `VINCULO_NA_DATA`
 * declara corrigido 400 linhas acima. Reimportar uma competência antiga depois
 * de um desligamento apagava as horas extras e o adicional noturno do mês final
 * de quem saiu: medido na bancada sobre 07/2026 com duas desligadas (uma em
 * 20/07, outra em 01/08), sumiam 14.400 min de adicional noturno (240 h) e
 * 1.800 min de HE 50% — 60 pessoas importadas onde a apuração tinha 62.
 *
 * Não entrou `VINCULO_NA_DATA` no lugar porque aqui ele seria redundante e
 * perigoso: a EXISTÊNCIA da linha em rh.apuracao_ponto para (ano, mes) já é a
 * prova de que a pessoa trabalhou a competência — foi o motor do ponto que a
 * escreveu, depois de resolver escala e vínculo dia a dia. Filtrar de novo por
 * data aqui seria uma segunda régua sobre o mesmo fato, e a segunda régua é
 * exatamente o que produz holerite que não fecha com o espelho.
 */
export interface ApuracaoParaFolha {
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  faltas_minutos: number;
  dsr_desconto_minutos: number;
  carga_diaria_minutos: number;
}

export async function listarApuracaoDePontoDaCompetencia(
  cliente: PoolClient,
  ano: number,
  mes: number
): Promise<ApuracaoParaFolha[]> {
  const { rows } = await cliente.query<{
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    he_50_minutos: number;
    he_100_minutos: number;
    adicional_noturno_minutos: number;
    faltas_minutos: number;
    dsr_desconto_minutos: number;
    carga_diaria_minutos: number;
  }>(
    `SELECT a.colaborador_id, c.nome_completo AS colaborador_nome, c.matricula,
            a.he_50_minutos, a.he_100_minutos, a.adicional_noturno_minutos,
            a.faltas_minutos, a.dsr_desconto_minutos,
            j.carga_diaria_minutos
       FROM rh.apuracao_ponto a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
       JOIN rh.jornada_versao j ON j.id = a.jornada_versao_id
      WHERE a.ano = $1 AND a.mes = $2
      ORDER BY c.nome_completo, a.colaborador_id`,
    [ano, mes]
  );
  return rows.map((linha) => ({
    colaborador_id: Number(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    he_50_minutos: linha.he_50_minutos,
    he_100_minutos: linha.he_100_minutos,
    adicional_noturno_minutos: linha.adicional_noturno_minutos,
    faltas_minutos: linha.faltas_minutos,
    dsr_desconto_minutos: linha.dsr_desconto_minutos,
    carga_diaria_minutos: linha.carga_diaria_minutos,
  }));
}

/**
 * Quantas intercorrências de ponto continuam ABERTAS na competência E ainda
 * podem mudar o número que a folha vai importar.
 *
 * O filtro por tipo não é detalhe: a fila do DP também guarda
 * `banco_fora_do_limite`, que é decisão sobre o banco de horas e não move um
 * centavo desta competência (ver TIPOS_INTERCORRENCIA_QUE_MUDAM_A_APURACAO no
 * domínio de ponto, dono do conceito). Sem o filtro, a competência 07/2026
 * travava com 28 pendências das quais 16 eram avisos de teto de banco — o DP
 * seria obrigado a confirmar por cima de um alerta que não é sobre folha, e a
 * confirmação viraria reflexo.
 */
export async function contarIntercorrenciasAbertasDaCompetencia(
  cliente: PoolClient,
  ano: number,
  mes: number
): Promise<number> {
  const { rows } = await cliente.query<{ total: string }>(
    `SELECT count(*)::text AS total
       FROM rh.intercorrencia_ponto
      WHERE status = 'aberta'
        AND tipo = ANY($3::text[])
        AND date_part('year', data) = $1
        AND date_part('month', data) = $2`,
    [ano, mes, TIPOS_INTERCORRENCIA_QUE_MUDAM_A_APURACAO]
  );
  return Number(rows[0]?.total ?? 0);
}

export interface AdesaoDesconto {
  colaborador_id: number;
  colaborador_nome: string;
  desconto_centavos: number;
  beneficio_nome: string;
}

/**
 * As adesões que valiam NA DATA da competência — insumo do botão "importar
 * descontos".
 *
 * Era a ÚNICA consulta deste arquivo que não recebia data, num arquivo cujo
 * cabeçalho diz em maiúsculas que tudo se resolve na data da competência. Lia
 * `a.fim IS NULL AND a.status = 'ativa' AND c.status = 'ativo'` — três
 * bandeiras de HOJE decidindo um mês passado, e errando nas duas direções:
 *
 *   • quem CANCELOU o benefício depois do fechamento (fim em 15/08) perdia o
 *     desconto de julho, que era devido — a adesão valeu o mês inteiro;
 *   • quem ADERIU depois (início em 05/08) era descontado ao reimportar julho,
 *     de um benefício que ainda não tinha;
 *   • quem foi DESLIGADO em 01/08 perdia os quatro descontos do último mês.
 *
 * Medido na bancada sobre 07/2026: 274 linhas / R$ 20.804,70 pela leitura de
 * hoje contra 277 / R$ 21.008,70 na data — 5 linhas que faltavam e 2 que
 * sobravam.
 *
 * `status <> 'suspensa'` no lugar de `= 'ativa'`: 'cancelada' já é resolvida
 * pela janela (o CHECK do banco garante que cancelada tem `fim`), e é
 * justamente ela que a leitura antiga jogava fora. RESÍDUO CONHECIDO, na mesma
 * linha do que `VINCULO_NA_DATA` documenta para 'afastado': suspensão não tem
 * par de datas em rh.adesao, então 'suspensa' continua sendo bandeira de hoje.
 * Suspender em agosto ainda apaga o desconto de julho numa reimportação.
 * Resolver isso é dar janela à suspensão — decisão de negócio, não conserto
 * mecânico, e está registrada em docs/pendencias.md.
 *
 * O vínculo entra por `VINCULO_NA_DATA`, a mesma régua de quem é calculado na
 * competência: importar desconto para quem a folha não calcula seria criar
 * variável órfã.
 */
export async function listarDescontosDeAdesao(
  cliente: PoolClient,
  dataRef: string
): Promise<AdesaoDesconto[]> {
  const { rows } = await cliente.query<{
    colaborador_id: string;
    colaborador_nome: string;
    desconto: string;
    beneficio_nome: string;
  }>(
    `SELECT a.colaborador_id, c.nome_completo AS colaborador_nome,
            a.desconto::text AS desconto, b.nome AS beneficio_nome
       FROM rh.adesao a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
       JOIN rh.beneficio b ON b.id = a.beneficio_id
      WHERE a.inicio <= $1 AND (a.fim IS NULL OR a.fim >= $1)
        AND a.status <> 'suspensa'
        AND a.desconto IS NOT NULL AND a.desconto > 0
        AND ${VINCULO_NA_DATA}
      ORDER BY c.nome_completo, b.nome, a.id`,
    [dataRef]
  );
  return rows.map((linha) => ({
    colaborador_id: Number(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    desconto_centavos: paraCentavos(linha.desconto),
    beneficio_nome: linha.beneficio_nome,
  }));
}

// ------------------------------------------------------------------ rubricas e versões

export interface RubricaVigente extends RubricaMotor {
  rubrica_id: number;
  /** Verba genérica de escape (9001/9002): vai por último e com aviso. */
  excecao: boolean;
}

interface LinhaRubricaVigente extends Record<string, unknown> {
  rubrica_id: string;
  rubrica_versao_id: string;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  excecao: boolean;
  incide_inss: boolean;
  incide_irrf: boolean;
  incide_fgts: boolean;
  tipo_calculo: TipoCalculo;
  parametro: string | null;
}

/**
 * A versão da rubrica que valia NA DATA — não a que está ativa agora.
 *
 * `status = 'ativa'` é o trinco de "uma versão corrente por rubrica", não
 * vigência (ver lib/vigencia.ts). Lendo por ele, publicar em agosto uma versão
 * nova da rubrica de hora extra mudava o fator das horas extras de JULHO no
 * primeiro recálculo — a versão de julho está lá, encerrada, com fim_vigencia
 * 31/07, e era simplesmente ignorada. Só 'rascunho' fica de fora: rascunho é
 * versão que ninguém publicou, não vale para data nenhuma.
 *
 * `r.ativo` continua sem data porque é catálogo, não valor: diz se a rubrica
 * pode ser LANÇADA hoje. Encerrar rubrica com lançamento vivo em competência
 * recalculável já é recusado (contarLancamentosRecalculaveis) e os códigos que
 * o motor procura pelo nome não podem ser encerrados (CODIGOS_DO_MOTOR).
 */
export async function listarRubricasVigentes(
  dataRef: string,
  cliente?: PoolClient
): Promise<RubricaVigente[]> {
  // Ordem: rubricas próprias primeiro, as genéricas (excecao) por ÚLTIMO —
  // diretriz da diretoria de eliminar os proventos manuais (migração 0028).
  const sql = `
    SELECT r.id AS rubrica_id, rv.id AS rubrica_versao_id, r.codigo, r.nome,
           r.natureza, r.excecao, rv.incide_inss, rv.incide_irrf, rv.incide_fgts,
           rv.tipo_calculo, rv.parametro::text AS parametro
      FROM rh_folha.rubrica r
      JOIN LATERAL (
             SELECT rv.*
               FROM rh_folha.rubrica_versao rv
              WHERE rv.rubrica_id = r.id
                AND rv.status <> 'rascunho'
                AND ${vigenteEm("rv", "$1")}
              ORDER BY rv.inicio_vigencia DESC, rv.id DESC
              LIMIT 1) rv ON TRUE
     WHERE r.ativo
     ORDER BY r.excecao, r.codigo`;
  const linhas = cliente
    ? (await cliente.query<LinhaRubricaVigente>(sql, [dataRef])).rows
    : await consultar<LinhaRubricaVigente>(sql, [dataRef]);
  return linhas.map((linha) => ({
    rubrica_id: Number(linha.rubrica_id),
    rubrica_versao_id: Number(linha.rubrica_versao_id),
    codigo: linha.codigo,
    nome: linha.nome,
    natureza: linha.natureza,
    excecao: linha.excecao,
    incide_inss: linha.incide_inss,
    incide_irrf: linha.incide_irrf,
    incide_fgts: linha.incide_fgts,
    tipo_calculo: linha.tipo_calculo,
    parametro: numeroOuNulo(linha.parametro),
  }));
}

export interface RubricaBasica {
  id: number;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  ativo: boolean;
  excecao: boolean;
}

export async function buscarRubricaParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<RubricaBasica | null> {
  const { rows } = await cliente.query<{
    id: string;
    codigo: string;
    nome: string;
    natureza: NaturezaRubrica;
    ativo: boolean;
    excecao: boolean;
  }>(
    `SELECT id, codigo, nome, natureza, ativo, excecao
       FROM rh_folha.rubrica WHERE id = $1 FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

/**
 * Cria a rubrica (identidade). A primeira VERSÃO entra logo em seguida, na
 * mesma transação — rubrica sem versão vigente não é lançável nem calculável.
 * Código duplicado estoura 23505 (rubrica_codigo_key) e vira 409 no serviço.
 */
export async function inserirRubrica(
  cliente: PoolClient,
  dados: { codigo: string; nome: string; natureza: NaturezaRubrica }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.rubrica (codigo, nome, natureza)
     VALUES ($1, $2, $3) RETURNING id`,
    [dados.codigo, dados.nome, dados.natureza]
  );
  return Number(rows[0].id);
}

export interface VersaoRubrica {
  id: number;
  rubrica_id: number;
  incide_inss: boolean;
  incide_irrf: boolean;
  incide_fgts: boolean;
  tipo_calculo: TipoCalculo;
  parametro: number | null;
  status: "rascunho" | "ativa" | "encerrada";
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarVersoesRubricas(): Promise<VersaoRubrica[]> {
  const linhas = await consultar<{
    id: string;
    rubrica_id: string;
    incide_inss: boolean;
    incide_irrf: boolean;
    incide_fgts: boolean;
    tipo_calculo: TipoCalculo;
    parametro: string | null;
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT id, rubrica_id, incide_inss, incide_irrf, incide_fgts,
            tipo_calculo, parametro::text AS parametro, status,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia
       FROM rh_folha.rubrica_versao
      ORDER BY rubrica_id, inicio_vigencia DESC, id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    rubrica_id: Number(linha.rubrica_id),
    parametro: numeroOuNulo(linha.parametro),
  }));
}

export interface CatalogoRubrica extends RubricaBasica {
  versoes: VersaoRubrica[];
}

export async function listarCatalogoRubricas(): Promise<CatalogoRubrica[]> {
  const [rubricas, versoes] = await Promise.all([
    consultar<{
      id: string;
      codigo: string;
      nome: string;
      natureza: NaturezaRubrica;
      ativo: boolean;
      excecao: boolean;
    }>(
      // Genéricas (excecao) por último, igual à lista de lançamento.
      `SELECT id, codigo, nome, natureza, ativo, excecao
         FROM rh_folha.rubrica ORDER BY excecao, codigo`
    ),
    listarVersoesRubricas(),
  ]);
  return rubricas.map((rubrica) => ({
    ...rubrica,
    id: Number(rubrica.id),
    versoes: versoes.filter((versao) => versao.rubrica_id === Number(rubrica.id)),
  }));
}

export async function buscarVersaoAtivaRubricaParaAtualizar(
  cliente: PoolClient,
  rubricaId: number
): Promise<{ id: number; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{ id: string; inicio_vigencia: string }>(
    `SELECT id, inicio_vigencia::text AS inicio_vigencia
       FROM rh_folha.rubrica_versao
      WHERE rubrica_id = $1 AND status = 'ativa'
      FOR UPDATE`,
    [rubricaId]
  );
  if (rows.length === 0) return null;
  return { id: Number(rows[0].id), inicio_vigencia: rows[0].inicio_vigencia };
}

export async function encerrarVersaoRubrica(
  cliente: PoolClient,
  versaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh_folha.rubrica_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [versaoId, inicioDaProxima]
  );
}

/**
 * Encerra a versão vigente numa data ESCOLHIDA — encerramento da rubrica, não
 * troca de versão (lá o fim sai do início da próxima, aqui não há próxima).
 */
export async function encerrarVersaoRubricaEm(
  cliente: PoolClient,
  versaoId: number,
  fimVigencia: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh_folha.rubrica_versao
        SET status = 'encerrada', fim_vigencia = $2::date
      WHERE id = $1`,
    [versaoId, fimVigencia]
  );
}

/** Tira a rubrica do catálogo lançável — listarRubricasVigentes filtra r.ativo. */
export async function desativarRubrica(
  cliente: PoolClient,
  rubricaId: number
): Promise<void> {
  await cliente.query(
    `UPDATE rh_folha.rubrica SET ativo = FALSE WHERE id = $1`,
    [rubricaId]
  );
}

/**
 * Lançamentos da rubrica em competências que ainda podem ser RECALCULADAS
 * (tudo que não está 'fechada'). Rubrica sem versão vigente derruba o motor
 * ('Rubrica X sem versão vigente'), então encerrar com lançamento vivo trocaria
 * um problema de catálogo por uma folha que não fecha.
 */
export async function contarLancamentosRecalculaveis(
  cliente: PoolClient,
  rubricaId: number
): Promise<{ lancamentos: number; competencias: string[] }> {
  const { rows } = await cliente.query<{
    lancamentos: string;
    competencias: string[] | null;
  }>(
    `SELECT count(*)::text AS lancamentos,
            array_agg(DISTINCT lpad(c.mes::text, 2, '0') || '/' || c.ano::text
                      ORDER BY lpad(c.mes::text, 2, '0') || '/' || c.ano::text)
              AS competencias
       FROM rh_folha.variavel_lancada v
       JOIN rh_folha.competencia_folha c ON c.id = v.competencia_id
      WHERE v.rubrica_id = $1
        AND c.estado <> 'fechada'`,
    [rubricaId]
  );
  return {
    lancamentos: Number(rows[0]?.lancamentos ?? 0),
    competencias: rows[0]?.competencias ?? [],
  };
}

export async function inserirVersaoRubrica(
  cliente: PoolClient,
  rubricaId: number,
  dados: {
    incide_inss: boolean;
    incide_irrf: boolean;
    incide_fgts: boolean;
    tipo_calculo: TipoCalculo;
    parametro: number | null;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.rubrica_versao
       (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo,
        parametro, status, inicio_vigencia)
     VALUES ($1, $2, $3, $4, $5, $6, 'ativa', $7)
     RETURNING id`,
    [
      rubricaId,
      dados.incide_inss,
      dados.incide_irrf,
      dados.incide_fgts,
      dados.tipo_calculo,
      dados.parametro,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ tabelas legais

interface FaixaInssJson {
  ate: number;
  aliquota: number;
}

interface FaixaIrrfJson {
  ate: number | null;
  aliquota: number;
  deducao: number;
}

export interface VersaoTabelaInss {
  id: number;
  faixas: FaixaInssJson[];
  teto_contribuicao: number;
  status: "rascunho" | "ativa" | "encerrada";
  inicio_vigencia: string;
  fim_vigencia: string | null;
  conferido_dp: boolean;
}

export async function listarVersoesInss(): Promise<VersaoTabelaInss[]> {
  const linhas = await consultar<{
    id: string;
    faixas: FaixaInssJson[];
    teto_contribuicao: string;
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
    conferido_dp: boolean;
  }>(
    `SELECT id, faixas, teto_contribuicao::text AS teto_contribuicao, status,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia, conferido_dp
       FROM rh_folha.tabela_inss_versao
      ORDER BY inicio_vigencia DESC, id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    teto_contribuicao: Number(linha.teto_contribuicao),
  }));
}

export interface VersaoTabelaIrrf {
  id: number;
  faixas: FaixaIrrfJson[];
  deducao_por_dependente: number;
  desconto_simplificado: number;
  status: "rascunho" | "ativa" | "encerrada";
  inicio_vigencia: string;
  fim_vigencia: string | null;
  conferido_dp: boolean;
}

export async function listarVersoesIrrf(): Promise<VersaoTabelaIrrf[]> {
  const linhas = await consultar<{
    id: string;
    faixas: FaixaIrrfJson[];
    deducao_por_dependente: string;
    desconto_simplificado: string;
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
    conferido_dp: boolean;
  }>(
    `SELECT id, faixas, deducao_por_dependente::text AS deducao_por_dependente,
            desconto_simplificado::text AS desconto_simplificado, status,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia, conferido_dp
       FROM rh_folha.tabela_irrf_versao
      ORDER BY inicio_vigencia DESC, id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    deducao_por_dependente: Number(linha.deducao_por_dependente),
    desconto_simplificado: Number(linha.desconto_simplificado),
  }));
}

export interface VersaoParametros {
  id: number;
  salario_minimo: number;
  aliquota_fgts: number;
  divisor_mensal_horas: number;
  carga_semanal_referencia_minutos: number;
  divisor_mensal_dias: number;
  status: "rascunho" | "ativa" | "encerrada";
  inicio_vigencia: string;
  fim_vigencia: string | null;
  conferido_dp: boolean;
}

export async function listarVersoesParametros(): Promise<VersaoParametros[]> {
  const linhas = await consultar<{
    id: string;
    salario_minimo: string;
    aliquota_fgts: string;
    divisor_mensal_horas: string;
    carga_semanal_referencia_minutos: number;
    divisor_mensal_dias: string;
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
    conferido_dp: boolean;
  }>(
    `SELECT id, salario_minimo::text AS salario_minimo,
            aliquota_fgts::text AS aliquota_fgts,
            divisor_mensal_horas::text AS divisor_mensal_horas,
            carga_semanal_referencia_minutos,
            divisor_mensal_dias::text AS divisor_mensal_dias, status,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia, conferido_dp
       FROM rh_folha.parametro_folha_versao
      ORDER BY inicio_vigencia DESC, id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    salario_minimo: Number(linha.salario_minimo),
    aliquota_fgts: Number(linha.aliquota_fgts),
    divisor_mensal_horas: Number(linha.divisor_mensal_horas),
    carga_semanal_referencia_minutos: Number(
      linha.carga_semanal_referencia_minutos
    ),
    divisor_mensal_dias: Number(linha.divisor_mensal_dias),
  }));
}

export interface TabelasVigentesMotor {
  inss: TabelaInssMotor;
  irrf: TabelaIrrfMotor;
  parametros: ParametrosFolhaMotor;
}

/**
 * As três tabelas legais que valiam NA DATA, já em centavos — null se faltar
 * alguma.
 *
 * As três tabelas têm inicio_vigencia e fim_vigencia desde que nasceram, e o
 * cadastro de versão nova já encerra a anterior na véspera (encerrarVersaoLegal).
 * Lê-las por `status = 'ativa'` desperdiçava exatamente essa informação: no dia
 * em que a tabela de 2027 fosse cadastrada, a competência de dezembro/2026 que
 * ainda estivesse aberta passaria a ser calculada com o INSS de 2027 — e sem
 * nenhum aviso, porque o número sai igual em todo lugar menos no holerite.
 */
export async function tabelasVigentes(
  dataRef: string,
  cliente?: PoolClient
): Promise<{ tabelas: TabelasVigentesMotor | null; faltantes: TipoTabelaLegal[] }> {
  const executar = async <T extends Record<string, unknown>>(
    sql: string
  ): Promise<T[]> =>
    cliente
      ? (await cliente.query<T>(sql, [dataRef])).rows
      : await consultar<T>(sql, [dataRef]);

  // Uma versão por data: `LIMIT 1` pela mais recente é rede de segurança, já que
  // o encerramento na véspera é regra do serviço e não trinco do banco.
  const naData = (tabela: string, colunas: string) =>
    `SELECT ${colunas}
       FROM ${tabela} v
      WHERE v.status <> 'rascunho' AND ${vigenteEm("v", "$1")}
      ORDER BY v.inicio_vigencia DESC, v.id DESC
      LIMIT 1`;

  const [inss, irrf, parametros] = await Promise.all([
    executar<{ id: string; faixas: FaixaInssJson[]; teto_contribuicao: string }>(
      naData(
        "rh_folha.tabela_inss_versao",
        "v.id, v.faixas, v.teto_contribuicao::text AS teto_contribuicao"
      )
    ),
    executar<{
      id: string;
      faixas: FaixaIrrfJson[];
      deducao_por_dependente: string;
      desconto_simplificado: string;
    }>(
      naData(
        "rh_folha.tabela_irrf_versao",
        `v.id, v.faixas,
         v.deducao_por_dependente::text AS deducao_por_dependente,
         v.desconto_simplificado::text AS desconto_simplificado`
      )
    ),
    executar<{
      id: string;
      aliquota_fgts: string;
      divisor_mensal_horas: string;
      carga_semanal_referencia_minutos: number;
      divisor_mensal_dias: string;
    }>(
      naData(
        "rh_folha.parametro_folha_versao",
        `v.id, v.aliquota_fgts::text AS aliquota_fgts,
         v.divisor_mensal_horas::text AS divisor_mensal_horas,
         v.carga_semanal_referencia_minutos,
         v.divisor_mensal_dias::text AS divisor_mensal_dias`
      )
    ),
  ]);

  const faltantes: TipoTabelaLegal[] = [];
  if (inss.length === 0) faltantes.push("inss");
  if (irrf.length === 0) faltantes.push("irrf");
  if (parametros.length === 0) faltantes.push("gerais");
  if (faltantes.length > 0) return { tabelas: null, faltantes };

  const faixasInss: FaixaInssMotor[] = inss[0].faixas.map((faixa) => ({
    ate_centavos: Math.round(faixa.ate * 100),
    aliquota: faixa.aliquota,
  }));
  const faixasIrrf: FaixaIrrfMotor[] = irrf[0].faixas.map((faixa) => ({
    ate_centavos: faixa.ate === null ? null : Math.round(faixa.ate * 100),
    aliquota: faixa.aliquota,
    deducao_centavos: Math.round(faixa.deducao * 100),
  }));
  return {
    tabelas: {
      inss: {
        id: Number(inss[0].id),
        faixas: faixasInss,
        teto_centavos: paraCentavos(inss[0].teto_contribuicao),
      },
      irrf: {
        id: Number(irrf[0].id),
        faixas: faixasIrrf,
        deducao_dependente_centavos: paraCentavos(irrf[0].deducao_por_dependente),
        desconto_simplificado_centavos: paraCentavos(irrf[0].desconto_simplificado),
      },
      parametros: {
        id: Number(parametros[0].id),
        aliquota_fgts: Number(parametros[0].aliquota_fgts),
        divisor_mensal_horas: Number(parametros[0].divisor_mensal_horas),
        carga_semanal_referencia_minutos: Number(
          parametros[0].carga_semanal_referencia_minutos
        ),
        divisor_mensal_dias: Number(parametros[0].divisor_mensal_dias),
      },
    },
    faltantes: [],
  };
}

export interface SituacaoConferencia {
  tipo: TipoTabelaLegal;
  versao_id: number | null;
  conferido_dp: boolean;
}

/**
 * Situação de conferência do DP das versões que valem NA DATA — gate da
 * aprovação. Tem que ser a MESMA data que `tabelasVigentes` usou para calcular:
 * conferir a tabela de 2027 não diz nada sobre a folha de 2026 que foi
 * calculada com a tabela de 2026.
 */
export async function situacaoConferenciaTabelas(
  dataRef: string,
  cliente?: PoolClient
): Promise<SituacaoConferencia[]> {
  const resultado: SituacaoConferencia[] = [];
  for (const tipo of Object.keys(TABELAS_LEGAIS) as TipoTabelaLegal[]) {
    const sql = `SELECT v.id, v.conferido_dp
                   FROM ${TABELAS_LEGAIS[tipo]} v
                  WHERE v.status <> 'rascunho' AND ${vigenteEm("v", "$1")}
                  ORDER BY v.inicio_vigencia DESC, v.id DESC
                  LIMIT 1`;
    const linhas = cliente
      ? (await cliente.query<{ id: string; conferido_dp: boolean }>(sql, [dataRef])).rows
      : await consultar<{ id: string; conferido_dp: boolean }>(sql, [dataRef]);
    resultado.push({
      tipo,
      versao_id: linhas.length > 0 ? Number(linhas[0].id) : null,
      conferido_dp: linhas.length > 0 ? linhas[0].conferido_dp : false,
    });
  }
  return resultado;
}

export async function buscarVersaoLegalAtivaParaAtualizar(
  cliente: PoolClient,
  tipo: TipoTabelaLegal
): Promise<{ id: number; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{ id: string; inicio_vigencia: string }>(
    `SELECT id, inicio_vigencia::text AS inicio_vigencia
       FROM ${TABELAS_LEGAIS[tipo]} WHERE status = 'ativa' FOR UPDATE`
  );
  if (rows.length === 0) return null;
  return { id: Number(rows[0].id), inicio_vigencia: rows[0].inicio_vigencia };
}

export async function buscarVersaoLegalParaAtualizar(
  cliente: PoolClient,
  tipo: TipoTabelaLegal,
  id: number
): Promise<{ id: number; status: string; conferido_dp: boolean } | null> {
  const { rows } = await cliente.query<{
    id: string;
    status: string;
    conferido_dp: boolean;
  }>(
    `SELECT id, status, conferido_dp FROM ${TABELAS_LEGAIS[tipo]}
      WHERE id = $1 FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

export async function encerrarVersaoLegal(
  cliente: PoolClient,
  tipo: TipoTabelaLegal,
  id: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE ${TABELAS_LEGAIS[tipo]}
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [id, inicioDaProxima]
  );
}

export async function marcarVersaoConferida(
  cliente: PoolClient,
  tipo: TipoTabelaLegal,
  id: number
): Promise<void> {
  await cliente.query(
    `UPDATE ${TABELAS_LEGAIS[tipo]} SET conferido_dp = TRUE WHERE id = $1`,
    [id]
  );
}

export async function inserirVersaoInss(
  cliente: PoolClient,
  dados: {
    faixas: FaixaInssJson[];
    teto_contribuicao: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.tabela_inss_versao
       (faixas, teto_contribuicao, status, inicio_vigencia)
     VALUES ($1, $2, 'ativa', $3)
     RETURNING id`,
    [
      JSON.stringify(dados.faixas),
      dados.teto_contribuicao.toFixed(2),
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

export async function inserirVersaoIrrf(
  cliente: PoolClient,
  dados: {
    faixas: FaixaIrrfJson[];
    deducao_por_dependente: number;
    desconto_simplificado: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.tabela_irrf_versao
       (faixas, deducao_por_dependente, desconto_simplificado, status, inicio_vigencia)
     VALUES ($1, $2, $3, 'ativa', $4)
     RETURNING id`,
    [
      JSON.stringify(dados.faixas),
      dados.deducao_por_dependente.toFixed(2),
      dados.desconto_simplificado.toFixed(2),
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

export async function inserirVersaoParametros(
  cliente: PoolClient,
  dados: {
    salario_minimo: number;
    aliquota_fgts: number;
    divisor_mensal_horas: number;
    carga_semanal_referencia_minutos: number;
    divisor_mensal_dias: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.parametro_folha_versao
       (salario_minimo, aliquota_fgts, divisor_mensal_horas,
        carga_semanal_referencia_minutos, divisor_mensal_dias,
        status, inicio_vigencia)
     VALUES ($1, $2, $3, $4, $5, 'ativa', $6)
     RETURNING id`,
    [
      dados.salario_minimo.toFixed(2),
      dados.aliquota_fgts,
      dados.divisor_mensal_horas.toFixed(2),
      dados.carga_semanal_referencia_minutos,
      dados.divisor_mensal_dias.toFixed(2),
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ resultado (folha por colaborador)

export async function apagarFolhasDaCompetencia(
  cliente: PoolClient,
  competenciaId: number
): Promise<number> {
  // item_calculo cai junto (ON DELETE CASCADE); trigger barra se estiver fechada.
  const resultado = await cliente.query(
    `DELETE FROM rh_folha.folha_colaborador WHERE competencia_id = $1`,
    [competenciaId]
  );
  return resultado.rowCount ?? 0;
}

export async function inserirFolhaColaborador(
  cliente: PoolClient,
  dados: {
    competencia_id: number;
    colaborador_id: number;
    salario_base_centavos: number;
    dependentes_irrf: number;
    total_proventos_centavos: number;
    total_descontos_centavos: number;
    liquido_centavos: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.folha_colaborador
       (competencia_id, colaborador_id, salario_base_congelado, dependentes_irrf,
        total_proventos, total_descontos, liquido)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      dados.competencia_id,
      dados.colaborador_id,
      centavosParaSql(dados.salario_base_centavos),
      dados.dependentes_irrf,
      centavosParaSql(dados.total_proventos_centavos),
      centavosParaSql(dados.total_descontos_centavos),
      centavosParaSql(dados.liquido_centavos),
    ]
  );
  return Number(rows[0].id);
}

export async function inserirItemCalculo(
  cliente: PoolClient,
  folhaColaboradorId: number,
  item: {
    rubrica_versao_id: number;
    referencia: number | null;
    base_centavos: number | null;
    valor_centavos: number;
    memoria: Record<string, unknown>;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh_folha.item_calculo
       (folha_colaborador_id, rubrica_versao_id, referencia, base, valor, memoria)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      folhaColaboradorId,
      item.rubrica_versao_id,
      item.referencia,
      item.base_centavos === null ? null : centavosParaSql(item.base_centavos),
      centavosParaSql(item.valor_centavos),
      JSON.stringify(item.memoria),
    ]
  );
}

// ------------------------------------------------------------------ recorte pelos três (folha)
//
// O filtro de registro/lotação/centro de custo da folha acontece NO SQL, e a
// coluna comparada é a da APROPRIAÇÃO DA COMPETÊNCIA
// (rh_folha.apropriacao_competencia), não a alocação de hoje: quem estava no
// CSC em junho continua no CSC de junho depois de ser transferido em julho.
// Comparar com a lotação vigente reescreveria o passado a cada mudança de
// cadastro — e um filtro que reescreve o passado é pior que nenhum filtro.
//
// Filtrar no cliente também não serve: numa folha de 700 pessoas o servidor
// mandaria as 700 linhas (com salário, item a item) para o navegador esconder
// 690. O recorte tem que sair pequeno do banco.
//
// Combinável: o que vier preenchido entra junto, em E. Linha sem apropriação
// resolvida (ap.* nulo) fica DE FORA de qualquer recorte — comparar NULL não
// dá verdadeiro, e é o certo: não se pode afirmar que ela cai no centro pedido.

function comparacoesApropriacao(
  filtro: FiltroEstrutura,
  parametros: unknown[],
  alias: string
): string[] {
  const comparacoes: string[] = [];
  if (filtro.empresa_id !== undefined) {
    parametros.push(filtro.empresa_id);
    comparacoes.push(`${alias}.empresa_id = $${parametros.length}`);
  }
  if (filtro.estabelecimento_id !== undefined) {
    parametros.push(filtro.estabelecimento_id);
    comparacoes.push(`${alias}.estabelecimento_id = $${parametros.length}`);
  }
  if (filtro.centro_custo_id !== undefined) {
    parametros.push(filtro.centro_custo_id);
    comparacoes.push(`${alias}.centro_custo_id = $${parametros.length}`);
  }
  return comparacoes;
}

/** Pedaço de WHERE (já começando por AND) para quem já tem a view no FROM. */
function condicaoApropriacao(
  filtro: FiltroEstrutura,
  parametros: unknown[],
  alias: string
): string {
  const comparacoes = comparacoesApropriacao(filtro, parametros, alias);
  return comparacoes.length === 0 ? "" : ` AND ${comparacoes.join(" AND ")}`;
}

/** O mesmo recorte para quem só tem a folha do colaborador no FROM. */
function existeApropriacao(
  filtro: FiltroEstrutura,
  parametros: unknown[],
  aliasFolha: string
): string {
  const comparacoes = comparacoesApropriacao(filtro, parametros, "apr");
  if (comparacoes.length === 0) return "";
  return ` AND EXISTS (
        SELECT 1 FROM rh_folha.apropriacao_competencia apr
         WHERE apr.folha_colaborador_id = ${aliasFolha}.id
           AND ${comparacoes.join(" AND ")}
      )`;
}

export interface FolhaResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  salario_base_centavos: number;
  dependentes_irrf: number;
  total_proventos_centavos: number;
  total_descontos_centavos: number;
  liquido_centavos: number;
  calculada_em: string;
  // Apropriação da linha pelos TRÊS campos, resolvida NA DATA DA COMPETÊNCIA
  // (rh_folha.apropriacao_competencia, migration 0047) e não na alocação de
  // hoje: trocar o centro de custo de alguém agora não pode reescrever para
  // onde o custo de fevereiro caiu.
  empresa_id: number | null;
  empresa_nome: string | null;
  estabelecimento_id: number | null;
  lotacao_nome: string | null;
  centro_custo_id: number | null;
  centro_custo_codigo: string | null;
  centro_custo_nome: string | null;
}

export async function listarFolhasDaCompetencia(
  competenciaId: number,
  filtro: FiltroEstrutura = {}
): Promise<FolhaResumo[]> {
  const parametros: unknown[] = [competenciaId];
  const recorte = condicaoApropriacao(filtro, parametros, "ap");
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    salario_base_congelado: string;
    dependentes_irrf: number;
    total_proventos: string;
    total_descontos: string;
    liquido: string;
    calculada_em: string;
    empresa_id: string | null;
    empresa_nome: string | null;
    estabelecimento_id: string | null;
    lotacao_nome: string | null;
    centro_custo_id: string | null;
    centro_custo_codigo: string | null;
    centro_custo_nome: string | null;
  }>(
    `SELECT f.id, f.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, f.salario_base_congelado::text AS salario_base_congelado,
            f.dependentes_irrf, f.total_proventos::text AS total_proventos,
            f.total_descontos::text AS total_descontos, f.liquido::text AS liquido,
            f.calculada_em::text AS calculada_em,
            ap.empresa_id, ap.empresa_nome,
            ap.estabelecimento_id, ap.lotacao_nome,
            ap.centro_custo_id, ap.centro_custo_codigo, ap.centro_custo_nome
       FROM rh_folha.folha_colaborador f
       JOIN rh.colaborador c ON c.id = f.colaborador_id
       LEFT JOIN rh_folha.apropriacao_competencia ap
              ON ap.folha_colaborador_id = f.id
      WHERE f.competencia_id = $1${recorte}
      ORDER BY c.nome_completo, f.id`,
    parametros
  );
  const numeroOuNulo = (valor: string | null) =>
    valor === null ? null : Number(valor);
  return linhas.map((linha) => ({
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    salario_base_centavos: paraCentavos(linha.salario_base_congelado),
    dependentes_irrf: Number(linha.dependentes_irrf),
    total_proventos_centavos: paraCentavos(linha.total_proventos),
    total_descontos_centavos: paraCentavos(linha.total_descontos),
    liquido_centavos: paraCentavos(linha.liquido),
    calculada_em: linha.calculada_em,
    empresa_id: numeroOuNulo(linha.empresa_id),
    empresa_nome: linha.empresa_nome,
    estabelecimento_id: numeroOuNulo(linha.estabelecimento_id),
    lotacao_nome: linha.lotacao_nome,
    centro_custo_id: numeroOuNulo(linha.centro_custo_id),
    centro_custo_codigo: linha.centro_custo_codigo,
    centro_custo_nome: linha.centro_custo_nome,
  }));
}

// ------------------------------------------------------------------ conferência: as outras duas visões

export interface TotalPorRubrica {
  rubrica_id: number;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  /** Quantas pessoas têm essa rubrica no recorte. */
  pessoas: number;
  total_centavos: number;
}

/**
 * A folha SOMADA por rubrica (o corte do contador): quanto de salário, de INSS,
 * de VT no total da competência. Mesma tabela de itens da visão por pessoa,
 * agregada; sob o MESMO recorte, para o total bater com a lista filtrada.
 */
export async function totaisPorRubrica(
  competenciaId: number,
  filtro: FiltroEstrutura = {}
): Promise<TotalPorRubrica[]> {
  const parametros: unknown[] = [competenciaId];
  const recorte = existeApropriacao(filtro, parametros, "f");
  const linhas = await consultar<{
    rubrica_id: string;
    codigo: string;
    nome: string;
    natureza: NaturezaRubrica;
    pessoas: number;
    total: string;
  }>(
    `SELECT r.id AS rubrica_id, r.codigo, r.nome, r.natureza,
            count(DISTINCT i.folha_colaborador_id)::int AS pessoas,
            sum(i.valor)::text AS total
       FROM rh_folha.item_calculo i
       JOIN rh_folha.folha_colaborador f ON f.id = i.folha_colaborador_id
       JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
       JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
      WHERE f.competencia_id = $1${recorte}
      GROUP BY r.id, r.codigo, r.nome, r.natureza
      ORDER BY r.natureza, r.codigo`,
    parametros
  );
  return linhas.map((linha) => ({
    rubrica_id: Number(linha.rubrica_id),
    codigo: linha.codigo,
    nome: linha.nome,
    natureza: linha.natureza,
    pessoas: Number(linha.pessoas),
    total_centavos: paraCentavos(linha.total),
  }));
}

export interface TotalPorCentroCusto {
  empresa_id: number | null;
  centro_custo_id: number | null;
  centro_custo_codigo: string | null;
  centro_custo_nome: string | null;
  empresa_nome: string | null;
  pessoas: number;
  proventos_centavos: number;
  descontos_centavos: number;
  liquido_centavos: number;
}

/**
 * A folha SOMADA por centro de custo (o rateio contábil): quanto cada CC carrega
 * de proventos, descontos e líquido. Apropriação CONGELADA na data da competência
 * (0047) — trocar o CC de alguém hoje não move o custo do mês passado. Linhas sem
 * apropriação caem num balde de CC nulo (visível, não some). Mesmo recorte.
 */
export async function totaisPorCentroCusto(
  competenciaId: number,
  filtro: FiltroEstrutura = {}
): Promise<TotalPorCentroCusto[]> {
  const parametros: unknown[] = [competenciaId];
  const recorte = condicaoApropriacao(filtro, parametros, "ap");
  const linhas = await consultar<{
    empresa_id: string | null;
    centro_custo_id: string | null;
    centro_custo_codigo: string | null;
    centro_custo_nome: string | null;
    empresa_nome: string | null;
    pessoas: number;
    proventos: string;
    descontos: string;
    liquido: string;
  }>(
    // Agrupa pela IDENTIDADE (empresa_id, centro_custo_id) — eixo 2, nunca por
    // nome. O mesmo centro pode receber custo de empresas distintas (rateio
    // intercompany): cada par (empresa, centro) vira uma linha. Código e nome
    // são rótulos do grupo (max sobre um valor estável por id).
    `SELECT ap.empresa_id, ap.centro_custo_id,
            max(ap.centro_custo_codigo) AS centro_custo_codigo,
            max(ap.centro_custo_nome)   AS centro_custo_nome,
            max(ap.empresa_nome)        AS empresa_nome,
            count(*)::int AS pessoas,
            sum(f.total_proventos)::text AS proventos,
            sum(f.total_descontos)::text AS descontos,
            sum(f.liquido)::text AS liquido
       FROM rh_folha.folha_colaborador f
       LEFT JOIN rh_folha.apropriacao_competencia ap
              ON ap.folha_colaborador_id = f.id
      WHERE f.competencia_id = $1${recorte}
      GROUP BY ap.empresa_id, ap.centro_custo_id
      ORDER BY max(ap.empresa_nome) NULLS LAST, max(ap.centro_custo_codigo) NULLS LAST`,
    parametros
  );
  return linhas.map((linha) => ({
    empresa_id: linha.empresa_id === null ? null : Number(linha.empresa_id),
    centro_custo_id:
      linha.centro_custo_id === null ? null : Number(linha.centro_custo_id),
    centro_custo_codigo: linha.centro_custo_codigo,
    centro_custo_nome: linha.centro_custo_nome,
    empresa_nome: linha.empresa_nome,
    pessoas: Number(linha.pessoas),
    proventos_centavos: paraCentavos(linha.proventos),
    descontos_centavos: paraCentavos(linha.descontos),
    liquido_centavos: paraCentavos(linha.liquido),
  }));
}

/**
 * O que oferecer nos três seletores e quantas linhas a competência tem no
 * total. Sai SEMPRE da competência inteira, sem recorte: se as opções viessem
 * do resultado já filtrado, escolher um centro de custo apagaria os outros dos
 * seletores e não haveria como voltar. E sai das próprias folhas do mês, não do
 * catálogo inteiro — oferecer uma empresa que não tem nenhuma linha em junho só
 * produziria tela vazia.
 */
export async function resumoEstruturaDaCompetencia(
  competenciaId: number
): Promise<{ opcoes: OpcoesFiltroEstrutura; total_folhas: number }> {
  const linhas = await consultar<{
    empresa_id: string | null;
    empresa_nome: string | null;
    estabelecimento_id: string | null;
    lotacao_nome: string | null;
    centro_custo_id: string | null;
    centro_custo_codigo: string | null;
    centro_custo_nome: string | null;
    total_folhas: string;
  }>(
    `SELECT DISTINCT ap.empresa_id, ap.empresa_nome,
            ap.estabelecimento_id, ap.lotacao_nome,
            ap.centro_custo_id, ap.centro_custo_codigo, ap.centro_custo_nome,
            (SELECT count(*) FROM rh_folha.folha_colaborador ff
              WHERE ff.competencia_id = $1)::text AS total_folhas
       FROM rh_folha.folha_colaborador f
       LEFT JOIN rh_folha.apropriacao_competencia ap
              ON ap.folha_colaborador_id = f.id
      WHERE f.competencia_id = $1`,
    [competenciaId]
  );

  const empresas = new Map<number, string>();
  const lotacoes = new Map<number, string>();
  const centros = new Map<number, string>();
  for (const linha of linhas) {
    if (linha.empresa_id !== null) {
      const id = Number(linha.empresa_id);
      if (!empresas.has(id)) {
        empresas.set(id, linha.empresa_nome ?? `Empresa ${id}`);
      }
    }
    if (linha.estabelecimento_id !== null) {
      const id = Number(linha.estabelecimento_id);
      if (!lotacoes.has(id)) {
        lotacoes.set(id, linha.lotacao_nome ?? `Local ${id}`);
      }
    }
    if (linha.centro_custo_id !== null) {
      const id = Number(linha.centro_custo_id);
      if (!centros.has(id)) {
        const codigo = linha.centro_custo_codigo ?? `CC ${id}`;
        centros.set(
          id,
          linha.centro_custo_nome && linha.centro_custo_nome !== codigo
            ? `${codigo} — ${linha.centro_custo_nome}`
            : codigo
        );
      }
    }
  }
  const ordenar = (mapa: Map<number, string>) =>
    [...mapa.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    opcoes: {
      empresas: ordenar(empresas),
      lotacoes: ordenar(lotacoes),
      centros_custo: ordenar(centros),
    },
    total_folhas: Number(linhas[0]?.total_folhas ?? 0),
  };
}

export interface ItemFolha {
  id: number;
  folha_colaborador_id: number;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  referencia: number | null;
  base_centavos: number | null;
  valor_centavos: number;
  memoria: Record<string, unknown>;
}

export async function listarItensDaCompetencia(
  competenciaId: number,
  filtro: FiltroEstrutura = {}
): Promise<ItemFolha[]> {
  // O mesmo recorte da lista: sem isto o payload continuaria carregando os
  // itens (com valor e memória de cálculo) das linhas que o recorte excluiu.
  const parametros: unknown[] = [competenciaId];
  const recorte = existeApropriacao(filtro, parametros, "f");
  const linhas = await consultar<{
    id: string;
    folha_colaborador_id: string;
    codigo: string;
    nome: string;
    natureza: NaturezaRubrica;
    referencia: string | null;
    base: string | null;
    valor: string;
    memoria: Record<string, unknown>;
  }>(
    `SELECT i.id, i.folha_colaborador_id, r.codigo, r.nome, r.natureza,
            i.referencia::text AS referencia, i.base::text AS base,
            i.valor::text AS valor, i.memoria
       FROM rh_folha.item_calculo i
       JOIN rh_folha.folha_colaborador f ON f.id = i.folha_colaborador_id
       JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
       JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
      WHERE f.competencia_id = $1${recorte}
      ORDER BY i.folha_colaborador_id, r.codigo, i.id`,
    parametros
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    folha_colaborador_id: Number(linha.folha_colaborador_id),
    codigo: linha.codigo,
    nome: linha.nome,
    natureza: linha.natureza,
    referencia: numeroOuNulo(linha.referencia),
    base_centavos: linha.base === null ? null : paraCentavos(linha.base),
    valor_centavos: paraCentavos(linha.valor),
    memoria: linha.memoria,
  }));
}

// ------------------------------------------------------------------ casos de teste (suite)

export interface CasoTeste {
  id: number;
  nome: string;
  descricao: string;
  entrada: Record<string, unknown>;
  saida_esperada: Record<string, unknown>;
}

export async function listarCasosTesteAtivos(): Promise<CasoTeste[]> {
  const linhas = await consultar<{
    id: string;
    nome: string;
    descricao: string;
    entrada: Record<string, unknown>;
    saida_esperada: Record<string, unknown>;
  }>(
    `SELECT id, nome, descricao, entrada, saida_esperada
       FROM rh_folha.caso_teste_folha
      WHERE ativo
      ORDER BY id`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

// ------------------------------------------------------------------ prévia de férias (frente 1.6)

/**
 * A programação de férias como o MOTOR DE FÉRIAS a lê: dias de gozo, abono e a
 * data de início (que resolve as vigências da prévia). Leitura NOVA aqui — e
 * não em ferias/repositorio.ts — porque a frente da folha é dona só dos seus
 * arquivos nesta onda; os dados são os mesmos de rh.programacao_ferias.
 */
export interface ProgramacaoParaPrevia {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  periodo_aquisitivo_id: number;
  periodo_inicio: string;
  periodo_fim: string;
  inicio_gozo: string;
  fim_gozo: string;
  dias_gozo: number;
  dias_abono: number;
  status: string;
}

export async function buscarProgramacaoParaPrevia(
  id: number
): Promise<ProgramacaoParaPrevia | null> {
  const linhas = await consultar<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    periodo_aquisitivo_id: string;
    periodo_inicio: string;
    periodo_fim: string;
    inicio_gozo: string;
    fim_gozo: string;
    dias_gozo: number;
    dias_abono: number;
    status: string;
  }>(
    `SELECT pr.id, pr.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, pr.periodo_aquisitivo_id,
            p.inicio::text AS periodo_inicio, p.fim::text AS periodo_fim,
            pr.inicio::text AS inicio_gozo,
            (pr.inicio + pr.dias - 1)::text AS fim_gozo,
            pr.dias AS dias_gozo, pr.abono_dias AS dias_abono, pr.status
       FROM rh.programacao_ferias pr
       JOIN rh.colaborador c ON c.id = pr.colaborador_id
       JOIN rh.periodo_aquisitivo p ON p.id = pr.periodo_aquisitivo_id
      WHERE pr.id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    periodo_aquisitivo_id: Number(linha.periodo_aquisitivo_id),
    dias_gozo: Number(linha.dias_gozo),
    dias_abono: Number(linha.dias_abono),
  };
}

export interface ColaboradorParaFerias {
  salario_centavos: number;
  dependentes_irrf: number;
}

/**
 * Salário e dependentes COMO ESTAVAM na data de referência da prévia — a mesma
 * mecânica de `listarColaboradoresParaCalculo` (LATERAL com LIMIT 1 pela
 * vigência mais recente; dependente conta por NASCIMENTO e só o ELEGÍVEL,
 * deduz_irrf = true), para UMA pessoa. Null quando não há posição com salário
 * vigente na data — a prévia não tem o que pagar e o serviço explica isso em
 * vez de chutar o salário de hoje.
 */
export async function buscarColaboradorParaFerias(
  colaboradorId: number,
  dataRef: string
): Promise<ColaboradorParaFerias | null> {
  const linhas = await consultar<{ salario: string; dependentes: string }>(
    `SELECT p.salario::text AS salario,
            -- Só dependente ELEGÍVEL abate no IRRF (pendência #9, migration
            -- 0061) — a MESMA regra do motor mensal em
            -- listarColaboradoresParaCalculo: a prévia não pode deduzir o que
            -- a folha vai recusar. Elegibilidade (deduz_irrf) e vigência
            -- (nascimento) são ORTOGONAIS; aqui somam.
            (SELECT COUNT(*) FROM rh.dependente d
              WHERE d.colaborador_id = c.id
                AND d.deduz_irrf = true
                AND (d.nascimento IS NULL OR d.nascimento <= $2)) AS dependentes
       FROM rh.colaborador c
       JOIN LATERAL (
              SELECT p.salario
                FROM rh.posicao_colaborador p
               WHERE p.colaborador_id = c.id AND ${vigenteEm("p", "$2")}
               ORDER BY p.inicio_vigencia DESC, p.id DESC
               LIMIT 1) p ON TRUE
      WHERE c.id = $1`,
    [colaboradorId, dataRef]
  );
  if (linhas.length === 0) return null;
  return {
    salario_centavos: paraCentavos(linhas[0].salario),
    dependentes_irrf: Number(linhas[0].dependentes),
  };
}

// ------------------------------------------------------------------ prévia de 13º (onda 2)

export interface ColaboradorParaDecimo {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  data_admissao: string;
  data_desligamento: string | null;
  /** Null quando não há posição com salário vigente na data de referência. */
  salario_centavos: number | null;
  dependentes_irrf: number;
}

/**
 * O colaborador como o MOTOR DE 13º (calculo-13.ts) o lê: admissão (que dá os
 * avos), desligamento (que o serviço usa para RECUSAR — 13º de quem desliga é
 * do motor de rescisão) e salário + dependentes COMO ESTAVAM na data da
 * PARCELA — a mesma mecânica de `buscarColaboradorParaFerias` (LATERAL com
 * LIMIT 1 pela vigência mais recente; dependente conta por NASCIMENTO e só o
 * ELEGÍVEL, deduz_irrf = true, pendência #9 / migration 0061).
 *
 * O LATERAL é LEFT de propósito: colaborador sem posição vigente na data volta
 * com salário NULL — o serviço distingue "não existe" (404) de "existe mas não
 * tem remuneração de referência" (409 explicável), em vez de chutar o salário
 * de hoje.
 */
export async function buscarColaboradorParaDecimo(
  colaboradorId: number,
  dataRef: string
): Promise<ColaboradorParaDecimo | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
    data_admissao: string;
    data_desligamento: string | null;
    salario: string | null;
    dependentes: string;
  }>(
    `SELECT c.id, c.nome_completo, c.matricula,
            c.data_admissao::text AS data_admissao,
            c.data_desligamento::text AS data_desligamento,
            p.salario::text AS salario,
            (SELECT COUNT(*) FROM rh.dependente d
              WHERE d.colaborador_id = c.id
                AND d.deduz_irrf = true
                AND (d.nascimento IS NULL OR d.nascimento <= $2)) AS dependentes
       FROM rh.colaborador c
       LEFT JOIN LATERAL (
              SELECT p.salario
                FROM rh.posicao_colaborador p
               WHERE p.colaborador_id = c.id AND ${vigenteEm("p", "$2")}
               ORDER BY p.inicio_vigencia DESC, p.id DESC
               LIMIT 1) p ON TRUE
      WHERE c.id = $1`,
    [colaboradorId, dataRef]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    colaborador_id: Number(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
    data_admissao: linha.data_admissao,
    data_desligamento: linha.data_desligamento,
    salario_centavos: linha.salario === null ? null : paraCentavos(linha.salario),
    dependentes_irrf: Number(linha.dependentes),
  };
}

// ------------------------------------------------------------------ prévia de rescisão (onda 3)

export interface DesligamentoParaRescisao {
  processo_id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data_admissao: string;
  /** Valor real de rh.tipo_desligamento_versao.tipo, congelado no processo. */
  tipo: string;
  tipo_nome: string;
  iniciativa: string;
  modalidade_aviso: string;
  estado: string;
  data_comunicacao: string;
  data_projetada_termino: string;
  data_termino_efetiva: string | null;
}

/**
 * O processo de desligamento como o MOTOR DE RESCISÃO (calculo-rescisao.ts) o
 * lê: tipo congelado na abertura (é ele que decide QUAIS verbas entram),
 * iniciativa e modalidade do aviso, as três datas e a admissão do colaborador.
 * LEITURA APENAS do domínio desligamento — nenhum campo restrito (motivo,
 * entrevista) sai por aqui; quem lê motivo é o próprio módulo, com a chave dele.
 */
export async function buscarDesligamentoParaRescisao(
  processoId: number
): Promise<DesligamentoParaRescisao | null> {
  const linhas = await consultar<{
    processo_id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    data_admissao: string;
    tipo: string;
    tipo_nome: string;
    iniciativa: string;
    modalidade_aviso: string;
    estado: string;
    data_comunicacao: string;
    data_projetada_termino: string;
    data_termino_efetiva: string | null;
  }>(
    `SELECT p.id AS processo_id, p.colaborador_id,
            c.nome_completo AS colaborador_nome, c.matricula,
            c.data_admissao::text AS data_admissao,
            t.tipo, t.nome AS tipo_nome,
            p.iniciativa, p.modalidade_aviso, p.estado,
            p.data_comunicacao::text AS data_comunicacao,
            p.data_projetada_termino::text AS data_projetada_termino,
            p.data_termino_efetiva::text AS data_termino_efetiva
       FROM rh.processo_desligamento p
       JOIN rh.colaborador c ON c.id = p.colaborador_id
       JOIN rh.tipo_desligamento_versao t ON t.id = p.tipo_desligamento_versao_id
      WHERE p.id = $1`,
    [processoId]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...linha,
    processo_id: Number(linha.processo_id),
    colaborador_id: Number(linha.colaborador_id),
  };
}

export interface PeriodoAquisitivoParaRescisao {
  id: number;
  inicio: string;
  fim: string;
  /** Dias ainda não gozados (NUMERIC(4,1) — meio dia existe). */
  saldo_dias: number;
  status: string;
  limite_concessivo: string;
}

/**
 * TODOS os períodos aquisitivos do colaborador, do mais antigo ao mais novo —
 * quem separa VENCIDOS (fim <= término, saldo > 0 → indenizados na rescisão)
 * do período EM CURSO (dá os avos das proporcionais) é o serviço, que conhece
 * a data do término. saldo_dias já desconta o gozado/abonado (o módulo de
 * férias mantém a linha); status não filtra aqui de propósito: até um período
 * 'vencido' (passou do concessivo) continua sendo dívida na rescisão.
 */
export async function listarPeriodosAquisitivosParaRescisao(
  colaboradorId: number
): Promise<PeriodoAquisitivoParaRescisao[]> {
  const linhas = await consultar<{
    id: string;
    inicio: string;
    fim: string;
    saldo_dias: string;
    status: string;
    limite_concessivo: string;
  }>(
    `SELECT p.id, p.inicio::text AS inicio, p.fim::text AS fim,
            p.saldo_dias::text AS saldo_dias, p.status,
            p.limite_concessivo::text AS limite_concessivo
       FROM rh.periodo_aquisitivo p
      WHERE p.colaborador_id = $1
      ORDER BY p.inicio, p.id`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    saldo_dias: Number(linha.saldo_dias),
  }));
}

// ------------------------------------------------------------------ indicador

/**
 * % de competências mensais dos últimos 12 meses fechadas até o 5º DIA ÚTIL do
 * mês seguinte (art. 459 §1º da CLT; sábado conta, domingo e feriado nacional
 * não — regra em rh.enesimo_dia_util_folha, que lê o calendário administrável
 * rh.feriado). Denominador: competências cujo prazo já venceu OU que já
 * fecharam; null se não houver nenhuma.
 */
export async function indicadorFolhaNoPrazo(): Promise<{
  no_prazo: number;
  total: number;
} | null> {
  const linhas = await consultar<{ no_prazo: string; total: string }>(
    `WITH base AS (
       SELECT c.estado,
              rh.enesimo_dia_util_folha(
                (make_date(c.ano, c.mes, 1) + INTERVAL '1 month')::date, 5) AS prazo,
              (c.fechada_em AT TIME ZONE 'America/Sao_Paulo')::date AS fechada_dia,
              (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
         FROM rh_folha.competencia_folha c
        WHERE c.tipo = 'mensal'
          AND make_date(c.ano, c.mes, 1) >=
              (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
               - INTERVAL '12 months')::date
          AND make_date(c.ano, c.mes, 1) <=
              date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
     )
     SELECT COUNT(*) FILTER (
              WHERE estado = 'fechada' AND fechada_dia <= prazo) AS no_prazo,
            COUNT(*) FILTER (
              WHERE prazo < hoje OR estado = 'fechada') AS total
       FROM base`
  );
  const total = Number(linhas[0]?.total ?? 0);
  if (total === 0) return null;
  return { no_prazo: Number(linhas[0].no_prazo), total };
}

// ------------------------------------------------------------------ OLAC (migração 0099)

/**
 * As linhas da EXPORTAÇÃO: uma por colaborador × rubrica, dos itens calculados
 * da competência. A empresa vem da apropriação DA COMPETÊNCIA (0047) — a mesma
 * régua das três visões da conferência —, e a conta contábil do de-para
 * VIGENTE NA DATA DE REFERÊNCIA da competência (E3:a), nunca do de-para de
 * hoje: reexportar a mesma competência depois de mudar o de-para atual não
 * pode reescrever o arquivo de um mês antigo.
 */
export interface LinhaExportacaoOlac {
  empresa_cnpj: string | null;
  matricula: string;
  colaborador_nome: string;
  codigo_rubrica: string;
  rubrica_nome: string;
  natureza: NaturezaRubrica;
  conta_contabil: string | null;
  valor_centavos: number;
}

export async function listarLinhasParaExportarOlac(
  competenciaId: number,
  dataRef: string
): Promise<LinhaExportacaoOlac[]> {
  const linhas = await consultar<{
    empresa_cnpj: string | null;
    matricula: string;
    colaborador_nome: string;
    codigo: string;
    rubrica_nome: string;
    natureza: NaturezaRubrica;
    conta_contabil: string | null;
    valor: string;
  }>(
    // Agrega por colaborador × rubrica: o motor grava um item por rubrica, mas
    // "uma linha por colaborador×rubrica" é promessa do LAYOUT, não do motor —
    // a soma segura a promessa mesmo se o motor um dia gravar dois itens.
    `SELECT ap.empresa_cnpj, c.matricula, c.nome_completo AS colaborador_nome,
            r.codigo, r.nome AS rubrica_nome, r.natureza,
            cc.conta_contabil, sum(i.valor)::text AS valor
       FROM rh_folha.item_calculo i
       JOIN rh_folha.folha_colaborador f ON f.id = i.folha_colaborador_id
       JOIN rh.colaborador c ON c.id = f.colaborador_id
       JOIN rh_folha.rubrica_versao rv ON rv.id = i.rubrica_versao_id
       JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
       LEFT JOIN rh_folha.apropriacao_competencia ap
              ON ap.folha_colaborador_id = f.id
       LEFT JOIN LATERAL (
              SELECT v.conta_contabil
                FROM rh_folha.conta_contabil_rubrica v
               WHERE v.rubrica_id = r.id AND ${vigenteEm("v", "$2")}
               ORDER BY v.inicio_vigencia DESC, v.id DESC
               LIMIT 1) cc ON TRUE
      WHERE f.competencia_id = $1
      GROUP BY ap.empresa_cnpj, c.matricula, c.nome_completo,
               r.codigo, r.nome, r.natureza, cc.conta_contabil
      ORDER BY c.matricula, r.codigo`,
    [competenciaId, dataRef]
  );
  return linhas.map((linha) => ({
    empresa_cnpj: linha.empresa_cnpj,
    matricula: linha.matricula,
    colaborador_nome: linha.colaborador_nome,
    codigo_rubrica: linha.codigo,
    rubrica_nome: linha.rubrica_nome,
    natureza: linha.natureza,
    conta_contabil: linha.conta_contabil,
    valor_centavos: paraCentavos(linha.valor),
  }));
}

/** matrícula → colaborador_id, para o casamento da volta (matrícula é UNIQUE). */
export async function mapaColaboradorPorMatricula(
  cliente: PoolClient
): Promise<Map<string, number>> {
  const { rows } = await cliente.query<{ id: string; matricula: string }>(
    `SELECT id, matricula FROM rh.colaborador`
  );
  return new Map(rows.map((linha) => [linha.matricula, Number(linha.id)]));
}

/** empresa: cnpj → id, para casar a coluna empresa_cnpj do arquivo. */
export async function mapaEmpresaPorCnpj(
  cliente: PoolClient
): Promise<Map<string, number>> {
  const { rows } = await cliente.query<{ id: string; cnpj: string }>(
    `SELECT id, cnpj FROM rh.empresa_grupo WHERE cnpj IS NOT NULL`
  );
  return new Map(rows.map((linha) => [linha.cnpj, Number(linha.id)]));
}

export async function inserirLoteOlac(
  cliente: PoolClient,
  dados: {
    direcao: "exportacao" | "importacao";
    arquivo: string;
    competencia_ano: number;
    competencia_mes: number;
    empresa_id: number | null;
    linhas_lidas: number;
    linhas_aceitas: number;
    linhas_rejeitadas: number;
    relatorio: Record<string, unknown>;
    gerado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.lote_olac
       (direcao, arquivo, competencia_ano, competencia_mes, empresa_id,
        linhas_lidas, linhas_aceitas, linhas_rejeitadas, relatorio, gerado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      dados.direcao,
      dados.arquivo,
      dados.competencia_ano,
      dados.competencia_mes,
      dados.empresa_id,
      dados.linhas_lidas,
      dados.linhas_aceitas,
      dados.linhas_rejeitadas,
      JSON.stringify(dados.relatorio),
      dados.gerado_por,
    ]
  );
  return Number(rows[0].id);
}

export async function inserirEspelhoOlac(
  cliente: PoolClient,
  dados: {
    lote_id: number;
    competencia_ano: number;
    competencia_mes: number;
    empresa_id: number | null;
    empresa_cnpj: string | null;
    matricula: string;
    colaborador_id: number | null;
    codigo_rubrica_externo: string;
    codigo_rubrica_interno: string | null;
    conta_contabil: string | null;
    valor_centavos: number;
    situacao: string;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh_folha.espelho_olac
       (lote_id, competencia_ano, competencia_mes, empresa_id, empresa_cnpj,
        matricula, colaborador_id, codigo_rubrica_externo,
        codigo_rubrica_interno, conta_contabil, valor_centavos, situacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      dados.lote_id,
      dados.competencia_ano,
      dados.competencia_mes,
      dados.empresa_id,
      dados.empresa_cnpj,
      dados.matricula,
      dados.colaborador_id,
      dados.codigo_rubrica_externo,
      dados.codigo_rubrica_interno,
      dados.conta_contabil,
      dados.valor_centavos,
      dados.situacao,
    ]
  );
}

/**
 * SUBSTITUIÇÃO na reimportação (E1:a, padrão dos lotes por origem): apaga o
 * espelho anterior da MESMA competência+empresa vindo de IMPORTAÇÃO, antes de
 * gravar o novo. `empresa_id` null casa com null (IS NOT DISTINCT FROM) — o
 * balde sem apropriação também é substituível. Lotes de exportação nunca
 * gravam espelho, então a direção do filtro é cinto e suspensório.
 */
export async function apagarEspelhoOlacAnterior(
  cliente: PoolClient,
  competenciaAno: number,
  competenciaMes: number,
  empresaId: number | null
): Promise<number> {
  const { rowCount } = await cliente.query(
    `DELETE FROM rh_folha.espelho_olac e
      USING rh_folha.lote_olac l
      WHERE l.id = e.lote_id
        AND l.direcao = 'importacao'
        AND e.competencia_ano = $1
        AND e.competencia_mes = $2
        AND e.empresa_id IS NOT DISTINCT FROM $3`,
    [competenciaAno, competenciaMes, empresaId]
  );
  return rowCount ?? 0;
}

export interface TotalEspelhoOlac {
  situacao: string;
  empresa_id: number | null;
  empresa_nome: string | null;
  linhas: number;
  valor_centavos: number;
}

/** O quadro do espelho: totais por situação × empresa (a tela soma o resto). */
export async function totaisEspelhoOlac(
  ano: number,
  mes: number
): Promise<TotalEspelhoOlac[]> {
  const linhas = await consultar<{
    situacao: string;
    empresa_id: string | null;
    empresa_nome: string | null;
    linhas: string;
    valor: string;
  }>(
    `SELECT e.situacao, e.empresa_id, max(v.nome_fantasia) AS empresa_nome,
            count(*)::text AS linhas, sum(e.valor_centavos)::text AS valor
       FROM rh_folha.espelho_olac e
       LEFT JOIN LATERAL (
              SELECT ev.nome_fantasia
                FROM rh.empresa_grupo_versao ev
               WHERE ev.empresa_id = e.empresa_id AND ev.status = 'ativa'
               ORDER BY ev.inicio_vigencia DESC, ev.id DESC
               LIMIT 1) v ON TRUE
      WHERE e.competencia_ano = $1 AND e.competencia_mes = $2
      GROUP BY e.situacao, e.empresa_id
      ORDER BY e.empresa_id NULLS LAST, e.situacao`,
    [ano, mes]
  );
  return linhas.map((linha) => ({
    situacao: linha.situacao,
    empresa_id: linha.empresa_id === null ? null : Number(linha.empresa_id),
    empresa_nome: linha.empresa_nome,
    linhas: Number(linha.linhas),
    valor_centavos: Number(linha.valor),
  }));
}

export interface EspelhoNaoCasado {
  id: number;
  empresa_cnpj: string | null;
  matricula: string;
  codigo_rubrica_externo: string;
  valor_centavos: number;
  situacao: string;
}

/** O NÃO-casado em destaque: o que a conciliação não conseguiu resolver. */
export async function listarEspelhoNaoCasado(
  ano: number,
  mes: number
): Promise<EspelhoNaoCasado[]> {
  const linhas = await consultar<{
    id: string;
    empresa_cnpj: string | null;
    matricula: string;
    codigo_rubrica_externo: string;
    valor_centavos: string;
    situacao: string;
  }>(
    `SELECT id, empresa_cnpj, matricula, codigo_rubrica_externo,
            valor_centavos::text AS valor_centavos, situacao
       FROM rh_folha.espelho_olac
      WHERE competencia_ano = $1 AND competencia_mes = $2
        AND situacao <> 'casada'
      ORDER BY situacao, matricula, codigo_rubrica_externo`,
    [ano, mes]
  );
  return linhas.map((linha) => ({
    id: Number(linha.id),
    empresa_cnpj: linha.empresa_cnpj,
    matricula: linha.matricula,
    codigo_rubrica_externo: linha.codigo_rubrica_externo,
    valor_centavos: Number(linha.valor_centavos),
    situacao: linha.situacao,
  }));
}

export interface LoteOlacResumo {
  id: number;
  direcao: string;
  arquivo: string;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  gerado_em: string;
}

/** Último lote de cada direção — o "quando foi a última troca" da tela. */
export async function ultimosLotesOlac(
  ano: number,
  mes: number
): Promise<LoteOlacResumo[]> {
  const linhas = await consultar<{
    id: string;
    direcao: string;
    arquivo: string;
    linhas_lidas: number;
    linhas_aceitas: number;
    linhas_rejeitadas: number;
    gerado_em: string;
  }>(
    `SELECT DISTINCT ON (direcao)
            id, direcao, arquivo, linhas_lidas, linhas_aceitas,
            linhas_rejeitadas, gerado_em::text AS gerado_em
       FROM rh_folha.lote_olac
      WHERE competencia_ano = $1 AND competencia_mes = $2
      ORDER BY direcao, gerado_em DESC, id DESC`,
    [ano, mes]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    linhas_lidas: Number(linha.linhas_lidas),
    linhas_aceitas: Number(linha.linhas_aceitas),
    linhas_rejeitadas: Number(linha.linhas_rejeitadas),
  }));
}

// ------------------------------------------------------------------ de-para conta contábil (E3:a)

export interface ContaContabilRubrica {
  id: number;
  rubrica_id: number;
  codigo: string;
  rubrica_nome: string;
  conta_contabil: string;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarCatalogoContaContabil(): Promise<
  ContaContabilRubrica[]
> {
  const linhas = await consultar<{
    id: string;
    rubrica_id: string;
    codigo: string;
    rubrica_nome: string;
    conta_contabil: string;
    status: string;
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT v.id, v.rubrica_id, r.codigo, r.nome AS rubrica_nome,
            v.conta_contabil, v.status,
            v.inicio_vigencia::text AS inicio_vigencia,
            v.fim_vigencia::text AS fim_vigencia
       FROM rh_folha.conta_contabil_rubrica v
       JOIN rh_folha.rubrica r ON r.id = v.rubrica_id
      ORDER BY r.codigo, v.inicio_vigencia DESC, v.id DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    rubrica_id: Number(linha.rubrica_id),
  }));
}

export async function buscarContaContabilAtivaParaAtualizar(
  cliente: PoolClient,
  rubricaId: number
): Promise<{ id: number; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{
    id: string;
    inicio_vigencia: string;
  }>(
    `SELECT id, inicio_vigencia::text AS inicio_vigencia
       FROM rh_folha.conta_contabil_rubrica
      WHERE rubrica_id = $1 AND status = 'ativa'
      FOR UPDATE`,
    [rubricaId]
  );
  if (rows.length === 0) return null;
  return { id: Number(rows[0].id), inicio_vigencia: rows[0].inicio_vigencia };
}

export async function buscarContaContabilParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<{
  id: number;
  rubrica_id: number;
  codigo: string;
  rubrica_nome: string;
  conta_contabil: string;
  status: string;
  inicio_vigencia: string;
} | null> {
  const { rows } = await cliente.query<{
    id: string;
    rubrica_id: string;
    codigo: string;
    rubrica_nome: string;
    conta_contabil: string;
    status: string;
    inicio_vigencia: string;
  }>(
    `SELECT v.id, v.rubrica_id, r.codigo, r.nome AS rubrica_nome,
            v.conta_contabil, v.status,
            v.inicio_vigencia::text AS inicio_vigencia
       FROM rh_folha.conta_contabil_rubrica v
       JOIN rh_folha.rubrica r ON r.id = v.rubrica_id
      WHERE v.id = $1
      FOR UPDATE OF v`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    rubrica_id: Number(rows[0].rubrica_id),
  };
}

export async function inserirContaContabil(
  cliente: PoolClient,
  dados: {
    rubrica_id: number;
    conta_contabil: string;
    inicio_vigencia: string;
    criado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.conta_contabil_rubrica
       (rubrica_id, conta_contabil, status, inicio_vigencia, criado_por)
     VALUES ($1, $2, 'ativa', $3, $4)
     RETURNING id`,
    [dados.rubrica_id, dados.conta_contabil, dados.inicio_vigencia, dados.criado_por]
  );
  return Number(rows[0].id);
}

/** Encerra a vigência (status + fim) — o trigger congela a linha dali em diante. */
export async function encerrarContaContabilNoBanco(
  cliente: PoolClient,
  id: number,
  fimVigencia: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh_folha.conta_contabil_rubrica
        SET status = 'encerrada', fim_vigencia = $2
      WHERE id = $1`,
    [id, fimVigencia]
  );
}
