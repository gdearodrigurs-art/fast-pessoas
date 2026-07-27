# Avaliação das fontes de conhecimento

> Gerado em 2026-07-24 por análise multi-agente sobre as fontes
> "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md".
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

## 1. Convergências e conflitos entre as fontes

As duas fontes convergem com alta confiança nos fundamentos de integridade e segurança — PostgreSQL como fonte única com transações, escrita append-only com auditoria imutável, backend dono único da lógica com controle de acesso validado em toda chamada, LGPD/privacidade por design, histórico do funcionário como espinha dorsal e os 9 Valores Fast como régua cultural — o que os torna decisões fechadas para a arquitetura. Os conflitos relevantes estão em cinco eixos: (1) stack de backend (Node/Next.js API no Fast-RH §1.2/§4.4 vs FastAPI/Python+asyncpg no Portal §2); (2) plataforma (app novo standalone assumido pelo Fast-RH vs decisão explícita módulo-no-portal × app-com-SSO do Portal §1); (3) folha e ponto, onde o Fast-RH §4.1 lista cálculo/eSocial/marcação como "construir" e o Portal §9 recomenda fortemente integrar Nasajon por risco regulatório (CLT, eSocial, Portaria 671); (4) papel do DW SAP, que o Fast-RH §1.5 propõe para folha/custos e o Portal §4 desmente ("dado de RH não está nesse DW"); (5) escopo da 360, onde o modelo do Fast-RH (9 valores como base) é subsumido pelo modelo btime (3 pilares, valores = só 30% Fit Cultural). A resolução recomendada: herdar a plataforma do portal (RBAC/RLS/auditoria/design system) e portar do Fast-Agente apenas o modelo de dados de pessoas e as lições de integridade; integrar folha e provavelmente ponto via Nasajon em vez de construir; usar o TO-BE da btime como spec funcional da 360 re-skinada no padrão do portal; e rebaixar o DW SAP a enriquecimento analítico read-only.

### CONVERGÊNCIA — PostgreSQL relacional como fonte única, com transações

**Impacto:** alto

Fast-RH §1.2/§2.1/§4.2 ('comece com banco relacional de verdade, sem exceção', após perda de dados 4x com Gist) e Portal §2 (PostgreSQL com RLS por transação, 113+ migrations SQL numeradas) apontam o mesmo padrão. Repetido nas duas fontes de forma independente = decisão fechada.

**Recomendação:** Adotar PostgreSQL como única fonte de verdade desde o dia 1, com migrations SQL versionadas (moldar no padrão docs/banco/ do portal) e backup automático (exigência explícita do Fast-RH §3). Nenhum dado de RH fora do banco.

### CONVERGÊNCIA — Escrita append-only + auditoria imutável

**Impacto:** alto

Fast-RH §2.2 (causa-raiz das perdas foi sobrescrever coleção; trilha de auditoria 'obrigatória, não opcional' em folha/ponto) converge com Portal §6.1 (schema audit só-INSERT sem GRANT de UPDATE/DELETE, diff campo a campo com rótulo resolvido, UTC + exibição America/Sao_Paulo) e §9 ('imutabilidade e auditoria são obrigatórias').

**Recomendação:** Herdar o schema audit do portal como fundação (imutabilidade garantida por GRANT no banco, não por disciplina de código). Aplicar a todo evento de RH: ajuste de ponto, fechamento de folha, nota de avaliação, ocorrência. Barato agora, caríssimo de retrofitar (Portal §10.5).

### CONVERGÊNCIA — Backend dono único da lógica e do acesso

**Impacto:** alto

Fast-RH §1.2/§2.3 ('a API é a dona única da lógica; a camada de cima nunca decide acesso'; lógica duplicada em 4 lugares divergia) converge com Portal §2 (4 camadas rotas→servico→repositorio→esquemas, prepared statements obrigatórios) e §6.3/§6.4 (permissão como dependency na rota; dado sensível nunca sai do backend para o front).

**Recomendação:** Cálculo e autorização exclusivamente no backend, em camada de serviço testada. IA (agente de DP) e front nunca calculam nem filtram dado sensível — padrão 'IA conversa, backend guarda e calcula' (Fast-RH §4.3) é compatível com a arquitetura do portal.

### CONVERGÊNCIA — Acesso por papel com visão mínima (RBAC)

**Impacto:** alto

Fast-RH §1.3 (funcionario/gestor/rh/dp/admin, 'cada pessoa vê só o que é dela') é exatamente o modelo que o Portal §3 já resolve no banco (8 cargos na migration 72, sistema.tem_permissao, RLS por transação com SET LOCAL app.usuario_id/organizacao_id). O portal chama isso de 'ativo mais valioso a herdar'.

**Recomendação:** Não redesenhar RBAC: herdar o mecanismo do portal e acrescentar as chaves de RH (folha.fechar, ponto.ajustar, avaliacao.configurar, rh.auditar — Portal §6.3). Os papéis do Fast-RH viram cargos/perfis dentro do RBAC existente.

### CONVERGÊNCIA — Histórico do funcionário como espinha dorsal

**Impacto:** alto

Fast-RH §1.1 (ficha + ocorrências datadas + feedback formal + ações abertas como 'histórico factual que alimenta 360 e histórico') converge com Portal §9/§10.2 ('espinha que amarra tudo; modelar a linha do tempo do colaborador cedo, porque todo módulo pendura nela').

**Recomendação:** Modelar o histórico/linha do tempo do colaborador como primeiro artefato de dados do projeto. Portar o modelo (não o código) de colaboradores/ocorrencias/feedback_formal/acoes_abertas do schema.sql do Fast-Agente como núcleo desse domínio.

### CONVERGÊNCIA — 9 Valores Fast como régua cultural da avaliação

**Impacto:** medio

Fast-RH §1.1 (9 valores com descritores por nível em fast_kb_valores_fast.md, escala 1–5) e Portal §5 (pilar Fit Cultural = 9 valores, escala 1–5) coincidem no framework e na escala. O ativo de conteúdo (descritores) só existe no Fast-Agente.

**Recomendação:** Migrar fast_kb_valores_fast.md tal e qual como conteúdo do pilar Fit Cultural (30%) do modelo btime. É o único ponto onde o Fast-Agente tem conteúdo pronto que a spec da btime pressupõe mas não fornece.

### CONVERGÊNCIA — LGPD e privacidade por design

**Impacto:** alto

Fast-RH §4.2.3 (acesso mínimo por papel + trilha; dado de funcionário é sensível) converge com Portal §5 (Card do Colaborador nasce privado; advertências/licenças/notas brutas estruturalmente fora do compartilhável) e §9 (saúde, biometria, salário = LGPD pesada; anonimato de clima com desenho de dado separado).

**Recomendação:** Tratar LGPD como requisito estrutural: minimização no schema (o que não pode vazar não entra no payload), trilha de acesso a dado sensível, e clima com modelo de dados anônimo separado do resto do RH desde o início (Portal §9 — o Fast-RH §4.1 também lista anonimato como requisito novo).

### CONFLITO — Stack de backend: Node/Next.js API vs FastAPI/Python

**Impacto:** alto

Fast-RH §1.2/§4.4 fixa 'API (Node/Next.js)' e afirma que 'o time domina esse stack'. Portal §2 tem backend FastAPI + Python 3.12 + asyncpg + Redis, onde já vivem os ativos que as duas fontes mandam herdar: RLS por transação, RBAC no banco, schema audit, versionamento de regra (domínio imposto), JWT/2FA. Conflito direto e estruturante.

**Recomendação:** A decisão de stack decorre da decisão de plataforma, não o contrário. Se o RH herda a plataforma do portal (recomendado), o backend é FastAPI/Python — reimplementar RLS+RBAC+audit+versionamento em Node para 'aproveitar domínio do time' custa mais e reintroduz risco que o próprio Fast-RH proíbe (lógica duplicada, §2.3). O front permanece Next.js+TypeScript nas duas hipóteses, preservando a maior parte do domínio do time. Validar honestamente a proficiência dos 3 devs em Python antes de fechar; se for zero, o custo de aprender FastAPI ainda é menor que o de reconstruir a plataforma.

### CONFLITO — Plataforma: app novo standalone vs módulo do portal vs app separado com SSO

**Impacto:** alto

Fast-RH §1.2 assume app novo desde o dia 1 (PostgreSQL SaveinCloud, molde do backend/ do Fast-Agente) e nem menciona o portal. Portal §1 coloca a escolha explícita (módulo no portal × app separado com SSO/RBAC do portal) como 'a primeira decisão estratégica' e registra que a btime, indo por app separado com stack própria, gerou divergência visual (§5). As fontes partem de premissas incompatíveis.

**Recomendação:** Descartar a premissa do Fast-RH de app 100% novo: o custo de reconstruir identidade/RBAC/RLS/auditoria/multiunidade/design system é alto demais para 3 devs. Recomendação: módulo de RH dentro da plataforma do portal (mesmo monorepo, mesmos padrões §2/§6), com isolamento lógico forte do dado sensível (schema de banco próprio de RH + RLS + permissões dedicadas). App separado com SSO só se surgir requisito duro de isolamento de deploy/compliance — e, nesse caso, obrigatoriamente na mesma stack e design system, para não repetir o erro da btime.

### CONFLITO — Folha: construir cálculo vs integrar Nasajon

**Impacto:** alto

Fast-RH §4.1 lista 'proventos/descontos, rubricas, cálculo, eSocial' como 'Novo (construir)'. Portal §9 contradiz frontalmente: 'folha provavelmente se integra (Nasajon), não se reimplementa — avaliar antes de qualquer linha de código', citando CLT, eSocial, convenções coletivas, 13º, férias, rescisão e passivo trabalhista; §4 registra a Nasajon como sistema de folha/DP já em uso e fonte de faltas/atrasos/licenças/advertências no discovery da btime.

**Recomendação:** Prevalece o Portal: motor de cálculo de folha e transmissão eSocial ficam na Nasajon. Os módulos 'controle de folha' e 'fechamento de folha' do novo sistema viram orquestração e conferência: calendário de fechamento com workflow de aprovação, importação/conciliação de resultados da Nasajon, portal de contracheque, trilha de auditoria do fechamento e versionamento de regra (§6.2) sobre o que for parametrização própria. Primeiro passo obrigatório: mapear a API da Nasajon (Portal §10.3) — a tabela do Fast-RH §4.1 deve ser corrigida.

### CONFLITO — Ponto: marcação própria vs integração (Portaria 671)

**Impacto:** alto

Fast-RH §4.1 lista ponto inteiro como novo a construir ('marcação, jornada, banco de horas, geolocalização'), sem mencionar regulação. Portal §9 enquadra ponto na mesma alta complexidade regulatória da folha (Portaria MTP 671/2021, registro REP, tratamento de marcações) e aponta a Nasajon como candidata a fonte de verdade. O Fast-RH subestima o problema; a geolocalização ainda envolve biometria/dado sensível (Portal §9, LGPD).

**Recomendação:** Decidir integrar × construir ANTES do desenho do módulo (Portal §10.3): verificar se a Nasajon (ou REP-P homologado de mercado) cobre marcação. Se construir marcação própria, o sistema precisa nascer aderente à Portaria 671 (REP-P, arquivos AEJ/AFD, comprovante ao trabalhador) — escopo que muda prazo e risco. O que sempre fica no sistema novo: espelho de ponto, workflow de ajuste/aprovação com auditoria (§6.1) e alertas via n8n.

### CONTRADIÇÃO — Papel do DW SAP (SAP_MIRROR) para folha

**Impacto:** medio

Fast-RH §1.5 afirma que o DW SAP é 'relevante para folha/financeiro (integração de custos, centros de custo)'. Portal §4 enfraquece diretamente: 'dado de RH não está nesse DW — ele é de vendas/financeiro; útil no máximo para cruzar desempenho comercial × avaliação'. A fonte mais recente e mais próxima do dado (portal, corte 20/07/2026) desmente a expectativa do Fast-RH.

**Recomendação:** Rebaixar o DW SAP a enriquecimento analítico read-only: cruzar resultado comercial × avaliação de desempenho (pilar Dever) e, no máximo, validar se centros de custo existem lá antes de assumir qualquer uso em folha. Não colocar o DW no caminho crítico de nenhum módulo de RH.

### CONTRADIÇÃO — Modelo da 360: 9 valores como base vs 3 pilares da btime

**Impacto:** alto

Fast-RH §1.1/§4.1 trata os 9 Valores como 'a base da avaliação 360', faltando construir fluxo/pesos/ciclos. Portal §5 mostra um modelo funcional muito mais completo e já especificado (btime): 3 pilares com pesos (Dever 30% / CHA 40% / Fit Cultural 30%), faixas com flags e decisão humana justificada, rollout faseado por feature flag, ciclos de Experiência (45/90d) e Desempenho (semestral), regra 100% administrável pelo RH com vigência. Os 9 valores são só 30% do modelo — a visão do Fast-RH é subconjunto, não base.

**Recomendação:** Adotar o TO-BE da btime como especificação funcional da 360 (pedir formalmente o TO-BE e o código — Portal §10.4) e encaixar o ativo do Fast-Agente (descritores dos 9 valores) como conteúdo do pilar Fit Cultural. Seguir a recomendação já registrada no Portal §5: a spec/discovery é o ativo de valor; o HTML da btime se refaz rápido no design system do portal (§8) — reaproveitar spec, refazer interface.

### CONFLITO PARCIAL — Ciclo de feedback 90d vs ciclos de avaliação da btime

**Impacto:** medio

Fast-RH §1.1 traz a regra de feedback formal a cada 90 dias com alerta de atraso. Portal §5 traz ciclos formais distintos: Experiência (45/90 dias) e Desempenho (semestral desde a admissão). Sobrepõem-se no marco de 90 dias mas são processos diferentes (feedback contínuo gestor→liderado vs ciclo avaliativo estruturado) — risco de fundir os dois e perder um deles.

**Recomendação:** Manter como dois processos separados e parametrizáveis: (a) feedback formal contínuo com cadência-alvo de 90d e alerta (herdado do Fast-Agente, vira trilha no histórico); (b) ciclos de avaliação da btime (Experiência 45/90d + Desempenho semestral). O feedback alimenta a avaliação, mas não a substitui — e a periodicidade de ambos deve ser dado administrável pelo RH (princípio do Portal §5).

### CONFLITO — Identidade: 'colaboradores' do Fast-Agente vs 'usuarios' do portal

**Impacto:** medio

Fast-RH §1.1 manda reaproveitar o schema colaboradores (com papel, status, data de entrada) e §1.3 propõe criar papéis próprios (funcionario/gestor/rh/dp/admin). Portal §3 já tem usuarios + RBAC de 8 cargos + perfil/avatar + multiunidade em produção. Importar o schema do Fast-Agente ao pé da letra criaria cadastro de pessoas e modelo de papéis paralelos — exatamente a duplicação que ambas as fontes condenam.

**Recomendação:** Identidade, autenticação, cargo/permissão e unidade vêm do portal (fonte única). A 'ficha do colaborador' do Fast-Agente entra como entidade do domínio RH referenciando o usuário do portal (1:1), carregando só o que é específico de RH: retrato, contexto histórico, ocorrências, feedback, ações abertas. Os papéis do Fast-RH §1.3 são absorvidos pelas chaves de permissão do RBAC existente, não recriados.

### CONVERGÊNCIA — Versionamento de regra com vigência (só o portal detalha, o Fast-RH exige o efeito)

**Impacto:** alto

Portal §6.2 especifica o padrão (versão com vigência/responsável/status, sem recálculo retroativo, molde no domínio imposto — migrations 53/84/91). Fast-RH não o descreve, mas o exige implicitamente: §2.3 (cálculo sensível num único lugar testado) e §4.2 (dados com efeito legal/financeiro). Compatíveis, com o portal fornecendo a implementação de referência.

**Recomendação:** Aplicar versionamento com vigência a toda regra parametrizável de RH: pesos e faixas da 360 (a btime já exige — 'mudança vale só para ciclos abertos depois dela'), regras de jornada/banco de horas e parâmetros de fechamento. Fechamento de um mês nunca muda quando a regra muda depois.

### ENFRAQUECIMENTO — Sults como fonte automática de treinamento

**Impacto:** baixo

O histórico de treinamento (relevante para o histórico do funcionário e para o pilar CHA da 360) depende do Sults, mas o Portal §4 registra ressalva do discovery: não havia API do módulo universidade — links eram inseridos manualmente. Nenhum plano que assuma integração automática com Sults se sustenta hoje. O Fast-RH não trata do tema.

**Recomendação:** Tratar treinamento como registro manual/importação no MVP do histórico do funcionário e abrir verificação formal com o fornecedor sobre API do módulo universidade antes de prometer integração. Não bloquear a 360 nem o histórico por causa disso.

### ENFRAQUECIMENTO — 'Arquitetura que já validamos' do Fast-Agente como fundação

**Impacto:** medio

Fast-RH §1.2 apresenta sua arquitetura-alvo como validada para uso 'desde o dia 1'. A validação, porém, ocorreu num contexto pequeno (evolução de um sistema Gist-based, API Node de referência), enquanto o Portal §2/§6 descreve uma plataforma equivalente já em produção real com 5 unidades, 113+ migrations, RLS, 2FA e auditoria operante. O valor durável do Fast-RH está nas lições negativas (§2: nunca arquivo-como-banco, append-only, lógica única) — que o portal já implementa — e no modelo de pessoas, não na proposta de infraestrutura.

**Recomendação:** Usar o Fast-RH como fonte de requisitos e de modelo de domínio (pessoas, valores, ocorrências, demandas, princípios §4.2) e o portal como fonte de arquitetura e implementação (stack, RBAC/RLS, audit, versionamento, design system, método protótipo-primeiro do §7). Essa divisão de papéis entre as fontes resolve a maioria dos conflitos restantes.

### CONVERGÊNCIA — Módulo de demandas/workflow reaproveitável

**Impacto:** medio

Fast-RH §1.4 tem o modelo de demandas pessoa→pessoa (solicitante→executor, status, prazo, prioridade) pronto e o mapeia para RH (documentos, aprovações de férias/ponto, pendências DP→funcionário). O Portal não contradiz e fornece os complementos: n8n para notificações (§4) e auditoria para cada transição (§6.1). O §4.1 do Fast-RH reconhece que aprovações/workflow ainda precisam ser construídos por cima.

**Recomendação:** Portar o modelo de demandas como base do workflow de DP (solicitações e aprovações), estendendo-o com etapas de aprovação e disparo de notificações via n8n. É o candidato natural a primeiro módulo transacional do RH por ser de baixo risco regulatório.

## 2. Lacunas de escopo (o que as fontes não cobrem)

As duas fontes cobrem bem a fundação técnica (PostgreSQL, RBAC/RLS, auditoria append-only, versionamento de regra com vigência) e os módulos pedidos (360, ponto, clima, folha via integração Nasajon, histórico), mas deixam de fora quase todo o ciclo de vida formal do vínculo empregatício brasileiro: não há desenho para recrutamento, admissão digital, férias, 13º, rescisão, benefícios, SST/eSocial de segurança, afastamentos, cargos e salários, organograma, escalas, vínculos não-CLT, documentos com ciência digital e calendário de obrigações. As lacunas mais críticas são as que outros módulos já pedidos dependem estruturalmente — organograma/hierarquia gestor-liderado (sem o qual a 360 e o RBAC "gestor vê equipe" não funcionam), cargos com CHA (insumo direto do pilar de 40% da 360), escalas/jornadas (pré-requisito do ponto em empresa de comércio com 5 unidades) e afastamentos (sem eles o ponto acusa falta indevida) — e as que carregam prazo legal com multa (férias vencidas, rescisão art. 477, eventos eSocial/SST). Recomenda-se organizar em: Fase 1 (fundação) = ficha/histórico + cargos e salários + organograma/hierarquia + tipos de vínculo no modelo de dados; Fase 2 (operação DP) = escalas+ponto, afastamentos, férias, admissão e rescisão como workflows, documentos com ciência digital, 360 e clima; Fase 3 (expansão) = benefícios completo, SST/EPI, painel de obrigações eSocial, R&S, mural, people analytics. Cálculos legais (folha, rescisão, 13º, encargos) e transmissão de eventos eSocial permanecem no Nasajon via integração — o sistema orquestra workflows, guarda o histórico e monitora prazos, nunca recalcula.

### Organograma e hierarquia gestor-liderado

**Impacto:** alto

Nenhuma fonte modela a relação gestor→liderado, posições, headcount aprovado × ocupado e centros de custo. O portal tem multiunidade e RBAC, mas o conceito de 'equipe de um gestor' não existe estruturado — e a 360 Fase 1 (líder→liderado, btime) e a regra de acesso 'gestor vê a equipe' dependem exatamente dessa relação.

**Recomendação:** Escopo Fase 1 (fundação): relação gestor-liderado com vigência (histórico de quem respondia a quem, usando o padrão de versionamento §6.2 do portal) + vínculo do colaborador a unidade e centro de custo. Visualização gráfica de organograma e controle de quadro/vagas ficam para a Fase 3.

### Cargos e salários (tabela salarial, descrição de cargo, promoções, mérito)

**Impacto:** alto

As fontes citam 'cargos/salário' apenas como item do histórico. Falta o cadastro estruturado: descrição de cargo com CHA (que é o pilar de 40% da avaliação 360 da btime — sem cargo estruturado a 360 não parametriza), tabela salarial com faixas/steps, enquadramento sindical por unidade, histórico de promoções e reajustes, e risco de equiparação salarial (art. 461 CLT).

**Recomendação:** Escopo Fase 1 (fundação): cadastro de cargos com descrição e CHA + histórico de posição/salário por vigência pendurado na ficha do funcionário. Ciclo formal de mérito/promoções com workflow de aprovação fica para a Fase 3. Tabela salarial usa o padrão de versionamento de regra com vigência já validado no domínio imposto do portal.

### Escalas, turnos e jornadas

**Impacto:** alto

O ponto é módulo pedido, mas nenhuma fonte trata do pré-requisito dele: cadastro de jornadas (5x2, 6x1, 12x36), escalas de revezamento, DSR, trabalho em domingos/feriados (a Fast é comércio com 5 unidades — loja abre sábado e domingo), intervalos intra/interjornada e feriados municipais por unidade. Sem jornada esperada, o ponto não sabe o que é hora extra, atraso ou falta.

**Recomendação:** Escopo Fase 2, obrigatoriamente antes ou junto do módulo de ponto: cadastro versionado de jornadas e escalas por colaborador/unidade, calendário de feriados por município. Levantar as convenções coletivas do comércio de cada unidade antes de modelar. Banco de horas e compensação entram aqui, alinhados com o que o Nasajon calcula.

### Afastamentos e licenças

**Impacto:** alto

Ausente das fontes (Nasajon aparece só como 'fonte de licenças' para a 360). Falta o processo: registro de atestados, afastamento INSS após 15 dias, licença maternidade/paternidade, efeitos colaterais em ponto (sem afastamento registrado o ponto acusa falta indevida), férias (suspensão afeta período aquisitivo), estabilidade provisória e evento eSocial S-2230. Atestado é dado de saúde — categoria mais sensível da LGPD.

**Recomendação:** Escopo Fase 2, junto com o ponto: registro de afastamento na linha do tempo do funcionário com tipo, período e documento (atestado com acesso restrito a DP, fora do que gestor vê — padrão de ocultação §6.4). Envio do S-2230 e reflexo em folha via Nasajon; o sistema alimenta e monitora, não transmite.

### Férias (programação, avisos, abono, coletivas)

**Impacto:** alto

Citadas nas fontes apenas como exemplo de aprovação no módulo de demandas e como item da complexidade CLT. Falta tudo: controle de períodos aquisitivos/concessivos, alerta de férias vencendo (vencida = pagamento em dobro, passivo direto), aviso de 30 dias, fracionamento (até 3 períodos, um ≥14 dias), abono pecuniário, férias coletivas por unidade e conflito de agenda dentro da equipe.

**Recomendação:** Escopo Fase 2: planejamento e aprovação de férias (workflow gestor→DP sobre o módulo de demandas), painel de vencimento de períodos com alertas via n8n, recibo/aviso de férias com ciência digital. Cálculo de valores (terço, abono, médias) permanece no Nasajon.

### Admissão digital e onboarding

**Impacto:** alto

As fontes mandam modelar o histórico do funcionário cedo, mas não desenham a porta de entrada dele: coleta digital de documentos do aprovado, checklist admissional (exame admissional, contrato, uniformes, acessos, EPI), contrato de experiência 45/90 dias com alerta de vencimento (ligado ao ciclo de experiência da 360), e o prazo legal do eSocial S-2200 (transmitido até a véspera do início).

**Recomendação:** Escopo Fase 2: workflow de admissão que cria a ficha do funcionário e dispara o checklist (documentos, exame, acessos, ciência de políticas), com controle de prazo do contrato de experiência amarrado à avaliação de experiência da 360. O S-2200 em si é transmitido pelo Nasajon; o sistema controla o checklist e o prazo.

### Rescisão e offboarding

**Impacto:** alto

Citada só como item da complexidade regulatória. Falta o processo: tipos de desligamento, aviso prévio (trabalhado/indenizado, proporcionalidade), exame demissional, prazo de pagamento de 10 dias (multa art. 477), devolução de EPI/equipamentos, revogação de acessos (inclusive no próprio portal — risco de segurança), entrevista de desligamento (insumo de clima e turnover) e eSocial S-2299.

**Recomendação:** Escopo Fase 2: workflow/checklist de desligamento com contagem regressiva do prazo legal, gatilho automático de revogação de acessos no RBAC do portal, devoluções e entrevista de desligamento estruturada. Cálculo rescisório e S-2299 no Nasajon. Registrar a decisão com justificativa quando divergir da flag da 360 (regra btime já prevista).

### Documentos do funcionário com assinatura/ciência digital (GED)

**Impacto:** alto

As fontes têm a peça 'ciência digital com hash' (btime), mas não o repositório: contratos e aditivos, termos (confidencialidade, equipamento, EPI), advertências, holerites e informes de rendimento, com comprovação de entrega/ciência, validade jurídica (Lei 14.063/MP 2.200-2 para eletrônica; ICP-Brasil quando exigido) e tabela de temporalidade de guarda de documentos trabalhistas.

**Recomendação:** Escopo Fase 2: repositório de documentos pendurado na ficha, com ciência digital com hash para documentos internos (holerite, políticas, advertências) e trilha de acesso no schema audit. Assinatura eletrônica qualificada via integração (Clicksign/gov.br ou similar) só para documentos que exigem validade forte. Holerites importados do Nasajon e publicados aqui.

### Benefícios (VT, VR/VA, plano de saúde, convênios)

**Impacto:** alto

Totalmente ausente das fontes. Envolve: elegibilidade por cargo/unidade, adesão e cancelamento, dependentes (dado pessoal de terceiros — LGPD), desconto de VT (limite 6%), regras PAT do VR/VA, coparticipação do plano de saúde, arquivos de movimentação para operadoras e reflexo de descontos na folha. É uma das maiores fontes de demandas ao DP e de erro de desconto em folha.

**Recomendação:** Escopo Fase 2/3 em dois passos: Fase 2 = cadastro de benefícios, adesões e dependentes na ficha + pedidos via módulo de demandas; Fase 3 = geração de movimentações para operadoras e conciliação. Lançamento dos descontos sempre via integração com o Nasajon, nunca cálculo próprio.

### SST / Saúde ocupacional (ASO, PCMSO, PGR, CAT, eSocial S-2210/S-2220/S-2240)

**Impacto:** alto

Ausente das fontes, e é obrigação legal com multa: ASOs (admissional, periódico, demissional, retorno, mudança de risco) com vencimento, PCMSO e PGR vigentes, CAT em caso de acidente, e os eventos SST do eSocial (S-2210, S-2220, S-2240) obrigatórios para todas as empresas. Ponto cego clássico: esses eventos frequentemente NÃO são enviados pela folha, e sim pela clínica de medicina ocupacional — ninguém monitora.

**Recomendação:** Escopo parcial na Fase 3: controle de vencimento de ASO com convocação de exames (alerta via n8n) e registro de CAT/afastamentos por acidente na linha do tempo. PCMSO/PGR e transmissão dos eventos SST ficam com a clínica/assessoria contratada — mas mapear JÁ na fase de arquitetura quem envia hoje (clínica × Nasajon), porque define a integração.

### Calendário de obrigações eSocial/DCTFWeb/FGTS Digital

**Impacto:** alto

As fontes citam eSocial só como palavra na complexidade da folha. Mesmo integrando com Nasajon, ninguém desenhou quem garante que os eventos saíram no prazo: S-2200 antes da admissão, S-2299 na rescisão, folha mensal (S-1200/S-1210), DCTFWeb, FGTS Digital (dia 20), eventos SST. Multas são automáticas e o risco típico é 'a folha é da Nasajon' virar 'ninguém confere o retorno'.

**Recomendação:** Não reimplementar eSocial em hipótese alguma. Escopo Fase 3: painel de obrigações e prazos (agenda de compliance de DP) com status por competência e alertas via n8n, alimentado por integração com o Nasajon se houver API de status, ou por confirmação manual do DP. Já na Fase 1, incluir o mapeamento da API Nasajon como tarefa de arquitetura.

### Vínculos não-CLT: estagiários, aprendizes, PJ, temporários e cota PCD

**Impacto:** alto

As fontes assumem implicitamente colaborador = empregado CLT. Faltam: estágio (Lei 11.788 — TCE, supervisor, recesso, limite de 2 anos), aprendiz (cota legal, contrato determinado, frequência escolar), PJ/terceiros (contrato, risco de reconhecimento de vínculo) e cota PCD (fiscalização). Se o modelo de dados nascer só-CLT, retrofitar tipo de vínculo depois é caro — atinge ponto, folha, 360 e relatórios.

**Recomendação:** Fase 1 (fundação) no modelo de dados: campo tipo de vínculo na ficha desde o primeiro dia, com regras por tipo (estagiário não faz hora extra, PJ não entra em folha CLT, aprendiz tem jornada reduzida). Funcionalidades específicas (controle de TCE e vencimentos, painéis de cota aprendiz/PCD) na Fase 3.

### Fechamento de folha como esteira de conferência (não de cálculo)

**Impacto:** alto

O usuário pediu 'controle e fechamento de folha' e as fontes respondem 'integre com Nasajon' — mas ninguém desenhou o que o fechamento vira nesse cenário: consolidação das variáveis do mês (ponto, faltas, afastamentos, benefícios, comissões do DW), envio ao Nasajon, conferência da prévia, aprovação formal com trilha, e publicação de holerites. Esse workflow é o coração do DP mensal e está sem dono no desenho.

**Recomendação:** Escopo Fase 2/3: esteira mensal com etapas (coleta de variáveis → envio → prévia → conferência com apontamento de divergências → aprovação com auditoria → publicação de holerites com ciência). Depende do mapeamento da API Nasajon (importação/exportação de variáveis); se não houver API, desenhar em torno de arquivos de importação — decidir antes de prototipar.

### Recrutamento e seleção (R&S)

**Impacto:** medio

Ausente das fontes: requisição de vaga com aprovação, divulgação, pipeline de candidatos, banco de talentos e LGPD de candidato (dado pessoal de não-funcionário, com retenção e consentimento próprios). Sem R&S, o histórico do funcionário começa apenas na admissão e a requisição de vaga fica fora do controle de headcount.

**Recomendação:** Fora do MVP. Fase 3 apenas a requisição de vaga (workflow de aprovação amarrado ao headcount) e o registro do candidato aprovado que alimenta a admissão digital. Pipeline completo de seleção preferencialmente via ATS de mercado (Gupy, Solides etc.) com integração leve, se o volume justificar.

### 13º salário e provisões

**Impacto:** medio

Citado só como item da complexidade CLT. Faltam os marcos operacionais: 1ª parcela até 30/11 (ou adiantamento nas férias, a pedido), 2ª até 20/12, e a visão de provisão (13º, férias + 1/3, encargos) no custo de pessoal — sem isso a diretoria só enxerga o custo cheio em novembro/dezembro.

**Recomendação:** Fora do cálculo (Nasajon calcula e paga). Entra na Fase 3 de duas formas: marcos no calendário de obrigações (item eSocial/prazos) e provisões mensais no relatório de custo de pessoal, importadas do Nasajon ou estimadas.

### Controle de EPI

**Impacto:** medio

Ausente das fontes: catálogo de EPIs com CA (certificado de aprovação) e validade, registro de entrega com termo assinado (defesa essencial em reclamatória trabalhista), trocas periódicas e vínculo com o evento S-2240 (condições ambientais). Relevância depende do perfil de risco das unidades (CD/estoque mais que loja).

**Recomendação:** Fase 3, versão simples: catálogo + registro de entrega/troca com ciência digital (reusa o padrão de hash) pendurado na ficha. Dados alimentam o bloco de SST. Antes, levantar com o DP quais funções da Fast exigem EPI de fato.

### Treinamento e desenvolvimento / PDI (integração Sults)

**Impacto:** medio

Parcialmente coberto: as fontes citam o Sults como fonte de trilhas e o PDI na Fase 2 da 360, mas registram que o módulo universidade do Sults NÃO tinha API (links inseridos manualmente). O histórico de treinamento — que compõe a espinha dorsal do funcionário e alimenta desenvolvimento na 360 — fica sem caminho técnico definido. Treinamentos obrigatórios (NRs) também não são tratados.

**Recomendação:** Fase 2 junto com a 360: revalidar se o Sults ganhou API; se sim, integrar leitura de trilhas/conclusões; se não, registro manual de treinamentos na ficha (data, carga horária, certificado anexo). Controle de treinamento obrigatório por função (NRs) na Fase 3, ligado a SST.

### Comunicação interna / mural

**Impacto:** baixo

Ausente das fontes: mural de avisos, comunicados com confirmação de ciência (mudança de política, convenção coletiva), enquetes rápidas. Não bloqueia nenhum processo legal, e notificações operacionais já têm canal (n8n).

**Recomendação:** Fase 3 ou fora do escopo. Se entrar, versão mínima: mural no portal + comunicado com ciência digital reaproveitando o padrão de hash — o que cria valor jurídico (prova de ciência de políticas) com custo baixo. Enquetes anônimas ficam no módulo de clima, não aqui.

### Informe de rendimentos (ex-DIRF)

**Impacto:** baixo

Ausente das fontes, mas de baixo esforço: a DIRF foi extinta (substituída por eSocial + EFD-Reinf a partir do ano-calendário 2024), porém o informe de rendimentos anual ao funcionário continua obrigatório e é gerado pela folha (Nasajon).

**Recomendação:** Fora de qualquer cálculo. Apenas publicar o informe anual gerado pelo Nasajon no repositório de documentos do funcionário (item GED) com registro de ciência/download. Sem fase própria — pega carona na Fase 2 do GED.

### Relatórios gerenciais / people analytics

**Impacto:** medio

As fontes têm padrões de gráfico e o DW de vendas, mas nenhum desenho dos indicadores de RH: turnover (geral e por gestor/unidade), absenteísmo, horas extras, custo de pessoal por centro de custo, headcount, painel de vencimentos (férias, ASO, experiência) e cruzamentos como desempenho comercial (DW SAP) × avaliação 360. É o principal retorno visível do sistema para a diretoria.

**Recomendação:** Transversal: exigência de arquitetura na Fase 1 (todo módulo nasce emitindo os eventos/datas de que os indicadores precisam — desligamentos com motivo, faltas classificadas, custo por rubrica), dashboard consolidado na Fase 3. Cuidado LGPD nos cruzamentos individuais (desempenho × saúde/afastamento é vedado).

### Governança LGPD operacional (direitos do titular, retenção, ROPA)

**Impacto:** medio

As fontes tratam LGPD por design no dado (privacidade estrutural, minimização), mas não os processos: atendimento a direitos do titular (acesso, correção, portabilidade), política de retenção/expurgo (dados trabalhistas guardam 5-30 anos conforme o tipo; dados de candidato bem menos), registro de operações (ROPA) e o conflito imutabilidade do audit × direito de eliminação.

**Recomendação:** Fase 1 como decisão de arquitetura (tabela de temporalidade por categoria de dado definida junto com o modelo; anonimato do clima com desenho de dado separado, como a fonte já alerta) e Fase 3 como funcionalidade (fila de solicitações de titular via módulo de demandas, relatório de acessos a dado sensível a partir do schema audit).

## 3. Decisões críticas a fechar antes de qualquer código

Com base nos dois documentos-fonte (C:/sistema RH/Fast-RH - Conhecimento a Migrar.md e C:/sistema RH/Ficha-Conhecimento-Portal-para-RH.md), há sete decisões de arquitetura que precisam ser fechadas antes de qualquer código, e a linha mestra que emerge delas é: herdar a plataforma do portal (identidade, RBAC no banco, RLS por transação, auditoria append-only, versionamento de regra com vigência, design system) em vez de reconstruí-la; integrar em vez de construir onde há regulação pesada (folha via Nasajon, ponto via REP-P homologado de mercado — nunca desenvolver REP próprio sob a Portaria 671); isolar o dado sensível de RH em banco próprio; garantir anonimato de clima por desenho de dados, não por política; e reaproveitar a spec da btime para a 360 descartando o mockup visual. Os riscos transversais que atravessam todas as decisões são LGPD (RH concentra dado sensível: saúde, biometria, salário, avaliações), auditoria/imutabilidade (fechamento de folha e ajuste de ponto exigem trilha e regra versionada sem recálculo retroativo) e passivo trabalhista (erro em folha/ponto custa dinheiro e processo). Antes do código, restam duas descobertas obrigatórias: mapear o que a API do Nasajon realmente expõe e obter da btime o TO-BE e o código da 360.

### 1. Plataforma: módulo no portal vs app separado com SSO/RBAC vs app independente

**Impacto:** alto

Três opções: (a) módulo dentro do monorepo do portal de vendas — herda tudo de graça, mas acopla o ciclo de deploy do RH ao comercial e coloca dado sensível de RH no mesmo app/banco de vendas; (b) app separado que reusa identidade/RBAC/RLS do portal via SSO — isolamento de dados e de release mantendo login único e os mesmos padrões; (c) app totalmente independente — duplica identidade, usuários, RBAC e tema (foi o caminho da btime na 360 e gerou divergência visual e de stack). A Ficha do Portal aponta essa como a primeira decisão estratégica: 'a escolha define o resto'.

**Recomendação:** App separado (repositório e deploy próprios) que herda a base de identidade/RBAC do portal via SSO e replica os mesmos padrões técnicos (4 camadas de domínio, RLS por transação, schema audit, tokens do design system, pt-BR nos domínios). Motivo: RH tem sensibilidade LGPD e ciclo de vida diferentes do portal comercial, e o blast radius de um incidente precisa ser contido; ao mesmo tempo, o SSO/RBAC herdado evita o retrabalho e a fragmentação de identidade. Risco da alternativa (a): qualquer permissão ou vulnerabilidade do portal vira vetor para salário/saúde/avaliação. Risco da alternativa (c): repetir o erro da btime — dois logins, dois RBACs, duas identidades visuais para manter com 3 devs.

### 2. Stack de backend: FastAPI/Python (padrão do portal) vs Node/Next.js API (proposta Fast-RH)

**Impacto:** alto

O arquivo Fast-RH propõe API Node/Next.js + PostgreSQL (SaveinCloud) alegando domínio do time; a Ficha do Portal documenta o padrão consolidado da empresa: FastAPI + Python 3.12 + asyncpg + Redis, com RLS por transação (SET LOCAL app.usuario_id), RBAC por chave no banco (sistema.tem_permissao), schema audit só-INSERT, versionamento de regra com vigência (molde no domínio imposto, migrations 53/84/91) e padrão de domínio em 4 camadas (rotas → serviço → repositório → esquemas, prepared statements obrigatórios). O front é Next.js + TypeScript nas duas propostas — a divergência é só a API.

**Recomendação:** FastAPI/Python no backend, herdando os módulos transversais do portal (nucleo/: banco.py, rbac.py, seguranca.py com JWT httpOnly + 2FA, redis_cliente.py); front em Next.js + TypeScript como ambos os documentos já convergem. Motivo: o ativo mais valioso a herdar é a plataforma (RLS, RBAC, auditoria, versionamento de regra) — reimplementar isso em Node custa muito mais e com mais risco do que o time aprender o padrão Python já pronto e testado; além disso evita a empresa manter dois padrões de backend. Risco da alternativa (Node): reescrever do zero exatamente as peças críticas para RH (RLS, audit imutável, vigência de regra), com bugs novos em código de segurança, e perder o 'molde' de organização do portal. Condição de reversão: só reconsiderar Node se ficar comprovado que nenhum dev conseguirá manter Python — e mesmo assim portando os padrões, não improvisando.

### 3. Folha: integrar Nasajon vs construir cálculo próprio — e o que significa 'fechamento de folha'

**Impacto:** alto

Construir cálculo de folha próprio significa implementar CLT, eSocial, convenções coletivas por categoria, proventos/descontos/encargos, 13º, férias e rescisão — a Ficha do Portal marca isso como alta complexidade regulatória com passivo trabalhista, e o Nasajon já é o sistema de folha/DP da empresa (fonte de faltas, atrasos, licenças e advertências no discovery da btime). Nesse cenário, 'fechamento de folha' muda de significado: se integra, fechamento = orquestração do processo mensal (consolidar variáveis do mês — ponto, faltas, comissões, benefícios, ocorrências —, enviar/conferir com o Nasajon, aprovar com trilha e congelar snapshot imutável do resultado); se constrói, fechamento = executar o cálculo legal completo e transmitir eSocial, responsabilidade que 3 devs não sustentam.

**Recomendação:** Integrar o Nasajon como motor de cálculo e fonte de verdade da folha; o novo sistema é a camada de processo: cockpit de fechamento (checklist por unidade, pendências, conferência de divergências), coleta e envio de variáveis, workflow de aprovação com auditoria, snapshot imutável do resultado fechado ligado à versão de regra vigente, e visão do holerite/histórico para o funcionário. Motivo: erro de cálculo de folha gera passivo trabalhista e multa; manutenção regulatória (eSocial, tabelas, convenções) é um produto em si. Risco da alternativa (construir): anos de manutenção regulatória, responsabilidade legal desproporcional, e atraso de todos os demais módulos. Risco residual da recomendação: dependência do que a API do Nasajon expõe — mapear contrato/endpoints ANTES de desenhar o módulo (descoberta obrigatória pré-código); se a API for insuficiente, o plano B é troca de arquivos/rotina batch, nunca cálculo próprio.

### 4. Ponto: registro próprio (REP-P) vs coletor para o Nasajon vs sistema de ponto de mercado

**Impacto:** alto

Desenvolver registro de ponto próprio enquadra o software como REP-P sob a Portaria MTP 671/2021: exige registro no INPI, atestado técnico de conformidade, geração dos arquivos AFD/AEJ, tratamento de marcações conforme a norma — ou seja, virar fabricante de software regulado. Alternativas: (a) contratar sistema de ponto de mercado já homologado (REP-P/REP-C) que se integra ao Nasajon e expõe API; (b) usar módulo de ponto do próprio Nasajon, se homologado; (c) construir 'coletor' próprio que alimenta o Nasajon — juridicamente ainda é registro de ponto e cai na mesma exigência regulatória.

**Recomendação:** Não desenvolver registro de ponto próprio em nenhuma variante (nem como 'coletor'). Contratar solução de mercado homologada — priorizando a que melhor se integra ao Nasajon — e o novo sistema de RH consome os dados: espelho de ponto, ocorrências (atraso/falta), banco de horas, e hospeda os workflows de valor (solicitação/aprovação de ajuste com trilha de auditoria, alertas via n8n, visão do gestor por equipe/unidade). Motivo: o custo/prazo de homologação REP-P é desproporcional para 3 devs e marcações sem validade jurídica são passivo trabalhista direto. Risco da alternativa (construir): registro INPI + atestado técnico + AFD/AEJ consomem o projeto inteiro; qualquer não conformidade invalida o controle de jornada da empresa em juízo. Descoberta pré-código: verificar se o Nasajon tem módulo de ponto homologado antes de cotar terceiros.

### 5. Clima: garantia estrutural de anonimato

**Impacto:** alto

A Ficha do Portal alerta: clima exige desenho de dado OPOSTO ao resto do RH — todo o restante maximiza rastreabilidade (auditoria, trilha), clima exige irrastreabilidade, senão a resposta enviesa e há risco LGPD. Opções: (a) pseudo-anonimato (resposta ligada ao colaborador, 'RH promete não olhar') — frágil, qualquer DBA reidentifica; (b) anonimato estrutural: impossível reidentificar por desenho do modelo de dados; (c) ferramenta externa de clima — terceiriza o problema mas fragmenta o histórico e adiciona custo.

**Recomendação:** Anonimato estrutural por design, no mesmo sistema: tabela de respostas SEM chave estrangeira para o colaborador (apenas atributos agregáveis: unidade, ciclo da pesquisa); tabela de participação separada e desconectada (registra apenas QUE a pessoa respondeu, para cobrança de adesão, nunca O QUE respondeu); k-anonimato mínimo nos recortes (não exibir cortes com menos de ~5 respondentes — em 5 unidades isso é real); sem timestamp preciso ou metadado que permita correlação; agregação feita exclusivamente no backend; e o schema de clima fisicamente separado dos demais, com grant que impede JOIN com identidade. Motivo: anonimato por política não sobrevive a um subpoena interno nem à desconfiança do funcionário — e a desconfiança mata a taxa de resposta honesta. Risco da alternativa (pseudo-anonimato): viés de resposta que invalida a pesquisa + exposição LGPD por tratamento de opinião vinculada a titular identificável.

### 6. Banco de dados: mesmo PostgreSQL do portal vs instância separada

**Impacto:** alto

O portal roda PostgreSQL com RLS por transação; o arquivo Fast-RH menciona um PostgreSQL dedicado já disponível na SaveinCloud sem custo extra. RH concentra as categorias mais sensíveis da empresa: saúde (atestados), possivelmente biometria (ponto), salário, avaliações, advertências. Opções: (a) mesmo cluster/database do portal (schemas separados) — mais simples, mas credenciais e incidentes compartilhados; (b) instância separada dedicada ao RH — segregação real de acesso, backup e retenção próprios.

**Recomendação:** Instância PostgreSQL separada para o RH (a da SaveinCloud já existe e não custa a mais), com roles e credenciais exclusivas, herdando os padrões do portal: RLS por transação, schema audit só-INSERT sem GRANT de UPDATE/DELETE ao usuário da aplicação, migrations SQL numeradas. Backup automático desde o dia 1 (lição paga caro no Fast-Agente: 4 perdas de dados por arquivo-como-banco; folha e ponto 'não podem sumir'), escrita sempre transacional/append — nunca reescrever coleção. Motivo: minimização de superfície (nenhuma credencial do portal alcança dado de RH), blast radius contido, e capacidade de demonstrar segregação em auditoria LGPD. Risco da alternativa (banco compartilhado): todo acesso legítimo ao banco de vendas vira vetor potencial para salário/saúde; um incidente no portal contamina o RH; políticas de retenção conflitantes no mesmo cluster.

### 7. Avaliação 360: reaproveitar spec btime re-skinada vs refazer do zero

**Impacto:** medio

A btime entregou discovery + spec funcional TO-BE + mockup HTML clicável com modelo de negócio maduro: 3 pilares (Dever 30% / CHA do cargo 40% / Fit Cultural com os 9 Valores Fast 30%), escala 1–5, pesos e faixas parametrizáveis pelo RH sem dev, flags como recomendação (decisão humana com justificativa obrigatória se divergir), ciclos de Experiência (45/90d) e Desempenho (semestral), rollout faseado por feature flag, LGPD by design (Card do Colaborador nasce privado; advertências/licenças/notas brutas estruturalmente fora do compartilhável), ciência digital com hash. Problema: o mockup usa stack e identidade visual diferentes do portal (teal/indigo, Inter/Space Grotesk vs vermelho #d21217, Instrument Sans/Lora).

**Recomendação:** Reaproveitar integralmente a spec/discovery da btime (o modelo de negócio é o ativo de valor e já embute LGPD by design) e descartar o HTML/stack do mockup, reimplementando as telas no design system do portal — a própria ficha registra que 'o HTML é reproduzível rápido'. Os 9 Valores Fast com descritores por nível (fast_kb_valores_fast.md do Fast-Agente) entram como régua do pilar Fit Cultural, e o modelo de ocorrências/feedback 90d alimenta o histórico avaliativo. Aplicar desde o início o versionamento de regra com vigência (pesos/faixas mudam sem recalcular ciclos fechados). Ação pré-código: pedir formalmente à btime o TO-BE e o código. Risco da alternativa (refazer discovery): meses de re-levantamento de algo já validado; risco de adotar o código btime as-is: manter para sempre uma segunda stack e identidade visual divergente.

### Risco transversal: LGPD e privacidade por design

**Impacto:** alto

RH concentra dado pessoal sensível no sentido estrito da LGPD: saúde (atestados), biometria (se o ponto usar), avaliações e flags de desligamento, advertências, salário. Isso atravessa todas as sete decisões: plataforma (isolamento), banco (segregação), clima (anonimato), 360 (Card privado), folha/ponto (dados de terceiros via integração).

**Recomendação:** Tratar como requisito de fundação, não feature: minimização (o front recebe apenas o que a rota autoriza — dado sensível jamais no payload de quem não pode ver, padrão já validado no portal), base legal mapeada por tratamento, trilha de QUEM ACESSOU dado sensível (não só quem alterou), retenção e descarte definidos por tipo de dado, e RIPD/relatório de impacto para ponto (biometria) e clima antes de implementar. Risco de ignorar: sanção ANPD, mas principalmente perda de confiança interna — que mata adesão a clima e 360.

### Risco transversal: auditoria, imutabilidade e versionamento de regra

**Impacto:** alto

Fechamento de folha, ajuste de ponto e registro de avaliação exigem trilha imutável e regra versionada — a Ficha do Portal marca como 'baratos no início e caríssimos de retrofitar'. As lições do Fast-Agente reforçam: nunca arquivo-como-banco, escrita sempre append/transacional, API dona única da lógica (cálculo sensível nunca no front nem no prompt de IA).

**Recomendação:** Trazer da fundação: (1) log append-only com imutabilidade garantida pelo banco (tabela só-INSERT, sem GRANT de UPDATE/DELETE), diff campo a campo com rótulo legível resolvido, UTC no armazenamento e America/Sao_Paulo explícito na exibição; (2) versionamento de regra com vigência (rascunho→ativa→encerrada) e SEM recálculo retroativo — folha fechada e ciclo de avaliação encerrado ficam ligados à versão da época (molde: domínio imposto do portal); (3) toda lógica de cálculo centralizada e testada na API. Risco de ignorar: impossibilidade de defender um fechamento de folha ou uma avaliação em disputa trabalhista, e retrofit de auditoria em dados já gravados é praticamente irrecuperável.

### Risco transversal: passivo trabalhista e dependência de fornecedores

**Impacto:** alto

Folha e ponto são os módulos onde erro vira processo (CLT, eSocial, Portaria 671, convenções coletivas). A estratégia recomendada (integrar Nasajon + ponto de mercado) transfere o risco regulatório mas cria dependência de terceiros — e o discovery da btime já registrou um precedente: o Sults não tinha API do módulo universidade (links inseridos manualmente).

**Recomendação:** Antes de qualquer linha de código, executar as descobertas que destravem as decisões 3 e 4: mapear formalmente o que o Nasajon expõe via API (autenticação, entidades, escrita de variáveis, exportação de resultado de folha), verificar se ele tem módulo de ponto homologado, e validar contrato/versão de toda integração citada no discovery da btime (os nomes vêm do TO-BE, não do portal — nada está integrado hoje). Definir plano B para cada integração (troca de arquivo/batch) e cláusulas de exportação de dados nos contratos. Risco de ignorar: desenhar módulos inteiros sobre APIs que não existem (repetindo o caso Sults) ou descobrir tarde que o 'fechamento' não pode ser automatizado, forçando retrabalho de arquitetura com o projeto em andamento.
