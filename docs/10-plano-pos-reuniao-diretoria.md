# Plano de execução — feedback da reunião com a Diretora de Pessoas

> Reunião de 2026-07-30. 18 pontos levantados + a prioridade declarada.
> **Nada foi implementado ainda.** Este documento é a ordem de execução proposta.
>
> Antes de escrever, conferi no código e no banco cada afirmação que dependia do
> estado atual do sistema. As correções de premissa estão na seção 1 — três delas
> mudam o tamanho do trabalho.

---

## 1. O que a verificação mudou em relação ao relato

Quatro pontos precisam ser recolocados antes de virar tarefa:

### 1.1 Centro de custo existe, mas está escondido — e o modelo precisa virar TRÊS campos

A diretora disse *"não vi isso em lugar nenhum"*. O dado existe (`rh.lotacao.centro_custo`,
migration 0002) e aparece na ficha — mas **grudado na unidade**, como sufixo:
`Matriz Centro · CC CC-1000`. Sem rótulo próprio, mostrando código sem nome, e não filtrável.
Quem procura "centro de custo" na tela não acha. A crítica dela procede na prática.

**Decisão do usuário (2026-07-30): separar em três campos independentes.**

| Campo | O que responde | Hoje |
|---|---|---|
| **Registro** | Em qual **empresa do grupo** (CNPJ) a pessoa está registrada | **não existe** |
| **Lotação** | O **local físico** onde ela trabalha | existe (`estabelecimento` — as 5 unidades) |
| **Centro de custo** | Onde o **custo** dela cai | existe como texto livre, sem cadastro nem nome |

São ortogonais: alguém pode estar **registrada no CNPJ do CSC**, **lotada na Matriz Centro** e
com **custo no CC de TI**. Hoje o sistema não consegue expressar isso — trata unidade e centro
de custo como uma coisa só e não conhece as empresas.

Isso **absorve a Onda I** (os 4 CNPJs) e vira uma mudança estrutural única.

### 1.2 A tela de avaliação **não está quebrada** — ela é omissa para quem não avalia

Ela relatou *"clico em Responder avaliação e fica uma folha em branco"*.

Reproduzi: aberta pelo **avaliador** (o gestor), a tela renderiza o formulário completo —
3 pilares, 15 indicadores, escala 1–5 e "não observado". O problema aparece para **quem não
é o avaliador**: a API responde 200 com `responder: false, sou_avaliador: false`, e como o
ciclo ainda não está consolidado **não há resultado para mostrar** — a tela então não desenha
nem formulário, nem resultado, nem explicação. Resultado visual: página em branco.

**A causa é de UX, não de dado.** Custo baixo, e some da frente de qualquer um que abrir um
ciclo alheio.

### 1.3 O alerta de contrato de experiência leva para a ficha, não para a avaliação

Ela disse *"não consigo ir para fazer a avaliação"*. Confirmado no código: o alerta de
experiência no portal do gestor aponta para `/colaboradores/{id}`. O caminho para responder
existe, mas em **outro bloco** da mesma tela ("Avaliações em que você é o avaliador").
São dois problemas diferentes, e este é um link errado — correção de uma linha.

### 1.4 Ponto e banco de horas: **não existe nada**, e isso é bom saber

Nenhuma tabela de marcação, jornada, escala ou banco de horas no banco. É construção do zero.
**Mas — e isto é o que importa para a resposta a ela — só a marcação depende de contratar
o REP-P homologado (Portaria 671).** Espelho, banco de horas, saldo, média de hora extra e
as visões do colaborador e do gestor são nossas e podem ser feitas agora, consumindo
marcações de onde vierem (importação de arquivo, digitação assistida, ou o REP-P quando
chegar). **A prioridade número um dela não está bloqueada.**

### 1.5 Dois campos que não existem e o item 11 exige

A regra de visibilidade que ela pediu inclui **telefone e e-mail** na ficha visível a todos.
`rh.colaborador` não tem esses campos hoje. Entram junto.

---

## 2. Ordem de execução

O critério de ordenação: **primeiro a prioridade declarada**, depois o que é **barato e
corrige defeito visível**, depois o que **muda modelo de dado** (quanto mais cedo, menos
retrabalho), e por último o que é **módulo novo isolado**.

---

### ONDA F — Ponto e banco de horas · a prioridade da diretoria

> *"De tudo, a coisa que ela mais enfatizou é o controle de folha de ponto e banco de horas,
> mais visível para o funcionário e para o gestor."*

Maior bloco do plano. Ordem interna:

**F1. Fundação de jornada e marcação**
- Jornadas e escalas versionadas com vigência (5x2, 6x1, 12x36, intervalos, tolerâncias)
- Feriados por município/unidade — **hoje não existem e já fazem falta** em férias e prazos
- Tabela de marcação com origem declarada (REP-P, importação, ajuste manual), preparada para
  receber o AFD/AEJ quando o registrador for contratado
- Importador de marcações por arquivo, para o sistema funcionar antes da contratação

**F2. Motor de apuração**
- Espelho de ponto da competência contra a jornada vigente
- Horas extras por faixa (50%/100%), adicional noturno, faltas, atrasos, DSR
- **Banco de horas**: saldo, crédito, débito, expiração conforme regra parametrizável
- Tratamento de marcação com workflow de ajuste e aprovação do gestor (auditado)

**F3. Visibilidade — o que ela pediu textualmente**
- **Portal do colaborador**: saldo do banco de horas, **média de hora extra por dia**,
  **total do último mês**, espelho do mês, histórico
- **Portal do gestor**: banco de horas **do time**, quem está estourando hora extra,
  pendências de ajuste para aprovar
- **Ficha do colaborador**: bloco de ponto com o resumo e o histórico
- Indicadores na Central de Metas (horas extras sobre horas trabalhadas, saldo médio)

**F4. Ligação com a folha**
- Horas apuradas viram variáveis da competência automaticamente (hoje são digitadas)

---

### ONDA G — Correções e ajustes baratos

Tudo aqui é pequeno e tira defeito da frente. Vale fazer em bloco, logo após (ou em paralelo
com) a F, porque são independentes entre si.

| # | Item | Origem |
|---|---|---|
| G1 | Tela de avaliação: mostrar estado explicado para quem não é o avaliador (em vez de página vazia) | 1.2 |
| G2 | Alerta de contrato de experiência → link direto para responder a avaliação | 1.3 |
| G3 | Folha: **bloquear abertura de competência retroativa** (hoje o esquema aceita de 2020 a 2100) | ponto 17 |
| G4 | Folha: botão **adicionar rubrica** (hoje só dá para criar nova versão de rubrica existente) | ponto 14 |
| G5 | SST: **NR-1** com validade, renovação, alerta e indicador — espelho do que o ASO já faz | ponto 18 |
| G6 | Portal do gestor: bloco de treinamentos segue vazio e explicado (nada a fazer até o módulo existir) | ponto 10 |

---

### ONDA H — Benefícios: mudança de modelo

**Este item inverte o desenho atual e por isso vem cedo** — quanto mais adesões existirem no
formato antigo, mais caro fica migrar.

Hoje: catálogo com **regra de elegibilidade**, a pessoa **se candidata**, o DP defere.
Como ela quer: **ninguém se candidata** — a pessoa já entra com direito. O que varia é o
**valor por pessoa** (VT de R$ 600 para um, R$ 720 para outro, conforme o custo de deslocamento).

- H1. Remover a lógica de candidatura/elegibilidade; benefício passa a ser atribuído por padrão
- H2. **Valor individual** por adesão, informado pela pessoa ao solicitar
- H3. **Solicitação de revisão de valor** (mudou de casa, passagem aumentou) com histórico —
  o valor anterior não some, vira versão encerrada
- H4. **Aprovação da revisão**: definir se vai para o DP ou para o gestor imediato — **decisão
  sua** (ver seção 3)
- H5. **Dependentes cadastrados pelo próprio colaborador**, sem passar por DP/RH
- H6. Migrar as adesões existentes para o modelo novo (a demo tem 322)

---

### ONDA I — Estrutura: registro, lotação e centro de custo

> *"Vamos dividir em 3 campos: registro (qual empresa a pessoa está registrada), lotação
> (local físico onde ela trabalha) e centro de custo (onde o custo dela cai)."*
> *"A pessoa pode mudar entre os CNPJs e esse histórico não é perdido."*

**Subiu de posição** (era a 4ª, virou a 3ª): os três campos são a base de que a conferência
da folha (J), a ficha (K) e os relatórios dependem. Fazer depois significa refazer.

- **I1. Empresa do grupo** — entidade nova (CNPJ, razão social, tipo): indústria, varejo,
  franquia e CSC. Os estabelecimentos passam a pendurar nela.
- **I2. Cadastro de centro de custo** — código **e nome** (`CC-1000 · Administrativo`),
  vinculado à empresa. Hoje é texto livre; vira cadastro com lista fechada.
  *Pendente:* existe lista oficial vinda do SAP/DW? Se sim, espelhar em vez de inventar.
- **I3. Os três campos na ficha**, cada um com rótulo próprio, versionados com vigência
  (mudar de qualquer um dos três é histórico, não sobrescrita)
- **I4. Filtro por registro, lotação e centro de custo** — lista de colaboradores,
  relatórios, organograma e folha
- **I5. Transferência entre empresas** como movimentação, mantendo **a mesma pessoa e o mesmo
  histórico** — muda o vínculo, não o registro da pessoa
- **I6. eSocial**: transferência entre CNPJs é desligamento + admissão para o governo, mas
  **um só histórico** para o RH. Desenhar conforme a prática atual do DP (decisão 4)

---

### ONDA J — Folha: conferência por rubrica, pessoa e centro de custo

Depende da Onda I (o centro de custo com cadastro e nome).

- J1. **Três visões de conferência do fechamento**: por tipo de rubrica, por pessoa e por
  centro de custo *(ela marcou como "muito importante mesmo")*
- J2. Totais e quebras por centro de custo — e também por **registro** (empresa), já que a
  folha passa a ser por CNPJ
- J3. Filtros das três dimensões na competência

---

### ONDA K — Visibilidade em camadas na ficha

> *"Fica visível para qualquer pessoa: nome, cargo, telefone, e-mail, líder imediato e unidade.
> O resto só para DP/RH e para os líderes acima."*

- K1. Acrescentar **telefone e e-mail** em `rh.colaborador` (não existem — item 1.5)
- K2. **Ficha pública mínima** para qualquer colaborador autenticado
- K3. Ficha completa para DP/RH **e para a cadeia de liderança acima da pessoa** — hoje o
  escopo é só do gestor imediato, precisa subir a cadeia inteira
- K4. Rever o que exatamente é "o resto" com o DP (ver seção 3)

---

### ONDA L — Recrutamento e admissão

- L1. Etapa **Pesquisa social** no kanban, antes da Oferta, com anexo e resultado
  aprovado / não aprovado
- L2. **Checklists de admissão personalizáveis**: botão criar checklist, com itens
  detalhados (identidade, título de eleitor, comprovante de residência…) e modelos
  diferentes por tipo de vínculo — o de PJ não é o de CLT

---

### ONDA M — Pesquisa com público-alvo

- M1. Ao criar a pesquisa, **selecionar quem é elegível a responder** — por unidade, cargo,
  centro de custo, empresa ou seleção manual de pessoas
- M2. Vale para os três tipos: anual, pulse e eNPS
- M3. Adesão passa a ser medida sobre o público-alvo, não sobre a empresa inteira

---

## 3. Decisões que dependem de você (não são técnicas)

| # | Decisão | Por que precisa de resposta |
|---|---|---|
| 1 | **Aprovação da revisão de valor de benefício**: DP ou gestor imediato? | Muda o fluxo. Sugestão: gestor aprova a necessidade, DP homologa o valor — mas é decisão de processo |
| 2 | **O que é "o resto" da ficha** restrito a DP/RH e liderança | Precisa de uma lista fechada: salário e saúde já são restritos; e ocorrência, avaliação, dependente, documento? |
| 3 | **"Líderes acima"** — a cadeia inteira até a diretoria, ou só um nível acima? | Define o alcance da consulta |
| 4 | **Transferência entre CNPJs**: como o DP trata isso hoje no eSocial? | O desenho de I3 depende do que a empresa já pratica |
| 5 | **Origem das marcações de ponto até o REP-P chegar**: importar arquivo de onde? | Define o formato do importador em F1 |
| 6 | **Regra do banco de horas**: prazo de compensação, limite de saldo, o que expira | É parâmetro versionado, mas alguém precisa dizer os números |

---

## 4. O que continua dependendo de terceiros

| Item | Depende de |
|---|---|
| Marcação de ponto com validade jurídica | Contratar REP-P homologado (a apuração e as visões **não** dependem) |
| Transmissão do eSocial | Certificado digital e-CNPJ + homologação em produção restrita |
| Treinamentos da equipe | Módulo de T&D — hoje no Sults, a absorver depois |

---

## 5. Resumo da ordem

1. **F — Ponto e banco de horas** (prioridade declarada; o maior bloco)
2. **G — Correções baratas** (avaliação em branco, link de experiência, folha retroativa, adicionar rubrica, NR-1)
3. **I — Registro, lotação e centro de custo** (estrutura; tudo abaixo depende dela)
4. **H — Benefícios** (inverte o modelo; quanto antes, menos migração)
5. **J — Conferência de folha em 3 visões**
6. **K — Visibilidade em camadas na ficha**
7. **L — Pesquisa social e checklists de admissão**
8. **M — Público-alvo da pesquisa de clima**

**Sequência prática:** F e G correm juntas — G são correções pequenas e independentes, e
entregá-las cedo tira da frente os defeitos que ela viu.

**I subiu para a terceira posição** depois da decisão dos três campos: registro, lotação e
centro de custo são a base de J (conferência da folha por CC e por empresa), de K (o que
aparece na ficha) e dos filtros de relatório. Mexer nessa estrutura depois de construir as
telas em cima dela significa refazer as telas.
