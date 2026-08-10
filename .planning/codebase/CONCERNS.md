# Codebase Concerns

**Analysis Date:** 2026-08-10

## Tech Debt

### Large Monolithic Service Files

**[Area/Component]:**
- Issue: Core domain services exceed reasonable size, creating maintenance burden
- Files: 
  - `fast-pessoas/src/dominios/ponto/servico.ts` (3,275 lines)
  - `fast-pessoas/src/dominios/ponto/repositorio.ts` (2,691 lines)
  - `fast-pessoas/src/dominios/demandas/servico.ts` (2,671 lines)
  - `fast-pessoas/src/dominios/colaboradores/repositorio.ts` (2,442 lines)
- Impact: Difficult to test, navigate, and modify; single responsibility principle violated
- Fix approach: Extract domain-specific logic into separate modules; split service layer by concern (approval workflows, calculations, validations)

### Hardcoded Configuration Paramete rs In Code

**[Multiple areas]:**
- Issue: Business parameters chumbados (hardcoded) in code instead of administrable via UI, violating owner's principle "nada chumbado"
- Files: 
  - `fast-pessoas/src/dominios/ferias/servico.ts:91` - `MESES_LIMITE_CONCESSIVO = 11`
  - `fast-pessoas/src/dominios/folha/repositorio.ts:1882` - 5º dia prazo inside SQL INTERVAL
  - `fast-pessoas/src/dominios/colaboradores/esquemas.ts:296` - 90 dias para feedback (último_feedback_em)
  - `fast-pessoas/db/migrations/0008_desligamento.sql:148-150` - Item devolução categories in CHECK constraint
- Impact: Any parameter change requires code deployment; breaks owner's requirement for operator control
- Fix approach: Create parameter tables with UI administration per domain; migrate each constraint to lookup table

### Two Separate Lists of "Papéis" (Roles) Travados

**[Identidade/Usuarios]:**
- Issue: Eight fixed roles hardcoded in two places with no way to create new roles via UI
- Files: 
  - `fast-pessoas/src/dominios/identidade/esquemas.ts:5` - `Papel` enum
  - `fast-pessoas/db/migrations/0019_identidade.sql` - CHECK constraint on papel
- Impact: Owner wants to create "remuneração" role to see folha without desligamento access; requires migration instead of UI action
- Fix approach: Move roles to administrable table; UI for create/rename/delete; keep admin-audit trail; two travas (no delete with users, no delete last with perfil.administrar)

---

## Known Bugs

### Escala na Transferência — Transfer Scale Migration Incomplete

**[Escala na Transferência / Transfer between CNPJs]:**
- Symptoms: When person transfers between CNPJs, their work schedule (`rh.escala_colaborador`) doesn't carry forward to new contract; old contract left with `fim_vigencia` open
- Files: 
  - `fast-pessoas/db/prova-escala-transferencia.js` - Proof file (bug reproduction script exists)
  - `fast-pessoas/src/dominios/demandas/servico.ts` - Transfer logic (aplicarTransferenciaEntreEmpresas)
  - `fast-pessoas/db/migrations/0048_transferencia_entre_empresas.sql:56-77` - What travels vs doesn't
- Trigger: Execute full transfer flow (create movimentação → líder approval → diretoria approval) with person having active escala with anchor
- Workaround: Manual SQL to close old escala and open new one on destination contract
- Impact: Loss of shift schedule continuity; anchor schedules especially affected; payroll calculations may differ

### Account Without Ficha (Conta sem Ficha) — System Inconsistently Blocks/Allows

**[Portal / Access Control]:**
- Symptoms: Admin account (`g.dearodrigurs@gmail.com`, pessoa_id = null, zero vínculos) treated inconsistently across system
  - `/portal-colaborador` barrs with "Sua conta não está vinculada a uma ficha"
  - Benefício demand creation allows it through → creates DEM-0069 with `solicitante_colaborador_id = null`
  - Portal atalho "Meu portal" appears in header but never works for admin
- Files: 
  - `fast-pessoas/src/dominios/beneficios/repositorio.ts` - Missing vínculo check before creating demand
  - `fast-pessoas/src/app/portal-colaborador/portal-colaborador.tsx` - Blocks correctly
  - `fast-pessoas/src/app/cabecalho.tsx` - Shows menu item unconditionally
- Trigger: Admin opening benefício demand form and completing it
- Workaround: None — orphaned demand already in DB (DEM-0069)
- Impact: Orphaned demands in database with no collaborator; if DP concludes, creates benefício adhe for nobody

### ROTULOS_PAPEL Renders Undefined For Operator-Created Roles

**[Usuarios/Papéis]:**
- Symptoms: When operator creates new papel via UI (once feature exists), header and user list show "undefined" instead of role label
- Files: 
  - `fast-pessoas/src/dominios/usuarios/esquemas.ts:4-14` - `ROTULOS_PAPEL` is fixed map with 8 keys
  - `fast-pessoas/src/app/page.tsx:375` - Uses `ROTULOS_PAPEL[papel]` without ?? fallback (shows undefined)
  - `fast-pessoas/src/app/usuarios/painel-usuarios.tsx:236` - Has fallback with ?? papel
- Trigger: Create new papel, log in with it, visit home or /usuarios
- Workaround: Use painel-usuarios.tsx pattern (has fallback)
- Impact: UI displays "undefined" instead of papel name; confusing for operators; inconsistent across pages

### Missing "Corrigir" Button in Intercorrências de Ponto

**[Ponto / Intercorrências]:**
- Symptoms: `intercorrencia_ponto.status` column accepts `'corrigida'` state, but UI has only "Justificar" and "Ignorar" buttons; no way to mark as corrected
- Files: 
  - `fast-pessoas/db/migrations/0027_ponto.sql:249-250` - Status CHECK allows corrigida
  - `fast-pessoas/src/app/ponto/painel-ponto.tsx` - Missing "Corrigir" button
- Trigger: Open intercorrências, see explanation for how to correct (go to espelho, make change, reprocess), but no button to mark done
- Workaround: Update status via SQL directly
- Impact: System explains the right action but blocks path through UI; 30+ intercorrências have no proper closure path except "explain" or "discard"

### Seeder Writes Tablet as "outro" Category — Not In Controlled List

**[Desligamento / Devolução]:**
- Symptoms: Owner mentioned "carros" and "tablets" as types to track; `item_devolucao.categoria` CHECK constraint doesn't include them
- Files: 
  - `fast-pessoas/db/migrations/0008_desligamento.sql:148-150` - `categoria IN ('epi','notebook','cracha','uniforme','chave','celular','outro')`
  - `fast-pessoas/src/app/sst/painel-sst.tsx` - Devolução checklist UI
- Trigger: Try to categorize tablet or car during offboarding
- Workaround: Falls into "outro" category; loses type-based tracking and reporting
- Impact: Cannot report how many tablets/cars are in the field by type; summary reports are incomplete; "outro" becomes catch-all that hides data

---

## Security Considerations

### Sensível Data Visibility in Payroll Panel

**[Folha / Painel de remuneração]:**
- Risk: Salary figures calculated and displayed to diretora.pessoas@ role; audit trail logs read but lack granular record-level permission
- Files: 
  - `fast-pessoas/src/app/colaboradores/[id]/ficha-colaborador.tsx:152` - Displays "Salário — chave rh.posicao.ver" with audit note
  - `fast-pessoas/src/dominios/colaboradores/repositorio.ts` - Salary queries have role-based filtering
- Current mitigation: Read-only chave, trilha logs leitura_sensivel, role restricted to diretora.pessoas@
- Recommendations: 
  - Add record-level permission checks; not all colaboradores need salary visibility
  - Consider masking exact figures and showing only bands for lower roles
  - Audit sensitive reads in real-time alerts, not just logs

### Disciplinary Records Must Block Based on Record, Not Tela

**[Ocorrências / Medidas Disciplinares]:**
- Risk: Ocorrência.restrita field exists but permission is at tela level (rh.ocorrencia.restrita.ver); gestor can see summary in line da vida without chave
- Files: 
  - `fast-pessoas/src/dominios/colaboradores/repositorio.ts` - Ocorrências filtro
  - `fast-pessoas/db/migrations/0008_desligamento.sql` - audit.leitura_sensivel trigger
- Current mitigation: Trilha records rh.ocorrencia.restrita.ver access; summary hides content from gestor
- Recommendations: 
  - Implement record-level permission (`rh.ocorrencia.id` + chave) in all reads
  - Block line-of-life display of restrita type even in summary form for unauthorized roles
  - Log ALL attempts to read restrita, successful or not

### Pesquisa Anonymous Bucket Cut-Off Time Wrong

**[Pesquisas / Anonimato]:**
- Risk: Pesquisa responses grouped into daily buckets via `DEFAULT date_trunc('day', now())` which cuts at session timezone (21h Brasília); anti-reidentification weakened by off-by-one bucket
- Files: 
  - `fast-pessoas/db/migrations/0022_pesquisas.sql:144` - DEFAULT date_trunc
- Current mitigation: Table is append-only; no trigger disable to fix existing rows without disclosure
- Recommendations: 
  - Fix DEFAULT for new responses via migration (change trunc to America/Sao_Paulo)
  - Document that historical rows (before fix date) have 3-hour drift
  - Add timestamp validation in pesquisa read to flag rows from wrong bucket
  - Before go-live with real data, run this migration to ensure bucketing is correct

---

## Performance Bottlenecks

### Painel Executivo: 24 Queries Have No Filter Support

**[Painel executivo / Indicadores]:**
- Problem: Lateral filter UI ready, but 24 consultas in repositorio have zero filter parameters; filtro built in 15 cartões, silently ignored in other 9
- Files: 
  - `fast-pessoas/src/app/painel-executivo/painel.tsx:679-699` - Filter layout with sticky position
  - `fast-pessoas/src/dominios/paineis/repositorio.ts` - All 24 queries; only some accept `data`, `limite`, `janela`
- Cause: Partial implementation; some indicators cannot be filtered honestly (clima, eNPS, diversidade hit k-anonimato floor)
- Improvement path: 
  1. Run filter through all 24 queries that can support it
  2. For indicators that hit k-anonymity floor, add check: either show result or display "recorte pequeno demais", never silently ignore filter
  3. Mark cartões that don't honor filter visually (e.g., "empresa toda" label)
  4. Paginate results (current LIMIT 500 fixed; causes silent truncation of large result sets)

### Escala Colaborador Queries Grow Quadratically With Scales Per Person

**[Ponto / Escala]:**
- Problem: Work schedules stored as individual rows; queries to build schedule calendar join multiple times over scales
- Files: `fast-pessoas/src/dominios/ponto/repositorio.ts` - All escala queries
- Cause: No aggregation tier; each view rebuild regenerates same joins
- Scaling path: 
  1. Cache active escala + anchors per person at session load time (not per query)
  2. Use materialized view for common escala + jornada queries
  3. Add index on (colaborador_id, status, inicio_vigencia) for WHERE clauses

---

## Fragile Areas

### Benefício Transfer Logic Still Gates by Criteria After Onda H Decision

**[Benefícios / Transferência entre CNPJs]:**
- Files: 
  - `fast-pessoas/src/dominios/beneficios/servico.ts:1274` - `atendeCriterio(adesao.criterio, perfilDestino)` blocks transfer
  - `fast-pessoas/db/migrations/0051_beneficio_atravessa_a_transferencia.sql:60-77` - Same logic in SQL
- Why fragile: Onda H (06/08/2026) changed criteria to advisory (no longer gates DP concession); in transfer, criteria still blocks. If DP grants VT to PJ (allowed after H, recorded in trilha), VT silently disappears in first transfer because destino criterion says "CLT only". **Tela doesn't warn this can happen.**
- Safe modification: 
  1. Separate "benefício eligibility" (person attribute) from "benefício offered by empresa" (company attribute)
  2. Add warning banner if DP-granted benefit would be blocked in transfer
  3. Let DP decide: approve transfer with blocked benefits OR stop transfer to add benefício to destino company first

### Desligar Pela Ficha Doesn't End Liderança Relation

**[Colaboradores / Desligamento]:**
- Files: 
  - `fast-pessoas/src/app/colaboradores/[id]/ficha-colaborador.tsx` - Editar dados cadastrais sets status=Desligado
  - `fast-pessoas/db/migrations/0050_transferencia_entre_empresas.sql` - Had to repair 9 relations left open
- Why fragile: Two doors to desligar estado — one in ficha (incomplete) and one in módulo desligamento (correct). Ficha path leaves `rh.relacao_gestor` vigente. Then `/organograma` shows person as liderado and vice versa.
- Safe modification: 
  1. Make ficha path call same `encerrarLideranca` function as desligamento módulo
  2. OR forbid desligar via ficha, redirect to desligamento module
  3. Add test: deslig by ficha, check /organograma shows person gone

### Vigência Não Futura Skipped on Cargo But Not Others

**[Cargos / Vigência]:**
- Files: 
  - `fast-pessoas/src/dominios/colaboradores/servico.ts:1804` - No exigirVigenciaNaoFutura
  - `fast-pessoas/src/dominios/colaboradores/esquemas.ts:470` - Uses esquemaData without vigência guard
- Why fragile: Other entities (empresa, centro de custo, benefício, faixa_salarial) enforce trava; cargo doesn't. Creating cargo versão with future date activates it immediately instead of on date, breaking salary calculation date precision.
- Safe modification: Apply same `exigirVigenciaNaoFutura` check as other entities; add test versioning cargo with future date

### No Defesa Against Pessoa Desligada In "Novo Gestor" Seletor

**[Colaboradores / Gestor]:**
- Files: 
  - `fast-pessoas/src/app/colaboradores/[id]/ficha-colaborador.tsx` - Novo gestor selector
- Why fragile: `colaboradores/repositorio.ts:listarColaboradoresParaGestor` offers desligados in dropdown; serviço accepts them. Result: `/organograma` shows "gestor fora do quadro" warning.
- Safe modification: Filter querys WHERE status != 'desligado' before returning seletor options; add test assigning desligado as gestor returns 409

---

## Scaling Limits

### Admissão Checklist: Um para Todos

**[Admissão / Checklist]:**
- Current capacity: One checklist_admissao_versao ativa applies to all processo_admissao rows
- Limit: Cannot vary checklist by tipo de vínculo (aprendiz ≠ CLT ≠ PJ), cargo (motorista exige CNH), or other dimension
- Scaling path: 
  1. Create modelo_admissao with chave (e.g., "admissao-clf", "admissao-motorista")
  2. Each modelo selects items from catálogo item_admissao
  3. Processo escolhe modelo by tipo_vinculo + cargo combination
  4. Custo baixo: já existe checklist_versao, só falta chave no índice único

### Demanda Approval Chain: Dois Níveis, Hardcoded

**[Demandas / Aprovação]:**
- Current capacity: Approval chain fixed at 2 levels (líder, diretoria) for all demanda types
- Limit: Cannot scale to 3+ levels (e.g., diretor → diretoria executiva); cannot vary by demanda type (ajuste de ponto needn't go to diretoria)
- Scaling path: Store chain as administrable model with nivel order; demanda_tipo references modelo_cadeia_aprovacao

---

## Dependencies at Risk

### Seeder Incomplete for Critical Data

**[Seeding / Database initialization]:**
- Risk: seed-admin.js creates admin user and basic data; missing key entities
- Files: `fast-pessoas/db/seed-admin.js`
- Impact: Migrations reference data (e.g., rubricas in 0051) that seeder doesn't create; tests fail without manual SQL insertion
- Migration plan: Expand seed-admin.js to create
  - Rubrica catalog (if not supplied externally by Diego)
  - Default checklist_admissao_versao
  - Default modelo_avaliacao_versao
  - Example empresa + estabelecimento + centro_custo

### Diego's Rubrica List Still Pending

**[Folha / Rubricas]:**
- Risk: Importadores and folha close-out cannot complete without definitive rubrica catalog
- Blocker: `docs/pendencias.md#5` — pending since 29/07/2026
- Impact: Folha is functionally complete but cannot be tested end-to-end with realistic data
- Migration plan: Once Diego provides list, publish migration 0052 or later with catalog; update seeder

---

## Test Coverage Gaps

### Transferência Entre CNPJs: Scale Migration Not Tested

**[Escala / Transferência]:**
- What's not tested: Full workflow (create movimentação → líder aprova → diretoria aprova) with active escala with anchor; verify old contract closes escala and new contract opens one
- Files: 
  - `fast-pessoas/db/prova-escala-transferencia.js` - Proof script exists; test harness doesn't call it
- Risk: Regression introduced without CI signal; already happened once
- Priority: High — blocks real-world transfer workflows
- Recommendation: Convert prova script to Jest/Vitest test; run in CI after migrations

### Benefício Transfer Logic Inconsistency After Onda H

**[Benefício / Transferência]:**
- What's not tested: DP grants benefício outside criteria (post-onda H behavior); person transfers between CNPJs; verify benefício carries OR is blocked with warning
- Risk: DP grants VT to PJ (allowed), transfer happens, VT vanishes silently with no tela warning
- Priority: Medium — edge case but silent data loss
- Recommendation: Add test: grant VT outside criteria (PJ) → transfer → verify trilha shows decision, tela shows warning

### Painel Executivo: Filters Don't Reduce Result Set

**[Painel executivo / Filtros]:**
- What's not tested: Set lateral filter (e.g., centro_custo = X) → verify each cartão either honors it or shows "recorte pequeno demais" — never silent ignore
- Risk: Reader assumes page is filtered but 9/24 cartões ignore the filter
- Priority: Medium — impacts decision-making accuracy
- Recommendation: Add test per cartão: apply filter → verify result set matches filter criteria OR cartão shows "not filtered" label

### Account Without Ficha Flows

**[Portal / Access Control]:**
- What's not tested: 
  1. Admin account cannot open benefício demand (should be blocked like portal is)
  2. Menu item "Meu portal" hidden or warnings shown for no-ficha accounts
  3. Orphaned demands (DEM-0069 state) cannot be completed; error message clear
- Risk: More orphaned demands created; data integrity degraded
- Priority: High — already broken in production
- Recommendation: 
  1. Add 401/403 on benefício demand POST if solicitante has no vínculo
  2. Add conditional rendering in cabecalho for "Meu portal" based on pessoa_id
  3. Add test: try to complete demand with null solicitante_colaborador_id → 409 with message

### Desligar Pela Ficha: Liderança Not Ended

**[Colaboradores / Desligamento]:**
- What's not tested: Set status = Desligado in ficha → check relacao_gestor NOT encerrada → mostra no organograma
- Risk: Second open door to inconsistent state; migration 0050 fixed 9, but gate still open
- Priority: High — already revealed by 0050 repairs
- Recommendation: Duplicate desligamento test that checks relacao_gestor ended; apply to ficha path

---

## Migration-Related Issues

### Migration 0048 Comments Don't Match Atual Behavior

**[Benefício / Transferência]:**
- Issue: Migration comments state benefits "NÃO ATRAVESSAM" with section header "(l) ADESÕES A BENEFÍCIO — NÃO ATRAVESSAM"; however, `transferirAdesoesEntreVinculos` (servico.ts:1243) and migration SQL still apply `atendeCriterio` check, which blocks transfer if destino criteria not met
- Files: 
  - `fast-pessoas/db/migrations/0048_transferencia_entre_empresas.sql:169-172` - Says benefits don't transfer
  - `fast-pessoas/src/dominios/beneficios/servico.ts:1274` - Blocks if criteria not met
  - `fast-pessoas/db/migrations/0051_beneficio_atravessa_a_transferencia.sql:60-77` - Applies same criteria gate
- Impact: Migration comments are outdated; future developer reads comment and assumes no transfer; actual code gates by criteria after Onda H
- Fix approach: Update 0048 comments to clarify: "Benefits reopen in destino empresa via separate demanda process; destination criteria gate applied on transfer (see 0051 for details and Onda H decision about criteria role)"

### Balde Anônimo Pesquisa: Cut-off Time Drift Not Retroactively Fixed

**[Pesquisa / Anônimato]:**
- Issue: Migration 0022:144 sets `DEFAULT date_trunc('day', now())` which cuts at session tz; should be America/Sao_Paulo; rows already exist with wrong cut time
- Files: `fast-pessoas/db/migrations/0022_pesquisas.sql:144`
- Blocker: Cannot disable imutabilidade trigger to fix old rows without audit risk
- Impact: Responses from 21h–00h Brasília fall into wrong daily bucket; anti-reidentification slightly weakened
- Fix approach: 
  1. New migration to create DEFAULT now() WITH TIME ZONE TRUNCATED TO AMERICA/SAO_PAULO for new rows
  2. Document that pre-go-live data has drift; post-go-live data clean
  3. Add validation: pesquisa read warns if response age > 1 day AND time is 21h–00h

---

## Missing Critical Features

### Benefício: Revisão de Valor Decision Registered But Not Built

**[Benefício / Revisão de valor]:**
- Problem: Owner decided (docs/16:124 + diretoria meeting docs/10:33) to allow mid-term benefit value review; feature not implemented
- What exists: 
  - `NaturezaSolicitacao = "adesao" | "cancelamento"` only (`beneficios/esquemas.ts:260`)
  - Tela efetiva/negar existing
- What's missing: 
  - `revisao_valor` nature
  - Valor novo field on solicitação
  - Tela to input new value
- Tamanho: Small — reuses aprovação UI entirely; only adds nature + field
- Files: `fast-pessoas/src/dominios/beneficios/esquemas.ts:260`
- Impact: 322 existing adesões cannot be adjusted without cancel+readmit cycle (breaks vigência, pollutes history)
- Priority: High — decision made, low cost, high value

### Feedback Structured Model Not Built

**[Avaliação / Feedback]:**
- Problem: Motor exists (modelo_avaliacao_versao with pilar/indicador/resposta) but aplicável to feedback via avaliação subcategoria; tela doesn't offer it
- What exists: 
  - rh.feedback_formal with só resumo campo
  - Modelo já versionado, já tem estrutura
- What's missing: 
  - Tela to create feedback via modelo
  - Auto-open feedback for all people when 90d threshold hit (motor existe, ato não)
  - Filtros on individual feedback reads (pergunta, nota, comentário busca, lotes by gestor/cargo/centro)
- Tamanho: Medium — motor ready, tela buildable, automation logic exists
- Files: `fast-pessoas/src/dominios/beneficios/` (wrong domain, belongs in avaliacao)
- Impact: Feedback stays text-only; cannot compare, cannot track patterns; avaliação gains third implementation of same idea (avaliacao 360, pesquisa, feedback)
- Priority: Medium — already has workaround (text), but blocks comparison/trends

### Avaliação Por Cargo Not Implemented

**[Avaliação / Modelo por cargo]:**
- Problem: All people in same ciclo answer same modelo regardless of role (gerente ≠ faxineiro); owner decided cargo should choose modelo
- What exists: 
  - Modelos versionados
  - Ciclo congela modelo (immutable history)
- What's missing: 
  - Cargo.rcf_versao links to modelo_avaliacao_versao
  - Ciclo carries set of modelos (não um só)
  - Tela to assign modelo per cargo
- Tamanho: Medium — tabelas simples, regra aplicada na abertura do ciclo
- Files: `fast-pessoas/src/dominios/avaliacao/servico.ts:283` (open ciclo, line 283)
- Impact: Evaluation depth doesn't match role complexity; não retrata realidade
- Priority: Medium — affects quality of data, não funcionalidade

### Painel Executivo Filtro Lateral Incomplete

**[Painel executivo / Filtros]:**
- Problem: Layout ready (sticky left panel), but 24 queries accept no parameters
- Files: `fast-pessoas/src/app/painel-executivo/painel.tsx:679-699` and `repositorio.ts`
- What's missing: Passthrough filter to all 24 queries; check that each cartão honors filter OR marks "não filtrado"
- Tamanho: Medium — high line count, low complexity per query
- Impact: Filter visible but silent ignored in 9/24 cartões; reader can't tell
- Priority: Medium — layout done, easy to complete

### Admissão: Linha Adicionar Documento Extra

**[Admissão / Checklist]:**
- Problem: Owner wants "adicionar documento extra" linha no fim de checklist for unforeseen docs
- What exists: 
  - rh.item_admissao já permite custom linhas (nenhum FK para template)
  - Rota PATCH /itens/[itemId] para alterar
- What's missing: 
  - POST /itens para criar
  - UI campo para novo item + botão
  - Regra: nasce não obrigatório; não trava conclusão
- Tamanho: Tiny — zero migration, endpoint + UI
- Impact: Users block processo conclusão when unseen docs appear; defeats propósito do checklist
- Priority: Low — válvula de escape, não critical path

### Ponto: Formulário "À Prova de Burrice" Incomplete

**[Ponto / Ajuste]:**
- Problem: Intercorrências can be corrected via espelho, but UI formulário é texto livre; precisa campos estruturados
- What exists: 
  - rh.marcacao.substitui_marcacao_id (which → which)
  - rh.jornada defines quais batidas existem (entrada/saída/intervalo)
- What's missing: 
  - Seletor de dia (vem da intercorrência)
  - Seletor de tipo (entrada/saída/intervalo, filtrado by jornada)
  - Hora que está (vem de marcacao)
  - Hora que vai virar (digita)
  - Casos: "batida não existe" mostra "não existe" não exige número; "batida extra" mostra anulação
- Tamanho: Small — dados já existem, forma é UI
- Impact: 30+ intercorrências have only "explain" or "discard" paths; right path exists (corrijo)
- Priority: Low — workaround exists (espelho route), mas UX bloqueada

---

## Architectural Inconsistencies

### Deux Formes de Desligar — Ficha e Módulo — Comportamentos Diferentes

**[Desligamento]:**
- Files: 
  - `fast-pessoas/src/app/colaboradores/[id]/ficha-colaborador.tsx` - Desligar por status
  - `fast-pessoas/src/app/desligamento/` - Módulo completo
- Issue: Ficha path incomplete (relacao_gestor not encerrada); módulo path complete. Two entry points → two behaviors.
- Impact: Operator chooses door by accident; second door leaves state half-done
- Fix: Single door (force módulo) or harmonize both to call same backend

### Perfil: Tela Compõe Chaves, Não Cria Papéis

**[Identidade / Perfis]:**
- Files: `fast-pessoas/src/app/perfis/` 
- Issue: Operator can mix/match chaves para papel, but papéis themselves travados em enum
- Impact: Freedom to compose access (✓) but not freedom to add new categoria/tema; half liberation
- Fix: Complete the pair — tela para create/rename/delete papel também

### Documentos: Dois Conceitos Não Separados em Tela

**[Documentos / GED]:**
- Files: `fast-pessoas/src/app/documentos/`
- Issue: Policies (empresa → todos) and person docs (empresa ↔ pessoa) no same tela/permissão
- Impact: Harder to auditar quem leu o quê; assinatura gov.br só deve aplicar-se a subset (políticas)
- Fix: Duas abas (policies, person docs) com permissões separadas

---

## Known Behavioral Inconsistencies

### Organograma: Gestor Desligado Renderiza "fora do quadro"

**[Organograma]:**
- Files: `fast-pessoas/src/app/organograma/` - Renderer
- Issue: "Novo gestor" seletor oferece desligados; serviço aceita; `/organograma` mostra aviso
- Impact: UI says "fora do quadro" instead of barring creation; UX confusing
- Fix: Filter seletor WHERE status != 'desligado'; block assignment via 409

### Benefício Visão: Duas Naturezas (Adesão + Cancelamento), Onda H Não Mudou Tela

**[Benefício / Visão]:**
- Files: `fast-pessoas/src/app/beneficios/painel-beneficios.tsx`, `esquemas.ts`
- Issue: Motor ganhou ato de "DP decide valor"; tela ainda mostra apenas status adesão/cancelamento
- Impact: Valores aparecem só ao criar versão nova; nunca na lista
- Fix: Add display lógica para revisão status and valor histórico

---

*Concerns audit: 2026-08-10*
