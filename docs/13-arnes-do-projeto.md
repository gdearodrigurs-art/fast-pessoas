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

## 1 · Ferramentas definidas — *a maior dor medida*

**Evidência:** todo verificador reescreveu do zero: abrir conexão, montar `SELECT`, fazer login HTTP,
gerar o código TOTP, comparar payload. Dezenas de vezes, em todas as ondas.

**Vira:**

| Ferramenta | O que resolve |
|---|---|
| `db/consultar.js "<SQL>"` | fim do script `pg` ad-hoc a cada agente |
| `db/logar-como.js <persona>` | devolve cookie pronto, resolve senha + TOTP |
| `db/snapshot.js <nome>` | retrato dos números-chave, para comparar antes/depois |
| `db/proximo-migration.js` | **aloca** o número — fim das colisões |

Regra no prompt: *"use estas ferramentas; não reimplemente."*

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
