-- 0004_clima.sql
-- Clima (rh_clima): check-in diário confidencial com acesso restrito
-- (decisão do usuário 2026-07-27, docs/03-modulos/06-clima.md).
-- Resposta VINCULADA ao colaborador; leitura individual (conteúdo + autor) só pela
-- chave clima.resposta.individual.ver (diretoria), com trilha em audit.leitura_sensivel;
-- demais papéis veem apenas agregados (clima.agregado.ver).
-- As chaves de permissão do clima já existem desde a 0001 — nada a inserir aqui.

BEGIN;

-- ---------------------------------------------------------------- pergunta (versionada com vigência)
-- Enunciado publicado é imutável: mudança de texto = versão nova.
-- rascunho -> ativa -> encerrada; versão encerrada nunca sofre UPDATE.
CREATE TABLE rh_clima.pergunta_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  texto            TEXT NOT NULL CHECK (btrim(texto) <> ''),
  ordem            SMALLINT NOT NULL CHECK (ordem > 0),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'ativa' OR inicio_vigencia IS NOT NULL),
  CHECK (status <> 'encerrada' OR (inicio_vigencia IS NOT NULL AND fim_vigencia IS NOT NULL)),
  CHECK (fim_vigencia IS NULL OR (inicio_vigencia IS NOT NULL AND fim_vigencia >= inicio_vigencia))
);
-- ordem única entre as versões ativas (ordenação estável da tela do check-in)
CREATE UNIQUE INDEX pergunta_versao_ordem_ativa
  ON rh_clima.pergunta_versao (ordem) WHERE status = 'ativa';

-- Cinto e suspensório: encerrada é imutável; texto só muda em rascunho; sem DELETE fora de rascunho.
CREATE FUNCTION rh_clima.pergunta_versao_proteger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'pergunta_versao: versão % não é rascunho e não pode ser excluída', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'encerrada' THEN
    RAISE EXCEPTION 'pergunta_versao: versão % está encerrada e é imutável', OLD.id;
  END IF;
  IF OLD.status <> 'rascunho' AND NEW.texto IS DISTINCT FROM OLD.texto THEN
    RAISE EXCEPTION 'pergunta_versao: enunciado publicado é imutável (crie uma versão nova)';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pergunta_versao_proteger
  BEFORE UPDATE OR DELETE ON rh_clima.pergunta_versao
  FOR EACH ROW EXECUTE FUNCTION rh_clima.pergunta_versao_proteger();
CREATE TRIGGER pergunta_versao_tocar
  BEFORE UPDATE ON rh_clima.pergunta_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- resposta do check-in (append-only)
-- Escala de 5 emojis: 1 chorando … 5 sorrindo com estrelas. Comentário sempre opcional.
-- Uma resposta por colaborador, por pergunta, por dia (violação vira 409 na aplicação).
CREATE TABLE rh_clima.checkin_resposta (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id      BIGINT NOT NULL REFERENCES rh.colaborador (id),
  pergunta_versao_id  BIGINT NOT NULL REFERENCES rh_clima.pergunta_versao (id),
  data_referencia     DATE NOT NULL,
  nota                SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario          TEXT CHECK (comentario IS NULL OR btrim(comentario) <> ''),
  registrado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checkin_resposta_unica_no_dia
    UNIQUE (colaborador_id, pergunta_versao_id, data_referencia)
);
-- agregados por pergunta × dia (dashboards de tendência)
CREATE INDEX checkin_resposta_por_dia
  ON rh_clima.checkin_resposta (pergunta_versao_id, data_referencia);

CREATE TRIGGER checkin_resposta_imutavel
  BEFORE UPDATE OR DELETE ON rh_clima.checkin_resposta
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- seed das perguntas decididas
INSERT INTO rh_clima.pergunta_versao (texto, ordem, status, inicio_vigencia) VALUES
  ('Como você está se sentindo hoje?',                      1, 'ativa', CURRENT_DATE),
  ('Como você tem se sentido a respeito de suas entregas?', 2, 'ativa', CURRENT_DATE);

COMMIT;
