# Lista de teste — o sistema inteiro, caso a caso

> Derivada do **código de cada domínio**, não do nome das telas: cada `throw`, cada guarda de
> permissão e cada esquema virou caso. São **973 casos** em 6 frentes.
>
> **Onde:** `http://localhost:3001` · **senha das personas de demo:** `FastDemo2026!`
> **Admin:** `g.dearodrigurs@gmail.com` / `123456` (pede 2FA no primeiro login)

## Como ler

| Marca | O que é |
|---|---|
| **escopo** | a mesma tela com duas personas — o teste que mais rendeu neste projeto |
| **recusar** | o sistema tem que dizer não. Metade de um teste sério mora aqui |
| **administrável** | dá para acrescentar, renomear e excluir **pela tela**? |
| **cadeia** | atravessa módulos — é onde mora o defeito de integração |
| criar · editar | fluxo de escrita |
| trilha | o que deveria aparecer em `audit.*` |
| número | o valor exato que tem de bater |
| borda | vazio, limite, muito longo, fora de ordem |

Casos marcados com **⚠** vigiam um defeito que já custou dinheiro neste projeto — o custo está
escrito no próprio caso. Esses não se apagam por parecerem detalhe.

**Distribuição:** recusar 252 · escopo 138 · numero 134 · borda 119 · cadeia 81 · criar 80 · trilha 80 · administravel 57 · editar 32

---

# ⚠ O achado que a varredura entregou de brinde

**81 coisas não dão para administrar pela tela.** Você disse, no começo do projeto:

> *"não quero elas chumbadas no código, quero que os usuarios possam adicionar excluir e renomear
> elas livremente"*

Cada linha abaixo é um lugar onde isso não vale — e mudar exige publicar código, não abrir uma
tela. Não são casos de teste: são achados, e a lista completa está no fim do documento.

| Frente | Quantos |
|---|---|
| SST (ASO, NR-1, EPI, CAT) e Benefícios (catálogo, elegibilidade, adesão, dependentes) | 16 |
| Painel executivo, metas e indicadores, relatórios, portais, notificações, entrada e 2FA | 16 |
| Núcleo | 15 |
| Avaliação 360, clima (check-in), pesquisas estruturadas, recrutamento & seleção e documentos (GED) | 14 |
| Ponto, banco de horas, espelho, parâmetros do ponto e meu-ponto | 13 |
| Folha de pagamento | 7 |

---

# 1 · Núcleo — pessoa, vínculo, cargo e lugar (/colaboradores, /cargos, /estrutura, /organograma, /usuarios, /perfis)

> O núcleo está muito mais bem defendido do que a lista antiga sugeria: escopo por chave (nunca por nome de papel), vigência que encerra em vez de reescrever, trilha que cita a chave que de fato abriu o payload, e os três campos da 0047 realmente independentes. Os casos mais valiosos são os PARES de persona, porque quase toda tela deste escopo muda de conteúdo — /colaboradores vai de 1 (recrutador) a 71 (dp), /cargos redireciona a diretora e a analista de RH, /estrutura mostra dois blocos para a diretora e três para o DP.
> Três achados que valem mais que o resto. (1) A trava de vigência não futura foi aplicada em empresa, centro de custo, lotação, benefício e faixa salarial — e o CARGO ficou de fora: criar versão de cargo com data futura é aceito e vira a versão ativa na hora (colaboradores/servico.ts:1804, sem exigirVigenciaNaoFutura; esquemas.ts:470 usa esquemaData puro). É a repetição exata do defeito de dinheiro corrigido ontem, no único catálogo que sobrou. (2) Desligar pela FICHA (Editar ficha → Status) não encerra a relação de liderança, ao contrário do módulo de Desligamento — é a segunda porta para o estado que a migration 0050 teve de reparar em 9 linhas. (3) O seletor "Novo gestor" oferece pessoas desligadas e o serviço aceita, produzindo o aviso "gestor fora do quadro" no organograma por caminho normal de tela.
> Sobre o pedido de "nada chumbado": o que o dono pediu está cumprido para empresa, lotação e centro de custo — criar, renomear por vigência e inativar, tudo pela tela. Mas as LISTAS continuam em código: tipos de vínculo, status, motivos de posição, classificações de ocorrência, tipos de empresa, gêneros, faixas etárias e — a mais cara — os oito perfis de acesso. /perfis move chave entre papéis fixos; não cria, não renomeia e não exclui perfil. E /usuarios não troca o papel de quem já existe.
> Duas assimetrias menores que confundem quem testa: os formulários de estrutura não têm limite de data no campo (só o servidor barra), enquanto os três da ficha têm max=hoje; e CRIAR empresa com vigência futura passa, embora RENOMEAR com vigência futura seja recusado.

## Lista de colaboradores e o recorte pelos três campos — /colaboradores

**Entre como:** Entre quatro vezes: dp@, gestor@, funcionario@ e recrutador@

- [ ] Entre como dp@fastdemo.local, abra /colaboradores sem nenhum filtro e conte os cartões `escopo`
      → 71 cartões para 70 pessoas — a Renata Queiroz Pinheiro aparece duas vezes (matrículas 1005 e 1071). Subtítulo: "Todos os colaboradores"
- [ ] ⚠ Entre como gestor@fastdemo.local na mesma tela e conte `escopo`
      → 11 cartões (ele + 10 liderados vigentes) e o subtítulo "Sua ficha e sua equipe (relação gestor→liderado vigente)". Nenhum desligado, porque a liderança de quem saiu foi encerrada
      *custou:* o par 1-contra-70 nesta mesma tela foi o que revelou o pior defeito de escopo do projeto
- [ ] ⚠ Entre como recrutador@fastdemo.local e abra /colaboradores `escopo`
      → 1 cartão só (a própria Solange) e o aviso "Como funcionário, você acessa apenas a própria ficha". Não pode ser 403 nem tela vazia sem explicação — negar é diferente de mostrar vazio
      *custou:* recrutador não tem rh.colaborador.ver; se a tela mostrasse vazio sem o aviso, ele acharia que não há dado
- [ ] Entre como funcionario@fastdemo.local e procure o chip "feedback 90d vencido" no próprio cartão `escopo`
      → 1 cartão e nenhum chip de feedback vencido — o alerta é de gestão e some no alcance "próprio"
- [ ] Com dp@, filtre Status = Ativo, depois Desligado, depois Afastado, anotando os três números `numero`
      → Ativos 62; desligados 9 (os 8 do semeador mais o vínculo 1005 encerrado pela transferência); a soma dos três tem de bater com os 71 sem filtro
- [ ] Com dp@, escolha registro = Supply, depois lotação = Matriz Centro, depois os dois juntos `escopo`
      → O resultado combinado é sempre menor ou igual a cada filtro sozinho, e cada cartão traz os três chips rotulados: "registro:", "lotação:" e "centro de custo:"
- [ ] Filtre só por centro de custo = CC-9000 (Centro de Serviços Compartilhados) `borda`
      → Aparece gente registrada em empresas DIFERENTES e lotada em lojas DIFERENTES — é o exemplo do dono e a prova de que os três campos são independentes
- [ ] Filtre por centro de custo = CC-6000 (Implantação Fast Serviços) `numero`
      → Zero resultados, com a frase "Nenhum colaborador encontrado com este recorte de registro, lotação e centro de custo" — o centro nasceu preparado e sem ninguém alocado
- [ ] Busque por "1071" no campo de busca `borda`
      → Acha a Renata pela matrícula, não só pelo nome (a busca é ILIKE em nome OU matrícula)
- [ ] Com gestor@, digite na busca o nome de alguém de outra loja que você viu na lista do dp@ `escopo`
      → Continua vazio — o recorte é feito no servidor, dentro da consulta; filtro do cliente seria enfeite
- [ ] Com dp@, combine busca + status + os três campos ao mesmo tempo e depois limpe tudo `borda`
      → Todos combinam em E; com tudo em branco volta a lista inteira. Nenhum dos três nasce com valor escolhido

## Admissão: pessoa nova e segundo vínculo de quem já é do grupo — /colaboradores

**Entre como:** dp@fastdemo.local (rh@ também tem rh.colaborador.editar)

- [ ] Clique "+ Novo colaborador", preencha nome, e-mail, matrícula, CPF válido, vínculo, admissão, nascimento e gênero, e salve `criar`
      → 201, a senha temporária aparece UMA vez com o aviso de que não será exibida de novo, e o link "Abrir ficha" leva à ficha criada
- [ ] Repita a criação com CPF 111.111.111-11 `recusar`
      → Recusa "CPF inválido" (dígito verificador) e nada é gravado
- [ ] Informe a matrícula "A123" `recusar`
      → Recusa "Matrícula deve conter apenas números"
- [ ] Informe data de nascimento igual ou posterior à data de admissão `recusar`
      → Recusa "Data de nascimento deve ser anterior à admissão", apontando o campo nascimento
- [ ] Use a matrícula 1001, que já existe `recusar`
      → 409 "Já existe um colaborador com esta matrícula", com o erro no campo matrícula
- [ ] Use o e-mail de alguém já cadastrado `recusar`
      → 409 "Já existe um usuário com este e-mail"
- [ ] Digite o CPF de um colaborador ATIVO qualquer da lista e salve `recusar`
      → 409 citando o NOME da pessoa, a empresa e a matrícula do vínculo em pé, e mandando pela transferência entre empresas aberta em Demandas. Não pode oferecer o botão de confirmação
- [ ] Digite o CPF de um dos 9 desligados (pegue na lista filtrada por Desligado) e salve `cadeia`
      → A tela mostra QUEM é: nome, matrícula, empresa e período de cada vínculo anterior, e pergunta "É a mesma pessoa?" — nunca confirma no escuro
- [ ] Confirme com "É a mesma pessoa — abrir novo vínculo" `cadeia`
      → Nasce SÓ o vínculo. Nenhuma senha nova é exibida (senha_temporaria vem null) e a tela diz que a conta é a mesma, com a MESMA senha; se a conta estava desativada, diz que foi reaberta
- [ ] No mesmo caso, informe uma data de admissão anterior ou igual à data de desligamento do vínculo anterior `recusar`
      → 409 comparando as duas datas: "A admissão (dd/mm) precisa ser posterior ao desligamento do vínculo anterior (dd/mm)" — sobreposição viraria duas folhas do mesmo mês para a mesma pessoa
- [ ] Clique "Não é a mesma pessoa — corrigir o CPF" `editar`
      → O campo CPF esvazia, o bloco de confirmação some e nada foi gravado no banco
- [ ] Depois de admitir uma PESSOA NOVA, confira a trilha de alteração `trilha`
      → Três linhas de criação: sistema.usuario (e-mail, nome, papel Funcionário), rh.pessoa (CPF, nome, nascimento e "Gênero (autodeclarado)") e rh.colaborador (matrícula, vínculo, admissão, status)
- [ ] Depois de abrir um SEGUNDO VÍNCULO, confira a trilha `trilha`
      → NÃO pode existir linha de criação em rh.pessoa — nada da pessoa foi tocado. Só rh.colaborador, com "Pessoa: cadastro e CPF reaproveitados" e o vínculo anterior citado; e, se a conta foi reaberta, uma linha "Ativo: Não → Sim" em sistema.usuario
- [ ] Preencha nome com 200 caracteres e contexto com 4000; depois tente 201 e 4001 `borda`
      → 200/4000 aceitam; acima disso recusa pelo limite do campo

## Ficha: aba Dados e edição cadastral — /colaboradores/[id]

**Entre como:** dp@ para editar; funcionario@, gestor@, rh@ e diretora.pessoas@ para os pares

- [ ] Entre como funcionario@ e digite na URL /colaboradores/1 (a ficha da diretora Helena) `escopo`
      → "Colaborador não encontrado" — fora do alcance responde 404 de inexistente, nunca ficha mascarada
- [ ] Com dp@, abra a ficha de um terceiro qualquer e confira audit.leitura_sensivel `trilha`
      → Uma linha com recurso colaborador.ficha e chave rh.colaborador.ver.todos
- [ ] ⚠ Com gestor@, abra a ficha de um LIDERADO e confira a mesma tabela `trilha`
      → A chave gravada tem de ser rh.colaborador.ver (a que de fato ampliou), NÃO a chave ampla. Gravar rh.colaborador.ver.todos para quem só alcança a equipe é trilha que mente
      *custou:* o projeto já pagou uma correção por trilha que citava a chave errada
- [ ] Com funcionario@, abra a PRÓPRIA ficha `trilha`
      → Nenhuma linha em audit.leitura_sensivel — ler a si mesmo não é leitura de terceiro
- [ ] Com dp@, clique "Editar dados cadastrais", mude só o Retrato atual e salve `editar`
      → A trilha registra em rh.pessoa (não em rh.colaborador), porque retrato é do ser humano e desce para todos os contratos dele
- [ ] Mude o Gênero (autodeclarado) para Feminino, salve e reabra o formulário `editar`
      → O seletor volta a "Não alterar" e o valor gravado NÃO aparece em nenhum lugar da ficha nem da lista. A trilha registra "Gênero (autodeclarado): X → Feminino" — é lá que se audita quem mexeu
- [ ] Abra o formulário e clique Salvar sem mudar nada `recusar`
      → Nenhuma linha nova de auditoria e nenhum evento na linha do tempo
- [ ] Coloque data de nascimento posterior à data de admissão e salve `recusar`
      → 400 "Data de nascimento deve ser anterior à admissão"
- [ ] Escolha Status = Desligado e apague a data de desligamento antes de enviar `recusar`
      → Recusa "Informe a data de desligamento"; e escolher uma data com status diferente de Desligado recusa "Data de desligamento só se aplica ao status desligado"
- [ ] ⚠ Com dp@, desligue alguém pela ficha (Status = Desligado + data de hoje); depois abra a aba Administração → Gestor dessa mesma pessoa `cadeia`
      → A relação de liderança dela continua VIGENTE (sem data de fim) — desligar pela ficha não encerra a liderança, só o módulo de Desligamento faz isso. Confira também /organograma e a lista do gestor dela
      *custou:* é exatamente o estado que a migration 0050 teve de reparar em 9 relações; a correção foi feita no módulo de desligamento, e esta segunda porta continua aberta
- [ ] No mesmo registro, volte o Status para Ativo, salve e vá a /usuarios procurar a conta dessa pessoa `cadeia`
      → A data de desligamento é limpa na ficha, mas o LOGIN continua desativado — a reversão não reativa a conta
- [ ] Leia "Último feedback formal (derivado)" e compare com o chip do cartão na lista `numero`
      → Se passaram mais de 90 dias (ou mais de 90 desde a admissão, quando nunca houve feedback), o chip "feedback 90d vencido" tem de aparecer nos dois lugares
- [ ] Abra a ficha de alguém sem posição vigente `borda`
      → O bloco RCF diz "Sem RCF: esta pessoa não tem posição vigente ou o cargo não tem versão ativa" — não pode ficar em branco
- [ ] Abra a mesma ficha com diretora.pessoas@ e depois com rh@ `escopo`
      → Com a diretora, o campo "Salário — chave rh.posicao.ver" aparece com a nota "dado sensível · leitura gravada na trilha"; com rh@ o campo não existe e o valor nem sai do backend

## A pessoa transferida entre CNPJs: Renata, dois vínculos, uma história — /colaboradores/[id]

**Entre como:** dp@fastdemo.local; depois gestor@ para o contraste

- [ ] Busque "Renata Queiroz Pinheiro" na lista `cadeia`
      → DOIS cartões: matrícula 1005 (desligada, registro Casa do Montador) e 1071 (ativa, registro Supply) — mesma pessoa, dois contratos
- [ ] Abra a ficha da matrícula 1071 e leia a tabela "Vínculos desta pessoa no grupo" `cadeia`
      → As duas linhas lado a lado, com o período de cada uma, "transferido para outra empresa do grupo" no 1005, "veio por transferência interna" no 1071 e a linha do contrato aberto destacada
- [ ] Abra a aba "Linha do tempo" da matrícula 1071 e role até o fim `cadeia`
      → Os eventos dos DOIS contratos aparecem em ordem decrescente, cada um identificando a matrícula em que caiu. A história NÃO recomeça na data da transferência: admissão antiga, ocorrências, feedbacks e promoções de anos atrás continuam ali
- [ ] Clique na matrícula 1005 dentro da tabela de vínculos `cadeia`
      → Abre a ficha do contrato encerrado, com os rótulos "Registro (empresa do grupo) (encerrado)", "Lotação (encerrado)" e "Centro de custo (encerrado)" mostrando o que valia no último dia — nunca "—"
- [ ] Compare CPF e e-mail nas duas fichas `numero`
      → Idênticos — uma conta de acesso por gente, não por contrato; o 2FA também é o mesmo
- [ ] ⚠ Entre com gestor@ (que não lidera a Renata) e tente as duas fichas pela URL `escopo`
      → 404 nas duas. E, para o gestor que lidera só o contrato NOVO, a linha do tempo não pode trazer os fatos do contrato antigo — autorizar um vínculo nunca autoriza os outros da mesma pessoa
      *custou:* somar eventos por pessoa sem recorte entregava a advertência de outro contrato a quem levava 404 nele
- [ ] Filtre a lista por registro = Casa do Montador e depois por registro = Supply `borda`
      → O 1005 aparece no primeiro e o 1071 no segundo — o filtro lê a ÚLTIMA linha de alocação, então o contrato encerrado direito não some do recorte

## Ocorrências, feedbacks e ações abertas — /colaboradores/[id]

**Entre como:** rh@ e dp@ (têm rh.ocorrencia.restrita.ver); gestor@ para o contraste

- [ ] Aba Ocorrências → "Registrar ocorrência": deixe a Classificação em branco e envie `recusar`
      → Recusa. O campo nasce VAZIO de propósito — o sinal positivo/negativo é o que a ficha registra sobre a pessoa e a tela não pode chutá-lo
- [ ] Preencha classificação Negativo, data do fato, descrição, impacto e ação combinada, e salve `criar`
      → A ocorrência entra na lista e um evento aparece na linha do tempo com a descrição truncada em 160 caracteres
- [ ] Com gestor@ (sem a chave restrita), marque "restrita" e envie `recusar`
      → 403 "Registrar ocorrência restrita exige a chave de leitura restrita"
- [ ] Registre uma restrita com dp@; entre com gestor@ e abra a linha do tempo do liderado `escopo`
      → Só o resumo neutro "Ocorrência restrita registrada sobre … (detalhe na aba Ocorrências)". O conteúdo não pode vazar pela linha do tempo
- [ ] Com dp@, abra a aba Ocorrências de alguém que tenha ocorrência restrita `trilha`
      → Uma linha em audit.leitura_sensivel com chave rh.ocorrencia.restrita.ver e recurso colaborador.ocorrencia_restrita
- [ ] Envie uma ocorrência com descrição de 2 caracteres `recusar`
      → Recusa "Descreva a ocorrência" (mínimo 3)
- [ ] Aba Feedbacks → registre um feedback com a data de hoje e recarregue a lista de colaboradores `criar`
      → A cadência volta a "não vencido" e o chip "feedback 90d vencido" some do cartão. O parâmetro exibido é 90 dias
- [ ] Crie uma Ação aberta com prazo já vencido `borda`
      → Aceita e a lista marca a ação como vencida
- [ ] Conclua a ação e tente concluí-la ou editá-la de novo `editar`
      → 409 "Ação concluída ou cancelada não pode mudar"
- [ ] Com gestor@, troque o id na URL para alguém fora da equipe e tente registrar feedback `escopo`
      → 404 "Colaborador não encontrado" — a guarda de escopo vem antes da escrita

## Aba Administração → Posição e salário — /colaboradores/[id]

**Entre como:** dp@ (rh.posicao.editar); diretora.pessoas@ só lê

- [ ] Com dp@, apenas ABRA a aba Administração numa ficha que tem posição `trilha`
      → Só a leitura já grava audit.leitura_sensivel com chave rh.posicao.ver e recurso colaborador.salario
- [ ] Registre nova posição com outro cargo, salário e motivo "Promoção", vigência de hoje `criar`
      → A linha anterior ganha data de fim e nasce uma nova. A linha antiga não pode mudar de valor — o passado é congelado
- [ ] Registre uma posição com início igual ou anterior à vigência atual `recusar`
      → 400 "Início deve ser posterior à vigência atual (dd/mm/aaaa)"
- [ ] ⚠ Force uma data FUTURA no campo Início da vigência (o input tem max=hoje; contorne pelo teclado ou pelo inspetor) `recusar`
      → Recusa dizendo que a vigência não pode começar no futuro e mandando pela movimentação, que agenda o efeito
      *custou:* salário de setembro gravado hoje entra na base de cálculo da folha de agosto — é a mesma família do defeito de dinheiro corrigido ontem na faixa salarial
- [ ] Deixe o Motivo em "selecione…" e envie `recusar`
      → Recusa — o motivo nasce vazio porque é ele que distingue promoção de reajuste coletivo, mérito e enquadramento no histórico
- [ ] Registre salário 0,00; depois tente 10.000.000 `borda`
      → Zero é aceito (mínimo 0); 10 milhões recusa "Salário acima do limite"
- [ ] Depois de registrar, leia o texto do evento na linha do tempo `trilha`
      → O resumo NUNCA traz o valor ("Reajuste salarial em dd/mm (mérito)" ou "Mudança de cargo: X → Y"). O número só existe na trilha e na aba de posição, que são leituras logadas
- [ ] Registre a mudança de cargo e abra /cargos `cadeia`
      → A coluna "Ocupantes" do cargo novo sobe 1 e a do cargo antigo cai 1 (conta só posição vigente de quem não está desligado)
- [ ] Volte à aba Dados da mesma ficha `cadeia`
      → O bloco "RCF do cargo" passa a mostrar o RCF do cargo NOVO, com missão, atividades e CHA da versão vigente dele
- [ ] Abra a aba Administração com diretora.pessoas@ e depois com rh@ `escopo`
      → Com a diretora, a tabela de posições aparece mas o formulário de registrar NÃO (ela tem .ver, não .editar); com rh@ a aba Administração nem existe

## Aba Administração → Gestor (relação com vigência) — /colaboradores/[id]

**Entre como:** dp@ ou rh@ (rh.gestor.administrar)

- [ ] Escolha um gestor novo, informe vigência de hoje e clique "Definir gestor" `criar`
      → A relação anterior é encerrada na véspera, a nova nasce vigente e entra o evento "Mudança de gestor: A → B a partir de dd/mm" na linha do tempo
- [ ] Pelo POST direto, informe o próprio colaborador como gestor dele mesmo `recusar`
      → 400 "Colaborador não pode ser gestor de si mesmo" (o seletor da tela já o esconde, mas a guarda é do servidor)
- [ ] Escolha justamente quem já é o gestor vigente `recusar`
      → 400 "Esta pessoa já é o gestor vigente"
- [ ] Informe início igual ou anterior à vigência atual `recusar`
      → 400 "Início deve ser posterior à vigência atual (dd/mm/aaaa)"
- [ ] Force uma data futura no campo Início da vigência `recusar`
      → Recusa pela vigência não futura — gestor com vigência à frente já aprovaria e reprovaria hoje, porque a cadeia de aprovação lê a relação por fim_vigencia IS NULL
- [ ] Abra o seletor "Novo gestor" e procure gente DESLIGADA na lista `administravel`
      → O seletor lista todos os colaboradores, inclusive os 9 desligados — ele vem de /api/colaboradores sem filtro de status. Escolha um desligado e salve: o sistema ACEITA, e o /organograma passa a acusar "pessoa(s) com gestor vigente fora do quadro". A tela não deveria oferecer, e o serviço não confere status
- [ ] Clique "Encerrar relação vigente" sem preencher a data, depois com a data preenchida `borda`
      → Sem data o botão fica desabilitado; com data a relação encerra e a pessoa sobe para a raiz no organograma
- [ ] Encerre a relação e clique em encerrar de novo `recusar`
      → 400 "Não há relação vigente para encerrar"
- [ ] ⚠ Faça A gestor de B e, em seguida, B gestor de A; depois abra /organograma `cadeia`
      → O sistema ACEITA os dois (não há detecção de ciclo na escrita) e o organograma avisa "2 pessoa(s) em ciclo na relação gestor→liderado vigente", com os dois marcados e o laço cortado num ponto. Desfaça depois
      *custou:* o aviso antigo inflava o número: um laço de 2 virava aviso de 21 pessoas
- [ ] Defina o gestor@ como gestor de mais alguém e recarregue /colaboradores logado como gestor@ `cadeia`
      → A lista dele passa de 11 para 12 na carga seguinte — a régua de quem vê quem é a relação vigente, não o papel
- [ ] Confira a trilha depois de trocar o gestor `trilha`
      → Linha em audit.alteracao na tabela rh.relacao_gestor com "Gestor: nome antigo → nome novo" e o início da vigência

## Aba Administração → Alocação: registro × lotação × centro de custo — /colaboradores/[id]

**Entre como:** dp@ (única persona com rh.estabelecimento.administrar)

- [ ] Abra o formulário de Alocação e olhe os campos antes de digitar `criar`
      → Os três seletores vêm SEMEADOS com a alocação vigente (para trocar um sem redigitar os outros dois), e o Início da vigência nasce VAZIO — hoje não é "a data certa" de nada
- [ ] Troque só o centro de custo, mantendo registro e lotação, com vigência de hoje `criar`
      → A linha vigente ganha fim, nasce outra com os três campos, e a linha encerrada fica imutável — trocar o centro hoje não mexe na folha de fevereiro
- [ ] Depois de trocar só o centro de custo, olhe a linha do tempo e depois a trilha `trilha`
      → NÃO entra evento na linha do tempo (rearranjo contábil fica só na trilha). Já trocar empresa ou local gera o evento "Transferência: X → Y em dd/mm"
- [ ] Envie exatamente a mesma combinação que já está vigente `recusar`
      → 400 "Alocação informada já é a vigente"
- [ ] Informe início igual ou anterior à vigência atual `recusar`
      → 400 citando a data da vigência atual
- [ ] Force uma data futura no Início da vigência `recusar`
      → Recusa: a alocação de setembro viraria a vigente de agosto na lista, no headcount, no filtro dos três campos e no perfil de benefícios
- [ ] ⚠ Vá a /estrutura com dp@, inative a empresa "Casa do Montador", volte à ficha e abra os dois seletores `cadeia`
      → A empresa some do seletor de Registro E os centros de custo dela somem do seletor de Centro de custo. Forçando o POST com esse centro: 400 "Centro de custo indisponível: ou ele foi inativado, ou a empresa do grupo que o mantém foi". Reative depois
      *custou:* inativar empresa que não tirava os centros dela dos seletores era o achado A3
- [ ] Escolha registro = Supply, lotação = Filial Sul e centro de custo = CC-9000 (CSC, mantido pela Supply) `borda`
      → Aceita. Os três são independentes: registro numa empresa, trabalho no prédio de outra, custo num terceiro lugar
- [ ] Depois de trocar o centro de custo, volte a /colaboradores e filtre pelo centro NOVO e depois pelo ANTIGO `numero`
      → A pessoa aparece no novo e some do antigo — o filtro compara a última linha de alocação, a mesma que os cartões mostram
- [ ] Abra a mesma ficha com diretora.pessoas@ `escopo`
      → O bloco Alocação não aparece (ela administra empresa e centro de custo, mas não lotação) e /api/estrutura/opcoes devolve 403 para ela — escolher de uma lista não é o mesmo que poder mudar a lista
- [ ] Abra a Alocação de alguém recém-admitido, que nunca teve lotação `borda`
      → Tabela diz "Nenhuma lotação registrada" e os três seletores nascem vazios — nada é chutado

## Cargos e RCF — /cargos

**Entre como:** dp@ (administrar), recrutador@ e lidertd@ (ver), rh@ e diretora.pessoas@ (nenhuma das duas)

- [ ] Abra /cargos com dp@, depois com recrutador@, depois com rh@ `escopo`
      → Com dp@: tabela com "Faixa salarial ativa" e os botões Nova versão / Nova faixa. Com recrutador@: mesma tabela SEM a coluna de faixa (os campos são removidos do payload) e com o aviso de modo leitura. Com rh@: você é jogado para a home — a analista de RH que PEDIU o RCF não alcança a tela, e a diretora de pessoas também não
- [ ] Com dp@, abra "Novo cargo (RCF completo)" e preencha na ordem: Cargo, Setor, Líder direto, Tipo de contrato previsto, Início da vigência, Missão, Atividades (uma por linha), CHA nas três colunas, Observações e Descrição `criar`
      → 201, o cargo entra na tabela e "Ver/imprimir RCF" mostra o documento na MESMA ordem oficial, com as atividades numeradas na sequência digitada
- [ ] Tente criar sem o nome do cargo, depois sem o Início da vigência `recusar`
      → Os dois são obrigatórios e a recusa diz qual campo falta
- [ ] Informe só a Faixa mínima; depois informe faixa máxima menor que a mínima `recusar`
      → "Informe a faixa completa (mínimo e máximo)" e depois "Faixa máxima deve ser maior ou igual à mínima"
- [ ] Clique "Nova versão" num cargo com RCF preenchido, troque uma atividade, informe vigência de hoje e salve; reabra o RCF impresso `editar`
      → O formulário vem preenchido com o RCF vigente; a versão nova aparece com id de versão NOVO no rodapé, e a anterior continua intacta (versão encerrada é congelada por trigger no banco)
- [ ] Na nova versão, informe vigência igual ou anterior à da versão ativa `recusar`
      → 400 "Início deve ser posterior à vigência atual (dd/mm/aaaa)"
- [ ] ⚠ Na "Nova versão", informe uma data de vigência no FUTURO (ex.: 01/12/2026) e salve; depois abra a lista, a ficha de um ocupante e o RCF impresso `administravel`
      → FALHA ESPERADA: o sistema aceita e a versão futura vira a ATIVA na hora — o nome e o RCF do futuro já aparecem hoje na lista de cargos, no seletor de posição, na ficha do colaborador e no documento impresso. Cargo é lido por status='ativa' sem data, exatamente como empresa, centro de custo, lotação e faixa salarial — mas é o único dos cinco que não passa por exigirVigenciaNaoFutura
      *custou:* é a mesma família do defeito de dinheiro corrigido ontem na faixa salarial (a tabela de 2027 encerrando a de 2026 na hora)
- [ ] Na nova versão, escolha o próprio cargo como Líder direto `recusar`
      → 400 "O cargo não pode ser líder direto de si mesmo"
- [ ] ⚠ Clique "Nova faixa", informe início de vigência no FUTURO e salve `recusar`
      → Recusa: "O início da vigência não pode ser no futuro…". A faixa é o GATE da promoção e quem a lê pergunta por status='ativa', sem data — cadastrar hoje a tabela do ano que vem mediria toda promoção do ano corrente pela régua errada
      *custou:* defeito de dinheiro corrigido ontem; note que o campo de data desta tela ainda NÃO tem limite (só o servidor barra)
- [ ] Crie a faixa nova com data válida e depois abra uma promoção em Demandas para um cargo desse `cadeia`
      → A faixa anterior é encerrada, a coluna "Faixa salarial ativa" mostra a nova, e a justificativa de exceção passa a ser cobrada contra a faixa NOVA
- [ ] Some a coluna "Ocupantes" de todos os cargos `numero`
      → O total tem de bater com os 62 ativos menos quem não tem posição vigente — conta só posição com fim_vigencia nulo de quem não está desligado
- [ ] Crie um cargo sem informar faixa nenhuma `borda`
      → A coluna de faixa mostra "—" e o cargo aparece normalmente no seletor de posição da ficha
- [ ] Procure um cargo sem missão preenchida na coluna RCF `borda`
      → Selo "sem missão" na lista; no RCF impresso, "Não preenchido — o gestor completa em Cargos → Nova versão", nunca um espaço em branco
- [ ] Depois de criar cargo, versão e faixa, confira a trilha `trilha`
      → Linhas em rh.cargo_versao e rh.tabela_salarial_versao com o diff campo a campo do RCF: Setor, Tipo de contrato previsto, Missão, Atividades, CHA · Conhecimentos / Habilidades / Atitudes e Observações

## RCF imprimível — /cargos/[id]/rcf

**Entre como:** recrutador@, lidertd@, gestor@, dp@; e funcionario@ para o contraste

- [ ] Abra o mesmo /cargos/N/rcf com recrutador@ (rh.cargo.ver), com gestor@ (rh.colaborador.ver) e com funcionario@ `escopo`
      → Os dois primeiros veem o documento; o funcionário é jogado para a home — e vê o RCF do PRÓPRIO cargo dentro da ficha dele. Nenhuma faixa salarial aparece nesta página, para ninguém
- [ ] Clique no botão Imprimir e confira o documento gerado `criar`
      → Cabeçalho Fast, tabela de identificação (Cargo, Setor, Líder Direto, Tipo de contrato), Missão, Atividades numeradas na ordem, CHA em TRÊS colunas com as legendas (perfil técnico / experiências necessárias / comportamentos) e Observações — a ordem do documento oficial
- [ ] Digite na URL /cargos/9999/rcf, ou o id de um cargo sem versão ativa `borda`
      → Anote o que aparece: hoje o 404 do serviço estoura na página de erro do Next em vez de uma mensagem tratada. Pela navegação normal o link só existe quando há versão ativa
- [ ] Leia o rodapé, crie uma versão nova do mesmo cargo e leia de novo `numero`
      → "versão N do cargo M": o N muda, o M continua o mesmo — versão nova nunca reescreve a anterior

## Estrutura do grupo — empresas de registro — /estrutura

**Entre como:** dp@ (os três blocos), diretora.pessoas@ (empresa + centro de custo), rh@ e gestor@ (nenhum)

- [ ] Abra /estrutura com dp@, depois com diretora.pessoas@, depois com rh@ `escopo`
      → dp@ vê as três seções (Registro, Lotação, Centro de custo); a diretora vê só Registro e Centro de custo (não tem rh.estabelecimento.administrar); rh@ e gestor@ são jogados para a home
- [ ] Conte as empresas listadas e procure a linha sem CNPJ `numero`
      → 5 empresas; a "Fast Serviços (em constituição)" com CNPJ "—", razão social "—" e Vínculos = 0 — cadastro pela metade de propósito, para o DP completar
- [ ] Crie uma empresa nova deixando o CNPJ em branco, tipo Filial, vigência de hoje `criar`
      → Aceita — o CNPJ é opcional porque a diretoria nomeia a empresa antes de o DP ter o número
- [ ] Crie uma empresa com CNPJ de 13 dígitos; depois com o CNPJ de uma empresa já existente `recusar`
      → "CNPJ deve ter 14 dígitos" e depois 409 "Já existe uma empresa do grupo com este CNPJ"
- [ ] Clique "Renomear" na "Quarta empresa do grupo (renomear)", dê um nome de verdade com vigência de hoje e salve; depois volte a /colaboradores `editar`
      → Versão anterior encerrada, nome novo valendo; os cartões e o seletor de registro passam a mostrar o nome novo, e o histórico continua apontando o nome antigo onde ele valia
- [ ] Renomeie uma empresa com vigência no FUTURO `recusar`
      → 400 "O início da vigência não pode ser no futuro: a versão nova passa a valer assim que é gravada, e o sistema não tem renomeação agendada". Note que o campo de data desta tela não tem limite — só o servidor barra
- [ ] Agora CRIE uma empresa nova com o Início da vigência no futuro (ex.: 01/12/2026) `borda`
      → FALHA ESPERADA: aqui o servidor não barra (criar não passa pela mesma guarda de renomear) e a empresa já nasce ativa hoje, entrando nos seletores. Mesma tela, mesma consequência, dois comportamentos
- [ ] Renomeie com vigência igual ou anterior à versão ativa `recusar`
      → 400 "Início deve ser posterior à vigência atual (dd/mm/aaaa)"
- [ ] Inative a empresa "Casa do Montador" e confira: (a) a linha fica marcada "inativa"; (b) o seletor de Registro na ficha; (c) os centros de custo dela na própria tela; (d) reative `administravel`
      → Some dos seletores de alocação e os centros dela ganham o selo "empresa inativa" e somem da escolha nova. Reativando, tudo volta. Nada é apagado
- [ ] Inative uma empresa que tem Vínculos > 0 e depois filtre /colaboradores por ela `borda`
      → Aceita e não apaga nada: quem já está registrado ali continua aparecendo na lista e continua achável pelo filtro. Não existe botão de excluir — e não deve existir
- [ ] Complete o CNPJ da "Fast Serviços (em constituição)" pelo formulário de nova versão `editar`
      → Aceita e a trilha mostra "CNPJ: (vazio) → número". O CNPJ não é versionado: é a identidade fiscal, e completá-lo é corrigir cadastro, não trocar de empresa
- [ ] Confira a trilha depois de criar, renomear e inativar `trilha`
      → Linhas em rh.empresa_grupo_versao (criação com CNPJ, razão social, nome fantasia, tipo, vigência) e em rh.empresa_grupo ("Situação: ativa → inativa")

## Estrutura do grupo — lotações (locais de trabalho) — /estrutura

**Entre como:** dp@fastdemo.local (única com rh.estabelecimento.administrar)

- [ ] Conte os locais na seção Lotação e cruze com as empresas `numero`
      → 5 locais (Matriz Centro, Filial Norte, Sul, Leste, Oeste) para 4 empresas com CNPJ — a Supply responde por dois locais, que é justamente o caso que o desenho antigo não representava
- [ ] Crie um local novo com unidade, endereço resumido e sem CNPJ `criar`
      → Aceita — desde a 0047 o local físico não tem CNPJ nem razão social próprios; os campos ficaram opcionais só para anotar o estabelecimento do eSocial
- [ ] Crie um local com um CNPJ já usado por outro local `recusar`
      → 409 "Já existe um estabelecimento com este CNPJ"
- [ ] Renomeie um local com vigência futura; depois com vigência anterior à ativa `recusar`
      → 400 da vigência não futura no primeiro caso; 400 citando a data vigente no segundo
- [ ] Inative a "Filial Leste" e volte ao formulário de Alocação de uma ficha `administravel`
      → Ela some do seletor de Lotação (a tela filtra inativado_em) e quem já está lotado lá continua aparecendo na lista e no filtro dos três campos
- [ ] Renomeie um local com um nome de 120 caracteres e depois tente 121 `borda`
      → 120 aceita, 121 recusa. Confira que o nome longo não quebra o chip do cartão em /colaboradores nem o cartão do /organograma

## Estrutura do grupo — centros de custo — /estrutura

**Entre como:** dp@ e diretora.pessoas@ (rh.centro_custo.administrar)

- [ ] Conte os centros de custo e localize o CC-9000 e o CC-6000 `numero`
      → 8 centros. O CC-9000 (CSC) é mantido pela Supply e tem Alocações > 0 de gente registrada em empresas diferentes; o CC-6000 (Implantação Fast Serviços) tem Alocações = 0
- [ ] Crie um centro novo escolhendo a empresa, código e nome, com vigência de hoje `criar`
      → Aceita; ele passa a aparecer no seletor de Centro de custo da ficha imediatamente
- [ ] Repita um código já usado dentro da MESMA empresa; depois use esse mesmo código em OUTRA empresa `recusar`
      → 409 "Já existe um centro de custo com este código nesta empresa" no primeiro; aceita no segundo (o código é único por empresa)
- [ ] Tente criar um centro escolhendo uma empresa que você acabou de inativar `recusar`
      → 400 "Empresa inexistente ou inativa"
- [ ] Suponha que alguém criou "CC-100" quando queria "CC-1000": procure na tela como corrigir o CÓDIGO `administravel`
      → FALHA ESPERADA: a tela só oferece "Renomear", que muda o NOME. O código não é editável em lugar nenhum do sistema. O único caminho é inativar e criar outro, e toda alocação já gravada fica apontando o código errado para sempre
- [ ] Renomeie um centro com vigência de hoje e confira a folha de uma competência antiga `editar`
      → O nome novo aparece na lista, no cartão do colaborador e no seletor; a competência fechada continua com o nome que valia na época
- [ ] Renomeie um centro com vigência futura `recusar`
      → 400 da vigência não futura — o nome corrente é lido por status='ativa', então uma versão futura já responderia por hoje
- [ ] Inative o CC-9000, confira os seletores da ficha e a coluna Alocações, e reative `administravel`
      → Some da escolha nova (o selo "inativo" aparece na linha), a coluna Alocações continua contando o histórico, e reativar devolve ao seletor

## Organograma — /organograma

**Entre como:** dp@, gestor@ e funcionario@ (a tela não tem chave própria, só sessão)

- [ ] Abra /organograma três vezes: dp@, gestor@ e funcionario@ `escopo`
      → dp@: "Você está vendo a estrutura completa da empresa" com bloco de headcount. gestor@: só a subárvore dele. funcionario@: apenas a corrente dele até a diretoria, um filho por nível, e SEM bloco de headcount — três pessoas em linha não são um quadro
- [ ] Com dp@, leia realizado, vagas em aberto e aprovado; depois digite algo na busca e leia de novo `numero`
      → aprovado = realizado + vagas em aberto, e o número NÃO muda ao digitar — o headcount é do recorte visível e ignora filtro e busca de propósito
- [ ] Busque o nome de alguém em nível profundo `borda`
      → O nó casado é destacado, o caminho até ele abre e todos os ancestrais continuam desenhados. As contagens "diretos" e "total" continuam sendo as do quadro COMPLETO — filtro não pode fazer o organograma mentir sobre o tamanho da equipe
- [ ] Busque com 1 caractere só; depois busque um nome que não existe `borda`
      → Com 1 caractere nada acontece (mínimo 2); com nome inexistente a árvore fica vazia e o contador de destacados é 0
- [ ] Combine registro + lotação + centro de custo + cargo no mesmo recorte `escopo`
      → Todos combinam em E, só quem casa fica destacado e ninguém perde o pai na árvore
- [ ] ⚠ Volte à ficha, crie o ciclo (A gestor de B, B gestor de A) e recarregue o organograma `cadeia`
      → Aviso exato "2 pessoa(s) em ciclo na relação gestor→liderado vigente", os dois marcados e o laço cortado num ponto determinístico. Não pode dizer 21
      *custou:* o aviso antigo acusava ciclo para todo mundo pendurado na raiz e inflava o número
- [ ] Desligue um gestor pela ficha e recarregue o organograma `cadeia`
      → Os liderados dele sobem para a raiz, aparece "pessoa(s) com gestor vigente fora do quadro (desligado, por exemplo)" e ninguém pode desaparecer em silêncio. A equipe NÃO é herdada automaticamente pelo gestor do gestor
- [ ] Com dp@, procure o aviso de vaga órfã; depois procure o mesmo aviso com gestor@ `escopo`
      → "vaga(s) em aberto sem gestor identificado" aparece só para quem vê a empresa toda — é achado de DP/RH, não de gestor
- [ ] Alterne para o modo lista, use o zoom e recolha/expanda tudo `borda`
      → Recolher é só exibição: as contagens de diretos e subárvore não podem mudar, e reenquadrar não pode perder a raiz de vista
- [ ] Com o admin (g.dearodrigurs@gmail.com), que não é colaborador, abra /organograma `escopo`
      → A tela diz "Seu usuário não está vinculado a um colaborador — não há estrutura para exibir" em vez de uma árvore vazia sem explicação

## Usuários — /usuarios

**Entre como:** g.dearodrigurs@gmail.com (admin, usuario.administrar)

- [ ] Abra /usuarios com o admin e depois com dp@ e diretora.pessoas@ `escopo`
      → Só o admin entra; as outras contas são jogadas para a home e o card nem aparece
- [ ] Crie um usuário com nome, e-mail e papel, observando a descrição que aparece embaixo do seletor `criar`
      → 201, a senha temporária aparece UMA vez, e o bloco "O que cada papel faz" descreve os 8 papéis, avisando que o acesso real é o conjunto de chaves editável em /perfis
- [ ] Crie um usuário repetindo um e-mail existente `recusar`
      → 409 "Já existe um usuário com este e-mail"
- [ ] Clique em "Desativar" na SUA PRÓPRIA linha `recusar`
      → 400 "Você não pode desativar a si mesmo"
- [ ] Com apenas um administrador ativo no sistema, tente desativá-lo (ou rebaixá-lo pela API) `recusar`
      → 409 "Não é possível desativar ou rebaixar o último administrador ativo" — o sistema não pode se trancar
- [ ] Escolha um usuário já criado e tente TROCAR O PAPEL dele (de funcionario para gestor, por exemplo) `administravel`
      → FALHA ESPERADA: a tela só oferece Ativar/Desativar. Não há como mudar o papel de uma conta existente pela interface, embora a API aceite o campo. Promover alguém obriga a criar outra conta
- [ ] Desative a conta de um colaborador ativo, tente entrar com ela, reative e entre de novo `cadeia`
      → O login recusa enquanto inativa e volta a funcionar com a MESMA senha depois de reativada
- [ ] Confira a trilha depois de criar e depois de desativar `trilha`
      → Linhas em sistema.usuario com "E-mail/Nome/Papel/Ativo" na criação e "Ativo: Sim → Não" na desativação
- [ ] Admita alguém em /colaboradores e volte a /usuarios `cadeia`
      → A conta nova está na lista, papel Funcionário, ativa — a admissão cria pessoa, conta e vínculo na mesma transação
- [ ] Abra o segundo vínculo de alguém desligado (fluxo do bloco de admissão) e confira a conta dela aqui `cadeia`
      → A conta foi REATIVADA (Ativo: Não → Sim) com o motivo "Novo vínculo (matrícula X) para a mesma pessoa" na trilha, e nenhuma senha nova foi gerada

## Perfis de acesso: mover CHAVE, não nome de papel — /perfis

**Entre como:** g.dearodrigurs@gmail.com (admin, perfil.administrar) — nenhuma persona da demo tem esta chave

- [ ] Abra /perfis com o admin e depois com dp@ ou diretora.pessoas@ `escopo`
      → Só o admin entra; os 8 perfis aparecem com as chaves reais ao lado da descrição de cada um
- [ ] Leia "N ativo(s) de M" em cada perfil e cruze com /usuarios `numero`
      → Os números batem com a contagem de contas por papel — mudar um perfil diz na cara quantas pessoas serão afetadas
- [ ] ⚠ ANTES: entre com rh@ e conte /colaboradores (71, "Todos os colaboradores"). Volte ao admin, selecione o perfil RH, DESMARQUE rh.colaborador.ver.todos, salve. DEPOIS: recarregue /colaboradores com rh@ `escopo`
      → Sem migration e sem deploy, rh@ passa a ver só a própria ficha e os liderados vigentes, e o subtítulo muda para "Sua ficha e sua equipe". Remarque a chave e confira que volta a 71. É a prova de que mover a chave muda o que a pessoa vê na hora seguinte
      *custou:* foi um par assim (1 contra 70) que revelou o pior defeito do projeto
- [ ] Marque rh.cargo.ver no perfil RH, salve e abra /cargos com rh@ `cadeia`
      → A tela deixa de jogá-lo para a home e mostra os cargos SEM a coluna de faixa salarial — é a resposta ao "a analista de RH pediu o RCF e não alcança a tela"
- [ ] Desmarque rh.posicao.ver do perfil Diretoria, salve e abra uma ficha com diretora.pessoas@ `cadeia`
      → O campo "Salário" some da aba Dados e a aba Administração perde o histórico de posições; a rota /api/colaboradores/N/posicao passa a devolver 403. Remarque para devolver
- [ ] No perfil Administrador, desmarque usuario.administrar e salve `recusar`
      → 409 "O papel Administrador não pode perder usuario.administrar — sem essas chaves ninguém conseguiria mais administrar o sistema"
- [ ] Estando logado como admin, edite o PRÓPRIO papel e remova perfil.administrar `recusar`
      → 409 "Você está editando o seu próprio papel (Administrador) e removeria perfil.administrar de si mesmo. Peça a outro administrador"
- [ ] Marque no perfil Gestor uma chave com o selo de SENSÍVEL (por exemplo rh.posicao.ver), salve, saia e entre de novo com gestor@ `cadeia`
      → A conta, que hoje entra só com senha, cai no ENROLAMENTO de 2FA — a exigência é derivada da chave, não do nome do papel. Desmarque para devolver o gestor ao fluxo antigo. A rede é de mão única: só fecha
- [ ] Confira a trilha depois de qualquer gravação de perfil `trilha`
      → Linha em sistema.papel_permissao com cada chave "Sem acesso → Concedida" ou "Concedida → Sem acesso" pelo rótulo do catálogo, mais "Usuários afetados: N ativo(s) de M com o papel X"
- [ ] Marque uma caixa e, sem salvar, clique em outro perfil na lista da esquerda `borda`
      → Aviso "Há alterações não salvas neste perfil. Salve ou descarte antes de trocar" e a tela NÃO troca. Clicar em Descartar devolve as caixas ao estado gravado
- [ ] Abra /perfis em duas abas, marque chaves diferentes em cada uma e salve as duas `borda`
      → Vale integralmente a última gravação (a tela manda o estado FINAL, não um delta) — nunca uma soma silenciosa das duas. O diff auditado reflete isso
- [ ] Procure na tela como CRIAR um perfil novo ("Analista de Cargos e Salários"), renomear um existente ou excluir um que não se usa `administravel`
      → FALHA ESPERADA: não existe. /perfis só move chaves entre 8 papéis fixos no código (identidade/esquemas.ts) e num CHECK do banco (0019). Frente ao pedido do dono — "adicionar, excluir e renomear livremente" — esta é a lacuna mais cara do meu escopo, porque é a tela que existe justamente para não chamar dev
- [ ] Role até o fim do catálogo e veja se alguma chave caiu no grupo "Outros" `borda`
      → Nenhuma deveria. Chave em "Outros" significa mapa de prefixos desatualizado — ela aparece, mas no pior lugar para o administrador achar (já aconteceu com as 10 chaves de ponto, promoção e painel executivo)

---

# 2 · Ponto, banco de horas, espelho, parâmetros do ponto e meu-ponto

> O motor de ponto é a peça mais bem defendida do sistema: nenhum número de negócio mora em calculo.ts, os cinco defeitos que custaram dinheiro (hora noturna reduzida, divisor da jornada, divisor do DSR, dia de repouso e janela de arraste) estão cada um amarrado a um par de casos gêmeos na bateria, e a memória de cálculo de cada dia explica minuto a minuto o que a tela mostra. As guardas do serviço são as melhores que li: 404 antes de escrever, 403 antes de 404, atomicidade da competência com nome e matrícula de quem derrubou o mês, append-only de verdade em marcação e banco.
> O que está fraco NÃO é a conta — é o alcance da TELA sobre o que o domínio já sabe fazer. Há uma camada inteira de operação do DP que existe só na API: lançar movimento de banco, ver o extrato, fechar intercorrência como corrigida, apurar uma pessoa, reabrir o relatório de um lote. Cinco rotas prontas, testadas, com trilha, e sem botão. Se o dono passar o sistema a limpo pela tela, ele vai concluir que essas funções não existem.
> E há um defeito de integração de verdade, não de usabilidade: a tela de escala não oferece a âncora, e sem âncora o plantonista que falta some calado — exatamente o buraco que a migration 0034 diz ter fechado. Ele voltou pelo único caminho que ninguém reconferiu: o formulário.
> O segundo padrão que se repete é o silêncio no lugar da negação. /ponto e /ponto/parametros redirecionam para a home quando falta a chave, sem uma palavra. O gestor não descobre que a tela existe; a diretora, que administra o ponto inteiro, não descobre que os parâmetros são do DP. Em todo o resto do módulo a diferença entre negar e mostrar vazio foi tratada com cuidado — nessas duas portas, não.
> Por fim, a bateria: ela é o alarme que protege tudo o que descrevi acima, e é a coisa menos administrável do módulo. Dez casos, nenhum formulário para o décimo primeiro.

## Apurar a competência — /ponto (cartão "Competência")

**Entre como:** dp@fastdemo.local (e depois diretora.pessoas@fastdemo.local, que também tem ponto.administrar)

- [ ] Abra /ponto, deixe o mês passado selecionado e clique em "Apurar competência" `criar`
      → Faixa verde com "N pessoa(s) apurada(s) em MM/AAAA · X intercorrência(s) · 0 sem escala vigente · saldo somado …", e a tabela de baixo com uma linha por colaborador ativo com escala
- [ ] Troque para o mês CORRENTE no dia 1º do mês e clique em "Apurar competência" `recusar`
      → Recusa 409: "A competência MM/AAAA ainda não tem nenhum dia fechado. A apuração vai até ontem — dia em curso não é apurado." — nada gravado
- [ ] Apure o mês CORRENTE no meio do mês e abra o espelho de qualquer pessoa `numero`
      → O último dia listado é ONTEM. Hoje e os dias futuros não aparecem — se aparecessem, cada um viria como falta integral e derrubaria o DSR da semana em folha
- [ ] Na tabela da apuração, confira a coluna Previsto de quem tem jornada COMERCIAL-44 num mês com 22 dias úteis `numero`
      → 22 × 8h48 = 11.616 min (193h36). Se aparecer múltiplo de 8h00 ou de 44h/6, o divisor da jornada voltou a ser chumbado — foi o defeito de R$ 1.708,25/mês
- [ ] ⚠ Confira a coluna Previsto de quem tem LOJA-44 num sábado `numero`
      → 7h20 (440 min), não 4h00 — a jornada é 6x1 de 440 min de segunda a sábado (440 × 6 = 2640)
      *custou:* o nome dizia "sábado 4h" e os parâmetros mandavam 7h20; o rótulo foi corrigido na 0034
- [ ] Confira o Previsto de um plantonista PLANTAO-12X36 `numero`
      → Múltiplo exato de 12h00 (720 min), contando só os dias do ciclo (âncora + 2 dias), nunca todos os dias do mês
- [ ] Clique em "Apurar competência" duas vezes seguidas no mesmo mês e compare os quatro cartões de resumo `numero`
      → Os quatro números idênticos nas duas rodadas. O banco de horas recebe ESTORNO do lançamento anterior + o novo; o saldo não dobra
- [ ] Some à mão a coluna "Banco" da tabela e compare com o cartão "saldo mandado ao banco de horas" `numero`
      → Os dois batem minuto a minuto
- [ ] Em Parâmetros, crie uma nova versão da regra padrão da empresa começando amanhã (o que fecha a atual hoje) e volte a /ponto para apurar o mês que vem `recusar`
      → 422 nomeando as pessoas: "…não puderam ser calculadas, todas pelo mesmo motivo: não há regra de banco de horas vigente para ela nem padrão da empresa — cadastre em Ponto › Parâmetros. São elas: <nome> (matrícula <n>)…" e NADA gravado (a competência é atômica)
- [ ] Apure e depois reapure a mesma competência; peça ao admin para abrir audit.alteracao filtrando tabela rh.apuracao_ponto `trilha`
      → Primeira rodada com ação ponto.apuracao.calcular (de=null); segunda com ponto.apuracao.reapurar e o diff de→para de trabalhado, previsto, he_50, he_100 e saldo_banco
- [ ] Só ABRA /ponto numa competência que já tem apuração (sem clicar em nada) e peça ao admin a última linha de audit.leitura_sensivel `trilha`
      → Uma linha com recurso "ponto.apuracoes", registro = a competência (ex.: 07/2026) e chave_permissao = ponto.administrar — uma por abertura, não uma por pessoa
- [ ] Escolha uma competência que nunca foi apurada (ex.: janeiro de 2021) `borda`
      → Tabela com a frase "Competência ainda não apurada. Importe as marcações e clique em Apurar competência." — texto, não tabela vazia sem explicação
- [ ] Digite 2019 no campo Ano `borda`
      → 400 "Competência inválida — informe ano e mês", não uma tela em branco
- [ ] Entre como gestor@fastdemo.local e digite /ponto na barra de endereço `escopo`
      → HOJE: redireciona para a home SEM UMA PALAVRA. Isso é MOSTRAR NADA, não NEGAR — o gestor não descobre que a tela existe e não é para ele. Deveria dizer que a chave que falta é ponto.administrar
- [ ] Entre como diretora.pessoas@fastdemo.local e abra /ponto `escopo`
      → Vê a empresa inteira e consegue apurar (tem ponto.administrar), mas SEM o botão "Parâmetros" no cabeçalho e SEM o cartão "Importar marcações" — ela não tem ponto.parametros nem ponto.importar
- [ ] Procure na tela um jeito de apurar UMA pessoa só (a que você acabou de corrigir), sem rodar o mês inteiro `administravel`
      → FALHA: não existe. O serviço aceita colaborador_id (esquemaApurarCompetencia) e a função apurar() da tela aceita o parâmetro, mas nenhum botão o passa — reapurar uma correção obriga a rodar as 60+ pessoas

## Importar marcações do relógio — /ponto (cartão "Importar marcações")

**Entre como:** dp@fastdemo.local (única persona com ponto.importar)

- [ ] Cole no campo de texto quatro linhas válidas de uma pessoa (matricula;AAAA-MM-DD;08:00;entrada / …;12:00;inicio_intervalo / …;13:00;fim_intervalo / …;17:48;saida) e clique em Importar `criar`
      → "Lote N: 4 linha(s) lida(s), 4 aceita(s), 0 rejeitada(s)" e as batidas aparecem no espelho da pessoa naquele dia
- [ ] Cole o mesmo bloco com a primeira linha sendo o cabeçalho "matricula;data;hora;tipo" `borda`
      → O cabeçalho é reconhecido e ignorado: continua 4 lidas, não 5
- [ ] Cole uma linha com só três colunas (matricula;data;hora) `recusar`
      → Rejeição da linha com motivo "Esperadas 4 colunas: matrícula, data, hora, tipo" — e as outras linhas do arquivo entram normalmente
- [ ] Cole uma linha com a matrícula 999999 `recusar`
      → Rejeição "Matrícula \"999999\" não encontrada", com o conteúdo da linha ao lado
- [ ] Cole uma linha com a data 30/02/2026 `recusar`
      → Rejeição "Data inválida: 30/02/2026 (use AAAA-MM-DD ou DD/MM/AAAA)" — o calendário é conferido, não só o formato
- [ ] Cole uma linha com data de OUTRO mês, com a competência de julho selecionada `recusar`
      → Rejeição "Data 2026-06-15 fora da competência 07/2026"
- [ ] Cole uma linha com a hora 25:30 `recusar`
      → Rejeição "Hora inválida: 25:30 (use HH:MM)"
- [ ] Cole uma linha com o tipo "almoço" `recusar`
      → Rejeição "Tipo desconhecido: almoço (use entrada, saida, inicio_intervalo ou fim_intervalo)"
- [ ] Cole quatro linhas usando os apelidos do relógio — E, S, "saida almoco" e "volta almoco" `borda`
      → Todas ACEITAS e traduzidas para entrada, saída, início e fim de intervalo
- [ ] Importe o mesmo arquivo uma segunda vez `borda`
      → Todas as linhas rejeitadas com "Marcação já existente (reimportação ou linha repetida) — ignorada". Nenhuma batida duplicada no espelho
- [ ] Deixe o campo de conteúdo com só linhas em branco e envie `recusar`
      → 422 "Arquivo sem nenhuma linha útil" — e o botão só habilita com conteúdo, então force colando espaços
- [ ] ⚠ Importe uma linha com a matrícula ANTIGA de alguém que foi transferido entre empresas do grupo, com data posterior à transferência `recusar`
      → Rejeição dizendo a janela e a saída: "Matrícula X pertence a vínculo encerrado em DD/MM/AAAA; a matrícula desta pessoa em DD/MM/AAAA é Y"
      *custou:* antes a batida entrava no vínculo ENCERRADO, onde ninguém a vê — e marcação é append-only, então a linha não podia nem ser apagada
- [ ] Troque o separador para vírgula e cole o mesmo conteúdo com ponto e vírgula `borda`
      → Todas rejeitadas por "Esperadas 4 colunas" — o lote fecha com 0 aceitas, mas o lote existe e diz o porquê linha a linha
- [ ] Depois de um lote misto, confira o cabeçalho do relatório `numero`
      → linhas_lidas = aceitas + rejeitadas exatamente (é CHECK do banco); o cabeçalho ignorado NÃO entra em lidas
- [ ] Importe qualquer arquivo e peça ao admin audit.alteracao em rh.lote_importacao_ponto `trilha`
      → Ação ponto.importacao com arquivo, competência, linhas lidas, aceitas e rejeitadas no diff
- [ ] Procure na tela a lista dos lotes já importados (para reabrir o relatório de um lote de ontem) `administravel`
      → FALHA: a tela só mostra o relatório do lote que você acabou de enviar. GET /api/ponto/importacoes e /api/ponto/importacoes/[id] existem e nenhuma tela os chama — o relatório de rejeições some ao recarregar a página

## Fila de intercorrências — /ponto (cartão "Intercorrências abertas")

**Entre como:** dp@fastdemo.local; depois gestor@fastdemo.local pelo /portal-gestor

- [ ] ⚠ Abra /ponto na competência CORRENTE e leia o número entre parênteses no título da seção `numero`
      → O total real da fila, não o tamanho da lista desenhada. O semeador planta 13 defeitos abertos na competência corrente: 4 saídas não batidas, 4 intervalos abaixo do mínimo, 1 dia sem marcação, 2 entradas duplas e 2 saídas duplas
      *custou:* o contador era intercorrencias.length — com 501 abertas o DP lia "500" e achava que era o total
- [ ] Clique em "Justificar" numa linha com o campo Observação vazio `recusar`
      → Erro "Justificar ou ignorar exige observação de ao menos 10 caracteres — é o que a fiscalização lê"; a linha continua na fila
- [ ] Escreva "Atestado médico entregue ao gestor em 12/07" na observação e clique em Justificar `criar`
      → A linha sai da fila, o contador cai de 1 e o espelho da pessoa mostra a intercorrência com situação "Justificada" e a observação
- [ ] Numa linha de "Marcação duplicada", escreva "Eco do coletor conferido no AFD" e clique em Ignorar `criar`
      → Sai da fila com situação "Ignorada" — o fato continua de pé, a observação é o que sustenta a decisão
- [ ] Trate a mesma linha duas vezes (deixe a aba antiga aberta, trate na nova, volte e clique de novo) `recusar`
      → 409 "Essa intercorrência já foi tratada"
- [ ] Procure na fila o botão para fechar uma intercorrência como CORRIGIDA depois de gravar a batida que faltava `administravel`
      → FALHA: a tela só oferece "Justificar" e "Ignorar". O desfecho 'corrigida' — o único que o sistema CONFERE rodando o motor no dia — é inalcançável por qualquer tela, e por isso toda correção real acaba registrada como "justificada", que assume o fato de pé
- [ ] Numa linha de "Entrada sem saída", clique no nome para abrir o espelho, grave a saída que faltou como ajuste manual, volte a /ponto e clique em "Apurar competência" `cadeia`
      → A linha some da fila sozinha (vira status "Resolvida pela reapuração", visível no espelho) e o dia deixa de ser pendente: passa a lançar previsto, trabalhado e o que sobrar de HE ou atraso
- [ ] Depois que a reapuração já resolveu uma linha, tente tratá-la numa aba antiga `recusar`
      → 409 "Uma reapuração já constatou que este fato não existe mais em DD/MM/AAAA — a linha saiu da fila sozinha. Recarregue a tela."
- [ ] Abra a fila numa base com mais de 500 abertas (ou peça ao admin para conferir o total) `borda`
      → Faixa de aviso: "Mostrando 500 das N abertas — as mais recentes. Há pendência aberta desde DD/MM/AAAA, que não cabe nesta lista." O corte é por data DESC, então o que sai são as MAIS ANTIGAS
- [ ] Compare a fila: com dp@fastdemo.local em /ponto (empresa inteira) e com gestor@fastdemo.local no /portal-gestor (só a equipe dele, os 11 ativos) `escopo`
      → O DP vê as 13 abertas de toda a empresa; o gestor vê só as que caem em gente da relação de gestor vigente dele — e a filtragem é na consulta, no servidor, não na tela
- [ ] Abra a fila com o DP e depois com o gestor, e peça ao admin as duas últimas linhas de audit.leitura_sensivel `trilha`
      → Recurso "ponto.intercorrencias" nas duas, mas chave_permissao = ponto.administrar com registro "empresa" no primeiro caso e ponto.ver.equipe com registro "equipe:<id do gestor>" no segundo — a trilha diz QUAL fechadura abriu
- [ ] Trate TODAS as abertas e recarregue `borda`
      → "Nenhuma intercorrência aberta. Fila limpa." — frase, não tabela vazia

## Prazo de compensação e expiração do banco — /ponto (cartão "Prazo de compensação")

**Entre como:** dp@fastdemo.local; repita com diretora.pessoas@fastdemo.local

- [ ] Abra /ponto e leia a tabela de "Prazo de compensação" `numero`
      → Uma linha por pessoa com crédito de pé, com Saldo, Vencido e Próximo vencimento. O prazo é o da regra padrão semeada: 180 dias, com "saldo expira" LIGADO
- [ ] Confira, no rodapé de uma linha, o detalhe dos créditos vencidos `numero`
      → "XhYY de DD/MM/AAAA (venceu DD/MM/AAAA)" — a conta é FIFO: folga e atraso já consumiram os créditos MAIS ANTIGOS primeiro
- [ ] Clique em "Expirar XhYY vencidos" e confirme o aviso `criar`
      → "N movimento(s) de expiração lançado(s), somando XhYY" e o saldo de cada pessoa cai exatamente o valor vencido
- [ ] Clique em Expirar de novo no mesmo dia `borda`
      → 0 movimentos e a tabela some ou zera a coluna Vencido — o débito já consumiu esses créditos (idempotência por construção)
- [ ] Vá a Parâmetros, crie uma nova versão da regra padrão com prazo de 30 dias e volte a /ponto `administravel`
      → A tabela de expiração cresce — o prazo é do acordo, não do código. Se nada mudar, o parâmetro é morto e a tela está mentindo sobre uma política que não existe
- [ ] Crie uma nova versão da regra com "saldo expira no fim do prazo" DESMARCADO `administravel`
      → Os créditos gravados a partir da vigência dessa versão passam a ter Próximo vencimento "—" e o cartão inteiro esvazia quando não sobrar nada a vencer
- [ ] Depois de expirar, peça ao admin audit.alteracao em rh.banco_horas_movimento `trilha`
      → Uma linha por pessoa com ação ponto.banco.expiracao, o saldo de→para e a lista dos créditos vencidos no diff
- [ ] Entre como diretora.pessoas@fastdemo.local e tente expirar `escopo`
      → CONSEGUE (é ponto.administrar). Ela mexe no passivo da empresa inteira — mas NÃO consegue lançar um movimento manual de banco numa pessoa, que exige ponto.ajustar. Vale conferir se esse par é o desenho que você quer
- [ ] Numa base sem nada vencido, abra /ponto `borda`
      → O cartão só aparece se houver alguém com crédito a vencer; havendo, mostra "Nada vencido hoje — a coluna acima mostra o que vence a seguir"

## Espelho de ponto — /ponto/espelho/[colaboradorId] (números e memória)

**Entre como:** dp@fastdemo.local

- [ ] Abra o espelho de alguém com jornada COMERCIAL-44 na competência anterior e leia a linha de uma segunda-feira comum `numero`
      → Previsto 8h48; sábado e domingo com previsto 0h00 e a linha em cinza
- [ ] ⚠ Abra o espelho de um plantonista PLANTAO-12X36 e ache um dia de plantão `numero`
      → Trabalhado 12h00 (720 min) numa linha só — entrada 18:30, intervalo 21:00–22:00 e saída 07:30 do dia seguinte, AMARRADAS ao dia do plantão pela janela de arraste de 780 min
      *custou:* com o 08:00 chumbado, o plantão virava DOIS dias de falta integral, com DSR derrubado e desconto descendo para a folha
- [ ] No mesmo dia de plantão, leia a coluna "Not." `numero`
      → 8h00 (480 min) de noturno FICTO a partir de 7h00 (420 min) de relógio na janela 22:00–05:00 — 420 × 3600 ÷ 3150. Se aparecer 7h00 (420), a hora noturna voltou a valer 60 min e o defeito de 150h de adicional num mês voltou
- [ ] No mesmo dia, leia HE 50% e Banco `numero`
      → 60 min de HE 50% (o acréscimo ficto é jornada CUMPRIDA: 720+60 contra 720 previstos) e 90 min no banco (60 × fator 1,50 da regra padrão)
- [ ] Olhe o dia SEGUINTE ao plantão `borda`
      → Previsto 0h00, sem marcação, sem falta e sem intercorrência — é a folga das 36h do ciclo
- [ ] Clique numa linha de dia normal para abrir a memória de cálculo `numero`
      → Texto com previsto{minutos, criterio, dia_de_escala}, a sequência de marcações, os períodos com a duração de cada um, regra_aplicada, variacoes por marcação, tolerancia_diaria_minutos = 10 e adicional_noturno com hora_noturna_segundos = 3150 e a fórmula por extenso
- [ ] ⚠ Ache um dia do defeito "entrada dupla" (o semeador planta 2) e abra a memória `borda`
      → pendente_de_tratamento: true, regra_aplicada dizendo "pareamento incompleto (falta batida) — dia PENDENTE DE TRATAMENTO", falta 0h00, atraso 0h00 e HE 0h00. O trabalhado observado aparece, mas nada é lançado
      *custou:* quando o motor tratava tipo igual como "eco do coletor", entrada 08:00 + entrada 13:00 + saída 18:00 rendia 10h corridas, 72 min de HORA EXTRA INVENTADA e 108 min creditados no banco, com a folha importando o número
- [ ] Ache um dia do defeito "saída dupla" (fechamento sem abertura) `borda`
      → Também pendente, com a intercorrência "Entrada sem saída" e o detalhe dizendo que a marcação de saída não tem entrada correspondente
- [ ] Ache um dia com intervalo de 25 min (o defeito plantado) num dia de mais de 6h trabalhadas `numero`
      → Intercorrência "Intervalo incompleto" com o texto "X min trabalhados com apenas 25 min de intervalo (mínimo da jornada: 60 min)" — e o dia CONTINUA lançando: quem almoçou menos ficou 35 min a mais à disposição e isso sai como extra
- [ ] ⚠ Ache uma semana com falta integral (competência anterior) e confira o rodapé do cartão de resumo `numero`
      → DSR descontado = 528 min por semana com falta em quem é COMERCIAL-44 (2640 ÷ 5) e 440 em quem é LOJA-44 (2640 ÷ 6). Duas faltas na mesma semana descontam UM DSR, não dois
      *custou:* com divisor 6 fixo, quem tinha dia de 8h48 perdia 440 em vez de 528 — 88 min por semana, sempre a favor da empresa
- [ ] Ache um dia trabalhado em FERIADO (o semeador cria o "Aniversário da cidade" para quem é da Matriz Centro) `numero`
      → Previsto 0h00, tudo o que foi trabalhado em HE 100% do PRIMEIRO minuto (não há jornada contratada da qual variar, então não há tolerância) e a etiqueta do feriado no dia
- [ ] ⚠ Ache um dia com atraso de 20 min e um com saída 20 min depois, na mesma pessoa `numero`
      → Os dois aparecem: 20 min de ATRASO num e 20 min de HE no outro, sem se anularem. Atraso e extra saem pelo SINAL da variação, nunca por compensação entre as pontas
      *custou:* quem chegava 20 min atrasado e saía 20 min depois zerava as duas pontas — o atraso desaparecia e a hora extra junto
- [ ] Ache um dia com variação de 4 min na entrada e 4 na saída `numero`
      → Nada lançado: cabe na tolerância de 5 min por marcação, com teto de 10 min no dia (art. 58 §1º). Com 12 min numa ponta, computa-se a TOTALIDADE dos 12, não o excedente de 7 (Súmula 366 TST)
- [ ] Abra o espelho de uma competência que ainda não foi apurada para aquela pessoa `borda`
      → Faixa "Competência ainda não apurada para esta pessoa. As marcações abaixo existem, mas os números só nascem depois de apurar em /ponto" — com link. Não é tela vazia
- [ ] Abra o espelho de alguém recém-admitido, num mês em que ele entrou no dia 15 `borda`
      → O dia a dia começa no dia 15, não no dia 1º — quem não tinha escala não deve meia competência de falta integral com DSR

## Corrigir marcação — /ponto/espelho/[colaboradorId] (cartão "Corrigir marcação")

**Entre como:** dp@fastdemo.local (ponto.ajustar)

- [ ] Num dia com saída não batida, preencha data, hora 17:48, tipo Saída e a justificativa "Saída não registrada pelo relógio; conferido com o gestor" e clique em "Gravar correção" `criar`
      → 201 e a mensagem "Marcação nova gravada (origem ajuste manual). Reapure a competência em /ponto para os números mudarem." A batida aparece em LARANJA no dia
- [ ] Grave uma correção com a justificativa "erro" (4 caracteres) `recusar`
      → "Ajuste de ponto exige justificativa (mínimo 10 caracteres)" — recusa antes de gravar
- [ ] Numa batida errada, informe o número dela em "Substitui #", grave a hora certa e reabra o dia `criar`
      → A batida antiga aparece RISCADA com situação "substituída" e a nova em laranja. A antiga continua na tabela — nada é apagado (rh.marcacao é append-only e o trigger recusa UPDATE mesmo por fora)
- [ ] Informe em "Substitui #" o número de uma marcação de OUTRA pessoa `recusar`
      → 422 "A marcação corrigida é de outro colaborador"
- [ ] Corrija duas vezes a MESMA marcação original `recusar`
      → 409 "Essa marcação já foi corrigida por outra"
- [ ] Informe um "Substitui #" que não existe (ex.: 999999) `recusar`
      → 404 "Marcação original não encontrada", não 500
- [ ] Marque "anular a marcação informada" deixando o campo Substitui # em branco `recusar`
      → "Anulação precisa apontar a marcação que sai da apuração"
- [ ] Anule uma batida indevida informando o número dela e a justificativa `criar`
      → A batida aparece riscada com situação "anulada" e some da conta do dia depois de reapurar
- [ ] Grave uma batida com pessoa, instante e tipo idênticos a uma que já existe `recusar`
      → 409 "Já existe uma marcação desse tipo para essa pessoa nesse exato instante" — conflito do usuário, não 500
- [ ] Faça os três atos (incluir uma batida sem substituir, corrigir uma existente e anular outra) e peça ao admin audit.alteracao em rh.marcacao `trilha`
      → TRÊS ações distintas: ponto.marcacao.incluir (com "inclusao: batida ausente reconstituída pelo ajuste"), ponto.marcacao.ajustar (com substitui: <id antigo> → <id novo>) e ponto.marcacao.anular — a inclusão NÃO pode dizer que a batida substitui a si mesma
- [ ] Grave a correção, volte a /ponto e reapure a competência; depois volte ao espelho `cadeia`
      → O dia deixa de ser pendente, o previsto/trabalhado/HE do dia mudam, o banco de horas ganha estorno + novo lançamento e a intercorrência sai da fila
- [ ] Abra o mesmo espelho como diretora.pessoas@fastdemo.local `escopo`
      → Ela VÊ tudo (ponto.administrar) mas o cartão "Corrigir marcação" NÃO aparece — ela não tem ponto.ajustar
- [ ] No campo "Substitui #", procure um jeito de escolher a batida numa lista `borda`
      → FALHA de usabilidade: só há um campo numérico. O DP tem que abrir o detalhe do dia, decorar o id e digitar — errar o número é 404, ou pior, acertar o de outro dia

## Quem vê o ponto de quem — pares por persona (/ponto/espelho, /meu-ponto, /portal-gestor)

**Entre como:** os pares: gestor × funcionario × dp × diretora × recrutador

- [ ] Com gestor@fastdemo.local, abra /ponto/espelho/<id de um liderado> e depois /ponto/espelho/<id de alguém fora da equipe dele> `escopo`
      → PAR: no primeiro vê o espelho inteiro; no segundo 403 "Sem permissão para ver o ponto desta pessoa" — NEGAÇÃO explícita, nunca espelho vazio (vazio faria ele achar que a pessoa não bate ponto)
- [ ] Com funcionario@fastdemo.local, abra /meu-ponto e depois /ponto/espelho/<id de um colega> `escopo`
      → PAR: o próprio espelho abre normalmente; o do colega dá 403. O alcance do próprio não passa por chave nenhuma — é direito do trabalhador (Portaria 671 art. 79)
- [ ] Com recrutador@fastdemo.local, abra /meu-ponto e depois o espelho de um candidato contratado `escopo`
      → PAR: o próprio abre (todo papel tem ponto.ver.proprio); o de terceiro dá 403 — o recrutador não tem ponto.ver.equipe nem ponto.administrar
- [ ] Com lider_td@fastdemo.local, repita o par acima `escopo`
      → Mesmo resultado: próprio sim, terceiro 403
- [ ] Com o DP, abra o espelho de um terceiro; depois, com o gestor, abra o de um liderado; peça ao admin as duas linhas de audit.leitura_sensivel `trilha`
      → PAR na trilha: recurso "ponto.espelho" nas duas, mas chave_permissao = ponto.administrar na primeira e ponto.ver.equipe na segunda. Carimbar sempre a mesma faria a auditoria responder "como gestor da pessoa" para quem leu sendo DP
- [ ] Entre como funcionario, abra /meu-ponto e peça ao admin a trilha de leitura sensível `trilha`
      → NENHUMA linha nova — ler o próprio ponto não é leitura de dado de terceiro e não pode encher a trilha
- [ ] Com o DP, abra /ponto/espelho/999999 `borda`
      → 404 "Colaborador não encontrado" — e NENHUMA linha em audit.leitura_sensivel (ler id fantasma não é leitura de ninguém)
- [ ] Com o gestor, abra /ponto/espelho/999999 `escopo`
      → 403, não 404: o alcance vem ANTES da existência, senão a dupla de respostas vira detector de quais ids existem para quem não pode ler nenhum
- [ ] Com alguém que foi transferido entre empresas do grupo, abra o espelho do VÍNCULO ANTERIOR dele `escopo`
      → Abre. O alcance do próprio é pela PESSOA, não pelo contrato corrente — negar seria negar o direito justo a quem o artigo protege, e logo depois de o sistema anotar que o saldo do banco "foi preservado para o acerto"
- [ ] Com gestor@fastdemo.local, abra /portal-gestor e leia o bloco de banco de horas do time `numero`
      → 11 liderados ativos nominados, cada um com saldo, HE do último mês, média por dia útil e a marca de quem está acima do limite — o limite vem da regra resolvida em três níveis, nunca de número fixo na tela
- [ ] Abra o /portal-gestor e peça a trilha `trilha`
      → UMA linha com recurso "ponto.resumo.equipe" e registro = id do gestor. Ler o time é ler o ponto de 11 terceiros de uma vez: se o caminho largo não gravasse, sairia mais barato que o estreito
- [ ] Com o gestor, force o id de OUTRO gestor na URL do portal (?gestor_id=<outro>) `escopo`
      → 403 "Sem permissão para ver o ponto desta equipe" — só o próprio time, a menos que tenha ponto.administrar

## Parâmetros › Jornadas — /ponto/parametros

**Entre como:** dp@fastdemo.local (única com ponto.parametros)

- [ ] ⚠ Clique em "Cadastrar jornada nova" e olhe os campos ANTES de digitar qualquer coisa `criar`
      → Os 20 campos EM BRANCO, inclusive tipo, carga, tolerância, hora noturna e dia de repouso. Nada pré-preenchido
      *custou:* os padrões da tela (5x2, 08:00, 44:00, 60, 5+5) não fechavam entre si — 5 dias de 8h dão 40h, não 44 — e a jornada montada com os próprios padrões era recusada pelo banco com "Erro interno do servidor", sem campo para consertar
- [ ] Cadastre a jornada COMERCIAL-40: 5x2, diária 08:00, semanal 40:00, intervalo 60, tolerância 5 e 5, noturno 22:00→05:00, hora noturna 3150, repouso domingo, divisor do DSR 5, intervalo obrigatório acima de 360, previsto [0,480,480,480,480,480,0], horário 08:00→17:00, vigência amanhã `criar`
      → 201 e a jornada aparece na tabela com "Previsto na semana" mostrando seg a sex 8h00 e dom/sáb "—"
- [ ] ⚠ Tente salvar a mesma jornada sem escolher o dia de repouso `recusar`
      → "Escolha o dia de repouso ou declare que não há dia fixo" — o campo é obrigatório e NULL é resposta declarada ("sem dia fixo", do 12x36), não campo faltando
      *custou:* enquanto o banco adivinhava, TODA jornada criada pela tela nascia com hora noturna, divisor de DSR e dia de repouso que ninguém escolheu
- [ ] Tente salvar sem preencher "Hora noturna reduzida — segundos por hora ficta" `recusar`
      → "Informe a duração da hora noturna em segundos" — 3150 é urbano (art. 73 §1º), 3600 é rural (Lei 5.889/73 art. 7º); o sistema não escolhe por você
- [ ] Ponha carga diária 10:00 e carga semanal 08:00 `recusar`
      → "Carga semanal não pode ser menor que a diária", apontando o campo carga_semanal
- [ ] ⚠ Ponha carga semanal 44:00 e preencha os 7 dias somando 2400 min `recusar`
      → "A soma dos 7 dias (2400 min) tem de fechar com a carga semanal (2640 min)" — com os DOIS números na mensagem
      *custou:* foi essa incoerência que produziu a jornada chamada "sábado 4h" prevendo 7h20
- [ ] ⚠ Preencha o previsto com 5 dias de trabalho e ponha 6 no "Divisor do DSR" `recusar`
      → "O previsto da semana tem 5 dia(s) de trabalho, mas o divisor do DSR diz 6 — corrija um dos dois"
      *custou:* o divisor derivado por round(semanal ÷ diária) dava 6 num 5x2 de 8h/44h, e o DSR saía 440 em vez de 528
- [ ] ⚠ Escolha repouso na TERÇA e deixe a terça com 480 min previstos `recusar`
      → "O dia de repouso escolhido tem 480 min previstos. Zere o previsto desse dia ou escolha outro dia de repouso"
      *custou:* a loja de folga rotativa recebia domingo (previsto 0) como 100% e o descanso real como dia comum
- [ ] Escolha um dia de repouso e deixe os 7 campos de previsto vazios `recusar`
      → "Com dia de repouso escolhido, informe os 7 dias da semana (0 no dia de folga): é o que prova que o repouso está com previsto zero"
- [ ] Preencha só 3 dos 7 campos de previsto e salve `recusar`
      → "O previsto da semana é tudo ou nada: preencha os 7 dias (0 no dia de folga) ou apague todos" — barrado ainda na tela, antes do POST
- [ ] ⚠ Numa jornada de 12h de carga com 60 de intervalo, ponha 600 em "Arraste até (min)" `recusar`
      → "A janela precisa cobrir a amplitude do turno (780 min = carga diária + intervalo mínimo), senão o turno que vira a noite é apurado como falta"
      *custou:* com 08:00 chumbado, plantões que entram 19:00 ou 20:00 viravam DOIS dias de falta integral com DSR derrubado
- [ ] Ponha 0 em "Arraste até" e salve `borda`
      → ACEITA — zero é escolha explícita e desliga o arraste; a tabela mostra "desligado" na coluna "Arraste até"
- [ ] Deixe "Arraste até" EM BRANCO e salve `borda`
      → Aceita, e a coluna mostra a amplitude derivada pelo banco (carga diária + intervalo): 09:48 num 8h48+60, 13:00 num plantão de 12h+60
- [ ] Preencha só o horário contratual de entrada, deixando a saída em branco `recusar`
      → "Informe entrada E saída do horário contratual, ou deixe os dois em branco"
- [ ] Ponha entrada 08:00, saída 15:00 e carga diária 08:00 `recusar`
      → "Entre entrada e saída têm de caber a carga diária (480 min) mais o intervalo"
- [ ] Cadastre o plantão que vira a noite com entrada 19:00 e saída 31:20 `borda`
      → ACEITA — a saída passa de 24:00 de propósito (o campo aceita até 2879 min) e a tabela mostra 19:00 → 31:20
- [ ] Digite "comercial 44" no código `recusar`
      → "Use letras maiúsculas, números e hífen" — e digitando minúsculo sem espaço, a tela converte para maiúsculo sozinha antes de enviar
- [ ] Numa jornada ativa, clique em "Nova versão" e confira o formulário `editar`
      → Todos os campos vêm semeados da versão VIGENTE, MENOS a vigência, que abre vazia — com a nota dizendo desde quando a versão base vale
- [ ] Na nova versão, ponha uma vigência igual ou anterior à da versão ativa `recusar`
      → 422 "A nova vigência precisa começar depois da versão ativa" — nunca 500
- [ ] Crie uma nova versão de PLANTAO-12X36 mudando SÓ a hora noturna de 3150 para 3600, aponte a escala de um plantonista para ela e reapure `cadeia`
      → O noturno ficto do dia cai de 8h00 para 7h00 e a HE 50% do plantão cai de 60 min para 0 — é o par urbano × rural, e é a prova de que o número não está no código
- [ ] Confira na tabela a coluna "Noturno" das três jornadas do catálogo `numero`
      → 22:00 → 05:00 nas três, com "hora de 52min30s" embaixo (3150 s). Se aparecer "hora de 60 min", o adicional está sendo pago a menos
- [ ] Procure na tabela de jornadas um botão para ENCERRAR ou EXCLUIR uma jornada que foi criada por engano `administravel`
      → FALHA: só existe "Nova versão". Uma jornada errada fica ativa para sempre a menos que se empilhe outra versão por cima — e não há como tirar uma jornada do seletor de escala
- [ ] Crie uma jornada nova e peça ao admin audit.alteracao em rh.jornada_versao `trilha`
      → Ação ponto.jornada.criar (ou .nova_versao) com hora_noturna, dia_repouso_semana, dias_uteis_semana, intervalo_obrigatorio_acima, janela_arraste e o id da versão encerrada no diff — os quatro que decidem dinheiro têm que dizer QUEM escolheu o quê

## Parâmetros › Escalas — /ponto/parametros

**Entre como:** dp@fastdemo.local

- [ ] Em "Definir escala", escolha um colaborador, a jornada COMERCIAL-44, a vigência de amanhã e a observação "Mudança de setor" e salve `criar`
      → "Escala definida. A apuração passa a usar essa jornada a partir da vigência." A escala anterior é encerrada na véspera e a lista mostra só a nova
- [ ] Ao definir escala de alguém para PLANTAO-12X36, procure no formulário o campo da ÂNCORA DA ESCALA (o primeiro dia de plantão do ciclo) `administravel`
      → FALHA GRAVE: o campo não existe e o esquema nem o aceita — a escala nasce com ancora_escala NULL. Consequência direta: o plantonista que NÃO bate ponto num dia de plantão fica com previsto ZERO, sem falta e sem NENHUMA linha na fila do DP — o dia some calado. É exatamente o buraco que a migration 0034 diz que a âncora fecha, e ele voltou pela tela
- [ ] Defina uma escala para alguém com vigência ANTERIOR ao início da escala vigente dele `recusar`
      → HOJE: 500 "Erro interno do servidor" (o fechamento cai antes do início da própria linha e estoura o CHECK fim_vigencia >= inicio_vigencia). A guarda existe em criarVersaoJornada e em criarVersaoRegraBanco e NUNCA foi escrita em definirEscala — deveria dizer a data mínima aceita
- [ ] Defina escala com vigência HOJE e depois defina outra com vigência HOJE de novo `borda`
      → Mesmo problema: o fechamento cairia ontem, antes do início da linha de hoje. Confira se volta 422 explicando ou 500 seco
- [ ] Procure um jeito de ENCERRAR a escala de alguém (afastamento longo, por exemplo) sem apontar outra jornada `administravel`
      → FALHA: só existe "definir", que sempre encerra a anterior e abre uma nova. Quem fica sem escala só sai da apuração se alguém mexer no banco
- [ ] Force pela URL/API uma escala com jornada_versao_id inexistente `recusar`
      → 404 "Jornada não encontrada", apontando o campo jornada_versao_id
- [ ] Defina uma escala e abra a ficha do colaborador `trilha`
      → audit.alteracao com ação ponto.escala.definir, E um EVENTO na linha do tempo da pessoa, tipo escala_de_trabalho, com o resumo "Passou a seguir a jornada <nome>"
- [ ] Conte as linhas de "Escalas vigentes" `numero`
      → Uma por colaborador ativo, no máximo — há índice único de uma escala vigente por pessoa
- [ ] No seletor de Jornada do formulário, confira o que aparece `borda`
      → Só jornadas com status "ativa" — versão encerrada não pode ser escolhida para o futuro, mas continua respondendo pelo passado nas apurações já feitas

## Parâmetros › Feriados — /ponto/parametros

**Entre como:** dp@fastdemo.local

- [ ] Cadastre um feriado nacional: data, nome "Teste nacional", tipo Feriado, abrangência Nacional `criar`
      → 201 e a linha na tabela do ano, com "Feriado (dia de repouso)" e "Nacional"
- [ ] Escolha abrangência Estadual e deixe a UF em branco `recusar`
      → "Feriado estadual ou municipal exige a UF"
- [ ] Escolha Municipal, preencha a UF e deixe o município em branco `recusar`
      → "Feriado municipal exige o município"
- [ ] Escolha Nacional e force UF preenchida (mudando a abrangência depois de digitar a UF) `recusar`
      → "Feriado nacional não leva UF nem município" — a tela zera os campos, mas a regra tem que estar no servidor também
- [ ] Cadastre o mesmo feriado (mesma data e mesmo alcance) duas vezes `recusar`
      → 409 "Já existe esse feriado nessa data com o mesmo alcance", apontando o campo data
- [ ] Cadastre um feriado numa quarta-feira, aponte-o para o mês passado, reapure e abra o espelho de quem trabalhou nesse dia `numero`
      → Previsto 0h00 e TODO o trabalhado em HE 100%, do primeiro minuto — sem tolerância nenhuma
- [ ] Cadastre o mesmo dia como PONTO FACULTATIVO em vez de feriado e reapure `criar`
      → PAR: como ponto facultativo o dia volta a ser dia útil comum — previsto cheio e o trabalho vira HE 50%, não 100%
- [ ] Cadastre um feriado municipal amarrado à unidade Matriz Centro e reapure; compare o espelho de alguém da Matriz com o de alguém de outra unidade no mesmo dia `escopo`
      → PAR: quem é da Matriz naquele DIA tem previsto 0 e 100%; quem é de outra unidade tem dia útil normal. A lotação é resolvida na data do feriado, não no período
- [ ] Remova o feriado e recarregue o espelho SEM reapurar `borda`
      → Os números do espelho continuam como estavam — apuração feita não muda sozinha. Só depois de reapurar o dia volta a ser útil
- [ ] Procure um jeito de RENOMEAR ou corrigir a data de um feriado cadastrado errado `administravel`
      → FALHA: só existe "Remover" e cadastrar de novo. Não há edição — e o remover apaga de verdade a linha (é a única remoção do módulo)
- [ ] Cadastre e depois remova um feriado; peça ao admin audit.alteracao em rh.feriado `trilha`
      → Duas linhas: ponto.feriado.criar com data/nome/abrangência/tipo, e ponto.feriado.remover com o que SAIU (data e nome de→null)
- [ ] Troque o campo Ano para 2030 `borda`
      → "Nenhum feriado cadastrado neste ano" — frase explícita, não tabela vazia

## Parâmetros › Regras de banco de horas — /ponto/parametros

**Entre como:** dp@fastdemo.local

- [ ] Leia a linha "Padrão da empresa" na tabela de regras `numero`
      → Limite + 40h00 (2400 min), Limite − 20h00 (1200 min), Prazo 180 dias, Fator 50% 1,50, Fator 100% 2,00, Rescisão "Paga o saldo positivo na rescisão", vigente desde 01/01/2026
- [ ] ⚠ Clique em "Cadastrar regra de outro escopo" e confira os campos antes de digitar `criar`
      → Todos EM BRANCO, incluindo prazo, os dois limites, os dois fatores e o tratamento na rescisão
      *custou:* vinham "180", "40:00", "20:00", "1.5" e "2" prontos em campos required — limite, fator e prazo gravados com um clique, e o 1,5 ainda contradizia o padrão que a demo semeia
- [ ] Crie uma regra de escopo Cargo para "Conferente": prazo 90, limite + 20:00, limite − 10:00, fatores 1,50 e 2,00, rescisão "Compensa no aviso prévio", vigência amanhã `criar`
      → 201 e a linha aparece com escopo "Cargo". A resolução na apuração é pessoa → cargo → unidade → empresa, do mais específico para o mais geral
- [ ] Crie uma regra de escopo Pessoa para alguém que tem o cargo Conferente e reapure `criar`
      → A regra de PESSOA vence a de cargo — confira na memória da apuração, no bloco regra_banco_horas_versao, que o id gravado é o da regra de pessoa
- [ ] Pela API, mande estabelecimento_id e cargo_id ao mesmo tempo `recusar`
      → "Escolha UM escopo: unidade, cargo ou pessoa (sem nenhum = padrão da empresa)" — a tela já força um só, mas a regra tem que estar no esquema
- [ ] Ponha 0,80 no Fator 50% `recusar`
      → "Fator mínimo 1,00 (hora a hora)" — o campo é number com min=1, então force pela API se preciso
- [ ] Ponha 0 ou 800 no campo Prazo (dias) `recusar`
      → Recusa: o prazo aceita de 1 a 730 dias, aqui e no CHECK do banco
- [ ] ⚠ Crie uma nova versão do mesmo escopo com vigência igual à da versão ativa `recusar`
      → 422 dizendo a data MÍNIMA aceita: "A nova vigência precisa começar depois da versão ativa deste escopo (que vale desde AAAA-MM-DD) — a partir de AAAA-MM-DD…"
      *custou:* antes o CHECK do banco estourava e o DP recebia "Erro interno do servidor", 500 sem uma palavra sobre o que fazer
- [ ] ⚠ Crie uma nova versão do padrão da empresa com limite + de 01:00, volte a /ponto e reapure a competência `numero`
      → Quem tinha crédito acima de 1h passa a receber só até o limite, e nasce uma intercorrência "Banco de horas no limite" dizendo o número exato que ficou de fora e as três saídas (folga programada, teto maior ou pagamento)
      *custou:* o limite era conferido só no lançamento manual: +1 min à mão voltava 422 citando o teto e, no mesmo minuto, a apuração creditava 356 min sem bloqueio — o caminho que move a maior parte do passivo passava por cima do limite
- [ ] Depois do corte, confira que a hora extra da pessoa continua no espelho e na folha `numero`
      → HE 50% e HE 100% permanecem inteiras em minutos crus — não creditar o excedente no banco não tira um minuto de ninguém, só impede o livro de compensação de crescer além do acordo
- [ ] Reapure DUAS vezes seguidas a mesma competência com o teto estourado e compare o saldo `numero`
      → Número idêntico: o teto é conferido contra o saldo JÁ ESTORNADO, senão a reapuração veria o próprio crédito anterior como se fosse de outro e cortaria o dobro
- [ ] Numa pessoa com saldo transportado ACIMA do teto (o semeador cria ~1 em 8), tente lançar (pela API POST /api/ponto/banco) uma compensação NEGATIVA de 240 min `borda`
      → PASSA. O limite barra quem AFASTA o saldo do teto, não quem o aproxima — barrar pelo estado final trancaria o DP sem poder compensar quem estourou
- [ ] Na mesma pessoa acima do teto, tente lançar +60 min `recusar`
      → 422 "Saldo passaria de XhYY e o limite positivo da regra (Padrão da empresa) é 40h00 — o saldo atual já está acima do limite, então só passa movimento que o reduza"
- [ ] Procure um jeito de EXCLUIR ou encerrar uma regra criada por engano num escopo errado `administravel`
      → FALHA: só "Nova versão". Uma regra de cargo criada por acidente vence para sempre a regra da empresa naquele cargo
- [ ] Crie uma versão de regra e peça ao admin audit.alteracao em rh.regra_banco_horas_versao `trilha`
      → Ação ponto.regra_banco.nova_versao com escopo ("cargo 7", "pessoa 12" ou "padrão da empresa"), os dois limites, o prazo, os dois fatores e o id da versão encerrada
- [ ] Apague a única regra ativa padrão da empresa (pelo admin) e recarregue a tela `borda`
      → Faixa crítica: "Não há regra ATIVA padrão da empresa. Sem ela a apuração recusa rodar…" — e apurar de fato recusa com 422 nomeando as pessoas

## Parâmetros › Bateria de casos de teste do motor — /ponto/parametros

**Entre como:** dp@fastdemo.local

- [ ] Clique em "Rodar bateria" `numero`
      → 10 casos ativos, 10 PASS, 0 FAIL. Os dez são: noturno_hora_reduzida_52min30, noturno_hora_cheia_3600_rural, plantao_12x36_intervalo_na_meia_noite, plantao_12x36_virada_do_mes, dsr_por_carga_5x2_divisor_5, dsr_por_carga_6x1_divisor_6, repouso_na_terca_nao_no_domingo, tolerancia_por_marcacao_20_min, dupla_abertura_entrada_sobre_entrada e batida_repetida_no_mesmo_minuto
- [ ] Abra "Descrição da conta" do caso noturno_hora_reduzida_52min30 `numero`
      → A conta por extenso: trabalhado 150 + 570 = 720; noturno de relógio 420; ficto 420 × 3600 ÷ 3150 = 480; acréscimo de 60 vira HE 50%; banco 60 × 1,50 = 90
- [ ] Compare os dois casos GÊMEOS de hora noturna (52min30 urbano × 3600 rural) `numero`
      → Mesmas batidas, mesmos 720 trabalhados e 420 de relógio; o urbano dá HE 50% = 60 e banco 90, o rural dá 0 e 0. Um número chumbado no fonte não consegue passar nos dois
- [ ] Procure na tela o botão para ACRESCENTAR um caso novo à bateria (o dono pediu textualmente que a lista fosse administrável) `administravel`
      → FALHA: não existe formulário, e não existe rota de escrita — /api/ponto/suite só tem POST de EXECUÇÃO. Acrescentar um caso hoje exige INSERT em rh.caso_teste_ponto por SQL. A bateria é a peça que impede o número de negócio de voltar ao código, e ela é a menos administrável do módulo
- [ ] Depois de criar uma jornada nova pela tela, rode a bateria de novo `numero`
      → Continua 10 PASS. A jornada de cada caso é DECLARADA por inteiro no próprio caso, então mexer no catálogo não faz o alarme tocar sem motivo
- [ ] Peça ao admin para gravar um caso com a saída esperada faltando um dos 10 totais e rode a bateria `borda`
      → FAIL com a mensagem "Caso malformado: entrada/saída não seguem o contrato do motor (<campo>: <mensagem>)" — caso malformado aparece como caso malformado, nunca como diferença de minuto
- [ ] Entre como diretora.pessoas@fastdemo.local e tente abrir /ponto/parametros `escopo`
      → Redireciona para a home em silêncio — ela não tem ponto.parametros, então não alcança a bateria nem os parâmetros. Confira se esse silêncio é o desenho que você quer para quem administra o ponto inteiro

## Meu ponto — /meu-ponto e o portal do colaborador

**Entre como:** funcionario@fastdemo.local

- [ ] Entre como funcionario@fastdemo.local e clique no card "Ponto e banco de horas" da seção "Meu dia" `criar`
      → Cai direto no PRÓPRIO espelho, na última competência que tem apuração — a URL vira /ponto/espelho/<id>?ano=&mes= e o id é resolvido pela SESSÃO, nunca lido da requisição
- [ ] Leia o cartão "saldo atual do banco de horas" `numero`
      → Saldo positivo alto — o semeador dá 21h00 de transporte a esta persona (1.260 min), menos 4h00 de compensação (−240) do dia 13 da competência anterior, mais o que as duas apurações creditaram até o teto de 40h00
- [ ] Confira que a soma dos cinco cartões bate com o dia a dia `numero`
      → Previsto, trabalhado, HE (50+100) e faltas iguais à soma das colunas da tabela do mês
- [ ] Role até o fim do espelho procurando o cartão "Corrigir marcação" `escopo`
      → NÃO aparece — o colaborador não tem ponto.ajustar. Ele lê, confere e reclama com o DP; corrigir é ato do DP com justificativa
- [ ] Depois de abrir /meu-ponto, peça ao admin a trilha de leitura sensível `trilha`
      → Nenhuma linha nova — é direito do trabalhador (Portaria 671 art. 79) e não pode custar uma entrada de auditoria
- [ ] Entre com uma conta de sistema sem vínculo no quadro (o admin g.dearodrigurs@gmail.com) e abra /meu-ponto `borda`
      → Redireciona para /portal-colaborador — não há espelho para quem não é do quadro, e a tela diz isso em vez de dar erro
- [ ] No /portal-colaborador, leia o bloco de ponto `numero`
      → Saldo do banco, média de HE por dia útil e total de HE do último mês. Nenhum valor em REAIS — hora extra em dinheiro é folha, com chave e trilha próprias
- [ ] Volte o mês do espelho para uma competência anterior à admissão da pessoa `borda`
      → Espelho vazio de dias, com as marcações (nenhuma) e a nota de competência não apurada — não 404 nem erro

## Cadeias entre módulos — onde o ponto aparece fora do ponto

**Entre como:** dp@fastdemo.local para os elos de folha e desligamento; gestor e diretora para os elos de leitura

- [ ] Cadeia completa da admissão até o contracheque: admita alguém, defina a escala em /ponto/parametros, importe as marcações do mês em /ponto, apure a competência, abra a folha da MESMA competência e clique em "Importar do ponto" `cadeia`
      → Confira elo a elo: (1) escala aparece em "Escalas vigentes"; (2) marcações no espelho; (3) linha na tabela de apuração de /ponto; (4) na folha, as variáveis de origem 'ponto' — rubrica 1101 (HE 50%) e 1102 (HE 100%) em HORAS, 1103 (adicional noturno) em HORAS a partir do FICTO, e 1201 (faltas) em DIAS = minutos de falta ÷ carga diária da jornada PINADA na apuração (8h48 no administrativo, 7h20 na loja)
- [ ] Tente importar o ponto para a folha com a fila de intercorrências AINDA aberta na competência `cadeia`
      → 409 pedindo confirmação explícita, com o número de pendências. Confirmando, a importação passa e a confirmação FICA GRAVADA na trilha da folha com o número de pendências que havia na hora
- [ ] Confira que a intercorrência "Banco de horas no limite" NÃO conta para esse bloqueio `numero`
      → A fila que barra a folha exclui banco_fora_do_limite: ela é decisão sobre o BANCO, não dia que a apuração não fechou — a hora extra que a produziu já está lançada e vai à folha inteira
- [ ] Tente importar o ponto numa competência de folha sem NENHUMA apuração de ponto `recusar`
      → 409 "Nenhuma apuração de ponto para MM/AAAA. Apure o ponto da competência em Ponto (DP) antes de importar."
- [ ] Reapure o ponto DEPOIS de já ter importado para a folha e reimporte `cadeia`
      → O lote anterior de origem 'ponto' é apagado e regravado do zero; o que o DP lançou À MÃO na folha continua lá, intacto
- [ ] Desligue alguém que tem saldo positivo no banco de horas, com a regra padrão (tratamento "paga") `cadeia`
      → NADA é lançado automaticamente: o saldo fica de pé, visível e íntegro, e a trilha do desligamento registra "saldo de XhYY preservado para o acerto — a regra manda paga, e isso é lançamento de gente"
- [ ] Crie uma regra de PESSOA com tratamento "Saldo é perdido na rescisão" e desligue essa pessoa `cadeia`
      → PAR com o caso anterior: agora um movimento de origem 'rescisao' zera o saldo — inclusive se ele for NEGATIVO, porque cobrar horas de quem já foi desligado não é decisão que o sistema toma sozinho
- [ ] Abra a ficha de um colaborador (/colaboradores/[id]) como DP e ache o bloco de ponto `cadeia`
      → Saldo do banco, HE do último mês e link para o espelho — e a leitura grava audit.leitura_sensivel com recurso "ponto.resumo"
- [ ] Abra a Central de Metas e confira os dois indicadores de ponto `cadeia`
      → "Horas extras" = HE ÷ horas trabalhadas dos últimos 12 meses em %, e "Saldo do banco de horas" em HORAS, com o detalhe "XhYY somados em N colaborador(es) ativo(s) com saldo diferente de zero". Sem apuração no período o valor é "sem dados", NUNCA zero — zero mentiria dizendo "nenhuma hora extra"
- [ ] Desligue um gestor e depois abra o portal do gestor dele `cadeia`
      → A relação de gestor é encerrada no desligamento, então a equipe some do alcance dele — confira que o ex-gestor não continua lendo o ponto de 11 pessoas
- [ ] Transfira alguém entre empresas do grupo e, no dia seguinte, importe um arquivo do relógio com a matrícula ANTIGA dele `cadeia`
      → Rejeição com a matrícula nova ao lado — e o espelho do vínculo anterior continua acessível ao PRÓPRIO trabalhador, com o saldo de banco preservado

## Banco de horas — extrato e movimento manual (o que a API tem e a tela não)

**Entre como:** dp@fastdemo.local

- [ ] Procure em /ponto ou no espelho um jeito de lançar uma COMPENSAÇÃO (folga acordada) no banco de horas de alguém `administravel`
      → FALHA: não existe. POST /api/ponto/banco existe, aceita compensação, expiração, ajuste e rescisão, confere o limite da regra e grava trilha — e NENHUMA tela o chama. A única escrita de banco alcançável pela tela é a expiração em massa
- [ ] Procure a tela do EXTRATO do banco de horas de uma pessoa (movimento a movimento, com data, origem e observação) `administravel`
      → FALHA: GET /api/ponto/banco/[colaboradorId] devolve saldo, a regra vigente e os movimentos, e nenhuma tela o consome. O espelho mostra só o saldo TOTAL — o DP não consegue explicar ao trabalhador de onde veio o número
- [ ] Pela API, lance um movimento de 0 minutos `recusar`
      → "Movimento zerado não é movimento"
- [ ] Pela API, lance um movimento com observação "ok" `recusar`
      → "Explique o movimento" (mínimo 5 caracteres)
- [ ] Pela API, lance um movimento para um colaborador_id inexistente `recusar`
      → 404 "Colaborador não encontrado" ANTES de qualquer escrita — não 500 pela chave estrangeira
- [ ] Depois de qualquer movimento, confira que o saldo do espelho é a SOMA dos movimentos `numero`
      → Bate exatamente. Saldo nunca é campo editável — para desfazer, lança-se o contrário (append-only)
- [ ] Lance um movimento e peça ao admin audit.alteracao em rh.banco_horas_movimento `trilha`
      → Ação ponto.banco.movimento com o saldo de→para em horas legíveis, a origem e a observação

---

# 3 · Folha de pagamento — competência, rubricas, parâmetros e a ligação ponto→folha (/folha, /folha/[id], /folha/parametros)

> O motor (calculo.ts) é função pura e honesta: centavo inteiro, arredondamento meio-para-cima uma única vez, e a memória de cada item conta a conta inteira (faixas de INSS percorridas, os dois regimes de IRRF, a origem do divisor horário). A correção de ontem — percentual como razão inteira sobre 10^6 em vez de 10^4 — está de fato no código, e o caso da comissão 8,3333% prova isso na tela.
> O eixo de vigência está resolvido e bem documentado: TUDO (salário, jornada, dependentes, versão de rubrica, três tabelas legais) resolve na data de referência = último dia da competência. Os comentários listam com número os defeitos que isso corrigiu.
> O ciclo da competência tem trava real em cada transição, e o fechamento é irreversível por trigger de banco, não por educação da tela. Segregação calculou≠aprovou e TOTP no ato existem.
> A ligação ponto→folha é idempotente por origem e falha ANTES de apagar o lote anterior — o desenho está certo.
> O que está frágil não é o motor, é a BORDA ADMINISTRÁVEL. A tela de nova versão de rubrica oferece dois tipos de cálculo que a tela de nova rubrica proíbe, e escolher um deles derruba a competência inteira. Não existe renomear. A conferência de tabela legal só alcança a versão de hoje, o que cria dois becos sem saída datados.
> Duas telas jogam fora número que a API devolve: o Calcular descarta calculadas/impedidos/variaveis_ignoradas — o mesmo defeito que já foi corrigido no Importar do ponto.
> Faltam duas coisas de produto, não de código: não existe holerite por pessoa (a memória é JSON cru) e o colaborador não vê a própria folha em lugar nenhum.
> Só o papel dp tem qualquer chave de folha; toda a segregação por persona neste escopo é binária (dp x resto), e a negação é redirecionamento, não tela vazia — está certo.

## Lista de competências — /folha

**Entre como:** dp@fastdemo.local (é a única persona com as quatro chaves de folha; o par de acesso está no último bloco)

- [ ] Entre como dp e abra /folha `numero`
      → 4 competências: as 3 últimas FECHADAS (uma por mês, da mais nova para a mais velha) e a do mês corrente ABERTA no topo, com 0 em "Folhas calculadas"
- [ ] Percorra as colunas da lista procurando qualquer valor em reais `escopo`
      → Nenhum. A lista só traz competência, tipo, situação, folhas calculadas, aberta em e fechada em — dinheiro só no painel, que deixa trilha de leitura
- [ ] No cartão "Abrir competência" escolha o mês SEGUINTE do ano corrente e clique Abrir competência `criar`
      → Cria com estado Aberta, aparece na lista e o total calculado é 0
- [ ] Abra de novo exatamente o mesmo mês/ano que você acabou de abrir `recusar`
      → 409 "A competência MM/AAAA já existe.", com o erro apontando o campo Mês
- [ ] ⚠ Tente escolher no seletor de Mês um mês anterior ao corrente `recusar`
      → O seletor não oferece nada antes do mês corrente e o Ano só oferece o corrente e o seguinte; a nota do cartão explica que para frente pode e para trás não
      *custou:* a trava retroativa foi apresentada como pronta numa reunião sem existir — teste que ela existe de fato
- [ ] Troque o Ano para o seguinte, escolha Janeiro, e volte o Ano para o corrente `recusar`
      → O Mês tem que pular sozinho para o mês corrente — nunca pode ficar num mês já passado
- [ ] Abra Dezembro do ano que vem `criar`
      → Aceita. Para frente é livre por decisão de diretoria; o que é proibido é ABRIR para trás
- [ ] Abra uma competência e depois consulte audit.alteracao `trilha`
      → acao 'criacao', tabela rh_folha.competencia_folha, diff com Competência (null → MM/AAAA) e Estado (null → Aberta)
- [ ] Clique Abrir painel na competência recém-criada, sem nenhum lançamento `borda`
      → A seção "Folhas calculadas" nem aparece e a de variáveis diz "Nenhuma variável lançada" — vazio explicado, não tela morta
- [ ] Abra o painel de uma competência FECHADA e olhe a barra de ações `escopo`
      → Vazia: sem Calcular, sem Recalcular, sem Aprovar, sem Fechar, sem lançar e sem remover variável

## Competência ABERTA — lançar e remover variáveis (/folha/[id])

**Entre como:** dp@fastdemo.local

- [ ] Abra o painel da competência ABERTA do mês corrente e anote o número no título "Variáveis lançadas (N)" `numero`
      → Já vem semeada com lançamentos (HE, faltas, comissão, DSR, abono, salário família, descontos de benefício e uma verba genérica); esse N é a base de comparação dos casos seguintes
- [ ] Escolha um colaborador, a rubrica 1301 — Comissão, digite 500 no campo Valor e clique Lançar `criar`
      → Linha nova com Origem "Manual", Valor R$ 500,00 e Referência "—"; o contador do título sobe 1
- [ ] Escolha a rubrica 1101 — Horas Extras 50% e observe o formulário `criar`
      → O campo Valor some e aparece Horas/dias — a rubrica é horas_adicional e o insumo é referência, não dinheiro
- [ ] Numa rubrica de valor informado, digite 0 e tente lançar `recusar`
      → Recusa "A rubrica XXXX exige valor maior que zero." apontando o campo Valor
- [ ] Procure no seletor de Rubrica pelos códigos 1001, 1202, 2001, 2002 e 3001 `recusar`
      → Nenhum aparece — são automáticas e o motor as calcula sozinho; lançar nelas é erro que derruba a competência inteira
- [ ] Lance 2101 — Desconto de Benefício à mão para alguém e em seguida clique Importar descontos de benefícios `borda`
      → A pessoa fica com DUAS linhas de 2101 e o motor SOMA as duas (a reimportação só apaga o lote de origem Benefício). O desconto de benefício é lançável manualmente — confira se isso é o que o DP quer
- [ ] Abra o seletor de Rubrica e vá até o fim da lista `borda`
      → 9001/9002 ficam num grupo separado "Exceção — verbas manuais genéricas", por último; escolhendo uma delas aparece o aviso pedindo para criar rubrica própria
- [ ] Procure um colaborador desligado no seletor de Colaborador `recusar`
      → Não aparece (só ativos). Pela API a recusa é "Só colaboradores ativos entram no cálculo da folha F1."
- [ ] Clique Remover numa variável que você lançou e confirme `editar`
      → A linha some e o contador cai 1. Não existe editar: é remover e lançar de novo — confira que a tela não oferece edição em lugar nenhum
- [ ] Depois de lançar, consulte audit.alteracao da tabela rh_folha.variavel_lancada `trilha`
      → acao 'criacao' com Colaborador, Rubrica, Insumo ("valor informado" ou "referência N") e Origem "Manual" — o VALOR em reais NÃO pode estar no diff
- [ ] Remova uma variável e consulte a trilha de novo `trilha`
      → acao 'exclusao' com Colaborador e Rubrica saindo (de → para null)

## Competência ABERTA — importar do ponto e dos benefícios (/folha/[id])

**Entre como:** dp@fastdemo.local

- [ ] Clique Importar do ponto na competência do mês corrente e leia a pergunta que aparece se houver intercorrência aberta `cadeia`
      → A mensagem diz quantas intercorrências ABERTAS existem e que o número AINDA PODE MUDAR quando o DP tratar a fila — uns dias estão pendentes sem lançar nada, outros já lançaram falta, atraso ou hora extra
- [ ] Cancele essa pergunta `recusar`
      → Nada é importado; o lote anterior de origem Ponto continua intacto e a contagem de variáveis não muda
- [ ] ⚠ Confirme a importação do ponto e leia a faixa verde de resultado `numero`
      → Traz importadas, em quantos colaboradores, quantas do lote anterior foram substituídas e os quatro totais: HE 50% em h, HE 100% em h, adicional noturno em h e faltas em dia(s)
      *custou:* a rota já devolvia esses números e a tela os jogava fora
- [ ] Compare os totais da faixa com a apuração da mesma competência em Ponto (DP) `cadeia`
      → HE 50%, HE 100% e adicional noturno batem hora a hora; as faltas vêm em DIAS = minutos de falta ÷ carga diária da jornada PINADA na apuração (8h48 no administrativo, 7h20 na loja)
- [ ] Procure alguma linha de rubrica 1202 (DSR sobre Faltas) na lista de variáveis depois de importar `borda`
      → Não existe. O DSR não vira variável: o motor o deriva das faltas. O DSR apurado no ponto vai só para o diff da trilha, como conferência
- [ ] Clique Importar do ponto DUAS vezes seguidas e compare os números `borda`
      → Na segunda, "removidas" é igual a "importadas" da primeira e o total de variáveis na tabela fica IGUAL — reimportar não pode duplicar
- [ ] Lance uma HE 50% à mão, depois reimporte do ponto e procure a linha que você lançou `borda`
      → Ela continua lá, com Origem "Manual". Só o lote de origem "Ponto (apuração)" é substituído
- [ ] Abra uma competência de um mês futuro e clique Importar do ponto `recusar`
      → 409 "Nenhuma apuração de ponto para MM/AAAA. Apure o ponto da competência em Ponto (DP) antes de importar." — SEM oferta de "importar assim mesmo"; esse 409 não é pergunta
- [ ] Clique Importar descontos de benefícios e conte as linhas 2101 resultantes `cadeia`
      → Igual ao número de adesões com desconto vigentes NA DATA da competência (último dia do mês), não às adesões de hoje
- [ ] ⚠ Cancele uma adesão de benefício com fim no mês SEGUINTE e reimporte a competência anterior `cadeia`
      → O desconto continua sendo lançado — a adesão valeu o mês inteiro
      *custou:* leitura por bandeira de hoje: 274 linhas / R$ 20.804,70 contra as 277 / R$ 21.008,70 corretas em 07/2026
- [ ] Consulte audit.alteracao com acao 'importacao_ponto' `trilha`
      → Competência, Lote anterior removido, Apurações lidas, Variáveis lançadas, os quatro totais, o DSR do ponto como conferência, e Intercorrências abertas dizendo "importado MESMO ASSIM, por confirmação explícita de quem operou" quando você confirmou
- [ ] Consulte audit.alteracao com acao 'importacao_beneficios' `trilha`
      → Lote anterior removido (N variáveis) e Descontos importados (N adesões ativas com desconto) — sem valores em reais

## Cálculo: aberta → cálculo → conferência (/folha/[id])

**Entre como:** dp@fastdemo.local

- [ ] Clique Calcular na competência aberta e confirme `criar`
      → Ao voltar, a etiqueta muda para "Em conferência" e a seção "Folhas calculadas" aparece com a tabela e os três cartões de total
- [ ] Compare "Folhas calculadas (N)" com o número de colaboradores com vínculo vivo no ÚLTIMO DIA da competência e posição vigente `numero`
      → Bate. Quem não tem posição/salário vigente cai na lista Impedidos e fica FORA do cálculo
- [ ] Se a lista "Impedidos de calcular" aparecer, regularize a posição de um deles na ficha e Recalcule `borda`
      → Ele some da lista de impedidos e ganha uma linha na folha; o contador sobe 1
- [ ] Leia a lista "Mudaram de estado neste mês" `borda`
      → Traz admitido/desligado/afastado/transferido no mês, cada um com "Entra no cálculo? Sim/Não" e a frase do que aconteceu. Transferência entre CNPJs tem que NOMEAR as duas empresas — o dinheiro atravessa CNPJ
- [ ] ⚠ Calcule e procure na tela quantas variáveis foram ignoradas `escopo`
      → Não aparece em lugar nenhum. A rota devolve calculadas, impedidos e variaveis_ignoradas e a tela descarta os três — é o mesmo defeito que já foi corrigido no botão Importar do ponto
      *custou:* número que a rota devolve e a tela joga fora
- [ ] Lance uma variável para alguém, desligue essa pessoa com data dentro da competência e Recalcule `cadeia`
      → Ela sai da folha, a variável CONTINUA visível na lista, e a trilha do cálculo registra "Variáveis ignoradas: 1" — só que a tela não te contou isso
- [ ] Em "Em conferência", clique Recalcular e confirme `editar`
      → O resultado anterior é apagado e regravado inteiro; a contagem e os totais NÃO podem duplicar
- [ ] Com a competência em "Em conferência", procure o formulário de lançar variável e os botões Remover `recusar`
      → Sumiram, e a tabela avisa "Variáveis são somente-leitura fora do estado Aberta". Os botões de importar também sumiram
- [ ] ⚠ Promova alguém com vigência para o MÊS QUE VEM e recalcule a competência CORRENTE `numero`
      → O Salário congelado dele não pode mudar. A folha resolve salário, jornada, dependentes, versão de rubrica e tabelas legais pela data de referência = ÚLTIMO DIA da competência
      *custou:* calcular julho em agosto pagava o salário de agosto, e recalcular devolvia outro número a cada dia
- [ ] Numa competência FECHADA, procure o botão Calcular/Recalcular `recusar`
      → Não existe. Pela API a recusa é "Competência fechada não reabre — correção é competência futura (folha complementar, F2)"
- [ ] Cadastre uma vigência de tabela legal que deixe a data da competência descoberta e clique Calcular `recusar`
      → 409 nomeando qual falta: Tabela INSS / Tabela IRRF / Parâmetros gerais — "cadastre em Parâmetros antes de calcular"
- [ ] Consulte audit.alteracao com acao 'calculo' `trilha`
      → Estado (de → Em conferência), Folhas calculadas, Impedidos e Variáveis ignoradas — e NENHUM valor em reais

## Resultado, memória de cálculo e os números que têm que bater (/folha/[id])

**Entre como:** dp@fastdemo.local

- [ ] Abra Ver itens de quem ganha acima de R$ 8.565,28 (a diretora, por exemplo) e olhe a linha 2001 `numero`
      → Exatamente R$ 998,66, e a memória traz teto_aplicado: true, o teto R$ 8.565,28 e as quatro faixas percorridas
- [ ] Refaça à mão a soma das faixas na memória do 2001 dessa pessoa `numero`
      → 1.631,00×7,5% + (2.933,57−1.631,00)×9% + (4.400,37−2.933,57)×12% + (8.565,28−4.400,37)×14% = 998,6597 → 998,66 (meio-para-cima, uma vez só, no valor final)
- [ ] Abra a memória do item 2002 (IRRF) de qualquer pessoa `numero`
      → Mostra os DOIS regimes — completo (base − INSS − dependentes × R$ 189,59) e simplificado (base − R$ 607,20) —, o imposto de cada um, qual venceu e o critério "vale o imposto MENOR entre os dois regimes"
- [ ] Ache alguém isento de IRRF e procure a linha 2002 dele `borda`
      → AUSENTE, não zerada. Item com valor zero não é gravado — confira se o DP entende essa ausência ou se ela parece dado faltando
- [ ] Abra a memória da linha 1101 (HE 50%) de alguém com jornada de 44 h/semana `numero`
      → horas, fator 1.5, valor_hora = salário ÷ 220 e origem_divisor citando "220 h ÷ 2640 min de referência × 2640 min da jornada do colaborador"
- [ ] ⚠ Abra a memória da HE de alguém em jornada 12x36 (2160 min/semana) `numero`
      → divisor_horas = 180, não 220, com a conta escrita na memória — 220 × 2160 ÷ 2640
      *custou:* o divisor 220 chumbado no motor pagava hora extra a mais para quem cumpre 36 h semanais
- [ ] Ache alguém SEM escala cadastrada na competência e abra a memória de uma HE dele `numero`
      → origem_divisor = "sem jornada vigente — divisor de referência dos parâmetros da folha" — ele entra na folha mesmo assim, não some por falta de cadastro de ponto
- [ ] Ache uma folha com faltas e compare as linhas 1201 e 1202 `numero`
      → Mesmo valor e mesma referência em dias; a memória do 1202 diz "1 dia de DSR por dia de falta" e cita a simplificação F1
- [ ] Numa linha qualquer, some Proventos − Descontos e compare com Líquido; depois procure o 3001 (FGTS) nos dois totais `numero`
      → Proventos − Descontos = Líquido, e o FGTS não entra em nenhum dos dois — é informativa, fica fora do líquido
- [ ] Some os Líquidos de todas as linhas da tabela e compare com o cartão "Líquido total" `numero`
      → Bate exatamente; o cartão é a soma das linhas devolvidas, não um total geral escondido
- [ ] Compare a coluna Dep. IRRF com os dependentes na ficha; depois cadastre um dependente com nascimento no mês SEGUINTE e recalcule `numero`
      → A contagem NÃO muda. O dependente conta por NASCIMENTO, não por data de cadastro — filho nascido em setembro não deduz em julho
- [ ] Abra "Memória de cálculo" de um item e julgue se dá para explicar o valor ao colaborador com o que está na tela `escopo`
      → Hoje sai JSON cru dentro de um <details>. Não existe holerite por pessoa, nem impressão, e o colaborador NÃO vê o próprio holerite em /portal-colaborador (o portal manda abrir a demanda "Dúvida sobre a folha")
- [ ] Abra o painel de uma competência COM folhas calculadas e consulte audit.leitura_sensivel `trilha`
      → Uma linha com chave_permissao 'folha.ver', recurso 'rh_folha.folha_colaborador' e registro_id = id da competência
- [ ] Abra o painel da competência ABERTA (sem nenhuma folha calculada) e consulte a trilha de leitura de novo `trilha`
      → NÃO grava nada — a trilha de leitura só nasce quando há folha calculada no recorte devolvido. Julgue se abrir e filtrar até zerar deveria ficar sem rastro

## Recorte por registro, lotação e centro de custo (/folha/[id])

**Entre como:** dp@fastdemo.local

- [ ] Escolha um centro de custo no recorte e leia o título e os cartões `numero`
      → O título vira "Folhas calculadas (X de N)" e os três cartões passam a dizer "(recorte)"; some as linhas e compare com os cartões — tem que bater
- [ ] Escolha os três campos ao mesmo tempo (registro + lotação + centro de custo) `borda`
      → Combinam em E; o resultado é a interseção e os totais acompanham
- [ ] Escolha uma combinação que não devolve nenhuma linha `borda`
      → A tabela diz "Nenhuma folha desta competência caiu neste recorte…" e os SELETORES continuam cheios — as opções vêm da competência inteira, então dá para voltar
- [ ] Some as linhas de TODOS os centros de custo, um a um, e compare com o total sem recorte `numero`
      → Se der MENOS, existem folhas sem apropriação resolvida — elas ficam fora de qualquer recorte e ninguém as encontra filtrando. Anote o número da diferença
- [ ] Transfira alguém de centro de custo hoje e volte a uma competência JÁ CALCULADA `cadeia`
      → A coluna Centro de custo daquela competência NÃO muda — é a apropriação da data da competência, não a alocação de hoje

## Aprovação e fechamento (/folha/[id])

**Entre como:** dp@fastdemo.local para calcular; o SEGUNDO usuário de papel dp (o outro assistente de DP da demo) para aprovar

- [ ] Com dp@fastdemo.local, calcule a competência e em seguida digite o código 2FA e clique Aprovar `recusar`
      → 409 "Segregação de funções: quem calculou não pode aprovar a mesma competência — outro usuário com a permissão de aprovação precisa fazê-lo."
- [ ] Entre com o outro usuário de papel dp, digite o código do autenticador e clique Aprovar `criar`
      → Estado vai para "Aprovada", o campo de código e o botão Aprovar somem e aparece "Fechar competência"
- [ ] Digite seis dígitos quaisquer como código do autenticador e tente aprovar `recusar`
      → 400 "Código do autenticador inválido." no campo do código; a competência continua em conferência
- [ ] Digite menos de 6 dígitos no campo de código `recusar`
      → O botão Aprovar fica desabilitado — a tela só libera com exatamente 6 dígitos
- [ ] Cadastre em Parâmetros uma versão nova de tabela legal vigente na data da competência e volte ao painel `recusar`
      → Tarja vermelha "Aprovação bloqueada: tabelas legais não conferidas pelo DP (…)" antes mesmo de clicar; clicando, o servidor recusa com a mesma lista
- [ ] Tente aprovar uma competência que está em "Aberta" `recusar`
      → A tela não oferece o botão; a API responde "Aprovação só a partir de Em conferência"
- [ ] Com a competência Aprovada, clique Fechar competência e confirme o aviso de que congela para sempre `criar`
      → Estado "Fechada" e a coluna "Fechada em" preenchida na lista de /folha
- [ ] Procure em toda a tela algum caminho para reabrir a competência fechada `recusar`
      → Não existe — nem botão, nem rota. O trigger do banco barra qualquer mutação; a correção certa é competência futura (folha complementar)
- [ ] Consulte audit.alteracao das ações 'aprovacao' e 'fechamento' `trilha`
      → Na aprovação: Estado, "Tabelas legais: todas as vigentes conferidas pelo DP" e Controles "TOTP revalidado; segregação calculou≠aprovou conferida". No fechamento: Estado Aprovada → Fechada
- [ ] Feche uma competência e olhe o indicador "folha no prazo" na Central de Metas `numero`
      → Conta as competências dos últimos 12 meses fechadas até o DIA 5 do mês seguinte. Esse dia 5 está escrito no SQL e não é editável por ninguém

## Parâmetros — catálogo de rubricas (/folha/parametros)

**Entre como:** dp@fastdemo.local (única com folha.parametros)

- [ ] Abra /folha/parametros e conte as linhas do Catálogo de rubricas `numero`
      → 18 rubricas: 11 da carga inicial (1001, 1101, 1102, 1201, 1202, 2001, 2002, 2101, 3001, 9001, 9002), as 6 nomeadas pela diretoria (1301 Comissão, 1302 Reflexo de Comissão, 1303 DSR, 1304 Reflexo de DSR sobre Comissão, 1401 Abono Pecuniário, 1501 Salário Família) e 1103 Adicional Noturno. 9001/9002 por ÚLTIMO, com a nota de exceção
- [ ] Clique Nova rubrica: código 1305, nome "Prêmio de Produtividade", natureza Provento, tipo Valor informado, vigência no dia 1º do mês corrente, e salve `criar`
      → Aparece no catálogo com versão vigente e passa a ser oferecida no seletor de lançamento da competência aberta
- [ ] Crie uma rubrica com o código 1301 (já existe) `recusar`
      → 409 no campo Código, com a mensagem explicando os blocos: 1xxx remuneração, 2xxx descontos legais e de benefício, 3xxx informativas, 9xxx manuais genéricas
- [ ] Tente criar uma rubrica com código de 3 dígitos ou com letra `recusar`
      → Recusa "Código deve ter exatamente 4 dígitos (ex.: 1305)"
- [ ] Escolha o tipo "Percentual do salário" e deixe o campo Percentual em branco `recusar`
      → Recusa "Este tipo de cálculo exige o parâmetro (fator ou percentual)"
- [ ] ⚠ Crie a rubrica 1310 "Comissão 8,3333%", tipo Percentual do salário, parâmetro 8,3333, vigência no dia 1º do mês corrente; lance para quem ganha R$ 3.000,00, calcule e abra a memória do item `numero`
      → A memória tem que mostrar percentual 8.3333 e valor R$ 250,00. R$ 249,90 é o defeito corrigido ontem: 8,3333% pago como 8,33% — R$ 0,10 por competência por pessoa, e o erro cresce com o salário (em R$ 30.000,00 vira R$ 1,00)
      *custou:* R$ 0,10 por competência, por pessoa, crescendo com o salário
- [ ] Volte ao catálogo e leia a coluna "Versão vigente" da 1310 `numero`
      → "(parâmetro 8.3333)" — quatro casas decimais, não duas. Se aparecer 8.33, a coluna trunca e o defeito voltou pela tela
- [ ] Em 1301 — Comissão clique Nova versão e abra o seletor de Tipo de cálculo `administravel`
      → Ele oferece "Automático (regra do motor)" e "Salário base", que o formulário de rubrica NOVA não oferece — a mesma escolha é proibida num lugar e permitida no outro
- [ ] ⚠ Ainda em 1301, escolha "Automático (regra do motor)", vigência no dia 1º do mês corrente, salve, e depois clique Calcular na competência `recusar`
      → O motor derruba a competência INTEIRA com "Rubrica 1301 (automatico) não aceita lançamento de variável" — uma escolha de duas cliques na tela de parâmetros impede o fechamento da folha
      *custou:* a tela oferece um tipo de cálculo que quebra o cálculo de todo mundo
- [ ] ⚠ Em 1101 — Horas Extras 50% crie uma versão nova com fator 1.7 começando no dia 1º do MÊS QUE VEM, e recalcule a competência do mês CORRENTE `editar`
      → A memória da HE do mês corrente tem que continuar com fator 1.5. Só a competência do mês seguinte usa 1.7
      *custou:* publicar uma versão nova mudava o fator das horas extras do mês passado no primeiro recálculo
- [ ] Crie uma versão nova de rubrica com início no dia 1º do mês CORRENTE e recalcule a competência corrente `borda`
      → O fator novo já vale para o mês inteiro — a data de referência é o ÚLTIMO dia do mês, não o dia da mudança. Confira se é isso que o DP espera
- [ ] Crie uma versão com início igual ou anterior ao início da versão vigente `recusar`
      → 400 "O início da nova versão deve ser posterior ao início da versão vigente." no campo Início de vigência
- [ ] Encerre a rubrica 1305 que você criou: informe fim de vigência e um motivo com pelo menos 5 caracteres `administravel`
      → Sai do seletor de lançamento da competência, a linha do catálogo ganha a marca "inativa" e nada é apagado — os holerites antigos continuam apontando para a versão
- [ ] Procure o botão Encerrar nas linhas de 1001, 1101, 1102, 1103, 1201, 1202, 2001, 2002, 2101 e 3001 `recusar`
      → Não aparece em nenhuma delas — são os códigos que o motor e a importação do ponto procuram pelo nome; pela API a recusa diz que encerrá-las pararia o fechamento da folha
- [ ] Lance a rubrica 1305 para alguém na competência aberta e depois tente encerrá-la `recusar`
      → 409 dizendo quantos lançamentos existem e em QUAIS competências (MM/AAAA). Remova o lançamento e encerre de novo — aí passa
- [ ] Informe um fim de vigência anterior ao início da versão vigente `recusar`
      → 400 no campo Fim de vigência, citando a data de início da versão vigente
- [ ] Deixe o motivo do encerramento com 4 caracteres `recusar`
      → Recusa "Diga por que a rubrica está sendo encerrada" — o motivo vai para a trilha e quem abrir daqui a um ano precisa ler o porquê
- [ ] Tente RENOMEAR uma rubrica existente (por exemplo trocar "DSR" por "DSR sobre horas extras") ou mudar a natureza dela `administravel`
      → Não existe caminho: nem na tela nem na API. Só criar, versionar (incidências, tipo, parâmetro) e encerrar. O dono pediu adicionar, excluir e RENOMEAR livremente — este caso falha
- [ ] Abra Nova rubrica e olhe os campos antes de tocar em qualquer coisa `borda`
      → INSS, IRRF e FGTS já vêm MARCADOS, a natureza já vem "Provento" e o tipo já vem "Valor informado" — ninguém escolheu. Para verba indenizatória (abono, salário família) isso grava incidência errada se o DP só conferir o nome
- [ ] Consulte audit.alteracao depois de criar, versionar e encerrar uma rubrica `trilha`
      → 'criacao' em rh_folha.rubrica com incidências, tipo, parâmetro e vigência; 'nova_versao' em rh_folha.rubrica_versao; 'encerramento' com Situação (No catálogo lançável → Encerrada), Fim de vigência e o Motivo que você escreveu

## Parâmetros — tabelas legais, conferência do DP e suite (/folha/parametros)

**Entre como:** dp@fastdemo.local

- [ ] Leia a tabela INSS vigente `numero`
      → 4 faixas — até 1.631,00 a 7,5%; até 2.933,57 a 9%; até 4.400,37 a 12%; até 8.565,28 a 14% — e teto de contribuição 8.565,28
- [ ] Leia a tabela IRRF vigente `numero`
      → 5 faixas terminando em ∞ a 27,5% com dedução R$ 908,73; dedução por dependente R$ 189,59; desconto simplificado R$ 607,20
- [ ] Leia os Parâmetros gerais vigentes `numero`
      → Salário mínimo R$ 1.631,00, FGTS 8%, divisor de horas 220 h para 44 h/semana e divisor de dias 30
- [ ] Clique "Nova versão da tabela INSS", use Adicionar faixa e Remover para montar 5 faixas, digite valores e vigência 01/01/2027, e salve `administravel`
      → Grava. As faixas moram em JSONB e SÃO editáveis pela tela — inclusive quantas faixas existem; o teto sai da última faixa
- [ ] Monte uma tabela INSS com as faixas fora de ordem crescente e salve `recusar`
      → Recusa "Faixas devem estar em ordem crescente de limite"
- [ ] Na tabela IRRF, tente digitar um teto na ÚLTIMA faixa `recusar`
      → O campo está desabilitado e rotulado "Até (∞)"; pela API a recusa é "A última faixa deve ter limite aberto (sem teto)"
- [ ] ⚠ Depois de cadastrar a tabela INSS de 2027, volte a uma competência do ano corrente e Recalcule `numero`
      → Os valores de INSS NÃO podem mudar — a tabela é resolvida pela data da competência, não pela "ativa"
      *custou:* no dia em que a tabela de 2027 entrasse, a competência de dezembro/2026 ainda aberta passaria a ser calculada com o INSS de 2027, sem nenhum aviso
- [ ] Com a tabela INSS de 2027 cadastrada, olhe o cartão "Conferência do DP — gate da aprovação" e procure como conferir a versão de 2027 `administravel`
      → O cartão só fala da versão vigente HOJE; não há botão para conferir a de 2027. Abra uma competência de 2027, calcule e tente aprovar: fica bloqueada e não existe caminho na tela para desbloquear até o ano virar
- [ ] Repare que ao publicar a versão de 2027 a versão anterior passa a "encerrada"; tente conferir uma versão encerrada `administravel`
      → Recusa "Versão encerrada é imutável — nada a conferir." Se a versão anterior não estivesse conferida antes da publicação, a competência calculada com ela nunca mais é aprovável
- [ ] Clique "Marcar como conferida pelo DP" duas vezes na mesma versão `recusar`
      → A segunda recusa "Esta versão já foi conferida pelo DP."
- [ ] Cadastre uma versão nova dos Parâmetros gerais mudando o divisor de dias de 30 para 31, com vigência no dia 1º do mês corrente, e recalcule a competência corrente `administravel`
      → O desconto de faltas (1201) e o DSR sobre faltas (1202) TÊM que mudar, e a memória tem que citar o divisor novo e o id da versão de parâmetro usada
- [ ] ⚠ Abra o formulário de Parâmetros gerais e olhe os campos antes de digitar `borda`
      → Salário mínimo entra SEMPRE em branco; alíquota e divisores vêm da versão ativa, com a nota dizendo de que data. A nota de rodapé cita o divisor VIGENTE, não um número escrito na tela
      *custou:* os campos nasciam com 220, 44, 30 e 8% e bastava preencher salário mínimo e vigência para gravar um divisor que ninguém escolheu
- [ ] Clique Rodar suite na seção "Suite de casos de teste do motor" `numero`
      → 5 casos ativos, 5 PASS, 0 FAIL. Abra a "Descrição da conta" de cada um: salário 3.000 (INSS 247,53, líquido 2.752,47, sem IRRF), HE 50% 2.000+10h (HE 136,36), falta com DSR 3.300 (1201 e 1202 de 110,00, IRRF 3,30, líquido 2.819,57), teto INSS 9.000 (INSS 998,66, IRRF 1.291,64) e IRRF alta 12.000 com 2 dependentes (IRRF 2.012,36, líquido 8.988,98)
- [ ] Cadastre uma tabela INSS nova vigente HOJE e rode a suite de novo `numero`
      → Ela TEM que falhar, com a diferença esperado → obtido caso a caso. Esse alarme é o objetivo — a suite roda contra as versões em vigor hoje justamente para tocar quando uma tabela nova entra
- [ ] Consulte audit.alteracao depois de cadastrar uma versão de tabela legal `trilha`
      → acao 'nova_versao', com as faixas listadas, o início de vigência e "Conferida pelo DP: NÃO — toda carga entra não conferida". Depois de clicar em conferir: acao 'conferencia_dp' com Não → Sim

## Acesso: quem vê a folha e quem não vê (par de personas)

**Entre como:** pares — dp@fastdemo.local contra cada uma das outras seis

- [ ] Entre como gestor@fastdemo.local e digite /folha na barra de endereços; depois faça o mesmo com dp@fastdemo.local `escopo`
      → Com gestor: vai para a home (redirecionamento). Com dp: abre a lista das 4 competências. Confira que é NEGAÇÃO, não tela vazia — gestor sem folha.ver não pode ficar achando que "não há folha"
- [ ] Repita a mesma URL com funcionario@, rh@, recrutador@, lidertd@ e diretora.pessoas@ `escopo`
      → Todas voltam para a home: hoje SÓ o papel dp tem as quatro chaves de folha. Se o dono espera que a diretora veja o custo, isso é concessão em /perfis, não defeito de tela
- [ ] Entre como diretora.pessoas@fastdemo.local e abra /painel-executivo `escopo`
      → O card de custo de pessoal aparece explicitamente BLOQUEADO ("requer permissão de folha") — nunca zerado, nunca em branco
- [ ] Entre como dp e confira o atalho "Parâmetros" no cabeçalho de /folha; depois entre como qualquer outra persona e digite /folha/parametros `escopo`
      → Com dp o atalho existe e a tela abre. Com as outras o atalho não aparece e a URL direta redireciona para a home
- [ ] Entre com rh@fastdemo.local e tente disparar Rodar suite (a rota /api/folha/suite) `escopo`
      → 403 — a suite exige folha.operar, mesma chave do cálculo
- [ ] Abra /perfis como admin e procure folha.ver, folha.operar, folha.aprovar e folha.parametros `escopo`
      → As quatro existem e podem ser concedidas a outro papel pela tela; folha.ver e folha.aprovar têm que aparecer marcadas como chaves que exigem 2FA
- [ ] Conceda folha.ver a outro papel em /perfis, entre com essa persona e abra /folha `cadeia`
      → A lista abre, o painel mostra valores e a leitura passa a gravar em audit.leitura_sensivel com a chave que DE FATO autorizou — e o login dessa persona passa a exigir 2FA

---

# 4 · Avaliação 360, clima (check-in), pesquisas estruturadas, recrutamento & seleção e documentos (GED)

> Cinco domínios, um eixo comum: quase toda a segurança destas telas é AUSÊNCIA de payload, não campo escondido no cliente — o serviço monta payloads diferentes por chave, e é isso que os pares de persona precisam provar (gestor × recrutador no valor da oferta; RH × DP no documento sensível; RH × Diretoria na resposta individual de clima).
> O piso de anonimato hoje está certo e é administrável, mas só ele: o parâmetro sistema.parametro_privacidade.minimo_por_recorte é lido a cada chamada por clima, pesquisas e relatórios. A prova mais barata do escopo é o pulse semeado — 3 pessoas por unidade, 2 perguntas de escala, 6 respostas: com o piso contando respostas ele passaria por k=5; contando pessoas, some. Vale rodar os três estados (k=5, k=20, k=2) e olhar clima, pesquisa e Central de Metas nos três.
> Dois achados de tela que não são "não administrável" e por isso ficam aqui: (1) o gestor tem pesquisa.plano.gerir mas a única tela onde o plano de ação existe é /pesquisas/[id]/resultado, que exige pesquisa.resultado.ver — ele é redirecionado para a home e a chave dele não tem porta; (2) o papel dp não tem clima.agregado.ver, então quem opera folha, ponto e admissão não enxerga o painel de clima da rede — decida se é intencional.
> Um padrão a rever em bloco: todas as telas do escopo tratam falta de permissão com redirect("/") silencioso. Quem cai na home não sabe se a tela não existe, se quebrou ou se ele não tem acesso — é exatamente a diferença entre negar e mostrar vazio que o dono pediu para vigiar.
> E o rastro tem um buraco de desenho no GED: só documento marcado como "sensível" grava audit.leitura_sensivel. Baixar o contrato de um terceiro sem esse flag não deixa rastro nenhum, e quem decide marcar é quem envia.

## Check-in diário de clima — /clima

**Entre como:** funcionario@fastdemo.local (e depois gestor@fastdemo.local)

- [ ] Entre em /clima, escolha a carinha 3 (Neutro) na primeira pergunta e clique em enviar sem escrever comentário — deve gravar e a carinha ficar marcada; o comentário é opcional (esquemas.ts: comentario .optional()). `criar`
      → Resposta gravada com nota 3 e comentário nulo; a tela passa a mostrar a resposta do dia.
- [ ] Responda a SEGUNDA pergunta do dia com a carinha 1 (Chorando) e um comentário de uma frase — deve gravar as duas perguntas separadamente, uma linha cada. `criar`
      → As duas perguntas ativas do catálogo aparecem respondidas; o semeador 04-clima responde exatamente as 2 perguntas ativas.
- [ ] ⚠ Volte a /clima depois de responder e tente responder a MESMA pergunta de novo (recarregue a página e clique em outra carinha) — deve recusar. `recusar`
      → Erro 409 "Você já respondeu esta pergunta hoje." (trava checkin_resposta_unica_no_dia).
      *custou:* A trava por PESSOA (0052) foi criada porque transferência entre CNPJs no mesmo dia abria um vínculo novo e deixava a pessoa responder duas vezes.
- [ ] Escreva um comentário só com espaços em branco e envie — deve recusar por comentário vazio, não gravar string em branco. `recusar`
      → "Comentário não pode ser vazio" (trim + min(1)).
- [ ] Cole um comentário de mais de 2000 caracteres e envie — deve recusar antes de gravar. `borda`
      → "Comentário deve ter no máximo 2000 caracteres".
- [ ] Entre com g.dearodrigurs@gmail.com (admin) e digite /clima na barra de endereço — o admin NÃO tem clima.responder. `recusar`
      → Hoje redireciona em silêncio para a home (page.tsx:26 redirect("/")) — a pessoa não sabe se a tela não existe ou se ela não tem acesso. O certo é dizer "sem permissão".
- [ ] Confira o aviso de transparência no topo do check-in com o funcionário: ele promete que só a Diretoria de Pessoas vê a resposta individual e que o gestor vê só médias. `escopo`
      → Texto AVISO_TRANSPARENCIA visível; e ele tem que casar com o que os dois próximos blocos provam na tela.
- [ ] Responda o check-in e peça ao admin (rh.auditar) para abrir a trilha de audit.alteracao da tabela rh_clima.checkin_resposta. `trilha`
      → Aparece Data e Pergunta — e NUNCA a nota nem o comentário; conteúdo fora do diff é proposital (servico.ts:172).
- [ ] Entre com uma conta que existe em sistema.usuario mas não está ligada a colaborador e tente responder. `borda`
      → 403 "Sua conta não está vinculada a um colaborador — procure o RH.", não tela vazia.

## Painel agregado de clima — /clima/painel

**Entre como:** gestor@fastdemo.local, depois rh@fastdemo.local, depois dp@fastdemo.local

- [ ] Abra /clima/painel com o gestor e leia a média geral da janela de 30 dias — o semeador plantou a rede em ~3,9. `numero`
      → Média geral perto de 3,9; respostas e respondentes (COUNT DISTINCT colaborador) coerentes com 8 semanas de dias úteis × 2 perguntas.
- [ ] Procure a Filial Norte na tabela por unidade e confira se ela está marcada em QUEDA — o semeador plantou ~4,0 caindo para ~2,9 nas últimas 3 semanas. `numero`
      → Linha da Filial Norte destacada com variação ≤ −0,3 (QUEDA_RELEVANTE); a Filial Sul deve aparecer em alta.
- [ ] Confira o rodapé do painel: ele deve anunciar quantas PESSOAS um recorte precisa ter para aparecer, lendo o parâmetro vigente e não um número fixo. `numero`
      → "…no mínimo N pessoas" com N = sistema.parametro_privacidade.minimo_por_recorte (5 no padrão).
- [ ] ⚠ Vá a /relatorios com quem tem privacidade.administrar, mude o piso de anonimato de 5 para 20, volte a /clima/painel e recarregue. `administravel`
      → As unidades com menos de 20 respondentes distintos SOMEM da tabela por unidade; o texto do rodapé passa a dizer 20. Se nada mudar, é o defeito da 0045 de volta.
      *custou:* Antes da 0045 havia um MINIMO_RESPONDENTES_UNIDADE = 5 chumbado no clima: com o parâmetro em 20 e em 2 o painel publicava EXATAMENTE os mesmos recortes, e o dono acreditava ter mudado a política da empresa tendo mudado metade dela.
- [ ] Baixe o piso para 2, recarregue o painel e conte as unidades — depois volte para 5 e conte de novo. `administravel`
      → Com 2 aparecem mais unidades que com 5; com 5 volta ao conjunto original. Prova que o piso é lido a cada chamada, sem reiniciar o servidor.
- [ ] Entre com dp@fastdemo.local e digite /clima/painel — o papel dp NÃO tem clima.agregado.ver (0001 dá a chave só a gestor, rh, diretoria; a 0019 acrescentou lider_td). `escopo`
      → Redireciona para a home. Par a conferir: com rh@fastdemo.local a mesma URL abre o painel completo. Decida se isso é intencional — o DP opera folha e ponto e não enxerga o clima da rede.
- [ ] Entre com recrutador@fastdemo.local e digite /clima/painel. `escopo`
      → Redireciona (recrutador tem clima.responder mas não clima.agregado.ver). Par: lider_td@fastdemo.local abre o painel — ele tem agregado.ver.
- [ ] Com o gestor no painel, procure em qualquer lugar da tela o nome de quem respondeu. `escopo`
      → Nenhum nome, em lugar nenhum — só média, contagem e variação. O link para /clima/individual só aparece para quem tem a chave individual.
- [ ] ⚠ Peça ao DP para renomear uma unidade em /estrutura (por exemplo a Filial Norte) e volte ao painel de clima. `borda`
      → A unidade continua sendo UMA linha só, com o nome vigente no fim da janela, e as respostas históricas dela não migram para outra unidade — a consulta usa rh.estrutura_em(colaborador, data_referencia).
      *custou:* Antes a consulta lia a lotação aberta: transferir uma pessoa com 42 respostas movia a queda de julho para quem a recebeu em agosto (origem 3,9355→3,9438; destino 3,4809→3,5343) e as unidades somavam 1667 de 1740 respostas; hoje somam 1738.
- [ ] Peça ao DP para ENCERRAR a versão de um estabelecimento e recarregue o painel. `borda`
      → A unidade encerrada continua na tabela com as respostas dela — encerrar não pode sumir com 235 respostas do histórico.

## Clima individual — /clima/individual (o dado mais sensível do sistema)

**Entre como:** diretora.pessoas@fastdemo.local — e o par negativo com rh@fastdemo.local

- [ ] Entre com diretora.pessoas@fastdemo.local, abra /clima/individual e consulte sem filtro nenhum. `escopo`
      → Lista com nome, matrícula, pergunta, nota e comentário — até 500 linhas, da mais recente para a mais antiga.
- [ ] Entre com rh@fastdemo.local (que vê o painel agregado inteiro) e digite /clima/individual na barra de endereço. `escopo`
      → Recusa — RH não tem clima.resposta.individual.ver. Par completo: com a diretora a mesma URL mostra nome + comentário; com o RH não mostra nada. É a chave mais restrita do sistema (0001) e a única exclusiva da Diretoria de Pessoas.
- [ ] Repita a tentativa com dp@fastdemo.local, gestor@fastdemo.local e lider_td@fastdemo.local. `escopo`
      → Os três são barrados. Nenhum deles tem a chave, nem por herança de clima.agregado.ver.
- [ ] Com a diretora, filtre por UM colaborador específico e consulte; depois peça ao admin (rh.auditar) para abrir audit.leitura_sensivel. `trilha`
      → Uma linha por colaborador retornado, com chave_permissao = clima.resposta.individual.ver, recurso = clima.checkin_resposta.individual e registro_id = id do colaborador. Ler a resposta de 3 pessoas grava 3 linhas.
- [ ] Com a diretora, filtre um período em que NÃO há resposta nenhuma (por exemplo início e fim no mesmo domingo) e consulte. `trilha`
      → Tela sem resultado E uma linha em audit.leitura_sensivel com registro_id nulo — a tentativa de leitura fica registrada mesmo voltando vazia.
- [ ] Preencha o filtro com início 31/12 e fim 01/01 (início depois do fim) e consulte. `recusar`
      → 400 "Início do período deve ser anterior ao fim" apontando o campo início — não uma lista vazia sem explicação.
- [ ] Consulte sem informar datas e verifique o período que a tela assume. `borda`
      → Últimos 30 dias terminando em hoje (America/Sao_Paulo), e o cabeçalho da seção deve exibir o intervalo efetivamente usado.
- [ ] Consulte um período longo (por exemplo 8 semanas inteiras, sem filtrar colaborador) e conte as linhas. `borda`
      → No máximo 500 linhas — o LIMIT é fixo e NÃO há paginação nem aviso de corte na tela: a diretora pode achar que viu tudo tendo visto as 500 mais recentes.

## Pesquisas estruturadas — índice e criação — /pesquisas

**Entre como:** rh@fastdemo.local (administra), com pares em funcionario@ e recrutador@

- [ ] ⚠ Clique em nova pesquisa, escreva o título, deixe o tipo em "Pesquisa anual", preencha início e FIM, escreva uma pergunta de escala 1–5 e salve. `criar`
      → Pesquisa criada em RASCUNHO, com o número de perguntas na lista. Confirme que o campo Fim nasceu VAZIO — ele nascia com hoje+14 e gravava uma janela de 14 dias que ninguém escolheu.
      *custou:* Reproduzido em 2026-07-31 contra o dev server: o formulário intocado postava {"inicio":"2026-07-31","fim":"2026-08-14"} e criou a pesquisa 46 sem ninguém decidir por quanto tempo ela ficaria aberta.
- [ ] Monte uma pesquisa com fim ANTES do início e salve. `recusar`
      → "O fim do período deve ser igual ou posterior ao início", apontando o campo fim.
- [ ] Escolha o tipo "eNPS" e monte só perguntas de escala 1–5, sem nenhuma de nota 0–10, e salve. `recusar`
      → "Pesquisa de eNPS precisa de ao menos uma pergunta de nota 0 a 10".
- [ ] Escolha o tipo de pergunta "Escolha única" e deixe apenas UMA opção preenchida; salve. `recusar`
      → "Escolha única precisa de ao menos 2 opções". Tente também 13 opções: "No máximo 12 opções por pergunta".
- [ ] Marque uma pergunta de escala 1–5 e mesmo assim digite opções de resposta nela; salve. `recusar`
      → "Opções são exclusivas de perguntas de escolha única".
- [ ] Tente salvar uma pesquisa sem NENHUMA pergunta (remova a que nasce no formulário). `recusar`
      → "A pesquisa precisa de ao menos uma pergunta".
- [ ] Crie uma pesquisa em rascunho, remova todas as perguntas dela e clique em ABRIR. `recusar`
      → 409 "A pesquisa precisa de ao menos uma pergunta para ser aberta."
- [ ] Clique em ABRIR numa pesquisa que já está ABERTA (ou em ENCERRAR numa já encerrada). `recusar`
      → 409 "Somente pesquisa em rascunho pode ser aberta." / "Somente pesquisa aberta pode ser encerrada." — o ciclo é de mão única.
- [ ] Abra /pesquisas com o RH e leia a coluna Participação da "Pesquisa de Clima Fast <ano>" (a anual encerrada). `numero`
      → 47 participações (16 Matriz Centro + 8 Norte + 8 Sul + 8 Leste + 7 Oeste) e o percentual = 47 ÷ colaboradores ativos, com uma casa decimal.
- [ ] Leia a Participação do "Pulse da quinzena" (aberto). `numero`
      → 15 participações — 3 por unidade, de propósito ABAIXO do piso de 5 (TETO_PULSE no semeador).
- [ ] Entre com funcionario@fastdemo.local em /pesquisas. `escopo`
      → Aparecem APENAS as pesquisas abertas para ele responder; a lista administrativa e o link "Ver resultado" não existem no payload — ausência, não campo em branco.
- [ ] Entre com recrutador@fastdemo.local em /pesquisas. `escopo`
      → Ele entra (tem pesquisa.responder, dado pela 0023) mas só vê o que responder — recrutamento não tem pesquisa.resultado.ver, por decisão explícita.
- [ ] Entre com g.dearodrigurs@gmail.com (admin) e digite /pesquisas. `escopo`
      → Redirecionado para a home: o admin não tem nenhuma das quatro chaves do módulo.
- [ ] Crie uma pesquisa e peça ao admin para abrir audit.alteracao de rh_clima.pesquisa. `trilha`
      → Diff com Título, Tipo, Período, Anônima e quantidade de Perguntas — e nada de resposta.

## Responder pesquisa — /pesquisas/[id]/responder

**Entre como:** funcionario@fastdemo.local e gestor@fastdemo.local (nenhum dos dois participou do pulse — o semeador garante isso)

- [ ] Abra o Pulse da quinzena com o funcionário, dê nota nas duas perguntas obrigatórias de escala, deixe o texto livre em branco e envie. `criar`
      → 201 com 2 respostas gravadas; a pesquisa some da lista "para responder" e passa a constar como respondida.
- [ ] Repita com o gestor, mas desta vez PREENCHA o texto livre opcional. `criar`
      → 3 respostas gravadas — pergunta opcional em branco simplesmente não gera linha (prepararRespostas).
- [ ] Deixe uma pergunta OBRIGATÓRIA sem responder e clique em enviar. `recusar`
      → 400 com o enunciado da pergunta na mensagem: Responda: "<enunciado>" — e o campo apontado (pergunta_<id>).
- [ ] Envie o formulário com TODAS as perguntas em branco. `recusar`
      → 400 "Nenhuma resposta preenchida." — nunca uma participação gravada em branco.
- [ ] ⚠ Responda a pesquisa e depois volte à mesma URL e tente responder de novo. `recusar`
      → 409 "Você já respondeu esta pesquisa." A participação é gravada ANTES das respostas justamente para abortar antes de sujar a tabela.
      *custou:* A segunda trava (por PESSOA, 0052) existe porque quem foi transferido entre CNPJs abria vínculo novo e conseguia responder duas vezes.
- [ ] Abra a URL de resultado/responder de uma pesquisa ainda em RASCUNHO. `recusar`
      → 409 "Esta pesquisa não está aberta para resposta."
- [ ] Peça ao RH para criar uma pesquisa com período no PASSADO, abra-a, e tente responder. `recusar`
      → 409 "Fora do período de resposta desta pesquisa." — status aberto não basta, a janela de datas também vale.
- [ ] Leia o aviso de anonimato no topo do formulário e compare o número que ele promete com o piso configurado em /relatorios. `escopo`
      → O aviso cita o k VIGENTE ("recortes com N respostas ou mais"). Mude o piso para 20 e recarregue: o aviso tem que passar a dizer 20 — prometer 5 numa empresa que configurou 20 é mentir na tela em que se pede confiança.
- [ ] Confira se o formulário diz ao respondente qual UNIDADE vai acompanhar a resposta dele. `escopo`
      → A unidade aparece — a pessoa tem direito de saber o único atributo que segue junto com a resposta.
- [ ] Depois de responder, peça ao admin para abrir audit.alteracao de rh_clima.participacao_pesquisa. `trilha`
      → Registra apenas QUE participou (o título da pesquisa). Nota, texto e escolha NÃO podem aparecer — seriam canal lateral para quem tem rh.auditar e destruiriam o anonimato prometido.

## Resultado da pesquisa e piso de anonimato — /pesquisas/[id]/resultado

**Entre como:** rh@fastdemo.local (resultado.ver), com pares em gestor@ e lider_td@

- [ ] Abra o resultado da "Pesquisa de Clima Fast <ano>" (anual encerrada) e leia o eNPS da pesquisa inteira. `numero`
      → eNPS entre 12 e 40 pontos (faixa que o semeador garante), com promotores, neutros e detratores somando 47.
- [ ] Leia a tabela por unidade da anual e confira que as CINCO unidades aparecem com média e eNPS. `numero`
      → Matriz Centro (16 pessoas), Norte (8), Sul (8), Leste (8) e Oeste (7) — todas acima do piso de 5. Filial Leste deve ser a pior: único eNPS negativo e pior nota em "feedback do líder".
- [ ] ⚠ Abra o resultado do "Pulse da quinzena" e olhe a tabela por unidade. `numero`
      → TODAS as cinco unidades suprimidas, com o rótulo "Amostra insuficiente" e SEM contagem: cada unidade tem 3 pessoas, abaixo do piso de 5. Este é o caso central do piso — a menor unidade tem que sumir.
      *custou:* Até ontem o piso recebia a SOMA das respostas: 3 pessoas × 2 perguntas de escala = 6 respostas, e 6 ≥ 5 publicava a média de uma unidade de três pessoas. Numa pesquisa de 20 perguntas, k=5 virava UMA pessoa.
- [ ] No mesmo resultado do pulse, olhe agora o resultado POR PERGUNTA (não por unidade). `numero`
      → As perguntas de escala aparecem normalmente — 15 respostas cada, acima do piso. Prova o contrário do caso anterior: recorte grande tem que aparecer; só o recorte pequeno some.
- [ ] Mude o piso de anonimato para 20 em /relatorios e recarregue o resultado da pesquisa ANUAL. `administravel`
      → As cinco unidades somem (a maior tem 16 pessoas), mas o eNPS da pesquisa inteira CONTINUA (47 pessoas ≥ 20). O texto "recortes com N respostas ou mais" na tela passa a dizer 20.
- [ ] Com o piso ainda em 20, abra a Central de Metas e procure o indicador eNPS. `administravel`
      → O indicador some / fica sem dados — a Central não pode ser a porta dos fundos do que a tela de resultado esconde (valorIndicadorEnps devolve null abaixo do piso).
- [ ] Baixe o piso para 2 e recarregue o resultado do pulse. `administravel`
      → As unidades de 3 pessoas voltam a aparecer. Volte para 5 e confirme que somem de novo — três estados, uma fonte só.
- [ ] Numa unidade suprimida, confira se a tela mostra a CONTAGEM de respostas dela. `escopo`
      → Não mostra nem a contagem — ausência total, não máscara. Contagem de recorte pequeno já é insumo de dedução.
- [ ] Abra os comentários de texto livre do resultado da anual e procure nome, cargo, unidade ou salário dentro deles. `escopo`
      → Só o texto, sem nenhuma âncora de identidade; e a lista de comentários só aparece quando a pergunta de texto tem massa suficiente.
- [ ] Entre com lider_td@fastdemo.local e abra o mesmo resultado. `escopo`
      → Abre — lider_td tem pesquisa.resultado.ver (0022). Par: recrutador@fastdemo.local na mesma URL é redirecionado.
- [ ] Entre com gestor@fastdemo.local e digite /pesquisas/<id>/resultado — o gestor TEM pesquisa.plano.gerir e é responsável pelo plano "Ritual de feedback quinzenal na Filial Leste". `escopo`
      → DEFEITO A CONFIRMAR: hoje ele é redirecionado para a home, porque a tela exige pesquisa.resultado.ver e o plano de ação mora SÓ dentro dela. A chave pesquisa.plano.gerir concedida ao gestor não tem nenhuma tela que a alcance.
- [ ] Com o RH, na seção Planos de ação do resultado, crie um plano escolhendo unidade, título, responsável e prazo. `criar`
      → Plano criado e listado. Sem responsável escolhido: "Escolha o responsável"; sem título: "Informe o título do plano".
- [ ] Tente criar um plano de ação numa pesquisa ainda em RASCUNHO. `recusar`
      → 409 "Plano de ação nasce de resultado — abra a pesquisa primeiro."
- [ ] Mude o status do plano "Ritual de feedback quinzenal na Filial Leste" de Em andamento para Concluído. `editar`
      → Status atualizado; repetir a mesma mudança não gera nova linha de auditoria (o serviço devolve o plano intacto quando o status não muda).
- [ ] Conte os planos de ação da pesquisa anual. `numero`
      → 2 — um da Filial Leste (em andamento, responsável = o gerente da unidade) e um da EMPRESA inteira, sem unidade (plano odontológico, concluído).
- [ ] Crie um plano e depois mude o status; peça ao admin para abrir audit.alteracao de rh_clima.plano_acao. `trilha`
      → Duas linhas: criação (Pesquisa, Título, Prazo, Unidade) e atualização (Status de → para, com os rótulos em português).
- [ ] Abra o resultado de uma pesquisa recém-aberta que ninguém respondeu. `borda`
      → Adesão 0, todos os recortes com "Amostra insuficiente" e o eNPS ausente (nenhuma pergunta de nota respondida vale 0 pessoas, não infinito).

## Avaliação 360 — painel e abertura de ciclos — /avaliacoes

**Entre como:** dp@fastdemo.local (configurar/decidir/resultado), com pares em gestor@, rh@ e lider_td@

- [ ] Abra /avaliacoes com o DP e conte os ciclos por status. `numero`
      → 25 ciclos de desempenho consolidados/decididos + 3 retardatários (2 rascunhos parciais e 1 sequer aberto); 15 com decisão registrada e 10 aguardando decisão.
- [ ] Confira a curva de resultados do lote de desempenho. `numero`
      → 2 em "Plano de recuperação", 4 em "Atenção", 12 em "Desenvolver" e 7 em "Sucessão" — 25 no total.
- [ ] Clique em "Abrir ciclo de desempenho (lote)", escolha um prazo FUTURO e confirme. `criar`
      → Abre um ciclo para cada colaborador ativo COM gestor vigente e devolve a lista de quem ficou de fora por não ter gestor — a lista de fora é a informação, não o silêncio.
- [ ] Abra o lote com prazo de ONTEM. `recusar`
      → 400 "O prazo não pode estar no passado." apontando o campo prazo.
- [ ] Peça ao RH para encerrar a versão ativa do modelo (ou teste num ambiente sem modelo ativo) e tente abrir o lote. `recusar`
      → 409 "Não há versão ativa do modelo de avaliação. Ative um modelo antes de abrir ciclos." — e o painel avisa que nada será gerado automaticamente.
- [ ] Admita alguém com contrato de experiência (por Colaboradores ou pelo botão "Iniciar admissão" do recrutamento), espere passar o marco de 45 dias e ABRA o painel de avaliações com o DP. `cadeia`
      → O painel gera o ciclo de experiência 45 na hora (geração lazy), com o modelo ATIVO congelado, e o contador "ciclos gerados agora" acusa. Confira o elo inteiro: admissão → rh.processo_admissao com prazo_experiencia_1 (admissão+44) → ciclo aberto → notificação no sino do gestor avaliador → ciclo em /avaliacoes/[id].
- [ ] Depois da geração lazy, peça ao admin para ver audit.alteracao de rh.ciclo_avaliacao. `trilha`
      → Uma linha por ciclo com Colaborador, Tipo, Avaliador, Prazo, Modelo (v<n> congelado) e Origem = "Geração automática (marcos 45/90 do contrato de experiência)".
- [ ] Abra /avaliacoes com o gestor e com o DP e compare o que aparece. `escopo`
      → Gestor (só avaliacao.responder): apenas os ciclos em que ELE é avaliador, sem a lista geral e sem as pendências sem gestor. DP: a lista completa mais as pendências. Payload minimizado, não campo escondido no cliente.
- [ ] Abra /avaliacoes com lider_td@fastdemo.local. `escopo`
      → Entra (avaliacao.configurar + resultado.ver): vê a lista geral e as pendências, mas NÃO tem ciclos próprios para responder nem botão de decidir.
- [ ] Abra /avaliacoes com rh@fastdemo.local e procure o botão de registrar decisão. `escopo`
      → Não existe — rh tem avaliacao.configurar, mas decidir e resultado.ver são de dp e diretoria. Par: com dp@ o botão aparece.
- [ ] Abra /avaliacoes com recrutador@fastdemo.local ou funcionario@fastdemo.local. `escopo`
      → Redirecionados para a home — nenhuma das quatro chaves do módulo.
- [ ] Procure no painel um ciclo com prazo vencido e um com prazo faltando menos de 10 dias. `borda`
      → O vencido em vermelho com "prazo vencido"; o próximo em amarelo. O corte de 10 dias é fixo no código e não se muda pela tela.

## Ciclo de avaliação — responder, enviar, decidir — /avaliacoes/[id]

**Entre como:** gestor@fastdemo.local (avaliador), depois dp@fastdemo.local (decisor)

- [ ] Com o gestor, abra um ciclo aberto dele, dê nota em ALGUNS indicadores e salve o rascunho. `criar`
      → Rascunho gravado; o ciclo passa de "Aberta" para "Em avaliação". Rascunho aceita subconjunto — só o envio exige tudo.
- [ ] Marque um indicador com nota 4 E com "não observado" ao mesmo tempo (ou deixe os dois vazios) e salve. `recusar`
      → Recusa: "Cada resposta é nota 1–5 OU não observado" — o XOR também é CHECK no banco.
- [ ] ⚠ Preencha só metade dos indicadores e clique em ENVIAR. `recusar`
      → 409 nomeando o indicador que falta: "Indicador '<nome>' sem resposta: consolidação bloqueada — item sem resposta jamais vira zero." O ciclo continua em rascunho.
      *custou:* Erro central do mockup btime: média aritmética que ignorava peso e tratava item não respondido como nota zero.
- [ ] Marque TODOS os indicadores como "não observado" e envie. `recusar`
      → 409 "Todos os indicadores foram marcados como não observados: não há o que consolidar."
- [ ] Marque como "não observado" um indicador de peso alto dentro de um pilar, responda o resto, envie e abra a memória de cálculo. `numero`
      → O indicador não observado sai do DENOMINADOR e os pesos dos demais do pilar são renormalizados (peso_normalizado somando 100 dentro do pilar) — nunca entra como zero. Se um pilar inteiro ficar não observado, ele é excluído e os pesos dos pilares restantes se renormalizam.
- [ ] Responda um ciclo dando nota 5 em TODOS os 15 indicadores e envie. `numero`
      → Percentual 100,00 e a ÚLTIMA faixa aplicada — a faixa é [mínimo, máximo) mas a última fecha em 100 inclusive. Prove também o oposto: nota 1 em tudo → 20,00%.
- [ ] Depois de enviar, tente editar as respostas do mesmo ciclo. `recusar`
      → 409 "Avaliação já enviada é imutável — fale com o RH se precisar corrigir." e o botão de responder some da tela.
- [ ] Com o gestor, copie o id de um ciclo de OUTRO gestor e abra /avaliacoes/<esse id>. `escopo`
      → 404 "Avaliação não encontrada." — ausência, não máscara: quem não participa não pode nem descobrir que o ciclo existe.
- [ ] Abra o MESMO ciclo consolidado com o gestor avaliador e com o DP, lado a lado. `escopo`
      → Gestor: vê as próprias respostas e a estrutura do modelo, mas NÃO vê percentual, faixa nem recomendação. DP (resultado.ver): vê percentual, faixa, recomendação e memória de cálculo. Payload minimizado por chave.
- [ ] Abra um ciclo qualquer com rh@fastdemo.local (configurar, sem resultado.ver). `escopo`
      → Vê a estrutura do modelo congelado e o bloco "Situação" explicando o estado, mas nenhuma nota nem resultado — e a tela NUNCA fica em branco: o campo "o que posso fazer" diz explicitamente o que ele pode ou não fazer ali.
- [ ] Abra um ciclo consolidado com o DP e peça ao admin para conferir audit.leitura_sensivel. `trilha`
      → Duas linhas com chave avaliacao.resultado.ver: recurso rh.resposta_item (notas brutas de terceiro) e recurso rh.resultado_avaliacao. O avaliador lendo o próprio ciclo NÃO gera a linha de resposta_item.
- [ ] Com o DP, num ciclo consolidado cuja faixa recomenda "Atenção e acompanhamento", registre a decisão "Manter na função" SEM justificativa. `criar`
      → Aceita — manter está na lista alinhada de "atenção".
- [ ] ⚠ Com o DP, num ciclo cuja faixa recomenda "Alto desempenho — sucessão", registre "Encaminhar desligamento" sem justificativa. `recusar`
      → 400 nomeando as duas coisas: a decisão escolhida diverge da recomendação da faixa e justificativa é OBRIGATÓRIA.
      *custou:* Erro 5 da auditoria btime: botões de decisão sem captura de justificativa nem marca de divergência.
- [ ] Repita a decisão divergente escrevendo a justificativa e confirme. `criar`
      → Grava com divergente = Sim; a trilha registra Recomendação da faixa, Decisão, Divergente e a Justificativa inteira.
- [ ] Tente registrar decisão num ciclo ainda ABERTO (sem envio). `recusar`
      → 409 "A decisão só pode ser registrada após o envio e a consolidação da avaliação."
- [ ] Registre a decisão e tente registrar outra no mesmo ciclo. `recusar`
      → 409 "Este ciclo já tem decisão registrada — decisão é imutável."
- [ ] Registre a decisão de um ciclo e depois abra a FICHA do colaborador avaliado, na linha do tempo. `cadeia`
      → Evento "avaliacao_concluida" com o tipo do ciclo, a faixa e a decisão — e SEM nota bruta e SEM percentual. Confira também que a decisão "Encaminhar desligamento" NÃO abriu processo de desligamento nenhum: é encaminhamento, o processo é aberto pelo DP no módulo próprio.
- [ ] Com o RH (avaliacao.configurar), cancele um ciclo ainda aberto informando o motivo. `editar`
      → Ciclo vai para Cancelado e o motivo entra na trilha. Sem motivo: "Informe o motivo do cancelamento".
- [ ] Tente cancelar um ciclo já CONSOLIDADO ou DECIDIDO. `recusar`
      → 409 "Só ciclos ainda não consolidados podem ser cancelados — ciclo fechado não reabre."

## Modelo de avaliação — pilares, indicadores, pesos e faixas — /avaliacoes/modelos

**Entre como:** rh@fastdemo.local ou lider_td@fastdemo.local (avaliacao.configurar)

- [ ] Crie uma versão nova do modelo: acrescente um pilar, dê nome e peso, acrescente indicadores com nome, régua (descrição) e peso, e monte as faixas com rótulo e recomendação. Salve. `administravel`
      → Nasce em RASCUNHO. Pilares, indicadores, pesos, rótulos de faixa e faixas são TODOS editáveis pela tela — este é o pedaço bem administrável do escopo. Renomear e excluir também funcionam.
- [ ] Deixe os pesos dos pilares somando 90 e clique em ATIVAR. `recusar`
      → 400 "A soma dos pesos dos pilares deve ser 100 (está em 90)." A tela também deve mostrar a soma ao vivo enquanto você digita.
- [ ] Deixe os indicadores de UM pilar somando 110 e ative. `recusar`
      → 400 nomeando o pilar: "Os indicadores do pilar '<nome>' devem somar 100 (estão em 110)."
- [ ] Monte faixas 0–40 e 50–100 (buraco entre 40 e 50) e ative. `recusar`
      → 400 "Faixas com furo ou sobreposição entre 40 e 50." Teste também sobreposição (0–60 e 50–100) e faixa que não começa em 0 ou não termina em 100.
- [ ] Crie uma faixa com mínimo 60 e máximo 40 e salve o rascunho. `recusar`
      → "Toda faixa exige mínimo menor que máximo".
- [ ] Crie um pilar sem nenhum indicador e salve. `recusar`
      → "Todo pilar precisa de ao menos um indicador". Repita com dois pilares de mesmo nome: "Pilar repetido no modelo"; e dois indicadores iguais no mesmo pilar: "Indicador repetido dentro do pilar".
- [ ] Deixe a régua (descrição) de um indicador em branco e salve. `recusar`
      → "Descrição (régua) do indicador é obrigatória" — a régua é o que impede o avaliador de inventar o critério.
- [ ] Com um rascunho já existente, tente criar OUTRA versão em rascunho. `recusar`
      → 409 "Já existe uma versão em rascunho — edite ou ative a existente antes de criar outra."
- [ ] Tente editar a versão ATIVA do modelo. `recusar`
      → 409 "Versão ativada é imutável — mudança de pilar, peso ou faixa é uma NOVA versão."
- [ ] Ative uma versão NOVA do modelo (com pesos diferentes) e depois reabra um ciclo já CONSOLIDADO com a versão anterior. `cadeia`
      → O ciclo antigo continua mostrando v<anterior>, com o mesmo percentual e a mesma faixa — modelo novo não reescreve ciclo fechado. A trilha da ativação diz "Encerrada (id X) — ciclos abertos com ela NÃO são recalculados". Agora abra um ciclo NOVO e confirme que ele nasce com a versão nova congelada.
- [ ] Ative a versão e peça ao admin para ver audit.alteracao de rh.modelo_avaliacao_versao. `trilha`
      → Linha de transição com "v<n> (rascunho) → v<n> (ativa)" e a menção à versão anterior encerrada.
- [ ] Abra /avaliacoes/modelos com dp@fastdemo.local e com diretora.pessoas@fastdemo.local. `escopo`
      → DP entra (tem configurar). A diretora NÃO tem avaliacao.configurar — confirme se ela é barrada e se isso é o desejado, já que ela decide os ciclos.

## Recrutamento — requisição e abertura de vaga — /recrutamento

**Entre como:** gestor@fastdemo.local (solicita), dp@fastdemo.local (decide), recrutador@fastdemo.local (gere)

- [ ] Abra /recrutamento com o recrutador e conte requisições e vagas. `numero`
      → 5 requisições — 3 aprovadas, 1 solicitada na fila e 1 reprovada com motivo — e 3 vagas: Vendedor(a) na Filial Norte (fechada/preenchida), Estoquista na Matriz (aberta, prazo-alvo ESTOURADO) e Analista Financeiro na Matriz (aberta, no prazo).
- [ ] Com o gestor, crie uma requisição de vaga: escolha o cargo, a unidade, o motivo (Reposição ou Aumento de quadro) e escreva a justificativa. Salve. `criar`
      → Requisição criada com status Solicitada. Confirme que o seletor de cargo nasce em "Escolha o cargo…" — nenhum cargo pré-selecionado.
- [ ] Deixe a justificativa em branco e salve a requisição. `recusar`
      → "A justificativa é obrigatória" — o motivo por escrito é o que o aprovador lê.
- [ ] Escolha, no formulário de requisição, um cargo SEM faixa salarial vigente. `criar`
      → A tela avisa na hora: "Este cargo não tem faixa salarial vigente — sem faixa, a vaga não…". Prossiga mesmo assim: a requisição é criada, mas a criação da VAGA depois recusa com 409 "O cargo <nome> não tem faixa salarial vigente — cadastre a faixa antes de abrir a vaga."
- [ ] Com o DP, aprove a requisição solicitada escrevendo o motivo da decisão; depois reprove outra, também com motivo. `criar`
      → Status muda para Aprovada / Reprovada com o decisor e a data. Sem motivo: "O motivo da decisão é obrigatório".
- [ ] Tente decidir de novo uma requisição já aprovada. `recusar`
      → 409 "Requisição já aprovada — decisão é única."
- [ ] Com o recrutador, tente abrir vaga a partir de uma requisição ainda SOLICITADA. `recusar`
      → 409 "Só requisição aprovada abre vaga."
- [ ] Abra a vaga de uma requisição aprovada informando título e prazo-alvo. `criar`
      → Vaga aberta com a faixa salarial do cargo CONGELADA no momento da abertura. Confirme que o campo prazo-alvo nasce vazio (não pré-datado).
- [ ] Peça ao DP para mudar a tabela salarial do cargo DEPOIS de a vaga estar aberta e volte ao kanban da vaga. `cadeia`
      → A banda da vaga NÃO muda — é snapshot congelado. A vaga seguinte, criada depois, já nasce com a faixa nova.
- [ ] Tente abrir uma segunda vaga a partir da MESMA requisição. `recusar`
      → 409 "Esta requisição já tem vaga criada." apontando requisicao_id.
- [ ] Compare o painel do gestor com o do recrutador: entre com gestor@fastdemo.local (só rs.requisicao.criar) e depois com recrutador@fastdemo.local. `escopo`
      → Gestor: vê APENAS as requisições e vagas que nasceram dele, sem a lista de candidatos e sem o indicador de vagas no prazo. Recrutador: vê tudo, mais a base de 18 candidatos e o indicador. Filtro no servidor, dentro da consulta.
- [ ] Entre com lider_td@fastdemo.local e digite /recrutamento. `escopo`
      → Redirecionado — lider_td não tem nenhuma chave de R&S, por decisão registrada na 0019 (parecer de seleção é do processo seletivo).
- [ ] Entre com diretora.pessoas@fastdemo.local em /recrutamento. `escopo`
      → Entra (rs.ver + rs.requisicao.decidir): vê requisições, vagas e pipeline, e pode decidir requisição — mas não gere candidatos nem emite oferta (não tem rs.gerir).
- [ ] Leia o indicador "vagas fechadas no prazo" no painel do recrutador. `numero`
      → Percentual das vagas fechadas nos últimos 12 meses cujo fechamento ficou dentro do prazo-alvo; com a Estoquista ainda aberta e vencida, ela não entra na conta. A janela de 12 meses é fixa no código.
- [ ] Crie uma requisição e peça ao admin para ver audit.alteracao de rh.requisicao_vaga. `trilha`
      → Diff com Cargo, Motivo, Justificativa (truncada em 500), Status e — quando informada — Unidade.

## Kanban da vaga — candidatos, pareceres, oferta, admissão — /recrutamento (vaga aberta)

**Entre como:** recrutador@fastdemo.local, com pares em gestor@ e dp@

- [ ] Abra o kanban de uma vaga e conte os cartões por coluna na base semeada. `numero`
      → 21 candidaturas: 6 em Triagem, 5 em Entrevista com o RH, 3 em Entrevista com o gestor, 2 em Oferta, 4 encerradas com motivo do catálogo e 1 aprovada. E 4 colunas: Triagem, Entrevista com o RH, Entrevista com o gestor, Oferta.
- [ ] Cadastre um candidato novo: nome, e-mail, telefone, CPF, origem e a caixa de consentimento LGPD. Salve. `criar`
      → Candidato criado com "consentido até" = hoje + 6 meses quando a data não é informada.
- [ ] Cadastre um candidato SEM marcar o consentimento LGPD. `recusar`
      → "O cadastro manual exige o consentimento LGPD registrado do candidato" — a caixa não pode nascer marcada.
- [ ] Cadastre um candidato com um CPF inválido (por exemplo 111.111.111-11) e depois com um e-mail que já existe na base de 18 candidatos. `recusar`
      → "CPF inválido" no primeiro; 409 "Já existe candidato com este e-mail — a candidatura nova anexa ao mesmo cadastro." no segundo (e a mesma mensagem por CPF repetido).
- [ ] Adicione um candidato existente à vaga aberta. `criar`
      → Candidatura criada na PRIMEIRA etapa ativa (Triagem), com uma movimentação de entrada registrada.
- [ ] Tente adicionar o MESMO candidato duas vezes à mesma vaga. `recusar`
      → 409 "Este candidato já tem candidatura nesta vaga."
- [ ] Tente adicionar candidatura a uma vaga FECHADA (a Vendedor(a) da Filial Norte). `recusar`
      → 409 "Vaga fechada não recebe candidatura."
- [ ] Avance um candidato de Triagem até a última etapa, clicando avançar em cada coluna; depois tente avançar mais uma vez. `editar`
      → Cada avanço grava movimentação com de/para etapa. No fim: 409 "Candidato já está na última etapa — registre a oferta."
- [ ] Reprove um candidato SEM escolher motivo do catálogo. `recusar`
      → 400 "Reprovação exige motivo do catálogo." — o zod exige e o banco confere de novo, por causa da Lei 9.029 (nunca texto livre como motivo de desfecho negativo).
- [ ] Reprove um candidato e depois tente movimentá-lo de novo. `recusar`
      → 409 "Candidatura reprovada não movimenta — o histórico é definitivo."
- [ ] Com o gestor (rs.parecer.registrar), registre um parecer num candidato da vaga que nasceu da requisição DELE: escolha Aprovar/Reprovar/Em dúvida e escreva as observações. `criar`
      → Parecer gravado, ligado à etapa em que o candidato está.
- [ ] Com o gestor, abra a lista de pareceres do mesmo candidato depois de o RH também ter dado parecer. `escopo`
      → O gestor vê SÓ o parecer dele — sem rs.parecer.ver, os pareceres alheios estão AUSENTES do payload. Par: com dp@ ou recrutador@ aparecem os dois.
- [ ] Com o recrutador, abra os pareceres de uma candidatura e peça ao admin para conferir audit.leitura_sensivel. `trilha`
      → Linha com chave rs.parecer.ver e recurso recrutamento.parecer_selecao. Ler o próprio parecer (gestor) NÃO gera trilha.
- [ ] Tente registrar parecer numa candidatura já reprovada. `recusar`
      → 409 "Candidatura encerrada não recebe parecer."
- [ ] Tente registrar a oferta de um candidato que ainda está em Triagem. `recusar`
      → 409 "Avance o candidato até a etapa de oferta antes de registrar a proposta."
- [ ] Na etapa de oferta, informe um valor ACIMA do teto da banda congelada e confirme sem preencher a aprovação. `recusar`
      → 400 dizendo a banda em reais e exigindo aprovação registrada — a trava do fora-da-banda. Repita com o texto de aprovação preenchido: aceita e grava "Dentro da banda: Não" mais o texto da aprovação na trilha.
- [ ] Registre a oferta e tente registrar outra para a mesma candidatura. `recusar`
      → 409 "Esta candidatura já tem oferta registrada."
- [ ] PROVA DO SALÁRIO — abra o MESMO kanban com o gestor (sem rs.ver/rs.gerir) e com o recrutador, lado a lado, num candidato que já tem oferta. `escopo`
      → Gestor: vê a BANDA congelada da vaga (faixa do cargo), mas oferta_valor, e-mail e telefone do candidato vêm NULOS — ausência, não máscara. Recrutador: vê o valor da oferta e o contato. É faixa DO CARGO para o gestor e valor DE PESSOA só para quem gere a seleção (resíduo registrado na 0019).
- [ ] Com o gestor, pegue o id de uma vaga que NÃO nasceu de requisição dele e abra a URL do kanban dela. `escopo`
      → 404 "Vaga não encontrada." — fora do escopo é ausência, não lista vazia.
- [ ] Com o recrutador, abra o kanban de uma vaga que tem oferta e peça ao admin para ver audit.leitura_sensivel. `trilha`
      → Linha com recurso recrutamento.oferta_valor e a chave que de fato autorizou (rs.gerir ou rs.ver).
- [ ] Registre a resposta ACEITA de uma oferta e observe o kanban e a lista de vagas. `cadeia`
      → Na MESMA transação: candidatura vira Aprovada, movimentação registrada e a VAGA fecha com "Preenchida (oferta aceita)". Confira nas duas telas.
- [ ] Registre a RECUSA de uma oferta sem escolher motivo do catálogo. `recusar`
      → 400 "Recusa exige motivo do catálogo." Com motivo: candidatura vira "Desistiu" e a vaga CONTINUA aberta.
- [ ] Responda a mesma oferta duas vezes. `recusar`
      → 409 "Oferta já aceita — resposta é única."
- [ ] CADEIA COMPLETA — com a oferta aceita, clique em "Iniciar admissão": informe matrícula, CPF, tipo de vínculo, data de início prevista e marque contrato de experiência. Confirme. `cadeia`
      → Numa transação só: pessoa + conta de usuário (senha temporária exibida UMA vez) + colaborador + evento de admissão na linha do tempo + processo de admissão com o checklist vigente congelado e os prazos 45/90. Depois confira os elos em outras telas: /colaboradores (o novo colaborador), /admissoes (o processo com os itens do checklist), o login com a senha temporária, e — passados os 45 dias — o ciclo de experiência em /avaliacoes.
- [ ] Tente iniciar admissão de uma candidatura cuja oferta ainda está ENVIADA (sem resposta). `recusar`
      → 409 "Só candidatura aprovada com oferta aceita inicia admissão."
- [ ] Inicie a admissão informando o CPF de alguém que JÁ é (ou já foi) gente do grupo. `recusar`
      → 409 explicando o caminho certo: readmissão se faz em Colaboradores → Novo colaborador, onde o CPF é reconhecido e o segundo vínculo nasce ligado ao cadastro e ao login que a pessoa já tem.
- [ ] Inicie a admissão com uma matrícula que já existe, e depois com matrícula contendo letras. `recusar`
      → 409 "Já existe colaborador com esta matrícula." e "Matrícula deve conter apenas números".
- [ ] Inicie a admissão num ambiente sem versão ativa do checklist de admissão. `recusar`
      → 409 "Não há versão ativa do checklist de admissão. Ative uma versão antes de iniciar admissões." — e nada é criado (a transação inteira volta atrás: sem colaborador órfão, sem usuário órfão).
- [ ] Abra o kanban de uma vaga sem nenhuma candidatura. `borda`
      → As 4 colunas aparecem vazias com a banda e o prazo-alvo no cabeçalho — não uma página em branco.

## Documentos (GED) — /documentos

**Entre como:** dp@fastdemo.local (envia e vê sensível), rh@fastdemo.local, funcionario@fastdemo.local, recrutador@fastdemo.local

- [ ] Com o DP, envie um documento GERAL (deixe o seletor de colaborador em "Geral (todos)"): escolha o arquivo, escreva o título, escolha a categoria e envie. `criar`
      → Documento aparece no acervo com o SHA-256 calculado no servidor, o tamanho formatado e "Geral" na coluna Colaborador.
- [ ] Envie um documento ligado a UM colaborador e marque a caixa "Sensível". `criar`
      → Aviso na tela: "Documento sensível enviado. Ele só aparece na lista de quem tem permissão para dados sensíveis, com o filtro ativado."
- [ ] Envie um arquivo VAZIO (0 byte) e depois um arquivo maior que 10 MB. `recusar`
      → 400 "O arquivo está vazio." e 413 "Arquivo excede o limite de 10 MB." — o limite é fixo no código e no CHECK do banco.
- [ ] Envie com título de 2 caracteres. `recusar`
      → "Informe o título do documento" (mínimo 3).
- [ ] Envie um arquivo com nome muito longo e acentuado (por exemplo 300 caracteres com ç e til) e depois baixe-o. `borda`
      → O nome é cortado em 255 caracteres na gravação e o download devolve o nome real por RFC 5987 (filename*), com um fallback ASCII para clientes antigos.
- [ ] Entre com funcionario@fastdemo.local em /documentos. `escopo`
      → Vê SÓ os documentos gerais e os do próprio vínculo — e nenhum formulário de envio (não tem documento.enviar). Não há caixa de "incluir sensíveis".
- [ ] Com o funcionário, copie o id de um documento de OUTRA pessoa e abra /api/documentos/<id>/download direto na barra de endereço. `escopo`
      → 404 "Documento não encontrado." — ausência, não "acesso negado", para que ele nem saiba que o documento existe.
- [ ] PAR DECISIVO — entre com rh@fastdemo.local e depois com dp@fastdemo.local no acervo. `escopo`
      → RH: NÃO tem a caixa "Incluir documentos sensíveis" (rh não recebeu documento.sensivel.ver na 0006) e os documentos sensíveis nunca chegam ao payload dele. DP: a caixa aparece e, marcada, traz os sensíveis. Os dois têm documento.ver.todos — o alcance é o mesmo, a sensibilidade não.
- [ ] ⚠ Entre com recrutador@fastdemo.local (que pode ENVIAR) e procure no acervo o contrato de um colaborador qualquer. `escopo`
      → Não aparece — ele tem documento.enviar mas NÃO documento.ver.todos. Prova a separação da 0024.
      *custou:* Antes da 0024, documento.enviar dava de carona o direito de LER contrato, termo e aviso de qualquer pessoa do quadro — exatamente o histórico de DP que a segregação de perfis (0019) foi criada para barrar.
- [ ] Entre com lider_td@fastdemo.local e faça a mesma busca. `escopo`
      → Mesmo resultado que o recrutador: envia, mas só lê os gerais e os próprios.
- [ ] Peça ao DP para TRANSFERIR um colaborador entre empresas do grupo e depois entre com esse colaborador em /documentos. `cadeia`
      → Os documentos do vínculo ANTERIOR continuam visíveis para ele — a consulta é pela PESSOA (rh.pessoa_do_usuario), não pelo contrato corrente. O contrato acabou; o documento continua sendo da pessoa.
- [ ] Com o funcionário, clique em "Dar ciência" num comunicado geral e confirme o diálogo. `criar`
      → Grava data, hora e o hash do arquivo NAQUELE momento; o botão vira "Ciência em <data/hora>" e não pode ser desfeito (a tabela é append-only por trigger).
- [ ] Recarregue a página e tente dar ciência no mesmo documento de novo (ou dispare o POST duas vezes). `recusar`
      → 409 "Ciência já registrada para este documento."
- [ ] PROVA DO RASTRO — com o DP, marque "Incluir documentos sensíveis" no acervo e peça ao admin para abrir audit.leitura_sensivel. `trilha`
      → Uma linha POR documento sensível listado, com chave documento.sensivel.ver e recurso rh.documento. Depois baixe um documento sensível: mais uma linha.
- [ ] Com o DP, baixe um documento NÃO sensível de terceiro (por exemplo o contrato de alguém, sem a marca de sensível) e confira a trilha. `trilha`
      → ACHADO A CONFIRMAR: nenhuma linha em audit.leitura_sensivel. Só o flag "sensível" gera rastro de leitura — baixar o contrato de um terceiro sem esse flag não deixa rastro nenhum, e quem envia é quem decide marcar.
- [ ] Envie um documento e peça ao admin para conferir audit.alteracao de rh.documento. `trilha`
      → Diff com Título, Categoria, Arquivo, Tamanho, Colaborador (ou "Geral (todos)"), Sensível e o SHA-256 — o hash é prova de qual versão foi enviada.
- [ ] Procure na tela de documentos qualquer lugar onde se acrescente, renomeie ou exclua uma CATEGORIA (hoje: Contrato, Holerite, Política, Comunicado, Atestado, Outro). `administravel`
      → FALHA ESPERADA: não existe. A lista é enum fixa no código; a empresa não consegue criar "Advertência", "Termo de EPI" ou "ASO" sem alterar o código.
- [ ] Entre com uma conta sem nenhum documento próprio e sem documento geral cadastrado. `borda`
      → "Nenhum documento disponível." — e confira que essa mensagem NÃO está sendo usada onde o certo seria negar acesso.

---

# 5 · SST (ASO, NR-1, EPI, CAT) e Benefícios (catálogo, elegibilidade, adesão, dependentes) — telas /sst e /beneficios

> O domínio está sólido onde foi corrigido e frágil onde nunca foi tocado. As três correções recentes (trilha da CAT amarrada ao dado devolvido, vigência futura da regra recusada nas duas pontas, adesão de vínculo desligado deixando de ser chamada de vigente) têm caso de teste direto e cada uma tem uma prova que só falha se alguém regredir o código.
> O buraco mais provável hoje não é de guarda, é de DADO: o semeador db/semear/16-transferencia-empresa.js declara ser réplica de aplicarTransferenciaEntreEmpresas mas não toca em rh.adesao, e roda DEPOIS da migration 0051 que reparou a base. Se a conferente transferida abrir "Meus benefícios" e vier vazio, o app está certo e a demo está mostrando o defeito que o app já não comete.
> O padrão que mais se repete nas duas telas é o mesmo do resto do projeto: a tela protege antes do servidor, e por isso metade das guardas do serviço é INALCANÇÁVEL pela tela (ASO apto com restrição, ASO de outro colaborador na NR-1, afastamento sem a caixa marcada, quantidade fora de 1–999). Isso é bom para o usuário e ruim para o teste: quem só clica não descobre se o servidor recua. Onde a tela NÃO protege, aparece um defeito de verdade — entrega de EPI aceita data futura, e o termo do GED continua selecionado depois de trocar o colaborador.
> Dado de saúde: ASO e NR-1 estão bem (ausência do payload, cifra, trilha por leitura). A CAT é a exceção que sobrou: a descrição de até 4.000 caracteres é o pior payload clínico do módulo, não é cifrada e não é gated por sst.saude.ver — quem tem sst.ver lê tudo. A trilha existe, mas trilha não é permissão.
> Administrabilidade é onde a frente mais falha: catálogo de EPI só aceita INSERT (nem renomear, nem desativar), parentesco em 3 opções contra as 11 da Receita, elegibilidade limitada a vínculo e unidade, e as faixas de 30/60 dias do painel de vencimento chumbadas — o mesmo formato de defeito que já foi corrigido em férias e em ponto e que aqui ainda está de pé.
> Duas perguntas de escopo que só o dono decide: (a) diretoria não tem sst.ver, então a diretora de Pessoas é redirecionada em /sst; (b) beneficio.ver abre valor e desconto de benefício da empresa inteira para o rh, sem adesao.gerir.

## /sst — aba ASOs: registrar exame, painel de vencimento e conteúdo clínico

**Entre como:** dp@fastdemo.local (única com sst.gerir + sst.saude.ver)

- [ ] Abra /sst, aba ASOs, seção "Registrar ASO": escolha um colaborador, tipo Periódico, data do exame = hoje, resultado Apto, e salve `criar`
      → Aceita e volta o aviso "ASO registrado. Resultado e restrições são dado de saúde...". A lista "ASOs registrados" ganha uma linha no topo (ordem é data do exame DESC)
- [ ] ⚠ Registre um ASO SEM preencher o campo Resultado (deixe em "Escolha o resultado…") `criar`
      → O navegador barra antes de enviar (o select é required). O campo NASCE VAZIO de propósito — nenhum resultado vem escolhido
      *custou:* O formulário já nasceu com "apto" pré-selecionado; "apto" é conclusão de médico do trabalho, não estado neutro (src/app/sst/painel-sst.tsx:326)
- [ ] Registre um ASO com data do exame 10/03 e validade 10/03 (mesma data) e salve `recusar`
      → Recusa com "A validade precisa ser posterior ao exame" — o CHECK do banco (validade > data_exame) e o zod dizem a mesma coisa
- [ ] Registre um ASO com validade ANTERIOR à data do exame e salve `recusar`
      → Mesma recusa: "A validade precisa ser posterior ao exame"
- [ ] Registre um ASO deixando a Validade em branco (é o caso do demissional) e salve `borda`
      → Aceita. Na lista a coluna Validade mostra "—" e o colaborador entra em "sem ASO com validade registrada" no rodapé do painel
- [ ] Escolha resultado "Apto com restrições", escreva uma restrição clínica no campo de texto e salve `criar`
      → Aceita. Na lista aparece a etiqueta "Sensível" seguida do texto decifrado — só porque a sua sessão tem sst.saude.ver
- [ ] Escreva um texto no campo Restrições e só DEPOIS mude o Resultado para "Apto" `recusar`
      → O campo Restrições é apagado e desabilitado na hora, e o POST vai sem restrições. A guarda do servidor ("ASO plenamente apto não carrega restrições") não chega a ser exercida pela tela — se ela nunca disparar, é porque a tela protege, não porque o servidor não protege
- [ ] Cole 2.100 caracteres no campo Restrições `borda`
      → O textarea corta em 2.000 (maxLength). A mensagem "Restrições longas demais (máx. 2000 caracteres)" só é alcançável fora da tela
- [ ] Leia o rodapé do "Painel de vencimento" da aba ASOs `numero`
      → Com a base recém-semeada: 6 vencidos, 8 em "Vence em 30 dias", 6 em "Vence em 31–60 dias", 26 em dia, e o total monitorado = todos os colaboradores NÃO desligados (afastado continua monitorado)
- [ ] Confira o nome que aparece em cada coluna do painel de vencimento contra a lista de ASOs `numero`
      → Cada colaborador aparece UMA vez, pela MAIOR validade que ele tem (max(validade)) — quem fez dois exames não pode aparecer duas vezes nem cair na coluna do exame velho
- [ ] Registre para o mesmo colaborador um segundo ASO com validade mais longe e recarregue `borda`
      → Ele sai da coluna antiga do painel e passa para a coluna da validade nova; a lista de ASOs mostra os DOIS registros (o histórico não se apaga)
- [ ] Na lista de ASOs, ache uma linha de tipo "Demissional" e clique em "contexto do desligamento →" `escopo`
      → Leva a /desligamentos. É o único elo navegável entre ASO e o processo de saída
- [ ] Abra /sst e recarregue a página 3 vezes com o dp `trilha`
      → audit.leitura_sensivel ganha 3 linhas por ASO com restrição (são 5 restrições semeadas → 15 linhas), recurso rh.aso.restricoes, chave sst.saude.ver. Não há tela de trilha: confira com node --env-file=.env.local-db db/consultar.js "SELECT recurso, count(*) FROM audit.leitura_sensivel GROUP BY 1" --banco <nome>
- [ ] Registre um ASO e depois procure a alteração gravada `trilha`
      → audit.alteracao tem ação "criacao" na tabela rh.aso, com Resultado = "registrado (dado de saúde)" e Restrições = "registradas (cifradas)" — o conteúdo clínico NÃO pode aparecer em claro na trilha
- [ ] Depois de registrar o ASO, abra a ficha do mesmo colaborador (/colaboradores/[id]) e olhe a linha do tempo `cadeia`
      → Evento "ASO registrado (Periódico, exame em dd/mm/aaaa)" — SEM resultado e SEM restrições no resumo
- [ ] Registre um ASO anexando um PDF do GED marcado como sensível (o select mostra "(sensível)") `borda`
      → Aceita e a coluna Documento vira um link de download. Sem documento.sensivel.ver a lista de anexos oferecida no formulário nem traz os sensíveis

## /sst — aba NR-1 (avaliação psicossocial), avulsa e acoplada ao ASO

**Entre como:** dp@fastdemo.local

- [ ] Na aba ASOs, marque "Registrar junto a avaliação psicossocial (NR-1) vinculada a este ASO", escolha a classificação de risco e salve o ASO `criar`
      → Um único envio cria o ASO E a avaliação, na MESMA transação. O aviso muda para "...com a avaliação psicossocial (NR-1) vinculada". Na aba NR-1 a nova linha traz a etiqueta verde "ASO #N"
- [ ] Marque a caixa da NR-1 acoplada e deixe a "Data da avaliação" em branco `criar`
      → O campo mostra a data do exame e a avaliação nasce nessa data ("Em branco, assume a data do exame")
- [ ] Na NR-1 acoplada, informe validade da avaliação IGUAL ou anterior à data da avaliação e salve `recusar`
      → Recusa com "A validade precisa ser posterior à avaliação" e NADA é gravado — nem o ASO, porque é tudo-ou-nada na mesma transação. Confira que a lista de ASOs não ganhou linha nenhuma
- [ ] Marque a NR-1 acoplada e deixe "Classificação de risco" em "Escolha a classificação…" `recusar`
      → O navegador barra (required). A classificação também NASCE VAZIA — não há risco padrão
- [ ] Aba NR-1, "Registrar avaliação psicossocial": escolha colaborador, data, classificação e deixe "ASO de origem" em "Avaliação avulsa" `criar`
      → Aceita. Na lista a coluna Origem mostra a etiqueta neutra "Avulsa"
- [ ] Aba NR-1: escolha um colaborador que tenha ASO sem avaliação e selecione esse ASO em "ASO de origem" `criar`
      → O select só oferece ASOs DAQUELE colaborador que ainda não têm avaliação vinculada. Depois de salvar, aquele ASO some da lista de opções (índice único: um ASO origina no máximo uma avaliação)
- [ ] Abra /sst em duas abas do navegador, escolha o MESMO ASO de origem nas duas e salve as duas `recusar`
      → A segunda recusa com 409 "Este ASO já tem avaliação psicossocial vinculada."
- [ ] Troque o colaborador no formulário da NR-1 depois de já ter escolhido um ASO de origem `recusar`
      → O campo "ASO de origem" volta para "Avaliação avulsa" sozinho. A guarda do servidor ("O ASO informado é de outro colaborador.") fica inalcançável pela tela — bom sinal, mas registre que ela nunca é exercida
- [ ] Registre uma NR-1 com classificação "Risco baixo" E observações preenchidas `criar`
      → Aceita — diferente do ASO (onde "apto" não carrega restrição), a NR-1 admite observação em qualquer classificação
- [ ] Compare o "Painel de vencimento da avaliação psicossocial" com o painel de ASOs `numero`
      → Mesma régua (vencidas / 30 / 31–60 / em dia) e mesmo denominador (não desligados). Na base semeada as avaliações nascem coladas nos ASOs do último ano com validade de 12 meses, então o painel da NR-1 tem MENOS gente com validade que o de ASO — a diferença é gente com ASO antigo
- [ ] Abra a aba NR-1 com o dp e confira a trilha de leitura `trilha`
      → Uma linha em audit.leitura_sensivel por avaliação com observação cifrada, recurso rh.avaliacao_psicossocial.observacoes, chave sst.saude.ver
- [ ] Registre uma NR-1 e leia a alteração gravada `trilha`
      → Classificação de risco = "registrada (dado de saúde)" e Observações = "registradas (cifradas)" — nunca o valor. "ASO de origem" diz "avulsa" ou "#N"
- [ ] Depois de registrar, abra a ficha do colaborador e veja a linha do tempo `cadeia`
      → Evento "Avaliação psicossocial (NR-1) registrada em dd/mm/aaaa — vinculada ao ASO #N", SEM classificação e SEM observações
- [ ] Abra /metas (Central de Metas) e localize os indicadores "asos_validos" e "psicossocial_valida" `numero`
      → São dois percentuais distintos sobre a MESMA base de ativos. Some: (ativos com ASO com validade ≥ hoje) ÷ (ativos) × 100, arredondado a 1 casa
- [ ] Depois das 21h (horário de Brasília), compare o painel de vencimento de /sst com o indicador asos_validos em /metas `numero`
      → Os dois têm que contar o mesmo "hoje". O painel usa America/Sao_Paulo (src/dominios/sst/servico.ts:84) e os dois indicadores usam CURRENT_DATE do servidor (src/dominios/sst/repositorio.ts:235 e :405) — se o servidor estiver em UTC, das 21h à meia-noite o indicador já virou o dia e o painel não. Um ASO que vence hoje pode contar como vencido em uma tela e válido na outra

## /sst — aba EPIs: catálogo, entrega, devolução e ciência do titular

**Entre como:** dp@fastdemo.local (registra) e gestor@fastdemo.local (titular que dá ciência)

- [ ] Aba EPIs, "Catálogo de EPI": cadastre "Luva nitrílica cano curto", CA 12345, validade do CA para daqui a 1 ano `criar`
      → Aceita e o item aparece na tabela com a etiqueta "Ativo"
- [ ] Cadastre um EPI preenchendo a "Validade do CA" mas deixando o "Nº do CA" em branco `recusar`
      → Recusa com "Validade de CA exige o número do CA" — o CHECK do banco diz o mesmo
- [ ] Cadastre um EPI com o nome EXATAMENTE igual a um já existente (ex.: "Botina de segurança com biqueira de composite") e salve `administravel`
      → CASO QUE FALHA: aceita. Não há unicidade de nome nem de CA no catálogo, e os dois itens passam a disputar espaço no select de entrega, indistinguíveis
- [ ] Procure na tela de EPI o botão de RENOMEAR, DESATIVAR ou EXCLUIR um item do catálogo `administravel`
      → CASO QUE FALHA: não existe. A coluna "Situação" mostra "Ativo"/"Fora de circulação" e a coluna rh.epi_item.ativo existe no banco, mas /api/sst/epis só tem GET e POST. Um EPI cadastrado com o nome errado fica assim para sempre, e um CA vencido não sai de circulação pela tela — contraria a exigência de "adicionar, excluir e renomear livremente"
- [ ] Leia a tabela do catálogo semeado `numero`
      → 8 EPIs. Exatamente 1 com a etiqueta vermelha "CA vencido" (Luva de vaqueta, CA 28932) e 1 vencendo em ~45 dias (Protetor auditivo, CA 30021) — mas o catálogo NÃO tem painel de vencimento de CA como o ASO tem: é só a etiqueta na linha
- [ ] "Registrar entrega": escolha colaborador, EPI, quantidade 3, data de hoje, sem termo, e salve `criar`
      → Aceita com o aviso "Entrega registrada...". Na tabela "Entregas por colaborador" a coluna Ciência mostra "Sem termo"
- [ ] ⚠ No formulário de entrega, olhe o campo Quantidade ANTES de digitar `criar`
      → Tem que estar VAZIO. Se vier com "1", o sistema passa a afirmar, com a assinatura do técnico, uma quantidade que ele não disse — e a ficha de EPI é prova em fiscalização e em reclamatória (NR-6)
      *custou:* O campo já nasceu preenchido com 1 (corrigido em src/app/sst/painel-sst.tsx:536)
- [ ] Tente enviar a entrega com quantidade 0, depois com 1000 `recusar`
      → O navegador barra pelos limites min=1/max=999 do campo. Registre que as mensagens do servidor ("Quantidade mínima: 1", "Quantidade máxima: 999") ficam inalcançáveis pela tela — e que o teto de 999 é número chumbado no código
- [ ] No formulário de entrega, escolha o colaborador A, selecione um Termo do GED que pertence a ele, DEPOIS troque o colaborador para B e salve `recusar`
      → Recusa com "O termo no GED pertence a outro colaborador." A tela filtra a lista de termos pelo colaborador escolhido, mas NÃO limpa o termo já selecionado — o servidor é quem segura
- [ ] Registre uma entrega com data de AMANHÃ e salve `borda`
      → CASO QUE FALHA: aceita. Não há guarda de data futura na entrega de EPI (compare com a CAT, que recusa acidente no futuro). O sistema passa a afirmar uma entrega que ainda não aconteceu
- [ ] Na entrega com data de amanhã que você acabou de criar, clique em "Registrar devolução" `recusar`
      → Recusa com "A devolução não pode ser anterior à data da entrega." — a segunda metade da guarda existe, a primeira não
- [ ] Numa entrega em uso, clique em "Registrar devolução" `editar`
      → A coluna Devolução passa a mostrar data e hora (fuso de Brasília) e o botão some. A entrega NÃO é apagada nem editada — só devolvido_em muda
- [ ] Abra /sst em duas abas, clique "Registrar devolução" na MESMA entrega nas duas `recusar`
      → A segunda recusa com 409 "Devolução já registrada para esta entrega."
- [ ] Marque "Mostrar também as devolvidas" na seção "Entregas por colaborador" `borda`
      → A lista cresce e passa a incluir as entregas com devolução. Com a base semeada são 3 devolvidas de ~30 entregas; desmarcado, elas somem
- [ ] Registre uma entrega e procure a alteração gravada `trilha`
      → audit.alteracao com ação "criacao" em rh.epi_entrega e o diff com Colaborador, EPI (nome + CA), Quantidade, Data e Termo. A devolução grava ação "devolucao_epi" com "de: em uso / para: dd/mm/aaaa hh:mm"
- [ ] Depois da entrega, abra a ficha do colaborador e veja a linha do tempo `cadeia`
      → Evento "EPI entregue: <nome> (qtd N) em dd/mm/aaaa"
- [ ] Entre como gestor@fastdemo.local e abra /sst diretamente pela URL. Na seção "Minhas entregas de EPI", clique em "Dar ciência" numa entrega com termo `trilha`
      → A ciência é registrada e a etiqueta vira "Registrada". Grava DUAS alterações: "criacao" em rh.ciencia (com o hash SHA-256 do termo no momento) e "ciencia_epi" em rh.epi_entrega ("de: pendente / para: registrada")
- [ ] Com o titular, dê ciência sobre o MESMO termo primeiro em /documentos e só depois clique em "Dar ciência" em /sst `trilha`
      → Aceita e a trilha diz "registrada (ciência prévia no GED reaproveitada)" — não cria uma segunda linha em rh.ciencia
- [ ] Com o gestor, clique "Dar ciência" duas vezes na mesma entrega (duas abas) `recusar`
      → A segunda recusa com 409 "Ciência já registrada para esta entrega."
- [ ] Com o gestor (que NÃO tem sst.ver), confira o que a tela /sst mostra `escopo`
      → PAR: com dp aparecem as 4 abas e todos os formulários; com gestor aparece SÓ a seção "Minhas entregas de EPI" — nenhuma aba, nenhum ASO, nenhuma CAT de terceiro
- [ ] Com o gestor, procure na home (/) o card que leva a "Saúde e segurança" `escopo`
      → CASO QUE FALHA: o card não aparece — ele é ligado por sst.ver (src/app/page.tsx:274). O gestor TEM entrega de EPI no nome dele e um termo pendente de ciência, mas só chega lá digitando /sst na barra de endereço. A ciência da NR-6 fica sem porta de entrada
- [ ] Entre como funcionario@fastdemo.local (Vendedora, cargo sem kit de EPI) e digite /sst `escopo`
      → PAR com o gestor: ela é redirecionada para a home, sem nenhuma mensagem. Nem tem sst.ver nem tem entrega no nome. Repare que a recusa é MUDA — não diz "você não tem acesso", só volta

## /sst — aba CATs: registro, correção encadeada e a trilha que faltava

**Entre como:** dp@fastdemo.local

- [ ] Aba CATs, "Registrar CAT": colaborador, tipo "Acidente típico", data/hora de ontem, descrição do acidente, sem afastamento, status "Registrada", e salve `criar`
      → Aceita com o aviso sobre o prazo legal (1º dia útil seguinte; imediato em óbito). A CAT nova entra na lista com "Cadeia: —"
- [ ] Registre uma CAT com data/hora do acidente para AMANHÃ e salve `recusar`
      → Recusa com "A data do acidente não pode estar no futuro" (tolerância de 60 segundos para relógio dessincronizado)
- [ ] Registre uma CAT deixando a descrição em branco `recusar`
      → O navegador barra (required). O servidor tem "Descreva o acidente" e o banco tem CHECK (btrim(descricao) <> '')
- [ ] Cole 4.500 caracteres na descrição do acidente `borda`
      → O textarea corta em 4.000. Repare que 4.000 caracteres de descrição livre é onde o médico do trabalho escreve o quadro clínico — e esse campo NÃO é cifrado nem escondido de quem não tem sst.saude.ver
- [ ] Marque "Houve afastamento" e escolha um afastamento no select "Afastamento vinculado" `criar`
      → O select só se habilita com a caixa marcada, e só lista afastamentos de acidente de trabalho DAQUELE colaborador. Salvo, a coluna Afastamento mostra "Sim (#N)"
- [ ] Marque "Houve afastamento", escolha um vínculo, e depois DESMARQUE a caixa `recusar`
      → O vínculo é limpo sozinho e o select desabilita. A guarda do servidor ("Vínculo com afastamento exige marcar que houve afastamento") não chega a disparar pela tela
- [ ] Escolha "Corrige a CAT (opcional)" apontando para uma CAT existente, escreva a descrição retificada e salve `editar`
      → Cria um registro NOVO (nada é editado). A CAT antiga ganha a etiqueta vermelha "substituída por #N" e a nova a etiqueta "corrige #M". Por padrão a antiga some da lista
- [ ] Marque "Mostrar registros substituídos" no filtro da lista de CATs `borda`
      → A lista passa de 2 para 3 linhas na base semeada — a CAT típica original reaparece com "substituída por". Sem marcar, você vê só a ponta de cada cadeia
- [ ] Abra o select "Corrige a CAT" e procure uma CAT que já foi corrigida `recusar`
      → Ela NÃO é oferecida (o select só lista pontas de cadeia). Para exercitar a recusa "A CAT #N já foi corrigida pelo registro #M — corrija a ponta da cadeia", faça em duas abas: corrija a mesma CAT nas duas e a segunda deve dar 409
- [ ] Depois de registrar a correção, abra a ficha do colaborador acidentado e conte os eventos de CAT `cadeia`
      → Só UM evento "cat_registrada" por acidente — a correção é retificação do mesmo fato, não fato novo. Se aparecerem dois, o mesmo acidente está contado em dobro na ficha
- [ ] ⚠ Entre como dp, abra /sst (qualquer aba) e conte as linhas novas de audit.leitura_sensivel com recurso 'rh.cat' `trilha`
      → UMA linha por CAT devolvida, a cada carga da tela — 3 CATs na base = 3 linhas, com chave_permissao 'sst.ver'. A trilha é amarrada ao dado DEVOLVIDO, não à existência de campo cifrado (a CAT não tem nenhum)
      *custou:* GET /api/sst/cats devolvia nome, matrícula, tipo do acidente e até 4.000 caracteres de descrição clínica da empresa inteira com audit.leitura_sensivel parado em ZERO
- [ ] Ainda como dp, recarregue /sst 3 vezes SEM abrir a aba CATs `trilha`
      → A trilha cresce 3 linhas por CAT mesmo assim — a tela busca /api/sst/cats em toda carga, independente da aba ativa. Confira se esse volume é o que o dono quer na trilha
- [ ] Entre como rh@fastdemo.local (tem sst.ver, NÃO tem sst.saude.ver) e abra a aba CATs `escopo`
      → PAR com o dp: nas abas ASOs e NR-1 as colunas Resultado, Restrições, Classificação, Observações e Documento ficam AUSENTES para o rh — mas na aba CATs ele lê a descrição clínica INTEIRA, igual ao dp. Decida se é o desejado: a única barreira da CAT é a trilha, não a permissão
- [ ] Filtre a lista de CATs por tipo "Doença ocupacional" `borda`
      → Lista vazia na base semeada (só há 1 típica e 1 de trajeto). A tela deve dizer "Nenhuma CAT encontrada" — e não parecer que houve erro
- [ ] Procure na tela algum alerta de CAT fora do prazo legal (D+1 útil) `administravel`
      → CASO QUE FALHA: não existe. O prazo é um parágrafo de texto fixo no topo da aba; nenhuma CAT registrada com atraso é destacada, e o prazo não é parâmetro em lugar nenhum

## /sst — quem vê o quê: os pares que provam a segregação de saúde

**Entre como:** cinco personas, uma de cada vez, na MESMA tela

- [ ] Entre como recrutador@fastdemo.local e digite /sst na barra de endereço `escopo`
      → Redireciona para a home sem mensagem. Ele não tem sst.ver nem sst.saude.ver — saúde não é assunto de R&S
- [ ] Entre como lider_td@fastdemo.local e digite /sst `escopo`
      → Mesmo redirecionamento mudo. PAR importante: em /metas ele VÊ o percentual de ASOs válidos e de avaliação psicossocial válida (tem indicador.ver) — o agregado passa, o caso individual não
- [ ] Entre como recrutador e chame direto GET /api/sst/asos pela barra de endereço `escopo`
      → 403 com "Sem permissão para esta operação" — NEGA, não devolve lista vazia. Repita com lider_td: mesma resposta
- [ ] Entre como diretora.pessoas@fastdemo.local e digite /sst `escopo`
      → CASO A CONFERIR COM O DONO: também é redirecionada. O papel 'diretoria' não recebeu sst.ver em nenhuma migration — a diretora de Pessoas vê a rede inteira, salário e clima individual, mas não vê SST
- [ ] Com rh@fastdemo.local, abra a aba ASOs e conte as colunas da tabela "ASOs registrados" `escopo`
      → PAR com o dp: rh vê 4 colunas (Colaborador, Tipo, Exame, Validade); dp vê 8 (mais Resultado, Restrições, Documento, Registrado por). É AUSÊNCIA do payload, não campo mascarado — confira no corpo da resposta de /api/sst/asos que com_saude vem false e as chaves nem existem
- [ ] Com rh, confira o painel de vencimento e o rodapé `escopo`
      → Ele vê nome e matrícula de quem está com ASO vencido. Isso é operação, não conteúdo clínico — mas decida se "Fulano está com ASO vencido" pode ser lido por quem não tem a chave de saúde
- [ ] Com rh, procure na tela os formulários de registrar ASO, NR-1, EPI, entrega e CAT `escopo`
      → Nenhum aparece (sst.gerir é só do dp). O botão "Registrar devolução" também some e a coluna mostra "Em uso"
- [ ] Com rh, chame POST /api/sst/asos por fora da tela `escopo`
      → 403 — a tela esconder o formulário não é a proteção; o servidor tem que recusar
- [ ] Com o dp, abra o select "Afastamento vinculado" no formulário de CAT `escopo`
      → Vem preenchido, porque o dp tem afastamento.saude.ver. Registre um achado: NENHUMA persona da demo tem sst.gerir SEM afastamento.saude.ver, então o caminho "lista vazia por falta de chave de saúde" (que é ausência, não recusa) nunca é exercido na demo

## /beneficios — aba Meus benefícios: catálogo elegível, adesão e cancelamento pelo titular

**Entre como:** funcionario@fastdemo.local (Vendedora CLT, Matriz Centro) e gestor@fastdemo.local

- [ ] Entre como funcionario, abra /beneficios e conte os cartões em "Catálogo elegível para você" `numero`
      → 6 benefícios (Vale-Transporte, Vale-Refeição, Vale-Alimentação, Plano de Saúde, Plano Odontológico, Convênio Farmácia) — ela é CLT e as 4 regras restritas são justamente para CLT
- [ ] Leia os valores de referência no cartão do Vale-Refeição e do Plano de Saúde `numero`
      → VR: valor R$ 660,00 · desconto R$ 13,20. Plano de Saúde: R$ 320,00 · R$ 96,00. São os padrões da regra VIGENTE (a versão do ano corrente), não os da encerrada
- [ ] Confira o cabeçalho azul acima do catálogo `escopo`
      → Nome completo, matrícula, tipo de vínculo e unidade da própria pessoa — é o perfil que decide a elegibilidade. Se a unidade vier vazia, a pessoa não tem lotação vigente e qualquer regra por unidade vai barrá-la
- [ ] Num benefício ainda não aderido, clique em "Solicitar adesão", escreva uma observação e envie `criar`
      → O cartão passa a mostrar a etiqueta amarela "Solicitação em andamento" e em "Minhas solicitações" aparece uma demanda nova com número, prazo e status
- [ ] Solicite adesão ao MESMO benefício duas vezes seguidas (recarregue e tente pelo cartão) `recusar`
      → O botão já não aparece; forçando pela API, 409 "Você já tem solicitação de adesão em andamento para este benefício."
- [ ] Num benefício em que a pessoa JÁ tem adesão vigente, procure o botão de solicitar `recusar`
      → O cartão mostra "Você já aderiu" (verde). Pela API, 409 "Você já tem adesão vigente a este benefício."
- [ ] Em "Minhas adesões", clique "Solicitar cancelamento" numa adesão vigente e escreva o motivo `criar`
      → Vira uma demanda de cancelamento. O motivo é OBRIGATÓRIO — enviar em branco tem que recusar com "Informe o motivo do cancelamento"
- [ ] Solicite cancelamento duas vezes do mesmo benefício `recusar`
      → 409 "Você já tem solicitação de cancelamento em andamento para este benefício."
- [ ] Em "Minhas adesões", procure uma adesão já encerrada (com fim preenchido) `borda`
      → Ela aparece na lista (histórico não some) com badge "Cancelada" e o botão "Solicitar cancelamento" AUSENTE
- [ ] Conte as seções da aba "Meus benefícios" `numero`
      → 4: Catálogo elegível, Minhas adesões, Minhas solicitações, Meus dependentes. Se o gestor ou o funcionário virem uma aba "Gerir adesões" ou "Catálogo", é vazamento — nenhum dos dois tem adesao.gerir nem beneficio.administrar
- [ ] Com gestor@fastdemo.local, procure em qualquer lugar de /beneficios os benefícios dos 11 liderados dele `escopo`
      → Não pode existir nenhum. Ele só tem adesao.solicitar; a seção de gestão nem é montada. Confira também a ficha de um liderado: o evento de benefício é gravado com payload restrita="true" e não pode aparecer para o gestor
- [ ] Entre como g.dearodrigurs@gmail.com (admin, senha 123456) e abra /beneficios `borda`
      → A conta tem adesao.solicitar mas provavelmente não tem ficha de colaborador: deve aparecer o aviso "Sua conta não tem ficha de colaborador — benefícios são solicitados pela ficha. Procure o DP." e as listas vazias, SEM erro de servidor
- [ ] Em "Meus dependentes", com uma pessoa sem dependentes cadastrados `borda`
      → "Nenhum dependente cadastrado — o cadastro é feito pelo DP." O titular NÃO pode adicionar nem editar dependente pela própria tela
- [ ] Com um titular que TEM dependentes, confira o que a tela dele mostra `escopo`
      → Nome, etiqueta de parentesco e data de nascimento — e NÃO mostra o CPF do dependente (a tela do DP mostra). Confira se essa diferença é intencional

## /beneficios — aba Gerir adesões: a fila do DP, efetivação, negativa, suspensão e cancelamento

**Entre como:** dp@fastdemo.local (adesao.gerir) e rh@fastdemo.local (só beneficio.ver)

- [ ] Entre como dp, abra /beneficios e leia o contador na aba "Gerir adesões" `numero`
      → 5 solicitações pendentes na base semeada: 4 de adesão (uma delas com prazo estourado, marcada "· atrasada") e 1 de cancelamento
- [ ] Numa solicitação de adesão pendente, clique "Efetivar adesão", deixe Valor e Desconto EM BRANCO e confirme `editar`
      → A adesão nasce com o valor e o desconto padrão da regra VIGENTE congelados (o placeholder do campo mostra qual é). A demanda vinculada é concluída na MESMA transação e some da fila
- [ ] Efetive outra solicitação informando Valor 700,00 e Desconto 20,00 à mão `editar`
      → A adesão grava exatamente esses valores — o padrão da regra é sugestão, não imposição. Confira no cartão da adesão: "valor R$ 700,00 · desconto R$ 20,00"
- [ ] Ao efetivar a partir de uma solicitação, tente trocar o colaborador ou o benefício nos selects `recusar`
      → Os dois ficam desabilitados. Pela API, trocar o colaborador dá 409 "A solicitação vinculada é de outro colaborador." e apontar para uma demanda de cancelamento dá "A solicitação vinculada é de cancelamento, não de adesão."
- [ ] Use "+ Efetivar adesão direta" e escolha um colaborador estagiário/aprendiz com o Plano de Saúde `recusar`
      → Recusa com 409 "Colaborador não é elegível a este benefício pela regra vigente." — a regra do Plano de Saúde alcança só CLT
- [ ] Efetive adesão direta para alguém que já tem adesão vigente naquele benefício `recusar`
      → 409 "Colaborador já tem adesão vigente a este benefício." (índice único adesao_uma_vigente)
- [ ] No select de colaborador de "Efetivar adesão direta", procure alguém desligado `recusar`
      → Desligado não é oferecido. Pela API, 409 "Colaborador desligado não recebe adesão nova."
- [ ] Numa solicitação pendente, clique "Negar", escreva o motivo e confirme `editar`
      → A demanda vira "Recusada" com o motivo em comentário e transição. Entre como o solicitante e confira que ELE lê o motivo em "Minhas solicitações" — negativa sem motivo visível é o que faz a pessoa reabrir o pedido
- [ ] Tente negar com o campo Motivo vazio `recusar`
      → Recusa com "Informe o motivo da negativa" — motivo é obrigatório na negativa e OPCIONAL no cancelamento feito pelo DP; confira se essa assimetria é o desejado
- [ ] Negue a mesma solicitação em duas abas `recusar`
      → A segunda dá 409 "Esta solicitação já foi encerrada."
- [ ] Numa adesão ativa em "Adesões vigentes", clique "Suspender" `editar`
      → O badge vira "Suspensa" e o botão vira "Reativar". A adesão NÃO é encerrada (fim continua vazio)
- [ ] Clique "Suspender" na mesma adesão em duas abas `recusar`
      → A segunda dá 409 "Só é possível suspender adesão ativa." (e o inverso: "Só é possível reativar adesão suspensa.")
- [ ] Clique "Cancelar adesão", informe fim = hoje e confirme `editar`
      → O status vira "Cancelada" com fim preenchido e a adesão SAI de "Adesões vigentes". Nada é apagado — ela continua em "Minhas adesões" do titular
- [ ] Cancele uma adesão informando um fim ANTERIOR ao início dela `recusar`
      → Recusa com "O fim não pode ser anterior ao início da adesão."
- [ ] Cancele uma adesão com fim = a MESMA data do início `borda`
      → Aceita (o CHECK do banco é fim >= inicio). É a borda exata: um dia de vigência
- [ ] Tente cancelar de novo uma adesão já encerrada (duas abas) `recusar`
      → 409 "Esta adesão já está encerrada." — e o trigger do banco recusa qualquer UPDATE em adesão com fim preenchido
- [ ] Na solicitação de CANCELAMENTO pendente da fila, clique "Confirmar cancelamento" `editar`
      → Abre o diálogo já ligado à adesão vigente do solicitante; ao confirmar, a adesão fecha E a demanda conclui na mesma transação
- [ ] Procure uma solicitação de cancelamento cuja adesão já não exista `borda`
      → O cartão mostra "Sem adesão vigente correspondente — negue com o motivo." em vez do botão de confirmar
- [ ] Depois de efetivar, suspender e cancelar, leia audit.alteracao da tabela rh.adesao `trilha`
      → Três ações distintas: "criacao" (com Colaborador, Benefício, Início, Valor, Desconto e Demanda), "suspensao"/"reativacao" (só o Status) e "cancelamento" (Status, Fim e Motivo, quando informado)
- [ ] Depois de efetivar, abra a ficha do colaborador e veja a linha do tempo `cadeia`
      → Evento "Adesão ao benefício \"X\" efetivada (início dd/mm/aaaa)" com payload restrita=true. O cancelamento gera o evento par
- [ ] Entre como rh@fastdemo.local e abra a aba "Gerir adesões" `escopo`
      → PAR com o dp: rh vê as MESMAS solicitações pendentes e as MESMAS adesões vigentes, com valor e desconto de todo mundo — mas SEM botão nenhum e sem a seção "Dependentes por colaborador". Decida se beneficio.ver deve mesmo abrir o valor de benefício da empresa inteira
- [ ] Como rh, chame POST /api/beneficios/adesoes/<id>/suspender por fora da tela `escopo`
      → 403 — o botão escondido não é a guarda
- [ ] Role a lista de "Adesões vigentes" até o fim `borda`
      → São ~200 cartões carregados de uma vez, sem paginação, sem filtro por colaborador e sem busca. Meça quanto a tela demora e diga se é usável — é a mesma ausência de paginação em ASOs, entregas e CATs

## /beneficios — aba Catálogo: criar benefício e versionar a regra de elegibilidade

**Entre como:** dp@fastdemo.local (única com beneficio.administrar)

- [ ] Abra a aba Catálogo e conte os benefícios cadastrados `numero`
      → 6, todos com a linha "Regra vigente desde 01/01/<ano>: ... · valor ... · desconto ...". Nenhum pode aparecer com "Sem regra de elegibilidade vigente"
- [ ] Clique "+ Novo benefício": chave "gympass", nome "Parceria Academia", categoria "Convênio/parceria", e salve `criar`
      → Aceita e o cartão novo aparece com a mensagem "Sem regra de elegibilidade vigente — ninguém consegue aderir."
- [ ] Logo depois, entre como funcionario e procure "Parceria Academia" no catálogo elegível `borda`
      → NÃO pode aparecer — benefício sem regra vigente fica fora do catálogo de todo mundo. Volte como dp e confira que ele também não aparece no select de "Efetivar adesão direta"
- [ ] Ainda como dp, chame POST /api/beneficios/adesoes/solicitar para esse benefício sem regra `recusar`
      → 409 "Benefício sem regra de elegibilidade vigente — procure o DP."
- [ ] Tente criar um benefício com a chave "vt" (já existe) `recusar`
      → 409 "Já existe benefício com esta chave."
- [ ] Tente criar um benefício com a chave "VT" em maiúscula `recusar`
      → A chave é normalizada para minúscula ANTES de gravar, então a recusa que aparece é a de chave duplicada, não a de formato. Repita com "vale-transporte" (com hífen): aí sim "Chave: minúsculas, números e _ (2 a 40 caracteres)"
- [ ] Tente criar um benefício com nome de 1 letra `recusar`
      → "Informe o nome do benefício" (mínimo 2, máximo 120 caracteres)
- [ ] Clique "Editar" num benefício, mude só o nome e salve `editar`
      → Aceita e a trilha grava só o campo que mudou ("Nome: de X para Y"). Salvar sem mudar nada não pode gerar linha de auditoria
- [ ] Edite um benefício desmarcando "Aberto para adesões novas" e salve `editar`
      → O badge vira "Inativo". Entre como funcionario: o benefício some do catálogo elegível, mas a adesão que ele JÁ tinha continua em "Minhas adesões" e continua descontando
- [ ] Clique "Nova versão de regra" num benefício, marque só "CLT" em tipos de vínculo, valor 700,00, desconto 15,00, início = hoje, e publique `criar`
      → Aceita. A linha do cartão passa a mostrar "Regra vigente desde hoje: Vínculos: CLT · valor R$ 700,00 · desconto R$ 15,00"
- [ ] ⚠ Clique "Nova versão de regra" e ponha o início de vigência em 01/01/2027 (futuro). Publique `recusar`
      → Recusa com "O início da vigência não pode ser no futuro: a versão nova passa a valer assim que é gravada, e o sistema não tem regra agendada." Duas guardas seguram isso: o zod na borda e exigirVigenciaNaoFutura dentro da transação, lendo o "hoje" do banco no fuso da operação
      *custou:* A regra é lida por status='ativa', nunca por data: a versão de 2027 cadastrada hoje passava a MANDAR HOJE, o estagiário levava 403 num benefício a que tinha direito, e a versão que de fato valia era encerrada com fim_vigencia em 31/12/2026 — meses de buraco na leitura por data
- [ ] Publique uma nova versão com início IGUAL ao da versão vigente (01/01 do ano corrente) `recusar`
      → Recusa com "O início da nova versão deve ser posterior ao início da versão vigente." Repita com uma data anterior: mesma recusa
- [ ] Depois de publicar uma versão nova, clique "Ver versões" no mesmo benefício `trilha`
      → A versão anterior aparece como "(encerrada)" com fim na VÉSPERA do início da nova — sem um dia sem dono e sem sobreposição. A nova aparece como "em diante (ativa)"
- [ ] Clique "Ver versões" no Vale-Refeição e no Plano de Saúde `numero`
      → Dois benefícios já têm histórico semeado: VR com a versão encerrada de R$ 594,00 / R$ 11,88 (de 01/01 de dois anos atrás a 31/12 do ano passado) e Plano de Saúde com R$ 286,00 / R$ 85,80. Os demais têm uma versão só
- [ ] Publique uma versão que restrinja o Vale-Refeição a "Estagiário" e volte como funcionario (CLT) `escopo`
      → O VR SOME do catálogo elegível dela. Mas a adesão vigente que ela já tinha CONTINUA — regra nova vale para adesões novas, nunca retroage
- [ ] Publique uma versão marcando apenas uma unidade (ex.: Matriz Centro) em "Unidades elegíveis" `editar`
      → Só quem tem lotação vigente naquele estabelecimento passa a ver o benefício. Quem estiver sem lotação vigente fica de fora, mesmo sendo CLT
- [ ] No diálogo de nova versão, procure como restringir a elegibilidade por CARGO, por TEMPO DE CASA, por CENTRO DE CUSTO ou por EMPRESA do grupo `administravel`
      → CASO QUE FALHA: só existem duas dimensões — tipo de vínculo e unidade (src/dominios/beneficios/esquemas.ts:104). "Plano de saúde só para quem tem 6 meses de casa" ou "só para a liderança" não é cadastrável; o semeador já contorna isso escrevendo os valores um a um na adesão
- [ ] No diálogo de novo benefício, abra o select "Categoria" e tente acrescentar uma categoria nova `administravel`
      → CASO QUE FALHA: as 6 categorias (VT, VR/VA, Saúde, Odonto, Convênio, Outro) são lista fixa no código e CHECK no banco. Não dá para criar "Previdência privada" nem "Seguro de vida" como categoria própria — sobra o balde "Outro"
- [ ] Publique uma versão de regra e leia a alteração gravada `trilha`
      → Ação "nova_versao" na tabela rh.regra_elegibilidade_versao, com Critério em frase legível ("Vínculos: CLT · Unidades: Matriz Centro"), valor, desconto e início de vigência

## /beneficios — Dependentes por colaborador (dado de terceiro, LGPD)

**Entre como:** dp@fastdemo.local (adesao.gerir)

- [ ] Aba "Gerir adesões", seção "Dependentes por colaborador": escolha um colaborador, clique "+ Novo dependente", preencha nome, nascimento, parentesco Filho(a) e CPF, e salve `criar`
      → O dependente aparece na lista com etiqueta de parentesco, data de nascimento e o CPF ao lado
- [ ] Cadastre um dependente SEM CPF (é o caso do filho pequeno) `criar`
      → Aceita — CPF é opcional. A lista mostra só "nascimento dd/mm/aaaa"
- [ ] Cadastre um dependente com CPF 111.111.111-11 `recusar`
      → Recusa com "CPF inválido" (dígito verificador conferido). Com 10 dígitos: "CPF deve ter 11 dígitos"
- [ ] Cadastre um dependente com nome de 2 letras `recusar`
      → "Informe o nome do dependente" (mínimo 3, máximo 200)
- [ ] Clique "Editar" num dependente, corrija só o parentesco e salve `editar`
      → Aceita. A trilha grava o campo alterado — e o CPF, quando muda, vai para a trilha só como "informado"/"removido", NUNCA o número
- [ ] Edite um dependente apagando o CPF e salve `editar`
      → Aceita (cpf vira null) e a trilha registra CPF "removido"
- [ ] Com o dp, escolha no select um colaborador que NÃO é você e veja a lista de dependentes dele `trilha`
      → Cada consulta grava audit.leitura_sensivel com recurso 'beneficios.dependentes', registro_id = id do colaborador e chave 'adesao.gerir'. Escolher o PRÓPRIO registro não pode gerar linha (o titular não é terceiro)
- [ ] Entre como rh@fastdemo.local e procure a seção "Dependentes por colaborador" `escopo`
      → PAR: com dp a seção existe; com rh ela some (a seção exige adesao.gerir). Mas o rh TEM beneficio.ver e a API GET /api/beneficios/dependentes?colaborador_id=N atende ele, gravando a trilha com a chave 'beneficio.ver'. Confira: o acesso existe, a porta na tela não
- [ ] Entre como funcionario e chame GET /api/beneficios/dependentes?colaborador_id=<id de outra pessoa> `escopo`
      → 404 "Colaborador não encontrado." — AUSÊNCIA, não máscara: quem não pode ver nem fica sabendo que existe. Com o próprio id, a lista dele vem sem gravar trilha
- [ ] Abra o select "Parentesco" e conte as opções contra o que a Receita reconhece como dependente para IRRF `administravel`
      → CASO QUE FALHA: só 3 opções (Filho(a), Cônjuge, Outro). A Receita reconhece pelo menos 11 situações distintas — companheiro(a), enteado(a), filho até 21 ou até 24 se universitário, filho incapaz, irmão/neto/bisneto sob guarda, pais/avós/bisavós dentro do limite de renda, menor pobre criado e educado, tutelado incapaz. Tudo isso cai em "Outro", e a lista não é editável pela tela (src/dominios/beneficios/esquemas.ts:41)
- [ ] Cadastre um dependente do tipo Filho(a) com nascimento de 30 anos atrás e depois recalcule a folha da competência aberta `numero`
      → CASO QUE FALHA: ele conta na dedução de IRRF do mesmo jeito. A folha conta TODO dependente com nascimento ≤ data de referência (src/dominios/folha/repositorio.ts:452), sem limite de idade, sem marcar "vale para IRRF" e sem início/fim de dependência. Um filho de 30 anos ou um cônjuge já separado seguem reduzindo o imposto
- [ ] Cadastre HOJE um dependente com nascimento em março do ano passado e recalcule a folha de uma competência antiga `cadeia`
      → O dependente entra na competência antiga também — "a dedução é devida desde que o dependente existe", não desde o cadastro. Confira o número de dependentes no demonstrativo em /folha/[id]
- [ ] Remova um dependente (botão "Remover", com confirmação) e recalcule a folha da competência aberta `cadeia`
      → A dedução do IRRF cai. Repare que a remoção é EXCLUSÃO FÍSICA (DELETE), sem vigência e sem soft-delete: depois disso não há como reconstruir a folha antiga que contava com ele. A trilha guarda só nome e parentesco
- [ ] Entre como funcionario e procure onde ele cadastra o próprio filho recém-nascido `administravel`
      → CASO QUE FALHA: não existe. A tela diz "o cadastro é feito pelo DP" e POST /api/beneficios/dependentes exige adesao.gerir. Uma das observações de adesão semeadas é exatamente "minha filha nasceu em março e quero incluí-la no plano" — e não há caminho pela tela do titular
- [ ] Percorra os colaboradores do select e conte quantos têm dependente `numero`
      → 12 titulares na base semeada, ~25 dependentes (filhos, cônjuges e 1 caso "outro": uma mãe idosa na apólice). Confira contra /relatorios → composição familiar

## Cadeias entre módulos: onde o benefício e a SST aparecem fora da própria tela

**Entre como:** dp@fastdemo.local, com passagem por rh, gestor e o titular

- [ ] ⚠ Na base semeada, ache a conferente da Filial Sul que foi transferida da Casa do Montador para a Supply (o caso da migration 0051). Entre como dp, aba "Gerir adesões", e procure as adesões dela `cadeia`
      → Só pode aparecer o vínculo NOVO. A matrícula ENCERRADA não pode aparecer sob o título "Adesões vigentes" com botões de suspender e cancelar do lado — listarAdesoesVigentes filtra c.status <> 'desligado'
      *custou:* O RH via 5 adesões "vigentes" numa matrícula encerrada (VR, VA, Plano de Saúde, Odonto, Farmácia) enquanto a própria pessoa via ZERO em "Meus benefícios", e a folha parava o desconto sem aviso enquanto a mensalidade continuava sendo paga à operadora
- [ ] Entre com a conta DELA e abra /beneficios, aba "Meus benefícios" `cadeia`
      → O PAR do caso acima. Se "Minhas adesões" vier vazio e o catálogo a convidar a aderir de novo ao Plano de Saúde, o efeito de transferência de benefício NÃO foi aplicado na base da demo — o serviço da tela foi corrigido (transferirAdesoesEntreVinculos), mas o semeador db/semear/16-transferencia-empresa.js não replica esse passo e não toca em rh.adesao
- [ ] Abra a demanda de transferência entre empresas dela (em /demandas) e leia o cartão da movimentação aplicada `cadeia`
      → Tem que existir uma linha nomeando o que atravessou e o que ficou: "N recriada(s) no vínculo novo (VR, VA...)" e/ou "N encerrada(s) sem recriação — o critério da empresa destino não admite: ...". Encerrar calado foi o que criou o buraco
- [ ] Faça a cadeia inteira: crie uma regra que restrinja o Vale-Alimentação a UMA unidade, e depois transfira alguém de outra unidade para a empresa nova `cadeia`
      → A adesão de VA fecha na VÉSPERA da admissão nova e NÃO é recriada; o nome do benefício aparece na lista "ficaram" do cartão. As demais são recriadas com o MESMO valor e desconto — transferência não renegocia benefício. Adesão suspensa atravessa suspensa
- [ ] Em /folha, na competência aberta, use "Importar do benefício" (variáveis de benefício) e depois abra o demonstrativo de quem tem VR `cadeia`
      → Cada adesão com desconto vira uma variável na rubrica de Desconto de Benefício, pelo desconto congelado NA ADESÃO (não pelo padrão da regra de hoje) e pela data de referência da COMPETÊNCIA — reimportar julho em agosto não pode descontar de quem aderiu em agosto
- [ ] Suspenda uma adesão HOJE e reimporte as variáveis de benefício de uma competência ANTERIOR já fechada/reaberta `numero`
      → DEFEITO CONHECIDO E REGISTRADO: o desconto do mês passado desaparece. A suspensão não tem par de datas em rh.adesao, então 'suspensa' é bandeira de HOJE e apaga o passado na reimportação (src/dominios/folha/repositorio.ts:772-779). Meça o valor que sumiu e leve o número
- [ ] Cancele uma adesão com fim no meio do mês e reimporte as variáveis daquela competência `cadeia`
      → O desconto CONTINUA sendo importado para aquela competência (a janela inicio <= dataRef <= fim ainda pega). Confira se o valor é proporcional ou cheio — se for cheio, o desconto do mês da saída está errado
- [ ] Registre uma CAT com "Houve afastamento" ligada a um afastamento de acidente de trabalho recente. Depois abra uma transferência entre empresas do grupo para esse mesmo colaborador `cadeia`
      → A transferência tem que RECUSAR com 409 citando a estabilidade do art. 118 da Lei 8.213/91 — transferir entre CNPJs ENCERRA o contrato, e há 12 meses de estabilidade a partir do acidente
- [ ] Deixe uma entrega de EPI sem devolução e abra o processo de desligamento desse colaborador `cadeia`
      → CASO A CONFERIR: o rodapé da tela de SST promete que "a pendência de devolução alimenta o checklist de desligamento", mas o domínio de desligamento tem uma lista MANUAL de itens de devolução (categoria "epi") e não lê rh.epi_entrega. Se o item não aparecer sozinho, a tela está prometendo o que o sistema não faz
- [ ] Admita alguém novo (/admissoes) e siga: registre o ASO admissional com a NR-1 acoplada, entregue o kit de EPI com termo, faça a pessoa dar ciência, e efetive as adesões de VR e VT `cadeia`
      → Ao fim, a ficha dela tem 4 eventos na linha do tempo (ASO, NR-1, EPI, adesão), o painel de vencimento a conta como "em dia", os dois indicadores de SST sobem em /metas, e a folha da competência aberta já traz o desconto de benefício
- [ ] Depois de registrar 1 ASO novo com validade longa, recarregue /metas e compare o percentual de asos_validos antes e depois `numero`
      → Sobe exatamente 1 ÷ (nº de ativos) × 100, arredondado a 1 casa. Se não mudar, o indicador não está lendo o registro que você acabou de criar
- [ ] Entre como gestor e abra a ficha de um liderado que acabou de receber EPI e ASO `escopo`
      → O gestor pode ver o fato "EPI entregue" e "ASO registrado" (não têm conteúdo clínico), mas NÃO pode ver resultado, restrições, classificação de risco nem os eventos de benefício (payload restrita=true). Confira campo a campo

---

# 6 · Painel executivo, metas e indicadores, relatórios, portais, notificações, entrada e 2FA

> O escopo tem duas naturezas bem diferentes e vale separá-las na hora de testar. Painel executivo, relatórios e portais são LEITURA CONSOLIDADA: não criam nada, e o teste que importa neles é o par de personas (quem vê o quê) e a conferência do número no papel — cada card do painel já traz a conta escrita justamente para isso. Metas, 2FA e notificações são os únicos pontos do escopo em que alguém ESCREVE, e é onde a lista rende mais casos de recusa.
> O ponto mais forte que encontrei é o par de custo de pessoal no painel executivo: só o papel `dp` tem `folha.ver` no sistema inteiro, então a diretora de pessoas abre o painel e recebe o card BLOQUEADO — ausência total de número, nem mascarado. Vale confirmar com o dono se isso é o desejado, porque a persona dela foi descrita como "a rede inteira, salário, clima individual".
> O achado mais grave é de administrabilidade circular: o piso de anonimato k é o único parâmetro de privacidade administrável do sistema, e de fábrica ninguém alcança o formulário — o papel `admin` tem a chave `privacidade.administrar` mas não tem `relatorio.ver`, que é o gate da página onde o formulário mora. O segundo mais grave é de dinheiro: o código da rubrica de FGTS ("3001") está fixo no painel executivo, então uma rubrica cadastrada pela tela com outro código faz o custo da diretoria encolher em silêncio.
> Sobre metas: o versionamento por vigência está bem feito (nunca sobrescreve, encerra e cria, com trilha de duas linhas na mesma transação) e a correção do escopo por ID em vez de nome sobrevive a renomear a unidade. O que falta é o outro lado: criar indicador dá, editar ou inativar não dá, e indicador criado pela tela nunca ganha farol porque a fonte de apuração é registry no código.
> Sobre "negar × mostrar vazio", que o dono cobrou: o portal do GESTOR acerta (cada bloco só entra no payload se a chave do módulo autorizar, e a tela distingue), mas o portal do COLABORADOR erra — bloco sem permissão simplesmente não é renderizado, sem uma linha explicando. E o padrão de negação das páginas do escopo é redirect para a home, que na tela parece "a página sumiu" e não "você não tem acesso".

## Entrada — /entrar (autenticação, 2FA por chave, conta inativa)

**Entre como:** todas as sete personas, uma de cada vez; use janela anônima nova a cada troca

- [ ] Entre com gestor@fastdemo.local e a senha errada (FastDemo2025!) — deve recusar com "E-mail ou senha incorretos." e nada mais `recusar`
      → mensagem genérica, sem dizer se o e-mail existe; o campo de código NÃO aparece
- [ ] Entre com naoexiste@fastdemo.local e qualquer senha, cronometrando no relógio — deve demorar quase o mesmo que uma senha errada de conta real `recusar`
      → mesma mensagem e tempo parecido (há um hash sacrificial em identidade/servico.ts:26 justamente para não denunciar quais contas existem)
- [ ] Entre com gestor@fastdemo.local / FastDemo2026! — deve entrar DIRETO na home, sem pedir código nenhum `escopo`
      → vai para /, sem campo de autenticador: o papel gestor não compõe nenhuma chave com exige_2fa
- [ ] Entre com funcionario@fastdemo.local / FastDemo2026! — deve entrar direto, igual ao gestor `escopo`
      → vai para /, sem segundo fator
- [ ] Entre com dp@fastdemo.local / FastDemo2026! — deve aparecer o campo "Código do autenticador" SEM nenhuma mensagem vermelha `escopo`
      → campo de 6 dígitos com foco automático e o aviso azul; pedir o segundo fator não é erro e não pode parecer senha errada
- [ ] Com o campo de código aberto, digite 000000 e envie — deve recusar dizendo "Código de verificação inválido." `recusar`
      → 401 com o campo ainda na tela, para tentar de novo
- [ ] Digite 12345 (cinco dígitos) no campo de código e force o envio — deve recusar sem chegar a validar TOTP `recusar`
      → o pattern do campo barra; se forçar pela API, 400 "Informe e-mail e senha válidos."
- [ ] ⚠ Erre a senha de dp@fastdemo.local vinte vezes seguidas e depois acerte — deve entrar normalmente na vigésima primeira `recusar`
      → ACHADO ESPERADO: não há bloqueio de conta, atraso progressivo nem captcha. Vinte tentativas gravam vinte login_falha e nada mais acontece
      *custou:* força bruta sem teto contra a única barreira dos papéis que entram só com senha (gestor e funcionario)
- [ ] Entre com rh@fastdemo.local — se ele ainda não tiver autenticador configurado, deve ir para /configurar-2fa, nunca receber negativa de login `borda`
      → login 200 com precisa_configurar_2fa, redirecionado a /configurar-2fa; o caminho é sempre "configure e siga"
- [ ] Peça ao admin (g.dearodrigurs@gmail.com / 123456) para inativar recrutador@fastdemo.local em /usuarios e tente entrar com ele `recusar`
      → a MESMA mensagem "E-mail ou senha incorretos." — conta inativa não se anuncia; reative depois para não quebrar os outros testes
- [ ] Depois dos testes acima, abra a trilha com o admin e procure as ações de identidade das últimas horas `trilha`
      → login_falha para cada erro (com o motivo totp_invalido quando for o caso), login_sucesso para cada acerto e logout para cada saída, sempre com id e papel

## Segundo fator — /configurar-2fa (enrolamento, desativação e o defeito das 70 fichas)

**Entre como:** gestor@fastdemo.local e dp@fastdemo.local, mais o admin para mexer em /perfis

- [ ] Entre como dp@ (já com 2FA) e abra /configurar-2fa — deve mostrar o selo "2FA ativada" e NENHUM botão de desativar `recusar`
      → em vez do botão, a frase "O seu perfil de acesso exige autenticação em duas etapas — ela não pode ser desativada"
- [ ] Entre como gestor@ e abra /configurar-2fa — deve oferecer "Começar configuração", sem o aviso de obrigatoriedade `escopo`
      → tela em estado inativo, sem a tarja laranja de perfil obrigado
- [ ] Clique em "Começar configuração" como gestor@ e anote o segredo base32 mostrado ao lado do QR `criar`
      → QR gerado no próprio servidor (sem requisição externa) e o segredo em texto; nada foi gravado ainda — o segredo viaja num cookie assinado até a confirmação
- [ ] Com o QR na tela, digite 000000 e confirme — deve recusar dizendo que o código está inválido e o 2FA continuar desligado `recusar`
      → "Código inválido. Confira o aplicativo autenticador e tente de novo." no campo codigo, e uma linha ativacao_2fa_falha na trilha
- [ ] Com o QR na tela, apague o cookie fp_2fa_pendente pelo devtools e tente confirmar com um código válido `borda`
      → "Configuração expirada. Gere um novo QR Code e tente de novo." — o segredo pendente não sobrevive à perda do cookie
- [ ] Leia o QR no autenticador e confirme com o código de 6 dígitos — deve ativar na hora, sem pedir login de novo `trilha`
      → selo "2FA ativada" e, na trilha, audit.alteracao ação ativacao_2fa com diff "Autenticação em duas etapas: Desativada → Ativada"
- [ ] Com o 2FA já ativo, chame de novo o início da configuração (recarregue e clique em começar) — deve recusar `recusar`
      → 409 "A autenticação em duas etapas já está ativa."
- [ ] Como gestor@ com 2FA ativo, tente desativar informando a senha errada e um código válido `recusar`
      → "Senha atual incorreta." apontando o campo senha; o 2FA continua ativo e sobra desativacao_2fa_falha na trilha
- [ ] Tente desativar com a senha certa e o código 000000 `recusar`
      → "Código inválido. Confira o aplicativo autenticador." — a desativação exige prova dupla
- [ ] Desative com senha e código corretos — deve voltar ao estado inativo e deixar rastro `trilha`
      → mensagem de sucesso, botão "Começar configuração" de volta e audit.alteracao desativacao_2fa com diff Ativada → Desativada
- [ ] ⚠ Com o admin, entre em /perfis e conceda ao papel gestor a chave rh.colaborador.ver.todos; saia, entre de novo como gestor@ e observe a tela de login `escopo`
      → agora o login PEDE o código do autenticador, mesmo o papel continuando a se chamar "gestor": a exigência viaja com a CHAVE, não com o nome do papel
      *custou:* o pior defeito do projeto — um administrador ampliava pela tela o alcance de um perfil para 70 fichas e a segunda etapa de autenticação ficava para trás; 70 fichas atrás de uma senha só (migration 0040)
- [ ] Ainda com rh.colaborador.ver.todos no papel gestor, entre em /configurar-2fa como gestor@ e tente desativar o segundo fator `recusar`
      → 403 "O seu perfil de acesso exige autenticação em duas etapas — ela não pode ser desativada." — não adianta fechar a porta da entrada se dá para desligá-la por dentro
- [ ] Tire a chave rh.colaborador.ver.todos do papel gestor em /perfis, saia e entre de novo com gestor@ `escopo`
      → volta a entrar só com senha — a régua é reversível e vale para papel criado amanhã, sem ninguém atualizar lista no código
- [ ] Estando numa sessão pendente de 2FA (papel obrigado e ainda sem autenticador), digite na barra /painel-executivo `borda`
      → redirecionado para /configurar-2fa, e não para a home nem para o painel
- [ ] Na mesma sessão pendente, abra /api/notificacoes direto na barra do navegador `recusar`
      → 403 com "Configure a autenticação em duas etapas para continuar" — o bloqueio existe no proxy E de novo na aplicação
- [ ] Na mesma sessão pendente, abra /trocar-senha `borda`
      → a tela ABRE: trocar senha e configurar 2FA são as únicas rotas liberadas para sessão pendente

## Troca de senha — /trocar-senha

**Entre como:** funcionario@fastdemo.local (depois devolva a senha original)

- [ ] Informe uma senha atual errada e uma nova válida de 12+ caracteres — deve recusar `recusar`
      → "Senha atual incorreta" e uma linha troca_senha_falha na trilha
- [ ] Informe a senha atual certa e uma nova de 11 caracteres — deve recusar dizendo o tamanho `recusar`
      → "A nova senha precisa de ao menos 12 caracteres"
- [ ] Informe a senha atual certa e repita a MESMA senha como nova `recusar`
      → "A nova senha deve ser diferente da atual"
- [ ] Digite a nova senha e uma confirmação diferente `recusar`
      → "A confirmação não confere com a nova senha." — validação só no navegador, nada é enviado
- [ ] ⚠ Troque a senha com sucesso e, em outra janela anônima onde a mesma conta já estava logada, recarregue uma tela `borda`
      → ACHADO ESPERADO: a outra sessão CONTINUA valendo — trocar a senha não invalida sessões abertas em outros aparelhos
      *custou:* conta comprometida continua acessível pelo aparelho do invasor mesmo depois de a pessoa trocar a senha
- [ ] Depois de trocar com sucesso, abra a trilha com o admin `trilha`
      → ação troca_senha registrada com id e papel; a senha em si nunca aparece

## Painel executivo — /painel-executivo (cards, sparklines, custo e piso de anonimato)

**Entre como:** dp@ (tem folha.ver), diretora.pessoas@ e lider_td@ (não têm), rh@ e recrutador@ (não têm nem a tela)

- [ ] Entre como dp@ e abra /painel-executivo — o card "Custo de pessoal" deve trazer valor em reais, competência e a conta escrita `numero`
      → total = proventos + FGTS da última competência FECHADA, com a data do fechamento no rótulo do período
- [ ] Entre como diretora.pessoas@ e abra a MESMA tela — o card de custo deve vir BLOQUEADO `escopo`
      → selo "Bloqueado", a chave folha.ver citada e NENHUM número: nem mascarado, nem total aproximado. Par que importa: com dp deve ver R$; com a diretora, ausência
- [ ] Entre como lider_td@ e confira o mesmo card `escopo`
      → também bloqueado, pela mesma chave — só o papel dp tem folha.ver no sistema hoje
- [ ] Entre como rh@ e digite /painel-executivo na barra — deve NEGAR o acesso, não mostrar tela vazia `recusar`
      → volta para a home (a página não tem painel.executivo.ver); chamando /api/painel-executivo direto, 403 "Sem permissão para esta operação"
- [ ] Repita o anterior com recrutador@ `recusar`
      → mesmo comportamento: home; confira se ficar claro que foi NEGADO e não que a tela sumiu
- [ ] No card de headcount, some as quantidades da quebra por unidade e compare com o total de ativos `numero`
      → a diferença tem de ser exatamente o número mostrado em "pessoa(s) sem lotação" — não pode faltar nem sobrar ninguém
- [ ] No card de turnover, refaça a conta no papel: desligados ÷ ((headcount início + headcount fim) ÷ 2) × 100 `numero`
      → o percentual da tela tem de bater com o do papel, com duas casas; o texto da conta já traz os quatro números
- [ ] ⚠ Abra a tabela de rateio do custo por unidade e procure a coluna que diz de QUAL CNPJ é cada linha `numero`
      → ACHADO ESPERADO: as colunas são Unidade, Centro de custo, Pessoas, Proventos, FGTS e Total — a empresa do grupo NÃO aparece, embora a fonte (rh_folha.apropriacao_competencia) tenha empresa_id, empresa_cnpj e empresa_nome
      *custou:* num grupo com mais de um CNPJ a diretoria lê custo por unidade sem saber de qual empresa é — e duas lotações homônimas em CNPJs diferentes caem em linhas indistinguíveis
- [ ] Confira o rodapé do card de custo quando houver folha sem lotação vigente na competência `numero`
      → linha "R$ X de folha sem lotação vigente na competência — fora do rateio acima"; o rateio nunca pode fingir que soma o total
- [ ] ⚠ Percorra o card de diversidade procurando qualquer faixa ou gênero mostrando 1, 2, 3 ou 4 pessoas `numero`
      → nenhum: recorte com menos de 5 tem de aparecer como suprimido. Se aparecer "1 pessoa", isso é reidentificação e o piso furou
      *custou:* piso de anonimato — publicar um recorte de 1 pessoa num quadro deste tamanho identifica alguém pelo nome
- [ ] Conte quantos recortes de gênero saíram suprimidos; se for exatamente 1, confira se o MENOR recorte publicado também sumiu `numero`
      → a guarda contra revelação por complemento: com um único suprimido bastaria subtrair do total para reidentificar, então o segundo menor também é suprimido
- [ ] Com o admin (depois de lhe dar relatorio.ver), mude o piso k de 5 para 20 em /relatorios e volte ao painel executivo `administravel`
      → mais recortes suprimidos no card de diversidade, o texto da conta passa a dizer "menos de 20" e a série "% de mulheres" perde os meses com menos de 20 mulheres — prova de que o piso é o MESMO parâmetro nas duas telas
- [ ] Devolva o k para 5 e recarregue o painel `administravel`
      → os recortes voltam a aparecer; nada ficou congelado em cache
- [ ] Abra o painel como dp@ e depois procure a trilha de leitura sensível daquele minuto `trilha`
      → TRÊS linhas em audit.leitura_sensivel: painel_executivo.diversidade (chave painel.executivo.ver), painel_executivo.performance (mesma chave) e painel_executivo.custo_pessoal (chave folha.ver, com competencia:ID)
- [ ] Abra o painel como diretora.pessoas@ e confira a mesma trilha `trilha`
      → apenas DUAS linhas: diversidade e performance. Custo não gera trilha porque nem chegou a ser consultado — a folha não é lida para quem não tem a chave
- [ ] No card de clima, confira o eNPS quando a última pesquisa encerrada tiver menos respostas que o piso `numero`
      → pontos, respostas, promotores e detratores TODOS nulos (a tela não publica nenhum deles), com a frase explicando que a amostra é menor que o mínimo
- [ ] Procure o card de ROI de treinamento `borda`
      → selo "Sem fonte" com a explicação do módulo de T&D que vive no Sults — nunca um número estimado
- [ ] Olhe o último ponto de cada sparkline e confira se o mês corrente está marcado como parcial `borda`
      → o mês em curso vem marcado; comparar mês fechado com mês pela metade é maçã com laranja
- [ ] Confira a cor/direção da seta de tendência do turnover e do absenteísmo quando o número SOBE `numero`
      → tem de ler como ruim (subir_e_bom = falso nesses dois), ao contrário de headcount e clima
- [ ] Num banco recém-semeado, procure uma micro-série com menos de dois meses de dado `borda`
      → texto "série curta demais para tendência (menos de dois meses com dado)" em vez de uma seta inventada
- [ ] Cadastre um feriado nacional novo em Ponto → Parâmetros numa data passada dentro dos 12 meses e recarregue o painel `cadeia`
      → os "dias úteis previstos" do absenteísmo caem e o percentual sobe — o denominador é administrável pela tela e a conta escrita diz isso
- [ ] No card de performance, conte as faixas exibidas quando alguma estiver zerada `numero`
      → as quatro faixas do modelo aparecem sempre, inclusive vazias; nenhum nome e nenhuma nota individual
- [ ] No card de tempo de contratação, procure o nome de qualquer candidato ou contratado `escopo`
      → nenhum: o card publica caso a caso em dias (ex.: "41d, 27d"), o elo é por CPF e nome nenhum entra
- [ ] Compare o rótulo de período do painel com a data de hoje em São Paulo `borda`
      → a data de negócio vem de uma leitura só do banco no fuso America/Sao_Paulo; todos os cards falam da mesma janela mesmo se a requisição atravessar a meia-noite

## Central de metas — /metas (catálogo, meta versionada por vigência e farol)

**Entre como:** rh@ ou dp@ (administram), gestor@ (só vê), funcionario@ (nem vê)

- [ ] Entre como rh@ e abra /metas — deve listar os indicadores agrupados por área, com farol na coluna "Valor atual" `numero`
      → os semeados dão farol misto: vagas_no_prazo (meta 80%, real 100%) e folha_no_prazo (meta 98%, real 100%) verdes; entrevista_desligamento (meta 90%, real ~71%), admissao_prazo (meta 95%, real ~67%) e ferias_vencidas (meta 0, real 5) vermelhos
- [ ] Entre como gestor@ e abra /metas — deve ver a tela SEM os botões "+ Novo indicador" e "Alterar meta" `escopo`
      → só o botão "histórico" sobra; gestor tem indicador.ver e não indicador.administrar
- [ ] Entre como funcionario@ e digite /metas na barra `recusar`
      → volta para a home — negado, não vazio
- [ ] Como rh@, clique em "+ Novo indicador", digite um nome de 2 letras e salve `recusar`
      → recusa "Informe o nome do indicador" (mínimo 3 caracteres)
- [ ] Crie um indicador escolhendo "Outra área…" e deixando o campo da nova área em branco `recusar`
      → recusa "Informe a área do indicador." — a área é obrigatória
- [ ] Crie um indicador chamado "Índice de retenção" e, em seguida, outro chamado "indice de retencao" `recusar`
      → o segundo é recusado com 409 "Já existe um indicador com nome equivalente. Ajuste o nome." — a chave técnica é derivada do nome sem acento
- [ ] ⚠ Crie um indicador novo qualquer e observe a coluna "Valor atual" dele `administravel`
      → ACHADO ESPERADO: entra no catálogo com "sem dados" e nunca ganhará farol — a fonte de apuração de cada indicador é um registry no código (valores.ts), não algo que a tela cadastre
      *custou:* o RH pode criar indicador pela tela e ele nasce permanentemente sem número, sem a tela avisar disso
- [ ] Abra o seletor "Unidade de medida" no formulário de indicador novo `administravel`
      → ACHADO ESPERADO: só %, quantidade e dias. Não dá para criar indicador em R$, horas ou pontos — por isso o eNPS, que é PONTOS de −100 a +100, é publicado com o rótulo de percentual
- [ ] ⚠ Procure na linha de qualquer indicador um botão para renomear, editar a descrição ou inativar o indicador `administravel`
      → ACHADO ESPERADO: não existe. A permissão se chama "Criar/editar indicadores" mas só há criação; a coluna rh.indicador.ativo só muda por SQL
      *custou:* indicador criado com nome errado fica para sempre na tela da diretoria e não há como tirá-lo
- [ ] Em entrevista_desligamento, clique em "Alterar meta", mantenha o escopo Global, troque 90 por 95 com vigência de hoje e salve `editar`
      → a linha passa a mostrar 95% e "desde" a data de hoje; a versão de 90% não some — vira histórico encerrado
- [ ] Abra o "histórico" desse mesmo indicador `trilha`
      → pelo menos três linhas: 80% encerrada, 90% encerrada e 95% ativa, cada uma com quem definiu, quando e a partir de qual vigência
- [ ] Tente salvar uma meta com valor −1 `recusar`
      → recusa "A meta não pode ser negativa"
- [ ] Tente salvar uma meta com valor 2000000000 `recusar`
      → recusa "Valor alto demais" (teto de 1 bilhão)
- [ ] Salve meta 0 em ferias_vencidas `numero`
      → aceita — zero é meta legítima para indicador de "quanto menor, melhor"; o farol fica vermelho porque o real semeado é 5
- [ ] Salve uma meta com início de vigência em 01/01/2020 `borda`
      → aceita e a coluna Vigência mostra "desde 01/01/2020" — vigência retroativa é permitida de propósito
- [ ] Apague o campo de vigência e tente salvar `recusar`
      → o campo é obrigatório; forçando pela API, "Data no formato AAAA-MM-DD"
- [ ] No diálogo de meta, troque o escopo para "Filial Norte" e leia o aviso antes de salvar `criar`
      → o aviso diz com todas as letras que meta por unidade NÃO é apurada; salve e o chip da unidade aparece com farol cinza e o texto "sem apuração por unidade"
- [ ] Confira o valor do <select> de escopo pelo inspetor do navegador `escopo`
      → o valor é o ID do estabelecimento (ou 'global'), nunca o nome da unidade
- [ ] ⚠ Renomeie "Filial Norte" para "Filial Norte II" em /estrutura e volte a /metas `cadeia`
      → o chip da meta mostra o NOME NOVO e continua sendo a mesma meta; no histórico, a versão antiga guarda o nome CONGELADO de quando foi pactuada
      *custou:* antes da migration 0049 o escopo era o NOME da unidade: renomear órfãva a meta e ela ficava imortal na tela
- [ ] Inative em /estrutura uma unidade que tem meta ativa e volte ao diálogo de meta daquele indicador `borda`
      → a unidade continua no seletor com o sufixo "(unidade inativada)", justamente para dar para encerrar a meta dela
- [ ] Com a unidade inativada selecionada e SEM meta ativa nela, tente criar uma meta nova `recusar`
      → recusa "Unidade inativada: defina a meta em uma unidade ativa."
- [ ] Com um escopo que tem meta ativa, clique em "Encerrar meta deste escopo" `editar`
      → o chip some do cartão e no histórico a versão aparece como encerrada — nenhuma linha é apagada (o banco tem trigger que proíbe DELETE)
- [ ] Clique em "Encerrar meta deste escopo" duas vezes seguidas (a segunda depois de a primeira ter passado) `recusar`
      → 404 "Não há meta vigente neste escopo."
- [ ] Troque a meta de vagas_no_prazo de 80 para 101 e recarregue `numero`
      → o farol vira VERMELHO na hora (real 100% < meta 101%) — o farol é confronto de número com meta, não decoração
- [ ] Coloque a meta de ferias_vencidas em 10 e recarregue `numero`
      → o farol vira VERDE, porque a direção é "quanto menor, melhor" e 5 ≤ 10 — prove que a direção manda no farol, não o sinal
- [ ] Abra duas abas em /metas, clique em "Alterar meta" do mesmo indicador nas duas e salve nas duas `borda`
      → a segunda recebe 409 "Outra versão desta meta foi salva ao mesmo tempo. Recarregue a página e tente novamente."
- [ ] Depois de salvar uma meta, abra a trilha de alterações com o admin `trilha`
      → DUAS linhas na mesma transação: a versão anterior indo de Ativa para Encerrada com o motivo, e a nova versão com Indicador, Escopo, Meta (de → para) e Início de vigência
- [ ] Desligue temporariamente a rota de valores (ou apenas observe um banco sem apuração) e recarregue /metas `borda`
      → a página NÃO quebra: as linhas ficam com "sem dados" e o catálogo continua utilizável

## Relatórios — /relatorios (piso de anonimato k, quatro abas e o recorte dos três campos)

**Entre como:** rh@, dp@, diretora.pessoas@ e lider_td@ (têm relatorio.ver); gestor@ e funcionario@ (não têm); admin (tem privacidade.administrar)

- [ ] Entre como gestor@ e digite /relatorios na barra `recusar`
      → volta para a home — negado; e chamando /api/relatorios/diversidade direto, 403, não uma lista vazia
- [ ] ⚠ Entre como rh@, abra a aba Diversidade e procure qualquer recorte com 1, 2, 3 ou 4 pessoas `numero`
      → nenhum: recorte pequeno aparece como "menos de 5" e sem barra. Um "1" aqui é reidentificação
      *custou:* piso de anonimato k=5 — é a regra que impede o relatório de apontar uma pessoa pelo cruzamento gênero × faixa de idade
- [ ] Combine os três filtros (registro + lotação + centro de custo) até sobrar um grupo bem pequeno e olhe a aba Diversidade `numero`
      → a supressão tem de ENDURECER com o recorte, não afrouxar: cortar o quadro por três campos só deixa os grupos menores
- [ ] Recorte o headcount numa unidade, vá para a aba Diversidade e volte para Headcount `borda`
      → o recorte dos três campos vale para as QUATRO abas ao mesmo tempo e não é perdido ao trocar de aba
- [ ] ⚠ Entre como admin (g.dearodrigurs@gmail.com / 123456) e abra /relatorios para mexer no piso de anonimato `administravel`
      → ACHADO ESPERADO: volta para a home. O admin é o ÚNICO papel com privacidade.administrar, mas não tem relatorio.ver — e o formulário do k só existe dentro da aba Diversidade de /relatorios
      *custou:* o único controle de privacidade administrável do sistema é inalcançável de fábrica: quem tem a chave não tem a tela, e quem tem a tela não tem a chave
- [ ] Com o admin, entre em /perfis, conceda relatorio.ver ao papel admin, saia, entre de novo e abra a aba Diversidade `administravel`
      → agora o bloco "Piso de anonimato (k)" aparece com o valor atual, o intervalo permitido e quem alterou por último
- [ ] Digite 1 no piso de anonimato e salve `recusar`
      → recusa "O piso mínimo é 2: com 1 não haveria supressão nenhuma"
- [ ] Digite 101 no piso e salve `recusar`
      → recusa "O piso máximo é 100: acima disso todo recorte sai suprimido"
- [ ] Digite 20, salve e observe as abas Diversidade e Composição familiar sem sair da tela `administravel`
      → as duas recarregam sozinhas com mais recortes suprimidos e o texto passa a dizer "menos de 20" — a mudança tem de ser visível no mesmo lugar onde ela age
- [ ] ⚠ Leia a nota abaixo do campo do piso e confira, uma a uma, as telas listadas nela `cadeia`
      → o k tem de valer também no card de diversidade e no eNPS do painel executivo, no agregado por unidade do check-in de clima e em todo recorte da pesquisa de clima — inclusive no aviso de anonimato que o respondente lê
      *custou:* antes da migration 0045 o k alcançava só três lugares: quem digitava 20 saía achando que mudara a política inteira enquanto clima e pesquisa seguiam publicando com 5
- [ ] Devolva o k para 5 e abra a trilha com o admin `trilha`
      → audit.alteracao com ação privacidade.minimo_por_recorte.alterar, tabela sistema.parametro_privacidade e diff "Piso de anonimato (k): 20 → 5"
- [ ] Vá para a aba Composição familiar e procure onde mudar o piso que governa aquela tabela `administravel`
      → ACHADO ESPERADO: o formulário do k só é renderizado na aba Diversidade, embora a supressão de "Mães/Pais/Outro" desta aba responda ao mesmo parâmetro
- [ ] Procure, na aba Diversidade, onde criar ou renomear uma faixa de idade (por exemplo separar 55–64 de 65+) `administravel`
      → ACHADO ESPERADO: as cinco faixas são fixas no código (FAIXAS_IDADE) — não há tela
- [ ] Procure onde acrescentar uma opção à lista de gênero autodeclarado `administravel`
      → ACHADO ESPERADO: a lista é fixa (feminino, masculino, outro, não informado), no código e no CHECK do banco
- [ ] Na aba Composição familiar, procure onde mudar a idade que define "criança" `administravel`
      → ACHADO ESPERADO: 12 anos é fixo no código (IDADE_LIMITE_CRIANCA); a tela só exibe o número
- [ ] Abra as abas Diversidade e Composição familiar e depois procure a trilha de leitura sensível `trilha`
      → duas linhas: relatorio.diversidade e relatorio.composicao_familiar, ambas com a chave relatorio.ver e o alvo "agregado"
- [ ] Abra as abas Aniversariantes e Headcount e confira a mesma trilha `trilha`
      → NENHUMA linha nova — não há dado de categoria especial nesses dois, e a trilha não deve inchar por leitura banal
- [ ] Na aba Aniversariantes, procure o ano de nascimento de alguém `escopo`
      → só dia e mês; o ano não entra (não é preciso saber a idade para parabenizar)
- [ ] Na aba Aniversariantes, confira o contador de "fichas sem data de nascimento" com o filtro de uma unidade só `numero`
      → o número tem de ser o do MESMO recorte, não o da empresa toda
- [ ] Na aba Headcount, some "por registro", depois "por lotação" e depois "por centro de custo" `numero`
      → as três somas dão o mesmo total do quadro por caminhos diferentes — são três perguntas, não a mesma repetida; desligados não entram
- [ ] Recorte por uma empresa do grupo sem ninguém lotado e percorra as quatro abas `borda`
      → estado vazio explícito em cada uma ("Ninguém faz aniversário neste mês dentro deste recorte.", "Sem dados.") — nunca tela em branco nem erro
- [ ] Leia a caixa "Pedidos que dependem de módulo futuro" no rodapé `administravel`
      → cinco itens escritos, entre eles treinados por curso e processos trabalhistas; é honestidade sobre a base, mas a lista é texto fixo no código e não se edita pela tela

## Portal do gestor — /portal-gestor (equipe, banco de horas, alertas e o seletor de gestor)

**Entre como:** gestor@ (própria equipe, 11 ativos), dp@/diretora.pessoas@/rh@/lider_td@ (alcance todos), recrutador@ e funcionario@ (sem acesso)

- [ ] Entre como gestor@ e abra /portal-gestor — deve mostrar a própria equipe e NENHUM seletor de gestor `numero`
      → 11 liderados ativos, contadores de afastados e em férias, e o cabeçalho com o nome dele
- [ ] Como gestor@, acrescente ?gestor_id=<id de outro gestor> à URL e recarregue `escopo`
      → o parâmetro é IGNORADO em silêncio e a tela continua sendo a equipe dele — não é negociação, é ausência de alcance
- [ ] Entre como dp@ e abra /portal-gestor — o seletor de gestor deve aparecer `escopo`
      → lista de gestores com equipe; como o DP não lidera ninguém, abre no primeiro gestor com equipe em vez de um portal vazio
- [ ] Entre como recrutador@ e digite /portal-gestor na barra `recusar`
      → volta para a home (não tem rh.colaborador.ver); /api/portais/gestor responde 403 "Sem permissão para ver equipes."
- [ ] Entre como funcionario@ e faça o mesmo `recusar`
      → mesmo resultado — negado
- [ ] Como gestor@, percorra o portal inteiro procurando qualquer valor de salário, faixa salarial ou remuneração `escopo`
      → nenhum: o portal do gestor não tem campo de remuneração em bloco nenhum
- [ ] Como gestor@, olhe a coluna Situação de um liderado afastado `escopo`
      → só a etiqueta "Afastado" — sem tipo, sem motivo e sem CID, com a nota de rodapé explicando que dado de saúde não passa por aqui
- [ ] Como gestor@, abra o bloco "Banco de horas do time" `numero`
      → saldo por liderado em horas, quem está "estourando" segundo o limite da REGRA de cada pessoa (não um número fixo na tela), e nenhum valor em reais
- [ ] Compare o "Saldo somado do time" com a soma dos saldos individuais listados `numero`
      → tem de bater exatamente
- [ ] Como gestor@, leia a memória de cálculo do bloco de turnover e refaça a conta no papel `numero`
      → desligados ÷ headcount médio ((início + fim) ÷ 2) × 100, com os números da equipe dele na janela de 12 meses
- [ ] Como dp@, escolha no seletor um gestor cuja equipe não teve desligamento e headcount zero na janela `numero`
      → percentual NULO com a frase "Headcount médio zero na janela — sem denominador não há percentual (e não é 0%)" — nunca 0%
- [ ] Como gestor@ (que não tem sst.ver), confira o bloco de alertas de ASO da própria equipe `escopo`
      → o bloco APARECE: o gestor vê vencimento de ASO dos próprios liderados pela relação vigente, sem a chave de SST
- [ ] Como dp@ (com sst.ver), escolha no seletor um gestor de outra área e confira o bloco de ASO `escopo`
      → aparece porque o DP tem a chave; tire sst.ver do papel dp em /perfis e repita — o bloco tem de SUMIR ao abrir o portal de terceiro
- [ ] ⚠ Como gestor@ (sem admissao.ver), confira o bloco de marcos de experiência 45/90 da própria equipe `escopo`
      → aparece: a decisão de efetivar ou desligar antes do marco (CLT 445/451) é do gestor, então ela não pode depender de uma chave do RH
      *custou:* ficava sem alerta justamente quem tem o prazo legal correndo
- [ ] Tire ferias.aprovar do papel gestor em /perfis e reabra o portal como gestor@ `recusar`
      → o bloco de férias SOME inteiro. Confira se a tela deixa claro que é falta de acesso e não que não há férias programadas — bloco ausente não pode parecer bloco vazio
- [ ] Como gestor@, procure na lista da equipe alguém que esteja registrado em outro CNPJ do grupo `escopo`
      → a coluna Empresa mostra o nome e uma etiqueta "Outro CNPJ" — o líder aprova férias e lê ASO de gente de outra empresa e precisa saber disso
- [ ] Como gestor@, olhe o bloco de alertas de feedback vencido `numero`
      → aparecem os liderados com mais de 90 dias sem conversa formal; quem nunca teve feedback conta desde a admissão, não some da lista
- [ ] Como gestor@, procure nota ou percentual nos itens do bloco de avaliações `escopo`
      → nenhum: só o tipo do ciclo, a situação (pendente/rascunho/enviada) e o prazo — resultado é avaliacao.resultado.ver, com trilha, em outra tela
- [ ] Entre como admin (que não tem ficha de colaborador) e abra /portal-gestor `borda`
      → 404 "Sua conta não está ligada a uma ficha de colaborador — escolha um gestor para abrir o portal." — mensagem que diz o que fazer, não erro cru
- [ ] Leia o bloco de treinamentos no fim do portal `borda`
      → caixa vazia e honesta explicando que o controle vive no Sults; ela fica na tela em vez de sumir
- [ ] Procure na tela onde configurar as janelas de alerta do portal (90 dias de férias, 15 dias de experiência, 30 dias de ASO, 12 meses de turnover, 90 dias de cadência de feedback) `administravel`
      → ACHADO ESPERADO: nenhuma delas tem tela — são constantes no código

## Portal do colaborador — /portal-colaborador (visão de primeira pessoa e defesa contra IDOR)

**Entre como:** funcionario@, e depois cada uma das outras personas para comparar

- [ ] Entre como funcionario@ e abra /portal-colaborador — deve trazer os dados dele sem exigir chave nenhuma `escopo`
      → cartão "Meus dados" com matrícula, cargo, lotação, tempo de casa e gestor; toda sessão autenticada tem direito ao próprio portal
- [ ] Acrescente ?colaborador_id=<id de outra pessoa> à URL e recarregue `escopo`
      → nada muda: continua o próprio portal. A rota não lê parâmetro nenhum — o furo clássico não tem por onde nascer
- [ ] Percorra o portal inteiro procurando salário, faixa salarial ou valor de holerite `escopo`
      → ausente por desenho; o que aparece de dinheiro é só o valor/desconto dos benefícios DELE
- [ ] Entre como diretora.pessoas@ (que tem documento.ver.todos) e abra o bloco "Meus documentos" `escopo`
      → só os documentos DELA, não o GED da empresa — o portal é a pasta da pessoa, e documento sensível fica de fora mesmo assim
- [ ] ⚠ Tire ferias.programar do papel funcionario em /perfis e reabra o portal `recusar`
      → ACHADO ESPERADO: o cartão de Férias simplesmente desaparece, sem uma linha dizendo que faltou permissão — a tela não distingue "você não tem acesso" de "não há nada aqui"
      *custou:* tela vazia faz o usuário achar que não há dado; negação diz que ele não tem acesso — a diferença que o dono cobrou
- [ ] Abra o bloco de avaliações como funcionario@ `escopo`
      → só o FATO (houve um ciclo deste tipo e ele fechou nesta data) com rótulo pobre de propósito — nunca nota, percentual ou "aguardando decisão"
- [ ] Entre como uma pessoa que já foi transferida entre empresas do grupo e olhe "Meus dados" `cadeia`
      → aparece a lista de contratos anteriores com matrícula, empresa, admissão e desligamento — o portal não pode calar sobre o contrato anterior no dia da transferência
- [ ] Entre como admin (sem ficha de colaborador) e abra /portal-colaborador `borda`
      → 409 "Sua conta não está vinculada a uma ficha de colaborador — procure o DP."
- [ ] Como funcionario@ com um período aquisitivo vencido, leia o alerta do bloco de férias `numero`
      → texto crítico citando quantos períodos venceram e a data do mais antigo, mandando procurar o gestor ou o DP (art. 137 — pagamento em dobro)
- [ ] Como funcionario@, responda o check-in do dia pelo cartão de clima `criar`
      → o aviso de transparência aparece antes; o cartão passa a "respondido" e as perguntas pendentes vão a zero
- [ ] Peça a adesão a um benefício elegível pelo portal e volte ao portal sem o DP ter efetivado `borda`
      → o mesmo benefício não é oferecido de novo — vem marcado como solicitação pendente
- [ ] Confira se o CPF de algum dependente aparece no bloco de benefícios `escopo`
      → não aparece: só nome, parentesco e nascimento, por minimização de dado de terceiro
- [ ] Abra o portal com um documento ainda sem ciência e confira as duas listas `cadeia`
      → o documento está em "aguardando ciência"; depois de dar ciência em /documentos, ele migra para "com ciência" com a data

## Notificações — /notificacoes e o sino do cabeçalho

**Entre como:** gestor@ e funcionario@ em janelas separadas, para ver os dois lados do mesmo aviso

- [ ] Entre como gestor@ e abra /notificacoes — deve listar só as notificações dele `escopo`
      → nenhuma notificação de outra pessoa; não existe parâmetro de usuário na API
- [ ] Como funcionario@, abra uma programação de férias que precise de aprovação; depois entre como gestor@ e olhe o sino `cadeia`
      → badge com contagem e o aviso "Demanda aguardando sua aprovação" com o número da demanda e o link — sem o motivo, sem valor e sem dado de saúde
- [ ] Como gestor@, aprove a programação; volte a funcionario@ e olhe o sino `cadeia`
      → "Programação de férias aprovada" com as datas e link para /ferias
- [ ] ⚠ Percorra TODAS as suas notificações procurando "R$", um número no formato 1.234,56, a palavra CID, diagnóstico, laudo, ou uma nota de avaliação `escopo`
      → nenhuma pode conter isso — o serviço recusa a emissão com esses padrões e o dado tem de ficar na tela de destino, atrás da permissão da rota
      *custou:* aviso de notificação é lido no push e na tela de bloqueio do celular; um valor de salário ali vaza fora de qualquer controle de acesso
- [ ] Clique numa notificação não lida com link `editar`
      → ela vira lida, o contador do sino cai em 1 e o navegador vai para a tela do link; recarregue para confirmar que a leitura persistiu
- [ ] Clique numa notificação cujo link leve a uma tela que a sua persona NÃO pode abrir `recusar`
      → a tela de destino tem de NEGAR (voltar para a home ou responder 403), nunca abrir vazia — o aviso é neutro justamente porque a permissão é conferida no destino
- [ ] Clique em "Marcar todas como lidas" `editar`
      → o subtítulo passa a "Você está em dia com as suas notificações.", o badge do sino some e a resposta traz nao_lidas = 0
- [ ] Numa conta com mais de 20 notificações, role até o fim da lista `borda`
      → botão "Carregar mais" (a página é de 20 por vez, por cursor); clicando, entram as próximas sem repetir nenhuma já exibida
- [ ] Abra /notificacoes numa conta nova, sem nenhuma notificação `borda`
      → "Nenhuma notificação por aqui. Quando algo precisar da sua atenção, o aviso aparece nesta página e no sino do cabeçalho." — vazio explicado, não tela em branco
- [ ] Pelo console do navegador, faça POST em /api/notificacoes/ler com o id de uma notificação de OUTRA pessoa `escopo`
      → responde ok mas com marcadas = 0 — o UPDATE filtra por usuario_id da sessão e o id alheio simplesmente não afeta nada
- [ ] Faça POST em /api/notificacoes/ler com a lista vazia e depois com 501 ids `recusar`
      → 400 "Informe ao menos uma notificação" e 400 "Lote grande demais"
- [ ] Deixe a tela aberta por dois minutos com uma notificação nova sendo criada em outra janela `borda`
      → o sino atualiza sozinho em até 60 segundos; se a rede falhar, o sino mantém o estado anterior e nunca quebra a página
- [ ] Depois de marcar várias como lidas, procure essas ações na trilha de alterações `trilha`
      → NÃO devem aparecer: marcar lida é decisão registrada como não auditável, para a trilha não inchar com ruído
- [ ] Procure na tela onde configurar quantas notificações vêm por página ou de quanto em quanto tempo o sino atualiza `administravel`
      → ACHADO ESPERADO: 20 por página e 60 segundos são constantes no código, sem tela

## Bordas de sessão, URL direta e troca de persona (vale para todas as telas do escopo)

**Entre como:** duas personas com alcances diferentes, na mesma janela e em janelas anônimas

- [ ] Copie a URL /painel-executivo e cole numa janela anônima sem login `recusar`
      → redirecionado para /entrar; chamando /api/painel-executivo, 401 {"erro":"Não autenticado"}
- [ ] Entre como gestor@ numa aba, deixe /portal-gestor aberto, entre como dp@ na mesma janela e volte à primeira aba para recarregar `borda`
      → o cookie foi substituído: a primeira aba passa a mostrar o portal do DP (com seletor de gestor), não a equipe do gestor. Se sobrar conteúdo do gestor, é vazamento de cache
- [ ] Com uma sessão válida, edite um caractere do cookie fp_sessao no devtools e recarregue /metas `borda`
      → volta para /entrar (assinatura inválida = sem sessão); as APIs respondem 401
- [ ] Apague o cookie fp_sessao e recarregue qualquer tela do escopo `borda`
      → /entrar em todas; a duração da sessão é de 8 horas e não há tela para mudar isso
- [ ] Clique em Sair e depois no botão "voltar" do navegador `borda`
      → a tela protegida não pode reaparecer com dado: ao recarregar, /entrar. Confira também que o sino não volta a buscar notificações
- [ ] Com cada persona, digite na barra as cinco URLs do escopo (/painel-executivo, /metas, /relatorios, /portal-gestor, /portal-colaborador) e anote o resultado de cada par `escopo`
      → gestor: metas SIM (só leitura), portal-gestor SIM, portal-colaborador SIM, painel e relatórios NÃO. recrutador: só portal-colaborador. dp: todas. Cada NÃO tem de ser um redirect para a home, não uma tela vazia
- [ ] Chame /api/identidade/sessao sem cookie e com cookie `escopo`
      → 401 sem cookie; com cookie, o payload traz usuario_id, papel e nome — e nunca a senha nem o segredo TOTP
- [ ] Numa sessão pendente de 2FA, tente cada URL do escopo `recusar`
      → todas redirecionam para /configurar-2fa e todas as APIs respondem 403 — exceto /trocar-senha e as rotas de 2FA

## Cadeias entre módulos — o que você faz aqui e onde tem de aparecer lá

**Entre como:** dp@ e gestor@ alternando, com o painel executivo e /metas abertos para conferir o efeito

- [ ] Responda o check-in de clima como funcionario@ e recarregue o painel executivo e a /metas `cadeia`
      → card de Clima: respostas dos últimos 30 dias +1 e a média recalculada; em /metas, o indicador adesao_checkin muda de valor e pode mudar de farol
- [ ] Aprove uma programação de férias como gestor@ e depois confira portal do gestor, notificações e /metas `cadeia`
      → a pessoa sai de "em risco" e entra em "programadas" no portal; o solicitante recebe notificação; ferias_vencidas em /metas só muda quando o período for efetivamente gozado — confira que o absenteísmo do painel NÃO muda (férias não é afastamento)
- [ ] Feche uma competência de folha como dp@ e recarregue o painel executivo `cadeia`
      → o card de custo sai de "Sem fonte" para número, a série ganha um ponto novo e o indicador folha_no_prazo em /metas recalcula contra a meta de 98%
- [ ] Conclua uma admissão e confira headcount, tempo de contratação, portal do gestor e turnover `cadeia`
      → headcount +1 na data de hoje; se a vaga veio de requisição aprovada, o card de tempo de contratação ganha um caso; a equipe do gestor de destino ganha um liderado; o headcount_fim do turnover muda o denominador
- [ ] Encerre um desligamento e confira as mesmas quatro telas `cadeia`
      → headcount −1, série de desligamentos com um ponto a mais no mês, turnover sobe, o liderado some do portal do gestor (a relação de liderança é encerrada junto com o contrato) e o indicador entrevista_desligamento em /metas recalcula
- [ ] Encerre uma pesquisa de clima com pergunta de 0 a 10 e recarregue o painel executivo e /metas `cadeia`
      → o eNPS aparece no card de Clima SÓ se as respostas forem ≥ ao piso k; em /metas, o indicador enps é confrontado com a meta 30 (o semeado dá ~25, farol vermelho)
- [ ] ⚠ Crie em /folha/parametros uma rubrica de FGTS com código diferente de 3001 e depois feche uma competência com ela; volte ao painel executivo `cadeia`
      → ACHADO ESPERADO: o custo do painel perde o encargo de FGTS em silêncio — o código da rubrica está fixo no código do painel (RUBRICA_FGTS = "3001"), não vem do cadastro
      *custou:* defeito de dinheiro: o número que a diretoria leva para a reunião passa a ser menor que o real, sem nenhum aviso na tela
- [ ] Promova alguém pela cadeia de dois níveis e, depois de a movimentação ser APLICADA, recarregue o painel executivo `cadeia`
      → o card de promoções conta +1 só depois da aplicação (pedido aprovado e não aplicado não muda a vida de ninguém e não entra); transferência de unidade é contada à parte
- [ ] Transfira alguém entre empresas do grupo e confira portal do gestor, portal do colaborador e o rateio de custo do painel `cadeia`
      → no portal do gestor o liderado ganha a etiqueta "Outro CNPJ"; no portal dele aparecem os contratos anteriores; no rateio de custo do painel a linha muda de lotação — mas continua sem dizer o CNPJ
- [ ] Mude o piso k em /relatorios e, na mesma sessão, recarregue painel executivo, /clima e /pesquisas `cadeia`
      → as três telas têm de responder ao MESMO parâmetro; qualquer uma que continue publicando com o k antigo é regressão da migration 0045

---

# Anexo · O que não é administrável

Ordenado por frente. Cada linha diz **o que o usuário não consegue fazer** por causa disso —
que é o critério para decidir se vira onda ou não.

## Núcleo

- **Os 8 papéis de acesso (funcionario, gestor, rh, recrutador, lider_td, dp, diretoria, admin)** — `src/dominios/identidade/esquemas.ts:5 e o CHECK em db/migrations/0019_perfis.sql:43`
  O administrador não cria, não renomeia e não exclui perfil pela tela. /perfis move chaves entre os 8 fixos; qualquer papel novo ("Analista de C&S", "BP de RH") exige migration. O próprio código admite: papel fora do CHECK aparece só para conferência e "o caminho para corrigir é migration, não a interface" (src/dominios/usuarios/servico.ts:234)
- **Troca de papel de um usuário já existente** — `src/app/usuarios/painel-usuarios.tsx:91 (a tela só chama alternarAtivo) contra src/dominios/usuarios/esquemas.ts:47 (a API aceita papel)`
  Não há como promover ou rebaixar uma conta pela tela — o único botão é Ativar/Desativar. Para mudar o papel de alguém é preciso criar outra conta ou mexer na API/banco
- **Cadência de feedback formal = 90 dias** — `src/dominios/colaboradores/esquemas.ts:296`
  Prazo de negócio chumbado. Ele decide o chip "feedback 90d vencido" na lista e na ficha, a cadência da aba Feedbacks e, no dobro (180 dias), o alerta grave do portal do gestor (src/dominios/portais/servico.ts:572). O RH não consegue afrouxar para 120 nem apertar para 60 sem dev
- **Tipos de vínculo (CLT, estagiário, aprendiz, PJ, temporário)** — `src/dominios/colaboradores/esquemas.ts:4 e o CHECK em db/migrations/0001_fundacao.sql:66`
  Não dá para acrescentar "intermitente", "terceirizado", "jovem aprendiz de 4h" nem renomear os existentes. O campo aparece na admissão, na edição da ficha, no RCF (contrato previsto) e no relatório de headcount por vínculo
- **Status do colaborador (ativo, afastado, desligado)** — `src/dominios/colaboradores/esquemas.ts:14 e o CHECK em db/migrations/0001_fundacao.sql:70`
  Nenhum status novo ("em experiência", "aviso prévio trabalhado") pode ser criado pela tela, e os rótulos exibidos são fixos
- **Motivos de mudança de posição (admissão, promoção, mérito, reajuste, enquadramento, transferência)** — `src/dominios/colaboradores/esquemas.ts:339`
  O DP não consegue acrescentar "dissídio", "equiparação salarial" ou "correção de erro de cadastro" — o motivo é o rótulo que separa promoção de reajuste no histórico e no evento da linha do tempo
- **Classificações de ocorrência (positivo, negativo, neutro, alerta)** — `src/dominios/colaboradores/esquemas.ts:267 e o CHECK em db/migrations/0002_nucleo_pessoas.sql:207`
  O RH não cria uma classificação própria ("advertência formal", "elogio de cliente") nem renomeia as quatro existentes
- **Tipos de empresa do grupo (matriz, filial)** — `src/dominios/estrutura/esquemas.ts:31 e o CHECK em db/migrations/0047_estrutura_registro_lotacao_centro_custo.sql:184`
  Não dá para classificar uma empresa como "holding", "CD" ou "prestadora" pela tela de estrutura, embora tudo o mais nela (nome, CNPJ, situação) seja administrável
- **Código do centro de custo, depois de criado** — `src/dominios/estrutura/servico.ts:273-282 (só o NOME é versionado) e a tela em src/app/estrutura/painel-estrutura.tsx:951 (só o botão Renomear)`
  Um código digitado errado ("CC-100" no lugar de "CC-1000") não tem correção nenhuma pela tela. O único caminho é inativar e criar outro, e toda alocação já gravada continua apontando o código errado, inclusive nas folhas fechadas
- **Lista de gêneros autodeclarados** — `src/dominios/colaboradores/esquemas.ts:37`
  As quatro opções do formulário de admissão e de edição são fixas; o RH não pode acrescentar opção nem mudar rótulo
- **Faixas etárias do relatório de diversidade e o limite de idade de "criança" (12 anos)** — `src/dominios/colaboradores/esquemas.ts:587 e :604`
  O corte das cinco faixas (até 24, 25-34, 35-44, 45-54, 55+) e a idade que define criança na composição familiar não se ajustam pela tela — só o piso de anonimato (k) é administrável
- **Profundidade máxima da hierarquia do organograma = 20 níveis** — `src/dominios/organograma/esquemas.ts:25`
  Se a rede crescer além de 20 níveis, a descida é interrompida e as pessoas sobem para a raiz com aviso — sem nenhum lugar na tela para elevar o teto
- **Agrupamento e ordem das chaves na tela /perfis** — `src/dominios/usuarios/esquemas.ts:92 (GRUPOS_POR_PREFIXO) e :133 (ORDEM_GRUPOS)`
  Chave criada por migration nova cai num balaio "Outros" no fim da tela até alguém mapear no código — já aconteceu com as 10 chaves de ponto, promoção/transferência e painel executivo, que ficaram no pior lugar para o administrador encontrar
- **Lista de chaves consideradas SENSÍVEIS (o selo em /perfis e, por tabela, quem é obrigado a usar 2FA)** — `src/dominios/usuarios/esquemas.ts:217 (CHAVES_SENSIVEIS), lida em OU com sistema.permissao.exige_2fa por src/dominios/identidade/servico.ts:48`
  O administrador vê o selo mas não decide quem o tem. Metade da regra de 2FA está em lista de TypeScript e só a outra metade (exige_2fa) mora no banco — mexer em quem precisa de segundo fator ainda depende de dev na maioria dos casos
- **Teto de salário aceito (R$ 9.999.999) e formato da matrícula (só dígitos, até 10)** — `src/dominios/colaboradores/esquemas.ts:362 e :144`
  Empresa que use matrícula com letra ou prefixo ("SUP-1005") não consegue cadastrar pela tela, e o teto de salário não se ajusta

## Ponto, banco de horas, espelho, parâmetros do ponto e meu-ponto

- **Âncora da escala (ancora_escala) — o primeiro dia de plantão do ciclo, que é o que permite ao motor saber se a terça era plantão ou folga** — `src/dominios/ponto/esquemas.ts:426 (esquemaNovaEscala não tem o campo) e src/dominios/ponto/repositorio.ts:392 (inserirEscala não grava a coluna)`
  Toda escala de 12x36 ou escala livre criada pela tela nasce com âncora NULL. O plantonista que NÃO bate ponto num dia de plantão fica com previsto ZERO, sem falta, sem DSR e sem NENHUMA linha na fila do DP — o dia some calado. É o buraco que a migration 0034 documenta como corrigido, e que voltou pelo caminho da tela.
- **Casos de teste do motor (rh.caso_teste_ponto) — acrescentar, editar ou desativar um caso** — `src/app/api/ponto/suite/route.ts:14 (só POST de execução; não há POST/PATCH/DELETE de caso) e src/app/ponto/parametros/painel-parametros.tsx:368 (só o botão "Rodar bateria")`
  O DP não consegue acrescentar um caso quando descobre um cenário novo. A bateria é justamente a peça que impede número de negócio de voltar ao código, e ela só cresce por INSERT em SQL — que o dono não vai fazer.
- **Lançamento manual no banco de horas (compensação, ajuste, expiração pontual, rescisão)** — `src/app/api/ponto/banco/route.ts:12 existe e valida limites, mas nenhuma tela em src/app o chama`
  O DP não consegue registrar a folga acordada com o gestor, nem corrigir um saldo, nem fazer o acerto de rescisão sem passar por fora do sistema. A única escrita de banco alcançável pela tela é a expiração em massa.
- **Extrato do banco de horas de uma pessoa (movimento a movimento)** — `src/app/api/ponto/banco/[colaboradorId]/route.ts existe; nenhuma tela o consome (grep de "/api/ponto/banco" em src/app só acha expiracao)`
  O espelho mostra só o saldo total. Nem o DP nem o trabalhador conseguem ver de onde veio o número — que crédito é de qual apuração, o que foi compensação, o que foi transporte de implantação.
- **Desfecho "Corrigida" de uma intercorrência — o único que o sistema CONFERE rodando o motor no dia** — `src/app/ponto/painel-ponto.tsx:350 (tratar() só aceita "justificada" | "ignorada") e src/app/ponto/espelho/[colaboradorId]/espelho-ponto.tsx (a tabela de intercorrências não tem ação nenhuma)`
  Depois de gravar a batida que faltava, o DP não tem como fechar a linha como corrigida pela tela — ele acaba marcando "justificada", que assume o fato DE PÉ. Toda a guarda de conferirDia (servico.ts:2239) é inalcançável pela interface.
- **Apurar UMA pessoa (o serviço aceita colaborador_id)** — `src/dominios/ponto/esquemas.ts:611 (esquemaApurarCompetencia aceita colaborador_id) e src/app/ponto/painel-ponto.tsx:443 (o botão chama apurar() sem argumento)`
  Reapurar uma única correção obriga a rodar a competência inteira, com a trava de (pessoa, competência) presa para todos durante a rodada.
- **Encerrar ou excluir uma JORNADA pela tela** — `src/app/ponto/parametros/painel-parametros.tsx:1098 (a única ação da linha é "Nova versão"); não existe rota DELETE nem PATCH de encerramento em src/app/api/ponto/parametros/jornadas/`
  Uma jornada criada por engano fica ativa para sempre e continua no seletor de escala. Só some empilhando uma versão nova por cima — e a errada continua respondendo pelo passado.
- **Encerrar ou excluir uma REGRA de banco de horas pela tela** — `src/app/ponto/parametros/painel-parametros.tsx:1674 (só "Nova versão"); src/app/api/ponto/parametros/regras/route.ts só tem POST`
  Uma regra criada no escopo errado (cargo em vez de unidade, por exemplo) vence para sempre a regra da empresa naquele recorte — não há como devolver o cargo ao padrão.
- **Encerrar uma ESCALA sem apontar outra jornada** — `src/dominios/ponto/servico.ts:276 (definirEscala sempre encerra a anterior E abre uma nova); não há rota de encerramento`
  Quem entra em afastamento longo continua com escala vigente e continua entrando na apuração todo mês, gerando falta ou intercorrência.
- **Editar ou renomear um FERIADO cadastrado errado** — `src/app/api/ponto/parametros/feriados/ tem POST e [id]/DELETE, não tem PATCH`
  Corrigir a data ou o nome exige apagar e recriar — e o apagar é DELETE de verdade da linha, não encerramento por vigência como no resto do módulo.
- **Histórico dos lotes de importação e o relatório completo de um lote antigo** — `src/app/api/ponto/importacoes/route.ts (GET de lotes) e src/app/api/ponto/importacoes/[id]/route.ts existem; nenhuma tela os chama`
  O relatório linha a linha das rejeições só existe na tela enquanto a página não for recarregada. O DP que fechar a aba perde o motivo de cada linha rejeitada.
- **Apelidos de tipo de marcação que o importador aceita (E, S, I, F, "saida almoco"…)** — `src/dominios/ponto/esquemas.ts:585 (APELIDOS_TIPO_MARCACAO, mapa fixo no código)`
  Relógio de outro fabricante que cuspir outro código de tipo faz o arquivo inteiro ser rejeitado, e não há como cadastrar o apelido novo pela tela — depende de alterar o fonte.
- **Teto da fila de intercorrências (500 linhas) e o limite de 4 MB do arquivo de importação** — `src/dominios/ponto/repositorio.ts:1663 (LIMITE_FILA_INTERCORRENCIAS) e src/dominios/ponto/esquemas.ts:578`
  Menor gravidade — o número CHEGA a quem lê (o total real e a data da mais antiga vêm junto), então não engana. Mas continua sendo um limite que o DP não regula, e o arquivo de um mês de 700 pessoas pode encostar nos 4 MB.

## Folha de pagamento

- **A lista de códigos de rubrica que o motor e a importação do ponto procuram pelo NOME (1001, 1101, 1102, 1103, 1201, 1202, 2001, 2002, 2101, 3001)** — `src/dominios/folha/esquemas.ts:145-179 (CODIGO_*, CODIGOS_AUTOMATICOS, CODIGOS_DO_MOTOR)`
  O usuário não pode dizer que a hora extra da empresa dele é a 1105, nem encerrar/substituir nenhuma dessas dez rubricas: o botão Encerrar nem aparece e a API recusa. Toda a integração ponto→folha e o motor dependem desses dez códigos serem exatamente esses
- **Renomear rubrica (nome, código ou natureza) depois de criada** — `src/dominios/folha/servico.ts:1377 (só criarRubrica) e src/app/api/folha/parametros/rubricas/[id]/route.ts:12 (o único PATCH é o de encerramento)`
  Uma rubrica criada com nome errado só pode ser encerrada e recriada com OUTRO código — o código antigo fica queimado para sempre (é UNIQUE). O dono pediu explicitamente adicionar, excluir e RENOMEAR livremente
- **A marca de "exceção" da rubrica (o que decide se ela vai por último na lista com aviso de verba genérica)** — `src/dominios/folha/servico.ts:1374-1375 ("marcar/desmarcar excecao ainda é operação de migração")`
  Se o DP criar hoje uma verba de escape nova, ela vai aparecer misturada com as rubricas próprias, sem o aviso; e não há como tirar 9001/9002 da lista de exceção se a política mudar
- **Conferir uma versão de tabela legal que não é a vigente HOJE** — `src/dominios/folha/servico.ts:1357 (montarVisaoParametros usa hojeParaFolha) e src/app/folha/parametros/painel-parametros.tsx:378 (o botão só nasce para a versão do cartão)`
  Competência de ano futuro fica impossível de APROVAR: a tabela que vai calculá-la não tem botão de conferência até o ano virar. Pior: publicar a tabela do ano seguinte encerra a anterior, e conferir versão encerrada é recusado — se a anterior não estava conferida, a competência calculada com ela nunca mais é aprovável
- **A regra do DSR sobre faltas: 1 dia de DSR por dia de falta** — `src/dominios/folha/calculo.ts:408-418`
  Empresa cuja convenção apure o DSR semana a semana (Lei 605/49) não tem como ajustar: o número sai do motor, sem parâmetro e sem tela. A apuração exata está declarada como evolução F2
- **O prazo do indicador "folha no prazo": dia 5 do mês seguinte** — `src/dominios/folha/repositorio.ts:1930 (INTERVAL '4 days' somado ao 1º do mês seguinte, dentro do SQL)`
  Empresa com prazo interno diferente (dia 3, dia 10) vê um indicador que mede outra coisa, e não há tela nem parâmetro para mudar
- **A trava retroativa: nunca abrir competência anterior ao mês corrente** — `src/dominios/folha/servico.ts:191-202 e esquemas.ts:99-108`
  Migração de sistema, primeira carga histórica ou correção de mês passado ficam impossíveis pela tela — não existe permissão de exceção nem justificativa auditada. O próprio código registra isso como caminho futuro, não como implementado

## Avaliação 360, clima (check-in), pesquisas estruturadas, recrutamento & seleção e documentos (GED)

- **Perguntas do check-in diário de clima (rh_clima.pergunta_versao) — hoje 2 perguntas ativas, semeadas pela migration** — `db/migrations/0004_clima.sql (CREATE TABLE rh_clima.pergunta_versao + seed estrutural); leitura em src/dominios/clima/repositorio.ts:61`
  Não há tela, rota nem API para criar, renomear, reordenar ou encerrar uma pergunta do check-in. O RH não consegue trocar a pergunta do dia sem migration — e o semeador declara explicitamente que não mexe no catálogo porque a versão publicada é imutável por trigger.
- **Etapas de seleção do kanban (rh.etapa_selecao_versao) — Triagem, Entrevista com o RH, Entrevista com o gestor, Oferta** — `db/migrations/0012_recrutamento.sql:226 (INSERT do catálogo); src/dominios/recrutamento/repositorio.ts:161 lista, sem rota de escrita`
  O recrutador não consegue acrescentar "Teste técnico", "Dinâmica" ou "Entrevista com o diretor", nem renomear ou reordenar as quatro existentes. O tipo é CHECK fechado no banco ('triagem','entrevista_rh','entrevista_gestor','oferta'), então nem uma etapa nova cabe. A tabela tem versão e vigência prontas — falta a tela.
- **Categorias de documento do GED — Contrato, Holerite, Política, Comunicado, Atestado, Outro** — `src/dominios/documentos/esquemas.ts:3 (CATEGORIAS_DOCUMENTO)`
  O RH não consegue criar "Advertência", "Termo de entrega de EPI", "ASO" ou "Aviso de férias" pela tela; tudo que não cabe nas seis vira "Outro" e o acervo perde a classificação.
- **Catálogo de motivos de reprovação/desistência de candidatura (Lei 9.029)** — `src/dominios/recrutamento/esquemas.ts:90 (MOTIVOS_MOVIMENTACAO)`
  A empresa não acrescenta nem renomeia motivo de desfecho de seleção. Aqui a rigidez é defensável (motivo de desfecho negativo não pode ser texto livre), mas a decisão de QUAIS motivos existem hoje é do código, não do RH.
- **Motivos de requisição de vaga (Reposição / Aumento de quadro) e origens de candidato (Indicação / Site / Portal externo / Outro)** — `src/dominios/recrutamento/esquemas.ts:6 e :49`
  Não dá para acrescentar "Substituição temporária", "Projeto", "LinkedIn" ou "Feira de emprego" — e origem de candidato é justamente o dado que mede canal de captação.
- **Tipos de pesquisa (anual / pulse / eNPS) e tipos de pergunta (escala 1–5, nota 0–10, texto livre, escolha única)** — `src/dominios/pesquisas/esquemas.ts:12 e :34`
  O RH não cria um tipo "Onboarding" ou "Saída", nem um tipo de pergunta "múltipla escolha" ou "escala 1–10".
- **Status do plano de ação (Aberto / Em andamento / Concluído / Cancelado)** — `src/dominios/pesquisas/esquemas.ts:68 (STATUS_PLANO)`
  Não dá para criar um estado "Aguardando orçamento" ou "Suspenso", que é o que acontece de verdade com plano de ação de clima.
- **Escala e vocabulário da avaliação: nota de 1 a 5 (NOTA_MINIMA/NOTA_MAXIMA), as 4 recomendações de faixa e as 5 decisões humanas** — `src/dominios/avaliacao/esquemas.ts:97-98, :41 (RECOMENDACOES) e :57 (DECISOES)`
  Os pilares, indicadores, pesos e rótulos de faixa SÃO administráveis pela tela — mas a escala 1–5 e a lista de decisões possíveis não. A empresa não adota escala 1–10 nem cria a decisão "Promover".
- **Mapa de quais decisões CONTAM como alinhadas a cada recomendação — é ele que define quando a justificativa vira obrigatória** — `src/dominios/avaliacao/esquemas.ts:81 (DECISOES_ALINHADAS)`
  A política de "quando exigir justificativa" é do código. Se a empresa decidir que manter alguém numa faixa de recuperação exige justificativa (hoje exige) ou não (hoje não dá para afrouxar), não há tela para mudar.
- **Janela de 30 dias do painel de clima, recorte "recente" de 7 dias e a queda de 0,3 ponto que destaca a unidade** — `src/dominios/clima/servico.ts:31, :33 e :56`
  O gestor não escolhe o período do painel nem o que conta como queda relevante. O piso de anonimato foi parametrizado (0044/0045); estes três não.
- **Limite de 500 respostas na consulta de clima individual, sem paginação e sem aviso de corte** — `src/dominios/clima/repositorio.ts:332 (LIMIT 500)`
  A Diretoria de Pessoas pode consultar um período longo, ver 500 linhas e acreditar que viu tudo — a tela não diz que houve corte nem oferece a próxima página.
- **Alerta de prazo da avaliação: 10 dias (avaliação) e 10 dias (marcos de experiência)** — `src/dominios/avaliacao/esquemas.ts:101 (DIAS_ALERTA_PRAZO) e src/dominios/admissao/esquemas.ts:68`
  O RH não regula quando o painel começa a alertar sobre um ciclo prestes a vencer.
- **Retenção do consentimento LGPD do candidato: 6 meses fixos** — `src/dominios/recrutamento/esquemas.ts:66 (MESES_CONSENTIMENTO_PADRAO)`
  A empresa não define pela tela a política de retenção do banco de talentos — só dá para digitar a data caso a caso, sem padrão configurável.
- **Limite de 10 MB por documento e janela de 12 meses do indicador de vagas no prazo** — `src/dominios/documentos/esquemas.ts:23 (+ CHECK em db/migrations/0006_documentos.sql:20) e src/dominios/recrutamento/repositorio.ts:969`
  O limite de arquivo está em dois lugares (código e CHECK do banco) e mudá-lo exige migration; a janela do indicador de R&S não é escolhida por quem lê o indicador.

## SST (ASO, NR-1, EPI, CAT) e Benefícios (catálogo, elegibilidade, adesão, dependentes)

- **As faixas do painel de vencimento — "vencidos", "vence em 30 dias", "vence em 31–60 dias" — para ASO e para NR-1** — `src/dominios/sst/servico.ts:359-360 (somarDias(hoje, 30) e somarDias(hoje, 60))`
  O DP não consegue mudar a antecedência do alerta pela tela. Se a clínica pede agendamento com 90 dias, o painel continua avisando com 60 e o exame vence antes da vaga. É o mesmo defeito das faixas de férias, no mesmo formato
- **Catálogo de EPI: só dá para ACRESCENTAR. Não há renomear, editar CA/validade, desativar nem excluir** — `src/app/api/sst/epis/route.ts (só GET e POST) — a coluna rh.epi_item.ativo existe (db/migrations/0014_sst.sql:60) e nenhuma rota a altera`
  EPI cadastrado com nome errado ou CA errado fica assim para sempre e continua sendo oferecido no select de entrega; item descontinuado não sai de circulação; CA vencido não pode ser bloqueado. Contraria diretamente "adicionar, excluir e renomear livremente"
- **Tipos de ASO (admissional, periódico, demissional, retorno ao trabalho, mudança de riscos)** — `src/dominios/sst/esquemas.ts:5 e CHECK em db/migrations/0014_sst.sql:26`
  Não dá para criar um tipo de exame novo (ex.: "monitoração pontual" ou exame por convenção coletiva) sem migration
- **Resultados do ASO (apto, inapto, apto com restrições)** — `src/dominios/sst/esquemas.ts:23 e CHECK em db/migrations/0014_sst.sql:32`
  Nenhum resultado novo é cadastrável pela tela
- **Classificações de risco da NR-1 (baixo, moderado, alto, crítico)** — `src/dominios/sst/esquemas.ts:50 e CHECK em db/migrations/0029_sst_nr1.sql:47`
  A escala do questionário psicossocial é fixa. Se a empresa executora entregar outra escala, ela não cabe no sistema
- **Tipos de CAT (típico, trajeto, doença) e status da CAT (registrada, encaminhada)** — `src/dominios/sst/esquemas.ts:231 e :241; CHECKs em db/migrations/0014_sst.sql:150 e :154`
  Não dá para acrescentar um estado intermediário do processo (ex.: "aguardando laudo médico") nem um tipo próprio
- **Prazo legal de transmissão da CAT (1º dia útil seguinte; imediato em óbito)** — `src/app/sst/painel-sst.tsx:2088-2089 e :692 — é texto fixo na tela, não parâmetro`
  Nenhuma CAT atrasada é destacada e o prazo não pode ser ajustado. O sistema informa o prazo mas não cobra
- **Teto de 999 unidades por entrega de EPI e teto de 4.000 caracteres da descrição da CAT / 2.000 das restrições e observações clínicas** — `src/dominios/sst/esquemas.ts:217, :268, :120, :76`
  Limites operacionais que o DP não ajusta. O de 4.000 é o mais relevante: é onde cabe todo o quadro clínico, e é o campo que a listagem devolve sem cifra
- **Corrigir ou excluir um ASO ou uma avaliação NR-1 já gravada** — `src/app/api/sst/asos/route.ts e src/app/api/sst/psicossociais/route.ts (só GET e POST; nenhuma rota PATCH/DELETE)`
  ASO lançado com data ou validade errada não tem conserto pela tela — nem correção, nem substituição encadeada como a CAT tem. Ele vai continuar mandando no painel de vencimento e no indicador
- **Categorias de benefício (VT, VR/VA, Saúde, Odonto, Convênio, Outro)** — `src/dominios/beneficios/esquemas.ts:11 e CHECK em db/migrations/0009_beneficios.sql:36`
  Previdência privada, seguro de vida, auxílio-creche e auxílio home office não têm categoria própria — todos caem em "Outro", e relatórios por categoria perdem sentido
- **Lista de parentescos de dependente (filho, cônjuge, outro)** — `src/dominios/beneficios/esquemas.ts:41 e CHECK em db/migrations/0009_beneficios.sql:123`
  Não cobre o que a Receita reconhece para dedução de IRRF (companheiro, enteado, filho universitário até 24, irmão/neto sob guarda, pais e avós dentro do limite de renda, menor pobre criado e educado, tutelado incapaz). Tudo vira "Outro", e o DP não consegue nem renomear a opção
- **Dimensões do critério de elegibilidade: só tipo de vínculo e unidade** — `src/dominios/beneficios/esquemas.ts:104 (esquemaCriterio, strictObject com tipos_vinculo e unidades)`
  Regras corriqueiras não são cadastráveis: "plano de saúde a partir de 6 meses de casa", "VT só para quem não tem carro", "apartamento para a liderança", "regra por centro de custo" ou "por empresa do grupo". Hoje isso só existe como valor escrito à mão em cada adesão, sem regra que o sustente
- **Status da adesão (ativa, suspensa, cancelada) — e a suspensão sem par de datas** — `src/dominios/beneficios/esquemas.ts:31; consequência documentada em src/dominios/folha/repositorio.ts:772-779`
  Não dá para criar um estado novo, e a suspensão não tem início nem fim: ela é bandeira de HOJE. Suspender em agosto apaga o desconto de julho numa reimportação da folha
- **Cadastro do próprio dependente pelo titular** — `src/app/api/beneficios/dependentes/route.ts:32 (POST exige adesao.gerir) e src/app/beneficios/painel-beneficios.tsx:1303`
  O colaborador que teve um filho não consegue incluí-lo — precisa abrir demanda e esperar o DP digitar. Uma das observações de adesão semeadas é exatamente esse pedido
- **Não existe tela nenhuma para a trilha (audit.leitura_sensivel e audit.alteracao)** — `src/app — nenhuma rota /auditoria; as únicas menções são frases explicativas em ficha-colaborador.tsx:1126 e :1871`
  Tudo o que o sistema promete sobre rastro de leitura de dado de saúde e de dependente só é conferível por linha de comando (db/consultar.js). O dono não consegue auditar pela tela quem leu o quê — que é justamente o que a LGPD pede que se demonstre
- **Nenhuma lista destas duas telas tem paginação, filtro por colaborador ou busca** — `src/dominios/sst/repositorio.ts:119 (listarAsos), :540 (listarEntregasEpi), :651 (listarCats) e src/dominios/beneficios/repositorio.ts:413 (listarAdesoesVigentes) — todas sem LIMIT`
  Com 60 pessoas já são ~200 cartões de adesão e ~55 ASOs carregados de uma vez; com o quadro real da empresa a tela para de abrir. E cada carga de /sst grava uma linha de trilha por CAT, mesmo sem abrir a aba

## Painel executivo, metas e indicadores, relatórios, portais, notificações, entrada e 2FA

- **Piso de anonimato (k): o formulário só existe dentro da aba Diversidade de /relatorios, cuja página exige `relatorio.ver` — e o único papel com `privacidade.administrar` é `admin`, que não tem `relatorio.ver`** — `fast-pessoas/src/app/relatorios/page.tsx:22 (gate por relatorio.ver) + fast-pessoas/src/app/relatorios/painel-relatorios.tsx:604 (bloco só na aba diversidade) + fast-pessoas/db/migrations/0044_privacidade_e_chaves_sensiveis.sql:185 (chave só para admin)`
  de fábrica NINGUÉM consegue mudar o k pela tela: quem tem a chave é barrado na porta da página, e quem entra na página não tem a chave. Só sai do impasse quem souber ir antes a /perfis conceder relatorio.ver ao papel admin
- **Unidade de medida do indicador — apenas '%', 'qtd' e 'dias'** — `fast-pessoas/src/dominios/indicadores/esquemas.ts:3 + CHECK em fast-pessoas/db/migrations/0005_metas_indicadores.sql:18`
  não dá para criar indicador em R$, em horas ou em pontos. O eNPS, que é PONTOS de −100 a +100, é publicado com rótulo de percentual porque não havia outra opção — o próprio código admite isso em valores.ts:108
- **Direção do indicador — apenas 'maior' e 'menor'** — `fast-pessoas/src/dominios/indicadores/esquemas.ts:7 + CHECK em fast-pessoas/db/migrations/0005_metas_indicadores.sql:19`
  indicador cuja meta é uma FAIXA (ex.: absenteísmo entre 2% e 4%) não tem como ser expresso; o farol sempre compara com um limite só
- **Renomear, editar a descrição ou inativar um indicador do catálogo** — `fast-pessoas/src/app/api/indicadores/route.ts (só GET e POST — não há PUT/PATCH/DELETE) e coluna rh.indicador.ativo em fast-pessoas/db/migrations/0005_metas_indicadores.sql:20`
  indicador criado com nome ou área errados fica para sempre na tela da diretoria. A permissão se chama literalmente 'Criar/editar indicadores' mas o editar não existe em lugar nenhum
- **Registry das FONTES de valor dos indicadores (qual indicador tem número apurado)** — `fast-pessoas/src/dominios/indicadores/valores.ts:35`
  todo indicador criado pela tela nasce e morre com 'sem dados' — nunca ganha farol, e a tela não avisa que isso é permanente
- **Registry de fontes RECORTADAS POR UNIDADE — está vazio** — `fast-pessoas/src/dominios/indicadores/valores.ts:178`
  toda meta por estabelecimento pactuada pela tela sai eternamente como 'sem apuração por unidade': dá para cobrar a Matriz, mas ninguém mede a Matriz
- **Faixas de idade dos relatórios e do card de diversidade (até 24, 25–34, 35–44, 45–54, 55+)** — `fast-pessoas/src/dominios/colaboradores/esquemas.ts:587`
  o RH não consegue separar 55–64 de 65+ (aposentadoria) nem criar faixa própria; a análise de diversidade fica presa ao corte que o desenvolvedor escolheu
- **Lista de gêneros autodeclarados (feminino, masculino, outro, não informado)** — `fast-pessoas/src/dominios/colaboradores/esquemas.ts:37`
  não dá para acrescentar ou renomear opção pela tela, nem no cadastro nem no relatório
- **Idade que define 'criança' na composição familiar — 12 anos** — `fast-pessoas/src/dominios/colaboradores/esquemas.ts:604`
  o número que define o público-alvo de benefício infantil (creche, kit escolar) não se ajusta pela tela; a tela só exibe o 12
- **Código da rubrica de FGTS usado pelo painel executivo — a string '3001'** — `fast-pessoas/src/dominios/painel-executivo/esquemas.ts:23 (consumido em painel-executivo/repositorio.ts:345 e :366)`
  se o DP cadastrar a rubrica de FGTS com outro código pela tela de parâmetros da folha, o custo de pessoal do painel perde o encargo e mostra um número MENOR que o real, sem nenhum aviso
- **Janelas do painel executivo — 12 meses de série e 30 dias de janela do check-in de clima** — `fast-pessoas/src/dominios/painel-executivo/servico.ts:55 e :57`
  a diretoria não escolhe o período comparado; querer trimestre ou 24 meses exige mexer no código
- **Janelas de alerta do portal do gestor — 90 dias de férias, 12 meses de turnover, 15 dias de antecedência do marco de experiência, 30 dias de ASO, 30 dias de atraso do marco** — `fast-pessoas/src/dominios/portais/esquemas.ts:40, :43, :50, :53 e fast-pessoas/src/dominios/portais/servico.ts:56`
  o líder não ajusta a antecedência com que é avisado; empresa que precise de 45 dias para decidir efetivação não tem como configurar
- **Cadência de feedback (90 dias) e janela de alerta de férias do portal do colaborador (90 dias)** — `fast-pessoas/src/dominios/colaboradores/esquemas.ts:296 e fast-pessoas/src/dominios/portais/colaborador-esquemas.ts:271`
  a política de conversas formais da empresa está escrita no código, não no cadastro; mudar de trimestral para bimestral é tarefa de desenvolvedor
- **Duração da sessão (8 horas) e política de senha (mínimo 12 caracteres, sem expiração, sem histórico e sem bloqueio por tentativas)** — `fast-pessoas/src/lib/sessao.ts:10 e fast-pessoas/src/dominios/identidade/esquemas.ts:33 (e a ausência de qualquer contador em fast-pessoas/src/dominios/identidade/servico.ts:74)`
  o dono não consegue endurecer nem afrouxar a própria política de acesso pela tela; e não há teto de tentativas de login — força bruta contra os papéis que entram só com senha (gestor e funcionario) não encontra barreira nenhuma
- **Lista de padrões antivazamento das notificações (R$, CID, diagnóstico, nota, resposta de clima)** — `fast-pessoas/src/dominios/notificacoes/servico.ts:24`
  o dono não consegue acrescentar um termo proibido do próprio negócio (ex.: nome de um plano de saúde) sem mexer no código
- **Paginação das notificações (20 por vez) e intervalo de atualização do sino (60 segundos)** — `fast-pessoas/src/dominios/notificacoes/servico.ts:16 e fast-pessoas/src/app/sino-notificacoes.tsx:13`
  nenhuma tela permite ajustar quantos avisos vêm por página nem com que frequência o sino consulta o servidor

---

## Como anotar o que você achar

1. **Em que tela**, e **com qual persona**
2. **O que você esperava** e **o que apareceu**
3. Se for número errado, **o número** — foi assim que quase todo defeito grande deste projeto caiu

Um "achei estranho" sem número também vale: metade dos achados começou assim.
