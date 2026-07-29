-- 0007_ferias_afastamentos.sql
-- Férias e afastamentos (MVP do docs/03-modulos/08-ferias-afastamentos.md):
-- período aquisitivo mantido pelo próprio sistema, programação de férias com
-- aprovação orquestrada pelo motor de demandas (0003) e registro de
-- afastamentos com dado de saúde cifrado NA APLICAÇÃO (nunca em claro).
-- Fatos relevantes (programação aprovada, gozo, afastamento) viram
-- rh.evento_colaborador na aplicação; toda mutação grava audit.alteracao e
-- toda leitura do dado de saúde grava audit.leitura_sensivel.

BEGIN;

-- ---------------------------------------------------------------- período aquisitivo
-- Uma linha por ciclo de 12 meses do colaborador; o sistema é o dono do dado.
-- saldo_dias parte de 30 e é ajustado com origem registrada (art. 130/133 —
-- ajuste é UPDATE auditado, nunca silencioso). limite_concessivo = fim + 12
-- meses (derivado na aplicação e gravado para o painel de vencimento — férias
-- vencida = pagamento em dobro, art. 137).
CREATE TABLE rh.periodo_aquisitivo (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id     BIGINT NOT NULL REFERENCES rh.colaborador (id),
  inicio             DATE NOT NULL,
  fim                DATE NOT NULL,
  saldo_dias         NUMERIC(4,1) NOT NULL DEFAULT 30
                     CHECK (saldo_dias >= 0 AND saldo_dias <= 30),
  dias_gozados       NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (dias_gozados >= 0),
  status             TEXT NOT NULL DEFAULT 'em_aberto' CHECK (status IN
                       ('em_aberto','programado_parcial','gozado','vencido')),
  limite_concessivo  DATE NOT NULL,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim > inicio),
  CHECK (limite_concessivo > fim),
  UNIQUE (colaborador_id, inicio)
);
CREATE INDEX periodo_aquisitivo_por_pessoa
  ON rh.periodo_aquisitivo (colaborador_id, inicio DESC);
-- Painel de vencimento: períodos ainda não quitados ordenados pelo concessivo.
CREATE INDEX periodo_aquisitivo_vencimento
  ON rh.periodo_aquisitivo (limite_concessivo)
  WHERE status IN ('em_aberto','programado_parcial');
CREATE TRIGGER periodo_aquisitivo_tocar BEFORE UPDATE ON rh.periodo_aquisitivo
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- programação de férias
-- A aprovação NÃO mora aqui: roda no motor de demandas (tipo
-- 'programacao_ferias', exige aprovação do gestor) — demanda_id referencia a
-- demanda que orquestra; a programação é o efeito no domínio. Validações
-- contra o saldo do período e checks legais (art. 134/143) são do serviço,
-- com resultado auditado.
CREATE TABLE rh.programacao_ferias (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id         BIGINT NOT NULL REFERENCES rh.colaborador (id),
  periodo_aquisitivo_id  BIGINT NOT NULL REFERENCES rh.periodo_aquisitivo (id),
  inicio                 DATE NOT NULL,
  dias                   INT NOT NULL CHECK (dias BETWEEN 5 AND 30),
  -- abono pecuniário (art. 143): até 1/3 de 30 dias
  abono_dias             INT NOT NULL DEFAULT 0 CHECK (abono_dias BETWEEN 0 AND 10),
  status                 TEXT NOT NULL DEFAULT 'solicitada' CHECK (status IN
                           ('solicitada','aprovada','recusada','em_gozo',
                            'concluida','cancelada')),
  demanda_id             BIGINT REFERENCES rh.demanda (id),
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX programacao_ferias_por_pessoa
  ON rh.programacao_ferias (colaborador_id, inicio DESC);
CREATE INDEX programacao_ferias_por_periodo
  ON rh.programacao_ferias (periodo_aquisitivo_id);
CREATE INDEX programacao_ferias_por_demanda
  ON rh.programacao_ferias (demanda_id) WHERE demanda_id IS NOT NULL;
CREATE TRIGGER programacao_ferias_tocar BEFORE UPDATE ON rh.programacao_ferias
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- afastamento — DADO SENSÍVEL
-- dados_saude_cifrados (CID, médico/detalhe) é cifrado NA CAMADA DE APLICAÇÃO
-- (Node, chave em secret manager — sem pgcrypto) e NUNCA gravado em claro.
-- O campo fica AUSENTE do payload de quem não tem afastamento.saude.ver;
-- gestor vê apenas período + rótulo genérico do tipo. Cada leitura autorizada
-- do conteúdo cifrado grava audit.leitura_sensivel.
-- Tabela normal (fim/encerramento é UPDATE), com histórico de alterações
-- garantido via audit.alteracao na aplicação — sem trigger de bloqueio, mas
-- SEM GRANT de DELETE para a credencial da aplicação (db/provisionar.sql).
CREATE TABLE rh.afastamento (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id        BIGINT NOT NULL REFERENCES rh.colaborador (id),
  tipo                  TEXT NOT NULL CHECK (tipo IN
                          ('atestado','licenca_medica','maternidade','paternidade',
                           'acidente_trabalho','inss','outros')),
  inicio                DATE NOT NULL,
  -- NULL = em curso (sem fim previsto/definido)
  fim                   DATE,
  dados_saude_cifrados  TEXT,
  -- anexo no GED (atestado etc.) — documento marcado como sensível no 0006
  documento_id          BIGINT REFERENCES rh.documento (id),
  registrado_por        BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX afastamento_por_pessoa
  ON rh.afastamento (colaborador_id, inicio DESC);
CREATE INDEX afastamento_em_curso
  ON rh.afastamento (colaborador_id) WHERE fim IS NULL;
CREATE TRIGGER afastamento_tocar BEFORE UPDATE ON rh.afastamento
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- seed do tipo de demanda
-- A programação de férias abre demanda deste tipo (aprovação do gestor no
-- motor do 0003). Idempotente: só insere se a chave ainda não existir.
INSERT INTO rh.tipo_demanda_versao
  (chave, versao, nome, sla_dias, exige_aprovacao_gestor, status, inicio_vigencia)
SELECT 'programacao_ferias', 1, 'Programação de férias', 5, TRUE, 'ativa', CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM rh.tipo_demanda_versao WHERE chave = 'programacao_ferias'
);

-- ---------------------------------------------------------------- permissões
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('ferias.programar',      'Programar férias (abre demanda de programação)'),
  ('ferias.aprovar',        'Aprovar programação de férias de liderado (via relacao_gestor vigente)'),
  ('ferias.administrar',    'Administrar férias: períodos aquisitivos, validação, painel de vencimento'),
  ('afastamento.registrar', 'Registrar, prorrogar e encerrar afastamento'),
  ('afastamento.saude.ver', 'Ver o dado de saúde cifrado do afastamento (leitura gera trilha)'),
  ('afastamento.ver',       'Ver afastamentos de todos os colaboradores');

-- Gestor vê afastamentos da equipe como período + tipo genérico via
-- relacao_gestor vigente no serviço — sem chave própria e NUNCA o conteúdo
-- de saúde. Funcionário vê os próprios períodos/programações sem chave.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('funcionario', 'ferias.programar'),
  ('gestor',      'ferias.programar'),
  ('gestor',      'ferias.aprovar'),
  ('rh',          'ferias.programar'),
  ('rh',          'ferias.administrar'),
  ('rh',          'afastamento.ver'),
  ('dp',          'ferias.programar'),
  ('dp',          'ferias.administrar'),
  ('dp',          'afastamento.registrar'),
  ('dp',          'afastamento.saude.ver'),
  ('dp',          'afastamento.ver'),
  ('diretoria',   'ferias.programar'),
  ('admin',       'ferias.programar');

COMMIT;
