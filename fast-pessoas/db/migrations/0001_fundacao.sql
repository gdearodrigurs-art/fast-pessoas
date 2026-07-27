-- 0001_fundacao.sql
-- Fundação do Fast Pessoas: schemas, identidade própria (Fase A), colaborador,
-- linha do tempo append-only e auditoria em duas trilhas.
-- Princípios (ver docs/02-arquitetura.md): escrita transacional, append-only onde
-- há efeito legal, imutabilidade garantida por GRANT (ver db/provisionar.sql), UTC.

BEGIN;

-- ---------------------------------------------------------------- schemas
CREATE SCHEMA sistema;   -- identidade, permissões, infraestrutura
CREATE SCHEMA rh;        -- domínios de pessoas (colaborador, demandas, ponto…)
CREATE SCHEMA rh_clima;  -- check-in diário (acesso segregado por credencial)
CREATE SCHEMA rh_folha;  -- motor de cálculo (credencial própria app_folha)
CREATE SCHEMA fiscal;    -- transmissor eSocial/FGTS/DCTFWeb
CREATE SCHEMA audit;     -- trilhas só-INSERT

-- ---------------------------------------------------------------- identidade (Fase A: auth própria)
CREATE TABLE sistema.usuario (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          TEXT NOT NULL,
  nome           TEXT NOT NULL,
  -- NULL até o primeiro acesso (fluxo de convite); hash bcrypt/argon na aplicação
  senha_hash     TEXT,
  papel          TEXT NOT NULL CHECK (papel IN
                   ('funcionario','gestor','rh','dp','diretoria','admin')),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  -- 2FA obrigatório para rh/dp/diretoria/admin — imposto na aplicação
  totp_secret    TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_email_unico ON sistema.usuario (lower(email));

-- RBAC por chave: papel é composição de chaves; a API valida por chave, nunca por papel
CREATE TABLE sistema.permissao (
  chave      TEXT PRIMARY KEY,   -- ex.: rh.colaborador.ver, clima.resposta.individual.ver
  descricao  TEXT NOT NULL
);
CREATE TABLE sistema.papel_permissao (
  papel  TEXT NOT NULL,
  chave  TEXT NOT NULL REFERENCES sistema.permissao (chave),
  PRIMARY KEY (papel, chave)
);

CREATE FUNCTION sistema.tem_permissao(p_usuario BIGINT, p_chave TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sistema.usuario u
    JOIN sistema.papel_permissao pp ON pp.papel = u.papel
    WHERE u.id = p_usuario AND u.ativo AND pp.chave = p_chave
  );
$$;

-- ---------------------------------------------------------------- colaborador (espinha dorsal)
CREATE TABLE rh.colaborador (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id         BIGINT NOT NULL UNIQUE REFERENCES sistema.usuario (id),
  -- Decisão 2026-07-27: reaproveita a numeração do Nasajon; para admitidos novos,
  -- continua a mesma sequência. matricula_esocial = matricula para todos (RET).
  matricula          TEXT NOT NULL UNIQUE,
  matricula_esocial  TEXT NOT NULL,
  cpf                CHAR(11) NOT NULL UNIQUE
                     CHECK (cpf ~ '^[0-9]{11}$'),
  nome_completo      TEXT NOT NULL,
  tipo_vinculo       TEXT NOT NULL CHECK (tipo_vinculo IN
                       ('clt','estagiario','aprendiz','pj','temporario')),
  data_admissao      DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'ativo'
                     CHECK (status IN ('ativo','afastado','desligado')),
  data_desligamento  DATE,
  retrato            TEXT,
  contexto           TEXT,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'desligado' OR data_desligamento IS NOT NULL)
);

-- ---------------------------------------------------------------- linha do tempo (append-only)
-- Projeção para consulta — NUNCA base de cálculo nem origem de evento fiscal.
CREATE TABLE rh.evento_colaborador (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  tipo            TEXT NOT NULL,     -- admissao, promocao, ocorrencia, feedback, …
  ocorrido_em     TIMESTAMPTZ NOT NULL,
  origem_tabela   TEXT NOT NULL,     -- entidade de origem do fato
  origem_id       BIGINT,
  resumo          TEXT NOT NULL,     -- legível, com rótulos resolvidos
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  registrado_por  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  registrado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX evento_colaborador_por_pessoa
  ON rh.evento_colaborador (colaborador_id, ocorrido_em DESC);

-- ---------------------------------------------------------------- auditoria em duas trilhas
CREATE TABLE audit.alteracao (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id   BIGINT,
  papel        TEXT,
  acao         TEXT NOT NULL,        -- verbos padronizados na aplicação
  tabela       TEXT NOT NULL,
  registro_id  TEXT,
  diff         JSONB,                -- campo a campo, rótulo já resolvido
  em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE audit.leitura_sensivel (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id       BIGINT NOT NULL,
  chave_permissao  TEXT NOT NULL,    -- a chave que autorizou a leitura
  recurso          TEXT NOT NULL,    -- ex.: colaborador.salario, clima.resposta
  registro_id      TEXT,
  em               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cinto e suspensório: além da ausência de GRANT (provisionar.sql), um trigger
-- impede UPDATE/DELETE mesmo pelo owner em operação normal.
CREATE FUNCTION audit.bloquear_mutacao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tabela append-only: % não permite %', TG_TABLE_NAME, TG_OP;
END;
$$;
CREATE TRIGGER alteracao_imutavel
  BEFORE UPDATE OR DELETE ON audit.alteracao
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();
CREATE TRIGGER leitura_imutavel
  BEFORE UPDATE OR DELETE ON audit.leitura_sensivel
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();
CREATE TRIGGER evento_colaborador_imutavel
  BEFORE UPDATE OR DELETE ON rh.evento_colaborador
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- atualizado_em automático
CREATE FUNCTION sistema.tocar_atualizado_em() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER usuario_tocar BEFORE UPDATE ON sistema.usuario
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER colaborador_tocar BEFORE UPDATE ON rh.colaborador
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- permissões iniciais
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.colaborador.ver',              'Ver ficha de colaborador (dados não sensíveis)'),
  ('rh.colaborador.editar',           'Editar ficha de colaborador'),
  ('rh.colaborador.sensivel.ver',     'Ver dados sensíveis da ficha (salário, ocorrências restritas)'),
  ('rh.evento.registrar',             'Registrar evento na linha do tempo'),
  ('rh.auditar',                      'Consultar trilhas de auditoria (somente leitura)'),
  ('clima.responder',                 'Responder o check-in diário'),
  ('clima.agregado.ver',              'Ver painéis agregados de clima'),
  ('clima.resposta.individual.ver',   'Ver resposta individual de clima (exclusiva da Diretoria de Pessoas; leitura gera trilha)'),
  ('usuario.administrar',             'Criar/desativar usuários e papéis');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('funcionario', 'clima.responder'),
  ('gestor',      'clima.responder'),
  ('gestor',      'rh.colaborador.ver'),
  ('gestor',      'clima.agregado.ver'),
  ('rh',          'clima.responder'),
  ('rh',          'rh.colaborador.ver'),
  ('rh',          'rh.colaborador.editar'),
  ('rh',          'rh.evento.registrar'),
  ('rh',          'clima.agregado.ver'),
  ('dp',          'clima.responder'),
  ('dp',          'rh.colaborador.ver'),
  ('dp',          'rh.colaborador.editar'),
  ('dp',          'rh.colaborador.sensivel.ver'),
  ('dp',          'rh.evento.registrar'),
  ('diretoria',   'clima.responder'),
  ('diretoria',   'rh.colaborador.ver'),
  ('diretoria',   'rh.colaborador.sensivel.ver'),
  ('diretoria',   'clima.agregado.ver'),
  ('diretoria',   'clima.resposta.individual.ver'),
  ('admin',       'usuario.administrar'),
  ('admin',       'rh.auditar');

COMMIT;
