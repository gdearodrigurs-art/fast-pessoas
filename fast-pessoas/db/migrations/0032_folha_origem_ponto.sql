-- 0032_folha_origem_ponto.sql
-- Ligação PONTO → FOLHA (item F5 do plano da onda F): o que a apuração do
-- ponto mediu em MINUTOS vira variável da folha, sem redigitação.
--
-- Hoje o DP apura o ponto (rh.apuracao_ponto, minutos inteiros) e depois
-- digita hora extra, falta e adicional noturno na folha à mão. Duas fontes
-- para o mesmo fato é como o número diverge — e é o retrabalho que a diretoria
-- pediu para eliminar. Esta migration abre as duas portas que faltavam:
--
--   1) origem 'ponto' em rh_folha.variavel_lancada. Origem é RASTREIO, não
--      enfeite: é ela que permite reimportar sem duplicar (o serviço apaga o
--      lote anterior de origem 'ponto' e regrava, exatamente como já faz com
--      'beneficio') e é ela que diz ao DP, na tela, que aquele número veio da
--      apuração e não da mão de alguém.
--
--   2) rubrica 1103 — Adicional Noturno. As outras três já existem desde a
--      0013 (1101 HE 50%, 1102 HE 100%, 1201 Faltas), mas o adicional noturno
--      nunca teve rubrica: rh.apuracao_ponto mede
--      `adicional_noturno_minutos` desde a 0027 e não havia onde pagar.
--
-- POR QUE O DSR NÃO ENTRA COMO VARIÁVEL: rh_folha.rubrica 1202 (DSR sobre
-- Faltas) é AUTOMÁTICA — o motor a deriva das faltas lançadas (1 dia de DSR
-- por dia de falta, simplificação F1 fixada na 0013) e recusa lançamento
-- explícito. Importar as faltas em DIAS já produz o DSR. O
-- `dsr_desconto_minutos` da apuração (cálculo semana a semana, mais exato) vai
-- para o diff da auditoria como conferência — quando a folha ganhar o DSR
-- exato (evolução F2), a rubrica 1202 sai de CODIGOS_AUTOMATICOS e passa a
-- receber a variável direto do ponto.
--
-- FATOR DO ADICIONAL NOTURNO: 0,20 (CLT art. 73 — 20% sobre a hora diurna).
-- É PARÂMETRO VERSIONADO, não constante: acordo coletivo com adicional maior
-- é uma versão NOVA da rubrica pela tela de Parâmetros, e a folha de março
-- continua com o fator de março. A HORA NOTURNA REDUZIDA (52min30 do §1º) não
-- está modelada: o motor de ponto conta minuto de relógio na janela
-- 22:00–05:00. Quando entrar, muda o motor de ponto (a contagem), não esta
-- rubrica (o preço).

BEGIN;

-- ---------------------------------------------------------------- origem 'ponto'
-- CHECK nomeado no 0013 pelo padrão do Postgres (tabela_coluna_check).
ALTER TABLE rh_folha.variavel_lancada
  DROP CONSTRAINT variavel_lancada_origem_check;
ALTER TABLE rh_folha.variavel_lancada
  ADD CONSTRAINT variavel_lancada_origem_check
  CHECK (origem IN ('manual', 'beneficio', 'ponto'));

-- Reimportar apaga o lote anterior desta origem: o índice deixa o DELETE
-- barato mesmo com a competência inteira lançada.
CREATE INDEX IF NOT EXISTS variavel_lancada_por_origem
  ON rh_folha.variavel_lancada (competencia_id, origem);

-- ---------------------------------------------------------------- rubrica 1103
-- Incidências iguais às da hora extra (1101/1102): adicional noturno é verba
-- salarial — integra INSS, IRRF e FGTS.
INSERT INTO rh_folha.rubrica (codigo, nome, natureza)
VALUES ('1103', 'Adicional Noturno', 'provento')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, TRUE, TRUE, TRUE, 'horas_adicional', 0.20, 'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
 WHERE r.codigo = '1103'
   AND NOT EXISTS (
     SELECT 1 FROM rh_folha.rubrica_versao rv
      WHERE rv.rubrica_id = r.id AND rv.status = 'ativa'
   );

COMMIT;
