# 19 · Fundamentação do PDI — por que a IA escreve assim, e o plano para deixá-lo ótimo

> O dono quer esta peça **ótima**, não só boa. Em 13/08/2026 a instrução da IA que rascunha o PDI
> foi **refundada sobre pesquisa em fontes confiáveis** (CCL, SHRM, Korn Ferry, Kluger & DeNisi,
> Gallup, HBR/Ericsson, GPTW e Fundação Vanzolini). Este documento guarda os princípios, as fontes
> e o plano de melhoria em três fases (A feita, B e C planejadas). A instrução vive em
> `fast-pessoas/src/dominios/pdi/instrucao.ts` (`INSTRUCAO_PDI`) até a Fase C, que a torna editável
> pela tela.

## Os princípios (o que faz um PDI ser ótimo)

1. **Experiência > curso — modelo 70-20-10.** ~70% do desenvolvimento vem de desafios reais no
   trabalho, ~20% de feedback/mentoria, ~10% de formação formal. Proporção-guia, não fórmula.
   *Um PDI que é só lista de cursos está mal formado.* — CCL (McCall, Lombardo & Eichinger).
2. **Meta específica E difícil.** Metas específicas e desafiadoras superam "faça o seu melhor".
   SMART é o formato de redação; a força motivacional vem de ser específica + difícil, com
   feedback e comprometimento. — Locke & Latham (teoria de fixação de metas); Doran 1981 (SMART).
3. **Ancorar em competências, com foco.** Organizar por competência (nível atual → nível desejado
   → por que importa), não por atividade solta. **2 a 4 competências por ciclo.** — SHRM (IDP).
4. **Começar pelas forças, não virar lista de defeitos.** A maioria das ações deve *ampliar uma
   força*; lacunas entram classificadas como críticas/descarriladoras (endereçar) ou gerenciáveis
   (mitigar/delegar/contornar). Talento × Investimento = Força. — Gallup (CliftonStrengths).
5. **Feedback no comportamento, nunca no "self".** Ponto cego = comportamento observável + impacto
   (formato **Situação → Comportamento → Impacto**). Proibido adjetivo de caráter. Feedback focado
   no self tende a piorar o desempenho. — Kluger & DeNisi (1996); SBI (CCL).
6. **Ponto cego é hipótese, não veredito.** Redigir como percepção a validar, terminar em convite
   à conversa; classificar por direção (superavaliado = ponto cego / subavaliado = força não
   reconhecida / alinhado); dar peso à visão dos pares; máx. 2-3; preservar anonimato. — CCL (360).
7. **Mentalidade de crescimento honesta.** Linguagem de "ainda não" + próximo passo concreto; nem
   veredito duro, nem elogio vazio. — Carol Dweck.
8. **Orientar ao futuro (feedforward) + prática deliberada + esqueleto GROW.** Cada ação nomeia a
   sub-habilidade, quem dá feedback e a cadência de check-in; desemboca no que fazer a seguir. —
   Marshall Goldsmith (feedforward); Ericsson (prática deliberada); Whitmore (GROW).
9. **Voz brasileira, coautoria, sem clichê.** 2ª pessoa ("Você vai…", "Combinamos que…"), nomear
   os três papéis (colaborador/gestor/RH), banir clichê corporativo e anglicismo desnecessário, não
   prometer promoção, não confundir PDI com avaliação. — GPTW Brasil; Fundação Vanzolini (Poli-USP).

## Armadilhas a evitar (compiladas da pesquisa)

- PDI só de cursos (a fatia dos 10%); ignora que o desenvolvimento vem do desafio real e do feedback.
- Meta vaga ("melhorar a comunicação", "ser mais proativo") sem indicador observável nem prazo.
- Confundir SMART (formato) com a fonte da motivação; um PDI cheio de metas SMART fáceis é inócuo.
- Ponto cego como julgamento de caráter ("é arrogante") em vez de comportamento situado.
- Divergência auto×líder×pares apresentada como veredito fechado, não como percepção a explorar.
- Falso growth mindset: elogio ao esforço sem dizer o nível atual nem apontar estratégia concreta.
- Tratar só a superavaliação como ponto cego e ignorar a força não reconhecida (subavaliação).
- Excesso de itens: muitas lacunas diluem o foco; o 360 rende quando vira 2-3 comportamentos.
- Indicador baseado só em autopercepção ("sentir-me mais confiante") em vez de evidência externa.
- Ação sem apoio nomeado (o "20" fica órfão) ou sem check-in intermediário.
- Clichê corporativo ("vestir a camisa", "sair da zona de conforto", "protagonismo", "disruptivo")
  e anglicismo ("reskilling", "ownership", "deliverables", "one-on-one") quando há termo em pt-BR.
- Prometer promoção como resultado do PDI; confundir PDI com plano de carreira ou com a avaliação.

## Fase A — a nova instrução (FEITA, 13/08/2026)

Reescrita de `INSTRUCAO_PDI` sobre os 9 princípios, **sem mudar o schema de saída** — a IA já
escreve muito melhor dentro dos campos atuais (`focos`, `pontos_cegos`, `resumo`). Principais
mudanças frente à v1: começar pelas forças (não pela nota mais baixa); ação com modalidade
70-20-10 + indicador verificável por terceiro + quem apoia embutidos no texto; pontos cegos em
formato SBI, como percepção a validar, com classificação por direção e proibição de adjetivo de
caráter; voz de coautoria em 2ª pessoa; proibição explícita de clichê/anglicismo e de promessa de
promoção.

## Fase B — estrutura rica (FEITA, 13/08/2026 — commit `3afe44a`)

Deu **campos** ao plano. Decisão do dono: os campos são **OPCIONAIS** — a IA preenche, o RH/DP pode
deixar em branco ou limpar; o motor **avisa, nunca bloqueia**.

- **Schema** (`esquemas.ts` + `ESQUEMA_SAIDA_PDI`): a ação ganhou `modalidade`
  (experiência 70 · feedback 20 · formação 10), `indicador` (verificável por terceiro), `apoio`
  (quem apoia) e `tipo` (ampliar força | endereçar lacuna); o foco ganhou `nivel_atual` e
  `nivel_desejado`; o ponto cego virou objeto `{competencia, direcao(super/sub/alinhado), texto}`,
  com preprocess que tolera a forma antiga (string) de PDIs já gravados. Todos opcionais no zod;
  o `ESQUEMA_SAIDA_PDI` os exige (a IA sempre preenche).
- **Motor** (`calculo.ts`): **inverteu a filosofia antiga** (que penalizava focar numa força).
  Agora AVISA — sem nenhuma ação de força, foco só de formação, ação sem indicador, e ponto cego
  com adjetivo de caráter (Kluger & DeNisi / SBI). A checagem de forma pula campo em branco.
- **Tela** `/pdi`: renderiza e edita os campos novos; pontos cegos tolerantes a objeto/string. O
  `/meu-pdi` não mudou (lê a ação publicada, não o `conteudo`).
- **Provas**: `tests/pdi.test.ts` estendido (+7): schema, coerção da forma antiga, e os avisos
  novos. 203 testes passam; tsc/lint 0.

## Fase C — instrução administrável pela tela (FEITA, 13/08/2026 — commit `6e8a894`) — eixo 9

`INSTRUCAO_PDI` saiu de dentro do código. **Migration 0073** cria `rh.pdi_instrucao`, versionada
(só uma ativa, via índice parcial único; prova inline na migration). O `gerarPdi` lê a versão
ativa do banco, com **fallback** ao texto do código quando a tabela está vazia. Domínio:
`instrucaoAtiva`/`listarInstrucoes`/`salvarInstrucao` (repositório), `verInstrucao`/
`atualizarInstrucao` (serviço, com auditoria). Rota `GET`/`PUT /api/pdi/instrucao` gateada por
`pdi.homologar`. Tela **`/pdi/instrucao`** (editor + histórico + "restaurar padrão do sistema"),
com link a partir do `/pdi` para quem homologa. Smoke na 3001 (GET→PUT→GET→403 do gestor) e tabela
limpa ao fim. Assim o RH afina o "playbook" sem depender de deploy.

---

**Status da iniciativa: A → B → C COMPLETA e provada** (commits `dd17d8f`, `3afe44a`, `6e8a894` na
`revisao-geral`). Portões: tsc 0, lint 0, 203 testes. Migration até a 0073.

## Fontes (com nível de confiabilidade)

**Frameworks e metas**
- 70-20-10 — Center for Creative Leadership · alta · https://www.ccl.org/articles/leading-effectively-articles/70-20-10-rule/
- On-the-Job Learning — CCL · alta · https://www.ccl.org/articles/leading-effectively-articles/develop-strong-leaders-with-on-the-job-learning/
- 70-20-10: Where Is the Evidence? — ATD · alta · https://www.td.org/content/atd-blog/70-20-10-where-is-the-evidence
- Locke's Goal-Setting Theory — MindTools · alta · https://www.mindtools.com/azazlu3/lockes-goal-setting-theory/
- Goal Setting Theory (peer-reviewed overview) — ScienceDirect · alta · https://www.sciencedirect.com/topics/social-sciences/goal-setting-theory
- Doran (1981), "There's a S.M.A.R.T. Way…", Management Review · alta · https://www.scirp.org/reference/referencespapers?referenceid=2982408
- SMART Goals — MindTools · alta · https://www.mindtools.com/a4wo118/smart-goals/
- The Individual Development Plan (IDP) Approach — SHRM · alta · https://www.shrm.org/in/topics-tools/news/blogs/charting-growth-trajectories--the-individual-development-plan--i
- Learning Agility (Lombardo & Eichinger) — ResearchGate · alta · https://www.researchgate.net/publication/232583122_LEARNING_AGILITY_A_CONSTRUCT_WHOSE_TIME_HAS_COME
- FYI for Learning Agility — Korn Ferry · alta · https://www.kornferry.com/content/dam/kornferry/docs/article-migration//82199-FYI_Learning_Agility_2nd_BLAD.pdf

**Feedback, pontos cegos e 360**
- Kluger & DeNisi (1996), Feedback Intervention Theory, Psychological Bulletin · alta · https://cris.huji.ac.il/en/publications/the-effects-of-feedback-interventions-on-performance-a-historical/
- Understanding Your 360 Results — CCL · alta · https://www.ccl.org/articles/leading-effectively-articles/360-assessment-results-meaning/
- 360 Best Practices & Guidelines — CCL · alta · https://www.ccl.org/articles/leading-effectively-articles/360-degree-assessment-feedback-best-practices-guidelines/
- Carol Dweck Revisits the 'Growth Mindset' — Education Week · alta · https://www.edweek.org/leadership/opinion-carol-dweck-revisits-the-growth-mindset/2015/09
- The SBI Feedback Tool (modelo do CCL) — MindTools · alta · https://www.mindtools.com/ay86376/the-situation-behavior-impact-feedback-tool/
- Try Feedforward Instead of Feedback — Marshall Goldsmith · alta · https://www.hrbartender.com/images/GoldsmithFeedforward.pdf

**Coaching, forças e design de ações**
- The GROW Model — MindTools · alta · https://www.mindtools.com/your-toolkit/coaching-goals/grow-model/
- The GROW Coaching Model — Performance Consultants (John Whitmore) · alta · https://www.performanceconsultants.com/resources/the-grow-model/
- The Science of CliftonStrengths — Gallup · alta · https://www.gallup.com/cliftonstrengths/en/253790/science-of-cliftonstrengths.aspx
- Strengths & Work Engagement — Gallup · alta · https://www.gallup.com/workplace/242096/focus-people-strengths-increases-work-engagement.aspx
- The Making of an Expert — Ericsson et al., HBR (2007) · alta · https://hbr.org/2007/07/the-making-of-an-expert
- Deliberate Practice: A Review of Evidence — PMC/NCBI · alta · https://pmc.ncbi.nlm.nih.gov/articles/PMC7461852/
- Strength-based vs deficit-based self-regulated learning — PMC/NCBI · alta · https://pmc.ncbi.nlm.nih.gov/articles/PMC4565885/
- What Really Helps Employees Improve (não é crítica) — Knowledge at Wharton · alta · https://knowledge.wharton.upenn.edu/article/really-helps-employees-improve-not-criticism/

**PDI no contexto brasileiro**
- PDI: Guia completo — GPTW Brasil · alta · https://gptw.com.br/conteudo/artigos/plano-de-desenvolvimento-individual/
- Guia prático: PDI — Fundação Vanzolini (Poli-USP) · alta · https://vanzolini.org.br/blog/guia-pratico-plano-de-desenvolvimento-individual/
- PDI: o que é e como montar — Twygo (vendor, corroborado) · média · https://twygo.com/blog/plano-de-desenvolvimento-individual-pdi/
- Exemplos de PDI — TOTVS (vendor, corroborado) · média · https://www.totvs.com/blog/gestao-para-recursos-humanos/pdi-exemplos/

> Ver também `docs/16-caderno-do-teste.md` (decisões de desenho e defeitos achados testando) e a
> memória de projeto `[[pdi-compromisso-do-colaborador]]`.
