import { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import { StatusPesquisa, StatusPlano, TipoPergunta, TipoPesquisa } from "./esquemas";

/**
 * SQL do módulo de pesquisa estruturada de clima. Duas regras de ouro deste
 * repositório, herdadas do modelo da migration 0022:
 *   1. NENHUMA consulta cruza rh_clima.resposta_pesquisa com
 *      rh_clima.participacao_pesquisa — não existe caminho de volta da
 *      resposta para a pessoa, e não deve passar a existir;
 *   2. a DECISÃO do k-anonimato é do SERVIÇO — aqui as contagens vêm cruas,
 *      para que ele possa escolher entre mostrar o número e dizer "amostra
 *      insuficiente". O que estas funções devolvem separado é QUAL contagem vai
 *      ao piso: os campos `pessoas_*` são contagem de gente (menor contagem por
 *      pergunta do recorte); os `respostas_*` são denominador de cálculo e não
 *      servem de porta de publicação. Confundir os dois foi o defeito que
 *      publicava a média de uma unidade de 3 pessoas sob um piso de 5.
 */

// ------------------------------------------------------------------ tipos

export interface PesquisaLinha {
  id: number;
  titulo: string;
  tipo: TipoPesquisa;
  descricao: string | null;
  inicio: string;
  fim: string;
  status: StatusPesquisa;
  anonima: boolean;
  criada_por_nome: string;
  criada_em: string;
  aberta_em: string | null;
  encerrada_em: string | null;
  perguntas: number;
  participacoes: number;
}

export interface PerguntaLinha {
  id: number;
  pesquisa_id: number;
  ordem: number;
  enunciado: string;
  tipo: TipoPergunta;
  opcoes: string[] | null;
  obrigatoria: boolean;
}

export interface ColaboradorDaSessao {
  id: number;
  nome_completo: string;
  unidade_id: number | null;
  unidade: string | null;
}

export interface ContagemEscala {
  pergunta_id: number;
  respostas: number;
  soma: number;
}

export interface ContagemNps {
  pergunta_id: number;
  respostas: number;
  promotores: number;
  neutros: number;
  detratores: number;
}

export interface ContagemEscolha {
  pergunta_id: number;
  opcao: string;
  respostas: number;
}

export interface RecorteUnidade {
  unidade_id: number | null;
  unidade: string;
  respostas_escala: number;
  soma_escala: number;
  respostas_nps: number;
  promotores: number;
  detratores: number;
  /**
   * O que vai ao PISO de anonimato: a menor contagem por pergunta da unidade
   * (ver `pessoasDoRecorte` em esquemas.ts). Os campos `respostas_*` acima são
   * denominador de cálculo, nunca porta de publicação — somar respostas de
   * perguntas diferentes não conta gente.
   */
  pessoas_escala: number;
  pessoas_nps: number;
}

export interface ComentarioLinha {
  pergunta_id: number;
  texto: string;
}

export interface PlanoLinha {
  id: number;
  pesquisa_id: number;
  unidade_id: number | null;
  unidade: string | null;
  titulo: string;
  descricao: string | null;
  responsavel_usuario: number;
  responsavel_nome: string;
  prazo: string;
  status: StatusPlano;
  criado_em: string;
  concluido_em: string | null;
}

export interface UnidadeOpcao {
  id: number;
  unidade: string;
}

export interface UsuarioOpcao {
  id: number;
  nome: string;
  papel: string;
}

// ------------------------------------------------------------------ pesquisa

const SELECT_PESQUISA = `
  SELECT p.id,
         p.titulo,
         p.tipo,
         p.descricao,
         p.inicio::text  AS inicio,
         p.fim::text     AS fim,
         p.status,
         p.anonima,
         u.nome          AS criada_por_nome,
         p.criada_em,
         p.aberta_em,
         p.encerrada_em,
         (SELECT COUNT(*)::int FROM rh_clima.pergunta_pesquisa q
           WHERE q.pesquisa_id = p.id)        AS perguntas,
         (SELECT COUNT(*)::int FROM rh_clima.participacao_pesquisa pa
           WHERE pa.pesquisa_id = p.id)       AS participacoes
    FROM rh_clima.pesquisa p
    JOIN sistema.usuario u ON u.id = p.criada_por`;

interface PesquisaCrua extends Record<string, unknown> {
  id: string;
  titulo: string;
  tipo: TipoPesquisa;
  descricao: string | null;
  inicio: string;
  fim: string;
  status: StatusPesquisa;
  anonima: boolean;
  criada_por_nome: string;
  criada_em: Date;
  aberta_em: Date | null;
  encerrada_em: Date | null;
  perguntas: number;
  participacoes: number;
}

function mapearPesquisa(linha: PesquisaCrua): PesquisaLinha {
  return {
    ...linha,
    id: Number(linha.id),
    criada_em: linha.criada_em.toISOString(),
    aberta_em: linha.aberta_em ? linha.aberta_em.toISOString() : null,
    encerrada_em: linha.encerrada_em ? linha.encerrada_em.toISOString() : null,
  };
}

export async function listarPesquisas(): Promise<PesquisaLinha[]> {
  const linhas = await consultar<PesquisaCrua>(
    `${SELECT_PESQUISA} ORDER BY p.inicio DESC, p.id DESC`
  );
  return linhas.map(mapearPesquisa);
}

export async function buscarPesquisa(id: number): Promise<PesquisaLinha | null> {
  const linhas = await consultar<PesquisaCrua>(`${SELECT_PESQUISA} WHERE p.id = $1`, [
    id,
  ]);
  return linhas.length === 0 ? null : mapearPesquisa(linhas[0]);
}

/** Última pesquisa encerrada — base dos indicadores da Central de Metas. */
export async function ultimaPesquisaEncerrada(): Promise<PesquisaLinha | null> {
  const linhas = await consultar<PesquisaCrua>(
    `${SELECT_PESQUISA}
      WHERE p.status = 'encerrada'
      ORDER BY p.encerrada_em DESC, p.id DESC
      LIMIT 1`
  );
  return linhas.length === 0 ? null : mapearPesquisa(linhas[0]);
}

export async function listarPerguntas(pesquisaId: number): Promise<PerguntaLinha[]> {
  const linhas = await consultar<{
    id: string;
    pesquisa_id: string;
    ordem: number;
    enunciado: string;
    tipo: TipoPergunta;
    opcoes: string[] | null;
    obrigatoria: boolean;
  }>(
    `SELECT id, pesquisa_id, ordem, enunciado, tipo, opcoes, obrigatoria
       FROM rh_clima.pergunta_pesquisa
      WHERE pesquisa_id = $1
      ORDER BY ordem`,
    [pesquisaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    pesquisa_id: Number(linha.pesquisa_id),
  }));
}

export async function inserirPesquisa(
  cliente: PoolClient,
  dados: {
    titulo: string;
    tipo: TipoPesquisa;
    descricao: string | null;
    inicio: string;
    fim: string;
    anonima: boolean;
    criada_por: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_clima.pesquisa
       (titulo, tipo, descricao, inicio, fim, anonima, criada_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      dados.titulo,
      dados.tipo,
      dados.descricao,
      dados.inicio,
      dados.fim,
      dados.anonima,
      dados.criada_por,
    ]
  );
  return Number(rows[0].id);
}

export async function inserirPergunta(
  cliente: PoolClient,
  dados: {
    pesquisa_id: number;
    ordem: number;
    enunciado: string;
    tipo: TipoPergunta;
    opcoes: string[] | null;
    obrigatoria: boolean;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_clima.pergunta_pesquisa
       (pesquisa_id, ordem, enunciado, tipo, opcoes, obrigatoria)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id`,
    [
      dados.pesquisa_id,
      dados.ordem,
      dados.enunciado,
      dados.tipo,
      dados.opcoes === null ? null : JSON.stringify(dados.opcoes),
      dados.obrigatoria,
    ]
  );
  return Number(rows[0].id);
}

// Devolvem quantas linhas mudaram: a guarda de status mora no WHERE, então
// 0 significa que outra transição concorrente já mudou o estado — quem chama
// confere e recusa (409) em vez de auditar um evento que não aconteceu.
export async function abrirPesquisa(
  cliente: PoolClient,
  id: number
): Promise<number> {
  const { rowCount } = await cliente.query(
    `UPDATE rh_clima.pesquisa
        SET status = 'aberta', aberta_em = now()
      WHERE id = $1 AND status = 'rascunho'`,
    [id]
  );
  return rowCount ?? 0;
}

export async function encerrarPesquisa(
  cliente: PoolClient,
  id: number
): Promise<number> {
  const { rowCount } = await cliente.query(
    `UPDATE rh_clima.pesquisa
        SET status = 'encerrada', encerrada_em = now()
      WHERE id = $1 AND status = 'aberta'`,
    [id]
  );
  return rowCount ?? 0;
}

// ------------------------------------------------------------------ respondente

/**
 * Colaborador da sessão com a UNIDADE da lotação vigente — o único atributo
 * que acompanha a resposta anônima.
 *
 * RISCO CONHECIDO E ACEITO (verificação da onda D) — "vigente" aqui é
 * `fim_vigencia IS NULL`, que é a convenção UNIFORME do projeto: as mesmas seis
 * consultas de lotação em beneficios, clima, colaboradores e demandas fazem
 * igual. A convenção tem um ponto cego: uma transferência de unidade APROVADA
 * com vigência FUTURA já cria a lotação de destino com fim_vigencia nulo (ver
 * `aplicarEfeito`/`encerrarLotacao` — a anterior fecha em `data - 1`). Na janela
 * entre a aprovação e a data de vigência, a pessoa conta na unidade DESTINO —
 * então a resposta de pesquisa dela entra no recorte da unidade nova antes de
 * ela chegar lá. Consequência: o recorte da unidade de origem perde uma pessoa
 * alguns dias antes; nada vaza e nada quebra, e o comportamento é o MESMO em
 * todas as telas (não há número contraditório entre módulos).
 *
 * Por que não foi corrigido aqui: o conserto certo é trocar o critério nas seis
 * consultas de uma vez — `l.inicio_vigencia <= hoje AND (l.fim_vigencia IS NULL
 * OR l.fim_vigencia >= hoje)` — o que é mudança transversal a quatro domínios,
 * fora do escopo de uma correção mínima de verificação. Fazer só aqui seria
 * pior: criaria DUAS verdades da mesma pergunta ("qual a unidade dela hoje?").
 */
export async function buscarColaboradorPorUsuario(
  usuarioId: number
): Promise<ColaboradorDaSessao | null> {
  const linhas = await consultar<{
    id: string;
    nome_completo: string;
    unidade_id: string | null;
    unidade: string | null;
  }>(
    `SELECT c.id,
            c.nome_completo,
            l.estabelecimento_id AS unidade_id,
            ev.unidade
       FROM rh.colaborador c
       LEFT JOIN rh.lotacao l
              ON l.colaborador_id = c.id AND l.fim_vigencia IS NULL
       LEFT JOIN rh.estabelecimento_versao ev
              ON ev.estabelecimento_id = l.estabelecimento_id
             AND ev.status = 'ativa'
      WHERE c.id = rh.vinculo_atual($1)`,
    [usuarioId]
  );
  if (linhas.length === 0) return null;
  return {
    id: Number(linhas[0].id),
    nome_completo: linhas[0].nome_completo,
    unidade_id:
      linhas[0].unidade_id === null ? null : Number(linhas[0].unidade_id),
    unidade: linhas[0].unidade,
  };
}

/**
 * "Já respondi?" é pergunta da PESSOA, não do contrato.
 *
 * Perguntar por `colaborador_id` estava certo enquanto vínculo e pessoa eram a
 * mesma coisa. Depois da 0046/0048, quem é transferido entre empresas do grupo
 * no meio da janela passa a ser lido por `rh.vinculo_atual` como um vínculo
 * NOVO — e a pesquisa que ele já respondeu reaparecia como não respondida. A
 * trava de banco (0052, UNIQUE por pessoa) impede a resposta dupla; esta
 * consulta é a metade que impede a TELA de convidar para ela.
 */
export async function jaParticipou(
  pesquisaId: number,
  colaboradorId: number
): Promise<boolean> {
  const linhas = await consultar<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM rh_clima.participacao_pesquisa pa
        WHERE pa.pesquisa_id = $1
          AND pa.pessoa_id = (SELECT c.pessoa_id
                                FROM rh.colaborador c
                               WHERE c.id = $2)
     ) AS existe`,
    [pesquisaId, colaboradorId]
  );
  return Boolean(linhas[0]?.existe);
}

/**
 * Pesquisas abertas e dentro do período, com a marca de já respondida.
 *
 * `respondida` sai pela PESSOA (ver `jaParticipou`): o vínculo aberto por
 * transferência entre CNPJs não devolve o direito de responder de novo.
 */
export async function listarAbertasParaColaborador(
  colaboradorId: number | null
): Promise<
  Array<{
    id: number;
    titulo: string;
    tipo: TipoPesquisa;
    descricao: string | null;
    fim: string;
    anonima: boolean;
    respondida: boolean;
  }>
> {
  const linhas = await consultar<{
    id: string;
    titulo: string;
    tipo: TipoPesquisa;
    descricao: string | null;
    fim: string;
    anonima: boolean;
    respondida: boolean;
  }>(
    `SELECT p.id,
            p.titulo,
            p.tipo,
            p.descricao,
            p.fim::text AS fim,
            p.anonima,
            CASE
              WHEN $1::bigint IS NULL THEN FALSE
              ELSE EXISTS (
                SELECT 1 FROM rh_clima.participacao_pesquisa pa
                 WHERE pa.pesquisa_id = p.id
                   AND pa.pessoa_id = (SELECT c.pessoa_id
                                         FROM rh.colaborador c
                                        WHERE c.id = $1::bigint)
              )
            END AS respondida
       FROM rh_clima.pesquisa p
      WHERE p.status = 'aberta'
        AND rh.hoje() BETWEEN p.inicio AND p.fim
      ORDER BY p.fim, p.id`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/**
 * Grava as respostas (sem qualquer vínculo com a pessoa) e a participação, na
 * MESMA transação: ou as duas coisas existem, ou nenhuma. A unicidade de
 * participacao_pesquisa é o que impede a resposta dupla.
 */
export async function inserirRespostas(
  cliente: PoolClient,
  pesquisaId: number,
  unidadeId: number | null,
  respostas: Array<{
    pergunta_id: number;
    valor_numerico: number | null;
    valor_texto: string | null;
  }>
): Promise<void> {
  for (const resposta of respostas) {
    await cliente.query(
      `INSERT INTO rh_clima.resposta_pesquisa
         (pesquisa_id, pergunta_id, valor_numerico, valor_texto, unidade_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        pesquisaId,
        resposta.pergunta_id,
        resposta.valor_numerico,
        resposta.valor_texto,
        unidadeId,
      ]
    );
  }
}

export async function inserirParticipacao(
  cliente: PoolClient,
  pesquisaId: number,
  colaboradorId: number
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_clima.participacao_pesquisa (pesquisa_id, colaborador_id)
     VALUES ($1, $2)
     RETURNING id`,
    [pesquisaId, colaboradorId]
  );
  return Number(rows[0].id);
}

// ------------------------------------------------------------------ resultado

export async function contarAtivos(): Promise<number> {
  const linhas = await consultar<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM rh.colaborador WHERE status = 'ativo'`
  );
  return linhas[0]?.total ?? 0;
}

export async function contagensEscala(
  pesquisaId: number
): Promise<ContagemEscala[]> {
  const linhas = await consultar<{
    pergunta_id: string;
    respostas: number;
    soma: number;
  }>(
    `SELECT r.pergunta_id,
            COUNT(*)::int              AS respostas,
            COALESCE(SUM(r.valor_numerico), 0)::int AS soma
       FROM rh_clima.resposta_pesquisa r
       JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
      WHERE r.pesquisa_id = $1
        AND q.tipo = 'escala_1_5'
        AND r.valor_numerico IS NOT NULL
      GROUP BY r.pergunta_id`,
    [pesquisaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    pergunta_id: Number(linha.pergunta_id),
  }));
}

/**
 * Contagens do eNPS por pergunta: promotores 9–10, neutros 7–8, detratores
 * 0–6. O cálculo (promotores% − detratores%) fica no serviço.
 */
export async function contagensNps(pesquisaId: number): Promise<ContagemNps[]> {
  const linhas = await consultar<{
    pergunta_id: string;
    respostas: number;
    promotores: number;
    neutros: number;
    detratores: number;
  }>(
    `SELECT r.pergunta_id,
            COUNT(*)::int AS respostas,
            COUNT(*) FILTER (WHERE r.valor_numerico >= 9)::int AS promotores,
            COUNT(*) FILTER (WHERE r.valor_numerico BETWEEN 7 AND 8)::int AS neutros,
            COUNT(*) FILTER (WHERE r.valor_numerico <= 6)::int AS detratores
       FROM rh_clima.resposta_pesquisa r
       JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
      WHERE r.pesquisa_id = $1
        AND q.tipo = 'nps_0_10'
        AND r.valor_numerico IS NOT NULL
      GROUP BY r.pergunta_id`,
    [pesquisaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    pergunta_id: Number(linha.pergunta_id),
  }));
}

/**
 * Insumo do indicador eNPS: contagens da pesquisa ENCERRADA mais recente que
 * tenha pergunta de nota 0–10 respondida. Soma todas as perguntas nps_0_10 da
 * pesquisa (o normal é haver exatamente uma). Sem trilha de pessoa — é
 * agregado puro.
 *
 * `pessoas` existe pelo mesmo motivo de `recortesPorUnidade`: quando a pesquisa
 * tem MAIS DE UMA pergunta de nota, `respostas` é soma de perguntas e não conta
 * gente. A Central de Metas não pode ser a porta dos fundos do que a tela de
 * resultado esconde, então o piso dela recebe a menor contagem por pergunta.
 */
export async function ultimaContagemEnpsEncerrada(): Promise<{
  pesquisa_id: number;
  titulo: string;
  respostas: number;
  promotores: number;
  detratores: number;
  pessoas: number;
} | null> {
  const linhas = await consultar<{
    pesquisa_id: string;
    titulo: string;
    respostas: number;
    promotores: number;
    detratores: number;
    pessoas: number;
  }>(
    `WITH por_pergunta AS (
       SELECT p.id AS pesquisa_id,
              p.titulo,
              p.encerrada_em,
              q.id AS pergunta_id,
              COUNT(*)::int AS respostas,
              COUNT(*) FILTER (WHERE r.valor_numerico >= 9)::int AS promotores,
              COUNT(*) FILTER (WHERE r.valor_numerico <= 6)::int AS detratores
         FROM rh_clima.pesquisa p
         JOIN rh_clima.pergunta_pesquisa q ON q.pesquisa_id = p.id
         JOIN rh_clima.resposta_pesquisa r ON r.pergunta_id = q.id
        WHERE p.status = 'encerrada'
          AND q.tipo = 'nps_0_10'
          AND r.valor_numerico IS NOT NULL
        GROUP BY p.id, p.titulo, p.encerrada_em, q.id
     )
     SELECT pesquisa_id,
            titulo,
            SUM(respostas)::int  AS respostas,
            SUM(promotores)::int AS promotores,
            SUM(detratores)::int AS detratores,
            MIN(respostas)::int  AS pessoas
       FROM por_pergunta
      GROUP BY pesquisa_id, titulo, encerrada_em
      ORDER BY encerrada_em DESC, pesquisa_id DESC
      LIMIT 1`
  );
  if (linhas.length === 0) return null;
  return { ...linhas[0], pesquisa_id: Number(linhas[0].pesquisa_id) };
}

export async function contagensEscolha(
  pesquisaId: number
): Promise<ContagemEscolha[]> {
  const linhas = await consultar<{
    pergunta_id: string;
    opcao: string;
    respostas: number;
  }>(
    `SELECT r.pergunta_id,
            r.valor_texto AS opcao,
            COUNT(*)::int AS respostas
       FROM rh_clima.resposta_pesquisa r
       JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
      WHERE r.pesquisa_id = $1
        AND q.tipo = 'escolha_unica'
        AND r.valor_texto IS NOT NULL
      GROUP BY r.pergunta_id, r.valor_texto
      ORDER BY r.pergunta_id, COUNT(*) DESC, r.valor_texto`,
    [pesquisaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    pergunta_id: Number(linha.pergunta_id),
  }));
}

/**
 * Recorte por unidade: escala e eNPS numa passada. Unidade NULL (colaborador
 * sem lotação vigente na hora da resposta) vira o rótulo "Sem unidade" — e
 * passa pelo mesmo k-anonimato das outras.
 *
 * DOIS NÍVEIS DE AGRUPAMENTO, de propósito. O primeiro (`por_pergunta`) conta
 * por unidade E por pergunta; o segundo dobra isso na unidade. É essa passada
 * a mais que separa as duas grandezas que estavam coladas:
 *
 *   respostas_escala / soma_escala  -> denominador e numerador da MÉDIA
 *   pessoas_escala                  -> o que vai ao PISO de anonimato
 *
 * Enquanto o piso era aplicado sobre a soma, 3 pessoas respondendo 2 perguntas
 * produziam 6 respostas e a unidade era publicada sob um piso de 5 — medido na
 * bancada, pesquisa 5 / unidade 1: respostas_escala 6, pessoas_escala 3. A
 * menor contagem por pergunta é limite inferior do número de pessoas do
 * recorte (uma pessoa responde cada pergunta no máximo uma vez); o porquê de
 * não ser `COUNT(DISTINCT pessoa_id)` está em `pessoasDoRecorte`, em
 * esquemas.ts — a resposta não tem pessoa, e não pode passar a ter.
 *
 * `MIN(...) FILTER` ignora pergunta sem NENHUMA resposta na unidade: ela não
 * entra no agregado, então não teria por que derrubá-lo a zero.
 */
export async function recortesPorUnidade(
  pesquisaId: number
): Promise<RecorteUnidade[]> {
  const linhas = await consultar<{
    unidade_id: string | null;
    unidade: string;
    respostas_escala: number;
    soma_escala: number;
    respostas_nps: number;
    promotores: number;
    detratores: number;
    pessoas_escala: number;
    pessoas_nps: number;
  }>(
    `WITH por_pergunta AS (
       SELECT r.unidade_id,
              r.pergunta_id,
              q.tipo,
              COUNT(*)::int                          AS respostas,
              COALESCE(SUM(r.valor_numerico), 0)::int AS soma,
              COUNT(*) FILTER (WHERE r.valor_numerico >= 9)::int AS promotores,
              COUNT(*) FILTER (WHERE r.valor_numerico <= 6)::int AS detratores
         FROM rh_clima.resposta_pesquisa r
         JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
        WHERE r.pesquisa_id = $1
          AND r.valor_numerico IS NOT NULL
          AND q.tipo IN ('escala_1_5','nps_0_10')
        GROUP BY r.unidade_id, r.pergunta_id, q.tipo
     )
     SELECT p.unidade_id,
            COALESCE(ev.unidade, 'Sem unidade') AS unidade,
            COALESCE(SUM(p.respostas) FILTER (WHERE p.tipo = 'escala_1_5'), 0)::int
              AS respostas_escala,
            COALESCE(SUM(p.soma) FILTER (WHERE p.tipo = 'escala_1_5'), 0)::int
              AS soma_escala,
            COALESCE(MIN(p.respostas) FILTER (WHERE p.tipo = 'escala_1_5'), 0)::int
              AS pessoas_escala,
            COALESCE(SUM(p.respostas) FILTER (WHERE p.tipo = 'nps_0_10'), 0)::int
              AS respostas_nps,
            COALESCE(SUM(p.promotores) FILTER (WHERE p.tipo = 'nps_0_10'), 0)::int
              AS promotores,
            COALESCE(SUM(p.detratores) FILTER (WHERE p.tipo = 'nps_0_10'), 0)::int
              AS detratores,
            COALESCE(MIN(p.respostas) FILTER (WHERE p.tipo = 'nps_0_10'), 0)::int
              AS pessoas_nps
       FROM por_pergunta p
       LEFT JOIN rh.estabelecimento_versao ev
              ON ev.estabelecimento_id = p.unidade_id AND ev.status = 'ativa'
      GROUP BY p.unidade_id, ev.unidade
      ORDER BY COALESCE(ev.unidade, 'Sem unidade')`,
    [pesquisaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    unidade_id: linha.unidade_id === null ? null : Number(linha.unidade_id),
  }));
}

/**
 * Comentários de texto livre. Sem unidade, sem data, sem ordem de chegada
 * (ordenação por hash estável do texto): qualquer um desses três daria pista
 * de autoria quando cruzado com quem se sabe que respondeu.
 */
export async function comentarios(
  pesquisaId: number
): Promise<ComentarioLinha[]> {
  const linhas = await consultar<{ pergunta_id: string; texto: string }>(
    `SELECT r.pergunta_id, r.valor_texto AS texto
       FROM rh_clima.resposta_pesquisa r
       JOIN rh_clima.pergunta_pesquisa q ON q.id = r.pergunta_id
      WHERE r.pesquisa_id = $1
        AND q.tipo = 'texto_livre'
        AND r.valor_texto IS NOT NULL
      ORDER BY r.pergunta_id, md5(r.valor_texto)
      LIMIT 500`,
    [pesquisaId]
  );
  return linhas.map((linha) => ({
    ...linha,
    pergunta_id: Number(linha.pergunta_id),
  }));
}

// ------------------------------------------------------------------ plano de ação

const SELECT_PLANO = `
  SELECT pa.id,
         pa.pesquisa_id,
         pa.unidade_id,
         ev.unidade,
         pa.titulo,
         pa.descricao,
         pa.responsavel_usuario,
         u.nome AS responsavel_nome,
         pa.prazo::text AS prazo,
         pa.status,
         pa.criado_em,
         pa.concluido_em
    FROM rh_clima.plano_acao pa
    JOIN sistema.usuario u ON u.id = pa.responsavel_usuario
    LEFT JOIN rh.estabelecimento_versao ev
           ON ev.estabelecimento_id = pa.unidade_id AND ev.status = 'ativa'`;

interface PlanoCru extends Record<string, unknown> {
  id: string;
  pesquisa_id: string;
  unidade_id: string | null;
  unidade: string | null;
  titulo: string;
  descricao: string | null;
  responsavel_usuario: string;
  responsavel_nome: string;
  prazo: string;
  status: StatusPlano;
  criado_em: Date;
  concluido_em: Date | null;
}

function mapearPlano(linha: PlanoCru): PlanoLinha {
  return {
    ...linha,
    id: Number(linha.id),
    pesquisa_id: Number(linha.pesquisa_id),
    unidade_id: linha.unidade_id === null ? null : Number(linha.unidade_id),
    responsavel_usuario: Number(linha.responsavel_usuario),
    criado_em: linha.criado_em.toISOString(),
    concluido_em: linha.concluido_em
      ? linha.concluido_em.toISOString()
      : null,
  };
}

/**
 * Planos da pesquisa. `unidadeDoGestor` diferente de undefined restringe ao
 * que o gestor pode ver: a própria unidade e os planos da empresa (unidade
 * NULL), que valem para ele também.
 */
export async function listarPlanos(
  pesquisaId: number,
  unidadeDoGestor?: number | null
): Promise<PlanoLinha[]> {
  const parametros: unknown[] = [pesquisaId];
  let filtro = "";
  if (unidadeDoGestor !== undefined) {
    parametros.push(unidadeDoGestor);
    filtro = `AND (pa.unidade_id IS NULL OR pa.unidade_id = $${parametros.length}::bigint)`;
  }
  const linhas = await consultar<PlanoCru>(
    `${SELECT_PLANO}
      WHERE pa.pesquisa_id = $1
        ${filtro}
      ORDER BY pa.prazo, pa.id`,
    parametros
  );
  return linhas.map(mapearPlano);
}

export async function buscarPlano(id: number): Promise<PlanoLinha | null> {
  const linhas = await consultar<PlanoCru>(`${SELECT_PLANO} WHERE pa.id = $1`, [
    id,
  ]);
  return linhas.length === 0 ? null : mapearPlano(linhas[0]);
}

export async function inserirPlano(
  cliente: PoolClient,
  dados: {
    pesquisa_id: number;
    unidade_id: number | null;
    titulo: string;
    descricao: string | null;
    responsavel_usuario: number;
    prazo: string;
    criado_por_usuario: number;
  }
): Promise<number> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO rh_clima.plano_acao
       (pesquisa_id, unidade_id, titulo, descricao, responsavel_usuario,
        prazo, criado_por_usuario)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      dados.pesquisa_id,
      dados.unidade_id,
      dados.titulo,
      dados.descricao,
      dados.responsavel_usuario,
      dados.prazo,
      dados.criado_por_usuario,
    ]
  );
  return Number(rows[0].id);
}

export async function atualizarStatusPlano(
  cliente: PoolClient,
  id: number,
  status: StatusPlano
): Promise<void> {
  await cliente.query(
    `UPDATE rh_clima.plano_acao
        SET status = $2,
            concluido_em = CASE
              WHEN $2 IN ('concluido','cancelado') THEN COALESCE(concluido_em, now())
              ELSE NULL
            END
      WHERE id = $1`,
    [id, status]
  );
}

// ------------------------------------------------------------------ apoio das telas

export async function listarUnidades(): Promise<UnidadeOpcao[]> {
  const linhas = await consultar<{ id: string; unidade: string }>(
    `SELECT e.id, ev.unidade
       FROM rh.estabelecimento e
       JOIN rh.estabelecimento_versao ev
         ON ev.estabelecimento_id = e.id AND ev.status = 'ativa'
      ORDER BY ev.unidade`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}

/**
 * Candidatos a responsável de plano de ação: usuários ativos com papel de
 * condução. Nome e papel apenas — nada de e-mail nem dado pessoal.
 */
export async function listarResponsaveis(): Promise<UsuarioOpcao[]> {
  const linhas = await consultar<{ id: string; nome: string; papel: string }>(
    `SELECT id, nome, papel
       FROM sistema.usuario
      WHERE ativo
        AND papel IN ('gestor','rh','dp','diretoria')
      ORDER BY nome`
  );
  return linhas.map((linha) => ({ ...linha, id: Number(linha.id) }));
}
