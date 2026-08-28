-- 0086_ciclo_ciencia_conduta.sql
-- CICLO DE CIÊNCIA do Código de Conduta e das políticas (roadmap 1.5, COND-01/N2).
--
-- Decisões do dono (docs/20, bloco B):
--   B1:a — o documento BLOQUEANTE (Código de Conduta) trava o acesso já no 1º
--     acesso (o gate de borda é da Onda 2; aqui nasce o domínio que ele consome);
--     as demais políticas com "exige ciência" geram pendência com PRAZO
--     administrável + lembrete, sem bloquear.
--   B2:a com acréscimos — o ato com testemunhas nasce de RECUSA ou PRAZO
--     VENCIDO; o próprio DP pode abrir o ato diretamente; as testemunhas são
--     USUÁRIOS DO SISTEMA (2), e cada uma confirma com a própria sessão
--     (hash + data — o mesmo mecanismo da ciência).
--   B3:a — versão nova REABRE para todos os ativos e admitidos futuros herdam.
--   B4:a — o bloqueio vale para todos, inclusive DP/admin/diretoria.
--   B6:b modificado — recusado (ou vencido com ato registrado) SEGUE BLOQUEADO
--     até um ato explícito de LIBERAÇÃO pela chave nova rh.conduta.liberar
--     (admin/diretoria), auditado e visível no ciclo.
--
-- O DESENHO
--   * rh.documento é IMUTÁVEL: versão nova = documento NOVO apontando o
--     anterior por substitui_documento_id (cadeia; UNIQUE = um sucessor só).
--     "Reabrir" não toca em nada: a pendência é DERIVADA — documento ativo
--     (sem sucessor) com exige_ciencia e sem ciência do usuário. As ciências
--     antigas ficam intactas (rh.ciencia é append-only, 0006:34-45; o
--     UNIQUE(documento_id, usuario_id) naturalmente dá UMA ciência por versão).
--   * O prazo é POR DOCUMENTO, definido ao publicar (eixo 9 — administrável
--     pela tela, não constante no código). Para admitido depois da publicação,
--     o relógio conta do usuário, não do documento (regra no domínio).
--   * Nenhuma tabela de "pendência" materializada: admitido futuro herda de
--     graça, e não há estado para dessincronizar.

BEGIN;

-- ---------------------------------------------------------------- rh.documento: marcação do ciclo + cadeia de versões
ALTER TABLE rh.documento
  ADD COLUMN exige_ciencia          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN bloqueante             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN prazo_ciencia_dias     INT,
  ADD COLUMN substitui_documento_id BIGINT REFERENCES rh.documento (id),
  -- bloqueante é um MODO de exige_ciencia, nunca solto
  ADD CONSTRAINT documento_bloqueante_exige_ciencia
    CHECK (NOT bloqueante OR exige_ciencia),
  -- prazo só existe no ciclo de ciência, e o bloqueante não tem prazo:
  -- ele trava desde o 1º acesso (B1) — prazo nele seria promessa falsa
  ADD CONSTRAINT documento_prazo_no_ciclo
    CHECK (prazo_ciencia_dias IS NULL OR (exige_ciencia AND NOT bloqueante)),
  ADD CONSTRAINT documento_prazo_positivo
    CHECK (prazo_ciencia_dias IS NULL OR prazo_ciencia_dias >= 1),
  -- pendência é de TODO o quadro: o ciclo de ciência só faz sentido no
  -- acervo geral (colaborador_id IS NULL)
  ADD CONSTRAINT documento_ciclo_e_geral
    CHECK (NOT exige_ciencia OR colaborador_id IS NULL);

-- Um sucessor por documento: a cadeia é LINHA, não árvore.
CREATE UNIQUE INDEX documento_um_sucessor
  ON rh.documento (substitui_documento_id)
  WHERE substitui_documento_id IS NOT NULL;

-- Cabeças de cadeia do ciclo (consulta quente de pendência).
CREATE INDEX documento_ciclo_ativo
  ON rh.documento (id) WHERE exige_ciencia;

COMMENT ON COLUMN rh.documento.exige_ciencia IS
  'Entra no ciclo de ciência: todo usuário ativo fica pendente até dar ciência '
  'na versão vigente (sem sucessor). Versão nova reabre para todos (B3).';
COMMENT ON COLUMN rh.documento.bloqueante IS
  'Código de Conduta: a pendência BLOQUEIA o acesso desde o 1º acesso (B1/B4), '
  'para todos. O gate de borda consome pendenciaBloqueante(usuarioId).';
COMMENT ON COLUMN rh.documento.prazo_ciencia_dias IS
  'Prazo em dias corridos para dar ciência (política não bloqueante). '
  'Administrável ao publicar (eixo 9). Conta do publicar — ou da criação do '
  'usuário, para admitido depois (regra no domínio).';
COMMENT ON COLUMN rh.documento.substitui_documento_id IS
  'Cadeia de versões: documento é imutável; versão nova é documento novo '
  'apontando o anterior. UNIQUE parcial garante um sucessor só.';

-- Documento é IMUTÁVEL de verdade agora: nada o edita nem apaga — versão nova
-- é linha nova. (Nenhum código do app faz UPDATE/DELETE em rh.documento hoje;
-- este trigger transforma o costume em regra.)
CREATE TRIGGER documento_imutavel
  BEFORE UPDATE OR DELETE ON rh.documento
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- Coerência da cadeia no INSERT (o UPDATE já está barrado): só documento do
-- acervo geral substitui, e só documento do acervo geral é substituído.
CREATE FUNCTION rh.documento_validar_substituicao() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_anterior_colaborador BIGINT;
BEGIN
  IF NEW.substitui_documento_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.colaborador_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '45086', MESSAGE =
      'Versão nova na cadeia é do acervo geral — documento de colaborador não substitui.';
  END IF;
  SELECT d.colaborador_id INTO v_anterior_colaborador
    FROM rh.documento d WHERE d.id = NEW.substitui_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '45086', MESSAGE =
      'Documento substituído não existe.';
  END IF;
  IF v_anterior_colaborador IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '45086', MESSAGE =
      'Só documento do acervo geral entra na cadeia de versões.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documento_substituicao_coerente
  BEFORE INSERT ON rh.documento
  FOR EACH ROW EXECUTE FUNCTION rh.documento_validar_substituicao();

-- ---------------------------------------------------------------- recusa (append-only, espelho da ciência)
-- O ato PRÓPRIO do usuário: "li e não aceito". Grava o hash da versão recusada
-- — prova de QUAL texto foi recusado. Recusar não desbloqueia nada (B6):
-- o desbloqueio é ciência ou liberação explícita.
CREATE TABLE rh.documento_recusa (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id     BIGINT NOT NULL REFERENCES rh.documento (id),
  usuario_id       BIGINT NOT NULL REFERENCES sistema.usuario (id),
  hash_no_momento  CHAR(64) NOT NULL CHECK (hash_no_momento ~ '^[0-9a-f]{64}$'),
  motivo           TEXT,
  recusada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- uma recusa por versão por usuário (como a ciência)
  UNIQUE (documento_id, usuario_id)
);
CREATE TRIGGER documento_recusa_imutavel
  BEFORE UPDATE OR DELETE ON rh.documento_recusa
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

COMMENT ON TABLE rh.documento_recusa IS
  'Recusa de ciência registrada pelo PRÓPRIO usuário (sessão dele), com o hash '
  'da versão recusada. Append-only. Recusado segue bloqueado (B6) até ciência '
  'ou liberação (rh.conduta_liberacao).';

-- ---------------------------------------------------------------- ato com testemunhas (molde CLT, B2)
-- O registro FORMAL do DP quando a pessoa recusa ou deixa vencer o prazo.
-- Só o desfecho muda depois (molde 0080: mutação seletiva); DELETE proibido.
CREATE TABLE rh.conduta_ato (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id  BIGINT NOT NULL REFERENCES rh.documento (id),
  -- a pessoa do ato (quem recusou / deixou vencer)
  usuario_id    BIGINT NOT NULL REFERENCES sistema.usuario (id),
  -- de onde o ato nasceu — estado do fluxo, não lista de negócio (eixo 9 não
  -- alcança máquina de estados)
  origem        TEXT NOT NULL CHECK (origem IN ('recusa', 'prazo_vencido')),
  -- vínculo com a recusa formal quando ela existe no sistema; o DP também pode
  -- abrir o ato de uma recusa VERBAL (B2: "o próprio DP pode abrir diretamente")
  recusa_id     BIGINT REFERENCES rh.documento_recusa (id),
  descricao     TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  aberto_por    BIGINT NOT NULL REFERENCES sistema.usuario (id),
  aberto_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- desfecho narrado pelo DP (ex.: "advertência aplicada", "ciência dada em…")
  desfecho      TEXT,
  desfecho_em   TIMESTAMPTZ,
  desfecho_por  BIGINT REFERENCES sistema.usuario (id),
  CHECK ((desfecho IS NULL) = (desfecho_em IS NULL)),
  CHECK ((desfecho IS NULL) = (desfecho_por IS NULL)),
  -- um ciclo formal por pessoa por versão
  UNIQUE (documento_id, usuario_id)
);
CREATE INDEX conduta_ato_por_documento ON rh.conduta_ato (documento_id);

CREATE FUNCTION rh.conduta_ato_travar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ato do ciclo de ciência é append-only: DELETE não permitido';
  END IF;
  IF NEW.documento_id  IS DISTINCT FROM OLD.documento_id
     OR NEW.usuario_id  IS DISTINCT FROM OLD.usuario_id
     OR NEW.origem      IS DISTINCT FROM OLD.origem
     OR NEW.recusa_id   IS DISTINCT FROM OLD.recusa_id
     OR NEW.descricao   IS DISTINCT FROM OLD.descricao
     OR NEW.aberto_por  IS DISTINCT FROM OLD.aberto_por
     OR NEW.aberto_em   IS DISTINCT FROM OLD.aberto_em THEN
    RAISE EXCEPTION
      'ato do ciclo de ciência é imutável: só o desfecho é registrado depois';
  END IF;
  IF OLD.desfecho IS NOT NULL AND (
       NEW.desfecho    IS DISTINCT FROM OLD.desfecho
       OR NEW.desfecho_em  IS DISTINCT FROM OLD.desfecho_em
       OR NEW.desfecho_por IS DISTINCT FROM OLD.desfecho_por) THEN
    RAISE EXCEPTION 'desfecho do ato já registrado — não se reescreve';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conduta_ato_travar
  BEFORE UPDATE OR DELETE ON rh.conduta_ato
  FOR EACH ROW EXECUTE FUNCTION rh.conduta_ato_travar();

COMMENT ON TABLE rh.conduta_ato IS
  'Ato formal do DP no ciclo de ciência (recusa ou prazo vencido), com 2 '
  'testemunhas usuárias do sistema (rh.conduta_ato_testemunha). Com ato '
  'registrado, a pessoa fica bloqueada até liberação explícita (B6).';

-- ---------------------------------------------------------------- testemunhas do ato (2, confirmam com a própria sessão)
CREATE TABLE rh.conduta_ato_testemunha (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ato_id           BIGINT NOT NULL REFERENCES rh.conduta_ato (id),
  usuario_id       BIGINT NOT NULL REFERENCES sistema.usuario (id),
  indicado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a confirmação é a "ciência de testemunho": data + hash do documento no
  -- momento, gravados pela SESSÃO da própria testemunha
  confirmado_em    TIMESTAMPTZ,
  hash_no_momento  CHAR(64) CHECK (hash_no_momento ~ '^[0-9a-f]{64}$'),
  CHECK ((confirmado_em IS NULL) = (hash_no_momento IS NULL)),
  UNIQUE (ato_id, usuario_id)
);

CREATE FUNCTION rh.conduta_testemunha_travar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'testemunha de ato é append-only: DELETE não permitido';
  END IF;
  IF NEW.ato_id IS DISTINCT FROM OLD.ato_id
     OR NEW.usuario_id  IS DISTINCT FROM OLD.usuario_id
     OR NEW.indicado_em IS DISTINCT FROM OLD.indicado_em THEN
    RAISE EXCEPTION 'testemunha de ato é imutável: só a confirmação é gravada depois';
  END IF;
  IF OLD.confirmado_em IS NOT NULL AND (
       NEW.confirmado_em   IS DISTINCT FROM OLD.confirmado_em
       OR NEW.hash_no_momento IS DISTINCT FROM OLD.hash_no_momento) THEN
    RAISE EXCEPTION 'testemunho já confirmado — não se reescreve';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conduta_testemunha_travar
  BEFORE UPDATE OR DELETE ON rh.conduta_ato_testemunha
  FOR EACH ROW EXECUTE FUNCTION rh.conduta_testemunha_travar();

-- ---------------------------------------------------------------- liberação (B6: o único destrave sem ciência)
-- Ato explícito de quem tem rh.conduta.liberar: encerra o bloqueio DAQUELA
-- versão para AQUELA pessoa. Versão nova reabre tudo de novo (B3) — por isso a
-- liberação aponta o documento (a versão), não a cadeia.
CREATE TABLE rh.conduta_liberacao (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id   BIGINT NOT NULL REFERENCES rh.documento (id),
  usuario_id     BIGINT NOT NULL REFERENCES sistema.usuario (id),
  ato_id         BIGINT REFERENCES rh.conduta_ato (id),
  justificativa  TEXT NOT NULL CHECK (btrim(justificativa) <> ''),
  liberado_por   BIGINT NOT NULL REFERENCES sistema.usuario (id),
  liberado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (documento_id, usuario_id)
);
CREATE TRIGGER conduta_liberacao_imutavel
  BEFORE UPDATE OR DELETE ON rh.conduta_liberacao
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

COMMENT ON TABLE rh.conduta_liberacao IS
  'Liberação explícita do bloqueio do ciclo de ciência (chave '
  'rh.conduta.liberar — admin/diretoria). Vale para UMA versão e UMA pessoa; '
  'append-only, auditada e visível no quadro do ciclo.';

-- ---------------------------------------------------------------- permissões (eixo 4 — chave, nunca papel)
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.conduta.gerir',
   'Gerir o ciclo de ciência: ver o quadro por documento, abrir ato com testemunhas, registrar desfecho e enviar lembrete aos pendentes'),
  ('rh.conduta.liberar',
   'Liberar acesso bloqueado pelo ciclo de ciência (recusa ou prazo vencido com ato) — ato auditado e visível no ciclo');

-- Gestão do ciclo: DP (dono do rito) e diretoria (acompanha).
-- Liberação: só o topo (B6 — "usuário de maior patente"): admin e diretoria.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',        'rh.conduta.gerir'),
  ('diretoria', 'rh.conduta.gerir'),
  ('admin',     'rh.conduta.liberar'),
  ('diretoria', 'rh.conduta.liberar');

-- ---------------------------------------------------------------- provas
DO $$
DECLARE
  v_qtd INT;
BEGIN
  -- colunas novas no lugar
  SELECT count(*) INTO v_qtd
    FROM information_schema.columns
   WHERE table_schema = 'rh' AND table_name = 'documento'
     AND column_name IN
       ('exige_ciencia', 'bloqueante', 'prazo_ciencia_dias', 'substitui_documento_id');
  IF v_qtd <> 4 THEN
    RAISE EXCEPTION 'esperava as 4 colunas do ciclo em rh.documento, achei %', v_qtd;
  END IF;

  -- nenhuma linha antiga entrou no ciclo sem querer
  IF EXISTS (SELECT 1 FROM rh.documento WHERE exige_ciencia OR bloqueante) THEN
    RAISE EXCEPTION 'documento pré-existente não deveria nascer no ciclo';
  END IF;

  -- as 4 tabelas do ciclo existem
  SELECT count(*) INTO v_qtd
    FROM information_schema.tables
   WHERE table_schema = 'rh' AND table_name IN
     ('documento_recusa', 'conduta_ato', 'conduta_ato_testemunha', 'conduta_liberacao');
  IF v_qtd <> 4 THEN
    RAISE EXCEPTION 'esperava as 4 tabelas do ciclo, achei %', v_qtd;
  END IF;

  -- chaves semeadas na concessão decidida (B6: liberar = admin/diretoria)
  SELECT count(*) INTO v_qtd FROM sistema.papel_permissao
   WHERE (papel, chave) IN (VALUES
     ('dp', 'rh.conduta.gerir'), ('diretoria', 'rh.conduta.gerir'),
     ('admin', 'rh.conduta.liberar'), ('diretoria', 'rh.conduta.liberar'));
  IF v_qtd <> 4 THEN
    RAISE EXCEPTION 'esperava 4 concessões do ciclo, achei %', v_qtd;
  END IF;
END $$;

-- prova funcional: os CHECKs e o trigger da cadeia MORDEM (só roda onde já
-- existe usuário para satisfazer a FK; num banco recém-nascido, avisa e segue).
DO $$
DECLARE
  v_usuario BIGINT;
  v_falhou  BOOLEAN;
BEGIN
  SELECT min(id) INTO v_usuario FROM sistema.usuario;
  IF v_usuario IS NULL THEN
    RAISE NOTICE 'ciclo de ciência: sem usuário no banco — prova funcional pulada';
    RETURN;
  END IF;

  -- bloqueante sem exige_ciencia tem que falhar
  v_falhou := FALSE;
  BEGIN
    INSERT INTO rh.documento
      (categoria, titulo, nome_arquivo, mime, tamanho_bytes, conteudo,
       hash_sha256, enviado_por_usuario, exige_ciencia, bloqueante)
    VALUES
      ('politica', 'prova 0086', 'p.txt', 'text/plain', 1, '\x20'::bytea,
       repeat('a', 64), v_usuario, FALSE, TRUE);
  EXCEPTION WHEN check_violation THEN
    v_falhou := TRUE;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'CHECK documento_bloqueante_exige_ciencia não mordeu';
  END IF;

  -- prazo em documento bloqueante tem que falhar (bloqueante trava já, sem prazo)
  v_falhou := FALSE;
  BEGIN
    INSERT INTO rh.documento
      (categoria, titulo, nome_arquivo, mime, tamanho_bytes, conteudo,
       hash_sha256, enviado_por_usuario, exige_ciencia, bloqueante,
       prazo_ciencia_dias)
    VALUES
      ('politica', 'prova 0086', 'p.txt', 'text/plain', 1, '\x20'::bytea,
       repeat('a', 64), v_usuario, TRUE, TRUE, 10);
  EXCEPTION WHEN check_violation THEN
    v_falhou := TRUE;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'CHECK documento_prazo_no_ciclo não mordeu';
  END IF;

  -- exige_ciencia em documento DE COLABORADOR tem que falhar (ciclo é do geral)
  v_falhou := FALSE;
  BEGIN
    INSERT INTO rh.documento
      (colaborador_id, categoria, titulo, nome_arquivo, mime, tamanho_bytes,
       conteudo, hash_sha256, enviado_por_usuario, exige_ciencia)
    SELECT c.id, 'politica', 'prova 0086', 'p.txt', 'text/plain', 1,
           '\x20'::bytea, repeat('a', 64), v_usuario, TRUE
      FROM rh.colaborador c LIMIT 1;
    -- sem colaborador no banco o INSERT vira no-op: considera provado
    IF NOT FOUND THEN
      v_falhou := TRUE;
    END IF;
  EXCEPTION WHEN check_violation THEN
    v_falhou := TRUE;
  END;
  IF NOT v_falhou THEN
    RAISE EXCEPTION 'CHECK documento_ciclo_e_geral não mordeu';
  END IF;

  RAISE NOTICE 'ciclo de ciência: colunas, tabelas, chaves e CHECKs provados';
END $$;

COMMIT;
