# Fast Pessoas

## What This Is

Fast Pessoas é o sistema próprio de DP/RH e folha do Grupo Fast — pessoas, ponto,
benefícios, folha e obrigações fiscais rodando em Next.js/Node/PostgreSQL, construído para
substituir o que hoje é feito no Nasajon. É um app independente (Fase A) que nasce entregue
ao DP/RH e depois se incorpora ao portal corporativo (Fase B). Já está largamente construído
e verificado (15 módulos, ondas A–J + defeitos + benefícios); este ciclo o leva **da demo ao
uso real**.

## Core Value

O trabalho do DP é *fazer*, não *olhar*: o sistema tem de sustentar a operação **semanal e real**
do DP/RH da Fast com **dados reais** — não impressionar numa demonstração. Quando houver corte,
"fica o que o DP faz toda semana, sai o que impressiona na demonstração" (docs/17).

## Requirements

### Validated

<!-- Já construído, committado e verificado — contexto, não escopo deste ciclo. -->

- ✓ **Fundação** — auth própria, RBAC por chave de permissão, 2FA, audit em duas trilhas, vigência, RLS por `SET LOCAL` (Ondas A–E)
- ✓ **Ponto e banco de horas** — jornadas/escalas versionadas, espelho, intercorrências, banco de horas em três níveis, portais colaborador/gestor (Onda F/G)
- ✓ **Estrutura pessoa × vínculo** — registro/lotação/centro de custo ortogonais, uma pessoa com N vínculos, transferência entre empresas, linha do tempo atravessando vínculos (Onda I)
- ✓ **Benefícios invertidos** — a pessoa já entra com direito, o DP concede com o valor dela, valor individual, revisão de valor com histórico (H3/H4), dependentes pelo próprio colaborador (Onda H)
- ✓ **Sweep de defeitos** — os incômodos (Onda 0) e os que enganam número (Onda 0b)

### Active

<!-- Escopo deste ciclo — "da demo ao uso real". Ordem vigente: docs/17-lista-de-execucao.md. -->

- [ ] **Padrão modelo** (catálogo → modelo → regra) aplicado a admissão, recrutamento, clima e avaliação (cobre L1+L2)
- [ ] **Folha J** — três visões de conferência + OLAC por arquivo
- [ ] **Disciplinar + Posse** — medidas disciplinares, ciclo de documento com testemunhas (resolve a ciência do Código de Conduta / N2), custódia de ativos
- [ ] **K — Visibilidade em camadas** — salário pela sub-árvore recursiva do organograma, permissão por registro, campos cadastrais e ficha pública
- [ ] **Painel executivo** — filtro lateral honesto nas 24 consultas
- [ ] **M — Pesquisa com público-alvo**
- [ ] **N — Uso real** — importadores de carga inicial + preparação de go-live

### Out of Scope

<!-- Fronteiras explícitas deste ciclo, com o porquê. -->

- **Incorporação ao portal corporativo (Fase B)** — decisão ADR difere para depois; app próprio primeiro
- **Cutover da folha própria para oficial** — só após paridade comprovada (≥2 competências limpas, uma com férias/rescisão); nunca entre nov–jan (13º). Nasajon segue oficial na sombra
- **Transmissão eSocial em produção** — depende de certificado e-CNPJ + homologação restrita (terceiro)
- **EPI e ASO por cargo** e **cadeia de aprovação por valor** — o padrão modelo cabe neles, mas "fica para depois, com conversa própria" (o par com risco fiscal e o que mexe em autoridade/dinheiro) → v2
- **Check-in de clima como pop-up no portal de vendas (N3)** — depende da Fase B da plataforma

## Context

- **Sistema maduro, não greenfield.** 23 domínios em `fast-pessoas/src/dominios/*`, arquitetura de três camadas (rotas → serviço → repositório → esquemas Zod), migrations SQL numeradas append-only. Ver `.planning/codebase/*.md`.
- **Fonte de ordem = docs/17-lista-de-execucao.md** (reavaliada depois que o dono usou o sistema); substitui a *ordem* de docs/10, mas o *conteúdo* das ondas H–N continua valendo lá.
- **Segunda fonte de verdade:** o que quebrou quando um humano tocou nas telas (docs/16-caderno-do-teste.md). Lição do fechamento: "para cada estado que o banco admite, existe caminho na tela?"
- **Padrão transversal descoberto na sessão de teste:** *catálogo → modelo → regra que escolhe* cabe em nove lugares. Tratado como uma forma aplicada nove vezes (uma tela boa replicada), não nove telas.
- **Quatro perguntas abertas desta sessão** (afetam Fase 1 e 3): "Aprovar" serve para todo tipo de demanda ou o rótulo vem do tipo? · avisar ao concluir admissão com item não obrigatório pendente? · no checklist de admissão, quem manda — tipo de vínculo ou cargo? · vaga aberta pode trocar de modelo de processo?
- **Débito técnico conhecido** (`.planning/codebase/CONCERNS.md`): serviços monolíticos grandes (ponto 3k+ linhas), transferência entre CNPJs com escala/benefício/liderança inconsistentes, duas portas de desligar (ficha vs módulo), seeder incompleto.

## Constraints

- **Tech stack**: Next.js 16 + React 19 + TypeScript + Node 24, PostgreSQL (local dev 18; Supabase é presentation-only e write-guarded) — stack único ADR-travado, nada herdado.
- **Os dez eixos (invariantes travados, docs/14)**: (1) pessoa × vínculo — contar gente ≠ contar contrato; (2) identidade de lugar por id, nunca por nome; (3) tempo civil em America/Sao_Paulo, nunca UTC; (4) acesso por chave de permissão, nunca nome de papel; (5) dinheiro em centavos inteiros, divisor/fator/teto administráveis; (6) tempo trabalhado em minutos inteiros; (7) filtro mora no servidor dentro da consulta; (8) leitura de dado sensível deixa rastro com a chave que autorizou; (9) nada chumbado — limite/fator/prazo/lista administráveis por tela; (10) vigência — registro só vale dentro da janela. **Eixos 4, 5 e 9 são reforçados por ESLint custom.**
- **Regra estrutural (LGPD art. 20)**: toda consequência de avaliação/desligamento é **decisão humana registrada**; nenhum status muda por flag/algoritmo. Flag é recomendação; o processo consome a decisão, nunca a flag.
- **O arnês (docs/13)**: usar as ferramentas de `db/`; branch por onda + banco por frente; regras de ouro por hook (não reescreve git, não edita migration aplicada, não escreve no Supabase exceto no fechamento, não declara pronto com portão vermelho); fechamento é ato nomeado (`npm run fechar-onda`) com ordem inviolável conferir → julgar → retratar, merge-para-main antes do retrato.
- **Portões de verificação de toda fase**: `npm test` (167 testes, ~3s) e `npm run lint` (0 erros), a partir de `fast-pessoas/`. SubagentStop impede terminar com portão vermelho.
- **Dependências de terceiros (bloqueiam, não são fases)**: REP-P homologado (marcação) · certificado e-CNPJ (eSocial) · T&D/Sults · **Diego — lista de rubricas + layout dos importadores (bloqueia a Fase 7)**.

## Key Decisions

### Locked ADRs (não podem ser sobrescritos por nenhuma fase)

| ADR | Escopo travado |
|-----|----------------|
| **docs/02-arquitetura** | App próprio em 2 fases (A separada → B incorporada); stack Next.js/Node/Postgres único; PostgreSQL dedicado com schemas segregados por GRANT; **folha e transmissão próprias, sem Nasajon**; transição paralelo→cutover só após paridade; REP-P só marcação/AFD/AEJ; auth e RBAC próprios (Fase A); audit duas trilhas + vigência na fundação; Central de Metas sem meta em código; clima check-in anônimo (Variante A); 360 esqueleto btime sob revisão crítica |
| **docs/13-arnes** (precedence 0) | Governança de processo/tooling que vincula todo agente — sete componentes, regras de ouro por hook, o ato de fechamento de onda |
| **docs/14-mapa-de-eixos** (precedence 1) | Os dez eixos/invariantes de dados + "flag nunca executa / decisão humana registrada" |

### Decisões deste ciclo

| Decisão | Racional | Situação |
|---------|----------|----------|
| Ordem de execução segue docs/17, não docs/10 | Reavaliada depois que o dono usou o sistema (2ª fonte de verdade) | ✓ Confirmada pelo orquestrador |
| Padrão único catálogo→modelo→regra (uma tela replicada 9×) | Custo e usabilidade muito melhores que 9 telas | ✓ Adotada (Fase 1) |
| Salário visível pela sub-árvore recursiva do organograma (`WITH RECURSIVE`) | Cancela o corte "gerente pra cima"; destrava a Onda K | ✓ Resolvida 2026-07-31 |
| OLAC por arquivo primeiro, API na 2ª fase | Destrava o impasse Castor (Supply/DCS/Casa do Montador processam folha fora) | ✓ Decidida 2026-07-30 |
| N2 (ciência do Código de Conduta) migra para a fase Disciplinar+Posse | Reusa o ciclo de documento com testemunhas | ✓ docs/17 |
| Seis pendências de terceiros seguem como dependências abertas | "Nada sobe como pergunta crua" — cada uma com decisão recomendada | — Pendente (donos: Guilherme/Diego) |

---
*Last updated: 2026-08-10 after ingest (new-project-from-ingest)*
