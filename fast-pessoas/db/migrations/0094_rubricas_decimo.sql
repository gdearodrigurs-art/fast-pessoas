-- 0094_rubricas_decimo.sql
-- Onda 2 (motor de 13º salário — 2º estágio da lane Folha): as rubricas que o
-- motor de 13º (src/dominios/folha/calculo-13.ts) emite entram no catálogo.
--
-- CÓDIGOS — um real, quatro placeholders (docs/18 §2e e pendência #17):
--   • 0138 13º Salário — código REAL da folha da Fast (planilha do Diego,
--     docs/18 §2e: "0138 13º Salário entra aqui (tributação separada)").
--   • 1601/1602/2003/2004 — PLACEHOLDERS no esquema-exemplo da casa (1xxx
--     remuneração, 2xxx descontos legais), porque a planilha do Diego não dá o
--     código real inequívoco dessas verbas: cita "0024/0056 (INSS de 13º e
--     férias)" sem dizer qual é qual, e o adiantamento de 13º fica num
--     intervalo ("0008–0018"). Chutar código real errado é pior que um
--     placeholder honesto — a adoção dos reais já tem trilho: vai JUNTO dos
--     importadores, com o resto das duplicatas (docs/18 §2a, decisão do dono).
--     Registrado na pendência #17.
--
-- Tipo de cálculo 'automatico': quem produz o valor é o motor de 13º, a partir
-- de ano/parcela/avos. Lançar variável nelas é erro do motor mensal, como nas
-- demais automáticas.
--
-- Padrão da 0013/0028/0092 mantido: identidade estável em rh_folha.rubrica;
-- incidência e tipo de cálculo vivem na VERSÃO vigente (mudança futura é
-- versão nova, nunca UPDATE no que já vigorou).

BEGIN;

-- ------------------------------------------------------------------ rubricas novas
INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('0138', '13º Salário',                        'provento'),
  ('1601', 'Adiantamento de 13º Salário',        'provento'),
  ('1602', 'Desconto do Adiantamento de 13º',    'desconto'),
  ('2003', 'INSS sobre 13º Salário',             'desconto'),
  ('2004', 'IRRF sobre 13º Salário',             'desconto');

-- ------------------------------------------------------------------ versão vigente + RAZÃO
--
-- 0138 13º SALÁRIO (integral, 2ª parcela) — INSS sim, IRRF sim, FGTS sim.
--   Gratificação natalina é salário (Lei 4.090/62): salário-de-contribuição
--   com apuração EM SEPARADO (Lei 8.212/91, art. 28 §7º) → INSS; rendimento
--   do trabalho com tributação EXCLUSIVA na fonte (RIR/2018, art. 700) → IRRF;
--   integra a remuneração do FGTS (Lei 8.036/90, art. 15). O "em separado" /
--   "exclusiva" é regra do MOTOR de 13º (a base não soma com o salário do
--   mês) — a flag diz que incide, o motor diz COMO.
--
-- 1601 ADIANTAMENTO DE 13º (1ª parcela) — INSS não, IRRF não, FGTS sim.
--   O adiantamento é pago SEM desconto (Lei 4.749/65, art. 2º): INSS e IRRF do
--   13º incidem inteiros na quitação (2ª parcela), sobre o TOTAL. O FGTS, ao
--   contrário, deposita quando cada parcela é paga (Lei 8.036/90, art. 15) —
--   fica registrado na flag; o motor de 13º desta onda apura só INSS/IRRF.
--
-- 1602 DESCONTO DO ADIANTAMENTO (2ª parcela) — não/não/não.
--   Compensação do que já foi pago na 1ª parcela: sai do líquido, não reduz
--   base nenhuma — o INSS e o IRRF do 13º são sobre o TOTAL (0138).
--
-- 2003/2004 INSS/IRRF SOBRE 13º — não/não/não.
--   São os próprios descontos legais do 13º, apurados em separado dos 2001/2002
--   do mês para o holerite dizer de onde cada desconto veio. Desconto de
--   tributo não é base de nada.
--
INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, v.incide_inss, v.incide_irrf, v.incide_fgts,
       'automatico', NULL, 'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
  JOIN (VALUES
    ('0138', TRUE,  TRUE,  TRUE ),   -- 13º integral: incide tudo, em separado
    ('1601', FALSE, FALSE, TRUE ),   -- adiantamento: sem desconto (Lei 4.749/65 art. 2º); FGTS deposita
    ('1602', FALSE, FALSE, FALSE),   -- compensação do adiantamento: não é base
    ('2003', FALSE, FALSE, FALSE),   -- INSS do 13º: o próprio desconto
    ('2004', FALSE, FALSE, FALSE)    -- IRRF do 13º: o próprio desconto
  ) AS v (codigo, incide_inss, incide_irrf, incide_fgts)
    ON v.codigo = r.codigo;

-- Prova dentro da própria migration: as 5 nasceram com exatamente 1 versão
-- ATIVA cada, tipo 'automatico', e o 0138 incidindo nas três bases.
DO $$
DECLARE
  n_rubrica INT;
  n_ativa   INT;
  n_0138    INT;
BEGIN
  SELECT count(*) INTO n_rubrica FROM rh_folha.rubrica
   WHERE codigo IN ('0138', '1601', '1602', '2003', '2004');
  SELECT count(*) INTO n_ativa FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo IN ('0138', '1601', '1602', '2003', '2004')
     AND rv.status = 'ativa'
     AND rv.tipo_calculo = 'automatico';
  SELECT count(*) INTO n_0138 FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo = '0138' AND rv.status = 'ativa'
     AND rv.incide_inss AND rv.incide_irrf AND rv.incide_fgts;
  IF n_rubrica <> 5 OR n_ativa <> 5 OR n_0138 <> 1 THEN
    RAISE EXCEPTION 'Esperava 5 rubricas de 13º com 5 versões ativas automáticas (0138 incidindo tudo); achei % rubricas, % ativas, % 0138', n_rubrica, n_ativa, n_0138;
  END IF;
END $$;

COMMIT;
