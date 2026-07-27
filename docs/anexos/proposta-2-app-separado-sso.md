# Fast RH — App separado com identidade compartilhada (SSO do Portal)

> Gerado em 2026-07-24 por análise multi-agente sobre as fontes
> "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md".
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

## Visão geral

## Visão geral

**Fast RH** é uma aplicação própria — repositório, deploy e banco de dados separados do Portal de Vendas — que **reusa a identidade do portal via SSO** e **replica os padrões de plataforma já validados** (RLS por transação, RBAC por chave no banco, auditoria append-only, versionamento de regra com vigência, design system). É a materialização da recomendação convergente das duas fontes: o Fast-Agente contribui com o **modelo de pessoas e as lições de integridade**; o portal contribui com a **arquitetura e a implementação de referência**; e a separação física responde ao fato de que RH concentra o dado mais sensível da empresa (saúde, salário, avaliações, possivelmente biometria) e precisa de blast radius contido e ciclo de release próprio.

### Racional central (posições assumidas)
1. **App separado, identidade única.** O custo de um incidente do portal comercial alcançar salário/atestado é inaceitável; o custo de duplicar login/2FA/cadastro é desnecessário. SSO resolve os dois: o portal é o provedor de identidade, o Fast RH é um "satélite" com banco e deploy próprios. O erro da btime (app separado com stack e identidade visual próprias) não se repete porque a separação aqui é **só física** — stack, padrões e design system são idênticos aos do portal por contrato.
2. **Integrar onde há regulação, construir onde há processo.** Cálculo de folha, eSocial e marcação de ponto ficam com a Nasajon e com solução de ponto homologada (Portaria 671). O Fast RH constrói o que nenhum fornecedor entrega: a **linha do tempo do colaborador** como espinha dorsal, os workflows (fechamento, ajustes, férias, admissão/desligamento), a avaliação 360 pela spec da btime, o clima com anonimato estrutural e a camada de auditoria/compliance por cima de tudo.
3. **O histórico do funcionário é o primeiro artefato de dados.** Todo módulo pendura eventos na linha do tempo do colaborador (admissão, cargo, salário, ponto, afastamento, avaliação, ocorrência, documento). Modelado na Fase 1, antes de qualquer módulo operacional.
4. **Plataforma mínima duplicada, conscientemente.** Com 3 devs, a duplicação de plataforma é o principal custo desta lente. Ela é minimizada por três mecanismos: fork controlado do `nucleo/` do portal (copiar com proveniência, não reescrever), pacote compartilhado leve de design tokens, e a decisão de **não construir** folha/ponto/eSocial — o que devolve ao time o tempo que a duplicação consome.
5. **Fechamento de folha = esteira de conferência**, não de cálculo: coleta de variáveis → envio à Nasajon → conciliação da prévia → aprovação com trilha → snapshot imutável → publicação de holerites.

### O que o sistema cobre
Espinha dorsal (ficha + linha do tempo + organograma + cargos/salários), ponto (consumo de REP homologado + workflows de ajuste), folha e fechamento (orquestração sobre a Nasajon), avaliação 360 (spec btime, 3 pilares, com os 9 Valores Fast no Fit Cultural), clima (anonimato estrutural), demandas/workflows (admissão, desligamento, férias, documentos), GED com ciência digital, afastamentos, benefícios, SST e painel de obrigações — organizados em 3 fases + uma fase 0 de descobertas obrigatórias (API Nasajon, TO-BE btime, contrato de SSO).

## Plataforma e stack

## Plataforma, stack, componentes e deploy

### Decisão de plataforma
**App separado: repositório próprio, deploy próprio, banco próprio** — reusando a identidade do portal via SSO e replicando (não reinventando) os padrões validados: RLS por transação, RBAC por chave no banco, schema `audit` só-INSERT, versionamento de regra com vigência, migrations SQL numeradas, design system.

Por que separado e não módulo: RH concentra as categorias mais sensíveis da empresa (saúde, salário, avaliações, possivelmente biometria) e tem ciclo de release próprio; o isolamento contém o blast radius — nenhuma credencial, permissão ou vulnerabilidade do portal comercial alcança dado de RH — e é demonstrável em auditoria LGPD. Por que identidade compartilhada e não independente: recriar login/2FA/cadastro seria repetir o erro da btime (duas identidades, dois RBACs, dois visuais) com 3 devs para sustentar.

### Stack (idêntica ao portal, deliberadamente)
| Camada | Tecnologia | Observação |
|---|---|---|
| Front | Next.js (App Router) + React + TypeScript + Emotion | Mesma do portal; o time já domina Next/TS |
| Back | FastAPI + Python 3.12 + asyncpg + Redis | Padrão consolidado da empresa; é onde vivem os moldes de RLS/RBAC/audit/vigência |
| Banco | **PostgreSQL dedicado (SaveinCloud, já disponível sem custo extra)** com RLS por transação | Instância separada da do portal; credenciais exclusivas |
| Infra | SaveinCloud (mesmo provedor do portal), n8n para webhooks/notificações | Backup automático do banco desde o dia 1, com teste de restore |
| IA (opcional, fase tardia) | Assistente via MCP: "IA conversa, backend guarda e calcula" | Nunca calcula folha/ponto nem decide acesso |

Posição sobre o conflito Node × Python: **FastAPI/Python**. O ativo a herdar é a plataforma (RLS, RBAC, audit, vigência) já pronta e testada em produção; reimplementá-la em Node para aproveitar familiaridade custa mais e reintroduz risco em código de segurança. O front continua Next/TS — a maior parte do domínio do time é preservada. Condição de reversão registrada: só reconsiderar Node se ficar comprovado que nenhum dos 3 devs consegue manter Python — e mesmo assim portando os padrões, não improvisando.

### Custo honesto de duplicar plataforma com 3 devs — e como minimizar
Duplicar tem custo real: dois deploys, duas esteiras de migração, dois lugares para corrigir um bug de plataforma. Estratégia de minimização, em ordem de retorno:

1. **Fork controlado do `nucleo/` do portal** (banco.py, rbac.py, seguranca.py, redis_cliente.py) como ponto de partida — copiar com proveniência registrada (commit de origem anotado), **não** criar pacote Python compartilhado agora. Com apenas 2 consumidores, um pacote compartilhado cria governança, versionamento e pipeline de publicação que 3 devs não sustentam; a regra é *copiar com rastreio, extrair pacote quando houver um terceiro consumidor*.
2. **Pacote npm leve `@fast/ui-tokens`** (tokens semânticos, cores `#d21217`, fontes Instrument Sans/Lora, primitivos básicos) — este sim compartilhado desde o início, porque é pequeno, estável e é exatamente o que evita a divergência visual que a btime causou. Primitivos maiores (Tabela, Modal, CampoAnexos) são copiados do portal e adaptados.
3. **Convenções idênticas por contrato**: mesma estrutura `dominios/<dominio>/` em 4 camadas (rotas → serviço → repositório → esquemas, prepared statements obrigatórios), migrations numeradas em `docs/banco/`, nomes pt-BR, tokens semânticos. Igualdade de padrão barateia manutenção cruzada: qualquer dev transita entre os dois apps sem reaprender.
4. **SSO em vez de cadastro**: o RH não tem tela de criação de usuário, reset de senha nem 2FA próprios — tudo delegado ao portal (detalhe na seção de integrações). É a maior economia individual da lente.
5. **Sincronização trimestral de padrões**: revisão curta comparando `nucleo/` do RH com o do portal para trazer correções relevantes — drift aceito e administrado, não ignorado.

### Componentes do sistema
- **`rh-api`** (FastAPI): único caminho de escrita no banco; dona de toda regra e autorização; expõe REST para o front e endpoints de integração (Nasajon, ponto, portal).
- **`rh-web`** (Next.js): telas por `features/<dominio>/`, cliente HTTP único com refresh silencioso.
- **Banco `fast_rh`**: schemas `rh` (domínio), `clima` (fisicamente separado, ver LGPD), `audit` (só-INSERT), `rbac`.
- **Jobs**: sincronização de usuários do portal, importação de marcações de ponto, importação de retorno Nasajon, alertas (via n8n).
- **Storage de documentos** (GED): objeto/arquivo com criptografia em repouso, metadados e hash no banco.

### Deploy e método
- Deploy independente do portal (SaveinCloud), ambientes dev/homolog/prod, migrations aplicadas por esteira (nunca à mão em prod).
- Método herdado do portal §7: **protótipo HTML standalone → validação com DP/RH → só então código**; repositório do portal permanece read-only exceto a mudança de SSO autorizada; log de decisões (`decision-logger`) desde o dia 1.

## Modelo de domínio

## Modelo de domínio por módulo

Convenção geral: todo dado com efeito legal/financeiro é **append-only ou versionado com vigência**; toda entidade sensível referencia `colaborador_id` e cai sob RLS; rótulos e domínios em pt-BR.

### Núcleo de identidade e espinha dorsal (Fase 1)
- **usuario_espelho** — réplica read-only mínima do usuário do portal (`portal_usuario_id` PK, nome, e-mail, unidade, status). Sincronizada por evento + reconciliação. Nunca editada localmente.
- **colaborador** — entidade canônica do RH, 1:1 com `usuario_espelho`. Carrega o que é específico de RH: matrícula, **tipo_vinculo** (`clt`, `estagiario`, `aprendiz`, `pj`, `temporario` — desde o dia 1, com regras por tipo), datas de admissão/desligamento, status, retrato/contexto (herdado do Fast-Agente).
- **evento_colaborador** — a **linha do tempo** (espinha dorsal): tabela append-only tipada (`admissao`, `promocao`, `reajuste`, `ocorrencia`, `feedback`, `afastamento`, `ferias`, `advertencia`, `treinamento`, `avaliacao_concluida`, `desligamento`...), com data, payload JSONB validado por tipo e referência à entidade de origem. Todo módulo **publica** eventos aqui; nenhum módulo lê daqui para calcular (é projeção para consulta/relato).
- **ocorrencia**, **feedback_formal** (ciclo 90d com alerta), **acao_aberta** — portadas do modelo Fast-Agente.
- **relacao_gestor** — gestor→liderado **com vigência** (histórico de quem respondia a quem). Base do RBAC "gestor vê equipe" e da 360.
- **lotacao** — colaborador × unidade × centro de custo, com vigência.
- **cargo** — descrição + **CHA estruturado** (insumo dos 40% da 360); **tabela_salarial** versionada com vigência; **historico_posicao_salario** append-only pendurado na ficha.

### Jornadas, escalas e ponto (Fase 2)
- **jornada** (5x2, 6x1, 12x36...) e **escala_colaborador** — versionadas com vigência; **calendario_feriado** por município/unidade.
- **marcacao_importada** — espelho read-only vindo do REP-P homologado (id externo, hash do lote de importação).
- **espelho_ponto** (por colaborador/competência), **ocorrencia_ponto** (atraso, falta, extra), **solicitacao_ajuste** (workflow: solicitação → aprovação do gestor → aplicação, cada transição auditada), **banco_horas** (saldo conciliado com a fonte).

### Afastamentos e férias (Fase 2)
- **afastamento** — tipo, período, documento (atestado = dado de saúde, acesso restrito a DP via chave própria), reflexo automático no espelho de ponto e nos períodos aquisitivos.
- **periodo_aquisitivo** / **periodo_concessivo** — com estado e alerta de vencimento (férias vencida = dobro); **programacao_ferias** (workflow gestor→DP sobre Demandas, fracionamento válido, conflito de agenda da equipe), **aviso/recibo** no GED com ciência.

### Folha e fechamento (Fase 2) — esteira de conferência, não de cálculo
- **competencia_folha** — uma por mês/unidade, máquina de estados: `aberta → coleta → enviada → previa_recebida → conferencia → aprovada → fechada → publicada`.
- **variavel_folha** — consolidação do mês (ponto, faltas, afastamentos, benefícios, comissões do DW), com origem rastreada.
- **remessa_nasajon** / **retorno_nasajon** — payloads/arquivos trocados, com hash e status.
- **divergencia** — apontamentos da conferência (prévia × esperado), com resolução registrada.
- **snapshot_folha** — resultado fechado **imutável**, ligado às versões de regra vigentes na época. Fechado não reabre; correção é evento novo na competência seguinte.
- **holerite** — documento publicado no GED com registro de ciência/download.

### Avaliação 360 (Fase 2/3 — spec btime)
- **modelo_avaliacao** — versionado com vigência: pilares (Dever 30 / CHA 40 / Fit Cultural 30), indicadores, pesos, faixas/flags — tudo administrável pelo RH; mudança vale só para ciclos abertos depois.
- **ciclo_avaliacao** — tipo `experiencia` (45/90d, disparado pela admissão) ou `desempenho` (semestral); estado e feature flag de fase (líder→liderado / +feedback-PDI / 360 completo).
- **avaliacao** (avaliador × avaliado × ciclo × papel), **resposta** (escala 1–5 + contexto), **resultado** (score, faixa, **flag como recomendação + decisão humana com justificativa obrigatória se divergir**), **pdi**, **card_colaborador** (nasce privado; advertências/licenças/notas brutas estruturalmente fora do compartilhável).
- Conteúdo do Fit Cultural: os **9 Valores Fast** com descritores por nível migrados tal e qual de `fast_kb_valores_fast.md`.

### Clima (Fase 2) — schema fisicamente separado `clima`
- **pesquisa**, **pergunta**, **resposta_anonima** — **sem FK para colaborador**; só atributos agregáveis (unidade, ciclo); sem timestamp preciso.
- **participacao** — em schema separado do `clima`, desconectada das respostas: registra apenas *que* respondeu (para cobrança de adesão), nunca *o quê*.
- Agregação exclusivamente no backend com **k-anonimato ≥ 5** por recorte (real com 5 unidades). GRANTs impedem JOIN entre `clima` e identidade.

### Demandas e workflows (Fase 1)
- **demanda** — portada do Fast-Agente: solicitante → executor, tipo, status, prazo, prioridade, anexos; estendida com **etapa_aprovacao** (sequência de aprovadores por tipo).
- **checklist_processo** / **item_checklist** — motor dos processos de **admissão** (documentos, exame, acessos, EPI, contrato de experiência) e **desligamento** (aviso prévio, exame demissional, prazo do art. 477 com contagem regressiva, devoluções, **gatilho de revogação de acesso no portal**, entrevista de desligamento).

### Documentos / GED (Fase 1 básico, Fase 2 completo)
- **documento** — tipo, colaborador, arquivo (storage com criptografia), **hash**, categoria de temporalidade/retenção; **ciencia** — registro de ciência digital (hash do conteúdo, quem, quando) para holerites, políticas, advertências, avisos de férias. Assinatura qualificada (Clicksign/gov.br) só onde exigida, via integração.

### Benefícios (Fase 2/3)
- **beneficio** (regras de elegibilidade por cargo/unidade, versionadas), **adesao**, **dependente** (dado de terceiro — minimização), **movimentacao_operadora** (Fase 3). Descontos sempre via variável enviada à Nasajon.

### SST (Fase 3)
- **aso** (tipo, vencimento, convocação), **cat**, **entrega_epi** (com ciência por hash), catálogo de EPI com CA/validade. Transmissão dos eventos SST fica com a clínica/Nasajon — o sistema monitora.

### Transversais
- **Schema `audit`** — só-INSERT, diff campo a campo com rótulo resolvido, UTC + exibição America/Sao_Paulo; inclui **eventos de leitura** de dado sensível.
- **Schema `rbac`** — cargos/perfis, chaves de permissão, concessões (mecanismo do portal replicado).
- **obrigacao** (Fase 3) — agenda de compliance com competência, prazo, responsável e status.

## Integrações

## Integrações e fontes de verdade

### Mapa de fontes de verdade (quem manda em quê)

| Dado | Fonte de verdade | O Fast RH é... |
|---|---|---|
| Identidade, login, 2FA, cargo-base, unidades | **Portal** | Consumidor (SSO + espelho read-only) |
| Ficha, linha do tempo, ocorrências, feedback, ações | **Fast RH** | Dono |
| Organograma (gestor→liderado), cargos/CHA, tabela salarial | **Fast RH** | Dono |
| Cálculo de folha, encargos, 13º, rescisão, eSocial | **Nasajon** | Orquestrador/conferente (nunca recalcula) |
| Marcações de ponto, AFD/AEJ, validade jurídica | **Solução REP-P homologada** (Nasajon se tiver módulo; senão, mercado) | Consumidor (espelho, workflows de ajuste) |
| Workflow de fechamento, aprovações, snapshot do resultado | **Fast RH** | Dono |
| Avaliação 360, ciclos, resultados, PDI | **Fast RH** | Dono (spec btime) |
| Clima (respostas anônimas, agregados) | **Fast RH** (schema isolado) | Dono |
| Documentos do funcionário + ciência digital | **Fast RH** | Dono (GED) |
| Treinamentos/trilhas | **Sults** (aspiracional) | Registro manual no MVP |
| Vendas/financeiro/margem | **DW SAP (SAP_MIRROR)** | Leitor analítico, fora do caminho crítico |

### Portal (identidade — integração estruturante)
- **SSO**: portal emite token satélite com `aud=fast-rh` (assimétrico); backend do RH valida com a chave pública. Requer uma mudança pequena e autorizada no portal (Fase 0).
- **Sincronização de usuários**: webhook (via n8n) em criação/alteração/desativação de usuário + **reconciliação diária** por API (rede de segurança contra webhook perdido). O espelho local guarda só id, nome, e-mail, unidade, status.
- **Sentido inverso**: no desligamento, o Fast RH chama a API do portal para **revogar o acesso** do usuário (gatilho do checklist de offboarding) — fecha a lacuna de segurança apontada na análise.

### Nasajon (folha/DP — integração mais crítica)
- **Descoberta obrigatória pré-código** (Fase 0): mapear formalmente autenticação, entidades, escrita de variáveis (ponto, faltas, afastamentos, benefícios, comissões), exportação de resultado de folha e holerites, e existência de módulo de ponto homologado.
- **Fluxo mensal**: Fast RH consolida variáveis → envia à Nasajon (API ou arquivo) → importa prévia → concilia e aponta divergências → DP aprova → snapshot imutável → publica holerites no GED.
- **Plano B declarado**: se não houver API, troca de arquivos batch com validação de layout. **Nunca** cálculo próprio — posição fechada.
- eSocial, DCTFWeb e FGTS Digital são transmitidos pela Nasajon/contabilidade; o Fast RH apenas **monitora prazos** no painel de obrigações (Fase 3).

### Ponto (REP-P homologado)
- Preferência 1: módulo de ponto da própria Nasajon, se homologado (menos um fornecedor). Preferência 2: solução de mercado homologada com API e integração nativa com Nasajon.
- O Fast RH consome: marcações/espelho, ocorrências, saldo de banco de horas. O Fast RH hospeda: workflow de ajuste com aprovação e trilha, visão do gestor, alertas.
- Não desenvolver marcação própria **em nenhuma variante, nem como "coletor"** — cai na Portaria 671.

### Sults (treinamento)
- Ressalva registrada no discovery: módulo universidade **sem API** (links manuais). Tratamento: registro manual/importação de treinamentos na ficha no MVP; verificação formal com o fornecedor sobre API antes de prometer integração. Não bloqueia 360 nem histórico.

### SAP/DW (SAP_MIRROR)
- Rebaixado a **enriquecimento analítico read-only**: comissões como variável de folha (se confirmado que estão lá) e cruzamento desempenho comercial × pilar Dever da 360. Dado de RH **não** está nesse DW (Portal §4) — nenhum módulo depende dele.

### n8n (notificações e eventos)
- Canal único de notificação: alertas de ponto, férias vencendo, ASO a vencer, contrato de experiência vencendo, feedback 90d atrasado, etapas de fechamento, transições de demandas.
- Também transporta os webhooks de sincronização portal→RH. O n8n **nunca** carrega dado sensível no payload (só referências/links para o app, que aplica RBAC no acesso).

### Regra geral de resiliência
Toda integração tem: contrato versionado documentado em `docs/integracoes/`, plano B (arquivo/manual), e monitoramento de falha com alerta. Nenhuma integração externa fica no caminho síncrono de uma tela — importações são jobs com estado e log.

## Segurança e LGPD

## Segurança e LGPD

### Autenticação e sessão
- **SSO com o portal**: portal autentica (senha + 2FA já existentes) e emite token satélite assimétrico com `aud=fast-rh` e expiração curta; o backend do RH valida a assinatura com chave pública e abre sessão própria (JWT em cookie httpOnly, refresh silencioso — mesmo padrão do portal).
- Sessão do RH é **independente** da sessão do portal após o login: revogável separadamente, com timeout próprio (mais curto para perfis DP/RH).
- Conta local de emergência (break-glass) apenas para `admin_rh`, com 2FA própria, uso alarmado e auditado — mitiga indisponibilidade do portal sem virar porta dos fundos.

### RBAC — papéis e chaves (no banco do RH)
Mecanismo replicado do portal (`sistema.tem_permissao(uid, chave)` + permissão como dependency na rota). Perfis semeados: `funcionario`, `gestor`, `rh`, `dp`, `admin_rh`, `auditor` (só leitura + acesso ao audit). Chaves por módulo, entre outras:
- `ponto.ver_proprio` / `ponto.ver_equipe` / `ponto.ajustar` / `ponto.aprovar_ajuste`
- `folha.coletar` / `folha.conferir` / `folha.fechar` / `folha.ver_holerite_proprio`
- `avaliacao.responder` / `avaliacao.ver_resultado_equipe` / `avaliacao.configurar` / `avaliacao.decidir_flag`
- `clima.configurar` / `clima.ver_agregados`
- `rh.ver_ficha_completa` / `rh.ver_dado_saude` (atestados — separada da ficha) / `rh.ver_salario` / `rh.auditar`
- `documento.publicar` / `demanda.aprovar.<tipo>`

Regra estrutural: **"gestor vê equipe" deriva de `relacao_gestor` vigente**, nunca de flag manual — quando a relação muda, o acesso muda junto, com histórico.

### RLS por transação
Toda transação abre com `SET LOCAL app.usuario_id / app.unidade_id / app.perfil` (padrão do portal). Políticas por tabela: colaborador vê o próprio; gestor vê liderados vigentes; DP/RH por escopo de unidade; `auditor` só leitura. RLS é a segunda linha — a primeira é a rota autorizar; a terceira é o payload minimizado.

### Auditoria (escrita E leitura)
- Schema `audit` só-INSERT, **sem GRANT de UPDATE/DELETE** ao usuário da aplicação — imutabilidade garantida pelo banco, não por disciplina.
- Diff campo a campo com rótulo legível resolvido; UTC no armazenamento, America/Sao_Paulo explícito na exibição.
- **Trilha de leitura**: acesso a dado sensível (salário, atestado, resultado bruto de avaliação, advertência) gera evento de auditoria de leitura — exigência além do padrão do portal, específica de RH. Relatório de "quem acessou o quê" disponível para `rh.auditar` (Fase 3 como tela; desde a Fase 1 como dado).

### Minimização estrutural
- O front recebe **apenas** o que a rota autoriza; salário, saúde e notas brutas jamais entram no payload de quem não pode ver (padrão §6.4 do portal).
- Card do Colaborador da 360 nasce privado; advertências/licenças/notas brutas **estruturalmente fora** do compartilhável (spec btime).
- Atestados (dado de saúde) têm chave de permissão própria, separada da ficha geral — gestor não vê CID nem documento, só o período de afastamento.
- Dependentes de benefícios (dado de terceiros): coleta mínima, finalidade única.

### Anonimato de clima por desenho de dados
Já detalhado no modelo de domínio: schema `clima` fisicamente separado, respostas sem FK para pessoa, participação desconectada das respostas, k-anonimato ≥ 5 imposto no backend, sem timestamp preciso, GRANTs que impedem JOIN com identidade. Anonimato por **estrutura**, não por política — nem DBA reidentifica por query simples.

### Governança LGPD
- **Tabela de temporalidade** por categoria de dado definida na Fase 0 junto com o modelo (trabalhista: 5–30 anos conforme tipo; candidato: meses); expurgo/anonimização como rotina, com resolução documentada do conflito audit imutável × direito de eliminação (anonimizar a referência, preservar o fato).
- **RIPD** (relatório de impacto) para ponto (se houver biometria no fornecedor) e para clima, antes de implementar.
- Base legal mapeada por tratamento (obrigação legal para folha/ponto/SST; legítimo interesse documentado para avaliação; consentimento onde couber).
- Fase 3: fila de **direitos do titular** (acesso, correção, portabilidade) operada via módulo de Demandas.

### Infraestrutura
- Banco dedicado com credenciais exclusivas; usuário da aplicação sem DDL e sem UPDATE/DELETE no `audit`; segredos só no servidor (secret manager/variáveis — lição do token vazado do Fast-Agente).
- **Backup automático desde o dia 1 com teste de restore periódico** (a lição das 4 perdas de dados); criptografia em repouso para o storage de documentos; TLS em tudo.
- Nada de scripts locais em máquina de funcionário — 100% web + backend central (lição Fast-Agente §2.4).

## Fases

## Roadmap em fases

Princípio de ordenação: primeiro o que tudo depende (identidade, plataforma, espinha dorsal), depois o que opera o mês do DP, por fim o que expande valor. Nenhuma fase começa sem as descobertas da Fase 0 que a destravam.

### Fase 0 — Descobertas e protótipos (pré-código, obrigatória)
Sem código de produção. Entregas:
1. **Mapeamento formal da API Nasajon**: autenticação, entidades expostas, escrita de variáveis de folha, exportação de resultado/holerite, existência de módulo de ponto homologado (REP-P). Se não houver API: especificar layouts de troca de arquivos. Esta descoberta define o desenho de Folha e Ponto.
2. **Cotação de solução de ponto de mercado** (REP-P/REP-C homologado, Portaria 671) caso a Nasajon não cubra — critério nº 1: integração com Nasajon; nº 2: API de marcações/espelho.
3. **Pedido formal à btime** do TO-BE e do código da 360 (Portal §10.4).
4. **Acordo de SSO com o portal**: especificar e aprovar o endpoint de token satélite e o webhook de eventos de usuário (exige autorização expressa para tocar o repo do portal — Portal §7).
5. **Tabela de temporalidade LGPD** por categoria de dado + RIPD de ponto e clima (rascunho).
6. **Protótipos HTML standalone** (método do Portal §7) das telas críticas: linha do tempo do colaborador, cockpit de fechamento, espelho de ponto, avaliação 360 — validados com DP/RH antes de codar.
7. **Validação honesta da proficiência do time em Python** e plano de treinamento (1–2 semanas guiadas pelo código do portal como referência).

*Por que primeiro:* as fontes registram o precedente Sults (módulo sem API descoberto tarde). Desenhar módulo sobre API não mapeada é o maior risco do projeto.

### Fase 1 — Fundação: plataforma + espinha dorsal (≈ 3 meses)
- **Plataforma**: repo, CI, instância PostgreSQL dedicada com backup automático testado, migrations 001+, `nucleo/` portado do portal (banco, rbac, seguranca, redis), **SSO funcionando**, espelho de usuários com sincronização, schema `audit` só-INSERT, RLS por transação, semeadura de perfis/chaves RBAC.
- **Front**: app Next.js com `@fast/ui-tokens` e primitivos copiados do portal.
- **Espinha dorsal de domínio**: `colaborador` (com **tipo de vínculo** desde o dia 1), `evento_colaborador` (linha do tempo), `cargo` com CHA, `posicao`/`historico_salarial` com vigência, `relacao_gestor` com vigência (organograma lógico), lotação por unidade/centro de custo.
- **Primeiro módulo transacional: Demandas** (portado do Fast-Agente) — baixo risco regulatório, exercita workflow + auditoria + notificação n8n de ponta a ponta.
- **GED básico**: repositório de documentos na ficha + ciência digital com hash.
- Ocorrências, feedback formal 90d e ações abertas (modelo Fast-Agente) na linha do tempo.

*Por que esta ordem:* ambas as fontes mandam modelar a linha do tempo cedo "porque todo módulo pendura nela" (Portal §9); organograma e cargos/CHA são pré-requisitos estruturais da 360 e do RBAC "gestor vê equipe" (lacunas de alto impacto); tipo de vínculo é barato agora e caríssimo de retrofitar.

### Fase 2 — Operação do DP (≈ 4–6 meses, entregas incrementais)
Ordem interna respeitando dependências:
1. **Jornadas e escalas** (versionadas) + calendário de feriados por município — pré-requisito do ponto; levantar convenções coletivas do comércio por unidade antes de modelar.
2. **Ponto (consumo)**: importação de marcações/espelho da solução homologada, ocorrências, workflow de ajuste com aprovação e auditoria, banco de horas conciliado, alertas n8n.
3. **Afastamentos e licenças** (junto com ponto — sem afastamento o ponto acusa falta indevida); atestado com acesso restrito a DP.
4. **Férias**: períodos aquisitivos, painel de vencimento com alerta, workflow de programação/aprovação sobre Demandas, aviso/recibo com ciência.
5. **Admissão e desligamento** como workflows/checklists: contrato de experiência amarrado ao ciclo de experiência da 360; desligamento com contagem do prazo do art. 477 e **gatilho de revogação de acesso no portal**.
6. **Fechamento de folha (esteira de conferência)**: coleta de variáveis → remessa Nasajon → conciliação de prévia → aprovação com auditoria → snapshot imutável → **publicação de holerites** com ciência.
7. **Avaliação 360 — Fase 1 btime** (líder→liderado): modelo versionado com vigência, ciclos de Experiência e Desempenho, flags com decisão humana justificada, no design system do portal.
8. **Clima — primeira pesquisa** com anonimato estrutural (schema separado, k≥5).
9. **Benefícios — passo 1**: cadastro, adesões, dependentes; pedidos via Demandas.

*Por que esta ordem:* é o ciclo mensal do DP na ordem em que os dados fluem (escala → ponto → afastamento → variáveis → folha). A 360 entra depois da fundação porque depende de cargo/CHA e organograma; o fechamento entra depois do ponto porque consome suas variáveis.

### Fase 3 — Expansão (contínua)
- **360 completa**: pares + autoavaliação, PDI, Card do Colaborador (Fases 2/3 btime, por feature flag).
- **Benefícios — passo 2**: movimentações para operadoras e conciliação de descontos (sempre via Nasajon).
- **SST**: vencimento de ASO com convocação, CAT, entrega de EPI com ciência; mapear já na Fase 0 quem transmite os eventos SST do eSocial (clínica × Nasajon).
- **Painel de obrigações** (agenda de compliance: eSocial, FGTS Digital, DCTFWeb, marcos de 13º) com status por competência.
- **R&S mínimo**: requisição de vaga com aprovação amarrada ao headcount + registro do aprovado alimentando a admissão; pipeline completo via ATS de mercado se o volume justificar.
- **People analytics**: turnover, absenteísmo, horas extras, custo de pessoal, painel de vencimentos; cruzamento DW SAP (desempenho comercial × Dever) — nunca desempenho × saúde.
- **LGPD operacional**: fila de direitos do titular via Demandas, relatório de acessos a dado sensível a partir do `audit`.
- **Mural/comunicados** com ciência digital (reusa o padrão de hash) — versão mínima.
- Organograma visual e controle de quadro/vagas; painéis de cota aprendiz/PCD; controle de TCE de estagiários.

### Marcos de decisão (gates)
- **Gate Fase 0→1**: contrato SSO aprovado + resposta da Nasajon em mãos. Sem isso, Fase 1 pode começar só na parte de plataforma e espinha dorsal, mas Folha/Ponto não entram em desenho detalhado.
- **Gate Fase 1→2**: SSO em produção, audit e RLS verificados por teste automatizado, backup restaurado com sucesso ao menos uma vez.
- **Gate interno Fase 2**: fechamento de folha só entra em produção após um ciclo completo rodado em paralelo com o processo atual (mês-sombra com conciliação).

## Riscos

## Principais riscos desta proposta e mitigações

### 1. Custo de plataforma duplicada com 3 devs (o risco intrínseco da lente) — ALTO
Mesmo com fork do `nucleo/` e pacote de tokens, o time passa a manter dois apps: dois deploys, dois pipelines, duas bases, dois conjuntos de dependências para atualizar. Estimativa honesta: 20–30% da capacidade do time vai para plataforma/operação em vez de funcionalidade, permanentemente.
**Mitigações:** (a) minimizar superfície — nada de microsserviços, um backend e um front; (b) fork com proveniência + revisão trimestral de drift contra o portal; (c) `@fast/ui-tokens` como único pacote compartilhado no início; (d) a maior economia é de escopo, não de código: **integrar folha e ponto em vez de construir** devolve muito mais capacidade do que qualquer reuso de plataforma; (e) se em 6 meses o custo se provar insustentável, o plano de reversão é migrar para módulo dentro do portal — os padrões idênticos (mesma stack, mesmas convenções, mesmo design system) tornam essa migração viável; é exatamente para preservar essa opção que a proposta proíbe divergir dos padrões.

### 2. Dependência do portal para SSO — ALTO
O login do RH depende de uma mudança no portal (endpoint de token satélite) que exige autorização expressa e desenvolvimento no repo do portal. Se atrasar, trava a Fase 1; se o portal cair, ninguém loga no RH.
**Mitigações:** negociar e especificar o contrato SSO na Fase 0 como pré-condição de gate; contrato de token versionado e estável (mudanças só retrocompatíveis); sessão própria do RH após o login (queda do portal não derruba sessões ativas, só novos logins); conta break-glass local para `admin_rh` com 2FA, uso auditado e alarme automático.

### 3. API da Nasajon insuficiente ou inexistente — ALTO
Todo o desenho de Folha/Fechamento e possivelmente Ponto assume que a Nasajon expõe algo. O precedente Sults (módulo sem API, links manuais) mostra que a suposição pode falhar.
**Mitigações:** descoberta formal na Fase 0 **antes** de desenhar o módulo em detalhe; plano B declarado (troca de arquivos batch com validação de layout); no pior caso, a esteira de fechamento degrada para checklist + conferência manual assistida — ainda entrega valor (trilha, aprovação, snapshot, holerites) sem automação de ponta a ponta. O que nunca acontece: cálculo próprio.

### 4. Sincronização de identidade portal↔RH — MÉDIO
Espelho de usuários pode divergir (webhook perdido, usuário desativado no portal mas ativo no RH, ou o inverso), criando acesso indevido ou bloqueio indevido.
**Mitigações:** reconciliação diária completa por API além dos webhooks; desativação no portal propaga como bloqueio imediato de sessão no RH (checagem de status no refresh do token); relatório de divergências com alerta; o desligamento no RH dispara a revogação no portal (gatilho do offboarding), fechando o ciclo nos dois sentidos.

### 5. Drift do fork do `nucleo/` e do design system — MÉDIO
Copiar em vez de compartilhar pacote significa que correções de segurança no portal (ex.: bug no RBAC ou no JWT) não chegam automaticamente ao RH.
**Mitigações:** arquivo `PROVENIENCIA.md` mapeando cada módulo copiado à versão de origem; revisão trimestral de diff; canal combinado com o time do portal para propagar correções de segurança na hora, não no trimestre; extrair pacote compartilhado de verdade quando (e só quando) surgir um terceiro consumidor.

### 6. Time sem proficiência em Python/FastAPI — MÉDIO
A proposta assume que aprender o padrão pronto do portal custa menos que reconstruir RLS/RBAC/audit em Node. Se a proficiência real for zero e a curva for maior que o previsto, a Fase 1 estica.
**Mitigações:** validação honesta na Fase 0 (não retórica); primeiras 2–3 semanas pareadas sobre o código do portal como material didático; o primeiro domínio (Demandas) é deliberadamente o mais simples para servir de treino; condição de reversão explícita — só reconsiderar Node se ficar comprovado que ninguém consegue manter Python, e mesmo assim portando os padrões, não improvisando.

### 7. Fornecedor de ponto (Portaria 671) — MÉDIO
Se a Nasajon não tiver módulo homologado e a solução de mercado escolhida tiver API fraca, o módulo de ponto vira importação manual de arquivos e o workflow de ajuste perde fluidez. Biometria (se a solução usar) adiciona RIPD e base legal.
**Mitigações:** critério de compra definido na Fase 0 (integração Nasajon + API de espelho); RIPD antes da implantação; cláusula contratual de exportação de dados (AFD/AEJ e histórico) para não ficar refém do fornecedor.

### 8. Reidentificação no clima — MÉDIO
Mesmo com anonimato estrutural, recortes pequenos (equipe de 4 pessoas numa unidade) permitem dedução.
**Mitigações:** k≥5 imposto no backend (recorte que não atinge o mínimo não é exibido, nem para `admin_rh`); sem timestamps precisos nem metadados correlacionáveis; revisão do desenho de cada pesquisa antes da publicação; teste de reidentificação como item do checklist de release do módulo.

### 9. Escopo de RH é um oceano — ALTO
As lacunas mapeadas (férias, benefícios, SST, admissão/rescisão, obrigações...) somam mais de uma dúzia de módulos. Com 3 devs, tentar tudo cedo afunda o projeto.
**Mitigações:** disciplina de fases com gates; regra de decisão fixa — *regulado se integra, processo se constrói*; cada módulo da Fase 2 entra em produção individualmente (entrega incremental), nunca "big bang"; fechamento de folha roda um mês-sombra antes de assumir.

### 10. TO-BE da btime não obtido — BAIXO
Se a btime não entregar o TO-BE/código, perde-se a spec detalhada da 360.
**Mitigações:** o essencial do modelo já está registrado na ficha do portal (§5): pilares, pesos, faixas, ciclos, flags, LGPD by design. Dá para reconstruir a spec a partir disso + os descritores dos 9 Valores do Fast-Agente, com custo de re-elaboração moderado. Pedir formalmente na Fase 0 de qualquer forma.
