-- 0080_disciplinar.sql
-- Módulo DISCIPLINAR (roadmap #3): registrar uma medida disciplinar (advertência,
-- suspensão) sobre um colaborador, de forma TIPADA, ADMINISTRÁVEL, AUDITÁVEL e
-- RESTRITA — substituindo o hoje-informal "ocorrência restrita = disciplinar".
--
-- Decisões do dono (as três confirmadas; ver docs/pendencias):
--   • TIPOS = catálogo administrável (molde rh.categoria_devolucao, 0054), NUNCA
--     CHECK IN (...) chumbado no código (eixo 9). Semente: advertência verbal,
--     advertência escrita, suspensão — o dono acrescenta pela tela.
--   • A advertência é fato PONTUAL; a suspensão abre JANELA de datas (molde
--     rh.afastamento) — mas a folha NÃO desconta os dias automaticamente ainda:
--     a integração suspensão→folha é decisão de dinheiro (eixo 5) e sobe à parte
--     (pendência já aberta em folha/repositorio.ts). Aqui grava-se e exibe-se a
--     janela; o efeito financeiro vem depois.
--   • ESCALONAMENTO manual (o DP vê o histórico e decide) — sem limiar chumbado.
--   • VISIBILIDADE: conteúdo disciplinar é sempre restrito a dp/diretoria (chave
--     rh.disciplinar.ver, leitura logada). Gestor NÃO vê.
--
-- A medida é append-only SELETIVO: como a suspensão precisa poder fechar o `fim`
-- (cedo, ou no desligamento — eixo 10), NÃO se usa o audit.bloquear_mutacao da
-- ocorrência (lock total), e sim o molde do EPI (rh.epi_entrega_travar): só o
-- `fim` muda; o resto é imutável, DELETE proibido.

BEGIN;

-- ---------------------------------------------------------------- catálogo de tipos (administrável, molde 0054)
CREATE TABLE rh.tipo_medida_disciplinar (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave          TEXT NOT NULL UNIQUE CHECK (chave ~ '^[a-z][a-z0-9_]*$'),
  nome           TEXT NOT NULL CHECK (btrim(nome) <> ''),
  ordem          INT NOT NULL DEFAULT 500,
  -- marca o tipo que abre JANELA de datas (a suspensão). Atributo do tipo, não
  -- uma lista chumbada de "quais tipos têm período".
  com_periodo    BOOLEAN NOT NULL DEFAULT FALSE,
  inativado_em   TIMESTAMPTZ,
  inativado_por  BIGINT REFERENCES sistema.usuario (id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((inativado_em IS NULL) = (inativado_por IS NULL))
);
CREATE TRIGGER tipo_medida_disciplinar_tocar BEFORE UPDATE ON rh.tipo_medida_disciplinar
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE rh.tipo_medida_disciplinar IS
  'Tipos de medida disciplinar (advertência verbal/escrita, suspensão…), '
  'administrável pela tela (eixo 9). NUNCA se apaga — inativa-se; a chave está '
  'gravada em rh.medida_disciplinar.tipo_chave.';

-- Exclusão é o que esta tabela não tem (a chave está no histórico de medidas).
CREATE FUNCTION rh.bloquear_exclusao_tipo_medida_disciplinar() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'tipo de medida disciplinar "%" não se apaga — inative. A chave está gravada no histórico.',
    OLD.chave;
END;
$$;
CREATE TRIGGER tipo_medida_disciplinar_nunca_apaga
  BEFORE DELETE ON rh.tipo_medida_disciplinar
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_exclusao_tipo_medida_disciplinar();

-- Semente: os três tipos confirmados pelo dono. Catálogo aberto (o dono
-- acrescenta "comunicado formal", "termo de ajuste de conduta", etc. pela tela).
INSERT INTO rh.tipo_medida_disciplinar (chave, nome, ordem, com_periodo) VALUES
  ('advertencia_verbal',  'Advertência verbal',  10, FALSE),
  ('advertencia_escrita', 'Advertência escrita', 20, FALSE),
  ('suspensao',           'Suspensão',           30, TRUE);

-- ---------------------------------------------------------------- registro (append-only SELETIVO, molde epi_entrega_travar)
-- Fato datado sobre o colaborador; sempre conteúdo restrito (servido só por
-- rh.disciplinar.ver). A suspensão abre janela (inicio/fim); a advertência é
-- pontual (inicio/fim NULL). Só o `fim` é mutável.
CREATE TABLE rh.medida_disciplinar (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  tipo_chave      TEXT NOT NULL REFERENCES rh.tipo_medida_disciplinar (chave)
                  ON UPDATE CASCADE,
  descricao       TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  impacto         TEXT,
  acao_combinada  TEXT,
  aplicada_em     DATE NOT NULL,          -- a data do fato
  -- janela da suspensão (NULL nos tipos pontuais); molde rh.afastamento.
  inicio          DATE,
  fim             DATE,
  registrado_por  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  registrado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- fim só existe com inicio, e não antecede o inicio
  CHECK (fim IS NULL OR (inicio IS NOT NULL AND fim >= inicio))
);
CREATE INDEX medida_disciplinar_por_pessoa
  ON rh.medida_disciplinar (colaborador_id, aplicada_em DESC);
-- Suspensão em curso (janela aberta) — o desligamento fecha estas (eixo 10).
CREATE INDEX medida_disciplinar_suspensao_aberta
  ON rh.medida_disciplinar (colaborador_id) WHERE inicio IS NOT NULL AND fim IS NULL;

-- Só o `fim` muda (fechar a suspensão). Molde do EPI, não o lock total da
-- ocorrência (audit.bloquear_mutacao proíbe todo UPDATE, e aqui a janela precisa
-- poder fechar).
CREATE FUNCTION rh.medida_disciplinar_travar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'medida disciplinar é append-only: DELETE não permitido';
  END IF;
  IF NEW.colaborador_id   IS DISTINCT FROM OLD.colaborador_id
     OR NEW.tipo_chave     IS DISTINCT FROM OLD.tipo_chave
     OR NEW.descricao      IS DISTINCT FROM OLD.descricao
     OR NEW.impacto        IS DISTINCT FROM OLD.impacto
     OR NEW.acao_combinada IS DISTINCT FROM OLD.acao_combinada
     OR NEW.aplicada_em    IS DISTINCT FROM OLD.aplicada_em
     OR NEW.inicio         IS DISTINCT FROM OLD.inicio
     OR NEW.registrado_por IS DISTINCT FROM OLD.registrado_por
     OR NEW.registrado_em  IS DISTINCT FROM OLD.registrado_em THEN
    RAISE EXCEPTION
      'medida disciplinar é imutável: só o fim da suspensão muda — correção é registro novo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER medida_disciplinar_travar
  BEFORE UPDATE OR DELETE ON rh.medida_disciplinar
  FOR EACH ROW EXECUTE FUNCTION rh.medida_disciplinar_travar();
CREATE TRIGGER medida_disciplinar_tocar BEFORE UPDATE ON rh.medida_disciplinar
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- Só tipo ATIVO em medida NOVA (item existente segue editável mesmo se o tipo
-- for inativado depois — o passado não deixa de ser verdade).
CREATE FUNCTION rh.exigir_tipo_medida_disciplinar_ativo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tipo_chave IS NOT DISTINCT FROM OLD.tipo_chave THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM rh.tipo_medida_disciplinar t
              WHERE t.chave = NEW.tipo_chave AND t.inativado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'tipo de medida disciplinar "%" está inativo — escolha um ativo',
      NEW.tipo_chave;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER medida_disciplinar_tipo_ativo
  BEFORE INSERT OR UPDATE ON rh.medida_disciplinar
  FOR EACH ROW EXECUTE FUNCTION rh.exigir_tipo_medida_disciplinar_ativo();

-- ---------------------------------------------------------------- permissões (eixo 4 — chave, não papel; molde ocorrência restrita)
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.disciplinar.ver',              'Ver medidas disciplinares (conteúdo sensível; leitura gera trilha)'),
  ('rh.disciplinar.registrar',        'Registrar medida disciplinar sobre colaborador'),
  ('rh.disciplinar.tipo.administrar', 'Gerir o catálogo de tipos de medida disciplinar');

-- Só dp e diretoria (espelha rh.ocorrencia.restrita.ver). Gestor NÃO vê conteúdo.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',        'rh.disciplinar.ver'),
  ('diretoria', 'rh.disciplinar.ver'),
  ('dp',        'rh.disciplinar.registrar'),
  ('diretoria', 'rh.disciplinar.registrar'),
  ('dp',        'rh.disciplinar.tipo.administrar');

-- ---------------------------------------------------------------- prova
DO $$
DECLARE
  v_tipos INT;
BEGIN
  SELECT count(*) INTO v_tipos FROM rh.tipo_medida_disciplinar
   WHERE chave IN ('advertencia_verbal','advertencia_escrita','suspensao')
     AND inativado_em IS NULL;
  IF v_tipos <> 3 THEN
    RAISE EXCEPTION 'esperava os 3 tipos semeados ativos, achei %', v_tipos;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rh.tipo_medida_disciplinar WHERE chave='suspensao' AND com_periodo) THEN
    RAISE EXCEPTION 'suspensão deveria ter com_periodo = TRUE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sistema.papel_permissao
                  WHERE chave='rh.disciplinar.ver' AND papel='dp') THEN
    RAISE EXCEPTION 'dp deveria ter rh.disciplinar.ver';
  END IF;
  RAISE NOTICE 'disciplinar: 3 tipos ativos, 3 chaves semeadas (dp/diretoria)';
END $$;

COMMIT;
