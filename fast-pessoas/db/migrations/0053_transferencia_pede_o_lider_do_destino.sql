-- 0053 — a transferência entre empresas do grupo pede o líder DO DESTINO
--
-- O QUE ESTAVA ERRADO. `aplicarTransferenciaEntreEmpresas` (0048) recriava a
-- liderança copiando o gestor de ORIGEM para o vínculo que nasce no CNPJ de
-- DESTINO, porque rh.demanda_movimentacao não tinha onde guardar outra
-- resposta: a tabela tem cargo, lotação, centro de custo, empresa, matrícula e
-- tipo de vínculo de destino — e nada de gestor. O diff de auditoria ainda
-- registrava o fato como acerto: "Liderança: líder <nome> mantido".
--
-- O efeito medido na base de desenvolvimento: Renata (vínculo 3396, Supply,
-- CNPJ 41235678000130) ficou pendurada em Rosana (3356, Casa do Montador, CNPJ
-- 41235678000300) pela relação 3258. Com a sessão de Rosana, GET
-- /api/colaboradores/3396 devolvia a ficha inteira, CPF incluído, e a busca
-- trazia a linha já rotulada "empresa_nome: Supply" — a própria resposta dizia,
-- na mesma linha, que a pessoa é de outro CNPJ. Nenhum dos três gestores da
-- Supply via Renata. A segregação por empresa existe para tornar isso visível,
-- e era exatamente aqui que ela não valia.
--
-- O espelho é pior quando quem se transfere é o LÍDER: a rotina reinseria
-- TODOS os liderados sob o vínculo novo, no CNPJ novo, com a razão declarada de
-- "não perder os liderados no organograma" — desenho de árvore comprando
-- acesso a ficha, ponto e aprovação de gente de outra empresa.
--
-- A CORREÇÃO, em duas metades:
--
--   (1) esta coluna: quem vai liderar a pessoa na empresa de destino é CAMPO DO
--       PEDIDO, como já são registro, lotação, centro de custo e matrícula.
--       Nulo é resposta legítima e explícita — "ninguém ainda": o vínculo novo
--       nasce SEM relação de gestor e o DP designa. Melhor um liderado sem
--       líder na Supply do que um líder de outro CNPJ com acesso à ficha, e é
--       a mesma decisão que a 0050 já registrou para o desligamento do gestor
--       ("quem fica sem gestor sobe para a raiz do organograma até o DP
--       registrar o novo").
--
--   (2) no serviço: a liderança de origem NÃO é mais copiada, e o bloco dos
--       liderados só remaneja quem também está na empresa de destino. Quem fica
--       no CNPJ de origem tem a relação encerrada e sai NOMEADO no diff, como
--       pendência de "redefinir líder" para o DP daquela empresa.
--
-- Coluna nula em toda linha existente: nenhum pedido em aberto muda de
-- comportamento por causa desta migration, e nenhuma transferência já aplicada
-- é reescrita (o que passou, passou — o reparo das relações erradas, se o dono
-- quiser, é ato de DP com trilha, não UPDATE cego aqui).

BEGIN;

ALTER TABLE rh.demanda_movimentacao
  ADD COLUMN gestor_destino_colaborador_id BIGINT REFERENCES rh.colaborador(id);

COMMENT ON COLUMN rh.demanda_movimentacao.gestor_destino_colaborador_id IS
  'Quem lidera a pessoa na empresa de DESTINO (só em transferencia_empresa). '
  'NULL = ninguém escolheu: o vínculo novo nasce sem relação de gestor e o DP '
  'designa. Nunca se copia o gestor de origem — ele é de outro CNPJ.';

COMMIT;
