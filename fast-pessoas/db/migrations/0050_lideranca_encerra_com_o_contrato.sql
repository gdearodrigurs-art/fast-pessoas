-- 0050 — a liderança acaba junto com o contrato
--
-- O QUE ESTAVA ERRADO. O encerramento do processo de desligamento gravava
-- data_desligamento e status='desligado' (src/dominios/desligamento/servico.ts)
-- e nunca encerrava a linha de rh.relacao_gestor. Resultado no banco antes
-- desta migration: 9 relações vigentes cujo LIDERADO já estava desligado — a
-- única desligada de verdade era a que a transferência entre empresas (0048)
-- fechou de passagem. "Vigente" é o que o sistema inteiro pergunta
-- (fim_vigencia IS NULL): quem saiu continuava contando como liderado no
-- organograma, no portal do gestor e na régua de quem pode abrir a ficha, e,
-- no papel inverso, um gestor desligado continuava com a equipe pendurada nele
-- — com a aprovação de demanda endereçada a uma conta já desativada.
--
-- A CAUSA foi corrigida no serviço: o mesmo ato que encerra o contrato encerra
-- as relações de liderança do vínculo, NOS DOIS PAPÉIS, com
-- fim_vigencia = data do término efetivo (a liderança valeu enquanto o contrato
-- valeu). Esta migration é o REPARO do que já estava gravado.
--
-- ÓRFÃOS. Quando quem sai era o gestor, a equipe dele NÃO é repassada
-- automaticamente para o gestor do gestor: designar líder é ato do DP, e
-- herdar equipe por efeito colateral daria a um terceiro acesso à ficha, ao
-- ponto e à aprovação de gente que ninguém o designou para liderar. Quem fica
-- sem gestor sobe para a raiz do organograma até o DP registrar o novo — o
-- serviço deixa isso na trilha de auditoria e na linha do tempo de cada um.
--
-- GREATEST: protege o CHECK (fim_vigencia >= inicio_vigencia) no caso de
-- desligamento retroativo a uma relação aberta depois. Sem ele o reparo
-- estouraria a transação inteira por causa de uma linha.

BEGIN;

-- (1) ele era LIDERADO e saiu
UPDATE rh.relacao_gestor rg
   SET fim_vigencia = GREATEST(rg.inicio_vigencia, c.data_desligamento)
  FROM rh.colaborador c
 WHERE c.id = rg.liderado_colaborador_id
   AND c.status = 'desligado'
   AND c.data_desligamento IS NOT NULL
   AND rg.fim_vigencia IS NULL;

-- (2) ele era GESTOR e saiu — a equipe fica sem líder, não pendurada nele
UPDATE rh.relacao_gestor rg
   SET fim_vigencia = GREATEST(rg.inicio_vigencia, g.data_desligamento)
  FROM rh.colaborador g
 WHERE g.id = rg.gestor_colaborador_id
   AND g.status = 'desligado'
   AND g.data_desligamento IS NOT NULL
   AND rg.fim_vigencia IS NULL;

-- Conferência dura: se sobrar liderança vigente com vínculo desligado, a
-- migration falha aqui e não em silêncio na tela do gestor.
DO $$
DECLARE
  sobra INTEGER;
BEGIN
  SELECT count(*) INTO sobra
    FROM rh.relacao_gestor rg
   WHERE rg.fim_vigencia IS NULL
     AND EXISTS (
       SELECT 1 FROM rh.colaborador c
        WHERE c.id IN (rg.liderado_colaborador_id, rg.gestor_colaborador_id)
          AND c.status = 'desligado');
  IF sobra > 0 THEN
    RAISE EXCEPTION
      'Sobraram % relação(ões) de liderança vigentes com vínculo desligado.', sobra;
  END IF;
END $$;

COMMIT;
