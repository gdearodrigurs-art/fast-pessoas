-- 0038_folha_divisores.sql
-- Os dois divisores do motor da folha saem do fonte e viram parâmetro: o
-- MENSAL DE HORAS (220) e o MENSAL DE DIAS (30).
--
-- POR QUE ESTA MIGRATION EXISTE
-- src/dominios/folha/calculo.ts calculava o valor da hora como `salário ÷ 220` e
-- o valor do dia como `salário ÷ 30`, com os dois números escritos no código. O
-- 220 é o grave: 220 horas mensais é o divisor de quem cumpre 44 h semanais, e o
-- módulo de ponto já parametriza a carga de cada jornada em
-- rh.jornada_versao.carga_semanal_minutos. Quem tem carga MENOR recebe hora
-- extra a MENOS, porque o valor da hora dele sai dividido por um número maior
-- que o dele.
--
-- Não é hipótese. A jornada PLANTAO-12X36 do catálogo tem 2160 min semanais
-- (36 h) e 10 pessoas nela. Na competência 07/2026, com as rubricas e as tabelas
-- legais vigentes:
--
--   Hugo Machado Falcão (matrícula 1020), salário 2.800,00, 36 h semanais
--     valor da hora pelo 220 chumbado ............... R$ 12,7273
--     valor da hora pelo divisor 180 (o dele) ....... R$ 15,5556
--     1101 Horas Extras 50%, 20,5 h ..... 391,36 → 478,33   (+ 8.697 centavos)
--     1103 Adicional Noturno, 120,0 h ... 305,45 → 373,33   (+ 6.788 centavos)
--                                        subpago:  15.485 centavos (R$ 154,85)
--
--   Os 10 plantonistas somados, em UM mês: 170.825 centavos (R$ 1.708,25).
--
-- DE ONDE VEM CADA DIVISOR (a decisão)
--
--   DIVISOR MENSAL DE HORAS → parâmetro da folha EM PAR com a carga semanal a
--   que ele se refere, e proporcional à carga de cada pessoa:
--
--       divisor da pessoa = divisor_mensal_horas
--                         × carga_semanal_da_jornada_dela
--                         ÷ carga_semanal_referencia_minutos
--
--   O par é o ponto. "220" sozinho não é um número: é o divisor DE 44 h
--   semanais (220 = 44 × 5, onde o 5 já embute o DSR — não é 44 × 4,2857 = 188,6
--   de horas efetivamente trabalhadas). Guardar o par (220 h, 2640 min) faz o
--   sistema dizer a que jornada aquele divisor pertence, e a regra de três
--   entrega 200 para 40 h, 180 para 36 h, 150 para 30 h — a mesma tabela que o
--   DP usa na mão. E preserva a autonomia do dono: se o acordo coletivo fixar
--   200 h para 44 h semanais, muda-se UM campo e todo mundo acompanha na mesma
--   proporção.
--
--   Por que NÃO uma coluna de divisor em rh.jornada_versao: (a) o divisor é
--   convenção de FOLHA — quem o define é o acordo/convenção que a folha aplica,
--   não a escala que o ponto apura; (b) jornada_versao é versionada por vigência
--   e existe uma por escala: mudar o divisor exigiria abrir versão nova de cada
--   jornada, e jornada nova nasceria sem divisor nenhum; (c) o par de referência
--   já cobre 100% dos casos por proporção, sem repetir dado. A jornada continua
--   dona do que é dela — a CARGA —, e a folha continua dona do que é dela — a
--   CONVENÇÃO. Ninguém precisa saber do outro além de um número.
--
--   Sem jornada vigente (colaborador sem escala cadastrada) o motor usa o
--   divisor de referência puro, que é exatamente o comportamento de hoje, e DIZ
--   isso na memória de cálculo do item em vez de deixar implícito.
--
--   DIVISOR MENSAL DE DIAS → parâmetro da folha, e SÓ. Não se deriva de jornada
--   nenhuma: o salário-dia do mensalista é o mensal dividido pelo mês de 30 dias
--   (CLT art. 64; Lei 605/49 art. 7º §2º), independentemente de a pessoa
--   trabalhar 5, 6 ou 3 dias por semana — o salário mensal remunera o mês
--   inteiro, repouso incluído. O plantonista que falta a um plantão perde 1/30,
--   igual ao administrativo: a conversão de minutos de falta em DIAS já foi
--   feita antes, pela carga diária da jornada dele (repositório da folha). Ele
--   entra aqui só para não ficar número de negócio chumbado no fonte.
--
-- SEGURANÇA DO QUE JÁ EXISTE
-- As três colunas nascem NOT NULL com DEFAULT igual ao número que estava no
-- código (220 h, 2640 min, 30 dias). A versão ativa dos parâmetros passa a
-- valer exatamente o que já valia, e para quem tem 44 h semanais a conta
-- continua sendo `salário ÷ 220` — bit a bit, porque 220 × 2640 ÷ 2640 = 220. A
-- migration só pode mudar o resultado de quem tem carga DIFERENTE de 44 h, que é
-- o defeito. Os DEFAULTs ficam na tabela de propósito: versão de parâmetro criada
-- por qualquer caminho que não conheça os campos novos nasce coerente, em vez de
-- estourar NOT NULL ou receber padrão vindo da aplicação.
--
-- COMPETÊNCIAS JÁ FECHADAS não mudam de número: folha calculada é dado gravado
-- em rh_folha.item_calculo com a memória do cálculo junto. Recalcular 04, 05 e
-- 06/2026 é impossível (estão fechadas) e não é para ser possível — correção de
-- competência fechada é folha complementar. 07/2026 está aberta e deve ser
-- recalculada: o número novo é o certo.

BEGIN;

ALTER TABLE rh_folha.parametro_folha_versao
  -- Horas mensais que o divisor representa. 220 é a praxe para 44 h semanais
  -- (Súmula 431 do TST usa 220 para a jornada de 44 h; 200 para 40 h).
  ADD COLUMN divisor_mensal_horas NUMERIC(7,2) NOT NULL DEFAULT 220
    CHECK (divisor_mensal_horas > 0),
  -- A carga semanal A QUE aquele divisor se refere, em MINUTOS (mesma unidade de
  -- rh.jornada_versao.carga_semanal_minutos — horas em minutos inteiros é
  -- convenção do sistema). 2640 min = 44 h. É este campo que transforma o 220 de
  -- número solto em par verificável, e é o denominador da proporção.
  ADD COLUMN carga_semanal_referencia_minutos INTEGER NOT NULL DEFAULT 2640
    CHECK (carga_semanal_referencia_minutos BETWEEN 1 AND 10080),
  -- Dias do mês para o salário-dia do mensalista (falta e DSR sobre falta).
  ADD COLUMN divisor_mensal_dias NUMERIC(5,2) NOT NULL DEFAULT 30
    CHECK (divisor_mensal_dias > 0);

COMMENT ON COLUMN rh_folha.parametro_folha_versao.divisor_mensal_horas IS
  'Divisor mensal de horas da jornada de referência (220 h para 44 h semanais). '
  'O divisor de cada colaborador sai da proporção com a carga da jornada dele: '
  'divisor_mensal_horas × carga_semanal_dela ÷ carga_semanal_referencia_minutos.';
COMMENT ON COLUMN rh_folha.parametro_folha_versao.carga_semanal_referencia_minutos IS
  'Carga semanal, em MINUTOS, a que divisor_mensal_horas se refere (2640 = 44 h). '
  'Existe para o divisor não ser um número solto: é o denominador da proporção '
  'que dá 200 para 40 h, 180 para 36 h, 150 para 30 h.';
COMMENT ON COLUMN rh_folha.parametro_folha_versao.divisor_mensal_dias IS
  'Dias do mês para o salário-dia do mensalista (CLT art. 64; Lei 605/49 art. 7º '
  '§2º): falta = dias × salário ÷ este divisor. NÃO depende da jornada — o '
  'salário mensal remunera o mês inteiro, repouso incluído.';

-- ---------------------------------------------------------------- caso de teste
-- A bateria rh_folha.caso_teste_folha é o alarme do motor. Ela só provava o
-- divisor de 44 h (caso 'com_he50_2000_10h'); um caso gêmeo com carga semanal de
-- 36 h fecha o cerco: se alguém voltar a chumbar 220 no fonte, ESTE caso quebra
-- e o de 44 h continua passando, apontando o dedo para o defeito certo.
--
-- Saída calculada à mão contra as MESMAS tabelas legais seed da 0013.
INSERT INTO rh_folha.caso_teste_folha (nome, descricao, entrada, saida_esperada) VALUES
(
  'he50_2000_10h_carga_36h',
  'Gêmeo do caso com_he50_2000_10h, mudando SÓ a carga semanal: 2160 min (36 h, '
  'jornada 12x36). Divisor da pessoa = 220 × 2160 ÷ 2640 = 180, e não 220. '
  'Hora normal 2.000/180 = 11,1111…; HE50 = 10 × 1,5 × 11,1111… = 166,6666… → '
  '166,67 (contra 136,36 pelo divisor de 44 h — 30,31 a menos por 10 horas). '
  'Bases = 2.000,00 + 166,67 = 2.166,67. '
  'INSS: 1.631,00×7,5% = 122,3250; (2.166,67−1.631,00)×9% = 48,2103; '
  'soma 170,5353 → 170,54. '
  'FGTS: 2.166,67×8% = 173,3336 → 173,33. '
  'IRRF: completo 2.166,67−170,54 = 1.996,13 e simplificado 2.166,67−607,20 = '
  '1.559,47 — ambos ≤ 2.428,80, isento → sem item 2002. '
  'Líquido: 2.166,67 − 170,54 = 1.996,13.',
  '{"salario": 2000.00, "dependentes": 0, "carga_semanal_minutos": 2160,
    "variaveis": [{"rubrica": "1101", "referencia": 10}]}'::jsonb,
  '{"itens": {"1001": 2000.00, "1101": 166.67, "2001": 170.54, "3001": 173.33},
    "liquido": 1996.13}'::jsonb
);

COMMIT;
