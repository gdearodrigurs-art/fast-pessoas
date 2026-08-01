-- 0049_hoje_em_sao_paulo.sql
-- "QUE DIA É HOJE" PASSA A TER UMA RESPOSTA SÓ.
--
-- O DEFEITO
-- rh.lotacao_detalhada (0047) resolve os três nomes — empresa do grupo, centro
-- de custo e estabelecimento — em coalesce(l.fim_vigencia, CURRENT_DATE). Para
-- a linha encerrada isso está certo e continua igual: o nome é o daquele dia.
-- Para a linha VIGENTE (fim_vigencia NULL) o "hoje" era CURRENT_DATE, que é a
-- data do relógio do SERVIDOR — e o servidor está em UTC:
--
--     current_setting('TimeZone') = 'UTC'
--
-- O resto do sistema não pergunta isso ao servidor. Os dez repositórios de
-- src/dominios/ carregam, cada um, a mesma constante:
--
--     const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";
--
-- São duas respostas diferentes para a mesma pergunta, e elas divergem todo dia
-- das 21h às 24h de Brasília, quando em UTC já é amanhã:
--
--     agora = 2026-08-01 23:30-03  ->  hoje em São Paulo = 2026-08-01
--                                      CURRENT_DATE em UTC = 2026-08-02
--
-- Nessas três horas, um renome de empresa, centro de custo ou unidade marcado
-- para o dia seguinte entrava em vigor ANTES da hora, e só nas telas servidas
-- pela view: ficha do colaborador, lista de colaboradores, organograma, os
-- seletores de filtro e a origem da movimentação. As mesmas três horas em que
-- rh.estrutura_em(colaborador, HOJE_SP) — a função que a folha usa, que recebe
-- a data pronta de quem chama — continuava respondendo pelo dia certo. Duas
-- telas do mesmo sistema, dois nomes para o mesmo lugar, no mesmo instante.
--
-- A CAUSA
-- Não é a view: é o fato de "hoje" ter duas definições. Enquanto existirem
-- duas, a divergência volta no próximo SQL que alguém escrever. Então esta
-- migration não troca só a expressão — ela dá nome à definição certa:
--
--     rh.hoje()  =  (now() AT TIME ZONE 'America/Sao_Paulo')::date
--
-- STABLE, sem argumento, gêmea exata da constante HOJE_SP do TypeScript. Todo
-- SQL do banco que precisar da data de hoje chama esta função; nenhum chama
-- CURRENT_DATE. O fuso do servidor deixa de ser um dado de negócio.
--
-- O QUE NÃO MUDA
--   * Linha de lotação encerrada: continua resolvendo pelo fim_vigencia dela.
--     O coalesce fica; só o segundo argumento muda de fuso.
--   * rh.estrutura_em e rh_folha.apropriacao_competencia: recebem a data por
--     parâmetro, nunca perguntaram ao relógio. Intocadas.
--   * Assinatura e colunas da view: idênticas. CREATE OR REPLACE preserva
--     permissões e dependentes.
--   * A regra do dono: nada de rótulo de negócio chumbado. 'America/Sao_Paulo'
--     não é rótulo de negócio, é o fuso em que a empresa opera — a mesma
--     string que já está em dez repositórios; esta migration reduz de dez
--     lugares para um a definição do valor.

BEGIN;

-- ================================================================ a definição única
CREATE FUNCTION rh.hoje() RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

COMMENT ON FUNCTION rh.hoje() IS
  'Que dia é hoje para o negócio: a data em America/Sao_Paulo, não a do fuso '
  'do servidor (que é UTC). Gêmea da constante HOJE_SP dos repositórios em '
  'src/dominios/. Todo SQL do banco que precisar de "hoje" chama esta função; '
  'CURRENT_DATE em regra de negócio é bug — das 21h às 24h de Brasília ela '
  'responde amanhã.';

-- ================================================================ a view, com o dia certo
-- Mesmas colunas, mesma ordem, mesmos tipos: só a data de resolução dos nomes
-- deixa de ser a do servidor. O comentário da 0047 continua valendo e vai
-- junto, com a correção embutida.
CREATE OR REPLACE VIEW rh.lotacao_detalhada AS
SELECT l.id,
       l.colaborador_id,
       l.empresa_id,
       eg.cnpj                AS empresa_cnpj,
       egv.nome_fantasia      AS empresa_nome,
       egv.razao_social       AS empresa_razao_social,
       l.estabelecimento_id,
       estv.unidade           AS lotacao_nome,
       estv.endereco_resumido AS lotacao_endereco,
       l.centro_custo_id,
       cc.codigo              AS centro_custo_codigo,
       ccv.nome               AS centro_custo_nome,
       l.centro_custo,
       l.inicio_vigencia,
       l.fim_vigencia
  FROM rh.lotacao l
  JOIN rh.empresa_grupo eg ON eg.id = l.empresa_id
  JOIN rh.centro_custo cc  ON cc.id = l.centro_custo_id
  LEFT JOIN rh.empresa_grupo_versao egv
    ON egv.id = rh.empresa_versao_em(l.empresa_id,
                                     coalesce(l.fim_vigencia, rh.hoje()))
  LEFT JOIN rh.centro_custo_versao ccv
    ON ccv.id = rh.centro_custo_versao_em(l.centro_custo_id,
                                          coalesce(l.fim_vigencia, rh.hoje()))
  LEFT JOIN rh.estabelecimento_versao estv
    ON estv.id = rh.estabelecimento_versao_em(l.estabelecimento_id,
                                              coalesce(l.fim_vigencia, rh.hoje()));

COMMENT ON VIEW rh.lotacao_detalhada IS
  'Os três campos de cada linha de alocação, com nome legível. Data de '
  'referência dos nomes: o fim da vigência (ou hoje EM SÃO PAULO, via '
  'rh.hoje(), se ainda vigente) — a linha do histórico mostra como o lugar se '
  'chamava quando a pessoa saiu dele. Com data na pergunta, use '
  'rh.estrutura_em(colaborador_id, data).';

-- ================================================================ provas finais
DO $$
DECLARE
  data_sp        DATE;
  divergentes    BIGINT;
  views_com_cd   BIGINT;
  nome_utc       TEXT;
  nome_sp        TEXT;
BEGIN
  -- 1. A função responde São Paulo, e responde igual à constante HOJE_SP.
  SELECT rh.hoje() INTO data_sp;
  IF data_sp IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'rh.hoje() não é a data de São Paulo: % <> %',
      data_sp, (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;

  -- 2. A view não depende mais do fuso da SESSÃO. Se dependesse, dois fusos
  --    opostos dariam nomes diferentes para a mesma lotação vigente — que é
  --    exatamente o que acontecia das 21h às 24h de Brasília no servidor UTC.
  SET LOCAL TimeZone = 'Etc/GMT+12';
  SELECT string_agg(empresa_nome || '|' || coalesce(centro_custo_nome,'-') ||
                    '|' || coalesce(lotacao_nome,'-'), ',' ORDER BY id)
    INTO nome_utc FROM rh.lotacao_detalhada WHERE fim_vigencia IS NULL;
  SET LOCAL TimeZone = 'Etc/GMT-14';
  SELECT string_agg(empresa_nome || '|' || coalesce(centro_custo_nome,'-') ||
                    '|' || coalesce(lotacao_nome,'-'), ',' ORDER BY id)
    INTO nome_sp FROM rh.lotacao_detalhada WHERE fim_vigencia IS NULL;
  RESET TimeZone;
  IF nome_utc IS DISTINCT FROM nome_sp THEN
    RAISE EXCEPTION
      'rh.lotacao_detalhada ainda muda de resposta conforme o fuso da sessão';
  END IF;

  -- 3. A view concorda com rh.estrutura_em(colaborador, hoje) para TODA linha
  --    vigente. Eram as duas fontes que divergiam.
  SELECT count(*) INTO divergentes
    FROM rh.lotacao_detalhada ld
    CROSS JOIN LATERAL rh.estrutura_em(ld.colaborador_id, rh.hoje()) e
   WHERE ld.fim_vigencia IS NULL
     AND ld.id = e.lotacao_id
     AND (ld.empresa_nome      IS DISTINCT FROM e.empresa_nome
       OR ld.centro_custo_nome IS DISTINCT FROM e.centro_custo_nome
       OR ld.lotacao_nome      IS DISTINCT FROM e.lotacao_nome);
  IF divergentes <> 0 THEN
    RAISE EXCEPTION
      'view e rh.estrutura_em discordam em % lotação(ões) vigente(s)', divergentes;
  END IF;

  -- 4. Nenhuma view de leitura do banco pergunta a data ao relógio do servidor.
  --    É o guarda que impede o defeito de voltar por outra porta.
  SELECT count(*) INTO views_com_cd
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('v','m')
     AND (n.nspname LIKE 'rh%' OR n.nspname IN ('sistema','audit','public'))
     AND pg_get_viewdef(c.oid) ~* 'current_date';
  IF views_com_cd <> 0 THEN
    RAISE EXCEPTION
      '% view(s) ainda resolvem regra de negócio por CURRENT_DATE — use rh.hoje()',
      views_com_cd;
  END IF;
END;
$$;

COMMIT;
