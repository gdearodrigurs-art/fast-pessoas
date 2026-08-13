import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import {
  EstruturaCongelada,
  FaixaEstrutura,
  MemoriaCalculo,
  PilarEstrutura,
  RespostaParaCalculo,
} from "./calculo";
import {
  Decisao,
  EstruturaModeloEntrada,
  Recomendacao,
  StatusCiclo,
  TipoCiclo,
} from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// ------------------------------------------------------------------ modelos

export interface ModeloResumo {
  id: number;
  versao: number;
  nome: string;
  status: "rascunho" | "ativa" | "encerrada";
  inicio_vigencia: string;
  fim_vigencia: string | null;
  /** null = modelo GERAL (fallback); senão o cargo a que este modelo se aplica. */
  cargo_id: number | null;
  /** Nome do cargo (versão ativa) quando cargo_id não é nulo; null no Geral. */
  cargo_nome: string | null;
}

export async function listarModelos(): Promise<ModeloResumo[]> {
  const linhas = await consultar<{
    id: string;
    versao: number;
    nome: string;
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
    cargo_id: string | null;
    cargo_nome: string | null;
  }>(
    // Nome do cargo pela versão ATIVA do cargo (o rótulo que vale hoje); a
    // família ordena por COALESCE(cargo_id,0) — o Geral (0) primeiro.
    `SELECT m.id, m.versao, m.nome, m.status,
            m.inicio_vigencia::text AS inicio_vigencia,
            m.fim_vigencia::text AS fim_vigencia,
            m.cargo_id, cv.nome AS cargo_nome
       FROM rh.modelo_avaliacao_versao m
       LEFT JOIN LATERAL (
         SELECT nome FROM rh.cargo_versao
          WHERE cargo_id = m.cargo_id AND status = 'ativa'
          LIMIT 1
       ) cv ON TRUE
      ORDER BY COALESCE(m.cargo_id, 0), m.versao DESC`
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    cargo_id: linha.cargo_id === null ? null : Number(linha.cargo_id),
  }));
}

/**
 * O modelo GERAL ativo (cargo_id IS NULL) — o fallback obrigatório. Sem ele,
 * quem não tem modelo do próprio cargo ficaria sem modelo; por isso a abertura
 * de ciclos (lote e experiência) exige que ele exista.
 */
export async function buscarGeralAtivo(): Promise<ModeloResumo | null> {
  const modelos = await listarModelos();
  return (
    modelos.find((m) => m.status === "ativa" && m.cargo_id === null) ?? null
  );
}

/** Cargos com versão ativa (id + nome) — alimenta o seletor da tela de modelos. */
export async function listarCargosParaModelo(): Promise<
  { id: number; nome: string }[]
> {
  const linhas = await consultar<{ id: string; nome: string }>(
    `SELECT c.id, cv.nome
       FROM rh.cargo c
       JOIN rh.cargo_versao cv ON cv.cargo_id = c.id AND cv.status = 'ativa'
      ORDER BY cv.nome`
  );
  return linhas.map((linha) => ({ id: Number(linha.id), nome: linha.nome }));
}

/**
 * Estrutura completa (pilares → indicadores + faixas) de uma versão do
 * modelo. Serve tanto a tela de administração quanto o MOTOR DE CÁLCULO —
 * para ciclos, sempre chamada com o modelo_versao_id CONGELADO no ciclo.
 */
export async function buscarEstrutura(
  modeloVersaoId: number
): Promise<EstruturaCongelada | null> {
  const modelos = await consultar<{
    id: string;
    versao: number;
    nome: string;
  }>(
    `SELECT id, versao, nome
       FROM rh.modelo_avaliacao_versao
      WHERE id = $1`,
    [modeloVersaoId]
  );
  if (modelos.length === 0) return null;

  const [pilares, indicadores, faixas] = await Promise.all([
    consultar<{ id: string; nome: string; peso: number; ordem: number }>(
      `SELECT id, nome, peso, ordem
         FROM rh.pilar_avaliacao
        WHERE modelo_versao_id = $1
        ORDER BY ordem`,
      [modeloVersaoId]
    ),
    consultar<{
      id: string;
      pilar_id: string;
      nome: string;
      descricao: string;
      peso: number;
      ordem: number;
    }>(
      `SELECT i.id, i.pilar_id, i.nome, i.descricao, i.peso, i.ordem
         FROM rh.indicador_avaliacao i
         JOIN rh.pilar_avaliacao p ON p.id = i.pilar_id
        WHERE p.modelo_versao_id = $1
        ORDER BY p.ordem, i.ordem`,
      [modeloVersaoId]
    ),
    consultar<{
      id: string;
      minimo: string;
      maximo: string;
      rotulo: string;
      recomendacao: Recomendacao;
    }>(
      `SELECT id, minimo::text AS minimo, maximo::text AS maximo,
              rotulo, recomendacao
         FROM rh.faixa_resultado_versao
        WHERE modelo_versao_id = $1
        ORDER BY minimo`,
      [modeloVersaoId]
    ),
  ]);

  const pilaresMontados: PilarEstrutura[] = pilares.map((pilar) => ({
    id: Number(pilar.id),
    nome: pilar.nome,
    peso: pilar.peso,
    ordem: pilar.ordem,
    indicadores: indicadores
      .filter((i) => i.pilar_id === pilar.id)
      .map((i) => ({
        id: Number(i.id),
        nome: i.nome,
        descricao: i.descricao,
        peso: i.peso,
        ordem: i.ordem,
      })),
  }));

  const faixasMontadas: FaixaEstrutura[] = faixas.map((faixa) => ({
    id: Number(faixa.id),
    minimo: Number(faixa.minimo),
    maximo: Number(faixa.maximo),
    rotulo: faixa.rotulo,
    recomendacao: faixa.recomendacao,
  }));

  return {
    modelo_versao_id: Number(modelos[0].id),
    versao: modelos[0].versao,
    nome: modelos[0].nome,
    pilares: pilaresMontados,
    faixas: faixasMontadas,
  };
}

export async function buscarModeloParaMutacao(
  cliente: PoolClient,
  id: number
): Promise<ModeloResumo | null> {
  const { rows } = await cliente.query<{
    id: string;
    versao: number;
    nome: string;
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
    cargo_id: string | null;
  }>(
    `SELECT id, versao, nome, status,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia,
            cargo_id
       FROM rh.modelo_avaliacao_versao
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return rows.length
    ? {
        ...rows[0],
        id: Number(rows[0].id),
        cargo_id: rows[0].cargo_id === null ? null : Number(rows[0].cargo_id),
        cargo_nome: null,
      }
    : null;
}

/** Rascunho da FAMÍLIA (Geral ou um cargo) — um por família (0074). */
export async function existeRascunhoDaFamilia(
  cargoId: number | null
): Promise<number | null> {
  const linhas = await consultar<{ id: string }>(
    `SELECT id FROM rh.modelo_avaliacao_versao
      WHERE status = 'rascunho'
        AND COALESCE(cargo_id, 0) = COALESCE($1, 0)`,
    [cargoId]
  );
  return linhas.length ? Number(linhas[0].id) : null;
}

export async function criarModeloRascunho(
  cliente: PoolClient,
  nome: string,
  cargoId: number | null
): Promise<{ id: number; versao: number }> {
  // Numeração de versão POR FAMÍLIA (COALESCE(cargo_id,0)) — o Geral e cada
  // cargo têm a sua sequência, como o índice único da 0074.
  const { rows } = await cliente.query<{ id: string; versao: number }>(
    // $2::bigint em ambos os usos: sem o cast, o Postgres deduz o mesmo
    // parâmetro como bigint (coluna cargo_id) e integer (comparado ao literal 0
    // no COALESCE), e recusa com 42P08 "integer versus bigint".
    `INSERT INTO rh.modelo_avaliacao_versao (versao, nome, status, inicio_vigencia, cargo_id)
     SELECT COALESCE(MAX(versao), 0) + 1, $1, 'rascunho', ${HOJE_SP}, $2::bigint
       FROM rh.modelo_avaliacao_versao
      WHERE COALESCE(cargo_id, 0) = COALESCE($2::bigint, 0)
     RETURNING id, versao`,
    [nome, cargoId]
  );
  return { id: Number(rows[0].id), versao: rows[0].versao };
}

/**
 * Substitui a estrutura de um RASCUNHO (as travas do banco impedem em
 * qualquer outro status): apaga filhas e reinsere na ordem enviada.
 */
export async function substituirEstrutura(
  cliente: PoolClient,
  modeloVersaoId: number,
  estrutura: EstruturaModeloEntrada
): Promise<void> {
  await cliente.query(
    `UPDATE rh.modelo_avaliacao_versao SET nome = $2 WHERE id = $1`,
    [modeloVersaoId, estrutura.nome]
  );
  await cliente.query(
    `DELETE FROM rh.indicador_avaliacao i
      USING rh.pilar_avaliacao p
      WHERE p.id = i.pilar_id AND p.modelo_versao_id = $1`,
    [modeloVersaoId]
  );
  await cliente.query(
    `DELETE FROM rh.pilar_avaliacao WHERE modelo_versao_id = $1`,
    [modeloVersaoId]
  );
  await cliente.query(
    `DELETE FROM rh.faixa_resultado_versao WHERE modelo_versao_id = $1`,
    [modeloVersaoId]
  );

  for (const [indice, pilar] of estrutura.pilares.entries()) {
    const { rows } = await cliente.query<{ id: string }>(
      `INSERT INTO rh.pilar_avaliacao (modelo_versao_id, nome, peso, ordem)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [modeloVersaoId, pilar.nome, pilar.peso, indice + 1]
    );
    const pilarId = Number(rows[0].id);
    for (const [ordem, indicador] of pilar.indicadores.entries()) {
      await cliente.query(
        `INSERT INTO rh.indicador_avaliacao (pilar_id, nome, descricao, peso, ordem)
         VALUES ($1, $2, $3, $4, $5)`,
        [pilarId, indicador.nome, indicador.descricao, indicador.peso, ordem + 1]
      );
    }
  }
  for (const faixa of estrutura.faixas) {
    await cliente.query(
      `INSERT INTO rh.faixa_resultado_versao
         (modelo_versao_id, minimo, maximo, rotulo, recomendacao)
       VALUES ($1, $2, $3, $4, $5)`,
      [modeloVersaoId, faixa.minimo, faixa.maximo, faixa.rotulo, faixa.recomendacao]
    );
  }
}

/**
 * Encerra a versão ativa DA MESMA FAMÍLIA (se houver) e ativa o rascunho — ordem
 * importa. Escopo por COALESCE(cargo_id,0) de propósito: ativar o modelo de um
 * cargo NÃO pode encerrar o de outro cargo nem o Geral (0074).
 */
export async function ativarModelo(
  cliente: PoolClient,
  modeloVersaoId: number
): Promise<number | null> {
  const { rows } = await cliente.query<{ id: string }>(
    `UPDATE rh.modelo_avaliacao_versao
        SET status = 'encerrada', fim_vigencia = ${HOJE_SP}
      WHERE status = 'ativa'
        AND COALESCE(cargo_id, 0) = (
          SELECT COALESCE(cargo_id, 0)
            FROM rh.modelo_avaliacao_versao WHERE id = $1)
      RETURNING id`,
    [modeloVersaoId]
  );
  await cliente.query(
    `UPDATE rh.modelo_avaliacao_versao
        SET status = 'ativa', inicio_vigencia = ${HOJE_SP}, fim_vigencia = NULL
      WHERE id = $1`,
    [modeloVersaoId]
  );
  return rows.length ? Number(rows[0].id) : null;
}

// ------------------------------------------------------------------ ciclos — leitura

export interface CicloResumo {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  avaliador_colaborador_id: number;
  avaliador_nome: string;
  tipo: TipoCiclo;
  status: StatusCiclo;
  origem: "admissao" | "lote" | "manual";
  prazo: string;
  dias_para_prazo: number;
  modelo_versao: number;
  avaliacao_estado: "rascunho" | "enviada" | null;
  tem_decisao: boolean;
  criado_em: string;
}

interface LinhaCiclo extends Record<string, unknown> {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  matricula: string;
  avaliador_colaborador_id: string;
  avaliador_nome: string;
  tipo: TipoCiclo;
  status: StatusCiclo;
  origem: "admissao" | "lote" | "manual";
  prazo: string;
  dias_para_prazo: number;
  modelo_versao: number;
  avaliacao_estado: "rascunho" | "enviada" | null;
  tem_decisao: boolean;
  criado_em: string;
}

const SELECT_CICLO = `
  SELECT ca.id, ca.colaborador_id, c.nome_completo AS colaborador_nome,
         c.matricula, ca.avaliador_colaborador_id,
         g.nome_completo AS avaliador_nome,
         ca.tipo, ca.status, ca.origem, ca.prazo::text AS prazo,
         (ca.prazo - ${HOJE_SP})::int AS dias_para_prazo,
         m.versao AS modelo_versao,
         a.estado AS avaliacao_estado,
         EXISTS (SELECT 1 FROM rh.decisao_avaliacao d
                  WHERE d.ciclo_id = ca.id) AS tem_decisao,
         ca.criado_em
    FROM rh.ciclo_avaliacao ca
    JOIN rh.colaborador c ON c.id = ca.colaborador_id
    JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
    JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
    -- avaliacao passou a ter N papéis por ciclo (0067): o painel/lista fala do
    -- estado da avaliação do LÍDER (a oficial). Sem o filtro, o join duplicaria
    -- o ciclo (uma linha por papel) e o estado viria de um papel arbitrário.
    LEFT JOIN rh.avaliacao a ON a.ciclo_id = ca.id AND a.papel = 'lider'`;

function paraCiclo(linha: LinhaCiclo): CicloResumo {
  return {
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    avaliador_colaborador_id: Number(linha.avaliador_colaborador_id),
  };
}

/** Ciclos em que o usuário é o avaliador (todos os status — o cliente separa). */
export async function listarCiclosDoAvaliador(
  usuarioId: number
): Promise<CicloResumo[]> {
  const linhas = await consultar<LinhaCiclo>(
    `${SELECT_CICLO}
     WHERE g.usuario_id = $1
     ORDER BY (ca.status IN ('aberto','em_avaliacao')) DESC, ca.prazo, ca.id`,
    [usuarioId]
  );
  return linhas.map(paraCiclo);
}

/** Painel RH/DP/diretoria: todos os ciclos (filtros no cliente). */
export async function listarCiclos(): Promise<CicloResumo[]> {
  const linhas = await consultar<LinhaCiclo>(
    `${SELECT_CICLO}
     ORDER BY (ca.status NOT IN ('decidido','cancelado')) DESC, ca.prazo, ca.id`
  );
  return linhas.map(paraCiclo);
}

export interface CicloDetalhe extends CicloResumo {
  modelo_versao_id: number;
  modelo_nome: string;
  avaliador_usuario_id: number;
  avaliacao_id: number | null;
  enviado_em: string | null;
}

export async function buscarCicloDetalhe(
  id: number
): Promise<CicloDetalhe | null> {
  const linhas = await consultar<
    LinhaCiclo & {
      modelo_versao_id: string;
      modelo_nome: string;
      avaliador_usuario_id: string;
      avaliacao_id: string | null;
      enviado_em: string | null;
    }
  >(
    `SELECT ca.id, ca.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, ca.avaliador_colaborador_id,
            g.nome_completo AS avaliador_nome, g.usuario_id AS avaliador_usuario_id,
            ca.tipo, ca.status, ca.origem, ca.prazo::text AS prazo,
            (ca.prazo - ${HOJE_SP})::int AS dias_para_prazo,
            ca.modelo_versao_id, m.versao AS modelo_versao, m.nome AS modelo_nome,
            a.id AS avaliacao_id, a.estado AS avaliacao_estado, a.enviado_em,
            EXISTS (SELECT 1 FROM rh.decisao_avaliacao d
                     WHERE d.ciclo_id = ca.id) AS tem_decisao,
            ca.criado_em
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
       JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
       -- só a avaliação do LÍDER (a oficial); a auto vive em linha separada e é
       -- lida pelo fluxo cego do colaborador, nunca aqui (0067).
       LEFT JOIN rh.avaliacao a ON a.ciclo_id = ca.id AND a.papel = 'lider'
      WHERE ca.id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  const linha = linhas[0];
  return {
    ...paraCiclo(linha),
    modelo_versao_id: Number(linha.modelo_versao_id),
    modelo_nome: linha.modelo_nome,
    avaliador_usuario_id: Number(linha.avaliador_usuario_id),
    avaliacao_id: linha.avaliacao_id === null ? null : Number(linha.avaliacao_id),
    enviado_em: linha.enviado_em,
  };
}

export interface CicloParaMutacao {
  id: number;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  avaliador_colaborador_id: number;
  avaliador_usuario_id: number;
  /** Usuário do próprio avaliado — alvo do escopo da autoavaliação (papel=auto). */
  colaborador_usuario_id: number | null;
  tipo: TipoCiclo;
  status: StatusCiclo;
  modelo_versao_id: number;
  // Os dois papéis vêm SEPARADOS (0067): a mutação escolhe o seu por papel, nunca
  // por um `linhas[0]` arbitrário do join. auto_* é null nos ciclos sem auto
  // (experiência) ou enquanto a linha não existir.
  lider_avaliacao_id: number | null;
  lider_estado: "rascunho" | "enviada" | null;
  auto_avaliacao_id: number | null;
  auto_estado: "rascunho" | "enviada" | null;
}

export async function buscarCicloParaMutacao(
  cliente: PoolClient,
  id: number
): Promise<CicloParaMutacao | null> {
  const { rows } = await cliente.query<{
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    avaliador_colaborador_id: string;
    avaliador_usuario_id: string;
    colaborador_usuario_id: string | null;
    tipo: TipoCiclo;
    status: StatusCiclo;
    modelo_versao_id: string;
    lider_avaliacao_id: string | null;
    lider_estado: "rascunho" | "enviada" | null;
    auto_avaliacao_id: string | null;
    auto_estado: "rascunho" | "enviada" | null;
  }>(
    `SELECT ca.id, ca.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, ca.avaliador_colaborador_id,
            g.usuario_id AS avaliador_usuario_id,
            c.usuario_id AS colaborador_usuario_id,
            ca.tipo, ca.status, ca.modelo_versao_id,
            al.id AS lider_avaliacao_id, al.estado AS lider_estado,
            au.id AS auto_avaliacao_id, au.estado AS auto_estado
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
       LEFT JOIN rh.avaliacao al ON al.ciclo_id = ca.id AND al.papel = 'lider'
       LEFT JOIN rh.avaliacao au ON au.ciclo_id = ca.id AND au.papel = 'auto'
      WHERE ca.id = $1
      FOR UPDATE OF ca`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    colaborador_id: Number(r.colaborador_id),
    colaborador_nome: r.colaborador_nome,
    matricula: r.matricula,
    avaliador_colaborador_id: Number(r.avaliador_colaborador_id),
    avaliador_usuario_id: Number(r.avaliador_usuario_id),
    colaborador_usuario_id:
      r.colaborador_usuario_id === null ? null : Number(r.colaborador_usuario_id),
    tipo: r.tipo,
    status: r.status,
    modelo_versao_id: Number(r.modelo_versao_id),
    lider_avaliacao_id:
      r.lider_avaliacao_id === null ? null : Number(r.lider_avaliacao_id),
    lider_estado: r.lider_estado,
    auto_avaliacao_id:
      r.auto_avaliacao_id === null ? null : Number(r.auto_avaliacao_id),
    auto_estado: r.auto_estado,
  };
}

// ------------------------------------------------------------------ ciclos — geração

export interface CicloCriado {
  id: number;
  colaborador_nome: string;
  matricula: string;
  avaliador_nome: string;
  /** Usuário do avaliador (null quando o gestor não tem conta) — alvo do aviso. */
  avaliador_usuario_id: number | null;
  tipo: TipoCiclo;
  prazo: string;
  /** Versão do modelo CONGELADA neste ciclo (por cargo/Geral) — para o audit. */
  modelo_versao: number;
}

async function detalharCriados(
  cliente: PoolClient,
  ids: number[]
): Promise<CicloCriado[]> {
  if (ids.length === 0) return [];
  const { rows } = await cliente.query<{
    id: string;
    colaborador_nome: string;
    matricula: string;
    avaliador_nome: string;
    avaliador_usuario_id: string | null;
    tipo: TipoCiclo;
    prazo: string;
    modelo_versao: number;
  }>(
    `SELECT ca.id, c.nome_completo AS colaborador_nome, c.matricula,
            g.nome_completo AS avaliador_nome,
            g.usuario_id AS avaliador_usuario_id,
            ca.tipo, ca.prazo::text AS prazo, m.versao AS modelo_versao
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
       JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
      WHERE ca.id = ANY($1::bigint[])
      ORDER BY ca.id`,
    [ids]
  );
  return rows.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    avaliador_usuario_id:
      linha.avaliador_usuario_id === null
        ? null
        : Number(linha.avaliador_usuario_id),
  }));
}

/**
 * Cria as linhas de resposta (rascunho) de cada ciclo recém-aberto. Uma do
 * LÍDER para TODO ciclo (avaliador = o designado do ciclo); e a AUTO só para os
 * de DESEMPENHO (avaliador = o próprio avaliado), onde a autoavaliação é
 * obrigatória (0067). Experiência (45/90) segue só com o líder.
 */
async function criarAvaliacoes(
  cliente: PoolClient,
  cicloIds: number[]
): Promise<void> {
  if (cicloIds.length === 0) return;
  await cliente.query(
    `INSERT INTO rh.avaliacao (ciclo_id, papel, avaliador_colaborador_id)
     SELECT ca.id, 'lider', ca.avaliador_colaborador_id
       FROM rh.ciclo_avaliacao ca
      WHERE ca.id = ANY($1::bigint[])
     UNION ALL
     SELECT ca.id, 'auto', ca.colaborador_id
       FROM rh.ciclo_avaliacao ca
      WHERE ca.id = ANY($1::bigint[])
        AND ca.tipo = 'desempenho'`,
    [cicloIds]
  );
}

// Gestor vigente NÃO-EU (um só por liderado: relação mais recente que não seja
// a pessoa liderando a si mesma). O filtro `<> liderado` mora DENTRO da
// subconsulta, antes do LIMIT 1 — não no ON. No ON, se a relação MAIS recente
// fosse self, a subconsulta trazia essa e o JOIN a descartava, deixando o
// colaborador sem ciclo; mas listarAtivosSemGestor (que nomeia "quem ficou de
// fora") usa NOT EXISTS(<> self), então quem tinha uma relação self recente E
// uma não-self antiga não entrava no lote NEM aparecia como excluído. Com o
// filtro dentro, pega a mais recente NÃO-self — as duas consultas concordam.
const JOIN_GESTOR_VIGENTE = (aliasLiderado: string) => `
  JOIN LATERAL (
    SELECT rg.gestor_colaborador_id
      FROM rh.relacao_gestor rg
     WHERE rg.liderado_colaborador_id = ${aliasLiderado}
       AND rg.fim_vigencia IS NULL
       AND rg.inicio_vigencia <= ${HOJE_SP}
       AND rg.gestor_colaborador_id <> ${aliasLiderado}
     ORDER BY rg.inicio_vigencia DESC, rg.id DESC
     LIMIT 1
  ) gv ON TRUE`;

// Resolve, POR COLABORADOR, o modelo a CONGELAR no ciclo: a versão ATIVA do
// cargo vigente da pessoa, com fallback no GERAL (cargo_id IS NULL). ORDER BY
// cargo_id NULLS LAST + LIMIT 1 = o do cargo quando existe, senão o Geral (0074,
// mesmo gesto do buscarChecklistAtivo da admissão). Quem não tem posição vigente
// cai direto no Geral. O guard do serviço garante um Geral ativo, então isto
// nunca resolve NULL (modelo_versao_id é NOT NULL).
const RESOLVER_MODELO = (aliasColaborador: string) => `(
    SELECT m.id
      FROM rh.modelo_avaliacao_versao m
     WHERE m.status = 'ativa'
       AND (m.cargo_id IS NULL
            OR m.cargo_id = (
              SELECT cv.cargo_id
                FROM rh.posicao_colaborador pc
                JOIN rh.cargo_versao cv ON cv.id = pc.cargo_versao_id
               WHERE pc.colaborador_id = ${aliasColaborador}
                 AND pc.fim_vigencia IS NULL
               LIMIT 1))
     ORDER BY m.cargo_id NULLS LAST
     LIMIT 1)`;

/**
 * Geração LAZY dos ciclos de experiência a partir de rh.processo_admissao
 * (contrato de experiência, prazos dos dias 45/90 já calculados na admissão):
 * - marco 45: assim que existe processo não cancelado sem ciclo 45 vivo;
 * - marco 90: após o ciclo 45 decidido por continuar (manter/desenvolver/
 *   renovar) OU quando o dia 45 já passou sem decisão contrária
 *   (nao_renovar/desligar não geram o marco 90).
 * Avaliador = gestor vigente; sem gestor vigente o ciclo NÃO nasce — vira
 * pendência no painel (listarPendenciasSemGestor).
 */
export async function gerarCiclosExperiencia(
  cliente: PoolClient
): Promise<CicloCriado[]> {
  const { rows: criados45 } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ciclo_avaliacao
       (colaborador_id, tipo, modelo_versao_id, avaliador_colaborador_id, prazo, origem)
     SELECT p.colaborador_id, 'experiencia_45', ${RESOLVER_MODELO("p.colaborador_id")},
            gv.gestor_colaborador_id, p.prazo_experiencia_1, 'admissao'
       FROM rh.processo_admissao p
       JOIN rh.colaborador c ON c.id = p.colaborador_id AND c.status <> 'desligado'
       ${JOIN_GESTOR_VIGENTE("p.colaborador_id")}
      WHERE p.contrato_experiencia
        AND p.estado <> 'cancelado'
        AND p.prazo_experiencia_1 IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rh.ciclo_avaliacao ca
                         WHERE ca.colaborador_id = p.colaborador_id
                           AND ca.tipo = 'experiencia_45'
                           AND ca.status <> 'cancelado')
     RETURNING id`
  );

  const { rows: criados90 } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ciclo_avaliacao
       (colaborador_id, tipo, modelo_versao_id, avaliador_colaborador_id, prazo, origem)
     SELECT p.colaborador_id, 'experiencia_90', ${RESOLVER_MODELO("p.colaborador_id")},
            gv.gestor_colaborador_id, p.prazo_experiencia_2, 'admissao'
       FROM rh.processo_admissao p
       JOIN rh.colaborador c ON c.id = p.colaborador_id AND c.status <> 'desligado'
       ${JOIN_GESTOR_VIGENTE("p.colaborador_id")}
      WHERE p.contrato_experiencia
        AND p.estado <> 'cancelado'
        AND p.prazo_experiencia_2 IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rh.ciclo_avaliacao ca
                         WHERE ca.colaborador_id = p.colaborador_id
                           AND ca.tipo = 'experiencia_90'
                           AND ca.status <> 'cancelado')
        AND (EXISTS (SELECT 1
                       FROM rh.ciclo_avaliacao c45
                       JOIN rh.decisao_avaliacao d ON d.ciclo_id = c45.id
                      WHERE c45.colaborador_id = p.colaborador_id
                        AND c45.tipo = 'experiencia_45'
                        AND d.decisao IN ('manter','desenvolver','renovar'))
             OR (${HOJE_SP} > p.prazo_experiencia_1
                 AND NOT EXISTS (SELECT 1
                       FROM rh.ciclo_avaliacao c45
                       JOIN rh.decisao_avaliacao d ON d.ciclo_id = c45.id
                      WHERE c45.colaborador_id = p.colaborador_id
                        AND c45.tipo = 'experiencia_45'
                        AND d.decisao IN ('nao_renovar','desligar'))))
     RETURNING id`
  );

  const ids = [...criados45, ...criados90].map((linha) => Number(linha.id));
  await criarAvaliacoes(cliente, ids);
  return detalharCriados(cliente, ids);
}

export interface PendenciaSemGestor {
  colaborador_nome: string;
  matricula: string;
  marco: "experiencia_45" | "experiencia_90";
  prazo: string;
}

/** Marcos de experiência que NÃO puderam virar ciclo por falta de gestor vigente. */
export async function listarPendenciasSemGestor(): Promise<PendenciaSemGestor[]> {
  const linhas = await consultar<PendenciaSemGestor & Record<string, unknown>>(
    `SELECT c.nome_completo AS colaborador_nome, c.matricula,
            marco.tipo AS marco, marco.prazo::text AS prazo
       FROM rh.processo_admissao p
       JOIN rh.colaborador c ON c.id = p.colaborador_id AND c.status <> 'desligado'
       CROSS JOIN LATERAL (VALUES
         ('experiencia_45', p.prazo_experiencia_1),
         ('experiencia_90', p.prazo_experiencia_2)
       ) AS marco (tipo, prazo)
      WHERE p.contrato_experiencia
        AND p.estado <> 'cancelado'
        AND marco.prazo IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM rh.ciclo_avaliacao ca
                         WHERE ca.colaborador_id = p.colaborador_id
                           AND ca.tipo = marco.tipo
                           AND ca.status <> 'cancelado')
        AND NOT EXISTS (SELECT 1 FROM rh.relacao_gestor rg
                         WHERE rg.liderado_colaborador_id = p.colaborador_id
                           AND rg.fim_vigencia IS NULL
                           AND rg.inicio_vigencia <= ${HOJE_SP}
                           AND rg.gestor_colaborador_id <> p.colaborador_id)
      ORDER BY marco.prazo, c.nome_completo`
  );
  return linhas.map((linha) => ({
    colaborador_nome: linha.colaborador_nome,
    matricula: linha.matricula,
    marco: linha.marco,
    prazo: linha.prazo,
  }));
}

/**
 * Abertura em LOTE do ciclo de desempenho: todo colaborador ATIVO com gestor
 * vigente e sem ciclo de desempenho vivo. Retorna os criados (para o audit).
 */
export async function abrirLoteDesempenho(
  cliente: PoolClient,
  prazo: string
): Promise<CicloCriado[]> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ciclo_avaliacao
       (colaborador_id, tipo, modelo_versao_id, avaliador_colaborador_id, prazo, origem)
     SELECT c.id, 'desempenho', ${RESOLVER_MODELO("c.id")},
            gv.gestor_colaborador_id, $1::date, 'lote'
       FROM rh.colaborador c
       ${JOIN_GESTOR_VIGENTE("c.id")}
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.ciclo_avaliacao ca
                         WHERE ca.colaborador_id = c.id
                           AND ca.tipo = 'desempenho'
                           AND ca.status NOT IN ('decidido','cancelado'))
     RETURNING id`,
    [prazo]
  );
  const ids = rows.map((linha) => Number(linha.id));
  await criarAvaliacoes(cliente, ids);
  return detalharCriados(cliente, ids);
}

/** Colaboradores ativos SEM gestor vigente (ficam fora do lote — aviso ao RH). */
export async function listarAtivosSemGestor(): Promise<
  { colaborador_nome: string; matricula: string }[]
> {
  const linhas = await consultar<{
    colaborador_nome: string;
    matricula: string;
  }>(
    `SELECT c.nome_completo AS colaborador_nome, c.matricula
       FROM rh.colaborador c
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.relacao_gestor rg
                         WHERE rg.liderado_colaborador_id = c.id
                           AND rg.fim_vigencia IS NULL
                           AND rg.inicio_vigencia <= ${HOJE_SP}
                           AND rg.gestor_colaborador_id <> c.id)
      ORDER BY c.nome_completo`
  );
  return linhas;
}

// ------------------------------------------------------------------ respostas

export interface RespostaGravada extends RespostaParaCalculo {
  atualizado_em: string;
}

export async function listarRespostas(
  avaliacaoId: number
): Promise<RespostaGravada[]> {
  const linhas = await consultar<{
    indicador_avaliacao_id: string;
    nota: number | null;
    nao_observado: boolean;
    atualizado_em: string;
  }>(
    `SELECT indicador_avaliacao_id, nota, nao_observado, atualizado_em
       FROM rh.resposta_item
      WHERE avaliacao_id = $1`,
    [avaliacaoId]
  );
  return linhas.map((linha) => ({
    indicador_id: Number(linha.indicador_avaliacao_id),
    nota: linha.nota,
    nao_observado: linha.nao_observado,
    atualizado_em: linha.atualizado_em,
  }));
}

export async function listarRespostasComCliente(
  cliente: PoolClient,
  avaliacaoId: number
): Promise<RespostaParaCalculo[]> {
  const { rows } = await cliente.query<{
    indicador_avaliacao_id: string;
    nota: number | null;
    nao_observado: boolean;
  }>(
    `SELECT indicador_avaliacao_id, nota, nao_observado
       FROM rh.resposta_item
      WHERE avaliacao_id = $1`,
    [avaliacaoId]
  );
  return rows.map((linha) => ({
    indicador_id: Number(linha.indicador_avaliacao_id),
    nota: linha.nota,
    nao_observado: linha.nao_observado,
  }));
}

/**
 * Garante a linha de resposta (rascunho) do PAPEL pedido — normalmente já existe
 * desde a abertura (criarAvaliacoes); é a rede de segurança para ciclos legados.
 * O avaliador sai do próprio ciclo: papel 'auto' → o avaliado; 'lider' → o
 * avaliador designado. Chaveado por (ciclo, papel), nunca só por ciclo (0067).
 */
export async function garantirAvaliacao(
  cliente: PoolClient,
  cicloId: number,
  papel: "lider" | "auto"
): Promise<number> {
  await cliente.query(
    `INSERT INTO rh.avaliacao (ciclo_id, papel, avaliador_colaborador_id)
     SELECT ca.id, $2,
            CASE $2 WHEN 'auto' THEN ca.colaborador_id
                    ELSE ca.avaliador_colaborador_id END
       FROM rh.ciclo_avaliacao ca
      WHERE ca.id = $1
     ON CONFLICT (ciclo_id, papel) DO NOTHING`,
    [cicloId, papel]
  );
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id FROM rh.avaliacao WHERE ciclo_id = $1 AND papel = $2`,
    [cicloId, papel]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ autoavaliação (papel=auto)

export interface AutoavaliacaoResumo {
  ciclo_id: number;
  tipo: TipoCiclo;
  status: StatusCiclo;
  prazo: string;
  dias_para_prazo: number;
  modelo_versao: number;
  modelo_nome: string;
  estado: "rascunho" | "enviada" | null;
}

/** As autoavaliações do PRÓPRIO colaborador (papel=auto; ciclos de desempenho). */
export async function listarAutoavaliacoesDoColaborador(
  usuarioId: number
): Promise<AutoavaliacaoResumo[]> {
  const linhas = await consultar<{
    ciclo_id: string;
    tipo: TipoCiclo;
    status: StatusCiclo;
    prazo: string;
    dias_para_prazo: number;
    modelo_versao: number;
    modelo_nome: string;
    estado: "rascunho" | "enviada" | null;
  }>(
    `SELECT ca.id AS ciclo_id, ca.tipo, ca.status, ca.prazo::text AS prazo,
            (ca.prazo - ${HOJE_SP})::int AS dias_para_prazo,
            m.versao AS modelo_versao, m.nome AS modelo_nome,
            a.estado
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
       JOIN rh.avaliacao a ON a.ciclo_id = ca.id AND a.papel = 'auto'
      WHERE c.usuario_id = $1 AND ca.tipo = 'desempenho'
      ORDER BY (a.estado IS DISTINCT FROM 'enviada') DESC,
               (ca.status IN ('aberto','em_avaliacao')) DESC, ca.prazo, ca.id`,
    [usuarioId]
  );
  return linhas.map((l) => ({ ...l, ciclo_id: Number(l.ciclo_id) }));
}

export interface AutoavaliacaoDetalhe {
  ciclo_id: number;
  colaborador_nome: string;
  tipo: TipoCiclo;
  status: StatusCiclo;
  prazo: string;
  dias_para_prazo: number;
  modelo_versao_id: number;
  modelo_versao: number;
  modelo_nome: string;
  avaliacao_id: number | null;
  estado: "rascunho" | "enviada" | null;
}

/**
 * Uma autoavaliação para o próprio colaborador responder — CEGA: traz só o
 * ciclo/modelo e o estado da linha 'auto'. NUNCA toca a avaliação do líder nem
 * o resultado (é o que garante que o colaborador não copie a nota do líder).
 * Escopo pelo usuário da sessão (c.usuario_id = $2), nunca pela requisição.
 */
export async function buscarAutoavaliacao(
  cicloId: number,
  usuarioId: number
): Promise<AutoavaliacaoDetalhe | null> {
  const linhas = await consultar<{
    ciclo_id: string;
    colaborador_nome: string;
    tipo: TipoCiclo;
    status: StatusCiclo;
    prazo: string;
    dias_para_prazo: number;
    modelo_versao_id: string;
    modelo_versao: number;
    modelo_nome: string;
    avaliacao_id: string | null;
    estado: "rascunho" | "enviada" | null;
  }>(
    `SELECT ca.id AS ciclo_id, c.nome_completo AS colaborador_nome,
            ca.tipo, ca.status, ca.prazo::text AS prazo,
            (ca.prazo - ${HOJE_SP})::int AS dias_para_prazo,
            ca.modelo_versao_id, m.versao AS modelo_versao, m.nome AS modelo_nome,
            a.id AS avaliacao_id, a.estado
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
       LEFT JOIN rh.avaliacao a ON a.ciclo_id = ca.id AND a.papel = 'auto'
      WHERE ca.id = $1 AND ca.tipo = 'desempenho' AND c.usuario_id = $2`,
    [cicloId, usuarioId]
  );
  if (linhas.length === 0) return null;
  const l = linhas[0];
  return {
    ...l,
    ciclo_id: Number(l.ciclo_id),
    modelo_versao_id: Number(l.modelo_versao_id),
    avaliacao_id: l.avaliacao_id === null ? null : Number(l.avaliacao_id),
  };
}

export interface RespostaAutoNomeada {
  indicador_nome: string;
  pilar_nome: string;
  nota: number | null;
  nao_observado: boolean;
}

/**
 * As respostas da autoavaliação ENVIADA de um ciclo, com nome do indicador e do
 * pilar — insumo dos "pontos cegos" (auto × líder) do PDI. Vazio se não houver
 * auto enviada (experiência, ou ciclo sem autoavaliação): o PDI segue sem cegos.
 */
export async function listarRespostasAutoDoCiclo(
  cicloId: number
): Promise<RespostaAutoNomeada[]> {
  return consultar<{
    indicador_nome: string;
    pilar_nome: string;
    nota: number | null;
    nao_observado: boolean;
  }>(
    `SELECT i.nome AS indicador_nome, p.nome AS pilar_nome,
            r.nota, r.nao_observado
       FROM rh.avaliacao a
       JOIN rh.resposta_item r ON r.avaliacao_id = a.id
       JOIN rh.indicador_avaliacao i ON i.id = r.indicador_avaliacao_id
       JOIN rh.pilar_avaliacao p ON p.id = i.pilar_id
      WHERE a.ciclo_id = $1 AND a.papel = 'auto' AND a.estado = 'enviada'`,
    [cicloId]
  );
}

// ------------------------------------------------------------------ 360 de pares (papel=par)

export interface ParDoCiclo {
  colaborador_id: number;
  nome: string;
  cargo: string | null;
  estado: "rascunho" | "enviada" | null;
}

/** Os pares já selecionados de um ciclo (com o estado de cada avaliação). */
export async function listarParesDoCiclo(
  cicloId: number
): Promise<ParDoCiclo[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome: string;
    cargo: string | null;
    estado: "rascunho" | "enviada" | null;
  }>(
    `SELECT p.id AS colaborador_id, p.nome_completo AS nome,
            NULL::text AS cargo, a.estado
       FROM rh.avaliacao a
       JOIN rh.colaborador p ON p.id = a.avaliador_colaborador_id
      WHERE a.ciclo_id = $1 AND a.papel = 'par'
      ORDER BY p.nome_completo`,
    [cicloId]
  );
  return linhas.map((l) => ({ ...l, colaborador_id: Number(l.colaborador_id) }));
}

export interface CandidatoPar {
  colaborador_id: number;
  nome: string;
  cargo: string | null;
  ja_selecionado: boolean;
}

/**
 * Candidatos a par: os colegas de equipe do avaliado (mesmo gestor vigente que o
 * avaliador do ciclo), fora o próprio avaliado. Marca quem já foi selecionado.
 */
export async function listarCandidatosPares(
  cicloId: number
): Promise<CandidatoPar[]> {
  const linhas = await consultar<{
    colaborador_id: string;
    nome: string;
    cargo: string | null;
    ja_selecionado: boolean;
  }>(
    `SELECT c.id AS colaborador_id, c.nome_completo AS nome, NULL::text AS cargo,
            EXISTS (SELECT 1 FROM rh.avaliacao a
                     WHERE a.ciclo_id = ca.id AND a.papel = 'par'
                       AND a.avaliador_colaborador_id = c.id) AS ja_selecionado
       FROM rh.ciclo_avaliacao ca
       JOIN rh.relacao_gestor rg
         ON rg.gestor_colaborador_id = ca.avaliador_colaborador_id
        AND rg.fim_vigencia IS NULL
        AND rg.inicio_vigencia <= ${HOJE_SP}
       JOIN rh.colaborador c ON c.id = rg.liderado_colaborador_id
      WHERE ca.id = $1 AND c.id <> ca.colaborador_id
      ORDER BY c.nome_completo`,
    [cicloId]
  );
  return linhas.map((l) => ({
    ...l,
    colaborador_id: Number(l.colaborador_id),
  }));
}

/** Cria a linha de par (rascunho). A coerência (par ≠ avaliado/líder) é do gatilho. */
export async function inserirPar(
  cliente: PoolClient,
  cicloId: number,
  parColaboradorId: number
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.avaliacao (ciclo_id, papel, avaliador_colaborador_id)
     VALUES ($1, 'par', $2)
     ON CONFLICT (ciclo_id, avaliador_colaborador_id)
       WHERE papel = 'par' DO NOTHING`,
    [cicloId, parColaboradorId]
  );
}

/** Remove um par ainda em rascunho (junto das respostas que tiver salvo). */
export async function removerPar(
  cliente: PoolClient,
  cicloId: number,
  parColaboradorId: number
): Promise<number> {
  await cliente.query(
    `DELETE FROM rh.resposta_item
      WHERE avaliacao_id IN (
        SELECT id FROM rh.avaliacao
         WHERE ciclo_id = $1 AND papel = 'par'
           AND avaliador_colaborador_id = $2 AND estado = 'rascunho')`,
    [cicloId, parColaboradorId]
  );
  const { rowCount } = await cliente.query(
    `DELETE FROM rh.avaliacao
      WHERE ciclo_id = $1 AND papel = 'par'
        AND avaliador_colaborador_id = $2 AND estado = 'rascunho'`,
    [cicloId, parColaboradorId]
  );
  return rowCount ?? 0;
}

export interface AvaliacaoDeParDetalhe {
  ciclo_id: number;
  avaliado_nome: string;
  tipo: TipoCiclo;
  status: StatusCiclo;
  prazo: string;
  dias_para_prazo: number;
  modelo_versao_id: number;
  modelo_versao: number;
  modelo_nome: string;
  avaliacao_id: number | null;
  estado: "rascunho" | "enviada" | null;
}

/**
 * A avaliação de par para o colega responder — CEGA ao líder/auto/resultado. O
 * par VÊ o nome do avaliado (precisa saber quem avalia); o que é anônimo é a
 * resposta DELE perante o avaliado, garantido na agregação. Escopo: o usuário da
 * sessão tem de ser o par (avaliador_colaborador da linha 'par').
 */
export async function buscarAvaliacaoDePar(
  cicloId: number,
  usuarioId: number
): Promise<AvaliacaoDeParDetalhe | null> {
  const linhas = await consultar<{
    ciclo_id: string;
    avaliado_nome: string;
    tipo: TipoCiclo;
    status: StatusCiclo;
    prazo: string;
    dias_para_prazo: number;
    modelo_versao_id: string;
    modelo_versao: number;
    modelo_nome: string;
    avaliacao_id: string | null;
    estado: "rascunho" | "enviada" | null;
  }>(
    `SELECT ca.id AS ciclo_id, cc.nome_completo AS avaliado_nome,
            ca.tipo, ca.status, ca.prazo::text AS prazo,
            (ca.prazo - ${HOJE_SP})::int AS dias_para_prazo,
            ca.modelo_versao_id, m.versao AS modelo_versao, m.nome AS modelo_nome,
            a.id AS avaliacao_id, a.estado
       FROM rh.avaliacao a
       JOIN rh.colaborador p ON p.id = a.avaliador_colaborador_id
       JOIN rh.ciclo_avaliacao ca ON ca.id = a.ciclo_id
       JOIN rh.colaborador cc ON cc.id = ca.colaborador_id
       JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
      WHERE a.ciclo_id = $1 AND a.papel = 'par' AND p.usuario_id = $2`,
    [cicloId, usuarioId]
  );
  if (linhas.length === 0) return null;
  const l = linhas[0];
  return {
    ...l,
    ciclo_id: Number(l.ciclo_id),
    modelo_versao_id: Number(l.modelo_versao_id),
    avaliacao_id: l.avaliacao_id === null ? null : Number(l.avaliacao_id),
  };
}

export interface AvaliacaoDeParResumo {
  ciclo_id: number;
  avaliado_nome: string;
  tipo: TipoCiclo;
  status: StatusCiclo;
  prazo: string;
  dias_para_prazo: number;
  modelo_nome: string;
  estado: "rascunho" | "enviada" | null;
}

/** As avaliações de par que pediram AO colaborador da sessão (pendentes primeiro). */
export async function listarAvaliacoesDeParDoColaborador(
  usuarioId: number
): Promise<AvaliacaoDeParResumo[]> {
  const linhas = await consultar<{
    ciclo_id: string;
    avaliado_nome: string;
    tipo: TipoCiclo;
    status: StatusCiclo;
    prazo: string;
    dias_para_prazo: number;
    modelo_nome: string;
    estado: "rascunho" | "enviada" | null;
  }>(
    `SELECT ca.id AS ciclo_id, cc.nome_completo AS avaliado_nome,
            ca.tipo, ca.status, ca.prazo::text AS prazo,
            (ca.prazo - ${HOJE_SP})::int AS dias_para_prazo,
            m.nome AS modelo_nome, a.estado
       FROM rh.avaliacao a
       JOIN rh.colaborador p ON p.id = a.avaliador_colaborador_id
       JOIN rh.ciclo_avaliacao ca ON ca.id = a.ciclo_id
       JOIN rh.colaborador cc ON cc.id = ca.colaborador_id
       JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
      WHERE p.usuario_id = $1 AND a.papel = 'par'
        AND ca.status IN ('aberto','em_avaliacao','consolidado')
      ORDER BY (a.estado IS DISTINCT FROM 'enviada') DESC, ca.prazo, ca.id`,
    [usuarioId]
  );
  return linhas.map((l) => ({ ...l, ciclo_id: Number(l.ciclo_id) }));
}

export interface AgregadoParIndicador {
  indicador_nome: string;
  pilar_nome: string;
  media: number;
  respostas: number;
}

/** Quantos pares ENVIARAM a avaliação (base do piso de anonimato). */
export async function contarParesEnviados(cicloId: number): Promise<number> {
  const linhas = await consultar<{ n: string }>(
    `SELECT count(*) AS n FROM rh.avaliacao
      WHERE ciclo_id = $1 AND papel = 'par' AND estado = 'enviada'`,
    [cicloId]
  );
  return Number(linhas[0]?.n ?? 0);
}

/**
 * Média dos pares por indicador (só notas de avaliações de par ENVIADAS). Cru: a
 * DECISÃO do piso de anonimato é do serviço — aqui é só a agregação, e ela nunca
 * traz qual par deu qual nota.
 */
export async function agregarParesDoCiclo(
  cicloId: number
): Promise<AgregadoParIndicador[]> {
  return consultar<{
    indicador_nome: string;
    pilar_nome: string;
    media: number;
    respostas: number;
  }>(
    `SELECT i.nome AS indicador_nome, p.nome AS pilar_nome,
            round(avg(r.nota), 2)::float8 AS media,
            count(r.nota)::int AS respostas
       FROM rh.avaliacao a
       JOIN rh.resposta_item r ON r.avaliacao_id = a.id AND r.nota IS NOT NULL
       JOIN rh.indicador_avaliacao i ON i.id = r.indicador_avaliacao_id
       JOIN rh.pilar_avaliacao p ON p.id = i.pilar_id
      WHERE a.ciclo_id = $1 AND a.papel = 'par' AND a.estado = 'enviada'
      GROUP BY i.nome, p.nome
      ORDER BY p.nome, i.nome`,
    [cicloId]
  );
}

/** Upsert do rascunho — o gatilho do banco valida modelo e imutabilidade. */
export async function salvarRespostas(
  cliente: PoolClient,
  avaliacaoId: number,
  respostas: RespostaParaCalculo[]
): Promise<void> {
  for (const resposta of respostas) {
    await cliente.query(
      `INSERT INTO rh.resposta_item
         (avaliacao_id, indicador_avaliacao_id, nota, nao_observado)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (avaliacao_id, indicador_avaliacao_id)
       DO UPDATE SET nota = EXCLUDED.nota, nao_observado = EXCLUDED.nao_observado`,
      [avaliacaoId, resposta.indicador_id, resposta.nota, resposta.nao_observado]
    );
  }
}

export async function contarIndicadoresDoModelo(
  cliente: PoolClient,
  modeloVersaoId: number
): Promise<number> {
  const { rows } = await cliente.query<{ total: string }>(
    `SELECT COUNT(*) AS total
       FROM rh.indicador_avaliacao i
       JOIN rh.pilar_avaliacao p ON p.id = i.pilar_id
      WHERE p.modelo_versao_id = $1`,
    [modeloVersaoId]
  );
  return Number(rows[0].total);
}

export async function marcarEnviada(
  cliente: PoolClient,
  avaliacaoId: number
): Promise<void> {
  await cliente.query(
    `UPDATE rh.avaliacao
        SET estado = 'enviada', enviado_em = now()
      WHERE id = $1`,
    [avaliacaoId]
  );
}

export async function atualizarStatusCiclo(
  cliente: PoolClient,
  cicloId: number,
  status: StatusCiclo
): Promise<void> {
  await cliente.query(
    `UPDATE rh.ciclo_avaliacao SET status = $2 WHERE id = $1`,
    [cicloId, status]
  );
}

// ------------------------------------------------------------------ resultado e decisão

export async function inserirResultado(
  cliente: PoolClient,
  dados: {
    ciclo_id: number;
    percentual: number;
    faixa_resultado_id: number;
    recomendacao: Recomendacao;
    memoria_calculo: MemoriaCalculo;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.resultado_avaliacao
       (ciclo_id, percentual, faixa_resultado_id, recomendacao, memoria_calculo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.ciclo_id,
      dados.percentual,
      dados.faixa_resultado_id,
      dados.recomendacao,
      JSON.stringify(dados.memoria_calculo),
    ]
  );
  return Number(rows[0].id);
}

export interface ResultadoGravado {
  id: number;
  percentual: number;
  recomendacao: Recomendacao;
  faixa_rotulo: string;
  faixa_minimo: number;
  faixa_maximo: number;
  memoria_calculo: MemoriaCalculo;
  em: string;
}

export async function buscarResultado(
  cicloId: number
): Promise<ResultadoGravado | null> {
  const linhas = await consultar<{
    id: string;
    percentual: string;
    recomendacao: Recomendacao;
    faixa_rotulo: string;
    faixa_minimo: string;
    faixa_maximo: string;
    memoria_calculo: MemoriaCalculo;
    em: string;
  }>(
    `SELECT r.id, r.percentual::text AS percentual, r.recomendacao,
            f.rotulo AS faixa_rotulo, f.minimo::text AS faixa_minimo,
            f.maximo::text AS faixa_maximo, r.memoria_calculo, r.em
       FROM rh.resultado_avaliacao r
       JOIN rh.faixa_resultado_versao f ON f.id = r.faixa_resultado_id
      WHERE r.ciclo_id = $1`,
    [cicloId]
  );
  if (linhas.length === 0) return null;
  return {
    ...linhas[0],
    id: Number(linhas[0].id),
    percentual: Number(linhas[0].percentual),
    faixa_minimo: Number(linhas[0].faixa_minimo),
    faixa_maximo: Number(linhas[0].faixa_maximo),
  };
}

export async function buscarResultadoComCliente(
  cliente: PoolClient,
  cicloId: number
): Promise<{ recomendacao: Recomendacao; faixa_rotulo: string } | null> {
  const { rows } = await cliente.query<{
    recomendacao: Recomendacao;
    faixa_rotulo: string;
  }>(
    `SELECT r.recomendacao, f.rotulo AS faixa_rotulo
       FROM rh.resultado_avaliacao r
       JOIN rh.faixa_resultado_versao f ON f.id = r.faixa_resultado_id
      WHERE r.ciclo_id = $1`,
    [cicloId]
  );
  return rows.length ? rows[0] : null;
}

export async function inserirDecisao(
  cliente: PoolClient,
  dados: {
    ciclo_id: number;
    decisao: Decisao;
    divergente: boolean;
    justificativa: string | null;
    decisor_usuario_id: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.decisao_avaliacao
       (ciclo_id, decisao, divergente, justificativa, decisor_usuario_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.ciclo_id,
      dados.decisao,
      dados.divergente,
      dados.justificativa,
      dados.decisor_usuario_id,
    ]
  );
  return Number(rows[0].id);
}

export interface DecisaoGravada {
  decisao: Decisao;
  divergente: boolean;
  justificativa: string | null;
  decisor_nome: string;
  em: string;
}

export async function buscarDecisao(
  cicloId: number
): Promise<DecisaoGravada | null> {
  const linhas = await consultar<DecisaoGravada & Record<string, unknown>>(
    `SELECT d.decisao, d.divergente, d.justificativa, u.nome AS decisor_nome, d.em
       FROM rh.decisao_avaliacao d
       JOIN sistema.usuario u ON u.id = d.decisor_usuario_id
      WHERE d.ciclo_id = $1`,
    [cicloId]
  );
  if (linhas.length === 0) return null;
  return {
    decisao: linhas[0].decisao,
    divergente: linhas[0].divergente,
    justificativa: linhas[0].justificativa,
    decisor_nome: linhas[0].decisor_nome,
    em: linhas[0].em,
  };
}

// ------------------------------------------------------------------ trilha de leitura

/** Toda leitura autorizada de resultado/notas brutas gera trilha. */
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
