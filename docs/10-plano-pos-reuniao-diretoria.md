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

### 1.1 Centro de custo **já existe** — o problema é onde ele aparece

A diretora disse *"não vi isso em lugar nenhum"*. Conferido: `rh.lotacao.centro_custo`
existe desde a migration 0002, é exibido na **ficha do colaborador**, no formulário de
**transferência** e no **painel executivo** (custo por centro de custo).

**Então o pedido real não é criar o campo — é usá-lo onde falta**, principalmente na
conferência da folha (item 15 dela) e nos filtros das telas. Trabalho menor do que parecia.

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

### ONDA I — Estrutura de grupo: os 4 CNPJs

> *"A pessoa pode mudar entre os CNPJs e esse histórico não é perdido."*

São quatro empresas: **indústria, varejo, franquia e CSC**. Hoje o sistema tem
`estabelecimento` (as 5 unidades), mas **não tem o conceito de empresa/CNPJ acima delas**.

- I1. Entidade **empresa do grupo** (CNPJ, razão social, tipo), com os estabelecimentos abaixo
- I2. Transferência entre empresas como tipo de movimentação, mantendo **a mesma pessoa e o
  mesmo histórico** — muda o vínculo, não o registro
- I3. Efeito no eSocial: transferência entre CNPJs é desligamento + admissão para o governo,
  mas **um só histórico** para o RH. Precisa ser desenhado com cuidado (S-2299/S-2200 ou
  evento de transferência, conforme o caso)
- I4. Folha e relatórios passam a filtrar por empresa além de unidade e centro de custo

---

### ONDA J — Folha: conferência e centro de custo

- J1. **Três visões de conferência do fechamento**: por tipo de rubrica, por pessoa e por
  centro de custo *(ela marcou como "muito importante mesmo")*
- J2. Centro de custo visível e filtrável na folha (o dado já existe — item 1.1)
- J3. Totais e quebras por centro de custo no fechamento

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
3. **H — Benefícios** (inverte o modelo; quanto antes, menos migração)
4. **I — Os 4 CNPJs do grupo** (estrutura; afeta folha, relatórios e eSocial)
5. **J — Conferência de folha em 3 visões**
6. **K — Visibilidade em camadas na ficha**
7. **L — Pesquisa social e checklists de admissão**
8. **M — Público-alvo da pesquisa de clima**

**Sugestão de sequência prática:** F e G podem correr juntas — G são correções pequenas e
independentes, e entregar elas cedo tira da frente os defeitos que ela viu. H vem logo atrás
por causa do custo de migração. I antes de J, porque a conferência da folha vai querer
filtrar por empresa também.
