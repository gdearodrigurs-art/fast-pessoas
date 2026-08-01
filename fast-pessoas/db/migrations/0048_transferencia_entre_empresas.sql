-- 0048_transferencia_entre_empresas.sql
-- A TRANSFERÊNCIA ENTRE AS EMPRESAS DO GRUPO vira UM ATO só, com a pessoa
-- preservada. É o caso que motivou a onda inteira.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Palavra do dono do sistema, na reunião:
--
--     "ele demite e recontrata na outra empresa, mas não queria perder os
--      dados e histórico"
--
-- A 0046 tirou o trinco (CPF único saiu do vínculo e foi para rh.pessoa) e a
-- 0047 separou REGISTRO / LOTAÇÃO / CENTRO DE CUSTO. Com as duas no lugar, o
-- banco JÁ AGUENTA duas fichas da mesma gente. O que ainda não existe é o ATO:
-- hoje o caminho é o DP encerrar o processo de desligamento numa tela, ir na
-- tela de cadastro e digitar a pessoa de novo — e é aí que o histórico se
-- perde, porque:
--   * são dois atos separados, sem nada ligando um ao outro;
--   * a tela de cadastro RECUSA o CPF repetido (colaboradores/servico.ts) e
--     cria conta de acesso nova, que a 0046 justamente proibiu;
--   * nenhum número do sistema sabe que a saída e a entrada são a MESMA
--     pessoa andando de lado — o turnover conta uma demissão e uma admissão
--     que não aconteceram.
--
-- ============================================================== O DESENHO
-- A transferência é uma MOVIMENTAÇÃO, no motor que já existe (0021): mesmo
-- cartão, mesma cadeia líder → diretoria, mesma ciência automática de DP e
-- T&D, mesmo efeito aplicado na MESMA transação da aprovação final.
--
--   tipo = 'transferencia_empresa'
--     encerra o vínculo na empresa A  (status desligado + data)
--     abre o vínculo na empresa B     (mesma pessoa_id, matrícula nova)
--     liga um ao outro                (rh.colaborador.sucede_vinculo_id)
--
-- Não é tipo novo de demanda com fluxo novo: é a terceira movimentação, ao
-- lado de 'promocao' e 'transferencia_unidade'. A diferença entre a
-- transferência de UNIDADE e a de EMPRESA é exatamente a linha que a 0047
-- deixou escrita: mudar de local não muda o CNPJ empregador, e mudar de CNPJ
-- é outro contrato de trabalho — não dá para representar como troca de
-- lotação, porque a matrícula, o eSocial e o empregador mudam.
--
-- ------------------------------------------------------- o elo: sucede_vinculo_id
-- rh.colaborador ganha `sucede_vinculo_id`: "este vínculo é a CONTINUAÇÃO
-- daquele". É a única coluna nova em rh.colaborador nesta migration, e ela
-- carrega três respostas de uma vez:
--   1. o vínculo antigo não foi encerrado por saída do grupo — foi sucedido;
--   2. a ficha sabe montar a linha da vida da pessoa na ordem certa;
--   3. os indicadores de quadro sabem NÃO contar a transferência como
--      demissão e admissão (ver a seção de turnover mais abaixo).
--
-- UNIQUE porque um vínculo é sucedido no máximo UMA vez: se ele já foi
-- continuado em outro CNPJ, não pode ser continuado de novo em um terceiro
-- pelo mesmo ponto — a próxima transferência sai do vínculo NOVO. Sem o
-- UNIQUE, um erro de operação criaria dois "filhos" do mesmo contrato e a
-- linha da vida viraria árvore.
--
-- ================================== O QUE ATRAVESSA E O QUE NÃO ATRAVESSA
-- Esta é a parte que o dono precisa poder ler e discordar. Cada item tem a
-- regra e o PORQUÊ. Onde a resposta depende de decisão dele, está escrito o
-- caminho CONSERVADOR e a pergunta ficou registrada no relatório da tarefa.
--
-- (a) A PESSOA — ATRAVESSA. É o ponto inteiro. Mesmo rh.pessoa: mesmo CPF,
--     mesmo nome, nascimento, gênero, retrato e contexto histórico. O vínculo
--     novo nasce com o mesmo pessoa_id, e a projeção da 0046 desce tudo.
--
-- (b) A CONTA DE ACESSO — ATRAVESSA. Já é da pessoa desde a 0046
--     (sistema.usuario.pessoa_id UNIQUE). Não se cria login novo, não se
--     reenvia senha, não se reenrola o 2FA. E `desativarUsuario` só revoga
--     quando NÃO sobra vínculo em pé — como o vínculo B nasce ativo na mesma
--     transação, o acesso nunca pisca.
--
-- (c) A LINHA DO TEMPO — ATRAVESSA na LEITURA, não no dado.
--     rh.evento_colaborador continua append-only e continua apontando para o
--     vínculo onde o fato nasceu. Quem atravessa é a view rh.evento_da_pessoa
--     (0046). Copiar evento para o vínculo novo seria falsificar a história:
--     a advertência de 2024 aconteceu na Supply, e continua tendo acontecido
--     na Supply depois que a pessoa foi para a DCS.
--
-- (d) CARGO E SALÁRIO — ATRAVESSAM, congelados. O vínculo B nasce com a MESMA
--     versão de cargo e o MESMO salário do vínculo A, em rh.posicao_colaborador
--     nova, com início na data da transferência. Transferir não é promover:
--     o CHECK abaixo PROÍBE salario_proposto em transferencia_empresa. Quem
--     quiser mover e aumentar abre duas movimentações — e aí os dois atos
--     ficam visíveis e cada um passa pelo controle de enquadramento (faixa do
--     cargo) que é do outro tipo.
--
-- (e) A LIDERANÇA — ATRAVESSA. rh.relacao_gestor do vínculo A é encerrada e
--     reaberta no vínculo B, nos DOIS sentidos: quem era o líder dela continua
--     sendo, e quem era liderado dela continua sendo. Sem isso o organograma
--     perderia a pessoa (ele lê `status <> 'desligado'`) e, pior, deixaria a
--     equipe inteira dela órfã no dia da transferência.
--
-- (f) DEPENDENTES — ATRAVESSAM, COPIADOS com rastro.
--     rh.dependente pendura no vínculo, e nesta onda as 32 tabelas do vínculo
--     ficam INTOCADAS (decisão da 0046). Não copiar significaria o contrato
--     novo nascer sem dependente nenhum: IRRF errado na primeira folha da
--     empresa B e nenhuma adesão de plano possível sem o DP redigitar filho
--     por filho — redigitação é onde nascem o CPF trocado e a data errada.
--     Por isso a cópia, com `origem_dependente_id` dizendo de onde veio.
--     Conferido que não dobra número: o relatório de composição familiar conta
--     sobre `c.status <> 'desligado'`, e o vínculo A já está desligado quando a
--     cópia existe. O rastro é o que permitirá, numa onda futura, subir
--     rh.dependente para a pessoa sem adivinhar quem é quem.
--
-- (g) FÉRIAS / PERÍODO AQUISITIVO — NÃO ATRAVESSA. O ciclo recomeça no
--     vínculo novo.
--     A LEI: numa rescisão real (e é isso que acontece — o dono DEMITE e
--     RECONTRATA, com baixa e nova entrada na carteira), o contrato termina.
--     As férias vencidas e as proporcionais são PAGAS no acerto (art. 146 e
--     147 da CLT) e o período aquisitivo do novo contrato começa do zero na
--     nova admissão (art. 130, contado do início do contrato).
--     POR QUE ESTE É O CAMINHO CONSERVADOR: se o período atravessasse, o
--     sistema passaria a afirmar que a empresa B deve férias de um tempo que a
--     empresa A já pagou no acerto — e o painel de vencimento chegaria a
--     acusar "VENCIDA — dobro (art. 137)" por um direito quitado. Errar para
--     esse lado cria passivo do nada. Errar para o lado escolhido, se o grupo
--     decidir que o caso é de unicidade contratual (grupo econômico, art. 2º
--     §2º da CLT + Súmula 129 do TST), é corrigível com um ajuste de saldo
--     auditado, que rh.periodo_aquisitivo já suporta.
--     Como isso já funciona sem código novo: a geração de períodos lê
--     `listarColaboradoresNaoDesligados` — o vínculo A para de gerar no dia em
--     que é encerrado, e o vínculo B começa a gerar a partir da admissão dele.
--     Os períodos antigos FICAM no vínculo A, que é onde o acerto os quita, e
--     continuam visíveis na ficha.
--     PERGUNTA PARA O DONO (registrada, não decidida aqui): o grupo trata
--     essas transferências como rescisão real (com acerto e baixa na CTPS) ou
--     como continuidade do mesmo contrato? Se for continuidade, muda ISTO e
--     muda também o tempo de casa para fins de aviso prévio.
--
-- (h) BANCO DE HORAS — NÃO ATRAVESSA: é liquidado na saída da empresa A, pela
--     MESMA regra que qualquer desligamento usa.
--     POR QUÊ: saldo de banco de horas é dívida (ou crédito) de um CNPJ
--     específico com aquela pessoa. Levar o saldo para a empresa B moveria
--     passivo trabalhista entre pessoas jurídicas sem documento nenhum — e
--     entre CNPJs que podem até ter regra de banco diferente (teto e
--     tratamento na rescisão são parâmetros por escopo, 0036).
--     COMO: o efeito da transferência chama `liquidarBancoNaRescisao`, a mesma
--     função que `encerrarProcessoDesligamento` chama. Ela lê o
--     `tratamento_rescisao` da regra VIGENTE — se a regra manda "perde", zera
--     com movimento de origem 'rescisao'; se manda pagar ou descontar,
--     PRESERVA o saldo e diz na trilha que é lançamento de gente. Não se
--     inventou tratamento novo para o caso da transferência.
--     PERGUNTA PARA O DONO: o grupo quer um quarto tratamento — "transfere o
--     saldo para o novo vínculo"? É uma decisão contábil entre os CNPJs, não
--     de software; enquanto não houver resposta, liquidar pela regra vigente é
--     o que não inventa dinheiro.
--
-- (i) AVALIAÇÕES, FEEDBACKS, OCORRÊNCIAS, PDI — NÃO ATRAVESSAM como dado;
--     atravessam como LEITURA. Ficam no vínculo em que aconteceram, e a ficha
--     da pessoa mostra os dois vínculos. Copiar uma avaliação de ciclo fechado
--     para outro contrato reescreveria um resultado que já foi calibrado e
--     comunicado — e o ciclo tem período, participantes e nota; duplicá-lo
--     estragaria a média do ciclo. Mesmo argumento das ocorrências (registro
--     com efeito disciplinar: pertence ao contrato em que o fato se deu).
--
-- (j) DOCUMENTOS — NÃO ATRAVESSAM. Ficam onde estão e são lidos pela pessoa.
--     Dois motivos duros: (1) rh.ciencia é append-only e guarda o HASH do
--     documento no instante em que a pessoa deu ciência — copiar o arquivo
--     criaria um segundo id com o mesmo hash e uma cadeia de ciência órfã;
--     (2) metade deles é do contrato (contrato de trabalho, holerite, TRCT da
--     empresa A) e não faz sentido nenhum pendurado na empresa B. O que a
--     pessoa precisa é ENXERGAR os seus documentos dos dois vínculos, e isso é
--     leitura por pessoa, não cópia.
--
-- (k) ASO / SST — NÃO ATRAVESSA, e aqui a lei é explícita: a empresa B é outro
--     empregador e precisa do seu próprio ASO admissional (NR-7). Levar o ASO
--     da empresa A seria produzir prova de exame que aquele empregador não
--     mandou fazer.
--
-- (l) ADESÕES A BENEFÍCIO — NÃO ATRAVESSAM. O contrato do plano é entre a
--     operadora e um CNPJ; a adesão é reaberta na empresa B pelo DP. Fica na
--     fila de trâmites da demanda, que é justamente para isso que a aprovação
--     final joga a demanda para 'aberta'.
--
-- ================================================ POR QUE NÃO ABRE PROCESSO DE DESLIGAMENTO
-- rh.processo_desligamento existe para o RITO DE SAÍDA: aviso prévio,
-- entrevista de desligamento, devolução de crachá e notebook, prazo do art.
-- 477. Numa transferência interna a pessoa não cumpre aviso, não devolve nada
-- e não faz entrevista de saída — ela trabalha no dia seguinte, na mesma sala,
-- às vezes com o mesmo líder. Abrir o processo mesmo assim encheria a fila do
-- DP de rito falso e sujaria dois indicadores de verdade: a cobertura de
-- entrevistas de desligamento e o semáforo do 477.
-- O que a transferência FAZ do desligamento é o que tem efeito real: encerra o
-- vínculo com data, liquida o banco de horas pela regra vigente e grava o
-- evento na linha do tempo. O acerto rescisório da empresa A é trâmite de DP —
-- e a demanda cai na fila dele com a descrição dizendo isso.
--
-- ==================================================== TURNOVER NÃO PODE MENTIR
-- Sem esta migration, transferir alguém contaria como UMA demissão e UMA
-- admissão no painel executivo — inflando os dois lados de um indicador que a
-- diretoria olha. Com `sucede_vinculo_id`, "saiu do grupo" e "entrou no grupo"
-- passam a ter definição:
--   saída do grupo  = vínculo encerrado que NÃO foi sucedido por outro;
--   entrada no grupo = vínculo aberto que NÃO sucede outro.
-- As duas funções abaixo dizem isso em um lugar só, para o painel executivo
-- não repetir a regra em cada consulta.

BEGIN;

-- ---------------------------------------------------------------- o elo entre os dois vínculos
ALTER TABLE rh.colaborador
  ADD COLUMN sucede_vinculo_id BIGINT UNIQUE REFERENCES rh.colaborador (id);

ALTER TABLE rh.colaborador
  ADD CONSTRAINT colaborador_nao_sucede_a_si_mesmo
    CHECK (sucede_vinculo_id IS NULL OR sucede_vinculo_id <> id);

COMMENT ON COLUMN rh.colaborador.sucede_vinculo_id IS
  'O vínculo que ESTE continua, quando a pessoa foi transferida de uma empresa '
  'do grupo para outra. NULL = admissão de gente nova no grupo. UNIQUE: um '
  'contrato é sucedido no máximo uma vez.';

-- ---------------------------------------------------------------- quadro: entrou e saiu DO GRUPO
-- Duas perguntas que o painel executivo faz e que a transferência tornou
-- ambíguas. A resposta mora aqui para não ser reescrita em cada consulta.
CREATE FUNCTION rh.saiu_do_grupo(p_colaborador_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM rh.colaborador s WHERE s.sucede_vinculo_id = p_colaborador_id
  )
$$;

COMMENT ON FUNCTION rh.saiu_do_grupo(BIGINT) IS
  'FALSE quando o vínculo foi encerrado por transferência para outra empresa '
  'do grupo — a pessoa continua na casa e não é turnover.';

CREATE FUNCTION rh.entrou_no_grupo(p_colaborador_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT sucede_vinculo_id IS NULL
    FROM rh.colaborador WHERE id = p_colaborador_id
$$;

COMMENT ON FUNCTION rh.entrou_no_grupo(BIGINT) IS
  'FALSE quando o vínculo nasceu de transferência interna — não é admissão '
  'nova para o quadro do grupo.';

-- ---------------------------------------------------------------- os vínculos da pessoa, com empresa
-- rh.vinculos_da_pessoa (0046) devolvia matrícula, tipo, status e as datas. A
-- ficha agora precisa dizer TAMBÉM em qual empresa cada contrato foi
-- registrado e quem sucede quem — sem isso, dois vínculos na tela ficam
-- indistinguíveis ("matrícula 1042" e "matrícula 3007" não dizem nada).
-- A empresa vem da ÚLTIMA alocação do vínculo (a vigente, ou a última
-- encerrada quando o contrato acabou), com o nome como está hoje no catálogo.
-- Trocar o tipo de retorno exige recriar: as colunas antigas continuam na
-- mesma ordem, então quem já consultava não muda.
DROP FUNCTION rh.vinculos_da_pessoa(BIGINT);

CREATE FUNCTION rh.vinculos_da_pessoa(p_pessoa_id BIGINT)
RETURNS TABLE (
  id                     BIGINT,
  matricula              TEXT,
  tipo_vinculo           TEXT,
  status                 TEXT,
  data_admissao          DATE,
  data_desligamento      DATE,
  empresa_id             BIGINT,
  empresa_nome           TEXT,
  sucede_vinculo_id      BIGINT,
  sucedido_por_vinculo_id BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT c.id, c.matricula, c.tipo_vinculo, c.status,
         c.data_admissao, c.data_desligamento,
         ult.empresa_id, ult.empresa_nome,
         c.sucede_vinculo_id,
         (SELECT s.id FROM rh.colaborador s WHERE s.sucede_vinculo_id = c.id)
    FROM rh.colaborador c
    LEFT JOIN LATERAL (
      SELECT ld.empresa_id, ld.empresa_nome
        FROM rh.lotacao_detalhada ld
       WHERE ld.colaborador_id = c.id
       ORDER BY ld.inicio_vigencia DESC, ld.id DESC
       LIMIT 1
    ) ult ON TRUE
   WHERE c.pessoa_id = p_pessoa_id
   ORDER BY c.data_admissao, c.id
$$;

COMMENT ON FUNCTION rh.vinculos_da_pessoa(BIGINT) IS
  'Os contratos da pessoa no grupo, do mais antigo ao mais novo, com a empresa '
  'de registro de cada um e o elo de sucessão entre eles.';

-- ---------------------------------------------------------------- a movimentação ganha o terceiro tipo
ALTER TABLE rh.demanda_movimentacao
  DROP CONSTRAINT demanda_movimentacao_tipo_check;
ALTER TABLE rh.demanda_movimentacao
  ADD CONSTRAINT demanda_movimentacao_tipo_check
    CHECK (tipo IN ('promocao','transferencia_unidade','transferencia_empresa'));

-- O destino de uma transferência de empresa é o TRIO da 0047 (registro,
-- lotação, centro de custo) mais o que só existe quando o contrato é outro:
-- a matrícula na empresa nova e, opcionalmente, outro tipo de vínculo
-- (o exemplo do próprio dono: CLT na Supply, PJ na DCS).
ALTER TABLE rh.demanda_movimentacao
  ADD COLUMN empresa_destino_id   BIGINT REFERENCES rh.empresa_grupo (id),
  ADD COLUMN matricula_destino    TEXT,
  ADD COLUMN tipo_vinculo_destino TEXT
    CHECK (tipo_vinculo_destino IS NULL OR tipo_vinculo_destino IN
           ('clt','estagiario','aprendiz','pj','temporario')),
  -- rastro do efeito: qual vínculo nasceu desta movimentação (o vínculo que
  -- MORREU é `colaborador_id`, que já existia).
  ADD COLUMN vinculo_destino_id   BIGINT UNIQUE REFERENCES rh.colaborador (id);

-- Pedido incompleto não entra: transferir de CNPJ exige saber em qual empresa,
-- em que local, em que centro de custo e com que matrícula a pessoa passa a
-- existir. É o mesmo padrão dos CHECKs de 'promocao' e 'transferencia_unidade'.
ALTER TABLE rh.demanda_movimentacao
  ADD CONSTRAINT demanda_movimentacao_transferencia_empresa_completa
    CHECK (tipo <> 'transferencia_empresa'
           OR (empresa_destino_id IS NOT NULL
               AND estabelecimento_destino_id IS NOT NULL
               AND centro_custo_destino_id IS NOT NULL
               AND btrim(coalesce(matricula_destino, '')) <> ''));

-- Transferir não é promover. Sem esta linha, "mudo de CNPJ e já aproveito para
-- aumentar" passaria por fora do controle de enquadramento (faixa do cargo +
-- justificativa de exceção) que existe no tipo 'promocao'.
ALTER TABLE rh.demanda_movimentacao
  ADD CONSTRAINT demanda_movimentacao_transferencia_empresa_sem_salario
    CHECK (tipo <> 'transferencia_empresa' OR salario_proposto IS NULL);

-- Os três campos novos só fazem sentido neste tipo.
ALTER TABLE rh.demanda_movimentacao
  ADD CONSTRAINT demanda_movimentacao_destino_de_empresa_so_no_tipo
    CHECK (tipo = 'transferencia_empresa'
           OR (empresa_destino_id IS NULL
               AND matricula_destino IS NULL
               AND tipo_vinculo_destino IS NULL));

COMMENT ON COLUMN rh.demanda_movimentacao.empresa_destino_id IS
  'REGISTRO destino: a empresa do grupo (CNPJ) em que o novo vínculo nasce.';
COMMENT ON COLUMN rh.demanda_movimentacao.matricula_destino IS
  'Matrícula da pessoa na empresa destino. rh.colaborador.matricula é UNIQUE no '
  'grupo inteiro: dois contratos, duas matrículas — que é o que o DP espera.';
COMMENT ON COLUMN rh.demanda_movimentacao.vinculo_destino_id IS
  'Vínculo criado pela aplicação do efeito. colaborador_id é o vínculo de '
  'ORIGEM, encerrado no mesmo ato.';

-- ---------------------------------------------------------------- rastro do dependente copiado
-- Ver item (f) do cabeçalho: a cópia existe para o contrato novo nascer com o
-- IRRF e os planos certos; o rastro existe para que ninguém precise adivinhar,
-- depois, que os dois "João, filho, 2015-03-02" são a mesma criança.
ALTER TABLE rh.dependente
  ADD COLUMN origem_dependente_id BIGINT REFERENCES rh.dependente (id);

COMMENT ON COLUMN rh.dependente.origem_dependente_id IS
  'Quando o dependente veio copiado do vínculo anterior numa transferência '
  'entre empresas do grupo, aponta para a linha de origem. NULL = cadastrado '
  'direto. É o mesmo ser humano nas duas linhas.';

-- ---------------------------------------------------------------- tipo de demanda (v1 ativa)
-- SLA maior que os 10 dias da promoção porque o trâmite depois da aprovação é
-- maior: acerto na empresa A, registro e eSocial na empresa B, ASO admissional
-- e readesão de benefícios. O número é do CATÁLOGO (rh.tipo_demanda_versao),
-- versionado com vigência — o DP muda pela tela, sem dev.
INSERT INTO rh.tipo_demanda_versao
  (chave, versao, nome, sla_dias, exige_aprovacao_gestor, status,
   inicio_vigencia, fluxo)
VALUES
  ('transferencia_empresa', 1, 'Transferência entre empresas do grupo', 15,
   TRUE, 'ativa', CURRENT_DATE, 'movimentacao');

-- ---------------------------------------------------------------- permissão
-- Chave NOVA e separada de `movimentacao.solicitar` de propósito. Abrir uma
-- transferência de unidade é ato de líder; abrir uma transferência de CNPJ
-- encerra um contrato de trabalho e cria um registro em outra pessoa jurídica
-- — matrícula, eSocial, RET. Isso é ato de DP e de diretoria, e por isso o
-- gestor NÃO recebe a chave. Ele continua decidindo o nível 1 da cadeia: a
-- pessoa sai da equipe dele, e ele tem que concordar.
-- exige_2fa = FALSE, como as demais chaves de movimentação e cadastro: o
-- selo de 2FA aqui é para chave que ABRE dado sensível (remuneração, saúde,
-- motivo de desligamento), e esta não abre nenhum.
INSERT INTO sistema.permissao (chave, descricao, exige_2fa) VALUES
  ('movimentacao.transferir_empresa',
   'Abrir transferência de colaborador entre empresas do grupo (encerra o vínculo numa e abre na outra, preservando a pessoa)',
   FALSE);

INSERT INTO sistema.papel_permissao (papel, chave) VALUES
  ('dp',        'movimentacao.transferir_empresa'),
  ('diretoria', 'movimentacao.transferir_empresa');

-- ---------------------------------------------------------------- nada mudou hoje
-- Prova dentro da transação: esta migration não move dado nenhum. Existem 70
-- vínculos e 70 pessoas; nenhum vínculo sucede outro, nenhum dependente é
-- cópia, e nenhuma movimentação existente virou transferência de empresa.
DO $$
DECLARE
  sucessoes   BIGINT;
  copias      BIGINT;
  movimentos  BIGINT;
BEGIN
  SELECT count(*) INTO sucessoes  FROM rh.colaborador WHERE sucede_vinculo_id IS NOT NULL;
  SELECT count(*) INTO copias     FROM rh.dependente  WHERE origem_dependente_id IS NOT NULL;
  SELECT count(*) INTO movimentos FROM rh.demanda_movimentacao
   WHERE tipo = 'transferencia_empresa';
  IF sucessoes <> 0 OR copias <> 0 OR movimentos <> 0 THEN
    RAISE EXCEPTION
      'a 0048 deveria nascer neutra: % sucessão(ões), % cópia(s), % movimentação(ões)',
      sucessoes, copias, movimentos;
  END IF;
END;
$$;

COMMIT;
