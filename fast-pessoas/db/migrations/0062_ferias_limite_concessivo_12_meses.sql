-- 0062_ferias_limite_concessivo_12_meses.sql
-- Pendência #3 (decisão do dono, 11/08/2026): o limite concessivo — que decide
-- "VENCIDA — dobro" (art. 137) na tela do titular — era 11 meses CHUMBADO, e
-- acusava dobro um mês antes de a lei o criar. O art. 134 diz que as férias são
-- concedidas "nos 12 meses subsequentes" ao período aquisitivo. O código passou
-- a 12 (ferias/servico.ts:MESES_LIMITE_CONCESSIVO).
--
-- limite_concessivo é MATERIALIZADO na criação do período, então trocar só a
-- conta deixaria linhas antigas com uma régua e novas com outra. Esta migration
-- reconcilia as já gravadas:
--
--   1. recomputa limite_concessivo = fim + 12 meses nos períodos não terminais
--      (em_aberto, programado_parcial, vencido). 'gozado' é terminal e fica.
--   2. DESVENCE quem a régua de 11 marcou cedo demais (limite de 12 >= hoje-SP):
--      volta a 'programado_parcial' se tem programação aprovada aberta, senão a
--      'em_aberto'. (No dev os 3 que desvencem não têm programação: viram em_aberto.)
--
-- O CHECK limite_concessivo > fim (0007) segue satisfeito (fim + 12m > fim).

BEGIN;

UPDATE rh.periodo_aquisitivo
   SET limite_concessivo = (fim + INTERVAL '12 months')::date
 WHERE status IN ('em_aberto', 'programado_parcial', 'vencido');

UPDATE rh.periodo_aquisitivo p
   SET status = CASE
                  WHEN EXISTS (
                    SELECT 1
                      FROM rh.programacao_ferias pf
                     WHERE pf.periodo_aquisitivo_id = p.id
                       AND pf.status = 'aprovada'
                  ) THEN 'programado_parcial'
                  ELSE 'em_aberto'
                END
 WHERE p.status = 'vencido'
   AND p.limite_concessivo >= rh.hoje();

COMMIT;
