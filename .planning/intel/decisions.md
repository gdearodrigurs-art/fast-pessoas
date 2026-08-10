# Decisions (ADRs)

Synthesized from classified ADRs. Precedence: ADR > SPEC > PRD > DOC.
Two ADRs carry a manifest precedence override (lower = higher priority):
`13-arnes-do-projeto` = 0, `14-mapa-de-eixos` = 1. `02-arquitetura` uses default ADR precedence.

All three ADRs are `locked: true`. LOCKED decisions cannot be auto-overridden by any source.
No LOCKED-vs-LOCKED contradiction was detected across the three (see INGEST-CONFLICTS.md).

---

## ADR: Plataforma — app próprio em 2 fases (Fase A separada → Fase B incorporada ao portal)
- source: docs/02-arquitetura.md
- status: locked (FECHADA pelo usuário 2026-07-24)
- decision: Fast Pessoas nasce como app independente do portal corporativo (Fase A), com auth e cadastro próprios, entregue cedo ao DP/RH. Incorporação ao portal (Fase B) é integração/reorganização, não reescrita — garantida por mesmo stack e tokens visuais do portal desde o dia 1. Premissa corrigida: o portal real é Next.js/Node/Postgres SaveinCloud; o FastAPI das fontes era o MCP do SAP.
- scope: plataforma, arquitetura de implantação, Fase A/Fase B

## ADR: Stack — Next.js + TypeScript + Node.js (front e back)
- source: docs/02-arquitetura.md
- status: locked (FECHADA pelo usuário 2026-07-24)
- decision: Um único stack para app e futuramente portal. Padrões inegociáveis (papel validado no backend, RLS via SET LOCAL, audit só-INSERT por GRANT, vigência, escrita transacional, backup+PITR testado) são implementados neste stack — nada é herdado. Camadas fixas por domínio: rotas → serviço → repositório → esquemas (validação por schema tipado, ex. Zod); queries parametrizadas obrigatórias. v1 FastAPI/Python superada.
- scope: stack tecnológico, organização de código, padrões transversais

## ADR: Banco — PostgreSQL dedicado na SaveinCloud
- source: docs/02-arquitetura.md
- status: locked (FECHADA pelo usuário 2026-07-24)
- decision: Instância PostgreSQL exclusiva do RH. Schemas rh, rh_folha, rh_clima, audit. Credenciais segregadas por GRANT (app_rh, app_folha, app_clima sem SELECT em identidade, app_audit_reader). Dado de saúde cifrado na aplicação. Migrations SQL numeradas, padrão expand/contract. PITR com restore testado é gate da Fase 0.
- scope: banco de dados, segregação, LGPD, segurança

## ADR: Folha — motor de cálculo E transmissão próprios, sem integração Nasajon
- source: docs/02-arquitetura.md
- status: locked (FECHADA pelo usuário 2026-07-24; risco assumido e registrado no log)
- decision: O sistema assume o que hoje é feito no Nasajon: motor completo (rubricas versionadas, encargos INSS/FGTS/IRRF, 13º, férias, rescisão, provisões) e transmissão das obrigações (eSocial, FGTS Digital, DCTFWeb) com certificado digital próprio. Nasajon vira apenas referência funcional e fonte de comparação na sombra — sem integração automática, só importação manual de conferência. Em aberto (design): catálogo inicial de rubricas, mapeamento das CCTs por unidade, resultado do spike eSocial.
- scope: folha de pagamento, fiscal/eSocial, rh_folha

## ADR: Transição da folha — paralelo até paridade, cutover só após paridade comprovada
- source: docs/02-arquitetura.md
- status: locked (FECHADA pelo usuário 2026-07-24)
- decision: Nasajon permanece oficial enquanto a folha própria roda em sombra. Resultados comparados por competência (comparacao_sombra / divergencia_sombra). Cutover só após paridade comprovada — proposta mínima 2 competências consecutivas limpas, incluindo ao menos uma com férias/rescisão reais. Nunca fazer cutover entre novembro e janeiro (13º). Decisão de cutover registrada no log. Até o cutover, o número oficial é o do Nasajon.
- scope: transição folha, gate de cutover, trilha F

## ADR: Ponto — REP-P de mercado contratado só para marcação e AFD/AEJ
- source: docs/02-arquitetura.md
- status: locked (FECHADA pelo usuário 2026-07-24, quanto ao modelo)
- decision: Contratar registrador homologado (Pontomais candidata líder, API verificada) exclusivamente para marcação e arquivos fiscais AFD/AEJ. Espelho, tratamento, jornadas/escalas, banco de horas e alimentação da folha própria são do nosso sistema, via API/webhooks. Nunca desenvolver registrador próprio (Portaria MTP 671/2021). RIPD antes da contratação se houver biometria. Em aberto: cotação formal (Fase 0).
- scope: controle de ponto, rh_ponto, integração REP-P

## ADR: Identidade Fase A — autenticação e cadastro próprios
- source: docs/02-arquitetura.md
- status: locked (FECHADA pelo usuário 2026-07-24, para a Fase A)
- decision: App tem usuários próprios com papéis funcionario/gestor/rh/dp/admin; 2FA para dp/rh/admin. Colaborador é entidade de RH com matrícula própria; "gestor" deriva de relacao_gestor com vigência, nunca de flag manual. Mapeamento com usuários do portal é problema da Fase B.
- scope: identidade, autenticação, RBAC próprio

## ADR: Auditoria em duas trilhas + versionamento com vigência na fundação
- source: docs/02-arquitetura.md
- status: locked (princípio fechado; critério de gate da Fase 1)
- decision: Trilha de alteração (audit só-INSERT por GRANT) + trilha de leitura de dado sensível desde a Fase 1. Vigência para toda regra parametrizável (rascunho → ativa → encerrada, sem recálculo retroativo). "Fechado não reabre; correção é evento novo." Cada competência de folha fechada referencia as versões exatas de rubricas e tabelas legais usadas.
- scope: auditoria, versionamento com vigência, fundação

## ADR: Central de Metas — nenhuma meta fixa em código
- source: docs/02-arquitetura.md
- status: locked (decisão do usuário 2026-07-27)
- decision: Todo KPI busca sua meta no catálogo administrável (indicador + meta_indicador_versao, versionada com vigência — nova meta encerra a anterior, período já apurado continua avaliado pela meta da época). Nenhuma meta em constante de código. Inclui o % de entrevistas de desligamento.
- scope: indicadores, metas, Central de Metas

## ADR: Clima — check-in diário simples de humor; variante de anonimato
- source: docs/02-arquitetura.md
- status: locked (formato FECHADO 2026-07-24); variante de anonimato originalmente EM ABERTO — resolvida por construção (Variante A anônima; ver nota)
- decision: Check-in diário de humor em escala de 5 emojis + texto opcional, no schema rh_clima isolado por GRANT. Duas variantes previstas — A: anônimo agregado (sem FK para pessoa, k≥5); B: identificado com alerta. Recomendação do arquiteto: começar pela A.
- scope: clima, rh_clima, anonimato
- note: O código construído (ver docs/14-mapa-de-eixos.md, eixo pessoa×vínculo e nada-chumbado) implementa piso de anonimato k e projeção agregada — consistente com a Variante A. O sub-item "em aberto" do ADR aparece resolvido por construção; confirmar registro no log de decisões.

## ADR: Avaliação 360 — esqueleto btime revisto criticamente
- source: docs/02-arquitetura.md
- status: locked quanto ao rumo; modelo (pesos/faixas/réguas) EM ABERTO no design
- decision: Usar material da btime como esqueleto base sob revisão crítica (não adotar cegamente). Regras 100% administráveis pelo RH com vigência. 9 Valores Fast como régua do pilar cultural. Usuário tem o código da btime — pedir quando o design do módulo começar.
- scope: avaliação 360, rh_avaliacao

---

## ADR: O arnês do projeto — sete componentes (governança de processo/tooling)
- source: docs/13-arnes-do-projeto.md
- status: locked (manifest override DOC→ADR; precedence 0 — governa todo agente)
- decision: Contrato de processo/ferramental que vincula todo agente. Sete componentes fechados em 01/08/2026: (1) oito ferramentas de linha de comando em db/ ("use estas; não reimplemente"; --banco <nome> obrigatório); (2) sandbox — branch por onda, banco por frente (bancada.js), um servidor compartilhado em cadeia para HTTP; (3) verificação com gatilho/escopo/profundidade — npm test + npm run test:e2e, adversarial disparado pelo mapa de eixos; (4) memória com taxonomia e prazo de validade; (5) contexto em três camadas (AGENTS.md sempre / mapa buscado / onda-atual some); (6) hooks de comunicação (pulso, informe de posição, sonda); (7) system prompt/contenção — "contenção não se escreve, se constrói".
- scope: processo de engenharia, ferramental db/, sandbox, verificação, agentes

## ADR: Regras de ouro executáveis por hook (não por prosa)
- source: docs/13-arnes-do-projeto.md
- status: locked
- decision: Regras de ouro aplicadas por hooks Claude Code versionados em .claude/settings.json (valem dentro de subagentes; bloqueio determinístico; SubagentStop impede terminar com portão vermelho). Regras: não reescreve histórico git; não edita migration já aplicada; não escreve no Supabase (exceto o ato de fechamento via migracoes.js); não declara pronto com portão vermelho; não commita lixo; não apaga prova; não retrata mapa/snapshot sem a sentinela do fechamento; não usa --sem-portao. "Hook guarda o que o agente faz direto; script guarda o que script faz." Regras marcadas "grafia" são dissuasão, não garantia.
- scope: regras de ouro, hooks, contenção, segurança de processo

## ADR: O fechamento da onda — ato nomeado (npm run fechar-onda)
- source: docs/13-arnes-do-projeto.md
- status: locked (spec do que será construído; fechamento mínimo executável hoje = 7 linhas)
- decision: O fechamento é ato do agente principal, depois do de-acordo do dono, e é o único contexto que define a sentinela que destrava o retrato e a escrita no Supabase. Sequência rígida de 12 passos, com ordem inviolável conferir → julgar → retratar (5→6→9) e merge-para-main antes do retrato (passo 8; conflito devolve ao passo 1).
- scope: fechamento de onda, merge para main, gate

---

## ADR: Os dez eixos — invariantes travados do codebase
- source: docs/14-mapa-de-eixos.md
- status: locked (manifest override DOC→ADR; precedence 1 — invariantes vinculantes)
- decision: Dez regras que atravessam o sistema, cada uma paga por um defeito real; três reforçadas por regra de ESLint custom. Executáveis via db/mapa.js (diff contra baseline; validado por sabotagem). Os eixos — (1) pessoa × vínculo: contar gente ≠ contar contrato; (2) identidade de lugar: estabelecimento/CC por id, nunca por nome; (3) tempo civil: data civil em America/Sao_Paulo, nunca UTC; (4) decisão de acesso: chave de permissão, nunca nome de papel; (5) dinheiro: centavos inteiros, divisor/fator/teto administráveis; (6) tempo trabalhado: minutos inteiros, hora noturna reduzida, parâmetro chega ao motor pela versão certa; (7) onde o filtro mora: no servidor dentro da consulta, nunca no cliente; (8) rastro de leitura: ler dado sensível de terceiro deixa marca com a chave que autorizou; (9) nada chumbado: limite/fator/divisor/prazo/dia/lista administráveis por tela; (10) vigência: registro só vale dentro da janela.
- scope: invariantes de dados, revisão de código, mapa de eixos

## ADR: Regra estrutural — decisão humana registrada, flag nunca executa
- source: docs/14-mapa-de-eixos.md, docs/02-arquitetura.md (reforçada nos PRDs 05-avaliacao-360, 11-desligamento)
- status: locked (princípio inegociável; LGPD art. 20)
- decision: Toda consequência de avaliação/desligamento é decisão humana registrada, com justificativa obrigatória ao divergir da recomendação. Nenhum status de colaborador muda por flag/algoritmo. Referenciado por decisao_humana; o processo de desligamento consome a decisão, nunca a flag.
- scope: 360, desligamento, LGPD, decisão automatizada
