-- 0052 — quem respondeu foi a PESSOA, não o contrato
--
-- O QUE ESTAVA ERRADO. As duas travas de "já respondi" do clima nasceram
-- quando `rh.colaborador` ERA a pessoa:
--
--   rh_clima.participacao_pesquisa  UNIQUE (pesquisa_id, colaborador_id)
--   rh_clima.checkin_resposta       UNIQUE (colaborador_id, pergunta_versao_id,
--                                           data_referencia)
--
-- A 0046 separou pessoa de vínculo e a 0048 fez a transferência entre empresas
-- do grupo encerrar um vínculo e abrir outro para a MESMA pessoa. A partir daí
-- `colaborador_id` deixou de ser sinônimo de pessoa, e as duas travas passaram
-- a valer por CONTRATO — quem muda de CNPJ no meio da janela ganha uma segunda
-- cédula.
--
-- O caso medido, com dado real da base de desenvolvimento: a pesquisa 68
-- ("Pulse da quinzena", ABERTA até 10/08/2026) tem a participação 1833 de
-- 28/07/2026 no vínculo 3362. Em 31/07/2026 esse vínculo foi encerrado por
-- transferência e o 3396 abriu no mesmo dia. Como a leitura de "eu" resolve por
-- `rh.vinculo_atual`, o portal voltou a oferecer a MESMA pesquisa com
-- "respondida: false", e o INSERT passaria: a chave existente é (68, 3362) e a
-- nova seria (68, 3396). Duas participações e dois conjuntos de resposta da
-- mesma pessoa na mesma pesquisa — eNPS, média do pulse e denominador de adesão
-- contando a opinião dela em dobro. E a pesquisa é ANÔNIMA ("resultado só em
-- agregado"), então a duplicata é impossível de rastrear e desfazer depois. O
-- check-in diário tem a mesma forma e a mesma janela: no DIA da transferência
-- dava para responder duas vezes.
--
-- A CORREÇÃO. `pessoa_id` passa a ser coluna das duas tabelas, PROJETADA do
-- vínculo por trigger — a mesma escolha da 0046 para CPF e nome no vínculo:
-- não existe caminho de escrita que possa divergir, porque quem preenche é o
-- banco. A trava por pessoa entra AO LADO da trava por vínculo, que continua
-- valendo (as consultas por vínculo seguem existindo).
--
-- Nada é apagado: rodei a conta antes e as duas tabelas têm ZERO pares que
-- colidiriam pela chave nova (nenhuma pessoa respondeu duas vezes ainda) — a
-- trava fecha a porta ANTES do primeiro caso, que é o único momento em que
-- fechá-la é barato numa pesquisa anônima.
--
-- APPEND-ONLY. As duas tabelas têm `audit.bloquear_mutacao()` em BEFORE UPDATE
-- OR DELETE, e isso não muda: a projeção é trigger de INSERT, e a única linha
-- de UPDATE deste arquivo é o backfill do dado que acabou de nascer, com o
-- guarda desligado e religado dentro da MESMA transação. Nenhum caminho da
-- aplicação ganha permissão de alterar resposta.
--
-- rh.colaborador.pessoa_id é NOT NULL e nunca muda para um vínculo existente (a
-- 0046 fez a projeção descer da pessoa para o vínculo, nunca o contrário),
-- então a projeção aqui é estável por construção.

BEGIN;

-- ------------------------------------------------------------------ projeção

CREATE FUNCTION rh_clima.projetar_pessoa_do_vinculo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_pessoa BIGINT;
BEGIN
  SELECT c.pessoa_id INTO v_pessoa
    FROM rh.colaborador c
   WHERE c.id = NEW.colaborador_id;
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'vínculo % não existe (ou está sem pessoa)', NEW.colaborador_id;
  END IF;
  NEW.pessoa_id := v_pessoa;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION rh_clima.projetar_pessoa_do_vinculo() IS
  'Preenche pessoa_id a partir do vínculo. A aplicação não informa esta coluna: '
  'ela é projeção, e é o que sustenta a trava de "uma resposta por pessoa".';

-- ------------------------------------------------------------------ pesquisa

ALTER TABLE rh_clima.participacao_pesquisa
  ADD COLUMN pessoa_id BIGINT REFERENCES rh.pessoa(id);

ALTER TABLE rh_clima.participacao_pesquisa
  DISABLE TRIGGER participacao_pesquisa_imutavel;

UPDATE rh_clima.participacao_pesquisa pp
   SET pessoa_id = c.pessoa_id
  FROM rh.colaborador c
 WHERE c.id = pp.colaborador_id;

ALTER TABLE rh_clima.participacao_pesquisa
  ENABLE TRIGGER participacao_pesquisa_imutavel;

ALTER TABLE rh_clima.participacao_pesquisa
  ALTER COLUMN pessoa_id SET NOT NULL;

CREATE TRIGGER participacao_pesquisa_projetar_pessoa
  BEFORE INSERT ON rh_clima.participacao_pesquisa
  FOR EACH ROW EXECUTE FUNCTION rh_clima.projetar_pessoa_do_vinculo();

ALTER TABLE rh_clima.participacao_pesquisa
  ADD CONSTRAINT participacao_pesquisa_unica_por_pessoa
  UNIQUE (pesquisa_id, pessoa_id);

COMMENT ON COLUMN rh_clima.participacao_pesquisa.pessoa_id IS
  'Projeção do vínculo (trigger). Quem respondeu foi a pessoa: mudar de CNPJ '
  'no meio da janela não devolve o direito de responder de novo.';

-- ------------------------------------------------------------------ check-in

ALTER TABLE rh_clima.checkin_resposta
  ADD COLUMN pessoa_id BIGINT REFERENCES rh.pessoa(id);

ALTER TABLE rh_clima.checkin_resposta
  DISABLE TRIGGER checkin_resposta_imutavel;

UPDATE rh_clima.checkin_resposta r
   SET pessoa_id = c.pessoa_id
  FROM rh.colaborador c
 WHERE c.id = r.colaborador_id;

ALTER TABLE rh_clima.checkin_resposta
  ENABLE TRIGGER checkin_resposta_imutavel;

ALTER TABLE rh_clima.checkin_resposta
  ALTER COLUMN pessoa_id SET NOT NULL;

CREATE TRIGGER checkin_resposta_projetar_pessoa
  BEFORE INSERT ON rh_clima.checkin_resposta
  FOR EACH ROW EXECUTE FUNCTION rh_clima.projetar_pessoa_do_vinculo();

ALTER TABLE rh_clima.checkin_resposta
  ADD CONSTRAINT checkin_resposta_unica_no_dia_por_pessoa
  UNIQUE (pessoa_id, pergunta_versao_id, data_referencia);

COMMENT ON COLUMN rh_clima.checkin_resposta.pessoa_id IS
  'Projeção do vínculo (trigger). O check-in do dia é da pessoa — no dia da '
  'transferência entre CNPJs havia como responder duas vezes.';

COMMIT;
