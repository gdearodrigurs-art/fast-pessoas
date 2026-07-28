-- 0006_documentos.sql
-- GED mínimo (Fase 1): documento (por colaborador ou geral) + ciência com hash.
-- Dev: conteúdo em BYTEA no próprio banco, limite 10 MB — o repositório da
-- aplicação isola o armazenamento para trocar por object storage sem tocar
-- no serviço. Ciência é append-only (efeito legal): registra que o usuário
-- viu o documento tal como estava (hash) naquele momento.

BEGIN;

-- ---------------------------------------------------------------- documento
CREATE TABLE rh.documento (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NULL = documento geral (ex.: política, comunicado) — o serviço decide quem vê
  colaborador_id      BIGINT REFERENCES rh.colaborador (id),
  categoria           TEXT NOT NULL,   -- ex.: contrato, holerite, politica, atestado
  titulo              TEXT NOT NULL,
  nome_arquivo        TEXT NOT NULL,
  mime                TEXT NOT NULL,
  tamanho_bytes       INTEGER NOT NULL
                      CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10 * 1024 * 1024),
  conteudo            BYTEA NOT NULL,
  -- sensível: AUSENTE do payload de quem não tem documento.sensivel.ver;
  -- leitura autorizada grava audit.leitura_sensivel (na aplicação)
  sensivel            BOOLEAN NOT NULL DEFAULT FALSE,
  hash_sha256         CHAR(64) NOT NULL CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
  enviado_por_usuario BIGINT NOT NULL REFERENCES sistema.usuario (id),
  enviado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (octet_length(conteudo) = tamanho_bytes)
);
CREATE INDEX documento_por_colaborador
  ON rh.documento (colaborador_id, enviado_em DESC);

-- ---------------------------------------------------------------- ciência (append-only)
CREATE TABLE rh.ciencia (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id     BIGINT NOT NULL REFERENCES rh.documento (id),
  usuario_id       BIGINT NOT NULL REFERENCES sistema.usuario (id),
  dada_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- hash do documento no instante da ciência — prova de qual versão foi vista
  hash_no_momento  CHAR(64) NOT NULL CHECK (hash_no_momento ~ '^[0-9a-f]{64}$'),
  UNIQUE (documento_id, usuario_id)
);
CREATE TRIGGER ciencia_imutavel
  BEFORE UPDATE OR DELETE ON rh.ciencia
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- permissões
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('documento.enviar',       'Enviar documento (de colaborador ou geral)'),
  ('documento.ver',          'Ver documentos (o serviço restringe: funcionário vê os próprios e os gerais)'),
  ('documento.sensivel.ver', 'Ver documento marcado como sensível (leitura gera trilha)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('funcionario', 'documento.ver'),
  ('gestor',      'documento.ver'),
  ('rh',          'documento.ver'),
  ('rh',          'documento.enviar'),
  ('dp',          'documento.ver'),
  ('dp',          'documento.enviar'),
  ('dp',          'documento.sensivel.ver'),
  ('diretoria',   'documento.ver'),
  ('diretoria',   'documento.sensivel.ver'),
  ('admin',       'documento.ver');

COMMIT;
