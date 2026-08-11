-- 0064_folha_quinto_dia_util.sql
-- Pendência #4 (decisão do dono): a folha vence no 5º dia ÚTIL do mês seguinte
-- (art. 459 §1º da CLT), não no 5º dia corrido.
--
-- O indicador 'folha_no_prazo' media o prazo como dia 5 CORRIDO — um INTERVAL
-- chumbado dentro do SQL (folha/repositorio.ts), que nenhuma busca por constante
-- achava, e que cobrava do DP um prazo MAIS apertado que o legal. O art. 459 §1º
-- diz "até o quinto dia útil do mês subsequente".
--
-- DECISÃO DO DONO (11/08/2026): dia útil = dia de trabalho, não dia bancário.
-- SÁBADO CONTA. Só domingo e feriado não contam.
--
-- Esta função devolve o n-ésimo dia útil do mês de `mes_referencia`, lendo o
-- MESMO calendário administrável que o ponto já mantém (rh.feriado, migration
-- 0027, editável em /ponto/parametros) — um calendário só para o sistema todo.
-- Nada de tabela nova nem número chumbado: o 5 é a lei (fica no chamador, com a
-- citação), e a lista de feriados é a tabela administrável.
--
-- Régua do dia útil AQUI (prazo de pagamento, art. 459):
--   • domingo (DOW 0) NÃO é dia útil;
--   • feriado NACIONAL (tipo='feriado') NÃO é dia útil;
--   • sábado É dia útil (decisão do dono);
--   • 'ponto_facultativo' É dia útil comum.
-- Só feriado NACIONAL entra: o prazo é uma régua da empresa, única, e feriado
-- municipal/estadual raramente cai nos 5 primeiros dias úteis de um mês. (A régua
-- de "dia útil" do PONTO e do PAINEL é outra — lá é seg–sex; aqui sábado conta.
-- São duas definições legítimas e diferentes, de propósito.)

BEGIN;

CREATE FUNCTION rh.enesimo_dia_util_folha(mes_referencia DATE, n INT)
  RETURNS DATE
  LANGUAGE sql
  STABLE
AS $$
  SELECT dia
    FROM (
      SELECT g::date AS dia,
             row_number() OVER (ORDER BY g) AS ordem_util
        FROM generate_series(
               date_trunc('month', mes_referencia)::date,
               (date_trunc('month', mes_referencia) + INTERVAL '1 month'
                - INTERVAL '1 day')::date,
               INTERVAL '1 day'
             ) AS s(g)
       WHERE EXTRACT(DOW FROM g) <> 0            -- não domingo (sábado conta)
         AND NOT EXISTS (
               SELECT 1
                 FROM rh.feriado f
                WHERE f.data = g::date
                  AND f.tipo = 'feriado'
                  AND f.abrangencia = 'nacional')
    ) uteis
   WHERE ordem_util = n;
$$;

COMMENT ON FUNCTION rh.enesimo_dia_util_folha(DATE, INT) IS
  'N-ésimo dia útil do mês de mes_referencia para o prazo do art. 459 §1º: '
  'sábado conta, domingo e feriado nacional (rh.feriado) não. Usado pelo '
  'indicador folha_no_prazo. n=5 sempre existe (todo mês tem >= 20 dias úteis).';

-- A descrição do indicador dizia "dia 5" — passa a dizer a régua real.
UPDATE rh.indicador
   SET descricao = 'Competências mensais dos últimos 12 meses fechadas até o '
                   '5º dia útil do mês seguinte (art. 459 §1º; sábado conta, '
                   'domingo e feriado nacional não; America/Sao_Paulo).'
 WHERE chave = 'folha_no_prazo';

COMMIT;
