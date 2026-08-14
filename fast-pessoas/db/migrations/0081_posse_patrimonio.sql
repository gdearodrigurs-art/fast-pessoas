-- 0081_posse_patrimonio.sql
-- Termo de POSSE de patrimônio (roadmap #3): registrar que um colaborador recebeu
-- e detém um ativo da empresa (notebook, ferramenta, carro), com aceite eletrônico
-- (ciência por hash sobre o termo no GED, molde rh.ciencia) e DEVOLUÇÃO conferida
-- no desligamento.
--
-- É a cópia da entrega de EPI (rh.epi_entrega, 0014) SEM o item de catálogo de EPI
-- (que carrega CA/validade, específicos de SST), reusando o vocabulário JÁ
-- administrável de rh.categoria_devolucao (0054) — o mesmo do checklist de
-- devolução do desligamento, para que posse e devolução falem a mesma língua e
-- não haja um segundo catálogo. Append-only seletivo: só devolvido_em e a ciência
-- mudam; o resto é imutável, DELETE proibido.

BEGIN;

CREATE TABLE rh.posse_item (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id      BIGINT NOT NULL REFERENCES rh.colaborador (id),
  categoria_chave     TEXT NOT NULL REFERENCES rh.categoria_devolucao (chave)
                      ON UPDATE CASCADE,
  -- o que é ("Notebook Dell i7", "Furadeira Bosch"); a categoria é o balde
  descricao           TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  quantidade          INT NOT NULL CHECK (quantidade >= 1),
  numero_serie        TEXT,      -- nº de série / patrimônio, opcional
  data_entrega        DATE NOT NULL,
  -- termo de entrega no GED (a ciência é dada sobre ele), molde epi_entrega
  termo_documento_id  BIGINT REFERENCES rh.documento (id),
  ciencia_registrada  BOOLEAN NOT NULL DEFAULT FALSE,
  -- NULL = em uso; preenchido uma única vez na devolução
  devolvido_em        TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (devolvido_em IS NULL OR devolvido_em::date >= data_entrega),
  -- ciência sem termo no GED não existe
  CHECK (NOT ciencia_registrada OR termo_documento_id IS NOT NULL)
);
CREATE INDEX posse_item_por_pessoa
  ON rh.posse_item (colaborador_id, data_entrega DESC);
-- Pendências de devolução (consulta do checklist de desligamento)
CREATE INDEX posse_item_pendente_devolucao
  ON rh.posse_item (colaborador_id) WHERE devolvido_em IS NULL;

COMMENT ON TABLE rh.posse_item IS
  'Patrimônio da empresa em posse do colaborador (notebook, ferramenta, carro). '
  'Cópia da entrega de EPI sem o item de EPI; categoria administrável reusa '
  'rh.categoria_devolucao. Append-only: só devolução e ciência mudam.';

-- Categoria inativa não entra em posse NOVA (item existente segue editável).
CREATE FUNCTION rh.exigir_categoria_posse_ativa() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.categoria_chave IS NOT DISTINCT FROM OLD.categoria_chave THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM rh.categoria_devolucao c
              WHERE c.chave = NEW.categoria_chave AND c.inativado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'categoria "%" está inativa — escolha uma ativa', NEW.categoria_chave;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER posse_item_categoria_ativa
  BEFORE INSERT OR UPDATE ON rh.posse_item
  FOR EACH ROW EXECUTE FUNCTION rh.exigir_categoria_posse_ativa();

-- Append-only seletivo, cópia de rh.epi_entrega_travar: só devolvido_em e ciência.
CREATE FUNCTION rh.posse_item_travar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'posse de item é append-only: DELETE não permitido';
  END IF;
  IF NEW.colaborador_id     IS DISTINCT FROM OLD.colaborador_id
     OR NEW.categoria_chave    IS DISTINCT FROM OLD.categoria_chave
     OR NEW.descricao          IS DISTINCT FROM OLD.descricao
     OR NEW.quantidade         IS DISTINCT FROM OLD.quantidade
     OR NEW.numero_serie       IS DISTINCT FROM OLD.numero_serie
     OR NEW.data_entrega       IS DISTINCT FROM OLD.data_entrega
     OR NEW.termo_documento_id IS DISTINCT FROM OLD.termo_documento_id
     OR NEW.criado_em          IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION
      'posse é imutável: só devolvido_em (devolução) e ciencia_registrada (ciência) mudam — correção é registro novo';
  END IF;
  IF OLD.devolvido_em IS NOT NULL
     AND NEW.devolvido_em IS DISTINCT FROM OLD.devolvido_em THEN
    RAISE EXCEPTION 'devolução já registrada não se altera';
  END IF;
  IF OLD.ciencia_registrada AND NOT NEW.ciencia_registrada THEN
    RAISE EXCEPTION 'ciência registrada não se desfaz';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER posse_item_travar BEFORE UPDATE OR DELETE ON rh.posse_item
  FOR EACH ROW EXECUTE FUNCTION rh.posse_item_travar();
CREATE TRIGGER posse_item_tocar BEFORE UPDATE ON rh.posse_item
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- permissões
-- Posse é menos sensível que disciplinar: dp e rh registram/veem. A admin do
-- catálogo de itens REUSA desligamento.categoria.administrar (0054) — sem chave nova.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.posse.ver',       'Ver posse de patrimônio de colaborador'),
  ('rh.posse.registrar', 'Registrar entrega/devolução de patrimônio de colaborador');
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp', 'rh.posse.ver'),
  ('rh', 'rh.posse.ver'),
  ('dp', 'rh.posse.registrar'),
  ('rh', 'rh.posse.registrar');

-- ---------------------------------------------------------------- prova
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='rh' AND table_name='posse_item') THEN
    RAISE EXCEPTION 'rh.posse_item não foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sistema.papel_permissao
                  WHERE chave='rh.posse.registrar' AND papel='dp') THEN
    RAISE EXCEPTION 'dp deveria ter rh.posse.registrar';
  END IF;
  RAISE NOTICE 'posse: tabela + 2 chaves (dp/rh); catálogo reusa categoria_devolucao';
END $$;

COMMIT;
