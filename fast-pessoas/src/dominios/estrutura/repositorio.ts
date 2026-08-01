import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  FiltroEstrutura,
  OpcaoEstrutura,
  OpcoesFiltroEstrutura,
  TipoEmpresa,
} from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// SQL dos catálogos de REGISTRO (rh.empresa_grupo) e CENTRO DE CUSTO
// (rh.centro_custo), ambos com nome versionado por vigência — migration 0047.
// O catálogo de LOTAÇÃO (rh.estabelecimento) já morava no domínio colaboradores
// e continua lá; a tela de estrutura consome os três.

// ------------------------------------------------------------------ empresa do grupo

export interface EmpresaResumo {
  id: number;
  cnpj: string | null;
  versao_id: number | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  tipo: TipoEmpresa | null;
  inicio_vigencia: string | null;
  inativada_em: string | null;
  /** Vínculos já registrados nesta empresa — o que impede a exclusão. */
  vinculos: number;
  centros_custo: number;
}

interface LinhaEmpresa extends Record<string, unknown> {
  id: string;
  cnpj: string | null;
  versao_id: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  tipo: TipoEmpresa | null;
  inicio_vigencia: string | null;
  inativada_em: string | null;
  vinculos: string;
  centros_custo: string;
}

function montarEmpresa(linha: LinhaEmpresa): EmpresaResumo {
  return {
    ...linha,
    id: Number(linha.id),
    versao_id: linha.versao_id === null ? null : Number(linha.versao_id),
    vinculos: Number(linha.vinculos),
    centros_custo: Number(linha.centros_custo),
  };
}

const SELECT_EMPRESA = `
  SELECT eg.id, eg.cnpj, v.id AS versao_id, v.razao_social, v.nome_fantasia,
         v.tipo, v.inicio_vigencia::text AS inicio_vigencia,
         eg.inativada_em::text AS inativada_em,
         (SELECT count(DISTINCT l.colaborador_id) FROM rh.lotacao l
           WHERE l.empresa_id = eg.id) AS vinculos,
         (SELECT count(*) FROM rh.centro_custo cc
           WHERE cc.empresa_id = eg.id) AS centros_custo
    FROM rh.empresa_grupo eg
    LEFT JOIN rh.empresa_grupo_versao v
      ON v.empresa_id = eg.id AND v.status = 'ativa'`;

export async function listarEmpresas(): Promise<EmpresaResumo[]> {
  const linhas = await consultar<LinhaEmpresa>(
    `${SELECT_EMPRESA}
      ORDER BY eg.inativada_em NULLS FIRST, v.nome_fantasia NULLS LAST, eg.id`
  );
  return linhas.map(montarEmpresa);
}

export async function buscarEmpresa(
  cliente: PoolClient,
  empresaId: number
): Promise<EmpresaResumo | null> {
  const { rows } = await cliente.query<LinhaEmpresa>(
    `${SELECT_EMPRESA} WHERE eg.id = $1`,
    [empresaId]
  );
  return rows.length === 0 ? null : montarEmpresa(rows[0]);
}

export async function inserirEmpresa(
  cliente: PoolClient,
  cnpj: string | null
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    "INSERT INTO rh.empresa_grupo (cnpj) VALUES ($1) RETURNING id",
    [cnpj]
  );
  return Number(rows[0].id);
}

export async function atualizarCnpjEmpresa(
  cliente: PoolClient,
  empresaId: number,
  cnpj: string | null
): Promise<void> {
  await cliente.query("UPDATE rh.empresa_grupo SET cnpj = $2 WHERE id = $1", [
    empresaId,
    cnpj,
  ]);
}

export async function buscarVersaoEmpresaAtiva(
  cliente: PoolClient,
  empresaId: number,
  travar = false
): Promise<{
  id: number;
  razao_social: string | null;
  nome_fantasia: string;
  tipo: TipoEmpresa;
  inicio_vigencia: string;
} | null> {
  const { rows } = await cliente.query<{
    id: string;
    razao_social: string | null;
    nome_fantasia: string;
    tipo: TipoEmpresa;
    inicio_vigencia: string;
  }>(
    `SELECT id, razao_social, nome_fantasia, tipo,
            inicio_vigencia::text AS inicio_vigencia
       FROM rh.empresa_grupo_versao
      WHERE empresa_id = $1 AND status = 'ativa'
      ${travar ? "FOR UPDATE" : ""}`,
    [empresaId]
  );
  return rows.length === 0 ? null : { ...rows[0], id: Number(rows[0].id) };
}

export async function encerrarVersaoEmpresa(
  cliente: PoolClient,
  versaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.empresa_grupo_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [versaoId, inicioDaProxima]
  );
}

export async function inserirVersaoEmpresa(
  cliente: PoolClient,
  dados: {
    empresa_id: number;
    razao_social: string | null;
    nome_fantasia: string;
    tipo: TipoEmpresa;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.empresa_grupo_versao
       (empresa_id, razao_social, nome_fantasia, tipo, status, inicio_vigencia)
     VALUES ($1, $2, $3, $4, 'ativa', $5)
     RETURNING id`,
    [
      dados.empresa_id,
      dados.razao_social,
      dados.nome_fantasia,
      dados.tipo,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

export async function definirInativacaoEmpresa(
  cliente: PoolClient,
  empresaId: number,
  usuarioId: number | null
): Promise<void> {
  await cliente.query(
    `UPDATE rh.empresa_grupo
        SET inativada_em = CASE WHEN $2::bigint IS NULL THEN NULL ELSE now() END,
            inativada_por = $2
      WHERE id = $1`,
    [empresaId, usuarioId]
  );
}

// ------------------------------------------------------------------ centro de custo

export interface CentroCustoResumo {
  id: number;
  empresa_id: number;
  empresa_nome: string | null;
  codigo: string;
  versao_id: number | null;
  nome: string | null;
  inicio_vigencia: string | null;
  inativado_em: string | null;
  /**
   * Quando a EMPRESA que mantém o centro está inativada. O centro em si pode
   * estar ativo e mesmo assim não ser oferecido — quem inativa a empresa espera
   * que ela suma das escolhas, e os centros dela vão junto. A tela precisa do
   * campo para dizer POR QUE o centro sumiu dos seletores.
   */
  empresa_inativada_em: string | null;
  /** Alocações (vigentes ou encerradas) que já caíram neste centro. */
  alocacoes: number;
}

interface LinhaCentroCusto extends Record<string, unknown> {
  id: string;
  empresa_id: string;
  empresa_nome: string | null;
  codigo: string;
  versao_id: string | null;
  nome: string | null;
  inicio_vigencia: string | null;
  inativado_em: string | null;
  empresa_inativada_em: string | null;
  alocacoes: string;
}

function montarCentroCusto(linha: LinhaCentroCusto): CentroCustoResumo {
  return {
    ...linha,
    id: Number(linha.id),
    empresa_id: Number(linha.empresa_id),
    versao_id: linha.versao_id === null ? null : Number(linha.versao_id),
    alocacoes: Number(linha.alocacoes),
  };
}

const SELECT_CENTRO = `
  SELECT cc.id, cc.empresa_id, ev.nome_fantasia AS empresa_nome, cc.codigo,
         v.id AS versao_id, v.nome, v.inicio_vigencia::text AS inicio_vigencia,
         cc.inativado_em::text AS inativado_em,
         eg.inativada_em::text AS empresa_inativada_em,
         (SELECT count(*) FROM rh.lotacao l
           WHERE l.centro_custo_id = cc.id) AS alocacoes
    FROM rh.centro_custo cc
    JOIN rh.empresa_grupo eg ON eg.id = cc.empresa_id
    LEFT JOIN rh.centro_custo_versao v
      ON v.centro_custo_id = cc.id AND v.status = 'ativa'
    LEFT JOIN rh.empresa_grupo_versao ev
      ON ev.empresa_id = cc.empresa_id AND ev.status = 'ativa'`;

export async function listarCentrosCusto(): Promise<CentroCustoResumo[]> {
  const linhas = await consultar<LinhaCentroCusto>(
    `${SELECT_CENTRO}
      ORDER BY cc.inativado_em NULLS FIRST, eg.inativada_em NULLS FIRST,
               ev.nome_fantasia NULLS LAST, cc.codigo`
  );
  return linhas.map(montarCentroCusto);
}

export async function buscarCentroCusto(
  cliente: PoolClient,
  centroCustoId: number
): Promise<CentroCustoResumo | null> {
  const { rows } = await cliente.query<LinhaCentroCusto>(
    `${SELECT_CENTRO} WHERE cc.id = $1`,
    [centroCustoId]
  );
  return rows.length === 0 ? null : montarCentroCusto(rows[0]);
}

export async function inserirCentroCusto(
  cliente: PoolClient,
  dados: { empresa_id: number; codigo: string }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.centro_custo (empresa_id, codigo) VALUES ($1, $2)
     RETURNING id`,
    [dados.empresa_id, dados.codigo]
  );
  return Number(rows[0].id);
}

export async function buscarVersaoCentroCustoAtiva(
  cliente: PoolClient,
  centroCustoId: number,
  travar = false
): Promise<{ id: number; nome: string; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{
    id: string;
    nome: string;
    inicio_vigencia: string;
  }>(
    `SELECT id, nome, inicio_vigencia::text AS inicio_vigencia
       FROM rh.centro_custo_versao
      WHERE centro_custo_id = $1 AND status = 'ativa'
      ${travar ? "FOR UPDATE" : ""}`,
    [centroCustoId]
  );
  return rows.length === 0 ? null : { ...rows[0], id: Number(rows[0].id) };
}

export async function encerrarVersaoCentroCusto(
  cliente: PoolClient,
  versaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.centro_custo_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [versaoId, inicioDaProxima]
  );
}

export async function inserirVersaoCentroCusto(
  cliente: PoolClient,
  dados: { centro_custo_id: number; nome: string; inicio_vigencia: string }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.centro_custo_versao
       (centro_custo_id, nome, status, inicio_vigencia)
     VALUES ($1, $2, 'ativa', $3)
     RETURNING id`,
    [dados.centro_custo_id, dados.nome, dados.inicio_vigencia]
  );
  return Number(rows[0].id);
}

export async function definirInativacaoCentroCusto(
  cliente: PoolClient,
  centroCustoId: number,
  usuarioId: number | null
): Promise<void> {
  await cliente.query(
    `UPDATE rh.centro_custo
        SET inativado_em = CASE WHEN $2::bigint IS NULL THEN NULL ELSE now() END,
            inativado_por = $2
      WHERE id = $1`,
    [centroCustoId, usuarioId]
  );
}

// ------------------------------------------------------------------ seletores da alocação
// O que a ficha do colaborador oferece para escolher os três campos. Só ATIVOS:
// inativado sai do seletor sem sumir do passado.
//
// ATIVO INCLUI A EMPRESA QUE MANTÉM O CENTRO DE CUSTO. Inativar uma empresa do
// grupo tirava só ela dos seletores e deixava os centros de custo dela na
// escolha — oferecer CC-1000 da Supply depois de inativar a Supply convida a
// lançar custo numa empresa que não opera mais. O dono do centro de custo é a
// empresa (rh.centro_custo.empresa_id, migration 0047), então o centro segue a
// situação dela.
//
// Isso NÃO é a trava "centro de custo tem que ser da mesma empresa da lotação",
// que a 0047 rejeitou de propósito: alocar alguém registrado na Supply num
// centro do CSC continua permitido — o que sai é o centro cuja MANTENEDORA foi
// desligada. E nada disso esconde o passado: quem já custa ali continua
// aparecendo onde já aparecia (ver listarOpcoesDeFiltroEstrutura, mais abaixo).

export interface OpcaoEmpresa {
  id: number;
  nome: string;
  cnpj: string | null;
}

export async function listarEmpresasAtivas(): Promise<OpcaoEmpresa[]> {
  const linhas = await consultar<{
    id: string;
    nome: string;
    cnpj: string | null;
  }>(
    `SELECT eg.id, v.nome_fantasia AS nome, eg.cnpj
       FROM rh.empresa_grupo eg
       JOIN rh.empresa_grupo_versao v
         ON v.empresa_id = eg.id AND v.status = 'ativa'
      WHERE eg.inativada_em IS NULL
      ORDER BY v.nome_fantasia`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export interface OpcaoCentroCusto {
  id: number;
  codigo: string;
  nome: string;
  empresa_id: number;
  empresa_nome: string | null;
}

export async function listarCentrosCustoAtivos(): Promise<OpcaoCentroCusto[]> {
  const linhas = await consultar<{
    id: string;
    codigo: string;
    nome: string;
    empresa_id: string;
    empresa_nome: string | null;
  }>(
    `SELECT cc.id, cc.codigo, v.nome, cc.empresa_id,
            ev.nome_fantasia AS empresa_nome
       FROM rh.centro_custo cc
       JOIN rh.empresa_grupo eg ON eg.id = cc.empresa_id
       JOIN rh.centro_custo_versao v
         ON v.centro_custo_id = cc.id AND v.status = 'ativa'
       LEFT JOIN rh.empresa_grupo_versao ev
         ON ev.empresa_id = cc.empresa_id AND ev.status = 'ativa'
      WHERE cc.inativado_em IS NULL AND eg.inativada_em IS NULL
      ORDER BY ev.nome_fantasia NULLS LAST, cc.codigo`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    empresa_id: Number(linha.empresa_id),
  }));
}

export async function existeEmpresaAtiva(
  cliente: PoolClient,
  empresaId: number
): Promise<boolean> {
  const { rows } = await cliente.query(
    `SELECT 1 FROM rh.empresa_grupo
      WHERE id = $1 AND inativada_em IS NULL`,
    [empresaId]
  );
  return rows.length > 0;
}

/**
 * Gêmeo de validação do seletor: o mesmo "ativo" que `listarCentrosCustoAtivos`
 * usa para OFERECER. Os dois têm que dizer a mesma coisa — senão a API aceita
 * por POST o que a tela deixou de mostrar.
 */
export async function existeCentroCustoAtivo(
  cliente: PoolClient,
  centroCustoId: number
): Promise<boolean> {
  const { rows } = await cliente.query(
    `SELECT 1
       FROM rh.centro_custo cc
       JOIN rh.empresa_grupo eg ON eg.id = cc.empresa_id
      WHERE cc.id = $1 AND cc.inativado_em IS NULL
        AND eg.inativada_em IS NULL`,
    [centroCustoId]
  );
  return rows.length > 0;
}

// ------------------------------------------------------------------ filtro pelos três (leitura)
//
// Uma fonte só para "quem está registrado em X, trabalhando em Y, custando em
// Z", usada pela lista de colaboradores, pelos relatórios, pelo organograma e
// pela folha. Duas decisões que fazem o filtro não mentir:
//
// 1. A linha comparada é a MESMA que a tela mostra: "a vigente, ou a última
//    quando o contrato acabou" (a ordenação de rh.vinculos_da_pessoa). Filtrar
//    por `fim_vigencia IS NULL` devolveria vazio para todo vínculo encerrado
//    direito — inclusive o que a transferência entre empresas (0048) fecha —
//    e a lista mostraria "Supply" numa linha que o filtro "Supply" some.
// 2. Os três entram em E. Combinar é o ponto: o exemplo do dono é alguém
//    registrado na Supply, trabalhando na loja Centro e custando no CSC, e
//    perguntar pelos três ao mesmo tempo tem que ser possível.

/**
 * Devolve o pedaço de SQL a colar num WHERE (já começando por AND), empurrando
 * os valores para `parametros`. Filtro vazio devolve string vazia — nada muda.
 *
 * @param aliasColaborador alias da tabela rh.colaborador na consulta chamadora.
 */
export function condicaoFiltroEstrutura(
  filtro: FiltroEstrutura,
  parametros: unknown[],
  aliasColaborador = "c"
): string {
  const comparacoes: string[] = [];
  if (filtro.empresa_id !== undefined) {
    parametros.push(filtro.empresa_id);
    comparacoes.push(`ultima.empresa_id = $${parametros.length}`);
  }
  if (filtro.estabelecimento_id !== undefined) {
    parametros.push(filtro.estabelecimento_id);
    comparacoes.push(`ultima.estabelecimento_id = $${parametros.length}`);
  }
  if (filtro.centro_custo_id !== undefined) {
    parametros.push(filtro.centro_custo_id);
    comparacoes.push(`ultima.centro_custo_id = $${parametros.length}`);
  }
  if (comparacoes.length === 0) return "";
  return ` AND EXISTS (
      SELECT 1
        FROM (SELECT le.empresa_id, le.estabelecimento_id, le.centro_custo_id
                FROM rh.lotacao le
               WHERE le.colaborador_id = ${aliasColaborador}.id
               ORDER BY le.inicio_vigencia DESC, le.id DESC
               LIMIT 1) ultima
       WHERE ${comparacoes.join(" AND ")}
    )`;
}

/**
 * O que oferecer nos três seletores.
 *
 * Duas coisas que precisam andar juntas e antes não andavam:
 *
 * 1. As opções saem da MESMA LINHA que `condicaoFiltroEstrutura` compara — a
 *    ÚLTIMA lotação de cada vínculo. Sair de `rh.lotacao_detalhada` inteira
 *    (que cobre o histórico) colocava no seletor centro de custo, lotação e
 *    empresa que só aparecem em linhas ENCERRADAS: escolher a opção devolvia
 *    lista vazia, que é exatamente o ruído que este seletor existe para evitar.
 *
 * 2. O rótulo é resolvido UMA VEZ por id, na data de HOJE. A view resolve o
 *    nome no fim da vigência de cada linha, então depois de uma renomeação o
 *    mesmo id voltava com dois nomes diferentes e o Map guardava o primeiro que
 *    o Postgres devolvesse — sem ORDER BY, o rótulo do seletor era sorteio, e
 *    podia mostrar um nome que a empresa não tem mais enquanto a coluna da
 *    lista (que lê a linha vigente) mostrava o nome de hoje.
 *
 * Catálogo INATIVADO continua entrando: inativar tira do cadastro novo, e quem
 * ainda está alocado ali precisa ser achável.
 */
export async function listarOpcoesDeFiltroEstrutura(): Promise<OpcoesFiltroEstrutura> {
  const linhas = await consultar<{
    dimensao: "empresa" | "lotacao" | "centro";
    id: string;
    nome: string | null;
    codigo: string | null;
  }>(
    `WITH ultima AS (
       SELECT u.empresa_id, u.estabelecimento_id, u.centro_custo_id
         FROM rh.colaborador c
         JOIN LATERAL (
           SELECT le.empresa_id, le.estabelecimento_id, le.centro_custo_id
             FROM rh.lotacao le
            WHERE le.colaborador_id = c.id
            ORDER BY le.inicio_vigencia DESC, le.id DESC
            LIMIT 1
         ) u ON TRUE
     ),
     opcao AS (
       SELECT 'empresa'::text AS dimensao, ul.empresa_id AS id FROM ultima ul
       UNION
       SELECT 'lotacao', ul.estabelecimento_id FROM ultima ul
       UNION
       SELECT 'centro', ul.centro_custo_id FROM ultima ul
     )
     SELECT o.dimensao, o.id,
            CASE o.dimensao
              WHEN 'empresa' THEN
                (SELECT v.nome_fantasia FROM rh.empresa_grupo_versao v
                  WHERE v.id = rh.empresa_versao_em(o.id, ${HOJE_SP}))
              WHEN 'lotacao' THEN
                (SELECT v.unidade FROM rh.estabelecimento_versao v
                  WHERE v.id = rh.estabelecimento_versao_em(o.id, ${HOJE_SP}))
              ELSE
                (SELECT v.nome FROM rh.centro_custo_versao v
                  WHERE v.id = rh.centro_custo_versao_em(o.id, ${HOJE_SP}))
            END AS nome,
            CASE WHEN o.dimensao = 'centro'
                 THEN (SELECT cc.codigo FROM rh.centro_custo cc WHERE cc.id = o.id)
            END AS codigo
       FROM opcao o`
  );

  const empresas: OpcaoEstrutura[] = [];
  const lotacoes: OpcaoEstrutura[] = [];
  const centros: OpcaoEstrutura[] = [];
  for (const linha of linhas) {
    const id = Number(linha.id);
    if (linha.dimensao === "empresa") {
      empresas.push({ id, nome: linha.nome ?? `Empresa ${id}` });
    } else if (linha.dimensao === "lotacao") {
      lotacoes.push({ id, nome: linha.nome ?? `Local ${id}` });
    } else {
      const codigo = linha.codigo ?? `CC ${id}`;
      centros.push({
        id,
        nome: linha.nome ? `${codigo} — ${linha.nome}` : codigo,
      });
    }
  }
  const ordenar = (opcoes: OpcaoEstrutura[]): OpcaoEstrutura[] =>
    [...opcoes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    empresas: ordenar(empresas),
    lotacoes: ordenar(lotacoes),
    centros_custo: ordenar(centros),
  };
}
