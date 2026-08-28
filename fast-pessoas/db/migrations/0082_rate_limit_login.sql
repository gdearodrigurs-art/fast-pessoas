-- 0082_rate_limit_login.sql
-- Rate-limit no login (achado B3 da revisão geral). Sem contador, a porta aceita
-- tentativas ILIMITADAS: credential-stuffing contra contas comuns e DoS por
-- exaustão de bcrypt (cada tentativa paga custo 12). Fecha os dois — conta as
-- falhas recentes por e-mail e barra ANTES do bcrypt quando passa do limite.
--
-- O limiar e a janela são ADMINISTRÁVEIS (eixo 9 — nada chumbado no código), no
-- molde de linha única de sistema.parametro_privacidade.

BEGIN;

-- ---------------------------------------------------------------- registro de tentativas
CREATE TABLE sistema.tentativa_login (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      TEXT NOT NULL,
  -- true = a SENHA conferiu (mesmo que ainda falte TOTP); false = senha errada.
  -- O gate conta só as falsas — completar 2FA não tranca ninguém.
  sucesso    BOOLEAN NOT NULL,
  ip         TEXT,            -- do X-Forwarded-For; guardado para forense, o gate é por e-mail
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Consulta quente: falhas recentes de um e-mail (case-insensitive, como o login).
CREATE INDEX tentativa_login_por_email
  ON sistema.tentativa_login (lower(email), criado_em DESC);

COMMENT ON TABLE sistema.tentativa_login IS
  'Tentativas de login para rate-limit por e-mail (sucesso = senha conferiu). '
  'Retida para forense; pode ser podada por rotina — o gate só olha a janela recente.';

-- ---------------------------------------------------------------- parâmetros administráveis (eixo 9)
CREATE TABLE sistema.parametro_seguranca (
  id                    INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_tentativas_login  INT NOT NULL DEFAULT 10 CHECK (max_tentativas_login >= 1),
  janela_minutos        INT NOT NULL DEFAULT 15 CHECK (janela_minutos >= 1),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por        BIGINT REFERENCES sistema.usuario (id)
);
INSERT INTO sistema.parametro_seguranca (id) VALUES (1);
CREATE TRIGGER parametro_seguranca_tocar BEFORE UPDATE ON sistema.parametro_seguranca
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE sistema.parametro_seguranca IS
  'Parâmetros administráveis de segurança (eixo 9). Linha única (id=1). Hoje: '
  'limite de tentativas de login por janela. Edite pela tela/SQL, nunca pelo código.';

-- ---------------------------------------------------------------- prova
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sistema.parametro_seguranca WHERE id = 1) THEN
    RAISE EXCEPTION 'parametro_seguranca não semeado';
  END IF;
  IF (SELECT max_tentativas_login FROM sistema.parametro_seguranca WHERE id = 1) < 1 THEN
    RAISE EXCEPTION 'max_tentativas_login inválido';
  END IF;
  RAISE NOTICE 'rate-limit: tentativa_login + parametro_seguranca (10/15min) prontos';
END $$;

COMMIT;
