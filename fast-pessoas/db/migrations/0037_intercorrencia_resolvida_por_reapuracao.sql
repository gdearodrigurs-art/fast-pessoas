-- 0037_intercorrencia_resolvida_por_reapuracao.sql
-- A fila de intercorrências para de sumir por DELETE.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Reapurar uma competência APAGAVA todas as linhas 'aberta' do período
-- (DELETE FROM rh.intercorrencia_ponto WHERE ... status = 'aberta') e inseria de
-- novo o que o motor voltasse a detectar. Duas consequências, as duas ruins:
--
-- 1) O QUE FOI RESOLVIDO SOME SEM RASTRO. Prova colhida na base da demo:
--    antes  -> 447 | 2026-07-21 | entrada_sem_saida  | aberta
--              448 | 2026-07-21 | fora_da_tolerancia | aberta
--    depois -> 473 | 2026-07-21 | fora_da_tolerancia | aberta
--    Os ids 447 e 448 deixaram de existir. A trilha da operação
--    ('ponto.apuracao.reapurar') só carrega o diff de totais — nenhuma menção a
--    intercorrência. Um auditor que pergunte "o que estava aberto ontem e por
--    que saiu da fila?" não tem como responder pela trilha, embora o módulo seja
--    append-only em marcação e em banco de horas justamente para responder isso.
--
-- 2) O QUE CONTINUA ABERTO TROCA DE ID. O mesmo fato voltava com id novo (1662
--    virou 1727 na reprodução). O DP que estivesse com a fila na tela e clicasse
--    em "tratar" depois de uma reapuração recebia 404 numa linha que ele estava
--    vendo.
--
-- COMO FICA
-- A reapuração passa a RECONCILIAR em vez de apagar e reinserir:
--   • fato que o motor ainda acusa  -> a MESMA linha continua, só o detalhe é
--     atualizado (o número do dia muda quando a marcação muda);
--   • fato que o motor não acusa mais -> a linha recebe o status terminal
--     'resolvida_por_reapuracao', com corrigido_em, com o usuário que mandou
--     reapurar e com a observação dizendo o que ela dizia e por que saiu;
--   • fato novo -> linha nova, como antes.
-- Nada mais é apagado. O status novo é do SISTEMA: ninguém o escolhe pela API
-- (o esquema de tratamento continua aceitando só corrigida/justificada/ignorada)
-- e ele reabre igual a 'corrigida' se o fato voltar a aparecer.
--
-- Os dois CHECKs que já existiam continuam valendo e passam a proteger também o
-- status novo: quem fecha tem que estar identificado (corrigida_por) e tem que
-- deixar texto (observacao) — a reapuração preenche os dois.
--
-- NENHUMA LINHA JÁ GRAVADA MUDA: a migration só amplia os CHECKs.

BEGIN;

ALTER TABLE rh.intercorrencia_ponto
  DROP CONSTRAINT intercorrencia_ponto_status_check,
  ADD  CONSTRAINT intercorrencia_ponto_status_check CHECK (status IN
         ('aberta','corrigida','justificada','ignorada',
          -- Terminal, escrito só pela reapuração: o motor deixou de detectar o
          -- fato. Não é "alguém corrigiu" nem "alguém justificou" — é "o fato
          -- não está mais lá", e a diferença importa para quem audita.
          'resolvida_por_reapuracao'));

COMMENT ON COLUMN rh.intercorrencia_ponto.status IS
  'aberta = na fila do DP. corrigida/justificada/ignorada = desfecho decidido '
  'por gente. resolvida_por_reapuracao = desfecho constatado pela máquina: a '
  'reapuração rodou e o motor não acusa mais o fato. Só este último não é '
  'escolhível pela API.';

COMMENT ON COLUMN rh.intercorrencia_ponto.corrigida_por IS
  'Quem fechou a linha. Em resolvida_por_reapuracao é quem mandou reapurar — '
  'não foi ele quem corrigiu o fato, foi ele quem rodou a conta que constatou '
  'o desaparecimento.';

COMMIT;
