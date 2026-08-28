-- 0072_pdi_do_colaborador.sql
-- O PDI é alinhamento de MÃO DUPLA, mas até aqui só tinha o lado da empresa
-- (gestor rascunha com IA -> RH homologa -> publica as ações em rh.acao_aberta).
-- Falta o lado da PESSOA:
--   (1) ACEITE do plano homologado — o "de acordo" do colaborador, com carimbo.
--   (2) ANDAMENTO por ação — três estados (pendente/em andamento/concluída) MAIS
--       um LOG de registros: a pessoa vai escrevendo e mandando updates, que se
--       acumulam como uma linha do tempo por ação. O gestor/RH leem.
-- Aceite e andamento são self-service do portal (escopo = a própria pessoa), sem
-- chave nova — a guarda é exigirSessaoDoPortal + a ação/pdi ser DA pessoa.

BEGIN;

-- ---------------------------------------------------------------- (1) aceite no PDI
ALTER TABLE rh.pdi
  ADD COLUMN aceito_por BIGINT REFERENCES sistema.usuario (id),
  ADD COLUMN aceito_em  TIMESTAMPTZ,
  -- os dois andam juntos: ou o PDI foi aceito (quem + quando), ou não foi.
  ADD CONSTRAINT pdi_aceite_coerente
    CHECK ((aceito_por IS NULL) = (aceito_em IS NULL));

COMMENT ON COLUMN rh.pdi.aceito_em IS
  'Quando o COLABORADOR deu o "de acordo" no plano homologado (mão dupla). NULL = ainda não aceito. O aceite não trava nada — o plano já está homologado; é o registro do acordo do lado da pessoa.';

-- ---------------------------------------------------------------- (2a) estado "em andamento"
-- A ação ganha o meio-termo entre 'aberta' (pendente) e 'concluida': dá para ver
-- quem COMEÇOU mas ainda não terminou. 'cancelada' segue existindo (ato do gestor/RH,
-- não do colaborador).
ALTER TABLE rh.acao_aberta DROP CONSTRAINT acao_aberta_status_check;
ALTER TABLE rh.acao_aberta ADD CONSTRAINT acao_aberta_status_check
  CHECK (status IN ('aberta','em_andamento','concluida','cancelada'));

-- ---------------------------------------------------------------- (2b) log de andamento
-- Append-only: cada linha é um registro que a pessoa (ou quem acompanha) escreveu.
-- status_novo carrega a transição de estado QUANDO a pessoa muda o andamento junto
-- do texto (fica NULL num recado que não move o estado). O colaborador não cancela
-- pelo log — por isso 'cancelada' está fora do CHECK de status_novo.
CREATE TABLE rh.acao_andamento (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  acao_aberta_id    BIGINT NOT NULL REFERENCES rh.acao_aberta (id),
  autor_usuario_id  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  texto             TEXT NOT NULL CHECK (btrim(texto) <> ''),
  status_novo       TEXT CHECK (status_novo IS NULL OR
                                status_novo IN ('aberta','em_andamento','concluida')),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX acao_andamento_por_acao ON rh.acao_andamento (acao_aberta_id, criado_em);

COMMENT ON TABLE rh.acao_andamento IS
  'Log APPEND-ONLY do andamento de cada ação de PDI: o que a pessoa foi escrevendo e mandando ao longo do tempo. status_novo registra a transição de estado quando o update também move o andamento.';

-- Log é imutável: só se acrescenta linha, nunca se edita ou apaga uma existente.
CREATE FUNCTION rh.acao_andamento_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rh.acao_andamento é append-only: registro de andamento não se edita nem se apaga.';
END;
$$;
CREATE TRIGGER acao_andamento_bloquear_mutacao
  BEFORE UPDATE OR DELETE ON rh.acao_andamento
  FOR EACH ROW EXECUTE FUNCTION rh.acao_andamento_imutavel();

-- ---------------------------------------------------------------- prova (revertida)
DO $$
DECLARE
  cols INT;
BEGIN
  -- as duas colunas de aceite nasceram
  SELECT count(*) INTO cols FROM information_schema.columns
   WHERE table_schema='rh' AND table_name='pdi'
     AND column_name IN ('aceito_por','aceito_em');
  IF cols <> 2 THEN RAISE EXCEPTION 'colunas de aceite não criadas (achei %)', cols; END IF;

  -- 'em_andamento' entrou DE FATO no CHECK da ação
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='acao_aberta_status_check'
       AND pg_get_constraintdef(oid) LIKE '%em_andamento%'
  ) THEN
    RAISE EXCEPTION 'em_andamento não entrou no CHECK de acao_aberta';
  END IF;

  -- o log existe e é append-only (o trigger de bloqueio nasceu)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='acao_andamento_bloquear_mutacao'
  ) THEN
    RAISE EXCEPTION 'trigger de imutabilidade do log não criado';
  END IF;
END $$;

COMMIT;
