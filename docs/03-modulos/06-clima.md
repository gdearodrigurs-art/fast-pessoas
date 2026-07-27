# Clima (rh_clima) — check-in diário simples: 5 emojis + texto opcional, tendências por equipe e alertas de queda

> Revisado em 2026-07-24 (v2) após decisões do usuário. Substitui integralmente a v1
> (pesquisas periódicas de clima + pulso + eNPS com k-anonimato pesado), que deixa de ser o
> desenho do módulo e vira, no máximo, evolução futura opcional.
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário, exceto o modelo de anonimato (decisão do usuário 2026-07-27, definitiva — ver seção "Modelo de anonimato (decidido)"). Fase sem código.**

**Contexto da v2:** o app de RH nasce como aplicativo próprio e separado do portal corporativo (Fase A), em Next.js + TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud, com autenticação e cadastro próprios (papéis funcionário/gestor/rh/dp/admin). Nada é "herdado" do portal na Fase A — RLS, auditoria e RBAC são implementados neste stack. A incorporação ao portal é a Fase B.

**Fase sugerida:** **MVP na Fase 1** (entrega cedo ao DP/RH, 2–3 meses), junto com autenticação própria, ficha do colaborador e demandas — o clima diário é deliberadamente um dos primeiros módulos em uso porque tem dependência externa zero, risco regulatório administrável e é vitrine de adoção. **Na Fase 0**, protótipo HTML standalone do check-in **no modelo confidencial com acesso restrito** (decisão do usuário 2026-07-27), com foco em validar a tela de transparência ("quem vê o quê") e o recorte mínimo dos agregados vendo as telas, não lendo documento. Pesquisas periódicas/eNPS ficam para Fase 3+ se houver demanda.

## Objetivo

Medir o clima de forma contínua e leve: em vez de pesquisas longas e espaçadas, um **check-in diário de segundos** — uma pergunta curta ("como você está se sentindo hoje?", "como você tem se sentido a respeito de suas entregas?") respondida numa **escala de 5 emojis** (chorando / triste / neutro / sorrindo / sorrindo com estrelas) mais um **campo de texto opcional**. O valor está na série temporal: tendência por unidade/equipe, detecção precoce de queda de moral e fechamento de ciclo (ver → agir → ver de novo). Objetivo de negócio: taxa de resposta alta e sustentada, o que exige que responder custe menos de 10 segundos e que o funcionário entenda exatamente quem vê o quê.

**Decisão central tomada (decisão do usuário 2026-07-27):** o check-in é **confidencial com acesso restrito, não anônimo** — detalhada na seção "Modelo de anonimato (decidido)".

## Funcionalidades

### MVP (Fase 1)

**1. Check-in diário do funcionário**
- Ao abrir o app (ou via link do lembrete), o funcionário vê a pergunta do dia e responde tocando em 1 dos 5 emojis: chorando (1) / triste (2) / neutro (3) / sorrindo (4) / sorrindo com estrelas (5).
- Campo de texto opcional ("quer comentar algo?") — nunca obrigatório.
- Uma resposta por pessoa por dia; permitida a edição até o fim do dia (última vale); dias sem resposta simplesmente não existem na série (não é falta, não gera cobrança individual).
- Responder é voluntário. O check-in nunca bloqueia o uso do restante do app.

**2. Catálogo e rotação de perguntas (RH)**
- Catálogo de perguntas curtas administrado pelo RH, com vigência (pergunta desativada não some do histórico). Perguntas iniciais sugeridas: "Como você está se sentindo hoje?" (tema: humor) e "Como você tem se sentido a respeito de suas entregas?" (tema: trabalho/entregas).
- Cada pergunta tem um **tema** (humor, entregas, carga de trabalho, relacionamento com a equipe…) para permitir série comparável por tema mesmo com enunciados rotacionando.
- Configuração de rotação: qual pergunta em quais dias (ex.: humor todo dia; entregas às sextas), cadência (dias úteis por padrão) e janela de resposta (ex.: 8h–20h).
- Regra de comparabilidade: enunciado de pergunta publicada não se edita (mudança de texto = pergunta nova no mesmo tema), para não enviesar a série.

**3. Lembrete diário (n8n)**
- Disparo diário via n8n — **canal padrão: e-mail transacional e/ou notificação in-app** — com link direto para o check-in. Payload mínimo: link + data; nunca resposta, nunca dado sensível.
- **WhatsApp não é canal padrão do lembrete** (política de canais do sistema: e-mail transacional como padrão; WhatsApp Cloud API reservado a urgência, com custo por mensagem). Um lembrete diário para toda a empresa via WhatsApp só entra como **opção explícita**, com opt-in do funcionário e custo recorrente aprovado pelo RH — estimativa: nº de colaboradores × dias úteis × preço por mensagem enviada (ver pergunta aberta 3).
- Horário configurável pelo RH; opção de o funcionário silenciar o lembrete (a resposta continua possível pelo app).
- Sem lembrete de cobrança individual por não ter respondido ontem — lembrete é convite, não cobrança.

**4. Dashboard de tendência (RH e gestor)**
- Série temporal do score médio (1–5) por dia/semana, com média móvel de 7 e 28 dias, por empresa, unidade e equipe; distribuição dos 5 emojis; taxa de participação do recorte.
- Comparação entre unidades/equipes e entre períodos; filtro por tema de pergunta.
- Recortes pequenos: um recorte só é exibido com um **mínimo simples de respondentes no período** (proposta: 5; parametrizável), sem a maquinaria de interseção de recortes da v1 — no MVP os recortes são apenas unidade e equipe, o que mantém o problema pequeno.

**5. Alertas de queda**
- Regras simples e configuráveis pelo RH, por recorte (unidade/equipe): queda da média móvel acima de um limiar (ex.: −0,5 ponto em 7 dias), proporção de respostas negativas (emojis 1–2) acima de um teto (ex.: >30% na semana), ou silêncio anômalo (participação despencou).
- Alerta gera notificação (n8n) para RH e para o gestor do recorte; alertas têm status (aberto → em tratamento → encerrado com anotação) para fechar o ciclo.
- O alerta é **sempre sobre o recorte**, nunca sobre pessoa: não há alerta individual no MVP. A leitura de resposta individual é prerrogativa exclusiva da Diretoria de Pessoas, sob demanda e auditada (ver seção "Modelo de anonimato (decidido)").

**6. Leitura dos comentários de texto**
- Textos são exibidos em lista própria para o RH (e gestor, conforme política a definir), com o valor do emoji e a data — **sem autor** (minimização de exibição: a FK existe no banco, mas conteúdo + autor juntos só saem pela rota restrita da Diretoria de Pessoas), com exibição em lote/embaralhada para dificultar dedução por horário.
- Aviso claro na tela de resposta sobre quem lerá o texto e quem pode ver o autor (transparência aqui é obrigatória — ver o texto de transparência na seção "Modelo de anonimato (decidido)").

### Evolução (Fase 3+)

- **Pesquisas periódicas estruturadas** (clima completa por dimensões, pulso, eNPS) reaproveitando aprendizados da v1 — só se o check-in diário se mostrar insuficiente; exigirá RIPD próprio e desenho de anonimato mais pesado.
- **Novos recortes** (tempo de casa em faixas, família de cargos) — cada um com revisão de reidentificação antes de habilitar.
- **Cruzamentos agregados** no people analytics (clima × turnover × absenteísmo), sempre agregado, nunca individual; vedado clima × saúde.
- **Análise de sentimento dos textos** (IA, tardia, opcional) sobre comentários já desidentificados — IA nunca acessa microdado identificado.
- **Perguntas sob demanda** ("enquete do dia" pontual do RH) reutilizando o mesmo motor.
- Fora de escopo permanente: canal de denúncia (sigilo com apuração é outro produto) e pesquisa de desligamento (pertence ao processo de desligamento, identificada).

## Modelo de anonimato (decidido) — confidencial com acesso restrito

> **Decisão do usuário (2026-07-27), definitiva.** Substitui a questão aberta das variantes A (anônimo agregado) e B (identificado com alerta ao gestor) e a recomendação do arquiteto pela A. O modelo adotado não é nenhuma das duas: o check-in é **confidencial com acesso restrito, não anônimo**.

- **Resposta vinculada ao colaborador**: `checkin_resposta` carrega FK para o colaborador. Não há promessa de anonimato — a promessa feita ao funcionário é de **confidencialidade**.
- **Acesso à resposta individual (conteúdo + autor) é exclusivo do papel Diretoria de Pessoas**, mediante chave de permissão própria (`clima.resposta.individual.ver`), **2FA** na sessão e **trilha de leitura no `audit`** (quem viu a resposta de quem, quando).
- **Gestores e RH operacional veem apenas agregados** por unidade/equipe, com **recorte mínimo** de respondentes — não se exibe agregado de grupo pequeno que desanonimize na prática.
- **Transparência obrigatória**: a tela do check-in informa explicitamente quem pode ver o quê — "suas respostas individuais são visíveis apenas à Diretoria de Pessoas; seu gestor vê somente médias da equipe". O texto exato é pendência de redação (pergunta aberta 1).
- **Risco assumido e registrado**: possível viés de resposta por saber que a diretoria pode ler — mitigado pela transparência e pela restrição do acesso individual a um único papel (ver risco 4).

## Entidades de dados

Especificação funcional (sem DDL). Schema `rh_clima`, acessado pelo pool dedicado `app_clima` no PostgreSQL dedicado da SaveinCloud. Com a resposta vinculada ao colaborador (decisão de 2026-07-27), o pool `app_clima` **precisa de leitura sobre identidade** (colaborador, lotação/equipe, relação gestor); a segregação deixa de ser por ausência do dado e passa a ser por **GRANT + chave de permissão**: a leitura de resposta individual (conteúdo + autor) só sai pela rota da aplicação protegida pela chave `clima.resposta.individual.ver` (exclusiva da Diretoria de Pessoas), nunca por consulta genérica dos demais papéis.

- **`pergunta_checkin`** — enunciado, tema (humor | entregas | carga | relacionamento | outro), tipo de escala (fixo: emoji_1_5 no MVP), status com vigência (ativa/desativada; enunciado publicado é imutável — alteração = pergunta nova no mesmo tema).
- **`agenda_checkin`** — configuração de rotação com vigência: pergunta × dias da semana/cadência, janela de resposta, horário do lembrete. Versionada (mudança de agenda não reescreve o passado).
- **`checkin_resposta`** — data, pergunta_id, valor (1–5), texto opcional, **colaborador_id (FK)** e unidade_id/equipe_id copiados no momento da resposta (recorte histórico estável); timestamp normal. Append-only (edição no dia = nova linha, última vale). Toda leitura individual (conteúdo + autor) passa exclusivamente pela rota com a chave `clima.resposta.individual.ver` e é registrada na trilha de leitura do `audit`.
- **`participacao_checkin`** — data, colaborador_id, status (lembrado | respondeu). Existe para unicidade diária, taxa de participação e supressão de lembrete — registra QUE respondeu; O QUE respondeu fica em `checkin_resposta`, atrás da rota restrita. Retenção curta (tabela de temporalidade).
- **`alerta_clima`** — tipo (queda_media | negativas_acima_teto | participacao_anomala), recorte (unidade/equipe — alerta é sempre sobre recorte, nunca sobre pessoa; não há alerta individual no MVP), período de referência, valor gatilho, status (aberto → em tratamento → encerrado) com anotação de tratamento. Transições auditadas.
- **`snapshot_periodo`** *(leve)* — fechamento mensal dos agregados exibidos (médias, distribuições, participação por recorte), imutável — defensável depois ("o que a gestão viu era isto") e insumo barato para o people analytics futuro.

Fronteiras estruturais:
- Nada de clima escreve em `evento_colaborador` (linha do tempo do colaborador) — em nenhuma hipótese o humor entra na ficha da pessoa.
- Recorte (unidade/equipe) e relação gestor↔equipe vêm do domínio `rh` (cadastro próprio da Fase A) com vigência; o clima consome, nunca escreve.
- `audit` (append-only por GRANT) registra: gestão de perguntas e agenda, mudanças de parâmetros de alerta, transições de alerta, e a **trilha de leitura de resposta/série individual** (quem viu o quê de quem, quando) — obrigatória em toda leitura pela rota da Diretoria de Pessoas.

## Papéis e permissões

Papéis próprios da Fase A (funcionário / gestor / rh / dp / admin, acrescidos do papel **diretoria de pessoas** exigido pelo clima), validados no backend Node (a interface nunca decide); RLS via SET LOCAL onde couber, senão autorização na camada de repositório coberta pela matriz de testes papel × recurso no CI. A chave `clima.resposta.individual.ver` entra na matriz como caso obrigatório: só o perfil diretoria a possui.

| Papel | Pode |
|---|---|
| **Funcionário** | Responder o check-in do dia (uma vez, editável até o fim do dia); ver a própria série histórica (existe no servidor, vinculada a ele — acesso restrito ao próprio dado); ver agregado da empresa se o RH marcar como público. |
| **Gestor** | **Apenas agregados**: dashboard dos recortes das suas equipes (relação com vigência), respeitando o recorte mínimo; alertas de queda dos seus recortes; textos dos seus recortes **sem autor**, conforme política definida. **Nunca vê resposta individual** (bloqueio por chave/GRANT no backend). Nunca vê lista nominal de quem não respondeu (default recomendado; a fechar com RH). |
| **RH** | Administrar catálogo de perguntas, agenda, parâmetros de alerta e mínimo de exibição; ver todos os agregados; ver textos **sem autor**; tratar alertas; exportar agregados. **Não vê resposta individual** — o RH operacional não recebe a chave `clima.resposta.individual.ver`; o bloqueio é por chave/GRANT no backend, não por tela. |
| **Diretoria de Pessoas** | **Único papel com a chave `clima.resposta.individual.ver`**: vê resposta e série individuais (conteúdo + autor), mediante **2FA** e com **toda leitura registrada na trilha do `audit`**. Também vê todos os agregados. |
| **DP** | Sem acesso por padrão (clima não é operação de DP). |
| **Admin (TI)** | Gestão técnica **sem** a chave `clima.resposta.individual.ver` (não vê resposta individual pela aplicação); manutenção excepcional no banco só por acesso nominal e logado. |

Regra transversal: recorte abaixo do mínimo de respondentes não trafega no payload de ninguém (ausência, não máscara), inclusive RH e admin — o acesso individual da Diretoria de Pessoas sai pela rota própria auditada, nunca por agregado de grupo pequeno.

## Integrações

- **n8n + e-mail transacional / notificação in-app (padrão)**: lembrete diário do check-in e notificação de alerta para RH/gestor. **WhatsApp Cloud API só como opção explícita** — para o lembrete diário, mediante opt-in e custo aprovado (política de canais: WhatsApp é reservado a urgência); para alertas de queda ao RH/gestor, admissível por serem pontuais e urgentes. Payload mínimo (link, data, recorte do alerta); nunca conteúdo de resposta individual, nunca dado sensível. n8n dispara, não decide nem armazena.
- **Domínio `rh` (cadastro próprio)**: fonte do quadro ativo, lotação/equipe e relação gestor — deriva público do lembrete e escopo do gestor. Fluxo unidirecional: clima consome, não escreve.
- **Portal corporativo**: **nenhuma na Fase A.** Na Fase B, incorporação ao portal (mesmo stack Next.js/Node — integração, não reescrita) e possível unificação de identidade; alegações antigas de "herdar RLS/audit do portal" serão re-verificadas na Fase B, não valem agora.
- **Folha própria, ponto (Pontomais/REP-P), eSocial, Nasajon, SOC, assinatura eletrônica, benefícios**: **nenhuma integração.** Clima não participa de folha, ponto nem obrigação fiscal — e deve continuar assim (humor jamais alimenta cálculo ou avaliação).
- **People analytics (Fase 3)**: consumo apenas de `snapshot_periodo` (agregados), nunca microdado.

## Regulatório

Aqui não há CLT/eSocial/Portaria 671 — clima é iniciativa voluntária. O tema é **LGPD**, sob o modelo decidido (confidencial com acesso restrito, decisão do usuário 2026-07-27):

- **Não é anonimização — art. 12 não se aplica à resposta.** Com FK para o colaborador, a resposta é **dado pessoal** que revela estado emocional, tangenciando **dado sensível (saúde/estado psíquico)** na leitura da LGPD. O enquadramento é **confidencialidade + minimização de exibição + trilha de leitura**: acesso individual restrito a um único papel (Diretoria de Pessoas) com chave própria e 2FA; demais papéis só veem agregados com recorte mínimo; toda leitura individual registrada no `audit`.
- **RIPD continua obrigatório** antes do primeiro dia de uso, com parecer do DPO: base legal documentada (legítimo interesse com teste, dada a voluntariedade e a finalidade de cuidado), retenção curta definida para o microdado, compromisso formal por escrito de não-uso em decisões de desempenho/promoção/desligamento, e canal para o titular exercer direitos (acesso, correção, eliminação) — que agora incidem sobre a resposta em si, pois ela é dado pessoal. `participacao_checkin` segue como dado pessoal comum com retenção curta na tabela de temporalidade.
- **Sempre:** comunicação de lançamento explicando o que é coletado e quem vê o quê — transparência é pré-condição de adesão, não formalidade (inclui o aviso na própria tela: "suas respostas individuais são visíveis apenas à Diretoria de Pessoas; seu gestor vê somente médias da equipe"); logs de aplicação/API não podem registrar corpo de resposta associado a usuário (item de checklist de release — log é canal lateral que burlaria a rota restrita e sua trilha de leitura); backups com a mesma disciplina de acesso do banco (backup diário + PITR com restore testado, padrão da plataforma).
- Clima **não substitui canal de denúncia** (sigilo com apuração é outro desenho) nem atendimento de saúde — deixar explícito na interface, com orientação de canais adequados quando o funcionário relatar algo grave no texto.

## Dependências

- **Fase 0**: protótipo HTML do modelo confidencial (tela de resposta + dashboard + tela de transparência "quem vê o quê") para validação do DP/RH; decisão do modelo já registrada no log (decisão do usuário 2026-07-27); Postgres dedicado provisionado com restore testado; definição do mínimo de exibição por recorte e do texto exato de transparência.
- **Fase 1 (mesmo pacote de entrega)**: autenticação e cadastro próprios com papéis; colaborador com lotação/equipe e relação gestor com vigência; `audit` append-only operante; n8n + e-mail transacional configurados (WhatsApp só se a opção com opt-in for aprovada); pool `app_clima` com GRANTs restritos.
- **Não depende de**: folha própria, ponto/REP-P, eSocial, 360, assinatura, SOC, DW — é o módulo com menor dependência externa do sistema, por isso entra cedo.

## Riscos

1. **Fadiga de resposta** — o maior risco específico do formato diário: adesão alta na semana 1 e queda ao platô nos meses seguintes. Mitigação: custo de resposta < 10 segundos, lembrete silenciável, rotação de perguntas, devolutiva visível (funcionário percebe que o dado gera ação — plano tratado, alerta encerrado com anotação); aceitar como sucesso um platô realista (ex.: 40–60% dos dias úteis) e medir tendência, não censo.
2. **Percepção de vigilância** — no modelo confidencial, "a diretoria pode ler o que eu marco" pode soar como monitoramento. Mitigação: comunicação de lançamento clara, tela de transparência dentro do app dizendo exatamente quem vê o quê, e reforço em linguagem simples de que gestor e RH veem somente médias.
3. **Texto livre como vetor de identificação na exibição sem autor** — o comentário exibido a RH/gestor sem autor pode identificá-lo pelo conteúdo ("como único analista da loja X…"). Mitigação: aviso na tela, exibição em lote/embaralhada, orientação a RH/gestor de não caçar autoria; risco residual aceito e registrado.
4. **Viés de resposta (risco assumido na decisão de 2026-07-27)** — saber que a Diretoria de Pessoas pode ler a resposta individual pode levar parte das pessoas a responder de forma performática. Mitigação registrada: transparência total sobre quem vê o quê e restrição do acesso individual a um único papel (gestor e RH nunca veem).
5. **Equipes pequenas** — recorte abaixo do mínimo não aparece isolado; gestor de equipe de 3 pessoas só vê o agregado da unidade. Combinar antes do lançamento, não descobrir no dashboard.
6. **Fadiga/banalização de alertas** — limiar mal calibrado dispara alerta toda semana e o gestor para de olhar. Mitigação: parâmetros ajustáveis pelo RH, início conservador, revisão após os 2 primeiros meses.
7. **Pressão organizacional por dado individual fora da rota restrita** ("quem marcou chorando?") — gestor ou RH pedindo o acesso que a chave nega. O sistema torna o "não" técnico (chave/GRANT), mas a política de acesso precisa estar assinada por RH/diretoria antes do primeiro dia, senão a pressão cai sobre o time de desenvolvimento.
8. **Uso indevido do dado individual** — série de humor lida pela diretoria e usada, ainda que informalmente, em decisão de desempenho ou desligamento: risco jurídico e de confiança graves. Mitigação: regra de não-uso formalizada por escrito, trilha de leitura auditada, 2FA, retenção curta.
9. **Ampliação futura do rol de acesso mal comunicada** — se um dia a empresa quiser dar leitura individual a mais papéis (ex.: gestor), a mudança exige nova decisão registrada, parecer do DPO, aviso prévio e vigência só dali em diante; qualquer sombra de retroatividade destrói a promessa de confidencialidade feita no lançamento.

## Perguntas abertas para DP/RH

1. **[DECIDIDA — decisão do usuário 2026-07-27]** O modelo é **confidencial com acesso restrito** (ver seção "Modelo de anonimato (decidido)"). O que resta a fechar: **o texto exato de transparência** da tela do check-in (partindo de "suas respostas individuais são visíveis apenas à Diretoria de Pessoas; seu gestor vê somente médias da equipe") e **o recorte mínimo dos agregados** (tamanho mínimo de grupo para exibir média sem desanonimizar na prática — ver também pergunta 5).
2. Cadência: todo dia útil, ou 3× por semana? Perguntas em rotação (humor diário + entregas semanal) ou uma única fixa no início?
3. Horário do lembrete e canal adicional: o padrão do lembrete diário é **e-mail transacional / notificação in-app** (política de canais: WhatsApp reservado a urgência, com custo por mensagem). O RH quer habilitar o WhatsApp como canal adicional do lembrete, mediante **opt-in do funcionário**? Se sim, aprovar antes a estimativa de custo recorrente: **nº de colaboradores × dias úteis × preço por mensagem** (ex.: 200 colaboradores × 21 dias úteis × preço unitário da mensagem WhatsApp ≈ 4.200 mensagens/mês a precificar). Qual o horário do disparo? O funcionário pode silenciar? (Sim por padrão — confirmar.)
4. Quem lê os textos (sempre sem autor): só RH, ou gestor também (do seu recorte)? Aceita-se a exibição embaralhada/em lote?
5. Mínimo de respondentes para exibir recorte: 5 está bom? Equipes menores aceitam aparecer só no agregado da unidade, ou preferem agrupamentos definidos antes do lançamento?
6. Limiares iniciais de alerta de queda (proposta: −0,5 na média móvel de 7 dias; >30% de respostas negativas na semana) — calibrar com RH e revisar após 2 meses?
7. Gestor vê % de participação da equipe? E lista nominal de quem não respondeu? (Recomendação firme: nunca nominal — participação não pode virar dado de cobrança.)
8. Resultado agregado da empresa é publicado para todos os funcionários (transparência aumenta adesão) ou restrito a RH/gestores? Qual o default?
9. Escopo de participantes: só CLT, ou também estagiários, aprendizes e temporários? PJ/terceirizados ficam fora?
10. Retenção: por quanto tempo guardar respostas (proposta: agregados/snapshots por tempo indeterminado; microdado identificado e participação por prazo curto, ex.: 12–24 meses)? Quem assina o RIPD?
11. O funcionário deve ver a própria série histórica ("meu humor no mês")? Com a resposta vinculada ao colaborador a série existe no servidor — é tela simples; entra no MVP ou fica para depois?
12. Confirmar fronteiras: pesquisa de desligamento fica no processo de desligamento (identificada) e canal de denúncia é outro produto — ok para RH?
13. Pesquisas periódicas/eNPS (formato da v1) ficam como evolução futura condicionada a necessidade real — algum compromisso já assumido com diretoria que exija antecipar?
