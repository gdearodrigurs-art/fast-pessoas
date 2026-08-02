# Lista de teste — passar o sistema inteiro a limpo

> Escrita em 02/08/2026 para o dono percorrer o sistema sozinho, sem roteiro de demonstração.
> São **45 telas** e **175 rotas de API**. Esta lista cobre as telas, agrupadas por como o DP
> trabalha — não pela ordem em que foram construídas.
>
> **Onde:** `http://localhost:3001` · **senha de todas as personas de demo:** `FastDemo2026!`
>
> Marque com `[x]` o que passou e escreva ao lado o que incomodou. O que você anotar aqui vira
> a próxima onda.

## Antes de começar: com quem entrar

| Persona | 2FA | Para que serve nesta lista |
|---|---|---|
| `gestor@fastdemo.local` | **não** | o teste de escopo — ele só pode ver a equipe dele |
| `funcionario@fastdemo.local` | **não** | o portal de quem não é RH |
| `diretora.pessoas@fastdemo.local` | sim | vê a rede inteira, salário e clima |
| `dp@fastdemo.local` | sim | folha, férias, ponto, admissão, desligamento |
| `rh@fastdemo.local` | sim | avaliação, pesquisa, documentos, relatórios |
| `recrutador@fastdemo.local` | sim | R&S — e **não** vê salário nem saúde |
| `g.dearodrigurs@gmail.com` / `123456` | sim | admin: usuários e perfis |

**O 2FA é de verdade.** Quem exige TOTP cai na tela de configuração no primeiro login, com QR code.
Se não quiser mexer com autenticador agora, faça a lista inteira com `gestor` e `funcionario`, e
deixe os papéis de RH para uma segunda passada.

---

## 1 · A pergunta que vale mais que qualquer tela

**Abra a MESMA tela com duas personas diferentes.** É o teste que mais rendeu neste projeto — foi
assim que apareceu um defeito em que uma caixa marcada levava de 1 para 70 colaboradores visíveis.

- [ ] `/colaboradores` com `gestor@` → deve mostrar **11**
- [ ] `/colaboradores` com `dp@` → deve mostrar **71**
- [ ] `/colaboradores` com `recrutador@` → **sem coluna de salário**
- [ ] `/folha` com `recrutador@` → deve **negar**, não mostrar vazio

> Negar e mostrar vazio são coisas diferentes. Tela vazia faz o usuário achar que não há dado;
> negação diz que ele não tem acesso. Se alguma vier vazia em vez de negada, anote.

---

## 2 · O que é novo — a onda I, que você ainda não viu

- [ ] **`/estrutura`** — as 4 empresas do grupo e os centros de custo. Tela que não existia.
      Tente **inativar** uma empresa e veja se os centros de custo dela somem dos seletores.
- [ ] **Ficha da Renata Queiroz Pinheiro** (`/colaboradores`, procure pelo nome) — ela é a pessoa
      **transferida entre CNPJs**. Tem dois vínculos: matrícula **1005 desligada** e **1071 ativa**.
      Confira: o bloco "Vínculos desta pessoa no grupo" mostra os dois? A linha do tempo atravessa
      os dois contratos, ou reinicia?
- [ ] **Filtros de empresa / centro de custo** — eles existem em quatro lugares e devem combinar
      entre si: `/colaboradores`, `/organograma`, `/relatorios`, `/folha`.

> **Não faça uma transferência nova pela tela.** O conserto da escala é o único achado que ainda
> não entrou: uma transferência criada agora deixa a escala antiga aberta e a nova sem nascer. A
> da Renata já está no banco e é segura de olhar.

---

## 3 · Cadastro e estrutura

- [ ] `/colaboradores` — a lista, os filtros combinados, a busca
- [ ] `/colaboradores/[id]` — a ficha inteira: dados, cargo, RCF, histórico, documentos, linha do tempo
- [ ] `/cargos` — a lista, e `/cargos/[id]/rcf` (o RCF imprimível, na ordem oficial)
- [ ] `/organograma` — a árvore vertical. A raiz abre na tela? Dá para navegar fundo?
- [ ] `/usuarios` e `/perfis` *(admin)* — criar perfil, mover chave de permissão, e ver a trilha

**Olhe especialmente:** algum campo que **já vem preenchido** sem você ter escolhido. Foi uma
família inteira de defeito neste projeto — dias de férias e abono iam ao POST sem ninguém escolher.

---

## 4 · Ponto e banco de horas

- [ ] `/ponto` — a fila de intercorrências, com contador real
- [ ] `/ponto/espelho/[colaboradorId]` — o espelho de um mês, que é o documento de fiscalização
- [ ] `/ponto/parametros` — jornadas, escalas, feriados, tolerância, e a **bateria de casos de teste**
- [ ] `/meu-ponto` *(como `funcionario@`)* — saldo, média de HE por dia, espelho próprio

**Olhe especialmente:** o **adicional noturno**. A hora noturna vale 52min30s por lei, não 60 — foi
um defeito que custava 150 horas por mês com 10 plantonistas. E o **divisor** da jornada: quem faz
36h não pode ser cobrado por 44h.

---

## 5 · Folha

- [ ] `/folha` — a lista de competências
- [ ] `/folha/[id]` — abrir uma competência: lançamentos, cálculo, memória de cálculo por pessoa
- [ ] **Importar do ponto** — o que a apuração mediu vira variável, sem redigitação
- [ ] Reimportar a mesma competência — **não pode duplicar**
- [ ] Tentar lançar em competência **fechada** — deve recusar
- [ ] `/folha/parametros` — rubricas, faixas de INSS e IRRF, divisores

**Olhe especialmente:** os valores em centavos. Se algum aparecer com casa decimal estranha, anote —
ontem foi corrigido um caso em que 8,3333% era pago como 8,33%.

---

## 6 · Ciclo de vida

- [ ] `/admissoes` e `/admissoes/[id]` — o checklist de admissão
- [ ] `/desligamentos` e `/desligamentos/[id]` — o assistente, com a verificação de estabilidade
- [ ] `/ferias` — programação, período aquisitivo, e o alerta de vencimento
- [ ] `/afastamentos` — os tipos, e o efeito na folha
- [ ] `/demandas` e `/demandas/[id]` — promoção e transferência, com a cadeia de dois níveis

**Olhe especialmente:** em férias, o alerta **"VENCIDA — dobro"**. Hoje ele dispara aos 11 meses, e
a lei dá 12 (art. 134) — é uma das pendências esperando sua decisão.

---

## 7 · Gente e desenvolvimento

- [ ] `/avaliacoes`, `/avaliacoes/[id]` e `/avaliacoes/modelos` — o ciclo 360
- [ ] `/clima`, `/clima/painel` e `/clima/individual` — o check-in e o painel
- [ ] `/pesquisas`, responder uma, e ver o resultado
- [ ] `/recrutamento` — o kanban da vaga, do candidato à oferta
- [ ] `/documentos` — envio, ciência, download

**Olhe especialmente:** o **piso de anonimato**. Numa unidade pequena, o resultado do clima e da
pesquisa deve ser **suprimido**, não publicado. Ontem foi corrigido um caso em que o piso contava
respostas em vez de pessoas — então tente achar a menor unidade e veja se ela some.

---

## 8 · SST

- [ ] `/sst` — ASO, EPI, CAT e a avaliação psicossocial da NR-1

**Olhe especialmente:** quem **não** deveria ver dado de saúde. Entre com `recrutador@` e `lider_td@`
e confira que a descrição clínica não aparece para eles.

---

## 9 · Visão de cima

- [ ] `/painel-executivo` — os indicadores com sparkline
- [ ] `/metas` — a Central de Metas, e a meta por estabelecimento
- [ ] `/relatorios` — aniversariantes, diversidade, composição familiar, headcount
- [ ] `/portal-gestor` *(como `gestor@`)* — o time, banco de horas, alertas
- [ ] `/portal-colaborador` *(como `funcionario@`)* — a visão de quem não é RH
- [ ] `/notificacoes` — o sino, e o que dispara notificação

**Olhe especialmente:** em `/relatorios`, o corte de **diversidade**. Recorte pequeno tem que ser
suprimido — se aparecer "1 pessoa" em alguma faixa, isso é reidentificação.

---

## 10 · As bordas que costumam quebrar

- [ ] Trocar de persona **sem fechar o navegador** — a sessão anterior vaza?
- [ ] Abrir uma tela e ficar parado até a sessão expirar (8h) — o que acontece?
- [ ] `/trocar-senha` e `/configurar-2fa`
- [ ] Navegar direto para uma URL que você não tem permissão (ex.: `/folha` como `funcionario@`)
- [ ] Voltar pelo botão do navegador depois de sair

---

## O que eu já sei que está torto

Anotado para você não gastar tempo redescobrindo:

| | |
|---|---|
| **Roteiro de demonstração** | `docs/07` parou na onda E — não menciona estrutura nem transferência |
| **Escala na transferência** | o conserto não entrou; não crie transferência nova pela tela |
| **Férias 11 × 12 meses** | espera sua decisão |
| **Folha 5º dia** | corrido × útil — espera o contador |
| **4 lotações** | com centro de custo de outra empresa do grupo (ids 78, 108, 141, 142) |
| **Comentário da 0048** | descreve duas regras que foram revertidas depois |

---

## Como anotar

Não precisa ser bonito. O que ajuda de verdade:

1. **Em que tela**, e **com qual persona**
2. **O que você esperava** e **o que apareceu**
3. Se for número errado, **o número** — foi assim que quase todo defeito grande deste projeto caiu

Um "achei estranho" sem número também vale: metade dos achados começou assim.
