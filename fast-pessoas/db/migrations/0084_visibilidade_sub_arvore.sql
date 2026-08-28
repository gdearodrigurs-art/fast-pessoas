-- 0084_visibilidade_sub_arvore.sql
-- Fase 4 (Visibilidade em camadas), fatias 1 e 2: o alcance "equipe" do gestor
-- vira SUB-ÁRVORE (decisão A2:a do dono, docs/20), e duas leituras que o gestor
-- não tinha passam a existir COM CHAVE PRÓPRIA de alcance-equipe (eixo 4 —
-- decisão por chave, nunca por nome de papel):
--
--   rh.posicao.ver.equipe      salário/cargo da própria sub-árvore (A1:a).
--   rh.disciplinar.ver.equipe  medidas disciplinares dos vínculos que lidera
--                              (A3:a — sub-árvore, e SÓ o vínculo liderado;
--                              nada de vínculo anterior/outro CNPJ — a 0046
--                              barrou o vazamento cross-vínculo de propósito).
--
-- FORA do 2FA obrigatório, DE PROPÓSITO (decisão A1:a): `exige_2fa` fica no
-- DEFAULT FALSE. É o mesmo precedente de `ponto.ver.equipe` (ver a conta em
-- usuarios/esquemas.ts, CHAVES_SENSIVEIS): alcance de EQUIPE é a fronteira que
-- a lista de chaves sensíveis deixa de fora; marcar 2FA aqui mandaria as 6
-- contas do papel gestor (nenhuma com totp_secret) para o enrolamento. Em
-- compensação, a leitura por estas chaves grava audit.leitura_sensivel SEMPRE
-- — é a trilha, não o segundo fator, que protege este alcance.
--
-- A sub-árvore em si NÃO é SQL recursivo: WITH RECURSIVE entra em laço infinito
-- com ciclo na hierarquia (decisão registrada em organograma/repositorio.ts).
-- Quem monta a sub-árvore é o serviço, em JS, com conjunto de visitados e teto
-- de profundidade — o banco só recebe a lista de ids pronta.

BEGIN;

INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('rh.posicao.ver.equipe',
   'Ver cargo e salário da própria sub-árvore (liderados diretos e indiretos). Leitura SEMPRE gera trilha em audit.leitura_sensivel.'),
  ('rh.disciplinar.ver.equipe',
   'Ver medidas disciplinares dos vínculos que lidera (sub-árvore, só o vínculo liderado). Leitura SEMPRE gera trilha em audit.leitura_sensivel.');

-- Concessão ao papel gestor — o motivo de as chaves existirem. Perfis novos
-- compostos em /perfis podem recebê-las (ou perdê-las) pela tela.
INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('gestor', 'rh.posicao.ver.equipe'),
  ('gestor', 'rh.disciplinar.ver.equipe');

-- ---------------------------------------------------------------- prova
DO $$
DECLARE
  v_chaves INT;
  v_gestor INT;
  v_com_2fa INT;
BEGIN
  SELECT count(*) INTO v_chaves FROM sistema.permissao
   WHERE chave IN ('rh.posicao.ver.equipe', 'rh.disciplinar.ver.equipe');
  IF v_chaves <> 2 THEN
    RAISE EXCEPTION 'esperava as 2 chaves de alcance-equipe, achei %', v_chaves;
  END IF;

  SELECT count(*) INTO v_gestor FROM sistema.papel_permissao
   WHERE papel = 'gestor'
     AND chave IN ('rh.posicao.ver.equipe', 'rh.disciplinar.ver.equipe');
  IF v_gestor <> 2 THEN
    RAISE EXCEPTION 'gestor deveria ter as 2 chaves de alcance-equipe, tem %', v_gestor;
  END IF;

  -- A1:a — as chaves ficam FORA do 2FA obrigatório. Se alguém as marcar aqui,
  -- a decisão do dono foi contrariada em silêncio.
  SELECT count(*) INTO v_com_2fa FROM sistema.permissao
   WHERE chave IN ('rh.posicao.ver.equipe', 'rh.disciplinar.ver.equipe')
     AND exige_2fa;
  IF v_com_2fa <> 0 THEN
    RAISE EXCEPTION 'chave de alcance-equipe com exige_2fa=TRUE contraria a decisão A1:a';
  END IF;

  RAISE NOTICE 'sub-árvore: 2 chaves criadas, concedidas ao gestor, fora do 2FA';
END $$;

COMMIT;
