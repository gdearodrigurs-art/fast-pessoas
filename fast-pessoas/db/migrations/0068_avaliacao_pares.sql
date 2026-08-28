-- 0068_avaliacao_pares.sql
-- 360 de PARES — a terceira perspectiva do ciclo, sobre a máquina de papéis da 0067.
-- Decisões do dono (12/08/2026):
--
--   • QUEM ESCOLHE — o GESTOR (avaliador do ciclo) seleciona os pares (colegas que
--                    trabalham com o avaliado). Um só dono do fluxo.
--   • ANONIMATO    — as respostas dos pares são ANÔNIMAS e AGREGADAS, com PISO
--                    mínimo: só revela o agregado se houver ao menos k respostas
--                    (k = sistema.parametro_privacidade.minimo_por_recorte, o mesmo
--                    piso administrável do clima/pesquisas). Par identificado
--                    amaciaria a nota — o piso é do serviço, aqui só o dado permite.
--   • ESCOPO       — OPCIONAL e só em ciclos de DESEMPENHO. Se os pares não
--                    responderem, o ciclo consolida assim mesmo (a nota é do líder):
--                    os pares NÃO gatilham a consolidação. Experiência fica de fora.
--   • PESO         — como a auto, o par é PERSPECTIVA, não NOTA. Alimenta a visão
--                    360 e os pontos cegos do PDI; nunca entra na média oficial.
--
-- O QUE MUDA NO MODELO: rh.avaliacao.papel ganha 'par'. Diferente de líder/auto
-- (um por ciclo), os pares são VÁRIOS por ciclo — um por avaliador. A unicidade
-- vira DUAS parciais: uma para o par oficial (líder+auto, um de cada) e outra para
-- os pares (um por avaliador, sem repetir a mesma pessoa). A consolidação (0067)
-- NÃO é tocada: pares são opcionais.

BEGIN;

-- ---------------------------------------------------------------- (1) papel ganha 'par'
-- O CHECK de coluna nasceu inline na 0067 com o nome canônico do Postgres
-- (<tabela>_<coluna>_check = avaliacao_papel_check). Troco pelo que admite 'par'.
ALTER TABLE rh.avaliacao DROP CONSTRAINT avaliacao_papel_check;
ALTER TABLE rh.avaliacao
  ADD CONSTRAINT avaliacao_papel_check CHECK (papel IN ('lider','auto','par'));

COMMENT ON COLUMN rh.avaliacao.papel IS
  'Perspectiva desta avaliação no ciclo: lider (nota oficial), auto (o próprio '
  'colaborador) ou par (colega selecionado pelo gestor). Só a do líder vira nota; '
  'auto e par são perspectiva (pontos cegos / 360). Há um líder e uma auto por '
  'ciclo; pares são vários (um por avaliador).';

-- ---------------------------------------------------------------- (2) unicidade: oficial × pares
-- Antes: um por (ciclo, papel). Agora, para caber N pares: DUAS parciais —
--   (a) líder e auto: um de cada por ciclo;
--   (b) par: um por avaliador (a mesma pessoa não avalia o colega duas vezes).
DROP INDEX IF EXISTS rh.avaliacao_um_por_papel;

CREATE UNIQUE INDEX avaliacao_um_oficial_por_ciclo
  ON rh.avaliacao (ciclo_id, papel)
  WHERE papel IN ('lider','auto');

CREATE UNIQUE INDEX avaliacao_par_unico_por_avaliador
  ON rh.avaliacao (ciclo_id, avaliador_colaborador_id)
  WHERE papel = 'par';

-- ---------------------------------------------------------------- (3) coerência do 'par'
-- líder = o avaliador designado; auto = o próprio avaliado; par = ALGUÉM QUE NÃO É
-- nem o avaliado nem o líder (senão vira autoavaliação ou a avaliação do líder por
-- outro nome). CREATE OR REPLACE mantém o gatilho da 0067 apontando para cá.
CREATE OR REPLACE FUNCTION rh.avaliacao_papel_coerente() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW.papel = 'par'
     AND (NEW.avaliador_colaborador_id = v_colaborador
          OR NEW.avaliador_colaborador_id = v_avaliador) THEN
    RAISE EXCEPTION
      'par do ciclo % não pode ser o próprio avaliado nem o líder do ciclo',
      NEW.ciclo_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- (4) permissões
-- gerir = o gestor seleciona/remove os pares do ciclo que ele avalia (escopo de
-- avaliador conferido no serviço). avaliar_par = o colega responde a avaliação de
-- par que lhe pediram (todo papel pode ser par; escopo = ser par designado).
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('avaliacao.par.gerir',
   'Selecionar e remover os pares que avaliam um colaborador no ciclo (só o '
   'avaliador do ciclo; par nunca é o avaliado nem o líder).'),
  ('avaliacao.avaliar_par',
   'Responder a avaliação de PAR que lhe foi pedida (papel=par; cega ao líder, '
   'à auto e ao resultado). Escopo sempre o par designado da sessão.');

-- gerir: quem conduz avaliação (gestor) e o DP/RH.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('gestor', 'avaliacao.par.gerir'),
  ('rh',     'avaliacao.par.gerir'),
  ('dp',     'avaliacao.par.gerir');

-- avaliar_par: todo mundo que é gente da casa pode ser par (espelha os 8 papéis).
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('funcionario', 'avaliacao.avaliar_par'),
  ('gestor',      'avaliacao.avaliar_par'),
  ('rh',          'avaliacao.avaliar_par'),
  ('recrutador',  'avaliacao.avaliar_par'),
  ('lider_td',    'avaliacao.avaliar_par'),
  ('dp',          'avaliacao.avaliar_par'),
  ('diretoria',   'avaliacao.avaliar_par'),
  ('admin',       'avaliacao.avaliar_par');

-- ---------------------------------------------------------------- provas finais
DO $$
BEGIN
  -- 'par' passou a ser aceito
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'rh.avaliacao'::regclass AND conname = 'avaliacao_papel_check'
       AND pg_get_constraintdef(oid) ILIKE '%par%'
  ) THEN
    RAISE EXCEPTION 'CHECK de papel não admite ''par''';
  END IF;
  -- as duas parciais existem, e a antiga (ciclo,papel) não
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname='rh' AND indexname='avaliacao_um_por_papel') THEN
    RAISE EXCEPTION 'índice antigo avaliacao_um_por_papel ainda existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='rh' AND indexname='avaliacao_um_oficial_por_ciclo') THEN
    RAISE EXCEPTION 'índice avaliacao_um_oficial_por_ciclo ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='rh' AND indexname='avaliacao_par_unico_por_avaliador') THEN
    RAISE EXCEPTION 'índice avaliacao_par_unico_por_avaliador ausente';
  END IF;
  -- permissões concedidas
  IF (SELECT count(*) FROM sistema.papel_permissao WHERE chave='avaliacao.par.gerir') < 3 THEN
    RAISE EXCEPTION 'avaliacao.par.gerir não foi concedida';
  END IF;
  IF (SELECT count(*) FROM sistema.papel_permissao WHERE chave='avaliacao.avaliar_par') <> 8 THEN
    RAISE EXCEPTION 'avaliacao.avaliar_par não foi concedida aos 8 papéis';
  END IF;
END $$;

COMMIT;
