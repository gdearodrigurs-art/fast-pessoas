## Conflict Detection Report

Operation: ingest-docs (MODE: new). Sources: 36 classified docs in .planning/intel/classifications/.
Precedence: ADR > SPEC > PRD > DOC. Three ADRs are locked (13-arnes precedence 0, 14-mapa precedence 1,
02-arquitetura default). No prior PROJECT/ROADMAP/REQUIREMENTS/CONTEXT to check against (new mode).

### BLOCKERS (0)

No blockers. No LOCKED-vs-LOCKED contradiction, no UNKNOWN/low-confidence classification, no impossible
target. The three locked ADRs are orthogonal and mutually consistent: 02-arquitetura (technical/platform
decisions), 13-arnes (process/tooling harness), 14-mapa (data invariants).

### WARNINGS (0)

No competing acceptance variants. The two PRDs (05-avaliacao-360, 11-desligamento) cover distinct scopes
with no overlapping requirement, so no divergent acceptance criteria to reconcile. All architecture
contradictions resolve by precedence (see INFO).

### INFO (5)

[INFO] Cross-ref cycle A — evaluated benign, synthesis proceeded
  Found: docs/10-plano-pos-reuniao-diretoria.md and docs/11-achados-da-transcricao.md reference each other (bidirectional "see also").
  Note: Cycle detection (DFS, depth cap 50) flagged this 2-node loop. It is a documentation back-reference, not a dependency cycle; per-doc extraction is non-recursive, so no synthesis loop is possible. Both docs synthesized normally.

[INFO] Cross-ref cycle B — evaluated benign, synthesis proceeded
  Found: docs/03-modulos/09-recrutamento-admissao.md and docs/03-modulos/13-recrutamento-selecao.md reference each other (adjacent modules that hand off requisição → seleção → admissão).
  Note: Same reasoning as cycle A — benign bidirectional reference, non-recursive extraction, no loop risk. Both SPECs synthesized normally.

[INFO] Auto-resolved: locked ADR 02-arquitetura supersedes the competing architecture proposals
  Found: docs/anexos/proposta-1-integracao-first.md and proposta-2-app-separado-sso.md assume orchestration over Nasajon (folha) and inheriting the Portal platform.
  Note: The three propostas are historical, non-locked design alternatives (all DOC type). Locked ADR docs/02-arquitetura.md (higher precedence) fixes the ratified direction: app próprio Fase A → incorporação Fase B, folha e transmissão próprias sem Nasajon. As-built follows the module-portal direction (proposta-3), deferred to Fase B. No proposta is treated as authoritative. Propostas retained as context only.

[INFO] Auto-resolved: docs/17-lista-de-execucao.md supersedes docs/10 on wave ORDERING
  Found: docs/10-plano-pos-reuniao-diretoria.md orders waves F, G, I, H, J, K, L, M, N; docs/17-lista-de-execucao.md reorders after a hands-on test session (0, 0b, H, padrão-modelo, J, disciplinar+posse, K, painel, M, N).
  Note: Both are DOC type (same type-precedence). Resolved by explicit supersession: 17 is the current execution plan and wins on sequencing; 10 remains authoritative for wave CONTENT (H–N). Recorded so the roadmapper reads 17 for order, 10 for scope detail.

[INFO] Auto-resolved: shadow-Nasajon references are consistent with the locked "folha própria" ADR
  Found: multiple SPECs/PRDs (03-folha-fechamento, 11-desligamento, 12-esocial) reference "sombra Nasajon" / manual Nasajon import.
  Note: This is the transition strategy fixed by the locked ADR (paralelo até paridade), not a contradiction. Nasajon is comparison-only during the shadow period and dies at cutover. No conflict.
