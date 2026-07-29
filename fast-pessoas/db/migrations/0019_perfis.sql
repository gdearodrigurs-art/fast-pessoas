-- 0019_perfis.sql
-- Segregação de perfis de acesso — correção do achado da analista de RH
-- (docs/08-analise-feedback-analista-rh.md, item 1 e 2).
--
-- PROBLEMA CORRIGIDO AQUI
-- O papel `rh` virou balaio: acumulava as chaves de Recrutamento & Seleção
-- (rs.*) E o histórico de Departamento Pessoal (ficha, desligamentos,
-- afastamentos, admissões, férias, ocorrências, SST). Ou seja, quem recruta
-- via a ficha, os afastamentos e as advertências de TODO o quadro. Palavras da
-- analista: "a equipe de R&S não deve ter acesso aos históricos de DP (como
-- cargos, salários, headcount, motivos de desligamento ou advertências)".
-- Não é o que ela quer e não é o que a LGPD recomenda (minimização).
--
-- O mecanismo (permissão por chave, conferida no banco em toda rota) estava
-- certo; faltava GRANULARIDADE DE PAPEL. Esta migration não muda mecanismo
-- nenhum: só recompõe papel → chave e abre a composição para a tela /perfis.
--
-- O QUE ENTRA
--   (a) dois papéis novos no CHECK de sistema.usuario.papel: `recrutador` e
--       `lider_td`;
--   (b) duas chaves novas: `rh.cargo.ver` (leitura de cargo/RCF SEM faixa
--       salarial) e `perfil.administrar` (a tela de composição de perfis);
--   (c) a composição dos dois papéis novos;
--   (d) o REBAIXAMENTO do papel `rh`: saem as chaves rs.*.
--
-- NADA aqui afasta a regra de ouro do projeto: a chave só autoriza; o dado
-- sensível continua AUSENTE do payload de quem não pode ver, e leitura
-- sensível continua gerando trilha em audit.leitura_sensivel.

BEGIN;

-- ---------------------------------------------------------------- (a) papéis
-- O CHECK antigo é anônimo-por-inline e o Postgres o nomeou
-- `usuario_papel_check` (conferido em pg_constraint no banco de DEV). Se o
-- nome divergir, esta migration falha alto — é o comportamento desejado.
--
-- O novo conjunto é SUPERCONJUNTO do antigo: nenhuma linha existente é
-- invalidada (57 funcionários, 6 gestores, 2 rh, 2 dp, 1 diretoria, 1 admin no
-- DEV continuam válidos). A troca é feita em duas etapas dentro da mesma
-- transação para o Postgres revalidar a tabela uma única vez.
ALTER TABLE sistema.usuario DROP CONSTRAINT usuario_papel_check;
ALTER TABLE sistema.usuario ADD CONSTRAINT usuario_papel_check
  CHECK (papel IN (
    'funcionario',   -- self-service
    'gestor',        -- liderados, aprovações, pareceres da própria vaga
    'rh',            -- RH generalista de DP (SEM recrutamento, ver abaixo)
    'recrutador',    -- NOVO: só Recrutamento & Seleção
    'lider_td',      -- NOVO: Treinamento & Desenvolvimento / Business Partner
    'dp',            -- Departamento Pessoal (folha, legal, dado sensível)
    'diretoria',     -- Diretoria de Pessoas
    'admin'          -- administração do sistema
  ));

COMMENT ON COLUMN sistema.usuario.papel IS
  'Papel de acesso do app (≠ cargo funcional). A composição papel → chave vive '
  'em sistema.papel_permissao e é editável na tela /perfis (perfil.administrar), '
  'sem depender de migration.';

-- ---------------------------------------------------------------- (b) chaves novas
INSERT INTO sistema.permissao (chave, descricao) VALUES
  -- Leitura de cargo separada da administração. `rh.cargo.administrar` cria
  -- versão de cargo E faixa salarial (dado de remuneração); quem só precisa
  -- LER o descritivo/RCF e o CHA — recrutador (para escrever a vaga) e líder
  -- de T&D (para desenhar trilha e sucessão) — não pode ganhar a chave de
  -- administração só para isso. Contrato desta chave: cargo, descrição e CHA
  -- sim; faixa_min/faixa_max/vigência da faixa NÃO (a rota omite os campos
  -- para quem não tem rh.cargo.administrar — ausência, não máscara).
  ('rh.cargo.ver',       'Ver cargos, descritivo/RCF e CHA — sem faixa salarial'),
  -- A peça que transforma o RBAC em ferramenta de gestão: o administrador
  -- compõe papel × chave na tela, sem migration. Poder alto de propósito:
  -- quem tem esta chave pode conceder qualquer outra. Só `admin`.
  ('perfil.administrar', 'Compor perfis de acesso: marcar/desmarcar chaves de permissão por papel')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('admin', 'perfil.administrar')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- (c) papel `recrutador`
-- Regra de composição: o domínio de R&S INTEIRO + o mínimo para trabalhar e
-- para ser funcionário da casa. NADA de ficha, desligamento, afastamento,
-- admissão, férias-administrar, SST ou ocorrência.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  -- Recrutamento & Seleção — o trabalho dele.
  ('recrutador', 'rs.ver'),
  ('recrutador', 'rs.gerir'),
  ('recrutador', 'rs.requisicao.criar'),
  ('recrutador', 'rs.parecer.registrar'),
  ('recrutador', 'rs.parecer.ver'),
  -- Mínimo para trabalhar: ler o cargo/RCF que a vaga vai reproduzir.
  ('recrutador', 'rh.cargo.ver'),
  -- Abrir demanda ao DP (ex.: pedir documento de candidato aprovado).
  ('recrutador', 'demanda.criar'),
  -- Documentos: ler os gerais e enviar anexo de processo seletivo.
  ('recrutador', 'documento.ver'),
  ('recrutador', 'documento.enviar'),
  -- Ele também é funcionário da casa: self-service (o serviço restringe ao
  -- próprio registro — nenhuma destas chaves abre o quadro alheio).
  ('recrutador', 'clima.responder'),
  ('recrutador', 'adesao.solicitar'),
  ('recrutador', 'ferias.programar')
ON CONFLICT DO NOTHING;

-- NÃO concedido a `recrutador`, e o motivo de cada ausência:
--   rh.colaborador.ver / .editar  → a ficha do quadro atual não atrai talento;
--                                   é histórico de DP (pedido explícito dela).
--   rh.colaborador.sensivel.ver   → salário individual.
--   rh.posicao.ver / .editar      → cargo + salário com vigência (histórico).
--   desligamento.* / entrevista.* → motivo de desligamento é sigiloso.
--   afastamento.* / sst.*         → saúde; nem o agregado é assunto de R&S.
--   admissao.ver                  → a admissão começa depois da entrega da
--                                   vaga; é processo de DP.
--   ferias.administrar            → painel de vencimento do quadro inteiro.
--   rh.ocorrencia.registrar       → advertência (a analista citou nominalmente).
--   folha.*                       → remuneração.
--   indicador.*                   → headcount e indicadores do quadro.
--   demanda.ver.todas             → veria a demanda de DP de terceiros.
-- RESÍDUO CONHECIDO E ACEITO (registrado, não escondido): rs.gerir expõe a
-- FAIXA salarial do cargo congelada na vaga (rh.tabela_salarial_versao via o
-- catálogo do próprio domínio de R&S) — é insumo indispensável para montar a
-- oferta. É faixa DO CARGO, nunca salário DE PESSOA. Evolução possível:
-- separar `rs.oferta.gerir` de `rs.gerir` e deixar a faixa só na oferta.

-- ---------------------------------------------------------------- (c) papel `lider_td`
-- O contraponto que a própria analista faz: "diferente do recrutamento, o
-- líder de T&D precisa de uma visão estratégica conectada ao DP. Atuando como
-- Business Partner, ele necessita desses dados para desenhar planos de
-- sucessão, calcular o ROI dos treinamentos e estruturar programas baseados em
-- dados reais de headcount e cargos."
-- Leitura de ESTRUTURA e DESENVOLVIMENTO. Sem remuneração, sem saúde, sem
-- motivo de desligamento, sem parecer de seleção.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  -- Estrutura e headcount (o que ela pediu nominalmente).
  ('lider_td', 'rh.colaborador.ver'),
  ('lider_td', 'rh.cargo.ver'),
  ('lider_td', 'indicador.ver'),
  -- Desenvolvimento: modelo de avaliação e resultado consolidado (a base da
  -- trilha e do plano de sucessão). avaliacao.resultado.ver é chave restrita —
  -- a leitura gera trilha em audit.leitura_sensivel, como para DP/diretoria.
  ('lider_td', 'avaliacao.configurar'),
  ('lider_td', 'avaliacao.resultado.ver'),
  ('lider_td', 'rh.feedback.registrar'),
  -- Clima em AGREGADO (nunca resposta individual).
  ('lider_td', 'clima.agregado.ver'),
  -- Material de treinamento e trilha documental.
  ('lider_td', 'documento.ver'),
  ('lider_td', 'documento.enviar'),
  -- Acionar o DP.
  ('lider_td', 'demanda.criar'),
  -- Self-service (também é funcionário da casa).
  ('lider_td', 'clima.responder'),
  ('lider_td', 'adesao.solicitar'),
  ('lider_td', 'ferias.programar')
ON CONFLICT DO NOTHING;

-- NÃO concedido a `lider_td`, e o motivo de cada ausência:
--   rh.colaborador.sensivel.ver   → salário individual. Sucessão e ROI de
--                                   treinamento se fazem com cargo, faixa e
--                                   resultado — não com o salário da pessoa.
--   rh.posicao.ver / .editar      → histórico de cargo+salário por vigência.
--   rh.cargo.administrar          → junto com o cargo vem a faixa salarial;
--                                   ele LÊ o RCF (rh.cargo.ver), não define
--                                   remuneração.
--   folha.*                       → remuneração.
--   afastamento.saude.ver /
--   sst.saude.ver                 → conteúdo clínico.
--   afastamento.ver / sst.ver     → afastamento e SST são operação de DP; T&D
--                                   não precisa do caso individual. Se vier a
--                                   precisar do AGREGADO (ex.: absenteísmo por
--                                   área para priorizar treinamento), o
--                                   caminho é indicador.ver — já concedido —
--                                   e não a leitura caso a caso.
--   desligamento.* / entrevista.* → motivo de desligamento e respostas de
--                                   entrevista são sigilosos (o dado de
--                                   turnover chega por indicador.ver).
--   rs.parecer.ver / rs.gerir     → parecer de seleção é do processo seletivo.
--   rh.ocorrencia.*               → advertência não é insumo de trilha de
--                                   desenvolvimento; feedback formal é
--                                   (rh.feedback.registrar, concedido).
--   clima.resposta.individual.ver → exclusiva da Diretoria de Pessoas.

-- ---------------------------------------------------------------- (d) rebaixar `rh`
-- Quem recruta passa a ser `recrutador`. O papel `rh` continua sendo o RH
-- generalista de DP (ficha, férias, afastamento-leitura, admissão-leitura,
-- desligamento-leitura, ocorrência, entrevista, clima, avaliação, metas) e
-- PERDE o domínio de R&S. Racional de cada remoção:
--
--   rs.gerir             → gerir vaga, pipeline e OFERTA. Pipeline de
--                          candidato e faixa da oferta não são assunto de quem
--                          cuida do histórico de DP; e é justamente o acúmulo
--                          desta chave com rh.colaborador.ver que criou o furo
--                          apontado (mesma pessoa vendo candidato e ficha).
--   rs.ver               → requisições, vagas e pipeline. Mesmo racional.
--   rs.requisicao.criar  → a requisição nasce na ÁREA (gestor, que mantém a
--                          chave) ou no recrutador; o RH de DP não precisa
--                          abrir vaga. dp e diretoria seguem podendo decidir.
--   rs.parecer.registrar → parecer de seleção é do avaliador da etapa
--                          (gestor/recrutador).
--   rs.parecer.ver       → chave RESTRITA (leitura gera trilha): opinião sobre
--                          candidato, inclusive reprovado. Minimização.
--
-- Efeito no DEV: os 2 usuários com papel `rh` perdem acesso a /recrutamento.
-- Quem deve recrutar é reclassificado para `recrutador` em /usuarios. `dp` e
-- `diretoria` mantêm R&S — o módulo não fica órfão.
--
-- Reversível pela tela /perfis (é dado, não schema): se a Fast decidir que um
-- RH generalista específico também recruta, o caminho correto é dar a ele o
-- papel `recrutador` ou recompor o perfil na tela — com o diff auditado.
DELETE FROM sistema.papel_permissao
 WHERE papel = 'rh'
   AND chave IN ('rs.ver', 'rs.gerir', 'rs.requisicao.criar',
                 'rs.parecer.registrar', 'rs.parecer.ver');

COMMIT;
