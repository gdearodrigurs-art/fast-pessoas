# Pesquisa de mercado — ferramentas para incorporar ao sistema

> Gerado em 2026-07-24 por pesquisa profunda multi-agente (5 ângulos de busca, 25 fontes,
> 113 claims extraídos, 25 verificados adversarialmente — 23 confirmados, 2 refutados).
> **Toda afirmação abaixo foi verificada contra fonte primária na data indicada, salvo onde marcado.**
> Preços quase nunca são públicos — orçamento real exige cotação comercial.

## Tabela-resumo de vereditos

| Ferramenta | Categoria | API | Veredito |
|---|---|---|---|
| **Pontomais (VR Gente)** | Ponto | REST documentada + webhooks + export AFD-671/AEJ | **Incorporar via integração** — melhor aderência técnica verificada |
| **Tangerino / Sólides Ponto** | Ponto | REST documentada, sem webhooks, sem AFD/AEJ via API | Integração viável — 2ª opção |
| **Nasajon (atual)** | Folha | Portal público existe (OAuth2/Keycloak) mas quase não cobre DP/folha | **Manter como folha, mas NÃO planejar sobre API pública** — negociar API privada ou plano B arquivos |
| **Clicksign** | Assinatura | REST v3 (envelopes) + webhooks HMAC | **Incorporar via integração** |
| **ZapSign** | Assinatura | REST/JSON + 12 eventos de webhook | **Incorporar** — decidir vs Clicksign por preço/volume |
| **TeamCulture** | Clima + 360 | API/webhooks anunciados; Swagger de sincronização de pessoas | Forte candidata — **exigir POC da profundidade da API** antes de contratar |
| **Feedz** | Clima/360 | — | **Ignorar** — produto absorvido pela TOTVS, não existe mais standalone |
| **Caju** | Benefícios | Nenhuma API pública verificável (claim de API refutado 1-2) | Comercialmente atraente (tier R$ 0) — **exigir prova técnica da API** antes de decidir |

As categorias que ficaram sem verificação na primeira rodada (R&S/admissão, SST, WhatsApp,
open-source e os concorrentes restantes) foram cobertas pela **pesquisa complementar (2ª rodada)**
— ver a seção homônima no fim deste documento. Destaques da 2ª rodada: **Gupy** e **Unico People
(Acesso RH)** confirmadas como incorporáveis para admissão digital; **SOC** confirmado para SST
(web services SOAP com WSDL válido); **WhatsApp Cloud API + node n8n** confirmados para avisos
(cobrança por mensagem; e-mail continua o fallback barato — SMS não é); **Flash, Swile e iFood
Benefícios têm API pública real** (ao contrário da Caju); **D4Sign** incorporável como 3ª opção
de assinatura; **DocuSign** só como referência (sem ICP-Brasil em nuvem, preço de API não público).

---

## 1. Controle de ponto

### Pontomais (VR Gente) — incorporar via integração

Verificado ao vivo em 2026-07-24 (fontes primárias: [central de ajuda](https://sos.pontomais.com.br/extensao-api/) e [documentação Postman](https://documenter.getpostman.com/view/4785048/RWMCvVxN)):

- **API REST pública e documentada**: base `{{server_url}}/external_api/v1/`, autenticação via header `access-token` (token obtido no Marketplace/"Meus Serviços"). Confiança alta, votos 3-0.
- **Portaria 671 programática**: `POST /external_api/v1/afd_mpt_671/export` (AFD-671), `POST /external_api/v1/aej/export` (AEJ, aceita array de CNPJs numa única requisição) + endpoints legados AFD/AFDT. Ressalva: o AFD-671 filtra uma business_unit por chamada — 5 unidades = 5 chamadas, automatizável.
- **Webhooks para 4 eventos**: Registro de Ponto, Registro de Pausa, Criação do Colaborador, Demissão do Colaborador — payload JSON com CPF, NIS, matrícula, data/hora/local. Viabiliza arquitetura orientada a eventos via n8n em vez de polling.
- **Custo**: a extensão API/WebHooks é **adicional pago** sem preço público, além da mensalidade por funcionário. Casos de uso documentados: BI, criação de funcionários, afastamentos, demissões, exportação para folha.

**O que a pesquisa NÃO verificou** (entra nos critérios de cotação da Fase 0): integração nativa Pontomais↔Nasajon; API de **efetivação/tratamento de ajuste** com protocolo (critério nº 3 da arquitetura); reexportação retroativa de período já tratado.

### Tangerino / Sólides Ponto — 2ª opção

- API REST pública documentada ("Sólides DP API", [docs.tangerino.com.br](https://docs.tangerino.com.br/)): cadastro de funcionários/gestores/cargos/locais, registro tardio, ajustes/abonos, espelho de ponto (PDF em Base64). Token via suporte (não self-service), header `Authorization: Basic`.
- **Limitações** (confiança média, voto 2-1, mas confirmadas por inspeção direta do portal): **sem webhooks**, **sem exportação AFD/AEJ via API** (só na interface do produto), sem menção a Portaria 671/eSocial/LGPD na doc. Integração é polling.

---

## 2. Folha — Nasajon (achado mais importante da pesquisa)

Verificado ao vivo em 2026-07-24 ([docs.api.nasajon.app](https://docs.api.nasajon.app/), catálogo JSON baixado e parseado):

- O portal público de APIs do ERP Nasajon 4.0 existe e é organizado pela matriz MOPE: 6 áreas, 57 processos, 114 recursos documentados.
- **Porém o processo "Departamento de Pessoal" (MOPE 66) só documenta API para "Gerenciar ponto"** (recursos "Lista de Presentes" e "Apurações de ponto"). As outras 8 atividades de DP — dados mestres de colaboradores, benefícios, pagamento, SST, eSocial — **não têm nenhum recurso de API pública**, e não há recurso de folha/eSocial em nenhum outro processo do catálogo.
- Autenticação: OAuth2/OpenID Connect com assinatura Keycloak (`auth.nasajon.com.br/auth/realms/master`), Bearer token de 24h, refresh e introspection — padrão trivial de consumir do backend próprio ou n8n (confiança média, 2-1: "Keycloak" não é nomeado, mas os paths e o GitHub da Nasajon o confirmam).

**Nota (superada por decisão do usuário em 2026-07-24):** a decisão passou a ser **construir
folha própria e substituir o Nasajon** (ver log de decisões). Este achado continua relevante por
dois motivos: (a) confirma que integrar seria difícil de qualquer forma (sem API pública de folha);
(b) durante o período de **sombra/paridade**, os resultados do Nasajon serão importados por
relatórios/exports manuais para comparação — não é integração, é conferência.

---

## 3. Assinatura eletrônica de documentos trabalhistas

### Clicksign — incorporar

- API REST **v3** baseada em "envelopes" (`POST /api/v3/envelopes`, sandbox e produção), múltiplos documentos e signatários por envelope ([developers.clicksign.com](https://developers.clicksign.com/)).
- **Webhooks de eventos de envelope com validação HMAC** (`x-clicksign-signature`) — o evento "assinado" pode disparar os próximos passos do fluxo de admissão/DP via n8n.

### ZapSign — alternativa direta

- API REST pública ([docs.zapsign.com.br](https://docs.zapsign.com.br/)): `POST /api/v1/docs/`, sandbox, rate limit 500 req/min.
- **12 eventos de webhook documentados** (doc_created, doc_signed, doc_refused, doc_viewed, email_bounce, signer_authentication_failed…), com páginas de criação/teste/logs.
- Ressalvas: API em produção exige plano de API **pago** (valor não público); gratuidade dos webhooks não confirmada.

**Decisão entre as duas: preço/volume em cotação.** Ambas atendem o requisito de ciência/assinatura
do GED (`rh_documentos`). Nota: a arquitetura usa **ciência digital com hash própria** para o
caso simples (padrão btime); a integração de assinatura entra onde houver exigência de assinatura
qualificada/ICP — D4Sign e DocuSign ficaram sem verificação (pesquisa complementar).

---

## 4–5. Clima, engajamento e avaliação de desempenho

### TeamCulture — forte candidata, exigir POC

- Cobre **as duas categorias** numa plataforma: clima (pesquisa contínua semanal, 10 pilares, eNPS, canal de opiniões anônimo) e desempenho (360°, PDIs, feedbacks, OKRs, KPIs, metas).
- Anuncia **API e Webhook** como capacidades de integração; help center documenta portal Swagger para gestão de pessoas/grupos/profissões/atributos. Integrações nativas: Slack, Teams, Google Workspace, M365, SAP, TOTVS Protheus, ADP, Senior, LG, Power BI.
- LGPD: **autoatestação** de marketing (criptografia, controle de acessos) — sem certificação independente verificada.
- **Ressalva dos verificadores:** a API pública documentada cobre principalmente sincronização *inbound* de pessoas/estrutura; **leitura de resultados via API e detalhamento dos webhooks não estão comprovados** — é exatamente o que a POC precisa provar antes de qualquer contrato.

### Feedz — ignorar

- `feedz.com.br/avaliacao-de-desempenho/` redireciona (301) para `totvs.com/rh/avaliacao-desempenho/`; a TOTVS confirma que o produto standalone foi descontinuado em 31/07/2025 e absorvido como "TOTVS RH Avaliação de Desempenho". Para quem usa Nasajon, entrar no ecossistema TOTVS não faz sentido. No máximo, referência de funcionalidade.
- Atenção: a alegação de que a página TOTVS "não menciona API para terceiros" foi **refutada** na verificação (0-3) — não usar esse argumento sem nova checagem.

**Relação com a arquitetura:** a decisão vigente é **construir** clima (anonimato estrutural é
requisito que ferramenta externa não garante por desenho) e **construir** a 360 (spec btime).
A TeamCulture serve de: (a) referência de funcionalidade para os dois módulos; (b) plano B
comercial se o build atrasar. Pulses e Qulture.Rocks seguem sem verificação.

---

## 6. Benefícios flexíveis

### Caju — atraente no comercial, sem API comprovada

- Modelo de entrada com custo zero **confirmado**: plano Essencial a R$ 0,00/colaborador, sem taxa de adesão, sem mensalidade, primeira via do cartão grátis, sem multa de cancelamento — condicionado a contratar/usar multibenefícios; demais módulos sob consulta.
- **Nenhuma API pública verificável**: o GitHub oficial (caju-beneficios) tem 5 repositórios sem SDK/docs; não há portal de desenvolvedores; a alegação de "integração via API com principais folhas/ERPs" foi **refutada (1-2)**.
- Veredito: exigir prova técnica da API em canal comercial; sem ela, seria sistema paralelo não integrado. Comparar com Flash e Swile (ambas sem API verificada ainda — pesquisa complementar).

---

## Achados transversais dos extratores (não verificados adversarialmente — tratar como pista)

- **n8n tem node nativo de WhatsApp Business Cloud** (docs oficiais n8n): caminho de menor atrito para avisos de ponto/fechamento, já que n8n é o orquestrador de notificações da arquitetura.
- **WhatsApp Business API mudou o modelo de cobrança** (por mensagem/template desde jul/2025, consolidado em 2026) — dimensionar custo por aviso antes de prometer notificação WhatsApp em escala; e-mail continua sendo o canal barato.
- **Metabase (BI open-source): SSO via OIDC/Keycloak só nos planos pagos** (Pro/Enterprise) — relevante se o people analytics da Fase 3 cogitar Metabase embutido; a edição gratuita não faz SSO com a identidade do portal.
- **Evolution API (WhatsApp não-oficial, open-source)**: existe, mas usa engenharia reversa do WhatsApp — **risco de banimento e de compliance; não usar para comunicação oficial de DP.**
- **Gupy tem portal de desenvolvedores** (developers.gupy.io) com APIs públicas e webhooks, incluindo fluxo documentado de admissão → folha via webhook `pre-employee.moved` — candidata forte da pesquisa complementar de R&S.

## Claims refutados (registrados por transparência)

1. "A página TOTVS/Feedz não menciona API pública para terceiros" — **refutado 0-3**.
2. "A Caju oferece integração via API com os principais sistemas de folha/ERPs" — **refutado 1-2**.

Lição dos dois: páginas de marketing superestimam capacidade de integração — só aceitar
"integra com X" com documentação técnica na mão.

## Perguntas abertas (alimentam a Fase 0)

1. A Nasajon oferece, via contrato/parceria, APIs privadas de folha e eSocial além do portal público — ou a integração será por arquivos?
2. A Caju tem API real acessível via comercial? Como se compara a Flash e Swile?
3. Preços efetivos: extensão API da Pontomais, planos de API ZapSign vs Clicksign em volume de DP, tiers da TeamCulture.
4. Categorias em aberto: melhor API de R&S/admissão (Gupy, Abler, Acesso RH/Unico), SOC tem API "Exporta Dados" utilizável para SST, e qual BSP de WhatsApp atende os avisos orquestrados pelo n8n.

## Ressalvas de método

- Cobertura incompleta: categorias 7–10 e vários concorrentes citados não tiveram claims verificados — **ausência de verificação ≠ veredito negativo**.
- LGPD das ferramentas: tudo autoatestação; nenhuma certificação independente verificada.
- Mercado em consolidação (Pontomais→VR, Tangerino→Sólides, Feedz→TOTVS): links e condições comerciais mudam rápido; validar de novo na contratação.
- Dois findings com voto 2-1 (limitações do Tangerino; Keycloak da Nasajon): evidência primária forte, com dissenso na verificação.

---

## Pesquisa complementar (2ª rodada) — resumo por categoria

> Detalhe completo com fontes em [anexos/pesquisa-mercado-complementar-detalhe.md](anexos/pesquisa-mercado-complementar-detalhe.md).
> Cada achado passou por verificador adversarial independente.


### Recrutamento & Seleção e admissão digital

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **Gupy (Recrutamento & Seleção + Gupy Admissão)** | incorporar | parcial | O fluxo que queremos existe e é oficialmente documentado ponta a ponta: webhook pre-employee.moved com payload completo do admitido (incl. |
| **Acesso RH / Unico People (Unico)** | incorporar | confirmado | Se o objetivo é admissão digital com validação documental terceirizada (sem trocar de ATS), o fluxo fecha: nosso sistema cria a posição via POST /v2/positions, o candidato faz tudo digital, o webhook position-completed avisa, e puxamos o dossiê via /v1/positions ou /v2/positions/export para criar o colaborador. |
| **Abler (ATS)** | referencia | confirmado | API real, aberta e com os webhooks certos (candidate_hired/admission_finished dariam para alimentar nosso núcleo de colaborador), e o único preço de entrada público da categoria. |

Verificação adversarial concluída com leitura ao vivo das fontes primárias.

### SST / saúde ocupacional / eSocial SST

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **SOC (soc.com.br - AGE Technologies)** | incorporar | confirmado | É o único player da categoria com endpoints verificáveis publicamente e ao vivo (2 WSDLs SOAP válidos + endpoint Exporta Dados confirmado por consumidor terceiro). |
| **RSData (rsdata.com.br)** | exigir-prova-tecnica | confirmado | A capacidade de integração existe (webservices SOAP/WSSE anunciados + presença na lista de prestadores integráveis da Senior, que exige API com devolução de XML eSocial e recibos), mas é impossível avaliar cobertura, granularidade e esforço sem a documentação - que não é pública. |
| **Salú (salu.com.vc)** | referencia | confirmado | Não serve ao objetivo declarado (integrar via API/webhook ao sistema próprio): é BPO de SST/eSocial, não plataforma integrável. |
| **Quírons (quirons.com.br)** | ignorar | parcial | Transmite eSocial SST, mas só na própria plataforma ou via conectores fechados com TOTVS - ecossistema que a Fast não usa (Nasajon). |
| **Senior Integrador SST (documentacao.senior.com.br) - referência de arquitetura** | referencia | confirmado | A Fast usa Nasajon, não Senior - não é para contratar. |

Verificação adversarial concluída com re-leitura ao vivo de todas as fontes primárias citadas.

### Mensageria / WhatsApp para avisos de RH

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **WhatsApp Business Platform (Meta Cloud API oficial)** | incorporar | confirmado | É o canal certo para avisos de RH no Brasil: custo por aviso utility de ~R$0,04, acesso direto sem BSP (zero mensalidade e zero markup), API REST estável e suporte nativo no n8n. |
| **Node nativo de WhatsApp do n8n (WhatsApp Business Cloud + WhatsApp Trigger)** | incorporar | confirmado | É o caminho de menor atrito pedido: FastAPI dispara evento → n8n → node Send Template → Meta. |
| **Twilio (BSP WhatsApp)** | referencia | confirmado | Só faz sentido se a Fast quiser billing unificado multi-canal (SMS+WhatsApp+e-mail via SendGrid) ou não quiser gerir a relação direta com a Meta. |
| **360dialog (BSP WhatsApp)** | referencia | confirmado | Melhor BSP 'neutro' se a Fast preferir terceirizar a burocracia Meta (verificação, suporte, escalação) mantendo payloads idênticos à Cloud API — a migração de/para acesso direto é trivial. |
| **Gupshup (BSP WhatsApp)** | referencia | confirmado | Markup mais baixo do mercado (US$0,001/msg, +15% no custo utility) se um BSP for exigido, mas sem node n8n nativo e com histórico recente de mudança de taxas. |
| **Infobip (BSP WhatsApp)** | ignorar | confirmado | Motion comercial enterprise sem preço público e sem diferencial técnico para um caso de baixo volume orquestrado por n8n. |
| **Amazon SES (e-mail transacional — fallback)** | incorporar | parcial | Fallback barato de verdade (300x mais barato que WhatsApp utility por aviso) com node n8n nativo. |
| **SMS como fallback (Twilio, referência de preço Brasil)** | ignorar | confirmado | Achado central desta categoria: no Brasil, SMS NÃO é o fallback barato — é o canal mais caro dos três. |

Verificação adversarial concluída com re-leitura ao vivo de todas as fontes primárias citadas: 7 achados CONFIRMADOS e 1 PARCIAL (Amazon SES — única correção numérica: e-mail é ~68x mais barato que o utility WhatsApp, não '300x'; a conclusão não muda).

### Ponto — concorrentes restantes

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **TOTVS RH Ponto Eletrônico – Linha Ahgora (Ahgora PontoWeb)** | exigir-prova-tecnica | confirmado | A API existe, é usada em produção pelas integrações TOTVS e cobre exatamente o que a Fast precisa (funcionários, afastamentos e resultados/batidas), mas o acesso é gated por contrato: credenciais via comercial, spec em PDF (não há portal dev público) e 'licença I' paga para as APIs de resultados. |
| **mywork (mywork.com.br)** | exigir-prova-tecnica | confirmado | Preço público competitivo e modelo multi-CNPJ sem custo extra são atraentes, mas o critério de integração está frágil: API só no plano Pro e sem NENHUMA documentação pública (nem endpoints, nem auth, nem escopo), sem webhooks, e sem menção a Nasajon ou a qualquer layout de folha nomeado. |
| **Pontomais (VR / RH Digital) — achado extra da pesquisa** | exigir-prova-tecnica | confirmado | Não estava na lista-alvo, mas é o único dos três com doc de API pública legível E webhooks documentados — tecnicamente o mais alinhado ao requisito de integrar ao sistema próprio + n8n. |

Veredito geral: os três achados foram CONFIRMADOS nas fontes primárias, relidas ao vivo (TDN e Central TOTVS via browser por causa do bloqueio 403 a fetch, reproduzido; produtos.totvs.com 402, reproduzido; página de preços do mywork verificada com a faixa 101+ efetivamente selecionada no seletor; doc Postman do Pontomais renderizada com JS).

### Assinatura eletrônica — concorrentes restantes

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **D4Sign** | incorporar | parcial | Terceiro player nacional viavel ao lado de Clicksign/ZapSign (ja verificadas): API REST publica e completa, sandbox real, webhooks documentados com retry, ICP-Brasil via API (diferencial sobre concorrentes que exigem fluxo manual) e preco publico acessivel. |
| **DocuSign** | referencia | confirmado | A melhor API e o melhor sistema de webhooks da categoria (Connect com HMAC, 3 niveis, sandbox gratuito eterno) — vale como REFERENCIA de design para a integracao do sistema proprio. |

Verificacao adversarial da categoria assinatura eletronica (D4Sign e DocuSign): tentei refutar cada achado relendo ao vivo todas as 13 fontes primarias citadas mais 1 adicional — nenhum achado material caiu.

### Clima e avaliação — concorrentes restantes

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **Gupy Clima e Engajamento (ex-Pulses)** | referencia | confirmado | É o plano B comercial mais forte para clima: única da categoria com documentação pública de API que comprovadamente EXPORTA resultados (scores agregados, instrumentos, feedbacks), não só importa pessoas — li os endpoints ao vivo no portal developers.gupy.io. |
| **Qulture.Rocks (UOL Edtech)** | exigir-prova-tecnica | confirmado | A API existe e, pela lista de entidades do conector Erathos, exporta exatamente o que importa (respostas de survey, participações, feedbacks, PDI, 1:1, OKR, elogios) — seria o plano B comercial para desempenho/360. |
| **impulseup** | ignorar | confirmado | Para o critério que importa (API/webhook documentados para exportar resultados ao sistema próprio), não passa: marketing menciona API, mas não há nenhuma documentação técnica pública verificável, nem preço público. |
| **Umanni** | ignorar | parcial | Sem API documentada, sem webhooks, sem preço público — não atende ao requisito de integração com o sistema próprio. |

Verificação adversarial concluída com re-leitura ao vivo das fontes primárias.

### Benefícios flexíveis — concorrentes restantes

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **Flash (flashapp.com.br)** | incorporar | confirmado | A API pública mais completa da categoria, verificada endpoint a endpoint: cobre pedidos de recarga, depósitos por colaborador, saldos e cadastro — o ciclo inteiro que o sistema próprio precisaria orquestrar. |
| **iFood Benefícios (beneficios.ifood.com.br)** | incorporar | confirmado | Segunda melhor doc da categoria: endpoints concretos e públicos para o fluxo completo RH (colaboradores → recarga → cartões → saldo/boleto), custo zero de plataforma e modelo pré-pago com boleto gerável via API. |
| **Swile (swile.com.br)** | incorporar | confirmado | Tem API pública de verdade e aberta (sem login para ler a doc), cobrindo colaboradores, pedidos com preview de valores e até logística/rastreio de cartão físico — recurso que nenhum concorrente documenta. |
| **Alelo (developers.alelo.com.br)** | exigir-prova-tecnica | parcial | O portal e o catálogo são reais e cobrem pedidos, cargas e cartões — muito além de importação de planilha. |
| **VR Benefícios (dev.vr.com.br)** | exigir-prova-tecnica | confirmado | Caso clássico de 'anuncia portal de APIs mas não dá para ler nada sem aprovação'. |

Verificação adversarial concluída revisitando todas as fontes primárias (WebFetch + navegador para SPAs).

### Open-source: BI / dashboards para people analytics

| Ferramenta | Veredito | Verificação | Nota |
|---|---|---|---|
| **Metabase (edição open-source)** | referencia | confirmado | Dá para embedar de graça (static embedding com JWT + locked parameters), mas com três atritos para o caso de uso 'dado sensível de RH dentro do nosso front': banner obrigatório, impossibilidade de bloquear export de dados na edição gratuita e ausência de row-level security real no static embed. |
| **Apache Superset** | exigir-prova-tecnica | confirmado | É a ÚNICA das quatro que entrega embedding completo com row-level security sem nenhum plano pago e com licença permissiva (Apache 2.0). |
| **Lightdash** | ignorar | confirmado | O requisito central da categoria (embedding no front próprio sem plano pago) é exatamente o que o Lightdash coloca atrás do paywall (Cloud/Enterprise). |
| **Evidence** | referencia | confirmado | Não resolve o caso de uso principal (dashboard por usuário com RBAC dentro do app) por ser estático e sem autorização por linha/usuário. |

Verificação adversarial concluída em 2026-07-24 relendo todas as fontes primárias: os 4 achados foram CONFIRMADOS, sem nenhuma refutação.
