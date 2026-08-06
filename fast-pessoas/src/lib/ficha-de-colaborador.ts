import { consultar } from "./banco";

/**
 * A frase de recusa para quem não tem ficha de colaborador.
 *
 * São DOIS fatos diferentes, e o sistema tratava os dois com a mesma frase:
 *
 *   conta administrativa   `pessoa_id` nulo — conta de sistema, criada pelo
 *                          seed-admin, que nunca vai ter ficha. Mandar essa
 *                          pessoa "procurar o DP" não faz sentido: ela costuma
 *                          estar acima do DP.
 *   vínculo terminado      tem `pessoa_id`, mas nenhum vínculo vigente. Para
 *                          essa, o DP É o caminho — a frase continua igual.
 *
 * Serve só para ESCOLHER A FRASE, nunca para autorizar: decisão de acesso
 * continua sendo por chave de permissão, no servidor, dentro da consulta.
 */
export async function mensagemSemFicha(usuarioId: number): Promise<string> {
  const linhas = await consultar<{ sem_pessoa: boolean }>(
    "SELECT pessoa_id IS NULL AS sem_pessoa FROM sistema.usuario WHERE id = $1",
    [usuarioId]
  );
  return linhas.length > 0 && linhas[0].sem_pessoa
    ? "Esta é uma conta administrativa, sem ficha de colaborador."
    : "Sua conta não está vinculada a uma ficha de colaborador — procure o DP.";
}
