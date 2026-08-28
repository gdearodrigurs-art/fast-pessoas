-- 0096_pesquisa_social.sql
-- Pesquisa social (pendência #13c, decisão G3:a de docs/20) — etapa comum do
-- catálogo de seleção com DESFECHO binário + anexo no GED.
--
-- O desenho aceito: "Pesquisa social" é uma ETAPA do catálogo
-- (rh.etapa_selecao_versao), opcional POR MODELO — nenhum modelo existente a
-- recebe aqui; o DP a posiciona (antes da Oferta) nos modelos que quiser, pela
-- tela de modelos (criar/reformular). Nascer "inativa" significa exatamente
-- isso: disponível no catálogo, presente em ZERO modelos — o pipeline de
-- ninguém muda com esta migration.
--
-- O DESFECHO (aprovado/reprovado) vive em rh.pesquisa_social, 0..1 por
-- candidatura. O ANEXO mora no GED (rh.documento) na categoria "outro" — SEM
-- categoria nova, por decisão do dono — com o vínculo aqui (documento_id).
-- Privacidade (G3:a): anexo e desfecho visíveis só a rs.gerir COM trilha de
-- leitura sensível (aplicação); o documento é gravado como sensivel=TRUE para
-- que o acervo geral do GED não o exiba a todo logado.
--
-- Retenção (G3:a, N=6): o anexo é APAGADO (linha de rh.documento — o BYTEA vai
-- junto) e o desfecho ANONIMIZADO (resultado -> NULL + expurgado_em) quando a
-- candidatura recusada/desistente completa 6 meses de descarte. A rotina é a
-- função de domínio expurgarPesquisasSociais (rota administrativa manual — o
-- projeto não tem agendador; cron é follow-up). O audit nunca é tocado (0012).

BEGIN;

-- ---------------------------------------------------------------- tipo novo no catálogo de etapas
-- Os tipos vivem num CHECK inline da 0012; o nome do constraint é o
-- determinístico do Postgres (tabela_coluna_check).
ALTER TABLE rh.etapa_selecao_versao
  DROP CONSTRAINT etapa_selecao_versao_tipo_check;
ALTER TABLE rh.etapa_selecao_versao
  ADD CONSTRAINT etapa_selecao_versao_tipo_check CHECK (tipo IN
    ('triagem','entrevista_rh','entrevista_gestor','oferta','pesquisa_social'));

-- A ordem do catálogo é EXIBIÇÃO (desde a 0077 a candidatura anda pela ordem
-- DO MODELO): abre-se espaço antes da Oferta para a etapa nova aparecer na
-- posição natural do desenho (#13c: "antes da Oferta"). A versão ativa da
-- oferta pode ser atualizada (rh.bloquear_versao_encerrada só congela
-- encerradas); o índice de ordem única entre ativas exige mover a oferta antes.
UPDATE rh.etapa_selecao_versao
   SET ordem = 5
 WHERE tipo = 'oferta' AND status = 'ativa' AND ordem = 4;

INSERT INTO rh.etapa_selecao_versao (tipo, versao, ordem, nome, status, inicio_vigencia)
VALUES ('pesquisa_social', 1, 4, 'Pesquisa social', 'ativa', rh.hoje());

-- ---------------------------------------------------------------- desfecho da pesquisa social
-- 0..1 por candidatura (UNIQUE). `resultado` é NOT NULL na prática enquanto a
-- linha está viva; o EXPURGO anonimiza (resultado -> NULL, documento_id ->
-- NULL, expurgado_em preenchido) — o CHECK amarra os três estados.
CREATE TABLE rh.pesquisa_social (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidatura_id  BIGINT NOT NULL UNIQUE REFERENCES rh.candidatura (id),
  resultado       TEXT CHECK (resultado IN ('aprovado','reprovado')),
  -- Anexo no GED (categoria "outro", sensivel=TRUE) — apagado no expurgo.
  documento_id    BIGINT REFERENCES rh.documento (id),
  registrado_por  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expurgado_em    TIMESTAMPTZ,
  -- viva tem resultado; expurgada não tem resultado nem anexo
  CHECK ((expurgado_em IS NULL) = (resultado IS NOT NULL)),
  CHECK (expurgado_em IS NULL OR documento_id IS NULL)
);
CREATE INDEX pesquisa_social_por_documento
  ON rh.pesquisa_social (documento_id) WHERE documento_id IS NOT NULL;

-- Sem permissão nova: registrar/ler/expurgar é rs.gerir (decisão G3:a), com
-- trilha de leitura sensível gravada pela aplicação (molde do valor da oferta).

-- ---------------------------------------------------------------- prova
DO $$
DECLARE
  v_etapa    BIGINT;
  v_usuario  BIGINT;
  v_cargo    BIGINT;
  v_cv       BIGINT;
  v_req      BIGINT;
  v_vaga     BIGINT;
  v_cand     BIGINT;
  v_ca       BIGINT;
  v_padrao   BIGINT;
  pegou      TEXT;
BEGIN
  -- 1) A etapa nova existe, ativa, ANTES da oferta na exibição do catálogo…
  SELECT id INTO v_etapa
    FROM rh.etapa_selecao_versao
   WHERE tipo = 'pesquisa_social' AND status = 'ativa';
  IF v_etapa IS NULL THEN
    RAISE EXCEPTION '0096: etapa pesquisa_social não foi semeada ativa';
  END IF;
  IF (SELECT ordem FROM rh.etapa_selecao_versao WHERE id = v_etapa)
     >= (SELECT ordem FROM rh.etapa_selecao_versao WHERE tipo = 'oferta' AND status = 'ativa') THEN
    RAISE EXCEPTION '0096: pesquisa_social deveria exibir ANTES da oferta no catálogo';
  END IF;
  -- …e em NENHUM modelo (opcional de verdade: pipeline de ninguém mudou).
  IF EXISTS (SELECT 1 FROM rh.modelo_selecao_etapa WHERE etapa_selecao_versao_id = v_etapa) THEN
    RAISE EXCEPTION '0096: a etapa nova não deveria entrar em modelo nenhum no seed';
  END IF;

  -- 2) Tipo desconhecido continua barrado pelo CHECK reescrito.
  pegou := 'nada';
  BEGIN
    INSERT INTO rh.etapa_selecao_versao (tipo, versao, ordem, nome, status, inicio_vigencia)
    VALUES ('grafologia', 1, 99, 'Prova 0096', 'rascunho', rh.hoje());
    pegou := 'passou sem barrar';
  EXCEPTION WHEN check_violation THEN
    pegou := 'ok';
  END;
  IF pegou <> 'ok' THEN
    RAISE EXCEPTION '0096: tipo fora do catálogo não foi barrado (%).', pegou;
  END IF;

  -- 3) Cena completa numa SUBTRANSAÇÃO revertida (molde 0088): candidatura na
  --    etapa nova recebe desfecho; os CHECKs do desfecho e do expurgo valem.
  pegou := 'nada';
  BEGIN
    SELECT id INTO v_padrao
      FROM rh.modelo_selecao_versao WHERE padrao AND status = 'ativa';
    INSERT INTO sistema.usuario (email, nome, papel)
    VALUES ('prova-0096@invalido.local', 'Prova 0096', 'dp')
    RETURNING id INTO v_usuario;
    INSERT INTO rh.cargo DEFAULT VALUES RETURNING id INTO v_cargo;
    INSERT INTO rh.cargo_versao (cargo_id, nome, status, inicio_vigencia)
    VALUES (v_cargo, 'Cargo da prova 0096', 'ativa', rh.hoje())
    RETURNING id INTO v_cv;
    INSERT INTO rh.requisicao_vaga
      (cargo_versao_id, motivo, justificativa, solicitante_usuario_id)
    VALUES (v_cv, 'reposicao', 'Prova da 0096', v_usuario)
    RETURNING id INTO v_req;
    INSERT INTO rh.vaga
      (requisicao_id, titulo, faixa_min, faixa_max, prazo_alvo, modelo_versao_id)
    VALUES (v_req, 'Prova da 0096', 1000, 2000, rh.hoje(), v_padrao)
    RETURNING id INTO v_vaga;
    INSERT INTO rh.candidato (nome, email, origem, consentimento_lgpd)
    VALUES ('Candidata da Prova 0096', 'prova-0096-cand@invalido.local', 'outro', true)
    RETURNING id INTO v_cand;
    INSERT INTO rh.candidatura (vaga_id, candidato_id, etapa_atual_id)
    VALUES (v_vaga, v_cand, v_etapa)
    RETURNING id INTO v_ca;

    -- 3a) resultado fora do binário é barrado
    BEGIN
      INSERT INTO rh.pesquisa_social (candidatura_id, resultado, registrado_por)
      VALUES (v_ca, 'talvez', v_usuario);
      RAISE EXCEPTION '0096: resultado fora do binário deveria ser barrado';
    EXCEPTION WHEN check_violation THEN
      NULL; -- esperado
    END;

    -- 3b) desfecho registra; o segundo desfecho da MESMA candidatura é barrado
    INSERT INTO rh.pesquisa_social (candidatura_id, resultado, registrado_por)
    VALUES (v_ca, 'reprovado', v_usuario);
    BEGIN
      INSERT INTO rh.pesquisa_social (candidatura_id, resultado, registrado_por)
      VALUES (v_ca, 'aprovado', v_usuario);
      RAISE EXCEPTION '0096: desfecho duplicado deveria ser barrado (UNIQUE)';
    EXCEPTION WHEN unique_violation THEN
      NULL; -- esperado
    END;

    -- 3c) expurgo pela metade (expurgado_em sem anonimizar) é barrado…
    BEGIN
      UPDATE rh.pesquisa_social SET expurgado_em = now()
       WHERE candidatura_id = v_ca;
      RAISE EXCEPTION '0096: expurgo sem anonimizar o resultado deveria ser barrado';
    EXCEPTION WHEN check_violation THEN
      NULL; -- esperado
    END;
    -- …e o expurgo inteiro (resultado e anexo zerados juntos) passa.
    UPDATE rh.pesquisa_social
       SET resultado = NULL, documento_id = NULL, expurgado_em = now()
     WHERE candidatura_id = v_ca;

    RAISE EXCEPTION 'limpeza da prova' USING ERRCODE = '45999';
  EXCEPTION
    WHEN sqlstate '45999' THEN pegou := 'ok';  -- chegou ao fim sem trinco
    WHEN OTHERS THEN pegou := SQLERRM;
  END;
  IF pegou <> 'ok' THEN
    RAISE EXCEPTION '0096: cena do desfecho falhou (%).', pegou;
  END IF;
END $$;

COMMIT;
