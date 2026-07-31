-- 0027_ponto.sql
-- Ponto e banco de horas — Onda F, etapa 1 (fundação + motor de apuração).
-- Base funcional: docs/10-plano-pos-reuniao-diretoria.md §3 ONDA F.
--
-- RECORTE LEGAL QUE DEFINE O ESCOPO
-- A MARCAÇÃO com validade jurídica exige REP-P homologado (Portaria MTP 671/2021),
-- que a empresa ainda não contratou. Esta migration NÃO cria registrador de ponto:
-- cria tudo que CONSOME marcação — importação, apuração, banco de horas e visões.
-- Quando o REP-P entrar, ele passa a alimentar rh.marcacao com origem = 'rep_p'
-- (via AFD/AEJ) e nada mais muda.
--
-- PRECISÃO: TODA hora neste arquivo é MINUTO INTEIRO (INTEGER). Nunca float,
-- nunca INTERVAL — a mesma disciplina que a folha aplica a centavos. A conversão
-- para "7h20" é formatação de tela.
--
-- VERSIONAMENTO: jornada e regra de banco de horas são PARÂMETRO OPERACIONAL,
-- portanto DADO VERSIONADO COM VIGÊNCIA (rascunho→ativa→encerrada, padrão do
-- 0002). Mudar uma regra é criar versão NOVA — nunca UPDATE no que já vigorou,
-- senão a apuração do passado muda sozinha.
--
-- APPEND-ONLY: rh.marcacao e rh.banco_horas_movimento têm audit.bloquear_mutacao.
-- Correção de marcação é marcação NOVA com origem 'ajuste_manual' apontando para
-- a anterior; saldo do banco é SOMA dos movimentos, nunca um campo mutável.

BEGIN;

-- ================================================================ jornada (parâmetro versionado)
-- Uma jornada tem IDENTIDADE estável no `codigo` (ex.: 'COMERCIAL-44') e regra
-- na versão com vigência — mesmo contrato de rh.cargo_versao, sem precisar de
-- uma tabela-identidade separada (a jornada não tem atributo próprio fora da
-- regra). rh.escala_colaborador pina a VERSÃO, como posicao_colaborador pina
-- cargo_versao: encerrar a versão não reescreve a apuração já feita.
CREATE TABLE rh.jornada_versao (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                     TEXT NOT NULL CHECK (btrim(codigo) <> ''),
  nome                       TEXT NOT NULL CHECK (btrim(nome) <> ''),
  tipo                       TEXT NOT NULL CHECK (tipo IN
                               ('5x2','6x1','12x36','escala_livre')),
  -- Carga contratual. Diária = o previsto de um dia útil comum; semanal = o
  -- teto do art. 7º XIII (44h = 2640 min). O previsto do sábado no 6x1 é
  -- semanal − 5 × diária, calculado pelo motor.
  carga_diaria_minutos       INTEGER NOT NULL CHECK (carga_diaria_minutos BETWEEN 0 AND 1440),
  carga_semanal_minutos      INTEGER NOT NULL CHECK (carga_semanal_minutos BETWEEN 0 AND 10080),
  -- Intervalo intrajornada mínimo (CLT art. 71: 60 min acima de 6h).
  intervalo_minimo_minutos   INTEGER NOT NULL DEFAULT 60
                             CHECK (intervalo_minimo_minutos BETWEEN 0 AND 480),
  -- CLT art. 58 §1º: até 5 min por marcação, 10 min no dia, não são jornada
  -- extraordinária nem atraso. O motor usa a SOMA das duas como tolerância
  -- diária, nos dois sentidos (não vira HE e não vira atraso).
  tolerancia_entrada_minutos INTEGER NOT NULL DEFAULT 5
                             CHECK (tolerancia_entrada_minutos BETWEEN 0 AND 60),
  tolerancia_saida_minutos   INTEGER NOT NULL DEFAULT 5
                             CHECK (tolerancia_saida_minutos BETWEEN 0 AND 60),
  -- Janela do adicional noturno (CLT art. 73: urbano 22:00→05:00). Parâmetro,
  -- não constante: rural e acordo coletivo mudam a janela.
  adicional_noturno_inicio   TIME NOT NULL DEFAULT '22:00',
  adicional_noturno_fim      TIME NOT NULL DEFAULT '05:00',
  status                     TEXT NOT NULL DEFAULT 'rascunho'
                             CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia            DATE NOT NULL,
  fim_vigencia               DATE,
  criado_em                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL),
  CHECK (carga_semanal_minutos >= carga_diaria_minutos)
);
CREATE INDEX jornada_versao_por_codigo
  ON rh.jornada_versao (codigo, inicio_vigencia DESC);
CREATE UNIQUE INDEX jornada_versao_uma_ativa
  ON rh.jornada_versao (codigo) WHERE status = 'ativa';
CREATE TRIGGER jornada_versao_tocar BEFORE UPDATE ON rh.jornada_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER jornada_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.jornada_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ================================================================ escala do colaborador
-- Qual jornada cada pessoa segue, com vigência. Trocar de jornada encerra a
-- vigência e abre outra — a apuração de março continua olhando a jornada de março.
CREATE TABLE rh.escala_colaborador (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id     BIGINT NOT NULL REFERENCES rh.colaborador (id),
  jornada_versao_id  BIGINT NOT NULL REFERENCES rh.jornada_versao (id),
  inicio_vigencia    DATE NOT NULL,
  fim_vigencia       DATE,
  observacao         TEXT,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia)
);
CREATE INDEX escala_colaborador_por_pessoa
  ON rh.escala_colaborador (colaborador_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX escala_colaborador_uma_vigente
  ON rh.escala_colaborador (colaborador_id) WHERE fim_vigencia IS NULL;
CREATE TRIGGER escala_colaborador_tocar BEFORE UPDATE ON rh.escala_colaborador
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER escala_colaborador_congelar
  BEFORE UPDATE OR DELETE ON rh.escala_colaborador
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_vigencia_encerrada();

-- ================================================================ feriado
-- Não existia no sistema e já fazia falta em férias, prazos de demanda e no
-- "dia útil" do painel executivo. Abrangência resolve a hierarquia: nacional
-- vale para todos; estadual exige UF; municipal exige UF + município.
-- estabelecimento_id restringe a um estabelecimento específico (útil para
-- aniversário da cidade da filial e para feriado de categoria por acordo).
-- tipo separa FERIADO (dia de repouso: trabalho é HE 100%) de PONTO FACULTATIVO
-- (dia útil comum, a menos que a empresa decida o contrário).
CREATE TABLE rh.feriado (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data                DATE NOT NULL,
  nome                TEXT NOT NULL CHECK (btrim(nome) <> ''),
  abrangencia         TEXT NOT NULL CHECK (abrangencia IN
                        ('nacional','estadual','municipal')),
  uf                  CHAR(2),
  municipio           TEXT,
  estabelecimento_id  BIGINT REFERENCES rh.estabelecimento (id),
  tipo                TEXT NOT NULL DEFAULT 'feriado'
                      CHECK (tipo IN ('feriado','ponto_facultativo')),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (abrangencia <> 'nacional' OR (uf IS NULL AND municipio IS NULL)),
  CHECK (abrangencia <> 'estadual' OR (uf IS NOT NULL AND municipio IS NULL)),
  CHECK (abrangencia <> 'municipal' OR (uf IS NOT NULL AND municipio IS NOT NULL))
);
CREATE INDEX feriado_por_data ON rh.feriado (data);
-- Mesmo feriado não entra duas vezes no mesmo alcance (COALESCE porque UNIQUE
-- com NULL deixaria passar duplicata nacional).
CREATE UNIQUE INDEX feriado_sem_repeticao ON rh.feriado (
  data, abrangencia, COALESCE(uf, ''), COALESCE(municipio, ''),
  COALESCE(estabelecimento_id, 0)
);
CREATE TRIGGER feriado_tocar BEFORE UPDATE ON rh.feriado
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ================================================================ marcação (append-only)
-- O fato bruto. Nunca se apaga e nunca se edita: corrigir é INSERIR outra com
-- origem 'ajuste_manual' apontando para a corrigida em substitui_marcacao_id.
--   efeito = 'registro'  → a nova vale no lugar da antiga
--   efeito = 'anulacao'  → a antiga só sai da apuração (duplicata, batida errada)
-- Uma marcação é considerada SUPERADA quando existe outra apontando para ela;
-- o motor só enxerga as não superadas com efeito 'registro'.
CREATE TABLE rh.marcacao (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id         BIGINT NOT NULL REFERENCES rh.colaborador (id),
  -- Instante absoluto. UTC no banco, America/Sao_Paulo só na exibição e no
  -- agrupamento por dia (feito com AT TIME ZONE na consulta).
  momento                TIMESTAMPTZ NOT NULL,
  tipo                   TEXT NOT NULL CHECK (tipo IN
                           ('entrada','saida','inicio_intervalo','fim_intervalo')),
  origem                 TEXT NOT NULL CHECK (origem IN
                           ('rep_p','importacao','ajuste_manual')),
  -- NSR do AFD, "arquivo.csv:linha 42", ou o motivo do ajuste.
  origem_referencia      TEXT,
  efeito                 TEXT NOT NULL DEFAULT 'registro'
                         CHECK (efeito IN ('registro','anulacao')),
  substitui_marcacao_id  BIGINT REFERENCES rh.marcacao (id),
  lote_id                BIGINT,   -- FK adicionada depois de criar o lote
  importada_em           TIMESTAMPTZ,
  registrada_por         BIGINT NOT NULL REFERENCES sistema.usuario (id),
  registrada_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ajuste manual sem justificativa não passa: é ele que a fiscalização olha.
  CHECK (origem <> 'ajuste_manual' OR btrim(COALESCE(origem_referencia, '')) <> ''),
  CHECK (efeito <> 'anulacao' OR substitui_marcacao_id IS NOT NULL)
);
CREATE INDEX marcacao_por_pessoa_momento
  ON rh.marcacao (colaborador_id, momento);
CREATE INDEX marcacao_por_substituida
  ON rh.marcacao (substitui_marcacao_id) WHERE substitui_marcacao_id IS NOT NULL;
-- Reimportar o mesmo arquivo não duplica batida: a segunda linha idêntica bate
-- nesta unicidade e é REJEITADA com motivo, sem derrubar o lote.
CREATE UNIQUE INDEX marcacao_sem_repeticao
  ON rh.marcacao (colaborador_id, momento, tipo)
  WHERE substitui_marcacao_id IS NULL;
CREATE TRIGGER marcacao_imutavel
  BEFORE UPDATE OR DELETE ON rh.marcacao
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ================================================================ lote de importação
-- Staging com log, padrão da camada de integrações: o lote guarda o que entrou,
-- o que caiu e POR QUÊ, linha a linha. Uma linha ruim nunca aborta o lote.
CREATE TABLE rh.lote_importacao_ponto (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  arquivo            TEXT NOT NULL CHECK (btrim(arquivo) <> ''),
  competencia_ano    INTEGER NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2100),
  competencia_mes    INTEGER NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  linhas_lidas       INTEGER NOT NULL DEFAULT 0 CHECK (linhas_lidas >= 0),
  linhas_aceitas     INTEGER NOT NULL DEFAULT 0 CHECK (linhas_aceitas >= 0),
  linhas_rejeitadas  INTEGER NOT NULL DEFAULT 0 CHECK (linhas_rejeitadas >= 0),
  -- {"rejeitadas": [{"linha": 42, "motivo": "…", "conteudo": "…"}], "avisos": [...]}
  relatorio          JSONB NOT NULL DEFAULT '{}'::jsonb,
  importado_por      BIGINT NOT NULL REFERENCES sistema.usuario (id),
  importado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (linhas_lidas = linhas_aceitas + linhas_rejeitadas)
);
CREATE INDEX lote_importacao_ponto_por_competencia
  ON rh.lote_importacao_ponto (competencia_ano DESC, competencia_mes DESC);
ALTER TABLE rh.marcacao
  ADD CONSTRAINT marcacao_lote_fk
  FOREIGN KEY (lote_id) REFERENCES rh.lote_importacao_ponto (id);

-- ================================================================ apuração da competência
-- Como a folha faz: o resultado guarda a MEMÓRIA DE CÁLCULO por linha. `memoria`
-- traz os dias com previsto/trabalhado/HE/noturno, a fórmula do DSR com as
-- semanas que o derrubaram, e a jornada/regra que valeram — para o DP conseguir
-- explicar cada minuto para o colaborador sem reabrir o cálculo.
-- Não é append-only: reapurar a mesma competência sobrescreve a linha (o
-- histórico fica em audit.alteracao) e ESTORNA o movimento antigo do banco de
-- horas com um lançamento contrário, porque LÁ nada se apaga.
CREATE TABLE rh.apuracao_ponto (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id           BIGINT NOT NULL REFERENCES rh.colaborador (id),
  ano                      INTEGER NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  mes                      INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  jornada_versao_id        BIGINT NOT NULL REFERENCES rh.jornada_versao (id),
  -- FK criada logo após rh.regra_banco_horas_versao existir (fim do arquivo).
  regra_banco_versao_id    BIGINT,
  minutos_trabalhados      INTEGER NOT NULL DEFAULT 0 CHECK (minutos_trabalhados >= 0),
  minutos_previstos        INTEGER NOT NULL DEFAULT 0 CHECK (minutos_previstos >= 0),
  he_50_minutos            INTEGER NOT NULL DEFAULT 0 CHECK (he_50_minutos >= 0),
  he_100_minutos           INTEGER NOT NULL DEFAULT 0 CHECK (he_100_minutos >= 0),
  adicional_noturno_minutos INTEGER NOT NULL DEFAULT 0 CHECK (adicional_noturno_minutos >= 0),
  faltas_minutos           INTEGER NOT NULL DEFAULT 0 CHECK (faltas_minutos >= 0),
  atrasos_minutos          INTEGER NOT NULL DEFAULT 0 CHECK (atrasos_minutos >= 0),
  dsr_desconto_minutos     INTEGER NOT NULL DEFAULT 0 CHECK (dsr_desconto_minutos >= 0),
  -- Crédito/débito que ESTA competência mandou para o banco de horas (já com o
  -- fator da regra). Espelha a soma dos movimentos de origem 'apuracao'.
  saldo_banco_minutos      INTEGER NOT NULL DEFAULT 0,
  memoria                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculada_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculada_por            BIGINT NOT NULL REFERENCES sistema.usuario (id)
);
CREATE UNIQUE INDEX apuracao_ponto_uma_por_competencia
  ON rh.apuracao_ponto (colaborador_id, ano, mes);
CREATE INDEX apuracao_ponto_por_competencia
  ON rh.apuracao_ponto (ano DESC, mes DESC);

-- ================================================================ intercorrência
-- A fila que hoje consumiria um estagiário dedicado. Nasce da apuração (o motor
-- detecta) e morre pela mão do DP, auditada.
CREATE TABLE rh.intercorrencia_ponto (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  data            DATE NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN
                    ('entrada_sem_saida','intervalo_incompleto','marcacao_duplicada',
                     'sem_marcacao','fora_da_tolerancia')),
  status          TEXT NOT NULL DEFAULT 'aberta'
                  CHECK (status IN ('aberta','corrigida','justificada','ignorada')),
  detalhe         TEXT NOT NULL DEFAULT '',
  corrigida_por   BIGINT REFERENCES sistema.usuario (id),
  corrigido_em    TIMESTAMPTZ,
  observacao      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status = 'aberta' OR corrigida_por IS NOT NULL),
  -- Fechar intercorrência sem dizer o porquê é o que a fiscalização estranha.
  CHECK (status IN ('aberta','corrigida') OR btrim(COALESCE(observacao, '')) <> '')
);
-- Reapurar não duplica a fila nem apaga o que o DP já tratou: o serviço remove
-- só as 'aberta' do período antes de redetectar e reinsere sobre esta chave.
CREATE UNIQUE INDEX intercorrencia_ponto_sem_repeticao
  ON rh.intercorrencia_ponto (colaborador_id, data, tipo);
CREATE INDEX intercorrencia_ponto_abertas
  ON rh.intercorrencia_ponto (data DESC) WHERE status = 'aberta';
CREATE TRIGGER intercorrencia_ponto_tocar BEFORE UPDATE ON rh.intercorrencia_ponto
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ================================================================ regra de banco de horas
-- Parametrização em TRÊS NÍVEIS, pedido explícito da diretoria: padrão da
-- empresa → padrão da unidade OU do cargo → exceção da pessoa. O mais
-- específico vence, nesta ordem de precedência:
--   colaborador (3) > cargo (2) > estabelecimento (1) > empresa (0)
-- Exatamente UM escopo por versão (ou nenhum, para o padrão da empresa) — se
-- pudesse combinar cargo + unidade a resolução viraria adivinhação.
CREATE TABLE rh.regra_banco_horas_versao (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estabelecimento_id       BIGINT REFERENCES rh.estabelecimento (id),
  cargo_id                 BIGINT REFERENCES rh.cargo (id),
  colaborador_id           BIGINT REFERENCES rh.colaborador (id),
  -- CLT art. 59 §2º: compensação em até 1 ano no acordo coletivo; §5º: 6 meses
  -- no acordo individual. Prazo é parâmetro porque muda por acordo.
  prazo_compensacao_dias   INTEGER NOT NULL DEFAULT 180
                           CHECK (prazo_compensacao_dias BETWEEN 1 AND 730),
  limite_positivo_minutos  INTEGER NOT NULL DEFAULT 2400
                           CHECK (limite_positivo_minutos >= 0),
  limite_negativo_minutos  INTEGER NOT NULL DEFAULT 1200
                           CHECK (limite_negativo_minutos >= 0),
  expira_saldo             BOOLEAN NOT NULL DEFAULT TRUE,
  tratamento_rescisao      TEXT NOT NULL DEFAULT 'paga'
                           CHECK (tratamento_rescisao IN ('paga','perde','compensa')),
  -- Quanto vale no BANCO cada minuto extra. 1.00 = compensação hora a hora;
  -- 1.50 / 2.00 = o acordo manda creditar com o mesmo adicional do pagamento.
  -- A apuração guarda a HE em minutos CRUS (é isso que a folha paga) e credita
  -- no banco os minutos JÁ multiplicados — a memória mostra os dois.
  fator_he_50              NUMERIC(4,2) NOT NULL DEFAULT 1.50
                           CHECK (fator_he_50 >= 1 AND fator_he_50 <= 9),
  fator_he_100             NUMERIC(4,2) NOT NULL DEFAULT 2.00
                           CHECK (fator_he_100 >= 1 AND fator_he_100 <= 9),
  status                   TEXT NOT NULL DEFAULT 'rascunho'
                           CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia          DATE NOT NULL,
  fim_vigencia             DATE,
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL),
  CHECK (
    (CASE WHEN estabelecimento_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN cargo_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN colaborador_id IS NULL THEN 0 ELSE 1 END) <= 1
  )
);
-- Uma regra ativa por escopo (inclusive uma única ativa para a empresa toda).
CREATE UNIQUE INDEX regra_banco_horas_uma_ativa_por_escopo
  ON rh.regra_banco_horas_versao (
    COALESCE(estabelecimento_id, 0), COALESCE(cargo_id, 0), COALESCE(colaborador_id, 0)
  ) WHERE status = 'ativa';
CREATE TRIGGER regra_banco_horas_versao_tocar
  BEFORE UPDATE ON rh.regra_banco_horas_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER regra_banco_horas_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.regra_banco_horas_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- A FK de apuracao_ponto só pôde ser criada agora (a tabela referenciada vem
-- depois no arquivo por causa da ordem de leitura).
ALTER TABLE rh.apuracao_ponto
  ADD CONSTRAINT apuracao_ponto_regra_fk
  FOREIGN KEY (regra_banco_versao_id) REFERENCES rh.regra_banco_horas_versao (id);

-- ================================================================ banco de horas (append-only)
-- SALDO É A SOMA DOS MOVIMENTOS. Não existe campo de saldo mutável em lugar
-- nenhum — é isso que impede o saldo de "andar sozinho" e permite responder
-- "de onde veio essa hora?" para qualquer minuto.
CREATE TABLE rh.banco_horas_movimento (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  data            DATE NOT NULL,
  minutos         INTEGER NOT NULL CHECK (minutos <> 0),   -- (+) crédito, (−) débito
  origem          TEXT NOT NULL CHECK (origem IN
                    ('apuracao','compensacao','expiracao','ajuste','rescisao')),
  apuracao_id     BIGINT REFERENCES rh.apuracao_ponto (id),
  observacao      TEXT NOT NULL DEFAULT '',
  registrado_por  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  registrado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (origem <> 'apuracao' OR apuracao_id IS NOT NULL)
);
CREATE INDEX banco_horas_movimento_por_pessoa
  ON rh.banco_horas_movimento (colaborador_id, data DESC);
CREATE INDEX banco_horas_movimento_por_apuracao
  ON rh.banco_horas_movimento (apuracao_id) WHERE apuracao_id IS NOT NULL;
CREATE TRIGGER banco_horas_movimento_imutavel
  BEFORE UPDATE OR DELETE ON rh.banco_horas_movimento
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ================================================================ SEED — jornadas
-- Três jornadas plausíveis para distribuidora de material de construção.
-- 5x2 comercial 44h: 8h48 de segunda a sexta (528 min × 5 = 2640).
-- 6x1 loja 44h: 7h20 de segunda a sexta + 4h no sábado (440 × 5 + 240 = 2640).
-- 12x36: 12h de plantão; a média legal é 36h/semana (art. 59-A).
INSERT INTO rh.jornada_versao
  (codigo, nome, tipo, carga_diaria_minutos, carga_semanal_minutos,
   intervalo_minimo_minutos, tolerancia_entrada_minutos, tolerancia_saida_minutos,
   adicional_noturno_inicio, adicional_noturno_fim, status, inicio_vigencia)
VALUES
  ('COMERCIAL-44', 'Administrativo 44h (5x2)', '5x2',
   528, 2640, 60, 5, 5, '22:00', '05:00', 'ativa', DATE '2026-01-01'),
  ('LOJA-44', 'Loja 44h (6x1, sábado 4h)', '6x1',
   440, 2640, 60, 5, 5, '22:00', '05:00', 'ativa', DATE '2026-01-01'),
  ('PLANTAO-12X36', 'Plantão 12x36 (centro de distribuição)', '12x36',
   720, 2160, 60, 5, 5, '22:00', '05:00', 'ativa', DATE '2026-01-01');

-- ================================================================ SEED — regra padrão da empresa
-- Nível 0 (empresa). Unidade, cargo e pessoa entram pela tela de parâmetros.
INSERT INTO rh.regra_banco_horas_versao
  (prazo_compensacao_dias, limite_positivo_minutos, limite_negativo_minutos,
   expira_saldo, tratamento_rescisao, fator_he_50, fator_he_100,
   status, inicio_vigencia)
VALUES
  (180, 2400, 1200, TRUE, 'paga', 1.50, 2.00, 'ativa', DATE '2026-01-01');

-- ================================================================ SEED — feriados nacionais
-- Ano corrente (2026) e o próximo (2027). Móveis calculados a partir da Páscoa
-- (05/04/2026 e 28/03/2027). Carnaval e Corpus Christi entram como PONTO
-- FACULTATIVO porque é o que a lei federal diz — a empresa promove a feriado
-- na tela se o acordo coletivo mandar (e aí o trabalho no dia vira HE 100%).
INSERT INTO rh.feriado (data, nome, abrangencia, tipo) VALUES
  (DATE '2026-01-01', 'Confraternização Universal',      'nacional', 'feriado'),
  (DATE '2026-02-16', 'Carnaval (segunda)',              'nacional', 'ponto_facultativo'),
  (DATE '2026-02-17', 'Carnaval (terça)',                'nacional', 'ponto_facultativo'),
  (DATE '2026-04-03', 'Sexta-feira Santa',               'nacional', 'feriado'),
  (DATE '2026-04-21', 'Tiradentes',                      'nacional', 'feriado'),
  (DATE '2026-05-01', 'Dia do Trabalho',                 'nacional', 'feriado'),
  (DATE '2026-06-04', 'Corpus Christi',                  'nacional', 'ponto_facultativo'),
  (DATE '2026-09-07', 'Independência do Brasil',         'nacional', 'feriado'),
  (DATE '2026-10-12', 'Nossa Senhora Aparecida',         'nacional', 'feriado'),
  (DATE '2026-11-02', 'Finados',                         'nacional', 'feriado'),
  (DATE '2026-11-15', 'Proclamação da República',        'nacional', 'feriado'),
  (DATE '2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional', 'feriado'),
  (DATE '2026-12-25', 'Natal',                           'nacional', 'feriado'),
  (DATE '2027-01-01', 'Confraternização Universal',      'nacional', 'feriado'),
  (DATE '2027-02-08', 'Carnaval (segunda)',              'nacional', 'ponto_facultativo'),
  (DATE '2027-02-09', 'Carnaval (terça)',                'nacional', 'ponto_facultativo'),
  (DATE '2027-03-26', 'Sexta-feira Santa',               'nacional', 'feriado'),
  (DATE '2027-04-21', 'Tiradentes',                      'nacional', 'feriado'),
  (DATE '2027-05-01', 'Dia do Trabalho',                 'nacional', 'feriado'),
  (DATE '2027-05-27', 'Corpus Christi',                  'nacional', 'ponto_facultativo'),
  (DATE '2027-09-07', 'Independência do Brasil',         'nacional', 'feriado'),
  (DATE '2027-10-12', 'Nossa Senhora Aparecida',         'nacional', 'feriado'),
  (DATE '2027-11-02', 'Finados',                         'nacional', 'feriado'),
  (DATE '2027-11-15', 'Proclamação da República',        'nacional', 'feriado'),
  (DATE '2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional', 'feriado'),
  (DATE '2027-12-25', 'Natal',                           'nacional', 'feriado');

-- ================================================================ permissões
-- Espelho de ponto do PRÓPRIO é direito do trabalhador (Portaria 671 art. 79):
-- todo papel tem. Equipe é do gestor (alcance vem de rh.relacao_gestor, não do
-- papel) e da diretoria. Ajustar/importar/parametrizar é DP: é ato com efeito
-- legal e trilha obrigatória.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('ponto.ver.proprio', 'Ver o próprio espelho de ponto, saldo de banco de horas e histórico'),
  ('ponto.ver.equipe',  'Ver espelho e banco de horas dos liderados (alcance pela relação gestor vigente)'),
  ('ponto.administrar', 'Ver e apurar o ponto de toda a empresa; tratar a fila de intercorrências'),
  ('ponto.ajustar',     'Corrigir marcação (append-only, com justificativa) e lançar movimento de banco de horas'),
  ('ponto.parametros',  'Administrar jornadas, escalas, feriados e regras de banco de horas (versões com vigência)'),
  ('ponto.importar',    'Importar planilha/arquivo de marcações e consultar os lotes');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('funcionario', 'ponto.ver.proprio'),
  ('gestor',      'ponto.ver.proprio'),
  ('rh',          'ponto.ver.proprio'),
  ('recrutador',  'ponto.ver.proprio'),
  ('lider_td',    'ponto.ver.proprio'),
  ('dp',          'ponto.ver.proprio'),
  ('diretoria',   'ponto.ver.proprio'),
  ('admin',       'ponto.ver.proprio'),
  ('gestor',      'ponto.ver.equipe'),
  ('dp',          'ponto.ver.equipe'),
  ('diretoria',   'ponto.ver.equipe'),
  ('dp',          'ponto.administrar'),
  ('diretoria',   'ponto.administrar'),
  ('dp',          'ponto.ajustar'),
  ('dp',          'ponto.parametros'),
  ('dp',          'ponto.importar');

COMMIT;
