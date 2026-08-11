# Pendências — o que está travado esperando alguém

> Um lugar só. Se está aqui, alguém de fora do código precisa responder.
> Regra do arnês (ponto 4): **nada sobe como pergunta crua.** Toda pendência traz a decisão
> recomendada, o porquê, e os prós e contras dela — quem decide decide, não pesquisa.
>
> Aberto em 01/08/2026. Antes disto, estas cinco linhas estavam em três lugares diferentes, uma delas
> escondida no cabeçalho de um arquivo `.sql`.

| # | Assunto | Dono | Aberta em | Trava o quê |
|---|---|---|---|---|
| 1 | Transferência entre CNPJs: rescisão ou continuidade? | Guilherme | 31/07/2026 | férias, aviso prévio |
| 2 | Saldo de banco de horas na transferência | Guilherme | 31/07/2026 | fechamento contábil entre CNPJs |
| 3 | Limite concessivo de férias: 11 ou 12 meses | Guilherme | 30/07/2026 | alerta de "dobro" na tela do titular |
| 4 | Folha: 5º dia corrido ou útil | Guilherme | 30/07/2026 | indicador de prazo de fechamento |
| 5 | Lista de rubricas e layout dos importadores | Diego | 29/07/2026 | folha completa, importação |
| 6 | Balde anônimo já gravado com corte errado | Guilherme | 01/08/2026 | nada hoje; conta na implantação |
| 7 | Benefício na transferência entre CNPJs: o critério ainda barra | Guilherme | 06/08/2026 | quem perde benefício ao mudar de CNPJ |
| 9 | Folha: quem conta como dependente para o IRRF | Guilherme | 10/08/2026 | base do IRRF retido |
| 10 | Contato do candidato: leitura entra na trilha? | Guilherme | 10/08/2026 | rastro LGPD de dado de terceiro |
| 11 | Replay de TOTP: código válido reutilizável na janela | Guilherme | 10/08/2026 | endurecimento do 2FA |
| 12 | Vínculo "temporário" não tem família de modelo de admissão | Guilherme | 10/08/2026 | checklist próprio de temporário |

---

## 1 · A transferência entre CNPJs é rescisão real ou continuidade do mesmo contrato?

**Onde está:** `db/migrations/0048_transferencia_entre_empresas.sql:124-127`

**Minha decisão: manter como está — rescisão real.** É o que de fato acontece hoje na Fast: você
demite, dá baixa na CTPS, paga o acerto, e recontrata na outra empresa. O sistema deve descrever o que
acontece, não uma versão idealizada.

**A favor:** não inventa passivo. Se o período aquisitivo atravessasse, o sistema passaria a afirmar
que a empresa B deve férias de um tempo que a empresa A **já pagou no acerto** — e o painel chegaria a
acusar *"VENCIDA — dobro (art. 137)"* por um direito quitado.

**Contra, e é real:** se um dia a Justiça reconhecer unicidade contratual (art. 2º §2º da CLT +
Súmula 129 do TST — grupo econômico), os registros contam a história errada. E o **tempo de casa fica
subestimado**, o que mexe no aviso prévio (30 dias + 3 por ano trabalhado).

**Se a resposta mudar, muda concretamente duas coisas:** o período aquisitivo de férias, e a base do
tempo de casa. As duas são corrigíveis com ajuste auditado — `rh.periodo_aquisitivo` já suporta.

**Esta pergunta não é minha para responder:** depende de como o contador e o jurídico do grupo tratam
essas movimentações. Vale levar a eles com esta página aberta.

**DECISÃO DO DONO (11/08/2026): escolhida NA HORA da transferência, caso a caso.** Entre **matriz e
filial** (mesmo empregador) pode ser **continuidade** — o vínculo segue, sem baixa; entre **CNPJs
distintos** é **rescisão** — baixa na CTPS e acerto. Não é uma regra global chumbada: a operação
pergunta qual dos dois na hora. **Invariante inegociável: a ficha/histórico do funcionário nunca se
perde**, em nenhum dos dois caminhos (hoje já é assim — a pessoa mantém os dois vínculos e a ficha
mostra a linha do tempo contínua; onda I). O que a continuidade acrescenta é o vínculo *seguir* em vez
de encerrar-e-reabrir, carregando período aquisitivo, tempo de casa e benefício (ver #7).

**FRONTEIRAS DECIDIDAS (11/08/2026):** régua objetiva — mesma **raiz de CNPJ** (8 primeiros dígitos)
= mesmo empregador (matriz↔filial) = continuidade possível; raiz diferente ou CNPJ ausente = só
rescisão. Na continuidade: mantém a **mesma matrícula**, mexe **só no registro/lotação** (empresa/
estabelecimento/centro; cargo, salário, gestor, férias, banco, benefício e dependentes seguem
intactos), e quando a raiz é igual o sistema **oferece os dois, continuidade como padrão**.

**EM CONSTRUÇÃO (branch revisao-geral).** Slice 1 FEITO (migration 0065): coluna `modo_transferencia`
em `rh.demanda_movimentacao`, CHECK relaxado por modo (matrícula/gestor/tipo só na rescisão), e função
`rh.mesma_raiz_cnpj`. Provado no dev: os 4 CNPJs da demo são filiais da raiz 41235678 (`mesma_raiz(16,17)=
true`); o backfill marcou o pedido antigo como 'rescisao'. Faltam: serviço (efeito continuidade +
validação da criação), tela (o toggle), ficha (evento no mesmo vínculo). Nota de demo: os 4 CNPJs hoje
são a MESMA raiz — para exibir um caso de rescisão-por-raiz-distinta na 3001, semear uma empresa de raiz
diferente.

**Onde está:** `db/migrations/0048_transferencia_entre_empresas.sql:142-145`

**Minha decisão: manter a liquidação pela regra vigente** — o saldo é acertado no encerramento do
vínculo A e o vínculo B começa zerado.

**A favor:** é o único caminho que **não cria dívida de um CNPJ com o outro**. Cada empresa fecha o
próprio livro. Como diz o cabeçalho da migration, liquidar pela regra vigente "é o que não inventa
dinheiro".

**Contra:** o colaborador com saldo positivo grande recebe em dinheiro numa hora que ele talvez
preferisse folgar depois; e para a empresa é desembolso de caixa na data da transferência.

**É decisão contábil entre os CNPJs, não de software.** Se o grupo quiser transferir o saldo, é
implementável — mas alguém precisa dizer como o crédito de uma empresa vira débito da outra.

**DECISÃO DO DONO (11/08/2026): escolhida NA HORA da transferência.** Igual ao #1 — não é regra global.
Numa **continuidade** (matriz/filial) o saldo segue com o vínculo; numa **rescisão** (CNPJ distinto)
liquida no acerto e o novo começa zerado. **A construir** junto do passo continuidade × rescisão do #1.

---

## 3 · Limite concessivo de férias: 11 ou 12 meses?

**Onde está:** `src/dominios/ferias/servico.ts:91` — `MESES_LIMITE_CONCESSIVO = 11`, chumbado.
Confirmado como defeito de **gravidade alta** pela contestação de 01/08: é o único limite fixo no
código que decide uma **afirmação sobre dinheiro** na tela do titular.

**Minha decisão: são DUAS coisas, e hoje estão coladas numa só.**

- **Limite legal = 12 meses.** O art. 134 diz que as férias são concedidas "nos 12 meses subsequentes"
  ao período aquisitivo. Declarar "VENCIDA — dobro" aos 11 meses **acusa dobro um mês antes de ele
  existir** — o sistema afirma um passivo que a lei ainda não criou.
- **Alerta = 11 meses (ou o que o DP quiser).** Avisar um mês antes é boa prática de DP e provavelmente
  era a intenção de quem escreveu o 11.

**A favor de separar:** cada número passa a dizer uma coisa só, e o alerta vira administrável pela tela
sem mexer no limite legal.

**Contra:** dá uma migration e uma tela a mais do que simplesmente trocar 11 por 12.

**O que eu preciso de você:** confirmar que o alerta do DP deve ser em 11 meses. O 12 do limite legal
eu trato como lei, não como escolha.

**Reconfirmado pela varredura geral (10/08/2026):** a revisão adversarial do módulo de férias
reapontou exatamente este `MESES_LIMITE_CONCESSIVO = 11` (`ferias/servico.ts:92`, materializado em
`rh.periodo_aquisitivo.limite_concessivo`), com o detalhe de que, colado à premissa de gozo de 30
dias, ele acusa "dobro" cedo demais para quem tira férias parciais. Segue aqui como #3 — não dupliquei.

**DECISÃO DO DONO (11/08/2026): separar — 12 legal + alerta 11 administrável.** A metade LEGAL está
FEITA e provada: `MESES_LIMITE_CONCESSIVO = 12` (art. 134) e a migration 0062 reconciliou as linhas
já materializadas (recomputou limite = fim + 12 e desvenceu quem os 11 marcaram cedo demais — no dev,
3 períodos voltaram de 'vencido' para 'em_aberto', e os 2 que passaram de 12 meses seguem vencidos). O
falso "VENCIDA — dobro" um mês antes está corrigido.

**RESOLVIDO POR COMPLETO (11/08/2026).** Ao construir a fatia do alerta, descobriu-se que o aviso
antecipado **já existia e funcionava**: o painel de vencimento do DP marca cada período com `nivelAlerta`
("Vence em até 30/60/90 dias"), e a faixa de 30 dias é exatamente o "avisar aos 11 meses" (30 dias antes
do limite de 12 meses). A data exata e os dias restantes aparecem em número na linha. O único ponto em
aberto era tornar as faixas **editáveis pela tela** — e o dono decidiu **deixá-las fixas**: como a decisão
escrita da FB-4 já argumentava (ver `ferias/esquemas.ts:97`), essas faixas são cor/etiqueta, não regra
(trocar 60→45 não adianta nem atrasa o vencimento de ninguém, não mexe no dobro do art. 137). Não violam
o eixo 9 ("nada chumbado" vale para número que muda o que o sistema AFIRMA sobre a pessoa; a faixa só muda
quando a etiqueta fica amarela). Nada mais a fazer no #3.

---

## 4 · Folha: 5º dia corrido ou 5º dia útil?

**Onde está:** `src/dominios/folha/repositorio.ts:1882` — o prazo está escrito como `INTERVAL` dentro
do SQL, onde nenhuma busca por constante acha, e alimenta um indicador com meta pactuada.

**Minha decisão: 5º dia ÚTIL.** O art. 459 §1º da CLT diz "até o quinto dia útil do mês subsequente".
"Corrido" não é interpretação — está simplesmente diferente do texto da lei.

**A favor:** é o que a lei diz, e o indicador hoje cobra do DP um prazo mais apertado que o legal.

**Contra:** nenhum que eu enxergue. Este não é um caso de duas leituras defensáveis.

**A sub-pergunta que É sua, e vale levar ao contador:** **sábado conta como dia útil** para esta
contagem? Para o art. 459 o entendimento majoritário é que sim (dia útil = dia de trabalho, não dia
bancário), o que muda a data em vários meses do ano. É o único ponto aqui com resposta em disputa.

**DECISÃO DO DONO (11/08/2026): 5º dia ÚTIL, e SÁBADO CONTA como dia útil.** Só domingo e feriado não
contam.

**RESOLVIDO (11/08/2026, migration 0064).** O `INTERVAL '4 days'` chumbado saiu; o prazo agora é
`rh.enesimo_dia_util_folha(mes_pgto, 5)` — o 5º dia útil, com sábado contando e domingo/feriado nacional
não. A função lê o **mesmo calendário administrável** que o ponto já mantém (`rh.feriado`, editável em
/ponto/parametros) — não criei tabela nem tela nova, e o eixo 9 fica satisfeito lendo a fonte que já
existe. O `5` é a lei (art. 459 §1º), fica no chamador com a citação. A descrição do indicador e os
comentários que diziam "dia 5" foram alinhados. **Provado**: Jan/Mai (feriado empurra 05→07), Ago
(começa no sábado → 5º útil = 06, não 07), Nov (5º útil cai num sábado, com Finados pulado); 36 meses
sem NULL, sempre entre dia 5 e 7. Suíte 179, tsc e lint verdes. Nota: só feriado NACIONAL entra no
prazo (municipal/estadual raramente cai nos 5 primeiros dias úteis); a régua "dia útil" do prazo (sábado
conta) é de propósito diferente da do ponto/painel (seg–sex). Sub-pergunta do sábado: decidida pelo dono,
não precisou de contador.

---

## 5 · Lista completa de rubricas e layout dos importadores — com o Diego

Pendente desde 29/07. Sem ela a folha não fecha o ciclo real e os importadores não têm contra o que ser
escritos. As seis rubricas nomeadas pela diretoria já estão no sistema; falta o resto do plano.

---

## 6 · O balde anônimo já gravado com corte às 21h

**Onde está:** `db/migrations/0022_pesquisas.sql:144` — o `DEFAULT date_trunc('day', now())` corta no
fuso da sessão, então das 21h à meia-noite de Brasília a resposta cai no balde do dia seguinte. A
coluna existe para **anti-reidentificação**: dois baldes por dia civil enfraquecem exatamente o que ela
protege.

**Minha decisão: corrigir o `DEFAULT` por migration nova, e NÃO mexer nas linhas já gravadas.**

**A favor:** consertar o passado exigiria desligar o trigger de imutabilidade de uma tabela de
pesquisa anônima — e desligar imutabilidade para reescrever resposta de pesquisa é precisamente o que
essa trava existe para impedir.

**Contra:** as linhas antigas continuam com o corte errado.

**Por que isso é barato hoje e caro depois:** o banco atual só tem dado fictício. Essa decisão vira
séria no dia da implantação — se a correção não estiver feita **antes** da primeira pesquisa real,
não haverá mais como escolher.

**RESOLVIDO (11/08/2026) — migration 0063.** O DEFAULT passou a
`(rh.hoje()::timestamp AT TIME ZONE 'America/Sao_Paulo')` — o instante da meia-noite de São Paulo,
idêntico para toda resposta do mesmo dia civil independentemente do fuso da sessão. Só o DEFAULT mudou;
as linhas já gravadas não foram tocadas (a tabela é imutável por trigger, e o dono decidiu não reescrever
resposta anônima registrada). Provado no dev: às 22:30 BRT o balde antigo (sessão UTC) apontava o dia
seguinte e o novo aponta o dia civil certo; às 13:00 os dois concordam (o defeito era só das 21h à
meia-noite). Insert real (rollback) grava a meia-noite de SP e bate com o esperado; 374 linhas antigas
intactas. Feito antes da primeira pesquisa real, como a decisão exigia.

---

## 7 · Na transferência entre CNPJs, o critério da regra ainda decide o que atravessa

**Onde está:** `fast-pessoas/src/dominios/beneficios/servico.ts` —
`transferirAdesoesEntreVinculos`, na linha do `atendeCriterio(adesao.criterio, perfilDestino)`;
e a mesma lógica gravada em `db/migrations/0051_beneficio_atravessa_a_transferencia.sql:60-77`.

**O que mudou em volta dela.** Na onda H (06/08/2026) a regra de elegibilidade deixou de ser portão:
a pessoa já entra com direito, quem concede é o DP, e o critério da regra virou **valor de
referência** — ele não recusa mais concessão em lugar nenhum. Em lugar nenhum **exceto aqui**. Na
transferência entre CNPJs o benefício continua sendo encerrado no vínculo velho e **só renasce no
vínculo novo se o critério do destino admitir a pessoa**; se não admitir, ele fica para trás e a
pessoa é informada disso no cartão da movimentação.

**Minha decisão: manter como está por enquanto** — e é por isso que estou perguntando em vez de
mudar.

**A favor de manter:** benefício é contrato do EMPREGADOR com a operadora, não da pessoa. Quando o
contrato de trabalho muda de CNPJ, a apólice muda de titular; a empresa B pode simplesmente não ter
plano odontológico. O critério ali não está funcionando como "elegibilidade da pessoa", está
funcionando como "o que a empresa de destino oferece" — que é outra pergunta, e continua legítima.
Foi essa regra que fechou um buraco real: o RH via cinco adesões vigentes numa matrícula encerrada e
a pessoa via zero.

**Contra, e é real:** a mesma tabela agora significa duas coisas. No ato do DP ela é sugestão de
valor; na transferência ela é portão. Um DP que conceder VT a um PJ (o que hoje é permitido e fica
registrado na trilha) verá esse VT **sumir sozinho** na primeira transferência entre CNPJs, porque o
critério do destino diz "só CLT". Nada na tela avisa que a regra tem esse segundo poder.

**As duas saídas, se a resposta for "mudar":**
1. **Atravessa tudo, e o DP corta o que a empresa nova não oferece.** Coerente com "a pessoa já entra
   com direito", e o corte fica sendo um ato com autor. Custo: a lista de adesões do vínculo novo
   pode nascer com benefício que a empresa B não tem contrato para pagar.
2. **Separar as duas perguntas:** criar no catálogo do benefício quais empresas o oferecem (hoje o
   critério mistura tipo de vínculo com unidade), e a transferência passa a olhar essa lista, não o
   critério de elegibilidade. É a resposta certa e a mais cara.

**O que trava:** nada hoje — o comportamento continua o de antes. Vira sério na primeira
transferência real entre CNPJs depois de o DP começar a conceder fora do critério.

**DECISÃO DO DONO (11/08/2026): atrelado ao #1.** Como o dono decidiu que a transferência pode ser
**continuidade** (matriz/filial) ou **rescisão** (CNPJ distinto), o #7 deixa de ser pergunta solta:
- numa **continuidade** o benefício **atravessa junto** (mesmo empregador, o contrato segue);
- numa **rescisão** ele é reavaliado no destino (o comportamento atual — critério do destino decide).
Resolve-se junto do passo continuidade × rescisão do #1, não isolado.

---

## 7 · `esquemaData` aceita data inexistente (30/02) — RESOLVIDO 2026-08-10

**O quê:** o `esquemaData` que quase todo módulo usa (`beneficios`, `admissao`,
`afastamentos`, `avaliacao`, `clima`, …) valida a data com
`!Number.isNaN(Date.parse(...))`. Mas `Date.parse("2026-02-30")` **não é NaN** —
o JS ROLA 30/02 para 02/03. Então `2026-02-30` passa pela borda e, se a data for
para um `::date` no Postgres, estoura com 500 feio em vez de 400 limpo.

**Provado:** `Date.parse("2026-02-30T00:00:00Z")` → número válido, não NaN.
`2026-13-01` esse sim é NaN (mês fora de faixa), mas o dia fora de faixa rola.

**Onde já foi tapado:** só a rota de revisão de valor de benefício
(`api/beneficios/adesoes/revisao/[id]/route.ts`) ganhou a trava honesta — o
ida-e-volta: a data só é real se, convertida e formatada de novo, volta
idêntica.

**RESOLVIDO:** feito — `src/lib/data-civil.ts` é a fonte única com o ida-e-volta (mais a guarda contra `Invalid Date` que estoura no mês fora de faixa), e os 15 módulos + a rota de revisão de benefício importam dela. 174 testes, um deles travando 30/02 e o mês 13. O texto abaixo era a recomendação original.

**Recomendação original:** trocar o `refine` do `esquemaData` compartilhado pelo teste de
ida-e-volta, num lugar só, e todos os módulos herdam. É mudança em arquivo que
vários módulos importam — não fiz sozinho porque toca superfície ampla e o dono
estava fora. Baixo risco (só aperta o que já devia recusar), mas merece rodar os
portões de cada módulo tocado.

**Eixo:** tempo civil / vigência — data inexistente é a borda que a validação
por `Date.parse` deixa passar.

---

## 8 · Achados das revisões de código da onda 0/H (2026-08-10) — nenhum bloqueador

Duas revisões adversariais (gsd-code-reviewer) varreram a onda 0/0b, a onda H
(H1/H2/H5/H6) e a H3/H4. **Zero bloqueadores** — os pontos de risco (IDOR nos
dependentes e no `/api/ponto/dia`, bypass de MIME no multipart, backfill da
0055, corrida do encerramento na revisão de valor) estão todos fechados e
provados. O que sobrou, para o dono decidir:

**8a — CPF de dependente não tem campo no autoatendimento** (portal). O backend
e o esquema aceitam CPF opcional, mas a tela `portal-colaborador.tsx` não tem o
input. Então o colaborador cadastra dependente sem CPF, e o passo do CPF (que o
eSocial/IRRF pede) volta para o DP. **DECISÃO:** expor o CPF do dependente
(possível menor) no autoatendimento é escolha de PRIVACIDADE/LGPD, não bug —
por isso não fiz sozinho. Antes era o DP quem digitava; agora seria a pessoa.

**8b — data de nascimento de dependente não tem teto (não-futuro).** Baixo
impacto (data futura só não conta no IRRF), e hoje é *consistente* com o caminho
do DP, que também não trava. Consertar só o portal criaria inconsistência entre
os dois. Guardar nos dois (ou em nenhum) é decisão de escopo.

**8c — TOCTOU na categoria de devolução:** se a categoria for inativada entre a
checagem `ativa` e o INSERT, o `RAISE EXCEPTION` cru do trigger vira 500 em vez
do 4xx amigável que já existe algumas linhas acima. **Fails-safe** (nenhuma
linha ruim entra), então é UX/observabilidade, não perda de dado. Conserto:
dar um SQLSTATE-sentinela ao trigger (migration nova) e mapear no serviço. Não
fiz sozinho por exigir migration para um 500→400 cosmético.

---

## 9 · Folha: quem conta como dependente para o IRRF?

**Onde está:** `src/dominios/folha/repositorio.ts:452` — a dedução de dependente do IRRF conta TODA
linha de `rh.dependente` do colaborador, sem filtro de elegibilidade (qualquer parentesco — filho,
cônjuge, outro — e qualquer idade) e sem teto. O motor aplica `dependentes_irrf *
deducao_dependente_centavos` (`calculo.ts`) e baixa a base do imposto.

**Por que virou pergunta agora:** a migration 0056 abriu o autoatendimento de dependente
(`dependente.proprio.manter`) — o próprio funcionário/gestor insere os dependentes dele, alvo pela
sessão, sem conferência do DP e sem limite de quantidade. Como `rh.dependente` é a tabela de
dependente de BENEFÍCIO (não tem coluna de idade nem flag `deduz_irrf`), um "filho" de 30 anos ou um
"outro" (um pai, p.ex.) cadastrado só para o plano de saúde entra como dependente de IRRF cheio — uma
redução de imposto auto-servida.

**Minha recomendação: separar elegibilidade de IRRF do vínculo de benefício.** O que a Receita admite
como dependente de IRRF (art. 35 da Lei 9.250) é lista fechada com regra de idade (filho até 21, ou 24
se universitário; etc.) — diferente de "quem eu ponho no meu plano". Sugiro uma coluna `deduz_irrf`
(+ regra de idade) em `rh.dependente`, a folha contando só os elegíveis, e o autoatendimento passando
por conferência do DP antes de tocar a base do imposto.

**A favor:** a base do IRRF para de ser auto-servida e passa a refletir a regra legal.

**Contra:** dá uma migration, uma regra de idade e um passo de conferência — e enquanto não existir, o
mais seguro é NÃO deixar a linha auto-cadastrada fluir para a retenção.

**O que trava:** a exatidão do IRRF retido. Vira sério na primeira folha real com dependente cadastrado
pela própria pessoa. É decisão de negócio (o que a Fast trata como dependente fiscal) somada a risco
fiscal, por isso não decidi sozinho.

**Eixo:** dinheiro / nada chumbado — contagem que muda o resultado afirmado (imposto retido) saindo de
uma fonte que não é a regra fiscal.

---

## 10 · Contato do candidato: a leitura entra na trilha de dado sensível?

**Onde está:** `src/dominios/recrutamento/servico.ts:428` (`obterKanban`) e `repositorio.ts:497`
(`listarCandidatos`) — o kanban e o painel de R&S devolvem `candidato_email` e `candidato_telefone`
(dado pessoal de um titular EXTERNO à empresa) a quem tem `rs.ver`/`rs.gerir`. Diferente do salário da
oferta e do parecer — que gravam `audit.leitura_sensivel` — o contato do candidato é lido sem rastro.

**A pergunta que é sua:** o contato do candidato conta como recurso SENSÍVEL na taxonomia de
privacidade (0044)? Se sim, a leitura devia deixar trilha (art. 18 da LGPD: o titular pode perguntar
quem acessou os dados dele e quando). Se a decisão foi deliberada de não auditar (reservar "sensível" a
salário/parecer), então está certo — mas vale registrar a escolha para não parecer omissão.

**Minha recomendação: auditar a leitura do contato.** É dado de terceiro que a empresa ainda não
contratou; o custo de gravar uma linha por leitura é baixo e o mesmo padrão já existe para salário e
parecer no mesmo arquivo.

**A favor:** fecha o mesmo eixo (rastro de leitura) de forma consistente com o resto do módulo, e
responde a uma eventual requisição do titular.

**Contra:** mais linhas em `audit.leitura_sensivel` a cada abertura de kanban/painel; e se o projeto
decidiu que contato de candidato não é "sensível" no mesmo nível de saúde/salário, auditar seria escopo
a mais.

**O que trava:** nada hoje. Vira relevante quando houver candidato real e uma eventual requisição LGPD.
É decisão de classificação de privacidade, por isso subiu.

**Eixo:** rastro de leitura (8) — dado sensível de terceiro devolvido sem registro em
`audit.leitura_sensivel`.

**DECISÃO (11/08/2026) — NÃO auditar (deliberado).** O dono decidiu reservar "sensível" a
salário e parecer; o contato do candidato (nome/e-mail/telefone) NÃO grava `audit.leitura_sensivel`.
Fica registrado aqui como escolha consciente, não omissão. Se um dia entrar no escopo, o mesmo padrão
de `registrarLeituraSensivel` que já existe para oferta_valor/parecer se aplica. **RESOLVIDO.**

---

## 11 · Replay de TOTP: o mesmo código vale de novo dentro da janela (~90s) — IMPLEMENTADO na branch, falta o smoke de persona

**Feito em 10/08/2026 na `revisao-geral`** (migration 0060 + `identidade/totp.ts` +
`consumirPassoTotp` + os 3 pontos de uso ligados). Provado em duas metades: o cálculo do
passo por teste puro (`tests/totp.test.ts`, 5 casos) e o consumo atômico contra o banco
(`db/provas-totp.js`: fresco aceito → replay recusado → seguinte aceito → antigo recusado,
em transação revertida). **O que FALTA antes de mergear na main:** a bateria de 2FA por
persona (login das 7 personas com código fresco da `db/codigo-2fa.js`, mais um teste manual
de reativar 2FA logo após desativar) — é a rede que o arnês pede para mudança de auth, e eu
não consigo rodá-la headless sem as personas. Enquanto isso não rodar, não empurre a `main`.

**Revisão adversarial do próprio TOTP (10/08/2026) achou e eu consertei:** (1) BLOCKER — o
"último passo" era compartilhado entre login, aprovação de folha e desativação; como
login→aprovar-folha pede DOIS TOTP em segundos (o mesmo código do período de 30s), o
segundo era recusado. Corrigido: **anti-replay só no LOGIN** (a ameaça real); folha e
desativação — que já exigem sessão + senha — voltam a validar sem consumir. (2) O
enrolamento não gravava o passo (código de ativação era replayável 1× no login); corrigido:
`confirmarAtivacao2fa` grava o passo do código de confirmação. **Limitação residual conhecida
(delta +1):** aceitar um código do próximo período (folga de relógio, janela 1) adianta o
"último passo"; um código genuinamente fresco de passo MENOR (segundo autenticador atrasado,
ou salto NTP para trás) seria recusado. Cenário raro (dois dispositivos dessincronizados no
mesmo minuto); não mexi na lógica de consumo para não quebrar a detecção de replay. Vale
monitorar recusas após aceite de delta +1.

O texto abaixo era o registro original.

---


**Onde está:** `src/dominios/identidade/servico.ts:60` — `validarCodigoTotp` usa `window: 1`
(aceita ±1 período de 30s) e NÃO registra código já consumido. O mesmo helper é reusado no
login (l.105), no `desativar2fa` (l.323) e em `validarTotpDoUsuario` (l.189), então um único
código interceptado pode ser repetido nesses fluxos enquanto não expira naturalmente.

**O buraco:** quem captura um código de 6 dígitos (phishing/MITM) MAIS a senha pode reapresentar
o MESMO código dentro da janela de aceitação para completar login ou uma revalidação crítica,
porque nenhum código já usado é rejeitado. TOTP é, por definição, de uso único; hoje é
reutilizável por ~90s.

**Minha recomendação: rastrear o último passo (counter) aceito por usuário e recusar reuso.**
Adicionar `totp_ultimo_passo BIGINT` em `sistema.usuario` (migration), a validação devolver o
passo absoluto (contador do período + delta do `validate`) e, na MESMA operação, aceitar só passo
> último e gravar o novo — um UPDATE condicional (`... WHERE totp_ultimo_passo IS NULL OR
totp_ultimo_passo < $passo`) é a trava atômica: 0 linhas = replay = recusa. Opcional: apertar
`window` para 0.

**A favor:** fecha o eixo "enrolamento TOTP sem bypass" de verdade — código vira de uso único,
como manda o padrão.

**Contra / por que NÃO fiz junto com o resto da varredura:** mexe no caminho de AUTH em três
lugares e num `sistema.usuario` que TODO login toca, e a regressão de 2FA deste projeto é por
PERSONA (as tarefas de smoke 2FA), não pelo `npm test`. Um erro no cálculo do passo ou na trava
arrisca LOCKOUT de quem usa 2FA — exatamente o tipo de mudança que o arnês manda validar com o
dono e as personas antes de entrar. (Um código fresco sempre tem passo maior, então o único caso
recusado é reapresentar o MESMO código; ainda assim quero a bateria de personas rodando antes do
merge.)

**O que trava:** nada do fluxo normal hoje. É endurecimento de segurança; vira relevante sob
captura ativa de credenciais. Severidade avaliada como PLAUSIBLE (janela estreita).

**Eixo:** auth / enrolamento TOTP sem bypass.

---

## 12 · O vínculo "temporário" não tem família de modelo de admissão

**Onde está:** `src/dominios/admissao/esquemas.ts` — `TIPOS_VINCULO_MODELO` = clt/estagiario/
aprendiz/pj, e o CHECK da `0058` (`tipo_vinculo IN ('clt','estagiario','aprendiz','pj')`) faz o
mesmo. Mas `rh.colaborador.tipo_vinculo` (0001_fundacao.sql:66-67) admite um sexto:
**`temporario`**.

**A consequência:** ao admitir alguém `tipo_vinculo='temporario'`, `buscarChecklistAtivo` procura
`tipo_vinculo='temporario' OR IS NULL` — como nenhum modelo pode ser 'temporario' (o CHECK proíbe
e a tela não oferece a família), só casa o GERAL. O trabalhador temporário (Lei 6.019, com
documentação legalmente distinta — contrato de trabalho temporário, etc.) usa em silêncio o
checklist geral, e o DP não consegue criar um modelo específico pela tela.

**Minha recomendação: incluir 'temporario' como família** — é o que alinha o domínio do MODELO ao
domínio real de `rh.colaborador.tipo_vinculo`, e é a mesma razão de existir da Fase 1 (o checklist
varia por vínculo porque a documentação varia). Custo: uma migration para estender o CHECK da
`checklist_admissao_versao` (a 0058 está aplicada, então é uma migration nova que faz
`DROP CONSTRAINT ... ADD CONSTRAINT ...` com os cinco valores), mais 'temporario' em
`TIPOS_VINCULO_MODELO`, `ROTULOS_FAMILIA_MODELO` e `FAMILIAS_NA_ORDEM`.

**A favor:** nada chumbado (eixo 9) — a lista de famílias passa a cobrir todos os vínculos que
existem, e o DP administra o checklist do temporário como administra os outros.

**Contra / por que subo em vez de decidir:** se a Fast **não contrata por vínculo temporário** (ou
trata temporário como CLT para fins de admissão), incluir a família é ruído. É decisão de negócio
(a Fast usa esse vínculo?) somada a uma migration — por isso não fiz sozinho. Se a resposta for
"não usamos", basta documentar a omissão no COMMENT da coluna e fechar esta pendência.

**O que trava:** nada hoje — temporário cai no geral. Vira relevante na primeira admissão real de
temporário que precise de um checklist diferente do geral.

**Eixo:** nada chumbado (9) — o domínio do modelo omite um valor que o cadastro admite.

**DECISÃO (11/08/2026) — a Fast NÃO contrata por vínculo temporário para fins de admissão;
trata como CLT.** Portanto o modelo de checklist NÃO ganha a família 'temporário' — quem for
'temporario' no cadastro usa o checklist Geral, de propósito. Registrado como escolha, com um
comentário em `admissao/esquemas.ts` (TIPOS_VINCULO_MODELO) apontando aqui. Se um dia a Fast
passar a usar o vínculo, reabrir: migration estendendo o CHECK da 0058 + a família na tela.
**RESOLVIDO.**
