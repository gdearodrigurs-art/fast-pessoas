-- 0046_pessoa_e_vinculo.sql
-- A PESSOA passa a existir separada do VÍNCULO de trabalho.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Palavra do dono do sistema, na reunião: "ele demite e recontrata na outra
-- empresa, mas não queria perder os dados e histórico". A Fast tem 4 CNPJs
-- (Supply, DCS, Casa do Montador e um quarto ainda não nomeado) e move gente
-- entre eles por desligamento + nova admissão. Hoje isso é IMPOSSÍVEL de
-- registrar aqui, e não por falta de tela: é o schema que proíbe.
--
--     rh.colaborador.cpf CHAR(11) NOT NULL UNIQUE     (migration 0001, linha 62)
--
-- O CPF é ÚNICO na tabela do vínculo. Ou seja: uma pessoa só pode aparecer uma
-- vez no sistema inteiro. A segunda admissão da mesma pessoa — que é o caso
-- real e recorrente do dono — bate em `colaborador_cpf_key` e não entra. A
-- saída que a operação encontraria sozinha (editar a ficha antiga e mudar a
-- empresa) é justamente a que APAGA o histórico que ele não quer perder: a
-- admissão anterior, o desligamento, o tempo de casa no primeiro CNPJ.
--
-- Também havia um segundo trinco, menos visível:
--
--     rh.colaborador.usuario_id BIGINT NOT NULL UNIQUE  (migration 0001, linha 58)
--
-- Um login por VÍNCULO. Duas admissões da mesma pessoa exigiriam dois logins
-- para a mesma gente — dois e-mails, duas senhas, dois 2FA, duas caixas de
-- notificação. Errado: conta de acesso é da PESSOA, não do contrato.
--
-- ====================================================================== O DESENHO
-- A pessoa entra POR CIMA, não substitui embaixo.
--
--     rh.pessoa       o ser humano.   CPF único mora AQUI agora.
--     rh.colaborador  o VÍNCULO.      Ganha pessoa_id. Perde o UNIQUE do CPF.
--     as outras 32    INTOCADAS.      Continuam apontando para rh.colaborador.
--
-- Medi antes de decidir: são 34 chaves estrangeiras, em 32 tabelas, apontando
-- para rh.colaborador — ponto, folha, férias, ASO, avaliação, benefícios,
-- lotação, posição, banco de horas. TODAS são fatos do CONTRATO, não da
-- pessoa: a marcação de ponto de terça, o holerite de março, o período
-- aquisitivo de férias e o ASO admissional pertencem ao vínculo que os gerou,
-- e continuam pertencendo mesmo quando a pessoa é readmitida em outro CNPJ. Se
-- essas FKs subissem para a pessoa, a folha de dois contratos simultâneos
-- viraria uma só — que é um erro pior do que o que estamos consertando. Por
-- isso elas ficam onde estão, e esta migration não toca em nenhuma delas.
--
-- O QUE SOBE PARA A PESSOA — campo a campo, lendo rh.colaborador inteiro
--
--   cpf              SOBE.  É a definição do problema. O CPF identifica o ser
--                           humano perante a Receita; é o mesmo em qualquer
--                           CNPJ do grupo. UNIQUE passa a viver em rh.pessoa.
--   nome_completo    SOBE.  Ninguém troca de nome ao trocar de contrato. E se
--                           trocar (casamento), tem que trocar nos dois.
--   data_nascimento  SOBE.  Fato biológico da pessoa.
--   genero           SOBE.  Autodeclarado pela PESSOA, não pelo contrato.
--   retrato          SOBE.  Apesar do nome, não é foto: é o texto "Retrato
--                           atual" da ficha — como a pessoa está hoje, escrito
--                           pelo RH. É exatamente o "dado que ele não queria
--                           perder" na recontratação.
--   contexto         SOBE.  "Contexto histórico" na ficha. Mesmo argumento,
--                           mais forte ainda: é a história da pessoa. Perder
--                           isso na readmissão seria perder o motivo da onda.
--
--   matricula          FICA. É o número do registro NAQUELA empresa. Duas
--                           admissões, duas matrículas — é o que o DP espera.
--   matricula_esocial  FICA. Vinculada ao CNPJ empregador (RET do eSocial).
--   tipo_vinculo       FICA. CLT na Supply, PJ na DCS: é do contrato.
--   data_admissao      FICA. Data DAQUELE contrato.
--   status             FICA. Um vínculo pode estar desligado e o outro ativo —
--                           a pessoa não tem status, os contratos dela têm.
--   data_desligamento  FICA. Idem.
--   usuario_id         VIRA DERIVADA (ver abaixo).
--
-- ================================================== O CPF SOME DE rh.colaborador?
-- DECISÃO: NÃO some. Vira LEITURA DA PESSOA — coluna projetada, mantida por
-- trigger, impossível de divergir. O mesmo vale para nome_completo,
-- data_nascimento, genero, retrato, contexto e usuario_id.
--
-- POR QUE assim, e não apagando as colunas:
--   1. A verdade fica em UM lugar só. rh.pessoa é a fonte; um trigger BEFORE
--      INSERT/UPDATE em rh.colaborador SOBRESCREVE essas colunas com o valor da
--      pessoa a cada escrita. Não é "copiar e torcer": é impossível gravar um
--      nome no vínculo diferente do nome da pessoa, mesmo por SQL direto no
--      banco. Quem tentar, escreve e o trigger corrige na mesma instrução.
--   2. `SELECT c.nome_completo FROM rh.colaborador c` aparece em 145 arquivos
--      do fonte. Apagar a coluna agora significaria reescrever consulta em
--      ponto, folha, SST, recrutamento, avaliação, clima e portais NA MESMA
--      migration que mexe no login de todo mundo. Duas mudanças grandes de uma
--      vez, e a segunda escondendo os erros da primeira.
--   3. Isto é o EXPAND do expand/contract. O CONTRACT (apagar as projeções e
--      trocar por JOIN em rh.pessoa) é trabalho de outra onda, e agora ele é
--      possível: dá para migrar consulta por consulta com o banco consistente
--      o tempo inteiro. O que NÃO dava para adiar era o UNIQUE — esse sai hoje.
--
-- E o usuario_id: a verdade passa a ser `sistema.usuario.pessoa_id` (UNIQUE:
-- uma conta por gente). `rh.colaborador.usuario_id` continua existindo como
-- projeção — "a conta da pessoa deste vínculo" — e por isso PERDE o UNIQUE e o
-- NOT NULL: os dois vínculos da mesma pessoa apontam para a MESMA conta, e uma
-- pessoa pode não ter conta nenhuma. Consequência prática, e é a boa: todas as
-- consultas que já faziam `WHERE gc.usuario_id = $1` para descobrir "os
-- liderados de quem está logado" continuam certas e passam a valer para os
-- DOIS vínculos da pessoa, sem uma linha de código alterada.
--
-- O que precisou mudar no fonte foram só as consultas do tipo "QUAL é o meu
-- vínculo" (`SELECT id FROM rh.colaborador WHERE usuario_id = $1`), que com
-- dois contratos devolveriam duas linhas. Essas passam a chamar
-- rh.vinculo_atual($1), definido aqui.
--
-- ============================================================ A LINHA DO TEMPO
-- rh.evento_colaborador aponta para o VÍNCULO e continua apontando — cada fato
-- nasceu num contrato e é dele. Mas a pergunta da ficha é sobre a PESSOA
-- ("o que aconteceu com a Ana?"), e a resposta tem que atravessar os dois
-- contratos dela. Para isso existe a view rh.evento_da_pessoa, que soma os
-- eventos de todos os vínculos da pessoa e IDENTIFICA o vínculo em cada linha
-- (vinculo_id + vinculo_matricula), para a ficha poder dizer "isto aconteceu
-- na matrícula 1042, aquilo na 2311".
--
-- ================================================================ NADA MUDA HOJE
-- Estado antes desta migration: 70 colaboradores, 70 CPFs distintos, 71
-- usuários (1 conta de sistema sem ficha), 853 eventos. Depois: 70 pessoas,
-- 70 vínculos, 71 usuários (70 com pessoa_id), 853 eventos. Cada colaborador
-- de hoje vira exatamente uma pessoa, e cada pessoa tem exatamente um vínculo.
-- Nenhuma tela muda de conteúdo — o que muda é o que passa a SER POSSÍVEL.

BEGIN;

-- ---------------------------------------------------------------- a pessoa
CREATE TABLE rh.pessoa (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- É AQUI que o CPF é único agora. Uma linha por ser humano.
  cpf              CHAR(11) NOT NULL UNIQUE
                   CHECK (cpf ~ '^[0-9]{11}$'),
  nome_completo    TEXT NOT NULL,
  data_nascimento  DATE CHECK (data_nascimento IS NULL
                               OR data_nascimento > DATE '1900-01-01'),
  genero           TEXT NOT NULL DEFAULT 'nao_informado'
                   CHECK (genero IN ('feminino','masculino','outro','nao_informado')),
  -- Texto, não imagem: é o "Retrato atual" da ficha.
  retrato          TEXT,
  contexto         TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER pessoa_tocar BEFORE UPDATE ON rh.pessoa
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE rh.pessoa IS
  'O ser humano. CPF único mora aqui. rh.colaborador é o VÍNCULO dela com uma '
  'das empresas do grupo — a mesma pessoa pode ter vários.';

-- A regra "nascimento anterior à admissão" continua no CHECK de
-- rh.colaborador, onde as duas datas convivem. Em rh.pessoa não existe
-- admissão para comparar; aqui a guarda é só de plausibilidade.

-- ---------------------------------------------------------------- o vínculo aponta para a pessoa
ALTER TABLE rh.colaborador
  ADD COLUMN pessoa_id BIGINT REFERENCES rh.pessoa (id);

-- ---------------------------------------------------------------- backfill
-- Cada colaborador de hoje é uma pessoa. Ordem por id para o número da pessoa
-- acompanhar a ordem histórica das fichas.
INSERT INTO rh.pessoa
  (cpf, nome_completo, data_nascimento, genero, retrato, contexto, criado_em)
SELECT c.cpf, c.nome_completo, c.data_nascimento, c.genero, c.retrato,
       c.contexto, c.criado_em
  FROM rh.colaborador c
 ORDER BY c.id;

UPDATE rh.colaborador c
   SET pessoa_id = p.id
  FROM rh.pessoa p
 WHERE p.cpf = c.cpf;

ALTER TABLE rh.colaborador ALTER COLUMN pessoa_id SET NOT NULL;
CREATE INDEX colaborador_por_pessoa ON rh.colaborador (pessoa_id);

-- Prova dentro da própria transação: se o backfill deixar órfão, a migration
-- não passa — não existe estado meio migrado.
DO $$
DECLARE
  orfaos   BIGINT;
  vinculos BIGINT;
  pessoas  BIGINT;
BEGIN
  SELECT count(*) INTO orfaos   FROM rh.colaborador WHERE pessoa_id IS NULL;
  SELECT count(*) INTO vinculos FROM rh.colaborador;
  SELECT count(*) INTO pessoas  FROM rh.pessoa;
  IF orfaos <> 0 THEN
    RAISE EXCEPTION 'backfill deixou % vínculo(s) sem pessoa', orfaos;
  END IF;
  IF pessoas <> vinculos THEN
    RAISE EXCEPTION 'backfill: % pessoas para % vínculos (esperado 1 para 1)',
      pessoas, vinculos;
  END IF;
END;
$$;

-- ---------------------------------------------------------------- o trinco que saiu
-- ESTA é a linha que impedia a recontratação em outro CNPJ.
ALTER TABLE rh.colaborador DROP CONSTRAINT colaborador_cpf_key;

-- ---------------------------------------------------------------- a conta é da pessoa
ALTER TABLE sistema.usuario
  ADD COLUMN pessoa_id BIGINT UNIQUE REFERENCES rh.pessoa (id);

COMMENT ON COLUMN sistema.usuario.pessoa_id IS
  'Uma conta por gente. NULL = conta de sistema, sem ficha no quadro.';

UPDATE sistema.usuario u
   SET pessoa_id = c.pessoa_id
  FROM rh.colaborador c
 WHERE c.usuario_id = u.id;

-- Um login por VÍNCULO era o segundo trinco. Sai o UNIQUE e sai o NOT NULL:
-- os dois contratos da mesma pessoa passam a apontar para a MESMA conta.
ALTER TABLE rh.colaborador DROP CONSTRAINT colaborador_usuario_id_key;
ALTER TABLE rh.colaborador ALTER COLUMN usuario_id DROP NOT NULL;

-- ---------------------------------------------------------------- funções de resolução
-- A pessoa de quem está logado (NULL para conta de sistema).
CREATE FUNCTION rh.pessoa_do_usuario(p_usuario_id BIGINT)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT u.pessoa_id FROM sistema.usuario u WHERE u.id = p_usuario_id
$$;

-- A conta de acesso de uma pessoa (NULL quando ela não tem login).
CREATE FUNCTION sistema.usuario_da_pessoa(p_pessoa_id BIGINT)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT u.id FROM sistema.usuario u WHERE u.pessoa_id = p_pessoa_id
$$;

-- O vínculo que responde por "eu" quando quem está logado tem mais de um.
-- Regra: vínculo NÃO desligado ganha do desligado; entre os empatados, o de
-- admissão mais recente. Com um vínculo só — o caso de hoje — devolve
-- exatamente o mesmo id que `WHERE usuario_id = $1` devolvia.
CREATE FUNCTION rh.vinculo_atual(p_usuario_id BIGINT)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT c.id
    FROM rh.colaborador c
   WHERE c.pessoa_id = rh.pessoa_do_usuario(p_usuario_id)
   ORDER BY (c.status = 'desligado'), c.data_admissao DESC, c.id DESC
   LIMIT 1
$$;

COMMENT ON FUNCTION rh.vinculo_atual(BIGINT) IS
  'Vínculo corrente de quem está logado. Use no lugar de '
  '"SELECT id FROM rh.colaborador WHERE usuario_id = $1", que devolve N linhas '
  'quando a pessoa tem mais de um contrato.';

-- Todos os vínculos de uma pessoa, do mais antigo ao mais novo.
CREATE FUNCTION rh.vinculos_da_pessoa(p_pessoa_id BIGINT)
RETURNS TABLE (
  id                 BIGINT,
  matricula          TEXT,
  tipo_vinculo       TEXT,
  status             TEXT,
  data_admissao      DATE,
  data_desligamento  DATE
) LANGUAGE sql STABLE AS $$
  SELECT c.id, c.matricula, c.tipo_vinculo, c.status,
         c.data_admissao, c.data_desligamento
    FROM rh.colaborador c
   WHERE c.pessoa_id = p_pessoa_id
   ORDER BY c.data_admissao, c.id
$$;

-- ---------------------------------------------------------------- projeção pessoa -> vínculo
-- A verdade é rh.pessoa. Estas colunas em rh.colaborador são LEITURA dela.
-- O trigger roda BEFORE: o que vier na instrução é descartado e substituído
-- pelo valor da pessoa. Não existe caminho para divergir — nem pela aplicação,
-- nem por UPDATE manual no banco.
CREATE FUNCTION rh.projetar_pessoa_no_vinculo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p rh.pessoa%ROWTYPE;
BEGIN
  SELECT * INTO p FROM rh.pessoa WHERE id = NEW.pessoa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vínculo sem pessoa: pessoa_id % não existe', NEW.pessoa_id;
  END IF;
  NEW.cpf             := p.cpf;
  NEW.nome_completo   := p.nome_completo;
  NEW.data_nascimento := p.data_nascimento;
  NEW.genero          := p.genero;
  NEW.retrato         := p.retrato;
  NEW.contexto        := p.contexto;
  NEW.usuario_id      := sistema.usuario_da_pessoa(p.id);
  RETURN NEW;
END;
$$;

-- Nome com "projetar" para ordenar ANTES de colaborador_tocar (o Postgres
-- dispara triggers BEFORE de mesma linha em ordem alfabética de nome).
CREATE TRIGGER colaborador_projetar_pessoa
  BEFORE INSERT OR UPDATE ON rh.colaborador
  FOR EACH ROW EXECUTE FUNCTION rh.projetar_pessoa_no_vinculo();

-- Mudou na pessoa, desce para todos os vínculos dela. O UPDATE abaixo não
-- muda coluna nenhuma de propósito: quem preenche é o trigger BEFORE acima,
-- de uma fonte só. Sem recursão — o caminho é pessoa -> vínculo e para aí.
CREATE FUNCTION rh.repropagar_pessoa() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE rh.colaborador SET pessoa_id = pessoa_id WHERE pessoa_id = NEW.id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER pessoa_repropagar
  AFTER UPDATE ON rh.pessoa
  FOR EACH ROW
  WHEN (OLD.cpf             IS DISTINCT FROM NEW.cpf
     OR OLD.nome_completo   IS DISTINCT FROM NEW.nome_completo
     OR OLD.data_nascimento IS DISTINCT FROM NEW.data_nascimento
     OR OLD.genero          IS DISTINCT FROM NEW.genero
     OR OLD.retrato         IS DISTINCT FROM NEW.retrato
     OR OLD.contexto        IS DISTINCT FROM NEW.contexto)
  EXECUTE FUNCTION rh.repropagar_pessoa();

-- Conta criada, apagada da pessoa ou remanejada: os vínculos das duas pessoas
-- envolvidas reprojetam o usuario_id.
CREATE FUNCTION sistema.repropagar_conta_da_pessoa() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE rh.colaborador
     SET pessoa_id = pessoa_id
   WHERE pessoa_id IN (
     NEW.pessoa_id,
     CASE WHEN TG_OP = 'UPDATE' THEN OLD.pessoa_id END
   );
  RETURN NULL;
END;
$$;

CREATE TRIGGER usuario_repropagar_conta
  AFTER INSERT OR UPDATE OF pessoa_id ON sistema.usuario
  FOR EACH ROW EXECUTE FUNCTION sistema.repropagar_conta_da_pessoa();

-- ---------------------------------------------------------------- linha do tempo da PESSOA
-- rh.evento_colaborador continua append-only e continua apontando para o
-- vínculo. Esta view não move fato nenhum: só permite ler a história inteira
-- da pessoa com o vínculo identificado em cada linha.
CREATE VIEW rh.evento_da_pessoa AS
SELECT c.pessoa_id,
       e.colaborador_id        AS vinculo_id,
       c.matricula             AS vinculo_matricula,
       c.data_admissao         AS vinculo_admissao,
       c.data_desligamento     AS vinculo_desligamento,
       e.id,
       e.tipo,
       e.ocorrido_em,
       e.origem_tabela,
       e.origem_id,
       e.resumo,
       e.payload,
       e.registrado_por,
       e.registrado_em
  FROM rh.evento_colaborador e
  JOIN rh.colaborador c ON c.id = e.colaborador_id;

COMMENT ON VIEW rh.evento_da_pessoa IS
  'Linha do tempo que ATRAVESSA vínculos: os eventos de todos os contratos da '
  'mesma pessoa, com o vínculo identificado em cada linha.';

-- Reprojeta as 70 fichas existentes pelo trigger, para o banco terminar esta
-- migration no mesmo estado em que terminaria qualquer escrita futura.
UPDATE rh.colaborador SET pessoa_id = pessoa_id;

-- Prova final, dentro da transação.
DO $$
DECLARE
  divergentes BIGINT;
  sem_conta   BIGINT;
BEGIN
  SELECT count(*) INTO divergentes
    FROM rh.colaborador c JOIN rh.pessoa p ON p.id = c.pessoa_id
   WHERE c.cpf IS DISTINCT FROM p.cpf
      OR c.nome_completo IS DISTINCT FROM p.nome_completo
      OR c.data_nascimento IS DISTINCT FROM p.data_nascimento
      OR c.genero IS DISTINCT FROM p.genero
      OR c.retrato IS DISTINCT FROM p.retrato
      OR c.contexto IS DISTINCT FROM p.contexto;
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'projeção divergente em % vínculo(s)', divergentes;
  END IF;
  SELECT count(*) INTO sem_conta FROM rh.colaborador WHERE usuario_id IS NULL;
  IF sem_conta <> 0 THEN
    RAISE EXCEPTION '% vínculo(s) perderam a conta de acesso na projeção',
      sem_conta;
  END IF;
END;
$$;

COMMIT;
