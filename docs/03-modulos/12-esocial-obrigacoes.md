# eSocial e obrigações digitais (domínio `fiscal/`) — transmissor próprio: eventos eSocial (tabelas, não periódicos, periódicos e SST), FGTS Digital, DCTFWeb e painel de obrigações por competência

> **Revisado em 2026-07-24 (v2) após decisões do usuário.** Módulo NOVO — não existia na v1, na qual a Nasajon era motor e transmissor fiscal e o sistema apenas registrava status. Segue a Arquitetura v2 (`docs/02-arquitetura.md`).
> **Decisões fechadas que este módulo obedece:** (a) FOLHA PRÓPRIA sem integração Nasajon — o que hoje é feito lá (cálculo **e transmissão das obrigações**) passa a ser feito no sistema interno, com certificado digital próprio; risco assumido e registrado no log (2026-07-24). (b) Fronteira de domínio: `folha/` calcula, `fiscal/` transmite — o transmissor **nunca calcula** e o motor **nunca fala com o governo**; comunicam-se por snapshot imutável de competência. (c) Transição em paralelo: a Nasajon permanece transmissora OFICIAL até o cutover (trilha F5); o nosso transmissor roda em **produção restrita** antes de qualquer produção real. (d) Stack Next.js + TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud — os padrões inegociáveis (audit só-INSERT por GRANT, versionamento com vigência, escrita transacional, 2FA em `fiscal.transmitir`) são implementados neste stack, nada é herdado.
> **Status: especificação funcional — fase sem código.**

**Fase sugerida:** o módulo atravessa o roadmap em três momentos. **Fase 0:** SPIKE técnico de eSocial (item 1 do roadmap — webservices, certificado digital, leiautes, acesso à produção restrita, transmitir um S-1000 de teste; detalhado abaixo) + descoberta de certificado/procurações/rota SST junto ao DP. **Trilha F (paralela):** F4 = eventos de tabela + S-1200/S-1210/S-1299 gerados da sombra e aceitos em produção restrita (gate: uma competência inteira sem rejeição estrutural); F5 = cutover, quando o transmissor assume a produção real — nunca entre novembro e janeiro. **Gancho antecipado barato (Fase 2/3, antes do cutover):** o painel de obrigações por competência pode nascer em modo "confirmação manual" (registrando o que a Nasajon/clínica/contador transmitem hoje, com recibo digitado) — dá visibilidade de compliance imediata ao DP e vira automático após o cutover, sem retrofit de modelo.

## Objetivo

Ser o canal fiscal único do Fast Pessoas com o governo: gerar, assinar, transmitir e monitorar os eventos do eSocial e acompanhar as obrigações derivadas (FGTS Digital e DCTFWeb), com prova arquivada (XML transmitido, protocolo, recibo) e agenda de prazos com alerta. O módulo:

- **gera** XML de evento a partir das entidades internas de origem (nunca de digitação livre): admissão, alterações, afastamentos, desligamento, folha fechada (snapshot), SST;
- **valida** contra o XSD do leiaute vigente ANTES de assinar (rejeição estrutural morre dentro de casa, não no governo);
- **assina** com certificado digital e-CNPJ A1 (ICP-Brasil, padrão XML-DSig), material criptográfico em secret manager — nunca em disco de app nem no banco — e uso logado no audit;
- **transmite** em lotes pelos webservices do eSocial (envio assíncrono + consulta de resultado), com fila, retry e idempotência;
- **arquiva** protocolo e recibo por evento — o recibo é a prova legal e a chave obrigatória de retificação/exclusão;
- **monitora** prazos (admissão D-1, desligamento D+10, CAT D+1 útil, periódicos dia 15, FGTS Digital dia 20, DCTFWeb dia 25/DARF dia 20 — confirmar valores vigentes no spike) com alerta escalonado via n8n;
- **nunca calcula nada**: valor, base e incidência vêm prontos do snapshot da folha; dado cadastral vem das entidades de origem. Erro de conteúdo se corrige na ORIGEM e regera o evento — jamais editando XML.

Este é o módulo de **maior risco regulatório do sistema inteiro**: erro ou atraso de transmissão gera multa automática, sem depender de fiscalização presencial. Todo o desenho (produção restrita, paralelo com a Nasajon, painel de prazos, trava de ambiente) existe para conter esse risco.

## Funcionalidades

### MVP (construído na trilha F, aceito em produção restrita no F4; produção real só no cutover F5)

**1. Fila de eventos com máquina de estados**
- `pendente → gerado → validado (XSD) → assinado → enviado → processando → aceito | rejeitado`; rejeitado entra em fila de retrabalho com erro estruturado (código do governo, campo, mensagem) e classificação: **erro estrutural** (bug nosso de geração — vai para o time), **erro de conteúdo** (dado do colaborador/folha — vira demanda para o DP corrigir na origem e regerar) ou **indisponibilidade do governo** (retry automático com backoff, sem intervenção).
- Idempotência por evento (nunca transmitir duplicado por falha de rede); agrupamento em lotes respeitando os limites do webservice (até 50 eventos/lote) e a **precedência entre eventos** (ex.: S-2200 do colaborador antes de qualquer S-1200 que o remunere; tabelas antes de tudo).
- Transmissão antecipada como política: a fila transmite assim que o evento está pronto, não na véspera do prazo — indisponibilidade do governo no dia 15 não pode ser o nosso problema.
- Cada transição de estado gravada no audit (quem/o quê/quando); XML gerado e resposta bruta do governo arquivados imutáveis (só-INSERT por GRANT).

**2. Controle de protocolo e recibo**
- Protocolo por lote enviado; consulta de resultado assíncrona por job; recibo por evento aceito, arquivado com hash do XML correspondente.
- Retificação e exclusão (S-3000) sempre como **evento novo referenciando o recibo original** — coerente com o padrão "fechado não reabre; correção é evento novo".

**3. Mapa de eventos por origem (o de-para que governa o módulo)**

| Grupo | Eventos | Origem interna | Quando dispara |
|---|---|---|---|
| Tabelas | S-1000 (empregador), S-1005 (estabelecimentos — 5 unidades), S-1010 (rubricas), S-1020 (lotações tributárias) | Cadastro do empregador; `rubrica_versao` do motor; lotações | Carga inicial + toda nova versão vigente de rubrica/parâmetro |
| Não periódicos | S-2190 (admissão preliminar), S-2200 (admissão), S-2205 (alteração cadastral), S-2206 (alteração contratual), S-2230 (afastamento), S-2299 (desligamento), S-2298 (reintegração) | `processo_admissao` (S-2190/S-2200); **alteração auditada da ficha/dados civis** (S-2205); **`posicao_colaborador`/lotação/jornada contratual vigentes no fato gerador** (S-2206); `afastamento`; `processo_desligamento` | No fato gerador, respeitando prazo por tipo (S-2190 até a véspera do início, quando a admissão completa não está pronta — complementado depois pelo S-2200; admissão até D-1 do início; desligamento até D+10) |
| Periódicos | S-1200 (remuneração), S-1210 (pagamentos), S-1299 (fechamento), S-1298 (reabertura — exceção controlada, exige justificativa e 2FA) | **Exclusivamente o `snapshot_fechamento`** da competência aprovada no motor | Após fechamento da folha; prazo dia 15 do mês seguinte |
| SST | S-2210 (CAT), S-2220 (ASO), S-2240 (agentes nocivos) | `cat`, `aso`, perfil de exposição (módulo SST) | **Rota clínica vs própria decidida na Fase 0**, parametrizada por tipo de evento e unidade com vigência — nunca as duas rotas ativas para o mesmo evento (duplicidade) |
| Exclusão | S-3000 (exclusão de evento) | `retificacao_evento` (recibo do evento original) | Quando um evento aceito precisa ser excluído — sempre referenciando o recibo, com justificativa e autorização `fiscal.transmitir` (2FA) |

**Regra geral do mapa: nenhum evento fiscal nasce de projeção.** A linha do tempo (`evento_colaborador`) é projeção para consulta (regra estrutural do módulo 01) — serve, no máximo, como GATILHO de geração; o conteúdo de todo evento vem sempre da entidade de origem auditada (ficha/dados civis, `posicao_colaborador`, lotação, jornada, snapshot).

**4. FGTS Digital (derivada do eSocial)**
- O FGTS Digital apura a guia a partir das remunerações que NÓS transmitimos (S-1200) — o módulo monitora: competência transmitida → guia disponível → **conferência do valor da guia contra o valor apurado pelo motor próprio** (divergência = alerta e investigação antes de pagar) → recolhimento até o **dia 20** → comprovante arquivado no GED.
- Emissão/pagamento da guia permanece ação humana no portal no MVP; API do portal (Serpro) fica para o spike verificar (evolução).

**5. DCTFWeb (derivada do eSocial)**
- Gerada pela Receita a partir dos S-1299 fechados; o módulo monitora: competência fechada no eSocial → DCTFWeb disponível no e-CAC → conferência dos débitos contra o snapshot → transmissão da declaração (prazo **dia 25** do mês seguinte — confirmar no spike) → DARF (INSS — dia 20) → comprovantes no GED.
- No MVP a transmissão da DCTFWeb é passo manual assistido (checklist com prazo e alerta); automação via API fica para o spike/evolução.

**6. Painel de obrigações por competência**
- Uma linha por obrigação × competência: eSocial folha (S-1200/1210/1299), FGTS Digital, DCTFWeb, SST pendentes, marcos de 13º — com prazo legal calculado, status (pendente / em transmissão / aceita / rejeitada / paga / atrasada), responsável e semáforo.
- Alertas n8n escalonados (antecipado → no prazo → estourado, com escalonamento a gestor RH); payload sem valores nem dados pessoais, só referências.
- Antes do cutover: modo "confirmação manual" (o que terceiros transmitiram, recibo digitado). Depois: alimentado automaticamente pela fila.

**7. Versionamento de leiaute como regra com vigência**
- `leiaute_esocial_versao` (ex.: S-1.3, vigente na data desta revisão — confirmar no spike): vigência, XSDs de referência, notas técnicas incorporadas. **Todo evento gerado referencia a versão de leiaute usada** — mesmo padrão de `rubrica_versao`/`tabela_legal_versao`.
- Troca de versão do governo = migração planejada: nova linha de vigência, janela de convivência (o eSocial costuma aceitar duas versões por um período), suíte de eventos de teste revalidada em produção restrita antes de ativar.

**8. Gestão de certificado digital e procurações**
- Metadados do e-CNPJ A1 (titular, validade, emissor) com alerta de vencimento em 90/60/30 dias — **certificado vencido = paralisia fiscal total**; renovação é obrigação de calendário, não de reação.
- Registro das procurações eletrônicas vigentes (quem pode transmitir/consultar o quê em nome da Fast) — levantadas na Fase 0.

### Evolução (pós-cutover)

- **Conciliação por totalizadores**: consumir os retornos S-5001/S-5002/S-5003/S-5011–S-5013 (bases e tributos calculados PELO GOVERNO a partir dos nossos eventos) e conciliar automaticamente contra o snapshot do motor — é a conferência externa mais valiosa que existe; divergência vira alerta antes da DCTFWeb.
- **Automação FGTS Digital/DCTFWeb via API** (Serpro/e-CAC), se o spike confirmar viabilidade e custo.
- **Monitoramento do DET** (Domicílio Eletrônico Trabalhista): alerta de mensagem nova — notificação perdida lá também gera prejuízo.
- **Eventos de processo trabalhista** (S-8500/S-8501), se/quando houver processos — hoje presumivelmente com o advogado/contador (pergunta aberta).
- **EFD-Reinf**: fora do escopo do sistema (retenções de serviços tomados são da contabilidade/fiscal, não do DP) — registrado aqui só para ninguém supor que "obrigações digitais" a inclui; confirmar a fronteira com a contabilidade (pergunta aberta).

### SPIKE de Fase 0 (item 1 do roadmap — detalhamento do que este módulo precisa que o spike responda)

1. **Leiaute e ambiente**: versão vigente do leiaute (S-1.3?) e notas técnicas; cadastro e acesso ao **ambiente de produção restrita**; transmitir um S-1000 de teste com sucesso (critério de pronto do gate 0→1). Verificar se as APIs REST anunciadas pelo eSocial já cobrem os grupos que usamos ou se o caminho continua sendo os webservices SOAP.
2. **Assinatura XML em Node** (o ponto tecnicamente crítico): avaliar maturidade das bibliotecas existentes (`xml-crypto`, `xmldsigjs`, `node-forge`/`pkcs12` para o A1; `soap`/`strong-soap` para o transporte) contra as exigências ICP-Brasil do eSocial (XML-DSig enveloped, canonicalização, cadeia de certificação); validar a assinatura gerada no validador do próprio governo. Saída: "dá para fazer direto em Node com segurança" ou "não dá / custa demais".
3. **Alternativa middleware/API de mercado para transmissão** (A PESQUISAR — nada verificado ainda; candidatas a levantar: TecnoSpeed e demais mensagerias de eSocial usadas por software houses e contabilidades): o middleware faria assinatura+transmissão+recibos, nós faríamos a geração do conteúdo. **Critério de escolha registrado desde já:**
   - implementação direta é a PREFERIDA se o spike provar que assinatura+SOAP em Node é tratável (S-1000 aceito em produção restrita dentro do prazo do spike) — sem lock-in, sem terceiro vendo remuneração, sem custo por evento;
   - middleware só entra se houver bloqueio técnico real ou esforço direto estimado acima do aceitável, e mesmo assim com condições mínimas: recibos e XMLs ficam NOSSOS (exportáveis), contrato com cláusula de saída, custo por evento/CNPJ na mesa, e análise LGPD explícita (remuneração transitando por operador adicional);
   - decisão registrada no log com os números do spike.
4. **FGTS Digital e DCTFWeb**: mapear portais, existência de API (Serpro), e o passo a passo manual de hoje (quem faz, com que acesso).
5. **Situação atual da Fast**: certificado(s) existente(s), procurações no e-CAC/eSocial, estrutura de CNPJ das 5 unidades (matriz/filiais vs CNPJs distintos — muda S-1005, certificado e procuração), **qualificação cadastral** em lote (CPF×NIS×data de nascimento) para não colher rejeição em massa na carga inicial.
6. **Recuperação do histórico**: verificar a viabilidade de baixar do próprio eSocial os XMLs/recibos dos eventos já transmitidos pela Nasajon (o webservice de consulta/download de eventos) — é o caminho para reconstruir o RET (Registro de Eventos Trabalhistas) localmente antes do cutover e para **fixar a `matricula_esocial` dos colaboradores legados** (persistente pós-cutover).

## Entidades de dados

Schema `rh_folha`, domínio de código `fiscal/`; pool `app_folha` (só motor e fiscal escrevem); XML e respostas do governo imutáveis por GRANT.

- **`evento_esocial`** — fila: tipo (S-XXXX, incluindo S-2190 e S-3000), grupo (tabela | nao_periodico | periodico | sst | exclusao), FK **entidade de origem** (processo_admissao, ficha/dados civis com alteração auditada, posicao_colaborador, afastamento, processo_desligamento, snapshot_fechamento, cat, aso, rubrica_versao, retificacao_evento... — nunca `evento_colaborador`, que é projeção), FK `matricula_esocial` (obrigatória em evento de trabalhador), competência (quando aplicável), estado (máquina de estados), XML gerado (imutável) + hash, FK `leiaute_esocial_versao`, FK `certificado_digital` usado, prazo legal calculado, tentativas/backoff, erro estruturado (código, campo, mensagem, classificação), FK `lote_esocial`, nº do recibo, dependências de precedência. **Nunca contém dado digitado** — só gerado.
- **`lote_esocial`** — protocolo de envio, eventos do lote, status, request/response brutos arquivados (snapshot imutável), timestamps de envio e consulta.
- **`retificacao_evento`** — liga evento novo (retificador ou S-3000) ao recibo do evento original; motivo; autor. Retificar nunca é UPDATE.
- **`matricula_esocial`** — mapeamento colaborador × matrícula constante no RET (o governo casa eventos de trabalhador por ela, não pela nossa chave interna): **todo evento de trabalhador referencia a matrícula do RET.** Para colaboradores legados (admitidos pré-cutover pela Nasajon), vem da **reconstrução do RET** (download de eventos históricos, já previsto no spike) e é **PERSISTENTE — não morre no cutover**, pois o RET do governo não é reiniciado; para admitidos pós-cutover, é a matrícula própria. Imutável após fixada; distinta da matrícula própria (chave de negócio interna, módulo 01).
- **`leiaute_esocial_versao`** — versão, vigência (rascunho → ativa → encerrada), referência aos XSDs, notas técnicas; padrão de versionamento de regra.
- **`transmissao_fgts_digital`** — competência, valor apurado pelo motor (referência ao snapshot), valor da guia no portal, divergência (se houver, com desfecho obrigatório), status (pendente | conferida | paga | atrasada), comprovante (FK GED), prazo (dia 20).
- **`declaracao_dctfweb`** — competência, origem (S-1299 aceito), débitos conferidos contra snapshot, status (pendente | transmitida | DARF emitido | paga | atrasada), comprovantes (FK GED), prazos (declaração/DARF).
- **`obrigacao_competencia`** — agenda transversal: obrigação, competência, prazo legal, status, responsável, modo (automático | confirmação manual pré-cutover), FK evento/transmissão/declaração. Alimenta painel e alertas.
- **`certificado_digital`** — metadados apenas (titular, CNPJ, tipo A1, validade, emissor, alerta); **material criptográfico exclusivamente no secret manager**, acesso restrito ao serviço transmissor e logado.
- **`procuracao_eletronica`** — outorgado, escopo (sistemas/serviços), validade, status; levantada na Fase 0 e mantida pelo DP.
- **`rota_transmissao_sst`** — parametrização com vigência: evento SST × unidade × transmissor (propria | clinica | outro); impede rota dupla ativa.

**Relações-chave:** os periódicos derivam EXCLUSIVAMENTE de `snapshot_fechamento` (nunca de tabelas vivas); nenhum evento fiscal nasce de projeção (`evento_colaborador` é no máximo gatilho); todo evento aponta para a entidade interna de origem (proveniência obrigatória), para a `matricula_esocial` do RET (quando de trabalhador) e para as versões usadas (leiaute, certificado); recibo é a chave de qualquer retificação; comprovantes vivem no GED (`rh_documentos`) com hash, não em coluna binária.

## Papéis e permissões

| Papel | Vê | Faz |
|---|---|---|
| **Colaborador / Gestor** | Nada deste módulo | Nada |
| **Analista DP** (`fiscal.operar`) | Fila, painel de obrigações, erros, recibos | Acompanha a fila; classifica/encaminha erro de conteúdo (correção sempre na ORIGEM + regeração); confirma status manual pré-cutover; anexa comprovantes |
| **Gestor RH / responsável DP** (`fiscal.transmitir` + **2FA obrigatório**) | Tudo do analista | Autoriza transmissão em produção real; fecha competência fiscal (S-1299); autoriza reabertura (S-1298) e exclusão (S-3000) com justificativa registrada |
| **Chave `fiscal.auditar`** (2FA, atribuível a usuário nomeado — sem papel dedicado na Fase A; é chave RBAC, mesmo padrão de `rh.auditar`) | Fila, recibos, XMLs, trilhas — somente leitura, logada | Nada de escrita |
| **Admin TI** | Estado técnico da fila e do certificado (validade), **não o conteúdo dos XMLs de remuneração** — abrir XML de S-1200/S-1210 exige chave funcional de folha e grava trilha de leitura | Mantém secret manager, jobs e flags; **não transmite** |

**Regras transversais:** segregação de funções — quem fecha a folha no motor não é quem autoriza a transmissão da mesma competência (parametrizável, padrão ativado), espelhando o padrão remeter ≠ aprovar da folha; trava dura de ambiente: produção real fica **desabilitada por configuração assinada** até a decisão de cutover registrada no log — impossível transmitir em produção por engano durante a fase de sombra; toda autorização de transmissão no audit com 2FA verificado.

## Integrações

| Sistema | Direção | O quê |
|---|---|---|
| **eSocial (governo)** | Saída/consulta | Envio de lotes e consulta de resultado (webservices SOAP; REST se o spike confirmar); produção restrita como ambiente permanente de homologação de leiaute, produção real pós-cutover; download de eventos históricos para reconstruir o RET |
| **FGTS Digital** | Consulta/manual | Conferência e recolhimento (portal no MVP; API Serpro a verificar no spike) |
| **DCTFWeb / e-CAC** | Consulta/manual | Conferência, transmissão da declaração e DARF (manual assistido no MVP; API a verificar) |
| **Motor de folha (`folha/`)** | Entrada | `snapshot_fechamento` aprovado → S-1200/S-1210/S-1299; catálogo `rubrica_versao` → S-1010; valores de referência para conferir FGTS/DCTFWeb. Único canal: snapshot imutável |
| **Módulos internos** | Entrada | Admissão → S-2190/S-2200; alteração auditada da ficha/dados civis → S-2205; `posicao_colaborador`/lotação/jornada contratual vigentes → S-2206 (a linha do tempo é só gatilho, nunca fonte); afastamentos → S-2230; desligamento → S-2299/S-2298; SST (CAT/ASO/exposição) → S-2210/S-2220/S-2240 conforme `rota_transmissao_sst` |
| **`nasajon_sombra/`** | Nenhuma direta | A Nasajon transmite oficialmente até o cutover; este módulo NÃO compara eventos com ela (a comparação da sombra é de CÁLCULO, no motor). Pós-cutover, o histórico transmitido por ela é recuperado do próprio eSocial, não da Nasajon |
| **GED (`rh_documentos`)** | Saída | Comprovantes, guias e recibos arquivados com hash e temporalidade |
| **n8n** | Saída | Alertas de prazo (escalonados), rejeição, certificado/procuração vencendo, mensagem no DET (evolução). Payload sem valores e sem dados pessoais |

## Regulatório

- **Natureza do risco:** as multas por atraso/erro são objetivas e em grande parte automáticas — admissão fora do prazo (multa do art. 47 da Lei 8.212/91, por empregado), CAT fora do prazo (art. 22 da Lei 8.213/91, dobra em reincidência), atraso de FGTS (art. 22 da Lei 8.036/90, com encargos), DCTFWeb entregue fora do prazo (MAED — percentual ao mês sobre os tributos, com mínimo fixo). Valores e detalhes confirmados no spike; o desenho responde com painel de prazos, transmissão antecipada e alerta escalonado.
- **Prazos monitorados pelo módulo** (calculados por evento, com fonte na tabela de prazos versionada): S-2200 até o dia anterior ao início do trabalho; S-2299 até 10 dias do desligamento; S-2210 até o 1º dia útil seguinte (imediato em óbito); S-2220/S-2240 até o dia 15 do mês seguinte; S-1200/S-1210/S-1299 até o dia 15; FGTS Digital dia 20; DCTFWeb dia 25 com DARF dia 20 (valores vigentes confirmados no spike e parametrizados com vigência, nunca hardcoded).
- **Assinatura e certificado:** ICP-Brasil, e-CNPJ A1, padrão de assinatura XML exigido pelo eSocial; material em secret manager, uso logado — o certificado é o segredo de mais alto grau do sistema (decisão de arquitetura).
- **Imutabilidade probatória:** XML transmitido + protocolo + recibo arquivados só-INSERT com hash; retificação/exclusão sempre como evento novo referenciando o recibo — defensável em fiscalização. Retenção longa conforme tabela de temporalidade (obrigações trabalhistas/previdenciárias, 5 a 30 anos conforme categoria).
- **LGPD:** os XMLs de S-1200/S-1210 contêm remuneração nominal — dado de acesso restrito: leitura de XML grava trilha, n8n nunca carrega conteúdo, e a eventual opção por middleware de transmissão adiciona um OPERADOR ao tratamento (fator formal do critério de escolha do spike). Dado de saúde (CAT/ASO) transita apenas no campo mínimo exigido pelo leiaute, vindo cifrado do módulo SST.
- **Produção restrita antes de produção** é a tradução operacional do risco assumido: nenhum grupo de evento vai a produção real sem uma competência inteira aceita em restrita (gate F4→F5).

## Dependências

1. **Fase 0:** spike de eSocial concluído (gate 0→1: S-1000 aceito em produção restrita OU plano B documentado); certificado e-CNPJ obtido/validado; procurações mapeadas; estrutura de CNPJ das unidades esclarecida; qualificação cadastral rodada; decisão direto vs middleware registrada no log; rota SST definida com a clínica/SOC.
2. **Fundação:** Postgres dedicado com pools segregados (`app_folha`), audit em duas trilhas, secret manager operante, GED com temporalidade.
3. **Trilha F:** F1/F2 (motor) e F3 (sombra) — sem snapshot de competência não existem periódicos; F4 é deste módulo; F5 (cutover) depende de paridade comprovada no motor + competência aceita em restrita aqui.
4. **Módulos de origem** (Fase 2): admissão, afastamentos, desligamento e SST alimentam os não periódicos — o transmissor não inventa dado; sem origem estruturada, não há evento.
5. **Catálogo de rubricas versionado** (motor) para S-1010 — rubrica sem versão não gera evento de tabela.
6. **Até o cutover:** a Nasajon segue transmitindo oficialmente; este módulo opera exclusivamente em produção restrita e no painel manual.

## Riscos

1. **Maior risco regulatório do sistema — multa automática por erro/atraso.** Mitigações estruturais: produção restrita como gate, paralelo com a Nasajon até paridade, transmissão antecipada por política, painel com alerta escalonado, janela de congelamento de deploy amarrada aos prazos fiscais (dia 15/20/25). O risco residual é assumido e está no log (2026-07-24).
2. **Assinatura XML ICP-Brasil em Node é o elo tecnicamente mais frágil** — o ecossistema maduro de eSocial é Java/.NET/Delphi; se as bibliotecas Node não passarem no validador do governo, o plano B é o middleware de mercado (critério de escolha já registrado) — o spike existe para responder isso cedo e barato.
3. **Mudança de leiaute pelo governo** (notas técnicas frequentes, novas versões S-1.x): mitigada por `leiaute_esocial_versao` com vigência, monitoramento das publicações como rotina do DP/dev, e revalidação em produção restrita a cada troca — a produção restrita não é descartável, é ambiente permanente de homologação.
4. **Certificado vencido = paralisia total de transmissão**: A1 vale 1 ano; alerta 90/60/30 + renovação como obrigação de calendário do painel. Procuração vencida tem o mesmo efeito em serviços do e-CAC.
5. **Cutover fiscal é mais delicado que o cutover de cálculo**: o RET no governo foi construído pela Nasajon; assumir a transmissão exige consistência com o que está lá (identificadores, matrículas eSocial, eventos de tabela). Mitigação: download dos eventos históricos do próprio eSocial para reconstruir o RET local antes do F5, fixando a `matricula_esocial` de cada colaborador legado — **persistente, continua referenciada por todo evento pós-cutover** (só admitidos pós-cutover usam a matrícula própria); primeira competência oficial com dupla conferência.
6. **Transmissão em produção por engano durante a sombra**: trava dura de ambiente (produção real desabilitada por configuração até decisão de cutover registrada) + 2FA + segregação de funções.
7. **Duplicidade de eventos SST** se clínica/SOC e nós transmitirmos o mesmo S-2220: `rota_transmissao_sst` com vigência impede rota dupla ativa; a definição da rota é entregável da Fase 0, não pode ficar ambígua.
8. **Qualificação cadastral ruim gera rejeição em massa na carga inicial** (CPF×NIS×nome×nascimento divergentes): rodar qualificação em lote na Fase 0 e tratar pendências antes do F4.
9. **Middleware, se escolhido**: lock-in, custo por evento, terceiro processando remuneração (LGPD) — condições mínimas contratuais já listadas no critério do spike; sem elas, não assina.
10. **Dependência de disponibilidade do governo perto do prazo**: fila com retry + política de transmissão antecipada; indisponibilidade prolongada documentada (print/protocolo) como defesa administrativa.

## Perguntas abertas para DP/RH

1. **Certificado digital hoje:** a Fast possui e-CNPJ? A1 ou A3? Em nome de qual CNPJ? Onde está guardado e quem o usa? Validade?
2. **Estrutura societária das 5 unidades:** matriz + filiais do mesmo CNPJ ou CNPJs distintos? (Define S-1005, quantidade de certificados/procurações e o desenho do painel por estabelecimento.)
3. **Procurações eletrônicas:** quem transmite eSocial/DCTFWeb hoje em nome da Fast — a Nasajon (com que credencial?), o escritório contábil (com procuração no e-CAC?)? Existe relação das procurações vigentes?
4. **Quem transmite SST hoje** (S-2210/S-2220/S-2240): a clínica ocupacional (com que software — SOC?), a Nasajon ou o contador? Há recibos arquivados? (Mesma pergunta do módulo SST — a resposta define a `rota_transmissao_sst`.)
5. **DCTFWeb e DARF:** quem entrega e quem paga hoje? A contabilidade continuaria com a EFD-Reinf (retenções de serviços) fora do nosso escopo?
6. **Histórico:** conseguimos exportar da Nasajon (ou baixar do eSocial) os XMLs/recibos já transmitidos? Alguém já usou a consulta/download de eventos do eSocial?
7. **Qualificação cadastral:** já foi rodada alguma vez? Há histórico de rejeições recorrentes (NIS/CPF divergente) na transmissão atual?
8. **Rotina atual de prazos:** quem confere hoje que S-1200 foi aceito, que a guia do FGTS bateu, que a DCTFWeb foi entregue? Existe algum controle (planilha)?
9. **Responsável nomeado:** quem no DP será o dono do painel de obrigações (olhar diário) e quem terá `fiscal.transmitir` (com 2FA)? Aceitam a segregação fechar folha ≠ autorizar transmissão?
10. **Processos trabalhistas:** existem processos com decisões que exigem S-8500/S-8501? Quem transmite hoje?
11. **13º e calendário:** confirmar como os prazos de novembro/dezembro são tratados hoje — reforça a regra "cutover nunca entre novembro e janeiro".
