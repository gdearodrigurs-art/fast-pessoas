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
