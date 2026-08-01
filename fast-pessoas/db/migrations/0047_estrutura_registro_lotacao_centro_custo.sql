-- 0047_estrutura_registro_lotacao_centro_custo.sql
-- REGISTRO, LOTAÇÃO e CENTRO DE CUSTO passam a ser três coisas separadas —
-- cada uma com catálogo administrável e vigência no vínculo.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Palavra do dono do sistema: são TRÊS campos diferentes e hoje o sistema tem
-- um só.
--
--   REGISTRO        em qual empresa do grupo a pessoa está registrada (o CNPJ)
--   LOTAÇÃO         o local físico onde ela trabalha
--   CENTRO DE CUSTO onde o custo dela cai
--
-- E são independentes: alguém registrado na Supply pode trabalhar na loja
-- Centro e ter o custo caindo no CSC. O que existe hoje é isto:
--
--   rh.estabelecimento        (cnpj UNIQUE NOT NULL)
--   rh.estabelecimento_versao (razao_social, unidade "Loja Centro", endereco)
--   rh.lotacao                (colaborador, estabelecimento, centro_custo TEXT)
--
-- Uma linha de estabelecimento carrega AO MESMO TEMPO o CNPJ (registro) e o
-- nome do lugar (lotação) — os dois amarrados um no outro, um por um. Abrir uma
-- segunda loja dentro do mesmo CNPJ é impossível sem inventar um CNPJ; e
-- registrar alguém na Supply trabalhando num prédio da DCS é impossível, porque
-- escolher o prédio já escolhe o CNPJ. Foi isso que o dono chamou de "hoje o
-- sistema tem só unidade, que mistura os três".
--
-- O centro de custo estava pior: `rh.lotacao.centro_custo TEXT`, digitado à mão,
-- sem catálogo, sem nome, sem inativação. Um erro de digitação abre um centro de
-- custo novo em silêncio, e renomear "CC-1000" para outra coisa não existia como
-- operação — só como reescrita de todas as linhas, passado incluído.
--
-- ============================================================== O QUE ESTA MIGRATION FAZ
--
--   rh.empresa_grupo        NOVA.    O REGISTRO. CNPJ + razão social + nome
--                                    fantasia + tipo, com o nome VERSIONADO.
--   rh.centro_custo         NOVA.    O CENTRO DE CUSTO. Código + empresa, com o
--                                    nome VERSIONADO.
--   rh.estabelecimento      EVOLUI.  Passa a ser SÓ o local físico — a LOTAÇÃO.
--   rh.lotacao              EVOLUI.  A linha de vigência do vínculo passa a
--                                    carregar os TRÊS: empresa_id,
--                                    estabelecimento_id e centro_custo_id.
--
-- ---------------------------------------------------------------- item 3 da tarefa:
-- "rh.lotacao já existe — decida se ela serve como local físico ou se precisa
-- evoluir, e explique."
--
-- RESPOSTA: rh.lotacao NÃO é o local físico e nunca foi. Ela é o REGISTRO DE
-- ALOCAÇÃO — a linha "fulano esteve em tal lugar, com tal custo, deste dia até
-- aquele". Ela é o lado do VÍNCULO, não o lado do catálogo. Quem é o catálogo do
-- local físico é rh.estabelecimento(+_versao), que já tem exatamente o que um
-- local físico precisa: nome curto ("Loja Centro"), endereço e versão com
-- vigência para renomear sem reescrever o passado.
--
-- Então a decisão é: rh.estabelecimento VIRA o catálogo de LOTAÇÃO, e para isso
-- precisa perder o que não é dele — o CNPJ e a razão social, que descrevem a
-- EMPRESA e agora moram em rh.empresa_grupo. As duas colunas não são apagadas
-- (há dado nelas, e apagar coluna não é reversível); ficam OPCIONAIS e marcadas
-- como legado no comentário. Um local físico novo nasce só com nome e endereço.
--
-- E rh.lotacao continua sendo a linha de alocação — agora com os três campos.
-- O nome da tabela ficou ambíguo (a tabela "lotacao" contém o campo lotação
-- dentro dela, que é estabelecimento_id). Renomear custaria reescrita em 60+
-- arquivos e nenhum ganho de comportamento; em vez disso existe a view
-- rh.lotacao_detalhada, que é como as telas devem ler os três juntos.
--
-- ---------------------------------------------------------------- item 4: VIGÊNCIA
-- "a pessoa muda de centro de custo em março, e a folha de fevereiro tem que
-- continuar caindo no centro antigo."
--
-- Os três campos vivem numa linha ÚNICA de vigência (rh.lotacao), não em três
-- tabelas de vigência independentes. Por quê:
--   • mudar um dos três encerra a linha vigente e abre outra repetindo os
--     outros dois — o custo é uma linha a mais, e o ganho é que em qualquer data
--     a resposta é UMA linha, sem casar três intervalos diferentes;
--   • é o formato que rh.lotacao já tinha, e que promoção/transferência,
--     organograma, painel executivo e relatórios já sabem ler;
--   • o índice lotacao_uma_vigente continua garantindo "uma alocação por vez".
--
-- Quem responde "onde ela estava em tal data" é rh.estrutura_em(vínculo, data) —
-- e é essa função que a folha usa. A prova de que o passado não se reescreve tem
-- DOIS trincos:
--   1. linha de vigência ENCERRADA é imutável (trigger lotacao_congelar, novo
--      aqui — rh.lotacao era a única tabela de vigência do 0002 sem essa
--      guarda). Mudar o centro de custo hoje FECHA a linha de fevereiro; a
--      partir daí ela não muda mais, nem por SQL direto.
--   2. renomear centro de custo/empresa/local é VERSÃO nova com vigência. Quem
--      pergunta pelo nome em fevereiro recebe o nome de fevereiro.
--
-- DECISÃO SOBRE SNAPSHOT NA FOLHA: rh_folha.folha_colaborador NÃO ganha coluna
-- de centro de custo. A apropriação é uma FUNÇÃO da história da alocação, e a
-- história da alocação é imutável (trinco 1). Copiar para dentro da folha
-- duplicaria um fato que não pode mudar — e exigiria DESLIGAR o trigger de
-- imutabilidade da folha para preencher as competências já FECHADAS, que é
-- exatamente o que aquele trigger existe para impedir. Em vez disso há a view
-- rh_folha.apropriacao_competencia, que resolve a alocação vigente no último dia
-- de cada competência. Diferente do salário — que é congelado porque o cálculo
-- CONSOME o valor e o resultado depende dele — a apropriação é rótulo de
-- destino, lido depois, e derivá-la mantém uma fonte só.
--
-- ---------------------------------------------------------------- CENTRO DE CUSTO DE OUTRA EMPRESA?
-- rh.centro_custo tem empresa_id (a tarefa pede: "vinculado à empresa"): é quem
-- MANTÉM o centro de custo no plano de contas. Mas NÃO existe trava obrigando
-- lotacao.centro_custo_id a ser da mesma lotacao.empresa_id — de propósito, e é
-- o exemplo do próprio dono: registrado na Supply, custo caindo no CSC. Centro
-- de custo compartilhado entre CNPJs do grupo é o caso normal de serviço
-- compartilhado, e uma trava aqui proibiria justamente o que a onda veio
-- permitir.
--
-- ---------------------------------------------------------------- item 5: BACKFILL
-- Regra: nada inventado, tudo rastreável de volta.
--   LOTAÇÃO       fica exatamente onde estava — lotacao.estabelecimento_id não
--                 é tocado. O "Matriz Centro" de hoje continua sendo o mesmo
--                 local físico depois da migration.
--   REGISTRO      cada rh.estabelecimento que TEM CNPJ vira uma rh.empresa_grupo
--                 com aquele mesmo CNPJ, e a alocação passa a apontar para ela.
--                 A coluna rh.empresa_grupo.origem_estabelecimento_id guarda de
--                 qual linha ela nasceu — é a reversibilidade pedida: dá para
--                 reconstruir o "unidade" de antes juntando as duas.
--                 matriz/filial vem do próprio CNPJ (posições 9-12 = '0001' é
--                 matriz), não de palpite.
--   CENTRO CUSTO  cada par distinto (empresa, texto digitado) vira uma linha de
--                 rh.centro_custo com codigo = o texto. O NOME nasce igual ao
--                 código, porque nome é o que nunca existiu — e a tela existe
--                 justamente para o DP dar nome a cada um sem chamar dev.
--
-- Além do backfill, entram as quatro empresas que a diretoria nomeou na reunião
-- (Supply, DCS, Casa do Montador e a quarta, que ninguém nomeou), SEM CNPJ. Não
-- inventar CNPJ é decisão: CNPJ é número de negócio real, ninguém passou os
-- números, e um placeholder com dígito verificador válido é indistinguível de
-- dado bom. Nascem com cnpj NULL e a tela pede o número quando o DP tiver.
-- Elas convivem com as backfilladas; o dono INATIVA pela tela as que não usar —
-- as backfilladas não podem ser apagadas porque têm gente apontando.
--
-- ---------------------------------------------------------------- projeções (padrão do 0046)
-- rh.lotacao.centro_custo TEXT continua existindo como LEITURA de
-- rh.centro_custo.codigo, mantida por trigger e impossível de divergir — mesmo
-- expand/contract que a 0046 usou para cpf/nome. Motivo igual: painel executivo,
-- ficha, relatórios e movimentação leem essa coluna hoje, e trocar tudo por JOIN
-- na mesma migration que muda o cadastro é duas mudanças grandes de uma vez.
-- Idem rh.demanda_movimentacao.centro_custo_destino.

BEGIN;

-- ================================================================ REGISTRO (a empresa do grupo)
-- Identidade estável = a linha. O CNPJ é UNIQUE mas pode faltar: a empresa é
-- cadastrada quando a diretoria a nomeia e o número chega depois, do DP.
CREATE TABLE rh.empresa_grupo (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cnpj                      CHAR(14) UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
  -- Inativar em vez de excluir: some dos seletores, continua respondendo pelo
  -- passado de quem esteve registrado nela.
  inativada_em              TIMESTAMPTZ,
  inativada_por             BIGINT REFERENCES sistema.usuario (id),
  -- Rastro do backfill: de qual rh.estabelecimento esta empresa foi extraída
  -- quando "unidade" foi partida em três. NULL = cadastrada pela tela.
  origem_estabelecimento_id BIGINT REFERENCES rh.estabelecimento (id),
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((inativada_em IS NULL) = (inativada_por IS NULL))
);
CREATE TRIGGER empresa_grupo_tocar BEFORE UPDATE ON rh.empresa_grupo
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE rh.empresa_grupo IS
  'REGISTRO: em qual empresa do grupo (qual CNPJ) a pessoa está registrada. '
  'Não é o local onde ela trabalha (isso é rh.estabelecimento) nem onde o custo '
  'cai (isso é rh.centro_custo).';
COMMENT ON COLUMN rh.empresa_grupo.cnpj IS
  'Pode ser NULL: a diretoria nomeia a empresa antes de o DP passar o número. '
  'Preenchido pela tela — nunca por placeholder inventado.';
COMMENT ON COLUMN rh.empresa_grupo.origem_estabelecimento_id IS
  'Reversibilidade do backfill da 0047: de qual rh.estabelecimento este '
  'registro foi extraído quando o campo "unidade" virou três campos.';

-- Nome é VERSIONADO: renomear a empresa não reescreve o holerite de fevereiro.
CREATE TABLE rh.empresa_grupo_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id       BIGINT NOT NULL REFERENCES rh.empresa_grupo (id),
  -- Razão social vem do cartão CNPJ; pode faltar enquanto o CNPJ falta.
  razao_social     TEXT CHECK (razao_social IS NULL OR btrim(razao_social) <> ''),
  -- O nome que a diretoria usa na boca ("Supply", "Casa do Montador").
  nome_fantasia    TEXT NOT NULL CHECK (btrim(nome_fantasia) <> ''),
  tipo             TEXT NOT NULL DEFAULT 'matriz'
                   CHECK (tipo IN ('matriz','filial')),
  status           TEXT NOT NULL DEFAULT 'ativa'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE INDEX empresa_grupo_versao_por_empresa
  ON rh.empresa_grupo_versao (empresa_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX empresa_grupo_versao_uma_ativa
  ON rh.empresa_grupo_versao (empresa_id) WHERE status = 'ativa';
CREATE TRIGGER empresa_grupo_versao_tocar BEFORE UPDATE ON rh.empresa_grupo_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER empresa_grupo_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.empresa_grupo_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ================================================================ CENTRO DE CUSTO
-- Identidade = (empresa, código). Código é o que a contabilidade usa; o nome é
-- o que gente lê, e é versionado.
CREATE TABLE rh.centro_custo (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id     BIGINT NOT NULL REFERENCES rh.empresa_grupo (id),
  codigo         TEXT NOT NULL CHECK (btrim(codigo) <> ''),
  inativado_em   TIMESTAMPTZ,
  inativado_por  BIGINT REFERENCES sistema.usuario (id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo),
  CHECK ((inativado_em IS NULL) = (inativado_por IS NULL))
);
CREATE INDEX centro_custo_por_empresa ON rh.centro_custo (empresa_id, codigo);
CREATE TRIGGER centro_custo_tocar BEFORE UPDATE ON rh.centro_custo
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON TABLE rh.centro_custo IS
  'CENTRO DE CUSTO: onde o custo da pessoa cai. empresa_id é quem MANTÉM o '
  'centro no plano de contas — uma alocação pode apontar para centro de outra '
  'empresa do grupo (serviço compartilhado), e isso é permitido de propósito.';

CREATE TABLE rh.centro_custo_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  centro_custo_id  BIGINT NOT NULL REFERENCES rh.centro_custo (id),
  nome             TEXT NOT NULL CHECK (btrim(nome) <> ''),
  status           TEXT NOT NULL DEFAULT 'ativa'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE INDEX centro_custo_versao_por_centro
  ON rh.centro_custo_versao (centro_custo_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX centro_custo_versao_uma_ativa
  ON rh.centro_custo_versao (centro_custo_id) WHERE status = 'ativa';
CREATE TRIGGER centro_custo_versao_tocar BEFORE UPDATE ON rh.centro_custo_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER centro_custo_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.centro_custo_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ================================================================ LOTAÇÃO (o local físico)
-- rh.estabelecimento deixa de responder pelo CNPJ. As duas colunas legais ficam
-- opcionais em vez de apagadas — há dado nelas e apagar coluna não volta atrás.
ALTER TABLE rh.estabelecimento ALTER COLUMN cnpj DROP NOT NULL;
ALTER TABLE rh.estabelecimento_versao ALTER COLUMN razao_social DROP NOT NULL;
ALTER TABLE rh.estabelecimento_versao
  ADD CONSTRAINT estabelecimento_versao_razao_social_nao_vazia
  CHECK (razao_social IS NULL OR btrim(razao_social) <> '');

ALTER TABLE rh.estabelecimento
  ADD COLUMN inativado_em   TIMESTAMPTZ,
  ADD COLUMN inativado_por  BIGINT REFERENCES sistema.usuario (id),
  ADD CONSTRAINT estabelecimento_inativacao_completa
    CHECK ((inativado_em IS NULL) = (inativado_por IS NULL));

COMMENT ON TABLE rh.estabelecimento IS
  'LOTAÇÃO: o local físico onde a pessoa trabalha (a loja, o galpão, o '
  'escritório). Desde a 0047 NÃO responde mais pelo CNPJ — o registro é '
  'rh.empresa_grupo. Um local pode abrigar gente registrada em empresas '
  'diferentes do grupo.';
COMMENT ON COLUMN rh.estabelecimento.cnpj IS
  'LEGADO e opcional. O CNPJ que identifica o empregador é '
  'rh.empresa_grupo.cnpj. Local físico novo nasce sem CNPJ.';
COMMENT ON COLUMN rh.estabelecimento_versao.razao_social IS
  'LEGADO e opcional. Razão social é da empresa (rh.empresa_grupo_versao), '
  'não do prédio.';
COMMENT ON COLUMN rh.estabelecimento_versao.unidade IS
  'O nome do LOCAL FÍSICO ("Loja Centro", "Galpão Norte"). É este o campo '
  'lotação.';

-- ================================================================ os três campos no vínculo
ALTER TABLE rh.lotacao
  ADD COLUMN empresa_id       BIGINT REFERENCES rh.empresa_grupo (id),
  ADD COLUMN centro_custo_id  BIGINT REFERENCES rh.centro_custo (id);

COMMENT ON TABLE rh.lotacao IS
  'A ALOCAÇÃO do vínculo por vigência: onde ele está REGISTRADO (empresa_id), '
  'em que LOCAL trabalha (estabelecimento_id) e em que CENTRO DE CUSTO o custo '
  'cai (centro_custo_id), do dia tal ao dia tal. Mudar qualquer um dos três '
  'encerra a linha e abre outra — linha encerrada é imutável.';
COMMENT ON COLUMN rh.lotacao.centro_custo IS
  'Projeção de rh.centro_custo.codigo mantida por trigger (padrão da 0046). '
  'Escrever aqui não adianta: o BEFORE sobrescreve com o código do '
  'centro_custo_id. A fonte é rh.centro_custo.';

-- ---------------------------------------------------------------- backfill: REGISTRO
-- Uma empresa por estabelecimento que tem CNPJ. matriz/filial sai do próprio
-- número: posições 9-12 do CNPJ são a ordem do estabelecimento na Receita, e
-- '0001' é a matriz.
INSERT INTO rh.empresa_grupo (cnpj, origem_estabelecimento_id, criado_em)
SELECT e.cnpj, e.id, e.criado_em
  FROM rh.estabelecimento e
 WHERE e.cnpj IS NOT NULL
 ORDER BY e.id;

INSERT INTO rh.empresa_grupo_versao
  (empresa_id, razao_social, nome_fantasia, tipo, status, inicio_vigencia)
SELECT eg.id,
       ev.razao_social,
       -- Nome fantasia: é assim que essas linhas são distinguidas hoje na tela.
       coalesce(ev.unidade, 'Empresa ' || eg.id::text),
       CASE WHEN substring(eg.cnpj FROM 9 FOR 4) = '0001'
            THEN 'matriz' ELSE 'filial' END,
       'ativa',
       coalesce(ev.inicio_vigencia, eg.criado_em::date)
  FROM rh.empresa_grupo eg
  JOIN rh.estabelecimento e ON e.id = eg.origem_estabelecimento_id
  LEFT JOIN rh.estabelecimento_versao ev
    ON ev.estabelecimento_id = e.id AND ev.status = 'ativa';

-- ---------------------------------------------------------------- backfill: CENTRO DE CUSTO
-- Cada par distinto (empresa derivada, texto digitado) vira catálogo. Entram os
-- textos de rh.lotacao E os de rh.demanda_movimentacao — uma transferência
-- pendente com centro de custo destino tem que continuar aplicável depois daqui.
INSERT INTO rh.centro_custo (empresa_id, codigo)
SELECT DISTINCT eg.id, btrim(origem.codigo)
  FROM (
        SELECT l.estabelecimento_id, l.centro_custo AS codigo
          FROM rh.lotacao l
         WHERE l.centro_custo IS NOT NULL AND btrim(l.centro_custo) <> ''
        UNION
        -- Movimentação sem estabelecimento destino (promoção) cai no
        -- estabelecimento onde a pessoa está hoje — é o mesmo que o serviço faz
        -- ao aplicar: sem destino informado, herda o vigente.
        SELECT coalesce(m.estabelecimento_destino_id, atual.estabelecimento_id),
               m.centro_custo_destino
          FROM rh.demanda_movimentacao m
          LEFT JOIN rh.lotacao atual
            ON atual.colaborador_id = m.colaborador_id
           AND atual.fim_vigencia IS NULL
         WHERE m.centro_custo_destino IS NOT NULL
           AND btrim(m.centro_custo_destino) <> ''
           AND coalesce(m.estabelecimento_destino_id, atual.estabelecimento_id)
               IS NOT NULL
       ) AS origem
  JOIN rh.empresa_grupo eg
    ON eg.origem_estabelecimento_id = origem.estabelecimento_id;

-- Nome nasce igual ao código: nome é justamente o que nunca existiu. A tela de
-- estrutura existe para o DP dar nome a cada um, sem chamar dev.
INSERT INTO rh.centro_custo_versao
  (centro_custo_id, nome, status, inicio_vigencia)
SELECT cc.id, cc.codigo, 'ativa', cc.criado_em::date
  FROM rh.centro_custo cc;

-- ---------------------------------------------------------------- backfill: as alocações
UPDATE rh.lotacao l
   SET empresa_id      = eg.id,
       centro_custo_id = cc.id
  FROM rh.empresa_grupo eg
  JOIN rh.centro_custo cc ON cc.empresa_id = eg.id
 WHERE eg.origem_estabelecimento_id = l.estabelecimento_id
   AND cc.codigo = btrim(l.centro_custo);

-- Prova dentro da transação: alocação sem os três campos não passa.
DO $$
DECLARE
  sem_empresa BIGINT;
  sem_centro  BIGINT;
  total       BIGINT;
BEGIN
  SELECT count(*) INTO sem_empresa FROM rh.lotacao WHERE empresa_id IS NULL;
  SELECT count(*) INTO sem_centro  FROM rh.lotacao WHERE centro_custo_id IS NULL;
  SELECT count(*) INTO total       FROM rh.lotacao;
  IF sem_empresa <> 0 OR sem_centro <> 0 THEN
    RAISE EXCEPTION
      'backfill incompleto: de % alocações, % ficaram sem registro e % sem centro de custo',
      total, sem_empresa, sem_centro;
  END IF;
END;
$$;

ALTER TABLE rh.lotacao ALTER COLUMN empresa_id      SET NOT NULL;
ALTER TABLE rh.lotacao ALTER COLUMN centro_custo_id SET NOT NULL;
CREATE INDEX lotacao_por_empresa      ON rh.lotacao (empresa_id);
CREATE INDEX lotacao_por_centro_custo ON rh.lotacao (centro_custo_id);

-- ---------------------------------------------------------------- projeção do código do centro
CREATE FUNCTION rh.projetar_codigo_centro_custo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_codigo TEXT;
BEGIN
  SELECT cc.codigo INTO v_codigo
    FROM rh.centro_custo cc WHERE cc.id = NEW.centro_custo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'centro de custo % não existe no catálogo', NEW.centro_custo_id;
  END IF;
  NEW.centro_custo := v_codigo;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lotacao_projetar_centro
  BEFORE INSERT OR UPDATE ON rh.lotacao
  FOR EACH ROW EXECUTE FUNCTION rh.projetar_codigo_centro_custo();

-- Reprojeta o que já existe pelo mesmo caminho de qualquer escrita futura.
UPDATE rh.lotacao SET centro_custo_id = centro_custo_id;

-- Renomear o CÓDIGO de um centro de custo desce para as alocações (o código é
-- identidade contábil; o nome é que é versionado). Sem recursão: o UPDATE abaixo
-- não muda coluna nenhuma — quem preenche é o BEFORE acima.
CREATE FUNCTION rh.repropagar_codigo_centro_custo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE rh.lotacao SET centro_custo_id = centro_custo_id
   WHERE centro_custo_id = NEW.id AND fim_vigencia IS NULL;
  RETURN NULL;
END;
$$;

CREATE TRIGGER centro_custo_repropagar_codigo
  AFTER UPDATE OF codigo ON rh.centro_custo
  FOR EACH ROW WHEN (OLD.codigo IS DISTINCT FROM NEW.codigo)
  EXECUTE FUNCTION rh.repropagar_codigo_centro_custo();

-- ---------------------------------------------------------------- o trinco do passado
-- rh.lotacao era a única tabela de vigência do 0002 sem a guarda de imutabilidade
-- (rh.posicao_colaborador tem desde sempre). Sem ela, "mudar o centro de custo"
-- podia ser feito com UPDATE na linha antiga — e aí a folha de fevereiro mudava
-- junto. É esta linha que faz a exigência do dono valer no BANCO, não só no
-- serviço.
CREATE TRIGGER lotacao_congelar
  BEFORE UPDATE OR DELETE ON rh.lotacao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_vigencia_encerrada();

-- ---------------------------------------------------------------- destino da movimentação
ALTER TABLE rh.demanda_movimentacao
  ADD COLUMN centro_custo_destino_id BIGINT REFERENCES rh.centro_custo (id);

UPDATE rh.demanda_movimentacao m
   SET centro_custo_destino_id = cc.id
  FROM rh.empresa_grupo eg
  JOIN rh.centro_custo cc ON cc.empresa_id = eg.id
 WHERE m.centro_custo_destino IS NOT NULL
   AND cc.codigo = btrim(m.centro_custo_destino)
   AND eg.origem_estabelecimento_id = coalesce(
         m.estabelecimento_destino_id,
         (SELECT l.estabelecimento_id FROM rh.lotacao l
           WHERE l.colaborador_id = m.colaborador_id AND l.fim_vigencia IS NULL));

-- Mesma projeção: o texto vira leitura do catálogo.
CREATE FUNCTION rh.projetar_codigo_centro_destino() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.centro_custo_destino_id IS NULL THEN
    NEW.centro_custo_destino := NULL;
  ELSE
    SELECT cc.codigo INTO NEW.centro_custo_destino
      FROM rh.centro_custo cc WHERE cc.id = NEW.centro_custo_destino_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER demanda_movimentacao_projetar_centro
  BEFORE INSERT OR UPDATE ON rh.demanda_movimentacao
  FOR EACH ROW EXECUTE FUNCTION rh.projetar_codigo_centro_destino();

UPDATE rh.demanda_movimentacao SET centro_custo_destino_id = centro_custo_destino_id;

COMMENT ON COLUMN rh.demanda_movimentacao.centro_custo_destino IS
  'Projeção de rh.centro_custo.codigo mantida por trigger. O campo que vale é '
  'centro_custo_destino_id.';

-- ---------------------------------------------------------------- as empresas da reunião
-- Nomeadas pela diretoria, sem CNPJ (ver cabeçalho: não inventamos número).
-- A quarta não foi nomeada e nasce como placeholder editável.
WITH nova AS (
  INSERT INTO rh.empresa_grupo (cnpj) VALUES (NULL), (NULL), (NULL), (NULL)
  RETURNING id
), numerada AS (
  SELECT id, row_number() OVER (ORDER BY id) AS ordem FROM nova
)
INSERT INTO rh.empresa_grupo_versao
  (empresa_id, razao_social, nome_fantasia, tipo, status, inicio_vigencia)
SELECT n.id, NULL,
       CASE n.ordem
         WHEN 1 THEN 'Supply'
         WHEN 2 THEN 'DCS'
         WHEN 3 THEN 'Casa do Montador'
         ELSE 'Quarta empresa do grupo (renomear)'
       END,
       'matriz', 'ativa', CURRENT_DATE
  FROM numerada n;

-- ================================================================ leitura por data
-- "Como este catálogo se chamava em tal data?" Regra de escolha, nesta ordem:
-- a versão que COBRE a data; senão a última que começou antes dela; senão a
-- primeira de todas (data anterior ao cadastro).
CREATE FUNCTION rh.empresa_versao_em(p_empresa_id BIGINT, p_data DATE)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT v.id
    FROM rh.empresa_grupo_versao v
   WHERE v.empresa_id = p_empresa_id
   ORDER BY (v.inicio_vigencia <= p_data
             AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= p_data)) DESC,
            (v.inicio_vigencia <= p_data) DESC,
            CASE WHEN v.inicio_vigencia <= p_data THEN v.inicio_vigencia END DESC,
            v.inicio_vigencia ASC
   LIMIT 1
$$;

CREATE FUNCTION rh.centro_custo_versao_em(p_centro_custo_id BIGINT, p_data DATE)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT v.id
    FROM rh.centro_custo_versao v
   WHERE v.centro_custo_id = p_centro_custo_id
   ORDER BY (v.inicio_vigencia <= p_data
             AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= p_data)) DESC,
            (v.inicio_vigencia <= p_data) DESC,
            CASE WHEN v.inicio_vigencia <= p_data THEN v.inicio_vigencia END DESC,
            v.inicio_vigencia ASC
   LIMIT 1
$$;

CREATE FUNCTION rh.estabelecimento_versao_em(p_estabelecimento_id BIGINT, p_data DATE)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT v.id
    FROM rh.estabelecimento_versao v
   WHERE v.estabelecimento_id = p_estabelecimento_id
   ORDER BY (v.inicio_vigencia <= p_data
             AND (v.fim_vigencia IS NULL OR v.fim_vigencia >= p_data)) DESC,
            (v.inicio_vigencia <= p_data) DESC,
            CASE WHEN v.inicio_vigencia <= p_data THEN v.inicio_vigencia END DESC,
            v.inicio_vigencia ASC
   LIMIT 1
$$;

-- A resposta inteira para "onde este vínculo estava em tal data", com os nomes
-- COMO ERAM naquela data. É esta função que faz a folha de fevereiro continuar
-- caindo no centro de fevereiro.
CREATE FUNCTION rh.estrutura_em(p_colaborador_id BIGINT, p_data DATE)
RETURNS TABLE (
  lotacao_id           BIGINT,
  empresa_id           BIGINT,
  empresa_cnpj         TEXT,
  empresa_nome         TEXT,
  estabelecimento_id   BIGINT,
  lotacao_nome         TEXT,
  centro_custo_id      BIGINT,
  centro_custo_codigo  TEXT,
  centro_custo_nome    TEXT,
  inicio_vigencia      DATE,
  fim_vigencia         DATE
) LANGUAGE sql STABLE AS $$
  SELECT l.id, l.empresa_id, eg.cnpj::text, egv.nome_fantasia,
         l.estabelecimento_id, estv.unidade,
         l.centro_custo_id, cc.codigo, ccv.nome,
         l.inicio_vigencia, l.fim_vigencia
    FROM rh.lotacao l
    JOIN rh.empresa_grupo eg ON eg.id = l.empresa_id
    JOIN rh.centro_custo cc  ON cc.id = l.centro_custo_id
    LEFT JOIN rh.empresa_grupo_versao egv
      ON egv.id = rh.empresa_versao_em(l.empresa_id, p_data)
    LEFT JOIN rh.centro_custo_versao ccv
      ON ccv.id = rh.centro_custo_versao_em(l.centro_custo_id, p_data)
    LEFT JOIN rh.estabelecimento_versao estv
      ON estv.id = rh.estabelecimento_versao_em(l.estabelecimento_id, p_data)
   WHERE l.colaborador_id = p_colaborador_id
     AND l.inicio_vigencia <= p_data
     AND (l.fim_vigencia IS NULL OR l.fim_vigencia >= p_data)
   ORDER BY l.inicio_vigencia DESC, l.id DESC
   LIMIT 1
$$;

COMMENT ON FUNCTION rh.estrutura_em(BIGINT, DATE) IS
  'Registro + lotação + centro de custo de um VÍNCULO numa data, com os nomes '
  'como eram naquela data. Use sempre que a pergunta tiver data — inclusive na '
  'folha. Sem data, use a view rh.lotacao_detalhada.';

-- Os três campos de cada linha de alocação, com nome legível. Data de
-- referência dos nomes: o fim da vigência (ou hoje, se ainda vigente) — a linha
-- do histórico mostra como o lugar se chamava quando a pessoa saiu dele.
CREATE VIEW rh.lotacao_detalhada AS
SELECT l.id,
       l.colaborador_id,
       l.empresa_id,
       eg.cnpj                AS empresa_cnpj,
       egv.nome_fantasia      AS empresa_nome,
       egv.razao_social       AS empresa_razao_social,
       l.estabelecimento_id,
       estv.unidade           AS lotacao_nome,
       estv.endereco_resumido AS lotacao_endereco,
       l.centro_custo_id,
       cc.codigo              AS centro_custo_codigo,
       ccv.nome               AS centro_custo_nome,
       l.centro_custo,
       l.inicio_vigencia,
       l.fim_vigencia
  FROM rh.lotacao l
  JOIN rh.empresa_grupo eg ON eg.id = l.empresa_id
  JOIN rh.centro_custo cc  ON cc.id = l.centro_custo_id
  LEFT JOIN rh.empresa_grupo_versao egv
    ON egv.id = rh.empresa_versao_em(l.empresa_id,
                                     coalesce(l.fim_vigencia, CURRENT_DATE))
  LEFT JOIN rh.centro_custo_versao ccv
    ON ccv.id = rh.centro_custo_versao_em(l.centro_custo_id,
                                          coalesce(l.fim_vigencia, CURRENT_DATE))
  LEFT JOIN rh.estabelecimento_versao estv
    ON estv.id = rh.estabelecimento_versao_em(l.estabelecimento_id,
                                              coalesce(l.fim_vigencia, CURRENT_DATE));

-- ================================================================ apropriação da folha
-- Onde o custo de cada linha de folha cai: a alocação vigente no ÚLTIMO DIA da
-- competência. Não é snapshot — é derivação de um histórico imutável (ver
-- cabeçalho). Mudar o centro de custo de alguém HOJE não mexe em nenhuma linha
-- desta view para competências anteriores.
CREATE VIEW rh_folha.apropriacao_competencia AS
SELECT f.id              AS folha_colaborador_id,
       f.competencia_id,
       c.ano,
       c.mes,
       c.tipo            AS competencia_tipo,
       c.estado          AS competencia_estado,
       (make_date(c.ano, c.mes, 1) + INTERVAL '1 month - 1 day')::date
                         AS data_referencia,
       f.colaborador_id,
       f.total_proventos,
       f.total_descontos,
       f.liquido,
       e.lotacao_id,
       e.empresa_id,
       e.empresa_cnpj,
       e.empresa_nome,
       e.estabelecimento_id,
       e.lotacao_nome,
       e.centro_custo_id,
       e.centro_custo_codigo,
       e.centro_custo_nome
  FROM rh_folha.folha_colaborador f
  JOIN rh_folha.competencia_folha c ON c.id = f.competencia_id
  LEFT JOIN LATERAL rh.estrutura_em(
         f.colaborador_id,
         (make_date(c.ano, c.mes, 1) + INTERVAL '1 month - 1 day')::date) e ON TRUE;

COMMENT ON VIEW rh_folha.apropriacao_competencia IS
  'Apropriação por registro/lotação/centro de custo de cada linha de folha, '
  'resolvida na data da COMPETÊNCIA. Trocar o centro de custo atual de alguém '
  'não altera competência anterior — a linha de vigência daquele mês está '
  'encerrada e encerrada é imutável (trigger lotacao_congelar).';

-- ================================================================ permissões
-- Cadastro administrável pela tela, autorizado por CHAVE (nunca por nome de
-- papel). Sem 2FA, igual às demais chaves de cadastro (rh.cargo.administrar,
-- rh.estabelecimento.administrar): não são dado sensível de pessoa.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.empresa.administrar',
   'Gerir as empresas do grupo (CNPJ, razão social, nome fantasia): criar, renomear por vigência e inativar'),
  ('rh.centro_custo.administrar',
   'Gerir centros de custo: criar, renomear por vigência e inativar');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  -- O DP mantém o cadastro no dia a dia.
  ('dp',        'rh.empresa.administrar'),
  ('dp',        'rh.centro_custo.administrar'),
  -- Quem decide quais empresas existem no grupo e onde o custo cai é a
  -- diretoria — foi ela quem nomeou Supply, DCS e Casa do Montador.
  ('diretoria', 'rh.empresa.administrar'),
  ('diretoria', 'rh.centro_custo.administrar');

-- ================================================================ provas finais
DO $$
DECLARE
  empresas       BIGINT;
  centros        BIGINT;
  sem_versao_emp BIGINT;
  sem_versao_cc  BIGINT;
  divergentes    BIGINT;
  mov_orfa       BIGINT;
  alocacoes      BIGINT;
BEGIN
  SELECT count(*) INTO empresas FROM rh.empresa_grupo;
  SELECT count(*) INTO centros  FROM rh.centro_custo;

  SELECT count(*) INTO sem_versao_emp
    FROM rh.empresa_grupo eg
   WHERE NOT EXISTS (SELECT 1 FROM rh.empresa_grupo_versao v
                      WHERE v.empresa_id = eg.id AND v.status = 'ativa');
  IF sem_versao_emp <> 0 THEN
    RAISE EXCEPTION '% empresa(s) sem versão ativa', sem_versao_emp;
  END IF;

  SELECT count(*) INTO sem_versao_cc
    FROM rh.centro_custo cc
   WHERE NOT EXISTS (SELECT 1 FROM rh.centro_custo_versao v
                      WHERE v.centro_custo_id = cc.id AND v.status = 'ativa');
  IF sem_versao_cc <> 0 THEN
    RAISE EXCEPTION '% centro(s) de custo sem versão ativa', sem_versao_cc;
  END IF;

  -- A projeção não pode divergir do catálogo em nenhuma linha.
  SELECT count(*) INTO divergentes
    FROM rh.lotacao l JOIN rh.centro_custo cc ON cc.id = l.centro_custo_id
   WHERE l.centro_custo IS DISTINCT FROM cc.codigo;
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'projeção do centro de custo divergente em % alocação(ões)',
      divergentes;
  END IF;

  -- Movimentação com destino de centro de custo tem que ter achado o catálogo.
  SELECT count(*) INTO mov_orfa
    FROM rh.demanda_movimentacao
   WHERE centro_custo_destino IS NOT NULL AND centro_custo_destino_id IS NULL;
  IF mov_orfa <> 0 THEN
    RAISE EXCEPTION
      '% movimentação(ões) com centro de custo destino fora do catálogo', mov_orfa;
  END IF;

  -- Toda alocação tem que ser resolvível pela função que a folha usa.
  SELECT count(*) INTO alocacoes
    FROM rh.lotacao l
   WHERE NOT EXISTS (
     SELECT 1 FROM rh.estrutura_em(l.colaborador_id,
                                   coalesce(l.fim_vigencia, l.inicio_vigencia)) x
      WHERE x.lotacao_id IS NOT NULL);
  IF alocacoes <> 0 THEN
    RAISE EXCEPTION '% alocação(ões) não resolvem em rh.estrutura_em', alocacoes;
  END IF;

  RAISE NOTICE '0047: % empresa(s), % centro(s) de custo, alocações íntegras.',
    empresas, centros;
END;
$$;

COMMIT;
