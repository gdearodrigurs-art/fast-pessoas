// db/migracoes.js — o disco contra o banco, e o número novo alocado por quem sabe contar.
//
// Existe por duas dores medidas na mesma sessão: TRÊS colisões de número de migration, e
// a conferência disco × banco feita a mão toda vez. O estado de hoje é a prova de que
// conta de cabeça não serve — o disco tem dois arquivos com prefixo 0049, não tem 0025
// nem 0041, e uma mensagem de commit chegou a afirmar 53 arquivos quando são 52.
//
// Uso:
//   node --env-file=.env.local-db db/migracoes.js conferir --banco fast_pessoas_dev
//   node --env-file=.env db/migracoes.js conferir --banco postgres --permitir-remoto
//   node db/migracoes.js nova transferencia_pede_o_lider
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  lerArgumentos,
  resolverConexao,
  exigirLocalOuPermissao,
  comBanco,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const DIR = path.join(__dirname, 'migrations');
const PADRAO = /^(\d{4})_([a-z0-9_]+)\.sql$/;

const AJUDA = `
db/migracoes.js — confere o disco contra o banco e aloca número novo de migration.

  conferir --banco <nome>      o que está em db/migrations × o que public.migracao_aplicada diz
  nova <nome_em_snake_case>    acha o maior prefixo, aloca o próximo e cria o arquivo

Exemplos reais:
  node --env-file=.env.local-db db/migracoes.js conferir --banco fast_pessoas_dev
  node --env-file=.env db/migracoes.js conferir --banco postgres --permitir-remoto
  node db/migracoes.js nova transferencia_pede_o_lider

O "nova" não fala com banco nenhum, então não pede --env-file nem --banco.

O "conferir" sai 1 quando a divergência atrapalha migrar: arquivo alterado depois de
aplicado, ou aplicado que sumiu do disco. Buraco na sequência e colisão de prefixo saem
como AVISO — os que existem hoje são história, e ferramenta que nasce reprovando o
repositório de hoje é ferramenta que ninguém roda.
`;

/**
 * O hash é calculado do mesmo jeito que em db/migrar.js: fim de linha normalizado ANTES
 * do sha256. Lá o comentário explica por quê — checkout no Windows trocava LF por CRLF e
 * mudava o hash de 18 migrations sem trocar um caractere de SQL. Aqui a razão é outra e
 * some se alguém mexer: se esta conta divergir da de lá, a ferramenta acusa diferença que
 * o runner não vê, e portão que mente é portão desligado.
 */
function hashDoArquivo(nome) {
  const sql = fs.readFileSync(path.join(DIR, nome), 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(sql).digest('hex');
}

/** Tudo que o disco tem, na mesma ordem em que o db/migrar.js aplicaria. */
function lerDisco() {
  const nomes = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const arquivos = [];
  const foraDoPadrao = [];
  for (const nome of nomes) {
    const m = nome.match(PADRAO);
    if (!m) { foraDoPadrao.push(nome); continue; }
    arquivos.push({ nome, prefixo: m[1], numero: Number(m[1]), assunto: m[2] });
  }
  return { arquivos, foraDoPadrao };
}

function proximoNumero(arquivos) {
  // O maior prefixo, não a quantidade de arquivos: com dois 0049 e sem 0025 nem 0041,
  // contar arquivo devolveria um número já usado.
  const maior = arquivos.reduce((m, a) => Math.max(m, a.numero), 0);
  return maior + 1;
}

const comoPrefixo = (n) => String(n).padStart(4, '0');

// --------------------------------------------------------------------- conferir

async function conferir(bandeiras) {
  const conexao = resolverConexao(bandeiras);
  // Conferir só lê. A trava não é contra estrago: é contra conferir o banco errado e sair
  // dizendo "está tudo em dia" sobre a base de apresentação.
  exigirLocalOuPermissao(conexao, bandeiras, 'Conferir migrations do remoto é ato de fechamento.');

  const { arquivos, foraDoPadrao } = lerDisco();

  const aplicadas = await comBanco(conexao, async (cliente) => {
    const t = await cliente.query("SELECT to_regclass('public.migracao_aplicada') AS tabela");
    // Bancada recém-criada não tem a tabela, e isso não é defeito: é banco virgem.
    if (!t.rows[0].tabela) return null;
    const { rows } = await cliente.query('SELECT arquivo, hash_sha256 FROM public.migracao_aplicada');
    return new Map(rows.map((r) => [r.arquivo, r.hash_sha256]));
  });

  const noBanco = aplicadas || new Map();
  const erros = [];
  const avisos = [];
  const pendentes = [];

  for (const a of arquivos) {
    if (!noBanco.has(a.nome)) { pendentes.push(a.nome); continue; }
    const disco = hashDoArquivo(a.nome);
    if (noBanco.get(a.nome) !== disco) {
      erros.push(
        `${a.nome} — conteúdo mudou depois de aplicado.\n` +
          `         aplicado ${noBanco.get(a.nome).slice(0, 12)}… · disco ${disco.slice(0, 12)}…\n` +
          '         Migration aplicada é imutável: a correção é uma migration NOVA. ' +
          'O db/migrar.js aborta aqui.'
      );
    }
  }

  const noDisco = new Set(arquivos.map((a) => a.nome));
  for (const nome of [...noBanco.keys()].sort()) {
    if (noDisco.has(nome)) continue;
    // O db/migrar.js não trava nisso — ele só percorre o disco. É justamente por isso que
    // alguém precisa travar: o schema aplicado deixou de ter fonte no repositório, e
    // recriar o banco do zero não devolve o mesmo banco.
    erros.push(`${nome} — está aplicada e sumiu do disco. O banco não pode ser recriado do repositório.`);
  }

  const porPrefixo = new Map();
  for (const a of arquivos) {
    if (!porPrefixo.has(a.prefixo)) porPrefixo.set(a.prefixo, []);
    porPrefixo.get(a.prefixo).push(a.nome);
  }
  for (const [prefixo, nomes] of porPrefixo) {
    if (nomes.length > 1) avisos.push(`colisão de prefixo ${prefixo}:\n         ${nomes.join('\n         ')}`);
  }

  if (arquivos.length) {
    const usados = new Set(arquivos.map((a) => a.numero));
    const maior = Math.max(...usados);
    const buracos = [];
    for (let n = 1; n <= maior; n++) if (!usados.has(n)) buracos.push(comoPrefixo(n));
    if (buracos.length) avisos.push(`buraco na sequência: ${buracos.join(', ')}`);
  }

  if (foraDoPadrao.length) {
    avisos.push(`fora do padrão NNNN_nome.sql: ${foraDoPadrao.join(', ')} — o migrar aplica assim mesmo`);
  }

  // Pendente com número MENOR que uma já aplicada vai rodar fora de ordem: o migrar
  // ordena por nome, então ela entra depois de tudo que já passou. Quem escreveu contava
  // com a ordem do número.
  const maiorAplicado = [...noBanco.keys()]
    .map((n) => (n.match(PADRAO) ? Number(n.match(PADRAO)[1]) : 0))
    .reduce((m, n) => Math.max(m, n), 0);
  const foraDeOrdem = pendentes.filter((n) => Number(n.slice(0, 4)) < maiorAplicado);
  if (foraDeOrdem.length) {
    avisos.push(`vai rodar fora de ordem (número menor que a última aplicada, ${comoPrefixo(maiorAplicado)}): ${foraDeOrdem.join(', ')}`);
  }

  console.log(`banco ${conexao.banco} em ${conexao.host}:${conexao.porta}`);
  if (aplicadas === null) console.log('public.migracao_aplicada não existe — nada foi aplicado neste banco.');
  console.log(`disco ${arquivos.length} · aplicadas ${noBanco.size} · pendentes ${pendentes.length}`);

  if (pendentes.length) {
    console.log('\nno disco e não aplicada:');
    for (const n of pendentes) console.log(`  ${n}`);
  }
  for (const a of avisos) console.log(`\nAVISO  ${a}`);
  for (const e of erros) console.log(`\nERRO   ${e}`);

  console.log(erros.length ? `\n${erros.length} divergência(s) atrapalham migrar.` : '\nnada impede migrar.');
  return erros.length ? 1 : 0;
}

// ------------------------------------------------------------------------- nova

function cabecalhoModelo(prefixo, nome) {
  // O formato é o da 0048: por que existe antes do que muda, e o defeito com número ou
  // com a palavra de quem pediu. Cabeçalho que diz "adiciona coluna X" não sobrevive à
  // próxima onda, porque a coluna qualquer um lê no SQL — o motivo não.
  return `-- ${prefixo}_${nome}.sql — <uma linha: o que o sistema passa a fazer>
--
-- POR QUE ESTA MIGRATION EXISTE
-- O defeito, com número medido ou com a palavra de quem pediu. Não "faltava a
-- coluna X": o que quebrou, para quem, e desde quando. Veja a 0048 e a 0053.
--
-- O QUE MUDA
-- Tabela por tabela: o que passa a existir, o que passa a ser proibido, e o que
-- acontece com a linha que já está gravada.
--
-- MIGRATION APLICADA É IMUTÁVEL. Depois que este arquivo rodar em qualquer banco,
-- corrigir é escrever OUTRA migration: o db/migrar.js compara o hash do conteúdo e
-- aborta, e ele está certo em abortar.

BEGIN;

-- escreva o SQL aqui

COMMIT;
`;
}

function nova(livres) {
  const nome = livres[1];
  if (!nome) {
    throw new Error(
      'Falta o nome.\n' +
        '  Exemplo: node db/migracoes.js nova transferencia_pede_o_lider'
    );
  }
  if (!/^[a-z0-9_]+$/.test(nome)) {
    throw new Error(
      `Nome inválido: "${nome}". Só minúscula, número e sublinhado — o nome vira ` +
        'arquivo e chave primária em public.migracao_aplicada.'
    );
  }

  const { arquivos } = lerDisco();
  const prefixo = comoPrefixo(proximoNumero(arquivos));
  const caminho = path.join(DIR, `${prefixo}_${nome}.sql`);

  const jaTem = arquivos.filter((a) => a.prefixo === prefixo);
  if (jaTem.length) {
    throw new Error(`Já existe arquivo com o prefixo ${prefixo}: ${jaTem.map((a) => a.nome).join(', ')}`);
  }

  // Rodar `nova` duas vezes com o mesmo nome dá dois arquivos com números diferentes e
  // assunto idêntico — aconteceu na primeira vez que esta ferramenta rodou de verdade.
  // Não é colisão de número, é pior: as duas passam no conferir e ninguém sabe qual vale.
  const mesmoAssunto = arquivos.filter((a) => a.assunto === nome);
  if (mesmoAssunto.length) {
    throw new Error(
      `Já existe migration com este nome: ${mesmoAssunto.map((a) => a.nome).join(', ')}\n` +
        '  Se é outro assunto, dê outro nome. Se é o mesmo, ele já foi alocado.'
    );
  }

  // 'wx' falha se o arquivo já existir. Dois agentes rodando `nova` ao mesmo tempo leem o
  // mesmo maior prefixo e pedem o mesmo número — foi assim que as três colisões nasceram.
  // Aqui o segundo recebe erro em vez de sobrescrever o trabalho do primeiro.
  fs.writeFileSync(caminho, cabecalhoModelo(prefixo, nome), { flag: 'wx' });
  console.log(path.relative(path.join(__dirname, '..'), caminho).replace(/\\/g, '/'));
  return 0;
}

// ------------------------------------------------------------------------- main

async function main() {
  const { livres, bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  const subcomando = livres[0];
  if (subcomando === 'conferir') return conferir(bandeiras);
  if (subcomando === 'nova') return nova(livres);

  throw new Error(
    (subcomando ? `Subcomando desconhecido: "${subcomando}".` : 'Falta o subcomando.') +
      '\n  conferir --banco <nome>    · nova <nome_em_snake_case>\n' +
      '  Veja os exemplos com: node db/migracoes.js --help'
  );
}

main()
  .then((codigo) => process.exit(codigo))
  .catch(morrer);
