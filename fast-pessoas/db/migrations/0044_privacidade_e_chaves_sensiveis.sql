-- 0044_privacidade_e_chaves_sensiveis.sql
-- Duas coisas que a política de privacidade do dono precisava e não tinha: o
-- PISO DE ANONIMATO deixa de ser constante no fonte e vira parâmetro
-- administrável, e três chaves que já geram trilha de leitura sensível passam a
-- ser declaradas como sensíveis também no banco.
--
-- ====================================================================== PARTE 1
-- O k DA SUPRESSÃO DE RECORTE PEQUENO SAI DO CÓDIGO
--
-- POR QUE ESTA PARTE EXISTE
-- src/dominios/colaboradores/esquemas.ts:410 trazia
--
--     export const MINIMO_POR_RECORTE = 5;
--
-- e dois serviços liam essa constante para SUPRIMIR recorte pequeno:
--   src/dominios/colaboradores/servico.ts    → relatórios de diversidade e de
--                                              composição familiar (/relatorios)
--   src/dominios/painel-executivo/servico.ts → card de diversidade e a série de
--                                              "% de mulheres no quadro"
--
-- Esse 5 não é detalhe de implementação: é a POLÍTICA DE PRIVACIDADE da empresa
-- ("não publico recorte que identifique alguém"), e é a que muda com o tamanho
-- do quadro. Num quadro de 68 pessoas, k=5 é confortável; numa empresa de 900,
-- o DP pode querer 10; num piloto de 12, k=5 esconde o relatório inteiro e o
-- responsável talvez aceite 3 sob outro controle. Nenhum desses ajustes deveria
-- exigir alterar o fonte, buildar e publicar — é exatamente o caso da regra do
-- dono: número de negócio não fica chumbado no código.
--
-- ONDE ELE PASSA A MORAR
-- Em sistema.parametro_privacidade, linha única (CHECK id = 1). Escolhi linha
-- única, e NÃO uma tabela versionada por vigência como
-- rh_folha.parametro_folha_versao, por uma diferença real entre os dois casos:
-- parâmetro de folha precisa de vigência porque a folha de 04/2026 tem de
-- continuar reproduzível com os números de 04/2026. Relatório agregado não tem
-- competência: ele é sempre "posição de agora", recalculado a cada abertura da
-- tela. Guardar histórico de vigência do k daria a impressão de que existe um
-- relatório antigo a reproduzir — e não existe. Quem mudou e quando fica na
-- trilha (audit.alteracao), que é onde essa pergunta é de fato feita.
--
-- Tabela com COLUNA NOMEADA, não chave/valor em texto: o CHECK mora no banco
-- (2..100), o tipo é INTEGER de verdade, e o dia em que o segundo número de
-- privacidade migrar para cá ele ganha coluna própria com o CHECK dele.
--
-- O PISO DO PISO — por que o CHECK começa em 2 e não em 1
-- k=1 não suprime nada: seria desligar a proteção por um caminho que parece
-- configuração. Se algum dia o dono quiser publicar recorte de uma pessoa, isso
-- é uma decisão de outro tamanho, e tem que ser escrita como tal — não digitada
-- num campo numérico. O teto de 100 existe pela razão simétrica: k gigante zera
-- todo relatório e faria a tela parecer quebrada.
--
-- NADA MUDA HOJE
-- A linha nasce com minimo_por_recorte = 5, o mesmo número que estava no fonte.
-- Diversidade, composição familiar e o card do painel executivo devolvem
-- exatamente o que devolviam. Verificado rodando os três relatórios antes e
-- depois e comparando o JSON inteiro.
--
-- QUEM PODE MEXER
-- Chave nova `privacidade.administrar`, concedida só ao papel `admin`. Ela não
-- ABRE dado nenhum — por isso NÃO entra em CHAVES_SENSIVEIS (o selo de
-- "sensível" da tela /perfis quer dizer "esta chave mostra dado de pessoa", e
-- esta não mostra). Mas ela administra a proteção que cobre todo mundo: baixar
-- o k publica recorte que hoje está suprimido. É a mesma categoria (iii) da
-- migration 0040 — administração do próprio controle —, onde já estão
-- perfil.administrar, usuario.administrar e rh.auditar, todas com exige_2fa
-- TRUE e nenhuma delas em CHAVES_SENSIVEIS. Segue o mesmo par: exige_2fa TRUE
-- aqui, fora do TypeScript.
-- Efeito no login: NENHUM. O único papel que a recebe é `admin`, que já exigia
-- segundo fator antes desta migration (tem perfil.administrar).
--
-- ====================================================================== PARTE 2
-- TRÊS CHAVES QUE JÁ ERAM SENSÍVEIS NA PRÁTICA E NÃO ESTAVAM NA LISTA
--
-- A régua é a que a própria lista escreve em src/dominios/usuarios/esquemas.ts:
--   (a) autoriza leitura de dado pessoal identificável — na prática, a leitura
--       grava audit.leitura_sensivel com esta chave em `chave_permissao`;
--   (b) dá alcance de EMPRESA INTEIRA sobre dado de pessoa.
--
--   adesao.gerir  e  beneficio.ver   → porta (a), literal.
--     src/dominios/beneficios/servico.ts:1044, ao ler DEPENDENTES de quem não é
--     o titular da sessão:
--         chavePermissao: pode.gerir ? "adesao.gerir" : "beneficio.ver"
--     Dependente é dado de TERCEIRO (nome, nascimento, parentesco, CPF) e é
--     categoria especial por inferência — composição familiar. O domínio já
--     tratava a leitura como sensível o bastante para deixar trilha; a lista era
--     o único lugar que discordava. Chave que gera trilha de leitura sensível e
--     não é marcada como sensível é contradição dentro do mesmo sistema.
--
--   afastamento.ver → porta (b).
--     Descrição no banco: "Ver afastamentos de todos os colaboradores". O
--     DETALHE clínico já está protegido por afastamento.saude.ver (na lista
--     desde sempre), e src/dominios/afastamentos/esquemas.ts:29 troca até o TIPO
--     pelo rótulo genérico para quem não a tem — mas o que sobra ainda é "quem
--     está afastado, desde quando, por quantos dias", da empresa inteira. Isso
--     revela saúde por inferência: um afastamento de 90 dias não precisa de CID
--     para dizer o que diz. É o mesmo raciocínio de volume que a 0040 usou para
--     rh.colaborador.ver.todos e documento.ver.todos.
--
-- FRONTEIRA AVALIADA E RECUSADA: movimentacao.solicitar
--   Ela aparece como chave_permissao em DOIS pontos de trilha
--   (src/dominios/demandas/servico.ts:410 e :880), o que à primeira vista a
--   encaixa na porta (a). Olhando o que cada ponto faz, não encaixa:
--
--   :410  chavePermissao: pode.ver_salario ? "rh.posicao.ver" : "movimentacao.solicitar"
--         Duas linhas acima (:398) está quem de fato autoriza:
--           const veValor = pode.ver_salario || souSolicitante;
--         Quem cai no ramo `movimentacao.solicitar` é o SOLICITANTE relendo o
--         salário que ELE MESMO digitou na proposta. A chave ali é o RÓTULO
--         gravado na trilha, não a autorização — a autorização é a autoria. Ler
--         de volta o que você acabou de escrever não é concessão de leitura
--         sobre dado de terceiro.
--
--   :880  faixaDoCargoDestino — lê rh.cargo.faixa_salarial. É dado de
--         REMUNERAÇÃO, mas do CARGO, não de uma pessoa identificável: é a banda
--         da tabela salarial, o mesmo número que aparece no RCF. Remuneração de
--         PESSOA já tem chave própria e já está marcada: rh.posicao.ver e
--         rh.posicao.editar.
--
--   Porta (b) também não: o alcance de movimentacao.solicitar são os LIDERADOS
--   VIGENTES (listarAlvosPossiveis com emNomeDoLider = false). Alcance de EQUIPE
--   é justamente o que a lista deixa de fora de propósito — a fronteira que a
--   0039 desenhou e que a 0040 repetiu ao manter rh.colaborador.ver fora.
--
--   E o preço de errar aqui não é zero. Medido neste banco, ANTES de decidir:
--
--     papel        candidata que possui              exige 2FA hoje
--     diretoria    movimentacao.solicitar            SIM
--     dp           as quatro                         SIM
--     rh           afastamento.ver, beneficio.ver,
--                  movimentacao.solicitar            SIM
--     gestor       movimentacao.solicitar            NÃO   ← 6 contas
--
--   As três chaves da PARTE 2 só existem em papéis que JÁ exigem segundo fator:
--   ninguém muda de fluxo de login. movimentacao.solicitar é a única que vive
--   também em `gestor` — 6 usuários, nenhum com totp_secret, hoje entrando só
--   com senha. Marcá-la mandaria os seis para o enrolamento de 2FA, incluindo a
--   persona gestor@fastdemo.local, que a documentação da demo descreve como "só
--   senha". Pagar isso por uma chave que falha nas duas portas seria redefinir o
--   critério da lista por acidente.
--
--   SE o dono quiser gestor com segundo fator, o caminho existe e é outro:
--   UPDATE sistema.permissao SET exige_2fa = TRUE WHERE chave =
--   'movimentacao.solicitar'. A 0040 separou de propósito "chave que exige 2FA"
--   (conjunto MAIOR) de "chave sensível" (o selo da tela), e é essa separação
--   que permite elevar a PROTEÇÃO sem mentir sobre o que a chave ABRE. Não foi
--   aplicado aqui: mudaria o login de 6 pessoas e isso é decisão do dono.
--
-- ESTA MIGRATION NÃO MUDA NENHUM FLUXO DE LOGIN. Conferido por SQL depois de
-- aplicar: os mesmos seis papéis de antes (rh, recrutador, lider_td, dp,
-- diretoria, admin) exigem segundo fator; gestor e funcionario seguem entrando
-- só com senha.

BEGIN;

-- ---------------------------------------------------------------- parte 1

CREATE TABLE sistema.parametro_privacidade (
  id                 SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  minimo_por_recorte INTEGER      NOT NULL DEFAULT 5
                                  CHECK (minimo_por_recorte BETWEEN 2 AND 100),
  atualizado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_por     BIGINT       REFERENCES sistema.usuario (id)
);

COMMENT ON TABLE sistema.parametro_privacidade IS
  'Números da política de privacidade do dono do sistema, administráveis por '
  'tela em vez de escritos no fonte. Linha única (id = 1): relatório agregado '
  'não tem competência a reproduzir, então não há vigência a versionar — quem '
  'mudou e quando fica em audit.alteracao.';

COMMENT ON COLUMN sistema.parametro_privacidade.minimo_por_recorte IS
  'k da supressão de recorte pequeno (k-anonimato). Recorte com 1..k-1 pessoas '
  'não é publicado nos relatórios agregados de diversidade e composição '
  'familiar e no card de diversidade do painel executivo. Mínimo 2 porque k=1 '
  'seria desligar a proteção parecendo configuração.';

INSERT INTO sistema.parametro_privacidade (id, minimo_por_recorte)
VALUES (1, 5);

INSERT INTO sistema.permissao (chave, descricao, exige_2fa) VALUES
  ('privacidade.administrar',
   'Alterar o piso de anonimato (k) dos relatórios agregados',
   TRUE);

INSERT INTO sistema.papel_permissao (papel, chave)
SELECT 'admin', 'privacidade.administrar'
 WHERE EXISTS (SELECT 1 FROM sistema.papel_permissao WHERE papel = 'admin');

-- ---------------------------------------------------------------- parte 2

UPDATE sistema.permissao SET exige_2fa = TRUE WHERE chave IN (
  'adesao.gerir',
  'beneficio.ver',
  'afastamento.ver'
);

COMMIT;
