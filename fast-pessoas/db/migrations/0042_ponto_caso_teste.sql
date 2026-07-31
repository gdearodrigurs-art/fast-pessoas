-- 0042_ponto_caso_teste.sql
-- A BATERIA DE REGRESSÃO DO MOTOR DE PONTO — o alarme que o ponto não tinha.
--
-- (Numeração: as frentes desta onda correm em paralelo e 0040 e 0041 já estavam
-- reservadas quando este arquivo nasceu. O buraco é de coordenação, não de
-- pendência — como o 0025.)
--
-- POR QUE ESTA MIGRATION EXISTE
-- A folha tem, desde a 0013, uma bateria de casos VERSIONADA NO BANCO
-- (rh_folha.caso_teste_folha): entrada, saída esperada calculada à mão e a conta
-- escrita por extenso na descrição. Foi ela que, na 0038, impediu o divisor 220
-- de voltar ao fonte — o caso gêmeo com carga de 36 h quebra se alguém rechumbar
-- o número, e aponta o dedo para o defeito certo.
--
-- O PONTO NÃO TINHA NADA EQUIVALENTE. E o motor de ponto é justamente onde os
-- números de negócio mais tentaram virar constante: a 0033 tirou a janela de
-- arraste de dentro do código, a 0034 tirou SEIS de uma vez (hora noturna
-- reduzida, divisor do DSR, dia de repouso, previsto da semana, tolerância por
-- marcação e o limite do intervalo obrigatório). Cada uma dessas correções está
-- hoje apoiada em nada além do comentário que a explica: nenhuma linha de teste
-- quebra se a próxima onda escrever `3600`, `÷ 6` ou `dia_semana === 0` de novo.
--
-- Esta migration cria a bateria do ponto no MESMO desenho da folha — mesma
-- tabela (nome, descricao, entrada, saida_esperada, ativo), mesmo executor pela
-- aplicação, mesmo relatório PASS/FAIL com diferença por campo. Um padrão só no
-- sistema inteiro.
--
-- O QUE MUDA EM RELAÇÃO À BATERIA DA FOLHA, E POR QUÊ
-- O caso de folha declara só a ENTRADA e roda contra as versões VIGENTES das
-- tabelas legais, porque tabela do INSS é uma só para todo mundo: mudou a
-- tabela, a bateria tem de ser revista junto.
--
-- No ponto não existe essa "versão vigente única": jornada é CONTRATO de cada
-- empresa (e desta empresa são três), muda por acordo coletivo e é legítimo que
-- mude. Uma bateria amarrada ao catálogo cairia toda vez que o DP criasse uma
-- versão nova de jornada — alarme que toca por motivo errado é alarme que alguém
-- desliga. Por isso o caso do ponto declara a JORNADA POR INTEIRO na entrada.
--
-- E é essa escolha que dá ao caso o poder que o número solto não tem: dá para
-- ter GÊMEOS que só diferem no parâmetro em disputa. Duas jornadas idênticas com
-- hora noturna de 3150 s e de 3600 s; dois DSRs idênticos com divisor 5 e 6; um
-- repouso na terça ao lado de um domingo trabalhado. Rechumbar QUALQUER um
-- desses números quebra exatamente um dos gêmeos e deixa o outro passando — que
-- é o que faz o relatório apontar o defeito em vez de só acusar "algo mudou".
--
-- O CAMINHO EXECUTADO É O DA APLICAÇÃO, NÃO UM ATALHO
-- executarSuitePonto() chama agruparMarcacoesPorDia() e depois apurarPonto() —
-- as duas mesmas funções, na mesma ordem, que apurarCompetencia() usa. As
-- marcações do caso vêm com a DATA REAL delas (a saída do plantão vem no dia
-- seguinte, como vem do relógio), então o arraste de virada é exercitado de
-- verdade, e não presumido.
--
-- SAÍDA ESPERADA EM MINUTOS INTEIROS, sempre — convenção do sistema. Cada caso
-- traz a conta escrita na descrição, do jeito que o DP confere na mão.

BEGIN;

CREATE TABLE rh.caso_teste_ponto (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome            TEXT NOT NULL UNIQUE,
  descricao       TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  -- {"ano","mes","jornada":{…},"regra":{…},"dias":[…],"marcacoes":[…]}
  entrada         JSONB NOT NULL CHECK (jsonb_typeof(entrada) = 'object'),
  -- {"totais":{…10 campos…},"dias":{"AAAA-MM-DD":{…}}}
  saida_esperada  JSONB NOT NULL CHECK (jsonb_typeof(saida_esperada) = 'object'),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER caso_teste_ponto_tocar BEFORE UPDATE ON rh.caso_teste_ponto
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE rh.caso_teste_ponto IS
  'Bateria de regressão do motor de apuração de ponto, no mesmo desenho de '
  'rh_folha.caso_teste_folha. A jornada vem declarada POR INTEIRO na entrada '
  '(jornada é contrato de empresa, não tabela legal única), o que permite casos '
  'GÊMEOS que só diferem no parâmetro em disputa — é assim que a bateria acusa '
  'número de negócio rechumbado no fonte.';
COMMENT ON COLUMN rh.caso_teste_ponto.entrada IS
  'Ano, mês, jornada completa, fatores do banco, os dias a apurar e as marcações '
  'com a DATA REAL de cada batida (a saída do plantão cai no dia seguinte). O '
  'executor passa pelas mesmas agruparMarcacoesPorDia + apurarPonto da apuração.';
COMMENT ON COLUMN rh.caso_teste_ponto.saida_esperada IS
  'Totais da competência (os 10 obrigatórios) e, opcionalmente, campos por dia. '
  'TUDO em MINUTOS INTEIROS. Conferido contra o motor pelo serviço.';

-- ================================================================ os casos
-- Datas fixas de março/2026 (01/03 domingo, 08/03 domingo, 10/03 terça,
-- 11/03 quarta, 12/03 quinta, 31/03 terça) — caso versionado não pode depender
-- de "hoje".
--
-- A jornada de cada caso é uma cópia declarada do catálogo da 0027/0033/0034,
-- com UM parâmetro trocado quando o caso é gêmeo:
--   COMERCIAL-44   5x2   528/2640, 08:00–17:48, repouso domingo, 5 dias úteis
--   LOJA-44        6x1   440/2640, 08:00–16:20, repouso domingo, 6 dias úteis
--   PLANTAO-12X36  12x36 720/2160, sem horário fixo, sem repouso fixo, 3 dias

INSERT INTO rh.caso_teste_ponto (nome, descricao, entrada, saida_esperada) VALUES

-- ---------------------------------------------------------------- 1 e 2 (gêmeos)
-- HORA NOTURNA REDUZIDA — CLT art. 73 §1º. O par 3150/3600 é o que prende o
-- número: rechumbar 3150 quebra o caso rural; rechumbar 3600 quebra o urbano.
(
  'noturno_hora_reduzida_52min30',
  'Plantão 12x36 noturno, urbano: hora noturna de 3150 s (52min30s). '
  'Entrada 18:30, intervalo 21:00–22:00, saída 07:30 do dia seguinte — o arraste '
  'da jornada (janela 780 min) amarra a saída ao plantão do dia 10. '
  'Trabalhado = (21:00−18:30) + (07:30−22:00) = 150 + 570 = 720 min, a carga '
  'diária exata. '
  'Noturno de RELÓGIO = interseção com a janela 22:00–05:00 = 420 min. '
  'Ficto = 420 × 3600 ÷ 3150 = 480 min (7 h de relógio valem 8 h noturnas), '
  'arredondado UMA vez sobre o total do dia. '
  'O acréscimo ficto de 60 min é jornada CUMPRIDA: 720 + 60 = 780 contra 720 '
  'previstos → 60 min de HE 50% (a jornada não tem horário contratual, então a '
  'medição é pelo saldo do dia, e 60 > 10 min de tolerância diária). '
  'Banco: 60 × 1,50 = 90 min. '
  'Sem intercorrência: 720 min trabalhados exigem intervalo (art. 71) e os 60 '
  'min batidos cumprem o mínimo da jornada.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Plantão 12x36 (urbano)", "tipo": "12x36",
      "carga_diaria_minutos": 720, "carga_semanal_minutos": 2160,
      "previsto_por_dia_semana": null, "intervalo_minimo_minutos": 60,
      "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": null, "horario_saida_minuto": null,
      "dia_repouso_semana": null, "dias_uteis_semana": 3,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 780},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-10", "dia_de_escala": true}],
    "marcacoes": [
      {"data": "2026-03-10", "hora": "18:30", "tipo": "entrada"},
      {"data": "2026-03-10", "hora": "21:00", "tipo": "inicio_intervalo"},
      {"data": "2026-03-10", "hora": "22:00", "tipo": "fim_intervalo"},
      {"data": "2026-03-11", "hora": "07:30", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 720, "previsto": 720, "he_50": 60, "he_100": 0,
      "noturno_ficto": 480, "noturno_relogio": 420, "faltas": 0, "atrasos": 0,
      "dsr_desconto": 0, "banco": 90},
    "dias": {"2026-03-10": {"previsto": 720, "trabalhado": 720, "intervalo": 60,
      "he_50": 60, "he_100": 0, "noturno_ficto": 480, "noturno_relogio": 420,
      "atraso": 0, "falta": 0, "banco": 90, "pendente": false,
      "intercorrencias": []}}}'::jsonb
),
(
  'noturno_hora_cheia_3600_rural',
  'GÊMEO do caso anterior, mudando SÓ a duração da hora noturna: 3600 s, que é '
  'o rural do art. 7º da Lei 5.889/73 (a redução do art. 73 §1º é do urbano). '
  'Mesmas batidas, mesmos 720 min trabalhados, mesmos 420 min de relógio na '
  'janela — e ficto = 420 × 3600 ÷ 3600 = 420, sem acréscimo nenhum. '
  'Sem acréscimo ficto, o dia fecha exatamente no previsto: HE 50% = 0 e banco '
  '= 0 (contra 60 e 90 do gêmeo urbano). '
  'É este caso que quebra se alguém rechumbar 3150 no motor; o urbano quebra se '
  'rechumbarem 3600. Um número só não consegue passar nos dois.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Plantão 12x36 (rural, hora noturna cheia)", "tipo": "12x36",
      "carga_diaria_minutos": 720, "carga_semanal_minutos": 2160,
      "previsto_por_dia_semana": null, "intervalo_minimo_minutos": 60,
      "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": null, "horario_saida_minuto": null,
      "dia_repouso_semana": null, "dias_uteis_semana": 3,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3600, "janela_arraste_minutos": 780},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-10", "dia_de_escala": true}],
    "marcacoes": [
      {"data": "2026-03-10", "hora": "18:30", "tipo": "entrada"},
      {"data": "2026-03-10", "hora": "21:00", "tipo": "inicio_intervalo"},
      {"data": "2026-03-10", "hora": "22:00", "tipo": "fim_intervalo"},
      {"data": "2026-03-11", "hora": "07:30", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 720, "previsto": 720, "he_50": 0, "he_100": 0,
      "noturno_ficto": 420, "noturno_relogio": 420, "faltas": 0, "atrasos": 0,
      "dsr_desconto": 0, "banco": 0},
    "dias": {"2026-03-10": {"previsto": 720, "trabalhado": 720, "he_50": 0,
      "noturno_ficto": 420, "noturno_relogio": 420, "banco": 0,
      "pendente": false, "intercorrencias": []}}}'::jsonb
),

-- ---------------------------------------------------------------- 3
-- 12X36 CRUZANDO A MEIA-NOITE COM O INTERVALO NO MEIO. Prende DOIS parâmetros:
-- a janela de arraste (a saída é às 08:00 EM PONTO, o minuto exato que a 0033
-- conta ter sido um precipício silencioso enquanto a janela era 480 chumbados) e
-- a regra de que TURNO aberto não é PERÍODO aberto (a volta do intervalo às
-- 00:30 tem de voltar para o plantão da véspera, senão o plantão vira dois meios
-- plantões com déficit fantasma dos dois lados).
(
  'plantao_12x36_intervalo_na_meia_noite',
  'Plantão que entra 19:00, PARA O INTERVALO ÀS 23:30 e volta 00:30 — o intervalo '
  'cruza a meia-noite —, saindo às 08:00 EM PONTO do dia seguinte. '
  'Arraste: a janela desta jornada é 780 min (carga 720 + intervalo 60), então '
  '00:30 e 08:00 ainda pertencem ao turno da véspera. Com os 480 min que ficavam '
  'chumbados no motor antes da 0033, a saída de 08:00 NÃO seria arrastada e o '
  'plantão inteiro viraria falta. '
  'Trabalhado = (23:30−19:00) + (08:00−00:30) = 270 + 450 = 720 min; intervalo 60. '
  'Noturno de RELÓGIO, pela interseção de cada período com a janela 22:00–05:00: '
  'período 19:00–23:30 → 22:00–23:30 = 90 min; período 00:30–08:00 → 00:30–05:00 '
  '= 270 min; total 360 min. '
  'Ficto = 360 × 3600 ÷ 3150 = 411,43 → 411 (arredondado meio-para-cima UMA vez '
  'sobre o total do dia). Acréscimo ficto = 51. '
  '720 + 51 = 771 contra 720 previstos → 51 min de HE 50%. '
  'Banco: 51 × 1,50 = 76,5 → 77 min.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Plantão 12x36 (urbano)", "tipo": "12x36",
      "carga_diaria_minutos": 720, "carga_semanal_minutos": 2160,
      "previsto_por_dia_semana": null, "intervalo_minimo_minutos": 60,
      "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": null, "horario_saida_minuto": null,
      "dia_repouso_semana": null, "dias_uteis_semana": 3,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 780},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-10", "dia_de_escala": true}],
    "marcacoes": [
      {"data": "2026-03-10", "hora": "19:00", "tipo": "entrada"},
      {"data": "2026-03-10", "hora": "23:30", "tipo": "inicio_intervalo"},
      {"data": "2026-03-11", "hora": "00:30", "tipo": "fim_intervalo"},
      {"data": "2026-03-11", "hora": "08:00", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 720, "previsto": 720, "he_50": 51, "he_100": 0,
      "noturno_ficto": 411, "noturno_relogio": 360, "faltas": 0, "atrasos": 0,
      "dsr_desconto": 0, "banco": 77},
    "dias": {"2026-03-10": {"previsto": 720, "trabalhado": 720, "intervalo": 60,
      "he_50": 51, "noturno_ficto": 411, "noturno_relogio": 360, "banco": 77,
      "pendente": false, "intercorrencias": []}}}'::jsonb
),

-- ---------------------------------------------------------------- 4
-- PLANTÃO NA VIRADA DO MÊS, nas DUAS pontas. O dia 01/03 é o discriminador: ele
-- só fica limpo se a saída de 07:00 daquela madrugada tiver sido amarrada ao
-- plantão de 28/02, que está FORA da lista de dias apurados (é assim que o
-- serviço lê — véspera e dia seguinte entram só para o arraste ter em que se
-- amarrar). Se a saída ficar órfã no dia 1º, aquele dia passa a ter marcação,
-- vira "dia de escala" por presunção, o pareamento quebra e o dia nasce PENDENTE
-- com intercorrência — que é exatamente o defeito que este caso proíbe de voltar.
(
  'plantao_12x36_virada_do_mes',
  'Duas viradas de mês no mesmo caso. '
  'ENTRADA DA COMPETÊNCIA: plantão que entrou em 28/02 (mês anterior) e saiu '
  '07:00 de 01/03. O dia 01/03 é apurado e tem de fechar LIMPO — previsto 0, '
  'trabalhado 0, nenhuma intercorrência —, porque aquela saída pertence ao '
  'plantão da véspera e 01/03 é o descanso das 36 h. '
  'SAÍDA DA COMPETÊNCIA: plantão de 31/03 com saída 07:30 de 01/04 (mês '
  'seguinte). O dia 31/03 tem de fechar com o plantão inteiro: 720 min '
  'trabalhados, 420 de relógio noturno, 480 fictos, 60 min de HE 50% e 90 no '
  'banco — os mesmos números do caso noturno_hora_reduzida_52min30, porque é o '
  'mesmo plantão. '
  'Sem o arraste nas duas pontas, esta competência mostraria um dia pendente no '
  'dia 1º e meio plantão no dia 31.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Plantão 12x36 (urbano)", "tipo": "12x36",
      "carga_diaria_minutos": 720, "carga_semanal_minutos": 2160,
      "previsto_por_dia_semana": null, "intervalo_minimo_minutos": 60,
      "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": null, "horario_saida_minuto": null,
      "dia_repouso_semana": null, "dias_uteis_semana": 3,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 780},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-01", "dia_de_escala": null},
             {"data": "2026-03-31", "dia_de_escala": true}],
    "marcacoes": [
      {"data": "2026-02-28", "hora": "18:30", "tipo": "entrada"},
      {"data": "2026-02-28", "hora": "21:00", "tipo": "inicio_intervalo"},
      {"data": "2026-02-28", "hora": "22:00", "tipo": "fim_intervalo"},
      {"data": "2026-03-01", "hora": "07:00", "tipo": "saida"},
      {"data": "2026-03-31", "hora": "18:30", "tipo": "entrada"},
      {"data": "2026-03-31", "hora": "21:00", "tipo": "inicio_intervalo"},
      {"data": "2026-03-31", "hora": "22:00", "tipo": "fim_intervalo"},
      {"data": "2026-04-01", "hora": "07:30", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 720, "previsto": 720, "he_50": 60, "he_100": 0,
      "noturno_ficto": 480, "noturno_relogio": 420, "faltas": 0, "atrasos": 0,
      "dsr_desconto": 0, "banco": 90},
    "dias": {
      "2026-03-01": {"previsto": 0, "trabalhado": 0, "he_50": 0, "falta": 0,
        "banco": 0, "pendente": false, "intercorrencias": []},
      "2026-03-31": {"previsto": 720, "trabalhado": 720, "intervalo": 60,
        "he_50": 60, "noturno_ficto": 480, "noturno_relogio": 420, "banco": 90,
        "pendente": false, "intercorrencias": []}}}'::jsonb
),

-- ---------------------------------------------------------------- 5 e 6 (gêmeos)
-- DSR PELA CARGA DA JORNADA — Lei 605/49 art. 6º. O divisor era 6 fixo no motor
-- (0034, item 2). Os gêmeos abaixo têm a MESMA carga semanal (2640 min) e
-- repartições diferentes: 5 dias (administrativo) e 6 dias (loja). Um divisor
-- chumbado só consegue acertar um dos dois.
(
  'dsr_por_carga_5x2_divisor_5',
  'Administrativo 5x2 (528 min/dia, 2640 na semana, repartidos em 5 dias) com '
  'UMA falta injustificada na quarta 11/03 — dia previsto e nenhuma marcação. '
  'Falta = 528 min (a jornada do dia) e o dia entra na fila como sem_marcacao. '
  'DSR: a falta derruba o repouso da semana que começa no repouso da pessoa '
  '(domingo 08/03). DSR de um dia = carga semanal ÷ dias úteis = 2640 ÷ 5 = '
  '528 min. Uma semana com falta → 528 min de desconto. '
  'Com o divisor 6 que ficava chumbado no motor sairiam 440 — 88 min de graça '
  'por semana com falta, sempre a favor da empresa. '
  'A quinta 12/03 é um dia cheio e exato (08:00–12:24, 13:24–17:48 = 528 min), '
  'só para provar que o resto da semana não é afetado. '
  'Falta NÃO vai ao banco de horas (vira desconto em folha, com o DSR): banco 0.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Administrativo 44h (5x2)", "tipo": "5x2",
      "carga_diaria_minutos": 528, "carga_semanal_minutos": 2640,
      "previsto_por_dia_semana": [0, 528, 528, 528, 528, 528, 0],
      "intervalo_minimo_minutos": 60, "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": 480, "horario_saida_minuto": 1068,
      "dia_repouso_semana": 0, "dias_uteis_semana": 5,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 588},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-11"}, {"data": "2026-03-12"}],
    "marcacoes": [
      {"data": "2026-03-12", "hora": "08:00", "tipo": "entrada"},
      {"data": "2026-03-12", "hora": "12:24", "tipo": "inicio_intervalo"},
      {"data": "2026-03-12", "hora": "13:24", "tipo": "fim_intervalo"},
      {"data": "2026-03-12", "hora": "17:48", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 528, "previsto": 1056, "he_50": 0, "he_100": 0,
      "noturno_ficto": 0, "noturno_relogio": 0, "faltas": 528, "atrasos": 0,
      "dsr_desconto": 528, "banco": 0},
    "dias": {
      "2026-03-11": {"previsto": 528, "trabalhado": 0, "falta": 528, "banco": 0,
        "pendente": false, "intercorrencias": ["sem_marcacao"]},
      "2026-03-12": {"previsto": 528, "trabalhado": 528, "intervalo": 60,
        "he_50": 0, "atraso": 0, "falta": 0, "banco": 0, "pendente": false,
        "intercorrencias": []}}}'::jsonb
),
(
  'dsr_por_carga_6x1_divisor_6',
  'GÊMEO do caso anterior na LOJA 6x1: MESMA carga semanal (2640 min), repartida '
  'em 6 dias de 440 min. Mesma falta na quarta 11/03, mesma semana. '
  'Falta = 440 min (a jornada do dia da loja). '
  'DSR de um dia = 2640 ÷ 6 = 440 min. '
  'É o par que fecha o cerco no divisor: 528 aqui (divisor 5 chumbado) ou 440 no '
  'gêmeo administrativo (divisor 6 chumbado) — qualquer constante quebra um dos '
  'dois e deixa o outro passando, apontando o defeito.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Loja 44h (6x1)", "tipo": "6x1",
      "carga_diaria_minutos": 440, "carga_semanal_minutos": 2640,
      "previsto_por_dia_semana": [0, 440, 440, 440, 440, 440, 440],
      "intervalo_minimo_minutos": 60, "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": 480, "horario_saida_minuto": 980,
      "dia_repouso_semana": 0, "dias_uteis_semana": 6,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 500},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-11"}, {"data": "2026-03-12"}],
    "marcacoes": [
      {"data": "2026-03-12", "hora": "08:00", "tipo": "entrada"},
      {"data": "2026-03-12", "hora": "11:40", "tipo": "inicio_intervalo"},
      {"data": "2026-03-12", "hora": "12:40", "tipo": "fim_intervalo"},
      {"data": "2026-03-12", "hora": "16:20", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 440, "previsto": 880, "he_50": 0, "he_100": 0,
      "noturno_ficto": 0, "noturno_relogio": 0, "faltas": 440, "atrasos": 0,
      "dsr_desconto": 440, "banco": 0},
    "dias": {
      "2026-03-11": {"previsto": 440, "trabalhado": 0, "falta": 440,
        "pendente": false, "intercorrencias": ["sem_marcacao"]},
      "2026-03-12": {"previsto": 440, "trabalhado": 440, "intervalo": 60,
        "he_50": 0, "falta": 0, "pendente": false, "intercorrencias": []}}}'::jsonb
),

-- ---------------------------------------------------------------- 7
-- DIA DE REPOUSO DIFERENTE DE DOMINGO (0034, item 3). O caso tem as duas pontas
-- no mesmo mês: um DOMINGO trabalhado com 60 min de excedente, que é dia NORMAL
-- desta pessoa e portanto 50%, e a TERÇA de folga trabalhada, que é o repouso
-- dela e portanto 100% do primeiro minuto. Chumbar `dia_semana === 0` inverte os
-- dois de uma vez.
(
  'repouso_na_terca_nao_no_domingo',
  'Loja 6x1 com folga rotativa na TERÇA: previsto [dom 440, seg 440, ter 0, '
  'qua 440, qui 440, sex 440, sáb 440] e dia_repouso_semana = 2. '
  'DOMINGO 08/03 (dia normal DELA): 08:00–11:40, 12:40–17:20 = 500 min '
  'trabalhados contra 440 previstos. Medição por marcação: entrada e intervalo '
  'em dia, saída 60 min depois do contratual (16:20 → 17:20) → 60 min de '
  'excedente. Como domingo NÃO é o repouso dela, é HE 50%: 60 min. '
  'Banco: 60 × 1,50 = 90. '
  'TERÇA 10/03 (o repouso DELA): trabalhou 08:00–12:00 = 240 min. Em dia de '
  'repouso não há jornada contratada da qual variar — não há tolerância a '
  'aplicar e o primeiro minuto já é HE 100%: 240 min. Banco: 240 × 2,00 = 480. '
  'Total do banco: 570 min. '
  'Com o domingo chumbado como repouso, os dois viravam o contrário: 60 min a '
  '100% no domingo e 240 a 50% na terça — a pessoa recebendo adicional errado '
  'nos dois dias.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Loja 44h (6x1, folga na terça)", "tipo": "6x1",
      "carga_diaria_minutos": 440, "carga_semanal_minutos": 2640,
      "previsto_por_dia_semana": [440, 440, 0, 440, 440, 440, 440],
      "intervalo_minimo_minutos": 60, "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": 480, "horario_saida_minuto": 980,
      "dia_repouso_semana": 2, "dias_uteis_semana": 6,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 500},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-08"}, {"data": "2026-03-10"}],
    "marcacoes": [
      {"data": "2026-03-08", "hora": "08:00", "tipo": "entrada"},
      {"data": "2026-03-08", "hora": "11:40", "tipo": "inicio_intervalo"},
      {"data": "2026-03-08", "hora": "12:40", "tipo": "fim_intervalo"},
      {"data": "2026-03-08", "hora": "17:20", "tipo": "saida"},
      {"data": "2026-03-10", "hora": "08:00", "tipo": "entrada"},
      {"data": "2026-03-10", "hora": "12:00", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 740, "previsto": 440, "he_50": 60, "he_100": 240,
      "noturno_ficto": 0, "noturno_relogio": 0, "faltas": 0, "atrasos": 0,
      "dsr_desconto": 0, "banco": 570},
    "dias": {
      "2026-03-08": {"previsto": 440, "trabalhado": 500, "intervalo": 60,
        "he_50": 60, "he_100": 0, "atraso": 0, "banco": 90, "pendente": false,
        "intercorrencias": []},
      "2026-03-10": {"previsto": 0, "trabalhado": 240, "he_50": 0, "he_100": 240,
        "atraso": 0, "falta": 0, "banco": 480, "pendente": false,
        "intercorrencias": []}}}'::jsonb
),

-- ---------------------------------------------------------------- 8
-- TOLERÂNCIA POR MARCAÇÃO — CLT art. 58 §1º e Súmula 366 do TST (0034, item 5).
-- O dia 11/03 é o caso exato que o motor comparando SALDO deixava passar em
-- branco; o dia 12/03 prova o outro lado, que variação pequena continua sendo
-- ignorada em vez de virar ruído de atraso todo dia.
(
  'tolerancia_por_marcacao_20_min',
  'Administrativo 5x2, dois dias com o MESMO saldo de dia (zero) e resultados '
  'opostos. '
  'QUARTA 11/03 — chega 20 min atrasada (08:20) e sai 20 min depois (18:08), '
  'intervalo de 60 min exatos. O saldo do dia fecha em zero, mas as variações '
  'são medidas UMA A UMA contra o horário contratual: entrada +20 min (não cabe '
  'na tolerância de 5 min da marcação) → 20 min de ATRASO pela TOTALIDADE '
  '(Súmula 366, não só o excedente); saída −20 min → 20 min de HE 50%. O dia '
  'entra na fila como fora_da_tolerancia. '
  'Banco do dia: crédito 20 × 1,50 = 30, menos o débito do atraso 20 → +10 min. '
  'Comparando o saldo do dia — como o motor fazia — atraso e hora extra se '
  'anulavam: a empresa deixava de descontar o atraso E a pessoa perdia a hora '
  'extra, com a fila do DP em silêncio. '
  'QUINTA 12/03 — mesma forma, com 4 min em cada ponta (08:04 e 17:52): cada '
  'variação cabe na tolerância de 5 min da marcação e a soma ignorada (8 min) '
  'cabe no teto diário de 10 min → nada lançado, nenhuma intercorrência.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Administrativo 44h (5x2)", "tipo": "5x2",
      "carga_diaria_minutos": 528, "carga_semanal_minutos": 2640,
      "previsto_por_dia_semana": [0, 528, 528, 528, 528, 528, 0],
      "intervalo_minimo_minutos": 60, "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": 480, "horario_saida_minuto": 1068,
      "dia_repouso_semana": 0, "dias_uteis_semana": 5,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 588},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-11"}, {"data": "2026-03-12"}],
    "marcacoes": [
      {"data": "2026-03-11", "hora": "08:20", "tipo": "entrada"},
      {"data": "2026-03-11", "hora": "12:44", "tipo": "inicio_intervalo"},
      {"data": "2026-03-11", "hora": "13:44", "tipo": "fim_intervalo"},
      {"data": "2026-03-11", "hora": "18:08", "tipo": "saida"},
      {"data": "2026-03-12", "hora": "08:04", "tipo": "entrada"},
      {"data": "2026-03-12", "hora": "12:28", "tipo": "inicio_intervalo"},
      {"data": "2026-03-12", "hora": "13:28", "tipo": "fim_intervalo"},
      {"data": "2026-03-12", "hora": "17:52", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 1056, "previsto": 1056, "he_50": 20, "he_100": 0,
      "noturno_ficto": 0, "noturno_relogio": 0, "faltas": 0, "atrasos": 20,
      "dsr_desconto": 0, "banco": 10},
    "dias": {
      "2026-03-11": {"previsto": 528, "trabalhado": 528, "intervalo": 60,
        "he_50": 20, "atraso": 20, "falta": 0, "banco": 10, "pendente": false,
        "intercorrencias": ["fora_da_tolerancia"]},
      "2026-03-12": {"previsto": 528, "trabalhado": 528, "intervalo": 60,
        "he_50": 0, "atraso": 0, "banco": 0, "pendente": false,
        "intercorrencias": []}}}'::jsonb
),

-- ---------------------------------------------------------------- 9 e 10 (gêmeos)
-- A DUPLA ABERTURA e o eco de verdade do coletor. O par existe porque a correção
-- tem DOIS lados que se parecem e não podem ser tratados igual: tipo repetido em
-- MINUTOS DIFERENTES é evento real (a pessoa esqueceu de bater a saída) e torna
-- o dia PENDENTE; tipo repetido no MESMO MINUTO é o eco do coletor e some sem
-- mudar o pareamento. Quem voltar a engolir o primeiro como se fosse o segundo
-- quebra o caso 9; quem apagar o descarte do eco quebra o caso 10.
(
  'dupla_abertura_entrada_sobre_entrada',
  'O erro de coleta mais comum que existe: entrada 08:00, ENTRADA 13:00 (a '
  'pessoa esqueceu de bater a saída para o almoço) e saída 18:00. '
  'A batida órfã sai da conta e o período aberto às 08:00 é mantido, então o dia '
  'reporta 600 min de trabalho OBSERVADO — mas fica PENDENTE DE TRATAMENTO: nem '
  'falta, nem atraso, nem hora extra são lançados enquanto a intercorrência '
  'estiver aberta, e o banco de horas recebe 0. '
  'Duas linhas para o DP: entrada_sem_saida (falta a batida entre as duas '
  'aberturas) e intervalo_incompleto (600 min trabalhados acima do limite de '
  '360 do art. 71, com 0 min de intervalo batido). '
  'Enquanto o motor tratava tipo repetido como "eco do coletor", este dia '
  'fechava com 600 min corridos: 72 min de HORA EXTRA INVENTADA (600 contra 528 '
  'previstos) e 108 min creditados no banco, com a folha importando o número. '
  'É este caso que impede aquele ramo de voltar.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Administrativo 44h (5x2)", "tipo": "5x2",
      "carga_diaria_minutos": 528, "carga_semanal_minutos": 2640,
      "previsto_por_dia_semana": [0, 528, 528, 528, 528, 528, 0],
      "intervalo_minimo_minutos": 60, "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": 480, "horario_saida_minuto": 1068,
      "dia_repouso_semana": 0, "dias_uteis_semana": 5,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 588},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-11"}],
    "marcacoes": [
      {"data": "2026-03-11", "hora": "08:00", "tipo": "entrada"},
      {"data": "2026-03-11", "hora": "13:00", "tipo": "entrada"},
      {"data": "2026-03-11", "hora": "18:00", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 600, "previsto": 528, "he_50": 0, "he_100": 0,
      "noturno_ficto": 0, "noturno_relogio": 0, "faltas": 0, "atrasos": 0,
      "dsr_desconto": 0, "banco": 0},
    "dias": {"2026-03-11": {"previsto": 528, "trabalhado": 600, "intervalo": 0,
      "he_50": 0, "he_100": 0, "atraso": 0, "falta": 0, "banco": 0,
      "pendente": true,
      "intercorrencias": ["entrada_sem_saida", "intervalo_incompleto"]}}}'::jsonb
),
(
  'batida_repetida_no_mesmo_minuto',
  'GÊMEO do caso anterior pelo outro lado: DUAS entradas às 08:00 — o mesmo tipo '
  'no MESMO MINUTO, que é o eco do coletor de verdade (o índice UNIQUE do banco '
  'olha o momento COM segundos: 08:00:15 e 08:00:45 são duas linhas legítimas lá '
  'e a mesma batida aqui). '
  'Sem tempo entre as duas, descartar a segunda deixa o pareamento ÍNTEGRO: o '
  'dia fecha normal — 08:00–12:24 e 13:24–17:48 = 528 min, exatamente o previsto, '
  'sem atraso, sem hora extra, sem banco — e NÃO fica pendente. A única linha na '
  'fila é marcacao_duplicada, informando o descarte. '
  'Nenhuma marcação some do banco em nenhum dos dois casos: rh.marcacao é '
  'append-only; o que muda é só o que entra na conta do dia.',
  '{"ano": 2026, "mes": 3,
    "jornada": {"nome": "Administrativo 44h (5x2)", "tipo": "5x2",
      "carga_diaria_minutos": 528, "carga_semanal_minutos": 2640,
      "previsto_por_dia_semana": [0, 528, 528, 528, 528, 528, 0],
      "intervalo_minimo_minutos": 60, "intervalo_obrigatorio_acima_minutos": 360,
      "tolerancia_entrada_minutos": 5, "tolerancia_saida_minutos": 5,
      "horario_entrada_minuto": 480, "horario_saida_minuto": 1068,
      "dia_repouso_semana": 0, "dias_uteis_semana": 5,
      "adicional_noturno_inicio_minuto": 1320, "adicional_noturno_fim_minuto": 300,
      "hora_noturna_segundos": 3150, "janela_arraste_minutos": 588},
    "regra": {"fator_he_50": 1.5, "fator_he_100": 2.0},
    "dias": [{"data": "2026-03-11"}],
    "marcacoes": [
      {"data": "2026-03-11", "hora": "08:00", "tipo": "entrada"},
      {"data": "2026-03-11", "hora": "08:00", "tipo": "entrada"},
      {"data": "2026-03-11", "hora": "12:24", "tipo": "inicio_intervalo"},
      {"data": "2026-03-11", "hora": "13:24", "tipo": "fim_intervalo"},
      {"data": "2026-03-11", "hora": "17:48", "tipo": "saida"}]}'::jsonb,
  '{"totais": {"trabalhado": 528, "previsto": 528, "he_50": 0, "he_100": 0,
      "noturno_ficto": 0, "noturno_relogio": 0, "faltas": 0, "atrasos": 0,
      "dsr_desconto": 0, "banco": 0},
    "dias": {"2026-03-11": {"previsto": 528, "trabalhado": 528, "intervalo": 60,
      "he_50": 0, "atraso": 0, "falta": 0, "banco": 0, "pendente": false,
      "intercorrencias": ["marcacao_duplicada"]}}}'::jsonb
);

COMMIT;
