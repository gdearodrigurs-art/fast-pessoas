# Prova ponta a ponta da onda I — resgatada do git

## De onde isto veio

Estes três arquivos rodaram de verdade em 31/07/2026 e provaram a onda I:

> 91/91 telas e 45/45 chamadas de API sem um 5xx · zero órfão nas 45 chaves estrangeiras

Depois foram **apagados**. Moravam em `fast-pessoas/.tmp-i3/`, o agente que os escreveu tratou a pasta
como temporária, e a limpeza do commit `ca8189d` levou os três junto com o lixo de verdade.

Durante um dia a única evidência de que a onda I foi provada era **a frase acima, dentro de uma
mensagem de commit** — que não se re-roda, não se confere e não acusa regressão nenhuma.

Resgatados em 01/08/2026 com `git show ca8189d^:fast-pessoas/.tmp-i3/<arquivo>`.

## O que cada um faz

| | |
|---|---|
| `prova-i3.js` | transferência entre empresas ponta a ponta: entra com as personas, executa o ato pela API, confere o banco |
| `telas.js` | percorre as telas com cada persona procurando 5xx |
| `relatorio.js` | consolida a saída dos dois |

## O que falta para eles serem prova de verdade

Hoje **não rodam sozinhos**. Antes de virarem parte do portão:

1. **Caminho absoluto chumbado** — `prova-i3.js` tem `cwd: 'C:/sistema RH/fast-pessoas'` escrito no
   código. Na máquina do Diego não roda.
2. **Dependem do servidor na 3001 já no ar** e do semeador já executado. Nada aqui sobe nem confere isso.
3. **Senha de demonstração no fonte.** Aceitável enquanto o banco só tem dado fictício; deixa de ser no
   dia em que houver gente real.
4. **Não têm veredito de máquina** — imprimem para humano ler, não saem com código 1 quando falham.

Enquanto os quatro pontos não forem resolvidos, isto é **evidência arquivada**, não portão.

## A lição, que vale mais que o código

Prova que mora em arquivo temporário não é prova. É o mesmo defeito que os 195 relatórios de agente
guardados num `journal.jsonl` de pasta de sessão — registrado no ponto 4 do arnês
([docs/13](../../../docs/13-arnes-do-projeto.md)), escrito no mesmo dia em que este erro foi descoberto.
