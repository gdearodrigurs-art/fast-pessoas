-- 0061_dependente_deduz_irrf.sql
-- Pendência #9 (decisão do dono, 11/08/2026): a dedução de dependente do IRRF
-- contava TODA linha de rh.dependente, sem elegibilidade — e o autoatendimento
-- da 0056 deixava a própria pessoa reduzir o imposto sem o DP no caminho.
--
-- Agora só dependente ELEGÍVEL (deduz_irrf = true) baixa a base do IRRF, e a
-- marcação é ATO DO DP (conferência): o autoatendimento insere com o default
-- false, e só o DP (adesao.gerir, /api/beneficios/dependentes) marca true.
--
-- Backfill pela REGRA DE IDADE (Lei 9.250) como ponto de partida: cônjuge e
-- filho com menos de 21 anos (em rh.hoje()) nascem elegíveis; o resto fica false
-- para o DP conferir. Os 24 anos do filho universitário não são rastreados, então
-- caem na conferência do DP (que marca a exceção à mão).

BEGIN;

ALTER TABLE rh.dependente
  ADD COLUMN deduz_irrf BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN rh.dependente.deduz_irrf IS
  'Dependente conta na dedução do IRRF (Lei 9.250)? Ato do DP (conferência). O '
  'autoatendimento (0056) insere false; a folha só abate quem tem true.';

-- Ponto de partida; o DP ajusta a exceção (filho 21-24 universitário, etc.).
UPDATE rh.dependente
   SET deduz_irrf = true
 WHERE parentesco = 'conjuge'
    OR (parentesco = 'filho'
        AND nascimento > (rh.hoje() - INTERVAL '21 years'));

COMMIT;
