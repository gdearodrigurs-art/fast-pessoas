-- 0097_rubricas_rescisao.sql
-- Onda 3 (motor de rescisão — 3º estágio da lane Folha): as rubricas próprias
-- que o motor de rescisão (src/dominios/folha/calculo-rescisao.ts) emite e que
-- AINDA não existiam no catálogo. Conferido contra 0028/0069/0070/0092/0094 e
-- docs/18: férias indenizadas saem pelas MESMAS 0136/0137 (decisão registrada
-- na 0092 — "férias indenizadas passam pelas MESMAS rubricas com base zero");
-- o 13º da rescisão sai pelas 0138/1602/2003/2004 (0094, reuso do motor de
-- 13º); INSS/IRRF do mês da rescisão saem pelos 2001/2002 (0013). Faltavam as
-- TRÊS verbas exclusivas da rescisão:
--
-- CÓDIGOS — placeholders honestos (molde 0094 e pendência #17/#19): a planilha
-- do Diego (docs/18 §2e) cita as verbas de rescisão num intervalo ambíguo
-- ("0078/0002/0015 (rescisão)") sem dizer qual é qual. Chutar código real
-- errado é pior que um placeholder honesto — 1701/1702/1703 seguem o esquema
-- 1xxx de remuneração da casa, e a adoção dos códigos reais vai JUNTO dos
-- importadores, com as demais duplicatas (docs/18 §2a, decisão do dono).
--
-- Tipo de cálculo 'automatico': quem produz o valor é o motor de rescisão, a
-- partir do processo de desligamento (datas, modalidade, iniciativa). Lançar
-- variável nelas é erro do motor mensal, como nas demais automáticas.
--
-- Padrão da 0013/0028/0092/0094 mantido: identidade estável em
-- rh_folha.rubrica; incidência e tipo de cálculo vivem na VERSÃO vigente
-- (mudança futura é versão nova, nunca UPDATE no que já vigorou).

BEGIN;

-- ------------------------------------------------------------------ rubricas novas
INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('1701', 'Saldo de Salário',         'provento'),
  ('1702', 'Aviso Prévio Indenizado',  'provento'),
  ('1703', 'Multa de 40% do FGTS',     'provento');

-- ------------------------------------------------------------------ versão vigente + RAZÃO
--
-- 1701 SALDO DE SALÁRIO — INSS sim, IRRF sim, FGTS sim.
--   Os dias trabalhados no mês da rescisão são SALÁRIO puro e simples:
--   salário-de-contribuição (Lei 8.212/91, art. 28, I) → INSS; rendimento do
--   trabalho → IRRF; integra a remuneração do FGTS (Lei 8.036/90, art. 15).
--
-- 1702 AVISO PRÉVIO INDENIZADO — INSS não, IRRF não, FGTS sim.
--   Verba INDENIZATÓRIA: não é salário-de-contribuição (STJ, REsp
--   1.230.957/RS, repetitivo) → sem INSS; isento de IRRF (Lei 7.713/88,
--   art. 6º, V — aviso prévio pago por despedida). O FGTS, ao contrário,
--   INCIDE sobre o período do aviso, trabalhado ou não (Súmula 305 do TST) —
--   fica registrado na flag; o motor de rescisão desta onda apura só
--   INSS/IRRF (mesmo recorte do 1601 na 0094).
--
-- 1703 MULTA DE 40% DO FGTS — não/não/não.
--   Indenização compensatória sobre o saldo do FGTS (Lei 8.036/90, art. 18,
--   §1º; no acordo do art. 484-A da CLT sai pela metade, 20% — quem decide o
--   percentual é o MOTOR, pelo tipo de desligamento). Não é base de nada:
--   sem INSS (não é salário-de-contribuição), sem IRRF (Lei 7.713/88, art.
--   6º, V) e não gera novo depósito de FGTS.
--
INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, v.incide_inss, v.incide_irrf, v.incide_fgts,
       'automatico', NULL, 'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
  JOIN (VALUES
    ('1701', TRUE,  TRUE,  TRUE ),   -- saldo de salário: salarial, incide tudo
    ('1702', FALSE, FALSE, TRUE ),   -- aviso indenizado: indenizatório; FGTS deposita (Súmula 305 TST)
    ('1703', FALSE, FALSE, FALSE)    -- multa do FGTS: indenização, não é base de nada
  ) AS v (codigo, incide_inss, incide_irrf, incide_fgts)
    ON v.codigo = r.codigo;

-- Prova dentro da própria migration: as 3 nasceram com exatamente 1 versão
-- ATIVA cada, tipo 'automatico', e só o 1701 incidindo nas três bases.
DO $$
DECLARE
  n_rubrica INT;
  n_ativa   INT;
  n_1701    INT;
BEGIN
  SELECT count(*) INTO n_rubrica FROM rh_folha.rubrica
   WHERE codigo IN ('1701', '1702', '1703') AND natureza = 'provento';
  SELECT count(*) INTO n_ativa FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo IN ('1701', '1702', '1703')
     AND rv.status = 'ativa'
     AND rv.tipo_calculo = 'automatico';
  SELECT count(*) INTO n_1701 FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo = '1701' AND rv.status = 'ativa'
     AND rv.incide_inss AND rv.incide_irrf AND rv.incide_fgts;
  IF n_rubrica <> 3 OR n_ativa <> 3 OR n_1701 <> 1 THEN
    RAISE EXCEPTION 'Esperava 3 rubricas de rescisão com 3 versões ativas automáticas (1701 incidindo tudo); achei % rubricas, % ativas, % 1701', n_rubrica, n_ativa, n_1701;
  END IF;
END $$;

COMMIT;
