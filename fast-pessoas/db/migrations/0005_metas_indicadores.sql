-- 0005_metas_indicadores.sql
-- Catálogo de indicadores de RH e metas versionadas com vigência.
-- Decisão: NENHUMA meta em código — catálogo e metas são dados administráveis
-- pelo RH (desenho aprovado em prototipos/metas-indicadores.html).
-- Alterar meta nunca sobrescreve: cria nova versão e a anterior é encerrada
-- (a troca vive no serviço; aqui só o modelo e suas garantias).

BEGIN;

-- ---------------------------------------------------------------- catálogo de indicadores
CREATE TABLE rh.indicador (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave          TEXT NOT NULL UNIQUE
                 CHECK (chave ~ '^[a-z][a-z0-9_]*$'),
  nome           TEXT NOT NULL,
  area           TEXT NOT NULL,      -- agrupamento de exibição (ex.: 'Ponto', 'Clima')
  descricao      TEXT NOT NULL,
  unidade        TEXT NOT NULL CHECK (unidade IN ('%','qtd','dias')),
  direcao        TEXT NOT NULL CHECK (direcao IN ('maior','menor')),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER indicador_tocar BEFORE UPDATE ON rh.indicador
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- metas versionadas
-- Sem estado rascunho: a meta salva já entra ativa (desenho do protótipo).
CREATE TABLE rh.meta_indicador_versao (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  indicador_id        BIGINT NOT NULL REFERENCES rh.indicador (id),
  -- 'global' ou nome da unidade (ex.: 'Unidade Centro')
  escopo              TEXT NOT NULL DEFAULT 'global'
                      CHECK (btrim(escopo) <> ''),
  valor               NUMERIC NOT NULL CHECK (valor >= 0),
  inicio_vigencia     DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ativa'
                      CHECK (status IN ('ativa','encerrada')),
  encerrada_em        TIMESTAMPTZ,
  criado_por_usuario  BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'encerrada') = (encerrada_em IS NOT NULL))
);

-- No máximo UMA versão ativa por indicador+escopo; o serviço encerra a anterior
-- na mesma transação (violação única → 409 na aplicação).
CREATE UNIQUE INDEX meta_indicador_ativa_unica
  ON rh.meta_indicador_versao (indicador_id, escopo)
  WHERE status = 'ativa';
CREATE INDEX meta_indicador_versao_por_indicador
  ON rh.meta_indicador_versao (indicador_id, inicio_vigencia DESC);

-- Versão encerrada é histórico: nunca UPDATE; versão nunca é apagada.
CREATE FUNCTION rh.bloquear_meta_encerrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'meta_indicador_versao: versão nunca é apagada — encerre criando nova versão';
  END IF;
  IF OLD.status = 'encerrada' THEN
    RAISE EXCEPTION 'meta_indicador_versao: versão encerrada é imutável';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meta_versao_protegida
  BEFORE UPDATE OR DELETE ON rh.meta_indicador_versao
  FOR EACH ROW EXECUTE FUNCTION rh.bloquear_meta_encerrada();

-- ---------------------------------------------------------------- seed do catálogo
-- Os 14 indicadores do desenho aprovado (mesmas chaves, áreas e descrições).
-- Inclui entrevista_desligamento como indicador oficial do setor.
INSERT INTO rh.indicador (chave, nome, area, descricao, unidade, direcao) VALUES
  ('entrevista_desligamento', '% de entrevistas de desligamento realizadas', 'Desligamento',
   'Realizadas ÷ desligamentos elegíveis no mês da efetivação. Indicador oficial do setor (Diretoria de Pessoas).', '%', 'maior'),
  ('adesao_checkin', 'Adesão ao check-in diário', 'Clima',
   'Colaboradores que responderam ÷ ativos, média do mês.', '%', 'maior'),
  ('espelho_prazo', '% de espelhos de ponto fechados no prazo', 'Ponto',
   'Espelhos tratados e fechados até o corte da competência.', '%', 'maior'),
  ('horas_extras', 'Horas extras sobre horas trabalhadas', 'Ponto',
   'Total de HE ÷ horas trabalhadas no mês.', '%', 'menor'),
  ('ferias_vencidas', 'Períodos de férias vencidos', 'Férias e afastamentos',
   'Períodos aquisitivos vencidos sem gozo (férias em dobro). Alvo natural: zero.', 'qtd', 'menor'),
  ('ferias_antecedencia', '% de férias programadas com 30+ dias de antecedência', 'Férias e afastamentos',
   'Programações aprovadas respeitando o aviso legal com folga.', '%', 'maior'),
  ('folha_prazo', '% de competências fechadas no prazo interno', 'Folha e obrigações',
   'Fechamento aprovado até o dia-limite definido pelo DP.', '%', 'maior'),
  ('obrigacoes_prazo', '% de obrigações transmitidas no prazo legal', 'Folha e obrigações',
   'eSocial, FGTS Digital e DCTFWeb da competência sem atraso.', '%', 'maior'),
  ('admissao_prazo', '% de admissões com documentação completa no prazo', 'Admissão',
   'Dossiê completo e eventos enviados até a véspera do início.', '%', 'maior'),
  ('tempo_admissao', 'Tempo médio de admissão', 'Admissão',
   'Da aprovação da requisição ao primeiro dia.', 'dias', 'menor'),
  ('avaliacao_ciclo', '% de avaliações concluídas dentro do ciclo', 'Avaliação 360',
   'Avaliações fechadas até o fim do ciclo (experiência e desempenho).', '%', 'maior'),
  ('aso_validos', '% de colaboradores com ASO válido', 'SST',
   'ASOs dentro da validade sobre o total de ativos.', '%', 'maior'),
  ('turnover', 'Turnover mensal', 'Visão geral (RH)',
   'Desligamentos ÷ headcount médio do mês.', '%', 'menor'),
  ('absenteismo', 'Absenteísmo', 'Visão geral (RH)',
   'Horas de ausência não programada ÷ horas previstas.', '%', 'menor');

-- ---------------------------------------------------------------- permissões
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('indicador.ver',         'Ver catálogo de indicadores, metas vigentes e histórico de versões'),
  ('indicador.administrar', 'Criar/editar indicadores e definir nova versão de meta (encerra a anterior)');

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('gestor',    'indicador.ver'),
  ('rh',        'indicador.ver'),
  ('rh',        'indicador.administrar'),
  ('dp',        'indicador.ver'),
  ('dp',        'indicador.administrar'),
  ('diretoria', 'indicador.ver'),
  ('diretoria', 'indicador.administrar');

COMMIT;
