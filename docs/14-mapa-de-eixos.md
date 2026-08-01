# 14 · O mapa de eixos

> Escrito em 01/08/2026, sobre o estado do disco na branch `onda-i`.
> Onze agentes varreram `fast-pessoas/` — dez sob a lente de um eixo, um projetando as ondas que faltam.
> A versão de máquina está em `fast-pessoas/db/mapa-eixos.json` e é o que o runner `db/mapa.js` re-executa.

---

## Para que serve

Um **eixo** é uma regra que atravessa o sistema inteiro e que já foi violada pelo menos uma vez. Não é
princípio de arquitetura: é o formato de um defeito que custou dinheiro ou credibilidade, elevado a
critério de revisão. "Dinheiro é centavo inteiro" só virou eixo porque o divisor 220 chumbado cobrava
44 h de quem faz 36 — R$ 1.708,25 por mês em dez plantonistas.

O mapa serve para responder uma pergunta: **se eu mexer aqui, quem depende disto?** Cada eixo lista as
fronteiras corretas (que não podem ser "simplificadas") e as erradas (que ainda estão de pé), sempre
com `arquivo:linha`.

Três vereditos, e a diferença entre eles é o que importa:

| Veredito | O que quer dizer | O que fazer |
|---|---|---|
| **violação** | Existe cenário concreto de estrago, descrito por escrito | Corrigir, ou registrar por que não |
| **suspeito** | Falta uma decisão do dono, não falta código | Responder a pergunta; ela está escrita ao lado |
| **legítimo** | Fronteira certa, muitas vezes com o argumento no comentário | **Não mexer** — vários existem porque a "simplificação" já foi tentada |

Os legítimos não são enfeite. São a maior parte do mapa (249 de 439) e existem para que a próxima
varredura não "conserte" o que está certo — o caso de `colaboradores/repositorio.ts:383`, onde a
ausência de filtro de data é a resposta correta, é o exemplo mais fácil de estragar.

**Ponto cego declarado vale mais que número alto.** Nenhum agente teve acesso ao banco. Nenhum número
deste documento foi medido contra dado real: tudo é leitura de código, e o Apêndice A traz as 30
consultas SQL que faltam rodar. Cinco eixos mudam de tamanho conforme o resultado delas.

---

## Quadro geral

| Eixo | Viol. | Susp. | Legít. | Total | O defeito que o provou |
|---|---:|---:|---:|---:|---|
| pessoa × vínculo | **14** | 13 | 17 | 44 | Clima contava vínculo onde a pergunta era "quantas pessoas" (0052) |
| identidade de lugar | 6 | 11 | 31 | 48 | Meta presa ao **nome** da unidade; renomear trocava o dono (0049) |
| tempo civil | 12 | 11 | 38 | 61 | View com `CURRENT_DATE` num servidor em UTC (0049) |
| decisão de acesso | **2** | 6 | 32 | 40 | 2FA e escopo decididos por nome de papel (0039, 0040) |
| dinheiro | 5 | 10 | 23 | 38 | Divisor 220 chumbado no motor da folha (0038) |
| tempo trabalhado | 5 | 8 | 31 | 44 | Hora noturna reduzida inexistente; divisor 6 do DSR (0043) |
| onde o filtro mora | **1** | 6 | 22 | 29 | Folha recortava centro de custo no cliente |
| rastro de leitura | 9 | 7 | 21 | 37 | Banco de horas lido sem deixar rastro; chave gravada mentia |
| nada chumbado | **22** | 18 | 17 | 57 | Piso *k* de anonimato escrito no fonte (0044, 0045) |
| vigência | **18** | 6 | 17 | 41 | Adesão de benefício lida por `fim IS NULL`, sem data (0051) |
| **Soma** | **94** | **96** | **249** | **439** | |

Dois números destoam e explicam o resto do documento. **`nada chumbado` com 22 violações** não é
descuido espalhado: são quatro cadastros que o banco já modelou como administráveis e que não têm
tela, mais uma dúzia de listas de domínio fechadas em `as const` + `CHECK`. **`vigência` com 18** tem
uma causa só, repetida: quem fecha a janela quando o contrato acaba.

E dois números baixos merecem leitura ao contrário. `decisão de acesso` com 2 violações em 175 rotas e
`onde o filtro mora` com 1 são a prova de que eixo com ferramenta (`sistema.tem_permissao`,
`condicaoEscopo`) e com correção documentada não volta. Os que voltam são os que dependem de alguém
lembrar.

> **Correção de contagem.** Seis varreduras publicaram no próprio resumo um total que não bate com a
> lista de ocorrências delas. Aqui vale a lista, contada item a item — em cinco casos isso *reduziu* o
> número de violações (pessoa × vínculo saiu de 16 para 14; `nada chumbado` de 25 para 22) e num caso
> aumentou. A divergência está registrada nos pontos cegos de cada eixo no JSON.

---

## 1 · pessoa × vínculo — 14 violações

**A regra.** `rh.pessoa` é o ser humano (o CPF único mora lá desde a 0046); `rh.colaborador` é o
**vínculo**, e a mesma pessoa pode ter vários — transferência entre CNPJs (0048), readmissão. Contar
gente é diferente de contar contrato. A régua de "de quem é o dia D" veio da própria transferência:
posição e lotação do vínculo velho fecham em **D−1**, o vínculo novo nasce em **D**, mas
`data_desligamento` do velho **é D**. Logo `<= data_desligamento` conta a pessoa duas vezes no dia da
virada, e `> data_desligamento` acerta.

**O estado hoje.** A parte estrutural está bem feita e os módulos tocados nominalmente pelo trabalho
(documentos, ponto, organograma, demandas, revogação de acesso, admissão) estão corretos e vêm com o
argumento escrito ao lado. O que sobrou são os lugares que ninguém revisitou depois da 0046, em três
famílias.

**As violações.**

| Onde | O que acontece |
|---|---|
| `src/dominios/clima/repositorio.ts:186` | Respondentes contados por `colaborador_id` em janela de 30 dias — a 0052 pôs `pessoa_id` nessa tabela exatamente por isso |
| `src/dominios/clima/repositorio.ts:259` | **O piso de anonimato conta contrato.** Unidade com 4 pessoas e uma transferida na janela chega a 5, passa o `HAVING`, e a média vai para a tela |
| `src/dominios/clima/repositorio.ts:251` | O número de respondentes exibido ao lado da média tem o mesmo erro: "5 respondentes" são 4 pessoas |
| `src/dominios/painel-executivo/repositorio.ts:421` | `JOIN … ON co.cpf = cd.cpf` depois de a 0046 derrubar o UNIQUE do CPF: a mesma vaga vira dois casos no tempo de contratação |
| `src/dominios/painel-executivo/repositorio.ts:507` | Fronteira inclusiva no denominador do absenteísmo, contra `ATIVO_EM` na linha 34 do **mesmo arquivo** |
| `src/dominios/portais/repositorio.ts:160` | Quem tem oito anos de casa aparece com 1 dia depois da transferência |
| `src/dominios/portais/colaborador-servico.ts:472` | A própria pessoa lê "você está na casa há 1 dia" enquanto o bloco de contratos anteriores, no mesmo payload, mostra os oito anos |
| `src/dominios/colaboradores/repositorio.ts:410` | Feedback lido só do contrato corrente: depois da transferência a cadência **reinicia** e quem está há 400 dias sem conversa aparece em dia |
| `src/dominios/colaboradores/repositorio.ts:1122` | Sem feedback, o prazo conta da admissão **do contrato** — carência nova que ninguém concedeu |
| `src/dominios/portais/colaborador-repositorio.ts:84` | O bloco "Avaliações" do próprio portal fica vazio depois da transferência, embora a 0048 prometa por escrito que essa leitura atravessa |
| `src/dominios/portais/colaborador-repositorio.ts:137` | Pior no PDI: a pessoa perde de vista ações que ela mesma se comprometeu a fazer, com prazo correndo |
| `src/dominios/ponto/servico.ts:576` | Fronteira inclusiva numa escrita **append-only**: a batida do dia D com a matrícula antiga é aceita no vínculo já desligado e fica órfã para sempre |
| `src/dominios/ponto/servico.ts:595` | `.find` sobre lista sem `ORDER BY`: com dois vínculos vigentes no dia D, a mensagem que existe para desatolar o DP pode mandar a matrícula errada |
| `src/dominios/pesquisas/repositorio.ts:622` | O piso de anonimato da pesquisa é aplicado sobre **contagem de respostas**: 3 pessoas × 2 perguntas = 6, e passam por um piso de 5 |

**Os suspeitos.** Treze, e **doze deles dependem de uma resposta só**: existe hoje pessoa com dois
vínculos não desligados ao mesmo tempo? O banco permite (`db/migrations/0046:166` cria índice **não**
único e não há `EXCLUDE`), a aplicação recusa só no caminho da admissão. Se a resposta for sim, viram
violação de uma vez: `clima/repositorio.ts:287` e `pesquisas/repositorio.ts:477` (denominadores de
adesão), `colaboradores/repositorio.ts:2101` (aniversariantes), `:2151` (diversidade), `:2223`
(composição familiar). Os outros três pedem decisão própria: `clima/servico.ts:292` (a trilha de LGPD
é consultada por titular ou por registro?), `clima/repositorio.ts:304` (o seletor lista vínculos ou
pessoas?), `beneficios/repositorio.ts:663` (dois contratos podem ter adesões independentes?).

**Pontos cegos.** SQL montado por concatenação escapa de todo grep — `condicaoEscopo`,
`condicaoFiltroEstrutura` e os `LATERAIS_VIGENTES` entram como string e o texto final nunca aparece
inteiro em nenhum arquivo. `rh.estrutura_em`, `rh.lotacao_detalhada` e `rh.estabelecimento_versao_em`
são usadas em `JOIN LATERAL` e não tiveram o corpo lido: se alguma devolver mais de uma linha por
(vínculo, data), a duplicação entra por baixo. As telas foram varridas só por palavra-chave — um
`reduce` por `colaborador_id` dentro de componente não usa nenhuma delas. E duas tabelas ficaram sem
decisão: `rh.dependente` (o filho é da pessoa, e a transferência **copia** a linha) e `rh.acao_aberta`
(o PDI é da pessoa, não é copiado nem lido por pessoa).

---

## 2 · identidade de lugar — 6 violações

**A regra.** Estabelecimento, unidade, empresa e centro de custo se identificam por **id**, nunca por
nome. Exibir o nome e gravá-lo como rótulo congelado de história é legítimo, desde que a chave ao lado
seja o id e o nome de hoje seja resolvido como função de `(id, data)`.

**O estado hoje.** É o eixo mais bem consertado, e consertado com método: a 0049 não só trocou a
coluna — deixou o defeito escrito, criou o índice único por `(indicador_id, estabelecimento_id)`,
amarrou o rótulo à chave por `CHECK`, e o domínio inteiro de indicadores foi reescrito. O padrão vazou
para a vizinhança certa (filtro dos três campos, benefícios, banco de horas, gate do líder na
transferência, pesquisas, rateio da folha).

**As violações têm um formato só**, e vale nomeá-lo porque é o sucessor natural do defeito original: a
consulta agrupa corretamente por id, mas **o SELECT e o DTO devolvem apenas o rótulo**. A identidade
não morre no SQL, morre na fronteira da API.

| Onde | O que acontece |
|---|---|
| `src/dominios/clima/repositorio.ts:242` | `GROUP BY est.estabelecimento_id` certo, `AgregadoUnidade` só tem `unidade: string` |
| `src/app/clima/painel/painel-cliente.tsx:235` | Consequência: `key={unidade.unidade}` — duas lojas homônimas colidem na reconciliação do React |
| `src/dominios/painel-executivo/repositorio.ts:335` | Rateio de custo devolve só os nomes; o UNIQUE do centro de custo é `(empresa_id, codigo)`, então "CC-1000" existe na Supply **e** na DCS |
| `src/app/painel-executivo/painel.tsx:581` | `key` composta por dois rótulos: duas linhas de rateio com a mesma chave, trocando valores monetários em re-render |
| `src/dominios/colaboradores/repositorio.ts:2297` | Aqui o rótulo **é** a chave de agregação — o oposto do que o painel executivo faz vinte arquivos ao lado e documenta em comentário |
| `src/dominios/indicadores/servico.ts:188` | O sentinela `'global'` divide namespace com os nomes de unidade: nomear uma lotação "global" faz a criação de meta daquela unidade devolver **500** |

**Os suspeitos.** Onze, e sete são o semeador resolvendo unidade e empresa por nome (`'Filial Leste'`,
`'Supply'`) com um `umaLinha()` que só reclama de zero linhas, nunca de duas —
`db/semear/09-recrutamento.js:157`, `:191`, `:232`, `db/semear/14-promocoes.js:229`, `:311`,
`db/semear/16-transferencia-empresa.js:335`, `:367`. É demo, mas é o mesmo pressuposto não escrito
(nome é único) que abriu o eixo. Os outros quatro: `db/semear/11-metas.js:238` (Map indexado por nome),
`db/migrations/0049:50` (o backfill casa por nome sem guarda de ambiguidade),
`src/app/metas/painel-metas.tsx:886` e `src/dominios/recrutamento/repositorio.ts:209`.

**O que decide a gravidade de tudo isso é uma consulta só** (Apêndice A, L-1): existe hoje mais de um
lugar ativo com o mesmo nome? Enquanto for não, as seis violações são latentes; no dia em que for sim,
viram número errado na tela da diretoria sem nenhum aviso.

**Pontos cegos.** `contarHeadcountPorCampoDaEstrutura` escolhe a expressão do `GROUP BY` por índice de
objeto, então o texto agrupado não aparece ao lado do `GROUP BY 1` — só foi achado lendo o arquivo.
JSONB é opaco: `rh.evento_colaborador.payload` e `audit.alteracao.diff` podem carregar nome de lugar em
payloads anteriores à 0047. E as projeções de texto (`rh.lotacao.centro_custo`) só não divergem porque
o trigger `BEFORE` está ligado — uma migration futura que o desligue para backfill e esqueça de religar
faz a projeção mentir, e nada na aplicação percebe.

---

## 3 · tempo civil — 12 violações

**A regra.** Toda data **civil** é resolvida no calendário de `America/Sao_Paulo`. Instante de evento
(`criado_em`, `ocorrido_em`) é legítimo em UTC e **não deve ser consertado**; aritmética de calendário
sobre string `AAAA-MM-DD` em `Date.UTC` também. O eixo persegue o terceiro caso: relógio lido no fuso
errado para produzir uma data.

**O estado hoje.** O núcleo está bom e documentado — os módulos maduros (ponto, folha, painel
executivo, portais, colaboradores) aplicam a distinção com rigor, e nenhuma das 166 ocorrências de
`AT TIME ZONE 'America/Sao_Paulo'` está errada. O furo é que **a correção da onda I parou na porta que
o defeito usou**: a guarda que a 0049 deixou (`pg_get_viewdef ~* 'current_date'`) olha só views, e
`rh.hoje()`, criada para ser a definição única, **não tem um único consumidor fora do arquivo que a
criou**. As definições de "hoje" subiram de 10 para 14.

**As violações.**

| Onde | O que acontece |
|---|---|
| `src/dominios/sst/repositorio.ts:235` | ASO que vence hoje conta como vencido a partir das 21h de Brasília; o farol da Central de Metas cai à noite e volta sozinho de manhã |
| `src/dominios/sst/repositorio.ts:405` | Idem na cobertura psicossocial da NR-1: o painel reporta não-conformidade que não existe |
| `src/dominios/pesquisas/repositorio.ts:421` | A pesquisa fecha três horas antes do prazo que a tela anuncia — e `pesquisas/servico.ts:109` calcula o mesmo "hoje" em São Paulo: as duas metades do módulo discordam |
| `src/app/ponto/painel-ponto.tsx:171` | `new Date().getUTCMonth()`: na virada de mês, o painel do DP abre na competência errada |
| `src/app/ponto/espelho/[colaboradorId]/espelho-ponto.tsx:158` | Cópia literal, no espelho — a tela que serve de prova em fiscalização |
| `src/app/ponto/parametros/painel-parametros.tsx:204` | Em 31/12 às 21h a tela de feriados abre no ano seguinte, vazia |
| `db/migrations/0022_pesquisas.sql:144` | `DEFAULT date_trunc('day', now())` numa coluna cujo propósito declarado é **anonimato**: o corte cai às 21h e cria dois baldes por dia civil |
| `db/semear/11-metas.js:453` | O log de conferência do semeador concorda com a tela porque os dois estão errados do mesmo jeito |
| `db/migrations/0047:314`, `:352`, `:494` | Instante → data de vigência por cast no fuso da sessão: empresa cadastrada às 22h nasce com vigência de amanhã, e as travas de vigência futura travam o rename por 24 h |
| `db/semear/01-base.js:776` | Ano da tabela salarial em UTC, enquanto o arquivo irmão faz a mesma coisa certo com o helper de `comum.js` |

**Os suspeitos.** Onze. Os dois que mais importam são estruturais: `db/migrations/0049:58` (a função
existe e ninguém a chama — a constante e a função convivem de propósito, ou os repositórios migram?) e
`db/migrations/0049:163` (a guarda foi escopada em views de propósito, ou pretendia ser a rede do eixo
inteiro? As três violações de produção já existiam quando ela rodou verde). Os demais:
`src/dominios/indicadores/repositorio.ts:66` (as 13 cópias de `HOJE_SP`),
`src/dominios/ferias/servico.ts:96` (10 helpers `Intl` sem `year/month/day` explícitos — dependem do
ICU do Node), `db/migrations/0003:103` (20 sementes de catálogo com vigência um dia à frente, hoje
inertes), `db/semear/04-clima.js:642` e `:658`, `db/semear/09-recrutamento.js:212`,
`db/migrations/0014:93`, `src/app/sst/painel-sst.tsx:669`, `src/dominios/desligamento/servico.ts:949`.

**Pontos cegos.** A janela do defeito é de **três horas por dia**. Nenhuma das doze violações é
permanente, o que significa que nenhum teste em horário comercial jamais as reproduziu — nem vai.
Verificação deste eixo tem de forçar o relógio ou o `TimeZone` da sessão. Além disso: colunas `DATE`
lidas sem `::text` são convertidas pelo driver `pg` em `Date` à meia-noite do fuso do processo, e não
há `setTypeParser` em lugar nenhum — foram conferidos os nomes de coluna já conhecidos, não o catálogo
inteiro.

---
## 4 · decisão de acesso — 2 violações

**A regra.** Toda decisão de autorização lê **chave de permissão**. Nome de papel não decide nada:
papel é o rótulo de uma linha em `sistema.papel_permissao`, editável pelo administrador em `/perfis`.
Ler papel para rótulo, auditoria, `CHECK` de domínio ou trava anti-lockout do próprio RBAC é legítimo.

**O estado hoje.** É o eixo mais saudável, e dá para medir: das **175 rotas** sob `src/app/api`, 174
têm guarda de servidor e a única sem é o login. A decisão passa por `sistema.tem_permissao` em 177
chamadas literais cobrindo **61 chaves distintas**; as 46 páginas server-side resolvem a chave por SQL
antes de renderizar. Os três lugares que a 0039 nomeia e a lista `PAPEIS_COM_2FA` que a 0040 matou não
existem mais no runtime.

**As duas violações.**

| Onde | O que acontece |
|---|---|
| `src/dominios/pesquisas/repositorio.ts:823` | Último `papel IN (...)` vivo: monta a lista de responsáveis de plano de ação por nome de papel quando a pergunta é a chave `pesquisa.plano.gerir`. Quebra nas duas direções assim que alguém recompuser um perfil, e papéis novos nascem invisíveis ao seletor |
| `src/dominios/beneficios/servico.ts:133` | Não é papel — é a tranca que vem **antes** da chave. Única das sete guardas de módulo que não checa `pendente_2fa`, deixando `/api/beneficios/dependentes` (dado de terceiro) dependendo só do proxy, contra o que `src/lib/sessao.ts:72` declara obrigatório |

**Os suspeitos.** Seis, e nenhum autoriza nada — todos envenenam verificação futura.
`db/semear/01-base.js:941` mantém uma cópia de `PAPEIS_COM_2FA` apontando para uma constante que a
0040 apagou; se algum roteiro de demo usar "a persona X entrou sem pedir código" como prova, a prova é
circular. `db/migrations/0040:141` criou `sistema.exige_2fa` e **nenhum código a chama** — a régua do
banco é mais estreita que a do app, então quem auditar por SQL conclui o contrário do que o app faz.
`src/app/colaboradores/page.tsx:7` representa 42 das 43 páginas que não checam `pendente_2fa`
(a exceção é `notificacoes/page.tsx:12`, e a assimetria não está explicada em lugar nenhum). Mais
`pesquisas/esquemas.ts:262`, `db/semear/03-demandas.js:928` e `db/semear/08-avaliacao.js:563`.

As três travas anti-lockout de `usuarios/servico.ts` (linhas 134, 207, 297) foram conferidas e são
legítimas: leem `'admin'` para **impedir**, nunca para conceder, e falham fechado.

**Pontos cegos.** Foi conferida **presença** de guarda, não **completude**: não está provado que a
chave exigida é a certa para o dado que a rota devolve — foi exatamente esse erro que a reauditoria de
31/07 achou em `sst.ver` e `folha.operar`. A composição papel × chave é editável em runtime, então
todo veredito do tipo "a chave gravada é a mesma que a rota conferiu" vale para a composição de hoje.
E nada foi executado: a violação de 2FA em benefícios é dedução de leitura, hoje barrada pelo proxy.

---

## 5 · dinheiro — 5 violações

**A regra.** Dinheiro é centavo inteiro; divisor, fator, percentual, teto e piso são administráveis.
O terceiro teste é o que produziu os achados novos: **a precisão combina ponta a ponta?** A escala do
formulário, a do zod, a da coluna e a que o motor honra são a mesma?

**O estado hoje.** O motor da folha é exemplar: centavo inteiro do começo ao fim, uma única fronteira
de conversão, arredondamento meio-para-cima aplicado uma vez por item, percentuais como razão inteira.
**Zero `parseFloat` no projeto** e **zero literal decimal em aritmética** dentro de `src/dominios`. Os
dois defeitos que criaram o eixo estão mortos: divisor horário proporcional à carga (0038) e divisor do
DSR vindo de `dias_uteis_semana` (0043).

**As violações não são float perdido — são descompasso de precisão.**

| Onde | O que acontece |
|---|---|
| `src/dominios/folha/calculo.ts:161` | `rubrica_versao.parametro` é `NUMERIC(10,4)`, o zod guarda 4 casas e a tela oferece `step 0.0001`, mas `aplicarPercentual` só honra **2**. Prêmio de 8,3333% é pago como 8,33% enquanto a memória do holerite imprime 8,3333. O caminho gêmeo da mesma coluna (linha 341) honra as 4 |
| `src/app/folha/parametros/painel-parametros.tsx:660` | A tela convida a digitar 4 casas no percentual (o campo duplicado em `:971` também). A tela mente sobre a precisão que o sistema tem |
| `src/dominios/folha/esquemas.ts:360` | A alíquota das faixas de INSS (e de IRRF em `:404`) entra **sem transform** e vai para JSONB sem `CHECK` de escala; todos os outros campos monetários do mesmo formulário têm |
| `db/semear/10-folha-sst.js:218` | Existe um **segundo motor de folha completo** copiado à mão, cujo cabeçalho admite precisar de espelho manual — e nada mecaniza o espelho |
| `src/dominios/ferias/servico.ts:91` | `MESES_LIMITE_CONCESSIVO = 11`: único limite chumbado que decide uma afirmação sobre dinheiro ("VENCIDA — dobro, art. 137"). O próprio comentário o denuncia, e a data já está materializada nas linhas antigas |

**Os suspeitos.** Dez. Dois incomodam mais que o resto: `demandas/esquemas.ts:202` e
`recrutamento/esquemas.ts:240` são os **únicos dois esquemas de dinheiro sem arredondamento de 2 casas
na borda** — e são justamente os dois que alimentam comparação contra faixa salarial. Os outros:
`demandas/servico.ts:1180`, `painel-executivo/servico.ts:399`, `folha/repositorio.ts:1287`,
`db/migrations/0013:150` (as faixas legais moram numa JSONB cujo único `CHECK` é "é um array"),
`beneficios/painel-beneficios.tsx:97`, `colaboradores/repositorio.ts:1386`, `avaliacao/calculo.ts:113`
(terceira regra de arredondamento do sistema) e `beneficios/servico.ts:803`.

Fora da folha, dinheiro anda em float de reais. Isso **não** foi classificado como violação porque
nenhum desses domínios soma ou multiplica: eles escolhem, congelam e repassam, e o único valor que vira
pagamento é convertido a centavo na fronteira da folha.

**Pontos cegos.** Não houve diff mecânico entre `folha/calculo.ts` e a cópia no semeador — os dois
foram lidos e batem na substância, mas não está afirmado que estão idênticos. O motor não foi
executado: os cenários de prejuízo são contas feitas à mão. E a maior área cega é a JSONB das tabelas
legais: o dinheiro que decide o desconto de todo mundo mora num campo sem tipo e sem escala.

---

## 6 · tempo trabalhado — 5 violações

**A regra.** Minuto inteiro em toda a superfície. Hora noturna **reduzida** (3150 s) e o acréscimo
fictício é jornada **cumprida**, não só verba. Tolerância, faixa de HE, divisor de DSR, janela noturna
e teto de banco são parâmetros versionados. E o quarto teste: **o parâmetro chega ao motor pela versão
certa?** Parâmetro que existe no banco e o motor não lê viola tanto quanto literal chumbado.

**O estado hoje.** O núcleo aritmético é o melhor código do repositório. `ponto/calculo.ts` é puro,
trafega minuto inteiro, tem exatamente dois pontos de fração e os dois arredondam meio-para-cima uma
vez; a hora noturna reduzida existe, é parâmetro, estende a jornada cumprida e tem **caso de teste
gêmeo** (3150 × 3600) na 0042. As migrations 0033/0034/0038/0043 tiraram, uma a uma, as constantes de
jornada do fonte e do trigger. Existem exatamente 6 ocorrências de `/ 60` em `src/dominios` e nenhuma é
aritmética de negócio.

**O risco migrou de lugar: agora é qual parâmetro chega ao motor, e quem entra na apuração.**

| Onde | O que acontece |
|---|---|
| `src/dominios/ponto/servico.ts:180` | Criar versão nova de jornada **não repontA nenhuma escala**: todo mundo segue apurando pela versão encerrada. Corrigir a hora noturna dos plantonistas pela tela não muda um minuto de ninguém |
| `src/dominios/ponto/servico.ts:1220` | A jornada é resolvida no **último** dia da competência, então trocar de escala no dia 15 descarta os dias 1 a 14: trabalhado, HE, noturno e banco somem, e o espelho mostra meio mês vazio sem uma intercorrência |
| `src/dominios/ponto/repositorio.ts:2151` | Quem é desligado no dia 20 não gera apuração nenhuma; o mês final não vira HE, adicional noturno nem saldo — e não há fila nomeando essa pessoa |
| `src/dominios/folha/repositorio.ts:686` | A importação exige `c.status = 'ativo'` **hoje**, o defeito que `VINCULO_NA_DATA` declara corrigido 400 linhas acima. Reimportar competência antiga depois de um desligamento apaga HE e noturno do holerite |
| `src/dominios/folha/calculo.ts:396` | Duas réguas para o mesmo direito, e vale a errada: o ponto apura 1 DSR por **semana** com falta (Lei 605/49 art. 6º) e a folha joga fora, descontando 1 por **dia**. Três faltas na mesma semana viram seis trigésimos em vez de quatro — R$ 220 a mais, contra o trabalhador, num salário de R$ 3.300 |

**Os suspeitos.** Oito. `folha/servico.ts:642` é o único lugar do sistema onde a disciplina "minuto
inteiro" cede, e cede por imposição de coluna (`NUMERIC(10,2)`) — está marcado como suspeito, não como
legítimo, de propósito. `ponto/servico.ts:1123` (a regra de banco também é resolvida em um dia só) e
`ponto/calculo.ts:698` (o teto diário do art. 58 §1º é consumido na ordem do array, então o resultado
depende da ordem de montagem) precisam de decisão. `db/migrations/0027:45` mantém cinco parâmetros que
decidem dinheiro com `DEFAULT` no schema — o poder que a 0043 tirou de outros três. Mais
`folha/servico.ts:783`, `db/migrations/0043:115`, `db/semear/15-ponto.js:151` e
`ponto/calculo.ts:1079`.

**Pontos cegos.** Férias e afastamentos ficaram de fora: o motor **não recebe nenhuma informação de
férias nem de afastamento** na `EntradaApuracao`, então o dia de férias entra como dia previsto sem
marcação — falta integral. Não foi confirmado se algum caminho anterior exclui esses dias, e isso tem
exatamente o formato do defeito fundador. A bateria da 0042 não foi executada. E a interação entre as
violações 1 e 2 pode ser pior do que descrita: corrigir parâmetro exige redefinir escala pessoa a
pessoa, e redefinir escala no meio do mês apaga a primeira metade.

---

## 7 · onde o filtro mora — 1 violação

**A regra.** Filtro de escopo e de autorização mora no servidor, dentro da consulta. O que a tela
esconde, o servidor também recusa.

**O estado hoje.** O defeito que originou o eixo está fechado de verdade: a folha recorta os três
campos dentro do `WHERE`, pela apropriação **da competência**, e o mesmo recorte desce para os itens —
passar `centro_custo_id=999999` hoje devolve lista vazia, não 58 linhas. As quatro telas mandam o
recorte na query string e refazem o fetch. O portal do colaborador não lê nada da requisição.

**A única violação** é justamente a única linha do projeto que filtra escopo depois da consulta dentro
de uma rota:

| Onde | O que acontece |
|---|---|
| `src/app/api/ponto/resumo/equipe/route.ts:51` | Pede a fila de intercorrências da **empresa inteira** — cortada em `LIMIT 500` por `data DESC` — e só então recorta a equipe em JavaScript. As intercorrências mais antigas do time, que são as que estão vencendo, somem do portal do gestor sem aviso; o `total`/`mais_antiga` que o repositório devolve para denunciar o corte é descartado. De quebra, carrega observação em texto livre de 500 pessoas e grava a trilha com recurso "empresa" |

O conserto já existe pronto duas funções acima: `ponto/servico.ts:2211` passa `colaboradoresPermitidos`
e deixa o `WHERE` recortar.

**Os suspeitos.** Seis, concentrados em dois lugares. O **organograma** (`servico.ts:446` e `:299`) é o
único ponto onde a fronteira "quem vê quem" é defendida só por poda em memória sobre o quadro inteiro —
não vaza hoje, mas é a forma que o eixo persegue. E as telas de **afastamentos** (`:139`) e **SST**
(`:709`) puxam o acervo sensível de documentos da empresa toda para preencher um seletor; são gêmeas e
precisam ser decididas juntas. Mais `folha/servico.ts:353` (variáveis, impedidos e avisos não recebem o
recorte que folhas e itens recebem) e `ponto/servico.ts:2376` (duas funções exportadas que recebem
`colaborador_id` e não recebem sessão — a guarda existe só pela ordem dos `await` na rota).

**Pontos cegos.** A varredura cobre `.filter`, `.some`, `.includes` e `.find`; **não** enxerga recorte
por `for`/`if`/`continue` nem por `reduce` — que é exatamente a forma do organograma. Nada foi
executado por HTTP. E cache não foi verificado: payload corretamente recortado e depois cacheado por
camada compartilhada seria vazamento que leitura de código não pega.

---

## 8 · rastro de leitura — 9 violações

**A regra.** Ler dado sensível de terceiro deixa marca em `audit.leitura_sensivel`, e a chave gravada
tem de ser a permissão que **de fato** autorizou aquela leitura — não a chave da porta da rota. A régua
do que é sensível não foi inventada: é a lista `CHAVES_SENSIVEIS` de `usuarios/esquemas.ts` mais as
promessas escritas nas migrations.

**O estado hoje.** Os três buracos do relatório da onda F/G estão fechados, e bem: extrato do banco de
horas (`ponto/servico.ts:2392`) e resumo de equipe (`:3043`) gravam trilha, e o ponto é hoje o único
módulo com **política de trilha escrita** e chave dinâmica honesta. Os três únicos `decifrar()` do
sistema gravam trilha com a chave que autorizou a decifração. Há 33 pontos de trilha no total.

**O que resta é um padrão, não acidentes soltos**, e ele tem duas formas.

*A trilha amarrada ao campo cifrado em vez do dado devolvido:*

| Onde | O que acontece |
|---|---|
| `src/dominios/sst/servico.ts:190` | `AsoCompleto` leva `resultado = inapto` para toda a lista, e a trilha só dispara se houver restrição cifrada. O dado mais grave do ASO é o que escapa |
| `src/dominios/sst/servico.ts:500` | Idem na NR-1: `classificacao_risco = alto` sem observação escrita é lido sem deixar linha |
| `src/dominios/recrutamento/servico.ts:434` | Condicionada ao **valor da oferta**, mas o payload libera e-mail e telefone do candidato — titular externo. Vaga com 40 candidatos e nenhuma oferta sai sem rastro |

*A releitura depois da escrita — o mesmo defeito que já foi corrigido no ponto, em outros dois módulos:*

| Onde | O que acontece |
|---|---|
| `src/dominios/folha/servico.ts:535` | Quatro operações gated por `folha.operar` (lançar, remover, importar descontos, importar do ponto) devolvem a lista inteira de variáveis com nome, matrícula e valor. Lançar 1 centavo e remover devolve a folha variável do mês, sem trilha |
| `src/dominios/demandas/servico.ts:1598` | `cartaoAposDecisao` passa `registrarLeitura = false` e é o retorno de três endpoints de escrita: o aprovador lê o salário proposto na resposta do POST, e a auditoria registra "decidiu a etapa", nunca "leu a remuneração" |

*E quatro leituras largas que nunca tiveram trilha:*

| Onde | O que acontece |
|---|---|
| `src/dominios/sst/servico.ts:971` | `listarCatsVisao` **nem recebe sessão** — é estruturalmente incapaz de registrar. Devolve tipo, data e descrição livre de até 4.000 caracteres de todos os acidentes da empresa |
| `src/dominios/colaboradores/servico.ts:294` | A ficha leva CPF, nascimento, e-mail e os vínculos em todas as empresas do grupo. Percorrer `/api/colaboradores/1..N` extrai o quadro inteiro sem uma linha |
| `src/dominios/colaboradores/servico.ts:445` | POST com um CPF qualquer devolve, no corpo do **409**, nome, e-mail e histórico de vínculos daquela pessoa. Nada é gravado, a transação abortada não entra em `audit.alteracao`, e não há trilha: a sonda é invisível |
| `src/dominios/documentos/servico.ts:225` | O download só deixa rastro quando a flag `sensivel` está ligada: basta quem enviou o holerite ter esquecido de marcar a caixa |

As quatro chaves envolvidas — `sst.ver`, `rh.colaborador.ver.todos`, `documento.ver.todos`, `rs.ver` —
estão em `CHAVES_SENSIVEIS`, e a régua da própria lista diz que a porta (a) é "na prática, a leitura
grava `audit.leitura_sensivel` com esta chave". **Cinco chaves marcadas como sensíveis nunca
produziram uma linha de trilha.**

**Sobre a chave mentirosa:** não foi achada nenhuma que minta hoje, mas foi achada uma que só não mente
por sorte de configuração — `src/app/api/colaboradores/[id]/posicao/route.ts:53` entra por
`rh.posicao.editar` e carimba `rh.posicao.ver`. O que separa isso de uma mentira é `dp` ter as duas
chaves, coisa que `/perfis` desfaz sem tocar em código.

**Pontos cegos.** `audit.leitura_sensivel` **nunca é lida pela aplicação** — não existe rota servindo a
chave `rh.auditar`. A trilha é gravada e jamais consultada pelo produto, então não dá para verificar de
ponta a ponta se o que está sendo gravado responde à pergunta que ela existe para responder. E os
payloads foram classificados pelas interfaces TypeScript: onde há spread de linha crua (`...linha` em
`listarCatsVisao`), o objeto real pode carregar mais do que a interface declara.

---
## 9 · nada chumbado — 22 violações

**A regra.** Limite, fator, divisor, prazo, dia e lista são administráveis pela tela. Há **dois modos
de falhar**, e o segundo é menos óbvio: (1) valor de negócio em constante no fonte; (2) valor em tabela
do banco, versionada e correta, **sem rota nem tela que a administre** — o código está certo e o dono
continua preso a SQL direto.

**O estado hoje.** Em recuperação visível. Motor de folha, banco de horas e jornada já tiraram divisor,
fator, limite e prazo do fonte para tabelas versionadas com tela (0034, 0036, 0038, 0043), e o *k* do
anonimato — o defeito que criou o eixo — foi corrigido em duas etapas, a segunda (0045) existindo
porque a primeira só alcançou metade dos lugares. Os melhores comentários do projeto estão nas
constantes que sobraram, explicando por que sobraram.

**O que não foi tocado são as listas.** Tipo, motivo, categoria e parentesco continuam como array
literal, quase sempre com uma segunda cópia no `CHECK` do banco e uma terceira no mapa de rótulos:

| Onde | O que custa acrescentar um item |
|---|---|
| `src/dominios/documentos/esquemas.ts:3` | O banco aceita **qualquer texto** (`categoria TEXT` sem `CHECK`) — quem prende é só o array. Arquivar "Advertência" exige publicar |
| `src/dominios/beneficios/esquemas.ts:6` | Array + `CHECK`: Gympass, seguro de vida e auxílio-creche viram "outro", e a regra de elegibilidade perde o único eixo de agrupamento |
| `src/dominios/desligamento/esquemas.ts:116` | Inventário de patrimônio: carro e cartão corporativo caem em "outro" e a tabela deixa de responder "quantos notebooks estão pendentes" |
| `src/dominios/afastamentos/esquemas.ts:3` | Faltam licença não remunerada, falecimento, casamento. E como o tipo é o rótulo mostrado a quem não tem `afastamento.saude.ver`, "outros" passa a misturar caso de saúde com caso que não é |
| `src/dominios/identidade/esquemas.ts:5` + `usuarios/esquemas.ts:4` e `:22` | A **composição** papel→chave é administrável e a **lista** de papéis está em quatro lugares. Criar um perfil "remuneração" só tem duas saídas: usar `dp` (que arrasta dado clínico) ou abrir migration. A terceira cópia é pior: texto que **descreve permissão** enquanto a permissão real é editável em outro lugar |
| `src/dominios/colaboradores/esquemas.ts:4` e `:339` e `:581` | Tipo de vínculo sem intermitente (o DP marca "clt" e a pessoa entra nas regras de um mensalista); motivo de posição sem dissídio (68 reajustes de convenção viram "reajuste" individual); faixa etária fixa, que ainda decide o que o piso *k* suprime |
| `src/dominios/beneficios/esquemas.ts:36` | Três parentescos contra o que a previdência reconhece; o dependente de IRRF perde o campo que diria se qualifica |
| `src/dominios/ponto/calculo.ts:84` | Quatro escalas fechadas enquanto **todo o resto** da jornada foi parametrizado: 6x2 e 4x3 caem em "escala_livre" |
| `src/dominios/painel-executivo/esquemas.ts:254` | Segunda cópia dos rótulos de vínculo, com o tipo **afrouxado** para `Record<string,string>`: acrescentar um vínculo e esquecer este mapa passa no `tsc` e a tela da diretoria exibe o slug cru |

**E cinco tabelas foram desenhadas para serem administráveis e não receberam tela.** Este é o achado
mais caro do eixo, porque o trabalho difícil já está feito:

| Tabela | O que a migration promete | O que existe |
|---|---|---|
| `rh.tipo_demanda_versao` (`0003:18`) | SLA versionado, congelado na abertura da demanda | Nenhuma rota. Subir o SLA de 5 para 8 dias é SQL direto, sem `audit.alteracao` |
| `rh.etapa_selecao_versao` (`0012:72`) | "Template do pipeline administrável pelo RH (nunca enum rígido)" | Enum rígido de quatro valores na linha seguinte, sem rota |
| `rh.tipo_desligamento_versao` (`0008:21`) | "Parametrizável versionado (nunca enum rígido)" | Idem. E `elegivel_entrevista` é o **denominador** de um indicador com meta |
| `rh_clima.pergunta_versao` (`0004:14`) | Versão imutável, trigger de proteção, ordem única | Nenhuma rota. Trocar a pergunta do check-in é INSERT manual |
| `rh.checklist_admissao_versao` (`0010`) | Checklist versionado | Índice permite **uma** versão ativa no sistema inteiro — "PJ diferente de CLT" é impossível sem mudar o índice |

Mais dois números de política que valem correção imediata pelo mesmo motivo que o *k* valeu:
`recrutamento/esquemas.ts:66` (retenção LGPD do banco de talentos, que já materializa data na linha e é
**impressa na tela** a partir da constante) e `folha/repositorio.ts:1882` (o "dia 5" escondido dentro
de aritmética de `INTERVAL` no SQL — além de chumbado, é dia **corrido** onde o art. 459 §1º fala em
quinto dia **útil**).

**Os suspeitos.** Dezoito, quase todos com a mesma pergunta: o número dispara alerta que cobra alguém,
ou só pinta a tela? `colaboradores/esquemas.ts:296` (cadência de feedback), `portais/servico.ts:56`
(janela em que um marco vencido some do portal), `clima/servico.ts:56` (limiar de 0,3 que destaca
unidade em queda) e o **90 de férias repetido em três arquivos** (`portais/esquemas.ts:40`,
`portais/colaborador-esquemas.ts:271`, `ferias/esquemas.ts:139`) — a mesma forma do defeito do *k*.

**Pontos cegos.** As consultas só acham constante de módulo em maiúsculas e `useState` com literal:
número escrito **inline** no meio de uma função passa direto, e há sinal disso em
`painel-executivo/servico.ts`, que fatia a série em `slice(0,6)`/`slice(6)` para comparar semestres sem
constante nenhuma. Os 18 arquivos de `db/semear` não foram varridos — e eles são hoje a única origem de
várias linhas de domínio que não têm tela. A fronteira entre "lei" e "escolha da empresa" foi julgada
por leitura, não pelo jurídico do dono; se o critério estiver errado, está errado nos 22 vereditos.

---

## 10 · vigência — 18 violações

**A regra.** Todo registro com par de datas só vale **dentro** da janela. Leitura por
`fim_vigencia IS NULL` só é legítima quando quem escreve garante que a linha foi fechada no fim do
contrato; leitura por `status = 'ativa'` só é legítima quando o serviço proíbe vigência futura.

**O estado hoje.** Existe vocabulário comum (`vigenteEm`, `rh.estrutura_em`, `rh.hoje()`,
`src/lib/vigencia.ts`, a convenção de fechar sempre na **véspera**), a folha e o ponto resolvem tudo na
data de referência, e as migrations 0047–0051 são um registro exemplar de decisões sobre janela.
O que sobra tem três formas.

*Primeira — a guarda contra vigência futura existe e é chamada em 3 de 7 lugares:*

| Onde | O que acontece |
|---|---|
| `src/dominios/colaboradores/servico.ts:1776` | `criarVersaoCargo` barra vigência para trás e deixa passar para o futuro; `criarVersaoEstabelecimento`, **doze linhas abaixo**, chama a guarda. Publicar o RCF de 2027 em agosto muda ficha, organograma e requisição de vaga no mesmo segundo |
| `src/dominios/colaboradores/servico.ts:1845` | Idêntica, e mexe em dinheiro: a tabela salarial é o gate da promoção, então toda promoção de 2026 passa a ser medida contra a faixa do ano que vem |
| `src/dominios/beneficios/servico.ts:453` | Cadastrar em agosto a regra de 2027 faz o estagiário receber 403 hoje e a transferência deixar de recriar o plano de saúde — por uma regra que ainda não começou |
| `src/dominios/indicadores/servico.ts:249` + `repositorio.ts:122` + `db/migrations/0005:29` | Pior caso: `inicio_vigencia` é gravado **sem validação nenhuma**, a leitura é 100% por status, e a tabela **não tem `fim_vigencia`** — única tabela versionada do sistema com meia janela. Pactuar a meta de 2027 em agosto faz a Central comparar a apuração de agosto de 2026 com ela |

*Segunda — quem fecha a janela quando o contrato acaba:*

| Onde | O que acontece |
|---|---|
| `src/dominios/desligamento/servico.ts:612` | O ato que encerra o contrato fecha quatro coisas e deixa **quatro janelas escancaradas**: posição, lotação, adesão e escala ficam com `fim NULL` para sempre. A transferência entre CNPJs fecha três delas; o desligamento comum, que é o caminho mais usado, fecha menos. Foi essa mesma omissão, aplicada à liderança, que obrigou a migration 0050 a reparar 9 linhas |
| `src/dominios/demandas/servico.ts:2391` | A transferência enumera em oito itens o que fecha e o que atravessa, e `rh.escala_colaborador` **não aparece**: o vínculo velho fica com escala aberta e o novo nasce **sem escala**, então a pessoa some da apuração do mês seguinte sem aviso |
| `src/dominios/ponto/repositorio.ts:114` e `:371` | Consequência direta: o contador de "colaboradores na escala" soma desligados, e a lista de escalas vigentes mostra a matrícula encerrada ao lado da nova |
| `src/dominios/colaboradores/servico.ts:1359` | `definirGestor` valida que o gestor **existe** e não que está vivo. A 0050 fechou a porta da saída; por esta o DP reabre o buraco em um clique |
| `src/dominios/afastamentos/repositorio.ts:132` | Insert incondicional sem **nenhuma** trava de sobreposição — nem banco, nem serviço, nem zod. Dois afastamentos concorrentes fazem o aviso da folha (`LIMIT 1`) subestimar o período enquanto o gate de estabilidade (`EXISTS`) conta os dois |

*Terceira — bordas:* `folha/repositorio.ts:754` e `folha/servico.ts:592` (o import de descontos de
benefício é o **único insumo do motor** ainda lido em "hoje" quando a competência tem data — e o
call-site prova que a data existe e não é passada); `avaliacao/repositorio.ts:251` (a troca de versão
do modelo cobre o dia da virada com **duas** versões, contra a convenção do projeto inteiro); e as três
ocorrências de `CURRENT_DATE` já listadas no eixo 3.

**Os suspeitos.** Seis, e o que mais pesa é `folha/repositorio.ts:423` — não é código, é a **confissão
escrita** do buraco central: o banco só garante "uma vigente" para a linha em aberto, e nada impede
duas vigências históricas se sobreporem. `rg "EXCLUDE USING|btree_gist|daterange"` sobre as 52
migrations devolve **zero**. A mitigação escolhida (LIMIT 1) protege a folha e não avisa ninguém.

**Pontos cegos.** Treze das 41 tabelas com par de datas foram apenas registradas, sem auditar as
leituras — férias (`periodo_aquisitivo`, `programacao_ferias`) é a que mais interage com desligamento e
deveria ser a próxima. A view `rh.lotacao_detalhada` **não tem `LIMIT 1`**: com duas linhas cobrindo o
mesmo dia ela devolve as duas, e os `LATERAL` que a consultam escolhem uma por critério que não é de
negócio. E as 77 ocorrências de `status = 'ativa'` não foram auditadas uma a uma.

---

## As ondas que faltam × os eixos que elas tocam

Escopo lido de `docs/10-plano-pos-reuniao-diretoria.md` §3, com os detalhes de `docs/11` e as decisões
de `00_contexto/decisoes_arquiteturais.md`. A onda I está em construção agora e por isso ficou de fora.

**`R` = redefine o eixo · `M` = mexe · `t` = toca de leve · `—` = não toca**

| Eixo | H benefícios | J folha/OLAC | K visibilidade | L R&S/admissão | M pesquisa | N uso real |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| pessoa × vínculo | M | M | M | M | **R** | **R** |
| identidade de lugar | t | M | t | t | M | **R** |
| tempo civil | M | M | t | M | M | M |
| decisão de acesso | M | M | **R** | M | t | **R** |
| dinheiro | M | **R** | t | t | — | t |
| tempo trabalhado | — | t | — | — | — | t |
| onde o filtro mora | t | **R** | **R** | t | M | t |
| rastro de leitura | M | M | M | M | t | M |
| nada chumbado | M | M | M | **R** | M | **R** |
| vigência | **R** | t | t | M | M | M |

O que cada onda pede, em uma linha:

- **H — benefícios invertidos.** Acaba elegibilidade e candidatura, valor individual por pessoa,
  revisão com histórico, dependente cadastrado pelo titular, migração de 322 adesões.
- **J — conferência de folha e OLAC.** Três visões (por provento, por pessoa, por centro de custo) com
  quebras, e espelhamento com a contabilidade externa — arquivo primeiro, API depois.
- **K — visibilidade em camadas.** Telefone e e-mail corporativo, ficha pública mínima **também na
  lista**, salário pela sub-árvore recursiva do organograma, diversidade no padrão IBGE.
- **L — pesquisa social e checklist.** Etapa nova antes da Oferta, checklist personalizável por tipo de
  vínculo, anexos da admissão indo para a ficha.
- **M — pesquisa com público-alvo.** Selecionar quem é elegível a responder; adesão medida sobre o
  alvo, não sobre a empresa.
- **N — preparação para o uso real.** Importadores de carga inicial, ciência do Código de Conduta
  bloqueando o primeiro acesso, check-in como pop-up no portal de vendas.

**Escopo que não existe em documento nenhum e não foi inventado aqui:** (a) o plano não diz se a
competência de folha ganha dimensão de empresa quando parte do grupo é processada na OLAC —
`rh_folha.competencia_folha` tem `UNIQUE (ano, mes, tipo)`, uma competência para o grupo inteiro, e
três das quatro empresas processam fora; (b) o layout dos importadores da N e a lista completa de
rubricas estão pendentes com terceiro; (c) N3 depende da Fase B da plataforma.

---

## Os eixos carregados

Esta é a seção que muda a ordem de execução. Um eixo está **carregado** quando duas ou mais ondas o
tocam **e** ele já tem dívida aberta nos mesmos arquivos. Fazer as ondas separadas significa montar o
mesmo cenário duas vezes, verificar duas vezes, e dar a cada onda a chance de redescobrir sozinha a
armadilha que a anterior já tinha visto.

### 1. pessoa × vínculo — as seis ondas, mais 14 violações abertas

É o único eixo que **nenhuma onda escapa**, e é onde a dívida atual encosta diretamente no escopo novo.
M redefine exatamente o par que já está quebrado: a 0052 subiu o **numerador** da adesão para pessoa e
`pesquisas/repositorio.ts:477` mantém o **denominador** contando contrato — e M troca o denominador
inteiro. H mexe em `rh.adesao`, cujo `colaborador_id` é o vínculo, enquanto o requisito diz "a pessoa
já entra com direito". N cria pessoa e vínculo em massa e é onde a separação da 0046 é posta à prova:
duas linhas de planilha com o mesmo CPF são **uma pessoa com dois contratos**, não erro de duplicidade.

Feito uma vez: um cenário semeado — *duas pessoas, três vínculos, uma transferência entre CNPJs no meio
do mês e no meio de uma pesquisa aberta* — responde de uma vez pela adesão de benefício, pela
conferência por pessoa da folha, pela ficha pública, pelo anexo da admissão, pelo denominador da
pesquisa e pelo casamento por CPF do importador. Os três auxiliares já existem num lugar só
(`src/lib/sql-vinculo.ts`); falta o cenário e a bateria.

### 2. nada chumbado — L e N redefinem, e as duas precisam do mesmo molde

Quatro cadastros administráveis com a **mesma forma** nascem em ondas diferentes: etapas de seleção e
checklist por tipo de vínculo (L), layout de importador e lista de documentos com ciência obrigatória
(N), de-para rubrica→conta contábil (J), catálogo de cor/raça (K), dimensões do público-alvo (M).
O padrão já foi escrito oito vezes no schema (catálogo + versão com vigência + índice "uma ativa" +
inativar em vez de apagar) e a onda I acabou de instanciá-lo para centro de custo, com tela pronta.

E aqui a dívida **é** o escopo: a Pesquisa social da L precisa de uma etapa nova numa tabela que já
promete no comentário ser administrável e é um `CHECK IN` de quatro valores sem rota. Se ela entrar
como mais uma migration com `ALTER` do `CHECK`, a próxima onda que precisar de etapa faz a mesma
migration de novo. O arnês já mediu o custo do contrário: **sete varreduras** atrás de número de
negócio chumbado.

### 3. decisão de acesso — K e N redefinem no mesmo lugar

São as duas únicas ondas que redefinem o eixo, e redefinem exatamente onde ele mora: **o que a sessão
carrega e o que é barrado antes de a rota rodar.** K acrescenta um alcance novo (ficha pública para
qualquer autenticado, um quarto degrau além de `próprio | equipe | todos`) e compõe autorização com a
sub-árvore do organograma. N acrescenta uma trava de entrada — ciência do Código de Conduta — que
precisa viver ao lado de `pendente_2fa`, e não como redirect de tela: um `curl` na API passa por baixo
de redirect, que é o mesmo buraco reproduzido com HTTP 200 na onda F/G.

Feitas juntas, **um único ataque por persona cobre as duas** — e essa é a ferramenta que o arnês elegeu
como de maior retorno (`db/comparar-personas.js`). Separadas, são duas rodadas de sete personas contra
as mesmas rotas, com a segunda tendo que reprovar tudo que a primeira aprovou. H também entra nessa
conta: a violação `beneficios/servico.ts:133` está no módulo que H reescreve inteiro, e o custo de
consertá-la junto é uma linha.

⚠️ **Risco isolado mais alto de todas as ondas:** K3 exige travessia recursiva da liderança, e o
organograma decidiu deliberadamente o contrário, com o motivo escrito em `organograma/repositorio.ts:7`
— `WITH RECURSIVE` entra em laço infinito com ciclo na hierarquia, e a defesa fica em JS onde o
conjunto de visitados é explícito. Hoje há **zero** ocorrências de `WITH RECURSIVE` em `src`. Escrever
a regra do salário como recursão de banco sem guarda de ciclo dá dois estragos: consulta que não volta,
ou — pior e silencioso — um ciclo A→B→A fazendo um gerente aparecer dentro da própria sub-árvore e ver
o salário de quem está acima dele.

### 4. rastro de leitura — cinco ondas criam caminho novo, num domínio com um ponto de trilha só

H (dependente pelo titular), J (**exportar a folha inteira em arquivo para a contabilidade** — a maior
leitura de dado sensível que o sistema vai ter), K (cor/raça e salário por sub-árvore), L (pesquisa
social de candidato), N (ciência com hash). Todas precisam responder à mesma pergunta, e o domínio de
folha tem exatamente **um** ponto de trilha hoje (`folha/servico.ts:367`), com `folha.ver`,
`folha.operar` e `folha.aprovar` todas na lista de chaves sensíveis.

O método já existe escrito, da reauditoria de 31/07 em `usuarios/esquemas.ts`, incluindo a exigência de
**medir quantas contas passam a exigir 2FA antes de incluir chave** — porque desde a 0040 estar na
lista força segundo fator. Rodar esse método uma vez sobre as cinco chaves novas, com uma única
medição, em vez de cinco reauditorias parciais com critérios diferentes.

### 5. tempo civil — as três últimas ocorrências caem dentro de duas ondas

`pesquisas/repositorio.ts:421` é o `SELECT` que **M vai reescrever** para incluir elegibilidade.
`sst/repositorio.ts:235` e `:405` são a validade do ASO que **L precisa** para o item obrigatório do
checklist admissional. A resposta certa já existe e está pronta (`rh.hoje()`, `hojeSaoPaulo()`).
Trocar as três numa passada e ligar a regra de lint no mesmo movimento **fecha o eixo**: depois disso
ele vira portão e nenhuma onda seguinte precisa varrer de novo.

### 6. vigência — H redefine, e a dívida está no arquivo vizinho

H3 pede que o valor anterior "vire versão encerrada", ou seja N linhas por par pessoa×benefício ao
longo do tempo. `rh.adesao` aceita isso, mas quem consome **não lê por data**:
`folha/repositorio.ts:754` filtra só `a.fim IS NULL`. Uma revisão gravada no dia 20 entra inteira na
competência já aberta, retroativa, sem ninguém pedir — e o call-site (`folha/servico.ts:592`) prova que
a data existe e não é passada. É a mesma violação, no mesmo par de arquivos que H vai mexer.

E H1 apaga o critério de elegibilidade que a **0051 escreveu na semana passada** para decidir o que
atravessa a transferência entre CNPJs. Fazer H sem reabrir a 0051 deixa duas regras contraditórias no
mesmo domínio.

### 7. identidade de lugar — N cria o que as outras quatro consomem

N1 cria os catálogos de lugar pela carga inicial, e J, M, K e L consomem. Se N vier depois, as quatro
consumidoras testam contra o catálogo semeado à mão e a carga real descobre no fim que casou por nome.
As chaves naturais certas já existem e têm índice único: `empresa_grupo_cnpj_key` e
`centro_custo_empresa_id_codigo_key`.

### O eixo órfão

**`tempo trabalhado` não é redefinido por nenhuma onda** — J só lê rubrica de HE, N só carrega jornada.
E ele tem cinco violações caras: nova versão de jornada que não repontA escala, troca de escala que
apaga meia competência, desligado sem apuração, reimport que apaga o passado, e o DSR contado por dia
em vez de por semana (R$ 220 por mês contra o trabalhador, num caso comum). Nenhuma onda vai passar por
ali. **Se não ganhar slot próprio, essas cinco continuam em pé depois de H, J, K, L, M e N.** O mesmo
vale para a segunda família de `vigência` (as quatro janelas que o desligamento não fecha): é a única
dívida deste mapa cujo formato já causou uma migration de reparo (0050) e que segue aberta em quatro
tabelas.

---

## A ordem que isso sugere

Quatro blocos, agrupados por eixo compartilhado em vez de pela numeração do plano. Cada bloco fecha um
eixo pesado com **uma** verificação.

| Bloco | Ondas | Eixo que fecha | Por quê nesta ordem |
|---|---|---|---|
| **1** | H + M | pessoa × vínculo, vigência | Arquivos disjuntos (`beneficios/**` × `pesquisas/**`), uma bateria só. H primeiro porque o custo da migração cresce com as adesões — já são 322 — e porque a 0051 é de agora |
| **2** | K + N2 (ciência) | decisão de acesso | As duas únicas que redefinem o eixo, e no mesmo lugar. Um ataque por persona cobre as duas. K carrega o risco do `WITH RECURSIVE`, melhor gastá-lo com a lente ligada |
| **3** | L + N1 (importadores) | nada chumbado, tempo civil | Molde de cadastro feito uma vez, instanciado quatro. L2 define o checklist que N1 carrega; K1/K4 definem os campos que o layout precisa conter |
| **4** | J | dinheiro, onde o filtro mora | Por último: tem decisão de negócio **em aberto** (OLAC), depende de H (a visão por provento exibe o desconto que H redefine) e é a que mais consome servidor para prova |

Depois de tudo: **N3** (check-in no portal de vendas), que depende de terceiro e não bloqueia nada.

**Divergência declarada.** `docs/10` coloca J antes de K, L e M; aqui ela vai por último. Não é
preferência de ordem — é evitar refazer a conferência depois que o desconto de benefício mudar de
forma, e evitar construir a metade OLAC antes de decidir se ela vira competência separada, marcação por
empresa ou base espelhada. Se a pressão da diretoria pedir J antes ("muito importante mesmo" é o
registro da reunião sobre as três visões), o caminho barato é fazer **só J1 e J2** — as três visões e
as quebras, que são agregação no servidor sobre dado que já existe — e deixar J4 para depois da
decisão. As duas metades não dependem uma da outra.

**Antes do bloco 1, três coisas baratas que não são onda:**

1. Rodar as consultas do Apêndice A. Cinco eixos mudam de tamanho conforme o resultado, e a mais
   importante é uma linha: existe hoje pessoa com dois vínculos não desligados?
2. Trocar as três ocorrências de `CURRENT_DATE` e ligar a regra de lint. Fecha um eixo inteiro.
3. Dar slot ao eixo órfão (tempo trabalhado) e às quatro janelas que o desligamento não fecha, ou
   registrar por escrito que ficam abertas — porque nenhuma onda vai passar por elas.

---

## Apêndice A · consultas de diagnóstico contra o banco

Estas **não** entraram em `db/mapa-eixos.json`: dependem de dado que muda a cada `db:demo` ou a cada
edição em `/perfis`, e no runner gerariam diferença falsa toda vez. O JSON ficou só com greps e com SQL
de **catálogo** (`information_schema`, `pg_catalog`), que é estável enquanto as migrations forem.

A remoção está registrada nos `pontos_cegos` de cada eixo. São elas, por ordem de retorno:

| # | Eixo | O que responde |
|---|---|---|
| **PV-1** | pessoa × vínculo | Existe pessoa com mais de um vínculo não desligado? *Reclassifica 12 suspeitos de uma vez.* `SELECT pessoa_id, count(*), array_agg(id) FROM rh.colaborador WHERE status <> 'desligado' GROUP BY 1 HAVING count(*) > 1;` |
| PV-2 | pessoa × vínculo | Sobreposição de janela entre vínculos da mesma pessoa (inclusive o dia da transferência) |
| PV-3 | pessoa × vínculo | Adesão de clima com as duas contas lado a lado: respondentes por vínculo × por pessoa |
| PV-4 | pessoa × vínculo | Piso *k* por unidade nas duas contas — toda linha com `por_vinculo >= k` e `por_pessoa < k` é unidade publicada com menos gente do que a política exige |
| **L-1** | identidade de lugar | Dois lugares **ativos** com o mesmo nome hoje. *Decide se as 6 violações são latentes ou visíveis.* |
| L-2 | identidade de lugar | Alguma unidade se chama exatamente `'global'`? Se sim, definir meta para ela devolve 500 |
| L-3 | identidade de lugar | Metas cujo rótulo congelado já divergiu do nome de hoje — a prova de que a 0049 funciona |
| TC-1 | tempo civil | Fuso da sessão e divergência entre `CURRENT_DATE` e `rh.hoje()` agora |
| TC-2 | tempo civil | Versão de catálogo com vigência começando **depois** de hoje — dado nascido com um dia a mais |
| **AC-1** | decisão de acesso | **O detector da chave mentirosa:** linhas de `audit.leitura_sensivel` em que o usuário não possuía, no papel dele, a chave que a linha diz ter autorizado a leitura |
| AC-2 | decisão de acesso | Matriz papel × chave gravada, e quem o banco diz que exige 2FA por conta |
| AC-3 | decisão de acesso | Papéis órfãos (existem em `papel_permissao` e fora do `CHECK`) e chaves sem papel |
| **D-1** | dinheiro | Rubrica `percentual_salario` cadastrada com mais de 2 casas — cada linha é dinheiro pago a menor |
| D-2 | dinheiro | Faixa de INSS/IRRF com alíquota ou limite de mais de 2 casas dentro da JSONB |
| **TT-1** | tempo trabalhado | Quantas pessoas apuram por uma versão de jornada **encerrada** |
| TT-2 | tempo trabalhado | Apurações cuja escala começou depois do dia 1º — com a contagem das marcações que ficaram de fora |
| TT-3 | tempo trabalhado | Quem bateu ponto, foi desligado no meio do mês e não tem apuração nenhuma |
| TT-4 | tempo trabalhado | Apurações com HE/noturno que a folha não importa por causa do `status` de hoje |
| TT-5 | tempo trabalhado | Divergência entre o DSR que o ponto apurou e o que a folha vai descontar, em dias |
| **V-1** | vigência | Sobreposição de vigências no histórico das quatro tabelas centrais — o buraco que `folha/repositorio.ts:423` confessa |
| V-2 | vigência | Janela **aberta** em vínculo já morto, por tabela. Espera-se zero em `relacao_gestor` (a 0050 reparou) e > 0 nas outras quatro |
| V-3 | vigência | Versão de catálogo com início no futuro e status `'ativa'` |
| V-4 | vigência | Buraco ou emenda entre versões consecutivas (a convenção é fechar na véspera: diferença de 0 dias = dia com dois donos; > 1 = dia sem dono) |
| RL-1 | rastro de leitura | Chaves declaradas sensíveis que **nunca** produziram uma linha de trilha |
| RL-2 | rastro de leitura | Chaves que aparecem de fato na trilha, com volume, cruzadas com o catálogo |
| F-1 | onde o filtro mora | Mede o estrago do `LIMIT 500`: quantas intercorrências abertas ficam fora da página |
| NC-1 | nada chumbado | Quantas linhas cada tabela de domínio tem hoje × quantos valores o `CHECK` admite |

O texto completo de cada uma está nos JSON de origem das varreduras; as que sobreviveram ao critério de
determinismo (catálogo) estão em `db/mapa-eixos.json`, no campo `consultas` de cada eixo.

---

## Apêndice B · o que este mapa não é

- **Não é medição.** Nenhum agente teve acesso ao banco, nenhum rodou a aplicação, nenhum executou o
  motor de folha ou a bateria do ponto. Toda afirmação de comportamento é leitura de código — e leitura
  de código erra sobre ordem de trigger, plano de execução e ordem de linha sem `ORDER BY`.
- **Não é exaustivo.** As consultas de cada eixo são a rede que foi lançada; o que não passa por elas
  não está aqui. Os três furos comuns a todos os eixos: SQL montado por concatenação, agregação feita em
  JavaScript dentro de componente, e número de negócio escrito inline no meio de uma função.
- **É reexecutável.** As 110 consultas de grep de `db/mapa-eixos.json` foram rodadas em 01/08/2026 a
  partir de `fast-pessoas/` e todas devolvem resultado. Três precisaram de conserto para funcionar neste
  ambiente: padrão começando com `/` é reescrito como caminho pelo shell no Windows (use `[/]`), e `\$`
  dentro de aspas duplas vira âncora de fim de linha (use `[$]`).
- **Envelhece.** A composição papel × chave é editada em runtime; os números de linha andam a cada
  commit. O JSON existe para que o runner diga **o que mudou**, não para ser lido como verdade
  permanente.
