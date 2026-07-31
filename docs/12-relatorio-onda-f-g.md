# Relatório da onda F/G — ponto, banco de horas e correções

> Período: **30/07/2026 13h39 → 31/07/2026 08h40** (com pausas).
> Estado ao fim: código limpo, **não commitado**. `tsc` sem erros, 43 migrations aplicadas, disco e banco em sincronia.

---

## 1. O que foi construído

### Onda F — Ponto e banco de horas (prioridade nº 1 da diretoria)

Módulo novo e completo, do banco à tela. É o maior domínio do sistema.

| Camada | Entrega |
|---|---|
| **Fundação** | Jornadas e escalas versionadas com vigência (5x2, 6x1, 12x36, escala livre), feriados, marcação append-only com origem declarada, importador de CSV do relógio |
| **Motor** | Apuração em minutos inteiros: horas extras por faixa, adicional noturno com **hora reduzida do art. 73 §1º**, faltas, atrasos, DSR, tolerância por marcação |
| **Banco de horas** | Parametrização em três níveis (empresa → unidade/cargo → pessoa), estorno na reapuração, teto e piso, expiração, prazo de compensação e tratamento na rescisão |
| **Intercorrências** | Detecção de entrada sem saída, intervalo incompleto, dia sem marcação e fora da tolerância; correção pelo DP **gravando marcação nova**, nunca editando a anterior; fila com contador real |
| **Visibilidade** | Portal do colaborador (saldo, **média de HE por dia**, **total do último mês**, espelho), portal do gestor (banco de horas do time), bloco na ficha, telas próprias e indicadores |
| **Ligação com a folha** | O que a apuração mediu vira variável da competência **sem redigitação**; reimportar não duplica; competência fechada recusa |

### Onda G — Seis correções vistas ao vivo na reunião

1. Avaliação: tela explicada para quem não é avaliador, e as perguntas do pilar de valores corrigidas
2. Alerta de contrato de experiência com link direto para o ciclo
3. **Trava de competência retroativa** — apresentada como pronta na demo, não existia
4. Rubricas: criar, versionar e encerrar, mais as seis nomeadas pela diretoria
5. NR-1 como avaliação psicossocial acoplada ao ASO
6. Organograma em árvore vertical

---

## 2. O que a verificação encontrou

Nada disto apareceu na construção. Todos vieram da conferência independente, e todos passavam no build.

| Defeito | Prova |
|---|---|
| **Hora noturna reduzida não existia** | A folha recebia **1.050 h** onde a lei manda **1.200 h**. 150 horas de adicional em um mês, 10 plantonistas |
| **Divisor 220 chumbado** | Cobrava de todos a jornada de 44 h. Quem faz 36 h recebia a menos: **R$ 1.708,25 por mês** nos 10 plantonistas |
| **2FA decidido por nome de papel** | Um administrador podia, pela tela de perfis, dar acesso a 70 fichas a um perfil que entra só com senha. Reproduzido com HTTP 200 |
| **Escopo decidido por nome de papel** | Uma caixa marcada levava de **1 para 70** colaboradores visíveis, sem nenhuma chave dizer "empresa inteira" |
| **Dupla abertura inventava hora extra** | 72 min por dia, com o intervalo inteiro contado como trabalho, e o dia passava sem levantar a mão |
| **Divisor 6 do DSR** | Descontava 7h20 de quem tem dia de 8h48 — sempre a favor da empresa |
| **Dia de repouso fixo em domingo** | Quem folga na terça recebia o domingo como 100% e a folga real como 50%, invertido nos dois sentidos |
| **Trilha de auditoria com três buracos** | Extrato do banco de horas e resumo de equipe liam dado de terceiro sem deixar rastro; a chave gravada mentia sobre qual permissão autorizou |
| **Intercorrência fechada sem correção** | "Corrigida" era aceita sem marcação nova e sem observação: o fato continuava real e sumia da fila |
| **Reapuração apagava a fila com DELETE** | O que foi resolvido sumia sem rastro, e o que continuava aberto trocava de id — o DP clicava e recebia 404 |
| **Apuração em 340 s** | Medido: 99,6% do tempo esperando o banco, 951 idas. Não era índice, era latência de link |
| **Piso de anonimato chumbado** | O `k` da supressão de recorte pequeno era constante no código, e a política valia pela metade — não alcançava clima nem pesquisas |

**Todos corrigidos e reverificados**, com recontagem independente à mão.

---

## 3. Como foi verificado

- **Recontagem independente do motor**: 20 casos calculados à mão, mais um recálculo escrito do zero, sem importar o motor, reproduzindo 10 plantonistas em 300 dias sem uma diferença
- **Camada adversarial**: cada achado passou por um cético cujo trabalho era derrubá-lo. Cinco de dezesseis morreram
- **Bateria de casos versionada no banco**, com sabotagem proposital para provar que o alarme toca e aponta o caso certo
- **Ataque ao 2FA por sete vetores**, incluindo o CVE-2025-29927 do Next.js em oito variantes
- **Prova de que nada mudou para quem já existe**: 44 h idêntico em centavos (52 pessoas), 7 personas com o mesmo fluxo de login, 63 usuários com o mesmo alcance

---

## 4. Números

| | |
|---|---|
| Linhas do projeto | 112.378 → **122.931** |
| Migrations | 30 → **43** |
| Arquivos alterados ou novos | **93** |
| Domínios | 21 → **22** (ponto) |
| Apuração da competência | 340 s → **~52 s** |

---

## 5. Pendências conhecidas

1. **700 pessoas ainda não fecham em tempo útil** na apuração. A causa medida é o tráfego da coluna `memoria` (62,4 kB por pessoa) sobre um link de 0,12–0,20 MB/s. Caminho proposto: processamento em lote assíncrono com acompanhamento na tela
2. **Falha de uma pessoa derruba a competência inteira** — a transação é atômica, o que é correto, mas o DP precisa saber de quem foi
3. **A conta `admin` (do dono) exige 2FA e não tem segredo cadastrado** — cai no fluxo de configuração no próximo login. Pré-existente
4. Detecção de "dia sem marcação" em escala depende de `ancora_escala` preenchida — obrigatória na carga real
5. Falta a lista completa de rubricas e o layout dos importadores (com o Diego)

---

## 6. Próximo passo

Commit desta onda e início da **Onda I** — registro, lotação, centro de custo e a separação entre **pessoa** e **vínculo**. É a mais pesada que resta, e cada onda construída antes dela aumenta o custo de fazê-la.

A decisão do salário foi fechada em 31/07: **cada um vê a sua sub-árvore no organograma, recursiva, e nada fora do ramo**. Isso destrava a Onda K.
