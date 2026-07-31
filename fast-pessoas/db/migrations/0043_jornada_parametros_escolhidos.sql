-- 0043_jornada_parametros_escolhidos.sql
-- Hora noturna, divisor do DSR e dia de repouso deixam de ser ADIVINHADOS pelo
-- banco: quem cria a jornada tem de dizer os três.
--
-- POR QUE ESTA MIGRATION EXISTE
-- A 0034 tirou seis números de negócio de dentro do motor de ponto e os
-- transformou em coluna de rh.jornada_versao. Para que nenhum caminho de
-- inserção quebrasse, ela deixou um trigger BEFORE INSERT derivando um valor
-- para cada coluna nova. A intenção era boa e continua valendo para o que é
-- CONSEQUÊNCIA do que a pessoa digitou (o previsto da semana sai do tipo e da
-- carga; o ciclo de 2 dias sai do 12x36). Mas três daquelas derivações não são
-- consequência de nada: são AFIRMAÇÕES SOBRE A LEI E SOBRE O CONTRATO que o
-- banco passou a fazer no lugar do DP — e a tela de parâmetros do ponto nunca
-- ofereceu campo para nenhuma das três, então ninguém nunca as escolheu.
--
-- REPRODUÇÃO (feita contra o banco da demo, antes desta migration)
-- Criando pela API real de /api/ponto/parametros/jornadas exatamente o corpo
-- que a tela monta — 12 campos, nenhum parâmetro da 0034 — uma loja NOTURNA
-- 6x1 de 7h20 que fecha na QUARTA:
--
--   hora_noturna_segundos                = 3150   (ninguém escolheu)
--   dia_repouso_semana                   = 0      (ninguém escolheu: DOMINGO)
--   dias_uteis_semana                    = 6      (ninguém escolheu)
--   intervalo_obrigatorio_acima_minutos  = 360    (ninguém escolheu)
--
-- Apurando com essa jornada duas noites idênticas de 22:00 → 05:20 (440 min):
--
--   domingo 02/08 → previsto 0, HE 100% = 500 min, 1000 min ao banco de horas
--   quarta  05/08 → previsto 440, HE 100% = 0, HE 50% = 60 min
--
-- Está invertido. Domingo é dia NORMAL de trabalho desta loja e saiu pago em
-- dobro; quarta é o repouso dela e saiu como dia comum. O DP não tem, na tela,
-- como consertar — o campo não existe. Foi assim que o defeito nº 3 da 0034
-- ("dia de repouso chumbado em domingo") voltou pela porta da frente, agora
-- chumbado no trigger em vez de no motor.
--
-- O mesmo vale para a hora noturna: 3150 s é a regra do urbano (CLT art. 73
-- §1º). O rural da Lei 5.889/73 art. 7º NÃO tem hora reduzida (3600 s) e tem
-- janela própria. Uma empresa rural cadastrando jornada pela tela recebia, sem
-- pedir e sem ver, uma redução que a lei dela não manda — e pagaria adicional
-- noturno sobre 480 min fictos onde só há 420 de relógio.
--
-- E o divisor do DSR: `round(carga_semanal ÷ carga_diaria)` devolve 6 para um
-- 5x2 de 8h/44h (round(5,5) = 6). É o defeito nº 2 da 0034 de volta: o DSR de
-- quem trabalha 5 dias sairia por 2640 ÷ 6 = 440 em vez de 2640 ÷ 5 = 528.
--
-- COMO FICA
-- O trigger PERDE as três derivações. Como as colunas hora_noturna_segundos e
-- dias_uteis_semana são NOT NULL desde a 0034, o INSERT que as omitir agora
-- FALHA — jornada sem eles não é gravável por caminho nenhum, que é o pedido
-- ("obrigatório no esquema E no banco"). dia_repouso_semana continua aceitando
-- NULL porque NULL é resposta legítima e significa algo ("sem dia fixo de
-- repouso" — é o caso do 12x36, cujo descanso são as 36 h entre plantões); o
-- que ele deixa de fazer é AFIRMAR domingo por conta própria. Quem tem de
-- exigir a escolha explícita entre "um dia da semana" e "nenhum" é o esquema
-- de entrada, e passa a exigir (esquemaNovaJornada, src/dominios/ponto/esquemas.ts).
--
-- O QUE CONTINUA DERIVADO, e por quê
--   previsto_por_dia_semana  — é consequência aritmética do tipo e da carga que
--                              a pessoa digitou, e o CHECK da 0034 já recusa a
--                              incoerência. A tela passa a oferecer o campo
--                              para sobrescrever (loja que fecha ao meio-dia).
--   ciclo_dias               — 12x36 é 12 h de trabalho e 36 de descanso; o 2
--                              está no nome do tipo que a pessoa escolheu.
--   intervalo_obrigatorio_acima_minutos — 360 min é a regra GERAL do art. 71
--                              caput, e a coluna é NOT NULL. Ela não decide
--                              dinheiro (só levanta a intercorrência de
--                              intervalo incompleto), então o fallback fica —
--                              mas a tela passa a oferecer o campo, porque
--                              acordo e categoria mudam esse limite.
--
-- QUEM É AFETADO
-- Nenhuma linha existente: esta migration não toca dado. O único caminho vivo
-- de INSERT em rh.jornada_versao é o repositório do ponto (a API); o semeador
-- 15-ponto.js LÊ as jornadas, não as cria, e as três do catálogo nasceram na
-- 0027 e foram preenchidas pelo backfill da 0034. Em banco novo a ordem se
-- mantém: 0027 insere antes de existir trigger, 0034 preenche, 0043 redefine.

BEGIN;

CREATE OR REPLACE FUNCTION rh.jornada_padroes_derivados() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  diaria  INTEGER := NEW.carga_diaria_minutos;
  semanal INTEGER := NEW.carga_semanal_minutos;
BEGIN
  IF NEW.previsto_por_dia_semana IS NULL AND NEW.tipo IN ('5x2', '6x1') THEN
    -- Segunda a sexta valem a carga diária; o resto da semana é o sábado no 6x1
    -- e zero no 5x2. Consequência aritmética do que foi digitado — e o CHECK
    -- jornada_versao_previsto_semana_fecha recusa se não fechar com a semanal.
    NEW.previsto_por_dia_semana := CASE NEW.tipo
      WHEN '5x2' THEN ARRAY[0, diaria, diaria, diaria, diaria, diaria, 0]::SMALLINT[]
      ELSE ARRAY[0, diaria, diaria, diaria, diaria, diaria,
                 GREATEST(0, semanal - 5 * diaria)]::SMALLINT[]
    END;
  END IF;

  IF NEW.ciclo_dias IS NULL AND NEW.tipo = '12x36' THEN
    NEW.ciclo_dias := 2;   -- 12h de trabalho + 36h de descanso = um dia sim, um não
  END IF;

  -- dia_repouso_semana NÃO É MAIS DERIVADO. Era `:= 0` para 5x2 e 6x1, com a
  -- justificativa "Lei 605/49 art. 1º: preferencialmente domingo". Só que
  -- "preferencialmente" é exatamente o que o banco não pode decidir sozinho: é
  -- ele quem separa hora extra de 50% da de 100%, e a loja que folga na quarta
  -- recebia a inversão descrita no cabeçalho. NULL segue valendo como "sem dia
  -- fixo de repouso"; a escolha entre um dia e nenhum é do DP, exigida pelo
  -- esquema de entrada.

  -- dias_uteis_semana NÃO É MAIS DERIVADO. Era
  -- `round(semanal / diaria)`, que devolve 6 para o 5x2 de 8h/44h e derruba o
  -- DSR de 528 para 440 min por semana com falta. Coluna NOT NULL: quem não
  -- informar leva erro do banco, e é o que se quer.

  IF NEW.intervalo_obrigatorio_acima_minutos IS NULL THEN
    NEW.intervalo_obrigatorio_acima_minutos := 360;   -- art. 71 caput, regra geral
  END IF;

  -- hora_noturna_segundos NÃO É MAIS DERIVADO. Era `:= 3150`, que é a regra do
  -- URBANO (art. 73 §1º) afirmada sobre toda e qualquer jornada, inclusive as
  -- rurais que não têm hora reduzida. Coluna NOT NULL: omitir agora falha.

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION rh.jornada_padroes_derivados() IS
  'Preenche o que é CONSEQUÊNCIA do tipo e da carga digitados (previsto da '
  'semana, ciclo do 12x36) e o limite geral do art. 71 caput. Desde a 0043 NÃO '
  'preenche mais hora_noturna_segundos, dias_uteis_semana nem '
  'dia_repouso_semana: esses três são escolha do DP, e o banco não os afirma.';

COMMENT ON COLUMN rh.jornada_versao.hora_noturna_segundos IS
  'Duração da hora noturna (CLT art. 73 §1º): 3150 s = 52min30s no urbano. '
  '3600 desliga a redução (é o rural da Lei 5.889/73 art. 7º). O motor converte '
  'minuto de relógio em minuto ficto com isto. NOT NULL e SEM derivação no '
  'banco desde a 0043 — quem cria a jornada tem de dizer qual é.';

COMMENT ON COLUMN rh.jornada_versao.dias_uteis_semana IS
  'Divisor do DSR: DSR de um dia = carga_semanal_minutos ÷ dias_uteis_semana. '
  'É em quantos dias a pessoa cumpre a carga da semana (5 no administrativo, 6 '
  'na loja, 3 no plantão), não a razão entre as cargas. NOT NULL e SEM derivação '
  'no banco desde a 0043.';

COMMENT ON COLUMN rh.jornada_versao.dia_repouso_semana IS
  'Dia do REPOUSO semanal (0 domingo … 6 sábado). Decide se o trabalho é HE '
  '100% e abre a semana do DSR. NULL = sem repouso em dia fixo do calendário '
  '(12x36). Sem derivação no banco desde a 0043: domingo era presumido e '
  'invertia 50% com 100% em toda escala de folga rotativa.';

COMMIT;
