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

**Cinco firmes, uma opcional.** O número é curto de propósito: agente com ferramenta demais perde
tempo escolhendo, e cada uma precisa ter propósito que não se confunde com o das outras.

| | Ferramenta | O que substitui |
|---|---|---|
| 1 | `db/consultar.js "<SQL>" [--local]` | o `node -e "const {Pool}=require('pg')…"` de cada agente |
| 2 | `db/logar-como.js <persona> [--local]` | a dança de login que cada verificador reimplementou |
| 3 | `db/snapshot.js <nome>` · `comparar <a> <b>` | eu digitando "HE 50%=27333…" de memória em todo prompt |
| 4 | `db/migracoes.js conferir` · `nova <nome>` | 3 colisões de número + a conferência disco×banco à mão |
| 5 | `db/comparar-personas.js <rota> [personas…]` | o comparador de payload reescrito a cada verificação de acesso |
| — | `db/trilha.js "<comando>"` | *opcional, baixa prioridade* — o antes/depois de `audit.leitura_sensivel` |

Regra no prompt: **"use estas; não reimplemente."** Cada uma responde a `--help` com exemplo real, e
todas ficam listadas no `PROJETO.md` (ponto 5).

### Decisões tomadas ao fechar este ponto

**Nada de bypass na tela de acesso.** A pergunta foi legítima — os dados são 100% fictícios, um atalho
no login pouparia trabalho. Mas os melhores achados desta sessão vieram de agentes fazendo login de
verdade: gestor de outro CNPJ aprovando demanda, ficha vazando o vínculo que a autorização bloqueia,
2FA por nome de papel, uma caixa marcada levando de 1 a 70 colaboradores. **Com atalho, essa classe
inteira de defeito fica invisível.** E, depois da 0040, a sessão carrega estado real (`pendente_2fa`,
chaves que autorizaram) — um bypass ingênuo inventaria isso e faria passar teste que devia falhar.

O `logar-como.js` é **fábrica de sessão, não bypass**: chama a mesma função que a rota de login chama.
Pula a digitação da senha e do TOTP, não a lógica de autorização. Três travas: recusa em
`NODE_ENV=production`, recusa fora do banco de demonstração, e vive em `db/` — fora de `src/`, não
entra no build.

**O `comparar-personas` é a de maior retorno.** É a forma exata da lente que mais rendeu: um
verificador fez isso em 16 rotas, uma a uma, escrevendo o comparador do zero. Virando comando,
qualquer onda roda barato, e a lente deixa de depender de alguém pedir.

**Smoke das telas NÃO é ferramenta — é portão (ponto 3).** Todo agente de fechamento fez, e cada um
fez diferente: um cobriu 10 telas, outro 13, outro 91. É determinístico e dá passa/falha, então entra
no `npm test` e roda igual toda vez.

**Não existe ferramenta de limpeza de dado de teste** — o ponto 2 apaga o problema. Com banco por
frente, o agente suja à vontade e o banco é descartado. Construir a ferramenta seria resolver um
problema que estamos prestes a deletar.

**Varredor contínuo de lixo: recusado, com a boa ideia aproveitada.** A proposta era um agente
varrendo sempre e indicando candidatos, com a decisão ficando comigo. O que há de certo nela —
**separar quem detecta de quem decide** — é exatamente o que faltou nas quatro vezes que lixo entrou
em commit. Mas: (a) o padrão no `.gitignore` já resolveu — depois de `.tmp-*/` e `_verif-*`, zero lixo
nos dois últimos commits; (b) agente vivo custa RAM, que é o nosso gargalo medido (0,34 GB no pico);
(c) viraria ruído, porque a maioria dos candidatos é arquivo de agente em serviço — os vinte
`.tmp-out_api_*.json` pareciam lixo e eram um cético trabalhando; (d) é o mesmo erro que este
documento existe para corrigir: agente onde regra resolve.

Vira **portão no commit** (ponto 7): lista os não rastreados que o `.gitignore` não cobre e exige
confirmação. Custo zero, fala só quando há algo, acontece na hora certa, e o que aparecer sem padrão
vira padrão novo. **A ideia do varredor fica guardada** para quando houver folga de máquina — ela
cobre o que a regra não previu, como o `prova-*.js` que ninguém tinha imaginado.

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
escrevia na hora, profundidade era chute. Hoje existem **zero arquivos de teste** e o
`eslint.config.mjs` tem 23 linhas — o padrão do Next, nenhuma regra nossa.

### Gatilho — quando

| Gatilho | Quando | Custo |
|---|---|---|
| **Agente** | antes de qualquer agente declarar pronto | segundos |
| **Commit** | portão: tsc, lint, teste, lixo | segundos |
| **Fechamento** | build, migrations nos dois bancos, smoke, baterias, snapshot | minutos |
| **Adversarial** | *EM DISCUSSÃO — ver abaixo* | horas |

A mudança central está na primeira linha: hoje o agente escreve, declara pronto, e a verdade aparece
uma onda depois. Com `npm test`, **ele fecha o próprio laço**.

### Escopo — derivado, não escrito

Snapshot define os números que não podem mudar · lint define as convenções · baterias definem os
cálculos · smoke define as telas, em lista versionada. Sobra para julgamento só **o risco novo que
esta onda introduz** — as lentes de caça, escolhidas a partir da mudança, não de um modelo fixo.

### Profundidade — escala com raio de estrago

Onda que acrescenta tela roda os dois primeiros níveis. Onda que mexe em `rh.colaborador`, em
autorização ou em cálculo de dinheiro roda os quatro.

### Dois comandos, não um

| | Servidor | Quando |
|---|---|---|
| `npm test` | **não** — motor puro, lint, snapshot contra banco local | todo agente, todo commit |
| `npm run test:e2e` | **sim** | fechamento da onda |

O portão rápido não pode depender do recurso escasso do ponto 2.

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

**3. Float de hora ou dinheiro no domínio — ficou VIÁVEL depois de eu contar.** Eu tinha chutado
"muito falso positivo". Contagem real em `src/dominios/`: **4 ocorrências de `/60`, 9 de `/100`, zero
`parseFloat`**. Treze linhas, todas fronteira legítima (gravar no banco, formatar tela, montar memória
de cálculo). Então vale a versão ampla: `parseFloat` proibido (custa nada, hoje pega zero, é
preventiva) **mais** marcador explícito nas treze — uma anotação única, e daí em diante qualquer
conversão nova precisa se justificar.

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
| **Julgar se um achado é real** | **outro ainda**, de preferência três |

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
| **Contexto de sessão** | o que eu estava fazendo | o transcript | no fim da sessão — **descarta** |

A última linha é a que quase ninguém escreve e a que mais custa: 195 transcrições de agente não são
memória, são entulho com o valor já extraído.

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

## 7 · System prompt — contenção

**Evidência:** as restrições que escrevi foram violadas. Um agente rodou `git reset` apesar do
"NÃO use". Três colisões de migration apesar do "confira antes". Lixo em commit quatro vezes apesar
do "não deixe lixo".

**Vira:** curto. Porque **o que era prosa vira portão** nos itens 1, 2 e 3 — número de migration é
alocado por ferramenta, lixo é barrado por `.gitignore` com padrão, convenção é barrada por lint.
Sobra pouca coisa para pedir por escrito, e o que sobra tem chance de ser obedecido.

---

## Ordem de execução

1. **Ferramentas** (item 1) — maior desperdício medido, e as outras dependem dela
2. **Sandbox** (item 2) — banco local por frente; o Postgres já está pronto
3. **Verificação** (item 3) — `npm test` + regras de lint
4. **Memória** (item 4) e **Contexto** (item 5) — baratos, feitos junto
5. **Hooks** (item 6) e **Prompt** (item 7) — consequência dos anteriores

## O que isso custa e o que devolve

Estimativa: **6 a 10 horas de máquina** para os cinco primeiros.

Restam seis ondas (H, J, K, L, M, N). Se o ganho for o do artigo — 30% de tempo, 20% de token — se
paga nas duas primeiras. Se for metade disso, ainda se paga.

E tem um ganho que não está no número: **o defeito que a regra de lint pega nunca chega a existir.**
Hoje ele nasce, atravessa a construção, sobrevive ao build, e só morre quando um agente o caça — se
caçar.
