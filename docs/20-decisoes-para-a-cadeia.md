# Decisões para a cadeia de execução — folha única de respostas

> Criado em 24/08/2026, a partir do mapeamento das 8 frentes restantes (varredura somente-leitura
> da cadeia de execução). Regra do arnês (ponto 4): **nada sobe como pergunta crua** — cada item
> traz a decisão recomendada (✔), o porquê e o contra. Quem decide decide, não pesquisa.
>
> **Como responder:** basta mandar no chat os códigos, ex.: `A1: b · A2: a · B1: a…` — ou marcar
> a folha de respostas no fim. Itens sem resposta seguem a recomendação ✔ quando a onda largar,
> EXCETO os marcados **[trava]** — esses não se constroem sem resposta.
>
> O que cada bloco destrava: **A–D → Ondas 1 e 2** (as 7 frentes paralelas) · **E–G → Onda 3**.

---

## Bloco A · Visibilidade em camadas *(destrava o agente 1.1 — a maior frente)*

### A1. Salário do gestor: qual chave? **[trava]**
A chave `rh.posicao.ver` está na lista de chaves sensíveis e obriga 2FA — dá-la aos gestores
manda ~6 pessoas sem TOTP para o enrolamento (a mesma conta que barrou `ponto.ver.equipe`).
- **(a) ✔ Chave nova de alcance-equipe** (`rh.posicao.ver.equipe`), fora da lista de 2FA
  obrigatório, **com trilha de leitura sempre**. *Pró:* segue o precedente do ponto; salário do
  próprio ramo ≠ salário global. *Contra:* duas chaves para o mesmo dado, em alcances diferentes.
- **(b)** Conceder a `rh.posicao.ver` global e aceitar o enrolamento de 2FA dos gestores.

### A2. O escopo "equipe" recursivo vale para quê? **[trava]**
`condicaoEscopo` é ponto único usado por ~20 consultas (ficha, ponto, documentos, admissões).
Mudar "equipe" para sub-árvore muda tudo junto.
- **(a) ✔ Tudo vira sub-árvore** — uma semântica só de "minha equipe" (o organograma significa
  isso). *Pró:* sem dois conceitos de equipe convivendo. *Contra:* gestor de topo passa a
  alcançar muita gente de uma vez (mitigado pela trilha).
- **(b)** Sub-árvore só onde a Fase 4 pede (salário + disciplinar); o resto continua equipe direta.

### A3. Disciplinar da equipe: alcance
- **(a) ✔ Sub-árvore, coerente com A2; e só medidas do vínculo que o gestor lidera** — nada de
  vínculo anterior/outro CNPJ (a 0046 barrou vazamento cross-vínculo de propósito). *Contra:*
  gestor não vê reincidência de outra empresa do grupo (o DP vê).
- **(b)** Equipe direta apenas.

### A4. Ficha pública mínima: confirma a inversão?
Hoje fora do alcance = 404 (a pessoa "não existe"). A Fase 4 pede que todo logado veja o mínimo
(nome, cargo, contato corporativo, líder, unidade).
- **(a) ✔ Sim** — catálogo mínimo visível a qualquer logado, **sem** trilha de leitura (dado
  operacional); trilha só a partir do que exceder o mínimo. *Contra:* headcount e estrutura
  ficam visíveis a todo usuário interno.
- **(b)** Manter 404 fora do alcance (contraria o critério da Fase 4 — registrar por quê).

### A5. Raça-cor (IBGE): regime de privacidade
- **(a) ✔ Regime idêntico ao do gênero** — autodeclarado, formulário cego, nunca sai em payload
  individual, só agregado com piso k. *Contra:* o DP não consulta o dado de uma pessoa nem para
  conferência.
- **(b)** Visível ao DP na ficha (decisão de privacidade a registrar).

### A6. Nível hierárquico do cargo: onde e como
- **(a) ✔ Catálogo administrável** (eixo 9 — nada chumbado) e **na versão do cargo**
  (`cargo_versao`, muda com o tempo). *Contra:* uma tela a mais de catálogo.
- **(b)** Lista fixa no código.

### A7. Telefone/e-mail corporativo: da pessoa ou do vínculo?
- **(a) ✔ Do vínculo** — e-mail corporativo pertence ao empregador; transferência com rescisão
  troca o endereço. *Contra:* um campo a mais para preencher a cada vínculo novo.
- **(b)** Da pessoa.

---

## Bloco B · Código de Conduta + ciclo de ciência *(destrava 1.5 e 2.1)*

### B1. Quando bloqueia? **[trava]**
- **(a) ✔ Código de Conduta bloqueia já no 1º acesso** (é o critério do roadmap); as DEMAIS
  políticas com "exige ciência" geram pendência com prazo administrável + lembrete, sem bloquear.
  *Contra:* primeiro login fica mais longo.
- **(b)** Bloqueio só depois de vencer o prazo, para tudo.

### B2. Recusa e testemunhas: como funciona? **[trava]**
- **(a) ✔ Recusa abre um registro de ato feito pelo DP com 2 testemunhas**, e cada testemunha
  confirma com a própria sessão (ciência de testemunho, hash e data). *Pró:* molde CLT, tudo
  auditável dentro do sistema. *Contra:* exige que as testemunhas tenham acesso ao sistema.
- **(b)** DP registra o ato presencial sozinho (nomes das testemunhas em texto).

### B3. Versão nova reabre para quem?
- **(a) ✔ Todos os ativos** (inclusive quem nunca deu ciência na anterior) **e admitidos futuros
  herdam automaticamente**. *Contra:* pico de pendências a cada versão nova.
- **(b)** Só quem tinha dado ciência na versão anterior.

### B4. O bloqueio vale para quem?
- **(a) ✔ Para todos, inclusive DP/admin/diretoria** (o exemplo vem de cima; a rota de
  regularização fica sempre acessível). *Contra:* admin também para no bloqueio no 1º acesso.
- **(b)** DP/admin isentos.

### B5. "Rolar o documento até o fim" é exigência?
- **(a) ✔ Sim** — o visualizador rastreia a rolagem e o botão de ciência só habilita no fim;
  implica publicar o Código de Conduta em PDF/texto (Word não é exibível). *Contra:* mais
  implementação; documento precisa estar num formato exibível.
- **(b)** Abrir + confirmar com hash basta.

### B6. Recusado fica bloqueado?
- **(a) ✔ Não** — o registro com testemunhas **encerra o ciclo e libera o acesso**; o desfecho
  fica gravado e a consequência é decisão de gestão, não trava de sistema ("ninguém fica
  pendente para sempre" é o critério do roadmap). *Contra:* a pessoa segue usando o sistema
  tendo recusado o código.
- **(b)** Recusado permanece bloqueado (na prática, impede a pessoa de trabalhar no sistema).

---

## Bloco C · Segurança *(destrava 1.3 e a lane Borda 2.1)*

### C1. Throttle de TOTP (B3): limiar e alcance
- **(a) ✔ 5 falhas de TOTP em 5 minutos por usuário → 429 sem nem validar o código**; parâmetros
  administráveis (molde do rate-limit de senha da 0082); vale também para as revalidações
  críticas (aprovar folha, desativar 2FA). *Contra:* nenhum relevante — não tranca a conta de
  senha, só o 2º fator.
- **(b)** Só no login; limiares diferentes (dizer quais).

### C2. Reconferência de usuário desativado nas páginas (B4): largura
- **(a) ✔ Helper central + as 6 páginas keyless agora** (fecha o furo descrito na pendência #15);
  as demais 48 páginas migram para o helper oportunisticamente, a cada frente que já as tocar.
  *Contra:* a centralização completa fica gradual.
- **(b)** Refatorar as 54 páginas de uma vez (mais conflito com as ondas em andamento).

### C3. CSP com nonce (B5): tolerância a estilo
- **(a) ✔ Nonce em `script-src` (o ganho real contra XSS); manter `unsafe-inline` só em
  `style-src` se o Next exigir**; smoke manual de login + tela interna previsto na entrega.
  *Contra:* proteção de estilo continua relaxada (risco baixo).
- **(b)** Nonce completo custe o que custar (pode quebrar telas; mais tempo).

---

## Bloco D · Disciplinar e Posse *(fatia 2 do 1.1 e o item 3.5)*

### D1. Fechar/reduzir suspensão manual: regras
- **(a) ✔ Só encurtar o fim (nunca estender nem reabrir); aceita data retroativa até o início da
  janela; reusa a chave `rh.disciplinar.registrar`** (quem registra pode encerrar), tudo
  auditado. *Contra:* estender uma suspensão exigirá registrar medida nova (de propósito).
- **(b)** Regras diferentes (dizer quais).

### D2. Suspensão → folha (dias sem remuneração): a regra **[trava — vale validar com o contador]**
Hoje NENHUM código de folha lê medida disciplinar; a regra precisa nascer inteira.
- **(a) ✔ Rubrica própria "Desconto de suspensão disciplinar": desconta os dias CORRIDOS da
  janela, na competência de cada mês (janela que cruza mês desconta em cada uma a sua parte);
  valor-dia = salário ÷ 30; e desconta também o DSR da semana da suspensão** (Lei 605/49, mesma
  lógica da falta injustificada). *Contra:* a regra do DSR merece confirmação do contador antes
  da primeira folha real.
- **(b)** Outra regra (dizer qual). **Sem resposta, o item 3.5 não entra.**

---

## Bloco E · OLAC — integração com a contabilidade *(destrava 3.2)* **[trava]**

O mapa de eixos (docs/14) **proíbe construir** antes da decisão E1.

### E1. Competência externa: como modelar
Hoje `competencia_folha` é única para o grupo (UNIQUE ano/mês/tipo), mas Supply, DCS e Casa do
Montador processam fora.
- **(a) ✔ Tabela paralela de conciliação** — lote de espelho por empresa+competência, sem mexer
  no UNIQUE nem no motor. *Pró:* menor cirurgia; espelho é leitura. *Contra:* duas "verdades" de
  competência convivem (interna calculada × externa espelhada), a tela precisa deixar claro.
- **(b)** Competência separada por empresa (mexe no UNIQUE e em todo o fluxo).
- **(c)** Marcação por empresa dentro da competência única.

### E2. O que é o espelho
- **(a) ✔ Registro somente-leitura de conciliação** — o que veio de fora NÃO vira item de folha
  calculado, só aparece lado a lado. *Contra:* totais "oficiais" externos não somam nos painéis
  internos automaticamente.
- **(b)** Vira item de folha (mexe no motor — mais caro e mais arriscado).

### E3. De-para rubrica → conta contábil
- **(a) ✔ Catálogo administrável com vigência** (eixo 9; o mapa de eixos já o lista como cadastro
  da onda J). *Contra:* uma tela a mais.
- **(b)** O arquivo sai com o código interno e a contabilidade converte lá.

### E4. Layout do arquivo (ida e volta) — **externo**
Precisamos de UM exemplo real do arquivo que a OLAC/Castor aceita e devolve (colunas, separador,
códigos). **Ação sua: pedir o exemplo.** Sem ele, 3.2 fica em suposição.

---

## Bloco F · Carga inicial e go-live *(destrava 2.3 e 3.3)*

### F1. Histórico retroativo na carga
- **(a) ✔ Só posição atual + data de admissão** — histórico de cargos/salários entra depois, por
  ajuste auditado, quando precisar. *Pró:* go-live semanas mais cedo. *Contra:* linha do tempo
  nasce curta (a partir da carga).
- **(b)** Importar histórico completo de cargos/salários/afastamentos (carga muito maior; layout
  de planilha por evento).

### F2. Acessos no go-live
- **(a) ✔ Criar usuário para todos os importados de uma vez**, por convite (senha definida no
  primeiro acesso) — a decisão antiga já dizia que "criar acesso para todos não é problema".
  *Contra:* onda de primeiros acessos concentrada (e todos passam pelo bloqueio do Conduta — de
  propósito).
- **(b)** Usuários criados um a um, depois.

### F3. Planilhas de origem — **externo**
Um export real do Nasajon (ou o formato combinado com o Diego) por planilha: cargos, unidades,
headcount/cadastros. **Ação sua: pedir os exemplos.** Sem eles o parser fica em suposição.

---

## Bloco G · Recrutamento *(1.2 já larga sem isto; G3 destrava 3.4)*

### G1. Reformular modelo: vaga aberta sem candidatura migra?
- **(a) ✔ Não migra — fica congelada na versão antiga; quem quiser troca manualmente** (o PATCH
  de vaga nasce na mesma onda). *Pró:* zero mágica. *Contra:* um clique a mais por vaga.
- **(b)** Migra automaticamente.

### G2. O modelo PADRÃO (GERAL) pode ser reformulado pela tela?
- **(a) ✔ Sim** — a versão nova herda `padrao=true` na mesma transação (o índice de
  um-padrão-ativo suporta). *Contra:* nenhum relevante.
- **(b)** Padrão fica fora do reformular por ora.

### G3. Pesquisa social (13c): privacidade do anexo **[trava]**
- **(a) ✔ Anexo mora no GED** (`rh.documento`, categoria própria), **visível só a `rs.gerir` com
  trilha de leitura sensível** (molde do parecer/valor de oferta); **retenção: apagar junto do
  descarte da candidatura recusada após N meses** — diga o N (sugestão: 6). *Contra:* política de
  retenção precisa ser cumprida (rotina de expurgo).
- **(b)** Outro desenho (dizer qual). **Sem resposta, 3.4 não entra.**

---

## Decisões técnicas que NÃO sobem (tomadas por mim, registradas para rastro)

- Teste de férias: unitário puro (exportando a lógica) **e** prova re-executável contra o banco — os dois moldes já existem no repo.
- "Minha posse" no portal: rota própria `/api/posse/minhas` (molde EPI); falha do cartão não derruba o portal.
- Ciência de posse pelo titular: continua keyless por titularidade (molde EPI), sem chave nova.
- Relatório dT por etapa: mediana; agrupa por **etapa do catálogo** (nome), não por posição no modelo; fechadas + abertas; por cargo.
- Migrations pré-alocadas por frente (0084–0096) para agentes paralelos não colidirem; buracos de numeração são aceitáveis.
- `docs/pendencias.md` e `db/semear/*`: agentes devolvem o conteúdo no relatório; a aplicação é do orquestrador, no merge.

---

## Respostas do dono — 24/08/2026 · **COMPLETAS (22/22)**

```
A1: a   A2: a   A3: a   A4: a   A5: b¹  A6: a   A7: b
B1: a   B2: a†  B3: a   B4: a   B5: a   B6: b‡
C1: modificada²   C2: modificada³   C3: a
D1: a   D2: a
E1: a   E2: a   E3: a   E4: layout NOSSO§
F1: a   F2: b   F3: dono envia depois
G1: a   G2: a   G3: a (N = 6 meses, assumido — dizer se for outro)
```

¹ **A5 = (b), decisão de privacidade registrada:** raça-cor é autodeclarada pela pessoa, mas o
**DP VÊ o dado individual na ficha**. Salvaguardas de construção: a leitura grava trilha de dado
sensível (eixo 8, molde salário/ASO) e o agregado do painel continua respeitando o piso de
anonimato. Escolha consciente do dono, não omissão.

² **C1 modificada pelo dono: 5 falhas de TOTP → o usuário é DESATIVADO** (`usuario.ativo=false`),
não só freado — reativação é ato do DP/admin. Salvaguardas de construção: (i) contam 5 falhas
CONSECUTIVAS (acerto zera o contador); (ii) **o último admin ativo nunca é desativado por esta
regra** (senão ninguém reativa ninguém — nesse caso aplica bloqueio temporário); (iii) fica
registrado o risco aceito: quem souber só a senha de alguém consegue derrubar a conta do outro
(negação de serviço), e o DP reativa.

³ **C2 modificada pelo dono: desativado perde o acesso a TUDO, na hora** — o guard central de
página vai nas **54 telas**, não só nas 6 keyless. Impacto no plano: a lane Borda (2.1) vira o
ÚLTIMO merge da Onda 2, para varrer as 54 páginas já com as outras frentes integradas.

† **B2 com acréscimos do dono:** o ato com testemunhas não nasce só da recusa — a **perda de
prazo** também abre o ciclo; o **próprio DP pode abrir** o ato diretamente; e as testemunhas são
**outros usuários do sistema** (confirmam com a própria sessão — hash e data).

‡ **B6 modificado pelo dono:** recusado **permanece bloqueado**, PORÉM **o usuário de maior
patente no sistema pode liberar** o acesso — nasce um ato explícito de liberação (chave própria,
ex. `rh.conduta.liberar`, concedida a admin/diretoria), auditado e visível no ciclo do documento.

§ **E4 decidido de forma nova (e destrava o OLAC):** em vez de esperar o layout da OLAC/Castor,
**nós definimos um arquivo de exportação completo NOSSO** (layout documentado, publicado junto do
arquivo) **e a OLAC se adapta para importá-lo**. O retorno deles entra no mesmo layout. A frente
3.2 deixa de depender de terceiro.

**Consequências no plano:** F2=b simplifica a carga inicial (o importador de headcount NÃO cria
usuários; acesso é criado um a um depois). A7=b põe telefone/e-mail corporativo na PESSOA, não no
vínculo. Todos os 7 [trava] estão respondidos — as Ondas 1 e 2 podem largar; só as fatias 3–4 da
Visibilidade (A4/A5), o detalhe do bloqueio (B4) e os três itens de segurança (C1–C3) aguardam as
explicações abaixo do orquestrador.
