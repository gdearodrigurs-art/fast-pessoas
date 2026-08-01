#!/usr/bin/env node
// .claude/hooks/testar.js — prova que as regras de ouro barram o que devem e SÓ o que devem.
//
// Uso: node .claude/hooks/testar.js
//
// Existe porque hook que barra o que não devia é pior que hook nenhum: o dono desliga na
// primeira semana e aí não há regra alguma. Cada caso abaixo diz o comando e se ele DEVE ser
// barrado — a lista de "passa" vale tanto quanto a de "BARRA".
//
// Este arquivo já se pagou: ao rodá-lo pela primeira vez, `npm run db:migrar` aparecia como
// caso que passa, e ele é exatamente `node --env-file=.env db/migrar.js`, que escreve no
// Supabase. Eu tinha codificado o buraco dentro do próprio teste.
const { execFileSync } = require('child_process');
const path = require('path');

const AQUI = __dirname;
const RAIZ = path.resolve(AQUI, '..', '..');
const BASH = path.join(AQUI, 'guarda-bash.js');
const ARQUIVO = path.join(AQUI, 'guarda-arquivo.js');
const p = (...partes) => path.join(RAIZ, ...partes);

function barrou(hook, entrada) {
  const saida = execFileSync('node', [hook], { input: JSON.stringify(entrada), encoding: 'utf8' });
  if (!saida.trim()) return false;
  return JSON.parse(saida).hookSpecificOutput?.permissionDecision === 'deny';
}

const CASOS_BASH = [
  // --------------------------------------------------- trabalho normal: tem que passar
  ['git status', false],
  ['git log --oneline -5', false],
  ['git commit -m "mensagem"', false],
  ['git checkout -b onda-j', false],
  ['npx tsc --noEmit', false],
  ['npm run lint', false],
  ['npm run build', false],
  ['npm run mapa', false],
  ['node db/mapa.js', false],
  ['rm -f /tmp/lixo.txt', false],
  ['node --env-file=.env.local-db db/migrar.js', false],
  ['node --env-file=.env db/consultar.js "SELECT 1" --banco postgres', false],
  // --------------------------------------------------- histórico do git
  ['git reset --hard HEAD~1', true],
  ['git push --force origin main', true],
  ['git push -f', true],
  ['git clean -fd', true],
  ['git rebase -i HEAD~3', true],
  ['git branch -D onda-i', true],
  // --------------------------------------------------- prova e migration
  ['rm -rf fast-pessoas/provas/onda-i', true],
  ['rm db/migrations/0048_transferencia_entre_empresas.sql', true],
  // Migration recém-criada pelo `nova` e ainda não commitada: apagar é trabalho legítimo.
  // Foi este caso que prendeu um agente na primeira hora de uso do hook.
  ['rm db/migrations/0054_errei_o_nome.sql', false],
  ['rm db/migrations/*.sql', true],
  ['rm -rf db/migrations', true],
  // --------------------------------------------------- Supabase
  ['node --env-file=.env db/migrar.js', true],
  ['npm run db:migrar', true],
  ['npm run db:demo', true],
  // --------------------------------------------------- retrato e portão
  ['node db/mapa.js retrato', true],
  ['npm run mapa:retrato', true],
  ['node db/snapshot.js tirar antes-j --banco fast_pessoas_dev', true],
  ['node db/mapa.js --sem-portao', true],
  // --------------------------------------------------- o fechamento se declara
  ['ARNES_FECHAMENTO=1 node db/mapa.js retrato', false],
  ['ARNES_FECHAMENTO=1 npm run db:migrar', false],
];

// [caminho, barra para SUBAGENTE, barra para o PRINCIPAL]
const CASOS_ARQUIVO = [
  [p('fast-pessoas', 'db', 'migrations', '0048_transferencia_entre_empresas.sql'), true, true],
  [p('fast-pessoas', 'db', 'migrations', '0054_ainda_nao_commitada.sql'), false, false],
  [p('fast-pessoas', 'db', 'mapa-baseline.json'), true, true],
  [p('docs', 'snapshots', 'antes-j.json'), true, true],
  [p('fast-pessoas', 'src', 'dominios', 'folha', 'servico.ts'), false, false],
  [p('docs', '13-arnes-do-projeto.md'), false, false],
  [p('fast-pessoas', 'db', 'mapa.js'), false, false],
  // O contrato de conexão é o único caso que separa os dois: barra o subagente (que pode estar
  // competindo com outro pelo mesmo arquivo) e deixa passar o principal, que é quem consolida.
  [p('fast-pessoas', 'db', 'lib', 'banco.js'), true, false],
];

let erros = 0;
const linha = (ok, efeito, texto) => console.log(`${ok ? '  ok ' : ' ERRO'} ${efeito}  ${texto}`);

console.log('--- guarda-bash ---');
for (const [comando, deve] of CASOS_BASH) {
  const b = barrou(BASH, { tool_name: 'Bash', tool_input: { command: comando }, agent_type: 'teste' });
  if (b !== deve) erros++;
  linha(b === deve, b ? 'BARRA' : 'passa', comando.slice(0, 64));
}

console.log('\n--- guarda-arquivo (subagente) ---');
for (const [caminho, deve] of CASOS_ARQUIVO) {
  const b = barrou(ARQUIVO, {
    tool_name: 'Edit',
    tool_input: { file_path: caminho, new_string: 'x' },
    agent_type: 'general-purpose',
  });
  if (b !== deve) erros++;
  linha(b === deve, b ? 'BARRA' : 'passa', path.relative(RAIZ, caminho).replace(/\\/g, '/'));
}

console.log('\n--- guarda-arquivo (agente principal) ---');
for (const [caminho, , deve] of CASOS_ARQUIVO) {
  const b = barrou(ARQUIVO, { tool_name: 'Edit', tool_input: { file_path: caminho, new_string: 'x' } });
  if (b !== deve) erros++;
  linha(b === deve, b ? 'BARRA' : 'passa', path.relative(RAIZ, caminho).replace(/\\/g, '/'));
}

const total = CASOS_BASH.length + CASOS_ARQUIVO.length * 2;
console.log('\n' + (erros ? `${erros} de ${total} ERRADOS` : `${total} casos, todos certos`));
process.exit(erros ? 1 : 0);
