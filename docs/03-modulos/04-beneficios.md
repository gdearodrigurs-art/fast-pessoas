# Benefícios (rh_beneficios) — VT, VR/VA, plano de saúde/odonto, convênios, elegibilidade, adesão/cancelamento, desconto em folha e faturas de operadoras

> Revisado em 2026-07-24 (v2) após decisões do usuário. Versão original gerada em
> 2026-07-24 por análise multi-agente sobre as fontes "Fast-RH - Conhecimento a Migrar.md"
> e "Ficha-Conhecimento-Portal-para-RH.md".
> **Status: PROPOSTA — nada aqui é definitivo até validação expressa do usuário. Fase sem código.**
>
> **O que mudou na v2:** o sistema é um app próprio e separado do portal (Fase A), em Next.js + TypeScript + Node.js com PostgreSQL dedicado na SaveinCloud; a folha é PRÓPRIA (sem integração Nasajon) — os descontos/créditos de benefícios viram variáveis da folha própria e o cálculo legal (teto de 6% do VT, limite PAT, incidências) é das rubricas do motor `rh_folha`, nunca deste módulo; o eSocial (S-1010/S-1200) é do domínio `fiscal/` próprio; a identidade é própria na Fase A (papéis funcionário/gestor/rh/dp/admin, matrícula própria como chave); o Nasajon aparece só como referência funcional e fonte de comparação durante a sombra da folha; integrações de mercado atualizadas com pesquisa verificada (Flash/Swile/iFood com API pública real; Caju sem API pública comprovada; Alelo/VR atrás de portal de dev).

**Fase sugerida:** MVP na **Fase 2** do roadmap v2 (junto do bloco admissão → afastamentos → ponto → férias → desligamento): catálogo + elegibilidade versionada + adesão/cancelamento via demandas + termos com ciência + geração de variáveis para a folha própria. Como a folha própria roda em sombra (trilha F) enquanto o Nasajon segue oficial, o MVP entrega DOIS destinos para o mesmo dado: variáveis para o motor próprio (automático) e **relatório de lançamentos por competência para o DP digitar no Nasajon** como faz hoje (apoio de transição, não integração). Evolução na **Fase 3** ("benefícios passo 2"): importação e conciliação de faturas, movimentação para operadoras, gestão de contratos, suspensões automáticas, painel de custos e integração por API com plataformas de benefícios flexíveis. Sem antecipações: nada de fatura/movimentação antes de a folha própria ter ao menos uma competência de sombra comparada.

## Objetivo

Ser a fonte única e auditável do vínculo colaborador×benefício na Fast: catálogo de benefícios com regra de elegibilidade versionada por cargo/unidade/vínculo, ciclo de vida de adesão/alteração/cancelamento (titular e dependentes) rodando sobre o motor de demandas com ciência digital, e geração das variáveis de desconto/provento para a **folha própria** (domínio `rh_folha`), com origem rastreada até a adesão e a versão de tabela de preço. Na evolução, conciliação de faturas de operadoras e movimentação (inclusão/exclusão) com trilha completa. Fronteira permanente: o módulo administra o **vínculo e o insumo** (quantidades, valores de tabela, adesões ativas); o **cálculo legal** (teto de 6% do VT, limite PAT, incidências, proporcionalidades) é da rubrica versionada no motor de folha próprio, e a **transmissão fiscal** (S-1010, S-1200, FGTS Digital, DCTFWeb) é do domínio `fiscal/`. Benefícios nunca calcula rubrica, nunca transmite obrigação.

## Funcionalidades

### MVP (Fase 2 — "Benefícios (cadastro)")

**1. Catálogo de benefícios**
- Cadastro por tipo: VT, VR, VA, plano de saúde, plano odontológico, convênio/parceria (farmácia, academia etc.), outros (seguro de vida, cesta se CCT obrigar).
- Por benefício: operadora/fornecedor, abrangência (quais unidades), modelo de custeio (100% empresa / coparticipado / 100% colaborador), flag **contributário** (crítico para art. 30/31 da Lei 9.656/98 no desligamento), se admite dependentes, documentos exigidos por evento (adesão/cancelamento/inclusão de dependente).
- Opções internas do benefício quando houver (ex.: saúde enfermaria × apartamento; odonto básico × master), cada uma com tabela de preço própria.
- **Vínculo com o catálogo de rubricas próprio:** cada benefício aponta a(s) `rubrica_versao` de desconto/provento correspondente(s) no domínio `rh_folha` (de-para explícito, versionado). Benefício sem rubrica mapeada não gera variável — trava de configuração, não erro silencioso.

**2. Regra de elegibilidade versionada com vigência** (mesmo padrão de versionamento de `rubrica_versao`/`tabela_legal_versao` do domínio `rh_folha`)
- Critérios estruturados: cargo (funcional, de `rh.cargo`), unidade/lotação, `tipo_vinculo` (CLT/estagiário/aprendiz/PJ/temporário), tempo de casa mínimo, categoria sindical/CCT.
- Ciclo rascunho→ativa→encerrada; mudança de regra **não** mexe em adesão existente — vale só para adesões novas (sem recálculo retroativo). "Fechado não reabre."
- Tabelas de valores versionadas: preço por faixa etária (saúde/odonto, faixas ANS), valor facial VR/VA, tarifa VT — cada reajuste é **nova versão com vigência**, nunca UPDATE.

**3. Adesão (titular)** — workflow sobre `rh_demandas`
- Origem: solicitação do colaborador no app, do DP, ou item do checklist de **admissão**.
- Etapas: solicitação → validação de elegibilidade (automática, contra a versão vigente) → documentos no GED → **termo de adesão com ciência digital (hash)** → efetivação com data de vigência respeitando a **data de corte mensal** do benefício.
- Toda transição auditada; evento gravado em `evento_colaborador`.

**4. Dependentes**
- Reusa `rh.dependente` do núcleo (nunca cadastro paralelo); adesão de dependente = extensão da adesão do titular, com documentos comprobatórios no GED e impacto na tabela de preço.

**5. Cancelamento e alteração**
- A pedido do colaborador (termo de cancelamento com ciência — protege a empresa em questionamento futuro), por perda de elegibilidade (mudança de cargo/unidade detectada por `posicao_colaborador`/`lotacao`), ou por **desligamento** (lista de cancelamentos entra no checklist de `processo_desligamento`; se plano contributário, o sistema gera o aviso do direito de manutenção — art. 30/31).
- Troca de opção (ex.: enfermaria→apartamento) como alteração com vigência, nunca sobrescrita.

**6. Vale-transporte**
- **Termo de opção OU renúncia obrigatório** na admissão e revisável, com ciência digital e hash (Decreto 10.854/2021).
- Cadastro do insumo: operadora de bilhetagem por município/unidade, linhas/itinerário, quantidade de passagens/dia, tarifa vigente (versionada).
- O módulo **não calcula os 6%**: envia quantidade × tarifa como insumo; a rubrica de VT do motor `rh_folha` aplica o teto legal (parametrizado em `rubrica_versao`, com memória de cálculo no `calculo_item`).

**7. Geração de variáveis para a folha própria**
- A cada `competencia_folha` em estado `aberta`: adesões ativas na competência → `variavel_folha` com origem rastreada (benefício, adesão, versão de tabela de preço, rubrica mapeada). Suporta **desconto e provento/estorno** (ex.: devolução de desconto indevido) — sinal/tipo vem da rubrica.
- Trava de estado: variáveis de benefícios ficam read-only quando a competência sai de `aberta`; após o fechamento, congelam no `snapshot_fechamento` — correção é evento novo na competência seguinte.
- Conferência do resultado acontece na esteira da folha própria (divergências) — não aqui.

**8. Apoio à transição (enquanto o Nasajon é oficial — temporário, morre no cutover)**
- **Relatório de lançamentos por competência** (benefício × colaborador × rubrica Nasajon equivalente × valor/insumo) para o DP digitar no Nasajon exatamente como faz hoje. É relatório, não integração.
- Os mesmos dados alimentam a folha própria em sombra; a `comparacao_sombra` da trilha F confere se o descontado no Nasajon bate com o calculado pelo motor próprio — divergência em rubrica de benefício aponta erro de tabela de preço, de de-para de rubrica ou de digitação.

**9. Visão do colaborador**
- "Meus benefícios": adesões ativas, dependentes, termos assinados, histórico, solicitações em andamento. Sem valores de outros colaboradores, por construção (RLS via `SET LOCAL` onde couber; senão autorização no repositório coberta pela matriz de testes papel × recurso no CI).

**10. Notificações via n8n (WhatsApp Cloud API + e-mail transacional)**
- Adesão efetivada, pendência de documento, cancelamento, aviso de reajuste — payload só com referências, nunca valor/dado sensível; o acesso ao conteúdo exige login no app com papel validado.

### Evolução (Fase 3 — "benefícios passo 2")

**11. Importação e conciliação de fatura de operadora** (camada `integracoes/`)
- Staging por operadora, snapshot imutável do arquivo com hash, contrato de layout tipado e versionado (validação de esquema no conector, em TypeScript); conciliação fatura × adesões ativas na competência → relatório de divergência (cobrado sem adesão, aderido sem cobrança, valor divergente da tabela vigente) com **fila de resolução obrigatória** antes de aprovar o pagamento.
- Coparticipação extraída da fatura vira `variavel_folha` — com **mapeamento explícito competência-da-fatura × competência-de-desconto** (faturas chegam com defasagem M-1/M-2).

**12. Movimentação para operadoras**
- Fila de movimentações pendentes (inclusão/exclusão/alteração de titular e dependente) gerada automaticamente pelos eventos de adesão; envio por arquivo/layout da operadora (**plano B batch como primário** — API só se existir e for validada, regra do precedente de pesquisa verificada), status por item, comprovante de protocolo no GED, log de carga no audit.

**13. Integração por API com plataformas de benefícios flexíveis** (condicionada à operadora contratada — pesquisa verificada em `docs/05-pesquisa-mercado.md`)
- **Flash, Swile e iFood Benefícios têm API pública real** — candidatas naturais se a Fast migrar VR/VA/benefício flexível para cartão: pedidos de recarga, extrato de carga e movimentação de vidas por API, com o mesmo desenho de staging/snapshot/conciliação.
- **Caju não tem API pública comprovada** — se contratada, opera por batch/portal.
- **Alelo e VR exigem conta no portal de desenvolvedor** para sequer avaliar a API — a validação técnica só é possível após relação comercial; até lá, assumir batch.
- Nenhuma integração assumida sem contrato de API verificado; o plano batch é sempre o piso.

**14. Gestão de contratos de operadoras** — vigência, data de aniversário/reajuste, alerta n8n de antecedência para renegociação.

**15. Painel de custos** — custo empresa × desconto colaborador por benefício, unidade e centro de custo (`lotacao`); cruzamento com DW **somente analítico**, nunca no caminho crítico.

**16. Suspensões automáticas parametrizadas** — VT suspenso em férias e afastamento; regra de manutenção de plano de saúde durante afastamento INSS; tudo por regra versionada, refletindo em variáveis da competência (inclusive estorno/cobrança acumulada no retorno, conforme regra parametrizada).

**17. Reajuste assistido** — nova versão de tabela de preço + comunicação em massa com ciência digital.

## Entidades de dados

Domínio `rh_beneficios`, no PostgreSQL dedicado (SaveinCloud), acessado pelo pool `app_rh`. Convenções da arquitetura v2: parametrizadores com versão+vigência ("fechado não reabre"); escrita transacional/append; toda mudança de estado no `audit` (só-INSERT garantido por GRANT, duas trilhas: alteração + leitura de dado sensível); eventos relevantes projetados em `evento_colaborador`.

| Entidade | Campos principais | Relações / observações |
|---|---|---|
| **`beneficio`** | tipo (VT/VR/VA/saude/odonto/convenio/outro), nome, operadora_id, admite_dependentes, contributario (bool), status | 1:N com versões e opções. Identidade estável do benefício |
| **`operadora_beneficio`** | razão social, CNPJ, tipo, contato, layout_movimentacao (ref. contrato em `docs/integracoes/`), capacidade_api (verificada/batch), dia_corte, dia_vencimento_fatura | Fornecedores, concessionárias de bilhetagem e plataformas flexíveis |
| **`beneficio_versao`** | beneficio_id, regra_elegibilidade estruturada (cargo[], unidade[], tipo_vinculo[], tempo_casa_min, categoria_cct), modelo_custeio (percentual/valor empresa × colaborador), documentos_exigidos[], vigencia_inicio/fim, status (rascunho/ativa/encerrada), responsável | Mesmo padrão de versionamento de `rubrica_versao`/`tabela_legal_versao`. Nunca recálculo retroativo |
| **`beneficio_rubrica`** | beneficio_id, rubrica_versao_id (de `rh_folha`), tipo (desconto/provento/estorno), vigência | De-para benefício × rubrica própria; benefício sem rubrica não gera variável. Campo informativo adicional: código da rubrica Nasajon equivalente (só para o relatório de transição e a comparação da sombra) |
| **`opcao_beneficio`** | beneficio_id, nome (ex.: apartamento), descrição | Variantes internas de um mesmo benefício |
| **`tabela_preco_versao`** | opcao_beneficio_id, linhas por faixa etária ANS ou valor único, vigencia, status | Reajuste = nova versão |
| **`adesao`** | colaborador_id, beneficio_id, opcao_beneficio_id, beneficio_versao_id (a que valeu na adesão), status (solicitada/pendente_doc/ativa/suspensa/cancelada), data_inicio/fim vigência, demanda_id de origem, termo (documento_id + ciencia_id) | Núcleo do módulo. FK para `colaborador` (matrícula PRÓPRIA como chave); cancelamento fecha vigência, nunca apaga |
| **`adesao_dependente`** | adesao_id, dependente_id (de `rh.dependente`), status, vigência, documentos (GED) | Dado de terceiro — LGPD própria; nunca cadastro paralelo de dependente |
| **`opcao_vt`** | colaborador_id, tipo (opcao/renuncia), operadora_bilhetagem_id, itens (linha, qtd/dia, tarifa_versao_id), vigência, termo com ciência+hash | Renúncia registrada protege contra passivo; tarifa versionada |
| **`suspensao_adesao`** | adesao_id, motivo (ferias/afastamento/outro), período, origem (automática por `afastamento`/`programacao_ferias` ou manual) | Manual no MVP; automatização na Fase 3 |
| **`fatura_operadora`** (Fase 3) | operadora_id, competencia_fatura, competencia_desconto (mapeada), arquivo original em storage + hash SHA-256, status (importada/conciliada/aprovada), totais | Snapshot imutável; via staging da camada `integracoes/` |
| **`item_fatura`** (Fase 3) | fatura_id, identificação do beneficiário no layout da operadora, adesao_id resolvida (ou nula = divergência), tipo (mensalidade/coparticipacao), valor | Correlação por matrícula própria/CPF conforme contrato do conector |
| **`divergencia_fatura`** (Fase 3) | fatura_id, tipo (cobrado_sem_adesao / aderido_sem_cobranca / valor_divergente), status, resolução, responsável | Resolução obrigatória antes de aprovar; fila padrão da camada de integrações |
| **`movimentacao_operadora`** (Fase 3) | adesao_id/adesao_dependente_id, tipo (inclusao/exclusao/alteracao), status (pendente/enviada/confirmada/rejeitada), remessa (arquivo+hash) ou chamada de API (payload+resposta), protocolo, data | Gerada automaticamente por evento de adesão |
| **`contrato_operadora`** (Fase 3) | operadora_id, vigência, data_aniversario_reajuste, documento (GED), alertas | Gestão de renegociação |

**Entidades de outros domínios que o módulo referencia (nunca duplica):** `colaborador` (elegibilidade; matrícula própria; matrícula Nasajon como campo informativo da sombra), `dependente`, `posicao_colaborador` e `lotacao` (gatilhos de perda de elegibilidade), `demanda`/`etapa_aprovacao` (workflow), `documento`/`ciencia` (termos, GED), `rubrica_versao` e `variavel_folha`/`competencia_folha` do domínio `rh_folha` (o módulo **escreve** variáveis com origem rastreada; o motor de folha é dono do cálculo e da conferência), `comparacao_sombra` (leitura, para investigar divergência de rubrica de benefício), `afastamento`/`programacao_ferias` (suspensões), `processo_admissao`/`processo_desligamento` (itens de checklist), `evento_colaborador` (projeção da linha do tempo).

**Dado sensível:** o desenho **evita custodiar declaração de saúde** (vai direto do colaborador à operadora; o sistema guarda apenas o comprovante de envio). Se o processo da operadora obrigar custódia, o documento entra no GED com classificação sensível, **cifrado na aplicação** (chaves em secret manager, nunca no banco — padrão da arquitetura v2) e com trilha de leitura desde o dia 1 — mesma regra do atestado.

## Papéis e permissões

Identidade **própria** da Fase A: autenticação e cadastro do app, papéis `funcionario`/`gestor`/`rh`/`dp`/`admin`, 2FA obrigatório para dp/rh/admin. Papel validado no **backend** em toda rota (nenhuma decisão de acesso no front); RLS via `SET LOCAL` no Postgres onde couber, senão autorização no repositório coberta por matriz de testes papel × recurso no CI. Mapeamento com o portal corporativo fica para a Fase B.

Chaves de permissão do módulo: `beneficio.catalogo.gerir`, `beneficio.regra.versionar`, `beneficio.adesao.operar`, `beneficio.adesao.aprovar`, `beneficio.fatura.conciliar`, `beneficio.fatura.aprovar`, `beneficio.movimentacao.enviar`, `beneficio.custo.ver`.

| Papel | Vê | Faz |
|---|---|---|
| **funcionario** | Só os próprios benefícios, dependentes, termos e solicitações | Solicita adesão/alteração/cancelamento; assina termos (ciência digital); anexa documentos; registra opção/renúncia de VT |
| **gestor** | Nada de valores ou dependentes da equipe. No máximo, existência de pendência operacional que dependa dele (raro) | Benefício é relação colaborador×empresa; gestor fica fora por padrão (payload sem o dado — ausência, não máscara) |
| **dp** | Adesões, dependentes, termos e variáveis geradas de todas as unidades do seu escopo | Opera o ciclo: valida elegibilidade, confere documentos, efetiva adesão/cancelamento, dispara variáveis, emite o relatório de transição para o Nasajon, resolve divergência de fatura (Fase 3) |
| **rh** | Tudo do DP + custos consolidados | Administra catálogo, versiona regras de elegibilidade e tabelas de preço (`beneficio.regra.versionar`), aprova fatura para pagamento (Fase 3), aprova exceções com justificativa registrada |
| **admin** | Operação de plataforma | Sem acesso funcional implícito a documento sensível — leitura de documento classificado sensível exige chave própria (`rh.documento.sensivel.ver`) e grava trilha de leitura |

Regras transversais: aprovação de fatura e versionamento de regra sob 2FA (mesma família das chaves `folha.*`); segregação de funções — quem versiona regra/tabela não aprova a própria fatura; toda leitura de documento sensível de benefício (ex.: declaração de saúde custodiada) gera trilha de leitura desde o dia 1. Auditoria de leitura + alteração cobre o papel de auditor sem papel dedicado na Fase A (reavaliar papel `auditor` na Fase B).

## Integrações

Tudo via domínio `integracoes/` (jobs assíncronos com estado e log), nunca no caminho síncrono de tela.

| Sistema | Direção | O quê | Regras |
|---|---|---|---|
| **Folha própria (`rh_folha`, interno)** | envia | Variáveis de desconto/provento por competência: mensalidade coparticipada, coparticipação (Fase 3), insumo de VT (qtd×tarifa), desconto VR/VA conforme política PAT, estornos | O **cálculo legal é da rubrica versionada no motor próprio** (teto de 6% do VT, limite PAT, incidências), com memória de cálculo em `calculo_item`. Dono único por campo: **adesão nasce em benefícios; rubrica e cálculo nascem em `rh_folha`**. Variável só entra em competência em estado `aberta`; congela no `snapshot_fechamento` |
| **Fiscal próprio (`fiscal/`, interno)** | nenhum contato direto | — | S-1010 (rubricas) e S-1200 (remuneração) são transmitidos pelo domínio `fiscal/` a partir do snapshot da folha. Benefícios não fala com o fiscal — fronteira de arquitetura |
| **Nasajon (sombra — temporário, morre no cutover)** | envia (papel/manual) e recebe (export manual) | Relatório de lançamentos por competência para digitação manual no Nasajon (processo atual do DP); exports/relatórios do Nasajon importados para a `comparacao_sombra` da trilha F | **Conferência, não integração** (Nasajon não tem API pública de folha). Divergência em rubrica de benefício na sombra → investigar tabela de preço, de-para de rubrica ou digitação |
| **Operadoras de saúde/odonto** (Fase 3) | recebe | Fatura mensal (layout por operadora) | Contrato de layout tipado e versionado em `docs/integracoes/` (validação de esquema no conector); staging por operadora; snapshot com hash; conciliação com fila de divergência obrigatória; **plano B arquivo/batch é o primário** (a maioria das operadoras não tem API utilizável) |
| **Operadoras** (Fase 3) | envia | Movimentação de vidas (inclusão/exclusão/alteração) | Job com estado e log; protocolo/comprovante arquivado no GED; nunca movimentação implícita — sempre gerada por evento de adesão auditado |
| **Plataformas de benefícios flexíveis** (Fase 3, condicional) | envia/recebe | Pedidos de recarga, extrato, movimentação de vidas | Pesquisa verificada (`docs/05-pesquisa-mercado.md`): **Flash, Swile e iFood Benefícios têm API pública real**; **Caju não tem API pública comprovada** (batch/portal); **Alelo/VR exigem conta no portal de dev** para avaliar. Nenhuma integração assumida sem contrato de API verificado |
| **Bilhetagem de VT** (concessionárias por município das 5 unidades) | envia | Relatório de recarga por competência (colaborador×valor) | MVP: relatório gerado pelo sistema, recarga executada manualmente no portal da concessionária pelo DP; automação só se houver API validada |
| **Assinatura eletrônica** (Clicksign/ZapSign/D4Sign — Fase 2) | envia/recebe | Termos que exijam assinatura qualificada (adesão, cancelamento, opção/renúncia de VT), quando o jurídico pedir mais que ciência interna | Base do MVP é a ciência digital com hash no GED; a assinatura eletrônica de mercado entra por cima quando exigida, com comprovante arquivado |
| **Módulos internos** | consome/envia | `processo_admissao` (oferta de adesão no checklist), `processo_desligamento` (cancelamentos + aviso art. 30/31), `afastamento`/`ferias` (suspensões), `demandas` (workflow), GED (termos e ciência), `evento_colaborador` (linha do tempo) | O módulo nunca escreve direto em domínio alheio fora dos contratos internos; tudo transacional |
| **n8n (WhatsApp Cloud API + e-mail transacional)** | envia | Notificações (adesão efetivada, pendência, aviso de reajuste, alerta de aniversário de contrato) | Dispara e nunca decide; payload sem dado sensível — só referências, conteúdo atrás de login com papel validado |
| **DW SAP** (Fase 3) | consome | Centro de custo para painel de custos | Read-only, analítico, fora do caminho crítico; condicionado à confirmação de que centros de custo existem no DW |

## Regulatório

| Exigência | Fonte | Como o desenho atende |
|---|---|---|
| VT: obrigatório mediante opção do empregado; desconto máximo de 6% do salário básico; vedação (regra geral) de pagamento em dinheiro | Lei 7.418/1985 + Decreto 10.854/2021 | **Termo de opção OU renúncia com ciência digital e hash**, revisável, arquivado no GED. O módulo registra o insumo (linhas, quantidade, tarifa versionada); o **teto de 6% é aplicado pela rubrica de VT do motor `rh_folha`**, parametrizada com vigência e com memória de cálculo — critério de corte permanente: cálculo legal nunca entra neste módulo |
| VR/VA: natureza não salarial condicionada ao PAT; participação do trabalhador limitada; vedação de desvio de finalidade | Lei 6.321/1976, Decreto 10.854/2021, Portaria MTP 672/2021 | Catálogo registra se o benefício está no PAT e o modelo de custeio versionado; o percentual de desconto é parâmetro da rubrica no motor próprio; o módulo fornece adesões ativas por competência como insumo. Confirmação da inscrição PAT é pergunta aberta |
| Saúde/odonto: direito de manutenção do plano por demitido sem justa causa e aposentado quando o plano é contributário; prazos de comunicação | Lei 9.656/1998 arts. 30/31, RN ANS 279/2011 | Flag `contributario` no benefício; o `processo_desligamento` recebe automaticamente a lista de cancelamentos **e o aviso do direito de manutenção com prazo**, com ciência registrada. Exclusão de beneficiário sempre por movimentação auditada com protocolo |
| Reflexos em folha e eSocial (rubricas S-1010, remuneração S-1200) | eSocial | **Na folha própria**: rubricas de benefícios existem como `rubrica_versao` em `rh_folha` (com incidências parametrizadas) e são transmitidas pelo domínio `fiscal/` a partir do snapshot. Este módulo só fornece o de-para benefício×rubrica e as variáveis; nunca transmite. Durante a sombra, o oficial fiscal segue sendo o Nasajon |
| Convenções coletivas do comércio podem obrigar benefícios (cesta, VA, seguro) por unidade/sindicato | CCTs por município | Critério `categoria_cct` na regra de elegibilidade versionada; o levantamento de rubricas/convenções no Nasajon previsto na Fase 0 (referência funcional da folha própria) já cobre as CCTs — reusar para fechar o catálogo de benefícios |
| Salário in natura / habitualidade | CLT art. 458 | Modelo de custeio e enquadramento por benefício são dados versionados com vigência — evidência de configuração da época em qualquer disputa. A incidência (ou não) é parametrizada na rubrica do motor próprio, também versionada |
| LGPD: dependentes (dados de terceiros, inclusive menores), declaração de saúde (categoria especial), minimização, temporalidade | LGPD | **Minimização por desenho**: declaração de saúde preferencialmente **não custodiada** (vai direto à operadora; guardamos só comprovante); se custodiada, cifrada na aplicação (chaves em secret manager) com trilha de LEITURA desde o dia 1. Dependente reusa `rh.dependente` com base legal própria mapeada. Fatura da operadora (contém utilização/coparticipação = indício de saúde): acesso restrito a `beneficio.fatura.conciliar`, item de fatura nunca exposto a gestor, categoria de temporalidade própria na tabela de retenção. n8n proibido de carregar valores/dados de saúde no payload |
| Prova documental de adesão/cancelamento em disputa trabalhista | CLT / jurisprudência | Ciência digital com hash em todo termo (assinatura eletrônica de mercado quando exigida); audit só-INSERT por GRANT com diff resolvido; UTC + America/Sao_Paulo na exibição; adesão cancelada fecha vigência, nunca é apagada; backup diário + PITR com restore testado |

## Dependências

- **Fase 1 completa (espinha dorsal):** autenticação própria com papéis, `colaborador` (matrícula própria, `tipo_vinculo` — critério de elegibilidade), `dependente`, `posicao_colaborador`/`cargo` e `lotacao` (elegibilidade por cargo/unidade e gatilhos de perda), `demandas` com etapas de aprovação (motor do workflow de adesão), GED mínimo (`documento` + `ciencia` com hash), `evento_colaborador`, audit em duas trilhas, RLS/matriz de autorização no CI.
- **Trilha F — F1 (motor mínimo de folha):** o catálogo de rubricas próprio (`rubrica_versao`) precisa existir para o de-para benefício×rubrica e para as variáveis terem destino. O MVP de benefícios pode nascer junto de F1/F2; a conferência plena só existe com a esteira de competência rodando.
- **Levantamento Fase 0 no Nasajon (referência funcional):** quais rubricas de desconto/provento de benefícios existem hoje, como são alimentadas, e quais CCTs obrigam benefícios — insumo para o catálogo, para o de-para e para a comparação da sombra.
- **Processos de admissão e desligamento (Fase 2):** oferta de adesão no checklist de admissão; cancelamentos + aviso art. 30/31 no checklist de desligamento.
- **Afastamentos e férias (Fase 2):** insumo das suspensões (VT em férias/afastamento) — manual no MVP, automático na Fase 3.
- **Assinatura eletrônica (Fase 2):** necessária apenas se o jurídico exigir assinatura qualificada nos termos; a ciência digital interna com hash é o piso e não depende de terceiro.
- **Camada `integracoes/` formal:** staging, conciliação, fila de divergências e plano B batch — pré-requisito absoluto da Fase 3 (faturas, movimentação e APIs de plataformas flexíveis).
- **Decisões pendentes que condicionam o módulo:** inventário de benefícios e operadoras por unidade; tabela de temporalidade por categoria de dado (retenção de fatura e termo); decisão comercial sobre plataforma de benefício flexível (Flash/Swile/iFood — com API — vs operadoras tradicionais).

## Riscos

1. **Defasagem de competência da coparticipação** (fatura M-1/M-2 chegando depois do fechamento): descontar na competência errada gera desconto indevido e estorno. Mitigação: campo explícito `competencia_desconto` mapeado na conciliação da fatura + regra registrada com o DP de em qual folha cai; variável só entra em competência em estado `aberta`; correção pós-fechamento é sempre evento novo (a competência fechada não reabre).
2. **Deriva de cálculo para dentro do módulo** — a tentação de calcular 6% do VT, limite PAT ou rateio de coparticipação em benefícios viola a fronteira: cálculo legal é do motor `rh_folha` (rubrica versionada com memória de cálculo). O módulo só produz insumos (quantidades, valores de tabela, adesões ativas); qualquer cálculo legal identificado aqui em revisão é bug de arquitetura. A fronteira agora é interna (dois domínios do mesmo sistema), o que a torna mais fácil de violar sem perceber — manter teste de arquitetura/revisão explícita.
3. **Dupla digitação durante a sombra** (DP digita no Nasajon e o sistema gera variável própria — os dois lados podem divergir): mitigação: o relatório de transição sai do MESMO dado que gera a variável (fonte única), e a `comparacao_sombra` pega qualquer diferença; divergência recorrente em rubrica de benefício bloqueia a declaração de paridade.
4. **De-para benefício×rubrica errado compromete a paridade da sombra**: se o mapeamento para a rubrica própria (ou o campo informativo da rubrica Nasajon) estiver errado, a comparação não fecha e o cutover trava. Mitigação: levantamento de rubricas na Fase 0 como pré-requisito do catálogo; de-para versionado e revisado pelo DP; benefício sem rubrica mapeada não gera variável (trava, não silêncio).
5. **Layouts heterogêneos e instáveis de operadora** (troca de layout sem aviso quebra importação): contrato tipado e versionado por conector + staging + validação de layout antes de processar; falha de layout gera fila, nunca importação parcial silenciosa.
6. **Data de corte da operadora × calendário de folha própria**: movimentação enviada fora do corte mantém cobrança de desligado por 1–2 faturas. Mitigação: alerta n8n de corte por operadora; divergência "cobrado sem adesão" já prevista na conciliação; prazo de movimentação como item do checklist de desligamento; calendário de cortes cruzado com o calendário da `competencia_folha`.
7. **LGPD em declaração de saúde e fatura com utilização**: risco de custodiar dado de categoria especial sem necessidade. Mitigação: desenho de não-custódia como padrão; se inevitável, cifra na aplicação (chaves em secret manager) + trilha de leitura + acesso por chave própria; fatura nunca visível fora de DP.
8. **CCTs das 5 unidades podem obrigar benefícios não mapeados** (cesta, seguro): elegibilidade já suporta critério de CCT, mas o levantamento (Fase 0, junto com rubricas/convenções para a folha própria) precisa acontecer antes de fechar o catálogo — senão o MVP nasce incompleto juridicamente.
9. **Apostar em API de plataforma de benefícios sem contrato verificado**: só Flash, Swile e iFood Benefícios têm API pública real comprovada; Caju não tem e Alelo/VR estão atrás de portal de dev. Mitigação: batch é sempre o piso; API só entra no desenho da Fase 3 depois de conta de dev aberta e contrato de API validado com a operadora efetivamente contratada.
10. **`variavel_folha` precisa comportar provento/estorno**: benefícios não gera só desconto (ex.: devolução de desconto indevido após divergência de fatura). O desenho de `rh_folha` deve prever sinal/tipo na variável e na rubrica — confirmar no design do motor (F1); se faltar, é ajuste no domínio `rh_folha`, não neste módulo.

## Perguntas abertas para DP/RH

1. **Inventário atual:** quais benefícios existem hoje por unidade, com quais operadoras (saúde, odonto, VR/VA, bilhetagem de VT por município), e onde está o cadastro hoje (planilha? Nasajon? papel?).
2. **Referência Nasajon (para a folha própria e a sombra):** quais rubricas de desconto/provento de benefícios existem hoje no Nasajon (VT, coparticipação, mensalidade de dependente, estornos) e como são alimentadas (digitação manual? planilha?) — vira o de-para do catálogo próprio e o dicionário da comparação da sombra.
3. **PAT:** a Fast é inscrita no PAT? Qual o modelo atual de desconto de VR/VA (percentual, valor fixo, zero)?
4. **Plataforma flexível:** há intenção de migrar VR/VA (ou parte dos benefícios) para cartão flexível (Flash/Swile/iFood — que têm API — ou Caju/Alelo/VR)? A escolha muda o desenho da Fase 3 (API × batch).
5. **Plano de saúde:** é contributário (colaborador paga parte da mensalidade) ou só coparticipação por uso? — define a obrigação dos arts. 30/31 no desligamento. Existe declaração de saúde no processo de adesão, e quem a custodia hoje?
6. **Faturas:** em que formato chegam as faturas de cada operadora (PDF, planilha, portal, API?) e com que defasagem em relação à competência de desconto? Quem confere hoje e contra o quê?
7. **Cortes:** qual a data de corte de movimentação de cada operadora e a data de corte interna de adesão/cancelamento que o DP pratica?
8. **CCTs:** as convenções coletivas das 5 unidades obrigam algum benefício (cesta básica, VA mínimo, seguro de vida)? Há pisos ou percentuais de desconto fixados em CCT?
9. **VT operacional:** como é feita a recarga hoje (portal da concessionária por unidade? centralizada?) e há colaborador com renúncia formal registrada — em que suporte?
10. **Dependentes:** qual documentação a Fast exige por tipo de dependente e por benefício, e há prazo de carência praticado?
11. **Elegibilidade real:** existe hoje diferenciação de benefício por cargo (ex.: gestor tem plano superior)? Por tempo de casa? Estagiário/aprendiz/PJ recebem algo (VT de estagiário é praxe, não obrigação)?
12. **Afastados e férias:** qual a prática atual para VT em férias e para manutenção de plano de saúde em afastamento INSS (quem paga a parte do colaborador — desconto acumulado no retorno, boleto)? — precisa virar regra parametrizada na rubrica/suspensão.
13. **Termos:** a ciência digital com hash basta para os termos de adesão/cancelamento/VT, ou o jurídico exige assinatura eletrônica de mercado (Clicksign/ZapSign/D4Sign) em algum deles?
14. **Volume:** quantas vidas (titulares + dependentes) por operadora — dimensiona se a conciliação manual assistida basta no início da Fase 3 ou se a automação da movimentação é urgente.
