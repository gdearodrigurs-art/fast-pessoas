// db/provas-totp.js — prova do CONSUMO ATÔMICO do passo TOTP (pendência #11).
//
// A outra metade (o cálculo do passo a partir do código) é provada, pura e sem
// banco, em tests/totp.test.ts. Esta prova exercita o portão que só o banco
// pode garantir: o UPDATE condicional que só grava passo MAIOR — o mesmo SQL,
// verbatim, de identidade/repositorio.consumirPassoTotp.
//
// Não persiste nada: roda dentro de BEGIN/ROLLBACK, então é re-executável e não
// toca no dado de demonstração.
//
//   node --env-file=.env.local-db db/provas-totp.js --banco fast_pessoas_dev
const {
  lerArgumentos,
  resolverConexao,
  exigirLocal,
  abrir,
  ajudaSePedida,
  morrer,
} = require('./lib/banco');

const AJUDA = `
db/provas-totp.js — prova o consumo atômico do passo TOTP (anti-replay).

  node --env-file=.env.local-db db/provas-totp.js --banco fast_pessoas_dev

Roda em transação e dá ROLLBACK: não altera nada. Sai 0 se a prova passa.
`;

// Verbatim de identidade/repositorio.consumirPassoTotp: só grava se o passo for
// maior que o último (ou se ainda for nulo). rowCount 1 = consumido.
const SQL_CONSUMIR = `
  UPDATE sistema.usuario
     SET totp_ultimo_passo = $2
   WHERE id = $1
     AND (totp_ultimo_passo IS NULL OR totp_ultimo_passo < $2)`;

async function main() {
  const { bandeiras } = lerArgumentos(process.argv.slice(2));
  ajudaSePedida(bandeiras, AJUDA);

  const conexao = resolverConexao(bandeiras);
  exigirLocal(conexao, 'Prova de segurança roda só no banco local de desenvolvimento.');

  const cliente = await abrir(conexao);
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT id, nome FROM sistema.usuario ORDER BY id LIMIT 1');
    if (rows.length === 0) throw new Error('Sem usuário para testar — rode "npm run db:demo".');
    const { id, nome } = rows[0];

    const consumir = async (passo) => {
      const r = await cliente.query(SQL_CONSUMIR, [id, passo]);
      return r.rowCount === 1;
    };

    // Começa do zero para a prova ser determinística.
    await cliente.query('UPDATE sistema.usuario SET totp_ultimo_passo = NULL WHERE id = $1', [id]);

    const fresco = await consumir(100); // 1ª vez: aceita
    const replay = await consumir(100); // MESMO código (mesmo passo): recusa
    const proximo = await consumir(101); // código fresco (passo maior): aceita
    const antigo = await consumir(100); // código antigo (passo menor): recusa

    await cliente.query('ROLLBACK'); // não persiste nada

    const linha = (rotulo, aceito, esperado) =>
      `  ${rotulo.padEnd(34)} ${aceito ? 'ACEITO ' : 'recusado'}  ${aceito === esperado ? 'ok' : 'FALHOU'}`;
    console.log(`Usuário de teste: ${nome} (id ${id}) — transação revertida, nada persistido.\n`);
    console.log(linha('passo 100 (código fresco)', fresco, true));
    console.log(linha('passo 100 (replay do mesmo)', replay, false));
    console.log(linha('passo 101 (código seguinte)', proximo, true));
    console.log(linha('passo 100 (código já passado)', antigo, false));

    const ok = fresco === true && replay === false && proximo === true && antigo === false;
    console.log(
      '\n' +
        (ok
          ? 'PROVA OK: passo consumido não volta; só passo MAIOR entra — código de uso único.'
          : 'PROVA FALHOU: o consumo não barrou o replay.')
    );
    process.exitCode = ok ? 0 : 1;
  } finally {
    await cliente.end();
  }
}

main().catch(morrer);
