# Caderno do teste — o que o dono foi encontrando

> Anotado ao vivo enquanto ele passa o sistema a limpo, a partir de 02/08/2026.
> Ordem cronológica, não por importância. O que vira onda se decide depois.

---

## ✅ Funciona

**`/estrutura` — criar empresa e centro de custo.**
Primeira vez que a tela é exercitada por gente: nasceu na onda I e até então só tinha sido vista
por agente.

---

## 📐 Decisão — o critério do "nada chumbado"

O dono corrigiu uma leitura minha que estava larga demais. Quando ele disse, no começo do projeto,
*"não quero elas chumbadas no código, quero que os usuários possam adicionar excluir e renomear
elas livremente"*, ele falava de **dado de configuração** — empresa, filial, endereço, rubrica —
com um objetivo prático: **o cliente para de pedir ao programador para acrescentar mais uma linha
numa lista.**

O critério que separa as duas coisas:

> **Acrescentar um item muda o comportamento do sistema?**

| | Exemplo | Onde vive |
|---|---|---|
| **Não muda** — é configuração | filial nova, endereço, rubrica, cargo, tipo de documento | **tela** |
| **Muda** — é regra de negócio | vínculo "intermitente" (muda jornada, férias e folha), piso de anonimato | **código**, com onda |

Uma filial a mais é só mais uma opção na lista. Um vínculo a mais é regra de cálculo nova.

**Consequência:** dos 81 itens que a varredura de 02/08 marcou como "não administrável", boa parte
não é problema — são justamente os da segunda coluna. A lista precisa ser relida com este critério
antes de virar trabalho.

---

## 🔧 Requisito — o operador cria o perfil, e decide o que ele vê

Das duas metades, **uma existe e a outra não**:

- ✅ **Compor as chaves de um perfil** — em `/perfis` o operador tira `folha.ver` do `dp`, dá
  `rh.colaborador.ver.todos` ao `lider_td`, monta o que quiser. Vale na hora seguinte, sem
  programador. É a parte difícil, e está pronta.
- ❌ **Criar um perfil novo** — não dá. Um perfil "remuneração", que veja folha e não veja
  desligamento, exige migration. A lista dos 8 papéis está travada em dois lugares:
  `src/dominios/identidade/esquemas.ts:5` (enum) e o `CHECK` da migration 0019.

Palavra do dono: *"a liberdade de falar esse perfil pode isso e aquele não pode é justamente a
liberdade que quero dar para o operador"*.

**Tamanho:** menor do que parece. A permissão já é por chave, numa tabela composta — o papel hoje é
só um rótulo travado. Falta: tirar o papel do enum e virar tabela; tela para criar, renomear e
encerrar; e duas travas — não apagar perfil com gente dentro, e não apagar o último perfil que tem
`perfil.administrar`, senão alguém se tranca para fora do sistema.

---

## 📐 Decisão — o organograma é aberto, e começa no macro

Palavra do dono:

> *"qualquer pessoa pode ver o organograma da empresa toda, de forma macro, para todos poderem ter
> noção do tamanho de empresa, e caso desejam podem ir abrindo as áreas setores para ver quem está
> lá dentro"*

**Não é vazamento de escopo — é a regra.** Fica registrado para ninguém "corrigir" isso depois: o
organograma é a única tela do sistema em que o alcance NÃO segue o recorte das outras. O `gestor` vê
11 colaboradores em `/colaboradores` e a empresa inteira aqui, **de propósito**, e o objetivo é
declarado: dar a todos a noção do tamanho da empresa.

**Duas coisas que essa decisão exige e que valem escrever agora:**

1. **O que aparece em cada nó é público.** Se todo mundo vê a árvore inteira, nome e cargo estão
   certos ali — salário, dado de saúde e motivo de desligamento não podem encostar nesta tela, nem
   em tooltip, nem no payload da rota. Vale como caso de teste permanente.
2. **A tela some se a navegação não prestar.** Uma árvore aberta a todos é, por definição, a maior
   de todas — não há recorte para diminuí-la.

---

## 🔧 Organograma — a navegação é o trabalho

A árvore está desenhada e correta; o problema é que ela não é **navegável**. E, com a decisão acima,
isso deixa de ser conforto e vira a função da tela.

**A forma que o dono descreveu:** abre no **macro** — áreas e setores, não pessoas — e quem quiser
**vai abrindo** para ver quem está dentro.

Isso muda o padrão de partida. Hoje a árvore desenha tudo e o usuário se vira; o desenho pedido é o
inverso: **nasce fechada, no nível de área**, e cada nó diz **quantos há embaixo** antes de abrir —
porque o número é a "noção de tamanho" que o dono quer dar.

Prioridade, derivada do que ele disse:

| | |
|---|---|
| **1. recolher e expandir**, com contagem no nó fechado | é a forma pedida |
| **2. abrir no nível de área/setor**, não de pessoa | é o padrão de partida |
| 3. busca que centraliza na pessoa e abre o caminho até ela | complementa |
| 4. zoom e arrastar, ou árvore na horizontal | conforto |
| 5. exportar ou imprimir o recorte | depois |

**Resolvido — não existe nó de área, e não precisa existir.** Palavra do dono:

> *"o que manda no organograma é o gestor imediato (inclusive é válido colocar esse nome)"*

A árvore é **gente → gente**, pela `relacao_gestor` que já existe. Então "abrir a área" é abrir o
**gestor imediato**: cada nó fechado é uma pessoa, e o número que ele mostra é quanta gente há
abaixo dela **na cadeia inteira**, não só os diretos.

Isso simplifica muito — nenhum conceito novo, nenhuma migration de estrutura. E é coerente com a
regra de salário que o dono já tinha fixado em 31/07: *"uma pessoa vê o salário de todos abaixo
imediatamente dela"*, que é a mesma sub-árvore recursiva.

**Vocabulário:** usar **"gestor imediato"** na tela, por pedido explícito. Hoje o sistema mistura
"gestor" e "líder" em lugares diferentes; o termo passa a ser um só.

---

## 🔧 Benefício — revisão de valor: decisão tomada e nunca construída

Categoria diferente de "achado": está **registrada como decisão** em dois documentos
(`00_contexto/decisoes_arquiteturais.md:301` e `docs/10:33`, ambos da reunião de diretoria) —
*"Revisão de valor de benefício: o DP aprova"* — e nunca virou tarefa.

**O que existe:** o fluxo de solicitação, com **duas naturezas apenas** —
`NaturezaSolicitacao = "adesao" | "cancelamento"` (`beneficios/esquemas.ts:260`). O colaborador pede
adesão, o DP efetiva e escolhe o valor nesse momento.

**O que falta:** mudar o valor de uma adesão **já vigente**. Não existe `alterarValor` nem natureza
de revisão. Hoje o caminho é cancelar e recriar — o que quebra a vigência e polui o histórico.

**Tamanho:** pequeno. Uma natureza `revisao_valor` a mais, o campo de valor novo na solicitação, e a
mesma tela de efetivar/negar que já existe. A aprovação está construída e se reaproveita inteira.

**A perguntar depois:** quantas outras decisões daquela reunião ficaram registradas sem virar
tarefa? Vale uma varredura no log de decisões.

---

## 🔧 Feedback estruturado — a maior peça desta rodada

Hoje `rh.feedback_formal` (migration 0002) tem **um campo**: `resumo`, texto solto. Dá para registrar
que aconteceu, e nada mais. Não dá para comparar, nem para saber se um gestor dá feedback raso, nem
para levar nada disso à avaliação.

### Onde ele mora: dentro da avaliação, não ao lado

O sistema já tem **duas** máquinas de "montar formulário → responder → ler resultado":

| | Estrutura | Onde |
|---|---|---|
| Avaliação 360 | modelo → pilar → indicador → resposta, com faixa de resultado | migration 0011 |
| Pesquisa | pesquisa → pergunta → resposta | migration 0022 |

Uma terceira faria o sistema ter **três jeitos de fazer a mesma coisa**, e toda regra nova teria de
ser feita três vezes — ou ficaria em duas e faltaria na terceira. Foi assim que este projeto ganhou
duas listas de papéis em arquivos diferentes.

**Decidido: reaproveitar o motor da avaliação.** Ele já é modelo **versionado** (feedback antigo não
muda quando o modelo muda — obrigatório para algo que vai à ficha da pessoa), já tem pilar e
indicador (a forma "assunto → pergunta"), e já tem faixa de resultado (feedback com nota entra de
graça).

### Subcategorias

Palavra do dono: avaliação passa a ter subcategoria. E o sistema **já tem esse eixo**: o tipo hoje
vale `experiencia` (aberta pela admissão) e `desempenho`.

| Subcategoria | Situação |
|---|---|
| avaliação de experiência | existe |
| **feedback** | a construir |
| **outras** | *"não sei exatamente o porquê, mas gosto de deixar preparado para exceção"* |

### Quem abre o quê — e este é o coração do desenho

| Quem abre | O quê | Gatilho |
|---|---|---|
| **o sistema** | feedback | o prazo estourou |
| **o RH** | 360 | ciclo, em lote |
| **o RH** | pontual | quando quiser saber algo específico |

Palavra do dono: *"toda e qualquer pessoa deve ter um feedback aberto para o seu gestor imediato
quando bate o prazo máximo, e o que deve apitar para o RH são os atrasados"*.

O RH **não acompanha feedback** — ele só olha os atrasados.

**Metade disso já existe.** O sistema guarda `ultimo_feedback_em`, tem a cadência, e o cartão do
colaborador já mostra o chip *"feedback 90d vencido"*. **O alarme existe; a tarefa não.** Hoje o chip
aparece e nada acontece — ninguém recebe nada para responder. O trabalho é fazer a detecção que já
roda **abrir uma avaliação** endereçada ao gestor imediato.

### O prazo é administrável, e por cargo

Os 90 dias estão em `colaboradores/esquemas.ts:296`, chumbados. Pelo critério do próprio dono isso é
**configuração** — mudar de 90 para 120 não cria capacidade, ajusta o relógio. Decidido: **o RH
define, e por cargo.**

---

## 🔧 Modelo de avaliação por cargo — o buraco que o dono achou

> *"a avaliação de um gerente precisa ser muito mais profunda e complexa do que a de um faxineiro"*

**Modelos existem** (`rh.modelo_avaliacao_versao`), são versionados, e o ciclo **congela** qual
modelo usou. Isso está certo.

**O problema é onde o modelo é escolhido: por CICLO, não por pessoa.** Todo mundo dentro do mesmo
ciclo responde o mesmo formulário — o gerente e o faxineiro, igual.

**O trabalho:** escolher o modelo por **cargo** (ou por nível do cargo), e o ciclo passar a carregar
um conjunto de modelos em vez de um só. O **RCF do cargo** já existe e já descreve os requisitos —
é o lugar natural para dizer qual modelo se aplica. E é o mesmo lugar onde o prazo de feedback por
cargo vai morar.

**Separado disso:** *"elas sempre devem ter a estrutura de fit cultural (precisamos melhorar)"* —
isso é **conteúdo** do modelo, não estrutura. Quando chegar a hora é sentar e reescrever as
perguntas, sem tocar em código.

---

## 🔧 Painel de clima — filtros, com o anonimato tratado junto

> *"olhando o painel do clima agora gostei MUITO, era o que eu imaginei"*

Pedido: filtrar por **centro de custo**, **lotação** e **gestor**. Acrescentados por sugestão e
aceitos: **cargo** e **tempo de casa em faixas** — que costuma ser o corte mais revelador em clima,
porque quem entrou há três meses responde diferente de quem tem cinco anos.

### A tensão, e como fica resolvida

**Cada filtro novo aproxima o painel de identificar uma pessoa.** Com quatro filtros combináveis,
chega-se a "o único Vendedor da Loja Centro sob o gestor Marcos" — que é uma pessoa, e o painel
estaria dizendo o que ela respondeu.

E há um furo mais sutil, que o piso sozinho não pega: **pedir dois recortes e subtrair.** Ver "Loja
Centro" (10 pessoas, aparece), depois "Loja Centro + Vendedor" (6, aparece) — a diferença entrega o
grupo de 4 que deveria estar suprimido.

**Decidido com o dono:**

1. o piso vale sobre o **recorte final combinado**, nunca sobre cada filtro isolado;
2. recorte pequeno demais mostra **"recorte pequeno demais"**, não "nenhum resultado" — a segunda
   frase faz a pessoa achar que ninguém respondeu;
3. **gênero e faixa etária ficam de fora desta tela.** São os dois vetores clássicos de
   reidentificação, e num quadro de 70 pessoas cruzar gênero com lotação já isola gente.

---

## 🐞 Conta sem ficha: umas telas barram, outras deixam passar

Achado durante o teste, com a conta admin (`g.dearodrigurs@gmail.com`, `pessoa_id = null`, zero
vínculos — é conta de sistema, criada pelo `seed-admin.js`, não é gente da Fast).

**As telas discordam sobre o que fazer com ela:**

| Tela | O que faz |
|---|---|
| `/portal-colaborador` | **barra** — 409 "Sua conta não está vinculada a uma ficha" |
| `/ferias` e check-in de clima | **barram** — mesma trava, mesma mensagem |
| abertura de demanda | **deixa passar** |

E o resultado disso está no banco: a **DEM-0069** nasceu com `solicitante_colaborador_id = null`,
enquanto as vizinhas (DEM-0067 e 0068) têm o vínculo preenchido. A demanda está *em atendimento*,
com atendente designado, e **não aponta para colaborador nenhum**. Se o DP concluir, a adesão a
benefício seria criada para ninguém.

**Três coisas para consertar, em ordem de gravidade:**

1. **Abrir demanda exige vínculo** — a mesma trava que o portal já aplica. Hoje o buraco produz
   demanda órfã, e ela já está no banco.
2. **O menu oferece o que não funciona** — o atalho "Meu portal" aparece no cabeçalho para conta que
   nunca vai poder abrir. Ou some para quem não tem ficha, ou avisa antes do clique.
3. **A mensagem manda procurar o DP** — para conta administrativa isso não faz sentido; o dono está
   acima do DP. A frase certa seria "esta é uma conta administrativa, sem ficha de colaborador",
   sem mandar procurar ninguém.

---

## 🔧 Demandas — "Concluir" vira "Aprovar"

Pedido do dono na tela de detalhe da demanda. E há um motivo além do gosto: **o par atual está
desequilibrado.** "Recusar" é o oposto de "Aprovar", não de "Concluir" — a tela hoje mistura um verbo
de decisão com um de execução, e é isso que soa estranho.

**A conferir antes de trocar:** `/demandas` é fila genérica — atende ajuste de ponto, férias, adesão
a benefício e movimentação. Em algumas dessas o DP **decide** (aprova), em outras ele **executa**
(conclui). Vale ver se "Aprovar" serve para todos os tipos ou se o rótulo deve vir do tipo da
demanda.

---

## ❓ Dúvidas respondidas (sem virar trabalho)

**Onde se cria lotação** — na mesma tela `/estrutura`, aba **Lotações**. "Lotação" é o nome novo do
que o banco ainda chama `estabelecimento`; o dado é o mesmo, o rótulo é que mudou na onda I.

**O que é "abrir em lote"** na avaliação — um clique abre o ciclo para **todo colaborador ativo que
tenha gestor**, de uma vez, em vez de criar de um em um. E ele **nomeia quem ficou de fora** (os sem
gestor vigente) em vez de deixar sumir em silêncio.

---

## 📄 Documentos — assinatura de verdade, em dois momentos

Nasceu de uma pergunta do dono: *"como podemos dar mais legitimidade que a pessoa assinou o
documento? existe alguma maneira de dar mais autenticidade que a pessoa que assinou realmente é ela,
e não apenas a empresa 'fabricando provas'?"*

**O problema é real e não se resolve por dentro:** quem guarda a prova é quem tem interesse nela.
Nenhuma engenharia interna fecha isso — o banco é da empresa. Por isso a saída é tirar a prova de
identidade de dentro de casa.

### O que já existe e é mais forte do que parece

`rh.ciencia` guarda o **hash SHA-256 do documento no instante da ciência**, com trigger de
imutabilidade (`0006_documentos.sql:34-46`). Isso já impede o ataque mais óbvio: a empresa **não
consegue trocar o documento depois** e dizer que a pessoa assinou aquilo. Se o arquivo mudar, o hash
não bate e a fraude fica provada **contra a própria empresa**.

O que o hash **não** prova é *quem estava no teclado*.

### A decisão: dois tipos de documento

| Modo | Para quê | O que grava |
|---|---|---|
| **Ciência** | comunicado, informativo, aviso | hash + quem + quando *(já existe)* |
| **Assinatura gov.br** | o que o jurídico julgar de **extrema importância** | o PDF assinado + verificação de identidade |

Regra fechada com o dono: **marcou "exige gov.br", o upload só aceita PDF.** A assinatura gov.br
trabalha sobre PDF (padrão PAdES); Word teria de ser convertido antes, e é mais honesto recusar.

O atrito dos quatro passos (baixar → gov.br → assinar → subir) foi avaliado e **aceito** — justamente
porque esse tipo é exceção, não rotina.

### Em dois momentos — e o momento A não é "olhar o PDF"

**Momento A — um humano do DP/RH valida.** Sem integração nenhuma.

O procedimento não é "abrir e ver se parece assinado". É **subir o arquivo em
`validar.iti.gov.br`** — o validador oficial e gratuito do ITI, que aceita PAdES, assinatura gov.br e
ICP-Brasil, e mostra **quem assinou**. Isso dá ao DP um procedimento concreto e defensável.

O que o sistema precisa gravar para isso valer alguma coisa: **quem validou, quando, e o nome/CPF que
apareceu no validador.** Sem esses três campos, o momento A é um clique; com eles, é um ato auditável.

**A análise prévia que o dono pediu** — para o caso de a pessoa simplesmente não assinar e mandar o
arquivo assim mesmo — é barata e não depende de integração: **um PDF assinado carrega um dicionário
de assinatura com `/ByteRange` e `/Type /Sig`; um PDF sem assinatura não tem nenhum dos dois.** Uma
varredura nos bytes do arquivo já recusa o "não tem nada aí" antes de gastar o tempo do DP.

**Momento B — integração.** O que a máquina passaria a conferir sozinha é a única coisa que importa
de verdade: **o CPF do certificado bate com o CPF da pessoa em `rh.pessoa`?** Sem essa conferência,
alguém assina no lugar de outro e o sistema aceita.

Nos certificados de pessoa física da ICP-Brasil o CPF vem na extensão `otherName`, OID
**`2.16.76.1.3.1`** — 8 posições de data de nascimento (ddmmaaaa) seguidas de 11 posições de CPF.

⚠ **A conferir antes de codar:** a assinatura avançada do gov.br **não é** o mesmo que um e-CPF
ICP-Brasil, e não está confirmado que ela usa exatamente essa codificação. **O jeito mais barato de
resolver isso é o dono assinar um documento qualquer no gov.br e guardar o arquivo como referência**
— cinco minutos dele eliminam todo o chute.

**Ressalva que não é minha para dar:** o peso jurídico disso é pergunta para o advogado. A Lei
14.063/2020 separa assinatura simples, avançada e qualificada, e qual delas cada documento exige
depende do que está em jogo.

### Ainda no módulo de documentos

- **Visualizar em pop-up** — hoje só há *dar ciência* e *baixar*. Falta ler sem sair da tela. Muda
  conforme o formato: `.txt` renderiza direto, PDF precisa de visualizador embutido, Word não
  renderiza no navegador sem conversão.
- **Duas abas** — pedido do dono: uma para **políticas e comunicados** (empresa → todo mundo), outra
  para **documentos da pessoa** (empresa ↔ a pessoa). A separação não é só visual: são naturezas e
  permissões diferentes, e é a aba de políticas que vai concentrar os documentos de assinatura gov.br.
- **Trava de MIME no upload** — `esquemaMime` (`documentos/esquemas.ts:47-51`) aceita **qualquer**
  `tipo/subtipo` bem formado. PDF e Word já passam (os `.txt` que apareceram no teste são escolha do
  semeador, não restrição) — mas `.exe` também passa. Falta lista do que é permitido.
- **Re-autenticação no ato** — hoje quem sentar no computador com a sessão aberta dá ciência no lugar
  da pessoa. Pedir senha ou TOTP **na hora** amarra o ato a uma credencial, não a um navegador
  logado. É o passo de melhor relação custo-benefício para o modo *ciência*.

---

## 🔧 Férias — "Programar" vira "Solicitar"

Pedido do dono na tela de férias. Mesmo defeito de "Concluir"/"Aprovar": **o botão promete um ato que
ele não executa.** Ele não programa nada — abre uma demanda para o gestor aprovar, e a própria
mensagem verde logo abaixo diz isso: *"abriu uma demanda para aprovação do seu gestor"*.

O título do cartão ("Programar férias") deve seguir junto, senão a tela fica falando duas línguas.

---

## 🐞 Clima — as perguntas do check-in não têm tela nenhuma

O dono procurou onde mudar as perguntas do check-in diário e não achou, porque **não existe**.

As duas perguntas são inseridas pela migration e nunca mais tocadas
(`0004_clima.sql:80-82`): *"Como você está se sentindo hoje?"* e *"Como você tem se sentido a
respeito de suas entregas?"*. Não há rota (`/api/clima/` só tem `checkin`, `agregado` e
`individual`), não há chave de permissão para administrar o catálogo — as três chaves de clima são
*responder*, *ver agregado* e *ver individual* — e o semeador `04-clima.js` **recusa
explicitamente** mexer nele. Mudar uma pergunta hoje exige publicar código.

**A parte difícil, porém, já está pronta.** `rh_clima.pergunta_versao` foi construída para isso:
versionada, com vigência, com ciclo rascunho → ativa → encerrada, com trigger que impede editar ou
apagar o que já foi publicado, e com índice único de `ordem` entre as ativas. E as respostas
apontam para a **versão**, não para a pergunta — o histórico não se corrompe. Falta só tela, rota e
chave.

### A regra de edição — decidida com o dono

| | Critério |
|---|---|
| **hoje** (trigger `pergunta_versao_proteger`) | texto só muda enquanto está em **rascunho** |
| **decidido** | texto muda enquanto **não houver nenhuma resposta** |

O caso que motivou: *"criei a pergunta, adicionei, logo em seguida reparei que tem um erro de
escrita"*. A trava de hoje recusa, porque já saiu de rascunho — e não deveria, já que ninguém
respondeu. O critério certo é **existir resposta**, não ter apertado publicar; e ele engloba o
atual, porque rascunho nunca tem resposta.

Fora isso: **inativar e criar, nunca editar.** Enunciado com resposta é imutável.

*(Detalhe assumido: existe uma janela mínima em que alguém responde no instante exato da edição.
Sabemos que existe; não vale engenharia num conserto de digitação. Concordado com o dono.)*

### Continuidade entre perguntas — desenho do dono

Sem parentesco, "inativar e criar" quebra a série histórica em duas linhas soltas: o sistema não
sabe que a pergunta nova é a antiga reformulada. Eu propus uma tabela-pai `pergunta`; **o dono
propôs algo mais simples e melhor** — uma coluna dizendo de qual versão esta é continuação.

Vantagem decisiva: **não mexe em nada do que existe.** As duas perguntas atuais ficam com o campo
vazio. A tabela-pai exigiria migrar as linhas atuais para ela.

Dois ajustes ao desenho:

1. **Uma coluna, não duas.** O "é continuidade?" é redundante com o "qual?" — se o segundo está
   preenchido, a resposta já é sim. Duas colunas criam o estado em que se contradizem. O sim/não é
   decisão de **tela** (a caixinha que revela o seletor), não de banco.
2. **`UNIQUE` na coluna de continuidade.** Sem isso, duas versões podem dizer que continuam a mesma
   pergunta e a série vira um Y, com dois futuros e nenhum critério para escolher. Com a trava, cada
   versão é continuada uma vez só e a corrente fica bem formada.

**O fechamento da anterior já é obrigatório, e não por escolha nossa:** o índice único de `ordem`
entre as ativas impede a nova versão de entrar enquanto a antiga estiver ativa. Encerrar a anterior
é condição para a nova existir — as duas coisas acontecem na mesma transação ou nenhuma acontece.

Custo que sobra: montar a série inteira percorre a corrente para trás (`WITH RECURSIVE`) em vez de
agrupar por chave direta. Dez linhas, escritas uma vez no repositório.

| Ato | O que acontece |
|---|---|
| **editar** | só enquanto não houver nenhuma resposta |
| **reformular** | versão nova apontando para a anterior — encerra a anterior no mesmo ato |
| **aposentar** | encerra, sem continuidade |
| **assunto novo** | versão nova sem continuidade |

### Filtros das respostas individuais

Hoje a consulta aceita **três**: início, fim e colaborador. O texto da pergunta volta no resultado
mas não dá para filtrar por ele. O dono pediu filtro por pergunta *"e aqui vale outros filtros
também, para dar liberdade para a diretoria de pessoas fazer a pesquisa que quiser"*.

Sugeridos: **pergunta** · **nota** (a busca mais útil é "só os 1 e 2") · **só com comentário** (o
texto é onde está o ouro) · **lotação, centro de custo, gestor, cargo** (os mesmos do painel
agregado, para as duas telas falarem a mesma língua) · **busca no texto do comentário**.

⚠ **A ressalva que muda o desenho.** Esta aba não é como o painel agregado: lá o piso k≥5 protege,
aqui o objetivo é justamente ver quem disse o quê, e a proteção é a chave
`clima.resposta.individual.ver` mais a trilha. Só que a trilha grava **quem leu a resposta de quem**
— e **não grava o que foi procurado**. Filtrar por *gestor X + nota ≤ 2* deixa rastro idêntico a ler
o período inteiro. Se a liberdade de busca cresce, **o filtro usado tem de entrar na trilha**, senão
a liberdade cresce e o rastro não acompanha.

*(E o `LIMIT 500` fixo aperta quando os filtros forem soltos: paginar, ou no mínimo dizer "mostrando
500 de N".)*

### Um aviso sobre o painel agregado

A quebra por pergunta agrupa por versão — segura. Mas a **média geral do dia** agrupa só por data.
Acrescentar uma terceira pergunta **move a linha geral sem que o humor de ninguém tenha mudado**,
porque passou a ser média de três coisas. A tela precisa marcar quando o conjunto mudou.

---

## 🔧 Cabeçalho — o nome da pessoa só aparece na home

O dono viu o nome em `/` (*"Adriana Batista Rezende · Funcionário"*) e não viu em `/organograma`.

**Causa:** o `Cabecalho` compartilhado (`src/app/cabecalho.tsx`) **nunca renderiza o nome**. Quem
renderiza é a home, passando o nome como `children` (`src/app/page.tsx:373-377`). Nas outras 40
páginas o `children` é ocupado pelos links do módulo, e o nome some.

**Decidido:** o nome vai para dentro do `Cabecalho`, em toda página autenticada.

A escolha a fazer antes de mexer: o `Cabecalho` não tem hooks de propósito — funciona em server e em
client component. Então ou ele **recebe a sessão por prop** (mecânico, mas toca os 41 pontos de
chamada) ou a sessão passa a vir por contexto (um toque só, mas contexto não é consumível de server
component). Prop é o caminho sem risco de arquitetura.

⚠ **Achado de brinde, e ele liga com a liberdade de criar perfis:** o rótulo do papel vem de
`ROTULOS_PAPEL`, um **mapa fixo** em `dominios/usuarios/esquemas`. Perfil criado por operador não
está lá. `detalhe-demanda.tsx:18` tem defesa (`?? papel`); **`page.tsx:375` não tem nenhuma** — um
perfil novo renderiza `undefined` ao lado do nome da pessoa, no cabeçalho. É a liberdade que o dono
pediu produzindo defeito onde ninguém olhou.

---

## 🐞 Recrutamento — o enum que contradiz o próprio comentário

Falta a etapa de **consulta antes da oferta**, e o dono perguntou o custo de deixar o processo
editável.

**O app está limpo:** procurei `triagem`, `entrevista_rh`, `entrevista_gestor` e `oferta` em todo o
TypeScript — **zero acertos**. O kanban monta as colunas a partir do banco. E
`candidatura.etapa_atual_id` aponta para a **versão** da etapa, com histórico em
`movimentacao_candidatura` — mudar o processo não estraga o passado.

**A rigidez está numa linha só.** Em `0012_recrutamento.sql:70-75`, o comentário diz *"Template do
pipeline administrável pelo RH (nunca enum rígido)"* e a linha seguinte é:

```sql
tipo TEXT NOT NULL CHECK (tipo IN ('triagem','entrevista_rh','entrevista_gestor','oferta')),
```

Dá para versionar as quatro; não dá para criar a quinta. E não há rota nem tela para administrar
nenhuma delas.

### Decidido: vários modelos, não edição por vaga

O dono começou pedindo edição do processo por vaga e **mudou para modelos nomeados** — *padrão*,
*liderança*, *operacional*. É melhor **e mais barato**:

| | Tabelas | Telas | "gente no meio do processo" |
|---|---|---|---|
| editar por vaga | 2 + link | 2 | precisa decidir e programar |
| **vários modelos** | 2 + link | 1 | **resolvida pelo versionamento** |

O modelo versionado dissolve a pergunta difícil: a vaga guarda a versão do modelo que valia quando
abriu; editar o modelo cria versão nova e só atinge as vagas seguintes. Ninguém fica numa etapa
apagada porque nada foi apagado da vaga dele. É o mesmo padrão que o projeto já usa em quatro
lugares — não é conceito novo.

Bloqueio estrutural a remover: `etapa_selecao_versao_ordem_ativa` torna a `ordem` única **no sistema
inteiro**. Hoje existe um processo para a empresa toda. A unicidade tem de passar a ser por modelo.

Decisão pequena para depois: **vaga aberta pode trocar de modelo?** Sugestão — só enquanto não tiver
candidato.

### Comparar processos: por tempo, não linha a linha

O dono: *"a ideia é olhar como estão os processos de vendedores... pode ver dT de cada vaga e
comparar"*. Isso derruba a objeção de que modelos diferentes impedem comparação — **tempo compara
entre qualquer modelo**.

**O dado já existe:** `movimentacao_candidatura` é append-only e carimba a hora de cada transição.
É relatório, não coleta — e funciona para trás, sobre o que já rodou.

Agrupar por cargo sai de `vaga → requisicao_vaga → cargo_versao → cargo`. Duas ciladas a evitar:
**não agrupar por `vaga.titulo`** (texto livre: "Vendedor", "Vendedor(a)" e "Vendedor Loja 3" viram
três grupos) e **agrupar pelo cargo, não pela versão do cargo** (senão um RCF novo parte o histórico
em dois).

**Consequência de desenho:** para comparar etapa a etapa, os modelos têm de escolher etapas de um
**catálogo comum**, não escrever nomes à mão. Modelo = seleção e ordenação do catálogo.

⚠ **A armadilha do dT.** Média só sobre vagas fechadas esconde as encalhadas — elas nunca fecham,
nunca entram na conta, e o número fica ótimo por excluir os desastres. O relatório mostra os dois
lados: *fechadas* (mediana de dias, com o n) e *abertas hoje* (quantas, e há quanto tempo a mais
antiga). **Mediana, não média** — com poucas vagas, uma contratação de seis meses arrasta tudo.

Dois dT que valem nome: **dT da vaga** (abertura → fechamento, compara entre qualquer modelo,
responde *quanto demora*) e **dT por etapa** (onde emperra, compara dentro do modelo ou entre
modelos que compartilhem a etapa, responde *por quê*).

---

## 🔍 O padrão "modelo" — onde mais ele cabe

O dono pediu para procurar outros lugares com o mesmo raciocínio. Existe um **sinal literal no
banco** que separa os casos:

```sql
ON rh.cargo_versao (cargo_id)            WHERE status = 'ativa'   -- um por cargo. Vários coexistem.
ON rh.modelo_avaliacao_versao (status)   WHERE status = 'ativa'   -- UM. No sistema inteiro.
```

**`ON (status)` é a chave que só admite uma linha.** Seis tabelas usam. Três são legítimas — INSS,
IRRF e parâmetros da folha, porque a lei tem uma tabela só.

### Grupo 1 — a tabela "modelo" existe e só cabe um

| Tabela | Hoje | Devia variar por |
|---|---|---|
| `modelo_avaliacao_versao` (`0011:51`) | um modelo para a empresa toda | **cargo** — o dono já apontou |
| `checklist_admissao_versao` (`0010:34`) | um checklist para todo mundo | **cargo** — motorista precisa de CNH; menor aprendiz é outra lista |
| `roteiro_entrevista_versao` (`0008:170`) | um roteiro de entrevista de desligamento | **tipo de desligamento** |

Ironia do terceiro: `tipo_desligamento_versao` **é** administrável por tipo. O tipo varia, o roteiro
não.

O de recrutamento (`etapa_selecao_versao`) falha diferente — pelo índice global de `ordem`.

### Grupo 2 — não existe modelo nenhum, e o raciocínio cabe igual

- **EPI por cargo** — `epi_item` não tem vínculo com cargo. Qual EPI cada função exige está na
  cabeça de alguém; a NR-6 põe essa definição no colo do empregador.
- **Exames do ASO por cargo** — `aso` tem `tipo`, mas não quais exames cada função exige. É o
  PCMSO, e ele é por função.
- **Cadeia de aprovação** — `nivel TEXT CHECK (nivel IN ('lider','diretoria'))` e `UNIQUE
  (demanda_id, ordem)`: **dois níveis fixos**, montados pelo serviço por demanda. Quem aprova o quê
  está no código. Um ajuste de R$ 200 e uma promoção de R$ 5.000 percorrem o mesmo caminho.
- **Checklist de devolução no desligamento** — `item_devolucao` não tem template.
- **Feedback** — já pedido pelo dono; não existe modelo.

### A forma é a mesma, e são três peças

1. um **catálogo** de itens — etapas, perguntas, documentos, EPIs, exames
2. um **modelo** — seleção e ordem de itens do catálogo, com nome
3. **o que escolhe o modelo** — e só esta peça muda de módulo para módulo

| Módulo | O que escolhe |
|---|---|
| avaliação, admissão, EPI, ASO | cargo |
| recrutamento | a vaga escolhe |
| desligamento | tipo de desligamento |
| aprovação | **valor** — por isso é a mais delicada |

**Ordem sugerida:** EPI e ASO por cargo primeiro (a lei cobra, mesma forma de tabela, hoje dependem
de memória — é o único par onde o erro tem fiscal). Checklist de admissão depois: barato e usado
todo dia. Cadeia de aprovação por último e com conversa própria — mexe em autoridade e dinheiro.

**E as cinco telas devem ser a mesma tela:** catálogo à esquerda, modelo à direita, regra que
escolhe embaixo. Senão o operador aprende cinco vezes a mesma ideia.

---

## 📊 Painel executivo — três coisas

### 1. Gráfico sem valor no mouse

O dono: *"o absenteísmo está em 1,31% e vem subindo; se eu colocar o mouse não consigo olhar os
meses anteriores"*.

**O dado já está no navegador** — `serie.pontos` traz os 12 meses. O `Sparkline`
(`painel-executivo/painel.tsx:211`) desenha a linha e rotula só o **primeiro e o último** mês; não
existe nada por mês que o mouse acerte.

Conserto barato: um retângulo invisível por mês, altura toda, cada um com `<title>` dentro —
tooltip nativa do SVG, sem JavaScript e sem estado. A versão com ponto destacado também cabe (o
arquivo já é `"use client"`), mas é bem mais código.

Brinde: hoje o gráfico é `role="img"` com rótulo *"absenteísmo: vem subindo"*. Quem usa leitor de
tela ouve isso e mais nada; com os títulos, os números passam a existir.

### 2. ⚠ A escala que some — mais sério que a tooltip

```js
y = ALTURA - ((valor - minimo) / amplitude) * ALTURA
```

O gráfico normaliza **entre o próprio mínimo e o próprio máximo**: a linha ocupa a altura inteira
da caixa **independentemente do tamanho real da variação**. Se o absenteísmo foi de 1,28% para
1,31%, essas três centésimas viram uma montanha do chão ao teto — idêntica ao desenho de uma alta
de 30 pontos.

Não é mentira (sparkline mostra formato, não magnitude), mas **a magnitude não aparece em lugar
nenhum**, então não há como saber qual caso se está vendo. Conserto: a variação do período ao lado
da seta — *"▲ +0,03 p.p. em 12 meses"* — ou mínimo e máximo nas pontas do eixo.

### 3. Filtro na esquerda, acompanhando a rolagem

Pedido do dono, e deliberadamente **diferente das outras telas** (onde o filtro fica em cima):
a página é longa e ele não quer subir e descer para filtrar.

O layout é simples: duas colunas, `position: sticky` com `align-self: start` na da esquerda. A
decisão que sobra é a tela estreita, onde não há coluna — vira botão que abre painel, ou o filtro
volta para cima.

⚠ **O trabalho de verdade não é o layout.** O repositório do painel tem **24 funções de consulta** e
**nenhuma delas recebe filtro** — só `data`, `limite`, `janela`. O filtro teria de atravessar todas.
E algumas não podem ser filtradas honestamente: clima, eNPS e diversidade batem no piso de
anonimato quando o recorte encolhe — e aí o certo é sumir, não mostrar.

**O risco daí é o pior possível:** filtro que vale em 15 cartões e silenciosamente não vale em 9. O
leitor lê a página inteira como filtrada. Com o filtro fixo na lateral isso piora, porque ele fica à
vista enquanto se rola por cartões que não o obedecem.

**Regra:** ou o cartão honra o filtro, ou ele diz na própria cara que não honrou — *"empresa toda"*
ou *"recorte pequeno demais"*. Nunca em silêncio. Isso permite entregar por partes: começa pelos
indicadores que já aceitam recorte e marca o resto, em vez de esperar os 24.

---

## 🔧 Admissão — linha "adicionar documento extra"

Pedido do dono: uma linha no fim do checklist para o caso de faltar algo. **É a coisa mais barata
desta sessão — zero migration.**

`rh.item_admissao` **não tem FK para o template**: os itens são copiados do checklist na abertura e
viram linhas comuns (`processo_id`, `ordem`, `descricao`, `obrigatorio`, `status`). Inserir um a
mais com `ordem` = maior + 1 não viola nada. E metade já existe: há rota para **alterar** item
(`/api/admissoes/[id]/itens/[itemId]`); falta o **POST** para criar, na mesma pasta.

**Decidido com o dono:**

1. **O item extra nasce NÃO obrigatório.** Consequência a assumir: a conclusão do processo recusa
   por `obrigatorios_pendentes > 0` (`admissao/servico.ts:340`), então o extra **não trava o
   "Concluir"**. Leitura coerente: o obrigatório é o que a empresa firmou no checklist; o extra é
   lembrete, não portão.
   **Companheiro sugerido:** ao concluir, se houver item não obrigatório pendente, *dizer* — sem
   bloquear. Assim ninguém conclui às cegas e a decisão continua valendo.
2. **Só enquanto o processo está em preparação** — a trava de estado já existe para as outras ações.
3. **Engano se corrige com "não aplicável"**, status que já existe, nunca apagando. Mantém o rastro,
   como o resto do projeto.

**Efeito colateral bom:** esta é a válvula de escape que torna o checklist por cargo menos urgente.
Não substitui os modelos — item que se repete em todo motorista não devia ser redigitado — mas
compra tempo por uma fração do custo.

### E os modelos também valem aqui — mais baratos que no recrutamento

O dono confirmou aplicar a estratégia de modelos ao checklist. Aqui sai mais barato por dois
motivos que só existem neste módulo:

1. **O mecanismo difícil já está pronto.** `processo_admissao.checklist_versao_id` pina a versão na
   abertura e os itens são materializados — a admissão em andamento **já é imune** a mudança de
   template. É a propriedade que tornou fácil a decisão do recrutamento, e aqui já existe.
2. **Não precisa de catálogo nem tabela nova.** Os itens já são um array JSONB dentro da linha. Um
   modelo é uma linha com nome e sua lista; não há etapas soltas para catalogar nem ordem global
   para reorganizar.

O que bloqueia é o índice `checklist_admissao_versao (status) WHERE status='ativa'`. E o projeto já
tem o padrão certo em duas tabelas — `tipo_demanda_versao` chaveada em `chave`, `jornada_versao` em
`codigo`. Basta a admissão ganhar uma chave e o índice apontar para ela: **coluna nova, índice
trocado, regra que escolhe, tela. Sem tabela nova, sem catálogo, sem join.**

**O que escolhe o modelo — e aqui é diferente dos outros módulos.** Há dois candidatos, e o mais
forte não é o cargo:

- **tipo de vínculo** — aprendiz, estagiário e CLT têm conjuntos de documentos *legalmente*
  diferentes. É o corte que mais muda a lista.
- **cargo** — entra por cima (CNH para motorista, registro em conselho).

**Recomendação:** um modelo só por processo, escolhido por regra, mais a linha de item extra. O
motorista ganha a CNH na mão; se a combinação se repetir, alguém cria o modelo "Admissão Motorista".
Empilhar base + acréscimo por cargo é mais elegante e bem mais caro, e a válvula de escape já cobre
o caso raro.

---

## 💡 Registro de posse — o que cada pessoa tem, e o que a empresa tem na rua

Ideia do dono: registrar na ficha o que está em poder da pessoa, para o **desligamento já vir
preenchido** em vez de virar pesquisa. Depois ele ampliou: serve também para saber **quanto a
empresa tem na rua**, por tipo.

### Para EPI já dá hoje — é consulta, não módulo

```sql
-- epi_entrega, 0014_sst.sql:89-90
-- NULL = em uso; preenchido uma única vez na devolução
devolvido_em TIMESTAMPTZ,
```

`epi_entrega` **já é um livro de posse**. O que a pessoa ainda tem é `devolvido_em IS NULL`. E logo
abaixo, na linha 100, está o índice:

> `-- Pendências de devolução (consulta do checklist de desligamento)`

**O índice para essa consulta exata foi criado no primeiro dia e nunca foi usado.** Quem escreveu a
migration pensou nisso; o preenchimento é que não chegou.

### Para o resto, o buraco está confessado no código

`item_devolucao` aceita notebook, crachá, uniforme, chave e celular — mas **não existe tabela que
registre que alguém recebeu um notebook**. O comentário acima da tabela diz: *"EPIs e ativos (lista
manual no MVP)"*.

### Decidido com o dono: tipo + quantidade, sem identidade individual

Eu havia proposto ativo identificável com cadeia de custódia (`ativo` + `posse`). **O dono
descartou** — o interesse não é *"XYZ está com o notebook 47"*, e sim *"temos 8 carros, 200
desktops, 100 notebooks, 500 telefones, 20 tablets"*. Some a metade cara.

Tipo + quantidade atende as duas leituras da mesma tabela: por pessoa (desligamento) e somado por
tipo (quanto está na rua).

Tabela separada da de EPI, com a mesma forma — o registro de EPI tem obrigação legal em cima (CA,
termo, NR-6) e já funciona; misturar notebook ali dilui o registro que tem fiscal. A ficha e o
desligamento juntam os dois na hora de mostrar.

⚠ **O número não é o que parece.** O livro só sabe o que foi entregue a alguém: notebook no estoque
ou quebrado na gaveta não existe para ele. O total é **"em poder de colaboradores"**, não "que a
empresa tem" — e o rótulo na tela precisa dizer isso com todas as letras, senão alguém planeja
compra em cima de um número que exclui o almoxarifado.

⚠ **Achado vindo do exemplo do próprio dono:** ele listou **carros** e **tablets**, e a categoria de
devolução é `CHECK (categoria IN ('epi','notebook','cracha','uniforme','chave','celular','outro'))`
— **nenhum dos dois está lá.** Cairiam em "outro" e sumiriam justamente do relatório por tipo. O
tipo de ativo tem de ser **catálogo administrável**, não lista no código.

⚠ **A condição que decide se funciona:** uma lista de posse vale o quanto vale a disciplina de
registrar a entrega. Sem registro na entrega, o desligamento vem com lista vazia — pior que não ter
lista, porque as pessoas confiam nela. O lugar natural da primeira entrega é **o checklist de
admissão**. Fecha o ciclo: admissão entrega → posse acumula → desligamento devolve.

---

## ⚖️ Medidas disciplinares — a cadeia que hoje não existe

Dúvida do dono: *"em afastamento não deveria ter a opção de suspensão?"* — pensando na sequência
**advertência verbal → advertência escrita → suspensão → justa causa**.

**Não cabe em afastamento.** Afastamento é fato que acontece com a pessoa (adoeceu, teve filho);
suspensão é **ato da empresa contra a pessoa**. De fora parecem iguais (não trabalha), mas origem,
prova, defesa, encadeamento e limite são todos diferentes — e o limite é legal: **30 dias**
(art. 474 CLT); passou disso, vira rescisão injusta.

Hoje não existe em lugar nenhum. Há `rh.ocorrencia` — registro livre, tipo *negativo*, imutável —
boa para anotar um fato e **inútil como cadeia**: não sabe que a advertência de março e a suspensão
de junho são o mesmo caso escalando. **Enquanto não existir, alguém vai registrar suspensão como
afastamento tipo `outros`.** É o que sobra.

### A cadeia é sugestão, nunca portão

O dono: *"em casos extremos pode ocorrer a suspensão direta, exemplo simples é agressão"*.

Exigir o degrau anterior tornaria o sistema obstáculo **no caso que mais importa**. Então: mostra o
histórico, sugere o próximo passo, **permite qualquer medida a qualquer momento** — e ao pular
degraus, pede o porquê num campo.

Essa justificativa é o ouro: documenta que o salto veio da **gravidade do fato**, não de descuido de
processo. Mesma forma já escolhida na admissão — **avisar, não travar**.

O fato e a medida são coisas distintas: o fato tem registro próprio (o quê, quando, quem viu) e a
medida se pendura nele.

### Decisões do dono

**Preventiva existe.** No caso da agressão, o primeiro movimento é tirar a pessoa do prédio hoje,
antes de apurar — não é castigo ainda.

| | Quando | Paga? |
|---|---|---|
| preventiva | enquanto apura | em geral sim |
| disciplinar | depois de decidir | não |

**Validade de 12 meses, mas não some do registro.** Advertência velha deixa de pesar na escada e
continua visível. O prazo é **parâmetro de tela**, nunca número no código.

**Preventiva não confirmada fica registrada para sempre.** Raciocínio do dono: *"a pessoa foi
afastada por denúncia anônima de fraude 3 vezes; pode ser que seja honesta, mas pode ser que seja
muito boa em esconder — ignorar esses fatos não acho certo"*.

Concordo, com a separação que equilibra os dois lados — porque preventiva não confirmada é uma
acusação que não se provou, e se ela pesar como punição, quem quiser prejudicar alguém aprende que
basta denunciar três vezes:

| | Fica no registro | Conta na escada |
|---|---|---|
| preventiva **confirmada** | sim | sim — virou suspensão |
| preventiva **não confirmada** | **sim, para sempre** | **não** |

Duas travas que fazem isso funcionar:

1. **Desfecho é obrigatório.** Apuração sem conclusão registrada deixa acusação aberta para sempre —
   o pior dos dois mundos. O sistema cobra até alguém escrever o que deu.
2. **O padrão se anuncia sozinho.** N preventivas na mesma janela acendem alerta para quem tem a
   chave. Padrão que só aparece se alguém rolar a ficha é esquecimento com outro nome.

Dado pesado: entra como **restrito**, com leitura gravando em `audit.leitura_sensivel`.

### Onde mora: uma tela, duas tabelas

O dono preferiu ficar na ficha de ocorrências em vez de módulo externo. **Concordo com a tela e não
com o armazenamento** — e são decisões separadas.

A favor da ficha: uma pessoa se lê inteira (elogio e advertência na mesma linha do tempo); em duas
telas alguém lê só uma, e vai ser a errada na hora errada. E `rh.ocorrencia` já é o registro do fato.

Contra guardar **como** ocorrência: a medida tem período (suspensão tem começo e fim; ocorrência só
tem `ocorrida_em`), termo assinado, recusa, testemunhas — texto livre mata a capacidade de contar, de
avisar e de barrar os 30 dias. Preventiva tem **ciclo de vida** e ocorrência é imutável. A folha
precisa saber quais dias não são pagos. E os 12 meses precisam de data calculável.

**Solução:** a ocorrência continua sendo o fato e a linha do tempo única; a **medida** vira registro
estruturado pendurado nela. Uma tela, duas tabelas.

⚠ **Vem junto:** `ocorrencia.restrita` já existe por linha, e agora precisa de critério — o gestor
precisa ver o disciplinar da própria equipe, mas suspensão não pode ficar à vista de quem abre
qualquer ficha. **Permissão por registro, não por tela.**

### O ciclo do documento que exige assinatura — vale para todo o módulo de documentos

Pedido do dono, e estava mapeado pela metade (a recusa com testemunhas, sim; o envio e o prazo, não
— e sem eles a recusa não tem como ser constatada).

```
gerado → enviado à pessoa → prazo correndo
                              ├── assinou
                              ├── recusou (declarado)
                              └── sem resposta no prazo
                                        ↓
                              constatação com 2 testemunhas
```

- **prazo** — sem ele não há "sem resposta", só espera indefinida
- **testemunhas são pessoas, por id** — colaboradores do sistema, e **cada uma dá a própria
  ciência**. Testemunha digitada à mão não testemunha nada
- **recusa é desfecho, não falha** — "recusou-se a assinar, na presença de fulano e beltrano" é
  registro válido

**Não é só do disciplinar:** vale para qualquer documento que exija assinatura. A política de conduta
tem o mesmo buraco — hoje quem não dá ciência fica pendente para sempre.

---

## 🐞 Ponto — o botão que o banco esperava e a tela nunca ofereceu

O dono, na tela de intercorrências: *"tem justificar ou ignorar, não deveria ser aprovar ou negar?"*

**O que falta não é renomear — é um terceiro botão.**

```sql
-- intercorrencia_ponto, 0027_ponto.sql:249-250
status CHECK (status IN ('aberta','corrigida','justificada','ignorada'))
```

**`corrigida` não tem botão.** O texto no alto da tela explica como corrigir — ir ao espelho, gravar
marcação nova, reapurar — ou seja: o sistema sabe a ação certa, descreve ela, e manda fazer em outro
lugar. Com 30 intercorrências abertas, o único caminho oferecido é explicar ou descartar.

**"Aprovar/Negar" não cabe aqui** — ninguém pediu nada, é o sistema apontando anomalia. Mas o par
está certo na tela vizinha:

| Tela | Origem | Ações certas |
|---|---|---|
| intercorrências | o sistema achou | **Corrigir** · Justificar · Ignorar |
| pedido de ajuste (demanda) | a pessoa pediu | **Aprovar** · Negar |

### O formulário "à prova de burrice" já tem tabela pronta

O dono pediu campos estruturados em vez de texto livre: dia do ajuste, qual registro, hora que está
→ hora que vai virar. `rh.marcacao` já tem os quatro:

| Pedido | Onde já mora |
|---|---|
| dia do ajuste | `momento` |
| qual registro | `tipo IN ('entrada','saida','inicio_intervalo','fim_intervalo')` |
| hora que **está** | `substitui_marcacao_id` → a marcação apontada |
| hora que **vai virar** | o `momento` da nova |

**Nada a criar no banco.** `substitui_marcacao_id` é literalmente "de qual hora para qual hora", e
nenhuma tela nunca o usou.

**O que falta para ser à prova de burrice:** a lista de registros **não pode ser fixa** — jornada de
6h não tem intervalo, turno de noite atravessa a meia-noite. As opções saem da **jornada daquela
pessoa naquele dia**, marcando quais batidas existem e quais faltam. Aí **dois dos quatro campos se
preenchem sozinhos** (o dia vem da intercorrência, a hora atual vem da marcação) e sobra uma coisa
para digitar.

Dois casos que o formulário precisa aguentar sem forçar valor:

- **batida que não existe** (*entrada sem saída*): não há "hora que está" — mostra **não existe** em
  vez de exigir número
- **batida a mais** (*marcação duplicada*): não vira hora nenhuma, é `efeito = 'anulacao'`. O modelo
  prevê; a tela não oferece
