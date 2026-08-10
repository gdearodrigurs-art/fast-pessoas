# Roadmap: Fast Pessoas

## Overview

Fast Pessoas já está largamente construído e verificado — fundação, ponto/banco de horas,
estrutura pessoa × vínculo (Onda I), benefícios invertidos (Onda H) e os sweeps de defeito
(0/0b) estão committados. Este roadmap cobre só o que falta para **sair da demo e chegar ao
uso real**: migrar as ondas restantes na ordem vigente de docs/17 (itens 2–8) e os importadores
de carga inicial, até o DP/RH da Fast operar com dados reais. A jornada vai do padrão que
atravessa cinco ondas (catálogo → modelo → regra), passa pela conferência de folha, pelo módulo
disciplinar e de custódia, pela visibilidade em camadas, pelo painel e pela pesquisa, e termina
na carga inicial e no go-live.

## Milestones

- ✅ **Construído até a demo** — Ondas A–J (fundação, ponto/banco de horas), Onda I (estrutura), Onda H (benefícios), sweeps 0/0b · *shipped, committado*
- 🚧 **Da demo ao uso real** — Phases 1–7 (docs/17 itens 2–8) · *este ciclo*

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>✅ Construído até a demo — shipped (não é escopo deste ciclo)</summary>

Já committado e verificado (`npm test` verde, `npm run lint` limpo). Contexto, não to-do:

- [x] **Fundação** — auth própria, RBAC por chave, 2FA, audit em duas trilhas, vigência, RLS (Ondas A–E)
- [x] **Ponto e banco de horas** — jornadas/escalas versionadas, espelho, intercorrências, banco de horas em três níveis, portais colaborador/gestor (Ondas F/G)
- [x] **Estrutura pessoa × vínculo (Onda I)** — registro/lotação/CC ortogonais, N vínculos por pessoa, transferência entre empresas, linha do tempo
- [x] **Benefícios invertidos (Onda H)** — direito por padrão, valor individual, revisão de valor com histórico (H3/H4), dependentes pelo colaborador
- [x] **Sweeps de defeito** — Onda 0 (incômodos) e Onda 0b (os que enganam número)

</details>

- [ ] **Phase 1: Padrão Modelo** - Catálogo → modelo → regra aplicado a admissão, recrutamento, clima e avaliação (cobre L1+L2)
- [ ] **Phase 2: Folha — três visões e OLAC** - Conferência por provento/pessoa/centro de custo e espelhamento com a contabilidade externa por arquivo (Onda J)
- [ ] **Phase 3: Disciplinar + Posse** - Medidas disciplinares, ciclo de documento com testemunhas (resolve a ciência do Código de Conduta) e custódia de ativos
- [ ] **Phase 4: Visibilidade em camadas** - Salário pela sub-árvore recursiva do organograma, permissão por registro, campos cadastrais e ficha pública (Onda K)
- [ ] **Phase 5: Painel executivo — filtro lateral** - Filtro honesto nas 24 consultas, respeitando o piso de anonimato
- [ ] **Phase 6: Pesquisa com público-alvo** - Selecionar quem responde e medir adesão sobre o público-alvo (Onda M)
- [ ] **Phase 7: Uso real** - Importadores de carga inicial e preparação de go-live (Onda N)

## Phase Details

### Phase 1: Padrão Modelo
**Goal**: O DP monta admissão, recrutamento, clima e avaliação sem dev, a partir de uma única forma reutilizável (catálogo → modelo → regra que escolhe).
**Depends on**: Construído até a demo (Onda I estrutura, avaliação/recrutamento/admissão/clima existentes)
**Requirements**: MODL-01, ADMS-01, RECR-01, RECR-02, CLIM-01, AVAL-01
**Success Criteria** (what must be TRUE):
  1. O DP cria um checklist de admissão diferente para PJ e para CLT, escolhendo itens de um catálogo (documentos, ASO, contrato, acessos, uniforme, onboarding), e o processo aplica o checklist certo pelo tipo de vínculo
  2. O recrutador vê uma etapa "Pesquisa social" no kanban antes da Oferta, anexa o resultado e marca aprovado / não aprovado
  3. O DP escolhe um modelo de processo de recrutamento versionado ao abrir a vaga
  4. O DP administra as perguntas do check-in de clima como catálogo versionado, sem quebrar a continuidade da série
  5. Uma avaliação de ciclo usa o modelo que o cargo do avaliado escolhe (gerente ≠ faxineiro), congelado na abertura do ciclo
**Plans**: TBD
**UI hint**: yes

### Phase 2: Folha — três visões e OLAC
**Goal**: O DP confere a competência da folha por três ângulos e troca movimentações com a contabilidade externa por arquivo.
**Depends on**: Construído até a demo (Onda I estrutura — registro/lotação/CC; Onda F→folha já ligada)
**Requirements**: FOLH-01, FOLH-02, FOLH-03, OLAC-01
**Success Criteria** (what must be TRUE):
  1. O DP abre a conferência da competência e alterna entre visão por provento, por pessoa e por centro de custo
  2. O DP vê totais e quebras por centro de custo e por registro/empresa na mesma competência
  3. O DP filtra a competência pelas três dimensões (registro, lotação, centro de custo)
  4. O DP exporta as movimentações internas em arquivo para a OLAC e importa o que volta da contabilidade, e o que foi lançado lá aparece espelhado aqui
**Plans**: TBD
**UI hint**: yes

### Phase 3: Disciplinar + Posse
**Goal**: O DP conduz medidas disciplinares e custódia de ativos com um ciclo de documento que exige assinatura — e a mesma forma resolve a ciência do Código de Conduta.
**Depends on**: Construído até a demo (núcleo do colaborador, linha do tempo, desligamento)
**Requirements**: DISC-01, DISC-02, POSS-01, COND-01
**Success Criteria** (what must be TRUE):
  1. O DP registra uma medida disciplinar com a cadeia sugerida (não imposta) e uma preventiva exige desfecho antes de encerrar
  2. Um documento que exige assinatura roda o ciclo prazo → assinou / recusou / testemunhas, e o desfecho fica registrado
  3. O DP consulta a posse de EPI de uma pessoa hoje e registra a custódia de um ativo (tablet, carro) com tipo e quantidade
  4. No primeiro acesso o colaborador é bloqueado até dar ciência do Código de Conduta rolando o documento; uma versão nova reabre a ciência para todos, com hash e data — e ninguém fica pendente para sempre
**Plans**: TBD
**UI hint**: yes

### Phase 4: Visibilidade em camadas
**Goal**: Cada um vê exatamente o que sua posição na hierarquia autoriza — salário, disciplinar e ficha — com os campos cadastrais que faltavam.
**Depends on**: Construído até a demo (Onda I, organograma); decisão 4.1 salário (resolvida 2026-07-31)
**Requirements**: VISI-01, VISI-02, CADS-01, CADS-02, CADS-03, CADS-04
**Success Criteria** (what must be TRUE):
  1. Um gestor vê o salário de todos abaixo dele no seu ramo do organograma, descendo até o fim, e de mais ninguém — nada lateral
  2. Um gestor vê o disciplinar da própria equipe sem que uma suspensão apareça para quem abre qualquer ficha
  3. A ficha e a lista mostram uma ficha pública mínima (nome, cargo, telefone, e-mail, líder atual, unidade) e nada além, com telefone e e-mail corporativo agora cadastráveis
  4. O DP registra diversidade no padrão IBGE (autodeclarado) e o nível hierárquico no cargo passa a governar quem vê o quê
**Plans**: TBD
**UI hint**: yes

### Phase 5: Painel executivo — filtro lateral
**Goal**: O leitor do painel confia no filtro — cada cartão respeita o recorte ou diz honestamente que não o respeita.
**Depends on**: Construído até a demo (Onda I para os recortes); beneficia-se das regras de visibilidade da Phase 4
**Requirements**: PNEX-01, PNEX-02
**Success Criteria** (what must be TRUE):
  1. Ao aplicar um filtro lateral (ex.: centro de custo = X), cada um dos cartões ou honra o recorte ou exibe visivelmente "não filtrado" — nunca ignora o filtro em silêncio
  2. Cartões que batem no piso de anonimato (clima, eNPS, diversidade) exibem "recorte pequeno demais" em vez de vazar, e resultados grandes paginam em vez de truncar calados no `LIMIT 500`
**Plans**: TBD
**UI hint**: yes

### Phase 6: Pesquisa com público-alvo
**Goal**: O RH dispara pesquisas para o público certo e mede adesão contra esse público, não contra a empresa inteira.
**Depends on**: Construído até a demo (Onda I para recortar por unidade/cargo/CC/empresa; módulo de pesquisas existente)
**Requirements**: PESQ-01, PESQ-02, PESQ-03
**Success Criteria** (what must be TRUE):
  1. Ao criar uma pesquisa, o RH seleciona quem é elegível a responder por unidade, cargo, centro de custo, empresa ou seleção manual
  2. A seleção de público-alvo funciona para pesquisa anual, pulse e eNPS
  3. A adesão exibida é calculada sobre o público-alvo, não sobre a empresa inteira
**Plans**: TBD
**UI hint**: yes

### Phase 7: Uso real
**Goal**: O DP/RH da Fast carrega os dados reais em etapas e abre o sistema para operação com dados reais.
**Depends on**: Phases 1–6 (schema estável) + Construído até a demo. Bloqueio externo: **Diego (lista de rubricas + layout dos importadores — pendência #5)**.
**Requirements**: IMPT-01, GOLV-01, GOLV-02
**Success Criteria** (what must be TRUE):
  1. O DP importa a carga inicial em etapas — RCF/cargos, unidades e locais de trabalho, headcount e dados cadastrais — a partir das planilhas de layout combinado
  2. O sistema abre com dados de fundação completos (rubricas, checklist default, modelo de avaliação default, empresa/estabelecimento/CC exemplo) em vez de exigir SQL manual
  3. O corte do balde anônimo de pesquisas está em America/Sao_Paulo antes de qualquer pesquisa real, e o comportamento de go-live está registrado
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Padrão Modelo | 0/TBD | Not started | - |
| 2. Folha — três visões e OLAC | 0/TBD | Not started | - |
| 3. Disciplinar + Posse | 0/TBD | Not started | - |
| 4. Visibilidade em camadas | 0/TBD | Not started | - |
| 5. Painel executivo — filtro lateral | 0/TBD | Not started | - |
| 6. Pesquisa com público-alvo | 0/TBD | Not started | - |
| 7. Uso real | 0/TBD | Not started | - |
