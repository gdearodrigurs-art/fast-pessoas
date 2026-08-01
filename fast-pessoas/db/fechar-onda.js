// db/fechar-onda.js — o ato de fechamento da onda.
//
// Ele existe porque "o fechamento" carregava cinco obrigações vindas de quatro pontos do arnês e
// NÃO ERA ator, nem ato, nem comando. Ninguém dizia quem declara a onda encerrada. E o merge para a
// `main` não aparecia em nenhum dos sete pontos — desenhamos branch por onda e nunca escrevemos o
// caminho de volta. Foi por isso que a onda I ficou parada numa branch.
//
// SÃO DOIS COMANDOS, e a divisão não é estilo: é a ordem rígida em volta do merge.
//
//   node db/fechar-onda.js verificar    tudo que precede o merge
//   <o merge, que é decisão de gente>
//   node db/fechar-onda.js concluir     tudo que só vale depois dele
//
// Por que o retrato do mapa fica em "concluir": ele tem que descrever o estado que DE FATO entrou na
// `main`, não um que ainda podia mudar no merge. E por que a verificação fica em "verificar": o que
// foi verificado na branch não é necessariamente o que entrou — se houver conflito no merge, volta
// para o começo.
//
// Este é o único contexto que declara ARNES_FECHAMENTO=1, a sentinela que destrava o retrato do mapa
// e a escrita no Supabase. Não é segredo: é declaração de intenção. Quem contorna escolheu contornar.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const REPO = path.join(RAIZ, '..');
const ONDA_ATUAL = path.join(REPO, 'docs', 'onda-atual.md');

const AJUDA = `
db/fechar-onda.js — o ato de fechamento da onda.

  node db/fechar-onda.js verificar   [--pular-build]
  node db/fechar-onda.js concluir    [--bancadas <a,b>]

VERIFICAR (antes do merge)
  1. npm test
  2. npm run lint
  3. npx tsc --noEmit
  4. npm run build
  5. migrations no banco local
  6. migrations no Supabase          (só aqui, e só por este comando)
  7. baterias: arquivo x banco batem
  8. node db/mapa.js                 — se acusar eixo tocado, PARA: o adversarial vem antes do merge

CONCLUIR (depois do merge)
  9. node db/mapa.js retrato         — último, nunca antes de julgar
 10. bancada.js orfaos               — aponta o que sobrou
 11. apaga docs/onda-atual.md
 12. resumo

O QUE ELE NÃO FAZ, de propósito: o merge. É decisão de gente, e o dono dá o de-acordo antes.
`;

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('--ajuda')) {
  console.log(AJUDA.trim());
  process.exit(0);
}

const modo = args[0];
const bandeira = (n) => args.includes(n);
const valorDe = (n) => {
  const i = args.indexOf(n);
  return i !== -1 ? args[i + 1] : null;
};

const ambiente = { ...process.env, ARNES_FECHAMENTO: '1' };
const passos = [];

function passo(numero, titulo, comando, opcoes = {}) {
  const t0 = Date.now();
  process.stdout.write(`${String(numero).padStart(2)}. ${titulo} ... `);
  try {
    const saida = execSync(comando, {
      cwd: opcoes.cwd || RAIZ,
      env: ambiente,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`ok  ${s}s`);
    passos.push({ numero, titulo, ok: true, saida });
    return { ok: true, saida };
  } catch (e) {
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`FALHOU  ${s}s`);
    const saida = String(e.stdout || '') + String(e.stderr || '');
    passos.push({ numero, titulo, ok: false, saida });
    if (opcoes.tolera) return { ok: false, saida };
    console.log('\n' + saida.trim().split('\n').slice(-25).join('\n'));
    console.log(
      `\nO fechamento PAROU no passo ${numero}. Conserte e rode de novo — ` +
        'o fechamento é idempotente, os passos anteriores rodam outra vez sem estrago.'
    );
    process.exit(1);
  }
}

function pular(numero, titulo, motivo) {
  console.log(`${String(numero).padStart(2)}. ${titulo} ... pulado (${motivo})`);
  passos.push({ numero, titulo, pulado: motivo });
}

// ---------------------------------------------------------------------------
function verificar() {
  console.log('FECHAMENTO — verificação (tudo que precede o merge)\n');

  passo(1, 'npm test', 'npm test');
  passo(2, 'npm run lint', 'npm run lint');
  passo(3, 'tsc --noEmit', 'npx tsc --noEmit');

  if (bandeira('--pular-build')) pular(4, 'npm run build', '--pular-build');
  else passo(4, 'npm run build', 'npm run build');

  passo(5, 'migrations no local', 'node --env-file=.env.local-db db/migrar.js');

  // O ÚNICO ponto do projeto que escreve no Supabase. A regra de ouro barra todo o resto; aqui a
  // sentinela do ambiente destrava, e é por isso que este comando precisa existir como ato próprio.
  passo(6, 'migrations no Supabase', 'node --env-file=.env db/migrar.js');

  const bat = passo(7, 'baterias: arquivo x banco',
    'node --env-file=.env.local-db db/exportar-baterias.js --conferir --banco fast_pessoas_dev',
    { tolera: true });
  if (!bat.ok) {
    console.log(
      '\n   A bateria do banco e a do arquivo DIVERGIRAM. Isso quer dizer que alguém acrescentou\n' +
        '   caso pela tela e ele está fora do portão. Rode o exportador sem --conferir, confira o\n' +
        '   diff e commite o JSON.\n'
    );
    process.exit(1);
  }

  const mapa = passo(8, 'mapa de eixos', 'node db/mapa.js', { tolera: true });
  console.log('');
  if (!mapa.ok) {
    console.log(mapa.saida.trim());
    console.log(
      '\n>> O MAPA ACUSOU EIXO TOCADO. Isto NÃO é erro: é o gatilho da camada adversarial.\n' +
        '   A ordem é rígida — conferir, JULGAR, e só então retratar.\n' +
        '   Julgue cada arquivo novo antes de mesclar. Retratar agora apagaria a evidência que o\n' +
        '   adversarial consome.\n'
    );
    process.exit(1);
  }

  console.log('VERIFICAÇÃO VERDE. Nenhum eixo tocado, nenhum adversarial necessário.\n');
  console.log('Próximo passo, e ele é seu: o merge para a main, com o de-acordo do dono.');
  console.log('Depois dele:  node db/fechar-onda.js concluir');
}

// ---------------------------------------------------------------------------
function concluir() {
  console.log('FECHAMENTO — conclusão (só depois do merge)\n');

  const ramo = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  if (ramo !== 'main') {
    console.error(
      `Você está em "${ramo}", não em main.\n` +
        '  A conclusão retrata o mapa, e o retrato tem que descrever o que DE FATO entrou na main.\n' +
        '  Faça o merge primeiro.'
    );
    process.exit(1);
  }

  passo(9, 'retrato do mapa', 'node db/mapa.js retrato');
  passo(10, 'bancadas órfãs',
    'node --env-file=.env.local-db db/bancada.js orfaos --banco postgres', { tolera: true });

  const bancadas = valorDe('--bancadas');
  if (bancadas) {
    for (const nome of bancadas.split(',').map((s) => s.trim()).filter(Boolean)) {
      passo(10, `destruir bancada ${nome}`,
        `node --env-file=.env.local-db db/bancada.js destruir ${nome} --sim --banco postgres`,
        { tolera: true });
    }
  }

  if (fs.existsSync(ONDA_ATUAL)) {
    fs.unlinkSync(ONDA_ATUAL);
    console.log('11. docs/onda-atual.md ... apagado');
  } else {
    pular(11, 'docs/onda-atual.md', 'não existe');
  }

  console.log('\nONDA FECHADA.');
  console.log('  O retrato do mapa agora descreve o estado da main.');
  console.log('  Falta o relatório ao dono — no formato do ponto 6: portão, achados, eixos tocados,');
  console.log('  e o que ficou travado esperando por ele.');
}

// ---------------------------------------------------------------------------
if (modo === 'verificar') verificar();
else if (modo === 'concluir') concluir();
else {
  console.error(`Modo desconhecido: "${modo}". Use verificar ou concluir. (--help mostra tudo.)`);
  process.exit(1);
}
