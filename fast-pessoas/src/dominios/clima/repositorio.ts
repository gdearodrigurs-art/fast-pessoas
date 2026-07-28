import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";

export interface PerguntaAtiva {
  id: number;
  texto: string;
  ordem: number;
}

export interface ColaboradorDaSessao {
  id: number;
  nome_completo: string;
}

export interface RespostaDoDia {
  pergunta_versao_id: number;
  nota: number;
  comentario: string | null;
}

export interface AgregadoDia {
  data: string;
  media: number;
  respostas: number;
}

export interface AgregadoPergunta {
  pergunta_versao_id: number;
  texto: string;
  media: number;
  respostas: number;
}

export interface AgregadoGeral {
  media: number | null;
  respostas: number;
  respondentes: number;
}

export interface RespostaIndividual {
  id: number;
  data_referencia: string;
  nota: number;
  comentario: string | null;
  registrado_em: string;
  colaborador_id: number;
  colaborador_nome: string;
  matricula: string;
  pergunta: string;
}

export async function listarPerguntasAtivas(): Promise<PerguntaAtiva[]> {
  const linhas = await consultar<{ id: string; texto: string; ordem: number }>(
    `SELECT id, texto, ordem
       FROM rh_clima.pergunta_versao
      WHERE status = 'ativa'
      ORDER BY ordem`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

export async function buscarColaboradorPorUsuario(
  usuarioId: number
): Promise<ColaboradorDaSessao | null> {
  const linhas = await consultar<{ id: string; nome_completo: string }>(
    `SELECT id, nome_completo
       FROM rh.colaborador
      WHERE usuario_id = $1`,
    [usuarioId]
  );
  if (linhas.length === 0) return null;
  return { id: Number(linhas[0].id), nome_completo: linhas[0].nome_completo };
}

export async function listarRespostasDoDia(
  colaboradorId: number,
  dataReferencia: string
): Promise<RespostaDoDia[]> {
  const linhas = await consultar<{
    pergunta_versao_id: string;
    nota: number;
    comentario: string | null;
  }>(
    `SELECT pergunta_versao_id, nota, comentario
       FROM rh_clima.checkin_resposta
      WHERE colaborador_id = $1 AND data_referencia = $2`,
    [colaboradorId, dataReferencia]
  );
  return linhas.map((linha) => ({
    ...linha,
    pergunta_versao_id: Number(linha.pergunta_versao_id),
  }));
}

export async function inserirResposta(
  cliente: PoolClient,
  dados: {
    colaborador_id: number;
    pergunta_versao_id: number;
    data_referencia: string;
    nota: number;
    comentario: string | null;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_clima.checkin_resposta
       (colaborador_id, pergunta_versao_id, data_referencia, nota, comentario)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      dados.colaborador_id,
      dados.pergunta_versao_id,
      dados.data_referencia,
      dados.nota,
      dados.comentario,
    ]
  );
  return Number(rows[0].id);
}

export async function agregadoPorDia(
  inicio: string,
  fim: string
): Promise<AgregadoDia[]> {
  return consultar<AgregadoDia & Record<string, unknown>>(
    `SELECT data_referencia::text AS data,
            AVG(nota)::float8 AS media,
            COUNT(*)::int AS respostas
       FROM rh_clima.checkin_resposta
      WHERE data_referencia BETWEEN $1 AND $2
      GROUP BY data_referencia
      ORDER BY data_referencia`,
    [inicio, fim]
  );
}

export async function agregadoPorPergunta(
  inicio: string,
  fim: string
): Promise<AgregadoPergunta[]> {
  const linhas = await consultar<{
    pergunta_versao_id: string;
    texto: string;
    media: number;
    respostas: number;
  }>(
    `SELECT pv.id AS pergunta_versao_id,
            pv.texto,
            AVG(r.nota)::float8 AS media,
            COUNT(*)::int AS respostas
       FROM rh_clima.checkin_resposta r
       JOIN rh_clima.pergunta_versao pv ON pv.id = r.pergunta_versao_id
      WHERE r.data_referencia BETWEEN $1 AND $2
      GROUP BY pv.id
      ORDER BY pv.ordem, pv.id`,
    [inicio, fim]
  );
  return linhas.map((linha) => ({
    ...linha,
    pergunta_versao_id: Number(linha.pergunta_versao_id),
  }));
}

export async function agregadoGeral(
  inicio: string,
  fim: string
): Promise<AgregadoGeral> {
  const linhas = await consultar<AgregadoGeral & Record<string, unknown>>(
    `SELECT AVG(nota)::float8 AS media,
            COUNT(*)::int AS respostas,
            COUNT(DISTINCT colaborador_id)::int AS respondentes
       FROM rh_clima.checkin_resposta
      WHERE data_referencia BETWEEN $1 AND $2`,
    [inicio, fim]
  );
  return linhas[0] ?? { media: null, respostas: 0, respondentes: 0 };
}

export async function listarRespostasIndividuais(
  cliente: PoolClient,
  filtro: { inicio: string; fim: string; colaborador_id?: number }
): Promise<RespostaIndividual[]> {
  const parametros: unknown[] = [filtro.inicio, filtro.fim];
  let condicaoColaborador = "";
  if (filtro.colaborador_id !== undefined) {
    parametros.push(filtro.colaborador_id);
    condicaoColaborador = `AND r.colaborador_id = $${parametros.length}`;
  }
  const { rows } = await cliente.query<{
    id: string;
    data_referencia: string;
    nota: number;
    comentario: string | null;
    registrado_em: Date;
    colaborador_id: string;
    colaborador_nome: string;
    matricula: string;
    pergunta: string;
  }>(
    `SELECT r.id,
            r.data_referencia::text AS data_referencia,
            r.nota,
            r.comentario,
            r.registrado_em,
            c.id AS colaborador_id,
            c.nome_completo AS colaborador_nome,
            c.matricula,
            pv.texto AS pergunta
       FROM rh_clima.checkin_resposta r
       JOIN rh.colaborador c ON c.id = r.colaborador_id
       JOIN rh_clima.pergunta_versao pv ON pv.id = r.pergunta_versao_id
      WHERE r.data_referencia BETWEEN $1 AND $2
        ${condicaoColaborador}
      ORDER BY r.data_referencia DESC, r.registrado_em DESC, r.id DESC
      LIMIT 500`,
    parametros
  );
  return rows.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    colaborador_id: Number(linha.colaborador_id),
    registrado_em: linha.registrado_em.toISOString(),
  }));
}

export async function registrarLeituraSensivel(
  cliente: PoolClient,
  entrada: {
    usuarioId: number;
    chavePermissao: string;
    recurso: string;
    registroId: string | null;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO audit.leitura_sensivel (usuario_id, chave_permissao, recurso, registro_id)
     VALUES ($1, $2, $3, $4)`,
    [entrada.usuarioId, entrada.chavePermissao, entrada.recurso, entrada.registroId]
  );
}
