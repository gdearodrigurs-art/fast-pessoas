import { PoolClient } from "pg";
import { ErroHttpCampo } from "./http";

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

/** Data de HOJE no fuso de negócio, lida da MESMA transação da escrita. */
export async function hojeSaoPaulo(cliente: PoolClient): Promise<string> {
  const { rows } = await cliente.query<{ hoje: string }>(
    `SELECT ${HOJE_SP}::text AS hoje`
  );
  return rows[0].hoje;
}

/**
 * Recusa vigência no futuro em catálogo cujo nome corrente é lido por
 * `status = 'ativa'`.
 *
 * 'ativa' é STATUS — o trinco do índice único "uma versão por catálogo" — e
 * NÃO é vigência. Metade do sistema lê o nome corrente por esse status
 * (seletores de empresa, de centro de custo, de unidade, escopo das metas,
 * cartão da movimentação, equipe do portal, elegibilidade de benefício,
 * aniversariantes) e a outra metade resolve por data (rh.lotacao_detalhada,
 * rh.estrutura_em, rh.*_versao_em). Deixar entrar uma versão com início futuro
 * fazia as duas metades divergirem no mesmo instante: o seletor da ficha já
 * oferecia o nome do ano que vem enquanto a linha do colaborador logo abaixo
 * mostrava o nome de hoje — sem nenhum aviso de que existia um rename agendado.
 *
 * Rename agendado não é caso de uso pedido; se um dia for, o caminho é trocar
 * TODO `status = 'ativa'` por vigência de data e a tela passar a dizer "passa a
 * se chamar X em dd/mm". Até lá, a versão nova vale de hoje para trás.
 */
export async function exigirVigenciaNaoFutura(
  cliente: PoolClient,
  inicioVigencia: string,
  campo = "inicio_vigencia"
): Promise<void> {
  const hoje = await hojeSaoPaulo(cliente);
  if (inicioVigencia > hoje) {
    throw new ErroHttpCampo(
      400,
      "O início da vigência não pode ser no futuro: a versão nova passa a " +
        "valer assim que é gravada, e o sistema não tem renomeação agendada.",
      campo
    );
  }
}
