import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  MarcacaoBruta,
  TipoIntercorrencia,
  TipoJornada,
  TipoMarcacao,
} from "./calculo";
import {
  AbrangenciaFeriado,
  OrigemMarcacao,
  OrigemMovimentoBanco,
  StatusIntercorrencia,
  TipoFeriado,
  TratamentoRescisao,
} from "./esquemas";

// BORDA DE TIPOS: BIGINT vem do pg como string e NUMERIC também. Tudo vira
// number AQUI e só aqui — o serviço e o motor nunca veem string de número.
// Minuto é INTEGER no banco, então já chega como number.
//
// FUSO: o banco guarda TIMESTAMPTZ (UTC). O dia de apuração é o dia civil em
// America/Sao_Paulo — por isso todo agrupamento por data usa
// `AT TIME ZONE 'America/Sao_Paulo'` explícito, nunca o TimeZone da sessão.

const FUSO = "America/Sao_Paulo";

function paraNumero(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function numeroOuNulo(valor: string | number | null): number | null {
  return valor === null ? null : paraNumero(valor);
}

// ================================================================ jornada

export interface JornadaVersao {
  id: number;
  codigo: string;
  nome: string;
  tipo: TipoJornada;
  carga_diaria_minutos: number;
  carga_semanal_minutos: number;
  /** Índice 0 domingo … 6 sábado; NULL em jornada de escala (12x36). */
  previsto_por_dia_semana: number[] | null;
  ciclo_dias: number | null;
  intervalo_minimo_minutos: number;
  intervalo_obrigatorio_acima_minutos: number;
  tolerancia_entrada_minutos: number;
  tolerancia_saida_minutos: number;
  horario_entrada_minuto: number | null;
  horario_saida_minuto: number | null;
  dia_repouso_semana: number | null;
  dias_uteis_semana: number;
  adicional_noturno_inicio_minuto: number;
  adicional_noturno_fim_minuto: number;
  hora_noturna_segundos: number;
  janela_arraste_minutos: number;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  colaboradores_na_escala: number;
}

interface LinhaJornada extends Record<string, unknown> {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoJornada;
  carga_diaria_minutos: number;
  carga_semanal_minutos: number;
  previsto_por_dia_semana: number[] | null;
  ciclo_dias: number | null;
  intervalo_minimo_minutos: number;
  intervalo_obrigatorio_acima_minutos: number;
  tolerancia_entrada_minutos: number;
  tolerancia_saida_minutos: number;
  horario_entrada_minuto: number | null;
  horario_saida_minuto: number | null;
  dia_repouso_semana: number | null;
  dias_uteis_semana: number;
  noturno_inicio: string;
  noturno_fim: string;
  hora_noturna_segundos: number;
  janela_arraste_minutos: number;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  colaboradores_na_escala: string;
}

// As colunas de parâmetro da jornada (0027, 0033 e 0034) em um lugar só: a
// mesma lista serve o SELECT do catálogo e o da escala, e é o motor inteiro —
// se faltar coluna aqui, o motor volta a decidir por conta própria.
const COLUNAS_JORNADA = `
         j.id, j.codigo, j.nome, j.tipo,
         j.carga_diaria_minutos, j.carga_semanal_minutos,
         j.previsto_por_dia_semana, j.ciclo_dias,
         j.intervalo_minimo_minutos, j.intervalo_obrigatorio_acima_minutos,
         j.tolerancia_entrada_minutos, j.tolerancia_saida_minutos,
         j.horario_entrada_minuto, j.horario_saida_minuto,
         j.dia_repouso_semana, j.dias_uteis_semana,
         to_char(j.adicional_noturno_inicio, 'HH24:MI') AS noturno_inicio,
         to_char(j.adicional_noturno_fim, 'HH24:MI')    AS noturno_fim,
         j.hora_noturna_segundos, j.janela_arraste_minutos,
         j.status, j.inicio_vigencia::text AS inicio_vigencia,
         j.fim_vigencia::text AS fim_vigencia`;

// TIME → minutos do dia, feito no banco para não trafegar string de hora.
const SELECT_JORNADA = `
  SELECT ${COLUNAS_JORNADA},
         (SELECT COUNT(*) FROM rh.escala_colaborador e
           WHERE e.jornada_versao_id = j.id AND e.fim_vigencia IS NULL)
           AS colaboradores_na_escala
    FROM rh.jornada_versao j`;

function relogioParaMinutos(texto: string): number {
  const [hora, minuto] = texto.split(":").map(Number);
  return hora * 60 + minuto;
}

function paraJornada(linha: LinhaJornada): JornadaVersao {
  return {
    id: paraNumero(linha.id),
    codigo: linha.codigo,
    nome: linha.nome,
    tipo: linha.tipo,
    carga_diaria_minutos: linha.carga_diaria_minutos,
    carga_semanal_minutos: linha.carga_semanal_minutos,
    // SMALLINT[] do Postgres chega 1-based; o motor fala em 0 = domingo.
    previsto_por_dia_semana: linha.previsto_por_dia_semana
      ? linha.previsto_por_dia_semana.map(Number)
      : null,
    ciclo_dias: linha.ciclo_dias,
    intervalo_minimo_minutos: linha.intervalo_minimo_minutos,
    intervalo_obrigatorio_acima_minutos:
      linha.intervalo_obrigatorio_acima_minutos,
    tolerancia_entrada_minutos: linha.tolerancia_entrada_minutos,
    tolerancia_saida_minutos: linha.tolerancia_saida_minutos,
    horario_entrada_minuto: linha.horario_entrada_minuto,
    horario_saida_minuto: linha.horario_saida_minuto,
    dia_repouso_semana: linha.dia_repouso_semana,
    dias_uteis_semana: linha.dias_uteis_semana,
    adicional_noturno_inicio_minuto: relogioParaMinutos(linha.noturno_inicio),
    adicional_noturno_fim_minuto: relogioParaMinutos(linha.noturno_fim),
    hora_noturna_segundos: linha.hora_noturna_segundos,
    janela_arraste_minutos: linha.janela_arraste_minutos,
    status: linha.status,
    inicio_vigencia: linha.inicio_vigencia,
    fim_vigencia: linha.fim_vigencia,
    colaboradores_na_escala: paraNumero(linha.colaboradores_na_escala),
  };
}

export async function listarJornadas(): Promise<JornadaVersao[]> {
  const linhas = await consultar<LinhaJornada>(
    `${SELECT_JORNADA} ORDER BY j.codigo, j.inicio_vigencia DESC`
  );
  return linhas.map(paraJornada);
}

export async function buscarJornada(id: number): Promise<JornadaVersao | null> {
  const linhas = await consultar<LinhaJornada>(`${SELECT_JORNADA} WHERE j.id = $1`, [
    id,
  ]);
  return linhas[0] ? paraJornada(linhas[0]) : null;
}

export async function buscarJornadaAtivaPorCodigo(
  cliente: PoolClient,
  codigo: string
): Promise<{ id: number; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{ id: string; inicio_vigencia: string }>(
    `SELECT id, inicio_vigencia::text AS inicio_vigencia
       FROM rh.jornada_versao
      WHERE codigo = $1 AND status = 'ativa'
      FOR UPDATE`,
    [codigo]
  );
  return rows[0]
    ? { id: paraNumero(rows[0].id), inicio_vigencia: rows[0].inicio_vigencia }
    : null;
}

export async function encerrarJornada(
  cliente: PoolClient,
  id: number,
  fimVigencia: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.jornada_versao
        SET status = 'encerrada', fim_vigencia = $2::date
      WHERE id = $1`,
    [id, fimVigencia]
  );
}

export interface DadosJornada {
  codigo: string;
  nome: string;
  tipo: TipoJornada;
  carga_diaria_minutos: number;
  carga_semanal_minutos: number;
  intervalo_minimo_minutos: number;
  tolerancia_entrada_minutos: number;
  tolerancia_saida_minutos: number;
  adicional_noturno_inicio: string;
  adicional_noturno_fim: string;
  /** NULL = o trigger da 0033 deriva de carga diária + intervalo mínimo. */
  janela_arraste_minutos: number | null;
  // Estes dois aceitam NULL: quem não informa recebe a derivação do trigger da
  // 0034, que é CONSEQUÊNCIA do tipo e da carga (padrão semanal do 5x2 e do
  // 6x1, ciclo de 2 dias do 12x36).
  previsto_por_dia_semana: number[] | null;
  ciclo_dias: number | null;
  /** NULL DECLARADO: jornada sem repouso em dia fixo do calendário (12x36). */
  dia_repouso_semana: number | null;
  // Os três abaixo NÃO aceitam ausência: a 0043 tirou a derivação do trigger
  // justamente porque adivinhar hora noturna e divisor de DSR é decidir
  // dinheiro no lugar do DP. Sem eles o INSERT falha no NOT NULL da tabela, e
  // é assim que se quer — o tipo aqui só antecipa o erro para o compilador.
  dias_uteis_semana: number;
  intervalo_obrigatorio_acima_minutos: number;
  hora_noturna_segundos: number;
  horario_entrada_minuto: number | null;
  horario_saida_minuto: number | null;
  inicio_vigencia: string;
}

export async function inserirJornada(
  cliente: PoolClient,
  dados: DadosJornada
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.jornada_versao
       (codigo, nome, tipo, carga_diaria_minutos, carga_semanal_minutos,
        intervalo_minimo_minutos, tolerancia_entrada_minutos,
        tolerancia_saida_minutos, adicional_noturno_inicio,
        adicional_noturno_fim, janela_arraste_minutos,
        previsto_por_dia_semana, ciclo_dias, dia_repouso_semana,
        dias_uteis_semana, intervalo_obrigatorio_acima_minutos,
        hora_noturna_segundos, horario_entrada_minuto, horario_saida_minuto,
        status, inicio_vigencia)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::time,$10::time,$11,
             $12::smallint[],$13,$14,$15,$16,$17,$18,$19,'ativa',$20::date)
     RETURNING id`,
    [
      dados.codigo,
      dados.nome,
      dados.tipo,
      dados.carga_diaria_minutos,
      dados.carga_semanal_minutos,
      dados.intervalo_minimo_minutos,
      dados.tolerancia_entrada_minutos,
      dados.tolerancia_saida_minutos,
      dados.adicional_noturno_inicio,
      dados.adicional_noturno_fim,
      dados.janela_arraste_minutos,
      dados.previsto_por_dia_semana,
      dados.ciclo_dias,
      dados.dia_repouso_semana,
      dados.dias_uteis_semana,
      dados.intervalo_obrigatorio_acima_minutos,
      dados.hora_noturna_segundos,
      dados.horario_entrada_minuto,
      dados.horario_saida_minuto,
      dados.inicio_vigencia,
    ]
  );
  return paraNumero(rows[0].id);
}

// ================================================================ escala

export interface EscalaVigente {
  escala_id: number;
  colaborador_id: number;
  inicio_vigencia: string;
  /**
   * Primeiro dia de trabalho do ciclo (0034). Com `jornada.ciclo_dias` é o que
   * permite ao motor saber que dia era de plantão — sem ela, o dia sem batida
   * do plantonista não vira falta nem intercorrência.
   */
  ancora_escala: string | null;
  jornada: JornadaVersao;
}

interface LinhaEscala extends LinhaJornada {
  escala_id: string;
  colaborador_id: string;
  escala_inicio: string;
  ancora_escala: string | null;
}

const SELECT_ESCALA = `
  SELECT e.id AS escala_id, e.colaborador_id,
         e.inicio_vigencia::text AS escala_inicio,
         e.ancora_escala::text AS ancora_escala,
         ${COLUNAS_JORNADA},
         0 AS colaboradores_na_escala
    FROM rh.escala_colaborador e
    JOIN rh.jornada_versao j ON j.id = e.jornada_versao_id`;

function paraEscala(linha: LinhaEscala): EscalaVigente {
  return {
    escala_id: paraNumero(linha.escala_id),
    colaborador_id: paraNumero(linha.colaborador_id),
    inicio_vigencia: linha.escala_inicio,
    ancora_escala: linha.ancora_escala,
    jornada: paraJornada(linha),
  };
}

/**
 * Escala vigente NA DATA (não "a atual"): apurar março tem de enxergar a
 * jornada de março, mesmo que a pessoa tenha mudado de escala em abril.
 */
export async function escalaVigenteNaData(
  colaboradorId: number,
  data: string
): Promise<EscalaVigente | null> {
  const linhas = await consultar<LinhaEscala>(
    `${SELECT_ESCALA}
      WHERE e.colaborador_id = $1
        AND e.inicio_vigencia <= $2::date
        AND (e.fim_vigencia IS NULL OR e.fim_vigencia >= $2::date)
      ORDER BY e.inicio_vigencia DESC
      LIMIT 1`,
    [colaboradorId, data]
  );
  return linhas[0] ? paraEscala(linhas[0]) : null;
}

/**
 * A mesma escala vigente na data, mas de UMA LISTA de pessoas em UMA ida.
 *
 * Medido em 31/07/2026 contra o banco da Fast (Supabase us-west-2, ida e volta
 * de 222 ms): a apuração de 07/2026 chamava `escalaVigenteNaData` 62 vezes e
 * gastava 14,8 s — 0,3 ms de banco e 14,5 s de rede. O `DISTINCT ON` devolve
 * exatamente a linha que o `ORDER BY inicio_vigencia DESC LIMIT 1` devolvia.
 */
export async function escalasVigentesNaDataEmLote(
  colaboradorIds: number[],
  data: string
): Promise<Map<number, EscalaVigente>> {
  if (colaboradorIds.length === 0) return new Map();
  const linhas = await consultar<LinhaEscala>(
    `SELECT DISTINCT ON (e.colaborador_id)
            e.id AS escala_id, e.colaborador_id,
            e.inicio_vigencia::text AS escala_inicio,
            e.ancora_escala::text AS ancora_escala,
            ${COLUNAS_JORNADA},
            0 AS colaboradores_na_escala
       FROM rh.escala_colaborador e
       JOIN rh.jornada_versao j ON j.id = e.jornada_versao_id
      WHERE e.colaborador_id = ANY($1::bigint[])
        AND e.inicio_vigencia <= $2::date
        AND (e.fim_vigencia IS NULL OR e.fim_vigencia >= $2::date)
      ORDER BY e.colaborador_id, e.inicio_vigencia DESC`,
    [colaboradorIds, data]
  );
  return new Map(
    linhas.map((linha) => [paraNumero(linha.colaborador_id), paraEscala(linha)])
  );
}

export async function listarEscalasVigentes(): Promise<EscalaVigente[]> {
  const linhas = await consultar<LinhaEscala>(
    `${SELECT_ESCALA}
      WHERE e.fim_vigencia IS NULL
      ORDER BY e.colaborador_id`
  );
  return linhas.map(paraEscala);
}

export async function encerrarEscalaVigente(
  cliente: PoolClient,
  colaboradorId: number,
  fimVigencia: string
): Promise<number | null> {
  const { rows } = await cliente.query<{ id: string }>(
    `UPDATE rh.escala_colaborador
        SET fim_vigencia = $2::date
      WHERE colaborador_id = $1 AND fim_vigencia IS NULL
      RETURNING id`,
    [colaboradorId, fimVigencia]
  );
  return rows[0] ? paraNumero(rows[0].id) : null;
}

export async function inserirEscala(
  cliente: PoolClient,
  colaboradorId: number,
  jornadaVersaoId: number,
  inicioVigencia: string,
  observacao: string | null
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.escala_colaborador
       (colaborador_id, jornada_versao_id, inicio_vigencia, observacao)
     VALUES ($1,$2,$3::date,$4)
     RETURNING id`,
    [colaboradorId, jornadaVersaoId, inicioVigencia, observacao]
  );
  return paraNumero(rows[0].id);
}

// ================================================================ feriado

export interface Feriado {
  id: number;
  data: string;
  nome: string;
  abrangencia: AbrangenciaFeriado;
  uf: string | null;
  municipio: string | null;
  estabelecimento_id: number | null;
  tipo: TipoFeriado;
}

interface LinhaFeriado extends Record<string, unknown> {
  id: string;
  data: string;
  nome: string;
  abrangencia: AbrangenciaFeriado;
  uf: string | null;
  municipio: string | null;
  estabelecimento_id: string | null;
  tipo: TipoFeriado;
}

function paraFeriado(linha: LinhaFeriado): Feriado {
  return {
    id: paraNumero(linha.id),
    data: linha.data,
    nome: linha.nome,
    abrangencia: linha.abrangencia,
    uf: linha.uf,
    municipio: linha.municipio,
    estabelecimento_id: numeroOuNulo(linha.estabelecimento_id),
    tipo: linha.tipo,
  };
}

export async function listarFeriados(
  de: string,
  ate: string
): Promise<Feriado[]> {
  const linhas = await consultar<LinhaFeriado>(
    `SELECT id, data::text AS data, nome, abrangencia, uf, municipio,
            estabelecimento_id, tipo
       FROM rh.feriado
      WHERE data BETWEEN $1::date AND $2::date
      ORDER BY data`,
    [de, ate]
  );
  return linhas.map(paraFeriado);
}

/**
 * Feriados que valem para UMA pessoa no período. Nacional vale sempre; o que é
 * amarrado a um estabelecimento vale se for o da lotação DAQUELE DIA.
 * O estabelecimento ainda não tem UF/município estruturados (endereco_resumido
 * é texto livre) — por isso feriado estadual/municipal só alcança a pessoa
 * quando cadastrado COM estabelecimento_id. Evolução: UF e município em
 * rh.estabelecimento_versao resolvem sem cadastro redundante.
 *
 * DIA A DIA, não período: a lotação é resolvida contra `f.data`, e não contra o
 * período inteiro. Quem muda de lotação no meio do mês tinha o mês INTEIRO
 * apurado com os feriados do local novo, porque a escolha era "qualquer linha de
 * rh.lotacao que sobreponha o período, a mais recente" — reapurar o mês depois
 * de uma transferência apagava o feriado do local antigo dos dias em que a
 * pessoa ainda estava lá. Como só os dias de feriado precisam de lotação (e são
 * poucos), a subconsulta correlacionada custa menos que quebrar o período em
 * intervalos de vigência, e usa `lotacao_por_pessoa (colaborador_id,
 * inicio_vigencia DESC)`. A regra de escolha é a MESMA de rh.estrutura_em.
 */
export async function feriadosDoColaborador(
  colaboradorId: number,
  de: string,
  ate: string
): Promise<Feriado[]> {
  const linhas = await consultar<LinhaFeriado>(
    `SELECT f.id, f.data::text AS data, f.nome, f.abrangencia, f.uf, f.municipio,
            f.estabelecimento_id, f.tipo
       FROM rh.feriado f
      WHERE f.data BETWEEN $2::date AND $3::date
        AND (f.abrangencia = 'nacional'
             OR f.estabelecimento_id = (
                  SELECT l.estabelecimento_id
                    FROM rh.lotacao l
                   WHERE l.colaborador_id = $1
                     AND l.inicio_vigencia <= f.data
                     AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= f.data)
                   ORDER BY l.inicio_vigencia DESC, l.id DESC
                   LIMIT 1))
      ORDER BY f.data, f.id`,
    [colaboradorId, de, ate]
  );
  return linhas.map(paraFeriado);
}

/**
 * Os mesmos feriados, mas de UMA LISTA de pessoas em UMA ida. Cada pessoa traz a
 * SUA lotação DE CADA DIA, então o resultado é idêntico ao de chamar a versão de
 * uma pessoa N vezes — 13,7 s viram 0,3 s na apuração de 07/2026.
 *
 * A resolução é por dia pelo mesmo motivo da versão de uma pessoa (ver acima); o
 * custo é uma subconsulta por (pessoa × dia de feriado), e dias de feriado num
 * mês são poucos.
 *
 * O `ORDER BY` ganhou `f.id` como desempate: quando dois feriados caem no mesmo
 * dia (nacional + o do estabelecimento), quem chama monta um mapa data → nome e
 * o ÚLTIMO vence. Sem desempate isso dependia da ordem física da tabela.
 */
export async function feriadosDosColaboradoresEmLote(
  colaboradorIds: number[],
  de: string,
  ate: string
): Promise<Map<number, Feriado[]>> {
  if (colaboradorIds.length === 0) return new Map();
  const linhas = await consultar<LinhaFeriado & { alvo_id: string }>(
    `SELECT a.colaborador_id::text AS alvo_id,
            f.id, f.data::text AS data, f.nome, f.abrangencia, f.uf, f.municipio,
            f.estabelecimento_id, f.tipo
       FROM unnest($1::bigint[]) AS a(colaborador_id)
       JOIN rh.feriado f
         ON f.data BETWEEN $2::date AND $3::date
        AND (f.abrangencia = 'nacional'
             OR f.estabelecimento_id = (
                  SELECT l.estabelecimento_id
                    FROM rh.lotacao l
                   WHERE l.colaborador_id = a.colaborador_id
                     AND l.inicio_vigencia <= f.data
                     AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= f.data)
                   ORDER BY l.inicio_vigencia DESC, l.id DESC
                   LIMIT 1))
      ORDER BY a.colaborador_id, f.data, f.id`,
    [colaboradorIds, de, ate]
  );
  const porColaborador = new Map<number, Feriado[]>();
  for (const linha of linhas) {
    const id = paraNumero(linha.alvo_id);
    const lista = porColaborador.get(id);
    if (lista) lista.push(paraFeriado(linha));
    else porColaborador.set(id, [paraFeriado(linha)]);
  }
  return porColaborador;
}

export interface DadosFeriado {
  data: string;
  nome: string;
  abrangencia: AbrangenciaFeriado;
  tipo: TipoFeriado;
  uf: string | null;
  municipio: string | null;
  estabelecimento_id: number | null;
}

export async function inserirFeriado(
  cliente: PoolClient,
  dados: DadosFeriado
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.feriado
       (data, nome, abrangencia, tipo, uf, municipio, estabelecimento_id)
     VALUES ($1::date,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      dados.data,
      dados.nome,
      dados.abrangencia,
      dados.tipo,
      dados.uf,
      dados.municipio,
      dados.estabelecimento_id,
    ]
  );
  return paraNumero(rows[0].id);
}

export async function buscarFeriado(
  cliente: PoolClient,
  id: number
): Promise<Feriado | null> {
  const { rows } = await cliente.query<LinhaFeriado>(
    `SELECT id, data::text AS data, nome, abrangencia, uf, municipio,
            estabelecimento_id, tipo
       FROM rh.feriado WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows[0] ? paraFeriado(rows[0]) : null;
}

export async function removerFeriado(
  cliente: PoolClient,
  id: number
): Promise<void> {
  await cliente.query(`DELETE FROM rh.feriado WHERE id = $1`, [id]);
}

// ================================================================ marcação

export interface MarcacaoRegistro {
  id: number;
  colaborador_id: number;
  momento_iso: string;
  data_local: string;
  minuto_local: number;
  tipo: TipoMarcacao;
  origem: OrigemMarcacao;
  origem_referencia: string | null;
  efeito: string;
  substitui_marcacao_id: number | null;
  superada: boolean;
}

interface LinhaMarcacao extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  momento_iso: string;
  data_local: string;
  minuto_local: string;
  tipo: TipoMarcacao;
  origem: OrigemMarcacao;
  origem_referencia: string | null;
  efeito: string;
  substitui_marcacao_id: string | null;
  superada: boolean;
}

const SELECT_MARCACAO = `
  SELECT m.id, m.colaborador_id,
         to_char(m.momento AT TIME ZONE '${FUSO}', 'YYYY-MM-DD"T"HH24:MI:SS') AS momento_iso,
         (m.momento AT TIME ZONE '${FUSO}')::date::text AS data_local,
         (EXTRACT(HOUR FROM m.momento AT TIME ZONE '${FUSO}') * 60
          + EXTRACT(MINUTE FROM m.momento AT TIME ZONE '${FUSO}'))::int AS minuto_local,
         m.tipo, m.origem, m.origem_referencia, m.efeito, m.substitui_marcacao_id,
         EXISTS (SELECT 1 FROM rh.marcacao s WHERE s.substitui_marcacao_id = m.id)
           AS superada
    FROM rh.marcacao m`;

function paraMarcacao(linha: LinhaMarcacao): MarcacaoRegistro {
  return {
    id: paraNumero(linha.id),
    colaborador_id: paraNumero(linha.colaborador_id),
    momento_iso: linha.momento_iso,
    data_local: linha.data_local,
    minuto_local: paraNumero(linha.minuto_local),
    tipo: linha.tipo,
    origem: linha.origem,
    origem_referencia: linha.origem_referencia,
    efeito: linha.efeito,
    substitui_marcacao_id: numeroOuNulo(linha.substitui_marcacao_id),
    superada: linha.superada,
  };
}

/** Tudo que aconteceu no período — inclusive superadas, para o espelho mostrar
 *  a trilha de correção. O motor recebe só as válidas (ver marcacoesValidas). */
export async function listarMarcacoesDoPeriodo(
  colaboradorId: number,
  de: string,
  ate: string
): Promise<MarcacaoRegistro[]> {
  const linhas = await consultar<LinhaMarcacao>(
    `${SELECT_MARCACAO}
      WHERE m.colaborador_id = $1
        AND (m.momento AT TIME ZONE '${FUSO}')::date BETWEEN $2::date AND $3::date
      ORDER BY m.momento, m.id`,
    [colaboradorId, de, ate]
  );
  return linhas.map(paraMarcacao);
}

/** Só o que o motor pode contar: efeito 'registro' e nunca substituída. */
export function marcacoesValidas(
  marcacoes: MarcacaoRegistro[]
): MarcacaoBruta[] {
  return marcacoes
    .filter((m) => m.efeito === "registro" && !m.superada)
    .map((m) => ({
      id: m.id,
      tipo: m.tipo,
      data_local: m.data_local,
      minuto_local: m.minuto_local,
    }));
}

/**
 * SÓ o que o motor conta, de TODA a lista, em UMA ida — o equivalente em lote de
 * `listarMarcacoesDoPeriodo` + `marcacoesValidas`.
 *
 * Duas economias, ambas medidas em 31/07/2026 na apuração de 07/2026:
 *   - 62 idas de 404 ms viram uma só (25,1 s → ~2,5 s);
 *   - a linha inteira (momento_iso, origem, referência, efeito, superada…) não
 *     viaja: o motor usa quatro campos. As mesmas 5,6 mil marcações do mês custam
 *     5,9 s com `SELECT *` e 2,5 s com os quatro campos — o link até us-west-2
 *     entrega ~200 kB/s e byte que não sai do banco é o mais barato de todos.
 *
 * O filtro e a ordem são os mesmos de antes: só `efeito = 'registro'` que não foi
 * substituída, na ordem (momento, id) dentro de cada pessoa.
 */
export async function marcacoesValidasDoPeriodoEmLote(
  colaboradorIds: number[],
  de: string,
  ate: string
): Promise<Map<number, MarcacaoBruta[]>> {
  if (colaboradorIds.length === 0) return new Map();
  const linhas = await consultar<{
    colaborador_id: string;
    id: string;
    tipo: TipoMarcacao;
    data_local: string;
    minuto_local: string;
  }>(
    `SELECT m.colaborador_id, m.id, m.tipo,
            (m.momento AT TIME ZONE '${FUSO}')::date::text AS data_local,
            (EXTRACT(HOUR FROM m.momento AT TIME ZONE '${FUSO}') * 60
             + EXTRACT(MINUTE FROM m.momento AT TIME ZONE '${FUSO}'))::int
              AS minuto_local
       FROM rh.marcacao m
      WHERE m.colaborador_id = ANY($1::bigint[])
        AND (m.momento AT TIME ZONE '${FUSO}')::date BETWEEN $2::date AND $3::date
        AND m.efeito = 'registro'
        AND NOT EXISTS (SELECT 1 FROM rh.marcacao s
                         WHERE s.substitui_marcacao_id = m.id)
      ORDER BY m.colaborador_id, m.momento, m.id`,
    [colaboradorIds, de, ate]
  );
  const porColaborador = new Map<number, MarcacaoBruta[]>();
  for (const linha of linhas) {
    const marcacao: MarcacaoBruta = {
      id: paraNumero(linha.id),
      tipo: linha.tipo,
      data_local: linha.data_local,
      minuto_local: paraNumero(linha.minuto_local),
    };
    const id = paraNumero(linha.colaborador_id);
    const lista = porColaborador.get(id);
    if (lista) lista.push(marcacao);
    else porColaborador.set(id, [marcacao]);
  }
  return porColaborador;
}

export interface DadosMarcacao {
  colaborador_id: number;
  momento_iso: string;
  tipo: TipoMarcacao;
  origem: OrigemMarcacao;
  origem_referencia: string | null;
  efeito: "registro" | "anulacao";
  substitui_marcacao_id: number | null;
  lote_id: number | null;
  registrada_por: number;
}

export async function inserirMarcacao(
  cliente: PoolClient,
  dados: DadosMarcacao
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.marcacao
       (colaborador_id, momento, tipo, origem, origem_referencia, efeito,
        substitui_marcacao_id, lote_id, importada_em, registrada_por)
     VALUES ($1,$2::timestamptz,$3,$4,$5,$6,$7,$8,
             CASE WHEN $4 = 'importacao' THEN now() ELSE NULL END, $9)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.momento_iso,
      dados.tipo,
      dados.origem,
      dados.origem_referencia,
      dados.efeito,
      dados.substitui_marcacao_id,
      dados.lote_id,
      dados.registrada_por,
    ]
  );
  return paraNumero(rows[0].id);
}

/**
 * Chaves (colaborador|AAAA-MM-DD HH:MM:SS|tipo) das marcações já gravadas no
 * período, na MESMA semântica do índice `marcacao_sem_repeticao`. O importador
 * usa isto para rejeitar duplicata sem precisar de uma ida ao banco por linha —
 * a unicidade do banco continua sendo a garantia final.
 */
export async function chavesDeMarcacaoNoPeriodo(
  cliente: PoolClient,
  de: string,
  ate: string
): Promise<Set<string>> {
  const { rows } = await cliente.query<{
    colaborador_id: string;
    chave_local: string;
    tipo: string;
  }>(
    `SELECT colaborador_id,
            to_char(momento AT TIME ZONE '${FUSO}', 'YYYY-MM-DD HH24:MI:SS') AS chave_local,
            tipo
       FROM rh.marcacao
      WHERE substitui_marcacao_id IS NULL
        AND (momento AT TIME ZONE '${FUSO}')::date BETWEEN $1::date AND $2::date`,
    [de, ate]
  );
  return new Set(
    rows.map((linha) => `${linha.colaborador_id}|${linha.chave_local}|${linha.tipo}`)
  );
}

export interface MarcacaoDeLote {
  colaborador_id: number;
  momento_iso: string;
  tipo: TipoMarcacao;
  origem_referencia: string;
}

/**
 * Insere um bloco de marcações de importação em UMA ida ao banco. Importar
 * arquivo de competência inteira linha a linha custaria milhares de
 * round-trips; o bloco é o que torna a importação usável de verdade.
 * Quem chama isola o bloco em SAVEPOINT e cai para linha a linha se falhar.
 */
export async function inserirMarcacoesEmLote(
  cliente: PoolClient,
  marcacoes: MarcacaoDeLote[],
  loteId: number,
  registradaPor: number
): Promise<number> {
  if (marcacoes.length === 0) return 0;
  const { rowCount } = await cliente.query(
    `INSERT INTO rh.marcacao
       (colaborador_id, momento, tipo, origem, origem_referencia, efeito,
        lote_id, importada_em, registrada_por)
     SELECT bloco.colaborador_id, bloco.momento::timestamptz, bloco.tipo,
            'importacao', bloco.referencia, 'registro', $5, now(), $6
       FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[])
            AS bloco(colaborador_id, momento, tipo, referencia)`,
    [
      marcacoes.map((m) => m.colaborador_id),
      marcacoes.map((m) => m.momento_iso),
      marcacoes.map((m) => m.tipo),
      marcacoes.map((m) => m.origem_referencia),
      loteId,
      registradaPor,
    ]
  );
  return rowCount ?? 0;
}

export async function buscarMarcacao(
  cliente: PoolClient,
  id: number
): Promise<MarcacaoRegistro | null> {
  const { rows } = await cliente.query<LinhaMarcacao>(
    `${SELECT_MARCACAO} WHERE m.id = $1`,
    [id]
  );
  return rows[0] ? paraMarcacao(rows[0]) : null;
}

/**
 * Trava a linha da marcação na transação (FOR UPDATE). O ajuste toma esta trava
 * ANTES de conferir se a batida já foi superada por outra correção — assim dois
 * ajustes concorrentes sobre a MESMA batida original serializam, em vez de os
 * dois lerem superada=false e inserirem duas substitutas 'registro'.
 */
export async function travarMarcacao(
  cliente: PoolClient,
  id: number
): Promise<void> {
  await cliente.query(`SELECT id FROM rh.marcacao WHERE id = $1 FOR UPDATE`, [
    id,
  ]);
}

// ================================================================ lote de importação

export interface LoteImportacao {
  id: number;
  arquivo: string;
  competencia_ano: number;
  competencia_mes: number;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  relatorio: Record<string, unknown>;
  importado_por: number;
  importado_em: string;
}

interface LinhaLote extends Record<string, unknown> {
  id: string;
  arquivo: string;
  competencia_ano: number;
  competencia_mes: number;
  linhas_lidas: number;
  linhas_aceitas: number;
  linhas_rejeitadas: number;
  relatorio: Record<string, unknown>;
  importado_por: string;
  importado_em: string;
}

function paraLote(linha: LinhaLote): LoteImportacao {
  return {
    id: paraNumero(linha.id),
    arquivo: linha.arquivo,
    competencia_ano: linha.competencia_ano,
    competencia_mes: linha.competencia_mes,
    linhas_lidas: linha.linhas_lidas,
    linhas_aceitas: linha.linhas_aceitas,
    linhas_rejeitadas: linha.linhas_rejeitadas,
    relatorio: linha.relatorio,
    importado_por: paraNumero(linha.importado_por),
    importado_em: linha.importado_em,
  };
}

/** Lote nasce vazio: as marcações precisam do lote_id ANTES de existirem. */
export async function abrirLote(
  cliente: PoolClient,
  arquivo: string,
  ano: number,
  mes: number,
  importadoPor: number
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.lote_importacao_ponto
       (arquivo, competencia_ano, competencia_mes, importado_por)
     VALUES ($1,$2,$3,$4)
     RETURNING id`,
    [arquivo, ano, mes, importadoPor]
  );
  return paraNumero(rows[0].id);
}

export async function fecharLote(
  cliente: PoolClient,
  id: number,
  lidas: number,
  aceitas: number,
  rejeitadas: number,
  relatorio: Record<string, unknown>
): Promise<void> {
  await cliente.query(
    `UPDATE rh.lote_importacao_ponto
        SET linhas_lidas = $2, linhas_aceitas = $3,
            linhas_rejeitadas = $4, relatorio = $5::jsonb
      WHERE id = $1`,
    [id, lidas, aceitas, rejeitadas, JSON.stringify(relatorio)]
  );
}

const SELECT_LOTE = `
  SELECT id, arquivo, competencia_ano, competencia_mes,
         linhas_lidas, linhas_aceitas, linhas_rejeitadas, relatorio,
         importado_por, importado_em::text AS importado_em
    FROM rh.lote_importacao_ponto`;

export async function listarLotes(limite = 50): Promise<LoteImportacao[]> {
  const linhas = await consultar<LinhaLote>(
    `${SELECT_LOTE} ORDER BY importado_em DESC LIMIT $1`,
    [limite]
  );
  return linhas.map(paraLote);
}

export async function buscarLote(id: number): Promise<LoteImportacao | null> {
  const linhas = await consultar<LinhaLote>(`${SELECT_LOTE} WHERE id = $1`, [id]);
  return linhas[0] ? paraLote(linhas[0]) : null;
}

export interface VinculoDeMatricula {
  id: number;
  matricula: string;
  pessoa_id: number;
  data_admissao: string;
  data_desligamento: string | null;
}

/**
 * Todos os vínculos com matrícula, para o importador resolver a coluna do
 * arquivo POR DATA.
 *
 * Antes isto era `SELECT matricula, id` puro e virava um mapa matrícula →
 * colaborador_id sem recorte nenhum. O arquivo do relógio continua gravado com a
 * matrícula ANTIGA por dias depois de uma transferência entre empresas do grupo
 * (quem cadastra o crachá no relógio é outra pessoa e outro sistema), então a
 * batida entrava num VÍNCULO ENCERRADO: a apuração não enxerga quem está
 * desligado, o espelho da pessoa resolve pelo vínculo atual, e a marcação — que
 * é append-only — ficava órfã para sempre.
 *
 * `pessoa_id` vem junto porque é ele que permite dizer QUAL matrícula valia
 * naquele dia: os vínculos da mesma pessoa são irmãos por rh.pessoa (onda I).
 * A matrícula é UNIQUE em rh.colaborador, então (matrícula → vínculo) continua
 * sendo um para um; o que passou a existir é a janela de vigência.
 */
export async function vinculosComMatricula(): Promise<VinculoDeMatricula[]> {
  const linhas = await consultar<{
    id: string;
    matricula: string;
    pessoa_id: string;
    data_admissao: string;
    data_desligamento: string | null;
  }>(
    `SELECT id, matricula, pessoa_id,
            data_admissao::text     AS data_admissao,
            data_desligamento::text AS data_desligamento
       FROM rh.colaborador`
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    matricula: linha.matricula,
    pessoa_id: paraNumero(linha.pessoa_id),
    data_admissao: linha.data_admissao,
    data_desligamento: linha.data_desligamento,
  }));
}

// ================================================================ regra de banco de horas

export interface RegraBanco {
  id: number;
  nivel: number;
  escopo: string;
  estabelecimento_id: number | null;
  cargo_id: number | null;
  colaborador_id: number | null;
  prazo_compensacao_dias: number;
  limite_positivo_minutos: number;
  limite_negativo_minutos: number;
  expira_saldo: boolean;
  tratamento_rescisao: TratamentoRescisao;
  fator_he_50: number;
  fator_he_100: number;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

interface LinhaRegra extends Record<string, unknown> {
  id: string;
  nivel: number;
  estabelecimento_id: string | null;
  cargo_id: string | null;
  colaborador_id: string | null;
  prazo_compensacao_dias: number;
  limite_positivo_minutos: number;
  limite_negativo_minutos: number;
  expira_saldo: boolean;
  tratamento_rescisao: TratamentoRescisao;
  fator_he_50: string;
  fator_he_100: string;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

const NIVEL_REGRA = `
  CASE WHEN r.colaborador_id     IS NOT NULL THEN 3
       WHEN r.cargo_id           IS NOT NULL THEN 2
       WHEN r.estabelecimento_id IS NOT NULL THEN 1
       ELSE 0 END`;

const ROTULO_NIVEL = ["Padrão da empresa", "Unidade", "Cargo", "Pessoa"];

function paraRegra(linha: LinhaRegra): RegraBanco {
  return {
    id: paraNumero(linha.id),
    nivel: linha.nivel,
    escopo: ROTULO_NIVEL[linha.nivel] ?? "Padrão da empresa",
    estabelecimento_id: numeroOuNulo(linha.estabelecimento_id),
    cargo_id: numeroOuNulo(linha.cargo_id),
    colaborador_id: numeroOuNulo(linha.colaborador_id),
    prazo_compensacao_dias: linha.prazo_compensacao_dias,
    limite_positivo_minutos: linha.limite_positivo_minutos,
    limite_negativo_minutos: linha.limite_negativo_minutos,
    expira_saldo: linha.expira_saldo,
    tratamento_rescisao: linha.tratamento_rescisao,
    fator_he_50: paraNumero(linha.fator_he_50),
    fator_he_100: paraNumero(linha.fator_he_100),
    status: linha.status,
    inicio_vigencia: linha.inicio_vigencia,
    fim_vigencia: linha.fim_vigencia,
  };
}

const COLUNAS_REGRA = `
  r.id, ${NIVEL_REGRA} AS nivel,
  r.estabelecimento_id, r.cargo_id, r.colaborador_id,
  r.prazo_compensacao_dias, r.limite_positivo_minutos, r.limite_negativo_minutos,
  r.expira_saldo, r.tratamento_rescisao, r.fator_he_50, r.fator_he_100,
  r.status, r.inicio_vigencia::text AS inicio_vigencia,
  r.fim_vigencia::text AS fim_vigencia`;

/**
 * Resolução em TRÊS NÍVEIS: pessoa > cargo > unidade > empresa. Vence a regra
 * mais específica VIGENTE NA DATA — versão encerrada continua respondendo pelo
 * passado, senão reapurar uma competência antiga mudaria o resultado.
 */
export async function resolverRegraBanco(
  colaboradorId: number,
  data: string
): Promise<RegraBanco | null> {
  const linhas = await consultar<LinhaRegra>(
    `WITH contexto AS (
       SELECT
         (SELECT l.estabelecimento_id FROM rh.lotacao l
           WHERE l.colaborador_id = $1 AND l.inicio_vigencia <= $2::date
             AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= $2::date)
           ORDER BY l.inicio_vigencia DESC LIMIT 1) AS estabelecimento_id,
         (SELECT cv.cargo_id FROM rh.posicao_colaborador p
             JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
           WHERE p.colaborador_id = $1 AND p.inicio_vigencia <= $2::date
             AND (p.fim_vigencia IS NULL OR p.fim_vigencia >= $2::date)
           ORDER BY p.inicio_vigencia DESC LIMIT 1) AS cargo_id
     )
     SELECT ${COLUNAS_REGRA}
       FROM rh.regra_banco_horas_versao r, contexto c
      WHERE r.status IN ('ativa','encerrada')
        AND r.inicio_vigencia <= $2::date
        AND (r.fim_vigencia IS NULL OR r.fim_vigencia >= $2::date)
        AND (
          r.colaborador_id = $1
          OR (r.cargo_id IS NOT NULL AND r.cargo_id = c.cargo_id)
          OR (r.estabelecimento_id IS NOT NULL
              AND r.estabelecimento_id = c.estabelecimento_id)
          OR (r.colaborador_id IS NULL AND r.cargo_id IS NULL
              AND r.estabelecimento_id IS NULL)
        )
      ORDER BY ${NIVEL_REGRA} DESC, r.inicio_vigencia DESC
      LIMIT 1`,
    [colaboradorId, data]
  );
  return linhas[0] ? paraRegra(linhas[0]) : null;
}

export async function listarRegrasBanco(): Promise<RegraBanco[]> {
  const linhas = await consultar<LinhaRegra>(
    `SELECT ${COLUNAS_REGRA}
       FROM rh.regra_banco_horas_versao r
      ORDER BY ${NIVEL_REGRA}, r.inicio_vigencia DESC`
  );
  return linhas.map(paraRegra);
}

export interface DadosRegraBanco {
  estabelecimento_id: number | null;
  cargo_id: number | null;
  colaborador_id: number | null;
  prazo_compensacao_dias: number;
  limite_positivo_minutos: number;
  limite_negativo_minutos: number;
  expira_saldo: boolean;
  tratamento_rescisao: TratamentoRescisao;
  fator_he_50: number;
  fator_he_100: number;
  inicio_vigencia: string;
}

export async function buscarRegraAtivaDoEscopo(
  cliente: PoolClient,
  estabelecimentoId: number | null,
  cargoId: number | null,
  colaboradorId: number | null
): Promise<{ id: number; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{ id: string; inicio_vigencia: string }>(
    `SELECT id, inicio_vigencia::text AS inicio_vigencia
       FROM rh.regra_banco_horas_versao
      WHERE status = 'ativa'
        AND COALESCE(estabelecimento_id, 0) = COALESCE($1::bigint, 0)
        AND COALESCE(cargo_id, 0) = COALESCE($2::bigint, 0)
        AND COALESCE(colaborador_id, 0) = COALESCE($3::bigint, 0)
      FOR UPDATE`,
    [estabelecimentoId, cargoId, colaboradorId]
  );
  return rows[0]
    ? { id: paraNumero(rows[0].id), inicio_vigencia: rows[0].inicio_vigencia }
    : null;
}

export async function encerrarRegraBanco(
  cliente: PoolClient,
  id: number,
  fimVigencia: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.regra_banco_horas_versao
        SET status = 'encerrada', fim_vigencia = $2::date
      WHERE id = $1`,
    [id, fimVigencia]
  );
}

export async function inserirRegraBanco(
  cliente: PoolClient,
  dados: DadosRegraBanco
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.regra_banco_horas_versao
       (estabelecimento_id, cargo_id, colaborador_id, prazo_compensacao_dias,
        limite_positivo_minutos, limite_negativo_minutos, expira_saldo,
        tratamento_rescisao, fator_he_50, fator_he_100, status, inicio_vigencia)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ativa',$11::date)
     RETURNING id`,
    [
      dados.estabelecimento_id,
      dados.cargo_id,
      dados.colaborador_id,
      dados.prazo_compensacao_dias,
      dados.limite_positivo_minutos,
      dados.limite_negativo_minutos,
      dados.expira_saldo,
      dados.tratamento_rescisao,
      dados.fator_he_50.toFixed(2),
      dados.fator_he_100.toFixed(2),
      dados.inicio_vigencia,
    ]
  );
  return paraNumero(rows[0].id);
}

// ================================================================ apuração

export interface Apuracao {
  id: number;
  colaborador_id: number;
  ano: number;
  mes: number;
  jornada_versao_id: number;
  regra_banco_versao_id: number | null;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  /** Minutos noturnos antes da redução da hora noturna (art. 73 §1º). */
  adicional_noturno_relogio_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  memoria: Record<string, unknown>;
  calculada_em: string;
  calculada_por: number;
}

interface LinhaApuracao extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  ano: number;
  mes: number;
  jornada_versao_id: string;
  regra_banco_versao_id: string | null;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  /** Minutos noturnos antes da redução da hora noturna (art. 73 §1º). */
  adicional_noturno_relogio_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  memoria: Record<string, unknown>;
  calculada_em: string;
  calculada_por: string;
}

const SELECT_APURACAO = `
  SELECT a.id, a.colaborador_id, a.ano, a.mes, a.jornada_versao_id,
         a.regra_banco_versao_id, a.minutos_trabalhados, a.minutos_previstos,
         a.he_50_minutos, a.he_100_minutos, a.adicional_noturno_minutos,
         a.adicional_noturno_relogio_minutos,
         a.faltas_minutos, a.atrasos_minutos, a.dsr_desconto_minutos,
         a.saldo_banco_minutos, a.memoria,
         a.calculada_em::text AS calculada_em, a.calculada_por
    FROM rh.apuracao_ponto a`;

function paraApuracao(linha: LinhaApuracao): Apuracao {
  return {
    id: paraNumero(linha.id),
    colaborador_id: paraNumero(linha.colaborador_id),
    ano: linha.ano,
    mes: linha.mes,
    jornada_versao_id: paraNumero(linha.jornada_versao_id),
    regra_banco_versao_id: numeroOuNulo(linha.regra_banco_versao_id),
    minutos_trabalhados: linha.minutos_trabalhados,
    minutos_previstos: linha.minutos_previstos,
    he_50_minutos: linha.he_50_minutos,
    he_100_minutos: linha.he_100_minutos,
    adicional_noturno_minutos: linha.adicional_noturno_minutos,
    adicional_noturno_relogio_minutos:
      linha.adicional_noturno_relogio_minutos,
    faltas_minutos: linha.faltas_minutos,
    atrasos_minutos: linha.atrasos_minutos,
    dsr_desconto_minutos: linha.dsr_desconto_minutos,
    saldo_banco_minutos: linha.saldo_banco_minutos,
    memoria: linha.memoria,
    calculada_em: linha.calculada_em,
    calculada_por: paraNumero(linha.calculada_por),
  };
}

export async function buscarApuracao(
  colaboradorId: number,
  ano: number,
  mes: number
): Promise<Apuracao | null> {
  const linhas = await consultar<LinhaApuracao>(
    `${SELECT_APURACAO}
      WHERE a.colaborador_id = $1 AND a.ano = $2 AND a.mes = $3`,
    [colaboradorId, ano, mes]
  );
  return linhas[0] ? paraApuracao(linhas[0]) : null;
}

export async function listarApuracoesDaCompetencia(
  ano: number,
  mes: number
): Promise<Apuracao[]> {
  const linhas = await consultar<LinhaApuracao>(
    `${SELECT_APURACAO} WHERE a.ano = $1 AND a.mes = $2 ORDER BY a.colaborador_id`,
    [ano, mes]
  );
  return linhas.map(paraApuracao);
}

export interface DadosApuracao {
  colaborador_id: number;
  ano: number;
  mes: number;
  jornada_versao_id: number;
  regra_banco_versao_id: number | null;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  adicional_noturno_relogio_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  memoria: Record<string, unknown>;
  calculada_por: number;
}

/**
 * SERIALIZA (pessoa, competência) pelo resto da transação, para toda a lista.
 *
 * `SELECT ... FOR UPDATE` só tranca LINHA QUE EXISTE. Na PRIMEIRA apuração de
 * uma competência não existe linha nenhuma, então duas execuções simultâneas
 * (dois cliques em "Apurar", dois DPs ao mesmo tempo) liam as duas `anterior =
 * null`, as duas PULAVAM o estorno e as duas inseriam o crédito: banco de horas
 * creditado em dobro, em livro append-only que só se corrige com movimento
 * manual. A partir da segunda apuração o FOR UPDATE já serializava — era só o
 * primeiro cálculo que corria solto.
 *
 * O advisory lock não depende de linha existir: é uma trava no par de inteiros,
 * presa à transação (`_xact_`), liberada no COMMIT ou no ROLLBACK. Namespace
 * pelo nome da tabela para não colidir com outro lock do sistema.
 *
 * A ordem é a do vetor — a apuração da competência sempre percorre as pessoas
 * na mesma ordem, então duas execuções simultâneas pegam as travas na mesma
 * sequência e uma espera a outra em vez de as duas se enroscarem.
 */
export async function travarApuracoes(
  cliente: PoolClient,
  colaboradorIds: number[],
  ano: number,
  mes: number
): Promise<void> {
  if (colaboradorIds.length === 0) return;
  await cliente.query(
    `SELECT pg_advisory_xact_lock(
              hashtext('rh.apuracao_ponto'),
              hashtext(c.id::text || ':' || $2::text || '-' || $3::text))
       FROM unnest($1::bigint[]) WITH ORDINALITY AS c(id, ordem)`,
    [colaboradorIds, ano, mes]
  );
}

/**
 * O que a apuração ANTERIOR de cada pessoa mandou ao banco de horas, e mais nada.
 *
 * Repare no que NÃO está no SELECT: `memoria`. A coluna guarda o mês dia a dia —
 * 62 kB de JSON por pessoa — e quem chama só precisa do id, do saldo e de quatro
 * totais para a trilha. Medido em 31/07/2026: ler a linha COM memoria custa
 * 904 ms, SEM memoria custa 223 ms; as 62 leituras somavam 47,6 s. Em lote e sem
 * a memória, 0,2 s.
 *
 * O `FOR UPDATE` continua igual: tranca as linhas que já existem pelo resto da
 * transação (a trava do par pessoa+competência, que é a que protege a PRIMEIRA
 * apuração, é a `travarApuracoes` acima).
 */
export interface ApuracaoAnterior {
  id: number;
  colaborador_id: number;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  saldo_banco_minutos: number;
}

export async function buscarApuracoesParaAtualizarEmLote(
  cliente: PoolClient,
  colaboradorIds: number[],
  ano: number,
  mes: number
): Promise<Map<number, ApuracaoAnterior>> {
  if (colaboradorIds.length === 0) return new Map();
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    minutos_trabalhados: number;
    minutos_previstos: number;
    he_50_minutos: number;
    he_100_minutos: number;
    saldo_banco_minutos: number;
  }>(
    `SELECT a.id, a.colaborador_id, a.minutos_trabalhados, a.minutos_previstos,
            a.he_50_minutos, a.he_100_minutos, a.saldo_banco_minutos
       FROM rh.apuracao_ponto a
      WHERE a.colaborador_id = ANY($1::bigint[]) AND a.ano = $2 AND a.mes = $3
      ORDER BY a.colaborador_id
        FOR UPDATE`,
    [colaboradorIds, ano, mes]
  );
  return new Map(
    rows.map((linha) => [
      paraNumero(linha.colaborador_id),
      {
        id: paraNumero(linha.id),
        colaborador_id: paraNumero(linha.colaborador_id),
        minutos_trabalhados: linha.minutos_trabalhados,
        minutos_previstos: linha.minutos_previstos,
        he_50_minutos: linha.he_50_minutos,
        he_100_minutos: linha.he_100_minutos,
        saldo_banco_minutos: linha.saldo_banco_minutos,
      },
    ])
  );
}

/**
 * Grava (ou regrava) a apuração de TODAS as pessoas da rodada em UMA ida.
 * Devolve colaborador_id → id da apuração, que é o que o lançamento no banco de
 * horas precisa para amarrar o movimento à apuração que o gerou.
 *
 * Reapuração sobrescreve a linha (o histórico fica em audit.alteracao) — daí o
 * ON CONFLICT. O banco de horas, que é append-only, recebe estorno + novo
 * lançamento em vez de UPDATE; quem cuida disso é o serviço.
 *
 * A memória viaja como text[] e só vira jsonb no servidor: `jsonb[]` obrigaria a
 * biblioteca a montar um literal de array de jsonb e a diferença de escape entre
 * as duas rotas é exatamente o tipo de coisa que quebra com uma aspa no nome de
 * um feriado.
 *
 * Uma pessoa aparece uma única vez por competência (a chave é o par), então o
 * ON CONFLICT nunca tenta tocar a mesma linha duas vezes no mesmo comando.
 */
export async function gravarApuracoesEmLote(
  cliente: PoolClient,
  dados: DadosApuracao[]
): Promise<Map<number, number>> {
  if (dados.length === 0) return new Map();
  const { rows } = await cliente.query<{ id: string; colaborador_id: string }>(
    `INSERT INTO rh.apuracao_ponto
       (colaborador_id, ano, mes, jornada_versao_id, regra_banco_versao_id,
        minutos_trabalhados, minutos_previstos, he_50_minutos, he_100_minutos,
        adicional_noturno_minutos, adicional_noturno_relogio_minutos,
        faltas_minutos, atrasos_minutos,
        dsr_desconto_minutos, saldo_banco_minutos, memoria, calculada_por)
     SELECT t.colaborador_id, t.ano, t.mes, t.jornada_versao_id,
            t.regra_banco_versao_id, t.minutos_trabalhados, t.minutos_previstos,
            t.he_50_minutos, t.he_100_minutos, t.adicional_noturno_minutos,
            t.adicional_noturno_relogio_minutos, t.faltas_minutos,
            t.atrasos_minutos, t.dsr_desconto_minutos, t.saldo_banco_minutos,
            t.memoria::jsonb, t.calculada_por
       FROM unnest($1::bigint[], $2::int[], $3::int[], $4::bigint[], $5::bigint[],
                   $6::int[], $7::int[], $8::int[], $9::int[], $10::int[],
                   $11::int[], $12::int[], $13::int[], $14::int[], $15::int[],
                   $16::text[], $17::bigint[])
            AS t(colaborador_id, ano, mes, jornada_versao_id,
                 regra_banco_versao_id, minutos_trabalhados, minutos_previstos,
                 he_50_minutos, he_100_minutos, adicional_noturno_minutos,
                 adicional_noturno_relogio_minutos, faltas_minutos,
                 atrasos_minutos, dsr_desconto_minutos, saldo_banco_minutos,
                 memoria, calculada_por)
     ON CONFLICT (colaborador_id, ano, mes) DO UPDATE SET
       jornada_versao_id = EXCLUDED.jornada_versao_id,
       regra_banco_versao_id = EXCLUDED.regra_banco_versao_id,
       minutos_trabalhados = EXCLUDED.minutos_trabalhados,
       minutos_previstos = EXCLUDED.minutos_previstos,
       he_50_minutos = EXCLUDED.he_50_minutos,
       he_100_minutos = EXCLUDED.he_100_minutos,
       adicional_noturno_minutos = EXCLUDED.adicional_noturno_minutos,
       adicional_noturno_relogio_minutos =
         EXCLUDED.adicional_noturno_relogio_minutos,
       faltas_minutos = EXCLUDED.faltas_minutos,
       atrasos_minutos = EXCLUDED.atrasos_minutos,
       dsr_desconto_minutos = EXCLUDED.dsr_desconto_minutos,
       saldo_banco_minutos = EXCLUDED.saldo_banco_minutos,
       memoria = EXCLUDED.memoria,
       calculada_em = now(),
       calculada_por = EXCLUDED.calculada_por
     RETURNING id, colaborador_id`,
    [
      dados.map((d) => d.colaborador_id),
      dados.map((d) => d.ano),
      dados.map((d) => d.mes),
      dados.map((d) => d.jornada_versao_id),
      dados.map((d) => d.regra_banco_versao_id),
      dados.map((d) => d.minutos_trabalhados),
      dados.map((d) => d.minutos_previstos),
      dados.map((d) => d.he_50_minutos),
      dados.map((d) => d.he_100_minutos),
      dados.map((d) => d.adicional_noturno_minutos),
      dados.map((d) => d.adicional_noturno_relogio_minutos),
      dados.map((d) => d.faltas_minutos),
      dados.map((d) => d.atrasos_minutos),
      dados.map((d) => d.dsr_desconto_minutos),
      dados.map((d) => d.saldo_banco_minutos),
      dados.map((d) => JSON.stringify(d.memoria)),
      dados.map((d) => d.calculada_por),
    ]
  );
  return new Map(
    rows.map((linha) => [paraNumero(linha.colaborador_id), paraNumero(linha.id)])
  );
}

// ================================================================ intercorrência

export interface Intercorrencia {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  data: string;
  tipo: TipoIntercorrencia;
  status: StatusIntercorrencia;
  detalhe: string;
  observacao: string | null;
  corrigida_por: number | null;
  corrigido_em: string | null;
}

interface LinhaIntercorrencia extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  matricula: string;
  data: string;
  tipo: TipoIntercorrencia;
  status: StatusIntercorrencia;
  detalhe: string;
  observacao: string | null;
  corrigida_por: string | null;
  corrigido_em: string | null;
}

const SELECT_INTERCORRENCIA = `
  SELECT i.id, i.colaborador_id, c.nome_completo AS colaborador_nome,
         c.matricula, i.data::text AS data, i.tipo, i.status, i.detalhe,
         i.observacao, i.corrigida_por, i.corrigido_em::text AS corrigido_em
    FROM rh.intercorrencia_ponto i
    JOIN rh.colaborador c ON c.id = i.colaborador_id`;

function paraIntercorrencia(linha: LinhaIntercorrencia): Intercorrencia {
  return {
    id: paraNumero(linha.id),
    colaborador_id: paraNumero(linha.colaborador_id),
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    data: linha.data,
    tipo: linha.tipo,
    status: linha.status,
    detalhe: linha.detalhe,
    observacao: linha.observacao,
    corrigida_por: numeroOuNulo(linha.corrigida_por),
    corrigido_em: linha.corrigido_em,
  };
}

/** O que a reapuração fez com uma linha que já estava aberta. */
export interface IntercorrenciaResolvida {
  id: number;
  data: string;
  tipo: TipoIntercorrencia;
  detalhe: string;
}

/**
 * A mesma reconciliação, para todas as pessoas da rodada em UMA ida. As
 * detectadas viajam como triplas (pessoa, dia, tipo) — antes era um vetor de
 * pares por pessoa; a regra "fecha o que está aberto no período e o motor não
 * acusa mais" é palavra por palavra a mesma.
 */
export async function resolverIntercorrenciasAusentesEmLote(
  cliente: PoolClient,
  colaboradorIds: number[],
  de: string,
  ate: string,
  detectadas: { colaborador_id: number; data: string; tipo: TipoIntercorrencia }[],
  usuarioId: number,
  competencia: string
): Promise<Map<number, IntercorrenciaResolvida[]>> {
  if (colaboradorIds.length === 0) return new Map();
  const { rows } = await cliente.query<{
    colaborador_id: string;
    id: string;
    data: string;
    tipo: TipoIntercorrencia;
    detalhe: string;
  }>(
    `UPDATE rh.intercorrencia_ponto i
        SET status = 'resolvida_por_reapuracao',
            corrigida_por = $4,
            corrigido_em = now(),
            observacao =
              'Reapuração de ' || $5 || ' não acusou mais este fato. Detalhe '
              || 'que a linha carregava: ' || i.detalhe
      WHERE i.colaborador_id = ANY($1::bigint[]) AND i.status = 'aberta'
        AND i.data BETWEEN $2::date AND $3::date
        AND NOT EXISTS (
              SELECT 1 FROM unnest($6::bigint[], $7::date[], $8::text[])
                            AS d(colaborador_id, data, tipo)
               WHERE d.colaborador_id = i.colaborador_id
                 AND d.data = i.data AND d.tipo = i.tipo)
     RETURNING i.colaborador_id, i.id, i.data::text AS data, i.tipo, i.detalhe`,
    [
      colaboradorIds,
      de,
      ate,
      usuarioId,
      competencia,
      detectadas.map((item) => item.colaborador_id),
      detectadas.map((item) => item.data),
      detectadas.map((item) => item.tipo),
    ]
  );
  const porColaborador = new Map<number, IntercorrenciaResolvida[]>();
  for (const linha of rows) {
    const chave = paraNumero(linha.colaborador_id);
    const resolvida: IntercorrenciaResolvida = {
      id: paraNumero(linha.id),
      data: linha.data,
      tipo: linha.tipo,
      detalhe: linha.detalhe,
    };
    const lista = porColaborador.get(chave);
    if (lista) lista.push(resolvida);
    else porColaborador.set(chave, [resolvida]);
  }
  return porColaborador;
}

/** Desfecho da detecção, para a trilha da apuração saber o que houve. */
export type DesfechoDeteccao = "nova" | "continua" | "reaberta" | "tratada";

/**
 * Teto de linhas que a fila devolve de uma vez. NÃO é regra de negócio (não
 * decide minuto, dinheiro nem prazo): é o tamanho da página, para uma tela não
 * tentar desenhar a base inteira. Por isso mora aqui e não em tabela — mas o
 * número CHEGA a quem lê, junto do total real, porque o defeito não era o teto:
 * era ele ser secreto.
 */
export const LIMITE_FILA_INTERCORRENCIAS = 500;

export interface FilaIntercorrencias {
  itens: Intercorrencia[];
  /** Quantas linhas atendem ao filtro, ignorando o limite da página. */
  total: number;
  limite: number;
  /** Data da linha mais antiga do filtro — a que a ordenação DESC deixa por último. */
  mais_antiga: string | null;
}

/**
 * A fila cortava em 500 linhas EM SILÊNCIO e devolvia um array pelado: a tela
 * escrevia "Intercorrências abertas (500)" tomando o tamanho da lista já
 * cortada como se fosse o total, e as excedentes — por vir `ORDER BY data DESC`,
 * justamente as MAIS ANTIGAS, as que estão vencendo — não apareciam para
 * ninguém. Agora o total real e a data mais antiga do filtro vêm junto, e quem
 * desenha a tela tem como dizer o que está faltando.
 */
/** O que a detecção em lote precisa devolver: o desfecho de cada tripla. */
export interface DeteccaoIntercorrencia {
  colaborador_id: number;
  data: string;
  tipo: TipoIntercorrencia;
  detalhe: string;
}

/**
 * Grava o que o motor detectou, todas as detecções da rodada em UMA ida.
 *
 * Quando já existe linha para (pessoa, dia, tipo), quem decide o desfecho é o
 * STATUS dela:
 *   aberta               → o fato continua: a MESMA linha fica, com o detalhe
 *                          atualizado (o número do dia muda quando a marcação
 *                          muda). O id não troca — era o DELETE + INSERT que
 *                          trocava, e a fila na tela do DP envelhecia junto.
 *   corrigida            → alguém afirmou que o fato tinha sumido e ele está
 *                          aqui de novo: REABRE com o detalhe novo, sem o
 *                          carimbo de quem fechou. Sem isto a linha tratada
 *                          bloquearia a redetecção para sempre (DO NOTHING) e
 *                          o fato ficaria fora da fila de vez.
 *   resolvida_por_reapuracao → mesma coisa, com o carimbo da máquina: uma
 *                          reapuração anterior não achou o fato e esta achou.
 *   justificada/ignorada → o fato continua real e alguém já respondeu por ele
 *                          por escrito; reabrir faria a fila renascer inteira
 *                          a cada apuração.
 *
 * O CTE `anterior` lê o status ANTES do INSERT (snapshot da consulta), que é a
 * única forma de distinguir "já estava aberta" de "foi reaberta" — na cláusula
 * DO UPDATE o alias `i` já enxerga a linha nova.
 *
 * Quem chama deve entregar a lista já sem repetição de (pessoa, dia, tipo): num
 * comando só, o ON CONFLICT não pode tocar a mesma linha duas vezes. Repetição
 * aqui não existe na prática (o motor não acusa o mesmo fato duas vezes no mesmo
 * dia), mas quem monta a lista deduplica mesmo assim — ver o serviço.
 */
export async function inserirIntercorrenciasEmLote(
  cliente: PoolClient,
  deteccoes: DeteccaoIntercorrencia[]
): Promise<Map<string, DesfechoDeteccao>> {
  if (deteccoes.length === 0) return new Map();
  const { rows } = await cliente.query<{
    colaborador_id: string;
    data: string;
    tipo: TipoIntercorrencia;
    antes: StatusIntercorrencia | null;
  }>(
    `WITH entrada AS (
       SELECT * FROM unnest($1::bigint[], $2::date[], $3::text[], $4::text[])
                    AS e(colaborador_id, data, tipo, detalhe)
     ),
     anterior AS (
       SELECT e.colaborador_id, e.data, e.tipo, i.status
         FROM entrada e
         LEFT JOIN rh.intercorrencia_ponto i
           ON i.colaborador_id = e.colaborador_id
          AND i.data = e.data AND i.tipo = e.tipo
     ),
     gravado AS (
       INSERT INTO rh.intercorrencia_ponto AS i
         (colaborador_id, data, tipo, detalhe)
       SELECT colaborador_id, data, tipo, detalhe FROM entrada
       ON CONFLICT (colaborador_id, data, tipo) DO UPDATE
          SET status = 'aberta', detalhe = EXCLUDED.detalhe,
              corrigida_por = NULL, corrigido_em = NULL, observacao = NULL
        WHERE i.status IN ('aberta','corrigida','resolvida_por_reapuracao')
       RETURNING i.colaborador_id, i.data, i.tipo
     )
     SELECT g.colaborador_id, g.data::text AS data, g.tipo, a.status AS antes
       FROM gravado g
       JOIN anterior a
         ON a.colaborador_id = g.colaborador_id
        AND a.data = g.data AND a.tipo = g.tipo`,
    [
      deteccoes.map((d) => d.colaborador_id),
      deteccoes.map((d) => d.data),
      deteccoes.map((d) => d.tipo),
      deteccoes.map((d) => d.detalhe),
    ]
  );
  // Quem não voltou bateu no WHERE do ON CONFLICT: já existe e está justificada
  // ou ignorada — alguém respondeu por escrito e ninguém mexe.
  const desfechos = new Map<string, DesfechoDeteccao>();
  for (const deteccao of deteccoes) {
    desfechos.set(
      `${deteccao.colaborador_id}|${deteccao.data}|${deteccao.tipo}`,
      "tratada"
    );
  }
  for (const linha of rows) {
    const chave = `${paraNumero(linha.colaborador_id)}|${linha.data}|${linha.tipo}`;
    desfechos.set(
      chave,
      linha.antes === null
        ? "nova"
        : linha.antes === "aberta"
          ? "continua"
          : "reaberta"
    );
  }
  return desfechos;
}

export async function listarIntercorrencias(filtros: {
  colaboradorId?: number | null;
  status?: StatusIntercorrencia | null;
  de?: string | null;
  ate?: string | null;
  colaboradoresPermitidos?: number[] | null;
}): Promise<FilaIntercorrencias> {
  const condicoes: string[] = [];
  const parametros: unknown[] = [];
  const adicionar = (sql: string, valor: unknown): void => {
    parametros.push(valor);
    condicoes.push(sql.replace("$?", `$${parametros.length}`));
  };
  if (filtros.colaboradorId) adicionar("i.colaborador_id = $?", filtros.colaboradorId);
  if (filtros.status) adicionar("i.status = $?", filtros.status);
  if (filtros.de) adicionar("i.data >= $?::date", filtros.de);
  if (filtros.ate) adicionar("i.data <= $?::date", filtros.ate);
  if (filtros.colaboradoresPermitidos) {
    adicionar("i.colaborador_id = ANY($?::bigint[])", filtros.colaboradoresPermitidos);
  }
  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const [linhas, resumo] = await Promise.all([
    consultar<LinhaIntercorrencia>(
      `${SELECT_INTERCORRENCIA} ${onde} ORDER BY i.data DESC, c.nome_completo ` +
        `LIMIT ${LIMITE_FILA_INTERCORRENCIAS}`,
      parametros
    ),
    consultar<{ total: string; mais_antiga: string | null }>(
      `SELECT count(*) AS total, min(i.data)::text AS mais_antiga
         FROM rh.intercorrencia_ponto i
         JOIN rh.colaborador c ON c.id = i.colaborador_id ${onde}`,
      parametros
    ),
  ]);
  return {
    itens: linhas.map(paraIntercorrencia),
    total: paraNumero(resumo[0].total),
    limite: LIMITE_FILA_INTERCORRENCIAS,
    mais_antiga: resumo[0].mais_antiga,
  };
}

export async function buscarIntercorrencia(
  cliente: PoolClient,
  id: number
): Promise<Intercorrencia | null> {
  const { rows } = await cliente.query<LinhaIntercorrencia>(
    `${SELECT_INTERCORRENCIA} WHERE i.id = $1 FOR UPDATE OF i`,
    [id]
  );
  return rows[0] ? paraIntercorrencia(rows[0]) : null;
}

export async function tratarIntercorrencia(
  cliente: PoolClient,
  id: number,
  status: StatusIntercorrencia,
  observacao: string | null,
  usuarioId: number
): Promise<void> {
  await cliente.query(
    `UPDATE rh.intercorrencia_ponto
        SET status = $2, observacao = $3, corrigida_por = $4, corrigido_em = now()
      WHERE id = $1`,
    [id, status, observacao, usuarioId]
  );
}

export async function contarIntercorrenciasAbertas(
  colaboradorIds: number[]
): Promise<Map<number, number>> {
  if (colaboradorIds.length === 0) return new Map();
  const linhas = await consultar<{ colaborador_id: string; total: string }>(
    `SELECT colaborador_id, COUNT(*) AS total
       FROM rh.intercorrencia_ponto
      WHERE status = 'aberta' AND colaborador_id = ANY($1::bigint[])
      GROUP BY colaborador_id`,
    [colaboradorIds]
  );
  return new Map(
    linhas.map((linha) => [paraNumero(linha.colaborador_id), paraNumero(linha.total)])
  );
}

// ================================================================ banco de horas

export interface MovimentoBancoRegistro {
  id: number;
  colaborador_id: number;
  data: string;
  minutos: number;
  origem: OrigemMovimentoBanco;
  apuracao_id: number | null;
  observacao: string;
  registrado_em: string;
}

interface LinhaMovimento extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  data: string;
  minutos: number;
  origem: OrigemMovimentoBanco;
  apuracao_id: string | null;
  observacao: string;
  registrado_em: string;
}

export async function inserirMovimentoBanco(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    data: string;
    minutos: number;
    origem: OrigemMovimentoBanco;
    apuracao_id: number | null;
    observacao: string;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.banco_horas_movimento
       (colaborador_id, data, minutos, origem, apuracao_id, observacao, registrado_por)
     VALUES ($1,$2::date,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.data,
      dados.minutos,
      dados.origem,
      dados.apuracao_id,
      dados.observacao,
      dados.registrado_por,
    ]
  );
  return paraNumero(rows[0].id);
}

/** SALDO É A SOMA — não existe campo de saldo em lugar nenhum. */
export interface DadosMovimentoBanco {
  colaborador_id: number;
  data: string;
  minutos: number;
  origem: OrigemMovimentoBanco;
  apuracao_id: number | null;
  observacao: string;
  registrado_por: number;
}

/**
 * Os mesmos lançamentos, em UMA ida. O livro é append-only e a ORDEM importa: o
 * estorno da apuração anterior tem de ficar ANTES do crédito novo na leitura do
 * extrato. Por isso o `WITH ORDINALITY ... ORDER BY ordem` — os ids saem na ordem
 * do vetor que quem chama montou, não na ordem que o planejador achar.
 */
export async function inserirMovimentosBancoEmLote(
  cliente: PoolClient,
  movimentos: DadosMovimentoBanco[]
): Promise<void> {
  if (movimentos.length === 0) return;
  await cliente.query(
    `INSERT INTO rh.banco_horas_movimento
       (colaborador_id, data, minutos, origem, apuracao_id, observacao,
        registrado_por)
     SELECT t.colaborador_id, t.data, t.minutos, t.origem, t.apuracao_id,
            t.observacao, t.registrado_por
       FROM unnest($1::bigint[], $2::date[], $3::int[], $4::text[], $5::bigint[],
                   $6::text[], $7::bigint[])
            WITH ORDINALITY
            AS t(colaborador_id, data, minutos, origem, apuracao_id, observacao,
                 registrado_por, ordem)
      ORDER BY t.ordem`,
    [
      movimentos.map((m) => m.colaborador_id),
      movimentos.map((m) => m.data),
      movimentos.map((m) => m.minutos),
      movimentos.map((m) => m.origem),
      movimentos.map((m) => m.apuracao_id),
      movimentos.map((m) => m.observacao),
      movimentos.map((m) => m.registrado_por),
    ]
  );
}

export async function saldoBanco(
  colaboradorId: number,
  cliente?: PoolClient
): Promise<number> {
  // Com cliente, a leitura mora na transação do lançamento (atrás do advisory
  // lock, enxerga o saldo já commitado pela concorrência); sem cliente, é a
  // leitura avulsa de sempre pelo pool.
  const sql = `SELECT COALESCE(SUM(minutos), 0)::bigint AS saldo
       FROM rh.banco_horas_movimento WHERE colaborador_id = $1`;
  const linhas = cliente
    ? (await cliente.query<{ saldo: string | null }>(sql, [colaboradorId])).rows
    : await consultar<{ saldo: string | null }>(sql, [colaboradorId]);
  return paraNumero(linhas[0]?.saldo ?? 0);
}

/**
 * Trava o banco de horas de UM colaborador na transação (advisory lock por
 * xact). Serializa lançamentos concorrentes do mesmo colaborador para que a
 * conferência de teto/piso não seja furada por leitura-antes-de-gravar — o
 * saldo é a SOMA dos movimentos, sem CHECK no banco. Mesma técnica de
 * travarApuracoes: hashtext nos dois argumentos.
 */
export async function travarBancoDoColaborador(
  cliente: PoolClient,
  colaboradorId: number
): Promise<void> {
  await cliente.query(
    `SELECT pg_advisory_xact_lock(
              hashtext('rh.banco_horas_movimento'),
              hashtext($1::text))`,
    [colaboradorId]
  );
}

export async function saldosBanco(
  colaboradorIds: number[]
): Promise<Map<number, number>> {
  if (colaboradorIds.length === 0) return new Map();
  const linhas = await consultar<{ colaborador_id: string; saldo: string }>(
    `SELECT colaborador_id, COALESCE(SUM(minutos), 0)::bigint AS saldo
       FROM rh.banco_horas_movimento
      WHERE colaborador_id = ANY($1::bigint[])
      GROUP BY colaborador_id`,
    [colaboradorIds]
  );
  return new Map(
    linhas.map((linha) => [paraNumero(linha.colaborador_id), paraNumero(linha.saldo)])
  );
}

export async function listarMovimentosBanco(
  colaboradorId: number,
  limite = 200
): Promise<MovimentoBancoRegistro[]> {
  const linhas = await consultar<LinhaMovimento>(
    `SELECT id, colaborador_id, data::text AS data, minutos, origem, apuracao_id,
            observacao, registrado_em::text AS registrado_em
       FROM rh.banco_horas_movimento
      WHERE colaborador_id = $1
      ORDER BY data DESC, id DESC
      LIMIT $2`,
    [colaboradorId, limite]
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    colaborador_id: paraNumero(linha.colaborador_id),
    data: linha.data,
    minutos: linha.minutos,
    origem: linha.origem,
    apuracao_id: numeroOuNulo(linha.apuracao_id),
    observacao: linha.observacao,
    registrado_em: linha.registrado_em,
  }));
}

/**
 * TODOS os movimentos da pessoa na ordem em que entraram — é a leitura da
 * expiração FIFO, que precisa saber qual crédito ainda está de pé e desde
 * quando. Sem limite de linhas de propósito: cortar o começo do livro faria o
 * crédito mais antigo (justamente o que vence primeiro) desaparecer da conta.
 */
export async function movimentosBancoEmOrdem(
  cliente: PoolClient | null,
  colaboradorIds: number[]
): Promise<Map<number, { data: string; minutos: number }[]>> {
  if (colaboradorIds.length === 0) return new Map();
  const sql = `SELECT colaborador_id, data::text AS data, minutos
                 FROM rh.banco_horas_movimento
                WHERE colaborador_id = ANY($1::bigint[])
                ORDER BY colaborador_id, data, id`;
  type Linha = { colaborador_id: string; data: string; minutos: number };
  const linhas = cliente
    ? (await cliente.query<Linha>(sql, [colaboradorIds])).rows
    : await consultar<Linha>(sql, [colaboradorIds]);
  const porPessoa = new Map<number, { data: string; minutos: number }[]>();
  for (const linha of linhas) {
    const id = paraNumero(linha.colaborador_id);
    const lista = porPessoa.get(id) ?? [];
    lista.push({ data: linha.data, minutos: linha.minutos });
    porPessoa.set(id, lista);
  }
  return porPessoa;
}

/**
 * `resolverRegraBanco` EM LOTE, para (pessoa, data) aos pares.
 *
 * A resolução em três níveis é cara (duas subconsultas de vigência por linha) e
 * a expiração precisa dela uma vez por DATA DE CRÉDITO de cada pessoa: uma
 * chamada por par levava a prévia da tela a 40 segundos com 61 pessoas. Mesmo
 * critério de desempate da versão individual — nível mais específico primeiro,
 * depois a vigência mais recente —, agora em uma consulta só.
 */
export async function resolverRegrasBancoEmLote(
  pares: { colaborador_id: number; data: string }[]
): Promise<Map<string, RegraBanco>> {
  if (pares.length === 0) return new Map();
  const linhas = await consultar<LinhaRegra & { alvo_id: string; alvo_data: string }>(
    `WITH alvo AS (
       SELECT DISTINCT colaborador_id, data
         FROM unnest($1::bigint[], $2::date[]) AS t(colaborador_id, data)
     ),
     contexto AS (
       SELECT a.colaborador_id AS alvo_id, a.data AS alvo_data,
         (SELECT l.estabelecimento_id FROM rh.lotacao l
           WHERE l.colaborador_id = a.colaborador_id AND l.inicio_vigencia <= a.data
             AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= a.data)
           ORDER BY l.inicio_vigencia DESC LIMIT 1) AS estabelecimento_id,
         (SELECT cv.cargo_id FROM rh.posicao_colaborador p
             JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
           WHERE p.colaborador_id = a.colaborador_id AND p.inicio_vigencia <= a.data
             AND (p.fim_vigencia IS NULL OR p.fim_vigencia >= a.data)
           ORDER BY p.inicio_vigencia DESC LIMIT 1) AS cargo_id
         FROM alvo a
     )
     SELECT DISTINCT ON (c.alvo_id, c.alvo_data)
            c.alvo_id::text AS alvo_id, c.alvo_data::text AS alvo_data,
            ${COLUNAS_REGRA}
       FROM contexto c
       JOIN rh.regra_banco_horas_versao r
         ON r.status IN ('ativa','encerrada')
        AND r.inicio_vigencia <= c.alvo_data
        AND (r.fim_vigencia IS NULL OR r.fim_vigencia >= c.alvo_data)
        AND (
          r.colaborador_id = c.alvo_id
          OR (r.cargo_id IS NOT NULL AND r.cargo_id = c.cargo_id)
          OR (r.estabelecimento_id IS NOT NULL
              AND r.estabelecimento_id = c.estabelecimento_id)
          OR (r.colaborador_id IS NULL AND r.cargo_id IS NULL
              AND r.estabelecimento_id IS NULL)
        )
      ORDER BY c.alvo_id, c.alvo_data, ${NIVEL_REGRA} DESC, r.inicio_vigencia DESC`,
    [pares.map((par) => par.colaborador_id), pares.map((par) => par.data)]
  );
  return new Map(
    linhas.map((linha) => [
      `${linha.alvo_id}:${linha.alvo_data}`,
      paraRegra(linha),
    ])
  );
}

/** Quem tem saldo POSITIVO hoje — os únicos candidatos à expiração. */
export async function colaboradoresComSaldoPositivo(): Promise<
  { id: number; nome_completo: string; matricula: string; saldo: number }[]
> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
    saldo: string;
  }>(
    `SELECT c.id, c.nome_completo, c.matricula, SUM(m.minutos)::bigint AS saldo
       FROM rh.banco_horas_movimento m
       JOIN rh.colaborador c ON c.id = m.colaborador_id
      GROUP BY c.id, c.nome_completo, c.matricula
     HAVING SUM(m.minutos) > 0
      ORDER BY c.nome_completo`
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
    saldo: paraNumero(linha.saldo),
  }));
}

// ================================================================ colaboradores e alcance

export interface ColaboradorPonto {
  id: number;
  nome_completo: string;
  matricula: string;
}

/**
 * Quem está na rodada de uma competência: VÍNCULO VIVO em algum dia da janela,
 * com escala que cobre algum dia dela. Não é "quem está de pé hoje".
 *
 * O que muda, e por que é caro: aqui havia `c.status <> 'desligado'`, bandeira
 * de HOJE decidindo um mês que já passou. Quem era desligado no dia 20 não
 * gerava apuração NENHUMA — o mês final não virava hora extra, nem adicional
 * noturno, nem DSR, e a folha importava um mês que o ponto nunca apurou. E
 * reapurar uma competência antiga depois de qualquer desligamento apagava a
 * pessoa do próprio mês em que ela trabalhou. Medido na bancada sobre 07/2026,
 * com uma desligada em 20/07 e outra em 01/08: 60 alvos contra os 62 corretos.
 *
 * A régua do vínculo é a da transferência entre CNPJs (migração 0048): o
 * vínculo velho tem `data_desligamento = D` e o novo nasce em D, então quem
 * vale para a janela é `data_desligamento > desde` — `>=` contaria a pessoa
 * duas vezes no dia da virada.
 *
 * A JANELA, e por que ela tem padrão: os três chamadores passam o ÚLTIMO DIA de
 * uma competência, e a pergunta do DP é sempre "quem trabalhou este mês". Sem
 * `desde` a janela é o mês civil de `ate`, resolvido pelo próprio Postgres
 * (`date_trunc`) sobre uma coluna `date` — aritmética de calendário, sem
 * relógio e sem fuso no meio. Quem precisar de outra janela (uma quinzena, um
 * período de rescisão) passa `desde` explicitamente.
 *
 * QUEM SOBRA DA JANELA CONTINUA APARECENDO PELO NOME: o desligado que entra
 * aqui é reconferido dentro da transação por `conferirCadastroParaApuracao` e
 * sai em `avisos_cadastro` com nome e matrícula. O que ainda é só CONTAGEM é o
 * `sem_escala` do serviço — está no relatório da frente como pedido.
 */
export async function listarColaboradoresComEscala(
  ate: string,
  desde?: string
): Promise<ColaboradorPonto[]> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    `WITH janela AS (
       SELECT $1::date AS ate,
              COALESCE($2::date, date_trunc('month', $1::date)::date) AS desde
     )
     SELECT DISTINCT c.id, c.nome_completo, c.matricula
       FROM rh.colaborador c
       JOIN rh.escala_colaborador e ON e.colaborador_id = c.id
      CROSS JOIN janela j
      WHERE c.data_admissao <= j.ate
        AND (c.data_desligamento IS NULL OR c.data_desligamento > j.desde)
        AND e.inicio_vigencia <= j.ate
        AND (e.fim_vigencia IS NULL OR e.fim_vigencia >= j.desde)
      ORDER BY c.nome_completo`,
    [ate, desde ?? null]
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
  }));
}

/**
 * O cadastro de quem está na rodada, relido DENTRO da transação de gravação.
 *
 * Existe porque a apuração da competência lê o cadastro no começo (FASE 1) e só
 * grava ~50 s depois (FASE 3): nesse intervalo alguém pode desligar, encerrar a
 * escala ou APAGAR uma das pessoas. Quando a pessoa some, o INSERT da apuração
 * bate na FK `apuracao_ponto_colaborador_id_fkey` e a competência inteira caía
 * com "Erro interno do servidor", sem dizer de quem era a culpa.
 *
 * O `FOR KEY SHARE OF c` é a outra metade da defesa, e é de propósito que seja
 * KEY SHARE e não UPDATE: ele conflita com DELETE e com a troca da chave (o que
 * queremos travar — ninguém apaga uma pessoa no meio da apuração dela), e NÃO
 * conflita com o UPDATE comum de colunas não-chave (nome, status, retrato), que
 * o RH pode continuar fazendo enquanto o DP apura. A trava vale só pelo tempo da
 * FASE 3, não pelos ~50 s da rodada inteira.
 *
 * Devolve mapa por id — quem não vier no mapa não existe mais.
 */
export interface CadastroNaApuracao {
  id: number;
  nome_completo: string;
  matricula: string;
  status: string;
  tem_escala_vigente: boolean;
}

export async function conferirCadastroParaApuracao(
  cliente: PoolClient,
  colaboradorIds: number[],
  dataReferencia: string
): Promise<Map<number, CadastroNaApuracao>> {
  if (colaboradorIds.length === 0) return new Map();
  const { rows } = await cliente.query<{
    id: string;
    nome_completo: string;
    matricula: string;
    status: string;
    tem_escala_vigente: boolean;
  }>(
    `SELECT c.id, c.nome_completo, c.matricula, c.status,
            EXISTS (SELECT 1
                      FROM rh.escala_colaborador e
                     WHERE e.colaborador_id = c.id
                       AND e.inicio_vigencia <= $2::date
                       AND (e.fim_vigencia IS NULL OR e.fim_vigencia >= $2::date)
                   ) AS tem_escala_vigente
       FROM rh.colaborador c
      WHERE c.id = ANY($1::bigint[])
      ORDER BY c.id
        FOR KEY SHARE OF c`,
    [colaboradorIds, dataReferencia]
  );
  return new Map(
    rows.map((linha) => [
      paraNumero(linha.id),
      {
        id: paraNumero(linha.id),
        nome_completo: linha.nome_completo,
        matricula: linha.matricula,
        status: linha.status,
        tem_escala_vigente: linha.tem_escala_vigente,
      },
    ])
  );
}

/**
 * Quais destes ids NÃO existem mais em rh.colaborador. Roda pelo pool, fora de
 * qualquer transação, porque quem chama é o tratamento de erro DEPOIS de um
 * ROLLBACK — dentro do cliente abortado nenhuma consulta responderia.
 */
export async function colaboradoresInexistentes(
  colaboradorIds: number[]
): Promise<number[]> {
  if (colaboradorIds.length === 0) return [];
  const linhas = await consultar<{ id: string }>(
    `SELECT alvo.id
       FROM unnest($1::bigint[]) AS alvo(id)
      WHERE NOT EXISTS (SELECT 1 FROM rh.colaborador c WHERE c.id = alvo.id)`,
    [colaboradorIds]
  );
  return linhas.map((linha) => paraNumero(linha.id));
}

/**
 * TODOS os vínculos de quem está logado, do mais novo ao mais antigo.
 *
 * `rh.vinculo_atual` responde "em qual contrato eu AJO hoje" — é o certo para
 * bater ponto, pedir férias, aderir a benefício. Para LER a própria história a
 * pergunta é outra e o alcance é a PESSOA: o espelho e o banco de horas do
 * contrato anterior no mesmo grupo continuam sendo do mesmo trabalhador, e
 * negá-los a ele era negar o direito da Portaria 671 art. 79 justo a quem o
 * artigo protege — ainda por cima logo depois de o sistema anotar, no evento da
 * transferência, que o saldo "foi preservado para o acerto".
 */
export async function vinculosDoUsuario(usuarioId: number): Promise<number[]> {
  const linhas = await consultar<{ id: string }>(
    `SELECT c.id
       FROM rh.colaborador c
      WHERE c.pessoa_id = rh.pessoa_do_usuario($1)
      ORDER BY c.data_admissao DESC, c.id DESC`,
    [usuarioId]
  );
  return linhas.map((linha) => paraNumero(linha.id));
}

export async function colaboradorDoUsuario(
  usuarioId: number
): Promise<ColaboradorPonto | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    `SELECT id, nome_completo, matricula FROM rh.colaborador
      WHERE id = rh.vinculo_atual($1)`,
    [usuarioId]
  );
  return linhas[0]
    ? {
        id: paraNumero(linhas[0].id),
        nome_completo: linhas[0].nome_completo,
        matricula: linhas[0].matricula,
      }
    : null;
}

/** Alcance do gestor vem da relação vigente, NUNCA do papel do login. */
export async function liderados(
  gestorColaboradorId: number
): Promise<ColaboradorPonto[]> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    `SELECT c.id, c.nome_completo, c.matricula
       FROM rh.relacao_gestor r
       JOIN rh.colaborador c ON c.id = r.liderado_colaborador_id
      WHERE r.gestor_colaborador_id = $1 AND r.fim_vigencia IS NULL
        AND c.status <> 'desligado'
      ORDER BY c.nome_completo`,
    [gestorColaboradorId]
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
  }));
}

// ================================================================ resumo para outros módulos

export interface UltimaApuracaoResumo {
  ano: number;
  mes: number;
  total_he_minutos: number;
  dias_uteis: number;
  saldo_competencia_minutos: number;
  calculada_em: string;
}

interface LinhaResumo extends Record<string, unknown> {
  colaborador_id: string;
  ano: number;
  mes: number;
  total_he_minutos: string;
  dias_uteis: string | null;
  saldo_competencia_minutos: number;
  calculada_em: string;
}

/**
 * Última apuração de cada pessoa. `dias_uteis` sai da memória de cálculo
 * (memoria.resumo.dias_uteis), gravada pelo serviço no momento da apuração —
 * é o denominador da MÉDIA DE HORA EXTRA POR DIA que a diretoria pediu.
 */
export async function ultimasApuracoes(
  colaboradorIds: number[]
): Promise<Map<number, UltimaApuracaoResumo>> {
  if (colaboradorIds.length === 0) return new Map();
  const linhas = await consultar<LinhaResumo>(
    `SELECT DISTINCT ON (a.colaborador_id)
            a.colaborador_id, a.ano, a.mes,
            (a.he_50_minutos + a.he_100_minutos)::bigint AS total_he_minutos,
            (a.memoria -> 'resumo' ->> 'dias_uteis') AS dias_uteis,
            a.saldo_banco_minutos AS saldo_competencia_minutos,
            a.calculada_em::text AS calculada_em
       FROM rh.apuracao_ponto a
      WHERE a.colaborador_id = ANY($1::bigint[])
      ORDER BY a.colaborador_id, a.ano DESC, a.mes DESC`,
    [colaboradorIds]
  );
  return new Map(
    linhas.map((linha) => [
      paraNumero(linha.colaborador_id),
      {
        ano: linha.ano,
        mes: linha.mes,
        total_he_minutos: paraNumero(linha.total_he_minutos),
        dias_uteis: linha.dias_uteis === null ? 0 : paraNumero(linha.dias_uteis),
        saldo_competencia_minutos: linha.saldo_competencia_minutos,
        calculada_em: linha.calculada_em,
      },
    ])
  );
}

// ================================================================ leituras da etapa 2 (API e telas)
// Consultas de LISTA que só a camada de tela precisa. Nenhuma delas devolve a
// memória de cálculo (JSONB grande): o espelho de UMA pessoa busca a memória;
// a lista da competência mostra só os totais.

export interface CompetenciaApurada {
  ano: number;
  mes: number;
  pessoas: number;
  he_minutos: number;
  saldo_minutos: number;
  ultima_apuracao_em: string;
}

/** Competências que já têm apuração — do mais recente para o mais antigo. */
export async function listarCompetenciasApuradas(): Promise<
  CompetenciaApurada[]
> {
  const linhas = await consultar<{
    ano: number;
    mes: number;
    pessoas: string;
    he_minutos: string;
    saldo_minutos: string;
    ultima_apuracao_em: string;
  }>(
    `SELECT a.ano, a.mes,
            COUNT(*)::bigint AS pessoas,
            COALESCE(SUM(a.he_50_minutos + a.he_100_minutos), 0)::bigint AS he_minutos,
            COALESCE(SUM(a.saldo_banco_minutos), 0)::bigint AS saldo_minutos,
            MAX(a.calculada_em)::text AS ultima_apuracao_em
       FROM rh.apuracao_ponto a
      GROUP BY a.ano, a.mes
      ORDER BY a.ano DESC, a.mes DESC
      LIMIT 36`
  );
  return linhas.map((linha) => ({
    ano: linha.ano,
    mes: linha.mes,
    pessoas: paraNumero(linha.pessoas),
    he_minutos: paraNumero(linha.he_minutos),
    saldo_minutos: paraNumero(linha.saldo_minutos),
    ultima_apuracao_em: linha.ultima_apuracao_em,
  }));
}

export interface LinhaApuracaoDaCompetencia {
  apuracao_id: number;
  colaborador_id: number;
  nome: string;
  matricula: string;
  minutos_trabalhados: number;
  minutos_previstos: number;
  he_50_minutos: number;
  he_100_minutos: number;
  adicional_noturno_minutos: number;
  adicional_noturno_relogio_minutos: number;
  faltas_minutos: number;
  atrasos_minutos: number;
  dsr_desconto_minutos: number;
  saldo_banco_minutos: number;
  intercorrencias_abertas: number;
  calculada_em: string;
}

/** A tabela da competência na tela do DP: totais por pessoa, sem memória. */
export async function listarApuracoesComNome(
  ano: number,
  mes: number
): Promise<LinhaApuracaoDaCompetencia[]> {
  const linhas = await consultar<{
    apuracao_id: string;
    colaborador_id: string;
    nome: string;
    matricula: string;
    minutos_trabalhados: number;
    minutos_previstos: number;
    he_50_minutos: number;
    he_100_minutos: number;
    adicional_noturno_minutos: number;
    adicional_noturno_relogio_minutos: number;
    faltas_minutos: number;
    atrasos_minutos: number;
    dsr_desconto_minutos: number;
    saldo_banco_minutos: number;
    intercorrencias_abertas: string;
    calculada_em: string;
  }>(
    `SELECT a.id AS apuracao_id, a.colaborador_id,
            c.nome_completo AS nome, c.matricula,
            a.minutos_trabalhados, a.minutos_previstos,
            a.he_50_minutos, a.he_100_minutos, a.adicional_noturno_minutos,
            a.adicional_noturno_relogio_minutos,
            a.faltas_minutos, a.atrasos_minutos, a.dsr_desconto_minutos,
            a.saldo_banco_minutos,
            (SELECT COUNT(*) FROM rh.intercorrencia_ponto i
              WHERE i.colaborador_id = a.colaborador_id
                AND i.status = 'aberta'
                AND date_part('year', i.data) = a.ano
                AND date_part('month', i.data) = a.mes)::bigint
              AS intercorrencias_abertas,
            a.calculada_em::text AS calculada_em
       FROM rh.apuracao_ponto a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
      WHERE a.ano = $1 AND a.mes = $2
      ORDER BY c.nome_completo`,
    [ano, mes]
  );
  return linhas.map((linha) => ({
    apuracao_id: paraNumero(linha.apuracao_id),
    colaborador_id: paraNumero(linha.colaborador_id),
    nome: linha.nome,
    matricula: linha.matricula,
    minutos_trabalhados: linha.minutos_trabalhados,
    minutos_previstos: linha.minutos_previstos,
    he_50_minutos: linha.he_50_minutos,
    he_100_minutos: linha.he_100_minutos,
    adicional_noturno_minutos: linha.adicional_noturno_minutos,
    adicional_noturno_relogio_minutos:
      linha.adicional_noturno_relogio_minutos,
    faltas_minutos: linha.faltas_minutos,
    atrasos_minutos: linha.atrasos_minutos,
    dsr_desconto_minutos: linha.dsr_desconto_minutos,
    saldo_banco_minutos: linha.saldo_banco_minutos,
    intercorrencias_abertas: paraNumero(linha.intercorrencias_abertas),
    calculada_em: linha.calculada_em,
  }));
}

/** Todo mundo que pode receber escala — inclusive quem ainda não tem uma. */
export async function listarColaboradoresAtivos(): Promise<ColaboradorPonto[]> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    `SELECT id, nome_completo, matricula
       FROM rh.colaborador
      WHERE status <> 'desligado'
      ORDER BY nome_completo`
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
  }));
}

/** Cargos ativos — escopo nível 2 da regra de banco de horas. */
export async function listarCargosParaRegra(): Promise<
  { id: number; nome: string }[]
> {
  const linhas = await consultar<{ id: string; nome: string }>(
    `SELECT DISTINCT ON (v.cargo_id) v.cargo_id AS id, v.nome
       FROM rh.cargo_versao v
      WHERE v.status = 'ativa'
      ORDER BY v.cargo_id, v.inicio_vigencia DESC`
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    nome: linha.nome,
  }));
}

/**
 * Unidades — escopo nível 1 da regra de banco de horas e do feriado local.
 * Só as ATIVAS: o local inativado sai da oferta de regra nova, do mesmo jeito
 * que sai dos demais seletores. Regra já gravada num local inativado continua
 * valendo e continua aparecendo — o que some é a oferta, não o passado.
 */
export async function listarEstabelecimentosParaRegra(): Promise<
  { id: number; nome: string }[]
> {
  const linhas = await consultar<{ id: string; nome: string }>(
    `SELECT e.id, v.unidade AS nome
       FROM rh.estabelecimento e
       JOIN rh.estabelecimento_versao v
         ON v.estabelecimento_id = e.id AND v.status = 'ativa'
      WHERE e.inativado_em IS NULL
      ORDER BY v.unidade`
  );
  return linhas.map((linha) => ({
    id: paraNumero(linha.id),
    nome: linha.nome,
  }));
}

// ---------------------------------------------------------------- indicadores
// Agregados puros para a Central de Metas: contagens e somas, jamais o ponto
// de uma pessoa identificada.

/** HE e horas trabalhadas somadas nas apurações dos últimos 12 meses. */
export async function agregadoHorasExtras12Meses(): Promise<{
  he_minutos: number;
  trabalhado_minutos: number;
}> {
  const linhas = await consultar<{
    he_minutos: string;
    trabalhado_minutos: string;
  }>(
    `SELECT COALESCE(SUM(a.he_50_minutos + a.he_100_minutos), 0)::bigint AS he_minutos,
            COALESCE(SUM(a.minutos_trabalhados), 0)::bigint AS trabalhado_minutos
       FROM rh.apuracao_ponto a
      WHERE make_date(a.ano, a.mes, 1)
            >= date_trunc('month', (now() AT TIME ZONE '${FUSO}')::date) - INTERVAL '11 months'`
  );
  return {
    he_minutos: paraNumero(linhas[0]?.he_minutos ?? 0),
    trabalhado_minutos: paraNumero(linhas[0]?.trabalhado_minutos ?? 0),
  };
}

/** Passivo acumulado: soma do banco de horas de quem ainda está na casa. */
export async function saldoTotalBancoHorasAtivos(): Promise<{
  saldo_minutos: number;
  pessoas_com_saldo: number;
}> {
  const linhas = await consultar<{
    saldo_minutos: string;
    pessoas_com_saldo: string;
  }>(
    `SELECT COALESCE(SUM(t.saldo), 0)::bigint AS saldo_minutos,
            COUNT(*) FILTER (WHERE t.saldo <> 0)::bigint AS pessoas_com_saldo
       FROM (SELECT m.colaborador_id, SUM(m.minutos) AS saldo
               FROM rh.banco_horas_movimento m
               JOIN rh.colaborador c ON c.id = m.colaborador_id
              WHERE c.status <> 'desligado'
              GROUP BY m.colaborador_id) t`
  );
  return {
    saldo_minutos: paraNumero(linhas[0]?.saldo_minutos ?? 0),
    pessoas_com_saldo: paraNumero(linhas[0]?.pessoas_com_saldo ?? 0),
  };
}

/**
 * Uma pessoa do quadro pelo id — sem exigir escala. O espelho precisa disto:
 * quem ainda não tem jornada definida tem espelho VAZIO, não "não encontrado".
 */
export async function buscarColaboradorPonto(
  id: number
): Promise<ColaboradorPonto | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    `SELECT id, nome_completo, matricula FROM rh.colaborador WHERE id = $1`,
    [id]
  );
  return linhas[0]
    ? {
        id: paraNumero(linhas[0].id),
        nome_completo: linhas[0].nome_completo,
        matricula: linhas[0].matricula,
      }
    : null;
}

// ---------------------------------------------------------------- casos de teste (bateria)

export interface CasoTestePonto {
  id: number;
  nome: string;
  descricao: string;
  entrada: Record<string, unknown>;
  saida_esperada: Record<string, unknown>;
}

export async function listarCasosTestePontoAtivos(): Promise<CasoTestePonto[]> {
  const linhas = await consultar<{
    id: string;
    nome: string;
    descricao: string;
    entrada: Record<string, unknown>;
    saida_esperada: Record<string, unknown>;
  }>(
    `SELECT id, nome, descricao, entrada, saida_esperada
       FROM rh.caso_teste_ponto
      WHERE ativo
      ORDER BY id`
  );
  return linhas.map((linha) => ({ ...linha, id: paraNumero(linha.id) }));
}
