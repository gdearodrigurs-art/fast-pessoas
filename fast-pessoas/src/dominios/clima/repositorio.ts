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

export interface AgregadoUnidade {
  unidade: string;
  media: number;
  media_recente: number | null;
  media_anterior: number | null;
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
      WHERE id = rh.vinculo_atual($1)`,
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
    // Pela PESSOA, não pelo contrato: no dia da transferência entre empresas
    // do grupo o vínculo já é outro, e perguntar por colaborador_id fazia o
    // check-in do dia aparecer em branco para quem já o tinha respondido de
    // manhã — a tela convidava para a segunda resposta que a trava da 0052
    // agora recusa.
    `SELECT pergunta_versao_id, nota, comentario
       FROM rh_clima.checkin_resposta
      WHERE pessoa_id = (SELECT c.pessoa_id FROM rh.colaborador c WHERE c.id = $1)
        AND data_referencia = $2`,
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

/**
 * Agregado POR UNIDADE, com a média da janela inteira e o recorte dos últimos
 * `diasRecentes` dias contra o período anterior — é assim que uma queda
 * localizada aparece, em vez de sumir na média da rede.
 *
 * A unidade de cada resposta é a de QUANDO A RESPOSTA FOI DADA
 * (`rh.estrutura_em(colaborador, data_referencia)`), nunca a de hoje. Antes
 * daqui a consulta lia a lotação aberta (`fim_vigencia IS NULL`), e isso
 * reescrevia o passado: transferir alguém hoje arrastava TODAS as respostas
 * passadas dela para a unidade nova e mexia na média histórica das duas
 * unidades de uma vez — a queda que a unidade teve em julho passava a aparecer
 * em quem a recebeu em agosto. Medido numa transferência simulada de uma
 * pessoa com 42 respostas na janela de 30 dias: pela consulta antiga, a origem
 * ia de 3,9355 para 3,9438 e o destino de 3,4809 para 3,5343, com 42 respostas
 * mudando de linha; por esta, nenhuma das cinco unidades se mexeu.
 *
 * A mudança também atravessava o piso de anonimato — os respondentes por
 * unidade mudavam junto (20 → 19 na origem, 10 → 11 no destino), então uma
 * unidade podia cruzar ou deixar de cruzar `minimoRespondentes`
 * retroativamente. E quem já não tem lotação aberta (desligado) sumia inteiro
 * do corte embora continuasse no agregado geral: na mesma janela, as unidades
 * somavam 1667 das 1740 respostas. Agora somam 1738.
 *
 * As 2 que ainda faltam são de uma pessoa cuja `rh.lotacao` fechou na véspera
 * do desligamento e que respondeu no próprio dia do desligamento. É buraco no
 * registro de lotação (o desligamento fecha a alocação em
 * `data_termino_efetiva`, não na véspera), não desta consulta — e resolver aqui
 * seria inventar uma segunda regra de onde a pessoa estava.
 *
 * O RÓTULO é resolvido uma vez por unidade, pelo nome vigente no fim da janela
 * (`rh.estabelecimento_versao_em(..., $2)`), e não por resposta: como o nome é
 * função de `estabelecimento_id` e da data fixa `$2`, cada unidade é sempre UMA
 * linha, mesmo renomeada no meio do período. Isso ainda tira do caminho o
 * `status = 'ativa'`, que fazia unidade encerrada desaparecer da tela levando
 * as respostas junto — encerrar a versão da Filial Norte sumia com ela e com as
 * 235 respostas dela; agora a linha continua lá.
 *
 * Continua sendo agregado: média e contagens, nunca autor. O HAVING de
 * `minimoRespondentes` existe para que uma unidade com pouquíssima gente não
 * vire identificação por dedução ("a média da loja é a nota do fulano").
 */
export async function agregadoPorUnidade(
  inicio: string,
  fim: string,
  diasRecentes: number,
  minimoRespondentes: number
): Promise<AgregadoUnidade[]> {
  return consultar<AgregadoUnidade & Record<string, unknown>>(
    `SELECT ev.unidade,
            AVG(r.nota)::float8 AS media,
            AVG(r.nota) FILTER (
              WHERE r.data_referencia > $2::date - $3::int
            )::float8 AS media_recente,
            AVG(r.nota) FILTER (
              WHERE r.data_referencia <= $2::date - $3::int
            )::float8 AS media_anterior,
            COUNT(*)::int AS respostas,
            COUNT(DISTINCT r.colaborador_id)::int AS respondentes
       FROM rh_clima.checkin_resposta r
       JOIN LATERAL rh.estrutura_em(r.colaborador_id, r.data_referencia) est
         ON TRUE
       JOIN rh.estabelecimento_versao ev
         ON ev.id = rh.estabelecimento_versao_em(est.estabelecimento_id, $2::date)
      WHERE r.data_referencia BETWEEN $1 AND $2
      GROUP BY est.estabelecimento_id, ev.unidade
     HAVING COUNT(DISTINCT r.colaborador_id) >= $4::int
      ORDER BY ev.unidade`,
    [inicio, fim, diasRecentes, minimoRespondentes]
  );
}

/**
 * Insumo do indicador "Adesão ao check-in diário": para cada dia COM
 * movimento na janela, quantas pessoas distintas responderam, e quantos
 * colaboradores ativos existem hoje.
 *
 * Dias sem nenhuma resposta ficam de fora de propósito — são fim de semana e
 * feriado, quando não se espera check-in. Incluí-los mediria calendário, não
 * adesão.
 */
export async function adesaoCheckinPorDia(
  inicio: string,
  fim: string
): Promise<{ respondentes_por_dia: number[]; ativos: number }> {
  const [dias, ativos] = await Promise.all([
    consultar<{ respondentes: number }>(
      `SELECT COUNT(DISTINCT colaborador_id)::int AS respondentes
         FROM rh_clima.checkin_resposta
        WHERE data_referencia BETWEEN $1 AND $2
        GROUP BY data_referencia`,
      [inicio, fim]
    ),
    consultar<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM rh.colaborador WHERE status = 'ativo'`
    ),
  ]);
  return {
    respondentes_por_dia: dias.map((linha) => linha.respondentes),
    ativos: ativos[0]?.total ?? 0,
  };
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
