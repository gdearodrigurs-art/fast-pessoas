-- 0003_demandas.sql
-- Demandas DP/RH (MVP do docs/03-modulos/07-workflows-demandas.md): catálogo de
-- tipos versionado com vigência, demanda com prazo por SLA, transições e
-- comentários append-only. A demanda ORQUESTRA; o domínio alvo EFETIVA —
-- nada aqui escreve em tabela de outro domínio.

BEGIN;

-- ---------------------------------------------------------------- tipo de demanda (versão com vigência)
-- Parametrizável versionado: demanda congela a versão vigente na abertura.
-- Mudar SLA/aprovação = nova versão; NUNCA UPDATE em versão encerrada (regra
-- imposta na aplicação). No máximo uma versão ativa por chave.
CREATE TABLE rh.tipo_demanda_versao (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave                   TEXT NOT NULL,     -- identidade estável do tipo (slug)
  versao                  INT NOT NULL DEFAULT 1 CHECK (versao >= 1),
  nome                    TEXT NOT NULL,
  sla_dias                INT NOT NULL CHECK (sla_dias > 0),  -- dias corridos (decisão MVP)
  exige_aprovacao_gestor  BOOLEAN NOT NULL DEFAULT FALSE,
  status                  TEXT NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia         DATE NOT NULL,
  fim_vigencia            DATE,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chave, versao),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX tipo_demanda_versao_ativa_unica
  ON rh.tipo_demanda_versao (chave) WHERE status = 'ativa';
CREATE TRIGGER tipo_demanda_versao_tocar BEFORE UPDATE ON rh.tipo_demanda_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- demanda (núcleo)
-- Número legível em sequência própria (independente do id técnico).
CREATE SEQUENCE rh.demanda_numero_seq START 1;

CREATE TABLE rh.demanda (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero                      BIGINT NOT NULL UNIQUE
                              DEFAULT nextval('rh.demanda_numero_seq'),
  tipo_demanda_versao_id      BIGINT NOT NULL REFERENCES rh.tipo_demanda_versao (id),
  solicitante_usuario_id      BIGINT NOT NULL REFERENCES sistema.usuario (id),
  -- NULL quando o usuário ainda não tem ficha de colaborador (abertura assistida)
  solicitante_colaborador_id  BIGINT REFERENCES rh.colaborador (id),
  descricao                   TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  status                      TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN
                                ('aberta','aguardando_aprovacao','em_atendimento',
                                 'concluida','recusada')),
  -- calculado na criação: data de abertura (America/Sao_Paulo) + sla_dias da versão
  prazo                       DATE NOT NULL,
  atendente_usuario_id        BIGINT REFERENCES sistema.usuario (id),
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER SEQUENCE rh.demanda_numero_seq OWNED BY rh.demanda.numero;
CREATE INDEX demanda_por_solicitante ON rh.demanda (solicitante_usuario_id, criado_em DESC);
CREATE INDEX demanda_fila ON rh.demanda (status, prazo);
CREATE INDEX demanda_por_atendente ON rh.demanda (atendente_usuario_id)
  WHERE atendente_usuario_id IS NOT NULL;
CREATE TRIGGER demanda_tocar BEFORE UPDATE ON rh.demanda
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- transições (append-only)
-- de_status NULL = registro de abertura da demanda.
CREATE TABLE rh.demanda_transicao (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demanda_id      BIGINT NOT NULL REFERENCES rh.demanda (id),
  de_status       TEXT CHECK (de_status IN
                    ('aberta','aguardando_aprovacao','em_atendimento',
                     'concluida','recusada')),
  para_status     TEXT NOT NULL CHECK (para_status IN
                    ('aberta','aguardando_aprovacao','em_atendimento',
                     'concluida','recusada')),
  por_usuario_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  motivo          TEXT,
  em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (de_status IS DISTINCT FROM para_status)
);
CREATE INDEX demanda_transicao_por_demanda ON rh.demanda_transicao (demanda_id, em);
CREATE TRIGGER demanda_transicao_imutavel
  BEFORE UPDATE OR DELETE ON rh.demanda_transicao
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- comentários (append-only)
CREATE TABLE rh.demanda_comentario (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demanda_id        BIGINT NOT NULL REFERENCES rh.demanda (id),
  autor_usuario_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  texto             TEXT NOT NULL CHECK (btrim(texto) <> ''),
  em                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX demanda_comentario_por_demanda ON rh.demanda_comentario (demanda_id, em);
CREATE TRIGGER demanda_comentario_imutavel
  BEFORE UPDATE OR DELETE ON rh.demanda_comentario
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- seed do catálogo (v1 ativa)
INSERT INTO rh.tipo_demanda_versao
  (chave, versao, nome, sla_dias, exige_aprovacao_gestor, status, inicio_vigencia)
VALUES
  ('declaracao_vinculo',  1, 'Declaração de vínculo',   3, FALSE, 'ativa', CURRENT_DATE),
  ('informe_rendimentos', 1, 'Informe de rendimentos',  2, FALSE, 'ativa', CURRENT_DATE),
  ('ajuste_ponto',        1, 'Ajuste de ponto',         5, TRUE,  'ativa', CURRENT_DATE),
  ('duvida_folha',        1, 'Dúvida sobre a folha',    4, FALSE, 'ativa', CURRENT_DATE),
  ('outros',              1, 'Outros',                  7, FALSE, 'ativa', CURRENT_DATE);

-- ---------------------------------------------------------------- permissões
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('demanda.criar',     'Abrir demanda para o DP/RH'),
  ('demanda.atender',   'Atender demandas: assumir, concluir, recusar'),
  ('demanda.aprovar',   'Aprovar demanda de liderado quando o tipo exige'),
  ('demanda.ver.todas', 'Ver todas as demandas (visão consolidada)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('funcionario', 'demanda.criar'),
  ('gestor',      'demanda.criar'),
  ('gestor',      'demanda.aprovar'),
  ('rh',          'demanda.criar'),
  ('rh',          'demanda.atender'),
  ('rh',          'demanda.ver.todas'),
  ('dp',          'demanda.criar'),
  ('dp',          'demanda.atender'),
  ('dp',          'demanda.ver.todas'),
  ('diretoria',   'demanda.criar'),
  ('diretoria',   'demanda.ver.todas'),
  ('admin',       'demanda.criar');

COMMIT;
