-- 0065_transferencia_continuidade_ou_rescisao.sql
-- Pendência #1 (decisão do dono): a transferência entre empresas do grupo passa a
-- ter DOIS modos, escolhidos na hora do pedido:
--
--   • RESCISÃO   — empregador diferente (CNPJs de raiz distinta): o que já existe.
--                  Encerra o vínculo, acerta, e abre um vínculo novo no destino.
--   • CONTINUIDADE — mesmo empregador (matriz↔filial, MESMA raiz de CNPJ): o
--                  contrato SEGUE. Não desliga, não abre vínculo novo, não liquida
--                  banco, não zera férias. Só troca o registro/lotação (empresa,
--                  estabelecimento, centro), no MESMO vínculo. Matrícula, gestor,
--                  cargo, salário, férias, banco de horas, benefício e dependentes
--                  seguem intactos (decisões do dono 11/08/2026).
--
-- A régua é objetiva e o sistema aplica sozinho: matriz e filial compartilham os 8
-- primeiros dígitos do CNPJ (a raiz = o empregador); posições 9-12 distinguem os
-- estabelecimentos. Mesma raiz ⇒ continuidade é possível; raiz diferente ⇒ só
-- rescisão. Sem CNPJ dos dois lados não dá para provar a raiz ⇒ só rescisão.
--
-- Esta migration só prepara o dado: a coluna do modo, o CHECK que relaxa a
-- exigência de matrícula para a continuidade, e a função que decide a raiz. O
-- efeito (o serviço) e a tela vêm nos slices seguintes.

BEGIN;

-- ---------------------------------------------------------------- modo do pedido
ALTER TABLE rh.demanda_movimentacao
  ADD COLUMN modo_transferencia TEXT
    CHECK (modo_transferencia IS NULL
           OR modo_transferencia IN ('continuidade', 'rescisao'));

COMMENT ON COLUMN rh.demanda_movimentacao.modo_transferencia IS
  'Só para transferencia_empresa: continuidade (mesmo empregador, contrato segue) '
  'ou rescisao (empregador diferente, encerra e reabre). NULL nos demais tipos.';

-- Tudo que já existe foi rescisão — era o único caminho até aqui. Backfill antes
-- de apertar o CHECK, senão as linhas antigas (modo NULL) o violariam.
UPDATE rh.demanda_movimentacao
   SET modo_transferencia = 'rescisao'
 WHERE tipo = 'transferencia_empresa';

-- ---------------------------------------------------------------- CHECK por modo
-- Antes: transferencia_empresa exigia SEMPRE matrícula. Agora a matrícula (e o
-- gestor e o tipo de vínculo de destino) só valem para a RESCISÃO; na
-- continuidade eles são mantidos do vínculo de origem, então têm de vir nulos.
ALTER TABLE rh.demanda_movimentacao
  DROP CONSTRAINT demanda_movimentacao_transferencia_empresa_completa;

ALTER TABLE rh.demanda_movimentacao
  ADD CONSTRAINT demanda_movimentacao_transferencia_empresa_completa
    CHECK (
      tipo <> 'transferencia_empresa'
      OR (
        empresa_destino_id IS NOT NULL
        AND estabelecimento_destino_id IS NOT NULL
        AND centro_custo_destino_id IS NOT NULL
        AND modo_transferencia IN ('continuidade', 'rescisao')
        AND (
          -- Rescisão: contrato novo, precisa de matrícula nova.
          (modo_transferencia = 'rescisao'
           AND btrim(coalesce(matricula_destino, '')) <> '')
          -- Continuidade: mesmo contrato — matrícula, gestor e tipo de vínculo
          -- seguem os do vínculo de origem, então não vêm no pedido.
          OR (modo_transferencia = 'continuidade'
              AND matricula_destino IS NULL
              AND tipo_vinculo_destino IS NULL
              AND gestor_destino_colaborador_id IS NULL)
        )
      )
    );

-- ---------------------------------------------------------------- raiz do CNPJ
-- Mesma raiz (8 primeiros dígitos) = mesmo empregador = continuidade possível.
-- Falso se qualquer um dos lados não tiver CNPJ: sem número não se prova a raiz.
CREATE FUNCTION rh.mesma_raiz_cnpj(empresa_a BIGINT, empresa_b BIGINT)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
AS $$
  SELECT a.cnpj IS NOT NULL
     AND b.cnpj IS NOT NULL
     AND substr(a.cnpj, 1, 8) = substr(b.cnpj, 1, 8)
    FROM rh.empresa_grupo a, rh.empresa_grupo b
   WHERE a.id = empresa_a
     AND b.id = empresa_b;
$$;

COMMENT ON FUNCTION rh.mesma_raiz_cnpj(BIGINT, BIGINT) IS
  'Duas empresas do grupo têm a MESMA raiz de CNPJ (mesmo empregador, matriz↔'
  'filial)? Falso se falta CNPJ em algum lado. Decide se cabe continuidade.';

COMMIT;
