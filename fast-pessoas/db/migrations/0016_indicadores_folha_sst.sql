-- 0016 — catálogo de indicadores das ondas Folha e SST.
-- Somente dados de catálogo (rh.indicador): as fontes de apuração vivem em
-- src/dominios/folha/servico.ts (valorIndicadorFolhaNoPrazo) e
-- src/dominios/sst/servico.ts (valorIndicadorAsosValidos), ligadas no registry
-- src/dominios/indicadores/valores.ts. Agregados apenas — nunca valor de
-- salário nem conteúdo clínico.
BEGIN;

INSERT INTO rh.indicador (chave, nome, area, descricao, unidade, direcao) VALUES
  ('folha_no_prazo', '% de folhas fechadas no prazo', 'Folha',
   'Competências mensais dos últimos 12 meses fechadas até o dia 5 do mês seguinte (America/Sao_Paulo).', '%', 'maior'),
  ('asos_validos', '% de colaboradores ativos com ASO válido', 'SST',
   'Colaboradores ativos com ASO vigente (validade em dia). Sem conteúdo clínico — só contagem.', '%', 'maior')
ON CONFLICT (chave) DO NOTHING;

COMMIT;
