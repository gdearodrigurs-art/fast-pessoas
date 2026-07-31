-- 0045_piso_anonimato_alcanca_clima_e_pesquisas.sql
--
-- A migration 0044 tirou o k da supressão de recorte pequeno do fonte e o
-- tornou parâmetro administrável (sistema.parametro_privacidade.minimo_por_
-- recorte). Ela fez isso pela METADE, e esta migration é o registro no banco
-- de que a outra metade foi fechada.
--
-- ====================================================================== O BURACO
--
-- O k de 0044 alcançava três lugares: diversidade e composição familiar em
-- /relatorios, e o card de diversidade do painel executivo. NÃO alcançava:
--
--   src/dominios/clima/servico.ts:37       MINIMO_RESPONDENTES_UNIDADE = 5
--   src/dominios/pesquisas/esquemas.ts:91  MINIMO_AMOSTRA = 5
--
-- As duas eram a MESMA política de privacidade, escrita de novo, em constante
-- de módulo. Medido antes de mexer, chamando os serviços que servem
-- /api/clima/agregado e /api/pesquisas/[id]/resultado com o parâmetro em 5,
-- depois em 20, depois em 2:
--
--   minimo_por_recorte = 5   clima: 5 unidades publicadas (min 9 respondentes)
--                            pesquisa 42: 0/8 perguntas e 0/5 unidades suprimidas
--                            pesquisa 43: 1/3 perguntas e 0/5 unidades suprimidas
--   minimo_por_recorte = 20  IDÊNTICO, linha por linha
--   minimo_por_recorte = 2   IDÊNTICO, linha por linha
--
-- Além de igual, o payload seguia ANUNCIANDO o número errado: o agregado de
-- clima devolvia `recorte.minimo_respondentes: 5` e o resultado da pesquisa
-- devolvia `minimo_amostra: 5` com o parâmetro em 20 — o sistema informava
-- uma política que não era a configurada.
--
-- POR QUE ESTE ERA O PIOR DOS CASOS: o dono acreditava ter mudado a política
-- de privacidade da empresa e tinha mudado metade dela. E a metade de fora era
-- justamente a pesquisa de clima e a pesquisa anual — onde a promessa de
-- anonimato é o que faz a pessoa responder a verdade. O respondente lia, antes
-- de responder, "resultados só aparecem em recortes com 5 respostas ou mais",
-- texto montado a partir da constante do fonte: com a empresa configurada em
-- 20, a tela prometia 5 e o servidor entregava 5.
--
-- ====================================================================== A ESCOLHA
--
-- UM PARÂMETRO, NÃO DOIS. Avaliei criar um segundo campo administrável só para
-- a pesquisa (a alternativa que o próprio pedido admitia) e recusei, porque a
-- razão técnica que justificaria a separação não existe: os três lugares
-- contam a MESMA coisa, PESSOAS por trás do número publicado.
--
--   relatórios         quantidade de pessoas do recorte de diversidade
--   clima (agregado)   COUNT(DISTINCT r.colaborador_id) por unidade
--   pesquisas          uma resposta por pessoa por pergunta
--
-- E o preço de errar aqui é assimétrico: dois campos administráveis
-- REPRODUZEM o defeito que esta migration corrige. O dono mexe em um, sai
-- convencido de que mudou a política inteira, e a outra metade segue
-- publicando o que ele acabou de mandar esconder — que é exatamente a
-- história da 0044. Um campo só, com a tela dizendo tudo o que ele governa.
--
-- ====================================================================== O QUE MUDA
--
-- NADA no schema, NADA nos dados: a coluna, o CHECK (2..100), o valor 5 e a
-- chave `privacidade.administrar` continuam como a 0044 os deixou. O que muda
-- é CÓDIGO (clima/servico.ts, pesquisas/esquemas.ts, pesquisas/servico.ts,
-- painel-executivo/servico.ts e as três telas) e, aqui, a DOCUMENTAÇÃO que
-- vive no banco — que a 0044 deixou descrevendo um alcance que agora está
-- errado por ser menor do que o real.
--
-- Isso não é cosmético. O COMMENT da coluna e a descricao da permissão são o
-- que a tela /perfis mostra e o que o próximo agente lê antes de decidir se
-- pode reusar o parâmetro. Documentação de controle de privacidade que
-- subdeclara o alcance é como a constante duplicada: convida a próxima pessoa
-- a criar mais uma cópia do número em vez de usar a que existe.
--
-- COM k PADRÃO NADA MUDA NA TELA. Verificado depois, com os mesmos serviços e
-- os mesmos três estados: em k=5 a saída é idêntica à de antes, byte a byte;
-- em k=20 clima cai de 5 para 0 unidades publicadas e a pesquisa 42 passa a
-- suprimir 5 de 8 perguntas e todas as unidades; em k=2 a pergunta de texto
-- livre da pesquisa 43, hoje suprimida, volta a aparecer.
--
-- FRONTEIRA QUE NÃO ENTROU AQUI, declarada de propósito:
-- `recortesPorUnidade` (src/dominios/pesquisas/repositorio.ts) conta RESPOSTAS
-- somadas por unidade, não pessoas — na pesquisa 43, que tem 2 perguntas de
-- escala, cada unidade tem 6 respostas de 3 PESSOAS e passa por um piso de 5.
-- É defeito do DENOMINADOR, não do piso, e corrigi-lo muda o que a tela
-- publica hoje (as 5 unidades da pesquisa 43 sairiam do ar). Fica separado
-- desta mudança, que é de parametrização; está no relatório da frente com a
-- medição.

BEGIN;

COMMENT ON COLUMN sistema.parametro_privacidade.minimo_por_recorte IS
  'k da supressão de recorte pequeno (k-anonimato). Recorte com 1..k-1 pessoas '
  'não é publicado em NENHUMA tela que agregue pessoas: relatórios de '
  'diversidade e composição familiar; card de diversidade e eNPS do painel '
  'executivo; agregado por unidade do check-in diário de clima; e todo recorte '
  'de resultado da pesquisa de clima, inclusive o aviso de anonimato mostrado '
  'ao respondente ANTES de responder. Piso único de propósito (0045): dois '
  'campos fariam quem mexe em um acreditar que mudou a política inteira. '
  'Mínimo 2 porque k=1 seria desligar a proteção parecendo configuração.';

COMMENT ON TABLE sistema.parametro_privacidade IS
  'Números da política de privacidade do dono do sistema, administráveis por '
  'tela em vez de escritos no fonte. Linha única (id = 1): relatório agregado '
  'não tem competência a reproduzir, então não há vigência a versionar — quem '
  'mudou e quando fica em audit.alteracao. Antes de acrescentar coluna aqui, '
  'confira se o número novo não é o MESMO piso com outro nome: foi assim que '
  'clima e pesquisas ficaram de fora até a 0045.';

-- A descrição é o texto que /perfis mostra ao lado da chave. "dos relatórios
-- agregados" subdeclarava: quem lê a tela precisa saber que baixar este número
-- publica também recorte de pesquisa de clima.
UPDATE sistema.permissao
   SET descricao = 'Alterar o piso de anonimato (k) de todo recorte agregado '
                   '— relatórios, painel executivo, clima e pesquisas'
 WHERE chave = 'privacidade.administrar';

-- exige_2fa continua TRUE (0044) e a chave continua só em `admin`, que já
-- exigia segundo fator antes: NENHUM fluxo de login muda com esta migration.

COMMIT;
