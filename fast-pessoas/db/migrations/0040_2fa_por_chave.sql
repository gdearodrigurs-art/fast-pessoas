-- 0040_2fa_por_chave.sql
-- A EXIGÊNCIA DE SEGUNDO FATOR passa a ser uma propriedade da CHAVE, e não do
-- nome do papel.
--
-- POR QUE ESTA MIGRATION EXISTE
-- É a mesma doença que a 0039 curou um andar abaixo, agora na porta de entrada.
-- A tela /perfis existe para o administrador compor papel × chave sem chamar
-- dev; só que a segunda etapa de autenticação nunca entrou nessa composição.
-- Ela morava numa lista de nomes de papel no código:
--
--   src/dominios/identidade/servico.ts:33
--     const PAPEIS_COM_2FA = new Set(["rh","recrutador","lider_td","dp","diretoria","admin"]);
--   src/dominios/identidade/servico.ts:93
--     if (PAPEIS_COM_2FA.has(usuario.papel)) { ...exige TOTP... }
--
-- CONSEQUÊNCIA MEDIDA (banco de DEV, 70 colaboradores ativos)
-- Um administrador entrou na tela /perfis e concedeu ao slot `funcionario` as
-- chaves `rh.colaborador.ver` e `rh.colaborador.ver.todos` — o alcance de
-- empresa inteira que a 0039 acabou de criar. Chamada real, HTTP 200:
--
--   PUT /api/perfis/funcionario -> 200  concedidas=["rh.colaborador.ver","rh.colaborador.ver.todos"]
--   POST /api/identidade/entrar {funcionario@fastdemo.local, senha} SEM codigo_totp
--     -> HTTP 200  {"usuario":{...,"papel":"funcionario"},"precisa_configurar_2fa":false}
--   GET /api/colaboradores -> HTTP 200  fichas visiveis: 70
--
-- Ficha de 70 pessoas atrás de uma senha só, porque o papel dele não se chama
-- "dp". O administrador conseguia, pela tela, ampliar o ALCANCE de um perfil —
-- mas não conseguia, por tela nenhuma, elevar a PROTEÇÃO desse mesmo perfil. O
-- controle escapava para o lado permissivo, que é o pior lado para um default
-- escapar, e todo papel futuro nasce sem segundo fator, em silêncio.
--
-- AS DUAS FORMAS AVALIADAS
--   (a) chave própria `identidade.2fa.obrigatorio`, concedida a quem precisa.
--       REJEITADA. Ela não conserta a doença, só a move de lugar: conceder
--       `rh.colaborador.sensivel.ver` a um perfil e ESQUECER de conceder também
--       a chave de 2FA devolve exatamente o buraco de hoje. A proteção
--       continuaria dependendo de alguém lembrar, a cada composição, de uma
--       segunda ação manual — e o esquecimento falha para o lado aberto.
--   (b) DERIVAR: quem tem QUALQUER chave que abra dado sensível ou alcance de
--       empresa inteira passa a exigir 2FA. ESCOLHIDA. A propriedade que
--       queremos vem de graça: compor uma chave dessas sobre QUALQUER papel —
--       inclusive um papel criado amanhã — passa a exigir segundo fator
--       automaticamente, sem ninguém atualizar lista nenhuma. O acoplamento
--       fica na direção certa: a proteção acompanha o que a chave abre.
--
-- (b) PURA NÃO SERVE — MEDIÇÃO QUE OBRIGOU A AJUSTAR
-- O enunciado sugeria derivar de CHAVES_SENSIVEIS (src/dominios/usuarios/
-- esquemas.ts:155). Contado no banco, esse conjunto sozinho REBAIXA dois
-- papéis que hoje exigem 2FA:
--
--   papel `rh`    — 35 chaves, ZERO delas em CHAVES_SENSIVEIS. Mesmo assim lê e
--                   EDITA a ficha das 70 pessoas (rh.colaborador.ver.todos,
--                   rh.colaborador.editar) e o GED inteiro (documento.ver.todos).
--   papel `admin` —  8 chaves, ZERO em CHAVES_SENSIVEIS. Mas tem
--                   perfil.administrar: recompõe qualquer perfil, inclusive
--                   concedendo a si mesmo qualquer chave do sistema; mais
--                   usuario.administrar e rh.auditar (a trilha de quem leu o quê).
--
-- Aplicar (b) pura teria tirado o segundo fator dessas duas contas — violando o
-- requisito de não mexer em login de quem já existe, e para o lado errado. Por
-- isso a régua da coluna abaixo é "chave que exige segundo fator", um conjunto
-- deliberadamente MAIOR que "chave sensível":
--
--   (i)   abre dado sensível de pessoa (as 14 de CHAVES_SENSIVEIS);
--   (ii)  alcança a EMPRESA INTEIRA em dado de pessoa (ver.todos, editar, GED);
--   (iii) administra o próprio controle de acesso ou a trilha de auditoria.
--
-- ONDE A REGRA MORA
-- Na coluna `sistema.permissao.exige_2fa`, ao lado da chave que ela protege.
-- Migration que criar chave nova a declara ali, na mesma transação em que cria
-- a chave — não num arquivo .ts do outro lado do repositório. E o serviço de
-- identidade ainda soma a essa coluna, em OU, o `chaveSensivel()` do TypeScript:
-- é rede de segurança de mão única, que só pode FECHAR. Se uma chave sensível
-- futura entrar no TypeScript e a migration esquecer o flag, ela continua
-- exigindo 2FA; o inverso — flag no banco sem entrada no TypeScript — também
-- exige. Nenhum dos dois esquecimentos abre a porta.
--
-- NADA MUDA PARA QUEM JÁ EXISTE
-- A concessão abaixo é a fotografia exata do que o código fazia. Conferido por
-- SQL contra a composição gravada: exigem 2FA depois desta migration
-- rh, recrutador, lider_td, dp, diretoria e admin — os mesmos seis nomes que
-- estavam chumbados em PAPEIS_COM_2FA; `gestor` e `funcionario` seguem entrando
-- só com senha. A correção é ESTRUTURAL: tira a decisão do nome do papel e põe
-- na chave, sem redistribuir nem afrouxar nada.
--
-- SEM PAREDE DE LOCKOUT
-- Quem passar a exigir 2FA e ainda não tiver `totp_secret` cai no fluxo de
-- enrolamento que já existe desde a 0001 (sessão com claim `pendente_2fa`,
-- redirecionada para /configurar-2fa e barrada em toda rota de negócio). Nunca
-- numa negativa de login: o caminho é sempre "configure e siga".

BEGIN;

ALTER TABLE sistema.permissao
  ADD COLUMN exige_2fa BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN sistema.permissao.exige_2fa IS
  'TRUE = quem receber esta chave, em QUALQUER papel, passa a precisar de segundo fator para entrar. Marque aqui, junto com a chave, sempre que ela abrir dado sensível de pessoa, alcance de empresa inteira ou a administração do próprio controle de acesso.';

-- (i) Dado sensível de pessoa — as mesmas 14 chaves que a tela /perfis já
--     marca com o selo de sensível e que gravam em audit.leitura_sensivel.
UPDATE sistema.permissao SET exige_2fa = TRUE WHERE chave IN (
  'rh.colaborador.sensivel.ver',
  'rh.posicao.ver',
  'rh.posicao.editar',
  'rh.ocorrencia.restrita.ver',
  'afastamento.saude.ver',
  'sst.saude.ver',
  'desligamento.motivo.ver',
  'entrevista.respostas.ver',
  'clima.resposta.individual.ver',
  'documento.sensivel.ver',
  'rs.parecer.ver',
  'avaliacao.resultado.ver',
  'folha.ver',
  'folha.aprovar'
);

-- (ii) Alcance de EMPRESA INTEIRA sobre dado de pessoa. Não é sensível linha a
--      linha, mas é o volume que transforma uma conta comprometida em vazamento
--      de base: 70 fichas, o cadastro delas e o GED inteiro.
--      `rh.colaborador.ver` (alcance de equipe, do gestor) fica DE FORA — é
--      exatamente a fronteira que a 0039 desenhou.
UPDATE sistema.permissao SET exige_2fa = TRUE WHERE chave IN (
  'rh.colaborador.ver.todos',
  'rh.colaborador.editar',
  'documento.ver.todos'
);

-- (iii) Administração do próprio controle de acesso e da auditoria. Quem tem
--       perfil.administrar pode conceder a si mesmo qualquer chave das duas
--       listas acima — proteger só o destino e deixar a chave-mestra sem
--       segundo fator seria trancar a porta e deixar a chave na fechadura.
UPDATE sistema.permissao SET exige_2fa = TRUE WHERE chave IN (
  'usuario.administrar',
  'perfil.administrar',
  'rh.auditar'
);

-- Uma pergunta, uma resposta: o login não precisa saber quais chaves são quais.
CREATE FUNCTION sistema.exige_2fa(p_usuario BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sistema.usuario u
    JOIN sistema.papel_permissao pp ON pp.papel = u.papel
    JOIN sistema.permissao p ON p.chave = pp.chave
    WHERE u.id = p_usuario AND u.ativo AND p.exige_2fa
  );
$$;

COMMIT;
