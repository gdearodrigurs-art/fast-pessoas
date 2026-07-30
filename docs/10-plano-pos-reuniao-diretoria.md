# Plano de execução — reunião com a Diretora de Pessoas

> **Versão consolidada de 2026-07-30.** Reúne três fontes: os 18 pontos anotados logo após a
> reunião, os achados do cruzamento com a transcrição (`docs/11-achados-da-transcricao.md`) e
> as decisões do usuário sobre ambos.
> **Nada foi implementado ainda.** Cada afirmação que dependia do estado do sistema foi
> conferida no código e no banco antes de virar tarefa.

---

## 1. Correções de premissa (verificadas no código)

| # | O que se acreditava | O que a verificação mostrou |
|---|---|---|
| 1.1 | "Centro de custo não existe em lugar nenhum" | **Existe** (`rh.lotacao.centro_custo`), mas escondido como sufixo da unidade (`Matriz Centro · CC CC-1000`): sem rótulo próprio, sem nome, sem filtro. A crítica procede na prática |
| 1.2 | "A tela de avaliação está quebrada" | **Funciona para o avaliador** (renderiza os 3 pilares e 15 indicadores). Fica vazia para **quem não é o avaliador**: sem formulário (não pode responder) e sem resultado (ciclo não consolidado), a tela não desenha nem explica |
| 1.3 | "Não consigo ir do contrato de experiência para a avaliação" | Problema **diferente** do anterior: o alerta aponta para `/colaboradores/{id}`, não para a avaliação. Link errado |
| 1.4 | "Falta o ponto" | **Não existe nenhuma tabela** de marcação, jornada, escala ou banco de horas. Mas **só a marcação depende do REP-P** (Portaria 671) — apuração e visões são nossas e podem ser feitas já |
| 1.5 | Regra de visibilidade pede telefone e e-mail | **Não existem** em `rh.colaborador` |
| 1.6 | "Folha retroativa já está bloqueada" (demonstrado na reunião e aprovado por ela) | **Não está.** O esquema aceita ano de 2020 a 2100 sem trava. A regra foi aprovada acreditando que já existia |

---

## 2. Decisões tomadas

**Estrutura e cadastro**
- **Três campos independentes**: **Registro** (empresa do grupo/CNPJ) · **Lotação** (local físico) · **Centro de custo** (onde o custo cai). São ortogonais.
- **Pessoa ≠ vínculo**: o DP demite no CNPJ A e recontrata no B; o sistema mantém **uma pessoa com N vínculos** e a linha do tempo atravessa os vínculos.
- **Centros de custo administráveis** pelo usuário (adiciona, renomeia, inativa). Renomear não reescreve histórico; remover CC já usado é inativar.
- Termo em tela: **lotação**.

**Regras de negócio**
- Revisão de valor de benefício: **o DP aprova**.
- Ficha completa: **de gerente para cima** — *pendente de reconciliação, ver §4.1*.
- Ponto: **prever importação** enquanto o REP-P não é contratado; correção de intercorrências detalhada **depois da base** existir.
- Banco de horas: **altamente parametrizável** — padrão da empresa → padrão da unidade/cargo → exceção por colaborador, tudo versionado.
- **Contabilidade externa (OLAC)**: **primeiro momento por arquivo** de exportação e importação; **API na segunda fase**. Resolve o impasse levantado na reunião (Supply, DCS e Casa do Montador processam folha fora, no sistema Castor).
- **Ciência do Código de Conduta**: ato **pontual**, não recorrente — entra na preparação para uso real.

---

## 3. Ordem de execução

### ONDA F — Ponto e banco de horas ⭐ prioridade declarada

> *"De tudo, o que ela mais enfatizou é o controle de ponto e banco de horas, mais visível para
> o funcionário e para o gestor."*

**F1. Fundação**
- Jornadas e escalas versionadas com vigência (5x2, 6x1, 12x36, intervalos, tolerâncias)
- **Feriados** por município/unidade — não existem e já fazem falta em férias e prazos
- Marcação com origem declarada (REP-P, importação, ajuste), preparada para AFD/AEJ
- **Importador**: planilha padrão (código, código, valor) e arquivo do futuro REP-P

**F2. Apuração**
- Espelho de ponto da competência contra a jornada vigente
- Horas extras por faixa, adicional noturno, faltas, atrasos, DSR
- **Banco de horas** com a parametrização em três níveis (§2)

**F3. Intercorrências** *(detalhamento após a base — decisão do usuário)*
- Fila de marcações inconsistentes (entrada sem saída, intervalo faltando)
- **Correção pelo DP**, auditada
- **Relatório diário automático aos gestores** — segundo a diretora, é o que **elimina a
  contratação de um estagiário dedicado a isso**

**F4. Visibilidade — o pedido textual dela**
- **Portal do colaborador**: saldo do banco de horas, **média de hora extra por dia**, **total do último mês**, espelho, histórico
- **Portal do gestor**: banco de horas **do time**, quem está estourando hora extra, ajustes a aprovar
- **Ficha do colaborador**: bloco de ponto com resumo e histórico
- Indicadores na Central de Metas

**F5. Ligação com a folha** — horas apuradas viram variáveis da competência automaticamente

---

### ONDA G — Correções e ajustes baratos *(pode correr junto da F)*

| # | Item |
|---|---|
| G1 | **Avaliação — dois defeitos**: (a) estado explicado para quem não é o avaliador, em vez de tela vazia; (b) as perguntas do pilar de valores estão puxando erradas |
| G2 | Alerta de contrato de experiência → link direto para responder a avaliação |
| G3 | **Bloquear competência retroativa** — urgência elevada: foi apresentada como pronta e aprovada (§1.6) |
| G4 | **Rubricas**: botão adicionar + as seis nomeadas por ela — comissão, reflexo de comissão, DSR, reflexo de DSR sobre comissão, salário família, abono pecuniário — e **eliminar os proventos manuais genéricos** |
| G5 | **NR-1 como avaliação psicossocial**, acoplada ao ASO: indicador **ao lado** do de ASO (não no lugar), e todo ASO novo já entra na modalidade. Empresa já contratada por ela |
| G6 | **Organograma em árvore vertical** — formato que você mesmo apontou como insuficiente |

---

### ONDA I — Estrutura: registro, lotação, centro de custo e vínculos

Sobe para a terceira posição: J, K e os relatórios se apoiam nela. Mexer depois = refazer telas.

- **I1. Empresa do grupo** (CNPJ, razão social, tipo) — 4 CNPJs: indústria, varejo, franquia e CSC. Nomes citados na reunião: **Supply, DCS, Casa do Montador**
- **I2. Cadastro de centro de custo** administrável (código + nome, vinculado à empresa), com nome versionado e inativação em vez de exclusão
- **I3. Os três campos na ficha**, com rótulo próprio e vigência
- **I4. Filtros** por registro, lotação e centro de custo em lista, relatórios, organograma e folha
- **I5. Pessoa ≠ vínculo** — uma pessoa (CPF) com N vínculos; cada vínculo com matrícula, admissão, rescisão e matrícula eSocial próprias; **linha do tempo da pessoa** atravessando vínculos
- **I6. Transferência entre empresas** como movimentação, preservando a pessoa e o histórico

---

### ONDA H — Benefícios: inverter o modelo

Quanto mais adesões no formato antigo, mais cara a migração.

- **H1.** Acabar com candidatura e elegibilidade: a pessoa **já entra com direito**; o botão "solicitar adesão" **desaparece**
- **H2. Valor individual** por pessoa (VT de R$ 600 para um, R$ 720 para outro)
- **H3. Solicitar revisão de valor** (mudou de casa, passagem subiu), com histórico — valor anterior vira versão encerrada
- **H4.** Revisão aprovada pelo **DP**
- **H5. Dependentes cadastrados pelo próprio colaborador**, sem DP/RH
- **H6.** Migrar as 322 adesões existentes

---

### ONDA J — Folha: conferência e contabilidade externa

- **J1. Três visões de conferência** — **por provento** (o termo dela), por pessoa e por centro de custo. Marcado como *"muito importante mesmo"*
- **J2.** Totais e quebras por centro de custo **e por registro/empresa**
- **J3.** Filtros das três dimensões na competência
- **J4. Espelhamento com a OLAC** *(decisão de 2026-07-30)*:
  - **Fase 1 — arquivos**: exportação das movimentações internas e importação do que vem da contabilidade
  - **Fase 2 — API**
  - Requisito dela: *"toda movimentação feita lá espelha aqui, e toda movimentação feita aqui está aqui"*

---

### ONDA K — Visibilidade em camadas e campos cadastrais

- **K1.** Acrescentar **telefone e e-mail corporativo** a `rh.colaborador`
- **K2. Ficha pública mínima** — nome, cargo, telefone, e-mail, líder atual, unidade. **Nada além.** Vale **também para a lista**, não só para a ficha (cobrança dela na reunião)
- **K3. Nível hierárquico no cargo** + regra de quem vê o quê — *pendente §4.1*
- **K4. Diversidade no padrão IBGE** — campos autodeclarados além de gênero

---

### ONDA L — Recrutamento e admissão

- **L1. Etapa "Pesquisa social"** no kanban, **antes da Oferta**, com anexo e resultado aprovado / não aprovado
- **L2. Checklist personalizável** (botão criar checklist; PJ ≠ CLT) com os itens que ela ditou: **documentos, ASO, contrato, acessos, uniforme e onboarding**
- **L3.** Anexos da admissão vão para a **ficha do funcionário** — *"não vai ter mais subs, não vai ter mais servidor"*

---

### ONDA M — Pesquisa com público-alvo

- **M1.** Ao criar a pesquisa, **selecionar quem é elegível a responder** (unidade, cargo, centro de custo, empresa ou seleção manual)
- **M2.** Vale para anual, pulse e eNPS
- **M3.** Adesão medida sobre o público-alvo, não sobre a empresa inteira

---

### ONDA N — Preparação para o uso real

Nada aqui é urgente hoje, mas **tudo é pré-requisito para sair da demo**.

- **N1. Importadores de carga inicial** — RCF/cargos, unidades e locais de trabalho, headcount, dados cadastrais. Layout a combinar com o Diego. É o que viabiliza a sua estratégia de carga em etapas
- **N2. Ciência do Código de Conduta e Regulamento Interno no primeiro acesso** *(ato pontual)*: bloqueia o acesso até aceitar, **exige rolar o documento**, nova versão reabre a ciência para todos, registro com hash e data. Valor jurídico declarado por ela
- **N3. Check-in de clima como pop-up no portal de vendas** — depende da Fase B da plataforma. Ela também sugeriu **dar um nome/marca** ao check-in

---

## 4. Decisões ainda em aberto

### 4.1 Salário do time: o líder direto vê?

Na reunião (00:42:33) ela aprovou explicitamente:

> **Você:** *"O gestor tem que conseguir ver o salário do time dela."* → **Diretora: "Sim. O gestor, sim."**

Mas a resposta posterior foi **"apenas gerente pra cima"**, o que tiraria o salário de um
supervisor que lidera gente. Leitura provável: **o corte vale para quem NÃO é líder da pessoa**
(a cadeia acima dela), e **o líder direto continua vendo a própria equipe**. Precisa de
confirmação antes da Onda K.

### 4.2 Lista completa de rubricas

Ela sugeriu levantar com o **Diego**. As seis já nomeadas entram na G4; o restante depende
desse levantamento.

---

## 5. Dependências de terceiros

| Item | Depende de |
|---|---|
| Marcação de ponto com validade jurídica | Contratar REP-P homologado — **a apuração e as visões não dependem** |
| Transmissão do eSocial | Certificado digital e-CNPJ + homologação em produção restrita |
| Treinamentos da equipe | Módulo de T&D — hoje no Sults |
| Layout dos importadores e lista de rubricas | Diego |

---

## 6. Resumo da ordem

| | Onda | Nota |
|---|---|---|
| 1 | **F — Ponto e banco de horas** | prioridade declarada; maior bloco |
| 2 | **G — Correções baratas** | corre junto da F |
| 3 | **I — Registro, lotação, centro de custo e vínculos** | estrutura; tudo abaixo depende |
| 4 | **H — Benefícios** | inverte o modelo; quanto antes, menos migração |
| 5 | **J — Folha: conferência e OLAC** | depende de I |
| 6 | **K — Visibilidade em camadas** | depende de 4.1 |
| 7 | **L — Pesquisa social e checklists** | |
| 8 | **M — Público-alvo da pesquisa** | |
| 9 | **N — Preparação para o uso real** | pré-requisito para sair da demo |
