-- 0022_pesquisas.sql
-- Pesquisa estruturada de clima (anual / pulse / eNPS) com plano de ação.
-- MÓDULO PRÓPRIO, ao lado do check-in diário — decisão do usuário 2026-07-29
-- ("prefiro separar — um módulo de check-in diário e um módulo para a pesquisa
-- anual"), reabrindo a lacuna que a analista de RH apontou em
-- docs/08-analise-feedback-analista-rh.md item 5. Reaproveita o schema
-- rh_clima porque é o mesmo assunto e a mesma fronteira de credencial; NADA
-- aqui toca as tabelas do check-in (pergunta_versao / checkin_resposta).
--
-- O MODELO DE PRIVACIDADE É O OPOSTO DO CHECK-IN, de propósito:
--   check-in diário  = confidencial-IDENTIFICADO (resposta com FK de
--                      colaborador; leitura individual só da Diretoria, com
--                      trilha) — serve para agir sobre a pessoa;
--   pesquisa de clima = ANÔNIMA por padrão (resposta SEM FK de colaborador;
--                      só a unidade como recorte) — serve para diagnosticar o
--                      ambiente, e só é honesta se ninguém puder voltar da
--                      resposta para a pessoa.
-- Quem respondeu é registrado em tabela SEPARADA (participacao_pesquisa): ela
-- evita convite/resposta duplicada e mede adesão sem nunca saber O QUE a
-- pessoa respondeu. As duas tabelas não têm como ser cruzadas: não existe
-- coluna comum, e criada_em da resposta é truncada no dia (ver abaixo).
--
-- Regras que vivem no SERVIÇO (src/dominios/pesquisas/servico.ts):
--   * k-anonimato de 5 em TODO recorte de resultado — menos de 5 respostas
--     devolve "amostra insuficiente", nunca o número;
--   * eNPS = %promotores(9–10) − %detratores(0–6), em pontos percentuais;
--   * pesquisa só recebe resposta quando status = 'aberta' e dentro do período;
--   * texto livre só para quem tem pesquisa.resultado.ver, sem unidade e sem
--     qualquer identificação;
--   * gestor com pesquisa.plano.gerir age somente na PRÓPRIA unidade.

BEGIN;

-- ---------------------------------------------------------------- pesquisa
-- rascunho -> aberta -> encerrada. Em rascunho monta-se o questionário; ao
-- abrir, o questionário congela (trigger abaixo); encerrada não recebe mais
-- resposta e é o estado em que o resultado é definitivo.
CREATE TABLE rh_clima.pesquisa (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo         TEXT NOT NULL CHECK (btrim(titulo) <> ''),
  tipo           TEXT NOT NULL CHECK (tipo IN ('anual','pulse','enps')),
  descricao      TEXT CHECK (descricao IS NULL OR btrim(descricao) <> ''),
  inicio         DATE NOT NULL,
  fim            DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','aberta','encerrada')),
  -- Padrão TRUE: o anonimato é a regra, não a exceção. Com FALSE o serviço
  -- ainda NÃO grava vínculo de resposta→pessoa (v1 não implementa pesquisa
  -- identificada); a coluna existe para a tela avisar o respondente e para a
  -- evolução registrada na seção de pendências do serviço.
  anonima        BOOLEAN NOT NULL DEFAULT TRUE,
  criada_por     BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  aberta_em      TIMESTAMPTZ,
  encerrada_em   TIMESTAMPTZ,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim >= inicio),
  CHECK (status <> 'rascunho'  OR (aberta_em IS NULL AND encerrada_em IS NULL)),
  CHECK (status <> 'aberta'    OR (aberta_em IS NOT NULL AND encerrada_em IS NULL)),
  CHECK (status <> 'encerrada' OR encerrada_em IS NOT NULL)
);
CREATE INDEX pesquisa_por_status ON rh_clima.pesquisa (status, fim DESC);
CREATE TRIGGER pesquisa_tocar BEFORE UPDATE ON rh_clima.pesquisa
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- Encerrada é histórico: nunca volta atrás, nunca é apagada. Reabrir uma
-- pesquisa depois de divulgar o resultado invalidaria o próprio resultado.
CREATE FUNCTION rh_clima.pesquisa_proteger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'pesquisa: % já foi aberta e não pode ser excluída', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'encerrada' THEN
    RAISE EXCEPTION 'pesquisa: % está encerrada e é imutável', OLD.id;
  END IF;
  IF OLD.status = 'aberta' AND NEW.status = 'rascunho' THEN
    RAISE EXCEPTION 'pesquisa: aberta não volta para rascunho';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pesquisa_proteger
  BEFORE UPDATE OR DELETE ON rh_clima.pesquisa
  FOR EACH ROW EXECUTE FUNCTION rh_clima.pesquisa_proteger();

-- ---------------------------------------------------------------- pergunta
-- opcoes só existe em escolha_unica (array JSONB de rótulos) — o CHECK amarra
-- os dois lados para não haver escolha sem opção nem opção sem escolha.
CREATE TABLE rh_clima.pergunta_pesquisa (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pesquisa_id  BIGINT NOT NULL REFERENCES rh_clima.pesquisa (id),
  ordem        SMALLINT NOT NULL CHECK (ordem > 0),
  enunciado    TEXT NOT NULL CHECK (btrim(enunciado) <> ''),
  tipo         TEXT NOT NULL CHECK (tipo IN
                 ('escala_1_5','nps_0_10','texto_livre','escolha_unica')),
  opcoes       JSONB,
  obrigatoria  BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pergunta_pesquisa_ordem_unica UNIQUE (pesquisa_id, ordem),
  CHECK ((tipo = 'escolha_unica') = (opcoes IS NOT NULL)),
  CHECK (opcoes IS NULL OR (jsonb_typeof(opcoes) = 'array'
                            AND jsonb_array_length(opcoes) BETWEEN 2 AND 12))
);
CREATE INDEX pergunta_pesquisa_por_pesquisa
  ON rh_clima.pergunta_pesquisa (pesquisa_id, ordem);

-- Questionário congela na abertura: mudar enunciado/tipo/opção de pesquisa que
-- já recebeu resposta faria a resposta antiga responder a outra pergunta.
CREATE FUNCTION rh_clima.pergunta_pesquisa_congelar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
  v_id     BIGINT;
BEGIN
  v_id := COALESCE(NEW.pesquisa_id, OLD.pesquisa_id);
  SELECT status INTO v_status FROM rh_clima.pesquisa WHERE id = v_id;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'pergunta_pesquisa: pesquisa % não é rascunho — questionário congelado', v_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER pergunta_pesquisa_congelar
  BEFORE INSERT OR UPDATE OR DELETE ON rh_clima.pergunta_pesquisa
  FOR EACH ROW EXECUTE FUNCTION rh_clima.pergunta_pesquisa_congelar();

-- ---------------------------------------------------------------- resposta (ANÔNIMA, append-only)
-- SEM colaborador_id, SEM usuario_id — e isso é a garantia, não um esquecimento.
-- O único recorte agregável é unidade_id (o estabelecimento da lotação vigente
-- no momento em que a pessoa respondeu), NULL para quem não tem lotação.
--
-- criada_em é truncada no DIA de propósito: com carimbo de segundo daria para
-- alinhar esta tabela com participacao_pesquisa.respondida_em e reidentificar
-- o autor de cada resposta — exatamente o que o anonimato promete impedir.
CREATE TABLE rh_clima.resposta_pesquisa (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pesquisa_id     BIGINT NOT NULL REFERENCES rh_clima.pesquisa (id),
  pergunta_id     BIGINT NOT NULL REFERENCES rh_clima.pergunta_pesquisa (id),
  valor_numerico  SMALLINT,
  valor_texto     TEXT CHECK (valor_texto IS NULL OR btrim(valor_texto) <> ''),
  unidade_id      BIGINT REFERENCES rh.estabelecimento (id),
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', now()),
  CHECK (valor_numerico IS NOT NULL OR valor_texto IS NOT NULL),
  -- Faixa ampla no banco (0–10 cobre escala_1_5 e nps_0_10); a faixa exata por
  -- tipo de pergunta é validada no serviço, que conhece o tipo.
  CHECK (valor_numerico IS NULL OR valor_numerico BETWEEN 0 AND 10)
);
CREATE INDEX resposta_pesquisa_por_pergunta
  ON rh_clima.resposta_pesquisa (pergunta_id);
CREATE INDEX resposta_pesquisa_por_pesquisa_unidade
  ON rh_clima.resposta_pesquisa (pesquisa_id, unidade_id);
CREATE TRIGGER resposta_pesquisa_imutavel
  BEFORE UPDATE OR DELETE ON rh_clima.resposta_pesquisa
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- participação (QUE respondeu, nunca O QUE)
-- Tabela separada por desenho: é o que impede resposta duplicada e o que mede
-- adesão. Não guarda nenhum conteúdo de resposta.
CREATE TABLE rh_clima.participacao_pesquisa (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pesquisa_id     BIGINT NOT NULL REFERENCES rh_clima.pesquisa (id),
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  respondida_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participacao_pesquisa_unica UNIQUE (pesquisa_id, colaborador_id)
);
CREATE TRIGGER participacao_pesquisa_imutavel
  BEFORE UPDATE OR DELETE ON rh_clima.participacao_pesquisa
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- plano de ação
-- O que fecha o ciclo: diagnóstico sem plano é relatório. unidade_id NULL =
-- plano da empresa; preenchido = plano daquela unidade (o único que o gestor
-- pode criar/mexer, conferido no serviço pela lotação vigente dele).
CREATE TABLE rh_clima.plano_acao (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pesquisa_id         BIGINT NOT NULL REFERENCES rh_clima.pesquisa (id),
  unidade_id          BIGINT REFERENCES rh.estabelecimento (id),
  titulo              TEXT NOT NULL CHECK (btrim(titulo) <> ''),
  descricao           TEXT CHECK (descricao IS NULL OR btrim(descricao) <> ''),
  responsavel_usuario BIGINT NOT NULL REFERENCES sistema.usuario (id),
  prazo               DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'aberto'
                      CHECK (status IN ('aberto','em_andamento','concluido','cancelado')),
  criado_por_usuario  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em        TIMESTAMPTZ,
  CHECK ((status IN ('concluido','cancelado')) = (concluido_em IS NOT NULL))
);
CREATE INDEX plano_acao_por_pesquisa
  ON rh_clima.plano_acao (pesquisa_id, unidade_id);
CREATE INDEX plano_acao_por_responsavel
  ON rh_clima.plano_acao (responsavel_usuario, status);
CREATE TRIGGER plano_acao_tocar BEFORE UPDATE ON rh_clima.plano_acao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- permissões
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('pesquisa.administrar',
   'Criar pesquisa de clima, montar o questionário, abrir e encerrar'),
  ('pesquisa.responder',
   'Responder as pesquisas de clima abertas'),
  ('pesquisa.resultado.ver',
   'Ver resultado agregado da pesquisa (médias, eNPS e comentários anônimos, sempre com amostra mínima)'),
  ('pesquisa.plano.gerir',
   'Criar e acompanhar plano de ação da pesquisa (gestor: somente da própria unidade)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('rh',          'pesquisa.administrar'),
  ('dp',          'pesquisa.administrar'),
  -- "Responder" é de todo mundo, igual clima.responder (0001).
  ('funcionario', 'pesquisa.responder'),
  ('gestor',      'pesquisa.responder'),
  ('rh',          'pesquisa.responder'),
  ('dp',          'pesquisa.responder'),
  ('diretoria',   'pesquisa.responder'),
  ('rh',          'pesquisa.resultado.ver'),
  ('dp',          'pesquisa.resultado.ver'),
  ('diretoria',   'pesquisa.resultado.ver'),
  -- lider_td ainda NÃO existe como papel em sistema.usuario (CHECK da 0001
  -- lista 6 papéis). A linha entra agora porque a granularidade de papéis
  -- (`recrutador`, `lider_td`) é decisão registrada em
  -- 00_contexto/decisoes_arquiteturais.md: quando o papel for criado, o acesso
  -- ao resultado já vem pronto. Até então a linha é inerte — tem_permissao só
  -- casa com o papel de um usuário existente.
  ('lider_td',    'pesquisa.resultado.ver'),
  ('rh',          'pesquisa.plano.gerir'),
  ('dp',          'pesquisa.plano.gerir'),
  ('gestor',      'pesquisa.plano.gerir');

-- ---------------------------------------------------------------- catálogo dos indicadores
-- Só o catálogo, no padrão da 0018. A ligação chave -> fonte de apuração vive
-- em src/dominios/indicadores/valores.ts (arquivo do integrador); o domínio de
-- pesquisas exporta valorIndicadorAdesaoPesquisa() e valorIndicadorEnps().
-- Enquanto a fonte não estiver no registry, apurarValoresIndicadores ignora a
-- linha (filtro comFonte) — a Central de Metas não mostra número errado.
--
-- eNPS vive em PONTOS (−100 a +100) e não em porcentagem; rh.indicador.unidade
-- só admite ('%','qtd','dias'), então usamos '%' como a unidade mais próxima
-- (formatação "42%" onde o certo seria "42 pontos"). Evolução: acrescentar
-- 'pontos' ao CHECK de rh.indicador em migration do dono daquele módulo.
INSERT INTO rh.indicador (chave, nome, area, descricao, unidade, direcao) VALUES
  ('adesao_pesquisa', 'Adesão à pesquisa de clima', 'Clima',
   'Colaboradores que responderam ÷ ativos, na última pesquisa encerrada.', '%', 'maior'),
  ('enps', 'eNPS', 'Clima',
   'Promotores (9–10) menos detratores (0–6) da última pesquisa encerrada com pergunta eNPS, em pontos.', '%', 'maior')
ON CONFLICT (chave) DO NOTHING;

COMMIT;
