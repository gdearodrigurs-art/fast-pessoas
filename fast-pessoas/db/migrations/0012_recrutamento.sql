-- 0012_recrutamento.sql
-- Recrutamento e Seleção (MVP do docs/03-modulos/13-recrutamento-selecao.md):
-- requisição de vaga com decisão registrada, vaga com banda salarial congelada
-- da tabela vigente na criação, etapas de seleção versionadas com vigência,
-- candidato (titular EXTERNO — minimização por desenho), candidatura com
-- pipeline, movimentação append-only com motivo por catálogo controlado
-- (Lei 9.029: nada de texto livre persistido como motivo), parecer de seleção
-- append-only e RESTRITO (nunca migra para a ficha do colaborador; ciclo de
-- vida atrelado à candidatura) e oferta com trava de fora-da-banda.
-- O canal público externo (slug/página de candidatura, credencial
-- app_recrutamento_externo) está FORA deste MVP. A fronteira com a admissão é
-- do serviço: oferta aceita dispara rh.processo_admissao (0010) na mesma
-- transação. Retenção/anonimização de candidato (job de temporalidade LGPD)
-- opera no domínio — nunca no audit.

BEGIN;

-- ---------------------------------------------------------------- requisição de vaga
-- Gestor/RH/DP solicita; decisão única registrada (decisor + quando + motivo).
-- Reposição × aumento de quadro orienta o rito; validação contra quadro
-- autorizado é evolução (Fase 3). Toda transição grava audit.alteracao.
CREATE TABLE rh.requisicao_vaga (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cargo_versao_id             BIGINT NOT NULL REFERENCES rh.cargo_versao (id),
  estabelecimento_versao_id   BIGINT REFERENCES rh.estabelecimento_versao (id),
  motivo                      TEXT NOT NULL CHECK (motivo IN ('reposicao','aumento_quadro')),
  justificativa               TEXT NOT NULL CHECK (btrim(justificativa) <> ''),
  solicitante_usuario_id      BIGINT NOT NULL REFERENCES sistema.usuario (id),
  status                      TEXT NOT NULL DEFAULT 'solicitada'
                              CHECK (status IN ('solicitada','aprovada','reprovada')),
  decisor_usuario_id          BIGINT REFERENCES sistema.usuario (id),
  decidido_em                 TIMESTAMPTZ,
  motivo_decisao              TEXT,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- decisão sempre completa: quem e quando andam juntos com o status
  CHECK ((status = 'solicitada') = (decisor_usuario_id IS NULL)),
  CHECK ((status = 'solicitada') = (decidido_em IS NULL)),
  CHECK (status <> 'solicitada' OR motivo_decisao IS NULL)
);
CREATE INDEX requisicao_vaga_fila ON rh.requisicao_vaga (status, criado_em);
CREATE TRIGGER requisicao_vaga_tocar BEFORE UPDATE ON rh.requisicao_vaga
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- vaga
-- Nasce somente de requisição aprovada (regra no serviço); 1:1 com a
-- requisição. faixa_min/faixa_max são SNAPSHOT congelado da
-- rh.tabela_salarial_versao vigente na criação (copiadas pela aplicação, sem
-- FK) — mudança posterior da tabela não mexe em vaga aberta. prazo_alvo
-- alimenta o indicador de % de vagas fechadas no prazo (metas na Central).
CREATE TABLE rh.vaga (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requisicao_id  BIGINT NOT NULL UNIQUE REFERENCES rh.requisicao_vaga (id),
  titulo         TEXT NOT NULL CHECK (btrim(titulo) <> ''),
  faixa_min      NUMERIC(12,2) NOT NULL CHECK (faixa_min >= 0),
  faixa_max      NUMERIC(12,2) NOT NULL,
  prazo_alvo     DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'aberta'
                 CHECK (status IN ('aberta','congelada','fechada','cancelada')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (faixa_max >= faixa_min)
);
CREATE INDEX vaga_painel ON rh.vaga (status, prazo_alvo);
CREATE TRIGGER vaga_tocar BEFORE UPDATE ON rh.vaga
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- etapas de seleção (versão com vigência)
-- Template do pipeline administrável pelo RH (nunca enum rígido): mudar
-- etapa = nova versão; candidatura referencia a versão que valeu. No máximo
-- UMA versão ativa por tipo, e ordem única entre as ativas.
CREATE TABLE rh.etapa_selecao_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo             TEXT NOT NULL CHECK (tipo IN
                     ('triagem','entrevista_rh','entrevista_gestor','oferta')),
  versao           INT NOT NULL DEFAULT 1 CHECK (versao >= 1),
  ordem            INT NOT NULL CHECK (ordem >= 1),
  nome             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, versao),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX etapa_selecao_versao_uma_ativa
  ON rh.etapa_selecao_versao (tipo) WHERE status = 'ativa';
CREATE UNIQUE INDEX etapa_selecao_versao_ordem_ativa
  ON rh.etapa_selecao_versao (ordem) WHERE status = 'ativa';
CREATE TRIGGER etapa_selecao_versao_tocar BEFORE UPDATE ON rh.etapa_selecao_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER etapa_selecao_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.etapa_selecao_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- candidato — titular EXTERNO
-- Minimização por desenho: só o necessário para seleção e deduplicação. CPF
-- opcional (apenas o número — chave de deduplicação e de direitos do titular);
-- SEM FK para sistema.usuario — candidato não é usuário nem colaborador; sem
-- RG/documentos/dados bancários (isso é admissão, módulo 09). consentido_ate
-- rege a retenção estendida (banco de talentos); sem consentimento vale a
-- retenção curta padrão. Anonimização pelo job de temporalidade — o audit
-- nunca é tocado. Dados AUSENTES do payload de quem não tem rs.ver.
CREATE TABLE rh.candidato (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome                TEXT NOT NULL CHECK (btrim(nome) <> ''),
  email               TEXT NOT NULL,
  telefone            TEXT,
  cpf                 CHAR(11) CHECK (cpf ~ '^[0-9]{11}$'),
  origem              TEXT NOT NULL CHECK (origem IN ('indicacao','site','portal','outro')),
  consentimento_lgpd  BOOLEAN NOT NULL,
  consentido_ate      DATE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- prazo de retenção estendida só existe com consentimento registrado
  CHECK (consentimento_lgpd OR consentido_ate IS NULL)
);
-- deduplicação na entrada: e-mail sempre; CPF quando informado
CREATE UNIQUE INDEX candidato_email_unico ON rh.candidato (lower(email));
CREATE UNIQUE INDEX candidato_cpf_unico ON rh.candidato (cpf) WHERE cpf IS NOT NULL;
CREATE TRIGGER candidato_tocar BEFORE UPDATE ON rh.candidato
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- candidatura
-- Candidato × vaga (única por par). etapa_atual é PROJEÇÃO da última
-- movimentação — o serviço grava movimentação e atualiza a projeção na mesma
-- transação; o histórico oficial vive em movimentacao_candidatura.
CREATE TABLE rh.candidatura (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vaga_id         BIGINT NOT NULL REFERENCES rh.vaga (id),
  candidato_id    BIGINT NOT NULL REFERENCES rh.candidato (id),
  etapa_atual_id  BIGINT NOT NULL REFERENCES rh.etapa_selecao_versao (id),
  status          TEXT NOT NULL DEFAULT 'ativa'
                  CHECK (status IN ('ativa','reprovada','desistiu','aprovada')),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vaga_id, candidato_id)
);
CREATE INDEX candidatura_kanban ON rh.candidatura (vaga_id, etapa_atual_id);
CREATE INDEX candidatura_por_candidato ON rh.candidatura (candidato_id);
CREATE TRIGGER candidatura_tocar BEFORE UPDATE ON rh.candidatura
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- movimentação da candidatura (append-only)
-- Cada passo do pipeline: entrada (de_etapa NULL), avanço/retorno de etapa
-- e/ou mudança de status. Motivo SEMPRE do catálogo controlado — texto livre
-- nunca é persistido como motivo (Lei 9.029); observação é complemento
-- opcional. Correção é registro novo; nada se sobrescreve.
CREATE TABLE rh.movimentacao_candidatura (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidatura_id   BIGINT NOT NULL REFERENCES rh.candidatura (id),
  de_etapa_id      BIGINT REFERENCES rh.etapa_selecao_versao (id),
  para_etapa_id    BIGINT REFERENCES rh.etapa_selecao_versao (id),
  novo_status      TEXT CHECK (novo_status IN ('ativa','reprovada','desistiu','aprovada')),
  motivo_catalogo  TEXT CHECK (motivo_catalogo IN
                     ('perfil','experiencia','salario','comportamental','desistencia','outro')),
  observacao       TEXT,
  por_usuario_id   BIGINT NOT NULL REFERENCES sistema.usuario (id),
  em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- movimentação sempre faz algo: muda etapa e/ou muda status
  CHECK (para_etapa_id IS NOT NULL OR novo_status IS NOT NULL),
  -- desfecho negativo exige motivo do catálogo
  CHECK (novo_status IS NULL
         OR novo_status NOT IN ('reprovada','desistiu')
         OR motivo_catalogo IS NOT NULL)
);
CREATE INDEX movimentacao_candidatura_por_candidatura
  ON rh.movimentacao_candidatura (candidatura_id, em);
CREATE TRIGGER movimentacao_candidatura_imutavel
  BEFORE UPDATE OR DELETE ON rh.movimentacao_candidatura
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- parecer de seleção (append-only) — RESTRITO
-- Opinião do avaliador por etapa. RESTRITO: AUSENTE do payload de quem não
-- tem rs.parecer.ver; leitura autorizada grava audit.leitura_sensivel (na
-- aplicação). INVARIANTE herdada do módulo 09: parecer NUNCA migra para a
-- ficha do colaborador — ciclo de vida atrelado à candidatura, anonimizado/
-- eliminado junto com ela pelo job de temporalidade. Correção é parecer novo.
CREATE TABLE rh.parecer_selecao (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidatura_id        BIGINT NOT NULL REFERENCES rh.candidatura (id),
  etapa_id              BIGINT NOT NULL REFERENCES rh.etapa_selecao_versao (id),
  avaliador_usuario_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  recomendacao          TEXT NOT NULL CHECK (recomendacao IN ('aprovar','reprovar','duvida')),
  observacoes           TEXT NOT NULL CHECK (btrim(observacoes) <> ''),
  em                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX parecer_selecao_por_candidatura
  ON rh.parecer_selecao (candidatura_id, em);
CREATE TRIGGER parecer_selecao_imutavel
  BEFORE UPDATE OR DELETE ON rh.parecer_selecao
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- oferta
-- Uma por candidatura. valor é DADO SENSÍVEL (salário): entra no payload só de
-- quem tem rs.gerir/rs.ver e a leitura grava audit.leitura_sensivel. O serviço
-- calcula dentro_banda contra a banda congelada da vaga; fora da banda exige
-- aprovação nominal registrada ANTES do envio (o CHECK torna o silêncio
-- impossível). Aceite dispara rh.processo_admissao (0010) na mesma transação
-- do serviço — a seleção termina na oferta aceita; a admissão começa aí.
CREATE TABLE rh.oferta (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidatura_id        BIGINT NOT NULL UNIQUE REFERENCES rh.candidatura (id),
  valor                 NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  dentro_banda          BOOLEAN NOT NULL,
  aprovacao_fora_banda  TEXT,
  status                TEXT NOT NULL DEFAULT 'enviada'
                        CHECK (status IN ('enviada','aceita','recusada')),
  respondida_em         TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- fora da banda sem aprovação registrada não existe
  CHECK (dentro_banda OR aprovacao_fora_banda IS NOT NULL),
  CHECK (aprovacao_fora_banda IS NULL OR btrim(aprovacao_fora_banda) <> ''),
  CHECK ((status = 'enviada') = (respondida_em IS NULL))
);
CREATE TRIGGER oferta_tocar BEFORE UPDATE ON rh.oferta
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- seed das etapas (v1 ativa)
-- Template padrão enxuto validado com RH antes do go-live; mudar etapa =
-- nova versão, nunca UPDATE.
INSERT INTO rh.etapa_selecao_versao (tipo, versao, ordem, nome, status, inicio_vigencia)
VALUES
  ('triagem',           1, 1, 'Triagem',                'ativa', CURRENT_DATE),
  ('entrevista_rh',     1, 2, 'Entrevista com o RH',    'ativa', CURRENT_DATE),
  ('entrevista_gestor', 1, 3, 'Entrevista com o gestor','ativa', CURRENT_DATE),
  ('oferta',            1, 4, 'Oferta',                 'ativa', CURRENT_DATE);

-- ---------------------------------------------------------------- permissões
-- Gestor cria requisição e registra parecer SÓ na sua vaga/etapa (escopo por
-- relacao_gestor/lotacao vigentes, filtro no serviço); não vê parecer alheio
-- nem o valor final da oferta. Candidato não tem conta nem acesso.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rs.requisicao.criar',   'Criar requisição de vaga (gestor: apenas para a própria área)'),
  ('rs.requisicao.decidir', 'Aprovar ou reprovar requisição de vaga (decisão registrada)'),
  ('rs.gerir',              'Gerir vagas, candidatos, pipeline e ofertas de seleção'),
  ('rs.parecer.registrar',  'Registrar parecer de seleção (gestor: apenas na sua vaga/etapa)'),
  ('rs.parecer.ver',        'Ver pareceres de seleção (restrito; leitura gera trilha)'),
  ('rs.ver',                'Ver requisições, vagas e pipeline de seleção');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('gestor',    'rs.requisicao.criar'),
  ('rh',        'rs.requisicao.criar'),
  ('dp',        'rs.requisicao.criar'),
  ('dp',        'rs.requisicao.decidir'),
  ('diretoria', 'rs.requisicao.decidir'),
  ('rh',        'rs.gerir'),
  ('dp',        'rs.gerir'),
  ('gestor',    'rs.parecer.registrar'),
  ('rh',        'rs.parecer.registrar'),
  ('dp',        'rs.parecer.registrar'),
  ('rh',        'rs.parecer.ver'),
  ('dp',        'rs.parecer.ver'),
  ('rh',        'rs.ver'),
  ('dp',        'rs.ver'),
  ('diretoria', 'rs.ver');

COMMIT;
