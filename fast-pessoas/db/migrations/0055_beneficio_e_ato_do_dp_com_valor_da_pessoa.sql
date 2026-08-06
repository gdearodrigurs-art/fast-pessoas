-- 0055_beneficio_e_ato_do_dp_com_valor_da_pessoa.sql — toda adesão passa a ter
-- valor e desconto ESCOLHIDOS por alguém; a regra de elegibilidade deixa de ser
-- portão e vira valor de referência.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Palavra da Diretora de Pessoas na reunião (docs/11 §3, 00:35:16–00:36:47):
-- "benefícios sem candidatura, só reajuste". O plano traduziu em duas linhas
-- (docs/10, onda H): a pessoa já entra com direito, o botão "solicitar adesão"
-- desaparece — e o valor é INDIVIDUAL, "VT de R$ 600 para um, R$ 720 para
-- outro".
--
-- O banco de 2026-08-06 (fast_pessoas_dev) já mostrava o problema do lado do
-- dinheiro, e ele não é o que se esperava. As 333 adesões TÊM valor: nenhuma
-- com `valor` nulo, nenhuma com `desconto` nulo. O que não tinham era ESCOLHA
-- individual — em quatro dos seis benefícios o valor é o mesmo para todo mundo:
--
--     farmacia      62 adesões · 1 valor distinto (R$ 200,00)
--     va            59 adesões · 1 valor distinto (R$ 350,00)
--     vr            69 adesões · 1 valor distinto (R$ 660,00)
--     vt            46 adesões · 2 valores distintos
--     plano_odonto  48 adesões · 5 valores distintos
--     plano_saude   49 adesões · 6 valores distintos
--
-- Um único valor em 190 adesões é a assinatura do defeito que a onda H ataca: o
-- serviço fazia `dados.valor ?? regra.valor_padrao`. O DP deixava o campo em
-- branco — que era o caminho normal, porque a tela dizia "em branco congela o
-- padrão" — e o valor da tabela virava o valor da pessoa sem que ninguém
-- decidisse nada. Enquanto `valor` puder ser NULL, esse caminho continua aberto
-- por baixo da aplicação: um INSERT direto, um seed, uma importação.
--
-- O QUE MUDA
--   rh.adesao.valor        Passam a ser NOT NULL. Antes disso, quem estiver
--   rh.adesao.desconto     nulo é preenchido pela versão de regra vigente NA
--                          DATA DE INÍCIO daquela adesão e, para adesão
--                          anterior a qualquer versão registrada, pela versão
--                          mais antiga que existe — nunca pela ativa de hoje.
--                          A ordem exata está escrita no bloco do UPDATE.
--                          Em fast_pessoas_dev isso preenche ZERO linhas,
--                          porque nenhuma das 333 está nula; o bloco existe
--                          para o banco que não é este. Se ainda sobrar alguma,
--                          a migration ABORTA com os ids — inventar dinheiro é
--                          pior que parar.
--                          NULL deixa de significar "segue o padrão da regra":
--                          esse significado morreu junto com o `??`.
--   comentários            rh.adesao.valor/desconto e
--                          rh.regra_elegibilidade_versao.valor_padrao/
--                          desconto_padrao passam a dizer o que passaram a ser:
--                          valor da PESSOA de um lado, SUGESTÃO do outro.
--
-- O QUE **NÃO** MUDA, de propósito
--   rh.regra_elegibilidade_versao continua inteira, versionada e com vigência.
--   Apagá-la destruiria a explicação das adesões antigas — é a versão dela que
--   diz por que aquele valor era aquele naquela data. Ela só perdeu o poder de
--   dizer "não" no lugar do DP; isso é mudança de aplicação, não de esquema.
--
--   As demandas de adesão ABERTAS não são tocadas. Fechá-las em massa aqui
--   seria decidir, por SQL, o que o DP tem de decidir caso a caso — e apagaria
--   o pedido de quem pediu. Elas continuam na fila, e o DP as conclui
--   concedendo (com o valor da pessoa) ou negando, pelos mesmos botões.
--
-- MIGRATION APLICADA É IMUTÁVEL. Depois que este arquivo rodar em qualquer banco,
-- corrigir é escrever OUTRA migration: o db/migrar.js compara o hash do conteúdo e
-- aborta, e ele está certo em abortar.

BEGIN;

-- ---------------------------------------------------------------- retrato do antes
-- Guardado em tabela temporária porque as provas do fim precisam comparar com
-- ele: "nenhuma adesão foi perdida" e "nenhuma versão de regra foi apagada" só
-- são afirmações verificáveis contra o número de antes. Em banco recém-criado
-- todos esses números são zero, e é assim que tem de ser — a migration roda
-- igual no banco vazio da bancada e no banco cheio do dono.
CREATE TEMP TABLE prova_0055 ON COMMIT DROP AS
SELECT (SELECT count(*) FROM rh.adesao)                            AS adesoes,
       (SELECT count(*) FROM rh.adesao WHERE valor IS NULL)        AS sem_valor,
       (SELECT count(*) FROM rh.adesao WHERE desconto IS NULL)     AS sem_desconto,
       (SELECT count(*) FROM rh.regra_elegibilidade_versao)        AS regras;

DO $$
DECLARE
  p RECORD;
BEGIN
  SELECT * INTO p FROM prova_0055;
  RAISE NOTICE
    'adesões antes da 0055: % no total, % sem valor, % sem desconto (% versões de regra)',
    p.adesoes, p.sem_valor, p.sem_desconto, p.regras;
END;
$$;

-- ---------------------------------------------------------------- o preenchimento
-- A trava de imutabilidade (`adesao_congelar`, 0009) barra UPDATE em adesão com
-- `fim` preenchido, e ela está certa: adesão encerrada não se reescreve. Aqui a
-- suspensão é deliberada e estreita — só toca linha com valor NULO, e escreve
-- exatamente o número que já valia por omissão. Não é mudar o passado; é passar
-- a limpo o que o passado dizia implicitamente, para que ele pare de depender
-- de uma regra que pode ser reescrita amanhã.
ALTER TABLE rh.adesao DISABLE TRIGGER adesao_congelar;

-- A ORDEM DE BUSCA, e ela é a coisa mais importante deste arquivo, porque é
-- onde se decide de onde vem o dinheiro de uma pessoa:
--
--   1º  a versão de regra que valia NA DATA DE INÍCIO daquela adesão. Ler a
--       versão ATIVA de hoje — que é o que o `??` do serviço fazia — daria a
--       tabela de 2026 a um contrato de 2019. Adesão velha é explicada pela
--       tabela velha; é o eixo vigência.
--   2º  se a adesão é ANTERIOR a qualquer versão registrada (na bancada há
--       adesões de 2017 e a versão mais antiga do VR começa em 2024), a versão
--       mais ANTIGA que existe daquele benefício. É a tabela mais próxima do
--       começo que o banco de fato guarda — continua sendo número do banco, e
--       nunca a tabela de hoje.
--   3º  se nem isso existe, a linha fica nula e a conferência logo abaixo
--       ABORTA com os ids. Benefício sem nenhuma versão com valor é um banco
--       que não sabe quanto aquilo custa, e adivinhar seria inventar dinheiro.
--
-- `atualizado_em` não entra no SET: o trigger `adesao_tocar` (0009) continua
-- ligado e é ele que carimba a hora. Escrever aqui seria escrever duas vezes.
WITH referencia AS (
  SELECT a.id AS adesao_id,
         COALESCE(
           (SELECT v.valor_padrao
              FROM rh.regra_elegibilidade_versao v
             WHERE v.beneficio_id = a.beneficio_id
               AND v.valor_padrao IS NOT NULL
               AND v.inicio_vigencia <= a.inicio
               AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= a.inicio)
             ORDER BY v.inicio_vigencia DESC, v.id DESC
             LIMIT 1),
           (SELECT v.valor_padrao
              FROM rh.regra_elegibilidade_versao v
             WHERE v.beneficio_id = a.beneficio_id
               AND v.valor_padrao IS NOT NULL
             ORDER BY v.inicio_vigencia ASC, v.id ASC
             LIMIT 1)
         ) AS valor_ref,
         COALESCE(
           (SELECT v.desconto_padrao
              FROM rh.regra_elegibilidade_versao v
             WHERE v.beneficio_id = a.beneficio_id
               AND v.desconto_padrao IS NOT NULL
               AND v.inicio_vigencia <= a.inicio
               AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= a.inicio)
             ORDER BY v.inicio_vigencia DESC, v.id DESC
             LIMIT 1),
           (SELECT v.desconto_padrao
              FROM rh.regra_elegibilidade_versao v
             WHERE v.beneficio_id = a.beneficio_id
               AND v.desconto_padrao IS NOT NULL
             ORDER BY v.inicio_vigencia ASC, v.id ASC
             LIMIT 1)
         ) AS desconto_ref
    FROM rh.adesao a
   WHERE a.valor IS NULL OR a.desconto IS NULL
)
UPDATE rh.adesao a
   SET valor    = COALESCE(a.valor, ref.valor_ref),
       desconto = COALESCE(a.desconto, ref.desconto_ref)
  FROM referencia ref
 WHERE ref.adesao_id = a.id
   AND ((a.valor IS NULL AND ref.valor_ref IS NOT NULL)
     OR (a.desconto IS NULL AND ref.desconto_ref IS NOT NULL));

ALTER TABLE rh.adesao ENABLE TRIGGER adesao_congelar;

-- ---------------------------------------------------------------- a conferência que decide
-- Parar aqui é o comportamento certo: uma adesão sem valor é uma pessoa cujo
-- benefício ninguém sabe quanto custa nem quanto desconta em folha. Quem
-- resolve isso é o DP, olhando o caso — não um DEFAULT nesta migration.
DO $$
DECLARE
  orfas  BIGINT;
  ids    TEXT;
BEGIN
  SELECT count(*), string_agg(id::text, ', ' ORDER BY id)
    INTO orfas, ids
    FROM rh.adesao
   WHERE valor IS NULL OR desconto IS NULL;
  IF orfas > 0 THEN
    RAISE EXCEPTION
      '% adesão(ões) continuam sem valor ou sem desconto e a regra da época não '
      'explica o número. Ids: %. Preencha pela tela (DP → Gerir adesões) e '
      'rode a migration de novo — esta migration não inventa dinheiro.',
      orfas, ids;
  END IF;
END;
$$;

-- ---------------------------------------------------------------- a porta fecha
ALTER TABLE rh.adesao ALTER COLUMN valor    SET NOT NULL;
ALTER TABLE rh.adesao ALTER COLUMN desconto SET NOT NULL;

COMMENT ON COLUMN rh.adesao.valor IS
  'Valor DESTA PESSOA neste benefício, escolhido por quem concedeu. NOT NULL '
  'desde a 0055: NULL significava "segue o padrão da regra", e era por esse '
  'silêncio que o valor de tabela virava o valor de todo mundo (190 das 333 '
  'adesões de 2026-08 tinham valor único no benefício). A regra vigente '
  'continua dando a SUGESTÃO — a tela a preenche e a marca como sugestão.';
COMMENT ON COLUMN rh.adesao.desconto IS
  'Desconto em folha DESTA PESSOA. NOT NULL desde a 0055. Sem desconto é 0 '
  'escolhido, não ausência: a folha filtra por `desconto > 0`, então zero e '
  'nulo davam o mesmo resultado no cálculo e resultados diferentes na '
  'pergunta "alguém decidiu isto?".';

COMMENT ON COLUMN rh.regra_elegibilidade_versao.valor_padrao IS
  'SUGESTÃO de valor ao conceder, não valor aplicado. Desde a 0055 a regra '
  'deixou de ser portão (a pessoa já entra com direito — onda H1): ela não '
  'barra concessão nem preenche adesão sozinha. Continua versionada com '
  'vigência porque é ela que explica quanto valia a tabela em cada data.';
COMMENT ON COLUMN rh.regra_elegibilidade_versao.desconto_padrao IS
  'SUGESTÃO de desconto em folha ao conceder. Ver valor_padrao.';

COMMENT ON TABLE rh.regra_elegibilidade_versao IS
  'Tabela de referência do benefício, versionada com vigência. Desde a 0055 o '
  'critério NÃO barra mais a concessão: ele é registrado na trilha do ato '
  'quando a pessoa está fora dele, e o DP decide. Nunca foi apagada nem '
  'esvaziada — o histórico de adesões depende dela para ser lido.';

-- ---------------------------------------------------------------- provas finais
DO $$
DECLARE
  antes        RECORD;
  total        BIGINT;
  regras       BIGINT;
  nulos        BIGINT;
  valor_nn     BOOLEAN;
  desconto_nn  BOOLEAN;
BEGIN
  SELECT * INTO antes FROM prova_0055;
  SELECT count(*) INTO total  FROM rh.adesao;
  SELECT count(*) INTO regras FROM rh.regra_elegibilidade_versao;

  -- 1. nenhuma adesão sem valor
  SELECT count(*) INTO nulos
    FROM rh.adesao WHERE valor IS NULL OR desconto IS NULL;
  IF nulos <> 0 THEN
    RAISE EXCEPTION 'sobraram % adesão(ões) sem valor após o SET NOT NULL', nulos;
  END IF;

  -- 2. e o banco passa a recusar a próxima
  SELECT bool_or(attname = 'valor'    AND attnotnull),
         bool_or(attname = 'desconto' AND attnotnull)
    INTO valor_nn, desconto_nn
    FROM pg_attribute
   WHERE attrelid = 'rh.adesao'::regclass AND attnum > 0 AND NOT attisdropped;
  IF NOT COALESCE(valor_nn, FALSE) OR NOT COALESCE(desconto_nn, FALSE) THEN
    RAISE EXCEPTION 'valor/desconto de rh.adesao não ficaram NOT NULL';
  END IF;

  -- 3. nenhuma adesão foi perdida no caminho: preencher não é apagar
  IF total <> antes.adesoes THEN
    RAISE EXCEPTION
      'rh.adesao tinha % linha(s) e ficou com % — esta migration não cria nem apaga adesão',
      antes.adesoes, total;
  END IF;

  -- 4. a regra continua inteira: apagá-la era o jeito errado de tirar o portão
  IF regras <> antes.regras THEN
    RAISE EXCEPTION
      'versões de regra passaram de % para % — a 0055 rebaixa a regra a sugestão, não a apaga',
      antes.regras, regras;
  END IF;

  RAISE NOTICE
    'adesões depois da 0055: % com valor obrigatório (% preenchidas aqui), % versões de regra preservadas',
    total, antes.sem_valor + antes.sem_desconto, regras;
END;
$$;

COMMIT;
