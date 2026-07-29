-- 0010_admissao.sql
-- Admissão (parte INTERNA do docs/03-modulos/09-recrutamento-admissao.md):
-- checklist de admissão versionado com vigência, processo de admissão 1:1 com
-- o colaborador já cadastrado pelo DP e itens do checklist instanciados no
-- processo. O canal público externo (link tokenizado do admitido, ficha
-- cadastral, GED de documentos do processo) está FORA — decisão pendente da
-- Fase 0 (construir × contratar). Regras de aplicação: abrir processo congela
-- a versão ativa do checklist e materializa os itens; concluir exige itens
-- obrigatórios resolvidos; conclusão/cancelamento grava audit.alteracao e a
-- conclusão registra rh.evento_colaborador (origem: processo_admissao).
-- Prazos de experiência (dia 45 / dia 90) calculados pela aplicação a partir
-- da data de admissão — alertas D-3/D-1 são do n8n, não do banco.

BEGIN;

-- ---------------------------------------------------------------- checklist de admissão (versão com vigência)
-- Parametrizável versionado (padrão do 0002/0003): mudar o checklist = nova
-- versão; processos abertos seguem a versão congelada na abertura. Itens em
-- JSONB ordenado: [{"ordem": 1, "descricao": "...", "obrigatorio": true}, …].
CREATE TABLE rh.checklist_admissao_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  versao           INT NOT NULL UNIQUE CHECK (versao >= 1),
  itens            JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(itens) = 'array' AND jsonb_array_length(itens) > 0),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX checklist_admissao_versao_uma_ativa
  ON rh.checklist_admissao_versao (status) WHERE status = 'ativa';
CREATE TRIGGER checklist_admissao_versao_tocar
  BEFORE UPDATE ON rh.checklist_admissao_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER checklist_admissao_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.checklist_admissao_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- processo de admissão
-- 1:1 com o colaborador (UNIQUE): o DP cadastra a ficha e abre o processo de
-- preparação da entrada. checklist_versao_id pina a versão vigente na
-- abertura. Contrato de experiência (CLT, 45+45 — art. 445 CLT): prazos
-- calculados pela aplicação sobre a data de admissão; sem experiência, ambos
-- ficam NULL.
CREATE TABLE rh.processo_admissao (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id        BIGINT NOT NULL UNIQUE REFERENCES rh.colaborador (id),
  checklist_versao_id   BIGINT NOT NULL REFERENCES rh.checklist_admissao_versao (id),
  data_inicio_prevista  DATE NOT NULL,
  estado                TEXT NOT NULL DEFAULT 'em_preparacao'
                        CHECK (estado IN ('em_preparacao','concluido','cancelado')),
  contrato_experiencia  BOOLEAN NOT NULL DEFAULT TRUE,
  prazo_experiencia_1   DATE,   -- dia 45 (fim do 1º período)
  prazo_experiencia_2   DATE,   -- dia 90 (fim da prorrogação)
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (contrato_experiencia
         OR (prazo_experiencia_1 IS NULL AND prazo_experiencia_2 IS NULL)),
  CHECK (prazo_experiencia_1 IS NULL OR prazo_experiencia_2 IS NULL
         OR prazo_experiencia_2 > prazo_experiencia_1)
);
CREATE INDEX processo_admissao_painel
  ON rh.processo_admissao (estado, data_inicio_prevista);
CREATE TRIGGER processo_admissao_tocar BEFORE UPDATE ON rh.processo_admissao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- itens do processo
-- Materializados na abertura a partir do JSONB da versão congelada — o
-- andamento vive aqui (o template nunca muda sob o processo). concluido_por/
-- concluido_em registram quem resolveu o item (concluído OU não aplicável).
CREATE TABLE rh.item_admissao (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  processo_id    BIGINT NOT NULL REFERENCES rh.processo_admissao (id),
  ordem          INT NOT NULL CHECK (ordem >= 1),
  descricao      TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  obrigatorio    BOOLEAN NOT NULL DEFAULT TRUE,
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','concluido','nao_aplicavel')),
  concluido_por  BIGINT REFERENCES sistema.usuario (id),
  concluido_em   TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processo_id, ordem),
  CHECK ((status = 'pendente') = (concluido_por IS NULL)),
  CHECK ((status = 'pendente') = (concluido_em IS NULL))
);
CREATE TRIGGER item_admissao_tocar BEFORE UPDATE ON rh.item_admissao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- seed do checklist (v1 ativa)
INSERT INTO rh.checklist_admissao_versao (versao, itens, status, inicio_vigencia)
VALUES (
  1,
  '[
    {"ordem": 1, "descricao": "Documentos recebidos e conferidos", "obrigatorio": true},
    {"ordem": 2, "descricao": "Exame admissional (ASO) apto antes do início", "obrigatorio": true},
    {"ordem": 3, "descricao": "Contrato de trabalho assinado", "obrigatorio": true},
    {"ordem": 4, "descricao": "Acessos criados (sistemas e e-mail)", "obrigatorio": true},
    {"ordem": 5, "descricao": "EPI/uniforme entregue", "obrigatorio": false},
    {"ordem": 6, "descricao": "Integração e treinamento inicial realizados", "obrigatorio": true}
  ]'::jsonb,
  'ativa',
  CURRENT_DATE
);

-- ---------------------------------------------------------------- permissões
-- Gestor vê SOMENTE processos de liderados (relacao_gestor vigente, filtro no
-- serviço) e sem dados sensíveis no payload.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('admissao.gerir', 'Gerir processos de admissão: abrir, tratar itens do checklist, concluir/cancelar e administrar versões do checklist'),
  ('admissao.ver',   'Ver processos de admissão (gestor vê apenas os dos liderados vigentes)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',     'admissao.gerir'),
  ('dp',     'admissao.ver'),
  ('rh',     'admissao.ver'),
  ('gestor', 'admissao.ver');

COMMIT;
