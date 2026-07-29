-- 0018 — catálogo do indicador de Recrutamento e limpeza de resíduo de teste.
--
-- Problema corrigido: o registry src/dominios/indicadores/valores.ts já liga a
-- chave 'vagas_no_prazo' à fonte valorIndicadorVagasNoPrazo (recrutamento),
-- mas o catálogo rh.indicador nunca recebeu a linha por migration — ela só
-- existia no banco de DEV porque foi inserida à mão durante o desenvolvimento.
-- Em banco novo o indicador simplesmente não aparecia na Central de Metas e a
-- fonte nunca era apurada. Aqui ele vira dado versionado, como os demais.
--
-- Somente catálogo: a apuração continua no domínio de recrutamento e usa
-- apenas agregados (contagem de vagas fechadas), nunca dado de candidato.
BEGIN;

INSERT INTO rh.indicador (chave, nome, area, descricao, unidade, direcao) VALUES
  ('vagas_no_prazo', '% de vagas fechadas no prazo', 'Recrutamento',
   'Vagas fechadas até o prazo-alvo ÷ vagas fechadas nos últimos 12 meses.', '%', 'maior')
ON CONFLICT (chave) DO NOTHING;

-- Resíduo dos smoke tests automatizados da onda anterior: um indicador criado
-- pela própria tela para exercitar o POST e nunca removido (o catálogo não tem
-- exclusão — só o campo `ativo`). Sem isto ele apareceria na Central de Metas
-- durante a apresentação ao RH. No-op em banco novo.
UPDATE rh.indicador
   SET ativo = FALSE
 WHERE chave = 'indicador_de_teste_automatizado_ignorar'
   AND ativo;

COMMIT;
