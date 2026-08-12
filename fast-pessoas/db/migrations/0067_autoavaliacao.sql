-- 0067_autoavaliacao.sql
-- Autoavaliação como PAPEL próprio dentro do MESMO ciclo — decisões do dono (12/08/2026):
--
--   • PESO      — a autoavaliação é PERSPECTIVA, não NOTA. A nota oficial continua
--                 saindo SÓ da avaliação do líder; a 'auto' alimenta os pontos cegos
--                 (auto × líder) e o PDI, e NUNCA entra na média. Regra anti-inflar.
--   • MOMENTO   — CEGA: o colaborador responde sem ver o resultado do líder (se visse,
--                 copiava e o ponto cego sumia). O bloqueio de leitura é do serviço;
--                 aqui o dado só PERMITE a cegueira (a auto vive em linha separada).
--   • OBRIGAT.  — obrigatória SÓ nos ciclos de desempenho. Experiência (45/90) segue
--                 só com o líder: o prazo legal da experiência (CLT 443/445/451) não
--                 pode ficar refém de o recém-admitido responder a própria avaliação.
--
-- O QUE MUDA NO MODELO: rh.avaliacao deixa de ser 1:1 com o ciclo (era 'um a um no
-- MVP', 0011 linha 226). Ganha 'papel' ('lider'|'auto') e 'avaliador_colaborador_id'
-- (quem preencheu). Some o UNIQUE de coluna de ciclo_id; entra UNIQUE(ciclo_id, papel)
-- — cabem exatamente as duas perspectivas, nunca duas do mesmo papel. A FK de ciclo_id
-- permanece. A consolidação (que o líder dispara ao enviar, no mundo 1:1) passa a
-- exigir, nos ciclos de DESEMPENHO, líder E auto enviadas; o serviço separa ENVIO de
-- CONSOLIDAÇÃO (o segundo envio a fechar o par é quem consolida, sobre a nota do líder).
--
-- O QUE NÃO MUDA: a nota oficial sai do líder; o resultado consolidado segue 1:1 com o
-- ciclo (rh.resultado_avaliacao continua com UNIQUE(ciclo_id)); experiência inalterada.
-- Motor, leitura cega, rotas e tela vêm nos slices seguintes — aqui só o dado e as travas.

BEGIN;

-- ---------------------------------------------------------------- (1) papel + avaliador
-- papel nasce 'lider' por DEFAULT: toda linha existente É do líder, e o código que
-- ainda não conhece papel continua criando a do líder por omissão até ser corrigido.
ALTER TABLE rh.avaliacao
  ADD COLUMN papel TEXT NOT NULL DEFAULT 'lider'
    CHECK (papel IN ('lider','auto')),
  ADD COLUMN avaliador_colaborador_id BIGINT REFERENCES rh.colaborador (id);

COMMENT ON COLUMN rh.avaliacao.papel IS
  'Perspectiva desta avaliação no ciclo: lider (nota oficial) ou auto '
  '(autoavaliação do próprio colaborador — perspectiva, nunca entra na nota).';
COMMENT ON COLUMN rh.avaliacao.avaliador_colaborador_id IS
  'Quem preenche esta avaliação: no papel lider é o avaliador designado do ciclo; '
  'no papel auto é o PRÓPRIO avaliado (o colaborador do ciclo). Coerência por trigger.';

-- Backfill: toda avaliação que já existe é do líder; o avaliador é o do ciclo.
UPDATE rh.avaliacao a
   SET avaliador_colaborador_id = ca.avaliador_colaborador_id
  FROM rh.ciclo_avaliacao ca
 WHERE ca.id = a.ciclo_id;

-- Preenchido o backfill, o avaliador passa a ser obrigatório.
ALTER TABLE rh.avaliacao
  ALTER COLUMN avaliador_colaborador_id SET NOT NULL;

-- ---------------------------------------------------------------- (2) unicidade (ciclo → ciclo,papel)
-- O UNIQUE de coluna nasceu do 'NOT NULL UNIQUE' da 0011 (nome auto-gerado). Descubro
-- e removo SÓ o unique de (ciclo_id) — a FK de ciclo_id (constraint separada) fica.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'rh.avaliacao'::regclass
     AND contype = 'u'
     AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'rh.avaliacao'::regclass
                            AND attname = 'ciclo_id')];
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE rh.avaliacao DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

-- Exatamente uma avaliação por (ciclo, papel): cabem líder + auto, nunca duas iguais.
CREATE UNIQUE INDEX avaliacao_um_por_papel ON rh.avaliacao (ciclo_id, papel);

-- ---------------------------------------------------------------- (3) coerência papel × avaliador
-- CHECK de coluna não enxerga o ciclo (colaborador/avaliador moram em ciclo_avaliacao),
-- então a regra é trigger — e é CONDICIONAL ao papel, o oposto do CHECK
-- avaliador<>colaborador da ciclo_avaliacao (0011 linha 204), que continua valendo lá.
CREATE FUNCTION rh.avaliacao_papel_coerente() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_colaborador BIGINT;
  v_avaliador   BIGINT;
BEGIN
  SELECT colaborador_id, avaliador_colaborador_id
    INTO v_colaborador, v_avaliador
    FROM rh.ciclo_avaliacao WHERE id = NEW.ciclo_id;
  IF NEW.papel = 'auto' AND NEW.avaliador_colaborador_id <> v_colaborador THEN
    RAISE EXCEPTION
      'autoavaliação (papel=auto) do ciclo % tem de ser preenchida pelo próprio avaliado',
      NEW.ciclo_id;
  END IF;
  IF NEW.papel = 'lider' AND NEW.avaliador_colaborador_id <> v_avaliador THEN
    RAISE EXCEPTION
      'avaliação do líder do ciclo % tem de ser preenchida pelo avaliador designado',
      NEW.ciclo_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER avaliacao_papel_coerente
  BEFORE INSERT OR UPDATE ON rh.avaliacao
  FOR EACH ROW EXECUTE FUNCTION rh.avaliacao_papel_coerente();

-- ---------------------------------------------------------------- (4) consolidação exige a auto (desempenho)
-- Substitui rh.resultado_exigir_avaliacao_enviada (0011 linhas 362-370): antes bastava
-- EXISTIR uma avaliação enviada (mundo 1:1). Agora: SEMPRE exige a do líder; nos ciclos
-- de DESEMPENHO exige TAMBÉM a auto (autoavaliação obrigatória). A trigger que a chama
-- (resultado_avaliacao_exigir_envio) não muda — CREATE OR REPLACE mantém o vínculo.
CREATE OR REPLACE FUNCTION rh.resultado_exigir_avaliacao_enviada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tipo TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rh.avaliacao a
                  WHERE a.ciclo_id = NEW.ciclo_id
                    AND a.papel = 'lider' AND a.estado = 'enviada') THEN
    RAISE EXCEPTION 'ciclo % sem avaliação do líder enviada: consolidação bloqueada', NEW.ciclo_id;
  END IF;
  SELECT tipo INTO v_tipo FROM rh.ciclo_avaliacao WHERE id = NEW.ciclo_id;
  IF v_tipo = 'desempenho'
     AND NOT EXISTS (SELECT 1 FROM rh.avaliacao a
                      WHERE a.ciclo_id = NEW.ciclo_id
                        AND a.papel = 'auto' AND a.estado = 'enviada') THEN
    RAISE EXCEPTION 'ciclo % de desempenho sem autoavaliação enviada: consolidação bloqueada', NEW.ciclo_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- (5) auto para ciclos de desempenho já vivos
-- Ciclos de DESEMPENHO ainda abertos ganham AGORA a linha 'auto' (rascunho), para
-- poderem consolidar sob a regra nova em vez de ficarem órfãos. Experiência não recebe
-- auto (decisão do dono). Ciclos já consolidados/decididos não são tocados (têm resultado).
INSERT INTO rh.avaliacao (ciclo_id, papel, avaliador_colaborador_id)
SELECT ca.id, 'auto', ca.colaborador_id
  FROM rh.ciclo_avaliacao ca
 WHERE ca.tipo = 'desempenho'
   AND ca.status IN ('aberto','em_avaliacao')
   AND NOT EXISTS (SELECT 1 FROM rh.avaliacao a
                    WHERE a.ciclo_id = ca.id AND a.papel = 'auto');

-- ---------------------------------------------------------------- (6) permissão de autoavaliar
-- Self-service: alvo sempre o colaborador da sessão (o serviço confere), nunca a
-- requisição. Cega ao líder — não vê nem toca a avaliação do líder nem o resultado.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('avaliacao.autoavaliar',
   'Responder a PRÓPRIA autoavaliação de um ciclo (papel=auto; alvo sempre o '
   'colaborador da sessão). Cega ao resultado do líder — não vê nem altera a '
   'avaliação do líder.');

-- Todo mundo que é gente da casa se autoavalia. A lista espelha o CHECK de
-- sistema.usuario.papel (0019) — os 8 papéis.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('funcionario', 'avaliacao.autoavaliar'),
  ('gestor',      'avaliacao.autoavaliar'),
  ('rh',          'avaliacao.autoavaliar'),
  ('recrutador',  'avaliacao.autoavaliar'),
  ('lider_td',    'avaliacao.autoavaliar'),
  ('dp',          'avaliacao.autoavaliar'),
  ('diretoria',   'avaliacao.autoavaliar'),
  ('admin',       'avaliacao.autoavaliar');

-- ---------------------------------------------------------------- provas finais
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='rh' AND table_name='avaliacao' AND column_name='papel') THEN
    RAISE EXCEPTION 'rh.avaliacao.papel ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='rh' AND table_name='avaliacao' AND column_name='avaliador_colaborador_id') THEN
    RAISE EXCEPTION 'rh.avaliacao.avaliador_colaborador_id ausente';
  END IF;
  -- o unique de (ciclo_id) sozinho NÃO pode mais existir
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid='rh.avaliacao'::regclass AND contype='u'
                AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                     WHERE attrelid='rh.avaliacao'::regclass AND attname='ciclo_id')]) THEN
    RAISE EXCEPTION 'UNIQUE(ciclo_id) sozinho ainda existe — deveria ser (ciclo_id, papel)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='rh' AND indexname='avaliacao_um_por_papel') THEN
    RAISE EXCEPTION 'índice avaliacao_um_por_papel ausente';
  END IF;
  -- nenhuma avaliação ficou sem avaliador após o backfill
  IF EXISTS (SELECT 1 FROM rh.avaliacao WHERE avaliador_colaborador_id IS NULL) THEN
    RAISE EXCEPTION 'há avaliação sem avaliador após o backfill';
  END IF;
  -- a permissão foi concedida aos 8 papéis
  IF (SELECT count(*) FROM sistema.papel_permissao WHERE chave='avaliacao.autoavaliar') <> 8 THEN
    RAISE EXCEPTION 'avaliacao.autoavaliar não foi concedida exatamente aos 8 papéis';
  END IF;
END $$;

COMMIT;
