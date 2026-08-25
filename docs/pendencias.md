# Pendências — o que está travado esperando alguém

> Um lugar só. Se está aqui, alguém de fora do código precisa responder.
> Regra do arnês (ponto 4): **nada sobe como pergunta crua.** Toda pendência traz a decisão
> recomendada, o porquê, e os prós e contras dela — quem decide decide, não pesquisa.
>
> Aberto em 01/08/2026. Antes disto, estas cinco linhas estavam em três lugares diferentes, uma delas
> escondida no cabeçalho de um arquivo `.sql`.

| # | Assunto | Dono | Aberta em | Trava o quê |
|---|---|---|---|---|
| 1 | Transferência entre CNPJs: rescisão ou continuidade? · ✅ RESOLVIDA (0065) | Guilherme | 31/07/2026 | férias, aviso prévio |
| 2 | Saldo de banco de horas na transferência · ✅ RESOLVIDA via #1 | Guilherme | 31/07/2026 | fechamento contábil entre CNPJs |
| 3 | Limite concessivo de férias: 11 ou 12 meses · ✅ RESOLVIDA | Guilherme | 30/07/2026 | alerta de "dobro" na tela do titular |
| 4 | Folha: 5º dia corrido ou útil · ✅ RESOLVIDA (0064) | Guilherme | 30/07/2026 | indicador de prazo de fechamento |
| 5 | Lista de rubricas e layout dos importadores · ✅ ENCERRADA 13/08 (rubricas têm CRUD na tela; importador de ponto já existe; resto = config do DP / evolução) | Diego → Guilherme | 29/07/2026 | folha completa, importação |
| 6 | Balde anônimo já gravado com corte errado · ✅ RESOLVIDA (0063) | Guilherme | 01/08/2026 | nada hoje; conta na implantação |
| 7 | Benefício na transferência entre CNPJs: o critério ainda barra · ✅ RESOLVIDA via #1 | Guilherme | 06/08/2026 | quem perde benefício ao mudar de CNPJ |
| 9 | Folha: quem conta como dependente para o IRRF · ✅ RESOLVIDA (0061) | Guilherme | 10/08/2026 | base do IRRF retido |
| 10 | Contato do candidato: leitura entra na trilha? · ✅ RESOLVIDA (decidido: não auditar) | Guilherme | 10/08/2026 | rastro LGPD de dado de terceiro |
| 11 | Replay de TOTP: código válido reutilizável na janela · ✅ RESOLVIDA (0060 + bateria de persona) | Guilherme | 10/08/2026 | endurecimento do 2FA |
| 12 | Vínculo "temporário" não tem família de modelo de admissão · ✅ RESOLVIDA (decidido: não usa) | Guilherme | 10/08/2026 | checklist próprio de temporário |
| 13 | Padrão Modelo — **recrutamento**: quem escolhe o modelo · quando trava · Pesquisa social · ⏳ ABERTA | Guilherme | 13/08/2026 | a 3ª fatia do Padrão Modelo (processo seletivo versionado) |
| 14 | Padrão Modelo — **clima**: qual universo de pergunta (check-in × pesquisa) · ⏳ ABERTA | Guilherme | 13/08/2026 | a 4ª fatia do Padrão Modelo (perguntas: catálogo/continuidade) |

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

**EM CONSTRUÇÃO (branch revisao-geral). Backend FEITO E PROVADO ponta a ponta (slices 1-3).**
- Slice 1 (migration 0065): coluna `modo_transferencia`, CHECK relaxado por modo, função `rh.mesma_raiz_cnpj`.
- Slice 2 (serviço): validação da criação (continuidade só com mesma raiz; matrícula só na rescisão) +
  o efeito `aplicarContinuidadeDeRegistro` (encerra a lotação vigente, abre outra no MESMO vínculo; não
  desliga, não abre vínculo novo, não liquida banco, não zera férias).
- Slice 3 (prova por script contra a 3001): continuidade DCS→Supply de quem tem 7 períodos de férias,
  banco e dependentes — vínculos 71→71 (nenhum novo), mesmo vínculo ativo/mesma matrícula/mesma
  admissão, lotação trocada, **férias e banco IGUAIS**, evento `transferencia_continuidade` gravado. A
  prova ACHOU UM BUG e ele foi corrigido: o gate de estabilidade do art. 118 barrava a criação de
  QUALQUER transferência ("ENCERRA o contrato"), mas a continuidade não encerra — passou a valer só na
  rescisão. Negativo provado: continuidade + matrícula = 400.

- Slice 4 (tela): o formulário de movimentação passou a oferecer o modo. `/opcoes` devolve o
  `cnpj_atual` do alvo; a tela compara a raiz (8 dígitos) com a da empresa destino — mesma raiz mostra
  o seletor continuidade × rescisão (padrão continuidade) e esconde matrícula/gestor/tipo; raiz distinta
  ou CNPJ ausente força rescisão com aviso. Verificado: `/opcoes` entrega `cnpj_atual` nos 62 alvos,
  tsc do formulário limpo, lint 0 erros, sem erro de compilação no dev server. (Não capturei screenshot
  — o pane do browser não estava visível; a verificação foi funcional.)

- Slice 5 (ficha): a ficha rotula o evento `transferencia_continuidade` ("Continuidade — mudança de
  registro") no mapa de tipos, com o mesmo símbolo/cor da transferência. A continuidade aparece como um
  evento no MESMO vínculo (não uma sucessão): confirmado que `rh.evento_da_pessoa` (fonte da linha do
  tempo) traz o evento do vínculo 168.

**RESOLVIDO POR COMPLETO (11/08/2026) — os 5 slices.** A transferência entre empresas do grupo agora
tem os dois modos: **continuidade** (matriz↔filial, mesma raiz de CNPJ — o contrato segue no mesmo
vínculo, sem desligar, sem zerar férias/banco) e **rescisão** (raiz distinta — o que já existia). A tela
oferece continuidade como padrão quando a raiz bate; o servido reconfere. A prova por script achou e
corrigiu um bug (o gate de estabilidade barrava continuidade). Invariante do dono garantido: a ficha/
histórico nunca se perde. Nota de demo: os 4 CNPJs hoje são a MESMA raiz — para exibir rescisão-por-raiz-
distinta na 3001, semear empresa de raiz diferente (a "Fast Serviços" já nasce sem CNPJ, o que já força
rescisão).

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
liquida no acerto e o novo começa zerado.

**RESOLVIDO via #1 (11/08/2026).** A continuidade não liquida o banco — ele segue no mesmo vínculo
(provado: o vínculo 168 manteve o saldo de 996 minutos após a continuidade). A rescisão liquida pela
regra vigente (`liquidarBancoNaRescisao`, comportamento anterior). É exatamente a decisão do dono.

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

**PARCIALMENTE RESOLVIDA (12/08/2026).** O Diego devolveu o plano de rubricas
(`Cópia de rubricas-e-importadores-para-o-diego preencv2.xlsx`) — ~51 rubricas com natureza,
incidências e tipo de cálculo. A leitura fiel, item a item, está em
[docs/18-plano-de-rubricas-diego.md](18-plano-de-rubricas-diego.md).

- **Entrou** (migration 0069): o catálogo SEGURO — 9 rubricas novas de `valor_informado`, sem
  decisão pendente (Triênio + descontos: consignado, refeição, VT não usado, planos Assim/Amil, dano).
- **Continua aberto, com o Diego/DP:** (a) decisão de código — as duplicatas onde ele usou o código
  real da folha da Fast e o sistema tem placeholder (Salário Base, HE, DSR, Salário Família, INSS);
  (b) incidência a validar — 0136/0137 Férias (gozadas × indenizadas), 0087 Salário Maternidade;
  (c) percentuais faltando — ZE24FO Periculosidade, 5000FO VT 1%; (d) o motor de rescisão/férias/13º
  (as ~30 "Automático" — épico à parte); e **(e) a aba Importadores, que ele deixou só no exemplo** —
  sem ela os leitores de arquivo não têm o que ler. Folha de confirmação para devolver a ele:
  `docs/confirmacao-rubricas-diego.xlsx`.

**ATUALIZAÇÃO 12/08/2026 (rodada 2 — Diego devolveu a confirmação).** Migration 0070 entrou com mais
3 rubricas inequívocas (Aluguel Moto, Periculosidade 30%, VT 1%). **Decisão do dono:** adotar os
códigos reais no lugar dos placeholders — mas a execução vai **junto dos importadores** (4 das 7 são
códigos do motor; trocar edita o cálculo e exige re-verificação). **Importadores: o dono pediu para
deixar como pendência**, não construir agora — é o que ainda trava a folha real. Detalhe em
[docs/18](18-plano-de-rubricas-diego.md) §2a e §5.

**ENCERRADA 13/08/2026 — decisão do dono, reenquadrando o escopo.** Verificado no código
(não de memória) que o que parecia bloqueio é, na verdade, capacidade pronta + configuração
de DP + evolução opcional. Deixa de ser "travado esperando terceiro":

- **Rubricas — não é pendência.** O sistema tem CRUD completo pela tela `/folha/parametros`:
  criar rubrica nova (`inserirRubrica`), editar e versionar por vigência (`inserirVersaoRubrica`).
  O DP monta o catálogo real na tela — é entrada de dados, não código faltando. Ressalva: 4–5
  códigos são "motorizados" (Salário Base, HE, DSR, Salário Família, INSS têm tipo de cálculo
  preso ao motor); trocá-los pelos códigos do Diego mexe no cálculo e fica como **evolução da
  folha** (segue documentado em [docs/18](18-plano-de-rubricas-diego.md)), não como bloqueio.
- **Importador de ponto — já existe e é o único relevante agora.** `POST /api/ponto/importacoes`
  + formulário na tela `/ponto` leem a planilha padrão de 4 colunas (`matricula ; data ; hora ;
  tipo`), com apelidos de relógio e validação linha a linha. Os **demais importadores** (rubricas/
  eventos de folha via arquivo, e o AFD binário oficial) ficam **fora de escopo agora**, por
  decisão do dono.
- **Ponto / REP-P — decisão: caminho A.** A Fast vai usar um **REP-P (ou relógio) de terceiro** e
  **importar** os dados — o que o importador acima já suporta. Correção de conceito que ficou
  registrada: REP-P **não** é homologado pelo INMETRO (isso é o REP-C); um REP-P exige só registro
  do programa no INPI (Portaria 671/2021, art. 91), então não há "lista oficial" a consultar. O
  caminho B (o próprio Fast Pessoas ser o REP-P — registro no INPI + geração de AFD/AFDT, NSR
  sequencial, comprovante ao trabalhador) fica como **evolução futura**, se um dia.
- **PDI** — completo e provado (portal do colaborador + visão do gestor); nunca teve linha aqui,
  citado só para fechar o quadro.

Resultado: nenhuma pendência bloqueada por nós. O que sobra do plano do Diego não se perde — vira
evolução da folha em [docs/18](18-plano-de-rubricas-diego.md), fora da lista de bloqueios.

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

**RESOLVIDO via #1 (11/08/2026).** A continuidade não toca `rh.adesao` — as adesões seguem no mesmo
vínculo. Provado: o vínculo 168, após a continuidade DCS→Supply, manteve as **5 adesões vigentes**
intactas. Na rescisão, `transferirAdesoesEntreVinculos` reavalia pelo critério do destino (o de antes).

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

**DECISÃO DO DONO (12/08/2026): fica com o DP.** O CPF do dependente (dado de possível menor)
NÃO vai para o autoatendimento — o colaborador cadastra o dependente e o DP completa o CPF na
conferência do IRRF. Registrado como escolha de privacidade, não omissão. **RESOLVIDO.**

**8b — data de nascimento de dependente não tem teto (não-futuro).** Baixo
impacto (data futura só não conta no IRRF), e hoje é *consistente* com o caminho
do DP, que também não trava. Consertar só o portal criaria inconsistência entre
os dois. Guardar nos dois (ou em nenhum) é decisão de escopo.

**RESOLVIDO (12/08/2026, migration 0071) — guardar nos DOIS.** Um trinco no banco
(`rh.exigir_dependente_nascimento_nao_futuro`, `BEFORE INSERT OR UPDATE ON rh.dependente`)
recusa `nascimento > rh.hoje()` — cobre o DP e o autoatendimento num lugar só (os dois caminhos
usam esquemas diferentes, mas o mesmo `INSERT`). Em UPDATE só checa se a data mudou (editar outro
campo de cadastro antigo não trava). SQLSTATE `45002` → 400 amigável via `responderErro`.
**Provado ponta a ponta:** POST com data futura devolve `400 "data de nascimento não pode ser no
futuro"` e não cria linha; 0 dependentes futuros na base.

**8c — TOCTOU na categoria de devolução:** se a categoria for inativada entre a
checagem `ativa` e o INSERT, o `RAISE EXCEPTION` cru do trigger vira 500 em vez
do 4xx amigável que já existe algumas linhas acima. **Fails-safe** (nenhuma
linha ruim entra), então é UX/observabilidade, não perda de dado. Conserto:
dar um SQLSTATE-sentinela ao trigger (migration nova) e mapear no serviço. Não
fiz sozinho por exigir migration para um 500→400 cosmético.

**RESOLVIDO (12/08/2026, migration 0071) — exatamente o recomendado.** O trigger da 0054 ganhou
`USING ERRCODE = '45001'` (via `CREATE OR REPLACE`, a 0054 é imutável). O mapeamento não foi no
serviço e sim UMA vez em `src/lib/http.ts` (`mensagemDoTrinco` + branch no `responderErro`): a
classe `45` de SQLSTATE ficou reservada para "trinco de negócio → 400 com a mensagem", então toda
rota herda, sem tocar em cada serviço. Mesmo mecanismo central provado pelo 8b.

---

## 9 · Folha: quem conta como dependente para o IRRF? — RESOLVIDO (0061)

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

**RESOLVIDO (11/08/2026 — migration 0061; guarda 12/08/2026).** Fez-se exatamente o recomendado:
`rh.dependente` ganhou `deduz_irrf BOOLEAN NOT NULL DEFAULT false`, com backfill pela regra de idade
(cônjuge e filho < 21 → true; o resto, incl. `outro`, fica false para o DP conferir; os 24 anos do
universitário são exceção que o DP marca à mão). A folha (`folha/repositorio.ts`) passou a contar
**só `deduz_irrf = true`** na dedução do IRRF; o autoatendimento (0056) insere `false` (não reduz
imposto sozinho); e o DP marca/desmarca em `/beneficios` (`adesao.gerir`), auditado ("Abate no IRRF").
Guarda de regressão re-executável em `provas/folha/prova-dependente-irrf.js` (banco, sem servidor,
exit 0/1) — prova o DEFAULT false, que nenhum `outro` abate, e que a folha deduz só os elegíveis.

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

## 11 · Replay de TOTP: o mesmo código vale de novo dentro da janela (~90s) — RESOLVIDO (implementado + bateria de persona passou)

**Feito em 10/08/2026 na `revisao-geral`** (migration 0060 + `identidade/totp.ts` +
`consumirPassoTotp` + os 3 pontos de uso ligados). Provado em duas metades: o cálculo do
passo por teste puro (`tests/totp.test.ts`, 5 casos) e o consumo atômico contra o banco
(`db/provas-totp.js`: fresco aceito → replay recusado → seguinte aceito → antigo recusado,
em transação revertida). **BATERIA DE PERSONA FEITA E PASSOU (11/08/2026)** — o último portão
antes do merge. `provas/pendencia-11/bateria-2fa.js` (contra a 3001) provou, para as 7 personas
que exigem 2FA (daniel.melo, debora.rezende, diretora.pessoas, dp, lidertd, recrutador, rh):
sem código = 401 (bloqueado), com código fresco = 200 (entram, sem lockout), replay do mesmo
código = 401 (anti-replay vivo). E o FIX da madrugada: o código consumido no login do DP,
reusado em `folha/aprovar`, foi ACEITO (o erro que sobrou foi 409 de ESTADO — "só a partir de
Em conferência" — não de código). Persona sem 2FA (otavio.dantas) entra sem código. **Não trava
mais o merge.**

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

---

## 13 · Padrão Modelo — fatia RECRUTAMENTO: 3 decisões antes de construir

**Contexto:** o Padrão Modelo já foi aplicado 2× (admissão/0058 por tipo de vínculo, avaliação/0074
por cargo). Recrutamento é a fatia **mais estrutural** das quatro: ao contrário das outras, **não
existe a entidade "modelo"** — `rh.etapa_selecao_versao` (`0012:72-97`) funde catálogo e modelo, com
dois índices GLOBAIS (`0012:89-92`) que impõem um processo seletivo único para a empresa inteira, e a
candidatura **não congela** nada — o kanban relê a lista viva a cada movimento (`recrutamento/repositorio.ts:155-172`).
Construir a fatia = **criar** a peça "modelo" (que as outras já tinham) + a etapa "Pesquisa social" +
o relatório dT por etapa. Tudo o mais (movimentação append-only carimbada, banda salarial congelada,
admissão disparada no aceite) já existe e se reaproveita.

### 13a · Quem escolhe o modelo de processo: a VAGA ou o CARGO?

**Minha recomendação: a VAGA escolhe, com o modelo GERAL pré-selecionado.**

**A favor:** um processo de *vendedor de loja* e uma contratação de *gerente* do mesmo cargo podem
querer ritos diferentes (executive search ≠ balconista) — o recorte por cargo não captura isso, e a
vaga já é o ponto natural de decisão. Foi o que os docs modelaram ("a vaga guarda a versão do modelo",
`docs/16:547`). Custo: um campo a mais na criação da vaga.

**Contra / alternativa mais barata:** recortar por **cargo** (zero clique, reusa a 0074 quase igual)
seria mais consistente com a avaliação — mas perde a flexibilidade que o recrutamento pede.

### 13b · Vaga aberta pode trocar de modelo depois? *(decisão já aberta em docs/17:125)*

**Minha recomendação: só enquanto a vaga não tiver NENHUMA candidatura** — que é a sua própria
sugestão em `docs/16:555`.

**A favor:** simples de explicar e de implementar (um `COUNT(*)` de candidaturas antes de permitir a
troca), evita pipeline misto, e é coerente com a banda salarial, que já congela na abertura
(`recrutamento/servico.ts:361-367`). Assim que o 1º candidato entra, o modelo trava.

### 13c · "Pesquisa social" (consulta antes da oferta, o L1)

**Minha recomendação: uma ETAPA comum do catálogo, opcional por modelo, posicionada antes da Oferta,
com resultado aprovado/não + anexo.** Hoje não há anexo em lugar nenhum do recrutamento
(`parecer_selecao` não tem coluna de arquivo, `0012:182-195`) nem desfecho binário por etapa.

**A favor:** tratá-la como etapa (não como gate separado) mantém as 3 peças limpas e deixa o dT
medi-la como qualquer outra. Opcional porque nem toda vaga exige consulta.
**Sub-decisão de privacidade:** quem vê o resultado/anexo? Recomendo restrito a `rs.gerir`/`rs.ver`
com trilha de leitura, no mesmo molde do valor da oferta e do parecer.

**Se fechar só o essencial primeiro:** 13a + 13b destravam o modelo versionado (o núcleo). 13c
(Pesquisa social) e o relatório dT por etapa vêm logo atrás — o dT não tem decisão de esquema
pendente (o dado já existe em `movimentacao_candidatura.em`; regra: mediana, não média; fechadas +
abertas hoje; agrupar por cargo, nunca por `vaga.titulo`).

**Por que subo em vez de decidir:** 13a e 13b definem o desenho do schema (imutável depois) e são
escolha de negócio (como a Fast quer conduzir seleções). 13c mistura privacidade de dado de terceiro.

### 13 · Estado da construção (atualizado 2026-08-14)

Decisões 13a (a VAGA escolhe, GERAL pré-selecionado) e 13b (trocar só sem candidatura) foram
confirmadas pelo dono e **construídas**:

- **Estágio 1** (migration `0076`): entidades `rh.modelo_selecao_versao` + `rh.modelo_selecao_etapa`,
  índice de um-padrão-ativo, série `continua_de`, seed do GERAL "Processo padrão" com as etapas
  ativas de hoje. Aditivo, sem mexer no pipeline.
- **Estágio 2** (migration `0077` + serviço): a vaga ganhou `modelo_versao_id` (congela o modelo na
  abertura); a candidatura anda pelas etapas DO MODELO (`buscarEtapasDoModelo`), não mais pela lista
  global. Rewire de ESCRITA (criar/mover candidatura).
- **Rewire de LEITURA** (commit `9ce037e`): o kanban desenha as colunas pelas etapas do modelo da
  vaga (`listarEtapasDoModelo`), e `ehUltima` sai da ordem da coluna — não mais do
  `candidatura.etapa_ordem` (escala global, órfã). Fecha o achado [média] da revisão do Estágio 2.
- **Estágio 3** (commit `ebcdf7b`): administração de modelos — `criarModelo` (nasce ativo,
  não-padrão; exige etapa de oferta, sem duplicata, etapas do catálogo), `listarModelos`, rota
  `GET/POST /api/recrutamento/modelos` (rs.gerir) e tela `/recrutamento/modelos` + seletor de modelo
  no diálogo de nova vaga. Provado ao vivo (modelo enxuto Triagem→Oferta; kanban de vaga nesse modelo
  = 2 colunas, não as 4 globais).
- **Revisão do Estágio 3** (commit `af988d9`): a oferta tem que ser a ÚLTIMA etapa (não só presente),
  senão a candidatura avançada além dela fica num beco; e a criação da vaga passou a registrar o
  modelo no rastro (eixo 8).
- **Blindagem do invariante** (migration `0078`, commit a seguir): trigger deferido no banco força
  "todo modelo de seleção ATIVO termina em etapa de oferta". Fecha o resíduo [médio-latente] que a
  verificação achou — o modelo GERAL nasce por seed e pula o `criarModelo`, então dependia de
  coincidência do catálogo; agora o banco garante para todo caminho (seed, tela, migration futura).
  Provado: estado atual passa; modelo mau é barrado no commit; modelo bom (via API) segue criando.

**Fica PENDENTE (follow-ups, nesta ordem de valor):**

1. **13b na tela — trocar o modelo de uma vaga aberta sem candidatura.** O domínio já suporta a regra
   (basta um `COUNT(*)` de candidaturas = 0 antes de trocar), mas hoje **não há endpoint de edição de
   vaga** (`vagas/[id]/route.ts` só tem GET). Como o modelo é escolhido na criação (e vaga nova não
   tem candidatura), a decisão 13a está satisfeita; 13b (trocar depois) precisa de um PATCH de vaga.
2. **Reformular / encerrar modelo.** Hoje o modelo é **imutável** (cria-se um novo para mudar o
   desenho) e não há como aposentar um alternativo obsoleto. Quando isso entrar, seguir o molde do
   clima/0075 (encerra a versão anterior, cria nova ativa com `continua_de`) — e **então** proteger
   `rh.modelo_selecao_etapa` com trigger (hoje o gap é inalcançável porque não há edição de etapas;
   a revisão do Estágio 2 marcou isso como caveat só-para-quando-a-edição-existir).
3. **13c · Pesquisa social** — bloqueada por falta de infra de anexo no recrutamento (`parecer_selecao`
   não tem coluna de arquivo). Decisão de esquema/privacidade ainda aberta.
4. **Relatório dT por etapa** — sem decisão de esquema pendente (mediana, fechadas+abertas, agrupar
   por cargo). É só construir.

**#13 (follow-ups) — CONSTRUÍDO na onda 1.2:** (a) PATCH `/api/recrutamento/vagas/[id]` troca o
modelo congelado de vaga ABERTA com ZERO candidaturas (G1:a — reformulação não migra vaga; troca
manual), auditado; (b) reformular/aposentar modelo pela tela (molde clima 0075): versão nova com
`continua_de` na mesma transação que encerra a anterior; o GERAL reformula e a versão nova herda
`padrao=true` no mesmo ato (G2:a); o GERAL não se aposenta; histórico da série na tela de modelos;
(c) migration 0088: constraint trigger deferido torna o desenho (`rh.modelo_selecao_etapa`) de
modelo já congelado por vaga imutável no banco, ERRCODE 45004 — fecha o gap da revisão do
Estágio 2; (d) relatório dT por etapa: mediana (`percentile_cont`) dos intervalos consecutivos de
`movimentacao_candidatura.em`, por CARGO × ETAPA DO CATÁLOGO (nome), fechadas + abertas —
GET `/api/recrutamento/relatorio-etapas` + aba no painel. PENDENTE da frente: 13c Pesquisa social
(G3 decidida: GED + rs.gerir + trilha + expurgo 6 meses) — outra onda.

---

## 14 · Padrão Modelo — fatia CLIMA: qual universo de pergunta, antes de tudo

**Contexto e a ambiguidade central:** a linha da fatia (`docs/17:74` — "clima — perguntas: catálogo,
continuidade, regra de edição") **não diz de qual pergunta fala**, e existem DOIS universos separados
no schema `rh_clima`:
- **Check-in diário** (`rh_clima.pergunta_versao`, `0004:14-52`): pergunta standalone, **versionada**
  com vigência, respondida todo dia — mas **sem tela/rota/chave** para administrar (semeada na
  migration e nunca mais tocada). É o buraco literal que você registrou em `docs/16:400-415`.
- **Pesquisa estruturada** (`rh_clima.pergunta_pesquisa`, `0022:92-127`): tipos ricos (escala, NPS,
  texto, escolha), mas **zero reaproveitamento** — cada pesquisa digita as suas do zero.

Nenhum dos dois tem "catálogo reaproveitável" nem "continuidade entre edições". E você **já desenhou**
a continuidade + a regra de edição à mão, para o CHECK-IN, em `docs/16:417-464`.

### 14a · Qual universo é a fatia?

**Minha recomendação: comece SÓ pelo check-in diário.** É o buraco literal, o desenho já é seu, e o
custo é mínimo: uma coluna `continua_de` + relaxar um trigger + uma tela/rota/chave — **zero tabela
nova, zero migração de dado** (as 2 perguntas atuais ficam com o campo vazio, `docs/16:440`). A
pesquisa estruturada não está bloqueada por isto (o RH já monta cada pesquisa livremente hoje).

### 14b · A regra de edição — você já sentenciou; confirma?

Você escreveu (`docs/16:421-464`): o texto muda **enquanto não houver NENHUMA resposta** (substitui
"só em rascunho"); **reformular** = versão nova apontando para a anterior e encerra a anterior no
mesmo ato; **aposentar** = encerra sem continuidade; **assunto novo** = versão nova sem continuidade.

**Minha recomendação: adotar exatamente como você escreveu.** Uma regra só ("existe resposta?"), uma
coluna só (`continua_de BIGINT REFERENCES pergunta_versao(id) UNIQUE`, para a série não virar um Y).
Relaxar o trigger `pergunta_versao_proteger` (`0004:44`) de "rascunho" para "sem resposta".

### 14c · Quer um CATÁLOGO reaproveitável entre pesquisas (banco de perguntas)?

**Minha recomendação: NÃO fazer banco compartilhado agora.** A cadeia `continua_de` já dá a série e a
comparação entre edições, sem tabela nova. Um banco compartilhado convida o cruzamento que o
anonimato proíbe: uma pergunta reusada entre uma pesquisa **anônima** e uma **identificada** abriria
brecha de reidentificação. É o "bom que funciona" — e mantém o piso *k* intocado.

**Invariante que NÃO pode quebrar:** catálogo/continuidade vivem na camada de **definição** da
pergunta; a camada de **resposta** (onde o piso *k* de anonimato mora — `pesquisas/esquemas.ts:114-164`)
não muda. O *k* continua valendo **por edição, por recorte, por pergunta** — nunca diluído na série.

**Por que subo em vez de decidir:** 14a escolhe o escopo (check-in × pesquisa × os dois), que muda o
que se constrói; 14b/14c você já esboçou mas não confirmou como decisão fechada.

---

## 15 · Revisão geral 2026-08 — follow-ups não bloqueantes

A revisão geral multiagente (relatório em `docs/revisao-geral-2026-08.md`) achou 10 itens, todos
corrigidos e provados; a revisão adversarial DAS correções confirmou-as seguras e deixou estes
follow-ups (nenhum é regressão nem furo novo — são dívida conhecida / pré-existente):

1. **B3 — throttle dedicado de TOTP.** O rate-limit de login (0082) conta falha de SENHA; quem já tem
   a senha vazada martela o 2º fator (6 dígitos) sem freio — de propósito, para não trancar o dono da
   senha em TOTP pendente. Fechar com um throttle SEPARADO de TOTP por usuário (sem trancar a conta de
   senha). Eixo do 2º fator.
2. **B4 — centralizar o active-check nas rotas keyless de PÁGINA.** A reconferência de `usuario.ativo`
   ("revogou, acabou") foi aplicada às guardas keyless de API (`exigirSessao`, `exigirSessaoNotificacoes`,
   o guard do `beneficios`). As dezenas de `page.tsx` server-side escopadas só por sessão ainda não
   reconferem — o vazamento residual é do PRÓPRIO usuário desativado (dado de terceiro já fica fechado
   por `tem_permissao`). Vale um ponto único de guarda de página.
3. **Teste de integração para férias (B6/B8) — ✅ FECHADO (frente 1.7, 25/08/2026).** A régua pura
   saiu de `servico.ts` para `ferias/calculo.ts` (`periodosEsperados` + `periodosFaltantes`, molde
   pdi/calculo.ts, comportamento intacto) e ganhou `tests/ferias.test.ts` — 12 casos determinísticos,
   sem banco: admissão recente/futura, períodos contíguos, 29/02 dos dois lados, limite concessivo
   = fim + 12 meses (decisão da #3), vencido só depois do limite e idempotência por
   colaborador × início. A troca laço→lote ganhou `db/provas-ferias.js` (BEGIN/ROLLBACK,
   re-executável): lote num INSERT só, duplicata segurada por ON CONFLICT sem erro, RETURNING
   devolve SÓ o que criou (o contrato da auditoria) e a leitura é escopada aos ids pedidos.
4. **B2 — piso k por subjanela já FECHADO** nesta leva (`media_recente`/`media_anterior` viram null
   abaixo de k na subjanela). Registrado só para rastro.
5. **M1 — falha silenciosa no reload PÓS-AÇÃO** (baixa): um `recarregar()` que falhe com 5xx depois de
   já haver dados mantém os dados antigos sem avisar. Não é regressão (o estado anterior escondia o
   cartão inteiro); melhoria residual.
6. **B5 — CSP com `script-src 'unsafe-inline'`.** Sem infra de nonce, o CSP protege menos contra XSS do
   que um nonce-based protegeria (mitigado: cookie httpOnly, sem CDN externo). Dívida conhecida,
   documentada no próprio `next.config.ts`.

---

## 16 · Fatia Posse — follow-ups da revisão adversarial (não bloqueantes)

A revisão da fatia Posse (2026-08-20) confirmou permissões, append-only e a regressão zero no
desligamento. Itens 1–3 e a miudeza do `vinculo_atual` RESOLVIDOS em 2026-08-25 (frente 1.4):

1. **RESOLVIDO — Superfície do titular.** GET /api/posse/minhas (porta documento.ver, molde EPI)
   + cartão "Minha posse de patrimônio" no portal do colaborador, com o botão "Dar ciência";
   fetch tolerante, falha não derruba o portal.
2. **RESOLVIDO — Teste da regra crítica.** tests/posse.test.ts ganhou 6 testes de serviço com
   repositório dublê (costura DepsPosse): 404 a não-titular, categoria inativa recusada,
   duplo-clique 409 (pré-check, 23505 traduzido e projeção condicional).
3. **RESOLVIDO — Duplo clique na ciência.** Nos DOIS (posse e sst): violacaoUnica traduz o 23505
   de ciencia_documento_id_usuario_id_key em 409; marcarCiencia/marcarCienciaEntregaEpi viraram
   UPDATE condicional com RETURNING (0 linhas = 409).
4. **`fecharSuspensao` sem guarda própria** (sem `AND` de janela nem rowCount): inócuo enquanto só o
   hook chama na mesma transação; obrigatório quando existir UI de fechamento manual de suspensão.
5. **Miudezas restantes:** data de entrega futura aceita por POST direto (teto só no HTML —
   consistente com o disciplinar); `dada_em` de ciência já existente no GED devolve o relógio do
   app, não o real. (`colaboradorDoUsuario`→`vinculosDoUsuario` RESOLVIDO — paridade com o GED;
   a ciência e o "minhas" agora alcançam itens de vínculo anterior do mesmo grupo.)

---

## 17 · Motor de férias (1.6) — defaults conservadores que pedem confirmação (não bloqueantes)

A prévia de férias (calculo-ferias.ts + GET api/folha/ferias-previa) entrou com estes defaults,
todos explicados na memória de cálculo:

1. **Terço sobre o abono na MESMA rubrica 1401** (interpretação registrada na 0028). Se o DP quiser
   separar, é rubrica 1402 + ajuste de um bloco do motor.
2. **IRRF pela mecânica do mensal (completo × simplificado, vale o menor).** Férias têm tributação
   em separado na prática da RFB — confirmar com o contador se o desconto simplificado se aplica ao
   cálculo em separado; se não, o IRRF da prévia pode sair MENOR que o real.
3. **INSS/IRRF sobre a base de férias ISOLADA** (aviso explícito na saída). Na competência real, a
   base soma com o salário do mês — o 2º estágio (férias → competência) precisa recalcular, não
   somar prévias.
4. **Data de referência = INÍCIO DO GOZO** (art. 142 CLT: remuneração da data da concessão) para
   salário, dependentes, rubricas e tabelas.
5. **0136/0137 no catálogo com a flag do caso GOZADO** — docs/18 §5 dizia "não virar linha com flag
   fixa"; a resolução foi: a flag descreve o caso que incide e a exceção indenizatória é regra do
   MOTOR (modalidade). Confirmar com o dono.
6. **FGTS sobre férias gozadas ficou fora da prévia** (escopo 1.6 = INSS/IRRF); é devido e entra na
   integração com a competência.

---

## Fase 4 · Visibilidade em camadas (agente 1.1) — follow-ups não bloqueantes

- A2:a foi implementada no ponto único que a decisão nomeia (condicaoEscopo/resolverEscopo): ficha,
  lista, vínculos, linha do tempo, organograma e as leituras novas de salário/disciplinar viraram
  sub-árvore. Domínios com recorte PRÓPRIO de "liderados diretos" que NÃO passam por condicaoEscopo
  (ponto.ver.equipe, aprovações de demandas/admissão, portal do gestor) continuam em equipe direta —
  se a semântica única deve alcançá-los, é mudança nos domínios donos.
- Raça-cor individual mora em rh.pessoa.raca_cor; quando o painel executivo quiser o agregado,
  aplicar o mesmo piso k do gênero (nada foi mexido no painel nesta onda).
- resolverEscopo agora lê o quadro 1× por requisição de sessão-gestor para montar a sub-árvore em JS
  (custo desprezível no quadro atual; cachear por request se o quadro crescer muito).
- Crachá exibe telefone/e-mail corporativo (0085): fatias 3 e 4 se provam juntas, com as duas
  migrations aplicadas.

---

## Falhas de TOTP (0087) — sobras conscientes da frente 1.3

(a) A tela de administração de `sistema.parametro_seguranca` segue inexistente (precedente da 0082:
edita-se por SQL); com 4 parâmetros agora (rate-limit de senha + falhas de TOTP), a tela ganhou
justificativa.
(b) O enrolamento (`confirmarAtivacao2fa`) NÃO alimenta o contador: o secret ainda é pendente e quem
erra ali é o próprio usuário autenticado configurando o seu 2FA — não é sinal de ataque à conta.
Registrado para não parecer esquecimento.
(c) Replay de código TOTP (código certo já consumido) não conta como falha: o anti-replay da 0060
barra sozinho, e contá-lo baratearia a negação de serviço além do risco aceito na C1.
(d) Corrida teórica: dois gestores de usuários estourando a 5ª falha no MESMO instante podem, em
READ COMMITTED, desativar-se mutuamente (janela de milissegundos). Se algum dia preocupar, a saída é
`SELECT ... FOR UPDATE` dos detentores da chave na mesma transação.
(e) O bloqueio temporário do último gestor NÃO derruba as sessões vigentes dele — de propósito:
matar a sessão do único gestor entregaria ao atacante (que só tem a senha) a negação de serviço
total.

---

## Ciclo de ciência (0086 / frente 1.5) — follow-ups

- [ ] GATE da Onda 2: consumir pendenciaBloqueante(usuarioId) (src/dominios/documentos/servico.ts)
      ou GET /api/documentos/pendencias/minhas (payload {bloqueada, bloqueio}). O gate DEVE manter
      alcançáveis as rotas de regularização: /documentos, /api/documentos/** (download, ciencia,
      recusa, pendencias/minhas e o PATCH confirmar de ato-testemunhas), /api/notificacoes** e o
      logout — senão o bloqueado não consegue se regularizar (B4).
- [ ] Lembrete de prazo é MANUAL (botão no quadro do ciclo, rh.conduta.gerir) — o projeto não tem
      agendador. Se o dono quiser lembrete automático na véspera do prazo, precisa nascer um cron.
- [ ] Rastreio de rolagem em PDF usa altura estimada (contagem de páginas por heurística, folga 1,5).
      PDF muito fora do padrão pode ter o fim alcançável com folga sobrando (nunca travando o botão
      indevidamente para MENOS leitura visível — a folga só alonga a rolagem). Recomendação de uso:
      publicar o Código de Conduta em PDF simples ou texto (B5 já exige formato exibível; Word é
      recusado na publicação com exige_ciencia).
- [ ] Decisão tomada na frente (validar com o dono): chave rh.conduta.gerir (dp/diretoria) criada
      além da rh.conduta.liberar pedida — sem ela, "abrir ato" cairia em documento.enviar, que
      recrutador/lider_td também têm. Ajustável em /perfis.
- [ ] Decisão tomada na frente: prazo de admitido DEPOIS da publicação conta da criação do usuário
      (GREATEST(enviado_em, usuario.criado_em)) — recém-chegado não nasce com prazo vencido.

---

## 18 · Registros da revisão adversarial da Onda 1 (25/08/2026) — não corrigidos de propósito

Os ALTA/MEDIA objetivos foram corrigidos na própria onda (commits 3ecb83b..843fbb5). Ficam
registrados, com dono e desenho, os de política/raridade:

1. Bloqueio-por-ato × versão nova: publicar versão nova de política NÃO-bloqueante com ato
   lavrado dissolve o bloqueio sem o ato de liberação (o ato pertence à versão velha). Fechar
   exige decidir onde o estado de bloqueio mora (cadeia × versão). [MEDIA de desenho]
2. TOCTOU raro em darCiencia: pré-check de versão vigente fora da transação do INSERT — janela
   de milissegundos contra publicação simultânea de versão nova. Conserto: reconferir sucessor
   dentro da transação.
3. Catálogo de nível hierárquico não renomeia nem reordena (só cria/inativa) — eixo 9 pela
   metade; rotas PATCH de nome/ordem quando a tela precisar.
4. Paridade 16.5 no EPI: minhasEntregasEpi/darCienciaEntregaEpi seguem em vinculo_atual —
   entrega de vínculo anterior do grupo é invisível ao titular (a posse já migrou p/ pessoa).
5. Migration 0088: o comentário justifica o DEFERRABLE ao contrário (o adiamento BARRA o caso
   "modelo+etapas+vaga no mesmo commit", não o libera). A migration é imutável por hash — fica
   o registro; se um semear futuro criar modelo+vaga na mesma transação, usar SET CONSTRAINTS.
6. Ciclo A→B→A no organograma concede ao liderado a leitura do gestor via sub-árvore (erro de
   cadastro; mitigado por trilha). Guarda de ciclo no cadastro de relacao_gestor se preocupar.
7. Turnover do portal do gestor segue na relação DIRETA (conta histórica; sub-árvore de hoje
   zeraria o numerador) — "turnover por sub-árvore histórica" é decisão de produto.
8. Oráculo residual: 429 de TOTP bloqueado só é alcançável com senha certa (mitigado pelo
   rate-limit de senha também emitir 429).
9. Termo compartilhado por 2 itens de posse: cliques quase simultâneos podem dar 409 com texto
   impreciso no segundo item (autocura no clique seguinte).
10. paginas-pdf: PDF sem /Count legível assume 10 páginas — Código de Conduta deve ser PDF
    simples/texto (já registrado no follow-up da 1.5).
11. A2:a alcançou ficha/lista/ponto/portal-gestor; aprovações de demandas/admissão ainda têm
    recorte próprio de liderado direto — alinhar quando aquelas telas forem tocadas.
---

## 19 · Motor de 13º — os defaults conservadores que precisam de confirmação (DP/contador)

O motor de 13º (onda 2 da lane Folha — `src/dominios/folha/calculo-13.ts`, prévia em
`GET /api/folha/decimo-previa`) tomou quatro decisões pelo caminho conservador, cada uma com AVISO
explícito na saída. Nenhuma trava a prévia; todas merecem sentença do DP/contador antes de o 13º
virar folha de verdade (integrar competência 13o_1a/13o_2a):

1. **IRRF do 13º usa a mecânica completo × simplificado do mensal (vale o imposto MENOR).** O 13º
   tem tributação EXCLUSIVA na fonte (RIR/2018 art. 700) e o motor registra isso em aviso; o que é
   interpretação nossa é aplicar o DESCONTO SIMPLIFICADO também ao 13º. A IN RFB que criou o
   simplificado fala do cálculo mensal; aplicá-lo ao 13º beneficia o colaborador (imposto nunca
   maior que o regime completo). **Recomendação:** manter até o contador sentenciar — se a Fast
   (ou o eSocial) apurar só pelo completo, é tirar UMA linha da entrada.
   *Prós:* nunca desconta mais que o devido no regime completo; mesma mecânica já auditada do
   mensal. *Contras:* se a regra correta for só o completo, a prévia mostra IRRF menor que o real.

2. **Adiantamento deduzido na 2ª parcela é RECALCULADO (metade do 13º na data da 2ª parcela)**,
   a menos que o valor efetivamente pago venha na entrada (`adiantamento_pago_centavos`). Se o
   salário mudou entre 30/11 e 20/12, o recalculado diverge do pago. Quando a folha real de 13º
   existir, o certo é deduzir o PAGO (lido da 1ª parcela gravada). **Recomendação:** a integração
   com a competência 13o_2a deve ler o valor da 13o_1a — o parâmetro já existe para isso.

3. **Avos PROJETADOS até 31/12 nas duas parcelas** (vínculo assumido ativo o ano inteiro;
   desligamento é recusado — 13º de rescisão é do motor de rescisão, estágio 3). A alternativa
   (1ª parcela = metade dos avos ATÉ novembro) pagaria adiantamento menor a admitidos no 2º
   semestre. A prática comum de folha é a projeção. **Recomendação:** manter.

4. **Afastamento sem remuneração só reduz avos se vier como parâmetro** (`avos_afastamento`) — o
   sistema ainda não distingue afastamento COM e SEM remuneração para esse fim (serviço militar,
   licença não remunerada > 15 dias no mês etc.). Default: não reduz + aviso. Quando o módulo de
   afastamentos souber classificar, o serviço passa a preencher o parâmetro.

5. **Códigos das rubricas (migração 0094):** `0138` 13º Salário é o código REAL (docs/18 §2e);
   `1601` Adiantamento de 13º, `1602` Desconto do Adiantamento, `2003` INSS sobre 13º e `2004`
   IRRF sobre 13º são PLACEHOLDERS — a planilha do Diego cita "0024/0056 (INSS de 13º e férias)"
   sem dizer qual é qual, e o adiantamento fica num intervalo ("0008–0018"). A adoção dos códigos
   reais vai JUNTO dos importadores, com as demais duplicatas (docs/18 §2a, decisão do dono).


---

## 20 · Registros da revisão adversarial FINAL (Ondas 2–3 + lane Folha, 25/08/2026)

Os 6 ALTA e 13 MÉDIA foram corrigidos pela frota final (commits 47fbbe5..71ec836 + a costura
do contrato do recorte). Ficam registrados os de política/raridade/refinamento:

1. **13c — candidatos preteridos nunca expurgam:** ao aceitar a oferta a vaga FECHA e as demais
   candidaturas ficam `ativa` para sempre (vaga fechada não movimenta) → a retenção de 6 meses
   não as alcança. Saída recomendada: encerrar as candidaturas restantes como `reprovada` no
   mesmo ato do aceite (decisão de produto — muda o que o candidato "é" no funil).
2. **OLAC — espelho/lote sem o `tipo` da competência:** latente até existir competência
   13º/rescisão no mesmo ano/mês (o UNIQUE da 0013 já prevê); quando nascer, chavear
   espelho/lote/arquivo por tipo também.
3. **Rescisão — adiantamento de 13º informado pode dupla-contar 8% na base da multa** (o
   depósito do adiantamento tende a já estar no saldo externo). Refinar quando o adiantamento
   alimentar o motor a partir da 13o_1a gravada.
4. **D4 — a tela do disciplinar ainda não renderiza `aviso_recalculo`** (payload e trilha já o
   carregam) — follow-up de UI.
5. **`exigirSessaoRs` e `exigirSessaoNotificacoes` não reconferem `usuario.ativo`** — mesma
   cirurgia do A6/A7 quando essas superfícies forem tocadas.
6. **Bloqueado sem `documento.ver` dá ciência mas não BAIXA nem recusa o bloqueante** (a ciência
   dispensou a chave no A5; download/recusa a mantêm). Hoje todo perfil semeado tem a chave;
   se um dia /perfis separar, decidir se leitura do documento do ciclo também dispensa.
7. **Líquido negativo por acúmulo de descontos:** o teto do C2 cobre só a 1203; faltas
   1201/1202 + suspensão no mesmo mês ainda podem, em tese, negativar — teto global de
   descontos é decisão de folha (compensação em competências seguintes?), não trivial.
8. **Conta contábil:** a validação de interseção é de serviço; um `EXCLUDE` gist nas janelas
   seria cinto extra de banco (migration futura, baixo risco hoje).
9. **Acerto da rescisão × suspensão (D3):** a prévia AVISA (dias capados no término + DSR, ids)
   mas não desconta — quando a rescisão virar folha gravada, reusar o recorte + rubrica 1203
   capada no término; validar com o contador se o dia suspenso reduz o saldo 1701 ou sai como
   desconto 1203.
10. **AMBIENTE (não é código): um processo externo — provável antivírus — apaga
    `docs/05-pesquisa-mercado.md` do working tree repetidamente** (aconteceu em 3 worktrees e no
    repo principal, com temporários `docs/unp*.tmp`). Os commits estão íntegros; restaurar com
    `git checkout -- docs/05-pesquisa-mercado.md` quando sumir, e investigar exclusão do AV
    para a pasta do projeto.
