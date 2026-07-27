# Avaliação 360 (domínio `rh_avaliacao`) — esqueleto btime sob revisão crítica: ciclos de Experiência (45/90d) e Desempenho, modelo versionado com vigência, flag com decisão humana obrigatória, rollout líder→liderado → feedback/PDI/Card → 360 completa

> Revisado em 2026-07-24 (v2) após decisões do usuário. Substitui a versão gerada por análise
> multi-agente sobre as fontes "Fast-RH — Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md".
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

**Principais mudanças nesta revisão (v1→v2):** (a) o material da btime deixa de ser "modelo adotado" e vira **ESQUELETO base sob revisão crítica** — o usuário apontou superficialidade e erros estruturais, TEM o código-fonte da btime e vai fornecê-lo quando o design do módulo começar; **a primeira tarefa do design é a auditoria desse código/spec**, com lista do que aproveitar vs corrigir; (b) plataforma: o módulo vive no **app próprio da Fase A** (Next.js + TypeScript + Node.js, PostgreSQL dedicado na SaveinCloud) — nada é "herdado" do portal (RBAC, RLS, audit e versionamento são implementados neste stack; referências a migrations/domínios do portal foram removidas); (c) **sem conector Nasajon**: o pilar Dever passa a consumir os módulos internos (ponto próprio via REP-P contratado, afastamentos, ocorrências da linha do tempo), com plano B manual; (d) papéis passam a ser os 5 papéis próprios da Fase A (funcionário/gestor/rh/dp/admin). O restante do desenho **permanece**: versionamento de modelo com vigência ("fechado não reabre"), flag como recomendação com decisão humana registrada, ciclos de experiência 45/90d amarrados ao contrato, ciência digital com hash, LGPD by design.

**Fase sugerida:** MVP ("360 v1": líder→liderado, ciclos de Experiência e Desempenho, modelo versionado, flag com decisão humana, ciência digital) como **último item da Fase 2** do roadmap v2 — após admissão digital, afastamentos, ponto com REP-P, férias, desligamento e assinatura eletrônica — atrás de feature flag; critério de pronto: primeiro ciclo de Experiência concluído com decisão humana registrada. Evolução (feedback/PDI/Card privado, 360 completa com pares e autoavaliação, calibração, analytics, IA de apoio) na Fase 3. **Primeira tarefa do design do módulo (antes de qualquer protótipo): pedir ao usuário o código/spec da btime e auditá-los** — ver Funcionalidades, item 0. Antecipar para a Fase 1 o trabalho de CONTEÚDO (estruturar CHA nas descrições de cargo das 5 unidades), que está no caminho crítico e não é software. Método inalterado: protótipo HTML standalone (tokens visuais do portal, papel simulado) validado com DP/RH antes de qualquer código.

## Objetivo

Transformar a avaliação de pessoas da Fast em processo sistematizado, auditável e juridicamente defensável. O ponto de partida é o esqueleto btime — 3 pilares (Dever: indicadores objetivos de conduta/assiduidade; CHA do cargo: conhecimentos, habilidades e atitudes da descrição de cargo vigente; Fit Cultural: os 9 Valores Fast com descritores 1–5), pesos 30/40/30, consolidação em faixas com flag de recomendação e ciclos de Experiência (45/90d) e Desempenho — mas **tratado como hipótese de trabalho, não como verdade**: pilares, pesos, faixas, réguas e ciclos serão revistos criticamente na auditoria do código/spec btime que abre o design do módulo, e tudo isso é dado administrável pelo RH com versionamento e vigência — sem depender de dev — de modo que corrigir o modelo é criar nova versão, nunca reescrever software. Garantias inegociáveis que permanecem: TODA consequência (desligamento no contrato de experiência, plano de recuperação, desenvolvimento para liderança, sucessão) é **decisão humana registrada**, com justificativa obrigatória quando divergir da flag; o resultado de cada ciclo fica para sempre ligado à versão do modelo vigente na época; o módulo alimenta a linha do tempo do colaborador (`evento_colaborador`) e o processo de desligamento; e nasce LGPD by design — nota bruta é dado sensível com trilha de leitura, Card do Colaborador nasce privado.

## Funcionalidades

### Item 0 — Auditoria do material btime (primeira tarefa do design, antes do protótipo)

- **Pedir ao usuário o código-fonte e a spec da btime no início do design do módulo** (o usuário confirmou que os tem e vai fornecê-los).
- Auditar criticamente: os 3 pilares e os pesos 30/40/30; os indicadores do Dever e suas réguas de conversão; a estrutura do CHA; os descritores 1–5 do Fit Cultural; as faixas de resultado e flags (0–40 / 40–60 / 60–80 / 80–100); a mecânica dos ciclos 45/90d e semestral; regras escondidas no código (nota eliminatória, arredondamento, tratamento de indicador sem dado).
- **Entregável: lista "aproveitar vs corrigir"**, com cada decisão registrada no log de decisões — o usuário já apontou que o material é superficial e tem erros estruturais, então a auditoria deve assumir postura cética, não confirmatória.
- Os defaults descritos abaixo (pesos, faixas, flags) valem como **default de partida** até a auditoria confirmá-los ou substituí-los.

### MVP — "360 v1": líder→liderado (roadmap v2, Fase 2, último item, atrás de feature flag)

**1. Administração do modelo de avaliação (RH, sem dev)**
- CRUD de `modelo_avaliacao_versao` com ciclo de vida rascunho → ativa → encerrada — mesmo padrão transversal de versionamento com vigência da arquitetura v2 (o mesmo usado em rubricas e tabelas legais da folha própria), implementado no stack Node/Postgres do app.
- Configurável pelo RH: pilares e pesos (default de partida btime: Dever 30 / CHA 40 / Fit 30 — **sujeito à auditoria do item 0**), indicadores por pilar, escala (1–5), faixas de resultado e flags (default de partida: 0–40% desligar/recuperar · 40–60% atenção · 60–80% desenvolver p/ liderança · 80–100% sucessão — **idem**), periodicidade dos ciclos, prazos de resposta.
- Regra de vigência inegociável: versão ativada **não é mais editável**; mudança gera nova versão que vale **somente para ciclos abertos depois dela**; ciclo aberto congela a versão que usará. Sem recálculo retroativo, nunca.
- Validação na ativação: soma dos pesos = 100%, faixas contíguas cobrindo 0–100%, todo pilar com ≥1 indicador.

**2. Catálogo do Fit Cultural — 9 Valores Fast**
- Migração dos 9 valores (resultado, velocidade, determinação, desenvolvimento, disciplina, resiliência, colaboração, comunicação, reconhecimento) com os descritores por nível 1–5 de `fast_kb_valores_fast.md` — exibidos ao avaliador como régua na tela de resposta. A auditoria btime valida se os descritores estão completos e utilizáveis como régua (ou se precisam de reescrita com o RH).
- Descritores versionados junto com o modelo (mudança de descritor = nova versão).

**3. Pilar CHA amarrado ao cargo**
- Os indicadores do pilar CHA derivam do **CHA estruturado da `cargo_versao` vigente** do avaliado na abertura do ciclo — não são digitados por ciclo. Cargo sem CHA estruturado bloqueia a geração da avaliação com pendência visível ao RH.

**4. Pilar Dever com origem rastreada (fontes internas — sem Nasajon)**
- Indicadores objetivos alimentados pelos **módulos do próprio sistema**: assiduidade e atrasos do módulo de ponto (espelho fechado da competência, marcações do REP-P contratado — Pontomais candidata líder); licenças/afastamentos do módulo de férias e afastamentos (como ausência computável, **nunca** CID ou natureza médica); advertências e ocorrências da linha do tempo (`evento_colaborador`).
- Enquanto os módulos-fonte não estiverem maduros para a competência avaliada (ou durante a transição, em que dados históricos vivem só no Nasajon), lançamento **manual pelo DP com origem marcada `manual` e justificativa** — nunca digitação silenciosa. Muda o transporte, não a arquitetura.
- Regra de conversão indicador→nota 1–5 parametrizada no modelo (ex.: faixas de faltas no período), calculada **exclusivamente no backend**.

**5. Ciclos**
- **Experiência**: gerados automaticamente na admissão (integração com `processo_admissao`), marcos 45d e 90d amarrados às datas do contrato de experiência; alerta antecipado (n8n/WhatsApp) para gestor e DP com antecedência parametrizável (default sugerido: 10 dias antes de cada marco) — a decisão precisa sair **antes do vencimento do contrato**.
- **Desempenho**: semestral, colaborador entra no ciclo desde o dia 1 da admissão; abertura manual pelo RH sobre calendário planejado.
- Geração das avaliações do ciclo por `relacao_gestor` **vigente na abertura** (nunca flag manual de "é gestor"); painel de exceções (liderado sem gestor vigente, gestor desligado no meio do ciclo) com resolução obrigatória.
- Filtro por `tipo_vinculo`: quais vínculos entram em cada tipo de ciclo é parâmetro do modelo (pergunta aberta ao RH).

**6. Execução da avaliação (líder→liderado)**
- Questionário com os tokens visuais do portal (claro/escuro, mobile-friendly — prototipado em HTML standalone antes do código): nota 1–5 por indicador com descritor visível, comentário opcional por indicador, comentário geral.
- Salvamento parcial (rascunho); envio explícito; **após envio, respostas imutáveis** — correção é solicitação ao RH que reabre por evento auditado, nunca UPDATE silencioso.
- Prazo por avaliação, lembretes via n8n/WhatsApp (sem dado sensível no payload), painel "minhas avaliações pendentes" para o gestor.

**7. Consolidação e flag**
- Cálculo no backend (API dona única): nota por pilar → resultado final % → faixa → `flag_recomendacao`. Resultado gravado imutável com referência à `modelo_avaliacao_versao` usada.
- Flag é **recomendação, nunca ação automática**: nenhum status de colaborador muda por flag.

**8. Decisão humana registrada**
- Para toda flag, registro obrigatório de `decisao_humana`: decisor, decisão tomada, se diverge da flag, **justificativa obrigatória se divergir** (e recomendada sempre), data. Transição auditada.
- Decisão de desligamento **não executa nada aqui**: referencia/dispara o `processo_desligamento` (módulo próprio), que registra a decisão vs a flag. (Obrigações fiscais do desligamento — S-2299 etc. — seguem a trilha da folha própria: Nasajon oficial durante a sombra, transmissor próprio do domínio `fiscal/` após o cutover.)

**9. Devolutiva e ciência digital**
- Registro da devolutiva (data, participantes, resumo) e **ciência do colaborador com hash** (padrão GED: `documento` + `ciencia` com SHA-256 do conteúdo no momento) — substitui assinatura física; suficiente para ato interno de RH. Assinatura eletrônica de mercado (Clicksign/ZapSign/D4Sign, Fase 2) só onde política ou norma específica exigir.
- Colaborador vê o que a política liberar (faixa + devolutiva no mínimo; exibição de nota bruta ao próprio avaliado é pergunta aberta).

**10. Linha do tempo e painéis**
- Ao concluir: `evento_colaborador` tipo "avaliação concluída" (payload JSONB validado: ciclo, faixa, flag, decisão) — projeção para consulta, nunca base de cálculo.
- Painel RH: status por ciclo (pendentes/enviadas/atrasadas/consolidadas), funil de decisões pendentes, alerta de experiência vencendo; visão do gestor restrita à equipe (RLS via SET LOCAL onde couber; senão, autorização no repositório coberta pela matriz de testes do CI).

**11. Auditoria (fundação, não retrofit — implementada no stack próprio)**
- Trilha de **alteração**: abertura/encerramento de ciclo, ativação de versão de modelo, envio, reabertura, consolidação, decisão — diff com rótulo resolvido, UTC + America/Sao_Paulo.
- Trilha de **leitura**: todo acesso a nota bruta/resultado individual grava quem viu, desde o primeiro dia do módulo (tela de consulta da trilha só na Fase 3).
- Ambas só-INSERT garantidas por GRANT no Postgres dedicado — nada disso vem "de graça": é implementação nossa em Node/Postgres, conforme arquitetura v2.

### Evolução — Fase 3 (feedback/PDI/Card e 360 completa)

- **Feedback estruturado pós-ciclo** integrado ao `feedback_formal` (cadência 90d) da espinha dorsal — a devolutiva do ciclo conta como feedback formal e zera o alerta de cadência.
- **PDI**: objetivos e ações com prazo/status derivados dos pilares fracos; ações ligadas ao motor de `acao_aberta`; treinamentos do Sults como evidência de conclusão **somente se a API for verificada** (nenhuma integração assumida sem contrato validado); até lá, registro manual.
- **Card do Colaborador**: projeção consolidada (histórico de faixas, evolução por pilar, PDI) — **nasce privado**; abertura por permissão específica; advertências, licenças, notas brutas e decisão de desligamento **estruturalmente fora** do que é compartilhável (ausência no payload, não máscara).
- **360 completa**: autoavaliação e avaliação por pares (e subordinados, se o RH quiser), com peso por papel de avaliador parametrizado no modelo; **agregação de pares com mínimo de respondentes** (default ≥3) antes de exibir média, para não expor avaliador individual; seleção de pares por regra (mesma lotação/projeto) com aprovação do RH.
- **Calibração**: sessão de comitê por unidade/cargo com registro de ajuste justificado (evento novo, nunca sobrescrita da nota do avaliador).
- **Analytics**: distribuição de faixas por unidade/cargo/ciclo, evolução entre ciclos, cruzamento **read-only** com o DW SAP (resultado comercial × pilar Dever — analítico, jamais insumo de cálculo; acesso via MCP do SAP, o conector FastAPI citado nas fontes); vedado cruzar desempenho × dado de saúde.
- **IA (fase tardia, opcional)**: resumo do histórico do avaliado (ocorrências, feedbacks, eventos) para preparar o avaliador — "conversa, nunca calcula, nunca sugere nota".

## Entidades de dados

Convenções da arquitetura v2: PostgreSQL **dedicado** na SaveinCloud, pool `app_rh`; parametrizadores com versão+vigência (rascunho→ativa→encerrada); resultados imutáveis ligados à versão; datas em UTC; autorização por papel validada no backend, RLS via SET LOCAL onde couber; audit só-INSERT por GRANT com duas trilhas. Toda a modelagem abaixo é hipótese até a auditoria btime (item 0) — o esqueleto de entidades foi desenhado para absorver correções via nova versão de modelo, não via migração destrutiva.

### Parametrização (versionada)
- **`modelo_avaliacao_versao`** — nome, status (rascunho/ativa/encerrada), vigência início/fim, responsável, escala, prazo_resposta_default, tipos_vinculo_abrangidos, params de conversão do Dever. Imutável após ativação; ativação encerra a anterior.
  - **`pilar_modelo`** (filha) — tipo (dever/cha/fit_cultural), peso % (soma = 100).
  - **`indicador_modelo`** (filha de pilar) — rótulo, peso relativo, **origem**: `ponto` (assiduidade/atraso, do espelho fechado), `afastamento` (licenças como ausência computável), `ocorrencia_interna` (advertências, da linha do tempo), `manual_dp`, `cargo_cha` (deriva da cargo_versao do avaliado), `valor_fast` (referencia o catálogo).
  - **`faixa_modelo`** (filha) — pct_min, pct_max, rótulo, flag associada (desligar_recuperar / atencao / desenvolver_lideranca / sucessao); contíguas, cobrem 0–100.
- **`valor_fast`** + **`descritor_valor`** — os 9 valores e descritores por nível 1–5, migrados de `fast_kb_valores_fast.md`; versionados junto ao modelo.

### Execução
- **`ciclo`** — tipo (experiencia_45 / experiencia_90 / desempenho), período, **modelo_avaliacao_versao_id congelado na abertura**, status (planejado/aberto/em_consolidacao/concluido/cancelado), datas de abertura/fechamento. Ciclo de experiência referencia `processo_admissao` (datas do contrato).
- **`avaliacao`** — ciclo_id, avaliado_id (colaborador), avaliador_id, **papel_avaliador** (gestor no MVP; par/auto/subordinado na Fase 3 — modelo 360-nativo desde o início), status (pendente/em_andamento/enviada/expirada/reaberta), prazo, enviado_em. Gerada por `relacao_gestor` vigente na abertura. Única por (ciclo, avaliado, avaliador, papel).
- **`resposta_item`** — avaliacao_id, indicador_modelo_id, nota 1–5, comentário; editável só em rascunho; imutável após envio (reabertura = evento auditado).
- **`insumo_dever`** — avaliado × ciclo × indicador: valor bruto (nº faltas etc.), **origem interna rastreada** (módulo de ponto / afastamentos / evento_colaborador) ou `manual` com justificativa, referência ao registro de origem; base rastreável da nota do pilar Dever. Sem staging Nasajon: as fontes são os módulos do próprio sistema.

### Resultado e decisão
- **`resultado_consolidado`** — avaliado × ciclo: nota por pilar, resultado_final_pct, faixa_modelo_id, calculado_em; **imutável**; recálculo legítimo gera nova linha com motivo, a anterior fica marcada superada (nunca UPDATE).
- **`flag_recomendacao`** — resultado_id, flag, gerada_em (automática, 1:1 com o resultado).
- **`decisao_humana`** — flag_id, decisor_id, decisao, diverge (bool), **justificativa (NOT NULL quando diverge)**, decidido_em; referenciada por `processo_desligamento` quando a decisão for desligar.
- **`devolutiva`** — resultado_id, data, participantes, resumo; gera `feedback_formal` na espinha dorsal (zera cadência 90d).
- Ciência: reutiliza **`documento`** + **`ciencia`** do GED (hash SHA-256 do resultado apresentado no momento da ciência).

### Evolução (Fase 3)
- **`pdi`** + **`acao_pdi`** — avaliado, ciclo de origem, objetivo por pilar, ações com prazo/status; ação pode referenciar `acao_aberta` e treinamento (Sults, se API confirmada).
- **`card_colaborador`** — projeção privada (faixas históricas, evolução por pilar, PDI); visibilidade por permissão específica; dados sensíveis estruturalmente ausentes.
- **`calibracao`** — ciclo × comitê: ajuste com justificativa como evento novo.

### Relações externas
1:N de `colaborador` para avaliações/resultados; `relacao_gestor` (geração e escopo de equipe); `cargo_versao` (CHA); `processo_admissao` (marcos 45/90); `processo_desligamento` (consome decisão); `evento_colaborador` (projeção "avaliação concluída" e fonte de advertências); espelho de ponto e afastamentos (insumos Dever); `audit` (duas trilhas).

## Papéis e permissões

RBAC **próprio da Fase A** — autenticação e cadastro do app, papéis `funcionario` / `gestor` / `rh` / `dp` / `admin`, 2FA obrigatório para rh/dp/admin (arquitetura v2). Mapeamento com o RBAC do portal fica para a Fase B (as alegações das fontes sobre "herdar RBAC do portal" podem descrever o MCP e serão re-verificadas lá — não contar com elas agora).

| Papel | Vê | Faz |
|---|---|---|
| **funcionario (avaliado)** | Suas avaliações concluídas conforme política de abertura (mínimo: faixa + devolutiva; nota bruta ao próprio titular = pergunta aberta); seu PDI (Fase 3) | Dá ciência digital; responde autoavaliação (só Fase 3); solicita acesso LGPD via fila de demandas |
| **gestor (por `relacao_gestor` vigente, nunca flag manual)** | Avaliações pendentes dos liderados diretos; resultado consolidado e flag da própria equipe; histórico de faixas da equipe | Responde avaliação líder→liderado; registra devolutiva; participa da decisão humana (registro formal = rh, ver abaixo) |
| **dp** | Status dos ciclos de experiência e decisões tomadas (para operar o contrato de experiência e o desligamento no prazo); **não vê notas brutas por padrão** | Lança insumo manual do pilar Dever com justificativa; recebe alerta de marco 45/90 |
| **rh** | Tudo do módulo, todas as unidades; trilhas do audit em modo leitura (`rh.auditar`) | Administra modelos/versões (`avaliacao.configurar`), abre/fecha ciclos (`avaliacao.ciclo.gerenciar`), resolve exceções de geração, reabre avaliação por evento auditado, **registra a decisão humana** (`avaliacao.decidir`), gerencia Card/PDI (Fase 3) |
| **admin (TI)** | Acesso técnico de manutenção, nominal e logado — acesso a nota bruta **também gera trilha de leitura** | Feature flag, operação técnica; nunca opera o processo de avaliação |

**Chaves de permissão do módulo:** `avaliacao.configurar`, `avaliacao.ciclo.gerenciar`, `avaliacao.responder`, `avaliacao.resultado.ver_proprio`, `avaliacao.resultado.ver_equipe`, `avaliacao.resultado.ver_todos`, `avaliacao.nota_bruta.ver` (sensível — grava trilha de leitura; os papéis que a recebem já têm 2FA), `avaliacao.decidir`, `avaliacao.card.ver` (Fase 3), `avaliacao.pdi.gerenciar` (Fase 3).

**Regras duras:**
- Papel e permissão validados **no backend** em toda rota/serviço (nunca só na UI); payload minimizado — nota bruta, flag "desligar/recuperar" e justificativa de decisão **não entram no JSON** de quem não pode ver (ausência, não máscara).
- "Gestor vê equipe" deriva exclusivamente de `relacao_gestor` vigente — imposto por RLS via SET LOCAL onde couber; onde não couber, autorização no repositório coberta por teste.
- Matriz de testes de autorização papel × recurso no CI (padrão da arquitetura v2) cobre: gestor não vê equipe de outro gestor; funcionário não vê flag de colega; dp não vê nota bruta; par (Fase 3) não vê resposta de outro par.
- Card do Colaborador (Fase 3) nasce privado; toda abertura é permissão explícita e auditada.

## Integrações

Todas internas ao app ou via domínio `integracoes/`, nunca no caminho síncrono de tela. **Não existe conector Nasajon neste módulo** (decisão v2: folha própria, Nasajon sem API pública — ele resta apenas como sombra da folha e referência funcional, sem papel aqui).

**Consome:**
- **Módulo de ponto (`rh_ponto`)** — assiduidade e atrasos do espelho fechado da competência (marcações originadas no REP-P contratado; Pontomais candidata líder) → `insumo_dever` com referência ao registro de origem. **Plano B embutido**: enquanto o módulo de ponto não cobrir a competência avaliada, lançamento manual pelo DP com justificativa (origem marcada) — muda o transporte, não a arquitetura.
- **Férias e afastamentos (`rh_ferias_afastamentos`)** — licenças como ausência computável segundo regra parametrizada; **nunca CID ou natureza médica** (cifrados no domínio de afastamentos, com chave de permissão própria).
- **`evento_colaborador` (espinha dorsal)** — advertências e ocorrências disciplinares como insumo do Dever, com referência ao evento.
- **`processo_admissao` (rh_admissao_desligamento)** — datas do contrato de experiência disparam a criação automática dos ciclos 45/90d.
- **`cargo_versao` (rh_colaboradores)** — CHA estruturado vigente do avaliado alimenta o pilar CHA.
- **`relacao_gestor` (rh_colaboradores)** — define avaliador×avaliado na abertura do ciclo e o escopo de visão de equipe.
- **Sults (Fase 3, condicional)** — treinamentos concluídos como evidência de ação de PDI, **somente se a API for verificada**; até lá, registro manual (regra: nenhuma integração assumida sem contrato validado).
- **DW SAP (Fase 3, read-only, analítico, via MCP do SAP)** — cruzamento resultado comercial × pilar Dever em relatório gerencial; **jamais insumo de cálculo**; nenhuma funcionalidade do módulo depende do DW.

**Envia:**
- **`evento_colaborador`** — "avaliação concluída" (ciclo, faixa, flag, decisão) na linha do tempo; projeção, nunca base de cálculo.
- **`processo_desligamento`** — decisão humana "desligar" referencia/abre o processo; o desligamento registra decisão vs flag (obrigações fiscais na trilha da folha: Nasajon oficial durante a sombra, transmissor próprio após cutover).
- **`feedback_formal`** — devolutiva registrada conta como feedback formal e zera o alerta de cadência 90d.
- **GED (`documento` + `ciencia`)** — resultado apresentado ao colaborador com hash SHA-256 no momento da ciência.
- **n8n + WhatsApp Cloud API / e-mail transacional (dispara, nunca decide/armazena)** — notificações: ciclo aberto, avaliação pendente/atrasada, marco 45/90 se aproximando (gestor + dp), decisão pendente, devolutiva pendente. **Sem dado sensível no payload** — só referências (link com autenticação no acesso); nunca "fulano teve flag desligar" em e-mail/mensagem.
- **Portal corporativo** — nada na Fase A (app separado, banco dedicado, usuários próprios). Incorporação ao portal é escopo da Fase B da plataforma, não deste módulo.

## Regulatório

**CLT — contrato de experiência (arts. 443, 445 §ún., 451):**
- Máximo 90 dias, uma única prorrogação; passado o prazo sem decisão, o contrato vira indeterminado. → O ciclo de Experiência é **amarrado às datas reais do contrato** (via `processo_admissao`), com alerta antecipado parametrizável para gestor e dp, e o painel do RH destaca decisões pendentes com prazo legal. O sistema não decide — garante que a decisão humana ocorra e fique registrada **antes do vencimento**.
- Avaliação documentada + ciência com hash + decisão justificada = **prova defensável** em disputa sobre a dispensa no período de experiência (afasta alegação de arbitrariedade/discriminação).

**LGPD:**
- Avaliação, nota bruta, flag e justificativa de decisão são dados pessoais de tratamento sensível no contexto interno. Desenho: **minimização no schema e no payload** (quem não pode ver não recebe — ausência, não máscara); **trilha de leitura** de nota bruta/resultado individual desde o dia 1 do módulo (arts. 46/47 — segurança e prestação de contas); Card do Colaborador **privado por padrão** com advertências, licenças e decisão de desligamento estruturalmente fora do compartilhável (conceito do esqueleto btime, mantido).
- **Base legal** mapeada por tratamento: execução do contrato de trabalho + legítimo interesse com teste de balanceamento documentado (gestão de desempenho); registro na tabela de bases legais da Fase 0.
- **Art. 20 (decisão automatizada):** a flag é recomendação e a decisão é humana e justificada **por construção** — o sistema já nasce em conformidade com o direito de revisão; nenhum status muda por algoritmo.
- **Direitos do titular:** acesso via fila LGPD de demandas; conflito imutabilidade × eliminação resolvido por **anonimização no domínio**, nunca UPDATE/DELETE no audit.
- **Temporalidade:** retenção mínima recomendada = vínculo + prazo prescricional trabalhista (2 anos após extinção para ajuizar, alcance de 5 anos — CF art. 7º XXIX); prazo final entra na tabela de temporalidade por categoria de dado (Fase 0) com validação do DPO.

**Ciência digital com hash:**
- `ciencia` grava quem, quando e o **SHA-256 do conteúdo no momento** (padrão GED), com trilha no audit — assinatura eletrônica com garantia de integridade e autoria nos moldes da MP 2.200-2/2001, art. 10 §2º (validade por acordo entre as partes), suficiente para ato interno de RH; assinatura qualificada só via plataforma contratada (Clicksign/ZapSign/D4Sign), onde norma específica exigir.

**Auditoria e imutabilidade (defensabilidade trabalhista):**
- Resultado ligado à `modelo_avaliacao_versao` da época — regra mudada depois **não recalcula** ciclo fechado ("fechado não reabre; correção é evento novo").
- Audit só-INSERT por GRANT (implementado no Postgres dedicado, arquitetura v2) cobre toda transição (abertura, envio, reabertura justificada, consolidação, decisão); UTC no armazenamento, America/Sao_Paulo explícito na exibição.
- **Vedação registrada:** cruzamento desempenho × dado de saúde é proibido em qualquer relatório (o pilar Dever consome "licenças" como ausência computável segundo regra parametrizada — nunca CID ou natureza médica).

## Dependências

Depende de: (1) **auditoria do código/spec btime** — primeira tarefa do design do módulo; o usuário fornece o material quando o design começar; entregável "aproveitar vs corrigir" registrado no log de decisões; (2) Fase 1 completa — autenticação/cadastro próprios com os 5 papéis, `colaborador` com tipo_vinculo, `relacao_gestor` com vigência (base da geração de avaliações e do escopo de equipe), `cargo` + `cargo_versao` com CHA ESTRUTURADO (trabalho de conteúdo antecipado para a Fase 1 — insumo do pilar CHA), `evento_colaborador`, GED mínimo (documento + ciência com hash), audit em duas trilhas, RBAC próprio com chaves avaliacao.*; (3) mecanismo transversal de versionamento com vigência da arquitetura v2 (compartilhado com rubricas/tabelas legais da folha); (4) infra de feature flag por módulo; (5) admissão digital (`processo_admissao`, Fase 2 item 1 — construir vs contratar Gupy/Unico decidido na Fase 0) para amarrar os marcos 45/90d ao contrato de experiência; (6) módulo de ponto (Fase 2) para os insumos de assiduidade do pilar Dever — com plano B manual embutido, portanto dependência desejável, não bloqueante; (7) `processo_desligamento` (Fase 2) para consumir a decisão "desligar"; (8) n8n + WhatsApp Cloud API para notificações. Sults e DW SAP são dependências apenas da evolução (Fase 3) e condicionais à verificação de API/contrato.

## Riscos

1) **CHA não estruturado a tempo**: o pilar de maior peso depende de descrições de cargo com CHA para todos os cargos das 5 unidades — trabalho de conteúdo do RH, não de dev; se não começar na Fase 1, o módulo chega pronto e inutilizável. 2) **Auditoria btime revelar mais problemas que o previsto**: o usuário já apontou superficialidade e erros estruturais; o esqueleto (pesos, faixas, réguas) pode exigir redesenho maior. Mitigação: auditoria é a primeira tarefa do design, com timebox, e o modelo é dado versionado — corrigir é criar versão nova de parâmetro, não reescrever código; risco residual: adoção acrítica dos defaults pelo RH — exigir que cada parâmetro default seja validado (ou substituído) com registro no log de decisões antes do primeiro ciclo real. 3) **Lacuna temporal dentro da Fase 2**: a admissão digital é o item 1 e a 360 é o último item — colaboradores admitidos nesse intervalo terão contrato de experiência SEM ciclo 45/90 no sistema; mitigar criando os ciclos retroativamente na ativação do módulo ou antecipando um mini-fluxo de avaliação de experiência (só o marco 45/90 com decisão registrada) junto com a admissão digital. 4) **Flag tratada como decisão automática na prática** (gestor "carimba" a recomendação): risco jurídico e cultural; mitigar exigindo justificativa também quando acata flag de desligamento, e monitorando taxa de divergência por gestor. 5) **Prazo legal do contrato de experiência estourar** por avaliação atrasada: alerta antecipado é mitigação, mas o processo humano precisa de dono no DP — sistema alerta, não garante. 6) **Pilar Dever dependente da maturidade dos módulos internos**: assiduidade vem do ponto próprio (REP-P + tratamento nosso) e ocorrências da linha do tempo; se o ponto atrasar no roadmap ou a competência avaliada for anterior à sua ativação, o Dever vira lançamento manual — mais custo operacional e risco de digitação; justificativa obrigatória e origem marcada mitigam, e divergência não resolvida bloqueia a consolidação do ciclo. 7) **Pares reidentificáveis na 360 completa (Fase 3)**: em equipes pequenas (5 unidades, times enxutos), mínimo de respondentes (≥3) antes de exibir agregado — análogo ao k≥5 da variante anônima do clima. 8) **Inconsistência entre avaliadores** (leniência/rigor por gestor) distorce comparações entre unidades: calibração só chega na Fase 3 — até lá, tratar comparativos entre equipes com cautela nos painéis. 9) **Reabertura de avaliação enviada como brecha de reescrita de histórico**: permitida só por evento auditado com motivo, e o resultado anterior permanece (linha superada, nunca apagada).

## Perguntas abertas para DP/RH

Para o RH/DP da Fast antes de prototipar (a auditoria do código btime — item 0 — deve responder parte disso; o que ficar sem resposta vira pergunta direta): (1) Os pesos 30/40/30 e as faixas 0–40/40–60/60–80/80–100 fazem sentido para a Fast, ou a revisão crítica deve propor outros? Existe (ou deve existir) nota mínima eliminatória por pilar (ex.: Fit Cultural abaixo de X reprova independente da média)? (2) Quais são exatamente os indicadores do pilar Dever (faltas, atrasos, advertências, licenças — algo mais? metas?) e qual a régua de conversão de cada um para nota 1–5? Quais nascem dos módulos internos (ponto/afastamentos/linha do tempo) e quais serão manuais no início? (3) O colaborador vê a própria nota bruta por pilar, ou só faixa + devolutiva? E o gestor vê nota bruta da equipe ou só consolidado? (4) Quem registra formalmente a decisão humana sobre a flag — o gestor direto, o RH, ou decisão conjunta com dupla assinatura? Exigir justificativa também quando ACATA flag de desligar? (5) Quais tipos de vínculo entram em cada ciclo (PJ, estagiário, aprendiz e temporário são avaliados? com o mesmo modelo?)? (6) Ciclo de Desempenho: semestral por calendário fixo (todos juntos, ex. jun/dez) ou por aniversário de admissão? Como entra quem foi admitido no meio do ciclo (proporcionalidade? mínimo de dias avaliáveis?)? (7) Contrato de experiência da Fast é 45+45 padrão para todos os cargos, ou varia? Quantos dias de antecedência o alerta deve disparar? (8) O que acontece com avaliação não respondida no prazo (expira e o ciclo consolida sem ela? escala para o gestor do gestor?)? (9) Troca de gestor no meio do ciclo: avalia o gestor da abertura, o atual, ou ambos ponderados? (10) Colaborador com dupla subordinação (matricial entre unidades) — existe hoje? Como avalia? (11) Na Fase 3, pares são anônimos para o avaliado? Autoavaliação entra no cálculo com peso ou é só insumo de conversa? (12) Política de retenção: por quanto tempo manter avaliações de desligados (proposta: mínimo prescricional; validar com DPO)? (13) O RH quer faixas/pesos diferentes por cargo ou unidade (ex.: liderança com pesos próprios), ou um modelo único vale para toda a Fast?
