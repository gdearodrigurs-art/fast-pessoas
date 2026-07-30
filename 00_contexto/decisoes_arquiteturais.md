# Decisões do Projeto — Sistema de RH/DP

> Registra decisões técnicas e de produto com seus respectivos motivos.
> Mantido em conjunto com o Claude Code — pode ser editado manualmente quando necessário.

---

## Como ler este arquivo

Cada entrada tem: o que foi decidido, **por que**, e contexto relevante.
Use as tags para filtrar por área: `#arquitetura`, `#modelo-de-dados`, `#regra-negocio`, etc.

---

## Decisões

<!-- As entradas serão adicionadas abaixo -->

### [2026-07-24] Arquitetura consolidada gerada — recomendações aguardando validação do usuário

**Decisão:** Foi gerada a proposta consolidada de arquitetura (docs/02-arquitetura.md) a partir de 3 propostas independentes julgadas por 3 lentes (custo, manutenibilidade, compliance/LGPD). Nenhuma recomendação está aprovada pelo usuário ainda.

**Motivo:** Método de painel de juízes para evitar ancoragem numa única proposta; placar agregado: módulo no monorepo do portal 25,5 × hub SSO 23 × app separado SSO 22,4.

**Contexto:** Recomendações principais (todas pendentes de validação do usuário): (1) **Plataforma:** módulo "Fast Pessoas" dentro do monorepo do portal, com segregação lógica no banco (schemas rh/rh_clima, roles app_rh/app_clima, pgcrypto para saúde) e plano de saída documentado — condicionada a parecer DPO/jurídico; (2) **Stack:** FastAPI/Python no backend (padrão do portal), front Next.js+TS — condicionada a validação da proficiência Python dos 3 devs; (3) **Folha:** integrar Nasajon; fechamento = esteira de conferência, nunca cálculo próprio; (4) **Ponto:** nunca registrador próprio (Portaria 671); contratar REP-P homologado, avaliando primeiro o módulo da Nasajon; (5) **360:** spec TO-BE da btime como especificação, interface refeita no design system do portal; (6) **Clima:** anonimato estrutural (schema isolado, sem FK para pessoa, k≥5 no backend); (7) **Identidade:** sistema.usuarios do portal como fonte única, colaborador 1:1 — condicionada a medir a população sem login no portal; (8) **DW SAP:** rebaixado a enriquecimento analítico read-only.

**Tags:** #arquitetura #modelo-de-dados #regra-negocio

### [2026-07-24] Crítica de completude incorporada ao consolidado

**Decisão:** As 4 lacunas de gravidade alta da crítica foram incorporadas: (a) módulo de desligamento ganhou detalhamento próprio (docs/03-modulos/11-desligamento.md); (b) mapeamento Nasajon da Fase 0 passou a incluir escrita de alterações cadastrais/contratuais (S-2205/S-2206) e a tabela de dono único por campo virou entregável formal; (c) decisão de identidade reclassificada de "fechada" para "fechada condicionada a" medição da população sem login; (d) regra do 13º amarrada ao mês do cutover da esteira de folha.

**Motivo:** O crítico apontou que os detalhamentos de módulo sinalizavam esses problemas mas o consolidado não os havia absorvido ("loop de retorno" aberto).

**Contexto:** Lacunas de gravidade média/baixa registradas em docs/04-critica-e-pendencias.md para tratamento na Fase 0 (chave pgcrypto, feriados, processo interino LGPD, canal externo de admissão, motor de temporalidade).

**Tags:** #arquitetura #gap #validacao

### [2026-07-24] Pesquisa de mercado verificada — achado crítico sobre a API da Nasajon

**Decisão:** Registrados os vereditos da pesquisa de mercado (docs/05-pesquisa-mercado.md): Pontomais = melhor candidata de ponto (API REST + webhooks + AFD-671/AEJ programáticos); Clicksign/ZapSign = incorporáveis para assinatura; TeamCulture = candidata a referência/plano B para clima+360 mediante POC; Feedz = ignorar (absorvida pela TOTVS); Caju = sem API pública verificável apesar do marketing.

**Motivo:** Achado mais importante: o portal público de APIs da Nasajon quase não cobre DP/folha (só 2 recursos de ponto em 114) — a premissa "integrar folha via API Nasajon" tem probabilidade real de cair no plano B (troca de arquivos/batch), que a camada integracoes/ já prevê. A pergunta sobre API privada/parceria vira item obrigatório da reunião comercial da Fase 0.

**Contexto:** Método: pesquisa profunda com verificação adversarial (25 claims verificados, 23 confirmados, 2 refutados — os 2 refutados eram alegações de marketing sobre integração). Categorias R&S, SST, WhatsApp e open-source em pesquisa complementar.

**Tags:** #arquitetura #ingestao #validacao

### [2026-07-24] Pesquisa de mercado — 2ª rodada (categorias restantes) concluída

**Decisão:** Vereditos verificados adversarialmente registrados em docs/05-pesquisa-mercado.md (resumo) e docs/anexos/pesquisa-mercado-complementar-detalhe.md (fontes): admissão digital tem dois caminhos incorporáveis (Gupy Admissão via webhook pre-employee.moved com payload completo do admitido; Unico People/Acesso RH via positions API + webhook position-completed, com validação eSocial nativa na resposta — escolher UM na Fase 2); SST: SOC confirmado (SOAP/WSDL, importação de funcionário e agendamento) como candidato de integração; avisos: WhatsApp Cloud API oficial via node nativo do n8n (cobrança por mensagem desde jul/2025; utility ≈ US$0,007), e-mail transacional como canal barato padrão, SMS descartado (~9× o custo do WhatsApp no Brasil); benefícios: Flash, Swile e iFood Benefícios têm API pública real — Caju continua sem; assinatura: D4Sign incorporável, DocuSign só referência (sem ICP-Brasil em nuvem); BI: nenhuma opção open-source gratuita faz embedding com SSO — recomendação de construir dashboards nativos em React (dados já no PostgreSQL, design system pronto); Metabase/Superset só como referência ou com prova técnica.

**Motivo:** Fechar as 4 categorias que a 1ª rodada deixou sem claims verificados e cobrir os concorrentes restantes, para que a decisão construir × integrar de cada módulo tenha base de mercado completa antes da Fase 0.

**Contexto:** Adendo relevante de ponto: o verificador enumerou o índice completo da API da Pontomais — inclui Afastamentos, Feriados, Banco de horas, Abonos, Exceções de jornada, Exportação Folha e Webhooks — mas a API de efetivação de ajuste segue sem prova (continua critério de cotação). Ahgora e mywork: exigir prova técnica.

**Tags:** #arquitetura #ingestao #validacao

### [2026-07-24] DECISÃO DO USUÁRIO — Plataforma em 2 fases: app separado primeiro, portal depois

**Decisão:** O sistema nasce FORA do portal (app próprio), é entregue ao time de DP/RH para testar e propor melhorias; numa Fase 2 será colocado dentro do portal corporativo.

**Motivo:** Decisão do usuário — validação rápida com o time de DP/RH antes de acoplar ao portal. Supersede a recomendação consolidada (módulo no monorepo desde o início).

**Contexto:** "Colocar dentro do portal" na Fase 2 ainda precisa de definição (SSO + integração visual × migração de código para o monorepo). O desenho da Fase 1 deve minimizar o custo da Fase 2: usar os tokens visuais do portal desde o 1º protótipo, manter domínios isolados e identidade mapeável (matrícula/CPF ↔ usuário do portal).

**Tags:** #arquitetura #canonico

### [2026-07-24] DECISÃO DO USUÁRIO — Stack: Next.js + TypeScript + Node.js; PostgreSQL dedicado na SaveinCloud

**Decisão:** Front e backend em Next.js/TypeScript/Node.js; banco PostgreSQL dedicado hospedado na SaveinCloud, em servidor próprio.

**Motivo:** Decisão do usuário; coerente com a plataforma "app separado" (o argumento pró-FastAPI era herdar o núcleo do portal, que deixou de valer na Fase 1). Domínio do time sobre o stack.

**Contexto:** Risco registrado para a Fase 2: se "entrar no portal" significar migrar para o monorepo (backend Python/FastAPI), o backend Node exigiria reescrita — mitigar definindo a Fase 2 como integração (SSO/visual) ou aceitando o custo conscientemente. Os padrões inegociáveis (RLS/acesso por papel, auditoria append-only, versionamento com vigência, transações) serão implementados em Node — não existem "de graça" como no portal.

**Tags:** #arquitetura

### [2026-07-24] DECISÃO DO USUÁRIO — Folha própria: substituir o Nasajon, não integrar

**Decisão:** Não haverá integração com o Nasajon. O que hoje é feito no Nasajon passa a ser feito no sistema interno — o módulo de folha deixa de ser "esteira de conferência" e vira motor de cálculo completo.

**Motivo:** Decisão do usuário: quer o processo inteiro dentro do sistema próprio.

**Contexto:** Contraria a recomendação das duas fontes de conhecimento e da pesquisa de mercado; risco alto registrado e assumido: cálculo CLT completo (proventos, descontos, encargos, 13º, férias, rescisão), eSocial (eventos periódicos e não periódicos + SST), FGTS Digital, DCTFWeb, convenções coletivas por unidade, e manutenção regulatória contínua sob responsabilidade própria. Mitigações a desenhar: motor de folha isolado e versionado, período de paridade com o Nasajon em paralelo antes do cutover (forma pendente de decisão), e estratégia de transmissão eSocial a pesquisar (webservices do governo com certificado digital × biblioteca/middleware de mercado).

**Tags:** #arquitetura #regra-negocio #descartado

### [2026-07-24] DECISÃO DO USUÁRIO — 360: material da btime como esqueleto; código em posse do usuário

**Decisão:** A avaliação da btime é considerada superficial e com erros estruturais, mas serve de esqueleto base. O usuário TEM o código — pedir quando o design do módulo começar (não é mais pendência de terceiro).

**Motivo:** Aproveitar o discovery sem herdar os erros; o modelo (pilares, ciclos, faixas) será revisto criticamente no design do módulo.

**Tags:** #regra-negocio #agente

### [2026-07-24] DECISÃO DO USUÁRIO — Clima: construir interno, mais simples que o desenhado

**Decisão:** Clima será construído internamente, porém com escopo mais simples do que o módulo detalhado propôs. Escopo mínimo em definição com o usuário.

**Motivo:** Decisão do usuário. O desenho atual (k-anonimato, schema isolado, pool próprio) será recalibrado para a versão simples — anonimato continua requisito, a mecânica é que encolhe.

**Tags:** #regra-negocio

### [2026-07-24] Pendências de terceiros atualizadas pelas decisões do usuário

**Decisão:** (a) Parecer DPO sobre segregação lógica: esvaziado — banco dedicado na SaveinCloud é segregação física; restam os RIPDs (ponto/clima) e a tabela de temporalidade como tarefas internas. (b) População sem login no portal: irrelevante na Fase 1 (o app terá autenticação própria e contas para todos); vira mapeamento na Fase 2. (c) Convenções coletivas por unidade: usuário já solicitou ao time de DP. (d) Reunião com a Nasajon: cancelada como dependência (sem integração) — o conhecimento do Nasajon ainda serve como referência funcional do que a folha própria precisa cobrir.

**Tags:** #arquitetura #validacao

### [2026-07-24] DECISÃO DO USUÁRIO — Ponto: REP-P de mercado; tratamento é nosso

**Decisão:** Contratar REP-P homologado de mercado só para a marcação e arquivos fiscais (AFD/AEJ). Espelho, tratamento, escalas, banco de horas e a alimentação da folha própria são do nosso sistema, via API/webhooks do fornecedor.

**Motivo:** Portaria 671/2021 — desenvolver registrador próprio nos tornaria fornecedor de REP-P (INPI, atestado técnico, comprovante por marcação); não vale o esforço regulatório. Pontomais é a candidata líder (API verificada); cotação na Fase 0 com os critérios já definidos.

**Tags:** #arquitetura #regra-negocio

### [2026-07-24] DECISÃO DO USUÁRIO — Transição da folha: paralelo até paridade

**Decisão:** Durante a construção da folha própria, o Nasajon continua sendo a folha oficial; a nossa roda em sombra e os resultados são comparados por algumas competências. Cutover só após paridade comprovada.

**Motivo:** Risco mínimo de pagar errado; o custo é manter o Nasajon por mais tempo. Implicação: o período de sombra precisa de um mecanismo de importação/comparação dos resultados do Nasajon (relatórios/exports manuais servem — não é integração).

**Tags:** #arquitetura #regra-negocio #validacao

### [2026-07-24] DECISÃO DO USUÁRIO — Clima: check-in diário de humor com emojis

**Decisão:** O clima é um check-in diário simples: perguntas como "como você está se sentindo hoje?" e "como você tem se sentido a respeito de suas entregas?", com resposta em escala de 5 emojis (chorando / triste / neutro / sorrindo / sorrindo com estrelas) + campo de texto opcional.

**Motivo:** Decisão do usuário — escopo deliberadamente mais simples que o módulo detalhado propunha (pesquisas periódicas, eNPS, k-anonimato pesado).

**Contexto:** Questão aberta a resolver no design: respostas anônimas agregadas × identificadas (um check-in diário identificado permite o gestor agir caso alguém esteja mal, mas muda completamente a natureza LGPD do dado; a agregação anônima protege, mas perde o alerta individual). Levar as duas variantes com recomendação no protótipo.

**Tags:** #regra-negocio #modelo-de-dados

### [2026-07-24] CORREÇÃO DE PREMISSA — Stack do portal corporativo é Node, não FastAPI

**Decisão:** Segundo o usuário, o portal corporativo roda Next.js + TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud. O backend FastAPI/Python descrito na ficha de conhecimento é o **MCP do SAP** (conector de integração), não o portal.

**Motivo:** Informação direta do dono do sistema prevalece sobre a ficha (que conflacionou os dois). Consequências: (a) o conflito de stack da Fase 2 desaparece — app de RH e portal compartilham o mesmo stack, integração futura sem reescrita; (b) o risco registrado na decisão de stack está retirado; (c) as afirmações da ficha sobre "herdar RLS/audit/RBAC do portal" (padrões FastAPI/asyncpg) precisam ser re-verificadas contra o portal real quando a Fase 2 chegar — podem descrever o MCP.

**Tags:** #arquitetura #canonico #validacao

### [2026-07-24] Arquitetura v2 concluída e criticada; correções em aplicação

**Decisão:** A documentação inteira foi revisada para a v2 (docs/02-arquitetura.md + 12 módulos, incluindo o novo 12-esocial-obrigacoes). Roadmap v2: Fase 0 (3-5 sem, com spike técnico de eSocial e cotação do REP-P) → Fase 1 (2-3 meses: entrega cedo ao DP/RH — auth própria, ficha + linha do tempo, demandas, GED mínimo, clima diário) → Fase 2 (4-6 meses: admissão, afastamentos, ponto, férias, desligamento, assinatura, 360 v1) → Trilha F paralela da folha própria (9-15 meses, gate por paridade e não por calendário: motor → cobertura → sombra → fiscal em produção restrita → cutover) → Fase 3 (expansão + Fase B da plataforma).

**Motivo:** Propagar as decisões do usuário de 2026-07-24 a todos os documentos; o crítico de consistência validou os fluxos ponta a ponta e encontrou 1 problema alto (matrícula eSocial não pode "morrer no cutover" — eventos de legados referenciam a matrícula do RET para sempre), 4 médios (benefícios na fase errada do roadmap; máquina de estados da competência com 3 variantes — a do módulo 03 virou canônica; postura divergente sobre transmissão SST — formulação única: Rota B é o destino, Rota A é partida; S-2205/S-2206 nascendo de projeção — regra "nenhum evento fiscal nasce de projeção") e 5 baixos. Todas as 10 correções foram aplicadas nos documentos (verificado: nenhuma ocorrência restante de estado "coleta", pgcrypto só em forma negativa, rotas SST na formulação canônica, matrícula eSocial persistente no núcleo/folha/desligamento/fiscal).

**Contexto:** Decisões derivadas fechadas nesta rodada: cifra de dado de saúde na camada de aplicação Node com chave em secret manager (sem pgcrypto); e-mail transacional como canal padrão de avisos, WhatsApp reservado a urgência com opt-in; entidade empregador/estabelecimento_versao (CNPJ, RAT/FAP, FPAS, CNAE) entra no modelo de domínio como fonte do S-1000/S-1005. **Pendência a levar ao usuário (não bloqueia):** reaproveitar a numeração de matrícula do Nasajon como matrícula própria eliminaria o de-para fiscal dos colaboradores legados — recomendável; decidir antes da Fase 1.

**Tags:** #arquitetura #modelo-de-dados #validacao #gap

### [2026-07-27] FEEDBACK DA DIRETORIA — projeto aprovado; entrevista de desligamento vira indicador oficial

**Decisão:** A Diretora de Pessoas aprovou o projeto com um pedido: dar mais atenção à entrevista de desligamento, que é indicador do setor (% de entrevistas de desligamento realizadas). Incorporado ao desenho: (a) a entrevista ganhou **trava de encerramento** — o processo de desligamento não fecha sem desfecho registrado (realizada | recusada | não realizada com motivo), o que garante denominador confiável; (b) o **% de cobertura nasce no MVP** do desligamento (não na Fase 3), com painel mensal por unidade/tipo, meta configurável e versionada pelo RH e alerta de processo a caminho da efetivação com entrevista pendente; (c) o indicador usa só os status, nunca o conteúdo das respostas — visível a gestores/diretoria sem tocar no dado restrito.

**Motivo:** O indicador só é confiável se a não-realização for impossível de passar despercebida — daí a trava estrutural em vez de campo opcional.

**Contexto:** Atualizados: docs/03-modulos/11-desligamento.md (funcionalidade 12, entidades entrevista_desligamento + meta_entrevista_versao, pergunta aberta 7 com os parâmetros a confirmar com o DP: meta, elegibilidade de justa causa, janela e tolerância), docs/02-arquitetura.md (Fase 2 item 4 e people analytics) e o resumo executivo (md + docx).

**Tags:** #regra-negocio #relatorio #validacao

### [2026-07-27] DECISÃO DO USUÁRIO — Nenhuma meta de indicador fixa em código; Central de Metas administrável

**Decisão:** As metas de TODOS os indicadores são definidas pelo RH numa página própria ("Metas de Indicadores"), nunca em código. Mecanismo transversal: catálogo `indicador` (nome, área, unidade, direção, fórmula, visibilidade) + `meta_indicador_versao` (escopo global ou por unidade, valor, versionada com vigência — nova meta encerra a anterior; período já apurado continua avaliado pela meta da época). A entidade específica `meta_entrevista_versao` do módulo 11 foi absorvida pelo mecanismo genérico.

**Motivo:** Pedido explícito do usuário ("não quero nada travado") ao definir a meta do indicador de entrevistas de desligamento — generalizado para todos os KPIs do sistema, no mesmo padrão de versionamento com vigência já usado nas demais regras.

**Contexto:** Protótipo HTML standalone criado em `prototipos/metas-indicadores.html` (14 indicadores-exemplo em 9 áreas, papéis simulados RH/gestor/diretoria, metas globais e por unidade, histórico de versões, localStorage) — primeiro protótipo do projeto, pronto para validação com DP/RH. Atualizados: docs/02-arquitetura.md (§Transversais), docs/03-modulos/11-desligamento.md, resumo executivo (md + docx).

**Tags:** #regra-negocio #modelo-de-dados #relatorio #canonico

### [2026-07-27] DECISÃO DO USUÁRIO — Recrutamento e seleção promovido a módulo de primeira classe

**Decisão:** R&S deixa de ser "evolução mínima" dentro da admissão e vira módulo próprio (docs/03-modulos/13-recrutamento-selecao.md): requisição de vaga com aprovação e controle de headcount, vaga derivada de cargo/CHA com faixa salarial, pipeline de candidatos com etapas configuráveis e pareceres, oferta dentro da banda, banco de talentos, e aprovado disparando a admissão digital automaticamente. Núcleo entra no fim da Fase 2 (item 8); página de carreiras completa, testes online e sourcing externo ficam na Fase 3.

**Motivo:** O usuário notou a ausência — no desenho anterior o R&S só aparecia como esboço de Fase 3 e nem constava no resumo executivo. Recomendação registrada: construir o núcleo enxuto próprio (workflow sem risco regulatório, reusa demandas/checklist/GED) em vez de contratar ATS; gatilho de reavaliação por volume registrado no módulo (Gupy é a incorporável se mudar).

**Contexto:** Indicadores de R&S (tempo de vaga, funil, % fechadas no prazo) entram no catálogo da Central de Metas — metas administráveis, nada em código. LGPD: candidato é titular fora do quadro — retenção curta parametrizável com anonimização; pareceres de entrevista nunca migram para a ficha do colaborador. Atualizados: 02-arquitetura (domínio recrutamento/, Fase 2 item 8, Fase 3), módulo 09 (refocado em admissão digital), resumo executivo md+docx (15 itens).

**Tags:** #arquitetura #regra-negocio #modelo-de-dados

### [2026-07-27] DECISÃO DO USUÁRIO — Clima: confidencial com acesso individual exclusivo da Diretoria de Pessoas

**Decisão:** O check-in diário NÃO é estruturalmente anônimo: a resposta fica vinculada ao colaborador. Acesso individual (resposta + autor) é exclusivo do papel Diretoria de Pessoas, com chave própria, 2FA e trilha de leitura; gestores e RH operacional veem apenas agregados (com recorte mínimo para equipes pequenas). Transparência obrigatória: a tela do check-in informa explicitamente quem pode ver o quê.

**Motivo:** Resposta do usuário na validação de kickoff ("anônimo, porém o usuário de diretoria de RH pode ver a resposta"). Registrada a reclassificação técnica: isso é confidencialidade com acesso restrito, não anonimato — e o risco de viés de resposta (funcionário sabe que a diretoria pode ler) fica assumido e mitigado pela transparência.

**Contexto:** Muda o schema do clima: FK para colaborador existe; segregação por GRANT/chave de permissão em vez de ausência de vínculo. Módulo 06 e protótipo a atualizar. Substitui as variantes A/B/híbrida em discussão.

**Tags:** #regra-negocio #modelo-de-dados #canonico

### [2026-07-27] DECISÃO DO USUÁRIO — Kickoff de código autorizado (fundação + protótipos em paralelo)

**Decisão:** (a) **Matrícula:** reaproveitar a numeração do Nasajon como matrícula própria — matrícula do RET e do sistema são a mesma; o campo matricula_esocial permanece como conceito, igual à matrícula para todos. (b) **Repositório:** git local em C:\sistema RH agora; remoto GitHub depois. (c) **Método de kickoff:** fundação sem tela (projeto Next.js+TS, migrations, schemas, auth, auditoria) codada já; telas seguem protótipo → validação DP/RH → código. A regra "código só com autorização expressa" está atendida a partir desta data para a fundação da Fase 1.

**Motivo:** Usuário pediu para começar a codar; nenhuma decisão de arquitetura pendente impedia. Itens de Fase 0 que seguem em paralelo sem bloquear: provisionamento do PostgreSQL na SaveinCloud (dev local até lá), cotação REP-P, spike eSocial, convenções coletivas, código da btime.

**Tags:** #arquitetura #canonico

### [2026-07-27] DECISÃO DO USUÁRIO — Banco de desenvolvimento no Supabase pessoal; produção na SaveinCloud

**Decisão:** Durante o desenvolvimento/teste, o banco é o projeto Supabase "DP/RH" (criado pelo usuário em 2026-07-27, região us-west-2, Postgres 17) na conta pessoal dele. Quando o sistema estiver avançado, sobe para o PostgreSQL dedicado da empresa (SaveinCloud) reexecutando as migrations do zero.

**Motivo:** Proposta do usuário — destrava o desenvolvimento sem esperar o provisionamento da SaveinCloud. A migração futura é limpa porque toda a estrutura vive em migrations versionadas; dado de teste não migra.

**Contexto:** Condições registradas: (1) SOMENTE dados fictícios no Supabase — nenhum dado real de funcionário em conta pessoal (LGPD); (2) credenciais segregadas (app_rh/app_clima/app_folha) e RLS por GRANT ficam adiadas para o banco da empresa — no Supabase usa-se a conexão padrão; (3) região us-west-2 tem latência maior que sa-east-1 — aceitável para dev.

**Tags:** #arquitetura #ingestao #temporario

### [2026-07-28] DECISÃO DA DIRETORIA — Validação em bloco único, não por etapa

**Decisão:** A Diretora de Pessoas pediu uma grande aprovação ao final em vez de aprovar cada etapa/protótipo. O desenvolvimento passa a construir o máximo de módulos agora, com validação consolidada depois.

**Motivo:** Pedido da diretoria via usuário. Risco registrado e assumido: o método protótipo-por-etapa existia para baratear correção de fluxo — validação em bloco aumenta o custo de retrabalho se o DP/RH pedir mudanças estruturais. Mitigações: os protótipos de ficha, demandas e metas já existem e guiam as telas; os desenhos de clima e permissões estão fechados por decisão do usuário; auditoria/transações/minimização continuam inegociáveis (não dependem de validação de fluxo).

**Contexto:** Rodada grande iniciada em 2026-07-28: núcleo de pessoas completo (ocorrências, feedback 90d, cargos/posições com salário sensível, relação gestor, estabelecimentos), demandas, clima diário, Central de Metas, GED mínimo (arquivo em banco no dev, com limite e interface isolada para trocar por object storage) e configuração de 2FA. Fora da rodada (dependências externas mantidas): ponto/REP-P, folha, eSocial, 360/btime.

**Tags:** #regra-negocio #canonico #divida-tecnica

### [2026-07-28] DECISÃO DO USUÁRIO — Construir tudo que não depende de decisão dele ou de contratação

**Decisão:** Autorização ampla: seguir com todos os módulos e funções sem dependência externa, em três ondas encadeadas com verificação entre elas. Onda A: férias/afastamentos + desligamento (com entrevista e KPI calculado) + benefícios cadastro + admissão interna. Onda B: 360 (motor refeito conforme auditoria btime) + R&S núcleo. Onda C: motor de folha F1 (tabelas legais como dado versionado, valores marcados "conferir com DP") + SST base + notificações internas.

**Motivo:** Validação com a diretoria é em bloco; maximizar o que estará pronto para a grande aprovação.

**Contexto:** Continuam bloqueados por terceiros/decisões: ponto (contratar REP-P), transmissor eSocial (certificado digital + produção restrita), canal público de admissão (construir × Gupy × Unico em aberto), e-mail/WhatsApp (credenciais). Cifra de dado de saúde: AES na camada de aplicação com CHAVE_CIFRA_SAUDE no ambiente (secret manager em produção).

**Tags:** #arquitetura #canonico

### [2026-07-29] Onda B concluída (360 + R&S + 2FA real); backlog de hardening registrado

**Decisão:** Onda B verificada (37/37 PASS) e commitada (074f419). O motor da 360 impossibilita por design os erros da btime (validado por recálculo manual independente). Onda C (folha F1 + SST base + notificações internas) aguarda ordem do usuário.

**Contexto:** Backlog de hardening apontado pelo verificador (lacunas de produto, não regressões): (a) sem rate-limit/lockout no login; (b) sem proteção contra replay de código TOTP dentro da janela; (c) telas de 360/R&S verificadas por API+banco, não dirigidas por browser; (d) concorrência da geração lazy de ciclos protegida por constraint mas não exercitada com corrida real. Tratar num bloco de hardening antes de produção.

**Tags:** #arquitetura #validacao #divida-tecnica

### [2026-07-29] Onda C concluída — motor de folha F1 com segregação de funções na aprovação

**Decisão:** Onda C verificada (29/29 PASS, motor de folha validado por recálculo independente duas vezes) e commitada. Na revisão, implementei a divergência que o verificador expôs entre a migration 0013 e o serviço: (a) **quem calcula não aprova** — calculada_por registrado no cálculo e aprovação recusa o mesmo usuário (409); (b) **aprovação revalida TOTP no ato** (código de 6 dígitos no request; sem 2FA ativo = 403); rastro em aprovada_por/aprovada_em (migration 0017). Notificações, SST e folha no ar; 15 módulos funcionais.

**Motivo:** Aprovar folha é o ato de maior consequência financeira do sistema — controle de 4 olhos e reautenticação não podem ser "regra declarada e não implementada".

**Contexto:** Numeração corrigida: a migration do integrador (0016_indicadores_folha_sst) colidiu com a minha; segregação renumerada para 0017 com o registro do runner sincronizado. Resíduos de teste do banco dev em limpeza cirúrgica por agente (usuários @fastpessoas.local, colaboradores "Teste", competência 12/2099). Pendência conhecida do fluxo: com um único usuário DP real no dev, a aprovação exigirá um segundo usuário com folha.aprovar — comportamento correto, registrado para o teste manual do usuário.

**Tags:** #arquitetura #regra-negocio #validacao

### [2026-07-29] Feedback da analista de RH — achado de segregação de acesso confirmado

**Decisão:** Feedback analisado em docs/08-analise-feedback-analista-rh.md. Confirmado no banco o achado mais sério: o papel `rh` acumula as chaves de recrutamento (rs.*) E o histórico de DP (ficha, desligamentos, afastamentos, admissões, férias, ocorrências) — a analista afirma corretamente que quem recruta não deve ver histórico de DP. Nada implementado ainda; entra como prioridade 1 da próxima onda, se autorizada.

**Motivo:** Modelamos 6 papéis fixos e o papel `rh` virou balaio. O mecanismo (permissão por chave no banco) está certo e suporta a correção sem refatoração — falta granularidade de papéis (`recrutador`, `lider_td`) e uma tela para o admin compor perfis sem migration.

**Contexto:** Outros achados: (a) faltam `data_nascimento` e `genero` em rh.colaborador — travam os relatórios de aniversariantes e diversidade que ela pediu; (b) fluxo real não desenhado: promoção e transferência com aprovação em cadeia líder→diretoria e ciência automática de DP e T&D ("hoje ocorre de forma aleatória em canais diversos"); (c) ela confirma independentemente que o check-in diário NÃO substitui pesquisa estruturada/eNPS — o custo da decisão de 27/07 de simplificar o clima; (d) risco estratégico: ela pediu à TI para abrir o mesmo canal de solicitações dentro do SULTS — dois "canais únicos" em paralelo, precisa de decisão de fronteira; (e) termo "RCF do cargo/função" a esclarecer com ela (pode ser o nosso CHA com outro nome). Boa parte da lista de módulos dela já existe (ATS completo, alertas 45/90) ou é tela sobre dado existente (organograma).

**Tags:** #arquitetura #regra-negocio #gap #validacao

### [2026-07-29] DECISÕES DO USUÁRIO sobre o feedback da analista

**Decisão:** (1) **Clima em dois módulos separados**: o check-in diário permanece como está e a **pesquisa estruturada** (anual/pulse, eNPS, plano de ação) entra como MÓDULO PRÓPRIO — não substitui nem se mistura ao check-in. Os demais pontos sugeridos pela analista também entram. Critério de execução declarado pelo usuário: **"o ótimo é inimigo do bom — hoje não tem essas coisas; quero implantar algo bom que funcione, não o lindo e perfeito"** → versões simples e funcionais primeiro, sem esperar completude. (2) **Fronteira com o Sults resolvida**: tudo de pessoas SAI do Sults após o sistema estar pronto — o Fast Pessoas absorve o escopo integral, incluindo treinamento/LMS no futuro; não há divisão de temas. (3) **RCF = Responsabilidade Chave da Função** (ver abaixo).

**Motivo:** Direção do usuário. O item (1) reconcilia a simplificação de 27/07 com a lacuna que a analista apontou: em vez de complicar o check-in, cria-se um módulo ao lado. O item (2) elimina o risco de dois "canais únicos" concorrentes.

**Tags:** #canonico #regra-negocio #arquitetura

### [2026-07-29] RCF (Responsabilidade Chave da Função) — o descritivo de cargo da Fast

**Decisão:** O RCF é o documento interno de descritivo de cargo, **preenchido pelo gestor toda vez que uma vaga é aberta**. Estrutura do modelo oficial (`referencias/rcf-modelo-descritivo-de-cargos.md`): Cargo · Setor · Líder Direto · Tipo de contrato · **Responsabilidade Chave da Função (Missão do Cargo)** · **Atividades a desempenhar** · **CHA em três colunas** (Conhecimentos = perfil técnico; Habilidades = experiências necessárias; Atitudes = comportamentos) · Observações importantes. **O CHA é uma PARTE do RCF**, não o todo — nosso `cargo_versao` tem hoje descrição + CHA, ou seja, cobre parte do documento.

**Motivo:** Esclarecimento do usuário sobre o termo que a analista usou. Muda o desenho de cargos: o RCF é a peça que liga cargo → requisição de vaga → pilar CHA da avaliação 360 (40% do modelo) → ficha do colaborador (a analista pediu "RCF do cargo/função" na ficha).

**Contexto a implementar:** estender `cargo_versao` com missão, atividades, setor, cargo do líder direto, tipo de contrato previsto e observações; exigir RCF vigente (ou revisão dele) na abertura de requisição de vaga; exibir o RCF na ficha do colaborador e como base dos indicadores do pilar CHA.

**Tags:** #canonico #modelo-de-dados #regra-negocio

### [2026-07-30] DECISÃO DO USUÁRIO — Registro, lotação e centro de custo são TRÊS campos independentes

**Decisão:** A alocação de uma pessoa deixa de ser um par (unidade + centro de custo grudado) e passa a ter três dimensões ortogonais: **Registro** = em qual empresa do grupo (CNPJ) ela está registrada; **Lotação** = o local físico onde trabalha; **Centro de custo** = onde o custo dela cai. Alguém pode estar registrada no CNPJ do CSC, lotada na Matriz Centro e com custo no CC de TI.

**Motivo:** A diretora não encontrou o centro de custo na ficha — ele existe desde a migration 0002, mas aparece como sufixo da unidade (`Matriz Centro · CC CC-1000`), sem rótulo próprio, mostrando código sem nome e sem ser filtrável. Ao destrinchar, o usuário separou os três conceitos que o modelo atual conflacionava. O grupo tem 4 CNPJs (indústria, varejo, franquia, CSC) e a pessoa pode migrar entre eles sem perder histórico.

**Contexto:** Absorve o que era a Onda I (os 4 CNPJs) e a promove da 4ª para a 3ª posição do plano (docs/10-plano-pos-reuniao-diretoria.md), porque conferência de folha, ficha e relatórios dependem dessa estrutura — construir as telas antes significaria refazê-las. Implica: entidade empresa do grupo; cadastro de centro de custo com código E nome (hoje é texto livre) vinculado à empresa; os três campos versionados com vigência; filtros pelas três dimensões; transferência entre empresas preservando a pessoa e o histórico. **Pendente:** existe lista oficial de centros de custo no SAP/DW para espelhar? E o termo de tela: o usuário escreveu "locação", o padrão de RH é "lotação".

**Tags:** #canonico #modelo-de-dados #arquitetura

### [2026-07-30] DECISÃO DO USUÁRIO — Centros de custo administráveis; o termo de tela é "lotação"

**Decisão:** (1) Existe lista oficial de centros de custo, mas **nada de chumbar no código**: o cadastro é do usuário, que **adiciona, renomeia e remove livremente** — mesmo princípio já aplicado às metas de indicadores. A lista oficial serve de carga inicial; a manutenção é do RH/DP. (2) O rótulo em tela é **"lotação"** (não "locação").

**Motivo:** Resposta do usuário às duas perguntas em aberto da decisão anterior. Coerente com a diretriz do projeto de que parâmetro operacional é dado, não código.

**Contexto:** Derivações que preservam o princípio de histórico imutável: **renomear** um CC não reescreve o passado (nome versionado com vigência — folha fechada de junho continua exibindo o nome de junho); **remover** CC já usado = inativar, não apagar (some das listas de escolha, continua legível no histórico); apagar de fato só enquanto nunca foi usado. Mesmo tratamento dado ao catálogo de indicadores.

**Tags:** #canonico #regra-negocio #modelo-de-dados

### [2026-07-24] Fase atual: desenho de arquitetura, sem código

**Decisão:** O projeto começa pela avaliação das fontes de conhecimento e pelo desenho de arquitetura e funcionalidades. Nenhum código será escrito até autorização expressa do usuário.

**Motivo:** Pedido explícito do usuário ("não quero codar nada ainda") e método validado no projeto anterior (protótipo → validação → código só com autorização).

**Contexto:** Fontes de partida: `Fast-RH - Conhecimento a Migrar.md` (lições do Fast-Agente) e `Ficha-Conhecimento-Portal-para-RH.md` (conhecimento do Portal de Vendas + discovery da 360 da btime).

**Tags:** #arquitetura #regra-negocio
