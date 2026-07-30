-- 0024_documento_escopo_leitura.sql
-- Separa ESCREVER de VER TUDO no GED.
--
-- Problema corrigido: a chave `documento.enviar` acumulava duas funções —
-- autorizar o upload E definir quem lê os documentos de TODOS os colaboradores.
-- Com os papéis criados na 0019, `recrutador` e `lider_td` receberam
-- `documento.enviar` (precisam anexar arquivo) e, de carona, passaram a ver
-- contrato, termo e aviso de qualquer pessoa do quadro — exatamente o
-- "histórico de DP" que a segregação da 0019 foi criada para barrar
-- (pedido da analista de RH: R&S não acessa histórico de DP).
--
-- Correção: escopo de leitura global passa a ser a chave própria
-- `documento.ver.todos`, concedida só a quem administra pessoal.
-- `documento.enviar` volta a significar apenas "pode enviar arquivo".

BEGIN;

INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('documento.ver.todos',
   'Ver documentos de qualquer colaborador (escopo global de leitura do GED). Sem esta chave, o usuário vê apenas documentos gerais e os próprios.');

-- Quem administra pessoal mantém o alcance que já tinha na prática.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('rh',        'documento.ver.todos'),
  ('dp',        'documento.ver.todos'),
  ('diretoria', 'documento.ver.todos');

-- recrutador e lider_td: seguem podendo ENVIAR, sem herdar o escopo global.
-- Se o T&D precisar de certificado de terceiros no futuro, a concessão é
-- explícita em /perfis — não mais efeito colateral de outra chave.

COMMIT;
