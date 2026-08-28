-- 0101_expurgo_pesquisa_social_no_ged.sql
-- Conserto A3 da revisão adversarial (com A2/G3:a): o EXPURGO da pesquisa
-- social era impossível — o DELETE do anexo em rh.documento batia no trigger
-- documento_imutavel (0086), que usa audit.bloquear_mutacao() e RAISE
-- INCONDICIONAL. A obrigação legal da retenção (0096: apagar o anexo aos 6
-- meses do descarte) nunca conseguia rodar.
--
-- O conserto: rh.documento ganha função de trava PRÓPRIA, com UMA exceção
-- estreita — DELETE passa SOMENTE quando o documento é da categoria
-- 'pesquisa_social' (a categoria própria e oculta que o app grava desde o A2).
-- Todo o resto continua exatamente como era: UPDATE barrado para todos
-- (inclusive pesquisa social) e DELETE barrado para toda outra categoria.
-- audit.bloquear_mutacao() segue INTACTA para as demais tabelas append-only.
--
-- Categoria no banco: rh.documento.categoria é TEXT sem CHECK (0006) — o
-- domínio é o enum do TS. Por isso esta migration não estende domínio nenhum:
-- ela é só o trigger.

BEGIN;

CREATE FUNCTION rh.documento_bloquear_mutacao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Exceção ESTREITA (A3): o expurgo da retenção da pesquisa social (G3:a,
  -- 6 meses após o descarte) é o único DELETE legítimo em rh.documento —
  -- o BYTEA do anexo sai junto com a linha. Nada mais passa.
  IF TG_OP = 'DELETE' AND OLD.categoria = 'pesquisa_social' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'tabela append-only: % não permite %', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER documento_imutavel ON rh.documento;
CREATE TRIGGER documento_imutavel
  BEFORE UPDATE OR DELETE ON rh.documento
  FOR EACH ROW EXECUTE FUNCTION rh.documento_bloquear_mutacao();

COMMENT ON FUNCTION rh.documento_bloquear_mutacao() IS
  'Trava de imutabilidade de rh.documento (0086) com a exceção do expurgo '
  '(A3/G3:a): DELETE passa só para categoria ''pesquisa_social''; UPDATE e '
  'todo outro DELETE seguem barrados.';

-- ---------------------------------------------------------------- prova
-- Subtransação revertida (molde 0096): deletar documento comum BARRA; deletar
-- anexo de pesquisa social PASSA; UPDATE segue barrado até na pesquisa social.
DO $$
DECLARE
  v_usuario BIGINT;
  v_comum   BIGINT;
  v_ps      BIGINT;
  pegou     TEXT;
BEGIN
  SELECT min(id) INTO v_usuario FROM sistema.usuario;
  IF v_usuario IS NULL THEN
    RAISE NOTICE '0101: sem usuário no banco — prova funcional pulada';
    RETURN;
  END IF;

  pegou := 'nada';
  BEGIN
    INSERT INTO rh.documento
      (categoria, titulo, nome_arquivo, mime, tamanho_bytes, conteudo,
       hash_sha256, enviado_por_usuario)
    VALUES
      ('politica', 'prova 0101 comum', 'p.txt', 'text/plain', 1,
       '\x20'::bytea, repeat('a', 64), v_usuario)
    RETURNING id INTO v_comum;
    INSERT INTO rh.documento
      (categoria, titulo, nome_arquivo, mime, tamanho_bytes, conteudo,
       hash_sha256, enviado_por_usuario, sensivel)
    VALUES
      ('pesquisa_social', 'prova 0101 anexo', 'laudo.pdf', 'application/pdf',
       1, '\x20'::bytea, repeat('b', 64), v_usuario, TRUE)
    RETURNING id INTO v_ps;

    -- 1) documento comum continua imutável: DELETE barra
    BEGIN
      DELETE FROM rh.documento WHERE id = v_comum;
      RAISE EXCEPTION '0101: DELETE de documento comum deveria ser barrado'
        USING ERRCODE = '45998';
    EXCEPTION
      WHEN sqlstate '45998' THEN RAISE;
      WHEN raise_exception THEN NULL; -- esperado: a trava mordeu
    END;

    -- 2) UPDATE segue barrado até na pesquisa social (só o DELETE do expurgo passa)
    BEGIN
      UPDATE rh.documento SET titulo = 'reescrito' WHERE id = v_ps;
      RAISE EXCEPTION '0101: UPDATE em pesquisa social deveria ser barrado'
        USING ERRCODE = '45998';
    EXCEPTION
      WHEN sqlstate '45998' THEN RAISE;
      WHEN raise_exception THEN NULL; -- esperado
    END;

    -- 3) o expurgo do anexo PASSA — e a linha (com o BYTEA) some de verdade
    DELETE FROM rh.documento WHERE id = v_ps;
    IF EXISTS (SELECT 1 FROM rh.documento WHERE id = v_ps) THEN
      RAISE EXCEPTION '0101: DELETE da pesquisa social não apagou a linha'
        USING ERRCODE = '45998';
    END IF;

    RAISE EXCEPTION 'limpeza da prova' USING ERRCODE = '45999';
  EXCEPTION
    WHEN sqlstate '45999' THEN pegou := 'ok';  -- chegou ao fim; tudo revertido
    WHEN OTHERS THEN pegou := SQLERRM;
  END;
  IF pegou <> 'ok' THEN
    RAISE EXCEPTION '0101: prova do trigger falhou (%).', pegou;
  END IF;

  RAISE NOTICE '0101: trava de rh.documento provada — só o expurgo da pesquisa social deleta';
END $$;

COMMIT;
