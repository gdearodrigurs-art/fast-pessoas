// Runner do mapa de eixos: reexecuta as consultas de db/mapa-eixos.json e compara
// com o retrato guardado em db/mapa-baseline.json.
//
// Um "eixo" é uma regra que pode ser violada sem ninguém perceber — pessoa × vínculo,
// dinheiro em centavo, autorização por chave. O mapa responde a única pergunta que a
// verificação por onda nunca soube responder: "se eu mexi aqui, quem mais depende disto?".
//
// O diff é por ARQUIVO, não por linha. Número de linha anda a cada edição, e um alarme
// que toca sempre é um alarme que ninguém lê. O que importa é arquivo NOVO entrando num
// eixo: isso é a mudança respingando onde ninguém olhou.
//
// Uso:
//   node db/mapa.js retrato              grava db/mapa-baseline.json (só na 1ª vez e após aceitar mudanças)
//   node db/mapa.js                      confere tudo; sai 1 se algum eixo ganhou arquivo
//   node db/mapa.js vigencia dinheiro    confere só esses eixos
//   node db/mapa.js --sql                inclui as consultas de catálogo (precisa de DATABASE_URL)
//   node --env-file=.env.local-db db/mapa.js retrato --sql   grava o retrato COM o catálogo
//
// A ordem importa: `retrato` é o primeiro argumento e `--sql` vem depois. Este cabeçalho
// documentava uma bandeira `--retrato-sql` que nunca existiu no código — o comando rodava a
// comparação e não gravava nada, em silêncio. Achado pela auditoria do próprio mapa.
//
// Bandeiras: --json (saída de máquina) · --sem-portao (nunca sai 1) · --quieto
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const MAPA = path.join(__dirname, 'mapa-eixos.json');
const RETRATO = path.join(__dirname, 'mapa-baseline.json');

// ---------------------------------------------------------------------------
// Tokenizador POSIX. As consultas foram escritas como linha de comando de shell
// ('*.ts' com aspas simples), e no Windows o cmd.exe não entende aspas simples —
// rodar via shell aqui daria resultado diferente do que o autor da consulta viu.
// Então nada de shell: quebramos a linha em argv e chamamos o rg direto.
// ---------------------------------------------------------------------------
function tokenizar(linha) {
  const args = [];
  let atual = '';
  let aberto = false;
  let i = 0;
  while (i < linha.length) {
    const c = linha[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (aberto) { args.push(atual); atual = ''; aberto = false; }
      i++;
    } else if (c === "'") {
      aberto = true; i++;
      while (i < linha.length && linha[i] !== "'") { atual += linha[i]; i++; }
      if (i >= linha.length) throw new Error('aspas simples sem fechamento');
      i++;
    } else if (c === '"') {
      aberto = true; i++;
      while (i < linha.length && linha[i] !== '"') {
        // Dentro de aspas duplas a barra invertida só escapa estes quatro. Em todo o
        // resto ela é literal — é o que mantém \d, \s e \( intactos nos regex.
        if (linha[i] === '\\' && '$`"\\'.includes(linha[i + 1])) { atual += linha[i + 1]; i += 2; }
        else { atual += linha[i]; i++; }
      }
      if (i >= linha.length) throw new Error('aspas duplas sem fechamento');
      i++;
    } else if (c === '\\') {
      aberto = true;
      if (i + 1 < linha.length) { atual += linha[i + 1]; i += 2; } else { atual += c; i++; }
    } else {
      aberto = true; atual += c; i++;
    }
  }
  if (aberto) args.push(atual);
  return args;
}

const METACARACTERES = new Set(['|', '||', '&&', '&', ';', '>', '>>', '<', '2>', '2>&1']);

// Acha o primeiro | que está fora de aspas — dentro delas ele é alternância de regex.
function acharPipeForaDeAspas(linha) {
  let aspas = null;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '\\' && aspas === '"') { i++; continue; }
      if (c === aspas) aspas = null;
    } else if (c === "'" || c === '"') {
      aspas = c;
    } else if (c === '|') {
      return i;
    }
  }
  return -1;
}

// O ripgrep vem de dependência de desenvolvimento, não do PATH. Reimplementar a busca
// em Node era possível, mas o retrato precisa ser medido com o MESMO motor que mediu o
// mapa — uma reimplementação que divergisse em lookahead ou em glob faria o portão
// acusar diferença que não existe, e um portão assim é desligado na primeira semana.
const RG = (() => {
  try {
    const { rgPath } = require('@vscode/ripgrep');
    if (fs.existsSync(rgPath)) return rgPath;
  } catch { /* sem a dependência, tenta o PATH */ }
  return 'rg';
})();

// O shell POSIX expande db/migrations/*.sql ANTES de chamar o rg. Sem shell, o rg
// recebe a estrela literal e devolve erro de nome de arquivo inválido. Quem escreveu a
// consulta contava com a expansão — então ela é feita aqui, do mesmo jeito.
function expandirCaminho(arg) {
  if (!arg.includes('*') && !arg.includes('?')) return [arg];
  const barra = arg.lastIndexOf('/');
  const dir = barra === -1 ? '.' : arg.slice(0, barra);
  const padrao = arg.slice(barra + 1);
  const absoluto = path.join(RAIZ, dir);
  if (!fs.existsSync(absoluto) || !fs.statSync(absoluto).isDirectory()) return [arg];
  const re = new RegExp(
    '^' + padrao.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$'
  );
  const achados = fs
    .readdirSync(absoluto)
    .filter((f) => re.test(f))
    .sort()
    .map((f) => (dir === '.' ? f : `${dir}/${f}`));
  // Sem correspondência, o shell passa a estrela literal adiante — e o rg falha.
  // Devolver lista vazia é mais honesto: a consulta não tem alvo neste checkout.
  return achados;
}

function rodarGrep(comando) {
  // Corta o rabo do pipe: as consultas que terminam em "| sort | uniq -c" usavam o
  // pipe só para o humano contar. O que alimenta o retrato é o conjunto de arquivos
  // que o rg devolve, e esse é o mesmo dos dois jeitos.
  let bruto = comando;
  let cortouPipe = false;
  const posPipe = acharPipeForaDeAspas(bruto);
  if (posPipe !== -1) { bruto = bruto.slice(0, posPipe); cortouPipe = true; }

  let argv;
  try {
    argv = tokenizar(bruto);
  } catch (e) {
    return { erro: `não deu para quebrar em argumentos: ${e.message}` };
  }
  if (!argv.length) return { erro: 'consulta vazia' };
  if (argv[0] !== 'rg') return { erro: `consulta não começa com rg (começa com "${argv[0]}")` };
  if (argv.some((a) => METACARACTERES.has(a))) {
    return { erro: 'consulta usa redirecionamento — não é reexecutável sem shell' };
  }

  // Na linha de comando do rg, o PRIMEIRO posicional é o padrão e só os seguintes são
  // caminho. Confundir os dois foi o defeito que a sabotagem pegou: um regex como
  // "(?i)count\(\s*distinct" tem ? e *, era tratado como caminho, não casava com
  // arquivo nenhum e sumia do argv — o rg então usava o primeiro caminho como padrão e
  // devolvia resultado sem relação com a pergunta, silenciosamente.
  const COM_VALOR = new Set([
    '-e', '--regexp', '-g', '--glob', '--iglob', '-t', '--type', '-T', '--type-not',
    '-m', '--max-count', '-A', '--after-context', '-B', '--before-context', '-C',
    '--context', '--max-depth', '-j', '--threads', '--sort', '--sortr', '-r',
    '--replace', '-f', '--file', '--pre', '--colors', '-M', '--max-columns',
    '--max-filesize', '--context-separator', '--engine', '--type-add',
  ]);
  // Com -e/-f o padrão vem pela bandeira, então todo posicional já é caminho.
  let padraoJaVisto = argv.some((a) => a === '-e' || a === '--regexp' || a === '-f' || a === '--file');
  const expandido = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('-') || COM_VALOR.has(argv[i - 1])) { expandido.push(a); continue; }
    if (!padraoJaVisto) { padraoJaVisto = true; expandido.push(a); continue; }
    if (a.includes('*') || a.includes('?')) expandido.push(...expandirCaminho(a));
    else expandido.push(a);
  }

  // --color=never e --no-heading garantem o formato arquivo:linha:texto qualquer que
  // seja a configuração de rg da máquina (um .ripgreprc do usuário mudaria a saída).
  // Os dois arquivos do próprio mapa ficam de fora: eles guardam os padrões como
  // texto, então casavam com quase toda consulta e o mapa se enxergava.
  const args = expandido.concat([
    '--color=never', '--no-heading', '--with-filename',
    '--glob=!**/mapa-eixos.json', '--glob=!**/mapa-baseline.json',
  ]);
  if (cortouPipe) args.push('--no-messages');
  const r = spawnSync(RG, args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (r.error) return { erro: `rg não executou: ${r.error.message}` };
  if (r.status === 2) return { erro: `rg reclamou: ${(r.stderr || '').trim().split('\n')[0]}` };

  const contagem = {};
  let total = 0;
  for (const linha of (r.stdout || '').split('\n')) {
    if (!linha.trim()) continue;
    // Aceita "arquivo:linha:texto" e também só "arquivo" (consulta com -l).
    const m = linha.match(/^(.+?):(\d+):/);
    const arq = (m ? m[1] : linha).replace(/\\/g, '/').trim();
    if (!arq) continue;
    contagem[arq] = (contagem[arq] || 0) + 1;
    total++;
  }

  // Ordem alfabética ANTES de gravar. O rg varre em paralelo e devolve os arquivos na
  // ordem em que as threads terminam — sem ordenar, dois retratos do mesmo código
  // produzem 1.148 linhas de diff e zero informação. Descoberto no primeiro fechamento
  // de onda que usou a ferramenta de verdade: o diff do baseline é o sinal que o portão
  // de commit lê, e sinal com mil linhas de ruído é sinal que ninguém lê.
  const arquivos = {};
  for (const chave of Object.keys(contagem).sort()) arquivos[chave] = contagem[chave];
  return { arquivos, total };
}

async function rodarSql(consultas) {
  if (!process.env.DATABASE_URL) {
    return { erro: 'DATABASE_URL ausente — rode com --env-file=.env (ou .env.local-db)' };
  }
  const { Client } = require('pg');
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  const saida = [];
  for (const c of consultas) {
    try {
      const { rows } = await cliente.query(c.comando);
      // O catálogo devolve linha, não arquivo. O retrato guarda a linha inteira
      // serializada: qualquer coluna nova, tabela nova ou índice novo aparece no diff.
      const chaves = rows.map((r) => Object.values(r).map((v) => String(v)).join(' · ')).sort();
      saida.push({ descricao: c.descricao, tipo: 'sql', linhas: chaves, total: chaves.length });
    } catch (e) {
      saida.push({ descricao: c.descricao, tipo: 'sql', erro: e.message.split('\n')[0] });
    }
  }
  await cliente.end();
  return { consultas: saida };
}

function compararConjuntos(antes, agora) {
  const a = new Set(Object.keys(antes || {}));
  const b = new Set(Object.keys(agora || {}));
  return {
    novos: [...b].filter((x) => !a.has(x)).sort(),
    sumiram: [...a].filter((x) => !b.has(x)).sort(),
    mudaram: [...b]
      .filter((x) => a.has(x) && antes[x] !== agora[x])
      .map((x) => ({ arquivo: x, antes: antes[x], agora: agora[x] }))
      .sort((p, q) => p.arquivo.localeCompare(q.arquivo)),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const bandeira = (n) => argv.includes(n);
  const gravarRetrato = argv[0] === 'retrato';
  const comSql = bandeira('--sql');
  const comoJson = bandeira('--json');
  const quieto = bandeira('--quieto');
  const semPortao = bandeira('--sem-portao');
  const eixosPedidos = argv.filter((a) => !a.startsWith('--') && a !== 'retrato');

  if (!fs.existsSync(MAPA)) {
    console.error(`${path.relative(RAIZ, MAPA)} não existe. O mapa é gerado pela varredura de eixos.`);
    process.exit(1);
  }
  const mapa = JSON.parse(fs.readFileSync(MAPA, 'utf8'));
  const eixos = eixosPedidos.length
    ? mapa.eixos.filter((e) => eixosPedidos.includes(e.id))
    : mapa.eixos;

  if (eixosPedidos.length && eixos.length !== eixosPedidos.length) {
    const conhecidos = mapa.eixos.map((e) => e.id).join(', ');
    console.error(`Eixo desconhecido. Os que existem: ${conhecidos}`);
    process.exit(1);
  }

  const dizer = (...a) => { if (!quieto && !comoJson) console.log(...a); };

  const atual = { versao: 1, gerado_em: new Date().toISOString(), eixos: {} };
  const problemas = [];

  for (const eixo of eixos) {
    const greps = eixo.consultas.filter((c) => c.tipo === 'grep');
    const sqls = eixo.consultas.filter((c) => c.tipo === 'sql');
    const consultas = [];

    for (const c of greps) {
      const r = rodarGrep(c.comando);
      if (r.erro) {
        problemas.push({ eixo: eixo.id, descricao: c.descricao, erro: r.erro });
        consultas.push({ descricao: c.descricao, tipo: 'grep', erro: r.erro });
      } else {
        consultas.push({ descricao: c.descricao, tipo: 'grep', arquivos: r.arquivos, total: r.total });
      }
    }

    if (comSql && sqls.length) {
      const r = await rodarSql(sqls);
      if (r.erro) problemas.push({ eixo: eixo.id, descricao: '(catálogo)', erro: r.erro });
      else consultas.push(...r.consultas);
    }

    atual.eixos[eixo.id] = { nome: eixo.nome, consultas };
  }

  if (gravarRetrato) {
    // Retrato parcial sobrescrevendo retrato inteiro apagaria o que não foi conferido.
    let base = { versao: 1, eixos: {} };
    if (fs.existsSync(RETRATO)) base = JSON.parse(fs.readFileSync(RETRATO, 'utf8'));
    base.gerado_em = atual.gerado_em;
    base.eixos = { ...base.eixos, ...atual.eixos };
    fs.writeFileSync(RETRATO, JSON.stringify(base, null, 2) + '\n');
    dizer(`retrato gravado: ${Object.keys(atual.eixos).length} eixo(s) em ${path.relative(RAIZ, RETRATO)}`);
    if (problemas.length) {
      dizer(`\n${problemas.length} consulta(s) não rodaram — o retrato foi gravado SEM elas:`);
      for (const p of problemas) dizer(`  [${p.eixo}] ${p.descricao}\n      ${p.erro}`);
    }
    process.exit(problemas.length && !semPortao ? 1 : 0);
  }

  if (!fs.existsSync(RETRATO)) {
    console.error(`Não existe retrato para comparar. Rode primeiro:\n  node db/mapa.js retrato`);
    process.exit(1);
  }
  const retrato = JSON.parse(fs.readFileSync(RETRATO, 'utf8'));

  const relatorio = [];
  for (const [id, dados] of Object.entries(atual.eixos)) {
    const antes = retrato.eixos[id];
    if (!antes) {
      relatorio.push({ eixo: id, nome: dados.nome, semRetrato: true });
      continue;
    }
    const porConsulta = [];
    for (const c of dados.consultas) {
      if (c.erro) continue;
      const a = antes.consultas.find((x) => x.descricao === c.descricao);
      if (!a) { porConsulta.push({ descricao: c.descricao, consultaNova: true }); continue; }
      if (c.tipo === 'sql') {
        const antesSet = Object.fromEntries((a.linhas || []).map((l) => [l, 1]));
        const agoraSet = Object.fromEntries((c.linhas || []).map((l) => [l, 1]));
        const d = compararConjuntos(antesSet, agoraSet);
        if (d.novos.length || d.sumiram.length) porConsulta.push({ descricao: c.descricao, ...d });
      } else {
        const d = compararConjuntos(a.arquivos, c.arquivos);
        if (d.novos.length || d.sumiram.length || d.mudaram.length) {
          porConsulta.push({ descricao: c.descricao, ...d });
        }
      }
    }
    const novos = porConsulta.flatMap((c) => c.novos || []);
    relatorio.push({
      eixo: id,
      nome: dados.nome,
      tocado: porConsulta.length > 0,
      arquivosNovos: [...new Set(novos)].sort(),
      consultas: porConsulta,
    });
  }

  const tocados = relatorio.filter((r) => r.tocado || r.semRetrato);
  const comArquivoNovo = relatorio.filter((r) => (r.arquivosNovos || []).length);

  if (comoJson) {
    console.log(JSON.stringify({ relatorio, problemas }, null, 2));
  } else {
    for (const r of relatorio) {
      if (r.semRetrato) { dizer(`?  ${r.eixo} — sem retrato; rode: node db/mapa.js retrato ${r.eixo}`); continue; }
      if (!r.tocado) { dizer(`ok ${r.eixo}`); continue; }
      dizer(`\n>> ${r.eixo} — ${r.nome}`);
      for (const c of r.consultas) {
        dizer(`   · ${c.descricao}`);
        if (c.consultaNova) { dizer('       consulta nova, sem retrato'); continue; }
        for (const n of c.novos || []) dizer(`       + ${n}`);
        for (const s of c.sumiram || []) dizer(`       - ${s}`);
        for (const m of c.mudaram || []) dizer(`       ~ ${m.arquivo}  ${m.antes} -> ${m.agora}`);
      }
    }

    if (problemas.length) {
      dizer(`\n${problemas.length} consulta(s) não rodaram:`);
      for (const p of problemas) dizer(`  [${p.eixo}] ${p.descricao}\n      ${p.erro}`);
    }

    dizer('');
    if (!tocados.length) {
      dizer(`nenhum dos ${relatorio.length} eixos mudou.`);
    } else {
      dizer(`${tocados.length} de ${relatorio.length} eixos mudaram: ${tocados.map((r) => r.eixo).join(', ')}`);
      if (comArquivoNovo.length) {
        dizer(
          `ARQUIVO NOVO em: ${comArquivoNovo.map((r) => r.eixo).join(', ')}\n` +
            'É o gatilho da camada adversarial — a mudança respingou onde ninguém olhou.'
        );
      }
    }
  }

  // Sai 1 só quando entrou arquivo novo num eixo. Arquivo que sumiu ou contagem que
  // mudou é informação, não alarme: quase sempre é a própria correção sendo feita.
  const deveBarrar = comArquivoNovo.length > 0 || problemas.length > 0;
  process.exit(deveBarrar && !semPortao ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
