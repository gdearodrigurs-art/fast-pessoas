# Clima (rh_clima) — check-in diário simples: 5 emojis + texto opcional, tendências por equipe e alertas de queda

> Revisado em 2026-07-24 (v2) após decisões do usuário. Substitui integralmente a v1
> (pesquisas periódicas de clima + pulso + eNPS com k-anonimato pesado), que deixa de ser o
> desenho do módulo e vira, no máximo, evolução futura opcional.
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

**Contexto da v2:** o app de RH nasce como aplicativo próprio e separado do portal corporativo (Fase A), em Next.js + TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud, com autenticação e cadastro próprios (papéis funcionário/gestor/rh/dp/admin). Nada é "herdado" do portal na Fase A — RLS, auditoria e RBAC são implementados neste stack. A incorporação ao portal é a Fase B.

**Fase sugerida:** **MVP na Fase 1** (entrega cedo ao DP/RH, 2–3 meses), junto com autenticação própria, ficha do colaborador e demandas — o clima diário é deliberadamente um dos primeiros módulos em uso porque tem dependência externa zero, risco regulatório administrável e é vitrine de adoção. **Na Fase 0**, protótipo HTML standalone do check-in **nas duas variantes de anonimato** (A e B, abaixo) para o DP/RH escolher vendo as telas, não lendo documento. Pesquisas periódicas/eNPS ficam para Fase 3+ se houver demanda.

## Objetivo

Medir o clima de forma contínua e leve: em vez de pesquisas longas e espaçadas, um **check-in diário de segundos** — uma pergunta curta ("como você está se sentindo hoje?", "como você tem se sentido a respeito de suas entregas?") respondida numa **escala de 5 emojis** (chorando / triste / neutro / sorrindo / sorrindo com estrelas) mais um **campo de texto opcional**. O valor está na série temporal: tendência por unidade/equipe, detecção precoce de queda de moral e fechamento de ciclo (ver → agir → ver de novo). Objetivo de negócio: taxa de resposta alta e sustentada, o que exige que responder custe menos de 10 segundos e que o funcionário entenda exatamente quem vê o quê.

**Questão central em aberto (decisão do usuário pendente):** anonimato agregado vs identificado — apresentada na seção "Variantes de anonimato", com recomendação.

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
- Alerta gera notificação (n8n) para RH e, conforme a variante escolhida, para o gestor do recorte; alertas têm status (aberto → em tratamento → encerrado com anotação) para fechar o ciclo.
- Na variante A o alerta é **sempre sobre o recorte**, nunca sobre pessoa; a existência de alerta individual é exatamente o que a variante B acrescenta (ver seção própria).

**6. Leitura dos comentários de texto**
- Textos são exibidos em lista própria para o RH (e gestor, conforme variante), com o valor do emoji e a data — na variante A **sem autor e desassociados de qualquer atributo além da unidade**, com exibição em lote/embaralhada para dificultar dedução por horário.
- Aviso claro na tela de resposta sobre quem lerá o texto (o texto é o maior vetor de autoidentificação — transparência aqui é obrigatória nas duas variantes).

### Evolução (Fase 3+)

- **Pesquisas periódicas estruturadas** (clima completa por dimensões, pulso, eNPS) reaproveitando aprendizados da v1 — só se o check-in diário se mostrar insuficiente; exigirá RIPD próprio e desenho de anonimato mais pesado.
- **Novos recortes** (tempo de casa em faixas, família de cargos) — cada um com revisão de reidentificação antes de habilitar.
- **Cruzamentos agregados** no people analytics (clima × turnover × absenteísmo), sempre agregado, nunca individual; vedado clima × saúde.
- **Análise de sentimento dos textos** (IA, tardia, opcional) sobre comentários já desidentificados — IA nunca acessa microdado identificado.
- **Perguntas sob demanda** ("enquete do dia" pontual do RH) reutilizando o mesmo motor.
- Fora de escopo permanente: canal de denúncia (sigilo com apuração é outro produto) e pesquisa de desligamento (pertence ao processo de desligamento, identificada).

## Variantes de anonimato — decisão central a tomar com DP/RH

O formato (5 emojis + texto opcional, diário) está fechado. O que está aberto é **se a resposta é ligada à pessoa**. As duas variantes mudam o dado gravado, as telas, a base legal e a promessa feita ao funcionário — por isso a decisão precede o protótipo final e consta do log de decisões.

### Variante A — anônimo agregado (recomendada para o início)

- A resposta é gravada **sem vínculo com o colaborador**: apenas valor, data, pergunta e o recorte mínimo (unidade/equipe) copiado no momento da resposta. O controle de "já respondeu hoje" fica numa tabela separada de participação, sem ligação com o conteúdo.
- Ninguém — nem RH, nem admin — consegue ver a resposta de uma pessoa; a garantia é estrutural (o dado identificado não existe), não de tela.
- Dashboards e alertas funcionam **por recorte**. A queda de uma equipe aparece; a queda de uma pessoa específica, não.
- **Ganha:** honestidade e adesão (a promessa "ninguém sabe o que você marcou" é simples e crível); LGPD muito mais leve (dado de resposta anonimizado, art. 12); risco reputacional baixo num módulo que estreia cedo, quando a confiança no app ainda está sendo construída.
- **Perde:** o alerta individual — o gestor não fica sabendo que *fulano* marcou "chorando" três dias seguidos; o cuidado individual continua dependendo de olho humano e do canal aberto gestor-equipe.

### Variante B — identificado com alerta ao gestor

- A resposta é gravada **com o colaborador**: o gestor imediato (e o RH) pode ver a série individual e recebe **alerta individual** (ex.: 3 respostas ≤2 em 5 dias) para agir — chamar para conversa, oferecer apoio.
- **Ganha:** capacidade de agir cedo sobre uma pessoa específica — o argumento humano é forte: de que adianta saber que alguém está mal e não poder ajudar?
- **Perde/custa:** muda a natureza do dado — vira **dado pessoal que revela estado emocional**, tangenciando dado sensível de saúde na leitura da LGPD; exige base legal robusta, RIPD/parecer do DPO antes do primeiro dia, **transparência total** (o funcionário precisa saber, na própria tela de resposta, exatamente quem vê o quê e que gera alerta ao gestor), trilha de auditoria de leitura (quem consultou a série de quem), retenção curta definida e regras duras de não-uso (proibido usar em avaliação de desempenho, promoção ou desligamento — por escrito). E o custo comportamental: parte das pessoas passa a responder "sorrindo" sempre — a série fica bonita e falsa.

### Comparação resumida

| Critério | A — anônimo agregado | B — identificado |
|---|---|---|
| Honestidade/adesão | Alta (promessa simples) | Em risco (resposta performática) |
| Alerta individual | Não existe | Existe (é o motivo de ser da variante) |
| Natureza LGPD | Resposta anonimizada; só a participação é dado pessoal | Dado pessoal sensível-adjacente; RIPD, trilha de leitura, retenção, regras de não-uso |
| Complexidade Fase 1 | Baixa | Média-alta (auditoria de leitura, telas de transparência, política assinada) |
| Reversibilidade | Pode evoluir para B depois, com aviso prévio e novo consentimento — só para respostas futuras | Voltar para A não apaga o histórico identificado já coletado |

### Recomendação do arquiteto

**Começar pela variante A** (alinhada à recomendação da arquitetura v2). Motivos: (1) o módulo estreia na Fase 1, quando o app ainda está conquistando confiança — uma percepção de vigilância na largada queima o clima e contamina a adoção dos demais módulos; (2) a variante A é reversível: com a série agregada rodando e confiança estabelecida, a Fase 2+ pode introduzir a B **mediante decisão informada, parecer do DPO e comunicação prévia**, valendo só dali em diante; o caminho inverso (B→A) não desfaz o dado já coletado; (3) grande parte do valor do alerta individual é capturado pelo alerta de queda por equipe pequena, que já aponta ao gestor "sua equipe precisa de atenção" sem expor indivíduos. **Os dois protótipos da Fase 0 devem ser apresentados ao DP/RH mesmo assim** — a decisão é do usuário e o custo de mostrar as duas telas é baixo.

## Entidades de dados

Especificação funcional (sem DDL). Schema `rh_clima`, acessado pelo pool dedicado `app_clima` no PostgreSQL dedicado da SaveinCloud. Na variante A, o pool `app_clima` não tem leitura sobre as tabelas de identidade além do mínimo para derivar recorte no momento da escrita.

- **`pergunta_checkin`** — enunciado, tema (humor | entregas | carga | relacionamento | outro), tipo de escala (fixo: emoji_1_5 no MVP), status com vigência (ativa/desativada; enunciado publicado é imutável — alteração = pergunta nova no mesmo tema).
- **`agenda_checkin`** — configuração de rotação com vigência: pergunta × dias da semana/cadência, janela de resposta, horário do lembrete. Versionada (mudança de agenda não reescreve o passado).
- **`checkin_resposta`** — data, pergunta_id, valor (1–5), texto opcional. Append-only (edição no dia = nova linha, última vale).
  - **Variante A:** sem FK para colaborador; carrega apenas unidade_id/equipe_id copiados no momento da resposta; sem IP, sem user-agent, sem timestamp fino (só a data; hora arredondada ou ausente para não correlacionar com a participação).
  - **Variante B:** com colaborador_id; timestamp normal; toda leitura individual registrada em trilha de auditoria de leitura.
- **`participacao_checkin`** — data, colaborador_id, status (lembrado | respondeu). Existe para unicidade diária, taxa de participação e supressão de lembrete. **Na variante A não tem nenhuma ligação com `checkin_resposta`** além da data — registra QUE respondeu, nunca O QUE. Retenção curta (tabela de temporalidade).
- **`alerta_clima`** — tipo (queda_media | negativas_acima_teto | participacao_anomala | individual*), recorte (unidade/equipe; *colaborador_id só existe na variante B), período de referência, valor gatilho, status (aberto → em tratamento → encerrado) com anotação de tratamento. Transições auditadas.
- **`snapshot_periodo`** *(leve)* — fechamento mensal dos agregados exibidos (médias, distribuições, participação por recorte), imutável — defensável depois ("o que a gestão viu era isto") e insumo barato para o people analytics futuro.

Fronteiras estruturais:
- Nada de clima escreve em `evento_colaborador` (linha do tempo do colaborador) — em nenhuma variante o humor entra na ficha da pessoa.
- Recorte (unidade/equipe) e relação gestor↔equipe vêm do domínio `rh` (cadastro próprio da Fase A) com vigência; o clima consome, nunca escreve.
- `audit` (append-only por GRANT) registra: gestão de perguntas e agenda, mudanças de parâmetros de alerta, transições de alerta, e — **somente na variante B** — trilha de leitura de série individual (quem viu a série de quem, quando).

## Papéis e permissões

Papéis próprios da Fase A (funcionário / gestor / rh / dp / admin), validados no backend Node (a interface nunca decide); RLS via SET LOCAL onde couber, senão autorização na camada de repositório coberta pela matriz de testes papel × recurso no CI.

| Papel | Pode |
|---|---|
| **Funcionário** | Responder o check-in do dia (uma vez, editável até o fim do dia); ver a própria série histórica **(nas duas variantes — na A a série pessoal fica só no dispositivo/sessão ou não existe, a confirmar no protótipo)**; ver agregado da empresa se o RH marcar como público. |
| **Gestor** | Dashboard agregado **apenas dos recortes das suas equipes** (relação com vigência); alertas de queda dos seus recortes; textos dos seus recortes conforme política definida. **Variante B (somente):** série individual e alertas individuais dos seus liderados diretos, com leitura auditada. Nunca vê lista nominal de quem não respondeu (default recomendado; a fechar com RH). |
| **RH** | Administrar catálogo de perguntas, agenda, parâmetros de alerta e mínimo de exibição; ver todos os agregados; ver textos; tratar alertas; exportar agregados. **Variante A:** não vê resposta individual — impossível por estrutura, não por tela. **Variante B:** vê série individual com leitura auditada. |
| **DP** | Sem acesso por padrão (clima não é operação de DP). |
| **Admin (TI)** | Gestão técnica sem GRANT de leitura sobre respostas na variante A; manutenção excepcional só por acesso nominal e logado. |

Regra transversal: recorte abaixo do mínimo de respondentes não trafega no payload de ninguém (ausência, não máscara), inclusive RH e admin.

## Integrações

- **n8n + e-mail transacional / notificação in-app (padrão)**: lembrete diário do check-in e notificação de alerta para RH/gestor. **WhatsApp Cloud API só como opção explícita** — para o lembrete diário, mediante opt-in e custo aprovado (política de canais: WhatsApp é reservado a urgência); para alertas de queda ao RH/gestor, admissível por serem pontuais e urgentes. Payload mínimo (link, data, recorte do alerta); nunca conteúdo de resposta individual, nunca dado sensível. n8n dispara, não decide nem armazena.
- **Domínio `rh` (cadastro próprio)**: fonte do quadro ativo, lotação/equipe e relação gestor — deriva público do lembrete e escopo do gestor. Fluxo unidirecional: clima consome, não escreve.
- **Portal corporativo**: **nenhuma na Fase A.** Na Fase B, incorporação ao portal (mesmo stack Next.js/Node — integração, não reescrita) e possível unificação de identidade; alegações antigas de "herdar RLS/audit do portal" serão re-verificadas na Fase B, não valem agora.
- **Folha própria, ponto (Pontomais/REP-P), eSocial, Nasajon, SOC, assinatura eletrônica, benefícios**: **nenhuma integração.** Clima não participa de folha, ponto nem obrigação fiscal — e deve continuar assim (humor jamais alimenta cálculo ou avaliação).
- **People analytics (Fase 3)**: consumo apenas de `snapshot_periodo` (agregados), nunca microdado.

## Regulatório

Aqui não há CLT/eSocial/Portaria 671 — clima é iniciativa voluntária. O tema é **LGPD**, e a variante escolhida muda o enquadramento:

- **Variante A:** a resposta, sem FK, sem timestamp fino e sem atributos além do recorte, é defensável como **dado anonimizado (art. 12 LGPD)** — fora do escopo dos direitos do titular sobre a resposta em si. `participacao_checkin` é dado pessoal comum (base legal: legítimo interesse com teste documentado; retenção curta na tabela de temporalidade; atendível na esteira de direitos do titular). Registrar os controles técnicos (ausência de atributos, GRANTs, mínimo de exibição) num **RIPD enxuto** antes do primeiro dia de uso.
- **Variante B:** resposta identificada de estado emocional é dado pessoal com potencial leitura de **dado sensível (saúde/estado psíquico)**. Exige: parecer do DPO e RIPD completo antes da ativação; transparência total na própria tela ("seu gestor e o RH veem sua resposta e recebem alerta"); trilha de auditoria de leitura; retenção curta definida; compromisso formal de não-uso em decisões de desempenho/desligamento; canal para o titular exercer direitos (acesso, eliminação).
- **Nas duas variantes:** comunicação de lançamento explicando o que é coletado e quem vê o quê — transparência é pré-condição de adesão, não formalidade; logs de aplicação/API não podem registrar corpo de resposta associado a usuário (item de checklist de release — na variante A isso é o canal lateral que poderia religar resposta a pessoa); backups com a mesma disciplina de acesso do banco (backup diário + PITR com restore testado, padrão da plataforma).
- Clima **não substitui canal de denúncia** (sigilo com apuração é outro desenho) nem atendimento de saúde — deixar explícito na interface, com orientação de canais adequados quando o funcionário relatar algo grave no texto.

## Dependências

- **Fase 0**: protótipos HTML das duas variantes (tela de resposta + dashboard + tela de transparência "quem vê o quê") para decisão do DP/RH; decisão da variante registrada no log; Postgres dedicado provisionado com restore testado; definição do mínimo de exibição por recorte.
- **Fase 1 (mesmo pacote de entrega)**: autenticação e cadastro próprios com papéis; colaborador com lotação/equipe e relação gestor com vigência; `audit` append-only operante; n8n + e-mail transacional configurados (WhatsApp só se a opção com opt-in for aprovada); pool `app_clima` com GRANTs restritos.
- **Não depende de**: folha própria, ponto/REP-P, eSocial, 360, assinatura, SOC, DW — é o módulo com menor dependência externa do sistema, por isso entra cedo.

## Riscos

1. **Fadiga de resposta** — o maior risco específico do formato diário: adesão alta na semana 1 e queda ao platô nos meses seguintes. Mitigação: custo de resposta < 10 segundos, lembrete silenciável, rotação de perguntas, devolutiva visível (funcionário percebe que o dado gera ação — plano tratado, alerta encerrado com anotação); aceitar como sucesso um platô realista (ex.: 40–60% dos dias úteis) e medir tendência, não censo.
2. **Percepção de vigilância** — mesmo na variante A, "o RH quer saber como me sinto todo dia" pode soar como monitoramento. Mitigação: comunicação de lançamento clara, tela de transparência dentro do app, e — se a variante A for a escolhida — reforçar a garantia estrutural em linguagem simples.
3. **Texto livre como vetor de autoidentificação (variante A)** — o comentário pode identificar o autor pelo conteúdo ("como único analista da loja X…"). Mitigação: aviso na tela, exibição em lote/embaralhada, orientação ao RH de não caçar autoria; risco residual aceito e registrado.
4. **Resposta performática (variante B)** — se identificado, parte das pessoas responde o que o gestor quer ver; a série perde valor exatamente onde mais importa. É o argumento técnico central da recomendação pela A.
5. **Equipes pequenas** — recorte abaixo do mínimo não aparece isolado; gestor de equipe de 3 pessoas só vê o agregado da unidade. Combinar antes do lançamento, não descobrir no dashboard.
6. **Fadiga/banalização de alertas** — limiar mal calibrado dispara alerta toda semana e o gestor para de olhar. Mitigação: parâmetros ajustáveis pelo RH, início conservador, revisão após os 2 primeiros meses.
7. **Pressão organizacional por dado individual na variante A** ("quem marcou chorando?") — o sistema torna o não estrutural, mas a política precisa estar assinada por RH/diretoria antes do primeiro dia, senão a pressão cai sobre o time de desenvolvimento.
8. **Uso indevido do dado (variante B)** — série de humor usada, ainda que informalmente, em decisão de desempenho ou desligamento: risco jurídico e de confiança graves. Mitigação: regra de não-uso formalizada, trilha de leitura auditada, retenção curta.
9. **Migração A→B mal comunicada** — se um dia a empresa ativar a variante B, valer só dali em diante e com aviso prévio; qualquer sombra de retroatividade destrói a promessa feita na A.

## Perguntas abertas para DP/RH

1. **A decisão central: variante A (anônimo agregado) ou B (identificado com alerta ao gestor)?** Recomendação do arquiteto: começar pela A (justificativa na seção de variantes); decidir vendo os dois protótipos da Fase 0.
2. Cadência: todo dia útil, ou 3× por semana? Perguntas em rotação (humor diário + entregas semanal) ou uma única fixa no início?
3. Horário do lembrete e canal adicional: o padrão do lembrete diário é **e-mail transacional / notificação in-app** (política de canais: WhatsApp reservado a urgência, com custo por mensagem). O RH quer habilitar o WhatsApp como canal adicional do lembrete, mediante **opt-in do funcionário**? Se sim, aprovar antes a estimativa de custo recorrente: **nº de colaboradores × dias úteis × preço por mensagem** (ex.: 200 colaboradores × 21 dias úteis × preço unitário da mensagem WhatsApp ≈ 4.200 mensagens/mês a precificar). Qual o horário do disparo? O funcionário pode silenciar? (Sim por padrão — confirmar.)
4. Quem lê os textos: só RH, ou gestor também (do seu recorte)? Na variante A, aceita-se a exibição embaralhada/em lote?
5. Mínimo de respondentes para exibir recorte: 5 está bom? Equipes menores aceitam aparecer só no agregado da unidade, ou preferem agrupamentos definidos antes do lançamento?
6. Limiares iniciais de alerta de queda (proposta: −0,5 na média móvel de 7 dias; >30% de respostas negativas na semana) — calibrar com RH e revisar após 2 meses?
7. Gestor vê % de participação da equipe? E lista nominal de quem não respondeu? (Recomendação firme: nunca nominal — participação não pode virar dado de cobrança.)
8. Resultado agregado da empresa é publicado para todos os funcionários (transparência aumenta adesão) ou restrito a RH/gestores? Qual o default?
9. Escopo de participantes: só CLT, ou também estagiários, aprendizes e temporários? PJ/terceirizados ficam fora?
10. Retenção: por quanto tempo guardar respostas (proposta: agregados/snapshots por tempo indeterminado; microdado da variante B e participação por prazo curto, ex.: 12–24 meses)? Quem assina o RIPD?
11. O funcionário deve ver a própria série histórica ("meu humor no mês")? Na variante A isso exige desenho específico (a série identificada não existe no servidor) — vale o custo ou fica de fora?
12. Confirmar fronteiras: pesquisa de desligamento fica no processo de desligamento (identificada) e canal de denúncia é outro produto — ok para RH?
13. Pesquisas periódicas/eNPS (formato da v1) ficam como evolução futura condicionada a necessidade real — algum compromisso já assumido com diretoria que exija antecipar?
