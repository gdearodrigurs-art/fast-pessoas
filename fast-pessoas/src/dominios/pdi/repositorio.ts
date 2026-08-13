import { PoolClient } from "pg";

import { consultar } from "../../lib/banco";
import type { AvisoPdi } from "./calculo";
import type { ConteudoPdi, EntrevistaPdi, StatusPdi } from "./esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// ------------------------------------------------------------------ contexto do ciclo

export interface ContextoCiclo {
  pessoa_id: number;
  colaborador_id: number;
  colaborador_nome: string;
  avaliador_usuario_id: number;
  modelo_nome: string;
}

/** Dados do ciclo necessários para gerar/materializar (sem tocar na nota crua). */
export async function contextoDoCiclo(
  cicloId: number
): Promise<ContextoCiclo | null> {
  const linhas = await consultar<{
    pessoa_id: string;
    colaborador_id: string;
    colaborador_nome: string;
    avaliador_usuario_id: string;
    modelo_nome: string;
  }>(
    `SELECT c.pessoa_id, ca.colaborador_id, c.nome_completo AS colaborador_nome,
            g.usuario_id AS avaliador_usuario_id, m.nome AS modelo_nome
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
       JOIN rh.modelo_avaliacao_versao m ON m.id = ca.modelo_versao_id
      WHERE ca.id = $1`,
    [cicloId]
  );
  if (linhas.length === 0) return null;
  return {
    pessoa_id: Number(linhas[0].pessoa_id),
    colaborador_id: Number(linhas[0].colaborador_id),
    colaborador_nome: linhas[0].colaborador_nome,
    avaliador_usuario_id: Number(linhas[0].avaliador_usuario_id),
    modelo_nome: linhas[0].modelo_nome,
  };
}

// ------------------------------------------------------------------ ciclos elegíveis

export interface CicloParaPdi {
  ciclo_id: number;
  colaborador_nome: string;
  matricula: string;
  faixa_rotulo: string;
  ja_tem_pdi: boolean;
}

/**
 * Ciclos CONSOLIDADOS (têm resultado) que o usuário pode transformar em PDI:
 * os que ele avaliou (gestor) ou todos, se tiver alcance amplo. Não expõe a
 * nota — só o rótulo da faixa, que o gestor pode ver.
 */
export async function listarCiclosParaPdi(
  usuarioId: number,
  amplo: boolean
): Promise<CicloParaPdi[]> {
  const linhas = await consultar<{
    ciclo_id: string;
    colaborador_nome: string;
    matricula: string;
    faixa_rotulo: string;
    ja_tem_pdi: boolean;
  }>(
    `SELECT ca.id AS ciclo_id, c.nome_completo AS colaborador_nome, c.matricula,
            f.rotulo AS faixa_rotulo,
            EXISTS (SELECT 1 FROM rh.pdi p
                     WHERE p.ciclo_id = ca.id AND p.status <> 'cancelado') AS ja_tem_pdi
       FROM rh.ciclo_avaliacao ca
       JOIN rh.colaborador c ON c.id = ca.colaborador_id
       JOIN rh.colaborador g ON g.id = ca.avaliador_colaborador_id
       JOIN rh.resultado_avaliacao r ON r.ciclo_id = ca.id
       JOIN rh.faixa_resultado_versao f ON f.id = r.faixa_resultado_id
      WHERE ($2 OR g.usuario_id = $1)
      ORDER BY ca.criado_em DESC
      LIMIT 100`,
    [usuarioId, amplo]
  );
  return linhas.map((l) => ({
    ciclo_id: Number(l.ciclo_id),
    colaborador_nome: l.colaborador_nome,
    matricula: l.matricula,
    faixa_rotulo: l.faixa_rotulo,
    ja_tem_pdi: l.ja_tem_pdi,
  }));
}

// ------------------------------------------------------------------ o PDI

export interface PdiGravado {
  id: number;
  pessoa_id: number;
  pessoa_nome: string;
  ciclo_id: number | null;
  status: StatusPdi;
  parametros: EntrevistaPdi;
  rascunho_ia: ConteudoPdi;
  conteudo: ConteudoPdi;
  avisos: AvisoPdi[];
  modelo_ia: string;
  gerado_por_nome: string;
  gerado_em: string;
  submetido_em: string | null;
  homologado_em: string | null;
  aceito_em: string | null;
}

export async function inserirPdi(
  cliente: PoolClient,
  dados: {
    pessoa_id: number;
    ciclo_id: number;
    parametros: EntrevistaPdi;
    rascunho_ia: ConteudoPdi;
    conteudo: ConteudoPdi;
    avisos: AvisoPdi[];
    modelo_ia: string;
    gerado_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh.pdi
       (pessoa_id, ciclo_id, status, parametros, rascunho_ia, conteudo,
        avisos, modelo_ia, gerado_por)
     VALUES ($1, $2, 'rascunho', $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      dados.pessoa_id,
      dados.ciclo_id,
      JSON.stringify(dados.parametros),
      JSON.stringify(dados.rascunho_ia),
      JSON.stringify(dados.conteudo),
      JSON.stringify(dados.avisos),
      dados.modelo_ia,
      dados.gerado_por,
    ]
  );
  return Number(rows[0].id);
}

function paraPdi(linha: Record<string, unknown>): PdiGravado {
  return {
    id: Number(linha.id),
    pessoa_id: Number(linha.pessoa_id),
    pessoa_nome: String(linha.pessoa_nome),
    ciclo_id: linha.ciclo_id === null ? null : Number(linha.ciclo_id),
    status: linha.status as StatusPdi,
    parametros: linha.parametros as EntrevistaPdi,
    rascunho_ia: linha.rascunho_ia as ConteudoPdi,
    conteudo: linha.conteudo as ConteudoPdi,
    avisos: linha.avisos as AvisoPdi[],
    modelo_ia: String(linha.modelo_ia),
    gerado_por_nome: String(linha.gerado_por_nome),
    gerado_em: String(linha.gerado_em),
    submetido_em: linha.submetido_em === null ? null : String(linha.submetido_em),
    homologado_em:
      linha.homologado_em === null ? null : String(linha.homologado_em),
    aceito_em: linha.aceito_em === null ? null : String(linha.aceito_em),
  };
}

const SELECT_PDI = `
  SELECT p.id, p.pessoa_id, ps.nome_completo AS pessoa_nome, p.ciclo_id, p.status,
         p.parametros, p.rascunho_ia, p.conteudo, p.avisos, p.modelo_ia,
         u.nome AS gerado_por_nome, p.gerado_em, p.submetido_em, p.homologado_em,
         p.aceito_em, p.gerado_por
    FROM rh.pdi p
    JOIN rh.pessoa ps ON ps.id = p.pessoa_id
    JOIN sistema.usuario u ON u.id = p.gerado_por`;

export async function buscarPdi(
  id: number
): Promise<(PdiGravado & { gerado_por: number }) | null> {
  const linhas = await consultar<Record<string, unknown>>(
    `${SELECT_PDI} WHERE p.id = $1`,
    [id]
  );
  if (linhas.length === 0) return null;
  return { ...paraPdi(linhas[0]), gerado_por: Number(linhas[0].gerado_por) };
}

export interface RegistroAndamentoPdi {
  id: number;
  texto: string;
  status_novo: string | null;
  autor_nome: string;
  criado_em: string;
}
export interface AcaoAcompanhada {
  id: number;
  descricao: string;
  prazo: string;
  status: string;
  dias_ate_prazo: number;
  andamento: RegistroAndamentoPdi[];
}

/**
 * O acompanhamento das ações de um PDI: cada ação com o log que o colaborador
 * foi registrando (rh.acao_andamento). Só existe depois da homologação — as
 * ações nascem em rh.acao_aberta ali. Escopo pelo pdi_id; quem chega aqui já
 * passou pela autorização de verPdi (pdi.ver + alcance/autoria).
 */
export async function acompanhamentoDoPdi(
  pdiId: number
): Promise<AcaoAcompanhada[]> {
  const acoes = await consultar<{
    id: string;
    descricao: string;
    prazo: string;
    status: string;
    dias_ate_prazo: number;
  }>(
    `SELECT a.id, a.descricao, a.prazo::text AS prazo, a.status,
            (a.prazo - ${HOJE_SP})::int AS dias_ate_prazo
       FROM rh.acao_aberta a
      WHERE a.pdi_id = $1
      ORDER BY (a.status = 'concluida'), a.prazo, a.id`,
    [pdiId]
  );
  if (acoes.length === 0) return [];

  const registros = await consultar<{
    id: string;
    acao_aberta_id: string;
    texto: string;
    status_novo: string | null;
    autor_nome: string;
    criado_em: string;
  }>(
    `SELECT an.id, an.acao_aberta_id, an.texto, an.status_novo,
            u.nome AS autor_nome, an.criado_em::text AS criado_em
       FROM rh.acao_andamento an
       JOIN rh.acao_aberta a ON a.id = an.acao_aberta_id
       JOIN sistema.usuario u ON u.id = an.autor_usuario_id
      WHERE a.pdi_id = $1
      ORDER BY an.criado_em, an.id`,
    [pdiId]
  );
  const porAcao = new Map<number, RegistroAndamentoPdi[]>();
  for (const r of registros) {
    const chave = Number(r.acao_aberta_id);
    const lista = porAcao.get(chave) ?? [];
    lista.push({
      id: Number(r.id),
      texto: r.texto,
      status_novo: r.status_novo,
      autor_nome: r.autor_nome,
      criado_em: r.criado_em,
    });
    porAcao.set(chave, lista);
  }

  return acoes.map((a) => ({
    id: Number(a.id),
    descricao: a.descricao,
    prazo: a.prazo,
    status: a.status,
    dias_ate_prazo: a.dias_ate_prazo,
    andamento: porAcao.get(Number(a.id)) ?? [],
  }));
}

/** Lista os PDIs: amplos veem todos; os demais veem os que geraram. */
export async function listarPdis(
  usuarioId: number,
  amplo: boolean
): Promise<PdiGravado[]> {
  const linhas = await consultar<Record<string, unknown>>(
    `${SELECT_PDI} WHERE ($2 OR p.gerado_por = $1)
      ORDER BY p.gerado_em DESC LIMIT 200`,
    [usuarioId, amplo]
  );
  return linhas.map(paraPdi);
}

export async function atualizarConteudo(
  cliente: PoolClient,
  id: number,
  conteudo: ConteudoPdi
): Promise<number> {
  const { rowCount } = await cliente.query(
    `UPDATE rh.pdi SET conteudo = $2
      WHERE id = $1 AND status = 'rascunho'`,
    [id, JSON.stringify(conteudo)]
  );
  return rowCount ?? 0;
}

export async function submeter(
  cliente: PoolClient,
  id: number,
  usuarioId: number
): Promise<number> {
  const { rowCount } = await cliente.query(
    `UPDATE rh.pdi
        SET status = 'aguardando_homologacao',
            submetido_por = $2, submetido_em = now()
      WHERE id = $1 AND status = 'rascunho'`,
    [id, usuarioId]
  );
  return rowCount ?? 0;
}

export async function homologar(
  cliente: PoolClient,
  id: number,
  usuarioId: number
): Promise<number> {
  const { rowCount } = await cliente.query(
    `UPDATE rh.pdi
        SET status = 'homologado',
            homologado_por = $2, homologado_em = now()
      WHERE id = $1 AND status = 'aguardando_homologacao'`,
    [id, usuarioId]
  );
  return rowCount ?? 0;
}

/**
 * Materializa os focos como ações do colaborador (rh.acao_aberta), com o pdi_id
 * de origem. O prazo de cada ação é o fim do horizonte (hoje + N meses, em SP);
 * o prazo sugerido pela IA fica no texto. O portal do colaborador já lê daqui.
 */
export async function materializarAcoes(
  cliente: PoolClient,
  dados: {
    pdiId: number;
    colaboradorId: number;
    responsavelId: number;
    horizonteMeses: number;
    conteudo: ConteudoPdi;
  }
): Promise<number> {
  let criadas = 0;
  for (const foco of dados.conteudo.focos) {
    for (const acao of foco.acoes) {
      const descricao = `[${foco.competencia}] ${acao.descricao} (sugestão de prazo: ${acao.prazo_sugerido})`;
      await cliente.query(
        `INSERT INTO rh.acao_aberta
           (colaborador_id, descricao, prazo, responsavel_id, pdi_id)
         VALUES ($1, $2, (${HOJE_SP} + ($3 || ' months')::interval)::date, $4, $5)`,
        [
          dados.colaboradorId,
          descricao,
          String(dados.horizonteMeses),
          dados.responsavelId,
          dados.pdiId,
        ]
      );
      criadas += 1;
    }
  }
  return criadas;
}

/** Trilha de leitura sensível do envio externo, dentro da transação (eixo 8). */
export async function registrarLeituraPdi(
  cliente: PoolClient,
  dados: { usuarioId: number; registroId: string }
): Promise<void> {
  await cliente.query(
    `INSERT INTO audit.leitura_sensivel
       (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, 'pdi.gerar', 'rh.pdi', $2)`,
    [dados.usuarioId, dados.registroId]
  );
}
