-- 0016_folha_segregacao.sql
-- Segregação de funções na folha: quem calcula não aprova, e a aprovação
-- revalida o TOTP do aprovador (regras aplicadas no serviço; aqui, o rastro).

BEGIN;

ALTER TABLE rh_folha.competencia_folha
  ADD COLUMN calculada_por BIGINT REFERENCES sistema.usuario (id),
  ADD COLUMN aprovada_por  BIGINT REFERENCES sistema.usuario (id),
  ADD COLUMN aprovada_em   TIMESTAMPTZ;

COMMENT ON COLUMN rh_folha.competencia_folha.calculada_por IS
  'Quem disparou o último cálculo — o serviço proíbe que aprove a mesma competência (segregação de funções).';
COMMENT ON COLUMN rh_folha.competencia_folha.aprovada_por IS
  'Quem aprovou, após revalidação de TOTP no ato da aprovação.';

COMMIT;
