-- 0075_clima_pergunta_administravel.sql
-- Fatia CLIMA do Padrão Modelo (docs/17 item 2; decisões do dono em docs/16:417-464,
-- registradas na pendência #14 de docs/pendencias.md).
--
-- Decidido com o dono (13/08): a fatia é o CHECK-IN DIÁRIO (não a pesquisa
-- estruturada) — é o buraco literal (as perguntas do check-in não têm tela de
-- administração, nascem no seed da 0004 e nunca mais mudam). Sem banco de
-- perguntas compartilhado (a continuidade já dá a série; banco compartilhado
-- convidaria reidentificação entre pesquisa anônima e identificada).
--
-- Esta migration faz três coisas, todas do desenho do próprio dono:
--   1) CONTINUIDADE: coluna continua_de (auto-referência, UNIQUE) — quando uma
--      pergunta é REFORMULADA, a versão nova aponta para a que ela substitui, e
--      a série vira uma linha, nunca um Y (docs/16:437-450).
--   2) REGRA DE EDIÇÃO: o enunciado passa a mudar enquanto NÃO houver resposta —
--      não só em rascunho (docs/16:421-427). Corrige o caso real do dono: criar
--      a pergunta, reparar um erro de digitação e a trava recusar por já ter
--      saído de rascunho. Com a primeira resposta o texto congela (mudança =
--      versão nova), para o histórico não apontar para enunciado diferente do
--      que a pessoa leu.
--   3) A CHAVE que faltava: clima.pergunta.administrar (as 3 chaves de clima —
--      responder/agregado.ver/individual.ver — não cobrem administrar a
--      pergunta). Espelha pesquisa.administrar (0022): RH e DP.

BEGIN;

-- ---------------------------------------------------------------- continuidade
ALTER TABLE rh_clima.pergunta_versao
  ADD COLUMN continua_de BIGINT REFERENCES rh_clima.pergunta_versao (id);

COMMENT ON COLUMN rh_clima.pergunta_versao.continua_de IS
  'Versão anterior que ESTA reformula (docs/16:437). NULL = pergunta nova, sem '
  'continuidade. UNIQUE (índice abaixo) para a série ser LINEAR — duas versões '
  'não podem continuar a mesma anterior (um Y).';

CREATE UNIQUE INDEX pergunta_versao_continua_de_unica
  ON rh_clima.pergunta_versao (continua_de) WHERE continua_de IS NOT NULL;

-- ---------------------------------------------------------------- regra de edição
-- Substitui a trava "texto só muda em rascunho" (0004) por "texto muda enquanto
-- não houver resposta". Engloba o critério antigo (rascunho nunca tem resposta)
-- e libera o conserto de digitação numa pergunta publicada ainda sem resposta.
CREATE OR REPLACE FUNCTION rh_clima.pergunta_versao_proteger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'pergunta_versao: versão % não é rascunho e não pode ser excluída', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'encerrada' THEN
    RAISE EXCEPTION 'pergunta_versao: versão % está encerrada e é imutável', OLD.id;
  END IF;
  IF NEW.texto IS DISTINCT FROM OLD.texto
     AND EXISTS (SELECT 1 FROM rh_clima.checkin_resposta r
                  WHERE r.pergunta_versao_id = OLD.id) THEN
    RAISE EXCEPTION
      'pergunta_versao: enunciado com resposta é imutável — reformule numa versão nova';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- chave nova
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('clima.pergunta.administrar',
   'Administrar as perguntas do check-in diário (criar, editar, reformular, aposentar)')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('rh', 'clima.pergunta.administrar'),
  ('dp', 'clima.pergunta.administrar')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- prova estrutural
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'rh_clima' AND table_name = 'pergunta_versao'
                   AND column_name = 'continua_de') THEN
    RAISE EXCEPTION 'coluna continua_de não foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'rh_clima'
                   AND indexname = 'pergunta_versao_continua_de_unica') THEN
    RAISE EXCEPTION 'índice único de continua_de não foi criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sistema.permissao
                 WHERE chave = 'clima.pergunta.administrar') THEN
    RAISE EXCEPTION 'chave clima.pergunta.administrar não semeada';
  END IF;
END $$;

COMMIT;
