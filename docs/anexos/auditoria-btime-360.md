# Fast Pessoas — Auditoria crítica do mockup btime · Avaliação 360

> Gerado em 2026-07-28. Entregável do **Item 0** do design do módulo (`docs/03-modulos/05-avaliacao-360.md`, Funcionalidades).
> Fontes: `referencias/btime-avaliacao-360.html` (mockup funcional, HTML+CSS+JS inline, lido por inteiro,
> inclusive o JavaScript e os dados embutidos), `docs/03-modulos/05-avaliacao-360.md` (v2) e
> `Ficha-Conhecimento-Portal-para-RH.md` §5 (registro do discovery btime).
> **Status: AUDITORIA — postura cética, conforme instrução. O mockup é ESQUELETO, não spec. Cada decisão
> "aproveitar vs corrigir vs descartar" daqui deve ir para o log de decisões antes do protótipo.**

**Conclusão em uma frase:** o mockup é um bom mapa de telas e um bom vocabulário de conceitos (pilares, faixas,
flag, ciência, card privado — todos citados com códigos RN-*/RF-* de uma spec TO-BE que não acompanha o HTML),
mas **nenhuma regra de negócio está implementada corretamente**: o motor de cálculo é média aritmética simples
que ignora os próprios pesos declarados na tela, indicador não respondido entra como nota zero, faixas e pesos
estão hardcoded no JS contradizendo o requisito de administrabilidade que o próprio mockup exibe, os números
estáticos das telas não fecham entre si, e não existe papel, estado, persistência, trilha ou versionamento.
Serve como esqueleto de UX; **o modelo de dados e o motor são 100% nossos**.

---

## 1. Inventário do mockup

### 1.1 Telas e fluxos realmente contidos

| # | View (`id`) | Conteúdo real | Fase (badge) | Interatividade real |
|---|---|---|---|---|
| 1 | `v-dashboard` · Visão geral | Banner "arquitetura 360-nativa"; 4 KPIs estáticos (300 colaboradores, 87% no prazo, 12 ciclos vencidos, fit cultural médio 74%); donut de distribuição por faixa (6/18/54/22%); "Adesão por gestor" (4 barras estáticas, RF-DSH-06); "Consulta analítica multidimensional" — tabela nominal estática de 4 vendedores com fit/resultado/flag e filtros fake (RF-DSH-03) | F1 | Nenhuma — tudo estático; botão Exportar e filtros sem handler |
| 2 | `v-ciclos` · Ciclos & pendências | Alerta "3 colaboradores completam 45 dias"; filtros de status fake; tabela estática de 5 pendências: Experiência 45d (×2), Experiência 90d (vencida há 2 dias), Desempenho semestral (×2); notas RN-03 (semestral desde o dia 1) e RN-20 (desligamento interrompe ciclos) | F1 | Só navegação (`data-goto`) |
| 3 | `v-aval` · Avaliação (líder→liderado) | Cabeçalho do avaliado (Rafael Nunes, "Experiência · 1ª (45 dias)", "Modelo v3 · escala 1–5"); 3 pilares com botões 1–5; painel sticky com gauge, track de faixas 0/40/60/80/100, memória de cálculo; bloco "Decisão do gestor" (Renovar +45d / Desligar / Salvar rascunho, RN-06); nota "contexto Nasajon na Fase 2" | F1 | **Única tela com lógica**: clique na escala recalcula o score (ver 1.2). Botões de decisão e rascunho **sem handler** |
| 4 | `v-resultado` · Resultado & ciência | Resultado estático "72% · Desenvolver" com barras por pilar 88/70/73; trilha de carreira hardcoded (Vendedor→Vendedor Líder→Coordenador→Gerente); "Ciência digital" com botão; resumo de plano de ação | F1 | `registrarCiencia()`: troca o HTML do box por confirmação com **hash fake hardcoded** `7f3a…c91e` e `toLocaleString('pt-BR')`; nada persiste |
| 5 | `v-pdi` · PDI com IA | Alerta RN-17 (validação do gestor); 3 gaps "atual→alvo" com % **por indicador** (60%→80% etc.); ações com links manuais Sults/Conquer (RF-PDI-03: sem API Sults); botões Validar/Editar | F2 | `validarPDI()`: esconde/mostra divs |
| 6 | `v-card` · Card do Colaborador | Alerta RN-21 (módulo proposto pela btime, **não estava no discovery**; Teoria dos Cartões/Dalio; nasce privado); card com "índice de credibilidade **B+**" (métrica sem definição em lugar nenhum), forças/desenvolvimento, evolução por pilar; nota RN-22 (sensíveis estruturalmente fora) | F2 | Nenhuma |
| 7 | `v-modelos` · Modelos de avaliação | Nota RNF-08 (toda regra administrável) e RN-18 (mudança vale só para ciclos futuros); filtros Experiência/**Feedback**/Desempenho (tipo "Feedback" aparece só aqui); config do pilar Dever (5 indicadores × input "20%", rodapé "Soma: 100% ✓" **estático**); chips de escala 1–5 / 1–4 / 1–3 / Textual (fake); as 4 faixas de flag | F1 | Inputs editáveis mas **nada lê os valores**; soma não é validada |

Persona única: **Bárbara Garcone, "Administrador RH"** — sem login, sem troca de papel. Sidebar com badges
F1/F2/F3 e legenda de rollout por feature flag. Seletor "Todas as unidades" no topo, não funcional.
Identidade visual: teal `#137A6F` + indigo `#5646D6`, fontes Inter/Space Grotesk via Google Fonts (CDN externo).

### 1.2 Modelo implícito no código (valores exatos)

**Pesos de pilar** — hardcoded no JS:

```js
const pilarWeights={dever:0.30,des:0.40,fit:0.30};
```

**Pilares e indicadores** (tela de avaliação):

| Pilar | Peso | Indicadores | `data-w` por indicador |
|---|---|---|---|
| 1 · Dever | 30% | Pontualidade, Assiduidade, Apresentação pessoal, Interesse em aprender, Comunicação (5) | `6` cada (5×6 = 30) |
| 2 · Desenvolvimento ("CHA do cargo Vendedor") | 40% | Conhecimento do produto, Técnica de vendas, Organização da carteira, Qualidade do atendimento (4) | `10` cada (4×10 = 40) |
| 3 · Fit Cultural ("9 valores · **exibindo 3**") | 30% | Disciplina, Determinação, Colaboração (3 de 9) | `10` cada (3×10 = 30) |

Os `data-w` são pesos absolutos do indicador no resultado final e **só somam 100 porque o Fit exibe 3 dos
9 valores** — com os 9 valores reais, 9×10 = 90 ≠ 30: a aritmética do modelo quebra. Irrelevante na prática,
porque **o JS nunca lê `data-w`**.

**Cálculo da nota final** (função `calc()`):

```js
const val=sel?parseInt(sel.textContent):0;   // não respondido = 0
groups[pilarOf(s)].push(val/5);              // normaliza dividindo por 5, fixo
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;  // média ARITMÉTICA simples
const final=(d*0.30+de*0.40+f*0.30)*100;
```

- Nota do pilar = média aritmética simples das notas/5 (pesos por indicador ignorados).
- Final = soma ponderada dos pilares por 30/40/30 (única ponderação que existe).
- Exibição: `Math.round` aplicado **independentemente** por pilar e no final.
- Pilar sem indicador daria 0 silencioso (guard `a.length?…:0` evita divisão por zero, mas devolve zero, não erro).

**Escala:** 1–5, normalização `/5` fixa — nota mínima legítima (1 em tudo) = **20%**, nunca 0%.
Os chips "1–4 / 1–3 / Textual" da tela de Modelos quebrariam o cálculo se existissem.

**Faixas/flags** — hardcoded no JS:

```js
if(final<40)  → "Desligar / recuperar"        (vermelho)
else if(final<60) → "Atenção · desenvolver"    (âmbar)
else if(final<80) → "Desenvolver p/ liderança" (verde)
else              → "Alto desempenho · sucessão" (verde-escuro)
```

A UI exibe "0–40 / 40–60 / 60–80 / 80–100" com fronteiras ambíguas; o código resolve silenciosamente:
40 cai em "Atenção", 60 em "Desenvolver", 80 em "Sucessão" (limite inferior inclusivo, superior exclusivo).

**Ciclos:** dois tipos nos dados estáticos — "Experiência · 45 dias", "Experiência · 90 dias",
"Desempenho · semestral" — mais o tipo "Feedback" que só aparece como filtro em Modelos. Nenhum motor:
tabela fixa, vencimentos digitados ("em 3 dias", "vencida há 2 dias"), sem relação com data de admissão.

**Ciência:** `registrarCiencia()` grava nome fixo "Rafael Nunes" **na sessão da administradora RH**,
hash literal `'7f3a…c91e'`, timestamp `toLocaleString('pt-BR')` (hora local, sem UTC), zero persistência.

**Estado/persistência:** inexistentes — sem localStorage, sem backend, sem rascunho (botão sem handler),
sem envio, sem consolidação. Toda "regra" citada (RN-03, RN-06, RN-17, RN-18, RN-20, RN-21, RN-22, RNF-08,
RF-DSH-03/06, RF-PDI-03) existe **somente como texto de nota de rodapé**.

---

## 2. Conferência contra o discovery (Ficha §5)

| Promessa do TO-BE (§5) | No mockup | Veredito |
|---|---|---|
| 3 pilares Dever 30 / CHA 40 / Fit 30 | Presente e consistente (`pilarWeights` = 0.30/0.40/0.30) | ✔ Confere |
| Escala 1–5 | Presente na UI; normalização `/5` fixa; escalas alternativas são chips decorativos | ✔ parcial |
| Faixas 0–40/40–60/60–80/80–100 | Presentes, mas **hardcoded no JS** e com fronteiras não especificadas (resolvidas por `<` no if/else) | ✔ nos valores, ✘ na mecânica |
| Pesos parametrizados pelo RH | **Falso no código**: inputs da tela de Modelos não são lidos; `data-w` ignorado; pilares e faixas em constante JS | ✘ diverge do próprio RNF-08 exibido |
| Flag = recomendação, decisão humana com justificativa se divergir | Texto RN-06 presente e botões Renovar/Desligar existem — **sem handler, sem captura de justificativa, sem registro de decisor/data**, acionáveis com avaliação incompleta | Conceito ✔, mecânica ✘ |
| Ciclos Experiência 45/90d + Desempenho semestral (dia 1 da admissão) | Presentes como **linhas estáticas de tabela**; nenhuma geração, nenhuma amarração ao contrato de experiência; RN-20 só em nota | Vocabulário ✔, motor ✘ |
| Regra administrável com vigência (mudança vale só p/ ciclos futuros — RN-18) | "Modelo v3" é um rótulo de texto; tela de Modelos **não tem** versão, vigência, status ou histórico | ✘ ausente |
| Fit Cultural = 9 Valores Fast | **3 de 9** exibidos ("9 valores · exibindo 3"), sem descritores comportamentais por nível 1–5 — a régua não existe | ✘ incompleto |
| Card privado, sensíveis estruturalmente fora (RN-21/22) | Conceito presente e bem enunciado; estático; **adiciona** "índice de credibilidade B+" que não estava no discovery e não tem definição | ✔ conceito, ✘ métrica nova sem spec |
| Ciência digital com hash substitui Folha 4 | Tela existe; hash fake, sem persistência, registrada na sessão errada (RH dá ciência pelo colaborador) | Conceito ✔, implementação ✘ |
| Rollout faseado por feature flag F1/F2/F3 | Presente como badges e legenda; coerente com nosso roadmap | ✔ Confere |

**Inconsistências numéricas internas** (o mockup não fecha nem consigo mesmo):

1. Tela Resultado mostra **72%** com pilares 88/70/73 — mas 88×0,30 + 70×0,40 + 73×0,30 = **76,3%**. O número
   estático não sai da própria fórmula do mockup com os próprios pesos do mockup.
2. A tela de Avaliação pré-carregada calcula Desenvolvimento = **75%** (notas 4,3,4,4) e final = **78%**;
   a tela de Resultado do mesmo Rafael Nunes mostra Desenvolvimento = **70%** e final = 72%. Duas telas do
   mesmo caso, três números diferentes.

---

## 3. Erros estruturais e superficialidades

Ordenado por gravidade. "E" = erro estrutural, "S" = superficialidade.

1. **[E] Indicador não respondido conta como nota zero.** `const val=sel?parseInt(...):0` e o zero **entra na
   média** (`push(val/5)` incondicional). Uma avaliação enviada pela metade despenca de faixa e pode gerar flag
   "Desligar / recuperar" por omissão do avaliador — o pior bug possível num sistema cujo output alimenta decisão
   de desligamento. Não há estado "não avaliado", não há bloqueio de envio incompleto (não há envio).
2. **[E] Média aritmética onde a spec promete ponderação.** `avg = sum/length`; os pesos por indicador
   (tela de Modelos, 20% cada; `data-w` no HTML) são decorativos — o JS nunca os lê. E a aritmética dos `data-w`
   só fecha 100 com 3 dos 9 valores do Fit (item 1.2): o modelo implícito quebra quando os 9 valores entrarem.
   Nosso desenho usa peso **relativo** do indicador dentro do pilar justamente para isso.
3. **[E] Regras hardcoded que o próprio mockup declara administráveis.** `pilarWeights`, o divisor `/5` e o
   if/else de faixas estão em constantes JS — contradição direta com RNF-08 ("toda regra é dado administrável")
   e RN-18 (vigência) exibidos na tela de Modelos. Nosso desenho exige `modelo_avaliacao_versao` com
   rascunho→ativa→encerrada e ciclo congelando a versão; nada disso tem contraparte no mockup.
4. **[E] Versionamento fictício.** "Modelo v3" é string no cabeçalho da avaliação. Sem entidade de versão,
   vigência, status, responsável ou trilha — o requisito central de defensabilidade ("resultado ligado à versão
   da época, sem recálculo retroativo") não tem nenhum esqueleto aproveitável aqui.
5. **[E] Decisão humana sem mecânica.** Botões "Renovar contrato (+45 dias)" e "Desligar" **sem handler**;
   sem justificativa obrigatória (nem campo), sem registro de decisor/data/divergência, acionáveis com avaliação
   vazia. A nota "decisão divergente exige justificativa; avaliação torna-se imutável" é texto. RN-06 citada,
   não implementada. (O rótulo "+45 dias" também assume prorrogação única 45+45 — pergunta aberta 7 do módulo.)
6. **[E] Ciclo de experiência sem amarração ao contrato.** Vencimentos digitados à mão; nada nasce da admissão;
   nenhum alerta real de prazo legal (CLT arts. 443/445/451 — decisão antes do vencimento). O único item com
   prazo jurídico duro do módulo é, no mockup, uma tabela estática.
7. **[E] Papéis e permissões inexistentes.** Persona única "Administrador RH" executa a avaliação do gestor,
   vê dashboard nominal com flags "Desligar/recuperar" de qualquer pessoa, valida PDI **e dá ciência pelo
   colaborador** (`registrarCiencia()` grava "Rafael Nunes" na sessão de Bárbara Garcone) — quebra conceitual
   grave: a ciência só tem valor probatório se for do titular autenticado. Zero RBAC, zero minimização de payload.
8. **[E] Ciência digital juridicamente vazia.** Hash hardcoded (não é hash de conteúdo nenhum), timestamp em
   hora local sem UTC, sem persistência, sem identificação real do declarante. Para valer como substituto da
   Folha 4 (MP 2.200-2/2001 art. 10 §2º) precisa de SHA-256 real do conteúdo apresentado + trilha — padrão GED
   `documento`+`ciencia` do nosso desenho.
9. **[E] Sem estados de avaliação.** Não existe rascunho persistido, envio, imutabilidade pós-envio, reabertura
   auditada nem consolidação — os status (Agendada/Em andamento/Vencida/Concluída) existem só como chips
   estáticos na lista de ciclos, sem máquina de estados por trás.
10. **[E] Sem trilha de auditoria e sem trilha de leitura.** Nenhuma ação gera registro; nota bruta e flag são
    exibidas sem conceito de quem viu. Nosso desenho exige duas trilhas só-INSERT desde o dia 1.
11. **[E] Pilar Dever 100% subjetivo.** Pontualidade e assiduidade viram nota 1–5 a critério do gestor; o dado
    objetivo (Nasajon no discovery; módulos internos no nosso desenho v2) aparece apenas como "contexto de apoio
    (Fase 2)" **exibido** durante o preenchimento — não há régua de conversão indicador→nota, nem origem rastreada
    (`insumo_dever`). O pilar mais "objetivo" do modelo é o mais arbitrário no mockup.
12. **[E] Régua do Fit Cultural inexistente.** 3 dos 9 Valores Fast, cada um com uma frase de efeito
    ("Faz o combinado, com consistência") — sem descritores por nível 1–5. Avaliador sem âncora comportamental =
    leniência/rigor por gestor sem controle (risco 8 do módulo).
13. **[E] Aritmética de exibição inconsistente.** `Math.round` independente por pilar e no final: a memória de
    cálculo exibida não reproduz o resultado exibido (88+75+73 arredondados não geram exatamente 78). Somado às
    inconsistências estáticas (72% ≠ 76,3% — seção 2), o mockup falha no próprio argumento de venda da memória
    de cálculo: transparência. Regra de arredondamento precisa ser definida e única, no backend.
14. **[E] Escala mal calibrada contra as faixas.** Com normalização `/5`, o piso real é 20% (nota 1 em tudo);
    a faixa 0–40 "Desligar" só é alcançável com médias < 2,0 — e o intervalo 0–20% é inalcançável por resposta
    legítima (só por não-resposta, via bug do item 1). As faixas foram desenhadas sobre um intervalo [0,100] que
    a escala não produz. Alternativas: normalizar (nota−1)/4, ou faixas conscientes do piso — decisão de negócio
    a levar ao RH (pergunta aberta 1 do módulo).
15. **[E] PDI exibe grandeza que o modelo não produz.** Gaps "atual 60% → alvo 80%" **por indicador** — mas o
    cálculo só produz % por pilar; % por indicador não existe em lugar nenhum do modelo. E "índice de
    credibilidade B+" do Card não tem fórmula, escala nem origem.
16. **[E] Dados sensíveis expostos por construção.** Dashboard com tabela nominal (nome, tempo de casa, fit%,
    resultado%, flag) e donut de distribuição incluindo a faixa "Desligar/recuperar" — num app real com esse
    desenho, o payload iria integral ao front para qualquer sessão. Nosso padrão: ausência no payload, não máscara.
17. **[S] Interatividade de fachada generalizada.** Filtros (fchips), Exportar, seletor de unidade, "+ adicionar
    filtro", chips de escala, botão "Indicador" — tudo sem handler. A tela de Modelos aceita digitar pesos e o
    "Soma: 100% ✓" é um texto fixo (digite 90%, continua ✓).
18. **[S] Acessibilidade deficiente.** Navegação por `div` clicável (sem role, sem teclado); botões de escala
    sem `aria-pressed` e sem nome acessível além do número; grupo de escala sem fieldset/legend; inputs de peso
    sem `<label>`; donut sem alternativa textual completa; texto 10px em `--muted-2` (#93A0AF) reprova contraste
    WCAG. Fontes via CDN Google (dependência externa para ferramenta interna de RH).
19. **[S] Identidade visual divergente** (já mapeado na Ficha §5): teal/indigo + Inter/Space Grotesk vs tokens
    Fast Pessoas (`#d21217`, Instrument Sans/Lora, claro/escuro). Re-skin obrigatório.
20. **[S] Conteúdos órfãos.** Trilha de carreira hardcoded (Vendedor→Vendedor Líder→Coordenador→Gerente) sem
    origem de dados nem lugar no nosso desenho; tipo de modelo "Feedback" que só existe como filtro; alegação do
    banner "o modelo de dados já suporta líder→liderado, pares e autoavaliação" sem nenhum modelo de dados no
    material entregue.

---

## 4. Veredito por componente

| Componente | Veredito | Justificativa (1 linha) |
|---|---|---|
| Arquitetura de navegação / mapa das 7 telas | **Aproveitar corrigindo** | O mapa cobre bem MVP+Fase 3; reorganizar por papel (gestor/RH/DP/colaborador) e re-skinnar |
| Tela de execução (3 pilares + escala 1–5 + painel sticky) | **Aproveitar corrigindo** | Melhor padrão de UX do mockup; falta descritor por nível, comentários, estados e cálculo correto |
| Memória de cálculo visível ao avaliador | **Aproveitar como está** (conceito) | Transparência do cálculo é exatamente nossa tese; implementação refeita no backend |
| Track de faixas com marcos 0/40/60/80/100 | **Aproveitar como está** (visual) | Comunicação clara de faixa/flag; valores viram dado do modelo versionado, não CSS |
| Motor de cálculo JS (`calc()`) | **Descartar** | Média simples, não-respondido=0, pesos ignorados, faixas hardcoded, arredondamento inconsistente — reescrever no backend |
| Painel de pendências de ciclos | **Aproveitar corrigindo** | Esqueleto certo (tipo/gestor/vencimento/status); ligar ao motor real amarrado ao contrato e filtros funcionais |
| Tela Modelos de avaliação | **Aproveitar corrigindo** | Layout de configuração serve; falta versão/vigência/status, validação real de soma e faixas contíguas |
| Bloco "Decisão do gestor" (RN-06) | **Aproveitar corrigindo** | Conceito e copy certos; implementar justificativa obrigatória, registro decisor/data e gating por completude |
| Tela Resultado do colaborador (barras por pilar + faixa) | **Aproveitar corrigindo** | Boa devolutiva visual; números do cálculo real e política do que o avaliado vê (pergunta aberta 3) |
| Ciência digital (tela e copy) | **Aproveitar corrigindo** | Fluxo certo; hash SHA-256 real via GED, sessão do titular, persistência, UTC |
| Dashboard RH (KPIs, distribuição, adesão) | **Aproveitar corrigindo** | Perguntas de gestão legítimas (RF-DSH-06); Fase 3, com RBAC, trilha de leitura e dados reais |
| Consulta analítica multidimensional | **Aproveitar corrigindo** | Responde pergunta real do discovery (RF-DSH-03); Fase 3, payload minimizado + trilha de leitura |
| PDI (layout de gaps atual→alvo) | **Aproveitar corrigindo** (Fase 3, só layout) | Visual de gap é bom; mecânica refeita sobre `pdi`/`acao_pdi` — % por indicador não existe no modelo |
| Card do Colaborador | **Aproveitar corrigindo** (Fase 3) | Conceito privado RN-21/22 já absorvido no nosso desenho; remover "índice de credibilidade" ou especificá-lo do zero |
| "Índice de credibilidade B+" | **Descartar** | Métrica sem fórmula, sem escala, sem origem — não entra sem spec própria |
| Trilha de carreira | **Descartar** | Hardcoded, sem origem de dados, fora do escopo do módulo (dependeria de trilha de cargos inexistente) |
| Notas RN-*/RF-*/RNF-* espalhadas nas telas | **Aproveitar como está** | Âncoras à spec TO-BE — viram requisitos rastreáveis; o mockup as cita, nós as implementamos |
| Banner de rollout F1/F2/F3 por feature flag | **Aproveitar como está** (conceito) | Bate com nosso roadmap (MVP líder→liderado → Fase 3); a alegação "modelo de dados suporta" é vazia |
| Identidade visual (teal/indigo, Inter/Space Grotesk) | **Descartar** | Re-skin nos tokens Fast Pessoas (#d21217, Instrument Sans/Lora, claro/escuro) |
| Persistência / estados / papéis / trilhas | **Descartar (inexistem)** | Não há o que aproveitar: nada foi construído |

---

## 5. O que o esqueleto NÃO tem e nosso módulo exige

Tudo abaixo está especificado em `docs/03-modulos/05-avaliacao-360.md` e **não tem nenhuma contraparte
funcional no mockup** (no máximo uma nota de rodapé):

1. **Versionamento com vigência** — `modelo_avaliacao_versao` (rascunho→ativa→encerrada), ciclo congela a
   versão na abertura, sem recálculo retroativo; validação na ativação (pesos=100%, faixas contíguas 0–100,
   pilar com ≥1 indicador). No mockup: um rótulo "v3" e um "✓" estático.
2. **Catálogo dos 9 Valores Fast** com descritores por nível 1–5 (`valor_fast`/`descritor_valor`), versionados
   com o modelo, exibidos como régua ao avaliador. No mockup: 3 valores com uma frase cada.
3. **Amarração com o contrato de experiência** — ciclos 45/90d gerados de `processo_admissao` com datas reais,
   alerta antecipado parametrizável (gestor+DP), decisão registrada **antes do vencimento** (CLT 443/445/451).
4. **CHA derivado de `cargo_versao`** vigente na abertura (bloqueio se cargo sem CHA estruturado) — no mockup
   os 4 indicadores do "CHA do cargo Vendedor" são texto fixo.
5. **Pilar Dever com origem rastreada** — `insumo_dever` alimentado por ponto/afastamentos/`evento_colaborador`
   ou manual-DP com justificativa; régua de conversão indicador→nota parametrizada, calculada no backend.
6. **Máquina de estados + imutabilidade** — rascunho/enviada/expirada/reaberta (evento auditado);
   `resultado_consolidado` imutável ligado à versão; recálculo legítimo = nova linha com motivo.
7. **Decisão humana registrada** — `decisao_humana` (decisor, decisão, diverge, justificativa NOT NULL quando
   diverge) + ponte com `processo_desligamento`.
8. **PDI integrado** (Fase 3) — `pdi`/`acao_pdi` ligados a `acao_aberta`; Sults só com API verificada.
9. **Ciência com hash real** — GED `documento`+`ciencia`, SHA-256 do conteúdo no momento, na sessão do titular.
10. **RBAC por chave** — `avaliacao.configurar/.responder/.decidir/.nota_bruta.ver` etc.; gestor por
    `relacao_gestor` vigente; payload minimizado (ausência, não máscara); matriz de testes de autorização no CI.
11. **Auditoria em duas trilhas** só-INSERT por GRANT — alteração (toda transição) e **leitura** (todo acesso a
    nota bruta), UTC + America/Sao_Paulo.
12. **Notificações** n8n/WhatsApp sem dado sensível no payload; **linha do tempo** (`evento_colaborador`
    "avaliação concluída"); **devolutiva** que zera cadência de `feedback_formal`.

---

## 6. Plano de aproveitamento

Caminho concreto, na ordem do roadmap (MVP "360 v1" líder→liderado = último item da Fase 2, atrás de feature flag):

**Passo 1 — Protótipo HTML standalone re-skinado (antes de qualquer código).**
Portar do mockup btime, nos tokens Fast Pessoas (`#d21217`, Instrument Sans/Lora, claro/escuro, mobile):
mapa de navegação; tela de execução com painel sticky + memória de cálculo + track de faixas; painel de
pendências de ciclos; tela de resultado + ciência; bloco de decisão do gestor. Já corrigindo no protótipo:
**seletor de papel simulado** (gestor/RH/DP/colaborador — método da Ficha §7), estados rascunho→enviada,
envio bloqueado se incompleto, descritores 1–5 do Fit visíveis, comentário por indicador + geral, justificativa
na decisão, ciência na visão do colaborador (não do RH). Validar com DP/RH.

**Passo 2 — Redesenhar do zero (nada a portar):**
motor de cálculo no backend (ponderado por indicador e pilar; política explícita de item não respondido =
bloqueio de envio, jamais zero; normalização da escala decidida com o RH — item 14 da seção 3; arredondamento
único e documentado; fronteiras de faixa explícitas `[min, max)` cobrindo 0–100); administração de modelos com
versão+vigência; motor de ciclos amarrado a `processo_admissao`; RBAC, trilhas e ciência com hash real.

**Passo 3 — Ordem de construção do MVP** (auditoria em duas trilhas ativa desde o item a):
(a) modelo versionado + catálogo 9 Valores + validações de ativação; (b) motor de ciclos (experiência amarrada
à admissão; desempenho por calendário — pergunta aberta 6); (c) execução líder→liderado com estados e
imutabilidade pós-envio; (d) consolidação no backend + flag; (e) decisão humana registrada + ponte com
desligamento; (f) devolutiva + ciência com hash; (g) painéis RH/gestor + `evento_colaborador` + notificações.
Critério de pronto: primeiro ciclo de Experiência concluído com decisão humana registrada.

**Passo 4 — Fase 3, reaproveitando layouts btime corrigidos:**
dashboard analítico + consulta multidimensional (com trilha de leitura), PDI (layout de gaps), Card privado
(sem "índice de credibilidade", salvo spec própria), 360 completa (pares com mínimo ≥3 respondentes),
calibração.

**Passo 5 — Governança da auditoria:** cada default herdado do esqueleto (pesos 30/40/30, faixas, escala,
réguas do Dever) entra no log de decisões como "default de partida sujeito a validação do RH" e só vira
parâmetro ativo do primeiro modelo real após resposta às perguntas abertas 1, 2, 3, 6 e 7 do doc do módulo —
a seção 3 desta auditoria fornece o material técnico para essas conversas (em especial itens 5, 11, 12 e 14).
