# Documentação de arquitetura — Sistema de RH/DP (Fast Pessoas)

> **Status: ARQUITETURA v2** — revisada em 2026-07-24 após as decisões do usuário (app próprio
> em 2 fases, stack Next.js/TypeScript/Node, PostgreSQL dedicado SaveinCloud, folha e transmissor
> eSocial PRÓPRIOS com transição em sombra, REP-P de mercado, clima como check-in diário).
> **Fase sem código: só documentos e protótipos HTML até autorização expressa.**

| Documento | Conteúdo |
|---|---|
| [02-arquitetura.md](02-arquitetura.md) | **Documento central (v2)** — plataforma em 2 fases, stack, modelo de domínio, diagrama, roadmap com trilha paralela da folha |
| [03-modulos/](03-modulos/) | Especificação funcional dos 13 módulos (01-núcleo … 13-recrutamento-selecao) |
| [05-pesquisa-mercado.md](05-pesquisa-mercado.md) | Pesquisa de mercado verificada (2 rodadas): ferramentas para incorporar via API, com vereditos |
| [01-avaliacao-fontes.md](01-avaliacao-fontes.md) | Histórico — avaliação das fontes de conhecimento (pré-decisões) |
| [04-critica-e-pendencias.md](04-critica-e-pendencias.md) | Histórico — crítica da v1 (as lacunas altas foram incorporadas; contexto Nasajon superado) |
| [anexos/](anexos/) | Histórico — as 3 propostas da v1 e o detalhe da pesquisa complementar |

Log de decisões do projeto: `../00_contexto/decisoes_arquiteturais.md`.
Decisão pendente do usuário (não bloqueia): reaproveitar a numeração de matrícula do Nasajon como matrícula própria (recomendado — elimina o de-para fiscal dos legados).
