-- 0085_campos_da_pessoa_e_nivel_do_cargo.sql
-- Fase 4 (Visibilidade em camadas), fatia 4 — três campos novos, cada um no
-- lugar que a decisão do dono (docs/20) mandou:
--
--   A7:b  telefone/e-mail corporativo são DA PESSOA, não do vínculo. Verdade
--         em rh.pessoa, seguindo o desenho da 0046 — e SEM coluna projetada no
--         vínculo, de propósito: a projeção da 0046 existiu para não reescrever
--         145 consultas legadas de uma vez; campo NOVO não tem legado, então
--         nasce já na direção do contract (leitura via JOIN em rh.pessoa).
--
--   A5:b  raça-cor padrão IBGE, AUTODECLARADA pela pessoa (portal). NULL =
--         nunca declarou; 'prefiro_nao_declarar' = declarou que não declara —
--         são estados diferentes e os dois aparecem como tal. O DP VÊ o dado
--         individual na ficha (decisão de privacidade registrada do dono), com
--         trilha de leitura sensível (molde salário/ASO, chave
--         rh.colaborador.sensivel.ver); o agregado do painel continua
--         respeitando o piso k — nada muda lá.
--
--   A6:a  nível hierárquico do cargo em CATÁLOGO ADMINISTRÁVEL (eixo 9 — nada
--         chumbado), coluna na VERSÃO do cargo (muda com o tempo, vigência
--         preservada), administrado na tela de cargos.

BEGIN;

-- ---------------------------------------------------------------- a pessoa (A7:b + A5:b)
ALTER TABLE rh.pessoa
  ADD COLUMN telefone_corporativo TEXT,
  ADD COLUMN email_corporativo    TEXT,
  -- IBGE + a recusa explícita. NULL = ainda não declarado (estado honesto de
  -- toda a base atual — nenhum backfill inventa declaração por ninguém).
  ADD COLUMN raca_cor TEXT
    CHECK (raca_cor IS NULL OR raca_cor IN
           ('branca','preta','parda','amarela','indigena','prefiro_nao_declarar'));

COMMENT ON COLUMN rh.pessoa.telefone_corporativo IS
  'Contato corporativo DA PESSOA (decisão A7:b) — o mesmo em todos os vínculos. Faz parte do crachá público (A4:a).';
COMMENT ON COLUMN rh.pessoa.email_corporativo IS
  'E-mail corporativo DA PESSOA (decisão A7:b). Não confundir com sistema.usuario.email (o login). Faz parte do crachá público (A4:a).';
COMMENT ON COLUMN rh.pessoa.raca_cor IS
  'Raça-cor padrão IBGE, AUTODECLARADA pela pessoa no portal (A5:b). NULL = nunca declarada. Leitura individual só com rh.colaborador.sensivel.ver, sempre com trilha; agregado respeita o piso k.';

-- ---------------------------------------------------------------- nível hierárquico (A6:a)
CREATE TABLE rh.nivel_hierarquico (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome           TEXT NOT NULL UNIQUE CHECK (btrim(nome) <> ''),
  ordem          INT NOT NULL DEFAULT 500,
  inativado_em   TIMESTAMPTZ,
  inativado_por  BIGINT REFERENCES sistema.usuario (id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((inativado_em IS NULL) = (inativado_por IS NULL))
);
CREATE TRIGGER nivel_hierarquico_tocar BEFORE UPDATE ON rh.nivel_hierarquico
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE rh.nivel_hierarquico IS
  'Catálogo administrável de níveis hierárquicos de cargo (A6:a — eixo 9, nada chumbado). Nunca se apaga — inativa-se; versões de cargo antigas continuam apontando.';

-- Exclusão não existe: versão de cargo antiga continua apontando (molde 0080).
CREATE FUNCTION rh.bloquear_exclusao_nivel_hierarquico() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'nível hierárquico "%" não se apaga — inative. Versões de cargo apontam para ele.',
    OLD.nome;
END;
$$;
CREATE TRIGGER nivel_hierarquico_nunca_apaga
  BEFORE DELETE ON rh.nivel_hierarquico
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_exclusao_nivel_hierarquico();

-- Semente inicial — catálogo ABERTO: o dono renomeia, inativa e acrescenta
-- pela tela de cargos. Nenhuma regra do código depende destes nomes.
INSERT INTO rh.nivel_hierarquico (nome, ordem) VALUES
  ('Diretoria',              10),
  ('Gerência',               20),
  ('Coordenação/Supervisão', 30),
  ('Operacional',            40);

-- A coluna vive na VERSÃO do cargo: mudar o nível é versão nova com vigência,
-- a anterior fica congelada apontando para o nível que valia na época.
ALTER TABLE rh.cargo_versao
  ADD COLUMN nivel_hierarquico_id BIGINT REFERENCES rh.nivel_hierarquico (id);

COMMENT ON COLUMN rh.cargo_versao.nivel_hierarquico_id IS
  'Nível hierárquico do cargo NESTA versão (A6:a). NULL = ainda não classificado. Catálogo em rh.nivel_hierarquico.';

-- Só nível ATIVO em versão NOVA (versão antiga segue apontando para o dela).
CREATE FUNCTION rh.exigir_nivel_hierarquico_ativo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nivel_hierarquico_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.nivel_hierarquico_id IS NOT DISTINCT FROM OLD.nivel_hierarquico_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM rh.nivel_hierarquico n
              WHERE n.id = NEW.nivel_hierarquico_id AND n.inativado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'nível hierárquico inativo — escolha um ativo ou reative-o';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cargo_versao_nivel_ativo
  BEFORE INSERT OR UPDATE ON rh.cargo_versao
  FOR EACH ROW EXECUTE FUNCTION rh.exigir_nivel_hierarquico_ativo();

-- ---------------------------------------------------------------- prova
DO $$
DECLARE
  v_niveis INT;
  v_declaradas BIGINT;
BEGIN
  SELECT count(*) INTO v_niveis FROM rh.nivel_hierarquico WHERE inativado_em IS NULL;
  IF v_niveis <> 4 THEN
    RAISE EXCEPTION 'esperava 4 níveis hierárquicos semeados ativos, achei %', v_niveis;
  END IF;

  -- Nenhum backfill declara raça-cor por ninguém: a base nasce toda NULL.
  SELECT count(*) INTO v_declaradas FROM rh.pessoa WHERE raca_cor IS NOT NULL;
  IF v_declaradas <> 0 THEN
    RAISE EXCEPTION 'raça-cor deveria nascer sem declaração; % linha(s) preenchidas', v_declaradas;
  END IF;

  -- O CHECK recusa valor fora do padrão IBGE (só dá para provar com gente na
  -- base — numa bancada recém-criada, antes do semear, o CHECK fica declarado
  -- e a prova ao vivo é a do próprio semear/uso).
  IF EXISTS (SELECT 1 FROM rh.pessoa) THEN
    BEGIN
      UPDATE rh.pessoa SET raca_cor = 'invalida'
       WHERE id = (SELECT min(id) FROM rh.pessoa);
      RAISE EXCEPTION 'o CHECK de raca_cor deixou passar valor fora do padrão IBGE';
    EXCEPTION
      WHEN check_violation THEN NULL; -- é o esperado
    END;
  END IF;

  -- Nível inativo não entra em versão nova de cargo (trinco do trigger).
  RAISE NOTICE 'pessoa: contato corporativo + raça-cor (IBGE, NULL) · cargo_versao: nível hierárquico com catálogo de 4';
END $$;

COMMIT;
