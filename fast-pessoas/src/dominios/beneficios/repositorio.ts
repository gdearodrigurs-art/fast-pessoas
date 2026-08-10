import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  StatusColaborador,
  TipoVinculo,
} from "../colaboradores/esquemas";
import { StatusDemanda } from "../demandas/esquemas";
import {
  CategoriaBeneficio,
  Criterio,
  Parentesco,
  StatusAdesao,
  CHAVE_TIPO_DEMANDA_BENEFICIO,
  CHAVE_TIPO_DEMANDA_REVISAO,
} from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

function numeroOuNulo(valor: string | null): number | null {
  return valor === null ? null : Number(valor);
}

// ------------------------------------------------------------------ benefício + regra vigente

export interface RegraVigente {
  id: number;
  criterio: Criterio;
  valor_padrao: number | null;
  desconto_padrao: number | null;
  inicio_vigencia: string;
}

export interface BeneficioComRegra {
  id: number;
  chave: string;
  nome: string;
  categoria: CategoriaBeneficio;
  ativo: boolean;
  regra: RegraVigente | null;
}

interface LinhaBeneficio extends Record<string, unknown> {
  id: string;
  chave: string;
  nome: string;
  categoria: CategoriaBeneficio;
  ativo: boolean;
  regra_id: string | null;
  criterio: Criterio | null;
  valor_padrao: string | null;
  desconto_padrao: string | null;
  regra_inicio: string | null;
}

const SELECT_BENEFICIO = `
  SELECT b.id, b.chave, b.nome, b.categoria, b.ativo,
         r.id AS regra_id, r.criterio,
         r.valor_padrao::text AS valor_padrao,
         r.desconto_padrao::text AS desconto_padrao,
         r.inicio_vigencia::text AS regra_inicio
    FROM rh.beneficio b
    LEFT JOIN rh.regra_elegibilidade_versao r
      ON r.beneficio_id = b.id AND r.status = 'ativa'`;

function paraBeneficio(linha: LinhaBeneficio): BeneficioComRegra {
  return {
    id: Number(linha.id),
    chave: linha.chave,
    nome: linha.nome,
    categoria: linha.categoria,
    ativo: linha.ativo,
    regra:
      linha.regra_id === null
        ? null
        : {
            id: Number(linha.regra_id),
            criterio: linha.criterio ?? {},
            valor_padrao: numeroOuNulo(linha.valor_padrao),
            desconto_padrao: numeroOuNulo(linha.desconto_padrao),
            inicio_vigencia: linha.regra_inicio ?? "",
          },
  };
}

export async function listarBeneficios(
  somenteAtivos: boolean
): Promise<BeneficioComRegra[]> {
  const linhas = await consultar<LinhaBeneficio>(
    `${SELECT_BENEFICIO}
     ${somenteAtivos ? "WHERE b.ativo" : ""}
     ORDER BY b.nome, b.id`
  );
  return linhas.map(paraBeneficio);
}

export async function buscarBeneficio(
  id: number,
  cliente?: PoolClient
): Promise<BeneficioComRegra | null> {
  const sql = `${SELECT_BENEFICIO} WHERE b.id = $1`;
  const linhas = cliente
    ? (await cliente.query<LinhaBeneficio>(sql, [id])).rows
    : await consultar<LinhaBeneficio>(sql, [id]);
  return linhas.length > 0 ? paraBeneficio(linhas[0]) : null;
}

export interface BeneficioBasico {
  id: number;
  chave: string;
  nome: string;
  categoria: CategoriaBeneficio;
  ativo: boolean;
}

export async function buscarBeneficioParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<BeneficioBasico | null> {
  const { rows } = await cliente.query<{
    id: string;
    chave: string;
    nome: string;
    categoria: CategoriaBeneficio;
    ativo: boolean;
  }>(
    `SELECT id, chave, nome, categoria, ativo
       FROM rh.beneficio WHERE id = $1 FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

export async function inserirBeneficio(
  cliente: PoolClient,
  dados: { chave: string; nome: string; categoria: CategoriaBeneficio }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.beneficio (chave, nome, categoria)
     VALUES ($1, $2, $3) RETURNING id`,
    [dados.chave, dados.nome, dados.categoria]
  );
  return Number(rows[0].id);
}

export async function atualizarBeneficio(
  cliente: PoolClient,
  id: number,
  campos: { nome?: string; categoria?: CategoriaBeneficio; ativo?: boolean }
): Promise<void> {
  const colunas: Record<string, string> = {
    nome: "nome",
    categoria: "categoria",
    ativo: "ativo",
  };
  const chaves = Object.keys(campos) as (keyof typeof campos)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${colunas[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE rh.beneficio SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [id, ...chaves.map((chave) => campos[chave])]
  );
}

// ------------------------------------------------------------------ versões da regra de elegibilidade

export interface RegraVersao {
  id: number;
  status: "rascunho" | "ativa" | "encerrada";
  criterio: Criterio;
  valor_padrao: number | null;
  desconto_padrao: number | null;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarRegras(
  beneficioId: number
): Promise<RegraVersao[]> {
  const linhas = await consultar<{
    id: string;
    status: "rascunho" | "ativa" | "encerrada";
    criterio: Criterio;
    valor_padrao: string | null;
    desconto_padrao: string | null;
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT id, status, criterio,
            valor_padrao::text AS valor_padrao,
            desconto_padrao::text AS desconto_padrao,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia
       FROM rh.regra_elegibilidade_versao
      WHERE beneficio_id = $1
      ORDER BY inicio_vigencia DESC, id DESC`,
    [beneficioId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    valor_padrao: numeroOuNulo(linha.valor_padrao),
    desconto_padrao: numeroOuNulo(linha.desconto_padrao),
  }));
}

export async function buscarRegraAtivaParaAtualizar(
  cliente: PoolClient,
  beneficioId: number
): Promise<{ id: number; inicio_vigencia: string } | null> {
  const { rows } = await cliente.query<{
    id: string;
    inicio_vigencia: string;
  }>(
    `SELECT id, inicio_vigencia::text AS inicio_vigencia
       FROM rh.regra_elegibilidade_versao
      WHERE beneficio_id = $1 AND status = 'ativa'
      FOR UPDATE`,
    [beneficioId]
  );
  if (rows.length === 0) return null;
  return { id: Number(rows[0].id), inicio_vigencia: rows[0].inicio_vigencia };
}

export async function encerrarRegra(
  cliente: PoolClient,
  regraId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.regra_elegibilidade_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [regraId, inicioDaProxima]
  );
}

export async function inserirRegra(
  cliente: PoolClient,
  dados: {
    beneficio_id: number;
    criterio: Criterio;
    valor_padrao: number | null;
    desconto_padrao: number | null;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.regra_elegibilidade_versao
       (beneficio_id, criterio, valor_padrao, desconto_padrao, status, inicio_vigencia)
     VALUES ($1, $2, $3, $4, 'ativa', $5)
     RETURNING id`,
    [
      dados.beneficio_id,
      JSON.stringify(dados.criterio),
      dados.valor_padrao,
      dados.desconto_padrao,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ perfil de elegibilidade do colaborador

export interface PerfilBeneficios {
  colaborador_id: number;
  usuario_id: number;
  nome_completo: string;
  matricula: string;
  status: StatusColaborador;
  tipo_vinculo: TipoVinculo;
  estabelecimento_id: number | null;
  unidade: string | null;
}

interface LinhaPerfil extends Record<string, unknown> {
  colaborador_id: string;
  usuario_id: string;
  nome_completo: string;
  matricula: string;
  status: StatusColaborador;
  tipo_vinculo: TipoVinculo;
  estabelecimento_id: string | null;
  unidade: string | null;
}

const SELECT_PERFIL = `
  SELECT c.id AS colaborador_id, c.usuario_id, c.nome_completo, c.matricula,
         c.status, c.tipo_vinculo, lot.estabelecimento_id, lot.unidade
    FROM rh.colaborador c
    LEFT JOIN LATERAL (
      SELECT l.estabelecimento_id, ev.unidade
        FROM rh.lotacao l
        LEFT JOIN rh.estabelecimento_versao ev
          ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
       WHERE l.colaborador_id = c.id AND l.fim_vigencia IS NULL
    ) lot ON TRUE`;

function paraPerfil(linha: LinhaPerfil): PerfilBeneficios {
  return {
    ...linha,
    colaborador_id: Number(linha.colaborador_id),
    usuario_id: Number(linha.usuario_id),
    estabelecimento_id:
      linha.estabelecimento_id === null
        ? null
        : Number(linha.estabelecimento_id),
  };
}

export async function perfilPorUsuario(
  usuarioId: number
): Promise<PerfilBeneficios | null> {
  const linhas = await consultar<LinhaPerfil>(
    `${SELECT_PERFIL} WHERE c.id = rh.vinculo_atual($1)`,
    [usuarioId]
  );
  return linhas.length > 0 ? paraPerfil(linhas[0]) : null;
}

export async function perfilPorColaborador(
  colaboradorId: number,
  cliente?: PoolClient
): Promise<PerfilBeneficios | null> {
  const sql = `${SELECT_PERFIL} WHERE c.id = $1`;
  const linhas = cliente
    ? (await cliente.query<LinhaPerfil>(sql, [colaboradorId])).rows
    : await consultar<LinhaPerfil>(sql, [colaboradorId]);
  return linhas.length > 0 ? paraPerfil(linhas[0]) : null;
}

// ------------------------------------------------------------------ adesões

export interface AdesaoResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  colaborador_matricula: string;
  beneficio_id: number;
  beneficio_chave: string;
  beneficio_nome: string;
  categoria: CategoriaBeneficio;
  status: StatusAdesao;
  inicio: string;
  fim: string | null;
  valor: number | null;
  desconto: number | null;
  demanda_id: number | null;
}

interface LinhaAdesao extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  colaborador_matricula: string;
  beneficio_id: string;
  beneficio_chave: string;
  beneficio_nome: string;
  categoria: CategoriaBeneficio;
  status: StatusAdesao;
  inicio: string;
  fim: string | null;
  valor: string | null;
  desconto: string | null;
  demanda_id: string | null;
}

const SELECT_ADESAO = `
  SELECT a.id, a.colaborador_id, c.nome_completo AS colaborador_nome,
         c.matricula AS colaborador_matricula,
         a.beneficio_id, b.chave AS beneficio_chave, b.nome AS beneficio_nome,
         b.categoria, a.status, a.inicio::text AS inicio, a.fim::text AS fim,
         a.valor::text AS valor, a.desconto::text AS desconto, a.demanda_id
    FROM rh.adesao a
    JOIN rh.colaborador c ON c.id = a.colaborador_id
    JOIN rh.beneficio b ON b.id = a.beneficio_id`;

function paraAdesao(linha: LinhaAdesao): AdesaoResumo {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    beneficio_id: Number(linha.beneficio_id),
    valor: numeroOuNulo(linha.valor),
    desconto: numeroOuNulo(linha.desconto),
    demanda_id: linha.demanda_id === null ? null : Number(linha.demanda_id),
  };
}

export async function listarAdesoesDoColaborador(
  colaboradorId: number
): Promise<AdesaoResumo[]> {
  const linhas = await consultar<LinhaAdesao>(
    `${SELECT_ADESAO}
     WHERE a.colaborador_id = $1
     ORDER BY (a.fim IS NULL) DESC, a.inicio DESC, a.id DESC`,
    [colaboradorId]
  );
  return linhas.map(paraAdesao);
}

/**
 * O painel do RH, sob o título "Adesões vigentes" e com os botões de suspender,
 * reativar e cancelar do lado. VIGENTE tem duas condições, não uma: a adesão
 * não fechou E o CONTRATO ainda está de pé. Só `a.fim IS NULL` bastava enquanto
 * a pessoa tinha um vínculo na vida; desde a 0046 ela pode ter dois, e a
 * transferência entre CNPJs (0048) fecha um e abre outro. Sem o segundo filtro,
 * o RH via as adesões pela matrícula ENCERRADA enquanto a própria pessoa via
 * zero — a mesma pessoa, duas verdades, e uma delas com botão de ação.
 */
export async function listarAdesoesVigentes(): Promise<AdesaoResumo[]> {
  const linhas = await consultar<LinhaAdesao>(
    `${SELECT_ADESAO}
     WHERE a.fim IS NULL
       AND c.status <> 'desligado'
     ORDER BY c.nome_completo, b.nome, a.id`
  );
  return linhas.map(paraAdesao);
}

export async function buscarAdesaoResumo(
  id: number
): Promise<AdesaoResumo | null> {
  const linhas = await consultar<LinhaAdesao>(
    `${SELECT_ADESAO} WHERE a.id = $1`,
    [id]
  );
  return linhas.length > 0 ? paraAdesao(linhas[0]) : null;
}

export async function buscarAdesaoParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<AdesaoResumo | null> {
  const { rows } = await cliente.query<LinhaAdesao>(
    `${SELECT_ADESAO} WHERE a.id = $1 FOR UPDATE OF a`,
    [id]
  );
  return rows.length > 0 ? paraAdesao(rows[0]) : null;
}

// `temAdesaoVigente` morava aqui: era a pré-checagem do pedido de adesão do
// colaborador, que acabou na onda H. Quem garante uma vigente por par
// (colaborador, benefício) é o índice `adesao_uma_vigente` da 0009, e quem
// traduz a violação em 409 legível é `efetivarAdesao` — a pré-checagem em
// consulta separada não travava nada que o índice já não travasse, e ainda
// abria janela entre a leitura e a escrita.

export interface AdesaoParaTransferir {
  id: number;
  beneficio_id: number;
  beneficio_nome: string;
  status: StatusAdesao;
  valor: number | null;
  desconto: number | null;
  /** Critério da regra VIGENTE do benefício; null quando o benefício não tem regra. */
  criterio: Criterio | null;
}

/**
 * Adesões de fim aberto do vínculo que vai fechar, já com o critério vigente
 * de cada benefício — o serviço da transferência precisa das duas coisas na
 * mesma leitura para decidir, benefício a benefício, o que atravessa.
 * `FOR UPDATE OF a` porque a transferência e um cancelamento concorrente não
 * podem passar os dois.
 */
export async function adesoesParaTransferir(
  cliente: PoolClient,
  colaboradorId: number
): Promise<AdesaoParaTransferir[]> {
  const { rows } = await cliente.query<{
    id: string;
    beneficio_id: string;
    beneficio_nome: string;
    status: StatusAdesao;
    valor: string | null;
    desconto: string | null;
    criterio: Criterio | null;
  }>(
    `SELECT a.id, a.beneficio_id, b.nome AS beneficio_nome, a.status,
            a.valor::text AS valor, a.desconto::text AS desconto,
            r.criterio
       FROM rh.adesao a
       JOIN rh.beneficio b ON b.id = a.beneficio_id
       LEFT JOIN rh.regra_elegibilidade_versao r
         ON r.beneficio_id = a.beneficio_id AND r.status = 'ativa'
      WHERE a.colaborador_id = $1 AND a.fim IS NULL
      ORDER BY b.nome
      FOR UPDATE OF a`,
    [colaboradorId]
  );
  return rows.map((linha) => ({
    id: Number(linha.id),
    beneficio_id: Number(linha.beneficio_id),
    beneficio_nome: linha.beneficio_nome,
    status: linha.status,
    valor: numeroOuNulo(linha.valor),
    desconto: numeroOuNulo(linha.desconto),
    criterio: linha.criterio,
  }));
}

export async function inserirAdesao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    beneficio_id: number;
    inicio: string;
    valor: number | null;
    desconto: number | null;
    demanda_id: number | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.adesao
       (colaborador_id, beneficio_id, inicio, valor, desconto, demanda_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.beneficio_id,
      dados.inicio,
      dados.valor,
      dados.desconto,
      dados.demanda_id,
    ]
  );
  return Number(rows[0].id);
}

export async function cancelarAdesaoNoBanco(
  cliente: PoolClient,
  id: number,
  fim: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.adesao SET status = 'cancelada', fim = $2 WHERE id = $1`,
    [id, fim]
  );
}

/**
 * Fecha a adesão porque o CONTRATO dela acabou (transferência entre empresas
 * do grupo). Recebe o INÍCIO do vínculo novo e fecha na véspera — o mesmo
 * corte de `encerrarPosicao`/`encerrarLotacao`, para não haver um dia sem dono.
 * Distinto de `cancelarAdesaoNoBanco`, que é o cancelamento pedido por alguém:
 * aqui a data é imposta pelo ato. `GREATEST` protege o CHECK `fim >= inicio`
 * da adesão que tenha começado no próprio dia da transferência.
 */
export async function encerrarAdesaoPorFimDoVinculo(
  cliente: PoolClient,
  id: number,
  inicioDoVinculoNovo: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.adesao
        SET status = 'cancelada', fim = GREATEST(inicio, $2::date - 1),
            atualizado_em = now()
      WHERE id = $1 AND fim IS NULL`,
    [id, inicioDoVinculoNovo]
  );
}

// ------------------------------------------------------------------ revisão de valor (H3/H4)

/**
 * Fecha a adesão porque o VALOR dela foi revisto — não porque ela acabou.
 *
 * Distinta de `cancelarAdesaoNoBanco` (alguém pediu para sair) e de
 * `encerrarAdesaoPorFimDoVinculo` (o contrato acabou): aqui o benefício
 * CONTINUA, com outro valor. Por isso o status permanece `ativa` e só o `fim`
 * é escrito — o CHECK da 0009 só exige `fim` para o status `cancelada`, e o
 * índice `adesao_uma_vigente` é parcial em `WHERE fim IS NULL`, então escrever
 * o `fim` é o que libera o lugar para a adesão nova do mesmo par.
 *
 * `GREATEST` protege o CHECK `fim >= inicio` na revisão feita no mesmo dia em
 * que a adesão começou — o mesmo cuidado da transferência entre empresas.
 */
export async function encerrarAdesaoPorRevisao(
  cliente: PoolClient,
  id: number,
  inicioDoValorNovo: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.adesao
        SET fim = GREATEST(inicio, $2::date - 1), atualizado_em = now()
      WHERE id = $1 AND fim IS NULL`,
    [id, inicioDoValorNovo]
  );
}

export async function inserirPedidoRevisao(
  cliente: PoolClient,
  dados: {
    adesao_id: number;
    demanda_id: number;
    valor_pedido: number;
    motivo: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.pedido_revisao_beneficio
       (adesao_id, demanda_id, valor_pedido, motivo)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [dados.adesao_id, dados.demanda_id, dados.valor_pedido, dados.motivo]
  );
  return Number(rows[0].id);
}

/**
 * demanda_id → valor pedido, em lote — alimenta a listagem de solicitações sem
 * uma consulta por linha. Só o valor: o motivo já viaja na descrição da
 * demanda, e o valor ATUAL a tela tira da adesão vigente que ela já tem.
 */
export async function valoresPedidosPorDemandas(
  demandaIds: number[]
): Promise<Map<number, number>> {
  if (demandaIds.length === 0) return new Map();
  const linhas = await consultar<{ demanda_id: string; valor_pedido: string }>(
    `SELECT demanda_id, valor_pedido
       FROM rh.pedido_revisao_beneficio
      WHERE demanda_id = ANY($1)`,
    [demandaIds]
  );
  return new Map(
    linhas.map((linha) => [Number(linha.demanda_id), Number(linha.valor_pedido)])
  );
}

export interface PedidoRevisao {
  id: number;
  adesao_id: number;
  demanda_id: number;
  valor_pedido: number;
  motivo: string;
  colaborador_id: number;
  beneficio_id: number;
  beneficio_nome: string;
  valor_atual: number;
  desconto_atual: number;
  adesao_encerrada: boolean;
}

/** O pedido de uma demanda, com a adesão que ele quer mudar. */
export async function buscarPedidoRevisaoPorDemanda(
  cliente: PoolClient,
  demandaId: number
): Promise<PedidoRevisao | null> {
  const { rows } = await cliente.query<{
    id: string;
    adesao_id: string;
    demanda_id: string;
    valor_pedido: string;
    motivo: string;
    colaborador_id: string;
    beneficio_id: string;
    beneficio_nome: string;
    valor_atual: string;
    desconto_atual: string;
    adesao_encerrada: boolean;
  }>(
    `SELECT p.id, p.adesao_id, p.demanda_id, p.valor_pedido, p.motivo,
            a.colaborador_id, a.beneficio_id, b.nome AS beneficio_nome,
            a.valor AS valor_atual, a.desconto AS desconto_atual,
            a.fim IS NOT NULL AS adesao_encerrada
       FROM rh.pedido_revisao_beneficio p
       JOIN rh.adesao a ON a.id = p.adesao_id
       JOIN rh.beneficio b ON b.id = a.beneficio_id
      WHERE p.demanda_id = $1`,
    [demandaId]
  );
  if (rows.length === 0) return null;
  const linha = rows[0];
  return {
    id: Number(linha.id),
    adesao_id: Number(linha.adesao_id),
    demanda_id: Number(linha.demanda_id),
    valor_pedido: Number(linha.valor_pedido),
    motivo: linha.motivo,
    colaborador_id: Number(linha.colaborador_id),
    beneficio_id: Number(linha.beneficio_id),
    beneficio_nome: linha.beneficio_nome,
    valor_atual: Number(linha.valor_atual),
    desconto_atual: Number(linha.desconto_atual),
    adesao_encerrada: linha.adesao_encerrada,
  };
}

/**
 * A competência de folha que cobre a data JÁ FOI FECHADA?
 *
 * Guarda de dinheiro: revisão de valor aprovada hoje não pode retroagir para
 * dentro de um mês cuja folha já fechou — o holerite daquele mês foi emitido, e
 * mudar o valor por baixo faria a folha de uma competência encerrada deixar de
 * bater com o que foi pago. Quem quiser corrigir mês fechado tem o caminho
 * próprio da folha, com reabertura registrada.
 */
export async function competenciaFechadaNaData(
  cliente: PoolClient,
  data: string
): Promise<string | null> {
  const { rows } = await cliente.query<{ competencia: string }>(
    `SELECT lpad(mes::text, 2, '0') || '/' || ano::text AS competencia
       FROM rh_folha.competencia_folha
      WHERE estado = 'fechada'
        AND make_date(ano, mes, 1) <= $1::date
        AND ($1::date) < (make_date(ano, mes, 1) + INTERVAL '1 month')
      LIMIT 1`,
    [data]
  );
  return rows.length > 0 ? rows[0].competencia : null;
}

export async function atualizarStatusAdesao(
  cliente: PoolClient,
  id: number,
  status: StatusAdesao
): Promise<void> {
  await cliente.query(`UPDATE rh.adesao SET status = $2 WHERE id = $1`, [
    id,
    status,
  ]);
}

// ------------------------------------------------------------------ solicitações (demandas do tipo adesao_beneficio)

export interface SolicitacaoBeneficio {
  demanda_id: number;
  numero: number;
  descricao: string;
  status: StatusDemanda;
  prazo: string;
  dias_ate_prazo: number;
  criado_em: string;
  solicitante_usuario_id: number;
  solicitante_nome: string;
  solicitante_colaborador_id: number | null;
}

interface LinhaSolicitacao extends Record<string, unknown> {
  demanda_id: string;
  numero: string;
  descricao: string;
  status: StatusDemanda;
  prazo: string;
  dias_ate_prazo: number;
  criado_em: string;
  solicitante_usuario_id: string;
  solicitante_nome: string;
  solicitante_colaborador_id: string | null;
}

const SELECT_SOLICITACAO = `
  SELECT d.id AS demanda_id, d.numero, d.descricao, d.status,
         d.prazo::text AS prazo, (d.prazo - ${HOJE_SP})::int AS dias_ate_prazo,
         d.criado_em, d.solicitante_usuario_id, u.nome AS solicitante_nome,
         d.solicitante_colaborador_id
    FROM rh.demanda d
    JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
    JOIN sistema.usuario u ON u.id = d.solicitante_usuario_id
   WHERE t.chave IN ('${CHAVE_TIPO_DEMANDA_BENEFICIO}',
                     '${CHAVE_TIPO_DEMANDA_REVISAO}')`;

function paraSolicitacao(linha: LinhaSolicitacao): SolicitacaoBeneficio {
  return {
    ...linha,
    demanda_id: Number(linha.demanda_id),
    numero: Number(linha.numero),
    solicitante_usuario_id: Number(linha.solicitante_usuario_id),
    solicitante_colaborador_id:
      linha.solicitante_colaborador_id === null
        ? null
        : Number(linha.solicitante_colaborador_id),
  };
}

export async function listarSolicitacoesDoUsuario(
  usuarioId: number
): Promise<SolicitacaoBeneficio[]> {
  const linhas = await consultar<LinhaSolicitacao>(
    `${SELECT_SOLICITACAO}
       AND d.solicitante_usuario_id = $1
     ORDER BY d.numero DESC`,
    [usuarioId]
  );
  return linhas.map(paraSolicitacao);
}

export async function listarSolicitacoesPendentes(): Promise<
  SolicitacaoBeneficio[]
> {
  const linhas = await consultar<LinhaSolicitacao>(
    `${SELECT_SOLICITACAO}
       AND d.status IN ('aguardando_aprovacao', 'aberta', 'em_atendimento')
     ORDER BY d.prazo, d.numero`
  );
  return linhas.map(paraSolicitacao);
}

function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

/** Já existe demanda ativa deste usuário para o benefício, na mesma natureza? */
export async function existeSolicitacaoPendente(
  usuarioId: number,
  prefixo: string,
  chave: string
): Promise<boolean> {
  const padrao = `${escaparLike(`${prefixo} "`)}%${escaparLike(`" (chave: ${chave}).`)}%`;
  const linhas = await consultar(
    `SELECT 1 AS um
       FROM rh.demanda d
       JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
      WHERE t.chave IN ('${CHAVE_TIPO_DEMANDA_BENEFICIO}',
                        '${CHAVE_TIPO_DEMANDA_REVISAO}')
        AND d.solicitante_usuario_id = $1
        AND d.status IN ('aguardando_aprovacao', 'aberta', 'em_atendimento')
        AND d.descricao LIKE $2 ESCAPE '\\'`,
    [usuarioId, padrao]
  );
  return linhas.length > 0;
}

export interface DemandaBeneficio {
  id: number;
  numero: number;
  status: StatusDemanda;
  descricao: string;
  solicitante_usuario_id: number;
  solicitante_colaborador_id: number | null;
}

export async function buscarDemandaBeneficioParaTransicao(
  cliente: PoolClient,
  id: number
): Promise<DemandaBeneficio | null> {
  const { rows } = await cliente.query<{
    id: string;
    numero: string;
    status: StatusDemanda;
    descricao: string;
    solicitante_usuario_id: string;
    solicitante_colaborador_id: string | null;
  }>(
    // Duas chaves: a antiga (adesão/cancelamento) e a da revisão de valor, que
    // a H3 acrescentou. Sem a segunda, a demanda de revisão simplesmente não
    // era encontrada aqui e o DP levava um 404 ao tentar decidir.
    `SELECT d.id, d.numero, d.status, d.descricao,
            d.solicitante_usuario_id, d.solicitante_colaborador_id
       FROM rh.demanda d
       JOIN rh.tipo_demanda_versao t ON t.id = d.tipo_demanda_versao_id
      WHERE d.id = $1
        AND t.chave IN ('${CHAVE_TIPO_DEMANDA_BENEFICIO}',
                        '${CHAVE_TIPO_DEMANDA_REVISAO}')
      FOR UPDATE OF d`,
    [id]
  );
  if (rows.length === 0) return null;
  const linha = rows[0];
  return {
    ...linha,
    id: Number(linha.id),
    numero: Number(linha.numero),
    solicitante_usuario_id: Number(linha.solicitante_usuario_id),
    solicitante_colaborador_id:
      linha.solicitante_colaborador_id === null
        ? null
        : Number(linha.solicitante_colaborador_id),
  };
}

// ------------------------------------------------------------------ dependentes (dado de terceiro)

export interface Dependente {
  id: number;
  colaborador_id: number;
  nome: string;
  nascimento: string;
  parentesco: Parentesco;
  cpf: string | null;
}

interface LinhaDependente extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  nome: string;
  nascimento: string;
  parentesco: Parentesco;
  cpf: string | null;
}

function paraDependente(linha: LinhaDependente): Dependente {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
  };
}

export async function listarDependentes(
  colaboradorId: number
): Promise<Dependente[]> {
  const linhas = await consultar<LinhaDependente>(
    `SELECT id, colaborador_id, nome, nascimento::text AS nascimento,
            parentesco, cpf
       FROM rh.dependente
      WHERE colaborador_id = $1
      ORDER BY nome, id`,
    [colaboradorId]
  );
  return linhas.map(paraDependente);
}

export async function inserirDependente(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    nome: string;
    nascimento: string;
    parentesco: Parentesco;
    cpf: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.dependente (colaborador_id, nome, nascimento, parentesco, cpf)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.nome,
      dados.nascimento,
      dados.parentesco,
      dados.cpf,
    ]
  );
  return Number(rows[0].id);
}

export async function buscarDependenteParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<Dependente | null> {
  const { rows } = await cliente.query<LinhaDependente>(
    `SELECT id, colaborador_id, nome, nascimento::text AS nascimento,
            parentesco, cpf
       FROM rh.dependente
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return rows.length > 0 ? paraDependente(rows[0]) : null;
}

export async function atualizarDependente(
  cliente: PoolClient,
  id: number,
  campos: {
    nome?: string;
    nascimento?: string;
    parentesco?: Parentesco;
    cpf?: string | null;
  }
): Promise<void> {
  const colunas: Record<string, string> = {
    nome: "nome",
    nascimento: "nascimento",
    parentesco: "parentesco",
    cpf: "cpf",
  };
  const chaves = Object.keys(campos) as (keyof typeof campos)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${colunas[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE rh.dependente SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [id, ...chaves.map((chave) => campos[chave])]
  );
}

export async function excluirDependente(
  cliente: PoolClient,
  id: number
): Promise<void> {
  await cliente.query(`DELETE FROM rh.dependente WHERE id = $1`, [id]);
}

// ------------------------------------------------------------------ apoio às telas do DP

export interface UnidadeOpcao {
  id: number;
  unidade: string | null;
}

export async function listarUnidades(): Promise<UnidadeOpcao[]> {
  const linhas = await consultar<{ id: string; unidade: string | null }>(
    `SELECT e.id, ev.unidade
       FROM rh.estabelecimento e
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = e.id AND ev.status = 'ativa'
      ORDER BY ev.unidade NULLS LAST, e.id`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function contarEstabelecimentos(
  cliente: PoolClient,
  ids: number[]
): Promise<number> {
  const { rows } = await cliente.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM rh.estabelecimento WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  return Number(rows[0].total);
}

export interface ColaboradorOpcao {
  id: number;
  nome_completo: string;
  matricula: string;
}

export async function listarColaboradoresAtivos(): Promise<ColaboradorOpcao[]> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    matricula: string;
  }>(
    `SELECT id, nome_completo, matricula
       FROM rh.colaborador
      WHERE status <> 'desligado'
      ORDER BY nome_completo, id`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}
