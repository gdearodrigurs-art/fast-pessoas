-- 0088_modelo_usado_por_vaga_e_imutavel.sql
-- Fecha o gap apontado na revisão do Estágio 2 da fatia RECRUTAMENTO
-- (pendência #13): nada impedia um UPDATE/DELETE/INSERT direto em
-- rh.modelo_selecao_etapa de um modelo que uma VAGA já congelou (0077).
--
-- Por que isso importa AGORA: com a reformulação de modelos existindo pela
-- tela (rotas /api/recrutamento/modelos/[id]/reformular), "mudar o desenho"
-- virou operação corriqueira — e o caminho certo é SEMPRE versão nova
-- (encerra a anterior, publica outra com continua_de). O caminho errado —
-- editar as etapas da versão em uso — reescreveria silenciosamente o pipeline
-- de vagas abertas E a história de candidaturas encerradas, que estão
-- ancoradas nas etapas do modelo congelado. O serviço nunca faz isso; este
-- gatilho garante que NENHUM caminho faz (migration futura, seed, SQL na mão).
--
-- Molde: 0078 (constraint trigger DEFERRABLE). Deferido porque "usado por
-- vaga" é um estado da TRANSAÇÃO inteira: quem cria modelo + etapas + vaga no
-- mesmo COMMIT (semear, cargas) deve ser julgado pelo estado final. Erro em
-- SQLSTATE classe 45 (convenção da 0071): se algum caminho de aplicação um
-- dia esbarrar aqui, o usuário recebe 400 com esta mensagem, não um 500 cru.
--
-- O que o gatilho NÃO bloqueia (de propósito):
--   • encerrar a versão (reformular/aposentar mudam rh.modelo_selecao_versao,
--     não as etapas) — modelo usado por vaga PODE ser encerrado; a vaga segue
--     correndo pela versão congelada;
--   • inserir as etapas de uma versão NOVA (nenhuma vaga aponta para ela);
--   • o PATCH de vaga (troca o ponteiro da vaga, não o desenho do modelo).

BEGIN;

CREATE FUNCTION rh.modelo_selecao_etapa_imutavel_em_uso() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  -- NEW/OLD são NULL na operação que não os tem (molde da 0078); um UPDATE
  -- pode mover a linha de um modelo para outro, então os DOIS lados contam.
  v_alvos  BIGINT[] := ARRAY[]::BIGINT[];
  v_modelo BIGINT;
BEGIN
  IF NEW.modelo_versao_id IS NOT NULL THEN
    v_alvos := v_alvos || NEW.modelo_versao_id;
  END IF;
  IF OLD.modelo_versao_id IS NOT NULL
     AND OLD.modelo_versao_id IS DISTINCT FROM NEW.modelo_versao_id THEN
    v_alvos := v_alvos || OLD.modelo_versao_id;
  END IF;
  FOREACH v_modelo IN ARRAY v_alvos LOOP
    IF EXISTS (SELECT 1 FROM rh.vaga v WHERE v.modelo_versao_id = v_modelo) THEN
      RAISE EXCEPTION
        'O desenho do modelo de seleção % não muda mais: há vaga que o congelou. Mudar o desenho é reformular — versão nova na mesma série.',
        v_modelo
        USING ERRCODE = '45004';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER modelo_selecao_etapa_imutavel_em_uso
  AFTER INSERT OR UPDATE OR DELETE ON rh.modelo_selecao_etapa
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION rh.modelo_selecao_etapa_imutavel_em_uso();

-- ---------------------------------------------------------------- prova
-- Duas cenas, cada uma numa SUBTRANSAÇÃO revertida — nada do que a prova
-- fabrica sobrevive à migration. SET CONSTRAINTS ALL IMMEDIATE dispara os
-- gatilhos deferidos ali mesmo, dentro da subtransação, para dar para
-- capturá-los com EXCEPTION (num DO-block não há COMMIT para esperar).
DO $$
DECLARE
  v_padrao  BIGINT;
  v_usuario BIGINT;
  v_cargo   BIGINT;
  v_cv      BIGINT;
  v_req     BIGINT;
  v_novo    BIGINT;
  pegou     TEXT;
BEGIN
  SELECT id INTO v_padrao
    FROM rh.modelo_selecao_versao WHERE padrao AND status = 'ativa';
  IF v_padrao IS NULL THEN
    RAISE EXCEPTION '0088: não há modelo padrão ativo (a 0076 deveria garantir)';
  END IF;

  -- Cena 1 — modelo USADO por vaga: editar uma etapa dele tem que ser barrado.
  pegou := 'nada';
  BEGIN
    INSERT INTO sistema.usuario (email, nome, papel)
    VALUES ('prova-0088@invalido.local', 'Prova 0088', 'dp')
    RETURNING id INTO v_usuario;
    INSERT INTO rh.cargo DEFAULT VALUES RETURNING id INTO v_cargo;
    INSERT INTO rh.cargo_versao (cargo_id, nome, status, inicio_vigencia)
    VALUES (v_cargo, 'Cargo da prova 0088', 'ativa', rh.hoje())
    RETURNING id INTO v_cv;
    INSERT INTO rh.requisicao_vaga
      (cargo_versao_id, motivo, justificativa, solicitante_usuario_id)
    VALUES (v_cv, 'reposicao', 'Prova da 0088', v_usuario)
    RETURNING id INTO v_req;
    INSERT INTO rh.vaga
      (requisicao_id, titulo, faixa_min, faixa_max, prazo_alvo, modelo_versao_id)
    VALUES (v_req, 'Prova da 0088', 1000, 2000, rh.hoje(), v_padrao);

    UPDATE rh.modelo_selecao_etapa
       SET ordem = ordem + 100
     WHERE modelo_versao_id = v_padrao;
    SET CONSTRAINTS ALL IMMEDIATE;  -- dispara o gatilho deferido aqui dentro
    pegou := 'passou sem barrar';
  EXCEPTION WHEN sqlstate '45004' THEN
    pegou := 'ok';  -- barrou; a subtransação (vaga e tudo) foi desfeita
  END;
  IF pegou <> 'ok' THEN
    RAISE EXCEPTION '0088: edição de modelo usado por vaga não foi barrada (%).', pegou;
  END IF;

  -- Cena 2 — versão NOVA, sem vaga: receber etapas tem que continuar passando
  -- (é exatamente o que a reformulação faz). Reverte-se com um erro próprio.
  pegou := 'nada';
  BEGIN
    INSERT INTO rh.modelo_selecao_versao (nome, padrao, status, inicio_vigencia)
    VALUES ('Prova 0088 — versão sem vaga', false, 'ativa', rh.hoje())
    RETURNING id INTO v_novo;
    -- Copia o desenho do GERAL (que a 0078 garante terminar em oferta).
    INSERT INTO rh.modelo_selecao_etapa (modelo_versao_id, etapa_selecao_versao_id, ordem)
    SELECT v_novo, me.etapa_selecao_versao_id, me.ordem
      FROM rh.modelo_selecao_etapa me
     WHERE me.modelo_versao_id = v_padrao;
    SET CONSTRAINTS ALL IMMEDIATE;  -- 0078 e 0088 rodam: nenhum deve reclamar
    RAISE EXCEPTION 'limpeza da prova' USING ERRCODE = '45999';
  EXCEPTION
    WHEN sqlstate '45999' THEN pegou := 'ok';  -- chegou ao fim sem trinco
    WHEN OTHERS THEN pegou := SQLERRM;
  END;
  IF pegou <> 'ok' THEN
    RAISE EXCEPTION '0088: versão nova sem vaga deveria aceitar etapas (%).', pegou;
  END IF;
END $$;

COMMIT;
