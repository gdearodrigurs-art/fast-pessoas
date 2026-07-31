-- 0029_sst_nr1.sql
-- NR-1 / Avaliação psicossocial — ANDA AO LADO DO ASO, não no lugar dele.
-- Fala da diretoria (docs/11-achados-da-transcricao.md): "o ASO aqui a gente
-- tem que incluir a NR-1, que é o questionário da saúde emocional",
-- "já tem a empresa, já contratei", "talvez entre uma segunda linha,
-- percentual de colaboradores ativos", "todo mundo que fizer o ASO agora já
-- entra nessa modalidade".
--
-- Logo: entidade PRÓPRIA com controle EQUIVALENTE ao do ASO (validade,
-- renovação, painel de vencimento, indicador próprio) e acoplada ao ASO pelo
-- vínculo aso_id — o registro do ASO passa a oferecer, na mesma transação, o
-- registro da avaliação vinculada.
--
-- Dado de SAÚDE (LGPD art. 11), mesmo tratamento do ASO e das restrições:
--   * observacoes_cifradas: cifrado NA APLICAÇÃO (src/lib/cifra.ts, AES-256-GCM,
--     chave fora do banco) — nunca em claro no banco, no log ou na trilha;
--   * classificação de risco e observações ficam AUSENTES do payload de quem
--     não tem sst.saude.ver (ausência, não máscara);
--   * cada leitura decifrada grava audit.leitura_sensivel.
-- Permissões REAPROVEITADAS (nenhuma chave nova): sst.gerir para registrar,
-- sst.ver para o painel/lista sem conteúdo clínico, sst.saude.ver para o
-- conteúdo clínico. Toda mutação grava audit.alteracao; o fato vira
-- rh.evento_colaborador SEM classificação e SEM observações.

BEGIN;

-- ---------------------------------------------------------------- vínculo ASO ↔ avaliação
-- Par (id, colaborador_id) do ASO vira alvo de FK composta: garante NO BANCO
-- que a avaliação vinculada é do MESMO colaborador do ASO que a originou
-- (com aso_id NULL a FK não é checada — MATCH SIMPLE — que é o caso da
-- avaliação avulsa, registrada fora do fluxo do exame).
ALTER TABLE rh.aso ADD CONSTRAINT aso_id_colaborador_unico
  UNIQUE (id, colaborador_id);

-- ---------------------------------------------------------------- avaliação psicossocial (NR-1)
-- validade NULL = sem próxima avaliação definida (o painel a trata como
-- "sem validade registrada", igual ao ASO). Tabela normal: correção é UPDATE
-- auditado via audit.alteracao, sem GRANT de DELETE para a credencial da
-- aplicação (db/provisionar.sql).
CREATE TABLE rh.avaliacao_psicossocial (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  colaborador_id        BIGINT NOT NULL REFERENCES rh.colaborador (id),
  data_avaliacao        DATE NOT NULL,
  -- data-limite informada pela empresa executora — alimenta o painel de vencimento
  validade              DATE,
  -- resultado da NR-1: classificação do risco psicossocial (dado de saúde)
  classificacao_risco   TEXT NOT NULL CHECK (classificacao_risco IN
                          ('baixo','moderado','alto','critico')),
  -- dado de saúde CIFRADO NA APLICAÇÃO — nunca em claro; leitura gera trilha.
  -- Opcional em qualquer classificação: diferente do ASO (onde "apto" não
  -- carrega restrição), a NR-1 admite recomendação de acompanhamento mesmo em
  -- risco baixo — a minimização aqui é "só o que a empresa executora escreveu".
  observacoes_cifradas  TEXT,
  -- laudo/relatório no GED (documento sensível — 0006)
  documento_id          BIGINT REFERENCES rh.documento (id),
  -- ASO que originou a avaliação ("todo mundo que fizer o ASO já entra nessa
  -- modalidade"); NULL = avaliação avulsa, fora do fluxo do exame
  aso_id                BIGINT REFERENCES rh.aso (id),
  -- empresa contratada que aplicou o questionário ("já contratei")
  empresa_executora     TEXT CHECK (empresa_executora IS NULL
                                    OR btrim(empresa_executora) <> ''),
  registrado_por        BIGINT NOT NULL REFERENCES sistema.usuario (id),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (validade IS NULL OR validade > data_avaliacao),
  -- avaliação vinculada é do mesmo colaborador do ASO
  FOREIGN KEY (aso_id, colaborador_id)
    REFERENCES rh.aso (id, colaborador_id)
);
CREATE INDEX avaliacao_psicossocial_por_pessoa
  ON rh.avaliacao_psicossocial (colaborador_id, data_avaliacao DESC);
-- Painel de vencimentos: vencidas / vence em 30 / vence em 31-60 dias
CREATE INDEX avaliacao_psicossocial_vencimento
  ON rh.avaliacao_psicossocial (validade) WHERE validade IS NOT NULL;
-- Um ASO origina NO MÁXIMO uma avaliação (idempotência do fluxo acoplado:
-- clique duplo no formulário não cria duas)
CREATE UNIQUE INDEX avaliacao_psicossocial_por_aso
  ON rh.avaliacao_psicossocial (aso_id) WHERE aso_id IS NOT NULL;
CREATE TRIGGER avaliacao_psicossocial_tocar
  BEFORE UPDATE ON rh.avaliacao_psicossocial
  FOR EACH ROW EXECUTE FUNCTION sistema.tocar_atualizado_em();

-- ---------------------------------------------------------------- catálogo de indicador
-- A "segunda linha" pedida pela diretoria: entra AO LADO de asos_validos
-- (0016), não no lugar. Fonte de apuração em src/dominios/sst/servico.ts
-- (valorIndicadorPsicossocialValida), ligada no registry
-- src/dominios/indicadores/valores.ts. Agregado puro — nenhum conteúdo clínico.
INSERT INTO rh.indicador (chave, nome, area, descricao, unidade, direcao) VALUES
  ('psicossocial_valida',
   '% de colaboradores ativos com avaliação psicossocial válida', 'SST',
   'Colaboradores ativos com avaliação psicossocial (NR-1) dentro da validade. Sem conteúdo clínico — só contagem.',
   '%', 'maior')
ON CONFLICT (chave) DO NOTHING;

COMMIT;
