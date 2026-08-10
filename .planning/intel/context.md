# Context (DOCs)

Running notes from classified DOCs, keyed by topic, appended with source attribution. These are context
and design rationale, not ratified artifacts. Embedded decisions/requirements inside these DOCs are
surfaced where load-bearing but remain non-authoritative unless promoted to an ADR/PRD elsewhere.

---

## Project overview / module map
- source: docs/README.md — índice da documentação de arquitetura v2.
- source: docs/06-funcionalidades-resumo-executivo.md — resumo executivo dos 15 módulos planejados e ordem de entrega, para a Diretoria de Pessoas.
- source: docs/01-avaliacao-fontes.md — análise multi-agente comparando duas fontes de conhecimento (convergências/conflitos); marcada "PROPOSTA — nada definitivo".
- source: docs/04-critica-e-pendencias.md — crítica de completude e pendências da arquitetura consolidada (desligamento, conector Nasajon, identidade, 13º, ponto, LGPD, 360, GED, clima, treinamentos).

## Competing architecture proposals (historical, none locked)
- source: docs/anexos/proposta-1-integracao-first.md — "Fast RH Hub": app separado orquestrando sobre Nasajon, herdando SSO/RBAC do Portal; stack FastAPI/Next.js.
- source: docs/anexos/proposta-2-app-separado-sso.md — app separado reusando identidade do Portal via SSO.
- source: docs/anexos/proposta-3-modulo-portal.md — Fast Pessoas como módulo do monorepo do Portal.
- note: As três são propostas concorrentes avaliadas; NENHUMA é decisão travada. O sistema como construído segue a direção módulo-portal (proposta-3), diferida para a Fase B. A decisão ratificada vive no ADR docs/02-arquitetura.md (app próprio Fase A → incorporação Fase B, sem reescrita). As premissas das propostas 1/2 (herdar plataforma FastAPI, folha na Nasajon) caíram. Ver INGEST-CONFLICTS.md (INFO / auto-resolved).

## Market research (tool selection)
- source: docs/05-pesquisa-mercado.md — pesquisa verificada de ferramentas RH/DP (Pontomais, Nasajon, Clicksign/ZapSign, TeamCulture, Caju, Gupy, SOC, WhatsApp Cloud API) com vereditos de incorporação por integração.
- source: docs/anexos/pesquisa-mercado-complementar-detalhe.md — segunda rodada (Gupy, Unico People, Abler; R&S, admissão digital, SST, WhatsApp) com verificação adversarial.

## SST / Saúde ocupacional (design doc, not a spec)
- source: docs/03-modulos/10-sst-saude-ocupacional.md — desenho do módulo SST (ASO, PCMSO, PGR, CAT, EPI, eSocial S-2210/2220/2240); painel de conformidade, GED, EPI com ciência digital. Contém "Decisao de destino" e requisitos MVP em estado PROPOSTA. Rota B (transmissão própria) é o destino desenhado, migrada evento a evento após o gate F4, começando pelo S-2210; Rota A (SOC transmite) é o estado de partida.

## Meeting outputs and execution planning
- source: docs/10-plano-pos-reuniao-diretoria.md — plano consolidado pós-reunião (2026-07-30). Decisões tomadas: três campos independentes (Registro/Lotação/Centro de custo); pessoa ≠ vínculo (uma pessoa, N vínculos, linha do tempo atravessa); centros de custo administráveis; revisão de valor de benefício aprovada pelo DP; banco de horas parametrizável em três níveis; OLAC (contabilidade externa) por arquivo primeiro, API na 2ª fase; ciência do Código de Conduta pontual. Ordem de ondas F, G, I, H, J, K, L, M, N.
- source: docs/11-achados-da-transcricao.md — achados do cruzamento da transcrição (2026-07-30) contra 18 notas prévias (ficha pública, ciência do Código de Conduta, OLAC/Castor, correção de intercorrências de ponto, rubricas, clima, importadores, diversidade IBGE, NR-1 psicossocial, checklist de admissão).
- source: docs/17-lista-de-execucao.md — CURRENT execution ordering, reavaliada depois que o dono usou o sistema. Substitui a ORDEM de docs/10 (o conteúdo das ondas H–N continua valendo lá). Nova ordem: Onda 0 (incômodos), 0b (enganam número), 1=H benefícios, 2=padrão modelo (cobre L1+L2), 3=J folha/OLAC, 4=disciplinar+posse (cobre N2), 5=K visibilidade, 6=painel executivo filtro, 7=M pesquisa, 8=N uso real. Padrão transversal catálogo → modelo → regra que escolhe (cabe em 9 lugares).
- note: 17 supersedes 10 on sequencing (orchestrator-confirmed). Ver INGEST-CONFLICTS.md (INFO / auto-resolved).

## Blockers awaiting third parties (project-level, not doc conflicts)
- source: docs/pendencias.md — sete bloqueios abertos esperando contabilidade/jurídico/terceiros, cada um com decisão recomendada, racional e trade-offs: transferência entre CNPJs (rescisão vs continuidade), saldo de banco de horas na transferência, limite concessivo de férias (11 vs 12 meses), folha no 5º dia útil vs corrido, rubricas e importadores (com Diego), balde anônimo de pesquisas (corte às 21h), benefícios na transferência.
- source: docs/10-plano-pos-reuniao-diretoria.md §5 e docs/17 — terceiros: REP-P, certificado e-CNPJ (eSocial), T&D/Sults, Diego (layout dos importadores e lista de rubricas). Salário do time RESOLVIDO (2026-07-31): sub-árvore recursiva do organograma (WITH RECURSIVE), destrava a Onda K.

## Testing and QA
- source: docs/15-lista-de-teste.md — checklist manual de QA, 973 casos em 6 frentes, derivados do código; + notas de admin/ambiente e 81 achados não-administráveis.
- source: docs/16-caderno-do-teste.md — caderno de teste cronológico do dono (estrutura, perfis, organograma, vínculos, config vs regra de negócio). Contém seções "Decisão" e "Requisito" embutidas — segunda fonte de verdade que alimentou docs/17. Referencia src/dominios/identidade/esquemas.ts, migration 0019.
- source: docs/12-relatorio-onda-f-g.md — relatório de progresso das ondas F/G (ponto, banco de horas, correções pós-verificação, números, pendências).
- source: docs/auditoria-btime-360.md (docs/anexos/) — auditoria crítica do mockup btime da 360, julgando cada componente reusar/corrigir/descartar (insumo do Item 0 do PRD 05-avaliacao-360).

## Feedback and demo material
- source: docs/08-analise-feedback-analista-rh.md — análise do feedback da analista de RH (RBAC/papéis, segregação R&S, data de nascimento, gênero, promoção/transferência, relatórios de diversidade).
- source: docs/07-roteiro-demonstracao.md — roteiro de demonstração (~25 min): reset de dados, build de produção, tour.
- source: docs/09-manual-de-bolso-apresentacao.md — cheat sheet de apresentação (script cronometrado de 24 min, personas de demonstração, 2FA).
