/**
 * Portal do colaborador — SQL parametrizado das duas únicas consultas que
 * nenhum domínio já expunha na forma que o portal precisa:
 *
 *  1. os ciclos de avaliação em que a pessoa foi AVALIADA, sem tocar em
 *     rh.resultado_avaliacao além da data (nem percentual, nem faixa, nem
 *     recomendação, nem decisão);
 *  2. os itens do PDI, derivados de rh.acao_aberta.
 *
 * Todo o resto do portal vem dos serviços/repositórios dos domínios donos
 * (ferias, demandas, beneficios, documentos, clima, colaboradores) — esta
 * onda é consolidação, não construção.
 *
 * Toda função recebe `colaboradorId` e o chamador é obrigado a passar o
 * colaborador DA SESSÃO (ver colaborador-servico.ts): não existe caminho em
 * que um id venha da requisição.
 */

import type { PoolClient } from "pg";
import { consultar } from "../../lib/banco";
import type { StatusCiclo, TipoCiclo } from "../avaliacao/esquemas";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// ------------------------------------------------------------------ permissões

/**
 * As chaves de TODOS os blocos numa ida só ao banco (mesmo `unnest` de
 * `exigirAlgumaPermissao` em lib/sessao.ts). O portal confere oito chaves; oito
 * chamadas a `temPermissao` seriam oito conexões do pool por requisição — e o
 * pool é compartilhado com o resto da aplicação. A conferência continua sendo
 * por chave no banco, nunca por papel.
 */
export async function chavesConcedidas(
  usuarioId: number,
  chaves: readonly string[]
): Promise<Set<string>> {
  const linhas = await consultar<{ chave: string; autorizado: boolean }>(
    `SELECT chave, sistema.tem_permissao($1, chave) AS autorizado
       FROM unnest($2::text[]) AS chave`,
    [usuarioId, [...chaves]]
  );
  return new Set(
    linhas.filter((linha) => linha.autorizado).map((linha) => linha.chave)
  );
}

// ------------------------------------------------------------------ avaliações do avaliado

export interface CicloDoAvaliado {
  id: number;
  tipo: TipoCiclo;
  status: StatusCiclo;
  /** Data da consolidação (fim do ciclo). NULL enquanto não consolidou. */
  consolidado_em: string | null;
}

/**
 * Ciclos em que ESTE colaborador foi o avaliado.
 *
 * A projeção é a regra de ouro do projeto em forma de SELECT: de
 * rh.resultado_avaliacao entra SÓ `em` (quando fechou). `percentual`,
 * `faixa_resultado_id`, `recomendacao` e `memoria_calculo` não aparecem na
 * lista de colunas — ausência, não máscara. rh.decisao_avaliacao não é
 * consultada de propósito: no MVP o avaliado não vê o resultado nem a decisão,
 * e por isso esta consulta NÃO grava audit.leitura_sensivel — não há leitura
 * de dado sensível para registrar.
 */
export async function listarCiclosDoAvaliado(
  colaboradorId: number
): Promise<CicloDoAvaliado[]> {
  // TIMESTAMPTZ sai como Date do driver e é convertido aqui com toISOString()
  // — mesmo idioma de documentos/repositorio.ts. NÃO usar `::text`: o texto do
  // Postgres tem o deslocamento em duas casas ("2026-07-06 18:49:00+00"), que
  // não é ISO 8601 válido e o `new Date` da tela recusa.
  const linhas = await consultar<{
    id: string;
    tipo: TipoCiclo;
    status: StatusCiclo;
    consolidado_em: Date | null;
  }>(
    `SELECT c.id, c.tipo, c.status, r.em AS consolidado_em
       FROM rh.ciclo_avaliacao c
       LEFT JOIN rh.resultado_avaliacao r ON r.ciclo_id = c.id
      WHERE c.colaborador_id = $1
      ORDER BY COALESCE(r.em, c.criado_em) DESC, c.id DESC`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
    consolidado_em: linha.consolidado_em?.toISOString() ?? null,
  }));
}

// ------------------------------------------------------------------ PDI

export interface ItemPdi {
  id: number;
  descricao: string;
  prazo: string;
  status: string;
  responsavel_nome: string;
  dias_ate_prazo: number;
}

/**
 * Itens do plano de desenvolvimento do colaborador.
 *
 * Derivado de `rh.acao_aberta` — a tabela de "ações acordadas por pessoa, com
 * responsável, prazo e status" da migration 0002, que nasce de ocorrência, de
 * feedback formal ou avulsa. Não criamos tabela de PDI: seria uma segunda
 * tabela com a mesma forma e o mesmo dono, e a orientação da onda é derivar do
 * que existe. Diferente de `rh.ocorrencia`, `acao_aberta` não tem coluna
 * `restrita` — foi desenhada como o combinado, não como o registro reservado.
 *
 * Evolução registrada: se o RH quiser guardar ação de acompanhamento que o
 * colaborador não deve ler (plano de recuperação em curso, por exemplo), o
 * caminho é uma coluna `visivel_ao_colaborador` em rh.acao_aberta com default
 * TRUE e filtro aqui — e não deixar de mostrar o PDI a quem ele pertence.
 */
export async function listarPdiDoColaborador(
  colaboradorId: number
): Promise<ItemPdi[]> {
  const linhas = await consultar<{
    id: string;
    descricao: string;
    prazo: string;
    status: string;
    responsavel_nome: string;
    dias_ate_prazo: number;
  }>(
    `SELECT a.id, a.descricao, a.prazo::text AS prazo, a.status,
            u.nome AS responsavel_nome,
            (a.prazo - ${HOJE_SP})::int AS dias_ate_prazo
       FROM rh.acao_aberta a
       JOIN sistema.usuario u ON u.id = a.responsavel_id
      WHERE a.colaborador_id = $1
      ORDER BY (a.status = 'aberta') DESC, a.prazo, a.id`,
    [colaboradorId]
  );
  return linhas.map((linha) => ({
    ...linha,
    id: Number(linha.id),
  }));
}

// ------------------------------------------------------------------ Meu PDI (aceite + andamento)
// O lado da PESSOA: aceitar o plano homologado e reportar o andamento de cada
// ação (três estados + um log append-only). Tudo escopado por `colaboradorId`
// (o vínculo DA SESSÃO): um PDI é "meu" se tem ação do meu vínculo.

export interface RegistroAndamento {
  id: number;
  texto: string;
  status_novo: string | null;
  autor_nome: string;
  criado_em: string;
}

export interface AcaoComAndamento {
  id: number;
  descricao: string;
  prazo: string;
  status: string;
  dias_ate_prazo: number;
  andamento: RegistroAndamento[];
}

export interface MeuPdi {
  id: number;
  resumo: string;
  homologado_em: string;
  aceito_em: string | null;
  acoes: AcaoComAndamento[];
}

/** A pessoa dona da sessão. O PDI segue a PESSOA, não o vínculo atual. */
export async function pessoaIdDoUsuario(
  usuarioId: number
): Promise<number | null> {
  const [linha] = await consultar<{ pessoa_id: string | null }>(
    "SELECT pessoa_id FROM sistema.usuario WHERE id = $1",
    [usuarioId]
  );
  return linha?.pessoa_id ? Number(linha.pessoa_id) : null;
}

/** O PDI HOMOLOGADO mais recente da pessoa, com o aceite e as ações + log. */
export async function buscarMeuPdi(
  pessoaId: number
): Promise<MeuPdi | null> {
  // Escopo pela PESSOA (não pelo vínculo atual): o PDI é da pessoa, e ela pode
  // ter sido transferida — as ações ficam no vínculo em que o plano nasceu
  // (eixo 1). rh.pdi.pessoa_id é o dono estável.
  const [pdi] = await consultar<{
    id: string;
    resumo: string | null;
    homologado_em: string;
    aceito_em: string | null;
  }>(
    `SELECT p.id, p.conteudo->>'resumo' AS resumo,
            p.homologado_em::text AS homologado_em,
            p.aceito_em::text AS aceito_em
       FROM rh.pdi p
      WHERE p.status = 'homologado' AND p.pessoa_id = $1
      ORDER BY p.homologado_em DESC, p.id DESC
      LIMIT 1`,
    [pessoaId]
  );
  if (!pdi) return null;
  const pdiId = Number(pdi.id);

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
  const porAcao = new Map<number, RegistroAndamento[]>();
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

  return {
    id: pdiId,
    resumo: pdi.resumo ?? "",
    homologado_em: pdi.homologado_em,
    aceito_em: pdi.aceito_em,
    acoes: acoes.map((a) => ({
      id: Number(a.id),
      descricao: a.descricao,
      prazo: a.prazo,
      status: a.status,
      dias_ate_prazo: a.dias_ate_prazo,
      andamento: porAcao.get(Number(a.id)) ?? [],
    })),
  };
}

/**
 * Registra o aceite do plano. Escopo no próprio SQL: só um PDI homologado, ainda
 * não aceito, que tenha ação do vínculo da sessão. 0 linhas = não é dela / não
 * homologado / já aceito — o serviço traduz.
 */
export async function aceitarPdi(
  cliente: PoolClient,
  pdiId: number,
  pessoaId: number,
  usuarioId: number
): Promise<number> {
  const r = await cliente.query(
    `UPDATE rh.pdi SET aceito_por = $3, aceito_em = now()
      WHERE id = $1 AND status = 'homologado' AND aceito_em IS NULL
        AND pessoa_id = $2`,
    [pdiId, pessoaId, usuarioId]
  );
  return r.rowCount ?? 0;
}

/** A ação TRAVADA, se for da PESSOA (qualquer vínculo dela). null = não é (404). */
export async function buscarAcaoDaPessoa(
  cliente: PoolClient,
  acaoId: number,
  pessoaId: number
): Promise<{ id: number; status: string } | null> {
  const { rows } = await cliente.query<{ id: string; status: string }>(
    `SELECT a.id, a.status FROM rh.acao_aberta a
       JOIN rh.colaborador c ON c.id = a.colaborador_id
      WHERE a.id = $1 AND c.pessoa_id = $2 FOR UPDATE OF a`,
    [acaoId, pessoaId]
  );
  if (rows.length === 0) return null;
  return { id: Number(rows[0].id), status: rows[0].status };
}

/** Acrescenta um registro no log (append-only) e, se houver status_novo, move o estado da ação. */
export async function registrarAndamentoAcao(
  cliente: PoolClient,
  dados: {
    acaoId: number;
    autorUsuarioId: number;
    texto: string;
    statusNovo: string | null;
  }
): Promise<void> {
  await cliente.query(
    `INSERT INTO rh.acao_andamento
       (acao_aberta_id, autor_usuario_id, texto, status_novo)
     VALUES ($1, $2, $3, $4)`,
    [dados.acaoId, dados.autorUsuarioId, dados.texto, dados.statusNovo]
  );
  if (dados.statusNovo) {
    await cliente.query(`UPDATE rh.acao_aberta SET status = $2 WHERE id = $1`, [
      dados.acaoId,
      dados.statusNovo,
    ]);
  }
}
