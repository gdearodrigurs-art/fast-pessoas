-- 0009_beneficios.sql
-- Benefícios (MVP cadastro do docs/03-modulos/04-beneficios.md): catálogo de
-- benefícios, regra de elegibilidade versionada com vigência, adesão do
-- colaborador (ciclo de vida sobre o motor de demandas) e dependentes
-- (LGPD de terceiro — cadastro mínimo). Fronteira permanente: este módulo
-- administra o VÍNCULO e o INSUMO (adesões, valores de tabela); o cálculo
-- legal (teto de 6% do VT, PAT, incidências) é do motor rh_folha — nunca daqui.
-- Padrão versionado do 0002: status rascunho→ativa→encerrada com vigência;
-- mudança é sempre versão/linha nova — nunca UPDATE no que já encerrou.

BEGIN;

-- ---------------------------------------------------------------- guarda de vigência da adesão
-- Espelho de rh.bloquear_vigencia_encerrada (0002), que amarra em fim_vigencia;
-- a adesão usa a coluna `fim`: linha com `fim` preenchido é imutável.
CREATE FUNCTION rh.bloquear_adesao_encerrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.fim IS NOT NULL THEN
    RAISE EXCEPTION 'adesão encerrada é imutável: % não permite %', TG_TABLE_NAME, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- benefício (catálogo)
-- Identidade estável do benefício (slug em `chave`); o que é parametrizável
-- (elegibilidade, valores) vive na versão de regra abaixo. Desativar um
-- benefício não apaga nada: ativo = FALSE apenas fecha para adesões novas.
CREATE TABLE rh.beneficio (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave          TEXT NOT NULL UNIQUE,   -- slug estável (ex.: 'vt', 'plano_saude')
  nome           TEXT NOT NULL,
  categoria      TEXT NOT NULL CHECK (categoria IN
                   ('vt','vr_va','saude','odonto','convenio','outro')),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER beneficio_tocar BEFORE UPDATE ON rh.beneficio
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- regra de elegibilidade (versão com vigência)
-- Parametrizável versionado: critério estruturado em JSONB
-- (ex.: {"tipos_vinculo": ["clt"], "unidades": [1, 3]}) validado na aplicação
-- (zod) contra os domínios de rh.colaborador/estabelecimento. Reajuste de
-- valor/desconto padrão = versão NOVA com vigência; mudança de regra não mexe
-- em adesão existente — vale só para adesões novas. "Fechado não reabre."
CREATE TABLE rh.regra_elegibilidade_versao (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  beneficio_id     BIGINT NOT NULL REFERENCES rh.beneficio (id),
  criterio         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- valores de referência da tabela vigente; NULL = definido caso a caso na adesão
  valor_padrao     NUMERIC(12,2) CHECK (valor_padrao IS NULL OR valor_padrao >= 0),
  desconto_padrao  NUMERIC(12,2) CHECK (desconto_padrao IS NULL OR desconto_padrao >= 0),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','ativa','encerrada')),
  inicio_vigencia  DATE NOT NULL,
  fim_vigencia     DATE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim_vigencia IS NULL OR fim_vigencia >= inicio_vigencia),
  CHECK (status <> 'encerrada' OR fim_vigencia IS NOT NULL)
);
CREATE INDEX regra_elegibilidade_versao_por_beneficio
  ON rh.regra_elegibilidade_versao (beneficio_id, inicio_vigencia DESC);
CREATE UNIQUE INDEX regra_elegibilidade_versao_uma_ativa
  ON rh.regra_elegibilidade_versao (beneficio_id) WHERE status = 'ativa';
CREATE TRIGGER regra_elegibilidade_versao_tocar
  BEFORE UPDATE ON rh.regra_elegibilidade_versao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER regra_elegibilidade_versao_congelar
  BEFORE UPDATE OR DELETE ON rh.regra_elegibilidade_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_versao_encerrada();

-- ---------------------------------------------------------------- adesão (colaborador × benefício)
-- Núcleo do módulo. Nasce de demanda ('adesao_beneficio') ou de registro
-- direto do DP (demanda_id NULL). valor/desconto congelam o acordado na
-- efetivação (a partir dos padrões da regra vigente); NULL = segue o padrão.
-- Cancelamento FECHA a vigência (fim + status), nunca apaga; linha com fim
-- preenchido é imutável (trigger). Efetivação/cancelamento gravam
-- rh.evento_colaborador e audit.alteracao na aplicação. valor/desconto são
-- dado do próprio colaborador: gestor não vê adesões da equipe — ausência
-- do payload, não máscara.
CREATE TABLE rh.adesao (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  beneficio_id    BIGINT NOT NULL REFERENCES rh.beneficio (id),
  status          TEXT NOT NULL DEFAULT 'ativa'
                  CHECK (status IN ('ativa','suspensa','cancelada')),
  inicio          DATE NOT NULL,
  fim             DATE,
  valor           NUMERIC(12,2) CHECK (valor IS NULL OR valor >= 0),
  desconto        NUMERIC(12,2) CHECK (desconto IS NULL OR desconto >= 0),
  demanda_id      BIGINT REFERENCES rh.demanda (id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim IS NULL OR fim >= inicio),
  CHECK (status <> 'cancelada' OR fim IS NOT NULL)
);
CREATE INDEX adesao_por_pessoa ON rh.adesao (colaborador_id, inicio DESC);
CREATE INDEX adesao_por_beneficio ON rh.adesao (beneficio_id, status);
CREATE UNIQUE INDEX adesao_uma_vigente
  ON rh.adesao (colaborador_id, beneficio_id) WHERE fim IS NULL;
CREATE TRIGGER adesao_tocar BEFORE UPDATE ON rh.adesao
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();
CREATE TRIGGER adesao_congelar
  BEFORE UPDATE OR DELETE ON rh.adesao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_adesao_encerrada();

-- ---------------------------------------------------------------- dependente — DADO DE TERCEIRO (LGPD)
-- Cadastro MÍNIMO (minimização por desenho): só o necessário para vincular
-- dependente a benefício. CPF opcional (menores podem não ter). Leitura fora
-- do próprio colaborador exige beneficio.ver/adesao.gerir e grava
-- audit.leitura_sensivel na aplicação; nunca exposto a gestor.
CREATE TABLE rh.dependente (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id  BIGINT NOT NULL REFERENCES rh.colaborador (id),
  nome            TEXT NOT NULL CHECK (btrim(nome) <> ''),
  nascimento      DATE NOT NULL,
  parentesco      TEXT NOT NULL CHECK (parentesco IN ('filho','conjuge','outro')),
  cpf             CHAR(11) CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dependente_por_pessoa ON rh.dependente (colaborador_id);
CREATE TRIGGER dependente_tocar BEFORE UPDATE ON rh.dependente
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- seed do tipo de demanda
-- Adesão via motor de demandas: o colaborador abre a demanda; o DP valida a
-- elegibilidade contra a regra vigente e EFETIVA criando a rh.adesao
-- (a demanda orquestra; o domínio alvo efetiva).
INSERT INTO rh.tipo_demanda_versao
  (chave, versao, nome, sla_dias, exige_aprovacao_gestor, status, inicio_vigencia)
VALUES
  ('adesao_beneficio', 1, 'Adesão a benefício', 5, FALSE, 'ativa', CURRENT_DATE);

-- ---------------------------------------------------------------- permissões
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('beneficio.administrar', 'Gerir catálogo de benefícios e regras de elegibilidade (versões com vigência)'),
  ('beneficio.ver',         'Ver catálogo, adesões e dependentes (leitura de dependente gera trilha)'),
  ('adesao.solicitar',      'Solicitar adesão/cancelamento de benefício para si (via demanda)'),
  ('adesao.gerir',          'Efetivar, suspender e cancelar adesões; gerir dependentes');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',          'beneficio.administrar'),
  ('rh',          'beneficio.ver'),
  ('dp',          'beneficio.ver'),
  ('funcionario', 'adesao.solicitar'),
  ('gestor',      'adesao.solicitar'),
  ('rh',          'adesao.solicitar'),
  ('dp',          'adesao.solicitar'),
  ('diretoria',   'adesao.solicitar'),
  ('admin',       'adesao.solicitar'),
  ('dp',          'adesao.gerir');

COMMIT;
