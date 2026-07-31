-- 0034_ponto_parametros_da_jornada.sql
-- Os números de negócio que ainda estavam CHUMBADOS no motor de ponto viram
-- parâmetro da jornada — e a hora noturna reduzida do art. 73 §1º passa a
-- existir.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Uma varredura no motor (src/dominios/ponto/calculo.ts) achou seis decisões de
-- negócio escritas como constante de código. Cada uma delas erra dinheiro para
-- alguém, e nenhuma pode ser corrigida sem alterar o fonte — que é exatamente o
-- que o dono do sistema não aceita:
--
--   1) HORA NOTURNA REDUZIDA (CLT art. 73 §1º) simplesmente não existia. A hora
--      entre 22:00 e 05:00 vale 52min30s, então 7 horas de relógio na janela
--      são 8 horas noturnas. O motor mandava 63.000 minutos de relógio para a
--      folha de 07/2026 (1.050,00 h na rubrica 1103) onde a lei manda 1.200 h.
--      Faltavam 150 horas de adicional noturno em UM mês, para 10 plantonistas
--      — e mais 60 min de hora extra por plantão, porque a hora ficta também
--      estende a JORNADA cumprida (12h de relógio com 7h noturnas são 13h
--      computadas contra 12h previstas).
--
--   2) DIVISOR 6 DO DSR: `carga_semanal ÷ 6` está certo só para quem trabalha 6
--      dias. Na COMERCIAL-44 (5x2) o dia vale 528 min e o DSR descontado era
--      440 — 88 min a menos por semana com falta, sempre a favor da empresa. No
--      PLANTAO-12X36 daria 360 contra um plantão de 720.
--
--   3) DIA DE REPOUSO CHUMBADO EM DOMINGO (`dia_semana = 0`): é ele que decide
--      se a hora extra é 50% ou 100%. Quem folga na terça — escala de loja com
--      folga rotativa, plantonista — recebia o domingo trabalhado como 100%
--      sendo dia normal dele, e a folga real como 50%.
--
--   4) PREVISTO DA SEMANA ESCRITO NO FONTE: "5x2 zera sábado e domingo", "6x1
--      zera domingo" e "sábado do 6x1 = semanal − 5 × diária". Foi essa
--      derivação escondida que produziu a LOJA-44 chamada "sábado 4h" cujos
--      parâmetros mandam trabalhar 7h20 no sábado: uma loja que fechasse ao
--      meio-dia colhia 200 min de atraso por sábado. Agora o previsto de cada
--      dia da semana é DADO, visível, e um CHECK exige que a soma feche com a
--      carga semanal contratada — o rótulo não tem mais como mentir.
--
--   5) TOLERÂNCIA DO ART. 58 §1º aplicada ao SALDO do dia: quem chegava 20 min
--      atrasado e saía 20 min depois zerava os dois (o atraso sumia e a hora
--      extra também). A lei fala em variação POR MARCAÇÃO (5 min cada, 10 no
--      dia), o que exige o horário contratual da jornada — que a tabela não
--      tinha. Passa a ter.
--
--   6) 6h COMO LIMITE DO INTERVALO OBRIGATÓRIO (art. 71 caput) e a falta de
--      calendário de escala no 12x36: o plantonista que não batia ponto nenhum
--      não gerava falta nem intercorrência — o dia sumia como "fora da escala".
--
-- COMO FICA
-- Toda coluna nova nasce com DERIVAÇÃO NO PRÓPRIO BANCO (trigger BEFORE INSERT,
-- mesmo desenho da 0033): quem insere jornada por qualquer caminho — tela, seed,
-- carga futura — recebe um padrão coerente com a carga que digitou, e sobrescreve
-- versão a versão quando o acordo coletivo mandar. Nenhum default vem da
-- aplicação.
--
-- VERSIONAMENTO: jornada_versao é dado versionado com vigência. Esta migration
-- só ACRESCENTA coluna e preenche o passado com a mesma derivação do trigger.
-- As apurações já gravadas NÃO mudam de número por leitura — a memória de
-- cálculo mora em rh.apuracao_ponto.memoria. Quem reapurar 06 e 07/2026 vai ver
-- número diferente, e deve: o número antigo era o errado (é o item 1 acima).

BEGIN;

-- ================================================================ soma de array
-- CHECK não aceita subconsulta; para exigir que o previsto da semana feche com a
-- carga semanal é preciso uma função IMMUTABLE.
CREATE FUNCTION rh.soma_minutos_semana(minutos SMALLINT[]) RETURNS INTEGER
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT COALESCE(SUM(v), 0)::int FROM unnest(minutos) AS v
$$;

COMMENT ON FUNCTION rh.soma_minutos_semana(SMALLINT[]) IS
  'Soma o previsto dos 7 dias da semana. Existe só para o CHECK de '
  'rh.jornada_versao.previsto_por_dia_semana poder fechar com a carga semanal.';

-- ================================================================ jornada
ALTER TABLE rh.jornada_versao
  -- (4) Previsto de cada dia da semana, índice 1 = domingo … 7 = sábado (array
  --     do Postgres é 1-based; o motor recebe 0..6 e o repositório traduz).
  --     NULL = jornada SEM padrão semanal (12x36, escala livre), onde o dia de
  --     escala vem do ciclo + âncora, não do calendário civil.
  ADD COLUMN previsto_por_dia_semana SMALLINT[],
  -- (6) Ritmo da escala em dias: 12x36 = 2 (um dia de plantão, um de folga).
  --     NULL = sem ritmo fixo. Com ele e a âncora da escala do colaborador o
  --     motor finalmente sabe que dia era de plantão.
  ADD COLUMN ciclo_dias SMALLINT
    CHECK (ciclo_dias IS NULL OR ciclo_dias BETWEEN 1 AND 31),
  -- (3) Dia de REPOUSO semanal remunerado, 0 domingo … 6 sábado. Decide HE 100%
  --     e abre a semana do DSR. NULL = sem repouso em dia fixo do calendário
  --     (o descanso do 12x36 são as 36h entre plantões).
  ADD COLUMN dia_repouso_semana SMALLINT
    CHECK (dia_repouso_semana IS NULL OR dia_repouso_semana BETWEEN 0 AND 6),
  -- (2) Divisor do DSR: em quantos dias a carga semanal se reparte. O repouso
  --     vale a média de um dia de trabalho, e "um dia" depende de quantos dias a
  --     pessoa trabalha — 5 no administrativo, 6 na loja, 3 no plantão.
  ADD COLUMN dias_uteis_semana SMALLINT
    CHECK (dias_uteis_semana IS NULL OR dias_uteis_semana BETWEEN 1 AND 7),
  -- (6) CLT art. 71 caput: acima deste tempo de trabalho o intervalo é
  --     obrigatório. 360 min (6h) na regra geral; acordo e categoria mudam.
  ADD COLUMN intervalo_obrigatorio_acima_minutos INTEGER
    CHECK (intervalo_obrigatorio_acima_minutos IS NULL
           OR intervalo_obrigatorio_acima_minutos BETWEEN 0 AND 1440),
  -- (1) CLT art. 73 §1º: quanto dura a HORA NOTURNA. 3150 s = 52min30s no
  --     urbano. Em SEGUNDOS porque 52,5 min não é inteiro e a casa da fração não
  --     pode virar float circulando pelo sistema. 3600 desliga a redução (é o
  --     que o rural do art. 7º da Lei 5.889/73 usa, com janela própria).
  ADD COLUMN hora_noturna_segundos INTEGER
    CHECK (hora_noturna_segundos IS NULL
           OR hora_noturna_segundos BETWEEN 1 AND 3600),
  -- (5) Horário CONTRATUAL da jornada, em minutos desde a meia-noite. É contra
  --     ele que a variação de cada marcação é medida (art. 58 §1º). NULL nos
  --     dois = jornada sem horário fixo: o motor cai na comparação pelo saldo do
  --     dia e DIZ isso na memória de cálculo.
  ADD COLUMN horario_entrada_minuto SMALLINT
    CHECK (horario_entrada_minuto IS NULL
           OR horario_entrada_minuto BETWEEN 0 AND 1439),
  ADD COLUMN horario_saida_minuto SMALLINT
    CHECK (horario_saida_minuto IS NULL
           OR horario_saida_minuto BETWEEN 0 AND 2879),
  ADD CONSTRAINT jornada_versao_horario_par
    CHECK ((horario_entrada_minuto IS NULL) = (horario_saida_minuto IS NULL)),
  ADD CONSTRAINT jornada_versao_horario_cabe_a_carga
    CHECK (horario_entrada_minuto IS NULL
           OR horario_saida_minuto - horario_entrada_minuto >= carga_diaria_minutos),
  ADD CONSTRAINT jornada_versao_previsto_semana_fecha
    CHECK (previsto_por_dia_semana IS NULL
           OR (array_length(previsto_por_dia_semana, 1) = 7
               AND 0 <= ALL (previsto_por_dia_semana)
               AND 1440 >= ALL (previsto_por_dia_semana)
               AND rh.soma_minutos_semana(previsto_por_dia_semana)
                   = carga_semanal_minutos));

COMMENT ON COLUMN rh.jornada_versao.previsto_por_dia_semana IS
  'Minutos previstos em cada dia da semana, posição 1 = domingo … 7 = sábado. '
  'A soma TEM de fechar com carga_semanal_minutos (CHECK) — é o que impede uma '
  'jornada chamada "sábado 4h" de prever 7h20 no sábado. NULL = escala sem '
  'padrão semanal; aí quem manda é ciclo_dias + a âncora da escala.';
COMMENT ON COLUMN rh.jornada_versao.ciclo_dias IS
  'Período da escala em dias (12x36 = 2). Com rh.escala_colaborador.ancora_escala '
  'define que dia é de trabalho em jornada sem padrão semanal.';
COMMENT ON COLUMN rh.jornada_versao.dia_repouso_semana IS
  'Dia do REPOUSO semanal (0 domingo … 6 sábado). Decide se o trabalho é HE 100% '
  'e abre a semana do DSR. NULL quando o descanso não cai em dia fixo.';
COMMENT ON COLUMN rh.jornada_versao.dias_uteis_semana IS
  'Divisor do DSR: DSR de um dia = carga_semanal_minutos ÷ dias_uteis_semana.';
COMMENT ON COLUMN rh.jornada_versao.hora_noturna_segundos IS
  'Duração da hora noturna (CLT art. 73 §1º): 3150 s = 52min30s. 3600 desliga a '
  'redução. O motor converte minuto de relógio em minuto ficto com isto.';
COMMENT ON COLUMN rh.jornada_versao.horario_entrada_minuto IS
  'Início contratual da jornada em minutos desde a meia-noite. Referência das '
  'variações do art. 58 §1º. NULL = sem horário fixo.';
COMMENT ON COLUMN rh.jornada_versao.horario_saida_minuto IS
  'Fim contratual da jornada em minutos desde a meia-noite (pode passar de 1440 '
  'quando o turno vira a noite). O intervalo previsto é a sobra: '
  'saída − entrada − carga_diaria_minutos.';

-- ---------------------------------------------------------------- derivação
-- Mesma escolha da 0033: a REGRA MORA NA TABELA. Jornada nova criada pela tela
-- de parâmetros nasce coerente com a carga digitada sem a aplicação precisar
-- lembrar de sete campos.
CREATE FUNCTION rh.jornada_padroes_derivados() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  diaria  INTEGER := NEW.carga_diaria_minutos;
  semanal INTEGER := NEW.carga_semanal_minutos;
BEGIN
  IF NEW.previsto_por_dia_semana IS NULL AND NEW.tipo IN ('5x2', '6x1') THEN
    -- Segunda a sexta valem a carga diária; o resto da semana é o sábado no 6x1
    -- e zero no 5x2. É a derivação que estava escondida no motor, agora gravada
    -- como dado — e conferida pelo CHECK que exige fechar com a carga semanal.
    NEW.previsto_por_dia_semana := CASE NEW.tipo
      WHEN '5x2' THEN ARRAY[0, diaria, diaria, diaria, diaria, diaria, 0]::SMALLINT[]
      ELSE ARRAY[0, diaria, diaria, diaria, diaria, diaria,
                 GREATEST(0, semanal - 5 * diaria)]::SMALLINT[]
    END;
  END IF;

  IF NEW.ciclo_dias IS NULL AND NEW.tipo = '12x36' THEN
    NEW.ciclo_dias := 2;   -- 12h de trabalho + 36h de descanso = um dia sim, um não
  END IF;

  IF NEW.dia_repouso_semana IS NULL AND NEW.tipo IN ('5x2', '6x1') THEN
    NEW.dia_repouso_semana := 0;  -- Lei 605/49 art. 1º: preferencialmente domingo
  END IF;

  IF NEW.dias_uteis_semana IS NULL THEN
    NEW.dias_uteis_semana := GREATEST(1, LEAST(7,
      COALESCE(round(semanal::numeric / NULLIF(diaria, 0))::int, 6)));
  END IF;

  IF NEW.intervalo_obrigatorio_acima_minutos IS NULL THEN
    NEW.intervalo_obrigatorio_acima_minutos := 360;   -- art. 71 caput
  END IF;

  IF NEW.hora_noturna_segundos IS NULL THEN
    NEW.hora_noturna_segundos := 3150;                -- art. 73 §1º, urbano
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER jornada_versao_padroes
  BEFORE INSERT ON rh.jornada_versao
  FOR EACH ROW EXECUTE FUNCTION rh.jornada_padroes_derivados();

-- ---------------------------------------------------------------- backfill
-- Pela mesma regra do trigger, com os triggers de linha fora do caminho (a
-- justificativa é a da 0033: `congelar` recusaria versão encerrada e `tocar`
-- mentiria sobre quando a versão mudou; isto é preenchimento de coluna nova).
ALTER TABLE rh.jornada_versao DISABLE TRIGGER USER;

UPDATE rh.jornada_versao SET
  previsto_por_dia_semana = COALESCE(previsto_por_dia_semana, CASE tipo
    WHEN '5x2' THEN ARRAY[0, carga_diaria_minutos, carga_diaria_minutos,
                          carga_diaria_minutos, carga_diaria_minutos,
                          carga_diaria_minutos, 0]::SMALLINT[]
    WHEN '6x1' THEN ARRAY[0, carga_diaria_minutos, carga_diaria_minutos,
                          carga_diaria_minutos, carga_diaria_minutos,
                          carga_diaria_minutos,
                          GREATEST(0, carga_semanal_minutos
                                      - 5 * carga_diaria_minutos)]::SMALLINT[]
    ELSE NULL END),
  ciclo_dias = COALESCE(ciclo_dias, CASE tipo WHEN '12x36' THEN 2 ELSE NULL END),
  dia_repouso_semana = COALESCE(dia_repouso_semana,
    CASE WHEN tipo IN ('5x2', '6x1') THEN 0 ELSE NULL END),
  dias_uteis_semana = COALESCE(dias_uteis_semana, GREATEST(1, LEAST(7,
    COALESCE(round(carga_semanal_minutos::numeric
                   / NULLIF(carga_diaria_minutos, 0))::int, 6)))),
  intervalo_obrigatorio_acima_minutos =
    COALESCE(intervalo_obrigatorio_acima_minutos, 360),
  hora_noturna_segundos = COALESCE(hora_noturna_segundos, 3150);

-- HORÁRIO CONTRATUAL DAS TRÊS JORNADAS DO CATÁLOGO (semeadas na 0027).
-- Não dá para derivar de carga nenhuma — é o que está no contrato de trabalho —,
-- então vem nomeado. São exatamente os horários que a demo sempre praticou:
--   COMERCIAL-44   08:00 → 17:48, 1h de intervalo   (480 → 1068, 528 min)
--   LOJA-44        08:00 → 16:20, 1h de intervalo   (480 →  980, 440 min)
--   PLANTAO-12X36  sem horário fixo: o plantão entra 18:30 ou 19:00 conforme a
--                  escala do CD, e é por isso que a coluna aceita NULL.
UPDATE rh.jornada_versao
   SET horario_entrada_minuto = 480, horario_saida_minuto = 1068
 WHERE codigo = 'COMERCIAL-44';
UPDATE rh.jornada_versao
   SET horario_entrada_minuto = 480, horario_saida_minuto = 980
 WHERE codigo = 'LOJA-44';

-- O RÓTULO DA LOJA-44 ESTAVA MENTINDO. O nome dizia "sábado 4h" e os parâmetros
-- (440 de carga diária, 2640 de carga semanal) mandam 7h20 no sábado — 440 × 6 =
-- 2640. O comentário da 0027 que fundamentava o nome também errava a conta
-- ("440 × 5 + 240 = 2640"; o certo é 2440). Quem tem razão são os PARÂMETROS: a
-- demo sempre fez a loja trabalhar 08:00–16:20 de segunda a sábado, e é isso que
-- o CHECK novo confirma. Muda o nome, não a carga — mudar a carga lançaria 200
-- min de atraso por sábado em todo mundo que já está na jornada.
UPDATE rh.jornada_versao
   SET nome = 'Loja 44h (6x1, 7h20 de segunda a sábado)'
 WHERE codigo = 'LOJA-44';

ALTER TABLE rh.jornada_versao ENABLE TRIGGER USER;

ALTER TABLE rh.jornada_versao
  ALTER COLUMN dias_uteis_semana SET NOT NULL,
  ALTER COLUMN intervalo_obrigatorio_acima_minutos SET NOT NULL,
  ALTER COLUMN hora_noturna_segundos SET NOT NULL;

-- ================================================================ escala
-- ÂNCORA DA ESCALA: o primeiro dia de trabalho do ciclo. Sem ela o motor não tem
-- como saber se a terça-feira era plantão ou folga — e era por isso que o
-- plantonista que não batia ponto nenhum não gerava falta NEM intercorrência: o
-- dia era lido como "fora da escala" e sumia calado. NULL mantém o
-- comportamento antigo (dia com marcação é dia de escala), que é o certo
-- enquanto a escala não estiver cadastrada — mas agora está DITO na memória de
-- cálculo em vez de ficar implícito.
ALTER TABLE rh.escala_colaborador
  ADD COLUMN ancora_escala DATE;

COMMENT ON COLUMN rh.escala_colaborador.ancora_escala IS
  'Primeiro dia de trabalho do ciclo da escala (usado com '
  'rh.jornada_versao.ciclo_dias). NULL = escala sem calendário: o motor só '
  'consegue tratar como dia de escala o dia que teve marcação.';

-- ================================================================ apuração
-- Os dois números do noturno passam a conviver: o de RELÓGIO (o que o espelho de
-- ponto tem de mostrar, porque é o que o colaborador conta no relógio dele) e o
-- FICTO do art. 73 §1º, que é o que a folha paga na rubrica 1103.
ALTER TABLE rh.apuracao_ponto
  ADD COLUMN adicional_noturno_relogio_minutos INTEGER NOT NULL DEFAULT 0
    CHECK (adicional_noturno_relogio_minutos >= 0);

COMMENT ON COLUMN rh.apuracao_ponto.adicional_noturno_minutos IS
  'Minutos noturnos FICTOS (CLT art. 73 §1º) — é o que vai para a folha.';
COMMENT ON COLUMN rh.apuracao_ponto.adicional_noturno_relogio_minutos IS
  'Minutos noturnos de RELÓGIO, antes da redução da hora noturna. Guardado para '
  'o espelho e para a conferência da fiscalização.';

-- O passado fica honesto: até esta migration o número gravado era de relógio,
-- então os dois campos valem o mesmo nas apurações antigas. Quem reapurar
-- recebe o ficto no primeiro campo — e a diferença é a correção, não um erro
-- novo.
UPDATE rh.apuracao_ponto
   SET adicional_noturno_relogio_minutos = adicional_noturno_minutos
 WHERE adicional_noturno_minutos > 0;

COMMIT;
