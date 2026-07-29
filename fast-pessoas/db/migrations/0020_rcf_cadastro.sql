-- 0020_rcf_cadastro.sql
-- RCF (Responsabilidade Chave da Função) completo no cargo + os dois campos
-- cadastrais que travavam relatórios inteiros + a chave dos relatórios.
--
-- Origem: docs/08-analise-feedback-analista-rh.md (itens 3 e "RCF do cargo")
-- e as decisões do usuário de 2026-07-29 em 00_contexto/decisoes_arquiteturais.md.
-- Modelo oficial transcrito em referencias/rcf-modelo-descritivo-de-cargos.md:
--   Cargo · Setor · Líder Direto · Tipo de contrato · Missão (RCF) ·
--   Atividades a desempenhar · CHA em três colunas · Observações importantes.
--
-- Desenho: o RCF é ATRIBUTO DA VERSÃO do cargo (rh.cargo_versao), não do cargo.
-- Ele muda quando a função muda, e a mudança é versão nova com vigência — o
-- passado nunca é reescrito. Isso mantém o RCF auditável ("qual era o RCF
-- vigente quando a pessoa foi contratada?") e é o que a requisição de vaga
-- (recrutamento) e o pilar CHA da 360 vão pinar.
--
-- Nada aqui é dado sensível: o RCF é documento de gestão, visível a quem vê a
-- ficha. Dado sensível continua sendo salário (rh.posicao_colaborador).

BEGIN;

-- ---------------------------------------------------------------- RCF na versão do cargo
-- `atividades` é LISTA ORDENADA (a ordem é informação no documento impresso) —
-- JSONB array de strings, mesmo tratamento que `cha` já recebe na aplicação.
-- `cargo_lider_id` aponta para o CARGO do líder direto, não para a pessoa: o
-- documento descreve a estrutura ("Líder Direto: Gerente de Loja"), enquanto
-- quem é o gestor da pessoa continua em rh.relacao_gestor com vigência.
ALTER TABLE rh.cargo_versao
  ADD COLUMN setor                  TEXT,
  ADD COLUMN cargo_lider_id         BIGINT REFERENCES rh.cargo (id),
  ADD COLUMN tipo_contrato_previsto TEXT,
  ADD COLUMN missao                 TEXT,
  ADD COLUMN atividades             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN observacoes            TEXT;

-- Mesmos valores de rh.colaborador.tipo_vinculo (o RCF é "tipo de contrato
-- PREVISTO" — o vínculo real da pessoa continua no colaborador).
ALTER TABLE rh.cargo_versao
  ADD CONSTRAINT cargo_versao_tipo_contrato_previsto_valido
    CHECK (tipo_contrato_previsto IS NULL OR tipo_contrato_previsto IN
      ('clt','estagiario','aprendiz','pj','temporario')),
  ADD CONSTRAINT cargo_versao_lider_nao_e_o_proprio
    CHECK (cargo_lider_id IS NULL OR cargo_lider_id <> cargo_id),
  ADD CONSTRAINT cargo_versao_atividades_e_lista
    CHECK (jsonb_typeof(atividades) = 'array');

CREATE INDEX cargo_versao_por_lider ON rh.cargo_versao (cargo_lider_id)
  WHERE cargo_lider_id IS NOT NULL;

-- ---------------------------------------------------------------- CHA nas três colunas do modelo
-- O CHA já nasceu estruturado em 0002 ({"conhecimentos":[],"habilidades":[],
-- "atitudes":[]}), mas o DEFAULT era '{}' e só a aplicação garantia as três
-- listas. Aqui a garantia passa a ser do banco. Normalizamos antes de impor o
-- CHECK, preservando integralmente o conteúdo existente (chave que falta vira
-- lista vazia; nenhum item é perdido).
--
-- A normalização precisa alcançar versões ENCERRADAS, que o trigger
-- cargo_versao_congelar protege de UPDATE. Desligamos o trigger apenas para
-- este saneamento e o religamos na mesma transação — não há janela em que a
-- proteção esteja ausente para a aplicação.
ALTER TABLE rh.cargo_versao DISABLE TRIGGER cargo_versao_congelar;

UPDATE rh.cargo_versao
   SET cha = jsonb_build_object(
         'conhecimentos', COALESCE(cha -> 'conhecimentos', '[]'::jsonb),
         'habilidades',   COALESCE(cha -> 'habilidades',   '[]'::jsonb),
         'atitudes',      COALESCE(cha -> 'atitudes',      '[]'::jsonb))
 WHERE cha IS NULL
    OR NOT (cha ? 'conhecimentos' AND cha ? 'habilidades' AND cha ? 'atitudes');

ALTER TABLE rh.cargo_versao ENABLE TRIGGER cargo_versao_congelar;

ALTER TABLE rh.cargo_versao
  ALTER COLUMN cha SET DEFAULT
    '{"conhecimentos": [], "habilidades": [], "atitudes": []}'::jsonb,
  ADD CONSTRAINT cargo_versao_cha_tres_colunas CHECK (
    jsonb_typeof(cha -> 'conhecimentos') = 'array' AND
    jsonb_typeof(cha -> 'habilidades')   = 'array' AND
    jsonb_typeof(cha -> 'atitudes')      = 'array');

-- ---------------------------------------------------------------- campos cadastrais que faltavam
-- DECISÃO (documentada aqui porque a escolha tem consequência operacional):
-- `data_nascimento` entra NULLABLE. Motivo: a base legada do Nasajon será
-- importada sem retrabalho e forçar NOT NULL exigiria um DEFAULT falso
-- (ex.: 1900-01-01) que envenenaria justamente os relatórios que este campo
-- vem destravar — aniversariantes e faixa de idade. A obrigatoriedade para
-- NOVOS colaboradores é imposta na aplicação (esquema zod da criação), e os
-- relatórios contam explicitamente quantas fichas estão sem a data, para que
-- a lacuna apareça em vez de ficar escondida atrás de um número redondo.
--
-- `genero` é AUTODECLARADO e default 'nao_informado'. LGPD: uso restrito a
-- AGREGADO (relatório de diversidade, com supressão de recortes pequenos).
-- Não entra em listagem, não entra em ficha individual, não é filtro de busca.
ALTER TABLE rh.colaborador
  ADD COLUMN data_nascimento DATE,
  ADD COLUMN genero          TEXT NOT NULL DEFAULT 'nao_informado';

ALTER TABLE rh.colaborador
  ADD CONSTRAINT colaborador_genero_valido
    CHECK (genero IN ('feminino','masculino','outro','nao_informado')),
  -- Sanidade, não regra de negócio: data plausível e anterior à admissão.
  ADD CONSTRAINT colaborador_data_nascimento_plausivel
    CHECK (data_nascimento IS NULL OR
           (data_nascimento > DATE '1900-01-01' AND data_nascimento < data_admissao));

COMMENT ON COLUMN rh.colaborador.genero IS
  'Autodeclarado. LGPD: usar somente em agregado (relatório de diversidade '
  'com mínimo por recorte). Nunca exibir em ficha individual nem em listagem.';

-- ---------------------------------------------------------------- permissão dos relatórios
-- Chave própria: relatório de gente é leitura transversal (toda a base, mesmo
-- fora do alcance de gestor) e por isso não pode pegar carona em
-- rh.colaborador.ver. Só agregados e a lista de aniversariantes passam por ela.
INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('relatorio.ver', 'Ver relatórios de pessoas (agregados; aniversariantes do mês)')
ON CONFLICT (chave) DO NOTHING;

-- `lider_td` (Líder de Treinamento & Desenvolvimento) é papel previsto na
-- correção de segregação de acesso (item 1 do feedback da analista) e pode
-- ainda não existir no CHECK de sistema.usuario.papel. A concessão aqui é
-- inerte até o papel existir — sistema.papel_permissao não tem FK em papel —
-- e evita que o papel nasça sem os relatórios que justificam a sua criação.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('rh',        'relatorio.ver'),
  ('dp',        'relatorio.ver'),
  ('diretoria', 'relatorio.ver'),
  ('lider_td',  'relatorio.ver')
ON CONFLICT (papel, chave) DO NOTHING;

-- ---------------------------------------------------------------- lastro dos dois campos na DEMO
-- Escopo cirúrgico: SÓ contas @fastdemo.local (a empresa fictícia de db/semear).
-- Sem isto, os relatórios de aniversariantes e diversidade nascem vazios na
-- base de demonstração e não há como mostrá-los funcionando ao RH. Em base
-- real este bloco é no-op — nenhuma ficha de pessoa real é tocada.
--
-- Derivação determinística do CPF fictício (mesma base sempre gera os mesmos
-- valores): idade na admissão entre 18 e 45 anos, e gênero distribuído ~40% feminino,
-- ~40% masculino, ~10% outro, ~10% não informado — o não informado FICA na
-- amostra de propósito, para o relatório ter de lidar com ele.
--
-- PENDÊNCIA REGISTRADA: db/semear/02-pessoas.js (de outro dono) ainda não
-- preenche estes dois campos. Ao rodar `npm run db:demo` de novo, as fichas
-- voltam a nascer sem data de nascimento e com gênero 'nao_informado' — o
-- semeador precisa incorporar o mesmo lastro para a demo continuar completa.
UPDATE rh.colaborador c
   SET data_nascimento = c.data_admissao
         - (18 * 365 + substr(c.cpf, 1, 4)::int),   -- 18 a ~45 anos na admissão
       genero = CASE substr(c.cpf, 10, 1)::int % 10
                  WHEN 0 THEN 'feminino'
                  WHEN 1 THEN 'feminino'
                  WHEN 2 THEN 'feminino'
                  WHEN 3 THEN 'feminino'
                  WHEN 4 THEN 'masculino'
                  WHEN 5 THEN 'masculino'
                  WHEN 6 THEN 'masculino'
                  WHEN 7 THEN 'masculino'
                  WHEN 8 THEN 'outro'
                  ELSE 'nao_informado'
                END
 WHERE c.data_nascimento IS NULL
   AND EXISTS (SELECT 1
                 FROM sistema.usuario u
                WHERE u.id = c.usuario_id
                  AND u.email LIKE '%@fastdemo.local');

COMMIT;
