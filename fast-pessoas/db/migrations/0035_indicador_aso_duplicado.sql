-- 0035_indicador_aso_duplicado.sql
-- Central de Metas mostrava DUAS linhas de ASO, e a segunda dizia "sem dados".
--
-- POR QUE ESTA MIGRATION EXISTE
-- O catálogo de indicadores ganhou o ASO duas vezes, em ondas diferentes:
--   0005_metas_indicadores.sql    -> 'aso_validos'  '% de colaboradores com ASO válido'
--   0016_indicadores_folha_sst.sql -> 'asos_validos' '% de colaboradores ativos com ASO válido'
-- A segunda entrou quando o módulo de SST passou a ter fonte de valor de
-- verdade (valorIndicadorAsosValidos), e é a que o registry de
-- src/dominios/indicadores/valores.ts conhece. A primeira nunca teve fonte:
-- ficou ativa no catálogo, sem meta e sem apuração, e a tela — que lista os
-- indicadores ATIVOS e escreve "sem dados" para quem não tem fonte — desenhava
-- as duas lado a lado, no mesmo bloco de SST que a diretoria abriu para
-- conferir a segunda linha (avaliação psicossocial, item G5).
--
-- COMO FICA
-- O legado é DESATIVADO, não apagado: rh.meta_indicador_versao referencia
-- rh.indicador e histórico de meta é dado versionado — apagar linha de catálogo
-- quebraria a leitura do passado de quem tivesse batido meta nela. Aqui não há
-- nenhuma (conferido: zero versões de meta apontando para 'aso_validos'), mas a
-- regra da casa é a mesma: catálogo se encerra, não se apaga. `ativo = FALSE`
-- basta — listarIndicadoresAtivos é o que alimenta a tela e o registry, então
-- nenhum código muda.
--
-- A descrição diz POR QUE saiu, para quem abrir o catálogo daqui a um ano não
-- reativar a duplicata achando que é indicador esquecido.

BEGIN;

UPDATE rh.indicador
   SET ativo = FALSE,
       descricao = COALESCE(descricao || ' ', '') ||
         '[ENCERRADO na 0035: duplicata sem fonte de apuração. O indicador de ASO em uso é a chave asos_validos, criada na 0016 junto com a fonte de valor no módulo de SST.]'
 WHERE chave = 'aso_validos';

COMMIT;
