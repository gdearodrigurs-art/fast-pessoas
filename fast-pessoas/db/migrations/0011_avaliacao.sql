-- 0011_avaliacao.sql
-- Avaliação 360 v1 — líder→liderado (docs/03-modulos/05-avaliacao-360.md).
-- Base crítica: docs/anexos/auditoria-btime-360.md — este schema existe para
-- IMPOSSIBILITAR os erros estruturais do mockup btime:
--   (1) item não respondido virava nota zero → aqui toda resposta é nota 1–5
--       OU nao_observado explícito (CHECK XOR), e o envio só acontece com TODOS
--       os indicadores do modelo respondidos (trava no banco);
--   (2) pesos e faixas hardcoded no JS → aqui são DADO versionado com vigência
--       (modelo_avaliacao_versao); pilares/indicadores/faixas ficam imutáveis
--       após a ativação (trava no banco) — corrigir é criar versão nova;
--   (3) "Modelo v3" era um rótulo de texto → o ciclo CONGELA modelo_versao_id
--       na abertura; consolidação usa sempre a versão da época, sem recálculo
--       retroativo (resultado append-only);
--   (4) fronteiras de faixa ambíguas → faixa_resultado_versao com CHECK
--       minimo < maximo e semântica única [minimo, maximo) — última faixa
--       fecha em 100 inclusive (regra única, no serviço de consolidação);
--   (5) botões Renovar/Desligar sem handler → decisao_avaliacao append-only
--       com decisor, data e justificativa NOT NULL quando diverge da flag;
--       consolidação exige avaliação ENVIADA e decisão exige consolidação;
--   (6) sem estados/imutabilidade → avaliação rascunho→enviada; enviada é
--       imutável (reabertura = voltar a rascunho por evento auditado no
--       serviço; proibida após consolidação — correção é ciclo novo).
-- Regras do SERVIÇO (não do banco): soma dos pesos = 100 por nível e faixas
-- contíguas cobrindo 0–100 validadas na ATIVAÇÃO do modelo; ciclo aberto só
-- com modelo ativo; avaliador por relacao_gestor vigente na abertura; ciclos
-- de experiência gerados de processo_admissao (prazo_experiencia_1/2);
-- divergente calculado comparando decisão × recomendação da faixa; decisão
-- "desligar" referencia processo_desligamento; consolidação/decisão gravam
-- audit.alteracao + rh.evento_colaborador; leitura de resultado individual
-- grava audit.leitura_sensivel; percentual/nota AUSENTES do payload de quem
-- não tem avaliacao.resultado.ver.

BEGIN;

-- ---------------------------------------------------------------- modelo de avaliação (versão com vigência)
-- Parametrizável versionado (padrão 0002/0008): rascunho → ativa → encerrada;
-- no máximo UMA versão ativa; mudança de pilar/peso/faixa = versão nova.
CREATE TABLE rh.modelo_avaliacao_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  versao           INT NOT NULL UNIQUE CHECK (versao >= 1),
  nome             TEXT NOT NULL CHECK (btrim(nome) <> ''),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX modelo_avaliacao_versao_uma_ativa
  ON rh.modelo_avaliacao_versao (status) WHERE status = 'ativa';
CREATE TRIGGER modelo_avaliacao_versao_tocar BEFORE UPDATE ON rh.modelo_avaliacao_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER modelo_avaliacao_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.modelo_avaliacao_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- trava dos parâmetros do modelo
-- Erro btime nº 2: "regras administráveis" que eram constantes no JS. Aqui a
-- estrutura do modelo (pilares, indicadores, faixas) só muda enquanto a versão
-- está em RASCUNHO — depois de ativada, é imutável no banco.
CREATE FUNCTION rh.avaliacao_exigir_modelo_rascunho(p_modelo_id BIGINT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM rh.modelo_avaliacao_versao WHERE id = p_modelo_id;
  IF v_status IS DISTINCT FROM 'rascunho' THEN
    RAISE EXCEPTION
      'modelo de avaliação % não está em rascunho (%): pilares, indicadores e faixas são imutáveis — mudança é versão nova',
      p_modelo_id, COALESCE(v_status, 'inexistente');
  END IF;
END;
$$;

-- Para filhas com modelo_versao_id direto (pilar_avaliacao, faixa_resultado_versao).
CREATE FUNCTION rh.avaliacao_travar_parametro() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM rh.avaliacao_exigir_modelo_rascunho(NEW.modelo_versao_id);
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM rh.avaliacao_exigir_modelo_rascunho(OLD.modelo_versao_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Para indicador_avaliacao (modelo resolvido via pilar).
CREATE FUNCTION rh.avaliacao_travar_indicador() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_modelo_id BIGINT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT p.modelo_versao_id INTO v_modelo_id
      FROM rh.pilar_avaliacao p WHERE p.id = NEW.pilar_id;
    PERFORM rh.avaliacao_exigir_modelo_rascunho(v_modelo_id);
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT p.modelo_versao_id INTO v_modelo_id
      FROM rh.pilar_avaliacao p WHERE p.id = OLD.pilar_id;
    PERFORM rh.avaliacao_exigir_modelo_rascunho(v_modelo_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- pilares do modelo
-- Peso INT em pontos percentuais (1..100). "Soma = 100" é validação do
-- SERVIÇO na ativação; o banco garante que nenhum peso é zero/negativo
-- (erro btime: pesos decorativos que o cálculo ignorava).
CREATE TABLE rh.pilar_avaliacao (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modelo_versao_id  BIGINT NOT NULL REFERENCES rh.modelo_avaliacao_versao (id),
  nome              TEXT NOT NULL CHECK (btrim(nome) <> ''),
  peso              INT NOT NULL CHECK (peso >= 1 AND peso <= 100),
  ordem             INT NOT NULL CHECK (ordem >= 1),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (modelo_versao_id, ordem),
  UNIQUE (modelo_versao_id, nome)
);
CREATE TRIGGER pilar_avaliacao_tocar BEFORE UPDATE ON rh.pilar_avaliacao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER pilar_avaliacao_travar
  BEFORE INSERT OR UPDATE OR DELETE ON rh.pilar_avaliacao
  FOR EACH ROW EXECUTE FUNCTION rh.avaliacao_travar_parametro();

-- ---------------------------------------------------------------- indicadores por pilar
-- Peso RELATIVO dentro do pilar (soma 100 por pilar, validada na ativação).
-- descricao NOT NULL: avaliador sem régua = leniência/rigor sem controle
-- (erro btime nº 12 — Fit com frase de efeito e sem descritor).
CREATE TABLE rh.indicador_avaliacao (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pilar_id       BIGINT NOT NULL REFERENCES rh.pilar_avaliacao (id),
  nome           TEXT NOT NULL CHECK (btrim(nome) <> ''),
  descricao      TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  peso           INT NOT NULL CHECK (peso >= 1 AND peso <= 100),
  ordem          INT NOT NULL CHECK (ordem >= 1),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pilar_id, ordem),
  UNIQUE (pilar_id, nome)
);
CREATE TRIGGER indicador_avaliacao_tocar BEFORE UPDATE ON rh.indicador_avaliacao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER indicador_avaliacao_travar
  BEFORE INSERT OR UPDATE OR DELETE ON rh.indicador_avaliacao
  FOR EACH ROW EXECUTE FUNCTION rh.avaliacao_travar_indicador();

-- ---------------------------------------------------------------- faixas de resultado
-- Fronteira ÚNICA e explícita: faixa aplica-se a percentual em
-- [minimo, maximo) — limite inferior inclusivo, superior exclusivo; a última
-- faixa fecha em 100 inclusive (regra única do serviço de consolidação).
-- Contiguidade 0–100 sem furo/sobreposição: validação do serviço na ativação.
-- A recomendação é FLAG DE RECOMENDAÇÃO — nunca ação automática.
CREATE TABLE rh.faixa_resultado_versao (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modelo_versao_id  BIGINT NOT NULL REFERENCES rh.modelo_avaliacao_versao (id),
  minimo            NUMERIC(5,2) NOT NULL CHECK (minimo >= 0),
  maximo            NUMERIC(5,2) NOT NULL CHECK (maximo <= 100),
  rotulo            TEXT NOT NULL CHECK (btrim(rotulo) <> ''),
  recomendacao      TEXT NOT NULL CHECK (recomendacao IN
                      ('recuperar','atencao','desenvolver','sucessao')),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (modelo_versao_id, minimo),
  CHECK (minimo < maximo)
);
CREATE TRIGGER faixa_resultado_versao_tocar BEFORE UPDATE ON rh.faixa_resultado_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER faixa_resultado_versao_travar
  BEFORE INSERT OR UPDATE OR DELETE ON rh.faixa_resultado_versao
  FOR EACH ROW EXECUTE FUNCTION rh.avaliacao_travar_parametro();

-- ---------------------------------------------------------------- ciclo de avaliação
-- Um ciclo = um avaliado × um marco. modelo_versao_id é CONGELADO na abertura
-- (o serviço abre sempre com a versão ativa; troca de modelo depois NÃO afeta
-- ciclos abertos — sem recálculo retroativo, nunca). Avaliador definido por
-- relacao_gestor vigente na abertura (serviço), nunca flag manual.
-- origem: 'admissao' = gerado dos marcos 45/90 do processo_admissao;
-- 'lote' = abertura em massa pelo RH (desempenho); 'manual' = caso a caso.
CREATE TABLE rh.ciclo_avaliacao (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id            BIGINT NOT NULL REFERENCES rh.colaborador (id),
  tipo                      TEXT NOT NULL CHECK (tipo IN
                              ('experiencia_45','experiencia_90','desempenho')),
  modelo_versao_id          BIGINT NOT NULL REFERENCES rh.modelo_avaliacao_versao (id),
  avaliador_colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  prazo                     DATE NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN
                              ('aberto','em_avaliacao','consolidado','decidido','cancelado')),
  origem                    TEXT NOT NULL CHECK (origem IN ('admissao','lote','manual')),
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- MVP é líder→liderado: autoavaliação só na Fase 3, como papel próprio
  CHECK (avaliador_colaborador_id <> colaborador_id)
);
-- Contrato de experiência: no máximo UM ciclo não-final por colaborador e
-- marco (45/90) — reabrir exige decidir/cancelar o anterior. Desempenho pode
-- repetir (semestral).
CREATE UNIQUE INDEX ciclo_avaliacao_experiencia_um_ativo
  ON rh.ciclo_avaliacao (colaborador_id, tipo)
  WHERE status NOT IN ('decidido','cancelado')
    AND tipo IN ('experiencia_45','experiencia_90');
CREATE INDEX ciclo_avaliacao_por_pessoa
  ON rh.ciclo_avaliacao (colaborador_id, criado_em DESC);
-- Semáforo de prazo no painel (experiência: decisão ANTES do vencimento — CLT 443/445/451).
CREATE INDEX ciclo_avaliacao_fila
  ON rh.ciclo_avaliacao (status, prazo);
-- "Minhas avaliações pendentes" do gestor.
CREATE INDEX ciclo_avaliacao_pendentes_avaliador
  ON rh.ciclo_avaliacao (avaliador_colaborador_id, prazo)
  WHERE status IN ('aberto','em_avaliacao');
CREATE TRIGGER ciclo_avaliacao_tocar BEFORE UPDATE ON rh.ciclo_avaliacao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- avaliação (resposta do avaliador)
-- 1:1 com o ciclo no MVP (líder→liderado). Estados: rascunho → enviada.
-- Enviada é IMUTÁVEL (respostas travadas por trigger); reabertura = serviço
-- volta a rascunho por evento auditado — proibida após consolidação.
CREATE TABLE rh.avaliacao (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ciclo_id       BIGINT NOT NULL UNIQUE REFERENCES rh.ciclo_avaliacao (id),
  estado         TEXT NOT NULL DEFAULT 'rascunho'
                 CHECK (estado IN ('rascunho','enviada')),
  enviado_em     TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((estado = 'enviada') = (enviado_em IS NOT NULL))
);
CREATE TRIGGER avaliacao_tocar BEFORE UPDATE ON rh.avaliacao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- respostas por indicador
-- O PIOR bug do btime (item não respondido = nota zero → flag "desligar" por
-- omissão) morre aqui: toda linha é nota 1–5 OU nao_observado explícito —
-- nunca os dois, nunca nenhum (CHECK XOR). Nao_observado sai do denominador
-- na consolidação (renormalização registrada na memória de cálculo).
CREATE TABLE rh.resposta_item (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  avaliacao_id            BIGINT NOT NULL REFERENCES rh.avaliacao (id),
  indicador_avaliacao_id  BIGINT NOT NULL REFERENCES rh.indicador_avaliacao (id),
  nota                    SMALLINT CHECK (nota >= 1 AND nota <= 5),
  nao_observado           BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (avaliacao_id, indicador_avaliacao_id),
  CHECK ((nota IS NOT NULL) <> nao_observado)
);
CREATE TRIGGER resposta_item_tocar BEFORE UPDATE ON rh.resposta_item
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- Resposta imutável quando a avaliação está enviada; indicador precisa
-- pertencer ao modelo CONGELADO do ciclo (fecha a porta para resposta órfã
-- de outra versão — e torna a contagem da trava de envio à prova de furo).
CREATE FUNCTION rh.resposta_item_travar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estado           TEXT;
  v_modelo_ciclo     BIGINT;
  v_modelo_indicador BIGINT;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT a.estado INTO v_estado FROM rh.avaliacao a WHERE a.id = OLD.avaliacao_id;
    IF v_estado = 'enviada' THEN
      RAISE EXCEPTION 'resposta de avaliação enviada é imutável — reabertura é evento auditado do serviço';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  SELECT a.estado, c.modelo_versao_id INTO v_estado, v_modelo_ciclo
    FROM rh.avaliacao a
    JOIN rh.ciclo_avaliacao c ON c.id = a.ciclo_id
   WHERE a.id = NEW.avaliacao_id;
  IF v_estado = 'enviada' THEN
    RAISE EXCEPTION 'resposta de avaliação enviada é imutável — reabertura é evento auditado do serviço';
  END IF;
  SELECT p.modelo_versao_id INTO v_modelo_indicador
    FROM rh.indicador_avaliacao i
    JOIN rh.pilar_avaliacao p ON p.id = i.pilar_id
   WHERE i.id = NEW.indicador_avaliacao_id;
  IF v_modelo_indicador IS DISTINCT FROM v_modelo_ciclo THEN
    RAISE EXCEPTION 'indicador % não pertence ao modelo congelado do ciclo', NEW.indicador_avaliacao_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER resposta_item_travar
  BEFORE INSERT OR UPDATE OR DELETE ON rh.resposta_item
  FOR EACH ROW EXECUTE FUNCTION rh.resposta_item_travar();

-- ---------------------------------------------------------------- trava de envio e de reabertura
-- Envio só com TODOS os indicadores do modelo respondidos (nota OU não
-- observado) — item sem resposta JAMAIS entra como zero. Reabertura
-- (enviada → rascunho) proibida depois de consolidado: correção de ciclo
-- fechado é ciclo novo, nunca reescrita de história.
CREATE FUNCTION rh.avaliacao_travar_estado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_modelo_id   BIGINT;
  v_esperados   INT;
  v_respondidos INT;
BEGIN
  IF NEW.estado = 'enviada' AND (TG_OP = 'INSERT' OR OLD.estado <> 'enviada') THEN
    SELECT c.modelo_versao_id INTO v_modelo_id
      FROM rh.ciclo_avaliacao c WHERE c.id = NEW.ciclo_id;
    SELECT count(*) INTO v_esperados
      FROM rh.indicador_avaliacao i
      JOIN rh.pilar_avaliacao p ON p.id = i.pilar_id
     WHERE p.modelo_versao_id = v_modelo_id;
    SELECT count(*) INTO v_respondidos
      FROM rh.resposta_item r WHERE r.avaliacao_id = NEW.id;
    IF v_esperados = 0 OR v_respondidos < v_esperados THEN
      RAISE EXCEPTION
        'avaliação incompleta (% de % indicadores): envio bloqueado — item sem resposta jamais vira zero',
        v_respondidos, v_esperados;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'enviada' AND NEW.estado = 'rascunho'
     AND EXISTS (SELECT 1 FROM rh.resultado_avaliacao r WHERE r.ciclo_id = NEW.ciclo_id) THEN
    RAISE EXCEPTION 'ciclo já consolidado: avaliação não reabre — correção é ciclo novo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER avaliacao_travar_estado
  BEFORE INSERT OR UPDATE ON rh.avaliacao
  FOR EACH ROW EXECUTE FUNCTION rh.avaliacao_travar_estado();

-- ---------------------------------------------------------------- resultado consolidado (append-only)
-- Calculado EXCLUSIVAMENTE no backend, gravado imutável e ligado (via ciclo)
-- à versão congelada do modelo. memoria_calculo torna o número reproduzível
-- (a transparência que o mockup prometia e não entregava): por pilar — peso
-- usado, indicadores respondidos × não observados, renormalização aplicada e
-- nota do pilar; mais faixa aplicada [minimo, maximo), recomendação e regra
-- de arredondamento única. RESTRITO: percentual/recomendacao AUSENTES do
-- payload de quem não tem avaliacao.resultado.ver; leitura autorizada grava
-- audit.leitura_sensivel (na aplicação).
CREATE TABLE rh.resultado_avaliacao (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ciclo_id            BIGINT NOT NULL UNIQUE REFERENCES rh.ciclo_avaliacao (id),
  percentual          NUMERIC(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  faixa_resultado_id  BIGINT NOT NULL REFERENCES rh.faixa_resultado_versao (id),
  recomendacao        TEXT NOT NULL CHECK (recomendacao IN
                        ('recuperar','atencao','desenvolver','sucessao')),
  memoria_calculo     JSONB NOT NULL CHECK (jsonb_typeof(memoria_calculo) = 'object'),
  em                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER resultado_avaliacao_imutavel
  BEFORE UPDATE OR DELETE ON rh.resultado_avaliacao
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- Consolidar exige avaliação ENVIADA do ciclo — nada se consolida sobre
-- rascunho ou sobre ciclo sem avaliação (erro btime: resultado sem origem).
CREATE FUNCTION rh.resultado_exigir_avaliacao_enviada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rh.avaliacao a
                  WHERE a.ciclo_id = NEW.ciclo_id AND a.estado = 'enviada') THEN
    RAISE EXCEPTION 'ciclo % sem avaliação enviada: consolidação bloqueada', NEW.ciclo_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER resultado_avaliacao_exigir_envio
  BEFORE INSERT ON rh.resultado_avaliacao
  FOR EACH ROW EXECUTE FUNCTION rh.resultado_exigir_avaliacao_enviada();

-- ---------------------------------------------------------------- decisão humana (append-only)
-- A flag é RECOMENDAÇÃO; a consequência é sempre decisão humana registrada:
-- decisor, data, divergência e justificativa NOT NULL quando diverge (CHECK).
-- Decisão "desligar" NÃO executa nada aqui — o serviço referencia/abre o
-- processo_desligamento. Nenhum status de colaborador muda por flag (LGPD
-- art. 20 por construção).
CREATE TABLE rh.decisao_avaliacao (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ciclo_id            BIGINT NOT NULL UNIQUE REFERENCES rh.ciclo_avaliacao (id),
  decisao             TEXT NOT NULL CHECK (decisao IN
                        ('manter','desenvolver','renovar','nao_renovar','desligar')),
  divergente          BOOLEAN NOT NULL,
  justificativa       TEXT,
  decisor_usuario_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  em                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT divergente OR (justificativa IS NOT NULL AND btrim(justificativa) <> ''))
);
CREATE TRIGGER decisao_avaliacao_imutavel
  BEFORE UPDATE OR DELETE ON rh.decisao_avaliacao
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- Decidir exige consolidação prévia (erro btime: Renovar/Desligar acionáveis
-- com avaliação vazia).
CREATE FUNCTION rh.decisao_exigir_resultado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rh.resultado_avaliacao r WHERE r.ciclo_id = NEW.ciclo_id) THEN
    RAISE EXCEPTION 'ciclo % sem resultado consolidado: decisão bloqueada', NEW.ciclo_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER decisao_avaliacao_exigir_resultado
  BEFORE INSERT ON rh.decisao_avaliacao
  FOR EACH ROW EXECUTE FUNCTION rh.decisao_exigir_resultado();

-- ---------------------------------------------------------------- seed — modelo v1
-- Defaults de partida do esqueleto btime REVISADOS (auditoria-btime-360.md,
-- seção 6, passo 5): pesos 30/40/30 e faixas 0-40/40-60/60-80/80-100 valem
-- como hipótese registrada — validação do RH antes do primeiro ciclo real;
-- corrigir = versão 2, nunca UPDATE. Criado em rascunho, filhas inseridas e
-- então ativado (a trava de parâmetros exige rascunho durante a montagem).
INSERT INTO rh.modelo_avaliacao_versao (versao, nome, status, inicio_vigencia)
VALUES (1, 'Modelo padrão — 3 pilares (Dever 30 / Desenvolvimento 40 / Fit Cultural 30)',
        'rascunho', CURRENT_DATE);

INSERT INTO rh.pilar_avaliacao (modelo_versao_id, nome, peso, ordem)
SELECT m.id, x.nome, x.peso, x.ordem
  FROM rh.modelo_avaliacao_versao m,
       (VALUES
          ('Dever',                    30, 1),
          ('Desenvolvimento (CHA)',    40, 2),
          ('Fit Cultural',             30, 3)
       ) AS x (nome, peso, ordem)
 WHERE m.versao = 1;

-- Pesos relativos dentro do pilar (soma 100 por pilar). Fit Cultural: os
-- 9 Valores Fast — descrição curta aqui; descritores comportamentais 1–5
-- detalhados A IMPORTAR de fast_kb_valores_fast.md (viram versão 2 do modelo
-- quando estruturados com o RH).
INSERT INTO rh.indicador_avaliacao (pilar_id, nome, descricao, peso, ordem)
SELECT p.id, i.nome, i.descricao, i.peso, i.ordem
  FROM rh.pilar_avaliacao p
  JOIN rh.modelo_avaliacao_versao m ON m.id = p.modelo_versao_id AND m.versao = 1
  JOIN (VALUES
    -- pilar 1 · Dever (30)
    (1, 'Assiduidade e compromisso',      'Presença, pontualidade e constância no cumprimento dos horários e compromissos assumidos.', 40, 1),
    (1, 'Cumprimento de normas',          'Adesão às normas, políticas e processos internos da Fast.',                                  30, 2),
    (1, 'Responsabilidade com recursos',  'Cuidado com equipamentos, materiais e recursos da empresa.',                                 30, 3),
    -- pilar 2 · Desenvolvimento (CHA) (40)
    (2, 'Conhecimento técnico do cargo',  'Domínio dos conhecimentos exigidos pela descrição de cargo vigente.',                        40, 1),
    (2, 'Habilidade na execução',         'Qualidade, precisão e destreza na execução prática das atividades do cargo.',                30, 2),
    (2, 'Atitude e proatividade',         'Iniciativa, postura profissional e disposição para resolver e melhorar.',                    30, 3),
    -- pilar 3 · Fit Cultural — 9 Valores Fast (30)
    (3, 'Resultado',       'Foco em entregar o resultado combinado. Descritores 1–5 a importar de fast_kb_valores_fast.md.',            12, 1),
    (3, 'Velocidade',      'Age rápido, sem esperar condições perfeitas. Descritores 1–5 a importar de fast_kb_valores_fast.md.',       11, 2),
    (3, 'Determinação',    'Persiste até concluir, sem desistir no obstáculo. Descritores 1–5 a importar de fast_kb_valores_fast.md.',  11, 3),
    (3, 'Desenvolvimento', 'Busca evoluir e aprender continuamente. Descritores 1–5 a importar de fast_kb_valores_fast.md.',            11, 4),
    (3, 'Disciplina',      'Faz o combinado, com consistência e método. Descritores 1–5 a importar de fast_kb_valores_fast.md.',        11, 5),
    (3, 'Resiliência',     'Mantém o nível diante de pressão e adversidade. Descritores 1–5 a importar de fast_kb_valores_fast.md.',    11, 6),
    (3, 'Colaboração',     'Joga junto: ajuda e compartilha com o time. Descritores 1–5 a importar de fast_kb_valores_fast.md.',        11, 7),
    (3, 'Comunicação',     'Comunica com clareza, franqueza e respeito. Descritores 1–5 a importar de fast_kb_valores_fast.md.',        11, 8),
    (3, 'Reconhecimento',  'Valoriza e celebra a contribuição dos outros. Descritores 1–5 a importar de fast_kb_valores_fast.md.',      11, 9)
  ) AS i (pilar_ordem, nome, descricao, peso, ordem) ON i.pilar_ordem = p.ordem;

-- Faixas [minimo, maximo); 100 fecha na última (regra única do serviço).
INSERT INTO rh.faixa_resultado_versao (modelo_versao_id, minimo, maximo, rotulo, recomendacao)
SELECT m.id, x.minimo, x.maximo, x.rotulo, x.recomendacao
  FROM rh.modelo_avaliacao_versao m,
       (VALUES
          (0::numeric,  40::numeric,  'Plano de recuperação',        'recuperar'),
          (40::numeric, 60::numeric,  'Atenção e acompanhamento',    'atencao'),
          (60::numeric, 80::numeric,  'Desenvolver para liderança',  'desenvolver'),
          (80::numeric, 100::numeric, 'Alto desempenho — sucessão',  'sucessao')
       ) AS x (minimo, maximo, rotulo, recomendacao)
 WHERE m.versao = 1;

-- Ativação do seed (no fluxo real, o serviço valida soma de pesos = 100 e
-- faixas contíguas 0–100 antes deste UPDATE — aqui a soma confere por
-- construção: 30+40+30 e, por pilar, 40+30+30 / 40+30+30 / 12+8×11 = 100).
UPDATE rh.modelo_avaliacao_versao SET status = 'ativa' WHERE versao = 1;

-- ---------------------------------------------------------------- permissões
-- Gestor responde APENAS ciclos em que é o avaliador (filtro no serviço);
-- resultado individual é sensível: leitura grava audit.leitura_sensivel e o
-- payload de quem não tem a chave vem SEM percentual/recomendação (ausência,
-- não máscara).
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('avaliacao.configurar',    'Administrar modelos de avaliação: versões, pilares, indicadores e faixas'),
  ('avaliacao.responder',     'Responder avaliação dos ciclos em que é avaliador (rascunho e envio)'),
  ('avaliacao.resultado.ver', 'Ver resultado consolidado e recomendação (restrito; leitura gera trilha)'),
  ('avaliacao.decidir',       'Registrar a decisão humana sobre o ciclo consolidado');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('rh',        'avaliacao.configurar'),
  ('dp',        'avaliacao.configurar'),
  ('gestor',    'avaliacao.responder'),
  ('dp',        'avaliacao.resultado.ver'),
  ('diretoria', 'avaliacao.resultado.ver'),
  ('dp',        'avaliacao.decidir'),
  ('diretoria', 'avaliacao.decidir');

COMMIT;
