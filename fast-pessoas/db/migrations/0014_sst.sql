-- 0014_sst.sql
-- SST / Saúde Ocupacional — base local (MVP do docs/03-modulos/10-sst-saude-ocupacional.md):
-- ASO com restrições de saúde cifradas NA APLICAÇÃO (src/lib/cifra.ts, mesma
-- cifra dos afastamentos — nunca em claro no banco), catálogo de EPI com CA,
-- entrega de EPI append-only com ciência (termo no GED) e CAT append-only com
-- correção encadeada. A transmissão eSocial (S-2210/S-2220/S-2240) está FORA
-- deste MVP — quem transmite hoje continua transmitindo; o sistema é o
-- controle local (vencimento, ciência, prova documental).
-- Restrições do ASO são dado sensível de saúde: AUSENTES do payload de quem
-- não tem sst.saude.ver; cada leitura decifrada grava audit.leitura_sensivel.
-- Fatos relevantes (ASO registrado, CAT, entrega de EPI) viram
-- rh.evento_colaborador na aplicação; toda mutação grava audit.alteracao.

BEGIN;

-- ---------------------------------------------------------------- ASO — exames ocupacionais
-- Registro por colaborador; validade NULL = sem próximo exame definido (ex.:
-- demissional). PDF do ASO no GED (rh.documento marcado sensivel no 0006).
-- restricoes_cifradas: cifrado na aplicação (chave fora do banco); gestor vê
-- apenas status em dia / a vencer / vencido — nunca o conteúdo clínico.
-- Tabela normal (correção é UPDATE auditado via audit.alteracao), sem GRANT
-- de DELETE para a credencial da aplicação (db/provisionar.sql).
CREATE TABLE rh.aso (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id       BIGINT NOT NULL REFERENCES rh.colaborador (id),
  tipo                 TEXT NOT NULL CHECK (tipo IN
                         ('admissional','periodico','demissional',
                          'retorno_trabalho','mudanca_risco')),
  data_exame           DATE NOT NULL,
  -- data-limite do exame (informada pela clínica) — alimenta o painel de vencimento
  validade             DATE,
  resultado            TEXT NOT NULL CHECK (resultado IN
                         ('apto','inapto','apto_com_restricoes')),
  -- dado de saúde CIFRADO NA APLICAÇÃO — nunca em claro; leitura gera trilha
  restricoes_cifradas  TEXT,
  -- PDF do ASO no GED (documento sensível)
  documento_id         BIGINT REFERENCES rh.documento (id),
  registrado_por       BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (validade IS NULL OR validade > data_exame),
  -- ASO plenamente apto não carrega restrição (minimização de dado de saúde)
  CHECK (restricoes_cifradas IS NULL OR resultado <> 'apto')
);
CREATE INDEX aso_por_pessoa ON rh.aso (colaborador_id, data_exame DESC);
-- Painel de vencimentos: vencidos / a vencer em 30-60-90 dias
CREATE INDEX aso_vencimento ON rh.aso (validade) WHERE validade IS NOT NULL;
CREATE TRIGGER aso_tocar BEFORE UPDATE ON rh.aso
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- catálogo de EPI
-- CA (Certificado de Aprovação) e validade alimentam o alerta de CA a vencer.
-- Item sai de circulação com ativo = FALSE (nunca DELETE — entregas apontam
-- para ele).
CREATE TABLE rh.epi_item (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome           TEXT NOT NULL CHECK (btrim(nome) <> ''),
  numero_ca      TEXT CHECK (numero_ca IS NULL OR btrim(numero_ca) <> ''),
  validade_ca    DATE,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- validade de CA sem número de CA não existe
  CHECK (validade_ca IS NULL OR numero_ca IS NOT NULL)
);
-- Alerta de CA vencido/a vencer entre os itens em uso
CREATE INDEX epi_item_ca_vencimento ON rh.epi_item (validade_ca)
  WHERE ativo AND validade_ca IS NOT NULL;
CREATE TRIGGER epi_item_tocar BEFORE UPDATE ON rh.epi_item
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- entrega de EPI (append-only de entregas)
-- Substitui a ficha de papel (NR-6 aceita registro eletrônico). O termo é
-- documento no GED; a ciência do colaborador segue o padrão rh.ciencia (hash
-- do termo no momento) e ciencia_registrada é a projeção dela aqui.
-- Append-only: a entrega em si é imutável — UPDATE permitido só para
-- registrar a devolução (devolvido_em) e refletir a ciência
-- (ciencia_registrada FALSE→TRUE). Erro de lançamento = registro novo;
-- pendência de devolução alimenta o checklist de desligamento.
CREATE TABLE rh.epi_entrega (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id      BIGINT NOT NULL REFERENCES rh.colaborador (id),
  epi_item_id         BIGINT NOT NULL REFERENCES rh.epi_item (id),
  quantidade          INT NOT NULL CHECK (quantidade >= 1),
  data_entrega        DATE NOT NULL,
  -- termo de entrega no GED (a ciência é dada sobre ele)
  termo_documento_id  BIGINT REFERENCES rh.documento (id),
  ciencia_registrada  BOOLEAN NOT NULL DEFAULT FALSE,
  -- NULL = em uso; preenchido uma única vez na devolução
  devolvido_em        TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (devolvido_em IS NULL OR devolvido_em::date >= data_entrega),
  -- ciência sem termo no GED não existe
  CHECK (NOT ciencia_registrada OR termo_documento_id IS NOT NULL)
);
CREATE INDEX epi_entrega_por_pessoa
  ON rh.epi_entrega (colaborador_id, data_entrega DESC);
CREATE INDEX epi_entrega_por_item ON rh.epi_entrega (epi_item_id);
-- Pendências de devolução (consulta do checklist de desligamento)
CREATE INDEX epi_entrega_pendente_devolucao
  ON rh.epi_entrega (colaborador_id) WHERE devolvido_em IS NULL;

CREATE FUNCTION rh.epi_entrega_travar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entrega de EPI é append-only: DELETE não permitido';
  END IF;
  IF NEW.colaborador_id        IS DISTINCT FROM OLD.colaborador_id
     OR NEW.epi_item_id        IS DISTINCT FROM OLD.epi_item_id
     OR NEW.quantidade         IS DISTINCT FROM OLD.quantidade
     OR NEW.data_entrega       IS DISTINCT FROM OLD.data_entrega
     OR NEW.termo_documento_id IS DISTINCT FROM OLD.termo_documento_id
     OR NEW.criado_em          IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION
      'entrega de EPI é imutável: só devolvido_em (devolução) e ciencia_registrada (ciência) mudam — correção é registro novo';
  END IF;
  IF OLD.devolvido_em IS NOT NULL
     AND NEW.devolvido_em IS DISTINCT FROM OLD.devolvido_em THEN
    RAISE EXCEPTION 'devolução já registrada não se altera';
  END IF;
  IF OLD.ciencia_registrada AND NOT NEW.ciencia_registrada THEN
    RAISE EXCEPTION 'ciência registrada não se desfaz';
  END IF;
  RETURN NEW;
END;
$$;
-- BEFORE UPDATE dispara em ordem alfabética: _tocar corre antes de _travar;
-- o guarda não olha atualizado_em, então a ordem é indiferente.
CREATE TRIGGER epi_entrega_travar
  BEFORE UPDATE OR DELETE ON rh.epi_entrega
  FOR EACH ROW EXECUTE FUNCTION rh.epi_entrega_travar();
CREATE TRIGGER epi_entrega_tocar BEFORE UPDATE ON rh.epi_entrega
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- CAT (append-only)
-- Registro interno da Comunicação de Acidente de Trabalho. O registro é
-- IMUTÁVEL: correção OU avanço de status = registro novo referenciando o
-- anterior via cat_anterior_id (cadeia linear; a versão vigente é a ponta da
-- cadeia — o serviço projeta). status 'encaminhada' = repassada a quem
-- transmite o S-2210 hoje (transmissão fora deste MVP); o prazo legal
-- (D+1 útil; imediato em óbito) é cobrado pelo serviço/painel — o sistema
-- cobra, não bloqueia registro pós-fato. houve_afastamento com afastamento
-- aberto pendura em rh.afastamento (0007, tipo acidente_trabalho) e a
-- estabilidade de 12 meses é sinalizada na ficha pela aplicação.
CREATE TABLE rh.cat (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id     BIGINT NOT NULL REFERENCES rh.colaborador (id),
  data_acidente      TIMESTAMPTZ NOT NULL,
  tipo               TEXT NOT NULL CHECK (tipo IN ('tipico','trajeto','doenca')),
  descricao          TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  houve_afastamento  BOOLEAN NOT NULL,
  afastamento_id     BIGINT REFERENCES rh.afastamento (id),
  status             TEXT NOT NULL DEFAULT 'registrada'
                     CHECK (status IN ('registrada','encaminhada')),
  -- correção/avanço: novo registro apontando para o anterior (nunca UPDATE)
  cat_anterior_id    BIGINT REFERENCES rh.cat (id),
  registrado_por     BIGINT NOT NULL REFERENCES sistema.usuario (id),
  registrada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- vínculo de afastamento só quando houve afastamento
  CHECK (houve_afastamento OR afastamento_id IS NULL)
);
CREATE INDEX cat_por_pessoa ON rh.cat (colaborador_id, data_acidente DESC);
CREATE INDEX cat_por_afastamento ON rh.cat (afastamento_id)
  WHERE afastamento_id IS NOT NULL;
-- Cadeia linear: cada registro é substituído por NO MÁXIMO um sucessor
CREATE UNIQUE INDEX cat_sucessor_unico ON rh.cat (cat_anterior_id)
  WHERE cat_anterior_id IS NOT NULL;
CREATE TRIGGER cat_imutavel
  BEFORE UPDATE OR DELETE ON rh.cat
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- permissões
-- Funcionário vê os próprios ASOs (status/documento — é titular) e termos de
-- EPI sem chave própria; gestor vê STATUS da equipe via relacao_gestor
-- vigente no serviço — nunca conteúdo clínico (ausência, não máscara).
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('sst.gerir',     'Registrar e gerir SST: ASO, catálogo e entrega de EPI, CAT'),
  ('sst.ver',       'Ver painéis e registros de SST (sem conteúdo clínico)'),
  ('sst.saude.ver', 'Ver restrições de saúde decifradas do ASO (leitura gera trilha)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp', 'sst.gerir'),
  ('rh', 'sst.ver'),
  ('dp', 'sst.ver'),
  ('dp', 'sst.saude.ver');

COMMIT;
