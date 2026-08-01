// Fragmentos de SQL sobre a diferença entre PESSOA e VÍNCULO.
//
// A migration 0046 fez rh.colaborador virar o VÍNCULO (o contrato) e tirou os
// dois trincos que garantiam "um CPF, uma conta, uma linha". A 0048 criou a
// transferência entre empresas do grupo, que encerra um vínculo e abre outro
// para a MESMA pessoa. Desde então, três perguntas que pareciam triviais
// deixaram de ser, e cada consulta que as respondia por conta própria passou a
// errar de um jeito diferente:
//
//   1. "esta pessoa saiu?"      -> data_desligamento IS NOT NULL responde SIM
//                                  para quem apenas mudou de CNPJ.
//   2. "esta pessoa entrou?"    -> data_admissao dentro da janela responde SIM
//                                  para quem está na casa há oito anos.
//   3. "qual é o vínculo de quem está logado?"
//                               -> JOIN por usuario_id devolve N linhas quando
//                                  a pessoa tem mais de um contrato.
//
// O banco já respondia as três (rh.saiu_do_grupo, rh.entrou_no_grupo e
// rh.vinculo_atual, com COMMENT em cada uma). O que faltava era um lugar único
// no código para elas, para que a próxima tela que contar desligamento não
// precise lembrar da regra sozinha — foi assim que o portal do gestor dobrou o
// turnover de uma equipe e o organograma duplicou uma vaga em aberto.

/**
 * Vínculo encerrado que É saída do grupo. FALSE quando o contrato foi
 * encerrado por transferência para outra empresa do grupo: a pessoa continua
 * na casa e não é turnover.
 */
export const SAIDA_DO_GRUPO = (alias: string) => `rh.saiu_do_grupo(${alias}.id)`;

/**
 * Vínculo aberto que É entrada no grupo. FALSE quando o contrato nasceu de
 * transferência interna — não é admissão nova para o quadro, e por isso também
 * não é começo de tempo de casa nem de contrato de experiência.
 */
export const ENTRADA_NO_GRUPO = (alias: string) =>
  `rh.entrou_no_grupo(${alias}.id)`;

/**
 * O vínculo corrente de uma conta de acesso. Use no lugar de
 * `JOIN rh.colaborador c ON c.usuario_id = <conta>`, que devolve uma linha por
 * contrato depois que a 0046 derrubou `colaborador_usuario_id_key`.
 */
export const VINCULO_ATUAL = (expressaoUsuarioId: string) =>
  `rh.vinculo_atual(${expressaoUsuarioId})`;
