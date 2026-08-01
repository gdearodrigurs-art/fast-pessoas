# As ferramentas do arnês

> **Use estas; não reimplemente.** Elas existem porque cada verificador reescrevia do zero: abrir
> conexão, montar `SELECT`, fazer login por HTTP, gerar código TOTP, comparar payload. Dezenas de
> vezes, em todas as ondas, cada um de um jeito e cada um errando diferente.

## A forma, igual em todas

```
node --env-file=<ambiente> db/<ferramenta>.js <args> --banco <nome>
```

O **`--env-file`** dá host, usuário e senha. O **`--banco`** dá o nome do banco. A ferramenta troca só
o nome na URL e mantém o resto.

**Não existe banco padrão**, e isso é de propósito: ferramenta que adivinha banco escreve no lugar
errado uma vez só, e é a única vez que importa. O nome da bancada vive no prompt da sua frente.

| Ambiente | Aponta para | Quando |
|---|---|---|
| `.env.local-db` | PostgreSQL local | **sempre**, para trabalhar |
| `.env` | Supabase | só apresentação; escrever lá é barrado por hook |

Toda ferramenta responde a **`--help`** com exemplo real. Rode antes de perguntar.

---

## `consultar.js` — rodar SQL e ver o resultado

```
node --env-file=.env.local-db db/consultar.js "SELECT count(*) FROM rh.pessoa" --banco fast_pessoas_dev
```

Tabela alinhada, `null` visível como `null` (a diferença entre nulo e string vazia já custou tempo
aqui), e o **tempo da consulta** — numa apuração que levava 340 s, 99,6% era espera de banco, e saber
o tempo é metade do diagnóstico. `--json` para encanar, `--limite` para cortar (e ele **avisa** quanto
ficou de fora).

## `migracoes.js` — conferir e **alocar** número

```
node --env-file=.env.local-db db/migracoes.js conferir --banco fast_pessoas_dev
node db/migracoes.js nova transferencia_pede_o_lider
```

`conferir` cruza disco × banco, confere o SHA-256 de cada aplicada e aponta colisão de prefixo e
buraco na sequência. `nova` **aloca** o próximo número e cria o arquivo com cabeçalho-modelo — foi a
escolha na mão que produziu três colisões e dois arquivos `0049`.

## `bancada.js` — um banco por frente de trabalho

```
node --env-file=.env.local-db db/bancada.js criar j_b --banco postgres
node --env-file=.env.local-db db/bancada.js listar --banco postgres
node --env-file=.env.local-db db/bancada.js destruir j_b --sim --banco postgres
node --env-file=.env.local-db db/bancada.js orfaos --banco postgres
```

Cria, migra e semeia em ~5 s. Existe porque **três vezes** um agente escreveu no banco enquanto outro
media — uma delas invalidou uma medição inteira: *"o total de vínculos MUDOU durante a verificação
(71 → 72 → 73)"*. O `--banco` aqui é o de manutenção (`postgres`), porque não dá para apagar um banco
estando dentro dele.

## `snapshot.js` — os números de referência

```
node --env-file=.env.local-db db/snapshot.js medir --banco fast_pessoas_dev
node db/snapshot.js comparar antes-da-onda-j depois-da-onda-j
```

`medir` mostra sem gravar. `tirar` grava, e **só o fechamento da onda tira retrato** — quem retrata
apaga o próprio ponto de comparação. Mede só o que **não depende do relógio**: contagem estrutural,
integridade referencial, dinheiro de competência já fechada.

## `logar-como.js` — fábrica de sessão, **não** bypass

```
node --env-file=.env.local-db db/logar-como.js dp@fastdemo.local --banco fast_pessoas_dev --curl
node --env-file=.env.local-db db/logar-como.js --listar --banco fast_pessoas_dev
```

Chama a mesma função que a rota de login chama. Pula a digitação da senha e do TOTP, **não** a lógica
de autorização — com atalho ingênuo, a classe inteira de defeito que mais rendeu aqui fica invisível.
Imprime quem é a pessoa, qual vínculo, qual empresa e **quantas chaves** ela compõe.

> **O que ela NÃO prova:** o TOTP é pulado. Achado sobre 2FA, enrolamento ou bloqueio de entrada não
> pode ser provado com ela, nem para o lado positivo nem para o negativo. Para esses, login de verdade
> com o `codigo-2fa.js`.

## `comparar-personas.js` — a mesma rota, olhos diferentes

```
node --env-file=.env.local-db db/comparar-personas.js /api/colaboradores --banco fast_pessoas_dev
```

Tabela de persona × HTTP × itens × bytes, mais o **diff de chaves e de ids**. É a forma exata da lente
que mais rendeu no projeto: foi um salto de **1 para 70** que revelou um dos piores defeitos. Precisa
do servidor no ar (`npm run dev:local`) e **não sobe servidor sozinho** — a vaga é uma só.

## `mapa.js` — quem mais depende disto?

```
node db/mapa.js                 # confere
node db/mapa.js vigencia        # só um eixo
```

Reexecuta as 110 consultas dos dez eixos e diferencia contra `mapa-baseline.json`. **Arquivo novo em
um eixo** é o gatilho da camada adversarial. O `retrato` é do fechamento, e é barrado por hook para
todo o resto — a ordem é rígida: **conferir → julgar → retratar**.

## `exportar-baterias.js` — a bateria do banco vira arquivo

```
node --env-file=.env.local-db db/exportar-baterias.js --banco fast_pessoas_dev
```

Existem duas baterias de propósito: a do banco (o DP acrescenta caso pela tela) e a em arquivo (roda no
`npm test`). Esta ferramenta é a trava contra elas divergirem — sem ela, caso acrescentado pela tela
fica fora do portão.

---

## As de sempre

| | |
|---|---|
| `migrar.js` | aplica as migrations. Migration aplicada é **imutável**: o hash trava. |
| `semear-demo.js` | popula a demonstração. Repetível: rodar duas vezes dá o mesmo banco. |
| `seed-admin.js` | cria a conta real do dono num banco novo. |
| `codigo-2fa.js` | gera o TOTP de uma persona — para quando o 2FA **precisa** ser provado. |
| `servidor.js` | sobe o Next apontando para o banco **local** (`npm run dev:local`). |

## Escrever ferramenta nova?

Leia `db/lib/banco.js` primeiro — é o contrato: `lerArgumentos`, `resolverConexao`, `exigirLocal`,
`abrir`, `ajudaSePedida`, `morrer`. **Não reimplemente conexão nem parsing de `--banco`.** E não edite
o contrato: escreva o pedido no seu relatório, porque outros agentes podem estar em cima dele agora.
