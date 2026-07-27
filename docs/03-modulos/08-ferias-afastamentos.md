# Férias e Afastamentos (módulo 08 — domínio `rh`, submódulos `ferias` e `afastamentos`, sobre o motor de demandas)

> Revisado em 2026-07-24 (v2) após decisões do usuário: app próprio e separado do portal (Fase A),
> stack Next.js + TypeScript + Node.js com PostgreSQL dedicado (SaveinCloud), **folha própria sem
> integração Nasajon** (valores de férias e reflexos de afastamento calculados no módulo 03),
> **transmissão do eSocial pelo transmissor próprio (módulo 12)**, ponto via REP-P de mercado.
> O Nasajon aparece apenas como fonte de comparação na sombra e referência funcional.
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

**Fase sugerida:** Fase 2 — em duas entregas conforme a ordem do roadmap v2: afastamentos/atestados cedo (junto com admissão digital e **antes do ponto com REP-P**, para o espelho nunca acusar falta indevida) e férias depois de jornadas/ponto, antes de desligamento. As fundações vêm da Fase 1 (colaborador com matrícula própria, linha do tempo, motor de demandas, GED mínimo, auth própria) e da Fase 0 (tabela de feriados, cifra na camada de aplicação (Node) com chave em secret manager, trilha de leitura no audit, SPIKE eSocial — o leiaute do S-2230 entra no escopo do spike). A **carga inicial** de períodos aquisitivos e afastamentos históricos é feita por relatórios/exports manuais do Nasajon com conciliação — conferência, não integração. Evoluções (self-service, coletivas, planejamento anual, art. 130 automático, absenteísmo) na Fase 2 tardia/Fase 3, cada uma por feature flag com protótipo aprovado antes do código.

## Objetivo

Dar ao DP controle completo e auditável do ciclo de férias (períodos aquisitivos/concessivos, programação, aprovação, avisos legais, abono, coletivas) e do registro de afastamentos e licenças (maternidade, médica, INSS, ausências legais do art. 473), com o dado de saúde protegido por desenho (cifração + trilha de leitura), refletindo automaticamente no espelho de ponto (tratado pelo nosso módulo 02 sobre as marcações do REP-P) e na **folha própria (módulo 03), que calcula os valores** — remuneração + 1/3, médias, abono pecuniário, reflexos de afastamento, dobra do art. 137. Os afastamentos **alimentam o eSocial (S-2230) via o transmissor próprio (módulo 12)**; enquanto durar o paralelo da folha, o Nasajon permanece o calculador e transmissor **oficial** e o nosso resultado roda em sombra até paridade comprovada. O módulo elimina o risco mais caro do domínio (férias vencida = pagamento em dobro, art. 137 CLT) via painel de vencimento com alerta, e alimenta a linha do tempo do colaborador como projeção de tudo que acontece.

## Funcionalidades

### MVP (Fase 2 — afastamentos antes do ponto; férias depois de jornadas/ponto)

#### Afastamentos e licenças (entra ANTES do ponto, para o espelho nunca acusar falta indevida)
- **Catálogo de tipos de afastamento versionado com vigência**: cada tipo declara grupo (saúde, maternidade/paternidade, ausência legal art. 473, INSS, serviço militar, não remunerada), efeito no ponto (justifica ausência), efeito na folha (remunerado pela empresa / benefício INSS / sem remuneração), efeito no período aquisitivo (nenhum / suspende / zera — art. 133), exige documento (sim/não), é dado de saúde (sim/não) e **código eSocial (Tabela 18)** — agora campo **operacional**, não informativo: alimenta a geração do S-2230 pelo módulo 12. 100% administrável pelo RH.
- **Registro de afastamento pelo DP**: tipo, data de início, fim previsto, documento(s) anexado(s). Prorrogação é evento novo encadeado, nunca UPDATE de datas — toda transição no audit.
- **Atestado médico como documento GED sensível**: anexo em storage privado com URL assinada curta; CID e dados do médico **cifrados na camada de aplicação (Node, chave em secret manager — sem pgcrypto)**, permissão de leitura própria; gestor vê período e o rótulo genérico "afastamento por saúde", **nunca CID**; toda leitura do dado de saúde grava trilha de leitura no audit.
- **Regra dos 15 dias**: alerta automático quando afastamento por doença se aproxima do 15º dia (a partir do 16º o benefício é do INSS) — notificação n8n/WhatsApp para o DP encaminhar a perícia; o sistema monitora, não decide.
- **Ausências legais do art. 473** (casamento, luto, doação de sangue, acompanhamento de consulta de filho, etc.) registradas pelo mesmo motor, com limite de dias parametrizado no catálogo.
- **Reflexos automáticos**: afastamento gera `ocorrencia_ponto` (justificativa no espelho do módulo 02) e insumo de folha com datas/dias e origem rastreada — **o valor do reflexo (desconto, remuneração pela empresa até o 15º dia, salário-maternidade conforme regime) é calculado pelo motor da folha própria (módulo 03)**; gera item na **fila do S-2230 (módulo 12)** para início/alteração/término; grava `evento_colaborador` na linha do tempo.
- **Carga inicial de afastamentos históricos** por relatórios/exports manuais do Nasajon via staging + conciliação com fila de divergências — carga de referência da transição, não integração.

#### Férias
- **Períodos aquisitivos gerados e mantidos pelo próprio sistema** a partir da data de admissão e dos eventos do colaborador (afastamentos com efeito do art. 133, faltas do art. 130): **o sistema é o dono do dado desde o dia 1**. Carga inicial por export do Nasajon com conciliação obrigatória; durante a sombra, comparação periódica de saldos com relatórios Nasajon (conferência). Cada período com início/fim, dias de direito (30 por padrão; ajuste por faltas do art. 130 com origem registrada), dias gozados, dias de abono, limite concessivo (fim + 12 meses) e situação (em curso, completo, parcialmente gozado, gozado, **vencido**, perdido por art. 133).
- **Painel de vencimento**: visão DP e visão gestor (equipe via `relacao_gestor`), ordenado por proximidade do limite concessivo; alertas n8n/WhatsApp escalonados (ex.: 90/60/30 dias antes do vencimento do concessivo — parametrizável), destacando o passivo "dobro" iminente. É leitura pura sobre dado já carregado — vale antecipar para colher o ROI cedo.
- **Programação de férias com workflow sobre o motor de demandas (módulo 07)**: solicitação (no MVP aberta por gestor ou DP) → aprovação do gestor → validação do DP → emissão de aviso → gozo → conclusão. Cada transição auditada e notificada via n8n.
- **Validações legais embutidas como checagens explícitas** (resultado registrado; override só pelo DP com justificativa obrigatória): fracionamento em até 3 períodos com um ≥14 dias e demais ≥5 (art. 134 §1º); início vedado nos 2 dias que antecedem feriado ou DSR (art. 134 §3º); abono limitado a 1/3 do período (art. 143) com prazo de pedido (até 15 dias antes do fim do aquisitivo) sinalizado; alerta de estouro do período concessivo.
- **Aviso de férias com antecedência de 30 dias (art. 135)**: gerado como documento no GED com **ciência digital por hash** no app; onde o jurídico exigir, assinatura eletrônica via ferramenta contratada (Clicksign/ZapSign/D4Sign — módulo de assinatura da Fase 2). Alerta se a data de início se aproxima sem aviso emitido. **Recibo de férias gerado pela folha própria (módulo 03), com memória de cálculo**, publicado no GED com ciência — durante a sombra, o recibo oficial continua sendo o do Nasajon (importado manualmente e publicado no GED) e o nosso fica como sombra para comparação.
- **Marcação de adiantamento da 1ª parcela do 13º junto com as férias** (flag na programação; **cálculo e pagamento pela folha própria — módulo 03**).
- **Conflito de agenda da equipe**: na aprovação, o gestor vê sobreposição de férias/afastamentos dos liderados (calendário simples da equipe).
- **Integração com a esteira de fechamento (módulo 03)**: férias aprovadas viram insumo da competência com origem rastreada; **a memória de cálculo (remuneração + 1/3, médias de variáveis, abono em dinheiro, dobra quando vencida) é do motor da folha**; o snapshot do fechamento congela o estado. Durante a sombra, divergência entre o nosso cálculo e o resultado Nasajon aparece na comparação de sombra com resolução obrigatória.
- Tratamento por **tipo de vínculo** desde o dia 1: estagiário tem **recesso** (Lei 11.788, 30 dias/ano, regra própria), não férias CLT; PJ fora do fluxo legal; aprendiz com regra de coincidência com férias escolares sinalizada.

### Evolução (Fase 2 tardia / Fase 3)
- **Self-service do colaborador**: solicitar férias e abono pelo app, acompanhar status, consultar saldo e histórico; dar ciência no aviso diretamente; anexar atestado.
- **Férias coletivas** (art. 139): definição por unidade/setor com vigência, geração em lote das programações dos abrangidos, tratamento de quem tem menos de 12 meses (proporcional + licença remunerada, novo aquisitivo), registro documental das comunicações legais (sindicato/afixação — o ato é do DP; o sistema arquiva evidência com hash).
- **Planejamento anual de férias**: mapa de calendário por equipe/unidade, simulação de cobertura, sugestão de janelas sem conflito.
- **Cálculo assistido do art. 130** (faltas injustificadas × dias de direito: 30/24/18/12) alimentado pelo espelho de ponto consolidado (módulo 02) — só depois de o ponto ter um mês conciliado sem divergência não explicada.
- **Painel de absenteísmo** (people analytics, Fase 3): taxas por unidade/centro de custo, sazonalidade, custo de férias vencidas evitado — sempre agregado, vedado cruzar desempenho × saúde.
- **Convocação de exame de retorno ao trabalho** (afastamento >30 dias) integrada ao módulo SST (módulo 10, com SOC).

## Entidades de dados

Schema `rh`, salvo indicação; toda parametrizadora com versão+vigência; datas em UTC; dado de saúde cifrado em aplicação; pool `app_rh` (insumos de folha transitam para o pool `app_folha` via contrato interno).

### Férias
- **`periodo_aquisitivo`** — colaborador_id (FK `rh.colaborador`), dt_inicio, dt_fim, dias_direito (default 30; ajustável com origem do ajuste registrada — art. 130/133), dias_gozados, dias_abono, dt_limite_concessivo (derivada: fim + 12 meses), situacao (`em_curso | completo | parcialmente_gozado | gozado | vencido | perdido`), origem (`gerado | carga_inicial`). **Dono do dado: o próprio sistema desde o dia 1** (carga inicial conciliada a partir de exports Nasajon; matrícula Nasajon é campo informativo apenas durante a sombra).
- **`programacao_ferias`** — colaborador_id, periodo_aquisitivo_id, demanda_id (FK ao motor de demandas), status (`rascunho → solicitada → aprovada_gestor → validada_dp → aviso_emitido → em_gozo → concluida | cancelada`), checks_legais (JSONB validado: cada checagem com resultado e, se override, justificativa + autor), adiantar_13 (bool). Transições append no audit.
- **`fracao_ferias`** — programacao_id, dt_inicio, dt_fim, dias_gozo, dias_abono (0–10, ≤1/3 do direito), flags de validação (≥14/≥5, início vs DSR/feriado). 1..3 frações por programação.
- **`aviso_ferias`** / **`recibo_ferias`** — não são tabelas próprias: são `documento` no GED (tipo específico, hash SHA-256) + `ciencia` (quem, quando, hash no momento), referenciados pela programação. **Recibo gerado pela folha própria (referência ao `calculo_item`/memória de cálculo do módulo 03)**; durante a sombra, o recibo oficial Nasajon é importado manualmente e publicado em paralelo.
- **`ferias_coletivas`** (evolução) — escopo (unidade/setor/lotação), dt_inicio, dt_fim, abrangidos (gera programações em lote), documentos de comunicação anexados no GED.

### Afastamentos
- **`tipo_afastamento`** + **`tipo_afastamento_versao`** — nome, grupo (`saude | maternidade_paternidade | legal_art473 | inss | servico_militar | nao_remunerada | outro`), efeito_ponto, efeito_folha (`empresa | inss | sem_remuneracao`), efeito_periodo_aquisitivo (`nenhum | suspende | zera`), exige_documento, sensivel_saude (bool), **cod_esocial (Tabela 18 — operacional, consumido pelo módulo 12)**, limite_dias, vigência (rascunho→ativa→encerrada).
- **`afastamento`** — colaborador_id, tipo_afastamento_versao_id, dt_inicio, dt_fim_prevista, dt_fim_real, status (`previsto | em_curso | prorrogado | encerrado | cancelado`), origem (`manual_dp | carga_inicial`), **dados_saude_cifrados** (CID, médico/CRM — cifra na camada de aplicação (Node), chave em secret manager, sem pgcrypto; permissão de leitura própria), documento_ids (GED), **referências aos eventos gerados na fila do eSocial (`fiscal.evento_esocial` — S-2230 de início/alteração/término, módulo 12)**. Prorrogação = novo registro encadeado por afastamento_origem_id (nunca UPDATE de período); encerramento e cancelamento são eventos auditados.
- **`atestado`** — modelado como `documento` GED (classificação sensível, categoria de temporalidade própria, storage privado com URL assinada) + metadados cifrados; N atestados por afastamento (prorrogações).

### Relações e projeções
- Todo evento relevante grava **`evento_colaborador`** (append-only, payload JSONB validado por tipo): `ferias_programadas`, `ferias_iniciadas`, `ferias_concluidas`, `abono_concedido`, `afastamento_iniciado`, `afastamento_prorrogado`, `afastamento_encerrado` — com referência à entidade de origem e resumo legível resolvido. Linha do tempo é projeção, nunca base de cálculo.
- Reflexos: `afastamento`/`programacao_ferias` geram **`ocorrencia_ponto`** (justificativa no espelho — módulo 02) e **insumo de folha com origem rastreada** (variável da competência — módulo 03) — entidades dos módulos de ponto e folha, referenciadas, não duplicadas.
- Transição (temporárias, morrem no cutover): **`staging_periodo_aquisitivo`**, **`staging_afastamento`** (carga inicial: log de carga, snapshot imutável do payload, fila de divergências) e participação na **`comparacao_sombra`** do domínio `rh_folha` (saldos e valores de férias nosso × Nasajon).
- **`audit`** — só-INSERT garantido por GRANT, duas trilhas: alteração (toda transição) e **leitura de dado de saúde** (quem viu atestado/CID, quando).

## Papéis e permissões

Papéis próprios do app (Fase A): `funcionario`, `gestor`, `rh`, `dp`, `admin` — papel validado no **backend Node** em toda rota; RLS via `SET LOCAL` no Postgres onde couber, senão autorização na camada de repositório coberta por **matriz de testes papel × recurso no CI**; 2FA obrigatório para `dp`, `rh` e `admin`.

| Papel | Vê | Faz |
|---|---|---|
| **funcionario** | Seus períodos aquisitivos, saldo, status da programação, seus afastamentos (inclusive o próprio CID — é titular do dado), seus avisos/recibos no GED | MVP: dá ciência no aviso. Evolução: solicita férias/abono (self-service), anexa atestado |
| **gestor** | Painel de férias da equipe (exclusivamente via `relacao_gestor` vigente), calendário de conflitos, afastamentos da equipe como **período + rótulo genérico** ("afastamento por saúde") — **nunca CID, nunca o documento** | Solicita férias para liderado (MVP), aprova 1ª etapa (`rh.ferias.aprovar`), consulta vencimentos da equipe |
| **dp** | Tudo de férias e afastamentos de todas as unidades; atestado e CID (`rh.afastamento.saude.ver`, com 2FA e sessão curta — cada leitura na trilha) | Registra/prorroga/encerra afastamentos, valida programações, faz override justificado de check legal, emite avisos, resolve divergências de carga/sombra, marca adiantamento de 13º |
| **rh** | Tudo do DP + painéis agregados; trilhas do audit (alteração e leitura) em modo consulta | Administra o catálogo de tipos de afastamento (nova versão com vigência), parametriza alertas/prazos, aprova férias coletivas (evolução) |
| **admin** | Administração técnica (usuários, papéis, parametrização de sistema); **nenhum acesso a dado de saúde por padrão** — sem GRANT/chave de decifração | Gestão de acessos e configuração; nada de escrita em dados funcionais de férias/afastamentos |

Regras estruturais: dado de saúde **ausente** (não mascarado) do payload de quem não tem a chave — a rota nem serializa o campo; "gestor" deriva só de `relacao_gestor` com vigência, nunca de flag; override de validação legal exige justificativa gravada no audit; nenhum papel é confiado do lado do cliente — sempre revalidado no backend.

## Integrações

### Folha própria (módulo 03 — `rh_folha`)
- Este módulo entrega **datas, dias e flags com origem rastreada** (férias aprovadas, frações, abono, adiantamento de 13º, afastamentos com efeito na competência); **todo valor é calculado pelo motor próprio**: remuneração + 1/3, médias de variáveis, abono em dinheiro, dobra do art. 137, desconto/remuneração parcial de afastamento, salário-maternidade. Memória de cálculo em `calculo_item`; snapshot de fechamento congela o estado.
- **Transição — paralelo até paridade**: enquanto o Nasajon for o oficial, os valores calculados aqui são sombra; comparação por exports manuais na `comparacao_sombra` com resolução obrigatória de divergências. O gate de cutover da trilha F exige ao menos uma competência limpa **incluindo férias**.

### Obrigações fiscais (módulo 12 — transmissor próprio)
- Afastamentos e férias alimentam a **fila do S-2230** (afastamento temporário — férias inclusive) gerada a partir dos registros deste módulo e transmitida pelo módulo 12 com certificado digital próprio; fila com estados e recibos, prazos do Manual do eSocial monitorados.
- S-2210 (CAT) é do módulo SST (módulo 10), também via módulo 12.
- **Durante a sombra, a transmissão oficial permanece no Nasajon**; o módulo 12 opera em produção restrita até o cutover fiscal (F4→F5 da trilha F). O código da Tabela 18 no catálogo já nasce operacional para não retrabalhar no cutover.

### Ponto (módulo 02 — REP-P de mercado)
- O REP-P contratado (Pontomais candidata líder) faz **só marcação e AFD/AEJ**; espelho e tratamento são nossos. Afastamento e férias geram `ocorrencia_ponto` que justifica ausência no espelho contra a jornada vigente — por isso afastamentos entram **antes** do ponto no roadmap. Evolução: espelho consolidado alimenta o cálculo do art. 130.

### Módulos internos
- **Demandas (módulo 07)**: motor do workflow solicitação → aprovação → validação, com etapas e transições auditadas.
- **GED**: aviso e recibo de férias, atestados (sensíveis, cifrados), comunicações de coletivas — todos com hash e ciência.
- **Linha do tempo (`evento_colaborador`)**: projeção de todos os eventos.
- **Avaliação 360 (módulo 05)**: afastamento longo durante contrato de experiência deve suspender/deslocar o ciclo 45/90d — regra a confirmar (pergunta aberta).
- **Admissão (módulo 09) / Desligamento (módulo 11)**: desligamento consulta saldo de férias vencidas/proporcionais — **valores calculados pela folha própria na rescisão** (módulo 03).

### Assinatura eletrônica (Clicksign / ZapSign / D4Sign — em avaliação)
- Ciência do aviso e do recibo de férias: MVP aceita ciência digital por hash dentro do app; onde o jurídico exigir formalidade maior, o documento sai pela ferramenta de assinatura contratada (integração do módulo de assinatura da Fase 2).

### Nasajon (somente transição — sombra; termina no cutover)
- **Carga inicial** de períodos aquisitivos e afastamentos históricos por relatórios/exports manuais → staging + conciliação com fila de divergências e snapshot imutável de cada carga.
- **Comparação periódica** durante a sombra: saldos de períodos aquisitivos e valores de férias nosso × Nasajon — conferência, não integração (Nasajon não tem API pública de folha).
- **Nunca**: conector permanente, escrita ou leitura automática. Tudo que era "enviar à Nasajon" na v1 deixa de existir.

### n8n / WhatsApp Cloud API (dispara, nunca decide; sem dado sensível no payload — só referências com RBAC no acesso)
- Alertas: período concessivo vencendo (escalonado 90/60/30d, parametrizável), aviso de 30 dias não emitido, 15º dia de afastamento por doença se aproximando (encaminhar INSS), retorno de afastamento próximo, atestado pendente de registro, divergência de carga/sombra aberta, prazo de pagamento de férias (2 dias antes do gozo) se aproximando.

### DW SAP
- Nada. Fora do caminho deste módulo (dado de RH não está no DW).

## Regulatório

| Exigência | Base | Como o desenho atende |
|---|---|---|
| Férias vencida paga em dobro | CLT art. 137 | Painel de vencimento do concessivo + alertas escalonados; situação `vencido` explícita — é o ROI direto do módulo. Após o cutover, a dobra devida é calculada pela folha própria (módulo 03) |
| Aviso de férias com 30 dias de antecedência | CLT art. 135 | Documento GED com ciência digital por hash (ou assinatura eletrônica via ferramenta contratada) + alerta se início se aproxima sem aviso; evidência preservada com temporalidade trabalhista |
| Fracionamento: até 3 períodos, um ≥14, demais ≥5, com concordância | CLT art. 134 §1º | Validação estrutural na `fracao_ferias`; concordância evidenciada pela ciência; override só DP com justificativa auditada |
| Início vedado 2 dias antes de feriado/DSR | CLT art. 134 §3º | Check automático contra tabela `feriado` por município/unidade |
| Abono pecuniário até 1/3; pedido até 15 dias antes do fim do aquisitivo | CLT art. 143 | Limite imposto no dado; prazo sinalizado no fluxo; valor do abono calculado pela folha própria |
| Faltas injustificadas reduzem dias de direito (30/24/18/12) | CLT art. 130 | Campo `dias_direito` com origem do ajuste; automação só na evolução (depende do espelho de ponto conciliado) |
| Perda/reinício do período aquisitivo | CLT art. 133 | Efeito declarado no catálogo de tipos de afastamento; aplicação registrada como evento |
| Férias coletivas: comunicações, mínimo de dias, proporcionais | CLT arts. 139–141 | Evolução: geração em lote + arquivo das comunicações como evidência; o ato administrativo permanece do DP |
| Pagamento até 2 dias antes do gozo; adiantamento de 13º | CLT art. 145; Lei 4.749 | **Dentro do sistema após o cutover**: cálculo pela folha própria (módulo 03), prazo de pagamento no calendário da competência com alerta n8n; durante a sombra o pagamento oficial segue o Nasajon |
| Afastamentos ao eSocial (S-2230, inclusive férias; S-2210 CAT) | eSocial | **Transmissão pelo transmissor próprio (módulo 12) com certificado digital**, fila com estados/recibos e prazos monitorados; durante a sombra a transmissão oficial permanece no Nasajon (produção restrita até o cutover). S-2210 via módulo SST (10) |
| Recesso de estagiário ≠ férias CLT | Lei 11.788 | `tipo_vinculo` desde o dia 1 diferencia regras; estagiário/PJ fora do fluxo CLT |
| Licenças maternidade/paternidade e ausências legais | CLT art. 392, art. 473; Lei 11.770 (Empresa Cidadã — confirmar adesão) | Catálogo de tipos versionado com efeitos declarados |
| Dado de saúde = dado sensível (categoria especial) | LGPD art. 5º II e art. 11 | CID/dados médicos cifrados na camada de aplicação (Node, chave em secret manager — sem pgcrypto); gestor vê período, nunca CID; trilha de LEITURA no audit desde a Fase 1; payload minimizado (ausência, não máscara); anexos em storage privado com URL assinada curta; temporalidade por categoria; n8n/WhatsApp sem dado sensível |
| Imutabilidade probatória | LGPD × CLT (guarda 5–30 anos) | Audit só-INSERT por GRANT; prorrogação/correção = evento novo, nunca UPDATE; snapshot de cargas; eliminação futura por anonimização do domínio, nunca UPDATE no audit |

## Dependências

Fase 1 completa como pré-requisito: `colaborador` (com tipo_vinculo e **matrícula própria** como chave; matrícula Nasajon só informativa na sombra), `evento_colaborador`, `relacao_gestor` com vigência ("gestor vê equipe"), auth própria com papéis funcionario/gestor/rh/dp/admin e 2FA, motor de demandas com etapas de aprovação + n8n, GED mínimo (documento + ciência com hash). Da Fase 0: cifra na camada de aplicação (Node) com chave em secret manager (sem pgcrypto), trilha de leitura no audit, tabela de temporalidade por categoria de dado, tabela `feriado` por município/unidade, **SPIKE eSocial cobrindo o leiaute do S-2230** e levantamento de rubricas/regras de férias no Nasajon como referência funcional do motor. Da trilha F: o cálculo de valores de férias e reflexos de afastamento entra na **F2 (cobertura completa do motor)** e é gate de paridade na F3 (ao menos uma competência limpa com férias antes do cutover). Dependências de saída: módulo de ponto (02) consome `ocorrencia_ponto` gerada aqui (por isso afastamentos entram antes do ponto); folha própria (03) consome os insumos da competência; **módulo 12 consome a fila do S-2230**; desligamento (11) consulta saldos. Decisões que condicionam: **período aquisitivo é do próprio sistema desde o dia 1** (carga inicial conciliada, sem dupla fonte permanente); "fechado não reabre; correção é evento novo" (afastamento retroativo sobre competência fechada vira ajuste na competência seguinte na folha própria).

## Riscos

1) **Qualidade da carga inicial**: período aquisitivo errado na carga → painel de vencimento mente → e painel errado é exatamente o passivo do dobro que o módulo existe para evitar. Mitigação: conciliação obrigatória da carga com resolução item a item, comparação periódica de saldos com relatórios Nasajon durante toda a sombra, alerta de divergência envelhecida. 2) **Dupla operação durante a sombra**: o DP registra férias/afastamentos no Nasajon (oficial) E no sistema; esquecer um dos lados gera divergência silenciosa detectada só na comparação seguinte. Mitigação: checklist de dupla digitação com pendência rastreada de primeira classe (férias aprovada aqui e não lançada lá é falha grave), rotina de comparação com prazo curto. 3) **Dependência circular férias × ponto**: o cálculo do art. 130 exige faltas do espelho, que entra depois; o MVP usa dias_direito ajustado manualmente com origem registrada — risco de esquecerem de ajustar; automatizar só após ponto conciliado. 4) **Afastamento retroativo sobre espelho/folha fechados**: a regra "fechado não reabre" exige que o efeito caia como evento de correção na competência seguinte (folha própria) — fluxo que precisa ser desenhado explicitamente no protótipo, senão o DP vai pedir reabertura. 5) **LGPD do atestado**: o caminho de entrada hoje (papel/WhatsApp para o gestor) vaza CID antes de chegar ao sistema — o módulo protege o armazenamento, mas o processo de recepção precisa mudar junto (risco de falsa sensação de conformidade). 6) **Convenções coletivas do comércio por unidade** podem ter cláusulas próprias de férias/abono — modelar validações como parametrizáveis, nunca hard-coded (mesma lição das jornadas). 7) **O cálculo agora é nosso** (risco assumido no log de decisões): erro no motor de férias (médias, 1/3, abono, dobra) gera passivo trabalhista direto, sem a Nasajon como anteparo. Mitigação: paridade comprovada na sombra incluindo competência com férias antes do cutover (gate da trilha F, não calendário), memória de cálculo auditável em cada item. 8) **Prazo do S-2230 após o cutover**: perder o prazo do evento vira multa; a fila do módulo 12 precisa de SLA monitorado e alerta de evento parado — e, durante a sombra, garantir que o Nasajon continue transmitindo (não desligar o oficial antes da paridade fiscal).

## Perguntas abertas para DP/RH

1) Como o processo de férias roda hoje: quem programa (gestor? DP?), em que ferramenta, e quem digita no Nasajon? (Define o desenho da dupla operação na sombra.) 2) Quais relatórios/exports o Nasajon oferece para períodos aquisitivos, afastamentos e faltas — formato (planilha/PDF), campos e periodicidade viável para a carga inicial e para a comparação de sombra? 3) A Fast aderiu ao programa Empresa Cidadã (maternidade 180d / paternidade 20d)? 4) Como os atestados chegam hoje (papel, WhatsApp do gestor, e-mail ao DP)? Quem registra o CID, e o DP aceita mudar o canal de recepção para o sistema? 5) As convenções coletivas do comércio das 5 unidades têm cláusulas próprias sobre férias, abono ou licenças (dias adicionais, restrição de época)? 6) Férias coletivas são prática real da Fast (ex.: fim de ano)? Com que abrangência — empresa toda, por unidade, por setor? 7) Política de abono pecuniário: é livre a pedido do funcionário ou depende de aprovação? E o adiantamento da 1ª parcela do 13º nas férias é praticado? 8) Quem transmite o S-2230 hoje e com que prazo após o registro do afastamento? (Vira a referência de SLA da fila do módulo 12 no cutover.) 9) Quais rubricas variáveis entram na média de férias por convenção (horas extras, comissões, adicional noturno)? (Insumo do motor da folha — levantar junto com o inventário de rubricas da Fase 0.) 10) Afastamento longo durante o contrato de experiência suspende o ciclo 45/90d da avaliação 360 (o contrato de experiência se prorroga)? Regra a fechar com DP + jurídico. 11) Estagiários: quem controla o recesso hoje, e ele deve entrar no MVP ou fica para evolução? 12) Existem hoje férias vencidas ou acumuladas na base? (Define se o go-live precisa de um plano de regularização e de que tamanho é o passivo atual.) 13) Qual a granularidade que o gestor pode ver do afastamento da equipe: só "afastado até DD/MM" ou também o grupo (saúde × INSS × licença legal)? Definir com o DPO o rótulo máximo permitido. 14) A ciência por hash dentro do app basta juridicamente para aviso e recibo de férias, ou o jurídico exige assinatura eletrônica via ferramenta (Clicksign/ZapSign/D4Sign)?
