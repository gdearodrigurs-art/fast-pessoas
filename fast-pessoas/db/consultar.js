// db/consultar.js — roda um SQL e mostra o resultado.
//
// Existe para matar o `node -e "const {Pool}=require('pg')…"` que cada agente reescrevia
// para espiar o banco. Foi feito dezenas de vezes, e cada versão errava numa coisa
// diferente: uma imprimia nulo como célula vazia, outra mostrava as primeiras linhas sem
// dizer que havia mais, nenhuma cronometrava. As três omissões já custaram tempo aqui.
//
// Uso:
//   node --env-file=.env.local-db db/consultar.js "SELECT count(*) FROM rh.colaborador" --banco fast_pessoas_dev
const fs = require('fs');
const path = require('path');
const {
  lerArgumentos,
  resolverConexao,
  exigirLocalOuPermissao,
  abrir,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const AJUDA = `
db/consultar.js — roda um SQL e mostra o resultado em tabela.

  node --env-file=<ambiente> db/consultar.js "<SQL>" --banco <nome> [bandeiras]
  node --env-file=<ambiente> db/consultar.js --arquivo <caminho.sql> --banco <nome>

Bandeiras:
  --banco <nome>       obrigatório, sem padrão — a ferramenta nunca escolhe banco
  --arquivo <caminho>  lê o SQL de um arquivo em vez do argumento solto
  --json               imprime só o JSON das linhas; resumo e avisos vão para o erro padrão
  --limite <n>         linhas impressas (padrão 100; 0 = todas). Sempre diz quantas ficaram de fora
  --largura <n>        corte da célula em caracteres (padrão 60). Sempre diz quantos cortou
  --permitir-remoto    deixa consultar banco que não é local (o Supabase é base de apresentação)

Exemplos reais:
  node --env-file=.env.local-db db/consultar.js "SELECT count(*) FROM rh.colaborador" --banco fast_pessoas_dev
  node --env-file=.env.local-db db/consultar.js "SELECT * FROM rh.pessoa LIMIT 5" --banco fast_pessoas_dev --json
  node --env-file=.env.local-db db/consultar.js --arquivo consulta.sql --banco fast_pessoas_dev --limite 0
  node --env-file=.env db/consultar.js "SELECT arquivo FROM public.migracao_aplicada" --banco postgres --permitir-remoto

Nulo aparece escrito "null". A diferença entre nulo e string vazia já custou tempo neste projeto.
O SQL vem antes das bandeiras: "SELECT 1" --json, nunca --json "SELECT 1".
`;

const LIMITE_PADRAO = 100;
const LARGURA_PADRAO = 60;

// OIDs de tipo numérico do PostgreSQL. Servem só para alinhar a coluna à direita:
// dinheiro em centavos vem como int8 (texto, para não perder precisão), e coluna de
// número alinhada à esquerda esconde a ordem de grandeza, que é o que se lê primeiro.
const NUMERICOS = new Set([20, 21, 23, 26, 700, 701, 1700]);

/** Uma célula: nulo é a palavra "null", e nada de quebra de linha estourando a tabela. */
function formatarValor(valor) {
  if (valor === null || valor === undefined) return 'null';
  if (valor instanceof Date) return valor.toISOString();
  if (Buffer.isBuffer(valor)) return `\\x${valor.toString('hex')}`;
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  return texto.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

/** Corta a célula longa, mas diz o tamanho do que foi cortado — truncar calado é mentir. */
function truncar(texto, largura) {
  if (texto.length <= largura) return texto;
  return `${texto.slice(0, largura)}…(+${texto.length - largura})`;
}

function numero(n) {
  return n.toLocaleString('pt-BR');
}

function formatarTempo(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
}

/**
 * Imprime um resultado. Devolve quantas linhas apareceram e quantas existiam.
 * Comando sem coluna (INSERT/UPDATE/DDL) não tem tabela: tem linha afetada.
 */
function imprimirResultado(resultado, limite, largura) {
  const campos = resultado.fields || [];
  if (!campos.length) {
    const afetadas = resultado.rowCount;
    console.log(
      afetadas === null || afetadas === undefined
        ? `${resultado.command || 'comando'}: ok, sem linha afetada`
        : `${resultado.command}: ${numero(afetadas)} linha(s) afetada(s)`
    );
    return { mostradas: 0, total: afetadas || 0 };
  }

  const total = resultado.rows.length;
  const visiveis = limite === 0 ? resultado.rows : resultado.rows.slice(0, limite);
  const cabecalho = campos.map((c) => c.name);
  const corpo = visiveis.map((linha) =>
    cabecalho.map((nome) => truncar(formatarValor(linha[nome]), largura))
  );

  const larguras = cabecalho.map((nome, i) =>
    corpo.reduce((maior, linha) => Math.max(maior, linha[i].length), nome.length)
  );
  const direita = campos.map((c) => NUMERICOS.has(c.dataTypeID));
  const encaixar = (texto, i) =>
    direita[i] ? texto.padStart(larguras[i]) : texto.padEnd(larguras[i]);

  console.log(cabecalho.map(encaixar).join('  ').trimEnd());
  console.log(larguras.map((l) => '-'.repeat(l)).join('  '));
  for (const linha of corpo) console.log(linha.map(encaixar).join('  ').trimEnd());

  return { mostradas: visiveis.length, total };
}

async function main() {
  const { livres, bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  const comoJson = bandeiras.json === true;
  // Em modo JSON o que sai no stdout é só o JSON — resumo e avisos vão para o erro
  // padrão, senão quem encana a saída em outro comando recebe lixo no meio dos dados.
  const avisar = comoJson ? (...a) => console.error(...a) : (...a) => console.log(...a);

  const limite = Number(bandeiras.limite === undefined ? LIMITE_PADRAO : bandeiras.limite);
  if (!Number.isInteger(limite) || limite < 0) {
    throw new Error('--limite <n> tem que ser inteiro (0 = sem limite).');
  }
  const largura = Number(bandeiras.largura === undefined ? LARGURA_PADRAO : bandeiras.largura);
  if (!Number.isInteger(largura) || largura < 1) {
    throw new Error('--largura <n> tem que ser inteiro maior que zero.');
  }

  const arquivo = bandeiras.arquivo;
  if (arquivo && livres.length) {
    throw new Error('Escolha um: o SQL no argumento OU --arquivo <caminho>, nunca os dois.');
  }
  let sql;
  if (arquivo) {
    if (arquivo === true) throw new Error('--arquivo precisa do caminho: --arquivo consulta.sql');
    const caminho = path.resolve(arquivo);
    if (!fs.existsSync(caminho)) throw new Error(`Arquivo não encontrado: ${caminho}`);
    sql = fs.readFileSync(caminho, 'utf8');
  } else {
    sql = livres[0];
  }
  if (!sql || !sql.trim()) {
    throw new Error(
      'Falta o SQL.\n' +
        '  node --env-file=.env.local-db db/consultar.js "SELECT 1" --banco fast_pessoas_dev\n' +
        '  O SQL vem ANTES das bandeiras — depois de --json ele seria lido como valor da bandeira.'
    );
  }

  const conexao = resolverConexao(bandeiras);
  exigirLocalOuPermissao(
    conexao,
    bandeiras,
    'Consultar o remoto é legítimo às vezes, mas tem que ser de propósito.'
  );

  // Conexão e consulta são cronometradas separadas de propósito: numa apuração daqui
  // 99,6% dos 340 s era espera de banco, e um número só não diria onde o tempo foi.
  const t0 = process.hrtime.bigint();
  const cliente = await abrir(conexao);
  const t1 = process.hrtime.bigint();
  let resultados;
  try {
    const bruto = await cliente.query(sql);
    // Vários comandos numa tacada devolvem um array de resultados.
    resultados = Array.isArray(bruto) ? bruto : [bruto];
  } catch (erro) {
    const posicao = erro.position ? ` (posição ${erro.position})` : '';
    const detalhe = erro.detail ? `\n  ${erro.detail}` : '';
    const dica = erro.hint ? `\n  dica: ${erro.hint}` : '';
    throw new Error(`SQL recusado pelo banco: ${erro.message}${posicao}${detalhe}${dica}`);
  } finally {
    await cliente.end();
  }
  const t2 = process.hrtime.bigint();
  const msConexao = Number(t1 - t0) / 1e6;
  const msConsulta = Number(t2 - t1) / 1e6;

  let mostradas = 0;
  let total = 0;
  if (comoJson) {
    const cortar = (r) => (limite === 0 ? r.rows || [] : (r.rows || []).slice(0, limite));
    const linhas = resultados.map(cortar);
    for (const r of resultados) {
      total += (r.rows || []).length;
    }
    for (const l of linhas) mostradas += l.length;
    console.log(JSON.stringify(resultados.length === 1 ? linhas[0] : linhas, null, 2));
  } else {
    resultados.forEach((r, i) => {
      if (resultados.length > 1) console.log(`${i ? '\n' : ''}-- resultado ${i + 1} de ${resultados.length}`);
      const conta = imprimirResultado(r, limite, largura);
      mostradas += conta.mostradas;
      total += conta.total;
    });
  }

  const fora = total - mostradas;
  const quantas =
    fora > 0
      ? `${numero(mostradas)} de ${numero(total)} linhas — ${numero(fora)} fora, use --limite ${total}`
      : `${numero(total)} linha(s)`;
  avisar(
    `\n${quantas} · consulta ${formatarTempo(msConsulta)} · conexão ${formatarTempo(msConexao)} · ` +
      `${conexao.banco}@${conexao.host}`
  );
}

main().catch(morrer);
