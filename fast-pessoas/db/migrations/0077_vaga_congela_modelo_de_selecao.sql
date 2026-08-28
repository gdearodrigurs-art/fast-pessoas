-- 0077_vaga_congela_modelo_de_selecao.sql
-- Fatia RECRUTAMENTO do Padrão Modelo, Estágio 2 (o rewire).
--
-- A VAGA passa a escolher um modelo de processo (0076) e a CONGELÁ-LO na abertura
-- — igual ao snapshot da faixa salarial que a vaga já congela (servico.ts). A
-- candidatura deixa de andar pela lista global viva de etapas e passa a andar
-- pelas etapas DO MODELO da vaga (o serviço muda junto).
--
-- Todas as vagas de hoje apontam para o GERAL (padrão), cujas etapas são
-- exatamente as etapas globais de hoje na mesma ordem — então o comportamento do
-- kanban fica IDÊNTICO ao anterior; muda só de onde a ordem das etapas é lida.
--
-- (O seletor de modelo na criação da vaga e a trava "trocar só sem candidatura"
-- vêm no Estágio 3, junto com a administração de modelos alternativos.)

BEGIN;

ALTER TABLE rh.vaga
  ADD COLUMN modelo_versao_id BIGINT REFERENCES rh.modelo_selecao_versao (id);

COMMENT ON COLUMN rh.vaga.modelo_versao_id IS
  'Modelo de processo seletivo CONGELADO na abertura da vaga (0077). A '
  'candidatura anda pelas etapas deste modelo; reformular o modelo depois NÃO '
  'afeta vaga já aberta.';

-- Backfill: toda vaga existente recebe o GERAL (padrão ativo).
UPDATE rh.vaga
   SET modelo_versao_id = (
     SELECT id FROM rh.modelo_selecao_versao WHERE padrao AND status = 'ativa'
   )
 WHERE modelo_versao_id IS NULL;

-- A partir daqui toda vaga tem modelo (o serviço passa o padrão nas novas).
ALTER TABLE rh.vaga
  ALTER COLUMN modelo_versao_id SET NOT NULL;

-- ---------------------------------------------------------------- prova
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rh.vaga WHERE modelo_versao_id IS NULL) THEN
    RAISE EXCEPTION 'vaga sem modelo após o backfill';
  END IF;
  -- Toda candidatura viva deve ter a etapa atual dentro do modelo da sua vaga —
  -- senão o rewire deixaria alguém preso (etapa fora do pipeline do modelo).
  IF EXISTS (
    SELECT 1
      FROM rh.candidatura ca
      JOIN rh.vaga v ON v.id = ca.vaga_id
     WHERE ca.status = 'ativa'
       AND NOT EXISTS (
         SELECT 1 FROM rh.modelo_selecao_etapa me
          WHERE me.modelo_versao_id = v.modelo_versao_id
            AND me.etapa_selecao_versao_id = ca.etapa_atual_id
       )
  ) THEN
    RAISE EXCEPTION 'há candidatura ativa cuja etapa atual não pertence ao modelo da vaga';
  END IF;
END $$;

COMMIT;
