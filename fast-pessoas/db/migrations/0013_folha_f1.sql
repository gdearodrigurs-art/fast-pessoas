-- 0013_folha_f1.sql
-- Folha de pagamento — Trilha F, F1: motor mínimo da folha mensal ordinária.
-- Base funcional: docs/03-modulos/03-folha-fechamento.md (motor PRÓPRIO, sem
-- integração Nasajon; a sombra/paridade é F3 e fica fora deste arquivo).
-- Tudo no schema rh_folha (credencial segregada app_folha — db/provisionar.sql
-- já cobre GRANTs por DEFAULT PRIVILEGES; os pools dos demais domínios não
-- enxergam estas tabelas).
-- Padrão versionado do 0002: status rascunho→ativa→encerrada com vigência;
-- mudança de rubrica/tabela legal/parâmetro é sempre versão NOVA — nunca
-- UPDATE no que já vigorou. Competência é máquina de estados
-- aberta→calculo→conferencia→aprovada→fechada; transições "só para frente"
-- e a volta única conferencia→calculo são regra do SERVIÇO — o banco garante
-- o irreversível: fechada não reabre e resultado de competência fechada é
-- imutável (correção é folha complementar, F2).

BEGIN;

-- ---------------------------------------------------------------- guardas de imutabilidade
-- Competência fechada é o snapshot legal: nenhum UPDATE/DELETE passa.
CREATE FUNCTION rh_folha.bloquear_competencia_fechada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = 'fechada' THEN
    RAISE EXCEPTION
      'competência fechada não reabre: % não permite % — correção é folha complementar',
      TG_TABLE_NAME, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Para tabelas com competencia_id direto (folha_colaborador, variavel_lancada):
-- INSERT/UPDATE/DELETE bloqueados quando a competência está fechada. Fora de
-- fechada, recalcular APAGA e regrava (DELETE liberado de propósito).
CREATE FUNCTION rh_folha.bloquear_apos_fechamento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estado TEXT;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT c.estado INTO v_estado
      FROM rh_folha.competencia_folha c WHERE c.id = OLD.competencia_id;
    IF v_estado = 'fechada' THEN
      RAISE EXCEPTION
        'competência fechada: % não permite % — resultado é imutável (folha complementar)',
        TG_TABLE_NAME, TG_OP;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  SELECT c.estado INTO v_estado
    FROM rh_folha.competencia_folha c WHERE c.id = NEW.competencia_id;
  IF v_estado = 'fechada' THEN
    RAISE EXCEPTION
      'competência fechada: % não permite % — resultado é imutável (folha complementar)',
      TG_TABLE_NAME, TG_OP;
  END IF;
  RETURN NEW;
END;
$$;

-- Para item_calculo (competência resolvida via folha_colaborador).
CREATE FUNCTION rh_folha.bloquear_item_apos_fechamento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estado TEXT;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT c.estado INTO v_estado
      FROM rh_folha.folha_colaborador f
      JOIN rh_folha.competencia_folha c ON c.id = f.competencia_id
     WHERE f.id = OLD.folha_colaborador_id;
    IF v_estado = 'fechada' THEN
      RAISE EXCEPTION
        'competência fechada: % não permite % — memória de cálculo é imutável',
        TG_TABLE_NAME, TG_OP;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  SELECT c.estado INTO v_estado
    FROM rh_folha.folha_colaborador f
    JOIN rh_folha.competencia_folha c ON c.id = f.competencia_id
   WHERE f.id = NEW.folha_colaborador_id;
  IF v_estado = 'fechada' THEN
    RAISE EXCEPTION
      'competência fechada: % não permite % — memória de cálculo é imutável',
      TG_TABLE_NAME, TG_OP;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- catálogo de rubricas
-- Identidade estável no código; o parametrizável (incidências, tipo de
-- cálculo, fator) vive na versão com vigência. Desativar não apaga:
-- ativo = FALSE só fecha para uso novo.
CREATE TABLE rh_folha.rubrica (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo         TEXT NOT NULL UNIQUE,        -- ex.: '1001', '2001'
  nome           TEXT NOT NULL CHECK (btrim(nome) <> ''),
  natureza       TEXT NOT NULL CHECK (natureza IN ('provento','desconto','informativa')),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER rubrica_tocar BEFORE UPDATE ON rh_folha.rubrica
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- Versão da regra da rubrica. incide_* = o valor entra na base respectiva
-- (provento soma, desconto reduz). Deduções LEGAIS da base do IRRF (INSS,
-- dependentes) são regra do MOTOR, não flag de incidência. parametro:
-- fator do adicional (1.5, 2.0) ou percentual — obrigatório nesses tipos.
CREATE TABLE rh_folha.rubrica_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rubrica_id       BIGINT NOT NULL REFERENCES rh_folha.rubrica (id),
  incide_inss      BOOLEAN NOT NULL,
  incide_irrf      BOOLEAN NOT NULL,
  incide_fgts      BOOLEAN NOT NULL,
  tipo_calculo     TEXT NOT NULL CHECK (tipo_calculo IN
                     ('salario_base','percentual_salario','horas_adicional','valor_informado','automatico')),
  parametro        NUMERIC(10,4) CHECK (parametro IS NULL OR parametro > 0),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL),
  CHECK (tipo_calculo NOT IN ('percentual_salario','horas_adicional') OR parametro IS NOT NULL)
);
CREATE INDEX rubrica_versao_por_rubrica
  ON rh_folha.rubrica_versao (rubrica_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX rubrica_versao_uma_ativa
  ON rh_folha.rubrica_versao (rubrica_id) WHERE status = 'ativa';
CREATE TRIGGER rubrica_versao_tocar BEFORE UPDATE ON rh_folha.rubrica_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER rubrica_versao_congelar
  BEFORE UPDATE OR DELETE ON rh_folha.rubrica_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- tabelas legais versionadas
-- INSS progressivo: faixas [{ate, aliquota}] em ordem crescente; a última
-- faixa fecha no teto de contribuição (base acima do teto contribui o máximo).
CREATE TABLE rh_folha.tabela_inss_versao (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  faixas             JSONB NOT NULL CHECK (jsonb_typeof(faixas) = 'array'),
  teto_contribuicao  NUMERIC(12,2) NOT NULL CHECK (teto_contribuicao > 0),
  status             TEXT NOT NULL DEFAULT 'rascunho'
                     CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia    DATE NOT NULL,
  fim_vigencia       DATE,
  -- toda carga entra NÃO conferida; aprovar competência com tabela não
  -- conferida é bloqueio do serviço
  conferido_dp       BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX tabela_inss_versao_uma_ativa
  ON rh_folha.tabela_inss_versao (status) WHERE status = 'ativa';
CREATE TRIGGER tabela_inss_versao_tocar BEFORE UPDATE ON rh_folha.tabela_inss_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER tabela_inss_versao_congelar
  BEFORE UPDATE OR DELETE ON rh_folha.tabela_inss_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- IRRF: faixas [{ate, aliquota, deducao}] — "ate": null na última (sem teto);
-- dedução por dependente e desconto simplificado (o motor aplica o regime que
-- resultar em imposto MENOR).
CREATE TABLE rh_folha.tabela_irrf_versao (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  faixas                  JSONB NOT NULL CHECK (jsonb_typeof(faixas) = 'array'),
  deducao_por_dependente  NUMERIC(12,2) NOT NULL CHECK (deducao_por_dependente >= 0),
  desconto_simplificado   NUMERIC(12,2) NOT NULL CHECK (desconto_simplificado >= 0),
  status                  TEXT NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia         DATE NOT NULL,
  fim_vigencia            DATE,
  conferido_dp            BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX tabela_irrf_versao_uma_ativa
  ON rh_folha.tabela_irrf_versao (status) WHERE status = 'ativa';
CREATE TRIGGER tabela_irrf_versao_tocar BEFORE UPDATE ON rh_folha.tabela_irrf_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER tabela_irrf_versao_congelar
  BEFORE UPDATE OR DELETE ON rh_folha.tabela_irrf_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- Parâmetros gerais da folha (salário mínimo, alíquota FGTS), com vigência.
CREATE TABLE rh_folha.parametro_folha_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salario_minimo   NUMERIC(12,2) NOT NULL CHECK (salario_minimo > 0),
  aliquota_fgts    NUMERIC(5,2) NOT NULL DEFAULT 8 CHECK (aliquota_fgts > 0),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  conferido_dp     BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX parametro_folha_versao_uma_ativa
  ON rh_folha.parametro_folha_versao (status) WHERE status = 'ativa';
CREATE TRIGGER parametro_folha_versao_tocar BEFORE UPDATE ON rh_folha.parametro_folha_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER parametro_folha_versao_congelar
  BEFORE UPDATE OR DELETE ON rh_folha.parametro_folha_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- competência (máquina de estados)
CREATE TABLE rh_folha.competencia_folha (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ano            INT NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  mes            INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo           TEXT NOT NULL DEFAULT 'mensal',   -- F2: 13o_1a, 13o_2a, rescisao, complementar
  estado         TEXT NOT NULL DEFAULT 'aberta' CHECK (estado IN
                   ('aberta','calculo','conferencia','aprovada','fechada')),
  aberta_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  aberta_por     BIGINT NOT NULL REFERENCES sistema.usuario (id),
  fechada_em     TIMESTAMPTZ,
  fechada_por    BIGINT REFERENCES sistema.usuario (id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ano, mes, tipo),
  CHECK (estado <> 'fechada' OR (fechada_em IS NOT NULL AND fechada_por IS NOT NULL))
);
CREATE INDEX competencia_folha_fila ON rh_folha.competencia_folha (estado, ano DESC, mes DESC);
CREATE TRIGGER competencia_folha_tocar BEFORE UPDATE ON rh_folha.competencia_folha
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER competencia_folha_nao_reabre
  BEFORE UPDATE OR DELETE ON rh_folha.competencia_folha
  FOR EACH ROW EXECUTE FUNCTION rh_folha.bloquear_competencia_fechada();

-- ---------------------------------------------------------------- variáveis lançadas
-- Insumo do cálculo: horas/dias (referencia) ou valor direto, por rubrica.
-- origem 'beneficio' = desconto consolidado vindo de rh.adesao (serviço);
-- 'manual' = lançamento do DP. Read-only quando a competência fecha (trigger);
-- a trava fora de 'aberta' nos demais estados é regra do serviço.
CREATE TABLE rh_folha.variavel_lancada (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competencia_id  BIGINT NOT NULL REFERENCES rh_folha.competencia_folha (id),
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  rubrica_id      BIGINT NOT NULL REFERENCES rh_folha.rubrica (id),
  referencia      NUMERIC(10,2) CHECK (referencia IS NULL OR referencia > 0),  -- horas/dias
  valor           NUMERIC(12,2) CHECK (valor IS NULL OR valor >= 0),
  origem          TEXT NOT NULL CHECK (origem IN ('manual','beneficio')),
  lancado_por     BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referencia IS NOT NULL OR valor IS NOT NULL)
);
CREATE INDEX variavel_lancada_por_folha
  ON rh_folha.variavel_lancada (competencia_id, colaborador_id);
CREATE TRIGGER variavel_lancada_tocar BEFORE UPDATE ON rh_folha.variavel_lancada
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER variavel_lancada_congelar
  BEFORE INSERT OR UPDATE OR DELETE ON rh_folha.variavel_lancada
  FOR EACH ROW EXECUTE FUNCTION rh_folha.bloquear_apos_fechamento();

-- ---------------------------------------------------------------- resultado por colaborador
-- salario_base_congelado: fotografado de rh.posicao_colaborador no momento do
-- cálculo — o resultado nunca depende de "o salário atual". Recalcular fora de
-- 'fechada' APAGA a folha do colaborador (e os itens, junto) e regrava;
-- após fechamento, o trigger bloqueia qualquer mutação — append-only.
-- VALOR SENSÍVEL: payload de quem não tem folha.ver vem SEM estas linhas
-- (ausência, não máscara); leitura autorizada grava audit.leitura_sensivel.
CREATE TABLE rh_folha.folha_colaborador (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competencia_id          BIGINT NOT NULL REFERENCES rh_folha.competencia_folha (id),
  colaborador_id          BIGINT NOT NULL REFERENCES rh.colaborador (id),
  salario_base_congelado  NUMERIC(12,2) NOT NULL CHECK (salario_base_congelado >= 0),
  dependentes_irrf        INT NOT NULL DEFAULT 0 CHECK (dependentes_irrf >= 0),
  total_proventos         NUMERIC(12,2) NOT NULL CHECK (total_proventos >= 0),
  total_descontos         NUMERIC(12,2) NOT NULL CHECK (total_descontos >= 0),
  liquido                 NUMERIC(12,2) NOT NULL,
  calculada_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia_id, colaborador_id),
  CHECK (liquido = total_proventos - total_descontos)
);
CREATE INDEX folha_colaborador_por_pessoa
  ON rh_folha.folha_colaborador (colaborador_id, competencia_id DESC);
CREATE TRIGGER folha_colaborador_congelar
  BEFORE INSERT OR UPDATE OR DELETE ON rh_folha.folha_colaborador
  FOR EACH ROW EXECUTE FUNCTION rh_folha.bloquear_apos_fechamento();

-- ---------------------------------------------------------------- memória de cálculo
-- Um item por rubrica aplicada, apontando a VERSÃO da rubrica usada (nunca
-- "a atual"). memoria: JSONB com a conta aberta (faixas percorridas do INSS,
-- regime do IRRF aplicado e o comparado, base e fator do adicional…) — todo
-- valor de holerite é explicável item a item. Mesmo ciclo de vida da folha:
-- apaga e regrava fora de 'fechada'; imutável depois.
CREATE TABLE rh_folha.item_calculo (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  folha_colaborador_id  BIGINT NOT NULL REFERENCES rh_folha.folha_colaborador (id) ON DELETE CASCADE,
  rubrica_versao_id     BIGINT NOT NULL REFERENCES rh_folha.rubrica_versao (id),
  referencia            NUMERIC(10,2),       -- horas/dias/percentual aplicado
  base                  NUMERIC(12,2),       -- base de cálculo do item (quando houver)
  valor                 NUMERIC(12,2) NOT NULL,
  memoria               JSONB NOT NULL CHECK (jsonb_typeof(memoria) = 'object'),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX item_calculo_por_folha ON rh_folha.item_calculo (folha_colaborador_id);
CREATE TRIGGER item_calculo_congelar
  BEFORE INSERT OR UPDATE OR DELETE ON rh_folha.item_calculo
  FOR EACH ROW EXECUTE FUNCTION rh_folha.bloquear_item_apos_fechamento();

-- ---------------------------------------------------------------- casos de teste do motor
-- Bateria de regressão executável: o serviço roda cada caso contra o motor e
-- compara com saida_esperada (itens por código de rubrica + líquido). Regras
-- F1 fixadas — a saída esperada abaixo depende delas:
--   • hora normal = salário ÷ 220; HE = horas × fator × hora normal;
--   • falta = dias × (salário ÷ 30); DSR sobre faltas em F1: 1 dia de DSR por
--     dia de falta (simplificação — apuração semana a semana chega em F2 com o
--     espelho de ponto);
--   • bases INSS/IRRF/FGTS = Σ proventos incidentes − Σ descontos incidentes;
--   • INSS progressivo faixa a faixa, base limitada ao teto de contribuição;
--   • FGTS = alíquota × base (informativa — não entra no líquido); sem teto;
--   • IRRF: regime completo (base − INSS − dependentes × dedução) comparado ao
--     simplificado (base − desconto simplificado) — vale o imposto MENOR;
--   • arredondamento: intermediários sem arredondar; meio-para-cima (half-up)
--     só no valor final de cada item; item com valor zero não é gravado.
CREATE TABLE rh_folha.caso_teste_folha (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome            TEXT NOT NULL UNIQUE,
  descricao       TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  entrada         JSONB NOT NULL CHECK (jsonb_typeof(entrada) = 'object'),
  saida_esperada  JSONB NOT NULL CHECK (jsonb_typeof(saida_esperada) = 'object'),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER caso_teste_folha_tocar BEFORE UPDATE ON rh_folha.caso_teste_folha
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- seed — catálogo de rubricas v1
-- Códigos: 1xxx proventos/descontos de remuneração, 2xxx descontos legais e
-- de benefício, 3xxx informativas, 9xxx manuais. Incidência das rubricas
-- automáticas legais (2001/2002/3001) é FALSE: elas SAEM das bases, não
-- entram — a dedução do INSS na base do IRRF é regra do motor.
-- 9001 Provento Manual incide em tudo por padrão CONSERVADOR (recolher a
-- mais, nunca a menos): verba manual sem incidência exige rubrica própria.
-- DSR sobre horas extras fica para F2 (junto do espelho de ponto).
INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('1001', 'Salário Base',          'provento'),
  ('1101', 'Horas Extras 50%',      'provento'),
  ('1102', 'Horas Extras 100%',     'provento'),
  ('1201', 'Faltas',                'desconto'),
  ('1202', 'DSR sobre Faltas',      'desconto'),
  ('2001', 'Desconto INSS',         'desconto'),
  ('2002', 'IRRF',                  'desconto'),
  ('2101', 'Desconto de Benefício', 'desconto'),
  ('3001', 'FGTS',                  'informativa'),
  ('9001', 'Provento Manual',       'provento'),
  ('9002', 'Desconto Manual',       'desconto');

INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro, status, inicio_vigencia)
SELECT r.id, v.incide_inss, v.incide_irrf, v.incide_fgts, v.tipo_calculo, v.parametro,
       'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
  JOIN (VALUES
    ('1001', TRUE,  TRUE,  TRUE,  'automatico',      NULL::numeric),
    ('1101', TRUE,  TRUE,  TRUE,  'horas_adicional', 1.5),
    ('1102', TRUE,  TRUE,  TRUE,  'horas_adicional', 2.0),
    ('1201', TRUE,  TRUE,  TRUE,  'automatico',      NULL),   -- reduz as bases
    ('1202', TRUE,  TRUE,  TRUE,  'automatico',      NULL),   -- reduz as bases
    ('2001', FALSE, FALSE, FALSE, 'automatico',      NULL),
    ('2002', FALSE, FALSE, FALSE, 'automatico',      NULL),
    ('2101', FALSE, FALSE, FALSE, 'valor_informado', NULL),
    ('3001', FALSE, FALSE, FALSE, 'automatico',      NULL),
    ('9001', TRUE,  TRUE,  TRUE,  'valor_informado', NULL),
    ('9002', FALSE, FALSE, FALSE, 'valor_informado', NULL)
  ) AS v (codigo, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro)
    ON v.codigo = r.codigo;

-- ---------------------------------------------------------------- seed — tabelas legais 2026
-- VALORES DE REFERENCIA: conferir com o DP antes de aprovar qualquer competencia
-- (conferido_dp = FALSE de propósito; o serviço bloqueia aprovação sem
-- conferência). INSS: faixas de 2025 reajustadas ~5% e mínimo projetado de
-- 1.631,00. IRRF: tabela vigente de referência (mai/2025) mantida — ATENÇÃO:
-- eventual redutor/isenção ampliada da reforma do IR para 2026 NÃO está
-- modelado em F1 e precisa de decisão do DP antes da primeira competência.
INSERT INTO rh_folha.tabela_inss_versao
  (faixas, teto_contribuicao, status, inicio_vigencia)
VALUES (
  '[{"ate": 1631.00, "aliquota": 7.5},
    {"ate": 2933.57, "aliquota": 9},
    {"ate": 4400.37, "aliquota": 12},
    {"ate": 8565.28, "aliquota": 14}]'::jsonb,
  8565.28, 'ativa', DATE '2026-01-01');

INSERT INTO rh_folha.tabela_irrf_versao
  (faixas, deducao_por_dependente, desconto_simplificado, status, inicio_vigencia)
VALUES (
  '[{"ate": 2428.80, "aliquota": 0,    "deducao": 0},
    {"ate": 2826.65, "aliquota": 7.5,  "deducao": 182.16},
    {"ate": 3751.05, "aliquota": 15,   "deducao": 394.16},
    {"ate": 4664.68, "aliquota": 22.5, "deducao": 675.49},
    {"ate": null,    "aliquota": 27.5, "deducao": 908.73}]'::jsonb,
  189.59, 607.20, 'ativa', DATE '2026-01-01');

INSERT INTO rh_folha.parametro_folha_versao
  (salario_minimo, aliquota_fgts, status, inicio_vigencia)
VALUES (1631.00, 8, 'ativa', DATE '2026-01-01');

-- ---------------------------------------------------------------- seed — casos de teste
-- Saída esperada calculada À MÃO contra as tabelas seed acima, com a conta
-- documentada na descrição. Se a tabela legal mudar (versão nova), estes
-- casos DEVEM ser revisados juntos — a bateria falhando é o alarme.
INSERT INTO rh_folha.caso_teste_folha (nome, descricao, entrada, saida_esperada) VALUES
(
  'salario_simples_3000',
  'Mensalista R$ 3.000,00, sem variáveis, sem dependentes. '
  'INSS progressivo: 1.631,00×7,5% = 122,3250; (2.933,57−1.631,00)×9% = 117,2313; '
  '(3.000,00−2.933,57)×12% = 7,9716; soma 247,5279 → 247,53. '
  'FGTS informativo: 3.000,00×8% = 240,00. '
  'IRRF: simplificado 3.000,00−607,20 = 2.392,80 ≤ 2.428,80 → isento (completo daria '
  'base 2.752,47 e imposto 24,28; vale o menor) → sem item 2002. '
  'Líquido: 3.000,00 − 247,53 = 2.752,47.',
  '{"salario": 3000.00, "dependentes": 0, "variaveis": []}'::jsonb,
  '{"itens": {"1001": 3000.00, "2001": 247.53, "3001": 240.00}, "liquido": 2752.47}'::jsonb
),
(
  'com_he50_2000_10h',
  'R$ 2.000,00 + 10h de HE 50%. Hora normal 2.000/220 = 9,0909…; '
  'HE50 = 10 × 1,5 × 9,0909… = 136,3636 → 136,36. Bases = 2.136,36. '
  'INSS: 122,3250 + (2.136,36−1.631,00)×9% = 45,4824 → 167,8074 → 167,81. '
  'FGTS: 2.136,36×8% = 170,9088 → 170,91. '
  'IRRF: completo 2.136,36−167,81 = 1.968,55 e simplificado 2.136,36−607,20 = 1.529,16 '
  '— ambos ≤ 2.428,80, isento → sem item 2002. '
  'Líquido: 2.136,36 − 167,81 = 1.968,55.',
  '{"salario": 2000.00, "dependentes": 0,
    "variaveis": [{"rubrica": "1101", "referencia": 10}]}'::jsonb,
  '{"itens": {"1001": 2000.00, "1101": 136.36, "2001": 167.81, "3001": 170.91},
    "liquido": 1968.55}'::jsonb
),
(
  'falta_com_dsr_3300',
  'R$ 3.300,00 com 1 dia de falta. Falta (1201) = 1 × 3.300/30 = 110,00; '
  'DSR sobre faltas (1202, regra F1: 1 dia de DSR por dia de falta) = 110,00. '
  'Bases = 3.300,00 − 220,00 = 3.080,00. '
  'INSS: 122,3250 + 117,2313 + (3.080,00−2.933,57)×12% = 17,5716 → 257,1279 → 257,13. '
  'FGTS: 3.080,00×8% = 246,40. '
  'IRRF: simplificado 3.080,00−607,20 = 2.472,80 → ×7,5% − 182,16 = 185,46 − 182,16 = 3,30; '
  'completo 3.080,00−257,13 = 2.822,87 → ×7,5% − 182,16 = 29,56 — vale o menor → 3,30. '
  'Líquido: 3.080,00 − 257,13 − 3,30 = 2.819,57.',
  '{"salario": 3300.00, "dependentes": 0,
    "variaveis": [{"rubrica": "1201", "referencia": 1}]}'::jsonb,
  '{"itens": {"1001": 3300.00, "1201": 110.00, "1202": 110.00,
              "2001": 257.13, "2002": 3.30, "3001": 246.40},
    "liquido": 2819.57}'::jsonb
),
(
  'teto_inss_9000',
  'R$ 9.000,00 — acima do teto de contribuição (8.565,28). '
  'INSS no teto: 122,3250 + 117,2313 + 176,0160 + 583,0874 = 998,6597 → 998,66. '
  'FGTS sem teto: 9.000,00×8% = 720,00. '
  'IRRF: completo 9.000,00−998,66 = 8.001,34 → ×27,5% − 908,73 = 2.200,3685 − 908,73 '
  '= 1.291,6385 → 1.291,64; simplificado 8.392,80 → 1.399,29 — vale o menor → 1.291,64. '
  'Líquido: 9.000,00 − 998,66 − 1.291,64 = 6.709,70.',
  '{"salario": 9000.00, "dependentes": 0, "variaveis": []}'::jsonb,
  '{"itens": {"1001": 9000.00, "2001": 998.66, "2002": 1291.64, "3001": 720.00},
    "liquido": 6709.70}'::jsonb
),
(
  'irrf_faixa_alta_12000_2dep',
  'R$ 12.000,00 com 2 dependentes. INSS no teto: 998,66 (idem caso do teto). '
  'FGTS: 12.000,00×8% = 960,00. '
  'IRRF completo: 12.000,00 − 998,66 − 2×189,59 (= 379,18) = 10.622,16 → ×27,5% − 908,73 '
  '= 2.921,094 − 908,73 = 2.012,364 → 2.012,36; simplificado 11.392,80 → 2.224,29 — '
  'vale o menor → 2.012,36. '
  'Líquido: 12.000,00 − 998,66 − 2.012,36 = 8.988,98.',
  '{"salario": 12000.00, "dependentes": 2, "variaveis": []}'::jsonb,
  '{"itens": {"1001": 12000.00, "2001": 998.66, "2002": 2012.36, "3001": 960.00},
    "liquido": 8988.98}'::jsonb
);

-- ---------------------------------------------------------------- permissões
-- Folha é o dado mais sensível do sistema: TODAS as chaves são exclusivas do
-- dp na Fase A. Segregação calcular ≠ aprovar (mesmo papel, usuários
-- distintos) e 2FA na aprovação são regra do serviço. Leitura de folha de
-- terceiro grava audit.leitura_sensivel; quem não tem folha.ver recebe o
-- payload SEM valores (ausência, não máscara).
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('folha.ver',        'Ver competências, folhas calculadas e memória de cálculo (leitura gera trilha)'),
  ('folha.operar',     'Operar a esteira: abrir competência, lançar variáveis e disparar cálculo'),
  ('folha.aprovar',    'Aprovar e fechar competência (usuário distinto de quem calculou; exige 2FA)'),
  ('folha.parametros', 'Administrar rubricas, tabelas legais e parâmetros (versões com vigência)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp', 'folha.ver'),
  ('dp', 'folha.operar'),
  ('dp', 'folha.aprovar'),
  ('dp', 'folha.parametros');

COMMIT;
