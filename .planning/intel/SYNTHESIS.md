# Synthesis Summary

Entry point for gsd-roadmapper. Produced by gsd-doc-synthesizer from 36 per-doc classifications.
MODE: new. Precedence: ADR > SPEC > PRD > DOC.

## Doc counts by type
- ADR: 3
- SPEC: 10
- PRD: 2
- DOC: 21
- Total: 36 (all classifications consumed)

## Decisions locked (3 ADRs, all locked:true)
- docs/02-arquitetura.md — platform/stack/DB/folha/ponto/identity decisions (default ADR precedence). Yields ~12 locked decision statements (app próprio 2 fases, Next.js/Node stack, PostgreSQL dedicado, folha e transmissão próprias sem Nasajon, paralelo até paridade, REP-P só marcação, auth própria Fase A, audit duas trilhas + vigência, Central de Metas sem meta em código, clima check-in, 360 esqueleto btime).
- docs/13-arnes-do-projeto.md — process/tooling harness (manifest override DOC→ADR, precedence 0). Seven components, golden rules enforced by hooks, the fechamento act.
- docs/14-mapa-de-eixos.md — the ten data invariants (manifest override DOC→ADR, precedence 1) + "flag never executes / human decision registered" rule.
- File: intel/decisions.md

## Requirements extracted (2 PRDs → 19 REQ entries)
- From 05-avaliacao-360: REQ-360-auditoria-btime, -modelo-administravel, -fit-cultural-9-valores, -pilar-cha, -pilar-dever-origem-rastreada, -ciclos-experiencia-desempenho, -execucao-consolidacao-flag, -decisao-humana, -devolutiva-ciencia-timeline-audit.
- From 11-desligamento: REQ-desligamento-tipos-versionados, -gate-estabilidades, -maquina-estados, -aviso-previo-e-art477, -exame-devolucoes-beneficios, -rescisao-competencia-extraordinaria, -efetivacao-revoga-acesso, -entrevista-indicador, -decisao-vs-flag-e-esocial.
- File: intel/requirements.md

## Constraints (10 SPECs)
- schema: 6 (01-nucleo, 02-ponto, 03-folha, 04-beneficios, 08-ferias-afastamentos, 13-recrutamento-selecao)
- protocol: 2 (07-workflows-demandas, 09-recrutamento-admissao)
- api-contract: 1 (12-esocial-obrigacoes)
- nfr: 1 (06-clima — anonimato)
- File: intel/constraints.md

## Context topics (21 DOCs)
- Grouped into: project overview/module map (4), competing architecture proposals (3), market research (2), SST design doc (1), meeting/execution planning (3), third-party blockers (pendencias + refs), testing/QA (4), feedback/demo (3).
- File: intel/context.md

## Conflicts
- Blockers: 0
- Competing variants (warnings): 0
- Auto-resolved (info): 5 (2 benign cross-ref cycles, propostas superseded by locked ADR, 17 supersedes 10 on ordering, shadow-Nasajon consistent with folha-própria ADR)
- Detail: .planning/INGEST-CONFLICTS.md

## Routing notes for the roadmapper
- This is a mature, largely-built system. The locked ADRs describe the RATIFIED design; several DOCs describe SUPERSEDED states.
- For execution ORDER, read docs/17-lista-de-execucao.md (current). For wave CONTENT (H–N), read docs/10-plano-pos-reuniao-diretoria.md. The remaining waves are H, J, K, L, M, N (per docs/14-mapa-de-eixos.md "ondas que faltam"); onda I is in construction / recently merged.
- The ten eixos (intel/decisions.md, docs/14) are binding invariants — any roadmap item must respect them; three are enforced by custom ESLint.
- Six business decisions remain blocked on third parties (docs/pendencias.md) — surfaced as context, not ingest conflicts; the roadmapper should treat them as open dependencies, not blockers of routing.
