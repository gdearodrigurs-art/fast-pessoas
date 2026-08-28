# Revisão geral — Fast Pessoas

## 1. Resumo executivo

A base está sólida. Das 8 lentes, **3 fecharam sem nenhum achado vivo** (Integridade sistêmica, Dinheiro & tempo trabalhado, Vigência & tempo civil) e o que sobrou em Pragmatismo e Frota é performance/estilo, não correção. **Nenhum achado ALTO.** Sobreviveram à refutação adversarial **10 itens**: 2 MÉDIA, 2 MÉDIA-BAIXA e 6 BAIXA. Vários candidatos caíram exatamente porque o sistema já tinha uma rede de segunda ordem (pendência de ponto, funil de UPDATE condicional sob FOR UPDATE, guarda de admissão que impede duplo vínculo, seed que espelha as duas chaves disciplinares) — sinal de que os invariantes que importam estão de fato defendidos.

O tema recorrente mais forte é **inconsistência entre telas que fazem o mesmo ato**: uma trata o dado com rigor, a irmã não. O segundo tema é **lacuna de trilha de leitura sensível (eixo 8)**: caminhos que devolvem dado clínico ou salário sem gravar `leitura_sensivel`, embora o módulo irmão já faça certo. O terceiro é **endurecimento de segurança ausente** (rate-limit, revogação de sessão, cabeçalhos) — dívida conhecida, não furo aberto.

Os **3 riscos que eu corrigiria primeiro**:
1. **Cartão Disciplinar somindo em erro de rede** (falso negativo silencioso que faz o DP ler "ficha limpa").
2. **Remover dependente sem confirmação no portal** (clique único que recalcula folha em silêncio).
3. **Nome próprio vazando para a IA externa no PDI** (derrota a própria garantia de anonimização, sem bloqueio no caminho).

---

## 2. Achados por gravidade

### ALTA
Nenhum. Nenhuma lente produziu achado ALTO após a refutação.

---

### MÉDIA

**M1. Cartão Disciplinar desaparece em qualquer 5xx/rede, não só no 403**
`src/.../ficha-colaborador.tsx:181-188` e `:200-207` (render aborta em `:256`) — Eixo 8 · Lente Operador.
Tanto o `useEffect` quanto o `recarregar` fazem `if (!resposta.ok) setVisivel(false)` e `catch { setVisivel(false) }`. Como o componente só é montado sob `permissoes.podeVerDisciplinar` (gate de servidor, `:2048`), o caminho do 403 é praticamente morto — quem tem a chave e vê o cartão só o perde por **erro transitório** (5xx/timeout/queda). Aí o sumiço é sempre falso negativo, nunca ausência legítima.
**Cenário:** DP com a chave abre a ficha durante instabilidade do banco → cartão não renderiza → lê "ficha limpa" → não escalona alguém que tinha duas advertências.
**Ação:** distinguir 403 (esconder) de erro transitório (mostrar estado de erro + "tentar novamente"), como o wizard de desligamento já faz. Nunca colapsar falha de rede em ausência de dado.

**M2. Remover dependente é um clique sem confirmação no portal — o DP confirma o mesmo ato**
`src/.../portal-colaborador.tsx:533-552` e `:592` — Eixo 5 · Lente Operador.
O botão chama `remover(dependente.id)` no `onClick` e o DELETE dispara direto, sem `window.confirm`. No painel do DP, o mesmíssimo dado passa por `beneficios/painel-beneficios.tsx:1693-1697` (`window.confirm("Remover o dependente {nome}?")`).
**Cenário:** colaborador leigo erra o clique → dependente apagado → folha do mês recalcula IRRF/benefícios estendidos sem ele, sem ninguém ligar causa e efeito. Reversível via "+ Acrescentar dependente", mas o recálculo silencioso já ocorreu.
**Ação:** padronizar por cima do exemplar melhor (o do DP) — adicionar confirmação nomeada no portal.

---

### MÉDIA-BAIXA

**MB1. Nome próprio vaza para a IA externa no PDI; o guard de última linha ignora nomes**
`src/lib/desidentificar.ts:49-65` + `src/dominios/pdi/servico.ts:182-205` — Eixo 8 / LGPD art. 11 · Lente Privacidade.
`limparContextoLivre` redige CPF/e-mail/telefone mas para nomes só empurra `avisos` (não remove); `contemPiiObvio` (`:61-65`) nem checa nomes. Geração é em uma passada: `painel-pdi.tsx:357` manda o contexto, `servico.ts:191` só barra PII óbvia, `:201` chama o processador externo. Não há confirmação humana antes do envio — os `avisos` voltam **depois** de gerado. "Falar com João" (nome isolado) nem casa com `RE_NOME` (exige 2+ maiúsculas): passa sem nem um aviso. Isso derrota a garantia de anonimização (`avaliacaoAnonima` + desidentificar existem para a IA nunca saber QUEM).
**Ação:** bloquear o envio (não só avisar) quando houver nome detectado, ou inserir a etapa de confirmação humana que o cabeçalho promete mas não existe no caminho. Reduzir gravidade só remove poder de reidentificação; o furo é a **ausência total de bloqueio**.

**MB2. Trilha de leitura de saúde presa ao cifrado, não ao dado devolvido**
`src/dominios/afastamentos/servico.ts:114-129` — Eixo 8 · Lente Privacidade.
`idsComDetalhe` filtra `dados_saude_cifrados !== null` e só grava `audit.leitura_sensivel` para esses. Mas o payload devolve o `tipo` específico de **todo** afastamento (`:102-103`), e `esquemas.ts:26-30` diz que "o tipo já conta a condição de saúde" (por isso a visão genérica esconde tudo atrás de `ROTULO_GENERICO`). Um `acidente_trabalho` sem texto livre (`cifrado = null`) é devolvido com rótulo revelador **e não gera nenhuma linha de leitura sensível**.
**Cenário:** leitor autorizado (`afastamento.saude.ver`) lê a condição clínica sem deixar rastro de auditoria. É o mesmo furo que o SST já fechou (`sst/servico.ts:191-208`: "um registro por ASO devolvido, não só os cifrados").
**Ação:** gravar `leitura_sensivel` por afastamento **devolvido com tipo clínico**, não por existência do cifrado — espelhar a régua do SST.

---

### BAIXA

**B1. Cartão pós-decisão de movimentação redevolve salário sem gravar leitura sensível**
`src/dominios/demandas/servico.ts:1665-1688` (`filtrarSensiveis(..., false)` em `:1685`; o detalhe usa `true` em `:494`) — Eixo 8 · Lente Privacidade.
Um aprovador com `rh.posicao.ver` que faz POST direto ao endpoint de decisão recebe `salario_proposto`/`faixa_min`/`faixa_max` no cartão de resposta sem rastro em `leitura_sensivel` nem em `audit.alteracao`. No fluxo normal de UI, o carregamento prévio do detalhe (`:494`) já logou; a lacuna é o atalho por POST.
**Ação:** passar `registrarLeitura = true` (ou equivalente) no cartão pós-decisão quando o salário é devolvido.

**B2. Agregados de clima por dia/pergunta/geral sem piso k de respondentes**
`src/dominios/clima/repositorio.ts:142-201` (consumo em `servico.ts:216-251`) — Eixo 8 · Lente Privacidade.
Só `agregadoPorUnidade` tem `HAVING COUNT(DISTINCT pessoa_id) >= minimoRespondentes` (`:271`). `agregadoPorDia`, `agregadoPorPergunta` e `agregadoGeral` retornam `AVG`+`COUNT` sem piso. Num dia de baixa adesão empresa-inteira, o gráfico pode publicar `respostas: 1, media: <nota exata da pessoa>`. Não expõe autor nem comentário; reidentificação exige saber quem respondeu naquele dia.
**Ação:** aplicar o mesmo piso k aos quatro agregados, não só ao por unidade.

**B3. Login sem rate-limiting nem lockout**
`src/app/api/identidade/entrar/route.ts` + `src/dominios/identidade/servico.ts:90` — Lente Segurança.
Não há contador por e-mail nem por IP; a porta aceita tentativas ilimitadas. Raio contido: conta comum cai em alcance `"proprio"` e todo perfil privilegiado exige TOTP no login (`servico.ts:116-138`). Risco residual real: credential-stuffing contra contas comuns e **exaustão de CPU** (cada tentativa paga bcrypt custo 12 → vetor de DoS). Já é dívida consciente (task FA-5 "provar enrolamento sem lockout").
**Ação:** rate-limit por IP + backoff/lockout por e-mail. Barato e fecha o vetor de DoS.

**B4. Sessão não revogada na desativação; token de 8h**
`src/lib/sessao.ts:82-95` (`DURACAO_SEGUNDOS` em `:10`) + `src/proxy.ts:44` — Lente Segurança.
`exigirSessaoValida` valida só o payload do JWT, nunca relê `usuario.ativo`. Desativado às 9h com o cookie segue servido até o token expirar. Dano mínimo: `tem_permissao` já exclui a linha (`AND u.ativo`), rebaixando a `alcance:"proprio"`, e toda mutação passa por `exigirUsuarioAtivo` (401). Janela = auto-leitura da própria ficha por até 8h.
**Ação:** reconferir `ativo` no banco na validação da sessão, ou encurtar o token. Viola "revogou, acabou".

**B5. Sem cabeçalhos de segurança globais (CSP, X-Frame-Options/frame-ancestors, HSTS, X-Content-Type-Options)**
`next.config.ts` (só `serverExternalPackages`, sem `headers()`) — Lente Segurança.
Telas autenticadas são embutíveis em iframe (clickjacking) e não há CSP para conter XSS. Mitigado: cookie de sessão é `httpOnly` (`sessao.ts:39`), então XSS não rouba o token; mesma-origem padrão do Next limita o alcance. Só há `nosniff` local na rota de download (`documentos/[id]/download/route.ts:32`).
**Ação:** adicionar bloco `headers()` global com CSP, `frame-ancestors 'none'`, HSTS e `nosniff`. Defesa-em-camada barata.

**B6. GET de admin de /férias faz varredura integral de `periodo_aquisitivo` por carga**
`src/dominios/ferias/servico.ts:416-440` + `repositorio.ts:147-158` — Eixo 7 · Lente Frota.
`garantirPeriodos` chama `listarIniciosExistentes()` **incondicionalmente** (antes do gate de `:195`), e essa função faz `SELECT colaborador_id, inicio FROM rh.periodo_aquisitivo` **sem WHERE** — tabela inteira num `Set` a cada abertura de admin, mais `listarColaboradoresNaoDesligados()` da empresa toda. Cresce ~1 linha por colaborador por ano de casa e é pago em todo GET. (A corrida que sugeriria MÉDIA **não** se sustenta: gates de `:195`, `existePeriodoParaVencer` e `FOR UPDATE` sob READ COMMITTED auto-curam após o primeiro commit.)
**Ação:** escopar `WHERE colaborador_id = ANY($1)` aos colaboradores em questão. Correção pura de performance.

**B7. Cálculo de folha insere linha a linha sob o FOR UPDATE da competência**
`src/dominios/folha/servico.ts:1020-1061` (lock em `repositorio.ts:136`) — performance · Lente Frota.
Laço N×M (`inserirFolhaColaborador` + `inserirItemCalculo` por rubrica) dentro da transação que segura o `FOR UPDATE OF c`. Não é corrida (apaga-e-regrava, idempotente); é janela de lock longa em folha grande.
**Ação:** trocar por `INSERT ... SELECT unnest(...)` em lote. Marginal, tolerável (ato explícito, não tela de leitura).

**B8. Materialização de períodos aquisitivos em laço de INSERT**
`src/dominios/ferias/servico.ts:187-205` (`ON CONFLICT DO NOTHING` em `repositorio.ts:175`) — performance · Lente Frota.
Mesmo caminho do B6, o mais fraco dos três. N+1 de escrita só na primeira materialização de empresa grande; custo único que some depois. Correto sob corrida.
**Ação:** opcional; agrupar num único INSERT em lote se/quando o B6 for tocado.

---

## 3. Temas sistêmicos

**T1 — Inconsistência entre telas que fazem o mesmo ato (o padrão mais recorrente).**
Aparece em M1 (o cartão Disciplinar esconde-se por erro de rede, enquanto o bloco de salário só se esconde por permissão calculada no servidor) e em M2 (remover dependente confirma no DP, `painel-beneficios.tsx:1693`, e não confirma no portal, `portal-colaborador.tsx:592`). Em ambos, **o exemplar melhor já existe na casa** — a correção é padronizar por cima dele, não inventar comportamento novo. Vale uma varredura transversal por pares de telas que tocam o mesmo dado (esconder por permissão vs. por erro; confirmar destrutivo em uma tela e não na irmã).

**T2 — Trilha de leitura sensível amarrada ao artefato errado (eixo 8).**
MB2 (afastamentos loga por cifrado, não por tipo clínico devolvido) e B1 (cartão de decisão devolve salário sem `leitura_sensivel`). O módulo SST já resolveu essa exata classe (`sst/servico.ts:191-208`: "um registro por dado devolvido, não só os cifrados"). A régua correta — **logar leitura pelo que foi entregue ao usuário, não pela forma de armazenamento** — deveria ser auditada em todos os caminhos que devolvem dado de eixo 8 (saúde, salário, disciplinar). Correção transversal com um exemplar de referência claro.

**T3 — Endurecimento de segurança de plataforma ausente, mas conhecido.**
B3, B4, B5 são todos hardening (rate-limit, revogação de sessão, cabeçalhos globais), nenhum ALTO, todos baratos. O eixo do token está fechado (`httpOnly`, HS256 fixado, `SESSAO_SEGREDO` falha fechado, 2FA derivado de chave sensível). Recomenda-se tratá-los como um lote único de endurecimento, não como bugs isolados.

**T4 — N+1 / full-scan em caminhos de leitura de RH (performance, não correção).**
B6/B7/B8 concentram-se em férias e folha. São escaláveis com `ANY($1)` e INSERT em lote. Nenhum é corrida — os invariantes de concorrência estão defendidos por `FOR UPDATE` + UPDATE condicional.

---

## 4. Cobertura (o que foi varrido e considerado LIMPO)

- **Integridade sistêmica — LIMPA.** Verificados e refutados: Posse (0081) é schema-only mas a devolução do desligamento já é conferida por `rh.item_devolucao` (`desligamento/repositorio.ts:473-535`, catálogo `rh.categoria_devolucao` 0054); estados da folha travados pelo funil `calcularCompetencia` (`servico.ts:948-970`) com `FOR UPDATE` + UPDATE condicional; diversidade conta por vínculo mas `recusarPorVinculoEmPe` (`servico.ts:498` e `:660`) impede duplo vínculo ativo. Invariantes mantidos.
- **Dinheiro & tempo trabalhado — LIMPA.** `minutosParaHoras` (`folha/servico.ts:667`) e o truncamento de segundos em `ponto/repositorio.ts:638-639` são tradeoffs deliberados e documentados; memória, banco e holerite fecham entre si. Nenhum valor que não feche.
- **Vigência & tempo civil — LIMPA.** Os ~10 serviços que calculam "hoje" usam `timeZone:"America/Sao_Paulo"` explícito (imunes ao fuso do processo); contagens de estrutura sem recorte de vigência (`estrutura/repositorio.ts:60,240`) são só exibição e corretas para bloquear hard-delete; o desligamento fecha a liderança e os leitores relevantes já filtram por data/status. Nenhuma data/decisão errada disparável.
- **Pragmatismo — LIMPA.** `adicionarAnos` sem trava de 29/02 (`ferias/servico.ts:111-115`) é defensável (períodos contíguos por construção, `:157`/`:165`); INSS depende de invariantes garantidos pelo `superRefine` do zod (`esquemas.ts:364-382`). Nenhum bug ativo.
- **Segurança — eixos centrais LIMPOS.** JWT fixado em HS256 (proxy + sessao), `SESSAO_SEGREDO` falha fechado, decisão de acesso por `tem_permissao` com `u.ativo`, 2FA obrigatório derivado de chave sensível. Só sobraram os 3 itens de hardening.
- **Frota — correção LIMPA.** Nenhum bug de correção; só performance. Concorrência de férias defendida pelos gates de `:195`, `existePeriodoParaVencer` e `FOR UPDATE`.
- **Privacidade — disciplinar LIMPO.** As chaves `rh.ocorrencia.restrita.ver` e `rh.disciplinar.ver` são espelhadas por seed na mesma dupla (dp, diretoria) em `0002:279-280` e `0080:154-155`, com guard de migration (`0080:175-176`). Eco neutro sem conteúdo é decisão de design documentada.

---

## 5. Lacunas da revisão (merecem segunda passada)

- **Fluxo de admissão/rescisão end-to-end sob carga real.** A integridade foi verificada por leitura estática dos guards; não houve teste de concorrência real (duas admissões simultâneas da mesma pessoa, virada de competência com N sessões). Os guards parecem corretos, mas o comportamento sob contenção verdadeira não foi exercido.
- **Superfície completa de trilha de eixo 8.** T2 foi confirmado em dois módulos (afastamentos, demandas) e um irmão correto (SST). Não foi feito um inventário exaustivo de **todos** os endpoints que devolvem dado sensível para checar se cada um grava `leitura_sensivel` pelo dado devolvido. Vale um grep dirigido por `leitura_sensivel` cruzado com os payloads que carregam salário/saúde/disciplinar.
- **Rotas POST diretas (fora do fluxo de UI).** B1 apareceu justamente no atalho por POST direto ao endpoint de decisão. Outros endpoints podem ter a mesma assimetria (a UI carrega o detalhe e loga; o POST direto pula). Não foi varrido sistematicamente.
- **Detecção de nomes no desidentificador.** MB1 mostra que `RE_NOME` (2+ maiúsculas) deixa passar nome isolado e não bloqueia o envio. A robustez do redator de PII para outros formatos (nomes com uma palavra, apelidos, iniciais) não foi estressada.
- **Cabeçalhos e CSP em produção.** B5 foi verificado no código (`next.config.ts` sem `headers()`, sem `vercel.json`), mas não se confirmou o que o proxy/hosting de produção injeta por fora. Vale checar a resposta HTTP real antes de assumir ausência total.
- **Front-end além das duas telas do tema T1.** O padrão "esconder por erro vs. por permissão" e "confirmar destrutivo assimétrico" foi confirmado em 2 pares; provavelmente há mais pares não amostrados.