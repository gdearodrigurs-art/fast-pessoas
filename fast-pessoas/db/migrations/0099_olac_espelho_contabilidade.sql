-- 0099_olac_espelho_contabilidade.sql
-- OLAC — troca de arquivo com a contabilidade (frente 3.2; decisões E1–E4 do
-- docs/20-decisoes-para-a-cadeia.md, todas respondidas pelo dono):
--
--   E1:a — a competência externa NÃO mexe no UNIQUE de rh_folha.competencia_folha
--     nem no motor: o que vem de fora vive numa TABELA PARALELA de conciliação
--     (espelho), por empresa+competência. Duas verdades convivem de propósito
--     (interna calculada × externa espelhada) e é a TELA que as põe lado a lado.
--   E2:a — o espelho é REGISTRO SOMENTE-LEITURA de conciliação: linha espelhada
--     nunca vira item de folha, nunca soma nos painéis internos. Por isso o
--     UPDATE é proibido por trigger; o DELETE fica permitido porque reimportar
--     a mesma competência+empresa SUBSTITUI o lote anterior (padrão dos lotes
--     por origem da folha — servico.ts, importarDescontosBeneficios/Ponto).
--   E3:a — o de-para rubrica → conta contábil é CATÁLOGO ADMINISTRÁVEL COM
--     VIGÊNCIA (eixo 9 — nada chumbado), molde dos catálogos versionados da
--     casa (rubrica_versao, 0013): uma vigência ativa por rubrica, encerrada é
--     imutável (rh.bloquear_versao_encerrada).
--   E4 — o layout do arquivo é NOSSO (decisão nova do dono: a OLAC se adapta).
--     Documentado em docs/anexos/layout-olac.md e no cabeçalho das rotas
--     exportar-olac/importar-olac. O MESMO layout vale na ida e na volta.
--
-- PERMISSÕES — decisão registrada: NENHUMA chave nova.
--   • exportar/importar o arquivo = operar a folha da competência → folha.operar
--     (o arquivo exportado carrega valor por pessoa: a rota grava
--     audit.leitura_sensivel além do lote — eixo 8);
--   • administrar o de-para = parâmetro da folha, na mesma tela dos demais
--     catálogos → folha.parametros. Conta contábil não é dado de pessoa; chave
--     própria seria uma terceira chave para a mesma tela sem ganho de recorte.
--
-- Staging molde rh.lote_importacao_ponto (0027:183-198): o lote guarda o que
-- entrou, o que caiu e POR QUÊ, linha a linha. Linha ruim NUNCA aborta o lote.

BEGIN;

-- ---------------------------------------------------------------- lote (ida E volta)
-- Um registro por arquivo trocado, nas DUAS direções: a exportação registra o
-- que saiu (para o dia em que a contabilidade disser "o arquivo que recebi era
-- outro"), a importação registra o que entrou e o relatório linha a linha.
CREATE TABLE rh_folha.lote_olac (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  direcao            TEXT NOT NULL CHECK (direcao IN ('exportacao', 'importacao')),
  arquivo            TEXT NOT NULL CHECK (btrim(arquivo) <> ''),
  competencia_ano    INTEGER NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2100),
  competencia_mes    INTEGER NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  -- A empresa do lote, quando o arquivo é de UMA empresa (a volta da OLAC vem
  -- por empresa processada fora: Supply, DCS, Casa do Montador). NULL quando o
  -- arquivo cobre o grupo inteiro (a ida) ou traz mais de uma empresa — nesse
  -- caso a empresa vale LINHA A LINHA no espelho, e a substituição na
  -- reimportação é por empresa+competência de qualquer forma.
  empresa_id         BIGINT REFERENCES rh.empresa_grupo (id),
  linhas_lidas       INTEGER NOT NULL DEFAULT 0 CHECK (linhas_lidas >= 0),
  linhas_aceitas     INTEGER NOT NULL DEFAULT 0 CHECK (linhas_aceitas >= 0),
  linhas_rejeitadas  INTEGER NOT NULL DEFAULT 0 CHECK (linhas_rejeitadas >= 0),
  -- {"rejeitadas": [{"linha": 42, "motivo": "…", "conteudo": "…"}],
  --  "situacoes": {"casada": 10, "sem_rubrica": 1, "sem_colaborador": 2}}
  relatorio          JSONB NOT NULL DEFAULT '{}'::jsonb,
  gerado_por         BIGINT NOT NULL REFERENCES sistema.usuario (id),
  gerado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (linhas_lidas = linhas_aceitas + linhas_rejeitadas)
);
CREATE INDEX lote_olac_por_competencia
  ON rh_folha.lote_olac (competencia_ano DESC, competencia_mes DESC, direcao);

COMMENT ON TABLE rh_folha.lote_olac IS
  'Arquivos trocados com a contabilidade (OLAC), nas duas direções, com o '
  'relatório linha a linha da importação. Layout NOSSO (E4) — '
  'docs/anexos/layout-olac.md.';

-- ---------------------------------------------------------------- espelho (a linha conciliada)
-- A linha que a contabilidade devolveu, casada (ou não) com o nosso cadastro.
-- SOMENTE-LEITURA (E2:a): nunca vira item de folha, nunca soma no painel
-- interno. Colaborador referenciado por MATRÍCULA texto — é a chave do layout;
-- colaborador_id/codigo_rubrica_interno ficam NULL quando não casou, e a
-- situacao diz por quê. O par (empresa, competência) é a unidade de
-- substituição na reimportação (E1:a).
CREATE TABLE rh_folha.espelho_olac (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id                  BIGINT NOT NULL REFERENCES rh_folha.lote_olac (id) ON DELETE CASCADE,
  competencia_ano          INTEGER NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2100),
  competencia_mes          INTEGER NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  empresa_id               BIGINT REFERENCES rh.empresa_grupo (id),
  empresa_cnpj             CHAR(14) CHECK (empresa_cnpj IS NULL OR empresa_cnpj ~ '^[0-9]{14}$'),
  matricula                TEXT NOT NULL CHECK (btrim(matricula) <> ''),
  colaborador_id           BIGINT REFERENCES rh.colaborador (id),
  codigo_rubrica_externo   TEXT NOT NULL CHECK (btrim(codigo_rubrica_externo) <> ''),
  codigo_rubrica_interno   TEXT,
  conta_contabil           TEXT,
  -- Centavo INTEIRO direto na coluna (eixo 5): o espelho não entra em conta
  -- nenhuma — é conciliação —, então não precisa do NUMERIC(12,2) das tabelas
  -- de folha. Sempre positivo: o sinal é da natureza da rubrica, não do valor.
  valor_centavos           BIGINT NOT NULL CHECK (valor_centavos >= 0),
  situacao                 TEXT NOT NULL CHECK (situacao IN ('casada', 'sem_rubrica', 'sem_colaborador')),
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- casada exige as DUAS pontas resolvidas; cada situação diz o que faltou.
  CHECK (situacao <> 'casada' OR (colaborador_id IS NOT NULL AND codigo_rubrica_interno IS NOT NULL)),
  CHECK (situacao <> 'sem_colaborador' OR colaborador_id IS NULL),
  CHECK (situacao <> 'sem_rubrica' OR (colaborador_id IS NOT NULL AND codigo_rubrica_interno IS NULL))
);
CREATE INDEX espelho_olac_por_competencia_empresa
  ON rh_folha.espelho_olac (competencia_ano, competencia_mes, empresa_id);
CREATE INDEX espelho_olac_por_lote ON rh_folha.espelho_olac (lote_id);

-- Linha de espelho não se EDITA (é o que a contabilidade mandou — corrigir é
-- reimportar o arquivo corrigido). O DELETE fica de fora do bloqueio porque a
-- reimportação da mesma competência+empresa substitui o lote anterior.
CREATE FUNCTION rh_folha.espelho_olac_sem_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'espelho OLAC é somente-leitura: linha não se edita — reimporte o arquivo corrigido';
END;
$$;
CREATE TRIGGER espelho_olac_sem_update
  BEFORE UPDATE ON rh_folha.espelho_olac
  FOR EACH ROW EXECUTE FUNCTION rh_folha.espelho_olac_sem_update();

COMMENT ON TABLE rh_folha.espelho_olac IS
  'Espelho de conciliação da folha externa (OLAC), por empresa+competência '
  '(E1:a). Somente-leitura (E2:a): nunca vira item de folha. Reimportar '
  'substitui o lote anterior da mesma competência+empresa.';

-- ---------------------------------------------------------------- de-para rubrica → conta contábil
-- Catálogo administrável COM VIGÊNCIA (E3:a, eixo 9), molde rubrica_versao
-- (0013): no máximo UMA vigência ativa por rubrica (índice parcial), versão
-- encerrada é imutável (trigger da casa). A conta é TEXTO LIVRE de propósito —
-- o plano de contas é da contabilidade ("3.1.1.01.001"), não nosso.
CREATE TABLE rh_folha.conta_contabil_rubrica (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rubrica_id       BIGINT NOT NULL REFERENCES rh_folha.rubrica (id),
  conta_contabil   TEXT NOT NULL CHECK (btrim(conta_contabil) <> ''),
  status           TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_por       BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE UNIQUE INDEX conta_contabil_rubrica_uma_ativa
  ON rh_folha.conta_contabil_rubrica (rubrica_id) WHERE status = 'ativa';
CREATE INDEX conta_contabil_rubrica_por_rubrica
  ON rh_folha.conta_contabil_rubrica (rubrica_id, inicio_vigencia DESC);
CREATE TRIGGER conta_contabil_rubrica_tocar
  BEFORE UPDATE ON rh_folha.conta_contabil_rubrica
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER conta_contabil_rubrica_congelar
  BEFORE UPDATE OR DELETE ON rh_folha.conta_contabil_rubrica
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

COMMENT ON TABLE rh_folha.conta_contabil_rubrica IS
  'De-para rubrica → conta contábil da OLAC (E3:a), administrável com vigência '
  'em /folha/parametros. A exportação resolve a conta vigente na data de '
  'referência da competência; rubrica sem de-para sai com a coluna vazia.';

-- ---------------------------------------------------------------- prova
-- Por catálogo, não por INSERT de mentira: num banco recém-migrado ainda não
-- existe usuário para satisfazer gerado_por/criado_por (molde da prova da 0095).
DO $$
DECLARE
  v_qtd INT;
BEGIN
  -- As três tabelas existem no schema da folha.
  SELECT count(*) INTO v_qtd FROM information_schema.tables
   WHERE table_schema = 'rh_folha'
     AND table_name IN ('lote_olac', 'espelho_olac', 'conta_contabil_rubrica');
  IF v_qtd <> 3 THEN
    RAISE EXCEPTION 'esperava as 3 tabelas do OLAC em rh_folha, achei %', v_qtd;
  END IF;

  -- O lote fecha a conta do relatório (lidas = aceitas + rejeitadas).
  PERFORM 1
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'rh_folha' AND t.relname = 'lote_olac' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%linhas_aceitas%linhas_rejeitadas%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lote_olac sem o CHECK lidas = aceitas + rejeitadas';
  END IF;

  -- O espelho é somente-leitura: o trigger de UPDATE está armado.
  PERFORM 1 FROM pg_trigger tg
     JOIN pg_class t ON t.oid = tg.tgrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'rh_folha' AND t.relname = 'espelho_olac'
      AND tg.tgname = 'espelho_olac_sem_update';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'espelho_olac sem o trigger que proíbe UPDATE';
  END IF;

  -- A situação 'casada' exige as duas pontas resolvidas (CHECK presente).
  PERFORM 1
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'rh_folha' AND t.relname = 'espelho_olac' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%casada%codigo_rubrica_interno%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'espelho_olac sem o CHECK que amarra situacao=casada às duas pontas';
  END IF;

  -- O de-para tem no máximo UMA vigência ativa por rubrica (índice parcial).
  PERFORM 1 FROM pg_indexes
    WHERE schemaname = 'rh_folha' AND tablename = 'conta_contabil_rubrica'
      AND indexname = 'conta_contabil_rubrica_uma_ativa'
      AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%ativa%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conta_contabil_rubrica sem o índice de uma-ativa-por-rubrica';
  END IF;

  -- Nenhuma chave nova nasceu aqui — a decisão de permissão é reusar
  -- folha.operar (arquivo) e folha.parametros (de-para); ver o cabeçalho.
  RAISE NOTICE 'OLAC: lote + espelho somente-leitura + de-para com vigência no ar';
END $$;

COMMIT;
