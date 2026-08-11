-- 0063_balde_anonimo_no_dia_civil_de_sao_paulo.sql
-- Pendência #6 (decisão do dono): o corte do balde anônimo caía às 21h de Brasília.
--
-- rh_clima.resposta_pesquisa.criada_em existe para ANTI-REIDENTIFICAÇÃO: a resposta
-- é truncada no DIA de propósito, para não dar de alinhar com
-- participacao_pesquisa.respondida_em (que é o instante) e descobrir quem escreveu
-- cada resposta. Só o balde do DIA CIVIL sobrevive.
--
-- O DEFAULT era `date_trunc('day', now())`. `now()` é um instante e `date_trunc`
-- trunca no fuso da SESSÃO — e o pool do app não executa SET TimeZone, então as
-- conexões rodam em UTC. Resultado: das 21h à meia-noite de Brasília (00h–03h UTC),
-- `date_trunc('day', now())` já aponta o dia seguinte, e a resposta cai num segundo
-- balde do mesmo dia civil. Dois baldes por dia enfraquecem exatamente o k que a
-- coluna existe para proteger — e no horário em que quem responde de casa responde.
--
-- Conserto: derivar o dia civil no fuso de negócio, com AT TIME ZONE explícito, e
-- devolvê-lo como o INSTANTE da meia-noite de São Paulo — um valor idêntico para
-- todas as respostas do mesmo dia civil, seja qual for o fuso da sessão que inserir.
--   rh.hoje()                              -> data civil de São Paulo (eixo 3)
--   ::timestamp                            -> meia-noite daquele dia (sem fuso)
--   AT TIME ZONE 'America/Sao_Paulo'       -> o instante dessa meia-noite em SP
--
-- Só o DEFAULT muda. As linhas JÁ GRAVADAS não são tocadas: a tabela é imutável por
-- trigger (audit.bloquear_mutacao), e reescrever resposta anônima já registrada é
-- precisamente o que essa trava existe para impedir. O banco atual só tem dado
-- fictício; esta correção precisa estar de pé ANTES da primeira pesquisa real —
-- depois dela, não há mais como escolher.

BEGIN;

ALTER TABLE rh_clima.resposta_pesquisa
  ALTER COLUMN criada_em
  SET DEFAULT (rh.hoje()::timestamp AT TIME ZONE 'America/Sao_Paulo');

COMMENT ON COLUMN rh_clima.resposta_pesquisa.criada_em IS
  'Balde do DIA CIVIL de São Paulo (instante da meia-noite em America/Sao_Paulo), '
  'truncado de propósito para anti-reidentificação: sem hora não dá para alinhar '
  'com participacao_pesquisa.respondida_em. Derivado com AT TIME ZONE explícito '
  '(migration 0063) — antes cortava no fuso da sessão (UTC) e criava dois baldes '
  'por dia às 21h de Brasília.';

COMMIT;
