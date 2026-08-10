-- 0058_modelo_de_admissao_por_tipo_de_vinculo.sql
-- Fase 1 do GSD (Padrão Modelo) — a fatia da admissão.
--
-- Decidido com o dono (2026-08-10, docs/16): o checklist de admissão passa a
-- variar por TIPO DE VÍNCULO. Aprendiz, estagiário, CLT e PJ têm conjuntos de
-- documentos LEGALMENTE diferentes — é o corte que mais muda a lista. O doc
-- raro por cargo (CNH de motorista) entra pela linha de item extra, que já
-- existe (migration nenhuma; era a onda 0.3). Um modelo por processo, não
-- base + acréscimo.
--
-- O SINAL QUE ESTA MIGRATION DESFAZ: `checklist_admissao_versao (status) WHERE
-- status='ativa'` admitia UM modelo ativo no sistema inteiro (o `ON (status)`
-- que o mapa de eixos aponta como "só cabe um"). Passa a admitir um por
-- vínculo, mais um GERAL de fallback.
--
-- FALLBACK: `tipo_vinculo` nulo = modelo GERAL. Quem admite alguém de um vínculo
-- sem modelo próprio cai no geral — a admissão nunca fica sem checklist. O v1
-- que já existe vira o geral (fica com tipo_vinculo NULL).

BEGIN;

ALTER TABLE rh.checklist_admissao_versao
  ADD COLUMN tipo_vinculo TEXT
    CHECK (tipo_vinculo IS NULL
           OR tipo_vinculo IN ('clt', 'estagiario', 'aprendiz', 'pj'));

COMMENT ON COLUMN rh.checklist_admissao_versao.tipo_vinculo IS
  'Vínculo a que este modelo se aplica. NULL = modelo GERAL (fallback quando o '
  'vínculo do admitido não tem modelo próprio).';

-- A `versao` era única no sistema inteiro; com um modelo por vínculo, dois
-- modelos podem ambos estar na versão 1. A unicidade passa a ser POR FAMÍLIA
-- (o geral e cada vínculo têm a sua sequência de versões).
ALTER TABLE rh.checklist_admissao_versao
  DROP CONSTRAINT checklist_admissao_versao_versao_key;

CREATE UNIQUE INDEX checklist_admissao_versao_familia_versao
  ON rh.checklist_admissao_versao (COALESCE(tipo_vinculo, 'geral'), versao);

-- Uma ativa POR FAMÍLIA (COALESCE trata o geral como 'geral' — o mesmo padrão
-- da 0049, que usou COALESCE(estabelecimento_id, 0) para o "sem estabelecimento").
DROP INDEX rh.checklist_admissao_versao_uma_ativa;

CREATE UNIQUE INDEX checklist_admissao_versao_uma_ativa
  ON rh.checklist_admissao_versao (COALESCE(tipo_vinculo, 'geral'))
  WHERE status = 'ativa';

-- ---------------------------------------------------------------- permissão
-- Administrar os modelos de checklist é ato do DP (mesma família de
-- admissao.gerir). A chave nova separa "abrir/tratar processo" de "desenhar o
-- modelo" — quem trata não necessariamente desenha.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('admissao.modelo.administrar',
   'Criar e ativar modelos de checklist de admissão por tipo de vínculo')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp', 'admissao.modelo.administrar')
ON CONFLICT DO NOTHING;

COMMIT;
