-- 0092_rubricas_ferias.sql
-- Frente 1.6 (motor de cálculo de férias — 1º estágio da lane Folha): as duas
-- rubricas de férias que o motor emite entram no catálogo. Os códigos são os
-- REAIS da folha da Fast (planilha do Diego, docs/18 §2b): 0136 Férias e
-- 0137 Adicional de Férias (o terço constitucional).
--
-- POR QUE AGORA, se a 0069/0070 as deixou de fora de propósito: a razão de
-- ficarem fora era a incidência NÃO ser fixa — "as férias só têm incidência
-- quando são GOZADAS; indenizadas na rescisão não incidem" (regra do Diego,
-- docs/18 §5) — e uma linha de catálogo carrega UMA flag. O motor de férias
-- (src/dominios/folha/calculo-ferias.ts) resolve exatamente isso: a distinção
-- gozadas × indenizadas é REGRA DO MOTOR (modalidade da entrada), e a flag da
-- versão vigente descreve o caso que incide — o GOZADO. Férias indenizadas
-- passam pelas MESMAS rubricas com base zero, e a memória de cálculo do item
-- diz por quê (verba indenizatória, Súmula 386 STJ). Nada de incidência
-- inventada: gozadas incidem tudo (parcela salarial — Lei 8.212/91 art. 28 I;
-- rendimento do trabalho → IRRF; Lei 8.036/90 art. 15 → FGTS), e a exceção
-- indenizatória fica com quem conhece a modalidade, que é o motor.
--
-- Tipo de cálculo 'automatico': quem produz o valor é o motor de férias, a
-- partir da programação (dias de gozo × valor-dia; terço = férias ÷ 3).
-- Lançar variável nelas é erro do motor mensal, como nas demais automáticas.
--
-- O abono pecuniário continua na 1401 (0028), que já existe e não incide.
--
-- Padrão da 0013/0028 mantido: identidade estável em rh_folha.rubrica;
-- incidência e tipo de cálculo vivem na VERSÃO vigente (mudança futura é
-- versão nova, nunca UPDATE no que já vigorou).

BEGIN;

-- ------------------------------------------------------------------ rubricas novas
INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('0136', 'Férias',              'provento'),
  ('0137', 'Adicional de Férias', 'provento');

-- ------------------------------------------------------------------ versão vigente + RAZÃO
--
-- 0136 FÉRIAS (gozadas) — INSS sim, IRRF sim, FGTS sim.
--   Férias GOZADAS são remuneração do período de descanso (CLT art. 129/142):
--   parcela salarial → salário-de-contribuição (Lei 8.212/91, art. 28, I) →
--   INSS; rendimento do trabalho → IRRF; integra a remuneração do FGTS
--   (Lei 8.036/90, art. 15). INDENIZADAS não incidem (Súmula 386 STJ; Lei
--   8.212/91 art. 28 §9º "d") — e essa exceção é regra do MOTOR de férias,
--   pela modalidade, não desta flag (ver cabeçalho).
--
-- 0137 ADICIONAL DE FÉRIAS (terço constitucional, CF art. 7º XVII) —
--   INSS sim, IRRF sim, FGTS sim.
--   O terço segue a natureza da verba que o origina: sobre férias GOZADAS é
--   salarial e incide tudo (STF, Tema 985: incide contribuição sobre o terço
--   de férias gozadas); sobre indenizadas, não — de novo, regra do motor.
--
INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, TRUE, TRUE, TRUE, 'automatico', NULL, 'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
 WHERE r.codigo IN ('0136', '0137');

-- Prova dentro da própria migration: as 2 nasceram com exatamente 1 versão
-- ATIVA cada, tipo 'automatico', incidindo nas três bases.
DO $$
DECLARE
  n_rubrica INT;
  n_ativa   INT;
BEGIN
  SELECT count(*) INTO n_rubrica FROM rh_folha.rubrica
   WHERE codigo IN ('0136', '0137') AND natureza = 'provento';
  SELECT count(*) INTO n_ativa FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo IN ('0136', '0137')
     AND rv.status = 'ativa'
     AND rv.tipo_calculo = 'automatico'
     AND rv.incide_inss AND rv.incide_irrf AND rv.incide_fgts;
  IF n_rubrica <> 2 OR n_ativa <> 2 THEN
    RAISE EXCEPTION 'Esperava 2 rubricas de férias e 2 versões ativas automáticas; achei % e %', n_rubrica, n_ativa;
  END IF;
END $$;

COMMIT;
