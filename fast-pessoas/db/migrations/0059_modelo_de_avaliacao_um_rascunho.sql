-- 0059_modelo_de_avaliacao_um_rascunho.sql
-- Achado da varredura geral (revisão adversarial do módulo de avaliação):
-- `criarRascunhoModelo` checava `existeRascunho()` FORA da transação, e a 0011
-- só tinha o índice parcial de UMA ATIVA — não havia guarda para 'rascunho'.
-- Duas criações concorrentes de modelo (dois POST quase juntos, READ COMMITTED)
-- podiam gravar DOIS rascunhos: um fica órfão e bloqueia futuras criações em
-- silêncio (o painel só mostra um, o outro trava o "só um em rascunho").
--
-- O invariante "só cabe um em rascunho" passa a morar no banco — o mesmo sinal
-- `ON (status) WHERE status = '...'` que a 0011 usou para a versão ativa. O
-- serviço passa a traduzir a violação (23505) em 409, em vez do 500 cru.
--
-- Se este índice falhar na criação por já existirem dois rascunhos (fruto da
-- corrida antes desta correção), encerre ou ative um deles e reaplique — não é
-- caso de afrouxar a regra.

BEGIN;

CREATE UNIQUE INDEX modelo_avaliacao_versao_um_rascunho
  ON rh.modelo_avaliacao_versao (status)
  WHERE status = 'rascunho';

COMMIT;
