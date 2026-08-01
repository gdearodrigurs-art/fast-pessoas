// db/comparar-personas.js — a mesma rota, olhos diferentes.
//
// Substitui o comparador de payload que cada verificação de acesso reescrevia. Uma delas
// foi feita à mão em 16 rotas, uma a uma, e é a lente que mais rendeu neste projeto: uma
// caixa marcada levando de 1 para 70 colaboradores, ficha vazando o vínculo que a
// autorização bloqueia, gestor de outro CNPJ enxergando demanda que não é dele. Todos
// esses apareceram do mesmo jeito — duas colunas lado a lado e um número que salta.
//
// ------------------------------------------------------- o que ela olha
//
// Três coisas, nesta ordem de importância:
//   1. o DIFF de IDs   — quem vê 71 e quem vê 1 tem que saltar aos olhos
//   2. o DIFF de chaves — campo que aparece para uma persona e não para outra, e campo
//                         que aparece para todas mas vem NULO só para algumas (mascarado)
//   3. a tabela         — persona × HTTP × itens × bytes, o resumo que se lê de relance
//
// ------------------------------------------------------- os dois perigos
//
//   (a) mesmo escopo, IDs diferentes — alguém enxerga o que o par não enxerga
//   (b) escopos diferentes, IDs IDÊNTICOS — o silencioso, e o pior: quase sempre quer
//       dizer que o filtro não está sendo aplicado e todo mundo está lendo a tabela toda
//
// "Escopo" aqui é papel + as empresas dos vínculos abertos, lido do resumo que o
// db/logar-como.js imprime. É HEURÍSTICA, e a saída diz isso na cara: papel cujo alcance
// é a própria equipe (gestor) ou a própria ficha (funcionário) diverge de propósito
// dentro do mesmo papel, e aí (a) é o esperado, não o defeito.
//
// Só um caso sai com código 1: empresas DISJUNTAS enxergando exatamente os mesmos IDs.
// Esse não tem explicação inocente — é vazamento entre CNPJs, e é a classe de defeito
// mais cara já encontrada aqui.
//
// ------------------------------------------------------- o que ela NÃO faz
//
// Não monta sessão. Chama o db/logar-como.js como subprocesso, uma vez por persona, e usa
// o cookie que ele imprime. Ele não exporta nada (termina em `main().catch(morrer)`), e
// reimplementar a montagem seria criar a segunda cópia da decisão de 2FA que ele existe
// para evitar. Consequência herdada: o TOTP é pulado, então achado sobre segundo fator
// não se prova aqui — e persona obrigada a 2FA sem TOTP responde 403 em toda rota de
// negócio, que é o app funcionando, não a ferramenta falhando.
//
// Não abre banco: nenhuma consulta é feita daqui. O que precisa do banco (quem existe,
// qual papel, qual empresa) vem do logar-como.js, que já lê tudo isso. Duas leituras da
// mesma coisa divergem sem ninguém perceber.
//
// Uso:
//   node --env-file=.env.local-db db/comparar-personas.js /api/colaboradores --banco fast_pessoas_dev
//   node --env-file=.env.local-db db/comparar-personas.js /api/folha/1 dp@fastdemo.local gestor@fastdemo.local --banco fast_pessoas_dev
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const {
  lerArgumentos,
  resolverConexao,
  exigirLocal,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const executar = promisify(execFile);

const LOGAR_COMO = path.join(__dirname, 'logar-como.js');

// A vaga única de servidor do ponto 2 do arnês: db/servidor.js na 3001, lendo o mesmo
// .env.local-db — e portanto o mesmo SESSAO_SEGREDO que assina o cookie.
const BASE_PADRAO = 'http://localhost:3001';
const COMO_SUBIR = 'npm run dev:local';

const TEMPO_LIMITE = 30000;
// Quantas personas em voo ao mesmo tempo. Cada uma custa um processo node + uma conexão
// de banco; 71 de uma vez derruba o pool do servidor e a medida vira medida do pool.
const EM_VOO = 4;
// Fundo do payload que ainda vira caminho de chave, e quantos itens do array são
// amostrados. Payload de folha aninha fundo, e caminho de nível 8 não decide nada.
const PROFUNDIDADE_MAX = 6;
const AMOSTRA_ARRAY = 40;
const IDS_MOSTRADOS = 8;
// Tetos de linha. Uma bancada com 63 personas produz saída que não cabe na tela, e o
// achado desta ferramenta é sempre uma comparação — comparação que rola para fora da
// tela não é lida. O --json e o --ids continuam trazendo tudo.
const TETO_LINHAS = 15;
const LINHAS_POR_GRUPO = 6;
// Nome do caminho quando o próprio payload é um array.
const RAIZ_COLECAO = '(raiz)';

const AJUDA = `
db/comparar-personas.js — chama a MESMA rota com cada persona e mostra o que muda.

  node --env-file=<ambiente> db/comparar-personas.js <rota> [persona…] --banco <nome>

Sem persona na linha de comando, usa TODAS as ativas que o --listar do logar-como.js
devolver (as inativas ficam de fora: o app não as deixa entrar, e a fábrica de sessão
também não).

Bandeiras:
  --banco <nome>   obrigatório, sem padrão — a ferramenta nunca escolhe banco
  --url <base>     servidor alvo (padrão ${BASE_PADRAO})
  --limite <n>     no máximo n personas (0 = todas, que é o padrão)
  --colecao <nome> qual lista do payload comparar; aceita caminho ("fila.demandas")
  --ids            lista os IDs inteiros em vez dos ${IDS_MOSTRADOS} primeiros
  --json           saída de máquina; a tabela e o diff vão para o erro padrão

Exemplos reais:
  node --env-file=.env.local-db db/comparar-personas.js /api/colaboradores --banco fast_pessoas_dev
  node --env-file=.env.local-db db/comparar-personas.js /api/folha/1 dp@fastdemo.local gestor@fastdemo.local --banco fast_pessoas_dev
  node --env-file=.env.local-db db/comparar-personas.js /api/folha/1 --colecao folhas --banco fast_pessoas_dev

A rota vem ANTES das bandeiras. A primeira linha da tabela é sempre "(sem cookie)": é o
controle, e rota de API sem sessão tem que dar 401.

No Git Bash do Windows, ponha MSYS_NO_PATHCONV=1 na frente: sem isso "/api/x" chega
convertido em "C:/Program Files/Git/api/x".

A lista comparada é UMA, a mesma para todas as personas: a que mais separa umas das
outras. Catálogo do sistema (tipos, cargos, rubricas) é igual para todo mundo e por isso
perde. A linha "coleção" diz qual foi e quais eram as outras; --colecao troca.

Sai 1 quando duas personas de empresas DISJUNTAS enxergam exatamente os mesmos IDs —
o único achado daqui que não tem explicação inocente. Os outros são "conferir".

NÃO PROVA 2FA: o cookie vem do db/logar-como.js, que pula o TOTP.
`;

// --------------------------------------------------------------- leitura do payload

/**
 * Os caminhos de chave do payload, com array achatado em "[]".
 *
 * Devolve Map<caminho, teveValorNaoNulo>. As duas informações são diferentes e as duas
 * já esconderam defeito aqui: campo AUSENTE para uma persona é o corte por permissão;
 * campo presente e sempre NULO é o mascaramento — e mascaramento que some vira vazamento
 * sem mudar a forma do payload.
 */
function coletarCaminhos(valor, prefixo, saida, profundidade) {
  if (profundidade > PROFUNDIDADE_MAX) return;
  if (Array.isArray(valor)) {
    // Lista VAZIA não é campo cortado. A primeira versão desta ferramenta acusou 15
    // chaves de "programacoes[]" como corte por permissão quando a diferença era só
    // que umas personas tinham programação de férias e outras não. Ferramenta que
    // confunde "lista vazia" com "campo escondido" mente na direção mais cara.
    if (!valor.length) {
      saida.vazios.add(`${prefixo}[]`);
      return;
    }
    // A união dos elementos, não o primeiro: persona que recebe 1 item e persona que
    // recebe 70 não podem diferir por sorteio de qual item veio na frente.
    for (const item of valor.slice(0, AMOSTRA_ARRAY)) {
      coletarCaminhos(item, `${prefixo}[]`, saida, profundidade + 1);
    }
    return;
  }
  if (!valor || typeof valor !== 'object') return;
  for (const chave of Object.keys(valor)) {
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;
    const dentro = valor[chave];
    const jaTinha = saida.caminhos.get(caminho) || false;
    saida.caminhos.set(caminho, jaTinha || (dentro !== null && dentro !== undefined));
    coletarCaminhos(dentro, caminho, saida, profundidade + 1);
  }
}

/** A persona não tem o caminho porque a lista de cima veio vazia — ausência sem sentido. */
function naoAmostrado(r, caminho) {
  for (const prefixo of r.vazios) {
    if (caminho === prefixo || caminho.startsWith(`${prefixo}.`)) return true;
  }
  return false;
}

/** As listas do payload, por caminho pontilhado, até dois níveis ("tipos", "fila.demandas"). */
function colecoesDe(corpo, prefixo = '', profundidade = 0, saida = []) {
  if (Array.isArray(corpo) && !prefixo) {
    saida.push(RAIZ_COLECAO);
    return saida;
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || profundidade > 1) return saida;
  for (const chave of Object.keys(corpo)) {
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;
    if (Array.isArray(corpo[chave])) saida.push(caminho);
    else colecoesDe(corpo[chave], caminho, profundidade + 1, saida);
  }
  return saida;
}

/** O identificador de um item: "id", ou a primeira coluna terminada em "_id". */
function idDoItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.id !== undefined && item.id !== null) return String(item.id);
  const chave = Object.keys(item).find((c) => c.endsWith('_id') && item[c] !== null);
  return chave ? String(item[chave]) : null;
}

/**
 * Os IDs de uma persona num caminho. `null` = a persona não tem essa lista (ou ela não
 * tem id), e não ter é diferente de ter vazia: uma sai do diff, a outra é uma observação.
 */
function idsNoCaminho(corpo, caminho) {
  let valor = corpo;
  if (caminho !== RAIZ_COLECAO) {
    for (const parte of caminho.split('.')) {
      if (!valor || typeof valor !== 'object') return null;
      valor = valor[parte];
    }
  }
  if (!Array.isArray(valor)) return null;
  if (!valor.length) return [];
  const achados = valor.map(idDoItem);
  return achados.every((i) => i === null) ? null : achados.filter(Boolean);
}

/**
 * QUAL lista comparar — uma só, a mesma para todas as personas.
 *
 * A primeira versão escolhia por persona ("a maior lista do payload") e isso dava dois
 * problemas de uma vez. Comparava listas DIFERENTES entre si quando a maior de uma não
 * era a maior da outra. E, em /api/demandas, elegia `tipos` — o catálogo de tipos de
 * demanda, igual para todo mundo por desenho — e cravava "vazamento entre empresas" em
 * cima de um catálogo. Falso positivo alto e confiante é pior que achado nenhum.
 *
 * A régua agora é a pergunta da ferramenta: vale a lista que mais SEPARA as personas.
 * Catálogo global não separa ninguém (uma visão só) e por isso perde para qualquer lista
 * com escopo. Empate desempata pelo tamanho, e depois pelo nome, para a escolha não
 * mudar entre duas execuções iguais.
 */
function escolherColecao(respondentes) {
  const caminhos = new Set();
  for (const r of respondentes) for (const c of colecoesDe(r.corpo)) caminhos.add(c);
  const candidatos = [];
  for (const caminho of caminhos) {
    const vistas = respondentes.map((r) => idsNoCaminho(r.corpo, caminho)).filter((i) => i !== null);
    if (vistas.length < 1) continue;
    candidatos.push({
      caminho,
      distintas: new Set(vistas.map((ids) => ids.slice().sort().join(','))).size,
      total: vistas.reduce((t, ids) => t + ids.length, 0),
      personas: vistas.length,
    });
  }
  candidatos.sort(
    (a, b) => b.distintas - a.distintas || b.total - a.total || a.caminho.localeCompare(b.caminho)
  );
  return candidatos;
}

// ----------------------------------------------------------------- personas e cookie

/**
 * O e-mail das personas ativas, do --listar do logar-como.js.
 * A linha dele é "email  papel  chaves  2fa  situação"; INATIVA fica de fora porque a
 * própria fábrica de sessão recusa — e recusa de propósito, não por zelo.
 */
async function personasDoListar(banco) {
  const { stdout } = await executar(process.execPath, [LOGAR_COMO, '--listar', '--banco', banco], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const emails = [];
  for (const linha of stdout.split('\n')) {
    const partes = linha.match(/^(\S+@\S+)\s+(\S+)\s+\d+\s+\d+\s*(.*)$/);
    if (!partes) continue;
    if (/INATIVA/.test(partes[3])) continue;
    emails.push(partes[1]);
  }
  if (!emails.length) {
    throw new Error(
      `Não consegui ler nenhuma persona do --listar do logar-como.js em ${banco}.\n` +
        '  Confira na mão: node --env-file=… db/logar-como.js --listar --banco ' + banco
    );
  }
  return emails;
}

/**
 * O cookie de uma persona, mais o escopo dela.
 *
 * O cookie sai no stdout (uma linha, feito para caber num $(...)); o resumo — papel,
 * vínculos, empresa — sai no stderr. As duas coisas vêm da mesma chamada porque a
 * pergunta seguinte é sempre "e essa persona é de qual empresa?".
 */
async function abrirSessao(email, banco) {
  let saida;
  try {
    saida = await executar(process.execPath, [LOGAR_COMO, email, '--banco', banco], {
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (erro) {
    // Recusa do logar-como (conta inativa, sem senha) é resposta legítima, não queda:
    // a persona entra na tabela com o motivo no lugar do status.
    const motivo = String(erro.stderr || erro.message).split('\n')[0].trim();
    return { email, recusada: motivo || 'logar-como.js recusou' };
  }
  const cookie = saida.stdout.trim().split('\n').pop();
  if (!cookie || !cookie.startsWith('fp_sessao=')) {
    throw new Error(
      `O logar-como.js não devolveu cookie para ${email} — veio "${cookie}".\n` +
        '  A saída padrão dele tem que ser a linha do cookie; se mudou, conserte aqui.'
    );
  }

  const resumo = String(saida.stderr || '');
  const papel = (resumo.match(/papel (\S+)/) || [])[1] || '?';
  // Só vínculo ATIVO conta para o escopo: contrato encerrado não amplia o que a pessoa
  // enxerga hoje, e transferência entre CNPJs deixa um encerrado e um aberto.
  const empresas = [];
  for (const linha of resumo.split('\n')) {
    const v = linha.match(/^vínculo\s+#\d+ matrícula \S+ · (\S+) desde \S+ · (.+)$/);
    if (!v || v[1] !== 'ativo') continue;
    const empresa = v[2].trim();
    if (/sem lotação/.test(empresa)) continue;
    if (!empresas.includes(empresa)) empresas.push(empresa);
  }
  return { email, cookie, papel, empresas: empresas.sort() };
}

// ------------------------------------------------------------------------ a chamada

async function chamar(alvo, cookie) {
  let resposta;
  try {
    resposta = await fetch(alvo, {
      // redirect manual: seguir o 302 da tela de login trocaria um 401 honesto por um
      // 200 de página de entrada, e a tabela mentiria bonito.
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
  } catch (erro) {
    const codigo = (erro.cause && erro.cause.code) || erro.code || erro.name;
    if (codigo === 'ECONNREFUSED' || codigo === 'ECONNRESET') {
      throw new Error(
        `Não há servidor escutando em ${alvo}.\n` +
          `  Suba o da bancada e rode de novo:  ${COMO_SUBIR}\n` +
          '  Ele fica na 3001 e lê o mesmo .env.local-db, que é o que faz o cookie valer.\n' +
          '  Esta ferramenta NÃO sobe servidor: a vaga é uma só (ponto 2 do arnês).'
      );
    }
    throw new Error(`Falha ao chamar ${alvo}: ${erro.message}`);
  }
  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = JSON.parse(texto);
  } catch {
    corpo = undefined;
  }
  return { status: resposta.status, bytes: Buffer.byteLength(texto), texto, corpo };
}

/** Uma persona do começo ao fim: cookie, chamada e os caminhos de chave do payload. */
async function medir(email, banco, alvo) {
  const sessao = await abrirSessao(email, banco);
  if (sessao.recusada) return sessao;
  const resposta = await chamar(alvo, sessao.cookie);
  const chaves = new Map();
  const vazios = new Set();
  if (resposta.corpo !== undefined) {
    coletarCaminhos(resposta.corpo, '', { caminhos: chaves, vazios }, 0);
  }
  // Os IDs ficam para depois: a lista a comparar é UMA, escolhida com todas as respostas
  // na mão. Escolher por persona compara listas que não são a mesma coisa.
  return { ...sessao, ...resposta, chaves, vazios, ids: null };
}

// ------------------------------------------------------------------------- a tabela

function numero(n) {
  return Number(n).toLocaleString('pt-BR');
}

function escopoDe(r) {
  return `${r.papel} · ${r.empresas.length ? r.empresas.join(' + ') : 'sem empresa'}`;
}

function imprimirTabela(diga, linhas) {
  const colunas = [
    ['persona', (l) => l.persona],
    ['papel', (l) => l.papel],
    ['HTTP', (l) => l.http],
    ['itens', (l) => l.itens],
    ['bytes', (l) => l.bytes],
    ['empresa do vínculo', (l) => l.empresa],
  ];
  const direita = new Set(['HTTP', 'itens', 'bytes']);
  const larguras = colunas.map(([titulo, ler]) =>
    linhas.reduce((maior, l) => Math.max(maior, String(ler(l)).length), titulo.length)
  );
  const montar = (celulas) =>
    celulas
      .map((c, i) => (direita.has(colunas[i][0]) ? String(c).padStart(larguras[i]) : String(c).padEnd(larguras[i])))
      .join('  ')
      .trimEnd();
  diga(montar(colunas.map(([t]) => t)));
  diga(larguras.map((l) => '-'.repeat(l)).join('  '));
  for (const linha of linhas) diga(montar(colunas.map(([, ler]) => ler(linha))));
}

// --------------------------------------------------------------------------- o diff

// Lista de e-mails com teto. Dez personas repetidas em cada linha afogam o que a linha
// tinha para dizer — foi o primeiro defeito de leitura desta saída, medido em 50 linhas
// quase idênticas numa rota só.
function listarNomes(emails, teto = 5) {
  if (emails.length <= teto) return emails.join(', ');
  return `${emails.slice(0, teto).join(', ')} …(+${emails.length - teto})`;
}

function listarCaminhos(caminhos, teto = 6) {
  if (caminhos.length <= teto) return caminhos.join(', ');
  return `${caminhos.slice(0, teto).join(', ')} …(+${caminhos.length - teto}; --json traz todas)`;
}

function diffDeChaves(diga, respondentes) {
  const todas = new Set();
  for (const r of respondentes) for (const caminho of r.chaves.keys()) todas.add(caminho);
  if (!todas.size) {
    diga('  nenhuma chave — o corpo não é JSON de objeto.');
    return;
  }

  const ausentes = [];
  const nulas = [];
  let poupadas = 0;
  for (const caminho of [...todas].sort()) {
    const com = respondentes.filter((r) => r.chaves.has(caminho));
    const sem = respondentes.filter((r) => !r.chaves.has(caminho) && !naoAmostrado(r, caminho));
    const semAmostra = respondentes.length - com.length - sem.length;
    if (sem.length) {
      ausentes.push({
        caminho,
        com: com.map((r) => r.email),
        sem: sem.map((r) => r.email),
        semAmostra,
      });
      continue;
    }
    // Só sobrou quem não pôde ser amostrado: a chave não está cortada de ninguém, a
    // lista de cima é que veio vazia. Contar e seguir.
    if (semAmostra) {
      poupadas++;
      continue;
    }
    // Presente para todas: sobra a diferença que não muda a forma do payload — valor
    // sempre nulo para umas e não para outras. É assim que mascaramento aparece.
    const semValor = com.filter((r) => r.chaves.get(caminho) === false);
    if (semValor.length && semValor.length < com.length) {
      nulas.push({ caminho, sem: semValor.map((r) => r.email) });
    }
  }
  if (poupadas) {
    diga(
      `  ${poupadas} chave(s) faltam em alguma persona só porque a lista acima veio VAZIA —\n` +
        '  isso é "não tem o que mostrar", não é campo cortado, e ficou fora do diff.'
    );
  }

  if (!ausentes.length && !nulas.length) {
    diga(`  as ${todas.size} chaves aparecem, com valor, para as ${respondentes.length} personas que responderam.`);
    return;
  }

  // Um bloco por CORTE, não por chave. Um payload cortado por permissão corta um ramo
  // inteiro de uma vez — as 33 chaves de "painel" somem para as mesmas 6 personas — e
  // repetir a mesma lista 33 vezes esconde que o corte é um só.
  const porCorte = new Map();
  for (const d of ausentes) {
    const assinatura = `${d.com.join('|')}#${d.sem.join('|')}`;
    if (!porCorte.has(assinatura)) {
      porCorte.set(assinatura, { com: d.com, sem: d.sem, semAmostra: d.semAmostra, caminhos: [] });
    }
    porCorte.get(assinatura).caminhos.push(d.caminho);
  }
  for (const corte of [...porCorte.values()].sort((a, b) => b.caminhos.length - a.caminhos.length)) {
    diga(`  ${corte.caminhos.length} chave(s) que ${corte.sem.length} de ${respondentes.length} personas NÃO recebem`);
    diga(`    veem:     ${listarNomes(corte.com)}`);
    diga(`    não veem: ${listarNomes(corte.sem)}`);
    if (corte.semAmostra) diga(`    sem dizer: ${corte.semAmostra} persona(s) com a lista acima vazia`);
    diga(`    chaves:   ${listarCaminhos(corte.caminhos)}`);
  }

  const porMascara = new Map();
  for (const d of nulas) {
    const assinatura = d.sem.join('|');
    if (!porMascara.has(assinatura)) porMascara.set(assinatura, { sem: d.sem, caminhos: [] });
    porMascara.get(assinatura).caminhos.push(d.caminho);
  }
  for (const m of porMascara.values()) {
    diga(`  ${m.caminhos.length} chave(s) presentes para todas, mas SEMPRE NULAS em ${m.sem.length} persona(s)`);
    diga(`    nulas em: ${listarNomes(m.sem)}`);
    diga(`    chaves:   ${listarCaminhos(m.caminhos)}`);
  }
  diga(`\n  ${ausentes.length + nulas.length} de ${todas.size} chaves diferem entre as personas.`);
}

function assinaturaDeIds(ids) {
  return [...ids].sort().join(',');
}

/** Os dois perigos. Devolve a lista dos fortes — são eles que decidem o código de saída. */
function diffDeIds(diga, respondentes, mostrarTodos, caminho) {
  const comIds = respondentes.filter((r) => r.ids);
  if (comIds.length < 2) {
    diga(
      `  ${comIds.length} persona(s) devolveram coleção com id — com menos de duas não há diff.\n` +
        '  Rota que responde 403 para as outras já disse o que tinha para dizer: o corte foi\n' +
        '  no portão, não no payload.'
    );
    return [];
  }

  const largura = Math.max(...comIds.map((r) => r.email.length));
  // Em ordem decrescente, e com teto. O que esta seção existe para mostrar é o SALTO do
  // topo para a base; quarenta linhas iguais de "1 item" no meio empurram o salto para
  // fora da tela, que é justamente o efeito contrário.
  const ordenados = [...comIds].sort((a, b) => b.ids.length - a.ids.length || a.email.localeCompare(b.email));
  const cortar = !mostrarTodos && ordenados.length > TETO_LINHAS + 2;
  for (const r of cortar ? ordenados.slice(0, TETO_LINHAS) : ordenados) {
    const amostra = mostrarTodos ? r.ids : r.ids.slice(0, IDS_MOSTRADOS);
    const resto = r.ids.length - amostra.length;
    diga(
      `  ${r.email.padEnd(largura)}  ${String(r.ids.length).padStart(4)}  ` +
        `${amostra.map((i) => `#${i}`).join(' ')}${resto > 0 ? ` …(+${resto})` : ''}`
    );
  }
  if (cortar) {
    const restantes = ordenados.slice(TETO_LINHAS);
    const menores = restantes.map((r) => r.ids.length);
    diga(
      `  …(+${restantes.length} personas, de ${Math.min(...menores)} a ${Math.max(...menores)} itens; ` +
        '--ids ou --json trazem todas)'
    );
  }
  const tamanhos = comIds.map((r) => r.ids.length);
  const menor = Math.min(...tamanhos);
  const maior = Math.max(...tamanhos);
  diga(
    `\n  alcance   ${menor} … ${maior} itens em ${caminho}` +
      (menor > 0 && maior > menor ? ` — a maior visão é ${(maior / menor).toFixed(1).replace('.', ',')}x a menor` : '')
  );

  // (a) mesmo escopo, IDs diferentes.
  diga('\nPERIGO (a) — mesmo escopo, IDs diferentes');
  const porEscopo = new Map();
  for (const r of comIds) {
    const chave = escopoDe(r);
    if (!porEscopo.has(chave)) porEscopo.set(chave, []);
    porEscopo.get(chave).push(r);
  }
  let achouA = 0;
  for (const [escopo, grupo] of porEscopo) {
    if (grupo.length < 2) continue;
    const assinaturas = new Set(grupo.map((r) => assinaturaDeIds(r.ids)));
    if (assinaturas.size < 2) continue;
    achouA++;
    // Sem NENHUMA sobreposição entre as personas do grupo, o padrão é "cada uma vê só o
    // que é dela" — 22 funcionários vendo a própria ficha. Isso é o desenho, não o
    // defeito, e detalhar 22 linhas iguais enterra o grupo ao lado, que é o que importa:
    // visões que se cruzam em parte, que é onde escopo mal aplicado aparece.
    const soma = grupo.reduce((t, r) => t + r.ids.length, 0);
    const uniao = new Set(grupo.flatMap((r) => r.ids)).size;
    diga(`  ${escopo} — ${grupo.length} personas, ${assinaturas.size} visões diferentes`);
    if (soma === uniao) {
      diga('    nenhuma sobreposição entre elas — o padrão de "cada uma só o que é dela".');
      continue;
    }
    for (const r of grupo.slice(0, LINHAS_POR_GRUPO)) {
      const outros = new Set(grupo.filter((o) => o !== r).flatMap((o) => o.ids));
      const so = r.ids.filter((i) => !outros.has(i));
      diga(
        `    ${r.email.padEnd(largura)}  ${String(r.ids.length).padStart(4)} itens` +
          (so.length ? `  — ${so.length} que nenhum par do grupo vê: ${so.slice(0, 6).map((i) => `#${i}`).join(' ')}` : '')
      );
    }
    if (grupo.length > LINHAS_POR_GRUPO) {
      diga(`    …(+${grupo.length - LINHAS_POR_GRUPO} personas no mesmo escopo)`);
    }
  }
  if (!achouA) diga('  nenhum: dentro de cada escopo, todas as personas veem o mesmo conjunto.');
  else {
    diga(
      '  CONFERIR, não é veredito: "escopo" aqui é papel + empresa, e papel cujo alcance é\n' +
        '  a própria equipe (gestor) ou a própria ficha (funcionário) diverge de propósito.'
    );
  }

  // (b) escopos diferentes, IDs idênticos. O silencioso.
  diga('\nPERIGO (b) — escopos diferentes, exatamente os MESMOS IDs');
  const porAssinatura = new Map();
  for (const r of comIds) {
    if (!r.ids.length) continue; // duas visões vazias coincidem à toa; isso não é sinal.
    const chave = assinaturaDeIds(r.ids);
    if (!porAssinatura.has(chave)) porAssinatura.set(chave, []);
    porAssinatura.get(chave).push(r);
  }
  const fortes = [];
  let achouB = 0;
  for (const grupo of porAssinatura.values()) {
    const escopos = [...new Set(grupo.map(escopoDe))];
    if (escopos.length < 2) continue;
    achouB++;
    // Empresas disjuntas é o caso sem explicação inocente: papel diferente na MESMA
    // empresa pode ver o mesmo de propósito (dp e diretoria veem a empresa inteira).
    let forte = null;
    for (const a of grupo) {
      for (const b of grupo) {
        if (a === b || !a.empresas.length || !b.empresas.length) continue;
        if (a.empresas.some((e) => b.empresas.includes(e))) continue;
        forte = { a, b, quantos: a.ids.length };
      }
    }
    const marca = forte ? 'VAZAMENTO ENTRE EMPRESAS' : 'conferir';
    diga(`  ${marca}: ${grupo.length} personas veem os mesmos ${grupo[0].ids.length} itens`);
    for (const r of grupo.slice(0, LINHAS_POR_GRUPO)) diga(`    ${r.email.padEnd(largura)}  ${escopoDe(r)}`);
    if (grupo.length > LINHAS_POR_GRUPO) diga(`    …(+${grupo.length - LINHAS_POR_GRUPO} personas)`);
    if (forte) {
      fortes.push(forte);
      diga(
        `    ${forte.a.email} e ${forte.b.email} não têm nenhuma empresa em comum e ainda\n` +
          `    assim enxergam a MESMA lista — o filtro por empresa não está sendo aplicado.\n` +
          `    A não ser que "${caminho}" seja catálogo do sistema (tipo, cargo, rubrica), que é\n` +
          '    igual para todo mundo por desenho. Aponte a lista com escopo: --colecao <nome>.'
      );
    }
  }
  if (!achouB) diga('  nenhum: cada escopo enxerga um conjunto próprio.');
  return fortes;
}

// ----------------------------------------------------------------------------- main

async function main() {
  // O `extras` existe para isto: bandeira de UMA ferramenta não precisa virar contrato de
  // todas. Sem ele, "--colecao folhas" viraria booleana e o "folhas" seria lido como uma
  // segunda rota, em silêncio.
  const { livres, bandeiras } = lerArgumentos(process.argv.slice(2), ['colecao']);
  ajudaSePedida(bandeiras, AJUDA);

  const rota = livres[0];
  if (!rota) {
    throw new Error(
      'Falta a rota.\n' +
        '  node --env-file=.env.local-db db/comparar-personas.js /api/colaboradores --banco fast_pessoas_dev\n' +
        '  A rota vem ANTES das bandeiras e começa com "/" (ou é a URL inteira).'
    );
  }
  if (!rota.startsWith('/') && !/^https?:\/\//.test(rota)) {
    // O Git Bash do Windows converte argumento que começa com "/" em caminho de arquivo:
    // "/api/colaboradores" chega aqui como "C:/Program Files/Git/api/colaboradores".
    // Custou a primeira execução desta ferramenta, e custaria a de quem vier depois.
    const mangido = /^[A-Za-z]:[\\/].*[\\/]Git[\\/]/.test(rota);
    throw new Error(
      `Rota inválida: "${rota}". Comece com "/" — /api/colaboradores — ou dê a URL inteira.` +
        (mangido
          ? '\n  Isto é o Git Bash convertendo a rota em caminho do Windows. Rode com\n' +
            '  MSYS_NO_PATHCONV=1 na frente, ou passe a URL inteira (http://localhost:3001/api/…).'
          : '')
    );
  }
  if (!fs.existsSync(LOGAR_COMO)) {
    throw new Error(
      `Não achei ${path.relative(process.cwd(), LOGAR_COMO)}.\n` +
        '  É ele que fabrica a sessão de cada persona; sem ele esta ferramenta não tem o que comparar.'
    );
  }

  const limite = Number(bandeiras.limite === undefined ? 0 : bandeiras.limite);
  if (!Number.isInteger(limite) || limite < 0) {
    throw new Error('--limite <n> tem que ser inteiro (0 = todas as personas).');
  }
  const escolhida = typeof bandeiras.colecao === 'string' ? bandeiras.colecao : null;
  const base = typeof bandeiras.url === 'string' ? bandeiras.url.replace(/\/+$/, '') : BASE_PADRAO;
  const alvo = /^https?:\/\//.test(rota) ? rota : `${base}${rota}`;

  const conexao = resolverConexao(bandeiras);
  // A mesma trava do logar-como.js, e pelo mesmo motivo: fabricar sessão na base de
  // apresentação não é legítimo nunca. Aqui ela é adiantada só para a recusa vir antes
  // de abrir dezenas de subprocessos.
  exigirLocal(conexao, 'Comparar personas fabrica uma sessão por persona; isso é bancada, não vitrine.');

  const comoJson = bandeiras.json === true;
  const diga = comoJson ? (...a) => console.error(...a) : (...a) => console.log(...a);

  // O controle vem primeiro e faz dois trabalhos: prova que há servidor no ar e dá a
  // linha de base sem sessão, que numa rota de API tem que ser 401.
  const anonimo = await chamar(alvo, null);

  let emails = livres.slice(1);
  const doListar = !emails.length;
  if (doListar) emails = await personasDoListar(conexao.banco);
  if (limite && emails.length > limite) emails = emails.slice(0, limite);

  const resultados = [];
  for (let i = 0; i < emails.length; i += EM_VOO) {
    const lote = emails.slice(i, i + EM_VOO);
    resultados.push(...(await Promise.all(lote.map((e) => medir(e, conexao.banco, alvo)))));
  }

  // A lista a comparar é uma só, decidida com todas as respostas na mão, e depois lida
  // no MESMO caminho para cada persona.
  const respondentes = resultados.filter((r) => r.status === 200 && r.corpo !== undefined);
  const candidatos = escolherColecao(respondentes);
  const alvoColecao = escolhida || (candidatos.length ? candidatos[0].caminho : null);
  if (escolhida && !candidatos.some((c) => c.caminho === escolhida)) {
    throw new Error(
      `Nenhuma persona devolveu a lista "${escolhida}" nesta rota.\n` +
        `  As que existem: ${candidatos.map((c) => c.caminho).join(', ') || '(nenhuma)'}`
    );
  }
  for (const r of respondentes) r.ids = alvoColecao ? idsNoCaminho(r.corpo, alvoColecao) : null;

  diga(`rota      ${alvo}`);
  diga(`banco     ${conexao.banco}@${conexao.host}`);
  diga(
    `personas  ${resultados.length}` +
      (doListar ? ' (todas as ativas do --listar do logar-como.js)' : ' (da linha de comando)')
  );
  diga(
    `coleção   ${alvoColecao || '(o payload não tem lista com id)'}` +
      (escolhida ? ' (--colecao)' : candidatos.length > 1 ? ` · outras: ${candidatos.slice(1, 6).map((c) => c.caminho).join(', ')}` : '')
  );
  diga('');

  const linhas = [
    {
      persona: '(sem cookie)',
      papel: '—',
      http: anonimo.status,
      itens: '—',
      bytes: numero(anonimo.bytes),
      empresa: 'controle: rota de API sem sessão tem que dar 401',
    },
  ];
  // Quem respondeu 200 desce por número de itens (é aí que o salto aparece); quem não
  // respondeu 200 vai para o fim e NUNCA é cortado pelo teto. Esconder um 403 para caber
  // na tela seria esconder exatamente a linha que costuma ser o achado.
  const comum = resultados
    .filter((r) => r.status === 200)
    .sort((a, b) => (b.ids ? b.ids.length : -1) - (a.ids ? a.ids.length : -1) || a.email.localeCompare(b.email));
  const fora = resultados.filter((r) => r.status !== 200);
  const cortados = comum.length > TETO_LINHAS + 2 ? comum.length - TETO_LINHAS : 0;
  const linhaDe = (r) => ({
    persona: r.email,
    papel: r.papel || '—',
    http: r.recusada ? '—' : r.status,
    itens: r.ids ? numero(r.ids.length) : '—',
    bytes: r.bytes === undefined ? '—' : numero(r.bytes),
    empresa: r.recusada || (r.empresas && r.empresas.length ? r.empresas.join(' + ') : 'sem vínculo aberto'),
  });
  for (const r of cortados ? comum.slice(0, TETO_LINHAS) : comum) linhas.push(linhaDe(r));
  if (cortados) {
    linhas.push({
      persona: `…(+${cortados})`,
      papel: '—',
      http: 200,
      itens: '—',
      bytes: '—',
      empresa: 'personas com 200 fora do teto de linhas; --json traz todas',
    });
  }
  for (const r of fora) linhas.push(linhaDe(r));
  imprimirTabela(diga, linhas);

  diga(`\nCHAVES — caminho que aparece para uma persona e não para outra (${respondentes.length} responderam 200)`);
  if (respondentes.length < 2) {
    diga('  menos de duas personas com 200 — não há diff de chaves.');
  } else {
    diffDeChaves(diga, respondentes);
  }

  // Nomear a lista é obrigatório: "300 itens" sem dizer 300 do quê é número solto, e
  // número solto vira conclusão errada em duas leituras.
  diga(`\nIDS — o que cada persona enxerga em ${alvoColecao || '(nenhuma lista com id no payload)'}`);
  const fortes = alvoColecao ? diffDeIds(diga, respondentes, bandeiras.ids === true, alvoColecao) : [];

  if (comoJson) {
    console.log(
      JSON.stringify(
        {
          rota: alvo,
          banco: conexao.banco,
          colecao: alvoColecao,
          sem_cookie: anonimo.status,
          personas: resultados.map((r) => ({
            email: r.email,
            recusada: r.recusada || null,
            papel: r.papel || null,
            empresas: r.empresas || [],
            http: r.status === undefined ? null : r.status,
            bytes: r.bytes === undefined ? null : r.bytes,
            itens: r.ids ? r.ids.length : null,
            ids: r.ids || null,
            chaves: r.chaves ? [...r.chaves.keys()].sort() : null,
          })),
          vazamento_entre_empresas: fortes.map((f) => ({
            a: f.a.email,
            b: f.b.email,
            itens_iguais: f.quantos,
          })),
        },
        null,
        2
      )
    );
  }

  if (fortes.length) {
    diga(`\n${fortes.length} par(es) de empresas disjuntas com a MESMA lista. Saindo 1.`);
    return 1;
  }
  return 0;
}

// `process.exitCode`, e NÃO `process.exit()`. Com process.exit() no fim de um caminho
// que fez dezenas de fetch, o node abortou aqui no Windows com
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c
// e o processo saiu 127 depois de imprimir a comparação inteira e correta. Código de
// saída errado é pior do que não ter código de saída: este aqui é o portão.
// Medido: sem process.exit() o processo drena e termina em ~1 ms, sem espera nenhuma.
// O caminho de ERRO continua no morrer(), como manda o contrato — lá o process.exit()
// pode abortar que a saída segue diferente de zero, que é o que aquele caminho promete.
main()
  .then((codigo) => {
    process.exitCode = codigo || 0;
  })
  .catch(morrer);
