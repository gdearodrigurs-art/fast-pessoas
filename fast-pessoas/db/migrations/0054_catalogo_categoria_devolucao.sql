-- 0054_catalogo_categoria_devolucao.sql — a categoria do item de devolução vira
-- catálogo administrável pela tela, com inativação em vez de exclusão.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Palavra do dono, testando o desligamento: os ativos que a empresa entrega e
-- cobra de volta são CARROS, DESKTOPS, NOTEBOOKS, TELEFONES e TABLETS. A lista
-- que o 0008 chumbou na CHECK de rh.item_devolucao é outra:
--
--     ('epi','notebook','cracha','uniforme','chave','celular','outro')
--
-- CARRO não cabe. TABLET não cabe. DESKTOP não cabe. Os três só entram como
-- 'outro' — e 'outro' é o balde onde o relatório por tipo morre: devolver o
-- carro da frota e devolver um cabo HDMI viram a mesma linha, e a pergunta "o
-- que ainda está com quem saiu?" deixa de ter resposta por tipo. Hoje a base de
-- desenvolvimento já tem 7 itens em 'outro' — o segundo maior grupo, atrás só
-- de 'cracha' (10). O balde não é hipótese, já está cheio.
--
-- E acrescentar 'carro' à CHECK seria repetir o erro, não corrigi-lo: a próxima
-- categoria que o dono quiser (empilhadeira, rádio, tag de pedágio) voltaria a
-- ser uma migration e um deploy. É o eixo 9 — "nada chumbado": lista de negócio
-- é administrável pela tela, não constante no código.
--
-- O QUE MUDA
--   rh.categoria_devolucao   NOVA. O catálogo: chave estável (slug), nome
--                            exibido, ordem no seletor e inativação datada com
--                            autor. Nunca se apaga linha — trigger barra DELETE,
--                            porque a chave está gravada no histórico de
--                            devoluções e apagá-la reescreveria o passado.
--   rh.item_devolucao        A CHECK de sete valores sai; entra FOREIGN KEY para
--                            o catálogo (ON UPDATE CASCADE: renomear a chave
--                            arrasta o histórico junto, em vez de o quebrar).
--                            A COLUNA NÃO MUDA — continua sendo `categoria TEXT`
--                            com a mesma chave gravada, então NENHUMA das 34
--                            linhas existentes é reescrita, movida ou perdida, e
--                            nada que lê a tabela hoje precisa mudar para
--                            continuar lendo.
--   trigger de INSERT        item novo só nasce com categoria ATIVA; item que já
--                            existe continua editável mesmo se a categoria dele
--                            for inativada depois (o passado não deixa de ser
--                            verdade porque a lista mudou).
--
-- As sete categorias de hoje entram no catálogo com o mesmo rótulo que a tela já
-- mostrava, e as três que faltavam entram junto: CARRO, DESKTOP e TABLET.
-- "Telefone" já existia como 'celular' e continua com esse nome — renomear é ato
-- de tela agora, não de migration.
--
-- MIGRATION APLICADA É IMUTÁVEL. Depois que este arquivo rodar em qualquer banco,
-- corrigir é escrever OUTRA migration: o db/migrar.js compara o hash do conteúdo e
-- aborta, e ele está certo em abortar.

BEGIN;

-- ---------------------------------------------------------------- o catálogo
-- Forma de catálogo administrável do projeto: identidade por CHAVE estável
-- (slug), nome separado da chave (renomear não mexe no histórico) e inativação
-- datada com autor, no molde de rh.centro_custo (0047). Sem versão de nome com
-- vigência de propósito: aqui o nome é rótulo de tela, não fato com efeito legal
-- por data — ninguém precisa saber como a categoria se chamava em março.
CREATE TABLE rh.categoria_devolucao (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave          TEXT NOT NULL UNIQUE CHECK (chave ~ '^[a-z][a-z0-9_]*$'),
  nome           TEXT NOT NULL CHECK (btrim(nome) <> ''),
  -- ordem no seletor da tela; empate desempata por nome
  ordem          INT NOT NULL DEFAULT 500,
  inativado_em   TIMESTAMPTZ,
  inativado_por  BIGINT REFERENCES sistema.usuario (id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((inativado_em IS NULL) = (inativado_por IS NULL))
);
CREATE TRIGGER categoria_devolucao_tocar BEFORE UPDATE ON rh.categoria_devolucao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE rh.categoria_devolucao IS
  'Categorias de item de devolução no desligamento (carro, notebook, EPI…). '
  'Administrável pela tela; NUNCA se apaga — inativa-se. A chave é o que '
  'rh.item_devolucao.categoria grava, então apagar sumiria com o tipo do que '
  'já foi devolvido.';
COMMENT ON COLUMN rh.categoria_devolucao.chave IS
  'Slug estável, derivado do nome na criação. É o valor gravado em '
  'rh.item_devolucao.categoria — a FK tem ON UPDATE CASCADE, então corrigir a '
  'chave arrasta o histórico junto em vez de o quebrar.';
COMMENT ON COLUMN rh.categoria_devolucao.inativado_em IS
  'Quando parou de ser oferecida no seletor. Item JÁ gravado com esta '
  'categoria continua valendo e continua editável — inativar tira do futuro, '
  'não do passado.';

-- Exclusão é o que esta tabela não tem. Inativar é a operação.
CREATE FUNCTION rh.bloquear_exclusao_categoria_devolucao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'categoria de devolução "%" não se apaga — inative. A chave está gravada no histórico de devoluções.',
    OLD.chave;
END;
$$;
CREATE TRIGGER categoria_devolucao_nunca_apaga
  BEFORE DELETE ON rh.categoria_devolucao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_exclusao_categoria_devolucao();

-- ---------------------------------------------------------------- as sete de hoje + as três que faltavam
-- Os rótulos são exatamente os que ROTULOS_CATEGORIA_ITEM já mostrava na tela,
-- para que nenhuma linha existente mude de aparência ao passar pelo catálogo.
INSERT INTO rh.categoria_devolucao (chave, nome, ordem) VALUES
  ('epi',      'EPI',      10),
  ('uniforme', 'Uniforme', 20),
  ('cracha',   'Crachá',   30),
  ('chave',    'Chave',    40),
  ('notebook', 'Notebook', 50),
  ('desktop',  'Desktop',  60),   -- pedido do dono
  ('celular',  'Celular',  70),   -- o "telefone" da lista do dono
  ('tablet',   'Tablet',   80),   -- pedido do dono
  ('carro',    'Carro',    90),   -- pedido do dono
  ('outro',    'Outro',    999);

-- Rede de segurança antes da FK: se alguma linha gravada carregar chave fora da
-- lista acima (banco de bancada, correção manual, futuro divergente), ela entra
-- no catálogo com o próprio slug como nome — assim a FK abaixo não recusa linha
-- existente e a migration não aborta por causa de dado que já está lá. Nada é
-- perdido nem reclassificado; quem decide o destino dela é o DP, pela tela.
INSERT INTO rh.categoria_devolucao (chave, nome, ordem)
SELECT DISTINCT i.categoria, i.categoria, 998
  FROM rh.item_devolucao i
 WHERE i.categoria ~ '^[a-z][a-z0-9_]*$'
   AND NOT EXISTS (SELECT 1 FROM rh.categoria_devolucao c WHERE c.chave = i.categoria);

-- ---------------------------------------------------------------- a lista fixa sai, a FK entra
ALTER TABLE rh.item_devolucao DROP CONSTRAINT item_devolucao_categoria_check;
ALTER TABLE rh.item_devolucao
  ADD CONSTRAINT item_devolucao_categoria_fkey
  FOREIGN KEY (categoria) REFERENCES rh.categoria_devolucao (chave)
  ON UPDATE CASCADE;

COMMENT ON COLUMN rh.item_devolucao.categoria IS
  'Chave em rh.categoria_devolucao. Deixou de ser lista fixa na 0054: carro, '
  'desktop e tablet não cabiam na CHECK do 0008 e caíam em "outro".';

-- Categoria inativa não entra em item NOVO; item que já existe segue editável
-- (mudar o status de um crachá não pode depender de a categoria ainda estar
-- ativa hoje). O serviço já filtra o seletor — isto é o trinco do banco.
CREATE FUNCTION rh.exigir_categoria_devolucao_ativa() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM rh.categoria_devolucao c
              WHERE c.chave = NEW.categoria AND c.inativado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'categoria de devolução "%" está inativa — escolha uma ativa',
      NEW.categoria;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER item_devolucao_categoria_ativa
  BEFORE INSERT OR UPDATE ON rh.item_devolucao
  FOR EACH ROW EXECUTE FUNCTION rh.exigir_categoria_devolucao_ativa();

-- ---------------------------------------------------------------- permissão
-- Autorização por CHAVE, nunca por nome de papel (eixo 4). Sem 2FA, como as
-- demais chaves de cadastro: categoria de ativo não é dado sensível de pessoa.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('desligamento.categoria.administrar',
   'Gerir o catálogo de categorias de item de devolução: criar, renomear e inativar');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  -- O DP conduz as devoluções (desligamento.gerir) e é quem sente falta da
  -- categoria na hora de registrar o item.
  ('dp',        'desligamento.categoria.administrar'),
  -- Quem decide quais ativos a empresa entrega e cobra de volta é a diretoria —
  -- foi ela que nomeou carros, desktops, notebooks, telefones e tablets.
  ('diretoria', 'desligamento.categoria.administrar');

-- ---------------------------------------------------------------- provas finais
DO $$
DECLARE
  orfas     BIGINT;
  ativas    BIGINT;
  faltando  TEXT;
  itens     BIGINT;
BEGIN
  -- 1. nenhuma linha existente ficou sem categoria no catálogo
  SELECT count(*) INTO orfas
    FROM rh.item_devolucao i
   WHERE NOT EXISTS (SELECT 1 FROM rh.categoria_devolucao c
                      WHERE c.chave = i.categoria);
  IF orfas <> 0 THEN
    RAISE EXCEPTION '% item(ns) de devolução com categoria fora do catálogo', orfas;
  END IF;

  -- 2. as três que motivaram esta migration existem e estão ativas
  SELECT string_agg(esperada, ', ') INTO faltando
    FROM unnest(ARRAY['carro','desktop','tablet']) AS esperada
   WHERE NOT EXISTS (SELECT 1 FROM rh.categoria_devolucao c
                      WHERE c.chave = esperada AND c.inativado_em IS NULL);
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'categoria(s) do pedido do dono ausente(s) ou inativa(s): %', faltando;
  END IF;

  -- 3. as sete de antes continuam ativas (ninguém perdeu opção)
  SELECT count(*) INTO ativas
    FROM rh.categoria_devolucao
   WHERE inativado_em IS NULL
     AND chave IN ('epi','notebook','cracha','uniforme','chave','celular','outro');
  IF ativas <> 7 THEN
    RAISE EXCEPTION 'esperava as 7 categorias do 0008 ativas, achei %', ativas;
  END IF;

  SELECT count(*) INTO itens FROM rh.item_devolucao;
  RAISE NOTICE 'catálogo de devolução: % ativas, % item(ns) preservado(s)',
    (SELECT count(*) FROM rh.categoria_devolucao WHERE inativado_em IS NULL), itens;
END;
$$;

COMMIT;
