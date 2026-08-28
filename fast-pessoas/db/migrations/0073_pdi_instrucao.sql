-- Fase C do "PDI ótimo": a INSTRUÇÃO da IA que escreve o PDI deixa de viver
-- chumbada em src/dominios/pdi/instrucao.ts (INSTRUCAO_PDI) e passa a ser
-- editável pela tela do RH, versionada (eixo 9 — nada chumbado).
--
-- O serviço lê a versão ATIVA daqui; se a tabela estiver vazia, cai no texto do
-- código (fallback). Cada gravação é uma versão nova; só uma fica ativa por vez
-- (o padrão "só cabe um" do projeto, via índice parcial único). A fundamentação
-- do conteúdo está em docs/19-fundamentacao-do-pdi.md.

CREATE TABLE rh.pdi_instrucao (
  id BIGSERIAL PRIMARY KEY,
  texto TEXT NOT NULL CHECK (btrim(texto) <> ''),
  nota TEXT, -- por que esta versão mudou (opcional, para o histórico)
  ativa BOOLEAN NOT NULL DEFAULT true,
  criada_por BIGINT REFERENCES sistema.usuario(id),
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No máximo UMA versão ativa por vez. Gravar uma nova versão desativa a anterior
-- dentro da mesma transação, antes de inserir a nova.
CREATE UNIQUE INDEX pdi_instrucao_uma_ativa
  ON rh.pdi_instrucao ((ativa))
  WHERE ativa;

CREATE INDEX pdi_instrucao_historico
  ON rh.pdi_instrucao (criada_em DESC, id DESC);

-- Prova inline: a trava de "uma ativa" existe, o texto não pode ser vazio e o
-- índice parciais barra duas versões ativas ao mesmo tempo.
DO $$
DECLARE
  duas_ativas BOOLEAN := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'rh' AND indexname = 'pdi_instrucao_uma_ativa'
  ) THEN
    RAISE EXCEPTION 'faltou o índice de unicidade da instrução ativa';
  END IF;

  INSERT INTO rh.pdi_instrucao (texto) VALUES ('prova 1');
  BEGIN
    INSERT INTO rh.pdi_instrucao (texto) VALUES ('prova 2'); -- deve violar a unicidade
    duas_ativas := true;
  EXCEPTION WHEN unique_violation THEN
    duas_ativas := false;
  END;
  IF duas_ativas THEN
    RAISE EXCEPTION 'o índice deveria barrar duas versões ativas ao mesmo tempo';
  END IF;

  -- texto vazio é barrado pelo CHECK
  BEGIN
    UPDATE rh.pdi_instrucao SET ativa = false; -- libera a trava para o teste seguinte
    INSERT INTO rh.pdi_instrucao (texto) VALUES ('   ');
    RAISE EXCEPTION 'texto em branco deveria ter sido barrado pelo CHECK';
  EXCEPTION WHEN check_violation THEN
    NULL; -- esperado
  END;

  -- limpa as linhas de prova: a tabela nasce vazia (o fallback do código vale)
  DELETE FROM rh.pdi_instrucao;
END $$;
