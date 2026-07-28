-- 0002_nucleo_pessoas.sql
-- Núcleo de pessoas sobre a fundação do 0001: estabelecimentos e lotação,
-- cargos com CHA e tabela salarial, posição/salário por vigência, relação
-- gestor→liderado, ocorrências, feedback formal e ações abertas.
-- Base funcional: docs/03-modulos/01-nucleo-colaborador-historico.md.
-- Padrão versionado: status rascunho→ativa→encerrada com inicio_vigencia;
-- mudança é sempre versão/linha nova — nunca UPDATE no que já encerrou.

BEGIN;

-- ---------------------------------------------------------------- guardas de vigência
-- Versões parametrizáveis: encerrada é imutável (nem UPDATE, nem DELETE).
CREATE FUNCTION rh.bloquear_versao_encerrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'encerrada' THEN
    RAISE EXCEPTION 'versão encerrada é imutável: % não permite %', TG_TABLE_NAME, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Histórico por vigência: linha com fim_vigencia preenchido é imutável.
CREATE FUNCTION rh.bloquear_vigencia_encerrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.fim_vigencia IS NOT NULL THEN
    RAISE EXCEPTION 'vigência encerrada é imutável: % não permite %', TG_TABLE_NAME, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- estabelecimento versionado
-- Identidade estável é o CNPJ; dados descritivos mudam por versão com vigência.
CREATE TABLE rh.estabelecimento (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj       CHAR(14) NOT NULL UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rh.estabelecimento_versao (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estabelecimento_id  BIGINT NOT NULL REFERENCES rh.estabelecimento (id),
  razao_social        TEXT NOT NULL,
  unidade             TEXT NOT NULL,     -- nome curto da unidade (ex.: "Loja Centro")
  endereco_resumido   TEXT,
  status              TEXT NOT NULL DEFAULT 'rascunho'
                      CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia     DATE NOT NULL,
  fim_vigencia        DATE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE INDEX estabelecimento_versao_por_estab
  ON rh.estabelecimento_versao (estabelecimento_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX estabelecimento_versao_uma_ativa
  ON rh.estabelecimento_versao (estabelecimento_id) WHERE status = 'ativa';
CREATE TRIGGER estabelecimento_versao_tocar BEFORE UPDATE ON rh.estabelecimento_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER estabelecimento_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.estabelecimento_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- lotação
-- Colaborador × estabelecimento × centro de custo, por vigência. Insumo da
-- apropriação da folha própria; troca de lotação encerra e abre linha nova.
CREATE TABLE rh.lotacao (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id      BIGINT NOT NULL REFERENCES rh.colaborador (id),
  estabelecimento_id  BIGINT NOT NULL REFERENCES rh.estabelecimento (id),
  centro_custo        TEXT NOT NULL,    -- código do CC (conferido contra o DW na aplicação)
  inicio_vigencia     DATE NOT NULL,
  fim_vigencia        DATE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia)
);
CREATE INDEX lotacao_por_pessoa ON rh.lotacao (colaborador_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX lotacao_uma_vigente
  ON rh.lotacao (colaborador_id) WHERE fim_vigencia IS NULL;
CREATE TRIGGER lotacao_tocar BEFORE UPDATE ON rh.lotacao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- cargo + versões com CHA
-- Cargo FUNCIONAL (identidade estável) ≠ papel de ACESSO do app.
-- Nome, descrição e CHA vivem na versão; insumo do pilar de 40% da 360.
CREATE TABLE rh.cargo (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rh.cargo_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_id         BIGINT NOT NULL REFERENCES rh.cargo (id),
  nome             TEXT NOT NULL,
  descricao        TEXT,
  -- CHA estruturado: {"conhecimentos": […], "habilidades": […], "atitudes": […]}
  cha              JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE INDEX cargo_versao_por_cargo ON rh.cargo_versao (cargo_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX cargo_versao_uma_ativa
  ON rh.cargo_versao (cargo_id) WHERE status = 'ativa';
CREATE TRIGGER cargo_versao_tocar BEFORE UPDATE ON rh.cargo_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER cargo_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.cargo_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- tabela salarial versionada
-- Faixas por cargo com vigência; alteração nunca recalcula o passado.
CREATE TABLE rh.tabela_salarial_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_id         BIGINT NOT NULL REFERENCES rh.cargo (id),
  faixa_min        NUMERIC(12,2) NOT NULL CHECK (faixa_min >= 0),
  faixa_max        NUMERIC(12,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (faixa_max >= faixa_min),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE INDEX tabela_salarial_versao_por_cargo
  ON rh.tabela_salarial_versao (cargo_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX tabela_salarial_versao_uma_ativa
  ON rh.tabela_salarial_versao (cargo_id) WHERE status = 'ativa';
CREATE TRIGGER tabela_salarial_versao_tocar BEFORE UPDATE ON rh.tabela_salarial_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER tabela_salarial_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.tabela_salarial_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- posição do colaborador — DADO SENSÍVEL
-- Cargo + salário por vigência. Salário só entra no payload de quem tem
-- rh.posicao.ver e a leitura grava audit.leitura_sensivel. Mudança = linha
-- nova (fecha a vigente, abre outra); linha encerrada é imutável (trigger).
-- cargo_versao_id pina a versão de cargo em vigor no início da posição.
-- É a fonte do salário-base no snapshot de competência da folha própria.
CREATE TABLE rh.posicao_colaborador (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id   BIGINT NOT NULL REFERENCES rh.colaborador (id),
  cargo_versao_id  BIGINT NOT NULL REFERENCES rh.cargo_versao (id),
  salario          NUMERIC(12,2) NOT NULL CHECK (salario >= 0),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia)
);
CREATE INDEX posicao_colaborador_por_pessoa
  ON rh.posicao_colaborador (colaborador_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX posicao_colaborador_uma_vigente
  ON rh.posicao_colaborador (colaborador_id) WHERE fim_vigencia IS NULL;
CREATE TRIGGER posicao_colaborador_tocar BEFORE UPDATE ON rh.posicao_colaborador
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER posicao_colaborador_congelar
  BEFORE UPDATE OR DELETE ON rh.posicao_colaborador
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_vigencia_encerrada();

-- ---------------------------------------------------------------- relação gestor → liderado
-- Fonte exclusiva de "gestor vê equipe" (e da 360): o papel gestor no login só
-- habilita telas; o alcance vem da relação vigente. Troca de gestor encerra a
-- vigência e abre outra.
CREATE TABLE rh.relacao_gestor (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gestor_colaborador_id    BIGINT NOT NULL REFERENCES rh.colaborador (id),
  liderado_colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  inicio_vigencia          DATE NOT NULL,
  fim_vigencia             DATE,
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (gestor_colaborador_id <> liderado_colaborador_id),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia)
);
CREATE INDEX relacao_gestor_equipe_vigente
  ON rh.relacao_gestor (gestor_colaborador_id) WHERE fim_vigencia IS NULL;
CREATE UNIQUE INDEX relacao_gestor_um_gestor_vigente
  ON rh.relacao_gestor (liderado_colaborador_id) WHERE fim_vigencia IS NULL;
CREATE TRIGGER relacao_gestor_tocar BEFORE UPDATE ON rh.relacao_gestor
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- ocorrência (append-only)
-- Fato datado sobre a pessoa. restrita = TRUE exige rh.ocorrencia.restrita.ver
-- (leitura logada). Gestor vê as NÃO restritas dos liderados vigentes via
-- rh.colaborador.ver — sem chave própria. Correção é registro novo.
CREATE TABLE rh.ocorrencia (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('positivo','negativo','neutro','alerta')),
  restrita        BOOLEAN NOT NULL DEFAULT FALSE,
  descricao       TEXT NOT NULL,
  impacto         TEXT,
  acao_combinada  TEXT,
  ocorrida_em     DATE NOT NULL,
  registrado_por  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  registrado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ocorrencia_por_pessoa ON rh.ocorrencia (colaborador_id, ocorrida_em DESC);
CREATE TRIGGER ocorrencia_imutavel
  BEFORE UPDATE OR DELETE ON rh.ocorrencia
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- feedback formal (append-only)
-- Cadência (padrão 90 dias) e o derivado "último feedback formal" da ficha
-- são controlados na aplicação. Correção é registro novo.
CREATE TABLE rh.feedback_formal (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  realizado_em    DATE NOT NULL,
  resumo          TEXT NOT NULL,
  registrado_por  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  registrado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX feedback_formal_por_pessoa
  ON rh.feedback_formal (colaborador_id, realizado_em DESC);
CREATE TRIGGER feedback_formal_imutavel
  BEFORE UPDATE OR DELETE ON rh.feedback_formal
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- ações abertas por pessoa
-- Acompanhamento com responsável, prazo e status; nasce de ocorrência,
-- feedback ou avulsa. Alerta de vencimento é da aplicação (n8n).
CREATE TABLE rh.acao_aberta (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  descricao       TEXT NOT NULL,
  prazo           DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'aberta'
                  CHECK (status IN ('aberta','concluida','cancelada')),
  responsavel_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX acao_aberta_por_pessoa ON rh.acao_aberta (colaborador_id, prazo);
CREATE TRIGGER acao_aberta_tocar BEFORE UPDATE ON rh.acao_aberta
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- permissões novas
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.estabelecimento.administrar', 'Gerir estabelecimentos (versões) e lotações'),
  ('rh.cargo.administrar',           'Gerir cargos, CHA e tabela salarial (versões com vigência)'),
  ('rh.posicao.ver',                 'Ver posição e salário de colaborador (sensível; leitura gera trilha)'),
  ('rh.posicao.editar',              'Registrar posição/salário de colaborador (linha nova por vigência)'),
  ('rh.gestor.administrar',          'Gerir relações gestor→liderado (vigência)'),
  ('rh.ocorrencia.registrar',        'Registrar ocorrência sobre colaborador'),
  ('rh.ocorrencia.restrita.ver',     'Ver ocorrências restritas (leitura gera trilha)'),
  ('rh.feedback.registrar',          'Registrar feedback formal');

-- Gestor vê ocorrências NÃO restritas dos liderados vigentes via
-- rh.colaborador.ver + relacao_gestor no serviço — sem chave nova.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',        'rh.estabelecimento.administrar'),
  ('dp',        'rh.cargo.administrar'),
  ('dp',        'rh.posicao.ver'),
  ('diretoria', 'rh.posicao.ver'),
  ('dp',        'rh.posicao.editar'),
  ('dp',        'rh.gestor.administrar'),
  ('rh',        'rh.gestor.administrar'),
  ('rh',        'rh.ocorrencia.registrar'),
  ('dp',        'rh.ocorrencia.registrar'),
  ('dp',        'rh.ocorrencia.restrita.ver'),
  ('diretoria', 'rh.ocorrencia.restrita.ver'),
  ('rh',        'rh.feedback.registrar'),
  ('dp',        'rh.feedback.registrar'),
  ('gestor',    'rh.feedback.registrar');

COMMIT;
