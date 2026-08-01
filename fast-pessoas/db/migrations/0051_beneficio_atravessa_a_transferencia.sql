-- 0051 — o benefício atravessa a transferência entre empresas do grupo
--
-- O QUE ESTAVA ERRADO. `aplicarTransferenciaEntreEmpresas` (0048) enumera no
-- cabeçalho tudo o que atravessa e tudo o que não atravessa — posição,
-- alocação, liderança, banco de horas, dependentes, férias — e não diz uma
-- palavra sobre BENEFÍCIO. rh.adesao simplesmente não era tocada. O vínculo
-- velho fechava com as adesões de `fim IS NULL` e o vínculo novo nascia sem
-- nenhuma, e o sistema passava a contar duas histórias sobre a mesma pessoa:
--
--   • pelo RH (`listarAdesoesVigentes`, que filtrava só `a.fim IS NULL`), a
--     Renata aparecia sob a matrícula ENCERRADA com Vale-Refeição,
--     Vale-Alimentação, Plano de Saúde, Plano Odontológico e Convênio
--     Farmácia, debaixo do título "Adesões vigentes" e com os botões de
--     suspender, reativar e cancelar do lado;
--   • pela própria Renata, "Meus benefícios" vinha vazio e o catálogo a
--     convidava a aderir de novo ao plano de saúde que o painel do RH jurava
--     que ela tinha;
--   • pela folha (`listarDescontosDeAdesao` exige `c.status = 'ativo'`), o
--     desconto sumia da competência seguinte sem aviso — enquanto a
--     mensalidade continuava sendo paga à operadora pelo CNPJ velho.
--
-- A REGRA, escrita onde faltava. Benefício é contrato do EMPREGADOR com a
-- operadora, não da pessoa: quando o contrato de trabalho muda de CNPJ, a
-- adesão do CNPJ que sai TERMINA. Mas terminar calado é o que criou o buraco,
-- então o ato passa a ter as duas metades:
--   (a) encerra a adesão no vínculo que fecha, na véspera da admissão nova —
--       o mesmo corte da posição e da alocação, que é o que faz o desconto
--       parar na competência certa;
--   (b) reabre no vínculo novo, a partir da admissão, o que o critério de
--       elegibilidade vigente do benefício admite no destino (o CNPJ novo pode
--       ter outra regra: tipo de vínculo e unidade entram na conta).
-- O que não passa no critério NÃO é recriado no escuro: vira linha explícita
-- no diff do cartão da movimentação, para o DP ver na hora do ato.
--
-- ESTA MIGRATION É O REPARO do que o código antigo já deixou gravado. A causa
-- está corrigida em src/dominios/demandas/servico.ts (transferência) e em
-- src/dominios/beneficios/repositorio.ts (adesão de vínculo desligado deixa de
-- ser chamada de vigente). Sem o reparo, a base continuaria contando a versão
-- errada: consulta nenhuma faz uma linha mentirosa virar verdadeira.
--
-- SEM MUDANÇA DE SCHEMA: nenhuma coluna, nenhum índice, nenhuma função. É
-- reparo de dado, e por isso vem sozinho, legível e conferível linha a linha.
-- Reparo de dado não escreve em audit.alteracao — aquela trilha é de ATO
-- HUMANO na tela, e aqui não houve ato humano nenhum. O rastro deste conserto
-- é este arquivo e a linha dele em public.migracao_aplicada.

BEGIN;

-- População exata do estrago: vínculos SUCEDIDOS por uma transferência
-- (rh.colaborador.sucede_vinculo_id, criada na 0048) que ficaram com adesão de
-- fim aberto. Desligamento comum fica de fora de propósito — lá o benefício
-- acabou com o contrato e não há destino para onde levar; o que fazer com
-- aquelas linhas é outra decisão, de outra tarefa.
CREATE TEMP TABLE reparo_adesao ON COMMIT DROP AS
SELECT a.id                                       AS adesao_id,
       a.beneficio_id,
       a.status,
       a.valor,
       a.desconto,
       novo.id                                    AS vinculo_novo_id,
       novo.data_admissao                         AS inicio_novo,
       -- GREATEST protege o CHECK (fim >= inicio): adesão aberta no próprio
       -- dia da transferência não pode fechar no dia anterior ao seu início.
       GREATEST(a.inicio, novo.data_admissao - 1) AS fim_velho,
       -- Elegibilidade NO DESTINO, pela regra vigente do benefício. É a mesma
       -- pergunta que `atendeCriterio` (beneficios/esquemas.ts) faz na tela:
       -- lista ausente ou vazia = sem restrição naquela dimensão.
       COALESCE(
         (r.criterio->'tipos_vinculo' IS NULL
            OR jsonb_array_length(r.criterio->'tipos_vinculo') = 0
            OR r.criterio->'tipos_vinculo' @> to_jsonb(novo.tipo_vinculo))
         AND
         (r.criterio->'unidades' IS NULL
            OR jsonb_array_length(r.criterio->'unidades') = 0
            OR (lot.estabelecimento_id IS NOT NULL
                AND r.criterio->'unidades' @> to_jsonb(lot.estabelecimento_id))),
         TRUE  -- benefício sem regra vigente: não há critério que barre
       ) AS elegivel_no_destino
  FROM rh.adesao a
  JOIN rh.colaborador velho ON velho.id = a.colaborador_id
  JOIN rh.colaborador novo  ON novo.sucede_vinculo_id = velho.id
  LEFT JOIN rh.regra_elegibilidade_versao r
    ON r.beneficio_id = a.beneficio_id AND r.status = 'ativa'
  LEFT JOIN rh.lotacao lot
    ON lot.colaborador_id = novo.id AND lot.fim_vigencia IS NULL
 WHERE a.fim IS NULL
   AND velho.status = 'desligado';

-- (a) fecha no vínculo que acabou
UPDATE rh.adesao a
   SET fim = rep.fim_velho,
       status = 'cancelada',
       atualizado_em = now()
  FROM reparo_adesao rep
 WHERE a.id = rep.adesao_id;

-- (b) reabre no vínculo novo o que o destino admite. Valor e desconto vêm da
-- adesão que existia: transferência não é momento de renegociar benefício.
INSERT INTO rh.adesao
  (colaborador_id, beneficio_id, status, inicio, valor, desconto)
SELECT rep.vinculo_novo_id,
       rep.beneficio_id,
       -- 'cancelada' exige fim preenchido (CHECK da 0009); a adesão renasce
       -- como estava, e suspensa continua suspensa.
       CASE WHEN rep.status = 'suspensa' THEN 'suspensa' ELSE 'ativa' END,
       rep.inicio_novo,
       rep.valor,
       rep.desconto
  FROM reparo_adesao rep
 WHERE rep.elegivel_no_destino
   -- Idempotência contra reparo manual já feito: o índice adesao_uma_vigente
   -- não admite duas vigentes do mesmo benefício no mesmo vínculo.
   AND NOT EXISTS (
     SELECT 1 FROM rh.adesao ja
      WHERE ja.colaborador_id = rep.vinculo_novo_id
        AND ja.beneficio_id = rep.beneficio_id
        AND ja.fim IS NULL);

-- Conferência dura: se sobrar adesão de fim aberto em vínculo sucedido, a
-- migration falha aqui — e não em silêncio, no painel do RH.
DO $$
DECLARE
  sobra INTEGER;
BEGIN
  SELECT count(*) INTO sobra
    FROM rh.adesao a
    JOIN rh.colaborador velho ON velho.id = a.colaborador_id
   WHERE a.fim IS NULL
     AND velho.status = 'desligado'
     AND EXISTS (SELECT 1 FROM rh.colaborador novo
                  WHERE novo.sucede_vinculo_id = velho.id);
  IF sobra > 0 THEN
    RAISE EXCEPTION
      'Sobraram % adesão(ões) de fim aberto em vínculo sucedido.', sobra;
  END IF;
END $$;

COMMIT;
