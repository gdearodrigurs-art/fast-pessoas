-- 0071_trincos_amigaveis_400.sql
-- Pendência #8 (8b e 8c): dois "trincos de banco" (BEFORE INSERT/UPDATE) que hoje
-- estouram RAISE genérico → 500 feio, quando deviam ser 4xx amigável. Ambos são
-- FAILS-SAFE (nenhuma linha ruim entra), então é UX/observabilidade, não perda de
-- dado. A correção: dar a eles um SQLSTATE da classe '45' — livre no PostgreSQL,
-- reservada AQUI para "trinco de negócio: recuse com 400 e mostre a mensagem" — e
-- mapear UMA vez em src/lib/http.ts (responderErro), que toda rota já usa. Assim
-- cobre os DOIS caminhos (DP e autoatendimento) sem tocar em cada serviço.
--
--   8c (trigger da 0054): item de devolução com categoria inativada no meio → 45001.
--   8b (trigger novo):     dependente com data de nascimento no FUTURO → 45002.

BEGIN;

-- ---------------------------------------------------------------- 8c: categoria de devolução
-- Mesma regra da 0054; só ganha o SQLSTATE-sentinela (a 0054 é imutável, então é
-- CREATE OR REPLACE em migration nova).
CREATE OR REPLACE FUNCTION rh.exigir_categoria_devolucao_ativa() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM rh.categoria_devolucao c
              WHERE c.chave = NEW.categoria AND c.inativado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'categoria de devolução "%" está inativa — escolha uma ativa',
      NEW.categoria
      USING ERRCODE = '45001';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- 8b: nascimento do dependente
-- Data de nascimento não pode ser no futuro. O trinco no banco cobre os DOIS
-- caminhos (a tela do DP e o autoatendimento do portal, que usam esquemas
-- diferentes) num lugar só. Em UPDATE, só checa se a data MUDOU — editar outro
-- campo de um cadastro antigo nunca é bloqueado.
CREATE FUNCTION rh.exigir_dependente_nascimento_nao_futuro() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.nascimento IS NOT DISTINCT FROM OLD.nascimento THEN
    RETURN NEW;
  END IF;
  IF NEW.nascimento > rh.hoje() THEN
    RAISE EXCEPTION 'data de nascimento não pode ser no futuro'
      USING ERRCODE = '45002';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dependente_nascimento_nao_futuro
  BEFORE INSERT OR UPDATE ON rh.dependente
  FOR EACH ROW EXECUTE FUNCTION rh.exigir_dependente_nascimento_nao_futuro();

-- ---------------------------------------------------------------- prova (revertida)
-- O trinco novo (8b) recusa nascimento futuro com o SQLSTATE certo. Num savepoint
-- que a exceção reverte — não deixa lixo.
DO $$
DECLARE
  alguem BIGINT;
  pegou  TEXT := 'nada';
BEGIN
  SELECT id INTO alguem FROM rh.colaborador ORDER BY id LIMIT 1;
  BEGIN
    INSERT INTO rh.dependente (colaborador_id, nome, nascimento, parentesco)
    VALUES (alguem, 'Prova Futuro', rh.hoje() + 1, 'filho');
  EXCEPTION WHEN sqlstate '45002' THEN
    pegou := 'ok';
  END;
  IF pegou <> 'ok' THEN
    RAISE EXCEPTION 'trinco 8b não recusou nascimento futuro como esperado (%).', pegou;
  END IF;
END $$;

COMMIT;
