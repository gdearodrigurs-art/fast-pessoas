# O arnês do projeto — os sete componentes

> Escrito em 01/08/2026, depois de ~45 horas de ondas com agentes.
> Cada item traz a **evidência medida** de que falta, e o que ele vira **neste** projeto.
> Ordem de execução: pela dor medida, não pela numeração.

---

## Por que agora

O projeto funciona e a verificação achou defeitos que valiam dinheiro — hora noturna, divisor 220,
2FA por papel. Mas o custo por achado é alto e **nada acumula**: cada onda recomeça do zero.

Desperdício com nome e sobrenome, medido nesta sessão:

| O quê | Custo |
|---|---|
| **Sete** varreduras atrás de número de negócio chumbado | ~7 rodadas de agente |
| Teto de 3 achados por frente na onda F/G | **4 ondas extras** |
| Login HTTP + TOTP + consulta reimplementados por cada verificador | dezenas de vezes |
| Colisão de número de migration | **3 vezes** |
| Lixo de agente entrando em commit | **4 vezes** |
| Agente escrevendo no banco durante a medição de outro | **3 vezes** |

Nenhum desses é falha de agente. **São buracos de arnês.**

---

## 1 · Ferramentas definidas — *FECHADO em 01/08/2026*

**Evidência:** todo verificador reescreveu do zero: abrir conexão, montar `SELECT`, fazer login HTTP,
gerar o código TOTP, comparar payload. Dezenas de vezes, em todas as ondas.

**Oito, e a conta foi reaberta em 01/08.** Este ponto dizia "cinco firmes, uma opcional", e o número
era o argumento: agente com ferramenta demais perde tempo escolhendo. Só que o ponto 2 acrescentou a
`bancada.js` e o ponto 3 acrescentou o `mapa.js` **sem ninguém refazer a conta**. São oito. O
argumento do número curto continua valendo — o que muda é que ele agora se aplica a uma caixa maior, e
a defesa passa a ser o `db/README.md`, não a memória de quem escreve o prompt.

| | Ferramenta | O que substitui |
|---|---|---|
| 1 | `db/consultar.js "<SQL>" [--banco <nome>]` | o `node -e "const {Pool}=require('pg')…"` de cada agente |
| 2 | `db/logar-como.js <persona> [--banco <nome>]` | a dança de login que cada verificador reimplementou |
| 3 | `db/snapshot.js <nome>` · `comparar <a> <b>` | eu digitando "HE 50%=27333…" de memória em todo prompt |
| 4 | `db/migracoes.js conferir` · `nova <nome>` | 3 colisões de número + a conferência disco×banco à mão |
| 5 | `db/comparar-personas.js <rota> [personas…]` | o comparador de payload reescrito a cada verificação de acesso |
| 6 | `db/bancada.js criar\|listar\|destruir\|orfaos` | o banco por frente do ponto 2 — quem cria tem que saber destruir |
| 7 | `db/mapa.js [retrato]` | **já escrito** — o gatilho do adversarial do ponto 3 |
| — | `db/trilha.js "<comando>"` | *opcional, baixa prioridade* — o antes/depois de `audit.leitura_sensivel` |

**`--local` morreu; agora é `--banco <nome>`.** A assinatura antiga era binária — local ou Supabase —
e foi escrita quando existiam dois bancos. O ponto 2 criou **N**: um por frente. Pior, o default da
assinatura antiga apontava para o Supabase, que é justamente o recurso que o ponto 2 protege.

Regra nova: **o default é o banco da frente**, lido de variável de ambiente do processo do agente —
**nunca de arquivo compartilhado**, senão duas frentes rodando juntas leem a mesma variável e a
primeira que trocar leva a outra junto. Sem variável definida, a ferramenta **recusa e diz como
definir**; ela nunca escolhe um banco por conta própria.

Regra no prompt: **"use estas; não reimplemente."** Cada uma responde a `--help` com exemplo real.

**Onde a lista mora.** O `PROJETO.md` que este ponto citava **não existe** — o ponto 5 o descartou de
propósito ("arquivo que ninguém relê e envelhece sem avisar"), e o "Fica:" do ponto 7 não inclui lista
de ferramenta. A lista ficou órfã entre dois pontos. Passa a morar em **`db/README.md`**, com uma
única linha no `AGENTS.md` apontando para ele: *"as ferramentas de linha de comando estão em
`db/README.md`; rode `--help` antes de escrever a sua."*

### Decisões tomadas ao fechar este ponto

**Nada de bypass na tela de acesso.** A pergunta foi legítima — os dados são 100% fictícios, um atalho
no login pouparia trabalho. Mas os melhores achados desta sessão vieram de agentes fazendo login de
verdade: gestor de outro CNPJ aprovando demanda, ficha vazando o vínculo que a autorização bloqueia,
2FA por nome de papel, uma caixa marcada levando de 1 a 70 colaboradores. **Com atalho, essa classe
inteira de defeito fica invisível.** E, depois da 0040, a sessão carrega estado real (`pendente_2fa`,
chaves que autorizaram) — um bypass ingênuo inventaria isso e faria passar teste que devia falhar.

O `logar-como.js` é **fábrica de sessão, não bypass**: chama a mesma função que a rota de login chama.
Pula a digitação da senha e do TOTP, não a lógica de autorização. Três travas: recusa em
`NODE_ENV=production`, **recusa se a `DATABASE_URL` não for local** (host `127.0.0.1` e nome casando
`fast_pessoas_*`), e vive em `db/` — fora de `src/`, não entra no build.

> A trava do meio dizia "recusa fora do banco de demonstração". Ficou sem sentido no mesmo dia: o
> ponto 2 mandou **todo o trabalho para as bancadas** e deixou o banco de demonstração só para
> apresentação. A trava apontava para o único banco onde a ferramenta não deve rodar.

**O que essa fábrica NÃO prova.** Ela pula o TOTP — e 2FA é exatamente uma das coisas que o ponto 2
exige provar por HTTP. Então: **achado sobre 2FA, enrolamento ou bloqueio de entrada não pode ser
provado com `logar-como.js`**, nem para o lado positivo nem para o negativo. Para esses, login de
verdade, com o código gerado pelo `codigo-2fa.js`.

**O `comparar-personas` é a de maior retorno.** É a forma exata da lente que mais rendeu: um
verificador fez isso em 16 rotas, uma a uma, escrevendo o comparador do zero. Virando comando,
qualquer onda roda barato, e a lente deixa de depender de alguém pedir.

**Smoke das telas NÃO é ferramenta — é portão (ponto 3).** Todo agente de fechamento fez, e cada um
fez diferente: um cobriu 10 telas, outro 13, outro 91. É determinístico e dá passa/falha, então entra
no **`npm run test:e2e`** — com a lista de telas versionada e única, que era o ponto.

> Estava escrito "entra no `npm test`", e isso o punha em duas caixas que se excluem: o `npm test` é
> definido no ponto 3 como o portão que **não sobe servidor**, e smoke de tela precisa de servidor,
> que o ponto 2 raciona em uma vaga. O que importava — lista única, determinística, rodando igual toda
> vez — sobrevive inteiro do outro lado.

**Não existe ferramenta de limpeza de dado de teste, e o argumento vale só para a bancada.** Com banco
por frente, o agente suja à vontade e o banco é descartado — construir a ferramenta seria resolver um
problema prestes a ser deletado. **Mas o argumento não cobre dois casos**, e ambos apareceram na
revisão cruzada:

- **O smoke do fechamento roda contra o Supabase**, que o ponto 2 promete "sempre limpa" — e smoke que
  navega tela escreve. Delimitado: contra o Supabase o fechamento roda **subida, migrations e o
  subconjunto somente-leitura do smoke**. O que escreve roda contra bancada.
- **O snapshot dentro da bancada do próprio agente** — ver ponto 3: ele saiu do portão rápido
  justamente porque não havia como limpar entre a prova do agente e a medição dele.

**Varredor contínuo de lixo: recusado, com a boa ideia aproveitada.** A proposta era um agente
varrendo sempre e indicando candidatos, com a decisão ficando comigo. O que há de certo nela —
**separar quem detecta de quem decide** — é exatamente o que faltou nas quatro vezes que lixo entrou
em commit. Mas: (a) o padrão no `.gitignore` já resolveu — depois de `.tmp-*/` e `_verif-*`, zero lixo
nos dois últimos commits; (b) agente vivo custa RAM, que é o nosso gargalo medido (0,34 GB no pico);
(c) viraria ruído, porque a maioria dos candidatos é arquivo de agente em serviço — os vinte
`.tmp-out_api_*.json` pareciam lixo e eram um cético trabalhando; (d) é o mesmo erro que este
documento existe para corrigir: agente onde regra resolve.

Vira **portão no commit** (ponto 7): lista os não rastreados que o `.gitignore` não cobre e **recusa,
nomeando o arquivo**. Não "exige confirmação" — confirmação de quem, por qual canal? O ponto 6 define
três eventos para cima e nenhum é "tem um arquivo estranho aqui", e um agente parado esperando um
"pode" que ninguém vai mandar é o pior desfecho possível. Recusando, o agente tem duas saídas que ele
mesmo executa: **mover para a pasta de prova**, ou **acrescentar o padrão ao `.gitignore`** — e a
segunda vira linha no arquivo de achados da onda, que é onde a decisão fica registrada.

Custo zero, fala só quando há algo, acontece na hora certa. **A ideia do varredor fica guardada** para
quando houver folga de máquina — ela cobre o que a regra não previu, como o `prova-*.js` que ninguém
tinha imaginado.

> Nota de 01/08, escrita no dia em que a regra provou o próprio valor: os três arquivos da prova da
> onda I foram apagados por mim numa limpeza. Um portão que **recusa e nomeia** teria me feito olhar
> para eles antes de deletar.

---

## 2 · Sandbox — *FECHADO em 01/08/2026, com uma medição em aberto*

**Evidência:** 32 commits direto na `main` antes de adotarmos branch. Contaminação de banco três
vezes, uma delas invalidando uma medição de desempenho inteira. Dois worktrees abandonados por
agentes — um de 33 MB, outro um diretório vazio que o Windows não deixava apagar.

Sandbox são **quatro dimensões independentes**, com custos bem diferentes. Tratá-las como uma só foi
o erro do desenho original.

### Código

**Branch por onda** — provado nas duas últimas.

**Worktree deixa de ser regra.** Contraria o que este documento dizia antes, e o motivo é concreto: se
duas frentes tocam arquivos DIFERENTES, worktree é desnecessário — basta particionar. Se tocam os
MESMOS arquivos, worktree não resolve: adia o conflito para o merge, e aí um agente teria que
reconciliar versões divergentes, que é o pior lugar para um agente errar.

A prova está na Onda I: três frentes no mesmo domínio, rodadas **em cadeia**, cada uma recebendo o
relatório da anterior — zero colisão. Nas ondas em paralelo houve duas edições concorrentes e três
colisões de número.

Fica: **partição por dono de arquivo**; **cadeia** quando o trabalho é sequencial; worktree só para o
experimental, com destruição no fechamento.

### Banco

Um banco por frente: `fast_pessoas_<onda>_<frente>`. Custa 2,7 s de migrations + 5 s de semeador.

`db/bancada.js criar | listar | destruir | orfaos` — **sexta ferramenta**, e ela se justifica porque a
decisão do sandbox cria um recurso novo. Quem cria tem que saber destruir; construir o `criar` sem o
`destruir` seria repetir o erro na mesma conversa em que ele foi diagnosticado.

### Servidor — a restrição que reordena a onda

Um servidor consome ~740 MB (medido no `next dev`). Com 8 GB **não cabem quatro**. A saída não é
comprar RAM: é reconhecer que **a maior parte da verificação é SQL e não precisa de servidor**.

| Trabalho | Isolamento |
|---|---|
| Consulta, contagem, integridade, motor puro, varredura de arquivo, tsc/lint/build | **banco próprio, sem servidor** — paralelismo largo |
| Payload, permissão, 401/403, smoke de tela, 2FA, fluxo ponta a ponta | **um servidor compartilhado** — cadeia |

**A tensão que isso expôs:** isolamento de banco e teste HTTP se estorvam. Quem compartilha servidor
compartilha banco — e são justamente os agentes de HTTP que mais escrevem. Ou seja, o banco por frente
resolve a contaminação de quem menos contaminava. Remédio: agentes de HTTP em cadeia, um de cada vez.

**O efeito na camada adversarial, que quase passou:** 29 achados × 3 céticos = 87 agentes, e boa parte
da reprodução é HTTP. Com um servidor, viram fila de 87 — a camada que mais valor dá vira o gargalo.
**Muda o desenho: um cético por LENTE julgando o lote inteiro numa sessão** — 3 agentes em vez de 87,
menos custo de partida, mesma independência entre lentes.

**A trava contra o efeito perverso:** tornar o SQL confortável e o HTTP caro faria os agentes derivarem
para provar por SQL — e o vazamento de escrita entre CNPJs, a ficha vazando o vínculo bloqueado e o
2FA por papel **não aparecem em SQL**. Regra: achado de acesso, permissão ou payload **só conta como
provado por HTTP**; SQL explica a causa, nunca absolve.

### Demonstração

O Supabase vira **só apresentação**. Agentes não escrevem nele; as migrations entram no fechamento da
onda. Em troca de ficar uma onda atrás, a base de apresentação fica sempre limpa — sem o resíduo que
sobrou na apuração da Juliana ou nas regras 8 e 9 presas pelo gatilho.
**O dono pode pedir atualização pontual do Supabase a qualquer momento.**

### O risco das duas versões de Postgres

**Local 18.4 × Supabase 17.6.** Se toda a verificação roda no 18 e a demonstração vive no 17, existe
classe de defeito que só aparece onde ninguém olha — e uma migration que use recurso do 18 aplicaria
no local e falharia no Supabase, descoberto só no fechamento.

Decidido: **`migracoes.js` aplica nos dois** e o fechamento roda o smoke contra o Supabase. Assim o
Supabase é espelho verificado, não destino cego. (A alternativa — instalar PostgreSQL 17 ao lado —
fica guardada se a divergência incomodar.)

### EM ABERTO, deliberadamente

**Quantas vagas tem a fila de HTTP: uma ou três?** Depende do consumo de um servidor de PRODUÇÃO
(`npm start`), que pode ser bem mais leve que os 740 MB do `next dev`. O dono decidiu **não medir
agora** — a medição fica para depois de o arnês estar montado, junto do teste geral. Até lá, o desenho
assume **uma vaga**, que é o pior caso.

---

## 3 · Verificação com gatilho, escopo e profundidade — *FECHADO, menos o gatilho adversarial*

**Evidência:** sete varreduras do mesmo tipo de defeito, cada uma se dizendo completa. Um agente de
fechamento cobriu 10 telas, outro 13, outro 91. Gatilho era "quando eu decido", escopo era o que eu
escrevia na hora, profundidade era chute. Hoje existem **zero arquivos de teste**.

**E uma evidência que eu escrevi errada duas vezes.** Eu disse que o `eslint.config.mjs` tem 23 linhas
e é "o padrão do Next, nenhuma regra nossa". As 23 linhas conferem; o resto não. Ele tem
`globalIgnores(["db/**", ".claude/**"])` — quer dizer, **o lint não olha uma linha de `db/`**, que é
exatamente onde vivem as oito ferramentas do ponto 1, o runner de migrations e os semeadores. O portão
é cego para o código de que os outros seis pontos dependem.

Consequência para as três regras: elas valem **também para `db/`**. Tirar `db/**` do `globalIgnores`
exige um bloco à parte, porque ali é CommonJS rodando fora do bundle — mas "é outro dialeto" nunca foi
motivo para não ter portão, e sim para ter um portão próprio.

### Gatilho — quando

| Gatilho | Quando | Custo |
|---|---|---|
| **Agente** | antes de qualquer agente declarar pronto: tsc, lint, motor puro, baterias | segundos |
| **Commit** | portão: tsc, lint, teste, lixo, `bancada.js orfaos`, onda-atual × branch | segundos |
| **Fechamento** | ato nomeado — ver a seção **O fechamento**, no fim deste documento | minutos |
| **Adversarial** | quando `node db/mapa.js` acusa **arquivo novo** em eixo que esta onda tocou | horas |

A mudança central está na primeira linha: hoje o agente escreve, declara pronto, e a verdade aparece
uma onda depois. Com `npm test`, **ele fecha o próprio laço**.

**A quarta linha só virou executável agora.** Antes ela dizia "o mapa muda em um eixo que esta onda
tocou" e chamava isso de medível — mas **nenhum dos quatro gatilhos mandava alguém rodar o mapa**. Era
um critério medível que ninguém media. Agora `node db/mapa.js` é passo do fechamento, e ele **precede**
o adversarial.

**A ordem entre conferir e retratar não é detalhe: é o que impede a auto-absolvição.** O retrato apaga
exatamente a evidência que o adversarial consome. Então a sequência é rígida — **conferir → julgar →
retratar**, e retratar é o último passo do fechamento, nunca antes. É por isso que "não retrata o mapa"
é regra de ouro do ponto 7, e por isso que o deny mira **escrita em `db/mapa-baseline.json`**, não a
grafia do comando: `npm run mapa:retrato` existe versionado no `package.json` e passaria por cima de
qualquer deny escrito contra o comando longo.

### Escopo — derivado, não escrito

Snapshot define os números que não podem mudar · lint define as convenções · baterias definem os
cálculos · smoke define as telas, em lista versionada. Sobra para julgamento só **o risco novo que
esta onda introduz** — as lentes de caça, escolhidas a partir da mudança, não de um modelo fixo.

### Profundidade — escala com raio de estrago

Onda que acrescenta tela roda os dois primeiros níveis. Onda que mexe em `rh.colaborador`, em
autorização ou em cálculo de dinheiro roda os quatro.

### Dois comandos, não um — e o snapshot NÃO fica no rápido

| | Servidor | O que roda | Quando |
|---|---|---|---|
| `npm test` | **não** | motor puro, lint, baterias em arquivo, tsc | todo agente, todo commit |
| `npm run test:e2e` | **sim** | smoke de tela, payload, 401/403, 2FA, **snapshot** | fechamento da onda |

O portão rápido não pode depender do recurso escasso do ponto 2.

**Por que o snapshot saiu do portão rápido — o achado mais confirmado da revisão cruzada, por cinco
lentes independentes.** O ponto 1 recusa a ferramenta de limpeza com este argumento: *"com banco por
frente, o agente suja à vontade e o banco é descartado"*. Se o snapshot ficasse no `npm test`,
aconteceria isto:

> O agente da frente J-2 cria três colaboradores pela tela para provar um 403 — **explicitamente
> autorizado**. Roda o portão. O headcount mudou porque **ele** mudou. Vermelho. Não pode limpar (a
> ferramenta foi recusada), não pode ressemear sem destruir a fixture da própria prova, e com o
> `SubagentStop` do ponto 7 **não pode nem terminar**.

O ponto 2 apagou a contaminação **entre** agentes; não apagou a que o agente causa em si mesmo. E há
agravante conferido no disco: `db/semear/01-base.js:776` usa `new Date().getUTCFullYear()` e
`db/semear/04-clima.js:642` usa `CURRENT_DATE` — **o snapshot fica vermelho na virada do dia mesmo sem
ninguém sujar nada.**

Snapshot é medida de estado compartilhado; portão de agente é punição individual. Misturar os dois
reprova quem não errou. Ele vai para o fechamento, contra banco recém-semeado **com data congelada**.

### As baterias: as DUAS, com propósito declarado

| | Para quem | Quando usar |
|---|---|---|
| **Suíte em arquivo** | desenvolvedor e agente | rede de regressão — roda no portão, sem banco, em milissegundos |
| **Bateria no banco** | o DP | ferramenta de trabalho — ele acrescenta um caso pela tela quando quer conferir uma regra |

**Trava contra divergirem:** a suíte em arquivo inclui os casos do banco exportados, e o fechamento
confere que os dois conjuntos batem. Sem isso, caso acrescentado pela tela fica fora do portão.

### As três regras de lint

**1. Literal de negócio em `useState`/`defaultValue` de formulário.** Limpa, detectável na árvore
sintática, com lista de exceções.

**2. `papel ===` em decisão de acesso.** Trivial, com exceção para as travas anti-lockout de
`usuarios/servico.ts`.

**3. Float de hora ou dinheiro no domínio — a contagem que a aprovou não se sustenta.**

Eu escrevi aqui: *"4 ocorrências de `/60`, 9 de `/100`, zero `parseFloat`. Treze linhas, todas
fronteira legítima."* Foi esse número que mudou minha recomendação de "só a regra estreita" para "as
duas". A revisão cruzada mandou conferir. Medido em 01/08 com o comando ao lado:

| Busca | `src/dominios/**/*.ts` |
|---|---|
| `rg --fixed-strings "/ 60"` | **0** |
| `rg --fixed-strings "/ 100"` | **0** |
| `rg "parseFloat" src db` | **0** no código (só aparece dentro do JSON do próprio mapa) |
| `rg --pcre2 '/\s*[0-9]+'` (ampla) | **132**, quase toda ruído: `Lei 8.213/91`, `0047/0048`, `nota/5` |

**Os treze não existem.** Não é que fossem poucos ou muitos — eu não consigo reproduzir o número, e
ele era o argumento inteiro.

**O que fica de pé:** `parseFloat` proibido em `src/dominios` e em `db/`. É preventiva, custa nada e
hoje pega zero — e agora "zero" é medido, com o comando registrado.

**O que fica EM ABERTO:** a marcação das fronteiras legítimas. Ela dependia de existir uma lista curta
para anotar de uma vez; sem os treze, a lista precisa ser levantada de verdade antes de a regra ser
escrita. Vai junto do conserto dos 36 arquivos que o mapa não enxerga.

> A lição, que o próprio ponto 3 já exigia do mapa e eu não apliquei a mim mesmo: **número que decide
> coisa vem com o comando ao lado.** O meu não tinha.

Motivo da convenção, com evidência desta sessão: o corretor da folha registrou que *"somar float de
hora devolveria 346.90999999999997"*. Ele percebeu; o próximo pode não perceber.

### QUEM testa o quê — divisão de responsabilidade

O agente que escreve **verifica o que pretendia, não o que fez** — ele compartilha o modelo mental do
autor, que é ele mesmo. O filtro da folha é a prova: o autor escreveu um comentário explicando por que
filtrar no cliente estava certo, e verificou a própria intenção, que era coerente. Um agente
independente perguntou *"e se eu passar `centro_custo_id=999999`?"* e recebeu 58 linhas.

| Tarefa | Quem |
|---|---|
| Rodar o portão | **quem escreveu** |
| Provar que a correção dele funciona | **quem escreveu** |
| Escrever o caso de teste | **quem escreveu** — ele conhece as bordas |
| **Julgar se a cobertura basta** | **outro** |
| **Procurar o que mais quebrou** | **outro** |
| **Julgar se um achado é real** | **um cético por LENTE** — ver abaixo |
| **Escolher as lentes de caça** | **outro** — quem não dirigiu a onda |
| **Julgar se o enunciado da onda casa com o escopo** | **outro** — o enunciado errado já custou uma reprovação |

As duas últimas linhas faltavam. O escopo do ponto 3 é "derivado, não escrito", **menos** as lentes de
caça, que são escolha humana e ficavam com quem dirigiu a onda — quer dizer, quem tem o mesmo ponto
cego. E o enunciado tem evidência própria: escrevi *"varre ponto e folha"* para um agente proibido de
tocar em ponto, e o verificador teve que apontar que **quem afirmou "ponto e folha" foi o enunciado**.

**Quantos céticos: um por lente, não três por achado.** Este ponto dizia "de preferência três" e o
ponto 2 já tinha derrubado isso pela aritmética: 29 achados × 3 céticos = 87 agentes, boa parte
precisando de HTTP, com **uma vaga de servidor** — a camada de maior valor viraria a maior fila. O
desenho é **um cético por lente julgando o lote inteiro**: menos custo de partida, mesma independência
entre lentes, e foi o que rodou de fato na contestação de 01/08 (3 lentes × 10 eixos + juiz).

A redundância de três fica reservada a achado de **acesso, dinheiro ou fundação** — onde errar para o
lado do falso negativo é caro.

> **Cuidado com o vocabulário:** "eixo" (ponto 3, dez regras violáveis) e "lente" (ponto 2, ângulo de
> ceticismo) não são a mesma lista e não devem ser usados como sinônimos. Na contestação de 01/08 as
> lentes foram três — reprodução, consequência, já-tratado — aplicadas a cada um dos dez eixos.

A linha do meio é a mais sutil: **escrever o próprio teste é boa prática; decidir que ele é suficiente
é onde a pessoa se engana.** Já funcionou aqui — o agente que parametrizou a hora noturna escreveu os
casos da bateria (conhecia as situações), e um verificador independente **sabotou o motor** para
provar que a bateria acusava. Autor escreve o teste; verificador prova que o teste tem dente.

Exceção: mudança trivial — rótulo, cor, texto — não merece verificação independente. O sistema de
níveis resolve.

### O gatilho do adversarial — resolvido pelo MAPA DE EIXOS

Minha proposta era "dispara quando a onda mexe em fundação, acesso ou dinheiro". Ela morre na
evidência da própria onda I: os três achados mais caros — clima contando vínculo, meta presa ao nome
da unidade, `CURRENT_DATE` resolvendo vigência em UTC — **não estão em fundação, acesso nem dinheiro**.
O critério olha *onde a onda mexeu*; os defeitos moram *onde a mudança respinga*.

**Decisão do dono (01/08/2026):** construir um mapa, uma vez, com o modelo mais forte e sem economia de
token, cobrindo as duas metades — **o que existe** (varredura do código) e **o que falta** (ondas H, J,
K, L, M, N projetadas nos mesmos eixos).

**A condição que faz o mapa não virar mentira:** ele não é prosa, é **executável**. Cada linha carrega
a consulta que a gerou — não "14 lugares leem vínculo", e sim o grep/SQL que devolve os 14.
`db/mapa.js` reexecuta todos os eixos e **diferencia contra o estado registrado**. Mapa em prosa
envelhece em duas ondas, e mapa desatualizado com selo de autoridade é pior que mapa nenhum: a gente
pula a varredura confiando nele.

> **Gatilho final: o adversarial dispara quando o mapa muda em um eixo que esta onda tocou.**
> Isso é medível. "A onda mexeu em fundação" era chute.

**Os eixos** — o mapa se organiza por **regra que pode ser violada**, nunca por módulo ou pasta. Cada
eixo tem defeito real provando que existe:

| Eixo | A regra | O defeito que provou |
|---|---|---|
| pessoa × vínculo | contar gente ≠ contar contrato | clima contava vínculo |
| identidade de lugar | estabelecimento por id, nunca por nome | meta presa ao nome da unidade |
| tempo civil | hoje é em São Paulo, não em UTC | `CURRENT_DATE` na vigência |
| decisão de acesso | chave de permissão, nunca nome de papel | 2FA por papel; escopo 1→70 |
| dinheiro | centavos inteiros, divisor administrável | divisor 220 chumbado; DSR /6 |
| tempo trabalhado | minutos inteiros, hora reduzida | hora noturna: 1.050 vs 1.200 h |
| onde o filtro mora | servidor, nunca cliente | folha filtrando centro de custo no cliente |
| rastro de leitura | ler dado de terceiro deixa marca | três buracos na trilha |
| nada chumbado | limite, fator, divisor, dia são administráveis | `k` do anonimato constante |
| vigência | quem respeita início e fim | benefício atravessando a transferência |

Acrescentar eixo depois é barato — roda só o eixo novo. Não é aposta de tiro único.

**Ganho secundário:** com o que existe e o que falta no mesmo eixo, aparece que **duas ondas que tocam
o mesmo eixo custam uma verificação em vez de duas**. O mapa reordena o resto do projeto, não só reduz
erro.

**Como o mapa pode dar errado, e a guarda:** mapa incompleto com cara de completo — diz 14, eram 17, e
a gente pula os 3 *com confiança*. Guarda: **sabotagem**, a mesma técnica que provou que a bateria do
ponto tinha dente. Quebrar N pontos de propósito e conferir que o mapa apontou para eles. Mapa que não
passa na sabotagem não entra em uso.

---

## 4 · Memória — o que sobrevive à sessão — *FECHADO*

**Evidência:** três coisas desta sessão dizem o que está errado.

1. Quando o processo caiu às 2h26, recuperei o estado de **195 agentes** fazendo arqueologia num
   `journal.jsonl` em pasta temporária. Aquilo era memória por acidente.
2. A regra do salário estava registrada como *em aberto* no doc 10 §4.1 — e o dono teve que reexplicar
   do zero.
3. As pendências que travam o projeto estavam em **três lugares diferentes**: duas perguntas de negócio
   no cabeçalho da migration 0048, duas decisões legais com o dono, e a lista de rubricas com o Diego.
   Nada que bloqueia pode estar escondido dentro de um arquivo SQL.

### A regra que amarra o ponto 4 no ponto 3

> Todo achado termina em um de dois lugares: **virou portão** (lint, teste, entrada do mapa), ou **foi
> aceito de propósito** e alguém assinou. Nenhum fica em "anotado".

Hoje a lista de achados só cresce. Com essa regra ela **encolhe**: a hora noturna reduzida virou caso
de bateria e não precisa mais ser lembrada em prosa — o teste lembra, e melhor, porque ele *acusa*. É o
mesmo movimento do ponto 7: o que era prosa vira trava.

### Os cinco tipos, com prazo de validade declarado

| Tipo | Responde | Vive em | Morre quando |
|---|---|---|---|
| **Decisão** | por que é assim | `00_contexto/decisoes_arquiteturais.md` | nunca — só é revogada por outra decisão, registrada |
| **Achado** | o que já quebrou aqui | `docs/achados/<onda>.md` | quando vira portão (sobra a linha histórica) |
| **Número de referência** | quanto tem que dar | `docs/snapshots/` versionado | quando a regra muda — e a mudança é registrada junto |
| **Pendência externa** | o que espera terceiro | `docs/pendencias.md` | quando o terceiro responde |
| **Prova** | que a correção funciona | `fast-pessoas/provas/<onda>/` versionado | quando o caso vira teste em arquivo |
| **Estado da onda** | o que falta e quanto já foi | a lista de tarefas | no fechamento da onda |
| **Resposta a uma pendência** | o que o terceiro respondeu | vira **Decisão**, com a data e quem respondeu | nunca |
| **Contexto de sessão** | o que eu estava fazendo | o transcript | no fim da sessão — **descarta** |

**As três linhas do meio foram acrescentadas em 01/08, e a razão é constrangedora.** A tabela tinha
cinco tipos, e três artefatos que os pontos 3, 6 e 7 usam como instrumento **não se encaixavam em
nenhum** — então caíam por eliminação na linha que manda descartar:

- **A prova.** O ponto 6 põe a evidência de cada passo no informe de posição, que é contexto de sessão.
  A prova da onda I (91/91 telas, 45/45 chamadas) morava em `.tmp-i3/` e **eu a apaguei**. Por um dia a
  única evidência foi uma frase dentro de uma mensagem de commit.
- **O estado da onda.** O ponto 6 usa "tarefas fechadas sobre tarefas da onda" como o percentual que o
  dono lê. Se a lista é contexto de sessão, o indicador dele não tem denominador.
- **A resposta a uma pendência.** O `pendencias.md` diz quando a linha morre — "quando o terceiro
  responde" — e não dizia para onde a **resposta** vai. Sem isso, a decisão do contador sobre o 5º dia
  útil sumiria junto com a linha que a pediu.

A última linha continua sendo a que quase ninguém escreve e a que mais custa: 195 transcrições de
agente não são memória, são entulho com o valor já extraído.

### Duas memórias que não se misturam

- **Memória do projeto** → repositório, versionada. Sobrevive à troca de máquina, e o Diego ou o DP
  conseguem ler.
- **Memória de como trabalhar com o dono** → fica com o agente principal, entre sessões. Preferência
  por "bom que funciona", método protótipo→validação→código, a regra de só pedir autorização para o que
  põe o projeto em risco.

A segunda **nunca** entra no repositório — não é assunto do sistema.

### Decisões do dono (01/08/2026)

**Pendência externa:** `docs/pendencias.md` no repositório, com dono e data de cada uma.

**Achado aceito de propósito:** sobe sempre para o dono — mas **nunca como pergunta crua**. Sobe com a
minha decisão já tomada, o porquê, e os prós e contras dela.

> Esta segunda regra é maior que o ponto 4: ela é **o formato de todo hook para cima**. Não existe
> "o que você acha?" sem recomendação. Vale para o ponto 6 inteiro.

---

## 5 · Contexto: sessão × projeto — *FECHADO*

**Evidência:** escrevo à mão um bloco de ~40 linhas a cada onda, copiando e editando o anterior.
Convenção do projeto e objetivo da onda misturados, e o bloco deriva a cada cópia. O erro da onda I
saiu daí: escrevi *"varre ponto e folha"* para um agente proibido de tocar em ponto, e o verificador
teve que apontar que **quem afirmou "ponto e folha" foi o enunciado, não o relatório**.

### A pergunta certa não é "o que escrever"

É **o que fica sempre carregado e o que é buscado quando precisa.** Contexto sempre-carregado é imposto
pago por *todo* agente em *toda* tarefa — nesta onda, 195 agentes. Um `PROJETO.md` de 400 linhas seria
pior que o bloco de 40 copiado à mão, só que errado de outro jeito.

O projeto já tem o exemplo bom, e ele é minúsculo: `fast-pessoas/AGENTS.md` tem três linhas e diz uma
coisa só — *este Next não é o que você conhece, leia a documentação do `node_modules` antes de
escrever*. Funciona porque é **curto, universal, e corrige um viés errado que todo agente traz de
fábrica**.

### A convergência com o ponto 3

A lista da camada sempre-carregada saiu igual aos **dez eixos**. Não é coincidência: eixo é exatamente
"regra que todo agente pode violar sem perceber", que é a definição do que merece estar sempre em
contexto.

### As três camadas

| | Arquivo | Quem escreve | Quando morre |
|---|---|---|---|
| **1 · sempre** | `fast-pessoas/AGENTS.md` — os dez eixos, uma linha cada (~20 linhas) | uma vez | nunca; só muda quando um eixo muda |
| **2 · busca** | `docs/14-mapa-de-eixos.md` + `db/mapa-eixos.json` | o mapa, regenerável | reexecutado a cada onda |
| **3 · some** | `docs/onda-atual.md` — só o objetivo da vez | o começo da onda | **o fechamento apaga** |

O agente que mexe em clima lê o eixo pessoa×vínculo — não os dez. O prompt deixa de carregar convenção:
vira *"leia AGENTS.md"* + a tarefa. Para de derivar porque para de ser copiado.

### O risco da camada 3, e a guarda

A camada 3 é a que apodrece. Se ninguém apagar, o agente da onda K lê o objetivo da onda I e trabalha
para o alvo errado — em silêncio, que é o pior modo de falhar.

**Guarda:** a branch já diz qual é a onda (`onda-i`). O portão de commit confere que `docs/onda-atual.md`
fala da mesma onda que o nome da branch, e recusa se divergir. Custa uma linha e não depende de eu
lembrar.

### O que fica de fora, de propósito

**Um `PROJETO.md` geral**, com arquitetura e histórico. É o tipo de arquivo que ninguém relê e que
envelhece sem avisar. O que ele teria de útil já está em `00_contexto/decisoes_arquiteturais.md`, que
tem dono e regra de atualização.

---

## 6 · Hooks — quando alguém fala com quem — *FECHADO, com experimento*

**Evidência:** quatro coisas desta sessão.

1. O pulso de 15 minutos **contava arquivos**. O dono pediu noção do andamento e recebia "12 arquivos
   alterados", que não diz se alguma coisa funciona.
2. **O dono achou lixo rodando antes de mim, duas vezes** — *"existem vários lixos rodando"*, *"tem 10
   tarefas em execução simultânea"*. Quem é monitorado não pode ser quem monitora.
3. Quando o processo caiu às 2h26, perdi a visão de **195 agentes** e recuperei por arqueologia.
4. Um agente **escalou certo e a escalação se perdeu**: as duas perguntas de negócio sobre
   transferência entre CNPJs estão no cabeçalho da migration 0048. Ele não inventou regra, perguntou —
   só que num arquivo SQL, onde ninguém tropeça.

### Para cima: eu → o dono

| Gatilho | Formato |
|---|---|
| **Decisão que é dele** — regra de negócio, escolha legal, dinheiro | minha decisão + porquê + prós e contras (regra do ponto 4) |
| **Risco ao projeto** | o único caso que pede autorização |
| **Pulso de 15 min** | estado real |

**Estado real** são quatro linhas: portão verde ou vermelho e o que quebrou · achados abertos ×
fechados · **eixos tocados** (só existe porque o mapa existe) · **o que está travado esperando ele**.

Mais uma linha que conserta a evidência 2: **quantos agentes vivos e quantos mudos.** Daí em diante
quem acha o lixo sou eu.

E o **% deixa de ser chute**: vira tarefas fechadas sobre tarefas da onda. Consequência que não era
óbvia — **a lista de tarefas não é burocracia, é o denominador do indicador de andamento.** Enquanto
ela tiver item podre, o percentual mente junto.

### Para baixo: agente → eu

Três eventos — **achado grave** (na hora, não no fim), **bloqueio**, **decisão de negócio** (nunca
inventa regra; sobe, e vai para `docs/pendencias.md`, não para comentário de migration).

Só que os três são *eventos*, e **agente morto não dispara evento nenhum. Agente em loop também não —
ele está ocupadíssimo, girando.** Os dois piores estados eram invisíveis. Daí o informe de posição,
ideia do dono:

> a cada passo: **última** tarefa (com a PROVA), **em execução**, **próxima**

Não é auto-avaliação — é informe de posição, e por isso funciona contra loop: o agente girando
responde com honestidade total, e **responde a mesma coisa toda vez**. A repetição é o sinal.

### O experimento (01/08/2026)

Duas hipóteses, testadas com um agente real auditando os itens pendentes da onda I.

| | Resultado |
|---|---|
| **Ler o informe em pleno voo** | **funciona.** 5 leituras, progresso real a cada uma, com prova. Custo zero, sem interromper. |
| **Alcançar o agente em pleno voo** | **funciona, com protocolo.** |

Três achados que só apareceram por rodar de verdade:

1. **A resposta exige protocolo.** A sonda 1 pedia "responda" sem dizer por onde. Ela **foi entregue e
   o agente respondeu — em texto, que não me alcança**. Ele mesmo relatou depois: *"Sonda 1 chegou? sim
   (respondi em texto, que não te alcança)"*. Com só uma sonda eu teria concluído "não dá para
   alcançar", e errado. A sonda precisa dizer **como** responder.
2. **A sonda não interrompe chamada longa.** Ela é entregue *entre* chamadas de ferramenta. O agente
   estava dentro de `tsc` seguido de `lint` e a resposta levou ~2 minutos. A latência da sonda é
   limitada pela chamada mais longa do agente, não pelo meu relógio.
3. **Logo, prazo curto produz "morto" falso.** Meus 5 minutos morreram aqui: um agente rodando build de
   produção fica legitimamente mudo por mais que isso, e alarme falso é como se desliga um alarme.

### O desenho final

| A cada 15 min | eu **leio** os informes — grátis, não interrompe ninguém |
| Informe parado, e o `executando` **não** explica | eu **sondo aquele agente**, dizendo como responder |
| Sem resposta depois da sonda | mato e relanço, com o desvio nomeado no prompt novo |

O campo `executando` é o que torna o silêncio interpretável, e é o motivo de o formato do dono ser
melhor que um detector genérico de repetição:

- parado há 8 min em *"executando: npx tsc"* → normal
- parado há 8 min em *"executando: ler ficha-colaborador.tsx"* → isso é loop

**Piso que não depende de o agente colaborar:** mudez do arquivo de transcrição e repetição das
chamadas. Pega o agente pendurado em chamada que nunca volta — esse não emite informe nem responde
sonda.

### O que NÃO vira hook

Se tudo é hook, nada é. Ficam de fora: defeito achado e consertado dentro da onda, agente que falhou e
foi repetido, decisão com padrão óbvio. Esses eu resolvo e conto no relatório.

---

## 7 · System prompt — contenção — *FECHADO*

**Evidência:** as restrições que escrevi foram violadas. Um agente rodou `git reset` apesar do
"NÃO use". Três colisões de migration apesar do "confira antes". Lixo em commit quatro vezes apesar do
"não deixe lixo". Três instruções claras, em maiúsculas, três violações.

### Prosa não contém

**Contenção não se escreve, se constrói.** As camadas que de fato contêm são as outras: ferramenta que
aloca o número (1), branch e banco separados (2), lint e portão (3). O prompt é a camada mais fraca, e
eu a estava usando como primeira.

### Dois modos de falha, e só um é do agente

- **Desobediência** — ele sabia e não fez. Cura: portão. Texto mais enfático não cura.
- **Instrução inexequível** — ele *obedeceu* e não funcionou. A sonda 1 dizia "responda em uma linha";
  ele respondeu em texto, que não me alcança. "Pulse a cada 15 minutos" para quem não tem relógio é o
  mesmo caso. **Isso é erro meu, e prompt curto não resolve: prompt EXATO resolve.**

### O que sobra para escrever

Só o que passa nas três condições: não dá para virar portão · é executável de dentro do laço do
agente · corrige um viés que ele traz de fábrica.

Fica: os dez eixos (uma linha cada) · o protocolo do informe, incluindo **como responder a uma sonda**
· o que fazer quando travar (sobe, não inventa) · o escopo de escrita.

Sai, porque virou trava: número de migration · lixo · float de dinheiro, papel em decisão de acesso,
literal em formulário · "rode `tsc` antes de dizer pronto".

**Guarda contra ficar sem as duas proteções:** a linha só sai do prompt **depois** que o portão dela
existir e tiver sido testado. Nunca junto, nunca antes.

### As REGRAS DE OURO — o mecanismo, achado em 01/08/2026

Exigência do dono: *"precisamos dar um jeito de algumas regras de ouro o agente não poder quebrar."*
Existe mecanismo nativo — **hooks do Claude Code** ([documentação](https://code.claude.com/docs/en/hooks)).
Três fatos resolvem a questão:

1. **Hooks valem dentro dos subagentes.** A documentação é explícita: quando um subagente chama uma
   ferramenta, `PreToolUse` dispara os mesmos hooks configurados, e a entrada carrega `agent_id` e
   `agent_type`. **Uma regra escrita uma vez governa os 195.**
2. **O bloqueio é determinístico.** Saída com código 2 impede a chamada e o `stderr` vira a explicação
   que o agente recebe; ou JSON com `{"permissionDecision": "deny", "permissionDecisionReason": …}`.
   Não há como esquecer.
3. **`SubagentStop` com `{"decision": "block", "reason": …}` impede o agente de TERMINAR.** É o portão
   do ponto 3 com dentes: enquanto o teste estiver vermelho ele não declara pronto — não porque foi
   instruído, porque não consegue.

Configuração em `.claude/settings.json`, **versionada** — a regra viaja com o código, para mim e para
o Diego. Ressalva da própria documentação: para proibição dura, o filtro `if` é "melhor esforço" — o
certo é **regra de permissão mais hook**, não um só.

| Regra de ouro | Mecanismo | Por que ela existe |
|---|---|---|
| não reescreve histórico do git | deny + `PreToolUse` em Bash | um agente rodou `git reset` apesar do "NÃO use" |
| não edita migration já aplicada | `PreToolUse` `if: "Edit(db/migrations/*)"` | hoje o hash só reclama na hora de migrar, tarde demais |
| não escreve no Supabase | deny nas ferramentas MCP do Supabase | LGPD: só dado fictício, e o banco de trabalho é o local |
| **não declara pronto com portão vermelho** | **`SubagentStop`** | é o ponto 3 inteiro virando trava |
| não commita lixo | `PreToolUse` em `Bash(git commit *)` | lixo em quatro commits |
| **não apaga prova** | `PreToolUse` em `Bash(rm *)` sobre pasta de prova | **eu apaguei a prova da onda I** — a regra de que eu mais precisava era contra mim |
| **não retrata o mapa nem o snapshot** | deny em **escrita** a `db/mapa-baseline.json` e a `docs/snapshots/` | agente que retrata apaga o próprio gatilho |
| não usa `--sem-portao` | `PreToolUse` em Bash | a bandeira faz o mapa sair 0 mesmo com arquivo novo |

**Os denys miram o EFEITO, não a grafia do comando.** Correção de 01/08: eu tinha escrito o deny do
retrato como `Bash(node db/mapa.js retrato*)` — e **eu mesmo havia acrescentado `npm run mapa:retrato`
ao `package.json` duas horas antes**. O atalho versionado passava por cima da regra. Regra geral: hook
que bloqueia comando é contornável por qualquer alias novo; hook que bloqueia **escrita no arquivo**
não é.

**O `SubagentStop` precisa de válvula.** Do jeito que estava escrito, portão vermelho por causa alheia
prende o agente — e o impede até de escalar que está preso. É um impasse construído. Fica: ele avalia o
portão **sobre a partição daquele agente**, e **libera a saída** quando o agente devolve um relatório
de bloqueio classificado (o quê, desde quando, por que não é dele). O relatório vira evento "bloqueio"
do ponto 6.

---

## O fechamento da onda — o ato que faltava

Quatro pontos penduravam obrigação em "o fechamento", e **o fechamento não era ator, nem ato, nem
comando**. Ninguém dizia quem declara a onda encerrada. Pior: como não era ator, o deny do ponto 7
negaria o retrato para todo mundo — inclusive para o fechamento — e o baseline nunca seria regravado;
ou eu me autodeclararia "o fechamento" e a regra de ouro viraria decoração. Não havia terceira opção
escrita.

E faltava o principal: **o merge para a `main` não aparecia em nenhum dos sete pontos.** Desenhamos
branch por onda, bancada por frente, portão e fechamento — e nunca escrevemos o caminho de volta. É por
isso que a onda I está parada em `onda-i` até hoje.

**Fica assim:** `npm run fechar-onda` é o ato, rodado **pelo agente principal, depois do de-acordo do
dono** — e é o único contexto em que os denys de retrato são liberados.

| # | Passo | Vem do ponto |
|---|---|---|
| 1 | `npm test` e `npm run test:e2e` verdes, com **snapshot** contra banco recém-semeado e data congelada | 3 |
| 2 | `db/migracoes.js conferir` nos dois bancos (local e Supabase) | 2 |
| 3 | Smoke contra o Supabase — **subida, migrations e o subconjunto somente-leitura** | 1, 2 |
| 4 | Conferir que a bateria em arquivo e a do banco batem | 3 |
| 5 | **`node db/mapa.js`** — o diff que decide se o adversarial roda | 3 |
| 6 | **Camada adversarial**, se o passo 5 acusou eixo tocado | 3 |
| 7 | Fechar `docs/achados/<onda>.md`: todo achado vira portão ou é aceito e assinado | 4 |
| 8 | **Merge para a `main`** | 2 |
| 9 | **`node db/mapa.js retrato`** — último, nunca antes do passo 6 | 3 |
| 10 | `db/bancada.js destruir` das bancadas da onda, e `orfaos` para conferir | 2 |
| 11 | Apagar `docs/onda-atual.md` e destruir worktree experimental | 2, 5 |
| 12 | Relatório ao dono, no formato do ponto 6 | 6 |

A ordem dos passos 5, 6 e 9 é rígida: **conferir → julgar → retratar.** Retratar antes de julgar apaga
a evidência que o adversarial consome.

O passo 8 vem antes do 9 de propósito: o retrato tem que descrever o estado que **de fato** entrou na
`main`, não um estado que ainda podia mudar no merge.

---

## Ordem de execução

1. **Ferramentas** (item 1) — maior desperdício medido, e as outras dependem dela.
   **Cada ferramenta nasce com o hook que a torna obrigatória** — ferramenta sem trava é ferramenta
   opcional, e opcional é ignorada. Isto adianta um pedaço do item 7 para cá, de propósito.
2. **Sandbox** (item 2) — banco local por frente; o Postgres já está pronto
3. **Verificação** (item 3) — `npm test` + regras de lint, **incluindo `db/`**, que hoje o lint ignora
4. **Memória** (item 4) e **Contexto** (item 5) — baratos, feitos junto
5. **Hooks** (item 6) e **Prompt** (item 7) — o resto das regras de ouro
6. **O fechamento** — só depois que os cinco existirem, porque ele os invoca em sequência

## O que isso custa e o que devolve

Estimativa: **6 a 10 horas de máquina** para os cinco primeiros.

Restam seis ondas (H, J, K, L, M, N). Se o ganho for o do artigo — 30% de tempo, 20% de token — se
paga nas duas primeiras. Se for metade disso, ainda se paga.

E tem um ganho que não está no número: **o defeito que a regra de lint pega nunca chega a existir.**
Hoje ele nasce, atravessa a construção, sobrevive ao build, e só morre quando um agente o caça — se
caçar.
