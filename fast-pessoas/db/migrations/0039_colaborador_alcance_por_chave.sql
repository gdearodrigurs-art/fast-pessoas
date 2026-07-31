-- 0039_colaborador_alcance_por_chave.sql
-- O ALCANCE de "quem vê quem" passa a ser uma CHAVE, e não o nome do papel.
--
-- POR QUE ESTA MIGRATION EXISTE
-- A tela /perfis (migration 0019) existe para o administrador compor papel ×
-- chave sem chamar dev. Só que o alcance da visão de pessoas NUNCA esteve entre
-- as chaves compostas ali: `rh.colaborador.ver` autoriza VER colaborador, e
-- quem decide se isso significa "a minha equipe" ou "a empresa inteira" era uma
-- comparação de string espalhada por três arquivos:
--
--   src/dominios/colaboradores/servico.ts  resolverEscopo:
--       if (sessao.papel === "gestor") -> alcance "equipe"; senão -> "todos"
--   src/dominios/portais/servico.ts        montarPortalGestor:
--       const escolherGestor = sessao.papel !== "gestor";
--   src/app/page.tsx                       home:
--       const escopoAmplo = sessao.papel !== "gestor";
--
-- CONSEQUÊNCIA MEDIDA (banco de DEV, 70 colaboradores ativos)
-- Concedendo pela tela /perfis a chave `rh.colaborador.ver` — e SÓ ela — a um
-- perfil restrito (o papel `recrutador`, 14 chaves, nenhuma de DP), o usuário
-- daquele papel saltou de 1 ficha visível (alcance "proprio") para as 70
-- (alcance "todos"), e o portal do gestor abriu com o seletor dos 7 gestores da
-- empresa e a equipe de um terceiro. Não porque alguma chave dissesse isso: só
-- porque o papel dele não se chama "gestor". O controle de acesso escapava da
-- tela que deveria governá-lo — e escapava para o lado permissivo, que é o pior
-- lado para um default escapar. Todo papel futuro nasce com alcance de empresa
-- inteira, em silêncio.
--
-- A CORREÇÃO
-- Mesma forma da 0024 (`documento.ver.todos`, que separou "quem envia" de "quem
-- lê tudo" no GED): o escopo global vira chave própria, `rh.colaborador.ver.todos`.
-- A partir daqui as três decisões acima leem a chave, e a régua é uma só:
--
--   sem `rh.colaborador.ver`                -> alcance "proprio"  (só a própria ficha)
--   com `rh.colaborador.ver`                -> alcance "equipe"   (si e liderados vigentes)
--   com `rh.colaborador.ver` + `.ver.todos` -> alcance "todos"    (empresa inteira)
--
-- O default deixa de ser "empresa inteira" e passa a ser "a minha equipe":
-- quem não recebeu explicitamente o alcance amplo não o tem.
--
-- NADA MUDA PARA QUEM JÁ EXISTE
-- A concessão abaixo é a fotografia do que o código fazia: recebe a chave nova
-- exatamente quem hoje tem `rh.colaborador.ver` e cujo papel não é `gestor` —
-- dp, diretoria, rh e lider_td. As sete personas da demo enxergam depois o mesmo
-- número de colaboradores que enxergavam antes (70/70/70/1/70/13/1). A correção
-- é ESTRUTURAL: tira a decisão do nome do papel e põe na chave, sem redistribuir
-- acesso.
--
-- `gestor` NÃO recebe a chave, e é o ponto todo: é dele que sai o alcance
-- "equipe" que a régua nova generaliza para qualquer perfil sem a chave.
-- `admin`, `recrutador` e `funcionario` não têm `rh.colaborador.ver` e seguem
-- sem alcance nenhum sobre a ficha alheia — nada a conceder.

BEGIN;

INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.colaborador.ver.todos',
   'Ver colaboradores da EMPRESA INTEIRA. Sem esta chave, rh.colaborador.ver alcança apenas o próprio usuário e os liderados com relação vigente.');

-- Quem administra pessoal e o T&D (Business Partner, migration 0019) mantêm o
-- alcance que já tinham na prática.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',        'rh.colaborador.ver.todos'),
  ('diretoria', 'rh.colaborador.ver.todos'),
  ('rh',        'rh.colaborador.ver.todos'),
  ('lider_td',  'rh.colaborador.ver.todos');

COMMIT;
