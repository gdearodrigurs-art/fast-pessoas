-- 0076_modelo_de_selecao.sql
-- Fatia RECRUTAMENTO do Padrão Modelo (docs/17 item 2; pendência #13), Estágio 1.
--
-- Decidido com o dono (pendência #13): a VAGA escolhe um modelo de processo
-- seletivo, com um GERAL pré-selecionado. Diferente das outras fatias, aqui a
-- entidade "modelo" NÃO existia — rh.etapa_selecao_versao (0012) fundia catálogo
-- e modelo num conjunto único e global. Esta migration cria a peça que faltava,
-- de forma ADITIVA: o pipeline do kanban NÃO muda ainda (isso é o Estágio 2).
--
--   • rh.modelo_selecao_versao — um processo seletivo nomeado e versionado. Um é
--     o `padrao` (o GERAL, pré-selecionado na criação da vaga). Reformular =
--     versão nova (continua_de aponta pra anterior); a vaga congela a versão que
--     escolheu, então o desenho pode mudar sem mexer em vaga já aberta.
--   • rh.modelo_selecao_etapa — a SELEÇÃO e ORDEM de etapas do catálogo
--     (rh.etapa_selecao_versao) que compõem o modelo. É o que a candidatura vai
--     percorrer (Estágio 2), no lugar da lista global viva.
--
-- Administrar segue na chave rs.gerir (quem gere recrutamento desenha o
-- processo) — sem chave nova.

BEGIN;

-- ---------------------------------------------------------------- modelo de processo (versão com vigência)
CREATE TABLE rh.modelo_selecao_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome             TEXT NOT NULL CHECK (btrim(nome) <> ''),
  -- o modelo GERAL, pré-selecionado na criação da vaga. No máximo um ativo.
  padrao           BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE,
  fim_vigencia     DATE,
  -- versão anterior que ESTE modelo reformula (série linear, como o clima 0075).
  continua_de      BIGINT REFERENCES rh.modelo_selecao_versao (id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'ativa' OR inicio_vigencia IS NOT NULL),
  CHECK (status <> 'encerrada' OR (inicio_vigencia IS NOT NULL AND fim_vigencia IS NOT NULL)),
  CHECK (fim_vigencia IS NULL OR (inicio_vigencia IS NOT NULL AND fim_vigencia >= inicio_vigencia))
);
-- No máximo UM modelo padrão ativo (o GERAL que a vaga usa por default).
CREATE UNIQUE INDEX modelo_selecao_um_padrao_ativo
  ON rh.modelo_selecao_versao (padrao) WHERE padrao AND status = 'ativa';
-- Série linear: duas versões não reformulam a mesma anterior (0075).
CREATE UNIQUE INDEX modelo_selecao_continua_de_unica
  ON rh.modelo_selecao_versao (continua_de) WHERE continua_de IS NOT NULL;
CREATE TRIGGER modelo_selecao_versao_tocar BEFORE UPDATE ON rh.modelo_selecao_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER modelo_selecao_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.modelo_selecao_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- etapas do modelo (seleção + ordem do catálogo)
CREATE TABLE rh.modelo_selecao_etapa (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modelo_versao_id         BIGINT NOT NULL REFERENCES rh.modelo_selecao_versao (id),
  etapa_selecao_versao_id  BIGINT NOT NULL REFERENCES rh.etapa_selecao_versao (id),
  ordem                    INT NOT NULL CHECK (ordem >= 1),
  UNIQUE (modelo_versao_id, ordem),
  UNIQUE (modelo_versao_id, etapa_selecao_versao_id)
);
CREATE INDEX modelo_selecao_etapa_por_modelo
  ON rh.modelo_selecao_etapa (modelo_versao_id, ordem);

-- ---------------------------------------------------------------- seed do GERAL
-- O modelo padrão nasce com as etapas ATIVAS de hoje, na ordem de hoje — assim
-- o Estágio 2 (a vaga apontar pro modelo) reproduz exatamente o pipeline atual.
WITH geral AS (
  INSERT INTO rh.modelo_selecao_versao (nome, padrao, status, inicio_vigencia)
  VALUES ('Processo padrão', true, 'ativa', rh.hoje())
  RETURNING id
)
INSERT INTO rh.modelo_selecao_etapa (modelo_versao_id, etapa_selecao_versao_id, ordem)
SELECT geral.id, e.id, e.ordem
  FROM geral, rh.etapa_selecao_versao e
 WHERE e.status = 'ativa';

-- ---------------------------------------------------------------- prova estrutural
DO $$
DECLARE
  v_etapas_ativas INT;
  v_etapas_geral  INT;
BEGIN
  SELECT count(*) INTO v_etapas_ativas
    FROM rh.etapa_selecao_versao WHERE status = 'ativa';
  SELECT count(*) INTO v_etapas_geral
    FROM rh.modelo_selecao_etapa me
    JOIN rh.modelo_selecao_versao m ON m.id = me.modelo_versao_id
   WHERE m.padrao AND m.status = 'ativa';
  IF v_etapas_geral <> v_etapas_ativas THEN
    RAISE EXCEPTION 'GERAL deveria ter as % etapas ativas, tem %', v_etapas_ativas, v_etapas_geral;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rh.modelo_selecao_versao WHERE padrao AND status='ativa') THEN
    RAISE EXCEPTION 'nenhum modelo padrão ativo após o seed';
  END IF;
END $$;

COMMIT;
