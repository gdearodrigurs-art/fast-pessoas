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

---

## 2 · O saldo de banco de horas transfere para o vínculo novo?

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
