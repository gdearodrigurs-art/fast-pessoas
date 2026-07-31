-- 0028_folha_rubricas.sql
-- Onda G, item G4 (docs/10-plano-pos-reuniao-diretoria.md §7; falas em
-- docs/11-achados-da-transcricao.md §2.4): as SEIS rubricas nomeadas pela
-- diretoria entram no catálogo com versão vigente, e as rubricas genéricas
-- 9001/9002 passam a ser marcadas como EXCEÇÃO — diretriz textual dela:
-- "a gente tem que eliminar esses proventos manuais o máximo".
--
-- Padrão da 0013 mantido: identidade estável em rh_folha.rubrica; incidência
-- e tipo de cálculo vivem na VERSÃO com vigência (mudança futura é versão
-- nova, nunca UPDATE no que já vigorou).
--
-- Numeração (segue os blocos da 0013 — 1xxx remuneração, 2xxx descontos
-- legais/benefício, 3xxx informativas, 9xxx manuais) com três sub-blocos:
--   13xx — remuneração VARIÁVEL (comissão, DSR e reflexos) → tributável
--   14xx — verba de férias SEM natureza salarial            → não tributável
--   15xx — benefício previdenciário pago pelo empregador    → não tributável
--
-- Todas nascem 'valor_informado': em F1 o DP lança o valor já apurado
-- (planilha de vendas, tabela da cota do salário família). Apurar comissão a
-- partir do faturamento e DSR semana a semana (Lei 605/49) é evolução — vai
-- junto do espelho de ponto, na onda F.
--
-- NOTA SOBRE A TRAVA DE COMPETÊNCIA RETROATIVA (item G3): a regra "não abrir
-- competência anterior ao mês corrente" ficou no SERVIÇO
-- (src/dominios/folha/servico.ts → abrirCompetencia), NÃO aqui. Dois motivos:
-- (a) "mês corrente" não é IMMUTABLE, então não cabe em CHECK; (b) um trigger
-- de INSERT quebraria as competências históricas já existentes na demo
-- (2026-02, 04, 05, 06) e o semeador db/semear/10-folha-sst.js, que carrega
-- competências passadas de propósito. A trava vale para quem abre pela tela.

BEGIN;

-- ------------------------------------------------------------------ exceção: os manuais genéricos
-- Atributo de IDENTIDADE da rubrica (não muda com vigência): marca as verbas
-- de escape. A lista de escolha ordena por (excecao, codigo) e a tela avisa
-- que são exceção — verba recorrente deve virar rubrica própria.
ALTER TABLE rh_folha.rubrica
  ADD COLUMN excecao BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN rh_folha.rubrica.excecao IS
  'Rubrica genérica de escape (provento/desconto manual): vai por ÚLTIMO na lista de escolha, com aviso na tela. Diretriz da diretoria: "a gente tem que eliminar esses proventos manuais o máximo" — verba recorrente deve virar rubrica própria.';

UPDATE rh_folha.rubrica SET excecao = TRUE WHERE codigo IN ('9001', '9002');

-- ------------------------------------------------------------------ as seis rubricas nomeadas
INSERT INTO rh_folha.rubrica (codigo, nome, natureza) VALUES
  ('1301', 'Comissão',                      'provento'),
  ('1302', 'Reflexo de Comissão',           'provento'),
  ('1303', 'DSR',                           'provento'),
  ('1304', 'Reflexo de DSR sobre Comissão', 'provento'),
  ('1401', 'Abono Pecuniário',              'provento'),
  ('1501', 'Salário Família',               'provento');

-- ------------------------------------------------------------------ versão vigente + RAZÃO de cada incidência
--
-- 1301 COMISSÃO — INSS sim, IRRF sim, FGTS sim.
--   Comissão é parcela SALARIAL por texto expresso da CLT (art. 457, §1º:
--   integram o salário as comissões pagas pelo empregador). Sendo salário:
--   entra no salário-de-contribuição (Lei 8.212/91, art. 28, I) → INSS;
--   é rendimento do trabalho assalariado → IRRF; e integra a remuneração
--   para o depósito de FGTS (Lei 8.036/90, art. 15).
--
-- 1302 REFLEXO DE COMISSÃO — INSS sim, IRRF sim, FGTS sim.
--   O reflexo (repercussão da comissão sobre outras verbas) segue a natureza
--   da verba que o origina. Origem salarial → reflexo salarial → incide tudo.
--   CONFERIR COM O DP: sobre QUAIS verbas a empresa calcula o reflexo (13º,
--   férias, aviso prévio) e se alguma delas tem tratamento próprio. Em F1 o
--   valor vem apurado de fora, então a incidência aqui é a do caso geral —
--   INTERPRETAÇÃO NOSSA, precisa de confirmação.
--
-- 1303 DSR — INSS sim, IRRF sim, FGTS sim.
--   Descanso semanal remunerado é REMUNERAÇÃO (Lei 605/49, art. 7º) — o dia
--   de repouso é pago como trabalhado. Natureza salarial → incide tudo.
--   Não confundir com a 1202 "DSR sobre Faltas", que é DESCONTO (perda do
--   repouso por falta injustificada, mesma Lei 605/49, art. 6º).
--
-- 1304 REFLEXO DE DSR SOBRE COMISSÃO — INSS sim, IRRF sim, FGTS sim.
--   É o DSR calculado sobre as comissões do mês (entendimento consolidado na
--   Súmula 27 do TST: o comissionista tem direito ao repouso remunerado
--   sobre as comissões). Herda a natureza salarial da comissão → incide tudo.
--   CONFERIR COM O DP: a diretoria nomeou "DSR" e "reflexo de DSR sobre
--   comissão" como coisas SEPARADAS, então mantivemos duas rubricas. Se na
--   prática a empresa paga tudo em uma só, a 1304 deve ser desativada
--   (ativo = FALSE) em vez de apagada.
--
-- 1401 ABONO PECUNIÁRIO (venda de 1/3 das férias) — INSS não, IRRF não, FGTS não.
--   INSS: o abono pecuniário de férias está EXPRESSAMENTE excluído do
--     salário-de-contribuição (Lei 8.212/91, art. 28, §9º, alínea "e",
--     item 6) — é verba indenizatória, não contraprestação de trabalho.
--   IRRF: isento — a RFB reconhece a não incidência sobre a conversão de
--     férias em pecúnia (IN RFB 1.500/2014, art. 11), na mesma linha da
--     Súmula 386 do STJ para férias indenizadas.
--   FGTS: a base do FGTS remete às exclusões do art. 28, §9º da Lei 8.212/91
--     (Lei 8.036/90, art. 15, §6º) — logo, também não incide.
--   CONFERIR COM O DP: o TERÇO CONSTITUCIONAL sobre o abono. Nossa
--     INTERPRETAÇÃO é que segue o mesmo tratamento e pode ser lançado nesta
--     mesma rubrica; se o DP quiser separar, é rubrica nova (1402).
--
-- 1501 SALÁRIO FAMÍLIA — INSS não, IRRF não, FGTS não.
--   É BENEFÍCIO PREVIDENCIÁRIO (Lei 8.213/91, arts. 65 a 70) que o
--   empregador apenas ADIANTA ao segurado de baixa renda e depois compensa
--   no recolhimento. Não é contraprestação do trabalho: não integra o
--   salário-de-contribuição, não é rendimento tributável e não entra na base
--   do FGTS. Provento no holerite (soma no líquido), fora de todas as bases.
--   CONFERIR COM O DP: a cota é valor de TABELA por filho, com teto de renda,
--     e muda por portaria anual. Fica 'valor_informado' em F1 de propósito —
--     automatizar exige a cota como PARÂMETRO VERSIONADO COM VIGÊNCIA
--     (tabela própria, como INSS/IRRF), nunca constante no código.
--
INSERT INTO rh_folha.rubrica_versao
  (rubrica_id, incide_inss, incide_irrf, incide_fgts, tipo_calculo, parametro,
   status, inicio_vigencia)
SELECT r.id, v.incide_inss, v.incide_irrf, v.incide_fgts,
       'valor_informado', NULL, 'ativa', DATE '2026-01-01'
  FROM rh_folha.rubrica r
  JOIN (VALUES
    ('1301', TRUE,  TRUE,  TRUE ),   -- comissão: salário (CLT 457 §1º)
    ('1302', TRUE,  TRUE,  TRUE ),   -- reflexo de comissão: segue a origem
    ('1303', TRUE,  TRUE,  TRUE ),   -- DSR: remuneração (Lei 605/49)
    ('1304', TRUE,  TRUE,  TRUE ),   -- DSR sobre comissão: idem (Súm. 27 TST)
    ('1401', FALSE, FALSE, FALSE),   -- abono pecuniário: indenizatório
    ('1501', FALSE, FALSE, FALSE)    -- salário família: benefício previdenciário
  ) AS v (codigo, incide_inss, incide_irrf, incide_fgts)
    ON v.codigo = r.codigo;

COMMIT;
