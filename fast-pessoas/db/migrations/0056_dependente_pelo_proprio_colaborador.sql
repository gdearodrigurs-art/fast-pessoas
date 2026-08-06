-- 0056_dependente_pelo_proprio_colaborador.sql — o colaborador passa a manter os
-- PRÓPRIOS dependentes, por uma chave própria, sem depender do DP.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Pedido H5 do plano pós-reunião (docs/10-plano-pos-reuniao-diretoria.md:110),
-- confirmado pela Diretora de Pessoas na transcrição — "dependentes pelo próprio
-- usuário" (docs/11-achados-da-transcricao.md:161).
--
-- Hoje só existe UM caminho de escrita em rh.dependente, e ele é do DP:
--   POST/PATCH/DELETE /api/beneficios/dependentes → exigirPermissao("adesao.gerir")
-- e `adesao.gerir` está concedida a um único papel, `dp`. Medido neste banco:
-- 25 dependentes, 13 titulares, e nenhum deles pôde cadastrar o próprio filho.
-- Quem tem um nascimento para informar abre demanda e espera o DP digitar.
--
-- POR QUE UMA CHAVE NOVA, E NÃO REUSAR `adesao.solicitar`
-- Reusar seria barato e errado por três motivos:
--   (a) `adesao.solicitar` significa "pedir adesão a benefício VIA DEMANDA", e a
--       Onda H1 vai justamente APAGAR esse fluxo ("o botão solicitar adesão
--       desaparece"). Pendurar o cadastro de dependente numa chave em vias de
--       ser esvaziada é amarrar uma coisa nova a uma que vai embora.
--   (b) dependente NÃO é assunto só de benefício: ele deduz IRRF (ver o aviso
--       abaixo). Uma chave que diz "benefício" esconderia o efeito em folha de
--       quem administra perfis pela tela /perfis.
--   (c) eixo 9 — a decisão "o colaborador cadastra sozinho?" tem que ser
--       administrável. Com chave própria, o DP tira a caixa de um perfil e o
--       autosserviço acaba para aquele perfil, sem alterar fonte nem publicar.
--
-- POR QUE ELA **NÃO** É SENSÍVEL E **NÃO** EXIGE 2FA
-- A régua de CHAVES_SENSIVEIS (src/dominios/usuarios/esquemas.ts:230, escrita na
-- 0040 e ampliada na 0044) é: (a) autoriza leitura de dado pessoal de TERCEIRO,
-- ou (b) dá alcance de empresa inteira. Esta chave não faz nem uma nem outra —
-- ela alcança exatamente uma pessoa, a própria, e o alvo nem sequer é
-- parametrizável (sai da sessão, nunca da requisição). Marcá-la como sensível
-- teria um custo medido e concreto: `exige_2fa` mandaria os 60+ usuários de papel
-- `funcionario` e os 6 de `gestor` — hoje todos entrando só com senha, nenhum com
-- totp_secret — para o enrolamento de segundo fator. Seria trocar o fluxo de
-- entrada de todo o quadro por um autosserviço que só mostra o que a pessoa já
-- via no próprio portal.
--   As chaves que ABREM dependente de terceiro continuam sensíveis e continuam
--   exigindo 2FA, sem um caractere mudado: `adesao.gerir` e `beneficio.ver`.
--
-- ⚠ EFEITO EM DINHEIRO — LEVANTADO, NÃO DECIDIDO AQUI
-- src/dominios/folha/repositorio.ts:452 conta rh.dependente para a dedução de
-- IRRF da competência:
--     (SELECT COUNT(*) FROM rh.dependente d WHERE d.colaborador_id = c.id
--        AND (d.nascimento IS NULL OR d.nascimento <= $1)) AS dependentes
-- Ou seja: uma linha a mais aqui é dedução a mais no IRRF de quem a inseriu, sem
-- ninguém do DP no caminho. Não existe teto de quantidade em rh.dependente nem
-- conferência posterior. Esta migration NÃO resolve isso e NÃO finge que resolve
-- — a escolha (cadastro livre com conferência do DP? efeito fiscal só depois de
-- validado? teto administrável?) é do dono, e está escrita com prós e contras em
-- docs/pendencias.md. O que esta migration garante é que a pergunta tenha
-- resposta auditável: toda escrita deixa linha em audit.alteracao com o usuário
-- que a fez.
--
-- O QUE MUDA
--   sistema.permissao        + 1 linha: `dependente.proprio.manter`, exige_2fa
--                            FALSE (o DEFAULT da coluna, criado na 0040).
--   sistema.papel_permissao  + 1 linha por papel que HOJE tem `adesao.solicitar`
--                            — os 8 papéis, isto é, todo mundo que é gente da
--                            casa. A lista sai do banco, não de um literal aqui:
--                            se um papel foi criado ou perdeu a chave desde a
--                            0009, esta migration acompanha em vez de contradizer.
--   rh.dependente            NADA. Nenhuma coluna, nenhuma trava, nenhum dado.
--                            O DP não perde um caminho sequer.
--
-- MIGRATION APLICADA É IMUTÁVEL. Depois que este arquivo rodar em qualquer banco,
-- corrigir é escrever OUTRA migration: o db/migrar.js compara o hash do conteúdo e
-- aborta, e ele está certo em abortar.

BEGIN;

INSERT INTO sistema.permissao (chave, descricao) VALUES
  ('dependente.proprio.manter',
   'Cadastrar, corrigir e remover os PRÓPRIOS dependentes pelo portal do '
   'colaborador (alvo sempre da sessão, nunca da requisição). Não abre '
   'dependente de terceiro — para isso continuam valendo beneficio.ver e '
   'adesao.gerir. Conta para a dedução de IRRF (folha/repositorio.ts:452).');

-- Todo mundo que já podia tratar do próprio benefício passa a poder tratar do
-- próprio dependente. `dp` entra junto porque o DP também é colaborador e tem
-- dependente — o portal dele é o portal dele.
INSERT INTO sistema.papel_permissao (papel, chave)
SELECT papel, 'dependente.proprio.manter'
  FROM sistema.papel_permissao
 WHERE chave = 'adesao.solicitar';

-- Trava de sanidade: se a concessão saiu vazia, a chave existiria sem dono e o
-- autosserviço nasceria desligado para todo mundo — falha silenciosa, do tipo
-- que só aparece na tela do usuário semanas depois.
DO $$
DECLARE
  concedidas INT;
BEGIN
  SELECT count(*) INTO concedidas
    FROM sistema.papel_permissao
   WHERE chave = 'dependente.proprio.manter';
  IF concedidas = 0 THEN
    RAISE EXCEPTION
      'dependente.proprio.manter nasceu sem papel nenhum — nenhum papel tem adesao.solicitar neste banco';
  END IF;
  RAISE NOTICE 'dependente.proprio.manter concedida a % papel(is)', concedidas;
END $$;

COMMIT;
