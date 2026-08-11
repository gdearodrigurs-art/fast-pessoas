-- 0060_totp_de_uso_unico.sql
-- Pendência #11 da varredura geral: o código TOTP era reutilizável dentro da
-- janela de aceitação (~90s). validarCodigoTotp só conferia o código, sem
-- registrar qual já foi consumido — quem capturasse um código + a senha podia
-- reapresentar o MESMO código para completar login ou uma revalidação crítica.
--
-- TOTP é, por definição, de USO ÚNICO. Esta coluna guarda o último "passo"
-- (contador de períodos de 30s) aceito por usuário; a validação passa a gravar
-- o passo de forma atômica e a recusar reapresentação (passo <= último).
-- Como o passo é função do relógio, ele é monotônico: código fresco tem sempre
-- passo maior, então login legítimo nunca é barrado.

BEGIN;

ALTER TABLE sistema.usuario
  ADD COLUMN totp_ultimo_passo BIGINT;

COMMENT ON COLUMN sistema.usuario.totp_ultimo_passo IS
  'Último passo TOTP (contador de períodos de 30s) consumido. A validação só '
  'aceita passo maior — impede replay do mesmo código. NULL = nenhum consumido '
  '(zera junto com a troca do secret).';

COMMIT;
