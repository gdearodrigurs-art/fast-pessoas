-- 0026_painel_executivo.sql
-- Dashboard Executivo — a chave de acesso da visão da diretoria.
--
-- ORIGEM: docs/08-analise-feedback-analista-rh.md, seção 6. A analista pediu o
-- painel de indicadores "separado dos relatórios": relatório é operação de RH
-- (lista de aniversariantes, composição familiar), painel executivo é decisão
-- de diretoria (turnover, custo, absenteísmo, clima). Públicos diferentes,
-- telas diferentes, CHAVES diferentes.
--
-- NADA DE SCHEMA NOVO. O painel é VISÃO sobre dado que já existe: colaborador,
-- lotação, folha fechada, afastamento, movimentação aplicada, check-in,
-- pesquisa encerrada, resultado de avaliação. Nenhuma tabela, nenhuma coluna,
-- nenhum gatilho — só a permissão que autoriza ler o agregado.
--
-- POR QUE UMA CHAVE NOVA (e não `relatorio.ver` ou `indicador.ver`)
--   • `relatorio.ver` é o RH operacional; quem o tem não deveria herdar o
--     custo de pessoal por unidade e o turnover consolidado só porque precisa
--     da lista de aniversariantes do mês.
--   • `indicador.ver` é o catálogo de metas (Central de Metas), outra tela.
--   • chave própria = a diretoria pode ser recomposta em /perfis sem mexer em
--     mais nada, e a trilha de auditoria diz exatamente o que foi lido.
--
-- LIMITE QUE A CHAVE NÃO REMOVE: o card de CUSTO DE PESSOAL é condicionado a
-- `folha.ver` DENTRO do painel. Quem tem painel.executivo.ver mas não tem
-- folha.ver recebe o card explicitamente BLOQUEADO ("requer permissão de
-- folha") — sem número, sem máscara, sem total agregado que permita estimar
-- salário. Hoje só `dp` tem folha.ver; `diretoria` e `lider_td` verão o card
-- bloqueado, e isso é o comportamento desejado (dado de remuneração não
-- vaza por painel gerencial). Se a Fast decidir que a Diretoria de Pessoas
-- deve ver o custo, o caminho é conceder folha.ver em /perfis — decisão
-- explícita e auditada, não um efeito colateral desta migration.

BEGIN;

INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('painel.executivo.ver',
   'Ver o Dashboard Executivo (indicadores agregados de pessoas; leitura gera trilha)')
ON CONFLICT (chave) DO NOTHING;

-- diretoria e dp: o público natural do painel.
-- lider_td: a própria analista defende a visão estratégica dele — "atuando
-- como Business Partner, ele necessita desses dados para desenhar planos de
-- sucessão, calcular o ROI dos treinamentos e estruturar programas baseados em
-- dados reais de headcount e cargos" (0019_perfis.sql já concedeu a ele
-- rh.colaborador.ver, indicador.ver e avaliacao.resultado.ver pelo mesmo
-- motivo). Ele NÃO tem folha.ver: vê headcount, turnover, absenteísmo, clima e
-- performance; não vê custo de pessoal.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('diretoria', 'painel.executivo.ver'),
  ('dp',        'painel.executivo.ver'),
  ('lider_td',  'painel.executivo.ver')
ON CONFLICT DO NOTHING;

COMMIT;
