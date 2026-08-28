-- 0066_pdi_semiautomatico.sql
-- PDI (Plano de Desenvolvimento Individual) semi-automático, montado por IA a
-- partir da avaliação — decisões do dono (11/08/2026):
--
--   • ARRANQUE  — o PDI nasce JÁ, com o que existe hoje: a avaliação do líder
--                 (notas 1–5 por indicador, % final, faixa e a flag de
--                 recomendação). Autoavaliação e 360 de pares são Fase 3; quando
--                 chegarem, viram INPUT a mais que a IA absorve, sem retrabalho.
--   • JULGAMENTO— nível 2: a IA lê o modelo CONGELADO do ciclo e PROPÕE os focos
--                 E redige o plano; um motor genérico (não chumbado num indicador
--                 específico) valida a sanidade (foco em nota alta? ignorou a
--                 flag?) e deixa os avisos à vista. O humano decide no fim.
--   • APROVAÇÃO — dois passos: a IA rascunha → o GESTOR ajusta e submete → o RH
--                 HOMOLOGA. Só depois de homologado é que os itens do plano viram
--                 ações visíveis no portal do colaborador.
--   • PRIVACIDADE — o que é enviado à IA vai SEM identificação (o serviço
--                 desidentifica; salário e saúde nunca saem). O envio é leitura
--                 sensível: grava audit.leitura_sensivel com a chave que autorizou
--                 (eixo 8). Isto a migration não faz — é do serviço; aqui só o dado.
--
-- POR QUE cabeçalho novo e não só reusar acao_aberta: o cabeçalho guarda o que a
-- ação não tem — de qual ciclo veio (materializa um elo que hoje não existe), os
-- parâmetros da mini-entrevista, o rascunho ORIGINAL da IA (para auditar o que a
-- máquina propôs × o que o humano aprovou) e os dois carimbos de aprovação. Os
-- ITENS concretos continuam em rh.acao_aberta (o portal já os lê); a ação só ganha
-- um pdi_id para saber de qual plano nasceu. Sem segunda tabela de itens.
--
-- O QUE NÃO MUDA: rh.acao_aberta segue funcionando igual (pdi_id nasce NULL nas
-- ações avulsas de sempre); o portal do colaborador continua lendo acao_aberta.
-- Esta migration prepara só o dado — o motor, a desidentificação, a chamada à IA,
-- as rotas e a tela vêm nos slices seguintes.

BEGIN;

-- ---------------------------------------------------------------- cabeçalho do PDI
-- Ancorado na PESSOA (eixo 1: o PDI é da pessoa, não do contrato — atravessa a
-- transferência entre CNPJs). ciclo_id é a avaliação de origem (NULL num PDI
-- pontual). rascunho_ia é o que a IA propôs (o serviço nunca o reescreve);
-- conteudo é a versão de trabalho que o gestor edita e que vira final na
-- homologação. avisos são as checagens do motor genérico, à vista do humano.
CREATE TABLE rh.pdi (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pessoa_id       BIGINT NOT NULL REFERENCES rh.pessoa (id),
  ciclo_id        BIGINT REFERENCES rh.ciclo_avaliacao (id),
  status          TEXT NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN
                    ('rascunho','aguardando_homologacao','homologado','cancelado')),
  parametros      JSONB NOT NULL CHECK (jsonb_typeof(parametros) = 'object'),
  rascunho_ia     JSONB NOT NULL CHECK (jsonb_typeof(rascunho_ia) = 'object'),
  conteudo        JSONB NOT NULL CHECK (jsonb_typeof(conteudo) = 'object'),
  avisos          JSONB NOT NULL DEFAULT '[]'::jsonb
                  CHECK (jsonb_typeof(avisos) = 'array'),
  modelo_ia       TEXT NOT NULL CHECK (btrim(modelo_ia) <> ''),
  anonimizado     BOOLEAN NOT NULL DEFAULT TRUE,
  gerado_por      BIGINT NOT NULL REFERENCES sistema.usuario (id),
  gerado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  submetido_por   BIGINT REFERENCES sistema.usuario (id),
  submetido_em    TIMESTAMPTZ,
  homologado_por  BIGINT REFERENCES sistema.usuario (id),
  homologado_em   TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A máquina de estados carrega o autor de cada passo: submetido só existe a
  -- partir de "aguardando_homologacao"; homologado só existe em "homologado".
  CHECK (status NOT IN ('aguardando_homologacao','homologado')
         OR (submetido_por IS NOT NULL AND submetido_em IS NOT NULL)),
  CHECK (status <> 'homologado'
         OR (homologado_por IS NOT NULL AND homologado_em IS NOT NULL))
);

COMMENT ON TABLE rh.pdi IS
  'Plano de Desenvolvimento Individual gerado por IA a partir da avaliação. '
  'Da pessoa (não do vínculo). Fluxo: rascunho (IA/gestor) → aguardando_'
  'homologacao (gestor submete) → homologado (RH publica). Os itens ficam em '
  'rh.acao_aberta (pdi_id); o portal do colaborador lê de lá.';
COMMENT ON COLUMN rh.pdi.rascunho_ia IS
  'Proposta ORIGINAL da IA (focos/pontos_cegos/resumo). Imutável no serviço — é '
  'a prova do que a máquina sugeriu × o que o humano aprovou (auditoria/LGPD).';
COMMENT ON COLUMN rh.pdi.conteudo IS
  'Versão de trabalho editada pelo gestor; vira o plano final na homologação.';
COMMENT ON COLUMN rh.pdi.avisos IS
  'Checagens de sanidade do motor genérico (ex.: foco numa competência de nota '
  'alta, flag de recomendação ignorada). Ficam à vista do gestor e do RH.';
COMMENT ON COLUMN rh.pdi.parametros IS
  'Respostas da mini-entrevista (peso, tipo, horizonte, foco prioritário, '
  'contexto livre já desidentificado). É o padrão que dá flexibilidade sem travar.';

-- Um PDI vivo por ciclo (não trava o pontual, que não tem ciclo).
CREATE UNIQUE INDEX pdi_um_vivo_por_ciclo
  ON rh.pdi (ciclo_id)
  WHERE ciclo_id IS NOT NULL AND status <> 'cancelado';

CREATE INDEX pdi_por_pessoa ON rh.pdi (pessoa_id, gerado_em DESC);

CREATE TRIGGER pdi_tocar BEFORE UPDATE ON rh.pdi
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- item ligado ao PDI
-- A ação existente ganha a origem: de qual PDI ela nasceu. NULL nas ações avulsas
-- de sempre (ocorrência, feedback, manual). Não há segunda tabela de itens.
ALTER TABLE rh.acao_aberta
  ADD COLUMN pdi_id BIGINT REFERENCES rh.pdi (id);

COMMENT ON COLUMN rh.acao_aberta.pdi_id IS
  'PDI que gerou esta ação (NULL nas ações avulsas). O portal do colaborador '
  'segue lendo acao_aberta; pdi_id só dá o rastro de origem.';

CREATE INDEX acao_aberta_por_pdi ON rh.acao_aberta (pdi_id)
  WHERE pdi_id IS NOT NULL;

-- ---------------------------------------------------------------- permissões
-- gerar = o gestor inicia e a IA rascunha (envio externo desidentificado, leitura
-- sensível no serviço); homologar = o RH dá o aval final e publica; ver = ler o
-- cabeçalho e o rascunho (o colaborador vê o resultado pelas ações do portal).
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('pdi.gerar',     'Gerar rascunho de PDI por IA e ajustá-lo (envia dado desidentificado a serviço externo; leitura gera trilha)'),
  ('pdi.homologar', 'Homologar o PDI: aprova o rascunho e publica os itens como ações do colaborador'),
  ('pdi.ver',       'Ver o PDI (cabeçalho, rascunho da IA e avisos)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('gestor',    'pdi.gerar'),
  ('rh',        'pdi.gerar'),
  ('dp',        'pdi.gerar'),
  ('rh',        'pdi.homologar'),
  ('dp',        'pdi.homologar'),
  ('gestor',    'pdi.ver'),
  ('rh',        'pdi.ver'),
  ('dp',        'pdi.ver'),
  ('diretoria', 'pdi.ver');

-- ---------------------------------------------------------------- provas finais
DO $$
BEGIN
  IF to_regclass('rh.pdi') IS NULL THEN
    RAISE EXCEPTION 'rh.pdi não foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'rh' AND table_name = 'acao_aberta'
       AND column_name = 'pdi_id'
  ) THEN
    RAISE EXCEPTION 'rh.acao_aberta.pdi_id ausente';
  END IF;

  IF (SELECT count(*) FROM sistema.permissao
       WHERE chave IN ('pdi.gerar','pdi.homologar','pdi.ver')) <> 3 THEN
    RAISE EXCEPTION 'as três chaves de permissão do PDI não foram todas criadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'rh' AND indexname = 'pdi_um_vivo_por_ciclo'
  ) THEN
    RAISE EXCEPTION 'índice pdi_um_vivo_por_ciclo ausente';
  END IF;
END $$;

COMMIT;
