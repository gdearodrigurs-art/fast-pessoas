-- 0074_modelo_de_avaliacao_por_cargo.sql
-- Fase 1 do GSD (Padrão Modelo) — a fatia da AVALIAÇÃO.
--
-- Decidido com o dono (2026-08-13; docs/16 §"O padrão modelo", docs/17 item 2):
-- o modelo de avaliação passa a variar por CARGO. O dono já havia apontado que
-- "um modelo para a empresa toda" era estreito (docs/16:603). Espelha a 0058
-- (que fez o checklist de admissão variar por tipo de vínculo): coluna nova de
-- recorte + índices de FAMÍLIA + o modelo único de hoje vira o GERAL de fallback.
--
-- Decisões do dono nesta fatia:
--   • Granularidade = CARGO (rh.cargo, identidade estável) — não cargo_versao,
--     não grupo. Quem não tem modelo próprio usa o GERAL; o RH configura o Geral
--     e só as exceções.
--   • As FAIXAS vão junto: o modelo INTEIRO (pilares, pesos e faixas) varia por
--     cargo. Nada a separar — a estrutura de hoje já pendura tudo na versão.
--   • A EXPERIÊNCIA (45/90) segue o modelo do cargo, com fallback no Geral,
--     igual ao desempenho.
--   • Administrar segue na chave avaliacao.configurar (não cria chave nova).
--
-- O SINAL QUE ESTA MIGRATION DESFAZ: dois índices `ON (status)` que só admitiam
-- UM por status no sistema inteiro —
--   modelo_avaliacao_versao_uma_ativa   (0011:51-52) e
--   modelo_avaliacao_versao_um_rascunho (0059:19-21).
-- Passam a admitir um-por-família (COALESCE(cargo_id,0)): uma ativa por cargo +
-- uma geral; um rascunho por cargo + um geral (senão desenhar N cargos vira um
-- funil de um-de-cada-vez). É o cuidado a mais frente à 0058, que só tinha o
-- índice de "uma ativa".
--
-- FALLBACK: cargo_id nulo = modelo GERAL. As versões que já existem (v1 do 0011,
-- v2 do 0030) ficam com cargo_id NULL e VIRAM o Geral — idêntico ao "v1 vira o
-- geral" da 0058:18. Nenhum ciclo já aberto muda: modelo_versao_id é CONGELADO
-- no ciclo (0011:184-189); esta migration só muda QUAL versão é escolhida na
-- próxima abertura, nunca como um ciclo aberto lê a sua.

BEGIN;

-- ---------------------------------------------------------------- recorte por cargo
ALTER TABLE rh.modelo_avaliacao_versao
  ADD COLUMN cargo_id BIGINT REFERENCES rh.cargo (id);

COMMENT ON COLUMN rh.modelo_avaliacao_versao.cargo_id IS
  'Cargo (rh.cargo, identidade estável) a que este modelo se aplica. NULL = '
  'modelo GERAL (fallback quando o cargo do avaliado não tem modelo próprio).';

-- A `versao` era única no sistema inteiro; com um modelo por cargo, dois modelos
-- podem ambos estar na versão 1. A unicidade passa a ser POR FAMÍLIA — o geral e
-- cada cargo têm a sua sequência de versões. Mesmo gesto da 0058:31-38, com
-- COALESCE(cargo_id, 0): cargo_id é BIGINT e id nunca é 0 (IDENTITY começa em 1),
-- então 0 identifica o geral sem colidir (padrão da 0049).
ALTER TABLE rh.modelo_avaliacao_versao
  DROP CONSTRAINT modelo_avaliacao_versao_versao_key;

CREATE UNIQUE INDEX modelo_avaliacao_versao_familia_versao
  ON rh.modelo_avaliacao_versao (COALESCE(cargo_id, 0), versao);

-- Uma ATIVA por família (troca o índice global de 0011:51-52).
DROP INDEX rh.modelo_avaliacao_versao_uma_ativa;
CREATE UNIQUE INDEX modelo_avaliacao_versao_uma_ativa
  ON rh.modelo_avaliacao_versao (COALESCE(cargo_id, 0))
  WHERE status = 'ativa';

-- Um RASCUNHO por família (troca o índice global de 0059:19-21).
DROP INDEX rh.modelo_avaliacao_versao_um_rascunho;
CREATE UNIQUE INDEX modelo_avaliacao_versao_um_rascunho
  ON rh.modelo_avaliacao_versao (COALESCE(cargo_id, 0))
  WHERE status = 'rascunho';

-- ---------------------------------------------------------------- prova estrutural
-- (a) os três índices de família existem e os dois parciais usam COALESCE;
-- (b) o UNIQUE(versao) global sumiu;
-- (c) toda versão pré-existente ficou como GERAL (cargo_id NULL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'rh'
                   AND indexname = 'modelo_avaliacao_versao_familia_versao') THEN
    RAISE EXCEPTION 'índice de família (cargo, versao) não foi criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'rh'
                   AND indexname = 'modelo_avaliacao_versao_uma_ativa'
                   AND indexdef LIKE '%COALESCE%') THEN
    RAISE EXCEPTION 'uma_ativa não passou a ser por-família (COALESCE)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'rh'
                   AND indexname = 'modelo_avaliacao_versao_um_rascunho'
                   AND indexdef LIKE '%COALESCE%') THEN
    RAISE EXCEPTION 'um_rascunho não passou a ser por-família (COALESCE)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'modelo_avaliacao_versao_versao_key') THEN
    RAISE EXCEPTION 'o UNIQUE(versao) global ainda existe';
  END IF;
  IF EXISTS (SELECT 1 FROM rh.modelo_avaliacao_versao WHERE cargo_id IS NOT NULL) THEN
    RAISE EXCEPTION 'esperava todas as versões pré-existentes como GERAL (cargo_id NULL)';
  END IF;
END $$;

COMMIT;
