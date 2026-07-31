-- 0030_avaliacao_modelo_v2_valores.sql
-- Onda G1 (docs/10, item G1b) — "os valores estão aqui, mas por algum motivo
-- as perguntas puxaram a gente" (docs/11 §4.3, 00:55:48).
--
-- O QUE A INVESTIGAÇÃO ACHOU (e o que NÃO achou):
--   Não há defeito de ligação. Conferido indicador por indicador entre o seed
--   da 0011, o que a API devolve (/api/avaliacoes/{id} → estrutura) e o que a
--   tela desenha: o pilar 3 traz os 9 Valores Fast na ordem certa
--   (Resultado, Velocidade, Determinação, Desenvolvimento, Disciplina,
--   Resiliência, Colaboração, Comunicação, Reconhecimento), com os pesos
--   certos (12 + 8×11 = 100) e cada nome casado com a sua descrição.
--   O defeito é de CONTEÚDO: a "pergunta" que o avaliador lê é a descrição do
--   indicador, e nos 9 valores ela terminava em "Descritores 1–5 a importar de
--   fast_kb_valores_fast.md" — um recado de obra inacabada foi para a tela no
--   lugar da régua. Era isso que estava "puxando errado": os valores eram os
--   da Fast, as perguntas eram um lembrete nosso.
--
-- COMO SE CORRIGE AQUI: parâmetro é DADO VERSIONADO. A v1 está ativa e é
-- imutável (trava do banco) — corrigir é criar a v2 e ativá-la. Ciclos já
-- abertos congelaram a v1 e NÃO são recalculados; a v2 vale para ciclos
-- abertos depois. Exceção estreita e explícita no fim deste arquivo: ciclo
-- ainda ABERTO/EM AVALIAÇÃO e SEM NENHUMA RESPOSTA gravada é repontado para a
-- v2 — nada foi avaliado nele, então não há história para reescrever (ciclo
-- com rascunho, enviado, consolidado ou decidido fica na v1, sempre).
--
-- LIMITE REGISTRADO: o texto definitivo dos descritores é o
-- `fast_kb_valores_fast.md` do Fast-Agente (docs/01-avaliacao-fontes.md: "o
-- ativo de conteúdo só existe no Fast-Agente" — ele não está neste repositório
-- e a diretora disse que iria consertar o conteúdo). A régua abaixo é a
-- redação de partida, com âncoras 1/3/5 observáveis, para o avaliador parar de
-- ler um TODO. Quando o RH trouxer o documento oficial, adotá-lo é a v3 —
-- nunca UPDATE nesta.

BEGIN;

-- ---------------------------------------------------------------- v2 (rascunho)
-- O id sai do próprio INSERT (RETURNING): nunca "o rascunho que existir".
CREATE TEMP TABLE modelo_novo ON COMMIT DROP AS
WITH novo AS (
  INSERT INTO rh.modelo_avaliacao_versao (versao, nome, status, inicio_vigencia)
  SELECT COALESCE(MAX(versao), 0) + 1,
         'Modelo Fast — Dever 30 / Desenvolvimento 40 / Fit Cultural 30, com a régua dos 9 Valores Fast',
         'rascunho',
         (now() AT TIME ZONE 'America/Sao_Paulo')::date
    FROM rh.modelo_avaliacao_versao
  RETURNING id
)
SELECT id FROM novo;

-- Pilares e pesos: os mesmos da v1 (a diretoria não questionou a estrutura).
-- Só o pilar 3 muda de rótulo, para a tela dizer de onde vêm as perguntas.
INSERT INTO rh.pilar_avaliacao (modelo_versao_id, nome, peso, ordem)
SELECT m.id, x.nome, x.peso, x.ordem
  FROM modelo_novo m,
       (VALUES
          ('Dever',                          30, 1),
          ('Desenvolvimento (CHA)',          40, 2),
          ('Fit Cultural — 9 Valores Fast',  30, 3)
       ) AS x (nome, peso, ordem);

-- Indicadores. Pilares 1 e 2 mantêm nome, peso e régua da v1 (nada foi
-- apontado neles). Pilar 3: os 9 Valores Fast agora com régua de verdade —
-- comportamento observável e âncoras 1/3/5, que é o que impede leniência e
-- rigor sem controle (erro 12 da auditoria btime).
-- Evolução registrada: dar o mesmo tratamento de âncoras 1/3/5 a Dever e CHA
-- quando o RH validar a redação — vira a mesma versão do documento oficial.
INSERT INTO rh.indicador_avaliacao (pilar_id, nome, descricao, peso, ordem)
SELECT p.id, i.nome, i.descricao, i.peso, i.ordem
  FROM rh.pilar_avaliacao p
  JOIN modelo_novo m ON m.id = p.modelo_versao_id
  JOIN (VALUES
    -- pilar 1 · Dever (30)
    (1, 'Assiduidade e compromisso',      'Presença, pontualidade e constância no cumprimento dos horários e compromissos assumidos.', 40, 1),
    (1, 'Cumprimento de normas',          'Adesão às normas, políticas e processos internos da Fast.',                                  30, 2),
    (1, 'Responsabilidade com recursos',  'Cuidado com equipamentos, materiais e recursos da empresa.',                                 30, 3),
    -- pilar 2 · Desenvolvimento (CHA) (40)
    (2, 'Conhecimento técnico do cargo',  'Domínio dos conhecimentos exigidos pela descrição de cargo vigente.',                        40, 1),
    (2, 'Habilidade na execução',         'Qualidade, precisão e destreza na execução prática das atividades do cargo.',                30, 2),
    (2, 'Atitude e proatividade',         'Iniciativa, postura profissional e disposição para resolver e melhorar.',                    30, 3),
    -- pilar 3 · Fit Cultural — 9 Valores Fast (30)
    (3, 'Resultado',
        'Entrega o resultado combinado, no prazo e no padrão. 1 = não entrega e não avisa que vai furar; 3 = entrega o combinado quando acompanhado de perto; 5 = entrega acima do combinado e puxa o resultado de quem está ao lado.',
        12, 1),
    (3, 'Velocidade',
        'Age rápido com o que tem, sem esperar condição perfeita. 1 = trava a decisão e a tarefa fica parada esperando; 3 = anda no ritmo pedido, sem antecipar; 5 = resolve na hora, decide com o que tem e comunica o que fez.',
        11, 2),
    (3, 'Determinação',
        'Persiste até concluir, inclusive quando aparece obstáculo. 1 = desiste ou empurra o problema para outro no primeiro obstáculo; 3 = conclui o que começa quando o caminho está claro; 5 = insiste com método, tenta outro caminho e fecha o assunto.',
        11, 3),
    (3, 'Desenvolvimento',
        'Evolui: aprende com erro e com feedback, e aplica o que aprendeu. 1 = repete o mesmo erro depois de orientado; 3 = aceita o feedback e corrige quando cobrado; 5 = busca aprendizado por conta própria e ensina o time.',
        11, 4),
    (3, 'Disciplina',
        'Faz o combinado do jeito combinado: processo, horário, checklist e registro. 1 = pula etapa e improvisa sem avisar; 3 = segue o processo na rotina conhecida; 5 = segue, melhora o processo e deixa o registro pronto para o próximo.',
        11, 5),
    (3, 'Resiliência',
        'Mantém o nível de entrega e o trato sob pressão ou contratempo. 1 = perde o controle ou trava quando a pressão aumenta; 3 = mantém a entrega com apoio do gestor; 5 = mantém a entrega e estabiliza o time em volta.',
        11, 6),
    (3, 'Colaboração',
        'Joga junto: ajuda, compartilha informação e assume o que é do time. 1 = protege território e retém informação; 3 = ajuda quando pedem; 5 = oferece ajuda antes de ser pedido e compartilha o que sabe.',
        11, 7),
    (3, 'Comunicação',
        'Comunica com clareza, franqueza e respeito — inclusive a notícia ruim, na hora certa. 1 = some, omite o problema ou responde de forma áspera; 3 = comunica o necessário quando perguntado; 5 = antecipa a informação, é direto e confere se foi entendido.',
        11, 8),
    (3, 'Reconhecimento',
        'Dá crédito à contribuição dos outros, na frente das pessoas. 1 = puxa o crédito para si ou só aponta erro; 3 = reconhece quando provocado; 5 = reconhece publicamente e com fato concreto.',
        11, 9)
  ) AS i (pilar_ordem, nome, descricao, peso, ordem) ON i.pilar_ordem = p.ordem;

-- Faixas: idênticas à v1 (a régua de faixa não foi questionada).
INSERT INTO rh.faixa_resultado_versao (modelo_versao_id, minimo, maximo, rotulo, recomendacao)
SELECT m.id, x.minimo, x.maximo, x.rotulo, x.recomendacao
  FROM modelo_novo m,
       (VALUES
          (0::numeric,  40::numeric,  'Plano de recuperação',        'recuperar'),
          (40::numeric, 60::numeric,  'Atenção e acompanhamento',    'atencao'),
          (60::numeric, 80::numeric,  'Desenvolver para liderança',  'desenvolver'),
          (80::numeric, 100::numeric, 'Alto desempenho — sucessão',  'sucessao')
       ) AS x (minimo, maximo, rotulo, recomendacao);

-- Conferência das somas ANTES de ativar (mesma regra do serviço em
-- validarAtivacao: pilares = 100 e indicadores = 100 dentro de cada pilar).
DO $$
DECLARE
  v_modelo BIGINT;
  v_soma   INT;
  v_pilar  RECORD;
BEGIN
  SELECT id INTO v_modelo FROM modelo_novo;
  SELECT COALESCE(SUM(peso), 0) INTO v_soma
    FROM rh.pilar_avaliacao WHERE modelo_versao_id = v_modelo;
  IF v_soma <> 100 THEN
    RAISE EXCEPTION 'pesos dos pilares somam % (deveriam somar 100)', v_soma;
  END IF;
  FOR v_pilar IN
    SELECT p.id, p.nome, COALESCE(SUM(i.peso), 0) AS soma
      FROM rh.pilar_avaliacao p
      LEFT JOIN rh.indicador_avaliacao i ON i.pilar_id = p.id
     WHERE p.modelo_versao_id = v_modelo
     GROUP BY p.id, p.nome
  LOOP
    IF v_pilar.soma <> 100 THEN
      RAISE EXCEPTION 'indicadores do pilar "%" somam % (deveriam somar 100)',
        v_pilar.nome, v_pilar.soma;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------- ativação
-- Encerra a v1 e ativa a v2 (nesta ordem: o índice parcial permite uma só ativa).
UPDATE rh.modelo_avaliacao_versao
   SET status = 'encerrada',
       fim_vigencia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE status = 'ativa';

UPDATE rh.modelo_avaliacao_versao
   SET status = 'ativa',
       inicio_vigencia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE id = (SELECT id FROM modelo_novo);

-- ---------------------------------------------------------------- ciclos ainda em branco
-- Só ciclo vivo e SEM NENHUMA resposta gravada: nada foi avaliado nele, então
-- trocar o modelo congelado não reescreve história nenhuma — e evita que a
-- primeira pessoa a responder leia de novo o TODO. Ciclo com rascunho,
-- enviado, consolidado ou decidido NÃO é tocado (a trava do banco também
-- impediria: resposta precisa pertencer ao modelo congelado do ciclo).
UPDATE rh.ciclo_avaliacao ca
   SET modelo_versao_id = (SELECT id FROM modelo_novo)
 WHERE ca.status IN ('aberto', 'em_avaliacao')
   AND NOT EXISTS (
     SELECT 1
       FROM rh.avaliacao a
       JOIN rh.resposta_item r ON r.avaliacao_id = a.id
      WHERE a.ciclo_id = ca.id
   );

-- ---------------------------------------------------------------- quem responde
-- Achado da mesma investigação: a diretora é a gestora vigente de duas pessoas
-- em contrato de experiência, logo é a AVALIADORA dos ciclos delas — mas o
-- papel 'diretoria' não tinha 'avaliacao.responder'. Resultado: ela abria o
-- próprio ciclo e não havia formulário (parte do "que estranho" da reunião), e
-- aqueles dois ciclos não poderiam ser respondidos por ninguém, com prazo de
-- CLT 445/451 correndo. A chave NÃO abre avaliação de terceiros: o serviço só
-- deixa responder o ciclo em que a pessoa é a avaliadora
-- (exigirCicloDoAvaliador → 404 nos demais).
INSERT INTO sistema.papel_permissao (papel, chave)
VALUES ('diretoria', 'avaliacao.responder')
ON CONFLICT (papel, chave) DO NOTHING;

COMMIT;
