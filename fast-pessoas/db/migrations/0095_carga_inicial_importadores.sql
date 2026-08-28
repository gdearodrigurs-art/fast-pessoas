-- 0095_carga_inicial_importadores.sql
-- Onda 3 (carga inicial 1/2): a fundação dos IMPORTADORES de planilha que
-- alimentam um banco de produção vazio — estrutura (empresa do grupo,
-- estabelecimento, centro de custo) e cargos/RCF. Decisões do dono (docs/20):
-- F1:a (a carga traz só a posição ATUAL, nada de histórico) e F2:b (a carga
-- NÃO cria usuários — acesso é criado um a um, depois).
--
-- Duas peças:
--
--   1. CHAVE `sistema.carga.importar` (eixo 4 — decisão por chave, nunca por
--      papel), concedida a dp e admin. Fica FORA da lista de 2FA obrigatório
--      (`exige_2fa` no default FALSE): quem a recebe são papéis que já têm 2FA
--      obrigatório por outras chaves, e a carga não LÊ dado sensível — cria
--      catálogo. Toda criação individual continua auditada pelos serviços
--      reusados (audit.alteracao), mais um registro por lote.
--
--   2. STAGING COM LOG `rh.lote_carga` — molde de rh.lote_importacao_ponto
--      (0027): o lote guarda o que entrou, o que caiu e POR QUÊ, linha a
--      linha. Uma linha ruim nunca aborta o lote. Diferença deliberada do
--      molde: a coluna `linhas_ja_existiam` — o importador é IDEMPOTENTE, e
--      linha que já existe no banco (mesma identidade: CNPJ, nome no pai
--      certo) é "já existia", não erro nem aceite. Reimportar o mesmo arquivo
--      produz um lote de "já existiam", zero duplicata.
--
--      `tipo` já prevê 'headcount': o importador de gente é a fatia 2/2 desta
--      onda e usa o MESMO staging — o agente dela não precisa de ALTER.
--
--      Schema `rh` (e não `sistema`) de propósito: provisionar.sql só tem
--      ALTER DEFAULT PRIVILEGES para rh/rh_clima/rh_folha/fiscal/audit —
--      tabela nova em `sistema` nasceria sem GRANT para app_rh em ambiente
--      provisionado.

BEGIN;

-- ------------------------------------------------------------------ chave
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('sistema.carga.importar',
   'Carga inicial por planilha: importar estrutura (empresas, estabelecimentos, centros de custo) e cargos/RCF, e consultar os lotes importados');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',    'sistema.carga.importar'),
  ('admin', 'sistema.carga.importar');

-- ------------------------------------------------------------------ lote de carga
CREATE TABLE rh.lote_carga (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo                TEXT NOT NULL CHECK (tipo IN ('estrutura', 'cargos', 'headcount')),
  arquivo             TEXT NOT NULL CHECK (btrim(arquivo) <> ''),
  linhas_lidas        INTEGER NOT NULL DEFAULT 0 CHECK (linhas_lidas >= 0),
  linhas_aceitas      INTEGER NOT NULL DEFAULT 0 CHECK (linhas_aceitas >= 0),
  linhas_ja_existiam  INTEGER NOT NULL DEFAULT 0 CHECK (linhas_ja_existiam >= 0),
  linhas_rejeitadas   INTEGER NOT NULL DEFAULT 0 CHECK (linhas_rejeitadas >= 0),
  -- {"rejeitadas": [{"linha": 42, "motivo": "…", "conteudo": "…"}], "resumo": "…"}
  relatorio           JSONB NOT NULL DEFAULT '{}'::jsonb,
  importado_por       BIGINT NOT NULL REFERENCES sistema.usuario (id),
  importado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (linhas_lidas = linhas_aceitas + linhas_ja_existiam + linhas_rejeitadas)
);
CREATE INDEX lote_carga_por_data ON rh.lote_carga (tipo, importado_em DESC);

-- ---------------------------------------------------------------- prova
DO $$
DECLARE
  v_chave  INT;
  v_papeis INT;
  v_2fa    INT;
BEGIN
  SELECT count(*) INTO v_chave FROM sistema.permissao
   WHERE chave = 'sistema.carga.importar';
  IF v_chave <> 1 THEN
    RAISE EXCEPTION 'esperava a chave sistema.carga.importar, achei %', v_chave;
  END IF;

  SELECT count(*) INTO v_papeis FROM sistema.papel_permissao
   WHERE chave = 'sistema.carga.importar' AND papel IN ('dp', 'admin');
  IF v_papeis <> 2 THEN
    RAISE EXCEPTION 'dp e admin deveriam ter sistema.carga.importar, achei %', v_papeis;
  END IF;

  -- A chave fica FORA do 2FA obrigatório, de propósito (ver cabeçalho).
  SELECT count(*) INTO v_2fa FROM sistema.permissao
   WHERE chave = 'sistema.carga.importar' AND exige_2fa;
  IF v_2fa <> 0 THEN
    RAISE EXCEPTION 'sistema.carga.importar não deveria exigir 2FA';
  END IF;

  -- O staging existe e o CHECK de soma segura as contas do relatório. A prova
  -- é por catálogo (não por INSERT de mentira): num banco recém-migrado ainda
  -- não existe usuário nenhum para satisfazer o FK de importado_por.
  PERFORM 1 FROM information_schema.tables
   WHERE table_schema = 'rh' AND table_name = 'lote_carga';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rh.lote_carga não foi criada';
  END IF;
  PERFORM 1
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'rh' AND t.relname = 'lote_carga' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%linhas_ja_existiam%linhas_rejeitadas%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'o CHECK lidas = aceitas + ja_existiam + rejeitadas não existe';
  END IF;
END $$;

COMMIT;
