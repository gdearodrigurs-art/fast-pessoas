-- 0078_modelo_selecao_termina_em_oferta.sql
-- Blindagem do invariante que sustenta a fatia RECRUTAMENTO do Padrão Modelo.
--
-- O kanban e o pipeline tratam a OFERTA como a etapa TERMINAL do processo:
-- movimentarCandidatura manda "registrar a oferta" na última etapa, criarOferta
-- só aceita numa etapa tipo oferta, e o aceite fecha a vaga e dispara a admissão.
-- Se um modelo ATIVO terminar numa etapa que NÃO é de oferta, a candidatura que
-- chega ao fim encalha — sem avançar, sem ofertar e sem como ser recriada
-- (UNIQUE vaga+candidato). É o beco que a revisão do Estágio 3 achou.
--
-- O serviço criarModelo já barra isso (exige a última etapa = oferta). MAS o
-- modelo GERAL/padrão NÃO passa pelo serviço: nasce por SEED SQL (0076) e é lido
-- cru por buscarModeloPadrao. Hoje ele é bem-formado por COINCIDÊNCIA — a oferta
-- é a etapa de maior ordem no catálogo — e a prova da 0076 confere só a CONTAGEM
-- de etapas, nunca a posição. Uma migration futura que semeasse ou reordenasse um
-- padrão sem oferta no fim ressuscitaria o beco, sem nada no banco impedindo.
--
-- Esta migration põe o invariante no BANCO: vale para TODO caminho de criação
-- (seed, tela/serviço, migration futura, SQL direto), não só para o serviço.
-- O gatilho é DEFERRABLE (roda no COMMIT), porque um modelo é gravado em várias
-- linhas — a versão e depois as N etapas — e a checagem só faz sentido quando
-- todas já estão no lugar.

BEGIN;

CREATE FUNCTION rh.modelo_selecao_termina_em_oferta() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_modelo     BIGINT;
  v_status     TEXT;
  v_tipo_final TEXT;
BEGIN
  -- O gatilho vive em duas tabelas; resolve o id do modelo em cada uma.
  IF TG_TABLE_NAME = 'modelo_selecao_versao' THEN
    v_modelo := COALESCE(NEW.id, OLD.id);
  ELSE
    v_modelo := COALESCE(NEW.modelo_versao_id, OLD.modelo_versao_id);
  END IF;

  SELECT status INTO v_status
    FROM rh.modelo_selecao_versao WHERE id = v_modelo;
  -- Versão sumiu (DELETE) ou não está ativa: nada a exigir (rascunho pode estar
  -- incompleto; encerrada é histórico imutável).
  IF v_status IS DISTINCT FROM 'ativa' THEN
    RETURN NULL;
  END IF;

  SELECT e.tipo INTO v_tipo_final
    FROM rh.modelo_selecao_etapa me
    JOIN rh.etapa_selecao_versao e ON e.id = me.etapa_selecao_versao_id
   WHERE me.modelo_versao_id = v_modelo
   ORDER BY me.ordem DESC
   LIMIT 1;

  IF v_tipo_final IS DISTINCT FROM 'oferta' THEN
    RAISE EXCEPTION
      'modelo de seleção % (ativo) precisa terminar em etapa de oferta; termina em %',
      v_modelo, COALESCE(v_tipo_final, '(sem etapas)');
  END IF;
  RETURN NULL;
END;
$$;

-- Mudança nas etapas de um modelo ativo (inclui o INSERT das etapas de um seed).
CREATE CONSTRAINT TRIGGER modelo_selecao_etapa_termina_em_oferta
  AFTER INSERT OR UPDATE OR DELETE ON rh.modelo_selecao_etapa
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION rh.modelo_selecao_termina_em_oferta();

-- Ativação da versão (rascunho -> ativa), caso as etapas não sejam tocadas.
CREATE CONSTRAINT TRIGGER modelo_selecao_versao_termina_em_oferta
  AFTER INSERT OR UPDATE ON rh.modelo_selecao_versao
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION rh.modelo_selecao_termina_em_oferta();

-- ---------------------------------------------------------------- prova (estado atual)
-- Criar o gatilho não revalida linhas existentes; então confere aqui que todo
-- modelo ATIVO de hoje (o GERAL) já satisfaz o invariante. Se algum não
-- satisfizesse, a migration aborta — o dado teria que ser corrigido antes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM rh.modelo_selecao_versao m
     WHERE m.status = 'ativa'
       AND (
         SELECT e.tipo
           FROM rh.modelo_selecao_etapa me
           JOIN rh.etapa_selecao_versao e ON e.id = me.etapa_selecao_versao_id
          WHERE me.modelo_versao_id = m.id
          ORDER BY me.ordem DESC LIMIT 1
       ) IS DISTINCT FROM 'oferta'
  ) THEN
    RAISE EXCEPTION 'há modelo ativo que não termina em oferta — corrija o dado antes de blindar o invariante';
  END IF;
END $$;

COMMIT;
