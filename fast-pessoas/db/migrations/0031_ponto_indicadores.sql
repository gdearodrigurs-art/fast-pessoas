-- 0031_ponto_indicadores.sql
-- Ponto, etapa 2 (API e telas): o catálogo de indicadores ganha a segunda
-- fonte do domínio de ponto.
--
-- 'horas_extras' já existe desde 0005 (HE ÷ horas trabalhadas) e agora tem
-- fonte de verdade: rh.apuracao_ponto. Falta o número que a diretoria olha
-- junto — o PASSIVO acumulado do banco de horas, que não é percentual e não
-- cabe no mesmo indicador.
--
-- UNIDADE: rh.indicador só aceita '%', 'qtd' e 'dias' (CHECK do 0005). O saldo
-- entra como 'qtd' de HORAS (não minutos): a Central de Metas mostra números
-- para gente, e a descrição diz a unidade em letras para a tela não mentir.
-- Direção 'menor' porque saldo positivo acumulado é dívida com o trabalhador.

BEGIN;

INSERT INTO rh.indicador (chave, nome, area, descricao, unidade, direcao) VALUES
  ('saldo_banco_horas', 'Saldo do banco de horas (horas)', 'Ponto',
   'Soma de todos os movimentos do banco de horas dos colaboradores ativos, em HORAS. Positivo é passivo com o trabalhador; a meta é o teto que a empresa aceita carregar.',
   'qtd', 'menor')
ON CONFLICT (chave) DO NOTHING;

COMMIT;
