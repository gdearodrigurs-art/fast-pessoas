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
}

export async function listarModelos(): Promise<ModeloResumo[]> {
  const linhas = await consultar<{
    id: string;
    versao: number;
    nome: string;
    status: "rascunho" | "ativa" | "encerrada";
    inicio_vigencia: string;
    fim_vigencia: string | null;
  }>(
    `SELECT id, versao, nome, status,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia
       FROM rh.modelo_avaliacao_versao
      ORDER BY versao DESC`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarModeloAtivo(): Promise<ModeloResumo | null> {
  const modelos = await listarModelos();
  return modelos.find((m) => m.status === "ativa") ?? null;
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
  }>(
    `SELECT id, versao, nome, status,
            inicio_vigencia::text AS inicio_vigencia,
            fim_vigencia::text AS fim_vigencia
       FROM rh.modelo_avaliacao_versao
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return rows.length ? { ...rows[0], id: Number(rows[0].id) } : null;
}

export async function existeRascunho(): Promise<number | null> {
  const linhas = await consultar<{ id: string }>(
    `SELECT id FROM rh.modelo_avaliacao_versao WHERE status = 'rascunho'`
  );
  return linhas.length ? Number(linhas[0].id) : null;
}

export async function criarModeloRascunho(
  cliente: PoolClient,
  nome: string
): Promise<{ id: number; versao: number }> {
  const { rows } = await cliente.query<{ id: string; versao: number }>(
    `INSERT INTO rh.modelo_avaliacao_versao (versao, nome, status, inicio_vigencia)
     SELECT COALESCE(MAX(versao), 0) + 1, $1, 'rascunho', ${HOJE_SP}
       FROM rh.modelo_avaliacao_versao
     RETURNING id, versao`,
    [nome]
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

/** Encerra a versão ativa (se houver) e ativa o rascunho — ordem importa. */
export async function ativarModelo(
  cliente: PoolClient,
  modeloVersaoId: number
): Promise<number | null> {
  const { rows } = await cliente.query<{ id: string }>(
    `UPDATE rh.modelo_avaliacao_versao
        SET status = 'encerrada', fim_vigencia = ${HOJE_SP}
      WHERE status = 'ativa'
      RETURNING id`
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
    LEFT JOIN rh.avaliacao a ON a.ciclo_id = ca.id`;

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
       LEFT JOIN rh.avaliacao a ON a.ciclo_id = ca.id
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
  avaliador_usuario_id: number;
  tipo: TipoCiclo;
  status: StatusCiclo;
  modelo_versao_id: number;
  avaliacao_id: number | null;
  avaliacao_estado: "rascunho" | "enviada" | null;
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
    avaliador_usuario_id: string;
    tipo: TipoCiclo;
    status: StatusCiclo;
    modelo_versao_id: string;
    avaliacao_id: string | null;
    avaliacao_estado: "rascunho" | "enviada" | null;
  }>(
    `SELECT ca.id, ca.colaborador_id, c.nome_completo AS colaborador_nome,
            c.matricula, g.usuario_id AS avaliador_usuario_id,
            ca.tipo, ca.status, ca.modelo_versao_id,
            a.id AS avaliacao_id, a.estado AS avaliacao_estado
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
       LEFT JOIN rh.avaliacao a ON a.ciclo_id = ca.id
      WHERE ca.id = $1
      FOR UPDATE OF ca`,
    [id]
  );
  if (rows.length === 0) return null;
  return {
    ...rows[0],
    id: Number(rows[0].id),
    colaborador_id: Number(rows[0].colaborador_id),
    avaliador_usuario_id: Number(rows[0].avaliador_usuario_id),
    modelo_versao_id: Number(rows[0].modelo_versao_id),
    avaliacao_id:
      rows[0].avaliacao_id === null ? null : Number(rows[0].avaliacao_id),
  };
}

// ------------------------------------------------------------------ ciclos — geração

export interface CicloCriado {
  id: number;
  colaborador_nome: string;
  matricula: string;
  avaliador_nome: string;
  tipo: TipoCiclo;
  prazo: string;
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
    tipo: TipoCiclo;
    prazo: string;
  }>(
    `SELECT ca.id, c.nome_completo AS colaborador_nome, c.matricula,
            g.nome_completo AS avaliador_nome, ca.tipo, ca.prazo::text AS prazo
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
      WHERE ca.id = ANY($1::bigint[])
      ORDER BY ca.id`,
    [ids]
  );
  return rows.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/** Cria a linha de resposta (rascunho) de cada ciclo recém-aberto. */
async function criarAvaliacoes(
  cliente: PoolClient,
  cicloIds: number[]
): Promise<void> {
  if (cicloIds.length === 0) return;
  await cliente.query(
    `INSERT INTO rh.avaliacao (ciclo_id)
     SELECT unnest($1::bigint[])`,
    [cicloIds]
  );
}

// Gestor vigente (um só por liderado: relação mais recente).
const JOIN_GESTOR_VIGENTE = (aliasLiderado: string) => `
  JOIN LATERAL (
    SELECT rg.gestor_colaborador_id
      FROM rh.relacao_gestor rg
     WHERE rg.liderado_colaborador_id = ${aliasLiderado}
       AND rg.fim_vigencia IS NULL
       AND rg.inicio_vigencia <= ${HOJE_SP}
     ORDER BY rg.inicio_vigencia DESC, rg.id DESC
     LIMIT 1
  ) gv ON gv.gestor_colaborador_id <> ${aliasLiderado}`;

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
  cliente: PoolClient,
  modeloVersaoId: number
): Promise<CicloCriado[]> {
  const { rows: criados45 } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ciclo_avaliacao
       (colaborador_id, tipo, modelo_versao_id, avaliador_colaborador_id, prazo, origem)
     SELECT p.colaborador_id, 'experiencia_45', $1, gv.gestor_colaborador_id,
            p.prazo_experiencia_1, 'admissao'
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
     RETURNING id`,
    [modeloVersaoId]
  );

  const { rows: criados90 } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ciclo_avaliacao
       (colaborador_id, tipo, modelo_versao_id, avaliador_colaborador_id, prazo, origem)
     SELECT p.colaborador_id, 'experiencia_90', $1, gv.gestor_colaborador_id,
            p.prazo_experiencia_2, 'admissao'
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
     RETURNING id`,
    [modeloVersaoId]
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
  modeloVersaoId: number,
  prazo: string
): Promise<CicloCriado[]> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.ciclo_avaliacao
       (colaborador_id, tipo, modelo_versao_id, avaliador_colaborador_id, prazo, origem)
     SELECT c.id, 'desempenho', $1, gv.gestor_colaborador_id, $2::date, 'lote'
       FROM rh.colaborador c
       ${JOIN_GESTOR_VIGENTE("c.id")}
      WHERE c.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM rh.ciclo_avaliacao ca
                         WHERE ca.colaborador_id = c.id
                           AND ca.tipo = 'desempenho'
                           AND ca.status NOT IN ('decidido','cancelado'))
     RETURNING id`,
    [modeloVersaoId, prazo]
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

/** Linha de resposta do ciclo (rascunho) — criada com o ciclo; garante aqui. */
export async function garantirAvaliacao(
  cliente: PoolClient,
  cicloId: number
): Promise<number> {
  await cliente.query(
    `INSERT INTO rh.avaliacao (ciclo_id)
     VALUES ($1)
     ON CONFLICT (ciclo_id) DO NOTHING`,
    [cicloId]
  );
  const { rows } = await cliente.query<{ id: string }>(
    `SELECT id FROM rh.avaliacao WHERE ciclo_id = $1`,
    [cicloId]
  );
  return Number(rows[0].id);
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
