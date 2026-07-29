import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
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

export interface ImpedidoCalculo {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  motivo: string;
}

const SEM_POSICAO = `
  SELECT c.id, c.nome_completo, c.matricula
    FROM rh.colaborador c
   WHERE c.status = 'ativo'
     AND NOT EXISTS (
       SELECT 1 FROM rh.posicao_colaborador p
        WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL)
   ORDER BY c.nome_completo, c.id`;

export async function listarImpedidos(
  cliente?: PoolClient
): Promise<ImpedidoCalculo[]> {
  const linhas = cliente
    ? (await cliente.query<{ id: string; nome_completo: string; matricula: string }>(SEM_POSICAO)).rows
    : await consultar<{ id: string; nome_completo: string; matricula: string }>(SEM_POSICAO);
  return linhas.map((linha) => ({
    colaborador_id: Number(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
    motivo: "sem posição/salário vigente",
  }));
}

export interface ColaboradorCalculo {
  colaborador_id: number;
  nome_completo: string;
  matricula: string;
  salario_centavos: number;
  dependentes_irrf: number;
}

export async function listarColaboradoresParaCalculo(
  cliente: PoolClient
): Promise<ColaboradorCalculo[]> {
  const { rows } = await cliente.query<{
    id: string;
    nome_completo: string;
    matricula: string;
    salario: string;
    dependentes: string;
  }>(
    `SELECT c.id, c.nome_completo, c.matricula, p.salario::text AS salario,
            (SELECT COUNT(*) FROM rh.dependente d
              WHERE d.colaborador_id = c.id) AS dependentes
       FROM rh.colaborador c
       JOIN rh.posicao_colaborador p
         ON p.colaborador_id = c.id AND p.fim_vigencia IS NULL
      WHERE c.status = 'ativo'
      ORDER BY c.nome_completo, c.id`
  );
  return rows.map((linha) => ({
    colaborador_id: Number(linha.id),
    nome_completo: linha.nome_completo,
    matricula: linha.matricula,
    salario_centavos: paraCentavos(linha.salario),
    dependentes_irrf: Number(linha.dependentes),
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

export interface AdesaoDesconto {
  colaborador_id: number;
  colaborador_nome: string;
  desconto_centavos: number;
  beneficio_nome: string;
}

/** Adesões vigentes e ativas com desconto — insumo do botão "importar descontos". */
export async function listarDescontosDeAdesao(
  cliente: PoolClient
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
      WHERE a.fim IS NULL AND a.status = 'ativa'
        AND a.desconto IS NOT NULL AND a.desconto > 0
        AND c.status = 'ativo'
      ORDER BY c.nome_completo, b.nome, a.id`
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
}

interface LinhaRubricaVigente extends Record<string, unknown> {
  rubrica_id: string;
  rubrica_versao_id: string;
  codigo: string;
  nome: string;
  natureza: NaturezaRubrica;
  incide_inss: boolean;
  incide_irrf: boolean;
  incide_fgts: boolean;
  tipo_calculo: TipoCalculo;
  parametro: string | null;
}

export async function listarRubricasVigentes(
  cliente?: PoolClient
): Promise<RubricaVigente[]> {
  const sql = `
    SELECT r.id AS rubrica_id, rv.id AS rubrica_versao_id, r.codigo, r.nome,
           r.natureza, rv.incide_inss, rv.incide_irrf, rv.incide_fgts,
           rv.tipo_calculo, rv.parametro::text AS parametro
      FROM rh_folha.rubrica r
      JOIN rh_folha.rubrica_versao rv
        ON rv.rubrica_id = r.id AND rv.status = 'ativa'
     WHERE r.ativo
     ORDER BY r.codigo`;
  const linhas = cliente
    ? (await cliente.query<LinhaRubricaVigente>(sql)).rows
    : await consultar<LinhaRubricaVigente>(sql);
  return linhas.map((linha) => ({
    rubrica_id: Number(linha.rubrica_id),
    rubrica_versao_id: Number(linha.rubrica_versao_id),
    codigo: linha.codigo,
    nome: linha.nome,
    natureza: linha.natureza,
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
  }>(
    `SELECT id, codigo, nome, natureza, ativo
       FROM rh_folha.rubrica WHERE id = $1 FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
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
    }>(
      `SELECT id, codigo, nome, natureza, ativo
         FROM rh_folha.rubrica ORDER BY codigo`
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
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
    conferido_dp: boolean;
  }>(
    `SELECT id, salario_minimo::text AS salario_minimo,
            aliquota_fgts::text AS aliquota_fgts, status,
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
  }));
}

export interface TabelasVigentesMotor {
  inss: TabelaInssMotor;
  irrf: TabelaIrrfMotor;
  parametros: ParametrosFolhaMotor;
}

/** Versões ATIVAS das três tabelas legais, já em centavos — null se faltar alguma. */
export async function tabelasVigentes(
  cliente?: PoolClient
): Promise<{ tabelas: TabelasVigentesMotor | null; faltantes: TipoTabelaLegal[] }> {
  const executar = async <T extends Record<string, unknown>>(
    sql: string
  ): Promise<T[]> =>
    cliente ? (await cliente.query<T>(sql)).rows : await consultar<T>(sql);

  const [inss, irrf, parametros] = await Promise.all([
    executar<{ id: string; faixas: FaixaInssJson[]; teto_contribuicao: string }>(
      `SELECT id, faixas, teto_contribuicao::text AS teto_contribuicao
         FROM rh_folha.tabela_inss_versao WHERE status = 'ativa'`
    ),
    executar<{
      id: string;
      faixas: FaixaIrrfJson[];
      deducao_por_dependente: string;
      desconto_simplificado: string;
    }>(
      `SELECT id, faixas, deducao_por_dependente::text AS deducao_por_dependente,
              desconto_simplificado::text AS desconto_simplificado
         FROM rh_folha.tabela_irrf_versao WHERE status = 'ativa'`
    ),
    executar<{ id: string; aliquota_fgts: string }>(
      `SELECT id, aliquota_fgts::text AS aliquota_fgts
         FROM rh_folha.parametro_folha_versao WHERE status = 'ativa'`
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

/** Situação de conferência do DP das versões ATIVAS — gate da aprovação. */
export async function situacaoConferenciaTabelas(
  cliente?: PoolClient
): Promise<SituacaoConferencia[]> {
  const resultado: SituacaoConferencia[] = [];
  for (const tipo of Object.keys(TABELAS_LEGAIS) as TipoTabelaLegal[]) {
    const sql = `SELECT id, conferido_dp FROM ${TABELAS_LEGAIS[tipo]} WHERE status = 'ativa'`;
    const linhas = cliente
      ? (await cliente.query<{ id: string; conferido_dp: boolean }>(sql)).rows
      : await consultar<{ id: string; conferido_dp: boolean }>(sql);
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
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_folha.parametro_folha_versao
       (salario_minimo, aliquota_fgts, status, inicio_vigencia)
     VALUES ($1, $2, 'ativa', $3)
     RETURNING id`,
    [
      dados.salario_minimo.toFixed(2),
      dados.aliquota_fgts,
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
}

export async function listarFolhasDaCompetencia(
  competenciaId: number
): Promise<FolhaResumo[]> {
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
  }>(
    `SELECT f.id, f.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, f.salario_base_congelado::text AS salario_base_congelado,
            f.dependentes_irrf, f.total_proventos::text AS total_proventos,
            f.total_descontos::text AS total_descontos, f.liquido::text AS liquido,
            f.calculada_em::text AS calculada_em
       FROM rh_folha.folha_colaborador f
       JOIN rh.colaborador c ON c.id = f.colaborador_id
      WHERE f.competencia_id = $1
      ORDER BY c.nome_completo, f.id`,
    [competenciaId]
  );
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
  }));
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
  competenciaId: number
): Promise<ItemFolha[]> {
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
      WHERE f.competencia_id = $1
      ORDER BY i.folha_colaborador_id, r.codigo, i.id`,
    [competenciaId]
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

// ------------------------------------------------------------------ indicador

/**
 * % de competências mensais dos últimos 12 meses fechadas até o dia 5 do mês
 * seguinte (America/Sao_Paulo). Denominador: competências cujo prazo já venceu
 * OU que já fecharam; null se não houver nenhuma.
 */
export async function indicadorFolhaNoPrazo(): Promise<{
  no_prazo: number;
  total: number;
} | null> {
  const linhas = await consultar<{ no_prazo: string; total: string }>(
    `WITH base AS (
       SELECT c.estado,
              (make_date(c.ano, c.mes, 1) + INTERVAL '1 month' + INTERVAL '4 days')::date AS prazo,
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
