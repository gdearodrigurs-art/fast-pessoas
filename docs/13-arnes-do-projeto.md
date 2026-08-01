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

## 2 · Sandbox — *o maior risco de correção*

**Evidência:** 32 commits direto na `main` antes de adotarmos branch. Zero worktrees. Contaminação de
banco três vezes, uma delas invalidando uma medição de desempenho inteira.

**Vira:**
- **Branch por onda** — já adotado em 31/07
- **Worktree por frente** quando houver paralelismo em arquivos próximos
- **Banco local por frente** — o PostgreSQL 18 já está montado: 0,44 ms de latência contra 215 do
  Supabase, semeador completo em **5 s** contra 300. O Supabase fica só para a demonstração.

---

## 3 · Verificação com gatilho, escopo e profundidade

**Evidência:** sete varreduras do mesmo tipo de defeito, cada uma se dizendo completa. Gatilho era
"quando eu decido", escopo era o que eu escrevia na hora, profundidade era chute.

**Vira:**

**`npm test`** — roda em segundos, contra o banco local:
- as duas baterias que já existem (ponto 10/10, folha 6/6)
- snapshots de regressão dos números de referência
- testes das funções puras (`calculo.ts` do ponto e da folha)

**Regras de lint próprias** para as convenções invioláveis — o que hoje é prosa repetida em todo prompt:
- literal de negócio em `useState`/`defaultValue` de formulário
- `papel ===` em decisão de acesso (com a lista de exceções legítimas)
- float de hora ou de dinheiro no domínio

**Gatilho:** todo agente roda `npm test` antes de declarar pronto. Nenhuma onda commita sem verde.

**O que continua sendo agente:** a camada adversarial. Julgar se um achado é defeito real ou
curiosidade exige raciocínio — a lente da consequência derrubou coisas que reproduziam
perfeitamente e não prejudicavam ninguém. Isso arnês nenhum faz.

---

## 4 · Memória — o que sobrevive à sessão

**Evidência:** os 40 achados da onda F/G vivem num `journal.jsonl` em pasta temporária. O log de
decisões sou eu que escrevo, quando lembro. **Agente nenhum escreve na memória do projeto.**

**Vira:**
- `docs/achados/<onda>.md` — versionado, escrito pelo fechamento de cada onda
- `docs/snapshots/` — os números de referência, versionados, para o teste de regressão comparar
- Log de decisões: o agente que **toma** a decisão registra, não eu depois

---

## 5 · Contexto: sessão × projeto

**Evidência:** escrevo à mão um bloco de ~40 linhas a cada onda, copiando e editando o anterior.
Convenção do projeto e objetivo da onda misturados. Ele deriva a cada cópia.

**Vira:**
- `.claude/PROJETO.md` — imutável: arquitetura, convenções, credenciais da demo, comandos, o que
  nunca fazer
- `docs/onda-atual.md` — só o objetivo da vez; some quando a onda fecha
- O prompt do agente passa a ser **"leia PROJETO.md"** + a tarefa. Para de ser copiado.

---

## 6 · Hooks — quando alguém fala com quem

**Evidência:** o pulso de 15 minutos conta arquivos. Agente só fala no fim, num bloco gigante. Quando
o processo caiu às 2h, perdi a visão de **195 agentes** e recuperei fazendo arqueologia no journal.

**Vira:**
- **Pulso com estado real**: testes passando? achados abertos? erros de compilação? — não contagem
  de arquivos
- **Checkpoint no meio** da onda, estruturado, não só relatório final
- **Regra de quando o agente me procura**: achado grave, decisão de negócio, bloqueio. E de quando
  **eu procuro você**: decisão que é sua, risco ao projeto, dinheiro.

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
