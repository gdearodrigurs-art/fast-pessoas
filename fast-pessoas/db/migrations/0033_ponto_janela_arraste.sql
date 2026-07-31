-- 0033_ponto_janela_arraste.sql
-- Janela do ARRASTE DE VIRADA vira parâmetro da jornada.
--
-- POR QUE ESTA MIGRATION EXISTE
-- O motor de apuração amarra a batida de fechamento do dia seguinte ao turno da
-- véspera (é assim que o plantão que vira a noite não aparece como "entrada sem
-- saída" todo dia). Até aqui o limite dessa janela era a constante
-- LIMITE_ARRASTE_VIRADA_MINUTOS = 480 (08:00) CHUMBADA em calculo.ts, com o
-- comentário de que seria "leitura do relógio, não parâmetro de negócio".
-- É parâmetro de negócio, e errado: um plantão 12x36 tem 12h de trabalho MAIS o
-- intervalo obrigatório do art. 71, ou seja 13h de amplitude. Quem entra às
-- 19:00 — o plantão noturno mais comum do país, citado no próprio comentário da
-- constante — sai às 08:00 em ponto e caía FORA da janela: as 12h trabalhadas
-- viravam duas faltas integrais (1440 min), derrubavam o DSR da semana e desciam
-- para a folha na rubrica de desconto. Um minuto antes (07:59) o mesmo dia
-- fechava com 0 de falta. Precipício de um minuto, em silêncio.
--
-- COMO FICA
-- Cada versão de jornada passa a carregar a sua janela. Quem não informa nada
-- recebe a janela DERIVADA DO PRÓPRIO CONTRATO da jornada:
--     carga_diaria_minutos + intervalo_minimo_minutos
-- que é a amplitude máxima de um turno daquela jornada — um turno que começa em
-- qualquer hora do relógio termina, no dia seguinte, antes desse minuto. A
-- derivação fica em TRIGGER (a tabela é a dona da regra, não a aplicação) e
-- continua sobrescritível versão a versão pela tela de parâmetros, porque acordo
-- coletivo e escala de revezamento mudam a amplitude.
--
-- VERSIONAMENTO: jornada_versao é dado versionado com vigência. Esta migration
-- só ACRESCENTA coluna e preenche o passado com a mesma derivação — nenhuma
-- apuração já gravada muda de número, porque a memória de cálculo é gravada em
-- rh.apuracao_ponto.memoria e não é recalculada por leitura.

BEGIN;

-- 0 desliga o arraste (jornada que nunca vira a noite); 1439 é o último minuto
-- do dia seguinte. Acima disso a batida já pertence ao dia depois do seguinte.
ALTER TABLE rh.jornada_versao
  ADD COLUMN janela_arraste_minutos INTEGER
    CHECK (janela_arraste_minutos BETWEEN 0 AND 1439);

COMMENT ON COLUMN rh.jornada_versao.janela_arraste_minutos IS
  'Batida de continuação ANTES deste minuto do dia seguinte ainda pertence ao '
  'turno da véspera. Vazio no INSERT = derivado de carga_diaria_minutos + '
  'intervalo_minimo_minutos (a amplitude do turno daquela jornada).';

-- A derivação mora na tabela: jornada criada por qualquer caminho (tela, seed,
-- carga futura) nasce com janela coerente com a própria carga, sem ninguém
-- precisar lembrar do campo.
CREATE FUNCTION rh.jornada_janela_arraste_padrao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.janela_arraste_minutos IS NULL THEN
    NEW.janela_arraste_minutos :=
      LEAST(1439, NEW.carga_diaria_minutos + NEW.intervalo_minimo_minutos);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER jornada_versao_janela_arraste
  BEFORE INSERT ON rh.jornada_versao
  FOR EACH ROW EXECUTE FUNCTION rh.jornada_janela_arraste_padrao();

-- Backfill das versões que já existem, pela mesma regra do trigger:
--   COMERCIAL-44  528 + 60 =  588 (09:48)
--   LOJA-44       440 + 60 =  500 (08:20)
--   PLANTAO-12X36 720 + 60 =  780 (13:00)  ← era 480, e é o que quebrava
--
-- Os triggers da tabela saem do caminho DURANTE o backfill, e só aqui:
-- `jornada_versao_congelar` recusaria tocar em versão encerrada (correto para
-- mudança de regra, mas isto é preenchimento de coluna nova, não regra nova) e
-- `jornada_versao_tocar` reescreveria atualizado_em de todo o histórico, o que
-- seria mentira sobre quando a versão mudou. Nenhuma linha muda de significado:
-- a janela gravada é a mesma que o trigger daria se a coluna existisse desde o
-- começo.
ALTER TABLE rh.jornada_versao DISABLE TRIGGER USER;
UPDATE rh.jornada_versao
   SET janela_arraste_minutos =
         LEAST(1439, carga_diaria_minutos + intervalo_minimo_minutos)
 WHERE janela_arraste_minutos IS NULL;
ALTER TABLE rh.jornada_versao ENABLE TRIGGER USER;

ALTER TABLE rh.jornada_versao
  ALTER COLUMN janela_arraste_minutos SET NOT NULL;

COMMIT;
