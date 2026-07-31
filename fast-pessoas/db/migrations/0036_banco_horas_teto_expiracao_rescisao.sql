-- 0036_banco_horas_teto_expiracao_rescisao.sql
-- O banco de horas passa a OBEDECER os próprios parâmetros.
--
-- POR QUE ESTA MIGRATION EXISTE
-- A tela de Parâmetros do ponto cadastra, por escopo (empresa → unidade/cargo →
-- pessoa), um teto positivo, um piso negativo, um prazo de compensação, um
-- "saldo expira no fim do prazo" e um tratamento na rescisão. Até aqui o banco
-- de horas cumpria UM desses cinco:
--
--   • limite positivo/negativo — conferidos SÓ no lançamento manual do DP
--     (movimento marginal). A APURAÇÃO, que move a maior parte do passivo,
--     creditava sem olhar teto nenhum: com teto de 60 min a competência creditou
--     356 min, 200 OK, sem aviso e sem intercorrência — enquanto no mesmo minuto
--     um lançamento manual de +1 min voltava 422 citando o mesmo teto.
--   • prazo_compensacao_dias e expira_saldo — cadastrados, exibidos na tela e
--     NUNCA lidos por linha de código nenhuma. Todas as ocorrências no fonte
--     eram tipo, coluna de SELECT ou parâmetro de INSERT. Uma política que o
--     sistema não cumpre é pior que política nenhuma: o DP acredita que o saldo
--     de 2026 expira e ele não expira.
--   • tratamento_rescisao — mesma coisa: o desligamento encerrava o contrato e
--     o saldo do banco ficava lá, intacto, sem uma linha dizendo o que fazer com
--     ele.
--
-- O QUE MUDA NO BANCO DE DADOS
-- (a regra de negócio em si mora em src/dominios/ponto/servico.ts; aqui ficam só
-- as estruturas que ela precisa para poder ser gravada)
--
-- 1) ORIGEM 'estorno_apuracao'. A reapuração estorna o movimento da apuração
--    anterior antes de gravar o novo — e gravava esse estorno como origem
--    'ajuste' com apuracao_id NULL, do mesmo jeito que um ajuste manual do DP.
--    A única amarração entre o estorno e a apuração revertida era o TEXTO da
--    observação: auditar a base inteira exigia LIKE 'Estorno da apuração%'.
--    Agora o estorno tem origem própria e aponta para a apuração que reverteu.
--
-- 2) TIPO DE INTERCORRÊNCIA 'banco_fora_do_limite'. É o destino do excedente
--    quando a apuração bate no teto (ver o serviço): o crédito entra até o
--    limite e o que passa vira fila para o DP decidir — nunca some calado.
--
-- 3) Um índice para a expiração FIFO ler os movimentos na ordem em que
--    entraram (a expiração consome o crédito mais antigo primeiro).
--
-- O LIVRO CONTINUA APPEND-ONLY. Nenhuma coluna de saldo é criada aqui, nem
-- aqui nem em lugar nenhum: saldo é a soma dos movimentos, e expiração,
-- estorno e acerto de rescisão são movimentos como qualquer outro.

BEGIN;

-- ================================================================ 1) estorno tipado
ALTER TABLE rh.banco_horas_movimento
  DROP CONSTRAINT banco_horas_movimento_origem_check,
  ADD  CONSTRAINT banco_horas_movimento_origem_check CHECK (origem IN
    ('apuracao','estorno_apuracao','compensacao','expiracao','ajuste','rescisao'));

-- Estorno sem a apuração que ele reverte é estorno de coisa nenhuma: a mesma
-- exigência que 'apuracao' já tinha.
ALTER TABLE rh.banco_horas_movimento
  DROP CONSTRAINT banco_horas_movimento_check,
  ADD  CONSTRAINT banco_horas_movimento_check CHECK (
    origem NOT IN ('apuracao','estorno_apuracao') OR apuracao_id IS NOT NULL
  );

-- Os estornos que já estão gravados: reclassificação de METADADO, com o valor
-- (minutos) intocado. O trigger de imutabilidade existe para impedir que a
-- APLICAÇÃO reescreva o livro; migration é o único lugar onde uma correção de
-- estrutura é legítima, e ela fica registrada neste arquivo. O casamento é
-- determinístico: há exatamente uma apuração por (colaborador, ano, mês) e a
-- observação carrega a competência.
ALTER TABLE rh.banco_horas_movimento DISABLE TRIGGER banco_horas_movimento_imutavel;

UPDATE rh.banco_horas_movimento m
   SET origem = 'estorno_apuracao',
       apuracao_id = a.id
  FROM rh.apuracao_ponto a
 WHERE m.origem = 'ajuste'
   AND m.apuracao_id IS NULL
   AND m.observacao LIKE 'Estorno da apuração anterior de %'
   AND a.colaborador_id = m.colaborador_id
   AND a.mes = substring(m.observacao from 'de (\d{2})/\d{4}')::int
   AND a.ano = substring(m.observacao from 'de \d{2}/(\d{4})')::int;

ALTER TABLE rh.banco_horas_movimento ENABLE TRIGGER banco_horas_movimento_imutavel;

-- ================================================================ 2) excedente do teto vira fila
ALTER TABLE rh.intercorrencia_ponto
  DROP CONSTRAINT intercorrencia_ponto_tipo_check,
  ADD  CONSTRAINT intercorrencia_ponto_tipo_check CHECK (tipo IN
    ('entrada_sem_saida','intervalo_incompleto','marcacao_duplicada',
     'sem_marcacao','fora_da_tolerancia','banco_fora_do_limite'));

-- ================================================================ 3) leitura FIFO da expiração
-- A expiração percorre os movimentos da pessoa na ordem de entrada para saber
-- QUAL crédito ainda está de pé e desde quando. Sem ordem por (data, id) o
-- consumo do mais antigo primeiro não é determinístico entre dois movimentos do
-- mesmo dia.
CREATE INDEX IF NOT EXISTS banco_horas_movimento_fifo
  ON rh.banco_horas_movimento (colaborador_id, data, id);

COMMIT;
