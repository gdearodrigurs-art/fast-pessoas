-- 0015_notificacoes.sql
-- Notificações internas — aviso in-app por usuário (sino no cabeçalho).
-- Princípios (ver docs/02-arquitetura.md e src/dominios/LEIA-ME.md):
--   (1) corpo NUNCA carrega dado sensível: a notificação é um AVISO neutro
--       ("Sua solicitação de férias foi analisada"), jamais o conteúdo
--       (salário, nota de avaliação, resposta de clima…). O dado fica na tela
--       de destino, atrás da checagem de permissão da rota — regra imposta no
--       SERVIÇO ao montar titulo/corpo; o banco registra a regra aqui.
--   (2) link é caminho INTERNO da aplicação (ex.: /ferias/12) — nunca URL
--       externa; CHECK abaixo fecha a porta para link fora do app.
--   (3) SEM permissão nova: notificação não é recurso compartilhado — cada
--       usuário vê SOMENTE as próprias. O filtro é `usuario_id = <sessão>` em
--       TODA consulta/mutação do repositório (nunca id vindo do cliente);
--       por isso não existe chave em sistema.permissao para este módulo.

BEGIN;

-- ---------------------------------------------------------------- notificação
CREATE TABLE sistema.notificacao (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  tipo        TEXT NOT NULL CHECK (btrim(tipo) <> ''),   -- ex.: demanda.atribuida, ferias.analisada
  titulo      TEXT NOT NULL CHECK (btrim(titulo) <> ''),
  -- Detalhe opcional do aviso — SEM dado sensível (regra do serviço; ver cabeçalho).
  corpo       TEXT,
  -- Caminho interno da aplicação; a permissão sobre o RECURSO é checada na
  -- rota de destino, nunca aqui.
  link        TEXT CHECK (link IS NULL OR link ~ '^/'),
  lida        BOOLEAN NOT NULL DEFAULT FALSE,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consulta canônica do sino: "minhas não lidas, mais recentes primeiro"
-- (e a listagem geral do usuário, pelo mesmo prefixo).
CREATE INDEX notificacao_por_usuario
  ON sistema.notificacao (usuario_id, lida, criada_em DESC);

-- Cinto e suspensório: notificação emitida não se reescreve — a única
-- mutação legítima é marcar/desmarcar lida (feita pelo próprio dono, com o
-- filtro de sessão do repositório). Conteúdo errado = nova notificação.
CREATE FUNCTION sistema.notificacao_travar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.tipo      IS DISTINCT FROM OLD.tipo
     OR NEW.titulo    IS DISTINCT FROM OLD.titulo
     OR NEW.corpo     IS DISTINCT FROM OLD.corpo
     OR NEW.link      IS DISTINCT FROM OLD.link
     OR NEW.criada_em IS DISTINCT FROM OLD.criada_em THEN
    RAISE EXCEPTION
      'notificação é imutável após emitida: apenas "lida" pode mudar — correção é nova notificação';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notificacao_travar
  BEFORE UPDATE ON sistema.notificacao
  FOR EACH ROW EXECUTE FUNCTION sistema.notificacao_travar();

-- ---------------------------------------------------------------- permissões
-- Intencionalmente NENHUMA chave nova em sistema.permissao: o acesso é
-- "somente as minhas" por construção (filtro de sessão no repositório).
-- Ver/marcar notificação alheia não existe como caso de uso — nem para admin.

COMMIT;
