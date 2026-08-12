-- 0070_rubricas_diego_rodada2.sql
-- Pendência #5, rodada 2: o Diego devolveu a folha de confirmação
-- (docs/confirmacao-rubricas-diego.xlsx → confirmacao-rubricas-diego2.xlsx) com
-- as respostas dos itens que estavam abertos. Entram aqui as 3 rubricas que as
-- respostas dele tornaram INEQUÍVOCAS e que cabem no motor de hoje. Disposição
-- completa da rodada em docs/18-plano-de-rubricas-diego.md §5.
--
-- ⚠️ UNIDADE DO PERCENTUAL: o Diego mandou os percentuais como FRAÇÃO na planilha
-- (0,3 e 0,01), mas o motor (calculo.ts → aplicarPercentual, e as alíquotas de
-- INSS/FGTS) usa PERCENTUAL: 30 = 30%, 1 = 1%. Gravar 0,3 faria a periculosidade
-- sair 100× menor (0,3% do salário). Por isso vão 30 e 1 aqui.
--
-- Continuam ABERTOS (o Diego deixou em branco): a decisão de adotar os códigos
-- reais no lugar dos placeholders (aba 1-Codigos) e — a maior lacuna — a aba
-- Importadores (só o exemplo). Ver docs/18 §2a e §3.
--
-- Ficou PARKEADO com registro da resposta (docs/18): 0087 Salário Maternidade
-- (incidência agora conhecida: INSS não, IRRF sim, FGTS sim — mas é benefício
-- 'automático', decisão valor_informado × motor fica com o épico), e 0136/0137
-- Férias (regra do Diego: incide só GOZADA; vencida/indenizada na rescisão não
-- incide — é o motor de férias/rescisão que decide pela rubrica específica).

BEGIN;

-- ------------------------------------------------------------------ rubricas novas
INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('ZBHJFO', 'Aluguel Moto',              'provento'),
  ('ZE24FO', 'Adicional Periculosidade',  'provento'),
  ('5000FO', 'Vale Transporte 1%',        'desconto');

-- ------------------------------------------------------------------ versão vigente + RAZÃO
--
-- ZBHJFO ALUGUEL MOTO — INSS não, IRRF não, FGTS não. valor_informado.
--   Resposta do Diego: "não tem incidências. Esse valor é pago conforme
--   determinação de convenção coletiva." Verba sem natureza salarial → fora de
--   todas as bases; o valor chega apurado (o motor não recalcula).
--
-- ZE24FO ADICIONAL PERICULOSIDADE — INSS sim, IRRF sim, FGTS sim. percentual_salario = 30.
--   Adicional de periculosidade é SALARIAL (art. 457 CLT) → incide tudo. O motor
--   calcula 30% do salário-base (o Diego confirmou 30%). Parâmetro em PERCENTUAL: 30.
--
-- 5000FO VALE TRANSPORTE 1% — INSS não, IRRF não, FGTS não. percentual_salario = 1.
--   Desconto do empregado pelo VT (o Diego confirmou 1% do salário; o teto legal
--   é 6%, a Fast pratica 1%). Desconto → reduz o líquido, não é base. Parâmetro: 1.
--
INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, v.incide_inss, v.incide_irrf, v.incide_fgts, v.tipo_calculo, v.parametro,
       'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
  JOIN (VALUES
    ('ZBHJFO', FALSE, FALSE, FALSE, 'valor_informado',    NULL::numeric),
    ('ZE24FO', TRUE,  TRUE,  TRUE,  'percentual_salario', 30),
    ('5000FO', FALSE, FALSE, FALSE, 'percentual_salario', 1)
  ) AS v (codigo, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro)
    ON v.codigo = r.codigo;

-- Prova: as 3 nasceram com 1 versão ativa, e os percentuais foram gravados em
-- unidade de PERCENTUAL (periculosidade 30, VT 1 — nunca 0,3 / 0,01).
DO $$
DECLARE
  n_ativa   INT;
  peric     NUMERIC;
  vt        NUMERIC;
BEGIN
  SELECT count(*) INTO n_ativa FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id
   WHERE r.codigo IN ('ZBHJFO','ZE24FO','5000FO') AND rv.status = 'ativa';
  SELECT rv.parametro INTO peric FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id WHERE r.codigo = 'ZE24FO';
  SELECT rv.parametro INTO vt FROM rh_folha.rubrica_versao rv
    JOIN rh_folha.rubrica r ON r.id = rv.rubrica_id WHERE r.codigo = '5000FO';
  IF n_ativa <> 3 OR peric <> 30 OR vt <> 1 THEN
    RAISE EXCEPTION 'Esperava 3 ativas, periculosidade 30 e VT 1; achei %, % e %', n_ativa, peric, vt;
  END IF;
END $$;

COMMIT;
