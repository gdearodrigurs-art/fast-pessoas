-- 0057_pedido_de_revisao_de_valor.sql
-- Onda H3/H4 — o colaborador pede revisão do valor do benefício que ele JÁ TEM.
--
-- O caso que o dono deu: "mudou de casa, a passagem subiu". Depois da H1 a
-- adesão virou ato do DP e o colaborador deixou de pedi-la; o que sobrou para
-- ele foi pedir cancelamento. Faltava a terceira voz: pedir que o VALOR mude.
--
-- POR QUE TABELA, E NÃO TEXTO NA DEMANDA
-- O domínio de benefícios já carrega a chave do benefício dentro da descrição
-- da demanda, lida de volta por regex (beneficios/esquemas.ts:318). Aquilo
-- aguenta uma chave; não aguenta DINHEIRO. Valor pedido em texto livre não dá
-- para somar, comparar com o concedido, nem barrar negativo — é o mesmo defeito
-- que a tela de ponto teve de desfazer quando o formulário virou estruturado.
--
-- O HISTÓRICO NÃO MORA AQUI
-- Aprovar a revisão ENCERRA a adesão vigente e ABRE outra com o valor novo. A
-- cadeia de adesões é o histórico, e `adesao_congelar` (0009:109) torna a
-- encerrada imutável. Esta tabela guarda o PEDIDO — que pode ser negado, e que
-- pode ter valor diferente do que o DP concedeu.

BEGIN;

CREATE TABLE rh.pedido_revisao_beneficio (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- A adesão VIGENTE no momento do pedido. Guardar a adesão (e não o par
  -- pessoa+benefício) é o que amarra o pedido ao valor que ele quer mudar.
  adesao_id      BIGINT NOT NULL REFERENCES rh.adesao (id),
  demanda_id     BIGINT NOT NULL UNIQUE REFERENCES rh.demanda (id),
  -- O que a PESSOA propôs. Não é decisão: o DP concede o valor dele, e é o
  -- concedido que vai para a adesão nova. Os dois convivem de propósito — a
  -- diferença entre pedido e concedido é o que a trilha precisa mostrar.
  valor_pedido   NUMERIC(12,2) NOT NULL CHECK (valor_pedido >= 0),
  motivo         TEXT NOT NULL CHECK (btrim(motivo) <> ''),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pedido_revisao_por_adesao
  ON rh.pedido_revisao_beneficio (adesao_id);

-- Pedido é fato: nasce e não se reescreve. O desfecho vive na demanda (aprovada
-- ou recusada) e, quando aprovado, na cadeia de adesões.
CREATE TRIGGER pedido_revisao_imutavel
  BEFORE UPDATE OR DELETE ON rh.pedido_revisao_beneficio
  FOR EACH ROW EXECUTE FUNCTION audit.bloquear_mutacao();

-- ---------------------------------------------------------------- tipo de demanda
-- rh.tipo_demanda_versao é administrável e chaveada por `chave`, com índice de
-- uma ativa por chave — o tipo novo entra como versão ativa, do mesmo jeito que
-- os dez que já existem.
-- `exige_aprovacao_gestor = false`: o valor do benefício é decisão do DP, não do
-- gestor imediato — a mesma escolha que `adesao_beneficio` já fazia. Passar pelo
-- gestor só acrescentaria um degrau a quem não decide nada aqui.
INSERT INTO rh.tipo_demanda_versao
  (chave, versao, nome, sla_dias, exige_aprovacao_gestor, fluxo, status, inicio_vigencia)
VALUES (
  'revisao_valor_beneficio',
  1,
  'Revisão de valor de benefício',
  5,
  FALSE,
  'padrao',
  'ativa',
  rh.hoje()
);

COMMIT;
