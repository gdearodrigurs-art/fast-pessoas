-- 0100_rubrica_suspensao_disciplinar.sql
-- Suspensão disciplinar → folha (item 3.5 do roadmap; decisão D2:a do
-- docs/20-decisoes-para-a-cadeia.md, a validar com o contador COMO AVISO
-- REGISTRADO, não como bloqueio):
--
--   Rubrica própria "Desconto de Suspensão Disciplinar", AUTOMÁTICA: o motor
--   mensal lê rh.medida_disciplinar (janela de suspensão intersectando a
--   competência — a leitura que a 0080 deixou explicitamente para depois:
--   "a integração suspensão→folha é decisão de dinheiro e sobe à parte") e
--   desconta:
--     • os dias CORRIDOS da janela DENTRO da competência — janela que cruza
--       mês desconta em cada competência a sua parte;
--     • valor-dia = salário ÷ divisor mensal de dias (30 nos parâmetros da
--       folha — eixo 5: o divisor vem do banco, não do código);
--     • MAIS o DSR da semana da suspensão (Lei 605/49, molde da falta
--       injustificada): 1 valor-dia por semana civil (segunda a sábado) com
--       dia de suspensão, atribuído à competência do DOMINGO daquela semana.
--       ESTA é a regra marcada como A-CONFIRMAR com o contador — o aviso vai
--       na memória de cálculo de cada item emitido.
--
-- CÓDIGO — placeholder honesto (molde 0097 e pendência #17/#19): a planilha do
-- Diego (docs/18) não traz código real inequívoco para desconto de suspensão.
-- 1203 segue a sequência 12xx das ausências da casa (1201 Faltas, 1202 DSR
-- sobre Faltas — seed 0013); a adoção do código real vai junto dos
-- importadores, com as demais duplicatas (docs/18 §2a, decisão do dono).
--
-- INCIDÊNCIAS — espelho exato de 1201/1202 (0013:376-377): desconto salarial
-- REDUZ as três bases (INSS, IRRF, FGTS). Dia não trabalhado por suspensão não
-- é remunerado (CLT art. 474 dá o teto de 30 dias; salário não é devido no
-- período), então a base do mês cai junto — a mesma mecânica da falta.
--
-- Padrão 0013/0028/0092/0094/0097 mantido: identidade estável em
-- rh_folha.rubrica; incidência e tipo de cálculo vivem na VERSÃO vigente.

BEGIN;

INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('1203', 'Desconto de Suspensão Disciplinar', 'desconto');

INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, TRUE, TRUE, TRUE, 'automatico', NULL, 'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
 WHERE r.codigo = '1203';

-- Prova dentro da própria migration: nasceu como desconto, com exatamente uma
-- versão ATIVA, automática e reduzindo as três bases — como 1201/1202.
DO $$
DECLARE
  n_rubrica INT;
  n_ativa   INT;
BEGIN
  SELECT count(*) INTO n_rubrica FROM rh_folha.rubrica
   WHERE codigo = '1203' AND natureza = 'desconto';
  SELECT count(*) INTO n_ativa FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo = '1203'
     AND rv.status = 'ativa'
     AND rv.tipo_calculo = 'automatico'
     AND rv.incide_inss AND rv.incide_irrf AND rv.incide_fgts;
  IF n_rubrica <> 1 OR n_ativa <> 1 THEN
    RAISE EXCEPTION 'Esperava a 1203 (desconto) com 1 versão ativa automática incidindo nas 3 bases; achei % rubrica(s), % versão(ões)', n_rubrica, n_ativa;
  END IF;
  RAISE NOTICE 'suspensão disciplinar: rubrica 1203 no catálogo, automática, molde da falta';
END $$;

COMMIT;
