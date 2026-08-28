-- 0083_posse_trinco_amigavel.sql
-- Retrofit no molde da 0071: o trigger rh.exigir_categoria_posse_ativa (0081)
-- nasceu com RAISE EXCEPTION SEM ERRCODE — fora da convenção de "trinco de
-- negócio" (SQLSTATE classe '45') que a 0071 estabeleceu e que mensagemDoTrinco
-- (src/lib/http.ts) traduz em 400 amigável. Sem o código, a janela "categoria
-- inativada entre o check do serviço e o INSERT" viraria 500 cru (achado da
-- revisão da fatia Posse). A 0081 já foi aplicada e é imutável; correção é esta
-- migration nova. Código: 45003 (45001 = categoria de devolução; 45002 =
-- nascimento futuro de dependente).

BEGIN;

CREATE OR REPLACE FUNCTION rh.exigir_categoria_posse_ativa() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.categoria_chave IS NOT DISTINCT FROM OLD.categoria_chave THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM rh.categoria_devolucao c
              WHERE c.chave = NEW.categoria_chave AND c.inativado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'categoria "%" está inativa — escolha uma ativa', NEW.categoria_chave
      USING ERRCODE = '45003';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- prova
-- O trinco dispara com o código certo: categoria inativada no meio recusa o
-- INSERT com SQLSTATE 45003 (subtransação, nada persiste).
DO $$
DECLARE
  v_colab BIGINT;
BEGIN
  SELECT id INTO v_colab FROM rh.colaborador WHERE status = 'ativo' LIMIT 1;
  IF v_colab IS NULL THEN
    RAISE NOTICE 'sem colaborador ativo para provar o trinco — pulando (função trocada mesmo assim)';
    RETURN;
  END IF;
  UPDATE rh.categoria_devolucao
     SET inativado_em = now(), inativado_por = (SELECT id FROM sistema.usuario LIMIT 1)
   WHERE chave = 'outro' AND inativado_em IS NULL;
  BEGIN
    INSERT INTO rh.posse_item (colaborador_id, categoria_chave, descricao, quantidade, data_entrega)
    VALUES (v_colab, 'outro', 'prova do trinco', 1, rh.hoje());
    RAISE EXCEPTION 'trinco NÃO disparou — deveria recusar categoria inativa';
  EXCEPTION
    WHEN sqlstate '45003' THEN
      RAISE NOTICE 'trinco 45003 ok: %', SQLERRM;
  END;
  UPDATE rh.categoria_devolucao
     SET inativado_em = NULL, inativado_por = NULL
   WHERE chave = 'outro';
END;
$$;

COMMIT;
