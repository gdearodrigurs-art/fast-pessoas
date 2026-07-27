# SST / Saúde Ocupacional (`rh_sst`) — ASO, PCMSO, PGR, CAT, EPIs e eventos eSocial de SST (monitoramento e, como evolução, transmissão própria)

> **Revisado em 2026-07-24 (v2) após decisões do usuário.** Versão original gerada em 2026-07-24 por análise
> multi-agente sobre as fontes "Fast-RH - Conhecimento a Migrar.md" e "Ficha-Conhecimento-Portal-para-RH.md".
> Esta revisão alinha o módulo à arquitetura v2 (`docs/02-arquitetura.md`): app próprio e separado na Fase A,
> stack Next.js + TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud, folha própria com transmissor
> fiscal próprio (módulo 12) e sem integração com o Nasajon (que fica só como sombra de conferência na transição).
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**

**Fase sugerida:** Fase 3 (expansão), conforme o roadmap v2 — com quatro ganchos antecipados que custam quase zero e evitam retrofit:

1. **Fase 0**: a descoberta "quem transmite os eventos SST hoje" (clínica com qual software — SOC? — , Nasajon ou escritório contábil) entra no levantamento; o **spike técnico de eSocial** (webservices, certificado digital, leiautes, produção restrita) já produz a informação de viabilidade da transmissão própria de SST (Rota B, abaixo).
2. **Fase 1**: criar as categorias documentais SST no GED (ASO, PGR, PCMSO, LTCAT, laudos, CAT, termo de EPI) e a categoria de temporalidade "saúde ocupacional — 20 anos pós-desligamento".
3. **Fase 2**: ASO admissional/demissional e devolução de EPI entram como itens dos checklists de admissão/desligamento (documento no GED, sem módulo SST completo).
4. **Trilha F**: o desenho da fila `evento_esocial` do domínio fiscal já reserva os tipos S-2210/S-2220/S-2240, mesmo que a transmissão própria de SST só seja ligada depois (Rota B).

Dentro da Fase 3, ordem interna sugerida: ASO + painel de vencimentos → EPI com ciência → CAT → painel eSocial SST → evoluções (matriz de risco, integração SOC, Rota B de transmissão, CIPA, NRs).

## Objetivo

Dar ao DP/RH da Fast o controle operacional de saúde e segurança ocupacional nas 5 unidades — vencimentos de exames (ASO), validade de programas (PGR/PCMSO), entrega de EPI com ciência digital, registro e prazo de CAT — **sem jamais assumir a responsabilidade técnica**, que é do médico do trabalho/engenheiro de segurança da clínica contratada. O módulo é um painel de conformidade + GED + motor de alertas: ele sabe O QUE vence, QUANDO vence, QUEM está pendente e SE o evento eSocial foi transmitido — e guarda a prova documental (documento com hash, ciência, trilha de auditoria).

**O que mudou na v2:** o sistema agora TEM um transmissor fiscal próprio (módulo 12 — eSocial, FGTS Digital, DCTFWeb, com certificado digital da empresa), então o antigo critério "transmissão nunca entra" deixa de ser absoluto. Para os eventos de SST (S-2210, S-2220, S-2240) existem **duas rotas**; o **destino desenhado é a transmissão própria (Rota B)**, com migração evento a evento após o gate F4 — o que se decide por evento é o momento da virada, não o destino:

- **Rota A — clínica credenciada transmite (estado de partida; recomendada para o MVP):** a clínica (via software próprio, ex.: SOC) transmite os eventos SST como já faz hoje; o nosso módulo registra status, transmissor e recibo no painel de monitoramento. É o ponto de partida natural do MVP: zero risco fiscal novo, zero dependência da Trilha F, e o dado clínico nasce na clínica mesmo — mas é **estado de partida, não destino**.
- **Rota B — transmissão própria pelo módulo 12 (destino desenhado):** os eventos SST entram na fila `evento_esocial` do domínio fiscal e são transmitidos com o nosso certificado digital. Pré-requisitos: spike eSocial concluído (Fase 0) e transmissor fiscal maduro em produção (marco F4 da Trilha F). Migração por evento após o gate F4: primeiro o **S-2210 (CAT)** — o fato gerador nasce no nosso sistema e a obrigação de comunicar é do empregador —, depois o **S-2240** (quando o `perfil_exposicao` estruturado existir), por último o **S-2220** (que depende de dado emitido pela clínica).

**Decisão de destino (do usuário):** o destino desenhado é a **transmissão própria (Rota B)**, migrada evento a evento após o gate F4, começando pelo S-2210; a **Rota A (clínica transmite) é o estado de partida** e pode ser mantida por evento **apenas por decisão registrada no log de decisões** — manter a clínica em definitivo é exceção, não opção neutra. Enquanto o Nasajon for o oficial (período de sombra da folha), quem transmite SST hoje continua transmitindo — a virada de rota nunca pode criar vácuo de responsabilidade.

Divisão próprio × terceiro, explícita:
- **PRÓPRIO (app Fast Pessoas):** agenda de vencimentos e convocações, GED dos documentos SST, ficha de EPI com ciência digital, registro interno de CAT com contagem de prazo, painel de status de transmissão eSocial, reflexos internos (linha do tempo, afastamento → ponto e folha próprios, checklists de admissão/desligamento) e, na Rota B, a própria transmissão dos eventos SST via módulo 12.
- **TERCEIRO (clínica ocupacional / assessoria SST):** elaboração e assinatura de PGR, PCMSO, LTCAT e laudos de insalubridade/periculosidade; realização de exames e emissão do ASO; na Rota A, a transmissão de S-2210/S-2220/S-2240 (a Fase 0 descobre quem faz isso hoje e com qual software).

## Funcionalidades

### MVP (primeiro corte do módulo, Fase 3)

#### 1. Cadastro de prestadores e programas
- **Clínica ocupacional / assessoria SST** por unidade: razão social, contatos, responsáveis técnicos (médico do trabalho do PCMSO, engenheiro/técnico do PGR), **transmissor por evento eSocial** (campo obrigatório — sai da descoberta da Fase 0; valores: clínica / próprio-módulo-12 / outro, com "Nasajon" aceito apenas como valor transitório durante a sombra).
- **Documentos de programa no GED** (`rh_documentos`): PGR (inventário de riscos + plano de ação), PCMSO, LTCAT e laudos de insalubridade/periculosidade como documentos com **data de emissão, vigência e data-limite de revisão** + alerta antecipado via n8n/WhatsApp (90/60/30 dias). O sistema não edita o conteúdo do programa — arquiva a versão vigente com hash e cobra a revisão (PGR: avaliação a cada 2 anos ou mudança de risco; relatório analítico anual do PCMSO).

#### 2. ASO — controle de exames ocupacionais
- Registro de ASO por colaborador: tipo (**admissional, periódico, retorno ao trabalho, mudança de riscos ocupacionais, demissional**), data de realização, clínica, médico, **resultado (apto / inapto / apto com restrição)**, data do próximo exame (informada pela clínica), PDF do ASO no GED **cifrado em aplicação** — resultado detalhado e restrições são dado de saúde.
- **Painel de vencimentos**: quem está com periódico vencido / a vencer em 30-60-90 dias, por unidade e por gestor (gestor vê status "em dia / a vencer / vencido" da equipe — **nunca** o conteúdo clínico).
- **Convocação de exame como demanda** (`rh_demandas`): DP dispara convocação → colaborador/gestor recebem via n8n/WhatsApp → agendamento registrado → conclusão anexa o ASO. Toda transição auditada.
- **Ganchos com admissão/desligamento** (checklists da Fase 2): ASO admissional como item bloqueante do checklist de admissão; ASO demissional com a regra de dispensa (exame realizado há menos tempo que o limite do PCMSO) registrada como decisão humana no checklist de desligamento.
- Registro do **status eSocial S-2220** por ASO: pendente / transmitido (por quem, quando, nº do recibo — digitado/importado na Rota A; automático na Rota B). Prazo de referência: até o dia 15 do mês seguinte à realização do exame.

#### 3. CAT — Comunicação de Acidente de Trabalho
- Registro interno do acidente/doença: tipo (típico, trajeto, doença ocupacional), data/hora, local/unidade, descrição, parte do corpo atingida, agente causador, houve afastamento?, houve óbito?, testemunhas, atestado médico (cifrado).
- **Contagem de prazo legal em destaque**: transmissão da CAT (S-2210) até o **1º dia útil seguinte** ao acidente; **imediata em caso de óbito**. Alerta n8n para o DP no registro e escalonamento se o status não virar "transmitida" dentro do prazo. Registro pós-fato é permitido (o sistema nunca é gargalo do prazo legal — ele cobra, não bloqueia).
- Rota A: registro de quem transmitiu, nº do recibo, CAT em PDF no GED. Rota B: o registro da CAT gera o S-2210 na fila `evento_esocial` do domínio fiscal; recibo volta automaticamente.
- **Reflexos internos**: cria evento na linha do tempo (`evento_colaborador`); se houver afastamento, abre o fluxo de `afastamento` (Fase 2) que reflete no **nosso** tratamento de ponto (espelho alimentado pelo REP-P contratado) e gera o **S-2230 na fila do módulo 12** (durante a sombra, o S-2230 segue pelo caminho oficial atual e o painel apenas registra); acidente de trabalho marca o afastamento com o tipo correto (estabilidade de 12 meses pós-retorno sinalizada na ficha).

#### 4. EPI — catálogo e termo de entrega digital
- **Catálogo de EPI**: item, fabricante, **CA (Certificado de Aprovação) e validade do CA**, vida útil estimada, unidades/funções que usam. Alerta de CA vencido/a vencer.
- **Entrega com ciência digital** (padrão GED): colaborador, itens, quantidade, motivo (primeira entrega, substituição periódica, dano/extravio), data — colaborador dá **ciência com hash** (quem, quando, hash do termo no momento). Substitui a ficha de papel; a NR-6 aceita expressamente registro em sistema eletrônico — não exige assinatura eletrônica qualificada de terceiro.
- **Devolução no desligamento**: itens pendentes de devolução entram como item do checklist de desligamento (Fase 2).
- Histórico completo de EPIs por colaborador (prova em passivo trabalhista).

#### 5. Painel de monitoramento eSocial SST
- Visão por competência: S-2210 (CATs do período), S-2220 (ASOs do período), S-2240 (condições ambientais — inicial e alterações) com status pendente/transmitido/erro, rota (A/B), responsável pela transmissão, prazo legal e recibo. Na Rota A o status é confirmado manualmente pelo DP (com evolução para conciliação via web services do SOC); na Rota B o status vem nativo da fila `evento_esocial`. Alimenta a `obrigacao_competencia` do painel de compliance.

### Evolução (após o MVP estabilizar)

- **Rota B — transmissão própria dos eventos SST** pelo módulo 12 (**destino desenhado do módulo, não opção facultativa**): liga-se por evento (S-2210 → S-2240 → S-2220), com gate explícito (transmissor fiscal em produção estável pós-F4) e decisão registrada no log. O painel deixa de ser só registro e passa a ser a fila de transmissão.
- **Matriz de risco × exame por cargo/setor (motor do PCMSO operacional)**: `perfil_exposicao` versionado com vigência (agente nocivo da tabela 24 do eSocial, setor, cargo, unidade) × exames exigidos e periodicidade → **geração automática de convocações** e base do S-2240 (na Rota A, conferência do que a clínica declarou; na Rota B, fonte geradora do evento). Hoje isso vive no PCMSO em PDF; a evolução estrutura.
- **Integração com o SOC** (candidato confirmado na pesquisa de mercado — `docs/05-pesquisa-mercado.md`: web services SOAP/WSDL válidos e documentados): importação de agenda de exames, resultados (apto/inapto) e status de transmissão — via domínio `integracoes/`, com staging, conciliação e fila de divergência, como qualquer fonte externa. Contrato/credenciais validados antes de depender; plano B permanente: digitação + PDF. Condição prática: a clínica da Fast precisa usar SOC (pergunta da Fase 0).
- **Treinamentos NR com validade** (NR-11 empilhadeira em depósito, NR-10 se houver eletricista, NR-35 se aplicável): reciclagem com vencimento e alerta, ligado ao módulo de treinamentos (Fase 3); integração com plataforma de treinamento só com contrato de API validado, senão manual. Certificado no GED com ciência.
- **Gestão de CIPA** (NR-5): mandatos, dimensionamento por unidade, atas no GED, **estabilidade do cipeiro sinalizada na ficha** (bloqueio soft no fluxo de desligamento: aviso, decisão humana registrada).
- **Indicadores SST** no people analytics (Fase 3): taxa de frequência/gravidade de acidentes, absenteísmo por acidente/doença ocupacional, ASOs vencidos por unidade, custo de EPI por centro de custo. **Vedação mantida: nunca cruzar desempenho × saúde.**
- **Insalubridade/periculosidade como variável da folha própria**: quando o laudo (LTCAT/laudo específico) conceder adicional, o DP registra a **incidência por colaborador com vigência e referência ao laudo** → vira insumo de rubrica no motor de cálculo próprio (`rh_folha`, rubrica versionada). Este módulo **não calcula** o adicional — só rastreia origem (laudo) e vigência; quem calcula é o motor da folha, pela rubrica vigente.
- Suporte documental ao **PPP digital**: o PPP é gerado a partir dos S-2240 transmitidos; o módulo guarda o encadeamento laudo → perfil de exposição → evento transmitido (na Rota B, o evento inteiro é nosso) para responder fiscalização/perícia.

## Entidades de dados

Todas no schema `rh` do PostgreSQL dedicado (SaveinCloud), domínio `rh_sst` no backend Node/TypeScript, padrão em camadas da arquitetura v2. Parametrizadores com versão/vigência ("fechado não reabre"); documentos via `rh_documentos` (GED com hash); **dado de saúde cifrado em aplicação** (chave em secret manager); acesso pelo pool `app_rh` (os pools `app_folha` e `app_clima` não enxergam dado de saúde).

### Prestadores e programas
- **`prestador_sst`** — clínica/assessoria: razão social, CNPJ, unidades atendidas, contatos, responsáveis técnicos (médico PCMSO com CRM, eng./técnico PGR), **transmissor por evento** (S-2210/S-2220/S-2240: clinica | proprio | outro; "nasajon" apenas como valor transitório durante a sombra), software usado pela clínica (SOC? — habilita a integração da evolução). Relação N:N com unidade.
- **`programa_sst`** — tipo (PGR, PCMSO, LTCAT, laudo insalubridade, laudo periculosidade), unidade(s), FK `documento` (GED), data de emissão, vigência, **data-limite de revisão**, responsável técnico, status (vigente/vencido/substituído). Nova versão = nova linha, nunca UPDATE (padrão vigência).

### ASO e exames
- **`aso`** — FK colaborador, tipo (admissional/periódico/retorno/mudança_risco/demissional), data de realização, FK prestador, médico emitente, **resultado (apto/inapto/apto_com_restricao) — cifrado junto com observações/restrições**, data do próximo exame, FK `documento` (PDF cifrado), status. Leitura do conteúdo clínico grava **trilha de leitura** no `audit`.
- **`convocacao_exame`** — FK colaborador, tipo de exame, motivo (vencimento/admissão/retorno/mudança de risco), FK `demanda` (workflow), data-alvo, status (aberta/agendada/realizada/expirada), FK `aso` resultante.
- **`evento_sst_esocial`** — tipo (S-2210/S-2220/S-2240), FK entidade de origem (cat/aso/perfil_exposicao), competência, **rota (A: terceiro transmite | B: próprio)**, transmissor declarado, **status (pendente/transmitido/erro), nº recibo, data de transmissão, prazo legal calculado**, confirmação (manual na Rota A; conciliada via SOC como evolução; automática na Rota B via FK para `evento_esocial` do domínio fiscal). Alimenta `obrigacao_competencia`.

### CAT
- **`cat`** — FK colaborador, tipo (típico/trajeto/doença ocupacional), data/hora do acidente, unidade/local, descrição, parte do corpo (tabela eSocial), agente causador (tabela eSocial), óbito (bool), houve afastamento (bool), FK `afastamento` (quando houver), atestado/laudo (FK documento, cifrado), **prazo-limite de transmissão (D+1 útil; imediato se óbito)**, FK `evento_sst_esocial` (S-2210), FK documento CAT emitida. Gera `evento_colaborador` na linha do tempo. Append-only: retificação de CAT é novo registro ligado ao original, nunca UPDATE do fato.

### EPI
- **`epi_catalogo`** — item, descrição, fabricante, **CA + validade do CA**, vida útil estimada (dias), ativo. Alerta de CA a vencer.
- **`epi_entrega`** — FK colaborador, itens/quantidades (linhas filhas `epi_entrega_item` com FK catálogo), data, motivo (primeira/substituição/dano/extravio), **FK `ciencia`** (hash do termo no momento — padrão GED), devolução (data, condição) — pendência de devolução consultada pelo checklist de desligamento.

### Evolução (não entram no MVP)
- **`perfil_exposicao_versao`** — unidade × setor × cargo, agentes nocivos (código tabela 24 eSocial), medidas de proteção, EPIs exigidos, **exames exigidos × periodicidade**, vigência. Base do S-2240 (conferência na Rota A; geração na Rota B) e do motor de convocação automática. Versionada como toda regra.
- **`treinamento_nr`** — NR, colaborador, data, validade, certificado (GED + ciência), status de reciclagem.
- **`mandato_cipa`** — unidade, gestão, membros (titular/suplente), início/fim, **fim da estabilidade** (1 ano pós-mandato), atas (GED).
- **`incidencia_adicional`** — colaborador, tipo (insalubridade grau/periculosidade), FK laudo (`programa_sst`), vigência → origem rastreada do insumo de rubrica na folha própria (`rh_folha`).

### Relações com o restante do modelo
`aso`/`cat`/`epi_entrega` → geram `evento_colaborador` (linha do tempo, append-only, payload JSONB validado por tipo). `cat` → `afastamento` (Fase 2) → tratamento de ponto próprio (espelho do REP-P) e S-2230 na fila do módulo fiscal. `aso` admissional/demissional → `item_checklist` dos processos de admissão/desligamento. `incidencia_adicional` → insumo de rubrica no `rh_folha`. `evento_sst_esocial` (Rota B) → `evento_esocial` do domínio fiscal. Vencimentos → n8n/WhatsApp (referências no payload, nunca dado de saúde). Temporalidade: registros de monitoramento de saúde etiquetados com retenção de **20 anos após o desligamento** na tabela de temporalidade por categoria.

## Papéis e permissões

Papéis próprios do app na Fase A (`funcionario` / `gestor` / `rh` / `dp` / `admin`), com **2FA obrigatório para dp/rh/admin** e chaves de permissão finas do módulo (`sst.operar`, `sst.gerenciar`, `documento_sensivel.ver`) **sempre validadas no backend**. RLS via `SET LOCAL` no Postgres onde couber; onde não couber, autorização na camada de repositório coberta pela matriz de testes papel × recurso no CI. Nada é herdado do portal na Fase A; o mapeamento com o portal é assunto da Fase B.

| Papel | Vê | Faz |
|---|---|---|
| **Funcionário** | Próprios ASOs (status e documento — é titular do dado), próprios termos de EPI, próprias convocações | Dá ciência na entrega de EPI; responde convocação (agendamento) via demanda |
| **Gestor** | Da equipe (via `relacao_gestor` vigente): **status** de ASO (em dia/a vencer/vencido), pendências de EPI, treinamentos NR vencendo. **Nunca resultado clínico, restrição, atestado ou CID** — ausência no payload, não máscara | Registra comunicação inicial de acidente (abre pré-CAT para o DP completar); cobra pendências da equipe |
| **DP** (`sst.operar`) | Painéis completos de vencimento, CATs, EPIs, status eSocial de todas as unidades do seu escopo | Registra ASO/CAT/entrega de EPI; dispara convocações; confirma status de transmissão (Rota A); envia eventos à fila fiscal (Rota B); anexa documentos |
| **DP com `documento_sensivel.ver`** | Conteúdo clínico do ASO/atestado (cifrado) — **cada leitura grava trilha** | — |
| **RH** (`sst.gerenciar`) | Tudo do DP + programas | Cadastra prestadores; publica versões de PGR/PCMSO/laudos; parametriza alertas; registra incidência de adicional (com laudo); decide dispensa de ASO demissional (decisão humana registrada) |
| **Admin** | Configuração e trilhas do `audit` (alteração e leitura); **não vê conteúdo clínico por padrão** (cifração em aplicação; acesso DBA nominal e logado) | Mantém integrações/flags; gestão de usuários |

Regras transversais: pool de banco `app_rh` segregado (folha e clima não enxergam dado de saúde); `audit` só-INSERT garantido por GRANT, com **duas trilhas** (alteração + leitura de dado sensível); "gestor vê equipe" deriva exclusivamente de `relacao_gestor` vigente; escrita transacional sempre. Um papel "auditor somente-leitura" pode ser detalhado na Fase B, se a auditoria interna pedir.

## Integrações

Tudo via domínio `integracoes/` (staging por entidade, conciliação com fila de divergência, snapshot imutável do importado, log de carga no `audit`, plano B batch embutido). Nenhuma integração no caminho síncrono de tela.

| Sistema | Direção | O quê |
|---|---|---|
| **Clínica ocupacional / SOC** | Entrada (evolução) | Agenda de exames, resultado apto/inapto, status de transmissão S-2220/S-2240. **Candidato confirmado na pesquisa de mercado: SOC expõe web services SOAP/WSDL válidos** (`docs/05-pesquisa-mercado.md`). **MVP: sem integração — digitação + upload de PDF.** Condições: a clínica da Fast usar SOC e contrato/credenciais validados antes de depender. Cláusula contratual com a clínica: exportação dos dados/prontuários em caso de troca de fornecedor |
| **eSocial (módulo 12 — transmissor fiscal próprio)** | Saída (Rota B, evolução) | S-2210/S-2220/S-2240 entram na fila `evento_esocial` e são transmitidos com o certificado digital da empresa. **Na Rota A (recomendada no MVP) não há transmissão pelo sistema** — o painel registra transmissor, data e recibo. O S-2230 (afastamento decorrente de CAT) é do módulo fiscal desde o desenho, gatilhado pelo fluxo de afastamento |
| **Nasajon (sombra, transitório)** | Nenhuma integração | Sem API pública de folha; não há conector. Enquanto for o oficial na transição, pode ser quem transmite eventos SST hoje (descoberta da Fase 0) — nesse período o painel registra status manualmente. Após o cutover da folha, sai de cena por completo |
| **REP-P (Pontomais, candidata líder)** | Indireta | O afastamento aberto por CAT reflete no tratamento de ponto próprio (espelho alimentado pelo REP-P via API/webhooks) — este módulo não fala com o REP-P diretamente |
| **n8n + WhatsApp Cloud API / e-mail** | Saída | Alertas: ASO a vencer/vencido, prazo de CAT correndo (escalonamento), CA de EPI vencendo, revisão de PGR/PCMSO, treinamento NR vencendo, devolução de EPI pendente no desligamento. **Payload só com referências (IDs + link com controle de acesso), jamais dado de saúde** |
| **Módulos internos** | Bidirecional | `rh_colaboradores`: eventos na linha do tempo; `rh_demandas`: convocação e pendências como demandas; `rh_documentos`: todo documento SST no GED com hash/ciência; admissão/desligamento: ASO admissional (bloqueante) e demissional + devolução de EPI como itens de checklist; ponto/afastamentos: acidente → afastamento → espelho; `rh_folha` (folha própria): incidência de adicional como insumo de rubrica com origem rastreada; `fiscal`: fila `evento_esocial` (Rota B) e painel `obrigacao_competencia` com os prazos SST na agenda de compliance |
| **DW SAP** | Nenhuma | Dado de SST não existe no DW; sem dependência (DW segue read-only analítico) |

## Regulatório

- **NR-1 (GRO/PGR)**: inventário de riscos + plano de ação obrigatórios; avaliação a cada 2 anos ou quando muda o risco. Atendido por: `programa_sst` com vigência, data-limite de revisão e alerta; responsabilidade técnica permanece com o profissional habilitado do prestador — o sistema arquiva e cobra, não elabora.
- **NR-7 (PCMSO/ASO)**: exames admissional, periódico, retorno ao trabalho, mudança de riscos e demissional; periodicidade definida pelo médico no PCMSO; **prontuário/registro de monitoramento de saúde mantido por 20 anos após o desligamento**. Atendido por: tipos de ASO modelados, painel de vencimento, convocação auditada, categoria de temporalidade "saúde ocupacional — 20 anos pós-desligamento" (nunca eliminada por rotina LGPD comum).
- **NR-6 (EPI)**: fornecimento gratuito, adequado ao risco, com CA válido; **registro de fornecimento aceito em sistema eletrônico** — o termo digital com ciência por hash tem amparo expresso na norma. Atendido por: catálogo com CA/validade, entrega com ciência, histórico completo como prova.
- **eSocial SST — prazos monitorados sempre; transmitidos pelo sistema só na Rota B**: **S-2210 (CAT)** até o 1º dia útil seguinte ao acidente, imediato em óbito; **S-2220 (ASO)** até o dia 15 do mês seguinte ao exame; **S-2240 (agentes nocivos)** até o dia 15 do mês seguinte ao início/alteração da exposição. Atendido por: `evento_sst_esocial` com prazo calculado, alerta e escalonamento; recibo arquivado. Na Rota B valem também os padrões do módulo fiscal: fila com estados, retificação como evento novo ("fechado não reabre"), certificado digital em secret manager.
- **CAT/estabilidade**: acidente com afastamento > 15 dias → estabilidade de 12 meses pós-retorno (art. 118, Lei 8.213/91) — sinalizada na ficha e no fluxo de desligamento (aviso + decisão humana registrada).
- **LGPD**: resultado de exame, restrição, atestado e CID são **dado sensível de saúde (art. 5º, II)**; base legal: cumprimento de obrigação legal/regulatória do empregador (art. 11, II, a) — mapeada por tratamento no catálogo de bases legais. Atendido por: cifração em aplicação (chave em secret manager), ausência no payload de quem não pode ver, trilha de LEITURA desde o primeiro dia do módulo, gestor vê período/status e nunca conteúdo clínico, n8n/WhatsApp sem dado de saúde, minimização no schema (o sistema não guarda resultado de exame complementar — só o ASO), RIPD do módulo antes do primeiro uso (dado de saúde em novo tratamento). Conflito imutabilidade × eliminação: anonimização do domínio, nunca UPDATE no `audit` — respeitando a retenção de 20 anos, que prevalece sobre pedido de eliminação (obrigação legal).
- **Portaria 671/2021**: não incide neste módulo (é de ponto — atendida pelo REP-P contratado e pelo módulo de ponto); citada só para delimitar: nada de SST toca registro de jornada.

## Dependências

- **Fase 0 (descoberta e spike)**: mapear quem transmite S-2210/S-2220/S-2240 hoje por unidade (clínica × Nasajon × contador) e com qual software (SOC?) — essa resposta define o ponto de partida do painel e o custo da Rota B; spike eSocial (webservices, certificado, leiautes, produção restrita) informa a viabilidade técnica da Rota B; RIPD e tabela de temporalidade cobrindo dado de saúde; parecer de privacidade (DPO/responsável LGPD) sobre dado de saúde no banco dedicado.
- **Fase 1**: `colaborador` + `evento_colaborador` (linha do tempo), `rh_demandas` (convocações e pendências), GED mínimo com ciência/hash, autenticação e papéis próprios do app (com 2FA para dp/rh/admin), `audit` em duas trilhas, `relacao_gestor` com vigência.
- **Fase 2**: `afastamento` (o CAT com afastamento pendura nele; cifração de saúde já estabelecida ali), checklists de admissão/desligamento (ganchos do ASO admissional/demissional e devolução de EPI), ponto com REP-P operante (reflexo do afastamento no espelho).
- **Trilha F**: F1-F2 para a incidência de adicional virar rubrica calculada pela folha própria; **F4 (fiscal em produção restrita) é pré-requisito duro da Rota B** — sem transmissor fiscal maduro, a Rota B não liga.
- **Infra transversal**: n8n + WhatsApp Cloud API para alertas; feature flag própria do módulo; cifração em aplicação + secret manager já em uso desde os afastamentos (Fase 2) — o módulo SST reusa, não introduz; backup diário + PITR com restore testado (padrão da plataforma).
- **Contratual**: clínica ocupacional com responsáveis técnicos definidos e cláusula de exportação de dados; certificado digital da empresa (e-CNPJ) válido e sob gestão de secret manager para a Rota B; sem clínica contratada não há PCMSO/PGR válidos e o módulo vira painel de lacunas (útil, mas é bom saber antes).

## Riscos

1. **Ilusão de conformidade na Rota A**: o painel de status depende de confirmação manual — se o DP não confirmar, o painel diverge da realidade e dá falsa segurança. Mitigação: status "não confirmado" visualmente distinto de "transmitido", alerta de pendência de confirmação, conciliação via SOC como evolução prioritária e Rota B como solução definitiva por evento.
2. **Rota B amplia a responsabilidade fiscal**: transmitir SST com certificado próprio significa assumir erros de leiaute, rejeições e retificações que hoje são do terceiro. Mitigação: gate duro (F4 + produção restrita), migração evento a evento começando pelo S-2210, decisão registrada no log — nunca ligar por conveniência de cronograma.
3. **Vácuo de responsabilidade na transição**: durante a sombra da folha, quem transmite SST hoje (possivelmente a Nasajon) precisa continuar até a virada formal; a troca de transmissor sem comunicação à clínica/contabilidade pode deixar evento sem dono. Mitigação: campo "transmissor por evento" obrigatório desde o cadastro, revisado no cutover.
4. **Prazo da CAT (D+1 útil)**: nenhum sistema resolve prazo se ninguém registra; o desenho aceita registro pós-fato e o alerta escala — mas o processo humano (quem comunica acidente no fim de semana?) precisa existir fora do sistema.
5. **Dupla fonte com o software da clínica**: a clínica tem sistema próprio (prontuário, agenda); sem regra de dono único por campo, ASO digitado aqui e lá diverge. Regra: a clínica é dona do dado clínico; o Fast Pessoas é dono do controle (vencimento, ciência, prova) — nunca replicar prontuário.
6. **Dado de saúde é a categoria mais sensível do sistema**: mesmo em banco dedicado, este módulo é o teste mais duro dos padrões de segurança reimplementados em Node (cifração em aplicação, trilha de leitura, GRANTs) — nada vem "de graça" do portal; a matriz de testes papel × recurso no CI precisa cobrir os casos de saúde antes do primeiro uso real.
7. **Tabelas eSocial mudam** (tabela 24 de agentes, parte do corpo, agente causador): manter como dado versionado importável, nunca hardcoded — na Rota B isso vira dependência direta do módulo fiscal, que já versiona leiautes.
8. **Escopo-armadilha**: gestão de CIPA, brigada, audiometria sequencial e PPP completo podem inflar o módulo — manter no backlog de evolução com critério de valor.
9. **Coerência com a arquitetura v2**: o módulo se encaixa no desenho (`rh_sst`, Fase 3, Rota A no MVP); o detalhamento acrescenta ao modelo resumido `prestador_sst`, `programa_sst`, `convocacao_exame` e `evento_sst_esocial`, todos coerentes com os padrões (vigência, GED, append-only) e com a fila `evento_esocial` do domínio fiscal.

## Perguntas abertas para DP/RH

1. Quem transmite S-2210, S-2220 e S-2240 hoje, por unidade: a clínica (com qual software — SOC?), a Nasajon, ou o escritório contábil? Há recibos arquivados?
2. Qual(is) clínica(s) ocupacional(is) atendem as 5 unidades — uma só ou uma por município? O contrato tem cláusula de exportação de dados? A clínica usa SOC (habilitaria a integração por web services)?
3. Existem PGR e PCMSO vigentes por unidade? Quais as datas de emissão/revisão? Quem são os responsáveis técnicos?
4. Qual o grau de risco (CNAE) das unidades — isso dimensiona SESMT e CIPA (NR-4/NR-5); existe CIPA constituída em alguma unidade?
5. Alguém recebe adicional de insalubridade ou periculosidade hoje? Existem laudos? Como isso chega à folha atualmente (vai virar rubrica no motor próprio — precisamos da regra exata)?
6. Como é feita hoje a ficha de entrega de EPI (papel? planilha?) e quais EPIs o comércio/depósito da Fast realmente usa (empilhadeira → NR-11? estoque em altura → NR-35?)?
7. Já houve CAT nos últimos 5 anos? Quem emitiu e transmitiu?
8. A periodicidade dos exames periódicos está definida no PCMSO por função — a clínica fornece a data do próximo exame no próprio ASO?
9. O médico coordenador emite o relatório analítico anual do PCMSO — quem o recebe e onde é arquivado hoje?
10. Cronograma da migração para a transmissão própria (Rota B — **destino desenhado**, decisão já tomada pelo usuário): a migração evento a evento após o gate F4 começa pelo S-2210 **junto do cutover da folha ou depois dele**? Manter a clínica transmitindo algum evento em definitivo é **exceção que exige decisão expressa do usuário, registrada no log de decisões** — se DP/RH enxergarem motivo para isso em algum evento específico (ex.: S-2220, que depende de dado emitido pela clínica), qual e por quê?
11. Para o responsável por privacidade/DPO: o RIPD do projeto já cobre dado de saúde de SST (retenção de 20 anos × direito de eliminação), ou precisa de adendo específico antes da Fase 3?
