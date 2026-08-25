-- 0087_falhas_de_totp_desativam_o_usuario.sql
-- Decisão C1 MODIFICADA pelo dono (docs/20): 5 falhas CONSECUTIVAS de código
-- TOTP desativam o usuário (usuario.ativo = false); reativar é ato do DP/admin
-- pela tela de usuários. Acerto ZERA o contador — são falhas consecutivas, não
-- janela de tempo.
--
-- Por que o contador vive no PRÓPRIO usuário, e não numa coluna tipo em
-- sistema.tentativa_login (0082):
--   (a) "consecutivas desde o último acerto" é ESTADO do usuário; derivá-lo de
--       um log exigiria "falhas desde o último sucesso", e o COMMENT da 0082 já
--       autoriza podar a tabela por rotina — a poda corromperia a contagem;
--   (b) tentativa_login é por E-MAIL e pré-autenticação; a falha de TOTP é por
--       USUÁRIO, depois de a senha conferir — identidades diferentes;
--   (c) o incremento atômico com RETURNING decide o limiar numa instrução só,
--       sem corrida entre duas tentativas simultâneas.
--
-- Salvaguarda do último admin: quem pode gerir usuários (por CHAVE de
-- permissão — 'usuario.administrar', a que a tela /usuarios exige — nunca por
-- nome de papel) e é o ÚLTIMO ativo NUNCA é desativado por esta regra, senão
-- ninguém reativa ninguém. Para ele vale bloqueio TEMPORÁRIO
-- (totp_bloqueado_ate). Limiar e minutos são ADMINISTRÁVEIS (eixo 9), na linha
-- única de sistema.parametro_seguranca.
--
-- O anti-replay (totp_ultimo_passo, 0060) fica INTACTO — camada separada.

BEGIN;

-- ---------------------------------------------------------------- contador no usuário
ALTER TABLE sistema.usuario
  ADD COLUMN totp_falhas_consecutivas INT NOT NULL DEFAULT 0
    CONSTRAINT usuario_totp_falhas_nao_negativas
      CHECK (totp_falhas_consecutivas >= 0),
  ADD COLUMN totp_bloqueado_ate TIMESTAMPTZ;

COMMENT ON COLUMN sistema.usuario.totp_falhas_consecutivas IS
  'Falhas CONSECUTIVAS de código TOTP (login + revalidações críticas). Acerto '
  'zera. Ao alcançar o limiar administrável (parametro_seguranca.max_falhas_totp) '
  'o usuário é desativado — ou bloqueado temporariamente, se for o último ativo '
  'com a chave de gestão de usuários.';
COMMENT ON COLUMN sistema.usuario.totp_bloqueado_ate IS
  'Bloqueio TEMPORÁRIO de TOTP (caso último-admin da regra de falhas): até este '
  'instante o login e as revalidações críticas recusam sem validar código. '
  'NULL ou passado = sem bloqueio. Acerto posterior limpa.';

-- ---------------------------------------------------------------- parâmetros administráveis (eixo 9)
ALTER TABLE sistema.parametro_seguranca
  ADD COLUMN max_falhas_totp INT NOT NULL DEFAULT 5
    CONSTRAINT parametro_max_falhas_totp_minimo CHECK (max_falhas_totp >= 1),
  ADD COLUMN bloqueio_totp_minutos INT NOT NULL DEFAULT 15
    CONSTRAINT parametro_bloqueio_totp_minimo CHECK (bloqueio_totp_minutos >= 1);

COMMENT ON COLUMN sistema.parametro_seguranca.max_falhas_totp IS
  'Falhas consecutivas de código TOTP que desativam o usuário (C1 modificada). '
  'Edite pela tela/SQL, nunca pelo código.';
COMMENT ON COLUMN sistema.parametro_seguranca.bloqueio_totp_minutos IS
  'Duração do bloqueio temporário aplicado no lugar da desativação quando o '
  'usuário é o último ativo com a chave de gestão de usuários.';

-- ---------------------------------------------------------------- prova
DO $$
DECLARE
  v_max INT;
  v_minutos INT;
BEGIN
  SELECT max_falhas_totp, bloqueio_totp_minutos
    INTO v_max, v_minutos
    FROM sistema.parametro_seguranca WHERE id = 1;
  IF v_max IS NULL OR v_max < 1 THEN
    RAISE EXCEPTION 'max_falhas_totp inválido (%)', v_max;
  END IF;
  IF v_minutos IS NULL OR v_minutos < 1 THEN
    RAISE EXCEPTION 'bloqueio_totp_minutos inválido (%)', v_minutos;
  END IF;
  IF EXISTS (SELECT 1 FROM sistema.usuario
              WHERE totp_falhas_consecutivas <> 0 OR totp_bloqueado_ate IS NOT NULL) THEN
    RAISE EXCEPTION 'usuários deveriam nascer com contador zerado e sem bloqueio';
  END IF;
  RAISE NOTICE 'falhas de TOTP: contador por usuário + limiar %/bloqueio % min administráveis',
    v_max, v_minutos;
END $$;

COMMIT;
