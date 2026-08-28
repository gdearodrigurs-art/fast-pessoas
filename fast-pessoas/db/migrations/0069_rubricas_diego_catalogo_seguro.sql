-- 0069_rubricas_diego_catalogo_seguro.sql
-- Pendência #5 (docs/pendencias.md): o Diego entregou o plano de rubricas da
-- folha real ("Cópia de rubricas-e-importadores-para-o-diego preencv2.xlsx",
-- 12/08/2026). O catálogo normalizado e a disposição item a item estão em
-- docs/18-plano-de-rubricas-diego.md.
--
-- ESTA MIGRATION ENTRA SÓ COM O SUBCONJUNTO SEGURO: rubricas NOVAS, de
-- 'valor_informado' (o valor chega apurado — o motor não recalcula), com
-- incidência inequívoca e código que ainda não existe. São as verbas variáveis
-- recorrentes do mês (adicional por tempo de serviço e os descontos do
-- empregado). NÃO mexe em nenhuma rubrica existente nem em dado de folha já
-- calculado — só disponibiliza rubricas novas para o DP lançar.
--
-- FICOU DE FORA, DE PROPÓSITO (cada uma tem dono/motivo em docs/18 e no #5):
--   • 'Validar' — 0136 Férias, 0137 Adicional de Férias (incidência muda entre
--     gozadas e indenizadas), 0087 Salário Maternidade (INSS pós Tema 72/STF).
--   • '% do salário' sem o percentual — ZE24FO Periculosidade, 5000FO VT 1%.
--   • 0138 13º Salário — tributação PRÓPRIA/separada; não é valor_informado
--     comum do mês (vai com o motor de 13º).
--   • ~30 'Automático' de férias/rescisão/13º — dependem do motor de cálculo
--     dessas verbas, que é épico à parte; listar não faz o cálculo existir.
--   • Duplicatas por código — Salário Base 00S1FO×1001, HE 01H1FO/01H2FO×
--     1101/1102, DSR 0082/0084×1303, Salário Família 0086×1501: a decisão de
--     adotar os códigos reais e aposentar os placeholders é do dono (#5).
--
-- Padrão da 0013/0028 mantido: identidade estável em rh_folha.rubrica;
-- incidência e tipo de cálculo vivem na VERSÃO vigente. Fonte das incidências:
-- as colunas Incide INSS/IRRF/FGTS preenchidas pelo Diego na planilha.

BEGIN;

-- ------------------------------------------------------------------ rubricas novas
INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('0119',   'Triênio',                        'provento'),
  ('0227',   'Empréstimo eConsignado em Folha', 'desconto'),
  ('05D2FO', 'Desconto Refeição',              'desconto'),
  ('05D6FO', 'Desc. VT Não Utilizado',         'desconto'),
  ('5031',   'ASSIM SAUDE',                    'desconto'),
  ('5033',   'ASSIM SAUDE DEPENDENTES',        'desconto'),
  ('5034',   'AMIL SAÚDE',                     'desconto'),
  ('5035',   'AMIL SAÚDE DEPENDENTE',          'desconto'),
  ('ZA25FO', 'Desc de Dano a Equipe',          'desconto');

-- ------------------------------------------------------------------ versão vigente + RAZÃO de cada incidência
--
-- 0119 TRIÊNIO — INSS sim, IRRF sim, FGTS sim.
--   Adicional por tempo de serviço é parcela SALARIAL (contraprestação
--   habitual). Sendo salário: entra no salário-de-contribuição → INSS; é
--   rendimento do trabalho → IRRF; integra a remuneração do FGTS. (Diego: Sim/Sim/Sim.)
--
-- Os DESCONTOS abaixo são todos Não/Não/Não: são descontos DO EMPREGADO no
-- holerite (o valor sai do líquido). Não constituem rendimento nem base de
-- imposto/encargo — reduzem o líquido, não a base. (Diego: Não/Não/Não em todos.)
--   0227    Empréstimo consignado (plataforma eConsignado): desconto autorizado.
--   05D2FO  Coparticipação/desconto de refeição do empregado.
--   05D6FO  Estorno de vale-transporte não utilizado.
--   5031/33 Plano de saúde Assim (titular e dependentes): coparticipação do empregado.
--   5034/35 Plano de saúde Amil (titular e dependente): idem.
--   ZA25FO  Desconto por dano causado (art. 462 §1º CLT: exige dolo ou acordo);
--           é ressarcimento, não rendimento — não toca nenhuma base.
--
INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, v.incide_inss, v.incide_irrf, v.incide_fgts,
       'valor_informado', NULL, 'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
  JOIN (VALUES
    ('0119',   TRUE,  TRUE,  TRUE ),   -- triênio: adicional salarial por tempo de serviço
    ('0227',   FALSE, FALSE, FALSE),   -- consignado: desconto do empregado
    ('05D2FO', FALSE, FALSE, FALSE),   -- refeição: desconto do empregado
    ('05D6FO', FALSE, FALSE, FALSE),   -- VT não utilizado: estorno
    ('5031',   FALSE, FALSE, FALSE),   -- Assim saúde titular: coparticipação
    ('5033',   FALSE, FALSE, FALSE),   -- Assim saúde dependentes: coparticipação
    ('5034',   FALSE, FALSE, FALSE),   -- Amil saúde titular: coparticipação
    ('5035',   FALSE, FALSE, FALSE),   -- Amil saúde dependente: coparticipação
    ('ZA25FO', FALSE, FALSE, FALSE)    -- dano à equipe: ressarcimento (CLT 462 §1º)
  ) AS v (codigo, incide_inss, incide_irrf, incide_fgts)
    ON v.codigo = r.codigo;

-- Prova dentro da própria migration: as 9 nasceram com exatamente 1 versão ATIVA.
DO $$
DECLARE
  n_rubrica INT;
  n_ativa   INT;
BEGIN
  SELECT count(*) INTO n_rubrica FROM rh_folha.rubrica
   WHERE codigo IN ('0119','0227','05D2FO','05D6FO','5031','5033','5034','5035','ZA25FO');
  SELECT count(*) INTO n_ativa FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo IN ('0119','0227','05D2FO','05D6FO','5031','5033','5034','5035','ZA25FO')
     AND rv.status = 'ativa';
  IF n_rubrica <> 9 OR n_ativa <> 9 THEN
    RAISE EXCEPTION 'Esperava 9 rubricas e 9 versões ativas; achei % e %', n_rubrica, n_ativa;
  END IF;
END $$;

COMMIT;
