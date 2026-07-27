-- provisionar.sql — executar UMA VEZ por ambiente, como superusuário/admin do banco.
-- Não é migration: criação de credenciais e GRANTs é específica de ambiente.
-- Substitua as senhas por valores do secret manager antes de executar. NUNCA commitar senhas.

-- Credenciais segregadas (uma por fronteira de dado; a aplicação escolhe o pool pela rota)
CREATE ROLE app_rh    LOGIN PASSWORD 'TROCAR_NO_SECRET_MANAGER';
CREATE ROLE app_clima LOGIN PASSWORD 'TROCAR_NO_SECRET_MANAGER';
CREATE ROLE app_folha LOGIN PASSWORD 'TROCAR_NO_SECRET_MANAGER';

-- ------------------------------------------------------------------ app_rh
GRANT USAGE ON SCHEMA sistema, rh, audit TO app_rh;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA sistema, rh TO app_rh;
-- Append-only por GRANT: sem UPDATE/DELETE nas trilhas e na linha do tempo
REVOKE UPDATE, DELETE ON rh.evento_colaborador FROM app_rh;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO app_rh;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO app_rh;  -- leitura p/ telas de auditoria (chave rh.auditar)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA sistema, rh, audit TO app_rh;

-- ------------------------------------------------------------------ app_clima
-- Decisão 2026-07-27: resposta vinculada à pessoa; acesso individual só pela rota
-- da Diretoria (chave clima.resposta.individual.ver) — a segregação aqui garante
-- que o pool do clima não alcança o restante do RH (salário, ocorrências, folha).
GRANT USAGE ON SCHEMA sistema, rh_clima, audit TO app_clima;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA rh_clima TO app_clima;
GRANT SELECT (id, email, nome, papel, ativo) ON sistema.usuario TO app_clima;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO app_clima;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA rh_clima, audit TO app_clima;

-- ------------------------------------------------------------------ app_folha
GRANT USAGE ON SCHEMA sistema, rh, rh_folha, fiscal, audit TO app_folha;
GRANT SELECT ON ALL TABLES IN SCHEMA rh TO app_folha;                -- lê insumos, nunca escreve no RH
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA rh_folha, fiscal TO app_folha;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO app_folha;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA rh_folha, fiscal, audit TO app_folha;

-- Defaults para tabelas futuras criadas pelas migrations (executadas pelo owner)
ALTER DEFAULT PRIVILEGES IN SCHEMA rh      GRANT SELECT, INSERT, UPDATE ON TABLES TO app_rh;
ALTER DEFAULT PRIVILEGES IN SCHEMA rh_clima GRANT SELECT, INSERT, UPDATE ON TABLES TO app_clima;
ALTER DEFAULT PRIVILEGES IN SCHEMA rh_folha GRANT SELECT, INSERT, UPDATE ON TABLES TO app_folha;
ALTER DEFAULT PRIVILEGES IN SCHEMA fiscal  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_folha;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit   GRANT INSERT ON TABLES TO app_rh, app_clima, app_folha;
