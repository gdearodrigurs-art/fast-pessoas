-- 0049_meta_indicador_por_estabelecimento.sql
-- Meta de indicador por unidade deixa de ser presa pelo NOME e passa a ser
-- presa pela UNIDADE.
--
-- O DEFEITO. rh.meta_indicador_versao.escopo é TEXT e guardava 'global' ou o
-- NOME da unidade (rh.estabelecimento_versao.unidade). Renomear a lotação é
-- operação normal e exposta na tela — criarVersaoEstabelecimento encerra a
-- versão ativa e abre outra com o nome novo — e essa operação não tocava na
-- meta. O vínculo entre a meta e a loja não era uma chave, era a coincidência
-- de duas strings, e a renomeação quebrava a coincidência:
--
--   • a meta continuava status='ativa' com o nome velho e a Central de Metas
--     continuava desenhando o chip de uma unidade que não existe mais;
--   • não havia como substituí-la pela tela: o seletor de escopo só oferece
--     unidade ATIVA, e definirMeta recusava qualquer outro escopo (400);
--   • definir a meta da unidade renomeada criava uma SEGUNDA meta ativa para a
--     MESMA loja física, porque o índice único era (indicador_id, escopo) e os
--     dois nomes diferem;
--   • na troca de nomes entre filiais ('Norte' vira 'Leste'), a meta da Norte
--     passava a ser lida como a meta da Leste, em silêncio.
--
-- A CORREÇÃO segue o que o resto do projeto já faz: a requisição de vaga guarda
-- estabelecimento_versao_id (rh.vaga/requisição) e o painel executivo agrupa
-- por estabelecimento_id resolvendo o rótulo pela versão da data. Aqui:
--
--   estabelecimento_id  é a CHAVE (NULL = meta global), com FK de verdade;
--   escopo              vira RÓTULO CONGELADO — o nome que a unidade tinha
--                       quando a meta foi pactuada. É exatamente o certo numa
--                       linha versionada que nunca sofre UPDATE: o histórico
--                       mostra o nome da época, a tela mostra o nome de hoje
--                       (resolvido por rh.estabelecimento_versao_em).

BEGIN;

ALTER TABLE rh.meta_indicador_versao
  ADD COLUMN estabelecimento_id BIGINT REFERENCES rh.estabelecimento (id);

-- Backfill pelo único dado que existe hoje: o nome gravado. Casa com QUALQUER
-- versão do estabelecimento (não só a ativa), porque meta encerrada guarda o
-- nome da época. Versão encerrada é imutável para a aplicação (trigger
-- meta_versao_protegida) — desligamos os triggers de usuário da tabela, do
-- mesmo jeito que db/semear/comum.js faz, e a transação os religa.
ALTER TABLE rh.meta_indicador_versao DISABLE TRIGGER USER;

UPDATE rh.meta_indicador_versao v
   SET estabelecimento_id = (
         SELECT ev.estabelecimento_id
           FROM rh.estabelecimento_versao ev
          WHERE ev.unidade = v.escopo
          ORDER BY (ev.status = 'ativa') DESC,
                   ev.inicio_vigencia DESC,
                   ev.id DESC
          LIMIT 1)
 WHERE v.escopo <> 'global';

ALTER TABLE rh.meta_indicador_versao ENABLE TRIGGER USER;

-- Se sobrou meta cujo nome não casa com nenhuma unidade que já existiu, a
-- migration PARA: inventar um dono para a meta seria pior que o defeito.
DO $$
DECLARE orfas TEXT;
BEGIN
  SELECT string_agg(DISTINCT escopo, ', ') INTO orfas
    FROM rh.meta_indicador_versao
   WHERE escopo <> 'global' AND estabelecimento_id IS NULL;
  IF orfas IS NOT NULL THEN
    RAISE EXCEPTION
      'meta_indicador_versao: escopo(s) sem estabelecimento correspondente: %. '
      'Acerte o nome (ou encerre a meta) antes de migrar.', orfas;
  END IF;
END $$;

ALTER TABLE rh.meta_indicador_versao
  ADD CONSTRAINT meta_indicador_escopo_coerente
  CHECK ((escopo = 'global') = (estabelecimento_id IS NULL));

-- Uma ativa por indicador+UNIDADE (não mais por indicador+nome). É este índice
-- que impede a "segunda meta ativa da mesma loja" depois de uma renomeação.
DROP INDEX rh.meta_indicador_ativa_unica;
CREATE UNIQUE INDEX meta_indicador_ativa_unica
  ON rh.meta_indicador_versao (indicador_id, (COALESCE(estabelecimento_id, 0)))
  WHERE status = 'ativa';

COMMENT ON COLUMN rh.meta_indicador_versao.estabelecimento_id IS
  'Unidade dona da meta (rh.estabelecimento). NULL = meta global. É a CHAVE: '
  'renomear a unidade não solta a meta, e duas metas ativas para a mesma '
  'unidade são impossíveis (meta_indicador_ativa_unica).';

COMMENT ON COLUMN rh.meta_indicador_versao.escopo IS
  'Rótulo CONGELADO: ''global'' ou o nome que a unidade tinha quando a meta foi '
  'pactuada. É histórico de exibição, NUNCA chave — quem quiser o nome de hoje '
  'resolve por rh.estabelecimento_versao_em(estabelecimento_id, data).';

COMMIT;
