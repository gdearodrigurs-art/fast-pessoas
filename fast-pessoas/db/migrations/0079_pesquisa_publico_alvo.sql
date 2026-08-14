-- 0079_pesquisa_publico_alvo.sql
-- Pesquisa de clima MIRADA num público-alvo (pendência #6 do roadmap; tarefa #176).
--
-- Hoje toda pesquisa vai para a casa inteira. Esta migration deixa a pesquisa
-- ESTREITAR o público por um recorte CONJUNTIVO (E) de até quatro dimensões:
-- empresa (registro), estabelecimento (lotação), centro de custo e cargo. Os
-- QUATRO NULL = pesquisa da empresa toda, o comportamento anterior à 0079 —
-- toda pesquisa já existente nasce com os quatro NULL, então nada muda para
-- elas. Qualquer coluna preenchida estreita em E ("empresa X E cargo Vendedor").
--
-- O alvo guarda CRITÉRIO (ids), não a lista de pessoas: a elegibilidade se
-- resolve ao vivo pela lotação/cargo VIGENTE de cada um (eixo 10), então
-- transferência no meio da janela não deixa ponteiro morto.
--
-- Identidade de lugar/cargo por id (eixo 2): cargo_id aponta para rh.cargo (a
-- identidade estável do cargo), NUNCA rh.cargo_versao (que muda a cada
-- renomeação); os de estrutura apontam para as entidades, não para versões.

BEGIN;

ALTER TABLE rh_clima.pesquisa
  ADD COLUMN empresa_id         BIGINT REFERENCES rh.empresa_grupo (id),
  ADD COLUMN estabelecimento_id BIGINT REFERENCES rh.estabelecimento (id),
  ADD COLUMN centro_custo_id    BIGINT REFERENCES rh.centro_custo (id),
  ADD COLUMN cargo_id           BIGINT REFERENCES rh.cargo (id);

COMMENT ON COLUMN rh_clima.pesquisa.empresa_id IS
  'Público-alvo (0079): recorte por registro (empresa do grupo). NULL = não '
  'estreita por empresa. Os quatro *_id NULL = pesquisa da casa inteira '
  '(comportamento anterior à 0079); qualquer coluna preenchida estreita em E.';

-- O público-alvo congela ao abrir, como o questionário já congela (a função
-- pergunta_pesquisa_congelar): mexer no alvo depois de a pesquisa poder receber
-- resposta moveria o denominador de um resultado em curso. Estende a proteção
-- que já barra aberta->rascunho e a edição/exclusão de encerrada.
CREATE OR REPLACE FUNCTION rh_clima.pesquisa_proteger() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'pesquisa: % já foi aberta e não pode ser excluída', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'encerrada' THEN
    RAISE EXCEPTION 'pesquisa: % está encerrada e é imutável', OLD.id;
  END IF;
  IF OLD.status = 'aberta' AND NEW.status = 'rascunho' THEN
    RAISE EXCEPTION 'pesquisa: aberta não volta para rascunho';
  END IF;
  -- Público-alvo é imutável fora do rascunho: o denominador não se move sob uma
  -- pesquisa que já pode ter resposta.
  IF OLD.status <> 'rascunho' AND (
       NEW.empresa_id         IS DISTINCT FROM OLD.empresa_id OR
       NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id OR
       NEW.centro_custo_id    IS DISTINCT FROM OLD.centro_custo_id OR
       NEW.cargo_id           IS DISTINCT FROM OLD.cargo_id
     ) THEN
    RAISE EXCEPTION 'pesquisa: público-alvo congelado ao abrir (pesquisa %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- prova
DO $$
DECLARE
  v_cols INT;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'rh_clima' AND table_name = 'pesquisa'
     AND column_name IN ('empresa_id','estabelecimento_id','centro_custo_id','cargo_id');
  IF v_cols <> 4 THEN
    RAISE EXCEPTION 'esperava as 4 colunas de alvo, achei %', v_cols;
  END IF;
  -- Toda pesquisa que já existia tem os quatro NULL (empresa toda) — regressão.
  IF EXISTS (
    SELECT 1 FROM rh_clima.pesquisa
     WHERE empresa_id IS NOT NULL OR estabelecimento_id IS NOT NULL
        OR centro_custo_id IS NOT NULL OR cargo_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'pesquisa pré-0079 deveria ter alvo NULL';
  END IF;
END $$;

COMMIT;
