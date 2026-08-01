<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Fast Pessoas — o que todo agente precisa saber antes de escrever

> Curto de propósito. Isto é carregado em **toda** tarefa, então cada linha aqui é imposto pago por
> todo agente. O que não corrige um viés que você já traz de fábrica não deve estar aqui — está em
> [docs/13-arnes-do-projeto.md](../docs/13-arnes-do-projeto.md).

Neste projeto o middleware chama-se **`proxy.ts`**, não `middleware.ts`.

## Os dez eixos — as regras que dá para violar sem perceber

Cada uma tem um defeito real que a pagou. O detalhe está em
[docs/14-mapa-de-eixos.md](../docs/14-mapa-de-eixos.md); leia **o eixo que a sua tarefa toca**, não os
dez.

1. **pessoa × vínculo** — contar gente é diferente de contar contrato. Uma pessoa pode ter dois vínculos.
2. **identidade de lugar** — empresa, estabelecimento e centro de custo se identificam por **id**, nunca por nome.
3. **tempo civil** — "hoje" é em `America/Sao_Paulo`. Use `rh.hoje()`, nunca `CURRENT_DATE`.
4. **decisão de acesso** — sempre por **chave de permissão**, nunca por nome de papel.
5. **dinheiro** — centavo **inteiro**. Divisor, fator e teto vêm do banco, nunca do código.
6. **tempo trabalhado** — minuto **inteiro**. A hora noturna é reduzida (52min30s, art. 73 §1º).
7. **onde o filtro mora** — escopo e autorização filtram no **servidor**, dentro da consulta. Filtro no cliente é enfeite.
8. **rastro de leitura** — ler dado sensível de terceiro grava em `audit.leitura_sensivel`, com a chave que **de fato** autorizou.
9. **nada chumbado** — limite, prazo, lista e percentual são administráveis pela tela. Nada nasce fixo no código.
10. **vigência** — registro com início e fim só vale dentro da janela. Quem encerra o vínculo fecha as janelas dele.

O lint barra três destes sozinho (o 4, o 9 em parte, e float). O resto depende de você.

## Ferramentas — use estas, não reimplemente

A lista está em **[db/README.md](db/README.md)**. Rode `--help` em qualquer uma antes de escrever a
sua. Se você está prestes a abrir conexão de banco na mão, fazer login por HTTP ou comparar payload
entre perfis, **pare**: já existe comando para isso.

Toda ferramenta segue a mesma forma:

```
node --env-file=.env.local-db db/<ferramenta>.js <args> --banco <nome>
```

O `--env-file` dá host e credencial; o `--banco` dá o banco. **Nunca há valor padrão de banco.**

## Antes de declarar pronto

```
npm test        # ~2s, sem servidor
npm run lint    # tem que sair 0
```

Não declare pronto com portão vermelho. Se ele está vermelho por causa que **não é sua**, escreva um
relatório de bloqueio dizendo o quê, desde quando e por que não é seu — isso libera a sua saída e abre
um evento para o agente principal. O que não vale é ficar preso em silêncio.

## Como você fala com o agente principal

**Ao terminar cada passo**, sobrescreva o seu arquivo de informe com quatro linhas:

```
passo: <n> de <total>
ultima: <o que acabou de fazer> — PROVA: <arquivo:linha ou comando que comprova>
executando: <o que vai fazer agora>
proxima: <o passo seguinte>
```

O campo `executando` é o que torna o seu silêncio interpretável: parado em "rodando npm test" é
normal; parado em "lendo tal arquivo" há dez minutos é laço infinito.

**Se receber uma sonda**, responda chamando a ferramenta de mensagem com destino `main`. Texto seu
não alcança ninguém — já se perdeu uma resposta assim.

## Quando travar, sobe. Não invente.

Regra de negócio que você não sabe **não se decide no código**. Escreva em
[docs/pendencias.md](../docs/pendencias.md), com a sua recomendação, o porquê e os prós e contras — e
siga com o resto da tarefa. O que trava não pode virar comentário dentro de um `.sql`: foi onde duas
decisões já se perderam.

## O que você pode escrever

Só o que a sua tarefa nomeia. **Um agente, um escopo.** Se precisar mudar arquivo compartilhado
(`db/lib/banco.js`, `eslint.config.mjs`, `package.json`), escreva o pedido no relatório e resolva
localmente — outros agentes podem estar no mesmo arquivo agora.

Algumas coisas são barradas por hook, e você recebe a explicação na hora: reescrever histórico do git,
apagar prova ou migration versionada, escrever no Supabase, e retratar o mapa ou o snapshot.
