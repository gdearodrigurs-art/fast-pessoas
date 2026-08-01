#!/usr/bin/env node
// .claude/hooks/guarda-arquivo.js — regras de ouro que valem para Edit e Write.
//
// Este hook é MAIS FORTE que o de Bash, e vale entender por quê: Edit e Write são chamadas de
// ferramenta, então o PreToolUse as vê de verdade. Não há alias que contorne — não existe
// "outra grafia" para editar um arquivo pela ferramenta de edição.
//
// O que ele NÃO alcança continua sendo escrita feita por subprocesso (um `node script.js` que
// grava com fs.writeFileSync). Para essas, a trava mora dentro do próprio script.

const { execFileSync } = require('child_process');
const path = require('path');

const RAIZ = 'C:\\sistema RH';
const SENTINELA = 'ARNES_FECHAMENTO=1';

function relativo(caminho) {
  try {
    return path.relative(RAIZ, caminho).replace(/\\/g, '/');
  } catch {
    return String(caminho).replace(/\\/g, '/');
  }
}

/** Arquivo já versionado = já foi escrito e commitado uma vez. */
function estaNoGit(caminho) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', caminho], {
      cwd: RAIZ,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const REGRAS = [
  {
    nome: 'migration ja escrita',
    casa: (rel, caminho) => /^fast-pessoas\/db\/migrations\/.+\.sql$/.test(rel) && estaNoGit(caminho),
    porque:
      'Migration aplicada é imutável POR DESENHO: o db/migrar.js guarda o SHA-256 de cada arquivo e ' +
      'recusa rodar se o conteúdo mudar — inclusive comentário, porque o hash é do arquivo inteiro. ' +
      'Editar uma migration já versionada trava o runner para todo mundo, não só para você.',
    faca:
      'Mudança de schema é migration NOVA: node db/migracoes.js nova <nome>. ' +
      'Se a migration antiga descreve uma regra que foi revertida depois, a retificação vai no log ' +
      'de decisões (00_contexto/decisoes_arquiteturais.md) e no cabeçalho da migration NOVA — o ' +
      'único lado que ainda pode ser escrito.',
  },
  {
    nome: 'retrato do mapa',
    casa: (rel) => /^fast-pessoas\/db\/mapa-baseline\.json$/.test(rel),
    porque:
      'É a linha de base contra a qual a mudança desta onda seria detectada. Editá-la à mão apaga ' +
      'o gatilho da camada adversarial sem que ninguém tenha julgado nada.',
    faca: 'Rode `node db/mapa.js` para conferir. O retrato é o último passo do fechamento da onda.',
  },
  {
    nome: 'numeros de referencia',
    casa: (rel) => /^docs\/snapshots\//.test(rel),
    porque:
      'Snapshot é o antes-e-depois em números. Regravado à mão, ele passa a concordar com qualquer ' +
      'coisa — e um portão que concorda com tudo não é portão.',
    faca: 'Use `node db/snapshot.js tirar <nome>`, e só no fechamento da onda.',
  },
  {
    nome: 'contrato de conexao',
    // SÓ PARA SUBAGENTE. O propósito da regra é impedir que agentes em paralelo disputem um
    // arquivo compartilhado — e quem consolida é o principal, que não tem com quem competir.
    // Aplicá-la ao principal barrava exatamente quem deveria aplicar a mudança pedida, e foi o
    // que aconteceu na primeira hora de uso: um agente reportou um defeito real no parser de
    // argumentos e o hook impediu o conserto. Regra que barra quem devia agir não é contenção,
    // é impasse.
    soSubagente: true,
    casa: (rel) => /^fast-pessoas\/db\/lib\/banco\.js$/.test(rel),
    porque:
      'É o contrato de conexão de TODAS as ferramentas do arnês. Ele existe porque cada verificador ' +
      'reimplementava conexão do seu jeito e cada um errava diferente. Mudança aqui atinge toda ' +
      'ferramenta, inclusive as que outros agentes possam estar escrevendo agora, em paralelo.',
    faca: 'Escreva o pedido de mudança no seu relatório final e resolva localmente. A alteração sobe.',
  },
];

let entrada = '';
process.stdin.on('data', (d) => (entrada += d));
process.stdin.on('end', () => {
  let dados;
  try {
    dados = JSON.parse(entrada || '{}');
  } catch {
    process.exit(0); // hook que quebra não trava o trabalho
  }

  const caminho = String(dados?.tool_input?.file_path || '');
  if (!caminho) process.exit(0);

  // O ato de fechamento se declara. Não é segredo: é intenção explícita.
  if (String(dados?.tool_input?.new_string || '').includes(SENTINELA)) process.exit(0);

  // agent_type só vem preenchido quando quem chamou é subagente. O laço principal não tem.
  const ehSubagente = Boolean(dados.agent_type);

  const rel = relativo(caminho);
  const regra = REGRAS.find((r) => (!r.soSubagente || ehSubagente) && r.casa(rel, caminho));
  if (!regra) process.exit(0);

  const quem = dados.agent_type ? ` (agente ${dados.agent_type})` : '';
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Regra de ouro do arnês — ${regra.nome}${quem}.\n` +
          `Arquivo: ${rel}\n\n` +
          `POR QUÊ: ${regra.porque}\n\n` +
          `EM VEZ DISSO: ${regra.faca}`,
      },
    })
  );
  process.exit(0);
});
