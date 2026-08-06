# Lista de execução — reavaliada depois que o dono usou o sistema

> Substitui a **ordem** do [docs/10](10-plano-pos-reuniao-diretoria.md); o conteúdo das ondas H a N
> continua valendo lá. O que mudou é que agora existe uma **segunda fonte de verdade**: o que
> quebrou quando um humano tocou nas telas ([docs/16](16-caderno-do-teste.md)).

## Três coisas que a sessão de teste revelou sobre o plano

**1. Metade do que o dono "pediu novo" já estava planejado, com outro nome.**

| O que ele pediu testando | Onde já estava |
|---|---|
| "consulta antes da oferta" no kanban | **L1** — *Etapa "Pesquisa social", antes da Oferta* |
| checklist de admissão por tipo de vínculo | **L2** — *Checklist personalizável (PJ ≠ CLT)* |
| assinatura com valor jurídico nos documentos | **N2** — *ciência com hash e data* |
| pedir revisão de valor de benefício | **H3** — *Solicitar revisão de valor* |

Isso é bom sinal: o plano acertou o **quê**. A sessão de teste entregou o **como** — e, nos quatro
casos, mostrou que sai mais barato do que parecia, porque as tabelas já existem.

**2. Apareceu uma forma que atravessa cinco ondas.** O padrão *catálogo → modelo → regra que
escolhe* cabe em nove lugares (avaliação, admissão, recrutamento, desligamento, EPI, ASO, aprovação,
feedback, clima). Tratados como nove funcionalidades, são nove telas e nove aprendizados. Tratados
como **uma forma aplicada nove vezes**, são uma tela desenhada bem e replicada. A diferença de custo
é grande, e a de usabilidade é maior ainda.

**3. Uma onda fechou com a ação principal faltando na tela.** A F foi dada como pronta, e
`intercorrencia_ponto` sempre teve o status `corrigida` — **sem botão**. O ato de fechamento de onda
confere `tsc`, `lint`, testes e migrations; não confere *"a tela oferece o que o banco espera"*.
Vale acrescentar essa pergunta ao fechamento: **para cada estado que o banco admite, existe caminho
na tela?**

---

## A ordem nova

### Onda 0 — Os incômodos · *~1 a 2 dias*

O que o dono esbarra toda vez que abre o sistema. Individualmente banal; juntos, são a diferença
entre demonstração e sistema.

| | Item | Marca |
|---|---|---|
| 0.1 | nome da pessoa no cabeçalho em todas as telas | + defesa em `ROTULOS_PAPEL`, que hoje renderiza `undefined` para perfil criado por operador |
| 0.2 | "Concluir" → **Aprovar** · "Programar" → **Solicitar** | os dois botões prometem ato que não executam |
| 0.3 | linha *adicionar documento extra* na admissão | zero migration; falta só o POST |
| 0.4 | duas abas em documentos + **visualizar em pop-up** | políticas · documentos da pessoa |
| 0.5 | categoria de devolução vira **catálogo** | hoje carro e tablet não cabem |
| 0.6 | trava de MIME no upload | hoje aceita `.exe` |

### Onda 0b — Os que enganam número · *pequena, mas não cosmética*

| | Item | Por que não pode esperar |
|---|---|---|
| 0b.1 | **conta sem ficha não abre demanda** | a DEM-0069 já está no banco apontando para ninguém |
| 0b.2 | **botão Corrigir** + formulário estruturado do ponto | com 30 intercorrências abertas, o único caminho é explicar ou descartar |
| 0b.3 | **escala do sparkline** + valor no mouse | 0,03 p.p. desenhado como montanha; a magnitude não aparece em lugar nenhum |

### 1 — H · Benefícios · *o argumento não mudou e ficou mais forte*

Continua onde estava na fila e sobe para primeira: **quanto mais adesões no formato antigo, mais
cara a migração** — são 322. E o dono achou testando um defeito no fluxo de criação (valores só
aparecem ao criar nova versão).

Inclui o **H3** que ele cobrou: solicitar revisão de valor, com histórico.

### 2 — O padrão modelo · *nova, e cobre L1 + L2 do plano antigo*

Uma tela desenhada uma vez — catálogo à esquerda, modelo à direita, regra que escolhe embaixo — e
aplicada na ordem do mais barato para o mais caro:

1. **admissão** (chave + índice; sem tabela nova, sem catálogo — o mais barato dos nove) = **L2**
2. **recrutamento** (modelos versionados + a etapa de consulta) = **L1**
3. **clima** (perguntas: catálogo, continuidade, regra de edição)
4. **avaliação** por cargo

Fica para depois, com conversa própria: **EPI e ASO por cargo** (a lei cobra, e é o único par onde o
erro tem fiscal) e **cadeia de aprovação por valor** (mexe em autoridade e dinheiro).

### 3 — J · Folha: três visões e OLAC

Marcado por ela como *"muito importante mesmo"*. Depende da I, que está pronta.

### 4 — Disciplinar + Posse · *novas, e são uma só*

As duas desembocam no desligamento e se completam:

- **medidas disciplinares** — a cadeia como sugestão, preventiva com desfecho obrigatório, o ciclo do
  documento que exige assinatura (prazo → assinou / recusou / testemunhas)
- **registro de posse** — para EPI **já dá hoje** (é consulta; o índice existe desde o primeiro dia e
  nunca foi usado); para ativos, tabela nova com tipo e quantidade

O ciclo do documento com testemunhas **não é só do disciplinar**: resolve o **N2** (ciência do Código
de Conduta), onde hoje quem não dá ciência fica pendente para sempre.

### 5 — K · Visibilidade em camadas

Destravada pela decisão de 2026-07-31 (sub-árvore recursiva do organograma). Ganha um vizinho novo:
**permissão por registro** em ocorrências, para o gestor ver o disciplinar da própria equipe sem
expor suspensão a quem abre qualquer ficha.

### 6 — Painel executivo: filtro lateral

Separada porque o custo está escondido: o layout é uma tarde, mas são **24 consultas sem filtro**, e
algumas não podem ser filtradas honestamente (clima, eNPS e diversidade batem no piso de anonimato).
Entrega por partes, com cada cartão dizendo se honrou o filtro ou não.

### 7 — M · Pesquisa com público-alvo · 8 — N · Preparação para uso real

Sem mudança, menos o N2, que sai daqui e vai para a 4.

---

## O que continua travado, e por quem

**Seis decisões esperando o dono** ([docs/pendencias.md](pendencias.md)): transferência entre CNPJs é
rescisão ou continuidade · saldo de banco de horas transfere · férias 11 ou 12 meses · folha no 5º dia
corrido ou útil · rubricas com o Diego · o balde anônimo com corte às 21h.

**Quatro perguntas desta sessão**, ainda sem resposta:

1. "Aprovar" serve para todo tipo de demanda, ou o rótulo vem do tipo?
2. Avisar ao concluir admissão com item não obrigatório pendente — entra?
3. No checklist de admissão, quem manda: **tipo de vínculo** ou **cargo**?
4. Vaga aberta pode trocar de modelo de processo?

**Terceiros:** REP-P · certificado e-CNPJ (eSocial) · T&D (Sults) · Diego (layout dos importadores e
lista de rubricas).

---

## Um aviso sobre o tamanho

Somando o que já estava planejado com o que a sessão de teste levantou, a fila cresceu. As ondas 0 e
0b são dias; da 1 em diante são semanas cada.

Se em algum momento for preciso cortar, o critério que eu usaria: **fica o que o DP faz toda semana,
sai o que impressiona na demonstração.** Foi o que fez a lista de teste melhorar quando ela foi
refeita — o trabalho do DP é *fazer*, não *olhar*.
