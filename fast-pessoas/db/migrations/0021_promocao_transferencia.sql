-- 0021_promocao_transferencia.sql
-- Promoção e transferência de unidade como FLUXO REAL sobre o motor de
-- demandas (0003). Origem: feedback da analista de RH
-- (docs/08-analise-feedback-analista-rh.md, item 4) — "aprovação de promoção do
-- líder para a diretoria, autorização de transferência de líder para a
-- diretoria e automaticamente com a aprovação o DP e Treinamento já ficam
-- cientes providenciando os trâmites. HOJE OCORRE DE FORMA ALEATÓRIA EM CANAIS
-- DIVERSOS OU SEM CANAL."
--
-- Três peças, todas mínimas:
--   (a) `fluxo` no tipo de demanda — separa o pedido de movimentação da
--       solicitação genérica (o formulário genérico NÃO abre promoção);
--   (b) `rh.etapa_aprovacao_demanda` — a cadeia de DOIS níveis que o motor não
--       tinha (só havia aprovação do gestor direto, um nível);
--   (c) `rh.demanda_movimentacao` — os campos do pedido, com o snapshot da
--       faixa salarial vigente do cargo destino e a trava de enquadramento.
--
-- DECISÃO DE FORMA (pedida pela tarefa): tabela de etapas, não campo de nível
-- na demanda. Motivo: a tela precisa mostrar "os dois níveis e QUEM DECIDIU O
-- QUÊ" com data e motivo — um campo `nivel_atual` guardaria o estado e perderia
-- a história. A tabela custa uma junção e resolve os dois usos.
--
-- A demanda continua governando o CICLO (status/prazo/SLA/transições): enquanto
-- a cadeia corre, o status é 'aguardando_aprovacao'; aprovada a última etapa a
-- demanda vai para 'aberta' (fila do DP, que executa os trâmites) e o EFEITO na
-- vida do colaborador é aplicado na MESMA transação da decisão final.

BEGIN;

-- ---------------------------------------------------------------- (a) fluxo do tipo
-- 'padrao'       = solicitação de autoatendimento (o que existe desde a 0003);
-- 'movimentacao' = pedido de promoção/transferência: formulário próprio, cadeia
--                  de aprovação em `rh.etapa_aprovacao_demanda` e efeito
--                  automático na aprovação final.
-- O serviço genérico de criação REJEITA fluxo 'movimentacao' e o de aprovação
-- do gestor também — sem isso o gestor do SOLICITANTE (que não é o líder do
-- colaborador alvo) poderia aprovar por fora da cadeia.
ALTER TABLE rh.tipo_demanda_versao
  ADD COLUMN fluxo TEXT NOT NULL DEFAULT 'padrao'
    CHECK (fluxo IN ('padrao','movimentacao'));

COMMENT ON COLUMN rh.tipo_demanda_versao.fluxo IS
  'padrao = solicitação genérica; movimentacao = promoção/transferência com '
  'formulário próprio, cadeia de aprovação (rh.etapa_aprovacao_demanda) e '
  'efeito automático na aprovação final.';

-- ---------------------------------------------------------------- (b) cadeia de aprovação
-- Uma linha por nível. `nivel` diz QUEM decide, resolvido pelo serviço no ato:
--   'lider'     → o gestor VIGENTE do colaborador alvo (rh.relacao_gestor sem
--                 fim de vigência) — não é o gestor do solicitante;
--   'diretoria' → quem tem a chave `movimentacao.aprovar.diretoria`.
-- `usuario_esperado_id` é opcional e serve de registro de quem era o líder
-- vigente na abertura (a relação pode mudar no meio do caminho; a decisão vale
-- pela relação vigente NO ATO, e este campo mostra o desvio na tela).
-- Ordem é sequencial e única: nível 2 só decide depois do nível 1 aprovado
-- (regra no serviço, com FOR UPDATE na demanda).
CREATE TABLE rh.etapa_aprovacao_demanda (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demanda_id           BIGINT NOT NULL REFERENCES rh.demanda (id),
  ordem                INT NOT NULL CHECK (ordem >= 1),
  nivel                TEXT NOT NULL CHECK (nivel IN ('lider','diretoria')),
  usuario_esperado_id  BIGINT REFERENCES sistema.usuario (id),
  status               TEXT NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente','aprovada','reprovada')),
  decisor_usuario_id   BIGINT REFERENCES sistema.usuario (id),
  decidido_em          TIMESTAMPTZ,
  motivo               TEXT,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (demanda_id, ordem),
  -- etapa decidida SEMPRE tem decisor e data; pendente não tem nem um nem outro
  CHECK ((status = 'pendente') = (decisor_usuario_id IS NULL)),
  CHECK ((status = 'pendente') = (decidido_em IS NULL)),
  -- reprovar sem motivo não existe (a analista precisa saber o porquê)
  CHECK (status <> 'reprovada' OR btrim(coalesce(motivo, '')) <> '')
);
CREATE INDEX etapa_aprovacao_demanda_por_demanda
  ON rh.etapa_aprovacao_demanda (demanda_id, ordem);
CREATE INDEX etapa_aprovacao_demanda_pendente
  ON rh.etapa_aprovacao_demanda (nivel, demanda_id) WHERE status = 'pendente';
CREATE TRIGGER etapa_aprovacao_demanda_tocar
  BEFORE UPDATE ON rh.etapa_aprovacao_demanda
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- (c) pedido de movimentação
-- Uma por demanda (1:1). Promoção exige cargo destino; transferência exige
-- estabelecimento destino — o CHECK impede pedido incompleto.
--
-- CONTROLE DE ENQUADRAMENTO (o "PCCS" do feedback): `faixa_min`/`faixa_max` são
-- SNAPSHOT da faixa vigente do cargo destino no momento do pedido (a tabela
-- salarial é versionada e pode mudar antes da decisão — a proposta é julgada
-- contra a faixa que o solicitante viu). `dentro_faixa` é NULL quando não há o
-- que avaliar (sem salário proposto ou cargo destino sem faixa cadastrada).
-- Fora da faixa SEM justificativa de exceção não existe: é o MESMO padrão da
-- oferta de vaga (rh.oferta, 0012) — o CHECK torna o silêncio impossível.
--
-- `salario_proposto` é DADO SENSÍVEL: entra no payload só de quem tem
-- `rh.posicao.ver` (ou do próprio solicitante, que o digitou) e a leitura grava
-- audit.leitura_sensivel. Ausência, não máscara.
CREATE TABLE rh.demanda_movimentacao (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  demanda_id                  BIGINT NOT NULL UNIQUE REFERENCES rh.demanda (id),
  tipo                        TEXT NOT NULL
                              CHECK (tipo IN ('promocao','transferencia_unidade')),
  colaborador_id              BIGINT NOT NULL REFERENCES rh.colaborador (id),
  cargo_destino_id            BIGINT REFERENCES rh.cargo (id),
  estabelecimento_destino_id  BIGINT REFERENCES rh.estabelecimento (id),
  centro_custo_destino        TEXT,
  salario_proposto            NUMERIC(12,2)
                              CHECK (salario_proposto IS NULL OR salario_proposto >= 0),
  faixa_min                   NUMERIC(12,2),
  faixa_max                   NUMERIC(12,2),
  dentro_faixa                BOOLEAN,
  justificativa_excecao       TEXT,
  data_pretendida             DATE NOT NULL,
  justificativa               TEXT NOT NULL CHECK (btrim(justificativa) <> ''),
  -- rastro do efeito automático (preenchido na aprovação final, na mesma transação)
  aplicada_em                 TIMESTAMPTZ,
  posicao_id                  BIGINT REFERENCES rh.posicao_colaborador (id),
  lotacao_id                  BIGINT REFERENCES rh.lotacao (id),
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tipo <> 'promocao' OR cargo_destino_id IS NOT NULL),
  CHECK (tipo <> 'transferencia_unidade' OR estabelecimento_destino_id IS NOT NULL),
  CHECK ((faixa_min IS NULL) = (faixa_max IS NULL)),
  CHECK (faixa_max IS NULL OR faixa_max >= faixa_min),
  -- fora da faixa sem justificativa de exceção registrada não existe
  CHECK (dentro_faixa IS NOT FALSE
         OR btrim(coalesce(justificativa_excecao, '')) <> ''),
  CHECK (justificativa_excecao IS NULL OR btrim(justificativa_excecao) <> ''),
  CHECK (centro_custo_destino IS NULL OR btrim(centro_custo_destino) <> '')
);
CREATE INDEX demanda_movimentacao_por_colaborador
  ON rh.demanda_movimentacao (colaborador_id, criado_em DESC);
CREATE TRIGGER demanda_movimentacao_tocar
  BEFORE UPDATE ON rh.demanda_movimentacao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

COMMENT ON COLUMN rh.demanda_movimentacao.salario_proposto IS
  'Dado sensível (remuneração): ausente do payload de quem não tem '
  'rh.posicao.ver; leitura grava audit.leitura_sensivel.';
COMMENT ON COLUMN rh.demanda_movimentacao.dentro_faixa IS
  'NULL = não avaliável (sem salário proposto ou cargo destino sem faixa '
  'vigente). FALSE exige justificativa_excecao (CHECK).';

-- ---------------------------------------------------------------- tipos novos (v1 ativa)
-- exige_aprovacao_gestor = TRUE registra o fato de que existe aprovação antes
-- do DP; QUEM aprova e em quantos níveis está nas etapas. SLA de 10 dias
-- corridos cobre a ida ao líder e à diretoria.
INSERT INTO rh.tipo_demanda_versao
  (chave, versao, nome, sla_dias, exige_aprovacao_gestor, status,
   inicio_vigencia, fluxo)
VALUES
  ('promocao', 1, 'Promoção', 10, TRUE, 'ativa', CURRENT_DATE, 'movimentacao'),
  ('transferencia_unidade', 1, 'Transferência de unidade', 10, TRUE, 'ativa',
   CURRENT_DATE, 'movimentacao');

-- ---------------------------------------------------------------- permissões
-- `movimentacao.ciencia` é a peça que mata a dor do feedback: DP e T&D ficam
-- CIENTES automaticamente (notificação na aprovação final) e alcançam o pedido
-- para providenciar os trâmites — sem depender de `demanda.ver.todas`, que o
-- líder de T&D não tem nem deve ter.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('movimentacao.solicitar',
   'Abrir pedido de promoção ou transferência de unidade (líder do colaborador)'),
  ('movimentacao.aprovar.diretoria',
   'Decidir o nível da diretoria na cadeia de promoção/transferência'),
  ('movimentacao.ciencia',
   'Receber ciência de promoção/transferência aprovada e ver o pedido (trâmites de DP e T&D)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  -- quem abre: o líder (dor descrita pela analista) e, em nome dele, DP/RH e diretoria
  ('gestor',    'movimentacao.solicitar'),
  ('rh',        'movimentacao.solicitar'),
  ('dp',        'movimentacao.solicitar'),
  ('diretoria', 'movimentacao.solicitar'),
  -- segundo nível da cadeia
  ('diretoria', 'movimentacao.aprovar.diretoria'),
  -- ciência automática: DP (folha/legal), RH (DP generalista) e T&D
  ('dp',        'movimentacao.ciencia'),
  ('rh',        'movimentacao.ciencia'),
  ('lider_td',  'movimentacao.ciencia'),
  ('diretoria', 'movimentacao.ciencia');

-- ---------------------------------------------------------------- riscos/pendências conhecidos
-- Registrados como EVOLUÇÃO (critério declarado: entregar o núcleo que resolve
-- a dor, não a completude):
--   1. A cadeia é fixa em dois níveis (líder → diretoria). Cadeia parametrizável
--      por tipo/valor (ex.: acima de X exige mais um nível) exigiria um catálogo
--      de etapas versionado como o de rh.etapa_selecao_versao.
--   2. `centro_custo_destino` é texto livre conferido contra o DW só na
--      aplicação (mesma dívida da 0002); transferência sem CC informado herda o
--      CC da lotação vigente.
--   3. Efeito retroativo é recusado pelo serviço (409) quando `data_pretendida`
--      não é posterior ao início da posição/lotação vigente — não há
--      reprocessamento de folha fechada, e não deve haver por atalho.
--   4. Promoção que muda o líder direto do colaborador não altera
--      rh.relacao_gestor: continua ato de DP (rh.gestor.administrar).

COMMIT;
