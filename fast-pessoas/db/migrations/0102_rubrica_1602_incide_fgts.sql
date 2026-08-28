-- 0102_rubrica_1602_incide_fgts.sql
-- Conserto de catálogo (revisão adversarial 2026-08): a rubrica 1602 (Desconto
-- do Adiantamento de 13º) nasceu na 0094 com incide_fgts = FALSE, e as irmãs
-- 1601 (Adiantamento) e 0138 (13º integral) com TRUE. A conta que isso produz
-- na integração do 13º com a competência é 150% de base de FGTS:
--
--   • 1ª parcela: 1601 (provento, FGTS TRUE)  → deposita sobre  50% do 13º
--   • 2ª parcela: 0138 (provento, FGTS TRUE)  → deposita sobre 100% do 13º
--                 1602 (desconto, FGTS FALSE) → não reduz nada
--   ─────────────────────────────────────────────────────────────────────
--   base total = 50% + 100% − 0% = 150% do 13º → depósito de 12% em vez
--   dos 8% devidos (Lei 8.036/90, art. 15: o FGTS deposita quando cada
--   parcela é paga — a soma das parcelas tem que fechar em 100%).
--
-- Com incide_fgts = TRUE na 1602, o desconto REDUZ a base (o motor mensal
-- subtrai desconto incidente — calculo.ts, bloco 4): 50% + 100% − 50% = 100%.
--
-- COMO se conserta: rubrica é IMUTÁVEL no que já vigorou (padrão da
-- 0013/0028/0094: mudança é VERSÃO NOVA, nunca UPDATE no que já valeu). A
-- versão da 0094 é encerrada em 31/08/2026 e a nova, idêntica exceto pela
-- flag, vige a partir de 01/09/2026 — o que já foi calculado até agosto segue
-- reproduzível com a flag da época; o 13º que vai virar folha (parcelas de
-- nov/dez, integração 13o_1a/13o_2a) já resolve a versão nova pela data de
-- referência. Nada além da flag muda: INSS/IRRF seguem FALSE (o tributo do
-- 13º é sobre o TOTAL — 0138), tipo segue 'automatico'.

BEGIN;

-- Encerra a versão vigente da 1602 (a da 0094). O trigger da casa só congela
-- o que JÁ está encerrado — ativa → encerrada é o caminho normal.
UPDATE rh_folha.rubrica_versao rv
   SET status = 'encerrada', fim_vigencia = DATE '2026-08-31'
  FROM rh_folha.rubrica r
 WHERE r.id = rv.rubrica_id
   AND r.codigo = '1602'
   AND rv.status = 'ativa';

-- A versão nova: só a flag de FGTS muda (desconto que reduz a base, espelho
-- do que a 1601/0138 somam).
INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, FALSE, FALSE, TRUE, 'automatico', NULL, 'ativa', DATE '2026-09-01'
  FROM rh_folha.rubrica r
 WHERE r.codigo = '1602';

-- Prova dentro da própria migration: a 1602 termina com exatamente UMA versão
-- ativa (incide_fgts, vigente de 01/09/2026) e a antiga encerrada em
-- 31/08/2026 sem sobreposição de janelas.
DO $$
DECLARE
  n_ativa     INT;
  n_encerrada INT;
BEGIN
  SELECT count(*) INTO n_ativa
    FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo = '1602' AND rv.status = 'ativa'
     AND rv.incide_fgts AND NOT rv.incide_inss AND NOT rv.incide_irrf
     AND rv.tipo_calculo = 'automatico'
     AND rv.inicio_vigencia = DATE '2026-09-01';
  SELECT count(*) INTO n_encerrada
    FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo = '1602' AND rv.status = 'encerrada'
     AND NOT rv.incide_fgts
     AND rv.fim_vigencia = DATE '2026-08-31';
  IF n_ativa <> 1 OR n_encerrada <> 1 THEN
    RAISE EXCEPTION 'Esperava a 1602 com 1 versão ativa (FGTS, desde 01/09) e 1 encerrada (31/08); achei % ativa(s), % encerrada(s)', n_ativa, n_encerrada;
  END IF;
END $$;

COMMIT;
