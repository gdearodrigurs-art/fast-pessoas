import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { FiltroEstrutura } from "../estrutura/esquemas";
import { condicaoFiltroEstrutura } from "../estrutura/repositorio";
import {
  Cha,
  FiltroColaboradores,
  Genero,
  GENEROS,
  MINIMO_POR_RECORTE_MIN,
  MINIMO_POR_RECORTE_PADRAO,
  StatusAcao,
  StatusColaborador,
  TipoOcorrencia,
  TipoVinculo,
} from "./esquemas";

// ------------------------------------------------------------------ escopo de visibilidade
// A regra "quem vê quem" é do repositório: gestor enxerga a si e aos liderados
// com relação VIGENTE; funcionário só a própria ficha; rh/dp/diretoria, todos.

export type Escopo =
  | { alcance: "todos" }
  | { alcance: "equipe"; colaboradorId: number | null }
  | { alcance: "proprio"; colaboradorId: number | null };

function condicaoEscopo(
  escopo: Escopo,
  parametros: unknown[],
  alias = "c"
): string {
  if (escopo.alcance === "todos") return "TRUE";
  if (escopo.colaboradorId === null) return "FALSE";
  parametros.push(escopo.colaboradorId);
  const n = parametros.length;
  if (escopo.alcance === "proprio") return `${alias}.id = $${n}`;
  return `(${alias}.id = $${n} OR ${alias}.id IN (
      SELECT rg.liderado_colaborador_id
        FROM rh.relacao_gestor rg
       WHERE rg.gestor_colaborador_id = $${n} AND rg.fim_vigencia IS NULL))`;
}

/**
 * O vínculo que responde por "eu". Passa por rh.vinculo_atual (migration 0046)
 * em vez de `WHERE usuario_id = $1`: desde que a PESSOA subiu para tabela
 * própria, uma conta pode ter mais de um vínculo (readmissão em outro CNPJ do
 * grupo) e aquele WHERE devolveria N linhas. Com um vínculo só — o caso de
 * hoje — devolve exatamente o mesmo id de antes.
 */
export async function colaboradorIdDoUsuario(
  usuarioId: number
): Promise<number | null> {
  const linhas = await consultar<{ id: string }>(
    "SELECT id FROM rh.colaborador WHERE id = rh.vinculo_atual($1)",
    [usuarioId]
  );
  return linhas.length > 0 ? Number(linhas[0].id) : null;
}

export async function temPermissao(
  usuarioId: number,
  chave: string
): Promise<boolean> {
  const linhas = await consultar<{ autorizado: boolean }>(
    "SELECT sistema.tem_permissao($1, $2) AS autorizado",
    [usuarioId, chave]
  );
  return Boolean(linhas[0]?.autorizado);
}

export async function colaboradorNoEscopo(
  id: number,
  escopo: Escopo
): Promise<boolean> {
  const parametros: unknown[] = [id];
  const linhas = await consultar<{ id: string }>(
    `SELECT c.id FROM rh.colaborador c
      WHERE c.id = $1 AND ${condicaoEscopo(escopo, parametros)}`,
    parametros
  );
  return linhas.length > 0;
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

export interface ColaboradorResumo {
  id: number;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  cargo_nome: string | null;
  // Os TRÊS campos da 0047, cada um com nome próprio. Eles vêm da mesma linha
  // de alocação que o filtro compara — o que a tela mostra e o que o filtro
  // recorta têm que ser a mesma coisa.
  /** REGISTRO: em qual empresa do grupo o vínculo está registrado. */
  empresa_id: number | null;
  empresa_nome: string | null;
  /** LOTAÇÃO: o local físico onde a pessoa trabalha. */
  unidade: string | null;
  /** CENTRO DE CUSTO: o código (o nome legível vem em centro_custo_nome). */
  centro_custo: string | null;
  centro_custo_nome: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
}

/** Um contrato da pessoa, para a ficha mostrar a vida dela no grupo inteiro. */
export interface VinculoDaPessoa {
  id: number;
  matricula: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  data_desligamento: string | null;
  /** REGISTRO do contrato: em qual empresa do grupo ele existe (0047/0048). */
  empresa_id: number | null;
  empresa_nome: string | null;
  /** Elo da transferência entre empresas (0048): quem continua quem. */
  sucede_vinculo_id: number | null;
  sucedido_por_vinculo_id: number | null;
}

export interface FichaColaborador extends ColaboradorResumo {
  usuario_id: number;
  /** A PESSOA por trás deste vínculo (migration 0046). */
  pessoa_id: number;
  /** Todos os contratos dela, deste inclusive — do mais antigo ao mais novo. */
  vinculos: VinculoDaPessoa[];
  matricula_esocial: string;
  cpf: string;
  data_nascimento: string | null;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  email: string;
  usuario_ativo: boolean;
  gestor_id: number | null;
  gestor_nome: string | null;
  ultimo_feedback_em: string | null;
  /**
   * RCF vigente do cargo da posição atual — pedido explícito da analista de RH.
   * Documento de gestão, não dado sensível: vai para quem já vê a ficha.
   * `genero` NÃO entra aqui de propósito (só agregado — ver esquemas.ts).
   */
  rcf: RcfCargo | null;
}

export interface ColaboradorParaAtualizar {
  id: number;
  usuario_id: number;
  pessoa_id: number;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  data_nascimento: string | null;
  genero: Genero;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  usuario_ativo: boolean;
}

export interface EventoLinhaTempo {
  id: number;
  tipo: string;
  ocorrido_em: string;
  resumo: string;
  /** Em qual contrato o fato aconteceu — a linha do tempo atravessa vínculos. */
  vinculo_id: number;
  vinculo_matricula: string;
}

/** Campos do VÍNCULO (o contrato). Ver CamposPessoa para os da pessoa. */
export interface CamposColaborador {
  tipo_vinculo?: TipoVinculo;
  status?: StatusColaborador;
  data_desligamento?: string | null;
}

/**
 * Campos da PESSOA. Gravam em rh.pessoa e descem sozinhos para TODOS os
 * vínculos dela (trigger de projeção da migration 0046) — é o que garante que
 * corrigir o nome num contrato corrija no outro.
 */
export interface CamposPessoa {
  nome_completo?: string;
  retrato?: string | null;
  contexto?: string | null;
  data_nascimento?: string;
  genero?: Genero;
}

interface LinhaResumo extends Record<string, unknown> {
  id: string;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
  cargo_nome: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  unidade: string | null;
  centro_custo: string | null;
  centro_custo_nome: string | null;
  dias_desde_feedback: number | null;
  dias_desde_admissao: number;
}

interface LinhaFicha extends LinhaResumo {
  usuario_id: string;
  pessoa_id: string;
  matricula_esocial: string;
  cpf: string;
  data_nascimento: string | null;
  data_desligamento: string | null;
  retrato: string | null;
  contexto: string | null;
  email: string;
  usuario_ativo: boolean;
  gestor_id: string | null;
  gestor_nome: string | null;
  ultimo_feedback_em: string | null;
  rcf: RcfCargo | null;
}

// ------------------------------------------------------------------ RCF (descritivo de cargo)

/** RCF vigente de um cargo, na ordem do documento oficial. */
export interface RcfCargo {
  cargo_id: number;
  versao_id: number;
  nome: string;
  setor: string | null;
  cargo_lider_id: number | null;
  cargo_lider_nome: string | null;
  tipo_contrato_previsto: TipoVinculo | null;
  missao: string | null;
  atividades: string[];
  cha: Cha;
  observacoes: string | null;
  descricao: string | null;
  inicio_vigencia: string;
}

// Colunas do RCF na ordem do modelo — reaproveitadas pelas consultas de cargo.
const COLUNAS_RCF = `cv.setor, cv.cargo_lider_id, cv.tipo_contrato_previsto,
            cv.missao, cv.atividades, cv.cha, cv.observacoes`;

/**
 * RCF da ficha: parte da posição VIGENTE, resolve o cargo pela versão pinada e
 * lê a versão ATIVA daquele cargo — o documento que vale hoje, não o que valia
 * quando a posição começou (a versão pinada continua servindo ao histórico).
 */
const LATERAL_RCF_DA_POSICAO = `
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
             'cargo_id',               cv.cargo_id,
             'versao_id',              cv.id,
             'nome',                   cv.nome,
             'setor',                  cv.setor,
             'cargo_lider_id',         cv.cargo_lider_id,
             'cargo_lider_nome',       lider.nome,
             'tipo_contrato_previsto', cv.tipo_contrato_previsto,
             'missao',                 cv.missao,
             'atividades',             cv.atividades,
             'cha',                    cv.cha,
             'observacoes',            cv.observacoes,
             'descricao',              cv.descricao,
             'inicio_vigencia',        cv.inicio_vigencia::text
           ) AS rcf
      FROM rh.posicao_colaborador p
      JOIN rh.cargo_versao pin ON pin.id = p.cargo_versao_id
      JOIN rh.cargo_versao cv
        ON cv.cargo_id = pin.cargo_id AND cv.status = 'ativa'
      LEFT JOIN LATERAL (
        SELECT cl.nome
          FROM rh.cargo_versao cl
         WHERE cl.cargo_id = cv.cargo_lider_id AND cl.status = 'ativa'
      ) lider ON TRUE
     -- Última posição, não só a aberta: o contrato encerrado direito (ver
     -- LATERAIS_VIGENTES) não tem posição vigente, e o RCF do cargo em que a
     -- pessoa estava continua sendo a resposta certa para "o que ela fazia".
     WHERE p.colaborador_id = c.id
     ORDER BY p.inicio_vigencia DESC, p.id DESC
     LIMIT 1
  ) rcf ON TRUE`;

/** RCF vigente de um cargo — usado pela visualização imprimível. */
export async function buscarRcfPorCargo(
  cargoId: number
): Promise<RcfCargo | null> {
  const linhas = await consultar<{
    cargo_id: string;
    versao_id: string;
    nome: string;
    setor: string | null;
    cargo_lider_id: string | null;
    cargo_lider_nome: string | null;
    tipo_contrato_previsto: TipoVinculo | null;
    missao: string | null;
    atividades: string[];
    cha: Cha;
    observacoes: string | null;
    descricao: string | null;
    inicio_vigencia: string;
  }>(
    `SELECT cv.cargo_id, cv.id AS versao_id, cv.nome, ${COLUNAS_RCF},
            cv.descricao, cv.inicio_vigencia::text AS inicio_vigencia,
            lider.nome AS cargo_lider_nome
       FROM rh.cargo_versao cv
       LEFT JOIN LATERAL (
         SELECT cl.nome
           FROM rh.cargo_versao cl
          WHERE cl.cargo_id = cv.cargo_lider_id AND cl.status = 'ativa'
       ) lider ON TRUE
      WHERE cv.cargo_id = $1 AND cv.status = 'ativa'`,
    [cargoId]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...linha,
    cargo_id: Number(linha.cargo_id),
    versao_id: Number(linha.versao_id),
    cargo_lider_id:
      linha.cargo_lider_id === null ? null : Number(linha.cargo_lider_id),
  };
}

// Laterais compartilhadas de projeção vigente (cargo, lotação, gestor, feedback).
//
// "VIGENTE, ou a ÚLTIMA quando o contrato acabou" — não é o mesmo que
// `fim_vigencia IS NULL`. Um vínculo ENCERRADO direito não tem nenhuma linha
// aberta: a transferência entre empresas (0048) fecha posição e alocação na
// véspera, como manda a vigência. Filtrando só pelo aberto, a ficha do contrato
// encerrado mostrava "REGISTRO —, LOTAÇÃO —, CENTRO DE CUSTO —" e contradizia,
// na mesma página, a tabela de vínculos (que já lê a última alocação, via
// rh.vinculos_da_pessoa). Quem saiu do grupo continua tendo saído DE algum
// lugar, e é isso que o DP procura na ficha.
// Mesma ordenação de rh.vinculos_da_pessoa: início mais recente primeiro.
const LATERAIS_VIGENTES = `
  LEFT JOIN LATERAL (
    SELECT cv.nome AS cargo_nome
      FROM rh.posicao_colaborador p
      JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
     WHERE p.colaborador_id = c.id
     ORDER BY p.inicio_vigencia DESC, p.id DESC
     LIMIT 1
  ) pos ON TRUE
  -- Registro, lotação e centro de custo (migration 0047): três campos
  -- independentes, lidos da view que já resolve o nome de cada catálogo.
  LEFT JOIN LATERAL (
    SELECT ld.empresa_id, ld.empresa_nome,
           ld.estabelecimento_id,
           ld.lotacao_nome AS unidade,
           ld.centro_custo_id,
           ld.centro_custo_codigo AS centro_custo, ld.centro_custo_nome
      FROM rh.lotacao_detalhada ld
     WHERE ld.colaborador_id = c.id
     ORDER BY ld.inicio_vigencia DESC, ld.id DESC
     LIMIT 1
  ) lot ON TRUE
  LEFT JOIN LATERAL (
    SELECT f.realizado_em::text AS ultimo_feedback_em,
           ((now() AT TIME ZONE 'America/Sao_Paulo')::date - f.realizado_em)
             AS dias_desde_feedback
      FROM rh.feedback_formal f
     WHERE f.colaborador_id = c.id
     ORDER BY f.realizado_em DESC, f.id DESC
     LIMIT 1
  ) fb ON TRUE`;

export async function listar(
  filtro: FiltroColaboradores,
  escopo: Escopo
): Promise<ColaboradorResumo[]> {
  const parametros: unknown[] = [];
  const condicoes: string[] = [condicaoEscopo(escopo, parametros)];
  if (filtro.busca) {
    parametros.push(`%${filtro.busca}%`);
    condicoes.push(
      `(c.nome_completo ILIKE $${parametros.length} OR c.matricula ILIKE $${parametros.length})`
    );
  }
  if (filtro.status) {
    parametros.push(filtro.status);
    condicoes.push(`c.status = $${parametros.length}`);
  }
  // Recorte pelos TRÊS campos da 0047, combinável entre si e com busca/status.
  // A condição compara a MESMA linha de alocação que `lot` projeta na tela —
  // ver condicaoFiltroEstrutura.
  const filtroEstrutura = condicaoFiltroEstrutura(filtro, parametros, "c");
  const linhas = await consultar<LinhaResumo>(
    `SELECT c.id, c.matricula, c.nome_completo, c.tipo_vinculo, c.status,
            c.data_admissao::text AS data_admissao,
            pos.cargo_nome,
            lot.empresa_id, lot.empresa_nome, lot.unidade,
            lot.centro_custo, lot.centro_custo_nome,
            fb.dias_desde_feedback,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_admissao)
              AS dias_desde_admissao
       FROM rh.colaborador c
       ${LATERAIS_VIGENTES}
      WHERE ${condicoes.join(" AND ")}${filtroEstrutura}
      ORDER BY c.nome_completo, c.id`,
    parametros
  );
  return linhas.map(montarResumo);
}

function montarResumo(linha: LinhaResumo): ColaboradorResumo {
  return {
    ...linha,
    id: Number(linha.id),
    empresa_id: linha.empresa_id === null ? null : Number(linha.empresa_id),
  };
}

export async function buscarFicha(
  id: number,
  escopo: Escopo
): Promise<FichaColaborador | null> {
  const parametros: unknown[] = [id];
  const linhas = await consultar<LinhaFicha>(
    `SELECT c.id, c.usuario_id, c.pessoa_id, c.matricula, c.matricula_esocial,
            c.cpf, c.nome_completo, c.tipo_vinculo, c.status,
            c.data_admissao::text AS data_admissao,
            c.data_nascimento::text AS data_nascimento,
            c.data_desligamento::text AS data_desligamento,
            c.retrato, c.contexto,
            u.email, u.ativo AS usuario_ativo,
            pos.cargo_nome,
            lot.empresa_id, lot.empresa_nome, lot.unidade,
            lot.centro_custo, lot.centro_custo_nome,
            ges.gestor_id, ges.gestor_nome,
            fb.ultimo_feedback_em, fb.dias_desde_feedback,
            rcf.rcf,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_admissao)
              AS dias_desde_admissao
       FROM rh.colaborador c
       -- A conta é da PESSOA, não do contrato (migration 0046): dois vínculos
       -- da mesma gente compartilham o mesmo login.
       JOIN sistema.usuario u ON u.pessoa_id = c.pessoa_id
       ${LATERAIS_VIGENTES}
       LEFT JOIN LATERAL (
         SELECT g.id AS gestor_id, g.nome_completo AS gestor_nome
           FROM rh.relacao_gestor rg
           JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
          WHERE rg.liderado_colaborador_id = c.id AND rg.fim_vigencia IS NULL
       ) ges ON TRUE
       ${LATERAL_RCF_DA_POSICAO}
      WHERE c.id = $1 AND ${condicaoEscopo(escopo, parametros)}`,
    parametros
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  const pessoaId = Number(linha.pessoa_id);
  return {
    ...linha,
    id: Number(linha.id),
    usuario_id: Number(linha.usuario_id),
    pessoa_id: pessoaId,
    vinculos: await listarVinculosDaPessoa(pessoaId),
    empresa_id: linha.empresa_id === null ? null : Number(linha.empresa_id),
    gestor_id: linha.gestor_id === null ? null : Number(linha.gestor_id),
  };
}

/** Contratos da pessoa no grupo, do mais antigo ao mais novo. */
export async function listarVinculosDaPessoa(
  pessoaId: number
): Promise<VinculoDaPessoa[]> {
  const linhas = await consultar<{
    id: string;
    matricula: string;
    tipo_vinculo: TipoVinculo;
    status: StatusColaborador;
    data_admissao: string;
    data_desligamento: string | null;
    empresa_id: string | null;
    empresa_nome: string | null;
    sucede_vinculo_id: string | null;
    sucedido_por_vinculo_id: string | null;
  }>(
    `SELECT id, matricula, tipo_vinculo, status,
            data_admissao::text AS data_admissao,
            data_desligamento::text AS data_desligamento,
            empresa_id, empresa_nome,
            sucede_vinculo_id, sucedido_por_vinculo_id
       FROM rh.vinculos_da_pessoa($1)`,
    [pessoaId]
  );
  const numeroOuNulo = (valor: string | null) =>
    valor === null ? null : Number(valor);
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    empresa_id: numeroOuNulo(linha.empresa_id),
    sucede_vinculo_id: numeroOuNulo(linha.sucede_vinculo_id),
    sucedido_por_vinculo_id: numeroOuNulo(linha.sucedido_por_vinculo_id),
  }));
}

/**
 * A linha do tempo é da PESSOA, não do contrato. Cada fato continua nascendo
 * num vínculo (rh.evento_colaborador aponta para rh.colaborador e continua
 * append-only), mas a pergunta da ficha é "o que aconteceu com esta pessoa" —
 * e a resposta soma os vínculos dela, identificando em qual cada fato caiu.
 * É o que o dono pediu ao dizer que não queria perder o histórico de quem é
 * demitido e recontratado em outra empresa do grupo.
 */
export async function listarEventos(
  colaboradorId: number,
  incluirRestritos: boolean
): Promise<EventoLinhaTempo[]> {
  const linhas = await consultar<{
    id: string;
    tipo: string;
    ocorrido_em: string;
    resumo: string;
    vinculo_id: string;
    vinculo_matricula: string;
  }>(
    `SELECT e.id, e.tipo, e.ocorrido_em, e.resumo,
            e.vinculo_id, e.vinculo_matricula
       FROM rh.evento_da_pessoa e
      WHERE e.pessoa_id = (SELECT pessoa_id FROM rh.colaborador WHERE id = $1)
        AND ($2 OR COALESCE(e.payload->>'restrita', 'false') <> 'true')
      ORDER BY e.ocorrido_em DESC, e.id DESC`,
    [colaboradorId, incluirRestritos]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    vinculo_id: Number(linha.vinculo_id),
  }));
}

/** Pessoa existente com este CPF (null quando é gente nova para o grupo). */
export async function buscarPessoaPorCpf(
  cliente: PoolClient,
  cpf: string
): Promise<{ id: number; nome_completo: string } | null> {
  const { rows } = await cliente.query<{ id: string; nome_completo: string }>(
    "SELECT id, nome_completo FROM rh.pessoa WHERE cpf = $1 FOR UPDATE",
    [cpf]
  );
  return rows.length
    ? { id: Number(rows[0].id), nome_completo: rows[0].nome_completo }
    : null;
}

export async function criarPessoa(
  cliente: PoolClient,
  dados: {
    cpf: string;
    nome_completo: string;
    // Opcionais de propósito: a admissão vinda de Recrutamento (outro domínio)
    // ainda não coleta estes dois campos do candidato. A coluna é nullable (ver
    // migration 0020) e o relatório conta explicitamente as fichas sem data de
    // nascimento — a lacuna aparece em vez de virar zero.
    // EVOLUÇÃO: pedir data de nascimento e gênero no aceite da proposta em R&S.
    data_nascimento?: string | null;
    genero?: Genero;
    retrato: string | null;
    contexto: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.pessoa
       (cpf, nome_completo, data_nascimento, genero, retrato, contexto)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      dados.cpf,
      dados.nome_completo,
      dados.data_nascimento ?? null,
      dados.genero ?? "nao_informado",
      dados.retrato,
      dados.contexto,
    ]
  );
  return Number(rows[0].id);
}

/** Liga uma conta de acesso à pessoa. Uma conta por gente (UNIQUE no banco). */
export async function vincularContaAPessoa(
  cliente: PoolClient,
  usuarioId: number,
  pessoaId: number
): Promise<void> {
  await cliente.query(
    "UPDATE sistema.usuario SET pessoa_id = $2 WHERE id = $1",
    [usuarioId, pessoaId]
  );
}

/**
 * Cria o VÍNCULO. cpf, nome, nascimento, gênero, retrato, contexto e usuario_id
 * NÃO são passados aqui de propósito: desde a 0046 são leitura da pessoa,
 * preenchidos pelo trigger `colaborador_projetar_pessoa`. O que se grava num
 * vínculo é só o que é do contrato.
 */
export async function criar(
  cliente: PoolClient,
  dados: {
    pessoa_id: number;
    matricula: string;
    matricula_esocial: string;
    tipo_vinculo: TipoVinculo;
    data_admissao: string;
  }
): Promise<VinculoCriado> {
  const { rows } = await cliente.query<{
    id: string;
    matricula: string;
    nome_completo: string;
    tipo_vinculo: TipoVinculo;
    status: StatusColaborador;
    data_admissao: string;
  }>(
    `INSERT INTO rh.colaborador
       (pessoa_id, matricula, matricula_esocial, tipo_vinculo, data_admissao)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, matricula, nome_completo, tipo_vinculo, status,
               data_admissao::text AS data_admissao`,
    [
      dados.pessoa_id,
      dados.matricula,
      dados.matricula_esocial,
      dados.tipo_vinculo,
      dados.data_admissao,
    ]
  );
  const linha = rows[0];
  return { ...linha, id: Number(linha.id) };
}

/**
 * O que existe no instante em que o vínculo nasce. NÃO é `ColaboradorResumo`:
 * cargo, registro, lotação e centro de custo ainda não foram alocados, e
 * devolvê-los como null aqui seria dizer "não tem" no lugar de "ainda não foi
 * definido".
 */
export interface VinculoCriado {
  id: number;
  matricula: string;
  nome_completo: string;
  tipo_vinculo: TipoVinculo;
  status: StatusColaborador;
  data_admissao: string;
}

export async function buscarParaAtualizar(
  cliente: PoolClient,
  id: number
): Promise<ColaboradorParaAtualizar | null> {
  const { rows } = await cliente.query<{
    id: string;
    usuario_id: string;
    pessoa_id: string;
    matricula: string;
    nome_completo: string;
    tipo_vinculo: TipoVinculo;
    status: StatusColaborador;
    data_admissao: string;
    data_nascimento: string | null;
    genero: Genero;
    data_desligamento: string | null;
    retrato: string | null;
    contexto: string | null;
    usuario_ativo: boolean;
  }>(
    `SELECT c.id, c.usuario_id, c.pessoa_id, c.matricula, c.nome_completo,
            c.tipo_vinculo, c.status,
            c.data_desligamento::text AS data_desligamento,
            c.data_admissao::text AS data_admissao,
            c.data_nascimento::text AS data_nascimento, c.genero,
            c.retrato, c.contexto, u.ativo AS usuario_ativo
       FROM rh.colaborador c
       JOIN sistema.usuario u ON u.pessoa_id = c.pessoa_id
      WHERE c.id = $1
      FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) return null;
  const linha = rows[0];
  return {
    ...linha,
    id: Number(linha.id),
    usuario_id: Number(linha.usuario_id),
    pessoa_id: Number(linha.pessoa_id),
  };
}

const COLUNAS_ATUALIZAVEIS: Record<keyof CamposColaborador, string> = {
  tipo_vinculo: "tipo_vinculo",
  status: "status",
  data_desligamento: "data_desligamento",
};

const COLUNAS_PESSOA: Record<keyof CamposPessoa, string> = {
  nome_completo: "nome_completo",
  retrato: "retrato",
  contexto: "contexto",
  data_nascimento: "data_nascimento",
  genero: "genero",
};

/** Escreve o que é do CONTRATO. */
export async function atualizar(
  cliente: PoolClient,
  id: number,
  campos: CamposColaborador
): Promise<void> {
  const chaves = Object.keys(campos) as (keyof CamposColaborador)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${COLUNAS_ATUALIZAVEIS[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE rh.colaborador SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [id, ...chaves.map((chave) => campos[chave])]
  );
}

/**
 * Escreve o que é da PESSOA. O trigger da 0046 desce o valor para todos os
 * vínculos dela — corrigir o nome num contrato corrige no outro, que é o
 * comportamento certo para quem foi readmitido em outra empresa do grupo.
 */
export async function atualizarPessoa(
  cliente: PoolClient,
  pessoaId: number,
  campos: CamposPessoa
): Promise<void> {
  const chaves = Object.keys(campos) as (keyof CamposPessoa)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${COLUNAS_PESSOA[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE rh.pessoa SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [pessoaId, ...chaves.map((chave) => campos[chave])]
  );
}

export async function inserirEvento(
  cliente: PoolClient,
  evento: {
    colaborador_id: number;
    tipo: string;
    ocorrido_em: string;
    origem_tabela: string;
    origem_id: number;
    resumo: string;
    payload: Record<string, unknown>;
    registrado_por: number;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.evento_colaborador
       (colaborador_id, tipo, ocorrido_em, origem_tabela, origem_id, resumo,
        payload, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      evento.colaborador_id,
      evento.tipo,
      evento.ocorrido_em,
      evento.origem_tabela,
      evento.origem_id,
      evento.resumo,
      JSON.stringify(evento.payload),
      evento.registrado_por,
    ]
  );
}

/**
 * Desliga a CONTA de acesso. A conta é da pessoa (0046), e a pessoa pode ter
 * mais de um contrato: desativar por causa de UM desligamento trancaria alguém
 * que continua trabalhando no outro CNPJ do grupo. Por isso a condição — só
 * apaga o acesso quando não sobra nenhum vínculo em pé. Devolve se desativou,
 * para o chamador registrar a trilha só quando houve mudança de verdade.
 */
export async function desativarUsuario(
  cliente: PoolClient,
  usuarioId: number
): Promise<boolean> {
  const { rowCount } = await cliente.query(
    `UPDATE sistema.usuario u
        SET ativo = FALSE
      WHERE u.id = $1
        AND NOT EXISTS (
          SELECT 1 FROM rh.colaborador c
           WHERE c.pessoa_id = u.pessoa_id AND c.status <> 'desligado')`,
    [usuarioId]
  );
  return (rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ apoio a escritas

export interface ColaboradorBasico {
  id: number;
  nome_completo: string;
  matricula: string;
  status: StatusColaborador;
}

export async function buscarBasico(
  cliente: PoolClient,
  id: number
): Promise<ColaboradorBasico | null> {
  const { rows } = await cliente.query<{
    id: string;
    nome_completo: string;
    matricula: string;
    status: StatusColaborador;
  }>(
    `SELECT id, nome_completo, matricula, status
       FROM rh.colaborador WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

// ------------------------------------------------------------------ ocorrências (append-only)

export interface Ocorrencia {
  id: number;
  tipo: TipoOcorrencia;
  restrita: boolean;
  descricao: string;
  impacto: string | null;
  acao_combinada: string | null;
  ocorrida_em: string;
  registrado_por_nome: string;
  registrado_em: string;
}

export async function listarOcorrencias(
  colaboradorId: number,
  incluirRestritas: boolean
): Promise<Ocorrencia[]> {
  const linhas = await consultar<{
    id: string;
    tipo: TipoOcorrencia;
    restrita: boolean;
    descricao: string;
    impacto: string | null;
    acao_combinada: string | null;
    ocorrida_em: string;
    registrado_por_nome: string;
    registrado_em: string;
  }>(
    `SELECT o.id, o.tipo, o.restrita, o.descricao, o.impacto, o.acao_combinada,
            o.ocorrida_em::text AS ocorrida_em,
            u.nome AS registrado_por_nome,
            o.registrado_em::text AS registrado_em
       FROM rh.ocorrencia o
       JOIN sistema.usuario u ON u.id = o.registrado_por
      WHERE o.colaborador_id = $1 AND ($2 OR NOT o.restrita)
      ORDER BY o.ocorrida_em DESC, o.id DESC`,
    [colaboradorId, incluirRestritas]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function inserirOcorrencia(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    tipo: TipoOcorrencia;
    restrita: boolean;
    descricao: string;
    impacto: string | null;
    acao_combinada: string | null;
    ocorrida_em: string;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ocorrencia
       (colaborador_id, tipo, restrita, descricao, impacto, acao_combinada,
        ocorrida_em, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.tipo,
      dados.restrita,
      dados.descricao,
      dados.impacto,
      dados.acao_combinada,
      dados.ocorrida_em,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ feedback formal (append-only)

export interface Feedback {
  id: number;
  realizado_em: string;
  resumo: string;
  registrado_por_nome: string;
  registrado_em: string;
}

export async function listarFeedbacks(
  colaboradorId: number
): Promise<Feedback[]> {
  const linhas = await consultar<{
    id: string;
    realizado_em: string;
    resumo: string;
    registrado_por_nome: string;
    registrado_em: string;
  }>(
    `SELECT f.id, f.realizado_em::text AS realizado_em, f.resumo,
            u.nome AS registrado_por_nome,
            f.registrado_em::text AS registrado_em
       FROM rh.feedback_formal f
       JOIN sistema.usuario u ON u.id = f.registrado_por
      WHERE f.colaborador_id = $1
      ORDER BY f.realizado_em DESC, f.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function cadenciaFeedback(colaboradorId: number): Promise<{
  data_admissao: string;
  ultimo_em: string | null;
  dias_desde: number | null;
  dias_desde_admissao: number;
} | null> {
  const linhas = await consultar<{
    data_admissao: string;
    ultimo_em: string | null;
    dias_desde: number | null;
    dias_desde_admissao: number;
  }>(
    `SELECT c.data_admissao::text AS data_admissao,
            fb.ultimo_feedback_em AS ultimo_em,
            fb.dias_desde_feedback AS dias_desde,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date - c.data_admissao)
              AS dias_desde_admissao
       FROM rh.colaborador c
       LEFT JOIN LATERAL (
         SELECT f.realizado_em::text AS ultimo_feedback_em,
                ((now() AT TIME ZONE 'America/Sao_Paulo')::date - f.realizado_em)
                  AS dias_desde_feedback
           FROM rh.feedback_formal f
          WHERE f.colaborador_id = c.id
          ORDER BY f.realizado_em DESC, f.id DESC
          LIMIT 1
       ) fb ON TRUE
      WHERE c.id = $1`,
    [colaboradorId]
  );
  return linhas.length > 0 ? linhas[0] : null;
}

export async function inserirFeedback(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    realizado_em: string;
    resumo: string;
    registrado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.feedback_formal (colaborador_id, realizado_em, resumo, registrado_por)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.realizado_em,
      dados.resumo,
      dados.registrado_por,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ ações abertas

export interface Acao {
  id: number;
  descricao: string;
  prazo: string;
  status: StatusAcao;
  responsavel_nome: string;
  vencida: boolean;
  criado_em: string;
}

export async function listarAcoes(colaboradorId: number): Promise<Acao[]> {
  const linhas = await consultar<{
    id: string;
    descricao: string;
    prazo: string;
    status: StatusAcao;
    responsavel_nome: string;
    vencida: boolean;
    criado_em: string;
  }>(
    `SELECT a.id, a.descricao, a.prazo::text AS prazo, a.status,
            u.nome AS responsavel_nome,
            (a.status = 'aberta'
             AND a.prazo < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS vencida,
            a.criado_em::text AS criado_em
       FROM rh.acao_aberta a
       JOIN sistema.usuario u ON u.id = a.responsavel_id
      WHERE a.colaborador_id = $1
      ORDER BY (a.status = 'aberta') DESC, a.prazo, a.id`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function inserirAcao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    descricao: string;
    prazo: string;
    responsavel_id: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.acao_aberta (colaborador_id, descricao, prazo, responsavel_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [dados.colaborador_id, dados.descricao, dados.prazo, dados.responsavel_id]
  );
  return Number(rows[0].id);
}

export interface AcaoParaAtualizar {
  id: number;
  colaborador_id: number;
  descricao: string;
  prazo: string;
  status: StatusAcao;
}

export async function buscarAcaoParaAtualizar(
  cliente: PoolClient,
  colaboradorId: number,
  acaoId: number
): Promise<AcaoParaAtualizar | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    descricao: string;
    prazo: string;
    status: StatusAcao;
  }>(
    `SELECT id, colaborador_id, descricao, prazo::text AS prazo, status
       FROM rh.acao_aberta
      WHERE id = $1 AND colaborador_id = $2
      FOR UPDATE`,
    [acaoId, colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    colaborador_id: Number(rows[0].colaborador_id),
  };
}

export async function atualizarAcao(
  cliente: PoolClient,
  acaoId: number,
  campos: { descricao?: string; prazo?: string; status?: StatusAcao }
): Promise<void> {
  const colunas: Record<string, string> = {
    descricao: "descricao",
    prazo: "prazo",
    status: "status",
  };
  const chaves = Object.keys(campos) as (keyof typeof campos)[];
  if (chaves.length === 0) return;
  const atribuicoes = chaves.map(
    (chave, indice) => `${colunas[chave]} = $${indice + 2}`
  );
  await cliente.query(
    `UPDATE rh.acao_aberta SET ${atribuicoes.join(", ")} WHERE id = $1`,
    [acaoId, ...chaves.map((chave) => campos[chave])]
  );
}

// ------------------------------------------------------------------ posição (cargo + salário — sensível)

export interface Posicao {
  id: number;
  cargo_id: number;
  cargo_nome: string;
  salario: number;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarPosicoes(
  colaboradorId: number
): Promise<Posicao[]> {
  const linhas = await consultar<{
    id: string;
    cargo_id: string;
    cargo_nome: string;
    salario: string;
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT p.id, cv.cargo_id, cv.nome AS cargo_nome, p.salario::text AS salario,
            p.inicio_vigencia::text AS inicio_vigencia,
            p.fim_vigencia::text AS fim_vigencia
       FROM rh.posicao_colaborador p
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
      WHERE p.colaborador_id = $1
      ORDER BY p.inicio_vigencia DESC, p.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    cargo_id: Number(linha.cargo_id),
    salario: Number(linha.salario),
  }));
}

export interface PosicaoVigente {
  id: number;
  cargo_id: number;
  /**
   * A VERSÃO do cargo que esta posição congelou. A transferência entre
   * empresas (0048) reabre a posição no vínculo novo com a MESMA versão: o
   * cargo não muda ao trocar de CNPJ, e reler a versão "ativa" faria a pessoa
   * mudar de RCF sem ninguém ter decidido isso.
   */
  cargo_versao_id: number;
  cargo_nome: string;
  salario: number;
  inicio_vigencia: string;
}

export async function buscarPosicaoVigenteParaAtualizar(
  cliente: PoolClient,
  colaboradorId: number
): Promise<PosicaoVigente | null> {
  const { rows } = await cliente.query<{
    id: string;
    cargo_id: string;
    cargo_versao_id: string;
    cargo_nome: string;
    salario: string;
    inicio_vigencia: string;
  }>(
    `SELECT p.id, cv.cargo_id, p.cargo_versao_id, cv.nome AS cargo_nome,
            p.salario::text AS salario,
            p.inicio_vigencia::text AS inicio_vigencia
       FROM rh.posicao_colaborador p
       JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
      WHERE p.colaborador_id = $1 AND p.fim_vigencia IS NULL
      FOR UPDATE OF p`,
    [colaboradorId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    cargo_id: Number(rows[0].cargo_id),
    cargo_versao_id: Number(rows[0].cargo_versao_id),
    salario: Number(rows[0].salario),
  };
}

export async function encerrarPosicao(
  cliente: PoolClient,
  posicaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.posicao_colaborador
        SET fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [posicaoId, inicioDaProxima]
  );
}

export async function inserirPosicao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    cargo_versao_id: number;
    salario: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.posicao_colaborador
       (colaborador_id, cargo_versao_id, salario, inicio_vigencia)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.cargo_versao_id,
      dados.salario,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ relação gestor → liderado

export interface RelacaoGestor {
  id: number;
  gestor_colaborador_id: number;
  gestor_nome: string;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

export async function listarRelacoesGestor(
  colaboradorId: number
): Promise<RelacaoGestor[]> {
  const linhas = await consultar<{
    id: string;
    gestor_colaborador_id: string;
    gestor_nome: string;
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT rg.id, rg.gestor_colaborador_id, g.nome_completo AS gestor_nome,
            rg.inicio_vigencia::text AS inicio_vigencia,
            rg.fim_vigencia::text AS fim_vigencia
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
      WHERE rg.liderado_colaborador_id = $1
      ORDER BY rg.inicio_vigencia DESC, rg.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    gestor_colaborador_id: Number(linha.gestor_colaborador_id),
  }));
}

export interface RelacaoGestorVigente {
  id: number;
  gestor_colaborador_id: number;
  gestor_nome: string;
  inicio_vigencia: string;
}

export async function buscarRelacaoGestorVigenteParaAtualizar(
  cliente: PoolClient,
  lideradoId: number
): Promise<RelacaoGestorVigente | null> {
  const { rows } = await cliente.query<{
    id: string;
    gestor_colaborador_id: string;
    gestor_nome: string;
    inicio_vigencia: string;
  }>(
    `SELECT rg.id, rg.gestor_colaborador_id, g.nome_completo AS gestor_nome,
            rg.inicio_vigencia::text AS inicio_vigencia
       FROM rh.relacao_gestor rg
       JOIN rh.colaborador g ON g.id = rg.gestor_colaborador_id
      WHERE rg.liderado_colaborador_id = $1 AND rg.fim_vigencia IS NULL
      FOR UPDATE OF rg`,
    [lideradoId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    gestor_colaborador_id: Number(rows[0].gestor_colaborador_id),
  };
}

export async function encerrarRelacaoGestor(
  cliente: PoolClient,
  relacaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.relacao_gestor SET fim_vigencia = $2::date - 1 WHERE id = $1`,
    [relacaoId, inicioDaProxima]
  );
}

export async function inserirRelacaoGestor(
  cliente: PoolClient,
  dados: {
    gestor_colaborador_id: number;
    liderado_colaborador_id: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.relacao_gestor
       (gestor_colaborador_id, liderado_colaborador_id, inicio_vigencia)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      dados.gestor_colaborador_id,
      dados.liderado_colaborador_id,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ alocação: registro + lotação + centro de custo
// rh.lotacao é a linha de vigência da ALOCAÇÃO do vínculo, e desde a migration
// 0047 carrega os TRÊS campos que o dono separou: em qual empresa do grupo a
// pessoa está registrada, em que local físico trabalha e em que centro de custo
// o custo dela cai. Mudar qualquer um deles encerra a linha e abre outra —
// linha encerrada é imutável no banco, e é isso que impede a folha de fevereiro
// de mudar quando o centro de custo troca em março.

export interface Lotacao {
  id: number;
  empresa_id: number;
  empresa_nome: string | null;
  estabelecimento_id: number;
  unidade: string | null;
  centro_custo_id: number;
  centro_custo: string;
  centro_custo_nome: string | null;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

const COLUNAS_LOTACAO = `ld.id, ld.empresa_id, ld.empresa_nome,
            ld.estabelecimento_id, ld.lotacao_nome AS unidade,
            ld.centro_custo_id, ld.centro_custo, ld.centro_custo_nome,
            ld.inicio_vigencia::text AS inicio_vigencia,
            ld.fim_vigencia::text AS fim_vigencia`;

interface LinhaLotacao extends Record<string, unknown> {
  id: string;
  empresa_id: string;
  empresa_nome: string | null;
  estabelecimento_id: string;
  unidade: string | null;
  centro_custo_id: string;
  centro_custo: string;
  centro_custo_nome: string | null;
  inicio_vigencia: string;
  fim_vigencia: string | null;
}

function montarLotacao(linha: LinhaLotacao): Lotacao {
  return {
    ...linha,
    id: Number(linha.id),
    empresa_id: Number(linha.empresa_id),
    estabelecimento_id: Number(linha.estabelecimento_id),
    centro_custo_id: Number(linha.centro_custo_id),
  };
}

export async function listarLotacoes(
  colaboradorId: number
): Promise<Lotacao[]> {
  const linhas = await consultar<LinhaLotacao>(
    `SELECT ${COLUNAS_LOTACAO}
       FROM rh.lotacao_detalhada ld
      WHERE ld.colaborador_id = $1
      ORDER BY ld.inicio_vigencia DESC, ld.id DESC`,
    [colaboradorId]
  );
  return linhas.map(montarLotacao);
}

export type LotacaoVigente = Omit<Lotacao, "fim_vigencia">;

export async function buscarLotacaoVigenteParaAtualizar(
  cliente: PoolClient,
  colaboradorId: number
): Promise<LotacaoVigente | null> {
  // O FOR UPDATE tem que pegar a TABELA, não a view: por isso a trava é numa
  // subconsulta em rh.lotacao e a leitura legível vem da view.
  const { rows } = await cliente.query<LinhaLotacao>(
    `SELECT ${COLUNAS_LOTACAO}
       FROM rh.lotacao_detalhada ld
      WHERE ld.id = (
        SELECT l.id FROM rh.lotacao l
         WHERE l.colaborador_id = $1 AND l.fim_vigencia IS NULL
         FOR UPDATE)`,
    [colaboradorId]
  );
  if (rows.length === 0) return null;
  return montarLotacao(rows[0]);
}

export async function encerrarLotacao(
  cliente: PoolClient,
  lotacaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.lotacao SET fim_vigencia = $2::date - 1 WHERE id = $1`,
    [lotacaoId, inicioDaProxima]
  );
}

export async function inserirLotacao(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    empresa_id: number;
    estabelecimento_id: number;
    centro_custo_id: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  // centro_custo (texto) não é passado de propósito: é projeção do código do
  // catálogo, escrita por trigger (migration 0047).
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.lotacao
       (colaborador_id, empresa_id, estabelecimento_id, centro_custo_id, inicio_vigencia)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.empresa_id,
      dados.estabelecimento_id,
      dados.centro_custo_id,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ cargos + versões + faixas

export interface CargoResumo {
  id: number;
  versao_id: number | null;
  nome: string | null;
  descricao: string | null;
  cha: Cha | null;
  inicio_vigencia: string | null;
  faixa_min: number | null;
  faixa_max: number | null;
  faixa_inicio_vigencia: string | null;
  // RCF da versão ativa (a tela de cargos edita e imprime o documento inteiro).
  setor: string | null;
  cargo_lider_id: number | null;
  cargo_lider_nome: string | null;
  tipo_contrato_previsto: TipoVinculo | null;
  missao: string | null;
  atividades: string[] | null;
  observacoes: string | null;
  ocupantes: number;
}

export async function listarCargos(): Promise<CargoResumo[]> {
  const linhas = await consultar<{
    id: string;
    versao_id: string | null;
    nome: string | null;
    descricao: string | null;
    cha: Cha | null;
    inicio_vigencia: string | null;
    faixa_min: string | null;
    faixa_max: string | null;
    faixa_inicio_vigencia: string | null;
    setor: string | null;
    cargo_lider_id: string | null;
    cargo_lider_nome: string | null;
    tipo_contrato_previsto: TipoVinculo | null;
    missao: string | null;
    atividades: string[] | null;
    observacoes: string | null;
    ocupantes: string;
  }>(
    `SELECT cg.id, cv.id AS versao_id, cv.nome, cv.descricao, cv.cha,
            cv.inicio_vigencia::text AS inicio_vigencia,
            cv.setor, cv.cargo_lider_id, cv.tipo_contrato_previsto,
            cv.missao, cv.atividades, cv.observacoes,
            lider.nome AS cargo_lider_nome,
            ts.faixa_min::text AS faixa_min, ts.faixa_max::text AS faixa_max,
            ts.inicio_vigencia::text AS faixa_inicio_vigencia,
            COALESCE(ocup.ocupantes, 0) AS ocupantes
       FROM rh.cargo cg
       LEFT JOIN rh.cargo_versao cv
         ON cv.cargo_id = cg.id AND cv.status = 'ativa'
       LEFT JOIN rh.tabela_salarial_versao ts
         ON ts.cargo_id = cg.id AND ts.status = 'ativa'
       LEFT JOIN LATERAL (
         SELECT cl.nome
           FROM rh.cargo_versao cl
          WHERE cl.cargo_id = cv.cargo_lider_id AND cl.status = 'ativa'
       ) lider ON TRUE
       LEFT JOIN LATERAL (
         SELECT count(*) AS ocupantes
           FROM rh.posicao_colaborador p
           JOIN rh.cargo_versao pv ON pv.id = p.cargo_versao_id
           JOIN rh.colaborador oc ON oc.id = p.colaborador_id
          WHERE pv.cargo_id = cg.id
            AND p.fim_vigencia IS NULL
            AND oc.status <> 'desligado'
       ) ocup ON TRUE
      ORDER BY cv.nome NULLS LAST, cg.id`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    versao_id: linha.versao_id === null ? null : Number(linha.versao_id),
    faixa_min: linha.faixa_min === null ? null : Number(linha.faixa_min),
    faixa_max: linha.faixa_max === null ? null : Number(linha.faixa_max),
    cargo_lider_id:
      linha.cargo_lider_id === null ? null : Number(linha.cargo_lider_id),
    ocupantes: Number(linha.ocupantes),
  }));
}

export interface CargoVersaoAtiva {
  id: number;
  cargo_id: number;
  nome: string;
  descricao: string | null;
  cha: Cha;
  inicio_vigencia: string;
  setor: string | null;
  cargo_lider_id: number | null;
  tipo_contrato_previsto: TipoVinculo | null;
  missao: string | null;
  atividades: string[];
  observacoes: string | null;
}

export async function buscarCargoVersaoAtiva(
  cliente: PoolClient,
  cargoId: number,
  travar = false
): Promise<CargoVersaoAtiva | null> {
  const { rows } = await cliente.query<{
    id: string;
    cargo_id: string;
    nome: string;
    descricao: string | null;
    cha: Cha;
    inicio_vigencia: string;
    setor: string | null;
    cargo_lider_id: string | null;
    tipo_contrato_previsto: TipoVinculo | null;
    missao: string | null;
    atividades: string[];
    observacoes: string | null;
  }>(
    `SELECT cv.id, cv.cargo_id, cv.nome, cv.descricao, cv.cha,
            cv.inicio_vigencia::text AS inicio_vigencia, ${COLUNAS_RCF}
       FROM rh.cargo_versao cv
      WHERE cv.cargo_id = $1 AND cv.status = 'ativa'
      ${travar ? "FOR UPDATE" : ""}`,
    [cargoId]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    cargo_id: Number(rows[0].cargo_id),
    cargo_lider_id:
      rows[0].cargo_lider_id === null ? null : Number(rows[0].cargo_lider_id),
  };
}

export async function existeCargo(
  cliente: PoolClient,
  cargoId: number
): Promise<boolean> {
  const { rows } = await cliente.query(
    "SELECT 1 FROM rh.cargo WHERE id = $1",
    [cargoId]
  );
  return rows.length > 0;
}

export async function inserirCargo(cliente: PoolClient): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    "INSERT INTO rh.cargo DEFAULT VALUES RETURNING id"
  );
  return Number(rows[0].id);
}

export async function encerrarVersaoCargo(
  cliente: PoolClient,
  versaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.cargo_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [versaoId, inicioDaProxima]
  );
}

export async function inserirVersaoCargo(
  cliente: PoolClient,
  dados: {
    cargo_id: number;
    nome: string;
    descricao: string | null;
    cha: Cha;
    inicio_vigencia: string;
    setor: string | null;
    cargo_lider_id: number | null;
    tipo_contrato_previsto: TipoVinculo | null;
    missao: string | null;
    atividades: string[];
    observacoes: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.cargo_versao
       (cargo_id, nome, descricao, cha, status, inicio_vigencia,
        setor, cargo_lider_id, tipo_contrato_previsto, missao, atividades, observacoes)
     VALUES ($1, $2, $3, $4, 'ativa', $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      dados.cargo_id,
      dados.nome,
      dados.descricao,
      JSON.stringify(dados.cha),
      dados.inicio_vigencia,
      dados.setor,
      dados.cargo_lider_id,
      dados.tipo_contrato_previsto,
      dados.missao,
      JSON.stringify(dados.atividades),
      dados.observacoes,
    ]
  );
  return Number(rows[0].id);
}

export interface FaixaSalarialAtiva {
  id: number;
  faixa_min: number;
  faixa_max: number;
  inicio_vigencia: string;
}

export async function buscarFaixaAtivaParaAtualizar(
  cliente: PoolClient,
  cargoId: number
): Promise<FaixaSalarialAtiva | null> {
  const { rows } = await cliente.query<{
    id: string;
    faixa_min: string;
    faixa_max: string;
    inicio_vigencia: string;
  }>(
    `SELECT id, faixa_min::text AS faixa_min, faixa_max::text AS faixa_max,
            inicio_vigencia::text AS inicio_vigencia
       FROM rh.tabela_salarial_versao
      WHERE cargo_id = $1 AND status = 'ativa'
      FOR UPDATE`,
    [cargoId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    faixa_min: Number(rows[0].faixa_min),
    faixa_max: Number(rows[0].faixa_max),
    inicio_vigencia: rows[0].inicio_vigencia,
  };
}

export async function encerrarFaixaSalarial(
  cliente: PoolClient,
  faixaId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.tabela_salarial_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [faixaId, inicioDaProxima]
  );
}

export async function inserirFaixaSalarial(
  cliente: PoolClient,
  dados: {
    cargo_id: number;
    faixa_min: number;
    faixa_max: number;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.tabela_salarial_versao
       (cargo_id, faixa_min, faixa_max, status, inicio_vigencia)
     VALUES ($1, $2, $3, 'ativa', $4)
     RETURNING id`,
    [dados.cargo_id, dados.faixa_min, dados.faixa_max, dados.inicio_vigencia]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ estabelecimentos = catálogo de LOTAÇÃO
// Desde a migration 0047 rh.estabelecimento é SÓ o local físico. CNPJ e razão
// social continuam nas colunas por legado, opcionais: quem responde pelo CNPJ é
// rh.empresa_grupo (domínio "estrutura"). Local novo nasce só com nome e
// endereço. Inativar em vez de excluir — quem já esteve lotado ali continua
// tendo passado.

export interface EstabelecimentoResumo {
  id: number;
  cnpj: string | null;
  versao_id: number | null;
  razao_social: string | null;
  unidade: string | null;
  endereco_resumido: string | null;
  inicio_vigencia: string | null;
  inativado_em: string | null;
  /** Quantas alocações (vigentes ou não) já apontaram para este local. */
  alocacoes: number;
}

export async function listarEstabelecimentos(): Promise<
  EstabelecimentoResumo[]
> {
  const linhas = await consultar<{
    id: string;
    cnpj: string | null;
    versao_id: string | null;
    razao_social: string | null;
    unidade: string | null;
    endereco_resumido: string | null;
    inicio_vigencia: string | null;
    inativado_em: string | null;
    alocacoes: string;
  }>(
    `SELECT e.id, e.cnpj, ev.id AS versao_id, ev.razao_social, ev.unidade,
            ev.endereco_resumido, ev.inicio_vigencia::text AS inicio_vigencia,
            e.inativado_em::text AS inativado_em,
            (SELECT count(*) FROM rh.lotacao l
              WHERE l.estabelecimento_id = e.id) AS alocacoes
       FROM rh.estabelecimento e
       LEFT JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = e.id AND ev.status = 'ativa'
      ORDER BY e.inativado_em NULLS FIRST, ev.unidade NULLS LAST, e.id`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    versao_id: linha.versao_id === null ? null : Number(linha.versao_id),
    alocacoes: Number(linha.alocacoes),
  }));
}

/** Liga/desliga o local para uso NOVO. Não apaga e não mexe no passado. */
export async function definirInativacaoEstabelecimento(
  cliente: PoolClient,
  estabelecimentoId: number,
  usuarioId: number | null
): Promise<void> {
  await cliente.query(
    `UPDATE rh.estabelecimento
        SET inativado_em = CASE WHEN $2::bigint IS NULL THEN NULL ELSE now() END,
            inativado_por = $2
      WHERE id = $1`,
    [estabelecimentoId, usuarioId]
  );
}

export async function buscarEstabelecimentoVersaoAtiva(
  cliente: PoolClient,
  estabelecimentoId: number,
  travar = false
): Promise<{
  id: number;
  razao_social: string | null;
  unidade: string;
  endereco_resumido: string | null;
  inicio_vigencia: string;
} | null> {
  const { rows } = await cliente.query<{
    id: string;
    razao_social: string | null;
    unidade: string;
    endereco_resumido: string | null;
    inicio_vigencia: string;
  }>(
    `SELECT id, razao_social, unidade, endereco_resumido,
            inicio_vigencia::text AS inicio_vigencia
       FROM rh.estabelecimento_versao
      WHERE estabelecimento_id = $1 AND status = 'ativa'
      ${travar ? "FOR UPDATE" : ""}`,
    [estabelecimentoId]
  );
  if (rows.length === 0) return null;
  return { ...rows[0], id: Number(rows[0].id) };
}

export async function existeEstabelecimento(
  cliente: PoolClient,
  estabelecimentoId: number
): Promise<boolean> {
  const { rows } = await cliente.query(
    "SELECT 1 FROM rh.estabelecimento WHERE id = $1",
    [estabelecimentoId]
  );
  return rows.length > 0;
}

export async function inserirEstabelecimento(
  cliente: PoolClient,
  cnpj: string | null
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    "INSERT INTO rh.estabelecimento (cnpj) VALUES ($1) RETURNING id",
    [cnpj]
  );
  return Number(rows[0].id);
}

export async function encerrarVersaoEstabelecimento(
  cliente: PoolClient,
  versaoId: number,
  inicioDaProxima: string
): Promise<void> {
  await cliente.query(
    `UPDATE rh.estabelecimento_versao
        SET status = 'encerrada', fim_vigencia = $2::date - 1
      WHERE id = $1`,
    [versaoId, inicioDaProxima]
  );
}

export async function inserirVersaoEstabelecimento(
  cliente: PoolClient,
  dados: {
    estabelecimento_id: number;
    razao_social: string | null;
    unidade: string;
    endereco_resumido: string | null;
    inicio_vigencia: string;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.estabelecimento_versao
       (estabelecimento_id, razao_social, unidade, endereco_resumido, status, inicio_vigencia)
     VALUES ($1, $2, $3, $4, 'ativa', $5)
     RETURNING id`,
    [
      dados.estabelecimento_id,
      dados.razao_social,
      dados.unidade,
      dados.endereco_resumido,
      dados.inicio_vigencia,
    ]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ relatórios (chave relatorio.ver)
// Regras destas consultas:
//  • "quadro" = colaborador com status <> 'desligado' (ativo ou afastado);
//  • nenhuma usa o escopo de gestor: relatório é leitura transversal e quem
//    autoriza é relatorio.ver (nunca rh.colaborador.ver);
//  • agregado é agregado — nada de linha por pessoa, exceto a lista de
//    aniversariantes, que é nominal por natureza (e por isso NÃO devolve o ano
//    de nascimento: idade não é necessária para desejar feliz aniversário).

const CONDICAO_QUADRO = "c.status <> 'desligado'";

/**
 * Recorte dos relatórios pelos TRÊS campos (registro, lotação, centro de
 * custo), combinável entre si e com o que cada relatório já filtrava. Um
 * relatório que aceita o recorte e outro que o ignora é pior do que nenhum dos
 * dois: o número de uma aba contradiria o da aba ao lado. Por isso TODA
 * contagem agregada desta seção recebe o mesmo `filtro` e a mesma condição.
 */
function recorteDoQuadro(
  filtro: FiltroEstrutura,
  parametros: unknown[]
): string {
  return condicaoFiltroEstrutura(filtro, parametros, "c");
}

export interface Aniversariante {
  id: number;
  nome_completo: string;
  dia: number;
  unidade: string | null;
  cargo_nome: string | null;
}

export async function listarAniversariantes(
  mes: number,
  filtro: FiltroEstrutura
): Promise<Aniversariante[]> {
  const parametros: unknown[] = [mes];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    dia: string;
    unidade: string | null;
    cargo_nome: string | null;
  }>(
    `SELECT c.id, c.nome_completo,
            date_part('day', c.data_nascimento)::int::text AS dia,
            lot.unidade, pos.cargo_nome
       FROM rh.colaborador c
       LEFT JOIN LATERAL (
         SELECT cv.nome AS cargo_nome
           FROM rh.posicao_colaborador p
           JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
          WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       ) pos ON TRUE
       LEFT JOIN LATERAL (
         SELECT l.estabelecimento_id, ev.unidade
           FROM rh.lotacao l
           LEFT JOIN rh.estabelecimento_versao ev
             ON ev.estabelecimento_id = l.estabelecimento_id AND ev.status = 'ativa'
          WHERE l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       ) lot ON TRUE
      WHERE ${CONDICAO_QUADRO}
        AND c.data_nascimento IS NOT NULL
        AND date_part('month', c.data_nascimento) = $1${recorte}
      ORDER BY date_part('day', c.data_nascimento), c.nome_completo`,
    parametros
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    dia: Number(linha.dia),
  }));
}

/** Honestidade do relatório: quantas fichas do quadro ainda não têm a data. */
export async function contarCoberturaNascimento(
  filtro: FiltroEstrutura
): Promise<{
  com_data: number;
  sem_data: number;
}> {
  const parametros: unknown[] = [];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<{ com_data: string; sem_data: string }>(
    `SELECT count(*) FILTER (WHERE c.data_nascimento IS NOT NULL)::text AS com_data,
            count(*) FILTER (WHERE c.data_nascimento IS NULL)::text     AS sem_data
       FROM rh.colaborador c
      WHERE ${CONDICAO_QUADRO}${recorte}`,
    parametros
  );
  return {
    com_data: Number(linhas[0].com_data),
    sem_data: Number(linhas[0].sem_data),
  };
}

export async function contarPorGenero(
  filtro: FiltroEstrutura
): Promise<{ genero: Genero; quantidade: number }[]> {
  const parametros: unknown[] = [];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<{ genero: Genero; quantidade: string }>(
    `SELECT c.genero, count(*)::text AS quantidade
       FROM rh.colaborador c
      WHERE ${CONDICAO_QUADRO}${recorte}
      GROUP BY c.genero`,
    parametros
  );
  const porGenero = new Map(
    linhas.map((linha) => [linha.genero, Number(linha.quantidade)])
  );
  return GENEROS.map((genero) => ({
    genero,
    quantidade: porGenero.get(genero) ?? 0,
  }));
}

/**
 * Contagem por idade EXATA em anos completos (já agregado). O agrupamento em
 * faixas acontece no serviço, com a definição única de FAIXAS_IDADE — a faixa
 * fica sendo regra de produto num lugar só, e não SQL montado por concatenação.
 */
export async function contarPorIdade(
  filtro: FiltroEstrutura
): Promise<{ idade: number; quantidade: number }[]> {
  const parametros: unknown[] = [];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<{ idade: string; quantidade: string }>(
    `SELECT date_part('year', age((now() AT TIME ZONE 'America/Sao_Paulo')::date,
                                 c.data_nascimento))::int::text AS idade,
            count(*)::text AS quantidade
       FROM rh.colaborador c
      WHERE ${CONDICAO_QUADRO} AND c.data_nascimento IS NOT NULL${recorte}
      GROUP BY 1`,
    parametros
  );
  return linhas.map((linha) => ({
    idade: Number(linha.idade),
    quantidade: Number(linha.quantidade),
  }));
}

export interface ComposicaoFamiliarBruta {
  com_filho_feminino: number;
  com_filho_masculino: number;
  com_filho_outro_ou_nao_informado: number;
  com_conjuge: number;
  total_filhos: number;
  total_criancas: number;
  total_dependentes: number;
}

/**
 * Composição familiar a partir de rh.dependente — que é cadastro de BENEFÍCIO,
 * não censo familiar: quem não aderiu a plano pode ter filho e não aparecer
 * aqui. A tela diz isso ao usuário em vez de fingir cobertura total.
 * Dado de terceiro (LGPD): só contagem sai daqui, nunca nome de dependente.
 */
export async function agregarComposicaoFamiliar(
  idadeLimiteCrianca: number,
  filtro: FiltroEstrutura
): Promise<ComposicaoFamiliarBruta> {
  const parametros: unknown[] = [idadeLimiteCrianca];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<Record<string, string>>(
    `WITH quadro AS (
       SELECT c.id, c.genero
         FROM rh.colaborador c
        WHERE ${CONDICAO_QUADRO}${recorte}
     ), filhos AS (
       SELECT d.colaborador_id, d.nascimento
         FROM rh.dependente d
         JOIN quadro q ON q.id = d.colaborador_id
        WHERE d.parentesco = 'filho'
     )
     SELECT
       (SELECT count(DISTINCT f.colaborador_id)
          FROM filhos f JOIN quadro q ON q.id = f.colaborador_id
         WHERE q.genero = 'feminino')::text  AS com_filho_feminino,
       (SELECT count(DISTINCT f.colaborador_id)
          FROM filhos f JOIN quadro q ON q.id = f.colaborador_id
         WHERE q.genero = 'masculino')::text AS com_filho_masculino,
       (SELECT count(DISTINCT f.colaborador_id)
          FROM filhos f JOIN quadro q ON q.id = f.colaborador_id
         WHERE q.genero IN ('outro','nao_informado'))::text
         AS com_filho_outro_ou_nao_informado,
       (SELECT count(DISTINCT d.colaborador_id)
          FROM rh.dependente d JOIN quadro q ON q.id = d.colaborador_id
         WHERE d.parentesco = 'conjuge')::text AS com_conjuge,
       (SELECT count(*) FROM filhos)::text AS total_filhos,
       (SELECT count(*) FROM filhos f
         WHERE date_part('year', age((now() AT TIME ZONE 'America/Sao_Paulo')::date,
                                     f.nascimento)) <= $1)::text AS total_criancas,
       (SELECT count(*) FROM rh.dependente d
          JOIN quadro q ON q.id = d.colaborador_id)::text AS total_dependentes`,
    parametros
  );
  const linha = linhas[0];
  return {
    com_filho_feminino: Number(linha.com_filho_feminino),
    com_filho_masculino: Number(linha.com_filho_masculino),
    com_filho_outro_ou_nao_informado: Number(
      linha.com_filho_outro_ou_nao_informado
    ),
    com_conjuge: Number(linha.com_conjuge),
    total_filhos: Number(linha.total_filhos),
    total_criancas: Number(linha.total_criancas),
    total_dependentes: Number(linha.total_dependentes),
  };
}

export interface LinhaHeadcount {
  rotulo: string;
  quantidade: number;
}

/**
 * Headcount por UM dos três campos. Antes existia só "por unidade", que somava
 * o local de trabalho; agora o mesmo relatório responde as três perguntas
 * diferentes — quanta gente cada CNPJ registra, quanta trabalha em cada local e
 * quanto do quadro cai em cada centro de custo. São três coisas independentes, e
 * responder uma no lugar da outra dá o número errado.
 */
export async function contarHeadcountPorCampoDaEstrutura(
  campo: "empresa" | "lotacao" | "centro_custo",
  filtro: FiltroEstrutura
): Promise<LinhaHeadcount[]> {
  const parametros: unknown[] = [];
  const recorte = recorteDoQuadro(filtro, parametros);
  const expressao = {
    empresa: "COALESCE(lot.empresa_nome, 'Sem registro definido')",
    lotacao: "COALESCE(lot.lotacao_nome, 'Sem lotação definida')",
    centro_custo: `COALESCE(
        CASE WHEN lot.centro_custo_nome IS NULL THEN lot.centro_custo_codigo
             ELSE lot.centro_custo_codigo || ' — ' || lot.centro_custo_nome END,
        'Sem centro de custo definido')`,
  }[campo];
  const linhas = await consultar<{ rotulo: string; quantidade: string }>(
    `SELECT ${expressao} AS rotulo,
            count(*)::text AS quantidade
       FROM rh.colaborador c
       LEFT JOIN LATERAL (
         SELECT ld.empresa_nome, ld.lotacao_nome,
                ld.centro_custo_codigo, ld.centro_custo_nome
           FROM rh.lotacao_detalhada ld
          WHERE ld.colaborador_id = c.id
          ORDER BY ld.inicio_vigencia DESC, ld.id DESC
          LIMIT 1
       ) lot ON TRUE
      WHERE ${CONDICAO_QUADRO}${recorte}
      GROUP BY 1
      ORDER BY count(*) DESC, 1`,
    parametros
  );
  return linhas.map((linha) => ({
    rotulo: linha.rotulo,
    quantidade: Number(linha.quantidade),
  }));
}

export async function contarHeadcountPorCargo(
  filtro: FiltroEstrutura
): Promise<LinhaHeadcount[]> {
  const parametros: unknown[] = [];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<{ rotulo: string; quantidade: string }>(
    `SELECT COALESCE(pos.cargo_nome, 'Sem posição vigente') AS rotulo,
            count(*)::text AS quantidade
       FROM rh.colaborador c
       LEFT JOIN LATERAL (
         SELECT cv.nome AS cargo_nome
           FROM rh.posicao_colaborador p
           JOIN rh.cargo_versao cv ON cv.id = p.cargo_versao_id
          WHERE p.colaborador_id = c.id AND p.fim_vigencia IS NULL
       ) pos ON TRUE
      WHERE ${CONDICAO_QUADRO}${recorte}
      GROUP BY 1
      ORDER BY count(*) DESC, 1`,
    parametros
  );
  return linhas.map((linha) => ({
    rotulo: linha.rotulo,
    quantidade: Number(linha.quantidade),
  }));
}

export async function contarHeadcountPorVinculo(
  filtro: FiltroEstrutura
): Promise<{ tipo_vinculo: TipoVinculo; quantidade: number }[]> {
  const parametros: unknown[] = [];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<{
    tipo_vinculo: TipoVinculo;
    quantidade: string;
  }>(
    `SELECT c.tipo_vinculo, count(*)::text AS quantidade
       FROM rh.colaborador c
      WHERE ${CONDICAO_QUADRO}${recorte}
      GROUP BY 1
      ORDER BY count(*) DESC`,
    parametros
  );
  return linhas.map((linha) => ({
    tipo_vinculo: linha.tipo_vinculo,
    quantidade: Number(linha.quantidade),
  }));
}

export async function contarQuadro(filtro: FiltroEstrutura): Promise<{
  total: number;
  ativos: number;
  afastados: number;
}> {
  const parametros: unknown[] = [];
  const recorte = recorteDoQuadro(filtro, parametros);
  const linhas = await consultar<{
    total: string;
    ativos: string;
    afastados: string;
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE c.status = 'ativo')::text    AS ativos,
            count(*) FILTER (WHERE c.status = 'afastado')::text AS afastados
       FROM rh.colaborador c
      WHERE ${CONDICAO_QUADRO}${recorte}`,
    parametros
  );
  return {
    total: Number(linhas[0].total),
    ativos: Number(linhas[0].ativos),
    afastados: Number(linhas[0].afastados),
  };
}

// ------------------------------------------------------------------ parâmetro de privacidade (0044)

/**
 * O k vigente da supressão de recorte pequeno. Linha única por construção
 * (CHECK id = 1); se ela sumir, o fallback é o padrão de fábrica — relatório
 * agregado nunca deve degradar para "sem supressão" por falta de configuração.
 */
export async function lerMinimoPorRecorte(): Promise<number> {
  const linhas = await consultar<{ minimo_por_recorte: number }>(
    "SELECT minimo_por_recorte FROM sistema.parametro_privacidade WHERE id = 1"
  );
  const valor = Number(linhas[0]?.minimo_por_recorte);
  return Number.isInteger(valor) && valor >= MINIMO_POR_RECORTE_MIN
    ? valor
    : MINIMO_POR_RECORTE_PADRAO;
}

export interface ParametroPrivacidadeVigente {
  minimo_por_recorte: number;
  atualizado_em: string;
  atualizado_por_nome: string | null;
}

export async function lerParametroPrivacidade(): Promise<ParametroPrivacidadeVigente> {
  const linhas = await consultar<{
    minimo_por_recorte: number;
    atualizado_em: string;
    atualizado_por_nome: string | null;
  }>(
    `SELECT p.minimo_por_recorte,
            -- ISO explícito: o driver devolveria Date e a rota serializaria em
            -- formato de locale do servidor.
            to_char(p.atualizado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              AS atualizado_em,
            u.nome AS atualizado_por_nome
       FROM sistema.parametro_privacidade p
       LEFT JOIN sistema.usuario u ON u.id = p.atualizado_por
      WHERE p.id = 1`
  );
  const linha = linhas[0];
  return {
    minimo_por_recorte: Number(linha?.minimo_por_recorte ?? MINIMO_POR_RECORTE_PADRAO),
    atualizado_em: String(linha?.atualizado_em ?? ""),
    atualizado_por_nome: linha?.atualizado_por_nome ?? null,
  };
}

/** Grava dentro da transação de quem chama — a trilha vai junto ou não vai. */
export async function gravarMinimoPorRecorte(
  cliente: PoolClient,
  usuarioId: number,
  valor: number
): Promise<number> {
  const { rows } = await cliente.query<{ minimo_por_recorte: number }>(
    `UPDATE sistema.parametro_privacidade
        SET minimo_por_recorte = $1, atualizado_em = now(), atualizado_por = $2
      WHERE id = 1
      RETURNING minimo_por_recorte`,
    [valor, usuarioId]
  );
  return Number(rows[0].minimo_por_recorte);
}
