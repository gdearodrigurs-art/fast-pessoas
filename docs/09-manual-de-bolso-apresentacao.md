# Manual de bolso — apresentação do Fast Pessoas

> Uma folha para segurar na mão. O roteiro completo, com as falas na íntegra e as
> respostas para perguntas difíceis, está em `07-roteiro-demonstracao.md`.
> **Tempo total: 24 minutos.**

---

## ANTES DE ENTRAR NA SALA (5 min)

```bash
cd "C:\sistema RH\fast-pessoas"
npm run db:demo          # reseta os dados (~100 s)
npm run build            # ~40 s
npm run demo             # sobe em http://localhost:3001
```

☐ **Build de produção, nunca `npm run dev`** — em modo dev o sistema erra ao navegar rápido
☐ **Seu 2FA já configurado** (faça antes, não na frente dela)
☐ **Internet funcionando** — o banco está na nuvem; sem internet nada abre
☐ **Terminal do lado** para os códigos de 2FA:
  `node --env-file=.env db/codigo-2fa.js dp@fastdemo.local`
☐ **5 janelas anônimas abertas**, uma por persona (as sessões se atropelam se compartilharem a janela)

**Senha de todas as contas:** `FastDemo2026!`

| Persona | E-mail | 2FA |
|---|---|---|
| DP | `dp@fastdemo.local` | sim |
| Gestor | `gestor@fastdemo.local` | **não** |
| Funcionária | `funcionario@fastdemo.local` | **não** |
| Recrutadora | `recrutador@fastdemo.local` | sim |
| RH | `rh@fastdemo.local` | sim |
| Diretora | `diretora.pessoas@fastdemo.local` | sim |

> **Avise antes que alguém repare:** nas contas com 2FA, a primeira tentativa mostra o campo do
> código **junto com** uma mensagem vermelha de erro. É o segundo fator sendo pedido, não falha.

---

## 1 · ABERTURA — 1 min, sem tela

Não abra nada. Diga as três regras que sustentam tudo:

> "Hoje a informação de pessoas está espalhada em planilha, pasta, e-mail e WhatsApp. Ninguém
> responde rápido 'quantas férias estão vencendo' ou 'por que esse desconto apareceu'. O sistema
> junta isso com três regras: **todo número é explicável**, **cada um vê só o que a função exige**,
> e **o histórico não é reescrito**."

---

## 2 · O DIA DO DP — 4 min · `dp@`

**`/demandas`** → aba Fila do DP
- 20 na fila · 3 vencendo hoje · 10 atrasadas
- O aviso cinza: 10 travadas no gestor **não contam como atraso do DP**
- **Faça ao vivo:** clique *Assumir* numa atrasada

**`/colaboradores`** → Juliana Costa Ferreira
- Aponte o salário: *"dado sensível · leitura gravada na trilha"*
- 🔑 **"Você acabou de ver o salário dela. O sistema registrou que você viu, quando e de quem. Nesta base já há 554 leituras registradas."**
- Aba **Linha do tempo**: a história da pessoa em ordem, sem ninguém montar

---

## 3 · A FOLHA — 4 min · `dp@` — **o momento mais forte**

**`/folha`** → competência **06/2026 (FECHADA)** → Folhas calculadas → *Ver itens* → abra a **Memória de cálculo do INSS**

Deixe o público ler o JSON na tela. Depois:

- 🔑 **"Quando o colaborador perguntar 'por que descontaram R$ 165,44?', vocês não refazem a conta. A conta está gravada junto com o valor: a base, cada faixa, a alíquota, o arredondamento e qual versão da tabela do INSS foi usada."**
- Aponte **"salário congelado"**: aumento futuro não reescreve folha passada
- Abra **07/2026 (ABERTA)**: 319 variáveis lançadas
- 🔑 **"Fechada não reabre — correção se faz em competência futura. Folha que reabre é folha que ninguém audita."**

---

## 4 · OS DOIS PORTAIS — 3 min

**`gestor@` → `/portal-gestor`** (entra direto, sem 2FA)
- 10 liderados · 2 férias vencendo (risco de dobro) · 2 avaliações vencidas · 8 aprovações pendentes · turnover 19% com a conta ao lado
- 🔑 **"Quando alguém está afastado, o gestor vê só o fato. Nenhum tipo, nenhum motivo médico chega até ele."**
- 🔑 O bloco de treinamentos está **vazio e explicado**: *"preferimos a caixa vazia explicada a fingir que temos o dado"*

**`funcionario@` → `/portal-colaborador`**
- Férias, solicitações, benefícios, 7 documentos aguardando ciência, PDI
- **Remuneração não aparece aqui** — dúvida de salário abre solicitação para o DP
- **Faça ao vivo:** responda o check-in do dia (2 emojis, 10 segundos)

---

## 5 · ⭐ O FEEDBACK DA ANALISTA VIROU FUNCIONALIDADE — 7 min

**Este é o bloco a proteger se o tempo apertar.** Abra olhando para ela:

> "Você mandou o documento com os comentários em vermelho. Nós lemos linha por linha, respondemos
> por escrito e implementamos. O que você vai ver agora **não existia** quando você comentou."

**5a · A segregação (2 min)** — `recrutador@` → home
- A home dela tem **poucos cards**: vaga, candidato, o próprio portal. Sem ficha, sem folha, sem afastamento
- Tente abrir `/colaboradores`: **ela só vê a si mesma**
- 🔑 **"Você disse que R&S não deve ver histórico de DP. Você estava certa — e o papel antigo via. Hoje são papéis diferentes, e o sistema recusa."**

**5b · O RCF (1 min)** — `/cargos` → Vendedor(a) → **Abrir versão imprimível**
- Missão, atividades, CHA em 3 colunas, na ordem do documento oficial de vocês
- 🔑 **"Perguntamos o que era RCF em vez de adivinhar."** É imprimível — o documento que o gestor assina
- A recrutadora **lê o RCF** (é o insumo da vaga) mas **não vê faixa salarial**

**5c · Aniversariantes e diversidade (1 min)** — `rh@` → `/relatorios`
- 6 aniversariantes em julho · **só dia e mês, sem o ano** ("idade não é necessária para parabenizar")
- Diversidade: 27 mulheres, 33 homens, **2 recortes suprimidos**
- 🔑 **"Recorte com menos de 5 pessoas não é publicado — num quadro de 62, publicar 'uma pessoa' identifica alguém."**

**5d · Promoção com cadeia (2 min)** — `diretora.pessoas@` → `/demandas` → aba Promoções
- **DEM-0066**: Estoquista → Conferente. Cadeia visível: **1 Líder aprovada · 2 Diretoria pendente**
- **Faça ao vivo: clique "Aprovar (diretoria)"**
- 🔑 **"Era isso que você descreveu: aprova e, no mesmo instante, o DP e o T&D já ficam cientes. Ninguém precisa avisar por WhatsApp."**
- Mostre **DEM-0064** com o selo *"Fora da faixa — com exceção"*: não bloqueia, exige justificativa escrita e fica marcado para sempre

**5e · Pesquisa + check-in (1 min)** — `rh@` → `/pesquisas` → resultado
- Adesão 75,8% · **eNPS +25,5** · Filial Leste com eNPS **−50**
- A pior pergunta da rede: *"recebo do meu líder feedback que me ajuda a melhorar" = 2,64*
- 🔑 **"Você disse que o check-in não substitui a pesquisa. Estava certa — agora existem os dois."**
- 🔑 **"Pesquisa que não vira plano de ação é formulário. Aqui o pior número tem dono, prazo e status."**

---

## 6 · OS NÚMEROS DA DIRETORIA — 4 min · `diretora.pessoas@`

**`/painel-executivo`** — 9 cards, cada um com **A CONTA** escrita embaixo
- Headcount 62 · Turnover 13,01% · Absenteísmo 1,31% · Clima 3,87 · eNPS +25,5
- 🔑 **Custo de pessoal aparece BLOQUEADO**: *"ele não mostra número aproximado nem mascarado. Quem não tem a chave da folha não recebe o número — e a tela diz qual chave falta."*
- 🔑 **ROI de treinamento: SEM FONTE.** *"Um ROI estimado num painel de diretoria vira decisão errada."*

**`/organograma`**
- Realizado **62** · Aprovado **64** · 2 posições em aberto
- 🔑 **"Não existe organograma digitado à mão: mudar o gestor na ficha muda esta tela."**

**`rh@` → `/metas`** — 9 indicadores, 4 no vermelho
- Entrevistas de desligamento **71,4% contra meta de 90%** 🔴 · férias vencidas **5** 🔴 · eNPS 25,5 contra 30 🔴
- 🔑 **"Nenhuma meta é fixa no sistema — o RH define. E alterar a meta não sobrescreve a anterior: período já apurado continua avaliado pela meta da época. Ninguém melhora o trimestre passado baixando a meta hoje."**

**Se sobrar 1 min** — `/clima/painel`: média geral 3,9 parece bem; role até *Média por unidade* e mostre **Filial Norte EM QUEDA (−1,2)**. 🔑 *"A média da rede escondia. Nenhum gestor abriu chamado; o sistema mostrou."*

---

## 7 · FECHAMENTO — 1 min

> "Quatro ideias:
> 1. **Cada um vê o que a função exige** — o gestor vê a falta, não o motivo médico; a recrutadora vê a vaga, não a ficha.
> 2. **Todo número é explicável** — e onde não há fonte, está escrito que não há.
> 3. **O histórico não é reescrito** — folha fechada não reabre, meta antiga não some.
> 4. **O feedback do RH virou funcionalidade em uma onda de trabalho** — e o que não deu, está na lista com o motivo."

---

## SE PERGUNTAREM

| Pergunta | Resposta curta |
|---|---|
| "Os dados são reais?" | Não. Empresa, pessoas, CPFs e CNPJs são fictícios. Nenhum dado real de funcionário entrou. |
| "E o controle de ponto?" | Depende de **contratar** um registrador homologado — exigência da Portaria 671, não escolha técnica. Todo o tratamento (espelho, banco de horas, alimentar a folha) já está pronto para receber. |
| "E o eSocial?" | O transmissor está construído; falta o **certificado digital** da empresa e o teste no ambiente restrito do governo. |
| "Vamos desligar o Nasajon?" | Não de uma vez. A folha própria roda **em paralelo** até os números baterem por competências seguidas. Só então corta. |
| "E o treinamento / Sults?" | Fica no Sults por enquanto. A decisão é absorver depois — por isso os cards de treinamento aparecem vazios e explicados. |
| "Quem garante que ninguém vê o que não deve?" | O sistema, não a confiança. É permissão por chave conferida no banco a cada chamada — e testamos isso com **428 verificações** nesta última rodada. |
| "Quanto tempo levou?" | Do primeiro documento de arquitetura ao sistema povoado: **6 dias**. |

---

## SE DER ERRADO AO VIVO

| Problema | Saída |
|---|---|
| Tela com erro | Recarregue (F5). Se insistir, use o **screenshot** em `docs/demo/` e siga falando |
| Login não passa | O código de 2FA expira em 30 s — gere outro no terminal |
| Internet caiu | Passe para os screenshots. São 18, cobrem todo o roteiro |
| Dados bagunçados por um clique | `npm run db:demo` reseta em 100 s (só entre blocos, não na frente deles) |

---

## PEÇA UMA DECISÃO ANTES DE SAIR

Não termine só com aplauso. Três respostas que valem a reunião:

1. **Qual módulo o DP começa a usar de verdade primeiro?**
2. **Quem do time participa dos testes?**
3. **Autorização para cotar o sistema de ponto** (é o que destrava o módulo).
