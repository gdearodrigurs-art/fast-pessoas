-- 0008_desligamento.sql
-- Desligamento (MVP do docs/03-modulos/11-desligamento.md): tipos versionados
-- com vigência, processo com máquina de estados e prazo do art. 477,
-- verificação de estabilidades append-only, devoluções, roteiro de entrevista
-- versionado e entrevista com trava de encerramento (funcionalidade 12 —
-- oferta obrigatória e auditada, participação voluntária; o processo NÃO
-- encerra com entrevista pendente). O indicador oficial de cobertura
-- (entrevista_desligamento) já existe no catálogo rh.indicador (0005) e sua
-- meta vive em rh.meta_indicador_versao (Central de Metas) — nada fixo aqui.
-- A rescisão em valor é do domínio rh_folha e o S-2299 do domínio fiscal —
-- este módulo referencia, não duplica.

BEGIN;

-- ---------------------------------------------------------------- tipo de desligamento (versão com vigência)
-- Parametrizável versionado (nunca enum rígido): o processo congela a versão
-- vigente na abertura. Atributos são DE PROCESSO (orientam checklist e
-- alertas); base de cálculo em valor é exclusiva do motor de folha.
CREATE TABLE rh.tipo_desligamento_versao (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo                      TEXT NOT NULL CHECK (tipo IN
                              ('pedido_demissao','sem_justa_causa','justa_causa',
                               'acordo_484a','termino_experiencia','termino_temporario')),
  versao                    INT NOT NULL DEFAULT 1 CHECK (versao >= 1),
  nome                      TEXT NOT NULL,
  exige_aviso               BOOLEAN NOT NULL,
  admite_indenizado         BOOLEAN NOT NULL,
  -- arts. 30/31 da Lei 9.656/98: manutenção do plano contributário
  direito_manutencao_plano  BOOLEAN NOT NULL,
  -- entra no denominador do indicador de cobertura de entrevistas
  elegivel_entrevista       BOOLEAN NOT NULL DEFAULT TRUE,
  status                    TEXT NOT NULL DEFAULT 'rascunho'
                            CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia           DATE NOT NULL,
  fim_vigencia              DATE,
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, versao),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX tipo_desligamento_versao_uma_ativa
  ON rh.tipo_desligamento_versao (tipo) WHERE status = 'ativa';
CREATE TRIGGER tipo_desligamento_versao_tocar BEFORE UPDATE ON rh.tipo_desligamento_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER tipo_desligamento_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.tipo_desligamento_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- processo de desligamento
-- Máquina de estados conduzida pelo serviço (transições só para frente, cada
-- uma no audit.alteracao + evento na linha do tempo). A efetivação
-- (colaborador.status → desligado + desativação do usuário) acontece na MESMA
-- transação, no serviço. data_limite_477 é calculada na aplicação com a regra
-- de contagem parametrizada (art. 477 §6º: 10 dias corridos do término).
CREATE TABLE rh.processo_desligamento (
  id                           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id               BIGINT NOT NULL REFERENCES rh.colaborador (id),
  tipo_desligamento_versao_id  BIGINT NOT NULL REFERENCES rh.tipo_desligamento_versao (id),
  iniciativa                   TEXT NOT NULL CHECK (iniciativa IN
                                 ('empregador','empregado','acordo','termino_contrato')),
  data_comunicacao             DATE NOT NULL,
  modalidade_aviso             TEXT NOT NULL CHECK (modalidade_aviso IN
                                 ('trabalhado','indenizado','dispensado','nao_aplicavel')),
  data_projetada_termino       DATE NOT NULL,
  data_termino_efetiva         DATE,
  data_limite_477              DATE NOT NULL,
  estado                       TEXT NOT NULL DEFAULT 'iniciado' CHECK (estado IN
                                 ('iniciado','em_cumprimento','em_acerto',
                                  'encerrado','cancelado')),
  -- RESTRITO: AUSENTE do payload de quem não tem desligamento.motivo.ver;
  -- leitura autorizada grava audit.leitura_sensivel (na aplicação)
  motivo                       TEXT,
  aberto_por_usuario_id        BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_projetada_termino >= data_comunicacao),
  CHECK (data_limite_477 >= data_comunicacao),
  CHECK (estado <> 'encerrado' OR data_termino_efetiva IS NOT NULL)
);
-- Um único processo ativo por colaborador; reabrir exige cancelar/encerrar o anterior.
CREATE UNIQUE INDEX processo_desligamento_um_ativo
  ON rh.processo_desligamento (colaborador_id)
  WHERE estado NOT IN ('encerrado','cancelado');
CREATE INDEX processo_desligamento_por_pessoa
  ON rh.processo_desligamento (colaborador_id, criado_em DESC);
-- Semáforo do prazo do 477 no painel do DP.
CREATE INDEX processo_desligamento_fila
  ON rh.processo_desligamento (estado, data_limite_477);
CREATE TRIGGER processo_desligamento_tocar BEFORE UPDATE ON rh.processo_desligamento
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- Processo é registro com efeito legal: nunca é apagado; estado terminal
-- (encerrado/cancelado) é imutável — correção é processo novo.
CREATE FUNCTION rh.bloquear_processo_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'processo_desligamento nunca é apagado — cancele com motivo';
  END IF;
  IF OLD.estado IN ('encerrado','cancelado') THEN
    RAISE EXCEPTION 'processo_desligamento em estado terminal (%) é imutável', OLD.estado;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER processo_desligamento_congelar
  BEFORE UPDATE OR DELETE ON rh.processo_desligamento
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_processo_terminal();

-- ---------------------------------------------------------------- verificação de estabilidade (append-only)
-- Gate de abertura: verificação automática onde há dado (afastamento
-- acidentário) e declaração humana obrigatória onde não há (gestante).
-- Reavaliação/override = registro novo com justificativa; nada se sobrescreve.
CREATE TABLE rh.verificacao_estabilidade (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  processo_id         BIGINT NOT NULL REFERENCES rh.processo_desligamento (id),
  tipo                TEXT NOT NULL CHECK (tipo IN
                        ('acidentario','cipeiro','gestante','pre_aposentadoria','outra')),
  resultado           TEXT NOT NULL CHECK (resultado IN ('livre','condicionado','bloqueado')),
  origem              TEXT NOT NULL CHECK (origem IN ('declaracao','afastamento')),
  justificativa       TEXT,
  decisor_usuario_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  em                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verificacao_estabilidade_por_processo
  ON rh.verificacao_estabilidade (processo_id, em);
CREATE TRIGGER verificacao_estabilidade_imutavel
  BEFORE UPDATE OR DELETE ON rh.verificacao_estabilidade
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- itens de devolução
-- EPIs e ativos (lista manual no MVP). Item não devolvido registra o FATO;
-- desconto só com autorização escrita, como variável do motor de folha —
-- nunca valor aqui. Termo de devolução vai ao GED (rh.documento + ciência).
CREATE TABLE rh.item_devolucao (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  processo_id    BIGINT NOT NULL REFERENCES rh.processo_desligamento (id),
  categoria      TEXT NOT NULL CHECK (categoria IN
                   ('epi','notebook','cracha','uniforme','chave','celular','outro')),
  descricao      TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','devolvido','avariado','extraviado')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX item_devolucao_por_processo ON rh.item_devolucao (processo_id);
CREATE TRIGGER item_devolucao_tocar BEFORE UPDATE ON rh.item_devolucao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- roteiro de entrevista (versão com vigência)
-- Perguntas estruturadas em JSONB; mudar o roteiro = nova versão (a resposta
-- referencia a versão que valeu). No máximo UMA versão ativa por vez.
CREATE TABLE rh.roteiro_entrevista_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  versao           INT NOT NULL UNIQUE CHECK (versao >= 1),
  nome             TEXT NOT NULL,
  -- [{"chave": "...", "texto": "...", "tipo": "texto|escala_1_5|sim_nao", "opcional": bool}]
  perguntas        JSONB NOT NULL
                   CHECK (jsonb_typeof(perguntas) = 'array'
                          AND jsonb_array_length(perguntas) >= 1),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX roteiro_entrevista_versao_uma_ativa
  ON rh.roteiro_entrevista_versao (status) WHERE status = 'ativa';
CREATE TRIGGER roteiro_entrevista_versao_tocar BEFORE UPDATE ON rh.roteiro_entrevista_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER roteiro_entrevista_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.roteiro_entrevista_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- entrevista de desligamento
-- Oferta obrigatória e auditada; participação voluntária (recusa sem
-- prejuízo). O indicador de cobertura usa APENAS o status — nunca o conteúdo.
-- Conduzida por RH, nunca pelo gestor que desligou (regra no serviço).
CREATE TABLE rh.entrevista_desligamento (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  processo_id               BIGINT NOT NULL UNIQUE REFERENCES rh.processo_desligamento (id),
  roteiro_versao_id         BIGINT NOT NULL REFERENCES rh.roteiro_entrevista_versao (id),
  status                    TEXT NOT NULL DEFAULT 'oferecida' CHECK (status IN
                              ('oferecida','agendada','realizada','recusada','nao_realizada')),
  data_oferta               DATE NOT NULL,
  data_agendada             DATE,
  data_realizacao           DATE,
  motivo_nao_realizacao     TEXT,
  -- congelado na oferta a partir de tipo_desligamento_versao.elegivel_entrevista
  elegivel_indicador        BOOLEAN NOT NULL,
  -- RESTRITO: AUSENTE do payload de quem não tem entrevista.respostas.ver;
  -- leitura autorizada grava audit.leitura_sensivel (na aplicação).
  -- Objeto {chave_da_pergunta: resposta}, validado contra o roteiro no serviço.
  respostas                 JSONB,
  entrevistador_usuario_id  BIGINT REFERENCES sistema.usuario (id),
  consentimento_uso_agregado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'agendada' OR data_agendada IS NOT NULL),
  CHECK (status <> 'realizada'
         OR (data_realizacao IS NOT NULL AND entrevistador_usuario_id IS NOT NULL)),
  CHECK ((motivo_nao_realizacao IS NOT NULL) = (status = 'nao_realizada')),
  CHECK (respostas IS NULL OR status = 'realizada')
);
CREATE TRIGGER entrevista_desligamento_tocar BEFORE UPDATE ON rh.entrevista_desligamento
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- trava de encerramento
-- Garantia estrutural da funcionalidade 12: o serviço valida antes, mas o
-- banco impede o silêncio — processo de tipo elegível não encerra sem oferta
-- registrada, e nenhum processo encerra com entrevista em estado pendente.
-- É o que torna o indicador de cobertura confiável (100% com desfecho).
CREATE FUNCTION rh.travar_encerramento_sem_entrevista() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_elegivel  BOOLEAN;
  v_status    TEXT;
BEGIN
  IF NEW.estado = 'encerrado' AND OLD.estado <> 'encerrado' THEN
    SELECT t.elegivel_entrevista INTO v_elegivel
      FROM rh.tipo_desligamento_versao t
     WHERE t.id = NEW.tipo_desligamento_versao_id;
    SELECT e.status INTO v_status
      FROM rh.entrevista_desligamento e
     WHERE e.processo_id = NEW.id;
    IF v_status IS NULL THEN
      IF v_elegivel THEN
        RAISE EXCEPTION 'processo_desligamento: tipo elegível não encerra sem entrevista ofertada';
      END IF;
    ELSIF v_status NOT IN ('realizada','recusada','nao_realizada') THEN
      RAISE EXCEPTION 'processo_desligamento: não encerra com entrevista pendente (status %)', v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER processo_desligamento_trava_entrevista
  BEFORE UPDATE ON rh.processo_desligamento
  FOR EACH ROW EXECUTE FUNCTION rh.travar_encerramento_sem_entrevista();

-- ---------------------------------------------------------------- seed dos tipos (v1 ativa)
-- Valores de processo validados com DP/jurídico antes do go-live (perguntas
-- abertas do módulo 11); mudar atributo = nova versão, nunca UPDATE.
INSERT INTO rh.tipo_desligamento_versao
  (tipo, versao, nome, exige_aviso, admite_indenizado, direito_manutencao_plano,
   elegivel_entrevista, status, inicio_vigencia)
VALUES
  ('pedido_demissao',     1, 'Pedido de demissão',                     TRUE,  TRUE,  FALSE, TRUE,  'ativa', CURRENT_DATE),
  ('sem_justa_causa',     1, 'Dispensa sem justa causa',               TRUE,  TRUE,  TRUE,  TRUE,  'ativa', CURRENT_DATE),
  ('justa_causa',         1, 'Dispensa por justa causa',               FALSE, FALSE, FALSE, FALSE, 'ativa', CURRENT_DATE),
  ('acordo_484a',         1, 'Acordo entre as partes (art. 484-A)',    TRUE,  TRUE,  FALSE, TRUE,  'ativa', CURRENT_DATE),
  ('termino_experiencia', 1, 'Término de contrato de experiência',     FALSE, FALSE, FALSE, TRUE,  'ativa', CURRENT_DATE),
  ('termino_temporario',  1, 'Término de contrato temporário',         FALSE, FALSE, FALSE, TRUE,  'ativa', CURRENT_DATE);

-- ---------------------------------------------------------------- seed do roteiro (v1 ativa)
INSERT INTO rh.roteiro_entrevista_versao (versao, nome, perguntas, status, inicio_vigencia)
VALUES
  (1, 'Roteiro padrão de entrevista de desligamento',
   '[
      {"chave": "motivo_percebido", "texto": "Na sua percepção, qual foi o principal motivo da sua saída?", "tipo": "texto"},
      {"chave": "clima",            "texto": "Como você avalia o clima na sua equipe e na empresa?", "tipo": "escala_1_5"},
      {"chave": "gestao",           "texto": "Como você avalia a relação com a sua gestão direta?", "tipo": "escala_1_5"},
      {"chave": "recomendaria",     "texto": "Você recomendaria a empresa como lugar para trabalhar?", "tipo": "sim_nao"},
      {"chave": "comentario",       "texto": "Deixe aqui qualquer comentário adicional.", "tipo": "texto", "opcional": true}
    ]'::jsonb,
   'ativa', CURRENT_DATE);

-- ---------------------------------------------------------------- permissões
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('desligamento.iniciar',      'Abrir processo de desligamento (gate de verificação de estabilidades)'),
  ('desligamento.gerir',        'Conduzir o processo: transições, devoluções, prazos e cancelamento'),
  ('desligamento.ver',          'Ver processos de desligamento (sem motivo e sem respostas de entrevista)'),
  ('desligamento.motivo.ver',   'Ver motivo do desligamento (restrito; leitura gera trilha)'),
  ('entrevista.conduzir',       'Ofertar, agendar e registrar entrevista de desligamento'),
  ('entrevista.respostas.ver',  'Ver respostas de entrevista de desligamento (restrito; leitura gera trilha)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',        'desligamento.iniciar'),
  ('dp',        'desligamento.gerir'),
  ('dp',        'desligamento.ver'),
  ('rh',        'desligamento.ver'),
  ('dp',        'desligamento.motivo.ver'),
  ('diretoria', 'desligamento.motivo.ver'),
  ('rh',        'entrevista.conduzir'),
  ('dp',        'entrevista.conduzir'),
  ('dp',        'entrevista.respostas.ver'),
  ('diretoria', 'entrevista.respostas.ver');

COMMIT;
