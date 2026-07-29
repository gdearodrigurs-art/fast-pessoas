-- 0023 — `pesquisa.responder` para os papéis criados na 0019 (recrutador, lider_td).
--
-- Complemento da 0022: quando ela foi escrita, a decisão era "responder é de
-- TODOS" e os papéis existentes eram os 6 da 0001. A 0019 (segregação de acesso
-- pedida pela analista de RH) acrescentou `recrutador` e `lider_td` ao CHECK de
-- sistema.usuario.papel — e sem esta migration essas duas pessoas seriam as
-- únicas da empresa impedidas de responder à pesquisa de clima, o que enviesaria
-- o próprio diagnóstico. `lider_td` já lê o resultado (0022); aqui ele passa a
-- também responder.
--
-- NÃO concedido de propósito:
--   * pesquisa.administrar — montar/abrir pesquisa segue com RH e DP;
--   * pesquisa.plano.gerir — plano de ação é de RH, DP e do gestor da unidade;
--   * pesquisa.resultado.ver para `recrutador` — recrutamento não precisa do
--     clima da empresa para trabalhar (mesmo critério de ausência da 0019).
-- Se a composição mudar, a tela /perfis (perfil.administrar, 0019) resolve sem
-- migration.
--
-- Número: 0023 escolhido fora da reserva do módulo de pesquisas (0022). Se
-- colidir com outra frente, renumerar — o arquivo é idempotente e independente.

BEGIN;

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('recrutador', 'pesquisa.responder'),
  ('lider_td',   'pesquisa.responder')
ON CONFLICT (papel, chave) DO NOTHING;

COMMIT;
